import pool from '../db/pgPool.js';

export async function runDoctorTasksMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS doctor_tasks (
        id          SERIAL PRIMARY KEY,
        doctor_id   INTEGER NOT NULL,
        title       TEXT    NOT NULL,
        description TEXT,
        patient_name TEXT,
        patient_id  INTEGER,
        due_date    DATE,
        due_time    TIME,
        priority    VARCHAR(20) DEFAULT 'normal'
                    CHECK (priority IN ('urgent','high','normal','low')),
        status      VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','cancelled')),
        source      VARCHAR(50) DEFAULT 'voice',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_tasks_doctor_status
        ON doctor_tasks (doctor_id, status, due_date)
    `);

    await client.query('COMMIT');
    console.log('[Migration] doctor_tasks table ready');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Allow direct execution: node server/migrations/doctor-tasks.migration.js
if (import.meta.url === `file://${process.argv[1]}`) {
  runDoctorTasksMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
