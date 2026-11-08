/**
 * F-1 pre-change probe — READ-ONLY.
 * Measures, platform-wide, how teleconsult capability is actually stored, so the
 * replacement predicate for `consultationType=online` can be chosen safely.
 */
import pool from '../db/pgPool.js';

const q = async (sql) => {
  try { return (await pool.query(sql)).rows; }
  catch (e) { return { __err: e.message }; }
};
const show = (label, rows) => {
  console.log(`\n=== ${label} ===`);
  if (rows.__err) { console.log('  ERR', rows.__err); return; }
  for (const r of rows) console.log(' ', r);
};

show('active doctors: capability signals', await q(`
  SELECT COUNT(*)::int AS active_total,
         COUNT(*) FILTER (WHERE "isOnline" = true)::int                                AS is_online_now,
         COUNT(*) FILTER (WHERE "consultationTypes" IS NULL)::int                      AS ct_null,
         COUNT(*) FILTER (WHERE "consultationTypes" = '{}'::jsonb)::int                AS ct_empty,
         COUNT(*) FILTER (WHERE "consultationTypes"->'online'->'available' = 'true'::jsonb)::int AS ct_online_true_camel,
         COUNT(*) FILTER (WHERE "consultationTypes"->'walkIn'->'available'  = 'true'::jsonb)::int AS ct_walkin_true_camel,
         COUNT(*) FILTER (WHERE "consultationTypes"->'walk_in'->'available' = 'true'::jsonb)::int AS ct_walkin_true_snake,
         COUNT(*) FILTER (WHERE "onlineConsultationFee" IS NOT NULL)::int              AS has_online_fee
    FROM doctors WHERE status='active'`));

// Exactly what values appear under online.available — guards against a bad ::boolean cast
show('distinct raw values of consultationTypes->online->available', await q(`
  SELECT "consultationTypes"->'online'->>'available' AS raw_value,
         pg_typeof("consultationTypes"->'online'->'available')::text AS jsonb_type,
         COUNT(*)::int AS n
    FROM doctors WHERE status='active'
   GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12`));

// Top-level key spellings actually present in the JSONB
show('top-level keys inside consultationTypes', await q(`
  SELECT k AS key, COUNT(*)::int AS n
    FROM doctors, LATERAL jsonb_object_keys(COALESCE("consultationTypes",'{}'::jsonb)) AS k
   WHERE status='active' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`));

// Candidate predicates side by side, on ACTIVE doctors
console.log('\n=== candidate predicates (active doctors matched) ===');
for (const [label, pred] of [
  ['CURRENT  "isOnline" = true',                                            `"isOnline" = true`],
  ['A  online.available = true (jsonb compare, cast-safe)',                 `"consultationTypes"->'online'->'available' = 'true'::jsonb`],
  ['B  A OR onlineConsultationFee IS NOT NULL',                             `("consultationTypes"->'online'->'available' = 'true'::jsonb OR "onlineConsultationFee" IS NOT NULL)`],
  ['C  A OR isOnline = true  (capability OR presence)',                     `("consultationTypes"->'online'->'available' = 'true'::jsonb OR "isOnline" = true)`],
]) {
  const r = await q(`SELECT COUNT(*)::int AS n FROM doctors WHERE status='active' AND ${pred}`);
  console.log(`  ${label.padEnd(56)} -> ${r.__err ? `ERR ${r.__err}` : r[0].n}`);
}

// Same, restricted to the verified set the /available route returns by default
console.log('\n=== same, verified + active (what /available returns) ===');
for (const [label, pred] of [
  ['CURRENT  "isOnline" = true', `"isOnline" = true`],
  ['A  online.available = true', `"consultationTypes"->'online'->'available' = 'true'::jsonb`],
]) {
  const r = await q(`SELECT COUNT(*)::int AS n FROM doctors WHERE status='active' AND "isVerified"=true AND ${pred}`);
  console.log(`  ${label.padEnd(56)} -> ${r.__err ? `ERR ${r.__err}` : r[0].n}`);
}

// Would fixing strictQc's OR-branch widen it? (it can only add, never remove)
show('strictQc impact: online-capable doctors with NO usable address', await q(`
  SELECT COUNT(*)::int AS would_newly_pass_strict_qc
    FROM doctors
   WHERE status='active'
     AND "consultationTypes"->'online'->'available' = 'true'::jsonb
     AND NOT (
       ("clinicAddress" IS NOT NULL AND BTRIM("clinicAddress") <> '')
       OR COALESCE("clinicAddress_json", '{}'::jsonb) <> '{}'::jsonb
     )`));

console.log('\ndone (read-only).');
await pool.end();
