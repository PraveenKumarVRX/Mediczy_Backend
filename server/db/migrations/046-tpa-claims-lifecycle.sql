-- TPA claims lifecycle foundation
-- Closes core claim-portal parity gaps: claim lifecycle, timeline, documents,
-- shortfalls/query handling, pre-auth, settlement, SLA, and FWA scoring.

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

CREATE INDEX IF NOT EXISTS idx_tpa_claims_tpa_status ON tpa_claims (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_claims_policy ON tpa_claims (policy_number);
CREATE INDEX IF NOT EXISTS idx_tpa_claims_member ON tpa_claims (member_id);
CREATE INDEX IF NOT EXISTS idx_tpa_claims_sla ON tpa_claims (sla_due_at);
CREATE INDEX IF NOT EXISTS idx_tpa_claims_submitted ON tpa_claims (submitted_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_tpa_claim_events_claim ON tpa_claim_events (claim_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_tpa_claim_documents_claim ON tpa_claim_documents (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_documents_ocr ON tpa_claim_documents (ocr_status);

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

CREATE INDEX IF NOT EXISTS idx_tpa_claim_shortfalls_claim ON tpa_claim_shortfalls (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_claim_shortfalls_status ON tpa_claim_shortfalls (status, due_at);

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

CREATE INDEX IF NOT EXISTS idx_tpa_preauth_tpa_status ON tpa_preauth_requests (tpa_id, status);
CREATE INDEX IF NOT EXISTS idx_tpa_preauth_policy ON tpa_preauth_requests (policy_number);
CREATE INDEX IF NOT EXISTS idx_tpa_preauth_sla ON tpa_preauth_requests (sla_due_at);

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

CREATE INDEX IF NOT EXISTS idx_tpa_fwa_scores_claim ON tpa_fwa_scores (claim_id);
CREATE INDEX IF NOT EXISTS idx_tpa_fwa_scores_risk ON tpa_fwa_scores (risk_level, risk_score DESC);
