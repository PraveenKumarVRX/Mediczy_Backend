#!/usr/bin/env node
/**
 * Ninjacart (or any corporate) employee login adoption report.
 *
 * Run on prod server (needs DB access):
 *   node server/scripts/qa/ninjacart-login-report.mjs
 *   node server/scripts/qa/ninjacart-login-report.mjs --corporate Ninjacart
 *   node server/scripts/qa/ninjacart-login-report.mjs --corporate-id 49
 *   node server/scripts/qa/ninjacart-login-report.mjs --csv /tmp/ninjacart-never-logged-in.csv
 */

import fs from 'fs';
import postgresSequelize from '../../db/postgres-sequelize.js';

const args = process.argv.slice(2);
const corpNameFlag = args.indexOf('--corporate');
const corpIdFlag = args.indexOf('--corporate-id');
const csvFlag = args.indexOf('--csv');
const corporateName = corpNameFlag >= 0 ? args[corpNameFlag + 1] : 'Ninjacart';
const corporateIdArg = corpIdFlag >= 0 ? parseInt(args[corpIdFlag + 1], 10) : null;
const csvPath = csvFlag >= 0 ? args[csvFlag + 1] : null;

async function resolveCorporateId() {
  if (corporateIdArg && !Number.isNaN(corporateIdArg)) return corporateIdArg;
  const rows = await postgresSequelize.query(
    `SELECT id, "companyName", status, "employeeCount"
       FROM corporates
      WHERE lower("companyName") LIKE lower(:pattern)
      ORDER BY CASE WHEN lower(status) = 'active' THEN 0 ELSE 1 END, id DESC`,
    {
      replacements: { pattern: `%${corporateName}%` },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  if (!rows.length) {
    throw new Error(`No corporate found matching "${corporateName}"`);
  }
  if (rows.length > 1) {
    console.error('Multiple corporates matched — using first active/newest:');
    rows.forEach((r) => console.error(`  id=${r.id} name=${r.companyName} status=${r.status}`));
  }
  return rows[0].id;
}

async function main() {
  const corporateId = await resolveCorporateId();

  const [corp] = await postgresSequelize.query(
    `SELECT id, "companyName", status, "employeeCount", unique_id FROM corporates WHERE id = :id`,
    { replacements: { id: corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const [summary] = await postgresSequelize.query(
    `SELECT
        COUNT(*) AS total_linked,
        COUNT(*) FILTER (WHERE u."lastLoginAt" IS NOT NULL) AS logged_in,
        COUNT(*) FILTER (WHERE u."lastLoginAt" IS NULL) AS never_logged_in,
        COUNT(*) FILTER (WHERE u.status = 'active') AS user_status_active,
        COUNT(*) FILTER (WHERE u.status = 'inactive') AS user_status_inactive,
        COUNT(*) FILTER (WHERE u.status NOT IN ('active', 'inactive')) AS user_status_other,
        COUNT(*) FILTER (WHERE u."lastLoginAt" >= NOW() - INTERVAL '7 days') AS active_7d,
        COUNT(*) FILTER (WHERE u."lastLoginAt" >= NOW() - INTERVAL '30 days') AS active_30d,
        COUNT(*) FILTER (WHERE wd.status = 'sent') AS welcome_email_sent
      FROM users u
      JOIN user_associations ua ON ua."userId" = u.id
        AND ua."entityType" = 'corporate'
        AND ua."entityId" = :corporateId
        AND ua.role = 'employee'
        AND ua.status = 'active'
      LEFT JOIN LATERAL (
        SELECT status FROM corporate_welcome_email_deliveries
        WHERE corporate_id = :corporateId
          AND LOWER(recipient_email) = LOWER(u.email)
          AND COALESCE(metadata->>'source', '') <> 'brevo_transactional_history'
          AND status = 'sent'
        LIMIT 1
      ) wd ON true`,
    { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const [roster] = await postgresSequelize.query(
    `SELECT
        COUNT(*) AS roster_total,
        COUNT(*) FILTER (WHERE "userId" IS NOT NULL) AS roster_with_user,
        COUNT(*) FILTER (WHERE "userId" IS NULL) AS roster_without_user,
        COUNT(*) FILTER (WHERE "isActive" = true) AS roster_active
      FROM corporate_employees
      WHERE corporate_id = :corporateId`,
    { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const neverLoggedIn = await postgresSequelize.query(
    `SELECT
        u.id,
        u.email,
        u."firstName",
        u."lastName",
        u.employee_id,
        u.status AS user_status,
        COALESCE(ce."employeeId", ua.metadata->>'employeeId') AS corporate_employee_id,
        wd.status AS welcome_email_status
      FROM users u
      JOIN user_associations ua ON ua."userId" = u.id
        AND ua."entityType" = 'corporate'
        AND ua."entityId" = :corporateId
        AND ua.role = 'employee'
        AND ua.status = 'active'
      LEFT JOIN corporate_employees ce ON ce."userId" = u.id AND ce.corporate_id = :corporateId
      LEFT JOIN LATERAL (
        SELECT status FROM corporate_welcome_email_deliveries
        WHERE corporate_id = :corporateId
          AND LOWER(recipient_email) = LOWER(u.email)
        ORDER BY updated_at DESC LIMIT 1
      ) wd ON true
      WHERE u."lastLoginAt" IS NULL
      ORDER BY u.email`,
    { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const loggedInSample = await postgresSequelize.query(
    `SELECT u.email, u."lastLoginAt", u."loginCount", u.status
       FROM users u
       JOIN user_associations ua ON ua."userId" = u.id
        AND ua."entityType" = 'corporate' AND ua."entityId" = :corporateId
        AND ua.role = 'employee' AND ua.status = 'active'
      WHERE u."lastLoginAt" IS NOT NULL
      ORDER BY u."lastLoginAt" DESC
      LIMIT 10`,
    { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );

  const total = Number(summary.total_linked || 0);
  const loggedIn = Number(summary.logged_in || 0);
  const never = Number(summary.never_logged_in || 0);
  const pct = total ? Math.round((loggedIn / total) * 1000) / 10 : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    corporate: corp,
    summary: {
      employeesWithUserAccounts: total,
      loggedIn,
      neverLoggedIn: never,
      loginRatePercent: pct,
      userStatusActive: Number(summary.user_status_active || 0),
      userStatusInactive: Number(summary.user_status_inactive || 0),
      activeLast7Days: Number(summary.active_7d || 0),
      activeLast30Days: Number(summary.active_30d || 0),
      welcomeEmailSent: Number(summary.welcome_email_sent || 0),
    },
    roster: {
      totalOnRoster: Number(roster.roster_total || 0),
      rosterLinkedToUser: Number(roster.roster_with_user || 0),
      rosterNotYetRegistered: Number(roster.roster_without_user || 0),
    },
    recentLogins: loggedInSample,
    neverLoggedInCount: neverLoggedIn.length,
  };

  console.log('\n=== Corporate employee login report ===\n');
  console.log(`Corporate: ${corp.companyName} (id=${corp.id})`);
  console.log(`Employees with app accounts: ${total}`);
  console.log(`Logged in at least once:      ${loggedIn} (${pct}%)`);
  console.log(`Never logged in:              ${never}`);
  console.log(`Inactive user status:         ${summary.user_status_inactive}`);
  console.log(`Active in last 7 days:        ${summary.active_7d}`);
  console.log(`Active in last 30 days:       ${summary.active_30d}`);
  console.log(`Roster rows (corporate_employees): ${roster.roster_total} (${roster.roster_without_user} not registered yet)`);
  console.log('\n--- JSON ---');
  console.log(JSON.stringify(report, null, 2));

  if (csvPath) {
    const header = 'user_id,email,first_name,last_name,employee_id,user_status,welcome_email_status\n';
    const lines = neverLoggedIn.map((r) =>
      [
        r.id,
        r.email,
        r.firstName || '',
        r.lastName || '',
        r.corporate_employee_id || r.employee_id || '',
        r.user_status,
        r.welcome_email_status || '',
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    );
    fs.writeFileSync(csvPath, header + lines.join('\n'));
    console.log(`\nWrote never-logged-in list: ${csvPath} (${neverLoggedIn.length} rows)`);
  }

  await postgresSequelize.close();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { await postgresSequelize.close(); } catch { /* ignore */ }
  process.exit(1);
});
