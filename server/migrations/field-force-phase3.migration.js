/**
 * Migration: Field Force Phase 3 — Empanelment Pipeline + Outreach Accounts
 * ===========================================================================
 * Tables:
 *   field_empanelment_applications — hospital's BD pipeline for getting listed with insurers/TPAs
 *   field_empanelment_milestones   — step-by-step progress on each application
 *   outreach_accounts              — NGO / RWA / Govt org contact registry for field BD
 *
 * Safe to re-run (IF NOT EXISTS throughout).
 */

import pool from '../db/pgPool.js';

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_empanelment_applications (
      id                  BIGSERIAL PRIMARY KEY,
      insurer_name        VARCHAR(255) NOT NULL,       -- star health, care health, CGHS, etc.
      insurer_type        VARCHAR(40)
        CHECK (insurer_type IN ('private_insurer','tpa','government','esic','cghs','echs','other')),
      insurer_uid         VARCHAR(10),                  -- entity_registry uid if insurer is in DB
      contact_person      VARCHAR(255),
      contact_phone       VARCHAR(20),
      contact_email       VARCHAR(255),
      panel_type          VARCHAR(40) DEFAULT 'cashless'
        CHECK (panel_type IN ('cashless','reimbursement','both')),
      status              VARCHAR(40) DEFAULT 'identified'
        CHECK (status IN ('identified','contacted','document_collection','submitted',
                          'under_review','site_visit_scheduled','site_visit_done',
                          'approved','renewal_due','renewal_submitted','empanelled','rejected','on_hold')),
      target_date         DATE,
      empanelled_date     DATE,
      expiry_date         DATE,
      panel_code          VARCHAR(100),
      tariff_agreed       BOOLEAN DEFAULT FALSE,
      mou_signed          BOOLEAN DEFAULT FALSE,
      notes               TEXT,
      assigned_to         INT,          -- user_id of field exec managing this
      created_by          INT NOT NULL,
      tenant_id           INT NOT NULL DEFAULT 1,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS field_empanelment_milestones (
      id              BIGSERIAL PRIMARY KEY,
      application_id  BIGINT NOT NULL REFERENCES field_empanelment_applications(id) ON DELETE CASCADE,
      milestone       VARCHAR(100) NOT NULL,   -- e.g. 'Initial meeting', 'Documents submitted'
      status          VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending','in_progress','done','skipped')),
      due_date        DATE,
      completed_at    TIMESTAMPTZ,
      notes           TEXT,
      created_by      INT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS outreach_accounts (
      id              BIGSERIAL PRIMARY KEY,
      name            VARCHAR(255) NOT NULL,
      type            VARCHAR(40) NOT NULL
        CHECK (type IN ('ngo','rwa','government_hospital','govt_clinic','psu',
                        'school','college','defence','police','fire_dept','other_govt')),
      address         TEXT,
      area            VARCHAR(255),       -- locality / ward
      city            VARCHAR(100),
      pin_code        VARCHAR(10),
      primary_contact VARCHAR(255),
      contact_phone   VARCHAR(20),
      contact_email   VARCHAR(255),
      designation     VARCHAR(100),       -- contact's designation
      population_served INT,
      last_camp_date  DATE,
      next_followup_date DATE,
      relationship_status VARCHAR(30) DEFAULT 'prospect'
        CHECK (relationship_status IN ('prospect','contacted','active_partner',
                                       'camp_done','renewal','inactive')),
      tags            TEXT[],
      notes           TEXT,
      created_by      INT NOT NULL,
      tenant_id       INT NOT NULL DEFAULT 1,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_empanelment_tenant   ON field_empanelment_applications(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_empanelment_assigned ON field_empanelment_applications(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_milestones_app       ON field_empanelment_milestones(application_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_tenant      ON outreach_accounts(tenant_id, type);
  `);
}

async function verify(client) {
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('field_empanelment_applications','field_empanelment_milestones','outreach_accounts')
  `);
  const names = rows.map(r => r.table_name);
  const expected = ['field_empanelment_applications','field_empanelment_milestones','outreach_accounts'];
  const missing = expected.filter(t => !names.includes(t));
  if (missing.length) throw new Error(`Tables still missing: ${missing.join(', ')}`);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await up(client);
  await verify(client);
  await client.query('COMMIT');
  console.log('✅  field-force-phase3 migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌  field-force-phase3 migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  process.exit(0);
}
