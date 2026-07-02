/**
 * Fee schedule versioning — Phase 2 RCM
 * Run: node server/migrations/fee-schedule-versioning.migration.js
 */
import pool from '../db/pgPool.js';

const SQL = `
CREATE TABLE IF NOT EXISTS charge_master_versions (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  version_code VARCHAR(40) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(20) DEFAULT 'active',
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, version_code)
);

ALTER TABLE charge_master ADD COLUMN IF NOT EXISTS version_id BIGINT;
ALTER TABLE charge_master ADD COLUMN IF NOT EXISTS effective_from DATE;
ALTER TABLE charge_master ADD COLUMN IF NOT EXISTS effective_to DATE;

CREATE INDEX IF NOT EXISTS idx_cm_version ON charge_master(organization_id, version_id);
`;

async function run() {
  console.log('Running fee schedule versioning migration...');
  await pool.query(SQL);
  console.log('Done.');
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
