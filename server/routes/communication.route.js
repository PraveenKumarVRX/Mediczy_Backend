/**
 * Shared Communication Routes
 * Provides Email, SMS, WhatsApp endpoints for different user types
 * Supports: hospital, tpa, broker, insurance company
 * 
 * Omnichannel AI Conversation:
 * - Unified Dr. iSHA brain for all channels (web, WhatsApp, admin chat)
 * - Multilingual support with LaBSE (109 languages) and IndicTrans2 (22 Indian languages)
 * - Intent classification with conversation state management
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { SMSService } from '../services/sms.service.js';
import twilio from 'twilio';
import emailService from '../services/emailService.js';
import CommunicationLog from '../models/postgres/communication-log.model.postgres.js';
import unifiedConversationService from '../services/unified-conversation.service.js';

const router = express.Router();

// Initialize services
const smsService = new SMSService({
  provider: process.env.SMS_PROVIDER || 'twilio',
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER
});

// Initialize Twilio for WhatsApp
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio WhatsApp client initialized for communication module');
}

/**
 * Get communication stats for the user
 */
router.get('/stats', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const organizationId = req.user.organizationId;

    // Fetch stats from communication logs
    const logs = await CommunicationLog.findAll({
      where: {
        ...(organizationId && { organizationId }),
        ...(userId && { createdBy: userId })
      },
      attributes: ['type', 'status'],
      raw: true
    });

    const stats = {
      email: {
        sent: logs.filter(l => l.type === 'email').length,
        delivered: logs.filter(l => l.type === 'email' && l.status === 'delivered').length,
        failed: logs.filter(l => l.type === 'email' && l.status === 'failed').length
      },
      sms: {
        sent: logs.filter(l => l.type === 'sms').length,
        delivered: logs.filter(l => l.type === 'sms' && l.status === 'delivered').length,
        failed: logs.filter(l => l.type === 'sms' && l.status === 'failed').length
      },
      whatsapp: {
        sent: logs.filter(l => l.type === 'whatsapp').length,
        delivered: logs.filter(l => l.type === 'whatsapp' && l.status === 'delivered').length,
        read: logs.filter(l => l.type === 'whatsapp' && l.status === 'read').length,
        failed: logs.filter(l => l.type === 'whatsapp' && l.status === 'failed').length
      }
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching communication stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
});

/**
 * Send Email
 */
router.post('/email/send', authUser, async (req, res) => {
  try {
    const { to, subject, body, userId, organizationId } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Send email
    const result = await emailService.sendEmail({
      to,
      subject,
      html: body,
      from: process.env.EMAIL_FROM || 'noreply@mediczy.com'
    });

    // Log the communication
    await CommunicationLog.create({
      type: 'email',
      recipient: to,
      subject,
      body,
      status: 'sent',
      createdBy: req.user.id,
      organizationId: req.user.organizationId || organizationId,
      metadata: { messageId: result.messageId }
    });

    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    
    // Log failed attempt
    try {
      await CommunicationLog.create({
        type: 'email',
        recipient: req.body.to,
        subject: req.body.subject,
        body: req.body.body,
        status: 'failed',
        createdBy: req.user.id,
        organizationId: req.user.organizationId,
        metadata: { error: error.message }
      });
    } catch (logError) {
      console.error('Failed to log communication:', logError);
    }

    res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
  }
});

/**
 * Send SMS
 */
router.post('/sms/send', authUser, async (req, res) => {
  try {
    const { phone, message, userId, organizationId } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone number and message are required' });
    }

    // Send SMS via service
    const result = await smsService.sendSMS({
      phone,
      message,
      provider: 'twilio'
    });

    // Log the communication
    await CommunicationLog.create({
      type: 'sms',
      recipient: phone,
      body: message,
      status: result.status || 'sent',
      createdBy: req.user.id,
      organizationId: req.user.organizationId || organizationId,
      metadata: { 
        messageSid: result.sid,
        provider: 'twilio'
      }
    });

    res.json({ 
      success: true, 
      message: 'SMS sent successfully',
      messageSid: result.sid
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    
    // Log failed attempt
    try {
      await CommunicationLog.create({
        type: 'sms',
        recipient: req.body.phone,
        body: req.body.message,
        status: 'failed',
        createdBy: req.user.id,
        organizationId: req.user.organizationId,
        metadata: { error: error.message }
      });
    } catch (logError) {
      console.error('Failed to log communication:', logError);
    }

    res.status(500).json({ success: false, message: 'Failed to send SMS', error: error.message });
  }
});

/**
 * Send WhatsApp Message
 */
router.post('/whatsapp/send', authUser, async (req, res) => {
  try {
    const { phone, message, template, userId, organizationId } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone number and message are required' });
    }

    if (!twilioClient) {
      return res.status(500).json({ success: false, message: 'WhatsApp service not configured' });
    }

    const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;
    if (!whatsappFrom) {
      return res.status(500).json({ success: false, message: 'WhatsApp number not configured' });
    }

    // Format phone number
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    const normalizedMessage = String(message || '').trim();
    const lowerMessage = normalizedMessage.toLowerCase();
    const safeMessage = lowerMessage.includes('error processing your request') || lowerMessage.includes('please try again later') || !normalizedMessage
      ? "I'm sorry, I'm having trouble processing your request right now. Please try again in a few minutes or reply with more details."
      : normalizedMessage;

    console.info('WhatsApp communication.send trace', {
      to: formattedPhone,
      snippet: safeMessage.slice(0, 120),
      stack: new Error().stack?.split('\n').slice(1, 6).map(line => line.trim())
    });

    let result;
    
    // If template is specified, use template-based sending
    if (template) {
      // Use the approved OTP template or other templates
      const templateSid = template === 'otp' 
        ? 'HX33ae0014bd63fad4404789d2373b6174' 
        : null;

      if (templateSid) {
        result = await twilioClient.messages.create({
          from: whatsappFrom,
          to: `whatsapp:${formattedPhone}`,
          contentSid: templateSid,
          contentVariables: JSON.stringify({ 1: safeMessage })
        });
      } else {
        // Free-form message
        result = await twilioClient.messages.create({
          from: whatsappFrom,
          to: `whatsapp:${formattedPhone}`,
          body: safeMessage
        });
      }
    } else {
      // Free-form message
      result = await twilioClient.messages.create({
        from: whatsappFrom,
        to: `whatsapp:${formattedPhone}`,
        body: safeMessage
      });
    }

    // Log the communication
    await CommunicationLog.create({
      type: 'whatsapp',
      recipient: phone,
      body: safeMessage,
      status: result.status || 'sent',
      createdBy: req.user.id,
      organizationId: req.user.organizationId || organizationId,
      metadata: { 
        messageSid: result.sid,
        template: template || null,
        provider: 'twilio'
      }
    });

    res.json({ 
      success: true, 
      message: 'WhatsApp message sent successfully',
      messageSid: result.sid
    });
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    
    // Log failed attempt
    try {
      await CommunicationLog.create({
        type: 'whatsapp',
        recipient: req.body.phone,
        body: req.body.message,
        status: 'failed',
        createdBy: req.user.id,
        organizationId: req.user.organizationId,
        metadata: { error: error.message }
      });
    } catch (logError) {
      console.error('Failed to log communication:', logError);
    }

    res.status(500).json({ success: false, message: 'Failed to send WhatsApp message', error: error.message });
  }
});

/**
 * Get recent messages
 */
router.get('/recent', authUser, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.user.id;
    const organizationId = req.user.organizationId;

    const messages = await CommunicationLog.findAll({
      where: {
        ...(organizationId && { organizationId }),
        ...(userId && { createdBy: userId })
      },
      order: [['createdAt', 'DESC']],
      limit,
      attributes: ['id', 'type', 'recipient', 'status', 'createdAt', 'subject']
    });

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching recent messages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages', error: error.message });
  }
});

/**
 * Omnichannel AI Chat
 * Unified Dr. iSHA conversation endpoint for all channels
 * 
 * Features:
 * - Multilingual support (109 languages via LaBSE, 22 Indian languages via IndicTrans2)
 * - Time-based greetings (Good morning/afternoon/evening)
 * - Intent classification with Redis-based conversation state
 * - Human handoff detection and routing
 * - Patient context integration (appointments, prescriptions, allergies, etc.)
 * - Prescription guardrails (Dr. iSHA cannot prescribe medications)
 * 
 * Request Body:
 * {
 *   message: string (required) - User's message
 *   channel: string (optional) - 'web' | 'whatsapp' | 'admin' | 'support' (default: 'web')
 *   language: string (optional) - ISO 639-1 code (auto-detected if not provided)
 *   sessionId: string (optional) - Conversation session ID (auto-generated if not provided)
 *   conversationId: string (optional) - Alternative to sessionId
 *   identifier: string (optional) - User identifier (phone, email, userId)
 *   userContext: object (optional) - Patient data for personalized responses
 *     {
 *       userId: number,
 *       user: { id, name, email, phone },
 *       profile: { dateOfBirth, gender, bloodGroup },
 *       demographics: { age, city, state },
 *       appointments: [...],
 *       prescriptions: [...],
 *       conditions: [...],
 *       activeMedications: [...],
 *       allergies: [...],
 *       conversationHistory: [...],
 *       summary: string
 *     }
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   shouldReply: boolean,
 *   response: string - Dr. iSHA's response (translated to user's language)
 *   sessionId: string,
 *   language: string - Detected/provided language code
 *   channel: string,
 *   provider: string - 'unified' | 'unified-local' | 'unified-intent' | 'unified-fallback'
 *   intent: string (optional) - Classified intent name
 *   translation: object (optional) - Translation metadata
 *   handoffSuggested: boolean (optional) - True if human handoff is recommended
 *   handoffRequired: boolean (optional) - True if user explicitly requested human agent
 *   handoffDepartment: string (optional) - Suggested department (billing, pharmacy, appointments, etc.)
 *   handoffReason: string (optional) - Reason for handoff (user_requested, low_confidence, complex_query, etc.)
 * }
 * 
 * Examples:
 * 
 * 1. Simple greeting:
 *    POST /api/communication/chat
 *    { "message": "Hi", "channel": "web" }
 *    Response: { "response": "Good morning! I'm Dr. iSHA. How can I help you today?", ... }
 * 
 * 2. Multilingual greeting (Tamil):
 *    POST /api/communication/chat
 *    { "message": "வணக்கம்", "channel": "whatsapp" }
 *    Response: { "response": "வணக்கம்! நான் Dr. iSHA. இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?", "language": "ta", ... }
 * 
 * 3. Medical query with context:
 *    POST /api/communication/chat
 *    {
 *      "message": "What are my upcoming appointments?",
 *      "channel": "web",
 *      "userContext": {
 *        "userId": 123,
 *        "user": { "name": "Senthilkumar" },
 *        "appointments": [{ "date": "2026-02-15", "doctor": "Dr. Sharma", "type": "Cardiology" }]
 *      }
 *    }
 *    Response: { "response": "Hi Senthilkumar! You have an appointment with Dr. Sharma for Cardiology on February 15, 2026.", ... }
 * 
 * 4. Human handoff request:
 *    POST /api/communication/chat
 *    { "message": "I need to talk to a human agent", "channel": "support" }
 *    Response: {
 *      "response": "✅ I'm connecting you to a human agent now. Someone from our team will assist you shortly.",
 *      "handoffRequired": true,
 *      "handoffDepartment": "general",
 *      "handoffReason": "user_requested",
 *      ...
 *    }
 */
router.post('/chat', authUser, async (req, res) => {
  try {
    const {
      message,
      channel = 'web',
      language,
      sessionId,
      conversationId,
      identifier,
      userContext = {}
    } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Message is required and must be a string'
      });
    }

    // Enhance userContext with authenticated user info
    const enhancedContext = {
      ...userContext,
      userId: userContext.userId || req.user.id,
      organizationId: userContext.organizationId || req.user.organizationId,
      user: userContext.user || {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone
      }
    };

    // Process message through unified conversation service
    // This handles:
    // - Multilingual greeting detection and response
    // - Language detection via LaBSE
    // - Translation (input → English → AI → source language)
    // - Intent classification with conversation state
    // - AI routing to SIB FastAPI
    // - Prescription guardrails
    // - Human handoff detection
    const result = await unifiedConversationService.processMessage({
      message,
      channel,
      userContext: enhancedContext,
      sessionId: sessionId || conversationId,
      language,
      identifier: identifier || req.user.email || req.user.phone || req.user.id
    });

    // Log the conversation for analytics
    try {
      await CommunicationLog.create({
        type: 'chat',
        recipient: identifier || req.user.email || req.user.phone,
        body: message,
        status: result.success ? 'delivered' : 'failed',
        createdBy: req.user.id,
        organizationId: req.user.organizationId,
        metadata: {
          channel,
          language: result.language,
          sessionId: result.sessionId,
          provider: result.provider,
          intent: result.intent,
          handoffSuggested: result.handoffSuggested,
          handoffRequired: result.handoffRequired,
          handoffDepartment: result.handoffDepartment,
          responseLength: result.response?.length || 0
        }
      });
    } catch (logError) {
      console.error('[CommunicationRoute] Failed to log chat:', logError);
      // Don't fail the request if logging fails
    }

    // Return the AI response
    res.json(result);
  } catch (error) {
    console.error('[CommunicationRoute] Error in /chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat message',
      error: error.message
    });
  }
});

export default router;
