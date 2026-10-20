/**
 * Migration: adaptive refinement for discharge summaries
 * =========================================================
 * Adds:
 *  - discharge_packets.prepared_by — was already accepted as a parameter by
 *    createDischargeDraft() but silently discarded (never in the INSERT's column
 *    list, no column on the table at all) — needed to key refinement instructions
 *    by the doctor who requested the draft.
 *  - doctor_note_refinements — one small, per-doctor JSONB preferences row, modeled
 *    directly on the existing notification_preferences table shape (user-keyed,
 *    upsert-on-write).
 *
 * Safe to run multiple times (IF NOT EXISTS throughout).
 */

import pool from '../db/pgPool.js';

export async function up() {
  await pool.query('ALTER TABLE discharge_packets ADD COLUMN IF NOT EXISTS prepared_by BIGINT');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctor_note_refinements (
      doctor_id   INTEGER PRIMARY KEY,
      instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function down() {
  await pool.query('ALTER TABLE discharge_packets DROP COLUMN IF EXISTS prepared_by');
  await pool.query('DROP TABLE IF EXISTS doctor_note_refinements');
}
