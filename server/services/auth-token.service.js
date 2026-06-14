/**
 * Auth Token Service
 * -----------------
 * Issues short-lived (15 min) access tokens + long-lived (7 day) refresh tokens.
 * Refresh tokens are stored in Redis (not in the JWT itself) so they can be
 * revoked server-side without waiting for expiry.
 *
 * JWT payload is kept minimal — no PHI fields, no permissions array.
 * Permissions are resolved at auth middleware time from Redis/DB cache.
 */

import jwt from 'jsonwebtoken';
import { createClient } from 'redis';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET          = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL    = '15m';
const REFRESH_TOKEN_TTL   = 7 * 24 * 60 * 60;   // 7 days in seconds
const REFRESH_KEY_PREFIX  = 'refresh:';
const MAX_TOKENS_PER_USER = parseInt(process.env.MAX_REFRESH_TOKENS_PER_DEVICE || '5', 10);

// Reuse existing Redis client if available, otherwise create one
let _redis = null;
function getRedis() {
  if (!_redis) {
    const url = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
    _redis = createClient({ url });
    _redis.connect().catch(console.error);
  }
  return _redis;
}

// ─── Access Token ─────────────────────────────────────────────────────────────

/**
 * Issue a minimal, short-lived access token.
 * No PHI fields. No permissions array (resolved at middleware).
 */
export function issueAccessToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  // tokenVersion from metadata — used by auth.middleware to invalidate old tokens on password change
  let tokenVersion = 0;
  try {
    const meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {});
    tokenVersion = meta.tokenVersion || 0;
  } catch { /* ignore parse errors */ }

  const payload = {
    sub:              user.id,
    email:            user.email,
    role:             user.role || 'user',
    org_id:           user.organization_id || user.tenant_id || null,
    org_type:         user.organization_type || null,
    is_admin:         !!user.isAdmin,
    token_type:       'access',
    tokenVersion,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn:  ACCESS_TOKEN_TTL,
    algorithm:  'HS256',
    issuer:     'mediczy',
    audience:   'mediczy-api',
  });
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

/**
 * Issue a refresh token and store it in Redis.
 * Returns the opaque token string (NOT a JWT).
 */
export async function issueRefreshToken(user, deviceFingerprint = 'default') {
  const redis      = getRedis();
  const token      = crypto.randomBytes(40).toString('hex');
  const redisKey   = `${REFRESH_KEY_PREFIX}${token}`;
  const userSetKey = `user_refresh_tokens:${user.id}:${deviceFingerprint}`;

  const payload = {
    userId:      user.id,
    email:       user.email,
    role:        user.role || 'user',
    org_id:      user.organization_id || user.tenant_id || null,
    fingerprint: deviceFingerprint,
    issued_at:   Date.now(),
  };

  // Store token → payload mapping (expires in REFRESH_TOKEN_TTL seconds)
  await redis.set(redisKey, JSON.stringify(payload), { EX: REFRESH_TOKEN_TTL });

  // Track active tokens per user+device — enforce MAX_TOKENS_PER_USER limit
  await redis.lPush(userSetKey, token);
  await redis.lTrim(userSetKey, 0, MAX_TOKENS_PER_USER - 1);
  await redis.expire(userSetKey, REFRESH_TOKEN_TTL);

  return token;
}

/**
 * Validate a refresh token and return its payload.
 * Returns null if invalid or expired.
 */
export async function validateRefreshToken(token) {
  if (!token || typeof token !== 'string') return null;
  const redis = getRedis();
  const raw   = await redis.get(`${REFRESH_KEY_PREFIX}${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Revoke a specific refresh token.
 */
export async function revokeRefreshToken(token) {
  const redis = getRedis();
  await redis.del(`${REFRESH_KEY_PREFIX}${token}`);
}

/**
 * Revoke ALL refresh tokens for a user (logout everywhere).
 */
export async function revokeAllRefreshTokens(userId, deviceFingerprint = null) {
  const redis = getRedis();
  if (deviceFingerprint) {
    const userSetKey = `user_refresh_tokens:${userId}:${deviceFingerprint}`;
    const tokens     = await redis.lRange(userSetKey, 0, -1);
    await Promise.all(tokens.map(t => redis.del(`${REFRESH_KEY_PREFIX}${t}`)));
    await redis.del(userSetKey);
  } else {
    // Revoke all devices — scan for all keys (use sparingly)
    const pattern = `user_refresh_tokens:${userId}:*`;
    const keys    = await redis.keys(pattern);
    for (const k of keys) {
      const tokens = await redis.lRange(k, 0, -1);
      await Promise.all(tokens.map(t => redis.del(`${REFRESH_KEY_PREFIX}${t}`)));
      await redis.del(k);
    }
  }
}

/**
 * Rotate a refresh token — revoke old, issue new access + refresh pair.
 * Returns null if the refresh token is invalid.
 */
export async function rotateTokens(oldRefreshToken, getUserById) {
  const payload = await validateRefreshToken(oldRefreshToken);
  if (!payload) return null;

  const user = await getUserById(payload.userId);
  if (!user || user.status !== 'active') return null;

  // Revoke old token first (prevents replay attacks)
  await revokeRefreshToken(oldRefreshToken);

  const accessToken  = issueAccessToken(user);
  const refreshToken = await issueRefreshToken(user, payload.fingerprint);

  return { accessToken, refreshToken };
}

/**
 * Verify an access token. Returns decoded payload or throws.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer:     'mediczy',
    audience:   'mediczy-api',
  });
}
