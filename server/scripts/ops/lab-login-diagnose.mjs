// Read-only: lab login needs status='active' AND isVerified. Shows both, plus recent failed-login reasons.
// Run: [LAB_EMAIL=lab@mediczy.com] node scripts/ssm-env-loader.mjs scripts/ops/lab-login-diagnose.mjs
import postgresSequelize from '../../db/postgres-sequelize.js';
import Lab from '../../models/postgres/lab.model.postgres.js';
import AuditLog from '../../models/auditLog.model.intelligent.js';

const email = (process.env.LAB_EMAIL || 'lab@mediczy.com').toLowerCase();
const lab = await Lab.findOne({ where: postgresSequelize.where(postgresSequelize.fn('LOWER', postgresSequelize.col('email')), email) });

if (!lab) console.log(`No lab with email ${email}.`);
else console.table([{ id: lab.id, email: lab.email, status: lab.status, isVerified: lab.isVerified, loginAllowed: lab.isActive() }]);

const failed = await AuditLog.findAll({ where: { action: 'LOGIN_FAILED', dateFrom: new Date(Date.now() - 30 * 864e5) }, limit: 500 });
console.log(`recent LOGIN_FAILED for ${email}:`);
console.table(failed.filter((r) => (r.user_email || '').toLowerCase() === email).slice(0, 10).map((r) => ({ at: r.timestamp, reason: r.error_message })));
process.exit(0);
