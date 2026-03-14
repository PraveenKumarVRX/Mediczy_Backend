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

      // If JSON mode requested, validate the response is actually valid JSON
      if (responseFormat && responseFormat.type === 'json_object') {
        const content = response.choices[0]?.message?.content || '';
        try {
          JSON.parse(content);
        } catch {
          console.warn(`[LLM] ${provider.label} returned invalid JSON, cascading...`);
          cascade.push({ provider: provider.name, status: 'error', error: 'Invalid JSON response' });
          errorMessage = (errorMessage ? errorMessage + ' | ' : '') + `${provider.name}: Invalid JSON response`;
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
async function transcribe(fileInput, { language = 'en', responseFormat = 'verbose_json' } = {}) {
  const errors = [];

  // 1. Try Groq Whisper (faster + free)
  try {
    const groqClient = getGroqClient();
    console.log('[STT] Trying Groq Whisper...');
    const result = await groqClient.audio.transcriptions.create({
      file: fileInput,
      model: 'whisper-large-v3',
      language,
      response_format: responseFormat
    });
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
    const result = await oaiClient.audio.transcriptions.create({
      file: fileInput,
      model: 'whisper-1',
      language,
      response_format: responseFormat
    });
    console.log('[STT] ✅ OpenAI Whisper succeeded');
    return { success: true, text: result.text, provider: 'openai-whisper', duration: result.duration, language: result.language };
  } catch (e) {
    console.warn('[STT] OpenAI Whisper failed:', e.message);
    errors.push(`openai: ${e.message}`);
  }

  return { success: false, text: '', provider: 'none', error: `All STT providers failed: ${errors.join(' | ')}` };
}

export default { chat, vision, transcribe, getModelConfig, listProviders, PROVIDERS };
