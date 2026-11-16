/**
 * Call centre tools, field manager tools, shared follow-ups and app push devices, merged back from the
 * Medstar installation (medstar-crm 1c37423). Replaces installations/crm/call-centre-and-field.sql, which
 * Medstar applied by hand on 2026-11-16. Additive and idempotent, so it is safe on Medstar's database.
 *
 *   crm_agent_status_log   one row per agent status change; the open row (ended_at IS NULL) is current
 *   crm_quick_answers      call-centre scripts and quick answers
 *   field_target_moves     quota moves between field executives
 *   field_settings         per-tenant day start (late clock-in threshold)
 *   crm_push_devices       Firebase Cloud Messaging tokens of the field / agent app
 *   field_outreach_permissions + reviewed_by, reviewed_at, review_note
 *   field_doctor_crm.contact_id   one doctor, one record (links the field doctor to the CRM contact)
 *   crm_activities.assigned_to, field_visit_id   a field follow-up becomes a shared Inbox task
 *
 * The new tables are CRM records (bigserial ids, not registry entities). Every new column that points at a
 * staff user gets its uid twin (entity uid rule 5); the twin is filled by trigger from the integer, so the
 * code writes the integer as before.
 *
 * Run: node scripts/ssm-env-loader.mjs server/scripts/run-one-migration.mjs \
 *        server/migrations/20261116000200-crm-call-centre-and-field.migration.js
 * (also listed in server/scripts/migrate-crm-all.mjs)
 */
import { fileURLToPath } from 'node:url';
import pool from '../db/pgPool.js';

/** [table, integer column, uid twin] for every new reference to a user. */
export const USER_REFERENCES = [
  ['crm_agent_status_log', 'user_id', 'user_uid'],
  ['crm_quick_answers', 'created_by', 'created_by_uid'],
  ['crm_quick_answers', 'updated_by', 'updated_by_uid'],
  ['field_target_moves', 'from_user_id', 'from_user_uid'],
  ['field_target_moves', 'to_user_id', 'to_user_uid'],
  ['field_target_moves', 'moved_by', 'moved_by_uid'],
  ['field_outreach_permissions', 'reviewed_by', 'reviewed_by_uid'],
  ['field_settings', 'updated_by', 'updated_by_uid'],
  ['crm_activities', 'assigned_to', 'assigned_to_uid'],
  ['crm_push_devices', 'user_id', 'user_uid'],
];

/** Runs inside the caller's transaction (migrate-crm-all.mjs, run-one-migration.mjs, or direct run below). */
export async function up(client = pool) {
  const { rows: [rule] } = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') AS present");
  if (!rule?.present) throw new Error('attach_uid_reference() is missing: apply the entity-uid rule migrations first');

  await client.query(`
    CREATE TABLE IF NOT EXISTS crm_agent_status_log (
      id bigserial PRIMARY KEY,
      tenant_id integer NOT NULL,
      user_id integer NOT NULL,
      status text NOT NULL CHECK (status IN ('available', 'break', 'offline')),
      reason text,
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz,
      telecmi_synced boolean NOT NULL DEFAULT false,
      telecmi_error text
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS idx_agent_status_open ON crm_agent_status_log (tenant_id, user_id) WHERE ended_at IS NULL');
  await client.query('CREATE INDEX IF NOT EXISTS idx_agent_status_day ON crm_agent_status_log (tenant_id, user_id, started_at DESC)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS crm_quick_answers (
      id bigserial PRIMARY KEY,
      tenant_id integer NOT NULL,
      kind text NOT NULL DEFAULT 'answer' CHECK (kind IN ('script', 'answer')),
      category text NOT NULL DEFAULT 'General',
      title text NOT NULL,
      body text NOT NULL,
      sort integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      uses integer NOT NULL DEFAULT 0,
      created_by integer,
      updated_by integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS idx_quick_answers_tenant ON crm_quick_answers (tenant_id, active, kind, category)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS field_target_moves (
      id bigserial PRIMARY KEY,
      tenant_id integer NOT NULL,
      month varchar(7) NOT NULL,
      from_user_id integer NOT NULL,
      to_user_id integer NOT NULL,
      target_type text NOT NULL,
      quantity numeric NOT NULL,
      reason text,
      moved_by integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS idx_field_target_moves ON field_target_moves (tenant_id, month, created_at DESC)');

  await client.query('ALTER TABLE field_outreach_permissions ADD COLUMN IF NOT EXISTS reviewed_by integer');
  await client.query('ALTER TABLE field_outreach_permissions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz');
  await client.query('ALTER TABLE field_outreach_permissions ADD COLUMN IF NOT EXISTS review_note text');

  await client.query(`
    CREATE TABLE IF NOT EXISTS field_settings (
      tenant_id integer PRIMARY KEY,
      day_start time NOT NULL DEFAULT '09:30',
      updated_by integer,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

  await client.query('ALTER TABLE field_doctor_crm ADD COLUMN IF NOT EXISTS contact_id bigint');
  await client.query('CREATE INDEX IF NOT EXISTS idx_field_doctor_crm_contact ON field_doctor_crm (contact_id) WHERE contact_id IS NOT NULL');

  await client.query('ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS assigned_to integer');
  await client.query('ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS field_visit_id bigint');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_activities_field_visit ON crm_activities (field_visit_id) WHERE field_visit_id IS NOT NULL');
  await client.query("CREATE INDEX IF NOT EXISTS idx_crm_activities_open_tasks ON crm_activities (tenant_uid, scheduled_at) WHERE type = 'task' AND completed_at IS NULL");

  await client.query(`
    CREATE TABLE IF NOT EXISTS crm_push_devices (
      id bigserial PRIMARY KEY,
      tenant_id integer NOT NULL,
      user_id integer NOT NULL,
      token text NOT NULL UNIQUE,
      platform text NOT NULL CHECK (platform IN ('android', 'ios')),
      app_version text,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS idx_push_devices_user ON crm_push_devices (tenant_id, user_id) WHERE revoked_at IS NULL');

  for (const [table, intCol, uidCol] of USER_REFERENCES) {
    await client.query('SELECT attach_uid_reference($1, $2, $3, $4)', [table, intCol, uidCol, 'users']);
  }
}

/** Schema is additive; down() leaves the tables and columns in place on purpose. */
export async function down() {}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await up(client); await client.query('COMMIT'); console.log('CRM call centre and field migration applied'); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error(error.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
