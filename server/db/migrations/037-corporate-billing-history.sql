-- Real, corporate-scoped billing history to replace the hardcoded
-- corporateBillingHistory mock array in corporate.route.js.
-- Represents invoices issued to the corporate for its Mediczy plan/subscription
-- (distinct from `invoices`, which is per-patient consultation billing).

CREATE TABLE IF NOT EXISTS corporate_billing_history (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period VARCHAR(100),
    plan_name VARCHAR(200),
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (corporate_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_corp_billing_corporate ON corporate_billing_history (corporate_id, invoice_date DESC);
