/**
 * Hospital Billing Suite — stations, invoices, payments, templates, audit
 * Run: node server/migrations/hospital-billing-suite.migration.js
 */

import pool from '../db/pgPool.js';

const SQL = `
CREATE TABLE IF NOT EXISTS billing_stations (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  station_code VARCHAR(40) NOT NULL,
  station_name VARCHAR(120) NOT NULL,
  location VARCHAR(200),
  station_type VARCHAR(30) DEFAULT 'cashier',
  accepts_cash BOOLEAN DEFAULT TRUE,
  accepts_card BOOLEAN DEFAULT TRUE,
  accepts_upi BOOLEAN DEFAULT TRUE,
  accepts_credit BOOLEAN DEFAULT TRUE,
  accepts_insurance BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, station_code)
);

CREATE TABLE IF NOT EXISTS billing_cashier_sessions (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  station_id INTEGER NOT NULL REFERENCES billing_stations(id),
  cashier_user_id INTEGER,
  cashier_name VARCHAR(200),
  status VARCHAR(20) DEFAULT 'open',
  opening_float NUMERIC(12,2) DEFAULT 0,
  cash_collected NUMERIC(12,2) DEFAULT 0,
  card_collected NUMERIC(12,2) DEFAULT 0,
  upi_collected NUMERIC(12,2) DEFAULT 0,
  credit_collected NUMERIC(12,2) DEFAULT 0,
  insurance_collected NUMERIC(12,2) DEFAULT 0,
  total_collected NUMERIC(12,2) DEFAULT 0,
  closing_total NUMERIC(12,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_sessions_hospital ON billing_cashier_sessions(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_station ON billing_cashier_sessions(station_id, status);

CREATE TABLE IF NOT EXISTS hospital_bill_templates (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  template_code VARCHAR(40) NOT NULL,
  template_name VARCHAR(120) NOT NULL,
  template_type VARCHAR(30) DEFAULT 'itemized',
  payer_type VARCHAR(30) DEFAULT 'all',
  header_config JSONB DEFAULT '{}'::jsonb,
  footer_config JSONB DEFAULT '{}'::jsonb,
  line_layout JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, template_code)
);

CREATE TABLE IF NOT EXISTS hospital_invoices (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  bill_number VARCHAR(50) NOT NULL,
  patient_id INTEGER,
  admission_id BIGINT,
  station_id INTEGER REFERENCES billing_stations(id),
  session_id BIGINT REFERENCES billing_cashier_sessions(id),
  template_id INTEGER REFERENCES hospital_bill_templates(id),
  bill_type VARCHAR(30) DEFAULT 'ipd',
  payment_mode VARCHAR(30) DEFAULT 'mixed',
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount_amount NUMERIC(14,2) DEFAULT 0,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  insurance_amount NUMERIC(14,2) DEFAULT 0,
  patient_liability NUMERIC(14,2) DEFAULT 0,
  amount_paid NUMERIC(14,2) DEFAULT 0,
  amount_due NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'draft',
  insurance_claim_id INTEGER,
  pgi_order_id VARCHAR(120),
  pgi_payment_link TEXT,
  pgi_status VARCHAR(30),
  metadata JSONB DEFAULT '{}'::jsonb,
  finalized_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, bill_number)
);

CREATE INDEX IF NOT EXISTS idx_hospital_invoices_patient ON hospital_invoices(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hospital_invoices_admission ON hospital_invoices(admission_id);
CREATE INDEX IF NOT EXISTS idx_hospital_invoices_status ON hospital_invoices(hospital_id, status);

CREATE TABLE IF NOT EXISTS hospital_invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES hospital_invoices(id) ON DELETE CASCADE,
  charge_source VARCHAR(40),
  charge_source_id BIGINT,
  charge_code VARCHAR(60),
  description TEXT NOT NULL,
  category VARCHAR(60),
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(14,2) DEFAULT 0,
  tax_percent NUMERIC(6,2) DEFAULT 0,
  line_total NUMERIC(14,2) DEFAULT 0,
  insurance_payable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospital_invoice_lines_invoice ON hospital_invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS hospital_payments (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  invoice_id BIGINT NOT NULL REFERENCES hospital_invoices(id),
  station_id INTEGER REFERENCES billing_stations(id),
  session_id BIGINT REFERENCES billing_cashier_sessions(id),
  payment_method VARCHAR(30) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  reference_number VARCHAR(120),
  gateway VARCHAR(40),
  gateway_order_id VARCHAR(120),
  gateway_payment_id VARCHAR(120),
  gateway_status VARCHAR(30),
  insurance_claim_id INTEGER,
  received_by INTEGER,
  received_by_name VARCHAR(200),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospital_payments_invoice ON hospital_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_hospital_payments_hospital ON hospital_payments(hospital_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hospital_credit_accounts (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  credit_limit NUMERIC(14,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  approved_by VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, patient_id)
);

CREATE TABLE IF NOT EXISTS hospital_credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  credit_account_id BIGINT NOT NULL REFERENCES hospital_credit_accounts(id),
  invoice_id BIGINT REFERENCES hospital_invoices(id),
  payment_id BIGINT REFERENCES hospital_payments(id),
  entry_type VARCHAR(20) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_audit_log (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  station_id INTEGER,
  session_id BIGINT,
  actor_id INTEGER,
  actor_name VARCHAR(200),
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  resource_id VARCHAR(80),
  before_state JSONB,
  after_state JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_hospital ON billing_audit_log(hospital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_resource ON billing_audit_log(resource_type, resource_id);
`;

async function seedDefaults() {
  await pool.query(`
    INSERT INTO hospital_bill_templates (hospital_id, template_code, template_name, template_type, payer_type, is_default, header_config, footer_config)
    SELECT 1, 'GST_ITEMIZED', 'GST Itemized IP Bill', 'itemized', 'all', TRUE,
      '{"title":"Tax Invoice","showGstin":true,"showUhid":true}'::jsonb,
      '{"disclaimer":"This is a computer-generated bill.","showSignature":true}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM hospital_bill_templates WHERE hospital_id = 1 AND template_code = 'GST_ITEMIZED');

    INSERT INTO hospital_bill_templates (hospital_id, template_code, template_name, template_type, payer_type, header_config)
    SELECT 1, 'INSURANCE_SUMMARY', 'Insurance Summary Bill', 'summary', 'insurance', FALSE,
      '{"title":"Insurance Bill Summary","showPolicy":true,"showPreAuth":true}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM hospital_bill_templates WHERE hospital_id = 1 AND template_code = 'INSURANCE_SUMMARY');

    INSERT INTO hospital_bill_templates (hospital_id, template_code, template_name, template_type, payer_type, header_config)
    SELECT 1, 'CASH_RECEIPT', 'Cash Counter Receipt', 'receipt', 'cash', FALSE,
      '{"title":"Payment Receipt","thermal":true}'::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM hospital_bill_templates WHERE hospital_id = 1 AND template_code = 'CASH_RECEIPT');

    INSERT INTO billing_stations (hospital_id, station_code, station_name, location, station_type)
    SELECT 1, 'MAIN-CASH', 'Main Cash Counter', 'Ground Floor — Billing Wing', 'cashier'
    WHERE NOT EXISTS (SELECT 1 FROM billing_stations WHERE hospital_id = 1 AND station_code = 'MAIN-CASH');

    INSERT INTO billing_stations (hospital_id, station_code, station_name, location, station_type, accepts_insurance)
    SELECT 1, 'INS-DESK', 'Insurance Desk', 'Ground Floor — TPA Wing', 'insurance', TRUE
    WHERE NOT EXISTS (SELECT 1 FROM billing_stations WHERE hospital_id = 1 AND station_code = 'INS-DESK');

    INSERT INTO billing_stations (hospital_id, station_code, station_name, location, station_type, accepts_credit)
    SELECT 1, 'IPD-BILLING', 'IPD Billing Station', 'First Floor — IPD Lobby', 'ipd', TRUE
    WHERE NOT EXISTS (SELECT 1 FROM billing_stations WHERE hospital_id = 1 AND station_code = 'IPD-BILLING');
  `);
}

async function run() {
  console.log('Running hospital billing suite migration...');
  await pool.query(SQL);
  await seedDefaults();
  console.log('Hospital billing suite migration complete.');
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
