-- Health Insurance Policy Rule Engine Database Migration
-- Creates tables for insurance policies, rules, claims, and policy members
-- Supports comprehensive policy management with rule-based adjudication

-- ============================================================================
-- INSURANCE POLICIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_policies (
  id SERIAL PRIMARY KEY,
  
  -- Policy Identification
  "policyNumber" VARCHAR(50) UNIQUE NOT NULL,
  "policyName" VARCHAR(200) NOT NULL,
  
  -- Ownership & Distribution
  "insuranceCompanyId" INTEGER NOT NULL,
  "brokerId" INTEGER,
  "tpaId" INTEGER,
  "corporateId" INTEGER,
  
  -- Policy Type
  "policyType" VARCHAR(20) NOT NULL DEFAULT 'individual'
    CHECK ("policyType" IN ('individual', 'family_floater', 'group', 'corporate')),
  
  -- Coverage & Financials
  "sumInsured" DECIMAL(15, 2) NOT NULL,
  premium DECIMAL(15, 2) NOT NULL,
  
  -- Policy Period
  "policyStartDate" TIMESTAMP NOT NULL,
  "policyEndDate" TIMESTAMP NOT NULL,
  
  -- Policy Status
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'cancelled', 'lapsed')),
  
  -- Rule Engine Configuration
  "ruleVersion" VARCHAR(20) DEFAULT '1.0',
  
  -- Complete Rule Set (JSONB)
  rules JSONB DEFAULT '{}',
  
  -- Coverage Configuration
  "coverageConfig" JSONB DEFAULT '{
    "hospitalization": true,
    "daycare": true,
    "domiciliary": false,
    "maternity": false,
    "newborn": false,
    "prePostHospitalization": {"pre": 30, "post": 60},
    "ambulance": true,
    "opd": false,
    "ayush": true
  }',
  
  -- Financial Limits
  limits JSONB DEFAULT '{
    "roomRent": null,
    "icuRent": null,
    "cataract": null,
    "dental": null,
    "deductible": 0,
    "copayment": 0
  }',
  
  -- Waiting Periods
  "waitingPeriods" JSONB DEFAULT '{
    "initial": 30,
    "specificDiseases": {
      "1year": [],
      "2year": [],
      "3year": [],
      "4year": []
    },
    "ped": 36,
    "maternity": 48
  }',
  
  -- Network Details
  "networkConfig" JSONB DEFAULT '{
    "cashlessEnabled": true,
    "ppnMandatory": false,
    "networkHospitals": []
  }',
  
  -- Exclusions & Special Conditions
  exclusions JSONB DEFAULT '{
    "firstYear": [],
    "permanent": [],
    "suicideWaiver": true,
    "terrorism": false
  }',
  
  -- Add-ons
  addons JSONB DEFAULT '[]',
  
  -- Terms & Conditions
  "termsAndConditions" TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_policies_company ON insurance_policies("insuranceCompanyId");
CREATE INDEX IF NOT EXISTS idx_insurance_policies_broker ON insurance_policies("brokerId");
CREATE INDEX IF NOT EXISTS idx_insurance_policies_tpa ON insurance_policies("tpaId");
CREATE INDEX IF NOT EXISTS idx_insurance_policies_corporate ON insurance_policies("corporateId");
CREATE INDEX IF NOT EXISTS idx_insurance_policies_status ON insurance_policies(status);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_type ON insurance_policies("policyType");

-- Comments
COMMENT ON TABLE insurance_policies IS 'Health insurance policy master table with comprehensive rule configuration';
COMMENT ON COLUMN insurance_policies."policyNumber" IS 'Unique policy identification number';
COMMENT ON COLUMN insurance_policies."insuranceCompanyId" IS 'Insurance company offering this policy';
COMMENT ON COLUMN insurance_policies."brokerId" IS 'Broker who sold/manages this policy';
COMMENT ON COLUMN insurance_policies."tpaId" IS 'Third Party Administrator for claims processing';
COMMENT ON COLUMN insurance_policies."corporateId" IS 'Corporate purchaser for group policies';
COMMENT ON COLUMN insurance_policies.rules IS 'Complete policy rules configuration in JSON format';

-- ============================================================================
-- POLICY RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_rules (
  id SERIAL PRIMARY KEY,
  
  "policyId" INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  
  -- Rule Identification
  "ruleCode" VARCHAR(50) NOT NULL,
  "ruleName" VARCHAR(200) NOT NULL,
  "ruleCategory" VARCHAR(30) NOT NULL
    CHECK ("ruleCategory" IN (
      'eligibility',
      'underwriting',
      'coverage',
      'waiting_period',
      'claims',
      'financial',
      'network',
      'exclusion',
      'addon'
    )),
  
  -- Rule Configuration
  parameters JSONB DEFAULT '{}',
  
  -- Rule Logic
  condition TEXT,
  action TEXT,
  
  -- Priority & Version
  priority INTEGER DEFAULT 100,
  version VARCHAR(20) DEFAULT '1.0',
  
  -- Status
  "isActive" BOOLEAN DEFAULT true,
  "effectiveFrom" TIMESTAMP,
  "effectiveTo" TIMESTAMP,
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_rules_policy ON policy_rules("policyId");
CREATE INDEX IF NOT EXISTS idx_policy_rules_code ON policy_rules("ruleCode");
CREATE INDEX IF NOT EXISTS idx_policy_rules_category ON policy_rules("ruleCategory");
CREATE INDEX IF NOT EXISTS idx_policy_rules_active ON policy_rules("isActive");

-- Comments
COMMENT ON TABLE policy_rules IS 'Individual policy rules for eligibility, coverage, claims adjudication';
COMMENT ON COLUMN policy_rules."ruleCode" IS 'Unique rule code (e.g., ELIG_FAMILY_DEF, WAIT_PED)';
COMMENT ON COLUMN policy_rules.parameters IS 'Rule-specific parameters in JSON format';
COMMENT ON COLUMN policy_rules.priority IS 'Rule execution priority (lower number = higher priority)';

-- ============================================================================
-- INSURANCE CLAIMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_claims (
  id SERIAL PRIMARY KEY,
  
  -- Claim Identification
  "claimNumber" VARCHAR(50) UNIQUE NOT NULL,
  
  -- Related Entities
  "policyId" INTEGER NOT NULL REFERENCES insurance_policies(id),
  "patientId" INTEGER NOT NULL,
  "hospitalId" INTEGER,
  "tpaId" INTEGER,
  
  -- Claim Details
  "claimType" VARCHAR(20) NOT NULL
    CHECK ("claimType" IN ('cashless', 'reimbursement', 'preauth')),
  "treatmentType" VARCHAR(20) NOT NULL
    CHECK ("treatmentType" IN ('inpatient', 'outpatient', 'daycare', 'domiciliary', 'maternity')),
  
  -- Admission Details
  "admissionDate" TIMESTAMP,
  "dischargeDate" TIMESTAMP,
  
  -- Diagnosis
  diagnosis TEXT NOT NULL,
  "icdCode" VARCHAR(20),
  
  -- Financial Details
  "claimedAmount" DECIMAL(15, 2) NOT NULL,
  "approvedAmount" DECIMAL(15, 2) DEFAULT 0,
  "deductedAmount" DECIMAL(15, 2) DEFAULT 0,
  "settledAmount" DECIMAL(15, 2) DEFAULT 0,
  
  -- Deductions Breakdown
  deductions JSONB DEFAULT '{
    "roomRentDeduction": 0,
    "proportionateDeduction": 0,
    "copayment": 0,
    "deductible": 0,
    "nonMedicalExpenses": 0,
    "exclusions": 0
  }',
  
  -- Rule Engine Evaluation
  "ruleEvaluationResult" JSONB DEFAULT '{}',
  
  -- Documents
  documents JSONB DEFAULT '[]',
  
  -- Status & Timeline
  status VARCHAR(30) DEFAULT 'initiated'
    CHECK (status IN (
      'initiated',
      'documents_pending',
      'under_review',
      'query_raised',
      'approved',
      'partially_approved',
      'rejected',
      'settled'
    )),
  
  "intimationDate" TIMESTAMP,
  "submissionDate" TIMESTAMP,
  "settlementDate" TIMESTAMP,
  
  -- Rejection/Query Details
  "rejectionReason" TEXT,
  "queryDetails" JSONB DEFAULT '[]',
  
  -- Remarks
  remarks TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_claims_number ON insurance_claims("claimNumber");
CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy ON insurance_claims("policyId");
CREATE INDEX IF NOT EXISTS idx_insurance_claims_patient ON insurance_claims("patientId");
CREATE INDEX IF NOT EXISTS idx_insurance_claims_hospital ON insurance_claims("hospitalId");
CREATE INDEX IF NOT EXISTS idx_insurance_claims_tpa ON insurance_claims("tpaId");
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_type ON insurance_claims("claimType");

-- Comments
COMMENT ON TABLE insurance_claims IS 'Health insurance claims with rule engine adjudication';
COMMENT ON COLUMN insurance_claims."claimNumber" IS 'Unique claim identification number';
COMMENT ON COLUMN insurance_claims."ruleEvaluationResult" IS 'Results of rule engine evaluation for claim adjudication';
COMMENT ON COLUMN insurance_claims.deductions IS 'Breakdown of all deductions applied to claim';

-- ============================================================================
-- POLICY MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_members (
  id SERIAL PRIMARY KEY,
  
  "policyId" INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL,
  
  -- Member Details
  relationship VARCHAR(20) NOT NULL
    CHECK (relationship IN ('self', 'spouse', 'son', 'daughter', 'father', 'mother', 'other')),
  
  -- Coverage
  "isActive" BOOLEAN DEFAULT true,
  "coverageStartDate" TIMESTAMP NOT NULL,
  "coverageEndDate" TIMESTAMP,
  
  -- Sum Insured
  "individualSumInsured" DECIMAL(15, 2),
  
  -- Pre-Existing Diseases
  "preExistingDiseases" JSONB DEFAULT '[]',
  
  -- Utilization Tracking
  "sumInsuredUsed" DECIMAL(15, 2) DEFAULT 0,
  "sumInsuredRemaining" DECIMAL(15, 2),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_members_policy ON policy_members("policyId");
CREATE INDEX IF NOT EXISTS idx_policy_members_user ON policy_members("userId");
CREATE INDEX IF NOT EXISTS idx_policy_members_relationship ON policy_members(relationship);
CREATE INDEX IF NOT EXISTS idx_policy_members_active ON policy_members("isActive");

-- Comments
COMMENT ON TABLE policy_members IS 'Members covered under each insurance policy';
COMMENT ON COLUMN policy_members."preExistingDiseases" IS 'Declared pre-existing diseases with waiting period tracking';
COMMENT ON COLUMN policy_members."sumInsuredUsed" IS 'Sum insured utilized during policy period';
COMMENT ON COLUMN policy_members."sumInsuredRemaining" IS 'Sum insured remaining for claims';

-- ============================================================================
-- OPD & WELLNESS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS opd_wallets (
  id SERIAL PRIMARY KEY,
  "policyId" INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  "memberId" INTEGER,
  "annualLimit" DECIMAL(15, 2) NOT NULL,
  "utilizedAmount" DECIMAL(15, 2) DEFAULT 0,
  balance DECIMAL(15, 2),
  "perVisitLimit" DECIMAL(15, 2),
  "visitsThisMonth" INTEGER DEFAULT 0,
  "lastVisitDate" TIMESTAMP,
  "periodStart" TIMESTAMP NOT NULL,
  "periodEnd" TIMESTAMP NOT NULL,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opd_wallets_policy ON opd_wallets("policyId");
CREATE INDEX IF NOT EXISTS idx_opd_wallets_member ON opd_wallets("memberId");

CREATE TABLE IF NOT EXISTS opd_claims (
  id SERIAL PRIMARY KEY,
  "claimNumber" VARCHAR(50) UNIQUE NOT NULL,
  "policyId" INTEGER NOT NULL REFERENCES insurance_policies(id),
  "walletId" INTEGER REFERENCES opd_wallets(id),
  "memberId" INTEGER NOT NULL,
  "serviceType" VARCHAR(30) NOT NULL CHECK ("serviceType" IN ('consultation', 'diagnostics', 'pharmacy', 'teleconsult')),
  "serviceDate" TIMESTAMP NOT NULL,
  "providerId" INTEGER,
  "providerName" VARCHAR(255),
  "isNetworkProvider" BOOLEAN DEFAULT false,
  "claimedAmount" DECIMAL(15, 2) NOT NULL,
  "approvedAmount" DECIMAL(15, 2) DEFAULT 0,
  "copayAmount" DECIMAL(15, 2) DEFAULT 0,
  "settledAmount" DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'settled')),
  "abuseFlags" JSONB DEFAULT '[]',
  documents JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opd_claims_number ON opd_claims("claimNumber");
CREATE INDEX IF NOT EXISTS idx_opd_claims_policy ON opd_claims("policyId");

CREATE TABLE IF NOT EXISTS wellness_wallets (
  id SERIAL PRIMARY KEY,
  "policyId" INTEGER NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  "memberId" INTEGER NOT NULL,
  "annualPoints" INTEGER NOT NULL,
  "pointsEarned" INTEGER DEFAULT 0,
  "pointsSpent" INTEGER DEFAULT 0,
  "pointsBalance" INTEGER,
  "engagementScore" INTEGER DEFAULT 0,
  "riskScore" INTEGER DEFAULT 0,
  "rewardScore" INTEGER DEFAULT 0,
  "periodStart" TIMESTAMP NOT NULL,
  "periodEnd" TIMESTAMP NOT NULL,
  "carryForward" BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wellness_wallets_policy ON wellness_wallets("policyId");
CREATE INDEX IF NOT EXISTS idx_wellness_wallets_member ON wellness_wallets("memberId");

CREATE TABLE IF NOT EXISTS wellness_activities (
  id SERIAL PRIMARY KEY,
  "walletId" INTEGER NOT NULL REFERENCES wellness_wallets(id) ON DELETE CASCADE,
  "memberId" INTEGER NOT NULL,
  "activityType" VARCHAR(50) NOT NULL CHECK ("activityType" IN ('health_checkup', 'mental_wellness', 'nutrition_coaching', 'fitness_program', 'chronic_management', 'preventive_screening')),
  "activityDate" TIMESTAMP NOT NULL,
  "pointsEarned" INTEGER DEFAULT 0,
  "scoreImpact" INTEGER DEFAULT 0,
  "providerId" INTEGER,
  "providerName" VARCHAR(255),
  "isCompleted" BOOLEAN DEFAULT false,
  "completionDate" TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wellness_activities_wallet ON wellness_activities("walletId");

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_name IN ('insurance_policies', 'policy_rules', 'insurance_claims', 'policy_members', 'opd_wallets', 'opd_claims', 'wellness_wallets', 'wellness_activities')
ORDER BY table_name;
