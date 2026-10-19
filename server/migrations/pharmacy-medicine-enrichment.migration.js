/**
 * Pharmacy Medicine Enrichment Columns
 *
 * Adds columns needed for open-source price feeds:
 *   selling_price        — actual selling price (below MRP), populated by OpenMRP / dataset sync
 *   discount_pct         — % discount off MRP (computed field, updated by sync)
 *   openmrp_id           — OpenMRP barcode/product id for future lookups
 *   dataset_source       — which open-source dataset last wrote price data
 *   availability_synced_at — last time availability was checked via external source
 *   in_stock             — whether medicine is available (was NULL in original schema)
 *
 * Safe to re-run (ADD COLUMN IF NOT EXISTS throughout).
 */

import pool from '../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await client.query(`
    ALTER TABLE pharmacy_medicines
      ADD COLUMN IF NOT EXISTS selling_price        NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS discount_pct         NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS openmrp_id           TEXT,
      ADD COLUMN IF NOT EXISTS dataset_source       TEXT,
      ADD COLUMN IF NOT EXISTS availability_synced_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS in_stock             BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS is_discontinued      BOOLEAN DEFAULT FALSE
  `);

  // Index for OpenMRP id lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_pharmacy_medicines_openmrp_id
      ON pharmacy_medicines(openmrp_id)
      WHERE openmrp_id IS NOT NULL
  `);

  // Index for discontinued filter
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_pharmacy_medicines_in_stock
      ON pharmacy_medicines(in_stock, is_discontinued)
  `);

  // Back-fill selling_price = mrp for existing records (until a real price feed updates it)
  await client.query(`
    UPDATE pharmacy_medicines
       SET selling_price = mrp
     WHERE selling_price IS NULL AND mrp IS NOT NULL AND mrp > 0
  `);

  await client.query('COMMIT');
  console.log('✅ pharmacy-medicine-enrichment migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ pharmacy-medicine-enrichment migration failed:', err.message);
  throw err;
} finally {
  client.release();
}
