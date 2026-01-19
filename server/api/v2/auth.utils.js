/**
import { JWT_CONFIG } from '../config/auth.config.js';
 * Unified Authentication Utilities for API v2
 * JWT token generation and verification helpers
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = JWT_CONFIG.SECRET || 'mediczy-secret-key-change-in-production';

/**
 * Token configuration by role
 */
const TOKEN_CONFIG = {
  doctor: { expiresIn: '7d' },
  assistant: { expiresIn: '8h' },
  admin: { expiresIn: '4h' },
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
  return jwt.sign(
    { userId, role, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '30d' }
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
export const refreshAccessToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    const accessToken = generateToken({
      id: decoded.userId,
      userId: decoded.userId,
    }, decoded.role);

    return { accessToken };
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
  verifyToken,
  refreshAccessToken,
  extractToken,
  authenticate,
  authorize
};
