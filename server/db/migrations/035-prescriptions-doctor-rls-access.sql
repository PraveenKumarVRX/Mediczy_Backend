-- Fix: doctors could not create/see prescriptions for their own patients under RLS.
--
-- Migration 020's auto-generated "EHR-like table" tenant-isolation policy for
-- `prescriptions` only ever matched the row's `patientId` against
-- current_app_user_id(), same gap migration 034 fixed for `appointments` —
-- there was no clause matching the row's `doctorId` against the doctor's own
-- session identity. Independent (non-hospital/clinic) doctors have
-- organization_id/tenant_id = NULL on their prescriptions, so the org/tenant
-- clauses could never save them either — every doctor, completing a
-- consultation for an individually-booked (non-org) patient, hit
-- "new row violates row-level security policy for table prescriptions" when
-- POST /api/appointments/:id/complete-with-prescription tried to auto-create
-- the draft prescription.
DO $$
BEGIN
  IF to_regclass('public.prescriptions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS prescriptions_tenant_isolation ON prescriptions';
    EXECUTE 'CREATE POLICY prescriptions_tenant_isolation ON prescriptions AS PERMISSIVE FOR ALL TO mediczy_helper USING '
      || '(organization_id = current_org_id() '
      || 'OR "patientId" = current_app_user_id() OR "doctorId" = current_app_user_id())';
  END IF;
END $$;
