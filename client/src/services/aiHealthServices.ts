/**
 * AI Health Services - Unified Frontend API
 * ============================================
 * Connects to ALL backend AI endpoints:
 *   - Health Risk Scores (/api/v3/ai-intelligence/risk-score/me)
 *   - Smart Notifications (/api/v3/ai-intelligence/notifications/smart)
 *   - Clinical Insights (/api/v3/ai-intelligence/insights/patient/:id)
 *   - Emergency Triage (/api/v3/ai-intelligence/triage/assess)
 *   - Drug Interactions (/api/v3/ai-intelligence/drug-interactions/check)
 *   - AI Vision (Gemini in-browser + Claude backend)
 *   - AI Brain Orchestrator (/api/v3/ai-brain/think)
 *   - Health Intelligence (/api/health-intelligence)
 *   - Self-Learning Feedback (/api/v3/ai-intelligence/feedback)
 */

import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────

export interface HealthRiskScore {
  id: number;
  patient_id: number;
  overall_score: number;
  risk_level: string;
  cardiovascular_risk: number;
  diabetes_risk: number;
  respiratory_risk: number;
  mental_health_score: number;
  lifestyle_score: number;
  risk_factors: string[];
  recommendations: string[];
  model_version: string;
  updated_at: string;
  created_at: string;
}

export interface SmartNotification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'unread' | 'read' | 'dismissed';
  metadata: Record<string, any>;
  action_url?: string;
  created_at: string;
  read_at?: string;
}

export interface ClinicalInsight {
  id: number;
  insight_type: string;
  target_type: string;
  target_id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  action_taken: boolean;
  data: Record<string, any>;
  expires_at?: string;
  created_at: string;
}

export interface TriageResult {
  esi_level: number;
  esi_label: string;
  urgency: string;
  description: string;
  recommended_action: string;
  recommended_specialty: string;
  confidence: number;
  symptoms_analyzed: string[];
  risk_factors: string[];
  red_flags: string[];
  disposition: string;
  reassessment_time: string;
  patient_instructions: string[];
}

export interface DrugInteractionResult {
  interactions: Array<{
    drug1: string;
    drug2: string;
    severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
    description: string;
    mechanism: string;
    management: string;
  }>;
  summary: string;
  total_interactions: number;
  severe_count: number;
  recommendations: string[];
}

export interface HealthIntelligenceData {
  user_id: number;
  generated_at: string;
  summary: {
    total_reminders: number;
    high_priority: number;
    actionable: number;
  };
  categories: {
    medication: any[];
    checkups: any[];
    lifestyle: any[];
    diet: any[];
    activity: any[];
    vitals: any[];
    lab_tests: any[];
  };
  all_reminders: any[];
}

export interface AIBrainResponse {
  success: boolean;
  response: string;
  thinking?: string[];
  tool_calls?: Array<{
    tool: string;
    input: Record<string, any>;
    result: any;
  }>;
  session_id: string;
  iterations: number;
}

// ─── AI Health Services Class ─────────────────────────────────────

class AIHealthServices {

  // ═══ HEALTH RISK SCORES ═══
  
  /**
   * Get current user's AI-calculated health risk score
   * Backend: Computed every 6 hours by cron
   */
  async getMyRiskScore(): Promise<{ success: boolean; score: HealthRiskScore | null; message?: string }> {
    try {
      const { data } = await api.get('/v3/ai-intelligence/risk-score/me');
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Risk score fetch failed:', error.message);
      return { success: false, score: null, message: 'Failed to retrieve risk score' };
    }
  }

  // ═══ SMART NOTIFICATIONS ═══

  /**
   * Get AI-generated smart notifications (health alerts, reminders, insights)
   * Backend: Generated every 2 hours by cron
   */
  async getSmartNotifications(options?: { limit?: number; status?: string }): Promise<{ 
    success: boolean; 
    notifications: SmartNotification[]; 
    count: number 
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.status) params.set('status', options.status);
      
      const { data } = await api.get(`/v3/ai-intelligence/notifications/smart?${params}`);
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Smart notifications fetch failed:', error.message);
      return { success: false, notifications: [], count: 0 };
    }
  }

  /**
   * Mark a smart notification as read
   */
  async markNotificationRead(notificationId: number): Promise<boolean> {
    try {
      await api.patch(`/v3/ai-intelligence/notifications/smart/${notificationId}/read`);
      return true;
    } catch {
      return false;
    }
  }

  // ═══ CLINICAL INSIGHTS ═══

  /**
   * Get AI clinical insights for a patient
   * Backend: Generated every 8 hours by cron
   */
  async getPatientInsights(patientId: number): Promise<{ 
    success: boolean; 
    insights: ClinicalInsight[]; 
    count: number 
  }> {
    try {
      const { data } = await api.get(`/v3/ai-intelligence/insights/patient/${patientId}`);
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Clinical insights fetch failed:', error.message);
      return { success: false, insights: [], count: 0 };
    }
  }

  /**
   * Mark an insight as actioned
   */
  async markInsightActioned(insightId: number): Promise<boolean> {
    try {
      await api.patch(`/v3/ai-intelligence/insights/${insightId}/action`);
      return true;
    } catch {
      return false;
    }
  }

  // ═══ EMERGENCY TRIAGE ═══

  /**
   * AI-powered symptom triage using ESI 5-Level system
   * Returns urgency level, recommended specialty, and action plan
   */
  async assessSymptoms(params: {
    symptoms: string;
    vitals?: {
      heartRate?: number;
      bloodPressure?: string;
      temperature?: number;
      oxygenSaturation?: number;
      respiratoryRate?: number;
    };
    painScale?: number;
    age?: number;
    gender?: string;
  }): Promise<{ success: boolean } & Partial<TriageResult>> {
    try {
      const { data } = await api.post('/v3/ai-intelligence/triage/assess', params);
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Triage assessment failed:', error.message);
      return { success: false };
    }
  }

  // ═══ DRUG INTERACTIONS ═══

  /**
   * Check drug interactions between medications
   * Uses built-in database + LLM enhancement
   */
  async checkDrugInteractions(medications: string[], useLLM = true): Promise<{ 
    success: boolean 
  } & Partial<DrugInteractionResult>> {
    try {
      const { data } = await api.post('/v3/ai-intelligence/drug-interactions/check', {
        medications,
        useLLM
      });
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Drug interaction check failed:', error.message);
      return { success: false };
    }
  }

  /**
   * Quick drug interaction check (no LLM, < 10ms)
   */
  async quickDrugCheck(medications: string[]): Promise<any> {
    try {
      const { data } = await api.post('/v3/ai-intelligence/drug-interactions/quick-check', {
        medications
      });
      return data;
    } catch {
      return { success: false };
    }
  }

  // ═══ HEALTH INTELLIGENCE ═══

  /**
   * Get comprehensive health intelligence (reminders, suggestions, analysis)
   * Backend: AI-generated health recommendations across all categories
   */
  async getHealthIntelligence(): Promise<{ success: boolean; data?: HealthIntelligenceData }> {
    try {
      const { data } = await api.get('/health-intelligence');
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Health intelligence fetch failed:', error.message);
      return { success: false };
    }
  }

  // ═══ AI BRAIN (AGENTIC ORCHESTRATOR) ═══

  /**
   * Send a query to the AI Brain agentic orchestrator
   * Supports SSE streaming with tool call visibility
   */
  async thinkWithBrain(
    query: string,
    options?: {
      patientId?: number;
      sessionId?: string;
      context?: Record<string, any>;
    }
  ): Promise<AIBrainResponse> {
    try {
      const { data } = await api.post('/v3/ai-brain/think', {
        query,
        ...options
      });
      return data;
    } catch (error: any) {
      console.error('[AIHealth] AI Brain think failed:', error.message);
      return {
        success: false,
        response: 'AI is temporarily unavailable. Please try again.',
        session_id: '',
        iterations: 0
      };
    }
  }

  /**
   * Stream AI Brain response with real-time tool call visibility
   * Returns an AbortController for cancellation
   */
  streamBrainResponse(
    query: string,
    callbacks: {
      onThinking?: (thought: string) => void;
      onToolCall?: (tool: string, input: any) => void;
      onToolResult?: (tool: string, result: any) => void;
      onResponse?: (text: string) => void;
      onComplete?: (fullResponse: AIBrainResponse) => void;
      onError?: (error: Error) => void;
    },
    options?: {
      patientId?: number;
      sessionId?: string;
    }
  ): AbortController {
    const controller = new AbortController();
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || '/api';

    fetch(`${baseUrl}/v3/ai-brain/think/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, ...options }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

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
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr);
              switch (event.type) {
                case 'thinking':
                  callbacks.onThinking?.(event.thought);
                  break;
                case 'tool_call':
                  callbacks.onToolCall?.(event.tool, event.input);
                  break;
                case 'tool_result':
                  callbacks.onToolResult?.(event.tool, event.result);
                  break;
                case 'response':
                  callbacks.onResponse?.(event.text);
                  break;
                case 'complete':
                  callbacks.onComplete?.(event.data);
                  break;
                case 'error':
                  callbacks.onError?.(new Error(event.message));
                  break;
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          callbacks.onError?.(error);
        }
      });

    return controller;
  }

  // ═══ AI VISION (REPORT ANALYSIS) ═══

  /**
   * Analyze a medical report/image using the backend Claude Vision API
   * Note: Creates a patient-accessible endpoint (via medical-ai route)
   */
  async analyzeReport(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    query: string = 'Analyze this medical report and explain the findings in simple terms'
  ): Promise<{
    success: boolean;
    analysis?: {
      findings: string;
      assessment: string;
      recommendations: string[];
      urgency: 'routine' | 'soon' | 'urgent' | 'emergency';
      keyValues?: Record<string, { value: string; status: string; reference: string }>;
    };
    error?: string;
  }> {
    try {
      const { data } = await api.post('/medical-ai/analyze-report', {
        image: imageBase64,
        mimeType,
        query
      });
      return data;
    } catch (error: any) {
      console.error('[AIHealth] Report analysis failed:', error.message);
      return { success: false, error: 'Report analysis failed. Please try again.' };
    }
  }

  // ═══ SELF-LEARNING FEEDBACK ═══

  /**
   * Submit feedback for AI response quality
   * Powers the self-learning pipeline (runs every 4 hours)
   */
  async submitFeedback(params: {
    conversationId: string;
    thumbs?: 'up' | 'down';
    rating?: number;
    comment?: string;
  }): Promise<boolean> {
    try {
      await api.post('/v3/ai-intelligence/feedback', params);
      return true;
    } catch {
      return false;
    }
  }

  // ═══ WEARABLE HEALTH SUMMARY ═══

  /**
   * Get AI-generated health summary from wearable data
   */
  async getWearableHealthSummary(userId: number): Promise<any> {
    try {
      const { data } = await api.get(`/wearables/user/${userId}/health-summary`);
      return data;
    } catch {
      return { success: false };
    }
  }
}

export const aiHealthServices = new AIHealthServices();
export default aiHealthServices;
