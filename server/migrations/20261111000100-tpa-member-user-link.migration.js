/**
 * Links a TPA member record to the account that signs in as them.
 *
 * tpa_members carried member_id, employee_id, employee_name and a four-digit
 * phone_last4, and nothing tying it to a user. A member-facing e-card therefore
 * had no safe way to answer "which card is mine": matching on a name, or on
 * four digits of a phone number, collides — and a collision here hands one
 * person another person's insurance card, policy number and balance.
 *
 * The column is nullable on purpose. Existing rows have no verified link, so
 * they stay unlinked and the member endpoint reports that no card is linked yet
 * rather than guessing. Linking is an explicit act, done by the TPA desk.
 *
 * Additive and idempotent.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    ALTER TABLE tpa_members
      ADD COLUMN IF NOT EXISTS user_id BIGINT;

    -- One account cannot be two members of the same TPA: that is the ambiguity
    -- this column exists to remove.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tpa_members_tpa_user
      ON tpa_members (tpa_id, user_id)
      WHERE user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_members_user
      ON tpa_members (user_id)
      WHERE user_id IS NOT NULL;
  `);
}

export async function down(db = pool) {
  await db.query(`
    DROP INDEX IF EXISTS uq_tpa_members_tpa_user;
    DROP INDEX IF EXISTS idx_tpa_members_user;
    ALTER TABLE tpa_members DROP COLUMN IF EXISTS user_id;
  `);
}

if ((process.argv[1] || '').includes('20261111000100-tpa-member-user-link')) {
  up().then(() => { console.log('tpa member user link applied'); process.exit(0); })
      .catch((error) => { console.error(error); process.exit(1); });
}
