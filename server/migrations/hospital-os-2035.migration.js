/**
 * Hospital OS 2035 — database tables for event bus, approvals, knowledge graph, simulations.
 * Run: node server/migrations/hospital-os-2035.migration.js
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_os_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      event_type VARCHAR(80) NOT NULL,
      source VARCHAR(80),
      entity_type VARCHAR(40),
      entity_id VARCHAR(64),
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hospital_os_events_type ON hospital_os_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hospital_os_events_entity ON hospital_os_events(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS hospital_os_approvals (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      approval_type VARCHAR(60) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      patient_id INTEGER,
      requested_by INTEGER,
      assigned_role VARCHAR(40) DEFAULT 'doctor',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      risk_tier VARCHAR(10) NOT NULL DEFAULT 'T1',
      source VARCHAR(60),
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      executed_at TIMESTAMPTZ,
      execution_result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hospital_os_approvals_status ON hospital_os_approvals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hospital_os_approvals_patient ON hospital_os_approvals(patient_id);

    CREATE TABLE IF NOT EXISTS hospital_os_kg_nodes (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      node_type VARCHAR(40) NOT NULL,
      external_id VARCHAR(128) NOT NULL,
      label TEXT,
      attributes JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, node_type, external_id)
    );

    CREATE TABLE IF NOT EXISTS hospital_os_kg_edges (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      from_node_id BIGINT NOT NULL REFERENCES hospital_os_kg_nodes(id) ON DELETE CASCADE,
      to_node_id BIGINT NOT NULL REFERENCES hospital_os_kg_nodes(id) ON DELETE CASCADE,
      relation VARCHAR(60) NOT NULL,
      weight NUMERIC(6,3) DEFAULT 1.0,
      evidence JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, from_node_id, to_node_id, relation)
    );
    CREATE INDEX IF NOT EXISTS idx_hospital_os_kg_edges_from ON hospital_os_kg_edges(from_node_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_os_kg_edges_to ON hospital_os_kg_edges(to_node_id);

    CREATE TABLE IF NOT EXISTS hospital_os_simulations (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      simulation_type VARCHAR(40) NOT NULL,
      scenario_key VARCHAR(80) NOT NULL,
      input_params JSONB DEFAULT '{}'::jsonb,
      results JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hospital_os_journey_plans (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      patient_id INTEGER NOT NULL,
      plan JSONB NOT NULL DEFAULT '[]'::jsonb,
      optimized_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hospital_os_voice_drafts (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      user_id INTEGER,
      utterance TEXT,
      intent VARCHAR(80),
      draft_payload JSONB DEFAULT '{}'::jsonb,
      approval_id BIGINT REFERENCES hospital_os_approvals(id),
      status VARCHAR(30) DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✓ Hospital OS 2035 tables ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS hospital_os_voice_drafts;
    DROP TABLE IF EXISTS hospital_os_journey_plans;
    DROP TABLE IF EXISTS hospital_os_simulations;
    DROP TABLE IF EXISTS hospital_os_kg_edges;
    DROP TABLE IF EXISTS hospital_os_kg_nodes;
    DROP TABLE IF EXISTS hospital_os_approvals;
    DROP TABLE IF EXISTS hospital_os_events;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
