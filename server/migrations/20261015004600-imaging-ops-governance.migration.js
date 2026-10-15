import sharedPool from '../db/pgPool.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS imaging_clinical_claims (
    id BIGSERIAL PRIMARY KEY,
    draft_id BIGINT NOT NULL,
    study_id BIGINT NOT NULL,
    tenant_id BIGINT,
    claim_id VARCHAR(50) NOT NULL,
    fact_id VARCHAR(50),
    subject VARCHAR(255) NOT NULL,
    predicate VARCHAR(50) NOT NULL,
    object_value NUMERIC,
    object_unit VARCHAR(20),
    source VARCHAR(150),
    confidence NUMERIC,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (draft_id, claim_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_imaging_clinical_claims_draft ON imaging_clinical_claims (draft_id)`,
  `CREATE INDEX IF NOT EXISTS idx_imaging_clinical_claims_subject ON imaging_clinical_claims (subject)`,
  `CREATE TABLE IF NOT EXISTS imaging_daily_transfer_log (
    id BIGSERIAL PRIMARY KEY,
    source_bucket TEXT NOT NULL,
    dest_bucket TEXT NOT NULL,
    object_key TEXT NOT NULL,
    tenant_id TEXT,
    archive_provider TEXT,
    size_bytes BIGINT,
    etag TEXT,
    status TEXT NOT NULL DEFAULT 'copied',
    error_message TEXT,
    deleted_from_source BOOLEAN NOT NULL DEFAULT FALSE,
    transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dest_bucket, object_key)
  )`,
  `CREATE TABLE IF NOT EXISTS imaging_guidelines (
    id BIGSERIAL PRIMARY KEY,
    guideline_id VARCHAR(100) NOT NULL UNIQUE,
    pathway VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    organization VARCHAR(150) NOT NULL,
    publication_date DATE,
    version VARCHAR(40),
    jurisdiction VARCHAR(40) NOT NULL DEFAULT 'US',
    population VARCHAR(100),
    review_status VARCHAR(30) NOT NULL DEFAULT 'current',
    source_url TEXT NOT NULL,
    summary TEXT NOT NULL,
    retrieved_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_imaging_guidelines_pathway ON imaging_guidelines (pathway)`,
  `CREATE TABLE IF NOT EXISTS pacs_minio_archive_log (
    id BIGSERIAL PRIMARY KEY,
    object_key TEXT NOT NULL,
    size_bytes BIGINT,
    status TEXT NOT NULL,
    error_message TEXT,
    deleted_from_source BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_key)
  )`,
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
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS pacs_minio_archive_log CASCADE');
    await client.query('DROP TABLE IF EXISTS imaging_guidelines CASCADE');
    await client.query('DROP TABLE IF EXISTS imaging_daily_transfer_log CASCADE');
    await client.query('DROP TABLE IF EXISTS imaging_clinical_claims CASCADE');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015004600-imaging-ops-governance.migration.js')) {
  up().then(() => console.log('imaging-ops-governance migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
