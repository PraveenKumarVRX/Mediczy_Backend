/** MED-MIND-001 — post-seed integrity check. READ-ONLY. */
import pool from '../db/pgPool.js';

const { rows } = await pool.query(`
  SELECT p.id, p.slug, p.name, p.status, p.category, p.coach_type, p.duration_days,
         (SELECT COUNT(*) FROM program_tracking_params t WHERE t.program_id = p.id)::int AS params,
         (SELECT COUNT(*) FROM program_tasks k        WHERE k.program_id = p.id)::int AS tasks,
         (SELECT COUNT(*) FROM program_content c      WHERE c.program_id = p.id)::int AS content,
         (SELECT COUNT(*) FROM program_content c      WHERE c.program_id = p.id AND c.content_type='audio')::int AS audio,
         (SELECT COUNT(*) FROM program_assessments a  WHERE a.program_id = p.id)::int AS assessments
    FROM health_programs p
   WHERE p.slug IN ('mood-care','calm-resilience','sleep-reset')
   ORDER BY p.sort_order`);

const EXPECTED = {
  'mood-care':       { params: 3, tasks: 4, content: 3, audio: 1, assessments: 1, coach_type: 'hybrid' },
  'calm-resilience': { params: 3, tasks: 4, content: 3, audio: 1, assessments: 1, coach_type: 'hybrid' },
  'sleep-reset':     { params: 2, tasks: 3, content: 2, audio: 1, assessments: 0, coach_type: 'ai' },
};

let ok = true;
console.log('=== seeded mental-wellness programs ===');
for (const r of rows) {
  const e = EXPECTED[r.slug];
  const bad = Object.entries(e).filter(([k, v]) => r[k] !== v);
  console.log(`  ${r.status === 'active' ? 'ACTIVE' : r.status.toUpperCase()}  id=${r.id} ${r.slug.padEnd(16)} `
    + `${r.coach_type.padEnd(7)} ${r.duration_days}d  params=${r.params} tasks=${r.tasks} `
    + `content=${r.content}(audio ${r.audio}) assessments=${r.assessments}`);
  if (r.status !== 'active') { ok = false; console.log(`     FAIL not active`); }
  if (r.category !== 'mental_health') { ok = false; console.log(`     FAIL category=${r.category}`); }
  for (const [k, v] of bad) { ok = false; console.log(`     FAIL ${k}: expected ${v}, got ${r[k]}`); }
}
if (rows.length !== 3) { ok = false; console.log(`  FAIL expected 3 programs, found ${rows.length}`); }

// The 7 pre-existing programs must be untouched and still active.
const { rows: [pre] } = await pool.query(`
  SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status='active')::int AS active
    FROM health_programs
   WHERE slug IN ('diabetes-reset','weight-reset','pcos-reset','fatty-liver-reset',
                  'corporate-wellness','hypertension-reset','executive-health')`);
console.log(`\npre-existing programs: ${pre.n}/7 present, ${pre.active} active`);
if (pre.n !== 7 || pre.active !== 7) { ok = false; console.log('  FAIL pre-existing programs were disturbed'); }

// Assessments must carry an instrument pointer, not scoring logic.
const { rows: asm } = await pool.query(`
  SELECT a.name, a.questions
    FROM program_assessments a JOIN health_programs p ON p.id = a.program_id
   WHERE p.slug IN ('mood-care','calm-resilience')`);
console.log('\nassessment definitions:');
for (const a of asm) {
  const q = a.questions || {};
  const pointerOnly = !!q.instrumentCode && !Array.isArray(q) && !q.items && !q.bands && !q.scoring;
  console.log(`  ${pointerOnly ? 'ok   ' : 'FAIL '} ${a.name} -> instrumentCode=${q.instrumentCode}`);
  if (!pointerOnly) ok = false;
}

// Nobody has taken a check-in yet; just prove the table is queryable.
const { rows: [resp] } = await pool.query(`SELECT COUNT(*)::int AS n FROM program_assessment_responses`);
console.log(`\nprogram_assessment_responses: ${resp.n} rows`);

console.log(ok ? '\nRESULT: seed OK' : '\nRESULT: PROBLEMS FOUND');
if (!ok) process.exitCode = 1;
await pool.end();
