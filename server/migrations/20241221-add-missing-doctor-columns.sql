-- Migration: Add Missing Doctor Table Columns
-- Date: 2024-12-21
-- Description: Adds missing columns to doctors table to match the Sequelize model definition

-- Add slotDuration column
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "slotDuration" INTEGER DEFAULT 30;
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_slotduration_check;
ALTER TABLE doctors ADD CONSTRAINT doctors_slotduration_check CHECK ("slotDuration" IN (15, 30, 45, 60));

-- Add JSONB columns
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "clinicAddress_json" JSONB DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "feeStructure" JSONB DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "weeklySchedule" JSONB DEFAULT '{
  "monday": {"isOff": false, "online": {"enabled": true, "startTime": "09:00", "endTime": "13:00"}, "inPerson": {"enabled": true, "startTime": "14:00", "endTime": "18:00"}},
  "tuesday": {"isOff": false, "online": {"enabled": true, "startTime": "09:00", "endTime": "13:00"}, "inPerson": {"enabled": true, "startTime": "14:00", "endTime": "18:00"}},
  "wednesday": {"isOff": false, "online": {"enabled": true, "startTime": "09:00", "endTime": "13:00"}, "inPerson": {"enabled": true, "startTime": "14:00", "endTime": "18:00"}},
  "thursday": {"isOff": false, "online": {"enabled": true, "startTime": "09:00", "endTime": "13:00"}, "inPerson": {"enabled": true, "startTime": "14:00", "endTime": "18:00"}},
  "friday": {"isOff": false, "online": {"enabled": true, "startTime": "09:00", "endTime": "13:00"}, "inPerson": {"enabled": true, "startTime": "14:00", "endTime": "18:00"}},
  "saturday": {"isOff": false, "online": {"enabled": true, "startTime": "09:00", "endTime": "13:00"}, "inPerson": {"enabled": false, "startTime": "", "endTime": ""}},
  "sunday": {"isOff": true, "online": {"enabled": false, "startTime": "", "endTime": ""}, "inPerson": {"enabled": false, "startTime": "", "endTime": ""}}
}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "practiceLocations" JSONB DEFAULT '[]';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "reviews_json" JSONB DEFAULT '[]';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "professionalSettings" JSONB DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

-- Add array columns
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "specializations" TEXT[] DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "qualifications" TEXT[] DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "servicesOffered" TEXT[] DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "languages" TEXT[] DEFAULT '{}';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "documents" TEXT[] DEFAULT '{}';

-- Add column comments for documentation
COMMENT ON COLUMN doctors."slotDuration" IS 'Duration of each appointment slot in minutes (15, 30, 45, or 60)';
COMMENT ON COLUMN doctors."clinicAddress_json" IS 'Full clinic address in structured JSONB format';
COMMENT ON COLUMN doctors."feeStructure" IS 'Detailed fee structure: {online: 500, inPerson: 800, followUp: 300}';
COMMENT ON COLUMN doctors."weeklySchedule" IS 'Weekly availability schedule with online/in-person time windows';
COMMENT ON COLUMN doctors."practiceLocations" IS 'Array of practice location objects with id, name, address, consultationFee';
COMMENT ON COLUMN doctors."reviews_json" IS 'Array of review objects (replacing legacy text field)';
COMMENT ON COLUMN doctors."professionalSettings" IS 'Professional preferences and settings';
COMMENT ON COLUMN doctors."metadata" IS 'Additional metadata and custom fields';
COMMENT ON COLUMN doctors."specializations" IS 'Multiple specializations array (Cardiology, Dermatology, etc.)';
COMMENT ON COLUMN doctors."qualifications" IS 'Array of degrees/certifications (MBBS, MD, DNB, etc.)';
COMMENT ON COLUMN doctors."servicesOffered" IS 'Array of services offered by the doctor';
COMMENT ON COLUMN doctors."languages" IS 'Languages spoken by the doctor';
COMMENT ON COLUMN doctors."documents" IS 'Array of uploaded document URLs (certificates, licenses, etc.)';

-- Verification query
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'doctors' 
    AND column_name IN (
        'slotDuration', 
        'clinicAddress_json', 
        'feeStructure', 
        'weeklySchedule',
        'practiceLocations',
        'reviews_json',
        'professionalSettings',
        'metadata',
        'specializations',
        'qualifications',
        'servicesOffered',
        'languages',
        'documents'
    )
ORDER BY column_name;
