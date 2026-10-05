#!/usr/bin/env node
/**
 * Apply server/migrations/20261005000000-entity-uid-rule.sql inside ONE transaction, prove it works
 * on throwaway temp tables and on the real data, and only then commit.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/apply-entity-uid-rule.mjs            # dry run: ROLLBACK
 *   node scripts/ssm-env-loader.mjs scripts/ops/apply-entity-uid-rule.mjs --apply    # COMMIT, only if every check passes
 *
 * Postgres DDL is transactional, so a dry run exercises the real migration against the real
 * database and leaves no trace. lock_timeout makes it bail out rather than queue behind (and
 * block) live traffic if a table is busy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../../db/pgPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(__dirname, '../../migrations/20261005000000-entity-uid-rule.sql'), 'utf8');
const APPLY = process.argv.includes('--apply');
const db = pool.pool || pool.default || pool;

let passed = 0;
let failed = 0;
const ok = (name, detail = '') => { passed += 1; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { failed += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); };

const client = await db.connect();
const q = (sql, params) => client.query(sql, params);

// Run something that is EXPECTED to fail with a given SQLSTATE; the savepoint keeps the outer
// transaction usable afterwards.
async function expectError(name, sql, params, code) {
  await q('SAVEPOINT expect_err');
  try {
    await q(sql, params);
    await q('ROLLBACK TO SAVEPOINT expect_err');
    bad(name, 'expected an error but the statement succeeded');
  } catch (e) {
    await q('ROLLBACK TO SAVEPOINT expect_err');
    if (code && e.code !== code) bad(name, `expected ${code}, got ${e.code}: ${e.message.split('\n')[0]}`);
    else ok(name, `${e.code}: ${e.message.split('\n')[0].slice(0, 90)}`);
  }
}

try {
  const who = (await q('SELECT current_database() d, current_user u')).rows[0];
  console.log(`database : ${who.d}   (as ${who.u})`);
  console.log(`mode     : ${APPLY ? 'APPLY — commits only if every check passes' : 'DRY RUN — always rolls back'}\n`);

  await q('BEGIN');
  await q("SET LOCAL lock_timeout = '5s'");
  await q("SET LOCAL statement_timeout = '180s'");

  // ── 1. the migration ──────────────────────────────────────────────────────
  const t0 = Date.now();
  const results = await q(SQL);
  const arr = Array.isArray(results) ? results : [results];
  console.log(`migration ran in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const attached = [];
  for (const r of arr) {
    const row = r.rows?.[0];
    const v = row && (row.attach_entity_uid_rule || row.attach_uid_reference);
    if (v) attached.push(v);
  }
  console.log('── attachments ──');
  for (const a of attached.filter((x) => x.registered !== undefined)) {
    console.log(`  ${a.table.padEnd(24)} .${String(a.column).padEnd(10)} registered ${String(a.registered).padStart(6)}  generated ${String(a.generated).padStart(5)}  legacy ${a.legacy}`);
  }
  for (const a of attached.filter((x) => x.uid_column)) {
    console.log(`  ${a.table.padEnd(24)} .${String(a.uid_column).padEnd(10)} uid twin filled for ${a.filled} row(s)`);
  }

  // ── 2. behaviour, on throwaway tables ─────────────────────────────────────
  // EVERYTHING in this section runs inside a savepoint that is ALWAYS rolled back, even under
  // --apply. The probes register rows in entity_registry, entity_uid_rules and entity_uid_aliases
  // (30,000+ of them for the bulk test); a temp TABLE vanishes with the session but those rows are
  // ordinary rows in permanent tables, so without this they are committed with the migration. They
  // were, once: the first --apply left 30,014 probe uids behind and the verifier tripped on a rule
  // for a table that no longer existed. A dry run hid it, because the dry run rolls back everything.
  await q('SAVEPOINT probes');
  console.log('\n── behaviour (throwaway tables, rolled back) ──');
  await q('CREATE TEMP TABLE _probe_org (id serial PRIMARY KEY, unique_id text, note text)');
  await q("SELECT attach_entity_uid_rule('_probe_org', 'clinic')");

  const ins = async (sql, params) => (await q(sql, params)).rows[0];

  let r = await ins('INSERT INTO _probe_org (note) VALUES ($1) RETURNING id, unique_id', ['auto']);
  /^K[A-Z0-9]{5}$/.test(r.unique_id) ? ok('insert without a uid generates one with the kind prefix', r.unique_id) : bad('auto-generate', r.unique_id);
  const reg = (await q('SELECT kind, source_table, source_id FROM entity_registry WHERE uid=$1', [r.unique_id])).rows[0];
  reg && reg.kind === 'clinic' && reg.source_table === '_probe_org' && Number(reg.source_id) === r.id
    ? ok('…and registers it', JSON.stringify(reg)) : bad('registered', JSON.stringify(reg));

  r = await ins("INSERT INTO _probe_org (unique_id) VALUES ('KAAAAA') RETURNING unique_id");
  r.unique_id === 'KAAAAA' ? ok('a valid uid supplied by the app is accepted and registered') : bad('supplied', r.unique_id);

  await expectError('duplicate uid is rejected', "INSERT INTO _probe_org (unique_id) VALUES ('KAAAAA')", [], '23505');
  await expectError('wrong prefix for the kind is rejected (strict)', "INSERT INTO _probe_org (unique_id) VALUES ('HBBBBB')", [], '23514');
  await expectError('lowercase uid is rejected', "INSERT INTO _probe_org (unique_id) VALUES ('kbbbbb')", [], '23514');
  await expectError('wrong length is rejected', "INSERT INTO _probe_org (unique_id) VALUES ('KBB')", [], '23514');
  await expectError('a uid is immutable once set', "UPDATE _probe_org SET unique_id='KCCCCC' WHERE unique_id='KAAAAA'", [], '23514');
  await expectError('a uid cannot be cleared', "UPDATE _probe_org SET unique_id=NULL WHERE unique_id='KAAAAA'", [], null);

  await q("UPDATE _probe_org SET note='touched' WHERE unique_id='KAAAAA'");
  ok('updating an unrelated column is unaffected');

  await q("DELETE FROM _probe_org WHERE unique_id='KAAAAA'");
  const ret = (await q("SELECT retired_at FROM entity_registry WHERE uid='KAAAAA'")).rows[0];
  ret && ret.retired_at ? ok('deleting an entity retires its uid (it is never reused)') : bad('retire', JSON.stringify(ret));
  await expectError('a retired uid cannot be reissued', "INSERT INTO _probe_org (unique_id) VALUES ('KAAAAA')", [], '23505');

  // The birthday-collision case: a single statement that inserts many rows.
  const tb = Date.now();
  await q("INSERT INTO _probe_org (note) SELECT 'bulk' FROM generate_series(1, 30000)");
  const bulk = (await q("SELECT count(*) n, count(DISTINCT unique_id) d FROM _probe_org WHERE note='bulk'")).rows[0];
  Number(bulk.n) === 30000 && Number(bulk.d) === 30000
    ? ok('30,000 rows in ONE insert statement, every uid distinct', `${((Date.now() - tb) / 1000).toFixed(1)}s`)
    : bad('bulk insert', JSON.stringify(bulk));

  // Global uniqueness across tables: a people table must not be able to take a hospital's uid.
  await q('CREATE TEMP TABLE _probe_ppl (id serial PRIMARY KEY, unique_id text)');
  await q("SELECT attach_entity_uid_rule('_probe_ppl', 'user', 'unique_id', false)");
  const hospUid = (await q('SELECT unique_id FROM hospitals LIMIT 1')).rows[0].unique_id;
  await expectError('a uid already held by another TABLE cannot be reused', 'INSERT INTO _probe_ppl (unique_id) VALUES ($1)', [hospUid], '23505');
  r = await ins('INSERT INTO _probe_ppl (unique_id) VALUES ($1) RETURNING unique_id', ['EZZZZZ']);
  r.unique_id === 'EZZZZZ' ? ok('people tables accept role-specific prefixes (relaxed)') : bad('relaxed', r.unique_id);

  // Kind chosen from a type column, as tenants does.
  await q('CREATE TEMP TABLE _probe_ten (id serial PRIMARY KEY, unique_id text, type text)');
  await q("SELECT attach_entity_uid_rule('_probe_ten', NULL, 'unique_id', true, 'type')");
  for (const [type, prefix] of [['hospital', 'H'], ['corporate', 'C'], ['clinic', 'K'], ['broker', 'V'], ['insurer', 'I'], ['ngo', 'G'], ['tpa', 'X'], ['aggregator', 'Z']]) {
    const t = await ins('INSERT INTO _probe_ten (type) VALUES ($1) RETURNING unique_id', [type]);
    t.unique_id[0] === prefix ? ok(`tenant type "${type}" -> ${prefix}…`, t.unique_id) : bad(`type ${type}`, t.unique_id);
  }
  await expectError('a tenant type with no kind is refused', "INSERT INTO _probe_ten (type) VALUES ('nonsense')", [], '22023');

  // The uid twin of an integer reference.
  // Not TEMP: Postgres refuses a foreign key from a temp table to a permanent one. It is still
  // created inside the transaction, so it is discarded by the ROLLBACK like everything else.
  await q('CREATE TABLE _probe_ref (id serial PRIMARY KEY, tenant_id int, tenant_uid text)');
  await q("SELECT attach_uid_reference('_probe_ref', 'tenant_id', 'tenant_uid', 'tenants')");
  const t58 = (await q('SELECT id, unique_id FROM tenants WHERE id = 58')).rows[0];
  const t7 = (await q('SELECT id, unique_id FROM tenants WHERE id = 7')).rows[0];
  r = await ins('INSERT INTO _probe_ref (tenant_id) VALUES (58) RETURNING tenant_uid');
  r.tenant_uid === t58.unique_id ? ok('writing the integer fills the uid', `58 -> ${r.tenant_uid}`) : bad('int->uid', r.tenant_uid);
  r = await ins('INSERT INTO _probe_ref (tenant_uid) VALUES ($1) RETURNING tenant_id', [t7.unique_id]);
  Number(r.tenant_id) === 7 ? ok('writing the uid fills the integer', `${t7.unique_id} -> 7`) : bad('uid->int', r.tenant_id);
  await expectError('an integer and uid that disagree are rejected', 'INSERT INTO _probe_ref (tenant_id, tenant_uid) VALUES (58, $1)', [t7.unique_id], '23514');
  await expectError('a uid of the WRONG TABLE is rejected (a hospital uid in a tenants reference)', 'INSERT INTO _probe_ref (tenant_uid) VALUES ($1)', [hospUid], '23514');
  await expectError('an unregistered uid is rejected', "INSERT INTO _probe_ref (tenant_uid) VALUES ('QQQQQQ')", [], '23503');

  // Re-issuing a uid (used to correct a wrong prefix) without breaking the old value.
  console.log('\n── re-issue and aliases (temp tables, discarded) ──');
  r = await ins("INSERT INTO _probe_org (unique_id) VALUES ('KRRRR2') RETURNING id, unique_id");
  const reId = r.id;
  const reNew = (await q("SELECT reissue_entity_uid('_probe_org', $1, 'test') AS u", [reId])).rows[0].u;
  /^K[A-Z0-9]{5}$/.test(reNew) && reNew !== 'KRRRR2' ? ok('a re-issue produces a new uid with the kind prefix', `KRRRR2 -> ${reNew}`) : bad('reissue', reNew);
  (await q("SELECT resolve_entity_uid('KRRRR2') AS u")).rows[0].u === reNew ? ok('the OLD uid still resolves, to the new one') : bad('alias resolve');
  (await q('SELECT resolve_entity_uid($1) AS u', [reNew])).rows[0].u === reNew ? ok('the new uid resolves to itself') : bad('self resolve');
  const oldRow = (await q("SELECT retired_at, legacy FROM entity_registry WHERE uid='KRRRR2'")).rows[0];
  oldRow.retired_at && oldRow.legacy ? ok('the old registry row is retired and flagged legacy') : bad('old row', JSON.stringify(oldRow));
  await expectError('the old uid can never be issued again', "INSERT INTO _probe_org (unique_id) VALUES ('KRRRR2')", [], '23505');
  await expectError('a hand-written UPDATE is STILL refused (only reissue_entity_uid may change a uid)', "UPDATE _probe_org SET unique_id='KSSSS3' WHERE id=" + reId, [], '23514');
  const reNew2 = (await q("SELECT reissue_entity_uid('_probe_org', $1, 'second') AS u", [reId])).rows[0].u;
  (await q("SELECT resolve_entity_uid('KRRRR2') AS u")).rows[0].u === reNew2 ? ok('re-issued twice: the FIRST old uid resolves to the latest (aliases flattened)') : bad('flatten');
  await expectError('a table that is not under the rule is refused', "SELECT reissue_entity_uid('entity_kinds', 1)", [], null);

  // ── REHEARSAL on the real clinics: always rolled back, even under --apply ──
  console.log('\n── rehearsal: re-issue every legacy clinic id (ALWAYS rolled back; the real run is a separate step) ──');
  await q('SAVEPOINT clinic_rehearsal');
  try {
    const before = (await q("SELECT count(*) n, count(*) FILTER (WHERE left(unique_id,1) <> 'K') wrong FROM provider_clinics")).rows[0];
    const ids = (await q("SELECT id FROM provider_clinics WHERE left(unique_id,1) <> 'K' ORDER BY id")).rows;
    const tr = Date.now();
    for (const row of ids) await q("SELECT reissue_entity_uid('provider_clinics', $1, 'prefix correction: clinic ids were issued C (corporate) instead of K')", [row.id]);
    const after = (await q("SELECT count(*) n, count(*) FILTER (WHERE left(unique_id,1) <> 'K') wrong, count(DISTINCT unique_id) d FROM provider_clinics")).rows[0];
    const al = (await q("SELECT count(*) n FROM entity_uid_aliases a JOIN entity_registry r ON r.uid = a.uid WHERE r.source_table='provider_clinics' AND r.retired_at IS NULL")).rows[0];
    const act = (await q("SELECT count(*) n FROM entity_registry WHERE source_table='provider_clinics' AND retired_at IS NULL")).rows[0];
    const resolved = (await q(`SELECT count(*) n FROM entity_uid_aliases a JOIN provider_clinics c ON c.unique_id = resolve_entity_uid(a.old_uid) WHERE left(a.old_uid,1)='C'`)).rows[0];
    Number(before.wrong) === ids.length ? ok(`${before.wrong} of ${before.n} clinics carry a non-K id before`) : bad('before', JSON.stringify(before));
    Number(after.wrong) === 0 && Number(after.d) === Number(after.n) ? ok(`after: every clinic id starts with K and all ${after.n} are distinct`, `${((Date.now() - tr) / 1000).toFixed(1)}s`) : bad('after', JSON.stringify(after));
    Number(al.n) === ids.length ? ok(`${al.n} aliases written: every old C-id still resolves`) : bad('aliases', JSON.stringify(al));
    Number(act.n) === Number(after.n) ? ok(`registry holds exactly one ACTIVE uid per clinic (${act.n})`) : bad('active', JSON.stringify(act));
    Number(resolved.n) === ids.length ? ok('resolve_entity_uid(old C-id) lands on the clinic that owned it, for all of them') : bad('resolved', JSON.stringify(resolved));
  } catch (e) {
    bad('clinic rehearsal', e.message.split('\n')[0]);
  }
  await q('ROLLBACK TO SAVEPOINT clinic_rehearsal');
  const still = (await q("SELECT count(*) FILTER (WHERE left(unique_id,1) <> 'K') wrong FROM provider_clinics")).rows[0];
  Number(still.wrong) > 0 ? ok(`rehearsal rolled back: ${still.wrong} clinics are back on their original ids`) : bad('rollback of rehearsal did not restore');

  // Discard every probe row/table, then PROVE nothing survived. This assertion would have caught the leak.
  await q('ROLLBACK TO SAVEPOINT probes');
  const leaked = (await q(`SELECT
      (SELECT count(*) FROM entity_registry    WHERE source_table LIKE '\\_probe%') AS reg,
      (SELECT count(*) FROM entity_uid_rules   WHERE table_name   LIKE '\\_probe%') AS rules,
      (SELECT count(*) FROM entity_uid_aliases WHERE old_uid NOT IN (SELECT uid FROM entity_registry)) AS aliases,
      (SELECT count(*) FROM pg_class WHERE relname LIKE '\\_probe%') AS rels`)).rows[0];
  Object.values(leaked).every((n) => Number(n) === 0)
    ? ok('no probe data survives the rollback (registry, rules, aliases, tables)')
    : bad('PROBE DATA LEAKED', JSON.stringify(leaked));

  // ── 3. the real tables ────────────────────────────────────────────────────
  console.log('\n── real tables ──');
  const rules = (await q("SELECT table_name, kind, column_name, type_column FROM entity_uid_rules WHERE table_name NOT LIKE '\\_probe%' ORDER BY table_name")).rows;
  for (const rl of rules) {
    const t = rl.table_name;
    const c = rl.column_name;
    const s = (await q(`SELECT count(*) total, count(${c}) filled FROM ${t}`)).rows[0];
    const rg = (await q('SELECT count(*) n FROM entity_registry WHERE source_table=$1 AND retired_at IS NULL', [t])).rows[0];
    const notNull = (await q("SELECT is_nullable FROM information_schema.columns WHERE table_name=$1 AND column_name=$2", [t, c])).rows[0];
    const trg = (await q("SELECT count(*) n FROM pg_trigger WHERE tgrelid=('public.'||$1)::regclass AND tgname LIKE 'trg_entity_uid_%' AND NOT tgisinternal", [t])).rows[0];
    const uq = (await q(`SELECT count(*) n FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
                          WHERE i.indrelid=('public.'||$1)::regclass AND i.indisunique AND i.indnatts=1 AND i.indpred IS NULL AND a.attname=$2`, [t, c])).rows[0];
    const good = Number(s.total) === Number(s.filled) && Number(s.total) === Number(rg.n)
      && notNull.is_nullable === 'NO' && Number(trg.n) === 3 && Number(uq.n) >= 1;
    (good ? ok : bad)(`${t}.${c}`, `${s.total} rows | ${s.filled} with uid | ${rg.n} registered | NOT NULL ${notNull.is_nullable === 'NO'} | unique idx ${uq.n} | triggers ${trg.n}`);
  }

  const totals = (await q(`SELECT count(*) total, count(*) FILTER (WHERE legacy) legacy FROM entity_registry
                            WHERE source_table NOT LIKE '\\_probe%'`)).rows[0];
  console.log(`\n  entity_registry: ${totals.total} uids across ${rules.length} tables, ${totals.legacy} legacy (issued before the rule, prefix may differ)`);

  const leg = (await q(`SELECT source_table, count(*) n FROM entity_registry WHERE legacy AND source_table NOT LIKE '\\_probe%' GROUP BY 1 ORDER BY 2 DESC`)).rows;
  leg.forEach((x) => console.log(`    legacy: ${x.source_table} ×${x.n}`));

  // ── 4. a real insert through the real triggers ────────────────────────────
  console.log('\n── real insert through the real triggers (rolled back) ──');
  await q('SAVEPOINT real_insert');
  try {
    const nt = (await q("INSERT INTO tenants (name, slug, type) VALUES ('uid-probe-tenant', 'uid-probe-tenant-zz', 'ngo') RETURNING id, unique_id")).rows[0];
    nt.unique_id[0] === 'G' ? ok('a new tenants row of type ngo gets a G… uid with no app code involved', nt.unique_id) : bad('tenants insert', nt.unique_id);
  } catch (e) {
    console.log(`  ⚠️  could not insert a probe tenant (${e.message.split('\n')[0]}); behaviour is covered by the temp-table tests above`);
  }
  await q('ROLLBACK TO SAVEPOINT real_insert');

  // ── 5. verdict ────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    await q('ROLLBACK');
    console.log('ROLLED BACK — nothing was changed.');
    process.exitCode = 1;
  } else if (!APPLY) {
    await q('ROLLBACK');
    console.log('DRY RUN complete — ROLLED BACK. Re-run with --apply to commit.');
  } else {
    await q('COMMIT');
    console.log('COMMITTED.');
  }
} catch (e) {
  try { await q('ROLLBACK'); } catch { /* connection may already be aborted */ }
  console.log(`\n❌ ${e.message}\n   ROLLED BACK — nothing was changed.`);
  if (e.detail) console.log(`   detail: ${e.detail}`);
  if (e.where) console.log(`   where:  ${String(e.where).split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  client.release();
  process.exit(process.exitCode || 0);
}
