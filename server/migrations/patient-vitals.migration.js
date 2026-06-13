import pool from '../db/pgPool.js';

export async function runPatientVitalsMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_vitals (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        recorded_by_doctor_id INTEGER,
        bp VARCHAR(20),
        heart_rate INTEGER,
        temperature DECIMAL(5,2),
        spo2 INTEGER,
        weight DECIMAL(6,2),
        height DECIMAL(6,2),
        blood_glucose DECIMAL(6,2),
        notes TEXT,
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient_recorded_at
        ON patient_vitals (patient_id, recorded_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_vitals_doctor_recorded_at
        ON patient_vitals (recorded_by_doctor_id, recorded_at DESC)
    `);

    await client.query('COMMIT');
    console.log('[Migration] patient_vitals table ready');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPatientVitalsMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
