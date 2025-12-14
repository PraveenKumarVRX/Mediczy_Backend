import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import detectEmergencyKeywords from '../utils/emergencyKeywords.js';
import detectAppointmentIntent from '../utils/appointmentIntent.js';
import { detectProfanity, getWarningResponse, logViolation, Severity } from '../utils/profanityFilter.js';
import {
  touchSession,
  fetchMessages,
  appendConversation,
  archiveSession as archiveChatbotSession,
  fetchSessionInfo,
  countSessions
} from '../repositories/chatbotSessions.repository.js';
import handleIntentEscalation from './intentEscalation.service.js';

/**
 * Medical AI Service - Dr. iSHA
 * 
 * Priority Order:
 * 1. SIB (Local Llama-3.1-8B) - PRIMARY (port 8001)
 * 2. Groq API - FALLBACK 1
 * 3. Gemini API - FALLBACK 2
 * 4. Static responses - FALLBACK 3
 */
class MedicalAIService {
  constructor() {
    this.doctorName = 'Dr. iSHA';
    this.conversationHistory = new Map();
    this.isInitialized = false;
    this.activeProvider = null;
    
    // SIB Local LLM Configuration (PRIMARY)
    this.sibBaseUrl = process.env.SIB_URL || 'http://localhost:8001';
    this.sibAvailable = false;
    
    // Cloud API Keys (FALLBACKS)
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.geminiApiKey = process.env.GEMINI_API_KEY || 'AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48';
    
    this.initializeProviders();
  }

  /**
   * Initialize AI providers with SIB as primary
   */
  async initializeProviders() {
    try {
      // Check SIB availability (PRIMARY - Local Llama)
      await this.checkSibHealth();
      
      // Initialize Groq (FALLBACK 1)
      if (this.groqApiKey) {
        this.groqClient = new Groq({ apiKey: this.groqApiKey });
        console.log('✅ Medical AI: Groq initialized (fallback 1)');
      }
      
      // Initialize Gemini (FALLBACK 2)
      if (this.geminiApiKey) {
        this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
        console.log('✅ Medical AI: Gemini initialized (fallback 2)');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Medical AI initialization error:', error);
      this.activeProvider = 'fallback';
      this.isInitialized = true;
    }
  }

  /**
   * Check SIB (Local LLM) health
   */
  async checkSibHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.sibBaseUrl}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const health = await response.json();
        if (health.status === 'healthy') {
          this.sibAvailable = true;
          this.activeProvider = 'sib-llama';
          console.log('✅ Medical AI: SIB Local Llama initialized (PRIMARY)');
          console.log(`   Model: Llama-3.1-8B-Instruct-Q4_K_M.gguf`);
          console.log(`   URL: ${this.sibBaseUrl}`);
          return true;
        }
      }
      this.sibAvailable = false;
      return false;
    } catch (error) {
      console.warn('⚠️ SIB Local LLM not available:', error.message);
      this.sibAvailable = false;
      this.activeProvider = this.groqApiKey ? 'groq' : (this.geminiApiKey ? 'gemini' : 'fallback');
      return false;
    }
  }

  /**
   * Build the medical prompt for Dr. iSHA
   */
  buildSystemPrompt(language = 'en') {
    const languageNames = {
      'en': 'English', 'es': 'Spanish', 'hi': 'Hindi', 'bn': 'Bengali',
      'ar': 'Arabic', 'zh': 'Chinese', 'ur': 'Urdu', 'te': 'Telugu',
      'ta': 'Tamil', 'mr': 'Marathi', 'fr': 'French', 'de': 'German'
    };
    
    const targetLanguage = languageNames[language] || 'English';

    return `You are Dr. iSHA, a compassionate and experienced AI medical assistant for the Mediczy healthcare platform.

IMPORTANT RULES:
1. Always respond in ${targetLanguage}
2. Be empathetic, professional, and supportive
3. Provide helpful medical guidance but always recommend consulting a real doctor
4. Never provide definitive diagnoses - suggest possibilities
5. For emergencies, immediately advise seeking emergency care
6. Keep responses concise but informative
7. Use simple language patients can understand

RESPONSE FORMAT:
🔍 **Understanding Your Concern**
[Brief acknowledgment of their symptoms]

💡 **Possible Causes**
[2-3 common causes in simple terms]

🏥 **Recommended Actions**
[Clear steps to take]

⚠️ **When to Seek Immediate Care**
[Warning signs that need urgent attention]

💊 **Self-Care Tips**
[Home remedies or lifestyle advice if appropriate]

⚕️ **Medical Disclaimer**
This is AI-generated guidance from Dr. iSHA. Always consult qualified healthcare professionals for proper diagnosis and treatment.`;
  }

  /**
   * Consult with SIB Local Llama (PRIMARY)
   */
  async consultWithSIB(query, history = [], language = 'en', sessionId = null) {
    try {
      // Re-check SIB availability
      if (!this.sibAvailable) {
        await this.checkSibHealth();
        if (!this.sibAvailable) {
          throw new Error('SIB not available');
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for LLM

      const patientId = sessionId || `mediczy_${Date.now()}`;
      
      const response = await fetch(`${this.sibBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: query,
          patient_id: patientId,
          include_risk: false
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SIB error response:', errorText);
        throw new Error(`SIB returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // SIB returns chat_answer field
      const responseText = data.chat_answer || data.response || data.message || data.content || 'I apologize, I could not generate a response.';
      
      return {
        success: true,
        response: responseText,
        provider: data.provider === 'groq' ? 'sib-groq' : 'sib-llama',
        model: data.provider === 'groq' ? 'groq-via-sib' : 'Llama-3.1-8B-Instruct-Q4_K_M',
        turnCount: data.turn_count,
        conversationId: data.conversation_id
      };
    } catch (error) {
      console.error('SIB Local LLM error:', error.message);
      this.sibAvailable = false; // Mark as unavailable for retry logic
      throw error;
    }
  }

  /**
   * Consult with Groq API (FALLBACK 1)
   */
  async consultWithGroq(query, history = [], language = 'en') {
    try {
      const messages = [
        { role: 'system', content: this.buildSystemPrompt(language) },
        ...history.slice(-10),
        { role: 'user', content: query }
      ];

      const response = await this.groqClient.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 1024,
        temperature: 0.7,
      });

      return {
        success: true,
        response: response.choices[0]?.message?.content || 'I apologize, I could not generate a response.',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile'
      };
    } catch (error) {
      console.error('Groq API error:', error.message);
      throw error;
    }
  }

  /**
   * Consult with Gemini API (FALLBACK 2)
   */
  async consultWithGemini(query, history = [], language = 'en') {
    try {
      const model = this.geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Build conversation context
      const contextMessages = history.slice(-10).map(h => 
        `${h.role === 'user' ? 'Patient' : 'Dr. iSHA'}: ${h.content}`
      ).join('\n');
      
      const fullPrompt = `${this.buildSystemPrompt(language)}

${contextMessages ? `Previous conversation:\n${contextMessages}\n\n` : ''}Patient: ${query}

Dr. iSHA:`;

      const result = await model.generateContent(fullPrompt);
      const response = result.response;

      return {
        success: true,
        response: response.text(),
        provider: 'gemini',
        model: 'gemini-1.5-flash'
      };
    } catch (error) {
      console.error('Gemini API error:', error.message);
      throw error;
    }
  }

  /**
   * Fallback response when no AI is available (FALLBACK 3)
   */
  getFallbackResponse(query) {
    const emergencyDetection = detectEmergencyKeywords(query);
    
    if (emergencyDetection.matched) {
      const specializationText = emergencyDetection.specialization
        ? `This appears related to ${emergencyDetection.specialization}. `
        : '';
      return {
        success: true,
        response: `🚨 **IMMEDIATE CARE REQUIRED**

${specializationText}Based on your description (${emergencyDetection.matches.join(', ')}), this is treated as an emergency.

What to do right now:
1. Call emergency services (911 or 108) immediately
2. If possible, have someone accompany you to the nearest emergency department
3. Do not wait for symptoms to improve on their own

⚕️ Dr. iSHA prioritizes your safety. Please seek professional medical help without delay.`,
        provider: 'fallback-emergency'
      };
    }

    return {
      success: true,
      response: `Hello! I'm Dr. iSHA, your AI health assistant.

I understand you're seeking medical guidance. While I'm currently experiencing some technical limitations, here's what I recommend:

🏥 **General Advice**
- If symptoms are severe or persistent, please consult a doctor
- Keep track of your symptoms (when they started, severity, triggers)
- Stay hydrated and get adequate rest

📞 **Need Help?**
- For emergencies: Call 911 or 108
- For non-urgent concerns: Schedule an appointment with a healthcare provider

⚕️ *Medical Disclaimer: This is general guidance. Always consult qualified healthcare professionals for proper medical advice.*`,
      provider: 'fallback'
    };
  }

  buildContextSnapshot(userContext = {}) {
    if (!userContext || typeof userContext !== 'object') {
      return {};
    }

    const allowedKeys = ['userId', 'id', 'userName', 'age', 'gender', 'symptoms', 'corporateId', 'language', 'city', 'state'];
    const snapshot = {};
    allowedKeys.forEach((key) => {
      if (userContext[key] !== undefined && userContext[key] !== null) {
        snapshot[key] = userContext[key];
      }
    });

    if (Array.isArray(userContext.medicalHistory)) {
      snapshot.medicalHistory = userContext.medicalHistory.slice(0, 3);
    }

    if (userContext.intentType) {
      snapshot.intentType = userContext.intentType;
    }

    return snapshot;
  }

  async touchSessionRecord(sessionId, userContext = {}, language = 'en') {
    if (!sessionId) {
      return;
    }
    try {
      const userId = userContext.userId ?? userContext.id ?? null;
      await touchSession(sessionId, {
        userId,
        userRole: userContext.role || 'user',
        language,
        contextSnapshot: this.buildContextSnapshot(userContext)
      });
    } catch (error) {
      console.error('⚠️ Chatbot session upsert failed:', error.message);
    }
  }

  async restoreHistoryFromStore(sessionId) {
    if (!sessionId) {
      return [];
    }
    try {
      const messages = await fetchMessages(sessionId);
      if (!messages.length) {
        return [];
      }
      return messages.map((message) => ({ role: message.role, content: message.content }));
    } catch (error) {
      console.error('⚠️ Unable to load chatbot session history:', error.message);
      return [];
    }
  }

  async persistConversation(sessionId, query, result, meta = {}) {
    if (!sessionId) {
      return;
    }
    try {
      const now = new Date().toISOString();
      const entries = [
        {
          role: 'user',
          content: query,
          metadata: meta.userMetadata || {},
          createdAt: now
        },
        {
          role: 'assistant',
          content: result.response,
          provider: result.provider || null,
          metadata: {
            model: result.model,
            ...(meta.assistantMetadata && typeof meta.assistantMetadata === 'object' ? meta.assistantMetadata : {})
          },
          createdAt: new Date().toISOString()
        }
      ];

      await appendConversation(sessionId, entries, {
        lastProvider: result.provider || null,
        lastIntent: meta.intent || null
      });
    } catch (error) {
      console.error('⚠️ Failed to persist chatbot conversation:', error.message);
    }
  }

  async archiveSession(sessionId) {
    if (!sessionId) {
      return false;
    }
    try {
      return await archiveChatbotSession(sessionId);
    } catch (error) {
      console.error('⚠️ Failed to archive chatbot session:', error.message);
      return false;
    }
  }

  async fetchSessionInfoFromStore(sessionId) {
    if (!sessionId) {
      return null;
    }
    try {
      return await fetchSessionInfo(sessionId);
    } catch (error) {
      console.error('⚠️ Failed to fetch chatbot session info:', error.message);
      return null;
    }
  }

  async escalateIntent({ intentType, message, userContext = {}, keywords = [], specialization }) {
    if (!intentType || !message) {
      return null;
    }

    try {
      const escalation = await handleIntentEscalation({
        intentType,
        userId: userContext.userId || userContext.id || null,
        message,
        keywords,
        specialization
      });

      return {
        ...escalation,
        intentType
      };
    } catch (error) {
      console.error(`⚠️ Failed to escalate ${intentType} intent:`, error.message);
      return null;
    }
  }

  /**
   * Main consultation method with priority fallback chain
   * Priority: SIB (Local Llama) -> Groq -> Gemini -> Static
   */
  async consultMedical(query, sessionId, language = 'en', userContext = {}) {
    try {
      // ===== PROFANITY CHECK =====
      const profanityDetection = detectProfanity(query);
      if (profanityDetection.flagged) {
        console.log('🚨 Profanity detected from user:', {
          sessionId,
          userId: userContext.userId || userContext.id,
          severity: profanityDetection.severity,
          matchedWords: profanityDetection.matchedWords
        });
        
        // Log the violation
        await logViolation(
          sessionId, 
          userContext.userId || userContext.id, 
          query, 
          profanityDetection
        );
        
        // For HIGH or CRITICAL severity, return warning without processing
        if (profanityDetection.severity === Severity.HIGH || 
            profanityDetection.severity === Severity.CRITICAL) {
          return {
            success: false,
            flagged: true,
            response: getWarningResponse(profanityDetection.severity, language),
            doctor: this.doctorName,
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            language: language,
            provider: 'profanity-filter',
            violation: {
              type: 'profanity',
              severity: profanityDetection.severity,
              warningIssued: true
            }
          };
        }
        
        // For LOW/MEDIUM severity, continue but flag the response
        // Use sanitized text for AI processing
        query = profanityDetection.sanitizedText;
      }
      // ===== END PROFANITY CHECK =====

      const emergencyDetection = detectEmergencyKeywords(query);
      const resolvedIntent = emergencyDetection.matched ? 'emergency' : userContext.intentType;
      const sessionContext = { ...userContext, intentType: resolvedIntent };

      await this.touchSessionRecord(sessionId, sessionContext, language);

      if (!this.conversationHistory.has(sessionId)) {
        const restoredHistory = await this.restoreHistoryFromStore(sessionId);
        this.conversationHistory.set(sessionId, Array.isArray(restoredHistory) ? restoredHistory : []);
      }

      const history = this.conversationHistory.get(sessionId) || [];

      let result;
      let escalation = null;

      // 1. Try SIB Local Llama FIRST (PRIMARY)
      try {
        console.log('🧠 Trying SIB Local Llama (PRIMARY)...');
        result = await this.consultWithSIB(query, history, language, sessionId);
        console.log('✅ SIB responded successfully via', result.provider);
      } catch (sibError) {
        console.log('⚠️ SIB failed:', sibError.message);
        
        // 2. Try Groq (FALLBACK 1)
        if (this.groqClient) {
          try {
            console.log('🔄 Trying Groq (FALLBACK 1)...');
            result = await this.consultWithGroq(query, history, language);
            console.log('✅ Groq responded successfully');
          } catch (groqError) {
            console.log('⚠️ Groq failed:', groqError.message);
            
            // 3. Try Gemini (FALLBACK 2)
            if (this.geminiClient) {
              try {
                console.log('🔄 Trying Gemini (FALLBACK 2)...');
                result = await this.consultWithGemini(query, history, language);
                console.log('✅ Gemini responded successfully');
              } catch (geminiError) {
                console.log('⚠️ Gemini failed:', geminiError.message);
                // 4. Static fallback (FALLBACK 3)
                result = this.getFallbackResponse(query);
              }
            } else {
              result = this.getFallbackResponse(query);
            }
          }
        } else if (this.geminiClient) {
          // Try Gemini if Groq not available
          try {
            console.log('🔄 Trying Gemini (FALLBACK 2)...');
            result = await this.consultWithGemini(query, history, language);
          } catch (geminiError) {
            console.log('⚠️ Gemini failed:', geminiError.message);
            result = this.getFallbackResponse(query);
          }
        } else {
          result = this.getFallbackResponse(query);
        }
      }

      // Store conversation
      history.push(
        { role: 'user', content: query },
        { role: 'assistant', content: result.response }
      );

      // Keep only last 20 messages
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      await this.persistConversation(sessionId, query, result, {
        intent: resolvedIntent,
        userMetadata: {
          language,
          source: sessionContext.source || 'medical-ai'
        },
        assistantMetadata: {
          provider: result.provider
        }
      });

      // Check for emergency intent
      if (emergencyDetection.matched) {
        escalation = await this.escalateIntent({
          intentType: 'emergency',
          message: query,
          userContext: sessionContext,
          keywords: emergencyDetection.matches,
          specialization: emergencyDetection.specialization
        });
      }
      
      // Check for appointment booking intent (if not already an emergency)
      if (!escalation) {
        const appointmentDetection = detectAppointmentIntent(query);
        if (appointmentDetection.matched) {
          console.log('📅 Appointment intent detected:', appointmentDetection);
          escalation = await this.escalateIntent({
            intentType: 'appointment',
            message: query,
            userContext: sessionContext,
            keywords: appointmentDetection.matches,
            specialization: appointmentDetection.specialization
          });
          if (escalation) {
            escalation.action = appointmentDetection.action; // 'book', 'find', or 'visit'
          }
        }
      }

      return {
        success: true,
        response: result.response,
        doctor: this.doctorName,
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        language: language,
        provider: result.provider,
        model: result.model,
        conversationLength: Math.floor(history.length / 2),
        escalation,
        // Include profanity warning if LOW/MEDIUM severity was detected
        ...(profanityDetection.flagged && {
          contentWarning: {
            flagged: true,
            severity: profanityDetection.severity,
            message: getWarningResponse(profanityDetection.severity, language)
          }
        })
      };

    } catch (error) {
      console.error('Medical consultation error:', error);
      return {
        success: false,
        error: error.message,
        response: this.getFallbackResponse(query).response,
        doctor: this.doctorName,
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        provider: 'error-fallback'
      };
    }
  }

  /**
   * Analyze symptoms
   */
  async analyzeSymptoms(symptoms, description, sessionId, language = 'en', options = {}) {
    const symptomsText = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;
    const query = `I am experiencing the following symptoms: ${symptomsText}. ${description || ''}. Duration: ${options.duration || 'not specified'}. Severity: ${options.severity || 'moderate'}.`;
    
    return await this.consultMedical(query, sessionId, language, { symptoms, ...options });
  }

  /**
   * Emergency triage
   */
  async emergencyTriage(symptoms, description, sessionId, language = 'en', userContext = {}) {
    const query = `URGENT MEDICAL ASSESSMENT NEEDED: Symptoms: ${symptoms.join(', ')}. Description: ${description}. Please provide immediate triage guidance.`;
    const triageContext = { ...userContext, intentType: 'emergency' };
    
    const result = await this.consultMedical(query, sessionId, language, triageContext);

    const detectionSource = `${description} ${symptoms.join(' ')}`;
    const emergencyDetection = detectEmergencyKeywords(detectionSource);
    const isEmergency = emergencyDetection.matched;
    let escalation = result?.escalation || null;

    if (isEmergency && !escalation) {
      escalation = await this.escalateIntent({
        intentType: 'emergency',
        message: description,
        userContext: triageContext,
        keywords: emergencyDetection.matches,
        specialization: emergencyDetection.specialization
      });
    }

    return {
      ...result,
      urgencyLevel: isEmergency ? 'CRITICAL' : 'MODERATE',
      requiresImmediateAttention: isEmergency,
      emergencyMeta: emergencyDetection,
      escalation
    };
  }

  /**
   * Clear session
   */
  async clearSession(sessionId) {
    if (this.conversationHistory.has(sessionId)) {
      this.conversationHistory.delete(sessionId);
    }
    const archived = await this.archiveSession(sessionId);
    if (archived) {
      return { success: true, message: 'Session cleared' };
    }
    return { success: false, message: 'Failed to clear session' };
  }

  /**
   * Get session info
   */
  async getSessionInfo(sessionId) {
    const history = this.conversationHistory.get(sessionId) || [];
    const storeInfo = await this.fetchSessionInfoFromStore(sessionId);

    const messageCount = storeInfo?.messageCount ?? history.length;
    return {
      sessionId,
      conversationLength: Math.floor(messageCount / 2),
      isActive: storeInfo?.active ?? this.conversationHistory.has(sessionId),
      provider: storeInfo?.lastProvider || this.activeProvider,
      lastIntent: storeInfo?.lastIntent || null,
      lastInteractionAt: storeInfo?.lastInteractionAt || null
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    // Re-check SIB availability
    await this.checkSibHealth();
    let storedSessions = null;
    try {
      storedSessions = await countSessions();
    } catch (error) {
      storedSessions = null;
    }
    
    return {
      status: 'healthy',
      initialized: this.isInitialized,
      activeProvider: this.activeProvider,
      architecture: 'SIB → Groq/Gemini (local LLM requires GPU)',
      providers: {
        'sib': this.sibAvailable,
        groq: !!this.groqClient,
        gemini: !!this.geminiClient
      },
      priority: [
        { name: 'SIB Brain (Groq-backed)', status: this.sibAvailable ? 'available' : 'unavailable', role: 'PRIMARY' },
        { name: 'Groq API Direct', status: this.groqClient ? 'available' : 'unavailable', role: 'FALLBACK 1' },
        { name: 'Gemini API', status: this.geminiClient ? 'available' : 'unavailable', role: 'FALLBACK 2' }
      ],
      sibUrl: this.sibBaseUrl,
      sessionsActive: this.conversationHistory.size,
      storedSessions,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton
const medicalAIService = new MedicalAIService();
export default medicalAIService;
