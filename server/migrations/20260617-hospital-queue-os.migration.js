/**
 * Hospital OS — unified queue, CMS, nurse call, display video sessions
 * Run: node server/migrations/20260617-hospital-queue-os.migration.js
 */

import pool from '../db/pgPool.js';

const SQL = `
CREATE TABLE IF NOT EXISTS hospital_queue_entries (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL DEFAULT 1,
  department VARCHAR(40) NOT NULL DEFAULT 'opd',
  token_number VARCHAR(20) NOT NULL,
  queue_zone VARCHAR(80) DEFAULT 'OPD-MAIN',
  patient_id INTEGER,
  patient_name VARCHAR(200),
  appointment_id INTEGER,
  doctor_id INTEGER,
  doctor_name VARCHAR(200),
  counter_id VARCHAR(40),
  queue_type VARCHAR(30) DEFAULT 'walk_in',
  triage_level VARCHAR(20),
  priority_score INTEGER DEFAULT 50,
  chief_complaint TEXT,
  status VARCHAR(30) DEFAULT 'waiting',
  estimated_wait_minutes INTEGER,
  actual_wait_minutes INTEGER,
  check_in_at TIMESTAMPTZ DEFAULT NOW(),
  called_at TIMESTAMPTZ,
  serving_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  consent_version VARCHAR(40),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hqe_org_dept_status
  ON hospital_queue_entries(organization_id, department, status);
CREATE INDEX IF NOT EXISTS idx_hqe_zone_status
  ON hospital_queue_entries(queue_zone, status, check_in_at);
CREATE INDEX IF NOT EXISTS idx_hqe_doctor_status
  ON hospital_queue_entries(doctor_id, status, priority_score DESC, check_in_at);

CREATE TABLE IF NOT EXISTS display_content_schedules (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL DEFAULT 1,
  zone_id VARCHAR(80) NOT NULL,
  title VARCHAR(200),
  content_type VARCHAR(40) DEFAULT 'slide',
  payload JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dcs_org_zone ON display_content_schedules(organization_id, zone_id, active);

CREATE TABLE IF NOT EXISTS bedside_nurse_calls (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL DEFAULT 1,
  bed_id VARCHAR(40) NOT NULL,
  ward_zone VARCHAR(80),
  patient_id INTEGER,
  patient_name VARCHAR(200),
  status VARCHAR(30) DEFAULT 'pending',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bnc_ward_status ON bedside_nurse_calls(ward_zone, status, created_at DESC);

CREATE TABLE IF NOT EXISTS display_video_sessions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL DEFAULT 1,
  room_id VARCHAR(120) NOT NULL,
  session_type VARCHAR(40) DEFAULT 'bedside_nurse',
  target_zone VARCHAR(80),
  bed_id VARCHAR(40),
  patient_id INTEGER,
  initiated_by VARCHAR(40),
  status VARCHAR(30) DEFAULT 'pending',
  livekit_metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_uhid_sequences (
  organization_id INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0,
  prefix VARCHAR(10) DEFAULT 'UHID'
);
`;

export async function up() {
  const client = await pool.connect();
  try {
    await client.query(SQL);
    await client.query(`
      INSERT INTO hospital_uhid_sequences (organization_id, last_value, prefix)
      VALUES (1, 0, 'UHID')
      ON CONFLICT (organization_id) DO NOTHING
    `);
    console.log('[migration] hospital-queue-os tables ready');
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
