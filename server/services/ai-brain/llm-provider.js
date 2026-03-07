/**
 * LLM Provider Service
 * ====================
 * Abstraction layer for LLM providers (Groq/Llama primary, OpenAI/Gemini fallback).
 * Supports function/tool calling for the agentic brain loop.
 */

import Groq from 'groq-sdk';
import pool from '../../db/pgPool.js';

// Lazy-init Groq client
let _groq = null;
function getGroq() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY not configured');
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

/**
 * Get active model config from database
 */
async function getModelConfig(name = 'dr-isha-primary') {
  const db = pool;
  const { rows } = await db.query(
    'SELECT * FROM ai_model_configs WHERE name = $1 AND is_active = true',
    [name]
  );
  return rows[0] || {
    provider: 'groq',
    model_name: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    max_tokens: 4096,
    config: {}
  };
}

/**
 * Call LLM with messages and optional tools (function calling).
 *
 * @param {Object} options
 * @param {Array}  options.messages    - OpenAI-format messages [{role, content}]
 * @param {Array}  [options.tools]     - Tool definitions for function calling
 * @param {string} [options.toolChoice] - 'auto' | 'none' | 'required'
 * @param {string} [options.model]     - Override model name
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {number} [options.conversationId] - For logging
 * @returns {Object} { content, toolCalls, usage, model, latencyMs }
 */
async function chat({
  messages,
  tools = null,
  toolChoice = 'auto',
  model = null,
  temperature = null,
  maxTokens = null,
  conversationId = null,
  responseFormat = null
}) {
  const config = await getModelConfig();
  const groq = getGroq();

  const params = {
    model: model || config.model_name,
    messages,
    temperature: temperature ?? config.temperature,
    max_tokens: maxTokens || config.max_tokens,
  };

  if (tools && tools.length > 0) {
    params.tools = tools;
    params.tool_choice = toolChoice;
  }

  if (responseFormat) {
    params.response_format = responseFormat;
  }

  const start = Date.now();
  let response;
  let status = 'success';
  let errorMessage = null;

  try {
    response = await groq.chat.completions.create(params);
  } catch (err) {
    status = 'error';
    errorMessage = err.message;

    // Fallback to smaller model
    if (config.config?.fallback_model) {
      console.warn(`[LLM] Primary model failed, trying fallback: ${config.config.fallback_model}`);
      try {
        params.model = config.config.fallback_model;
        response = await groq.chat.completions.create(params);
        status = 'fallback';
      } catch (fallbackErr) {
        errorMessage = `Primary: ${err.message} | Fallback: ${fallbackErr.message}`;
        throw new Error(errorMessage);
      }
    } else {
      throw err;
    }
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
    model: response.model,
    latencyMs,
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
        config.id || null,
        conversationId,
        'groq',
        result.model,
        JSON.stringify(messages.map(m => ({ role: m.role, content: m.content?.substring(0, 500) }))),
        result.content?.substring(0, 2000),
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.totalTokens,
        latencyMs,
        status,
        errorMessage,
        JSON.stringify(result.toolCalls),
        JSON.stringify({ finish_reason: result.finishReason })
      ]
    );
  } catch (logErr) {
    console.error('[LLM] Failed to log request:', logErr.message);
  }

  return result;
}

export default { chat, getModelConfig, getGroq };
