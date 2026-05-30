-- IP credit ledger for API-v1 lab billing
CREATE TABLE IF NOT EXISTS api_lab_ip_credit_ledger (
    entry_id VARCHAR(80) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    booking_id VARCHAR(50) NOT NULL REFERENCES api_lab_bookings(booking_id),
    user_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(255),
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
    reference VARCHAR(100),
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    acted_by VARCHAR(80),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_lab_ip_credit_ledger_tenant ON api_lab_ip_credit_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_ip_credit_ledger_user ON api_lab_ip_credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_ip_credit_ledger_booking ON api_lab_ip_credit_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_ip_credit_ledger_created ON api_lab_ip_credit_ledger(created_at DESC);