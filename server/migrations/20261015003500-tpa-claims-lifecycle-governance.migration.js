import pool from '../db/pgPool.js';

/** Migration-owned TPA, pre-authorisation, claims, provider and remittance schema. */
export async function up() {
  await pool.query(`

CREATE TABLE IF NOT EXISTS tpa_claims (
  id BIGSERIAL PRIMARY KEY,
  claim_number VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  source VARCHAR(40) NOT NULL DEFAULT 'tpa_portal',
  member_id VARCHAR(64),
  employee_id VARCHAR(64),
  employee_name VARCHAR(255) NOT NULL,
  corporate_name VARCHAR(255),
  policy_number VARCHAR(100) NOT NULL,
  claim_type VARCHAR(40) NOT NULL DEFAULT 'reimbursement',
  treatment_type VARCHAR(80),
  hospital_name VARCHAR(255),
  diagnosis TEXT,
  claimed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deducted_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  settled_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  settlement_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  documents_status VARCHAR(40) NOT NULL DEFAULT 'incomplete',
  sla_due_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_claim_events (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  actor_type VARCHAR(40) NOT NULL DEFAULT 'tpa',
  actor_id INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_claim_documents (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  document_type VARCHAR(80) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT,
  upload_status VARCHAR(40) NOT NULL DEFAULT 'received',
  ocr_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  completeness_score INTEGER NOT NULL DEFAULT 0,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_signal VARCHAR(40) NOT NULL DEFAULT 'low',
  uploaded_by_type VARCHAR(40) NOT NULL DEFAULT 'tpa',
  uploaded_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_claim_shortfalls (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  shortfall_number VARCHAR(64) NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  raised_by INTEGER,
  resolved_at TIMESTAMPTZ,
  response_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_preauth_requests (
  id BIGSERIAL PRIMARY KEY,
  preauth_number VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  member_id VARCHAR(64),
  employee_name VARCHAR(255) NOT NULL,
  corporate_name VARCHAR(255),
  policy_number VARCHAR(100) NOT NULL,
  hospital_name VARCHAR(255) NOT NULL,
  admission_type VARCHAR(40) NOT NULL DEFAULT 'planned',
  treatment_type VARCHAR(120),
  diagnosis TEXT,
  estimated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  planned_admission_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  decision_reason TEXT,
  sla_due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_fwa_scores (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_level VARCHAR(40) NOT NULL DEFAULT 'low',
  rules_fired JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation TEXT,
  reviewer_disposition VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_members (
  id BIGSERIAL PRIMARY KEY,
  member_id VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  employee_id VARCHAR(64),
  employee_name VARCHAR(255) NOT NULL,
  relation VARCHAR(40) NOT NULL DEFAULT 'self',
  corporate_name VARCHAR(255),
  policy_number VARCHAR(100) NOT NULL,
  policy_start_date DATE,
  policy_end_date DATE,
  coverage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  used_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  room_rent_limit NUMERIC(14,2),
  co_pay_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependents JSONB NOT NULL DEFAULT '[]'::jsonb,
  phone_last4 VARCHAR(4),
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  ecard_verification_code VARCHAR(80) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_network_hospitals (
  id BIGSERIAL PRIMARY KEY,
  hospital_code VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  hospital_name VARCHAR(255) NOT NULL,
  city VARCHAR(120),
  state VARCHAR(120),
  pincode VARCHAR(12),
  address TEXT,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  cashless_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_provider BOOLEAN NOT NULL DEFAULT FALSE,
  tariff_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_phone VARCHAR(40),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tpa_public_claim_access (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  public_token VARCHAR(96) NOT NULL UNIQUE,
  verification_hint VARCHAR(120),
  allowed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
CREATE INDEX IF NOT EXISTS idx_tpa_claims_tpa_status ON tpa_claims (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_events_claim ON tpa_claim_events (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_documents_claim ON tpa_claim_documents (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_shortfalls_claim ON tpa_claim_shortfalls (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_preauth_tpa_status ON tpa_preauth_requests (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_fwa_scores_claim ON tpa_fwa_scores (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_members_tpa_policy ON tpa_members (tpa_id, policy_number);
CREATE INDEX IF NOT EXISTS idx_tpa_members_member_tpa ON tpa_members (member_id, tpa_id);
CREATE INDEX IF NOT EXISTS idx_tpa_network_hospitals_tpa_city ON tpa_network_hospitals (tpa_id, city);
CREATE INDEX IF NOT EXISTS idx_tpa_network_hospitals_cashless ON tpa_network_hospitals (cashless_enabled, preferred_provider);
CREATE INDEX IF NOT EXISTS idx_tpa_public_claim_access_claim ON tpa_public_claim_access (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_files_claim ON tpa_claim_files (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_policy_rules_policy ON tpa_policy_rules (tpa_id, policy_number, active);
CREATE INDEX IF NOT EXISTS idx_tpa_notifications_claim ON tpa_notifications (claim_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpa_approval_requests_tpa_status ON tpa_approval_requests (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_provider_cases_tpa_status ON tpa_provider_cases (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_interop_events_tpa_status ON tpa_interop_events (tpa_id, status);
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

  `);
  console.log('[migration] TPA claims lifecycle governance schema ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS tpa_claim_payment_advices CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_charge_entries CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_adjudications CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_bill_line_items CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_bill_entries CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_scan_batches CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_inward_register CASCADE;\n    DROP TABLE IF EXISTS tpa_cashless_requests CASCADE;\n    DROP TABLE IF EXISTS tpa_cashless_forms CASCADE;\n    DROP TABLE IF EXISTS tpa_provider_blacklist CASCADE;\n    DROP TABLE IF EXISTS tpa_provider_soc_versions CASCADE;\n    DROP TABLE IF EXISTS tpa_provider_contracts CASCADE;\n    DROP TABLE IF EXISTS tpa_member_enrollments CASCADE;\n    DROP TABLE IF EXISTS tpa_policy_underwriting_cases CASCADE;\n    DROP TABLE IF EXISTS tpa_interop_events CASCADE;\n    DROP TABLE IF EXISTS tpa_provider_cases CASCADE;\n    DROP TABLE IF EXISTS tpa_approval_requests CASCADE;\n    DROP TABLE IF EXISTS tpa_notifications CASCADE;\n    DROP TABLE IF EXISTS tpa_policy_rules CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_files CASCADE;\n    DROP TABLE IF EXISTS tpa_public_claim_access CASCADE;\n    DROP TABLE IF EXISTS tpa_network_hospitals CASCADE;\n    DROP TABLE IF EXISTS tpa_members CASCADE;\n    DROP TABLE IF EXISTS tpa_fwa_scores CASCADE;\n    DROP TABLE IF EXISTS tpa_preauth_requests CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_shortfalls CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_documents CASCADE;\n    DROP TABLE IF EXISTS tpa_claim_events CASCADE;\n    DROP TABLE IF EXISTS tpa_claims CASCADE;\n  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
