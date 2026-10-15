import sharedPool from '../db/pgPool.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS ai_adverse_events (
    id BIGSERIAL PRIMARY KEY,
    patient_id INTEGER,
    component_id TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe', 'critical', 'fatal')),
    reported_by INTEGER REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_adverse_events_status_created
     ON ai_adverse_events(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_adverse_events_component
     ON ai_adverse_events(component_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_doctor_metrics (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    tenant_id BIGINT,
    event_type VARCHAR(64) NOT NULL,
    session_id VARCHAR(128),
    language_code VARCHAR(16),
    page_path VARCHAR(120) NOT NULL DEFAULT '/ai-doctor',
    latency_ms INTEGER,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_doctor_metrics_user_created
     ON ai_doctor_metrics(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_doctor_metrics_event_created
     ON ai_doctor_metrics(event_type, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_proactive_alerts (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    patient_id INTEGER,
    doctor_id INTEGER,
    message TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    acknowledged_at TIMESTAMPTZ,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_proactive_alerts_status
     ON ai_proactive_alerts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_proactive_alerts_doctor
     ON ai_proactive_alerts(doctor_id, created_at DESC)`
];

export async function up() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try {
    await client.query('DROP TABLE IF EXISTS ai_proactive_alerts CASCADE');
    await client.query('DROP TABLE IF EXISTS ai_doctor_metrics CASCADE');
    await client.query('DROP TABLE IF EXISTS ai_adverse_events CASCADE');
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005000-ai-governance.migration.js')) {
  up().then(() => console.log('ai-governance migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
