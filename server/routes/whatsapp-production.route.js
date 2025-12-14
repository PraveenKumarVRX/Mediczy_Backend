import express from 'express';
import whatsappProductionService from '../services/whatsapp-production.service.js';

const router = express.Router();

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
 * Webhook for incoming WhatsApp messages
 */
router.post('/webhook', (req, res) => {
  try {
    const { From, Body, MessageSid, ProfileName } = req.body;
    
    console.log('Incoming WhatsApp message:', {
      from: From,
      body: Body,
      messageSid: MessageSid,
      profileName: ProfileName
    });
    
    // Handle incoming message (implement your logic here)
    // - Store in database
    // - Trigger auto-reply
    // - Route to appropriate handler
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * Webhook verification (for Twilio setup)
 */
router.get('/webhook', (req, res) => {
  res.status(200).send('Webhook endpoint is active');
});

export default router;
