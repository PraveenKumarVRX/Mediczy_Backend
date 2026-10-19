/**
 * Field Force — add the missing field_visits.visit_type column
 *
 * The Smart Force API doc (docs/api/SMART_FORCE_MOBILE_API.md) documents `visit_type`
 * (regular | followup | sample_drop | cme_invite) as a first-class field on every visit,
 * distinct from the existing `purpose` column (initial_visit|follow_up|proposal|...).
 * Phase 5/6 route code (institution profile, territory, exceptions, offline sync's
 * create_visit op) already assumes this column exists and queries/inserts it — but no
 * migration ever created it, so those endpoints 500 on every call. This adds it.
 *
 * Safe to re-run (ADD COLUMN IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await client.query(`
    ALTER TABLE field_visits
      ADD COLUMN IF NOT EXISTS visit_type VARCHAR(20) DEFAULT 'regular'
        CHECK (visit_type IN ('regular','followup','sample_drop','cme_invite'))
  `);

  await client.query('COMMIT');
  console.log('✅ field_visits.visit_type added');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ field-force-visit-type migration failed:', err.message);
  throw err;
} finally {
  client.release();
}
