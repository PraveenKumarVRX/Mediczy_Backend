/**
 * Hospital RCM Phases 1-3 — adjustments, ERA, GL, statements, billing periods
 * Run: node server/migrations/hospital-billing-rcm-phases.migration.js
 */
import pool from '../db/pgPool.js';

const SQL = `
ALTER TABLE hospital_billing_charges ADD COLUMN IF NOT EXISTS admission_id BIGINT;
ALTER TABLE hospital_billing_charges ADD COLUMN IF NOT EXISTS invoice_id BIGINT;
ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS voided_by INTEGER;
ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS revision_of BIGINT;
ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS gstin VARCHAR(20);
ALTER TABLE hospital_invoices ADD COLUMN IF NOT EXISTS period_id BIGINT;
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS voided_by INTEGER;
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14,2);
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refunded_by INTEGER;
ALTER TABLE hospital_payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE billing_cashier_sessions ADD COLUMN IF NOT EXISTS closing_cash_counted NUMERIC(12,2);
ALTER TABLE billing_cashier_sessions ADD COLUMN IF NOT EXISTS closing_cash_expected NUMERIC(12,2);
ALTER TABLE billing_cashier_sessions ADD COLUMN IF NOT EXISTS cash_variance NUMERIC(12,2);
ALTER TABLE billing_cashier_sessions ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;
ALTER TABLE hospital_credit_accounts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE hospital_credit_accounts ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;

CREATE TABLE IF NOT EXISTS hospital_bill_adjustments (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  invoice_id BIGINT NOT NULL,
  adjustment_type VARCHAR(30) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT,
  approved_by INTEGER,
  approved_by_name VARCHAR(200),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  invoice_id BIGINT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_payment_refunds (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  payment_id BIGINT NOT NULL,
  invoice_id BIGINT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  approved_by INTEGER,
  gateway_refund_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS era_remittances (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  claim_id INTEGER,
  invoice_id BIGINT,
  payer_name VARCHAR(200),
  check_number VARCHAR(80),
  payment_amount NUMERIC(14,2) DEFAULT 0,
  adjustment_amount NUMERIC(14,2) DEFAULT 0,
  patient_responsibility NUMERIC(14,2) DEFAULT 0,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(30) DEFAULT 'posted',
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gl_journal_entries (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  entry_number VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_code VARCHAR(40) NOT NULL,
  account_name VARCHAR(200),
  debit NUMERIC(14,2) DEFAULT 0,
  credit NUMERIC(14,2) DEFAULT 0,
  source_type VARCHAR(40),
  source_id VARCHAR(80),
  description TEXT,
  period_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_periods (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  period_code VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  closed_at TIMESTAMPTZ,
  closed_by INTEGER,
  UNIQUE (hospital_id, period_code)
);

CREATE TABLE IF NOT EXISTS hospital_patient_statements (
  id BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  statement_number VARCHAR(50) NOT NULL,
  total_due NUMERIC(14,2) DEFAULT 0,
  delivery_method VARCHAR(20) DEFAULT 'print',
  status VARCHAR(20) DEFAULT 'issued',
  metadata JSONB DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (hospital_id, statement_number)
);

CREATE INDEX IF NOT EXISTS idx_hbc_admission ON hospital_billing_charges(admission_id);
CREATE INDEX IF NOT EXISTS idx_hbc_invoice ON hospital_billing_charges(invoice_id);
CREATE INDEX IF NOT EXISTS idx_era_hospital ON era_remittances(hospital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gl_hospital ON gl_journal_entries(hospital_id, entry_date DESC);
`;

async function run() {
  console.log('Running hospital billing RCM phases migration...');
  await pool.query(SQL);
  console.log('RCM phases migration complete.');
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
