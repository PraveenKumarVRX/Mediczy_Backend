/**
 * Migration: Housekeeping Module
 * ================================================================
 * Small, low-priority ops module for tracking housekeeping tasks
 * (routine/terminal cleaning, disinfection, linen change, biomedical
 * waste collection, pest control) across wards/rooms, with a simple
 * assign -> start -> complete -> verify workflow.
 *
 * Additive only (CREATE TABLE IF NOT EXISTS). Safe to run multiple times.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS housekeeping_task (
        id                SERIAL PRIMARY KEY,
        organization_id   INTEGER NOT NULL,
        location          TEXT NOT NULL,
        ward              TEXT,
        room_number       TEXT,
        task_type         TEXT NOT NULL CHECK (task_type IN (
                            'routine_cleaning', 'terminal_cleaning', 'disinfection',
                            'linen_change', 'biomedical_waste_collection', 'pest_control', 'other'
                          )),
        priority          TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
        status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'verified')),
        assigned_to       INTEGER,
        created_by        INTEGER,
        notes             TEXT,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        started_at        TIMESTAMPTZ,
        completed_at      TIMESTAMPTZ,
        verified_by       INTEGER,
        verified_at       TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_housekeeping_task_org_status ON housekeeping_task (organization_id, status)`);
    console.log('✅ housekeeping_task: created');

    await client.query('COMMIT');
    console.log('✅ Housekeeping module migration complete');
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
    await client.query('DROP TABLE IF EXISTS housekeeping_task');
    await client.query('COMMIT');
    console.log('✅ Housekeeping module migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node housekeeping.migration.js
if (process.argv[1] && process.argv[1].includes('housekeeping')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
