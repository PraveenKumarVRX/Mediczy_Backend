/**
 * MED-MIND-001 — live INSERT-path verification. WRITES NOTHING.
 *
 * The HTTP contract tests use a mocked pool, so they prove the handler's logic
 * but not that its SQL matches the real table. This runs the route's exact
 * INSERT and SELECT against production inside a transaction that is always
 * ROLLED BACK, so a column-name or type mismatch surfaces here rather than as a
 * 500 for the first patient who takes a check-in.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import pool from '../db/pgPool.js';
import { score } from '../services/mental-wellness-instruments.service.js';

const client = await pool.connect();
let ok = true;
const fail = (msg) => { ok = false; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

try {
  await client.query('BEGIN');

  // A throwaway enrollment to satisfy the FK, inside the rolled-back transaction.
  const { rows: [prog] } = await client.query(
    `SELECT id FROM health_programs ORDER BY id LIMIT 1`);
  if (!prog) throw new Error('no health_programs row to attach a test enrollment to');

  const { rows: [enr] } = await client.query(
    `INSERT INTO program_enrollments (user_id, program_id, start_date)
     VALUES (-1, $1, CURRENT_DATE) RETURNING id`, [prog.id]);
  pass(`scratch enrollment ${enr.id} created (will be rolled back)`);

  // ── The route's exact INSERT ────────────────────────────────────────────────
  const result = score('PHQ9', [1, 1, 1, 1, 1, 1, 1, 1, 2]); // 10 -> moderate, crisis
  const { rows: [saved] } = await client.query(`
    INSERT INTO program_assessment_responses
      (enrollment_id, assessment_id, instrument_code, instrument_ver,
       answers, raw_score, severity_band, flagged_items, is_self_report)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
    RETURNING id, administered_at
  `, [
    enr.id, null, result.instrumentCode, result.instrumentVersion,
    JSON.stringify(result.answers), result.rawScore, result.band,
    JSON.stringify(result.flaggedItems),
  ]);
  pass(`INSERT accepted (id ${saved.id}, administered_at ${saved.administered_at})`);

  if (result.band !== 'moderate') fail(`expected band 'moderate', got '${result.band}'`);
  if (!result.crisis) fail('expected crisis=true for item 9 = 2');

  // ── The route's exact history SELECT ───────────────────────────────────────
  const { rows } = await client.query(`
    SELECT id, instrument_code, instrument_ver, raw_score, severity_band,
           flagged_items, administered_at
      FROM program_assessment_responses
     WHERE enrollment_id = $1
       AND ($2::text IS NULL OR instrument_code = $2)
     ORDER BY administered_at DESC
     LIMIT $3
  `, [enr.id, null, 50]);
  if (rows.length !== 1) fail(`history SELECT returned ${rows.length} rows, expected 1`);
  else {
    pass('history SELECT returned the row');
    const r = rows[0];
    if (Number(r.raw_score) !== 10) fail(`raw_score round-trip: got ${r.raw_score}`);
    if (r.severity_band !== 'moderate') fail(`severity_band round-trip: got ${r.severity_band}`);
    if (JSON.stringify(r.flagged_items) !== JSON.stringify(['PHQ9_Q9'])) {
      fail(`flagged_items round-trip: got ${JSON.stringify(r.flagged_items)}`);
    } else pass('raw_score / severity_band / flagged_items all round-trip correctly');
  }

  // The instrumentCode filter branch, which the mocked tests could not exercise.
  const { rows: filtered } = await client.query(
    `SELECT id FROM program_assessment_responses
      WHERE enrollment_id = $1 AND ($2::text IS NULL OR instrument_code = $2)`,
    [enr.id, 'GAD7']);
  if (filtered.length !== 0) fail('instrumentCode filter did not exclude a non-matching code');
  else pass('instrumentCode filter works');

  // ── 'audio' content type, widened by the migration ────────────────────────
  try {
    await client.query(`
      INSERT INTO program_content (program_id, content_type, title, published)
      VALUES ($1,'audio','scratch audio row',TRUE)`, [prog.id]);
    pass("program_content accepts content_type 'audio'");
  } catch (e) {
    fail(`program_content rejected 'audio': ${e.message}`);
  }

  // ── The privacy invariant, as a live assertion ─────────────────────────────
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='program_assessment_responses'`);
  const leak = cols.map((c) => c.column_name).filter((n) => /corporate|employer|tenant|org/i.test(n));
  if (leak.length) fail(`employer-linking column present: ${leak.join(', ')}`);
  else pass('no employer-linking column (mental-health data cannot reach HR aggregation)');
} catch (err) {
  ok = false;
  console.log(`  FAIL  ${err.message}`);
} finally {
  await client.query('ROLLBACK');
  console.log('\nROLLED BACK — nothing was written to production.');
  client.release();
  await pool.end();
}

console.log(ok ? '\nRESULT: live insert path OK' : '\nRESULT: PROBLEMS FOUND (see FAIL lines)');
if (!ok) process.exitCode = 1;

// Loader-aware guard not needed: this script has no exports and runs on import.
void path; void pathToFileURL;
