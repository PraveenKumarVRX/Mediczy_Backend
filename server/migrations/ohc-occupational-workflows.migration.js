/** Mediqzy OHC occupational workflow foundation: scheduled visits, encounters,
 * screenings, unit-scoped staff messages and auditable export/report records. */
import pool from '../db/pgPool.js';

export async function runOhcOccupationalWorkflowsMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ohc_appointments (
        id BIGSERIAL PRIMARY KEY,
        unit_uid TEXT NOT NULL REFERENCES entity_registry(uid),
        employee_user_id INTEGER NOT NULL REFERENCES users(id),
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
        appointment_type TEXT NOT NULL DEFAULT 'occupational_visit' CHECK (appointment_type IN ('occupational_visit','pre_employment','periodic','return_to_work','screening','dot_testing')),
        location TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
        reminder_sent_at TIMESTAMPTZ,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_appointments_unit_schedule ON ohc_appointments (unit_uid, scheduled_at);
      CREATE TABLE IF NOT EXISTS ohc_encounters (
        id BIGSERIAL PRIMARY KEY,
        unit_uid TEXT NOT NULL REFERENCES entity_registry(uid),
        employee_user_id INTEGER NOT NULL REFERENCES users(id),
        appointment_id BIGINT UNIQUE REFERENCES ohc_appointments(id) ON DELETE SET NULL,
        clinician_user_id INTEGER NOT NULL REFERENCES users(id),
        encounter_type TEXT NOT NULL DEFAULT 'occupational_visit' CHECK (encounter_type IN ('occupational_visit','pre_employment','periodic','return_to_work','screening','dot_testing')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
        observations JSONB NOT NULL DEFAULT '{}'::jsonb,
        assessment TEXT,
        treatment TEXT,
        follow_up_at TIMESTAMPTZ,
        finalized_at TIMESTAMPTZ,
        finalized_by_user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_encounters_employee ON ohc_encounters (unit_uid, employee_user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS ohc_screening_results (
        id BIGSERIAL PRIMARY KEY,
        encounter_id BIGINT NOT NULL REFERENCES ohc_encounters(id) ON DELETE CASCADE,
        screening_type TEXT NOT NULL CHECK (screening_type IN ('audiometry','spirometry','vision','drug_alcohol','dot_testing','other')),
        result_status TEXT NOT NULL CHECK (result_status IN ('normal','abnormal','pending','not_fit')),
        result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        recorded_by_user_id INTEGER NOT NULL REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS ohc_staff_messages (
        id BIGSERIAL PRIMARY KEY,
        unit_uid TEXT NOT NULL REFERENCES entity_registry(uid),
        author_user_id INTEGER NOT NULL REFERENCES users(id),
        recipient_user_id INTEGER REFERENCES users(id),
        message_type TEXT NOT NULL DEFAULT 'announcement' CHECK (message_type IN ('announcement','operational','handover')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ohc_staff_messages_unit ON ohc_staff_messages (unit_uid, created_at DESC);
    `);
    await client.query('COMMIT');
    console.log('OHC occupational workflows migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('OHC occupational workflows migration failed:', err.message);
    throw err;
  } finally { client.release(); }
}

if (process.argv[1]?.includes('ohc-occupational-workflows')) {
  runOhcOccupationalWorkflowsMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
