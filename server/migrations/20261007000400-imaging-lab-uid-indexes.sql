-- Imaging contract, step A: the lab_uid indexes the new predicates need.  (2026-10-07)
-- Apply BEFORE deploying the code that matches on lab_uid instead of the UUID tenant_uid. Additive only.
-- The single-column lab_uid indexes already exist (attach_uid_reference / backfill); the old tenant_uid composites
-- (tenant_uid, study_instance_uid) served the study and instance lookups, so their lab_uid equivalents are built here.
CREATE INDEX IF NOT EXISTS idx_hg_dicom_studies_labuid_study   ON hg_dicom_studies   (lab_uid, study_instance_uid);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_instances_labuid_study ON hg_dicom_instances (lab_uid, study_instance_uid);
