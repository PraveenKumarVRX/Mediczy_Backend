/**
 * Chatwoot as the Team's WhatsApp desk for the My SmartHealth number (owner request 2026-11-22).
 *
 * The Chatwoot bridge accepted only Twilio for WhatsApp; the number (8098998998) is on Gupshup.
 * Also lets the bridge record the automatic assistant's replies in Chatwoot ('bot' jobs), so
 * agents see the whole conversation; a 'bot' job is shown in Chatwoot and never sent to the member.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261122000100-chatwoot-whatsapp-gupshup.migration.js
 */
export async function up(client) {
  await client.query('ALTER TABLE crm_chatwoot_inboxes DROP CONSTRAINT IF EXISTS crm_chatwoot_inboxes_provider_check');
  await client.query('ALTER TABLE crm_chatwoot_inboxes DROP CONSTRAINT IF EXISTS crm_chatwoot_inboxes_check');
  await client.query(`ALTER TABLE crm_chatwoot_inboxes ADD CONSTRAINT crm_chatwoot_inboxes_provider_check
    CHECK (provider IN ('twilio', 'gupshup', 'smtp', 'internal'))`);
  await client.query(`ALTER TABLE crm_chatwoot_inboxes ADD CONSTRAINT crm_chatwoot_inboxes_check
    CHECK ((channel IN ('whatsapp', 'sms') AND provider = 'twilio')
        OR (channel = 'whatsapp' AND provider = 'gupshup')
        OR (channel = 'email' AND provider = 'smtp')
        OR (channel = 'in_app' AND provider = 'internal'))`);
  await client.query('ALTER TABLE crm_chatwoot_jobs DROP CONSTRAINT IF EXISTS crm_chatwoot_jobs_direction_check');
  await client.query(`ALTER TABLE crm_chatwoot_jobs ADD CONSTRAINT crm_chatwoot_jobs_direction_check
    CHECK (direction IN ('inbound', 'outbound', 'bot'))`);
}

export async function down(client) {
  await client.query("DELETE FROM crm_chatwoot_jobs WHERE direction = 'bot'");
  await client.query('ALTER TABLE crm_chatwoot_jobs DROP CONSTRAINT IF EXISTS crm_chatwoot_jobs_direction_check');
  await client.query(`ALTER TABLE crm_chatwoot_jobs ADD CONSTRAINT crm_chatwoot_jobs_direction_check CHECK (direction IN ('inbound', 'outbound'))`);
  await client.query('ALTER TABLE crm_chatwoot_inboxes DROP CONSTRAINT IF EXISTS crm_chatwoot_inboxes_check');
  await client.query('ALTER TABLE crm_chatwoot_inboxes DROP CONSTRAINT IF EXISTS crm_chatwoot_inboxes_provider_check');
  await client.query(`ALTER TABLE crm_chatwoot_inboxes ADD CONSTRAINT crm_chatwoot_inboxes_provider_check CHECK (provider IN ('twilio', 'smtp', 'internal'))`);
  await client.query(`ALTER TABLE crm_chatwoot_inboxes ADD CONSTRAINT crm_chatwoot_inboxes_check
    CHECK ((channel IN ('whatsapp', 'sms') AND provider = 'twilio') OR (channel = 'email' AND provider = 'smtp') OR (channel = 'in_app' AND provider = 'internal'))`);
}
