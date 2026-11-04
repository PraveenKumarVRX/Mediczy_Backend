/**
 * High-level Dr. iSHA copilot service for msh_d_app.
 * Wraps createDoctorCopilotClient with action parsing helpers.
 */

import { createDoctorCopilotClient } from './doctorCopilot.client.js';
import { resolveIshaScreenRoute } from './screenPaths.js';

let singleton = null;

export function initIshaCopilot(config) {
  singleton = createDoctorCopilotClient(config);
  return singleton;
}

export function getIshaCopilot() {
  if (!singleton) {
    throw new Error('Call initIshaCopilot({ baseUrl, getToken }) at app startup first');
  }
  return singleton;
}

/**
 * Send a message to the unified copilot gateway.
 * @param {object} params
 * @param {string} params.message
 * @param {Array} [params.history]
 * @param {object} [params.context] - { currentScreen, currentPatient }
 * @param {string} [params.mode] - auto | agent | clinical
 */
export async function sendIshaMessage({ message, history, context, mode, sessionId, language }) {
  const copilot = getIshaCopilot();
  return copilot.chat({ message, history, context, mode, sessionId, language });
}

export function pickDisplayText(result) {
  return (
    result?.response ||
    result?.speak ||
    result?.primary_response ||
    "I'm not sure how to help with that."
  );
}

/**
 * Convert copilot response into navigation + UI hints for the iSHA screen.
 */
export function parseIshaAction(result) {
  const action = result?.action || null;
  const parameters = result?.parameters || null;
  const requiresConfirmation = Boolean(result?.requiresConfirmation);
  const traceId = result?.traceId || null;
  const path = result?.path || null;

  let navigation = null;

  if (action === 'navigate_to' && parameters?.screen) {
    const routeName = resolveIshaScreenRoute(parameters.screen);
    navigation = routeName
      ? { type: 'navigate', routeName, params: parameters.params || {} }
      : { type: 'unknown_screen', screen: parameters.screen };
  }

  if (action === 'search_patient' && parameters?.query) {
    navigation = {
      type: 'navigate',
      routeName: 'PatientsList',
      params: { search: String(parameters.query) },
    };
  }

  return {
    action,
    parameters,
    requiresConfirmation,
    navigation,
    traceId,
    path,
    data: result?.data ?? null,
    speak: result?.speak || null,
    text: pickDisplayText(result),
  };
}

export async function transcribeAudio(formData) {
  const copilot = getIshaCopilot();
  return copilot.speechToText(formData);
}

export async function fetchMorningBriefing() {
  const copilot = getIshaCopilot();
  return copilot.getBriefing();
}

export const proposeAppointmentChange = change => getIshaCopilot().proposeAppointmentChange(change);
export const confirmAppointmentChange = confirmation => getIshaCopilot().confirmAppointmentChange(confirmation);
export const getClinicalHandoff = appointmentId => getIshaCopilot().getHandoff(appointmentId);
export const decideClinicalHandoff = (appointmentId,status) => getIshaCopilot().decideHandoff(appointmentId,status);
