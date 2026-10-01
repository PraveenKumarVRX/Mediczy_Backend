/**
 * Remediation for the 2026-10-01 structural audit (scripts/ops/db-audit.mjs).
 * Covers only the items that are additive and reversible. Each is independent.
 *
 * P1  user_plans had 723,377 sequential scans against 3 index scans on 1,168 rows — every
 *     request appears to scan it. The query shape is `WHERE "userId" = $1 AND status = 'active'`
 *     (scripts/tag-user-to-aggregator.js, routes/employee-network.route.js, the membership
 *     middleware), so a composite index on ("userId", status) serves both the lookup and the
 *     join. Built CONCURRENTLY: no write lock.
 *
 * P2  enum_tenants_type is missing 'diagnostic_centre'. The Sequelize model declares it, so
 *     Sequelize will emit it and Postgres will reject the value. (The reverse drift — the DB
 *     having 'aggregator' and 'trial', which the models lack — is fixed in the models, not here;
 *     removing an enum value is not safely reversible.)
 *
 * NOT INCLUDED, deliberately: enabling RLS on the 13 unprotected password tables. The existing
 * policy shape depends on current_setting('app.current_org_id'), which rls-context.middleware.js
 * does NOT set — it only attaches req.withRlsTransaction/req.setSequelizeRlsContext, used by
 * about nine services. Every other query, including every login's User.findOne, runs with the
 * variable unset, so the policy would evaluate NULL and return zero rows. Enabling RLS before the
 * context is universal is a platform outage, not a hardening step.
 *
 * CONCURRENTLY cannot run inside a transaction block, so this file deliberately opens none.
 */
import pool from '../db/pgPool.js';

export const INDEX = 'idx_user_plans_user_status';

export async function up() {
  const exists = async (t) => (await pool.query('SELECT to_regclass($1) AS r', [`public.${t}`])).rows[0].r;

  // ── P1: the user_plans hot path ───────────────────────────────────────────────────────────
  if (await exists('user_plans')) {
    // A failed CONCURRENTLY build leaves an INVALID index; drop it so a re-run is idempotent.
    const invalid = await pool.query(
      `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = $1 AND i.indisvalid = false`, [INDEX]);
    if (invalid.rows.length) {
      console.log(`[audit-remediation] dropping invalid leftover ${INDEX}`);
      await pool.query(`DROP INDEX IF EXISTS ${INDEX}`);
    }
    // "userId" is camelCase in this table — it must stay quoted.
    await pool.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX} ON user_plans ("userId", status)`);
    console.log(`[audit-remediation] ${INDEX} ready`);
  } else {
    console.log('[audit-remediation] user_plans absent — skipped');
  }

  // ── P2: enum value the model already relies on ────────────────────────────────────────────
  const hasValue = await pool.query(
    `SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'enum_tenants_type' AND e.enumlabel = 'diagnostic_centre'`);
  if (hasValue.rows.length) {
    console.log('[audit-remediation] enum_tenants_type already has diagnostic_centre');
  } else {
    await pool.query(`ALTER TYPE "enum_tenants_type" ADD VALUE IF NOT EXISTS 'diagnostic_centre'`);
    console.log('[audit-remediation] added diagnostic_centre to enum_tenants_type');
  }
}

export async function down() {
  // The index is reversible. The enum value is NOT — Postgres cannot drop an enum label — so it
  // is intentionally left in place; it is additive and nothing breaks by keeping it.
  await pool.query(`DROP INDEX IF EXISTS ${INDEX}`);
}

export default { up, down, INDEX };
