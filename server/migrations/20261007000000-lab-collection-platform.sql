-- Collection platform: home-collection and ward-collection under one canonical task model.  (2026-10-07)
-- Plan: docs/audits/LAB_MODULE_PHLEBOTOMY_REQUIREMENTS_AVAILABILITY_AND_IMPLEMENTATION_PLAN_2026-10-07.md (section 4)
-- ADR:  docs/architecture/COLLECTION_PLATFORM_ADR.md
--
-- Nothing here changes an existing table, so it can be applied (and rolled back) without touching live
-- behaviour. The legacy api_lab_home_collection_* tables were never created in production (their
-- 2026-05-28 migration was not applied), so there is nothing to backfill: the canonical model is the
-- first authoritative source.
--
-- Entity UID rule (CLAUDE.md): every reference to another ENTITY is a uid into entity_registry, never an
-- integer. `owner_uid` is the lab (or hospital) that runs the collection, `facility_uid` the hospital whose
-- ward is visited, `partner_uid` the hospital whose bookings a lab may bridge. Records that are not
-- entities (an admission, a booking) are referenced as text, always together with the uid of the entity
-- that owns them. A phlebotomist is a person record of the owner, identified by a uuid; whether people
-- of this kind get a registry kind and prefix is an open decision recorded in the ADR.

-- ── 0. helpers ───────────────────────────────────────────────────────────────
-- The owner of a collection must be a lab or a hospital/clinic tenant. entity_registry holds every uid
-- of every kind, so the foreign key alone would accept a corporate or a patient.
CREATE OR REPLACE FUNCTION collection_assert_entity_uid() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_col  text;
  v_uid  text;
  v_tbl  text;
BEGIN
  FOREACH v_col IN ARRAY TG_ARGV LOOP
    v_uid := to_jsonb(NEW) ->> v_col;
    IF v_uid IS NULL THEN CONTINUE; END IF;
    SELECT source_table INTO v_tbl FROM entity_registry WHERE uid = v_uid;
    IF v_tbl IS NULL OR v_tbl NOT IN ('labs', 'tenants') THEN
      RAISE EXCEPTION 'collection: %.% = "%" must be the uid of a lab or a hospital/clinic tenant (registry says: %)',
        TG_TABLE_NAME, v_col, v_uid, COALESCE(v_tbl, 'unknown') USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END
$fn$;

-- Append-only: the trail is evidence. Neither the application nor a stray script may rewrite it.
CREATE OR REPLACE FUNCTION collection_append_only() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
END
$fn$;

CREATE OR REPLACE FUNCTION collection_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

-- ── 1. people ────────────────────────────────────────────────────────────────
-- A verified field worker. Separate from the lab account: the lab login is a shared organisational
-- credential and cannot say WHO collected a specimen.
CREATE TABLE IF NOT EXISTS lab_phlebotomists (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name           text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  email                  text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+$'),
  phone                  text,
  password_hash          text NOT NULL,
  must_change_password   boolean NOT NULL DEFAULT true,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'left')),
  qualification          text,
  qualification_expires  date,
  verified_at            timestamptz,
  verified_by            text,
  failed_logins          integer NOT NULL DEFAULT 0,
  locked_until           timestamptz,
  last_login_at          timestamptz,
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_phlebotomists_email ON lab_phlebotomists (email);
DROP TRIGGER IF EXISTS trg_lab_phlebotomists_touch ON lab_phlebotomists;
CREATE TRIGGER trg_lab_phlebotomists_touch BEFORE UPDATE ON lab_phlebotomists
  FOR EACH ROW EXECUTE FUNCTION collection_touch_updated_at();

-- Which owner a worker may work for, and what they may do there. A worker with no active membership
-- cannot log in; a suspended membership removes access to that owner without touching the others.
CREATE TABLE IF NOT EXISTS lab_phlebotomist_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phlebotomist_id uuid NOT NULL REFERENCES lab_phlebotomists (id),
  owner_uid       text NOT NULL REFERENCES entity_registry (uid),
  scopes          text[] NOT NULL DEFAULT ARRAY['phlebotomy.worklist.read', 'phlebotomy.collection.write']::text[],
  can_home        boolean NOT NULL DEFAULT true,
  can_ward        boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  active_from     timestamptz NOT NULL DEFAULT now(),
  active_to       timestamptz,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (active_to IS NULL OR active_to > active_from),
  CHECK (scopes <@ ARRAY['phlebotomy.worklist.read', 'phlebotomy.collection.write']::text[])
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_phleb_membership ON lab_phlebotomist_memberships (phlebotomist_id, owner_uid)
  WHERE status <> 'ended';
CREATE INDEX IF NOT EXISTS idx_lab_phleb_membership_owner ON lab_phlebotomist_memberships (owner_uid, status);
DROP TRIGGER IF EXISTS trg_lab_phleb_membership_owner ON lab_phlebotomist_memberships;
CREATE TRIGGER trg_lab_phleb_membership_owner BEFORE INSERT OR UPDATE OF owner_uid ON lab_phlebotomist_memberships
  FOR EACH ROW EXECUTE FUNCTION collection_assert_entity_uid('owner_uid');
DROP TRIGGER IF EXISTS trg_lab_phleb_membership_touch ON lab_phlebotomist_memberships;
CREATE TRIGGER trg_lab_phleb_membership_touch BEFORE UPDATE ON lab_phlebotomist_memberships
  FOR EACH ROW EXECUTE FUNCTION collection_touch_updated_at();

-- A lab may bridge bookings and admissions only of hospitals it has been linked to. Before this table
-- the lab portal reached a tenant's bookings through a tenantId held in the browser's localStorage,
-- which is a client-supplied claim and not an authorization.
CREATE TABLE IF NOT EXISTS lab_collection_partners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid   text NOT NULL REFERENCES entity_registry (uid),
  partner_uid text NOT NULL REFERENCES entity_registry (uid),
  allow_home  boolean NOT NULL DEFAULT true,
  allow_ward  boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_uid <> partner_uid)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_partner ON lab_collection_partners (owner_uid, partner_uid) WHERE status <> 'ended';
DROP TRIGGER IF EXISTS trg_lab_collection_partner_uid ON lab_collection_partners;
CREATE TRIGGER trg_lab_collection_partner_uid BEFORE INSERT OR UPDATE OF owner_uid, partner_uid ON lab_collection_partners
  FOR EACH ROW EXECUTE FUNCTION collection_assert_entity_uid('owner_uid', 'partner_uid');

-- ── 2. the task ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_collection_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid          text NOT NULL REFERENCES entity_registry (uid),
  mode               text NOT NULL CHECK (mode IN ('home', 'ward')),
  source_kind        text NOT NULL CHECK (source_kind IN ('manual', 'booking', 'admission')),
  source_ref         text,
  partner_uid        text REFERENCES entity_registry (uid),
  status             text NOT NULL DEFAULT 'unassigned' CHECK (status IN (
                       'unassigned', 'assigned', 'accepted', 'en_route', 'arrived', 'at_bedside', 'verified',
                       'consented', 'collected', 'in_transit', 'handed_over', 'ward_handoff',
                       'lab_received', 'rejected_by_lab', 'refused', 'cancelled')),
  priority           text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  scheduled_start    timestamptz,
  scheduled_end      timestamptz,
  assigned_to        uuid REFERENCES lab_phlebotomists (id),
  assignment_version integer NOT NULL DEFAULT 0,
  version            integer NOT NULL DEFAULT 1,
  patient_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,
  redraw_of          uuid REFERENCES lab_collection_tasks (id),
  cancel_reason      text,
  created_by         text NOT NULL,
  collected_at       timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (source_kind = 'manual' OR source_ref IS NOT NULL),
  CHECK (source_kind = 'manual' OR partner_uid IS NOT NULL),
  CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end >= scheduled_start),
  CHECK (status = 'unassigned' OR status = 'cancelled' OR status = 'refused' OR assigned_to IS NOT NULL
         OR status IN ('lab_received', 'rejected_by_lab')),
  CHECK (mode = 'home' OR status NOT IN ('en_route', 'arrived', 'in_transit', 'handed_over')),
  CHECK (mode = 'ward' OR status NOT IN ('at_bedside', 'ward_handoff'))
);
-- One live task per source record: a booking cannot be dispatched twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_task_live_source
  ON lab_collection_tasks (owner_uid, source_kind, source_ref)
  WHERE source_ref IS NOT NULL AND status NOT IN ('cancelled', 'refused', 'lab_received', 'rejected_by_lab');
CREATE INDEX IF NOT EXISTS idx_lab_collection_tasks_board ON lab_collection_tasks (owner_uid, mode, status, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_lab_collection_tasks_worker ON lab_collection_tasks (assigned_to, status) WHERE assigned_to IS NOT NULL;
DROP TRIGGER IF EXISTS trg_lab_collection_tasks_uid ON lab_collection_tasks;
CREATE TRIGGER trg_lab_collection_tasks_uid BEFORE INSERT OR UPDATE OF owner_uid, partner_uid ON lab_collection_tasks
  FOR EACH ROW EXECUTE FUNCTION collection_assert_entity_uid('owner_uid', 'partner_uid');
DROP TRIGGER IF EXISTS trg_lab_collection_tasks_touch ON lab_collection_tasks;
CREATE TRIGGER trg_lab_collection_tasks_touch BEFORE UPDATE ON lab_collection_tasks
  FOR EACH ROW EXECUTE FUNCTION collection_touch_updated_at();

-- The mode projections. A home task carries an address and nothing ward-shaped, and vice versa; the
-- service rejects the other mode's fields, and the tables make it unrepresentable here too.
CREATE TABLE IF NOT EXISTS lab_collection_task_home (
  task_id         uuid PRIMARY KEY REFERENCES lab_collection_tasks (id),
  address         jsonb NOT NULL,
  contact_phone   text,
  departed_at     timestamptz,
  arrived_at      timestamptz,
  arrival_evidence jsonb
);

CREATE TABLE IF NOT EXISTS lab_collection_task_ward (
  task_id             uuid PRIMARY KEY REFERENCES lab_collection_tasks (id),
  facility_uid        text NOT NULL REFERENCES entity_registry (uid),
  admission_ref       text NOT NULL,
  ward_name           text,
  bed_label           text,
  round_label         text,
  isolation_required  boolean NOT NULL DEFAULT false,
  isolation_ack_at    timestamptz,
  order_version       integer NOT NULL DEFAULT 1,
  at_bedside_at       timestamptz
);
DROP TRIGGER IF EXISTS trg_lab_collection_task_ward_uid ON lab_collection_task_ward;
CREATE TRIGGER trg_lab_collection_task_ward_uid BEFORE INSERT OR UPDATE OF facility_uid ON lab_collection_task_ward
  FOR EACH ROW EXECUTE FUNCTION collection_assert_entity_uid('facility_uid');

CREATE TABLE IF NOT EXISTS lab_collection_task_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES lab_collection_tasks (id),
  test_code        text,
  test_name        text NOT NULL,
  container_type   text NOT NULL DEFAULT 'unspecified',
  required_volume_ml numeric(6, 2),
  handling         text,
  priority         text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  status           text NOT NULL DEFAULT 'required' CHECK (status IN ('required', 'scanned', 'collected', 'received', 'rejected')),
  specimen_id      uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_collection_task_tests_task ON lab_collection_task_tests (task_id);

-- ── 3. specimens and custody ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_collection_specimens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES lab_collection_tasks (id),
  owner_uid        text NOT NULL REFERENCES entity_registry (uid),
  barcode          text NOT NULL CHECK (barcode ~ '^[A-Za-z0-9._-]{4,64}$'),
  container_type   text NOT NULL DEFAULT 'unspecified',
  status           text NOT NULL DEFAULT 'scanned' CHECK (status IN ('scanned', 'collected', 'in_transit', 'handed_over', 'received', 'rejected')),
  collected_at     timestamptz,
  collected_by     uuid REFERENCES lab_phlebotomists (id),
  received_at      timestamptz,
  received_by      text,
  sample_condition text,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
-- A barcode identifies one tube for one owner for ever, including after rejection: a re-used label is how
-- two patients end up sharing a result.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_specimen_barcode ON lab_collection_specimens (owner_uid, barcode);
CREATE INDEX IF NOT EXISTS idx_lab_collection_specimens_task ON lab_collection_specimens (task_id);
DROP TRIGGER IF EXISTS trg_lab_collection_specimens_uid ON lab_collection_specimens;
CREATE TRIGGER trg_lab_collection_specimens_uid BEFORE INSERT OR UPDATE OF owner_uid ON lab_collection_specimens
  FOR EACH ROW EXECUTE FUNCTION collection_assert_entity_uid('owner_uid');
DROP TRIGGER IF EXISTS trg_lab_collection_specimens_touch ON lab_collection_specimens;
CREATE TRIGGER trg_lab_collection_specimens_touch BEFORE UPDATE ON lab_collection_specimens
  FOR EACH ROW EXECUTE FUNCTION collection_touch_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lab_collection_task_tests_specimen') THEN
    ALTER TABLE lab_collection_task_tests ADD CONSTRAINT fk_lab_collection_task_tests_specimen
      FOREIGN KEY (specimen_id) REFERENCES lab_collection_specimens (id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lab_specimen_custody_events (
  id            bigserial PRIMARY KEY,
  specimen_id   uuid NOT NULL REFERENCES lab_collection_specimens (id),
  task_id       uuid NOT NULL REFERENCES lab_collection_tasks (id),
  owner_uid     text NOT NULL REFERENCES entity_registry (uid),
  event_type    text NOT NULL CHECK (event_type IN ('scanned', 'collected', 'in_transit', 'handed_over', 'received', 'rejected')),
  from_state    text,
  to_state      text NOT NULL,
  actor_kind    text NOT NULL CHECK (actor_kind IN ('phlebotomist', 'lab', 'system')),
  actor_ref     text NOT NULL,
  operation_id  text,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_specimen_custody_specimen ON lab_specimen_custody_events (specimen_id, id);
CREATE INDEX IF NOT EXISTS idx_lab_specimen_custody_task ON lab_specimen_custody_events (task_id, id);
DROP TRIGGER IF EXISTS trg_lab_specimen_custody_append_only ON lab_specimen_custody_events;
CREATE TRIGGER trg_lab_specimen_custody_append_only BEFORE UPDATE OR DELETE ON lab_specimen_custody_events
  FOR EACH ROW EXECUTE FUNCTION collection_append_only();

CREATE TABLE IF NOT EXISTS lab_collection_task_events (
  id            bigserial PRIMARY KEY,
  task_id       uuid NOT NULL REFERENCES lab_collection_tasks (id),
  owner_uid     text NOT NULL REFERENCES entity_registry (uid),
  event_type    text NOT NULL,
  from_status   text,
  to_status     text NOT NULL,
  task_version  integer NOT NULL,
  actor_kind    text NOT NULL CHECK (actor_kind IN ('phlebotomist', 'dispatch', 'lab_receiver', 'system')),
  actor_ref     text NOT NULL,
  operation_id  text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_collection_task_events_task ON lab_collection_task_events (task_id, id);
DROP TRIGGER IF EXISTS trg_lab_collection_task_events_append_only ON lab_collection_task_events;
CREATE TRIGGER trg_lab_collection_task_events_append_only BEFORE UPDATE OR DELETE ON lab_collection_task_events
  FOR EACH ROW EXECUTE FUNCTION collection_append_only();

-- ── 4. evidence: consent and verification ────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_collection_consents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES lab_collection_tasks (id),
  outcome           text NOT NULL CHECK (outcome IN ('granted', 'refused')),
  consent_version   text NOT NULL,
  method            text NOT NULL CHECK (method IN ('verbal', 'written', 'digital')),
  language          text NOT NULL,
  given_by          text NOT NULL CHECK (given_by IN ('patient', 'guardian', 'witnessed')),
  actor_ref         text NOT NULL,
  operation_id      text,
  recorded_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_collection_consents_task ON lab_collection_consents (task_id);
DROP TRIGGER IF EXISTS trg_lab_collection_consents_append_only ON lab_collection_consents;
CREATE TRIGGER trg_lab_collection_consents_append_only BEFORE UPDATE OR DELETE ON lab_collection_consents
  FOR EACH ROW EXECUTE FUNCTION collection_append_only();

-- Minimum evidence that the right person was identified. The identifier TYPES that were checked are
-- stored, never the identifiers themselves.
CREATE TABLE IF NOT EXISTS lab_collection_patient_verifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES lab_collection_tasks (id),
  method            text NOT NULL CHECK (method IN ('two_identifiers', 'wristband')),
  result            text NOT NULL CHECK (result IN ('match', 'mismatch')),
  identifier_types  text[] NOT NULL,
  actor_ref         text NOT NULL,
  operation_id      text,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (method <> 'two_identifiers' OR cardinality(identifier_types) >= 2)
);
CREATE INDEX IF NOT EXISTS idx_lab_collection_verifications_task ON lab_collection_patient_verifications (task_id);
DROP TRIGGER IF EXISTS trg_lab_collection_verifications_append_only ON lab_collection_patient_verifications;
CREATE TRIGGER trg_lab_collection_verifications_append_only BEFORE UPDATE OR DELETE ON lab_collection_patient_verifications
  FOR EACH ROW EXECUTE FUNCTION collection_append_only();

-- ── 5. exceptions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_collection_exceptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_uid     text NOT NULL REFERENCES entity_registry (uid),
  task_id       uuid NOT NULL REFERENCES lab_collection_tasks (id),
  specimen_id   uuid REFERENCES lab_collection_specimens (id),
  code          text NOT NULL CHECK (code IN ('identity_mismatch', 'patient_refused', 'patient_unavailable', 'specimen_rejected',
                                              'declined_by_worker', 'source_changed', 'other')),
  reason        text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  owner_role    text NOT NULL DEFAULT 'dispatch' CHECK (owner_role IN ('dispatch', 'lab_receiver')),
  due_at        timestamptz,
  next_action   text,
  raised_by     text NOT NULL,
  resolved_by   text,
  resolved_at   timestamptz,
  resolution    text,
  redraw_task_id uuid REFERENCES lab_collection_tasks (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'open' OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_lab_collection_exceptions_board ON lab_collection_exceptions (owner_uid, status, created_at);
-- A retried command must not raise the same exception twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_exception_open
  ON lab_collection_exceptions (task_id, code, COALESCE(specimen_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'open';
DROP TRIGGER IF EXISTS trg_lab_collection_exceptions_uid ON lab_collection_exceptions;
CREATE TRIGGER trg_lab_collection_exceptions_uid BEFORE INSERT OR UPDATE OF owner_uid ON lab_collection_exceptions
  FOR EACH ROW EXECUTE FUNCTION collection_assert_entity_uid('owner_uid');

-- ── 6. idempotency and integration outbox ────────────────────────────────────
-- Written in the SAME transaction as the command it guards, so a crash leaves neither or both.
CREATE TABLE IF NOT EXISTS lab_mobile_operations (
  actor_ref     text NOT NULL,
  operation_id  text NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 128),
  command       text NOT NULL,
  request_hash  text NOT NULL,
  device_id     text,
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  http_status   integer,
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (actor_ref, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_lab_mobile_operations_created ON lab_mobile_operations (created_at);

CREATE TABLE IF NOT EXISTS lab_collection_outbox (
  id              bigserial PRIMARY KEY,
  owner_uid       text NOT NULL REFERENCES entity_registry (uid),
  aggregate_type  text NOT NULL,
  aggregate_id    text NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  text,
  dedupe_key      text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_outbox_dedupe ON lab_collection_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_lab_collection_outbox_pending ON lab_collection_outbox (next_attempt_at) WHERE status = 'pending';
