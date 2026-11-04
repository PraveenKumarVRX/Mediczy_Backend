/**
 * Migration: Report Delivery Outbox (WP3 Stage F — durable CRM delivery)
 * =====================================================================
 * A durable outbox for at-least-once delivery of verified report observations to an external CRM.
 * Each row is one delivery event with a stable event_id (report + revision), so retries after a
 * timeout/restart never double-create, and the receiver can dedupe. Corrections bump the revision.
 *
 * Additive, idempotent. `--dry-run` runs in a txn and ROLLs BACK; `--down` drops the table.
 */

import pool from '../db/pgPool.js';

export async function up(options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_delivery_outbox (
        id                SERIAL PRIMARY KEY,
        event_id          TEXT NOT NULL UNIQUE,
        report_id         INTEGER,
        subject_uid       TEXT,
        organization_uid  TEXT,
        revision          INTEGER NOT NULL DEFAULT 1,
        payload           JSONB NOT NULL,
        status            TEXT NOT NULL DEFAULT 'pending',   -- pending | delivered | failed
        attempts          INTEGER NOT NULL DEFAULT 0,
        last_error        TEXT,
        next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at      TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_outbox_due ON report_delivery_outbox (status, next_attempt_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_outbox_report ON report_delivery_outbox (report_id)`);
    const { rows } = await client.query(`SELECT count(*)::int n FROM report_delivery_outbox`);
    console.log(`✅ report_delivery_outbox ready (rows: ${rows[0].n})`);
    if (dryRun) { await client.query('ROLLBACK'); console.log('\n🧪 DRY RUN — rolled back.'); }
    else { await client.query('COMMIT'); console.log('\n✅ Delivery outbox committed.'); }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ outbox migration failed, rolled back:', err.message);
    throw err;
  } finally { client.release(); }
}

export async function down() {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query(`DROP TABLE IF EXISTS report_delivery_outbox`); await client.query('COMMIT'); console.log('✅ outbox dropped.'); }
  catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (process.argv.some((a) => a && a.includes('report-delivery-outbox'))) {
  const flags = process.argv.slice(2);
  const r = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  r.then(() => process.exit(0)).catch(() => process.exit(1));
}
