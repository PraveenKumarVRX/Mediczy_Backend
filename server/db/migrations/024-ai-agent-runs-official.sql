-- =============================================================================
-- MIGRATION 024: Official ai_agent_runs Schema
-- =============================================================================
-- Replaces the runtime CREATE TABLE IF NOT EXISTS in multi-agent-orchestrator.js
-- Adds: partitioning, proper indexes, routing tables for HAIS self-optimization
-- =============================================================================

-- ── ai_agent_runs (expand-contract safe) ───────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION create_monthly_partition(
  p_table  TEXT,
  p_year   INT,
  p_month  INT
) RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
BEGIN
  start_date     := make_date(p_year, p_month, 1);
  end_date       := start_date + INTERVAL '1 month';
  partition_name := p_table || '_' || to_char(start_date, 'YYYY_MM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name, p_table, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  rel_kind CHAR;
  y INT;
  m INT;
BEGIN
  SELECT c.relkind INTO rel_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'ai_agent_runs';

  IF rel_kind IS NULL THEN
    CREATE TABLE ai_agent_runs (
      id              BIGSERIAL,
      run_id          UUID NOT NULL DEFAULT gen_random_uuid(),
      user_id         INTEGER,
      org_id          INTEGER,
      role            VARCHAR(50),
      input_message   TEXT,
      task_plan       JSONB,
      agents_used     TEXT[],
      final_response  TEXT,
      status          VARCHAR(20) DEFAULT 'pending',
      error_message   TEXT,
      total_tokens    INTEGER DEFAULT 0,
      latency_ms      INTEGER,
      cognitive_tier  VARCHAR(20),
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);

    FOR i IN 0..14 LOOP
      y := EXTRACT(YEAR  FROM CURRENT_DATE + (i || ' months')::INTERVAL)::INT;
      m := EXTRACT(MONTH FROM CURRENT_DATE + (i || ' months')::INTERVAL)::INT;
      PERFORM create_monthly_partition('ai_agent_runs', y, m);
    END LOOP;
  ELSE
    -- Existing production/staging installs may already have a non-partitioned
    -- ai_agent_runs table. Do not replace it during expand-contract rollout.
    ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS run_id UUID DEFAULT gen_random_uuid();
    ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS cognitive_tier VARCHAR(20);
    ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    ALTER TABLE ai_agent_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    UPDATE ai_agent_runs SET run_id = gen_random_uuid() WHERE run_id IS NULL;
    UPDATE ai_agent_runs SET metadata = '{}'::jsonb WHERE metadata IS NULL;
    UPDATE ai_agent_runs SET created_at = NOW() WHERE created_at IS NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_time   ON ai_agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_time    ON ai_agent_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status      ON ai_agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tier        ON ai_agent_runs (cognitive_tier);

-- ── ai_api_keys ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_api_keys (
  id          SERIAL PRIMARY KEY,
  key_hash    VARCHAR(128) UNIQUE NOT NULL,
  user_id     INTEGER,
  org_id      INTEGER,
  role        VARCHAR(50) DEFAULT 'external_api',
  description TEXT,
  extra_caps  TEXT[] DEFAULT '{}',
  is_active   BOOLEAN DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_api_keys_user ON ai_api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_keys_active ON ai_api_keys (is_active) WHERE is_active = TRUE;

-- ── ai_user_agent_grants ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_user_agent_grants (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  extra_capabilities  TEXT[] DEFAULT '{}',
  granted_by          INTEGER,
  reason              TEXT,
  is_active           BOOLEAN DEFAULT true,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_grants_user ON ai_user_agent_grants (user_id) WHERE is_active = TRUE;

-- ── ai_routing_thresholds (HAIS self-optimization) ───────────────────────────

CREATE TABLE IF NOT EXISTS ai_routing_thresholds (
  id              SERIAL PRIMARY KEY,
  org_id          INTEGER,                     -- NULL = global default
  category        VARCHAR(100),
  tier            VARCHAR(20),
  success_rate    DECIMAL(5,4) DEFAULT 0.8,
  sample_count    INTEGER      DEFAULT 0,
  last_updated    TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE ai_routing_thresholds ADD COLUMN IF NOT EXISTS org_id INTEGER;
ALTER TABLE ai_routing_thresholds ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE ai_routing_thresholds ADD COLUMN IF NOT EXISTS tier VARCHAR(20);
ALTER TABLE ai_routing_thresholds ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,4) DEFAULT 0.8;
ALTER TABLE ai_routing_thresholds ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 0;
ALTER TABLE ai_routing_thresholds ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_routing_thresholds_org ON ai_routing_thresholds (org_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS ai_routing_thresholds_org_category_tier_idx
  ON ai_routing_thresholds (org_id, category, tier)
  WHERE category IS NOT NULL AND tier IS NOT NULL;
