/**
 * Evaluation Engine — Response Quality + Outcome Scoring
 * ========================================================
 * Part 4 of the HAIS AI OS blueprint: "Self-Improving Feedback Loop"
 *
 * Responsibilities:
 *   1. evaluate(result, context) → outcomeScore 0.0–1.0
 *      Heuristic multi-dimensional quality assessment (no LLM call).
 *      Dimensions: completeness, coherence, safety, latency, token efficiency
 *
 *   2. recordTelemetry(data) → persist execution telemetry
 *      Written to ai_execution_telemetry for long-running analysis.
 *
 *   3. triggerOptimization() → called by self-learning pipeline
 *      Reads telemetry, updates scoring-model weights, adjusts
 *      cognitive-router thresholds.
 *
 * Feedback loop:
 *   Request → Execution → recordTelemetry()
 *                       → evaluate() → outcomeScore
 *                                    → updateWeights() (scoring-model)
 *                                    → recordOutcome() (cognitive-router)
 *
 * Data flows to self-learning pipeline (every 4h):
 *   triggerOptimization():
 *     1. Aggregate telemetry by route × category
 *     2. Compute success rates, avg latency, cost efficiency
 *     3. Emit weight updates for consistently successful / failing routes
 *     4. Adjust cognitive-router thresholds (reflex floor, deep floor)
 */

import pool from '../../db/pgPool.js';
import { updateWeights } from './scoring-model.js';
import { recordOutcome, updateThreshold } from './cognitive-router.js';

// ─── DB Setup ─────────────────────────────────────────────────────────────────

let _dbReady = false;

async function ensureDb() {
  if (_dbReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_execution_telemetry (
        id               BIGSERIAL PRIMARY KEY,
        session_id       VARCHAR(80),
        user_id          INTEGER,
        role             VARCHAR(50),
        query_length     INTEGER,
        task_type        VARCHAR(30),
        domain           VARCHAR(30),
        route_used       VARCHAR(20),           -- slm | llm | agent | dag
        cognitive_tier   VARCHAR(20),           -- reflex | standard | deep
        provider_used    VARCHAR(50),
        agents_used      TEXT[],
        tokens_used      INTEGER,
        latency_ms       INTEGER,
        outcome_score    NUMERIC(4, 3),         -- 0.000–1.000
        success          BOOLEAN,
        error_type       VARCHAR(50),
        metadata         JSONB DEFAULT '{}',
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_route_tier
        ON ai_execution_telemetry(route_used, cognitive_tier, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_domain
        ON ai_execution_telemetry(domain, task_type, created_at DESC)
    `);
    _dbReady = true;
  } catch (err) {
    console.error('[EvalEngine] DB init error:', err.message);
  }
}

// ─── Evaluation — Heuristic Quality Score ────────────────────────────────────

/**
 * Compute a composite outcome score from execution result.
 * No LLM call — pure heuristics for speed.
 *
 * Dimensions and weights:
 *   completeness  (0.35) — did we get a response with substance
 *   latency       (0.25) — was it fast enough for the tier
 *   tokenEfficiency(0.20)— did we use tokens reasonably
 *   safety        (0.20) — did any red flags appear in the response
 *
 * @param {Object} result     - from llmProvider.chat() or orchestrator.process()
 * @param {Object} context    - {cognitiveTier, taskType, latencyCategory, tokenEstimate, features}
 * @returns {number} 0.0–1.0
 */
export function evaluate(result, context = {}) {
  if (!result) return 0.0;

  const content       = result.content || result.response || '';
  const tokensUsed    = result.usage?.totalTokens || result.totalTokens || 0;
  const latencyMs     = result.latencyMs || 0;
  const {
    cognitiveTier   = 'standard',
    taskType        = 'conversation',
    latencyCategory = 'interactive',
    tokenEstimate   = 50,
  } = context;

  // ── 1. Completeness score (0–1) ─────────────────────────────────────────
  let completeness = 0;
  if (content && content.length > 0) {
    const len = content.length;
    if (len > 10)   completeness = 0.40;
    if (len > 50)   completeness = 0.60;
    if (len > 150)  completeness = 0.80;
    if (len > 400)  completeness = 0.95;

    // Penalize very generic non-answers
    const refusalPatterns = /^(i (don't|cannot|can't|am not able)|sorry|i apologize|i'm unable|this request)/i;
    if (refusalPatterns.test(content.trim())) completeness = Math.min(completeness, 0.40);

    // Bonus for structured content (JSON, bullet lists, numbered steps)
    if (/(\d+\.|[-•*])\s/.test(content) || content.includes('{')) completeness = Math.min(1.0, completeness + 0.05);
  }

  // ── 2. Latency score (0–1) ──────────────────────────────────────────────
  // Targets: REFLEX <500ms, STANDARD <3000ms, DEEP <8000ms, batch = no limit
  let latency = 1.0;
  if (latencyCategory === 'batch') {
    latency = 1.0;  // batch doesn't care about speed
  } else {
    const targets = { reflex: 500, standard: 3000, deep: 8000 };
    const target  = targets[cognitiveTier] || 3000;
    if (latencyMs <= target)              latency = 1.0;
    else if (latencyMs <= target * 1.5)   latency = 0.75;
    else if (latencyMs <= target * 3)     latency = 0.50;
    else                                   latency = 0.20;
  }

  // ── 3. Token efficiency score (0–1) ────────────────────────────────────
  // Good efficiency: responded in ~2x the query tokens (tight, on-topic)
  // Bad: consumed 20x+ input tokens (very verbose, likely hallucinating)
  let efficiency = 0.8;
  if (tokensUsed > 0 && tokenEstimate > 0) {
    const ratio = tokensUsed / Math.max(tokenEstimate, 20);
    if (ratio < 2)    efficiency = 0.95;  // very terse — good for SLM
    else if (ratio < 8)   efficiency = 0.85;  // reasonable
    else if (ratio < 20)  efficiency = 0.65;
    else                   efficiency = 0.40;  // likely runaway
  }

  // ── 4. Safety score (0–1) ──────────────────────────────────────────────
  let safety = 1.0;
  const safetyConcerns = [
    /\b(kill|harm|abuse|illegal|hack|exploit|bypass|jailbreak)\b/i,
    /\b(100mg\/kg|lethal dose|overdose intentionally|self.?harm)\b/i,
  ];
  if (safetyConcerns.some(p => p.test(content))) safety = 0.20;

  // ── Weighted composite ──────────────────────────────────────────────────
  const score = (
    0.35 * completeness +
    0.25 * latency      +
    0.20 * efficiency   +
    0.20 * safety
  );

  return Math.max(0, Math.min(1, parseFloat(score.toFixed(4))));
}

// ─── Telemetry Persistence ────────────────────────────────────────────────────

/**
 * Persist execution telemetry and trigger async weight updates.
 *
 * @param {Object} data
 */
export async function recordTelemetry(data) {
  await ensureDb();

  const {
    sessionId, userId, role,
    features = {},
    routeUsed, cognitiveTier, providerUsed,
    agentsUsed = [],
    tokensUsed, latencyMs,
    result, error,
    cognitiveDecisionId,
  } = data;

  // Compute outcome score
  const outcomeScore = error ? 0.0 : evaluate(result, {
    cognitiveTier,
    taskType:        features.taskType,
    latencyCategory: features.latencyCategory,
    tokenEstimate:   features.tokenEstimate,
  });

  const success = !error && outcomeScore >= 0.50;

  // Persist
  try {
    await pool.query(
      `INSERT INTO ai_execution_telemetry
         (session_id, user_id, role, query_length, task_type, domain,
          route_used, cognitive_tier, provider_used, agents_used,
          tokens_used, latency_ms, outcome_score, success, error_type, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        sessionId,
        userId,
        role,
        features.tokenEstimate || 0,
        features.taskType || 'unknown',
        features.domain   || 'unknown',
        routeUsed,
        cognitiveTier,
        providerUsed,
        agentsUsed,
        tokensUsed,
        latencyMs,
        outcomeScore,
        success,
        error?.name || (error ? 'error' : null),
        JSON.stringify({ features }),
      ]
    );
  } catch (err) {
    console.error('[EvalEngine] telemetry insert error:', err.message);
  }

  // Async weight + route outcome updates (non-blocking)
  if (features && routeUsed) {
    updateWeights(features, routeUsed, outcomeScore).catch(() => {});
  }
  if (cognitiveDecisionId) {
    recordOutcome(cognitiveDecisionId, {
      success,
      tierActual:   cognitiveTier,
      providerUsed: providerUsed,
      tokensUsed:   tokensUsed,
      latencyMs:    latencyMs,
    }).catch(() => {});
  }

  return outcomeScore;
}

// ─── Optimization Trigger (called by self-learning pipeline) ─────────────────

/**
 * Analyze telemetry → identify routing weight and threshold changes.
 * Called every 4h by self-learning pipeline.
 *
 * IMPORTANT — SaMD PCCP compliance: this function now operates in DRY-RUN mode
 * by default. It identifies what SHOULD change but does NOT apply changes
 * autonomously. The self-learning pipeline routes proposed changes through
 * AIModelGovernanceService.proposeChange() for medical director approval.
 *
 * Pass applyImmediately=true ONLY for non-clinical routing (cost/latency) changes
 * that have been pre-approved in the PCCP. Clinical accuracy threshold changes
 * always require human approval regardless.
 *
 * @param {boolean} applyImmediately - If false (default), returns proposed changes only
 * @returns {{ changes, proposedChanges, appliedChanges, timestamp }}
 */
export async function triggerOptimization({ applyImmediately = false } = {}) {
  await ensureDb();
  const changes           = [];   // all detected changes (informational)
  const proposedChanges   = [];   // changes requiring governance approval
  const appliedChanges    = [];   // changes auto-applied (pre-approved, non-clinical)
  const MIN_SAMPLE = 20;

  try {
    // ── 1. Route performance per (route × domain × task_type) ─────────────
    const { rows: routeStats } = await pool.query(`
      SELECT
        route_used,
        domain,
        task_type,
        COUNT(*)                              AS total,
        AVG(outcome_score)                    AS avg_score,
        AVG(tokens_used)                      AS avg_tokens,
        AVG(latency_ms)                       AS avg_latency,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successes
      FROM ai_execution_telemetry
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY route_used, domain, task_type
      HAVING COUNT(*) >= ${MIN_SAMPLE}
      ORDER BY avg_score DESC
    `);

    for (const row of routeStats) {
      const scoreRate = parseFloat(row.avg_score);
      if (scoreRate > 0.85) {
        changes.push({ type: 'high_performer', route: row.route_used, domain: row.domain, taskType: row.task_type, score: scoreRate });
      } else if (scoreRate < 0.45) {
        // Clinical accuracy below threshold — always requires approval (SaMD PCCP §4.2)
        proposedChanges.push({
          component:      'cognitive-router',
          changeType:     'routing_update',
          description:    `Route '${row.route_used}' has low success rate (${(scoreRate * 100).toFixed(1)}%) for ${row.domain}/${row.task_type}`,
          previousConfig: { route: row.route_used, domain: row.domain, taskType: row.task_type },
          newConfig:      { action: 'deprioritize', successRate: scoreRate },
          rationale:      `${row.total} observations over 7 days, avg success rate ${(scoreRate * 100).toFixed(1)}%`,
          riskAssessment: 'moderate'
        });
        changes.push({ type: 'low_performer', route: row.route_used, domain: row.domain, taskType: row.task_type, score: scoreRate });
      }
    }

    // ── 2. Cognitive tier calibration ─────────────────────────────────────
    const { rows: tierStats } = await pool.query(`
      SELECT
        cognitive_tier,
        COUNT(*)                                     AS total,
        SUM(CASE WHEN success THEN 1 ELSE 0 END)     AS successes,
        AVG(latency_ms)                              AS avg_latency
      FROM ai_execution_telemetry
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND cognitive_tier IS NOT NULL
      GROUP BY cognitive_tier
    `);

    for (const row of tierStats) {
      const total = parseInt(row.total);
      const srate = total > 0 ? parseInt(row.successes) / total : null;
      if (srate === null || total < MIN_SAMPLE) continue;

      const tier = row.cognitive_tier;

      if (tier === 'reflex' && srate < 0.65) {
        // SLM underperforming — threshold raise requires governance approval
        proposedChanges.push({
          component:      'cognitive-router',
          changeType:     'threshold_change',
          description:    `Raise reflex_min_score threshold — SLM success rate is ${(srate * 100).toFixed(1)}% (below 65% floor)`,
          previousConfig: { threshold: 'reflex_min_score', value: 'current' },
          newConfig:      { threshold: 'reflex_min_score', value: 65 },
          rationale:      `${total} observations in 24h, success rate ${(srate * 100).toFixed(1)}%`,
          riskAssessment: 'moderate'
        });
        changes.push({ type: 'threshold_raise_proposed', threshold: 'reflex_min_score', reason: `reflex success=${srate.toFixed(2)}` });
      }

      if (tier === 'reflex' && srate > 0.90) {
        // Cost optimization (non-clinical) — can be auto-applied if applyImmediately
        if (applyImmediately) {
          await updateThreshold('reflex_min_score', 40);
          appliedChanges.push({ threshold: 'reflex_min_score', value: 40 });
        } else {
          proposedChanges.push({
            component:      'cognitive-router',
            changeType:     'threshold_change',
            description:    `Lower reflex_min_score to route more queries to SLM — success rate ${(srate * 100).toFixed(1)}% (cost optimization)`,
            previousConfig: { threshold: 'reflex_min_score', value: 'current' },
            newConfig:      { threshold: 'reflex_min_score', value: 40 },
            rationale:      `SLM performing well at ${(srate * 100).toFixed(1)}% — lowering threshold reduces cloud API cost`,
            riskAssessment: 'low'
          });
        }
        changes.push({ type: 'threshold_lower_proposed', threshold: 'reflex_min_score', reason: `reflex success=${srate.toFixed(2)}` });
      }

      if (tier === 'standard' && srate < 0.60) {
        proposedChanges.push({
          component:      'cognitive-router',
          changeType:     'threshold_change',
          description:    `Raise standard_success_floor — standard tier success rate ${(srate * 100).toFixed(1)}% is below threshold`,
          previousConfig: { threshold: 'standard_success_floor', value: 'current' },
          newConfig:      { threshold: 'standard_success_floor', value: 0.70 },
          rationale:      `${total} observations in 24h, success rate ${(srate * 100).toFixed(1)}%`,
          riskAssessment: 'moderate'
        });
        changes.push({ type: 'threshold_raise_proposed', threshold: 'standard_success_floor', reason: `standard success=${srate.toFixed(2)}` });
      }
    }

    // ── 3. Cost trend reporting (read-only, no threshold change) ──────────
    const { rows: costRows } = await pool.query(`
      SELECT
        route_used,
        AVG(tokens_used) AS avg_tokens
      FROM ai_execution_telemetry
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY route_used
    `);

    const slmUsage = parseInt(costRows.find(r => r.route_used === 'slm')?.avg_tokens || 0);
    const llmUsage = parseInt(costRows.find(r => r.route_used === 'llm')?.avg_tokens || 0);
    changes.push({ type: 'cost_snapshot', slm_avg_tokens: slmUsage, llm_avg_tokens: llmUsage });

    console.log(`[EvalEngine] Optimization analysis: ${changes.length} observations, ${proposedChanges.length} changes proposed for governance review, ${appliedChanges.length} auto-applied`);
    return { changes, proposedChanges, appliedChanges, timestamp: new Date().toISOString() };

  } catch (err) {
    console.error('[EvalEngine] Optimization error:', err.message);
    return { error: err.message, changes, proposedChanges, appliedChanges };
  }
}

// ─── Stats for Dashboard ──────────────────────────────────────────────────────

export async function getTelemetryStats(days = 7) {
  await ensureDb();
  try {
    const { rows } = await pool.query(`
      SELECT
        DATE_TRUNC('hour', created_at)     AS hour,
        route_used,
        COUNT(*)                           AS requests,
        ROUND(AVG(outcome_score)::numeric, 3) AS avg_score,
        ROUND(AVG(latency_ms)::numeric)    AS avg_latency,
        ROUND(AVG(tokens_used)::numeric)   AS avg_tokens,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successes
      FROM ai_execution_telemetry
      WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY hour, route_used
      ORDER BY hour DESC, route_used
      LIMIT 500
    `, [days]);
    return rows;
  } catch (err) {
    return { error: err.message };
  }
}

export default { evaluate, recordTelemetry, triggerOptimization, getTelemetryStats };

export { evaluateChatRelease } from './chat-release-evaluation.js';

// Separate from adaptive scoring: recording a clinical trace never updates weights.
export async function recordChatTelemetry({ traceId, sessionId, channel, latencyMs, provider, model, evidenceStatus, success, errorType }) {
  await ensureDb();
  await pool.query(`INSERT INTO ai_execution_telemetry(session_id,task_type,domain,route_used,provider_used,latency_ms,success,error_type,metadata)
    VALUES($1,'chat','healthcare','governed-chat',$2,$3,$4,$5,$6::jsonb)`,
  [sessionId || null,provider || null,latencyMs,success,errorType || null,JSON.stringify({traceId,channel,model,evidenceStatus,
    versions:{contract:'1',prompt:process.env.CHATBOT_PROMPT_VERSION || 'unapproved',retrieval:'approved-extractive-v1',safety:'medical-chat-v1'}})]);
}
