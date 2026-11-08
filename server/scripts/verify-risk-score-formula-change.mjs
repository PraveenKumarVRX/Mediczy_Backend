/**
 * MED-MIND-001 G-10 — impact of the overall-risk formula correction. READ-ONLY.
 *
 * The old loop was `overall += (subscores[k] || 5) * Math.abs(weight)` over
 * weights that were NEGATIVE for the three "higher is better" subscores, so
 * Math.abs() discarded the sign and good adherence / lifestyle / mental health
 * all INCREASED computed risk. This prints old vs new overall_score and
 * risk_level for every stored row, so the blast radius is known before the cron
 * recomputes anything.
 */
import pool from '../db/pgPool.js';

const WEIGHTS = {
  cardiovascular: 0.25, diabetes: 0.20, hypertension: 0.20,
  medication_adherence: 0.15, lifestyle: 0.10, mental_health: 0.10,
};
const HIGHER_IS_BETTER = new Set(['medication_adherence', 'lifestyle', 'mental_health']);

const tier = (o) => (o >= 7 ? 'critical' : o >= 5.5 ? 'high' : o >= 3.5 ? 'moderate' : 'low');

const oldOverall = (s) => {
  let o = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) o += (s[k] || 5) * Math.abs(w);
  return Math.max(0, Math.min(10, o));
};

const newOverall = (s) => {
  let weighted = 0; let used = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const raw = s[k];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    weighted += (HIGHER_IS_BETTER.has(k) ? 10 - raw : raw) * w;
    used += w;
  }
  const o = used > 0 ? weighted / used : 5.0;
  return Math.max(0, Math.min(10, Math.round(o * 100) / 100));
};

const { rows } = await pool.query(
  `SELECT patient_id, overall_score, risk_level, subscores FROM ai_health_risk_scores ORDER BY patient_id`);

console.log(`rows: ${rows.length}\n`);
console.log('patient  stored          old->new overall   old->new tier');
let moved = 0;
const tally = {};
for (const r of rows) {
  const s = r.subscores || {};
  const o = oldOverall(s);
  const n = newOverall(s);
  const to = tier(o);
  const tn = tier(n);
  if (to !== tn) moved += 1;
  tally[`${to} -> ${tn}`] = (tally[`${to} -> ${tn}`] || 0) + 1;
  console.log(
    `${String(r.patient_id).padEnd(8)} ${String(r.overall_score).padEnd(6)} ${String(r.risk_level).padEnd(9)}`
    + ` ${o.toFixed(2)} -> ${n.toFixed(2)}`.padEnd(20)
    + ` ${to} -> ${tn}${to !== tn ? '   *CHANGED*' : ''}`,
  );
}

console.log(`\ntier transitions:`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\n${moved} of ${rows.length} rows change risk tier.`);

// Does the stored value match the OLD formula? If so, the old formula is what
// produced production data, confirming the diagnosis rather than assuming it.
const matches = rows.filter((r) => Math.abs(Number(r.overall_score) - oldOverall(r.subscores || {})) < 0.051).length;
console.log(`${matches} of ${rows.length} stored overall_score values reproduce from the OLD formula `
  + `(confirms the old formula is what ran in production).`);

// Sanity: a patient with perfect adherence/lifestyle/mental health should score
// BETTER than one with none, which was not true before.
const good = { cardiovascular: 2, diabetes: 2, hypertension: 2, medication_adherence: 10, lifestyle: 10, mental_health: 10 };
const bad = { cardiovascular: 2, diabetes: 2, hypertension: 2, medication_adherence: 1, lifestyle: 1, mental_health: 1 };
console.log(`\ndirection check (same disease risk, opposite habits):`);
console.log(`  healthy habits  old=${oldOverall(good).toFixed(2)} (${tier(oldOverall(good))})  new=${newOverall(good).toFixed(2)} (${tier(newOverall(good))})`);
console.log(`  poor habits     old=${oldOverall(bad).toFixed(2)} (${tier(oldOverall(bad))})  new=${newOverall(bad).toFixed(2)} (${tier(newOverall(bad))})`);
console.log(`  old formula rated healthy habits as ${oldOverall(good) > oldOverall(bad) ? 'HIGHER RISK — the bug' : 'lower risk'}`);
console.log(`  new formula rates healthy habits as ${newOverall(good) < newOverall(bad) ? 'lower risk — correct' : 'HIGHER RISK — still wrong'}`);

await pool.end();
