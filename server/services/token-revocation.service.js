/**
 * Centralized token revocation service — all portals.
 *
 * Covers #9  (revocation for doctor / nurse / lab / hospital portals)
 * Covers #12 (per-device refresh-token limit + device fingerprint storage)
 *
 * Strategy
 * ────────
 * • One shared `portal_refresh_tokens` table stores JTI-keyed tokens for every
 *   portal that issues refresh tokens (doctor, nurse, lab, hospital already uses
 *   its own table — this service unifies the interface).
 * • `revokeToken(jti)`      — marks a single token as revoked.
 * • `revokeAllForUser(...)` — revokes every active token for a user+portal combo.
 * • `isTokenRevoked(jti)`   — O(1) lookup used by auth middleware on every request.
 * • `enforceDeviceLimit(...)` — caps active tokens per user+device combination.
 *
 * Portal-specific tables that already exist (hospital_refresh_tokens,
 * team_refresh_tokens) are left untouched; this service adds the missing portals.
 */

import sharedPool from '../db/pgPool.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

// Max active refresh tokens per user per device fingerprint (0 = unlimited)
const MAX_TOKENS_PER_DEVICE = parseInt(process.env.MAX_REFRESH_TOKENS_PER_DEVICE || '5', 10);

// ─── One-time table bootstrap ─────────────────────────────────────────────────
let _tableReady = false;
let _unifiedTableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  try {
    await sharedPool.query(`
      CREATE TABLE IF NOT EXISTS portal_refresh_tokens (
        jti         UUID        PRIMARY KEY,
        user_id     TEXT        NOT NULL,
        portal      TEXT        NOT NULL,
        device_fp   TEXT,
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prt_user_portal ON portal_refresh_tokens (user_id, portal);
      CREATE INDEX IF NOT EXISTS idx_prt_expires     ON portal_refresh_tokens (expires_at);
      CREATE INDEX IF NOT EXISTS idx_prt_jti         ON portal_refresh_tokens (jti);
    `);
    _tableReady = true;
  } catch (err) {
    console.error('[token-revocation] table bootstrap error:', err.message);
  }
}

async function ensureUnifiedTable() {
  if (_unifiedTableReady) return;
  try {
    await sharedPool.query(`
      CREATE TABLE IF NOT EXISTS api_v2_refresh_tokens (
        id             BIGSERIAL   PRIMARY KEY,
        jti            UUID        NOT NULL UNIQUE,
        user_id        INTEGER     NOT NULL,
        role           VARCHAR(50) NOT NULL,
        token_hash     VARCHAR(64) NOT NULL,
        expires_at     TIMESTAMPTZ NOT NULL,
        revoked        BOOLEAN     NOT NULL DEFAULT FALSE,
        revoked_at     TIMESTAMPTZ,
        replaced_by_jti UUID,
        ip_address     TEXT,
        user_agent     TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_user_role ON api_v2_refresh_tokens(user_id, role);
      CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_expires_at ON api_v2_refresh_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_revoked ON api_v2_refresh_tokens(revoked);
    `);
    _unifiedTableReady = true;
  } catch (err) {
    console.error('[token-revocation] unified table bootstrap error:', err.message);
  }
}

// Bootstrap on module load (non-blocking).
// If the pool has no password configured, ensureTable() will fail; we log a
// warning so ops can see the issue rather than silently failing open.
ensureTable().catch((err) => {
  console.error(
    '[token-revocation] WARN: Table bootstrap failed — isTokenRevoked() will ' +
    'fail-open (return false) until DB is available. Cause:', err.message
  );
});

// ─── Issue a token pair for a portal ─────────────────────────────────────────
/**
 * Issues an access + refresh token pair, stores the refresh token JTI in
 * `portal_refresh_tokens`, and enforces the per-device limit.
 *
 * @param {object}  payload      - JWT claims (without jti/exp)
 * @param {object}  opts
 * @param {string}  opts.portal  - Portal identifier ('doctor', 'nurse', 'lab', etc.)
 * @param {string}  [opts.deviceFp] - Device fingerprint header value
 * @param {string}  [opts.accessTtl='15m']
 * @param {string}  [opts.refreshTtl='30d']
 * @returns {{ accessToken, refreshToken, jti }}
 */
export async function issuePortalTokenPair(payload, {
  portal,
  deviceFp = null,
  accessTtl = '15m',
  refreshTtl = '30d',
} = {}) {
  await ensureTable();
  await ensureUnifiedTable();

  const jti = randomUUID();
  const userId = String(payload.id || payload.userId || payload.doctorId || payload.labId || '');

  const accessToken = jwt.sign(
    { ...payload, jti, tokenType: 'access' },
    JWT_CONFIG.SECRET,
    { expiresIn: accessTtl }
  );

  const refreshTtlMs = parseTtlToMs(refreshTtl);
  const expiresAt = new Date(Date.now() + refreshTtlMs);

  const refreshToken = jwt.sign(
    { jti, userId, portal, tokenType: 'refresh' },
    JWT_CONFIG.SECRET,
    { expiresIn: refreshTtl }
  );

  const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

  try {
    await sharedPool.query(
      `INSERT INTO portal_refresh_tokens (jti, user_id, portal, device_fp, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [jti, userId, portal, deviceFp || null, expiresAt]
    );

    // Compatibility migration: also persist in unified table when user id is numeric.
    const numericUserId = Number(userId);
    if (Number.isInteger(numericUserId) && numericUserId > 0) {
      await sharedPool.query(
        `INSERT INTO api_v2_refresh_tokens (jti, user_id, role, token_hash, expires_at, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (jti) DO NOTHING`,
        [jti, numericUserId, portal, refreshTokenHash, expiresAt, deviceFp || null]
      ).catch(() => {});
    }

    // Per-device limit: revoke oldest tokens over the cap for this user+portal+device
    if (MAX_TOKENS_PER_DEVICE > 0) {
      await enforceDeviceLimit(userId, portal, deviceFp);
    }
  } catch (err) {
    console.error('[token-revocation] insert error:', err.message);
    // Non-fatal — token still works, revocation just won't be server-tracked
  }

  return { accessToken, refreshToken, jti };
}

// ─── Revocation helpers ───────────────────────────────────────────────────────

/** Mark a single JTI as revoked. */
export async function revokeToken(jti) {
  await ensureTable();
  await ensureUnifiedTable();
  try {
    await sharedPool.query(
      `UPDATE api_v2_refresh_tokens SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW() WHERE jti = $1`,
      [jti]
    ).catch(() => {});
    await sharedPool.query(
      `UPDATE portal_refresh_tokens SET revoked = TRUE WHERE jti = $1`,
      [jti]
    );
    // Also check hospital and team tables for cross-portal admin revocation
    await sharedPool.query(
      `UPDATE hospital_refresh_tokens SET revoked = TRUE WHERE jti = $1`,
      [jti]
    ).catch(() => {});
    await sharedPool.query(
      `UPDATE team_refresh_tokens SET revoked = TRUE WHERE jti = $1`,
      [jti]
    ).catch(() => {});
  } catch (err) {
    console.error('[token-revocation] revokeToken error:', err.message);
  }
}

/** Revoke all active tokens for a user on a portal (e.g., on password change). */
export async function revokeAllForUser(userId, portal = null) {
  await ensureTable();
  await ensureUnifiedTable();
  try {
    const apiParams = [Number(userId)];
    const apiRoleClause = portal ? ` AND role = $2` : '';
    if (portal) apiParams.push(portal);
    await sharedPool.query(
      `UPDATE api_v2_refresh_tokens SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND revoked = FALSE${apiRoleClause}`,
      apiParams
    ).catch(() => {});

    const params = [String(userId)];
    const portalClause = portal ? ` AND portal = $2` : '';
    if (portal) params.push(portal);
    await sharedPool.query(
      `UPDATE portal_refresh_tokens SET revoked = TRUE
       WHERE user_id = $1 AND revoked = FALSE${portalClause}`,
      params
    );
  } catch (err) {
    console.error('[token-revocation] revokeAllForUser error:', err.message);
  }
}

/**
 * Returns true if the given JTI has been revoked.
 * Checks both the shared table AND portal-specific tables (hospital, team).
 */
export async function isTokenRevoked(jti) {
  if (!jti) return false;
  await ensureTable();
  await ensureUnifiedTable();
  try {
    // Check unified table first (Team/CRM/Hospital/API-v2)
    const apiV2 = await sharedPool.query(
      `SELECT revoked FROM api_v2_refresh_tokens WHERE jti = $1 LIMIT 1`,
      [jti]
    ).catch(() => ({ rows: [] }));
    if (apiV2.rows.length > 0 && apiV2.rows[0].revoked) return true;

    // Check shared table
    const { rows } = await sharedPool.query(
      `SELECT revoked FROM portal_refresh_tokens WHERE jti = $1 LIMIT 1`,
      [jti]
    );
    if (rows.length > 0 && rows[0].revoked) return true;

    // Check hospital-specific table
    const h = await sharedPool.query(
      `SELECT revoked FROM hospital_refresh_tokens WHERE jti = $1 LIMIT 1`,
      [jti]
    ).catch(() => ({ rows: [] }));
    if (h.rows.length > 0 && h.rows[0].revoked) return true;

    // Check team-specific table
    const t = await sharedPool.query(
      `SELECT revoked FROM team_refresh_tokens WHERE jti = $1 LIMIT 1`,
      [jti]
    ).catch(() => ({ rows: [] }));
    if (t.rows.length > 0 && t.rows[0].revoked) return true;

    return false;
  } catch (err) {
    console.error('[token-revocation] isTokenRevoked error:', err.message);
    return false; // Fail open — don't break every request on DB hiccup
  }
}

// ─── Device limit enforcement ─────────────────────────────────────────────────
async function enforceDeviceLimit(userId, portal, deviceFp) {
  if (!deviceFp) return; // No fingerprint — can't enforce per-device limit
  try {
    // Get active token count for this user+portal+device
    const { rows } = await sharedPool.query(
      `SELECT jti FROM portal_refresh_tokens
       WHERE user_id = $1 AND portal = $2 AND device_fp = $3
         AND revoked = FALSE AND expires_at > NOW()
       ORDER BY created_at ASC`,
      [userId, portal, deviceFp]
    );

    if (rows.length > MAX_TOKENS_PER_DEVICE) {
      // Revoke the oldest tokens to bring count back to the limit
      const toRevoke = rows.slice(0, rows.length - MAX_TOKENS_PER_DEVICE).map(r => r.jti);
      if (toRevoke.length) {
        await sharedPool.query(
          `UPDATE portal_refresh_tokens SET revoked = TRUE
           WHERE jti = ANY($1::uuid[])`,
          [toRevoke]
        );
      }
    }
  } catch (err) {
    console.error('[token-revocation] enforceDeviceLimit error:', err.message);
  }
}

// ─── Purge expired tokens (call from a scheduled job) ────────────────────────
export async function purgeExpiredTokens() {
  await ensureTable();
  await ensureUnifiedTable();
  try {
    const { rowCount } = await sharedPool.query(
      `DELETE FROM portal_refresh_tokens WHERE expires_at < NOW()`
    );
    await sharedPool.query(
      `DELETE FROM api_v2_refresh_tokens WHERE expires_at < NOW()`
    ).catch(() => {});
    return rowCount;
  } catch (err) {
    console.error('[token-revocation] purge error:', err.message);
    return 0;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseTtlToMs(ttl) {
  const num = parseInt(ttl, 10);
  if (ttl.endsWith('d')) return num * 86400000;
  if (ttl.endsWith('h')) return num * 3600000;
  if (ttl.endsWith('m')) return num * 60000;
  return num * 1000;
}

export default { issuePortalTokenPair, revokeToken, revokeAllForUser, isTokenRevoked, purgeExpiredTokens };
