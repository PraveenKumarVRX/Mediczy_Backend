/**
 * Migration: Module 24 — Corporate Account Layer
 * =================================================
 * Design source: docs discussion 2026-09-18 (UX/UI/CTO/Market design pass +
 * implementation plan Workstream 4). Fills the gap the audit found: the
 * `corporates` table had only a single `contractDocument` field, no MoU
 * versioning, no rate-card history, no account-level credit ledger, no
 * named SPOC, and no per-category employee consent grants.
 *
 * Not included here (deliberately): the green-channel visible queue-display
 * UI treatment — that's a UI/fairness decision the design doc flags as
 * pending real front-desk stakeholder input, not a schema question. The
 * backend priority-score parameter for it lives in hospital-queue.service.js
 * per the existing implementation plan note, not in this migration.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_mou (
        id               SERIAL PRIMARY KEY,
        corporate_id     INTEGER NOT NULL REFERENCES corporates(id),
        version          INT NOT NULL DEFAULT 1,
        terms            JSONB NOT NULL DEFAULT '{}'::jsonb,
        document_url     TEXT,
        effective_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        renewal_date     DATE,
        status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'superseded')),
        created_by       TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (corporate_id, version)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_mou_corp ON corporate_mou (corporate_id, status)`);
    console.log('✅ corporate_mou: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_rate_card_version (
        id               SERIAL PRIMARY KEY,
        corporate_id     INTEGER NOT NULL REFERENCES corporates(id),
        version          INT NOT NULL DEFAULT 1,
        rate_card        JSONB NOT NULL DEFAULT '{}'::jsonb,
        effective_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        created_by       TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (corporate_id, version)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_rate_card_corp ON corporate_rate_card_version (corporate_id, effective_date DESC)`);
    console.log('✅ corporate_rate_card_version: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_account_credit_ledger (
        id               SERIAL PRIMARY KEY,
        corporate_id     INTEGER NOT NULL UNIQUE REFERENCES corporates(id),
        credit_limit     NUMERIC(14,2) NOT NULL DEFAULT 0,
        current_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
        last_invoice_at  TIMESTAMPTZ,
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ corporate_account_credit_ledger: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_account_spoc (
        id               SERIAL PRIMARY KEY,
        corporate_id     INTEGER NOT NULL UNIQUE REFERENCES corporates(id),
        staff_user_id    INTEGER NOT NULL,
        assigned_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ corporate_account_spoc: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_consent_grant (
        id                 SERIAL PRIMARY KEY,
        employee_user_id   INTEGER NOT NULL,
        corporate_id       INTEGER NOT NULL REFERENCES corporates(id),
        data_category      TEXT NOT NULL CHECK (data_category IN ('fitness_certificate', 'checkup_summary', 'full_clinical_record')),
        granted            BOOLEAN NOT NULL DEFAULT false,
        granted_at         TIMESTAMPTZ,
        revoked_at         TIMESTAMPTZ,
        UNIQUE (employee_user_id, corporate_id, data_category)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_corp_consent_employee ON corporate_consent_grant (employee_user_id, corporate_id)`);
    console.log('✅ corporate_consent_grant: created — all categories default to NOT granted (opt-in only)');

    await client.query('COMMIT');
    console.log('✅ Corporate account layer migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS corporate_consent_grant');
    await client.query('DROP TABLE IF EXISTS corporate_account_spoc');
    await client.query('DROP TABLE IF EXISTS corporate_account_credit_ledger');
    await client.query('DROP TABLE IF EXISTS corporate_rate_card_version');
    await client.query('DROP TABLE IF EXISTS corporate_mou');
    await client.query('COMMIT');
    console.log('✅ Corporate account layer migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node corporate-account-layer.migration.js
if (process.argv[1] && process.argv[1].includes('corporate-account-layer')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
