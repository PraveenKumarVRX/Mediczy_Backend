/**
 * TPA Authentication Middleware — DB-backed re-validation on every request.
 *
 * Gaps closed vs. the previous authUser+requireRole('tpa') chain:
 *   1. DB re-check: fetches the TPA record on every request — revoked/suspended
 *      TPAs are rejected even while their JWT is still technically valid.
 *   2. isActive + status: both fields validated (old chain only checked JWT claims).
 *   3. JTI revocation: checks portal_refresh_tokens via the revocation service.
 *   4. Sets req.tpaUser for consistent downstream access (no req.user juggling).
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { TPA } from '../models/tpa.model.intelligent.js';
import { isTokenRevoked } from '../services/token-revocation.service.js';

export const authTPA = async (req, res, next) => {
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

    if (decoded.tokenType && decoded.tokenType !== 'access') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    if (decoded.role !== 'tpa') {
      return res.status(403).json({ success: false, message: 'Access denied. TPA privileges required.' });
    }

    // JTI revocation check
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    // DB re-validation
    const tpa = await TPA.findByPk(decoded.id, {
      attributes: ['id', 'email', 'tpaName', 'contactPersonName', 'status', 'isActive', 'phoneNumber'],
    });

    if (!tpa) {
      return res.status(401).json({ success: false, message: 'TPA account not found' });
    }
    if (tpa.status !== 'active') {
      return res.status(403).json({ success: false, message: 'TPA account is inactive. Contact admin.' });
    }
    if (tpa.isActive === false) {
      return res.status(403).json({ success: false, message: 'TPA account has been disabled. Contact admin.' });
    }

    req.tpaUser = {
      id: tpa.id,
      email: tpa.email,
      tpaName: tpa.tpaName,
      contactPersonName: tpa.contactPersonName,
      role: 'tpa',
    };
    // Also populate req.user so requireRole() and authUser-based handlers work
    req.user = { id: tpa.id, email: tpa.email, role: 'tpa' };
    req.userRole = 'tpa';
    next();
  } catch (error) {
    console.error('[authTPA] error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

export default { authTPA };
