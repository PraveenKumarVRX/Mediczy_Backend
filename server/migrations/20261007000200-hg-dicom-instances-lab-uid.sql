-- hg_dicom_instances.lab_uid: the one uid twin imaging needs here (expand step only).  (2026-10-07)
--
-- Decided by the lead (2026-10-07): in imaging, tenant_id is a LAB id and `lab_uid` is the ONLY twin; the UUID
-- tenant_uid twins are to go. hg_dicom_instances (423,808 rows) was the one imaging table with no lab_uid at all.
--
-- This migration is deliberately cheap and does not rewrite the table:
--   * ADD COLUMN lab_uid text            (nullable, no default: metadata-only, instant)
--   * FOREIGN KEY ... NOT VALID          (enforced for every NEW row at once; existing rows are validated after the backfill)
--   * the uid_ref_sync trigger           (a new/changed row keeps tenant_id and lab_uid consistent, same as every other twin)
--   * the twin is recorded in entity_uid_references, so the CI verifier tracks it
-- The 423,808 existing rows are filled in batches by scripts/ops/backfill-uid-twin-batched.mjs, which then VALIDATEs the
-- foreign key and builds the index (both are non-transactional or long, so they do not belong in a migration).
--
-- Contract (dropping the UUID tenant_uid twins, which live code still reads) is a separate, later step: see
-- docs/architecture/IMAGING_TENANT_UID_CONTRACT.md.
ALTER TABLE hg_dicom_instances ADD COLUMN IF NOT EXISTS lab_uid text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hg_dicom_instances_lab_uid') THEN
    ALTER TABLE hg_dicom_instances
      ADD CONSTRAINT fk_hg_dicom_instances_lab_uid FOREIGN KEY (lab_uid) REFERENCES entity_registry (uid) NOT VALID;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_uid_ref_lab_uid ON hg_dicom_instances;
CREATE TRIGGER trg_uid_ref_lab_uid
  BEFORE INSERT OR UPDATE OF tenant_id, lab_uid ON hg_dicom_instances
  FOR EACH ROW EXECUTE FUNCTION uid_ref_sync('tenant_id', 'lab_uid', 'labs', 'unique_id');

INSERT INTO entity_uid_references (table_name, int_col, uid_col, target, target_col)
VALUES ('hg_dicom_instances', 'tenant_id', 'lab_uid', 'labs', 'unique_id')
ON CONFLICT DO NOTHING;
