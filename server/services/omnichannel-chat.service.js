/**
 * Omnichannel Chat Service for Mediczy
 * Bridges WhatsApp, In-App Chat to RocketChat Omnichannel for support team
 * 
 * Architecture:
 * - Patients: WhatsApp / In-App Chat / Dr. iSHA
 * - Support Team: RocketChat Omnichannel Dashboard
 */

import axios from 'axios';
import crypto from 'crypto';
import { cache } from '../db/redis.js';

class OmnichannelChatService {
  constructor() {
    // RocketChat Configuration
    this.rocketChatUrl = process.env.ROCKETCHAT_URL || 'http://localhost:3100';
    this.rocketChatAdminUser = process.env.ROCKETCHAT_ADMIN_USER;
    this.rocketChatAdminPassword = process.env.ROCKETCHAT_ADMIN_PASSWORD;
    this.webhookSecret = process.env.ROCKETCHAT_WEBHOOK_SECRET || 'mediczy-webhook-secret';
    
    // Auth tokens (cached)
    this.authToken = null;
    this.userId = null;
    
    // Department mapping for routing
    this.departments = {
      general: 'General Support',
      billing: 'Billing & Payments',
      pharmacy: 'Pharmacy Orders',
      appointments: 'Appointments',
      emergency: 'Emergency Support',
      technical: 'Technical Support'
    };
  }

  /**
   * Initialize connection to RocketChat
   */
  async initialize() {
    try {
      const response = await axios.post(`${this.rocketChatUrl}/api/v1/login`, {
        user: this.rocketChatAdminUser,
        password: this.rocketChatAdminPassword
      });

      if (response.data.status === 'success') {
        this.authToken = response.data.data.authToken;
        this.userId = response.data.data.userId;
        console.log('✅ RocketChat Omnichannel connected');
        return true;
      }
    } catch (error) {
      console.error('❌ RocketChat connection failed:', error.message);
      return false;
    }
  }

  /**
   * Get auth headers for RocketChat API
   */
  getHeaders() {
    return {
      'X-Auth-Token': this.authToken,
      'X-User-Id': this.userId,
      'Content-Type': 'application/json'
    };
  }

  // ============================================================================
  // VISITOR/PATIENT MANAGEMENT
  // ============================================================================

  /**
   * Register or get a visitor (patient) in RocketChat Omnichannel
   * @param {Object} patient - Patient data from Mediczy
   */
  async registerVisitor(patient) {
    try {
      const visitorToken = this.generateVisitorToken(patient.id);
      
      const visitorData = {
        visitor: {
          token: visitorToken,
          name: `${patient.firstName} ${patient.lastName}`,
          email: patient.email,
          phone: patient.phoneNumber,
          customFields: [
            { key: 'mediczyPatientId', value: String(patient.id), overwrite: true },
            { key: 'uhid', value: patient.uhid || '', overwrite: true },
            { key: 'dateOfBirth', value: patient.dateOfBirth || '', overwrite: true },
            { key: 'gender', value: patient.gender || '', overwrite: true },
            { key: 'source', value: 'mediczy_app', overwrite: true }
          ]
        }
      };

      const response = await axios.post(
        `${this.rocketChatUrl}/api/v1/livechat/visitor`,
        visitorData,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        visitorToken,
        visitor: response.data.visitor
      };
    } catch (error) {
      console.error('Register visitor error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate consistent visitor token from patient ID
   */
  generateVisitorToken(patientId) {
    return crypto
      .createHash('sha256')
      .update(`mediczy-patient-${patientId}-${this.webhookSecret}`)
      .digest('hex')
      .substring(0, 32);
  }

  // ============================================================================
  // LIVECHAT ROOM MANAGEMENT
  // ============================================================================

  /**
   * Create or get existing chat room for patient
   * @param {string} visitorToken - Visitor token
   * @param {string} department - Department to route to
   * @param {string} initialMessage - Initial message from patient
   */
  async createOrGetRoom(visitorToken, department = 'general', initialMessage = null) {
    try {
      // First check for existing open room
      const existingRoom = await this.getOpenRoom(visitorToken);
      if (existingRoom) {
        return { success: true, room: existingRoom, isNew: false };
      }

      // Create new room
      const roomData = {
        token: visitorToken,
        department: this.departments[department] || this.departments.general
      };

      const response = await axios.get(
        `${this.rocketChatUrl}/api/v1/livechat/room`,
        { 
          params: roomData,
          headers: this.getHeaders() 
        }
      );

      const room = response.data.room;

      // Send initial message if provided
      if (initialMessage && room) {
        await this.sendMessage(room._id, visitorToken, initialMessage);
      }

      return { success: true, room, isNew: true };
    } catch (error) {
      console.error('Create room error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get open room for visitor
   */
  async getOpenRoom(visitorToken) {
    try {
      const response = await axios.get(
        `${this.rocketChatUrl}/api/v1/livechat/rooms`,
        {
          params: { token: visitorToken, open: true },
          headers: this.getHeaders()
        }
      );

      const rooms = response.data.rooms || [];
      return rooms.length > 0 ? rooms[0] : null;
    } catch (error) {
      return null;
    }
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  /**
   * Send message from patient to support
   * @param {string} roomId - RocketChat room ID
   * @param {string} visitorToken - Visitor token
   * @param {string} message - Message text
   * @param {Object} attachments - Optional attachments
   */
  async sendMessage(roomId, visitorToken, message, attachments = null) {
    try {
      const messageData = {
        token: visitorToken,
        rid: roomId,
        msg: message
      };

      // Add attachments if present (for prescriptions, reports, etc.)
      if (attachments) {
        messageData.attachments = attachments;
      }

      const response = await axios.post(
        `${this.rocketChatUrl}/api/v1/livechat/message`,
        messageData,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        message: response.data.message
      };
    } catch (error) {
      console.error('Send message error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get chat history for a room
   * @param {string} roomId - Room ID
   * @param {string} visitorToken - Visitor token
   * @param {number} limit - Number of messages
   */
  async getChatHistory(roomId, visitorToken, limit = 50) {
    try {
      const response = await axios.get(
        `${this.rocketChatUrl}/api/v1/livechat/messages.history/${roomId}`,
        {
          params: { token: visitorToken, limit },
          headers: this.getHeaders()
        }
      );

      return {
        success: true,
        messages: response.data.messages || []
      };
    } catch (error) {
      console.error('Get history error:', error.response?.data || error.message);
      return { success: false, messages: [], error: error.message };
    }
  }

  // ============================================================================
  // WHATSAPP BRIDGE
  // ============================================================================

  /**
   * Handle incoming WhatsApp message and forward to RocketChat
   * Called by your WhatsApp webhook handler
   * @param {Object} whatsappMessage - WhatsApp message data
   */
  async handleWhatsAppMessage(whatsappMessage) {
    try {
      const { from, body, mediaUrl, patientId, patient } = whatsappMessage;

      // Get or create visitor
      let visitorToken;
      if (patient) {
        const visitorResult = await this.registerVisitor(patient);
        visitorToken = visitorResult.visitorToken;
      } else {
        // Anonymous WhatsApp user
        visitorToken = this.generateVisitorToken(`whatsapp-${from}`);
        await this.registerVisitor({
          id: `whatsapp-${from}`,
          firstName: 'WhatsApp',
          lastName: 'User',
          phoneNumber: from
        });
      }

      // Get or create room
      const roomResult = await this.createOrGetRoom(visitorToken, 'general');
      if (!roomResult.success) {
        throw new Error(roomResult.error);
      }

      // Format message with WhatsApp indicator
      let formattedMessage = `📱 *WhatsApp*: ${body}`;
      
      // Handle media attachments
      let attachments = null;
      if (mediaUrl) {
        attachments = [{
          title: 'WhatsApp Attachment',
          image_url: mediaUrl
        }];
      }

      // Send to RocketChat
      const sendResult = await this.sendMessage(
        roomResult.room._id,
        visitorToken,
        formattedMessage,
        attachments
      );

      return {
        success: true,
        roomId: roomResult.room._id,
        messageId: sendResult.message?._id
      };
    } catch (error) {
      console.error('WhatsApp bridge error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message from RocketChat agent back to WhatsApp
   * Called by RocketChat webhook
   * @param {Object} webhookData - RocketChat webhook payload
   */
  async sendToWhatsApp(webhookData) {
    const { room, message } = webhookData;
    
    // Only process agent messages (not visitor messages)
    const isVisitorMessage = !!message?.token && (
      message?.u?.type === 'visitor'
      || message?.u?.roles?.includes('livechat-visitor')
      || message?.u?._id === room?.v?._id
      || message?.u?.username === room?.v?.username
      || message?.u?.name === room?.v?.name
    );
    if (isVisitorMessage) {
      return { success: true, skipped: true };
    }
    
    try {
      // Get visitor info to find WhatsApp number
      const visitor = room.v;
      const rawPhone = visitor?.phone?.[0]?.phoneNumber
        || visitor?.phone?.[0]?.value
        || visitor?.phoneNumber
        || visitor?.phone;

      if (!rawPhone) {
        console.log('No WhatsApp number for visitor');
        return { success: false, error: 'No WhatsApp number' };
      }

      const whatsappNumber = this.normalizeWhatsAppNumber(rawPhone);
      const messageText = message?.msg || '';

      // Prefer production Twilio session messaging for live replies.
      try {
        const whatsappProductionService = (await import('./whatsapp-production.service.js')).default;
        if (whatsappProductionService?.sendSessionMessage) {
          await whatsappProductionService.sendSessionMessage({
            to: whatsappNumber,
            body: messageText
          });
        } else {
          throw new Error('WhatsApp production service unavailable');
        }
      } catch (productionError) {
        // Fallback to the generic WhatsApp service when production is unavailable.
        const whatsappService = (await import('./whatsapp.service.js')).default;
        await whatsappService.sendMessage({
          to: whatsappNumber,
          content: messageText,
          type: 'text'
        });
      }

      await this.setHandoffState(whatsappNumber, {
        reason: 'agent_message',
        source: 'rocketchat'
      });

      return { success: true };
    } catch (error) {
      console.error('Send to WhatsApp error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Normalize phone number for WhatsApp providers.
   */
  normalizeWhatsAppNumber(phone) {
    if (!phone) return '';
    const trimmed = String(phone).trim().replace(/^whatsapp:/i, '');
    if (trimmed.startsWith('+')) return trimmed;

    const digits = trimmed.replace(/[^\d]/g, '');
    if (digits.length === 10) {
      const countryCode = process.env.DEFAULT_COUNTRY_CODE || '91';
      return `+${countryCode}${digits}`;
    }

    if (digits.length >= 11) {
      return `+${digits}`;
    }

    return digits;
  }

  async setHandoffState(phone, payload = {}) {
    const normalized = this.normalizeWhatsAppNumber(phone);
    if (!normalized) return null;
    const ttlSeconds = parseInt(process.env.WHATSAPP_HANDOFF_TTL || '86400', 10);
    const state = {
      active: true,
      updatedAt: new Date().toISOString(),
      ...payload
    };
    await cache.set(`whatsapp:handoff:${normalized}`, state, ttlSeconds);
    return state;
  }

  // ============================================================================
  // IN-APP CHAT BRIDGE
  // ============================================================================

  /**
   * Handle in-app chat message from patient
   * @param {Object} params - Message params
   */
  async handleInAppMessage({ patientId, patient, message, department, attachments }) {
    try {
      // Register visitor
      const visitorResult = await this.registerVisitor(patient);
      if (!visitorResult.success) {
        throw new Error('Failed to register visitor');
      }

      // Get or create room
      const roomResult = await this.createOrGetRoom(
        visitorResult.visitorToken,
        department || 'general'
      );
      if (!roomResult.success) {
        throw new Error(roomResult.error);
      }

      // Format message with in-app indicator
      const formattedMessage = `💬 *In-App*: ${message}`;

      // Send message
      const sendResult = await this.sendMessage(
        roomResult.room._id,
        visitorResult.visitorToken,
        formattedMessage,
        attachments
      );

      return {
        success: true,
        roomId: roomResult.room._id,
        visitorToken: visitorResult.visitorToken,
        messageId: sendResult.message?._id,
        isNewConversation: roomResult.isNew
      };
    } catch (error) {
      console.error('In-app message error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get in-app chat widget configuration for frontend
   */
  getWidgetConfig() {
    return {
      url: this.rocketChatUrl,
      livechatUrl: `${this.rocketChatUrl}/livechat`,
      departments: Object.entries(this.departments).map(([key, name]) => ({
        id: key,
        name
      }))
    };
  }

  // ============================================================================
  // DR. ISHA BOT INTEGRATION
  // ============================================================================

  /**
   * Forward message to Dr. iSHA bot and get response
   * Used when patient asks medical questions in support chat
   * @param {string} message - Patient message
   * @param {Object} context - Patient context
   */
  async forwardToDrIsha(message, context) {
    try {
      // Import unified conversation service
      const unifiedConversationService = (await import('./unified-conversation.service.js')).default;
      
      // Check if this is a medical query
      const isMedicalQuery = this.detectMedicalQuery(message);
      
      if (isMedicalQuery) {
        // Get Dr. iSHA response
        const response = await unifiedConversationService.processMessage({
          message,
          language: context.language || 'en',
          channel: 'support_chat',
          userContext: context
        });

        return {
          success: true,
          isMedicalQuery: true,
          response: response.response,
          shouldEscalate: response.shouldEscalate || false
        };
      }

      return {
        success: true,
        isMedicalQuery: false,
        shouldEscalate: true // Non-medical queries go to human support
      };
    } catch (error) {
      console.error('Dr. iSHA forward error:', error);
      return { success: false, error: error.message, shouldEscalate: true };
    }
  }

  /**
   * Detect if message is a medical query
   */
  detectMedicalQuery(message) {
    const medicalKeywords = [
      'symptom', 'pain', 'fever', 'medicine', 'medication', 'prescription',
      'doctor', 'appointment', 'health', 'sick', 'illness', 'treatment',
      'dose', 'dosage', 'side effect', 'allergy', 'blood pressure', 'diabetes',
      'headache', 'stomach', 'cough', 'cold', 'flu', 'infection',
      'दवा', 'बुखार', 'दर्द', 'डॉक्टर', 'इलाज' // Hindi keywords
    ];

    const lowerMessage = message.toLowerCase();
    return medicalKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  // ============================================================================
  // DEPARTMENT & ROUTING
  // ============================================================================

  /**
   * Auto-route conversation based on message content
   * @param {string} message - Patient message
   */
  detectDepartment(message) {
    const lowerMessage = message.toLowerCase();

    if (/bill|payment|refund|charge|invoice|price|cost/.test(lowerMessage)) {
      return 'billing';
    }
    if (/medicine|pharmacy|order|delivery|prescription/.test(lowerMessage)) {
      return 'pharmacy';
    }
    if (/appointment|schedule|book|cancel|reschedule|doctor|consultation/.test(lowerMessage)) {
      return 'appointments';
    }
    if (/emergency|urgent|critical|chest pain|breathing/.test(lowerMessage)) {
      return 'emergency';
    }
    if (/app|login|password|error|bug|not working|crash/.test(lowerMessage)) {
      return 'technical';
    }

    return 'general';
  }

  /**
   * Transfer conversation to different department
   */
  async transferToDepartment(roomId, visitorToken, department) {
    try {
      const response = await axios.post(
        `${this.rocketChatUrl}/api/v1/livechat/room.transfer`,
        {
          token: visitorToken,
          rid: roomId,
          department: this.departments[department]
        },
        { headers: this.getHeaders() }
      );

      return { success: true, room: response.data.room };
    } catch (error) {
      console.error('Transfer error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // AGENT/SUPPORT TEAM MANAGEMENT
  // ============================================================================

  /**
   * Get available agents for a department
   */
  async getAvailableAgents(department = null) {
    try {
      const params = department ? { department: this.departments[department] } : {};
      
      const response = await axios.get(
        `${this.rocketChatUrl}/api/v1/livechat/users/agent`,
        { params, headers: this.getHeaders() }
      );

      return {
        success: true,
        agents: response.data.users || []
      };
    } catch (error) {
      console.error('Get agents error:', error.response?.data || error.message);
      return { success: false, agents: [] };
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus() {
    try {
      const response = await axios.get(
        `${this.rocketChatUrl}/api/v1/livechat/queue`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        queue: response.data.queue || [],
        count: response.data.count || 0
      };
    } catch (error) {
      console.error('Queue status error:', error.response?.data || error.message);
      return { success: false, queue: [], count: 0 };
    }
  }

  // ============================================================================
  // CONVERSATION CLOSE & FEEDBACK
  // ============================================================================

  /**
   * Close conversation with optional feedback
   */
  async closeConversation(roomId, visitorToken, feedback = null) {
    try {
      // Send closing message
      if (feedback) {
        await this.sendMessage(roomId, visitorToken, `📝 Feedback: ${feedback.rating}/5 - ${feedback.comment || 'No comment'}`);
      }

      const response = await axios.post(
        `${this.rocketChatUrl}/api/v1/livechat/room.close`,
        {
          token: visitorToken,
          rid: roomId
        },
        { headers: this.getHeaders() }
      );

      return { success: true };
    } catch (error) {
      console.error('Close conversation error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get conversation transcript
   */
  async getTranscript(roomId, visitorToken) {
    try {
      const history = await this.getChatHistory(roomId, visitorToken, 1000);
      
      if (!history.success) {
        throw new Error(history.error);
      }

      // Format transcript
      const transcript = history.messages.map(msg => ({
        timestamp: msg.ts,
        sender: msg.u?.username || 'System',
        message: msg.msg,
        isAgent: !msg.token
      }));

      return {
        success: true,
        transcript,
        messageCount: transcript.length
      };
    } catch (error) {
      console.error('Get transcript error:', error);
      return { success: false, transcript: [] };
    }
  }
}

// Singleton instance
const omnichannelChatService = new OmnichannelChatService();

export default omnichannelChatService;
export { OmnichannelChatService };
