/**
 * Migration: enforce one active booking per doctor slot.
 * Partial unique indexes block double-booking at the database level.
 */

import pool from '../db/pgPool.js';

const ACTIVE_STATUS_EXCLUSION = `('cancelled', 'no-show', 'rejected', 'completed')`;

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Normalize legacy range-format times to HH:MM start before indexing.
    await client.query(`
      UPDATE appointments
      SET "appointmentTime" = split_part(trim(split_part("appointmentTime"::text, '-', 1)), ':', 1)
        || ':' || lpad(split_part(trim(split_part("appointmentTime"::text, '-', 1)), ':', 2), 2, '0')
      WHERE "appointmentTime"::text LIKE '%-%'
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_appointments_doctor_slot_active
      ON appointments ("doctorId", "appointmentDate", "appointmentTime")
      WHERE status NOT IN ${ACTIVE_STATUS_EXCLUSION}
        AND "doctorId" IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_appointments_patient_slot_active
      ON appointments ("userId", "appointmentDate", "appointmentTime")
      WHERE status NOT IN ${ACTIVE_STATUS_EXCLUSION}
        AND "userId" IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('✅ Appointment slot unique indexes created');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Appointment slot unique index migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
