#!/usr/bin/env node

import pool from '../../db/pgPool.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const emailFlagIndex = args.findIndex((a) => a === '--email' || a === '-e');
  const emailFromFlag = emailFlagIndex >= 0 ? args[emailFlagIndex + 1] : null;
  const emailFromPositional = args.find((a) => typeof a === 'string' && a.includes('@'));
  const email = String(emailFromFlag || emailFromPositional || '').trim().toLowerCase();

  const daysFlagIndex = args.findIndex((a) => a === '--extend-days');
  const extendDaysRaw = daysFlagIndex >= 0 ? args[daysFlagIndex + 1] : '365';
  const extendDays = Number.parseInt(extendDaysRaw, 10);

  const dryRun = args.includes('--dry-run');

  return {
    email,
    extendDays: Number.isFinite(extendDays) && extendDays > 0 ? extendDays : 365,
    dryRun,
  };
}

async function main() {
  const { email, extendDays, dryRun } = parseArgs(process.argv);

  if (!email) {
    console.error('Usage: node scripts/admin/activate-user-subscription.mjs --email user@example.com [--extend-days 365] [--dry-run]');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `SELECT id, email, status
       FROM users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email]
    );

    if (!userRes.rows.length) {
      throw new Error(`User not found for email: ${email}`);
    }

    const user = userRes.rows[0];

    const planBeforeRes = await client.query(
      `SELECT id, "userId", "membershipPlanId", status, "startDate", "endDate", "updatedAt"
       FROM user_plans
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [user.id]
    );

    if (!planBeforeRes.rows.length) {
      throw new Error(`No row found in user_plans for userId=${user.id}`);
    }

    const planBefore = planBeforeRes.rows[0];

    await client.query(
      `UPDATE users
       SET status = 'active', "updatedAt" = NOW()
       WHERE id = $1`,
      [user.id]
    );

    await client.query(
      `UPDATE user_plans
       SET status = 'active',
           "startDate" = CASE
             WHEN "startDate" IS NULL OR "startDate" > CURRENT_DATE THEN CURRENT_DATE
             ELSE "startDate"
           END,
           "endDate" = CASE
             WHEN "endDate" IS NULL OR "endDate" < CURRENT_DATE
               THEN (CURRENT_DATE + ($1::text || ' days')::interval)::date
             ELSE "endDate"
           END,
           "updatedAt" = NOW()
       WHERE id = $2`,
      [extendDays, planBefore.id]
    );

    const userAfterRes = await client.query(
      `SELECT id, email, status, "updatedAt"
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [user.id]
    );

    const planAfterRes = await client.query(
      `SELECT id, "userId", "membershipPlanId", status, "startDate", "endDate", "updatedAt"
       FROM user_plans
       WHERE id = $1
       LIMIT 1`,
      [planBefore.id]
    );

    const validTodayRes = await client.query(
      `SELECT id, "membershipPlanId", status, "startDate", "endDate"
       FROM user_plans
       WHERE "userId" = $1
         AND status = 'active'
         AND "startDate" <= CURRENT_DATE
         AND "endDate" >= CURRENT_DATE
       ORDER BY "endDate" DESC
       LIMIT 1`,
      [user.id]
    );

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    const output = {
      success: true,
      mode: dryRun ? 'dry-run' : 'applied',
      email,
      userBefore: user,
      userAfter: userAfterRes.rows[0] || null,
      planBefore,
      planAfter: planAfterRes.rows[0] || null,
      hasValidPlanToday: validTodayRes.rows.length > 0,
      validPlanToday: validTodayRes.rows[0] || null,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error(
      JSON.stringify(
        {
          success: false,
          email,
          message: error.message,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
