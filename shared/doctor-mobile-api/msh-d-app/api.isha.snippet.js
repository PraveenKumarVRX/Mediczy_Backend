/**
 * Drop-in replacement for msh_d_app Utils/api.js Isha / VoiceAssistant module.
 *
 * 1. Copy `shared/doctor-mobile-api/` → `app/api/mediczy/doctor-mobile-api/`
 * 2. Call initIshaCopilot once after login (see MSH_D_APP_ISHA_COPILOT_MIGRATION.md)
 * 3. Replace legacy Isha export with this module
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config'; // or your env module
import {
  initIshaCopilot,
  sendIshaMessage,
  transcribeAudio,
  fetchMorningBriefing,
  parseIshaAction,
  pickDisplayText,
} from '../api/mediczy/doctor-mobile-api/ishaCopilot.service.js';

const API_BASE = (Config.API_BASE_URL || 'https://app.mediqzy.com/api').replace(/\/$/, '');

export function ensureIshaCopilotInitialized() {
  initIshaCopilot({
    baseUrl: API_BASE,
    getToken: () => AsyncStorage.getItem('doctorToken'),
    timeoutMs: 30000,
  });
}

/** @deprecated Use Isha.chat — kept for backward-compatible call sites */
async function legacyAgentShape(payload) {
  const message = String(payload?.text || payload?.message || '').trim();
  const result = await sendIshaMessage({
    message,
    history: payload?.history,
    context: payload?.context,
    sessionId: payload?.sessionId,
    language: payload?.language,
    mode: payload?.mode,
  });
  // Map to shape existing iSHA screen expects from /voice-assistant/agent
  return {
    data: {
      intent: result.intent || (result.path === 'clinical' ? 'medical_query' : result.intent),
      action: result.action ?? null,
      parameters: result.parameters ?? null,
      response: pickDisplayText(result),
      speak: result.speak || pickDisplayText(result),
      data: result.data ?? null,
      requiresConfirmation: Boolean(result.requiresConfirmation),
      traceId: result.traceId,
      path: result.path,
      gateway: result.gateway,
    },
  };
}

export const Isha = {
  /** Primary — unified copilot gateway */
  chat: (payload) => legacyAgentShape(payload),

  /** Alias used by some screens */
  agent: (payload) => legacyAgentShape(payload),

  /** Voice → text */
  stt: (formData) => transcribeAudio(formData),

  /** Morning briefing */
  briefing: () => fetchMorningBriefing(),

  /** Helpers for screens migrating incrementally */
  parseAction: parseIshaAction,
  displayText: pickDisplayText,
};

// Legacy export name some builds use
export const VoiceAssistant = Isha;

export default Isha;
