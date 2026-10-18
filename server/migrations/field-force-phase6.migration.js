/**
 * Smart Force Phase 6 — Remaining gap completions
 * CME, event budgets, notifications, offline sync log, telemetry,
 * health_camps campaign_type, field_sync_log.
 * Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // ── health_camps: campaign_type column ───────────────────────────────────────
  await client.query(`
    ALTER TABLE health_camps
      ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'health_camp'
        CHECK (campaign_type IN ('health_camp','cme','roundtable','rwa_camp','corporate_camp','other'))
  `);

  // ── CME events ───────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_cme_events (
      id                BIGSERIAL PRIMARY KEY,
      tenant_id         BIGINT NOT NULL,
      created_by        BIGINT NOT NULL,
      name              TEXT NOT NULL,
      event_type        TEXT NOT NULL DEFAULT 'cme'
        CHECK (event_type IN ('cme','roundtable','webinar','symposium','other')),
      scheduled_at      TIMESTAMPTZ NOT NULL,
      venue             TEXT,
      city              TEXT,
      max_attendees     INT,
      status            TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','ongoing','completed','cancelled')),
      budget_allocated  NUMERIC(14,2),
      compliance_notes  TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fce_tenant ON field_cme_events(tenant_id, status)`);

  // ── CME speakers (KOL ledger) ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_cme_speakers (
      id                  BIGSERIAL PRIMARY KEY,
      cme_event_id        BIGINT NOT NULL REFERENCES field_cme_events(id) ON DELETE CASCADE,
      doctor_crm_id       BIGINT REFERENCES field_doctor_crm(id),
      tenant_id           BIGINT NOT NULL,
      speaker_name        TEXT NOT NULL,
      speciality          TEXT,
      speaker_type        TEXT DEFAULT 'keynote'
        CHECK (speaker_type IN ('keynote','panelist','moderator','other')),
      honorarium          NUMERIC(10,2),
      compliance_cleared  BOOLEAN DEFAULT FALSE,
      notes               TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fcs_event  ON field_cme_speakers(cme_event_id)`);

  // ── CME attendees + QR checkin ────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_cme_attendees (
      id                BIGSERIAL PRIMARY KEY,
      cme_event_id      BIGINT NOT NULL REFERENCES field_cme_events(id) ON DELETE CASCADE,
      doctor_crm_id     BIGINT REFERENCES field_doctor_crm(id),
      tenant_id         BIGINT NOT NULL,
      invited_by        BIGINT NOT NULL,
      doctor_name       TEXT,
      phone             TEXT,
      invitation_sent_at TIMESTAMPTZ,
      qr_token          TEXT UNIQUE,
      attended          BOOLEAN DEFAULT FALSE,
      checkin_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fca_event  ON field_cme_attendees(cme_event_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fca_qr     ON field_cme_attendees(qr_token)`);

  // ── event budgets ─────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_event_budgets (
      id                BIGSERIAL PRIMARY KEY,
      camp_id           BIGINT,
      cme_event_id      BIGINT REFERENCES field_cme_events(id),
      tenant_id         BIGINT NOT NULL,
      created_by        BIGINT NOT NULL,
      approved_amount   NUMERIC(14,2) NOT NULL,
      utilized_amount   NUMERIC(14,2) DEFAULT 0,
      itemized_spend    JSONB DEFAULT '[]'::JSONB,
      roi_projection    TEXT,
      sponsorship_details JSONB DEFAULT '{}'::JSONB,
      status            TEXT DEFAULT 'draft'
        CHECK (status IN ('draft','submitted','approved','rejected')),
      approved_by       BIGINT,
      approved_at       TIMESTAMPTZ,
      notes             TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_feb_tenant ON field_event_budgets(tenant_id, status)`);

  // ── in-app notifications ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_notifications (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL,
      tenant_id   BIGINT NOT NULL,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      data        JSONB DEFAULT '{}'::JSONB,
      read        BOOLEAN DEFAULT FALSE,
      read_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fn_user   ON field_notifications(user_id, read)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fn_tenant ON field_notifications(tenant_id)`);

  // ── offline sync log (idempotency) ────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_sync_log (
      id              BIGSERIAL PRIMARY KEY,
      user_id         BIGINT NOT NULL,
      tenant_id       BIGINT NOT NULL,
      device_id       TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      operation       TEXT NOT NULL,
      payload         JSONB NOT NULL,
      status          TEXT DEFAULT 'processed'
        CHECK (status IN ('processed','failed','skipped')),
      result          JSONB,
      error_message   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (idempotency_key)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fsl_user   ON field_sync_log(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_fsl_device ON field_sync_log(device_id, created_at)`);

  // ── device telemetry ──────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_telemetry (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL,
      tenant_id     BIGINT NOT NULL,
      device_id     TEXT,
      app_version   TEXT,
      gps_accuracy  NUMERIC(8,2),
      cell_signal   INT,
      battery_pct   INT,
      network_type  TEXT,
      lat           NUMERIC(10,7),
      lng           NUMERIC(10,7),
      extras        JSONB DEFAULT '{}'::JSONB,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ft_user ON field_telemetry(user_id, created_at DESC)`);

  await client.query('COMMIT');
  console.log('✅  field-force-phase6 migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌  field-force-phase6 migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  process.exit(0);
}
