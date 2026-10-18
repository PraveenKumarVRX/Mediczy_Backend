/**
 * Migration: Field Force — CRM Management Layer
 * ===============================================
 * Adds the tables needed by the Business Head's CRM-side view.
 *
 * Tables:
 *   field_territories   — zone/area assignments per field exec
 *   field_targets       — monthly KPI targets per exec (set by BH)
 *   field_leads         — leads generated from field visits → linked to crm_leads
 *   field_doctor_crm    — doctor relationship cards managed by the BH/BD team
 *
 * Also adds an `approved_by` / `approval_notes` flow to field_expense_claims
 * (safe ALTER ... ADD COLUMN IF NOT EXISTS).
 *
 * Safe to re-run.
 */

import pool from '../db/pgPool.js';

async function up(client) {
  // ── field_territories ────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_territories (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INT NOT NULL,           -- field exec
      territory   VARCHAR(255) NOT NULL,  -- e.g. 'South Chennai', 'Bandra West'
      description TEXT,
      city        VARCHAR(100),
      zone        VARCHAR(100),
      active      BOOLEAN DEFAULT TRUE,
      assigned_by INT NOT NULL,           -- CRM user (BH) who assigned
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      tenant_id   INT NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_territories_user   ON field_territories(user_id);
    CREATE INDEX IF NOT EXISTS idx_territories_tenant ON field_territories(tenant_id);
  `);

  // ── field_targets ─────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_targets (
      id                BIGSERIAL PRIMARY KEY,
      user_id           INT NOT NULL,
      month             VARCHAR(7) NOT NULL,         -- YYYY-MM
      visits_target     INT DEFAULT 0,
      doctors_target    INT DEFAULT 0,
      corporates_target INT DEFAULT 0,
      camps_target      INT DEFAULT 0,
      leads_target      INT DEFAULT 0,
      empanelment_target INT DEFAULT 0,
      revenue_target    DECIMAL(12,2) DEFAULT 0,
      set_by            INT NOT NULL,               -- CRM user who set this
      notes             TEXT,
      tenant_id         INT NOT NULL DEFAULT 1,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, month)
    );
    CREATE INDEX IF NOT EXISTS idx_targets_tenant ON field_targets(tenant_id, month);
  `);

  // ── field_leads ───────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_leads (
      id              BIGSERIAL PRIMARY KEY,
      visit_id        BIGINT REFERENCES field_visits(id),
      user_id         INT NOT NULL,              -- field exec who generated the lead
      entity_name     VARCHAR(255) NOT NULL,
      entity_type     VARCHAR(50),
      contact_name    VARCHAR(255),
      contact_phone   VARCHAR(20),
      contact_email   VARCHAR(255),
      designation     VARCHAR(100),
      lead_type       VARCHAR(40) DEFAULT 'corporate'
        CHECK (lead_type IN ('corporate','doctor_referral','empanelment','camp','insurance','other')),
      estimated_value DECIMAL(12,2),
      status          VARCHAR(30) DEFAULT 'new'
        CHECK (status IN ('new','contacted','qualified','proposal','negotiation','won','lost','parked')),
      crm_lead_id     INT,                        -- links to crm_leads.id when pushed to CRM pipeline
      notes           TEXT,
      follow_up_date  DATE,
      tenant_id       INT NOT NULL DEFAULT 1,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_field_leads_user   ON field_leads(user_id);
    CREATE INDEX IF NOT EXISTS idx_field_leads_tenant ON field_leads(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_field_leads_crm    ON field_leads(crm_lead_id) WHERE crm_lead_id IS NOT NULL;
  `);

  // ── field_doctor_crm ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_doctor_crm (
      id                      BIGSERIAL PRIMARY KEY,
      doctor_name             VARCHAR(255) NOT NULL,
      doctor_uid              VARCHAR(10),             -- entity_registry uid if doctor is in DB
      qualification           VARCHAR(100),
      specialty               VARCHAR(100),
      hospital_affiliation    VARCHAR(255),
      hospital_uid            VARCHAR(10),
      address                 TEXT,
      area                    VARCHAR(255),
      city                    VARCHAR(100),
      phone                   VARCHAR(20),
      email                   VARCHAR(255),
      opd_days                TEXT,                    -- e.g. 'Mon Wed Fri'
      avg_daily_patients      INT,
      referral_potential      VARCHAR(20) DEFAULT 'medium'
        CHECK (referral_potential IN ('low','medium','high','champion')),
      relationship_status     VARCHAR(30) DEFAULT 'prospect'
        CHECK (relationship_status IN ('prospect','contacted','visiting','active_referrer',
                                       'champion','inactive','competitor_locked')),
      visit_frequency_target  INT DEFAULT 1,           -- visits per month
      last_visit_date         DATE,
      next_visit_date         DATE,
      services_interested     TEXT[],
      key_pain_points         TEXT,
      notes                   TEXT,
      assigned_exec_id        INT,                     -- which field exec manages this doctor
      tags                    TEXT[],
      tenant_id               INT NOT NULL DEFAULT 1,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_doctor_crm_tenant   ON field_doctor_crm(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_doctor_crm_exec     ON field_doctor_crm(assigned_exec_id);
    CREATE INDEX IF NOT EXISTS idx_doctor_crm_status   ON field_doctor_crm(relationship_status);
  `);

  // ── expense claim approval columns (idempotent) ───────────────────────────
  await client.query(`
    ALTER TABLE field_expense_claims
      ADD COLUMN IF NOT EXISTS approval_notes TEXT;
  `);

  // ── field_visits: add lead_count helper ───────────────────────────────────
  await client.query(`
    ALTER TABLE field_visits
      ADD COLUMN IF NOT EXISTS lead_id BIGINT REFERENCES field_leads(id);
  `);
}

async function verify(client) {
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('field_territories','field_targets','field_leads','field_doctor_crm')
  `);
  const names = rows.map(r => r.table_name);
  const expected = ['field_territories','field_targets','field_leads','field_doctor_crm'];
  const missing = expected.filter(t => !names.includes(t));
  if (missing.length) throw new Error(`Tables still missing: ${missing.join(', ')}`);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await up(client);
  await verify(client);
  await client.query('COMMIT');
  console.log('✅  field-force-crm migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌  field-force-crm migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  process.exit(0);
}
