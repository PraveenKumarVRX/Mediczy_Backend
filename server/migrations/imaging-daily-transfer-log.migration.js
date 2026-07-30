/**
 * Migration: imaging_daily_transfer_log
 * Run: node server/migrations/imaging-daily-transfer-log.migration.js
 */
import pool from '../db/pgPool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_daily_transfer_log (
        id BIGSERIAL PRIMARY KEY,
        source_bucket TEXT NOT NULL,
        dest_bucket TEXT NOT NULL,
        object_key TEXT NOT NULL,
        size_bytes BIGINT,
        etag TEXT,
        status TEXT NOT NULL DEFAULT 'copied',
        error_message TEXT,
        deleted_from_source BOOLEAN NOT NULL DEFAULT FALSE,
        transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dest_bucket, object_key)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_daily_transfer_at
        ON imaging_daily_transfer_log (transferred_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_imaging_daily_transfer_status
        ON imaging_daily_transfer_log (status);
    `);
    await client.query('COMMIT');
    console.log('✓ imaging_daily_transfer_log ready');
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
