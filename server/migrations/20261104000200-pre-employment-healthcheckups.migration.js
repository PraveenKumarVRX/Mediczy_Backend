/**
 * Candidate-first pre-employment medical examination (PEME) workflow.
 *
 * This deliberately has no FK to users, user_health_packages, or
 * corporate_health_reports: a candidate is not an employee and a PEME is not
 * an annual-health-checkup benefit.  HR receives only a workflow state and a
 * fitness disposition; clinical detail remains in the case record.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pre_employment_candidates (
      id BIGSERIAL PRIMARY KEY,
      corporate_id INTEGER NOT NULL REFERENCES corporates(id) ON DELETE RESTRICT,
      hr_candidate_id BIGINT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (corporate_id, hr_candidate_id)
    );

    CREATE TABLE IF NOT EXISTS pre_employment_cases (
      id UUID PRIMARY KEY,
      corporate_id INTEGER NOT NULL REFERENCES corporates(id) ON DELETE RESTRICT,
      candidate_id BIGINT NOT NULL REFERENCES pre_employment_candidates(id) ON DELETE RESTRICT,
      requisition_id BIGINT,
      position_title TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','invited','consent_pending','consented','scheduled','in_progress','clinical_review','completed','cancelled','expired')),
      invitation_hash CHAR(64),
      invitation_expires_at TIMESTAMPTZ,
      invitation_used_at TIMESTAMPTZ,
      consent_version VARCHAR(80),
      consented_at TIMESTAMPTZ,
      consent_ip_hash CHAR(64),
      appointment_at TIMESTAMPTZ,
      venue JSONB NOT NULL DEFAULT '{}'::jsonb,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      clinical_reviewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fitness_status VARCHAR(40) CHECK (fitness_status IN ('pending','fit','fit_with_restrictions','temporarily_unfit','unfit')),
      fitness_issued_at TIMESTAMPTZ,
      clinical_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((status NOT IN ('consented','scheduled','in_progress','clinical_review','completed')) OR consented_at IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_peme_cases_corporate_status
      ON pre_employment_cases(corporate_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_peme_cases_candidate
      ON pre_employment_cases(candidate_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_peme_active_invitation
      ON pre_employment_cases(invitation_hash) WHERE invitation_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS pre_employment_case_events (
      id BIGSERIAL PRIMARY KEY,
      case_id UUID NOT NULL REFERENCES pre_employment_cases(id) ON DELETE CASCADE,
      actor_type VARCHAR(30) NOT NULL CHECK (actor_type IN ('candidate','hr','clinical','system')),
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_type VARCHAR(80) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_peme_case_events_case ON pre_employment_case_events(case_id, created_at DESC);
  `);
}

export async function down(db = pool) {
  await db.query(`
    DROP TABLE IF EXISTS pre_employment_case_events;
    DROP TABLE IF EXISTS pre_employment_cases;
    DROP TABLE IF EXISTS pre_employment_candidates;
  `);
}

if (process.argv.slice(1).some((arg) => arg.endsWith('20261104000200-pre-employment-healthcheckups.migration.js'))) {
  up().then(() => { console.log('pre-employment healthcheckups migration applied'); process.exit(0); })
    .catch((error) => { console.error(error); process.exit(1); });
}
