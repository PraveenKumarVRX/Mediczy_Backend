/**
 * Auth for imaging/PACS routes — accepts lab JWT or clinic portal JWT.
 * Normalizes req.lab = { id: tenantId } so existing RIS/DICOM code can share one tenant key.
 */
import { authLab } from './authLab.middleware.js';
import { authClinicPortal } from './clinicPortalAuth.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import jwt from 'jsonwebtoken';

function peekRole(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(header.slice(7), JWT_CONFIG.SECRET);
    return {
      role: decoded.role || decoded.userType || decoded.type,
      decoded,
    };
  } catch {
    return null;
  }
}

/**
 * Lab or clinic → req.lab.id is the imaging tenant id (lab id or clinic tenant id).
 */
export function authLabOrClinicImaging(req, res, next) {
  const peeked = peekRole(req);
  if (!peeked) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const role = String(peeked.role || '').toLowerCase();

  if (role === 'lab') {
    return authLab(req, res, next);
  }

  if (role === 'clinic' || role === 'clinic_admin') {
    return authClinicPortal(req, res, (err) => {
      if (err) return next(err);
      const tid = req.tenantId || req.clinicId || req.user?.organization_id || req.user?.tenant_id;
      if (!tid) {
        return res.status(403).json({
          success: false,
          message: 'Clinic tenant is not linked for imaging',
        });
      }
      req.lab = {
        id: tid,
        labId: tid,
        email: req.user?.email || peeked.decoded.email,
        name: peeked.decoded.name || peeked.decoded.clinicName || 'Clinic',
        role: 'clinic',
        isClinic: true,
      };
      return next();
    });
  }

  return res.status(403).json({
    success: false,
    message: 'Imaging access requires a lab or clinic account',
  });
}

export default authLabOrClinicImaging;
