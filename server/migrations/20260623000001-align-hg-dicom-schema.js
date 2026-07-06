/**
 * Align hg_dicom_* tables with HyperGrid DICOMweb route runtime schema.
 * Safe to re-run: uses IF NOT EXISTS / conditional alters.
 */
export async function up(queryInterface, Sequelize) {
  const qi = queryInterface;
  const sql = Sequelize;

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS hg_dicom_studies (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      patient_id BIGINT,
      patient_name VARCHAR(300),
      patient_dob DATE,
      patient_sex CHAR(1),
      accession_number VARCHAR(100),
      study_date DATE,
      study_description VARCHAR(300),
      modality VARCHAR(20),
      modalities JSONB NOT NULL DEFAULT '[]',
      referring_physician VARCHAR(200),
      institution VARCHAR(200),
      num_instances INT NOT NULL DEFAULT 0,
      store_path VARCHAR(500),
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
  `);

  await qi.sequelize.query(`
    DO $$ BEGIN
      ALTER TABLE hg_dicom_studies ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(200);
      ALTER TABLE hg_dicom_studies ADD COLUMN IF NOT EXISTS modality VARCHAR(20);
      ALTER TABLE hg_dicom_studies ADD COLUMN IF NOT EXISTS created_by BIGINT;
      ALTER TABLE hg_dicom_studies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    EXCEPTION WHEN others THEN NULL; END $$;
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hg_dicom_study_uid_tenant
      ON hg_dicom_studies(study_instance_uid, tenant_id);
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS hg_dicom_instances (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      series_instance_uid VARCHAR(200),
      sop_instance_uid VARCHAR(200) NOT NULL,
      sop_class_uid VARCHAR(200),
      modality VARCHAR(20),
      instance_number INT,
      file_path VARCHAR(500) NOT NULL,
      file_size BIGINT,
      content_type VARCHAR(120) DEFAULT 'application/dicom',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await qi.sequelize.query(`
    DO $$ BEGIN
      ALTER TABLE hg_dicom_instances ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(200);
      ALTER TABLE hg_dicom_instances ADD COLUMN IF NOT EXISTS series_instance_uid VARCHAR(200);
      ALTER TABLE hg_dicom_instances ADD COLUMN IF NOT EXISTS sop_instance_uid VARCHAR(200);
      ALTER TABLE hg_dicom_instances ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
      ALTER TABLE hg_dicom_instances ADD COLUMN IF NOT EXISTS content_type VARCHAR(120);
    EXCEPTION WHEN others THEN NULL; END $$;
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hg_dicom_sop_tenant
      ON hg_dicom_instances(sop_instance_uid, tenant_id);
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_hg_dicom_inst_study_uid
      ON hg_dicom_instances(study_instance_uid, tenant_id);
  `);
  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_hg_dicom_inst_series
      ON hg_dicom_instances(series_instance_uid);
  `);

  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS hg_dicom_reports (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      study_instance_uid VARCHAR(200) NOT NULL,
      radiologist_id BIGINT,
      radiologist_name VARCHAR(200),
      findings TEXT,
      impression TEXT,
      recommendations TEXT,
      reported_by BIGINT,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      reported_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
  `);

  await qi.sequelize.query(`
    DO $$ BEGIN
      ALTER TABLE hg_dicom_reports ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(200);
      ALTER TABLE hg_dicom_reports ADD COLUMN IF NOT EXISTS tenant_id BIGINT;
      ALTER TABLE hg_dicom_reports ADD COLUMN IF NOT EXISTS reported_by BIGINT;
      ALTER TABLE hg_dicom_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    EXCEPTION WHEN others THEN NULL; END $$;
  `);

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hg_dicom_report_study_tenant
      ON hg_dicom_reports(study_instance_uid, tenant_id);
  `);

  await qi.sequelize.query(`
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
      scheduled_date DATE,
      scheduled_time TIME,
      station_name VARCHAR(100),
      referring_physician VARCHAR(200),
      priority VARCHAR(40) DEFAULT 'routine',
      status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
      study_instance_uid VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await qi.sequelize.query(`
    DO $$ BEGIN
      ALTER TABLE hg_dicom_worklist ADD COLUMN IF NOT EXISTS scheduled_time TIME;
      ALTER TABLE hg_dicom_worklist ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(200);
    EXCEPTION WHEN others THEN NULL; END $$;
  `);

  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_hg_worklist_tenant ON hg_dicom_worklist(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_hg_worklist_date ON hg_dicom_worklist(scheduled_date);
  `);
}

export async function down() {
  // Non-destructive migration — tables shared with production data.
}
