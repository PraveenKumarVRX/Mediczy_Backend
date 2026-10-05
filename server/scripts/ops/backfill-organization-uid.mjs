#!/usr/bin/env node
/**
 * Fill users.organization_uid for users that have an organization_id but no uid yet.
 *
 * Needs the entity UID migration (20261005000000) applied first; refuses cleanly otherwise.
 *
 *   node scripts/ssm-env-loader.mjs scripts/ops/backfill-organization-uid.mjs            # dry run
 *   node scripts/ssm-env-loader.mjs scripts/ops/backfill-organization-uid.mjs --apply    # write
 *
 * WHY this is a reviewed script and not part of the migration: users.organization_id is ambiguous.
 * It holds a TENANTS id for some users and a CORPORATES id for others, and the two tables share 11
 * integer values (id 49 is Madras Medical Mission Chennai in tenants and Ninjacart in corporates).
 * So the integer cannot be resolved mechanically; it has to be resolved by the user's KIND of
 * organisation.
 *
 * `hr_staff` exists in two different modules. A hospital's HR user belongs to the hospital HRMS
 * module; a corporate's HR user is concerned only with employee wellness programmes. The role string
 * cannot tell them apart, the organisation's kind can:
 *
 *   organization_type = corporate        -> the user belongs to a CORPORATE (uid kind `corporate`).
 *                                           If organization_id is a corporate-type TENANT, the corporate
 *                                           linked to it (exactly one Active); otherwise organization_id
 *                                           is itself a corporates id.
 *   hospital | clinic | lab | pharmacy   -> the user belongs to the TENANT, and only if that tenant's
 *                                           type matches. A mismatch is refused, not guessed.
 *   anything else (individual, ...)      -> the TENANT, but only when the integer is not also a
 *                                           corporates id. If it is, the row is left and reported.
 *
 * Anything not resolved unambiguously is listed and left NULL. Only organization_uid is written;
 * organization_id is never changed here.
 */
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const APPLY = process.argv.includes('--apply');
const q = async (s, a = []) => (await db.query(s, a)).rows;

console.log(`database : ${(await q('SELECT current_database() d'))[0].d}`);
console.log(`mode     : ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

const hasCol = (await q("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='organization_uid'")).length > 0;
const hasUid = (await q("SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='unique_id'")).length > 0;
if (!hasCol || !hasUid) {
  console.log('The entity UID migration has not been applied (users.organization_uid / tenants.unique_id are missing).');
  console.log('Apply it first:  node scripts/ssm-env-loader.mjs scripts/ops/apply-entity-uid-rule.mjs --apply');
  process.exit(1);
}

const users = await q(`
  SELECT u.id, u.username, u.email, u.role, u.organization_type::text AS otype, u.organization_id,
         t.id AS t_id, t.slug AS t_slug, t.type::text AS t_type, t.unique_id AS t_uid,
         c.id AS c_id, c.unique_id AS c_uid
    FROM users u
    LEFT JOIN tenants t    ON t.id = u.organization_id
    LEFT JOIN corporates c ON c.id = u.organization_id
   WHERE u.organization_id IS NOT NULL AND u.organization_uid IS NULL
   ORDER BY u.organization_type, u.id`);

const plan = [];
const skipped = [];
for (const u of users) {
  let uid = null;
  let why = '';
  if (u.otype === 'corporate') {
    if (u.t_id && u.t_type === 'corporate') {
      const linked = await q(`SELECT id, unique_id, status FROM corporates WHERE tenant_id = $1 AND status ILIKE 'active'`, [u.t_id]);
      if (linked.length === 1) { uid = linked[0].unique_id; why = `corporate-type tenant ${u.t_slug} -> its one Active corporate #${linked[0].id}`; }
      else if (linked.length > 1) { skipped.push({ u, why: `tenant ${u.t_slug} has ${linked.length} Active corporates (${linked.map((l) => '#' + l.id).join(', ')})` }); continue; }
    }
    if (!uid && u.c_id) { uid = u.c_uid; why = `organization_id ${u.organization_id} is a corporates id${u.t_id ? ` (tenants ${u.t_id} is a ${u.t_type}, ${u.t_slug}: not a corporate)` : ''}`; }
    if (!uid) { skipped.push({ u, why: 'no corporate found for this organization_id' }); continue; }
  } else if (['hospital', 'clinic', 'lab', 'pharmacy'].includes(u.otype)) {
    if (u.t_id && u.t_type === u.otype) { uid = u.t_uid; why = `${u.otype} tenant ${u.t_slug}`; }
    else { skipped.push({ u, why: `organization_type ${u.otype} but tenants.${u.organization_id} is ${u.t_type ?? 'missing'}` }); continue; }
  } else {
    if (u.t_id && !u.c_id) { uid = u.t_uid; why = `tenant ${u.t_slug} (integer is not also a corporates id)`; }
    else { skipped.push({ u, why: u.t_id && u.c_id ? `integer ${u.organization_id} is BOTH tenants ${u.t_slug} and corporates #${u.c_id}` : 'no matching organisation' }); continue; }
  }
  plan.push({ u, uid, why });
}

console.log(`${plan.length} user(s) resolvable, ${skipped.length} left for review\n`);
for (const p of plan) {
  const u = p.u;
  console.log(`  user ${String(u.id).padEnd(5)} ${String(u.username ?? u.email).padEnd(26)} ${String(u.role).padEnd(16)} ${u.otype.padEnd(10)} org_id=${String(u.organization_id).padEnd(4)} -> ${p.uid}   (${p.why})`);
}
if (skipped.length) {
  console.log('\nLeft unresolved (organization_uid stays NULL):');
  for (const s of skipped.slice(0, 40)) console.log(`  user ${String(s.u.id).padEnd(5)} ${String(s.u.username ?? s.u.email).padEnd(26)} ${s.u.otype.padEnd(10)} org_id=${s.u.organization_id}: ${s.why}`);
  if (skipped.length > 40) console.log(`  … and ${skipped.length - 40} more`);
}

if (!APPLY) { console.log('\nDry run: nothing written. Re-run with --apply.'); process.exit(0); }

let applied = 0;
for (const p of plan) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query('UPDATE users SET organization_uid = $1, "updatedAt" = NOW() WHERE id = $2 AND organization_uid IS NULL', [p.uid, p.u.id]);
    if (r.rowCount !== 1) throw new Error(`expected 1 row, updated ${r.rowCount}`);
    await c.query('COMMIT');
    applied += 1;
  } catch (e) {
    await c.query('ROLLBACK');
    console.log(`  ❌ user ${p.u.id}: ${e.message}`);
  } finally { c.release(); }
}
console.log(`\napplied ${applied} of ${plan.length}`);
process.exit(0);
