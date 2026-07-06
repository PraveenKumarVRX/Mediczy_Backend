/**
 * Doctor Copilot API client (web) — AI-PLATFORM-001 unified gateway.
 * Mobile (msh_d_app): use shared/doctor-mobile-api/doctorCopilot.client.ts
 */

import api from '@/lib/api';

export type CopilotHistoryRole = 'user' | 'assistant' | 'doctor';

export interface CopilotHistoryTurn {
  role: CopilotHistoryRole;
  text?: string;
  content?: string;
  message?: string;
}

export interface CopilotPatientContext {
  id?: number | string;
  name?: string;
  age?: number;
  gender?: string;
}

export interface DoctorCopilotContext {
  currentScreen?: string;
  screen?: string;
  currentPatient?: CopilotPatientContext | null;
  patient?: CopilotPatientContext | null;
}

export type DoctorCopilotMode = 'auto' | 'agent' | 'clinical';

export interface DoctorCopilotChatRequest {
  message: string;
  text?: string;
  history?: CopilotHistoryTurn[];
  context?: DoctorCopilotContext;
  sessionId?: string;
  language?: string;
  mode?: DoctorCopilotMode;
}

export interface DoctorCopilotChatResponse {
  success?: boolean;
  intent?: string;
  action?: string | null;
  parameters?: Record<string, unknown> | null;
  response?: string;
  speak?: string;
  primary_response?: string;
  data?: unknown;
  requiresConfirmation?: boolean;
  traceId?: string;
  gateway?: 'doctor-copilot';
  path?: 'agent' | 'clinical';
  error?: string;
}

export interface DoctorCopilotBriefingResponse {
  summary?: string;
  todayAppointments?: number;
  pending?: number;
  completed?: number;
  hasUpdates?: boolean;
  hasUrgent?: boolean;
  speakText?: string;
  [key: string]: unknown;
}

function normalizeHistory(history: CopilotHistoryTurn[] = []) {
  return history.slice(-15).map((turn) => ({
    role: turn.role,
    text: String(turn.text || turn.content || turn.message || ''),
  }));
}

function pickResponseText(data: DoctorCopilotChatResponse): string {
  return (
    data.response ||
    data.speak ||
    data.primary_response ||
    (typeof data.error === 'string' ? data.error : '') ||
    ''
  ).trim();
}

export const doctorCopilotService = {
  async chat(payload: DoctorCopilotChatRequest): Promise<DoctorCopilotChatResponse> {
    const message = String(payload.message || payload.text || '').trim();
    if (!message) throw new Error('message is required');

    const requestBody = {
      message,
      history: normalizeHistory(payload.history),
      context: payload.context || {},
      sessionId: payload.sessionId,
      language: payload.language || 'en',
      mode: payload.mode || 'auto',
    };

    try {
      const { data } = await api.post<DoctorCopilotChatResponse>('/doctor-copilot/chat', requestBody);
      return {
        ...data,
        response: pickResponseText(data) || data.response,
      };
    } catch (error) {
      // DoctorVoiceAssistant must remain usable even if the unified gateway is
      // down or stale in production. The legacy voice agent is the same doctor
      // auth surface and supports the commands this screen depends on.
      const { data } = await api.post<DoctorCopilotChatResponse>('/voice-assistant/agent', {
        text: message,
        history: requestBody.history,
        context: requestBody.context,
      });
      return {
        ...data,
        gateway: data.gateway || 'doctor-copilot',
        path: data.path || 'agent',
        response: pickResponseText(data) || data.response,
      };
    }
  },

  async getBriefing(): Promise<DoctorCopilotBriefingResponse> {
    const { data } = await api.get<DoctorCopilotBriefingResponse>('/voice-assistant/briefing');
    return data;
  },

  async speechToText(formData: FormData): Promise<{ text: string; language?: string }> {
    const { data } = await api.post('/voice-assistant/stt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async health(): Promise<{ success: boolean; service: string }> {
    const { data } = await api.get('/doctor-copilot/health');
    return data;
  },
};

export default doctorCopilotService;
