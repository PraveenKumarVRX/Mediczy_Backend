/** Tenant-scoped social growth controls over the existing Meta inbox adapter. */
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_inbox_conversations (
      id SERIAL PRIMARY KEY, channel TEXT NOT NULL CHECK (channel IN ('instagram','facebook')), page_id TEXT,
      external_user_id TEXT NOT NULL, contact_name TEXT, contact_avatar_url TEXT, last_message_preview TEXT,
      last_message_at TIMESTAMPTZ, last_direction TEXT CHECK (last_direction IN ('inbound','outbound')),
      unread_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      assigned_team_user_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (channel, external_user_id)
    );
    CREATE TABLE IF NOT EXISTS social_inbox_messages (
      id SERIAL PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES social_inbox_conversations(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')), external_message_id TEXT, body TEXT,
      attachments JSONB, sent_by_team_user_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE social_inbox_conversations ADD COLUMN IF NOT EXISTS tenant_uid TEXT;
    CREATE INDEX IF NOT EXISTS idx_social_inbox_conv_tenant ON social_inbox_conversations(tenant_uid, updated_at DESC);
    CREATE TABLE IF NOT EXISTS crm_social_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-identity-' || gen_random_uuid()::text), tenant_uid TEXT NOT NULL,
      channel VARCHAR(30) NOT NULL CHECK (channel IN ('instagram','facebook','whatsapp','sms','email')),
      external_user_id VARCHAR(240) NOT NULL, contact_id BIGINT, lead_id BIGINT,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb, consent_status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown','opted_in','opted_out')),
      last_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, channel, external_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_identities_tenant ON crm_social_identities(tenant_uid, channel, updated_at DESC);
    CREATE TABLE IF NOT EXISTS crm_social_triggers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-trigger-' || gen_random_uuid()::text), tenant_uid TEXT NOT NULL,
      trigger_type VARCHAR(40) NOT NULL CHECK (trigger_type IN ('comment_to_dm','story_mention','follow','ref_url','qr')),
      channel VARCHAR(30) NOT NULL, trigger_key VARCHAR(240) NOT NULL, flow_id UUID REFERENCES crm_flow_definitions(id) ON DELETE SET NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE, created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, trigger_type, channel, trigger_key)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_triggers_active ON crm_social_triggers(tenant_uid, active, trigger_type);
    CREATE TABLE IF NOT EXISTS crm_social_automation_pauses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-pause-' || gen_random_uuid()::text), tenant_uid TEXT NOT NULL, conversation_id BIGINT NOT NULL,
      reason TEXT NOT NULL, paused_by BIGINT, paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resumed_at TIMESTAMPTZ,
      UNIQUE (tenant_uid, conversation_id, resumed_at)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_pauses_active ON crm_social_automation_pauses(tenant_uid, conversation_id) WHERE resumed_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_social_pauses_active ON crm_social_automation_pauses(tenant_uid, conversation_id) WHERE resumed_at IS NULL;
    CREATE TABLE IF NOT EXISTS crm_social_scheduled_replies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-social-reply-' || gen_random_uuid()::text), tenant_uid TEXT NOT NULL, conversation_id BIGINT NOT NULL,
      body TEXT NOT NULL, send_at TIMESTAMPTZ NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','cancelled','failed')),
      created_by BIGINT, sent_at TIMESTAMPTZ, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_scheduled_replies_due ON crm_social_scheduled_replies(tenant_uid, status, send_at);
  `);
}

export async function down(pool) { await pool.query('DROP TABLE IF EXISTS crm_social_scheduled_replies, crm_social_automation_pauses, crm_social_triggers, crm_social_identities CASCADE'); }

if ((process.argv[1] && process.argv[1].endsWith('20261015006400-crm-social-growth.migration.js')) || (process.argv[2] && process.argv[2].endsWith('20261015006400-crm-social-growth.migration.js'))) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => { try { await up(client); console.log('crm-social-growth migration applied'); } finally { client.release(); } }).catch((error) => { console.error(error); process.exitCode = 1; });
}
