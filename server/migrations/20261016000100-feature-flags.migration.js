/**
 * Tenant-aware feature flags.
 *
 * A missing flag is deliberately disabled in the database-backed evaluator.
 * Existing environment-gated routes may provide an explicit legacy fallback
 * while they are migrated to the registry.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
      description TEXT NOT NULL DEFAULT '',
      default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
      kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_feature_flags (
      tenant_uid TEXT NOT NULL,
      flag_key TEXT NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
      enabled BOOLEAN,
      rollout_percentage INTEGER CHECK (rollout_percentage BETWEEN 0 AND 100),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_uid, flag_key)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_key
      ON tenant_feature_flags (flag_key, tenant_uid)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS feature_flag_audit (
      id BIGSERIAL PRIMARY KEY,
      flag_key TEXT NOT NULL,
      tenant_uid TEXT,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'tenant_override_upsert', 'tenant_override_delete')),
      previous_value JSONB,
      next_value JSONB,
      actor_uid TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_lookup ON feature_flag_audit (flag_key, tenant_uid, created_at DESC)`);
}

export async function down(db = pool) {
  await db.query('DROP TABLE IF EXISTS feature_flag_audit');
  await db.query('DROP TABLE IF EXISTS tenant_feature_flags');
  await db.query('DROP TABLE IF EXISTS feature_flags');
}

if (process.argv[1]?.includes('20261016000100-feature-flags')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
