import pool from '../db/pgPool.js';

/** Migration-owned team workspace, appointments, communications and token schema. */
export async function up() {
  await pool.query(`

CREATE TABLE IF NOT EXISTS team_refresh_tokens (
        id         BIGSERIAL   PRIMARY KEY,
        jti        UUID        NOT NULL UNIQUE,
        user_id    INTEGER     NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
        revoked_at TIMESTAMPTZ,
        device_fp  VARCHAR(64),
        ip_address VARCHAR(45)
      );
      CREATE INDEX IF NOT EXISTS idx_trt_jti     ON team_refresh_tokens(jti);
      CREATE INDEX IF NOT EXISTS idx_trt_user_id ON team_refresh_tokens(user_id);

      CREATE TABLE IF NOT EXISTS team_login_attempts (
        id         BIGSERIAL    PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        succeeded  BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tla_email_ts
        ON team_login_attempts(email, created_at);

      CREATE TABLE IF NOT EXISTS team_appointments (
        id               BIGSERIAL    PRIMARY KEY,
        doctor_id        INTEGER      NOT NULL,
        patient_email    VARCHAR(255) NOT NULL,
        appointment_date DATE         NOT NULL,
        appointment_time VARCHAR(20)  NOT NULL,
        type             VARCHAR(50)  NOT NULL DEFAULT 'consultation',
        notes            TEXT,
        status           VARCHAR(30)  NOT NULL DEFAULT 'confirmed',
        tenant_id        INTEGER,
        created_by       INTEGER      NOT NULL,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tappt_doctor  ON team_appointments(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_tappt_status  ON team_appointments(status);
      CREATE INDEX IF NOT EXISTS idx_tappt_tenant  ON team_appointments(tenant_id);

      CREATE TABLE IF NOT EXISTS team_communication_logs (
        id                  BIGSERIAL PRIMARY KEY,
        team_user_id        INTEGER NOT NULL,
        corporate_id        INTEGER,
        channel             VARCHAR(20) NOT NULL,
        recipient           VARCHAR(255) NOT NULL,
        recipient_mode      VARCHAR(30) NOT NULL DEFAULT 'single',
        template_id         VARCHAR(100),
        template_name       VARCHAR(150),
        subject             TEXT,
        message             TEXT,
        provider            VARCHAR(50),
        status              VARCHAR(20) NOT NULL,
        provider_message_id VARCHAR(255),
        error_message       TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tcomm_team_created   ON team_communication_logs(team_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tcomm_channel_status ON team_communication_logs(channel, status);
      CREATE INDEX IF NOT EXISTS idx_tcomm_corporate      ON team_communication_logs(corporate_id);

      CREATE TABLE IF NOT EXISTS team_communication_templates (
        id            BIGSERIAL PRIMARY KEY,
        team_user_id  INTEGER NOT NULL,
        corporate_id  INTEGER,
        channel       VARCHAR(20) NOT NULL,
        template_key  VARCHAR(120) NOT NULL,
        name          VARCHAR(150) NOT NULL,
        category      VARCHAR(80) NOT NULL DEFAULT 'General',
        subject       TEXT,
        content       TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (team_user_id, corporate_id, channel, template_key)
      );
      CREATE INDEX IF NOT EXISTS idx_tcomm_tpl_corporate ON team_communication_templates(corporate_id, channel);

      ALTER TABLE team_communication_logs
        ADD COLUMN IF NOT EXISTS ai_draft_id BIGINT;

      ALTER TABLE team_communication_templates
        ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual';
    

CREATE INDEX IF NOT EXISTS idx_ai_email_entity ON crm_ai_email_communications(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_team ON crm_ai_email_communications(created_by, entity_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_email_team_entity_created ON crm_ai_email_communications(created_by, entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_email_team_score_created ON crm_ai_email_communications(created_by, entity_type, engagement_score DESC, created_at DESC);
  
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS team_communication_templates CASCADE;
    DROP TABLE IF EXISTS team_communication_logs CASCADE;
    DROP TABLE IF EXISTS team_appointments CASCADE;
    DROP TABLE IF EXISTS team_login_attempts CASCADE;
    DROP TABLE IF EXISTS team_refresh_tokens CASCADE;
  `);
}
