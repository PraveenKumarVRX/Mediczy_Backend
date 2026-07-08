/**
 * Migration: Insurance Claim Communications & Courier Tracking
 * =============================================================
 * Adds to insurance_claims:
 *   - courier_tracking   JSONB — physical document shipments to TPAs/insurers
 *   - notification_log   JSONB — WhatsApp/SMS patient status-update log
 *
 * Supports the insurance-desk "real-time status communication" and
 * "courier tracking" features (ClaimBook-parity gap).
 *
 * Run: node server/migrations/insurance-claim-comms.migration.js
 */
import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE insurance_claims
        ADD COLUMN IF NOT EXISTS courier_tracking JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS notification_log JSONB DEFAULT '[]'::jsonb
    `);
    console.log('[Migration] insurance_claims: courier_tracking + notification_log columns added');

    await client.query('COMMIT');
    console.log('✅ insurance-claim-comms migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] insurance-claim-comms migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE insurance_claims
        DROP COLUMN IF EXISTS courier_tracking,
        DROP COLUMN IF EXISTS notification_log
    `);
    await client.query('COMMIT');
    console.log('✅ insurance-claim-comms migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node insurance-claim-comms.migration.js
if (process.argv[1].includes('insurance-claim-comms')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
