/**
 * Immutable central-store inventory movements.
 * Movement headers provide idempotency and approval/audit context; ledger rows
 * remain the accounting source of truth for balances.
 */
import pool from '../db/pgPool.js';
import { scmScope } from '../services/scm-tenant-scope.service.js';

export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scm_inventory_movements (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER,
      movement_type VARCHAR(32) NOT NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'posted',
      reference_type VARCHAR(64),
      reference_id INTEGER,
      source_warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE SET NULL,
      source_location_id INTEGER REFERENCES scm_locations(id) ON DELETE SET NULL,
      destination_warehouse_id INTEGER REFERENCES scm_warehouses(id) ON DELETE SET NULL,
      destination_location_id INTEGER REFERENCES scm_locations(id) ON DELETE SET NULL,
      reason TEXT,
      created_by VARCHAR(160),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      posted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS scm_inventory_movement_lines (
      id SERIAL PRIMARY KEY,
      movement_id INTEGER NOT NULL REFERENCES scm_inventory_movements(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES scm_items(id) ON DELETE RESTRICT,
      quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
      unit_cost NUMERIC(12,2),
      batch_number VARCHAR(80),
      expiry_date DATE,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scm_inventory_movements_created
      ON scm_inventory_movements (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scm_inventory_movement_lines_item
      ON scm_inventory_movement_lines (item_id, batch_number, expiry_date);
  `);
  await scmScope.apply(pool, (message) => console.log('[SCM movements]', message));
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS scm_inventory_movement_lines, scm_inventory_movements CASCADE');
}

if (process.argv[1] && process.argv[1].includes('20261015000600-scm-inventory-movements')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
