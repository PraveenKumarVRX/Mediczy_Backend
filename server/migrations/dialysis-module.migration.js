/**
 * Migration: Dialysis Module — vascular access, session parameters,
 * medication administration, chair/schedule management
 * =========================================================================
 * Extends the generic care_series/care_series_session shell (already
 * shipped) with dialysis-specific structure. This is deliberately a DATA
 * CAPTURE layer, not a clinical-decision layer: it gives clinicians
 * structured fields to record what they observed/did (vascular access
 * type, UF achieved, medications given), the same way a paper dialysis
 * flowsheet would. It does not compute recommended UF rates, does not
 * suggest doses, and carries no red-flag/threshold logic of its own — that
 * content lives in the Clinical Knowledge Fabric and requires
 * medical-director approval before it's live, per the platform's existing
 * governance rule. Nothing here changes that.
 *
 * Medication administration here is intentionally a separate, simpler
 * table from the inpatient eMAR (medication_orders/medication_administrations),
 * not a retrofit of it — the inpatient eMAR's 5-rights safety engine is
 * hard-keyed to ip_admissions, and most dialysis sessions are outpatient
 * recurring visits with no admission record. Whether an inpatient dialysis
 * session should instead route through the full eMAR is a separate design
 * decision, not made here.
 *
 * Safe to run multiple times (IF NOT EXISTS). Depends on care_series
 * already existing (care-series.migration.js) and hospital_branch already
 * existing (multi-branch-architecture.migration.js) — branch_id is
 * nullable, so this still works fine for tenants with no branches set up.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dialysis_session_detail (
        id                     SERIAL PRIMARY KEY,
        session_id             INTEGER NOT NULL UNIQUE REFERENCES care_series_session(id),
        vascular_access_type   TEXT CHECK (vascular_access_type IN ('fistula', 'graft', 'catheter')),
        vascular_access_site   TEXT,
        access_site_condition  TEXT,
        pre_session_weight_kg  NUMERIC(6,2),
        post_session_weight_kg NUMERIC(6,2),
        target_uf_volume_ml    NUMERIC(8,2),
        actual_uf_volume_ml    NUMERIC(8,2),
        uf_rate_ml_per_hr      NUMERIC(8,2),
        blood_flow_rate_ml_min NUMERIC(6,2),
        dialysate_flow_rate_ml_min NUMERIC(6,2),
        dialysate_sodium_mmol  NUMERIC(5,2),
        dialysate_potassium_mmol NUMERIC(5,2),
        dialysate_calcium_mmol NUMERIC(5,2),
        dialysate_temperature_c NUMERIC(4,1),
        pre_session_bp_systolic  INTEGER,
        pre_session_bp_diastolic INTEGER,
        post_session_bp_systolic  INTEGER,
        post_session_bp_diastolic INTEGER,
        intra_session_readings JSONB DEFAULT '[]'::jsonb,
        complications          TEXT,
        recorded_by            TEXT,
        recorded_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ dialysis_session_detail: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dialysis_medication_administration (
        id               SERIAL PRIMARY KEY,
        session_id       INTEGER NOT NULL REFERENCES care_series_session(id),
        medication       TEXT NOT NULL,
        dose             NUMERIC(8,2),
        dose_unit        TEXT,
        route            TEXT,
        administered_at  TIMESTAMPTZ DEFAULT NOW(),
        administered_by  TEXT,
        notes            TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dialysis_med_admin_session ON dialysis_medication_administration (session_id)`);
    console.log('✅ dialysis_medication_administration: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dialysis_chair (
        id           SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        branch_id    INTEGER REFERENCES hospital_branch(id),
        chair_number TEXT NOT NULL,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (organization_id, chair_number)
      )
    `);
    console.log('✅ dialysis_chair: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dialysis_recurring_schedule (
        id                   SERIAL PRIMARY KEY,
        patient_id           INTEGER NOT NULL,
        organization_id      INTEGER NOT NULL,
        series_id            INTEGER REFERENCES care_series(id),
        chair_id             INTEGER REFERENCES dialysis_chair(id),
        days_of_week         TEXT[] NOT NULL,
        shift                TEXT CHECK (shift IN ('morning', 'afternoon', 'evening')),
        session_duration_minutes INTEGER NOT NULL DEFAULT 240,
        start_date           DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date             DATE,
        status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discontinued')),
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dialysis_schedule_patient ON dialysis_recurring_schedule (patient_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dialysis_schedule_chair ON dialysis_recurring_schedule (chair_id, status)`);
    console.log('✅ dialysis_recurring_schedule: created');

    await client.query('COMMIT');
    console.log('✅ Dialysis module migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS dialysis_recurring_schedule');
    await client.query('DROP TABLE IF EXISTS dialysis_chair');
    await client.query('DROP TABLE IF EXISTS dialysis_medication_administration');
    await client.query('DROP TABLE IF EXISTS dialysis_session_detail');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('dialysis-module')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
