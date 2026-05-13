/**
 * Add 'active' and 'expired' to the prescription status enum.
 * These values are used by the expiry cron and patient-facing routes
 * but were missing from the original ENUM definition, causing 500 errors.
 */

export async function up(queryInterface) {
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_prescriptions_status" ADD VALUE IF NOT EXISTS 'active';
  `);
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_prescriptions_status" ADD VALUE IF NOT EXISTS 'expired';
  `);
  console.log('✅ Added active/expired to enum_prescriptions_status');
}

export async function down(queryInterface) {
  // PostgreSQL does not support removing individual values from an ENUM.
  // To revert, recreate the type and cast all rows. Skipping for safety.
  console.log('ℹ️  Down migration for enum values is a no-op (Postgres cannot drop enum values)');
}
