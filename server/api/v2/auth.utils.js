/**
 * Unified Authentication Utilities for API v2
 * JWT token generation and verification helpers
 */

import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { getPool } from '../../db/postgres.js';

// CRITICAL: Use only JWT_CONFIG.SECRET - no fallback to avoid signing mismatches
const JWT_SECRET = JWT_CONFIG.SECRET;
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let refreshTableReady = false;

const ensureRefreshTokenTable = async () => {
  if (refreshTableReady) return;

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_v2_refresh_tokens (
      id BIGSERIAL PRIMARY KEY,
      jti UUID NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      role VARCHAR(50) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      revoked_at TIMESTAMPTZ,
      replaced_by_jti UUID,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_user_role ON api_v2_refresh_tokens(user_id, role);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_expires_at ON api_v2_refresh_tokens(expires_at);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_revoked ON api_v2_refresh_tokens(revoked);');

  refreshTableReady = true;
};

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Token configuration by role
 */
const TOKEN_CONFIG = {
  doctor: { expiresIn: process.env.JWT_ACCESS_TTL || '15m' },
  assistant: { expiresIn: '15m' },
  admin: { expiresIn: '15m' },
  patient: { expiresIn: '30d' }
};

/**
 * Generate JWT access token
 */
export const generateToken = (payload, role = 'patient') => {
  const config = TOKEN_CONFIG[role] || TOKEN_CONFIG.patient;

  return jwt.sign(
    {
      ...payload,
      role,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: config.expiresIn }
  );
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (userId, role) => {
  const jti = randomUUID();
  return jwt.sign(
    { userId, role, type: 'refresh', jti },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );
};

export const issueTokenPair = async (payload, role = 'patient', context = {}) => {
  await ensureRefreshTokenTable();

  const pool = getPool();
  const jti = randomUUID();
  const refreshToken = jwt.sign(
    {
      userId: payload.userId || payload.id,
      role,
      type: 'refresh',
      jti,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await pool.query(
    `INSERT INTO api_v2_refresh_tokens (jti, user_id, role, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      jti,
      payload.userId || payload.id,
      role,
      tokenHash,
      expiresAt,
      context.ipAddress || null,
      context.userAgent || null,
    ]
  );

  const accessToken = generateToken(payload, role);
  return { accessToken, refreshToken };
};

export const revokeRefreshToken = async (jti) => {
  if (!jti) return;
  await ensureRefreshTokenTable();

  const pool = getPool();
  await pool.query(
    `UPDATE api_v2_refresh_tokens
     SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
     WHERE jti = $1 AND revoked = FALSE`,
    [jti]
  );
};

export const revokeAllUserRefreshTokens = async (userId, role = null) => {
  if (!userId) return;
  await ensureRefreshTokenTable();

  const pool = getPool();
  if (role) {
    await pool.query(
      `UPDATE api_v2_refresh_tokens
       SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND role = $2 AND revoked = FALSE`,
      [userId, role]
    );
    return;
  }

  await pool.query(
    `UPDATE api_v2_refresh_tokens
     SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND revoked = FALSE`,
    [userId]
  );
};

/**
 * Verify token
 */
export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (refreshToken, context = {}) => {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    if (decoded.type !== 'refresh' || !decoded.jti) {
      throw new Error('Invalid refresh token');
    }

    await ensureRefreshTokenTable();
    const pool = getPool();

    const tokenHash = hashToken(refreshToken);
    const { rows } = await pool.query(
      `SELECT jti, user_id, role, token_hash, revoked, expires_at
       FROM api_v2_refresh_tokens
       WHERE jti = $1
       LIMIT 1`,
      [decoded.jti]
    );

    const row = rows[0];
    if (!row || row.revoked || row.token_hash !== tokenHash || new Date(row.expires_at) <= new Date()) {
      throw new Error('Refresh token revoked or not found');
    }

    // Rotate: revoke old and issue a fresh pair
    await pool.query(
      `UPDATE api_v2_refresh_tokens
       SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
       WHERE jti = $1`,
      [decoded.jti]
    );

    const payload = {
      id: decoded.userId,
      userId: decoded.userId,
    };
    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
      payload,
      row.role || decoded.role || 'patient',
      context
    );

    return { accessToken, refreshToken: newRefreshToken };
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Extract token from request
 */
export const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  if (req.query?.token) {
    return req.query.token;
  }
  return null;
};

/**
 * Authentication middleware factory
 */
export const authenticate = (options = {}) => {
  const { allowedRoles = [], optional = false } = options;

  return async (req, res, next) => {
    try {
      const token = extractToken(req);

      if (!token) {
        if (optional) {
          req.user = null;
          return next();
        }
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' }
          });
        }
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
        });
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      req.user = decoded;
      req.userId = decoded.id || decoded.userId;
      req.userRole = decoded.role;
      req.tenantId = decoded.tenantId || 'default';

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Authorization middleware - check permissions
 */
export const authorize = (requiredPermissions, options = {}) => {
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    const userPermissions = normalizePermissions(req.user.permissions);

    // Check wildcard
    if (userPermissions.includes('*') || userPermissions.includes('all')) {
      return next();
    }

    const hasPermission = options.requireAll
      ? permissions.every(p => userPermissions.includes(p))
      : permissions.some(p => userPermissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Missing permission: ${permissions.join(', ')}` }
      });
    }

    next();
  };
};

/**
 * Normalize permissions from various formats
 */
const normalizePermissions = (permissions) => {
  if (Array.isArray(permissions)) return permissions;

  if (typeof permissions === 'object' && permissions !== null) {
    return Object.entries(permissions)
      .filter(([_, value]) => value === true)
      .map(([key]) => key);
  }

  if (typeof permissions === 'string') {
    try {
      return JSON.parse(permissions);
    } catch {
      return permissions.split(',').map(p => p.trim());
    }
  }

  return [];
};

export default {
  generateToken,
  generateRefreshToken,
  issueTokenPair,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  verifyToken,
  refreshAccessToken,
  extractToken,
  authenticate,
  authorize
};
