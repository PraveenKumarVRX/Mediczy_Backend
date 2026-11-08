/**
 * RCM / AR depth — Phase 1.
 *
 * Adds short-payment (underpayment) detection fields to era_remittances so the
 * ERA posting path can flag when a payer's payment + explained adjustments +
 * patient responsibility do not account for the claim amount. These feed the
 * new short-payments review list and (in Phase 2) auto-created AR work-items.
 *
 *   expected_amount  — amount expected from the payer after patient responsibility
 *                      and posted adjustments (the "clean" payable)
 *   shortfall_amount — expected_amount − payment_amount (0 when fully/over paid)
 *   short_paid       — true when shortfall_amount exceeds the rounding tolerance
 *
 * era_remittances is not an entity table and carries no RLS, so plain columns are
 * correct here (no unique_id / uid-rule attachment needed).
 *
 * Manual-run:
 *   node server/scripts/ssm-env-loader.mjs server/scripts/run-one-migration.mjs \
 *     migrations/20261107000100-rcm-ar-depth-phase1.migration.js
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool = sharedPool) {
  await pool.query(`
    ALTER TABLE era_remittances
      ADD COLUMN IF NOT EXISTS expected_amount  NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS shortfall_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS short_paid       BOOLEAN       NOT NULL DEFAULT FALSE;

    -- Fast lookup of open short-payments per hospital for the review list.
    CREATE INDEX IF NOT EXISTS idx_era_short_paid
      ON era_remittances(hospital_id, posted_at DESC)
      WHERE short_paid = TRUE;
  `);
  return { ok: true };
}

export default { up };
