/**
 * is_demo_account(user_id): true for a sales demo login (users.metadata.demoAccount = true).
 *
 * Partner work queues (doctor requests, lab orders, Team check-up approvals) and the reminder jobs that
 * contact doctors or third parties filter on NOT is_demo_account(<patient column>), so a booking made
 * from the shared demo login is visible to the demo account only and nobody is asked to act on it.
 * See middleware/demo-account-guard.middleware.js.
 *
 * A primary-key lookup per row; STABLE so the planner may cache it within a statement.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261117000100-demo-account-function.migration.js
 */
import { fileURLToPath } from 'node:url';

export async function up(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION is_demo_account(account_id integer) RETURNS boolean
    LANGUAGE sql STABLE AS $fn$
      SELECT COALESCE((SELECT u.metadata->>'demoAccount' = 'true' FROM users u WHERE u.id = account_id), false)
    $fn$`);
  await client.query(`COMMENT ON FUNCTION is_demo_account(integer) IS
    'True for a shared sales demo login; partner queues and reminder jobs exclude its rows (demo-account guard).'`);
}

export async function down(client) {
  await client.query('DROP FUNCTION IF EXISTS is_demo_account(integer)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { default: pool } = await import('../db/pgPool.js');
  const client = await pool.connect();
  try { await client.query('BEGIN'); await up(client); await client.query('COMMIT'); console.log('is_demo_account() installed'); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error(error.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
