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
  const [user] = await postgresSequelize.query(
    `SELECT id, email
     FROM users
     WHERE lower(email) = :email
     LIMIT 1`,
    { replacements: { email }, type: postgresSequelize.QueryTypes.SELECT }
  );

  if (!user) {
    console.log(JSON.stringify({ success: false, message: 'User not found', email }, null, 2));
    await postgresSequelize.close();
    return;
  }

  const hasUserPlans = await tableExists('user_plans');
  const hasMembershipPlans = await tableExists('membership_plans');

  let records = [];
  if (hasUserPlans) {
    const cols = await getTableColumns('user_plans');
    const userIdCol = cols.has('user_id') ? 'user_id' : '"userId"';
    const startDateCol = cols.has('start_date') ? 'start_date' : '"startDate"';
    const endDateCol = cols.has('end_date') ? 'end_date' : '"endDate"';
    const updatedAtCol = cols.has('updated_at') ? 'updated_at' : '"updatedAt"';
    const statusCol = cols.has('status') ? 'status' : null;
    const planIdCol = cols.has('membership_plan_id')
      ? 'membership_plan_id'
      : (cols.has('membershipPlanId') ? '"membershipPlanId"' : null);

    if (hasMembershipPlans) {
      const mpCols = await getTableColumns('membership_plans');
      const mpNameCol = mpCols.has('name') ? 'name' : (mpCols.has('plan_name') ? 'plan_name' : null);
      const mpSlugCol = mpCols.has('slug') ? 'slug' : (mpCols.has('plan_slug') ? 'plan_slug' : null);

      const selectStatus = statusCol ? `up.${statusCol}` : `NULL::text`;
      const selectPlanId = planIdCol ? `up.${planIdCol}` : `NULL::bigint`;
      const selectPlanName = mpNameCol ? `mp.${mpNameCol}` : `NULL::text`;
      const selectPlanSlug = mpSlugCol ? `mp.${mpSlugCol}` : `NULL::text`;
      records = await postgresSequelize.query(
        `SELECT
           up.id,
           up.${userIdCol} AS "userId",
           ${selectStatus} AS status,
           up.${startDateCol} AS "startDate",
           up.${endDateCol} AS "endDate",
           up.${updatedAtCol} AS "updatedAt",
           ${selectPlanId} AS "membershipPlanId",
           mp.id AS "planId",
           ${selectPlanName} AS "planName",
           ${selectPlanSlug} AS "planSlug"
         FROM user_plans up
         LEFT JOIN membership_plans mp ON mp.id = ${selectPlanId}
         WHERE up.${userIdCol} = :userId
         ORDER BY up.${endDateCol} DESC NULLS LAST, up.${updatedAtCol} DESC NULLS LAST`,
        { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.SELECT }
      );
    } else {
      const selectStatus = statusCol ? `up.${statusCol}` : `NULL::text`;
      const selectPlanId = planIdCol ? `up.${planIdCol}` : `NULL::bigint`;
      records = await postgresSequelize.query(
        `SELECT
           up.id,
           up.${userIdCol} AS "userId",
           ${selectStatus} AS status,
           up.${startDateCol} AS "startDate",
           up.${endDateCol} AS "endDate",
           up.${updatedAtCol} AS "updatedAt",
           ${selectPlanId} AS "membershipPlanId"
         FROM user_plans up
         WHERE up.${userIdCol} = :userId
         ORDER BY up.${endDateCol} DESC NULLS LAST, up.${updatedAtCol} DESC NULLS LAST`,
        { replacements: { userId: user.id }, type: postgresSequelize.QueryTypes.SELECT }
      );
    }
  }

  const silverRows = records.filter((r) => {
    const name = String(r.planName || '').toLowerCase();
    const slug = String(r.planSlug || '').toLowerCase();
    return name.includes('silver') || slug.includes('silver');
  });

  const now = new Date();
  const latestSilver = silverRows[0] || null;
  const silverExpired = latestSilver?.endDate ? new Date(latestSilver.endDate) < now : null;

  console.log(
    JSON.stringify(
      {
        success: true,
        email: user.email,
        userId: user.id,
        foundSilverPlanRecord: Boolean(latestSilver),
        latestSilverPlan: latestSilver,
        silverPlanExpired: silverExpired,
        allPlanRows: records,
      },
      null,
      2
    )
  );

  await postgresSequelize.close();
}

main().catch(async (error) => {
  console.error('check-user-silver-plan failed:', error.message);
  try { await postgresSequelize.close(); } catch {}
  process.exit(1);
});
