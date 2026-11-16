/**
 * CRM modules merged back from the Medstar installation (Phase 1 of "One Product, Many Deployments").
 * Replaces Medstar's two raw SQL files, which ran there by hand:
 *   - migrations/20261115000000-crm-whatsapp-provider-control.sql (Medstar)
 *   - installations/crm/referral-network.sql (Medstar)
 * Everything is additive and idempotent, so it is safe on Medstar's database, where most of it already exists.
 *
 * WhatsApp provider control (Gupshup):
 *   crm_communication_templates gains provider, provider_template_id, provider_status, language_code,
 *   rejection_reason and metadata, so a CRM template can track Meta's review of its provider template;
 *   the status check gains pending_approval / approved / rejected / disabled.
 *   crm_channel_events logs provider webhook events (template reviews, account status, opt-ins, billing,
 *   delivery) WITHOUT message bodies, so the integration's history is auditable from the CRM.
 *
 * Referral network:
 *   crm_leads_v2.referring_doctor_id credits a patient lead to the field doctor (field_doctor_crm, a CRM
 *   record, not a registry entity) who referred it; crm_leads_v2.referred_by_user_id + its uid twin
 *   referred_by_user_uid record the staff user who logged the referral (entity uid rule 5);
 *   field_camp_registrations.crm_lead_id links a camp registration to the lead it became.
 *
 * Run: node scripts/ssm-env-loader.mjs server/scripts/run-one-migration.mjs \
 *        server/migrations/20261116000100-crm-medstar-modules.migration.js
 * (also listed in server/scripts/migrate-crm-all.mjs)
 */
import { fileURLToPath } from 'node:url';
import pool from '../db/pgPool.js';

/** Runs inside the caller's transaction (migrate-crm-all.mjs, run-one-migration.mjs, or direct run below). */
export async function up(client = pool) {
  const { rows: [rule] } = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') AS present");
  if (!rule?.present) throw new Error('attach_uid_reference() is missing: apply the entity-uid rule migrations first');

  // ── WhatsApp provider control ────────────────────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE crm_communication_templates
      ADD COLUMN IF NOT EXISTS provider varchar(40),
      ADD COLUMN IF NOT EXISTS provider_template_id varchar(120),
      ADD COLUMN IF NOT EXISTS provider_status varchar(40),
      ADD COLUMN IF NOT EXISTS language_code varchar(20),
      ADD COLUMN IF NOT EXISTS rejection_reason text,
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await client.query('ALTER TABLE crm_communication_templates DROP CONSTRAINT IF EXISTS crm_communication_templates_status_check');
  await client.query(`
    ALTER TABLE crm_communication_templates ADD CONSTRAINT crm_communication_templates_status_check
      CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'disabled', 'archived'))`);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_templates_provider_id
      ON crm_communication_templates (tenant_id, provider, provider_template_id) WHERE provider_template_id IS NOT NULL`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS crm_channel_events (
      id bigserial PRIMARY KEY,
      tenant_id bigint NOT NULL,
      provider varchar(40) NOT NULL,
      event_type varchar(60) NOT NULL,
      event_subtype varchar(60),
      reference varchar(240),
      summary text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      received_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS idx_crm_channel_events_recent ON crm_channel_events (tenant_id, provider, received_at DESC)');

  // ── Referral network ─────────────────────────────────────────────────────────────────────────
  await client.query('ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS referring_doctor_id bigint REFERENCES field_doctor_crm(id) ON DELETE SET NULL');
  await client.query('ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS referred_by_user_id integer');
  await client.query('SELECT attach_uid_reference($1, $2, $3, $4)', ['crm_leads_v2', 'referred_by_user_id', 'referred_by_user_uid', 'users']);
  await client.query('CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_referring_doctor ON crm_leads_v2 (tenant_id, referring_doctor_id) WHERE referring_doctor_id IS NOT NULL');
  await client.query('ALTER TABLE field_camp_registrations ADD COLUMN IF NOT EXISTS crm_lead_id bigint');
  await client.query('CREATE INDEX IF NOT EXISTS idx_field_doctor_crm_tenant_exec ON field_doctor_crm (tenant_id, assigned_exec_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_field_visits_doctor ON field_visits (tenant_id, doctor_crm_id, check_in_at DESC)');
}

/** Schema is additive; down() leaves data-bearing columns and the event log in place on purpose. */
export async function down() {}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await up(client); await client.query('COMMIT'); console.log('CRM Medstar modules migration applied'); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error(error.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
