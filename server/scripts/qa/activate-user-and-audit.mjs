#!/usr/bin/env node

import postgresSequelize from '../../db/postgres-sequelize.js';

const emailArg = process.argv.find((arg) => typeof arg === 'string' && arg.includes('@'));
const email = (emailArg || 'user@mediczy.com').trim().toLowerCase();

async function tableExists(tableName) {
  const rows = await postgresSequelize.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :tableName
     LIMIT 1`,
    {
      replacements: { tableName },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  return rows.length > 0;
}

async function queryIfTable(tableName, sql, replacements = {}) {
  if (!(await tableExists(tableName))) return [];
  return postgresSequelize.query(sql, {
    replacements,
    type: postgresSequelize.QueryTypes.SELECT,
  });
}

async function getTableColumns(tableName) {
  const rows = await postgresSequelize.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :tableName`,
    {
      replacements: { tableName },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  const users = await postgresSequelize.query(
    `SELECT id, email, status, role, "updatedAt"
     FROM users
     WHERE lower(email) = :email
     LIMIT 1`,
    {
      replacements: { email },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  const user = users[0] || null;
  if (!user) {
    console.log(JSON.stringify({ success: false, message: 'User not found', email }, null, 2));
    await postgresSequelize.close();
    return;
  }

  await postgresSequelize.query(
    `UPDATE users
     SET status = 'active', "updatedAt" = NOW()
     WHERE id = :userId`,
    {
      replacements: { userId: user.id },
      type: postgresSequelize.QueryTypes.UPDATE,
    }
  );

  const refreshedRows = await postgresSequelize.query(
    `SELECT id, email, status, role, "updatedAt"
     FROM users
     WHERE id = :userId
     LIMIT 1`,
    {
      replacements: { userId: user.id },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  const refreshed = refreshedRows[0];

  const userPlans = await queryIfTable(
    'user_plans',
    `SELECT id, "userId", status, "startDate", "endDate", "updatedAt"
     FROM user_plans
     WHERE "userId" = :userId
     ORDER BY COALESCE("updatedAt", NOW()) DESC
     LIMIT 5`,
    { userId: user.id }
  );

  const userSubscriptions = await queryIfTable(
    'user_subscriptions',
    `SELECT id, user_id, status, start_date, end_date, updated_at
     FROM user_subscriptions
     WHERE user_id = :userId
     ORDER BY COALESCE(updated_at, NOW()) DESC
     LIMIT 5`,
    { userId: user.id }
  );

  const activePlan = await queryIfTable(
    'user_plans',
    `SELECT id
     FROM user_plans
     WHERE "userId" = :userId
       AND status = 'active'
       AND "startDate" <= CURRENT_DATE
       AND "endDate" >= CURRENT_DATE
     LIMIT 1`,
    { userId: user.id }
  );

  let auditLogRows = [];
  if (await tableExists('audit_logs')) {
    const cols = await getTableColumns('audit_logs');
    const whereParts = [];
    const replacements = { userId: user.id, emailLike: `%${email}%` };

    if (cols.has('user_id')) whereParts.push('(a.user_id IS NOT NULL AND CAST(a.user_id AS TEXT) = CAST(:userId AS TEXT))');
    if (cols.has('email')) whereParts.push('a.email ILIKE :emailLike');
    if (cols.has('metadata')) whereParts.push('CAST(a.metadata AS TEXT) ILIKE :emailLike');
    if (cols.has('new_values')) whereParts.push('CAST(a.new_values AS TEXT) ILIKE :emailLike');
    if (cols.has('old_values')) whereParts.push('CAST(a.old_values AS TEXT) ILIKE :emailLike');
    if (cols.has('details')) whereParts.push('CAST(a.details AS TEXT) ILIKE :emailLike');

    const whereClause = whereParts.length ? whereParts.join(' OR ') : '1=0';
    const orderColumn = cols.has('created_at') ? 'created_at' : (cols.has('timestamp') ? 'timestamp' : null);

    const sql = `SELECT to_jsonb(a) AS row
      FROM audit_logs a
      WHERE ${whereClause}
      ${orderColumn ? `ORDER BY a.${orderColumn} DESC` : ''}
      LIMIT 20`;

    auditLogRows = await postgresSequelize.query(sql, {
      replacements,
      type: postgresSequelize.QueryTypes.SELECT,
    });
  }

  const likelyCause = activePlan.length === 0
    ? 'No active row in user_plans; membership middleware likely auto-set status to inactive on protected route access.'
    : 'Active membership row exists; likely deactivated by an explicit admin/system action (check audit_logs output).';

  console.log(
    JSON.stringify(
      {
        success: true,
        userId: user.id,
        email,
        activation: {
          previousStatus: user.status,
          currentStatus: refreshed.status,
          updatedAt: refreshed.updatedAt,
        },
        membershipSignals: {
          hasActiveUserPlan: activePlan.length > 0,
          recentUserPlans: userPlans,
          recentUserSubscriptions: userSubscriptions,
        },
        likelyCause,
        recentAuditLogRows: auditLogRows.map((r) => r.row),
      },
      null,
      2
    )
  );

  await postgresSequelize.close();
}

main().catch(async (error) => {
  console.error('activate-user-and-audit failed:', error.message);
  try { await postgresSequelize.close(); } catch {}
  process.exit(1);
});
