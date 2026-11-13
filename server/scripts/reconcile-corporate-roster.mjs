/**
 * Close out a corporate roster for a financial year.
 *
 * The employer uploads its employee list once per financial year (1 April –
 * 31 March) and that upload IS the live employee set for the year. So anyone
 * still marked active on the roster who was NOT in that year's upload has left,
 * and should stop being treated as a live employee.
 *
 * Report-only unless --apply. It deactivates the roster row and the corporate
 * employee association; it never deletes a row and never touches the person's
 * user account, because their past entitlements, bookings and reports hang off
 * it and a returning employee must land back on the same account.
 *
 *   node scripts/ssm-env-loader.mjs scripts/reconcile-corporate-roster.mjs --corporate=5 [--fy=FY2026-27] [--apply]
 */
import pool from '../db/pgPool.js';
import { fiscalYearOf } from '../utils/ist-date.js';

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const corporateId = Number(arg('corporate', 0));
const fy = arg('fy', fiscalYearOf().label);
const apply = process.argv.includes('--apply');
if (!corporateId) { console.error('pass --corporate=<id>'); process.exit(1); }

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const [corp] = await q(`SELECT id, "companyName" FROM corporates WHERE id=$1`, [corporateId]);
if (!corp) { console.error(`corporate ${corporateId} not found`); process.exit(1); }

const ready = (await q(
  `SELECT 1 FROM information_schema.columns WHERE table_name='corporate_employees' AND column_name='roster_financial_year'`)).length;
if (!ready) { console.error('roster_financial_year is missing — apply 20261113000100 first'); process.exit(1); }

console.log(`${corp.companyName} (corporate ${corp.id}) · financial year ${fy}\n`);

console.log('roster by financial year:');
for (const r of await q(
  `SELECT COALESCE(roster_financial_year,'(not stamped)') AS fy, count(*)::int n,
          count(*) FILTER (WHERE "isActive")::int active
     FROM corporate_employees WHERE corporate_id=$1 GROUP BY 1 ORDER BY 1`, [corporateId]))
  console.log(`  ${String(r.fy).padEnd(16)} ${String(r.n).padStart(5)} rows, ${String(r.active).padStart(5)} active`);

const inYear = (await q(
  `SELECT count(*)::int n FROM corporate_employees WHERE corporate_id=$1 AND roster_financial_year=$2`,
  [corporateId, fy]))[0].n;
if (!inYear) {
  console.log(`\nNo roster rows are stamped ${fy}. Upload this year's list before closing the year out —`);
  console.log('otherwise every active employee would be treated as having left.');
  await pool.end(); process.exit(0);
}

const leavers = await q(
  `SELECT ce.id, ce."employeeId", ce."userId", ce.email, ce.roster_financial_year AS last_fy,
          concat_ws(' ', u."firstName", u."lastName") AS name,
          (SELECT count(*)::int FROM user_health_packages h WHERE h."userId"=ce."userId" AND LOWER(h.status)='active') AS live_entitlements
     FROM corporate_employees ce LEFT JOIN users u ON u.id=ce."userId"
    WHERE ce.corporate_id=$1 AND ce."isActive"=true
      AND COALESCE(ce.roster_financial_year,'') <> $2
    ORDER BY ce."employeeId"`, [corporateId, fy]);

console.log(`\nthis year's upload : ${inYear} employees`);
console.log(`active but absent from it : ${leavers.length}`);
const withEntitlements = leavers.filter(l => l.live_entitlements > 0);
console.log(`of those, holding a LIVE entitlement : ${withEntitlements.length}`);

for (const l of leavers.slice(0, 10))
  console.log(`  ${String(l.employeeId).padEnd(12)} ${String(l.email || '').padEnd(42)} ${String(l.name || '').slice(0,22).padEnd(23)} lastSeen=${l.last_fy || '(never stamped)'} liveEntitlements=${l.live_entitlements}`);
if (leavers.length > 10) console.log(`  …and ${leavers.length - 10} more`);

if (!leavers.length) { console.log('\nNothing to close out.'); await pool.end(); process.exit(0); }
if (!apply) {
  console.log('\nDRY RUN — pass --apply to mark these as no longer live.');
  console.log('Their user accounts, entitlements and history are left untouched; only the roster row');
  console.log('and the corporate employee association are deactivated, so a returning employee');
  console.log('lands back on the same account next year.');
  await pool.end(); process.exit(0);
}

const ids = leavers.map(l => l.id);
const userIds = [...new Set(leavers.map(l => l.userId).filter(Boolean))];
const { rowCount: rosterOff } = await pool.query(
  `UPDATE corporate_employees SET "isActive"=false, "exitDate"=COALESCE("exitDate", CURRENT_DATE), "updatedAt"=NOW()
    WHERE id = ANY($1::int[])`, [ids]);
let assocOff = 0;
if (userIds.length) {
  ({ rowCount: assocOff } = await pool.query(
    `UPDATE user_associations SET status='inactive', "updatedAt"=NOW()
      WHERE "entityType"='corporate' AND "entityId"=$1 AND role='employee' AND status='active' AND "userId" = ANY($2::int[])`,
    [corporateId, userIds]));
}
console.log(`\nroster rows deactivated : ${rosterOff}`);
console.log(`associations deactivated: ${assocOff}`);
console.log(`live entitlements left in place: ${withEntitlements.reduce((n, l) => n + l.live_entitlements, 0)} (review separately — a leaver may still be mid-checkup)`);
await pool.end();
