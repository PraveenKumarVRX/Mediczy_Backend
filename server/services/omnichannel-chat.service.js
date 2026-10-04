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
import whatsappBotService from './whatsapp-bot.service.js';

class OmnichannelChatService {
  constructor() {
    // RocketChat Configuration
    this.rocketChatUrl = process.env.ROCKETCHAT_INTERNAL_URL || process.env.ROCKETCHAT_URL || 'http://localhost:3100';
    this.rocketChatPublicUrl = process.env.ROCKETCHAT_PUBLIC_URL || 'https://smart-chat.live';
    this.rocketChatAdminUser = process.env.ROCKETCHAT_ADMIN_USER;
    this.rocketChatAdminPassword = process.env.ROCKETCHAT_ADMIN_PASSWORD;
    this.rocketChatUserId = process.env.ROCKETCHAT_USER_ID; // Admin user ID for API auth
    this.rocketChatAuthToken = process.env.ROCKETCHAT_AUTH_TOKEN; // Admin auth token for API
    this.webhookSecret = process.env.ROCKETCHAT_WEBHOOK_SECRET || 'mediczy-webhook-secret';
    this.incomingWebhookUrl = process.env.ROCKETCHAT_INCOMING_WEBHOOK_URL;
    
    // Auth tokens (cached)
    this.authToken = null;
    this.userId = null;
    
    // Webhook processing lock: prevents concurrent processing of same message
    // Key: dedup key, Value: Promise that resolves when processing completes
    this.webhookProcessingLocks = new Map();
    
    // Deduplication cache: tracks recently processed webhook messages (within 30 seconds)
    // Key: hash(messageId + tmid), Value: timestamp
    this.recentWebhookCalls = new Map();
    this.webhookDeduplicationWindow = 30000; // 30 seconds
    
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
      // RocketChat is optional and is not deployed here, so this fired on every connect attempt.
      // Reported once per process at warn level: absent-by-design is not an error, but a
      // RocketChat that is meant to be up and is not should still be visible.
      if (!OmnichannelChatService._connectWarningLogged) {
        OmnichannelChatService._connectWarningLogged = true;
        console.warn(`⚠️  RocketChat not reachable at ${this.rocketChatUrl} (${error.message}); omnichannel chat disabled. Further attempts will not be logged.`);
      }
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

  /**
   * Make an authenticated axios request, auto-reinitializing on 401
   */
  async apiRequest(method, url, data = null, params = null) {
    const doRequest = () => {
      const cfg = { method, url, headers: this.getHeaders() };
      if (data) cfg.data = data;
      if (params) cfg.params = params;
      return axios(cfg);
    };

    try {
      return await doRequest();
    } catch (error) {
      if (error.response?.status === 401) {
        console.warn('⚠️ RocketChat 401 – re-initializing and retrying');
        const ok = await this.initialize();
        if (ok) return doRequest();
      }
      throw error;
    }
  }

  // ============================================================================
  // VISITOR/PATIENT MANAGEMENT
  // ============================================================================

  /**
   * Register or get a visitor (patient) in RocketChat Omnichannel
   * @param {Object} patient - Patient data from Mediczy
   */
  async registerVisitor(patient) {
    const visitorToken = this.generateVisitorToken(patient.id);
    let visitorData = null;
    try {
      console.log(`   🔐 RocketChat Auth: Token=${this.authToken ? '✅' : '❌'}, UserId=${this.userId ? '✅' : '❌'}`);
      
      visitorData = {
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

      console.log(`   📤 Registering visitor in RocketChat...`);
      const response = await this.apiRequest(
        'post',
        `${this.rocketChatUrl}/api/v1/livechat/visitor`,
        visitorData
      );

      return {
        success: true,
        visitorToken,
        visitor: response.data.visitor
      };
    } catch (error) {
      console.error(`   ❌ Register visitor failed!`);
      console.error(`      Status: ${error.response?.status}`);
      console.error(`      Message: ${error.message}`);
      console.error(`      RocketChat Response:`, JSON.stringify(error.response?.data, null, 2));
      if (visitorData) {
        console.error(`      Request Data was:`, JSON.stringify(visitorData, null, 2));
      }
      return { success: false, visitorToken, error: error.message, details: error.response?.data };
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
      console.log(`   🔍 Checking for existing room (token: ${visitorToken.substring(0, 20)}...)`);
      const existingRoom = await this.getOpenRoom(visitorToken);
      if (existingRoom) {
        console.log(`   ✅ Found existing room: ${existingRoom._id}`);
        return { success: true, room: existingRoom, isNew: false };
      }

      // Create new room
      console.log(`   📝 Creating new room for department: ${department}`);
      const roomData = {
        token: visitorToken
      };

      const defaultDepartmentId = process.env.ROCKETCHAT_DEFAULT_DEPARTMENT_ID;
      if (defaultDepartmentId) {
        roomData.departmentId = defaultDepartmentId;
      }
      
      console.log(`   📤 Calling RocketChat GET /api/v1/livechat/room...`);
      console.log(`      Params:`, roomData);

      let response;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          response = await this.apiRequest(
            'get',
            `${this.rocketChatUrl}/api/v1/livechat/room`,
            null,
            roomData
          );
          break;
        } catch (error) {
          if (error.response?.status === 429 && attempt < 4) {
            const delayMs = 1000 * attempt;
            console.warn(`   ⚠️ Livechat rate limit (429). Retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
          throw error;
        }
      }

      const room = response.data.room;
      console.log(`   ✅ Room created: ${room._id}`);

      // Send initial message if provided
      if (initialMessage && room) {
        await this.sendMessage(room._id, visitorToken, initialMessage);
      }

      return { success: true, room, isNew: true };
    } catch (error) {
      console.error(`   ❌ Create room failed!`);
      console.error(`      Status: ${error.response?.status}`);
      console.error(`      Message: ${error.message}`);
      console.error(`      RocketChat Response:`, JSON.stringify(error.response?.data, null, 2));
      return { success: false, error: error.message, details: error.response?.data };
    }
  }

  /**
   * Get open room for visitor
   */
  async getOpenRoom(visitorToken) {
    try {
      const response = await this.apiRequest(
        'get',
        `${this.rocketChatUrl}/api/v1/livechat/rooms`,
        null,
        { token: visitorToken, open: true }
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

      const response = await this.apiRequest(
        'post',
        `${this.rocketChatUrl}/api/v1/livechat/message`,
        messageData
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
      const response = await this.apiRequest(
        'get',
        `${this.rocketChatUrl}/api/v1/livechat/messages.history/${roomId}`,
        null,
        { token: visitorToken, limit }
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
   * Send WhatsApp message to RocketChat using Incoming Webhook (Simple & Fast)
   * This is the quickest way to get WhatsApp messages into RocketChat #general
   * @param {Object} messageData - { from, text, userName }
   */
  async sendToRocketChatWebhook(messageData) {
    try {
      console.log('🔵 [RC Webhook] Called with:', { from: messageData.from, text: messageData.text?.substring(0, 50) });
      
      if (!this.incomingWebhookUrl) {
        console.warn('⚠️ [RC Webhook] ROCKETCHAT_INCOMING_WEBHOOK_URL not configured');
        console.warn('  Configured URL:', this.incomingWebhookUrl);
        return { success: false, error: 'Webhook URL not configured' };
      }

      console.log('🔵 [RC Webhook] Using URL:', this.incomingWebhookUrl.substring(0, 80) + '...');

      const { from, text, userName = 'WhatsApp User', timestamp = new Date().toISOString() } = messageData;

      // Format message for RocketChat
      const payload = {
        text: `📱 **WhatsApp Message from ${userName}** (${from})\n\n${text}`,
        attachments: [
          {
            title: 'WhatsApp Message',
            text: text,
            color: '#25D366', // WhatsApp green
            fields: [
              {
                title: 'From',
                value: `${userName} (${from})`,
                short: true
              },
              {
                title: 'Time',
                value: new Date(timestamp).toLocaleString('en-IN', { 
                  timeZone: 'Asia/Kolkata',
                  dateStyle: 'short',
                  timeStyle: 'short'
                }),
                short: true
              }
            ],
            ts: timestamp
          }
        ]
      };

      console.log('🔵 [RC Webhook] Sending payload...');
      const response = await axios.post(this.incomingWebhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      console.log('✅ [RC Webhook] SUCCESS - Status:', response.status, 'Data:', response.data);
      
      return {
        success: true,
        response: response.data
      };
    } catch (webhookError) {
      console.error('❌ [RC Webhook] FAILED:', webhookError.message);
      console.error('❌ [RC Webhook] Status:', webhookError.response?.status);
      console.error('❌ [RC Webhook] Data:', webhookError.response?.data);
      // Fallback: Try using RocketChat API directly
      console.log('🔄 [RC Webhook] Attempting API fallback...');
      return await this.sendToRocketChatViaAPI(messageData);
    }
  }

  async sendWhatsAppDirect(phone, body) {
    try {
      const normPhone = this.normalizeWhatsAppNumber(phone);

      try {
        const whatsappProductionService = (await import('./whatsapp-production.service.js')).default;
        if (whatsappProductionService?.sendSessionMessage) {
          await whatsappProductionService.sendSessionMessage({
            to: normPhone,
            body
          });
          return { success: true };
        }
        throw new Error('WhatsApp production service unavailable');
      } catch (productionError) {
        const whatsappService = (await import('./whatsapp.service.js')).default;
        await whatsappService.sendMessage({
          to: normPhone,
          content: body,
          type: 'text'
        });
        return { success: true };
      }
    } catch (error) {
      console.error('Send direct WhatsApp message error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send WhatsApp message to RocketChat #general via API (fallback)
   * This is more reliable than webhooks
   */
  async sendToRocketChatViaAPI(messageData) {
    try {
      const { from, text, userName = 'WhatsApp User', timestamp = new Date().toISOString() } = messageData;

      // Use authenticated admin credentials
      if (!this.rocketChatAuthToken || !this.rocketChatUserId) {
        console.error('❌ [RC API] Missing RocketChat auth credentials');
        console.error('   Token:', this.rocketChatAuthToken ? 'SET' : 'MISSING');
        console.error('   UserId:', this.rocketChatUserId ? 'SET' : 'MISSING');
        return { success: false, error: 'Missing RocketChat auth credentials' };
      }

      console.log('🔵 [RC API] Sending via API to:', this.rocketChatUrl);
      console.log('🔵 [RC API] User:', userName);

      // Call RocketChat API using authenticated admin account
      const response = await axios.post(
        `${this.rocketChatUrl}/api/v1/chat.postMessage`,
        {
          channel: '#general',
          text: `📱 **WhatsApp Message from ${userName}** (${from})\n\n${text}`,
          attachments: [
            {
              title: 'WhatsApp Message',
              text: text,
              color: '#25D366', // WhatsApp green
              fields: [
                {
                  title: 'From',
                  value: `${userName} (${from})`,
                  short: true
                },
                {
                  title: 'Time',
                  value: new Date(timestamp).toLocaleString('en-IN', { 
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'short',
                    timeStyle: 'short'
                  }),
                  short: true
                }
              ]
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': this.rocketChatAuthToken,
            'X-User-Id': this.rocketChatUserId
          },
          timeout: 10000
        }
      );

      console.log('✅ [RC API] SUCCESS - Message posted to RocketChat #general via API');
      return {
        success: true,
        response: response.data,
        method: 'api'
      };
    } catch (apiError) {
      console.error('❌ [RC API] FAILED:', apiError.message);
      if (apiError.response?.data) {
        console.error('❌ [RC API] Error details:', apiError.response.data);
      }
      return { success: false, error: apiError.message };
    }
  }

  /**
   * Handle incoming WhatsApp message with bot response + handoff logic
   * Called by your WhatsApp webhook handler
   * @param {Object} whatsappMessage - WhatsApp message data
   */
  async handleWhatsAppMessage(whatsappMessage) {
    try {
      console.log(`📱 Incoming WhatsApp message from ${whatsappMessage.from}: "${whatsappMessage.body.substring(0, 50)}..."`);
      
      const { from, body, mediaUrl, patientId, patient } = whatsappMessage;

      // Get or create visitor
      let visitorToken;
      if (patient) {
        console.log(`   👤 Patient found: ${patient.firstName} ${patient.lastName}`);
        const visitorResult = await this.registerVisitor(patient);
        visitorToken = visitorResult.visitorToken;
        if (!visitorResult.success) {
          console.warn(`   ⚠️ Visitor registration failed, continuing with token`);
        }
      } else {
        // Anonymous WhatsApp user
        console.log(`   😊 Anonymous user`);
        const visitorResult = await this.registerVisitor({
          id: `whatsapp-${from}`,
          firstName: 'WhatsApp',
          lastName: 'User',
          phoneNumber: from
        });
        visitorToken = visitorResult.visitorToken;
        if (!visitorResult.success) {
          console.warn(`   ⚠️ Visitor registration failed, continuing with token`);
        }
      }

      // Get or create room
      console.log(`   🏠 Creating/getting RocketChat room...`);
      const roomResult = await this.createOrGetRoom(visitorToken, 'general');
      if (!roomResult.success) {
        throw new Error(roomResult.error);
      }

      const roomId = roomResult.room._id;
      console.log(`   ✅ Room: ${roomId}`);

      const customerMsg = `📱 *Customer* (${whatsappBotService.detectLanguage(body) === 'hi' ? 'Hindi' : 'English'}): ${body}`;
      await this.sendMessage(roomId, visitorToken, customerMsg);

      // ========== BOT DECISION LOGIC ==========
      
      // Step 1: Detect language and department
      console.log(`   🔍 Analyzing message...`);
      const messageLanguage = whatsappBotService.detectLanguage(body);
      const detectedDepartment = whatsappBotService.getSuggestedDepartment(body);
      
      // Step 2: Check if this is a handoff state (customer already talked to bot)
      const handoffState = await cache.get(`whatsapp:handoff:${from}`);
      if (handoffState?.active && handoffState?.reason === 'bot_response_given') {
        console.log('🔄 Customer already received bot response, checking for explicit handoff...');
      }

      // Step 3: Get bot response from Dr.iSHA
      console.log('🤖 Getting bot response...');
      const botResponse = await whatsappBotService.getBotResponse(body, messageLanguage);

      // Log any API issues
      if (!botResponse.success) {
        console.warn(`⚠️ Dr.iSHA API failed: ${botResponse.error}`);
        console.log('📞 Falling back to agent handoff due to API error');
      }

      // Step 4: Determine if handoff is needed
      const handoffDecision = whatsappBotService.determineHandoffNeeded(
        body,
        botResponse,
        detectedDepartment
      );

      console.log(`🔍 Handoff Decision: ${handoffDecision.handoff ? 'YES' : 'NO'} (${handoffDecision.reason})`);

      // ========== CASE 1: BOT CAN HANDLE ==========
      if (!handoffDecision.handoff && botResponse.success) {
        // Format bot response
        const formattedBotResponse = whatsappBotService.formatBotResponse(botResponse, messageLanguage);
        const safeBotResponse = botResponse.response || '';
        
        // Send bot response
        await this.sendMessage(roomId, visitorToken, formattedBotResponse);

        // Update handoff state - bot response given
        await cache.set(
          `whatsapp:handoff:${from}`,
          {
            active: true,
            reason: 'bot_response_given',
            botResponse: safeBotResponse ? safeBotResponse.substring(0, 100) : '',
            confidence: botResponse.confidence,
            timestamp: new Date().toISOString()
          },
          300  // 5 minutes TTL - if no follow-up, assume resolved
        );

        console.log(`✅ Bot handled message for ${from}`);
        return { success: true, handled: 'bot', roomId };
      }

      // ========== CASE 2: HANDOFF NEEDED ==========
      else {
        console.log(`📞 Handing off to ${detectedDepartment} agent for ${from}...`);

        // Add emergency context for support team if needed
        if (handoffDecision.reason === 'emergency_detected') {
          await this.sendMessage(roomId, visitorToken, `🚨 Emergency flag applied for message from ${from}`);
        }

        // Send bot context if available (so agent knows what bot tried)
        if (botResponse.success && botResponse.response) {
          const context = `\n📋 *Bot Context*:\n${botResponse.response.substring(0, 200)}...\n(Confidence: ${(botResponse.confidence * 100).toFixed(0)}%)`;
          await this.sendMessage(roomId, visitorToken, context);
        }

        // Transfer to appropriate department agent
        const transferResult = await this.transferToDepartment(
          roomId,
          visitorToken,
          detectedDepartment
        );

        if (!transferResult.success) {
          console.error('Transfer failed:', transferResult.error);
        }

        // Find and notify available agents
        const agents = await this.getAvailableAgents(detectedDepartment);
        console.log(`👥 Routed to ${detectedDepartment} (${agents.agents?.length || 0} agents available)`);

        // Set handoff state - waiting for agent
        await cache.set(
          `whatsapp:handoff:${from}`,
          {
            active: true,
            reason: 'waiting_for_agent',
            department: detectedDepartment,
            priority: handoffDecision.priority,
            timestamp: new Date().toISOString()
          },
          3600  // 1 hour TTL
        );

        // Send message back to customer (via webhook or direct)
        const waitingMsg = messageLanguage === 'hi'
          ? '⏳ एक मिनट में हमारी सहायता टीम आ जाएगी। कृपया प्रतीक्षा करें...'
          : '⏳ Our support team will be with you shortly. Please wait...';

        const noAgentsMsg = messageLanguage === 'hi'
          ? '📌 इस समय कोई एजेंट तुरंत उपलब्ध नहीं है। हमने आपकी रिक्वेस्ट दर्ज कर ली है और जल्दी ही टीम आपसे संपर्क करेगी।'
          : '📌 No agent is immediately available right now. We have logged your request and our team will contact you shortly.';

        await this.sendWhatsAppDirect(from, agents.agents?.length > 0 ? waitingMsg : noAgentsMsg);
        await this.sendMessage(roomId, visitorToken, waitingMsg);
        if (!agents.agents?.length) {
          await this.sendMessage(roomId, visitorToken, noAgentsMsg);
        }

        return { success: true, handled: 'handoff', department: detectedDepartment, roomId };
      }
    } catch (error) {
      console.error(`❌ WhatsApp handler error: ${error.message}`);
      console.error(`   Stack: ${error.stack?.split('\n')[1]}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message from RocketChat agent back to WhatsApp
   * Called by RocketChat webhook
   * @param {Object} webhookData - RocketChat webhook payload
   */
  async sendToWhatsApp(webhookData) {
    // ── Normalise payload ────────────────────────────────────────────────────
    // Outgoing-webhook format: { room, message, text, channel_name, tmid, message_id }
    // Omnichannel-webhook format: { type, _id, messages: [...], room, visitor, agent }
    let room       = webhookData.room;
    let message    = webhookData.message;
    let text       = webhookData.text;
    let channel_name = webhookData.channel_name;
    let tmid       = webhookData.tmid;
    let message_id = webhookData.message_id;

    const isOmnichannelWebhook = !!webhookData.visitor || (!!webhookData.messages && !webhookData.message);
    if (isOmnichannelWebhook) {
      // Omnichannel (livechat) webhook — fire on agent_message
      const msgs = webhookData.messages || [];
      if (msgs.length === 0) {
        return { success: true, skipped: true, reason: 'omnichannel_no_messages' };
      }
      message    = msgs[0];    // {_id, msg, u, t, ts, ...}
      message_id = message._id;
      text       = message.msg;
      // Attach visitor to room if not present
      if (!room?.v && webhookData.visitor) {
        room = { ...(room || {}), v: webhookData.visitor, t: 'l' };
      }
      console.log('📨 [sendToWhatsApp] Omnichannel webhook, agent:', message?.u?.username, 'msg:', text?.substring(0, 60));
    }

    // Detect if this is a livechat (omnichannel) room
    const isLivechatRoom = room?.t === 'l' || room?.type === 'l' || !!room?.v || isOmnichannelWebhook;

    console.log('📤 [sendToWhatsApp] Processing webhook:', {
      hasRoom: !!room,
      roomType: room?.t || room?.type,
      isLivechatRoom,
      hasMessage: !!message,
      hasText: !!text,
      channelName: channel_name,
      tmid: tmid,
      messageId: message_id,
      messageUser: message?.u?.username,
      messageToken: !!message?.token,
      roomVisitor: !!room?.v
    });

    // For NON-livechat rooms (regular channels): only reply-to-thread messages reach WhatsApp
    if (!isLivechatRoom && !tmid) {
      console.log('⏭️ [sendToWhatsApp] Skipping non-threaded message in regular channel');
      return { success: true, skipped: true, reason: 'not_a_thread_reply' };
    }

    // Skip visitor/customer messages — only forward AGENT messages to WhatsApp
    const isVisitorMessage = !!message?.token || (
      message?.u?.type === 'visitor'
      || message?.u?.roles?.includes('livechat-visitor')
      || (room?.v && (
        message?.u?._id === room.v._id
        || message?.u?.username === room.v.username
        || message?.u?.name === room.v.name
      ))
    );
    if (isVisitorMessage) {
      console.log('⏭️ [sendToWhatsApp] Skipping visitor message');
      return { success: true, skipped: true };
    }

    // Skip system messages (room closure, transfers, etc.)
    if (message?.t) {
      console.log('⏭️ [sendToWhatsApp] Skipping system message type:', message.t);
      return { success: true, skipped: true, reason: 'system_message' };
    }

    // Declare lock variables early so they're accessible in finally block
    let dedupeKey = null;
    let lockKey = null;
    let lockTTL = 30;
    let lockAcquired = false;

    try {
      const visitor = room?.v;
      const messageText = message?.msg || text || '';

      // === PHONE RESOLUTION: Multiple strategies ===
      // 1. Livechat visitor phone array (most reliable for omnichannel)
      let rawPhone = visitor?.phone?.[0]?.phoneNumber
        || visitor?.phone?.[0]?.value
        || visitor?.phone?.[0]
        || visitor?.phoneNumber
        || visitor?.phone;

      // 2. For regular channel threads: fetch parent message text to extract phone
      if (!rawPhone && tmid) {
        try {
          const parentMessage = await this.getThreadParentMessage(channel_name, tmid);
          if (parentMessage) {
            // Match (+919...) or (++919...) or (919...) in parentheses
            const phoneMatch = parentMessage.match(/\((\+{0,2}\d{7,})\)/);
            if (phoneMatch?.[1]) {
              rawPhone = phoneMatch[1].replace(/^\+\+/, '+');
              if (!rawPhone.startsWith('+')) rawPhone = '+' + rawPhone;
            }
          }
        } catch (err) {
          console.warn('⚠️ Failed to fetch thread parent:', err.message);
        }
      }

      // 3. Extract phone from room name (livechat rooms are named after phone, e.g. "+917373007737")
      if (!rawPhone && room?.name && /^\+\d{7,}$/.test(room.name)) {
        rawPhone = room.name;
      }

      // 4. Extract phone from message text "(+91xxx)", "(++91xxx)", or "(91xxx)"
      if (!rawPhone && messageText) {
        const m = messageText.match(/\((\+{0,2}\d{7,})\)/);
        if (m?.[1]) {
          rawPhone = m[1].replace(/^\+\+/, '+');
          if (!rawPhone.startsWith('+')) rawPhone = '+' + rawPhone;
        }
      }

      // 5. Lookup Redis whatsapp contact by visitor token/id
      if (!rawPhone && visitor?.token) {
        try {
          const stored = await cache.get(`whatsapp:visitor:${visitor.token}`);
          if (stored?.phone) rawPhone = stored.phone;
        } catch (_) {}
      }

      console.log('📞 [sendToWhatsApp] Resolved phone:', rawPhone || 'NOT FOUND', {
        visitorToken: visitor?.token?.substring(0, 12),
        roomName: room?.name
      });

      if (!rawPhone) {
        console.log('❌ [sendToWhatsApp] No WhatsApp number found — cannot forward to WhatsApp');
        return { success: false, error: 'No WhatsApp number' };
      }

      const normPhone = this.normalizeWhatsAppNumber(rawPhone);

      // DEDUPLICATION via Redis atomic lock
      dedupeKey = this.getWebhookDedupeKey(message_id, tmid);
      lockKey = `webhook-lock:${dedupeKey}`;
      const lockValue = Date.now().toString();

      try {
        const setResult = await cache.setNX(lockKey, lockValue, lockTTL);
        if (setResult === 'OK') {
          lockAcquired = true;
        } else {
          console.log('⏭️ [sendToWhatsApp] Already processing (Redis lock):', dedupeKey.substring(0, 8));
          return { success: true, skipped: true, reason: 'already_processing_redis_atomic' };
        }
      } catch (atomicError) {
        try {
          const existingLock = await cache.get(lockKey);
          if (existingLock) return { success: true, skipped: true, reason: 'already_processing_fallback_get_set' };
          await cache.set(lockKey, lockValue, lockTTL);
          lockAcquired = true;
        } catch (fallbackError) {
          if (this.webhookProcessingLocks.has(dedupeKey)) {
            return { success: true, skipped: true, reason: 'already_processing_inmemory' };
          }
          this.webhookProcessingLocks.set(dedupeKey, true);
          lockAcquired = true;
        }
      }

      this.recordWebhookCall(dedupeKey);

      try {
        console.log('✅ [sendToWhatsApp] Forwarding agent reply to WhatsApp:', {
          to: normPhone,
          msgLength: messageText.length,
          preview: messageText.substring(0, 60)
        });

        try {
          const whatsappProductionService = (await import('./whatsapp-production.service.js')).default;
          if (whatsappProductionService?.sendSessionMessage) {
            await whatsappProductionService.sendSessionMessage({ to: normPhone, body: messageText });
          } else {
            throw new Error('WhatsApp production service unavailable');
          }
        } catch (productionError) {
          const whatsappService = (await import('./whatsapp.service.js')).default;
          await whatsappService.sendMessage({ to: normPhone, content: messageText, type: 'text' });
        }

        await this.setHandoffState(normPhone, { reason: 'agent_message', source: 'rocketchat' });
        console.log('✅ [sendToWhatsApp] Message sent successfully');
        return { success: true };
      } catch (error) {
        console.error('Send to WhatsApp error:', error);
        return { success: false, error: error.message };
      } finally {
        if (lockAcquired && lockKey) {
          try { await cache.del(lockKey); } catch (_) {}
        }
        if (dedupeKey && this.webhookProcessingLocks.has(dedupeKey)) {
          this.webhookProcessingLocks.delete(dedupeKey);
        }
      }
    } catch (error) {
      console.error('Send to WhatsApp outer error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch parent message from RocketChat thread using tmid
   * Used to extract phone number from original incoming message
   */
  async getThreadParentMessage(channelName, tmid) {
    try {
      const ROCKETCHAT_AUTH_TOKEN = process.env.ROCKETCHAT_AUTH_TOKEN;
      const ROCKETCHAT_USER_ID = process.env.ROCKETCHAT_USER_ID;
      const ROCKETCHAT_URL = process.env.ROCKETCHAT_URL || 'http://localhost:3100';

      if (!ROCKETCHAT_AUTH_TOKEN || !ROCKETCHAT_USER_ID) {
        console.error('❌ [getThreadParentMessage] Missing RocketChat auth credentials');
        return null;
      }

      // Try to fetch the specific message by ID (which is the tmid - thread message ID)
      const response = await fetch(`${ROCKETCHAT_URL}/api/v1/chat.getMessage?msgId=${tmid}`, {
        method: 'GET',
        headers: {
          'X-Auth-Token': ROCKETCHAT_AUTH_TOKEN,
          'X-User-Id': ROCKETCHAT_USER_ID,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ [getThreadParentMessage] chat.getMessage API response not ok:', response.status);
        
        // Fallback: Try to fetch channel messages and find parent
        const messagesResponse = await fetch(`${ROCKETCHAT_URL}/api/v1/channels.messages?roomName=${channelName}&count=50&sort={"ts":-1}`, {
          method: 'GET',
          headers: {
            'X-Auth-Token': ROCKETCHAT_AUTH_TOKEN,
            'X-User-Id': ROCKETCHAT_USER_ID,
            'Content-Type': 'application/json'
          }
        });

        if (messagesResponse.ok) {
          const data = await messagesResponse.json();
          if (data.messages && data.messages.length > 0) {
            // Find message with ID matching tmid
            const parentMsg = data.messages.find(m => m._id === tmid);
            if (parentMsg) {
              console.log('📝 [getThreadParentMessage] Found parent via fallback:', parentMsg.msg?.substring?.(0, 50));
              return parentMsg.msg;
            }
          }
        }
        return null;
      }

      const msgData = await response.json();
      if (msgData.message) {
        console.log('📝 [getThreadParentMessage] Found parent message:', msgData.message.msg?.substring?.(0, 50));
        return msgData.message.msg;
      }

      console.log('⚠️  [getThreadParentMessage] No message data returned');
      return null;
    } catch (error) {
      console.error('❌ [getThreadParentMessage] Error:', error.message);
      return null;
    }
  }

  /**
   * Get deduplication key for webhook message
   * Hash of: message_id + tmid (unique per message)
   */
  getWebhookDedupeKey(messageId, tmid) {
    const key = `${messageId}:${tmid}`;
    return crypto.createHash('md5').update(key).digest('hex');
  }

  /**
   * Check if webhook call was already processed recently
   */
  isRecentWebhookCall(dedupeKey) {
    const now = Date.now();
    const lastCall = this.recentWebhookCalls.get(dedupeKey);
    
    if (!lastCall) return false;
    
    const timeSinceLastCall = now - lastCall;
    const isRecent = timeSinceLastCall < this.webhookDeduplicationWindow;
    
    return isRecent;
  }

  /**
   * Record a webhook call for deduplication
   */
  recordWebhookCall(dedupeKey) {
    const now = Date.now();
    this.recentWebhookCalls.set(dedupeKey, now);
    
    // Cleanup old entries every 100 calls
    if (this.recentWebhookCalls.size > 100) {
      const oldestAllowed = now - this.webhookDeduplicationWindow;
      for (const [key, timestamp] of this.recentWebhookCalls.entries()) {
        if (timestamp < oldestAllowed) {
          this.recentWebhookCalls.delete(key);
        }
      }
    }
  }

  /**
   * Normalize phone number for WhatsApp providers.
   */
  normalizeWhatsAppNumber(phone) {
    if (!phone) return '';
    const trimmed = String(phone).trim().replace(/^whatsapp:/i, '').replace(/^\++/, '+');
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
      url: this.rocketChatPublicUrl,
      livechatUrl: `${this.rocketChatPublicUrl}/livechat`,
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
      const response = await this.apiRequest(
        'post',
        `${this.rocketChatUrl}/api/v1/livechat/room.transfer`,
        { token: visitorToken, rid: roomId, department: this.departments[department] }
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
      
      const response = await this.apiRequest(
        'get',
        `${this.rocketChatUrl}/api/v1/livechat/users/agent`,
        null,
        params
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
      const response = await this.apiRequest(
        'get',
        `${this.rocketChatUrl}/api/v1/livechat/queue`
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

      const response = await this.apiRequest(
        'post',
        `${this.rocketChatUrl}/api/v1/livechat/room.close`,
        { token: visitorToken, rid: roomId }
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

  // AGENT ROUTING & HANDOFF
  // ============================================================================

  /**
   * Transfer chat room to specific department
   * @param {string} roomId - RocketChat room ID
   * @param {string} visitorToken - Visitor session token
   * @param {string} department - Target department
   */
  async transferToDepartment(roomId, visitorToken, department = 'general') {
    try {
      // Map internal department to RocketChat department
      const departmentName = this.departments[department] || this.departments.general;

      const response = await this.apiRequest(
        'post',
        `${this.rocketChatUrl}/api/v1/livechat/room.transfer`,
        { rid: roomId, token: visitorToken, department: departmentName }
      );

      if (response.data.success) {
        console.log(`✅ Room ${roomId} transferred to ${departmentName}`);
        return { success: true, department: departmentName };
      } else {
        throw new Error(response.data.error || 'Transfer failed');
      }
    } catch (error) {
      console.error('Department transfer error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available agents in a department
   * @param {string} department - Department name
   */
  async getAvailableAgents(department = 'general') {
    try {
      const departmentName = this.departments[department] || this.departments.general;

      const response = await this.apiRequest(
        'get',
        `${this.rocketChatUrl}/api/v1/livechat/agents`,
        null,
        { count: 100 }
      );

      if (!response.data.success) {
        throw new Error('Failed to fetch agents');
      }

      // Filter online agents
      const onlineAgents = response.data.agents.filter(agent => agent.status === 'online');

      // If department-specific filtering needed, add department check here
      // For now, return all online agents that can handle this department

      return {
        success: true,
        agents: onlineAgents,
        count: onlineAgents.length,
        department: departmentName
      };
    } catch (error) {
      console.error('Get available agents error:', error.response?.data || error.message);
      return { success: false, agents: [], count: 0, error: error.message };
    }
  }

  /**
   * Route to specific agent
   * @param {string} roomId - RocketChat room ID
   * @param {string} visitorToken - Visitor session token
   * @param {string} agentId - Specific agent ID
   */
  async routeToAgent(roomId, visitorToken, agentId) {
    try {
      // First transfer to department, then assign to specific agent
      const response = await this.apiRequest(
        'post',
        `${this.rocketChatUrl}/api/v1/livechat/room.visitor`,
        { rid: roomId, token: visitorToken, agentId }
      );

      if (response.data.success) {
        console.log(`✅ Room ${roomId} assigned to agent ${agentId}`);
        return { success: true, agentId };
      } else {
        throw new Error(response.data.error || 'Agent assignment failed');
      }
    } catch (error) {
      console.error('Route to agent error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send priority/priority flag to agent dashboard
   * Useful for marking emergency or urgent chats
   * @param {string} roomId - RocketChat room ID
   * @param {string} priority - 'low' | 'normal' | 'high' | 'urgent' | 'emergency'
   * @param {string} reason - Reason for priority
   */
  async setPriority(roomId, priority = 'normal', reason = '') {
    try {
      // Send a message to alert agents
      const priorityEmojis = {
        emergency: '🚨',
        urgent: '⚠️',
        high: '📌',
        normal: '📝',
        low: '📋'
      };

      const emoji = priorityEmojis[priority] || '📝';
      const message = `${emoji} *Priority: ${priority.toUpperCase()}* ${reason ? `- ${reason}` : ''}`;

      const response = await axios.post(
        `${this.rocketChatUrl}/api/v1/chat.sendMessage`,
        {
          rid: roomId,
          msg: message,
          alias: 'System',
          avatar: 'https://via.placeholder.com/48'
        },
        { headers: this.getHeaders() }
      );

      return { success: true };
    } catch (error) {
      console.error('Set priority error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // WATI-LIKE WHATSAPP ↔ LIVECHAT BRIDGE
  // ============================================================================

  /**
   * Ensure a RocketChat livechat room exists for this WhatsApp contact
   * and forward the incoming message into that room.
   * Called fire-and-forget from the WhatsApp webhook route.
   *
   * @param {string} phone - E.164 phone number e.g. "+91737..."
   * @param {string} name  - Display name (ProfileName or phone)
   * @param {string} messageText - The incoming WhatsApp message body
   * @param {Object|null} patient - Known patient object from userContext (optional)
   */
  async syncToLivechat(phone, name, messageText, patient = null) {
    try {
      const normPhone = this.normalizeWhatsAppNumber(phone);

      // Build a stable phantom patient record for the visitor
      // Use actual name + phone so RC Omnichannel shows readable contact info
      const displayFirst = patient?.name?.split(' ')[0] || name || normPhone;
      const displayLast  = patient?.name?.split(' ').slice(1).join(' ') || '';
      // For anonymous WA users: use phone as name so agents know who to call back
      const visitorName = (displayFirst === normPhone)
        ? normPhone
        : `${displayFirst}${displayLast ? ' ' + displayLast : ''} (${normPhone})`;
      const phantomPatient = {
        id: `wa-${normPhone.replace(/[^\d]/g, '')}`,
        firstName: visitorName,
        lastName: '',
        email: patient?.email || '',
        phoneNumber: normPhone
      };

      // 1. Register visitor (idempotent – RC deduplicates by token)
      const visitorResult = await this.registerVisitor(phantomPatient);
      const visitorToken = visitorResult.visitorToken;

      // 2. Store token → phone mapping in Redis for sendToWhatsApp
      await cache.set(`whatsapp:visitor:${visitorToken}`, { phone: normPhone }, 86400);

      // 3. Create/get livechat room
      const roomResult = await this.createOrGetRoom(visitorToken, 'general');
      if (!roomResult.success) {
        console.error('❌ [syncToLivechat] Failed to get/create room:', roomResult.error);
        return { success: false };
      }
      const roomId = roomResult.room._id;

      // 4. Send customer message into the livechat room
      await this.sendMessage(roomId, visitorToken, messageText);

      console.log(`✅ [syncToLivechat] Room ${roomId} synced for ${normPhone}`);
      return { success: true, roomId, visitorToken };
    } catch (err) {
      console.error('❌ [syncToLivechat] Error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * List open RC livechat rooms (for inbox API)
   * @param {Object} opts - { count, offset, open }
   */
  async getLivechatRooms(opts = {}) {
    try {
      const { count = 50, offset = 0, open = true } = opts;
      const response = await this.apiRequest(
        'get',
        `${this.rocketChatUrl}/api/v1/livechat/rooms`,
        null,
        { count, offset, open }
      );
      return response.data.rooms || [];
    } catch (err) {
      console.error('❌ [getLivechatRooms] Error:', err.message);
      return [];
    }
  }
}

// Singleton instance
const omnichannelChatService = new OmnichannelChatService();

export default omnichannelChatService;
export { OmnichannelChatService };
