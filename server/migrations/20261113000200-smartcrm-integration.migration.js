/**
 * SmartCRM integration (ADR-001), phases 0-3 on the Mediqzy side.
 *
 * The member app talks only to Mediqzy. For a corporate whose group insurance
 * is administered in SmartCRM, Mediqzy reads the member's policies from
 * SmartCRM's partner API, projects them into insurance_policies and
 * policy_members (so the existing wallet shows them unchanged), and passes
 * enrolment writes through to SmartCRM. SmartCRM stays the system of record.
 *
 * Everything here is inert until a binding row exists with read_enabled = true
 * AND the process has SMARTCRM_INTEGRATION_ENABLED=true. Nothing is enabled by
 * this migration.
 *
 *   smartcrm_corporate_bindings — which SmartCRM tenant/corporate a Mediqzy
 *     corporate maps to, and the NAME of the env var that holds its partner
 *     key. The key itself is never stored in the database.
 *
 *   insurance_member_links — one Mediqzy user ↔ one SmartCRM member. Two
 *     partial unique indexes make the link one-to-one in both directions while
 *     it is active: a user cannot be linked twice into a tenant, and a SmartCRM
 *     member cannot be claimed by two users. Unlinked rows are kept as history.
 *
 *   source_system / source_ref / source_synced_at on insurance_policies and
 *     policy_members — marks projected rows so a refresh can upsert them and
 *     retire the ones SmartCRM no longer returns, without touching rows
 *     Mediqzy owns.
 *
 *   insurance_enrolment_requests — the idempotency store for enrolment writes,
 *     and the record of the last submit result per member.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS smartcrm_corporate_bindings (
      id                  SERIAL PRIMARY KEY,
      corporate_id        INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      tenant_slug         TEXT NOT NULL,
      smartcrm_corporate  TEXT NOT NULL,
      -- The name of the environment variable holding this corporate's partner
      -- key, never the key. Constrained so a key pasted here by mistake fails.
      api_key_env         TEXT NOT NULL
                          CHECK (api_key_env ~ '^SMARTCRM_KEY_[A-Z0-9_]{1,60}$'),
      read_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
      enrolment_mode      TEXT NOT NULL DEFAULT 'off'
                          CHECK (enrolment_mode IN ('off', 'web', 'in_app')),
      web_enrolment_url   TEXT CHECK (web_enrolment_url IS NULL OR web_enrolment_url ~ '^https://'),
      notes               TEXT,
      created_by_user_id  INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT smartcrm_bindings_one_per_corporate UNIQUE (corporate_id),
      CONSTRAINT smartcrm_bindings_one_per_source UNIQUE (tenant_slug, smartcrm_corporate)
    );

    CREATE TABLE IF NOT EXISTS insurance_member_links (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      corporate_id        INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      source_system       TEXT NOT NULL DEFAULT 'smartcrm' CHECK (source_system IN ('smartcrm')),
      source_tenant       TEXT NOT NULL,
      source_corporate    TEXT NOT NULL,
      emp_id              TEXT NOT NULL,
      -- SmartCRM's own member id, learned on the first successful read and
      -- checked on every read after it. A different id means the emp_id now
      -- points at someone else, and the link is refused, not followed.
      source_member_id    TEXT,
      status              TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'unlinked', 'mismatch')),
      consent_id          UUID,
      linked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unlinked_at         TIMESTAMPTZ,
      last_synced_at      TIMESTAMPTZ,
      last_error          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_link_user_per_tenant
      ON insurance_member_links (user_id, source_system, source_tenant)
      WHERE status = 'active';
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_link_source_member
      ON insurance_member_links (source_system, source_tenant, source_member_id)
      WHERE status = 'active' AND source_member_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_member_link_emp
      ON insurance_member_links (source_system, source_tenant, source_corporate, emp_id)
      WHERE status = 'active';

    ALTER TABLE insurance_policies
      ADD COLUMN IF NOT EXISTS source_system    TEXT,
      ADD COLUMN IF NOT EXISTS source_ref       TEXT,
      ADD COLUMN IF NOT EXISTS source_synced_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_insurance_policies_source
      ON insurance_policies (source_system, source_ref)
      WHERE source_system IS NOT NULL;

    ALTER TABLE policy_members
      ADD COLUMN IF NOT EXISTS source_system    TEXT,
      ADD COLUMN IF NOT EXISTS source_ref       TEXT,
      ADD COLUMN IF NOT EXISTS source_synced_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_policy_members_source
      ON policy_members (source_system, source_ref)
      WHERE source_system IS NOT NULL;

    CREATE TABLE IF NOT EXISTS insurance_enrolment_requests (
      id                  BIGSERIAL PRIMARY KEY,
      user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      link_id             INTEGER REFERENCES insurance_member_links(id) ON DELETE SET NULL,
      operation           TEXT NOT NULL,
      idempotency_key     TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
      request_hash        TEXT NOT NULL,
      state               TEXT NOT NULL DEFAULT 'in_flight'
                          CHECK (state IN ('in_flight', 'done', 'failed')),
      status_code         INTEGER,
      response            JSONB,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at        TIMESTAMPTZ,
      CONSTRAINT uniq_enrolment_request_key UNIQUE (user_id, operation, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_enrolment_requests_user_op
      ON insurance_enrolment_requests (user_id, operation, created_at DESC);
  `);

  // Uid twins for the new cross-entity references (CLAUDE.md rule 5). Guarded
  // like the other 2026-11 migrations so an environment without the entity
  // uid functions still gets the tables.
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('smartcrm_corporate_bindings', 'corporate_id', 'corporate_uid', 'corporates');
        PERFORM attach_uid_reference('insurance_member_links', 'corporate_id', 'corporate_uid', 'corporates');
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'unique_id'
        ) THEN
          PERFORM attach_uid_reference('insurance_member_links', 'user_id', 'user_uid', 'users');
          PERFORM attach_uid_reference('insurance_enrolment_requests', 'user_id', 'user_uid', 'users');
        END IF;
      END IF;
    END
    $$;
  `);
}

export async function down(db = pool) {
  await db.query(`
    DROP TABLE IF EXISTS insurance_enrolment_requests;
    DROP TABLE IF EXISTS insurance_member_links;
    DROP TABLE IF EXISTS smartcrm_corporate_bindings;
    DROP INDEX IF EXISTS uniq_policy_members_source;
    DROP INDEX IF EXISTS uniq_insurance_policies_source;
    ALTER TABLE policy_members
      DROP COLUMN IF EXISTS source_system,
      DROP COLUMN IF EXISTS source_ref,
      DROP COLUMN IF EXISTS source_synced_at;
    ALTER TABLE insurance_policies
      DROP COLUMN IF EXISTS source_system,
      DROP COLUMN IF EXISTS source_ref,
      DROP COLUMN IF EXISTS source_synced_at;
  `);
}

export default { up, down };
