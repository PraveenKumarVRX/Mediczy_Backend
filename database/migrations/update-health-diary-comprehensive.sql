-- Health Diary Schema Update
-- Adds comprehensive health tracking with precise timestamps

-- Update entryDate to TIMESTAMP for precise timing (year-month-day-hour-minute-second)
ALTER TABLE health_diaries 
  ALTER COLUMN "entryDate" TYPE TIMESTAMP USING "entryDate"::timestamp;

-- Update entryType enum to include all health event types
ALTER TYPE "enum_health_diaries_entryType" RENAME TO "enum_health_diaries_entryType_old";

CREATE TYPE "enum_health_diaries_entryType" AS ENUM (
  'symptom',
  'medication', 
  'mood',
  'activity',
  'diet',
  'sleep',
  'vital',
  'note',
  'prescription',
  'consultation',
  'lab_test',
  'lab_result',
  'appointment',
  'device_reading',
  'ai_consultation',
  'diagnosis',
  'procedure',
  'imaging',
  'vaccination',
  'allergy',
  'insurance_claim'
);

-- Update column with new enum type
ALTER TABLE health_diaries 
  ALTER COLUMN "entryType" TYPE "enum_health_diaries_entryType" 
  USING "entryType"::text::"enum_health_diaries_entryType";

-- Drop old enum
DROP TYPE "enum_health_diaries_entryType_old";

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_health_diaries_userid_entrydate 
  ON health_diaries (userId, entryDate DESC);

CREATE INDEX IF NOT EXISTS idx_health_diaries_entrytype_entrydate 
  ON health_diaries (entryType, entryDate DESC);

CREATE INDEX IF NOT EXISTS idx_health_diaries_data_gin 
  ON health_diaries USING gin (data);

-- Add comment to entryDate column
COMMENT ON COLUMN health_diaries."entryDate" IS 'Precise timestamp: year-month-day-hour-minute-second';

-- Update existing 'note' entries to 'ai_consultation' if they contain AI consultation data
UPDATE health_diaries 
SET "entryType" = 'ai_consultation'
WHERE "entryType" = 'note' 
  AND data->>'consultationType' = 'ai_chat';

-- Create view for health timeline
CREATE OR REPLACE VIEW health_timeline AS
SELECT 
  hd.id,
  hd.userId,
  hd.entryDate,
  hd.entryType,
  hd.title,
  hd.description,
  hd.data,
  hd.linkedRecordId,
  hd.linkedRecordType,
  hd.createdAt,
  hd.updatedAt,
  DATE(hd.entryDate) as entry_day,
  EXTRACT(HOUR FROM hd.entryDate) as entry_hour,
  EXTRACT(MINUTE FROM hd.entryDate) as entry_minute
FROM health_diaries hd
ORDER BY hd.entryDate DESC;

-- Create function to auto-log appointment to health diary
CREATE OR REPLACE FUNCTION log_appointment_to_diary()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    INSERT INTO health_diaries (userId, entryDate, entryType, title, description, data, linkedRecordId, linkedRecordType)
    VALUES (
      NEW.patientId,
      NEW.scheduledTime,
      'consultation',
      'Consultation with Dr. ' || COALESCE(NEW.doctorName, 'Doctor'),
      NEW.consultationType || ' consultation',
      jsonb_build_object(
        'appointmentId', NEW.id,
        'doctorId', NEW.doctorId,
        'doctorName', NEW.doctorName,
        'consultationType', NEW.consultationType,
        'status', NEW.status,
        'scheduledTime', NEW.scheduledTime,
        'duration', NEW.duration
      ),
      NEW.id,
      'appointment'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for appointments
DROP TRIGGER IF EXISTS trigger_log_appointment ON appointments;
CREATE TRIGGER trigger_log_appointment
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION log_appointment_to_diary();

COMMIT;

-- Verification queries
SELECT 
  entryType,
  COUNT(*) as count
FROM health_diaries
GROUP BY entryType
ORDER BY count DESC;

SELECT 
  userId,
  COUNT(*) as total_entries,
  COUNT(DISTINCT DATE(entryDate)) as unique_days
FROM health_diaries
GROUP BY userId
ORDER BY total_entries DESC
LIMIT 10;
