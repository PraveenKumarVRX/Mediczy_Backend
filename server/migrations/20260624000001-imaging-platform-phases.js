/**
 * Imaging platform phases 1–4 — workflow, collaboration, AI triage, templates, search.
 */
export async function up(queryInterface) {
  const qi = queryInterface.sequelize;

  await qi.query(`
    CREATE TABLE IF NOT EXISTS ris_report_templates (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      modality VARCHAR(20) NOT NULL DEFAULT 'OT',
      name VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      macros JSONB NOT NULL DEFAULT '[]',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_ris_report_tpl_tenant ON ris_report_templates(tenant_id, modality);

    CREATE TABLE IF NOT EXISTS imaging_workflow_instances (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT,
      study_instance_uid VARCHAR(200),
      tenant_id BIGINT NOT NULL,
      state VARCHAR(40) NOT NULL DEFAULT 'received',
      assigned_to BIGINT,
      assigned_name VARCHAR(200),
      priority VARCHAR(20) DEFAULT 'routine',
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_wf_study ON imaging_workflow_instances(study_id);
    CREATE INDEX IF NOT EXISTS idx_imaging_wf_state ON imaging_workflow_instances(tenant_id, state);

    CREATE TABLE IF NOT EXISTS imaging_workflow_events (
      id BIGSERIAL PRIMARY KEY,
      instance_id BIGINT NOT NULL REFERENCES imaging_workflow_instances(id) ON DELETE CASCADE,
      from_state VARCHAR(40),
      to_state VARCHAR(40) NOT NULL,
      actor_id BIGINT,
      actor_name VARCHAR(200),
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imaging_collab_sessions (
      id BIGSERIAL PRIMARY KEY,
      study_instance_uid VARCHAR(200) NOT NULL,
      tenant_id BIGINT NOT NULL,
      created_by BIGINT,
      created_by_name VARCHAR(200),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imaging_collab_annotations (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES imaging_collab_sessions(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL,
      user_name VARCHAR(200),
      tool VARCHAR(40) DEFAULT 'pointer',
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imaging_ai_triage (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT,
      study_instance_uid VARCHAR(200) NOT NULL,
      tenant_id BIGINT NOT NULL,
      modality VARCHAR(20),
      findings JSONB NOT NULL DEFAULT '[]',
      confidence_score NUMERIC(5,4),
      model_version VARCHAR(40) DEFAULT 'imaging-triage-v1',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      reviewed_by BIGINT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_triage_study ON imaging_ai_triage(study_instance_uid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_imaging_triage_uid_tenant
      ON imaging_ai_triage(study_instance_uid, tenant_id);

    CREATE TABLE IF NOT EXISTS imaging_metrics_log (
      id BIGSERIAL PRIMARY KEY,
      metric_name VARCHAR(80) NOT NULL,
      metric_value NUMERIC,
      labels JSONB DEFAULT '{}',
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_metrics_name ON imaging_metrics_log(metric_name, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS imaging_vna_objects (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      storage_tier VARCHAR(20) NOT NULL DEFAULT 'hot',
      s3_key VARCHAR(500),
      orthanc_id VARCHAR(64),
      region VARCHAR(40) DEFAULT 'ap-south-1',
      lifecycle_state VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_imaging_vna_study_tenant ON imaging_vna_objects(study_instance_uid, tenant_id);

    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS workflow_state VARCHAR(40) DEFAULT 'received';
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS ai_triage_status VARCHAR(30);
  `);
}

export async function down() {}
