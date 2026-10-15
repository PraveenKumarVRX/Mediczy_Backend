import sharedPool from '../db/pgPool.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS crm_automations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50) NOT NULL,
    trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
    action_type VARCHAR(50) NOT NULL,
    action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS crm_automation_executions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    automation_id BIGINT NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (automation_id, lead_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_crm_automation_exec_due ON crm_automation_executions(status, scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS crm_segments (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    filter_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    member_count INTEGER NOT NULL DEFAULT 0,
    last_refreshed_at TIMESTAMPTZ,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS crm_segment_members (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    segment_id BIGINT NOT NULL REFERENCES crm_segments(id) ON DELETE CASCADE,
    lead_id BIGINT NOT NULL REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (segment_id, lead_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_crm_segment_members_segment ON crm_segment_members(segment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_crm_segment_members_lead ON crm_segment_members(tenant_id, lead_id)`
];

export async function up() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try { await client.query('BEGIN'); for (const statement of statements) await client.query(statement); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function down() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try { await client.query('DROP TABLE IF EXISTS crm_segment_members CASCADE'); await client.query('DROP TABLE IF EXISTS crm_segments CASCADE'); await client.query('DROP TABLE IF EXISTS crm_automation_executions CASCADE'); await client.query('DROP TABLE IF EXISTS crm_automations CASCADE'); }
  finally { client.release(); }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005300-crm-growth-governance.migration.js')) {
  up().then(() => console.log('crm-growth-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
}
