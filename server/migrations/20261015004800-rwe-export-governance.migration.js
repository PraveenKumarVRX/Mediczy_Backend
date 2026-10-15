import pg from 'pg';

const { Client } = pg;

export async function up() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS rwe_export_requests (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER,
      cohort_id VARCHAR(80),
      purpose TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      requested_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_rwe_export_requests_hospital ON rwe_export_requests(hospital_id, created_at DESC)');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}

export async function down() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { await client.query('DROP TABLE IF EXISTS rwe_export_requests CASCADE'); }
  finally { await client.end(); }
}

if (process.argv[1] && process.argv[1].endsWith('20261015004800-rwe-export-governance.migration.js')) {
  up().then(() => console.log('rwe-export-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
}
