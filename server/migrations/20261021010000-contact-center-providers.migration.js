/** Add provider selection and retain a non-secret provider reference on historical calls. */
export async function up(client) {
  await client.query(`ALTER TABLE cc_configs DROP CONSTRAINT IF EXISTS cc_configs_provider_check;
    ALTER TABLE cc_configs ADD CONSTRAINT cc_configs_provider_check CHECK(provider IN ('exotel','telecmi','zoom_phone','airtel_iq','twilio','plivo'));
    ALTER TABLE cc_calls ADD COLUMN IF NOT EXISTS provider_config JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
}
export async function down(){throw new Error('Keep provider history; rollback the application only');}
