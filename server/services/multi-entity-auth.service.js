/**
 * Mediqzy PaaS - Multi-Entity Authentication Service
 * 
 * Handles user authentication with support for:
 * - Users belonging to multiple entities
 * - Entity switching
 * - Context-aware token generation
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getPostgresPool } from '../db/postgres.js';
import { AuthEvents } from './event.service.js';
import { permissionService } from './permission.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'mediqzy-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// =============================================================================
// MULTI-ENTITY AUTH SERVICE
// =============================================================================

class MultiEntityAuthService {
  /**
   * Authenticate user and return available entities
   */
  async authenticate(email, password, context = {}) {
    const pool = await getPostgresPool();

    // Find user in platform_users
    const userResult = await pool.query(
      `SELECT * FROM platform_users WHERE email = $1 AND status = 'ACTIVE'`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      AuthEvents.loginFailed(email, 'User not found', context);
      throw new Error('Invalid credentials');
    }

    const user = userResult.rows[0];

    // Verify password
    if (!user.password_hash) {
      AuthEvents.loginFailed(email, 'No password set', context);
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      // Update failed attempts
      await pool.query(`
        UPDATE platform_users 
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE 
              WHEN failed_login_attempts >= 4 THEN NOW() + INTERVAL '15 minutes'
              ELSE locked_until 
            END
        WHERE user_id = $1
      `, [user.user_id]);

      AuthEvents.loginFailed(email, 'Invalid password', context);
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      AuthEvents.loginFailed(email, 'Account locked', context);
      throw new Error('Account temporarily locked. Please try again later.');
    }

    // Reset failed attempts on successful login
    await pool.query(`
      UPDATE platform_users 
      SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $2
      WHERE user_id = $1
    `, [user.user_id, context.ipAddress]);

    // Get user's entity assignments
    const entitiesResult = await pool.query(`
      SELECT 
        uem.*,
        t.tenant_id,
        t.tenant_code,
        t.tenant_name,
        t.tenant_type,
        t.primary_domain,
        t.status as tenant_status,
        e.entity_id,
        e.entity_code,
        e.entity_name,
        e.entity_type,
        r.role_code,
        r.role_name,
        r.scope as role_scope
      FROM platform_user_entity_map uem
      JOIN platform_tenants t ON t.tenant_id = uem.tenant_id
      LEFT JOIN platform_entities e ON e.entity_id = uem.entity_id
      JOIN platform_roles r ON r.role_id = uem.role_id
      WHERE uem.user_id = $1
      AND uem.status = 'ACTIVE'
      AND t.status = 'ACTIVE'
      AND (uem.valid_until IS NULL OR uem.valid_until > NOW())
      ORDER BY uem.is_primary DESC, t.tenant_name
    `, [user.user_id]);

    const entities = entitiesResult.rows;

    // Check if platform admin
    const isPlatformAdmin = user.is_platform_admin;

    // Emit login success
    AuthEvents.loginSuccess(user, context);

    return {
      user: {
        userId: user.user_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: user.display_name || `${user.first_name} ${user.last_name || ''}`.trim(),
        avatarUrl: user.avatar_url,
        phone: user.phone,
        mfaEnabled: user.mfa_enabled,
        isPlatformAdmin,
        platformRole: user.platform_role,
      },
      entities: entities.map(e => ({
        tenantId: e.tenant_id,
        tenantCode: e.tenant_code,
        tenantName: e.tenant_name,
        tenantType: e.tenant_type,
        domain: e.primary_domain,
        entityId: e.entity_id,
        entityCode: e.entity_code,
        entityName: e.entity_name,
        entityType: e.entity_type,
        roleCode: e.role_code,
        roleName: e.role_name,
        roleScope: e.role_scope,
        isPrimary: e.is_primary,
        employeeId: e.employee_id,
        designation: e.designation,
        department: e.department,
      })),
      requiresEntitySelection: entities.length > 1,
    };
  }

  /**
   * Generate tokens for a specific entity context
   */
  async generateEntityToken(userId, tenantId, entityId = null) {
    const pool = await getPostgresPool();

    // Verify user has access to this tenant/entity
    let verifyQuery = `
      SELECT uem.*, r.role_code, r.scope as role_scope
      FROM platform_user_entity_map uem
      JOIN platform_roles r ON r.role_id = uem.role_id
      WHERE uem.user_id = $1 
      AND uem.tenant_id = $2
      AND uem.status = 'ACTIVE'
    `;
    const params = [userId, tenantId];

    if (entityId) {
      verifyQuery += ` AND uem.entity_id = $3`;
      params.push(entityId);
    }

    const verifyResult = await pool.query(verifyQuery, params);
    
    if (verifyResult.rows.length === 0) {
      throw new Error('User does not have access to this tenant/entity');
    }

    const assignment = verifyResult.rows[0];

    // Get user info
    const userResult = await pool.query(
      `SELECT * FROM platform_users WHERE user_id = $1`,
      [userId]
    );
    const user = userResult.rows[0];

    // Get permissions for this context
    const permissions = await permissionService.getUserPermissions(userId, tenantId, entityId);
    const permissionCodes = permissions.map(p => p.code);

    // Generate access token
    const accessToken = jwt.sign(
      {
        userId: user.user_id,
        email: user.email,
        tenantId,
        entityId,
        roleCode: assignment.role_code,
        roleScope: assignment.role_scope,
        permissions: permissionCodes,
        isPlatformAdmin: user.is_platform_admin,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      {
        userId: user.user_id,
        tenantId,
        entityId,
        type: 'refresh',
      },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    // Update last access in user_entity_map
    await pool.query(`
      UPDATE platform_user_entity_map 
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'), 
        '{lastAccessAt}', 
        to_jsonb(NOW()::text)
      )
      WHERE user_id = $1 AND tenant_id = $2 AND entity_id ${entityId ? '= $3' : 'IS NULL'}
    `, entityId ? [userId, tenantId, entityId] : [userId, tenantId]);

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_IN,
      context: {
        tenantId,
        entityId,
        roleCode: assignment.role_code,
        permissions: permissionCodes,
      },
    };
  }

  /**
   * Generate platform admin token (no tenant context)
   */
  async generatePlatformToken(userId) {
    const pool = await getPostgresPool();

    const userResult = await pool.query(
      `SELECT * FROM platform_users WHERE user_id = $1 AND is_platform_admin = true`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User is not a platform admin');
    }

    const user = userResult.rows[0];

    // Get platform permissions
    const permissions = await permissionService.getUserPermissions(userId);
    const permissionCodes = permissions.map(p => p.code);

    const accessToken = jwt.sign(
      {
        userId: user.user_id,
        email: user.email,
        isPlatformAdmin: true,
        platformRole: user.platform_role,
        permissions: permissionCodes,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.user_id,
        type: 'refresh',
        platform: true,
      },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_IN,
      context: {
        isPlatformAdmin: true,
        platformRole: user.platform_role,
        permissions: permissionCodes,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      if (decoded.platform) {
        return this.generatePlatformToken(decoded.userId);
      }

      return this.generateEntityToken(decoded.userId, decoded.tenantId, decoded.entityId);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Switch to a different entity
   */
  async switchEntity(userId, tenantId, entityId) {
    return this.generateEntityToken(userId, tenantId, entityId);
  }

  /**
   * Get available entities for user
   */
  async getUserEntities(userId) {
    const pool = await getPostgresPool();

    const result = await pool.query(`
      SELECT 
        uem.*,
        t.tenant_id,
        t.tenant_code,
        t.tenant_name,
        t.tenant_type,
        t.primary_domain,
        t.logo_url as tenant_logo,
        e.entity_id,
        e.entity_code,
        e.entity_name,
        e.entity_type,
        r.role_code,
        r.role_name
      FROM platform_user_entity_map uem
      JOIN platform_tenants t ON t.tenant_id = uem.tenant_id
      LEFT JOIN platform_entities e ON e.entity_id = uem.entity_id
      JOIN platform_roles r ON r.role_id = uem.role_id
      WHERE uem.user_id = $1
      AND uem.status = 'ACTIVE'
      AND t.status = 'ACTIVE'
      ORDER BY uem.is_primary DESC, t.tenant_name
    `, [userId]);

    return result.rows.map(e => ({
      tenantId: e.tenant_id,
      tenantCode: e.tenant_code,
      tenantName: e.tenant_name,
      tenantType: e.tenant_type,
      domain: e.primary_domain,
      tenantLogo: e.tenant_logo,
      entityId: e.entity_id,
      entityCode: e.entity_code,
      entityName: e.entity_name,
      entityType: e.entity_type,
      roleCode: e.role_code,
      roleName: e.role_name,
      isPrimary: e.is_primary,
    }));
  }

  /**
   * Verify token and return user context
   */
  verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  /**
   * Create user in platform_users
   */
  async createUser(userData) {
    const pool = await getPostgresPool();

    const passwordHash = userData.password 
      ? await bcrypt.hash(userData.password, 10)
      : null;

    const result = await pool.query(`
      INSERT INTO platform_users (
        email, password_hash, first_name, last_name, display_name,
        phone, avatar_url, date_of_birth, gender,
        language, timezone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `, [
      userData.email.toLowerCase(),
      passwordHash,
      userData.firstName,
      userData.lastName,
      userData.displayName || `${userData.firstName} ${userData.lastName || ''}`.trim(),
      userData.phone,
      userData.avatarUrl,
      userData.dateOfBirth,
      userData.gender,
      userData.language || 'en',
      userData.timezone || 'Asia/Kolkata',
      passwordHash ? 'ACTIVE' : 'PENDING', // Pending if no password (needs invite)
    ]);

    const user = result.rows[0];
    delete user.password_hash;

    return user;
  }

  /**
   * Add user to entity with role
   */
  async addUserToEntity(userId, tenantId, entityId, roleCode, metadata = {}) {
    const pool = await getPostgresPool();

    // Get role ID from code
    const roleResult = await pool.query(
      `SELECT role_id FROM platform_roles WHERE role_code = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`,
      [roleCode, tenantId]
    );

    if (roleResult.rows.length === 0) {
      throw new Error(`Role ${roleCode} not found`);
    }

    const roleId = roleResult.rows[0].role_id;

    const result = await pool.query(`
      INSERT INTO platform_user_entity_map (
        user_id, tenant_id, entity_id, role_id,
        employee_id, designation, department, is_primary, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
      ON CONFLICT (user_id, tenant_id, entity_id, role_id) DO UPDATE SET
        status = 'ACTIVE',
        updated_at = NOW()
      RETURNING *;
    `, [
      userId,
      tenantId,
      entityId,
      roleId,
      metadata.employeeId,
      metadata.designation,
      metadata.department,
      metadata.isPrimary || false,
    ]);

    return result.rows[0];
  }

  /**
   * Set password for user
   */
  async setPassword(userId, newPassword) {
    const pool = await getPostgresPool();
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(`
      UPDATE platform_users 
      SET password_hash = $2, status = 'ACTIVE', updated_at = NOW()
      WHERE user_id = $1
    `, [userId, passwordHash]);

    return { success: true };
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const pool = await getPostgresPool();

    const userResult = await pool.query(
      `SELECT password_hash FROM platform_users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    return this.setPassword(userId, newPassword);
  }
}

// =============================================================================
// EXPRESS AUTH MIDDLEWARE
// =============================================================================

/**
 * Authentication middleware for tenant APIs
 */
export function authenticateTenantUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = multiEntityAuthService.verifyToken(token);

    // Validate tenant context matches if tenant header provided
    if (req.tenantContext?.resolved && decoded.tenantId !== req.tenantContext.tenantId) {
      return res.status(403).json({
        success: false,
        error: 'Token tenant does not match request tenant',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication (doesn't fail if no token)
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      req.user = multiEntityAuthService.verifyToken(token);
    }
    next();
  } catch (error) {
    // Continue without user
    next();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const multiEntityAuthService = new MultiEntityAuthService();

export default multiEntityAuthService;
