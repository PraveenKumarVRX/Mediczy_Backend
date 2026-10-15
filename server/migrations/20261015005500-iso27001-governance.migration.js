import sharedPool from '../db/pgPool.js';
const statements = [
  `CREATE TABLE IF NOT EXISTS iso27001_controls (
    id SERIAL PRIMARY KEY, control_id VARCHAR(10) UNIQUE NOT NULL, domain VARCHAR(5) NOT NULL,
    domain_name TEXT NOT NULL, control_name TEXT NOT NULL, description TEXT,
    control_type VARCHAR(30), cybersecurity BOOLEAN DEFAULT FALSE
  )`,
  `CREATE TABLE IF NOT EXISTS iso27001_evidence (
    id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
    control_id VARCHAR(10) REFERENCES iso27001_controls(control_id),
    applicability VARCHAR(20) DEFAULT 'not_assessed', justification TEXT,
    implementation_status VARCHAR(20) DEFAULT 'not_started', owner TEXT,
    evidence_text TEXT, evidence_url TEXT, last_review DATE, reviewed_by INTEGER,
    maturity_score INTEGER DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(tenant_id, control_id)
  )`,
  `CREATE TABLE IF NOT EXISTS iso27001_risk_register (
    id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
    control_id VARCHAR(10) REFERENCES iso27001_controls(control_id), risk_title TEXT NOT NULL,
    threat TEXT, vulnerability TEXT, likelihood INTEGER DEFAULT 3, impact INTEGER DEFAULT 3,
    risk_score INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
    treatment VARCHAR(20) DEFAULT 'mitigate', residual_score INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open', owner TEXT, due_date DATE, created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_iso_evidence_tenant ON iso27001_evidence(tenant_id, control_id)`,
  `CREATE INDEX IF NOT EXISTS idx_iso_risk_tenant ON iso27001_risk_register(tenant_id, status)`
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
    await client.query('DROP TABLE IF EXISTS iso27001_risk_register CASCADE');
    await client.query('DROP TABLE IF EXISTS iso27001_evidence CASCADE');
    await client.query('DROP TABLE IF EXISTS iso27001_controls CASCADE');
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005500-iso27001-governance.migration.js')) {
  up().then(() => console.log('iso27001-governance migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
