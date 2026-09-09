-- Specialty-centric hospital CRM, diagnostic-chain growth, and digital channel intelligence.
-- Additive data contracts. Provider APIs write metrics through the integration layer.

CREATE TABLE IF NOT EXISTS crm_specialty_profiles (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(80) NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'hospital',
  funnel_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_crm_specialty_profiles_active ON crm_specialty_profiles (tenant_id, is_active, display_name);

CREATE TABLE IF NOT EXISTS crm_diagnostic_centres (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(100) NOT NULL,
  centre_name VARCHAR(200) NOT NULL,
  city VARCHAR(120),
  region VARCHAR(120),
  pincode VARCHAR(20),
  address TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  capacity_per_day INTEGER,
  home_collection_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_crm_diagnostic_centres_location ON crm_diagnostic_centres (tenant_id, city, region, status);

CREATE TABLE IF NOT EXISTS crm_diagnostic_products (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  product_type VARCHAR(30) NOT NULL CHECK (product_type IN ('test', 'package')),
  code VARCHAR(120) NOT NULL,
  product_name VARCHAR(240) NOT NULL,
  category VARCHAR(120),
  original_price NUMERIC(14, 2),
  selling_price NUMERIC(14, 2),
  expected_margin_percent NUMERIC(8, 3),
  home_collection_available BOOLEAN NOT NULL DEFAULT FALSE,
  included_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_crm_diagnostic_products_type ON crm_diagnostic_products (tenant_id, product_type, category, status);

CREATE TABLE IF NOT EXISTS crm_diagnostic_bookings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  identity_id BIGINT REFERENCES crm_person_identities(id) ON DELETE SET NULL,
  centre_id BIGINT REFERENCES crm_diagnostic_centres(id) ON DELETE SET NULL,
  product_id BIGINT REFERENCES crm_diagnostic_products(id) ON DELETE SET NULL,
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  source_id BIGINT REFERENCES crm_source_taxonomy(id) ON DELETE SET NULL,
  booking_status VARCHAR(40) NOT NULL DEFAULT 'new' CHECK (booking_status IN ('new', 'confirmed', 'assigned', 'on_the_way', 'sample_collected', 'completed', 'cancelled', 'rescheduled')),
  collection_mode VARCHAR(30) NOT NULL DEFAULT 'centre' CHECK (collection_mode IN ('centre', 'home_collection')),
  scheduled_at TIMESTAMPTZ,
  sample_collected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  booking_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  revenue_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_system VARCHAR(100),
  source_ref VARCHAR(240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_diagnostic_bookings_source ON crm_diagnostic_bookings (tenant_id, source_system, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_diagnostic_bookings_funnel ON crm_diagnostic_bookings (tenant_id, booking_status, collection_mode, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_crm_diagnostic_bookings_dimensions ON crm_diagnostic_bookings (tenant_id, centre_id, product_id, campaign_id);

CREATE TABLE IF NOT EXISTS crm_diagnostic_booking_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL REFERENCES crm_diagnostic_bookings(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_crm_diagnostic_booking_events ON crm_diagnostic_booking_events (tenant_id, booking_id, event_at DESC);

CREATE TABLE IF NOT EXISTS crm_provider_referrals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  referral_type VARCHAR(40) NOT NULL CHECK (referral_type IN ('doctor', 'corporate', 'insurance', 'tpa', 'patient', 'partner')),
  provider_name VARCHAR(240) NOT NULL,
  provider_ref VARCHAR(160),
  lead_id BIGINT REFERENCES crm_leads_v2(id) ON DELETE SET NULL,
  booking_id BIGINT REFERENCES crm_diagnostic_bookings(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  referred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  revenue_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_provider_referrals_performance ON crm_provider_referrals (tenant_id, referral_type, provider_name, status);

CREATE TABLE IF NOT EXISTS crm_content_calendar (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  specialty_code VARCHAR(80),
  campaign_id BIGINT REFERENCES crm_campaigns_unified(id) ON DELETE SET NULL,
  channel VARCHAR(50) NOT NULL,
  content_type VARCHAR(60) NOT NULL,
  title VARCHAR(240) NOT NULL,
  workflow_status VARCHAR(40) NOT NULL DEFAULT 'idea' CHECK (workflow_status IN ('idea', 'draft', 'medical_review', 'marketing_review', 'approved', 'scheduled', 'published')),
  scheduled_at TIMESTAMPTZ,
  owner_user_id BIGINT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_content_calendar_queue ON crm_content_calendar (tenant_id, workflow_status, scheduled_at);

CREATE TABLE IF NOT EXISTS crm_marketing_integrations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  provider VARCHAR(80) NOT NULL,
  integration_type VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'not_configured',
  account_ref VARCHAR(240),
  credentials_ref VARCHAR(240),
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(30),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider, integration_type)
);
CREATE INDEX IF NOT EXISTS idx_crm_marketing_integrations_status ON crm_marketing_integrations (tenant_id, status, last_sync_at);

CREATE TABLE IF NOT EXISTS crm_channel_metrics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  provider VARCHAR(80) NOT NULL,
  metric_date DATE NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_ref VARCHAR(240),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider, metric_date, external_ref)
);
CREATE INDEX IF NOT EXISTS idx_crm_channel_metrics_rollup ON crm_channel_metrics (tenant_id, provider, metric_date DESC);

CREATE TABLE IF NOT EXISTS crm_ai_growth_recommendations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  scope_type VARCHAR(50) NOT NULL,
  scope_ref VARCHAR(160),
  title VARCHAR(240) NOT NULL,
  recommendation TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_impact_amount NUMERIC(14, 2),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'applied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_ai_growth_recommendations_queue ON crm_ai_growth_recommendations (tenant_id, status, created_at DESC);
