/** Durable report schedules for the report-builder worker (WP08/F21). */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id SERIAL PRIMARY KEY,
      schedule_id VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      report_config JSONB NOT NULL,
      cron_schedule VARCHAR(100) NOT NULL,
      recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_reports_due
      ON scheduled_reports (enabled, next_run_at);
    CREATE TABLE IF NOT EXISTS report_archive (
      id SERIAL PRIMARY KEY,
      report_id VARCHAR(100) NOT NULL,
      schedule_id VARCHAR(100),
      report_type VARCHAR(100) NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      record_count INTEGER NOT NULL DEFAULT 0,
      file_path TEXT,
      file_size_bytes BIGINT,
      format VARCHAR(20) NOT NULL DEFAULT 'json',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS scheduled_reports, report_archive CASCADE');
}

if (process.argv[1] && process.argv[1].includes('20261109000200-report-schedule-durability')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
