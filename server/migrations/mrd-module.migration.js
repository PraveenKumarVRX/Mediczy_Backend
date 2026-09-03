/**
 * Migration: MRD (Medical Records Department) module
 * Upgrade Plan Track A, Phase A2.
 *
 * Builds the MRD department workflow itself — record indexing/location
 * tracking, a check-out/return log, retrieval requests, and a retention
 * schedule by record type — distinct from the clinical content that
 * already exists (medicalRecord/ehrRecord models). MRD's job is knowing
 * WHERE a record is and WHO has it, not what's in it.
 *
 * Retention/destruction is deliberately advisory: mrd_retention_schedule
 * defines the policy per record type, and a record's computed
 * retention_due_at is surfaced for review — nothing in this module
 * auto-deletes anything.
 */
import pool from '../db/pgPool.js';

export async function runMrdModuleMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mrd_retention_schedule (
        id                  SERIAL PRIMARY KEY,
        record_type         VARCHAR(100) NOT NULL UNIQUE,
        retention_years     INTEGER      NOT NULL,
        destruction_action  VARCHAR(20)  NOT NULL DEFAULT 'review' CHECK (destruction_action IN ('review')),
        notes               TEXT,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mrd_record_index (
        id                 SERIAL PRIMARY KEY,
        patient_id         INTEGER      NOT NULL REFERENCES users(id),
        organization_id    INTEGER,
        record_type        VARCHAR(100) NOT NULL,
        format              VARCHAR(20)  NOT NULL DEFAULT 'digital' CHECK (format IN ('physical', 'digital')),
        location           VARCHAR(255),
        status             VARCHAR(20)  NOT NULL DEFAULT 'in_mrd' CHECK (status IN ('in_mrd', 'checked_out', 'archived', 'destroyed')),
        indexed_by         INTEGER,
        retention_due_at   DATE,
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_record_index_patient ON mrd_record_index (patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_record_index_org ON mrd_record_index (organization_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_record_index_status ON mrd_record_index (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_record_index_retention ON mrd_record_index (retention_due_at)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mrd_checkout_log (
        id                   SERIAL PRIMARY KEY,
        record_id            INTEGER      NOT NULL REFERENCES mrd_record_index(id),
        checked_out_by       INTEGER      NOT NULL,
        checked_out_to_dept  VARCHAR(100),
        purpose              TEXT,
        checked_out_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        expected_return_at   TIMESTAMPTZ,
        returned_at          TIMESTAMPTZ,
        returned_to          INTEGER,
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_checkout_log_record ON mrd_checkout_log (record_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_checkout_log_open ON mrd_checkout_log (record_id) WHERE returned_at IS NULL`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mrd_retrieval_requests (
        id                     SERIAL PRIMARY KEY,
        record_id              INTEGER      REFERENCES mrd_record_index(id),
        patient_id             INTEGER      NOT NULL REFERENCES users(id),
        organization_id        INTEGER,
        requested_by           INTEGER      NOT NULL,
        requesting_department  VARCHAR(100),
        priority               VARCHAR(20)  NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent')),
        status                 VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'fulfilled', 'rejected', 'cancelled')),
        notes                  TEXT,
        fulfilled_by           INTEGER,
        fulfilled_at           TIMESTAMPTZ,
        rejection_reason       TEXT,
        created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_retrieval_requests_status ON mrd_retrieval_requests (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_retrieval_requests_patient ON mrd_retrieval_requests (patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mrd_retrieval_requests_org ON mrd_retrieval_requests (organization_id)`);

    // Starter retention policy — every value here is a placeholder for
    // compliance/legal review (see Upgrade Plan Phase A2 exit criteria),
    // not a clinically or legally authoritative retention period.
    await client.query(`
      INSERT INTO mrd_retention_schedule (record_type, retention_years, notes)
      VALUES
        ('case_sheet', 10, 'Placeholder — confirm against local medical records retention regulation before relying on this value'),
        ('discharge_summary', 10, 'Placeholder — confirm against local medical records retention regulation before relying on this value'),
        ('imaging_report', 5, 'Placeholder — confirm against local medical records retention regulation before relying on this value'),
        ('lab_report', 5, 'Placeholder — confirm against local medical records retention regulation before relying on this value'),
        ('consent_form', 10, 'Placeholder — confirm against local medical records retention regulation before relying on this value')
      ON CONFLICT (record_type) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('✅ mrd-module migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ mrd-module migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
