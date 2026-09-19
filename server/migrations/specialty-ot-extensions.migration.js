/**
 * Migration: Specialty OT Extensions — post-op follow-up tracking
 * ====================================================================
 * Ophthalmology (IOL power/model), cardiac surgery (graft/stent details),
 * and orthopaedic (implant details) fields do NOT need new tables — they
 * merge into operative_notes.note_data, a JSONB column that already
 * exists for exactly this kind of extension, without touching any
 * existing column or the operative-notes service's core logic.
 *
 * The one genuinely new piece is post-op follow-up tracking (day-1/
 * week-1/month-1), which has no home anywhere. This is deliberately a
 * TRACKING list, not an integration into the live appointments table —
 * that table has complex required fields and active booking-conflict
 * logic (checkDoctorConflict/checkPatientConflict) this migration does
 * not attempt to blind-integrate with. Front-desk staff use this list to
 * book the actual appointment through the normal flow; turning a
 * follow-up plan entry into a real Appointment row automatically is a
 * separate, later integration decision.
 *
 * Safe to run multiple times (IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS post_op_followup_plan (
        id             SERIAL PRIMARY KEY,
        ot_booking_id  BIGINT NOT NULL,
        patient_id     BIGINT,
        followup_type  TEXT NOT NULL CHECK (followup_type IN ('day1', 'week1', 'month1')),
        due_date       DATE NOT NULL,
        status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'completed', 'missed')),
        notes          TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (ot_booking_id, followup_type)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_postop_followup_booking ON post_op_followup_plan (ot_booking_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_postop_followup_due ON post_op_followup_plan (due_date, status)`);
    console.log('✅ post_op_followup_plan: created');

    await client.query('COMMIT');
    console.log('✅ Specialty OT extensions migration complete');
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
    await client.query('DROP TABLE IF EXISTS post_op_followup_plan');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('specialty-ot-extensions')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
