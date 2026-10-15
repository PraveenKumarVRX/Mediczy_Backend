import pool from '../db/pgPool.js';

/** Migration-owned ABDM, HFR and HPR registration schema. */
export async function up() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS abha_registrations (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      patient_id      INTEGER,
      abha_number     VARCHAR(20) UNIQUE,
      abha_address    VARCHAR(100),
      health_id       VARCHAR(100),
      mobile          VARCHAR(15),
      name            TEXT,
      gender          VARCHAR(5),
      date_of_birth   DATE,
      verification_status VARCHAR(20) DEFAULT 'pending',
      linked_at       TIMESTAMPTZ,
      abdm_token      TEXT,
      abdm_token_exp  TIMESTAMPTZ,
      profile_json    JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS abdm_consents (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      patient_id      INTEGER,
      abha_number     VARCHAR(20),
      consent_id      VARCHAR(100) UNIQUE,
      consent_status  VARCHAR(20) DEFAULT 'requested',
      purpose_code    VARCHAR(20),
      hip_id          VARCHAR(100),
      hiu_id          VARCHAR(100),
      date_range_from DATE,
      date_range_to   DATE,
      expiry          TIMESTAMPTZ,
      hi_types        TEXT[],
      granted_at      TIMESTAMPTZ,
      revoked_at      TIMESTAMPTZ,
      artifact_json   JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS abdm_phi_requests (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      consent_id      VARCHAR(100) REFERENCES abdm_consents(consent_id),
      transaction_id  VARCHAR(100) UNIQUE,
      request_status  VARCHAR(20) DEFAULT 'initiated',
      care_context    TEXT,
      fhir_bundle     JSONB,
      requested_at    TIMESTAMPTZ DEFAULT NOW(),
      received_at     TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS hfr_facility_registrations (
      id                BIGSERIAL PRIMARY KEY,
      tenant_id         INTEGER NOT NULL UNIQUE,
      facility_id       VARCHAR(50),
      facility_name     TEXT NOT NULL,
      registration_status VARCHAR(20) DEFAULT 'pending',
      response_json     JSONB,
      registered_at     TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hpr_provider_registrations (
      id                BIGSERIAL PRIMARY KEY,
      tenant_id         INTEGER NOT NULL,
      doctor_id         INTEGER,
      hpr_id            VARCHAR(50),
      provider_name     TEXT NOT NULL,
      registration_status VARCHAR(20) DEFAULT 'pending',
      response_json     JSONB,
      registered_at     TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, doctor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_abha_tenant     ON abha_registrations(tenant_id, abha_number);
    CREATE INDEX IF NOT EXISTS idx_abdm_consent_pat ON abdm_consents(patient_id, consent_status);
    CREATE INDEX IF NOT EXISTS idx_abdm_phi_consent ON abdm_phi_requests(consent_id, request_status);
    CREATE INDEX IF NOT EXISTS idx_hpr_tenant ON hpr_provider_registrations(tenant_id, registration_status);
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS hpr_provider_registrations CASCADE;
    DROP TABLE IF EXISTS hfr_facility_registrations CASCADE;
    DROP TABLE IF EXISTS abdm_phi_requests CASCADE;
    DROP TABLE IF EXISTS abdm_consents CASCADE;
    DROP TABLE IF EXISTS abha_registrations CASCADE;
  `);
}
