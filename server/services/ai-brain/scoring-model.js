/**
 * Scoring Model — Learnable Route Scoring
 * =========================================
 * Part of the HAIS "Cost-Aware Routing Brain" (Part 2.3 of AI OS blueprint).
 *
 * Computes a numeric score for each execution route using a linear model
 * with DB-backed learnable weights. Weights evolve via Exponential Moving
 * Average (EMA) as outcomes are observed — this is the "meta-model over models".
 *
 * Routes:
 *   slm   — local SLM (fast, free, limited capacity)
 *   llm   — cloud LLM (capable, slower, paid per token)
 *   agent — single agent with tool calls
 *   dag   — multi-agent parallel DAG workflow
 *
 * Learning mechanism:
 *   After execution, the evaluation engine computes an outcome score (0-1).
 *   updateWeights(features, route, outcome) nudges each weight W_i via:
 *     W_i ← W_i + α × (outcome × feature_i − W_i)
 *   where α = 0.05 (conservative learning rate).
 *
 *   Over many requests, weights converge to reflect:
 *   "how well does this feature predict success on this route?"
 *
 * Evolution behavior (expected after 1000+ requests):
 *   - SLM simplicity weight increases → simple queries routed cheaper
 *   - LLM complexity weight calibrates → only truly complex queries use LLMs
 *   - Agent tool_need weight stabilizes → tool tasks reliably use agents
 *   - DAG weights specialize → multi-domain tasks auto-parallelized
 */

import pool from '../../db/pgPool.js';

// ─── Default Weights ──────────────────────────────────────────────────────────
// Format: '{route}:{feature_dimension}'
// Starting values are reasonable priors — will drift toward observed reality.

const DEFAULT_WEIGHTS = {
  // SLM — rewarded by simplicity, speed need, economy budget
  'slm:simplicity':     0.80,   // core SLM signal: low complexity → SLM
  'slm:speed_need':     0.65,   // realtime latency need → SLM
  'slm:cost_economy':   0.55,   // economy budget → SLM
  'slm:no_tool_need':   0.60,   // bonus when no tools needed
  'slm:no_ambiguity':   0.40,   // penalty for ambiguous queries

  // LLM — rewarded by complexity, reasoning need, ambiguity
  'llm:complexity':       0.75,
  'llm:reasoning_need':   0.70,
  'llm:ambiguity':        0.60,
  'llm:high_risk':        0.45,   // high-risk → prefer reliable LLM
  'llm:generation_task':  0.50,   // writing/generation → LLM

  // AGENT — rewarded by tool need, action tasks, operational domains
  'agent:tool_need':          0.85,  // strong signal: needs tools → use agent
  'agent:action_task':        0.75,  // booking/scheduling/cancel → agent
  'agent:scheduling_domain':  0.65,
  'agent:medium_complexity':  0.40,

  // DAG — rewarded by multi-agent need, high complexity, planning tasks
  'dag:multi_agent_need':   0.90,   // strongest DAG signal
  'dag:high_complexity':    0.65,
  'dag:planning_task':      0.60,
  'dag:multi_domain':       0.55,
};

// Learning rate for EMA weight updates
const EMA_ALPHA = 0.05;

// ─── In-memory weight cache ───────────────────────────────────────────────────

let _weights       = null;
let _weightsLoadedAt = 0;
const WEIGHTS_TTL  = 10 * 60 * 1000;  // 10 min

let _dbReady = false;

// ─── DB Setup ─────────────────────────────────────────────────────────────────

async function ensureDb() {
  if (_dbReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_routing_weights (
        id            SERIAL PRIMARY KEY,
        weight_key    VARCHAR(80) UNIQUE NOT NULL,
        weight_value  NUMERIC(6, 4) NOT NULL,
        update_count  INTEGER DEFAULT 0,
        last_updated  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Seed defaults on first run
    const vals = Object.entries(DEFAULT_WEIGHTS)
      .map(([k, v]) => `('${k}', ${v})`).join(',');
    await pool.query(`
      INSERT INTO ai_routing_weights (weight_key, weight_value)
      VALUES ${vals}
      ON CONFLICT (weight_key) DO NOTHING
    `);
    _dbReady = true;
  } catch (err) {
    console.error('[ScoringModel] DB init error:', err.message);
  }
}

// ─── Weight Loading ───────────────────────────────────────────────────────────

async function _loadWeights() {
  if (_weights && Date.now() - _weightsLoadedAt < WEIGHTS_TTL) return _weights;
  await ensureDb();
  try {
    const { rows } = await pool.query(
      `SELECT weight_key, weight_value FROM ai_routing_weights`
    );
    _weights = {};
    for (const r of rows) _weights[r.weight_key] = parseFloat(r.weight_value);
    _weightsLoadedAt = Date.now();
  } catch {
    _weights = { ...DEFAULT_WEIGHTS };
  }
  return _weights;
}

// ─── Score Computation ────────────────────────────────────────────────────────

/**
 * Compute route scores for a given feature vector.
 *
 * @param {Object} features - output from feature-extractor.extract()
 * @returns {Promise<{slm, llm, agent, dag, recommended, confidence, weights}>}
 */
export async function score(features) {
  const w = await _loadWeights();
  const {
    complexityScore = 0.3,
    ambiguityScore  = 0.1,
    riskLevel       = 'low',
    needsTools      = false,
    needsMultiAgent = false,
    latencyCategory = 'interactive',
    taskType        = 'conversation',
    domain          = 'general',
    costBudget      = 'standard',
  } = features;

  const simplicity = 1 - complexityScore;

  // ── SLM score ──────────────────────────────────────────────────────────────
  let slmScore = 0;
  slmScore += (w['slm:simplicity']   ?? DEFAULT_WEIGHTS['slm:simplicity'])   * simplicity;
  slmScore += (w['slm:speed_need']   ?? DEFAULT_WEIGHTS['slm:speed_need'])   * (latencyCategory === 'realtime' ? 1.0 : 0.3);
  slmScore += (w['slm:cost_economy'] ?? DEFAULT_WEIGHTS['slm:cost_economy']) * (costBudget === 'economy' ? 1.0 : 0.2);
  slmScore += (w['slm:no_tool_need'] ?? DEFAULT_WEIGHTS['slm:no_tool_need']) * (needsTools ? 0 : 1.0);
  slmScore -= (w['slm:no_ambiguity'] ?? DEFAULT_WEIGHTS['slm:no_ambiguity']) * ambiguityScore;

  // ── LLM score ──────────────────────────────────────────────────────────────
  let llmScore = 0;
  llmScore += (w['llm:complexity']     ?? DEFAULT_WEIGHTS['llm:complexity'])     * complexityScore;
  llmScore += (w['llm:reasoning_need'] ?? DEFAULT_WEIGHTS['llm:reasoning_need']) * (taskType === 'reasoning' || taskType === 'planning' ? 1.0 : 0.2);
  llmScore += (w['llm:ambiguity']      ?? DEFAULT_WEIGHTS['llm:ambiguity'])      * ambiguityScore;
  llmScore += (w['llm:high_risk']      ?? DEFAULT_WEIGHTS['llm:high_risk'])      * (riskLevel === 'high' ? 1.0 : riskLevel === 'medium' ? 0.4 : 0);
  llmScore += (w['llm:generation_task']?? DEFAULT_WEIGHTS['llm:generation_task'])* (taskType === 'generation' ? 1.0 : 0);

  // ── Agent score ────────────────────────────────────────────────────────────
  let agentScore = 0;
  agentScore += (w['agent:tool_need']         ?? DEFAULT_WEIGHTS['agent:tool_need'])         * (needsTools ? 1.0 : 0);
  agentScore += (w['agent:action_task']       ?? DEFAULT_WEIGHTS['agent:action_task'])       * (taskType === 'action' ? 1.0 : 0.1);
  agentScore += (w['agent:scheduling_domain'] ?? DEFAULT_WEIGHTS['agent:scheduling_domain']) * (domain === 'scheduling' ? 1.0 : 0);
  agentScore += (w['agent:medium_complexity'] ?? DEFAULT_WEIGHTS['agent:medium_complexity']) * (complexityScore > 0.3 && complexityScore < 0.75 ? 1.0 : 0.1);

  // ── DAG score ──────────────────────────────────────────────────────────────
  let dagScore = 0;
  dagScore += (w['dag:multi_agent_need'] ?? DEFAULT_WEIGHTS['dag:multi_agent_need']) * (needsMultiAgent ? 1.0 : 0);
  dagScore += (w['dag:high_complexity']  ?? DEFAULT_WEIGHTS['dag:high_complexity'])  * (complexityScore > 0.70 ? 1.0 : 0.1);
  dagScore += (w['dag:planning_task']    ?? DEFAULT_WEIGHTS['dag:planning_task'])    * (taskType === 'planning' ? 1.0 : 0.1);
  dagScore += (w['dag:multi_domain']     ?? DEFAULT_WEIGHTS['dag:multi_domain'])     * (needsMultiAgent && complexityScore > 0.6 ? 1.0 : 0);

  // ── Safety: SLM ineligible for tool tasks, high-risk, and ambiguous deep queries ──
  if (needsTools)               slmScore *= 0.05;
  if (riskLevel === 'high')     slmScore *= 0.10;
  if (ambiguityScore > 0.5)     slmScore *= 0.50;

  // ── Clamp to [0, 1] ────────────────────────────────────────────────────────
  slmScore   = Math.max(0, Math.min(1, slmScore));
  llmScore   = Math.max(0, Math.min(1, llmScore));
  agentScore = Math.max(0, Math.min(1, agentScore));
  dagScore   = Math.max(0, Math.min(1, dagScore));

  // ── Pick recommended route ─────────────────────────────────────────────────
  const scores      = { slm: slmScore, llm: llmScore, agent: agentScore, dag: dagScore };
  const sorted      = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const recommended = sorted[0][0];
  const confidence  = sorted[0][1] > 0
    ? (sorted[0][1] - sorted[1][1]) / sorted[0][1]
    : 0;

  return { ...scores, recommended, confidence };
}

// ─── Weight Update (Online EMA Learning) ─────────────────────────────────────

/**
 * Update routing weights based on an observed outcome.
 * Called by the evaluation engine after response completion.
 *
 * The update rule per weight W_i for the chosen route:
 *   W_i ← W_i + α × (outcome_score × feature_activation_i − W_i)
 *
 * Intuition:
 *   High feature activation + high outcome → increase weight (good predictor)
 *   High feature activation + low outcome  → decrease weight (bad predictor)
 *
 * @param {Object} features     - from feature-extractor.extract()
 * @param {string} routeChosen  - 'slm'|'llm'|'agent'|'dag'
 * @param {number} outcomeScore - 0.0–1.0 composite quality score
 */
export async function updateWeights(features, routeChosen, outcomeScore) {
  if (!features || !routeChosen || outcomeScore == null) return;
  await ensureDb();

  try {
    const w = await _loadWeights();
    const featureMap = _featureActivations(routeChosen, features);
    const updates = [];

    for (const [dim, activation] of Object.entries(featureMap)) {
      const key = `${routeChosen}:${dim}`;
      const current = w[key] ?? DEFAULT_WEIGHTS[key] ?? 0.5;
      // EMA: nudge toward (outcomeScore × activation)
      const target  = outcomeScore * Math.abs(activation);
      const updated = current + EMA_ALPHA * (target - current);
      updates.push([key, Math.max(0.01, Math.min(0.99, updated))]);
    }

    for (const [key, val] of updates) {
      await pool.query(
        `UPDATE ai_routing_weights
            SET weight_value = $1,
                update_count = update_count + 1,
                last_updated = NOW()
          WHERE weight_key = $2`,
        [val, key]
      );
    }

    _weightsLoadedAt = 0;  // invalidate cache
    console.log(`[ScoringModel] Weights updated: route=${routeChosen} outcome=${outcomeScore.toFixed(3)} dims=${updates.length}`);
  } catch (err) {
    console.error('[ScoringModel] Weight update error:', err.message);
  }
}

// ─── Stats API ────────────────────────────────────────────────────────────────

export async function getWeightStats() {
  await ensureDb();
  try {
    const { rows } = await pool.query(`
      SELECT weight_key, weight_value, update_count, last_updated
      FROM ai_routing_weights
      ORDER BY update_count DESC, weight_key
    `);
    return rows;
  } catch (err) {
    return { error: err.message };
  }
}

export async function resetWeightsToDefault() {
  await ensureDb();
  for (const [key, val] of Object.entries(DEFAULT_WEIGHTS)) {
    await pool.query(
      `UPDATE ai_routing_weights
          SET weight_value = $1, update_count = 0, last_updated = NOW()
        WHERE weight_key = $2`,
      [val, key]
    );
  }
  _weightsLoadedAt = 0;
  console.log('[ScoringModel] Weights reset to defaults');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns feature activations (0.0–1.0) for the weight dimensions of a route.
 * These are the "x_i" in the W_i update rule.
 */
function _featureActivations(route, f) {
  const {
    complexityScore = 0.3,
    ambiguityScore  = 0.1,
    riskLevel       = 'low',
    needsTools      = false,
    needsMultiAgent = false,
    latencyCategory = 'interactive',
    taskType        = 'conversation',
    domain          = 'general',
    costBudget      = 'standard',
  } = f;
  const simplicity = 1 - complexityScore;

  switch (route) {
    case 'slm':
      return {
        simplicity,
        speed_need:    latencyCategory === 'realtime' ? 1.0 : 0.3,
        cost_economy:  costBudget === 'economy' ? 1.0 : 0.2,
        no_tool_need:  needsTools ? 0 : 1.0,
        no_ambiguity:  ambiguityScore,
      };
    case 'llm':
      return {
        complexity:      complexityScore,
        reasoning_need:  taskType === 'reasoning' || taskType === 'planning' ? 1.0 : 0.2,
        ambiguity:       ambiguityScore,
        high_risk:       riskLevel === 'high' ? 1.0 : riskLevel === 'medium' ? 0.4 : 0,
        generation_task: taskType === 'generation' ? 1.0 : 0,
      };
    case 'agent':
      return {
        tool_need:         needsTools ? 1.0 : 0,
        action_task:       taskType === 'action' ? 1.0 : 0.1,
        scheduling_domain: domain === 'scheduling' ? 1.0 : 0,
        medium_complexity: complexityScore > 0.3 && complexityScore < 0.75 ? 1.0 : 0.1,
      };
    case 'dag':
      return {
        multi_agent_need: needsMultiAgent ? 1.0 : 0,
        high_complexity:  complexityScore > 0.70 ? 1.0 : 0.1,
        planning_task:    taskType === 'planning' ? 1.0 : 0.1,
        multi_domain:     needsMultiAgent && complexityScore > 0.6 ? 1.0 : 0,
      };
    default:
      return {};
  }
}

export default { score, updateWeights, getWeightStats, resetWeightsToDefault };
