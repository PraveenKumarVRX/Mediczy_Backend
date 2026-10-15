import pool from '../db/pgPool.js';

/** Migration-owned health/activity tracker table. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      steps INTEGER DEFAULT 0,
      stairs INTEGER DEFAULT 0,
      distance_meters NUMERIC(10,2),
      calories_burned INTEGER DEFAULT 0,
      calories_consumed INTEGER DEFAULT 0,
      exercise_type TEXT,
      exercise_minutes INTEGER DEFAULT 0,
      sleep_hours NUMERIC(4,2) DEFAULT 0,
      sleep_quality TEXT CHECK (sleep_quality IN ('poor','fair','good','excellent')),
      heart_rate INTEGER,
      blood_pressure_systolic INTEGER,
      blood_pressure_diastolic INTEGER,
      spo2 INTEGER,
      temperature NUMERIC(4,1),
      weight NUMERIC(5,1),
      blood_sugar INTEGER,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, date)
    );
    ALTER TABLE daily_activity ADD COLUMN IF NOT EXISTS distance_meters NUMERIC(10,2);
    CREATE INDEX IF NOT EXISTS daily_activity_user_date ON daily_activity (user_id, date DESC);
  `);
  console.log('[migration] Daily activity schema ready');
}

export async function down() { await pool.query('DROP TABLE IF EXISTS daily_activity CASCADE;'); }

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
