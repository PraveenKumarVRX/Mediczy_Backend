#!/usr/bin/env node
/**
 * Fill a uid twin column in small committed batches (for tables too large to rewrite inside one migration).
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/backfill-uid-twin-batched.mjs \
 *        --table hg_dicom_instances --int-col tenant_id --uid-col lab_uid --target labs [--batch 5000] [--apply]
 *
 * Dry run (default) only counts. With --apply it
 *   1. updates up to --batch rows per transaction (short row locks; resumable: it only touches rows whose uid is NULL),
 *   2. stops, loudly, if any row's integer matches no row in the target (it never invents or guesses a uid),
 *   3. VALIDATEs the foreign key, and builds the index CONCURRENTLY (outside a transaction),
 *   4. re-counts disagreeing/unfilled rows.
 * The twin must already be registered (entity_uid_references) with its sync trigger, so rows written meanwhile stay consistent.
 */
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const TABLE = arg('--table'); const INT = arg('--int-col'); const UID = arg('--uid-col'); const TARGET = arg('--target');
const TCOL = arg('--target-col', 'unique_id');
const BATCH = Math.min(Math.max(Number(arg('--batch', 5000)), 100), 20000);
const ident = /^[a-z_][a-z0-9_]*$/;
if (![TABLE, INT, UID, TARGET, TCOL].every((x) => x && ident.test(x))) { console.log('usage: --table T --int-col C --uid-col C --target T [--target-col C] [--batch N] [--apply]'); process.exit(2); }
const q = async (s, a = []) => (await db.query(s, a)).rows;

console.log(`database : ${(await q('SELECT current_database() d'))[0].d}`);
console.log(`twin     : ${TABLE}.${INT} -> ${TABLE}.${UID}  (via ${TARGET}.${TCOL})`);
console.log(`mode     : ${APPLY ? `APPLY, batches of ${BATCH}` : 'DRY RUN'}\n`);

if (!(await q('SELECT 1 FROM entity_uid_references WHERE table_name = $1 AND uid_col = $2', [TABLE, UID])).length) {
  console.log(`${TABLE}.${UID} is not registered in entity_uid_references; apply its migration first.`); process.exit(1);
}
const count = async () => (await q(
  `SELECT count(*) FILTER (WHERE ${INT} IS NOT NULL AND ${UID} IS NULL)::bigint AS todo,
          count(*) FILTER (WHERE ${INT} IS NOT NULL AND ${UID} IS NULL AND NOT EXISTS (SELECT 1 FROM ${TARGET} g WHERE g.id = t.${INT}))::bigint AS orphans
     FROM ${TABLE} t`))[0];
const c0 = await count();
console.log(`rows to fill: ${c0.todo}   (of which ${c0.orphans} have an ${INT} that matches no ${TARGET} row)`);
if (Number(c0.orphans) > 0) { console.log('\nRefusing: orphans must be understood first, a uid is never guessed.'); process.exit(1); }
if (!APPLY || Number(c0.todo) === 0) { console.log(APPLY ? '\nNothing to do.' : '\nDry run: nothing written.'); }
if (APPLY && Number(c0.todo) > 0) {
  let done = 0; const t0 = Date.now();
  for (;;) {
    const client = await db.connect();
    let n;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '3s'");
      const r = await client.query(
        `UPDATE ${TABLE} t SET ${UID} = g.${TCOL}
           FROM ${TARGET} g
          WHERE g.id = t.${INT} AND t.ctid IN (SELECT ctid FROM ${TABLE} WHERE ${INT} IS NOT NULL AND ${UID} IS NULL LIMIT ${BATCH})`);
      n = r.rowCount;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.log(`\n❌ batch failed after ${done} rows: ${e.message}\nEvery completed batch is committed and the run is resumable.`);
      client.release(); process.exit(1);
    }
    client.release();
    done += n;
    if (done % (BATCH * 10) < BATCH || n === 0) console.log(`  filled ${done} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (n === 0) break;
    await new Promise((r) => setTimeout(r, 50));   // let autovacuum and replicas breathe
  }
  const fk = `fk_${TABLE}_${UID}`.slice(0, 63);
  const hasFk = (await q('SELECT convalidated FROM pg_constraint WHERE conname = $1', [fk]))[0];
  if (hasFk && !hasFk.convalidated) { await db.query(`ALTER TABLE ${TABLE} VALIDATE CONSTRAINT ${fk}`); console.log(`  validated ${fk}`); }
  const idx = `idx_${TABLE}_${UID}`.slice(0, 63);
  await db.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idx} ON ${TABLE} (${UID})`);
  console.log(`  index ${idx} in place`);
  const c1 = await count();
  const bad = (await q(`SELECT count(*)::bigint n FROM ${TABLE} t JOIN ${TARGET} g ON g.id = t.${INT} WHERE t.${UID} IS DISTINCT FROM g.${TCOL}`))[0].n;
  console.log(`\nafter: ${c1.todo} unfilled, ${bad} disagreeing`);
  if (Number(c1.todo) || Number(bad)) process.exitCode = 1; else console.log('✅ twin complete and consistent.');
}
process.exit(process.exitCode || 0);
