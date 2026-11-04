/**
 * Migration: Report Observations — scoped dedupe UNIQUE index (WP3 Stage B)
 * ========================================================================
 * Deferred from WP0/Step-1 because it spans canonical_name (WP0) + document_hash (Step-1 era).
 * Both column sets now exist, so the org/subject/document-scoped UNIQUE index is created here.
 *
 * NULLs are distinct in a UNIQUE index, so legacy rows (null uids/hash) never collide; only the
 * new canonical writer (which sets organization_uid, subject_uid, document_hash) is deduped.
 *
 * Additive, idempotent. `--dry-run` runs in a txn and ROLLs BACK; `--down` drops the index.
 */

import pool from '../db/pgPool.js';

export async function up(options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_results_scoped
        ON lab_results (organization_uid, subject_uid, document_hash, document_version, COALESCE(canonical_name, "testName"))
    `);
    const { rows } = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname='uq_lab_results_scoped'`);
    console.log(`✅ uq_lab_results_scoped present: ${rows.length === 1}`);
    if (dryRun) { await client.query('ROLLBACK'); console.log('\n🧪 DRY RUN — rolled back.'); }
    else { await client.query('COMMIT'); console.log('\n✅ Scoped dedupe index committed.'); }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ dedupe index migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP INDEX IF EXISTS uq_lab_results_scoped`);
    await client.query('COMMIT');
    console.log('✅ Scoped dedupe index dropped.');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (process.argv.some((a) => a && a.includes('report-observations-dedupe-index'))) {
  const flags = process.argv.slice(2);
  const run = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  run.then(() => process.exit(0)).catch(() => process.exit(1));
}
