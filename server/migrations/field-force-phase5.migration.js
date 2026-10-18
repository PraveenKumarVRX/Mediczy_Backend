/**
 * Smart Force Phase 5 — Gap completions
 * Covers: out-of-beat exceptions, tour plans, camp registrations,
 * gatekeeper intel, outreach permissions, collateral handovers,
 * visit enrichment columns, lead pipeline stages.
 * Safe to re-run (all DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // ── visit enrichment ────────────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE field_visits
      ADD COLUMN IF NOT EXISTS is_unplanned       BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS photo_proof_url     TEXT,
      ADD COLUMN IF NOT EXISTS planned_sequence    INT,
      ADD COLUMN IF NOT EXISTS estimated_arrival   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS visit_checklist     JSONB DEFAULT '[]'::JSONB,
      ADD COLUMN IF NOT EXISTS duration_seconds    INT,
      ADD COLUMN IF NOT EXISTS doctor_crm_id       BIGINT
  `);

  // ── lead pipeline enrichment ────────────────────────────────────────────────
  await client.query(`
    ALTER TABLE field_leads
      ADD COLUMN IF NOT EXISTS pipeline_stage   TEXT DEFAULT 'new'
        CHECK (pipeline_stage IN ('new','contacted','qualified','proposal','empanelment','closed_won','closed_lost')),
      ADD COLUMN IF NOT EXISTS stage_history    JSONB DEFAULT '[]'::JSONB,
      ADD COLUMN IF NOT EXISTS contract_value   NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS mou_document_url TEXT,
      ADD COLUMN IF NOT EXISTS closed_at        TIMESTAMPTZ
  `);

  // ── out-of-beat visit exceptions ────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_visit_exceptions (
      id                  BIGSERIAL PRIMARY KEY,
      visit_id            BIGINT REFERENCES field_visits(id) ON DELETE CASCADE,
      user_id             BIGINT NOT NULL,
      tenant_id           BIGINT NOT NULL,
      beat_territory_id   BIGINT,
      distance_breach_km  NUMERIC(8,2),
      reason              TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
      reviewed_by         BIGINT,
      reviewed_at         TIMESTAMPTZ,
      review_note         TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fve_user    ON field_visit_exceptions(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fve_tenant  ON field_visit_exceptions(tenant_id, status)`);

  // ── monthly tour plans ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_tour_plans (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL,
      tenant_id     BIGINT NOT NULL,
      month         DATE NOT NULL,
      beat_dates    JSONB DEFAULT '{}'::JSONB,
      notes         TEXT,
      status        TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','submitted','approved','rejected')),
      submitted_at  TIMESTAMPTZ,
      reviewed_by   BIGINT,
      reviewed_at   TIMESTAMPTZ,
      review_note   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, month)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ftp_tenant ON field_tour_plans(tenant_id, status)`);

  // ── health camp patient registrations ────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_camp_registrations (
      id               BIGSERIAL PRIMARY KEY,
      camp_id          BIGINT NOT NULL,
      tenant_id        BIGINT NOT NULL,
      registered_by    BIGINT NOT NULL,
      patient_name     TEXT NOT NULL,
      age              INT,
      gender           TEXT,
      phone            TEXT,
      address          TEXT,
      screening_notes  TEXT,
      high_risk_flag   BOOLEAN DEFAULT FALSE,
      referred_to      TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fcr_camp   ON field_camp_registrations(camp_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fcr_tenant ON field_camp_registrations(tenant_id)`);

  // ── doctor gatekeeper / relationship intel ───────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_doctor_intel (
      id               BIGSERIAL PRIMARY KEY,
      doctor_crm_id    BIGINT NOT NULL REFERENCES field_doctor_crm(id) ON DELETE CASCADE,
      tenant_id        BIGINT NOT NULL,
      gatekeeper_name  TEXT,
      gatekeeper_phone TEXT,
      opd_days         TEXT,
      best_visit_time  TEXT,
      notes            TEXT,
      updated_by       BIGINT,
      updated_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (doctor_crm_id)
    )
  `);

  // ── outreach / govt permissions ──────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_outreach_permissions (
      id               BIGSERIAL PRIMARY KEY,
      outreach_id      BIGINT,
      tenant_id        BIGINT NOT NULL,
      user_id          BIGINT NOT NULL,
      permission_type  TEXT NOT NULL
        CHECK (permission_type IN ('rwa','municipal','government','other')),
      authority_name   TEXT NOT NULL,
      reference_no     TEXT,
      valid_from       DATE,
      valid_until      DATE,
      status           TEXT DEFAULT 'pending'
        CHECK (status IN ('pending','active','expired','revoked')),
      document_url     TEXT,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fop_tenant ON field_outreach_permissions(tenant_id, status)`);

  // ── collateral / sample handovers ────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_handovers (
      id                    BIGSERIAL PRIMARY KEY,
      visit_id              BIGINT REFERENCES field_visits(id),
      doctor_crm_id         BIGINT REFERENCES field_doctor_crm(id),
      user_id               BIGINT NOT NULL,
      tenant_id             BIGINT NOT NULL,
      items                 JSONB NOT NULL DEFAULT '[]'::JSONB,
      digital_signature_url TEXT,
      geofence_verified     BOOLEAN DEFAULT FALSE,
      lat                   NUMERIC(10,7),
      lng                   NUMERIC(10,7),
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fh_visit  ON field_handovers(visit_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fh_tenant ON field_handovers(tenant_id)`);

  await client.query('COMMIT');
  console.log('✅  field-force-phase5 migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌  field-force-phase5 migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  process.exit(0);
}
