-- Hospital CRM growth automation: LeadSquared-style acquisition, nurture, and recovery.
-- Additive only; all channel delivery remains behind existing provider integrations.

CREATE TABLE IF NOT EXISTS crm_lead_score_rules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(180) NOT NULL,
  rule_type VARCHAR(40) NOT NULL DEFAULT 'event',
  event_name VARCHAR(160),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points BETWEEN -100 AND 100),
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_crm_lead_score_rules_active
  ON crm_lead_score_rules (tenant_id, is_active, priority);

CREATE TABLE IF NOT EXISTS crm_lead_score_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT NOT NULL REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  rule_id BIGINT REFERENCES crm_lead_score_rules(id) ON DELETE SET NULL,
  event_name VARCHAR(160) NOT NULL,
  points INTEGER NOT NULL,
  score_before INTEGER NOT NULL DEFAULT 0,
  score_after INTEGER NOT NULL DEFAULT 0,
  source_ref VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_lead_score_events_lead
  ON crm_lead_score_events (tenant_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_journeys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  journey_type VARCHAR(50) NOT NULL DEFAULT 'nurture',
  entry_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  exit_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  goal_stage VARCHAR(60),
  frequency_cap JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_crm_journeys_status ON crm_journeys (tenant_id, status, journey_type);

CREATE TABLE IF NOT EXISTS crm_journey_steps (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  journey_id BIGINT NOT NULL REFERENCES crm_journeys(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_type VARCHAR(40) NOT NULL CHECK (step_type IN ('wait', 'message', 'task', 'condition', 'stage_change', 'score')),
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  channel VARCHAR(30),
  template_id BIGINT,
  title VARCHAR(240),
  content TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, journey_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_crm_journey_steps_order ON crm_journey_steps (tenant_id, journey_id, step_order);

CREATE TABLE IF NOT EXISTS crm_journey_enrollments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  journey_id BIGINT NOT NULL REFERENCES crm_journeys(id) ON DELETE CASCADE,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'exited', 'paused', 'failed')),
  current_step_order INTEGER NOT NULL DEFAULT 1,
  next_run_at TIMESTAMPTZ,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  exit_reason VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, journey_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_journey_enrollments_queue
  ON crm_journey_enrollments (tenant_id, status, next_run_at);

CREATE TABLE IF NOT EXISTS crm_journey_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  enrollment_id BIGINT NOT NULL REFERENCES crm_journey_enrollments(id) ON DELETE CASCADE,
  step_id BIGINT REFERENCES crm_journey_steps(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  provider_ref VARCHAR(240),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_journey_events_queue
  ON crm_journey_events (tenant_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS crm_growth_recovery_cases (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  case_type VARCHAR(40) NOT NULL CHECK (case_type IN ('speed_to_lead', 'abandoned_form', 'no_show', 'dormant', 'uncontacted')),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'recovered', 'dismissed')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  owner_user_id BIGINT,
  source_ref VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_growth_recovery_open
  ON crm_growth_recovery_cases (tenant_id, lead_id, case_type)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_crm_growth_recovery_queue
  ON crm_growth_recovery_cases (tenant_id, status, priority, due_at);

CREATE TABLE IF NOT EXISTS crm_landing_pages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  page_name VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  service_line_id BIGINT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  form_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  tracking_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_crm_landing_pages_status ON crm_landing_pages (tenant_id, status, campaign_id);

CREATE TABLE IF NOT EXISTS crm_landing_page_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  landing_page_id BIGINT NOT NULL REFERENCES crm_landing_pages(id) ON DELETE CASCADE,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  session_id VARCHAR(240),
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('view', 'form_start', 'form_submit', 'form_abandon', 'cta_click')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_crm_landing_page_events_rollup
  ON crm_landing_page_events (tenant_id, landing_page_id, event_type, event_at DESC);

CREATE TABLE IF NOT EXISTS crm_growth_daily_metrics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  metric_date DATE NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, metric_date, dimensions)
);
