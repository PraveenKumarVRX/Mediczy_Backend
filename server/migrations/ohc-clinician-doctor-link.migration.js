/**
 * Links an `ohc_doctor` / `corporate_cmo` (a `users` row) to a real `doctors` row, so they can use the
 * hospital's actual prescription and clinical-referral systems with a genuine Doctor identity instead
 * of a side, OHC-only copy of either feature. `linked_user_uid` is a brand-new cross-entity reference,
 * so it is a uid column from day one (entity-uid rule) — there is no integer column to twin.
 */
import pool from '../db/pgPool.js';

export async function runOhcClinicianDoctorLinkMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS linked_user_uid TEXT;`);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_doctors_linked_user_uid') THEN
          ALTER TABLE doctors
            ADD CONSTRAINT fk_doctors_linked_user_uid FOREIGN KEY (linked_user_uid) REFERENCES entity_registry (uid) NOT VALID;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_linked_user_uid ON doctors (linked_user_uid) WHERE linked_user_uid IS NOT NULL;
    `);
    await client.query('COMMIT');
    console.log('✅ OHC clinician doctor-link migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ OHC clinician doctor-link migration failed:', err.message);
    throw err;
  } finally { client.release(); }
}
