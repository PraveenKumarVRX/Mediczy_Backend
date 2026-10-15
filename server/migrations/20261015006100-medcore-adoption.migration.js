/**
 * Mediqzy-native adoption tables for the MedCore comparison backlog.
 *
 * Clean-room implementation: these tables model capabilities described in the
 * public comparison document; no MedCore schema, fixtures or prompts are used.
 */
import pg from 'pg';

const { Client } = pg;

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_gold_eval_fixtures (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('medcore-eval-' || gen_random_uuid()::text),
      fixture_key TEXT NOT NULL UNIQUE,
      workstream TEXT NOT NULL,
      input JSONB NOT NULL DEFAULT '{}'::jsonb,
      expected JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_gold_eval_runs (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('medcore-eval-run-' || gen_random_uuid()::text),
      suite_version TEXT NOT NULL,
      passed BOOLEAN NOT NULL,
      score NUMERIC(6,4) NOT NULL,
      results JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS metric_integrity_results (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('metric-result-' || gen_random_uuid()::text),
      metric_key TEXT NOT NULL,
      scope JSONB NOT NULL DEFAULT '{}'::jsonb,
      value NUMERIC,
      available BOOLEAN NOT NULL,
      reason TEXT,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS drug_safety_signoffs (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('drug-signoff-' || gen_random_uuid()::text),
      patient_id INTEGER,
      actor_id INTEGER,
      medications JSONB NOT NULL DEFAULT '[]'::jsonb,
      interactions JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL CHECK (status IN ('allowed', 'blocked', 'acknowledged')),
      acknowledgement_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS agent_handoffs (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('agent-handoff-' || gen_random_uuid()::text),
      patient_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'completed', 'cancelled')),
      transcript TEXT NOT NULL DEFAULT '',
      soap JSONB NOT NULL DEFAULT '{}'::jsonb,
      doctor_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
      red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER,
      claimed_by INTEGER,
      handoff_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lab_explainer_drafts (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('lab-explainer-' || gen_random_uuid()::text),
      patient_id INTEGER,
      report_id TEXT,
      draft TEXT NOT NULL,
      source JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewer_id INTEGER,
      review_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS adherence_plans (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('adherence-plan-' || gen_random_uuid()::text),
      patient_id INTEGER NOT NULL,
      medication JSONB NOT NULL DEFAULT '{}'::jsonb,
      language TEXT NOT NULL DEFAULT 'en',
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
      quiet_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS adherence_events (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('adherence-event-' || gen_random_uuid()::text),
      plan_id BIGINT NOT NULL REFERENCES adherence_plans(id) ON DELETE CASCADE,
      due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'skipped', 'failed')),
      sent_at TIMESTAMPTZ,
      provider_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pharmacy_demand_forecasts (
      id BIGSERIAL PRIMARY KEY,
      entity_uid TEXT NOT NULL UNIQUE DEFAULT ('pharmacy-forecast-' || gen_random_uuid()::text),
      item_id TEXT NOT NULL,
      horizon_days INTEGER NOT NULL,
      input_window JSONB NOT NULL DEFAULT '[]'::jsonb,
      forecast JSONB NOT NULL DEFAULT '[]'::jsonb,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      unavailable BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_gold_eval_runs_created ON ai_gold_eval_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_handoffs_status ON agent_handoffs(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lab_explainer_status ON lab_explainer_drafts(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_adherence_due ON adherence_events(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_pharmacy_forecasts_item ON pharmacy_demand_forecasts(item_id, created_at DESC);
  `);
}

export async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS adherence_events, adherence_plans, lab_explainer_drafts,
      agent_handoffs, drug_safety_signoffs, metric_integrity_results,
      ai_gold_eval_runs, ai_gold_eval_fixtures, pharmacy_demand_forecasts CASCADE;
  `);
}

if (process.argv[1] && process.argv[1].endsWith('20261015006100-medcore-adoption.migration.js')) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect()
    .then(() => up(client))
    .then(() => console.log('medcore-adoption migration applied'))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => client.end());
}
