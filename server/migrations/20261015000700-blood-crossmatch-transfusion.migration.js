/** Persisted blood compatibility and transfusion chain. */
import pool from '../db/pgPool.js';
import { bloodBankScope } from '../services/dept-tenant-scope.service.js';

export async function up() {
  await pool.query(`
    ALTER TABLE blood_bank_requisitions
      ADD COLUMN IF NOT EXISTS crossmatch_id INTEGER,
      ADD COLUMN IF NOT EXISTS transfusion_status VARCHAR(24) NOT NULL DEFAULT 'not_started';
    CREATE TABLE IF NOT EXISTS blood_crossmatches (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER NOT NULL REFERENCES blood_bank_requisitions(id) ON DELETE CASCADE,
      patient_id VARCHAR(80),
      patient_blood_group VARCHAR(4) NOT NULL,
      component VARCHAR(40) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'compatible',
      tested_by VARCHAR(160),
      tested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS blood_crossmatch_units (
      id SERIAL PRIMARY KEY,
      crossmatch_id INTEGER NOT NULL REFERENCES blood_crossmatches(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES blood_bank_units(id) ON DELETE RESTRICT,
      result VARCHAR(24) NOT NULL DEFAULT 'compatible',
      UNIQUE (crossmatch_id, unit_id)
    );
    CREATE TABLE IF NOT EXISTS blood_transfusions (
      id SERIAL PRIMARY KEY,
      requisition_id INTEGER NOT NULL REFERENCES blood_bank_requisitions(id) ON DELETE RESTRICT,
      unit_id INTEGER NOT NULL REFERENCES blood_bank_units(id) ON DELETE RESTRICT,
      patient_id VARCHAR(80),
      status VARCHAR(24) NOT NULL DEFAULT 'in_progress',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      reaction TEXT,
      recorded_by VARCHAR(160),
      UNIQUE (requisition_id, unit_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blood_crossmatches_req ON blood_crossmatches (requisition_id, tested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_blood_transfusions_req ON blood_transfusions (requisition_id, started_at DESC);
    DO $$ BEGIN
      ALTER TABLE blood_bank_requisitions ADD CONSTRAINT blood_bank_requisitions_crossmatch_fk
        FOREIGN KEY (crossmatch_id) REFERENCES blood_crossmatches(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await bloodBankScope.apply(pool, (message) => console.log('[Blood crossmatch]', message));
}

export async function down() {
  await pool.query(`
    ALTER TABLE blood_bank_requisitions DROP COLUMN IF EXISTS crossmatch_id, DROP COLUMN IF EXISTS transfusion_status;
    DROP TABLE IF EXISTS blood_transfusions, blood_crossmatch_units, blood_crossmatches CASCADE;
  `);
}

if (process.argv[1] && process.argv[1].includes('20261015000700-blood-crossmatch-transfusion')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
