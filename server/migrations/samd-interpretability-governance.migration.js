/**
 * Migration: SaMD Interpretability & Governance Schema
 * ======================================================
 * Adds tables and columns required for:
 *   - SHAP/LIME interpretability storage on AI outputs
 *   - Model governance (change control log, model cards)
 *   - Drift monitoring
 *   - Quality gate audit log
 *
 * Required for SaMD qualification under FDA AI/ML Action Plan (2021),
 * EU MDR Annex I §17, IEC 82304-1, ISO 14971.
 *
 * Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────────────
    // 1. Interpretability columns on ai_health_risk_scores
    //    Added with ALTER TABLE … ADD COLUMN IF NOT EXISTS (pg ≥ 9.6)
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE ai_health_risk_scores
        ADD COLUMN IF NOT EXISTS shap_values          JSONB,
        ADD COLUMN IF NOT EXISTS feature_attributions JSONB,
        ADD COLUMN IF NOT EXISTS counterfactuals      JSONB,
        ADD COLUMN IF NOT EXISTS confidence_score     FLOAT CHECK (confidence_score BETWEEN 0 AND 1),
        ADD COLUMN IF NOT EXISTS data_completeness    FLOAT CHECK (data_completeness BETWEEN 0 AND 100),
        ADD COLUMN IF NOT EXISTS model_card_version   TEXT DEFAULT 'v1.0'
    `);
    console.log('✅ ai_health_risk_scores: interpretability columns added');

    // ─────────────────────────────────────────────────────────────────────
    // 2. Model Change Control Log (PCCP audit trail)
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_model_change_log (
        id               SERIAL PRIMARY KEY,
        model_component  TEXT    NOT NULL,
        change_type      TEXT    NOT NULL
                           CHECK (change_type IN (
                             'prompt_update', 'weight_adjustment', 'threshold_change',
                             'tool_selection', 'routing_update', 'model_swap', 'feature_addition'
                           )),
        change_description TEXT,
        previous_config  JSONB,
        new_config       JSONB,
        rationale        TEXT,
        proposed_by      TEXT    DEFAULT 'self-learning-pipeline',
        approved_by      TEXT,
        approved_at      TIMESTAMPTZ,
        review_notes     TEXT,
        status           TEXT    NOT NULL DEFAULT 'pending_review'
                           CHECK (status IN ('pending_review', 'approved', 'rejected', 'applied', 'rolled_back')),
        risk_assessment  TEXT    NOT NULL DEFAULT 'moderate'
                           CHECK (risk_assessment IN ('low', 'moderate', 'high')),
        proposed_at      TIMESTAMPTZ DEFAULT NOW(),
        applied_at       TIMESTAMPTZ,
        rolled_back_at   TIMESTAMPTZ,
        rollback_reason  TEXT
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_model_change_log_status    ON ai_model_change_log (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_model_change_log_component ON ai_model_change_log (model_component)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_model_change_log_proposed  ON ai_model_change_log (proposed_at DESC)`);
    console.log('✅ ai_model_change_log: created');

    // ─────────────────────────────────────────────────────────────────────
    // 3. Model Cards Registry
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_model_cards (
        id                       SERIAL PRIMARY KEY,
        component_name           TEXT    UNIQUE NOT NULL,
        version                  TEXT    NOT NULL,
        regulatory_class         TEXT,
        intended_use             TEXT,
        known_limitations        JSONB,
        performance_metrics      JSONB,
        demographic_performance  JSONB,
        change_control_plan      TEXT,
        last_validated_at        TIMESTAMPTZ,
        card_data                JSONB,  -- full model card as JSON
        created_at               TIMESTAMPTZ DEFAULT NOW(),
        updated_at               TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ ai_model_cards: created');

    // ─────────────────────────────────────────────────────────────────────
    // 4. Drift Monitor Log
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_drift_monitor (
        id                     SERIAL PRIMARY KEY,
        feature_name           TEXT    NOT NULL,
        psi_score              FLOAT,
        drift_detected         BOOLEAN DEFAULT FALSE,
        drift_level            TEXT    DEFAULT 'none' CHECK (drift_level IN ('none', 'minor', 'major')),
        baseline_distribution  JSONB,
        current_distribution   JSONB,
        sample_size_baseline   INT,
        sample_size_current    INT,
        alert_sent             BOOLEAN DEFAULT FALSE,
        alert_sent_at          TIMESTAMPTZ,
        resolved_at            TIMESTAMPTZ,
        resolution_note        TEXT,
        measured_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_drift_monitor_feature   ON ai_drift_monitor (feature_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_drift_monitor_measured  ON ai_drift_monitor (measured_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_drift_monitor_alert     ON ai_drift_monitor (drift_detected) WHERE drift_detected = true`);
    console.log('✅ ai_drift_monitor: created');

    // ─────────────────────────────────────────────────────────────────────
    // 5. Quality Gate Audit Log
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_quality_gate_log (
        id               SERIAL PRIMARY KEY,
        gate_type        TEXT    NOT NULL,
        patient_id       INT     REFERENCES patients(id) ON DELETE SET NULL,
        passed           BOOLEAN NOT NULL,
        severity         TEXT    NOT NULL CHECK (severity IN ('pass', 'review', 'warning', 'blocked')),
        blockers         JSONB,
        warnings         JSONB,
        required_actions JSONB,
        context          JSONB,
        checked_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_quality_gate_patient   ON ai_quality_gate_log (patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quality_gate_type      ON ai_quality_gate_log (gate_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quality_gate_blocked   ON ai_quality_gate_log (passed) WHERE passed = false`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_quality_gate_checked   ON ai_quality_gate_log (checked_at DESC)`);
    console.log('✅ ai_quality_gate_log: created');

    // ─────────────────────────────────────────────────────────────────────
    // 6. Demographic Parity Snapshots
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_demographic_parity_log (
        id              SERIAL PRIMARY KEY,
        snapshot_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
        age_group       TEXT,
        gender          TEXT,
        patient_count   INT,
        avg_risk_score  FLOAT,
        std_risk_score  FLOAT,
        avg_cardio      FLOAT,
        avg_diabetes    FLOAT,
        disparity_flag  BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (snapshot_date, age_group, gender)
      )
    `);
    console.log('✅ ai_demographic_parity_log: created');

    // ─────────────────────────────────────────────────────────────────────
    // 7. Triage Interpretation Log (LIME results per triage event)
    // ─────────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_triage_interpretations (
        id               SERIAL PRIMARY KEY,
        patient_id       INT     REFERENCES patients(id) ON DELETE SET NULL,
        esi_level        INT     CHECK (esi_level BETWEEN 1 AND 5),
        symptoms_hash    TEXT,
        lime_attribution JSONB,
        confidence_score FLOAT,
        quality_gate     JSONB,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_triage_interp_patient ON ai_triage_interpretations (patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_triage_interp_date    ON ai_triage_interpretations (created_at DESC)`);
    console.log('✅ ai_triage_interpretations: created');

    await client.query('COMMIT');
    console.log('🎉 SaMD Interpretability & Governance migration complete');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove new tables (preserves ai_health_risk_scores — only removes added columns)
    await client.query(`DROP TABLE IF EXISTS ai_triage_interpretations CASCADE`);
    await client.query(`DROP TABLE IF EXISTS ai_demographic_parity_log CASCADE`);
    await client.query(`DROP TABLE IF EXISTS ai_quality_gate_log CASCADE`);
    await client.query(`DROP TABLE IF EXISTS ai_drift_monitor CASCADE`);
    await client.query(`DROP TABLE IF EXISTS ai_model_cards CASCADE`);
    await client.query(`DROP TABLE IF EXISTS ai_model_change_log CASCADE`);

    await client.query(`
      ALTER TABLE ai_health_risk_scores
        DROP COLUMN IF EXISTS shap_values,
        DROP COLUMN IF EXISTS feature_attributions,
        DROP COLUMN IF EXISTS counterfactuals,
        DROP COLUMN IF EXISTS confidence_score,
        DROP COLUMN IF EXISTS data_completeness,
        DROP COLUMN IF EXISTS model_card_version
    `);

    await client.query('COMMIT');
    console.log('✅ SaMD migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node samd-interpretability-governance.migration.js
if (process.argv[1].includes('samd-interpretability')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
