/**
 * ITEM-06: Convert api_audit_logs to monthly range-partitioned table.
 *
 * Strategy:
 *   1. Rename existing table to api_audit_logs_legacy
 *   2. Create new partitioned parent (PARTITION BY RANGE on created_at)
 *      — Uses the actual schema: log_id VARCHAR, actor_id VARCHAR, …
 *      — PostgreSQL requires the partition key (created_at) to be part of
 *        the PRIMARY KEY, so PK becomes (log_id, created_at)
 *   3. Create current month + next 2 month partitions with per-partition indexes
 *   4. Re-insert legacy rows; rows with NULL created_at get COALESCE(NOW())
 *   5. Drop legacy table once verified externally
 *
 * Run once per environment:
 *   node server/migrations/audit-log-partitioning.migration.js
 *
 * Safe to re-run — detects already-partitioned table and skips.
 */

import pool from '../db/pgPool.js';

export async function runMigration(pgPool = pool) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // Already partitioned?
    const { rows: existing } = await client.query(`
      SELECT relname FROM pg_class
      WHERE relname = 'api_audit_logs' AND relkind = 'p'
    `);
    if (existing.length > 0) {
      console.log('[audit-partition] api_audit_logs is already partitioned — skipping');
      await client.query('ROLLBACK');
      return { skipped: true };
    }

    // 1. Rename legacy table
    const { rows: legacyExists } = await client.query(`
      SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='api_audit_logs'
    `);
    if (legacyExists.length > 0) {
      await client.query(`ALTER TABLE api_audit_logs RENAME TO api_audit_logs_legacy`);
      console.log('[audit-partition] Renamed existing table to api_audit_logs_legacy');
    }

    // 2. Create partitioned parent — mirrors the actual api_audit_logs schema.
    //    PostgreSQL requires the partition key (created_at) to be in the PK,
    //    so PK is (log_id, created_at).
    await client.query(`
      CREATE TABLE api_audit_logs (
        log_id        VARCHAR        NOT NULL,
        tenant_id     INTEGER,
        actor_id      VARCHAR,
        actor_type    VARCHAR,
        action        VARCHAR,
        resource_type VARCHAR,
        resource_id   VARCHAR,
        changes       JSONB,
        metadata      JSONB,
        ip_address    VARCHAR,
        user_agent    TEXT,
        created_at    TIMESTAMP      NOT NULL DEFAULT NOW(),
        row_hash      TEXT,
        prev_hash     TEXT,
        PRIMARY KEY (log_id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);
    console.log('[audit-partition] Created partitioned api_audit_logs parent');

    // 3. Create monthly partitions for current month + next 2 months
    const now = new Date();
    for (let delta = 0; delta <= 2; delta++) {
      const d     = new Date(now.getFullYear(), now.getMonth() + delta, 1);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const end   = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
      const name  = `api_audit_logs_${start.replace('-', '_')}`;
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${name}
          PARTITION OF api_audit_logs
          FOR VALUES FROM ('${start}-01') TO ('${end}-01')
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${name}_tenant
          ON ${name}(tenant_id, created_at DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${name}_actor
          ON ${name}(actor_id, created_at DESC)
      `);
      console.log(`[audit-partition] Created partition ${name}`);
    }

    // 4. Re-insert legacy rows (columns mapped explicitly; NULL created_at → NOW())
    if (legacyExists.length > 0) {
      const { rows: [{ count }] } = await client.query(
        `SELECT COUNT(*) FROM api_audit_logs_legacy`
      );
      console.log(`[audit-partition] Migrating ${count} legacy rows…`);
      await client.query(`
        INSERT INTO api_audit_logs
          (log_id, tenant_id, actor_id, actor_type, action, resource_type,
           resource_id, changes, metadata, ip_address, user_agent,
           created_at, row_hash, prev_hash)
        SELECT
          log_id,
          tenant_id,
          actor_id,
          actor_type,
          action,
          resource_type,
          resource_id,
          changes,
          metadata,
          ip_address,
          user_agent,
          COALESCE(created_at, NOW()),
          row_hash,
          prev_hash
        FROM api_audit_logs_legacy
        ON CONFLICT DO NOTHING
      `);
      console.log('[audit-partition] Legacy rows migrated');
    }

    await client.query('COMMIT');
    console.log('[audit-partition] Migration complete');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[audit-partition] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ── Auto-create monthly partition (call from monthly cron) ────────────────────
export async function ensureNextMonthPartition(pgPool = pool) {
  const d     = new Date();
  const next  = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const start = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  const endD  = new Date(next.getFullYear(), next.getMonth() + 1, 1);
  const end   = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}`;
  const name  = `api_audit_logs_${start.replace('-', '_')}`;

  try {
    // Only attempt if the parent is partitioned
    const { rows } = await pgPool.query(`
      SELECT relname FROM pg_class WHERE relname = 'api_audit_logs' AND relkind = 'p'
    `);
    if (rows.length === 0) {
      console.log('[audit-partition] api_audit_logs is not yet partitioned — skipping cron partition creation');
      return;
    }

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS ${name}
        PARTITION OF api_audit_logs
        FOR VALUES FROM ('${start}-01') TO ('${end}-01')
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_${name}_tenant ON ${name}(tenant_id, created_at DESC)
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_${name}_actor ON ${name}(actor_id, created_at DESC)
    `);
    console.log(`[audit-partition] Ensured partition ${name}`);
  } catch (err) {
    console.error('[audit-partition] ensureNextMonthPartition failed:', err.message);
  }
}

// Run directly
if (process.argv[1]?.endsWith('audit-log-partitioning.migration.js')) {
  runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
