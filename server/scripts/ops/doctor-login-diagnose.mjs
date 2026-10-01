// Read-only: shows the doctors row (status is what login checks) and recent failed-login reasons for an email.
// audit_logs has FORCE RLS, so audit rows are read through the AuditLog model, never a plain query.
// Run: [LOGIN_EMAIL=doctor@mediczy.com] node scripts/ssm-env-loader.mjs scripts/ops/doctor-login-diagnose.mjs
import pool from '../../db/pgPool.js';
import AuditLog from '../../models/auditLog.model.intelligent.js';

const email = (process.env.LOGIN_EMAIL || 'doctor@mediczy.com').toLowerCase();
const p = pool.pool || pool.default || pool;

const d = await p.query('select id, email, status, "updatedAt" from doctors where lower(email) = $1 order by id', [email]);
console.log(`doctors rows for ${email}:`);
console.table(d.rows);

const failed = await AuditLog.findAll({ where: { action: 'LOGIN_FAILED', dateFrom: new Date(Date.now() - 30 * 864e5) }, limit: 500 });
console.log(`recent LOGIN_FAILED for ${email}:`);
console.table(failed.filter((r) => (r.user_email || '').toLowerCase() === email).slice(0, 10).map((r) => ({ at: r.timestamp, reason: r.error_message })));
process.exit(0);
