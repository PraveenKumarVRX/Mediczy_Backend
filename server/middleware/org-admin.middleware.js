/**
 * Organization Admin Authentication Middleware
 * Supports multitenancy with organization-level super admins
 */

import jwt from 'jsonwebtoken';
import UserPostgres from '../models/postgres/user.model.postgres.js';
import OrganizationAdmin from '../models/postgres/organization-admin.model.postgres.js';

/**
 * Require System Admin (Platform Level)
 * Only users with isAdmin=true and role=system_admin
 */
export const requireSystemAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Must be system admin
    if (!req.user.isAdmin || req.user.role !== 'system_admin') {
      return res.status(403).json({
        success: false,
        message: 'System administrator access required',
        requiredRole: 'system_admin',
        userRole: req.user.role
      });
    }
    
    next();
  } catch (error) {
    console.error('[Auth] System admin check failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization check failed'
    });
  }
};

/**
 * Require Organization Admin (Any Type)
 * Allows hospital_admin, clinic_admin, lab_admin, etc.
 */
export const requireOrgAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const orgAdminRoles = [
      'hospital_admin', 'clinic_admin', 'lab_admin', 'pharmacy_admin',
      'tpa_admin', 'psu_admin', 'ngo_admin', 'insurer_admin',
      'corporate_admin', 'homecare_admin', 'ambulance_admin'
    ];
    
    // System admins can access org admin routes
    if (req.user.isAdmin && req.user.role === 'system_admin') {
      return next();
    }
    
    // Check if user has an org admin role
    if (!orgAdminRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Organization administrator access required',
        allowedRoles: orgAdminRoles,
        userRole: req.user.role
      });
    }
    
    next();
  } catch (error) {
    console.error('[Auth] Org admin check failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization check failed'
    });
  }
};

/**
 * Require Specific Organization Type Admin
 * e.g., requireOrgTypeAdmin('hospital') only allows hospital_admin
 */
export const requireOrgTypeAdmin = (orgType) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const expectedRole = `${orgType}_admin`;
      
      // System admins can access any organization type
      if (req.user.isAdmin && req.user.role === 'system_admin') {
        return next();
      }
      
      // Check if user has the specific org type admin role
      if (req.user.role !== expectedRole) {
        return res.status(403).json({
          success: false,
          message: `${orgType.charAt(0).toUpperCase() + orgType.slice(1)} administrator access required`,
          requiredRole: expectedRole,
          userRole: req.user.role
        });
      }
      
      next();
    } catch (error) {
      console.error('[Auth] Org type admin check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Require Access to Specific Organization
 * Checks if user has permission to access a specific tenant/organization
 */
export const requireOrgAccess = (tenantIdParam = 'tenantId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // Get tenant ID from params, query, or body
      const requestedTenantId = parseInt(
        req.params[tenantIdParam] || 
        req.query[tenantIdParam] || 
        req.body[tenantIdParam]
      );
      
      if (!requestedTenantId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID required',
          paramName: tenantIdParam
        });
      }
      
      // System admins can access any organization
      if (req.user.isAdmin && req.user.role === 'system_admin') {
        req.requestedTenantId = requestedTenantId;
        return next();
      }
      
      // Organization admins can only access their organization
      if (!req.user.tenant_id) {
        return res.status(403).json({
          success: false,
          message: 'No organization assigned to user',
          userId: req.user.id
        });
      }
      
      if (req.user.tenant_id !== requestedTenantId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this organization',
          userOrganization: req.user.tenant_id,
          requestedOrganization: requestedTenantId
        });
      }
      
      req.requestedTenantId = requestedTenantId;
      next();
    } catch (error) {
      console.error('[Auth] Org access check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Check if user has specific permission
 */
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // System admins have all permissions
      if (req.user.isAdmin && req.user.role === 'system_admin') {
        return next();
      }
      
      // Check user permissions array
      const userPermissions = req.user.permissions || [];
      
      // Check for wildcard permission
      if (userPermissions.includes('*')) {
        return next();
      }
      
      // Check for specific permission
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          requiredPermission: permission,
          userPermissions: userPermissions
        });
      }
      
      next();
    } catch (error) {
      console.error('[Auth] Permission check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Load organization admin context
 * Fetches OrganizationAdmin record and attaches to request
 */
export const loadOrgAdminContext = async (req, res, next) => {
  try {
    if (!req.user || !req.user.tenant_id) {
      return next();
    }
    
    // Skip for system admins
    if (req.user.isAdmin && req.user.role === 'system_admin') {
      return next();
    }
    
    // Find organization admin record
    const orgAdmin = await OrganizationAdmin.findOne({
      where: {
        user_id: req.user.id,
        tenant_id: req.user.tenant_id,
        status: 'active'
      }
    });
    
    if (orgAdmin) {
      req.orgAdmin = orgAdmin;
      req.orgAdminPermissions = orgAdmin.permissions || [];
      req.orgAdminScope = orgAdmin.scope || {};
    }
    
    next();
  } catch (error) {
    console.error('[Auth] Load org admin context failed:', error);
    next(); // Continue even if context loading fails
  }
};

/**
 * Department Admin Access Check
 * Validates access for department-level admins
 */
export const requireDepartmentAccess = (deptIdParam = 'departmentId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const requestedDeptId = parseInt(
        req.params[deptIdParam] || 
        req.query[deptIdParam] || 
        req.body[deptIdParam]
      );
      
      if (!requestedDeptId) {
        return res.status(400).json({
          success: false,
          message: 'Department ID required'
        });
      }
      
      // System admins and org admins can access any department
      if (
        (req.user.isAdmin && req.user.role === 'system_admin') ||
        req.user.role.endsWith('_admin') && !req.user.department_id
      ) {
        return next();
      }
      
      // Department admins can only access their department
      if (req.user.role === 'dept_admin') {
        if (!req.user.department_id) {
          return res.status(403).json({
            success: false,
            message: 'No department assigned to user'
          });
        }
        
        if (req.user.department_id !== requestedDeptId) {
          return res.status(403).json({
            success: false,
            message: 'Access denied to this department',
            userDepartment: req.user.department_id,
            requestedDepartment: requestedDeptId
          });
        }
      }
      
      next();
    } catch (error) {
      console.error('[Auth] Department access check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

export default {
  requireSystemAdmin,
  requireOrgAdmin,
  requireOrgTypeAdmin,
  requireOrgAccess,
  requirePermission,
  loadOrgAdminContext,
  requireDepartmentAccess
};
