/**
 * Mediqzy PaaS - Permission Service
 * 
 * Handles permission checks, role management, and access control
 */

import { getPostgresPool } from '../db/postgres.js';

// =============================================================================
// PERMISSION CONSTANTS
// =============================================================================

export const PermissionScope = {
  PLATFORM: 'PLATFORM',
  TENANT: 'TENANT',
  ENTITY: 'ENTITY',
};

export const PermissionAction = {
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  ASSIGN: 'ASSIGN',
  EXPORT: 'EXPORT',
  SEARCH: 'SEARCH',
  CANCEL: 'CANCEL',
  COMPLETE: 'COMPLETE',
  VERIFY: 'VERIFY',
  PUBLISH: 'PUBLISH',
  FULFILL: 'FULFILL',
  SETTLE: 'SETTLE',
  SUSPEND: 'SUSPEND',
  PROVISION: 'PROVISION',
  IMPERSONATE: 'IMPERSONATE',
  REFUND: 'REFUND',
  RECONCILE: 'RECONCILE',
  VOID: 'VOID',
};

export const PermissionResource = {
  // Platform
  TENANT: 'TENANT',
  DOMAIN: 'DOMAIN',
  SUBSCRIPTION: 'SUBSCRIPTION',
  CONFIG: 'CONFIG',
  APIKEY: 'APIKEY',
  AUDIT: 'AUDIT',
  BILLING: 'BILLING',
  
  // Tenant/Entity
  USER: 'USER',
  ROLE: 'ROLE',
  ENTITY: 'ENTITY',
  INTEGRATION: 'INTEGRATION',
  REPORT: 'REPORT',
  
  // Healthcare
  PATIENT: 'PATIENT',
  MEDICAL_RECORD: 'MEDICAL_RECORD',
  VITALS: 'VITALS',
  APPOINTMENT: 'APPOINTMENT',
  SCHEDULE: 'SCHEDULE',
  PRESCRIPTION: 'PRESCRIPTION',
  PHARMACY_ORDER: 'PHARMACY_ORDER',
  INVENTORY: 'INVENTORY',
  LAB_ORDER: 'LAB_ORDER',
  LAB_RESULT: 'LAB_RESULT',
  IMAGING: 'IMAGING',
  
  // Insurance
  CLAIM: 'CLAIM',
  PREAUTH: 'PREAUTH',
  POLICY: 'POLICY',
  PAYMENT: 'PAYMENT',
  
  // Ambulance
  AMBULANCE_TRIP: 'AMBULANCE_TRIP',
  FLEET: 'FLEET',
  
  // Communication
  MESSAGE: 'MESSAGE',
  NOTIFICATION: 'NOTIFICATION',
  BROADCAST: 'BROADCAST',
  DASHBOARD: 'DASHBOARD',
};

// =============================================================================
// PERMISSION SERVICE CLASS
// =============================================================================

class PermissionService {
  constructor() {
    this.permissionCache = new Map();
    this.roleCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Build permission code from parts
   */
  buildPermissionCode(scope, resource, action) {
    return `${scope}.${resource}.${action}`;
  }

  /**
   * Parse permission code into parts
   */
  parsePermissionCode(permissionCode) {
    const parts = permissionCode.split('.');
    return {
      scope: parts[0],
      resource: parts[1],
      action: parts[2],
    };
  }

  /**
   * Get user's permissions for a specific context
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID (optional)
   * @param {string} entityId - Entity ID (optional)
   */
  async getUserPermissions(userId, tenantId = null, entityId = null) {
    const cacheKey = `perms:${userId}:${tenantId || 'all'}:${entityId || 'all'}`;
    
    // Check cache
    const cached = this.permissionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.permissions;
    }

    const pool = await getPostgresPool();
    
    // Get all permissions for the user based on their role assignments
    const query = `
      WITH user_roles AS (
        -- Get platform role if platform admin
        SELECT r.role_id, r.scope, NULL::uuid as tenant_id, NULL::uuid as entity_id
        FROM platform_users u
        JOIN platform_roles r ON r.role_code = u.platform_role
        WHERE u.user_id = $1 AND u.is_platform_admin = true
        
        UNION ALL
        
        -- Get tenant/entity roles
        SELECT uem.role_id, r.scope, uem.tenant_id, uem.entity_id
        FROM platform_user_entity_map uem
        JOIN platform_roles r ON r.role_id = uem.role_id
        WHERE uem.user_id = $1
        AND uem.status = 'ACTIVE'
        AND (uem.valid_until IS NULL OR uem.valid_until > NOW())
        AND ($2::uuid IS NULL OR uem.tenant_id = $2::uuid)
        AND ($3::uuid IS NULL OR uem.entity_id = $3::uuid)
      )
      SELECT DISTINCT
        p.permission_code,
        p.scope,
        p.resource,
        p.action,
        p.module,
        p.is_sensitive,
        p.requires_mfa,
        rp.conditions,
        ur.tenant_id,
        ur.entity_id
      FROM user_roles ur
      JOIN platform_role_permissions rp ON rp.role_id = ur.role_id
      JOIN platform_permissions p ON p.permission_id = rp.permission_id
      ORDER BY p.scope, p.resource, p.action;
    `;

    const result = await pool.query(query, [userId, tenantId, entityId]);
    
    const permissions = result.rows.map(row => ({
      code: row.permission_code,
      scope: row.scope,
      resource: row.resource,
      action: row.action,
      module: row.module,
      isSensitive: row.is_sensitive,
      requiresMfa: row.requires_mfa,
      conditions: row.conditions || {},
      tenantId: row.tenant_id,
      entityId: row.entity_id,
    }));

    // Update cache
    this.permissionCache.set(cacheKey, {
      permissions,
      timestamp: Date.now(),
    });

    return permissions;
  }

  /**
   * Check if user has a specific permission
   * @param {string} userId - User ID
   * @param {string} permissionCode - Permission code (e.g., 'ENTITY.PATIENT.CREATE')
   * @param {Object} context - Context { tenantId, entityId }
   */
  async hasPermission(userId, permissionCode, context = {}) {
    const permissions = await this.getUserPermissions(
      userId,
      context.tenantId,
      context.entityId
    );

    const permission = permissions.find(p => p.code === permissionCode);
    
    if (!permission) {
      return { allowed: false, reason: 'Permission not granted' };
    }

    // Check scope alignment
    const { scope } = this.parsePermissionCode(permissionCode);
    
    if (scope === PermissionScope.TENANT && !context.tenantId) {
      return { allowed: false, reason: 'Tenant context required' };
    }
    
    if (scope === PermissionScope.ENTITY && !context.entityId) {
      return { allowed: false, reason: 'Entity context required' };
    }

    // Check MFA requirement
    if (permission.requiresMfa && !context.mfaVerified) {
      return { allowed: false, reason: 'MFA verification required' };
    }

    // Check conditions
    if (Object.keys(permission.conditions).length > 0) {
      const conditionsMet = await this.evaluateConditions(permission.conditions, context);
      if (!conditionsMet) {
        return { allowed: false, reason: 'Conditions not met' };
      }
    }

    return { allowed: true, permission };
  }

  /**
   * Check multiple permissions (any match)
   */
  async hasAnyPermission(userId, permissionCodes, context = {}) {
    for (const code of permissionCodes) {
      const result = await this.hasPermission(userId, code, context);
      if (result.allowed) {
        return result;
      }
    }
    return { allowed: false, reason: 'None of the required permissions granted' };
  }

  /**
   * Check multiple permissions (all required)
   */
  async hasAllPermissions(userId, permissionCodes, context = {}) {
    const results = [];
    for (const code of permissionCodes) {
      const result = await this.hasPermission(userId, code, context);
      if (!result.allowed) {
        return { allowed: false, reason: `Missing permission: ${code}` };
      }
      results.push(result);
    }
    return { allowed: true, permissions: results };
  }

  /**
   * Evaluate permission conditions
   */
  async evaluateConditions(conditions, context) {
    // Example conditions:
    // { only_own_records: true } - User can only access their own records
    // { department_only: true } - User can only access within department
    // { max_amount: 10000 } - Amount-based restrictions
    
    if (conditions.only_own_records && context.resourceOwnerId !== context.userId) {
      return false;
    }

    if (conditions.department_only && context.resourceDepartment !== context.userDepartment) {
      return false;
    }

    if (conditions.max_amount && context.amount > conditions.max_amount) {
      return false;
    }

    return true;
  }

  /**
   * Get user's roles
   */
  async getUserRoles(userId, tenantId = null, entityId = null) {
    const pool = await getPostgresPool();

    const query = `
      SELECT 
        r.role_id,
        r.role_code,
        r.role_name,
        r.description,
        r.scope,
        uem.tenant_id,
        uem.entity_id,
        uem.is_primary,
        uem.employee_id,
        uem.designation,
        uem.department
      FROM platform_user_entity_map uem
      JOIN platform_roles r ON r.role_id = uem.role_id
      WHERE uem.user_id = $1
      AND uem.status = 'ACTIVE'
      AND ($2::uuid IS NULL OR uem.tenant_id = $2::uuid)
      AND ($3::uuid IS NULL OR uem.entity_id = $3::uuid);
    `;

    const result = await pool.query(query, [userId, tenantId, entityId]);
    return result.rows;
  }

  /**
   * Get role by ID with permissions
   */
  async getRole(roleId) {
    const cacheKey = `role:${roleId}`;
    const cached = this.roleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.role;
    }

    const pool = await getPostgresPool();

    const roleQuery = `
      SELECT * FROM platform_roles WHERE role_id = $1;
    `;
    const roleResult = await pool.query(roleQuery, [roleId]);
    
    if (roleResult.rows.length === 0) {
      return null;
    }

    const permQuery = `
      SELECT p.*
      FROM platform_role_permissions rp
      JOIN platform_permissions p ON p.permission_id = rp.permission_id
      WHERE rp.role_id = $1;
    `;
    const permResult = await pool.query(permQuery, [roleId]);

    const role = {
      ...roleResult.rows[0],
      permissions: permResult.rows,
    };

    this.roleCache.set(cacheKey, { role, timestamp: Date.now() });
    return role;
  }

  /**
   * Create a new role
   */
  async createRole(roleData, tenantId = null) {
    const pool = await getPostgresPool();

    const query = `
      INSERT INTO platform_roles (
        tenant_id, role_code, role_name, description, scope, is_system_role
      ) VALUES ($1, $2, $3, $4, $5, false)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      tenantId,
      roleData.roleCode,
      roleData.roleName,
      roleData.description,
      roleData.scope || PermissionScope.ENTITY,
    ]);

    return result.rows[0];
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissionsToRole(roleId, permissionCodes, grantedBy) {
    const pool = await getPostgresPool();

    // Get permission IDs
    const permQuery = `
      SELECT permission_id FROM platform_permissions 
      WHERE permission_code = ANY($1);
    `;
    const permResult = await pool.query(permQuery, [permissionCodes]);
    const permissionIds = permResult.rows.map(r => r.permission_id);

    // Insert role-permission mappings
    for (const permissionId of permissionIds) {
      await pool.query(`
        INSERT INTO platform_role_permissions (role_id, permission_id, granted_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
      `, [roleId, permissionId, grantedBy]);
    }

    // Clear role cache
    this.roleCache.delete(`role:${roleId}`);

    return true;
  }

  /**
   * Assign role to user for an entity
   */
  async assignRoleToUser(userId, roleId, tenantId, entityId, assignedBy, metadata = {}) {
    const pool = await getPostgresPool();

    const query = `
      INSERT INTO platform_user_entity_map (
        user_id, tenant_id, entity_id, role_id,
        employee_id, designation, department,
        is_primary, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
      ON CONFLICT (user_id, tenant_id, entity_id, role_id)
      DO UPDATE SET
        status = 'ACTIVE',
        employee_id = COALESCE(EXCLUDED.employee_id, platform_user_entity_map.employee_id),
        designation = COALESCE(EXCLUDED.designation, platform_user_entity_map.designation),
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await pool.query(query, [
      userId,
      tenantId,
      entityId,
      roleId,
      metadata.employeeId,
      metadata.designation,
      metadata.department,
      metadata.isPrimary || false,
    ]);

    // Clear permission cache for user
    this.clearUserCache(userId);

    return result.rows[0];
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId, roleId, tenantId, entityId) {
    const pool = await getPostgresPool();

    await pool.query(`
      UPDATE platform_user_entity_map
      SET status = 'INACTIVE', updated_at = NOW()
      WHERE user_id = $1 AND role_id = $2
      AND tenant_id = $3 AND entity_id = $4;
    `, [userId, roleId, tenantId, entityId]);

    this.clearUserCache(userId);
    return true;
  }

  /**
   * Get all permissions in the system
   */
  async getAllPermissions(scope = null, module = null) {
    const pool = await getPostgresPool();

    let query = `SELECT * FROM platform_permissions WHERE 1=1`;
    const params = [];

    if (scope) {
      params.push(scope);
      query += ` AND scope = $${params.length}`;
    }

    if (module) {
      params.push(module);
      query += ` AND module = $${params.length}`;
    }

    query += ` ORDER BY scope, module, resource, action;`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get permissions grouped by module
   */
  async getPermissionsByModule(scope = null) {
    const permissions = await this.getAllPermissions(scope);
    
    const grouped = {};
    for (const perm of permissions) {
      const module = perm.module || 'OTHER';
      if (!grouped[module]) {
        grouped[module] = [];
      }
      grouped[module].push(perm);
    }

    return grouped;
  }

  /**
   * Clear user's permission cache
   */
  clearUserCache(userId) {
    for (const [key] of this.permissionCache) {
      if (key.startsWith(`perms:${userId}:`)) {
        this.permissionCache.delete(key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.permissionCache.clear();
    this.roleCache.clear();
  }
}

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

/**
 * Permission check middleware
 * @param {string|string[]} requiredPermissions - Permission code(s) required
 * @param {Object} options - { requireAll: boolean, extractContext: function }
 */
export function requirePermission(requiredPermissions, options = {}) {
  const permissionArray = Array.isArray(requiredPermissions) 
    ? requiredPermissions 
    : [requiredPermissions];

  return async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Build context from request
      const context = {
        tenantId: req.tenantContext?.tenantId || req.params.tenantId,
        entityId: req.tenantContext?.entityId || req.params.entityId,
        userId,
        mfaVerified: req.user?.mfaVerified,
        userDepartment: req.user?.department,
        ...options.extractContext?.(req),
      };

      // Check permissions
      let result;
      if (options.requireAll) {
        result = await permissionService.hasAllPermissions(userId, permissionArray, context);
      } else {
        result = await permissionService.hasAnyPermission(userId, permissionArray, context);
      }

      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied',
          reason: result.reason,
          requiredPermissions: permissionArray,
        });
      }

      // Attach permission info to request
      req.permission = result.permission || result.permissions;
      next();
    } catch (error) {
      console.error('[Permission] Check failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Permission check failed',
      });
    }
  };
}

/**
 * Scope check middleware (simpler than full permission check)
 */
export function requireScope(scope) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const permissions = await permissionService.getUserPermissions(
        userId,
        req.tenantContext?.tenantId,
        req.tenantContext?.entityId
      );

      const hasScope = permissions.some(p => p.scope === scope);
      if (!hasScope) {
        return res.status(403).json({
          success: false,
          error: `${scope} access required`,
        });
      }

      next();
    } catch (error) {
      console.error('[Scope] Check failed:', error);
      return res.status(500).json({ success: false, error: 'Scope check failed' });
    }
  };
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const permissionService = new PermissionService();

export default permissionService;
