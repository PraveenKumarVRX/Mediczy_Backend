/**
 * Migration: Biomedical Equipment Maintenance — real registry
 * ================================================================
 * The audit found `hg_equipment_inventory` (created at runtime by
 * biomedical.route.js) is insert-only with no maintenance-ticket or
 * calibration-due-date tracking behind the AI-chat layer — this closes
 * that gap. Purely additive: does not modify hg_equipment_inventory.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS biomedical_maintenance_ticket (
        id                  SERIAL PRIMARY KEY,
        tenant_id           INTEGER NOT NULL,
        equipment_id        INTEGER,
        issue_description   TEXT NOT NULL,
        priority            TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'critical')),
        status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
        reported_by         TEXT,
        assigned_to         TEXT,
        opened_at           TIMESTAMPTZ DEFAULT NOW(),
        closed_at           TIMESTAMPTZ,
        resolution_notes    TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_biomed_ticket_tenant ON biomedical_maintenance_ticket (tenant_id, status)`);
    console.log('✅ biomedical_maintenance_ticket: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS biomedical_calibration_schedule (
        id                  SERIAL PRIMARY KEY,
        tenant_id           INTEGER NOT NULL,
        equipment_id        INTEGER NOT NULL,
        calibration_type    TEXT NOT NULL,
        last_calibrated_at  DATE,
        next_due_at         DATE NOT NULL,
        frequency_days      INT NOT NULL DEFAULT 365,
        status              TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'overdue', 'completed')),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (equipment_id, calibration_type)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_biomed_calib_tenant_due ON biomedical_calibration_schedule (tenant_id, next_due_at)`);
    console.log('✅ biomedical_calibration_schedule: created');

    await client.query('COMMIT');
    console.log('✅ Biomedical equipment registry migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS biomedical_calibration_schedule');
    await client.query('DROP TABLE IF EXISTS biomedical_maintenance_ticket');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('biomedical-equipment-registry')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
