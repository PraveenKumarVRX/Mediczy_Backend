#!/usr/bin/env node
/**
 * Make one user a corporate's single super-HR (its corporate_admin) and demote the other active admin to hr_staff.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/make-corporate-super-hr.mjs                     # dry run (Ninjacart)
 *   node scripts/ssm-env-loader.mjs scripts/ops/make-corporate-super-hr.mjs --apply
 *
 * Decided by the lead on 2026-10-07: somya.pagare (user 7233) is Ninjacart's super-HR; anjali.nshaji (user 6993) was
 * also corporate_admin for the same corporate, which the integer-keyed unique index could not catch because the two
 * rows carry different organization_id values (58 = tenants id, 49 = corporates id) for the SAME corporate (CMR4ET).
 *
 * Every precondition is re-checked inside the transaction and any mismatch aborts; nothing here sets a password or touches
 * credentials. The demoted user stays active as hr_staff of the same corporate.
 */
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const KEEP = { id: Number(arg('--keep-id', 7233)), username: arg('--keep-username', 'somya.pagare') };
const DEMOTE = { id: Number(arg('--demote-id', 6993)), username: arg('--demote-username', 'anjali.nshaji') };
const CORPORATE_UID = arg('--corporate-uid', 'CMR4ET');

const client = await db.connect();
const q = async (s, a = []) => (await client.query(s, a)).rows;
const admins = () => q(`SELECT id, username, role, status FROM users WHERE role = 'corporate_admin' AND status = 'active' AND organization_uid = $1 ORDER BY id`, [CORPORATE_UID]);

try {
  console.log(`database : ${(await q('SELECT current_database() d'))[0].d}`);
  console.log(`mode     : ${APPLY ? 'APPLY' : 'DRY RUN (always rolled back)'}\n`);
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");

  const corp = (await q(`SELECT id, unique_id, status FROM corporates WHERE unique_id = $1`, [CORPORATE_UID]))[0];
  if (!corp) throw new Error(`no corporate with uid ${CORPORATE_UID}`);
  const rows = await q(`SELECT id, username, role, status, organization_uid FROM users WHERE id = ANY($1::int[]) FOR UPDATE`, [[KEEP.id, DEMOTE.id]]);
  const keep = rows.find((r) => r.id === KEEP.id);
  const demote = rows.find((r) => r.id === DEMOTE.id);
  if (!keep || keep.username !== KEEP.username) throw new Error(`user ${KEEP.id} is not ${KEEP.username}`);
  if (!demote || demote.username !== DEMOTE.username) throw new Error(`user ${DEMOTE.id} is not ${DEMOTE.username}`);
  for (const u of [keep, demote]) {
    if (u.organization_uid !== CORPORATE_UID) throw new Error(`${u.username} belongs to ${u.organization_uid}, not ${CORPORATE_UID}`);
    if (u.status !== 'active') throw new Error(`${u.username} is ${u.status}`);
  }
  if (keep.role !== 'corporate_admin') throw new Error(`${keep.username} is ${keep.role}, expected corporate_admin`);

  console.log('before:', JSON.stringify(await admins()));
  if (demote.role === 'corporate_admin') {
    const r = await client.query(`UPDATE users SET role = 'hr_staff' WHERE id = $1 AND role = 'corporate_admin' AND organization_uid = $2`, [DEMOTE.id, CORPORATE_UID]);
    if (r.rowCount !== 1) throw new Error('demotion did not match exactly one row');
  } else {
    console.log(`${demote.username} is already ${demote.role}; nothing to demote.`);
  }
  const after = await admins();
  console.log('after :', JSON.stringify(after));
  if (after.length !== 1 || after[0].id !== KEEP.id) throw new Error(`expected exactly ${KEEP.username} as the active corporate_admin, got ${JSON.stringify(after)}`);
  const d = (await q('SELECT role, status, organization_uid FROM users WHERE id = $1', [DEMOTE.id]))[0];
  if (d.status !== 'active' || d.organization_uid !== CORPORATE_UID) throw new Error('the demoted user must stay active in the same corporate');
  console.log(`\n${demote.username}: ${d.role}, ${d.status}, ${d.organization_uid}  |  ${keep.username}: the only active corporate_admin of ${CORPORATE_UID}`);

  if (APPLY) { await client.query('COMMIT'); console.log('\nCOMMITTED. Now apply migration 20261007000100-one-active-corporate-admin-per-uid.sql.'); }
  else { await client.query('ROLLBACK'); console.log('\nDry run: ROLLED BACK. Re-run with --apply.'); }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.log(`\n❌ ${e.message}\nROLLED BACK — nothing was changed.`);
  process.exitCode = 1;
} finally { client.release(); }
process.exit(process.exitCode || 0);
