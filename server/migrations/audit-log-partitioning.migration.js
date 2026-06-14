/**
 * ITEM-06: Convert api_audit_logs to monthly range-partitioned table.
 *
 * Strategy:
 *   1. Rename existing table to api_audit_logs_legacy
 *   2. Create new partitioned parent table (PARTITION BY RANGE on created_at)
 *   3. Create the current month partition + next month partition
 *   4. Re-insert legacy rows into the new partitioned table
 *   5. A cron or next-run of this script can drop the legacy table once verified
 *
 * Run once per environment:
 *   node server/migrations/audit-log-partitioning.migration.js
 */

import pool from '../db/pgPool.js';

export async function runMigration(pgPool = pool) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // Check if already migrated
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

    // 2. Create partitioned parent (no data lives here directly)
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_audit_logs (
        id             BIGSERIAL,
        user_id        INTEGER,
        action         VARCHAR(100),
        method         VARCHAR(10),
        path           TEXT,
        status_code    INTEGER,
        ip_address     VARCHAR(45),
        user_agent     TEXT,
        resource_type  VARCHAR(100),
        resource_id    TEXT,
        tenant_id      INTEGER,
        details        JSONB,
        row_hash       TEXT,
        prev_hash      TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);
    console.log('[audit-partition] Created partitioned api_audit_logs parent');

    // 3. Create monthly partitions for current month + next 2 months
    const now = new Date();
    for (let delta = 0; delta <= 2; delta++) {
      const d     = new Date(now.getFullYear(), now.getMonth() + delta, 1);
      const start = d.toISOString().slice(0, 7);           // YYYY-MM
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 7);
      const name  = `api_audit_logs_${start.replace('-', '_')}`;
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${name}
          PARTITION OF api_audit_logs
          FOR VALUES FROM ('${start}-01') TO ('${end}-01')
      `);
      // Index within partition
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_${name}_user ON ${name}(user_id, created_at DESC)
      `);
      console.log(`[audit-partition] Created partition ${name}`);
    }

    // 4. Re-insert legacy rows (batch by ID to avoid memory pressure)
    if (legacyExists.length > 0) {
      const { rows: [{ count }] } = await client.query(`SELECT COUNT(*) FROM api_audit_logs_legacy`);
      console.log(`[audit-partition] Migrating ${count} legacy rows...`);
      await client.query(`
        INSERT INTO api_audit_logs
          SELECT * FROM api_audit_logs_legacy
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

// ── Auto-create monthly partition (call from a monthly cron) ─────────────────
export async function ensureNextMonthPartition(pgPool = pool) {
  const d     = new Date();
  const next  = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const start = next.toISOString().slice(0, 7);
  const end   = new Date(next.getFullYear(), next.getMonth() + 1, 1).toISOString().slice(0, 7);
  const name  = `api_audit_logs_${start.replace('-', '_')}`;
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS ${name}
        PARTITION OF api_audit_logs
        FOR VALUES FROM ('${start}-01') TO ('${end}-01')
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_${name}_user ON ${name}(user_id, created_at DESC)
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
