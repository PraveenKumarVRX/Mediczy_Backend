-- Hospital CRM world-class domains (DB phases 2-8)
-- Additive only. The first CRM foundation migration remains the compatibility
-- boundary for existing lead and identity workflows.

ALTER TABLE crm_leads_v2 DROP CONSTRAINT IF EXISTS crm_leads_v2_lifecycle_stage_check;
ALTER TABLE crm_leads_v2 ADD CONSTRAINT crm_leads_v2_lifecycle_stage_check CHECK (lifecycle_stage IN ('new', 'attempting_contact', 'contacted', 'qualified', 'appointment_requested', 'appointment_booked', 'appointment_confirmed', 'visited', 'consulted', 'investigation_advised', 'procedure_advised', 'admission_advised', 'billing_completed', 'won', 'lost', 'dormant', 'nurture', 'duplicate'));
ALTER TABLE crm_org_units ADD COLUMN IF NOT EXISTS external_ref VARCHAR(160);
ALTER TABLE crm_org_units ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE crm_org_units ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_crm_org_units_type ON crm_org_units (tenant_id, unit_type, is_active);

ALTER TABLE crm_person_identities ADD COLUMN IF NOT EXISTS primary_patient_id BIGINT;
ALTER TABLE crm_person_identities ADD COLUMN IF NOT EXISTS primary_contact_id BIGINT;
ALTER TABLE crm_person_identities ADD COLUMN IF NOT EXISTS primary_phone_e164 VARCHAR(40);
ALTER TABLE crm_person_identities ADD COLUMN IF NOT EXISTS primary_email VARCHAR(320);
ALTER TABLE crm_person_identities ADD COLUMN IF NOT EXISTS identity_confidence NUMERIC(5, 4);
ALTER TABLE crm_person_identities ADD COLUMN IF NOT EXISTS merge_status VARCHAR(30) NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_crm_person_identity_phone ON crm_person_identities (tenant_id, primary_phone_e164);
CREATE INDEX IF NOT EXISTS idx_crm_person_identity_email ON crm_person_identities (tenant_id, lower(primary_email));
CREATE INDEX IF NOT EXISTS idx_crm_person_identity_metadata ON crm_person_identities USING GIN (metadata);

ALTER TABLE crm_identity_keys ADD COLUMN IF NOT EXISTS identity_id BIGINT;
ALTER TABLE crm_identity_keys ADD COLUMN IF NOT EXISTS source_system VARCHAR(100);
ALTER TABLE crm_identity_keys ADD COLUMN IF NOT EXISTS confidence NUMERIC(5, 4);
ALTER TABLE crm_identity_keys ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE crm_identity_keys SET identity_id = person_id WHERE identity_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_identity_keys_identity ON crm_identity_keys (tenant_id, identity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_identity_keys_active_value
  ON crm_identity_keys (tenant_id, key_type, normalized_value)
  WHERE normalized_value IS NOT NULL;

ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL;
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS legacy_contact_id BIGINT;
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS full_name VARCHAR(240);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(40);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS email VARCHAR(320);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS gender VARCHAR(40);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS area VARCHAR(120);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(80);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS patient_status VARCHAR(40);
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE crm_contacts_v2 ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE crm_contacts_v2 SET identity_id = person_id WHERE identity_id IS NULL;
UPDATE crm_contacts_v2 SET full_name = name WHERE full_name IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_v2_phone ON crm_contacts_v2 (tenant_id, phone_e164);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_v2_email ON crm_contacts_v2 (tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_crm_contacts_v2_tags ON crm_contacts_v2 USING GIN (tags);

ALTER TABLE crm_source_taxonomy ADD COLUMN IF NOT EXISTS source_group VARCHAR(100);
ALTER TABLE crm_source_taxonomy ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE crm_source_taxonomy ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE crm_source_taxonomy ADD COLUMN IF NOT EXISTS is_referral BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE crm_source_taxonomy ADD COLUMN IF NOT EXISTS default_attribution_weight NUMERIC(8, 4) NOT NULL DEFAULT 1;

ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS hospital_id BIGINT;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS service_line_id BIGINT;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS campaign_code VARCHAR(120);
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(80);
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS source VARCHAR(120);
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS medium VARCHAR(120);
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS actual_spend_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'approved';
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS legacy_email_campaign_id BIGINT;
ALTER TABLE crm_campaigns_unified ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaigns_code ON crm_campaigns_unified (tenant_id, campaign_code) WHERE campaign_code IS NOT NULL;

ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS hospital_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS department_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS service_line_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS doctor_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS lead_number VARCHAR(80);
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS lead_type VARCHAR(60) NOT NULL DEFAULT 'opd';
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(40) NOT NULL DEFAULT 'unqualified';
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS treatment_interest VARCHAR(240);
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS symptom_or_need TEXT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS expected_value NUMERIC(14, 2);
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS actual_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS first_touch_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS last_touch_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS assigned_team_id BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS next_action VARCHAR(120);
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS lost_reason_code VARCHAR(100);
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS lost_reason_notes TEXT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS consent_summary JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE crm_leads_v2 ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE crm_leads_v2 SET identity_id = person_id WHERE identity_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_leads_v2_number ON crm_leads_v2 (tenant_id, lead_number) WHERE lead_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_dimensions ON crm_leads_v2 (tenant_id, hospital_id, branch_id, service_line_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_campaign ON crm_leads_v2 (tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_source ON crm_leads_v2 (tenant_id, source_taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_next_action ON crm_leads_v2 (tenant_id, next_action_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_crm_leads_v2_metadata ON crm_leads_v2 USING GIN (metadata);

ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS hospital_id BIGINT;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS service_line_id BIGINT;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS doctor_id BIGINT;
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS source_system VARCHAR(100);
ALTER TABLE crm_funnel_events ADD COLUMN IF NOT EXISTS source_ref VARCHAR(240);
UPDATE crm_funnel_events SET identity_id = person_id WHERE identity_id IS NULL;
UPDATE crm_funnel_events SET event_at = occurred_at WHERE event_at IS NULL;
ALTER TABLE crm_funnel_events ALTER COLUMN event_at SET DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_identity ON crm_funnel_events (tenant_id, identity_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_dimensions ON crm_funnel_events (tenant_id, hospital_id, branch_id, service_line_id, event_at DESC);

ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS assigned_from_user_id BIGINT;
ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS assigned_to_user_id BIGINT;
ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS assigned_team_id BIGINT;
ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS assignment_reason VARCHAR(240);
ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS assignment_rule_id BIGINT;
ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE crm_lead_assignments ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
UPDATE crm_lead_assignments SET assigned_to_user_id = assignee_user_id WHERE assigned_to_user_id IS NULL;
UPDATE crm_lead_assignments SET released_at = unassigned_at WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  rule_name VARCHAR(160) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  assignment_strategy VARCHAR(40) NOT NULL DEFAULT 'round_robin',
  target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  fallback_user_id BIGINT,
  sla_rule_id BIGINT,
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, rule_name)
);

CREATE TABLE IF NOT EXISTS crm_business_hours (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  holidays JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS crm_sla_rules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  applies_to VARCHAR(60) NOT NULL DEFAULT 'lead',
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_response_minutes INTEGER NOT NULL DEFAULT 60 CHECK (first_response_minutes > 0),
  followup_minutes INTEGER CHECK (followup_minutes IS NULL OR followup_minutes > 0),
  resolution_minutes INTEGER CHECK (resolution_minutes IS NULL OR resolution_minutes > 0),
  escalation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  business_hours_id BIGINT REFERENCES crm_business_hours(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_assignment_rules_sla_fk') THEN
    ALTER TABLE crm_assignment_rules ADD CONSTRAINT crm_assignment_rules_sla_fk FOREIGN KEY (sla_rule_id) REFERENCES crm_sla_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_sla_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  activity_id BIGINT,
  sla_rule_id BIGINT REFERENCES crm_sla_rules(id) ON DELETE SET NULL,
  sla_type VARCHAR(40) NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  breach_minutes INTEGER,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  escalated_to_user_id BIGINT,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'met', 'breached', 'cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_sla_events_queue ON crm_sla_events (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_sla_events_lead ON crm_sla_events (tenant_id, lead_id, due_at DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE CASCADE,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  task_type VARCHAR(50) NOT NULL,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  assigned_to_user_id BIGINT,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome VARCHAR(160),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_queue ON crm_tasks (tenant_id, assigned_to_user_id, status, due_at);

CREATE TABLE IF NOT EXISTS crm_conversations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL,
  external_thread_id VARCHAR(240),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_to_user_id BIGINT,
  last_message_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_conversations_external
  ON crm_conversations (tenant_id, channel, external_thread_id)
  WHERE external_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_communication_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES crm_contacts_v2(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES crm_conversations(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  message_type VARCHAR(50) NOT NULL DEFAULT 'message',
  template_id BIGINT,
  subject VARCHAR(240),
  body_preview TEXT,
  provider VARCHAR(80),
  provider_message_id VARCHAR(240),
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  owner_user_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_communication_lead ON crm_communication_events (tenant_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_communication_identity ON crm_communication_events (tenant_id, identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_communication_queue ON crm_communication_events (tenant_id, channel, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_communication_provider ON crm_communication_events (tenant_id, provider, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_consent_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES crm_contacts_v2(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL,
  purpose VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'unknown' CHECK (status IN ('opted_in', 'opted_out', 'unknown', 'revoked', 'expired')),
  source VARCHAR(100),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  proof_ref VARCHAR(240),
  captured_by BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_consent_current ON crm_consent_records (tenant_id, identity_id, channel, purpose) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_consent_channel ON crm_consent_records (tenant_id, channel, status);

CREATE TABLE IF NOT EXISTS crm_frequency_counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT NOT NULL REFERENCES crm_person_identities(id) ON DELETE CASCADE,
  channel VARCHAR(30) NOT NULL,
  purpose VARCHAR(80) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, identity_id, channel, purpose, window_start, window_end)
);

CREATE TABLE IF NOT EXISTS crm_appointment_links (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  appointment_id BIGINT,
  patient_id BIGINT,
  doctor_id BIGINT,
  hospital_id BIGINT,
  branch_id BIGINT,
  department_id BIGINT,
  service_line_id BIGINT,
  appointment_status VARCHAR(40) NOT NULL DEFAULT 'booked',
  scheduled_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  consulted_at TIMESTAMPTZ,
  source_system VARCHAR(100),
  source_ref VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_appointment_link_source ON crm_appointment_links (tenant_id, source_system, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_appointment_link_lead ON crm_appointment_links (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_appointment_link_status ON crm_appointment_links (tenant_id, appointment_status, scheduled_at);

CREATE TABLE IF NOT EXISTS crm_visit_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  appointment_link_id BIGINT REFERENCES crm_appointment_links(id) ON DELETE SET NULL,
  patient_id BIGINT,
  visit_id BIGINT,
  event_type VARCHAR(60) NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  doctor_id BIGINT,
  hospital_id BIGINT,
  branch_id BIGINT,
  department_id BIGINT,
  service_line_id BIGINT,
  clinical_unit VARCHAR(120),
  source_system VARCHAR(100),
  source_ref VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_visit_lead_time ON crm_visit_events (tenant_id, lead_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_visit_identity_time ON crm_visit_events (tenant_id, identity_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_visit_type_time ON crm_visit_events (tenant_id, event_type, event_at DESC);

CREATE TABLE IF NOT EXISTS crm_revenue_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  appointment_link_id BIGINT REFERENCES crm_appointment_links(id) ON DELETE SET NULL,
  visit_event_id BIGINT REFERENCES crm_visit_events(id) ON DELETE SET NULL,
  patient_id BIGINT,
  billing_id BIGINT,
  invoice_number VARCHAR(120),
  revenue_event_type VARCHAR(60) NOT NULL DEFAULT 'billing_completed',
  revenue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gross_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  outstanding_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  contribution_amount NUMERIC(14, 2),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  payer_type VARCHAR(50),
  insurance_tpa_id BIGINT,
  doctor_id BIGINT,
  hospital_id BIGINT,
  branch_id BIGINT,
  department_id BIGINT,
  service_line_id BIGINT,
  procedure_code VARCHAR(100),
  package_code VARCHAR(100),
  source_system VARCHAR(100),
  source_ref VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_revenue_source ON crm_revenue_events (tenant_id, source_system, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_revenue_date ON crm_revenue_events (tenant_id, revenue_date);
CREATE INDEX IF NOT EXISTS idx_crm_revenue_lead ON crm_revenue_events (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_revenue_doctor ON crm_revenue_events (tenant_id, doctor_id, revenue_date);
CREATE INDEX IF NOT EXISTS idx_crm_revenue_service ON crm_revenue_events (tenant_id, service_line_id, revenue_date);

CREATE TABLE IF NOT EXISTS crm_touchpoints (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES crm_contacts_v2(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  source_id BIGINT REFERENCES crm_source_taxonomy(id) ON DELETE SET NULL,
  touchpoint_type VARCHAR(60) NOT NULL,
  channel VARCHAR(60),
  source VARCHAR(120),
  medium VARCHAR(120),
  event_name VARCHAR(160),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id VARCHAR(240),
  gclid VARCHAR(240),
  fbclid VARCHAR(240),
  utm_source VARCHAR(120),
  utm_medium VARCHAR(120),
  utm_campaign VARCHAR(200),
  utm_term VARCHAR(200),
  utm_content VARCHAR(200),
  landing_page_url TEXT,
  referrer_url TEXT,
  external_event_id VARCHAR(240),
  cost_amount NUMERIC(14, 2),
  revenue_amount NUMERIC(14, 2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_touchpoint_external ON crm_touchpoints (tenant_id, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_touchpoint_identity ON crm_touchpoints (tenant_id, identity_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_touchpoint_lead ON crm_touchpoints (tenant_id, lead_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_touchpoint_campaign ON crm_touchpoints (tenant_id, campaign_id, event_at DESC);

CREATE TABLE IF NOT EXISTS crm_calculation_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  run_type VARCHAR(60) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS crm_attribution_results (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  conversion_event_id BIGINT,
  revenue_event_id BIGINT REFERENCES crm_revenue_events(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  source_id BIGINT REFERENCES crm_source_taxonomy(id) ON DELETE SET NULL,
  model VARCHAR(40) NOT NULL,
  attribution_window_days INTEGER NOT NULL DEFAULT 90,
  attributed_weight NUMERIC(8, 6) NOT NULL DEFAULT 0,
  attributed_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0,
  attributed_conversion_count NUMERIC(14, 4) NOT NULL DEFAULT 0,
  calculation_run_id BIGINT REFERENCES crm_calculation_runs(id) ON DELETE SET NULL,
  input_touchpoint_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_attribution_campaign ON crm_attribution_results (tenant_id, campaign_id, model);
CREATE INDEX IF NOT EXISTS idx_crm_attribution_source ON crm_attribution_results (tenant_id, source_id, model);
CREATE INDEX IF NOT EXISTS idx_crm_attribution_revenue ON crm_attribution_results (tenant_id, revenue_event_id);

CREATE TABLE IF NOT EXISTS crm_marketing_budgets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  period_type VARCHAR(30) NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hospital_id BIGINT,
  branch_id BIGINT,
  service_line_id BIGINT,
  channel VARCHAR(60),
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(14, 2),
  owner_user_id BIGINT,
  approval_status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by BIGINT,
  updated_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_marketing_budgets_period ON crm_marketing_budgets (tenant_id, period_start, period_end, approval_status);

CREATE TABLE IF NOT EXISTS crm_vendors (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  vendor_name VARCHAR(240) NOT NULL,
  vendor_type VARCHAR(80),
  contact_name VARCHAR(160),
  email VARCHAR(320),
  phone VARCHAR(40),
  gstin VARCHAR(40),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_name)
);

CREATE TABLE IF NOT EXISTS crm_campaign_costs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  source_id BIGINT REFERENCES crm_source_taxonomy(id) ON DELETE SET NULL,
  cost_type VARCHAR(50) NOT NULL,
  vendor_id BIGINT REFERENCES crm_vendors(id) ON DELETE SET NULL,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  invoice_ref VARCHAR(160),
  external_spend_id VARCHAR(240),
  is_imported BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaign_cost_external ON crm_campaign_costs (tenant_id, external_spend_id) WHERE external_spend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_campaign_cost_date ON crm_campaign_costs (tenant_id, cost_date, campaign_id);

CREATE TABLE IF NOT EXISTS crm_employee_profiles (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  employee_code VARCHAR(80),
  designation VARCHAR(160),
  department_id BIGINT,
  team_id BIGINT,
  manager_user_id BIGINT,
  hospital_id BIGINT,
  branch_id BIGINT,
  joining_date DATE,
  employment_status VARCHAR(40) NOT NULL DEFAULT 'active',
  cost_centre VARCHAR(120),
  salary_cost NUMERIC(14, 2),
  incentive_plan_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS crm_kpi_definitions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  role_code VARCHAR(80),
  kpi_code VARCHAR(100) NOT NULL,
  kpi_name VARCHAR(160) NOT NULL,
  kpi_type VARCHAR(40) NOT NULL DEFAULT 'count',
  calculation_sql_key VARCHAR(120) NOT NULL,
  unit VARCHAR(40),
  direction VARCHAR(20) NOT NULL DEFAULT 'higher_is_better',
  weight NUMERIC(8, 4) NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, kpi_code)
);

CREATE TABLE IF NOT EXISTS crm_employee_targets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  employee_profile_id BIGINT NOT NULL REFERENCES crm_employee_profiles(id) ON DELETE CASCADE,
  kpi_definition_id BIGINT NOT NULL REFERENCES crm_kpi_definitions(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
  minimum_value NUMERIC(14, 4),
  stretch_value NUMERIC(14, 4),
  weight NUMERIC(8, 4),
  created_by BIGINT,
  approved_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_profile_id, kpi_definition_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS crm_kpi_actuals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  employee_profile_id BIGINT NOT NULL REFERENCES crm_employee_profiles(id) ON DELETE CASCADE,
  kpi_definition_id BIGINT NOT NULL REFERENCES crm_kpi_definitions(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  actual_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
  target_value NUMERIC(14, 4) NOT NULL DEFAULT 0,
  achievement_pct NUMERIC(10, 4) NOT NULL DEFAULT 0,
  score NUMERIC(10, 4) NOT NULL DEFAULT 0,
  calculation_run_id BIGINT REFERENCES crm_calculation_runs(id) ON DELETE SET NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, employee_profile_id, kpi_definition_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS crm_incentive_rules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculation JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS crm_incentive_payouts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  employee_profile_id BIGINT NOT NULL REFERENCES crm_employee_profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_incentive NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_incentive NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  approved_by BIGINT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_feedback_surveys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  survey_type VARCHAR(40) NOT NULL DEFAULT 'nps',
  trigger_event VARCHAR(80),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS crm_feedback_responses (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  appointment_link_id BIGINT REFERENCES crm_appointment_links(id) ON DELETE SET NULL,
  visit_event_id BIGINT REFERENCES crm_visit_events(id) ON DELETE SET NULL,
  survey_id BIGINT REFERENCES crm_feedback_surveys(id) ON DELETE SET NULL,
  score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  nps_category VARCHAR(30),
  comments TEXT,
  response_channel VARCHAR(40),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  doctor_id BIGINT,
  hospital_id BIGINT,
  branch_id BIGINT,
  service_line_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_feedback_time ON crm_feedback_responses (tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_feedback_score ON crm_feedback_responses (tenant_id, score, service_line_id);

CREATE TABLE IF NOT EXISTS crm_reviews (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  platform VARCHAR(60) NOT NULL,
  external_review_id VARCHAR(240),
  reviewer_name VARCHAR(240),
  rating NUMERIC(3, 1) CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  review_text TEXT,
  sentiment VARCHAR(30),
  severity VARCHAR(30) NOT NULL DEFAULT 'normal',
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  doctor_id BIGINT,
  hospital_id BIGINT,
  branch_id BIGINT,
  service_line_id BIGINT,
  review_url TEXT,
  reviewed_at TIMESTAMPTZ,
  response_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_reviews_external ON crm_reviews (tenant_id, platform, external_review_id) WHERE external_review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_reviews_queue ON crm_reviews (tenant_id, response_status, severity, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS crm_reputation_tasks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  review_id BIGINT REFERENCES crm_reviews(id) ON DELETE CASCADE,
  feedback_response_id BIGINT REFERENCES crm_feedback_responses(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  assigned_to_user_id BIGINT,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_reputation_tasks_queue ON crm_reputation_tasks (tenant_id, status, priority, due_at);

CREATE TABLE IF NOT EXISTS crm_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  event_type VARCHAR(80) NOT NULL,
  actor_user_id BIGINT,
  actor_role VARCHAR(80),
  ip_address VARCHAR(80),
  user_agent TEXT,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON crm_audit_log (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_actor ON crm_audit_log (tenant_id, actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_data_quality_issues (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  issue_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  field_name VARCHAR(120),
  current_value TEXT,
  recommended_value TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_crm_data_quality_queue ON crm_data_quality_issues (tenant_id, status, severity, detected_at DESC);

CREATE TABLE IF NOT EXISTS crm_integration_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  integration_name VARCHAR(100) NOT NULL,
  run_type VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  last_cursor VARCHAR(500),
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_crm_integration_runs_status ON crm_integration_runs (tenant_id, integration_name, status, started_at DESC);

CREATE TABLE IF NOT EXISTS crm_integration_errors (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  integration_run_id BIGINT REFERENCES crm_integration_runs(id) ON DELETE CASCADE,
  integration_name VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80),
  external_ref VARCHAR(240),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code VARCHAR(80),
  error_message TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_integration_errors_queue ON crm_integration_errors (tenant_id, status, next_retry_at);

CREATE TABLE IF NOT EXISTS crm_content_assets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(200) NOT NULL,
  asset_type VARCHAR(60) NOT NULL,
  channel VARCHAR(60),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by BIGINT,
  approved_by BIGINT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_approval_workflows (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_by BIGINT,
  approved_by BIGINT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_approval_queue ON crm_approval_workflows (tenant_id, status, entity_type, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_offline_campaigns (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  event_name VARCHAR(200) NOT NULL,
  event_date DATE,
  location VARCHAR(240),
  qr_code VARCHAR(160),
  short_url VARCHAR(240),
  registrations_count INTEGER NOT NULL DEFAULT 0,
  visits_count INTEGER NOT NULL DEFAULT 0,
  revenue_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_service_line_targets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  service_line_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  lead_target NUMERIC(14, 2),
  appointment_target NUMERIC(14, 2),
  visit_target NUMERIC(14, 2),
  revenue_target NUMERIC(14, 2),
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, service_line_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS crm_daily_funnel_mart (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  metric_date DATE NOT NULL,
  grain_key VARCHAR(300) NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, metric_date, grain_key)
);

CREATE TABLE IF NOT EXISTS crm_campaign_performance_mart (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  campaign_id BIGINT,
  source_id BIGINT,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_start, period_end, campaign_id, source_id)
);

CREATE TABLE IF NOT EXISTS crm_employee_performance_mart (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  employee_profile_id BIGINT,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_start, period_end, employee_profile_id)
);

CREATE TABLE IF NOT EXISTS crm_doctor_service_line_mart (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  doctor_id BIGINT,
  service_line_id BIGINT,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_start, period_end, doctor_id, service_line_id)
);

CREATE TABLE IF NOT EXISTS crm_reputation_mart (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  grain_key VARCHAR(240) NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, period_start, period_end, grain_key)
);
