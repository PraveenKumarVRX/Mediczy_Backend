/**
 * EMR → Lab / Pharmacy integration tables
 * Run: node server/migrations/emr-lab-pharmacy-integration.migration.js
 */

import pool from '../db/pgPool.js';

const SQL = `
CREATE TABLE IF NOT EXISTS hospital_partner_orgs (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('lab', 'pharmacy')),
  partner_id INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, partner_type, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_hospital_partner_orgs_hospital
  ON hospital_partner_orgs(hospital_id, partner_type);

CREATE TABLE IF NOT EXISTS emr_order_events (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER,
  event_type VARCHAR(60) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id INTEGER NOT NULL,
  target_type VARCHAR(40),
  target_id INTEGER,
  status VARCHAR(30) DEFAULT 'routed',
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emr_order_events_source
  ON emr_order_events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_emr_order_events_hospital
  ON emr_order_events(hospital_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hospital_billing_charges (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  patient_id INTEGER,
  charge_type VARCHAR(40) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id INTEGER NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) DEFAULT 'INR',
  status VARCHAR(30) DEFAULT 'pending',
  invoice_id INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospital_billing_charges_hospital
  ON hospital_billing_charges(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_hospital_billing_charges_patient
  ON hospital_billing_charges(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hospital_billing_charges_source
  ON hospital_billing_charges(source_type, source_id);

ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS lab_id INTEGER;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS source_type VARCHAR(40);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS source_id INTEGER;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS billing_charge_id BIGINT;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS hospital_id INTEGER;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS tests JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;

ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS hospital_id INTEGER;
ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS source_prescription_id INTEGER;
ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS source_type VARCHAR(40) DEFAULT 'emr';
ALTER TABLE pharmacy_prescriptions ADD COLUMN IF NOT EXISTS billing_charge_id BIGINT;
`;

async function run() {
  console.log('Running EMR lab/pharmacy integration migration...');
  await pool.query(SQL);
  console.log('EMR lab/pharmacy integration migration complete.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
