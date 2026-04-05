/**
 * OAuth 2.0 / OIDC Authentication Middleware for Mediqzy API v1
 * Created: February 6, 2026
 * 
 * Handles:
 * - Token exchange (OIDC → Mediqzy tokens)
 * - JWT validation and verification
 * - Tenant identification
 * - Role-based access control
 * - Audit logging
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || process.env.DB_NAME || 'mediczy_ai',
  user: process.env.POSTGRES_USER || process.env.DB_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
});

// JWT secret keys
const JWT_SECRET = process.env.JWT_SECRET || 'mediczy-platform-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mediczy-refresh-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

/**
 * Exchange external OIDC token for Mediqzy access token
 */
class TokenExchangeService {
  /**
   * Validate external OIDC/OAuth token
   */
  static async validateExternalToken(providerToken, provider) {
    // In production, validate against actual OIDC provider
    // For now, decode and verify structure
    try {
      // Different providers have different validation
      switch (provider) {
        case 'azure_ad':
          return await this.validateAzureADToken(providerToken);
        case 'google':
          return await this.validateGoogleToken(providerToken);
        case 'okta':
          return await this.validateOktaToken(providerToken);
        default:
          // Generic JWT validation
          const decoded = jwt.decode(providerToken);
          if (!decoded) {
            throw new Error('Invalid token format');
          }
          return decoded;
      }
    } catch (error) {
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Validate Azure AD token
   */
  static async validateAzureADToken(token) {
    // In production: verify signature with Azure AD public keys
    const decoded = jwt.decode(token);
    
    if (!decoded || !decoded.email) {
      throw new Error('Invalid Azure AD token');
    }
    
    return {
      email: decoded.email,
      name: decoded.name,
      sub: decoded.sub,
      provider: 'azure_ad'
    };
  }

  /**
   * Validate Google token
   */
  static async validateGoogleToken(token) {
    // In production: verify with Google OAuth2 client
    const decoded = jwt.decode(token);
    
    if (!decoded || !decoded.email) {
      throw new Error('Invalid Google token');
    }
    
    return {
      email: decoded.email,
      name: decoded.name,
      sub: decoded.sub,
      provider: 'google'
    };
  }

  /**
   * Validate Okta token
   */
  static async validateOktaToken(token) {
    // In production: verify with Okta JWKS endpoint
    const decoded = jwt.decode(token);
    
    if (!decoded || !decoded.email) {
      throw new Error('Invalid Okta token');
    }
    
    return {
      email: decoded.email,
      name: decoded.name,
      sub: decoded.sub,
      provider: 'okta'
    };
  }

  /**
   * Find or create user from external identity
   */
  static async findOrCreateUser(externalUser, tenantId, role) {
    const client = await pool.connect();
    
    try {
      // Check if user exists
      const existingUser = await client.query(
        `SELECT * FROM api_users 
         WHERE tenant_id = $1 AND external_user_id = $2`,
        [tenantId, externalUser.sub]
      );

      if (existingUser.rows.length > 0) {
        return existingUser.rows[0];
      }

      // Create new user
      const userId = `USR${Date.now()}`;
      const nameParts = (externalUser.name || '').split(' ');
      
      const newUser = await client.query(
        `INSERT INTO api_users 
         (user_id, tenant_id, external_user_id, email, first_name, last_name, status, profile_complete)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userId,
          tenantId,
          externalUser.sub,
          externalUser.email,
          nameParts[0] || '',
          nameParts.slice(1).join(' ') || '',
          'active',
          false
        ]
      );

      return newUser.rows[0];
      
    } finally {
      client.release();
    }
  }

  /**
   * Generate Mediqzy access and refresh tokens
   */
  static generateTokens(user, tenantId, scopes = []) {
    const payload = {
      user_id: user.user_id,
      email: user.email,
      tenant_id: tenantId,
      scopes: scopes,
      role: user.role || 'patient',
      iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      algorithm: 'HS256'
    });

    const refreshToken = jwt.sign(
      { user_id: user.user_id, tenant_id: tenantId },
      JWT_REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN, algorithm: 'HS256' }
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.parseExpiresIn(JWT_EXPIRES_IN),
      scope: scopes.join(' ')
    };
  }

  /**
   * Parse expires_in string to seconds
   */
  static parseExpiresIn(expiresIn) {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // default 1 hour
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
      
      // Fetch user
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM api_users WHERE user_id = $1 AND tenant_id = $2',
          [decoded.user_id, decoded.tenant_id]
        );

        if (result.rows.length === 0) {
          throw new Error('User not found');
        }

        const user = result.rows[0];
        
        // Generate new access token
        const payload = {
          user_id: user.user_id,
          email: user.email,
          tenant_id: decoded.tenant_id,
          scopes: decoded.scopes || [],
          role: user.role || 'patient',
          iat: Math.floor(Date.now() / 1000)
        };

        const accessToken = jwt.sign(payload, JWT_SECRET, {
          expiresIn: JWT_EXPIRES_IN,
          algorithm: 'HS256'
        });

        return {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: this.parseExpiresIn(JWT_EXPIRES_IN)
        };
        
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
}

/**
 * Middleware: Verify JWT token
 */
async function verifyToken(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach to request
    req.user = decoded;
    req.userId = decoded.user_id;
    req.tenantId = decoded.tenant_id;
    req.scopes = decoded.scopes || [];
    req.role = decoded.role || 'patient';

    // Log API access
    try {
      await logAudit({
        tenant_id: decoded.tenant_id,
        user_id: decoded.user_id,
        user_role: decoded.role,
        action: 'api_access',
        resource_type: 'api',
        resource_id: req.path,
        endpoint: req.path,
        http_method: req.method,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });
    } catch (auditErr) {
      console.error('[api-auth] logAudit FAILED:', auditErr.message);
      // Don't fail the request for audit log errors
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired. Please refresh.'
        }
      });
    }
    
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid access token'
      }
    });
  }
}

/**
 * Middleware: Verify tenant access
 */
async function verifyTenant(req, res, next) {
  try {
    // Extract tenant ID from header or path
    const headerTenantId = req.headers['x-tenant-id'];
    const pathTenantId = req.params.tenantId;
    
    const requestedTenantId = pathTenantId || headerTenantId;
    
    if (!requestedTenantId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TENANT_ID',
          message: 'Tenant ID is required in header (X-Tenant-Id) or path'
        }
      });
    }

    // Verify user has access to this tenant
    if (String(req.tenantId) !== String(requestedTenantId)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied to this tenant'
        }
      });
    }

    // Verify tenant exists and is active
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM tenants WHERE id = $1 AND status = $2',
        [requestedTenantId, 'active']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant not found or inactive'
          }
        });
      }

      req.tenant = result.rows[0];
      
      // Set PostgreSQL session variable for RLS (Row-Level Security)
      await client.query(
        'SELECT set_config($1, $2::text, true)',
        ['app.current_tenant', String(requestedTenantId)]
      );
      
      next();
      
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Tenant verification failed'
      }
    });
  }
}

/**
 * Middleware: Check required scopes
 */
function requireScopes(...requiredScopes) {
  return (req, res, next) => {
    const userScopes = req.scopes || [];
    
    // Check if user has all required scopes
    const hasAllScopes = requiredScopes.every(scope => {
      // Support wildcard scopes (e.g., appointments.*)
      return userScopes.some(userScope => {
        if (userScope.endsWith('.*')) {
          const prefix = userScope.substring(0, userScope.length - 2);
          return scope.startsWith(prefix);
        }
        return userScope === scope;
      });
    });

    if (!hasAllScopes) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Required scopes: ${requiredScopes.join(', ')}`
        }
      });
    }

    next();
  };
}

/**
 * Middleware: Check role-based access
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Required role: ${allowedRoles.join(' or ')}`
        }
      });
    }
    next();
  };
}

/**
 * Log audit trail
 */
async function logAudit(auditData) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO api_audit_logs 
       (tenant_id, user_id, user_role, action, resource_type, resource_id, 
        endpoint, http_method, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        auditData.tenant_id,
        auditData.user_id,
        auditData.user_role,
        auditData.action,
        auditData.resource_type,
        auditData.resource_id,
        auditData.endpoint,
        auditData.http_method,
        auditData.ip_address,
        auditData.user_agent
      ]
    );
  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't throw - audit logging failure shouldn't break the request
  } finally {
    client.release();
  }
}

/**
 * Middleware: Rate limiting
 */
const rateLimitStore = new Map();

function rateLimit(maxRequests = 100, windowMs = 60 * 60 * 1000) {
  return (req, res, next) => {
    const key = `${req.tenantId}:${req.userId}`;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const limit = rateLimitStore.get(key);
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }
    
    if (limit.count >= maxRequests) {
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': Math.ceil(limit.resetTime / 1000),
        'Retry-After': Math.ceil((limit.resetTime - now) / 1000)
      });
      
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please retry later.',
          retry_after: Math.ceil((limit.resetTime - now) / 1000)
        }
      });
    }
    
    limit.count++;
    
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': maxRequests - limit.count,
      'X-RateLimit-Reset': Math.ceil(limit.resetTime / 1000)
    });
    
    next();
  };
}

export {
  TokenExchangeService,
  verifyToken,
  verifyTenant,
  requireScopes,
  requireRole,
  rateLimit,
  logAudit
};
