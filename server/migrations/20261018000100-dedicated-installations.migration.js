import { pathToFileURL } from 'node:url';

export async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS dedicated_installations (
      id UUID PRIMARY KEY,
      tenant_uid VARCHAR(6) NOT NULL REFERENCES tenants(unique_id),
      name VARCHAR(120) NOT NULL,
      profile TEXT NOT NULL CHECK (profile IN ('crm','lab')),
      modules TEXT[] NOT NULL,
      domain VARCHAR(253) UNIQUE,
      aws_account_id VARCHAR(12),
      region VARCHAR(40),
      version INTEGER NOT NULL DEFAULT 1,
      token_hash TEXT UNIQUE,
      credential_rotated_at TIMESTAMPTZ,
      last_received_at TIMESTAMPTZ,
      last_observed_at TIMESTAMPTZ,
      release VARCHAR(80),
      health TEXT CHECK (health IN ('healthy','degraded','unavailable')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, name),
      UNIQUE (tenant_uid, id)
    );
    CREATE INDEX IF NOT EXISTS dedicated_installations_tenant ON dedicated_installations(tenant_uid);
    CREATE TABLE IF NOT EXISTS dedicated_installation_reports (
      installation_id UUID NOT NULL REFERENCES dedicated_installations(id),
      event_id UUID NOT NULL,
      payload_hash TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (installation_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS dedicated_installation_daily_metrics (
      installation_id UUID NOT NULL REFERENCES dedicated_installations(id),
      day DATE NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      metrics JSONB NOT NULL,
      PRIMARY KEY (installation_id, day)
    );
    CREATE TABLE IF NOT EXISTS dedicated_installation_audit (
      id BIGSERIAL PRIMARY KEY,
      installation_id UUID NOT NULL,
      tenant_uid VARCHAR(6) NOT NULL,
      actor_ref TEXT NOT NULL,
      action TEXT NOT NULL,
      changes JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (tenant_uid, installation_id) REFERENCES dedicated_installations(tenant_uid, id)
    );
    CREATE INDEX IF NOT EXISTS dedicated_installation_audit_recent ON dedicated_installation_audit(installation_id, created_at DESC);
  `);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: pool } = await import('../db/pgPool.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dedicated-installations-migration'))");
    await up(client);
    await client.query('COMMIT');
    console.log('Dedicated installation schema ready');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
