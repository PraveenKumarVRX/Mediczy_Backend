import pool from '../db/pgPool.js';

/** Migration-owned discharge planning workspace. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discharge_plans (
      id SERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      patient_id VARCHAR(80) NOT NULL,
      admission_id VARCHAR(80),
      target_discharge_date DATE,
      owner VARCHAR(160),
      status VARCHAR(24) NOT NULL DEFAULT 'active',
      blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
      tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS admission_id VARCHAR(80);
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS target_discharge_date DATE;
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS owner VARCHAR(160);
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'active';
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS blockers JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS tasks JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE discharge_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS discharge_plans_hospital_updated_idx
      ON discharge_plans (hospital_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS discharge_plans_hospital_status_idx
      ON discharge_plans (hospital_id, status, updated_at DESC);
  `);
  console.log('[migration] Discharge planning schema ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS discharge_plans CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
