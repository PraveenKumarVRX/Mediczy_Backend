import { mobileUserBelongsToTenant } from '../services/mobile-tenant-membership.service.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel from '../models/user.model.intelligent.js';
import sharedPool from '../db/pgPool.js';

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

const normalize = (value) => String(value || '').trim().toLowerCase();

const hasNamedPermission = (permissions = [], required) => {
  const reqs = Array.isArray(required) ? required : [required];
  const normalizedPermissions = permissions.map(normalize).filter(Boolean);
  return reqs.some((req) => {
    const needle = normalize(req);
    return normalizedPermissions.some((permission) =>
      permission === needle ||
      permission.includes(needle) ||
      needle.includes(permission)
    );
  });
};

const isTeamAccount = (user = {}, metadata = {}) => Boolean(
  user.isAdmin ||
  user.isTeam ||
  user.role === 'team' ||
  user.role === 'team_member' ||
  user.role === 'team_lead' ||
  user.membershipType === 'team' ||
  metadata.isTeam === true
);

/**
 * Verify team member authentication.
 * - Validates tokenType === 'access'
 * - DB re-checks user status (not just trusting the JWT)
 * - JTI revocation check against unified refresh-token store (with legacy fallback)
 */
export const authTeam = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'No authorization token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // Reject refresh tokens used as access tokens
    if (decoded.tokenType && decoded.tokenType !== 'access') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    // Team role guard
    if (!decoded.isTeam && decoded.role !== 'team' && decoded.userType !== 'team') {
      return res.status(403).json({ success: false, message: 'Access denied. Team member privileges required.' });
    }

    // DB status re-check — prevents revoked/suspended accounts from continuing.
    // Fallback to pgPool when Sequelize points to an unavailable/local DB.
    let user = null;
    try {
      user = await userModel.findOne({
        where: { id: decoded.id },
        attributes: ['id', 'email', 'role', 'status', 'isAdmin', 'isTeam', 'membershipType', 'metadata', 'organization_id']
      });
    } catch (dbErr) {
      console.warn('[TeamAuth] Sequelize user lookup failed, falling back to pgPool:', dbErr.message);
      try {
        const { rows } = await sharedPool.query(
          `SELECT id, email, role, status,
                  COALESCE("isAdmin", FALSE) AS "isAdmin",
                  COALESCE("isTeam", FALSE) AS "isTeam",
                   membership_type AS "membershipType",
                  metadata,
                  organization_id
             FROM users
            WHERE id = $1
            LIMIT 1`,
          [decoded.id]
        );
        user = rows[0] || null;
      } catch (fallbackErr) {
        console.error('[TeamAuth] pgPool fallback failed:', fallbackErr.message);
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account inactive. Contact admin.' });
    }

    const metadata = parseMetadata(user.metadata);
    if (!isTeamAccount(user, metadata)) {
      return res.status(403).json({ success: false, message: 'Team access has been revoked.' });
    }

    if (!await mobileUserBelongsToTenant(req, user.id)) return res.status(403).json({ success: false, message: 'Account does not belong to this organisation.' });

    // JTI revocation check (only for tokens that carry a jti)
    if (decoded.jti) {
      try {
        const pool = sharedPool;
        let { rows } = await pool.query(
          `SELECT revoked FROM api_v2_refresh_tokens WHERE jti = $1 LIMIT 1`,
          [decoded.jti]
        );
        if (!rows.length) {
          // Backward-compat for access tokens issued before unification.
          const legacy = await pool.query(
            `SELECT revoked FROM team_refresh_tokens WHERE jti = $1 LIMIT 1`,
            [decoded.jti]
          );
          rows = legacy.rows;
        }
        // If we find the JTI and it is revoked, deny
        if (rows.length > 0 && rows[0].revoked) {
          return res.status(401).json({ success: false, message: 'Token has been revoked' });
        }
      } catch (_) { /* table might not exist yet on first boot — safe to continue */ }
    }

    const permissions = Array.isArray(metadata.permissions)
      ? metadata.permissions.filter((permission) => typeof permission === 'string' && permission.trim().length > 0)
      : [];

    req.teamUser = {
      id: user.id,
      email: user.email,
      role: user.role || decoded.role || 'team',
      isTeam: true,
      isAdmin: user.isAdmin || decoded.isAdmin || false,
      tenantId: metadata.tenantId || user.organization_id || decoded.tenantId || null,
      department: metadata.department || null,
      designation: metadata.designation || null,
      permissions,
      grantedModules: metadata.grantedModules || [],
      editableModules:  metadata.editableModules  || [],
      deletableModules: metadata.deletableModules || []
    };

    if (req.mobileTenant) req.teamUser.tenantId = req.mobileTenant.id;
    next();
  } catch (error) {
    console.error('[TeamAuth] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

/**
 * Check if team member has access to a specific module.
 * Admins bypass all module checks.
 */
export const requireModule = (moduleName) => {
  return async (req, res, next) => {
    const teamUser = req.teamUser;

    if (!teamUser) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (teamUser.isAdmin || teamUser.role === 'admin' || teamUser.role === 'super_admin') {
      return next();
    }

    // Check metadata-stored grantedModules if present
    const grantedModules = teamUser.grantedModules || null;
    if (grantedModules && Array.isArray(grantedModules)) {
      if (!grantedModules.includes(moduleName)) {
        return res.status(403).json({ success: false, message: `Access denied to ${moduleName} module` });
      }
      return next();
    }

    // Default: all basic modules accessible to any active team member
    const defaultModules = [
      'users', 'doctors', 'appointments', 'chat',
      'hospitals', 'pharmacies', 'plans', 'reports',
      'team_directory', 'profile', 'notifications'
    ];

    if (!defaultModules.includes(moduleName)) {
      return res.status(403).json({ success: false, message: `Access denied to ${moduleName} module` });
    }

    next();
  };
};

/**
 * Check if team member has a specific named permission.
 */
export const requirePermission = (permissionName) => {
  return async (req, res, next) => {
    const teamUser = req.teamUser;

    if (!teamUser) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (teamUser.isAdmin || teamUser.role === 'admin' || teamUser.role === 'super_admin') {
      return next();
    }

    if (!hasNamedPermission(teamUser.permissions || [], permissionName)) {
      const required = Array.isArray(permissionName) ? permissionName.join(' or ') : permissionName;
      return res.status(403).json({
        success: false,
        message: `Permission denied. ${required} access required.`,
        code: 'TEAM_PERMISSION_DENIED'
      });
    }

    next();
  };
};

export const requireAnyPermission = requirePermission;

/**
 * Block write operations if user lacks edit access for a module.
 */
export const requireEditAccess = (moduleName) => {
  return async (req, res, next) => {
    const teamUser = req.teamUser;

    if (!teamUser) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (teamUser.isAdmin || teamUser.role === 'admin' || teamUser.role === 'super_admin') {
      req.hasEditAccess = true;
      return next();
    }

    const editableModules = teamUser.editableModules || [];
    if (!editableModules.includes(moduleName)) {
      return res.status(403).json({
        success: false,
        message: `View-only access. Edit permission required for ${moduleName} module.`,
        viewOnly: true
      });
    }

    req.hasEditAccess = true;
    next();
  };
};

/**
 * Attach access level flags to request without blocking.
 */
export const attachAccessLevel = async (req, res, next) => {
  try {
    const teamUser = req.teamUser;

    if (!teamUser) {
      req.accessLevel = 'none';
      return next();
    }

    if (teamUser.isAdmin || teamUser.role === 'admin' || teamUser.role === 'super_admin') {
      req.accessLevel = 'full';
      req.canView   = true;
      req.canEdit   = true;
      req.canDelete = true;
      return next();
    }

    req.accessLevel      = 'view';
    req.canView          = true;
    req.canEdit          = false;
    req.canDelete        = false;
    req.editableModules  = teamUser.editableModules  || [];
    req.deletableModules = teamUser.deletableModules || [];

    next();
  } catch (error) {
    console.error('[AttachAccessLevel] Error:', error.message);
    req.accessLevel = 'view';
    req.canView = true;
    req.canEdit = false;
    req.canDelete = false;
    next();
  }
};

export default { authTeam, requireModule, requirePermission, requireEditAccess, attachAccessLevel };
