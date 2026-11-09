/**
 * Apple refresh-token store.
 *
 * Deliberately the only module that touches `user_apple_tokens`, and it
 * deliberately exposes no "read it back out" helper beyond the one deletion
 * needs. Apple's refresh token is a live bearer credential, so the fewer places
 * it can reach, the better — it must never end up in a response body (which is
 * why it is not in `users.metadata`: GET /api/users/profile serialises that).
 *
 * Every function swallows its errors. These calls hang off sign-in and account
 * deletion, and neither may fail because this bookkeeping did.
 */
import pool from '../db/pgPool.js';

/**
 * Remember the refresh token obtained during sign-in, replacing any earlier
 * grant for this user (Apple issues one per user+app, and re-authorising
 * supersedes the last one).
 */
export async function rememberAppleRefreshToken(userId, refreshToken) {
  if (!userId || !refreshToken) return false;
  try {
    await pool.query(
      `INSERT INTO user_apple_tokens (user_id, refresh_token, obtained_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
              SET refresh_token = EXCLUDED.refresh_token,
                  obtained_at   = NOW(),
                  updated_at    = NOW(),
                  revoked_at    = NULL,
                  revoke_reason = NULL`,
      [userId, refreshToken]
    );
    return true;
  } catch (error) {
    console.error('[apple-token-store] could not store refresh token:', error.message);
    return false;
  }
}

/** The live (un-revoked) refresh token for this user, or null. */
export async function getAppleRefreshToken(userId) {
  if (!userId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT refresh_token FROM user_apple_tokens
        WHERE user_id = $1 AND revoked_at IS NULL
        LIMIT 1`,
      [userId]
    );
    return rows[0]?.refresh_token || null;
  } catch (error) {
    // A missing table (migration not yet applied) must not break deletion.
    console.error('[apple-token-store] could not read refresh token:', error.message);
    return null;
  }
}

/**
 * Record the outcome of a revocation attempt.
 *
 * On success the token itself is overwritten rather than kept alongside a
 * revoked_at flag: a revoked credential has no further use, and a deleted user's
 * row should not go on holding one. The row stays so the attempt is auditable.
 */
export async function markAppleTokenRevoked(userId, { revoked, reason }) {
  if (!userId) return;
  try {
    await pool.query(
      `UPDATE user_apple_tokens
          SET revoked_at    = NOW(),
              revoke_reason = $2,
              refresh_token = CASE WHEN $3 THEN '' ELSE refresh_token END,
              updated_at    = NOW()
        WHERE user_id = $1`,
      [userId, String(reason || (revoked ? 'revoked' : 'unknown')).slice(0, 255), Boolean(revoked)]
    );
  } catch (error) {
    console.error('[apple-token-store] could not record revocation:', error.message);
  }
}

export default { rememberAppleRefreshToken, getAppleRefreshToken, markAppleTokenRevoked };
