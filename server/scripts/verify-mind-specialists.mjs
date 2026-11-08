/**
 * MED-MIND-001 follow-up — READ-ONLY.
 * Separates "doctor is logged in right now" (isOnline) from real teleconsult
 * capability (consultationTypes JSONB / fee fields) for mental-health specialists.
 */
import pool from '../db/pgPool.js';

const q = async (sql) => {
  try { return (await pool.query(sql)).rows; }
  catch (e) { return { __err: e.message }; }
};

const MH = `(specialization ILIKE '%psychiatr%' OR specialization ILIKE '%psycholog%')`;

console.log('=== teleconsult capability vs presence (active mental-health doctors) ===');
let r = await q(`
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "isOnline" = true)::int                                   AS is_online_now,
         COUNT(*) FILTER (WHERE "consultationTypes" IS NOT NULL)::int                     AS has_ct_json,
         COUNT(*) FILTER (WHERE ("consultationTypes"->'online'->>'available')::boolean)::int   AS ct_online_true,
         COUNT(*) FILTER (WHERE ("consultationTypes"->'walkIn'->>'available')::boolean)::int   AS ct_walkin_true,
         COUNT(*) FILTER (WHERE "onlineConsultationFee" IS NOT NULL)::int                 AS has_online_fee,
         COUNT(*) FILTER (WHERE "isVerified" = true)::int                                  AS verified
    FROM doctors WHERE status='active' AND ${MH}`);
console.log(r.__err ? `ERR ${r.__err}` : r[0]);

console.log('\n=== how many would the booking CTA actually return? ===');
for (const [label, pred] of [
  ["specialization = 'Psychiatrist' (exact, as appointmentIntent maps)", `specialization = 'Psychiatrist'`],
  ["specialization = 'Psychologist' (exact)",                            `specialization = 'Psychologist'`],
  ["specialization ILIKE '%psychiatr%' OR '%psycholog%' (fuzzy)",        MH],
]) {
  const x = await q(`SELECT COUNT(*)::int AS n FROM doctors WHERE status='active' AND ${pred}`);
  console.log(`  ${label.padEnd(62)} -> ${x.__err ? `ERR ${x.__err}` : x[0].n}`);
}

console.log('\n=== fee provenance (RK-9) ===');
r = await q(`
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "onlineConsultationFee" = 500)::int AS fee_exactly_500,
         COUNT(DISTINCT "onlineConsultationFee")::int               AS distinct_online_fees,
         COUNT(DISTINCT "walkInFee")::int                           AS distinct_walkin_fees
    FROM doctors WHERE status='active' AND ${MH}`);
console.log(r.__err ? `ERR ${r.__err}` : r[0]);

console.log('\n=== specialization string variants (fragmentation) ===');
r = await q(`
  SELECT specialization, COUNT(*)::int AS n FROM doctors
   WHERE status='active' AND ${MH} GROUP BY 1 ORDER BY 2 DESC`);
if (r.__err) console.log('ERR', r.__err);
else {
  let tot = 0;
  for (const x of r) { tot += x.n; console.log(`  ${String(x.n).padStart(3)}  ${x.specialization}`); }
  console.log(`  --- ${r.length} distinct strings, ${tot} doctors`);
}

console.log('\n=== do they have availability/slots? ===');
r = await q(`
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "weeklyAvailability" IS NOT NULL
                            AND "weeklyAvailability"::text NOT IN ('{}','null'))::int AS has_weekly
    FROM doctors WHERE status='active' AND ${MH}`);
console.log(r.__err ? `ERR ${r.__err}` : r[0]);

console.log('\ndone (read-only).');
await pool.end();
