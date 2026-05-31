import axios from 'axios';

// Base URL already includes /api, so we add /ai for AI routes
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const AI_API_URL = `${API_BASE_URL}/ai`;
const BRAIN_API_URL = `${API_BASE_URL}/v3/ai-brain`;

interface OrchestratorResponse {
  success: boolean;
  primary_response: string;
  response_type: string;
  patient_id: string;
  session_id: string;
  recommendations: string[];
  warnings: string[];
  orchestration: {
    tasks_created: number;
    llms_involved: string[];
    coordinated_by: string;
  };
  timestamp: string;
  emergency?: boolean;
  immediate_action_required?: boolean;
}

interface ConsultationResult {
  success: boolean;
  data?: OrchestratorResponse;
  error?: any;
  status?: number;
  sessionId?: string;
}

interface HealthScore {
  overall_score: number;
  overall_risk_level: string;
  detailed_scores: {
    cardiovascular_risk: number;
    diabetes_risk: number;
    hypertension_risk: number;
    mental_health_score: number;
    medication_adherence: number;
    lifestyle_score: number;
  };
  risk_levels: {
    cardiovascular: string;
    diabetes: string;
    hypertension: string;
  };
  risk_factors: string[];
  recommendations: string[];
  last_updated: string;
}

interface VitalsData {
  systolic?: number;
  diastolic?: number;
  heart_rate?: number;
  temperature?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  height?: number;
}

/**
 * Orchestrator API Client - Advanced Medical AI Service
 * Frontend service to communicate with the LLM Orchestrator backend
 */
class OrchestratorAPI {
  private baseURL: string;
  private currentSessionId: string | null;

  constructor() {
    // Use AI-specific URL for medical consultations
    this.baseURL = AI_API_URL;
    this.currentSessionId = null;
  }

  /**
   * Get authorization header with current user token
   */
  getAuthHeaders() {
    const token = localStorage.getItem('token');

    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  /**
   * Generate a new session ID
   */
  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `orchestrator_${timestamp}_${random}`;
  }

  /**
   * Get or create current session ID
   */
  getSessionId() {
    if (!this.currentSessionId) {
      this.currentSessionId = this.generateSessionId();
    }
    return this.currentSessionId;
  }

  /**
   * Start a new consultation session
   */
  startNewSession() {
    this.currentSessionId = this.generateSessionId();
    return this.currentSessionId;
  }

  /**
   * Consult with Dr. iSHA using the AI Brain orchestrator (agentic loop with 16 tools)
   * Falls back to old /working-medical-consult if Brain is unavailable.
   * @param {string} query - User's medical question
   * @param {string} language - Response language (default: 'en')
   * @param {Object} userContext - Additional user context
   * @returns {Promise<Object>} - Orchestrator's response
   */
  async consult(query: string, language = 'en', userContext = {}): Promise<ConsultationResult> {
    try {
      const sessionId = this.getSessionId();
      
      // Prepend language instruction if not English
      const langInstruction = language !== 'en'
        ? `[Respond in ${language === 'hi' ? 'Hindi' : language === 'es' ? 'Spanish' : language === 'ar' ? 'Arabic' : language === 'zh' ? 'Chinese' : 'English'}]\n`
        : '';
      
      // Use the AI Brain /think endpoint (agentic orchestrator with 16 tools)
      const response = await axios.post(
        `${BRAIN_API_URL}/think`,
        {
          message: langInstruction + query,
          conversationId: (userContext as any)?.conversationId || null,
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 60000, // 60s timeout for agentic loops (may use multiple tools)
        }
      );

      if (response.data?.success && response.data?.response) {
        const transformedData = {
          success: true,
          primary_response: response.data.response,
          response: response.data.response,
          provider: response.data.provider,
          model: response.data.model,
          toolsUsed: response.data.toolsUsed,
          iterations: response.data.iterations,
          latencyMs: response.data.latencyMs,
          conversationId: response.data.conversationId,
        };

        return {
          success: true,
          data: transformedData,
          sessionId: sessionId,
        };
      }

      throw new Error(response.data?.error || 'Empty response from Brain');
    } catch (error) {
      // If Brain fails, fall back to old medical consult endpoint
      console.warn('⚠️ Brain failed, falling back to legacy consult:', error.message);
      return this.legacyConsult(query, language, userContext);
    }
  }

  /**
   * Streaming consult with Dr. iSHA using SSE.
   * Provides real-time tool call visibility and incremental response.
   * @param query - User's medical question
   * @param callbacks - Event callbacks for streaming updates
   * @param language - Response language
   * @param userContext - Additional context (conversationId etc.)
   */
  async consultStream(
    query: string,
    callbacks: {
      onThinking?: (msg: string) => void;
      onToolCall?: (tool: string, args: any) => void;
      onToolResult?: (tool: string, summary: string) => void;
      onIteration?: (iteration: number) => void;
      onResponse?: (result: ConsultationResult) => void;
      onError?: (error: any) => void;
    },
    language = 'en',
    userContext: any = {}
  ): Promise<void> {
    const token = localStorage.getItem('token');
    const langInstruction = language !== 'en'
      ? `[Respond in ${language === 'hi' ? 'Hindi' : language === 'es' ? 'Spanish' : language === 'ar' ? 'Arabic' : language === 'zh' ? 'Chinese' : 'English'}]\n`
      : '';

    try {
      const response = await fetch(`${BRAIN_API_URL}/think`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          message: langInstruction + query,
          conversationId: userContext?.conversationId || null,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;

          try {
            const evt = JSON.parse(raw);
            switch (evt.type) {
              case 'thinking':
                callbacks.onThinking?.(evt.message);
                break;
              case 'tool_call':
                callbacks.onToolCall?.(evt.tool, evt.args);
                break;
              case 'tool_result':
                callbacks.onToolResult?.(evt.tool, evt.summary);
                break;
              case 'iteration':
                callbacks.onIteration?.(evt.iteration);
                break;
              case 'response':
                callbacks.onResponse?.({
                  success: evt.success,
                  data: {
                    ...evt,
                    primary_response: evt.response,
                  },
                  sessionId: this.getSessionId(),
                });
                break;
              case 'error':
                callbacks.onError?.(evt);
                break;
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Stream failed, falling back to non-streaming consult');
      callbacks.onError?.(error);
      // Fallback to regular consult
      const result = await this.consult(query, language, userContext);
      callbacks.onResponse?.(result);
    }
  }

  /**
   * Legacy fallback: old /working-medical-consult endpoint (SIB-backed)
   */
  private async legacyConsult(query: string, language = 'en', userContext = {}): Promise<ConsultationResult> {
    try {
      const sessionId = this.getSessionId();
      
      const response = await axios.post(
        `${this.baseURL}/working-medical-consult`,
        {
          query,
          language,
          userContext,
          sessionId,
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 45000,
        }
      );

      const primaryResponse = response.data?.primary_response || 
                             response.data?.response || 
                             response.data?.message ||
                             null;

      if (!primaryResponse) {
        return {
          success: false,
          error: {
            message: 'Invalid response from Dr. iSHA',
            details: 'No response content received from server',
            type: 'invalid_response'
          },
          data: null,
          sessionId: sessionId,
        };
      }

      const transformedData = {
        success: response.data?.status === 'success',
        primary_response: primaryResponse,
        response: primaryResponse,
        urgency_score: response.data?.urgency_score,
        symptoms_detected: response.data?.symptoms_detected,
        coordinated_by: response.data?.coordinated_by,
        ultra_fast_analysis: response.data?.ultra_fast_analysis
      };

      return {
        success: true,
        data: transformedData,
        sessionId: sessionId,
      };

    } catch (error) {
      console.error('❌ Dr. iSHA consultation error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: this.getAuthHeaders()
      });
      
      return this.handleError(error);
    }
  }

  /**
   * Record patient vitals
   * @param {string} patientId - Patient identifier
   * @param {VitalsData} vitals - Vital signs data
   * @returns {Promise<ConsultationResult>} - Vitals recording result
   */
  async recordVitals(patientId: string, vitals: VitalsData): Promise<ConsultationResult> {
    try {
      console.log('🩺 Recording vitals for patient:', patientId);
      
      const response = await axios.post(
        `${this.baseURL}/vitals/${patientId}`,
        vitals,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };

    } catch (error) {
      console.error('❌ Vitals recording error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Get patient health score
   * @param {string} patientId - Patient identifier
   * @returns {Promise<{success: boolean, healthScore?: HealthScore, error?: any}>} - Health score result
   */
  async getHealthScore(patientId: string): Promise<{success: boolean, healthScore?: HealthScore, error?: any}> {
    try {
      console.log('📊 Getting health score for patient:', patientId);
      
      const response = await axios.get(
        `${this.baseURL}/health-score/${patientId}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }
      );

      return {
        success: true,
        healthScore: response.data.health_score,
      };

    } catch (error) {
      console.error('❌ Health score error:', error);
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Schedule appointment
   * @param {string} patientId - Patient identifier
   * @param {Object} appointmentData - Appointment details
   * @returns {Promise<ConsultationResult>} - Appointment scheduling result
   */
  async scheduleAppointment(patientId: string, appointmentData: {
    type?: string;
    preferred_date?: string;
    notes?: string;
  }): Promise<ConsultationResult> {
    try {
      console.log('📅 Scheduling appointment for patient:', patientId);
      
      const response = await axios.post(
        `${this.baseURL}/appointment/${patientId}`,
        appointmentData,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };

    } catch (error) {
      console.error('❌ Appointment scheduling error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Get patient summary
   * @param {string} patientId - Patient identifier
   * @returns {Promise<ConsultationResult>} - Patient summary result
   */
  async getPatientSummary(patientId: string): Promise<ConsultationResult> {
    try {
      console.log('📋 Getting patient summary for:', patientId);
      
      const response = await axios.get(
        `${this.baseURL}/summary/${patientId}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        }
      );

      return {
        success: true,
        data: response.data,
      };

    } catch (error) {
      console.error('❌ Patient summary error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Check if orchestrator service is available
   * @returns {Promise<Object>} - Health status
   */
  async checkHealth(): Promise<{success: boolean, status: any}> {
    try {
      const response = await axios.get(
        `${this.baseURL}/health`,
        {
          timeout: 10000,
        }
      );

      return {
        success: true,
        status: response.data,
      };

    } catch (error) {
      console.error('Orchestrator health check error:', error);
      return {
        success: false,
        status: {
          status: 'unavailable',
          provider: 'orchestrator',
          error: error.message,
        },
      };
    }
  }

  /**
   * Clear current conversation session
   * @returns {Promise<Object>} - Clear session result
   */
  async clearSession() {
    try {
      if (!this.currentSessionId) {
        return { success: true, message: 'No active session to clear' };
      }

      const response = await axios.post(
        `${this.baseURL}/clear-session`,
        {
          sessionId: this.currentSessionId,
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }
      );

      // Start a new session
      this.startNewSession();

      return {
        success: true,
        data: response.data,
      };

    } catch (error) {
      console.error('Orchestrator clear session error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Get conversation history for current session
   * @returns {Promise<Object>} - Session history
   */
  async getSessionHistory() {
    try {
      if (!this.currentSessionId) {
        return {
          success: true,
          data: {
            sessionId: null,
            history: [],
            count: 0,
          },
        };
      }

      const response = await axios.get(
        `${this.baseURL}/session-history/${this.currentSessionId}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 10000,
        }
      );

      return {
        success: true,
        data: response.data,
      };

    } catch (error) {
      console.error('Orchestrator get session history error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Handle API errors consistently
   */
  handleError(error) {
    console.error('🔴 Orchestrator Error Handler:', {
      hasResponse: !!error.response,
      status: error.response?.status,
      data: error.response?.data,
      hasRequest: !!error.request,
      message: error.message
    });
    
    if (error.response) {
      // Check for authentication errors
      if (error.response.status === 401) {
        return {
          success: false,
          error: {
            message: error.response.data?.message || 'No token provided',
            details: 'Please log in to continue using Dr. iSHA',
            type: 'authentication_error',
            requiresLogin: true
          },
          status: 401,
        };
      }
      
      return {
        success: false,
        error: error.response.data,
        status: error.response.status,
      };
    } else if (error.request) {
      return {
        success: false,
        error: {
          message: 'Unable to connect to Dr. iSHA',
          details: 'Please check your internet connection and try again.',
          type: 'network_error'
        },
      };
    } else {
      return {
        success: false,
        error: {
          message: 'Request failed',
          details: error.message,
          type: 'request_error'
        },
      };
    }
  }

  /**
   * Get current session information
   */
  getSessionInfo() {
    return {
      sessionId: this.currentSessionId,
      hasActiveSession: !!this.currentSessionId,
      createdAt: this.currentSessionId ? 
        new Date(parseInt(this.currentSessionId.split('_')[1])).toISOString() : 
        null,
    };
  }
}

// Export singleton instance
export const orchestratorAPI = new OrchestratorAPI();
export default orchestratorAPI;