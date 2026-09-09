-- Hospital CRM foundation (additive migration)
--
-- This migration deliberately uses new v2 tables. Existing crm_* tables are
-- retained for compatibility while tenant attribution and identity quality are
-- established. Run the explicit backfill job only after choosing a tenant map.

CREATE TABLE IF NOT EXISTS crm_org_units (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  parent_id BIGINT REFERENCES crm_org_units(id) ON DELETE SET NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  unit_type VARCHAR(60) NOT NULL DEFAULT 'hospital',
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_crm_org_units_tenant_status
  ON crm_org_units (tenant_id, status);

CREATE TABLE IF NOT EXISTS crm_person_identities (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  person_type VARCHAR(30) NOT NULL DEFAULT 'patient'
    CHECK (person_type IN ('patient', 'attendant', 'referrer', 'corporate_contact', 'other')),
  external_patient_id VARCHAR(120),
  legacy_patient_id BIGINT,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  display_name VARCHAR(240),
  date_of_birth DATE,
  gender VARCHAR(40),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'merged', 'inactive')),
  merged_into_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_person_identities_tenant
  ON crm_person_identities (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_person_identities_legacy
  ON crm_person_identities (tenant_id, legacy_patient_id)
  WHERE legacy_patient_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_identity_keys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL REFERENCES crm_person_identities(id) ON DELETE CASCADE,
  key_type VARCHAR(30) NOT NULL CHECK (key_type IN ('email', 'phone', 'external', 'mrn')),
  normalized_value VARCHAR(320) NOT NULL,
  raw_value VARCHAR(320),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  source VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_crm_identity_keys_person
  ON crm_identity_keys (tenant_id, person_id);

CREATE TABLE IF NOT EXISTS crm_contacts_v2 (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  person_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  org_unit_id BIGINT REFERENCES crm_org_units(id) ON DELETE SET NULL,
  contact_type VARCHAR(40) NOT NULL DEFAULT 'patient',
  name VARCHAR(240) NOT NULL,
  designation VARCHAR(160),
  company VARCHAR(240),
  preferred_channel VARCHAR(30),
  consent_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
    CHECK (consent_status IN ('unknown', 'granted', 'denied', 'withdrawn')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_v2_tenant_person
  ON crm_contacts_v2 (tenant_id, person_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_v2_tenant_name
  ON crm_contacts_v2 (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS crm_source_taxonomy (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  channel VARCHAR(60) NOT NULL,
  source VARCHAR(120) NOT NULL,
  medium VARCHAR(120),
  campaign VARCHAR(200),
  term VARCHAR(200),
  content VARCHAR(200),
  display_name VARCHAR(240) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_source_taxonomy_lookup
  ON crm_source_taxonomy (tenant_id, channel, source, active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_source_taxonomy_identity
  ON crm_source_taxonomy (tenant_id, channel, source, COALESCE(medium, ''), COALESCE(campaign, ''));

CREATE TABLE IF NOT EXISTS crm_campaigns_unified (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  channel VARCHAR(60) NOT NULL,
  platform VARCHAR(80),
  account_key VARCHAR(160),
  external_campaign_id VARCHAR(240),
  name VARCHAR(240) NOT NULL,
  objective VARCHAR(100),
  lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  utm_source VARCHAR(120),
  utm_medium VARCHAR(120),
  utm_campaign VARCHAR(200),
  utm_term VARCHAR(200),
  utm_content VARCHAR(200),
  budget_amount NUMERIC(14, 2),
  budget_currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, platform, external_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_unified_tenant_status
  ON crm_campaigns_unified (tenant_id, lifecycle_status, starts_at DESC);

CREATE TABLE IF NOT EXISTS crm_leads_v2 (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  person_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES crm_contacts_v2(id) ON DELETE SET NULL,
  org_unit_id BIGINT REFERENCES crm_org_units(id) ON DELETE SET NULL,
  legacy_lead_id BIGINT,
  lifecycle_stage VARCHAR(40) NOT NULL DEFAULT 'new'
    CHECK (lifecycle_stage IN ('new', 'contacted', 'qualified', 'appointment_booked', 'visited', 'proposal', 'won', 'lost', 'nurture')),
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paused', 'converted', 'closed', 'merged')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  source_taxonomy_id BIGINT REFERENCES crm_source_taxonomy(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  source_detail VARCHAR(240),
  service_line VARCHAR(160),
  inquiry_type VARCHAR(120),
  owner_user_id BIGINT,
  assigned_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  merged_into_lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  consent_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
    CHECK (consent_status IN ('unknown', 'granted', 'denied', 'withdrawn')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_tenant_stage
  ON crm_leads_v2 (tenant_id, lifecycle_stage, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_tenant_owner
  ON crm_leads_v2 (tenant_id, owner_user_id, status, next_action_at);
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_person
  ON crm_leads_v2 (tenant_id, person_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_leads_v2_legacy
  ON crm_leads_v2 (tenant_id, legacy_lead_id)
  WHERE legacy_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_lead_assignments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT NOT NULL REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  assignee_user_id BIGINT NOT NULL,
  assignment_type VARCHAR(30) NOT NULL DEFAULT 'owner'
    CHECK (assignment_type IN ('owner', 'backup', 'queue')),
  assigned_by BIGINT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_lead_assignments_active
  ON crm_lead_assignments (tenant_id, lead_id, assignment_type)
  WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_lead_assignments_assignee
  ON crm_lead_assignments (tenant_id, assignee_user_id, unassigned_at);

CREATE TABLE IF NOT EXISTS crm_sla_policies (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  service_line VARCHAR(160),
  priority VARCHAR(20),
  first_response_minutes INTEGER NOT NULL CHECK (first_response_minutes > 0),
  next_action_minutes INTEGER CHECK (next_action_minutes IS NULL OR next_action_minutes > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS crm_lead_sla_instances (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT NOT NULL REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  policy_id BIGINT REFERENCES crm_sla_policies(id) ON DELETE SET NULL,
  first_response_due_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  next_action_due_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'met', 'breached', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_sla_due
  ON crm_lead_sla_instances (tenant_id, status, first_response_due_at, next_action_due_at);

CREATE TABLE IF NOT EXISTS crm_funnel_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  person_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  from_stage VARCHAR(40),
  to_stage VARCHAR(40),
  channel VARCHAR(60),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id BIGINT,
  idempotency_key VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_lead_time
  ON crm_funnel_events (tenant_id, lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_stage_time
  ON crm_funnel_events (tenant_id, event_type, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_funnel_events_idempotency
  ON crm_funnel_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_lead_merge_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  source_lead_id BIGINT NOT NULL,
  target_lead_id BIGINT NOT NULL,
  reason TEXT,
  merged_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_lead_id <> target_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_merge_audit_tenant_time
  ON crm_lead_merge_audit (tenant_id, created_at DESC);
