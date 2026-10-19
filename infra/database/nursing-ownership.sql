-- Run as the deployment administrator, never through the HTTP runtime.
-- Bounded to migration-owned nursing objects. Legacy application DDL is tracked separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('mediqzy:nursing-ownership:v1',0));
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='mediczy_clinical_owner') THEN
  CREATE ROLE mediczy_clinical_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname='mediczy_clinical_owner') THEN
  RAISE EXCEPTION 'Clinical owner must have no role members';
 END IF;
END $$;
-- Runtime may create legacy objects, but cannot drop the schema and its protected history.
ALTER SCHEMA public OWNER TO postgres;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mediczy_helper;
GRANT USAGE, CREATE ON SCHEMA public TO mediczy_clinical_owner;
DO $$ DECLARE t text; obj record; BEGIN
 FOREACH t IN ARRAY ARRAY[
 'nursing_device_bindings','nursing_device_observations','nursing_infusion_events',
 'nursing_staff_links','nursing_notifications','nursing_images','nursing_facility_settings',
 'nursing_assignments','nursing_audit_events','nursing_outbox','nursing_replays',
 'nursing_handovers','nursing_interventions','nursing_care_goals','nursing_goal_evaluations',
 'nursing_flowsheet_entries','nursing_tasks','nursing_assessments','nursing_io_summary',
 'medication_orders','medication_administrations','pharmacy_dispense_queue','wound_tracking_records'] LOOP
   IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Missing required clinical table %',t; END IF;
   EXECUTE format('ALTER TABLE public.%I OWNER TO mediczy_clinical_owner',t);
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, mediczy_helper',t);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO mediczy_helper',t);
   FOR obj IN SELECT s.oid::regclass AS seq FROM pg_class s JOIN pg_depend d ON d.objid=s.oid
     WHERE s.relkind='S' AND d.refobjid=to_regclass('public.'||t) AND d.deptype IN ('a','i') LOOP
     EXECUTE format('ALTER SEQUENCE %s OWNER TO mediczy_clinical_owner',obj.seq);
     EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, mediczy_helper',obj.seq);
     EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE %s TO mediczy_helper',obj.seq);
   END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['nursing_immutable_event','nursing_protect_terminal_dose','nursing_protect_signed_entry'] LOOP
  EXECUTE format('ALTER FUNCTION public.%I() OWNER TO mediczy_clinical_owner',t);
  EXECUTE format('ALTER FUNCTION public.%I() SET search_path = pg_catalog',t);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC,mediczy_helper',t);
 END LOOP;
END $$;
-- These helpers require no administrator privileges; prevent elevated search-path execution.
DO $$ BEGIN
 IF to_regprocedure('public.decrypt_phi(bytea,text)') IS NOT NULL THEN
  ALTER FUNCTION public.decrypt_phi(bytea,text) SECURITY INVOKER;
  ALTER FUNCTION public.decrypt_phi(bytea,text) SET search_path = pg_catalog, public;
  REVOKE ALL ON FUNCTION public.decrypt_phi(bytea,text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.decrypt_phi(bytea,text) TO mediczy_helper;
 END IF;
 IF to_regprocedure('public.get_tenant_scope(integer)') IS NOT NULL THEN
  ALTER FUNCTION public.get_tenant_scope(integer) SECURITY INVOKER;
  ALTER FUNCTION public.get_tenant_scope(integer) SET search_path = pg_catalog, public;
  REVOKE ALL ON FUNCTION public.get_tenant_scope(integer) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_tenant_scope(integer) TO mediczy_helper;
 END IF;
END $$;
-- These streams are append-only even for the ordinary DML role.
REVOKE UPDATE,DELETE ON nursing_audit_events,nursing_goal_evaluations,nursing_infusion_events FROM mediczy_helper;
ALTER ROLE mediczy_helper SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE mediczy_helper SET lock_timeout = '10s';
COMMIT;
