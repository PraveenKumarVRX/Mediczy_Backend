-- Care units: outreach clinics, medical centres and Occupational Health Clinics (OHC) under a hospital or clinic.  (2026-10-08)
-- Design: docs/architecture/OHC_UNDER_HOSPITAL_UNITS_DESIGN.md (decisions D1-D8 answered by the lead on 2026-10-08).
--
-- The unit table is `hospital_branch` (singular): the one the hospital module already scopes by (branch_id, staff assignment,
-- tariff overrides). It was empty. It is EXTENDED, not replaced; existing writers (hospital-branch.service createBranch) keep working
-- because every new column is nullable or defaulted and the type of a legacy row is derived from is_main.
--
--   hierarchy   operator (hospital OR clinic tenant, `owner_uid`)
--                 ├─ main
--                 ├─ branch            100% owned
--                 ├─ outreach_clinic   100% owned, has a visit pattern
--                 └─ medical_centre    co-branded / co-owned (brand_name + co_owner_uid)
--                       └─ ohc         under an outreach clinic or medical centre; serves exactly ONE corporate; operated under a contract
--   (an OHC is usually set up by the corporate and its operation outsourced to the operator: `initiated_by`, two acceptances)
--
-- Entity UID rule: every unit gets a DB-issued uid of kind `care_unit` (prefix J, the lead's pick). owner_uid, corporate_uid and
-- co_owner_uid are uids into entity_registry; organization_id stays as the legacy integer twin of owner_uid.

-- ── 1. the entity kind (organisation-like: the prefix is unique among organisations) ──
INSERT INTO entity_kinds (kind, prefix, label, is_org, tenant_type)
VALUES ('care_unit', 'J', 'Care unit (outreach clinic, medical centre, OHC)', true, NULL)
ON CONFLICT (kind) DO NOTHING;

-- ── 2. columns ───────────────────────────────────────────────────────────────
ALTER TABLE hospital_branch
  ADD COLUMN IF NOT EXISTS unit_type                text NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS parent_unit_id           integer REFERENCES hospital_branch (id),
  ADD COLUMN IF NOT EXISTS ownership                text,
  ADD COLUMN IF NOT EXISTS co_owner_uid             text REFERENCES entity_registry (uid),
  ADD COLUMN IF NOT EXISTS brand_name               text,
  ADD COLUMN IF NOT EXISTS visit_pattern            text,
  ADD COLUMN IF NOT EXISTS services                 text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS corporate_uid            text REFERENCES entity_registry (uid),
  ADD COLUMN IF NOT EXISTS contract_ref             text,
  ADD COLUMN IF NOT EXISTS contract_start           date,
  ADD COLUMN IF NOT EXISTS contract_end             date,
  ADD COLUMN IF NOT EXISTS contract_status          text,
  ADD COLUMN IF NOT EXISTS initiated_by             text,
  ADD COLUMN IF NOT EXISTS accepted_by_corporate_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_operator_at  timestamptz,
  ADD COLUMN IF NOT EXISTS city                     text,
  ADD COLUMN IF NOT EXISTS state                    text,
  ADD COLUMN IF NOT EXISTS pincode                  text,
  ADD COLUMN IF NOT EXISTS phone                    text,
  ADD COLUMN IF NOT EXISTS email                    text,
  ADD COLUMN IF NOT EXISTS manager                  jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_branch_unit_type_chk') THEN
    ALTER TABLE hospital_branch
      ADD CONSTRAINT hospital_branch_unit_type_chk CHECK (unit_type IN ('main', 'branch', 'outreach_clinic', 'medical_centre', 'ohc')),
      ADD CONSTRAINT hospital_branch_ownership_chk CHECK (ownership IS NULL OR ownership IN ('owned', 'co_owned')),
      ADD CONSTRAINT hospital_branch_visit_pattern_chk CHECK (visit_pattern IS NULL OR visit_pattern IN ('daily', 'weekly', 'monthly', 'mobile')),
      ADD CONSTRAINT hospital_branch_contract_status_chk CHECK (contract_status IS NULL OR contract_status IN ('proposed', 'active', 'ended')),
      ADD CONSTRAINT hospital_branch_initiated_by_chk CHECK (initiated_by IS NULL OR initiated_by IN ('corporate', 'operator')),
      ADD CONSTRAINT hospital_branch_contract_dates_chk CHECK (contract_end IS NULL OR contract_start IS NULL OR contract_end >= contract_start);
  END IF;
END $$;

-- legacy rows: the main branch is `main`
UPDATE hospital_branch SET unit_type = 'main' WHERE is_main AND unit_type = 'branch';

-- The owner by uid (hospital OR clinic tenant) next to the legacy integer; the standard twin trigger keeps them in step.
SELECT attach_uid_reference('hospital_branch', 'organization_id', 'owner_uid', 'tenants');
SELECT attach_entity_uid_rule('hospital_branch', 'care_unit', 'unique_id', true);

CREATE INDEX IF NOT EXISTS idx_hospital_branch_owner_type  ON hospital_branch (owner_uid, unit_type);
CREATE INDEX IF NOT EXISTS idx_hospital_branch_parent      ON hospital_branch (parent_unit_id) WHERE parent_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hospital_branch_corporate   ON hospital_branch (corporate_uid) WHERE corporate_uid IS NOT NULL;
-- An OHC serves one corporate, and a corporate has at most one ACTIVE or PROPOSED OHC per operator unit parent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hospital_branch_ohc_per_parent_corporate
  ON hospital_branch (parent_unit_id, corporate_uid) WHERE unit_type = 'ohc' AND contract_status IN ('proposed', 'active');

-- ── 3. invariants (a trigger: the rules hold for every writer, not just the application) ──
CREATE OR REPLACE FUNCTION care_unit_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_owner_kind text;
  v_parent     hospital_branch%ROWTYPE;
  v_kind       text;
  v_ctable     text;
BEGIN
  -- derive / reconcile type with the legacy flag
  IF TG_OP = 'INSERT' AND NEW.is_main AND NEW.unit_type = 'branch' THEN NEW.unit_type := 'main'; END IF;
  IF NEW.unit_type = 'main' THEN NEW.is_main := true; ELSE NEW.is_main := false; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.unit_type <> OLD.unit_type THEN RAISE EXCEPTION 'care unit: the type of a unit cannot change (% -> %)', OLD.unit_type, NEW.unit_type USING ERRCODE = '23514'; END IF;
    IF NEW.owner_uid IS DISTINCT FROM OLD.owner_uid AND OLD.owner_uid IS NOT NULL THEN RAISE EXCEPTION 'care unit: the operator of a unit cannot change' USING ERRCODE = '23514'; END IF;
    IF NEW.unit_type = 'ohc' AND NEW.corporate_uid IS DISTINCT FROM OLD.corporate_uid THEN RAISE EXCEPTION 'care unit: an OHC serves one corporate for life; create a new OHC for another corporate' USING ERRCODE = '23514'; END IF;
  END IF;

  IF NEW.owner_uid IS NULL THEN RAISE EXCEPTION 'care unit: owner_uid is required (the hospital or clinic that operates it)' USING ERRCODE = '23502'; END IF;
  SELECT kind INTO v_owner_kind FROM entity_registry WHERE uid = NEW.owner_uid AND retired_at IS NULL;
  IF v_owner_kind IS NULL OR v_owner_kind NOT IN ('hospital', 'clinic') THEN
    RAISE EXCEPTION 'care unit: owner % must be a hospital or clinic (registry says: %)', NEW.owner_uid, COALESCE(v_owner_kind, 'unknown') USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_unit_id IS NOT NULL THEN
    IF NEW.id IS NOT NULL AND NEW.parent_unit_id = NEW.id THEN RAISE EXCEPTION 'care unit: a unit cannot be its own parent' USING ERRCODE = '23514'; END IF;
    SELECT * INTO v_parent FROM hospital_branch WHERE id = NEW.parent_unit_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'care unit: parent % does not exist', NEW.parent_unit_id USING ERRCODE = '23503'; END IF;
    IF v_parent.owner_uid IS DISTINCT FROM NEW.owner_uid THEN RAISE EXCEPTION 'care unit: a unit and its parent must belong to the same operator' USING ERRCODE = '23514'; END IF;
  END IF;

  -- type rules
  IF NEW.unit_type = 'main' THEN
    IF NEW.parent_unit_id IS NOT NULL THEN RAISE EXCEPTION 'care unit: the main unit has no parent' USING ERRCODE = '23514'; END IF;
    NEW.ownership := COALESCE(NEW.ownership, 'owned');
  ELSIF NEW.unit_type IN ('branch', 'outreach_clinic') THEN
    IF NEW.parent_unit_id IS NOT NULL AND v_parent.unit_type <> 'main' THEN RAISE EXCEPTION 'care unit: a % hangs under the main unit or stands alone, not under a %', NEW.unit_type, v_parent.unit_type USING ERRCODE = '23514'; END IF;
    NEW.ownership := COALESCE(NEW.ownership, 'owned');
    IF NEW.ownership <> 'owned' THEN RAISE EXCEPTION 'care unit: a % is 100%% owned by its operator (use a medical centre for a co-owned facility)', NEW.unit_type USING ERRCODE = '23514'; END IF;
    IF NEW.unit_type = 'outreach_clinic' AND NEW.visit_pattern IS NULL THEN RAISE EXCEPTION 'care unit: an outreach clinic needs a visit pattern (daily, weekly, monthly or mobile)' USING ERRCODE = '23502'; END IF;
  ELSIF NEW.unit_type = 'medical_centre' THEN
    IF NEW.parent_unit_id IS NOT NULL AND v_parent.unit_type <> 'main' THEN RAISE EXCEPTION 'care unit: a medical centre hangs under the main unit or stands alone' USING ERRCODE = '23514'; END IF;
    NEW.ownership := 'co_owned';
    IF NEW.brand_name IS NULL OR btrim(NEW.brand_name) = '' THEN RAISE EXCEPTION 'care unit: a medical centre is co-branded and needs a brand name' USING ERRCODE = '23502'; END IF;
    IF NEW.co_owner_uid IS NULL THEN RAISE EXCEPTION 'care unit: a medical centre is co-owned and needs the co-owner' USING ERRCODE = '23502'; END IF;
    IF NEW.co_owner_uid = NEW.owner_uid THEN RAISE EXCEPTION 'care unit: the co-owner must be someone other than the operator' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.unit_type = 'ohc' THEN
    IF NEW.parent_unit_id IS NULL OR v_parent.unit_type NOT IN ('outreach_clinic', 'medical_centre') THEN
      RAISE EXCEPTION 'care unit: an OHC sits under an outreach clinic or a medical centre' USING ERRCODE = '23514';
    END IF;
    IF NEW.corporate_uid IS NULL THEN RAISE EXCEPTION 'care unit: an OHC serves exactly one corporate (corporate_uid)' USING ERRCODE = '23502'; END IF;
    SELECT kind, source_table INTO v_kind, v_ctable FROM entity_registry WHERE uid = NEW.corporate_uid AND retired_at IS NULL;
    -- the company itself (the `corporates` table: employees, portal, HR), not the corporate tenant that hosts it
    IF v_kind IS DISTINCT FROM 'corporate' OR v_ctable IS DISTINCT FROM 'corporates' THEN
      RAISE EXCEPTION 'care unit: % is not a corporate company record (registry says: % in %)', NEW.corporate_uid, COALESCE(v_kind, 'unknown'), COALESCE(v_ctable, 'unknown') USING ERRCODE = '23514';
    END IF;
    IF NEW.initiated_by IS NULL THEN RAISE EXCEPTION 'care unit: an OHC records who initiated it (corporate or operator)' USING ERRCODE = '23502'; END IF;
    NEW.contract_status := COALESCE(NEW.contract_status, 'proposed');
    NEW.ownership := NULL;
    IF NEW.contract_status = 'active' AND (NEW.accepted_by_corporate_at IS NULL OR NEW.accepted_by_operator_at IS NULL) THEN
      RAISE EXCEPTION 'care unit: an OHC contract is active only after BOTH the corporate and the operator accepted it' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.unit_type <> 'ohc' AND (NEW.corporate_uid IS NOT NULL OR NEW.contract_status IS NOT NULL OR NEW.contract_ref IS NOT NULL
        OR NEW.contract_start IS NOT NULL OR NEW.initiated_by IS NOT NULL) THEN
    RAISE EXCEPTION 'care unit: corporate and contract fields belong to an OHC only' USING ERRCODE = '23514';
  END IF;
  IF NEW.unit_type <> 'medical_centre' AND (NEW.co_owner_uid IS NOT NULL OR NEW.brand_name IS NOT NULL) THEN
    RAISE EXCEPTION 'care unit: brand and co-owner belong to a medical centre only' USING ERRCODE = '23514';
  END IF;
  IF NEW.unit_type NOT IN ('outreach_clinic') AND NEW.visit_pattern IS NOT NULL THEN
    RAISE EXCEPTION 'care unit: a visit pattern belongs to an outreach clinic only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_care_unit_guard ON hospital_branch;
-- named so it fires AFTER the owner_uid twin trigger (alphabetical order), when owner_uid has been derived from organization_id
CREATE TRIGGER trg_zz_care_unit_guard BEFORE INSERT OR UPDATE ON hospital_branch
  FOR EACH ROW EXECUTE FUNCTION care_unit_guard();

-- ── 4. staff assignment: OHC roles only to OHC units of their own operator ───
CREATE OR REPLACE FUNCTION care_unit_staff_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_unit  hospital_branch%ROWTYPE;
  v_user_role text;
  v_user_org  text;
BEGIN
  SELECT * INTO v_unit FROM hospital_branch WHERE id = NEW.branch_id;
  SELECT role, organization_uid INTO v_user_role, v_user_org FROM users WHERE id = NEW.user_id;
  IF NEW.role LIKE 'ohc\_%' OR v_user_role LIKE 'ohc\_%' THEN
    IF v_unit.unit_type IS DISTINCT FROM 'ohc' THEN RAISE EXCEPTION 'care unit: OHC staff are assigned to OHC units only' USING ERRCODE = '23514'; END IF;
    IF NEW.role NOT IN ('ohc_doctor', 'ohc_staff') OR v_user_role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'care unit: the assignment role (%) must equal the user role (%) and be ohc_doctor or ohc_staff', NEW.role, v_user_role USING ERRCODE = '23514';
    END IF;
    IF v_user_org IS DISTINCT FROM v_unit.owner_uid THEN
      RAISE EXCEPTION 'care unit: OHC staff must belong to the operator (%) of the unit, not %', v_unit.owner_uid, COALESCE(v_user_org, 'no organisation') USING ERRCODE = '23514';
    END IF;
  ELSIF v_unit.unit_type = 'ohc' THEN
    RAISE EXCEPTION 'care unit: only OHC doctors and OHC staff can be assigned to an OHC' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_care_unit_staff_guard ON staff_branch_assignment;
CREATE TRIGGER trg_care_unit_staff_guard BEFORE INSERT OR UPDATE OF user_id, branch_id, role ON staff_branch_assignment
  FOR EACH ROW EXECUTE FUNCTION care_unit_staff_guard();

-- ── 5. users: OHC roles belong to a hospital or clinic, never a corporate ────
CREATE OR REPLACE FUNCTION users_ohc_role_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE v_kind text;
BEGIN
  IF NEW.role IN ('ohc_doctor', 'ohc_staff') THEN
    IF NEW.organization_uid IS NULL THEN RAISE EXCEPTION 'users: % must belong to a hospital or clinic (organization_uid is required)', NEW.role USING ERRCODE = '23502'; END IF;
    SELECT kind INTO v_kind FROM entity_registry WHERE uid = NEW.organization_uid AND retired_at IS NULL;
    IF v_kind IS NULL OR v_kind NOT IN ('hospital', 'clinic') THEN
      RAISE EXCEPTION 'users: % must belong to a hospital or clinic, not a % (organization_uid %)', NEW.role, COALESCE(v_kind, 'unknown'), NEW.organization_uid USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_users_organization_uid_ohc ON users;
-- fires after trg_users_organization_uid (alphabetical), which derives organization_uid
CREATE TRIGGER trg_users_organization_uid_ohc BEFORE INSERT OR UPDATE OF organization_id, organization_type, organization_uid, role ON users
  FOR EACH ROW EXECUTE FUNCTION users_ohc_role_guard();

-- ── 6. legacy rows from the plural hospital_branches (4 rows, written only by the Branches page) ──
-- Copied as `main` / `branch` units when their hospital uid is a real hospital or clinic tenant; others are left behind and listed
-- by the checks. The plural table is kept, read-only history.
INSERT INTO hospital_branch (organization_id, name, address, is_main, is_active, unit_type, city, state, pincode, phone, email, manager)
SELECT t.id, b.name, b.address, (b.type = 'main'), (b.status = 'active'),
       CASE WHEN b.type = 'main' THEN 'main' ELSE 'branch' END, b.city, b.state, b.pincode, b.phone, b.email, b.manager
  FROM hospital_branches b
  JOIN entity_registry r ON r.uid = b.hospital_uid AND r.source_table = 'tenants' AND r.kind IN ('hospital', 'clinic') AND r.retired_at IS NULL
  JOIN tenants t ON t.id = r.source_id
ON CONFLICT (organization_id, name) DO NOTHING;

-- ── 7. OHC certificates: employer twin + issuing unit; the access log ─────────
-- OHC: certificate provenance + an append-only access log.  (2026-10-08)
--
-- fitness_certificates.organization_id is the EMPLOYER as a bare integer (the corporates id: corporate-hmis passes
-- corporateIdOf(req), the clinic flow passes a corporates.id). It gets the standard uid twin, and a certificate records the care
-- unit (OHC) that issued it. Table is empty in production, so nothing is backfilled and nothing can disagree.
SELECT attach_uid_reference('fitness_certificates', 'organization_id', 'employer_uid', 'corporates');

ALTER TABLE fitness_certificates
  ADD COLUMN IF NOT EXISTS issued_by_unit_uid text REFERENCES entity_registry (uid),
  ADD COLUMN IF NOT EXISTS issued_by_user_id  integer;
CREATE INDEX IF NOT EXISTS idx_fitness_certificates_unit     ON fitness_certificates (issued_by_unit_uid) WHERE issued_by_unit_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fitness_certificates_employer ON fitness_certificates (employer_uid);

-- the issuing unit must be an OHC care unit, and its corporate must be the certificate's employer
CREATE OR REPLACE FUNCTION fitness_certificate_unit_guard() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE v_unit hospital_branch%ROWTYPE;
BEGIN
  IF NEW.issued_by_unit_uid IS NOT NULL THEN
    SELECT * INTO v_unit FROM hospital_branch WHERE unique_id = NEW.issued_by_unit_uid;
    IF NOT FOUND OR v_unit.unit_type <> 'ohc' THEN
      RAISE EXCEPTION 'fitness certificate: issued_by_unit_uid % is not an OHC', NEW.issued_by_unit_uid USING ERRCODE = '23514';
    END IF;
    IF NEW.employer_uid IS DISTINCT FROM v_unit.corporate_uid THEN
      RAISE EXCEPTION 'fitness certificate: an OHC can only certify employees of the corporate it serves (% vs %)', v_unit.corporate_uid, NEW.employer_uid USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_zz_fitness_certificate_unit_guard ON fitness_certificates;
CREATE TRIGGER trg_zz_fitness_certificate_unit_guard BEFORE INSERT OR UPDATE OF issued_by_unit_uid, organization_id, employer_uid ON fitness_certificates
  FOR EACH ROW EXECUTE FUNCTION fitness_certificate_unit_guard();

-- Who looked at OHC data. A corporate reading certificates/staff of its OHC is an employer reading occupational-health data: every
-- read is recorded (who, which unit, what), and the row can never be changed or removed.
CREATE TABLE IF NOT EXISTS ohc_access_log (
  id          bigserial PRIMARY KEY,
  unit_uid    text NOT NULL REFERENCES entity_registry (uid),
  actor_kind  text NOT NULL CHECK (actor_kind IN ('corporate', 'operator', 'ohc_staff')),
  actor_ref   text NOT NULL,
  action      text NOT NULL,
  subject     text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ohc_access_log_unit ON ohc_access_log (unit_uid, at DESC);
CREATE OR REPLACE FUNCTION ohc_access_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'ohc_access_log is append-only (% refused)', TG_OP USING ERRCODE = '55000'; END $fn$;
DROP TRIGGER IF EXISTS trg_ohc_access_log_append_only ON ohc_access_log;
CREATE TRIGGER trg_ohc_access_log_append_only BEFORE UPDATE OR DELETE ON ohc_access_log FOR EACH ROW EXECUTE FUNCTION ohc_access_log_append_only();
