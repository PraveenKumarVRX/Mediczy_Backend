/**
 * Migration: Asset Tracking — reader device registry + reader event metadata
 * ================================================================
 * Adds the server-side pieces a real RFID/IoT reader (or any gateway) needs
 * to push scans into asset tracking without a human JWT:
 *
 *   - asset_reader_device: one row per registered reader. Only the sha256
 *     hash of the device API key is stored; the plaintext key is shown once
 *     at registration time and can never be recovered.
 *   - asset_tag_event gets reader_device_id / rssi / scanned_at (all
 *     nullable, additive) so reader-sourced events carry provenance and the
 *     device-reported scan time.
 *
 * Additive only (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS); existing columns
 * and constraints on asset_tag_event are untouched. Safe to run multiple
 * times. Requires asset-tracking.migration.js to have run first.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS asset_reader_device (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        device_name     TEXT NOT NULL,
        location        TEXT,
        api_key_hash    TEXT NOT NULL UNIQUE,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        last_seen_at    TIMESTAMPTZ,
        created_by      INTEGER,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_asset_reader_device_org
        ON asset_reader_device (organization_id, is_active)
    `);
    console.log('✅ asset_reader_device: created');

    await client.query(`
      ALTER TABLE asset_tag_event
        ADD COLUMN IF NOT EXISTS reader_device_id INTEGER REFERENCES asset_reader_device(id),
        ADD COLUMN IF NOT EXISTS rssi INTEGER,
        ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_asset_tag_event_reader_tag
        ON asset_tag_event (reader_device_id, tag_id, recorded_at DESC)
        WHERE reader_device_id IS NOT NULL
    `);
    console.log('✅ asset_tag_event: reader_device_id / rssi / scanned_at added');

    await client.query('COMMIT');
    console.log('✅ Asset reader devices migration complete');
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
    await client.query('DROP INDEX IF EXISTS idx_asset_tag_event_reader_tag');
    await client.query(`
      ALTER TABLE asset_tag_event
        DROP COLUMN IF EXISTS reader_device_id,
        DROP COLUMN IF EXISTS rssi,
        DROP COLUMN IF EXISTS scanned_at
    `);
    await client.query('DROP TABLE IF EXISTS asset_reader_device');
    await client.query('COMMIT');
    console.log('✅ Asset reader devices migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node asset-reader-devices.migration.js
if (process.argv[1] && process.argv[1].includes('asset-reader-devices')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
