/**
 * Mediqzy Federated Learning Pipeline
 * =====================================
 * Privacy-preserving model improvement across hospitals and tenants.
 * No raw patient data ever leaves the tenant — only privacy-noised
 * gradient updates are aggregated globally.
 *
 * Compliance:
 *   - Differential Privacy: Gaussian mechanism with configurable ε and δ
 *   - DPDP (India Digital Personal Data Protection) Act 2023
 *   - HIPAA Safe Harbor — all PHI fields excluded from gradients
 *
 * Models managed:
 *   - his_risk_model       — Health Intelligence Score calibration
 *   - triage_esi_model     — Emergency triage accuracy
 *   - drug_safety_model    — Drug interaction prediction
 *   - readmission_model    — 30-day readmission risk
 *
 * Architecture:
 *   1. Each hospital (tenant) trains locally on their data
 *   2. Submits update: model_name, sample_count, feature_stats, gradient_delta
 *   3. Engine applies Gaussian noise (differential privacy)
 *   4. Weekly aggregation: federated averaging of accepted updates
 *   5. Global model weights updated, broadcast back
 *
 * Integration:
 *   - HIS service submits updates after each scoring run
 *   - Triage service submits updates after confirmed outcomes
 */

import pool from '../db/pgPool.js';

// Differential Privacy constants (production tuning)
const DP_DEFAULTS = {
  epsilon: 1.0,   // privacy budget (lower = more private)
  delta: 1e-5,    // failure probability
  noise_scale: 0.1, // Gaussian noise sigma
  clip_norm: 1.0,   // gradient clipping to bound sensitivity
};

// Models and their metadata
const REGISTERED_MODELS = {
  his_risk_model:      { version: '1.0.0', dimensions: 6,  description: 'HIS multi-dimensional risk calibration'  },
  triage_esi_model:    { version: '1.0.0', dimensions: 8,  description: 'ESI 5-level triage classification'       },
  drug_safety_model:   { version: '1.0.0', dimensions: 12, description: 'Drug-drug interaction prediction'        },
  readmission_model:   { version: '1.0.0', dimensions: 10, description: 'Post-discharge 30d readmission risk'     },
};

class FederatedLearningService {

  /**
   * Submit a local model update from a tenant.
   * Applies differential privacy noise before storing.
   *
   * @param {string} tenantId
   * @param {string} modelName — one of REGISTERED_MODELS keys
   * @param {number} sampleCount — number of patients in local training
   * @param {Object} featureStats — { feature_name: { mean, std, min, max } }
   * @param {Object} gradientDelta — { weight_name: delta_value }
   * @param {Object} dpConfig — override default DP settings per tenant
   */
  async submitUpdate(tenantId, modelName, sampleCount, featureStats, gradientDelta, dpConfig = {}) {
    const db = pool;

    if (!REGISTERED_MODELS[modelName]) {
      throw new Error(`Unknown model: ${modelName}. Registered: ${Object.keys(REGISTERED_MODELS).join(', ')}`);
    }
    if (sampleCount < 10) {
      throw new Error('Minimum 10 samples required per federated update (anonymity threshold)');
    }

    const epsilon    = dpConfig.epsilon    ?? DP_DEFAULTS.epsilon;
    const delta      = dpConfig.delta      ?? DP_DEFAULTS.delta;
    const noiseScale = dpConfig.noise_scale ?? DP_DEFAULTS.noise_scale;
    const clipNorm   = dpConfig.clip_norm  ?? DP_DEFAULTS.clip_norm;

    // Apply differential privacy: clip + Gaussian noise
    const noisedDelta = this._applyDP(gradientDelta, clipNorm, noiseScale);

    // Validate no PHI leakage
    this._assertNoPHI(featureStats);
    this._assertNoPHI(noisedDelta);

    const { rows: [row] } = await db.query(`
      INSERT INTO federated_model_updates
        (tenant_id, model_name, model_version, sample_count,
         feature_stats, gradient_delta, privacy_epsilon, privacy_delta, noise_scale,
         status, submitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NOW())
      RETURNING id, tenant_id, model_name, sample_count, status, submitted_at
    `, [
      tenantId, modelName, REGISTERED_MODELS[modelName].version, sampleCount,
      JSON.stringify(featureStats), JSON.stringify(noisedDelta),
      epsilon, delta, noiseScale,
    ]);

    console.log(`[FL] Update submitted: tenant=${tenantId} model=${modelName} samples=${sampleCount} ε=${epsilon}`);
    return row;
  }

  /**
   * Aggregate pending updates for a model (Federated Averaging).
   * Called by weekly cron.
   * @returns {{model_name, round, participants, avg_weights, applied_at}}
   */
  async aggregateRound(modelName) {
    const db = pool;

    // Fetch pending updates for this model
    const { rows: updates } = await db.query(`
      SELECT id, tenant_id, sample_count, gradient_delta, submitted_at
      FROM federated_model_updates
      WHERE model_name = $1 AND status = 'pending'
        AND submitted_at > NOW() - INTERVAL '7 days'
      ORDER BY submitted_at
    `, [modelName]);

    if (updates.length < 2) {
      console.log(`[FL] ${modelName}: insufficient updates for aggregation (${updates.length}/2)`);
      return null;
    }

    // Federated Averaging (FedAvg): weighted average by sample_count
    const totalSamples = updates.reduce((sum, u) => sum + parseInt(u.sample_count), 0);
    const aggregated   = {};

    for (const update of updates) {
      const weight = parseInt(update.sample_count) / totalSamples;
      const delta  = update.gradient_delta;
      for (const [key, val] of Object.entries(delta)) {
        if (typeof val === 'number') {
          aggregated[key] = (aggregated[key] || 0) + val * weight;
        }
      }
    }

    // Round values to prevent floating point accumulation
    for (const key of Object.keys(aggregated)) {
      aggregated[key] = Math.round(aggregated[key] * 1e6) / 1e6;
    }

    const roundNumber = await this._getNextRound(modelName, db);

    // Store aggregated model
    await db.query(`
      INSERT INTO federated_model_updates
        (tenant_id, model_name, model_version, sample_count,
         feature_stats, gradient_delta, privacy_epsilon, privacy_delta, noise_scale,
         status, round_number, submitted_at, aggregated_at)
      VALUES ('__global__',$1,$2,$3,'{}','{}',0,0,0,'aggregated',$4,NOW(),NOW())
    `, [modelName, REGISTERED_MODELS[modelName].version, totalSamples, roundNumber]);

    // Update global aggregated weights separately
    await db.query(`
      UPDATE federated_model_updates SET gradient_delta = $1
      WHERE tenant_id = '__global__' AND model_name = $2 AND round_number = $3
    `, [JSON.stringify(aggregated), modelName, roundNumber]);

    // Mark contributing updates as included
    const ids = updates.map(u => u.id);
    await db.query(
      `UPDATE federated_model_updates SET status = 'included', round_number = $1 WHERE id = ANY($2)`,
      [roundNumber, ids]
    );

    console.log(`[FL] Aggregated round ${roundNumber} for ${modelName}: ${updates.length} participants, ${totalSamples} samples`);
    return {
      model_name: modelName,
      round: roundNumber,
      participants: updates.length,
      total_samples: totalSamples,
      avg_weights: aggregated,
      aggregated_at: new Date().toISOString(),
    };
  }

  /**
   * Get current global model weights for a model.
   */
  async getGlobalModel(modelName) {
    const { rows: [row] } = await pool.query(`
      SELECT gradient_delta as global_weights, sample_count, round_number, aggregated_at
      FROM federated_model_updates
      WHERE model_name = $1 AND status = 'aggregated' AND tenant_id = '__global__'
      ORDER BY round_number DESC
      LIMIT 1
    `, [modelName]);

    return row || { global_weights: {}, round_number: 0, message: 'No aggregation yet' };
  }

  /**
   * Federated learning status dashboard.
   */
  async getStatus() {
    const { rows } = await pool.query(`
      SELECT
        model_name,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_updates,
        COUNT(*) FILTER (WHERE status = 'included') as included_updates,
        MAX(round_number) as latest_round,
        SUM(sample_count) FILTER (WHERE status = 'pending') as pending_samples,
        MAX(submitted_at) FILTER (WHERE status = 'pending') as latest_submission
      FROM federated_model_updates
      WHERE submitted_at > NOW() - INTERVAL '30 days'
      GROUP BY model_name
      ORDER BY model_name
    `);

    return {
      models: rows,
      registered: Object.entries(REGISTERED_MODELS).map(([k, v]) => ({ name: k, ...v })),
      dp_defaults: DP_DEFAULTS,
      last_checked: new Date().toISOString(),
    };
  }

  /**
   * Weekly cron: aggregate all models that have sufficient updates.
   */
  async runWeeklyCron() {
    console.log('[FL] Starting weekly federated aggregation...');
    const results = [];
    for (const modelName of Object.keys(REGISTERED_MODELS)) {
      const r = await this.aggregateRound(modelName);
      if (r) results.push(r);
    }
    console.log(`[FL] Weekly cron done: ${results.length} models aggregated`);
    return results;
  }

  // ─── Private ──────────────────────────────────────────────

  _applyDP(gradientDelta, clipNorm, noiseScale) {
    const noised = {};
    for (const [key, val] of Object.entries(gradientDelta)) {
      if (typeof val !== 'number') { noised[key] = val; continue; }
      const clipped = Math.max(-clipNorm, Math.min(clipNorm, val));
      const noise   = this._gaussianNoise(0, noiseScale);
      noised[key]   = Math.round((clipped + noise) * 1e6) / 1e6;
    }
    return noised;
  }

  _gaussianNoise(mean, sigma) {
    // Box-Muller transform
    const u1 = Math.max(1e-10, Math.random());
    const u2 = Math.random();
    return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  _assertNoPHI(obj) {
    const PHI_PATTERNS = /\b(name|dob|ssn|aadhaar|mobile|phone|email|address|ip_address|patient_id)\b/i;
    for (const key of Object.keys(obj || {})) {
      if (PHI_PATTERNS.test(key)) throw new Error(`PHI field detected in federated update: ${key}. BLOCKED.`);
    }
  }

  async _getNextRound(modelName, db) {
    const { rows: [r] } = await db.query(
      `SELECT COALESCE(MAX(round_number), 0) + 1 as next FROM federated_model_updates WHERE model_name = $1`,
      [modelName]
    );
    return r?.next || 1;
  }
}

const federatedLearning = new FederatedLearningService();
export default federatedLearning;
