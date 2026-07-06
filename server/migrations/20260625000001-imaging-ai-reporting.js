/**
 * AI reporting phases A–D — drafts, priors, measurements, longitudinal tracking.
 */
export async function up(queryInterface) {
  const qi = queryInterface.sequelize;
  await qi.query(`
    CREATE TABLE IF NOT EXISTS imaging_ai_report_drafts (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      tenant_id BIGINT NOT NULL,
      draft_text TEXT NOT NULL,
      structured_findings JSONB NOT NULL DEFAULT '{}',
      prior_comparison TEXT,
      confidence_score NUMERIC(5,4),
      model_version VARCHAR(40) DEFAULT 'imaging-report-drafter-v1',
      gate_result JSONB DEFAULT '{}',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_by BIGINT,
      created_by_name VARCHAR(200),
      reviewed_by BIGINT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_report_drafts_study ON imaging_ai_report_drafts(study_id, tenant_id);

    CREATE TABLE IF NOT EXISTS imaging_prior_comparisons (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL,
      prior_study_id BIGINT,
      prior_study_instance_uid VARCHAR(200),
      tenant_id BIGINT NOT NULL,
      comparison_narrative TEXT NOT NULL,
      structured_diff JSONB DEFAULT '{}',
      model_version VARCHAR(40) DEFAULT 'imaging-prior-compare-v1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_prior_cmp_study ON imaging_prior_comparisons(study_id);

    CREATE TABLE IF NOT EXISTS imaging_measurements (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT,
      study_instance_uid VARCHAR(200) NOT NULL,
      tenant_id BIGINT NOT NULL,
      lesion_label VARCHAR(200),
      location VARCHAR(200),
      size_mm NUMERIC(8,2),
      volume_mm3 NUMERIC(12,2),
      prior_size_mm NUMERIC(8,2),
      growth_mm NUMERIC(8,2),
      tool VARCHAR(40) DEFAULT 'manual',
      data JSONB DEFAULT '{}',
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_measurements_study ON imaging_measurements(study_instance_uid, tenant_id);

    CREATE TABLE IF NOT EXISTS imaging_lesion_tracking (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      patient_key VARCHAR(200) NOT NULL,
      lesion_id VARCHAR(100) NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      study_date DATE,
      size_mm NUMERIC(8,2),
      volume_mm3 NUMERIC(12,2),
      location VARCHAR(200),
      metadata JSONB DEFAULT '{}',
      tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, lesion_id, study_instance_uid)
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_lesion_patient ON imaging_lesion_tracking(tenant_id, patient_key);

    CREATE TABLE IF NOT EXISTS imaging_longitudinal_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      patient_key VARCHAR(200) NOT NULL,
      study_instance_uid VARCHAR(200),
      event_type VARCHAR(60) NOT NULL,
      summary TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_longitudinal_patient ON imaging_longitudinal_events(tenant_id, patient_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS imaging_critical_alerts (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      tenant_id BIGINT NOT NULL,
      alert_type VARCHAR(80) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'high',
      finding_label VARCHAR(200),
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      workflow_bumped BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_critical_open ON imaging_critical_alerts(tenant_id, status) WHERE status = 'open';
  `);
}

export async function down() {}
