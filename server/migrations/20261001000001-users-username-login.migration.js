/**
 * users: a `username` login identifier, for staff who have no usable email address.
 *
 * Why: the department staff logins (unified-hospital-staff.controller.js) look an account up by
 * { email, organization_id, role }, i.e. they assume one email can hold several roles. The schema
 * disagreed — `users.email` is UNIQUE and was NOT NULL — so a person could hold exactly one role
 * platform-wide, and HR staff who share or lack a corporate email could not be given an hr_staff
 * row at all. Their HR privileges were unreachable: /api/hospital/staff/hr/login filters on
 * role:'hr_staff', found nothing, and answered "Invalid email or password".
 *
 * This migration adds an alternative identifier rather than weakening the email constraint.
 *
 * Additive and idempotent. Three statements, none of which rewrites the table:
 *   1. a nullable VARCHAR column (metadata-only ALTER),
 *   2. a UNIQUE index on lower(username) WHERE username IS NOT NULL — case-insensitive, and
 *      partial so that every existing email-only account (username NULL) is simply not indexed.
 *      Built CONCURRENTLY so it takes no write lock on a live `users` table,
 *   3. DROP NOT NULL on email (metadata-only), so a username-only staff row can be inserted.
 *      `email` keeps its UNIQUE index; Postgres treats NULLs as distinct, so any number of
 *      username-only rows may coexist.
 *
 * Username uniqueness is deliberately GLOBAL, not per-tenant. The HR login page has a generic
 * form (/hr/login) that carries no hospital identifier, so a per-tenant username could not be
 * resolved there without asking the user which hospital they belong to.
 *
 * NOTE: statement 2 uses CONCURRENTLY, which cannot run inside a transaction block. Run this
 * migration on its own (the ssm-env-loader path does not wrap it in one), not nested in a txn.
 */
import pool from '../db/pgPool.js';

export const TABLE = 'users';
export const INDEX = 'users_username_lower_unique';

export async function up() {
  if (!(await pool.query('SELECT to_regclass($1) AS r', [`public.${TABLE}`])).rows[0].r) {
    console.log(`[username-login] ${TABLE} does not exist — nothing to do`);
    return;
  }

  await pool.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS username VARCHAR(100)`);

  // CONCURRENTLY leaves an INVALID index behind if it fails (e.g. a pre-existing duplicate).
  // Drop any invalid leftover first so a re-run is genuinely idempotent.
  const invalid = await pool.query(
    `SELECT c.relname FROM pg_class c
       JOIN pg_index i ON i.indexrelid = c.oid
      WHERE c.relname = $1 AND i.indisvalid = false`,
    [INDEX],
  );
  if (invalid.rows.length) {
    console.log(`[username-login] dropping invalid leftover index ${INDEX}`);
    await pool.query(`DROP INDEX IF EXISTS ${INDEX}`);
  }

  await pool.query(
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX}
       ON ${TABLE} (lower(username)) WHERE username IS NOT NULL`,
  );

  await pool.query(`ALTER TABLE ${TABLE} ALTER COLUMN email DROP NOT NULL`);

  console.log(`[username-login] ${TABLE}.username ready; email is now nullable`);
}

export async function down() {
  // Re-asserting NOT NULL on email is intentionally NOT done here: by the time this runs there
  // may be username-only rows with a NULL email, and the ALTER would fail against live data.
  // Delete or backfill those rows first if the column must go back to NOT NULL.
  await pool.query(`DROP INDEX IF EXISTS ${INDEX}`);
  await pool.query(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS username`);
}

export default { up, down, TABLE, INDEX };
