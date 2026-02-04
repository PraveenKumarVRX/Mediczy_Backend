-- Create tables required by nurse vitals + notes workflows

CREATE TABLE IF NOT EXISTS vitals_records (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "recordedBy" INTEGER,
  "recordedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "bloodPressureSystolic" INTEGER,
  "bloodPressureDiastolic" INTEGER,
  "heartRate" INTEGER,
  temperature DECIMAL(4,1),
  "respiratoryRate" INTEGER,
  "oxygenSaturation" INTEGER,
  weight DECIMAL(5,2),
  height DECIMAL(5,2),
  bmi DECIMAL(4,1),
  "bloodSugar" DECIMAL(5,1),
  notes TEXT,
  source VARCHAR(50) DEFAULT 'manual',
  "deviceId" VARCHAR(100),
  metadata JSONB,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vitals_records_user ON vitals_records("userId");
CREATE INDEX IF NOT EXISTS idx_vitals_records_recorded_at ON vitals_records("recordedAt");

CREATE TABLE IF NOT EXISTS patient_notes (
  id SERIAL PRIMARY KEY,
  "patientId" INTEGER NOT NULL,
  "doctorId" INTEGER,
  "appointmentId" INTEGER,
  type VARCHAR(50) DEFAULT 'general',
  title VARCHAR(255),
  content TEXT,
  "isPrivate" BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_patient ON patient_notes("patientId");
CREATE INDEX IF NOT EXISTS idx_patient_notes_created ON patient_notes("createdAt");
