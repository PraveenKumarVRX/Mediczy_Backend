/**
 * Corporate Authentication Middleware — DB-backed per-request validation.
 *
 * Gaps closed vs. the previous authUser+requireRole('corporate') chain:
 *   1. DB re-check: fetches the Corporate record on every request.
 *   2. isActive + status: both validated per request, not just at login.
 *   3. JTI revocation: checked via portal_refresh_tokens.
 *   4. Sets req.corporateUser for consistent downstream access.
 */
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { JWT_CONFIG } from '../config/auth.config.js';
import { Corporate } from '../models/index.js';
import { isTokenRevoked } from '../services/token-revocation.service.js';

export const authCorporate = async (req, res, next) => {
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

    if (decoded.role !== 'corporate' && decoded.userType !== 'corporate') {
      return res.status(403).json({ success: false, message: 'Access denied. Corporate account required.' });
    }

    // JTI revocation check
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    const isScopedHrUser = ['corporate_admin', 'hr_staff', 'corporate_cmo'].includes(decoded.role) && decoded.userType === 'corporate';
    const corporateId = decoded.corporateId
      || decoded.corporate_id
      || (isScopedHrUser ? (decoded.organization_id || decoded.organizationId || decoded.tenant_id || decoded.tenantId) : decoded.id)
      || decoded.userId;
    if (!corporateId) {
      return res.status(401).json({ success: false, message: 'Corporate ID missing from token' });
    }

    // DB re-validation
    let corporate = await Corporate.findByPk(corporateId, {
      attributes: ['id', 'email', 'companyName', 'contactPerson', 'status'],
    });

    if (!corporate && (decoded.organization_id || decoded.organizationId || decoded.tenant_id || decoded.tenantId)) {
      const scopeCandidates = [decoded.organization_id, decoded.organizationId, decoded.tenant_id, decoded.tenantId]
        .filter(Boolean)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
      if (scopeCandidates.length > 0) {
        corporate = await Corporate.findOne({
          where: {
            [Op.or]: [
              { id: { [Op.in]: scopeCandidates } },
              { tenantId: { [Op.in]: scopeCandidates } },
            ],
          },
          attributes: ['id', 'email', 'companyName', 'contactPerson', 'status'],
        });
      }
    }

    if (!corporate) {
      return res.status(401).json({ success: false, message: 'Corporate account not found' });
    }

    const statusLower = String(corporate.status || '').toLowerCase();
    if (!['active', 'pending'].includes(statusLower)) {
      return res.status(403).json({
        success: false,
        message: `Corporate account is ${corporate.status}. Contact admin.`,
      });
    }

    req.corporateUser = {
      id: corporate.id,
      email: corporate.email,
      companyName: corporate.companyName,
      contactPersonName: corporate.contactPerson,
      role: 'corporate',
      corporateId: corporate.id,
    };
    // Populate req.user so any authUser-based shared handlers continue to work
    req.user = {
      id: corporate.id,
      corporateId: corporate.id,
      userId: decoded.userId || decoded.id || corporate.id,
      email: corporate.email,
      role: decoded.role || 'corporate',
      userType: 'corporate',
      organization_id: decoded.organization_id || decoded.organizationId || null,
      tenant_id: decoded.tenant_id || decoded.tenantId || null,
    };
    req.userRole = 'corporate';
    next();
  } catch (error) {
    console.error('[authCorporate] error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

export default { authCorporate };
