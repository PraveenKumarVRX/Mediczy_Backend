/**
 * Admin authentication middleware — DB-backed re-validation on every request.
 *
 * Gaps closed vs. original:
 *   1. DB re-check: fetches the user record on every request — revoked/suspended
 *      admins are rejected even while their JWT is still technically valid.
 *   2. isActive + status: both fields must pass (old code only checked JWT claims).
 *   3. Role verification: confirms the DB record still carries isAdmin=true or an
 *      admin-tier role, not just the JWT payload claim.
 */
import { JWT_CONFIG } from '../config/auth.config.js';
import jwt from 'jsonwebtoken';
import userModel from '../models/user.model.intelligent.js';
import { ROLES } from '../config/roles.config.js';

const ADMIN_ROLES = new Set([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SYSTEM_ADMIN, ROLES.PLATFORM_ADMIN]);

export const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Token expired' });
      }
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Quick JWT claim pre-check before hitting the DB
    if (!decoded.isAdmin && !ADMIN_ROLES.has(decoded.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // DB re-validation — ensures suspended/deleted admins are rejected immediately
    const user = await userModel.findOne({
      where: { id: decoded.id },
      attributes: ['id', 'email', 'role', 'isAdmin', 'status', 'isActive'],
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Admin account not found' });
    }

    if (user.status !== 'active' || user.isActive === false) {
      return res.status(403).json({ success: false, error: 'Admin account is inactive or suspended' });
    }

    if (!user.isAdmin && !ADMIN_ROLES.has(user.role)) {
      return res.status(403).json({ success: false, error: 'Admin privileges have been revoked' });
    }

    req.admin = {
      id: user.id,
      email: user.email,
      role: user.role || decoded.role || ROLES.ADMIN,
      isAdmin: true,
    };
    req.user = req.admin;
    next();
  } catch (error) {
    console.error('[adminAuthMiddleware] error:', error.message);
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

export default adminAuthMiddleware;
