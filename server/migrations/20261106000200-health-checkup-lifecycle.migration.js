/**
 * Health-checkup booking lifecycle: Team approval gate + instructions + reports.
 *
 * Adds the employee→Team workflow states to health_checkup_bookings:
 *   booked (employee submitted, pending Team approval)
 *     → confirmed (Parinitha/Team approved; checkup instructions become viewable)
 *     → completed (tests done)
 *     → reports_available (report attached; employee can download & share)
 *
 * New columns capture the approval, completion, instructions and attached report
 * descriptors. The two "active slot" partial indexes are rebuilt to include 'booked'
 * so a pending booking still holds its slot.
 *
 * Manual-run.
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool = sharedPool) {
  await pool.query(`
    ALTER TABLE health_checkup_bookings
      ADD COLUMN IF NOT EXISTS approved_by_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approval_note         TEXT,
      ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reports_available_at  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS instructions          TEXT,
      ADD COLUMN IF NOT EXISTS report_refs           JSONB NOT NULL DEFAULT '[]'::jsonb;

    -- Rebuild the active-slot unique indexes so a pending 'booked' booking also holds its slot.
    DROP INDEX IF EXISTS uniq_health_checkup_active_lab_slot;
    DROP INDEX IF EXISTS uniq_health_checkup_active_hospital_slot;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_lab_slot
      ON health_checkup_bookings(lab_id, appointment_date, time_slot)
      WHERE status IN ('booked','payment_pending','confirmed','scheduled','rescheduled');
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_hospital_slot
      ON health_checkup_bookings(hospital_id, appointment_date, time_slot)
      WHERE status IN ('booked','payment_pending','confirmed','scheduled','rescheduled');
  `);
}

export async function down(pool = sharedPool) {
  await pool.query(`
    DROP INDEX IF EXISTS uniq_health_checkup_active_lab_slot;
    DROP INDEX IF EXISTS uniq_health_checkup_active_hospital_slot;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_lab_slot
      ON health_checkup_bookings(lab_id, appointment_date, time_slot)
      WHERE status IN ('payment_pending','confirmed','scheduled','rescheduled');
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_hospital_slot
      ON health_checkup_bookings(hospital_id, appointment_date, time_slot)
      WHERE status IN ('payment_pending','confirmed','scheduled','rescheduled');

    ALTER TABLE health_checkup_bookings
      DROP COLUMN IF EXISTS approved_by_user_id,
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS approval_note,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS reports_available_at,
      DROP COLUMN IF EXISTS instructions,
      DROP COLUMN IF EXISTS report_refs;
  `);
}
