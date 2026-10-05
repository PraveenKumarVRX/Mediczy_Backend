#!/usr/bin/env node
/**
 * Apply a SQL migration inside ONE transaction, prove it with checks, and commit only if they pass.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/apply-migration-checked.mjs \
 *        --file migrations/<name>.sql --checks scripts/ops/checks/<name>.checks.mjs [--apply]
 *
 * Without --apply the transaction is always rolled back, so a dry run exercises the real migration
 * against the real database and leaves no trace.
 *
 * A checks module exports:
 *   behaviour({ q, ok, bad, expectError, fillInsert })  probe writes. They run inside a savepoint that
 *                                                      is ALWAYS rolled back, even under --apply.
 *   state({ q, ok, bad })                              read-only assertions on the real data, run
 *                                                      after the probes were rolled back.
 *   leak({ q })  (optional) returns {name: count}      every count must be 0 after the rollback.
 *
 * Why the savepoint is not optional: the first apply runner committed its own test data (30,014
 * probe rows in permanent tables) because the probes shared the migration's transaction. A dry run
 * cannot reveal that, since it rolls back everything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pool from '../../db/pgPool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const APPLY = process.argv.includes('--apply');
const FILE = arg('--file');
const CHECKS = arg('--checks');
if (!FILE || !CHECKS) { console.log('usage: --file <migration.sql> --checks <checks.mjs> [--apply]'); process.exit(2); }

const SQL = fs.readFileSync(path.resolve(root, FILE), 'utf8');
const checks = await import(pathToFileURL(path.resolve(root, CHECKS)).href);
const db = pool.pool || pool.default || pool;

let passed = 0;
let failed = 0;
const ok = (name, detail = '') => { passed += 1; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { failed += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); };

const client = await db.connect();
const q = (sql, params) => client.query(sql, params);

async function expectError(name, code, fn) {
  await q('SAVEPOINT expect_err');
  try { await fn(); await q('ROLLBACK TO SAVEPOINT expect_err'); bad(name, 'expected an error but it succeeded'); }
  catch (e) {
    await q('ROLLBACK TO SAVEPOINT expect_err');
    if (code && e.code !== code) bad(name, `expected ${code}, got ${e.code}: ${e.message.split('\n')[0]}`);
    else ok(name, `${e.code}: ${e.message.split('\n')[0].slice(0, 100)}`);
  }
}

/** INSERT a row into any table, filling every NOT NULL column that has no default. */
async function fillInsert(table, overrides = {}, { skip = ['id', 'unique_id', 'broker_uid'] } = {}) {
  const cols = (await q(`SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND is_nullable='NO' AND column_default IS NULL AND is_identity='NO'`, [table])).rows;
  const names = []; const vals = [];
  for (const c of cols) {
    if (skip.includes(c.column_name) && !(c.column_name in overrides)) continue;
    let v;
    if (c.column_name in overrides) v = overrides[c.column_name];
    else if (c.data_type === 'USER-DEFINED') v = (await q('SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=$1 ORDER BY e.enumsortorder LIMIT 1', [c.udt_name])).rows[0]?.enumlabel;
    else if (/timestamp|date/.test(c.data_type)) v = new Date();
    else if (/int|numeric|real|double/.test(c.data_type)) v = 1;
    else if (c.data_type === 'boolean') v = false;
    else if (/json/.test(c.data_type)) v = '{}';
    else v = 'x';
    names.push(`"${c.column_name}"`); vals.push(v);
  }
  for (const [k, v] of Object.entries(overrides)) if (!cols.some((c) => c.column_name === k)) { names.push(`"${k}"`); vals.push(v); }
  return (await q(`INSERT INTO ${table} (${names.join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals)).rows[0];
}

try {
  console.log(`database : ${(await q('SELECT current_database() d')).rows[0].d}`);
  console.log(`file     : ${FILE}`);
  console.log(`mode     : ${APPLY ? 'APPLY — commits only if every check passes' : 'DRY RUN — always rolls back'}\n`);
  await q('BEGIN');
  await q("SET LOCAL lock_timeout = '5s'");
  await q("SET LOCAL statement_timeout = '180s'");

  const t0 = Date.now();
  await q(SQL);
  console.log(`migration ran in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  if (checks.behaviour) {
    console.log('── behaviour (probe writes, rolled back) ──');
    await q('SAVEPOINT probes');
    try { await checks.behaviour({ q, ok, bad, expectError, fillInsert }); }
    catch (e) { bad('behaviour checks threw', e.message.split('\n')[0]); }
    await q('ROLLBACK TO SAVEPOINT probes');
    if (checks.leak) {
      const leaked = await checks.leak({ q });
      Object.values(leaked).every((n) => Number(n) === 0) ? ok('no probe data survives the rollback') : bad('PROBE DATA LEAKED', JSON.stringify(leaked));
    }
  }
  if (checks.state) {
    console.log('\n── state of the real data ──');
    await checks.state({ q, ok, bad });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { await q('ROLLBACK'); console.log('ROLLED BACK — nothing was changed.'); process.exitCode = 1; }
  else if (!APPLY) { await q('ROLLBACK'); console.log('DRY RUN complete — ROLLED BACK. Re-run with --apply to commit.'); }
  else { await q('COMMIT'); console.log('COMMITTED.'); }
} catch (e) {
  try { await q('ROLLBACK'); } catch { /* already aborted */ }
  console.log(`\n❌ ${e.message}\n   ROLLED BACK — nothing was changed.`);
  if (e.detail) console.log(`   detail: ${e.detail}`);
  if (e.where) console.log(`   where:  ${String(e.where).split('\n')[0]}`);
  process.exitCode = 1;
} finally { client.release(); process.exit(process.exitCode || 0); }
