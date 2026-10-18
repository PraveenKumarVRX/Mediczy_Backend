/**
 * Migration: Field Force Phase 2 — Travel, Expenses
 * ===================================================
 * Tables:
 *   field_travel_requests  — per-trip travel authorisation (pre-trip)
 *   field_expense_claims   — expense claim header (post-trip)
 *   field_expense_items    — line items on a claim
 *
 * Safe to re-run (IF NOT EXISTS throughout).
 */

import pool from '../db/pgPool.js';

async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS field_travel_requests (
      id                BIGSERIAL PRIMARY KEY,
      user_id           INT NOT NULL,
      travel_date       DATE NOT NULL,
      from_location     TEXT NOT NULL,
      to_location       TEXT NOT NULL,
      purpose           TEXT NOT NULL,
      mode_of_transport VARCHAR(40)  -- 'own_vehicle','train','bus','flight','auto','other'
        CHECK (mode_of_transport IN ('own_vehicle','train','bus','flight','auto','cab','other')),
      estimated_km      DECIMAL(8,2),
      estimated_amount  DECIMAL(10,2),
      advance_requested DECIMAL(10,2) DEFAULT 0,
      status            VARCHAR(30) DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','cancelled')),
      approved_by       INT,
      approved_at       TIMESTAMPTZ,
      rejection_reason  TEXT,
      linked_visit_ids  BIGINT[],        -- field_visits this trip is for
      camp_id           INT,             -- health_camps.id if camp-related
      notes             TEXT,
      tenant_id         INT NOT NULL DEFAULT 1,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS field_expense_claims (
      id                BIGSERIAL PRIMARY KEY,
      user_id           INT NOT NULL,
      travel_request_id BIGINT REFERENCES field_travel_requests(id),
      claim_month       VARCHAR(7) NOT NULL,   -- YYYY-MM
      title             VARCHAR(255) NOT NULL,
      total_amount      DECIMAL(10,2) DEFAULT 0,
      approved_amount   DECIMAL(10,2),
      status            VARCHAR(30) DEFAULT 'draft'
        CHECK (status IN ('draft','submitted','under_review','approved','rejected','paid')),
      submitted_at      TIMESTAMPTZ,
      reviewed_by       INT,
      reviewed_at       TIMESTAMPTZ,
      rejection_reason  TEXT,
      payment_ref       VARCHAR(100),
      notes             TEXT,
      tenant_id         INT NOT NULL DEFAULT 1,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS field_expense_items (
      id            BIGSERIAL PRIMARY KEY,
      claim_id      BIGINT NOT NULL REFERENCES field_expense_claims(id) ON DELETE CASCADE,
      expense_date  DATE NOT NULL,
      category      VARCHAR(60) NOT NULL
        CHECK (category IN ('travel_km','fuel','train','bus','flight','cab','accommodation',
                            'meals','client_entertainment','stationery','courier','other')),
      description   TEXT,
      amount        DECIMAL(10,2) NOT NULL,
      receipt_url   TEXT,
      km_travelled  DECIMAL(8,2),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_travel_requests_user  ON field_travel_requests(user_id, travel_date DESC);
    CREATE INDEX IF NOT EXISTS idx_expense_claims_user   ON field_expense_claims(user_id, claim_month DESC);
    CREATE INDEX IF NOT EXISTS idx_expense_items_claim   ON field_expense_items(claim_id);
  `);
}

async function verify(client) {
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('field_travel_requests','field_expense_claims','field_expense_items')
  `);
  const names = rows.map(r => r.table_name);
  const expected = ['field_travel_requests','field_expense_claims','field_expense_items'];
  const missing = expected.filter(t => !names.includes(t));
  if (missing.length) throw new Error(`Tables still missing: ${missing.join(', ')}`);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await up(client);
  await verify(client);
  await client.query('COMMIT');
  console.log('✅  field-force-phase2 migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌  field-force-phase2 migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  process.exit(0);
}
