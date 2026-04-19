-- ============================================================================
-- HyperGrid Migration: 011-hypergrid-platform.sql
-- Creates all tables required by the HyperGrid IoT/Interoperability platform.
-- Run: psql $DATABASE_URL -f 011-hypergrid-platform.sql
-- ============================================================================
BEGIN;
-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- fuzzy terminology search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "btree_gin";
-- GIN on JSONB
-- ============================================================================
-- LAYER 1: IoT / Edge — MQTT devices & readings
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_devices (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    gateway_id BIGINT,
    -- FK to hg_edge_gateways
    device_type VARCHAR(80) NOT NULL,
    -- glucometer|ecg|spo2|bp|thermometer…
    name VARCHAR(200) NOT NULL,
    manufacturer VARCHAR(200),
    model VARCHAR(200),
    serial_number VARCHAR(200),
    firmware_ver VARCHAR(80),
    gateway_key VARCHAR(80) NOT NULL UNIQUE,
    secret_hash VARCHAR(200) NOT NULL,
    topic_prefix VARCHAR(300),
    location VARCHAR(300),
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    -- active|inactive|decommissioned
    last_seen TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hg_devices_tenant ON hg_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_devices_gateway ON hg_devices(gateway_id);
CREATE INDEX IF NOT EXISTS idx_hg_devices_key ON hg_devices(gateway_key);
CREATE TABLE IF NOT EXISTS hg_device_readings (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT REFERENCES hg_devices(id) ON DELETE
    SET NULL,
        gateway_id BIGINT,
        reading_type VARCHAR(80) NOT NULL,
        -- heart_rate|spo2|blood_pressure|temperature…
        value DOUBLE PRECISION,
        unit VARCHAR(40),
        quality VARCHAR(40),
        -- good|questionable|bad
        raw_payload JSONB,
        patient_id BIGINT,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_readings_device ON hg_device_readings(device_id);
CREATE INDEX IF NOT EXISTS idx_hg_readings_patient ON hg_device_readings(patient_id);
CREATE INDEX IF NOT EXISTS idx_hg_readings_type_time ON hg_device_readings(reading_type, recorded_at DESC);
-- ============================================================================
-- LAYER 2: Edge Gateway fleet
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_edge_gateways (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    facility_id VARCHAR(200) NOT NULL,
    location VARCHAR(300),
    model VARCHAR(200),
    firmware_version VARCHAR(80),
    gateway_key VARCHAR(80) NOT NULL UNIQUE,
    secret_hash VARCHAR(200) NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '{}',
    config JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(40) NOT NULL DEFAULT 'offline',
    -- offline|online|degraded|decommissioned
    last_seen TIMESTAMPTZ,
    device_count INT NOT NULL DEFAULT 0,
    pending_sync INT NOT NULL DEFAULT 0,
    metrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hg_gateways_tenant ON hg_edge_gateways(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_gateways_facility ON hg_edge_gateways(facility_id);
CREATE INDEX IF NOT EXISTS idx_hg_gateways_status ON hg_edge_gateways(status);
-- ============================================================================
-- LAYER 3: Canonical Event Bus — durable event log
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_event_store (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    event_type VARCHAR(120) NOT NULL,
    source VARCHAR(120),
    tenant_id BIGINT,
    patient_id BIGINT,
    resource_id VARCHAR(200),
    resource_type VARCHAR(80),
    payload JSONB NOT NULL DEFAULT '{}',
    correlation_id VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_events_type ON hg_event_store(event_type);
CREATE INDEX IF NOT EXISTS idx_hg_events_patient ON hg_event_store(patient_id);
CREATE INDEX IF NOT EXISTS idx_hg_events_tenant ON hg_event_store(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_events_created ON hg_event_store(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hg_events_correlation ON hg_event_store(correlation_id);
-- ============================================================================
-- LAYER 4: Terminology — SNOMED/LOINC/ICD/RxNorm semantic mapping
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_code_map (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT,
    -- NULL = global/built-in
    local_code VARCHAR(200) NOT NULL,
    local_system VARCHAR(120),
    canonical_code VARCHAR(200),
    canonical_system VARCHAR(120),
    display VARCHAR(500),
    snomed_code VARCHAR(40),
    loinc_code VARCHAR(40),
    icd10_code VARCHAR(40),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, local_code, local_system)
);
CREATE INDEX IF NOT EXISTS idx_hg_codemap_local ON hg_code_map(local_code, local_system);
CREATE INDEX IF NOT EXISTS idx_hg_codemap_tenant ON hg_code_map(tenant_id);
CREATE TABLE IF NOT EXISTS hg_terminology (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(200) NOT NULL,
    system VARCHAR(120) NOT NULL,
    -- snomed|loinc|icd10|rxnorm|cpt
    display VARCHAR(500) NOT NULL,
    definition TEXT,
    parent_codes VARCHAR(500),
    -- comma-separated
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, system)
);
CREATE INDEX IF NOT EXISTS idx_hg_terminology_code ON hg_terminology(code, system);
CREATE INDEX IF NOT EXISTS idx_hg_terminology_trgm ON hg_terminology USING GIN (display gin_trgm_ops);
-- ============================================================================
-- LAYER 5: Digital Twins
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_digital_twins (
    id BIGSERIAL PRIMARY KEY,
    twin_type VARCHAR(80) NOT NULL,
    -- device|patient|asset|hospital|claim|ambulance
    external_id VARCHAR(200) NOT NULL,
    tenant_id BIGINT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}',
    location JSONB,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (twin_type, external_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_hg_twins_tenant ON hg_digital_twins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_twins_type ON hg_digital_twins(twin_type);
CREATE INDEX IF NOT EXISTS idx_hg_twins_ext ON hg_digital_twins(external_id);
CREATE INDEX IF NOT EXISTS idx_hg_twins_attrs ON hg_digital_twins USING GIN (attributes);
CREATE TABLE IF NOT EXISTS hg_twin_observations (
    id BIGSERIAL PRIMARY KEY,
    twin_id BIGINT NOT NULL REFERENCES hg_digital_twins(id) ON DELETE CASCADE,
    observation_type VARCHAR(120) NOT NULL,
    value JSONB NOT NULL,
    unit VARCHAR(40),
    metadata JSONB,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_twin_obs_twin ON hg_twin_observations(twin_id);
CREATE INDEX IF NOT EXISTS idx_hg_twin_obs_type ON hg_twin_observations(twin_id, observation_type);
CREATE INDEX IF NOT EXISTS idx_hg_twin_obs_time ON hg_twin_observations(observed_at DESC);
-- ============================================================================
-- LAYER 6: DICOM imaging
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_dicom_studies (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    study_uid VARCHAR(200) NOT NULL UNIQUE,
    patient_id BIGINT,
    patient_name VARCHAR(300),
    patient_dob DATE,
    patient_sex CHAR(1),
    accession_number VARCHAR(100),
    study_date DATE,
    study_description VARCHAR(300),
    modalities JSONB NOT NULL DEFAULT '[]',
    referring_physician VARCHAR(200),
    institution VARCHAR(200),
    num_instances INT NOT NULL DEFAULT 0,
    store_path VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_tenant ON hg_dicom_studies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_patient ON hg_dicom_studies(patient_id);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_date ON hg_dicom_studies(study_date DESC);
CREATE TABLE IF NOT EXISTS hg_dicom_instances (
    id BIGSERIAL PRIMARY KEY,
    study_id BIGINT NOT NULL REFERENCES hg_dicom_studies(id) ON DELETE CASCADE,
    sop_uid VARCHAR(200) NOT NULL UNIQUE,
    sop_class_uid VARCHAR(200),
    series_uid VARCHAR(200),
    modality VARCHAR(20),
    instance_number INT,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_inst_study ON hg_dicom_instances(study_id);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_inst_series ON hg_dicom_instances(series_uid);
CREATE TABLE IF NOT EXISTS hg_dicom_reports (
    id BIGSERIAL PRIMARY KEY,
    study_id BIGINT NOT NULL REFERENCES hg_dicom_studies(id) ON DELETE CASCADE,
    radiologist_id BIGINT,
    radiologist_name VARCHAR(200),
    findings TEXT,
    impression TEXT,
    recommendations TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    -- draft|final|amended
    reported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_dicom_reports_study ON hg_dicom_reports(study_id);
CREATE TABLE IF NOT EXISTS hg_dicom_worklist (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    patient_id BIGINT,
    patient_name VARCHAR(300) NOT NULL,
    patient_dob DATE,
    patient_sex CHAR(1),
    accession_number VARCHAR(100),
    requested_procedure VARCHAR(300),
    modality VARCHAR(20),
    scheduled_date TIMESTAMPTZ,
    station_name VARCHAR(100),
    referring_physician VARCHAR(200),
    priority VARCHAR(40) DEFAULT 'routine',
    status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
    study_id BIGINT REFERENCES hg_dicom_studies(id) ON DELETE
    SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_worklist_tenant ON hg_dicom_worklist(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_worklist_date ON hg_dicom_worklist(scheduled_date);
-- ============================================================================
-- LAYER 7: SMART on FHIR
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_smart_apps (
    id BIGSERIAL PRIMARY KEY,
    client_id VARCHAR(120) NOT NULL UNIQUE,
    client_secret_hash VARCHAR(200) NOT NULL,
    client_name VARCHAR(300) NOT NULL,
    redirect_uris JSONB NOT NULL DEFAULT '[]',
    logo_uri VARCHAR(500),
    contacts JSONB,
    grant_types JSONB NOT NULL DEFAULT '["authorization_code"]',
    allowed_scopes TEXT,
    registered_by BIGINT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hg_smart_auth_codes (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(200) NOT NULL UNIQUE,
    client_id VARCHAR(120) NOT NULL,
    user_id BIGINT NOT NULL,
    scope TEXT,
    redirect_uri VARCHAR(500),
    code_challenge VARCHAR(200),
    code_challenge_method VARCHAR(20),
    patient_id BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_auth_codes_code ON hg_smart_auth_codes(code);
CREATE TABLE IF NOT EXISTS hg_smart_tokens (
    id BIGSERIAL PRIMARY KEY,
    access_token_hash VARCHAR(200) NOT NULL,
    refresh_token VARCHAR(200),
    client_id VARCHAR(120) NOT NULL,
    user_id BIGINT NOT NULL,
    scope TEXT,
    patient_id BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_tokens_hash ON hg_smart_tokens(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_hg_tokens_refresh ON hg_smart_tokens(refresh_token);
-- ============================================================================
-- LAYER 8: Connector Factory + Mapping Studio
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_connectors (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    connector_type VARCHAR(80) NOT NULL,
    -- HIS|LIS|RIS/PACS|TPA|IoT|Asset|Pharmacy|Ambulance
    template_id VARCHAR(80),
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    -- draft|configured|certified|active|disabled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (template_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_hg_connectors_tenant ON hg_connectors(tenant_id);
CREATE TABLE IF NOT EXISTS hg_field_mappings (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    connector_id INT REFERENCES hg_connectors(id) ON DELETE CASCADE,
    source_field VARCHAR(300) NOT NULL,
    target_canonical_field VARCHAR(300) NOT NULL,
    transform_type VARCHAR(80) NOT NULL DEFAULT 'passthrough',
    -- passthrough|rename|unit_convert|terminology|expression
    transform_config JSONB NOT NULL DEFAULT '{}',
    unit VARCHAR(40),
    validation_rule VARCHAR(500),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hg_mappings_tenant ON hg_field_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hg_mappings_connector ON hg_field_mappings(connector_id);
-- ============================================================================
-- LAYER 9: App Marketplace & Network
-- ============================================================================
CREATE TABLE IF NOT EXISTS hg_marketplace_apps (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(120) NOT NULL,
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    demo_url VARCHAR(500),
    smart_client_id VARCHAR(120),
    pricing JSONB NOT NULL DEFAULT '{"model":"free"}',
    tags JSONB NOT NULL DEFAULT '[]',
    avg_rating NUMERIC(3, 2),
    install_count INT NOT NULL DEFAULT 0,
    submitted_by BIGINT,
    review_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    -- pending|approved|rejected
    review_notes TEXT,
    reviewed_by BIGINT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_mkt_category ON hg_marketplace_apps(category);
CREATE INDEX IF NOT EXISTS idx_hg_mkt_status ON hg_marketplace_apps(review_status);
CREATE INDEX IF NOT EXISTS idx_hg_mkt_search ON hg_marketplace_apps USING GIN (
    to_tsvector('english', name || ' ' || description)
);
CREATE TABLE IF NOT EXISTS hg_app_installs (
    app_id BIGINT NOT NULL REFERENCES hg_marketplace_apps(id) ON DELETE CASCADE,
    tenant_id BIGINT NOT NULL,
    installed_by BIGINT,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (app_id, tenant_id)
);
CREATE TABLE IF NOT EXISTS hg_app_ratings (
    app_id BIGINT NOT NULL REFERENCES hg_marketplace_apps(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    rating SMALLINT NOT NULL CHECK (
        rating BETWEEN 1 AND 5
    ),
    review_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (app_id, user_id)
);
CREATE TABLE IF NOT EXISTS hg_network_participants (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    participant_type VARCHAR(80) NOT NULL,
    -- hospital|lab|insurer|tpa|pharmacy|ambulance|clinic
    city VARCHAR(120),
    state VARCHAR(80),
    country CHAR(2) NOT NULL DEFAULT 'IN',
    contact_email VARCHAR(300),
    capabilities JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_network_type ON hg_network_participants(participant_type);
CREATE INDEX IF NOT EXISTS idx_hg_network_city ON hg_network_participants(city);
CREATE TABLE IF NOT EXISTS hg_benchmarks (
    id BIGSERIAL PRIMARY KEY,
    metric_type VARCHAR(120) NOT NULL,
    -- avg_turnaround_min|claim_approval_rate|readmission_rate…
    metric_value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(40),
    facility_type VARCHAR(80),
    specialty VARCHAR(120),
    region VARCHAR(80),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hg_benchmarks_metric ON hg_benchmarks(metric_type, facility_type);
-- ============================================================================
-- Seed: built-in SNOMED/LOINC/ICD10 sample concepts
-- (bootstrap only — full catalogue loaded via ETL)
-- ============================================================================
INSERT INTO hg_terminology (code, system, display, active)
VALUES (
        '271649006',
        'snomed',
        'Systolic blood pressure',
        TRUE
    ),
    (
        '271650006',
        'snomed',
        'Diastolic blood pressure',
        TRUE
    ),
    ('364075005', 'snomed', 'Heart rate', TRUE),
    (
        '59408-5',
        'loinc',
        'Oxygen saturation in arterial blood',
        TRUE
    ),
    ('8867-4', 'loinc', 'Heart rate', TRUE),
    (
        '8480-6',
        'loinc',
        'Systolic blood pressure',
        TRUE
    ),
    (
        '8462-4',
        'loinc',
        'Diastolic blood pressure',
        TRUE
    ),
    ('8310-5', 'loinc', 'Body temperature', TRUE),
    ('29463-7', 'loinc', 'Body weight', TRUE),
    ('8302-2', 'loinc', 'Body height', TRUE),
    (
        'I10',
        'icd10',
        'Essential (primary) hypertension',
        TRUE
    ),
    (
        'E11',
        'icd10',
        'Type 2 diabetes mellitus',
        TRUE
    ),
    (
        'J18',
        'icd10',
        'Pneumonia, unspecified organism',
        TRUE
    ),
    (
        'N18',
        'icd10',
        'Chronic kidney disease',
        TRUE
    ),
    (
        'I21',
        'icd10',
        'Acute myocardial infarction',
        TRUE
    ) ON CONFLICT (code, system) DO NOTHING;
COMMIT;