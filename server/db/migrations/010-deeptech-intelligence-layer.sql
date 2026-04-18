-- ============================================================
-- Mediqzy DeepTech Intelligence Layer — Schema Migration 010
-- ============================================================
-- Five proprietary data tables that form Mediqzy's deep tech IP:
--   1. his_scores            — Health Intelligence Score (HIS) per patient
--   2. medical_entities      — Structured clinical NLP entities from chat/scribe
--   3. claim_preauth_decisions — Autonomous pre-authorization audit trail
--   4. agent_context_bridge  — Shared context across multi-agent system
--   5. federated_model_updates — Anonymized model learning (DPDP/HIPAA compliant)
-- ============================================================
-- ─── 1. Health Intelligence Score (HIS) ─────────────────────
-- Mediqzy's proprietary 0-100 patient health score (100 = perfectly healthy)
-- Aggregates all Bayesian risk subscores into a single IP metric.
CREATE TABLE IF NOT EXISTS his_scores (
    id BIGSERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    tenant_id VARCHAR(64),
    -- multi-tenant isolation
    his_score NUMERIC(5, 2) NOT NULL,
    -- 0.00–100.00 (100 = best)
    risk_tier VARCHAR(20) NOT NULL,
    -- critical/high/moderate/low/optimal
    -- Dimension subscores (0–10, lower risk = higher score)
    cardiovascular_score NUMERIC(4, 2),
    diabetes_score NUMERIC(4, 2),
    hypertension_score NUMERIC(4, 2),
    adherence_score NUMERIC(4, 2),
    lifestyle_score NUMERIC(4, 2),
    mental_health_score NUMERIC(4, 2),
    -- Derived intelligence
    trend_direction VARCHAR(10),
    -- improving/stable/declining
    trend_magnitude NUMERIC(4, 2),
    -- delta vs last score
    predicted_30d NUMERIC(5, 2),
    -- predicted score in 30 days
    percentile_rank NUMERIC(5, 2),
    -- vs anonymised population
    risk_factors JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    data_sources JSONB DEFAULT '{}',
    -- which data types fed this score
    confidence NUMERIC(4, 2) DEFAULT 0.70,
    -- 0–1 model confidence
    algorithm_version VARCHAR(20) DEFAULT 'his-v1',
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '6 hours',
    CONSTRAINT his_tier_check CHECK (
        risk_tier IN ('critical', 'high', 'moderate', 'low', 'optimal')
    )
);
CREATE INDEX IF NOT EXISTS idx_his_patient_time ON his_scores (patient_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_his_tenant ON his_scores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_his_risk_tier ON his_scores (risk_tier);
-- ─── 2. Medical Entities (Clinical NLP) ─────────────────────
-- Structured entities extracted from Dr. iSHA conversations and AI Scribe notes.
-- FHIR R4 compatible output for interoperability.
CREATE TABLE IF NOT EXISTS medical_entities (
    id BIGSERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    tenant_id VARCHAR(64),
    source VARCHAR(30) NOT NULL,
    -- chat/scribe/report
    source_id VARCHAR(128),
    -- conversation_id / scribe session id
    entity_type VARCHAR(30) NOT NULL,
    -- symptom/diagnosis/medication/procedure/allergy/lab/vital
    entity_text TEXT NOT NULL,
    -- original text fragment
    normalized_name VARCHAR(256),
    -- normalised medical term
    icd10_code VARCHAR(20),
    -- ICD-10-CM code if applicable
    snomed_code VARCHAR(30),
    -- SNOMED CT if applicable
    rxnorm_code VARCHAR(30),
    -- RxNorm for medications
    attributes JSONB DEFAULT '{}',
    -- dosage, frequency, severity, duration, laterality
    confidence NUMERIC(4, 3) DEFAULT 0.80,
    -- extraction confidence 0–1
    negated BOOLEAN DEFAULT FALSE,
    -- "no chest pain" → negated=true
    fhir_resource JSONB DEFAULT '{}',
    -- FHIR R4 resource snippet
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT entity_type_check CHECK (
        entity_type IN (
            'symptom',
            'diagnosis',
            'medication',
            'procedure',
            'allergy',
            'lab',
            'vital',
            'body_part',
            'severity'
        )
    )
);
CREATE INDEX IF NOT EXISTS idx_entities_patient ON medical_entities (patient_id, extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_entities_type ON medical_entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_icd10 ON medical_entities (icd10_code)
WHERE icd10_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_source ON medical_entities (source, source_id);
-- ─── 3. Claims Pre-Authorization Decisions ──────────────────
-- Full audit trail of every autonomous pre-auth decision.
-- Designed for IRDA (India) and TPA compliance.
CREATE TABLE IF NOT EXISTS claim_preauth_decisions (
    id BIGSERIAL PRIMARY KEY,
    decision_ref VARCHAR(32) UNIQUE NOT NULL,
    -- PAD-{YYYYMMDD}-{6-digit-seq}
    patient_id INTEGER NOT NULL,
    tenant_id VARCHAR(64),
    policy_id VARCHAR(128),
    tpa_id VARCHAR(64),
    -- Request
    admission_type VARCHAR(20),
    -- emergency/planned/daycare
    diagnosis_codes TEXT [],
    -- ICD-10 codes
    procedure_codes TEXT [],
    -- ICD-10-PCS / CPT codes
    requested_amount NUMERIC(12, 2),
    hospital_id INTEGER,
    treating_doctor_id INTEGER,
    -- Decision
    decision VARCHAR(20) NOT NULL,
    -- approved/rejected/partial/escalated/pending
    approved_amount NUMERIC(12, 2),
    decision_confidence NUMERIC(4, 3),
    decision_method VARCHAR(20) DEFAULT 'rule_engine',
    -- rule_engine/ml_model/llm/human
    decision_reason TEXT,
    rule_matches JSONB DEFAULT '[]',
    -- which rules triggered
    fraud_score NUMERIC(4, 3),
    -- 0–1 fraud likelihood
    fraud_flags JSONB DEFAULT '[]',
    -- Timing
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    escalated_to INTEGER,
    -- user_id of human reviewer
    human_override BOOLEAN DEFAULT FALSE,
    human_override_by INTEGER,
    human_override_at TIMESTAMPTZ,
    human_override_reason TEXT,
    -- Compliance
    irda_compliant BOOLEAN DEFAULT TRUE,
    audit_hash VARCHAR(64),
    -- SHA-256 of decision record
    CONSTRAINT decision_check CHECK (
        decision IN (
            'approved',
            'rejected',
            'partial',
            'escalated',
            'pending',
            'withdrawn'
        )
    )
);
CREATE INDEX IF NOT EXISTS idx_preauth_patient ON claim_preauth_decisions (patient_id);
CREATE INDEX IF NOT EXISTS idx_preauth_decision ON claim_preauth_decisions (decision, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_preauth_tenant ON claim_preauth_decisions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_preauth_ref ON claim_preauth_decisions (decision_ref);
-- ─── 4. Multi-Agent Context Bridge ──────────────────────────
-- Shared patient context store across all AI agents.
-- Agents read + write here so they coordinate rather than repeat work.
CREATE TABLE IF NOT EXISTS agent_context_bridge (
    id BIGSERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    tenant_id VARCHAR(64),
    session_id VARCHAR(128),
    -- ties all agents to one encounter
    -- Context slots (populated by different agents)
    triage_context JSONB DEFAULT '{}',
    -- emergency_triage agent output
    clinical_context JSONB DEFAULT '{}',
    -- Dr. iSHA / scribe
    billing_context JSONB DEFAULT '{}',
    -- billing agent
    insurance_context JSONB DEFAULT '{}',
    -- insurance bot
    his_context JSONB DEFAULT '{}',
    -- HIS service
    -- Shared state
    active_complaints TEXT [],
    active_diagnoses TEXT [],
    active_medications TEXT [],
    encounter_type VARCHAR(30),
    -- opd/emergency/teleconsult/homecare
    urgency_level VARCHAR(20),
    -- routine/urgent/emergency
    last_triage_esi INTEGER,
    -- ESI level from triage agent
    -- Lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_ctx_patient_session ON agent_context_bridge (patient_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ctx_active ON agent_context_bridge (patient_id, is_active)
WHERE is_active = TRUE;
-- ─── 5. Federated Model Updates ─────────────────────────────
-- DPDP/HIPAA compliant: stores aggregated model gradients, NOT raw patient data.
-- Enables cross-hospital learning without data sharing.
CREATE TABLE IF NOT EXISTS federated_model_updates (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    model_name VARCHAR(64) NOT NULL,
    -- his_score_v1 / triage_v1 / preauth_v1
    round_number INTEGER NOT NULL DEFAULT 0,
    -- federated learning round
    -- Aggregated statistics (NO raw patient data — DPDP/HIPAA compliant)
    sample_count INTEGER NOT NULL,
    -- how many patients contributed
    feature_stats JSONB DEFAULT '{}',
    -- mean/std per feature (anonymized)
    gradient_delta JSONB DEFAULT '{}',
    -- model weight delta (differential privacy applied)
    privacy_epsilon NUMERIC(6, 4) DEFAULT 1.0,
    -- differential privacy ε parameter
    privacy_delta NUMERIC(10, 8) DEFAULT 0.00001,
    -- differential privacy δ parameter
    noise_scale NUMERIC(8, 4),
    -- Gaussian noise scale applied
    -- Validation
    local_accuracy NUMERIC(5, 4),
    -- tenant's local model accuracy
    global_accuracy NUMERIC(5, 4),
    -- global model accuracy after this round
    is_accepted BOOLEAN DEFAULT NULL,
    -- NULL=pending, TRUE=accepted, FALSE=rejected
    rejection_reason TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    aggregated_at TIMESTAMPTZ,
    CONSTRAINT fmu_unique UNIQUE (tenant_id, model_name, round_number)
);
CREATE INDEX IF NOT EXISTS idx_federated_model_round ON federated_model_updates (model_name, round_number);
CREATE INDEX IF NOT EXISTS idx_federated_tenant ON federated_model_updates (tenant_id);
-- ─── Summary comments ───────────────────────────────────────
COMMENT ON TABLE his_scores IS 'Mediqzy Health Intelligence Score — proprietary patient health metric (deep tech IP)';
COMMENT ON TABLE medical_entities IS 'Clinical NLP entity extraction from conversations and scribe — FHIR R4 compatible';
COMMENT ON TABLE claim_preauth_decisions IS 'Autonomous insurance pre-authorization engine decisions — IRDA compliant audit trail';
COMMENT ON TABLE agent_context_bridge IS 'Multi-agent context sharing — enables coordinated AI across triage/billing/clinical/insurance';
COMMENT ON TABLE federated_model_updates IS 'Federated learning updates — cross-hospital model improvement without sharing raw data (DPDP compliant)';