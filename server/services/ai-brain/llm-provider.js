/**
 * LLM Provider Service
 * ====================
 * 3-provider cascade: isha.buzz (primary) → Groq (secondary) → OpenAI (final).
 * All providers use OpenAI-compatible API format with function/tool calling.
 *
 * Cascade logic:
 * - Try primary (isha.buzz / bimedix) first
 * - On failure → try Groq / Llama-3.3-70b
 * - On failure → try OpenAI / gpt-4o-mini (always available)
 */

import OpenAI from 'openai';
import Groq from 'groq-sdk';
import pool from '../../db/pgPool.js';

// ─── Provider Clients (lazy-init) ───────────────────────────

const _clients = {};

/**
 * Direct fetch for iSHA — avoids OpenAI SDK which always sends Authorization header.
 * The GPU gateway rejects any Authorization header (even dummy) via JWT middleware.
 * With ALLOW_INSECURE_DEV=true and NO auth header, the gateway skips auth entirely.
 */
async function callIsha(params) {
  const baseURL = process.env.ISHA_AI_URL || 'https://ai.isha.buzz';
  const url = `${baseURL}/v1/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },   // NO Authorization header
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${body.substring(0, 200)}`);
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
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY not configured');
    }
    _clients.groq = new Groq({ apiKey });
  }
  return _clients.groq;
}

function getOpenAIClient() {
  if (!_clients.openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith('sk-proj-test')) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    _clients.openai = new OpenAI({ apiKey });
  }
  return _clients.openai;
}

// ─── Provider Definitions ───────────────────────────────────

const PROVIDERS = [
  {
    name: 'isha',
    label: 'iSHA.buzz (BiMediX2)',
    model: process.env.ISHA_LLM_MODEL || 'bi-medix2',
    getClient: () => ({ available: true }),  // Placeholder — iSHA uses direct fetch
    useFetch: true,                          // Flag: use callIsha() instead of SDK
    priority: 1,
    // Extra body params for iSHA GPU routing (matches SIB FastAPI)
    extraBody: { agent_type: 'Clinical', model_port: 8080 },
  },
  {
    name: 'groq',
    label: 'Groq (Llama 3.3 70B)',
    model: 'llama-3.3-70b-versatile',
    getClient: getGroqClient,
    priority: 2,
  },
  {
    name: 'openai',
    label: 'OpenAI (GPT-3.5-turbo)',
    model: 'gpt-3.5-turbo',
    getClient: getOpenAIClient,
    priority: 3,
  },
];

/**
 * Get active model config from database (for DB-driven overrides)
 */
async function getModelConfig(name = 'isha-primary') {
  try {
    const db = pool;
    const { rows } = await db.query(
      'SELECT * FROM ai_model_configs WHERE name = $1 AND is_active = true',
      [name]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Call a single provider's chat completion API.
 */
async function callProvider(provider, params) {
  // Merge any provider-specific extra body params (e.g. agent_type for iSHA)
  const finalParams = provider.extraBody
    ? { ...params, ...provider.extraBody }
    : params;

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
}) {
  const dbConfig = await getModelConfig();
  const temp = temperature ?? dbConfig?.temperature ?? 0.4;
  const maxTok = maxTokens || dbConfig?.max_tokens || 4096;

  // Determine which providers to try
  let providersToTry;
  if (forceProvider) {
    const forced = PROVIDERS.find(p => p.name === forceProvider);
    if (!forced) throw new Error(`Unknown provider: ${forceProvider}`);
    providersToTry = [forced];
  } else {
    providersToTry = [...PROVIDERS]; // All 3 in cascade order
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

  // Log to ai_request_logs
  try {
    const db = pool;
    await db.query(
      `INSERT INTO ai_request_logs
        (model_config_id, conversation_id, provider, model_name, input_messages, output_text,
         input_tokens, output_tokens, total_tokens, latency_ms, status, error_message, tool_calls, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        dbConfig?.id || null,
        conversationId,
        winningProvider.name,
        result.model,
        JSON.stringify(messages.map(m => ({ role: m.role, content: m.content?.substring(0, 500) }))),
        result.content?.substring(0, 2000),
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.totalTokens,
        latencyMs,
        cascade.length > 1 ? 'fallback' : 'success',
        cascade.length > 1 ? errorMessage : null,
        JSON.stringify(result.toolCalls),
        JSON.stringify({ finish_reason: result.finishReason, cascade })
      ]
    );
  } catch (logErr) {
    console.error('[LLM] Failed to log request:', logErr.message);
  }

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

export default { chat, getModelConfig, listProviders, PROVIDERS };
