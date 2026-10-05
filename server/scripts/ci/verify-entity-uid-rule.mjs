#!/usr/bin/env node
/**
 * Verify the entity UID rule holds. Exits non-zero on any violation, so it can gate CI or run on a
 * schedule.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs
 *   node scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs --fix     # also retire orphans
 *
 * Checks
 *   1. DRIFT       entity_kinds (database) and ENTITY_KIND_PREFIXES (utils/uniqueIdGenerator.js) agree.
 *   2. COVERAGE    every table under the rule: uid column NOT NULL, uniquely indexed, all three
 *                  triggers present, and every row registered exactly once.
 *   3. DISCOVERY   any base table that has a unique_id-style column but was never attached. This is
 *                  the check that catches the next entity table someone adds.
 *   4. PREFIX      every non-legacy organisation uid starts with its kind's prefix.
 *   5. ORPHANS     registry rows whose source row no longer exists and were never retired. These come
 *                  from INSERT ... ON CONFLICT DO UPDATE, which fires the BEFORE INSERT trigger for a
 *                  row that is then updated instead of inserted. Harmless, but reported; --fix retires them.
 *   6. REFERENCES  every uid twin (users.organization_uid, corporates.tenant_uid, ...) agrees with the
 *                  integer it shadows.
 */
import pool from '../../db/pgPool.js';
import { ENTITY_KIND_PREFIXES } from '../../utils/uniqueIdGenerator.js';

const db = pool.pool || pool.default || pool;
const FIX = process.argv.includes('--fix');
const q = async (s, a = []) => (await db.query(s, a)).rows;

let failures = 0;
let warnings = 0;
const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => { failures += 1; console.log(`  ❌ ${m}`); };
const warn = (m) => { warnings += 1; console.log(`  ⚠️  ${m}`); };

console.log(`database: ${(await q('SELECT current_database() d'))[0].d}\n`);

if (!(await q("SELECT to_regclass('public.entity_registry') r"))[0].r) {
  console.log('❌ entity_registry does not exist: the entity UID migration has not been applied.');
  process.exit(1);
}

// 1. drift --------------------------------------------------------------------
console.log('1. prefix drift (database vs utils/uniqueIdGenerator.js)');
const kinds = await q('SELECT kind, prefix FROM entity_kinds ORDER BY kind');
const dbMap = Object.fromEntries(kinds.map((k) => [k.kind, k.prefix]));
let drift = 0;
for (const [kind, prefix] of Object.entries(dbMap)) {
  if (ENTITY_KIND_PREFIXES[kind] !== prefix) { drift += 1; fail(`${kind}: database "${prefix}" vs code "${ENTITY_KIND_PREFIXES[kind] ?? '(missing)'}"`); }
}
for (const kind of Object.keys(ENTITY_KIND_PREFIXES)) {
  if (!(kind in dbMap)) { drift += 1; fail(`${kind}: in code but not in entity_kinds`); }
}
if (!drift) pass(`${kinds.length} kinds, code and database agree`);

// 2. coverage -----------------------------------------------------------------
console.log('\n2. every attached table is fully under the rule');
const rules = await q('SELECT table_name, column_name, type_column, strict FROM entity_uid_rules ORDER BY table_name');
for (const r of rules) {
  const t = r.table_name;
  const c = r.column_name;
  const s = (await q(`SELECT count(*) total, count(${c}) filled FROM ${t}`))[0];
  const rg = (await q('SELECT count(*) n FROM entity_registry WHERE source_table=$1 AND retired_at IS NULL', [t]))[0];
  const nn = (await q('SELECT is_nullable FROM information_schema.columns WHERE table_name=$1 AND column_name=$2', [t, c]))[0];
  const trg = (await q("SELECT count(*) n FROM pg_trigger WHERE tgrelid=('public.'||$1)::regclass AND tgname LIKE 'trg_entity_uid_%' AND NOT tgisinternal", [t]))[0];
  const uq = (await q(`SELECT count(*) n FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
                        WHERE i.indrelid=('public.'||$1)::regclass AND i.indisunique AND i.indnatts=1 AND i.indpred IS NULL AND a.attname=$2`, [t, c]))[0];
  const problems = [];
  if (Number(s.total) !== Number(s.filled)) problems.push(`${Number(s.total) - Number(s.filled)} row(s) without a uid`);
  if (Number(s.total) !== Number(rg.n)) problems.push(`${s.total} rows but ${rg.n} registered`);
  if (nn?.is_nullable !== 'NO') problems.push('column is nullable');
  if (Number(trg.n) !== 3) problems.push(`${trg.n}/3 triggers`);
  if (Number(uq.n) < 1) problems.push('no unique index');
  problems.length ? fail(`${t}.${c}: ${problems.join('; ')}`) : pass(`${t}.${c} (${s.total} rows)`);
}

// 3. discovery ----------------------------------------------------------------
console.log('\n3. tables with a unique_id-style column that are NOT under the rule');
// Tables that carry a copy of someone else's uid rather than issuing their own.
const ALLOW = new Set(['doctor_verification_summary', 'hospital_verification_summary']);
const unattached = await q(`
  SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
   WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     AND c.column_name IN ('unique_id', 'broker_uid')
     AND c.table_name !~ '^(backup_|_probe)'
     AND c.table_name NOT IN (SELECT table_name FROM entity_uid_rules)
   ORDER BY 1`);
const real = unattached.filter((u) => !ALLOW.has(u.table_name));
real.length
  ? real.forEach((u) => fail(`${u.table_name}.${u.column_name} has no rule: SELECT attach_entity_uid_rule('${u.table_name}', '<kind>');`))
  : pass('every unique_id column belongs to a table under the rule');
unattached.filter((u) => ALLOW.has(u.table_name)).forEach((u) => console.log(`     (allowed: ${u.table_name} mirrors another table's uid)`));

// 4. prefix -------------------------------------------------------------------
console.log('\n4. organisation uids carry their kind\'s prefix (non-legacy)');
const wrong = await q(`
  SELECT r.uid, r.kind, r.source_table, r.source_id, k.prefix
    FROM entity_registry r JOIN entity_kinds k ON k.kind = r.kind
   WHERE k.is_org AND NOT r.legacy AND left(r.uid, 1) <> k.prefix LIMIT 10`);
wrong.length ? wrong.forEach((w) => fail(`${w.source_table}#${w.source_id} ${w.uid} is a ${w.kind} but should start with ${w.prefix}`)) : pass('all organisation uids match their kind');
const legacy = await q('SELECT source_table, count(*) n FROM entity_registry WHERE legacy GROUP BY 1 ORDER BY 2 DESC');
legacy.forEach((l) => console.log(`     legacy (issued before the rule, prefix differs): ${l.source_table} ×${l.n}`));

// 5. orphans ------------------------------------------------------------------
console.log('\n5. registry rows with no source row');
let orphanTotal = 0;
for (const r of rules) {
  const o = await q(`SELECT r.uid, r.source_id FROM entity_registry r
                      WHERE r.source_table = $1 AND r.retired_at IS NULL
                        AND NOT EXISTS (SELECT 1 FROM ${r.table_name} t WHERE t.id = r.source_id)`, [r.table_name]);
  if (o.length) {
    orphanTotal += o.length;
    warn(`${r.table_name}: ${o.length} orphan(s), e.g. ${o.slice(0, 3).map((x) => x.uid).join(', ')}`);
    if (FIX) {
      await db.query(`UPDATE entity_registry SET retired_at = now()
                       WHERE source_table = $1 AND retired_at IS NULL
                         AND NOT EXISTS (SELECT 1 FROM ${r.table_name} t WHERE t.id = source_id)`, [r.table_name]);
      console.log(`     retired ${o.length} orphan(s) in ${r.table_name}`);
    }
  }
}
if (!orphanTotal) pass('none');
else if (!FIX) console.log('     (harmless: re-run with --fix to retire them)');

// 6. references ---------------------------------------------------------------
console.log('\n6. uid twins agree with the integer they shadow');
const twins = [
  { table: 'corporates', int: 'tenant_id', uid: 'tenant_uid', target: 'tenants' },
];
for (const tw of twins) {
  const bad = await q(`SELECT t.id FROM ${tw.table} t JOIN entity_registry r ON r.uid = t.${tw.uid}
                        WHERE t.${tw.int} IS NOT NULL AND (r.source_table <> $1 OR r.source_id <> t.${tw.int}) LIMIT 5`, [tw.target]);
  const missing = await q(`SELECT t.id FROM ${tw.table} t WHERE t.${tw.int} IS NOT NULL AND t.${tw.uid} IS NULL LIMIT 5`);
  if (bad.length) fail(`${tw.table}.${tw.uid} disagrees with ${tw.int} on ${bad.map((b) => '#' + b.id).join(', ')}`);
  else if (missing.length) warn(`${tw.table}: ${tw.int} set but ${tw.uid} empty on ${missing.map((b) => '#' + b.id).join(', ')}`);
  else pass(`${tw.table}.${tw.uid} agrees with ${tw.int}`);
}
const usersNoUid = (await q(`SELECT count(*) n FROM users WHERE organization_id IS NOT NULL AND organization_uid IS NULL`))[0].n;
Number(usersNoUid) > 0
  ? warn(`users: ${usersNoUid} row(s) have organization_id but no organization_uid yet (backfill: scripts/ops/backfill-organization-uid.mjs)`)
  : pass('users.organization_uid is populated wherever organization_id is');

// 7. role / organisation kind ---------------------------------------------------
// hr_staff is a role in TWO modules: hospital HRMS and corporate employee wellness. The role cannot
// say which; the organisation's kind does. A corporate-portal user must belong to a corporate, and a
// hospital HRMS user must not.
console.log('\n7. role / organisation-kind consistency (hospital HRMS vs corporate wellness)');
const mismatched = await q(`
  SELECT u.id, u.username, u.role, u.organization_type::text AS otype, r.kind
    FROM users u JOIN entity_registry r ON r.uid = u.organization_uid
   WHERE (u.role IN ('corporate_admin','corporate_cmo','corporate_ohc') AND r.kind <> 'corporate')
      OR (u.role = 'hr_staff' AND u.organization_type = 'corporate' AND r.kind <> 'corporate')
      OR (u.role = 'hr_staff' AND u.organization_type <> 'corporate' AND r.kind = 'corporate')
   LIMIT 20`);
mismatched.length
  ? mismatched.forEach((m) => fail(`user ${m.id} (${m.username ?? '-'}) is ${m.role}/${m.otype} but belongs to a ${m.kind}`))
  : pass('every corporate-portal user belongs to a corporate; no hospital HRMS user does');

console.log(`\n${failures ? '❌' : '✅'} ${failures} violation(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
