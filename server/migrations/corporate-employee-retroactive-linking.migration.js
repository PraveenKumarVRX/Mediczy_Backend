/**
 * Corporate employee retroactive linking
 *
 * Before today, POST /api/corporate/employees never looked up an existing
 * `users` account by email, so every corporate_employees row was created with
 * userId=NULL and no user_associations row — regardless of whether the
 * employee already had a real patient-portal account. This is why wellness
 * event targeting ("All Employees"), the Fitness-Certificate employee search,
 * and the Health-Report upload search all showed 0/none: all three read from
 * user_associations, which only ever had rows for employees linked AFTER
 * manually clicking "Reactivate Login" on the Team side.
 *
 * The route-level fix (server/routes/corporate.route.js) now does this
 * matching at creation time (and at login time, for the reverse ordering).
 * This is the one-time backfill for employees created before that fix.
 *
 * Safe to re-run — only touches rows that are still unlinked.
 *
 * 2026-10-21: found live, via TEST-SK01 in Test Corporate Ltd, that a plain
 * `JOIN users u ON lower(u.email) = lower(ce.email)` with no deterministic
 * ordering can match the WRONG user when two users rows share an email that
 * differs only by case (no case-insensitive uniqueness constraint on
 * users.email) — it linked to a years-old placeholder/seed account instead
 * of the real one. DISTINCT ON + ORDER BY below makes the match
 * deterministic: an exact-case match wins, then a user with an actual
 * recorded login, then the oldest id.
 */

import pool from '../db/pgPool.js';
import { reactivateCorporateEmployeeAccount } from '../services/corporate-employee-activation.service.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const { rows: matches } = await client.query(`
    SELECT DISTINCT ON (ce.id) ce.id AS ce_id, ce.corporate_id, ce."employeeId", u.id AS user_id
    FROM corporate_employees ce
    JOIN users u ON lower(u.email) = lower(ce.email)
    WHERE ce."userId" IS NULL AND ce.email IS NOT NULL AND ce."isActive" = true
    ORDER BY ce.id, (u.email = ce.email) DESC, (u."lastLoginAt" IS NOT NULL) DESC, u.id ASC
  `);

  console.log(`Found ${matches.length} existing employee record(s) matching a real user account by email`);

  const linkedUserIds = [];
  for (const m of matches) {
    await client.query(`UPDATE corporate_employees SET "userId" = $1, "updatedAt" = NOW() WHERE id = $2`, [m.user_id, m.ce_id]);

    await client.query(
      `INSERT INTO user_associations ("userId", "entityType", "entityId", role, status, metadata, corporate_unique_id, "createdAt", "updatedAt")
       SELECT $1, 'corporate', $2, 'employee', 'active',
              jsonb_build_object('employeeId', $3::text, 'profileActivation', 'active'),
              (SELECT unique_id FROM corporates WHERE id = $2), NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM user_associations WHERE "userId" = $1 AND "entityType" = 'corporate' AND "entityId" = $2 AND role = 'employee'
       )`,
      [m.user_id, m.corporate_id, m.employeeId]
    );
    linkedUserIds.push(m.user_id);
  }

  await client.query('COMMIT');
  console.log(`✅ Linked ${linkedUserIds.length} employee record(s)`);

  // Flip each linked user's account status/isCorporate flag (outside the main
  // transaction since reactivateCorporateEmployeeAccount runs its own queries).
  for (const userId of linkedUserIds) {
    const result = await reactivateCorporateEmployeeAccount(userId);
    console.log(`  user ${userId}:`, JSON.stringify(result));
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ corporate-employee-retroactive-linking failed:', err.message);
  client.release();
  process.exit(1);
}
client.release();
process.exit(0);
