-- Migration: Add IHX-like Insurance Claims Management Features
-- Date: 2026-01-30
-- Description: Extends insurance_claims table and creates pre_authorizations table

-- 1. Create pre_authorizations table
CREATE TABLE IF NOT EXISTS pre_authorizations (
  id SERIAL PRIMARY KEY,
  pre_auth_number VARCHAR(50) NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  policy_number VARCHAR(100) NOT NULL,
  insurance_provider_id INTEGER REFERENCES insurance_providers(id) ON DELETE SET NULL,
  tpa_id INTEGER REFERENCES tpa(id) ON DELETE SET NULL,
  admission_details JSONB NOT NULL,
  estimated_amount DECIMAL(10, 2) NOT NULL,
  approved_amount DECIMAL(10, 2),
  diagnosis TEXT NOT NULL,
  planned_procedures JSONB,
  estimated_duration INTEGER,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  approval_number VARCHAR(100),
  submitted_at TIMESTAMP,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  expires_at TIMESTAMP,
  documents JSONB DEFAULT '[]'::jsonb,
  query_history JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for pre_authorizations
CREATE INDEX idx_pre_auth_number ON pre_authorizations(pre_auth_number);
CREATE INDEX idx_pre_auth_patient ON pre_authorizations(patient_id);
CREATE INDEX idx_pre_auth_hospital ON pre_authorizations(hospital_id);
CREATE INDEX idx_pre_auth_status ON pre_authorizations(status);
CREATE INDEX idx_pre_auth_org ON pre_authorizations(organization_id);
CREATE INDEX idx_pre_auth_submitted ON pre_authorizations(submitted_at);
CREATE INDEX idx_pre_auth_expires ON pre_authorizations(expires_at);

-- 2. Add new columns to insurance_claims table
ALTER TABLE insurance_claims 
  ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pre_auth_id INTEGER REFERENCES pre_authorizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insurance_provider_id INTEGER REFERENCES insurance_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tpa_id INTEGER REFERENCES tpa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS deducted_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS claim_type VARCHAR(20) DEFAULT 'cashless' CHECK (claim_type IN ('cashless', 'reimbursement', 'emergency')),
  ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(20) CHECK (settlement_status IN ('pending', 'partial', 'settled', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS settlement_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS hospitalization_details JSONB,
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS treatment_details JSONB,
  ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS documents_status VARCHAR(20) DEFAULT 'incomplete' CHECK (documents_status IN ('incomplete', 'complete', 'pending_verification')),
  ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '["discharge_summary", "bills", "investigation_reports", "prescription"]'::jsonb,
  ADD COLUMN IF NOT EXISTS query_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_modified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 3. Update existing status constraint to include new statuses
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS insurance_claims_status_check;
ALTER TABLE insurance_claims 
  ADD CONSTRAINT insurance_claims_status_check 
  CHECK (status IN ('draft', 'submitted', 'pending', 'query', 'approved', 'rejected', 'paid'));

-- Make insurance_provider nullable (was required before)
ALTER TABLE insurance_claims ALTER COLUMN insurance_provider DROP NOT NULL;

-- 4. Create additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_claims_hospital ON insurance_claims(hospital_id);
CREATE INDEX IF NOT EXISTS idx_claims_pre_auth ON insurance_claims(pre_auth_id);
CREATE INDEX IF NOT EXISTS idx_claims_insurance_provider ON insurance_claims(insurance_provider_id);
CREATE INDEX IF NOT EXISTS idx_claims_tpa ON insurance_claims(tpa_id);
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at ON insurance_claims(submitted_at);
CREATE INDEX IF NOT EXISTS idx_claims_settlement_status ON insurance_claims(settlement_status);
CREATE INDEX IF NOT EXISTS idx_claims_documents_status ON insurance_claims(documents_status);

-- 5. Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_insurance_claims_updated_at ON insurance_claims;
CREATE TRIGGER update_insurance_claims_updated_at 
  BEFORE UPDATE ON insurance_claims 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pre_authorizations_updated_at ON pre_authorizations;
CREATE TRIGGER update_pre_authorizations_updated_at 
  BEFORE UPDATE ON pre_authorizations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Create view for claims dashboard
CREATE OR REPLACE VIEW v_claims_dashboard AS
SELECT 
  ic.id,
  ic.claim_number,
  ic.patient_id,
  u.first_name || ' ' || u.last_name AS patient_name,
  u.phone_number AS patient_phone,
  ic.hospital_id,
  o.name AS hospital_name,
  ic.policy_number,
  ic.insurance_provider,
  ic.claim_amount,
  ic.approved_amount,
  ic.settled_amount,
  ic.status,
  ic.settlement_status,
  ic.claim_type,
  ic.submitted_at,
  ic.approved_at,
  ic.settlement_date,
  ic.documents_status,
  CASE 
    WHEN ic.submitted_at IS NOT NULL THEN 
      EXTRACT(DAY FROM (COALESCE(ic.approved_at, ic.rejected_at, CURRENT_TIMESTAMP) - ic.submitted_at))
    ELSE NULL
  END AS tat_days,
  ic.created_at,
  ic.updated_at
FROM insurance_claims ic
LEFT JOIN users u ON ic.patient_id = u.id
LEFT JOIN organizations o ON ic.hospital_id = o.id;

-- 7. Create view for pre-auth dashboard
CREATE OR REPLACE VIEW v_preauth_dashboard AS
SELECT 
  pa.id,
  pa.pre_auth_number,
  pa.patient_id,
  u.first_name || ' ' || u.last_name AS patient_name,
  pa.hospital_id,
  o.name AS hospital_name,
  pa.policy_number,
  pa.estimated_amount,
  pa.approved_amount,
  pa.status,
  pa.submitted_at,
  pa.approved_at,
  pa.expires_at,
  CASE 
    WHEN pa.expires_at IS NOT NULL AND pa.expires_at < CURRENT_TIMESTAMP THEN true
    ELSE false
  END AS is_expired,
  CASE 
    WHEN pa.submitted_at IS NOT NULL THEN 
      EXTRACT(DAY FROM (COALESCE(pa.approved_at, pa.rejected_at, CURRENT_TIMESTAMP) - pa.submitted_at))
    ELSE NULL
  END AS tat_days,
  pa.created_at,
  pa.updated_at
FROM pre_authorizations pa
LEFT JOIN users u ON pa.patient_id = u.id
LEFT JOIN organizations o ON pa.hospital_id = o.id;

COMMENT ON TABLE pre_authorizations IS 'Pre-authorization requests for cashless admissions';
COMMENT ON TABLE insurance_claims IS 'Insurance claims submissions and tracking';
COMMENT ON VIEW v_claims_dashboard IS 'Dashboard view with calculated fields for claims';
COMMENT ON VIEW v_preauth_dashboard IS 'Dashboard view with calculated fields for pre-authorizations';
