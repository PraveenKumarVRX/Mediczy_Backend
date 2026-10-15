import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel from '../models/user.model.intelligent.js';
import sharedPool from '../db/pgPool.js';
import { DEFAULT_CRM_ROLE, hasCRMCapability } from '../config/crm-roles.config.js';
import organizationUid from '../services/organization-uid.service.js';

/**
 * Verify CRM member authentication.
 * - Validates tokenType === 'access'
 * - DB re-checks user status (not just trusting the JWT)
 * - JTI revocation check against unified refresh-token store (with legacy fallback)
 */
export const authCRM = async (req, res, next) => {
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

    // CRM role guard
    if (!decoded.isCRM && decoded.userType !== 'crm') {
      return res.status(403).json({ success: false, message: 'Access denied. CRM privileges required.' });
    }

    // DB status re-check
    const user = await userModel.findOne({
      where: { id: decoded.id },
      attributes: ['id', 'email', 'role', 'status', 'isAdmin', 'isTeam', 'firstName', 'lastName', 'metadata', 'organization_id', 'tenant_id', 'organization_uid']
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account inactive. Contact admin.' });
    }

    // JTI revocation check
    if (decoded.jti) {
      try {
        const pool = sharedPool;
        let { rows } = await pool.query(
          `SELECT revoked FROM api_v2_refresh_tokens WHERE jti = $1 LIMIT 1`,
          [decoded.jti]
        );
        if (!rows.length) {
          // Backward-compat for tokens issued before unified storage.
          const legacy = await pool.query(
            `SELECT revoked FROM crm_refresh_tokens WHERE jti = $1 LIMIT 1`,
            [decoded.jti]
          );
          rows = legacy.rows;
        }
        if (rows.length > 0 && rows[0].revoked) {
          return res.status(401).json({ success: false, message: 'Token has been revoked' });
        }
      } catch (_) { /* table might not exist yet on first boot */ }
    }

    let metadata = {};
    try { metadata = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch (_) { metadata = {}; }

    // A CRM tenant may be a hospital/clinic (in `tenants`) or a corporate (in `corporates`), and those
    // two tables SHARE integer ids — so a bare integer tenantId is ambiguous (CLAUDE.md entity-uid rule).
    // Resolve the UNAMBIGUOUS entity uid (which encodes the kind via its prefix) + the kind, and attach
    // both. tenantId is kept for backward-compat; new/fixed code must scope by tenantUid.
    const tenantIdInt = metadata.tenantId || user.tenant_id || user.organization_id || decoded.tenantId || decoded.tenant_id || null;
    let tenantUidResolved = user.organization_uid || null;
    let tenantKind = null;
    try {
      if (!tenantUidResolved && user.tenant_id) tenantUidResolved = await organizationUid.tenantUid(user.tenant_id);
      if (!tenantUidResolved && tenantIdInt) {
        tenantUidResolved = (await organizationUid.tenantUid(tenantIdInt)) || (await organizationUid.corporateUid(tenantIdInt));
      }
      if (tenantUidResolved) {
        const reg = await sharedPool.query('SELECT kind FROM entity_registry WHERE uid = $1', [tenantUidResolved]);
        tenantKind = reg.rows[0]?.kind || null;
      }
    } catch (_) { /* resolution failure must not break auth; uid-scoped reads then fail closed (empty) */ }

    req.crmUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName || 'CRM',
      lastName: user.lastName || 'User',
      role: decoded.role || 'crm',
      isCRM: true,
      isAdmin: user.isAdmin || decoded.isAdmin || false,
      tenantId: tenantIdInt,
      tenantUid: tenantUidResolved,     // unambiguous entity uid — scope CRM data by THIS
      tenantKind,                       // 'hospital' | 'clinic' | 'corporate' | 'broker' | … (from entity_registry)
      permissions: metadata.crmPermissions || decoded.crmPermissions || [],
      crmRole: metadata.crmRole || decoded.crmRole || DEFAULT_CRM_ROLE,
    };

    next();
  } catch (error) {
    console.error('[CRMAuth] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

/**
 * Gate a route behind a CRM capability (see server/config/crm-roles.config.js).
 * Must run after `authCRM`. `isAdmin` always passes.
 */
export function requireCRMCapability(capability) {
  return (req, res, next) => {
    if (hasCRMCapability(req.crmUser, capability)) return next();
    return res.status(403).json({
      success: false,
      message: `This action is restricted to specific CRM roles (${capability}). Ask your CRM admin for access.`,
    });
  };
}
