/**
 * Migration: Report Extraction Candidates (Step 3 — shadow benchmark store)
 * =========================================================================
 * Companion to docs/ai/REPORT_OCR_IMPLEMENTATION_PLAN.md (revised build order, step 3).
 *
 * A SHADOW table for benchmarking extractor/OCR candidates. These rows are NOT clinical
 * observations and are never read by HRA/HIS/trends/webhook — they exist only to compare
 * engine outputs (accuracy, recall, page grounding, latency) before any cutover.
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
      CREATE TABLE IF NOT EXISTS report_extraction_candidates (
        id                 SERIAL PRIMARY KEY,
        report_id          INTEGER,
        engine             TEXT NOT NULL,            -- 'pdftext+llm' | 'tesseract+llm' | …
        extraction_version TEXT,
        status             TEXT NOT NULL,            -- extracted | partial | failed
        observation_count  INTEGER NOT NULL DEFAULT 0,
        observations       JSONB,                    -- candidate contract array (NOT clinical)
        meta               JSONB,                    -- {ocr_method,pages,textLength,truncated,latency_ms,errors}
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rec_report ON report_extraction_candidates (report_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rec_engine ON report_extraction_candidates (engine)`);
    const { rows } = await client.query(`SELECT count(*) AS n FROM report_extraction_candidates`);
    console.log(`✅ report_extraction_candidates ready (rows: ${rows[0].n})`);

    if (dryRun) { await client.query('ROLLBACK'); console.log('\n🧪 DRY RUN — rolled back.'); }
    else { await client.query('COMMIT'); console.log('\n✅ Step-3 shadow table committed.'); }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Step-3 shadow table migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS report_extraction_candidates`);
    await client.query('COMMIT');
    console.log('✅ Step-3 shadow table dropped.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv.some((a) => a && a.includes('report-extraction-candidates'))) {
  const flags = process.argv.slice(2);
  const run = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  run.then(() => process.exit(0)).catch(() => process.exit(1));
}
