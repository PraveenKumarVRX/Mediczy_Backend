import pool from '../db/pgPool.js';

/** Migration-owned CMMS preventive-maintenance and cold-chain records. */
export async function up() {
  await pool.query(`
    ALTER TABLE biomedical_calibration_schedule
      ADD COLUMN IF NOT EXISTS clinical_use_blocked BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS block_reason TEXT;

    CREATE TABLE IF NOT EXISTS biomedical_pm_schedule (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      equipment_id INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      due_at DATE NOT NULL,
      frequency_days INTEGER NOT NULL DEFAULT 365 CHECK (frequency_days > 0),
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','overdue','completed','cancelled')),
      assigned_to TEXT,
      last_completed_at DATE,
      clinical_use_blocked BOOLEAN NOT NULL DEFAULT FALSE,
      block_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, equipment_id, task_type)
    );
    CREATE INDEX IF NOT EXISTS idx_biomed_pm_tenant_due
      ON biomedical_pm_schedule (tenant_id, due_at, status);

    CREATE TABLE IF NOT EXISTS biomedical_cold_chain_sensors (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      sensor_code TEXT NOT NULL,
      sensor_name TEXT NOT NULL,
      location TEXT NOT NULL,
      min_temperature_c NUMERIC(6,2) NOT NULL,
      max_temperature_c NUMERIC(6,2) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, sensor_code),
      CHECK (min_temperature_c <= max_temperature_c)
    );

    CREATE TABLE IF NOT EXISTS biomedical_cold_chain_readings (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      sensor_id INTEGER NOT NULL REFERENCES biomedical_cold_chain_sensors(id) ON DELETE CASCADE,
      temperature_c NUMERIC(6,2) NOT NULL,
      humidity_percent NUMERIC(5,2),
      observed_at TIMESTAMPTZ NOT NULL,
      source TEXT NOT NULL DEFAULT 'device',
      idempotency_key VARCHAR(128),
      request_hash CHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, idempotency_key)
    );
    ALTER TABLE biomedical_cold_chain_readings ADD COLUMN IF NOT EXISTS request_hash CHAR(64);
    CREATE INDEX IF NOT EXISTS idx_biomed_cold_readings_sensor_time
      ON biomedical_cold_chain_readings (tenant_id, sensor_id, observed_at DESC);

    CREATE TABLE IF NOT EXISTS biomedical_cold_chain_alerts (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      reading_id BIGINT NOT NULL REFERENCES biomedical_cold_chain_readings(id) ON DELETE CASCADE,
      severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('warning','critical')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
      reason TEXT NOT NULL,
      acknowledged_by TEXT,
      acknowledged_at TIMESTAMPTZ,
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, reading_id)
    );
    CREATE INDEX IF NOT EXISTS idx_biomed_cold_alerts_open
      ON biomedical_cold_chain_alerts (tenant_id, status, created_at DESC);

  `);
}

export async function down() {
  await pool.query(`DROP TABLE IF EXISTS biomedical_cold_chain_alerts, biomedical_cold_chain_readings, biomedical_cold_chain_sensors, biomedical_pm_schedule CASCADE`);
}

if (process.argv[1] && process.argv[1].includes('20261015001100-biomedical-pm-cold-chain')) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}

export default { up, down };
