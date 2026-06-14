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

// ─── Provider Clients (lazy-init) ───────────────────────────

const _clients = {};
let _providerEnvCache = null;

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

  const baseURL = (getProviderEnv('ISHA_INC_URL') || 'https://isha-inc.com') + '/v1/chat/completions';
  const apiKey  = getProviderEnv('ISHA_INC_API_KEY');
  if (!apiKey) throw new Error('ISHA_INC_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30_000);

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
      throw new Error(`isha-inc ${res.status}: ${body.substring(0, 200)}`);
    }
    const data = await res.json();
    _ishaIncFailures = 0;
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    cbFail(() => _ishaIncFailures, v => { _ishaIncFailures = v; }, () => _ishaIncOpenUntil, v => { _ishaIncOpenUntil = v; }, 'isha-inc');
    if (err.name === 'AbortError') throw new Error('isha-inc request timed out (30s)');
    throw err;
  }
}

async function callIsha(params) {
  if (cbCheck(_ishaOpenUntil)) throw new Error('isha circuit open');

  const baseURL = getProviderEnv('ISHA_AI_URL');
  if (!baseURL) throw new Error('ISHA_AI_URL not configured');
  const url = `${baseURL}/v1/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

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

  const sanitisedParams = { ...params, messages };

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
    if (err.name === 'AbortError') throw new Error('iSHA request timed out (30s)');
    throw err;
  }
}

function getGroqClient() {
  if (!_clients.groq) {
    const apiKey = getProviderEnv('GROQ_API_KEY');
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY not configured');
    }
    _clients.groq = new Groq({ apiKey });
  }
  return _clients.groq;
}

function getOpenAIClient() {
  if (!_clients.openai) {
    const apiKey = getProviderEnv('OPENAI_API_KEY');
    if (!apiKey || apiKey.startsWith('sk-proj-test')) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    _clients.openai = new OpenAI({ apiKey });
  }
  return _clients.openai;
}

function getIshaIncClient() {
  if (!_clients.ishaInc) {
    const apiKey = getProviderEnv('ISHA_INC_API_KEY');
    if (!apiKey) throw new Error('ISHA_INC_API_KEY not configured');
    const baseURL = (getProviderEnv('ISHA_INC_URL') || 'http://isha-inc.com') + '/v1';
    _clients.ishaInc = new OpenAI({ baseURL, apiKey });
  }
  return _clients.ishaInc;
}

// Strings that indicate any provider is returning a stub (no real inference backend).
const STUB_RESPONSE_MARKERS = [
  'Integrate vLLM or llama.cpp backend',
  'enable real inference with BiMediX2',
];

// In-memory circuit breakers for iSHA and isha-inc (same pattern as SIB)
let _ishaFailures = 0, _ishaOpenUntil = 0;
let _ishaIncFailures = 0, _ishaIncOpenUntil = 0;
let _slmFailures = 0, _slmOpenUntil = 0;

function cbCheck(openUntil) { return Date.now() < openUntil; }
function cbFail(getF, setF, getO, setO, name) {
  const f = getF() + 1;
  setF(f);
  if (f >= 3) { setO(Date.now() + 5 * 60_000); setF(0); console.warn(`[LLM] ${name} circuit opened for 5 min`); }
}

/**
 * Call local SLM via Ollama (http://localhost:11434).
 * Uses Ollama's /api/chat endpoint — no external dependencies, runs on CPU.
 */
async function callLocalSLM(provider, params) {
  if (cbCheck(_slmOpenUntil)) throw new Error('local-slm circuit open');

  const baseUrl = getProviderEnv('LOCAL_LLM_URL') || provider.baseUrl || 'http://localhost:11434';
  const model   = getProviderEnv('OLLAMA_MODEL') || 'qwen2:1.5b';
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
      throw new Error(`local-slm ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data    = await res.json();
    const content = data.message?.content || '';
    if (!content.trim()) throw new Error('local-slm (Ollama) returned empty response');

    _slmFailures = 0;
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
    cbFail(() => _slmFailures, v => { _slmFailures = v; }, () => _slmOpenUntil, v => { _slmOpenUntil = v; }, 'local-slm');
    if (err.name === 'AbortError') throw new Error('local-slm request timed out (30s)');
    throw err;
  }
}

// In-memory circuit breaker for SIB (Qwen CPU inference is 60-120s, always times out)
let _sibFailures = 0;
let _sibOpenUntil = 0;

async function callSib(params) {
  if (Date.now() < _sibOpenUntil) throw new Error('sib circuit open');

  const baseUrl = getProviderEnv('SIB_URL') || 'http://localhost:8005';
  const url = `${baseUrl.replace(/\/$/, '')}/chat`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  const messages = Array.isArray(params.messages) ? params.messages : [];
  const systemParts = messages
    .filter(m => m?.role === 'system' && typeof m?.content === 'string')
    .map(m => m.content.trim())
    .filter(Boolean);
  const userParts = messages
    .filter(m => m?.role !== 'system' && typeof m?.content === 'string')
    .map(m => m.content.trim())
    .filter(Boolean);

  const message = [...systemParts, ...userParts].join('\n\n').trim();
  if (!message) throw new Error('SIB request has no message content');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        patient_id: params.patientId || params.userId || 'mediczy-backend',
        user_id: params.userId,
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
      const body = await res.text().catch(() => '');
      throw new Error(`sib ${res.status}: ${body.substring(0, 200)}`);
    }

    const data = await res.json();
    const content = (data.response || data.answer || data.content || '').toString();
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
    _sibFailures++;
    if (_sibFailures >= 3) {
      _sibOpenUntil = Date.now() + 5 * 60_000; // open for 5 min
      _sibFailures = 0;
      console.warn('[LLM] SIB circuit opened — skipping for 5 min');
    }
    if (err.name === 'AbortError') throw new Error('sib request timed out (8s)');
    throw err;
  }
}

// ─── Provider Definitions ───────────────────────────────────

const PROVIDERS = [
  {
    name: 'sib',
    label: 'SIB FastAPI (Primary AI Router)',
    model: getProviderEnv('SIB_MODEL') || 'sib-router',
    getClient: () => ({ available: true }),
    useSib: true,
    priority: 0,
  },
  {
    name: 'isha-reflex',
    label: 'iSHA.buzz (BiMediX2-8B — REFLEX)',
    model: getProviderEnv('ISHA_REFLEX_MODEL') || 'bi-medix2',
    getClient: () => ({ available: true }),
    useFetch: true,
    priority: 1,
    extraBody: { agent_type: 'Clinical' },
  },
  {
    name: 'groq',
    label: 'Groq (Llama 4 Scout 17B)',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    getClient: getGroqClient,
    priority: 2,
  },
  {
    name: 'isha-inc',
    label: 'isha-inc.com (smart-orchestrator)',
    model: getProviderEnv('ISHA_INC_MODEL') || 'smart-orchestrator',
    getClient: getIshaIncClient,
    priority: 3,
  },
  {
    name: 'isha-insurance',
    label: 'isha-inc.com (MedGemma-4B)',
    model: 'medgemma-4b',
    getClient: () => ({ available: true }),
    useFetchIshaInc: true,   // bypass OpenAI SDK — Cloudflare blocks its User-Agent
    priority: 2,
  },
  {
    name: 'isha',
    label: 'iSHA.buzz (BiMediX2-8B — DEEP)',
    model: getProviderEnv('ISHA_LLM_MODEL') || 'bi-medix2',
    getClient: () => ({ available: true }),
    useFetch: true,
    priority: 4,
    extraBody: { agent_type: 'Clinical' },
  },
  {
    name: 'openai',
    label: 'OpenAI (GPT-3.5-turbo)',
    model: 'gpt-3.5-turbo',
    getClient: getOpenAIClient,
    priority: 5,
  },
  {
    name: 'local-slm',
    label: 'Local Indic-Gemma-2B (offline fallback)',
    model: 'indic-gemma-2b-navarasa',
    useFetch: false,
    useLocalSLM: true,
    baseUrl: getProviderEnv('LOCAL_LLM_URL') || 'http://localhost:11434',
    priority: 5,                   // Only used when all cloud providers fail
  },
];

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
  // Cap max_tokens for models with lower context limits
  let cappedParams = params;
  if (provider.name === 'openai' && params.max_tokens > 4096) {
    cappedParams = { ...params, max_tokens: 4096 };
  }

  // Merge any provider-specific extra body params (e.g. agent_type for iSHA)
  const finalParams = provider.extraBody
    ? { ...cappedParams, ...provider.extraBody }
    : cappedParams;

  // Local offline SLM (Indic-Gemma via offline scribe FastAPI)
  if (provider.useLocalSLM) {
    return callLocalSLM(provider, finalParams);
  }

  // SIB FastAPI router (preferred primary path)
  if (provider.useSib) {
    return callSib(finalParams);
  }

  // isha-inc.com: direct fetch to bypass Cloudflare OpenAI-SDK block
  if (provider.useFetchIshaInc) {
    return callIshaInc(finalParams);
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
  skipCache = false,       // set true for agentic/tool-calling or clinical flows
  cacheScope = null,       // tenant/patient/session scope required before caching clinical text
  cognitiveTier = null,    // 'reflex' | 'standard' | 'deep' — from CognitiveRouter.classify()
  cognitiveDecisionId = null,  // for outcome recording
}) {
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
  const isCacheable = !skipCache
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
    const forced = PROVIDERS.find(p => p.name === forceProvider);
    if (!forced) throw new Error(`Unknown provider: ${forceProvider}`);
    providersToTry = [forced];
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
    providersToTry = PROVIDERS.filter(p => !p.disabled); // All enabled in cascade order
  }

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
      response = await callProvider(provider, params);

      // Detect stub responses from any provider (e.g. iSHA returning 200 when model not loaded)
      const rawContent = response.choices[0]?.message?.content || '';
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
      const msg = err.message || String(err);
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
  pool.query(
    `INSERT INTO ai_request_logs
      (model_config_id, conversation_id, provider, model_name, input_messages, output_text,
       input_tokens, output_tokens, total_tokens, cost_usd, latency_ms, status, error_message, tool_calls, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      dbConfig?.id || null, conversationId, winningProvider.name, result.model,
      JSON.stringify(messages.map(m => ({ role: m.role, content: m.content?.substring(0, 500) }))),
      result.content?.substring(0, 2000),
      result.usage.inputTokens, result.usage.outputTokens, result.usage.totalTokens,
      costUsd, latencyMs,
      cascade.length > 1 ? 'fallback' : 'success',
      cascade.length > 1 ? errorMessage : null,
      JSON.stringify(result.toolCalls),
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
    return { name: p.name, label: p.label, model: p.model, priority: p.priority, available };
  });
}

// ─── Vision (iSHA-inc/Gemini primary, Groq optional fallback) ───────

let _geminiVisionClient = null;

async function callIshaIncVision({ base64Image, mimeType, prompt, maxTokens }) {
  const baseURL = (getProviderEnv('ISHA_INC_URL') || 'https://isha-inc.com') + '/v1/chat/completions';
  const apiKey = getProviderEnv('ISHA_INC_API_KEY');
  if (!apiKey) throw new Error('ISHA_INC_API_KEY not configured');

  const model = getProviderEnv('ISHA_INC_VISION_MODEL') || getProviderEnv('ISHA_INC_MODEL') || 'smart-orchestrator';
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

export default { chat, vision, transcribe, getModelConfig, listProviders, PROVIDERS };
