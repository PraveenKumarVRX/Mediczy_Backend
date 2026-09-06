-- TPA enterprise controls: claim file vault, policy rules, notifications,
-- maker-checker approvals, provider cases, and interoperability queue.
-- Date: 2026-09-06

CREATE TABLE IF NOT EXISTS tpa_claim_files (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  document_id BIGINT REFERENCES tpa_claim_documents(id) ON DELETE SET NULL,
  storage_provider VARCHAR(40) NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120),
  file_size BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 VARCHAR(80),
  consent_scope VARCHAR(120) NOT NULL DEFAULT 'claim_processing',
  retention_until DATE,
  uploaded_by_type VARCHAR(40) NOT NULL DEFAULT 'tpa',
  uploaded_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_policy_rules (
  id BIGSERIAL PRIMARY KEY,
  tpa_id INTEGER,
  policy_number VARCHAR(100) NOT NULL,
  rule_code VARCHAR(80) NOT NULL,
  rule_type VARCHAR(60) NOT NULL,
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tpa_id, policy_number, rule_code)
);

CREATE TABLE IF NOT EXISTS tpa_notifications (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  channel VARCHAR(40) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  template_code VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  provider_message_id VARCHAR(160),
  delivery_receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT
);

CREATE TABLE IF NOT EXISTS tpa_approval_requests (
  id BIGSERIAL PRIMARY KEY,
  approval_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  action_type VARCHAR(80) NOT NULL,
  requested_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level VARCHAR(40) NOT NULL DEFAULT 'standard',
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  requested_by INTEGER,
  checked_by INTEGER,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_at TIMESTAMPTZ,
  checker_notes TEXT
);

CREATE TABLE IF NOT EXISTS tpa_provider_cases (
  id BIGSERIAL PRIMARY KEY,
  case_number VARCHAR(80) NOT NULL UNIQUE,
  tpa_id INTEGER,
  claim_id BIGINT REFERENCES tpa_claims(id) ON DELETE SET NULL,
  preauth_id BIGINT REFERENCES tpa_preauth_requests(id) ON DELETE SET NULL,
  hospital_code VARCHAR(64),
  hospital_name VARCHAR(255) NOT NULL,
  member_id VARCHAR(64),
  case_type VARCHAR(60) NOT NULL DEFAULT 'preauth',
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  admission_type VARCHAR(40),
  expected_discharge_at TIMESTAMPTZ,
  final_bill_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  query_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_handoff_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_interop_events (
  id BIGSERIAL PRIMARY KEY,
  event_number VARCHAR(80) NOT NULL UNIQUE,
  tpa_id INTEGER,
  claim_id BIGINT REFERENCES tpa_claims(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  target_system VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_system, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_tpa_claim_files_claim ON tpa_claim_files (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_policy_rules_policy ON tpa_policy_rules (tpa_id, policy_number, active);
CREATE INDEX IF NOT EXISTS idx_tpa_notifications_claim ON tpa_notifications (claim_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_approval_requests_tpa_status ON tpa_approval_requests (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_provider_cases_tpa_status ON tpa_provider_cases (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_interop_events_tpa_status ON tpa_interop_events (tpa_id, status);
