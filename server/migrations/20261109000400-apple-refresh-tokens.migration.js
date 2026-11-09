/**
 * Somewhere to keep Apple's refresh token so account deletion can revoke it.
 *
 * App Store guideline 5.1.1(v) requires that deleting an account also revokes
 * the Sign in with Apple grant. Revocation needs a durable token, and the only
 * moment we can obtain one is during sign-in: the app sends a one-time
 * `authorizationCode` which Apple expires in about five minutes, and it must be
 * traded for a refresh token there and then. Without somewhere to put that
 * token, deletion has nothing to revoke and the guideline cannot be met.
 *
 * Why its own table rather than users.metadata — the obvious place:
 * GET /api/users/profile returns `metadata` to the client. Apple's refresh
 * token is a live bearer credential (it can mint access tokens and revoke the
 * grant), so parking it in a blob that is serialised back out over HTTP would
 * put it into client logs, caches and crash reports. Nothing serialises this
 * table, so the credential has no path to a response body.
 *
 * One row per user: Apple issues one grant per (user, app), and re-signing in
 * replaces it. ON DELETE CASCADE because a purged user has no grant to revoke.
 *
 * Not an entity table — it is a credential side-table keyed by its owner — so
 * it takes no `unique_id` (entity-UID rule 4 does not apply). The user_id
 * reference does get its uid twin per rule 5, when the helper is available.
 */
import pool from '../db/pgPool.js';

export async function up(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_apple_tokens (
      user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      refresh_token  TEXT        NOT NULL,
      obtained_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at     TIMESTAMPTZ,
      revoke_reason  VARCHAR(255),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Rule 5: a new cross-entity reference carries its uid twin from day one.
  // Guarded because the helper only exists where the entity-UID rule is installed.
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('user_apple_tokens', 'user_id', 'user_uid', 'users');
      END IF;
    END $$;
  `);

  // Deletion asks "is there anything left to revoke for this user?", which is
  // the primary key lookup; this one only serves the operational question of
  // how many grants are still outstanding.
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_apple_tokens_live
      ON user_apple_tokens (obtained_at)
      WHERE revoked_at IS NULL;
  `);
}

export async function down(db = pool) {
  await db.query(`DROP TABLE IF EXISTS user_apple_tokens;`);
}

export default { up, down };
