import pool from '../db/pgPool.js';

/** Migration-owned patient experience / PREMS workflow. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prems_survey_invitations (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      patient_id VARCHAR(80),
      discharge_summary_id INTEGER,
      visit_type VARCHAR(24) NOT NULL DEFAULT 'ipd',
      channel VARCHAR(24) NOT NULL DEFAULT 'whatsapp',
      trigger_event VARCHAR(80) NOT NULL DEFAULT 'discharge_submitted',
      survey_version VARCHAR(40) NOT NULL DEFAULT 'v1',
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      consent_captured BOOLEAN NOT NULL DEFAULT FALSE,
      idempotency_key VARCHAR(160),
      sent_at TIMESTAMPTZ,
      response_due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE prems_survey_invitations ADD COLUMN IF NOT EXISTS trigger_event VARCHAR(80) NOT NULL DEFAULT 'discharge_submitted';
    ALTER TABLE prems_survey_invitations ADD COLUMN IF NOT EXISTS survey_version VARCHAR(40) NOT NULL DEFAULT 'v1';
    ALTER TABLE prems_survey_invitations ADD COLUMN IF NOT EXISTS consent_captured BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE prems_survey_invitations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
    ALTER TABLE prems_survey_invitations ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMPTZ;
    ALTER TABLE prems_survey_invitations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS prems_inv_discharge_once_idx ON prems_survey_invitations (hospital_id, discharge_summary_id) WHERE discharge_summary_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS prems_inv_idempotency_idx ON prems_survey_invitations (hospital_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS prems_inv_scope_status_idx ON prems_survey_invitations (hospital_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS prems_responses (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      invitation_id BIGINT REFERENCES prems_survey_invitations(id) ON DELETE SET NULL,
      patient_id VARCHAR(80),
      visit_type VARCHAR(24) NOT NULL DEFAULT 'opd',
      survey_version VARCHAR(40) NOT NULL DEFAULT 'v1',
      response_channel VARCHAR(24) NOT NULL DEFAULT 'hospital',
      department VARCHAR(120),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      nps_score SMALLINT CHECK (nps_score IS NULL OR nps_score BETWEEN 0 AND 10),
      communication_score INTEGER CHECK (communication_score IS NULL OR communication_score BETWEEN 1 AND 5),
      cleanliness_score INTEGER CHECK (cleanliness_score IS NULL OR cleanliness_score BETWEEN 1 AND 5),
      wait_time_score INTEGER CHECK (wait_time_score IS NULL OR wait_time_score BETWEEN 1 AND 5),
      comment TEXT,
      sentiment VARCHAR(24),
      consent_captured BOOLEAN NOT NULL DEFAULT FALSE,
      negative_followup BOOLEAN NOT NULL DEFAULT FALSE,
      complaint_ticket_id BIGINT,
      idempotency_key VARCHAR(160),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS invitation_id BIGINT;
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS survey_version VARCHAR(40) NOT NULL DEFAULT 'v1';
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS response_channel VARCHAR(24) NOT NULL DEFAULT 'hospital';
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS department VARCHAR(120);
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS nps_score SMALLINT;
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS sentiment VARCHAR(24);
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS consent_captured BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS complaint_ticket_id BIGINT;
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
    ALTER TABLE prems_responses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS prems_response_invitation_once_idx ON prems_responses (invitation_id) WHERE invitation_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS prems_response_idempotency_idx ON prems_responses (hospital_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS prems_response_scope_time_idx ON prems_responses (hospital_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS prems_response_scope_department_idx ON prems_responses (hospital_id, department, visit_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS ticket_sla (
      ticket_id TEXT PRIMARY KEY,
      severity TEXT NOT NULL CHECK (severity IN ('S0','S1','S2','S3')),
      confidence FLOAT,
      ai_component TEXT,
      feedback_type TEXT,
      evidence_quote TEXT,
      recommended_action TEXT,
      response_due_at TIMESTAMPTZ NOT NULL,
      resolution_due_at TIMESTAMPTZ NOT NULL,
      response_met_at TIMESTAMPTZ,
      resolution_met_at TIMESTAMPTZ,
      breached BOOLEAN NOT NULL DEFAULT FALSE,
      breach_type TEXT,
      notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tsla_open_breaches ON ticket_sla (breached, response_due_at, resolution_due_at) WHERE breached = FALSE;
  `);
  console.log('[migration] PREMS feedback workflow ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS prems_responses CASCADE, prems_survey_invitations CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
