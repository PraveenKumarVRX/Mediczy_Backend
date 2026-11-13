/**
 * Report employees who hold more than one account in a corporate. Read-only.
 *
 * Groups by the employer's staff code, taken from the roster and from the staff
 * code embedded in older placeholder addresses (`pending+E12346@…`,
 * `e60072@…`), then cross-checks by phone. Shows which account carries
 * entitlements and which has ever been signed in to, because those decide
 * which one should survive — a decision for a human, not this script.
 *
 *   node scripts/ssm-env-loader.mjs scripts/report-corporate-duplicate-employees.mjs --corporate=5 [--limit=20]
 */
import pool from '../db/pgPool.js';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const corporateId = Number(arg('corporate', 0));
const limit = Number(arg('limit', 20));
if (!corporateId) { console.error('pass --corporate=<id>'); process.exit(1); }

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

/** A deliverable address, as opposed to a placeholder minted from a staff code. */
const isReal = (email) => {
  const local = String(email || '').toLowerCase().split('@')[0];
  if (!local) return false;
  if (local.startsWith('pending+')) return false;
  if (/^e?\d{3,}$/.test(local)) return false;   // e65681, 65681
  return true;
};

const [corp] = await q(`SELECT id, "companyName" FROM corporates WHERE id=$1`, [corporateId]);
if (!corp) { console.error(`corporate ${corporateId} not found`); process.exit(1); }
console.log(`${corp.companyName} (corporate ${corp.id})\n`);

// Every account associated with this corporate, with the staff code we can see.
const ACCOUNTS = `
  SELECT u.id,
         u.email,
         concat_ws(' ', u."firstName", u."lastName") AS name,
         right(regexp_replace(COALESCE(u."phoneNumber",''), '\\D', '', 'g'), 10) AS phone,
         u.status,
         (u."lastLoginAt" IS NOT NULL) AS signed_in,
         u."createdAt" AS created,
         COALESCE(
           (SELECT upper(btrim(ce."employeeId")) FROM corporate_employees ce
             WHERE ce.corporate_id = $1 AND ce."userId" = u.id ORDER BY ce.id LIMIT 1),
           NULLIF(upper(regexp_replace(split_part(lower(u.email), '@', 1), '^pending\\+', '')), '')
         ) AS code,
         (SELECT count(*)::int FROM user_health_packages h WHERE h."userId" = u.id) AS entitlements
    FROM users u
    JOIN user_associations ua ON ua."userId" = u.id AND ua."entityType"='corporate'
     AND ua."entityId" = $1 AND ua.role = 'employee'`;

const accounts = await q(ACCOUNTS, [corporateId]);
console.log(`accounts associated with this corporate: ${accounts.length}`);

const groups = new Map();
for (const a of accounts) {
  if (!a.code || !/^E?[0-9]+$/i.test(a.code)) continue;
  groups.set(a.code, [...(groups.get(a.code) || []), a]);
}
const dupes = [...groups.entries()].filter(([, rows]) => rows.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const phones = new Map();
for (const a of accounts) if (a.phone?.length === 10) phones.set(a.phone, [...(phones.get(a.phone) || []), a.id]);
const phoneDupes = [...phones.entries()].filter(([, ids]) => new Set(ids).size > 1);

console.log(`staff codes with more than one account: ${dupes.length}`);
console.log(`extra accounts to reconcile: ${dupes.reduce((n, [, r]) => n + r.length - 1, 0)}`);
console.log(`phone numbers shared by more than one account: ${phoneDupes.length}`);

console.log(`\nfirst ${Math.min(limit, dupes.length)} of ${dupes.length}:`);
for (const [code, rows] of dupes.slice(0, limit)) {
  console.log(`\n  ${code}`);
  // Survivor = the account the employee can actually be reached on and sign in
  // to. A placeholder address (`pending+E123@…`, `e123@…`) delivers nowhere, so
  // it loses to a real one even though it is the one holding the entitlement —
  // the entitlement moves, the mailbox cannot.
  const keep = [...rows].sort((a, b) =>
    (Number(isReal(b.email)) - Number(isReal(a.email)))
    || (Number(b.signed_in) - Number(a.signed_in))
    || (b.entitlements - a.entitlements)
    || (a.id - b.id))[0];
  for (const r of rows) {
    console.log(`    ${r.id === keep.id ? '>' : ' '} ${String(r.id).padEnd(6)} ${String(r.email || '').padEnd(42)} ${String(r.name).slice(0,22).padEnd(23)} entitlements=${String(r.entitlements).padEnd(3)} signedIn=${r.signed_in ? 'yes' : 'no '} ${r.status}`);
  }
}
const movable = dupes.reduce((n, [, rows]) => {
  const keep = [...rows].sort((a, b) =>
    (Number(isReal(b.email)) - Number(isReal(a.email))) || (Number(b.signed_in) - Number(a.signed_in))
    || (b.entitlements - a.entitlements) || (a.id - b.id))[0];
  return n + rows.filter(r => r.id !== keep.id).reduce((m, r) => m + r.entitlements, 0);
}, 0);
console.log(`\nentitlements sitting on an account that would NOT survive: ${movable} (they must move, not be deleted)`);
console.log(`'>' marks the survivor: a deliverable address first, then one that has been signed in to, then most entitlements, then oldest.`);
console.log(`A placeholder address (pending+E123@…, e123@…) reaches nobody, so it loses even when it holds the entitlement.`);
console.log('Nothing has been changed. Merging needs a decision per employee: which account survives,');
console.log('and what happens to the entitlements and the address the employee actually uses.');
await pool.end();
