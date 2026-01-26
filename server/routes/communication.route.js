/**
 * Shared Communication Routes
 * Provides Email, SMS, WhatsApp endpoints for different user types
 * Supports: hospital, tpa, broker, insurance company
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { SMSService } from '../services/sms.service.js';
import twilio from 'twilio';
import emailService from '../services/emailService.js';
import CommunicationLog from '../models/postgres/communication-log.model.postgres.js';

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

export default router;
