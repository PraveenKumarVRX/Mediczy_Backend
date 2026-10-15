import pg from 'pg';

const { Client } = pg;

const statements = [
  `CREATE TABLE IF NOT EXISTS bed_reservations (
    id BIGSERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    bed_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL,
    reserved_by TEXT,
    context JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    released_at TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_bed_reservations_active_bed ON bed_reservations(bed_id) WHERE status = 'active'`,
  `CREATE INDEX IF NOT EXISTS idx_bed_reservations_token ON bed_reservations(token)`,
  `CREATE TABLE IF NOT EXISTS cda_documents (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER,
    patient_id INTEGER,
    document_type VARCHAR(50) NOT NULL,
    loinc_code VARCHAR(10),
    cda_id UUID NOT NULL UNIQUE,
    xml_content TEXT,
    status VARCHAR(20) DEFAULT 'generated',
    reference_id INTEGER,
    reference_type VARCHAR(50),
    generated_by INTEGER,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    validation_errors TEXT[]
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cda_patient ON cda_documents(patient_id, document_type)`,
  `CREATE INDEX IF NOT EXISTS idx_cda_tenant ON cda_documents(tenant_id, generated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_cdss_feedback (
    id SERIAL PRIMARY KEY,
    query_id VARCHAR(64) NOT NULL,
    user_id INTEGER,
    user_role VARCHAR(32) DEFAULT 'doctor',
    action VARCHAR(20) NOT NULL CHECK (action IN ('accepted','modified','rejected')),
    feedback_type VARCHAR(32) DEFAULT 'general',
    original_response JSONB,
    modification JSONB,
    reason TEXT,
    codes_kept TEXT[],
    codes_removed TEXT[],
    codes_added TEXT[],
    query_text TEXT,
    tenant_id VARCHAR(64) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cdss_feedback_query ON ai_cdss_feedback(query_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cdss_feedback_action ON ai_cdss_feedback(action)`,
  `CREATE INDEX IF NOT EXISTS idx_cdss_feedback_created ON ai_cdss_feedback(created_at)`,
  `CREATE TABLE IF NOT EXISTS ticket_resolution_followups (
    id SERIAL PRIMARY KEY,
    ticket_id TEXT NOT NULL UNIQUE,
    severity TEXT,
    requester_name TEXT,
    requester_email TEXT,
    requester_phone TEXT,
    send_after TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    channel TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trf_pending ON ticket_resolution_followups(send_after, sent_at) WHERE sent_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS corporate_employee_qc_log (
    id SERIAL PRIMARY KEY,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    corporates_scanned INTEGER,
    checks_run INTEGER,
    issues_found INTEGER,
    issues_fixed INTEGER,
    issues_failed INTEGER,
    summary JSONB,
    errors JSONB
  )`
];

export async function up() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { await client.query('BEGIN'); for (const statement of statements) await client.query(statement); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}

export async function down() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const table of ['corporate_employee_qc_log', 'ticket_resolution_followups', 'ai_cdss_feedback', 'cda_documents', 'bed_reservations']) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
  } finally { await client.end(); }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005200-clinical-services-governance.migration.js')) {
  up().then(() => console.log('clinical-services-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
}
