/**
 * Queue check-in idempotency.
 * A client retry returns the original queue entry instead of issuing a second
 * public token. The request hash prevents accidental key reuse with a
 * different patient or appointment payload.
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    ALTER TABLE hospital_queue_entries
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
      ADD COLUMN IF NOT EXISTS request_hash CHAR(64);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_hqe_org_idempotency_key
      ON hospital_queue_entries (organization_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
  console.log('[migration] hospital queue check-in idempotency ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

