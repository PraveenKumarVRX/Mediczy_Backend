/** Clean-room CRM visual flow builder storage. Graphs are tenant-scoped and versioned. */
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_flow_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-flow-' || gen_random_uuid()::text),
      tenant_uid TEXT NOT NULL,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by BIGINT,
      updated_by BIGINT,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, name, version)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_flow_definitions_tenant ON crm_flow_definitions(tenant_uid, status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS crm_flow_nodes (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-flow-node-' || gen_random_uuid()::text),
      flow_id UUID NOT NULL REFERENCES crm_flow_definitions(id) ON DELETE CASCADE,
      node_key VARCHAR(100) NOT NULL,
      node_type VARCHAR(40) NOT NULL CHECK (node_type IN ('trigger','condition','delay','split','randomizer','send_message','http_request','set_field','wait_for_reply','hand_to_human')),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      position JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (flow_id, node_key)
    );
    CREATE TABLE IF NOT EXISTS crm_flow_edges (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-flow-edge-' || gen_random_uuid()::text),
      flow_id UUID NOT NULL REFERENCES crm_flow_definitions(id) ON DELETE CASCADE,
      from_node_key VARCHAR(100) NOT NULL,
      to_node_key VARCHAR(100) NOT NULL,
      branch_key VARCHAR(80) NOT NULL DEFAULT 'default',
      UNIQUE (flow_id, from_node_key, to_node_key, branch_key)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_flow_edges_flow ON crm_flow_edges(flow_id, from_node_key);
    CREATE TABLE IF NOT EXISTS crm_flow_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-flow-run-' || gen_random_uuid()::text),
      flow_id UUID NOT NULL REFERENCES crm_flow_definitions(id) ON DELETE CASCADE,
      tenant_uid TEXT NOT NULL,
      lead_id BIGINT,
      status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting','completed','failed','paused')),
      current_node_key VARCHAR(100),
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      next_run_at TIMESTAMPTZ,
      error TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_flow_runs_tenant ON crm_flow_runs(tenant_uid, status, next_run_at);
    CREATE TABLE IF NOT EXISTS crm_flow_run_events (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('crm-flow-event-' || gen_random_uuid()::text),
      run_id UUID NOT NULL REFERENCES crm_flow_runs(id) ON DELETE CASCADE,
      node_key VARCHAR(100),
      event_type VARCHAR(40) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_flow_run_events_run ON crm_flow_run_events(run_id, created_at);
  `);
}

export async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS crm_flow_run_events, crm_flow_runs, crm_flow_edges, crm_flow_nodes, crm_flow_definitions CASCADE');
}

if ((process.argv[1] && process.argv[1].endsWith('20261015006300-crm-flow-builder.migration.js')) || (process.argv[2] && process.argv[2].endsWith('20261015006300-crm-flow-builder.migration.js'))) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => { try { await up(client); console.log('crm-flow-builder migration applied'); } finally { client.release(); } }).catch((error) => { console.error(error); process.exitCode = 1; });
}
