import pool from '../db/pgPool.js';

/** Migration-owned bedside nursing e-chart and intake/output summary schema. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nursing_flowsheet_entries (
      id                  SERIAL PRIMARY KEY,
      admission_id        INTEGER NOT NULL,
      organization_id     INTEGER NOT NULL,
      entry_type          VARCHAR(50) NOT NULL,
      recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      recorded_by         INTEGER NOT NULL,
      bp_systolic         INTEGER,
      bp_diastolic        INTEGER,
      heart_rate          INTEGER,
      spo2                NUMERIC(5,2),
      respiratory_rate    INTEGER,
      temperature         NUMERIC(5,2),
      temperature_site    VARCHAR(20),
      gcs_eye             SMALLINT,
      gcs_verbal          SMALLINT,
      gcs_motor           SMALLINT,
      pain_score          SMALLINT,
      pain_location       VARCHAR(100),
      io_type             VARCHAR(20),
      io_description      VARCHAR(100),
      io_volume_ml        NUMERIC(8,2),
      observation_text    TEXT,
      fall_risk_score     SMALLINT,
      braden_score        SMALLINT,
      skin_integrity      VARCHAR(50),
      pupil_left          VARCHAR(30),
      pupil_right         VARCHAR(30),
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_flowsheet_admission
      ON nursing_flowsheet_entries(admission_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS nursing_io_summary (
      id              SERIAL PRIMARY KEY,
      admission_id    INTEGER NOT NULL,
      summary_date    DATE NOT NULL DEFAULT CURRENT_DATE,
      total_intake_ml NUMERIC(10,2) DEFAULT 0,
      total_output_ml NUMERIC(10,2) DEFAULT 0,
      net_balance_ml  NUMERIC(10,2) GENERATED ALWAYS AS (total_intake_ml - total_output_ml) STORED,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(admission_id, summary_date)
    );
  `);
  console.log('[migration] nursing e-chart governance schema ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS nursing_io_summary CASCADE;
    DROP TABLE IF EXISTS nursing_flowsheet_entries CASCADE;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
