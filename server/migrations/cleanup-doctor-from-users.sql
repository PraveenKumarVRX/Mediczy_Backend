-- Clean up doctor/staff accounts from users table
-- Doctors/staff should only exist in their dedicated tables (doctors, nurses, etc.)
-- This migration removes any cross-contamination from test/seed data

-- Step 1: Identify and log affected records
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO affected_count
    FROM users 
    WHERE role IN ('doctor', 'nurse', 'assistant', 'lab_admin', 'pharmacy_admin', 
                   'hospital_admin', 'clinic_admin', 'homecare_admin', 'ambulance_admin')
       OR email LIKE '%doctor@mediczy.com%'
       OR email LIKE '%nurse@mediczy.com%'
       OR email LIKE '%assistant@mediczy.com%';
    
    RAISE NOTICE 'Found % doctor/staff records in users table to remove', affected_count;
END $$;

-- Step 2: Delete doctor/staff records from users table
DELETE FROM users 
WHERE role IN ('doctor', 'nurse', 'assistant', 'lab_admin', 'pharmacy_admin', 
               'hospital_admin', 'clinic_admin', 'homecare_admin', 'ambulance_admin')
   OR email LIKE '%doctor@mediczy.com%'
   OR email LIKE '%nurse@mediczy.com%'
   OR email LIKE '%assistant@mediczy.com%';

-- Step 3: Verify cleanup
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No doctor/staff records in users table'
        ELSE 'WARNING: ' || COUNT(*) || ' doctor/staff records still exist'
    END AS cleanup_status
FROM users 
WHERE role IN ('doctor', 'nurse', 'assistant', 'lab_admin', 'pharmacy_admin', 
               'hospital_admin', 'clinic_admin', 'homecare_admin', 'ambulance_admin');

-- Step 4: Show remaining user roles
SELECT 
    role,
    COUNT(*) as count
FROM users
GROUP BY role
ORDER BY count DESC;
