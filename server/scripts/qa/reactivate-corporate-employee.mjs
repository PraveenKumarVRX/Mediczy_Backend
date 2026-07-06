#!/usr/bin/env node
/**
 * Reactivate a corporate employee stuck on "Account is inactive" at login.
 *
 * Usage:
 *   node server/scripts/qa/reactivate-corporate-employee.mjs --email lokireddy@ninjacart.com
 *   node server/scripts/qa/reactivate-corporate-employee.mjs --employee-id C26386
 *   node server/scripts/qa/reactivate-corporate-employee.mjs --email x@y.com --dry-run
 */

import postgresSequelize from '../../db/postgres-sequelize.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const emailArg = args.find((a) => a.includes('@'));
const emailFlagIdx = args.indexOf('--email');
const empFlagIdx = args.indexOf('--employee-id');
const email =
  (emailFlagIdx >= 0 ? args[emailFlagIdx + 1] : null) ||
  emailArg ||
  null;
const employeeId =
  empFlagIdx >= 0 ? args[empFlagIdx + 1] : null;

if (!email && !employeeId) {
  console.error('Provide --email <addr> and/or --employee-id <id>');
  process.exit(1);
}

async function findUser() {
  if (email) {
    const rows = await postgresSequelize.query(
      `SELECT u.id, u.email, u.status, u."firstName", u."lastName", u.employee_id, u."isCorporate"
         FROM users u
        WHERE lower(u.email) = lower(:email)
        LIMIT 1`,
      { replacements: { email: email.trim() }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (rows[0]) return rows[0];
  }

  if (employeeId) {
    const normalized = String(employeeId).trim();
    const rows = await postgresSequelize.query(
      `SELECT DISTINCT u.id, u.email, u.status, u."firstName", u."lastName", u.employee_id, u."isCorporate"
         FROM users u
         LEFT JOIN corporate_employees ce ON ce."userId" = u.id
         LEFT JOIN user_associations ua ON ua."userId" = u.id AND ua."entityType" = 'corporate'
        WHERE lower(coalesce(u.employee_id, '')) = lower(:eid)
           OR lower(coalesce(ce."employeeId", '')) = lower(:eid)
           OR lower(coalesce(ua.metadata->>'employeeId', '')) = lower(:eid)
        LIMIT 5`,
      { replacements: { eid: normalized }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) {
      console.log(JSON.stringify({ success: false, message: 'Multiple users match employee ID', matches: rows }, null, 2));
      process.exit(1);
    }
  }

  return null;
}

async function main() {
  const user = await findUser();
  if (!user) {
    console.log(JSON.stringify({ success: false, message: 'User not found', email, employeeId }, null, 2));
    await postgresSequelize.close();
    process.exit(1);
  }

  const associations = await postgresSequelize.query(
    `SELECT ua."entityId" AS corporate_id, c."companyName", ua.status AS assoc_status, ua.metadata
       FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId"
      WHERE ua."userId" = :userId AND ua."entityType" = 'corporate' AND ua.role = 'employee'`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const subscriptions = await postgresSequelize.query(
    `SELECT us.id, us.plan_id, us.status, sp.name AS plan_name
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = :userId
      ORDER BY us.updated_at DESC NULLS LAST
      LIMIT 5`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const before = { user, associations, subscriptions };

  if (dryRun) {
    console.log(JSON.stringify({ success: true, dryRun: true, before, actions: ['SET users.status=active', 'SET user_associations.status=active', 'SET user_subscriptions ACTIVE for corporate plan'] }, null, 2));
    await postgresSequelize.close();
    return;
  }

  await postgresSequelize.query(
    `UPDATE users
        SET status = 'active', "isCorporate" = true, "isVerified" = true, "updatedAt" = NOW()
      WHERE id = :userId`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.UPDATE }
  );

  await postgresSequelize.query(
    `UPDATE user_associations
        SET status = 'active', "updatedAt" = NOW()
      WHERE "userId" = :userId AND "entityType" = 'corporate' AND role = 'employee'`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.UPDATE }
  );

  await postgresSequelize.query(
    `UPDATE corporate_employees
        SET "isActive" = true, "updatedAt" = NOW()
      WHERE "userId" = :userId`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.UPDATE }
  );

  // Reactivate latest corporate subscription if present
  await postgresSequelize.query(
    `UPDATE user_subscriptions us
        SET status = 'ACTIVE', updated_at = NOW()
      WHERE us.user_id = :userId
        AND us.id = (
          SELECT us2.id FROM user_subscriptions us2
          JOIN subscription_plans sp ON sp.id = us2.plan_id
         WHERE us2.user_id = :userId AND sp.type = 'CORPORATE'
         ORDER BY us2.updated_at DESC NULLS LAST
         LIMIT 1
        )`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.UPDATE }
  );

  const [afterUser] = await postgresSequelize.query(
    `SELECT id, email, status, employee_id, "isCorporate" FROM users WHERE id = :userId`,
    { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.SELECT }
  );

  console.log(JSON.stringify({
    success: true,
    message: 'Corporate employee reactivated — ask user to log in again',
    before: { status: user.status, email: user.email, employee_id: user.employee_id },
    after: afterUser,
    corporateLinks: associations,
  }, null, 2));

  await postgresSequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try { await postgresSequelize.close(); } catch { /* ignore */ }
  process.exit(1);
});
