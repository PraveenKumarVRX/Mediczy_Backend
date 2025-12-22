-- Insurance Company & Corporate Login System Migration
-- Creates tables for insurance companies, corporates, and their employees

-- ============================================================================
-- INSURANCE COMPANIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance_companies (
  id SERIAL PRIMARY KEY,
  
  -- Company Details
  "companyName" VARCHAR(200) UNIQUE NOT NULL,
  "companyCode" VARCHAR(50) UNIQUE,
  
  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  
  -- Contact Information
  phone VARCHAR(20),
  website VARCHAR(255),
  
  -- Address
  address JSONB DEFAULT '{
    "street": "",
    "city": "",
    "state": "",
    "pincode": "",
    "country": "India"
  }',
  
  -- Regulatory Information
  "irdaiRegistrationNumber" VARCHAR(100) UNIQUE,
  gstin VARCHAR(15),
  
  -- Company Profile
  logo TEXT,
  description TEXT,
  
  -- Business Configuration
  "supportedPolicyTypes" TEXT[] DEFAULT ARRAY['individual', 'family_floater', 'group', 'corporate'],
  
  -- Network & Partners
  "networkHospitals" JSONB DEFAULT '[]',
  "tpaPartners" JSONB DEFAULT '[]',
  
  -- Status
  "isActive" BOOLEAN DEFAULT true,
  "isVerified" BOOLEAN DEFAULT false,
  
  -- Contact Person
  "contactPerson" JSONB DEFAULT '{
    "name": "",
    "designation": "",
    "email": "",
    "phone": ""
  }',
  
  -- Settings
  settings JSONB DEFAULT '{
    "claimProcessingTime": "7-10 days",
    "cashlessEnabled": true,
    "minPolicyAmount": 100000,
    "maxPolicyAmount": 10000000
  }',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_companies_email ON insurance_companies(email);
CREATE INDEX IF NOT EXISTS idx_insurance_companies_code ON insurance_companies("companyCode");
CREATE INDEX IF NOT EXISTS idx_insurance_companies_irdai ON insurance_companies("irdaiRegistrationNumber");
CREATE INDEX IF NOT EXISTS idx_insurance_companies_active ON insurance_companies("isActive");

-- Comments
COMMENT ON TABLE insurance_companies IS 'Insurance companies that offer health insurance policies';
COMMENT ON COLUMN insurance_companies."irdaiRegistrationNumber" IS 'IRDAI (Insurance Regulatory and Development Authority of India) registration number';
COMMENT ON COLUMN insurance_companies."isVerified" IS 'Admin verification status';

-- ============================================================================
-- CORPORATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS corporates (
  id SERIAL PRIMARY KEY,
  
  -- Corporate Details
  "corporateName" VARCHAR(200) NOT NULL,
  "corporateCode" VARCHAR(50) UNIQUE,
  
  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  
  -- Contact Information
  phone VARCHAR(20),
  website VARCHAR(255),
  
  -- Address
  address JSONB DEFAULT '{
    "street": "",
    "city": "",
    "state": "",
    "pincode": "",
    "country": "India"
  }',
  
  -- Business Information
  industry VARCHAR(100),
  "employeeCount" INTEGER,
  
  -- Registration Details
  cin VARCHAR(21),
  gstin VARCHAR(15),
  pan VARCHAR(10),
  
  -- HR Contact
  "hrContact" JSONB DEFAULT '{
    "name": "",
    "designation": "",
    "email": "",
    "phone": ""
  }',
  
  -- Status
  "isActive" BOOLEAN DEFAULT true,
  "isVerified" BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_corporates_email ON corporates(email);
CREATE INDEX IF NOT EXISTS idx_corporates_code ON corporates("corporateCode");
CREATE INDEX IF NOT EXISTS idx_corporates_active ON corporates("isActive");

-- Comments
COMMENT ON TABLE corporates IS 'Corporate entities that purchase group insurance policies for employees';
COMMENT ON COLUMN corporates.cin IS 'Corporate Identification Number';
COMMENT ON COLUMN corporates.industry IS 'Industry sector (IT, Manufacturing, Healthcare, etc.)';

-- ============================================================================
-- CORPORATE EMPLOYEES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS corporate_employees (
  id SERIAL PRIMARY KEY,
  
  "corporateId" INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL,
  
  -- Employee Details
  "employeeId" VARCHAR(50) NOT NULL,
  department VARCHAR(100),
  designation VARCHAR(100),
  
  -- Employment Status
  "joiningDate" DATE,
  "exitDate" DATE,
  "isActive" BOOLEAN DEFAULT true,
  
  -- Dependent Information
  dependents JSONB DEFAULT '[]',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint
  CONSTRAINT unique_corporate_employee UNIQUE ("corporateId", "employeeId")
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_corporate_employees_corporate ON corporate_employees("corporateId");
CREATE INDEX IF NOT EXISTS idx_corporate_employees_user ON corporate_employees("userId");
CREATE INDEX IF NOT EXISTS idx_corporate_employees_empid ON corporate_employees("employeeId");
CREATE INDEX IF NOT EXISTS idx_corporate_employees_active ON corporate_employees("isActive");

-- Comments
COMMENT ON TABLE corporate_employees IS 'Employees of corporates covered under group insurance policies';
COMMENT ON COLUMN corporate_employees."employeeId" IS 'Corporate-assigned employee ID';
COMMENT ON COLUMN corporate_employees.dependents IS 'List of family members covered under policy';

-- ============================================================================
-- UPDATE INSURANCE POLICIES TABLE (if needed)
-- ============================================================================

-- Add foreign key constraints if not already present
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_insurance_policies_company'
  ) THEN
    ALTER TABLE insurance_policies 
      ADD CONSTRAINT fk_insurance_policies_company 
      FOREIGN KEY ("insuranceCompanyId") 
      REFERENCES insurance_companies(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_insurance_policies_corporate'
  ) THEN
    ALTER TABLE insurance_policies 
      ADD CONSTRAINT fk_insurance_policies_corporate 
      FOREIGN KEY ("corporateId") 
      REFERENCES corporates(id);
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify all tables exist
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('insurance_companies', 'corporates', 'corporate_employees')
ORDER BY table_name;
