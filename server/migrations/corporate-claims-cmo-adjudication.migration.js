/**
 * Adds a corporate-internal claims adjudication path alongside the existing
 * TPA path. insurance_claims already has tpa_id (external TPA routing) and
 * approved_amount/rejection_reason/status for the outcome — this migration
 * only adds the audit trail for a corporate's own Chief Medical Officer
 * (role: corporate_cmo, see corporate-hr-hierarchy.migration.js for the
 * sibling corporate_admin/hr_staff roles) reviewing a claim directly,
 * instead of routing it to an external TPA.
 *
 * adjudication_route records which path actually reviewed the claim
 * ('tpa' | 'corporate_cmo'); the cmo_* columns are the CMO-specific
 * decision record. Approval here is scrutiny/record-keeping only — it does
 * not trigger any payment or wallet settlement (that stays a manual,
 * out-of-band step, same as the existing approve/reject flow).
 */

import pool from '../db/pgPool.js';

export async function runCorporateClaimsCmoAdjudicationMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE insurance_claims
        ADD COLUMN IF NOT EXISTS adjudication_route VARCHAR(20),
        ADD COLUMN IF NOT EXISTS cmo_reviewed_by INTEGER,
        ADD COLUMN IF NOT EXISTS cmo_review_status VARCHAR(30),
        ADD COLUMN IF NOT EXISTS cmo_notes TEXT,
        ADD COLUMN IF NOT EXISTS cmo_reviewed_at TIMESTAMPTZ
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_insurance_claims_adjudication_route
        ON insurance_claims (organization_id, adjudication_route)
        WHERE adjudication_route IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('✅ corporate-claims-cmo-adjudication migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ corporate-claims-cmo-adjudication migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
