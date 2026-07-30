/**
 * Migration: imaging_phi_access_log — PHI read audit for imaging paths
 * Run: node server/migrations/imaging-phi-access-log.migration.js
 */
import pool from '../db/pgPool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_phi_access_log (
        id BIGSERIAL PRIMARY KEY,
        actor_id TEXT,
        actor_role TEXT,
        actor_email TEXT,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        study_instance_uid TEXT,
        series_instance_uid TEXT,
        sop_instance_uid TEXT,
        path TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_phi_access_created
        ON imaging_phi_access_log (created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_phi_access_study
        ON imaging_phi_access_log (study_instance_uid)
        WHERE study_instance_uid IS NOT NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_phi_access_actor
        ON imaging_phi_access_log (actor_id)
        WHERE actor_id IS NOT NULL;
    `);
    await client.query('COMMIT');
    console.log('✓ imaging_phi_access_log ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
