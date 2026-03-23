import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel from '../models/user.model.intelligent.js';
import sharedPool from '../db/pgPool.js';

/**
 * Verify CRM member authentication.
 * - Validates tokenType === 'access'
 * - DB re-checks user status (not just trusting the JWT)
 * - JTI revocation check against crm_refresh_tokens
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
      attributes: ['id', 'email', 'role', 'status', 'isAdmin', 'isTeam', 'firstName', 'lastName', 'metadata', 'organization_id']
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
        const { rows } = await pool.query(
          `SELECT revoked FROM crm_refresh_tokens WHERE jti = $1`,
          [decoded.jti]
        );
        if (rows.length > 0 && rows[0].revoked) {
          return res.status(401).json({ success: false, message: 'Token has been revoked' });
        }
      } catch (_) { /* table might not exist yet on first boot */ }
    }

    let metadata = {};
    try { metadata = user.metadata ? JSON.parse(user.metadata) : {}; } catch (_) { metadata = {}; }

    req.crmUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName || 'CRM',
      lastName: user.lastName || 'User',
      role: decoded.role || 'crm',
      isCRM: true,
      isAdmin: user.isAdmin || decoded.isAdmin || false,
      tenantId: metadata.tenantId || user.organization_id || decoded.tenantId || null,
      permissions: metadata.crmPermissions || decoded.crmPermissions || [],
    };

    next();
  } catch (error) {
    console.error('[CRMAuth] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};
