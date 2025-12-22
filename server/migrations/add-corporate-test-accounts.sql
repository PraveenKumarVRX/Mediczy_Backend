-- Migration: Add corporate test accounts
-- Purpose: Migrate hr@mediqzy.com from users table to corporates table
-- Date: 2025-12-22

BEGIN;

-- Step 1: Create corporates table if it doesn't exist (may already exist)
CREATE TABLE IF NOT EXISTS corporates (
    id SERIAL PRIMARY KEY,
    "companyName" VARCHAR(255) NOT NULL,
    "contactPerson" VARCHAR(255),
    "contactPersonName" VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(50),
    industry VARCHAR(100),
    "employeeCount" INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Check if test corporate account already exists
DO $$
DECLARE
    corporate_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM corporates WHERE email = 'hr@mediqzy.com'
    ) INTO corporate_exists;
    
    IF corporate_exists THEN
        RAISE NOTICE 'Corporate account hr@mediqzy.com already exists';
    ELSE
        RAISE NOTICE 'Creating corporate test account hr@mediqzy.com';
    END IF;
END $$;

-- Step 3: Insert corporate test account
-- Password: Team123!@# (hashed with bcrypt, cost 10)
INSERT INTO corporates (
    "companyName",
    "contactPerson",
    "contactPersonName",
    email,
    password,
    "phoneNumber",
    industry,
    "employeeCount",
    status,
    "isActive",
    "createdAt",
    "updatedAt"
) VALUES (
    'Mediqzy Corporate',
    'Corporate HR Manager',
    'HR Manager',
    'hr@mediqzy.com',
    '$2b$10$XEP4Qo5yHPJLWxMpGWcQ5.qLN6Xv3zQ7nR8Kl9Zm6Vw4Hx2Jy3Kl6', -- Team123!@#
    '9999999996',
    'Healthcare',
    500,
    'active',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO UPDATE SET
    "companyName" = EXCLUDED."companyName",
    "contactPerson" = EXCLUDED."contactPerson",
    status = EXCLUDED.status,
    "isActive" = EXCLUDED."isActive",
    "updatedAt" = NOW();

-- Step 4: Add more test corporate accounts for different industries
INSERT INTO corporates (
    "companyName",
    "contactPersonName",
    email,
    password,
    "phoneNumber",
    industry,
    "employeeCount",
    status,
    "isActive"
) VALUES 
    (
        'TechCorp India',
        'Tech HR',
        'hr@techcorp.com',
        '$2b$10$XEP4Qo5yHPJLWxMpGWcQ5.qLN6Xv3zQ7nR8Kl9Zm6Vw4Hx2Jy3Kl6',
        '9999999995',
        'Technology',
        1000,
        'active',
        TRUE
    ),
    (
        'HealthPlus Ltd',
        'Health HR',
        'hr@healthplus.com',
        '$2b$10$XEP4Qo5yHPJLWxMpGWcQ5.qLN6Xv3zQ7nR8Kl9Zm6Vw4Hx2Jy3Kl6',
        '9999999994',
        'Healthcare',
        750,
        'active',
        TRUE
    )
ON CONFLICT (email) DO NOTHING;

-- Step 5: Verification
DO $$
DECLARE
    result_record RECORD;
BEGIN
    RAISE NOTICE '=== Corporate Accounts Created ===';
    
    FOR result_record IN 
        SELECT email, "companyName", status, "employeeCount"
        FROM corporates 
        WHERE email IN ('hr@mediqzy.com', 'hr@techcorp.com', 'hr@healthplus.com')
        ORDER BY email
    LOOP
        RAISE NOTICE 'Email: %, Company: %, Status: %, Employees: %', 
            result_record.email,
            result_record."companyName",
            result_record.status,
            result_record."employeeCount";
    END LOOP;
END $$;

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_corporates_email ON corporates(email);
CREATE INDEX IF NOT EXISTS idx_corporates_status ON corporates(status) WHERE status = 'active';

COMMIT;

-- Verification query (run separately if needed):
-- SELECT email, "companyName", status, "isActive", "employeeCount" FROM corporates;
