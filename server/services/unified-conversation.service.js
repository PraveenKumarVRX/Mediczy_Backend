import medicalAIService from './medicalAI.service.js';
import intentClassifier from '../utils/intentClassifier.js';
import translationService from './translation.service.js';

console.log('[UnifiedConversation] Module loaded at', new Date().toISOString());

/**
 * Unified Conversation Service
 * One Dr. iSHA brain for all channels (web, WhatsApp, admin chat, etc.)
 * 
 * Multilingual Support:
 * - LaBSE for semantic understanding across 109 languages
 * - IndicTrans2 for Indian language translation (22 languages)
 */
class UnifiedConversationService {
  constructor() {
    // Initialize translation service in background
    translationService.initialize().catch(err => {
      console.warn('[UnifiedConversation] Translation init error:', err.message);
    });
  }

  async processMessage({
    message,
    channel = 'web',
    userContext = {},
    sessionId,
    language,
    conversationId,
    identifier
  }) {
    console.log('[UnifiedConversation] processMessage called with:', { message: (message || '').substring(0, 30), channel });
    
    if (!message || typeof message !== 'string') {
      return {
        success: false,
        shouldReply: true,
        response: "I'm sorry, I didn't receive a valid message.",
        provider: 'unified',
        channel
      };
    }

    const normalizedMessage = message.trim();
    const lowerMessage = normalizedMessage.toLowerCase();
    
    // Multilingual greeting patterns - includes native scripts
    // Patterns allow optional name suffix (e.g., "Hola Isha", "வணக்கம் ஈஷா", "Hi Dr. iSHA")
    const greetingPatterns = [
      // English greetings (with optional name like "Hi Isha", "Hello Dr. iSHA")
      /^(hi|hello|hey|good morning|good afternoon|good evening)(\s+(isha|dr\.?\s*isha|doctor))?(\b|!|\.)?$/i,
      /^(namaste|namaskar|vanakkam|salaam|pranam)(\s+(isha|dr\.?\s*isha))?(\b|!|\.)?$/i,
      // European languages (with optional name)
      /^(hola|buenos dias|buenas tardes|buenas noches)(\s+(isha|dr\.?\s*isha))?(\b|!|\.)?$/i,  // Spanish
      /^(bonjour|salut|bonsoir)(\s+(isha|dr\.?\s*isha))?(\b|!|\.)?$/i,  // French
      /^(hallo|guten tag|guten morgen)(\s+(isha|dr\.?\s*isha))?(\b|!|\.)?$/i,  // German
      /^(olá|oi|bom dia|boa tarde)(\s+(isha|dr\.?\s*isha))?(\b|!|\.)?$/i,  // Portuguese
      /^(ciao|buongiorno|buonasera)(\s+(isha|dr\.?\s*isha))?(\b|!|\.)?$/i,  // Italian
      // Indian scripts (allow any suffix for name)
      /^வணக்கம்/,           // Tamil: Vanakkam (any suffix like ஈஷா)
      /^நமஸ்காரம்/,         // Tamil: Namaskaram
      /^नमस्ते/,             // Hindi: Namaste
      /^नमस्कार/,            // Hindi/Marathi: Namaskar
      /^నమస్తే/,             // Telugu: Namaste (common form)
      /^నమస్కారం/,          // Telugu: Namaskaram (formal)
      /^ನಮಸ್ಕಾರ/,           // Kannada: Namaskara
      /^নমস্কার/,            // Bengali: Namaskar
      /^നമസ്കാരം/,          // Malayalam: Namaskaram
      /^નમસ્તે/,             // Gujarati: Namaste
      /^ਸਤ ਸ੍ਰੀ ਅਕਾਲ/,       // Punjabi: Sat Sri Akal
      /^سلام/,              // Urdu: Salaam
      /^ہیلو/,              // Urdu: Hello
      // Arabic
      /^(مرحبا|السلام عليكم|صباح الخير)/,  // Arabic greetings
    ];
    const isGreeting = greetingPatterns.some(pattern => pattern.test(normalizedMessage));
    
    // Detect greeting language for proper response (overrides auto-detection for accuracy)
    let greetingLanguage = null;
    if (isGreeting) {
      if (/^(hola|buenos)/i.test(lowerMessage)) greetingLanguage = 'es';
      else if (/^(bonjour|salut|bonsoir)/i.test(lowerMessage)) greetingLanguage = 'fr';
      else if (/^(hallo|guten)/i.test(lowerMessage)) greetingLanguage = 'de';
      else if (/^(olá|oi|bom dia|boa)/i.test(lowerMessage)) greetingLanguage = 'pt';
      else if (/^(ciao|buon)/i.test(lowerMessage)) greetingLanguage = 'it';
      else if (/^வணக்கம்|^நமஸ்காரம்/.test(normalizedMessage)) greetingLanguage = 'ta';
      else if (/^నమస్తే|^నమస్కారం/.test(normalizedMessage)) greetingLanguage = 'te';
      else if (/^नमस्ते|^नमस्कार/.test(normalizedMessage)) greetingLanguage = 'hi';
      else if (/^ನಮಸ್ಕಾರ/.test(normalizedMessage)) greetingLanguage = 'kn';
      else if (/^নমস্কার/.test(normalizedMessage)) greetingLanguage = 'bn';
      else if (/^നമസ്കാരം/.test(normalizedMessage)) greetingLanguage = 'ml';
      else if (/^નમસ્તે/.test(normalizedMessage)) greetingLanguage = 'gu';
      else if (/^ਸਤ ਸ੍ਰੀ ਅਕਾਲ/.test(normalizedMessage)) greetingLanguage = 'pa';
      else if (/^سلام|^ہیلو/.test(normalizedMessage)) greetingLanguage = 'ur';
      else if (/^(مرحبا|السلام|صباح)/.test(normalizedMessage)) greetingLanguage = 'ar';
    }
    
    const isMembershipQuery = /membership|benefit|plan|coverage|subscription/i.test(lowerMessage);

    // === MULTILINGUAL PROCESSING ===
    // 1. Detect language using LaBSE patterns or provided language
    let detectedLanguage = greetingLanguage || language || await translationService.detectLanguage(normalizedMessage);
    const resolvedSessionId = sessionId || conversationId || this.buildSessionId(channel, identifier || userContext?.userId || userContext?.id || userContext?.phoneNumber);

    // 2. Translate input to English if non-English (for AI processing)
    let processedMessage = normalizedMessage;
    let translationInfo = null;
    
    if (detectedLanguage !== 'en') {
      try {
        const inputTranslation = await translationService.processMultilingualInput(normalizedMessage, detectedLanguage);
        if (inputTranslation.translated) {
          processedMessage = inputTranslation.processedMessage;
          translationInfo = {
            inputTranslated: true,
            originalMessage: normalizedMessage,
            detectedLanguage: inputTranslation.detectedLanguage,
            provider: inputTranslation.provider
          };
          console.log('[UnifiedConversation] Translated ' + detectedLanguage + ' to en:', processedMessage.substring(0, 50) + '...');
        }
      } catch (translationError) {
        console.warn('[UnifiedConversation] Input translation failed:', translationError.message);
      }
    }

    // Multilingual greetings with native language responses
    if (isGreeting) {
      // Native language greeting responses (fallback when translation API unavailable)
      const nativeGreetings = {
        ta: "வணக்கம்! நான் Dr. iSHA. இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
        hi: "नमस्ते! मैं Dr. iSHA हूं। आज मैं आपकी कैसे मदद कर सकती हूं?",
        te: "నమస్కారం! నేను Dr. iSHA. ఈ రోజు మీకు ఎలా సహాయం చేయగలను?",
        kn: "ನಮಸ್ಕಾರ! ನಾನು Dr. iSHA. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
        ml: "നമസ്കാരം! ഞാൻ Dr. iSHA ആണ്. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കും?",
        bn: "নমস্কার! আমি Dr. iSHA। আজ আমি আপনাকে কিভাবে সাহায্য করতে পারি?",
        gu: "નમસ્તે! હું Dr. iSHA છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
        mr: "नमस्कार! मी Dr. iSHA आहे. आज मी तुम्हाला कशी मदत करू शकतो?",
        pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ Dr. iSHA ਹਾਂ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੀ ਹਾਂ?",
        ur: "السلام علیکم! میں Dr. iSHA ہوں۔ آج میں آپ کی کیسے مدد کر سکتی ہوں؟",
        or: "ନମସ୍କାର! ମୁଁ Dr. iSHA। ଆଜି ମୁଁ ଆପଣଙ୍କୁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?",
        as: "নমস্কাৰ! মই Dr. iSHA। আজি মই আপোনাক কেনেকৈ সহায় কৰিব পাৰোঁ?",
        // European languages
        es: "¡Hola! Soy Dr. iSHA. ¿Cómo puedo ayudarte hoy?",
        fr: "Bonjour! Je suis Dr. iSHA. Comment puis-je vous aider aujourd'hui?",
        de: "Hallo! Ich bin Dr. iSHA. Wie kann ich Ihnen heute helfen?",
        pt: "Olá! Sou Dr. iSHA. Como posso ajudá-lo hoje?",
        it: "Ciao! Sono Dr. iSHA. Come posso aiutarti oggi?",
        // Arabic
        ar: "مرحبا! أنا Dr. iSHA. كيف يمكنني مساعدتك اليوم؟",
        en: "Hi! I'm Dr. iSHA. How can I help you today?"
      };
      
      // Use greeting language if detected, otherwise use auto-detected language
      const responseLanguage = greetingLanguage || detectedLanguage;
      
      // Try native greeting first, then translation, then English fallback
      let greetingResponse = nativeGreetings[responseLanguage] || nativeGreetings['en'];
      
      // Try translation API as backup (if native not available)
      if (!nativeGreetings[responseLanguage] && responseLanguage !== 'en') {
        try {
          const translatedGreeting = await translationService.processMultilingualOutput(nativeGreetings['en'], responseLanguage);
          if (translatedGreeting.translated) {
            greetingResponse = translatedGreeting.processedResponse;
          }
        } catch (e) { /* use native or English */ }
      }
      
      console.log('[UnifiedConversation] Greeting detected, language:', responseLanguage, ', response:', greetingResponse.substring(0, 30) + '...');
      
      return {
        success: true,
        shouldReply: true,
        response: greetingResponse,
        provider: 'unified-local',
        sessionId: resolvedSessionId,
        language: responseLanguage,
        channel,
        translation: translationInfo
      };
    }

    if (isMembershipQuery) {
      let membershipResponse = "Sure - please share your membership ID or corporate name (and employee ID if available), and I'll pull your plan benefits.";
      
      if (detectedLanguage !== 'en') {
        try {
          const translated = await translationService.processMultilingualOutput(membershipResponse, detectedLanguage);
          if (translated.translated) {
            membershipResponse = translated.processedResponse;
          }
        } catch (e) { /* use English */ }
      }
      
      return {
        success: true,
        shouldReply: true,
        response: membershipResponse,
        provider: 'unified-local',
        sessionId: resolvedSessionId,
        language: detectedLanguage,
        channel,
        translation: translationInfo
      };
    }

    let result;
    try {
      // Use LaBSE-enhanced hybrid classification
      const classification = intentClassifier.hybridEnabled
        ? await intentClassifier.classifyHybrid(processedMessage, 'en')  // Classify in English
        : intentClassifier.classify(processedMessage, 'en');

      console.log('[UnifiedConversation] Intent classification:', classification?.primary?.name, 'confidence:', classification?.primary?.confidence);

      // REMOVED: Special handling for appointment_status
      // ALL queries now route to SIB AI for intelligent, context-aware responses
      // SIB ChatBotlet will handle appointment status queries with proper context

      // Detect explicit human handoff request
      const explicitHandoffRequest = /\b(human|agent|real person|representative|talk to someone|speak to someone|customer service|support team|live agent|live chat|connect me|transfer me|escalate)\b/i.test(normalizedMessage);
      
      // Detect department based on query keywords
      const detectDepartment = (msg) => {
        const lower = msg.toLowerCase();
        if (/\b(bill|payment|invoice|charge|refund|receipt|cost|price|fee|insurance claim)\b/i.test(lower)) return 'billing';
        if (/\b(medicine|pharmacy|drug|prescription refill|order medicine|buy medicine)\b/i.test(lower)) return 'pharmacy';
        if (/\b(appointment|book|schedule|reschedule|cancel appointment|slot|availability)\b/i.test(lower)) return 'appointments';
        if (/\b(emergency|urgent|critical|severe|immediately|ambulance|chest pain|breathing)\b/i.test(lower)) return 'emergency';
        if (/\b(technical|bug|error|not working|app issue|login problem|password|account)\b/i.test(lower)) return 'technical';
        return 'general';
      };
      const detectedDepartment = detectDepartment(normalizedMessage);

      const needsHumanHandoff =
        explicitHandoffRequest ||
        (classification?.primary?.confidence || 0) < 30 ||
        normalizedMessage.length > 300 ||
        /second opinion|legal|insurance claim|multiple conditions|complicated|not sure|confused/i.test(normalizedMessage);

      console.log('[UnifiedConversation] Handoff check:', { 
        message: normalizedMessage.substring(0, 50), 
        explicitHandoffRequest,
        confidence: classification?.primary?.confidence,
        needsHumanHandoff
      });

      const patientData = {
        user: userContext?.user || null,
        profile: userContext?.profile || null,
        demographics: userContext?.demographics || null,
        appointments: userContext?.appointments || null,
        prescriptions: userContext?.prescriptions || null,
        conditions: userContext?.conditions || null,
        activeMedications: userContext?.activeMedications || null,
        allergies: userContext?.allergies || null,
        conversationHistory: userContext?.conversationHistory || userContext?.history || null,
        summary: userContext?.summary || null,
        channel
      };

      // Process with AI - ALL queries route to SIB ChatBotlet
      result = await medicalAIService.consultMedical(
        processedMessage,  // Use translated English message
        resolvedSessionId,
        'en',  // AI processes in English
        {
          ...userContext,
          channel,
          patientData,
          originalLanguage: detectedLanguage,
          originalMessage: normalizedMessage
        }
      );

      // 3. Translate AI response back to user's language
      if (detectedLanguage !== 'en' && result?.response) {
        try {
          const outputTranslation = await translationService.processMultilingualOutput(result.response, detectedLanguage);
          if (outputTranslation.translated) {
            result.originalResponse = result.response;
            result.response = outputTranslation.processedResponse;
            translationInfo = {
              ...translationInfo,
              outputTranslated: true,
              responseProvider: outputTranslation.provider
            };
            console.log('[UnifiedConversation] Translated response to ' + detectedLanguage);
          }
        } catch (translationError) {
          console.warn('[UnifiedConversation] Output translation failed:', translationError.message);
        }
      }

      if (needsHumanHandoff) {
        // Determine handoff reason for logging/routing
        let handoffReason = 'low_confidence';
        if (explicitHandoffRequest) handoffReason = 'user_requested';
        else if (normalizedMessage.length > 300) handoffReason = 'complex_query';
        else if (/second opinion|legal|insurance claim|multiple conditions|complicated|not sure|confused/i.test(normalizedMessage)) handoffReason = 'sensitive_topic';
        
        // IMPORTANT: Setting handoff fields on result object
        result.handoffSuggested = true;
        result.handoffRequired = explicitHandoffRequest;
        result.handoffDepartment = detectedDepartment;
        result.handoffReason = handoffReason;
        
        console.log('[UnifiedConversation] 🤝 Human handoff needed:', { reason: handoffReason, department: detectedDepartment, explicit: explicitHandoffRequest, handoffRequired: result.handoffRequired });
        
        let handoffMsg = explicitHandoffRequest 
          ? "\n\n✅ I'm connecting you to a human agent now. Someone from our team will assist you shortly."
          : "\n\nIf you'd like, I can connect you to a human agent. Just say 'talk to human' or 'agent please'.";
        
        if (detectedDepartment !== 'general') {
          const deptNames = { billing: 'billing team', pharmacy: 'pharmacy team', appointments: 'scheduling team', emergency: 'emergency support', technical: 'technical support' };
          handoffMsg = handoffMsg.replace('human agent', deptNames[detectedDepartment] || 'human agent');
        }
        
        if (detectedLanguage !== 'en') {
          try {
            const translated = await translationService.processMultilingualOutput(handoffMsg, detectedLanguage);
            if (translated.translated) handoffMsg = translated.processedResponse;
          } catch (e) {}
        }
        result.response = result.response + handoffMsg;
      }
    } catch (error) {
      const classification = intentClassifier.hybridEnabled
        ? await intentClassifier.classifyHybrid(processedMessage, 'en')
        : intentClassifier.classify(processedMessage, 'en');

      let intentResponse = classification?.primary?.name
        ? intentClassifier.getIntentResponse(classification.primary.name, 'en')
        : null;

      let fallbackResponse = intentResponse || "Thanks for your message. Please share a bit more detail so I can help you better.";
      
      // Translate fallback if needed
      if (detectedLanguage !== 'en') {
        try {
          const translated = await translationService.processMultilingualOutput(fallbackResponse, detectedLanguage);
          if (translated.translated) fallbackResponse = translated.processedResponse;
        } catch (e) {}
      }

      return {
        success: true,
        shouldReply: true,
        response: fallbackResponse,
        provider: 'unified-fallback',
        sessionId: resolvedSessionId,
        language: detectedLanguage,
        channel,
        error: error?.message,
        translation: translationInfo
      };
    }

    let finalResponse = String(result?.response || '').trim();
    const lowerFinal = finalResponse.toLowerCase();
    if (lowerFinal.includes('error processing your request') || lowerFinal.includes('please try again later')) {
      const classification = intentClassifier.hybridEnabled
        ? await intentClassifier.classifyHybrid(processedMessage, 'en')
        : intentClassifier.classify(processedMessage, 'en');
      let intentResponse = classification?.primary?.name
        ? intentClassifier.getIntentResponse(classification.primary.name, 'en')
        : null;
      finalResponse = intentResponse || "Thanks for your message. Please share a bit more detail so I can help you better.";
      
      // Translate if needed
      if (detectedLanguage !== 'en') {
        try {
          const translated = await translationService.processMultilingualOutput(finalResponse, detectedLanguage);
          if (translated.translated) finalResponse = translated.processedResponse;
        } catch (e) {}
      }
    }
    
    return {
      ...result,
      success: true,
      shouldReply: true,
      response: finalResponse || "Hi! I'm Dr. iSHA. How can I help you today?",
      sessionId: resolvedSessionId,
      language: detectedLanguage,
      channel,
      translation: translationInfo,
      // Explicitly include handoff fields (they may be on result from the try block)
      handoffSuggested: result?.handoffSuggested || false,
      handoffRequired: result?.handoffRequired || false,
      handoffDepartment: result?.handoffDepartment || null,
      handoffReason: result?.handoffReason || null
    };
  }

  buildSessionId(channel, identifier) {
    const safeId = identifier ? String(identifier).replace(/\s+/g, '') : 'anonymous';
    return channel + ':' + safeId;
  }
}

export default new UnifiedConversationService();
