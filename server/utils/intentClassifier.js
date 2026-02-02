/**
 * Intent Classifier with Conversation State Management
 * 
 * CORE INTENTS:
 * ─────────────────────────────────────────────────────
 * HEALTH CHECKUP FLOW:
 * - book_healthcheckup: User wants to book a health checkup package
 * - healthcheckup_status: User checking status of booked health checkup  
 * - healthcheckup_reports: User wants health checkup report updates
 * 
 * DOCTOR APPOINTMENT FLOW:
 * - book_appointment: User wants to book a doctor appointment
 * - appointment_status: User checking doctor appointment status
 * 
 * GENERAL INTENTS:
 * - greeting: "hi", "hello", "namaste"
 * - small_talk: "ok", "mam", "yes", "hmm", short acknowledgments
 * - appointment_wait: "wait", "tomorrow", "later"
 * - medical_query: symptoms, health questions
 * - non_medical_query: entrepreneurship, general knowledge, etc.
 * - child_user: detected child (age < 13)
 * - emergency: urgent medical situations
 * - fallback: unclear intent
 * 
 * CONVERSATION STATES:
 * - awaiting_healthcheckup_package: Waiting for package selection
 * - awaiting_healthcheckup_date: Waiting for preferred date
 * - awaiting_appointment_specialty: Waiting for doctor specialty
 * - awaiting_appointment_date: Waiting for appointment date
 * - confirming_booking: Confirming any booking
 */

import { cache } from '../db/redis.js';

const CONVERSATION_STATE_TTL = 3600; // 1 hour
const STATE_PREFIX = 'conv_state:';
const normalizeIntentText = (text) => {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
};

class IntentClassifier {
  constructor() {
    this.hybridEnabled = true;
    this.confidenceThreshold = 30;
    
    // Intent patterns organized by flow
    this.patterns = {
      // ═══════════════════════════════════════════════════
      // HEALTH CHECKUP PATTERNS
      // ═══════════════════════════════════════════════════
      book_healthcheckup: [
        /\b(book|schedule|want|need)\s*(a\s*)?(health\s*check\s*up|health\s*checkup|full\s*body\s*check|master\s*health\s*check|annual\s*health\s*check|preventive\s*health)/i,
        /\b(health\s*check\s*up|checkup|full\s*body)\s*(package|booking|test)/i,
        /\bi\s*want\s*(to\s*)?(do|get|have)\s*(a\s*)?(health\s*check|full\s*body\s*check|master\s*check)/i,
        /\b(book|register)\s*(for\s*)?(health\s*screening|preventive\s*check|annual\s*check)/i,
        /\bhealth\s*package/i,
        /\bmaster\s*health/i,
        /\bexecutive\s*health\s*check/i,
        /\bwhole\s*body\s*check/i
      ],
      healthcheckup_status: [
        /\b(what|check|tell|know)\s*(is\s*)?(the\s*)?(status|update)\s*(of\s*)?(my\s*)?(health\s*check|checkup|health\s*screening)/i,
        /\bmy\s*(health\s*)?check\s*up\s*status/i,
        /\b(where|how)\s*(is\s*)?(my\s*)?(health\s*check|checkup)\s*(booking|appointment)?/i,
        /\bhealth\s*check\s*(up\s*)?(status|update|progress)/i,
        /\bis\s*my\s*(health\s*)?check\s*up\s*(confirmed|booked|scheduled)/i,
        /\bwhen\s*is\s*my\s*(health\s*)?check\s*up/i,
        /\bcheck\s*up\s*date/i
      ],
      healthcheckup_reports: [
        /\b(my\s*)?(health\s*check|checkup|test)\s*(report|result|finding)/i,
        /\b(where|how|when)\s*(is|are|can\s*i\s*get)\s*(my\s*)?(report|result|test\s*result)/i,
        /\breport\s*(ready|available|status|update)/i,
        /\btest\s*result\s*(ready|available|update)/i,
        /\bdownload\s*(my\s*)?(report|result)/i,
        /\bget\s*(my\s*)?(report|result|health\s*report)/i,
        /\blab\s*report/i,
        /\bblood\s*test\s*result/i,
        /\b(show|see|view)\s*(my\s*)?(report|result)/i
      ],
      
      // ═══════════════════════════════════════════════════
      // DOCTOR APPOINTMENT PATTERNS  
      // ═══════════════════════════════════════════════════
      book_appointment: [
        /\b(book|schedule|fix|make)\s*(an?\s*)?(doctor\s*)?(appointment|consultation|visit)/i,
        /\bi\s*want\s*to\s*(see|consult|meet|visit)\s*(a\s*)?(doctor|physician|specialist)/i,
        /\bneed\s*(to\s*)?(see|consult)\s*(a\s*)?(doctor|physician)/i,
        /\bcan\s*(you\s*)?book\s*(me\s*)?(an?\s*)?appointment/i,
        /\byes\s*(please\s*)?(book|schedule)\s*(appointment)?/i,
        /\bbook\s*now/i,
        /\bconsult\s*(a\s*)?(doctor|specialist)/i,
        /\bdoctor\s*appointment/i,
        /\bopd\s*(booking|appointment)/i
      ],
      appointment_status: [
        /\b(what|check|tell|know)\s*(is\s*)?(the\s*)?(status|update)\s*(of\s*)?(my\s*)?(appointment|consultation|booking)/i,
        /\bmy\s*appointment\s*(status|detail|update)/i,
        /\b(where|how|when)\s*(is\s*)?(my\s*)?appointment/i,
        /\bis\s*my\s*appointment\s*(confirmed|booked|scheduled)/i,
        /\bappointment\s*(date|time|detail)/i,
        /\bwhen\s*(is\s*)?(my\s*)?(next\s*)?appointment/i,
        /\bdoctor\s*appointment\s*status/i,
        /\bupcoming\s*appointment/i
      ],
      
      // ═══════════════════════════════════════════════════
      // GENERAL PATTERNS
      // ═══════════════════════════════════════════════════
      greeting: [
        /^(hi|hello|hey|hii+|hola|namaste|namaskar|vanakkam|salaam)[\s!.,]*$/i,
        /^good\s*(morning|afternoon|evening|night)[\s!.,]*$/i,
        /^(hi|hello)\s+(mam|sir|doctor|dr\.?\s*isha)[\s!.,]*$/i
      ],
      small_talk: [
        /^(ok|okay|k|kk|fine|alright|sure|yes|yeah|yep|no|nope|hmm+|mam|sir|madam|thanks|thank\s*you|thx|bye|goodbye)[\s!.,]*$/i,
        /^(got\s*it|understood|i\s*see|right|correct)[\s!.,]*$/i,
        /^(please|pls)[\s!.,]*$/i
      ],
      appointment_wait: [
        /\b(wait|hold|later|tomorrow|next\s*time)\b/i,
        /\bi('ll|will)\s*(tell|share|give|send)\s*(you\s*)?(the\s*)?(date|details|info)?\s*(later|tomorrow|soon)?/i,
        /\blet\s*me\s*(check|think|see)/i,
        /\bgive\s*me\s*(a\s*)?(moment|minute|second|time)/i
      ],
      emergency: [
        /\b(emergency|urgent|dying|chest\s*pain|heart\s*attack|unconscious|bleeding|can'?t\s*breathe|stroke|911|108|ambulance)\b/i
      ],
      medical_query: [
        /\b(symptom|pain|fever|sick|illness|disease|medicine|medication|tablet|injection|headache|stomach|vomit|diarrhea|cough|cold|infection|diabetes|bp|blood\s*pressure|sugar|cholesterol)\b/i,
        /\b(feeling|feel)\s*(sick|unwell|ill|bad|pain|tired|weak)/i,
        /\bi\s*(have|had|am\s*having)\s*(a\s*)?(pain|fever|cold|cough|headache)/i,
        /\bhealth\s*(issue|problem|concern|question)/i
      ],
      non_medical: [
        /\b(entrepreneur|business|career|job|course|education|school|college|study|exam|money|investment|stock|crypto|recipe|cook|food|restaurant|movie|music|game|sport|travel|vacation|weather|news|politics)\b/i,
        /\b(what\s*is|explain|tell\s*me\s*about)\s*(?!.*(?:symptom|disease|medicine|health|doctor|appointment|checkup|report))/i
      ],
      
      // Confirmation patterns
      confirm_yes: [
        /^(yes|yeah|yep|sure|ok|okay|confirm|proceed|go\s*ahead|book\s*it|do\s*it)[\s!.,]*$/i,
        /\byes\s*(please|confirm|book)/i,
        /\bconfirm\s*(it|booking|appointment)/i
      ],
      confirm_no: [
        /^(no|nope|cancel|stop|don'?t|wait|hold)[\s!.,]*$/i,
        /\bno\s*(thanks|thank\s*you)/i,
        /\bcancel\s*(it|booking|appointment)/i
      ]
    };

    // Health checkup packages for quick reference
    this.healthcheckupPackages = {
      basic: { name: 'Basic Health Checkup', price: '₹999', tests: 35 },
      comprehensive: { name: 'Comprehensive Health Checkup', price: '₹2,499', tests: 65 },
      executive: { name: 'Executive Health Checkup', price: '₹4,999', tests: 85 },
      master: { name: 'Master Health Checkup', price: '₹7,999', tests: 100 },
      cardiac: { name: 'Cardiac Health Checkup', price: '₹3,999', tests: 45 },
      diabetic: { name: 'Diabetic Health Checkup', price: '₹2,999', tests: 40 }
    };

    // Quick responses for specific intents
    this.quickResponses = {
      greeting: {
        en: "Hello! I'm Dr. iSHA, your health assistant. How can I help you today? 💙\n\nI can help you with:\n📋 Book a Health Checkup\n👨‍⚕️ Book a Doctor Appointment\n📊 Check your Reports\n❓ Health Questions",
        hi: "नमस्ते! मैं Dr. iSHA हूं, आपकी स्वास्थ्य सहायक। आज मैं आपकी कैसे मदद कर सकती हूं? 💙\n\nमैं इनमें मदद कर सकती हूं:\n📋 हेल्थ चेकअप बुक करें\n👨‍⚕️ डॉक्टर अपॉइंटमेंट बुक करें\n📊 रिपोर्ट देखें\n❓ स्वास्थ्य प्रश्न"
      },
      book_healthcheckup: {
        en: "Great choice! 🏥 I can help you book a health checkup.\n\nPlease choose a package:\n\n1️⃣ *Basic* - ₹999 (35 tests)\n2️⃣ *Comprehensive* - ₹2,499 (65 tests)\n3️⃣ *Executive* - ₹4,999 (85 tests)\n4️⃣ *Master* - ₹7,999 (100+ tests)\n5️⃣ *Cardiac* - ₹3,999 (Heart focused)\n6️⃣ *Diabetic* - ₹2,999 (Sugar focused)\n\nReply with the package number or name.",
        hi: "बढ़िया विकल्प! 🏥 मैं आपको हेल्थ चेकअप बुक करने में मदद कर सकती हूं।\n\nकृपया पैकेज चुनें:\n\n1️⃣ *बेसिक* - ₹999 (35 टेस्ट)\n2️⃣ *कॉम्प्रिहेंसिव* - ₹2,499 (65 टेस्ट)\n3️⃣ *एग्जीक्यूटिव* - ₹4,999 (85 टेस्ट)\n4️⃣ *मास्टर* - ₹7,999 (100+ टेस्ट)\n\nपैकेज नंबर या नाम से जवाब दें।"
      },
      book_appointment: {
        en: "I'll help you book a doctor appointment! 👨‍⚕️\n\nWhat type of doctor would you like to consult?\n\n1️⃣ General Physician\n2️⃣ Cardiologist (Heart)\n3️⃣ Dermatologist (Skin)\n4️⃣ Orthopedic (Bones/Joints)\n5️⃣ Pediatrician (Children)\n6️⃣ Gynecologist (Women's Health)\n7️⃣ ENT Specialist\n8️⃣ Other Specialist\n\nReply with the number or specialty name.",
        hi: "मैं आपको डॉक्टर अपॉइंटमेंट बुक करने में मदद करूंगी! 👨‍⚕️\n\nआप किस प्रकार के डॉक्टर से परामर्श करना चाहेंगे?\n\n1️⃣ जनरल फिजिशियन\n2️⃣ कार्डियोलॉजिस्ट (हृदय)\n3️⃣ डर्मेटोलॉजिस्ट (त्वचा)\n4️⃣ ऑर्थोपेडिक (हड्डी)\n5️⃣ बाल रोग विशेषज्ञ\n\nनंबर या विशेषज्ञता का नाम बताएं।"
      },
      healthcheckup_status: {
        en: "Let me check your health checkup status... 🔍",
        hi: "मैं आपके हेल्थ चेकअप की स्थिति देख रही हूं... 🔍"
      },
      healthcheckup_reports: {
        en: "I'll fetch your health checkup reports... 📊",
        hi: "मैं आपकी हेल्थ चेकअप रिपोर्ट ला रही हूं... 📊"
      },
      appointment_status: {
        en: "Let me check your appointment status... 📅",
        hi: "मैं आपके अपॉइंटमेंट की स्थिति देख रही हूं... 📅"
      },
      small_talk_ack: {
        en: "I'm here to help! 😊\n\nWould you like to:\n📋 Book a Health Checkup\n👨‍⚕️ Book a Doctor Appointment\n📊 Check Reports/Status",
        hi: "मैं मदद के लिए यहां हूं! 😊\n\nआप क्या करना चाहेंगे:\n📋 हेल्थ चेकअप बुक करें\n👨‍⚕️ डॉक्टर अपॉइंटमेंट बुक करें\n📊 रिपोर्ट/स्थिति देखें"
      },
      appointment_wait: {
        en: "Sure! 👍 Take your time. You can share the details whenever you're ready. I'll be here to help!",
        hi: "ज़रूर! 👍 अपना समय लें। जब भी तैयार हों विवरण बता दें। मैं यहां मदद के लिए हूं!"
      },
      non_medical: {
        en: "I'm Dr. iSHA, your health assistant. I'm designed to help with health-related services only. 🏥\n\nI can help you with:\n📋 Book a Health Checkup\n👨‍⚕️ Book a Doctor Appointment\n📊 Check Reports\n❓ Health Questions",
        hi: "मैं Dr. iSHA हूं, आपकी स्वास्थ्य सहायक। मैं केवल स्वास्थ्य संबंधी सेवाओं में मदद के लिए हूं। 🏥"
      },
      child_user: {
        en: "Hi there, little one! 🌟 I'm Dr. iSHA. For health checkups and appointments, please ask your parents or guardians to help you. Stay healthy! 💪",
        hi: "नमस्ते छोटे दोस्त! 🌟 मैं Dr. iSHA हूं। हेल्थ चेकअप के लिए अपने माता-पिता से मदद लें। स्वस्थ रहो! 💪"
      },
      awaiting_package: {
        en: "Please select a health checkup package (1-6) or type the package name:",
        hi: "कृपया हेल्थ चेकअप पैकेज चुनें (1-6) या पैकेज का नाम लिखें:"
      },
      awaiting_specialty: {
        en: "Please select a doctor specialty (1-8) or type the specialty name:",
        hi: "कृपया डॉक्टर विशेषज्ञता चुनें (1-8) या विशेषज्ञता का नाम लिखें:"
      },
      awaiting_date: {
        en: "When would you like to schedule this? You can:\n• Type a date (e.g., 'tomorrow', 'Feb 5', '5th February')\n• Say 'morning', 'afternoon', or 'evening' for today",
        hi: "आप इसे कब शेड्यूल करना चाहेंगे? आप:\n• तारीख लिखें (जैसे 'कल', '5 फरवरी')\n• 'सुबह', 'दोपहर', या 'शाम' बोलें आज के लिए"
      },
      fallback: {
        en: "I'd be happy to help! 😊\n\nI can assist you with:\n📋 Book a Health Checkup - say 'book checkup'\n👨‍⚕️ Book Doctor Appointment - say 'book appointment'\n📊 Check Checkup Status - say 'checkup status'\n📄 Get Reports - say 'my reports'\n📅 Appointment Status - say 'appointment status'",
        hi: "मुझे खुशी होगी मदद करने में! 😊\n\nमैं इनमें मदद कर सकती हूं:\n📋 हेल्थ चेकअप बुक करें\n👨‍⚕️ डॉक्टर अपॉइंटमेंट बुक करें\n📊 चेकअप स्थिति देखें\n📄 रिपोर्ट देखें"
      }
    };
  }

  /**
   * Get conversation state from Redis
   */
  async getConversationState(sessionId) {
    if (!sessionId) return null;
    try {
      const state = await cache.get(`${STATE_PREFIX}${sessionId}`);
      return state ? (typeof state === 'string' ? JSON.parse(state) : state) : null;
    } catch (e) {
      console.warn('[IntentClassifier] Redis state fetch error:', e.message);
      return null;
    }
  }

  /**
   * Set conversation state in Redis
   */
  async setConversationState(sessionId, state) {
    if (!sessionId) return;
    try {
      await cache.set(`${STATE_PREFIX}${sessionId}`, JSON.stringify(state), CONVERSATION_STATE_TTL);
    } catch (e) {
      console.warn('[IntentClassifier] Redis state save error:', e.message);
    }
  }

  /**
   * Update conversation state
   */
  async updateState(sessionId, updates) {
    const current = await this.getConversationState(sessionId) || {};
    const newState = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await this.setConversationState(sessionId, newState);
    return newState;
  }

  /**
   * Detect if user is a child based on message content
   */
  detectChildUser(message, userContext = {}) {
    // Check if user context has age
    if (userContext?.user?.age && userContext.user.age < 13) {
      return true;
    }
    
    // Check message for age indicators
    const ageMatch = message.match(/\bi\s*am\s*(\d{1,2})\s*(years?\s*old|yrs?)/i);
    if (ageMatch && parseInt(ageMatch[1]) < 13) {
      return true;
    }
    
    // Check for child-like phrases
    if (/\bi\s*am\s*a\s*(kid|child|boy|girl)\b/i.test(message)) {
      return true;
    }
    
    return false;
  }

  /**
   * Classify message intent with state awareness
   */
  async classify(query, language = 'en', sessionId = null, userContext = {}) {
    const normalizedQuery = normalizeIntentText(query);
    const lower = normalizedQuery.toLowerCase();
    const messageLength = lower.length;
    
    // Get current conversation state
    const state = sessionId ? await this.getConversationState(sessionId) : null;
    
    let intentName = 'fallback';
    let confidence = 30;
    let quickResponse = null;
    let newState = null;
    let requiresAI = false;
    let flowData = null;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Check if we're in a conversation flow (state-based)
    // ═══════════════════════════════════════════════════════════════
    if (state?.currentFlow) {
      const flowResult = await this.handleConversationFlow(lower, state, language, userContext);
      if (flowResult) {
        intentName = flowResult.intentName;
        confidence = flowResult.confidence;
        quickResponse = flowResult.quickResponse;
        newState = flowResult.newState;
        requiresAI = flowResult.requiresAI || false;
        flowData = flowResult.flowData;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: If not in flow or flow didn't handle, classify normally
    // ═══════════════════════════════════════════════════════════════
    if (!quickResponse && !requiresAI) {
      // 1. Check for child user
      if (this.detectChildUser(normalizedQuery, userContext)) {
        intentName = 'child_user';
        confidence = 95;
        quickResponse = this.quickResponses.child_user[language] || this.quickResponses.child_user.en;
      }
      // 2. Check for emergency (highest priority)
      else if (this.patterns.emergency.some(p => p.test(lower))) {
        intentName = 'emergency';
        confidence = 95;
        requiresAI = true;
      }
      // 3. Check greeting (only for short messages)
      else if (messageLength < 30 && this.patterns.greeting.some(p => p.test(lower))) {
        intentName = 'greeting';
        confidence = 90;
        quickResponse = this.quickResponses.greeting[language] || this.quickResponses.greeting.en;
      }
      // ═══════════════════════════════════════════════════════════════
      // HEALTH CHECKUP INTENTS
      // ═══════════════════════════════════════════════════════════════
      // 4. Book Health Checkup
      else if (this.patterns.book_healthcheckup.some(p => p.test(lower))) {
        intentName = 'book_healthcheckup';
        confidence = 90;
        quickResponse = this.quickResponses.book_healthcheckup[language] || this.quickResponses.book_healthcheckup.en;
        newState = { 
          currentFlow: 'healthcheckup_booking',
          step: 'awaiting_package',
          lastIntent: 'book_healthcheckup'
        };
      }
      // 5. Health Checkup Status
      else if (this.patterns.healthcheckup_status.some(p => p.test(lower))) {
        intentName = 'healthcheckup_status';
        confidence = 90;
        quickResponse = this.quickResponses.healthcheckup_status[language] || this.quickResponses.healthcheckup_status.en;
        requiresAI = true; // Need to fetch from DB
        newState = { lastIntent: 'healthcheckup_status' };
      }
      // 6. Health Checkup Reports
      else if (this.patterns.healthcheckup_reports.some(p => p.test(lower))) {
        intentName = 'healthcheckup_reports';
        confidence = 90;
        quickResponse = this.quickResponses.healthcheckup_reports[language] || this.quickResponses.healthcheckup_reports.en;
        requiresAI = true; // Need to fetch from DB
        newState = { lastIntent: 'healthcheckup_reports' };
      }
      // ═══════════════════════════════════════════════════════════════
      // DOCTOR APPOINTMENT INTENTS
      // ═══════════════════════════════════════════════════════════════
      // 7. Book Doctor Appointment
      else if (this.patterns.book_appointment.some(p => p.test(lower))) {
        intentName = 'book_appointment';
        confidence = 90;
        quickResponse = this.quickResponses.book_appointment[language] || this.quickResponses.book_appointment.en;
        newState = { 
          currentFlow: 'appointment_booking',
          step: 'awaiting_specialty',
          lastIntent: 'book_appointment'
        };
      }
      // 8. Appointment Status
      else if (this.patterns.appointment_status.some(p => p.test(lower))) {
        intentName = 'appointment_status';
        confidence = 90;
        quickResponse = this.quickResponses.appointment_status[language] || this.quickResponses.appointment_status.en;
        requiresAI = true; // Need to fetch from DB
        newState = { lastIntent: 'appointment_status' };
      }
      // ═══════════════════════════════════════════════════════════════
      // GENERAL INTENTS
      // ═══════════════════════════════════════════════════════════════
      // 9. Check small talk / acknowledgments
      else if (messageLength < 20 && this.patterns.small_talk.some(p => p.test(lower))) {
        intentName = 'small_talk';
        confidence = 85;
        
        // Context-aware response based on last intent
        if (state?.lastIntent === 'book_healthcheckup') {
          quickResponse = this.quickResponses.awaiting_package[language] || this.quickResponses.awaiting_package.en;
        } else if (state?.lastIntent === 'book_appointment') {
          quickResponse = this.quickResponses.awaiting_specialty[language] || this.quickResponses.awaiting_specialty.en;
        } else if (state?.waitingFor) {
          quickResponse = `I'm still waiting for your ${state.waitingFor}. Take your time! 😊`;
        } else {
          quickResponse = this.quickResponses.small_talk_ack[language] || this.quickResponses.small_talk_ack.en;
        }
      }
      // 10. Check appointment wait/delay
      else if (this.patterns.appointment_wait.some(p => p.test(lower))) {
        intentName = 'appointment_wait';
        confidence = 85;
        quickResponse = this.quickResponses.appointment_wait[language] || this.quickResponses.appointment_wait.en;
        newState = { ...state, waitingFor: 'details' };
      }
      // 11. Check non-medical query
      else if (this.patterns.non_medical.some(p => p.test(lower)) && 
               !this.patterns.medical_query.some(p => p.test(lower))) {
        intentName = 'non_medical';
        confidence = 80;
        quickResponse = this.quickResponses.non_medical[language] || this.quickResponses.non_medical.en;
      }
      // 12. Check medical query
      else if (this.patterns.medical_query.some(p => p.test(lower))) {
        intentName = 'medical_query';
        confidence = 75;
        requiresAI = true;
        newState = { lastIntent: 'medical_query' };
      }
      // 13. Fallback for very short messages
      else if (messageLength < 15) {
        intentName = 'small_talk';
        confidence = 50;
        
        if (state?.waitingFor) {
          quickResponse = `I'm still here! Whenever you're ready to share your ${state.waitingFor}, just let me know. 😊`;
        } else {
          quickResponse = this.quickResponses.fallback[language] || this.quickResponses.fallback.en;
        }
      }
      // 14. General fallback
      else {
        quickResponse = this.quickResponses.fallback[language] || this.quickResponses.fallback.en;
      }
    }

    // Update conversation state
    if (sessionId && newState) {
      await this.updateState(sessionId, newState);
    }

    return {
      primary: {
        name: intentName,
        confidence: confidence,
        action: intentName
      },
      quickResponse: quickResponse,
      requiresAI: requiresAI,
      conversationState: state,
      flowData: flowData,
      method: 'pattern-state'
    };
  }

  /**
   * Handle conversation flow based on current state
   */
  async handleConversationFlow(message, state, language, userContext) {
    const { currentFlow, step } = state;
    
    // ═══════════════════════════════════════════════════════════════
    // HEALTH CHECKUP BOOKING FLOW
    // ═══════════════════════════════════════════════════════════════
    if (currentFlow === 'healthcheckup_booking') {
      
      // Step 1: Awaiting package selection
      if (step === 'awaiting_package') {
        const packageSelection = this.detectPackageSelection(message);
        if (packageSelection) {
          return {
            intentName: 'healthcheckup_package_selected',
            confidence: 90,
            quickResponse: `Great choice! You selected *${packageSelection.name}* (${packageSelection.price}) 📋\n\n${this.quickResponses.awaiting_date[language] || this.quickResponses.awaiting_date.en}`,
            newState: {
              currentFlow: 'healthcheckup_booking',
              step: 'awaiting_date',
              selectedPackage: packageSelection,
              lastIntent: 'healthcheckup_package_selected'
            },
            flowData: { packageSelected: packageSelection }
          };
        }
        // Invalid selection
        return {
          intentName: 'invalid_selection',
          confidence: 70,
          quickResponse: this.quickResponses.awaiting_package[language] || this.quickResponses.awaiting_package.en,
          newState: state
        };
      }
      
      // Step 2: Awaiting date selection
      if (step === 'awaiting_date') {
        const dateSelection = this.detectDateSelection(message);
        if (dateSelection) {
          const pkg = state.selectedPackage;
          return {
            intentName: 'healthcheckup_confirm',
            confidence: 90,
            quickResponse: `📋 *Confirm Health Checkup Booking*\n\n📦 Package: ${pkg?.name || 'Selected Package'}\n💰 Price: ${pkg?.price || 'As per package'}\n📅 Date: ${dateSelection.display}\n\nReply *YES* to confirm or *NO* to cancel.`,
            newState: {
              currentFlow: 'healthcheckup_booking',
              step: 'confirming',
              selectedPackage: pkg,
              selectedDate: dateSelection,
              lastIntent: 'healthcheckup_confirm'
            },
            flowData: { dateSelected: dateSelection }
          };
        }
        return {
          intentName: 'invalid_date',
          confidence: 70,
          quickResponse: this.quickResponses.awaiting_date[language] || this.quickResponses.awaiting_date.en,
          newState: state
        };
      }
      
      // Step 3: Confirming booking
      if (step === 'confirming') {
        if (this.patterns.confirm_yes.some(p => p.test(message))) {
          return {
            intentName: 'healthcheckup_confirmed',
            confidence: 95,
            quickResponse: `✅ *Health Checkup Booked Successfully!*\n\n📦 Package: ${state.selectedPackage?.name}\n📅 Date: ${state.selectedDate?.display}\n\nOur team will call you to confirm the exact time slot.\n\nYou'll receive:\n📱 SMS confirmation\n📧 Email with preparation guidelines\n\nIs there anything else I can help you with?`,
            newState: { lastIntent: 'healthcheckup_confirmed', currentFlow: null },
            requiresAI: true, // Trigger actual booking
            flowData: { 
              action: 'book_healthcheckup',
              package: state.selectedPackage,
              date: state.selectedDate,
              confirmed: true
            }
          };
        }
        if (this.patterns.confirm_no.some(p => p.test(message))) {
          return {
            intentName: 'booking_cancelled',
            confidence: 90,
            quickResponse: "No problem! 👍 Your booking has been cancelled.\n\nWould you like to:\n📋 Try a different package\n👨‍⚕️ Book a doctor appointment instead\n\nJust let me know how I can help!",
            newState: { lastIntent: 'booking_cancelled', currentFlow: null }
          };
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // DOCTOR APPOINTMENT BOOKING FLOW
    // ═══════════════════════════════════════════════════════════════
    if (currentFlow === 'appointment_booking') {
      
      // Step 1: Awaiting specialty selection
      if (step === 'awaiting_specialty') {
        const specialty = this.detectSpecialtySelection(message);
        if (specialty) {
          return {
            intentName: 'specialty_selected',
            confidence: 90,
            quickResponse: `Great! You want to consult a *${specialty.name}* 👨‍⚕️\n\n${this.quickResponses.awaiting_date[language] || this.quickResponses.awaiting_date.en}`,
            newState: {
              currentFlow: 'appointment_booking',
              step: 'awaiting_date',
              selectedSpecialty: specialty,
              lastIntent: 'specialty_selected'
            },
            flowData: { specialtySelected: specialty }
          };
        }
        return {
          intentName: 'invalid_selection',
          confidence: 70,
          quickResponse: this.quickResponses.awaiting_specialty[language] || this.quickResponses.awaiting_specialty.en,
          newState: state
        };
      }
      
      // Step 2: Awaiting date selection
      if (step === 'awaiting_date') {
        const dateSelection = this.detectDateSelection(message);
        if (dateSelection) {
          const specialty = state.selectedSpecialty;
          return {
            intentName: 'appointment_confirm',
            confidence: 90,
            quickResponse: `📅 *Confirm Doctor Appointment*\n\n👨‍⚕️ Specialty: ${specialty?.name || 'Selected Doctor'}\n📅 Date: ${dateSelection.display}\n\nReply *YES* to confirm or *NO* to cancel.`,
            newState: {
              currentFlow: 'appointment_booking',
              step: 'confirming',
              selectedSpecialty: specialty,
              selectedDate: dateSelection,
              lastIntent: 'appointment_confirm'
            },
            flowData: { dateSelected: dateSelection }
          };
        }
        return {
          intentName: 'invalid_date',
          confidence: 70,
          quickResponse: this.quickResponses.awaiting_date[language] || this.quickResponses.awaiting_date.en,
          newState: state
        };
      }
      
      // Step 3: Confirming appointment
      if (step === 'confirming') {
        if (this.patterns.confirm_yes.some(p => p.test(message))) {
          return {
            intentName: 'appointment_confirmed',
            confidence: 95,
            quickResponse: `✅ *Doctor Appointment Booked Successfully!*\n\n👨‍⚕️ Specialty: ${state.selectedSpecialty?.name}\n📅 Date: ${state.selectedDate?.display}\n\nOur team will call you to confirm:\n• Doctor's name\n• Exact time slot\n• Consultation fee\n\nYou'll receive an SMS & email confirmation.\n\nIs there anything else I can help you with?`,
            newState: { lastIntent: 'appointment_confirmed', currentFlow: null },
            requiresAI: true, // Trigger actual booking
            flowData: { 
              action: 'book_appointment',
              specialty: state.selectedSpecialty,
              date: state.selectedDate,
              confirmed: true
            }
          };
        }
        if (this.patterns.confirm_no.some(p => p.test(message))) {
          return {
            intentName: 'booking_cancelled',
            confidence: 90,
            quickResponse: "No problem! 👍 Your appointment booking has been cancelled.\n\nWould you like to:\n👨‍⚕️ Try a different specialist\n📋 Book a health checkup instead\n\nJust let me know how I can help!",
            newState: { lastIntent: 'booking_cancelled', currentFlow: null }
          };
        }
      }
    }
    
    return null; // Flow didn't handle the message
  }

  /**
   * Detect health checkup package selection
   */
  detectPackageSelection(message) {
    const lower = message.toLowerCase().trim();
    
    const packageMap = {
      '1': 'basic', 'basic': 'basic', 'one': 'basic',
      '2': 'comprehensive', 'comprehensive': 'comprehensive', 'two': 'comprehensive', 'comp': 'comprehensive',
      '3': 'executive', 'executive': 'executive', 'three': 'executive', 'exec': 'executive',
      '4': 'master', 'master': 'master', 'four': 'master', 'full': 'master',
      '5': 'cardiac', 'cardiac': 'cardiac', 'heart': 'cardiac', 'five': 'cardiac',
      '6': 'diabetic', 'diabetic': 'diabetic', 'diabetes': 'diabetic', 'sugar': 'diabetic', 'six': 'diabetic'
    };
    
    const key = packageMap[lower];
    if (key && this.healthcheckupPackages[key]) {
      return this.healthcheckupPackages[key];
    }
    
    // Fuzzy match
    for (const [pkgKey, pkg] of Object.entries(this.healthcheckupPackages)) {
      if (lower.includes(pkgKey) || lower.includes(pkg.name.toLowerCase())) {
        return pkg;
      }
    }
    
    return null;
  }

  /**
   * Detect doctor specialty selection
   */
  detectSpecialtySelection(message) {
    const lower = message.toLowerCase().trim();
    
    const specialties = {
      '1': { id: 'general', name: 'General Physician' },
      'general': { id: 'general', name: 'General Physician' },
      'gp': { id: 'general', name: 'General Physician' },
      'physician': { id: 'general', name: 'General Physician' },
      '2': { id: 'cardio', name: 'Cardiologist' },
      'cardio': { id: 'cardio', name: 'Cardiologist' },
      'heart': { id: 'cardio', name: 'Cardiologist' },
      'cardiologist': { id: 'cardio', name: 'Cardiologist' },
      '3': { id: 'derma', name: 'Dermatologist' },
      'derma': { id: 'derma', name: 'Dermatologist' },
      'skin': { id: 'derma', name: 'Dermatologist' },
      'dermatologist': { id: 'derma', name: 'Dermatologist' },
      '4': { id: 'ortho', name: 'Orthopedic Specialist' },
      'ortho': { id: 'ortho', name: 'Orthopedic Specialist' },
      'bone': { id: 'ortho', name: 'Orthopedic Specialist' },
      'orthopedic': { id: 'ortho', name: 'Orthopedic Specialist' },
      '5': { id: 'pediatric', name: 'Pediatrician' },
      'pediatric': { id: 'pediatric', name: 'Pediatrician' },
      'child': { id: 'pediatric', name: 'Pediatrician' },
      'pediatrician': { id: 'pediatric', name: 'Pediatrician' },
      '6': { id: 'gynec', name: 'Gynecologist' },
      'gynec': { id: 'gynec', name: 'Gynecologist' },
      'women': { id: 'gynec', name: 'Gynecologist' },
      'gynecologist': { id: 'gynec', name: 'Gynecologist' },
      '7': { id: 'ent', name: 'ENT Specialist' },
      'ent': { id: 'ent', name: 'ENT Specialist' },
      'ear': { id: 'ent', name: 'ENT Specialist' },
      'nose': { id: 'ent', name: 'ENT Specialist' },
      'throat': { id: 'ent', name: 'ENT Specialist' },
      '8': { id: 'other', name: 'Specialist' }
    };
    
    return specialties[lower] || null;
  }

  /**
   * Detect date selection from message
   */
  detectDateSelection(message) {
    const lower = message.toLowerCase().trim();
    const today = new Date();
    
    // Check for relative dates
    if (/today|aaj/i.test(lower)) {
      return { date: today, display: `Today (${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })})` };
    }
    if (/tomorrow|kal/i.test(lower)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { date: tomorrow, display: `Tomorrow (${tomorrow.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })})` };
    }
    if (/day\s*after\s*tomorrow|parso/i.test(lower)) {
      const dayAfter = new Date(today);
      dayAfter.setDate(dayAfter.getDate() + 2);
      return { date: dayAfter, display: dayAfter.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }) };
    }
    
    // Check for time of day (assume today)
    if (/morning|subah/i.test(lower)) {
      return { date: today, timeSlot: 'morning', display: `Today Morning (${today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` };
    }
    if (/afternoon|dopahar/i.test(lower)) {
      return { date: today, timeSlot: 'afternoon', display: `Today Afternoon (${today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` };
    }
    if (/evening|shaam/i.test(lower)) {
      return { date: today, timeSlot: 'evening', display: `Today Evening (${today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` };
    }
    
    // Try to parse date patterns
    const datePatterns = [
      /(\d{1,2})\s*(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
      /(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*(\d{1,2})/i
    ];
    
    for (const pattern of datePatterns) {
      const match = lower.match(pattern);
      if (match) {
        // Simple parsing - in production, use a proper date library
        const parsedDate = new Date(message);
        if (!isNaN(parsedDate.getTime())) {
          return { date: parsedDate, display: parsedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) };
        }
      }
    }
    
    return null;
  }

  /**
   * Hybrid classification with state management
   */
  async classifyHybrid(query, language = 'en', sessionId = null, userContext = {}) {
    return this.classify(query, language, sessionId, userContext);
  }

  /**
   * Get handling strategy for intent
   */
  getHandlingStrategy(classification) {
    const intent = classification?.primary?.name || 'fallback';
    
    const strategies = {
      // Emergency - highest priority
      emergency: { strategy: 'emergency', action: 'emergency_response', requiresAI: true, priority: 1 },
      
      // Health Checkup Flow
      book_healthcheckup: { strategy: 'booking_flow', action: 'start_healthcheckup_flow', requiresAI: false, priority: 2 },
      healthcheckup_status: { strategy: 'status', action: 'fetch_healthcheckup_status', requiresAI: true, priority: 2 },
      healthcheckup_reports: { strategy: 'reports', action: 'fetch_healthcheckup_reports', requiresAI: true, priority: 2 },
      healthcheckup_package_selected: { strategy: 'booking_flow', action: 'continue_healthcheckup_flow', requiresAI: false, priority: 2 },
      healthcheckup_confirm: { strategy: 'booking_flow', action: 'confirm_healthcheckup', requiresAI: false, priority: 2 },
      healthcheckup_confirmed: { strategy: 'booking', action: 'execute_healthcheckup_booking', requiresAI: true, priority: 2 },
      
      // Doctor Appointment Flow
      book_appointment: { strategy: 'booking_flow', action: 'start_appointment_flow', requiresAI: false, priority: 3 },
      appointment_status: { strategy: 'status', action: 'fetch_appointment_status', requiresAI: true, priority: 3 },
      specialty_selected: { strategy: 'booking_flow', action: 'continue_appointment_flow', requiresAI: false, priority: 3 },
      appointment_confirm: { strategy: 'booking_flow', action: 'confirm_appointment', requiresAI: false, priority: 3 },
      appointment_confirmed: { strategy: 'booking', action: 'execute_appointment_booking', requiresAI: true, priority: 3 },
      
      // Medical Query
      medical_query: { strategy: 'medical', action: 'ai_response', requiresAI: true, priority: 4 },
      
      // Quick responses (no AI needed)
      greeting: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      small_talk: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      appointment_wait: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      non_medical: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      child_user: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      booking_cancelled: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      invalid_selection: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      invalid_date: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 5 },
      
      // Fallback
      fallback: { strategy: 'quick', action: 'quick_response', requiresAI: false, priority: 6 }
    };
    
    return strategies[intent] || strategies.fallback;
  }

  /**
   * Clear conversation state (reset flow)
   */
  async clearState(sessionId) {
    if (!sessionId) return;
    try {
      await cache.del(`${STATE_PREFIX}${sessionId}`);
    } catch (e) {
      console.warn('[IntentClassifier] Redis state clear error:', e.message);
    }
  }

  /**
   * Language detection
   */
  detectLanguage(text) {
    if (/[\u0900-\u097F]/.test(text)) return 'hi';  // Hindi
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';  // Tamil
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te';  // Telugu
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';  // Kannada
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';  // Malayalam
    if (/[\u0980-\u09FF]/.test(text)) return 'bn';  // Bengali
    return 'en';
  }

  /**
   * Get intent response
   */
  getIntentResponse(intentName, language = 'en') {
    const responses = this.quickResponses[intentName] || this.quickResponses.fallback;
    return responses[language] || responses.en;
  }
}

export default new IntentClassifier();
