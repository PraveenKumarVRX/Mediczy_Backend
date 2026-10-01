// Read-only: why does a hospital login fail? Shows both login paths (hospitals row, users-table fallback)
// and recent failed-login reasons. Never prints password hashes.
// Run: [LOGIN_EMAIL=hospital@mediczy.com] node scripts/ssm-env-loader.mjs scripts/ops/hospital-login-diagnose.mjs
import Hospital from '../../models/hospital.model.intelligent.js';
import User from '../../models/postgres/user.model.postgres.js';
import AuditLog from '../../models/auditLog.model.intelligent.js';

const email = (process.env.LOGIN_EMAIL || 'hospital@mediczy.com').toLowerCase();

const h = await Hospital.findOne({ where: { email } });
console.log('\nhospitals row (login path 1):');
console.table(h ? [{ id: h.id, name: h.hospitalName ?? h.name, email: h.email, status: h.status, isActive: h.isActive, hasPassword: !!h.password }] : []);

const u = await User.findOne({ where: { email } });
console.log('users row (fallback path 2):');
console.table(u ? [{ id: u.id, role: u.role, status: u.status, organization_type: u.organization_type, organization_id: u.organization_id, tenant_id: u.tenant_id, hasPassword: !!u.password }] : []);

const failed = await AuditLog.findAll({ where: { action: 'LOGIN_FAILED', dateFrom: new Date(Date.now() - 30 * 864e5) }, limit: 500 });
console.log(`recent LOGIN_FAILED for ${email}:`);
console.table(failed.filter((r) => (r.user_email || '').toLowerCase() === email).slice(0, 10).map((r) => ({ at: r.timestamp, reason: r.error_message })));
process.exit(0);
