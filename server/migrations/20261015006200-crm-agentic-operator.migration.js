/** AgenticCRM operator storage: expiring proposals, scoped memory and legacy CRM tenant twins. */
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    ALTER TABLE crm_audit_log ADD COLUMN IF NOT EXISTS tenant_uid TEXT;
    CREATE INDEX IF NOT EXISTS idx_crm_audit_log_tenant_uid ON crm_audit_log(tenant_uid, created_at DESC);

    DO $$
    BEGIN
      IF to_regclass('crm_deals') IS NOT NULL THEN
        ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS tenant_uid TEXT;
        CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant_uid ON crm_deals(tenant_uid, updated_at DESC);
      END IF;
      IF to_regclass('crm_activities') IS NOT NULL THEN
        ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS tenant_uid TEXT;
        CREATE INDEX IF NOT EXISTS idx_crm_activities_tenant_uid ON crm_activities(tenant_uid, created_at DESC);
      END IF;
      IF to_regclass('crm_contacts') IS NOT NULL THEN
        ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS tenant_uid TEXT;
        CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant_uid ON crm_contacts(tenant_uid, updated_at DESC);
      END IF;
    END $$;

    -- Existing legacy rows inherit the owning tenant from their v2 lead twin.
    UPDATE crm_deals d SET tenant_uid = v.tenant_uid
      FROM crm_leads_v2 v
     WHERE d.tenant_uid IS NULL AND d.lead_id IS NOT NULL
       AND v.legacy_lead_id = d.lead_id AND v.tenant_uid IS NOT NULL;
    UPDATE crm_activities a SET tenant_uid = v.tenant_uid
      FROM crm_leads_v2 v
     WHERE a.tenant_uid IS NULL AND a.lead_id IS NOT NULL
       AND v.legacy_lead_id = a.lead_id AND v.tenant_uid IS NOT NULL;
    UPDATE crm_contacts c SET tenant_uid = v.tenant_uid
      FROM crm_leads_v2 v
     WHERE c.tenant_uid IS NULL AND c.lead_id IS NOT NULL
       AND v.legacy_lead_id = c.lead_id AND v.tenant_uid IS NOT NULL;

    CREATE TABLE IF NOT EXISTS crm_agent_memories (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-agent-memory-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      actor_user_id BIGINT NOT NULL,
      memory_key VARCHAR(160) NOT NULL,
      category VARCHAR(60) NOT NULL DEFAULT 'general',
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      source VARCHAR(80) NOT NULL DEFAULT 'agent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, actor_user_id, category, memory_key)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_agent_memories_actor ON crm_agent_memories(tenant_uid, actor_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS crm_agent_proposals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-agent-proposal-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      actor_user_id BIGINT NOT NULL,
      tool_name VARCHAR(100) NOT NULL,
      args JSONB NOT NULL DEFAULT '{}'::jsonb,
      preview JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','applied','rejected','expired')),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
      confirmed_at TIMESTAMPTZ,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_agent_proposals_pending ON crm_agent_proposals(tenant_uid, actor_user_id, status, expires_at);
  `);
}

export async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS crm_agent_proposals, crm_agent_memories CASCADE');
}

if ((process.argv[1] && process.argv[1].endsWith('20261015006200-crm-agentic-operator.migration.js'))
  || (process.argv[2] && process.argv[2].endsWith('20261015006200-crm-agentic-operator.migration.js'))) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => {
    try { await up(client); console.log('crm-agentic-operator migration applied'); }
    finally { client.release(); }
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
