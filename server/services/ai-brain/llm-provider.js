/**
 * LLM Provider Service — Single Source of Truth for ALL AI
 * ========================================================
 * Centralises every AI capability behind a unified cascade:
 *
 *  Text   → iSHA (primary) → Groq → OpenAI
 *  Vision → Anthropic Claude (only provider with vision)
 *  STT    → Groq Whisper → OpenAI Whisper
 *  TTS    → ElevenLabs (handled elsewhere)
 *
 * NO other file should instantiate OpenAI / Groq / Anthropic directly.
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
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

async function callIsha(params) {
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // If 401, clear cached token so next call re-authenticates
      if (res.status === 401) { _ishaToken = null; _ishaTokenExp = 0; }
      const body = await res.text().catch(() => '');
      throw new Error(`iSHA ${res.status}: ${body.substring(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
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

/**
 * Call local offline SLM (Indic-Gemma-2B via offline scribe FastAPI).
 * Translates OpenAI-compatible params → offline_scribe ChatRequest format.
 * Returns an OpenAI-compatible response object for seamless cascade.
 */
// Strings that indicate any provider is returning a stub (no real inference backend)
const STUB_RESPONSE_MARKERS = [
  'This is a stub response',
  'Integrate vLLM or llama.cpp backend',
  'enable real inference with BiMediX2',
  'enable real inference with',
  'Integrate vLLM',
  'llama.cpp backend',
];

async function callLocalSLM(provider, params) {
  const url = `${provider.baseUrl}/api/chat`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000); // longer — CPU inference

  try {
    const body = {
      messages: params.messages.map(m => ({ role: m.role, content: String(m.content || '') })),
      max_tokens: Math.min(params.max_tokens || 512, 1024),
      temperature: params.temperature || 0.5,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`local-slm ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const content = data.content || '';

    // Detect stub placeholder responses — treat as failure so cascade continues
    if (STUB_RESPONSE_MARKERS.some(marker => content.includes(marker))) {
      throw new Error('local-slm returned stub placeholder — real inference backend not running');
    }

    // Convert offline scribe response to OpenAI-compatible format
    return {
      id: data.id || `slm-${Date.now()}`,
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: data.finish_reason || 'stop',
      }],
      model: data.model || provider.model,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('local-slm request timed out (60s)');
    throw err;
  }
}

// ─── Provider Definitions ───────────────────────────────────

const PROVIDERS = [
  {
    name: 'isha-reflex',
    label: 'iSHA.buzz (Qwen-0.6B-Med — REFLEX)',
    model: getProviderEnv('ISHA_REFLEX_MODEL') || 'qwen-0.6b-med',
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
    name: 'isha',
    label: 'iSHA.buzz (BiMediX2-8B FP16 — DEEP)',
    model: getProviderEnv('ISHA_LLM_MODEL') || 'bimedix2-8b-fp16',
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
    baseUrl: getProviderEnv('OFFLINE_SCRIBE_URL') || 'http://localhost:8006',
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

  // iSHA uses direct fetch (no Authorization header)
  if (provider.useFetch) {
    return callIsha(finalParams);
  }

  // Groq / OpenAI use their respective SDKs
  const client = provider.getClient();
  return client.chat.completions.create(finalParams);
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
  skipCache = false,       // set true for agentic/tool-calling flows
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
  const isCacheable = !skipCache && !tools && !responseFormat && userMessage && typeof userMessage === 'string';

  if (isCacheable) {
    const hit = await semanticCache.lookup(userMessage);
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

    try {
      console.log(`[LLM] Trying ${provider.label} (model: ${params.model})...`);
      response = await callProvider(provider, params);

      // Detect stub responses from any provider (e.g. iSHA returning 200 when model not loaded)
      const rawContent = response.choices[0]?.message?.content || '';
      if (STUB_RESPONSE_MARKERS.some(marker => rawContent.includes(marker))) {
        console.warn(`[LLM] ${provider.label} returned stub placeholder, cascading...`);
        cascade.push({ provider: provider.name, status: 'error', error: 'Stub placeholder response — backend not ready' });
        errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: Stub placeholder response`;
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
          response = null;
          continue; // Try next provider
        }
      }

      winningProvider = provider;
      cascade.push({ provider: provider.name, status: 'success' });
      break; // Success — stop cascade
    } catch (err) {
      const msg = err.message || String(err);
      console.warn(`[LLM] ${provider.label} failed: ${msg}`);
      cascade.push({ provider: provider.name, status: 'error', error: msg });
      errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: ${msg}`;
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
    semanticCache.store(userMessage, result.content, {
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

// ─── Vision (Anthropic Claude → Groq Llama 4 Scout) ───────

let _anthropicClient = null;

/**
 * Analyse an image using cascading vision providers.
 * Cascade: Anthropic Claude 3.5 Sonnet → Groq Llama 4 Scout
 *
 * @param {Object} options
 * @param {string} options.base64Image - Base64-encoded image data
 * @param {string} options.mimeType    - image/jpeg, image/png, etc.
 * @param {string} options.prompt      - Analysis prompt
 * @param {number} [options.maxTokens] - Max response tokens (default 2000)
 * @param {string} [options.forceProvider] - Force 'anthropic' or 'groq'
 * @returns {{ content: string, provider: string, model: string, usage: Object, latencyMs: number, cascade: Array }}
 */
async function vision({ base64Image, mimeType, prompt, maxTokens = 2000, forceProvider = null }) {
  const start = Date.now();
  const cascade = [];
  const errors = [];

  const providers = forceProvider
    ? [forceProvider]
    : ['anthropic', 'groq'];

  for (const prov of providers) {
    try {
      if (prov === 'anthropic') {
        // ── Anthropic Claude Vision ──
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured');
        }

        let Anthropic;
        try {
          Anthropic = (await import('@anthropic-ai/sdk')).default;
        } catch {
          throw new Error('Anthropic SDK not installed — run: npm i @anthropic-ai/sdk');
        }

        if (!_anthropicClient) {
          _anthropicClient = new Anthropic();
        }

        const response = await _anthropicClient.messages.create({
          model: process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
              { type: 'text', text: prompt }
            ]
          }]
        });

        const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
        const latencyMs = Date.now() - start;
        cascade.push({ provider: 'anthropic-vision', status: 'success' });

        await logVisionRequest('anthropic-vision', response.model || 'claude-3-5-sonnet', content, latencyMs, mimeType, response.usage, cascade);
        return { content, provider: 'anthropic-vision', model: response.model || 'claude-3-5-sonnet', latencyMs, usage: response.usage, cascade };

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
