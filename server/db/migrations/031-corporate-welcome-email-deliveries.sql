-- Corporate welcome email delivery audit and idempotency table
CREATE TABLE IF NOT EXISTS corporate_welcome_email_deliveries (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL DEFAULT 0,
    employee_id VARCHAR(100),
    recipient_email VARCHAR(320) NOT NULL,
    subject TEXT,
    idempotency_key VARCHAR(160) NOT NULL,
    request_scope VARCHAR(40) NOT NULL DEFAULT 'batch_send',
    status VARCHAR(24) NOT NULL DEFAULT 'prepared',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_welcome_delivery_idempotency ON corporate_welcome_email_deliveries (
    corporate_id,
    user_id,
    recipient_email,
    idempotency_key,
    request_scope
);
CREATE INDEX IF NOT EXISTS idx_corp_welcome_delivery_status ON corporate_welcome_email_deliveries (corporate_id, status, updated_at DESC);