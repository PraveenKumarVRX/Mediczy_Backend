import pool from '../db/pgPool.js';

/** Migration-owned corporate referrals, eligibility and occupational-health schema. */
export async function up() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS corporate_referrals (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      patient_id          BIGINT NOT NULL,
      admission_id        BIGINT,
      corporate_name      TEXT NOT NULL,
      tpa_name            TEXT,
      policy_number       TEXT,
      employee_id         TEXT,
      referral_code       TEXT,
      pre_auth_number     TEXT,
      pre_auth_amount     NUMERIC(12,2),
      pre_auth_date       DATE,
      approved_procedures TEXT,
      referral_status     TEXT DEFAULT 'pending',  -- pending | approved | denied | expired
      denial_reason       TEXT,
      contacted_by        TEXT,
      contacted_at        TIMESTAMPTZ,
      notes               TEXT,
      referral_data       JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_corp_referral_patient ON corporate_referrals(patient_id);
    CREATE INDEX IF NOT EXISTS idx_corp_referral_admission ON corporate_referrals(admission_id);

    CREATE TABLE IF NOT EXISTS corporate_eligibility_checks (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      referral_id       BIGINT,
      corporate_name    TEXT,
      policy_number     TEXT,
      employee_id       TEXT,
      check_status      TEXT NOT NULL,  -- eligible | not_eligible | error | pending
      benefit_limit     NUMERIC(12,2),
      used_amount       NUMERIC(12,2),
      balance_amount    NUMERIC(12,2),
      deductible        NUMERIC(12,2),
      copay_percent     NUMERIC(5,2),
      exclusions        TEXT,
      checked_by        TEXT,
      response_data     JSONB DEFAULT '{}'::jsonb,
      checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eligibility_patient ON corporate_eligibility_checks(patient_id);

    CREATE TABLE IF NOT EXISTS fitness_certificates (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      certificate_type  TEXT DEFAULT 'fitness',  -- fitness | pre_employment | periodic | return_to_work | sick_leave
      issued_by         TEXT NOT NULL,
      doctor_reg_no     TEXT,
      patient_name      TEXT,
      employee_id       TEXT,
      employer_name     TEXT,
      job_description   TEXT,
      examination_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      fitness_status    TEXT NOT NULL,  -- fit | fit_with_restrictions | temporarily_unfit | permanently_unfit
      restrictions      TEXT,
      valid_from        DATE,
      valid_until       DATE,
      remarks           TEXT,
      certificate_data  JSONB DEFAULT '{}'::jsonb,
      signed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fitness_cert_patient ON fitness_certificates(patient_id);

    CREATE TABLE IF NOT EXISTS return_to_work_clearances (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      fitness_cert_id   BIGINT,
      issued_by         TEXT NOT NULL,
      employer_name     TEXT,
      return_date       DATE NOT NULL,
      full_duty         BOOLEAN DEFAULT TRUE,
      restricted_duty   TEXT,
      follow_up_date    DATE,
      clearance_notes   TEXT,
      signed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rtw_patient ON return_to_work_clearances(patient_id);
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS return_to_work_clearances CASCADE;
    DROP TABLE IF EXISTS fitness_certificates CASCADE;
    DROP TABLE IF EXISTS corporate_eligibility_checks CASCADE;
    DROP TABLE IF EXISTS corporate_referrals CASCADE;
  `);
}
