/**
 * Gives a TPA membership the two references it needs to be identified: the
 * corporate it belongs to, and (on an enrolment) the account being enrolled.
 *
 * `tpa_members.corporate_name` is free text that defaults to the literal
 * 'Corporate not mapped', so "every member of this corporate" was not an
 * answerable question, and neither was "is this employee of ours a member".
 * The gap analysis specified the mapping from the start — the plan's own data
 * model line for tpa_members reads "coverage snapshot *or mapping to existing
 * corporate employee/member tables*" — and only the snapshot was built.
 *
 * With corporate_id in place a member resolves the way the corporate roster
 * already does: the employer's own staff code, scoped to one employer, through
 * corporate_employees."userId", which is itself already linked to users. A
 * staff code is unique by the employer's definition; a name or four digits of
 * a phone number is not, and a collision there hands one person another
 * person's policy number and balance.
 *
 * `tpa_member_enrollments` gets user_id for the same reason: approving an
 * enrolment is what creates the member row, so the link belongs upstream,
 * where a human is already deciding who this is.
 *
 * Every column is nullable and additive. Existing rows stay unlinked rather
 * than guessed.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    ALTER TABLE tpa_members
      ADD COLUMN IF NOT EXISTS corporate_id INTEGER,
      ADD COLUMN IF NOT EXISTS linked_by_user_id INTEGER,
      ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS link_method VARCHAR(40);

    ALTER TABLE tpa_member_enrollments
      ADD COLUMN IF NOT EXISTS user_id BIGINT,
      ADD COLUMN IF NOT EXISTS corporate_id INTEGER;

    CREATE INDEX IF NOT EXISTS idx_tpa_members_corporate
      ON tpa_members (corporate_id)
      WHERE corporate_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_enrollments_user
      ON tpa_member_enrollments (user_id)
      WHERE user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tpa_enrollments_corporate
      ON tpa_member_enrollments (corporate_id)
      WHERE corporate_id IS NOT NULL;
  `);

  // A cross-entity reference carries its uid twin from day one (CLAUDE.md rule
  // 5). The trigger derives the uid from the integer, so existing inserts that
  // know only the integer keep working. Guarded: an environment that has not
  // had the entity-uid migration applied still gets the columns above.
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('tpa_members', 'corporate_id', 'corporate_uid', 'corporates');
        PERFORM attach_uid_reference('tpa_member_enrollments', 'corporate_id', 'corporate_uid', 'corporates');
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'unique_id'
        ) THEN
          PERFORM attach_uid_reference('tpa_members', 'user_id', 'user_uid', 'users');
          PERFORM attach_uid_reference('tpa_member_enrollments', 'user_id', 'user_uid', 'users');
        END IF;
      END IF;
    END
    $$;
  `);
}

export async function down(db = pool) {
  await db.query(`
    DROP TRIGGER IF EXISTS trg_uid_ref_corporate_uid ON tpa_members;
    DROP TRIGGER IF EXISTS trg_uid_ref_user_uid ON tpa_members;
    DROP TRIGGER IF EXISTS trg_uid_ref_corporate_uid ON tpa_member_enrollments;
    DROP TRIGGER IF EXISTS trg_uid_ref_user_uid ON tpa_member_enrollments;

    DELETE FROM entity_uid_references
     WHERE table_name IN ('tpa_members', 'tpa_member_enrollments')
       AND int_col IN ('corporate_id', 'user_id');

    DROP INDEX IF EXISTS idx_tpa_members_corporate;
    DROP INDEX IF EXISTS idx_tpa_enrollments_user;
    DROP INDEX IF EXISTS idx_tpa_enrollments_corporate;

    ALTER TABLE tpa_members
      DROP COLUMN IF EXISTS corporate_id,
      DROP COLUMN IF EXISTS corporate_uid,
      DROP COLUMN IF EXISTS user_uid,
      DROP COLUMN IF EXISTS linked_by_user_id,
      DROP COLUMN IF EXISTS linked_at,
      DROP COLUMN IF EXISTS link_method;

    ALTER TABLE tpa_member_enrollments
      DROP COLUMN IF EXISTS user_id,
      DROP COLUMN IF EXISTS user_uid,
      DROP COLUMN IF EXISTS corporate_id,
      DROP COLUMN IF EXISTS corporate_uid;
  `);
}

if ((process.argv[1] || '').includes('20261111000200-tpa-member-corporate-link')) {
  up().then(() => { console.log('tpa member corporate link applied'); process.exit(0); })
      .catch((error) => { console.error(error); process.exit(1); });
}
