/**
 * Migration: enforce a real super-HR / staff-HR hierarchy for corporate accounts.
 *
 * Until now, corporate_admin and hr_staff were two role strings on `users`
 * that meant nothing different anywhere in the code (confirmed by
 * grepping every route/middleware that reads them — always treated as
 * interchangeable). Nothing prevented a corporate from ending up with
 * zero, one, or several "corporate_admin" rows, and there was no
 * self-service way for a corporate's own admin to invite their own staff.
 *
 * This migration adds the one piece of enforcement that has to live at
 * the database layer to be trustworthy: at most one ACTIVE
 * corporate_admin per organization_id. Everything else (who can invite,
 * who can remove) is enforced in services/corporate-hr-management
 * .service.js — application-level checks are useful, but this index is
 * the backstop that holds even if a future code path forgets to check.
 */
import pool from '../db/pgPool.js';

export async function runCorporateHrHierarchyMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Track who invited whom — audit trail, not required for the
    // invariant itself, but cheap to add now and useful later.
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by INTEGER
    `);

    // At most one ACTIVE corporate_admin per organization_id. Partial
    // index (status='active' AND role='corporate_admin' AND
    // organization_type='corporate') so archived/demoted former admins
    // don't block a new one, and so this never touches non-corporate
    // users at all.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_corporate_admin_per_org
        ON users (organization_id)
        WHERE role = 'corporate_admin'
          AND organization_type = 'corporate'
          AND status = 'active'
    `);

    await client.query('COMMIT');
    console.log('✅ corporate-hr-hierarchy migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ corporate-hr-hierarchy migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
