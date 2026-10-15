/**
 * Lab result release governance.
 * Adds QC linkage, release state, versioning and critical-value acknowledgement
 * to lab orders without changing existing order data.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE lab_orders
        ADD COLUMN IF NOT EXISTS qc_material_id BIGINT,
        ADD COLUMN IF NOT EXISTS qc_run_id BIGINT,
        ADD COLUMN IF NOT EXISTS result_version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS release_status VARCHAR(24) NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS finalized_by VARCHAR(160),
        ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS critical_acknowledged_by VARCHAR(160),
        ADD COLUMN IF NOT EXISTS critical_acknowledged_at TIMESTAMPTZ;
      ALTER TABLE lab_orders
        DROP CONSTRAINT IF EXISTS lab_orders_release_status_check;
      ALTER TABLE lab_orders
        ADD CONSTRAINT lab_orders_release_status_check
        CHECK (release_status IN ('draft', 'released', 'blocked', 'corrected'));
      CREATE INDEX IF NOT EXISTS idx_lab_orders_lab_release
        ON lab_orders (lab_id, release_status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lab_orders_qc_material
        ON lab_orders (lab_id, qc_material_id);
      CREATE TABLE IF NOT EXISTS lab_result_release_events (
        id BIGSERIAL PRIMARY KEY,
        lab_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        result_version INTEGER NOT NULL,
        event_type VARCHAR(48) NOT NULL,
        actor_id VARCHAR(160),
        reason TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lab_result_release_events_order
        ON lab_result_release_events (lab_id, order_id, created_at DESC);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS lab_result_release_events');
    await client.query(`
      ALTER TABLE lab_orders
        DROP CONSTRAINT IF EXISTS lab_orders_release_status_check,
        DROP COLUMN IF EXISTS qc_material_id,
        DROP COLUMN IF EXISTS qc_run_id,
        DROP COLUMN IF EXISTS result_version,
        DROP COLUMN IF EXISTS release_status,
        DROP COLUMN IF EXISTS finalized_by,
        DROP COLUMN IF EXISTS finalized_at,
        DROP COLUMN IF EXISTS critical_acknowledged_by,
        DROP COLUMN IF EXISTS critical_acknowledged_at;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('20261015000500-lab-result-release-governance')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
