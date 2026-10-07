-- Imaging contract, step D: drop the UUID tenant_uid twins and the imaging_tenants registry.  (2026-10-07)
--
-- Decided by the lead (2026-10-07): lab_uid is the only twin. Apply ONLY after the code that matches on lab_uid is deployed
-- and the tenant_uid indexes show no scans since (pg_stat_user_indexes): until then it is the live tenant-isolation key.
-- Everything dropped here is derivable: tenant_uid was labs.uid for the row's lab (tenant_id / lab_id).
--
-- docs/architecture/IMAGING_TENANT_UID_CONTRACT.md
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['hg_dicom_studies','hg_dicom_instances','hg_dicom_worklist','hg_dicom_reports','hg_dicom_access_log','ris_studies'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_tenant_uid', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS imaging_fill_tenant_uid();
DROP FUNCTION IF EXISTS imaging_fill_tenant_uid_by_lab();
-- the tenant_uid indexes go with their column
ALTER TABLE hg_dicom_studies     DROP COLUMN IF EXISTS tenant_uid;
ALTER TABLE hg_dicom_instances   DROP COLUMN IF EXISTS tenant_uid;
ALTER TABLE hg_dicom_worklist    DROP COLUMN IF EXISTS tenant_uid;
ALTER TABLE hg_dicom_reports     DROP COLUMN IF EXISTS tenant_uid;
ALTER TABLE hg_dicom_access_log  DROP COLUMN IF EXISTS tenant_uid;
ALTER TABLE ris_studies          DROP COLUMN IF EXISTS tenant_uid;
DROP TABLE IF EXISTS imaging_tenant_ambiguities;
DROP TABLE IF EXISTS imaging_tenants;
