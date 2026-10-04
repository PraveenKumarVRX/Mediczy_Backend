/**
 * WhatsApp Bot Service
 * Handles Dr.iSHA AI responses and handoff decision logic
 */

import axios from 'axios';

class WhatsAppBotService {
  constructor() {
    this.drishaApiUrl = process.env.DRISHA_AI_API_URL || 'http://localhost:8001/chat';
    this.confidenceThreshold = parseFloat(process.env.BOT_CONFIDENCE_THRESHOLD || '0.60');
    this.handoffKeywords = (process.env.HANDOFF_KEYWORDS || 'agent,human,support,doctor,talk to').split(',').map(k => k.trim());
    this.emergencyKeywords = (process.env.EMERGENCY_KEYWORDS || 'emergency,urgent,critical,chest pain,breathing').split(',').map(k => k.trim());
    
    // Log configuration on startup
    console.log(`🤖 WhatsApp Bot Service initialized`);
    console.log(`   Dr.iSHA URL: ${this.drishaApiUrl}`);
    console.log(`   Confidence Threshold: ${this.confidenceThreshold}`);
  }

  /**
   * Get bot response from Dr.iSHA AI
   * @param {string} message - Customer message
   * @param {string} language - Language code (en, hi, etc.)
   * @param {string} patientId - Patient ID for context (optional)
   * @returns {Promise<Object>} Bot response with confidence score
   */
  async getBotResponse(message, language = 'en', patientId = 'whatsapp-user') {
    try {
      // Validate Dr.iSHA endpoint is configured
      if (!this.drishaApiUrl || this.drishaApiUrl.includes('undefined')) {
        throw new Error('DRISHA_AI_API_URL not configured');
      }

      const payload = {
        patient_id: patientId,
        message: message,
        include_risk: false,
        include_rag: true
      };

      console.log(`🤖 Calling Dr.iSHA API at ${this.drishaApiUrl}: "${message.substring(0, 50)}..."`);
      console.log(`   Payload: patient_id=${patientId}, message=${message.substring(0, 30)}...`);
      const response = await axios.post(
        `${this.drishaApiUrl}`,
        payload,
        {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const botResponse = response.data;
      
      // Extract answer from Dr.iSHA response format
      const answer = Array.isArray(botResponse.chat_answer) 
        ? botResponse.chat_answer[0] 
        : botResponse.chat_answer || botResponse.response || botResponse.message || 'Response received';
      
      return {
        success: true,
        response: answer,
        confidence: botResponse.confidence || 0.85,
        category: botResponse.category || 'general_health',
        model: botResponse.provider || 'groq-llama',
        risk: botResponse.risk,
        conversationId: botResponse.conversation_id,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Dr.iSHA API error:', error.message);
      console.error('   Details:', error.response?.data || error.code);
      return {
        success: false,
        response: null,
        confidence: 0,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Determine if message requires handoff to human agent
   * @param {string} message - Customer message
   * @param {Object} botResponse - Bot response object
   * @param {string} department - Detected department
   * @returns {Object} Handoff decision
   */
  determineHandoffNeeded(message, botResponse = {}, department = 'general') {
    const lowerMessage = message.toLowerCase();

    // Check 1: Explicit handoff request
    const hasExplicitRequest = this.handoffKeywords.some(keyword =>
      lowerMessage.includes(keyword.toLowerCase())
    );
    if (hasExplicitRequest) {
      return {
        handoff: true,
        reason: 'explicit_request',
        confidence: 1.0,
        priority: 'normal'
      };
    }

    // Check 2: Emergency detection
    const isEmergency = this.emergencyKeywords.some(keyword =>
      lowerMessage.includes(keyword.toLowerCase())
    );
    if (isEmergency) {
      return {
        handoff: true,
        reason: 'emergency_detected',
        confidence: 1.0,
        priority: 'high'
      };
    }

    // Check 3: Bot confidence too low
    if (botResponse.confidence && botResponse.confidence < this.confidenceThreshold) {
      return {
        handoff: true,
        reason: 'low_bot_confidence',
        confidence: botResponse.confidence,
        priority: 'normal'
      };
    }

    // Check 4: Department-specific requirements
    const departmentHandoffs = {
      emergency: true,  // Always handoff emergency
      appointments: true,  // Appointments need agent
      billing: true  // Billing inquiries need agent
    };

    if (departmentHandoffs[department]) {
      return {
        handoff: true,
        reason: `${department}_requires_agent`,
        confidence: 0.95,
        priority: department === 'emergency' ? 'high' : 'normal'
      };
    }

    // Check 5: Multi-turn conversation without resolution
    // (requires conversation history - implemented separately)

    // Default: No handoff needed
    return {
      handoff: false,
      reason: 'bot_can_handle',
      confidence: botResponse.confidence || 0.80,
      priority: 'normal'
    };
  }

  /**
   * Format bot response for display in the agent workspace / WhatsApp
   * @param {Object} botResponse - Bot response from Dr.iSHA
   * @param {string} language - Language code
   * @returns {string} Formatted message for customer
   */
  formatBotResponse(botResponse, language = 'en') {
    if (!botResponse.success) {
      // Fallback message when bot fails
      return language === 'hi'
        ? '🤖 *Dr.iSHA Bot*: माफ़ी चाहता हूँ, मैं अभी आपकी पूरी तरह सहायता नहीं कर सकता। कृपया किसी मानव एजेंट से बात करें।'
        : '🤖 *Dr.iSHA Bot*: I apologize, I couldn\'t fully assist you. Please wait for a human agent to help.';
    }

    const response = botResponse.response || '';
    const confidence = botResponse.confidence || 0;
    const category = botResponse.category || 'general_health';

    // Add confidence indicator for low-confidence responses
    let disclaimer = '';
    if (confidence < 0.70) {
      disclaimer = language === 'hi'
        ? '\n\n⚠️ *नोट*: यह एक सामान्य सुझाव है। कृपया अपने डॉक्टर से सलाह लें।'
        : '\n\n⚠️ *Note*: This is a general suggestion. Please consult your doctor.';
    }

    // Add next steps based on category
    let nextSteps = '';
    if (category === 'emergency') {
      nextSteps = language === 'hi'
        ? '\n\n🚨 *यह आपातकालीन स्थिति प्रतीत होती है। तुरंत चिकित्सा सहायता लें।*'
        : '\n\n🚨 *This appears to be an emergency. Seek medical help immediately.*';
    } else if (category === 'appointment_needed') {
      nextSteps = language === 'hi'
        ? '\n\n📅 डॉक्टर से परामर्श लेने के लिए हमारी टीम आपको जल्द संपर्क करेगी।'
        : '\n\n📅 Our support team will contact you soon to schedule a doctor consultation.';
    }

    return `🤖 *Dr.iSHA*:\n${response}${disclaimer}${nextSteps}`;
  }

  /**
   * Detect conversation language
   * @param {string} message - Message text
   * @returns {string} Language code (en, hi, etc.)
   */
  detectLanguage(message) {
    // Simple language detection based on script
    const hindiUnicode = /[\u0900-\u097F]/g;
    const hindiChars = (message.match(hindiUnicode) || []).length;
    const englishChars = (message.match(/[a-zA-Z]/g) || []).length;

    if (hindiChars > englishChars) {
      return 'hi';
    }
    return 'en';
  }

  /**
   * Detect if conversation is urgent/emergency
   * @param {string} message - Message text
   * @returns {boolean} True if emergency-like
   */
  isUrgent(message) {
    const urgentPatterns = [
      /(?:emergency|urgent|sos|help|breathing|chest pain|unconscious)/i,
      /(?:तुरंत|आपातकाल|संकट|बेहोश|सांस)/i
    ];

    return urgentPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Get suggested department for message
   * @param {string} message - Message text
   * @returns {string} Department name
   */
  getSuggestedDepartment(message) {
    const lowerMessage = message.toLowerCase();

    const departments = {
      emergency: /emergency|urgent|critical|sos|chest pain|breathing/i,
      appointments: /appointment|consult|doctor|schedule|book|when/i,
      pharmacy: /medicine|prescription|pharmacy|tablet|injection|dose/i,
      billing: /bill|payment|cost|price|invoice|charge|refund/i,
      technical: /app|login|error|bug|crash|not working|download/i
    };

    for (const [dept, regex] of Object.entries(departments)) {
      if (regex.test(lowerMessage)) {
        return dept;
      }
    }

    return 'general';
  }

  /**
   * Check if customer wants to continue with bot or switch to agent
   * @param {string} message - Message text
   * @returns {Object} User intent
   */
  detectUserIntent(message) {
    const lowerMessage = message.toLowerCase();

    // Continue with bot patterns
    if (/^(yes|ok|sure|continue|bot|ai|more|help)/i.test(message)) {
      return { intent: 'continue_with_bot', confidence: 0.9 };
    }

    // Switch to agent patterns
    if (/^(no|stop|agent|human|support|talk|call|connect)/i.test(message)) {
      return { intent: 'switch_to_agent', confidence: 0.9 };
    }

    // Unclear
    return { intent: 'unclear', confidence: 0.5 };
  }

  /**
   * Generate context summary for agent from conversation
   * @param {Array} messages - Message history
   * @param {Object} botResponse - Last bot response
   * @returns {string} Formatted context
   */
  generateAgentContext(messages = [], botResponse = {}) {
    let context = '📋 *Conversation Context*\n\n';

    // Add bot response summary
    if (botResponse.response) {
      context += '🤖 *Bot Response*:\n';
      context += botResponse.response.substring(0, 200) + '...\n\n';
    }

    // Add message history (last 3 messages)
    if (messages.length > 0) {
      context += '*Message History* (Last 3):\n';
      messages.slice(-3).forEach((msg, idx) => {
        const sender = msg.from === 'customer' ? '👤' : '🤖';
        context += `${sender} ${msg.from}: ${msg.text.substring(0, 50)}...\n`;
      });
    }

    return context;
  }
}

export default new WhatsAppBotService();
