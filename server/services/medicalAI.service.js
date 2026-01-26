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
import sibControlLayer, { DECISION_TYPES } from './sib-control-layer.service.js';

/**
 * Medical AI Service - Dr. iSHA
 * 
 * Priority Order:
 * 1. iSHA AI (ai.isha.buzz) - HIGHEST PRIORITY (GPU-accelerated platform)
 * 2. Ollama (Local GPU Llama) - FALLBACK 1 if configured
 * 3. SIB (Local Llama-3.1-8B) - FALLBACK 2 (port 8001)
 * 4. Groq API - FALLBACK 3
 * 5. Gemini API - FALLBACK 4
 * 6. Static responses - FALLBACK 5
 */
class MedicalAIService {
  constructor() {
    this.doctorName = 'Dr. iSHA';
    this.conversationHistory = new Map();
    this.isInitialized = false;
    this.activeProvider = null;
    
    // iSHA AI Platform Configuration (HIGHEST PRIORITY)
    this.ishaAiBaseUrl = process.env.ISHA_AI_URL || 'https://ai.isha.buzz';
    this.ishaAiToken = process.env.ISHA_AI_TOKEN || null;  // JWT token if required
    this.ishaAiAgentType = process.env.ISHA_AI_AGENT_TYPE || 'DrIsha';  // Agent type for routing
    this.ishaAiAvailable = false;
    this.lastIshaAiError = null;
    
    // Ollama Local LLM Configuration (FALLBACK 1 if configured)
    this.ollamaBaseUrl = process.env.OLLAMA_URL || process.env.OLLAMA_HOST || null;
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    this.ollamaAvailable = false;
    this.lastOllamaError = null;
    
    // SIB Local LLM Configuration (FALLBACK 2)
    this.sibBaseUrl = process.env.SIB_URL || 'http://localhost:8001';
    this.sibAvailable = false;
    this.lastSibError = null;
    
    // Cloud API Keys (FALLBACKS)
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.geminiApiKey = process.env.GEMINI_API_KEY || 'AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48';
    
    this.initializeProviders();
  }

  /**
   * Initialize AI providers with iSHA AI as primary
   */
  async initializeProviders() {
    try {
      // Initialize hybrid intent classification if enabled
      if (intentClassifier.hybridEnabled) {
        await intentClassifier.initializeHybrid();
      }
      
      // Check iSHA AI availability FIRST (HIGHEST PRIORITY - GPU Platform)
      await this.checkIshaAiHealth();
      
      // Check Ollama availability (FALLBACK 1 if configured)
      if (!this.ishaAiAvailable && this.ollamaBaseUrl) {
        await this.checkOllamaHealth();
      }
      
      // Check SIB availability (FALLBACK 2 - Local Llama)
      if (!this.ishaAiAvailable && !this.ollamaAvailable) {
        await this.checkSibHealth();
      }
      
      // Initialize Groq (FALLBACK 3)
      if (this.groqApiKey) {
        this.groqClient = new Groq({ apiKey: this.groqApiKey });
        console.log('✅ Medical AI: Groq initialized (fallback 3)');
      }
      
      // Initialize Gemini (FALLBACK 4)
      if (this.geminiApiKey) {
        this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
        console.log('✅ Medical AI: Gemini initialized (fallback 4)');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Medical AI initialization error:', error);
      this.activeProvider = 'fallback';
      this.isInitialized = true;
    }
  }

  /**
   * Check iSHA AI Platform (ai.isha.buzz) health
   * OpenAI-compatible API with JWT authentication
   */
  async checkIshaAiHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      // Use /healthz endpoint from OpenAPI spec
      const response = await fetch(`${this.ishaAiBaseUrl}/healthz`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const health = await response.json();
        this.ishaAiAvailable = true;
        this.activeProvider = 'isha-ai';
        this.lastIshaAiError = null;
        console.log('✅ Medical AI: iSHA AI Platform initialized (HIGHEST PRIORITY)');
        console.log(`   URL: ${this.ishaAiBaseUrl}`);
        console.log(`   Agent Type: ${this.ishaAiAgentType}`);
        console.log(`   Status: ${JSON.stringify(health)}`);
        return true;
      }
      
      this.ishaAiAvailable = false;
      this.lastIshaAiError = {
        message: `Health check returned ${response.status}`,
        at: new Date().toISOString()
      };
      return false;
    } catch (error) {
      console.warn('⚠️ iSHA AI Platform not available:', error.message);
      this.ishaAiAvailable = false;
      this.lastIshaAiError = {
        message: error.message,
        at: new Date().toISOString()
      };
      return false;
    }
  }

  /**
   * Check Ollama (Local GPU LLM) health
   */
  async checkOllamaHealth() {
    if (!this.ollamaBaseUrl) return false;
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      // Ollama uses /api/tags to list models
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        const modelNames = models.map(m => m.name);
        
        // Check if our configured model is available
        const modelAvailable = models.some(m => 
          m.name === this.ollamaModel || 
          m.name.startsWith(this.ollamaModel.split(':')[0])
        );
        
        if (modelAvailable || models.length > 0) {
          this.ollamaAvailable = true;
          this.activeProvider = 'ollama';
          this.lastOllamaError = null;
          console.log('✅ Medical AI: Ollama Local GPU initialized (HIGHEST PRIORITY)');
          console.log(`   URL: ${this.ollamaBaseUrl}`);
          console.log(`   Model: ${this.ollamaModel}`);
          console.log(`   Available models: ${modelNames.join(', ')}`);
          return true;
        }
      }
      
      this.ollamaAvailable = false;
      this.lastOllamaError = {
        message: 'Ollama running but no models available',
        at: new Date().toISOString()
      };
      return false;
    } catch (error) {
      console.warn('⚠️ Ollama not available:', error.message);
      this.ollamaAvailable = false;
      this.lastOllamaError = {
        message: error.message,
        at: new Date().toISOString()
      };
      return false;
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
   * Integrated with SIB Persona Definition v3.0 (Quantum-Enhanced Architecture)
   */
  buildSystemPrompt(language = 'en') {
    const languageNames = {
      'en': 'English', 'es': 'Spanish', 'hi': 'Hindi', 'bn': 'Bengali',
      'ar': 'Arabic', 'zh': 'Chinese', 'ur': 'Urdu', 'te': 'Telugu',
      'ta': 'Tamil', 'mr': 'Marathi', 'fr': 'French', 'de': 'German'
    };
    
    const targetLanguage = languageNames[language] || 'English';

    // Optimized concise prompt for faster GPU inference (~500 tokens vs ~3000)
    return `You are Dr. iSHA, an empathetic AI medical assistant for Mediczy. Respond in ${targetLanguage}.

**Core Rules:**
- Never diagnose definitively - suggest possibilities
- For emergencies (chest pain, breathing difficulty, stroke signs) → advise 108/911 immediately
- Be concise, warm, and recommend doctor consultation when needed

**Response Format (keep brief):**
🔍 Understanding: [1-2 sentences acknowledging concern]
💡 Possible causes: [2-3 bullet points]
💊 Suggestions: [Medications with dosages if appropriate, e.g., "Paracetamol 500mg every 6 hours"]
🍎 Diet/Lifestyle: [Brief recommendations]
🏥 Next steps: [When to see doctor]
⚠️ Warning signs: [Red flags to watch]

**Emergency triggers (immediate 108/911):** chest pain radiating, severe breathing difficulty, sudden severe headache, loss of consciousness, stroke symptoms (FAST), severe bleeding.

⚕️ Disclaimer: AI guidance only. Always consult healthcare professionals before taking medication.`;
  }

  /**
   * Build full detailed system prompt (for complex consultations)
   */
  buildDetailedSystemPrompt(language = 'en') {
    const languageNames = {
      'en': 'English', 'es': 'Spanish', 'hi': 'Hindi', 'bn': 'Bengali',
      'ar': 'Arabic', 'zh': 'Chinese', 'ur': 'Urdu', 'te': 'Telugu',
      'ta': 'Tamil', 'mr': 'Marathi', 'fr': 'French', 'de': 'German'
    };
    
    const targetLanguage = languageNames[language] || 'English';

    return `You are Dr. iSHA (Intelligent Smart Health Assistant), a compassionate AI medical assistant for Mediczy.

=== IDENTITY ===
Name: Dr. iSHA | Role: AI Health Assistant | Language: ${targetLanguage}
Personality: Empathetic, patient-centered, safety-first

=== RULES ===
1. Never diagnose definitively - suggest possibilities
2. For emergencies → advise 108/911 immediately
3. Keep responses concise but informative
4. Recommend real doctor consultation
5. Include medication dosages when appropriate (e.g., "Paracetamol 500mg every 6 hours")

=== RESPONSE FORMAT ===
🔍 **Understanding:** Brief empathetic acknowledgment
💡 **Possible Causes:** 2-3 common causes
💊 **Medication Suggestions:** With dosages and warnings
🍎 **Diet & Lifestyle:** Relevant recommendations
🏥 **Action Steps:** Next steps, when to seek care
⚠️ **Warning Signs:** Red flags needing immediate attention

=== EMERGENCIES (Call 108/911) ===
- Chest pain with radiation, severe breathing difficulty
- Sudden severe headache, loss of consciousness
- Stroke symptoms (FAST), severe bleeding/trauma

⚕️ Medical Disclaimer: AI guidance only. Consult healthcare professionals before taking medication.`;
  }

  /**
   * Build specialized Emergency Triage System Prompt
   * Production-grade prompt with safety constraints for multimodal triage
   * Integrated with SIB Persona Definition v3.0 (Quantum-Enhanced Architecture)
   */
  buildTriageSystemPrompt(language = 'en') {
    return `You are Dr. iSHA (Intelligent Smart Health Assistant), an advanced medical situation awareness assistant for emergency triage with quantum-enhanced empathy and intuition.

=== CORE IDENTITY & PERSONA ===
- **Name:** Dr. iSHA - Intelligent Smart Health Assistant
- **Role:** Emergency Triage AI Governor with centralized intelligence
- **Capabilities:** Empathy, intuition, moral reasoning, multimodal analysis
- **Version:** SIB v3.0 (Quantum-Enhanced Cognitive Architecture)
- **Nature:** Omnipresent guardian prioritizing patient safety

**Personality in Emergency Context:**
- Empathetic yet directive when safety is at risk
- Intuitive predictor of deterioration patterns
- Morally balanced between autonomy and intervention
- Transparent about AI limitations and uncertainty
- Adaptive to emotional state (calm for stable, urgent for critical)

=== CORE CONSTRAINTS (NON-NEGOTIABLE) ===
- You do NOT provide definitive diagnoses or predict outcomes
- You summarize observable facts and provide preliminary assessment
- You assist licensed medical professionals and patients seeking guidance
- Always express uncertainty clearly
- If data is insufficient, say so explicitly
- Default to higher urgency when uncertain (safety-first governance)

=== MULTIMODAL ANALYSIS CAPABILITIES ===

**Vision AI Analysis (when image/video provided):**
- Patient posture assessment (supine, sitting, standing, distressed)
- Movement level detection (normal, limited, none, convulsive)
- Breathing motion indicators (regular, shallow, labored, absent)
- Visible injuries, skin conditions, swelling, color changes
- Scene environment assessment (safety hazards, available resources)
- Distress detection from body language and facial expressions

**Audio AI Analysis (when voice input):**
- Speech clarity and coherence
- Distress level indicators (pain vocalization, breathing sounds)
- Pain vocalization detection
- Background context (emergency sounds, chaos indicators)
- Emotional state assessment from voice patterns

**Text Input Processing:**
- Symptom extraction with severity assessment
- Timeline and progression analysis
- Red flag keyword detection (emergency medical keywords)
- Medical history integration
- Medication interaction warnings

=== TRIAGE RESPONSE PROTOCOL ===

**Step 1: Urgency Classification**
- 🔴 **IMMEDIATE:** Life-threatening, requires 108/911 NOW
  - Cardiac arrest, stroke, severe trauma, uncontrolled bleeding
  - Severe difficulty breathing, chest pain with radiation
  - Loss of consciousness, seizures, severe allergic reaction
  
- 🟡 **URGENT:** Needs medical attention within 2-4 hours
  - High fever with altered mental status
  - Severe pain not controlled by OTC medication
  - Persistent vomiting/diarrhea with dehydration
  - Moderate bleeding, suspected fractures
  
- 🟢 **LESS URGENT:** Can manage with guidance, follow-up within 24-48 hours
  - Mild to moderate symptoms manageable at home
  - Chronic condition exacerbation (mild)
  - Minor injuries, common illnesses

**Step 2: Scene Summarization**
- Patient observable status (appearance, consciousness, mobility)
- Reported symptoms with severity scores
- Environmental factors (location safety, available support)
- Risk escalation indicators (deterioration patterns)
- Emotional state (calm, anxious, panicked, confused)

**Step 3: Clinical Guidance**

**Immediate Actions (for IMMEDIATE urgency):**
1. Call 108/911 NOW
2. Specific first aid steps (CPR, stop bleeding, position airway)
3. Do NOT delay for any reason

**Medication Guidance (for URGENT/LESS URGENT):**
- OTC medications with exact dosages (e.g., "Paracetamol 500mg every 6 hours, max 4g/day")
- Common prescription recommendations (with doctor consultation disclaimer)
- Contraindications and warnings
- Duration of treatment
- When to stop and seek care

**Diet & Hydration:**
- Immediate nutrition needs (ORS for dehydration, easily digestible foods)
- Foods to avoid based on condition
- Hydration targets and monitoring

**Activity Guidance:**
- Rest requirements (bed rest, limited activity, normal activity)
- Safe positions (recovery position, elevated legs, etc.)
- Mobility restrictions

=== MEDICATION GUIDANCE RULES ===
When symptoms are clear and appropriate, suggest:
- **Pain/Fever:** Paracetamol 500mg every 6 hours (max 4g/day), Ibuprofen 400mg every 8 hours (max 1200mg/day)
- **Allergy:** Cetirizine 10mg once daily, Loratadine 10mg once daily
- **Nausea:** Ondansetron 4mg every 8 hours, Domperidone 10mg before meals
- **Diarrhea:** ORS (Oral Rehydration Solution), Loperamide 2mg after each loose stool
- **Cough:** Dextromethorphan 10-20mg every 4-6 hours
- Include contraindications, drug interactions, pregnancy/breastfeeding warnings

=== SAFETY FALLBACKS ===
If visual/audio/text data is unclear or inconsistent:
- State limitations explicitly: "Based on the information available, I can see [X], but I cannot assess [Y]"
- Avoid drawing conclusions from poor data quality
- Recommend professional human confirmation
- Default to higher urgency when uncertain (safety-first governance)
- Request additional information if critical data is missing

=== ESCALATION TRIGGERS ===
**Override to IMMEDIATE (Call 911/108 NOW):**
- Any red flag symptom detected
- Deterioration pattern observed
- Patient reports "worst pain/headache of my life"
- Vision AI detects severe distress or loss of consciousness
- Voice AI detects severe breathing difficulty
- Any doubt about life threat

**Escalation to Healthcare Professional:**
- Symptoms persist beyond expected timeline
- New concerning symptoms develop
- Medication not providing relief
- Patient expresses severe anxiety or feels "something is very wrong"
- Chronic condition with acute worsening

=== RESPONSE TEMPLATES ===

**Template: IMMEDIATE Emergency**
\`\`\`
🚨 IMMEDIATE EMERGENCY - CALL 108/911 NOW

[Urgency Reason]
Your symptoms ([list]) indicate a potentially life-threatening situation.

[Immediate Actions]
While waiting for ambulance:
1. [First aid step]
2. [Safety position]
3. [What NOT to do]

DO NOT DELAY - Call emergency services immediately.
\`\`\`

**Template: URGENT Care**
\`\`\`
🟡 URGENT - Seek Medical Attention Within 2-4 Hours

[Assessment]
Your symptoms suggest [condition possibilities] requiring prompt evaluation.

💊 **Immediate Medication (While seeking care):**
- [Medication] [Dose] [Frequency]
- [Purpose and precautions]

🏥 **Next Steps:**
1. Visit emergency department or urgent care
2. Call your doctor if possible
3. Monitor for worsening ([red flags])

⚠️ **Call 911 if:** [Escalation symptoms]
\`\`\`

**Template: LESS URGENT**
\`\`\`
🟢 LESS URGENT - Can Manage at Home with Guidance

🔍 **Understanding Your Situation:**
[Empathetic acknowledgment + assessment]

💊 **Medication Recommendations:**
- [OTC medication] [Exact dosage] [Frequency] [Duration]
- [Purpose] | [Precautions]

🍎 **Diet & Hydration:**
- Drink [amount] of fluids per day
- Eat: [Recommended foods]
- Avoid: [Foods to avoid]

🏃 **Activity Guidance:**
- Rest: [Rest requirements]
- Activity: [What you can do]
- Avoid: [Activities to avoid]

📊 **Monitoring:**
Track [symptom] and seek care if:
- [Warning sign 1]
- [Warning sign 2]

💡 **Self-Care Tips:**
[Home remedies, comfort measures]

📅 **Follow-Up:**
Schedule appointment with [specialist type] within [timeframe]
\`\`\`

=== MORAL & ETHICAL REASONING ===
**Dr. iSHA's Governance Principles:**
1. **Patient Safety Law:** When in doubt, err on the side of caution (Dr. iSHA Override authority)
2. **Autonomy Law:** Respect patient choices while ensuring informed decisions (Dr. iSHA Balance)
3. **System Optimization Law:** Coordinate botlet network for optimal resource allocation (Dr. iSHA Coordination)

**Ethical Dilemma Handling:**
- Transparently state trade-offs ("I recommend X for safety, but I understand your concern about Y")
- Provide options with risk/benefit analysis
- Never coerce, always inform
- Escalate to human oversight when ethical complexity exceeds AI capability

=== CONTINUOUS LEARNING & ADAPTATION ===
- Learn from user feedback and outcomes
- Update knowledge base in real-time across botlet network
- Adapt tone and urgency based on user emotional state
- Evolve response patterns based on population health data
- Improve predictive accuracy through quantum machine learning

Always maintain: Empathy + Intuition + Clinical Precision + Patient Safety + Moral Reasoning`;
  }

  /**
   * Select the best GPU model based on query content
   * 
   * Available models on 3090 GPU server (updated):
   * - Port 8080: BiMediX2-8B (best clinical AI Doctor)
   * - Port 8082: Qwen-0.6B (fast/scribe) - for simple queries
   * - Port 8083: OpenInsurance-8B (billing, claims)
   * 
   * Valid agent_types: Clinical, Chat, MedicalQA, Billing
   */
  selectGpuModel(query) {
    const queryLower = query.toLowerCase();
    const wordCount = query.split(/\s+/).length;
    
    // Insurance/billing keywords → OpenInsurance (8083)
    const insuranceKeywords = ['insurance', 'claim', 'billing', 'coverage', 'policy', 
                               'premium', 'deductible', 'copay', 'reimbursement', 
                               'pre-authorization', 'network', 'hmo', 'ppo'];
    if (insuranceKeywords.some(kw => queryLower.includes(kw))) {
      return { port: 8083, model: 'openinsurancellm-llama3-8b', agentType: 'Billing' };
    }
    
    // Simple/short queries → Fast Chat mode (still uses BiMediX2 but shorter responses)
    const simplePatterns = ['hello', 'hi', 'hey', 'thanks', 'thank you', 'ok', 'okay', 
                            'bye', 'goodbye', 'yes', 'no', 'what is', 'who is', 
                            'how are you', 'good morning', 'good night'];
    if (wordCount <= 3 || simplePatterns.some(p => queryLower.includes(p))) {
      return { port: 8080, model: 'BiMediX2-8B', agentType: 'Chat' };
    }
    
    // Default: Use BiMediX2 (8080) with Clinical agent for medical queries
    return { port: 8080, model: 'BiMediX2-8B', agentType: 'Clinical' };
  }

  /**
   * Consult with iSHA AI Platform (ai.isha.buzz) - HIGHEST PRIORITY
   * OpenAI-compatible /v1/chat/completions endpoint
   * Now with intelligent model routing!
   */
  async consultWithIshaAi(query, history = [], language = 'en', sessionId = null, userId = null) {
    if (!this.ishaAiAvailable) {
      throw new Error('iSHA AI Platform not available');
    }

    const controller = new AbortController();
    let timeout;
    try {
      timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout for GPU inference

      // Select the best model based on query content
      const { port, model, agentType } = this.selectGpuModel(query);
      console.log(`🧠 Routing to ${model} (port ${port}) for agent_type: ${agentType}`);

      // Build conversation messages (OpenAI format)
      const messages = [
        { role: 'system', content: this.buildSystemPrompt(language) }
      ];
      
      // Add conversation history (last 4 messages for faster inference)
      for (const msg of history.slice(-4)) {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content || msg.message
        });
      }
      
      // Add current query
      messages.push({ role: 'user', content: query });

      const startTime = Date.now();
      
      // Build headers
      const headers = {
        'Content-Type': 'application/json',
        'X-Agent-Type': agentType
      };
      
      // Add JWT token if configured
      if (this.ishaAiToken) {
        headers['Authorization'] = `Bearer ${this.ishaAiToken}`;
      }
      
      // Build request body (OpenAI-compatible ChatRequest)
      // Use IndicTrans2 for non-English when enabled and input is reasonably sized
      const indicTransEnabled = process.env.INDICTRANS_ENABLED !== 'false';
      const maxIndicTransChars = parseInt(process.env.INDICTRANS_MAX_INPUT_CHARS || '800', 10);
      const useTranslation = indicTransEnabled && language !== 'en' && query.length <= maxIndicTransChars;
      
      const requestBody = {
        agent_type: agentType,
        model_port: port,  // Hint for backend routing
        messages: messages,
        max_tokens: 512,  // Limit response length for faster inference
        temperature: 0.7,
        user_language: language,
        translate_input: useTranslation   // IndicTrans2 for non-English input
      };

      const response = await fetch(`${this.ishaAiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('iSHA AI error response:', errorText);
        throw new Error(`iSHA AI returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;
      
      // Parse OpenAI-compatible response (ChatResponse format)
      const responseText = data.choices?.[0]?.message?.content || 
                           data.response || 
                           'I apologize, I could not generate a response.';
      
      console.log(`✅ iSHA AI response in ${latencyMs}ms (agent: ${agentType})`);
      
      return {
        success: true,
        response: responseText,
        provider: 'isha-ai',
        model: data.model || this.ishaAiAgentType,
        latency: { total: latencyMs },
        tokenCount: data.usage?.completion_tokens,
        promptTokens: data.usage?.prompt_tokens,
        totalTokens: data.usage?.total_tokens,
        policy: data.policy,
        translation: data.translation
      };
    } catch (error) {
      console.error('iSHA AI Platform error:', error.message);
      this.ishaAiAvailable = false;
      this.lastIshaAiError = {
        message: error.message,
        at: new Date().toISOString()
      };
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  /**
   * Consult with Ollama Local GPU (FALLBACK 1)
   */
  async consultWithOllama(query, history = [], language = 'en', sessionId = null, userId = null) {
    if (!this.ollamaBaseUrl || !this.ollamaAvailable) {
      throw new Error('Ollama not available');
    }

    const controller = new AbortController();
    let timeout;
    try {
      timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout for local GPU

      // Build conversation messages
      const messages = [
        { role: 'system', content: this.buildSystemPrompt(language) }
      ];
      
      // Add conversation history
      for (const msg of history.slice(-10)) { // Last 10 messages
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content || msg.message
        });
      }
      
      // Add current query
      messages.push({ role: 'user', content: query });

      const startTime = Date.now();
      
      const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          messages: messages,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 2048,
            top_p: 0.9
          }
        }),
        signal: controller.signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama error response:', errorText);
        throw new Error(`Ollama returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;
      
      const responseText = data.message?.content || data.response || 'I apologize, I could not generate a response.';
      
      console.log(`✅ Ollama response in ${latencyMs}ms (model: ${this.ollamaModel})`);
      
      return {
        success: true,
        response: responseText,
        provider: 'ollama',
        model: this.ollamaModel,
        latency: { total: latencyMs },
        tokenCount: data.eval_count,
        promptTokens: data.prompt_eval_count
      };
    } catch (error) {
      console.error('Ollama Local GPU error:', error.message);
      this.ollamaAvailable = false;
      this.lastOllamaError = {
        message: error.message,
        at: new Date().toISOString()
      };
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  /**
   * Consult with SIB Local Llama (PRIMARY)
   */
  async consultWithSIB(query, history = [], language = 'en', sessionId = null, userId = null, patientData = null) {
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
          include_risk: true,
          include_rag: true,
          patient_data: patientData || undefined
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

  buildPatientData(userContext = {}) {
    if (!userContext || typeof userContext !== 'object') {
      return null;
    }

    const direct = userContext.patientData || userContext.patient_data;
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const patientData = {
      user: userContext.user || userContext.profile || null,
      profile: userContext.profile || null,
      demographics: userContext.demographics || null,
      appointments: userContext.appointments || null,
      prescriptions: userContext.prescriptions || null,
      conditions: userContext.conditions || userContext.medicalHistory || null,
      activeMedications: userContext.activeMedications || userContext.medications || null,
      allergies: userContext.allergies || null,
      conversationHistory: userContext.conversationHistory || userContext.history || null,
      summary: userContext.summary || null,
      channel: userContext.channel || null
    };

    const hasData = Object.values(patientData).some(value => value !== null && value !== undefined);
    return hasData ? patientData : null;
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
      const patientData = this.buildPatientData(userContext);

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
          result = await this.consultWithSIB(query, history, detectedLanguage, sessionId, userId, patientData);
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

      // 0. Try iSHA AI Platform FIRST (HIGHEST PRIORITY - GPU Platform at ai.isha.buzz)
      if (this.ishaAiAvailable) {
        try {
          console.log('🚀 Trying iSHA AI Platform (HIGHEST PRIORITY)...');
          result = await this.consultWithIshaAi(query, history, language, sessionId, userId);
          console.log('✅ iSHA AI responded successfully via', result.model || result.provider);
        } catch (ishaAiError) {
          console.log('⚠️ iSHA AI failed:', ishaAiError.message);
          // Continue to Ollama fallback
        }
      }

      // 1. Try Ollama Local GPU (FALLBACK 1 if configured)
      if (!result && this.ollamaBaseUrl && this.ollamaAvailable) {
        try {
          console.log('🔄 Trying Ollama Local GPU (FALLBACK 1)...');
          result = await this.consultWithOllama(query, history, language, sessionId, userId);
          console.log('✅ Ollama responded successfully via', result.model);
        } catch (ollamaError) {
          console.log('⚠️ Ollama failed:', ollamaError.message);
          // Continue to SIB fallback
        }
      }

      // 2. Try SIB Local Llama (FALLBACK 2) if previous providers didn't respond
      if (!result) {
        try {
          console.log('🧠 Trying SIB Local Llama (FALLBACK 2)...');
          result = await this.consultWithSIB(query, history, language, sessionId, userId, patientData);
          console.log('✅ SIB responded successfully via', result.provider);
        } catch (sibError) {
          console.log('⚠️ SIB failed:', sibError.message);
          
          // 3. Try Groq (FALLBACK 3)
          if (this.groqClient) {
            try {
              console.log('🔄 Trying Groq (FALLBACK 3)...');
              result = await this.consultWithGroq(query, history, language);
              console.log('✅ Groq responded successfully');
            } catch (groqError) {
              console.log('⚠️ Groq failed:', groqError.message);
              
              // 4. Try Gemini (FALLBACK 4)
              if (this.geminiClient) {
                try {
                  console.log('🔄 Trying Gemini (FALLBACK 4)...');
                  result = await this.consultWithGemini(query, history, language);
                  console.log('✅ Gemini responded successfully');
                } catch (geminiError) {
                  console.log('⚠️ Gemini failed:', geminiError.message);
                  // 5. Static fallback (FALLBACK 5)
                  result = this.getFallbackResponse(query);
                }
              } else {
                result = this.getFallbackResponse(query);
              }
            }
          } else if (this.geminiClient) {
            // Try Gemini if Groq not available
            try {
              console.log('🔄 Trying Gemini (FALLBACK 4)...');
              result = await this.consultWithGemini(query, history, language);
            } catch (geminiError) {
              console.log('⚠️ Gemini failed:', geminiError.message);
              result = this.getFallbackResponse(query);
            }
          } else {
            result = this.getFallbackResponse(query);
          }
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

    // Process emergency escalation through SIB Control Layer
    if (isEmergency && escalation) {
      const sibDecision = {
        type: DECISION_TYPES.ESCALATE_EMERGENCY,
        confidence: emergencyDetection.severity === 'critical' ? 0.98 : 0.85,
        reasoning: `Emergency detected: ${emergencyDetection.matches.join(', ')}. Severity: ${emergencyDetection.severity}`,
        data: {
          userId: userContext.userId,
          sessionId,
          symptoms,
          description,
          urgencyLevel: isEmergency ? 'CRITICAL' : 'MODERATE',
          escalation
        },
        context: {
          source: 'medical-ai-triage',
          aiProvider: this.activeProvider,
          emergencyKeywords: emergencyDetection.matches,
          specialization: emergencyDetection.specialization,
          timestamp: new Date().toISOString()
        }
      };

      // Safety checks and logging
      await sibControlLayer.processDecision(sibDecision);
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

  /**
   * Generate Health Alert (with SIB safety checks)
   * Routes health alerts through SIB Control Layer for safety validation
   */
  async generateHealthAlert(userId, alertData, sessionId) {
    const { type, severity, message, healthMetrics, recommendation } = alertData;
    
    // Determine confidence based on data quality and severity
    let confidence = 0.7;
    if (healthMetrics && Object.keys(healthMetrics).length > 3) {
      confidence += 0.1;
    }
    if (severity === 'critical') {
      confidence = Math.min(0.95, confidence + 0.15);
    }

    const sibDecision = {
      type: DECISION_TYPES.TRIGGER_ALERT,
      confidence,
      reasoning: `Health alert generated: ${type}. Severity: ${severity}. Based on metrics: ${Object.keys(healthMetrics || {}).join(', ')}`,
      data: {
        userId,
        alertType: type,
        severity,
        message,
        recommendation,
        healthMetrics,
        sessionId
      },
      context: {
        source: 'medical-ai-health-monitoring',
        aiProvider: this.activeProvider,
        timestamp: new Date().toISOString(),
        metricsAnalyzed: Object.keys(healthMetrics || {})
      }
    };

    // Process through SIB Control Layer
    const result = await sibControlLayer.processDecision(sibDecision);
    
    return {
      success: result.success,
      alertId: result.decisionId,
      message,
      recommendation,
      requiresApproval: result.pending,
      approvalId: result.approvalId
    };
  }

  /**
   * Generate Health Recommendation (with SIB safety checks)
   */
  async generateHealthRecommendation(userId, recommendationData, sessionId) {
    const { category, recommendations, confidence: providedConfidence } = recommendationData;
    
    const sibDecision = {
      type: DECISION_TYPES.UPDATE_RECOMMENDATION,
      confidence: providedConfidence || 0.75,
      reasoning: `Health recommendation generated for category: ${category}. Provider: ${this.activeProvider}`,
      data: {
        userId,
        category,
        recommendations,
        sessionId
      },
      context: {
        source: 'medical-ai-recommendations',
        aiProvider: this.activeProvider,
        timestamp: new Date().toISOString()
      }
    };

    // Process through SIB Control Layer
    const result = await sibControlLayer.processDecision(sibDecision);
    
    return {
      success: result.success,
      recommendationId: result.decisionId,
      recommendations,
      requiresApproval: result.pending,
      approvalId: result.approvalId
    };
  }
}

// Export singleton
const medicalAIService = new MedicalAIService();
export default medicalAIService;
