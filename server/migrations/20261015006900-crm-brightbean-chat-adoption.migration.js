/**
 * Clean-room CRM chat automation extensions.
 *
 * Capability modeled on the public BrightBean Chat product behavior; the
 * implementation, schema and validation are independently authored for
 * Mediqzy. No BrightBean source, schema or assets are used.
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    ALTER TABLE social_inbox_conversations
      ADD COLUMN IF NOT EXISTS tenant_uid TEXT,
      ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS human_takeover_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS human_takeover_by BIGINT,
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

    -- Legacy inbox rows were globally unique. Preserve that behavior for
    -- unscoped webhook rows while allowing the CRM to isolate equal social
    -- identities belonging to different tenants.
    ALTER TABLE social_inbox_conversations
      DROP CONSTRAINT IF EXISTS social_inbox_conversations_channel_external_user_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_social_inbox_legacy_identity
      ON social_inbox_conversations (channel, external_user_id)
      WHERE tenant_uid IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_social_inbox_tenant_identity
      ON social_inbox_conversations (tenant_uid, channel, external_user_id)
      WHERE tenant_uid IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_social_inbox_conv_tenant_status
      ON social_inbox_conversations (tenant_uid, status, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS crm_social_inbox_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-rule-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      name VARCHAR(160) NOT NULL,
      channel VARCHAR(30),
      match_type VARCHAR(30) NOT NULL CHECK (match_type IN ('keyword','event','status','label')),
      match_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      priority INTEGER NOT NULL DEFAULT 100,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT,
      updated_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, name)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_rules_active
      ON crm_social_inbox_rules (tenant_uid, active, priority);

    CREATE TABLE IF NOT EXISTS crm_social_inbox_reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-reminder-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      conversation_id BIGINT NOT NULL,
      remind_at TIMESTAMPTZ NOT NULL,
      note TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','cancelled','failed')),
      created_by BIGINT,
      sent_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_reminders_due
      ON crm_social_inbox_reminders (tenant_uid, status, remind_at);

    CREATE TABLE IF NOT EXISTS crm_whatsapp_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-wa-template-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      name VARCHAR(160) NOT NULL,
      language VARCHAR(20) NOT NULL DEFAULT 'en_US',
      category VARCHAR(30) NOT NULL CHECK (category IN ('marketing','utility','authentication')),
      status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','paused')),
      components JSONB NOT NULL DEFAULT '[]'::jsonb,
      provider_template_id VARCHAR(240),
      quality_rating VARCHAR(30),
      rejection_reason TEXT,
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      created_by BIGINT,
      updated_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, name, language)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_templates_status
      ON crm_whatsapp_templates (tenant_uid, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS crm_social_erasure_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-erasure-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      identity_id UUID,
      channel VARCHAR(30) NOT NULL,
      external_user_id TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
      reason TEXT,
      requested_by BIGINT,
      processed_by BIGINT,
      processed_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_erasure_status
      ON crm_social_erasure_requests (tenant_uid, status, created_at);
  `);
}

export async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS crm_social_erasure_requests, crm_whatsapp_templates,
      crm_social_inbox_reminders, crm_social_inbox_rules CASCADE;
    ALTER TABLE social_inbox_conversations
      DROP COLUMN IF EXISTS labels,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS human_takeover_at,
      DROP COLUMN IF EXISTS human_takeover_by,
      DROP COLUMN IF EXISTS closed_at;
  `);
}

if ((process.argv[1] && process.argv[1].endsWith('20261015006900-crm-brightbean-chat-adoption.migration.js')) || (process.argv[2] && process.argv[2].endsWith('20261015006900-crm-brightbean-chat-adoption.migration.js'))) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => {
    try { await up(client); console.log('crm-brightbean-chat migration applied'); }
    finally { client.release(); }
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
