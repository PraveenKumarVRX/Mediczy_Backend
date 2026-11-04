/**
 * Migration: Report Observations — CONVERGE (WP3 Stage D, DESTRUCTIVE)
 * ===================================================================
 * Migrates the 17 legacy ai_report_lab_values rows into lab_results, DROPs ai_report_lab_values,
 * and replaces it with a compatibility VIEW over lab_results so HRA/HIS keep working unchanged.
 *
 * SAFETY:
 *  - Must ship in the SAME deploy as the report-analysis writer repoint (the code must stop
 *    INSERTing/CREATE-ing ai_report_lab_values before this view exists).
 *  - A verified restore + a row dump exist (see the rollback rehearsal / backup JSON).
 *  - The compat view is filtered to extraction_method IN ('llm','llm-legacy') so HRA sees the
 *    LLM-quality rows (the 17 migrated) and NOT the 80 messy regex rows — preserving its input.
 *
 * `--dry-run` runs the whole thing (migrate + drop + view + a consumer query) in a txn and ROLLs
 * BACK. `--down` recreates the base table (empty — restore rows from the backup JSON separately).
 */

import pool from '../db/pgPool.js';

const VIEW_SQL = `
  CREATE VIEW ai_report_lab_values AS
  SELECT lr.id, lr.patient_id, lr."reportId" AS report_id,
         COALESCE(lr.canonical_name, lr."testName") AS parameter_name,
         lr."value", lr.unit,
         COALESCE(NULLIF(lr.flag,''), CASE WHEN lr."isAbnormal" THEN 'abnormal' ELSE 'normal' END) AS status,
         lr."referenceRange" AS reference_range,
         lr."reportDate"::date AS report_date,
         lr."createdAt" AS extracted_at
  FROM lab_results lr
  WHERE lr.extraction_method IN ('llm','llm-legacy')`;

async function run(client) {
  // 1. Migrate the 17 legacy rows (guarded so re-runs don't duplicate).
  const migrated = await client.query(`
    INSERT INTO lab_results
      ("userId",patient_id,subject_uid,subject_kind,patient_uid,"testName","value","numericValue",unit,
       "referenceRange",flag,"isAbnormal","reportDate",extraction_method,verification_status,"reportId","createdAt","updatedAt")
    SELECT p."userId", v.patient_id, u.unique_id, 'user', p.unique_id, v.parameter_name, v.value,
           CASE WHEN v.value ~ '^[0-9.]+$' THEN v.value::numeric ELSE NULL END,
           v.unit, v.reference_range, v.status,
           (v.status IS NOT NULL AND lower(v.status) NOT IN ('normal','n','')),
           v.report_date, 'llm-legacy', 'verified', v.report_id, COALESCE(v.extracted_at, NOW()), NOW()
      FROM ai_report_lab_values v
      JOIN patients p ON p.id = v.patient_id
      JOIN users u ON u.id = p."userId"
     WHERE NOT EXISTS (
       SELECT 1 FROM lab_results lr WHERE lr.extraction_method='llm-legacy'
         AND lr.patient_id = v.patient_id AND lr."testName" = v.parameter_name
         AND COALESCE(lr."reportId",-1) = COALESCE(v.report_id,-1))
    RETURNING id`);
  console.log(`✅ migrated ${migrated.rowCount} legacy rows into lab_results (llm-legacy, verified)`);

  // 2. Drop the base table and create the compat view.
  await client.query(`DROP TABLE ai_report_lab_values`);
  await client.query(VIEW_SQL);
  console.log('✅ dropped ai_report_lab_values base table, created compat view (llm/llm-legacy only)');

  // 3. Prove the consumer query still works against the view (HRA/HIS shape).
  const probe = await client.query(
    `SELECT parameter_name, value, unit, status, reference_range, report_date
       FROM ai_report_lab_values WHERE patient_id = $1 AND extracted_at > NOW() - INTERVAL '6 months' LIMIT 5`, [13]);
  console.log(`✅ consumer query against view OK (returned ${probe.rows.length} rows for a sample patient)`);
}

export async function up(options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await run(client);
    if (dryRun) { await client.query('ROLLBACK'); console.log('\n🧪 DRY RUN — rolled back, base table intact.'); }
    else { await client.query('COMMIT'); console.log('\n✅ Converge committed. ai_report_lab_values is now a VIEW.'); }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Converge failed, rolled back:', err.message);
    throw err;
  } finally { client.release(); }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP VIEW IF EXISTS ai_report_lab_values`);
    await client.query(`CREATE TABLE IF NOT EXISTS ai_report_lab_values (
      id SERIAL PRIMARY KEY, patient_id INTEGER, report_id INTEGER, parameter_name VARCHAR(255) NOT NULL,
      value VARCHAR(100), unit VARCHAR(50), status VARCHAR(20), reference_range VARCHAR(100),
      report_date DATE, extracted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(patient_id, report_id, parameter_name))`);
    await client.query('COMMIT');
    console.log('✅ Reverted: base table recreated (EMPTY — restore rows from the backup JSON).');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (process.argv.some((a) => a && a.includes('report-observations-converge'))) {
  const flags = process.argv.slice(2);
  const r = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  r.then(() => process.exit(0)).catch(() => process.exit(1));
}
