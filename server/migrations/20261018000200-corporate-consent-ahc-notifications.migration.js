/**
 * Corporate HR portal — consent/audit logs, AHC management, notification enhancements.
 *
 * New tables:
 *   corporate_employee_consents      — employee consent records (GDPR/health data)
 *   corporate_report_access_log      — audit trail of every report view/download
 *   corporate_ahc_batches            — annual health checkup scheduling cycles
 *   corporate_ahc_enrollments        — per-employee assignment within a batch
 *   corporate_ahc_dependents         — dependent family members in AHC
 *   corporate_notification_templates — HR-defined reminder templates
 *
 * Columns added to existing table:
 *   corporate_notifications.action_url   — optional deep-link on notification click
 *   corporate_notifications.employee_id  — optional per-employee targeting
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    -- ─── Consent records ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS corporate_employee_consents (
      id            BIGSERIAL PRIMARY KEY,
      corporate_id  INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      employee_id   VARCHAR(100) NOT NULL,
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      consent_type  VARCHAR(50)  NOT NULL DEFAULT 'health_data',
      granted       BOOLEAN      NOT NULL DEFAULT false,
      granted_at    TIMESTAMPTZ,
      revoked_at    TIMESTAMPTZ,
      version       INTEGER      NOT NULL DEFAULT 1,
      ip_address    VARCHAR(45),
      notes         TEXT,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (corporate_id, employee_id, consent_type)
    );
    CREATE INDEX IF NOT EXISTS idx_corp_consent_corp
      ON corporate_employee_consents(corporate_id, granted);

    -- ─── Report access audit log ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS corporate_report_access_log (
      id              BIGSERIAL PRIMARY KEY,
      corporate_id    INTEGER      NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      report_id       VARCHAR(100),
      report_title    VARCHAR(255),
      accessed_by_type VARCHAR(30) NOT NULL DEFAULT 'hr',
      accessed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      accessed_by_name VARCHAR(255),
      action          VARCHAR(30)  NOT NULL DEFAULT 'view',
      ip_address      VARCHAR(45),
      accessed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_corp_audit_corp
      ON corporate_report_access_log(corporate_id, accessed_at DESC);

    -- ─── AHC batches ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS corporate_ahc_batches (
      id                  BIGSERIAL PRIMARY KEY,
      corporate_id        INTEGER      NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      batch_name          VARCHAR(255) NOT NULL,
      batch_year          INTEGER      NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::int,
      scheduled_date      DATE,
      due_date            DATE         NOT NULL,
      status              VARCHAR(30)  NOT NULL DEFAULT 'planning'
                            CHECK (status IN ('planning','active','completed','cancelled')),
      priority            VARCHAR(20)  NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('normal','high','urgent')),
      notes               TEXT,
      target_departments  TEXT[],
      eligibility_criteria JSONB       NOT NULL DEFAULT '{}'::jsonb,
      created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ahc_batches_corp
      ON corporate_ahc_batches(corporate_id, status, batch_year DESC);

    -- ─── AHC enrollments ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS corporate_ahc_enrollments (
      id              BIGSERIAL PRIMARY KEY,
      batch_id        BIGINT       NOT NULL REFERENCES corporate_ahc_batches(id) ON DELETE CASCADE,
      corporate_id    INTEGER      NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      employee_id     VARCHAR(100) NOT NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      employee_name   VARCHAR(255),
      department      VARCHAR(255),
      status          VARCHAR(30)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','invited','booked','completed','skipped')),
      booked_date     DATE,
      booked_slot     VARCHAR(100),
      report_ready    BOOLEAN      NOT NULL DEFAULT false,
      report_url      TEXT,
      reminder_sent_at TIMESTAMPTZ,
      notes           TEXT,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (batch_id, employee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ahc_enrollments_batch
      ON corporate_ahc_enrollments(batch_id, status);
    CREATE INDEX IF NOT EXISTS idx_ahc_enrollments_corp
      ON corporate_ahc_enrollments(corporate_id, employee_id);

    -- ─── AHC dependents ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS corporate_ahc_dependents (
      id            BIGSERIAL PRIMARY KEY,
      enrollment_id BIGINT       NOT NULL REFERENCES corporate_ahc_enrollments(id) ON DELETE CASCADE,
      name          VARCHAR(255) NOT NULL,
      relationship  VARCHAR(50)  NOT NULL,
      date_of_birth DATE,
      gender        VARCHAR(20),
      status        VARCHAR(30)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','booked','completed','skipped')),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ahc_dependents_enroll
      ON corporate_ahc_dependents(enrollment_id);

    -- ─── Notification templates ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS corporate_notification_templates (
      id               BIGSERIAL PRIMARY KEY,
      corporate_id     INTEGER REFERENCES corporates(id) ON DELETE CASCADE,
      type             VARCHAR(50)  NOT NULL,
      title_template   VARCHAR(255) NOT NULL,
      message_template TEXT         NOT NULL,
      trigger_event    VARCHAR(50),
      days_before      INTEGER,
      enabled          BOOLEAN      NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    -- ─── Extend corporate_notifications ───────────────────────────────────────
    ALTER TABLE corporate_notifications
      ADD COLUMN IF NOT EXISTS action_url  TEXT,
      ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
  `);
}

export async function down(pool) {
  await pool.query(`
    DROP TABLE IF EXISTS corporate_ahc_dependents         CASCADE;
    DROP TABLE IF EXISTS corporate_ahc_enrollments        CASCADE;
    DROP TABLE IF EXISTS corporate_ahc_batches            CASCADE;
    DROP TABLE IF EXISTS corporate_report_access_log      CASCADE;
    DROP TABLE IF EXISTS corporate_employee_consents      CASCADE;
    DROP TABLE IF EXISTS corporate_notification_templates CASCADE;
    ALTER TABLE corporate_notifications
      DROP COLUMN IF EXISTS action_url,
      DROP COLUMN IF EXISTS employee_id;
  `);
}
