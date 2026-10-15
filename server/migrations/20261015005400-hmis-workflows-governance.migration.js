import pg from 'pg';

const { Client } = pg;
const statements = [
  `CREATE TABLE IF NOT EXISTS discharge_packets (
    id BIGSERIAL PRIMARY KEY, organization_id BIGINT, admission_id BIGINT NOT NULL, patient_id BIGINT,
    draft_content TEXT, final_content TEXT, diagnosis_summary TEXT, procedure_summary TEXT, medication_summary TEXT,
    follow_up_summary TEXT, diet_instructions TEXT, activity_notes TEXT, emergency_contacts TEXT,
    ai_generated BOOLEAN DEFAULT FALSE, ai_model TEXT, signed_by TEXT, signed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'draft', sent_at TIMESTAMPTZ, delivery_channel TEXT, delivery_address TEXT,
    delivery_receipt JSONB DEFAULT '{}'::jsonb, packet_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_discharge_packet_admission ON discharge_packets(admission_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_discharge_packet_signed ON discharge_packets(admission_id) WHERE status IN ('signed','sent','delivered')`,
  `CREATE TABLE IF NOT EXISTS automation_jobs (
    id SERIAL PRIMARY KEY, job_type VARCHAR(80) NOT NULL, reference_id INTEGER, organization_id INTEGER,
    payload JSONB DEFAULT '{}', status VARCHAR(30) NOT NULL DEFAULT 'pending', scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error_msg TEXT, retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_automation_jobs_status_scheduled ON automation_jobs(status, scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_automation_jobs_type_org ON automation_jobs(job_type, organization_id)`,
  `CREATE TABLE IF NOT EXISTS automation_run_log (
    id SERIAL PRIMARY KEY, job_id INTEGER REFERENCES automation_jobs(id), job_type VARCHAR(80), organization_id INTEGER,
    reference_id INTEGER, outcome VARCHAR(30), details JSONB DEFAULT '{}', ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS hmis_preauth_requests (
    id BIGSERIAL PRIMARY KEY, organization_id BIGINT, admission_id BIGINT NOT NULL, ot_booking_id BIGINT, patient_id BIGINT,
    insurer_name TEXT NOT NULL, tpa_name TEXT, policy_number TEXT, member_id TEXT, corporate_referral_id BIGINT,
    diagnosis_codes TEXT, procedure_codes TEXT, estimated_amount NUMERIC(12,2), approved_amount NUMERIC(12,2),
    pre_auth_number TEXT, pre_auth_date DATE, validity_days SMALLINT DEFAULT 30, valid_until DATE,
    status TEXT DEFAULT 'draft', denial_reason TEXT, denial_code TEXT, appeal_status TEXT,
    submitted_by TEXT, submitted_at TIMESTAMPTZ, approved_by_tpa TEXT, approved_at TIMESTAMPTZ,
    documents JSONB DEFAULT '[]'::jsonb, notes TEXT, request_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_preauth_admission ON hmis_preauth_requests(admission_id)`,
  `CREATE INDEX IF NOT EXISTS idx_preauth_ot_booking ON hmis_preauth_requests(ot_booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_preauth_patient ON hmis_preauth_requests(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_preauth_status ON hmis_preauth_requests(organization_id, status)`,
  `CREATE TABLE IF NOT EXISTS hmis_preauth_documents (
    id BIGSERIAL PRIMARY KEY, preauth_id BIGINT NOT NULL, document_type TEXT NOT NULL,
    file_name TEXT, file_url TEXT, uploaded_by TEXT, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_preauth_docs ON hmis_preauth_documents(preauth_id)`
];

export async function up() { const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); try { await client.query('BEGIN'); for (const statement of statements) await client.query(statement); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); } }
export async function down() { const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); try { for (const table of ['hmis_preauth_documents','hmis_preauth_requests','automation_run_log','automation_jobs','discharge_packets']) await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`); } finally { await client.end(); } }
if (process.argv[1] && process.argv[1].endsWith('20261015005400-hmis-workflows-governance.migration.js')) up().then(() => console.log('hmis-workflows-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
