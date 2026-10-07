#!/usr/bin/env node
/**
 * Re-issue legacy uids whose prefix does not match their kind, keeping every old uid working.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/reissue-legacy-uids.mjs --table provider_clinics            # dry run
 *   node scripts/ssm-env-loader.mjs scripts/ops/reissue-legacy-uids.mjs --table provider_clinics --apply    # write
 *
 * A uid is a public identifier, so this never silently rewrites one: each old value is retired, kept
 * in entity_uid_aliases, and resolve_entity_uid(old) returns the new one. The old value can never be
 * issued again. The old -> new mapping is written to a CSV BEFORE the transaction commits, so the
 * correction is always reversible by reading it.
 *
 * Approved: provider_clinics (547 ids issued C… -- corporate's letter -- instead of K…, done 2026-10-05) and,
 * by the lead on 2026-10-07, labs (13 prefix-less ids from the old bulk import) and insurance_brokers (1 id
 * issued B…, the ambulance letter). Apply order: migration 20261005000400 first (so every column that holds
 * the old uid follows it), then this script.
 *
 * Needs migration 20261005000000 applied; refuses cleanly otherwise. One transaction; any failed
 * check rolls everything back.
 */
import fs from 'node:fs';
import path from 'node:path';
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const TABLE = arg('--table');
const APPLY = process.argv.includes('--apply');
const q = async (s, a = []) => (await db.query(s, a)).rows;

if (!TABLE) { console.log('usage: --table <table> [--apply] [--out file.csv]   (approved so far: provider_clinics)'); process.exit(2); }

console.log(`database : ${(await q('SELECT current_database() d'))[0].d}`);
console.log(`table    : ${TABLE}`);
console.log(`mode     : ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

if (!(await q("SELECT to_regclass('public.entity_uid_aliases') r"))[0].r) {
  console.log('The entity UID migration (with re-issue support) has not been applied.');
  console.log('Apply it first:  node scripts/ssm-env-loader.mjs scripts/ops/apply-entity-uid-rule.mjs --apply');
  process.exit(1);
}
const rule = (await q('SELECT table_name, kind, column_name, strict FROM entity_uid_rules WHERE table_name = $1', [TABLE]))[0];
if (!rule) { console.log(`${TABLE} is not under the entity uid rule.`); process.exit(1); }
if (!rule.strict || !rule.kind) { console.log(`${TABLE} is not a strict single-kind table; nothing to correct by prefix.`); process.exit(1); }
const prefix = (await q('SELECT prefix FROM entity_kinds WHERE kind = $1', [rule.kind]))[0].prefix;

const targets = await q(
  `SELECT t.id, t.${rule.column_name} AS uid FROM ${TABLE} t
     JOIN entity_registry r ON r.uid = t.${rule.column_name} AND r.retired_at IS NULL
    WHERE left(t.${rule.column_name}, 1) <> $1 ORDER BY t.id`, [prefix]);

console.log(`${targets.length} ${rule.kind} id(s) in ${TABLE} do not start with "${prefix}"`);
if (targets.length) {
  const byPrefix = {};
  for (const t of targets) byPrefix[t.uid[0]] = (byPrefix[t.uid[0]] || 0) + 1;
  console.log(`  current prefixes: ${Object.entries(byPrefix).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  sample: ${targets.slice(0, 4).map((t) => `#${t.id} ${t.uid}`).join(', ')} …`);
}
if (!targets.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) {
  console.log(`\nDry run: nothing written. Each would get a new "${prefix}…" id and keep its old id as an alias.`);
  console.log('Re-run with --apply.');
  process.exit(0);
}

const out = arg('--out') || path.join('logs', `entity-uid-reissue-${TABLE}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const client = await db.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  const rows = ['table,id,old_uid,new_uid'];
  for (const t of targets) {
    const r = await client.query('SELECT reissue_entity_uid($1, $2, $3) AS u', [TABLE, t.id, `prefix correction: ${rule.kind} ids must start with ${prefix}`]);
    rows.push(`${TABLE},${t.id},${t.uid},${r.rows[0].u}`);
  }
  const chk = (await client.query(
    `SELECT count(*) n, count(*) FILTER (WHERE left(${rule.column_name},1) <> $1) wrong, count(DISTINCT ${rule.column_name}) d FROM ${TABLE}`, [prefix])).rows[0];
  const al = (await client.query(
    `SELECT count(*) n FROM entity_uid_aliases a JOIN ${TABLE} t ON t.${rule.column_name} = resolve_entity_uid(a.old_uid) WHERE a.old_uid = ANY($1::text[])`, [targets.map((t) => t.uid)])).rows[0];
  if (Number(chk.wrong) !== 0 || Number(chk.d) !== Number(chk.n)) throw new Error(`verification failed: ${JSON.stringify(chk)}`);
  if (Number(al.n) !== targets.length) throw new Error(`only ${al.n} of ${targets.length} old ids resolve`);
  fs.writeFileSync(out, rows.join('\n') + '\n');
  await client.query('COMMIT');
  console.log(`\n✅ re-issued ${targets.length}; every ${TABLE} id now starts with "${prefix}", all distinct, all old ids still resolve.`);
  console.log(`   mapping written to ${out}`);
} catch (e) {
  await client.query('ROLLBACK');
  console.log(`\n❌ ${e.message}\nROLLED BACK — nothing was changed.`);
  process.exitCode = 1;
} finally { client.release(); }
process.exit(process.exitCode || 0);
