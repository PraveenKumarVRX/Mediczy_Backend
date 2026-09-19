/**
 * Migration: Asset Tracking — software scaffolding (manual entry only)
 * ================================================================
 * This is deliberately SOFTWARE-ONLY scaffolding: the hospital has no
 * physical RFID/IoT reader hardware deployed yet, so there is no real-time
 * hardware feed to integrate against. This migration creates the data model
 * and a manual-entry API (see server/routes/asset-tracking.route.js) that a
 * real reader integration would plug into later.
 *
 * `asset_tag_event.source` defaults to 'manual' because no physical
 * RFID/IoT reader hardware is connected yet — when a real reader is
 * integrated, it should POST to the same /events endpoint with
 * source='reader'. Nothing about this migration assumes hardware exists.
 *
 * Additive only (CREATE TABLE IF NOT EXISTS). Safe to run multiple times.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS asset_tag (
        id                 SERIAL PRIMARY KEY,
        organization_id    INTEGER NOT NULL,
        tag_uid            TEXT NOT NULL,
        asset_type         TEXT NOT NULL CHECK (asset_type IN ('equipment', 'patient_wristband', 'staff_badge', 'linen_cart', 'other')),
        label              TEXT,
        linked_entity_type TEXT,
        linked_entity_id   INTEGER,
        status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'retired')),
        registered_by      INTEGER,
        registered_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (organization_id, tag_uid)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_asset_tag_org_type_status
        ON asset_tag (organization_id, asset_type, status)
    `);
    console.log('✅ asset_tag: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS asset_tag_event (
        id           SERIAL PRIMARY KEY,
        tag_id       INTEGER NOT NULL REFERENCES asset_tag(id),
        event_type   TEXT NOT NULL CHECK (event_type IN ('checkin', 'checkout', 'location_update', 'alert', 'lost_reported', 'found')),
        location     TEXT,
        notes        TEXT,
        source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'reader')),
        recorded_by  INTEGER,
        recorded_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_asset_tag_event_tag_recorded
        ON asset_tag_event (tag_id, recorded_at DESC)
    `);
    console.log('✅ asset_tag_event: created');

    await client.query('COMMIT');
    console.log('✅ Asset tracking migration complete');
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
    await client.query('DROP TABLE IF EXISTS asset_tag_event');
    await client.query('DROP TABLE IF EXISTS asset_tag');
    await client.query('COMMIT');
    console.log('✅ Asset tracking migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node asset-tracking.migration.js
if (process.argv[1] && process.argv[1].includes('asset-tracking')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
