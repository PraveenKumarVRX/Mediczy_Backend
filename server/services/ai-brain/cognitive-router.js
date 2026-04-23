/**
 * Cognitive Router — Dynamic Cognitive Tier Selection
 * ====================================================
 * Implements the "Hierarchical Agentic Intelligence System" (HAIS) routing layer.
 *
 * Architecture:
 *
 *   ┌────────────────────────────────────────────────┐
 *   │            COGNITIVE ROUTER                    │
 *   │  classify(message) → tier decision             │
 *   │                                                │
 *   │  REFLEX  → local SLM (Indic-Gemma, <200ms)     │
 *   │  STANDARD → Groq Llama-70B (~500ms)            │
 *   │  DEEP    → iSHA BiMediX2 / GPT-4 (~2s)         │
 *   └────────────────────────────────────────────────┘
 *
 * The shift:
 *   Old: iSHA → Groq → OpenAI → local-SLM  (cascade on FAILURE)
 *   New: classify first → route to right tier → cascade only on FAILURE
 *
 * Key principles:
 *   - Classifier itself uses ZERO LLM calls (pure CPU: regex + heuristics)
 *   - REFLEX tasks go to SLM as FIRST choice, not last resort
 *   - Routing decisions are logged and feed the self-optimizing engine
 *   - Success rates per category dynamically adjust tier thresholds
 *
 * Cognitive tiers:
 *   REFLEX   — fast reflexive computation (SLM-class, <2B params)
 *              extraction, yes/no, booking, reminders, status checks
 *              target latency: <500ms
 *
 *   STANDARD — single-domain reasoning (70B-class)
 *              explain, analyze, compare, single-specialty clinical
 *              target latency: <2s
 *
 *   DEEP     — abstract multi-step reasoning (LLM-class)
 *              differential diagnosis, treatment planning, cross-domain
 *              financial decisions, ambiguous/long complex queries
 *              target latency: <8s
 *
 * Self-optimization:
 *   After each call, recordOutcome() updates success rate per category.
 *   If SLM success rate for a category drops below 70% → upgrade tier.
 *   If DEEP tier consistently succeeds for queries classified as STANDARD → downgrade.
 *   Thresholds stored in ai_routing_thresholds table, in-memory cached.
 */

import pool from '../../db/pgPool.js';
import featureExtractor from './feature-extractor.js';
import scoringModel from './scoring-model.js';

// ─── Tier Constants ───────────────────────────────────────────────────────────

export const TIERS = {
  REFLEX:   'reflex',    // SLM first
  STANDARD: 'standard',  // Groq Llama-70B
  DEEP:     'deep',      // iSHA BiMediX2 / GPT-4-class
};

// Tier → preferred provider name (maps to PROVIDERS in llm-provider.js)
export const TIER_PROVIDERS = {
  [TIERS.REFLEX]:   'local-slm',
  [TIERS.STANDARD]: 'groq',
  [TIERS.DEEP]:     'isha',
};

// ─── Signal Definitions ───────────────────────────────────────────────────────
//
// Signals are weightable evidence for each tier.
// Final score: Σ(weight × match) → pick highest tier with score > threshold.

const SIGNALS = {

  // ─── REFLEX signals ──────────────────────────────────────────────────────
  reflexPatterns: [
    // Yes/No questions
    { re: /^(is|are|was|were|do|does|did|can|could|should|will|has|have|had)\b/i,     weight: 20 },
    // Single-entity status lookups
    { re: /\b(status|balance|schedule|upcoming|next|last|my)\b/i,                     weight: 10 },
    // Booking / operational actions
    { re: /\b(book|schedule|cancel|reschedule|remind|confirm|check.?in|appointment)\b/i, weight: 25 },
    // Short form extraction
    { re: /\b(what is|when is|where is|who is|how many|give me|show me|list)\b/i,     weight: 15 },
    // Very short message (< 12 words)
    { fn: (msg) => msg.split(/\s+/).length < 12,                                       weight: 20 },
    // Pure number / code lookup
    { re: /\b(invoice|token|receipt|report|result)\s+#?\d+/i,                         weight: 25 },
  ],

  // ─── DEEP signals ────────────────────────────────────────────────────────
  deepPatterns: [
    // Clinical reasoning
    { re: /\b(differential diagnosis|ddx|treatment plan|clinical decision|prognosis|complication|contraindications?|evidence.?based|clinical guideline|protocol for|management of|management protocol|treatment protocol)\b/i, weight: 40 },
    // Acute critical events / cardiology emergencies
    { re: /\b(STEMI|NSTEMI|acute MI|myocardial infarction|septic shock|anaphylaxis|stroke protocol|cardiac arrest|critical care)\b/i, weight: 40 },
    // Drug management complexity
    { re: /\b(drug interaction|drug.?drug|dose adjustment|dosage adjustment|drug regimen|polypharmacy|renal dosing|hepatic dosing)\b/i, weight: 35 },
    // Multi-step planning
    { re: /\b(step.?by.?step|comprehensive|detailed plan|full analysis|break down|multi.?step|complex case|overall assessment)\b/i, weight: 35 },
    // Ambiguity / uncertainty
    { re: /\b(could be|might be|possibly|uncertain|unclear|consider|rule out|differential|despite|however|but also|alternatively)\b/i, weight: 20 },
    // Long message (> 60 words)
    { fn: (msg) => msg.split(/\s+/).length > 60,                                       weight: 25 },
    // Very long message (> 120 words)
    { fn: (msg) => msg.split(/\s+/).length > 120,                                      weight: 25 },
    // Financial / legal / insurance decisions
    { re: /\b(preauth|pre.?authorization|legal|liability|fraud|investigate|audit|critical finding|immediate action|red flag)\b/i, weight: 35 },
    // Cross-domain synthesis
    { re: /\b(correlate|integrat|overall picture|taking into account|considering all|holistic|comprehensive review)\b/i, weight: 30 },
    // Multiple medical conditions
    { fn: (msg) => {
        const conditions = msg.match(/\b(diabetes|hypertension|cardiac|renal|hepatic|pulmonary|neurological|oncology|sepsis|stroke|heart failure)\b/gi);
        return (conditions?.length || 0) >= 2;
      }, weight: 30 },
  ],

  // ─── STANDARD signals (default — used when neither REFLEX nor DEEP clearly wins) ──
  standardPatterns: [
    { re: /\b(explain|describe|analyze|compare|summarize|overview|understand|help me with|tell me about|information on)\b/i, weight: 10 },
    { re: /\b(symptom|medicine|drug|dose|side effect|allergy|lab result|report|scan|diagnosis)\b/i, weight: 10 },
    { re: /\b(patient|doctor|appointment|follow.?up|history|vitals|blood pressure|sugar|temperature)\b/i, weight: 5 },
  ],
};

// ─── Tier Thresholds (dynamic — loaded from DB, with in-memory defaults) ─────

const DEFAULT_THRESHOLDS = {
  reflex_min_score:   30,   // minimum weighted score for REFLEX (was 50 — too high for short factual Qs)
  deep_min_score:     60,   // minimum weighted score for DEEP
  slm_success_floor:  0.70, // if SLM success rate < this → upgrade REFLEX → STANDARD
  standard_success_floor: 0.75,
};

let _thresholds = { ...DEFAULT_THRESHOLDS };
let _thresholdsLoadedAt = 0;
const THRESHOLD_TTL = 5 * 60 * 1000;  // reload from DB every 5 min

async function getThresholds() {
  if (Date.now() - _thresholdsLoadedAt < THRESHOLD_TTL) return _thresholds;
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM ai_routing_thresholds WHERE is_active = true`
    );
    if (rows.length > 0) {
      const dbThresholds = {};
      for (const r of rows) dbThresholds[r.key] = parseFloat(r.value);
      _thresholds = { ...DEFAULT_THRESHOLDS, ...dbThresholds };
    }
    _thresholdsLoadedAt = Date.now();
  } catch { /* use defaults */ }
  return _thresholds;
}

// ─── DB Setup ─────────────────────────────────────────────────────────────────

let _dbReady = false;
async function ensureDb() {
  if (_dbReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_routing_decisions (
        id              BIGSERIAL PRIMARY KEY,
        decision_id     UUID NOT NULL DEFAULT gen_random_uuid(),
        user_id         INTEGER,
        query_length    INTEGER,
        tier_predicted  VARCHAR(20),
        tier_actual     VARCHAR(20),
        category        VARCHAR(50),
        provider_used   VARCHAR(50),
        success         BOOLEAN,
        tokens_used     INTEGER,
        latency_ms      INTEGER,
        score_reflex    INTEGER,
        score_deep      INTEGER,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_routing_decisions_tier
        ON ai_routing_decisions(tier_predicted, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_routing_thresholds (
        id         SERIAL PRIMARY KEY,
        key        VARCHAR(60) UNIQUE NOT NULL,
        value      NUMERIC NOT NULL,
        description TEXT,
        is_active   BOOLEAN DEFAULT true,
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Seed defaults if empty
    await pool.query(`
      INSERT INTO ai_routing_thresholds (key, value, description)
      VALUES
        ('reflex_min_score',      30,   'Min score to route to REFLEX tier'),
        ('deep_min_score',        60,   'Min score to route to DEEP tier'),
        ('slm_success_floor',     0.70, 'Min SLM success rate before upgrading REFLEX → STANDARD'),
        ('standard_success_floor', 0.75, 'Min standard success rate before upgrading STANDARD → DEEP')
      ON CONFLICT (key) DO NOTHING
    `);
    _dbReady = true;
  } catch (err) {
    console.error('[CogRouter] DB init error:', err.message);
  }
}

// ─── Classify ─────────────────────────────────────────────────────────────────

/**
 * Classify a message into a cognitive tier.
 * Pure CPU — zero LLM calls. Target latency: <5ms.
 *
 * @param {string} message - Raw user message
 * @param {Object} [opts]
 * @param {string[]} [opts.conversationHistory] - last few messages for context length
 * @param {string}  [opts.userId]
 * @returns {{
 *   tier: 'reflex'|'standard'|'deep',
 *   preferredProvider: string,
 *   scoreReflex: number,
 *   scoreDeep: number,
 *   category: string,
 *   signals: string[],
 *   decisionId: string,
 * }}
 */
export async function classify(message, opts = {}) {
  await ensureDb();
  const thresholds = await getThresholds();

  const msg   = message || '';
  const lower = msg.toLowerCase();
  let scoreReflex = 0;
  let scoreDeep   = 0;
  const signals   = [];

  // ── Score REFLEX ───────────────────────────────────────────────────────────
  for (const sig of SIGNALS.reflexPatterns) {
    let hit = false;
    if (sig.re)   hit = sig.re.test(msg);
    if (sig.fn)   hit = sig.fn(lower);
    if (hit) {
      scoreReflex += sig.weight;
      signals.push(`reflex:${sig.re?.source || 'fn'}(+${sig.weight})`);
    }
  }

  // ── Score DEEP ────────────────────────────────────────────────────────────
  for (const sig of SIGNALS.deepPatterns) {
    let hit = false;
    if (sig.re)   hit = sig.re.test(msg);
    if (sig.fn)   hit = sig.fn(lower);
    if (hit) {
      scoreDeep += sig.weight;
      signals.push(`deep:${sig.re?.source || 'fn'}(+${sig.weight})`);
    }
  }

  // ── Context amplifier — long conversation history leans STANDARD+ ─────────
  if ((opts.conversationHistory?.length || 0) >= 6) {
    scoreDeep += 15;
    signals.push('deep:long_conv(+15)');
  }

  // ── Secondary signal: scoring model (learnable weights) ──────────────────
  // Extract feature vector and run the learned scoring model as a tiebreaker.
  // If the scoring model strongly disagrees with the regex tier, blend it in.
  let scoringModelTier = null;
  let features = null;
  try {
    features = featureExtractor.extract(msg, { role: opts.role });
    const routeScores = await scoringModel.score(features);
    // Map scoring model recommendation to tier
    const routeToTier = { slm: TIERS.REFLEX, llm: TIERS.STANDARD, agent: TIERS.STANDARD, dag: TIERS.DEEP };
    scoringModelTier = routeToTier[routeScores.recommended] || TIERS.STANDARD;
    // If model is highly confident (>0.4 confidence gap) AND regex has low confidence, defer to model
    const regexConfidence = Math.max(scoreReflex, scoreDeep);
    if (routeScores.confidence > 0.40 && regexConfidence < 40) {
      const blendSignal = `scoring_model:${routeScores.recommended}(conf=${routeScores.confidence.toFixed(2)})`;
      signals.push(blendSignal);
      // Adjust scores to push toward model recommendation
      if (scoringModelTier === TIERS.REFLEX)  scoreReflex += 20;
      if (scoringModelTier === TIERS.DEEP)     scoreDeep   += 25;
    }
  } catch { /* scoring model is advisory — never block routing */ }

  // ── Decision: DEEP > STANDARD > REFLEX ────────────────────────────────────
  //    DEEP wins if its score ≥ threshold AND it beats reflex
  //    REFLEX wins if its score ≥ threshold AND deep score is low
  //    Otherwise STANDARD
  let tier;
  let category;

  if (scoreDeep >= thresholds.deep_min_score) {
    tier     = TIERS.DEEP;
    category = _categorize(lower, 'deep');
  } else if (scoreReflex >= thresholds.reflex_min_score && scoreDeep < 30) {
    tier     = TIERS.REFLEX;
    category = _categorize(lower, 'reflex');
  } else {
    tier     = TIERS.STANDARD;
    category = _categorize(lower, 'standard');
  }

  // ── Self-optimization: override if SLM success rate is too low for this category ──
  if (tier === TIERS.REFLEX) {
    const slmRate = await _getSuccessRate('reflex', category);
    if (slmRate !== null && slmRate < thresholds.slm_success_floor) {
      tier = TIERS.STANDARD;
      signals.push(`upgraded:slm_success_rate=${slmRate.toFixed(2)}<${thresholds.slm_success_floor}`);
    }
  }
  if (tier === TIERS.STANDARD) {
    const stdRate = await _getSuccessRate('standard', category);
    if (stdRate !== null && stdRate < thresholds.standard_success_floor) {
      tier = TIERS.DEEP;
      signals.push(`upgraded:std_success_rate=${stdRate.toFixed(2)}<${thresholds.standard_success_floor}`);
    }
  }

  const decisionId = `rd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Async log (fire and forget)
  _logDecision({
    decisionId,
    userId:       opts.userId,
    queryLength:  msg.length,
    tierPredicted: tier,
    category,
    scoreReflex,
    scoreDeep,
  }).catch(() => {});

  console.log(`[CogRouter] tier=${tier} category=${category} reflex=${scoreReflex} deep=${scoreDeep} scoringModel=${scoringModelTier} msg="${msg.substring(0, 60)}..."`);

  return {
    tier,
    preferredProvider: TIER_PROVIDERS[tier],
    scoreReflex,
    scoreDeep,
    category,
    signals,
    decisionId,
    features,  // feature vector for telemetry + weight updates
  };
}

// ─── Outcome Recording (self-optimization feed) ───────────────────────────────

/**
 * Record the outcome of a routing decision.
 * Called by llm-provider or orchestrator after response completes.
 *
 * @param {string} decisionId
 * @param {Object} outcome
 * @param {boolean} outcome.success      - did the response satisfy the query
 * @param {string}  outcome.tierActual   - tier that actually served the response
 * @param {string}  outcome.providerUsed
 * @param {number}  outcome.tokensUsed
 * @param {number}  outcome.latencyMs
 */
export async function recordOutcome(decisionId, outcome) {
  if (!decisionId) return;
  try {
    await pool.query(
      `UPDATE ai_routing_decisions
          SET success       = $1,
              tier_actual   = $2,
              provider_used = $3,
              tokens_used   = $4,
              latency_ms    = $5
        WHERE decision_id = $6`,
      [
        outcome.success ?? true,
        outcome.tierActual,
        outcome.providerUsed,
        outcome.tokensUsed,
        outcome.latencyMs,
        decisionId,
      ]
    );
  } catch { /* non-critical */ }
}

// ─── Routing Stats API ────────────────────────────────────────────────────────

/**
 * Returns routing efficiency stats for the admin dashboard.
 * Shows tier distribution, SLM utilisation rate, cost reduction estimate.
 */
export async function getRoutingStats(days = 7) {
  try {
    const { rows } = await pool.query(`
      SELECT
        tier_predicted,
        COUNT(*) AS total,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successes,
        ROUND(AVG(tokens_used))   AS avg_tokens,
        ROUND(AVG(latency_ms))    AS avg_latency_ms
      FROM ai_routing_decisions
      WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY tier_predicted
      ORDER BY tier_predicted
    `, [days]);

    const total = rows.reduce((s, r) => s + parseInt(r.total), 0);
    const reflexCount = parseInt(rows.find(r => r.tier_predicted === 'reflex')?.total || 0);
    const standardCount = parseInt(rows.find(r => r.tier_predicted === 'standard')?.total || 0);
    const deepCount   = parseInt(rows.find(r => r.tier_predicted === 'deep')?.total || 0);

    // Rough cost normalisation: REFLEX ≈ $0, STANDARD ≈ $0.0006/1K tokens, DEEP ≈ $0.006/1K tokens
    const costReductionPct = total > 0
      ? Math.round(((reflexCount * 0.9) + (standardCount * 0.3)) / total * 100)
      : 0;

    return {
      days,
      total,
      distribution: { reflex: reflexCount, standard: standardCount, deep: deepCount },
      slmUtilisationPct: total > 0 ? Math.round(reflexCount / total * 100) : 0,
      estimatedCostReductionPct: costReductionPct,
      tiers: rows,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Threshold Admin API ──────────────────────────────────────────────────────

export async function updateThreshold(key, value) {
  await pool.query(
    `INSERT INTO ai_routing_thresholds (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
  _thresholdsLoadedAt = 0; // invalidate cache
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _categorize(lower, tier) {
  if (/\b(diagnosis|symptom|clinical|treatment|drug|medicine|dose|allergy|lab)\b/.test(lower)) return 'clinical';
  if (/\b(appointment|book|schedule|cancel|slot|reminder)\b/.test(lower))                      return 'appointment';
  if (/\b(insurance|claim|tpa|preauth|policy|billing|invoice)\b/.test(lower))                  return 'insurance';
  if (/\b(report|analytics|trend|dashboard|statistics)\b/.test(lower))                         return 'analytics';
  if (/\b(emergency|urgent|critical|ambulance|cardiac|stroke|seizure)\b/.test(lower))          return 'emergency';
  return tier === 'deep' ? 'complex_reasoning' : 'general';
}

// Rolling 24h success rate for a tier+category pair (for self-optimisation)
const _rateCache = new Map();
const _rateTTL   = 10 * 60 * 1000;  // 10 min

async function _getSuccessRate(tier, category) {
  const key = `${tier}:${category}`;
  const cached = _rateCache.get(key);
  if (cached && Date.now() - cached.at < _rateTTL) return cached.rate;

  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successes
      FROM ai_routing_decisions
      WHERE tier_predicted = $1 AND category = $2
        AND created_at > NOW() - INTERVAL '24 hours'
        AND success IS NOT NULL
    `, [tier, category]);

    const total = parseInt(rows[0].total || 0);
    if (total < 10) return null;  // not enough data

    const rate = parseInt(rows[0].successes) / total;
    _rateCache.set(key, { rate, at: Date.now() });
    return rate;
  } catch {
    return null;
  }
}

async function _logDecision({ decisionId, userId, queryLength, tierPredicted, category, scoreReflex, scoreDeep }) {
  await pool.query(
    `INSERT INTO ai_routing_decisions
       (decision_id, user_id, query_length, tier_predicted, category, score_reflex, score_deep)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [decisionId, userId, queryLength, tierPredicted, category, scoreReflex, scoreDeep]
  );
}

export default { classify, recordOutcome, getRoutingStats, updateThreshold, TIERS, TIER_PROVIDERS };
