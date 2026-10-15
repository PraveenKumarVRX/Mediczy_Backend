import pool from '../db/pgPool.js';

/**
 * Migration-owned infection-control and mortuary workflow records.
 *
 * These tables intentionally keep the department workflows independent from
 * the legacy login models. Every operational row is tenant keyed, mutable
 * state is constrained, and idempotency keys are scoped to the organization.
 */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS infection_cases (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      case_number VARCHAR(64) NOT NULL,
      patient_id BIGINT,
      admission_id BIGINT,
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','confirmed','closed')),
      organism VARCHAR(160),
      source VARCHAR(80),
      onset_at TIMESTAMPTZ,
      confirmed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      closed_reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      idempotency_key VARCHAR(128),
      request_hash CHAR(64),
      created_by VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, case_number)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_infection_case_org_idempotency
      ON infection_cases (organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_infection_cases_org_status
      ON infection_cases (organization_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS infection_isolation_orders (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      case_id BIGINT NOT NULL REFERENCES infection_cases(id) ON DELETE CASCADE,
      precaution_type VARCHAR(40) NOT NULL,
      location VARCHAR(160),
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','released')),
      ordered_by VARCHAR(128) NOT NULL,
      released_by VARCHAR(128),
      released_at TIMESTAMPTZ,
      release_reason TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_infection_isolation_active
      ON infection_isolation_orders (organization_id, case_id)
      WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_infection_isolation_org_status
      ON infection_isolation_orders (organization_id, status, started_at DESC);

    CREATE TABLE IF NOT EXISTS infection_exposures (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      case_id BIGINT NOT NULL REFERENCES infection_cases(id) ON DELETE CASCADE,
      exposed_patient_id BIGINT,
      location VARCHAR(160),
      exposure_at TIMESTAMPTZ,
      risk_level VARCHAR(20) NOT NULL DEFAULT 'unknown'
        CHECK (risk_level IN ('low','medium','high','unknown')),
      status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','closed')),
      owner VARCHAR(128),
      due_at TIMESTAMPTZ,
      notes TEXT,
      closed_by VARCHAR(128),
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_infection_exposures_org_status
      ON infection_exposures (organization_id, status, due_at);

    CREATE TABLE IF NOT EXISTS infection_stewardship_reviews (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      case_id BIGINT NOT NULL REFERENCES infection_cases(id) ON DELETE CASCADE,
      antimicrobial VARCHAR(160) NOT NULL,
      indication TEXT,
      review_due_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','continued','narrowed','stopped','completed')),
      reviewed_by VARCHAR(128),
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_infection_stewardship_org_status
      ON infection_stewardship_reviews (organization_id, status, review_due_at);

    CREATE TABLE IF NOT EXISTS infection_audit_events (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id BIGINT NOT NULL,
      action VARCHAR(80) NOT NULL,
      actor VARCHAR(128),
      correlation_id VARCHAR(128),
      before_state JSONB,
      after_state JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_infection_audit_org_time
      ON infection_audit_events (organization_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS mortuary_deaths (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      death_number VARCHAR(64) NOT NULL,
      patient_id BIGINT,
      admission_id BIGINT,
      declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      declared_by VARCHAR(128) NOT NULL,
      death_type VARCHAR(20) NOT NULL DEFAULT 'clinical'
        CHECK (death_type IN ('clinical','medicolegal','unknown')),
      status VARCHAR(20) NOT NULL DEFAULT 'declared'
        CHECK (status IN ('declared','stored','released','cancelled')),
      legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
      legal_hold_reason TEXT,
      certificate_ref VARCHAR(160),
      next_of_kin JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      idempotency_key VARCHAR(128),
      request_hash CHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, death_number)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mortuary_death_org_idempotency
      ON mortuary_deaths (organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_mortuary_deaths_org_status
      ON mortuary_deaths (organization_id, status, declared_at DESC);

    CREATE TABLE IF NOT EXISTS mortuary_bodies (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      death_id BIGINT NOT NULL REFERENCES mortuary_deaths(id) ON DELETE RESTRICT,
      body_tag VARCHAR(96) NOT NULL,
      location VARCHAR(160),
      cold_room_slot VARCHAR(80),
      status VARCHAR(20) NOT NULL DEFAULT 'stored'
        CHECK (status IN ('stored','released','transferred','disposed')),
      sealed_at TIMESTAMPTZ,
      stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      released_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (organization_id, body_tag)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mortuary_body_one_per_death
      ON mortuary_bodies (organization_id, death_id)
      WHERE status <> 'disposed';
    CREATE INDEX IF NOT EXISTS idx_mortuary_bodies_org_status
      ON mortuary_bodies (organization_id, status, stored_at DESC);

    CREATE TABLE IF NOT EXISTS mortuary_handoffs (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      death_id BIGINT NOT NULL REFERENCES mortuary_deaths(id) ON DELETE RESTRICT,
      body_id BIGINT NOT NULL REFERENCES mortuary_bodies(id) ON DELETE RESTRICT,
      recipient_name VARCHAR(160) NOT NULL,
      recipient_type VARCHAR(60) NOT NULL,
      authorization_ref VARCHAR(160),
      witness_actor VARCHAR(128) NOT NULL,
      handed_over_by VARCHAR(128) NOT NULL,
      handed_over_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      UNIQUE (organization_id, body_id)
    );

    CREATE TABLE IF NOT EXISTS mortuary_audit_events (
      id BIGSERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id BIGINT NOT NULL,
      action VARCHAR(80) NOT NULL,
      actor VARCHAR(128),
      witness_actor VARCHAR(128),
      correlation_id VARCHAR(128),
      before_state JSONB,
      after_state JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mortuary_audit_org_time
      ON mortuary_audit_events (organization_id, created_at DESC);

    -- Legacy department login tables pre-date tenant scoping. Keep their
    -- credentials, but make the organization binding explicit so a login can
    -- never obtain an unscoped operational token.
    ALTER TABLE IF EXISTS "InfectionControls"
      ADD COLUMN IF NOT EXISTS organization_id INTEGER;
    ALTER TABLE IF EXISTS "Mortuaries"
      ADD COLUMN IF NOT EXISTS organization_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_infection_controls_org
      ON "InfectionControls" (organization_id);
    CREATE INDEX IF NOT EXISTS idx_mortuaries_org
      ON "Mortuaries" (organization_id);
  `);
  console.log('[migration] infection-control and mortuary workflows ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS mortuary_audit_events, mortuary_handoffs, mortuary_bodies,
      mortuary_deaths, infection_audit_events, infection_stewardship_reviews,
      infection_exposures, infection_isolation_orders, infection_cases CASCADE;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
