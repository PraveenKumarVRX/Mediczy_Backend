// Read-only: pharmacy login needs a row with status='active'. Shows status/verification and recent failed-login reasons.
// Run: [PHARMACY_EMAIL=pharmacy@mediczy.com] node scripts/ssm-env-loader.mjs scripts/ops/pharmacy-login-diagnose.mjs
import Pharmacy from '../../models/postgres/pharmacy.model.postgres.js';
import AuditLog from '../../models/auditLog.model.intelligent.js';

const email = (process.env.PHARMACY_EMAIL || 'pharmacy@mediczy.com').toLowerCase();
const p = await Pharmacy.findOne({ where: { email } });

if (!p) console.log(`No pharmacy with email ${email}.`);
else console.table([{ id: p.id, email: p.email, status: p.status, isVerified: p.isVerified }]);

const failed = await AuditLog.findAll({ where: { action: 'LOGIN_FAILED', dateFrom: new Date(Date.now() - 30 * 864e5) }, limit: 500 });
console.log(`recent LOGIN_FAILED for ${email}:`);
console.table(failed.filter((r) => (r.user_email || '').toLowerCase() === email).slice(0, 10).map((r) => ({ at: r.timestamp, reason: r.error_message })));
process.exit(0);
