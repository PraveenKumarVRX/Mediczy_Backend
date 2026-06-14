/**
 * LLM Provider Metrics Service — ITEM-25
 * =======================================
 * Tracks per-provider latency, token usage, success rate, and error types
 * for the LLM cascade. Powers the provider-performance governance dashboard.
 *
 * Table: llm_provider_metrics
 *   id                BIGSERIAL PRIMARY KEY
 *   provider          TEXT NOT NULL          — 'sib' | 'isha-reflex' | 'groq' | 'openai' | ...
 *   cognitive_tier    TEXT                   — 'reflex' | 'standard' | 'deep' | null
 *   latency_ms        INTEGER
 *   prompt_tokens     INTEGER
 *   completion_tokens INTEGER
 *   model             TEXT
 *   success           BOOLEAN
 *   error_type        TEXT                   — short error class on failure
 *   use_case          TEXT                   — e.g. 'triage', 'drug-interaction', 'chat'
 *   created_at        TIMESTAMPTZ DEFAULT NOW()
 */

import pool from '../db/pgPool.js';

// ── Table bootstrap (idempotent) ──────────────────────────────────────────────

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS llm_provider_metrics (
      id                BIGSERIAL PRIMARY KEY,
      provider          TEXT NOT NULL,
      cognitive_tier    TEXT,
      latency_ms        INTEGER,
      prompt_tokens     INTEGER,
      completion_tokens INTEGER,
      model             TEXT,
      success           BOOLEAN,
      error_type        TEXT,
      use_case          TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_llm_metrics_provider_created
      ON llm_provider_metrics(provider, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_llm_metrics_created
      ON llm_provider_metrics(created_at DESC);
  `);
}

// Run once at module load; failures are non-fatal (service degrades gracefully)
ensureTable().catch(err =>
  console.warn('[llm-metrics] Table bootstrap failed (non-fatal):', err.message)
);

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Log a single LLM provider call.
 * Fire-and-forget: never throws; failures are logged to console only.
 *
 * @param {string}  provider         — provider name e.g. 'groq'
 * @param {string|null} cognitiveTier — 'reflex'|'standard'|'deep'|null
 * @param {number}  latencyMs        — wall-clock latency in ms
 * @param {number}  promptTokens     — input token count (0 if unknown)
 * @param {number}  completionTokens — output token count (0 if unknown)
 * @param {string}  model            — model name/id
 * @param {boolean} success          — true = produced valid response
 * @param {string|null} errorType    — short error class, e.g. 'timeout', 'stub', 'http-4xx'
 * @param {string|null} useCase      — calling context e.g. 'triage', 'chat', 'drug-check'
 */
async function logProviderCall(
  provider,
  cognitiveTier,
  latencyMs,
  promptTokens,
  completionTokens,
  model,
  success,
  errorType,
  useCase
) {
  try {
    await pool.query(
      `INSERT INTO llm_provider_metrics
         (provider, cognitive_tier, latency_ms, prompt_tokens, completion_tokens,
          model, success, error_type, use_case)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        provider,
        cognitiveTier || null,
        latencyMs     || 0,
        promptTokens  || 0,
        completionTokens || 0,
        model         || null,
        success       === true,
        errorType     || null,
        useCase       || null,
      ]
    );
  } catch (err) {
    console.error('[llm-metrics] logProviderCall error:', err.message);
  }
}

// ── Read — percentile helper ──────────────────────────────────────────────────

/**
 * Return provider performance stats for a given time window.
 *
 * @param {'24h'|'7d'|'30d'} window
 * @returns {Promise<Array>} rows with p50/p95/p99 latency, success rate, token totals
 */
async function getProviderPerformance(window = '24h') {
  const windowMap = {
    '24h': '24 hours',
    '7d':  '7 days',
    '30d': '30 days',
  };
  const interval = windowMap[window] || '24 hours';

  const { rows } = await pool.query(
    `SELECT
       provider,
       cognitive_tier,
       COUNT(*)                                        AS total_calls,
       SUM(CASE WHEN success THEN 1 ELSE 0 END)       AS success_count,
       SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)   AS failure_count,
       ROUND(
         100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2
       )                                               AS success_rate_pct,
       ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms))::INTEGER AS p50_ms,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))::INTEGER AS p95_ms,
       ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms))::INTEGER AS p99_ms,
       ROUND(AVG(latency_ms))::INTEGER                AS avg_ms,
       SUM(prompt_tokens)                             AS total_prompt_tokens,
       SUM(completion_tokens)                         AS total_completion_tokens,
       SUM(prompt_tokens + completion_tokens)         AS total_tokens,
       MIN(created_at)                                AS window_start,
       MAX(created_at)                                AS window_end
     FROM llm_provider_metrics
     WHERE created_at >= NOW() - INTERVAL '${interval}'
     GROUP BY provider, cognitive_tier
     ORDER BY provider, cognitive_tier`,
    []
  );

  return rows;
}

/**
 * Return the top error types for each provider in the given window.
 *
 * @param {'24h'|'7d'|'30d'} window
 * @returns {Promise<Array>}
 */
async function getErrorBreakdown(window = '24h') {
  const windowMap = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
  const interval = windowMap[window] || '24 hours';

  const { rows } = await pool.query(
    `SELECT
       provider,
       error_type,
       COUNT(*) AS count
     FROM llm_provider_metrics
     WHERE created_at >= NOW() - INTERVAL '${interval}'
       AND success = false
       AND error_type IS NOT NULL
     GROUP BY provider, error_type
     ORDER BY provider, count DESC`,
    []
  );

  return rows;
}

export { logProviderCall, getProviderPerformance, getErrorBreakdown };
export default { logProviderCall, getProviderPerformance, getErrorBreakdown };
