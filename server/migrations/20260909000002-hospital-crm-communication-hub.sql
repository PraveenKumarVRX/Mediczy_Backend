-- Hospital CRM communication hub (tenant-scoped monitoring and templates)

CREATE TABLE IF NOT EXISTS crm_communication_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(200) NOT NULL,
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push', 'in_app')),
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  subject VARCHAR(240),
  body TEXT NOT NULL DEFAULT '',
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by BIGINT,
  approved_by BIGINT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name, channel, version)
);
CREATE INDEX IF NOT EXISTS idx_crm_communication_templates_queue
  ON crm_communication_templates (tenant_id, channel, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_communication_hub_alerts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  alert_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(240) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_type VARCHAR(80),
  source_id BIGINT,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by BIGINT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by BIGINT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_communication_hub_alerts_queue
  ON crm_communication_hub_alerts (tenant_id, status, severity, last_seen_at DESC);

ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS audience_ref VARCHAR(240);
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS template_ref VARCHAR(240);
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE crm_marketing_integrations ADD COLUMN IF NOT EXISTS health_score INTEGER;
ALTER TABLE crm_marketing_integrations ADD COLUMN IF NOT EXISTS health_message TEXT;
ALTER TABLE crm_marketing_integrations ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;
