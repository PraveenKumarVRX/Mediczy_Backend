import pool from '../db/pgPool.js';

/** Canonical schema for the hospital cashier, invoice, payment and statement suite. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_stations (
      id SERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, station_code VARCHAR(40) NOT NULL,
      station_name VARCHAR(120) NOT NULL, location VARCHAR(200), station_type VARCHAR(30) DEFAULT 'cashier',
      accepts_cash BOOLEAN DEFAULT TRUE, accepts_card BOOLEAN DEFAULT TRUE, accepts_upi BOOLEAN DEFAULT TRUE,
      accepts_credit BOOLEAN DEFAULT TRUE, accepts_insurance BOOLEAN DEFAULT TRUE, is_active BOOLEAN DEFAULT TRUE,
      settings JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, station_code)
    );
    CREATE TABLE IF NOT EXISTS billing_cashier_sessions (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, station_id INTEGER NOT NULL,
      cashier_user_id INTEGER, cashier_name VARCHAR(200), status VARCHAR(20) DEFAULT 'open',
      opening_float NUMERIC(12,2) DEFAULT 0, cash_collected NUMERIC(12,2) DEFAULT 0,
      card_collected NUMERIC(12,2) DEFAULT 0, upi_collected NUMERIC(12,2) DEFAULT 0,
      credit_collected NUMERIC(12,2) DEFAULT 0, insurance_collected NUMERIC(12,2) DEFAULT 0,
      total_collected NUMERIC(12,2) DEFAULT 0, closing_total NUMERIC(12,2),
      opened_at TIMESTAMPTZ DEFAULT NOW(), closed_at TIMESTAMPTZ, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS hospital_bill_templates (
      id SERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, template_code VARCHAR(40) NOT NULL,
      template_name VARCHAR(120) NOT NULL, template_type VARCHAR(30) DEFAULT 'itemized',
      payer_type VARCHAR(30) DEFAULT 'all', header_config JSONB DEFAULT '{}'::jsonb,
      footer_config JSONB DEFAULT '{}'::jsonb, line_layout JSONB DEFAULT '{}'::jsonb,
      is_default BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, template_code)
    );
    CREATE TABLE IF NOT EXISTS hospital_invoices (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, bill_number VARCHAR(50) NOT NULL,
      patient_id INTEGER, admission_id BIGINT, station_id INTEGER, session_id BIGINT, template_id INTEGER,
      bill_type VARCHAR(30) DEFAULT 'ipd', payment_mode VARCHAR(30) DEFAULT 'mixed',
      subtotal NUMERIC(14,2) DEFAULT 0, discount_amount NUMERIC(14,2) DEFAULT 0, tax_amount NUMERIC(14,2) DEFAULT 0,
      total_amount NUMERIC(14,2) DEFAULT 0, insurance_amount NUMERIC(14,2) DEFAULT 0,
      patient_liability NUMERIC(14,2) DEFAULT 0, amount_paid NUMERIC(14,2) DEFAULT 0, amount_due NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'draft', insurance_claim_id INTEGER, pgi_order_id VARCHAR(120),
      pgi_payment_link TEXT, pgi_status VARCHAR(30), metadata JSONB DEFAULT '{}'::jsonb,
      finalized_at TIMESTAMPTZ, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, bill_number)
    );
    CREATE TABLE IF NOT EXISTS hospital_invoice_lines (
      id BIGSERIAL PRIMARY KEY, invoice_id BIGINT NOT NULL, charge_source VARCHAR(40), charge_source_id BIGINT,
      charge_code VARCHAR(60), description TEXT NOT NULL, category VARCHAR(60), quantity NUMERIC(10,2) DEFAULT 1,
      unit_price NUMERIC(14,2) DEFAULT 0, tax_percent NUMERIC(6,2) DEFAULT 0, line_total NUMERIC(14,2) DEFAULT 0,
      insurance_payable BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hospital_payments (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, invoice_id BIGINT NOT NULL,
      station_id INTEGER, session_id BIGINT, payment_method VARCHAR(30) NOT NULL, amount NUMERIC(14,2) NOT NULL,
      reference_number VARCHAR(120), gateway VARCHAR(40), gateway_order_id VARCHAR(120),
      gateway_payment_id VARCHAR(120), gateway_status VARCHAR(30), insurance_claim_id INTEGER,
      received_by INTEGER, received_by_name VARCHAR(200), notes TEXT, status VARCHAR(20) DEFAULT 'completed',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hospital_credit_accounts (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      credit_limit NUMERIC(14,2) DEFAULT 0, balance NUMERIC(14,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'active',
      approved_by VARCHAR(200), notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hospital_id, patient_id)
    );
    CREATE TABLE IF NOT EXISTS hospital_credit_ledger (
      id BIGSERIAL PRIMARY KEY, credit_account_id BIGINT NOT NULL, invoice_id BIGINT, payment_id BIGINT,
      entry_type VARCHAR(20) NOT NULL, amount NUMERIC(14,2) NOT NULL, balance_after NUMERIC(14,2) NOT NULL,
      notes TEXT, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS billing_audit_log (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, station_id INTEGER, session_id BIGINT,
      actor_id INTEGER, actor_name VARCHAR(200), action VARCHAR(80) NOT NULL, resource_type VARCHAR(60) NOT NULL,
      resource_id VARCHAR(80), before_state JSONB, after_state JSONB, ip_address VARCHAR(64), user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hospital_patient_statements (
      id BIGSERIAL PRIMARY KEY, hospital_id INTEGER NOT NULL, patient_id INTEGER NOT NULL,
      statement_number VARCHAR(50) NOT NULL, total_due NUMERIC(14,2) DEFAULT 0,
      delivery_method VARCHAR(20) DEFAULT 'print', status VARCHAR(20) DEFAULT 'issued',
      metadata JSONB DEFAULT '{}'::jsonb, issued_at TIMESTAMPTZ DEFAULT NOW(), delivered_at TIMESTAMPTZ,
      UNIQUE (hospital_id, statement_number)
    );
    ALTER TABLE hospital_patient_statements ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
  `);
  console.log('[migration] hospital billing suite ready');
}

export async function down() {
  await pool.query(`DROP TABLE IF EXISTS hospital_patient_statements, billing_audit_log, hospital_credit_ledger,
    hospital_credit_accounts, hospital_payments, hospital_invoice_lines, hospital_invoices,
    hospital_bill_templates, billing_cashier_sessions, billing_stations CASCADE;`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
