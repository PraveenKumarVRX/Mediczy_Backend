-- Fix: doctors could not see their own appointments under RLS.
--
-- Migration 020's auto-generated tenant-isolation policy for `appointments`
-- only ever matched the row's `userId` (the patient) against
-- current_app_user_id() — there was no clause matching the row's `doctorId`
-- against the doctor's own session identity. A doctor's own JWT populates
-- req.user.id with their doctor id (see resolveDoctorIdFromRequest in
-- appointment.controller.js), and rls-context.middleware.js's
-- setSequelizeRlsContext sets app.current_user_id from req.user.id — so the
-- session variable was already correct, the policy just never checked it
-- against doctorId. Independent (non-hospital/clinic) doctors have
-- organization_id/tenant_id = NULL on their appointments, so the org/tenant
-- clauses could never save them either — every doctor, on every plan, saw
-- an empty appointments list.
DO $$
BEGIN
  IF to_regclass('public.appointments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS appointments_tenant_isolation ON appointments';
    EXECUTE 'CREATE POLICY appointments_tenant_isolation ON appointments AS PERMISSIVE FOR ALL TO mediczy_helper USING '
      || '(organization_id = current_org_id() OR tenant_id = current_org_id() '
      || 'OR "userId" = current_app_user_id() OR "doctorId" = current_app_user_id())';
  END IF;
END $$;
