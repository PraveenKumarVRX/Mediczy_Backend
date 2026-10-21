/**
 * One-off repair: Test Corporate Ltd's TEST-SK01 employee record
 * (corporate_employees.id = 4516) was linked to the wrong `users` row.
 *
 * Root cause (confirmed 2026-10-21): two `users` rows share the email
 * "user@mediczy.com" differing only by case - the real account (id 19,
 * "Shiva Kumar", created Dec 2025) and an old placeholder/seed account
 * (id 6911, "User1234 27", created Jul 2026, email "User@mediczy.com").
 * The employee-linking query's `lower(email) = ... LIMIT 1` (no ORDER BY,
 * now fixed in corporate.route.js / corporate-employee-activation.service.js)
 * nondeterministically picked the placeholder account. user_associations
 * already has the CORRECT row for user 19 (id 20439) - it's only
 * corporate_employees.userId that's wrong, plus a stray duplicate
 * association row (id 20440) for the wrong account.
 *
 * This script: re-points corporate_employees.userId to 19, deletes the
 * stray association, and verifies the kept association belongs to 19 -
 * all inside one transaction, rolled back if any assertion fails.
 * Does not touch user 6911 itself (left alone; it has no other activity).
 *
 * Run: node server/scripts/ssm-env-loader.mjs server/scripts/ops/repair-test-sk01-employee-link.mjs
 */
import pool from '../../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const before = await client.query(`SELECT id, "userId" FROM corporate_employees WHERE id = 4516`);
  console.log('before:', before.rows);

  const upd = await client.query(
    `UPDATE corporate_employees SET "userId" = 19, "updatedAt" = NOW() WHERE id = 4516 AND "userId" = 6911 RETURNING id, "userId"`
  );
  console.log('corporate_employees update:', upd.rows);
  if (upd.rowCount !== 1) throw new Error('expected exactly 1 row updated, got ' + upd.rowCount);

  const del = await client.query(
    `DELETE FROM user_associations WHERE id = 20440 AND "userId" = 6911 RETURNING id`
  );
  console.log('deleted stray association:', del.rows);
  if (del.rowCount !== 1) throw new Error('expected exactly 1 row deleted, got ' + del.rowCount);

  const keep = await client.query(`SELECT id, "userId", status FROM user_associations WHERE id = 20439`);
  console.log('kept correct association:', keep.rows);
  if (keep.rows[0]?.userId !== 19) throw new Error('expected the kept association to belong to user 19');

  await client.query('COMMIT');
  console.log('✅ repair committed');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ rolled back:', err.message);
  throw err;
} finally {
  client.release();
  process.exit(0);
}
