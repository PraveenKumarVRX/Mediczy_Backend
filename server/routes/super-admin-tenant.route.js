/**
 * Super Admin Tenant Management Routes
 * 
 * Super Admin (admin@mediczy.com) exclusive routes for:
 * - Creating organizations (all 12 entity types)
 * - Managing tiers (Free, Professional, Enterprise)
 * - Database provisioning
 * - Subdomain/domain management
 * - Multi-tenancy control
 */

import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { User } from '../models/index.js';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import {
  PLAN_TIERS,
  createTenantDatabase,
  dropTenantDatabase,
  getTenantDatabaseStats,
  provisionTenantInfrastructure,
  getTenantConnection,
  // PM2 Server Management
  getTenantServerStatus,
  startTenantServer,
  stopTenantServer,
  restartTenantServer,
  deleteTenantServer,
  getTenantServerLogs,
  listAllTenantServers
} from '../services/database-provisioning.service.js';
import { onboardTenant, upgradePlan, checkTenantLimit } from '../services/tenant.service.js';
import {
  ALL_TENANT_TYPES,
  CORE_TENANT_TYPES,
  listTenantModulePacks,
  getTenantModulePack,
  buildTenantModuleAttachment,
  buildTenantPortalUrls,
  normalizeTenantType,
} from '../config/tenant-module-packs.js';

const router = express.Router();

// ============================================================================
// MIDDLEWARE: Super Admin Only
// ============================================================================

const superAdminOnly = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Super admin email check
    const superAdminEmails = [
      'admin@mediczy.com',
      'superadmin@mediczy.com',
      process.env.SUPER_ADMIN_EMAIL
    ].filter(Boolean);
    
    // Get user role from either req.user.role or req.userRole
    const userRole = req.user.role || req.userRole || '';
    const userEmail = req.user.email || '';
    
    // Check if user is super admin by email or role
    const isSuperAdmin = superAdminEmails.includes(userEmail) || 
                         userRole === 'super_admin' ||
                         userRole === 'platform_admin' ||
                         userRole === 'admin' ||
                         req.user.isAdmin === true;
    
    if (!isSuperAdmin) {
      return res.status(403).json({ 
        error: 'Access denied. Super Admin privileges required.',
        required: 'admin, super_admin, or platform_admin role',
        currentRole: userRole,
        currentEmail: userEmail
      });
    }
    
    req.isSuperAdmin = true;
    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// Apply super admin middleware to all routes
router.use(authUser, superAdminOnly);

// ============================================================================
// PLAN TIERS INFORMATION
// ============================================================================

/**
 * GET /tiers
 * Get all available plan tiers with features and pricing
 */
router.get('/tiers', async (req, res) => {
  try {
    const tiers = Object.entries(PLAN_TIERS).map(([key, tier]) => ({
      id: key,
      name: tier.name,
      database_isolation: tier.database_isolation,
      dedicated_server: tier.dedicated_server,
      subdomain: tier.subdomain,
      custom_domain: tier.custom_domain,
      features: tier.features,
      limits: tier.limits,
      price: tier.price,
      recommended: key === 'professional'
    }));
    
    res.json({
      success: true,
      tiers,
      comparison: {
        free: 'Shared database, basic features, limited users',
        professional: 'Dedicated database, full features, API access',
        enterprise: 'Dedicated database + server, unlimited, SLA support'
      }
    });
  } catch (error) {
    console.error('Failed to get tiers:', error);
    res.status(500).json({ error: 'Failed to retrieve tier information' });
  }
});

// ============================================================================
// ENTITY TYPE DEFINITIONS
// ============================================================================

/**
 * GET /entity-types
 * Get all supported organization/entity types with attached module packs
 */
router.get('/entity-types', async (req, res) => {
  try {
    const coreOnly = String(req.query.core_only || '') === 'true';
    const packs = listTenantModulePacks({ coreOnly });
    const entityTypes = packs.map((pack) => ({
      type: pack.id,
      name: pack.label,
      description: pack.description,
      icon: pack.icon,
      min_plan: pack.minPlan,
      route_prefix: pack.routePrefix,
      api_prefix: pack.apiPrefix,
      login_path: pack.loginPath,
      access_path: pack.accessPath,
      app_login_path: pack.appLoginPath,
      role_logins: pack.roleLogins || false,
      // Personalised domain pattern — replace {subdomain}
      portal_login_example: pack.loginPath
        ? `https://{subdomain}.mediqzy.com${pack.loginPath}`
        : null,
      portal_access_example: `https://{subdomain}.mediqzy.com${pack.accessPath}`,
      portal_role_login_examples: (pack.modules || [])
        .filter((m) => m.kind === 'role_login')
        .map((m) => ({
          key: m.key,
          label: m.label,
          path: m.path,
          url: `https://{subdomain}.mediqzy.com${m.path}`,
        })),
      modules: pack.modules,
      optional_modules: pack.optionalModules || [],
      module_keys: pack.module_keys,
      module_count: pack.module_count,
      is_core: CORE_TENANT_TYPES.includes(pack.id),
    }));

    res.json({
      success: true,
      entity_types: entityTypes,
      core_types: CORE_TENANT_TYPES,
      total: entityTypes.length,
    });
  } catch (error) {
    console.error('Failed to get entity types:', error);
    res.status(500).json({ error: 'Failed to retrieve entity types' });
  }
});

/**
 * GET /module-packs
 * Module packs registry (pack-centric view of tenant-type modules)
 */
router.get('/module-packs', async (req, res) => {
  try {
    const coreOnly = String(req.query.core_only || '') === 'true';
    const packs = listTenantModulePacks({ coreOnly });
    res.json({ success: true, packs, core_types: CORE_TENANT_TYPES, total: packs.length });
  } catch (error) {
    console.error('Failed to get module packs:', error);
    res.status(500).json({ error: 'Failed to retrieve module packs' });
  }
});

/**
 * GET /module-packs/:type
 */
router.get('/module-packs/:type', async (req, res) => {
  try {
    const pack = getTenantModulePack(req.params.type);
    if (!pack) return res.status(404).json({ error: 'Unknown tenant type' });
    res.json({ success: true, pack });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve module pack' });
  }
});

// ============================================================================
// TENANT LISTING & SEARCH
// ============================================================================

/**
 * GET /tenants
 * List all tenants with filters and pagination
 */
router.get('/tenants', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('type').optional().isString(),
  query('plan').optional().isIn(['free', 'professional', 'enterprise']),
  query('status').optional().isIn(['pending', 'active', 'suspended', 'cancelled']),
  query('search').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      page = 1,
      limit = 20,
      type,
      plan,
      status,
      search
    } = req.query;
    
    // Build where clause
    const where = {};
    if (type) where.type = type;
    if (plan) where.plan = plan;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { subdomain: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    const { count, rows: tenants } = await Tenant.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id', 'uid', 'name', 'slug', 'subdomain', 'custom_domain',
        'type', 'plan', 'status', 'email', 'phone',
        'limits', 'usage', 'features', 'createdAt', 'is_verified'
      ]
    });
    
    // Get database stats for each tenant
    const tenantsWithStats = await Promise.all(
      tenants.map(async (tenant) => {
        const tierInfo = PLAN_TIERS[tenant.plan];
        let dbStats = null;
        
        if (tierInfo?.database_isolation) {
          dbStats = await getTenantDatabaseStats(tenant.id);
        }
        
        return {
          ...tenant.toJSON(),
          tier: {
            name: tierInfo?.name || tenant.plan,
            database_isolation: tierInfo?.database_isolation || false,
            dedicated_server: tierInfo?.dedicated_server || false
          },
          database_stats: dbStats,
          access_url: tenant.custom_domain 
            ? `https://${tenant.custom_domain}`
            : tenant.subdomain 
              ? `https://${tenant.subdomain}.mediqzy.com`
              : null
        };
      })
    );
    
    res.json({
      success: true,
      tenants: tenantsWithStats,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      },
      filters: { type, plan, status, search }
    });
  } catch (error) {
    console.error('Failed to list tenants:', error);
    res.status(500).json({ error: 'Failed to retrieve tenants' });
  }
});

/**
 * GET /tenants/:id
 * Get detailed tenant information
 */
router.get('/tenants/:id', [
  param('id').isInt().toInt()
], async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Get tier info
    const tierInfo = PLAN_TIERS[tenant.plan];
    
    // Get database stats if applicable
    let dbStats = null;
    if (tierInfo?.database_isolation) {
      dbStats = await getTenantDatabaseStats(tenant.id);
    }
    
    // Get admin users
    const adminUsers = await User.findAll({
      where: {
        organization_id: tenant.id,
        role: { [Op.in]: ['admin', 'org_admin'] }
      },
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isVerified', 'createdAt']
    });
    
    // Get child organizations (departments)
    const children = await Tenant.findAll({
      where: { parent_organization_id: tenant.id },
      attributes: ['id', 'name', 'type', 'status', 'subdomain']
    });

    const modulePack = getTenantModulePack(tenant.type);
    const portal = buildTenantPortalUrls({
      type: tenant.type,
      subdomain: tenant.subdomain,
      custom_domain: tenant.custom_domain,
    });
    
    res.json({
      success: true,
      tenant: {
        ...tenant.toJSON(),
        tier: {
          id: tenant.plan,
          name: tierInfo?.name || tenant.plan,
          database_isolation: tierInfo?.database_isolation || false,
          dedicated_server: tierInfo?.dedicated_server || false,
          features_included: tierInfo?.features || {},
          limits_included: tierInfo?.limits || {}
        },
        database_stats: dbStats,
        admin_users: adminUsers,
        children: children,
        module_pack: tenant.metadata?.module_pack || (modulePack ? {
          id: modulePack.id,
          route_prefix: modulePack.routePrefix,
          api_prefix: modulePack.apiPrefix,
          modules: modulePack.modules,
          optional_modules: modulePack.optionalModules || [],
        } : null),
        access_urls: {
          subdomain: portal.origin,
          login: portal.login_url,
          access: portal.access_url,
          app_login: portal.app_login_url,
          custom_domain: tenant.custom_domain ? `https://${tenant.custom_domain}` : null
        }
      }
    });
  } catch (error) {
    console.error('Failed to get tenant:', error);
    res.status(500).json({ error: 'Failed to retrieve tenant details' });
  }
});

// ============================================================================
// TENANT CREATION
// ============================================================================

/**
 * POST /tenants
 * Create a new tenant/organization
 */
router.post('/tenants', [
  body('name').notEmpty().isString().trim(),
  body('type').customSanitizer((v) => normalizeTenantType(v)).isIn(ALL_TENANT_TYPES),
  body('enabled_modules').optional().isArray(),
  body('plan').isIn(['free', 'professional', 'enterprise']),
  body('billing_cycle').optional().isIn(['monthly', 'quarterly', 'annual']),
  body('email').isEmail().normalizeEmail(),
  body('phone').notEmpty().isString(),
  body('subdomain').optional().isString().isLength({ min: 3, max: 63 }),
  body('custom_domain').optional().isString(),
  body('address').optional().isObject(),
  body('admin_email').optional().isEmail(),
  body('admin_password').optional().isLength({ min: 8 }),
  body('admin_first_name').optional().isString(),
  body('admin_last_name').optional().isString(),
  body('parent_organization_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const {
      name,
      type: rawType,
      plan,
      billing_cycle = 'monthly',
      email,
      phone,
      website,
      subdomain,
      custom_domain,
      address,
      registration_number,
      tax_id,
      admin_email,
      admin_password,
      admin_first_name,
      admin_last_name,
      parent_organization_id,
      branding,
      settings,
      enabled_modules,
    } = req.body;

    const type = normalizeTenantType(rawType);
    const modulePack = getTenantModulePack(type);
    if (!modulePack) {
      return res.status(400).json({ error: `Unsupported tenant type: ${rawType}` });
    }
    
    // Validate tier requirements
    const tierInfo = PLAN_TIERS[plan];
    
    // Check if entity type requires minimum plan (pack.minPlan + legacy overrides)
    const entityRequirements = {
      hospital: 'professional',
      ambulance: 'professional',
      corporate: 'professional',
      homecare: 'professional',
      broker: 'professional',
      tpa: 'enterprise',
      psu: 'enterprise',
      insurer: 'enterprise',
      diagnostic_centre: modulePack.minPlan || 'free',
      lab: modulePack.minPlan || 'free',
      clinic: modulePack.minPlan || 'free',
      pharmacy: modulePack.minPlan || 'free',
    };
    
    const minPlan = entityRequirements[type] || modulePack.minPlan;
    if (minPlan) {
      const planRank = { free: 0, professional: 1, enterprise: 2 };
      if (planRank[plan] < planRank[minPlan]) {
        return res.status(400).json({
          error: `${type} requires minimum ${minPlan} plan`,
          required_plan: minPlan
        });
      }
    }
    
    // Generate slug and subdomain
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const finalSubdomain = subdomain || slug.substring(0, 63);
    
    // Check for existing slug/subdomain
    const existing = await Tenant.findOne({
      where: {
        [Op.or]: [
          { slug },
          { subdomain: finalSubdomain },
          { email }
        ]
      }
    });
    
    if (existing) {
      const conflict = existing.slug === slug ? 'slug' :
                       existing.subdomain === finalSubdomain ? 'subdomain' : 'email';
      return res.status(400).json({
        error: `${conflict} already exists`,
        existing_value: conflict === 'slug' ? slug : 
                        conflict === 'subdomain' ? finalSubdomain : email
      });
    }
    
    // Calculate plan dates
    const plan_start_date = new Date();
    let plan_end_date = null;
    if (plan !== 'free') {
      const now = new Date();
      switch (billing_cycle) {
        case 'monthly':
          plan_end_date = new Date(now.setMonth(now.getMonth() + 1));
          break;
        case 'quarterly':
          plan_end_date = new Date(now.setMonth(now.getMonth() + 3));
          break;
        case 'annual':
          plan_end_date = new Date(now.setFullYear(now.getFullYear() + 1));
          break;
      }
    }
    
    // Attach type-prefixed module pack for this tenant (personalised subdomain URLs)
    const moduleAttachment = buildTenantModuleAttachment(type, tierInfo.features || {}, {
      subdomain: finalSubdomain,
      custom_domain: tierInfo.custom_domain ? custom_domain : null,
    });
    if (Array.isArray(enabled_modules) && enabled_modules.length) {
      const allowed = new Set([
        ...(modulePack.modules || []).map((m) => m.key),
        ...(modulePack.optionalModules || []).map((m) => m.key),
      ]);
      const selected = enabled_modules.map(String).filter((k) => allowed.has(k));
      if (selected.length) {
        moduleAttachment.features.modules = selected;
        for (const key of allowed) {
          moduleAttachment.features[`module_${key}`] = selected.includes(key);
        }
        moduleAttachment.metadata.module_pack.modules = [
          ...(modulePack.modules || []),
          ...(modulePack.optionalModules || []),
        ].filter((m) => selected.includes(m.key));
      }
    }

    // Create tenant
    const tenant = await Tenant.create({
      name,
      slug,
      subdomain: finalSubdomain,
      custom_domain: tierInfo.custom_domain ? custom_domain : null,
      type,
      email,
      phone,
      website,
      address: address || {},
      registration_number,
      tax_id,
      plan,
      billing_cycle,
      plan_start_date,
      plan_end_date,
      limits: tierInfo.limits,
      features: moduleAttachment.features,
      branding: branding || {},
      settings: {
        ...(settings || {}),
        ...moduleAttachment.settings,
      },
      status: 'pending',
      parent_organization_id,
      admin_email,
      admin_password: admin_password ? await bcrypt.hash(admin_password, 10) : null,
      metadata: {
        created_by: req.user.email,
        created_at: new Date(),
        creation_method: 'super_admin_dashboard',
        ...moduleAttachment.metadata,
      }
    });
    
    // Provision infrastructure based on tier
    let infrastructure = null;
    try {
      infrastructure = await provisionTenantInfrastructure(tenant);
      
      // Update tenant with database name if dedicated
      if (infrastructure.database?.database_name) {
        await tenant.update({
          database_name: infrastructure.database.database_name
        });
      }
    } catch (provisionError) {
      console.error('Infrastructure provisioning failed:', provisionError);
      // Don't fail the whole operation - mark for manual intervention
      await tenant.update({
        metadata: {
          ...tenant.metadata,
          provisioning_error: provisionError.message,
          requires_manual_setup: true
        }
      });
    }
    
    // Create admin user if credentials provided
    let adminUser = null;
    if (admin_email && admin_password) {
      try {
        adminUser = await User.create({
          firstName: admin_first_name || 'Admin',
          lastName: admin_last_name || name.split(' ')[0],
          email: admin_email,
          password: await bcrypt.hash(admin_password, 10),
          phoneNumber: phone,
          role: 'admin',
          tenant_id: tenant.id,
          organization_id: tenant.id,
          organization_type: type,
          isVerified: false,
          metadata: {
            is_tenant_admin: true,
            created_by_super_admin: true
          }
        });
        
        // Update tenant with owner_id
        await tenant.update({
          owner_id: adminUser.id,
          admin_user_id: adminUser.id
        });
      } catch (userError) {
        console.error('Admin user creation failed:', userError);
      }
    }
    
    // Activate tenant
    await tenant.update({ status: 'active' });

    // For clinics: also provision hospitals login + clinic_admin so subdomain portal works
    let clinicPortal = null;
    if (type === 'clinic') {
      try {
        const { provisionClinicPortal } = await import('../services/clinic-portal.service.js');
        clinicPortal = await provisionClinicPortal({
          tenantId: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          slug: tenant.slug,
          email: admin_email || tenant.email,
          password: admin_password || `Clinic@${tenant.subdomain || tenant.id}`,
          phone: tenant.phone,
          plan: tenant.plan,
          specialty: settings?.specialty || branding?.specialty || 'general',
          code: (tenant.subdomain || tenant.slug || 'CLINIC').toUpperCase(),
          admin_first_name: admin_first_name || 'Clinic',
          admin_last_name: admin_last_name || 'Admin',
        });
      } catch (portalErr) {
        console.error('Clinic portal provisioning failed:', portalErr);
      }
    }
    
    res.status(201).json({
      success: true,
      message: `${type} "${name}" created successfully`,
      tenant: {
        id: tenant.id,
        uid: tenant.uid,
        name: tenant.name,
        slug: tenant.slug,
        type: tenant.type,
        plan: tenant.plan,
        status: tenant.status,
        features: tenant.features,
        settings: tenant.settings,
      },
      module_pack: {
        id: modulePack.id,
        label: modulePack.label,
        route_prefix: modulePack.routePrefix,
        api_prefix: modulePack.apiPrefix,
        login_path: modulePack.loginPath,
        access_path: modulePack.accessPath,
        modules: moduleAttachment.features.modules,
        module_defs: moduleAttachment.metadata.module_pack?.modules || modulePack.modules,
      },
      access: {
        ...(moduleAttachment.portal || buildTenantPortalUrls({
          type,
          subdomain: tenant.subdomain,
          custom_domain: tenant.custom_domain,
        })),
        subdomain_url: `https://${tenant.subdomain}.mediqzy.com`,
        login_url: type === 'clinic' ? `https://${tenant.subdomain}.mediqzy.com/login` : `https://${tenant.subdomain}.mediqzy.com`,
        custom_domain_url: tenant.custom_domain ? `https://${tenant.custom_domain}` : null,
        admin_login: admin_email || tenant.admin_email || clinicPortal?.login?.email
      },
      clinic_portal: clinicPortal,
      infrastructure,
      tier_details: {
        name: tierInfo.name,
        database_isolation: tierInfo.database_isolation,
        dedicated_server: tierInfo.dedicated_server,
        features: tierInfo.features,
        limits: tierInfo.limits
      },
      admin_user: adminUser ? {
        id: adminUser.id,
        email: adminUser.email,
        name: `${adminUser.firstName} ${adminUser.lastName}`
      } : null
    });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    res.status(500).json({ 
      error: 'Failed to create organization',
      details: error.message
    });
  }
});

// ============================================================================
// TENANT UPDATES
// ============================================================================

/**
 * POST /tenants/:id/modules/attach
 * (Re)attach the module pack for the tenant's current type (or a provided type).
 */
router.post('/tenants/:id/modules/attach', [
  param('id').isInt().toInt(),
  body('type').optional().isString(),
  body('enabled_modules').optional().isArray(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const type = normalizeTenantType(req.body.type || tenant.type);
    const modulePack = getTenantModulePack(type);
    if (!modulePack) {
      return res.status(400).json({ error: `Unsupported tenant type: ${type}` });
    }

    const planFeatures = PLAN_TIERS[tenant.plan]?.features || tenant.features || {};
    const moduleAttachment = buildTenantModuleAttachment(type, planFeatures, {
      subdomain: tenant.subdomain,
      custom_domain: tenant.custom_domain,
    });
    const enabled_modules = req.body.enabled_modules;
    if (Array.isArray(enabled_modules) && enabled_modules.length) {
      const allowed = new Set([
        ...(modulePack.modules || []).map((m) => m.key),
        ...(modulePack.optionalModules || []).map((m) => m.key),
      ]);
      const selected = enabled_modules.map(String).filter((k) => allowed.has(k));
      if (selected.length) {
        moduleAttachment.features.modules = selected;
        for (const key of allowed) {
          moduleAttachment.features[`module_${key}`] = selected.includes(key);
        }
        moduleAttachment.metadata.module_pack.modules = [
          ...(modulePack.modules || []),
          ...(modulePack.optionalModules || []),
        ].filter((m) => selected.includes(m.key));
      }
    }

    await tenant.update({
      type,
      features: {
        ...(tenant.features || {}),
        ...moduleAttachment.features,
      },
      settings: {
        ...(tenant.settings || {}),
        ...moduleAttachment.settings,
      },
      metadata: {
        ...(tenant.metadata || {}),
        ...moduleAttachment.metadata,
        modules_attached_by: req.user.email,
        modules_attached_at: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: `Module pack "${modulePack.id}" attached to tenant ${tenant.id}`,
      tenant: {
        id: tenant.id,
        type: tenant.type,
        features: tenant.features,
        settings: tenant.settings,
      },
      module_pack: moduleAttachment.metadata.module_pack,
    });
  } catch (error) {
    console.error('Failed to attach modules:', error);
    res.status(500).json({ error: 'Failed to attach module pack', details: error.message });
  }
});

/**
 * PUT /tenants/:id
 * Update tenant details
 */
router.put('/tenants/:id', [
  param('id').isInt().toInt(),
  body('name').optional().isString().trim(),
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('status').optional().isIn(['pending', 'active', 'suspended', 'cancelled']),
  body('subdomain').optional().isString(),
  body('custom_domain').optional().isString(),
  body('features').optional().isObject(),
  body('limits').optional().isObject(),
  body('branding').optional().isObject(),
  body('settings').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const updateFields = {};
    const allowedFields = [
      'name', 'email', 'phone', 'website', 'address',
      'status', 'subdomain', 'custom_domain',
      'features', 'limits', 'branding', 'settings',
      'registration_number', 'tax_id'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    }
    
    // Track changes
    updateFields.metadata = {
      ...tenant.metadata,
      last_updated_by: req.user.email,
      last_updated_at: new Date()
    };
    
    await tenant.update(updateFields);
    
    res.json({
      success: true,
      message: 'Tenant updated successfully',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        updated_fields: Object.keys(updateFields).filter(f => f !== 'metadata')
      }
    });
  } catch (error) {
    console.error('Failed to update tenant:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

/**
 * POST /tenants/:id/upgrade
 * Upgrade tenant to a higher tier
 */
router.post('/tenants/:id/upgrade', [
  param('id').isInt().toInt(),
  body('plan').isIn(['professional', 'enterprise']),
  body('billing_cycle').optional().isIn(['monthly', 'quarterly', 'annual'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const { plan, billing_cycle = 'monthly' } = req.body;
    const newTier = PLAN_TIERS[plan];
    const oldPlan = tenant.plan;
    
    // Check if upgrade is valid
    const planRank = { free: 0, professional: 1, enterprise: 2 };
    if (planRank[plan] <= planRank[oldPlan]) {
      return res.status(400).json({
        error: 'Can only upgrade to a higher tier',
        current_plan: oldPlan,
        requested_plan: plan
      });
    }
    
    // Calculate new plan dates
    const plan_start_date = new Date();
    let plan_end_date = null;
    const now = new Date();
    switch (billing_cycle) {
      case 'monthly':
        plan_end_date = new Date(now.setMonth(now.getMonth() + 1));
        break;
      case 'quarterly':
        plan_end_date = new Date(now.setMonth(now.getMonth() + 3));
        break;
      case 'annual':
        plan_end_date = new Date(now.setFullYear(now.getFullYear() + 1));
        break;
    }
    
    // Update tenant
    await tenant.update({
      plan,
      billing_cycle,
      plan_start_date,
      plan_end_date,
      limits: newTier.limits,
      features: newTier.features,
      metadata: {
        ...tenant.metadata,
        upgrade_history: [
          ...(tenant.metadata.upgrade_history || []),
          {
            from: oldPlan,
            to: plan,
            date: new Date(),
            by: req.user.email
          }
        ]
      }
    });
    
    // Provision new infrastructure if needed
    let infrastructure = null;
    if (newTier.database_isolation && !PLAN_TIERS[oldPlan].database_isolation) {
      // Need to create dedicated database
      try {
        infrastructure = await provisionTenantInfrastructure(tenant);
        
        if (infrastructure.database?.database_name) {
          await tenant.update({
            database_name: infrastructure.database.database_name
          });
        }
      } catch (provisionError) {
        console.error('Infrastructure provisioning failed:', provisionError);
        // Return success but note the issue
        return res.json({
          success: true,
          message: 'Tenant upgraded (database provisioning pending)',
          tenant: tenant.toJSON(),
          warning: 'Database provisioning failed - will retry',
          error_details: provisionError.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Tenant upgraded from ${oldPlan} to ${plan}`,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        old_plan: oldPlan,
        new_plan: plan,
        billing_cycle,
        plan_end_date
      },
      infrastructure,
      new_features: newTier.features,
      new_limits: newTier.limits
    });
  } catch (error) {
    console.error('Failed to upgrade tenant:', error);
    res.status(500).json({ error: 'Failed to upgrade tenant' });
  }
});

/**
 * POST /tenants/:id/downgrade
 * Downgrade tenant to a lower tier
 */
router.post('/tenants/:id/downgrade', [
  param('id').isInt().toInt(),
  body('plan').isIn(['free', 'professional']),
  body('effective_date').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const { plan, effective_date } = req.body;
    const newTier = PLAN_TIERS[plan];
    const oldPlan = tenant.plan;
    
    // Check if downgrade is valid
    const planRank = { free: 0, professional: 1, enterprise: 2 };
    if (planRank[plan] >= planRank[oldPlan]) {
      return res.status(400).json({
        error: 'Can only downgrade to a lower tier',
        current_plan: oldPlan,
        requested_plan: plan
      });
    }
    
    // Check usage against new limits
    const usageWarnings = [];
    if (newTier.limits.users !== -1 && tenant.usage?.users > newTier.limits.users) {
      usageWarnings.push(`Current users (${tenant.usage.users}) exceeds new limit (${newTier.limits.users})`);
    }
    if (newTier.limits.doctors !== -1 && tenant.usage?.doctors > newTier.limits.doctors) {
      usageWarnings.push(`Current doctors (${tenant.usage.doctors}) exceeds new limit (${newTier.limits.doctors})`);
    }
    
    // Schedule or apply downgrade
    if (effective_date && new Date(effective_date) > new Date()) {
      // Schedule downgrade
      await tenant.update({
        metadata: {
          ...tenant.metadata,
          scheduled_downgrade: {
            to_plan: plan,
            effective_date,
            scheduled_by: req.user.email,
            scheduled_at: new Date()
          }
        }
      });
      
      return res.json({
        success: true,
        message: `Downgrade scheduled for ${effective_date}`,
        tenant: { id: tenant.id, name: tenant.name },
        scheduled_plan: plan,
        effective_date,
        warnings: usageWarnings
      });
    }
    
    // Apply immediate downgrade
    await tenant.update({
      plan,
      limits: newTier.limits,
      features: newTier.features,
      metadata: {
        ...tenant.metadata,
        downgrade_history: [
          ...(tenant.metadata.downgrade_history || []),
          {
            from: oldPlan,
            to: plan,
            date: new Date(),
            by: req.user.email,
            warnings: usageWarnings
          }
        ]
      }
    });
    
    res.json({
      success: true,
      message: `Tenant downgraded from ${oldPlan} to ${plan}`,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        old_plan: oldPlan,
        new_plan: plan
      },
      new_limits: newTier.limits,
      warnings: usageWarnings,
      note: 'Dedicated database will be retained for data access but marked for archival'
    });
  } catch (error) {
    console.error('Failed to downgrade tenant:', error);
    res.status(500).json({ error: 'Failed to downgrade tenant' });
  }
});

// ============================================================================
// TENANT SUSPENSION & DELETION
// ============================================================================

/**
 * POST /tenants/:id/suspend
 * Suspend a tenant
 */
router.post('/tenants/:id/suspend', [
  param('id').isInt().toInt(),
  body('reason').notEmpty().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    await tenant.update({
      status: 'suspended',
      metadata: {
        ...tenant.metadata,
        suspension: {
          reason: req.body.reason,
          suspended_by: req.user.email,
          suspended_at: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Tenant suspended',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: 'suspended',
        reason: req.body.reason
      }
    });
  } catch (error) {
    console.error('Failed to suspend tenant:', error);
    res.status(500).json({ error: 'Failed to suspend tenant' });
  }
});

/**
 * POST /tenants/:id/reactivate
 * Reactivate a suspended tenant
 */
router.post('/tenants/:id/reactivate', [
  param('id').isInt().toInt()
], async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    if (tenant.status !== 'suspended') {
      return res.status(400).json({ 
        error: 'Tenant is not suspended',
        current_status: tenant.status
      });
    }
    
    await tenant.update({
      status: 'active',
      metadata: {
        ...tenant.metadata,
        reactivation: {
          reactivated_by: req.user.email,
          reactivated_at: new Date(),
          previous_suspension: tenant.metadata.suspension
        },
        suspension: null
      }
    });
    
    res.json({
      success: true,
      message: 'Tenant reactivated',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Failed to reactivate tenant:', error);
    res.status(500).json({ error: 'Failed to reactivate tenant' });
  }
});

/**
 * DELETE /tenants/:id
 * Delete a tenant (soft delete or hard delete)
 */
router.delete('/tenants/:id', [
  param('id').isInt().toInt(),
  query('hard').optional().isBoolean().toBoolean()
], async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const hardDelete = req.query.hard === true;
    
    if (hardDelete) {
      // WARNING: This permanently deletes tenant and database
      // Drop dedicated database if exists
      const tierInfo = PLAN_TIERS[tenant.plan];
      if (tierInfo?.database_isolation) {
        try {
          await dropTenantDatabase(tenant.id);
        } catch (dbError) {
          console.error('Failed to drop tenant database:', dbError);
        }
      }
      
      // Delete tenant record
      await tenant.destroy();
      
      res.json({
        success: true,
        message: 'Tenant permanently deleted',
        deleted_id: req.params.id,
        database_dropped: tierInfo?.database_isolation || false
      });
    } else {
      // Soft delete - mark as cancelled
      await tenant.update({
        status: 'cancelled',
        metadata: {
          ...tenant.metadata,
          cancellation: {
            cancelled_by: req.user.email,
            cancelled_at: new Date(),
            data_retention_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
          }
        }
      });
      
      res.json({
        success: true,
        message: 'Tenant marked as cancelled (data retained for 90 days)',
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: 'cancelled'
        },
        note: 'Use ?hard=true to permanently delete'
      });
    }
  } catch (error) {
    console.error('Failed to delete tenant:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// ============================================================================
// DATABASE MANAGEMENT
// ============================================================================

/**
 * GET /tenants/:id/database
 * Get database statistics for a tenant
 */
router.get('/tenants/:id/database', [
  param('id').isInt().toInt()
], async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tierInfo = PLAN_TIERS[tenant.plan];
    
    if (!tierInfo?.database_isolation) {
      return res.json({
        success: true,
        database_type: 'shared',
        message: 'This tenant uses the shared database with tenant_id isolation',
        tenant_id: tenant.id,
        shared_database: process.env.POSTGRES_DATABASE || 'mediczy_ai'
      });
    }
    
    const stats = await getTenantDatabaseStats(tenant.id);
    
    res.json({
      success: true,
      database_type: 'dedicated',
      tenant_id: tenant.id,
      ...stats
    });
  } catch (error) {
    console.error('Failed to get database stats:', error);
    res.status(500).json({ error: 'Failed to retrieve database statistics' });
  }
});

/**
 * POST /tenants/:id/database/provision
 * Manually provision database for a tenant
 */
router.post('/tenants/:id/database/provision', [
  param('id').isInt().toInt()
], async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tierInfo = PLAN_TIERS[tenant.plan];
    
    if (!tierInfo?.database_isolation) {
      return res.status(400).json({
        error: 'This plan does not support dedicated databases',
        plan: tenant.plan,
        suggestion: 'Upgrade to Professional or Enterprise'
      });
    }
    
    // Check if already provisioned
    const existingStats = await getTenantDatabaseStats(tenant.id);
    if (existingStats.exists) {
      return res.json({
        success: true,
        message: 'Database already provisioned',
        database: existingStats
      });
    }
    
    // Provision database
    const result = await createTenantDatabase(tenant);
    
    // Update tenant with database name
    await tenant.update({
      database_name: result.database_name,
      metadata: {
        ...tenant.metadata,
        database_provisioned_at: new Date(),
        database_provisioned_by: req.user.email
      }
    });
    
    res.json({
      success: true,
      message: 'Database provisioned successfully',
      database: result
    });
  } catch (error) {
    console.error('Failed to provision database:', error);
    res.status(500).json({ error: 'Failed to provision database' });
  }
});

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

/**
 * GET /stats
 * Get overall platform statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Tenant statistics
    const tenantStats = await Tenant.findAll({
      attributes: [
        [Tenant.sequelize.fn('COUNT', Tenant.sequelize.col('id')), 'total'],
        'plan',
        'type',
        'status'
      ],
      group: ['plan', 'type', 'status'],
      raw: true
    });
    
    // Aggregate stats
    const totalTenants = await Tenant.count();
    const activeTenants = await Tenant.count({ where: { status: 'active' } });
    
    const byPlan = await Tenant.findAll({
      attributes: [
        'plan',
        [Tenant.sequelize.fn('COUNT', Tenant.sequelize.col('id')), 'count']
      ],
      group: ['plan'],
      raw: true
    });
    
    const byType = await Tenant.findAll({
      attributes: [
        'type',
        [Tenant.sequelize.fn('COUNT', Tenant.sequelize.col('id')), 'count']
      ],
      group: ['type'],
      raw: true
    });
    
    const byStatus = await Tenant.findAll({
      attributes: [
        'status',
        [Tenant.sequelize.fn('COUNT', Tenant.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });
    
    // Recent tenants
    const recentTenants = await Tenant.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'type', 'plan', 'status', 'createdAt']
    });
    
    res.json({
      success: true,
      stats: {
        total_tenants: totalTenants,
        active_tenants: activeTenants,
        by_plan: byPlan.reduce((acc, row) => {
          acc[row.plan] = parseInt(row.count);
          return acc;
        }, {}),
        by_type: byType.reduce((acc, row) => {
          acc[row.type] = parseInt(row.count);
          return acc;
        }, {}),
        by_status: byStatus.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {})
      },
      recent_tenants: recentTenants,
      tier_breakdown: {
        free: {
          count: byPlan.find(p => p.plan === 'free')?.count || 0,
          revenue: 0
        },
        professional: {
          count: byPlan.find(p => p.plan === 'professional')?.count || 0,
          mrr: (parseInt(byPlan.find(p => p.plan === 'professional')?.count || 0)) * PLAN_TIERS.professional.price.monthly
        },
        enterprise: {
          count: byPlan.find(p => p.plan === 'enterprise')?.count || 0,
          mrr: (parseInt(byPlan.find(p => p.plan === 'enterprise')?.count || 0)) * PLAN_TIERS.enterprise.price.monthly
        }
      }
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

// ============================================================================
// PM2 SERVER CONTROL ROUTES (Enterprise Only)
// ============================================================================

/**
 * GET /servers
 * List all running tenant servers
 */
router.get('/servers', async (req, res) => {
  try {
    const result = await listAllTenantServers();
    res.json(result);
  } catch (error) {
    console.error('Failed to list servers:', error);
    res.status(500).json({ error: 'Failed to list servers' });
  }
});

/**
 * GET /tenants/:id/server
 * Get server status for a specific tenant
 */
router.get('/tenants/:id/server', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Only Enterprise tenants have dedicated servers
    if (tenant.plan !== 'enterprise') {
      return res.json({
        success: true,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        plan: tenant.plan,
        dedicated_server: false,
        message: 'Dedicated servers are only available for Enterprise plan'
      });
    }
    
    const status = await getTenantServerStatus(tenant);
    
    res.json({
      success: true,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      plan: tenant.plan,
      dedicated_server: true,
      server: status
    });
  } catch (error) {
    console.error('Failed to get server status:', error.message);
    res.status(500).json({ error: 'Failed to get server status' });
  }
});

/**
 * POST /tenants/:id/server/start
 * Start dedicated server for Enterprise tenant
 */
router.post('/tenants/:id/server/start', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Only Enterprise tenants can have dedicated servers
    if (tenant.plan !== 'enterprise') {
      return res.status(400).json({
        error: 'Dedicated servers are only available for Enterprise plan',
        current_plan: tenant.plan,
        required_plan: 'enterprise'
      });
    }
    
    // Check if database is provisioned
    let useDedicatedDb = false;
    try {
      const dbStats = await getTenantDatabaseStats(tenant.id);
      if (!dbStats.exists) {
        // Try to provision database
        await createTenantDatabase(tenant);
        useDedicatedDb = true;
      } else {
        useDedicatedDb = true;
      }
    } catch (dbError) {
      console.log(`⚠️ Could not provision dedicated database for ${tenant.name}, using shared database with tenant isolation`);
      console.log(`   Reason: ${dbError.message}`);
      // Continue with shared database - tenant isolation via TENANT_ID
      useDedicatedDb = false;
    }
    
    const result = await startTenantServer(tenant, useDedicatedDb);
    
    // Update tenant metadata with server info
    if (result.success) {
      await tenant.update({
        metadata: {
          ...tenant.metadata,
          server: {
            status: 'running',
            port: result.port,
            started_at: new Date(),
            started_by: req.user.email,
            database_mode: useDedicatedDb ? 'dedicated' : 'shared'
          }
        }
      });
    }
    
    res.json({
      success: result.success,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      database_mode: useDedicatedDb ? 'dedicated' : 'shared',
      ...result
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    res.status(500).json({ error: 'Failed to start server', details: error.message });
  }
});

/**
 * POST /tenants/:id/server/stop
 * Stop dedicated server for Enterprise tenant
 */
router.post('/tenants/:id/server/stop', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    if (tenant.plan !== 'enterprise') {
      return res.status(400).json({
        error: 'This tenant does not have a dedicated server',
        current_plan: tenant.plan
      });
    }
    
    const result = await stopTenantServer(tenant);
    
    // Update tenant metadata
    if (result.success) {
      await tenant.update({
        metadata: {
          ...tenant.metadata,
          server: {
            ...tenant.metadata?.server,
            status: 'stopped',
            stopped_at: new Date(),
            stopped_by: req.user.email
          }
        }
      });
    }
    
    res.json({
      success: result.success,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      ...result
    });
  } catch (error) {
    console.error('Failed to stop server:', error);
    res.status(500).json({ error: 'Failed to stop server', details: error.message });
  }
});

/**
 * POST /tenants/:id/server/restart
 * Restart dedicated server for Enterprise tenant (zero downtime)
 */
router.post('/tenants/:id/server/restart', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    if (tenant.plan !== 'enterprise') {
      return res.status(400).json({
        error: 'This tenant does not have a dedicated server',
        current_plan: tenant.plan
      });
    }
    
    const result = await restartTenantServer(tenant);
    
    // Update tenant metadata
    if (result.success) {
      await tenant.update({
        metadata: {
          ...tenant.metadata,
          server: {
            ...tenant.metadata?.server,
            status: 'running',
            restarted_at: new Date(),
            restarted_by: req.user.email
          }
        }
      });
    }
    
    res.json({
      success: result.success,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      ...result
    });
  } catch (error) {
    console.error('Failed to restart server:', error);
    res.status(500).json({ error: 'Failed to restart server', details: error.message });
  }
});

/**
 * DELETE /tenants/:id/server
 * Delete/deprovision dedicated server for tenant
 */
router.delete('/tenants/:id/server', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const result = await deleteTenantServer(tenant);
    
    // Update tenant metadata
    if (result.success) {
      await tenant.update({
        metadata: {
          ...tenant.metadata,
          server: {
            status: 'deleted',
            deleted_at: new Date(),
            deleted_by: req.user.email
          }
        }
      });
    }
    
    res.json({
      success: result.success,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      ...result
    });
  } catch (error) {
    console.error('Failed to delete server:', error);
    res.status(500).json({ error: 'Failed to delete server', details: error.message });
  }
});

/**
 * GET /tenants/:id/server/logs
 * Get logs for tenant's dedicated server
 */
router.get('/tenants/:id/server/logs', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    if (tenant.plan !== 'enterprise') {
      return res.status(400).json({
        error: 'This tenant does not have a dedicated server',
        current_plan: tenant.plan
      });
    }
    
    const lines = parseInt(req.query.lines) || 100;
    const result = await getTenantServerLogs(tenant, lines);
    
    res.json({
      success: result.success,
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      ...result
    });
  } catch (error) {
    console.error('Failed to get server logs:', error);
    res.status(500).json({ error: 'Failed to get server logs', details: error.message });
  }
});

export default router;
