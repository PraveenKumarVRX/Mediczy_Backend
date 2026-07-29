/**
 * Auth for clinic portal JWT (hospitals login) and clinic_admin user JWT.
 * Sets req.user in a shape staff/patient controllers expect.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { resolveClinicPortalContext } from '../services/clinic-portal.service.js';
import { authUser } from './auth.middleware.js';

const JWT_SECRET = JWT_CONFIG.SECRET;

export async function authClinicPortal(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type === 'clinic') {
      const ctx = await resolveClinicPortalContext(decoded);
      if (!ctx.tenantId) {
        return res.status(403).json({
          success: false,
          message: 'Clinic tenant is not linked. Re-run clinic ensure-login.',
        });
      }
      req.clinicPortal = ctx;
      req.clinicId = ctx.hospitalId;
      req.tenantId = ctx.tenantId;
      req.user = {
        id: decoded.adminUserId || decoded.id,
        email: decoded.email,
        role: 'clinic_admin',
        organization_id: ctx.tenantId,
        tenant_id: ctx.tenantId,
        type: 'clinic',
        isClinicPortal: true,
      };
      return next();
    }

    // Fall back to normal user auth (clinic_admin staff token)
    return authUser(req, res, (err) => {
      if (err) return next(err);
      if (req.user?.role === 'clinic_admin') {
        req.tenantId = req.user.organization_id || req.user.tenant_id;
        return next();
      }
      return res.status(403).json({ success: false, message: 'Clinic admin access required' });
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
    });
  }
}

export default authClinicPortal;
