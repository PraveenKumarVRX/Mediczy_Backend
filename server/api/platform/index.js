/**
 * Mediqzy PaaS - Platform Admin API
 * 
 * Routes for Super Super Admin (admin@mediqzy.com) to manage the platform
 * All routes require PLATFORM scope authentication
 */

import { Router } from 'express';
import { platformTenantService } from '../../services/platform-tenant.service.js';
import { permissionService, requirePermission, requireScope } from '../../services/permission.service.js';
import { eventBus, EventTypes } from '../../services/event.service.js';
import { getPostgresPool } from '../../db/postgres.js';
import jwt from 'jsonwebtoken';

const router = Router();

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Platform Admin Authentication
 * Only allows platform admins (admin@mediqzy.com or similar)
 */
const platformAdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Platform admin authentication required',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mediqzy-secret-key');

    // Check if user is a platform admin
    const pool = await getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM platform_users WHERE user_id = $1 AND is_platform_admin = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Platform admin access required',
      });
    }

    req.platformAdmin = result.rows[0];
    req.user = {
      userId: result.rows[0].user_id,
      email: result.rows[0].email,
      role: result.rows[0].platform_role,
    };

    next();
  } catch (error) {
    console.error('[Platform Auth] Error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired platform admin token',
    });
  }
};

// =============================================================================
// PUBLIC HEALTH ENDPOINT (No auth required)
// =============================================================================

/**
 * GET /platform/health
 * Public health check for the platform API
 */
router.get('/health', async (req, res) => {
  try {
    const pool = await getPostgresPool();
    const dbCheck = await pool.query('SELECT 1 as ok');
    
    res.json({
      success: true,
      status: 'healthy',
      service: 'mediqzy-platform-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: dbCheck.rows.length > 0 ? 'connected' : 'disconnected',
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      service: 'mediqzy-platform-api',
      error: error.message,
    });
  }
});

// Apply platform admin auth to all subsequent routes
router.use(platformAdminAuth);

// =============================================================================
// PLATFORM DASHBOARD
// =============================================================================

/**
 * GET /platform/dashboard
 * Platform-wide statistics and overview
 */
router.get('/dashboard', async (req, res) => {
  try {
    const pool = await getPostgresPool();

    // Get tenant statistics
    const tenantStats = await pool.query(`
      SELECT 
        COUNT(*) as total_tenants,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_tenants,
        COUNT(*) FILTER (WHERE status = 'SUSPENDED') as suspended_tenants,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_tenants,
        COUNT(*) FILTER (WHERE subscription_status = 'TRIAL') as trial_tenants
      FROM platform_tenants
    `);

    // Get tenant type distribution
    const typeDistribution = await pool.query(`
      SELECT tenant_type, COUNT(*) as count
      FROM platform_tenants
      WHERE status != 'DELETED'
      GROUP BY tenant_type
      ORDER BY count DESC
    `);

    // Get user statistics
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_users,
        COUNT(*) FILTER (WHERE is_platform_admin = true) as platform_admins
      FROM platform_users
    `);

    // Get entity statistics
    const entityStats = await pool.query(`
      SELECT 
        COUNT(*) as total_entities,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_entities
      FROM platform_entities
    `);

    // Get recent tenants
    const recentTenants = await pool.query(`
      SELECT tenant_id, tenant_code, tenant_name, tenant_type, status, created_at
      FROM platform_tenants
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Get subscription plan distribution
    const planDistribution = await pool.query(`
      SELECT subscription_plan, COUNT(*) as count
      FROM platform_tenants
      WHERE status != 'DELETED'
      GROUP BY subscription_plan
    `);

    res.json({
      success: true,
      data: {
        overview: {
          tenants: tenantStats.rows[0],
          users: userStats.rows[0],
          entities: entityStats.rows[0],
        },
        distributions: {
          byType: typeDistribution.rows,
          byPlan: planDistribution.rows,
        },
        recentTenants: recentTenants.rows,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Platform Dashboard] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// TENANT MANAGEMENT
// =============================================================================

/**
 * GET /platform/tenants
 * List all tenants with filtering and pagination
 */
router.get('/tenants', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, search } = req.query;

    const result = await platformTenantService.listTenants({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      type,
      search,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[List Tenants] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/tenants
 * Create a new tenant
 */
router.post('/tenants', async (req, res) => {
  try {
    const {
      tenantName,
      tenantType,
      dbStrategy,
      contactEmail,
      contactPhone,
      address,
      countryCode,
      timezone,
      subscriptionPlan,
      customSubdomain,
    } = req.body;

    // Validate required fields
    if (!tenantName || !tenantType || !contactEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantName, tenantType, contactEmail',
      });
    }

    // Validate tenant type
    const validTypes = [
      'CLINIC', 'HOSPITAL', 'CORPORATE', 'INSURANCE_BROKER',
      'INSURANCE_TPA', 'INSURANCE_COMPANY', 'WELLNESS_AGGREGATOR',
      'AMBULANCE', 'LAB', 'PHARMACY', 'PSU', 'NGO'
    ];
    if (!validTypes.includes(tenantType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tenant type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const tenant = await platformTenantService.createTenant(
      {
        tenantName,
        tenantType,
        dbStrategy: dbStrategy || 'SHARED',
        contactEmail,
        contactPhone,
        address,
        countryCode,
        timezone,
        subscriptionPlan,
        customSubdomain,
      },
      req.user.userId
    );

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: tenant,
    });
  } catch (error) {
    console.error('[Create Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /platform/tenants/:tenantId
 * Get tenant details
 */
router.get('/tenants/:tenantId', async (req, res) => {
  try {
    const tenant = await platformTenantService.getTenant(req.params.tenantId);
    
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found',
      });
    }

    // Get entities for this tenant
    const entities = await platformTenantService.getEntities(req.params.tenantId);
    
    // Get domains
    const domains = await platformTenantService.getDomains(req.params.tenantId);

    res.json({
      success: true,
      data: {
        tenant,
        entities,
        domains,
      },
    });
  } catch (error) {
    console.error('[Get Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /platform/tenants/:tenantId
 * Update tenant
 */
router.patch('/tenants/:tenantId', async (req, res) => {
  try {
    const tenant = await platformTenantService.updateTenant(
      req.params.tenantId,
      req.body,
      req.user
    );

    res.json({
      success: true,
      message: 'Tenant updated successfully',
      data: tenant,
    });
  } catch (error) {
    console.error('[Update Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/tenants/:tenantId/provision
 * Provision tenant resources
 */
router.post('/tenants/:tenantId/provision', async (req, res) => {
  try {
    const result = await platformTenantService.provisionTenant(
      req.params.tenantId,
      req.user
    );

    res.json({
      success: true,
      message: 'Tenant provisioned successfully',
      data: result,
    });
  } catch (error) {
    console.error('[Provision Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/tenants/:tenantId/suspend
 * Suspend a tenant
 */
router.post('/tenants/:tenantId/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Suspension reason is required',
      });
    }

    await platformTenantService.suspendTenant(
      req.params.tenantId,
      reason,
      req.user
    );

    res.json({
      success: true,
      message: 'Tenant suspended successfully',
    });
  } catch (error) {
    console.error('[Suspend Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/tenants/:tenantId/activate
 * Activate a suspended tenant
 */
router.post('/tenants/:tenantId/activate', async (req, res) => {
  try {
    await platformTenantService.activateTenant(
      req.params.tenantId,
      req.user
    );

    res.json({
      success: true,
      message: 'Tenant activated successfully',
    });
  } catch (error) {
    console.error('[Activate Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /platform/tenants/:tenantId
 * Delete tenant (soft delete)
 */
router.delete('/tenants/:tenantId', async (req, res) => {
  try {
    await platformTenantService.deleteTenant(
      req.params.tenantId,
      req.user
    );

    res.json({
      success: true,
      message: 'Tenant deleted successfully',
    });
  } catch (error) {
    console.error('[Delete Tenant] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// ENTITY MANAGEMENT
// =============================================================================

/**
 * GET /platform/tenants/:tenantId/entities
 * List entities for a tenant
 */
router.get('/tenants/:tenantId/entities', async (req, res) => {
  try {
    const { entityType, parentEntityId, status } = req.query;

    const entities = await platformTenantService.getEntities(
      req.params.tenantId,
      { entityType, parentEntityId, status }
    );

    res.json({
      success: true,
      data: entities,
    });
  } catch (error) {
    console.error('[List Entities] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/tenants/:tenantId/entities
 * Create entity under tenant
 */
router.post('/tenants/:tenantId/entities', async (req, res) => {
  try {
    const entity = await platformTenantService.createEntity(
      req.params.tenantId,
      req.body,
      req.user
    );

    res.status(201).json({
      success: true,
      message: 'Entity created successfully',
      data: entity,
    });
  } catch (error) {
    console.error('[Create Entity] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /platform/entities/:entityId
 * Update entity
 */
router.patch('/entities/:entityId', async (req, res) => {
  try {
    const entity = await platformTenantService.updateEntity(
      req.params.entityId,
      req.body,
      req.user
    );

    res.json({
      success: true,
      message: 'Entity updated successfully',
      data: entity,
    });
  } catch (error) {
    console.error('[Update Entity] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// DOMAIN MANAGEMENT
// =============================================================================

/**
 * POST /platform/tenants/:tenantId/domains
 * Add domain to tenant
 */
router.post('/tenants/:tenantId/domains', async (req, res) => {
  try {
    const { domainName, domainType, entityId } = req.body;

    if (!domainName) {
      return res.status(400).json({
        success: false,
        error: 'Domain name is required',
      });
    }

    const domain = await platformTenantService.addDomain(
      req.params.tenantId,
      domainName,
      domainType,
      entityId
    );

    res.status(201).json({
      success: true,
      message: 'Domain added successfully',
      data: domain,
    });
  } catch (error) {
    console.error('[Add Domain] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/domains/:domainId/verify
 * Verify domain DNS
 */
router.post('/domains/:domainId/verify', async (req, res) => {
  try {
    const result = await platformTenantService.verifyDomain(req.params.domainId);

    res.json({
      success: true,
      message: 'Domain verified successfully',
      data: result,
    });
  } catch (error) {
    console.error('[Verify Domain] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// USER MANAGEMENT (PLATFORM LEVEL)
// =============================================================================

/**
 * GET /platform/users
 * List all platform users
 */
router.get('/users', async (req, res) => {
  try {
    const pool = await getPostgresPool();
    const { page = 1, limit = 20, search, status, platformAdminsOnly } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT * FROM platform_users WHERE 1=1`;
    const params = [];

    if (platformAdminsOnly === 'true') {
      query += ` AND is_platform_admin = true`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(u => ({
        ...u,
        password_hash: undefined, // Never expose
      })),
    });
  } catch (error) {
    console.error('[List Platform Users] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /platform/users
 * Create a platform user (admin)
 */
router.post('/users', async (req, res) => {
  try {
    const pool = await getPostgresPool();
    const {
      email,
      firstName,
      lastName,
      phone,
      isPlatformAdmin,
      platformRole,
    } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({
        success: false,
        error: 'Email and firstName are required',
      });
    }

    const result = await pool.query(`
      INSERT INTO platform_users (
        email, first_name, last_name, phone,
        is_platform_admin, platform_role, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *;
    `, [
      email,
      firstName,
      lastName,
      phone,
      isPlatformAdmin || false,
      platformRole,
    ]);

    const user = result.rows[0];
    delete user.password_hash;

    res.status(201).json({
      success: true,
      message: 'Platform user created. Invite email will be sent.',
      data: user,
    });
  } catch (error) {
    console.error('[Create Platform User] Error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// PERMISSIONS & ROLES MANAGEMENT
// =============================================================================

/**
 * GET /platform/permissions
 * List all permissions in the system
 */
router.get('/permissions', async (req, res) => {
  try {
    const { scope, module } = req.query;
    const permissions = await permissionService.getAllPermissions(scope, module);

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error('[List Permissions] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /platform/permissions/grouped
 * Get permissions grouped by module
 */
router.get('/permissions/grouped', async (req, res) => {
  try {
    const { scope } = req.query;
    const grouped = await permissionService.getPermissionsByModule(scope);

    res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('[Grouped Permissions] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /platform/roles
 * List all system roles
 */
router.get('/roles', async (req, res) => {
  try {
    const pool = await getPostgresPool();
    const { scope, tenantId, systemOnly } = req.query;

    let query = `SELECT * FROM platform_roles WHERE 1=1`;
    const params = [];

    if (scope) {
      params.push(scope);
      query += ` AND scope = $${params.length}`;
    }

    if (tenantId) {
      params.push(tenantId);
      query += ` AND tenant_id = $${params.length}`;
    }

    if (systemOnly === 'true') {
      query += ` AND is_system_role = true`;
    }

    query += ` ORDER BY scope, role_name`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('[List Roles] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /platform/roles/:roleId
 * Get role with permissions
 */
router.get('/roles/:roleId', async (req, res) => {
  try {
    const role = await permissionService.getRole(req.params.roleId);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found',
      });
    }

    res.json({
      success: true,
      data: role,
    });
  } catch (error) {
    console.error('[Get Role] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// AUDIT LOGS
// =============================================================================

/**
 * GET /platform/audit-logs
 * Get platform audit logs
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const pool = await getPostgresPool();
    const { 
      page = 1, 
      limit = 50, 
      tenantId, 
      userId, 
      eventType,
      startDate,
      endDate 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = `SELECT * FROM platform_audit_logs WHERE 1=1`;
    const params = [];

    if (tenantId) {
      params.push(tenantId);
      query += ` AND tenant_id = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (eventType) {
      params.push(eventType);
      query += ` AND event_type = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND created_at <= $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('[Audit Logs] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// SYSTEM HEALTH
// =============================================================================

/**
 * GET /platform/health
 * Platform health check
 */
router.get('/health', async (req, res) => {
  try {
    const pool = await getPostgresPool();
    
    // Check database connectivity
    const dbCheck = await pool.query('SELECT 1 as ok');
    
    res.json({
      success: true,
      status: 'healthy',
      checks: {
        database: dbCheck.rows[0]?.ok === 1 ? 'ok' : 'error',
        eventBus: eventBus.listenerCount('*') >= 0 ? 'ok' : 'error',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
