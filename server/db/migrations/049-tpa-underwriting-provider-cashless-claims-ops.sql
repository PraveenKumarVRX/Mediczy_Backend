-- TPA underwriting, provider contracting/MOU/SOC, cashless requests,
-- and claims operations pipeline from inward to payment.
-- Date: 2026-09-06

CREATE TABLE IF NOT EXISTS tpa_policy_underwriting_cases (
  id BIGSERIAL PRIMARY KEY,
  case_number VARCHAR(80) NOT NULL UNIQUE,
  tpa_id INTEGER,
  corporate_name VARCHAR(255) NOT NULL,
  policy_type VARCHAR(120) NOT NULL DEFAULT 'group_health',
  lives_count INTEGER NOT NULL DEFAULT 0,
  sum_insured NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_premium NUMERIC(14,2) NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  underwriting_notes TEXT,
  proposal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_by INTEGER,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_member_enrollments (
  id BIGSERIAL PRIMARY KEY,
  enrollment_number VARCHAR(80) NOT NULL UNIQUE,
  tpa_id INTEGER,
  corporate_name VARCHAR(255) NOT NULL,
  policy_number VARCHAR(100) NOT NULL,
  member_id VARCHAR(64),
  employee_id VARCHAR(64),
  employee_name VARCHAR(255) NOT NULL,
  relation VARCHAR(40) NOT NULL DEFAULT 'self',
  endorsement_type VARCHAR(60) NOT NULL DEFAULT 'new_enrollment',
  dependents JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  decision_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by INTEGER,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_provider_contracts (
  id BIGSERIAL PRIMARY KEY,
  provider_code VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  provider_name VARCHAR(255) NOT NULL,
  city VARCHAR(120),
  state VARCHAR(120),
  cashless_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  contract_status VARCHAR(40) NOT NULL DEFAULT 'draft',
  mou_number VARCHAR(100),
  mou_file_url TEXT,
  mou_valid_from DATE,
  mou_valid_to DATE,
  settlement_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  empanelment_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_provider_soc_versions (
  id BIGSERIAL PRIMARY KEY,
  soc_number VARCHAR(80) NOT NULL UNIQUE,
  provider_code VARCHAR(64) NOT NULL,
  tpa_id INTEGER,
  version_label VARCHAR(80) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  charge_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_provider_blacklist (
  id BIGSERIAL PRIMARY KEY,
  provider_code VARCHAR(64) NOT NULL,
  tpa_id INTEGER,
  reason TEXT NOT NULL,
  severity VARCHAR(40) NOT NULL DEFAULT 'medium',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_cashless_forms (
  id BIGSERIAL PRIMARY KEY,
  form_code VARCHAR(80) NOT NULL UNIQUE,
  tpa_id INTEGER,
  form_name VARCHAR(255) NOT NULL,
  policy_number VARCHAR(100),
  procedure_category VARCHAR(120),
  required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  form_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_cashless_requests (
  id BIGSERIAL PRIMARY KEY,
  request_number VARCHAR(80) NOT NULL UNIQUE,
  tpa_id INTEGER,
  provider_code VARCHAR(64),
  provider_name VARCHAR(255) NOT NULL,
  member_id VARCHAR(64),
  policy_number VARCHAR(100) NOT NULL,
  patient_name VARCHAR(255) NOT NULL,
  admission_type VARCHAR(40) NOT NULL DEFAULT 'planned',
  procedure_name VARCHAR(255),
  diagnosis TEXT,
  estimated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  query_reason TEXT,
  denial_reason TEXT,
  approval_letter_url TEXT,
  valid_until TIMESTAMPTZ,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_by INTEGER,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_inward_register (
  id BIGSERIAL PRIMARY KEY,
  inward_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  source VARCHAR(60) NOT NULL DEFAULT 'provider_portal',
  received_mode VARCHAR(60) NOT NULL DEFAULT 'digital',
  packet_reference VARCHAR(120),
  documents_count INTEGER NOT NULL DEFAULT 0,
  received_by INTEGER,
  status VARCHAR(40) NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_scan_batches (
  id BIGSERIAL PRIMARY KEY,
  scan_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  inward_id BIGINT REFERENCES tpa_claim_inward_register(id) ON DELETE SET NULL,
  pages_count INTEGER NOT NULL DEFAULT 0,
  ocr_status VARCHAR(40) NOT NULL DEFAULT 'queued',
  quality_score INTEGER NOT NULL DEFAULT 0,
  storage_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scanned_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_bill_entries (
  id BIGSERIAL PRIMARY KEY,
  bill_entry_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  bill_number VARCHAR(120),
  bill_date DATE,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  non_payable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'entered',
  entered_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_bill_line_items (
  id BIGSERIAL PRIMARY KEY,
  bill_entry_id BIGINT NOT NULL REFERENCES tpa_claim_bill_entries(id) ON DELETE CASCADE,
  line_code VARCHAR(80),
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  non_payable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  soc_match_status VARCHAR(40) NOT NULL DEFAULT 'not_checked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_adjudications (
  id BIGSERIAL PRIMARY KEY,
  adjudication_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  bill_entry_id BIGINT REFERENCES tpa_claim_bill_entries(id) ON DELETE SET NULL,
  adjudication_status VARCHAR(40) NOT NULL DEFAULT 'recommended',
  claimed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deducted_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  rules_applied JSONB NOT NULL DEFAULT '[]'::jsonb,
  adjudication_notes TEXT,
  adjudicated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_charge_entries (
  id BIGSERIAL PRIMARY KEY,
  charge_entry_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  charge_code VARCHAR(80) NOT NULL,
  charge_category VARCHAR(120),
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  provider_code VARCHAR(64),
  soc_number VARCHAR(80),
  posted_by INTEGER,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_claim_payment_advices (
  id BIGSERIAL PRIMARY KEY,
  payment_advice_number VARCHAR(80) NOT NULL UNIQUE,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  tpa_id INTEGER,
  beneficiary_name VARCHAR(255) NOT NULL,
  beneficiary_type VARCHAR(40) NOT NULL DEFAULT 'provider',
  payable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_mode VARCHAR(40) NOT NULL DEFAULT 'neft',
  utr_number VARCHAR(120),
  bank_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'advice_generated',
  paid_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpa_underwriting_status ON tpa_policy_underwriting_cases (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_enrollments_status ON tpa_member_enrollments (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_provider_contracts_status ON tpa_provider_contracts (tpa_id, contract_status);
CREATE INDEX IF NOT EXISTS idx_tpa_provider_soc_provider ON tpa_provider_soc_versions (tpa_id, provider_code, status);
CREATE INDEX IF NOT EXISTS idx_tpa_provider_blacklist_provider ON tpa_provider_blacklist (tpa_id, provider_code, status);
CREATE INDEX IF NOT EXISTS idx_tpa_cashless_forms_status ON tpa_cashless_forms (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_cashless_requests_status ON tpa_cashless_requests (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_inward_claim ON tpa_claim_inward_register (claim_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_scan_claim ON tpa_claim_scan_batches (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_bill_claim ON tpa_claim_bill_entries (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_adjudications_claim ON tpa_claim_adjudications (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_charge_claim ON tpa_claim_charge_entries (claim_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_payment_claim ON tpa_claim_payment_advices (claim_id, created_at DESC);
