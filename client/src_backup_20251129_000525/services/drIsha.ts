import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.72:8000/api';

interface DrIshaResponse {
  success: boolean;
  response: string;
  doctor: string;
  sessionId: string;
  timestamp: string;
  language: string;
  provider: string;
  conversationLength?: number;
}

interface SymptomAnalysisOptions {
  severity?: string;
  duration?: string;
}

interface ConsultationResult {
  success: boolean;
  data?: DrIshaResponse;
  error?: any;
  status?: number;
  sessionId?: string;
}

/**
 * Dr. Isha API Client - Enhanced Medical AI Service
 * Frontend service to communicate with the integrated Medical AI backend
 */
class DrIshaAPI {
  private baseURL: string;
  private currentSessionId: string | null;

  constructor() {
    // Updated to use correct backend endpoint: /api/medical-ai instead of /api/dr-isha
    this.baseURL = `${API_BASE_URL}/medical-ai`;
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
    return `dr_isha_${timestamp}_${random}`;
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
   * Consult with Dr. Isha using the integrated Medical AI service
   * @param {string} query - User's medical question
   * @param {string} language - Response language (default: 'en')
   * @param {Object} userContext - Additional user context
   * @returns {Promise<Object>} - Dr. Isha's response
   */
  async consult(query: string, language = 'en', userContext = {}): Promise<ConsultationResult> {
    try {
      const sessionId = this.getSessionId();
      
      console.log('🏥 Dr. iSHA Consult Request:', {
        query: query.substring(0, 50) + '...',
        language,
        sessionId,
        baseURL: this.baseURL
      });
      
      const response = await axios.post(
        `${this.baseURL}/consult`,
        {
          query,
          language,
          userContext,
          sessionId,
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 45000, // 45 second timeout for medical consultations
        }
      );

      console.log('✅ Dr. iSHA Response Success:', {
        status: response.status,
        hasData: !!response.data,
        success: response.data?.success
      });

      return {
        success: true,
        data: response.data,
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
      
      if (error.response) {
        // Server responded with error status
        return {
          success: false,
          error: error.response.data,
          status: error.response.status,
        };
      } else if (error.request) {
        // Request was made but no response received
        return {
          success: false,
          error: {
            message: 'Unable to connect to Dr. Isha',
            details: 'Please check your internet connection and try again.',
            type: 'network_error'
          },
        };
      } else {
        // Something else happened
        return {
          success: false,
          error: {
            message: 'Consultation request failed',
            details: error.message,
            type: 'request_error'
          },
        };
      }
    }
  }

  /**
   * Analyze symptoms with Dr. Isha
   * @param {Array} symptoms - Array of selected symptoms
   * @param {string} description - Additional symptom description
   * @param {string} language - Response language
   * @param {SymptomAnalysisOptions} options - Additional options (severity, duration, etc.)
   * @returns {Promise<ConsultationResult>} - Dr. Isha's symptom analysis
   */
  async analyzeSymptoms(
    symptoms: string[], 
    description: string, 
    language = 'en', 
    options: SymptomAnalysisOptions = {}
  ): Promise<ConsultationResult> {
    try {
      const sessionId = this.getSessionId();
      
      const response = await axios.post(
        `${this.baseURL}/analyze-symptoms`,
        {
          symptoms,
          description,
          language,
          severity: options.severity || 'moderate',
          duration: options.duration || '',
          sessionId,
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 45000,
        }
      );

      return {
        success: true,
        data: response.data,
        sessionId: sessionId,
      };

    } catch (error) {
      console.error('Dr. Isha symptom analysis error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Check if Dr. Isha service is available
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
      console.error('Dr. Isha health check error:', error);
      return {
        success: false,
        status: {
          status: 'unavailable',
          provider: 'unknown',
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
      console.error('Dr. Isha clear session error:', error);
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
      console.error('Dr. Isha get session history error:', error);
      return this.handleError(error);
    }
  }

  /**
   * Handle API errors consistently
   */
  handleError(error) {
    if (error.response) {
      return {
        success: false,
        error: error.response.data,
        status: error.response.status,
      };
    } else if (error.request) {
      return {
        success: false,
        error: {
          message: 'Unable to connect to Dr. Isha',
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
        new Date(parseInt(this.currentSessionId.split('_')[2])).toISOString() : 
        null,
    };
  }
}

// Export singleton instance
export const drIshaAPI = new DrIshaAPI();
export default drIshaAPI;