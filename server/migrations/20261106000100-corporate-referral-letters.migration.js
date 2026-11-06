/**
 * Corporate HR → lab authorised referral letters.
 *
 * Two tables:
 *   - corporate_referral_templates: one editable letter template per corporate
 *     (header/intro/footer/signatory). Owned & written by the corporate (HR) layer.
 *   - corporate_referral_letters: a letter issued for one employee with a test list,
 *     frozen snapshots (employee/lab/template) so an issued letter is reproducible and
 *     immune to later template/roster edits.
 *
 * Follows the health_checkup_bookings precedent: integer FKs + JSONB snapshots, no
 * unique_id / entity-uid twins (so scripts/ci/verify-entity-uid-rule.mjs stays green).
 *
 * Manual-run (like the other health-checkup migrations):
 *   node server/scripts/ssm-env-loader.mjs <migrate runner> 20261106000100-corporate-referral-letters.migration.js
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool = sharedPool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS corporate_referral_templates (
      id                 BIGSERIAL PRIMARY KEY,
      corporate_id       INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      name               VARCHAR(120) NOT NULL DEFAULT 'Default',
      header_text        TEXT,
      intro_paragraph    TEXT,
      body_note          TEXT,
      footer_text        TEXT,
      signatory_name     VARCHAR(160),
      signatory_title    VARCHAR(160),
      is_active          BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (corporate_id, name)
    );

    CREATE TABLE IF NOT EXISTS corporate_referral_letters (
      id                      BIGSERIAL PRIMARY KEY,
      reference_number        VARCHAR(40) NOT NULL UNIQUE,
      corporate_id            INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      template_id             BIGINT REFERENCES corporate_referral_templates(id) ON DELETE SET NULL,
      issued_by_user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      employee_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      corporate_employee_id   INTEGER NOT NULL REFERENCES corporate_employees(id) ON DELETE CASCADE,
      employee_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
      target_lab_partner_type VARCHAR(20),
      target_lab_partner_id   INTEGER,
      lab_snapshot            JSONB NOT NULL DEFAULT '{}'::jsonb,
      package_id              VARCHAR(150),
      tests                   JSONB NOT NULL DEFAULT '[]'::jsonb,
      valid_from              DATE,
      valid_until             DATE,
      notes                   TEXT,
      status                  VARCHAR(20) NOT NULL DEFAULT 'issued'
                                CHECK (status IN ('issued','revoked')),
      revoked_reason          TEXT,
      revoked_at              TIMESTAMPTZ,
      template_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
      pdf_path                TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_corp_referral_letters_corp   ON corporate_referral_letters(corporate_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_corp_referral_letters_emp    ON corporate_referral_letters(employee_user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_corp_referral_letters_roster ON corporate_referral_letters(corporate_employee_id);
  `);
}

export async function down(pool = sharedPool) {
  await pool.query(`
    DROP TABLE IF EXISTS corporate_referral_letters CASCADE;
    DROP TABLE IF EXISTS corporate_referral_templates CASCADE;
  `);
}
