/**
 * Migration: Green Channel (corporate fast-track) configuration
 * ==============================================================
 * Three additive tables:
 *   green_channel_config          — per-organization display mode
 *   corporate_green_channel       — which corporate accounts are entitled
 *   green_channel_application_log — audit of every time the bonus was applied,
 *                                   so the fairness impact can be measured
 *
 * display_mode (the open UX question in the Module 24 design doc):
 *   quiet         — default. Priority nudge only; NO marker anywhere.
 *   staff_badge   — front-desk / queue-staff screens show a badge.
 *   separate_lane — staff screens show a "direct to corporate lane" badge
 *                   (the physical space itself is an operational matter).
 * No mode ever shows anything on public waiting-room displays.
 *
 * Safe to run multiple times.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS green_channel_config (
        organization_id INTEGER PRIMARY KEY,
        display_mode    TEXT NOT NULL DEFAULT 'quiet' CHECK (display_mode IN ('quiet', 'staff_badge', 'separate_lane')),
        updated_by      TEXT,
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_green_channel (
        corporate_id INTEGER PRIMARY KEY REFERENCES corporates(id),
        enabled      BOOLEAN NOT NULL DEFAULT false,
        updated_by   TEXT,
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS green_channel_application_log (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        queue_entry_id  INTEGER,
        corporate_id    INTEGER,
        bonus_applied   INTEGER NOT NULL,
        display_mode    TEXT NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_green_channel_log_org_time ON green_channel_application_log (organization_id, created_at DESC)`);
    await client.query('COMMIT');
    console.log('✅ green-channel tables created');
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
    await client.query('DROP TABLE IF EXISTS green_channel_application_log');
    await client.query('DROP TABLE IF EXISTS corporate_green_channel');
    await client.query('DROP TABLE IF EXISTS green_channel_config');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('green-channel.migration')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
