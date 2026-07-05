/**
 * Mediqzy HealthOS — Phases 2–4 tables (Expand, Network, Platform)
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    -- ═══ STAGE 2: EXPAND ═══════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS healthos_lab_results (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      fhir_resource_id VARCHAR(120),
      test_name VARCHAR(255) NOT NULL,
      result_value TEXT,
      result_unit VARCHAR(40),
      reference_range VARCHAR(80),
      severity VARCHAR(20) DEFAULT 'normal',
      synced_to_timeline BOOLEAN DEFAULT false,
      reported_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_healthos_labs_patient ON healthos_lab_results(patient_id, reported_at DESC);

    CREATE TABLE IF NOT EXISTS healthos_pharmacy_orders (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      prescription_id VARCHAR(80),
      drug_name VARCHAR(255) NOT NULL,
      dose VARCHAR(80),
      pharmacy_name VARCHAR(255),
      status VARCHAR(30) DEFAULT 'pending',
      fulfillment_notes TEXT,
      ordered_at TIMESTAMPTZ DEFAULT NOW(),
      fulfilled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_homecare_visits (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      caregiver_id BIGINT,
      caregiver_name VARCHAR(120),
      visit_date TIMESTAMPTZ NOT NULL,
      visit_type VARCHAR(60) DEFAULT 'routine',
      tasks JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(30) DEFAULT 'scheduled',
      notes TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_wearable_readings (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      source VARCHAR(60) DEFAULT 'apple_health',
      metric_type VARCHAR(60) NOT NULL,
      value NUMERIC(12,3),
      unit VARCHAR(20),
      recorded_at TIMESTAMPTZ NOT NULL,
      synced_to_timeline BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_healthos_wearables_patient ON healthos_wearable_readings(patient_id, recorded_at DESC);

    -- ═══ STAGE 3: NETWORK ══════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS healthos_referrals (
      id BIGSERIAL PRIMARY KEY,
      from_org_id BIGINT NOT NULL,
      to_org_id BIGINT NOT NULL,
      patient_id BIGINT NOT NULL,
      passport_share_id BIGINT,
      reason TEXT NOT NULL,
      urgency VARCHAR(20) DEFAULT 'routine',
      clinical_summary TEXT,
      status VARCHAR(30) DEFAULT 'pending',
      referred_by BIGINT,
      accepted_by BIGINT,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_document_exchanges (
      id BIGSERIAL PRIMARY KEY,
      referral_id BIGINT REFERENCES healthos_referrals(id),
      global_session_id BIGINT,
      patient_id BIGINT NOT NULL,
      document_type VARCHAR(60) NOT NULL,
      title VARCHAR(255),
      fhir_bundle JSONB,
      dicom_study_uid VARCHAR(120),
      shared_by_org_id BIGINT,
      shared_by_user_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_global_cases (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      source_org_network_id BIGINT,
      case_number VARCHAR(40),
      presentation_summary TEXT,
      final_diagnosis TEXT,
      outcome TEXT,
      lessons_learned TEXT,
      keywords TEXT[],
      shareable BOOLEAN DEFAULT false,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_network_signals (
      id BIGSERIAL PRIMARY KEY,
      signal_type VARCHAR(60) NOT NULL,
      severity VARCHAR(20) DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      description TEXT,
      affected_org_ids BIGINT[] DEFAULT '{}',
      aggregated_data JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(30) DEFAULT 'active',
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );

    -- ═══ STAGE 4: PLATFORM ═════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS healthos_marketplace_apps (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(80) UNIQUE NOT NULL,
      category VARCHAR(60) NOT NULL,
      vendor VARCHAR(255),
      description TEXT,
      api_scopes TEXT[] DEFAULT '{}',
      pricing_model VARCHAR(40) DEFAULT 'subscription',
      status VARCHAR(30) DEFAULT 'published',
      install_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_org_app_installs (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      app_id BIGINT NOT NULL REFERENCES healthos_marketplace_apps(id),
      installed_by BIGINT,
      config JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(30) DEFAULT 'active',
      installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, app_id)
    );

    CREATE TABLE IF NOT EXISTS healthos_api_keys (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      name VARCHAR(120) NOT NULL,
      key_prefix VARCHAR(12) NOT NULL,
      key_hash VARCHAR(128) NOT NULL,
      scopes TEXT[] DEFAULT '{}',
      created_by BIGINT,
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_webhooks (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      url TEXT NOT NULL,
      events TEXT[] NOT NULL,
      secret_hash VARCHAR(128),
      status VARCHAR(30) DEFAULT 'active',
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_clinical_trials (
      id BIGSERIAL PRIMARY KEY,
      nct_id VARCHAR(20) UNIQUE,
      title TEXT NOT NULL,
      conditions TEXT[] DEFAULT '{}',
      phase VARCHAR(20),
      status VARCHAR(40) DEFAULT 'recruiting',
      eligibility JSONB DEFAULT '{}'::jsonb,
      locations TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_trial_matches (
      id BIGSERIAL PRIMARY KEY,
      patient_id BIGINT NOT NULL,
      trial_id BIGINT NOT NULL REFERENCES healthos_clinical_trials(id),
      match_score INTEGER DEFAULT 0,
      match_reasons JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(30) DEFAULT 'suggested',
      reviewed_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (patient_id, trial_id)
    );

    CREATE TABLE IF NOT EXISTS healthos_emergency_resources (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      org_network_id BIGINT,
      resource_type VARCHAR(60) NOT NULL,
      quantity_available INTEGER DEFAULT 0,
      quantity_total INTEGER,
      location_name VARCHAR(255),
      geo_region VARCHAR(80),
      status VARCHAR(30) DEFAULT 'available',
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_population_metrics (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      metric_name VARCHAR(80) NOT NULL,
      metric_value NUMERIC(14,4),
      unit VARCHAR(30),
      period_start DATE,
      period_end DATE,
      dimensions JSONB DEFAULT '{}'::jsonb,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS healthos_government_reports (
      id BIGSERIAL PRIMARY KEY,
      report_type VARCHAR(60) NOT NULL,
      region VARCHAR(80),
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      metrics JSONB DEFAULT '{}'::jsonb,
      submitted_by BIGINT,
      status VARCHAR(30) DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed marketplace apps
  await pool.query(`
    INSERT INTO healthos_marketplace_apps (name, slug, category, vendor, description, api_scopes, status)
    VALUES
      ('Radiology AI Assistant', 'radiology-ai', 'diagnostics', 'Mediqzy Labs', 'AI-assisted radiology reads with FHIR integration', '{imaging.read,imaging.annotate}', 'published'),
      ('Oncology Decision Support', 'oncology-ai', 'oncology', 'Mediqzy Labs', 'Treatment pathway suggestions for tumor boards', '{patient.read,conditions.read}', 'published'),
      ('Rehab Progress Tracker', 'rehab-tracker', 'rehabilitation', 'Partner Rehab Co', 'Home rehabilitation exercise tracking', '{patient.read,tasks.write}', 'published'),
      ('Pharmacy Fulfillment Hub', 'pharmacy-hub', 'pharmacy', 'Mediqzy', 'ePrescription routing and fulfillment status', '{medication.read,medication.write}', 'published'),
      ('Population Health Analytics', 'pop-health', 'analytics', 'Mediqzy', 'Aggregated population metrics and risk stratification', '{analytics.read,population.read}', 'published')
    ON CONFLICT (slug) DO NOTHING
  `);

  // Seed sample clinical trials
  await pool.query(`
    INSERT INTO healthos_clinical_trials (nct_id, title, conditions, phase, status, eligibility, locations)
    VALUES
      ('NCT-DEMO-001', 'Novel anticoagulation in AF post-stroke', '{atrial_fibrillation,stroke}', 'Phase III', 'recruiting', '{"minAge": 18, "maxAge": 85}'::jsonb, '{India,Kenya,Singapore}'),
      ('NCT-DEMO-002', 'Sepsis early warning wearable trial', '{sepsis,critical_care}', 'Phase II', 'recruiting', '{"minAge": 18}'::jsonb, '{UAE,UK}')
    ON CONFLICT (nct_id) DO NOTHING
  `);

  console.log('✓ HealthOS Phases 2–4 tables ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS healthos_government_reports;
    DROP TABLE IF EXISTS healthos_population_metrics;
    DROP TABLE IF EXISTS healthos_emergency_resources;
    DROP TABLE IF EXISTS healthos_trial_matches;
    DROP TABLE IF EXISTS healthos_clinical_trials;
    DROP TABLE IF EXISTS healthos_webhooks;
    DROP TABLE IF EXISTS healthos_api_keys;
    DROP TABLE IF EXISTS healthos_org_app_installs;
    DROP TABLE IF EXISTS healthos_marketplace_apps;
    DROP TABLE IF EXISTS healthos_network_signals;
    DROP TABLE IF EXISTS healthos_global_cases;
    DROP TABLE IF EXISTS healthos_document_exchanges;
    DROP TABLE IF EXISTS healthos_referrals;
    DROP TABLE IF EXISTS healthos_wearable_readings;
    DROP TABLE IF EXISTS healthos_homecare_visits;
    DROP TABLE IF EXISTS healthos_pharmacy_orders;
    DROP TABLE IF EXISTS healthos_lab_results;
  `);
}
