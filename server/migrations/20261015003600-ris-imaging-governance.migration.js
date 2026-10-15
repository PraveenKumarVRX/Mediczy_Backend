import pool from '../db/pgPool.js';

/** Migration-owned RIS/PACS study, custody, QC, report-context and critical-alert schema. */
export async function up() {
  await pool.query(`

    CREATE TABLE IF NOT EXISTS ris_studies (
      id               BIGSERIAL PRIMARY KEY,
      lab_id           INTEGER NOT NULL,
      patient_id       INTEGER,
      patient_name     VARCHAR(255) NOT NULL,
      patient_dob      DATE,
      patient_sex      CHAR(1) DEFAULT 'U',
      accession_number VARCHAR(64),
      study_instance_uid VARCHAR(128),
      modality         VARCHAR(20) NOT NULL DEFAULT 'OT',
      body_part        VARCHAR(100),
      study_description VARCHAR(500),
      referring_physician VARCHAR(255),
      referring_doctor_id INTEGER,
      referring_doctor_name VARCHAR(255),
      study_date       DATE NOT NULL DEFAULT CURRENT_DATE,
      study_time       TIME,
      priority         VARCHAR(20) DEFAULT 'Routine' CHECK (priority IN ('STAT','Urgent','Routine')),
      status           VARCHAR(30) DEFAULT 'Ordered' CHECK (status IN ('Ordered','Scheduled','InProgress','Completed','Reported','Cancelled')),
      file_name        VARCHAR(500) NOT NULL,
      original_name    VARCHAR(500) NOT NULL,
      file_path        VARCHAR(1000) NOT NULL,
      file_size        INTEGER NOT NULL DEFAULT 0,
      mime_type        VARCHAR(100) NOT NULL,
      is_dicom         BOOLEAN DEFAULT FALSE,
      dicom_tags       JSONB DEFAULT '{}',
      series_count     INTEGER DEFAULT 1,
      image_count      INTEGER DEFAULT 1,
      report_text      TEXT,
      report_status    VARCHAR(20) DEFAULT 'Pending' CHECK (report_status IN ('Pending','Draft','Final','Addendum')),
      reported_by      VARCHAR(255),
      reported_at      TIMESTAMPTZ,
      notes            TEXT,
      tenant_id        INTEGER,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_lab_id    ON ris_studies(lab_id);
    CREATE INDEX IF NOT EXISTS idx_ris_patient    ON ris_studies(patient_name);
    CREATE INDEX IF NOT EXISTS idx_ris_modality   ON ris_studies(modality);
    CREATE INDEX IF NOT EXISTS idx_ris_status     ON ris_studies(status);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS series_instance_uid VARCHAR(128);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS sop_instance_uid VARCHAR(128);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS orthanc_study_id VARCHAR(64);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS orthanc_instance_id VARCHAR(64);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS pacs_source VARCHAR(20) DEFAULT 's3';
    CREATE INDEX IF NOT EXISTS idx_ris_study_date ON ris_studies(study_date DESC);
    -- Structured e-signature on the finalized report — separate from the
    -- free-text reported_by column so the sealing doctor's identity and
    -- credentials survive independently of display formatting.
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS report_signed_by_id INTEGER;
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS report_signed_by_name VARCHAR(255);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS report_signed_by_registration VARCHAR(100);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS report_signature_hash VARCHAR(128);
    ALTER TABLE ris_studies ADD COLUMN IF NOT EXISTS report_signed_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS ris_study_audit_events (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      actor_id INTEGER,
      actor_name VARCHAR(255),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_audit_study ON ris_study_audit_events(study_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ris_sample_custody_events (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      from_status VARCHAR(30),
      to_status VARCHAR(30) NOT NULL,
      reason VARCHAR(500),
      actor_id INTEGER,
      actor_name VARCHAR(255),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_custody_study ON ris_sample_custody_events(study_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ris_qc_reviews (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      qc_status VARCHAR(20) NOT NULL CHECK (qc_status IN ('Passed','Failed','NeedsReview')),
      review_notes TEXT,
      reviewed_by VARCHAR(255),
      reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_qc_study ON ris_qc_reviews(study_id, reviewed_at DESC);

    CREATE TABLE IF NOT EXISTS ris_result_context (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      reagent_lot_number VARCHAR(120) NOT NULL,
      calibration_reference VARCHAR(120) NOT NULL,
      context_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (study_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ris_result_context_study ON ris_result_context(study_id);

    CREATE TABLE IF NOT EXISTS ris_critical_value_alerts (
      id BIGSERIAL PRIMARY KEY,
      study_id BIGINT NOT NULL REFERENCES ris_studies(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL,
      alert_reason VARCHAR(500) NOT NULL,
      value_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Acknowledged','Escalated')),
      raised_by VARCHAR(255),
      raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      due_at TIMESTAMPTZ,
      acknowledged_by VARCHAR(255),
      acknowledged_at TIMESTAMPTZ,
      acknowledgment_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ris_critical_study ON ris_critical_value_alerts(study_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ris_critical_status ON ris_critical_value_alerts(lab_id, status, due_at);

    CREATE TABLE IF NOT EXISTS ris_qc_templates (
      id BIGSERIAL PRIMARY KEY,
      lab_id INTEGER NOT NULL,
      modality VARCHAR(20) NOT NULL,
      item_key VARCHAR(120) NOT NULL,
      item_label VARCHAR(255) NOT NULL,
      required BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lab_id, modality, item_key)
    );
    CREATE INDEX IF NOT EXISTS idx_ris_qc_template_modality ON ris_qc_templates(lab_id, modality, display_order);
  
  `);
  console.log('[migration] RIS imaging governance schema ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS ris_qc_templates CASCADE;
    DROP TABLE IF EXISTS ris_critical_value_alerts CASCADE;
    DROP TABLE IF EXISTS ris_result_context CASCADE;
    DROP TABLE IF EXISTS ris_qc_reviews CASCADE;
    DROP TABLE IF EXISTS ris_sample_custody_events CASCADE;
    DROP TABLE IF EXISTS ris_study_audit_events CASCADE;
    DROP TABLE IF EXISTS ris_studies CASCADE;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
