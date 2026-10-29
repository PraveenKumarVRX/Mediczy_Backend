/** RCM governance: payer-specific denial coding, accountable work queues and
 * idempotent remittance-import lineage. This contains no payer credentials. */
import pool from '../db/pgPool.js';

export async function runInsuranceRcmGovernanceMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS insurance_denial_reason_codes (
        id BIGSERIAL PRIMARY KEY,
        payer_name TEXT,
        code TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        description TEXT NOT NULL,
        default_appeal_days INTEGER CHECK (default_appeal_days BETWEEN 1 AND 365),
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_denial_reason_code
        ON insurance_denial_reason_codes (COALESCE(payer_name, ''), code);
      -- A conservative hospital-wide baseline. Payer-specific entries may
      -- override these values through the denial-reason-code API.
      INSERT INTO insurance_denial_reason_codes (payer_name, code, category, description, default_appeal_days)
      VALUES
        (NULL, 'DOC_MISSING', 'documentation', 'Required clinical or billing documentation is missing.', 15),
        (NULL, 'TIMELY_FILING', 'filing', 'Claim or appeal was submitted after the payer filing window.', 7),
        (NULL, 'NOT_COVERED', 'coverage', 'Service, item, or package is not covered by the policy.', 30),
        (NULL, 'MEDICAL_NECESSITY', 'clinical', 'Payer requested evidence of medical necessity.', 30),
        (NULL, 'DUPLICATE_CLAIM', 'billing', 'Payer identified a potentially duplicate claim.', 15),
        (NULL, 'CODING_ERROR', 'coding', 'Diagnosis, procedure, or package coding requires correction.', 15)
      ON CONFLICT (COALESCE(payer_name, ''), code) DO NOTHING;
      CREATE TABLE IF NOT EXISTS claim_denial_work_items (
        id BIGSERIAL PRIMARY KEY,
        denial_id BIGINT NOT NULL UNIQUE REFERENCES claim_denials(id) ON DELETE CASCADE,
        hospital_id INTEGER NOT NULL,
        owner_user_id INTEGER REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','appeal_drafted','appealed','resolved','closed')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
        appeal_deadline_at TIMESTAMPTZ,
        appeal_submitted_at TIMESTAMPTZ,
        resubmission_count INTEGER NOT NULL DEFAULT 0 CHECK (resubmission_count >= 0),
        last_action_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_claim_denial_work_queue
        ON claim_denial_work_items (hospital_id, status, appeal_deadline_at, priority);
      CREATE TABLE IF NOT EXISTS era_import_batches (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        source_digest TEXT NOT NULL,
        imported_by_user_id INTEGER REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','partial','failed')),
        row_count INTEGER NOT NULL DEFAULT 0,
        posted_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        UNIQUE (hospital_id, source_digest)
      );
      CREATE TABLE IF NOT EXISTS era_import_rows (
        id BIGSERIAL PRIMARY KEY,
        batch_id BIGINT NOT NULL REFERENCES era_import_batches(id) ON DELETE CASCADE,
        row_number INTEGER NOT NULL,
        claim_number TEXT,
        raw_row JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','posted','failed','unmatched')),
        era_remittance_id BIGINT REFERENCES era_remittances(id),
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (batch_id, row_number)
      );
      CREATE INDEX IF NOT EXISTS idx_era_import_rows_batch ON era_import_rows (batch_id, status);
    `);
    await client.query('COMMIT');
    console.log('Insurance RCM governance migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Insurance RCM governance migration failed:', error.message);
    throw error;
  } finally { client.release(); }
}

if (process.argv[1]?.includes('insurance-rcm-governance')) runInsuranceRcmGovernanceMigration().then(() => process.exit(0)).catch(() => process.exit(1));
