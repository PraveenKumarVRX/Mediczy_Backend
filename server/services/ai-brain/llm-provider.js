import { managedFetch } from '../../integrations/transport.js';
import { randomUUID } from 'node:crypto';
import { requireAIConsent } from '../medical-chat-contract.js';
import { sibFetch as fetch } from '../sib-client.js';
/**
 * LLM Provider Service — Single Source of Truth for ALL AI
 * ========================================================
 * Centralises every AI capability behind a unified cascade:
 *
 *  Text   → iSHA (primary) → Groq → OpenAI
 *  Vision → iSHA-inc Vision (primary) → Gemini → Groq
 *  STT    → Groq Whisper → OpenAI Whisper
 *  TTS    → ElevenLabs (handled elsewhere)
 *
 * NO other file should instantiate OpenAI / Groq / Anthropic directly.
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from '../../db/pgPool.js';
import semanticCache from './semantic-cache.service.js';
import cognitiveRouter, { TIERS, TIER_PROVIDERS } from './cognitive-router.js';
import { recordTelemetry } from './evaluation-engine.js';
import { sanitizeLlmMessages, redactPhiText } from '../../utils/phi-text-redactor.js';
import gpuScheduler, { slotForRequest } from './gpu-scheduler.service.js';

// GPU scheduling (per-GPU concurrency, priority queue, circuit breaker) is opt-in. While the
// iSHA nodes are healthy and traffic is low the plain cascade is enough; turn this on to
// bound concurrent load on the 3090/3060 and fail fast when a node is down.
const GPU_SCHEDULER_ENABLED = String(process.env.AI_GPU_SCHEDULER_ENABLED || '').toLowerCase() === 'true';

function sanitizeMessagesForLlm(messages) {
  return sanitizeLlmMessages(messages);
}

// ─── Provider Clients (lazy-init) ───────────────────────────

const _clients = {};
let _providerEnvCache = null;

function normalizeProviderUrl(value, fallback) {
  let url = String(value || fallback || '').trim().replace(/\/$/, '');
  if (url.includes('insha-inc.com')) {
    console.warn('[LLM] Correcting provider URL typo insha-inc.com -> isha-inc.com');
    url = url.replace(/insha-inc\.com/g, 'isha-inc.com');
  }
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function getProviderEnv(key) {
  if (process.env[key]) return process.env[key];
  if (!_providerEnvCache) {
    _providerEnvCache = {};
    const candidates = [
      path.resolve(process.cwd(), '../ai-engine/doctor_bot/.env'),
      path.resolve(process.cwd(), 'ai-engine/doctor_bot/.env'),
      '/home/ubuntu/Mediczy/ai-engine/doctor_bot/.env',
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const envKey = trimmed.slice(0, idx).trim();
        const raw = trimmed.slice(idx + 1).trim();
        _providerEnvCache[envKey] = raw.replace(/^(['"])(.*)\1$/, '$2');
      }
      break;
    }
  }
  return _providerEnvCache[key];
}

function getProviderIntEnv(keys, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const value = Number(getProviderEnv(key));
    if (Number.isFinite(value) && value > 0) {
      return Math.min(Math.max(value, min), max);
    }
  }
  return fallback;
}

/**
 * Direct fetch for iSHA — uses JWT auto-login (same pattern as SIB retrieval_llm.py).
 * Credentials: ISHA_AUTH_USERNAME / ISHA_AUTH_PASSWORD.
 * Token is cached in-memory and auto-refreshed 5 min before expiry.
 */
let _ishaToken = null;
let _ishaTokenExp = 0;

async function getIshaToken() {
  const now = Date.now() / 1000;
  if (_ishaToken && now < _ishaTokenExp - 300) return _ishaToken;

  const baseURL = getProviderEnv('ISHA_AI_URL');
  const username = getProviderEnv('ISHA_AUTH_USERNAME');
  const password = getProviderEnv('ISHA_AUTH_PASSWORD');

  if (!baseURL || !username || !password) {
    throw new Error('iSHA AI credentials are not fully configured');
  }

  const res = await fetch(`${baseURL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`iSHA login failed: ${res.status}`);
  const { access_token } = await res.json();

  // Decode JWT expiry without a library
  try {
    const payload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64').toString());
    _ishaTokenExp = payload.exp || (now + 3600);
  } catch {
    _ishaTokenExp = now + 3600;
  }
  _ishaToken = access_token;
  console.log('[LLM] iSHA token refreshed');
  return _ishaToken;
}

// isha-inc.com uses Cloudflare which blocks the OpenAI SDK User-Agent — use fetch directly.
async function callIshaInc(params) {
  if (cbCheck(_ishaIncOpenUntil)) throw new Error('isha-inc circuit open');

  const baseURL = normalizeProviderUrl(getProviderEnv('ISHA_INC_URL'), 'https://isha-inc.com') + '/v1/chat/completions';
  const apiKey  = getProviderEnv('ISHA_INC_API_KEY');
  if (!apiKey) throw new Error('ISHA_INC_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(baseURL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent':    'Mozilla/5.0 (compatible; Mediczy/1.0)',
        'Accept':        'application/json',
      },
      body:   JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if ([522, 523, 524, 530].includes(res.status)) {
        _ishaIncOpenUntil = Date.now() + 5 * 60_000;
        _ishaIncFailures = 0;
        console.warn(`[LLM] isha-inc circuit opened for 5 min due to Cloudflare/origin HTTP ${res.status}`);
      }
      throw new Error(`isha-inc ${res.status}: ${body.substring(0, 200)}`);
    }
    const data = await res.json();
    _ishaIncFailures = 0;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    cbFail(() => _ishaIncFailures, v => { _ishaIncFailures = v; }, () => _ishaIncOpenUntil, v => { _ishaIncOpenUntil = v; }, 'isha-inc');
    if (err.name === 'AbortError') throw new Error('isha-inc request timed out (8s)');
    throw err;
  }
}

// Sarvam AI — OpenAI-compatible chat completions (Indic / multilingual). Direct fetch
// (no Cloudflare block). Same contract as callIshaInc: returns the raw OpenAI-shaped JSON.
async function callSarvam(params) {
  if (cbCheck(_sarvamOpenUntil)) throw new Error('sarvam circuit open');

  const baseURL = normalizeProviderUrl(getProviderEnv('SARVAM_URL'), 'https://api.sarvam.ai') + '/v1/chat/completions';
  const apiKey  = getProviderEnv('SARVAM_API_KEY');
  if (!apiKey) throw new Error('SARVAM_API_KEY not configured');

  const timeoutMs  = getProviderIntEnv(['SARVAM_TIMEOUT_MS'], 20_000, { min: 2_000, max: 60_000 });
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(baseURL, {
      method:  'POST',
      headers: {
        'Content-Type':          'application/json',
        'Accept':                'application/json',
        // Sarvam's OpenAI-compatible endpoint accepts a Bearer token; its native
        // header is api-subscription-key. Send both so auth works either way.
        'Authorization':         `Bearer ${apiKey}`,
        'api-subscription-key':  apiKey,
      },
      body:   JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`sarvam ${res.status}: ${body.substring(0, 200)}`);
    }
    const data = await res.json();
    _sarvamFailures = 0;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    cbFail(() => _sarvamFailures, v => { _sarvamFailures = v; }, () => _sarvamOpenUntil, v => { _sarvamOpenUntil = v; }, 'sarvam');
    if (err.name === 'AbortError') throw new Error(`sarvam request timed out (${Math.round(timeoutMs / 1000)}s)`);
    throw err;
  }
}

async function callIsha(params) {
  if (cbCheck(_ishaOpenUntil)) throw new Error('isha circuit open');

  const baseURL = normalizeProviderUrl(getProviderEnv('ISHA_AI_URL'), 'https://ai.isha.buzz');
  if (!baseURL) throw new Error('ISHA_AI_URL not configured');
  const url = `${baseURL}/v1/chat/completions`;
  const ishaTimeoutMs = getProviderIntEnv(['ISHA_LLM_TIMEOUT', 'ISHA_TIMEOUT_MS'], 30_000, {
    min: 5_000,
    max: 120_000,
  });
  const controller = new AbortController();

  const token = await getIshaToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Sanitise ₹ → Rs. and guard against context overflow (bi-medix2 llama_cpp has ~6k usable tokens)
  const ISHA_MAX_CHARS = 12000; // ~3000 tokens; leave headroom for completion
  const messages = (params.messages || []).map(m => ({
    ...m,
    content: typeof m.content === 'string' ? m.content.replace(/₹/g, 'Rs.') : m.content,
  }));

  const totalChars = messages.reduce((s, m) => s + (m.content?.length || 0), 0);
  if (totalChars > ISHA_MAX_CHARS) {
    // Trim the system message (first message) from the end to fit budget
    const sysMsgIdx = messages.findIndex(m => m.role === 'system');
    if (sysMsgIdx !== -1) {
      const budget = ISHA_MAX_CHARS - (totalChars - messages[sysMsgIdx].content.length);
      if (budget > 500) {
        messages[sysMsgIdx] = { ...messages[sysMsgIdx], content: messages[sysMsgIdx].content.slice(0, budget) };
      } else {
        throw new Error(`iSHA prompt too large (${totalChars} chars) — skipping to next provider`);
      }
    }
  }

  // bi-medix2 is a completion model — drop function-calling fields it doesn't
  // understand (tools, tool_choice, response_format).
  const { tools: _t, tool_choice: _tc, response_format: _rf, ...rest } = params;
  const sanitisedParams = { ...rest, messages };

  const timeoutId = setTimeout(() => controller.abort(), ishaTimeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(sanitisedParams),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // If 401, clear cached token so next call re-authenticates
      if (res.status === 401) { _ishaToken = null; _ishaTokenExp = 0; }
      const body = await res.text().catch(() => '');
      throw new Error(`iSHA ${res.status}: ${body.substring(0, 200)}`);
    }
    const data = await res.json();
    _ishaFailures = 0;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    cbFail(() => _ishaFailures, v => { _ishaFailures = v; }, () => _ishaOpenUntil, v => { _ishaOpenUntil = v; }, 'isha');
    if (err.name === 'AbortError') throw new Error(`iSHA request timed out (${Math.round(ishaTimeoutMs / 1000)}s)`);
    throw err;
  }
}

function getGroqClient() {
  if (!_clients.groq) {
    const apiKey = getProviderEnv('GROQ_API_KEY');
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY not configured');
    }
    _clients.groq = new Groq({ apiKey, fetch: managedFetch, maxRetries: 0 });
  }
  return _clients.groq;
}

function getOpenAIClient() {
  if (!_clients.openai) {
    const apiKey = getProviderEnv('OPENAI_API_KEY');
    if (!apiKey || apiKey.startsWith('sk-proj-test')) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    _clients.openai = new OpenAI({ apiKey, fetch: managedFetch, maxRetries: 0 });
  }
  return _clients.openai;
}

function getIshaIncClient() {
  if (!_clients.ishaInc) {
    const apiKey = getProviderEnv('ISHA_INC_API_KEY');
    if (!apiKey) throw new Error('ISHA_INC_API_KEY not configured');
    const baseURL = normalizeProviderUrl(getProviderEnv('ISHA_INC_URL'), 'https://isha-inc.com') + '/v1';
    _clients.ishaInc = new OpenAI({ baseURL, apiKey, fetch: managedFetch, maxRetries: 0 });
  }
  return _clients.ishaInc;
}

// GPU workstation (RTX 3090, reached over the WireGuard tunnel, 10.99.0.4) —
// runs llama.cpp's own `llama-server` binary, which serves an OpenAI-
// compatible /v1/chat/completions API. This is NOT Ollama's protocol —
// do not route these through callLocalSLM(). Two models are already running
// there (confirmed live, not something this integration installs):
// BiMediX2-8B on :8080 and MedGemma-27B-IQ3 on :8083. Both are candidates
// for the report-drafting evaluation in imaging-report-drafter.service.js —
// neither is enabled here until that evaluation and a governance approval
// have both happened.
function getWorkstationBimedixClient() {
  if (!_clients.workstationBimedix) {
    const baseURL = normalizeProviderUrl(getProviderEnv('WORKSTATION_BIMEDIX_URL'), 'http://10.99.0.4:8080') + '/v1';
    const apiKey = getProviderEnv('WORKSTATION_LLM_API_KEY') || 'dev-key';
    _clients.workstationBimedix = new OpenAI({ baseURL, apiKey, fetch: managedFetch, maxRetries: 0 });
  }
  return _clients.workstationBimedix;
}

function getWorkstationMedgemmaClient() {
  if (!_clients.workstationMedgemma) {
    const baseURL = normalizeProviderUrl(getProviderEnv('WORKSTATION_MEDGEMMA_URL'), 'http://10.99.0.4:8083') + '/v1';
    const apiKey = getProviderEnv('WORKSTATION_LLM_API_KEY') || 'dev-key';
    _clients.workstationMedgemma = new OpenAI({ baseURL, apiKey, fetch: managedFetch, maxRetries: 0 });
  }
  return _clients.workstationMedgemma;
}

// Strings that indicate any provider is returning a stub (no real inference backend).
const STUB_RESPONSE_MARKERS = [
  'Integrate vLLM or llama.cpp backend',
  'enable real inference with BiMediX2',
];

// In-memory circuit breakers for iSHA and isha-inc (same pattern as SIB)
let _ishaFailures = 0, _ishaOpenUntil = 0;
let _ishaIncFailures = 0, _ishaIncOpenUntil = 0;
let _sarvamFailures = 0, _sarvamOpenUntil = 0;
// Keyed by provider.name, NOT a shared scalar — callLocalSLM now serves more
// than one Ollama-protocol endpoint (this server's cloud qwen2:1.5b AND a
// workstation GGUF model over the WireGuard tunnel). A failure on one must
// never open the circuit for the other.
const _slmFailures = new Map();
const _slmOpenUntil = new Map();

function cbCheck(openUntil) { return Date.now() < openUntil; }
function cbFail(getF, setF, getO, setO, name) {
  const f = getF() + 1;
  setF(f);
  if (f >= 3) { setO(Date.now() + 5 * 60_000); setF(0); console.warn(`[LLM] ${name} circuit opened for 5 min`); }
}

/**
 * Cheap, local-only check (no network call) for whether a provider's circuit
 * breaker is currently tripped. Callers that would otherwise force a single
 * provider (e.g. forceProvider: 'sib' for a fast intent-classification pass)
 * can use this to skip straight to the full cascade instead of waiting out
 * a guaranteed-failing call.
 */
export function isProviderCircuitOpen(name) {
  if (name === 'isha') return cbCheck(_ishaOpenUntil);
  if (name === 'sib') return Date.now() < _sibOpenUntil;
  return false;
}

/**
 * Call a local Ollama-protocol endpoint (/api/chat). Used both by the
 * cloud-server's own last-resort qwen2:1.5b (provider 'local-slm') and any
 * workstation GGUF model (provider 'gguf-workstation') — each provider's own
 * baseUrl/model take priority over the generic env-var fallbacks, so the two
 * never collide on a single global target.
 */
async function callLocalSLM(provider, params) {
  const key = provider.name || 'local-slm';
  if (cbCheck(_slmOpenUntil.get(key) || 0)) throw new Error(`${key} circuit open`);

  const baseUrl = provider.baseUrl || getProviderEnv('LOCAL_LLM_URL') || 'http://localhost:11434';
  const model   = provider.model || getProviderEnv('OLLAMA_MODEL') || 'qwen2:1.5b';
  const url     = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: params.messages.map(m => ({ role: m.role, content: String(m.content || '') })),
        stream: false,
        options: { num_predict: Math.min(params.max_tokens || 512, 1024), temperature: params.temperature || 0.5 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${key} ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data    = await res.json();
    const content = data.message?.content || '';
    if (!content.trim()) throw new Error(`${key} (Ollama) returned empty response`);

    _slmFailures.set(key, 0);
    return {
      id: `slm-${Date.now()}`,
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: data.done ? 'stop' : 'length' }],
      model: data.model || model,
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    cbFail(
      () => _slmFailures.get(key) || 0,
      v => _slmFailures.set(key, v),
      () => _slmOpenUntil.get(key) || 0,
      v => _slmOpenUntil.set(key, v),
      key,
    );
    if (err.name === 'AbortError') throw new Error(`${key} request timed out (30s)`);
    throw err;
  }
}

// In-memory circuit breaker for SIB. Root cause of slow/timing-out calls is NOT
// local Qwen/CPU inference (traced 2026-08-23: SIB's /chat does pgvector KB-RAG
// retrieval against ai_document_chunks, then proxies to the same remote iSHA GPU
// nodes (ai.isha.buzz / isha-inc.com) this app's own 'isha' provider calls
// directly — the extra RAG + proxy hop is what pushes it past this timeout, not
// a slow local model. Qwen's only role in the SIB codebase (a 2.5-3B planner)
// was already replaced by a regex classifier (see ai-engine/doctor_bot ITEM-24).
let _sibFailures = 0;
let _sibOpenUntil = 0;

async function callSib(params) {
  if (Date.now() < _sibOpenUntil) throw new Error('sib circuit open');

  const baseUrl = getProviderEnv('SIB_URL') || 'http://localhost:8001';
  const url = `${baseUrl.replace(/\/$/, '')}/chat`;
  // Default 8s matches the long-standing working behavior; SIB_TIMEOUT_MS lets ops
  // tune it without code changes. Do NOT shorten blindly — SIB proxies to iSHA
  // (bi-medix2) and clinical inference can legitimately take several seconds.
  const sibTimeoutMs = Number(getProviderEnv('SIB_TIMEOUT_MS')) || 8_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), sibTimeoutMs);

  const messages = Array.isArray(params.messages) ? params.messages : [];
  const systemParts = messages
    .filter(m => m?.role === 'system' && typeof m?.content === 'string')
    .map(m => m.content.trim())
    .filter(Boolean);
  const conversationMessages = messages
    .filter(m => m?.role !== 'system' && typeof m?.content === 'string' && m.content.trim());

  const history = conversationMessages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content.trim(),
  }));

  const latestUser = [...conversationMessages].reverse().find(m => m.role === 'user');
  const labeledTurns = conversationMessages.map(m => {
    const label = m.role === 'assistant' ? 'Assistant' : 'User';
    return `${label}: ${m.content.trim()}`;
  });

  const messageBody = labeledTurns.length
    ? labeledTurns.join('\n')
    : (latestUser?.content?.trim() || '');

  const message = systemParts.length
    ? `${systemParts.join('\n\n')}\n\n---\nConversation:\n${messageBody}`
    : messageBody;

  if (!message.trim()) throw new Error('SIB request has no message content');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: history.slice(-15),
        patient_id: `call_${randomUUID()}`,
        server_managed_history: true,
        user_id: params.patientId ? (params.userId || params.patientId) : undefined,
        // Only genuine patient-facing clinical calls (a real patientId supplied
        // by the caller) are subject to the GDPR/DPDP AI-consent gate on the SIB
        // side — generic/non-clinical calls (admin & team copilot, HR text
        // generation, etc.) never have a patient in the loop at all and were
        // being blocked by the same gate, which was the actual reported bug.
        is_patient_specific: Boolean(params.patientId),
        // SIB routes deep -> node1 (3090) first, standard/reflex -> node2 (3060) first.
        cognitive_tier: params.cognitive_tier || null,
        context: {
          source: 'llm-provider',
          model_hint: params.model,
          max_tokens: params.max_tokens,
          temperature: params.temperature,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw Object.assign(new Error(`SIB request denied or unavailable (${res.status})`), { statusCode: res.status });
    }

    const data = await res.json();
    // SIB's LangGraph agent returns the answer in "chat_answer"; older/direct SIB
    // responses use "response", "answer", or "content" — check all variants.
    const content = (data.chat_answer || data.response || data.answer || data.content || '').toString();
    if (!content.trim()) throw new Error('sib returned empty response');

    _sibFailures = 0; // reset on success
    return {
      id: data.id || `sib-${Date.now()}`,
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      }],
      model: data.model || params.model || 'sib',
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if ([401,403].includes(err.statusCode)) throw err;
    _sibFailures++;
    if (_sibFailures >= 3) {
      _sibOpenUntil = Date.now() + 5 * 60_000; // open for 5 min
      _sibFailures = 0;
      console.warn('[LLM] SIB circuit opened — skipping for 5 min');
    }
    if (err.name === 'AbortError') throw new Error(`sib request timed out (${Math.round(sibTimeoutMs / 1000)}s)`);
    throw err;
  }
}

// ─── Provider Definitions ───────────────────────────────────

/**
 * iSHA.buzz (bi-medix2 clinical LLM) is a real fallback — not just a diagnostics
 * endpoint. It is enabled in the cascade whenever its credentials are configured,
 * so the app reaches it directly when the SIB gateway is down (SIB is supposed to
 * proxy to iSHA, so without this the model is unreachable if the gateway fails).
 */
function isIshaConfigured() {
  return Boolean(
    getProviderEnv('ISHA_AI_URL') &&
    getProviderEnv('ISHA_AUTH_USERNAME') &&
    getProviderEnv('ISHA_AUTH_PASSWORD')
  );
}
const ISHA_DIRECT_ENABLED = isIshaConfigured();
const MEDIQZY_AI_PRIMARY_PROVIDER = String(getProviderEnv('MEDIQZY_AI_PRIMARY_PROVIDER') || 'isha').toLowerCase();
const ISHA_LLM_AGENT_TYPE = getProviderEnv('ISHA_LLM_AGENT_TYPE') || getProviderEnv('ISHA_AGENT_TYPE') || 'Claims';
const ISHA_PRIMARY_ENABLED = MEDIQZY_AI_PRIMARY_PROVIDER === 'isha' && ISHA_DIRECT_ENABLED;
// ai.isha.buzz's domain registration expired (2026-10-29, confirmed NXDOMAIN
// on two independent public resolvers), taking down both the direct iSHA
// provider and sib (which proxies every request to that same host). Defaults
// to "down" so production traffic maps straight to groq without wasting time
// on a guaranteed-failing provider; flip ISHA_INFRA_DOWN=false (no deploy
// needed, just the env var) once the domain is renewed and iSHA is reachable
// again — no other code change required.
const ISHA_INFRA_DOWN = String(getProviderEnv('ISHA_INFRA_DOWN') || 'true').toLowerCase() !== 'false';
const GROQ_CHAT_MODEL = getProviderEnv('GROQ_MODEL') || getProviderEnv('GROQ_CHAT_MODEL') || 'openai/gpt-oss-20b';
// Sarvam AI — opt-in Indic/multilingual fallback. Inert unless SARVAM_ENABLED=true AND a key is set.
const SARVAM_MODEL = getProviderEnv('SARVAM_MODEL') || 'sarvam-105b-conversations';
const SARVAM_ENABLED = String(getProviderEnv('SARVAM_ENABLED') || '').toLowerCase() === 'true' && Boolean(getProviderEnv('SARVAM_API_KEY'));

const PROVIDERS = [
  {
    name: 'sib',
    label: 'SIB FastAPI (Primary AI Gateway)',
    model: getProviderEnv('SIB_MODEL') || 'sib-router',
    getClient: () => ({ available: true }),
    useSib: true,
    priority: ISHA_PRIMARY_ENABLED ? 10 : 0,
    // sib's only backend is iSHA — see ISHA_INFRA_DOWN above.
    disabled: ISHA_INFRA_DOWN,
  },
  {
    name: 'groq',
    label: ISHA_INFRA_DOWN
      ? 'Groq chat fallback (temporary primary — iSHA domain expired, see sib/isha)'
      : 'Groq chat fallback',
    model: GROQ_CHAT_MODEL,
    getClient: getGroqClient,
    priority: ISHA_INFRA_DOWN ? 0 : (ISHA_PRIMARY_ENABLED ? 20 : 1),
  },
  {
    name: 'sarvam',
    label: 'Sarvam AI (Indic/multilingual, OpenAI-compatible fallback)',
    model: SARVAM_MODEL,
    getClient: () => ({ available: true }),
    useFetchSarvam: true,
    // Tertiary fallback: after SIB and Groq. Inert unless SARVAM_ENABLED + key set.
    priority: 30,
    disabled: !SARVAM_ENABLED,
  },
  {
    name: 'openai',
    label: 'OpenAI direct (disabled; Groq is the only non-SIB fallback)',
    model: 'gpt-3.5-turbo',
    getClient: getOpenAIClient,
    priority: 94,
    disabled: true,
  },
  {
    name: 'isha',
    label: 'iSHA.buzz direct (bi-medix2 clinical LLM — fallback when SIB gateway is down)',
    model: getProviderEnv('ISHA_LLM_MODEL') || 'bi-medix2',
    getClient: () => ({ available: true }),
    useFetch: true,
    priority: ISHA_PRIMARY_ENABLED ? 0 : 2,
    // isIshaConfigured() still reports credentials present even though the
    // domain itself is dead, so ISHA_INFRA_DOWN (see above) is the override
    // that actually keeps this off until the domain is renewed.
    disabled: ISHA_INFRA_DOWN || !ISHA_DIRECT_ENABLED,
    extraBody: { agent_type: ISHA_LLM_AGENT_TYPE },
  },
  {
    name: 'isha-reflex',
    label: 'iSHA.buzz reflex direct (diagnostics only; app traffic goes through SIB)',
    model: getProviderEnv('ISHA_REFLEX_MODEL') || 'bi-medix2',
    getClient: () => ({ available: true }),
    useFetch: true,
    priority: 91,
    disabled: true,
    extraBody: { agent_type: ISHA_LLM_AGENT_TYPE },
  },
  {
    name: 'isha-inc',
    label: 'isha-inc.com direct (diagnostics only; app traffic goes through SIB)',
    // Was 'smart-orchestrator' — removed from the host, confirmed 404
    // "model_not_found" with the live server reporting only qwen3-8b-q5-k-m
    // available. Same class of stale-model-ID bug as the earlier Groq fix.
    model: getProviderEnv('ISHA_INC_MODEL') || 'qwen3-8b-q5-k-m',
    getClient: getIshaIncClient,
    useFetchIshaInc: true,
    priority: 92,
    disabled: true,
  },
  {
    name: 'local-slm',
    // Was mislabeled "Indic-Gemma-2B" — that model belongs to a different,
    // unrelated service (offline_scribe/llm/indic_llm_engine.py). This
    // provider actually talks to Ollama on THIS cloud server, confirmed
    // running (systemd ollama.service, qwen2:1.5b pulled, localhost:11434).
    label: 'Local Ollama qwen2:1.5b (cloud-server CPU, last-resort fallback)',
    model: getProviderEnv('OLLAMA_MODEL') || 'qwen2:1.5b',
    useFetch: false,
    useLocalSLM: true,
    baseUrl: getProviderEnv('LOCAL_LLM_URL') || 'http://localhost:11434',
    priority: 95,
    disabled: true,
  },
  {
    name: 'workstation-bimedix2-8b',
    label: 'BiMediX2-8B on GPU workstation (llama.cpp, radiology report drafting — evaluation, not production)',
    // Already running (confirmed live: llama-server -m BiMediX2-8B-hf.i1-Q6_K.gguf
    // -c 16384 -np 8 -ngl 99 --port 8080) — this integration does not install
    // or fine-tune it, only wires Mediczy to call it. A distinct serving
    // location from the existing isha-buzz-bimedix2 model card (that one is
    // the cloud ai.isha.buzz copy) — carded separately since it's a
    // different environment/quant, not assumed identical behavior.
    model: getProviderEnv('WORKSTATION_BIMEDIX_MODEL') || 'bimedix2-8b',
    getClient: getWorkstationBimedixClient,
    priority: 96,
    // Stays disabled permanently in the GENERAL cascade — never let drug-
    // interaction/triage/admin-copilot calls silently hit an unvalidated
    // model over a WireGuard tunnel. Real usage is gated separately, at the
    // imaging-report-drafter.service.js call site, behind
    // IMAGING_GGUF_LLM_CLINICAL_APPROVED — see that file.
    disabled: true,
  },
  {
    name: 'workstation-medgemma-27b',
    label: 'MedGemma-27B on GPU workstation (llama.cpp, radiology report drafting — evaluation, not production)',
    // Already running (confirmed live: llama-server -m google_medgemma-27b-it-IQ3_M.gguf
    // -c 256 -np 2 -ngl 50 --port 8083). Note the small -c 256 context on the
    // live process — too small for a full structured-findings-to-report
    // prompt as currently launched; the evaluation step must either request
    // a larger context on that server or this will need its own launch
    // profile before it's usable for report drafting specifically.
    model: getProviderEnv('WORKSTATION_MEDGEMMA_MODEL') || 'medgemma-27b',
    getClient: getWorkstationMedgemmaClient,
    priority: 97,
    disabled: true,
  },
];

const DIRECT_AI_PROVIDER_ALIASES = new Set(['isha', 'isha-reflex', 'isha-inc']);
const ALLOW_DIRECT_AI_PROVIDERS = String(process.env.ALLOW_DIRECT_AI_PROVIDERS || '').toLowerCase() === 'true';

// ─── Model config cache (60s TTL — avoids DB hit on every request) ───────────
let _cfgCache = null;
let _cfgExpiry = 0;

async function getModelConfig(name = 'isha-primary') {
  const now = Date.now();
  if (_cfgCache !== undefined && now < _cfgExpiry) return _cfgCache;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_model_configs WHERE name = $1 AND is_active = true',
      [name]
    );
    _cfgCache  = rows[0] || null;
    _cfgExpiry = now + 60_000;
    return _cfgCache;
  } catch {
    return null;
  }
}

/**
 * Call a single provider's chat completion API.
 */
async function callProvider(provider, params) {
  // patientId/userId are consumed by name (callSib) — never spread into a
  // third-party SDK request body. Groq/OpenAI reject unknown top-level
  // properties outright (verified: Groq 400s with "property 'patientId' is
  // unsupported"), so they must be stripped before reaching those SDKs.
  const { patientId, userId, cognitive_tier, ...sdkParams } = params;

  // Cap max_tokens for models with lower context limits
  let cappedParams = sdkParams;
  if (provider.name === 'openai' && sdkParams.max_tokens > 4096) {
    cappedParams = { ...sdkParams, max_tokens: 4096 };
  }

  // Merge any provider-specific extra body params (e.g. agent_type for iSHA)
  const finalParams = provider.extraBody
    ? { ...cappedParams, ...provider.extraBody }
    : cappedParams;

  // Local offline SLM (Indic-Gemma via offline scribe FastAPI)
  if (provider.useLocalSLM) {
    return callLocalSLM(provider, finalParams);
  }

  // SIB FastAPI router (preferred primary path) — needs patientId/userId to
  // scope the GDPR/DPDP consent gate, so pass the original params, not the
  // SDK-safe stripped copy.
  if (provider.useSib) {
    return callSib({ ...finalParams, patientId, userId, cognitive_tier });
  }

  // isha-inc.com: direct fetch to bypass Cloudflare OpenAI-SDK block
  if (provider.useFetchIshaInc) {
    return callIshaInc(finalParams);
  }

  // Sarvam AI: direct fetch, OpenAI-compatible (Indic / multilingual)
  if (provider.useFetchSarvam) {
    return callSarvam(finalParams);
  }

  // iSHA.buzz: direct fetch with JWT auth
  if (provider.useFetch) {
    return callIsha(finalParams);
  }

  // Groq / OpenAI use their respective SDKs
  const client = provider.getClient();
  return client.chat.completions.create(finalParams);
}

const CLINICAL_CACHE_KEYWORDS = /\b(symptom|symptoms|diagnos|triage|emergency|pain|fever|cough|blood pressure|bp|diabetes|hypertension|medication|medicine|drug|dose|dosage|prescription|allergy|lab report|test result|patient|clinical|treatment|therapy|risk score|chest pain|stroke|pregnan|infection|cancer|asthma|cardiac|renal|liver)\b/i;

function looksClinicalForCache(text = '') {
  return CLINICAL_CACHE_KEYWORDS.test(String(text || ''));
}

function buildScopedCacheText(userMessage, cacheScope) {
  const scope = String(cacheScope || '').trim();
  return scope ? `${scope}\n${userMessage}` : userMessage;
}

// ── Transient-error retry (per provider, before failover) ───────────────────
const LLM_RETRY_ATTEMPTS = Math.max(1, Math.min(parseInt(process.env.LLM_RETRY_ATTEMPTS || '2', 10) || 2, 4));
const LLM_RETRY_BASE_MS = Math.max(100, parseInt(process.env.LLM_RETRY_BASE_MS || '400', 10) || 400);

function isTransientLLMError(err) {
  const code = String(err?.code || err?.cause?.code || '').toUpperCase();
  const status = Number(err?.status || err?.statusCode || err?.response?.status || 0);
  const msg = String(err?.message || '').toLowerCase();
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ESOCKET',
       'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) return true;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return (
    msg.includes('timed out') || msg.includes('timeout') ||
    msg.includes('rate limit') || msg.includes('429') ||
    msg.includes('temporarily') || msg.includes('overloaded')
  );
}

/**
 * Call a provider with a short retry on TRANSIENT failures before the cascade
 * fails over to the next provider. Avoids burning a permanently-down provider's
 * slot on a blip, and avoids retrying deterministic errors (auth, bad request).
 */
async function callProviderWithRetry(provider, params) {
  let lastErr;
  for (let attempt = 1; attempt <= LLM_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await callProvider(provider, params);
    } catch (err) {
      lastErr = err;
      if (attempt < LLM_RETRY_ATTEMPTS && isTransientLLMError(err)) {
        const delay = LLM_RETRY_BASE_MS * attempt;
        console.warn(`[LLM] ${provider.label} transient error (attempt ${attempt}/${LLM_RETRY_ATTEMPTS}): ${err.message}; retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Call LLM with cascading fallback across 3 providers.
 *
 * @param {Object} options
 * @param {Array}  options.messages    - OpenAI-format messages [{role, content}]
 * @param {Array}  [options.tools]     - Tool definitions for function calling
 * @param {string} [options.toolChoice] - 'auto' | 'none' | 'required'
 * @param {string} [options.model]     - Override model (skips cascade, uses first provider)
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {number} [options.conversationId] - For logging
 * @param {string} [options.forceProvider] - Force a specific provider: 'isha' | 'groq' | 'openai'
 * @returns {Object} { content, toolCalls, usage, model, provider, latencyMs, cascade }
 */
async function chat({
  messages,
  tools = null,
  toolChoice = 'auto',
  model = null,
  temperature = null,
  maxTokens = null,
  conversationId = null,
  responseFormat = null,
  forceProvider = null,
  preferProvider = null,   // move this provider to the FRONT of the cascade but keep the rest as
                           // fallback (unlike forceProvider, which is that provider only). Works with tools.
  skipCache = false,       // set true for agentic/tool-calling or clinical flows
  cacheScope = null,       // tenant/patient/session scope required before caching clinical text
  cognitiveTier = null,    // 'reflex' | 'standard' | 'deep' — from CognitiveRouter.classify()
  cognitiveDecisionId = null,  // for outcome recording
  patientId = null,        // real patient identifier — only set by genuinely patient-facing callers.
                            // Forwarded to SIB as is_patient_specific to scope the GDPR/DPDP consent
                            // gate to actual clinical calls; never set this for generic/HR/admin use.
  userId = null,
}) {
  if (patientId) await requireAIConsent(pool, userId || patientId);
  messages = sanitizeMessagesForLlm(messages);
  const dbConfig = await getModelConfig();

  // Tier-aware defaults — smaller/faster for simple queries
  const TIER_DEFAULTS = {
    reflex:   { temp: 0.1, maxTok: 256  },
    standard: { temp: 0.3, maxTok: 1024 },
    deep:     { temp: 0.5, maxTok: 4096 },
  };
  const tierDef = TIER_DEFAULTS[cognitiveTier] || TIER_DEFAULTS.standard;
  const temp   = temperature ?? dbConfig?.temperature ?? tierDef.temp;
  const maxTok = maxTokens   || dbConfig?.max_tokens  || tierDef.maxTok;

  // ── Semantic cache check (before any LLM call) ──────────────────────────
  // Only cache simple user→assistant exchanges with no tools
  const userMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content;
  const clinicalMessage = typeof userMessage === 'string' && looksClinicalForCache(userMessage);
  const scopedCacheText = typeof userMessage === 'string' ? buildScopedCacheText(userMessage, cacheScope) : null;
  const isCacheable = !patientId && !skipCache
    && !forceProvider
    && !tools
    && !responseFormat
    && userMessage
    && typeof userMessage === 'string'
    && (!clinicalMessage || Boolean(cacheScope));

  if (isCacheable) {
    const hit = await semanticCache.lookup(scopedCacheText);
    if (hit) {
      return {
        content: hit.response,
        toolCalls: [],
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: hit.model || 'cached',
        provider: `cache:${hit.cacheHit}`,
        latencyMs: 0,
        cascade: [{ provider: 'semantic-cache', status: 'hit', similarity: hit.similarity }],
      };
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Determine which providers to try
  let providersToTry;
  if (forceProvider) {
    const requestedProvider = (!ALLOW_DIRECT_AI_PROVIDERS && DIRECT_AI_PROVIDER_ALIASES.has(forceProvider))
      ? 'sib'
      : forceProvider;
    if (requestedProvider !== forceProvider) {
      console.log('[LLM] Routing forceProvider=' + forceProvider + ' through SIB gateway');
    }
    let forced = PROVIDERS.find(p => p.name === requestedProvider);
    if (!forced) throw new Error('Unknown provider: ' + forceProvider);
    if (
      ISHA_PRIMARY_ENABLED &&
      requestedProvider === 'sib' &&
      !['false', '0', 'no'].includes(String(getProviderEnv('ROUTE_FORCED_SIB_TO_ISHA') || 'true').toLowerCase())
    ) {
      const ishaProvider = PROVIDERS.find(p => p.name === 'isha' && !p.disabled);
      if (ishaProvider) {
        console.log('[LLM] Routing forceProvider=sib through iSHA.buzz primary provider');
        forced = ishaProvider;
      }
    }
    if (forced.disabled && !ALLOW_DIRECT_AI_PROVIDERS) {
      throw new Error('Provider ' + forceProvider + ' is disabled for app traffic');
    }
    providersToTry = [forced];
  } else if (preferProvider) {
    // Preferred-first with full fallback: try preferProvider, then the rest of the
    // enabled cascade in priority order. Unlike forceProvider this never leaves the
    // caller with no fallback, and it is compatible with tool-calling.
    const pref = PROVIDERS.find(p => p.name === preferProvider && !p.disabled);
    const rest = PROVIDERS.filter(p => p.name !== preferProvider && !p.disabled).sort((a, b) => a.priority - b.priority);
    providersToTry = pref ? [pref, ...rest] : rest;
  } else if (cognitiveTier && !tools) {
    // ── HAIS: Tier-first routing ─────────────────────────────────────────
    // Move the tier's preferred provider to the front; keep others as fallback.
    // REFLEX → local-slm first, then cascade up.
    // STANDARD → groq first, then openai, then isha.
    // DEEP → isha first, then groq, then openai.
    // Tool-calling is never sent to the SLM (no function-calling support).
    const preferredName = TIER_PROVIDERS[cognitiveTier];
    const preferred = PROVIDERS.find(p => p.name === preferredName && !p.disabled);
    const rest = PROVIDERS.filter(p => p.name !== preferredName && !p.disabled)
      .sort((a, b) => {
        // REFLEX fallback order: groq → openai (skip re-trying SLM)
        // STANDARD fallback order: openai → isha
        // DEEP fallback order: groq → openai
        if (cognitiveTier === TIERS.REFLEX)    return a.priority - b.priority;
        if (cognitiveTier === TIERS.STANDARD)  return a.priority - b.priority;
        if (cognitiveTier === TIERS.DEEP)      return a.priority - b.priority;
        return a.priority - b.priority;
      });
    providersToTry = preferred ? [preferred, ...rest] : PROVIDERS.filter(p => !p.disabled);
    console.log(`[LLM] CognitiveTier=${cognitiveTier} → preferred=${preferredName}, cascade=[${providersToTry.map(p => p.name).join('→')}]`);
  } else {
    providersToTry = PROVIDERS.filter(p => !p.disabled).sort((a, b) => a.priority - b.priority); // All enabled in cascade order
  }

  if (patientId) providersToTry = providersToTry.filter(provider=>provider.useSib);
  const cascade = [];       // Track which providers were attempted
  let response = null;
  let winningProvider = null;
  let errorMessage = null;
  const start = Date.now();

  for (const provider of providersToTry) {
    const params = {
      model: model || provider.model,
      messages,
      temperature: temp,
      max_tokens: maxTok,
      patientId,
      userId,
      cognitive_tier: cognitiveTier || null,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = toolChoice;
    }

    if (responseFormat) {
      params.response_format = responseFormat;
    }

    const providerStart = Date.now();
    try {
      console.log(`[LLM] Trying ${provider.label} (model: ${params.model})...`);
      const slot = GPU_SCHEDULER_ENABLED
        ? slotForRequest({ providerName: provider.name, cognitiveTier, messages })
        : null;
      response = slot
        ? await gpuScheduler.schedule(
            slot.gpu,
            () => callProviderWithRetry(provider, params),
            { priority: slot.priority, label: `${provider.name}/${cognitiveTier || 'default'}` }
          )
        : await callProviderWithRetry(provider, params);

      // Detect stub responses from any provider (e.g. iSHA returning 200 when model not loaded)
      const rawContent = response.choices[0]?.message?.content || '';
      const rawToolCalls = response.choices[0]?.message?.tool_calls || [];
      if (!rawContent.trim() && rawToolCalls.length === 0) {
        console.warn(`[LLM] ${provider.label} returned empty content, cascading...`);
        cascade.push({ provider: provider.name, status: 'error', error: 'Empty content response' });
        errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: Empty content response`;
        import('../llm-metrics.service.js').then(({ logProviderCall }) => {
          logProviderCall(provider.name, cognitiveTier, Date.now() - providerStart,
            response?.usage?.prompt_tokens || 0, response?.usage?.completion_tokens || 0,
            params.model, false, 'empty-content', null);
        }).catch(() => {});
        response = null;
        continue;
      }

      if (STUB_RESPONSE_MARKERS.some(marker => rawContent.includes(marker))) {
        const matchedMarker = STUB_RESPONSE_MARKERS.find(marker => rawContent.includes(marker));
        console.warn(`[LLM] ${provider.label} returned stub placeholder, cascading... MARKER="${matchedMarker}" CONTENT="${rawContent.substring(0,200)}"`);

        cascade.push({ provider: provider.name, status: 'error', error: 'Stub placeholder response — backend not ready' });
        errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: Stub placeholder response`;
        // Metrics: stub is a soft failure
        import('../llm-metrics.service.js').then(({ logProviderCall }) => {
          logProviderCall(provider.name, cognitiveTier, Date.now() - providerStart,
            response?.usage?.prompt_tokens || 0, response?.usage?.completion_tokens || 0,
            params.model, false, 'stub', null);
        }).catch(() => {});
        response = null;
        continue;
      }

      // If JSON mode requested, validate the response is actually valid JSON
      if (responseFormat && responseFormat.type === 'json_object') {
        const content = rawContent;
        try {
          JSON.parse(content);
        } catch {
          console.warn(`[LLM] ${provider.label} returned invalid JSON, cascading...`);
          cascade.push({ provider: provider.name, status: 'error', error: 'Invalid JSON response' });
          errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: Invalid JSON response`;
          // Metrics: invalid JSON is a soft failure
          import('../llm-metrics.service.js').then(({ logProviderCall }) => {
            logProviderCall(provider.name, cognitiveTier, Date.now() - providerStart,
              response?.usage?.prompt_tokens || 0, response?.usage?.completion_tokens || 0,
              params.model, false, 'invalid-json', null);
          }).catch(() => {});
          response = null;
          continue; // Try next provider
        }
      }

      winningProvider = provider;
      cascade.push({ provider: provider.name, status: 'success' });
      // Metrics: success path — log after we know it's the winner
      const providerLatency = Date.now() - providerStart;
      import('../llm-metrics.service.js').then(({ logProviderCall }) => {
        logProviderCall(provider.name, cognitiveTier, providerLatency,
          response?.usage?.prompt_tokens || 0, response?.usage?.completion_tokens || 0,
          params.model, true, null, null);
      }).catch(() => {});
      break; // Success — stop cascade
    } catch (err) {
      if ([401,403].includes(err.statusCode)) throw err;
      const msg = redactPhiText(err.message || String(err));
      console.warn(`[LLM] ${provider.label} failed: ${msg}`);
      cascade.push({ provider: provider.name, status: 'error', error: msg });
      errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: ${msg}`;
      // Metrics: classify error type
      const errType = /timeout/i.test(msg) ? 'timeout'
        : /circuit open/i.test(msg) ? 'circuit-open'
        : /4\d\d/.test(msg) ? 'http-4xx'
        : /5\d\d/.test(msg) ? 'http-5xx'
        : /not configured/i.test(msg) ? 'not-configured'
        : 'unknown';
      import('../llm-metrics.service.js').then(({ logProviderCall }) => {
        logProviderCall(provider.name, cognitiveTier, Date.now() - providerStart,
          0, 0, params.model, false, errType, null);
      }).catch(() => {});
    }
  }

  if (!response || !winningProvider) {
    throw new Error(`All LLM providers failed. ${errorMessage}`);
  }

  const latencyMs = Date.now() - start;
  const choice = response.choices[0];
  const msg = choice?.message;

  const result = {
    content: msg?.content || null,
    toolCalls: msg?.tool_calls || [],
    finishReason: choice?.finish_reason,
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    },
    model: response.model || winningProvider.model,
    provider: winningProvider.name,
    latencyMs,
    cascade,
  };

  // Log to ai_request_logs — fire-and-forget (never blocks the response)
  const COST_TABLE = {
    sib:           { input: 0.00, output: 0.00 },
    groq:          { input: 0.11, output: 0.34 },
    openai:        { input: 0.50, output: 1.50 },
    isha:          { input: 0.00, output: 0.00 },
    'isha-reflex': { input: 0.00, output: 0.00 },
    'isha-inc':    { input: 0.00, output: 0.00 },
  };
  const costs  = COST_TABLE[winningProvider.name] || { input: 0, output: 0 };
  const costUsd = (
    (result.usage.inputTokens  * costs.input  / 1_000_000) +
    (result.usage.outputTokens * costs.output / 1_000_000)
  );
  const safeLog=sanitizeLlmMessages([{role:'assistant',content:result.content,tool_calls:result.toolCalls}])[0];
  pool.query(
    `INSERT INTO ai_request_logs
      (model_config_id, conversation_id, provider, model_name, input_messages, output_text,
       input_tokens, output_tokens, total_tokens, cost_usd, latency_ms, status, error_message, tool_calls, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      dbConfig?.id || null, (Number.isInteger(+conversationId) && conversationId != null ? +conversationId : null), winningProvider.name, result.model,
      JSON.stringify(messages.map(m => ({ role: m.role, content: typeof m.content==='string'?m.content.substring(0,500):'[MULTIMODAL CONTENT OMITTED]' }))),
      safeLog.content?.substring(0, 2000),
      result.usage.inputTokens, result.usage.outputTokens, result.usage.totalTokens,
      costUsd, latencyMs,
      cascade.length > 1 ? 'fallback' : 'success',
      cascade.length > 1 ? redactPhiText(errorMessage) : null,
      JSON.stringify(safeLog.tool_calls),
      JSON.stringify({ finish_reason: result.finishReason, cascade }),
    ]
  ).catch(e => console.error('[LLM] log error:', e.message));

  // ── Store successful response in semantic cache ──────────────────────────
  if (isCacheable && result.content && result.usage.totalTokens > 0) {
    semanticCache.store(scopedCacheText, result.content, {
      provider: result.provider,
      model: result.model,
      tokensUsed: result.usage.totalTokens,
    }).catch(() => {});
  }

  // ── Record telemetry + self-optimisation (evaluation engine) ────────────
  // recordTelemetry handles: outcome scoring, weight updates, cognitive route outcome
  recordTelemetry({
    routeUsed:          tools ? 'agent' : 'llm',
    cognitiveTier:      cognitiveTier || 'standard',
    providerUsed:       result.provider,
    tokensUsed:         result.usage.totalTokens,
    latencyMs:          result.latencyMs,
    result,
    cognitiveDecisionId,
    features:           null,  // features available via orchestrator path
  }).catch(() => {});
  // ────────────────────────────────────────────────────────────────────────

  return result;
}

/**
 * List all configured providers and their status.
 */
function listProviders() {
  return PROVIDERS.map(p => {
    let available = false;
    try {
      p.getClient();
      available = true;
    } catch { /* not configured */ }
    return { name: p.name, label: p.label, model: p.model, priority: p.priority, available: available && !p.disabled, disabled: Boolean(p.disabled) };
  });
}

// ─── Vision (iSHA-inc/Gemini primary, Groq optional fallback) ───────

let _geminiVisionClient = null;

async function callIshaIncVision({ base64Image, mimeType, prompt, maxTokens }) {
  if (!ALLOW_DIRECT_AI_PROVIDERS) {
    throw new Error('isha-inc vision direct disabled; route vision through SIB gateway');
  }

  const baseURL = normalizeProviderUrl(getProviderEnv('ISHA_INC_URL'), 'https://isha-inc.com') + '/v1/chat/completions';
  const apiKey = getProviderEnv('ISHA_INC_API_KEY');
  if (!apiKey) throw new Error('ISHA_INC_API_KEY not configured');

  const visionModel = getProviderEnv('ISHA_INC_VISION_MODEL');
  const visionEnabled = String(getProviderEnv('ISHA_INC_VISION_ENABLED') || '').toLowerCase() === 'true';
  if (!visionModel && !visionEnabled) {
    throw new Error('ISHA_INC_VISION_MODEL not configured; skipping isha-inc vision');
  }

  const model = visionModel || getProviderEnv('ISHA_INC_MODEL') || 'smart-orchestrator';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);

  try {
    const imageUrl = `data:${mimeType};base64,${base64Image}`;
    const res = await fetch(baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (compatible; Mediczy/1.0)',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`isha-inc-vision ${res.status}: ${body.substring(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return {
      content,
      provider: 'isha-inc-vision',
      model: data.model || model,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('isha-inc-vision request timed out (45s)');
    throw err;
  }
}

async function callGeminiVision({ base64Image, mimeType, prompt }) {
  const apiKey = getProviderEnv('GEMINI_API_KEY') || getProviderEnv('GOOGLE_API_KEY');
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  if (!_geminiVisionClient) {
    _geminiVisionClient = new GoogleGenerativeAI(apiKey);
  }

  const modelName = getProviderEnv('GEMINI_VISION_MODEL') || 'gemini-1.5-flash';
  const model = _geminiVisionClient.getGenerativeModel({ model: modelName });
  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
  ]);

  const content = result?.response?.text?.() || '';
  return {
    content,
    provider: 'gemini-vision',
    model: modelName,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };
}

/**
 * Analyse an image using cascading vision providers.
 * Cascade: iSHA-inc Vision → Gemini Vision → Groq Vision (optional)
 *
 * @param {Object} options
 * @param {string} options.base64Image - Base64-encoded image data
 * @param {string} options.mimeType    - image/jpeg, image/png, etc.
 * @param {string} options.prompt      - Analysis prompt
 * @param {number} [options.maxTokens] - Max response tokens (default 2000)
 * @param {string} [options.forceProvider] - Force 'isha-inc' | 'gemini' | 'groq'
 * @returns {{ content: string, provider: string, model: string, usage: Object, latencyMs: number, cascade: Array }}
 */
async function vision({ base64Image, mimeType, prompt, maxTokens = 2000, forceProvider = null }) {
  const start = Date.now();
  const cascade = [];
  const errors = [];

  const providers = forceProvider
    ? [forceProvider]
    : ['isha-inc', 'gemini', 'groq'];

  for (const prov of providers) {
    try {
      if (prov === 'isha-inc') {
        // ── iSHA-inc Vision (local GPU/orchestrator) ──
        const response = await callIshaIncVision({ base64Image, mimeType, prompt, maxTokens });
        const latencyMs = Date.now() - start;
        cascade.push({ provider: 'isha-inc-vision', status: 'success' });

        await logVisionRequest('isha-inc-vision', response.model, response.content, latencyMs, mimeType, response.usage, cascade);
        return { content: response.content, provider: 'isha-inc-vision', model: response.model, latencyMs, usage: response.usage, cascade };

      } else if (prov === 'gemini') {
        // ── Gemini Vision ──
        const response = await callGeminiVision({ base64Image, mimeType, prompt, maxTokens });
        const latencyMs = Date.now() - start;
        cascade.push({ provider: 'gemini-vision', status: 'success' });

        await logVisionRequest('gemini-vision', response.model, response.content, latencyMs, mimeType, response.usage, cascade);
        return { content: response.content, provider: 'gemini-vision', model: response.model, latencyMs, usage: response.usage, cascade };

      } else if (prov === 'groq') {
        // ── Groq Llama 4 Scout Vision ──
        const groqClient = getGroqClient();
        const model = 'meta-llama/llama-4-scout-17b-16e-instruct';

        const imageUrl = `data:${mimeType};base64,${base64Image}`;
        const response = await groqClient.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: prompt }
            ]
          }]
        });

        const content = response.choices[0]?.message?.content || '';
        const latencyMs = Date.now() - start;
        cascade.push({ provider: 'groq-vision', status: 'success' });

        const usage = { input_tokens: response.usage?.prompt_tokens || 0, output_tokens: response.usage?.completion_tokens || 0 };
        await logVisionRequest('groq-vision', model, content, latencyMs, mimeType, usage, cascade);
        return { content, provider: 'groq-vision', model, latencyMs, usage, cascade };
      }
    } catch (err) {
      const msg = err.message || String(err);
      console.warn(`[Vision] ${prov} failed: ${msg}`);
      cascade.push({ provider: `${prov}-vision`, status: 'error', error: msg });
      errors.push(`${prov}: ${msg}`);
    }
  }

  throw new Error(`All vision providers failed: ${errors.join(' | ')}`);
}

async function logVisionRequest(provider, model, content, latencyMs, mimeType, usage, cascade) {
  try {
    await pool.query(
      `INSERT INTO ai_request_logs
        (provider, model_name, input_messages, output_text,
         input_tokens, output_tokens, total_tokens, latency_ms, status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        provider,
        model,
        JSON.stringify([{ role: 'user', content: '(image + prompt)' }]),
        (content || '').substring(0, 2000),
        usage?.input_tokens || 0,
        usage?.output_tokens || 0,
        (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        latencyMs,
        cascade.length > 1 ? 'fallback' : 'success',
        JSON.stringify({ type: 'vision', mimeType, cascade })
      ]
    );
  } catch (logErr) {
    console.error('[LLM-Vision] Failed to log:', logErr.message);
  }
}

// ─── Speech-to-Text (Whisper) ──────────────────────────────

/**
 * Transcribe audio using Groq Whisper (primary) → OpenAI Whisper (fallback).
 *
 * @param {import('fs').ReadStream|Buffer} fileInput - Audio file stream or buffer
 * @param {Object} [options]
 * @param {string} [options.language] - ISO language code (default 'en')
 * @param {string} [options.responseFormat] - 'verbose_json' | 'text' | 'json'
 * @returns {{ text: string, provider: string, duration?: number, language?: string }}
 */
async function transcribe(fileInput, { language = null, responseFormat = 'verbose_json' } = {}) {
  const errors = [];

  // 1. Try Groq Whisper (faster + free)
  try {
    const groqClient = getGroqClient();
    console.log('[STT] Trying Groq Whisper...');
    const params = {
      file: fileInput,
      model: 'whisper-large-v3',
      response_format: responseFormat
    };
    if (language && language !== 'auto') params.language = language;
    const result = await groqClient.audio.transcriptions.create(params);
    console.log('[STT] ✅ Groq Whisper succeeded');
    return { success: true, text: result.text, provider: 'groq-whisper', duration: result.duration, language: result.language };
  } catch (e) {
    console.warn('[STT] Groq Whisper failed:', e.message);
    errors.push(`groq: ${e.message}`);
  }

  // 2. Fallback to OpenAI Whisper
  try {
    const oaiClient = getOpenAIClient();
    console.log('[STT] Trying OpenAI Whisper...');
    const params = {
      file: fileInput,
      model: 'whisper-1',
      response_format: responseFormat
    };
    if (language && language !== 'auto') params.language = language;
    const result = await oaiClient.audio.transcriptions.create(params);
    console.log('[STT] ✅ OpenAI Whisper succeeded');
    return { success: true, text: result.text, provider: 'openai-whisper', duration: result.duration, language: result.language };
  } catch (e) {
    console.warn('[STT] OpenAI Whisper failed:', e.message);
    errors.push(`openai: ${e.message}`);
  }

  return { success: false, text: '', provider: 'none', error: `All STT providers failed: ${errors.join(' | ')}` };
}

// Pre-warm iSHA token and model config cache on module load
getIshaToken().catch(() => {});
getModelConfig().catch(() => {});

export default { chat, vision, transcribe, getModelConfig, listProviders, PROVIDERS, isProviderCircuitOpen };
