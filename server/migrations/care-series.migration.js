/**
 * Migration: Care Series (recurring-treatment workflow, generic)
 * ==================================================================
 * Design source: docs discussion 2026-09-18. Built generic on purpose so
 * it serves dialysis, chemotherapy, and any other recurring-treatment
 * specialty (physiotherapy courses, wound-care follow-ups) later without a
 * second bespoke build — per the design doc's explicit recommendation.
 *
 * This is workflow SHELL only. Clinical content (what fields a dialysis
 * session should capture, what a pre-chemo checklist contains) is
 * deliberately NOT hardcoded here — it's authored as draft rules in the
 * already-shipped Clinical Knowledge Fabric
 * (clinical_knowledge_domains/clinical_knowledge_rules) and requires
 * medical-director approval before use, same governance path as everything
 * else clinical in this platform. This migration only links a series to
 * its knowledge-fabric domain_key; it does not decide what that domain's
 * rules say.
 *
 * Per the design doc: a nephrologist and an oncologist should review the
 * workflow shape below before this is used for a real patient — this
 * migration makes the capability possible, it does not make it approved
 * for clinical use.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS care_series (
        id                 SERIAL PRIMARY KEY,
        patient_id         INTEGER NOT NULL,
        organization_id    INTEGER NOT NULL,
        domain_key         TEXT REFERENCES clinical_knowledge_domains(domain_key),
        series_type        TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'discontinued')),
        started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at       TIMESTAMPTZ,
        planned_sessions   INT,
        protocol_reference TEXT,
        created_by         TEXT,
        created_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_care_series_patient ON care_series (patient_id, status)`);
    console.log('✅ care_series: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS care_series_session (
        id                SERIAL PRIMARY KEY,
        series_id         INTEGER NOT NULL REFERENCES care_series(id),
        session_number    INT NOT NULL,
        scheduled_at      TIMESTAMPTZ,
        started_at        TIMESTAMPTZ,
        completed_at      TIMESTAMPTZ,
        status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'missed', 'cancelled')),
        vitals            JSONB DEFAULT '{}'::jsonb,
        notes             TEXT,
        recorded_by       TEXT,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (series_id, session_number)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_care_series_session_series ON care_series_session (series_id, session_number)`);
    console.log('✅ care_series_session: created');

    await client.query('COMMIT');
    console.log('✅ Care series migration complete');
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
    await client.query('DROP TABLE IF EXISTS care_series_session');
    await client.query('DROP TABLE IF EXISTS care_series');
    await client.query('COMMIT');
    console.log('✅ Care series migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node care-series.migration.js
if (process.argv[1] && process.argv[1].includes('care-series')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
