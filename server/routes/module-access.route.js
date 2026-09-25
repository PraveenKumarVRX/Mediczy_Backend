/**
 * Module Access Control Routes
 * Super Admin manages module access for all user types
 */

import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import ModuleAccess, { 
  UserModuleOverride, 
  getEffectiveModuleAccess,
  initializeDefaultModuleAccess,
  SYSTEM_MODULES,
  USER_TYPES 
} from '../models/postgres/module-access.model.postgres.js';
import {
  grantEntitlement,
  hasModuleEntitlement,
  listEntitlements,
  revokeEntitlement,
  seedDefaultFinanceSetup,
} from '../services/entitlement.service.js';

const router = express.Router();

/**
 * @route GET /api/admin/module-access/user-types
 * @description Get all available user types
 * @access Super Admin only
 */
router.get('/user-types', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userTypes = Object.entries(USER_TYPES).map(([key, value]) => ({
      id: value,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value
    }));
    
    res.json({ success: true, data: userTypes });
  } catch (error) {
    console.error('Error fetching user types:', error);
    res.status(500).json({ success: false, message: 'Error fetching user types' });
  }
});

/**
 * @route GET /api/admin/module-access/modules
 * @description Get all available system modules
 * @access Super Admin only
 */
router.get('/modules', authUser, requireRole('admin'), async (req, res) => {
  try {
    const modules = Object.entries(SYSTEM_MODULES).map(([key, value]) => ({
      id: value,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value
    }));
    
    res.json({ success: true, data: modules });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ success: false, message: 'Error fetching modules' });
  }
});

/**
 * @route GET /api/admin/module-access/:userType
 * @description Get module access configuration for a user type
 * @access Super Admin only
 */
router.get('/:userType', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userType } = req.params;
    
    const modules = await ModuleAccess.findAll({
      where: { userType },
      order: [['displayOrder', 'ASC'], ['category', 'ASC']]
    });
    
    // Group by category
    const grouped = {};
    modules.forEach(m => {
      const cat = m.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m);
    });
    
    res.json({ 
      success: true, 
      data: modules,
      grouped,
      total: modules.length
    });
  } catch (error) {
    console.error('Error fetching module access:', error);
    res.status(500).json({ success: false, message: 'Error fetching module access' });
  }
});

/**
 * @route PUT /api/admin/module-access/:userType/:moduleId
 * @description Update module access for a user type
 * @access Super Admin only
 */
router.put('/:userType/:moduleId', 
  authUser, 
  requireRole('admin'),
  [
    param('userType').notEmpty(),
    param('moduleId').notEmpty(),
    body('isEnabled').optional().isBoolean(),
    body('canView').optional().isBoolean(),
    body('canCreate').optional().isBoolean(),
    body('canEdit').optional().isBoolean(),
    body('canDelete').optional().isBoolean(),
    body('canExport').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const { userType, moduleId } = req.params;
      const updates = req.body;
      
      const [module, created] = await ModuleAccess.upsert({
        userType,
        moduleId,
        moduleName: updates.moduleName || moduleId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        ...updates,
        modifiedBy: req.user.id
      }, {
        returning: true
      });
      
      res.json({ 
        success: true, 
        message: created ? 'Module access created' : 'Module access updated',
        data: module 
      });
    } catch (error) {
      console.error('Error updating module access:', error);
      res.status(500).json({ success: false, message: 'Error updating module access' });
    }
  }
);

/**
 * @route PUT /api/admin/module-access/:userType/bulk
 * @description Bulk update module access for a user type
 * @access Super Admin only
 */
router.put('/:userType/bulk', 
  authUser, 
  requireRole('admin'),
  [
    param('userType').notEmpty(),
    body('modules').isArray()
  ],
  async (req, res) => {
    try {
      const { userType } = req.params;
      const { modules } = req.body;
      
      const results = [];
      for (const module of modules) {
        const [updated] = await ModuleAccess.upsert({
          userType,
          moduleId: module.moduleId,
          moduleName: module.moduleName,
          category: module.category,
          isEnabled: module.isEnabled,
          canView: module.canView,
          canCreate: module.canCreate,
          canEdit: module.canEdit,
          canDelete: module.canDelete,
          canExport: module.canExport,
          displayOrder: module.displayOrder,
          icon: module.icon,
          routePath: module.routePath,
          modifiedBy: req.user.id
        }, { returning: true });
        results.push(updated);
      }
      
      res.json({ 
        success: true, 
        message: `Updated ${results.length} modules`,
        data: results 
      });
    } catch (error) {
      console.error('Error bulk updating module access:', error);
      res.status(500).json({ success: false, message: 'Error updating module access' });
    }
  }
);

/**
 * @route POST /api/admin/module-access/user-override
 * @description Create individual user module override
 * @access Super Admin only
 */
router.post('/user-override',
  authUser,
  requireRole('admin'),
  [
    body('userId').notEmpty().isUUID(),
    body('userType').notEmpty(),
    body('moduleId').notEmpty(),
  ],
  async (req, res) => {
    try {
      const { userId, userType, moduleId, ...permissions } = req.body;
      
      const [override, created] = await UserModuleOverride.upsert({
        userId,
        userType,
        moduleId,
        ...permissions,
        grantedBy: req.user.id
      }, { returning: true });
      
      res.json({ 
        success: true, 
        message: created ? 'Override created' : 'Override updated',
        data: override 
      });
    } catch (error) {
      console.error('Error creating user override:', error);
      res.status(500).json({ success: false, message: 'Error creating override' });
    }
  }
);

/**
 * @route GET /api/admin/module-access/user-override/:userId
 * @description Get all overrides for a specific user
 * @access Super Admin only
 */
router.get('/user-override/:userId', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const overrides = await UserModuleOverride.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({ success: true, data: overrides });
  } catch (error) {
    console.error('Error fetching user overrides:', error);
    res.status(500).json({ success: false, message: 'Error fetching overrides' });
  }
});

/**
 * @route DELETE /api/admin/module-access/user-override/:overrideId
 * @description Delete a user override
 * @access Super Admin only
 */
router.delete('/user-override/:overrideId', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { overrideId } = req.params;
    
    await UserModuleOverride.destroy({ where: { id: overrideId } });
    
    res.json({ success: true, message: 'Override deleted' });
  } catch (error) {
    console.error('Error deleting override:', error);
    res.status(500).json({ success: false, message: 'Error deleting override' });
  }
});

/**
 * @route POST /api/admin/module-access/initialize
 * @description Initialize default module access (one-time setup)
 * @access Super Admin only
 */
router.post('/initialize', authUser, requireRole('admin'), async (req, res) => {
  try {
    await initializeDefaultModuleAccess();
    res.json({ success: true, message: 'Module access initialized' });
  } catch (error) {
    console.error('Error initializing module access:', error);
    res.status(500).json({ success: false, message: 'Error initializing' });
  }
});

/**
 * @route GET /api/module-access/my-modules
 * @description Get accessible modules for current logged-in user
 * @access Any authenticated user
 */
router.get('/my-modules', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'patient';
    
    const modules = await getEffectiveModuleAccess(userId, userType);
    
    // Filter to only enabled modules with view access
    const accessibleModules = modules.filter(m => m.isEnabled && m.canView);
    
    res.json({ 
      success: true, 
      data: accessibleModules,
      userType 
    });
  } catch (error) {
    console.error('Error fetching user modules:', error);
    res.status(500).json({ success: false, message: 'Error fetching modules' });
  }
});

/**
 * @route GET /api/module-access/check/:moduleId
 * @description Check if current user has access to a specific module
 * @access Any authenticated user
 */
router.get('/check/:moduleId', authUser, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { action = 'view' } = req.query; // view, create, edit, delete, export
    const userId = req.user.id;
    const userType = req.user.userType || 'patient';
    
    const modules = await getEffectiveModuleAccess(userId, userType);
    const module = modules.find(m => m.moduleId === moduleId);
    
    if (!module || !module.isEnabled) {
      return res.json({ 
        success: true, 
        hasAccess: false, 
        reason: 'Module not available' 
      });
    }
    
    const accessMap = {
      view: module.canView,
      create: module.canCreate,
      edit: module.canEdit,
      delete: module.canDelete,
      export: module.canExport
    };
    
    res.json({ 
      success: true, 
      hasAccess: accessMap[action] || false,
      permissions: {
        canView: module.canView,
        canCreate: module.canCreate,
        canEdit: module.canEdit,
        canDelete: module.canDelete,
        canExport: module.canExport
      }
    });
  } catch (error) {
    console.error('Error checking module access:', error);
    res.status(500).json({ success: false, message: 'Error checking access' });
  }
});

// ── Tenant package entitlements ───────────────────────────────────────────────

router.get('/entitlements/list', authUser, requireRole('admin'), async (req, res) => {
  try {
    const data = await listEntitlements({ organizationId: req.query.organizationId });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(503).json({ success: false, message: 'Entitlements are unavailable until the foundation migration is applied' });
  }
});

router.post('/entitlements/grant', authUser, requireRole('admin'), async (req, res) => {
  try {
    const data = await grantEntitlement(req.body || {}, req.user.id);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/entitlements/revoke', authUser, requireRole('admin'), async (req, res) => {
  const { organizationId, packageCode, moduleId } = req.body || {};
  if (!organizationId || !packageCode || !moduleId) return res.status(400).json({ success: false, message: 'organizationId, packageCode and moduleId are required' });
  try {
    const data = await revokeEntitlement(organizationId, packageCode, moduleId);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, message: error.message });
  }
});

router.post('/entitlements/bootstrap-finance', authUser, requireRole('admin'), async (req, res) => {
  const { organizationId, periodCode } = req.body || {};
  if (!organizationId) return res.status(400).json({ success: false, message: 'organizationId is required' });
  try {
    const data = await seedDefaultFinanceSetup(organizationId, { periodCode, grantedBy: req.user.id });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/entitlements/check/:moduleId', authUser, async (req, res) => {
  try {
    const organizationId = req.user?.organization_id || req.user?.tenant_id || req.user?.hospital_id;
    const hasAccess = await hasModuleEntitlement(organizationId, req.params.moduleId, req.query.action || 'view');
    return res.json({ success: true, hasAccess, moduleId: req.params.moduleId, action: req.query.action || 'view' });
  } catch (error) {
    return res.status(503).json({ success: false, message: 'Entitlement check unavailable' });
  }
});

export default router;
