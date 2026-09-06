/**
 * Employee self-selectable wallet tiers on corporate benefit programs.
 *
 * Context: a corporate (e.g. an OPD wallet policy) can offer a base wallet
 * amount plus optional higher tiers that each employee opts into
 * individually — not a single flat amount HR sets for everyone. HR still
 * bulk-enrolls the whole roster at the base tier by default (existing
 * enroll flow, unchanged); employees then upgrade their own wallet to a
 * higher tier from their own portal.
 *
 * tier_options on corporate_benefit_programs is the menu HR configures at
 * program-creation time — an arbitrary list of {key, label, allocatedLimit,
 * isDefault} entries, e.g. a "Base" tier plus any number of higher
 * optional tiers, with whichever amounts a given deal actually needs.
 * Shape (illustrative only — no fixed set of tiers or amounts):
 *   [
 *     {"key":"base",  "label":"Base",   "allocatedLimit":<amount>, "isDefault":true},
 *     {"key":"tier1", "label":"Tier 1", "allocatedLimit":<amount>}
 *   ]
 * tier_key on employee_benefit_wallets records which tier a given wallet
 * is currently enrolled at (nullable — existing/flat-amount programs never
 * set it and keep working exactly as before).
 */

import pool from '../db/pgPool.js';

export async function runCorporateBenefitTiersMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE corporate_benefit_programs
        ADD COLUMN IF NOT EXISTS tier_options JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    await client.query(`
      ALTER TABLE employee_benefit_wallets
        ADD COLUMN IF NOT EXISTS tier_key VARCHAR(50)
    `);

    await client.query('COMMIT');
    console.log('✅ corporate-benefit-tiers migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ corporate-benefit-tiers migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
