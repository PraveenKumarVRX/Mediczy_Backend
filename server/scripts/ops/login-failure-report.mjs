// Read-only: why logins are failing, from audit_logs (written by auditLoginAttempt).
// audit_logs has FORCE RLS, so reads MUST go through the AuditLog model (it sets the platform-admin
// read context); a plain pool query silently returns zero rows.
// The daily 05:00 VAPT cron (scripts/security/run-vapt-daily.sh) fires ~20 deliberate bad logins from the
// server itself. Rows from those source IPs are excluded so the tallies show real users only; the number
// hidden is printed. INCLUDE_CRON=1 disables the filter; CRON_IPS overrides the comma-separated IP list.
// Run: [DAYS=7] [EMAIL_LIKE=nurse@mediczy] [INCLUDE_CRON=1] node scripts/ssm-env-loader.mjs scripts/ops/login-failure-report.mjs
import AuditLog from '../../models/auditLog.model.intelligent.js';

const days = parseInt(process.env.DAYS || '7', 10);
const like = (process.env.EMAIL_LIKE || 'nurse@mediczy').toLowerCase();
const since = new Date(Date.now() - days * 864e5);

const byAction = await AuditLog.countByAction({ since });
console.log(`\nAudit rows by action, last ${days} days:`);
console.table(byAction);

const cronIps = new Set((process.env.CRON_IPS || '127.0.0.1,::1,::ffff:127.0.0.1,10.88.44.10').split(',').map((x) => x.trim()).filter(Boolean));
const includeCron = process.env.INCLUDE_CRON === '1';
const isCron = (r) => cronIps.has(String(r.ip_address || '').trim());
const split = (rows) => (includeCron ? [rows, []] : [rows.filter((r) => !isCron(r)), rows.filter(isCron)]);

const [failed, cronFailed] = split(await AuditLog.findAll({ where: { action: 'LOGIN_FAILED', dateFrom: since }, limit: 500 }));
const [ok, cronOk] = split(await AuditLog.findAll({ where: { action: 'LOGIN', dateFrom: since }, limit: 500 }));
console.log(`\nLOGIN_FAILED rows: ${failed.length} (cap 500), LOGIN rows: ${ok.length}`);
console.log(`Hidden as VAPT-cron traffic (IP in ${[...cronIps].join(', ')}): ${cronFailed.length} failed, ${cronOk.length} ok${includeCron ? ' (filter off)' : ''}`);

const tally = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r); const e = m.get(k) || { n: 0, last: null };
    e.n++; if (!e.last || r.timestamp > e.last) e.last = r.timestamp; m.set(k, e);
  }
  return [...m].map(([k, v]) => ({ key: k, n: v.n, last_seen: v.last })).sort((a, b) => b.n - a.n).slice(0, 15);
};
console.log('\nTop failure reasons:');
console.table(tally(failed, (r) => r.error_message || '(none)'));
console.log('\nMost-failing accounts:');
console.table(tally(failed, (r) => `${r.user_email} | ${r.error_message || '(none)'}`));

const mine = [...failed, ...ok]
  .filter((r) => (r.user_email || '').toLowerCase().includes(like))
  .sort((a, b) => b.timestamp - a.timestamp).slice(0, 15)
  .map((r) => ({ at: r.timestamp, action: r.action, status: r.status, reason: r.error_message, ip: r.ip_address }));
console.log(`\nLast attempts matching "${like}":`);
console.table(mine);
process.exit(0);
