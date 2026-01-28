import express from 'express';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import unifiedConversationService from '../services/unified-conversation.service.js';
import whatsAppUserContextService from '../services/whatsapp-user-context.service.js';
import rocketChatService from '../services/rocketchat.service.js';
import n8nService from '../services/n8n.service.js';
import { cache } from '../db/redis.js';
import logger from '../config/logger.js';

const router = express.Router();

const sanitizeReply = (text) => {
  const normalized = String(text || '').trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return "Hi! I'm Dr. iSHA. How can I help you today?";
  if (lower.includes('there was an error processing your request') || lower.includes('please try again later')) {
    return "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details.";
  }
  return normalized;
};

const HANDOFF_KEY_PREFIX = 'whatsapp:handoff:';
const HANDOFF_TTL_SECONDS = parseInt(process.env.WHATSAPP_HANDOFF_TTL || '86400', 10);

const normalizeWhatsAppNumber = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/^whatsapp:/i, '');
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 10) {
    const countryCode = process.env.DEFAULT_COUNTRY_CODE || '91';
    return `+${countryCode}${digits}`;
  }
  if (digits.length >= 11) return `+${digits}`;
  return digits;
};

const getHandoffKey = (phoneNumber) => `${HANDOFF_KEY_PREFIX}${normalizeWhatsAppNumber(phoneNumber)}`;

const getHandoffState = async (phoneNumber) => {
  if (!phoneNumber) return null;
  return await cache.get(getHandoffKey(phoneNumber));
};

const setHandoffState = async (phoneNumber, payload = {}) => {
  if (!phoneNumber) return null;
  const state = {
    active: true,
    updatedAt: new Date().toISOString(),
    ...payload
  };
  await cache.set(getHandoffKey(phoneNumber), state, HANDOFF_TTL_SECONDS);
  return state;
};

/**
 * Detect appointment booking intent from user message
 */
const detectBookingIntent = (message) => {
  const lowerMsg = (message || '').toLowerCase();
  const bookingPatterns = [
    /book\s*(an?\s*)?(appointment|consultation|doctor)/i,
    /fix\s*(an?\s*)?(appointment|consultation)/i,
    /schedule\s*(an?\s*)?(appointment|consultation|visit)/i,
    /i\s*want\s*to\s*(see|consult|meet|visit)\s*(a\s*)?(doctor|physician)/i,
    /need\s*(to\s*)?(see|consult)\s*(a\s*)?(doctor|physician)/i,
    /can\s*(you\s*)?book\s*(me\s*)?(an?\s*)?appointment/i,
    /yes\s*(please\s*)?(book|schedule)/i,
    /book\s*now/i,
    /yes\s*i\s*want\s*(to\s*)?(book|see)/i
  ];
  
  const isBookingIntent = bookingPatterns.some(pattern => pattern.test(lowerMsg));
  
  // Try to detect specialist type
  let specialistType = 'general_physician';
  if (/gastro|stomach|digestive|abdomen/i.test(lowerMsg)) specialistType = 'gastroenterologist';
  else if (/heart|cardio|chest\s*pain/i.test(lowerMsg)) specialistType = 'cardiologist';
  else if (/skin|derma|rash/i.test(lowerMsg)) specialistType = 'dermatologist';
  else if (/child|baby|infant|pediatric/i.test(lowerMsg)) specialistType = 'pediatrician';
  else if (/bone|orthop|joint|fracture/i.test(lowerMsg)) specialistType = 'orthopedic';
  else if (/eye|vision|ophthalm/i.test(lowerMsg)) specialistType = 'ophthalmologist';
  else if (/ent|ear|nose|throat/i.test(lowerMsg)) specialistType = 'ent';
  else if (/neuro|brain|headache/i.test(lowerMsg)) specialistType = 'neurologist';
  else if (/gynec|women|pregnancy/i.test(lowerMsg)) specialistType = 'gynecologist';
  else if (/general|physician|gp/i.test(lowerMsg)) specialistType = 'general_physician';
  
  return { isBookingIntent, specialistType };
};

// Configuration for AI auto-reply - unified Dr. iSHA
const AI_AUTO_REPLY_ENABLED = process.env.WHATSAPP_AI_AUTO_REPLY === 'true' || false;

/**
 * Send appointment confirmation
 */
router.post('/send/appointment-confirmation', async (req, res) => {
  try {
    const { to, patientName, doctorName, date, time, location } = req.body;
    
    if (!to || !patientName || !doctorName || !date || !time || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendAppointmentConfirmation({
      to, patientName, doctorName, date, time, location
    });
    
    res.json({
      success: true,
      message: 'Appointment confirmation sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending appointment confirmation:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send appointment reminder
 */
router.post('/send/appointment-reminder', async (req, res) => {
  try {
    const { to, patientName, doctorName, time, location } = req.body;
    
    if (!to || !patientName || !doctorName || !time || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendAppointmentReminder({
      to, patientName, doctorName, time, location
    });
    
    res.json({
      success: true,
      message: 'Appointment reminder sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send health report notification
 */
router.post('/send/health-report', async (req, res) => {
  try {
    const { to, patientName } = req.body;
    
    if (!to || !patientName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendHealthReportReady({
      to, patientName
    });
    
    res.json({
      success: true,
      message: 'Health report notification sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending health report notification:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send prescription notification
 */
router.post('/send/prescription', async (req, res) => {
  try {
    const { to, patientName, doctorName, prescriptionUrl, medications, followUpDate } = req.body;
    
    if (!to || !patientName || !doctorName || !prescriptionUrl || !medications || !followUpDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendPrescriptionReady({
      to, patientName, doctorName, prescriptionUrl, medications, followUpDate
    });
    
    res.json({
      success: true,
      message: 'Prescription notification sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending prescription notification:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send OTP
 */
router.post('/send/otp', async (req, res) => {
  try {
    const { to, otp } = req.body;
    
    if (!to || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendOTP({ to, otp });
    
    res.json({
      success: true,
      message: 'OTP sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send health checkup reminder
 */
router.post('/send/checkup-reminder', async (req, res) => {
  try {
    const { to, patientName } = req.body;
    
    if (!to || !patientName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendCheckupReminder({
      to, patientName
    });
    
    res.json({
      success: true,
      message: 'Checkup reminder sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending checkup reminder:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send session message (reply within 24hr window)
 */
router.post('/send/session-message', async (req, res) => {
  try {
    const { to, body } = req.body;
    
    if (!to || !body) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    const message = await whatsappProductionService.sendSessionMessage({ to, body });
    
    res.json({
      success: true,
      message: 'Message sent',
      data: {
        messageSid: message.sid,
        status: message.status,
        to: message.to
      }
    });
  } catch (error) {
    console.error('Error sending session message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get message status
 */
router.get('/status/:messageSid', async (req, res) => {
  try {
    const { messageSid } = req.params;
    const message = await whatsappProductionService.getMessageStatus(messageSid);
    
    res.json({
      success: true,
      data: {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        price: message.price,
        priceUnit: message.priceUnit
      }
    });
  } catch (error) {
    console.error('Error getting message status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get template configuration status
 */
router.get('/templates/status', (req, res) => {
  try {
    const status = whatsappProductionService.getTemplateStatus();
    
    res.json({
      success: true,
      data: status,
      allConfigured: Object.values(status).every(v => v)
    });
  } catch (error) {
    console.error('Error getting template status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get WhatsApp conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    const client = await import('twilio').then(m => m.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    ));
    
    // Get recent messages
    const messages = await client.messages.list({ limit: 100 });
    
    // Group by conversation (phone number)
    const conversations = {};
    
    messages.forEach(msg => {
      const phoneNumber = msg.direction === 'inbound' ? msg.from : msg.to;
      const cleanNumber = phoneNumber.replace('whatsapp:', '');
      
      if (!conversations[cleanNumber]) {
        conversations[cleanNumber] = {
          phoneNumber: cleanNumber,
          messages: [],
          lastMessage: null,
          lastActivity: null,
          unreadCount: 0
        };
      }
      
      const messageData = {
        sid: msg.sid,
        body: msg.body,
        from: msg.from,
        to: msg.to,
        direction: msg.direction,
        status: msg.status,
        timestamp: msg.dateCreated,
        errorCode: msg.errorCode,
        errorMessage: msg.errorMessage
      };
      
      conversations[cleanNumber].messages.push(messageData);
      
      if (!conversations[cleanNumber].lastActivity || 
          new Date(msg.dateCreated) > new Date(conversations[cleanNumber].lastActivity)) {
        conversations[cleanNumber].lastActivity = msg.dateCreated;
        conversations[cleanNumber].lastMessage = msg.body;
      }
    });
    
    // Convert to array and sort by last activity
    const conversationList = Object.values(conversations).sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
    
    res.json({
      success: true,
      conversations: conversationList
    });
  } catch (error) {
    console.error('Error fetching WhatsApp conversations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get messages for a specific WhatsApp conversation
 */
router.get('/conversations/:phoneNumber/messages', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const client = await import('twilio').then(m => m.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    ));
    
    // Get messages for this phone number
    const messages = await client.messages.list({ 
      limit: 100,
    });
    
    // Filter messages for this conversation
    const conversationMessages = messages
      .filter(msg => {
        const msgNumber = (msg.direction === 'inbound' ? msg.from : msg.to).replace('whatsapp:', '');
        return msgNumber === phoneNumber;
      })
      .map(msg => ({
        sid: msg.sid,
        body: msg.body,
        from: msg.from.replace('whatsapp:', ''),
        to: msg.to.replace('whatsapp:', ''),
        direction: msg.direction,
        status: msg.status,
        timestamp: msg.dateCreated,
        errorCode: msg.errorCode,
        errorMessage: msg.errorMessage,
        price: msg.price,
        priceUnit: msg.priceUnit
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    res.json({
      success: true,
      messages: conversationMessages
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Send a WhatsApp message in a conversation
 */
router.post('/conversations/:phoneNumber/send', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const whatsappService = (await import('../services/whatsapp-production.service.js')).default;
    
    const result = await whatsappService.sendSessionMessage({
      to: phoneNumber,
      body: message
    });

    await setHandoffState(phoneNumber, {
      reason: 'manual_agent_message',
      source: 'team_dashboard'
    });
    
    res.json({
      success: true,
      message: 'Message sent',
      data: {
        messageSid: result.sid,
        status: result.status,
        to: result.to
      }
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get user context by phone number
 * Returns complete user profile, appointments, prescriptions, medications
 */
router.get('/user-context/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);
    
    res.json({
      success: true,
      context: userContext
    });
  } catch (error) {
    logger.error('Error fetching user context:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user context',
      error: error.message
    });
  }
});

/**
 * Trigger AI response for a WhatsApp user (manual trigger from admin)
 */
router.post('/ai-respond', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }
    
    const aiResponse = await unifiedConversationService.processMessage({
      message,
      channel: 'whatsapp',
      sessionId: `whatsapp:${phoneNumber}`,
      identifier: phoneNumber,
      userContext: { phoneNumber }
    });
    
    res.json({
      success: true,
      response: aiResponse
    });
  } catch (error) {
    logger.error('AI respond error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI response',
      error: error.message
    });
  }
});

/**
 * Send AI response to WhatsApp user
 */
router.post('/send-ai-response', async (req, res) => {
  try {
    const { phoneNumber, triggerMessage } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Get user context and generate AI response
    const aiResponse = await unifiedConversationService.processMessage({
      message: triggerMessage || 'Hi',
      channel: 'whatsapp',
      sessionId: `whatsapp:${phoneNumber}`,
      identifier: phoneNumber,
      userContext: { phoneNumber }
    });
    
    if (aiResponse.shouldReply && aiResponse.response) {
      // Send via WhatsApp
      const message = await whatsappProductionService.sendSessionMessage({
        to: phoneNumber,
        body: aiResponse.response
      });
      
      // Store in chat room
      const { messages } = await import('../utils/chatStorage.js');
      const aiMessageObj = {
        id: `ai_${Date.now()}`,
        userId: 'dr_isha_bot',
        userName: '🤖 Dr. iSHA',
        userRole: 'assistant',
        message: aiResponse.response,
        type: 'text',
        timestamp: new Date().toISOString(),
        source: 'ai_bot'
      };
      
      await messages.push('general', aiMessageObj);
      
      if (global.io) {
        global.io.to('general').emit('new_message', aiMessageObj);
      }
      
      res.json({
        success: true,
        message: 'AI response sent',
        data: {
          messageSid: message.sid,
          response: aiResponse.response,
          isKnownUser: aiResponse.isKnownUser
        }
      });
    } else {
      res.json({
        success: false,
        message: 'No response generated'
      });
    }
  } catch (error) {
    logger.error('Send AI response error:', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to send AI response',
      error: error.message
    });
  }
});

/**
 * Webhook verification (for Twilio setup)
 */
router.get('/webhook', (req, res) => {
  res.status(200).send('Webhook endpoint is active');
});

/**
 * Debug endpoint to check team chat inbox messages
 * This is for testing - returns messages stored in #general room
 */
router.get('/team-inbox', async (req, res) => {
  try {
    const { chatRooms, messages } = await import('../utils/chatStorage.js');
    const generalRoomId = 'general';
    const room = await chatRooms.get(generalRoomId);
    const roomMessages = await messages.get(generalRoomId) || [];
    
    // Filter to show only WhatsApp messages
    const whatsappMessages = roomMessages.filter(m => m.source === 'whatsapp');
    
    res.json({
      success: true,
      room: room || null,
      totalMessages: roomMessages.length,
      whatsappMessageCount: whatsappMessages.length,
      messages: roomMessages.slice(-20) // Last 20 messages (all types)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Main webhook for incoming WhatsApp messages
 * Identifies user, retrieves context, and optionally responds with AI
 */
router.post('/webhook', async (req, res) => {
  try {
    const { From, Body, MessageSid, ProfileName, MediaUrl0, MediaContentType0 } = req.body;
    
    // Extract phone number (remove whatsapp: prefix)
    const phoneNumber = From?.replace('whatsapp:', '') || '';
    const customerName = ProfileName || phoneNumber;
    
    logger.info('📱 Incoming WhatsApp message', {
      from: From,
      body: Body,
      messageSid: MessageSid,
      profileName: ProfileName,
      hasMedia: !!MediaUrl0,
      timestamp: new Date().toISOString()
    });
    
    // 1. IDENTIFY USER - Check if phone number exists in database
    const userContext = await whatsAppUserContextService.getFullUserContext(phoneNumber);
    
    logger.info('👤 User identification', {
      phoneNumber,
      isKnownUser: userContext.isKnownUser,
      userId: userContext.user?.id,
      userName: userContext.user?.name,
      hasAppointments: userContext.appointments?.recent?.length > 0,
      hasPrescriptions: userContext.prescriptions?.recent?.length > 0
    });
    
    // Import chat rooms storage from chatStorage.js (Redis-backed)
    const { chatRooms, messages } = await import('../utils/chatStorage.js');
    
    // Send WhatsApp messages to the #general room
    const generalRoomId = 'general';
    if (!(await chatRooms.has(generalRoomId))) {
      await chatRooms.set(generalRoomId, {
        id: generalRoomId,
        type: 'channel',
        participants: [],
        createdAt: new Date().toISOString(),
        title: '#general',
        description: 'General discussion and updates'
      });
      await messages.set(generalRoomId, []);
    }
    
    // Create enhanced message object with user context
    const messageObj = {
      id: MessageSid,
      userId: userContext.isKnownUser ? `user_${userContext.user.id}` : `whatsapp_${phoneNumber}`,
      userName: userContext.isKnownUser 
        ? `📱 ${userContext.user.name}` 
        : `📱 ${customerName}`,
      userRole: 'customer',
      message: Body || '[Media Message]',
      type: MediaUrl0 ? 'media' : 'text',
      mediaUrl: MediaUrl0,
      mediaType: MediaContentType0,
      timestamp: new Date().toISOString(),
      source: 'whatsapp',
      phoneNumber: phoneNumber,
      // Enhanced user context
      userContext: {
        isKnownUser: userContext.isKnownUser,
        patientId: userContext.user?.id,
        patientName: userContext.user?.name,
        upcomingAppointments: userContext.appointments?.upcoming?.length || 0,
        activeMedications: userContext.activeMedications?.length || 0
      }
    };
    
    // Add to chat messages using Redis-backed push
    await messages.push(generalRoomId, messageObj);
    const currentMessages = await messages.get(generalRoomId) || [];
    
    logger.info('✅ WhatsApp message added to #general room (Redis)', {
      roomId: generalRoomId,
      messageId: MessageSid,
      from: userContext.isKnownUser ? userContext.user.name : customerName,
      isKnownUser: userContext.isKnownUser,
      messageCount: currentMessages.length
    });
    
    // Also post incoming WhatsApp message to RocketChat
    try {
      await rocketChatService.sendMessage(
        'GENERAL',
        `📱 *WhatsApp Message*\n👤 From: ${customerName} (+${phoneNumber})\n${userContext.isKnownUser ? `🆔 Patient: ${userContext.user.name} (ID: ${userContext.user.id})\n` : ''}⏰ ${new Date().toLocaleString()}\n\n💬 ${Body || '[Media Message]'}`
      );
      logger.info('✅ Customer message posted to RocketChat');
    } catch (rcError) {
      logger.error('Failed to post to RocketChat:', rcError.message);
    }
    
    // Emit Socket.IO event to notify team members (if Socket.IO is available)
    if (global.io) {
      global.io.to(generalRoomId).emit('new_message', messageObj);
      
      // Also emit user context update for real-time dashboard
      global.io.to(generalRoomId).emit('user_context', {
        phoneNumber,
        ...userContext,
        timestamp: new Date().toISOString()
      });
      
      logger.info('🔔 Socket.IO notification sent to #general room');
    }
    
    // 2. CHECK FOR TEAM MEMBER REQUEST (e.g., "I want to chat with parinitha")
    const teamChatPatterns = [
      /\b(chat|talk|speak|connect|contact)\s+(with|to)\s+(\w+)/i,
      /\bi\s+want\s+to\s+(chat|talk|speak)\s+(with|to)\s+(\w+)/i,
      /\bconnect\s+me\s+(with|to)\s+(\w+)/i,
      /\bget\s+me\s+(\w+)/i
    ];
    
    let teamMemberRequested = null;
    for (const pattern of teamChatPatterns) {
      const match = Body?.match(pattern);
      if (match) {
        teamMemberRequested = match[match.length - 1]; // Last captured group is the name
        break;
      }
    }
    
    if (teamMemberRequested) {
      // Post to RocketChat and notify user
      try {
        await rocketChatService.sendMessage(
          'GENERAL',
          `🔔 *Customer Request*\n👤 From: ${customerName} (+${phoneNumber})\n💬 Message: ${Body}\n\n📞 Requesting: ${teamMemberRequested}\n⏰ Time: ${new Date().toLocaleString()}`
        );

        await setHandoffState(phoneNumber, {
          reason: 'team_member_request',
          requested: teamMemberRequested,
          source: 'whatsapp'
        });
        
        await whatsappProductionService.sendSessionMessage({
          to: phoneNumber,
          body: `I've notified our team. ${teamMemberRequested.charAt(0).toUpperCase() + teamMemberRequested.slice(1)} or another team member will respond to you shortly. 👍`
        });
        
        logger.info('✅ Team member request forwarded to RocketChat', {
          phoneNumber,
          teamMember: teamMemberRequested
        });
        
        return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      } catch (error) {
        logger.error('Error forwarding to RocketChat:', error.message);
      }
    }

    const handoffState = await getHandoffState(phoneNumber);
    if (handoffState?.active) {
      logger.info('🤝 Human handoff active - skipping automation', {
        phoneNumber,
        reason: handoffState.reason
      });
      return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
    
    // 3. CHECK FOR APPOINTMENT BOOKING INTENT
    const { isBookingIntent, specialistType } = detectBookingIntent(Body);
    if (isBookingIntent && userContext.isKnownUser) {
      logger.info('📅 Appointment booking intent detected via WhatsApp', {
        phoneNumber,
        specialistType,
        userId: userContext.user?.id
      });
      
      try {
        // Trigger n8n workflow for appointment booking
        const n8nResult = await n8nService.trigger('whatsapp-appointment-booking', {
          userId: userContext.user?.id,
          patientName: userContext.user?.name,
          patientPhone: phoneNumber,
          patientEmail: userContext.user?.email,
          specialistType: specialistType,
          source: 'whatsapp',
          timestamp: new Date().toISOString()
        });
        
        // Send confirmation message
        const specialistNames = {
          'general_physician': 'General Physician',
          'gastroenterologist': 'Gastroenterologist',
          'cardiologist': 'Cardiologist',
          'dermatologist': 'Dermatologist',
          'pediatrician': 'Pediatrician',
          'orthopedic': 'Orthopedic Specialist',
          'ophthalmologist': 'Ophthalmologist',
          'ent': 'ENT Specialist',
          'neurologist': 'Neurologist',
          'gynecologist': 'Gynecologist'
        };
        
        await whatsappProductionService.sendSessionMessage({
          to: phoneNumber,
          body: `📅 *Appointment Booking Request*

I'm processing your request to see a ${specialistNames[specialistType] || 'Doctor'}.

${n8nResult.success 
  ? `✅ Our team will contact you shortly to confirm your appointment slot.\n\n📱 You'll receive a confirmation message with:\n• Doctor's name\n• Date & time options\n• Consultation fee`
  : `🔄 I'm connecting you with our booking team. They'll call you within 15 minutes to schedule your appointment.`}

Is there anything else I can help you with? 💙`
        });
        
        return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      } catch (error) {
        logger.error('Appointment booking error:', error.message);
        // Continue to AI processing if n8n fails
      }
    }
    
    // 4. OPTIONAL: AI AUTO-REPLY (only if enabled)
    // Routes through SIB Brain for deep reasoning with user context
    if (AI_AUTO_REPLY_ENABLED && Body && !MediaUrl0) {
      let responseSent = false;
      try {
        // REMOVED hardcoded greeting and status query handlers
        // Let the AI handle ALL messages with full user context from database
        // This allows Dr. iSHA to check appointments, prescriptions, etc. from DB
        
        // Simple greeting gets fast response but complex queries go to AI
        const isSimpleGreeting = /^(hi|hello|hey)$/i.test(Body.trim());
        if (isSimpleGreeting && !userContext.isKnownUser) {
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply("Hi! I'm Dr. iSHA. How can I help you today?")
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        // ALL other messages (including appointment status, medical queries, etc.)
        // go through unified AI with full DB context

        // Choose handler based on configuration
        // SIB Brain provides deep reasoning, user profiling, and context-aware responses
        const handler = unifiedConversationService;
        const handlerName = 'Unified Dr. iSHA';
        
        logger.info(`🧠 Processing via ${handlerName}`, {
          phoneNumber,
          messageLength: Body.length
        });
        
        const aiResponse = await Promise.race([
          handler.processMessage({
            message: Body,
            channel: 'whatsapp',
            sessionId: `whatsapp:${phoneNumber}`,
            identifier: phoneNumber,
            userContext: {
              ...userContext,
              phoneNumber,
              profileName: ProfileName
            }
          }),
          new Promise(resolve => setTimeout(() => resolve(null), 8000))
        ]);
        const rawResponseText = String(aiResponse?.response || '').trim();
        const normalizedResponseText = rawResponseText.toLowerCase();
        const isGenericErrorReply = normalizedResponseText.includes('there was an error processing your request');
        
        if (!aiResponse) {
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply("I'm processing your request. Please share a bit more detail so I can help faster.")
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        if (aiResponse.shouldReply) {
          const replyText = rawResponseText
            ? (isGenericErrorReply
              ? "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details."
              : rawResponseText)
            : "Hi! I'm Dr. iSHA. How can I help you today?";
          // Send AI response via WhatsApp
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply(replyText)
          });
          responseSent = true;
          
          // Add AI response to chat room
          const aiMessageObj = {
            id: `ai_${Date.now()}`,
            userId: 'dr_isha_bot',
            userName: '🤖 Dr. iSHA',
            userRole: 'assistant',
            message: sanitizeReply(replyText),
            type: 'text',
            timestamp: new Date().toISOString(),
            source: 'ai_bot',
            replyTo: MessageSid,
            isEmergency: aiResponse.isEmergency
          };
          
          await messages.push(generalRoomId, aiMessageObj);
          
          if (global.io) {
            global.io.to(generalRoomId).emit('new_message', aiMessageObj);
          }
          
          // Also post AI response to RocketChat
          try {
            await rocketChatService.sendMessage(
              'GENERAL',
              `🤖 *Dr. iSHA Response*\n📱 To: ${customerName} (+${phoneNumber})\n⏰ ${new Date().toLocaleString()}\n\n${sanitizeReply(replyText)}`
            );
            logger.info('✅ AI response posted to RocketChat');
          } catch (rcError) {
            logger.error('Failed to post AI response to RocketChat:', rcError.message);
          }
          
          logger.info('🤖 AI auto-reply sent', {
            to: phoneNumber,
            isEmergency: aiResponse.isEmergency,
            provider: aiResponse.provider
          });
          
          // If emergency, also notify team
          if (aiResponse.isEmergency && global.io) {
            global.io.emit('emergency_alert', {
              phoneNumber,
              userName: userContext.isKnownUser ? userContext.user.name : customerName,
              message: Body,
              userContext: userContext.summary,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (aiError) {
        logger.error('AI auto-reply error (non-fatal):', { error: aiError.message });
        // Do not send a fallback reply here to avoid duplicate error messages
      }
    }
    
    // Return empty TwiML response
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    logger.error('❌ Webhook error:', { error: error.message, stack: error.stack });
    // Return empty TwiML even on error to prevent Twilio from triggering fallback
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * Fallback webhook for incoming messages
 * Used when primary webhook fails
 */
router.post('/fallback', (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;
    
    console.error('Fallback webhook triggered:', {
      from: From,
      body: Body,
      messageSid: MessageSid,
      timestamp: new Date().toISOString()
    });
    
    // Log to error tracking system
    // Send alert to admin
    
    // Return empty TwiML - DO NOT send any auto-reply
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Fallback webhook error:', error);
    res.type('text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * Status callback webhook
 * Receives delivery status updates from Twilio
 */
router.post('/status-callback', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, To, ErrorCode, ErrorMessage } = req.body;
    
    console.log('Message status update:', {
      messageSid: MessageSid,
      status: MessageStatus,
      to: To,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      timestamp: new Date().toISOString()
    });
    
    // Update message status in database
    // - sent, delivered, read, failed, undelivered
    // - Store error codes for failed messages
    // - Trigger notifications for failures
    
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      console.error('Message delivery failed:', {
        messageSid: MessageSid,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage
      });
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Status callback error:', error);
    res.status(500).send('Error');
  }
});

// ==================== CONVERSATION MANAGEMENT ====================

/**
 * Get all WhatsApp conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    const { status } = req.query;
    
    // In production, fetch from database
    // For now, return mock data
    const conversations = [
      {
        id: '1',
        customerName: 'Ramesh Kumar',
        customerPhone: '+917373007737',
        lastMessage: 'Thank you for the appointment confirmation',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 min ago
        unreadCount: 0,
        status: 'resolved',
        assignedTo: 'Parinitha M'
      },
      {
        id: '2',
        customerName: 'Priya Sharma',
        customerPhone: '+919884069443',
        lastMessage: 'I need to reschedule my appointment',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 min ago
        unreadCount: 2,
        status: 'active',
        assignedTo: 'Parinitha M'
      }
    ];
    
    const filteredConversations = status && status !== 'all' 
      ? conversations.filter(c => c.status === status)
      : conversations;
    
    res.json({
      success: true,
      conversations: filteredConversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get messages for a conversation
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // In production, fetch from database
    // For now, return mock data
    const messages = [
      {
        id: '1',
        from: 'whatsapp:+919791476194',
        to: 'whatsapp:+917373007737',
        body: 'Hello! Your appointment with Dr. Nandita is confirmed for tomorrow at 3:00 PM.',
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        direction: 'outgoing',
        status: 'read'
      },
      {
        id: '2',
        from: 'whatsapp:+917373007737',
        to: 'whatsapp:+919791476194',
        body: 'Thank you for the confirmation!',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        direction: 'incoming',
        status: 'delivered'
      }
    ];
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== SIB BRAIN STATUS ====================

/**
 * Get SIB Brain health status
 * Check if SIB is available and responsive
 */
router.get('/sib/health', async (req, res) => {
  try {
    const sibHealth = await whatsAppSIBBrain.checkSIBHealth();
    
    res.json({
      success: true,
      sibBrain: sibHealth,
      configuration: {
        autoReplyEnabled: AI_AUTO_REPLY_ENABLED,
        useSIBBrain: USE_SIB_BRAIN,
        sibUrl: process.env.SIB_URL || 'http://localhost:8001'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test SIB Brain response manually
 * For debugging and testing SIB integration
 */
router.post('/sib/test', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }
    
    const response = await whatsAppSIBBrain.processMessage(phoneNumber, message, 'Test User');
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
