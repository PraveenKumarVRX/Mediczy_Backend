/**
 * A/B Testing Service
 * ====================
 * Manages prompt experiments, assigns users deterministically to arms,
 * records outcomes, and computes statistical significance.
 *
 * Assignment rule (from plan §13):
 *   arm = (userId % 100) < experiment.rollout_pct ? 'variant' : 'control'
 *
 * Statistical test: two-proportion z-test (p < significance_target, default 0.05)
 * Minimum sample: 200 per arm before conclusion.
 */

import pool from '../db/pgPool.js';
import { redisCache } from '../config/redis-hardened.js';

const CACHE_TTL_ASSIGNMENT = 7 * 24 * 3600; // 7 days (seconds)
const CACHE_TTL_EXPERIMENT  = 300;           // 5 minutes

// ─── Statistical helpers ──────────────────────────────────────────────────────

/**
 * Two-proportion z-test.
 * Returns { z, p, significant }.
 */
function zTestTwoProportions(successesA, nA, successesB, nB) {
  if (nA < 1 || nB < 1) return { z: 0, p: 1, significant: false };
  const pA = successesA / nA;
  const pB = successesB / nB;
  const pPool = (successesA + successesB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  if (se === 0) return { z: 0, p: 1, significant: false };
  const z = (pA - pB) / se;
  // Approximation of two-tailed p-value from |z| using the error function.
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { z: parseFloat(z.toFixed(4)), p: parseFloat(p.toFixed(4)), significant: p < 0.05 };
}

// Standard normal CDF approximation (Abramowitz & Stegun)
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989422820 * Math.exp(-0.5 * x * x);
  const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return 1 - d * poly;
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

async function cacheGet(key) {
  try {
    const rc = redisCache();
    if (!rc) return null;
    const v = await rc.get(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

async function cacheSet(key, value, ttl) {
  try {
    const rc = redisCache();
    if (!rc) return;
    await rc.set(key, JSON.stringify(value), { EX: ttl });
  } catch { /* ignore */ }
}

async function cacheDel(key) {
  try {
    const rc = redisCache();
    if (rc) await rc.del(key);
  } catch { /* ignore */ }
}

// ─── Core service ─────────────────────────────────────────────────────────────

class AbTestingService {
  // ── Experiment CRUD ──────────────────────────────────────────────────────────

  async createExperiment({ name, description, component, variantPromptId, rolloutPct = 10, minSamples = 200, createdBy = 'system' }) {
    const { rows: [exp] } = await pool.query(`
      INSERT INTO ai_experiments
        (name, description, component, variant_prompt_id, rollout_pct, min_samples, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, description, component, variantPromptId, rolloutPct, minSamples, createdBy]);
    return exp;
  }

  async listExperiments({ status } = {}) {
    const cacheKey = `experiments:list:${status || 'all'}`;
    const cached   = await cacheGet(cacheKey);
    if (cached) return cached;

    const cond   = status ? `WHERE e.status = $1` : '';
    const params = status ? [status] : [];

    const { rows } = await pool.query(`
      SELECT
        e.*,
        (SELECT COUNT(*) FROM ai_experiment_assignments WHERE experiment_id = e.id AND arm='variant') AS variant_n,
        (SELECT COUNT(*) FROM ai_experiment_assignments WHERE experiment_id = e.id AND arm='control') AS control_n
      FROM ai_experiments e
      ${cond}
      ORDER BY e.started_at DESC
    `, params);

    await cacheSet(cacheKey, rows, CACHE_TTL_EXPERIMENT);
    return rows;
  }

  async getExperiment(id) {
    const cacheKey = `experiment:${id}`;
    const cached   = await cacheGet(cacheKey);
    if (cached) return cached;

    const { rows: [exp] } = await pool.query(
      `SELECT * FROM ai_experiments WHERE id = $1`, [id]
    );
    if (exp) await cacheSet(cacheKey, exp, CACHE_TTL_EXPERIMENT);
    return exp ?? null;
  }

  async pauseExperiment(id) {
    await pool.query(`UPDATE ai_experiments SET status='paused' WHERE id=$1`, [id]);
    await cacheDel(`experiment:${id}`);
    await cacheDel(`experiments:list:running`);
  }

  async resumeExperiment(id) {
    await pool.query(`UPDATE ai_experiments SET status='running' WHERE id=$1`, [id]);
    await cacheDel(`experiment:${id}`);
  }

  // ── User assignment (deterministic, Redis-cached) ────────────────────────────

  /**
   * Get or create a user's arm assignment for a given component's active experiment.
   * Returns { arm, experimentId, promptVersionId } or null if no active experiment.
   */
  async getAssignment(userId, component) {
    // Find active experiment for this component
    const cacheKey = `active_exp:${component}`;
    let exp = await cacheGet(cacheKey);
    if (!exp) {
      const { rows } = await pool.query(`
        SELECT * FROM ai_experiments
        WHERE  component = $1
          AND  status    = 'running'
        ORDER  BY started_at DESC
        LIMIT  1
      `, [component]);
      exp = rows[0] ?? null;
      if (exp) await cacheSet(cacheKey, exp, CACHE_TTL_EXPERIMENT);
    }

    if (!exp) return null;

    // Check for existing assignment (Redis first)
    const assignKey = `experiment:${exp.id}:user:${userId}`;
    const cached    = await cacheGet(assignKey);
    if (cached) return cached;

    // Deterministic assignment based on userId hash
    const numericId = parseInt(String(userId).replace(/\D/g, '') || '0', 10) || 0;
    const arm       = (numericId % 100) < exp.rollout_pct ? 'variant' : 'control';

    // Persist to DB (upsert for idempotency)
    await pool.query(`
      INSERT INTO ai_experiment_assignments (experiment_id, user_id, arm)
      VALUES ($1, $2, $3)
      ON CONFLICT (experiment_id, user_id) DO NOTHING
    `, [exp.id, userId.toString(), arm]);

    const result = {
      arm,
      experimentId:    exp.id,
      variantPromptId: exp.variant_prompt_id,
      component:       exp.component,
    };

    await cacheSet(assignKey, result, CACHE_TTL_ASSIGNMENT);
    return result;
  }

  // ── Outcome recording ────────────────────────────────────────────────────────

  /**
   * Record an interaction outcome for a user's experiment arm.
   * outcome: 0.0 (bad) – 1.0 (good)
   */
  async recordOutcome(userId, experimentId, outcome, outcomeType = 'rating') {
    await pool.query(`
      UPDATE ai_experiment_assignments
      SET    outcome      = $3,
             outcome_type = $4,
             outcome_at   = NOW()
      WHERE  experiment_id = $2
        AND  user_id       = $1
        AND  outcome IS NULL
    `, [userId.toString(), experimentId, outcome, outcomeType]);
  }

  // ── Statistical analysis ──────────────────────────────────────────────────────

  async getResults(experimentId) {
    const exp = await this.getExperiment(experimentId);
    if (!exp) throw new Error('Experiment not found');

    const { rows } = await pool.query(`
      SELECT
        arm,
        COUNT(*)                                      AS n,
        COUNT(*) FILTER (WHERE outcome IS NOT NULL)   AS n_outcomes,
        AVG(outcome)                                  AS mean_outcome,
        STDDEV(outcome)                               AS std_outcome,
        COUNT(*) FILTER (WHERE outcome >= 0.6)        AS successes
      FROM ai_experiment_assignments
      WHERE experiment_id = $1
      GROUP BY arm
    `, [experimentId]);

    const control = rows.find(r => r.arm === 'control') ?? {};
    const variant = rows.find(r => r.arm === 'variant') ?? {};

    const stats = zTestTwoProportions(
      parseInt(variant.successes ?? 0),
      parseInt(variant.n_outcomes ?? 0),
      parseInt(control.successes ?? 0),
      parseInt(control.n_outcomes ?? 0),
    );

    const hasMinSamples =
      parseInt(variant.n_outcomes ?? 0) >= exp.min_samples &&
      parseInt(control.n_outcomes ?? 0) >= exp.min_samples;

    return {
      experiment:      exp,
      control:         { ...control, n: parseInt(control.n ?? 0) },
      variant:         { ...variant, n: parseInt(variant.n ?? 0) },
      statistics:      stats,
      has_min_samples: hasMinSamples,
      recommendation:
        !hasMinSamples ? `Need ${exp.min_samples} outcomes per arm; collect more data`
        : stats.significant && parseFloat(variant.mean_outcome ?? 0) > parseFloat(control.mean_outcome ?? 0)
          ? 'Variant wins — promote to 100% and conclude'
          : stats.significant
          ? 'Control wins — roll back variant'
          : 'No significant difference yet — continue experiment',
    };
  }

  // ── Conclude experiment ───────────────────────────────────────────────────────

  async concludeExperiment(id, winningArm) {
    await pool.query(`
      UPDATE ai_experiments
      SET    status = 'concluded', concluded_arm = $2, concluded_at = NOW()
      WHERE  id = $1
    `, [id, winningArm]);
    await cacheDel(`experiment:${id}`);
    await cacheDel(`experiments:list:running`);
  }
}

const abTestingService = new AbTestingService();
export default abTestingService;
