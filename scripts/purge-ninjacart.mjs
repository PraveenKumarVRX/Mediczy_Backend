import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  user: 'mediczy_helper',
  password: 'Mediczy2024Helper',
  database: 'mediczy_ai',
});

const CORP_ID = 48;
const CORP_NAME = 'Ninjacart';

// Tables with direct corporate_id FK (delete order matters for FKs)
const DEPENDENT_TABLES = [
  'api_credentials',
  'corporate_employees',
  'corporate_health_reports',
  'corporate_network_assignments',
  'corporate_plan_sponsorships',
  'corporate_team_assignments',
  'corporate_wellness_events',
  'coupons',
  'health_challenges',
  'health_goals',
  'referral_codes',
  'user_health_packages',
];

async function getCounts() {
  console.log(`\n=== DATA COUNTS FOR ${CORP_NAME} (id=${CORP_ID}) ===\n`);

  for (const table of DEPENDENT_TABLES) {
    const r = await pool.query(`SELECT count(*) FROM ${table} WHERE corporate_id = $1`, [CORP_ID]);
    console.log(`  ${table}: ${r.rows[0].count}`);
  }

  // Users with this corporate_id
  const users = await pool.query(`SELECT count(*) FROM users WHERE corporate_id = $1`, [CORP_ID]);
  console.log(`  users: ${users.rows[0].count}`);

  // Appointments linked to those users
  const appts = await pool.query(
    `SELECT count(*) FROM appointments WHERE "patientId" IN (SELECT id FROM users WHERE corporate_id = $1)`,
    [CORP_ID]
  );
  console.log(`  appointments (via users): ${appts.rows[0].count}`);

  // Notifications linked to those users
  const notifs = await pool.query(
    `SELECT count(*) FROM notifications WHERE "userId" IN (SELECT id FROM users WHERE corporate_id = $1)`,
    [CORP_ID]
  );
  console.log(`  notifications (via users): ${notifs.rows[0].count}`);

  // The corporate record itself
  const corp = await pool.query(`SELECT count(*) FROM corporates WHERE id = $1`, [CORP_ID]);
  console.log(`  corporates: ${corp.rows[0].count}`);
}

async function purge() {
  console.log(`\n=== PURGING ${CORP_NAME} (id=${CORP_ID}) ===\n`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get user IDs linked to this corporate
    const userRows = await client.query(
      `SELECT id FROM users WHERE corporate_id = $1`,
      [CORP_ID]
    );
    const userIds = userRows.rows.map(r => r.id);
    console.log(`  Found ${userIds.length} users to clean up`);

    if (userIds.length > 0) {
      // 2. Delete appointments for those users
      const apptDel = await client.query(
        `DELETE FROM appointments WHERE "patientId" = ANY($1::int[])`,
        [userIds]
      );
      console.log(`  Deleted ${apptDel.rowCount} appointments`);

      // 3. Delete notifications for those users
      const notifDel = await client.query(
        `DELETE FROM notifications WHERE "userId" = ANY($1::int[])`,
        [userIds]
      );
      console.log(`  Deleted ${notifDel.rowCount} notifications`);
    }

    // 4. Delete all dependent tables with corporate_id FK
    for (const table of DEPENDENT_TABLES) {
      const r = await client.query(
        `DELETE FROM ${table} WHERE corporate_id = $1`,
        [CORP_ID]
      );
      console.log(`  Deleted ${r.rowCount} rows from ${table}`);
    }

    // 5. Null out corporate_id on users (don't delete users in case they have other data)
    const usersUpdated = await client.query(
      `UPDATE users SET corporate_id = NULL WHERE corporate_id = $1`,
      [CORP_ID]
    );
    console.log(`  Unlinked ${usersUpdated.rowCount} users from corporate`);

    // 6. Delete the corporate record itself
    await client.query(`DELETE FROM corporates WHERE id = $1`, [CORP_ID]);
    console.log(`  Deleted corporates row id=${CORP_ID}`);

    await client.query('COMMIT');
    console.log(`\n✅ Purge complete. All Ninjacart data removed.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n❌ ROLLBACK - Error: ${err.message}\n`);
    throw err;
  } finally {
    client.release();
  }
}

const mode = process.argv[2];

if (mode === '--counts') {
  await getCounts();
  await pool.end();
} else if (mode === '--purge') {
  await getCounts();
  await purge();
  await pool.end();
} else {
  console.log('Usage:');
  console.log('  node scripts/purge-ninjacart.mjs --counts   # preview counts');
  console.log('  node scripts/purge-ninjacart.mjs --purge    # purge all data');
  await pool.end();
}
