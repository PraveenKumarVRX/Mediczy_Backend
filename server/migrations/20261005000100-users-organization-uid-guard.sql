-- =============================================================================
-- users.organization_uid: derive it on every write, and refuse a role/kind mismatch.  (2026-10-05)
--
-- Eleven files create users with an organisation, and users.organization_id means a TENANT id for
-- some and a CORPORATES id for others (the two tables share 11 integer values). Patching each writer
-- by hand does not last, so the database derives users.organization_uid itself, by the same rules as
-- scripts/ops/backfill-organization-uid.mjs:
--
--   organization_type = corporate        -> a CORPORATE. If organization_id is a corporate-type TENANT,
--                                           the one Active corporate linked to it; if that tenant has
--                                           several Active corporates the uid is left NULL rather than
--                                           guessed; otherwise organization_id is itself a corporates id.
--   hospital | clinic | lab | pharmacy   -> the TENANT, only if its type matches.
--   anything else (individual, ...)      -> the TENANT, only when the integer is not also a corporates id.
--
-- A writer that knows better (corporate-hr-management, hrms.route) sets organization_uid explicitly;
-- the trigger only derives when it is NULL.
--
-- `hr_staff` is a role in two modules: the hospital's own HRMS and the corporate wellness portal. The
-- role cannot say which, so when a uid is present the organisation's KIND must agree with the role:
--   corporate_admin / corporate_cmo / corporate_ohc      -> a corporate
--   hr_staff in a corporate organisation                 -> a corporate
--   hr_staff in any other organisation                   -> NOT a corporate
--
-- Idempotent. Run with scripts/ops/apply-migration-checked.mjs.
-- =============================================================================

CREATE OR REPLACE FUNCTION users_organization_uid_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_otype  text := NEW.organization_type::text;
  v_tenant record;
  v_uid    text;
  v_n      int;
  v_kind   text;
BEGIN
  -- 1. derive when the writer did not say
  IF NEW.organization_uid IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT t.id, t.type::text AS ttype, t.unique_id INTO v_tenant FROM tenants t WHERE t.id = NEW.organization_id;

    IF v_otype = 'corporate' THEN
      v_n := 0;
      IF v_tenant.id IS NOT NULL AND v_tenant.ttype = 'corporate' THEN
        SELECT count(*), min(c.unique_id) INTO v_n, v_uid
          FROM corporates c WHERE c.tenant_id = v_tenant.id AND c.status ILIKE 'active';
        IF v_n = 1 THEN
          NEW.organization_uid := v_uid;
        END IF;
      END IF;
      IF NEW.organization_uid IS NULL AND v_n = 0 THEN
        SELECT c.unique_id INTO v_uid FROM corporates c WHERE c.id = NEW.organization_id;
        NEW.organization_uid := v_uid;   -- organization_id is itself a corporates id (may stay NULL)
      END IF;

    ELSIF v_otype IN ('hospital', 'clinic', 'lab', 'pharmacy') THEN
      IF v_tenant.id IS NOT NULL AND v_tenant.ttype = v_otype THEN
        NEW.organization_uid := v_tenant.unique_id;
      END IF;

    ELSE
      IF v_tenant.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM corporates c WHERE c.id = NEW.organization_id) THEN
        NEW.organization_uid := v_tenant.unique_id;
      END IF;
    END IF;
  END IF;

  -- 2. the organisation's kind must agree with the role
  IF NEW.organization_uid IS NOT NULL THEN
    SELECT kind INTO v_kind FROM entity_registry WHERE uid = NEW.organization_uid AND retired_at IS NULL;
    IF v_kind IS NULL THEN
      RAISE EXCEPTION 'users.organization_uid "%" is not an active registered uid', NEW.organization_uid
        USING ERRCODE = '23503';
    END IF;
    IF (NEW.role IN ('corporate_admin', 'corporate_cmo', 'corporate_ohc') AND v_kind <> 'corporate')
       OR (NEW.role = 'hr_staff' AND v_otype = 'corporate' AND v_kind <> 'corporate')
       OR (NEW.role = 'hr_staff' AND v_otype <> 'corporate' AND v_kind = 'corporate') THEN
      RAISE EXCEPTION 'users: role "%" in a "%" organisation cannot belong to a % (organization_uid %). hr_staff is hospital HRMS in a hospital and employee wellness in a corporate; the organisation kind must match.',
        NEW.role, v_otype, v_kind, NEW.organization_uid USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_users_organization_uid ON users;
CREATE TRIGGER trg_users_organization_uid
  BEFORE INSERT OR UPDATE OF organization_id, organization_type, organization_uid, role ON users
  FOR EACH ROW EXECUTE FUNCTION users_organization_uid_guard();
