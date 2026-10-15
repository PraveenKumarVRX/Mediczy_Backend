/**
 * Central-store traceability for receipts and stock balances.
 *
 * GRNs already capture batch and expiry, but the ledger previously discarded
 * them. Keep the receipt-to-stock chain queryable by warehouse, bin, lot, and
 * expiry without changing existing ledger rows.
 */
import pool from '../db/pgPool.js';
import { scmScope } from '../services/scm-tenant-scope.service.js';

export async function up() {
  await pool.query(`
    ALTER TABLE scm_grn_lines
      ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES scm_locations(id) ON DELETE SET NULL;
    ALTER TABLE scm_inventory_ledger
      ADD COLUMN IF NOT EXISTS batch_number VARCHAR(80),
      ADD COLUMN IF NOT EXISTS expiry_date DATE;
    CREATE INDEX IF NOT EXISTS idx_scm_ledger_item_lot_expiry
      ON scm_inventory_ledger (item_id, batch_number, expiry_date, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scm_grn_lines_location
      ON scm_grn_lines (warehouse_id, location_id, batch_number, expiry_date);
  `);
  // Re-apply the shared policy/foreign-reference trigger so the newly added
  // warehouse/location columns are protected by the same tenant checks.
  await scmScope.apply(pool, (message) => console.log('[SCM traceability]', message));
}

export async function down() {
  await pool.query(`
    DROP INDEX IF EXISTS idx_scm_ledger_item_lot_expiry;
    DROP INDEX IF EXISTS idx_scm_grn_lines_location;
    ALTER TABLE scm_inventory_ledger DROP COLUMN IF EXISTS batch_number, DROP COLUMN IF EXISTS expiry_date;
    ALTER TABLE scm_grn_lines DROP COLUMN IF EXISTS warehouse_id, DROP COLUMN IF EXISTS location_id;
  `);
}

if (process.argv[1] && process.argv[1].includes('20261015000400-scm-inventory-traceability')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
