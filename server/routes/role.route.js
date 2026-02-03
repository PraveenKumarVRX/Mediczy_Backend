/**
 * Role Management Routes
 * Admin APIs for managing custom roles with module access and CRUD privileges
 * 
 * IMPORTANT: Role assignment and delegation is restricted to:
 * - System Admins (platform-level)
 * - Organization Admins (within their organization only)
 */

import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireOrgAdmin, requireSystemAdmin } from '../middleware/org-admin.middleware.js';
import { 
  Role, 
  RoleModuleAccess, 
  UserRole, 
  getUserRoleModuleAccess,
  initializeSystemRoles 
} from '../models/postgres/role.model.postgres.js';
import { SYSTEM_MODULES } from '../models/postgres/module-access.model.postgres.js';
import { Op } from 'sequelize';

const router = express.Router();

// ==================== HELPER: Check Organization Admin Access ====================

/**
 * Middleware to check if user can manage roles
 * Only system admins or organization admins can assign/manage roles
 */
const canManageRoles = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    const orgAdminRoles = [
      'system_admin', 'hospital_admin', 'clinic_admin', 'lab_admin', 'pharmacy_admin',
      'tpa_admin', 'psu_admin', 'ngo_admin', 'insurer_admin',
      'corporate_admin', 'homecare_admin', 'ambulance_admin', 'org_admin'
    ];
    
    // Check if user has admin privileges
    const isSystemAdmin = req.user.isAdmin && req.user.role === 'system_admin';
    const isOrgAdmin = orgAdminRoles.includes(req.user.role) || req.user.isAdmin;
    
    if (!isSystemAdmin && !isOrgAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Role management requires organization administrator or system administrator access',
        code: 'INSUFFICIENT_PRIVILEGES',
        userRole: req.user.role
      });
    }
    
    // Attach admin context
    req.isSystemAdmin = isSystemAdmin;
    req.isOrgAdmin = isOrgAdmin;
    req.adminOrganizationId = req.user.organization_id || req.user.tenant_id || null;
    
    next();
  } catch (error) {
    console.error('[Auth] Role management check failed:', error);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

/**
 * Middleware to verify user belongs to admin's organization
 * For role assignment - ensures admin can only assign roles to users in their org
 */
const canManageUserInOrg = async (req, res, next) => {
  try {
    const { userId } = req.body;
    
    // System admins can manage any user
    if (req.isSystemAdmin) {
      return next();
    }
    
    // For org admins, verify user belongs to their organization
    if (!req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'Organization administrator must be assigned to an organization',
        code: 'NO_ORG_ASSIGNED'
      });
    }
    
    // Get target user's organization
    const UserPostgres = (await import('../models/postgres/user.model.postgres.js')).default;
    const targetUser = await UserPostgres.findByPk(userId);
    
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const targetOrgId = targetUser.organization_id || targetUser.tenant_id;
    
    // Check if user belongs to admin's organization
    if (targetOrgId !== req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage roles for users within your organization',
        code: 'CROSS_ORG_ACCESS_DENIED',
        yourOrganization: req.adminOrganizationId,
        targetUserOrganization: targetOrgId
      });
    }
    
    req.targetUser = targetUser;
    next();
  } catch (error) {
    console.error('[Auth] User org check failed:', error);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

/**
 * Middleware to verify role can be managed by admin
 * Org admins can only manage non-system roles within their org scope
 */
const canManageRole = async (req, res, next) => {
  try {
    const roleId = req.params.roleId || req.body.roleId;
    
    if (!roleId) {
      return next(); // No role to check
    }
    
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    
    // System admins can manage any role
    if (req.isSystemAdmin) {
      req.targetRole = role;
      return next();
    }
    
    // Org admins cannot modify system roles
    if (role.isSystem && role.category === 'system') {
      return res.status(403).json({
        success: false,
        message: 'System roles can only be managed by system administrators',
        code: 'SYSTEM_ROLE_PROTECTED',
        roleCode: role.roleCode
      });
    }
    
    // Org admins can only manage roles within their organization or global roles
    if (role.organizationId && role.organizationId !== req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'You can only manage roles within your organization',
        code: 'CROSS_ORG_ROLE_DENIED'
      });
    }
    
    req.targetRole = role;
    next();
  } catch (error) {
    console.error('[Auth] Role management check failed:', error);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

// ==================== ROLE CRUD ====================

/**
 * @route GET /api/admin/roles
 * @description Get all roles (with filtering)
 * @access Organization Admin or System Admin only
 */
router.get('/', authUser, canManageRoles, async (req, res) => {
  try {
    const { 
      category, 
      isActive, 
      includeModules = 'false',
      search,
      page = 1,
      limit = 50
    } = req.query;
    
    const where = {};
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where[Op.or] = [
        { roleName: { [Op.iLike]: `%${search}%` } },
        { roleCode: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    // Org admins can only see: system roles OR roles in their organization
    if (!req.isSystemAdmin && req.adminOrganizationId) {
      where[Op.or] = where[Op.or] || [];
      where[Op.and] = [
        {
          [Op.or]: [
            { isSystem: true }, // System roles visible to all admins
            { organizationId: null }, // Global roles
            { organizationId: req.adminOrganizationId } // Their org's roles
          ]
        },
        ...(where[Op.or].length ? [{ [Op.or]: where[Op.or] }] : [])
      ];
      delete where[Op.or]; // Clear the search OR as it's moved into AND
    }
    
    const include = [];
    if (includeModules === 'true') {
      include.push({
        model: RoleModuleAccess,
        as: 'moduleAccess',
        required: false
      });
    }
    
    const { rows: roles, count } = await Role.findAndCountAll({
      where,
      include,
      order: [['priority', 'DESC'], ['roleName', 'ASC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    
    // Get user counts for each role
    const roleCounts = await UserRole.findAll({
      attributes: [
        'roleId',
        [Role.sequelize.fn('COUNT', Role.sequelize.col('user_id')), 'userCount']
      ],
      where: { isActive: true },
      group: ['roleId']
    });
    
    const countMap = {};
    roleCounts.forEach(r => { countMap[r.roleId] = parseInt(r.dataValues.userCount); });
    
    const rolesWithCounts = roles.map(role => ({
      ...role.toJSON(),
      userCount: countMap[role.id] || 0
    }));
    
    res.json({
      success: true,
      data: rolesWithCounts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ success: false, message: 'Error fetching roles', error: error.message });
  }
});

/**
 * @route GET /api/admin/roles/:id
 * @description Get a single role with its module access
 * @access Organization Admin or System Admin only
 */
router.get('/:id', authUser, canManageRoles, async (req, res) => {
  try {
    const { id } = req.params;
    
    const role = await Role.findByPk(id, {
      include: [{
        model: RoleModuleAccess,
        as: 'moduleAccess',
        order: [['displayOrder', 'ASC'], ['category', 'ASC']]
      }]
    });
    
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    
    // Org admins can only view system roles or roles in their organization
    if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view roles within your organization',
        code: 'CROSS_ORG_ROLE_DENIED'
      });
    }
    
    // Get user count for this role
    const userCount = await UserRole.count({
      where: { roleId: id, isActive: true }
    });
    
    res.json({
      success: true,
      data: {
        ...role.toJSON(),
        userCount
      }
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ success: false, message: 'Error fetching role', error: error.message });
  }
});

/**
 * @route POST /api/admin/roles
 * @description Create a new custom role
 * @access Organization Admin or System Admin only
 */
router.post('/',
  authUser,
  canManageRoles,
  [
    body('roleCode').notEmpty().matches(/^[a-z_]+$/).withMessage('Role code must be lowercase with underscores'),
    body('roleName').notEmpty().trim(),
    body('description').optional().trim(),
    body('baseUserType').optional().trim(),
    body('category').optional().trim(),
    body('priority').optional().isInt({ min: 0, max: 99 })
  ],
  async (req, res) => {
    try {
      const {
        roleCode,
        roleName,
        description,
        baseUserType,
        category = 'custom',
        priority = 50,
        metadata = {}
      } = req.body;
      
      // Check if role code already exists
      const existing = await Role.findOne({ where: { roleCode } });
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          message: 'Role code already exists' 
        });
      }
      
      // Org admins can only create roles within their organization
      const organizationId = req.isSystemAdmin ? null : req.adminOrganizationId;
      
      const role = await Role.create({
        roleCode,
        roleName,
        description,
        baseUserType,
        category,
        priority,
        metadata,
        isActive: true,
        isSystem: false,
        organizationId, // Scoped to admin's organization
        createdBy: req.user.id,
        modifiedBy: req.user.id
      });
      
      console.log(`[ROLE_CREATE] Admin ${req.user.id} (${req.user.role}) created role ${role.roleCode}`);
      
      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: role
      });
    } catch (error) {
      console.error('Error creating role:', error);
      res.status(500).json({ success: false, message: 'Error creating role', error: error.message });
    }
  }
);

/**
 * @route PUT /api/admin/roles/:id
 * @description Update a role
 * @access Organization Admin or System Admin only
 */
router.put('/:id',
  authUser,
  canManageRoles,
  [
    param('id').isInt(),
    body('roleName').optional().trim(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('priority').optional().isInt({ min: 0, max: 99 }),
    body('isActive').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const role = await Role.findByPk(id);
      if (!role) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
      
      // Org admins can only update roles within their org
      if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
        return res.status(403).json({
          success: false,
          message: 'You can only modify roles within your organization',
          code: 'CROSS_ORG_ROLE_DENIED'
        });
      }
      
      // Prevent modifying certain fields of system roles
      if (role.isSystem) {
        const protectedFields = ['roleCode', 'isSystem'];
        for (const field of protectedFields) {
          if (req.body[field] !== undefined) {
            delete req.body[field];
          }
        }
        
        // Org admins cannot modify system roles
        if (!req.isSystemAdmin) {
          return res.status(403).json({
            success: false,
            message: 'System roles can only be modified by system administrators',
            code: 'SYSTEM_ROLE_PROTECTED'
          });
        }
      }
      
      const updates = {
        ...req.body,
        modifiedBy: req.user.id
      };
      
      await role.update(updates);
      
      console.log(`[ROLE_UPDATE] Admin ${req.user.id} (${req.user.role}) updated role ${role.roleCode}`);
      
      res.json({
        success: true,
        message: 'Role updated successfully',
        data: role
      });
    } catch (error) {
      console.error('Error updating role:', error);
      res.status(500).json({ success: false, message: 'Error updating role', error: error.message });
    }
  }
);

/**
 * @route DELETE /api/admin/roles/:id
 * @description Delete a role (soft delete)
 * @access Organization Admin or System Admin only
 */
router.delete('/:id', authUser, canManageRoles, async (req, res) => {
  try {
    const { id } = req.params;
    
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    
    if (role.isSystem) {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot delete system roles' 
      });
    }
    
    // Org admins can only delete roles in their organization
    if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete roles within your organization',
        code: 'CROSS_ORG_ROLE_DENIED'
      });
    }
    
    // Check if any users have this role
    const userCount = await UserRole.count({
      where: { roleId: id, isActive: true }
    });
    
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${userCount} users are assigned to this role.`
      });
    }
    
    // Soft delete (paranoid mode)
    await role.destroy();
    
    console.log(`[ROLE_DELETE] Admin ${req.user.id} (${req.user.role}) deleted role ${role.roleCode}`);
    
    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ success: false, message: 'Error deleting role', error: error.message });
  }
});

// ==================== ROLE MODULE ACCESS ====================

/**
 * @route GET /api/admin/roles/:roleId/modules
 * @description Get all module access for a role
 * @access Organization Admin or System Admin only
 */
router.get('/:roleId/modules', authUser, canManageRoles, async (req, res) => {
  try {
    const { roleId } = req.params;
    
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    
    // Org admins can only view modules for roles in their org (or system roles)
    if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view module access for roles in your organization',
        code: 'CROSS_ORG_ROLE_DENIED'
      });
    }
    
    const modules = await RoleModuleAccess.findAll({
      where: { roleId },
      order: [['displayOrder', 'ASC'], ['category', 'ASC']]
    });
    
    // Group by category
    const grouped = {};
    modules.forEach(m => {
      const cat = m.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m);
    });
    
    // Get all available modules
    const availableModules = Object.entries(SYSTEM_MODULES).map(([key, value]) => ({
      id: value,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value
    }));
    
    res.json({
      success: true,
      data: {
        role: {
          id: role.id,
          roleCode: role.roleCode,
          roleName: role.roleName
        },
        modules,
        grouped,
        availableModules,
        total: modules.length
      }
    });
  } catch (error) {
    console.error('Error fetching role modules:', error);
    res.status(500).json({ success: false, message: 'Error fetching role modules', error: error.message });
  }
});

/**
 * @route POST /api/admin/roles/:roleId/modules
 * @description Add module access to a role with CRUD permissions
 * @access Organization Admin or System Admin only
 */
router.post('/:roleId/modules',
  authUser,
  canManageRoles,
  [
    param('roleId').isInt(),
    body('moduleId').notEmpty(),
    body('moduleName').optional().trim(),
    body('category').optional().trim(),
    body('isEnabled').optional().isBoolean(),
    body('canView').optional().isBoolean(),
    body('canCreate').optional().isBoolean(),
    body('canEdit').optional().isBoolean(),
    body('canDelete').optional().isBoolean(),
    body('canExport').optional().isBoolean(),
    body('canImport').optional().isBoolean(),
    body('canApprove').optional().isBoolean(),
    body('canManage').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const { roleId } = req.params;
      const {
        moduleId,
        moduleName,
        category,
        isEnabled = true,
        canView = true,
        canCreate = false,
        canEdit = false,
        canDelete = false,
        canExport = false,
        canImport = false,
        canApprove = false,
        canManage = false,
        additionalPermissions = {},
        accessConditions = {},
        displayOrder = 0,
        icon,
        routePath
      } = req.body;
      
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
      
      // Org admins can only modify modules for roles in their org
      if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
        return res.status(403).json({
          success: false,
          message: 'You can only modify module access for roles in your organization',
          code: 'CROSS_ORG_ROLE_DENIED'
        });
      }
      
      // Org admins cannot modify system roles
      if (!req.isSystemAdmin && role.isSystem) {
        return res.status(403).json({
          success: false,
          message: 'System roles can only be modified by system administrators',
          code: 'SYSTEM_ROLE_PROTECTED'
        });
      }
      
      // Generate module name if not provided
      const finalModuleName = moduleName || moduleId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      const [moduleAccess, created] = await RoleModuleAccess.upsert({
        roleId,
        moduleId,
        moduleName: finalModuleName,
        category,
        isEnabled,
        canView,
        canCreate,
        canEdit,
        canDelete,
        canExport,
        canImport,
        canApprove,
        canManage,
        additionalPermissions,
        accessConditions,
        displayOrder,
        icon,
        routePath,
        modifiedBy: req.user.id
      }, { returning: true });
      
      res.status(created ? 201 : 200).json({
        success: true,
        message: created ? 'Module access added' : 'Module access updated',
        data: moduleAccess
      });
    } catch (error) {
      console.error('Error adding module to role:', error);
      res.status(500).json({ success: false, message: 'Error adding module', error: error.message });
    }
  }
);

/**
 * @route PUT /api/admin/roles/:roleId/modules/bulk
 * @description Bulk update module access for a role
 * @access Organization Admin or System Admin only
 * NOTE: This route MUST be defined BEFORE /:roleId/modules/:moduleId to prevent 'bulk' being treated as moduleId
 */
router.put('/:roleId/modules/bulk',
  authUser,
  canManageRoles,
  [
    param('roleId').isInt(),
    body('modules').isArray()
  ],
  async (req, res) => {
    try {
      const { roleId } = req.params;
      const { modules } = req.body;
      
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
      
      // Org admins can only modify modules for roles in their org
      if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
        return res.status(403).json({
          success: false,
          message: 'You can only modify module access for roles in your organization',
          code: 'CROSS_ORG_ROLE_DENIED'
        });
      }
      
      // Org admins cannot modify system roles
      if (!req.isSystemAdmin && role.isSystem) {
        return res.status(403).json({
          success: false,
          message: 'System roles can only be modified by system administrators',
          code: 'SYSTEM_ROLE_PROTECTED'
        });
      }
      
      const results = [];
      for (const module of modules) {
        const [moduleAccess] = await RoleModuleAccess.upsert({
          roleId,
          moduleId: module.moduleId,
          moduleName: module.moduleName || module.moduleId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category: module.category,
          isEnabled: module.isEnabled ?? true,
          canView: module.canView ?? true,
          canCreate: module.canCreate ?? false,
          canEdit: module.canEdit ?? false,
          canDelete: module.canDelete ?? false,
          canExport: module.canExport ?? false,
          canImport: module.canImport ?? false,
          canApprove: module.canApprove ?? false,
          canManage: module.canManage ?? false,
          additionalPermissions: module.additionalPermissions || {},
          accessConditions: module.accessConditions || {},
          displayOrder: module.displayOrder || 0,
          icon: module.icon,
          routePath: module.routePath,
          modifiedBy: req.user.id
        }, { returning: true });
        results.push(moduleAccess);
      }
      
      res.json({
        success: true,
        message: `Updated ${results.length} modules for role`,
        data: results
      });
    } catch (error) {
      console.error('Error bulk updating modules:', error);
      res.status(500).json({ success: false, message: 'Error bulk updating modules', error: error.message });
    }
  }
);

/**
 * @route PUT /api/admin/roles/:roleId/modules/:moduleId
 * @description Update module access permissions for a single module
 * @access Organization Admin or System Admin only
 */
router.put('/:roleId/modules/:moduleId',
  authUser,
  canManageRoles,
  async (req, res) => {
    try {
      const { roleId, moduleId } = req.params;
      const updates = req.body;
      
      // Verify role access
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
      
      // Org admins can only modify modules for roles in their org
      if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
        return res.status(403).json({
          success: false,
          message: 'You can only modify module access for roles in your organization',
          code: 'CROSS_ORG_ROLE_DENIED'
        });
      }
      
      // Org admins cannot modify system roles
      if (!req.isSystemAdmin && role.isSystem) {
        return res.status(403).json({
          success: false,
          message: 'System roles can only be modified by system administrators',
          code: 'SYSTEM_ROLE_PROTECTED'
        });
      }
      
      const moduleAccess = await RoleModuleAccess.findOne({
        where: { roleId, moduleId }
      });
      
      if (!moduleAccess) {
        return res.status(404).json({ 
          success: false, 
          message: 'Module access not found for this role' 
        });
      }
      
      await moduleAccess.update({
        ...updates,
        modifiedBy: req.user.id
      });
      
      console.log(`[MODULE_UPDATE] Admin ${req.user.id} (${req.user.role}) updated module ${moduleId} for role ${roleId}`);
      
      res.json({
        success: true,
        message: 'Module access updated',
        data: moduleAccess
      });
    } catch (error) {
      console.error('Error updating module access:', error);
      res.status(500).json({ success: false, message: 'Error updating module access', error: error.message });
    }
  }
);

/**
 * @route DELETE /api/admin/roles/:roleId/modules/:moduleId
 * @description Remove module access from a role
 * @access Organization Admin or System Admin only
 */
router.delete('/:roleId/modules/:moduleId', authUser, canManageRoles, async (req, res) => {
  try {
    const { roleId, moduleId } = req.params;
    
    // Verify role access
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    
    // Org admins can only modify modules for roles in their org
    if (!req.isSystemAdmin && role.organizationId && role.organizationId !== req.adminOrganizationId) {
      return res.status(403).json({
        success: false,
        message: 'You can only remove module access for roles in your organization',
        code: 'CROSS_ORG_ROLE_DENIED'
      });
    }
    
    // Org admins cannot modify system roles
    if (!req.isSystemAdmin && role.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'System roles can only be modified by system administrators',
        code: 'SYSTEM_ROLE_PROTECTED'
      });
    }
    
    const deleted = await RoleModuleAccess.destroy({
      where: { roleId, moduleId }
    });
    
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Module access not found' 
      });
    }
    
    console.log(`[MODULE_DELETE] Admin ${req.user.id} (${req.user.role}) removed module ${moduleId} from role ${roleId}`);
    
    res.json({
      success: true,
      message: 'Module access removed from role'
    });
  } catch (error) {
    console.error('Error removing module from role:', error);
    res.status(500).json({ success: false, message: 'Error removing module', error: error.message });
  }
});

// ==================== USER ROLE ASSIGNMENT ====================

/**
 * @route GET /api/admin/roles/:roleId/users
 * @description Get all users assigned to a role
 * @access Organization Admin or System Admin only
 */
router.get('/:roleId/users', authUser, canManageRoles, canManageRole, async (req, res) => {
  try {
    const { roleId } = req.params;
    const { isActive = 'true', page = 1, limit = 50 } = req.query;
    
    const where = { roleId };
    if (isActive !== undefined) where.isActive = isActive === 'true';
    
    // For org admins, filter to their organization's users only
    // This requires joining with users table
    const { rows: assignments, count } = await UserRole.findAndCountAll({
      where,
      include: [{
        model: Role,
        as: 'role',
        attributes: ['id', 'roleCode', 'roleName']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    
    res.json({
      success: true,
      data: assignments,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching role users:', error);
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
  }
});

/**
 * @route POST /api/admin/roles/assign
 * @description Assign a role to a user
 * @access Organization Admin (within their org) or System Admin only
 * 
 * IMPORTANT: Only admins of organizations/entities can assign roles to users.
 * Organization admins can only assign roles to users within their organization.
 */
router.post('/assign',
  authUser,
  canManageRoles,
  [
    body('userId').notEmpty().isInt(),
    body('roleId').notEmpty().isInt(),
    body('expiresAt').optional().isISO8601(),
    body('notes').optional().trim()
  ],
  canManageUserInOrg,
  canManageRole,
  async (req, res) => {
    try {
      const { userId, roleId, expiresAt, notes } = req.body;
      
      const role = req.targetRole || await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({ success: false, message: 'Role not found' });
      }
      
      // Log the assignment for audit
      console.log(`[ROLE_ASSIGN] Admin ${req.user.id} (${req.user.role}) assigning role ${role.roleCode} to user ${userId}`);
      
      const [assignment, created] = await UserRole.upsert({
        userId,
        roleId,
        isActive: true,
        expiresAt: expiresAt || null,
        notes,
        assignedBy: req.user.id
      }, { returning: true });
      
      res.status(created ? 201 : 200).json({
        success: true,
        message: created ? 'Role assigned to user' : 'Role assignment updated',
        data: assignment,
        assignedBy: {
          id: req.user.id,
          role: req.user.role,
          organizationId: req.adminOrganizationId
        }
      });
    } catch (error) {
      console.error('Error assigning role:', error);
      res.status(500).json({ success: false, message: 'Error assigning role', error: error.message });
    }
  }
);

/**
 * @route DELETE /api/admin/roles/unassign
 * @description Remove a role from a user
 * @access Organization Admin (within their org) or System Admin only
 * 
 * IMPORTANT: Only admins of organizations/entities can remove roles from users.
 * Organization admins can only unassign roles from users within their organization.
 */
router.delete('/unassign',
  authUser,
  canManageRoles,
  [
    body('userId').notEmpty().isInt(),
    body('roleId').notEmpty().isInt()
  ],
  canManageUserInOrg,
  async (req, res) => {
    try {
      const { userId, roleId } = req.body;
      
      const assignment = await UserRole.findOne({
        where: { userId, roleId }
      });
      
      if (!assignment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Role assignment not found' 
        });
      }
      
      // Log the unassignment for audit
      console.log(`[ROLE_UNASSIGN] Admin ${req.user.id} (${req.user.role}) removing role ${roleId} from user ${userId}`);
      
      await assignment.destroy();
      
      res.json({
        success: true,
        message: 'Role removed from user',
        removedBy: {
          id: req.user.id,
          role: req.user.role,
          organizationId: req.adminOrganizationId
        }
      });
    } catch (error) {
      console.error('Error unassigning role:', error);
      res.status(500).json({ success: false, message: 'Error unassigning role', error: error.message });
    }
  }
);

/**
 * @route GET /api/admin/users/:userId/roles
 * @description Get all roles for a user
 * @access Organization Admin (within their org) or System Admin only
 */
router.get('/user/:userId/roles', authUser, canManageRoles, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // For org admins, verify user is in their organization
    if (!req.isSystemAdmin && req.adminOrganizationId) {
      const UserPostgres = (await import('../models/postgres/user.model.postgres.js')).default;
      const targetUser = await UserPostgres.findByPk(userId);
      
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      const targetOrgId = targetUser.organization_id || targetUser.tenant_id;
      if (targetOrgId !== req.adminOrganizationId) {
        return res.status(403).json({
          success: false,
          message: 'You can only view roles for users within your organization',
          code: 'CROSS_ORG_ACCESS_DENIED'
        });
      }
    }
    
    const assignments = await UserRole.findAll({
      where: { 
        userId,
        isActive: true,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      include: [{
        model: Role,
        as: 'role',
        where: { isActive: true }
      }],
      order: [[{ model: Role, as: 'role' }, 'priority', 'DESC']]
    });
    
    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    res.status(500).json({ success: false, message: 'Error fetching user roles', error: error.message });
  }
});

// ==================== USER ACCESS CHECK ====================

/**
 * @route GET /api/roles/my-modules
 * @description Get effective modules for current logged-in user based on roles
 * @access Any authenticated user
 */
router.get('/my-modules', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const modules = await getUserRoleModuleAccess(userId);
    
    // Filter to only enabled modules with view access
    const accessibleModules = modules.filter(m => m.isEnabled && m.canView);
    
    res.json({
      success: true,
      data: accessibleModules,
      total: accessibleModules.length
    });
  } catch (error) {
    console.error('Error fetching user modules:', error);
    res.status(500).json({ success: false, message: 'Error fetching modules', error: error.message });
  }
});

/**
 * @route GET /api/roles/check/:moduleId
 * @description Check if current user has access to a specific module
 * @access Any authenticated user
 */
router.get('/check/:moduleId', authUser, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { action = 'view' } = req.query;
    const userId = req.user.id;
    
    const modules = await getUserRoleModuleAccess(userId);
    const module = modules.find(m => m.moduleId === moduleId);
    
    if (!module || !module.isEnabled) {
      return res.json({
        success: true,
        hasAccess: false,
        reason: 'Module not available for your roles'
      });
    }
    
    const accessMap = {
      view: module.canView,
      create: module.canCreate,
      edit: module.canEdit,
      delete: module.canDelete,
      export: module.canExport,
      import: module.canImport,
      approve: module.canApprove,
      manage: module.canManage
    };
    
    res.json({
      success: true,
      hasAccess: accessMap[action] || false,
      permissions: {
        canView: module.canView,
        canCreate: module.canCreate,
        canEdit: module.canEdit,
        canDelete: module.canDelete,
        canExport: module.canExport,
        canImport: module.canImport,
        canApprove: module.canApprove,
        canManage: module.canManage
      },
      roles: module.roles
    });
  } catch (error) {
    console.error('Error checking module access:', error);
    res.status(500).json({ success: false, message: 'Error checking access', error: error.message });
  }
});

// ==================== INITIALIZATION ====================

/**
 * @route POST /api/admin/roles/initialize
 * @description Initialize system default roles
 * @access System Admin only
 */
router.post('/initialize', authUser, canManageRoles, async (req, res) => {
  try {
    // Only system admins can initialize system roles
    if (!req.isSystemAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only system administrators can initialize system roles',
        code: 'SYSTEM_ADMIN_REQUIRED'
      });
    }
    
    await initializeSystemRoles();
    console.log(`[ROLE_INIT] System admin ${req.user.id} initialized system roles`);
    res.json({ success: true, message: 'System roles initialized' });
  } catch (error) {
    console.error('Error initializing roles:', error);
    res.status(500).json({ success: false, message: 'Error initializing roles', error: error.message });
  }
});

/**
 * @route GET /api/admin/roles/categories
 * @description Get all role categories
 * @access Organization Admin or System Admin only
 */
router.get('/meta/categories', authUser, canManageRoles, async (req, res) => {
  try {
    const categories = await Role.findAll({
      attributes: [[Role.sequelize.fn('DISTINCT', Role.sequelize.col('category')), 'category']],
      where: { category: { [Op.ne]: null } }
    });
    
    res.json({
      success: true,
      data: categories.map(c => c.category)
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Error fetching categories', error: error.message });
  }
});

export default router;
