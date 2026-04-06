/**
 * Omnichannel Support Chat Routes
 * Handles patient chat from WhatsApp and In-App to RocketChat support team
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import omnichannelChatService from '../services/omnichannel-chat.service.js';
import userModel from '../models/user.model.intelligent.js';
import sharedPool from '../db/pgPool.js';

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

// ============================================================================
// WHATSAPP INBOX (WATI-like)
// ============================================================================

/**
 * GET /api/support/inbox/conversations
 * Return open RC livechat rooms for the WhatsApp inbox UI
 */
router.get('/inbox/conversations', async (req, res) => {
  try {
    const { count = 50, offset = 0, open = 'true' } = req.query;
    const rooms = await omnichannelChatService.getLivechatRooms({
      count: parseInt(count, 10),
      offset: parseInt(offset, 10),
      open: open !== 'false'
    });

    // Fetch visitor details in parallel to get phone numbers
    const conversations = await Promise.all(rooms.map(async room => {
      let phone = null;
      const visitorToken = room.v?.token;

      // 1. Try Redis cache (fastest — set by syncToLivechat)
      if (visitorToken) {
        try {
          const { cache } = await import('../db/redis.js');
          const cached = await cache.get(`whatsapp:visitor:${visitorToken}`);
          if (cached?.phone) phone = cached.phone;
        } catch (_) {}
      }

      // 2. Fallback: fetch visitor record from RC (has phone array)
      if (!phone && visitorToken) {
        try {
          const resp = await omnichannelChatService.apiRequest(
            'get',
            `${omnichannelChatService.rocketChatUrl}/api/v1/livechat/visitor/${visitorToken}`
          );
          phone = resp.data?.visitor?.phone?.[0]?.phoneNumber || null;
          // Prime Redis for next time
          if (phone) {
            const { cache } = await import('../db/redis.js');
            await cache.set(`whatsapp:visitor:${visitorToken}`, { phone }, 86400).catch(() => {});
          }
        } catch (_) {}
      }

      const displayName = room.fname || room.v?.name || phone || room.v?.username || room._id;

      let tags = [];
      try {
        const { cache: tagsCache } = await import('../db/redis.js');
        tags = await tagsCache.get(`inbox:tags:${room._id}`) || [];
      } catch (_) {}

      return {
        id: room._id,
        name: displayName,
        phone,
        source: 'whatsapp',
        status: room.open ? 'open' : 'closed',
        unread: room.msgs || 0,
        lastMessage: room.lastMessage?.msg || '',
        lastMessageAt: room.lastMessage?.ts || room._updatedAt || null,
        servedBy: room.servedBy?.name || null,
        department: room.department?.name || null,
        tags
      };
    }));

    return res.json({ success: true, conversations });
  } catch (error) {
    console.error('Inbox conversations error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load inbox' });
  }
});

/**
 * GET /api/support/inbox/rooms/:roomId/messages
 * Fetch messages in a specific livechat room
 */
router.get('/inbox/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { count = 50, offset = 0 } = req.query;
    // livechat/messages → 404 in this RC version; channels.history works for all room types
    const result = await omnichannelChatService.apiRequest(
      'get',
      `${omnichannelChatService.rocketChatUrl}/api/v1/channels.history`,
      null,
      { roomId, count: parseInt(count, 10), offset: parseInt(offset, 10), unreads: false }
    );
    const msgs = (result.data.messages || []).reverse().map(m => ({
      id: m._id,
      text: m.msg || '',
      ts: m.ts,
      author: m.u?.name || m.u?.username,
      isAgent: !m.token,
      isNote: m.alias === 'Note' || (m.msg || '').startsWith('🗒️ [Note]'),
      mediaUrl: m.attachments?.[0]?.image_url || m.attachments?.[0]?.title_link || null,
      deliverySid: null
    }));
    return res.json({ success: true, messages: msgs });
  } catch (error) {
    console.error('Room messages error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

/**
 * POST /api/support/inbox/rooms/:roomId/send
 * Agent sends a message to a livechat room AND directly forwards to WhatsApp
 */
router.post('/inbox/rooms/:roomId/send', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { message, phone } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'Message required' });

    const msgText = message.trim();

    // Post message into RC livechat room — RC webhook will forward it to WhatsApp automatically
    await omnichannelChatService.apiRequest(
      'post',
      `${omnichannelChatService.rocketChatUrl}/api/v1/chat.sendMessage`,
      { message: { rid: roomId, msg: msgText } }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// ============================================================================
// WHATSAPP INBOX — EXTENDED FEATURES (WATI-parity)
// ============================================================================

/**
 * POST /api/support/inbox/rooms/:roomId/close
 * Close a livechat room as agent
 */
router.post('/inbox/rooms/:roomId/close', async (req, res) => {
  try {
    const { roomId } = req.params;
    await omnichannelChatService.apiRequest(
      'post',
      `${omnichannelChatService.rocketChatUrl}/api/v1/livechat/room.closeByUser`,
      { rid: roomId }
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Close room error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to close conversation' });
  }
});

/**
 * POST /api/support/inbox/rooms/:roomId/note
 * Post an internal note (displayed in RC, NOT sent to WhatsApp customer)
 */
router.post('/inbox/rooms/:roomId/note', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Note text required' });
    await omnichannelChatService.apiRequest(
      'post',
      `${omnichannelChatService.rocketChatUrl}/api/v1/chat.postMessage`,
      { roomId, text: `🗒️ [Note] ${text.trim()}`, alias: 'Note' }
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Post note error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to post note' });
  }
});

/**
 * GET /api/support/inbox/canned-responses
 * List canned responses (RC API + custom Redis-stored ones)
 */
router.get('/inbox/canned-responses', async (req, res) => {
  try {
    let cannedList = [];
    try {
      const rcRes = await omnichannelChatService.apiRequest(
        'get',
        `${omnichannelChatService.rocketChatUrl}/api/v1/canned-responses`,
        null,
        { count: 100, offset: 0 }
      );
      if (rcRes.data?.cannedResponses?.length) {
        cannedList = rcRes.data.cannedResponses.map(cr => ({
          id: cr._id, shortcut: cr.shortcut, text: cr.text, source: 'rc'
        }));
      }
    } catch (_) {}
    try {
      const { cache } = await import('../db/redis.js');
      const custom = await cache.get('inbox:canned-responses') || [];
      cannedList = [...cannedList, ...custom];
    } catch (_) {}
    return res.json({ success: true, cannedResponses: cannedList });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load canned responses' });
  }
});

/**
 * POST /api/support/inbox/canned-responses
 * Create a custom canned response (stored in Redis)
 */
router.post('/inbox/canned-responses', async (req, res) => {
  try {
    const { shortcut, text } = req.body;
    if (!shortcut?.trim() || !text?.trim()) {
      return res.status(400).json({ success: false, message: 'shortcut and text required' });
    }
    const { cache } = await import('../db/redis.js');
    const existing = await cache.get('inbox:canned-responses') || [];
    const newEntry = { id: `custom_${Date.now()}`, shortcut: shortcut.trim(), text: text.trim(), source: 'custom' };
    await cache.set('inbox:canned-responses', [...existing, newEntry], 0);
    return res.json({ success: true, cannedResponse: newEntry });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create canned response' });
  }
});

/**
 * DELETE /api/support/inbox/canned-responses/:id
 * Delete a custom canned response from Redis
 */
router.delete('/inbox/canned-responses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cache } = await import('../db/redis.js');
    const existing = await cache.get('inbox:canned-responses') || [];
    await cache.set('inbox:canned-responses', existing.filter(c => c.id !== id), 0);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete canned response' });
  }
});

/**
 * GET /api/support/inbox/templates
 * List WhatsApp message templates (built-in + custom from Redis)
 */
router.get('/inbox/templates', async (req, res) => {
  try {
    const builtIn = [
      {
        id: 'appointmentConfirmation',
        name: 'Appointment Confirmation',
        body: `Your appointment has been confirmed! ✅\n\nDear {{patientName}},\n\n👨‍⚕️ Doctor: {{doctorName}}\n📍 Location: {{location}}\n📅 Date: {{date}}\n🕐 Time: {{time}}\n\nPlease arrive 15 minutes early.`,
        variables: ['patientName', 'doctorName', 'location', 'date', 'time']
      },
      {
        id: 'appointmentReminder',
        name: 'Appointment Reminder',
        body: `Reminder: Appointment Today 🩺\n\nHello {{patientName}}, your appointment with {{doctorName}} is at {{time}}.\n📍 {{location}}\n\nReply YES to confirm.`,
        variables: ['patientName', 'doctorName', 'time', 'location']
      },
      {
        id: 'healthReport',
        name: 'Health Report Ready',
        body: `Your health report is ready 📋\n\nHello {{patientName}}, your health report is available.\n\n🔗 Download: {{reportUrl}}`,
        variables: ['patientName', 'reportUrl']
      },
      {
        id: 'followUp',
        name: 'Follow-up Message',
        body: `Hi {{name}}, this is a follow-up from our team regarding your recent inquiry. How can we assist you further?`,
        variables: ['name']
      },
      {
        id: 'prescriptionReady',
        name: 'Prescription Ready',
        body: `Your prescription is ready 💊\n\nHi {{patientName}}, your prescription from Dr. {{doctorName}} is ready.\n\n📅 Follow-up: {{followUpDate}}\n🔗 Download: {{prescriptionUrl}}`,
        variables: ['patientName', 'doctorName', 'followUpDate', 'prescriptionUrl']
      }
    ];
    let templates = [...builtIn];
    try {
      const { cache } = await import('../db/redis.js');
      const custom = await cache.get('inbox:templates') || [];
      templates = [...templates, ...custom];
    } catch (_) {}
    return res.json({ success: true, templates });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load templates' });
  }
});

/**
 * POST /api/support/inbox/broadcast
 * Send a WhatsApp message to multiple phone numbers
 */
router.post('/inbox/broadcast', async (req, res) => {
  try {
    const { phones, message } = req.body;
    if (!Array.isArray(phones) || !phones.length || !message?.trim()) {
      return res.status(400).json({ success: false, message: 'phones array and message required' });
    }
    if (phones.length > 200) {
      return res.status(400).json({ success: false, message: 'Max 200 recipients per broadcast' });
    }
    const { default: whatsappService } = await import('../services/whatsapp-production.service.js');
    const results = await Promise.allSettled(
      phones.map(async phone => {
        const normPhone = omnichannelChatService.normalizeWhatsAppNumber(String(phone).trim());
        await whatsappService.sendSessionMessage({ to: normPhone, body: message.trim() });
        return normPhone;
      })
    );
    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const errors = results
      .map((r, i) => r.status === 'rejected' ? { phone: phones[i], error: r.reason?.message } : null)
      .filter(Boolean);
    console.log(`📡 [broadcast] sent=${sent} failed=${failed}`);
    return res.json({ success: true, sent, failed, errors });
  } catch (error) {
    console.error('Broadcast error:', error);
    return res.status(500).json({ success: false, message: 'Broadcast failed' });
  }
});

/**
 * PUT /api/support/inbox/rooms/:roomId/tags
 * Update labels/tags for a conversation (stored in Redis)
 */
router.put('/inbox/rooms/:roomId/tags', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, message: 'tags must be an array' });
    }
    const { cache } = await import('../db/redis.js');
    await cache.set(`inbox:tags:${roomId}`, tags, 0);
    return res.json({ success: true, tags });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update tags' });
  }
});

/**
 * GET /api/support/inbox/rooms/:roomId/profile
 * Get contact profile, SLA metrics, tag history, and conversation count
 */
router.get('/inbox/rooms/:roomId/profile', async (req, res) => {
  try {
    const { roomId } = req.params;
    let room = null;
    try {
      const roomRes = await omnichannelChatService.apiRequest(
        'get', `${omnichannelChatService.rocketChatUrl}/api/v1/channels.info`, null, { roomId }
      );
      room = roomRes.data?.channel || null;
    } catch (_) {}

    let visitor = null, phone = null;
    if (room?.v?.token) {
      try {
        const vRes = await omnichannelChatService.apiRequest(
          'get', `${omnichannelChatService.rocketChatUrl}/api/v1/livechat/visitor/${room.v.token}`
        );
        visitor = vRes.data?.visitor || null;
        phone = visitor?.phone?.[0]?.phoneNumber || null;
        // Also try Redis cache
        if (!phone) {
          const { cache } = await import('../db/redis.js');
          const cached = await cache.get(`whatsapp:visitor:${room.v.token}`);
          if (cached?.phone) phone = cached.phone;
        }
      } catch (_) {}
    }

    let tags = [];
    try {
      const { cache } = await import('../db/redis.js');
      tags = await cache.get(`inbox:tags:${roomId}`) || [];
    } catch (_) {}

    let firstResponseMs = null, totalMessages = 0;
    try {
      const msgRes = await omnichannelChatService.apiRequest(
        'get', `${omnichannelChatService.rocketChatUrl}/api/v1/channels.history`,
        null, { roomId, count: 100, unreads: false }
      );
      const msgs = msgRes.data?.messages || [];
      totalMessages = msgs.length;
      const roomCreated = room?.ts ? new Date(room.ts).getTime() : null;
      if (roomCreated) {
        const firstAgentMsg = [...msgs].reverse().find(m => !m.token);
        if (firstAgentMsg) firstResponseMs = new Date(firstAgentMsg.ts).getTime() - roomCreated;
      }
    } catch (_) {}

    let pastConversations = 0;
    if (visitor?._id) {
      try {
        const histRes = await omnichannelChatService.apiRequest(
          'get', `${omnichannelChatService.rocketChatUrl}/api/v1/livechat/visitor/${visitor._id}/room`,
          null, { count: 100 }
        );
        pastConversations = (histRes.data?.rooms || []).length;
      } catch (_) {}
    }

    return res.json({
      success: true,
      profile: {
        name: visitor?.name || room?.fname || room?.name || 'Unknown',
        phone,
        email: visitor?.email?.[0]?.address || null,
        createdAt: visitor?.createdAt || room?.ts || null,
        tags,
        totalMessages,
        pastConversations,
        firstResponseMs,
        lastSeen: visitor?.lastChat?.ts || null,
        customFields: visitor?.livechatData || {}
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

/**
 * POST /api/support/inbox/rooms/:roomId/send-media
 * Send a media file (image/doc/audio/video URL) via Twilio WhatsApp, posted to RC too
 */
router.post('/inbox/rooms/:roomId/send-media', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { mediaUrl, caption = '', phone } = req.body;
    if (!mediaUrl?.trim()) return res.status(400).json({ success: false, message: 'mediaUrl required' });
    if (!phone) return res.status(400).json({ success: false, message: 'phone required' });

    const msgText = caption ? `${caption}\n${mediaUrl}` : mediaUrl;
    await omnichannelChatService.apiRequest(
      'post', `${omnichannelChatService.rocketChatUrl}/api/v1/chat.postMessage`,
      { roomId, text: `📎 ${msgText}`, alias: 'Media' }
    );

    const normPhone = omnichannelChatService.normalizeWhatsAppNumber(phone);
    const { default: whatsappService } = await import('../services/whatsapp-production.service.js');
    await whatsappService.sendMediaMessage({ to: normPhone, mediaUrl: mediaUrl.trim(), caption: caption.trim() });
    return res.json({ success: true });
  } catch (error) {
    console.error('Send media error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to send media' });
  }
});

/**
 * GET /api/support/inbox/rooms/:roomId/delivery
 * Check WhatsApp delivery status of last sent message (read receipts)
 */
router.get('/inbox/rooms/:roomId/delivery', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { cache } = await import('../db/redis.js');
    const stored = await cache.get(`inbox:lastsid:${roomId}`);
    if (!stored?.sid) return res.json({ success: true, status: 'sent' });
    const { default: whatsappService } = await import('../services/whatsapp-production.service.js');
    const msg = await whatsappService.getMessageStatus(stored.sid);
    return res.json({ success: true, status: msg.status, sid: stored.sid });
  } catch {
    return res.json({ success: true, status: 'sent' });
  }
});

// ============================================================================
// WHATSAPP CONTACTS
// ============================================================================

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
    return res.status(500).json({ success: false, message: err.message });
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
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

