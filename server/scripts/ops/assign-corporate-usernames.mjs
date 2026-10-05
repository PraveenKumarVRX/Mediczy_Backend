#!/usr/bin/env node
/**
 * Assign usernames to corporate-portal users (corporate_admin / hr_staff / corporate_cmo /
 * corporate_ohc) that do not have one yet, so they can sign in at /corporate/login by username.
 *
 * Why: users.email is UNIQUE, so one email is one row is one role. While an HR person's work
 * address is held by their hr_staff row, that same person cannot also have an employee row --
 * their HR and employee identities collide. A username lets HR sign in without their work email
 * being the key.
 *
 * This script ONLY sets users.username. It deliberately does not touch email or password:
 *   - changing an HR row's email is what actually frees the work address for an employee account,
 *     but it affects where that person's notifications go, so it is a per-person decision;
 *   - passwords are never written here.
 *
 * Username is derived as <first>.<last> (lowercased, non-alphanumerics stripped), falling back to
 * the email local-part, then <orgslug>.<role>. Collisions get a numeric suffix. Uniqueness is
 * checked against lower(username), matching the users_username_lower_unique partial index.
 *
 * Usage:
 *   node scripts/ssm-env-loader.mjs scripts/ops/assign-corporate-usernames.mjs           # dry run
 *   node scripts/ssm-env-loader.mjs scripts/ops/assign-corporate-usernames.mjs --apply   # write
 *   ... --user <id>    restrict to one user
 */
import pool from '../../db/pgPool.js';

const db = pool.pool || pool.default || pool;
const APPLY = process.argv.includes('--apply');
const uIdx = process.argv.indexOf('--user');
const ONLY = uIdx > -1 ? Number(process.argv[uIdx + 1]) : null;

const CORPORATE_ROLES = ['corporate_admin', 'hr_staff', 'corporate_cmo', 'corporate_ohc'];

const dbName = (await db.query('SELECT current_database()')).rows[0].current_database;
console.log(`database : ${dbName}`);
console.log(`mode     : ${APPLY ? 'APPLY (writes users.username)' : 'DRY RUN'}${ONLY ? ` | user ${ONLY}` : ''}\n`);

const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const { rows: targets } = await db.query(
  `SELECT u.id, u.email, u.username, u.role, u."firstName", u."lastName",
          u.organization_id, t.slug AS org_slug
     FROM users u
     LEFT JOIN tenants t ON t.id = u.organization_id
    WHERE u.organization_type = 'corporate'
      AND u.role = ANY($1)
      AND u.status = 'active'
      AND u.username IS NULL
      AND ($2::int IS NULL OR u.id = $2::int)
    ORDER BY u.organization_id, u.role, u.id`,
  [CORPORATE_ROLES, ONLY]
);

if (targets.length === 0) {
  console.log('Every active corporate-portal user already has a username. Nothing to do.');
  process.exit(0);
}

// Existing usernames, lowercased, so proposals cannot collide with each other or with a stored one.
const { rows: existing } = await db.query(`SELECT lower(username) AS u FROM users WHERE username IS NOT NULL`);
const taken = new Set(existing.map((r) => r.u));

const plan = [];
for (const t of targets) {
  const first = slug(t.firstName);
  const last = slug(t.lastName);
  const localPart = slug(String(t.email || '').split('@')[0]);
  let base = (first && last) ? `${first}.${last}`
           : (first || last) ? (first || last)
           : localPart || `${slug(t.org_slug) || 'corp'}.${t.role === 'hr_staff' ? 'hr' : slug(t.role)}`;
  if (base.length < 3) base = `${base}.${t.role === 'hr_staff' ? 'hr' : slug(t.role)}`;

  let candidate = base;
  let n = 1;
  while (taken.has(candidate.toLowerCase())) { n += 1; candidate = `${base}${n}`; }
  taken.add(candidate.toLowerCase());
  plan.push({ ...t, username: candidate });
}

console.log(`${plan.length} user(s) to receive a username:\n`);
for (const p of plan) {
  console.log(`  user ${String(p.id).padEnd(5)} ${p.role.padEnd(16)} org=${String(p.organization_id ?? '-').padEnd(4)} ${p.email}`);
  console.log(`        -> username '${p.username}'   (email and password unchanged)`);
}

if (!APPLY) {
  console.log('\nRe-run with --apply to write. Nothing was changed.');
  process.exit(0);
}

let applied = 0;
for (const p of plan) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE users SET username = $1, "updatedAt" = NOW()
        WHERE id = $2 AND username IS NULL`,
      [p.username, p.id]
    );
    if (upd.rowCount !== 1) throw new Error(`expected 1 row, updated ${upd.rowCount} (username set concurrently?)`);
    await client.query('COMMIT');
    applied += 1;
    console.log(`  ✅ user ${p.id} -> '${p.username}'`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.log(`  ❌ user ${p.id} rolled back: ${err.message}`);
  } finally {
    client.release();
  }
}
console.log(`\napplied ${applied} of ${plan.length}`);
process.exit(0);
