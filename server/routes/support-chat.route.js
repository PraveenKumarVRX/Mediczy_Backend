/**
 * Omnichannel Support Chat Routes
 * Handles patient chat from WhatsApp and In-App to the support agent workspace.
 *
 * The workspace is Chatwoot (https://chat.mediqzy.com). RocketChat was retired on 2026-10-04 --
 * it had already stopped working, so these endpoints were failing before this change. The provider
 * module keeps the old method names, so the handlers below are unchanged; what differs is that an
 * unconfigured or unimplemented capability now answers 503 SUPPORT_CHAT_NOT_CONFIGURED instead of
 * a generic 500, which tells the caller the difference between "broken" and "not set up yet".
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import omnichannelChatService, { SupportChatUnavailableError } from '../services/support-chat-provider.service.js';
import userModel from '../models/user.model.intelligent.js';
import sharedPool from '../db/pgPool.js';

// Middleware that requires a valid JWT AND a team/admin role.
// Applied to all /inbox/* routes (support agents only).
const authInbox = [
  authUser,
  (req, res, next) => {
    const role = req.userRole;
    if (role === 'team' || role === 'admin') return next();
    return res.status(403).json({ success: false, message: 'Support team access required' });
  }
];

const router = express.Router();

/**
 * Error responder: a missing/unimplemented support-chat capability is a 503 (the service is not
 * available), not a 500 (we crashed). Anything else keeps the previous 500 behaviour.
 */
function failure(res, error, fallbackMessage = 'Request failed') {
  if (error instanceof SupportChatUnavailableError) {
    return res.status(503).json({
      success: false,
      code: error.code,
      message: error.message,
      provider: 'chatwoot',
    });
  }
  return failure(res, error, fallbackMessage);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Report the support-chat provider configuration on server start
(async () => {
  try {
    await omnichannelChatService.initialize();
  } catch (error) {
    console.error('Failed to initialize omnichannel chat:', error);
  }
})();

// ============================================================================
// IN-APP CHAT ENDPOINTS (Patient Mobile/Web App)
// ============================================================================

/**
 * POST /api/support/chat/start
 * Start a new support conversation
 */
router.post('/chat/start', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, department } = req.body;

    // Get patient details
    const patient = await userModel.findByPk(userId);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Auto-detect department if not provided
    const targetDepartment = department || omnichannelChatService.detectDepartment(message || '');

    // Register visitor and create room
    const result = await omnichannelChatService.handleInAppMessage({
      patientId: userId,
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        uhid: patient.uhid,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender
      },
      message: message || 'Started new conversation',
      department: targetDepartment
    });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }

    return res.json({
      success: true,
      data: {
        roomId: result.roomId,
        visitorToken: result.visitorToken,
        isNewConversation: result.isNewConversation,
        department: targetDepartment
      }
    });
  } catch (error) {
    console.error('Start chat error:', error);
    return failure(res, error, 'Failed to start chat');
  }
});

/**
 * POST /api/support/chat/message
 * Send a message in existing conversation
 */
router.post('/chat/message', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId, visitorToken, message, attachments } = req.body;

    if (!roomId || !visitorToken || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'roomId, visitorToken, and message are required' 
      });
    }

    // Check if this might be a medical query - offer Dr. iSHA assistance
    const patient = await userModel.findByPk(userId);
    const drIshaCheck = await omnichannelChatService.forwardToDrIsha(message, {
      patientId: userId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      language: req.body.language || 'en'
    });

    // Send message to support
    const formattedMessage = `💬 *In-App*: ${message}`;
    const result = await omnichannelChatService.sendMessage(
      roomId,
      visitorToken,
      formattedMessage,
      attachments
    );

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }

    // Include Dr. iSHA suggestion if it's a medical query
    const response = {
      success: true,
      data: {
        messageId: result.message?._id,
        timestamp: new Date().toISOString()
      }
    };

    if (drIshaCheck.isMedicalQuery && drIshaCheck.response) {
      response.data.drIshaSuggestion = {
        available: true,
        message: drIshaCheck.response,
        hint: 'Dr. iSHA can help with medical questions instantly!'
      };
    }

    return res.json(response);
  } catch (error) {
    console.error('Send message error:', error);
    return failure(res, error, 'Failed to send message');
  }
});

/**
 * GET /api/support/chat/history
 * Get chat history for a room
 */
router.get('/chat/history', authUser, async (req, res) => {
  try {
    const { roomId, visitorToken, limit = 50 } = req.query;

    if (!roomId || !visitorToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'roomId and visitorToken are required' 
      });
    }

    const result = await omnichannelChatService.getChatHistory(
      roomId,
      visitorToken,
      parseInt(limit)
    );

    // Format messages for frontend
    const messages = result.messages.map(msg => ({
      id: msg._id,
      text: msg.msg,
      timestamp: msg.ts,
      isFromAgent: !msg.token,
      senderName: msg.u?.name || msg.u?.username || 'Support',
      attachments: msg.attachments
    }));

    return res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Chronological order
        count: messages.length
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    return failure(res, error, 'Failed to get chat history');
  }
});

/**
 * GET /api/support/chat/active
 * Get patient's active conversation if any
 */
router.get('/chat/active', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const visitorToken = omnichannelChatService.generateVisitorToken(userId);

    const room = await omnichannelChatService.getOpenRoom(visitorToken);

    if (!room) {
      return res.json({
        success: true,
        data: {
          hasActiveChat: false
        }
      });
    }

    return res.json({
      success: true,
      data: {
        hasActiveChat: true,
        roomId: room._id,
        visitorToken,
        department: room.department?.name || 'General Support',
        startedAt: room.ts
      }
    });
  } catch (error) {
    console.error('Get active chat error:', error);
    return failure(res, error, 'Failed to check active chat');
  }
});

/**
 * POST /api/support/chat/close
 * Close conversation with feedback
 */
router.post('/chat/close', authUser, async (req, res) => {
  try {
    const { roomId, visitorToken, rating, comment } = req.body;

    if (!roomId || !visitorToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'roomId and visitorToken are required' 
      });
    }

    const feedback = (rating !== undefined) ? { rating, comment } : null;
    
    const result = await omnichannelChatService.closeConversation(
      roomId,
      visitorToken,
      feedback
    );

    return res.json({
      success: true,
      message: 'Conversation closed successfully'
    });
  } catch (error) {
    console.error('Close chat error:', error);
    return failure(res, error, 'Failed to close conversation');
  }
});

/**
 * GET /api/support/chat/transcript
 * Get full conversation transcript
 */
router.get('/chat/transcript', authUser, async (req, res) => {
  try {
    const { roomId, visitorToken } = req.query;

    if (!roomId || !visitorToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'roomId and visitorToken are required' 
      });
    }

    const result = await omnichannelChatService.getTranscript(roomId, visitorToken);

    return res.json({
      success: true,
      data: {
        transcript: result.transcript,
        messageCount: result.messageCount
      }
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    return failure(res, error, 'Failed to get transcript');
  }
});

// ============================================================================
// WIDGET CONFIGURATION
// ============================================================================

/**
 * GET /api/support/config
 * Get chat widget configuration for frontend
 */
router.get('/config', async (req, res) => {
  try {
    const config = omnichannelChatService.getWidgetConfig();

    return res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get config error:', error);
    return failure(res, error, 'Failed to get config');
  }
});

/**
 * GET /api/support/departments
 * Get available support departments
 */
router.get('/departments', async (req, res) => {
  try {
    const config = omnichannelChatService.getWidgetConfig();

    return res.json({
      success: true,
      data: {
        departments: config.departments
      }
    });
  } catch (error) {
    console.error('Get departments error:', error);
    return failure(res, error, 'Failed to get departments');
  }
});

// ============================================================================
// WHATSAPP WEBHOOK (Called by WhatsApp service)
// ============================================================================

/**
 * POST /api/support/webhook/whatsapp
 * Handle incoming WhatsApp message
 */
router.post('/webhook/whatsapp', async (req, res) => {
  try {
    console.log(`📞 WhatsApp webhook received`);
    const { from, body, mediaUrl, profileName } = req.body;
    console.log(`   From: ${from}, Body: "${body.substring(0, 50)}..."`);

    // Try to find patient by phone number
    console.log(`   🔍 Looking up patient...`);
    const patient = await userModel.findOne({
      where: { phoneNumber: from }
    });
    console.log(`   Patient found: ${patient ? 'YES' : 'NO'}`);

    console.log(`   📨 Calling handleWhatsAppMessage...`);
    const result = await omnichannelChatService.handleWhatsAppMessage({
      from,
      body,
      mediaUrl,
      patientId: patient?.id,
      patient: patient ? {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber
      } : {
        id: `whatsapp-${from}`,
        firstName: profileName || 'WhatsApp',
        lastName: 'User',
        phoneNumber: from
      }
    });

    console.log(`   ✅ Handler result:`, result);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error(`❌ WhatsApp webhook error:`, error.message);
    console.error(`   Stack:`, error.stack?.split('\n')[1]);
    return failure(res, error, 'Failed to process message');
  }
});

// The RocketChat outgoing-webhook endpoint that used to live here is gone. It briefly answered
// 410 Gone, but that handler was unreachable: /api/support/webhook/rocketchat was removed from
// PUBLIC_ENDPOINTS in middleware/ringFencing.js at the same time, so ring-fencing answers 401
// before routing ever reaches this file. A stale webhook pointed here is rejected either way, and
// an unreachable handler only misleads the next reader.


// ============================================================================
// QUEUE STATUS (For admin dashboard)
// ============================================================================

/**
 * GET /api/support/queue
 * Get current support queue status
 */
router.get('/queue', async (req, res) => {
  try {
    const result = await omnichannelChatService.getQueueStatus();

    return res.json({
      success: true,
      data: {
        queue: result.queue,
        waitingCount: result.count
      }
    });
  } catch (error) {
    console.error('Get queue error:', error);
    return failure(res, error, 'Failed to get queue status');
  }
});

/**
 * GET /api/support/agents
 * Get available support agents
 */
router.get('/agents', async (req, res) => {
  try {
    const { department } = req.query;
    const result = await omnichannelChatService.getAvailableAgents(department);

    return res.json({
      success: true,
      data: {
        agents: result.agents,
        onlineCount: result.agents.filter(a => a.status === 'online').length
      }
    });
  } catch (error) {
    console.error('Get agents error:', error);
    return failure(res, error, 'Failed to get agents');
  }
});

// ============================================================================
// WHATSAPP INBOX (WATI-like)
// ============================================================================
// SUPPORT AGENT INBOX
// ============================================================================
// This console was built directly on RocketChat's REST API: livechat rooms and visitors, channel
// history, canned responses, message templates, broadcast, tags, delivery receipts. RocketChat was
// retired on 2026-10-04 and Chatwoot models these differently (it has its own agent UI at
// https://chat.mediqzy.com, plus conversations/labels/canned responses under a different API), so
// there is no faithful one-to-one port. Rather than leave calls to a host that no longer exists,
// the paths are kept and report unavailable, so the agent UI gets a clear 503 with a reason
// instead of a timeout. Replacing this console is deliberate follow-up work; see
// docs/integrations/ROCKETCHAT_RETIREMENT.md.

const AGENT_CONSOLE_ROUTES = [
  ['get',    '/inbox/conversations'],
  ['get',    '/inbox/rooms/:roomId/messages'],
  ['post',   '/inbox/rooms/:roomId/send'],
  ['post',   '/inbox/rooms/:roomId/close'],
  ['post',   '/inbox/rooms/:roomId/note'],
  ['get',    '/inbox/canned-responses'],
  ['post',   '/inbox/canned-responses'],
  ['delete', '/inbox/canned-responses/:id'],
  ['get',    '/inbox/templates'],
  ['post',   '/inbox/broadcast'],
  ['put',    '/inbox/rooms/:roomId/tags'],
  ['get',    '/inbox/rooms/:roomId/profile'],
  ['post',   '/inbox/rooms/:roomId/send-media'],
  ['get',    '/inbox/rooms/:roomId/delivery'],
];

for (const [method, path] of AGENT_CONSOLE_ROUTES) {
  router[method](path, ...authInbox, (_req, res) => {
    return res.status(503).json({
      success: false,
      code: 'AGENT_CONSOLE_NOT_MIGRATED',
      message: 'The in-app agent console was retired with RocketChat. Use Chatwoot for agent replies.',
      provider: 'chatwoot',
      agentWorkspaceUrl: process.env.CHATWOOT_URL || 'https://chat.mediqzy.com',
    });
  });
}

/**
 * GET /api/support/whatsapp-contacts
 * List all saved WhatsApp contacts ordered by last contact
 */
router.get('/whatsapp-contacts', authUser, async (req, res) => {
  try {
    const { limit = 200, offset = 0, search = '' } = req.query;
    let query, params;
    if (search) {
      query = `SELECT * FROM whatsapp_contacts
               WHERE phone ILIKE $3 OR name ILIKE $3 OR profile_name ILIKE $3
               ORDER BY last_contact_at DESC LIMIT $1 OFFSET $2`;
      params = [parseInt(limit), parseInt(offset), `%${search}%`];
    } else {
      query = `SELECT * FROM whatsapp_contacts ORDER BY last_contact_at DESC LIMIT $1 OFFSET $2`;
      params = [parseInt(limit), parseInt(offset)];
    }
    const { rows } = await sharedPool.query(query, params);
    const { rows: [{ count }] } = await sharedPool.query(`SELECT COUNT(*) FROM whatsapp_contacts`);
    return res.json({ success: true, contacts: rows, total: parseInt(count) });
  } catch (err) {
    return failure(res, err);
  }
});

/**
 * PATCH /api/support/whatsapp-contacts/:phone
 * Update contact name, notes, or tags
 */
router.patch('/whatsapp-contacts/:phone', authUser, async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const { name, notes, tags } = req.body;
    await sharedPool.query(
      `UPDATE whatsapp_contacts
       SET name = COALESCE($2, name),
           notes = COALESCE($3, notes),
           tags = COALESCE($4, tags),
           updated_at = NOW()
       WHERE phone = $1`,
      [phone, name || null, notes || null, tags ? JSON.stringify(tags) : null]
    );
    return res.json({ success: true });
  } catch (err) {
    return failure(res, err);
  }
});

export default router;

