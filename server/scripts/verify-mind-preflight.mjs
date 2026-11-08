/**
 * MED-MIND-001 Phase 0 preflight — READ-ONLY.
 *
 * Answers PF-1 (do the coaching-framework tables exist?), PF-2 (is anything seeded?)
 * and the data half of PF-4 (is the mental-health subscore real?).
 *
 * Performs SELECTs only. Writes nothing. Creates nothing.
 *   cd server && node scripts/ssm-env-loader.mjs scripts/verify-mind-preflight.mjs
 */
import pool from '../db/pgPool.js';

const FRAMEWORK = [
  'health_programs', 'program_tracking_params', 'program_tasks', 'program_content',
  'program_assessments', 'program_enrollments', 'program_task_logs',
  'program_health_scores', 'program_device_connections',
];
const RELATED = [
  'program_assessment_responses',           // the table this plan adds — expect MISSING
  'ai_health_risk_scores', 'his_scores', 'health_diary',
  'wellness_checkins', 'wellness_programs', // concurrent session's lane
];

const q = async (sql, params = []) => {
  try { return (await pool.query(sql, params)).rows; }
  catch (e) { return { __err: e.message }; }
};

const main = async () => {
  // ── PF-1 ───────────────────────────────────────────────────────────────────
  const rows = await q(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [[...FRAMEWORK, ...RELATED]],
  );
  if (rows.__err) { console.error('FATAL:', rows.__err); await pool.end(); process.exit(1); }
  const present = new Set(rows.map((r) => r.table_name));

  console.log('\n=== PF-1: coaching-framework tables ===');
  for (const t of FRAMEWORK) console.log(`  ${present.has(t) ? 'PRESENT' : 'MISSING'}  ${t}`);
  const frameworkApplied = FRAMEWORK.every((t) => present.has(t));
  console.log(`  -> VERDICT: framework ${frameworkApplied ? 'IS applied' : 'is NOT (fully) applied'}`);

  console.log('\n=== related tables ===');
  for (const t of RELATED) console.log(`  ${present.has(t) ? 'PRESENT' : 'MISSING'}  ${t}`);

  // ── PF-2 ───────────────────────────────────────────────────────────────────
  console.log('\n=== PF-2: is anything seeded? ===');
  for (const t of ['health_programs', 'program_enrollments', 'program_task_logs']) {
    if (!present.has(t)) { console.log(`  ${t}: table missing`); continue; }
    const r = await q(`SELECT COUNT(*)::int AS n FROM ${t}`);
    console.log(`  ${t}: ${r.__err ? `ERR ${r.__err}` : `${r[0].n} rows`}`);
  }
  if (present.has('health_programs')) {
    const r = await q(
      `SELECT slug, category, status, coach_type FROM health_programs ORDER BY id LIMIT 20`,
    );
    if (!r.__err && r.length) {
      console.log('  existing programs:');
      for (const p of r) console.log(`    ${p.status.padEnd(9)} ${p.category.padEnd(20)} ${p.coach_type.padEnd(7)} ${p.slug}`);
    } else if (!r.__err) {
      console.log('  -> EMPTY: "My Programs" nav item is hidden from every patient today');
    }
  }

  // ── PF-4 (data half; the code half is already resolved) ────────────────────
  console.log('\n=== PF-4: mental-health subscore in the wild ===');
  if (present.has('ai_health_risk_scores')) {
    const r = await q(`
      SELECT COUNT(*)::int                                   AS total,
             COUNT(subscores->'mental_health')::int          AS with_mh,
             COUNT(DISTINCT subscores->>'mental_health')::int AS distinct_mh,
             MIN(subscores->>'mental_health')                AS min_mh,
             MAX(subscores->>'mental_health')                AS max_mh,
             MAX(model_version)                              AS model_version
        FROM ai_health_risk_scores`);
    console.log('  ai_health_risk_scores:', r.__err ? `ERR ${r.__err}` : r[0]);
    console.log('  -> distinct_mh = 1 confirms the hardcoded 7.0 constant reaches every patient');
  }
  if (present.has('his_scores')) {
    const r = await q(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT mental_health_score)::int AS distinct_mh,
              MAX(algorithm_version) AS algo FROM his_scores`);
    console.log('  his_scores:', r.__err ? `ERR ${r.__err}` : r[0]);
  }

  // Does any patient actually log mood today? (sizes the Phase 2 surface)
  if (present.has('health_diary')) {
    const r = await q(`
      SELECT "entryType" AS t, COUNT(*)::int AS n, COUNT(mood)::int AS mood_col_set
        FROM health_diary GROUP BY 1 ORDER BY 2 DESC LIMIT 12`);
    console.log('\n=== health_diary usage (sizes Phase 2) ===');
    if (r.__err) console.log('  ERR', r.__err);
    else for (const x of r) console.log(`  ${String(x.t).padEnd(16)} ${String(x.n).padStart(6)} rows, mood column set on ${x.mood_col_set}`);
  }

  // Mental-health specialists (PF-3 already answered by the owner; this sizes it)
  console.log('\n=== mental-health specialists (PF-3 context) ===');
  const docs = await q(`
    SELECT specialization,
           COUNT(*)::int                                          AS total,
           COUNT(*) FILTER (WHERE "isOnline" = true)::int          AS online_capable,
           COUNT(*) FILTER (WHERE "onlineConsultationFee" = 500)::int AS placeholder_fee_500
      FROM doctors
     WHERE status = 'active'
       AND (specialization ILIKE '%psychiatr%' OR specialization ILIKE '%psycholog%')
     GROUP BY 1 ORDER BY 2 DESC`);
  if (docs.__err) console.log('  ERR', docs.__err);
  else if (!docs.length) console.log('  none found with these specialization strings');
  else for (const d of docs) console.log(`  ${String(d.specialization).padEnd(24)} total=${d.total} online=${d.online_capable} placeholderFee=${d.placeholder_fee_500}`);

  console.log('\ndone (read-only).');
  await pool.end();
};

main().catch(async (e) => { console.error('FATAL', e); try { await pool.end(); } catch {} process.exit(1); });
