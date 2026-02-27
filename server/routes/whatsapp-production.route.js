import express from 'express';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import unifiedConversationService from '../services/unified-conversation.service.js';
import whatsAppUserContextService from '../services/whatsapp-user-context.service.js';
import rocketChatService from '../services/rocketchat.service.js';
import omnichannelChatService from '../services/omnichannel-chat.service.js';
import n8nService from '../services/n8n.service.js';
import whatsAppSIBBrain from '../services/whatsapp-sib-brain.service.js';
import { cache } from '../db/redis.js';
import logger from '../config/logger.js';
import { detectServiceIntent, createAutoTicket } from '../services/autoTicketService.js';
import axios from 'axios';

const router = express.Router();
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';

const sanitizeReply = (text) => {
  const normalized = String(text || '').trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return "Hi! I'm Dr. iSHA. How can I help you today?";
  if (lower.includes('there was an error processing your request') || lower.includes('please try again later')) {
    return "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details.";
  }
  return normalized;
};

const compactWhatsAppReply = (text) => {
  const normalized = String(text || '').trim();
  if (!normalized) return normalized;
  const maxChars = parseInt(process.env.WHATSAPP_MAX_REPLY_CHARS || '420', 10);
  if (normalized.length <= maxChars) return normalized;
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  let shortened = sentences.slice(0, 2).join(' ').trim();
  if (!shortened || shortened.length < 80) {
    shortened = normalized.slice(0, maxChars).trim();
  }
  if (shortened.length > maxChars) {
    shortened = shortened.slice(0, maxChars).trim();
  }
  return `${shortened}…`;
};

const HANDOFF_KEY_PREFIX = 'whatsapp:handoff:';
const HANDOFF_TTL_SECONDS = parseInt(process.env.WHATSAPP_HANDOFF_TTL || '86400', 10);
const WHATSAPP_ROOM_ID = 'whatsapp_general';

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
 * Clear handoff state - returns conversation to bot
 */
const clearHandoffState = async (phoneNumber) => {
  if (!phoneNumber) return false;
  await cache.del(getHandoffKey(phoneNumber));
  logger.info('🤖 Handoff cleared - conversation returned to bot', { phoneNumber });
  return true;
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
    /need\s*(a\s*)?(doctor\s*)?consultation/i,
    /doctor\s*consultation/i,
    /can\s*(you\s*)?book\s*(me\s*)?(an?\s*)?appointment/i,
    /yes\s*(please\s*)?(book|schedule)/i,
    /book\s*now/i,
    /yes\s*i\s*want\s*(to\s*)?(book|see)/i,
    /health\s*checkup/i,
    /health\s*check\s*up/i,
    /corporate\s*health/i,
    /full\s*body\s*check/i,
    /diagnostic\s*(test|check)/i,
    /lab\s*(test|checkup|check\s*up)/i
  ];
  
  const isBookingIntent = bookingPatterns.some(pattern => pattern.test(lowerMsg));
  const isHealthCheckupIntent = /(health\s*checkup|health\s*check\s*up|corporate\s*health|full\s*body\s*check|diagnostic\s*(test|check)|lab\s*(test|checkup|check\s*up)|master\s*health)/i.test(lowerMsg);
  
  // Try to detect specialist type
  let specialistType = 'general_physician';
  if (/\b(gastro|stomach|digestive|abdomen)\b/i.test(lowerMsg)) specialistType = 'gastroenterologist';
  else if (/\b(heart|cardio|chest\s*pain)\b/i.test(lowerMsg)) specialistType = 'cardiologist';
  else if (/\b(skin|derma|rash)\b/i.test(lowerMsg)) specialistType = 'dermatologist';
  else if (/\b(child|baby|infant|pediatric)\b/i.test(lowerMsg)) specialistType = 'pediatrician';
  else if (/\b(bone|orthop|joint|fracture)\b/i.test(lowerMsg)) specialistType = 'orthopedic';
  else if (/\b(eye|vision|ophthalm)\b/i.test(lowerMsg)) specialistType = 'ophthalmologist';
  else if (/\b(ent|ear|nose|throat)\b/i.test(lowerMsg)) specialistType = 'ent';
  else if (/\b(neuro|brain|headache)\b/i.test(lowerMsg)) specialistType = 'neurologist';
  else if (/\b(gynec|women|pregnancy)\b/i.test(lowerMsg)) specialistType = 'gynecologist';
  else if (/\b(general|physician|gp)\b/i.test(lowerMsg)) specialistType = 'general_physician';
  
  return {
    isBookingIntent,
    specialistType,
    bookingType: isHealthCheckupIntent ? 'health_checkup' : 'doctor_appointment'
  };
};

// Configuration for AI auto-reply - unified Dr. iSHA
const AI_AUTO_REPLY_ENABLED = process.env.WHATSAPP_AI_AUTO_REPLY === 'true' || false;
const USE_SIB_BRAIN = process.env.USE_SIB_BRAIN !== 'false'; // Default true

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
 * Resolve/end handoff - returns conversation to bot
 * Agents use this when done assisting a customer
 */
router.post('/conversations/:phoneNumber/resolve', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { resolution = 'resolved', notes = '' } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    // Get current handoff state for logging
    const currentState = await getHandoffState(phoneNumber);
    
    // Clear handoff state
    await clearHandoffState(phoneNumber);
    
    // Log resolution
    logger.info('✅ Handoff resolved - conversation returned to bot', {
      phoneNumber,
      resolution,
      notes,
      previousState: currentState
    });
    
    // Notify RocketChat
    try {
      await rocketChatService.sendMessage(
        'GENERAL',
        `✅ *HANDOFF RESOLVED*\n📱 Customer: +${phoneNumber}\n📋 Resolution: ${resolution}\n${notes ? `📝 Notes: ${notes}\n` : ''}🤖 *Bot is now active* for this conversation\n⏰ Time: ${new Date().toLocaleString()}`
      );
    } catch (rcError) {
      logger.error('Failed to notify RocketChat about resolution:', rcError.message);
    }
    
    // Optionally send confirmation to customer
    if (req.body.notifyCustomer) {
      const whatsappService = (await import('../services/whatsapp-production.service.js')).default;
      await whatsappService.sendSessionMessage({
        to: phoneNumber,
        body: "Thank you for chatting with our team! If you have any more questions, I'm here to help. 💙 - Dr. iSHA"
      });
    }
    
    res.json({
      success: true,
      message: 'Handoff resolved - conversation returned to bot',
      data: {
        phoneNumber,
        resolution,
        resolvedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error resolving handoff:', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get handoff status for a phone number
 */
router.get('/conversations/:phoneNumber/handoff-status', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    
    const handoffState = await getHandoffState(phoneNumber);
    
    res.json({
      success: true,
      data: {
        phoneNumber,
        isHandoffActive: !!handoffState?.active,
        handoffState: handoffState || null
      }
    });
  } catch (error) {
    logger.error('Error getting handoff status:', { error: error.message });
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
    
    logger.info('[ai-respond] Processing message:', { message: message.substring(0, 50), phoneNumber });
    
    const aiResponse = await unifiedConversationService.processMessage({
      message,
      channel: 'whatsapp',
      sessionId: `whatsapp:${phoneNumber}`,
      identifier: phoneNumber,
      userContext: { phoneNumber }
    });
    
    // Debug: Log all response keys and handoff fields
    logger.info('[ai-respond] Response received:', {
      keys: Object.keys(aiResponse),
      handoffRequired: aiResponse.handoffRequired,
      handoffDepartment: aiResponse.handoffDepartment,
      handoffReason: aiResponse.handoffReason,
      handoffSuggested: aiResponse.handoffSuggested,
      provider: aiResponse.provider
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
      
      await messages.push(WHATSAPP_ROOM_ID, aiMessageObj);
      
      if (global.io) {
        global.io.to(WHATSAPP_ROOM_ID).emit('new_message', aiMessageObj);
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
 * This is for testing - returns messages stored in the WhatsApp room
 */
router.get('/team-inbox', async (req, res) => {
  try {
    const { chatRooms, messages } = await import('../utils/chatStorage.js');
    const room = await chatRooms.get(WHATSAPP_ROOM_ID);
    const roomMessages = await messages.get(WHATSAPP_ROOM_ID) || [];
    
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
 * 
 * ⚠️ PRODUCTION: Twilio POSTs here WITHOUT auth headers
 * This endpoint must be fully public (no JWT required)
 */
router.post('/webhook', (req, res, next) => {
  // Bypass any auth middleware for Twilio webhooks
  console.log('🔓 [WhatsApp Webhook] Setting skipAuth=true');
  req.skipAuth = true;
  req.user = { id: 'twilio-webhook', role: 'webhook' };
  req.userRole = 'webhook';
  console.log('✅ [WhatsApp Webhook] Auth bypass set, calling next()');
  next();
}, async (req, res) => {
  try {
    console.log('📱 [WhatsApp Webhook] Handler called, req.skipAuth=', req.skipAuth);
    const { From, Body, MessageSid, ProfileName, MediaUrl0, MediaContentType0 } = req.body;
    
    // Extract phone number (remove whatsapp: prefix and trim)
    const phoneNumber = (From?.replace('whatsapp:', '') || '').trim();
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
    
    // Send WhatsApp messages to the WhatsApp room
    if (!(await chatRooms.has(WHATSAPP_ROOM_ID))) {
      await chatRooms.set(WHATSAPP_ROOM_ID, {
        id: WHATSAPP_ROOM_ID,
        type: 'whatsapp_customer',
        participants: [],
        createdAt: new Date().toISOString(),
        title: 'WhatsApp Customers',
        description: 'Incoming messages from WhatsApp customers'
      });
      await messages.set(WHATSAPP_ROOM_ID, []);
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
    await messages.push(WHATSAPP_ROOM_ID, messageObj);
    const currentMessages = await messages.get(WHATSAPP_ROOM_ID) || [];
    
    logger.info('✅ WhatsApp message added to WhatsApp room (Redis)', {
      roomId: WHATSAPP_ROOM_ID,
      messageId: MessageSid,
      from: userContext.isKnownUser ? userContext.user.name : customerName,
      isKnownUser: userContext.isKnownUser,
      messageCount: currentMessages.length
    });
    
    // Post incoming WhatsApp message to RocketChat #general
    // Try using rocketChatService first (more reliable)
    const rcMessage = `📱 **WhatsApp Message from ${userContext.isKnownUser ? userContext.user.name + ' (Patient ID: ' + userContext.user.id + ')' : customerName}** (${phoneNumber})\n\n${Body || '[Media Message]'}`;
    
    rocketChatService.sendMessage('GENERAL', rcMessage).then(() => {
      logger.info('✅ WhatsApp message posted to RocketChat #general via rocketChatService');
    }).catch(rcError => {
      logger.error('⚠️ rocketChatService failed, trying omnichannelChatService:', rcError.message);
      // Fallback to omnichannel service
      omnichannelChatService.sendToRocketChatWebhook({
        from: phoneNumber,
        text: Body || '[Media Message]',
        userName: userContext.isKnownUser 
          ? `${userContext.user.name} (Patient ID: ${userContext.user.id})` 
          : customerName,
        timestamp: new Date().toISOString()
      }).then(() => {
        logger.info('✅ WhatsApp message posted to RocketChat #general via omnichannel');
      }).catch(omnichannelError => {
        logger.error('❌ Failed to post to RocketChat via both methods:', omnichannelError.message);
      });
    });
    
    // Emit Socket.IO event to notify team members (if Socket.IO is available)
    if (global.io) {
      global.io.to(WHATSAPP_ROOM_ID).emit('new_message', messageObj);
      
      // Also emit user context update for real-time dashboard
      global.io.to(WHATSAPP_ROOM_ID).emit('user_context', {
        phoneNumber,
        ...userContext,
        timestamp: new Date().toISOString()
      });
      
      logger.info('🔔 Socket.IO notification sent to WhatsApp room');
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
    const { isBookingIntent, specialistType, bookingType } = detectBookingIntent(Body);
    if (isBookingIntent && userContext.isKnownUser) {
      logger.info('📅 Appointment booking intent detected via WhatsApp', {
        phoneNumber,
        specialistType,
        bookingType,
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
          bookingType,
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

${bookingType === 'health_checkup'
  ? "I'm processing your request for a health checkup at the nearest available lab."
  : `I'm processing your request to see a ${specialistNames[specialistType] || 'Doctor'}.`}

${n8nResult.success 
  ? (bookingType === 'health_checkup'
    ? `✅ Our team will contact you shortly to confirm your health checkup slot.\n\n📱 You'll receive a confirmation message with:\n• Lab name & location\n• Date & time options\n• Package/fee details`
    : `✅ Our team will contact you shortly to confirm your appointment slot.\n\n📱 You'll receive a confirmation message with:\n• Doctor's name\n• Date & time options\n• Consultation fee`)
  : (bookingType === 'health_checkup'
    ? `🔄 I'm connecting you with our checkup booking team. They'll call you within 15 minutes to schedule your lab visit.`
    : `🔄 I'm connecting you with our booking team. They'll call you within 15 minutes to schedule your appointment.`)}

Is there anything else I can help you with? 💙`
        });
        
        return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      } catch (error) {
        logger.error('Appointment booking error:', error.message);
        // Continue to AI processing if n8n fails
      }
    }

    // 4. SERVICE REQUEST AUTO-TICKET
    // Detects cancellation / reschedule / report / consultation etc. and raises a ticket
    if (!isBookingIntent && Body) {
      try {
        const serviceIntent = detectServiceIntent(Body);
        if (serviceIntent) {
          createAutoTicket({
            source: 'whatsapp',
            requester: {
              name: customerName || userContext.user?.name || '',
              phone: phoneNumber,
              email: userContext.user?.email || '',
            },
            intentLabel: serviceIntent.label,
            category: serviceIntent.category,
            priority: serviceIntent.priority,
            description: Body,
            tags: userContext.isKnownUser ? ['known-customer'] : ['unknown-customer'],
          }).then(() => {
            logger.info(`[autoTicket/WA] Ticket raised for ${serviceIntent.label} | ${phoneNumber}`);
          }).catch(e => logger.error('[autoTicket/WA]', e.message));

          // Acknowledge customer on WhatsApp
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: `🎫 ${serviceIntent.replyHint}\n\n_A support ticket has been created. Our team will be in touch shortly._`,
          });

          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }
      } catch (atErr) {
        logger.error('[autoTicket/WA] Error:', atErr.message);
      }
    }

    // 5. OPTIONAL: AI AUTO-REPLY (only if enabled)
    // Routes through SIB Brain for deep reasoning with user context
    if (AI_AUTO_REPLY_ENABLED && Body && !MediaUrl0) {
      let responseSent = false;
      try {
        // REMOVED hardcoded greeting and status query handlers
        // Let the AI handle ALL messages with full user context from database
        // This allows Dr. iSHA to check appointments, prescriptions, etc. from DB
        
        // Helper: Get time-based greeting
        const getTimeBasedGreeting = () => {
          const hour = new Date().getHours();
          if (hour < 12) return 'Good morning';
          if (hour < 17) return 'Good afternoon';
          return 'Good evening';
        };

        // Simple greeting gets fast response for all users
        const isSimpleGreeting = /^(hi|hello|hey|namaste|vanakkam)$/i.test(Body.trim());
        if (isSimpleGreeting) {
          const timeGreeting = getTimeBasedGreeting();
          const greetingResponse = userContext.isKnownUser && userContext.user?.name
            ? `${timeGreeting} ${userContext.user.name}! 👋 How can I help you today?`
            : `${timeGreeting}! I'm Dr. iSHA. How can I help you today?`;
          
          logger.info('✅ Using STATIC greeting response', { response: greetingResponse });
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply(greetingResponse)
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        // Thank you / appreciation response
        const isThanks = /(^|\b)(thanks?|thank\s*you|thanku|thnx|appreciate|grateful)($|\b)/i.test(Body.trim());
        const isGoodbye = /(^|\b)(bye|goodbye|good\s*bye|see\s*you|take\s*care|gotta\s*go|gtg)($|\b)/i.test(Body.trim());

        if (isThanks && isGoodbye) {
          const combinedResponse = userContext.isKnownUser && userContext.user?.name
            ? `You're welcome, ${userContext.user.name}. Take care and feel free to message me anytime you need help. 💙`
            : "You're welcome. Take care and feel free to message me anytime you need help. 💙";
          logger.info('✅ Using STATIC thanks+goodbye response', { response: combinedResponse });
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply(combinedResponse)
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        if (isThanks) {
          const thanksResponse = "You're welcome! Happy to help. Is there anything else I can assist you with?";
          logger.info('✅ Using STATIC thanks response', { response: thanksResponse });
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply(thanksResponse)
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        // Goodbye response
        if (isGoodbye) {
          const goodbyeResponse = userContext.isKnownUser && userContext.user?.name
            ? `Take care, ${userContext.user.name}! Feel free to reach out anytime you need health assistance. Stay healthy! 💙`
            : "Take care! Feel free to reach out anytime you need health assistance. Stay healthy! 💙";
          logger.info('✅ Using STATIC goodbye response', { response: goodbyeResponse });
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply(goodbyeResponse)
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        // ALL other messages (including appointment status, medical queries, etc.)
        // go through SIB FastAPI directly for faster responses

        logger.info(`🧠 Processing via SIB FastAPI`, {
          phoneNumber,
          messageLength: Body.length
        });
        
        const startTime = Date.now();
        
        // Call SIB FastAPI directly with 5-second timeout
        const aiResponse = await Promise.race([
          axios.post(`${SIB_URL}/chat`, {
            message: Body,
            phone_number: phoneNumber,
            session_id: `whatsapp:${phoneNumber}`,
            patient_id: String(userContext.user?.id || `whatsapp_${phoneNumber}`),
            user_context: {
              is_known_user: userContext.isKnownUser,
              patient_id: userContext.user?.id,
              patient_name: userContext.user?.name,
              phone_number: phoneNumber,
              profile_name: ProfileName,
              appointments: userContext.appointments,
              prescriptions: userContext.prescriptions
            }
          }, {
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' }
          }).then(response => {
            const duration = Date.now() - startTime;
            logger.info(`✅ SIB response received in ${duration}ms`);
            // chat_answer can be a string or [string, array] tuple
            let answer = response.data.chat_answer || response.data.response || response.data.message;
            if (Array.isArray(answer)) answer = answer[0] || answer;
            return {
              shouldReply: true,
              response: String(answer || ''),
              provider: response.data.provider || 'sib-fastapi',
              sessionId: `whatsapp:${phoneNumber}`,
              isEmergency: response.data.is_emergency || false
            };
          }).catch(error => {
            logger.error('SIB FastAPI error:', {
              message: error.message,
              status: error.response?.status,
              data: error.response?.data,
              code: error.code
            });
            return {
              shouldReply: true,
              response: "I'm here to help with appointments, health checkups, reports, and prescriptions. Tell me what you'd like to do.",
              provider: 'fallback'
            };
          }),
          new Promise(resolve => setTimeout(() => resolve(null), 5000)) // Match axios timeout
        ]);
        const rawResponseText = String(aiResponse?.response || '').trim();
        const compactResponseText = compactWhatsAppReply(rawResponseText);
        const normalizedResponseText = rawResponseText.toLowerCase();
        const isGenericErrorReply = normalizedResponseText.includes('there was an error processing your request');
        
        if (!aiResponse) {
          await whatsappProductionService.sendSessionMessage({
            to: phoneNumber,
            body: sanitizeReply("I couldn't fetch a full response just now. Please retry in a few seconds, or tell me if you want help with appointment booking, health checkup, prescription, or reports.")
          });
          responseSent = true;
          return res.type('text/xml').status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        }

        if (aiResponse.shouldReply) {
          const replyText = compactResponseText
            ? (isGenericErrorReply
              ? "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details."
              : compactResponseText)
            : "I'm here to help with appointments, health checkups, reports, and prescriptions. Tell me what you'd like to do.";
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
          
          await messages.push(WHATSAPP_ROOM_ID, aiMessageObj);
          
          if (global.io) {
            global.io.to(WHATSAPP_ROOM_ID).emit('new_message', aiMessageObj);
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
          
          // Auto-trigger handoff if explicitly requested by user
          if (aiResponse.handoffRequired) {
            const department = aiResponse.handoffDepartment || 'general';
            const reason = aiResponse.handoffReason || 'user_requested';
            
            await setHandoffState(phoneNumber, {
              reason: reason,
              department: department,
              source: 'auto_escalation',
              triggerMessage: Body
            });
            
            // Notify RocketChat about the escalation
            try {
              await rocketChatService.sendMessage(
                'GENERAL',
                `🚨 *HUMAN HANDOFF ACTIVATED*\n👤 Customer: ${customerName} (+${phoneNumber})\n${userContext.isKnownUser ? `🆔 Patient: ${userContext.user.name}\n` : ''}📋 Department: ${department}\n📝 Reason: ${reason}\n💬 Trigger: "${Body}"\n⏰ Time: ${new Date().toLocaleString()}\n\n⚡ *Bot responses paused* - Human agent please respond`
              );
              logger.info('🚨 Human handoff activated', { phoneNumber, department, reason });
            } catch (rcError) {
              logger.error('Failed to notify RocketChat about handoff:', rcError.message);
            }
          }
          
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
