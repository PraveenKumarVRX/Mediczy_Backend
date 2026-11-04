/**
 * Migration: Report Observations — Canonical Model (WP0)
 * ======================================================
 * Companion to docs/ai/REPORT_OCR_IMPLEMENTATION_PLAN.md (WP0).
 *
 * PURELY ADDITIVE / ZERO BEHAVIOUR CHANGE. This prepares `lab_results` to become the
 * single canonical store for report-extracted observations and adds a parameter catalog
 * for canonicalisation + LOINC coding.
 *
 * It deliberately does NOT migrate `ai_report_lab_values`, drop it, or replace it with a
 * view — `report-analysis.service.js` still INSERTs into that base table, so the swap must
 * happen in WP3 in the same change that repoints the writer. Until then both tables coexist
 * and every existing consumer is untouched.
 *
 * Safe to run multiple times (ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS / ON CONFLICT).
 * Pass { dryRun: true } to execute everything in a transaction and ROLL BACK (verification
 * counts are printed before the rollback).
 */

import pool from '../db/pgPool.js';

// Seed catalog: canonical_name, loinc, default_unit, [aliases...]. Reference data — refine freely.
const CATALOG = [
  ['Haemoglobin', '718-7', 'g/dL', ['hemoglobin', 'haemoglobin', 'hb', 'hgb']],
  ['Glucose Fasting', '1558-6', 'mg/dL', ['glucose (fasting)', 'fasting glucose', 'fbs', 'glucose fasting']],
  ['Glucose Postprandial', '1521-4', 'mg/dL', ['glucose (postprandial)', 'pp glucose', 'ppbs', 'post prandial glucose', '2 hr pp']],
  ['HbA1c', '4548-4', '%', ['hba1c', 'glycated hemoglobin', 'glycosylated haemoglobin', 'a1c']],
  ['Total Cholesterol', '2093-3', 'mg/dL', ['cholesterol total', 'total cholesterol', 'cholesterol']],
  ['HDL Cholesterol', '2085-9', 'mg/dL', ['hdl', 'hdl cholesterol']],
  ['LDL Cholesterol', '2089-1', 'mg/dL', ['ldl', 'ldl cholesterol']],
  ['VLDL Cholesterol', '13458-5', 'mg/dL', ['vldl', 'vldl cholesterol']],
  ['Triglycerides', '2571-8', 'mg/dL', ['triglyceride', 'triglycerides', 'tg']],
  ['Creatinine', '2160-0', 'mg/dL', ['creatinine', 'serum creatinine']],
  ['Urea', '22664-7', 'mg/dL', ['urea', 'blood urea', 'bun']],
  ['Uric Acid', '3084-1', 'mg/dL', ['uric acid', 'serum uric acid']],
  ['TSH', '3016-3', 'uIU/mL', ['tsh', 'thyroid stimulating hormone']],
  ['SGPT (ALT)', '1742-6', 'U/L', ['sgpt', 'alt', 'alanine aminotransferase']],
  ['SGOT (AST)', '1920-8', 'U/L', ['sgot', 'ast', 'aspartate aminotransferase']],
  ['Total Bilirubin', '1975-2', 'mg/dL', ['total bilirubin', 'bilirubin total']],
  ['Albumin', '1751-7', 'g/dL', ['albumin', 'serum albumin']],
  ['Total Protein', '2885-2', 'g/dL', ['total protein', 'protein total']],
  ['A:G Ratio', '1759-0', '', ['a:g ratio', 'a g ratio', 'albumin globulin ratio']],
  ['Alkaline Phosphatase', '6768-6', 'U/L', ['alkaline phosphatase', 'alp']],
  ['Platelet Count', '777-3', '10^3/uL', ['platelet count', 'platelets', 'plt']],
  ['WBC Count', '6690-2', '10^3/uL', ['wbc', 'total wbc count', 'leukocyte count', 'tlc']],
  ['RBC Count', '789-8', '10^6/uL', ['rbc', 'rbc count', 'erythrocyte count']],
  ['ESR', '4537-7', 'mm/hr', ['esr', 'erythrocyte sedimentation rate']],
];

export async function up(options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Canonical + provenance + verification columns on lab_results (additive)
    await client.query(`
      ALTER TABLE lab_results
        ADD COLUMN IF NOT EXISTS patient_id          INTEGER,
        ADD COLUMN IF NOT EXISTS canonical_name      VARCHAR(255),
        ADD COLUMN IF NOT EXISTS loinc_code          VARCHAR(20),
        ADD COLUMN IF NOT EXISTS confidence          NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
        ADD COLUMN IF NOT EXISTS page                INTEGER,
        ADD COLUMN IF NOT EXISTS source_text         TEXT,
        ADD COLUMN IF NOT EXISTS ocr_method          VARCHAR(30),
        ADD COLUMN IF NOT EXISTS extraction_method   VARCHAR(30),
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(12) NOT NULL DEFAULT 'pending'
          CHECK (verification_status IN ('pending','verified','rejected')),
        ADD COLUMN IF NOT EXISTS verified_by         INTEGER,
        ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ
    `);
    console.log('✅ lab_results: canonical/provenance/verification columns added');

    // 2. Backfill patient_id from patients via userId (idempotent)
    const bf = await client.query(`
      UPDATE lab_results lr
         SET patient_id = p.id
        FROM patients p
       WHERE p."userId" = lr."userId"
         AND lr.patient_id IS NULL
    `);
    console.log(`✅ lab_results.patient_id backfilled: ${bf.rowCount} rows`);

    // 3. Indexes for the read paths (trends, verify queue)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_results_patient_created ON lab_results (patient_id, "createdAt")`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_results_loinc ON lab_results (loinc_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_results_verification ON lab_results (verification_status)`);
    console.log('✅ lab_results: indexes created');

    // 4. Parameter catalog (canonicalisation + LOINC) + seed
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_parameter_catalog (
        id             SERIAL PRIMARY KEY,
        canonical_name VARCHAR(120) NOT NULL UNIQUE,
        loinc_code     VARCHAR(20),
        default_unit   VARCHAR(30),
        aliases        TEXT[] NOT NULL DEFAULT '{}',
        ref_low        NUMERIC,
        ref_high       NUMERIC,
        ref_text       VARCHAR(100),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_param_catalog_aliases ON lab_parameter_catalog USING GIN (aliases)`);

    let seeded = 0;
    for (const [name, loinc, unit, aliases] of CATALOG) {
      const r = await client.query(
        `INSERT INTO lab_parameter_catalog (canonical_name, loinc_code, default_unit, aliases)
         VALUES ($1,$2,$3,$4) ON CONFLICT (canonical_name) DO NOTHING`,
        [name, loinc, unit, aliases]
      );
      seeded += r.rowCount;
    }
    console.log(`✅ lab_parameter_catalog: ${CATALOG.length} entries present (${seeded} newly inserted)`);

    // Verification snapshot (inside the txn, before commit/rollback)
    const { rows: cols } = await client.query(`
      SELECT count(*) AS n FROM information_schema.columns
      WHERE table_name='lab_results' AND column_name IN
        ('patient_id','canonical_name','loinc_code','confidence','page','source_text',
         'ocr_method','extraction_method','verification_status','verified_by','verified_at')
    `);
    const { rows: pc } = await client.query(`SELECT count(*) AS n FROM lab_results WHERE patient_id IS NOT NULL`);
    const { rows: cc } = await client.query(`SELECT count(*) AS n FROM lab_parameter_catalog`);
    console.log(`\n   lab_results new columns present: ${cols[0].n}/11`);
    console.log(`   lab_results rows with patient_id : ${pc[0].n}`);
    console.log(`   lab_parameter_catalog rows       : ${cc[0].n}`);

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n🧪 DRY RUN — all changes rolled back, nothing persisted.');
    } else {
      await client.query('COMMIT');
      console.log('\n✅ WP0 migration committed.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ WP0 migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS lab_parameter_catalog`);
    await client.query(`DROP INDEX IF EXISTS idx_lab_results_patient_created`);
    await client.query(`DROP INDEX IF EXISTS idx_lab_results_loinc`);
    await client.query(`DROP INDEX IF EXISTS idx_lab_results_verification`);
    await client.query(`
      ALTER TABLE lab_results
        DROP COLUMN IF EXISTS patient_id,
        DROP COLUMN IF EXISTS canonical_name,
        DROP COLUMN IF EXISTS loinc_code,
        DROP COLUMN IF EXISTS confidence,
        DROP COLUMN IF EXISTS page,
        DROP COLUMN IF EXISTS source_text,
        DROP COLUMN IF EXISTS ocr_method,
        DROP COLUMN IF EXISTS extraction_method,
        DROP COLUMN IF EXISTS verification_status,
        DROP COLUMN IF EXISTS verified_by,
        DROP COLUMN IF EXISTS verified_at
    `);
    await client.query('COMMIT');
    console.log('✅ WP0 migration reverted.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// CLI: `node report-observations-canonical.migration.js [--dry-run|--down]`
// or via the SSM loader: `node ssm-env-loader.mjs <this file> [--dry-run|--down]`
// (the loader imports this module, so detect our name anywhere in argv, and read flags from argv).
if (process.argv.some((a) => a && a.includes('report-observations-canonical'))) {
  const flags = process.argv.slice(2);
  const run = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  run.then(() => process.exit(0)).catch(() => process.exit(1));
}
