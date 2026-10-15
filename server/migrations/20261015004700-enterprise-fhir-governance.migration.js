import sharedPool from '../db/pgPool.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS enterprise_sso_identities (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    provider VARCHAR(40) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (provider, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_enterprise_sso_user ON enterprise_sso_identities(user_id)`,
  `CREATE TABLE IF NOT EXISTS fhir_subscriptions (
    id SERIAL PRIMARY KEY,
    criteria TEXT NOT NULL,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('rest-hook', 'websocket', 'email')),
    channel_endpoint TEXT,
    channel_payload TEXT DEFAULT 'application/fhir+json',
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'active', 'error', 'off')),
    reason TEXT,
    contact JSONB,
    end_date TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

export async function up() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try { await client.query('BEGIN'); for (const statement of statements) await client.query(statement); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function down() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try { await client.query('BEGIN'); await client.query('DROP TABLE IF EXISTS fhir_subscriptions CASCADE'); await client.query('DROP TABLE IF EXISTS enterprise_sso_identities CASCADE'); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

if (process.argv[1] && process.argv[1].endsWith('20261015004700-enterprise-fhir-governance.migration.js')) {
  up().then(() => console.log('enterprise-fhir-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
}
