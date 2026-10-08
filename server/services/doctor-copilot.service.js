/**
 * Unified Doctor Copilot Gateway (AI-PLATFORM-001)
 * Single entry for doctor AI: enriched context + routing to agent or clinical consult.
 */

import crypto from 'crypto';
import { getAiLayerMapSummary } from './ai-layer-map.service.js';

const ACTION_QUERY_RE = /\b(appointment|appointments|schedule|reschedule|cancel|task|tasks|navigate|open|briefing|patient list|today'?s summary|book|follow.?up|remind me|my list|cdss|clinical decision support|knowledge fabric|knowledge base|guideline|protocol|differential|care plan|patient(?:'s)? conditions?)\b/i;
const CLINICAL_QUERY_RE = /\b(diagnos|treatment|dose|dosage|side effects?|contraindic|protocol|symptom|pathophys|differential|ddx|drug|medication|clinical|esi|triage|metformin|aspirin|warfarin)\b/i;

export function buildCopilotSessionId(userId, sessionId) {
  if (sessionId) return sessionId;
  const hmac = crypto.createHmac('sha256', process.env.SESSION_HMAC_SECRET || process.env.JWT_SECRET || 'mediczy-copilot')
    .update(String(userId))
    .digest('hex')
    .slice(0, 16);
  return `copilot_${hmac}`;
}

export function enrichDoctorCopilotContext(user, context = {}) {
  return {
    ...context,
    currentScreen: context.currentScreen || context.screen || 'copilot',
    currentPatient: context.currentPatient || context.patient || null,
    doctorName: user?.firstName || user?.name || 'Doctor',
    doctorId: user?.id || user?.doctorId,
    channel: 'doctor_copilot',
  };
}

export function normalizeCopilotHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history.slice(-15).map((turn) => ({
    role: turn?.role === 'assistant' || turn?.role === 'doctor' ? 'assistant' : 'user',
    content: String(turn?.content || turn?.text || turn?.message || '').trim(),
    text: String(turn?.text || turn?.content || turn?.message || '').trim(),
  })).filter((turn) => turn.content);
}

/**
 * @returns {'agent' | 'clinical' | 'auto'}
 */
export function classifyDoctorCopilotPath(text, mode = 'auto') {
  if (mode === 'agent' || mode === 'clinical') return mode;
  const normalized = String(text || '').trim();
  if (!normalized) return 'agent';
  if (ACTION_QUERY_RE.test(normalized) && !CLINICAL_QUERY_RE.test(normalized)) return 'agent';
  if (CLINICAL_QUERY_RE.test(normalized) && !ACTION_QUERY_RE.test(normalized)) return 'clinical';
  return 'agent';
}

export function createTraceId() {
  return `copilot_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Delegate to an mounted Express router by rewriting req.url temporarily.
 */
export async function delegateToRouter(router, path, req, res, bodyPatch = {}) {
  const saved = { url: req.url, baseUrl: req.baseUrl, body: req.body };
  req.url = path;
  req.baseUrl = '';
  req.body = { ...req.body, ...bodyPatch };

  return new Promise((resolve, reject) => {
    let settled = false;
    const restore = () => {
      req.url = saved.url;
      req.baseUrl = saved.baseUrl;
      req.body = saved.body;
    };
    const finish = (err) => {
      if (settled) return;
      settled = true;
      restore();
      if (err) reject(err);
      else resolve();
    };

    const originalEnd = res.end.bind(res);
    res.end = (...args) => {
      finish();
      return originalEnd(...args);
    };

    router.handle(req, res, (err) => finish(err));
  });
}

export function getCopilotMeta(path) {
  return {
    gateway: 'doctor-copilot',
    platformInitiative: 'AI-PLATFORM-001',
    path,
    layerMap: getAiLayerMapSummary().operatingLayers,
  };
}

export default {
  buildCopilotSessionId,
  enrichDoctorCopilotContext,
  normalizeCopilotHistory,
  classifyDoctorCopilotPath,
  createTraceId,
  delegateToRouter,
  getCopilotMeta,
};
