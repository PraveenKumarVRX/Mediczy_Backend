/**
 * Omnichannel Support Chat Routes
 * Handles patient chat from WhatsApp and In-App to RocketChat support team
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import omnichannelChatService from '../services/omnichannel-chat.service.js';
import userModel from '../models/user.model.intelligent.js';

const router = express.Router();

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize RocketChat connection on server start
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
    return res.status(500).json({ success: false, message: 'Failed to start chat' });
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
    return res.status(500).json({ success: false, message: 'Failed to send message' });
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
    return res.status(500).json({ success: false, message: 'Failed to get chat history' });
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
    return res.status(500).json({ success: false, message: 'Failed to check active chat' });
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
    return res.status(500).json({ success: false, message: 'Failed to close conversation' });
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
    return res.status(500).json({ success: false, message: 'Failed to get transcript' });
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
    return res.status(500).json({ success: false, message: 'Failed to get config' });
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
    return res.status(500).json({ success: false, message: 'Failed to get departments' });
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
    return res.status(500).json({ success: false, message: 'Failed to process message' });
  }
});

/**
 * POST /api/support/webhook/rocketchat
 * Handle RocketChat agent response (to send back to WhatsApp)
 */
router.post('/webhook/rocketchat', async (req, res) => {
  try {
    const webhookData = req.body;

    // Debug: Log the FULL webhook payload with complete structure
    console.log('🔔 [RC Webhook] Full payload keys:', Object.keys(webhookData));
    console.log('🔔 [RC Webhook] Payload:', JSON.stringify(webhookData, null, 2));
    
    // Log individual fields for clarity
    if (webhookData.message) {
      console.log('🔔 [RC Webhook] Message object:', JSON.stringify(webhookData.message, null, 2).substring(0, 300));
    }
    if (webhookData.room) {
      console.log('🔔 [RC Webhook] Room object:', JSON.stringify(webhookData.room, null, 2).substring(0, 300));
    }

    // Forward agent message to WhatsApp if applicable
    const result = await omnichannelChatService.sendToWhatsApp(webhookData);
    
    console.log('🔔 [RC Webhook] Result:', result);

    return res.json({ success: true });
  } catch (error) {
    console.error('RocketChat webhook error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process webhook' });
  }
});

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
    return res.status(500).json({ success: false, message: 'Failed to get queue status' });
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
    return res.status(500).json({ success: false, message: 'Failed to get agents' });
  }
});

export default router;
