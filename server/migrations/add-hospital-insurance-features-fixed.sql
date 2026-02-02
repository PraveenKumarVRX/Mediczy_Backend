-- Migration: Add IHX-like Insurance Claims Management Features
-- Date: 2026-01-31
-- Description: Extends insurance_claims table and creates pre_authorizations table
-- Uses existing 'tenants' table for hospital references

-- 1. Create pre_authorizations table
CREATE TABLE IF NOT EXISTS pre_authorizations (
  id SERIAL PRIMARY KEY,
  pre_auth_number VARCHAR(50) NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hospital_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  policy_number VARCHAR(100) NOT NULL,
  insurance_provider_id INTEGER,
  tpa_id INTEGER,
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
  organization_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for pre_authorizations
CREATE INDEX IF NOT EXISTS idx_pre_auth_number ON pre_authorizations(pre_auth_number);
CREATE INDEX IF NOT EXISTS idx_pre_auth_patient ON pre_authorizations(patient_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_hospital ON pre_authorizations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_status ON pre_authorizations(status);
CREATE INDEX IF NOT EXISTS idx_pre_auth_org ON pre_authorizations(organization_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_submitted ON pre_authorizations(submitted_at);
CREATE INDEX IF NOT EXISTS idx_pre_auth_expires ON pre_authorizations(expires_at);

-- 2. Add new columns to insurance_claims table
DO $$ 
BEGIN
  -- Add hospital_id if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='hospital_id') THEN
    ALTER TABLE insurance_claims ADD COLUMN hospital_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;
  END IF;

  -- Add pre_auth_id if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='pre_auth_id') THEN
    ALTER TABLE insurance_claims ADD COLUMN pre_auth_id INTEGER REFERENCES pre_authorizations(id) ON DELETE SET NULL;
  END IF;

  -- Add insurance_provider_id if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='insurance_provider_id') THEN
    ALTER TABLE insurance_claims ADD COLUMN insurance_provider_id INTEGER;
  END IF;

  -- Add tpa_id if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='tpa_id') THEN
    ALTER TABLE insurance_claims ADD COLUMN tpa_id INTEGER;
  END IF;

  -- Add settled_amount if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='settled_amount') THEN
    ALTER TABLE insurance_claims ADD COLUMN settled_amount DECIMAL(10, 2);
  END IF;

  -- Add deducted_amount if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='deducted_amount') THEN
    ALTER TABLE insurance_claims ADD COLUMN deducted_amount DECIMAL(10, 2);
  END IF;

  -- Add claim_type if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='claim_type') THEN
    ALTER TABLE insurance_claims ADD COLUMN claim_type VARCHAR(20) DEFAULT 'cashless' CHECK (claim_type IN ('cashless', 'reimbursement', 'emergency'));
  END IF;

  -- Add settlement_status if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='settlement_status') THEN
    ALTER TABLE insurance_claims ADD COLUMN settlement_status VARCHAR(20) CHECK (settlement_status IN ('pending', 'partial', 'settled', 'rejected'));
  END IF;

  -- Add submitted_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='submitted_at') THEN
    ALTER TABLE insurance_claims ADD COLUMN submitted_at TIMESTAMP;
  END IF;

  -- Add submitted_by if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='submitted_by') THEN
    ALTER TABLE insurance_claims ADD COLUMN submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- Add approved_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='approved_at') THEN
    ALTER TABLE insurance_claims ADD COLUMN approved_at TIMESTAMP;
  END IF;

  -- Add rejected_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='rejected_at') THEN
    ALTER TABLE insurance_claims ADD COLUMN rejected_at TIMESTAMP;
  END IF;

  -- Add settlement_date if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='settlement_date') THEN
    ALTER TABLE insurance_claims ADD COLUMN settlement_date TIMESTAMP;
  END IF;

  -- Add hospitalization_details if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='hospitalization_details') THEN
    ALTER TABLE insurance_claims ADD COLUMN hospitalization_details JSONB;
  END IF;

  -- Add diagnosis if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='diagnosis') THEN
    ALTER TABLE insurance_claims ADD COLUMN diagnosis TEXT;
  END IF;

  -- Add treatment_details if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='treatment_details') THEN
    ALTER TABLE insurance_claims ADD COLUMN treatment_details JSONB;
  END IF;

  -- Add documents_status if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='documents_status') THEN
    ALTER TABLE insurance_claims ADD COLUMN documents_status VARCHAR(20) DEFAULT 'incomplete' CHECK (documents_status IN ('incomplete', 'complete', 'pending_verification'));
  END IF;

  -- Add required_documents if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='required_documents') THEN
    ALTER TABLE insurance_claims ADD COLUMN required_documents JSONB DEFAULT '["discharge_summary", "bills", "investigation_reports", "prescription"]'::jsonb;
  END IF;

  -- Add query_history if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='query_history') THEN
    ALTER TABLE insurance_claims ADD COLUMN query_history JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Add last_modified_by if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insurance_claims' AND column_name='last_modified_by') THEN
    ALTER TABLE insurance_claims ADD COLUMN last_modified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Update existing status constraint to include new statuses
ALTER TABLE insurance_claims DROP CONSTRAINT IF EXISTS insurance_claims_status_check;
ALTER TABLE insurance_claims 
  ADD CONSTRAINT insurance_claims_status_check 
  CHECK (status IN ('draft', 'submitted', 'pending', 'query', 'approved', 'rejected', 'paid', 'under_review'));

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
  t.name AS hospital_name,
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
LEFT JOIN tenants t ON ic.hospital_id = t.id;

-- 7. Create view for pre-auth dashboard
CREATE OR REPLACE VIEW v_preauth_dashboard AS
SELECT 
  pa.id,
  pa.pre_auth_number,
  pa.patient_id,
  u.first_name || ' ' || u.last_name AS patient_name,
  pa.hospital_id,
  t.name AS hospital_name,
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
LEFT JOIN tenants t ON pa.hospital_id = t.id;

-- 8. Add comments
COMMENT ON TABLE pre_authorizations IS 'Pre-authorization requests for cashless admissions';
COMMENT ON TABLE insurance_claims IS 'Insurance claims submissions and tracking';
COMMENT ON VIEW v_claims_dashboard IS 'Dashboard view with calculated fields for claims';
COMMENT ON VIEW v_preauth_dashboard IS 'Dashboard view with calculated fields for pre-authorizations';

-- Migration complete
SELECT 'Hospital Insurance Features Migration Complete!' AS status;
