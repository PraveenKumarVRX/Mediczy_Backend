-- insurance_claims is shared platform-wide for genuine insurer/TPA claims
-- (hospital-insurance.route.js, public-claim-status.route.js) AND, as of this
-- change, employer-funded wellness/OPD reimbursements filed by corporate
-- employees (employee-network.route.js). Nothing previously distinguished
-- the two. Default 'insurance' preserves existing behavior for every
-- pre-existing caller; wellness/OPD insert sites set 'wellness' explicitly.

ALTER TABLE insurance_claims
  ADD COLUMN IF NOT EXISTS benefit_category VARCHAR(20) NOT NULL DEFAULT 'insurance'
    CHECK (benefit_category IN ('insurance', 'wellness'));

CREATE INDEX IF NOT EXISTS idx_insurance_claims_benefit_category ON insurance_claims (benefit_category);
