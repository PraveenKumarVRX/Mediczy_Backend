/**
 * A corporate AHC may explicitly cover more than one beneficiary. The initial
 * booking index used (user_id, package_id), contradicting the
 * beneficiary-aware policy enforced by the booking route. Align the database
 * invariant with that policy while keeping cancelled/completed bookings out of
 * the active entitlement key.
 */
export async function up(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS uniq_health_checkup_active_package;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_package
      ON health_checkup_bookings (user_id, package_id, (COALESCE(beneficiary_relation, 'self')))
      WHERE status NOT IN ('cancelled', 'completed');
  `);
}

// This deliberately fails if active family bookings exist during rollback,
// rather than silently discarding a valid entitlement state.
export async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS uniq_health_checkup_active_package;
    CREATE UNIQUE INDEX uniq_health_checkup_active_package
      ON health_checkup_bookings (user_id, package_id)
      WHERE status NOT IN ('cancelled', 'completed');
  `);
}
