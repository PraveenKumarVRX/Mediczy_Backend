#!/usr/bin/env node
/**
 * READ-ONLY audit of every integer column that points at an organisation-type entity.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ci/audit-entity-references.mjs [--json out.json]
 *
 * "603 integer cross-entity columns" is a raw count that includes empty tables and treats every
 * column as equally risky. This measures what matters:
 *
 *   - which columns live in POPULATED tables (an empty table needs no data migration);
 *   - what each column actually points at: a declared foreign key, or only its name, or neither;
 *   - which id-spaces its values fit. Small integers exist in several id-spaces at once (the
 *     `hospitals` directory has 10,776 rows, so almost any value fits it); a column whose values
 *     fit more than one space cannot be resolved from the data alone;
 *   - dangling values (in no space at all);
 *   - rows whose value sits in the tenants/corporates COLLISION set, the only rows that can be
 *     misattributed by an integer comparison today;
 *   - which tables Row-Level Security keys on, since those policies are the highest-value consumers.
 */
import fs from 'node:fs';
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const q = async (s, a = []) => (await db.query(s, a)).rows;
const JSON_OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

// The id-spaces an entity reference can point into.
const SPACES = ['tenants', 'corporates', 'hospitals', 'labs', 'pharmacies', 'tpas', 'insurance_companies',
  'insurance_brokers', 'ambulances', 'homecare_providers', 'provider_clinics'];
// What a column's NAME says it references (the convention, to be confirmed by data or by a foreign key).
const NAME_TARGET = {
  tenant_id: 'tenants', corporate_id: 'corporates', hospital_id: 'hospitals', lab_id: 'labs',
  pharmacy_id: 'pharmacies', tpa_id: 'tpas', clinic_id: 'provider_clinics', broker_id: 'insurance_brokers',
  insurer_id: 'insurance_companies', ambulance_id: 'ambulances', homecare_id: 'homecare_providers',
};
const FAMILY = /(^|_)(tenant|organization|organisation|org|hospital|corporate|tpa|lab|pharmacy|clinic|broker|insurer|ngo|psu|ambulance|homecare|diagnostic|wellness|aggregator|company)_id$/;

const cols = await q(`
  SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
   WHERE c.table_schema='public' AND c.data_type IN ('integer','bigint','smallint')
     AND c.table_name !~ '^(backup_|_probe|pg_)'
   ORDER BY 1,2`);
const candidates = cols.filter((c) => FAMILY.test(c.column_name));

// declared foreign keys
const fks = new Map();
for (const r of await q(`
  SELECT conrelid::regclass::text AS tbl, a.attname AS col, confrelid::regclass::text AS target
    FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey)
   WHERE k.contype='f' AND array_length(k.conkey,1)=1`)) fks.set(`${r.tbl}.${r.col}`, r.target);

// columns referenced by RLS policies
const rlsCols = new Map();
for (const r of await q(`SELECT tablename, qual FROM pg_policies WHERE schemaname='public'`)) {
  for (const m of String(r.qual || '').matchAll(/\b([a-z_]*(?:tenant|organization|org)_id)\b/g)) {
    if (!rlsCols.has(r.tablename)) rlsCols.set(r.tablename, new Set());
    rlsCols.get(r.tablename).add(m[1]);
  }
}

const collision = (await q('SELECT t.id FROM tenants t JOIN corporates c ON c.id = t.id ORDER BY 1')).map((r) => Number(r.id));

const populated = new Map();
async function isPopulated(t) {
  if (!populated.has(t)) populated.set(t, (await q(`SELECT EXISTS (SELECT 1 FROM ${JSON.stringify(t)}) e`))[0].e);
  return populated.get(t);
}

await db.query("SET statement_timeout = '30s'");
const report = [];
for (const c of candidates) {
  const t = c.table_name;
  const col = c.column_name;
  const key = `${t}.${col}`;
  const row = { table: t, column: col, populated: false, rows: 0, nonNull: 0, distinct: 0, fk: fks.get(key) || null,
                nameTarget: NAME_TARGET[col] || null, fits: [], dangling: 0, collisionRows: 0, rls: !!rlsCols.get(t)?.has(col), error: null };
  try {
    if (!(await isPopulated(t))) { report.push(row); continue; }
    row.populated = true;
    const id = JSON.stringify(col);
    const tb = JSON.stringify(t);
    const fitSql = SPACES.map((s, i) => `count(*) FILTER (WHERE v IN (SELECT id FROM ${s})) AS f${i}`).join(', ');
    const r = (await q(`
      WITH d AS (SELECT DISTINCT ${id} AS v FROM ${tb} WHERE ${id} IS NOT NULL)
      SELECT count(*) AS n, ${fitSql},
             count(*) FILTER (WHERE NOT (${SPACES.map((s) => `v IN (SELECT id FROM ${s})`).join(' OR ')})) AS dangling
        FROM d`))[0];
    const tot = (await q(`SELECT count(*) AS rows, count(${id}) AS nn,
                                 count(*) FILTER (WHERE ${id} = ANY($1::int[])) AS coll FROM ${tb}`, [collision]))[0];
    row.rows = Number(tot.rows); row.nonNull = Number(tot.nn); row.distinct = Number(r.n);
    row.dangling = Number(r.dangling); row.collisionRows = Number(tot.coll);
    // a space "fits" when EVERY distinct non-null value exists in it
    row.fits = SPACES.filter((s, i) => Number(r.n) > 0 && Number(r[`f${i}`]) === Number(r.n));
  } catch (e) { row.error = String(e.message).split('\n')[0]; }
  report.push(row);
}

const verdict = (r) => {
  if (!r.populated) return 'empty';
  if (r.error) return 'error';
  if (r.nonNull === 0) return 'all-null';
  if (r.dangling > 0) return 'dangling';
  if (r.fk) return 'fk-declared';
  if (r.fits.length > 1) return 'value-ambiguous';
  if (r.fits.length === 1) return 'fits-one-space';
  return 'fits-none';
};
for (const r of report) r.verdict = verdict(r);

// ── report ────────────────────────────────────────────────────────────────────
const pop = report.filter((r) => r.populated);
console.log(`database: ${(await q('SELECT current_database() d'))[0].d}`);
console.log(`\ncandidate integer reference columns : ${report.length}`);
console.log(`  in EMPTY tables (no data to migrate): ${report.length - pop.length}`);
console.log(`  in POPULATED tables                 : ${pop.length}   (${new Set(pop.map((r) => r.table)).size} tables, ${pop.reduce((a, r) => a + r.rows, 0).toLocaleString()} rows)`);
console.log(`  tenants/corporates collision set    : ${JSON.stringify(collision)}`);

console.log('\n── by column family (populated only) ──');
const fam = {};
for (const r of pop) { const k = r.column.replace(/^.*?(?=(tenant|organization|organisation|org|hospital|corporate|tpa|lab|pharmacy|clinic|broker|insurer|ngo|psu|ambulance|homecare|diagnostic|wellness|aggregator|company)_id$)/, ''); (fam[k] ||= []).push(r); }
for (const [k, v] of Object.entries(fam).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(18)} ${String(v.length).padStart(3)} columns  ${String(v.reduce((a, r) => a + r.rows, 0).toLocaleString()).padStart(10)} rows`);
}

console.log('\n── what each populated column actually points at ──');
const vc = {};
for (const r of pop) vc[r.verdict] = (vc[r.verdict] || 0) + 1;
const explain = {
  'fk-declared': 'a foreign key says what it references',
  'fits-one-space': 'no FK, but its values fit exactly one id-space',
  'value-ambiguous': 'no FK, and its values fit SEVERAL id-spaces: cannot be resolved from data',
  'dangling': 'some values exist in NO id-space (orphaned references)',
  'all-null': 'populated table, column never set',
  'fits-none': 'no values fit any space', 'error': 'could not be read',
};
for (const [k, n] of Object.entries(vc).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k.padEnd(16)} ${explain[k] || ''}`);

console.log('\n── value-ambiguous columns, which space does the NAME say? ──');
const amb = pop.filter((r) => r.verdict === 'value-ambiguous');
const byName = {};
for (const r of amb) { const k = r.nameTarget || '(name says nothing: organization_id/org_id)'; (byName[k] ||= []).push(r); }
for (const [k, v] of Object.entries(byName)) console.log(`  ${String(v.length).padStart(3)} columns named for ${k}`);

console.log('\n── LIVE RISK: rows whose value is in the tenants/corporates collision set ──');
const risky = pop.filter((r) => r.collisionRows > 0).sort((a, b) => b.collisionRows - a.collisionRows);
console.log(`  ${risky.length} populated columns hold at least one collision value; ${risky.reduce((a, r) => a + r.collisionRows, 0).toLocaleString()} rows in total`);
for (const r of risky.slice(0, 25)) {
  console.log(`  ${(r.table + '.' + r.column).padEnd(52)} ${String(r.collisionRows).padStart(7)} of ${String(r.rows).padStart(8)} rows  ${r.fk ? 'FK→' + r.fk : r.nameTarget ? 'name→' + r.nameTarget : 'no FK, name vague'}${r.rls ? '  [RLS]' : ''}`);
}

console.log('\n── dangling references (values in no id-space) ──');
const dang = pop.filter((r) => r.dangling > 0).sort((a, b) => b.dangling - a.dangling);
console.log(`  ${dang.length} columns`);
for (const r of dang.slice(0, 12)) console.log(`  ${(r.table + '.' + r.column).padEnd(52)} ${r.dangling} distinct orphaned value(s) across ${r.rows} rows`);

console.log('\n── RLS-keyed columns (the policies the uid rule must eventually key on) ──');
const rls = pop.filter((r) => r.rls);
console.log(`  ${rls.length} populated columns are referenced by an RLS policy`);
const rlsTables = {};
for (const r of rls) rlsTables[r.verdict] = (rlsTables[r.verdict] || 0) + 1;
console.log('  by verdict:', JSON.stringify(rlsTables));

console.log('\n── largest populated reference columns ──');
for (const r of [...pop].sort((a, b) => b.rows - a.rows).slice(0, 12)) {
  console.log(`  ${(r.table + '.' + r.column).padEnd(52)} ${String(r.rows.toLocaleString()).padStart(10)} rows  ${r.verdict.padEnd(15)} fits=[${r.fits.join(',')}]`);
}

if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ collision, report }, null, 1)); console.log(`\nfull detail written to ${JSON_OUT}`); }
process.exit(0);
