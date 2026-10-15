import pool from '../db/pgPool.js';

/** Canonical, migration-owned bridge table for exactly-once clinical charges. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_billing_charges (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      patient_id INTEGER,
      admission_id BIGINT,
      charge_type VARCHAR(40) NOT NULL DEFAULT 'service',
      source_type VARCHAR(40) NOT NULL,
      source_id VARCHAR(80) NOT NULL,
      description TEXT,
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','posted','voided','refunded')),
      invoice_id BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_hbc_source
      ON hospital_billing_charges (hospital_id, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_hbc_patient_admission
      ON hospital_billing_charges (hospital_id, patient_id, admission_id, created_at DESC);
  `);
  console.log('[migration] finance clinical charge ledger ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS hospital_billing_charges CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
