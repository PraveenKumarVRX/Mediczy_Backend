/**
 * Admin-side corporate OPD/wellness wallet quoting tool — closes the
 * "no automated quote/pricing tool" and "no proposal document" gaps
 * identified against SEIT's OPD wallet request (2026-09-06).
 *
 * Deliberately NOT tied to the `corporates` table — a quote is for a
 * prospect that may never sign, and shouldn't create/pollute a real
 * customer record. Pricing model (documented in
 * services/corporate-quote-calculator.service.js):
 *   wallet funding (pass-through, employer's actual liability) at the
 *   base tier for every employee, plus an expected-uptake-weighted
 *   incremental cost for each optional higher tier, plus Mediqzy's own
 *   admin fee (%) and any flat per-employee category loading — this
 *   mirrors how Indian corporate OPD wallet administration is commonly
 *   priced (wallet funding is the employer's money passing through;
 *   the admin fee is Mediqzy's actual revenue).
 */

import pool from '../db/pgPool.js';

export async function runCorporateQuotesMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_quotes (
        id                    BIGSERIAL PRIMARY KEY,
        prospect_name         VARCHAR(255) NOT NULL,
        contact_name          VARCHAR(255),
        contact_email         VARCHAR(255),
        contact_phone         VARCHAR(30),
        employee_count        INTEGER NOT NULL CHECK (employee_count > 0),
        categories            JSONB NOT NULL DEFAULT '[]'::jsonb,
        tier_options          JSONB NOT NULL DEFAULT '[]'::jsonb,
        assumed_uptake        JSONB NOT NULL DEFAULT '{}'::jsonb,
        admin_fee_percent     NUMERIC(5,2) NOT NULL DEFAULT 8.00 CHECK (admin_fee_percent >= 0),
        category_loading_per_employee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (category_loading_per_employee >= 0),
        calculation           JSONB NOT NULL DEFAULT '{}'::jsonb,
        status                VARCHAR(20) NOT NULL DEFAULT 'draft',
        notes                 TEXT,
        created_by            BIGINT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_corporate_quotes_status
        ON corporate_quotes (status, created_at DESC)
    `);

    await client.query('COMMIT');
    console.log('✅ corporate-quotes migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ corporate-quotes migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
