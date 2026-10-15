import pg from 'pg';

const { Client } = pg;

const statements = [
  `CREATE TABLE IF NOT EXISTS clinical_alerts (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    source VARCHAR(80) NOT NULL,
    alert_type VARCHAR(80) NOT NULL,
    severity VARCHAR(24) NOT NULL,
    score INTEGER,
    title VARCHAR(240) NOT NULL,
    message TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(24) NOT NULL DEFAULT 'open',
    acknowledged_by INTEGER,
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clinical_alerts_patient_status ON clinical_alerts(tenant_id, patient_id, status)`,
  `CREATE TABLE IF NOT EXISTS clinical_coding_suggestions (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(24) NOT NULL DEFAULT 'pending_review',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clinical_coding_suggestions_patient ON clinical_coding_suggestions(patient_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS billing_estimates (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    admission_id BIGINT,
    patient_id BIGINT,
    estimate_type TEXT DEFAULT 'pre_admission',
    procedure_name TEXT,
    room_charges NUMERIC(12,2) DEFAULT 0,
    ot_charges NUMERIC(12,2) DEFAULT 0,
    anesthesia_charges NUMERIC(12,2) DEFAULT 0,
    consumable_charges NUMERIC(12,2) DEFAULT 0,
    implant_charges NUMERIC(12,2) DEFAULT 0,
    pharmacy_charges NUMERIC(12,2) DEFAULT 0,
    lab_charges NUMERIC(12,2) DEFAULT 0,
    imaging_charges NUMERIC(12,2) DEFAULT 0,
    professional_fees NUMERIC(12,2) DEFAULT 0,
    misc_charges NUMERIC(12,2) DEFAULT 0,
    subtotal NUMERIC(12,2) GENERATED ALWAYS AS (room_charges + ot_charges + anesthesia_charges + consumable_charges + implant_charges + pharmacy_charges + lab_charges + imaging_charges + professional_fees + misc_charges) STORED,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    tax_amount NUMERIC(12,2) DEFAULT 0,
    total_estimate NUMERIC(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    insurance_covered NUMERIC(12,2) DEFAULT 0,
    patient_liability NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    prepared_by TEXT,
    valid_until DATE,
    status TEXT DEFAULT 'draft',
    estimate_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_billing_estimate_admission ON billing_estimates(admission_id)`,
  `CREATE INDEX IF NOT EXISTS idx_billing_estimate_patient ON billing_estimates(patient_id)`,
  `CREATE TABLE IF NOT EXISTS non_payable_items (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    admission_id BIGINT NOT NULL,
    item_category TEXT,
    item_description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason_code TEXT,
    approved_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_non_payable_admission ON non_payable_items(admission_id)`
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
    await client.query('DROP TABLE IF EXISTS non_payable_items CASCADE');
    await client.query('DROP TABLE IF EXISTS billing_estimates CASCADE');
    await client.query('DROP TABLE IF EXISTS clinical_coding_suggestions CASCADE');
    await client.query('DROP TABLE IF EXISTS clinical_alerts CASCADE');
  } finally { await client.end(); }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005100-clinical-billing-governance.migration.js')) {
  up().then(() => console.log('clinical-billing-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
}
