/**
 * Makes each GRN receipt line idempotent when it is posted to the inventory
 * ledger.  Previous versions used the GRN header as the ledger reference,
 * which could not distinguish a complete posting from a partially completed
 * loop after a process failure.
 */
import pool from '../db/pgPool.js';
import { scmScope } from '../services/scm-tenant-scope.service.js';

export async function up() {
  await pool.query(`
    ALTER TABLE scm_inventory_ledger
      ADD COLUMN IF NOT EXISTS grn_line_id INTEGER REFERENCES scm_grn_lines(id) ON DELETE RESTRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_scm_inventory_ledger_grn_line
      ON scm_inventory_ledger (grn_line_id)
      WHERE grn_line_id IS NOT NULL;
  `);
  await scmScope.apply(pool, (message) => console.log('[SCM receipt integrity]', message));
}

export async function down() {
  await pool.query(`
    DROP INDEX IF EXISTS uq_scm_inventory_ledger_grn_line;
    ALTER TABLE scm_inventory_ledger DROP COLUMN IF EXISTS grn_line_id;
  `);
}

if (process.argv[1] && process.argv[1].includes('20261109000100-scm-receipt-integrity')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
