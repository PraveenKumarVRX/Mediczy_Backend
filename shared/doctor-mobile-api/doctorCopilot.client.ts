/**
 * Doctor Copilot API client for React Native (msh_d_app) and other mobile clients.
 *
 * Usage in msh_d_app:
 *   import { createDoctorCopilotClient } from '@mediczy/doctor-mobile-api';
 *   const copilot = createDoctorCopilotClient({
 *     baseUrl: Config.API_BASE_URL,
 *     getToken: () => AsyncStorage.getItem('doctorToken'),
 *   });
 *   const reply = await copilot.chat({ message: 'Show today appointments', context: { currentScreen: 'dashboard' } });
 */

import type {
  DoctorCopilotBriefingResponse,
  DoctorCopilotChatRequest,
  DoctorCopilotChatResponse,
  DoctorCopilotClientConfig,
  DoctorCopilotSttResponse,
  CopilotHistoryTurn,
} from './types.js';

export type { DoctorCopilotChatRequest, DoctorCopilotChatResponse, DoctorCopilotClientConfig } from './types.js';

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

export function createDoctorCopilotClient(config: DoctorCopilotClientConfig) {
  const base = config.baseUrl.replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 30000;

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await config.getToken();
    if (!token) throw new Error('Doctor auth token missing');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(await authHeaders()),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body?.error || body?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** Unified copilot chat — replaces direct /voice-assistant/agent and /medical-ai/consult for doctors */
    async chat(payload: DoctorCopilotChatRequest): Promise<DoctorCopilotChatResponse> {
      const message = String(payload.message || payload.text || '').trim();
      if (!message) throw new Error('message is required');

      const data = await request<DoctorCopilotChatResponse>('/doctor-copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          history: normalizeHistory(payload.history),
          context: payload.context || {},
          sessionId: payload.sessionId,
          language: payload.language || 'en',
          mode: payload.mode || 'auto',
        }),
      });

      return {
        ...data,
        response: pickResponseText(data) || data.response,
      };
    },

    async getBriefing(): Promise<DoctorCopilotBriefingResponse> {
      return request<DoctorCopilotBriefingResponse>('/voice-assistant/briefing', { method: 'GET' });
    },

    async speechToText(formData: FormData): Promise<DoctorCopilotSttResponse> {
      const token = await config.getToken();
      if (!token) throw new Error('Doctor auth token missing');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${base}/voice-assistant/stt`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `STT HTTP ${res.status}`);
        return body as DoctorCopilotSttResponse;
      } finally {
        clearTimeout(timer);
      }
    },

    async health(): Promise<{ success: boolean; service: string }> {
      return request('/doctor-copilot/health', { method: 'GET' });
    },
  };
}

export default createDoctorCopilotClient;
