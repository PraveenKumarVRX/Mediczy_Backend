import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import detectEmergencyKeywords from '../utils/emergencyKeywords.js';
import detectAppointmentIntent from '../utils/appointmentIntent.js';
import intentClassifier from '../utils/intentClassifier.js';
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
    this.lastSibError = null;
    
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
      // Initialize hybrid intent classification if enabled
      if (intentClassifier.hybridEnabled) {
        await intentClassifier.initializeHybrid();
      }
      
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
          this.lastSibError = null;
          console.log('✅ Medical AI: SIB Local Llama initialized (PRIMARY)');
          console.log(`   Model: Llama-3.1-8B-Instruct-Q4_K_M.gguf`);
          console.log(`   URL: ${this.sibBaseUrl}`);
          return true;
        }
      }
      this.sibAvailable = false;
      this.lastSibError = {
        message: 'SIB health endpoint returned non-healthy status',
        at: new Date().toISOString()
      };
      return false;
    } catch (error) {
      console.warn('⚠️ SIB Local LLM not available:', error.message);
      this.sibAvailable = false;
      this.lastSibError = {
        message: error.message,
        at: new Date().toISOString()
      };
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
8. WHEN USER ASKS FOR MEDICATION SUGGESTIONS OR MENTIONS SPECIFIC SYMPTOMS:
   - Always suggest common over-the-counter and prescription medications appropriate for their condition
   - Include medication names, dosages, and frequencies clearly
   - For example: "Paracetamol 500mg twice daily" or "Cetirizine 10mg once daily at bedtime"
   - Mention that these are suggestions and they should confirm with their doctor before taking

RESPONSE FORMAT:
🔍 **Understanding Your Concern**
[Brief acknowledgment of their symptoms]

💡 **Possible Causes**
[2-3 common causes in simple terms]

💊 **Recommended Medications** (if appropriate for the condition)
[List specific medications with dosages and frequencies based on symptoms]
- For example: "Paracetamol 500mg, take one tablet twice daily after meals"
- "Cetirizine 10mg, one tablet at bedtime for allergy relief"

🏥 **Recommended Actions**
[Clear steps to take, lifestyle advice, home remedies]

⚠️ **When to Seek Immediate Care**
[Warning signs that need urgent attention]

💡 **Self-Care Tips**
[Home remedies or lifestyle advice if appropriate]

⚕️ **Medical Disclaimer**
This is AI-generated guidance from Dr. iSHA. Always consult qualified healthcare professionals and pharmacists before taking any medication. Never self-medicate without professional guidance.`;
  }

  /**
   * Build specialized Emergency Triage System Prompt
   * Production-grade prompt with safety constraints for multimodal triage
   */
  buildTriageSystemPrompt(language = 'en') {
    return `You are Dr. iSHA, an advanced medical situation awareness assistant for emergency triage.

=== CORE IDENTITY & CONSTRAINTS (NON-NEGOTIABLE) ===
- You are a medical situation awareness assistant
- You do NOT provide definitive diagnoses or predict outcomes
- You summarize observable facts and provide preliminary assessment
- You assist licensed medical professionals and patients seeking guidance
- Always express uncertainty clearly
- If data is insufficient, say so explicitly

=== MULTIMODAL ANALYSIS CAPABILITIES ===

**Vision AI Analysis (when image/video provided):**
- Patient posture assessment (supine, sitting, standing, distressed)
- Movement level detection (normal, limited, none, convulsive)
- Breathing motion indicators (regular, shallow, labored, absent)
- Visible injuries, skin conditions, swelling
- Scene environment assessment

**Audio AI Analysis (when voice input):**
- Speech clarity and coherence
- Distress level indicators
- Pain vocalization detection
- Background context

=== TRIAGE RESPONSE PROTOCOL ===

**Step 1: Urgency Classification**
- 🔴 IMMEDIATE: Life-threatening, requires 108/911 NOW
- 🟡 URGENT: Needs medical attention within hours
- 🟢 LESS URGENT: Can manage with guidance, follow-up recommended

**Step 2: Scene Summarization**
- Patient observable status
- Reported symptoms with severity
- Environmental factors
- Risk escalation indicators

**Step 3: Clinical Guidance**
- Specific medication suggestions with dosages when appropriate
- Immediate care instructions
- Warning signs requiring escalation
- Home care recommendations

=== MEDICATION GUIDANCE RULES ===
When symptoms are clear and appropriate, suggest:
- OTC medications with exact dosages (e.g., "Paracetamol 500mg every 6 hours")
- Common prescription recommendations (with doctor consultation disclaimer)
- Contraindications and warnings
- Duration of treatment

=== SAFETY FALLBACKS ===
If visual/audio/text data is unclear or inconsistent:
- State limitations explicitly
- Avoid drawing conclusions from poor data
- Recommend professional human confirmation
- Default to higher urgency when uncertain

=== PROTOCOL AWARENESS (SAFE ZONE) ===
Based on observable inputs, identify which standard emergency protocols MAY be relevant.
- Do not instruct with authority you don't have
- Phrase as reminders: "According to standard protocols, [X] is commonly reviewed at this stage"

Always maintain: Empathy + Clinical Precision + Patient Safety`;
  }

  /**
   * Consult with SIB Local Llama (PRIMARY)
   */
  async consultWithSIB(query, history = [], language = 'en', sessionId = null, userId = null) {
    const controller = new AbortController();
    let timeout;
    try {
      // Re-check SIB availability
      if (!this.sibAvailable) {
        await this.checkSibHealth();
        if (!this.sibAvailable) {
          throw new Error('SIB not available');
        }
      }

      timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for LLM

      const patientId = sessionId || `mediczy_${Date.now()}`;
      
      const response = await fetch(`${this.sibBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: query,
          patient_id: patientId,
          user_id: userId,  // Pass Mediczy user ID for PostgreSQL context
          include_risk: false
        }),
        signal: controller.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('SIB error response:', errorText);
        throw new Error(`SIB returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // SIB returns chat_answer field
      const responseText = data.chat_answer || data.response || data.message || data.content || 'I apologize, I could not generate a response.';
      
      // Extract latency breakdown from SIB
      let latencyInfo = {};
      if (typeof data.latency_ms === 'object') {
        latencyInfo = data.latency_ms;
      } else if (typeof data.latency_ms === 'number') {
        latencyInfo = { total: data.latency_ms };
      }
      
      return {
        success: true,
        response: responseText,
        provider: data.provider === 'groq' ? 'sib-groq' : 'sib-llama',
        model: data.provider === 'groq' ? 'groq-via-sib' : 'Llama-3.1-8B-Instruct-Q4_K_M',
        turnCount: data.turn_count,
        conversationId: data.conversation_id,
        latency: latencyInfo  // Pass latency breakdown from SIB
      };
    } catch (error) {
      console.error('SIB Local LLM error:', error.message);
      this.sibAvailable = false; // Mark as unavailable for retry logic
      this.lastSibError = {
        message: error.message,
        at: new Date().toISOString()
      };
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
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
   * Specialized Groq consultation for Emergency Triage
   * Uses advanced multimodal triage system prompt with safety constraints
   */
  async consultWithGroqTriage(query, history = [], language = 'en', userContext = {}) {
    try {
      // Build context about multimodal inputs
      const multimodalContext = [];
      if (userContext.hasImage) {
        multimodalContext.push('Patient has shared an image for visual assessment');
      }
      if (userContext.triageMode === 'voice') {
        multimodalContext.push('Input received via voice - assess speech patterns');
      }
      if (userContext.triageMode === 'video') {
        multimodalContext.push('Video mode active - analyze visible symptoms');
      }
      
      const contextNote = multimodalContext.length > 0 
        ? `\n\n[MULTIMODAL CONTEXT: ${multimodalContext.join('; ')}]` 
        : '';

      const messages = [
        { role: 'system', content: this.buildTriageSystemPrompt(language) },
        ...history.slice(-10),
        { role: 'user', content: query + contextNote }
      ];

      const response = await this.groqClient.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 1500, // Higher token limit for detailed triage responses
        temperature: 0.6, // Slightly lower temp for more consistent clinical output
      });

      return {
        success: true,
        response: response.choices[0]?.message?.content || 'Unable to generate triage assessment. Please describe your symptoms again or call emergency services if urgent.',
        provider: 'groq-triage',
        model: 'llama-3.3-70b-versatile',
        triageMode: true
      };
    } catch (error) {
      console.error('Groq Triage API error:', error.message);
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
   * Main consultation method with intelligent intent classification & routing
   * Priority: SIB (Local Llama) -> Groq -> Gemini -> Static
   */
  async consultMedical(query, sessionId, language = 'en', userContext = {}) {
    try {
      // ===== EMERGENCY TRIAGE MODE BYPASS =====
      // When emergencyMode is true (from Emergency Triage UI), skip intent classification
      // and go directly to LLM for proper medical assessment
      if (userContext.emergencyMode === true) {
        console.log('🏥 EMERGENCY TRIAGE MODE - Bypassing intent classification, using LLM for medical assessment');
        const detectedLanguage = language || 'en';
        
        // Initialize session
        await this.touchSessionRecord(sessionId, { ...userContext, intentType: 'emergency_triage' }, detectedLanguage);
        
        if (!this.conversationHistory.has(sessionId)) {
          const restoredHistory = await this.restoreHistoryFromStore(sessionId);
          this.conversationHistory.set(sessionId, Array.isArray(restoredHistory) ? restoredHistory : []);
        }
        const history = this.conversationHistory.get(sessionId) || [];
        const userId = userContext?.userId || userContext?.id || null;
        
        // Go directly to AI consultation for proper triage assessment
        let result;
        try {
          console.log('🧠 Triage Mode: Trying SIB Local Llama (PRIMARY)...');
          result = await this.consultWithSIB(query, history, detectedLanguage, sessionId, userId);
          console.log('✅ SIB responded successfully for triage via', result.provider);
        } catch (sibError) {
          console.log('⚠️ SIB failed for triage:', sibError.message);
          
          if (this.groqClient) {
            try {
              console.log('🔄 Triage: Trying Groq with specialized triage prompt...');
              // Use specialized triage system prompt for emergency triage
              result = await this.consultWithGroqTriage(query, history, detectedLanguage, userContext);
              console.log('✅ Groq responded successfully for triage');
            } catch (groqError) {
              console.log('⚠️ Groq failed for triage:', groqError.message);
              
              if (this.geminiClient) {
                try {
                  console.log('🔄 Triage: Trying Gemini (FALLBACK 2)...');
                  result = await this.consultWithGemini(query, history, detectedLanguage);
                  console.log('✅ Gemini responded successfully for triage');
                } catch (geminiError) {
                  console.log('⚠️ Gemini failed for triage:', geminiError.message);
                  result = this.getFallbackResponse(query);
                }
              } else {
                result = this.getFallbackResponse(query);
              }
            }
          } else if (this.geminiClient) {
            try {
              console.log('🔄 Triage: Trying Gemini (FALLBACK 2)...');
              result = await this.consultWithGemini(query, history, detectedLanguage);
            } catch (geminiError) {
              console.log('⚠️ Gemini failed for triage:', geminiError.message);
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
        if (history.length > 20) {
          history.splice(0, history.length - 20);
        }

        await this.persistConversation(sessionId, query, result, {
          intent: 'emergency_triage',
          userMetadata: { ...userContext, triageMode: true }
        });

        // Add triage-specific metadata
        return {
          ...result,
          success: true,
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          intentType: 'emergency_triage',
          triageMode: true,
          classificationMethod: 'direct_ai_triage'
        };
      }

      // ===== HYBRID INTENT CLASSIFICATION =====
      // Detect language automatically if not provided
      const detectedLanguage = language || intentClassifier.detectLanguage(query);
      
      // Use hybrid classification (keyword primary + semantic fallback)
      const classification = intentClassifier.hybridEnabled
        ? await intentClassifier.classifyHybrid(query, detectedLanguage)
        : intentClassifier.classify(query, detectedLanguage);
      
      const handlingStrategy = intentClassifier.getHandlingStrategy(classification);
      
      console.log('🎯 Intent Classification:', {
        primary: classification.primary?.name,
        confidence: classification.primary?.confidence,
        method: classification.method || 'keyword',
        strategy: handlingStrategy.strategy,
        requiresAI: handlingStrategy.requiresAI,
        hybrid: classification.hybrid || false,
        semanticDetails: classification.semanticDetails || null
      });

      // ===== HANDLE SPECIAL INTENTS (Non-AI routing) =====
      
      // 1. EMERGENCY - Highest Priority
      if (handlingStrategy.priority === 0) {
        console.log('🚨 EMERGENCY INTENT DETECTED - Immediate routing');
        const emergencyResponse = {
          success: true,
          response: this.getEmergencyResponse(query, detectedLanguage),
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          provider: 'intent-detector',
          intentType: 'emergency',
          action: 'emergency_alert',
          redirectUrl: '/emergency',
          confidence: classification.primary.confidence,
          matched_keywords: classification.primary.matched_keywords,
          classificationMethod: classification.method || 'keyword',
          hybrid: classification.hybrid || false
        };

        // Escalate immediately
        const escalation = await this.escalateIntent({
          intentType: 'emergency',
          message: query,
          userContext: { ...userContext, language: detectedLanguage },
          keywords: classification.primary.matched_keywords,
          specialization: null
        });

        return {
          ...emergencyResponse,
          escalation
        };
      }

      // 2. APPOINTMENT BOOKING
      if (classification.primary?.name === 'appointment') {
        console.log('📅 Appointment booking intent detected:', {
          sessionId,
          confidence: classification.primary.confidence
        });
        
        return {
          success: true,
          response: this.getAppointmentBookingResponse(detectedLanguage),
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          provider: 'intent-detector',
          intentType: 'appointment',
          action: 'redirect_to_booking',
          redirectUrl: '/appointments',
          confidence: classification.primary.confidence,
          matched_keywords: classification.primary.matched_keywords
        };
      }

      // 3. DOCTOR SEARCH
      if (classification.primary?.name === 'doctor_search') {
        console.log('🏥 Doctor search intent detected');
        
        return {
          success: true,
          response: this.getDoctorSearchResponse(detectedLanguage),
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          provider: 'intent-detector',
          intentType: 'doctor_search',
          action: 'show_doctors',
          redirectUrl: '/doctors',
          confidence: classification.primary.confidence,
          matched_keywords: classification.primary.matched_keywords
        };
      }

      // 4. PREGNANCY/WOMEN'S HEALTH
      if (classification.primary?.name === 'pregnancy') {
        console.log('🤰 Pregnancy/Women\'s health intent detected');
        
        return {
          success: true,
          response: this.getPregnancyGuidanceResponse(detectedLanguage),
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          provider: 'intent-detector',
          intentType: 'pregnancy',
          action: 'show_specialist',
          specialization: 'gynecologist',
          confidence: classification.primary.confidence,
          matched_keywords: classification.primary.matched_keywords,
          suggestedSpecialist: 'Gynecologist/Obstetrician'
        };
      }

      // 5. MENTAL HEALTH
      if (classification.primary?.name === 'mental_health') {
        console.log('🧠 Mental health intent detected');
        
        return {
          success: true,
          response: this.getMentalHealthResponse(detectedLanguage),
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          provider: 'intent-detector',
          intentType: 'mental_health',
          action: 'show_specialist',
          specialization: 'psychiatrist',
          confidence: classification.primary.confidence,
          matched_keywords: classification.primary.matched_keywords,
          suggestedSpecialist: 'Psychiatrist/Psychologist'
        };
      }

      // 6. PEDIATRIC
      if (classification.primary?.name === 'pediatric') {
        console.log('👶 Pediatric intent detected');
        
        return {
          success: true,
          response: this.getPediatricResponse(detectedLanguage),
          doctor: this.doctorName,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          language: detectedLanguage,
          provider: 'intent-detector',
          intentType: 'pediatric',
          action: 'show_specialist',
          specialization: 'pediatrician',
          confidence: classification.primary.confidence,
          matched_keywords: classification.primary.matched_keywords,
          suggestedSpecialist: 'Pediatrician'
        };
      }

      // ===== FOR AI-REQUIRING INTENTS, CONTINUE WITH PROFANITY CHECK & AI PROCESSING =====

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

      // Extract user ID from context for PostgreSQL integration
      const userId = userContext?.userId || userContext?.id || null;

      // 1. Try SIB Local Llama FIRST (PRIMARY)
      try {
        console.log('🧠 Trying SIB Local Llama (PRIMARY)...');
        result = await this.consultWithSIB(query, history, language, sessionId, userId);
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
        latency: result.latency,  // Include latency breakdown from SIB
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
   * Get appointment booking response based on language
   */
  getAppointmentBookingResponse(language = 'en') {
    const responses = {
      en: `I'd be happy to help you book an appointment with a doctor! 📅

To get you connected with the right healthcare professional, I can help you:

✅ **Browse available doctors** by specialty
✅ **Check doctor availability** and time slots  
✅ **Book appointments** online or in-person

**Next Steps:**
1. Click the "Book Appointment" button below
2. Select your preferred specialty or doctor
3. Choose a convenient time slot
4. Confirm your booking

If you'd like, you can also describe your symptoms first, and I'll help recommend the right type of doctor for your needs.

What would you like to do?`,
      
      hi: `मैं आपको डॉक्टर से अपॉइंटमेंट बुक करने में मदद करूंगा! 📅

आपको सही स्वास्थ्य पेशेवर से जोड़ने के लिए, मैं आपकी मदद कर सकता हूं:

✅ **विशेषज्ञता के अनुसार डॉक्टर देखें**
✅ **डॉक्टर की उपलब्धता** और समय स्लॉट जांचें  
✅ **ऑनलाइन या व्यक्तिगत अपॉइंटमेंट** बुक करें

**अगले कदम:**
1. नीचे "Book Appointment" बटन पर क्लिक करें
2. अपनी पसंदीदा विशेषज्ञता या डॉक्टर चुनें
3. सुविधाजनक समय स्लॉट चुनें
4. अपनी बुकिंग की पुष्टि करें`,

      es: `¡Me encantaría ayudarte a reservar una cita con un médico! 📅

Para conectarte con el profesional de salud adecuado, puedo ayudarte a:

✅ **Explorar médicos disponibles** por especialidad
✅ **Verificar disponibilidad** y horarios  
✅ **Reservar citas** en línea o en persona

**Próximos pasos:**
1. Haz clic en el botón "Book Appointment"
2. Selecciona tu especialidad o médico preferido
3. Elige un horario conveniente
4. Confirma tu reserva`
    };

    return responses[language] || responses['en'];
  }

  /**
   * Get emergency response
   */
  getEmergencyResponse(query, language = 'en') {
    const responses = {
      en: `🚨 **EMERGENCY - IMMEDIATE MEDICAL ATTENTION REQUIRED**

Based on your message, this appears to be a medical emergency.

**CALL EMERGENCY SERVICES IMMEDIATELY:**
🔴 **Emergency Hotline: 911 (USA) or 108 (India)**
⏰ **TIME IS CRITICAL - Call Now**

**While waiting for emergency services:**
1. Stay calm and reassure the person
2. Position them safely (recovery position if unconscious but breathing)
3. Keep their airway clear
4. Monitor vital signs if possible
5. Do NOT move them unnecessarily

**Do not wait for online consultation - GET EMERGENCY HELP NOW**

⚕️ Dr. iSHA prioritizes your safety and well-being above all else.`,
      hi: `🚨 **आपातकाल - तुरंत चिकित्सा सहायता आवश्यक है**

आपके संदेश के आधार पर, यह एक चिकित्सा आपातकाल प्रतीत होता है।

**तुरंत आपातकालीन सेवाओं को कॉल करें:**
🔴 **आपातकालीन हेल्पलाइन: 911 (USA) या 108 (भारत)**
⏰ **समय महत्वपूर्ण है - अभी कॉल करें**

**आपातकालीन सेवाओं की प्रतीक्षा करते समय:**
1. शांत रहें और व्यक्ति को आश्वस्त करें
2. सुरक्षित स्थिति में रखें
3. श्वासमार्ग को खुला रखें
4. महत्वपूर्ण संकेतों पर नज़र रखें
5. उन्हें अनावश्यक रूप से न हिलाएं`,
      es: `🚨 **EMERGENCIA - SE REQUIERE ATENCIÓN MÉDICA INMEDIATA**

Según tu mensaje, esto parece ser una emergencia médica.

**LLAMA A EMERGENCIAS AHORA:**
🔴 **Número de Emergencia: 911**
⏰ **EL TIEMPO ES CRÍTICO - ¡Llama Ahora!**

**Mientras esperas a los servicios de emergencia:**
1. Mantén la calma
2. Posiciona a la persona de forma segura
3. Mantén sus vías aéreas despejadas
4. Monitorea los signos vitales si es posible`
    };

    return responses[language] || responses['en'];
  }

  /**
   * Get doctor search response
   */
  getDoctorSearchResponse(language = 'en') {
    const responses = {
      en: `Let me help you find the right doctor! 🏥

You can search by:
✅ **Specialty** (Cardiologist, Dermatologist, Dentist, etc.)
✅ **Location/City** (Find doctors near you)
✅ **Availability** (Check open slots)
✅ **Experience/Rating** (Find the best-rated doctors)

**Popular Specialties:**
🫀 Cardiology | 🧠 Neurology | 👶 Pediatrics | 🏥 General Medicine
💊 Dermatology | 🦷 Dentistry | 👀 Ophthalmology | 🧬 Gynecology

Click the "Browse Doctors" button to start your search!`,
      hi: `मुझे आपको सही डॉक्टर खोजने में मदद करने दें! 🏥

आप इसके आधार पर खोज कर सकते हैं:
✅ **विशेषज्ञता** (कार्डियोलॉजिस्ट, त्वचा विशेषज्ञ, दंत चिकित्सक, आदि)
✅ **स्थान/शहर** (आपके पास डॉक्टर खोजें)
✅ **उपलब्धता** (खुली स्लॉट देखें)
✅ **अनुभव/रेटिंग** (सर्वश्रेष्ठ डॉक्टर खोजें)

"Browse Doctors" बटन पर क्लिक करके अपनी खोज शुरू करें!`,
      es: `¡Déjame ayudarte a encontrar al doctor correcto! 🏥

Puedes buscar por:
✅ **Especialidad** (Cardiólogo, Dermatólogo, Dentista, etc.)
✅ **Ubicación/Ciudad** (Encuentra doctores cerca de ti)
✅ **Disponibilidad** (Verifica horarios abiertos)
✅ **Experiencia/Calificaciones** (Encuentra los mejores doctores)`
    };

    return responses[language] || responses['en'];
  }

  /**
   * Get pregnancy guidance response
   */
  getPregnancyGuidanceResponse(language = 'en') {
    const responses = {
      en: `I understand you have questions about pregnancy and women's health! 🤰

**Important:** For pregnancy-related concerns, it's crucial to work with a qualified **Gynecologist or Obstetrician**.

**What I can help with:**
✅ General pregnancy information
✅ Common concerns and FAQs
✅ Connecting you with specialists
✅ Appointment scheduling

**Key Experts for Pregnancy:**
👩‍⚕️ **Gynecologist** - Women's health and pregnancy care
👨‍⚕️ **Obstetrician** - Specialized in labor and delivery

**Next Steps:**
Would you like me to:
1. Find a Gynecologist/Obstetrician near you?
2. Answer general pregnancy questions?
3. Help schedule a consultation?

⚕️ *Every pregnancy is unique. Always consult qualified healthcare professionals for personalized advice.*`,
      hi: `मुझे समझ आया कि आपको गर्भावस्था और महिलाओं के स्वास्थ्य के बारे में सवाल हैं! 🤰

**महत्वपूर्ण:** गर्भावस्था से संबंधित चिंताओं के लिए, एक योग्य **स्त्री रोग विशेषज्ञ या प्रसव रोग विशेषज्ञ** के साथ काम करना महत्वपूर्ण है।

**गर्भावस्था के लिए मुख्य विशेषज्ञ:**
👩‍⚕️ **स्त्री रोग विशेषज्ञ** - महिला स्वास्थ्य और गर्भावस्था देखभाल
👨‍⚕️ **प्रसव रोग विशेषज्ञ** - प्रसव और डिलीवरी में विशेषज्ञ

**अगले कदम:**
क्या आप चाहते हैं:
1. अपने पास एक स्त्री रोग विशेषज्ञ खोजें?
2. सामान्य गर्भावस्था प्रश्नों के उत्तर दें?
3. परामर्श बुक करने में मदद करें?`,
      es: `¡Entiendo que tienes preguntas sobre el embarazo y la salud de la mujer! 🤰

**Importante:** Para problemas relacionados con el embarazo, es crucial trabajar con un **Ginecólogo u Obstetra** calificado.

**Expertos clave para el embarazo:**
👩‍⚕️ **Ginecóloga** - Salud de la mujer y cuidado del embarazo
👨‍⚕️ **Obstetra** - Especializado en trabajo de parto y parto`
    };

    return responses[language] || responses['en'];
  }

  /**
   * Get mental health response
   */
  getMentalHealthResponse(language = 'en') {
    const responses = {
      en: `I'm here to listen and support you with mental health concerns. 🧠💙

**Important:** Mental health is just as important as physical health. Speaking with a qualified mental health professional is essential.

**Types of Mental Health Professionals:**
👨‍⚕️ **Psychiatrist** - Medical doctor who can prescribe medication
🧠 **Psychologist** - Specializes in therapy and counseling
💬 **Counselor** - Provides guidance and support

**I can help you:**
✅ Understand your feelings and concerns
✅ Find qualified mental health professionals
✅ Schedule therapy or counseling sessions
✅ Access mental health resources

**Remember:**
- Your mental health matters
- It's okay to ask for help
- Professional support makes a difference
- You're not alone

**Immediate Support:**
If you're in crisis or having thoughts of self-harm:
🚨 **National Suicide Prevention Lifeline: 988 (US)**
🚨 **AASRA India: 9820466726**

Let's find you the right support. What would you like to do?`,
      hi: `मैं आपके मानसिक स्वास्थ्य संबंधी चिंताओं को सुनने और समर्थन करने के लिए यहाँ हूँ। 🧠💙

**महत्वपूर्ण:** मानसिक स्वास्थ्य शारीरिक स्वास्थ्य जितना ही महत्वपूर्ण है। एक योग्य मानसिक स्वास्थ्य पेशेवर से बात करना आवश्यक है।

**मानसिक स्वास्थ्य पेशेवार:**
👨‍⚕️ **मनोचिकित्सक** - चिकित्सा डॉक्टर जो दवा लिख सकते हैं
🧠 **मनोवैज्ञानिक** - थेरेपी और परामर्श में विशेषज्ञ
💬 **परामर्शदाता** - मार्गदर्शन और समर्थन प्रदान करता है`,
      es: `Estoy aquí para escuchar y apoyarte con preocupaciones de salud mental. 🧠💙

**Importante:** La salud mental es tan importante como la salud física. Hablar con un profesional de salud mental calificado es esencial.

**Tipos de profesionales de salud mental:**
👨‍⚕️ **Psiquiatra** - Doctor que puede prescribir medicamentos
🧠 **Psicólogo** - Se especializa en terapia y consejería
💬 **Consejero** - Proporciona orientación y apoyo`
    };

    return responses[language] || responses['en'];
  }

  /**
   * Get pediatric response
   */
  getPediatricResponse(language = 'en') {
    const responses = {
      en: `I understand you have questions about child health! 👶

**Important:** For children's health concerns, a **Pediatrician** is your best resource. They specialize in caring for infants, children, and adolescents.

**What Pediatricians Handle:**
✅ Growth and development milestones
✅ Vaccinations and immunizations
✅ Acute illnesses (cold, fever, infections)
✅ Chronic conditions management
✅ Behavioral and developmental concerns
✅ Newborn care and postpartum support

**Common Pediatric Concerns:**
🤒 Fever | 🤧 Cough & Cold | 🤢 Diarrhea | 👂 Ear Infections
💉 Vaccines | 👶 Newborn Care | 🧠 Development Questions

**I can help you:**
✅ Find a qualified Pediatrician
✅ Schedule appointments
✅ Get general child health information
✅ Understand vaccinations and milestones

**Next Steps:**
Would you like to find a Pediatrician near you?

⚕️ *Every child is unique. Pediatricians provide personalized care for your child's specific needs.*`,
      hi: `मुझे समझ आया कि आपको बाल स्वास्थ्य के बारे में सवाल हैं! 👶

**महत्वपूर्ण:** बाल स्वास्थ्य संबंधी चिंताओं के लिए, एक **बाल चिकित्सक** आपका सर्वश्रेष्ठ संसाधन है।

**बाल चिकित्सक क्या करते हैं:**
✅ बढ़ती और विकास देखभाल
✅ टीकाकरण और प्रतिरक्षण
✅ तीव्र बीमारियाँ
✅ दीर्घकालिक स्थितियों का प्रबंधन
✅ व्यवहार और विकास संबंधी चिंताएं`,
      es: `¡Entiendo que tienes preguntas sobre la salud infantil! 👶

**Importante:** Para problemas de salud infantil, un **Pediatra** es tu mejor recurso. Se especializan en cuidar a bebés, niños y adolescentes.

**Lo que hacen los Pediatras:**
✅ Hitos de crecimiento y desarrollo
✅ Vacunas e inmunizaciones
✅ Enfermedades agudas
✅ Gestión de condiciones crónicas`
    };

    return responses[language] || responses['en'];
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
    
    const providers = {
      sib: this.sibAvailable,
      groq: !!this.groqClient,
      gemini: !!this.geminiClient
    };

    let status = 'down';
    if (providers.sib) {
      status = 'healthy';
    } else if (providers.groq || providers.gemini) {
      status = 'degraded';
    }

    const statusMessage = status === 'healthy'
      ? 'SIB primary brain is operational'
      : status === 'degraded'
        ? 'SIB primary unavailable; fallback providers active'
        : 'All AI providers offline';

    return {
      status,
      message: statusMessage,
      initialized: this.isInitialized,
      activeProvider: this.activeProvider,
      architecture: 'SIB → Groq/Gemini (local LLM requires GPU)',
      providers,
      priority: [
        { name: 'SIB Brain (Groq-backed)', status: this.sibAvailable ? 'available' : 'unavailable', role: 'PRIMARY' },
        { name: 'Groq API Direct', status: this.groqClient ? 'available' : 'unavailable', role: 'FALLBACK 1' },
        { name: 'Gemini API', status: this.geminiClient ? 'available' : 'unavailable', role: 'FALLBACK 2' }
      ],
      sibUrl: this.sibBaseUrl,
      lastSibError: this.lastSibError,
      sessionsActive: this.conversationHistory.size,
      storedSessions,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton
const medicalAIService = new MedicalAIService();
export default medicalAIService;
