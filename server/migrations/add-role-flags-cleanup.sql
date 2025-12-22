-- Migration: Add role flags to users table and cleanup cross-role contamination
-- Purpose: Enforce proper role separation across all login endpoints
-- Date: 2025-12-22

BEGIN;

-- Step 1: Add role flags if they don't exist
DO $$
BEGIN
    -- Add isTeam flag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'isTeam') THEN
        ALTER TABLE users ADD COLUMN "isTeam" BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added isTeam column to users table';
    ELSE
        RAISE NOTICE 'isTeam column already exists';
    END IF;

    -- Add isCorporate flag
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'isCorporate') THEN
        ALTER TABLE users ADD COLUMN "isCorporate" BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added isCorporate column to users table';
    ELSE
        RAISE NOTICE 'isCorporate column already exists';
    END IF;
END $$;

-- Step 2: Log existing contamination
DO $$
DECLARE
    admin_count INT;
    team_count INT;
    corporate_count INT;
    role_based_count INT;
BEGIN
    -- Count users with admin email but no isAdmin flag
    SELECT COUNT(*) INTO admin_count 
    FROM users 
    WHERE email LIKE '%admin%' AND ("isAdmin" IS NULL OR "isAdmin" = FALSE);
    
    -- Count users with team email but no isTeam flag
    SELECT COUNT(*) INTO team_count 
    FROM users 
    WHERE email LIKE '%team%' AND ("isTeam" IS NULL OR "isTeam" = FALSE);
    
    -- Count users with corporate domain but no isCorporate flag
    SELECT COUNT(*) INTO corporate_count 
    FROM users 
    WHERE email LIKE '%@mediqzy.com%' AND ("isCorporate" IS NULL OR "isCorporate" = FALSE);
    
    -- Count users with role field set to staff roles
    SELECT COUNT(*) INTO role_based_count 
    FROM users 
    WHERE role IN ('doctor', 'nurse', 'assistant', 'team', 'admin', 'corporate');
    
    RAISE NOTICE 'Found % admin emails without isAdmin flag', admin_count;
    RAISE NOTICE 'Found % team emails without isTeam flag', team_count;
    RAISE NOTICE 'Found % corporate emails without isCorporate flag', corporate_count;
    RAISE NOTICE 'Found % users with staff role values', role_based_count;
END $$;

-- Step 3: Fix existing legitimate admin/team/corporate users
-- Set isAdmin for admin emails
UPDATE users 
SET "isAdmin" = TRUE 
WHERE email LIKE '%admin@mediczy.com%' 
  AND ("isAdmin" IS NULL OR "isAdmin" = FALSE);

-- Set isTeam for team emails
UPDATE users 
SET "isTeam" = TRUE 
WHERE email LIKE '%team@mediczy.com%' 
  AND ("isTeam" IS NULL OR "isTeam" = FALSE);

-- Set isCorporate for corporate domain emails
UPDATE users 
SET "isCorporate" = TRUE 
WHERE email LIKE '%@mediqzy.com%' 
  AND email NOT LIKE '%doctor%'
  AND email NOT LIKE '%user%'
  AND ("isCorporate" IS NULL OR "isCorporate" = FALSE);

-- Step 4: Remove doctor/nurse/staff records from users table (already done earlier, but ensure)
DELETE FROM users 
WHERE role IN ('doctor', 'nurse', 'assistant', 'lab_admin', 'pharmacy_admin', 
               'hospital_admin', 'clinic_admin', 'homecare_admin', 'ambulance_admin')
   OR email LIKE '%doctor@mediczy.com%'
   OR email LIKE '%nurse@mediczy.com%'
   OR email LIKE '%assistant@mediczy.com%';

-- Step 5: Set default role for users without role
UPDATE users 
SET role = 'user' 
WHERE role IS NULL OR role = '';

-- Step 6: Verification - show current state
DO $$
DECLARE
    result_record RECORD;
BEGIN
    RAISE NOTICE '=== Users Table Role Distribution ===';
    
    FOR result_record IN 
        SELECT 
            role,
            COUNT(*) as count,
            COUNT(*) FILTER (WHERE "isAdmin" = TRUE) as admin_count,
            COUNT(*) FILTER (WHERE "isTeam" = TRUE) as team_count,
            COUNT(*) FILTER (WHERE "isCorporate" = TRUE) as corporate_count
        FROM users 
        GROUP BY role
        ORDER BY count DESC
    LOOP
        RAISE NOTICE 'Role: %, Total: %, isAdmin: %, isTeam: %, isCorporate: %', 
            result_record.role, 
            result_record.count, 
            result_record.admin_count,
            result_record.team_count,
            result_record.corporate_count;
    END LOOP;
    
    RAISE NOTICE '=== Migration Complete ===';
END $$;

-- Step 7: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_isTeam ON users("isTeam") WHERE "isTeam" = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_isCorporate ON users("isCorporate") WHERE "isCorporate" = TRUE;

-- Step 8: Create audit log entry
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully';
    RAISE NOTICE 'Added: isTeam, isCorporate flags';
    RAISE NOTICE 'Cleaned: doctor/staff records from users table';
    RAISE NOTICE 'Updated: role flags for existing admin/team/corporate users';
END $$;

COMMIT;

-- Verification queries (run separately if needed):
-- SELECT email, role, "isAdmin", "isTeam", "isCorporate" FROM users WHERE "isAdmin" = TRUE OR "isTeam" = TRUE OR "isCorporate" = TRUE;
-- SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY COUNT(*) DESC;
