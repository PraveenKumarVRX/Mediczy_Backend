/**
 * Medical AI Service - SIMPLIFIED
 * ALL chat routes to SIB ChatBotlet. No canned responses.
 */

import fetch from 'node-fetch';

class MedicalAIService {
  constructor() {
    this.doctorName = 'Dr. iSHA';
    this.sibBaseUrl = process.env.SIB_FASTAPI_URL || 'http://localhost:8001';
    this.sibAvailable = false;
    this.conversationHistory = new Map();
    
    // Check SIB health on startup
    this.checkSibHealth();
  }

  async checkSibHealth() {
    try {
      const response = await fetch(`${this.sibBaseUrl}/health`, {
        method: 'GET',
        timeout: 5000
      });
      this.sibAvailable = response.ok;
      if (this.sibAvailable) {
        console.log('✅ SIB FastAPI is available (SOLE AI SOURCE)');
        console.log('✅ Medical AI: SIB FastAPI initialized (SOLE AI SOURCE)');
        console.log(`   URL: ${this.sibBaseUrl}`);
        console.log('   Internal routing: iSHA AI (ai.isha.buzz) -> Groq (fallback)');
      }
      return this.sibAvailable;
    } catch (error) {
      console.error('❌ SIB health check failed:', error.message);
      this.sibAvailable = false;
      return false;
    }
  }

  /**
   * Main consultation method - ALL queries go to SIB
   */
  async consultMedical(query, sessionId, language = 'en', userContext = {}) {
    try {
      console.log(`🧠 [MedicalAI] Processing: "${query.substring(0, 50)}..."`);
      
      // Get or create conversation history
      if (!this.conversationHistory.has(sessionId)) {
        this.conversationHistory.set(sessionId, []);
      }
      const history = this.conversationHistory.get(sessionId);

      // Extract user ID from context
      const userId = userContext?.userId || userContext?.id || null;
      
      // Build patient data for context
      const patientData = {
        user: userContext?.user || null,
        profile: userContext?.profile || null,
        appointments: userContext?.appointments || null,
        prescriptions: userContext?.prescriptions || null
      };

      // ALL queries go to SIB
      let result;
      try {
        result = await this.consultWithSIB(query, history, language, sessionId, userId, patientData);
        console.log(`✅ [MedicalAI] SIB responded via ${result.provider}`);
      } catch (sibError) {
        console.error('❌ [MedicalAI] SIB failed:', sibError.message);
        result = {
          success: false,
          response: `I apologize, but I'm having trouble connecting to our AI system. Please try again in a moment.\n\n🏥 **If this is urgent:**\n- For emergencies: Call 911 or 108\n- For non-urgent concerns: Please try again shortly`,
          provider: 'error',
          model: 'none'
        };
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
        latency: result.latency || null
      };

    } catch (error) {
      console.error('[MedicalAI] Error:', error.message);
      return {
        success: false,
        error: error.message,
        response: "I apologize, something went wrong. Please try again.",
        doctor: this.doctorName,
        sessionId: sessionId,
        timestamp: new Date().toISOString(),
        provider: 'error'
      };
    }
  }

  /**
   * Consult with SIB FastAPI ChatBotlet
   */
  async consultWithSIB(query, history = [], language = 'en', sessionId = null, userId = null, patientData = null) {
    const controller = new AbortController();
    let timeout;
    
    try {
      if (!this.sibAvailable) {
        await this.checkSibHealth();
        if (!this.sibAvailable) {
          throw new Error('SIB not available');
        }
      }

      timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const patientId = sessionId || `mediczy_${Date.now()}`;
      
      const response = await fetch(`${this.sibBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: query,
          patient_id: patientId,
          user_id: userId,
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
      const responseText = data.chat_answer || data.response || data.message || 'I apologize, I could not generate a response.';
      
      // Extract latency info
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
        model: data.provider === 'groq' ? 'groq-via-sib' : 'Llama-3.1-8B-Instruct',
        turnCount: data.turn_count,
        conversationId: data.conversation_id,
        latency: latencyInfo
      };
    } catch (error) {
      console.error('SIB error:', error.message);
      this.sibAvailable = false;
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  /**
   * Analyze symptoms - routes to SIB
   */
  async analyzeSymptoms(symptoms, description, sessionId, language = 'en', options = {}) {
    const symptomsText = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;
    const query = `I am experiencing: ${symptomsText}. ${description || ''}`;
    return await this.consultMedical(query, sessionId, language, options);
  }

  /**
   * Clear conversation history
   */
  clearHistory(sessionId) {
    if (sessionId && this.conversationHistory.has(sessionId)) {
      this.conversationHistory.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId) {
    return this.conversationHistory.get(sessionId) || [];
  }
}

export default new MedicalAIService();
