/**
 * F-1 (part 2) pre-change probe — READ-ONLY.
 * `consultationType=walkIn` returns 0 live. Decompose inPersonCapabilityLiteral
 * to find which conjunct is empty.
 */
import pool from '../db/pgPool.js';

const q = async (sql) => {
  try { return (await pool.query(sql)).rows[0]; }
  catch (e) { return { __err: e.message }; }
};

const HAS_ADDRESS = `(
  ("clinicAddress" IS NOT NULL AND BTRIM("clinicAddress") <> '')
  OR COALESCE("clinicAddress_json", '{}'::jsonb) <> '{}'::jsonb
)`;

const GOOGLE_VERIFIED = `(
  COALESCE("clinicAddress_json"->>'placeId', "clinicAddress_json"->>'place_id',
           "clinicAddress_json"->>'googlePlaceId', "clinicAddress_json"->>'google_place_id','') <> ''
  OR (COALESCE("clinicAddress_json"->>'source','') ILIKE 'google%'
      AND COALESCE("clinicAddress_json"->>'verificationStatus','') IN ('verified','VERIFIED'))
  OR (COALESCE("clinicAddress_json"->>'provider','') ILIKE 'google%'
      AND (("clinicAddress_json" ? 'lat') OR ("clinicAddress_json" ? 'latitude'))
      AND (("clinicAddress_json" ? 'lng') OR ("clinicAddress_json" ? 'longitude') OR ("clinicAddress_json" ? 'lon')))
)`;

const CT_WALKIN = `("consultationTypes"->'walkIn'->'available' = 'true'::jsonb)`;

console.log('=== decomposing the in-person predicate (active doctors) ===');
for (const [label, pred] of [
  ['active total',                                      `TRUE`],
  ['hasAddress',                                        HAS_ADDRESS],
  ['googleVerifiedLocation  <-- suspect',               GOOGLE_VERIFIED],
  ['CURRENT: hasAddress AND googleVerified',            `${HAS_ADDRESS} AND ${GOOGLE_VERIFIED}`],
  ['consultationTypes.walkIn.available = true',         CT_WALKIN],
  ['PROPOSED: walkIn capability AND hasAddress',        `${CT_WALKIN} AND ${HAS_ADDRESS}`],
  ['alt: hasAddress only',                              HAS_ADDRESS],
]) {
  const r = await q(`SELECT COUNT(*)::int AS n FROM doctors WHERE status='active' AND ${pred}`);
  console.log(`  ${label.padEnd(46)} -> ${r.__err ? `ERR ${r.__err}` : r.n}`);
}

console.log('\n=== verified + active (what /available returns by default) ===');
for (const [label, pred] of [
  ['CURRENT: hasAddress AND googleVerified',     `${HAS_ADDRESS} AND ${GOOGLE_VERIFIED}`],
  ['PROPOSED: walkIn capability AND hasAddress', `${CT_WALKIN} AND ${HAS_ADDRESS}`],
]) {
  const r = await q(`SELECT COUNT(*)::int AS n FROM doctors WHERE status='active' AND "isVerified"=true AND ${pred}`);
  console.log(`  ${label.padEnd(46)} -> ${r.__err ? `ERR ${r.__err}` : r.n}`);
}

console.log('\n=== homeVisit capability ===');
let r = await q(`SELECT COUNT(*) FILTER (WHERE "consultationTypes"->'homeVisit'->'available' = 'true'::jsonb)::int AS n
                   FROM doctors WHERE status='active'`);
console.log('  consultationTypes.homeVisit.available = true ->', r.__err ? `ERR ${r.__err}` : r.n);

console.log('\n=== what IS in clinicAddress_json? (key frequency, top 15) ===');
try {
  const { rows } = await pool.query(`
    SELECT k AS key, COUNT(*)::int AS n
      FROM doctors, LATERAL jsonb_object_keys(COALESCE("clinicAddress_json",'{}'::jsonb)) k
     WHERE status='active' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  for (const x of rows) console.log(`  ${String(x.n).padStart(5)}  ${x.key}`);
} catch (e) { console.log('  ERR', e.message); }

console.log('\n=== mental-health specialists, in-person ===');
r = await q(`SELECT COUNT(*)::int AS n FROM doctors
              WHERE status='active'
                AND (specialization ILIKE '%psychiatr%' OR specialization ILIKE '%psycholog%')
                AND ${CT_WALKIN} AND ${HAS_ADDRESS}`);
console.log('  walkIn-capable WITH an address ->', r.__err ? `ERR ${r.__err}` : r.n);

console.log('\ndone (read-only).');
await pool.end();
