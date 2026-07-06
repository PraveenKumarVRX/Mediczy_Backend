/** Interpretability + Redis collab channel metadata. */
export async function up(queryInterface) {
  const qi = queryInterface.sequelize;
  await qi.query(`
    CREATE TABLE IF NOT EXISTS imaging_report_interpretations (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200),
      tenant_id BIGINT NOT NULL,
      source VARCHAR(60) NOT NULL DEFAULT 'imaging-report-drafter',
      confidence_score NUMERIC(5,4),
      confidence_tier VARCHAR(20),
      feature_attributions JSONB NOT NULL DEFAULT '[]',
      explanation JSONB NOT NULL DEFAULT '{}',
      gate_result JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_imaging_interp_study ON imaging_report_interpretations(study_id, tenant_id);
  `);
}

export async function down() {}
