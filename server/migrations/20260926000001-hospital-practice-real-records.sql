-- Hospital practice real-record endpoints and fields (WP-0.3 / MRD).
-- Idempotent: safe to apply to existing hospital tenants.

ALTER TABLE discharge_summaries
  ADD COLUMN IF NOT EXISTS attending_doctor VARCHAR(160),
  ADD COLUMN IF NOT EXISTS admission_date DATE,
  ADD COLUMN IF NOT EXISTS ward VARCHAR(160),
  ADD COLUMN IF NOT EXISTS bed VARCHAR(80);

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS attending_doctor VARCHAR(160),
  ADD COLUMN IF NOT EXISTS diagnosis TEXT;

CREATE INDEX IF NOT EXISTS idx_discharge_summaries_hospital_updated
  ON discharge_summaries(hospital_id, updated_at DESC);

-- Sequence for MRD numbers, avoiding a COUNT(*) race between concurrent creators.
CREATE SEQUENCE IF NOT EXISTS mrd_number_seq START 1;

-- NOTE: on this database medical_records is tenant-scoped by organization_id (it has no hospital_id column);
-- discharge_summaries is the table that carries hospital_id.
CREATE INDEX IF NOT EXISTS idx_medical_records_org_updated
  ON medical_records(organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_medical_records_org_patient
  ON medical_records(organization_id, patient_id);
