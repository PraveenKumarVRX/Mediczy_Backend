/**
 * Laboratory internal QC: material lots, runs, release state, and audit.
 * Purely additive and safe to execute repeatedly.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_qc_materials (
        id BIGSERIAL PRIMARY KEY,
        lab_id INTEGER NOT NULL,
        analyte VARCHAR(160) NOT NULL,
        instrument_id VARCHAR(160),
        level VARCHAR(32) NOT NULL DEFAULT 'normal',
        lot_number VARCHAR(120) NOT NULL,
        units VARCHAR(64) NOT NULL,
        target_mean NUMERIC(18,6) NOT NULL,
        target_sd NUMERIC(18,6) NOT NULL CHECK (target_sd > 0),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        release_status VARCHAR(24) NOT NULL DEFAULT 'released'
          CHECK (release_status IN ('released', 'review', 'locked')),
        created_by VARCHAR(160),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_qc_material_identity
        ON lab_qc_materials (lab_id, analyte, COALESCE(instrument_id, ''), level, lot_number);
      CREATE INDEX IF NOT EXISTS idx_lab_qc_material_lab_status
        ON lab_qc_materials (lab_id, active, release_status);

      CREATE TABLE IF NOT EXISTS lab_qc_runs (
        id BIGSERIAL PRIMARY KEY,
        lab_id INTEGER NOT NULL,
        material_id BIGINT NOT NULL REFERENCES lab_qc_materials(id) ON DELETE CASCADE,
        measured_value NUMERIC(18,6) NOT NULL,
        z_score NUMERIC(12,6) NOT NULL,
        decision VARCHAR(24) NOT NULL CHECK (decision IN ('pass', 'warning', 'fail')),
        rule_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        operator_id VARCHAR(160),
        instrument_run_id VARCHAR(160),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lab_qc_runs_material_time
        ON lab_qc_runs (lab_id, material_id, run_at DESC);

      CREATE TABLE IF NOT EXISTS lab_qc_audit_events (
        id BIGSERIAL PRIMARY KEY,
        lab_id INTEGER NOT NULL,
        material_id BIGINT REFERENCES lab_qc_materials(id) ON DELETE SET NULL,
        run_id BIGINT REFERENCES lab_qc_runs(id) ON DELETE SET NULL,
        event_type VARCHAR(64) NOT NULL,
        actor_id VARCHAR(160),
        reason TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lab_qc_audit_lab_time
        ON lab_qc_audit_events (lab_id, created_at DESC);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS lab_qc_audit_events');
    await client.query('DROP TABLE IF EXISTS lab_qc_runs');
    await client.query('DROP TABLE IF EXISTS lab_qc_materials');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('20261015000100-lab-quality-control')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

