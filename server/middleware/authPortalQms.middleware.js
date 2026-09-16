/**
 * Auth for unified QMS (hospital + clinic + lab).
 * Sets req.qms = { portal, organizationId, department, queueZone, actor }.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { QMS_PORTAL_DEFAULTS } from '../config/qms.config.js';
import { authUser } from './auth.middleware.js';
import { authLab } from './authLab.middleware.js';
import { authClinicPortal } from './clinicPortalAuth.middleware.js';
import sharedPool from '../db/pgPool.js';

export { QMS_PORTAL_DEFAULTS };

function peekToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), JWT_CONFIG.SECRET);
  } catch {
    return null;
  }
}

function roleOf(decoded = {}) {
  return String(decoded.role || decoded.userType || decoded.type || '').toLowerCase();
}

function bindQms(req, portalKey, organizationId, actor = {}) {
  const defaults = QMS_PORTAL_DEFAULTS[portalKey];
  if (!organizationId) {
    return false;
  }
  req.qms = {
    ...defaults,
    organizationId: Number(organizationId),
    actor: {
      id: actor.id || null,
      name: actor.name || actor.email || portalKey,
      role: actor.role || portalKey,
      email: actor.email || null,
    },
  };
  return true;
}

/**
 * Accept hospital staff, clinic portal, or lab JWT.
 */
export async function authPortalQms(req, res, next) {
  const decoded = peekToken(req);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Authentication required', code: 'NO_TOKEN' });
  }

  const role = roleOf(decoded);

  if (role === 'lab') {
    return authLab(req, res, (err) => {
      if (err) return next(err);
      const ok = bindQms(req, 'lab', req.lab?.id, {
        id: req.lab?.id,
        name: req.lab?.name,
        email: req.lab?.email,
        role: 'lab',
      });
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Lab tenant missing for QMS' });
      }
      return next();
    });
  }

  // Standalone doctor account (doctors table, /api/doctors/login) linked to a
  // clinic tenant — same real-world case fitness-certificate issuance already
  // handles: real doctors are onboarded through the standalone doctor platform,
  // not the separate clinic_staff (users table) login below.
  if (role === 'doctor') {
    try {
      const { rows } = await sharedPool.query(
        `SELECT id, "firstName", "lastName", email, tenant_id, "organization_type" FROM doctors WHERE id = $1`,
        [decoded.id]
      );
      const doctor = rows[0];
      if (!doctor || doctor.organization_type !== 'clinic' || !doctor.tenant_id) {
        return res.status(403).json({ success: false, message: 'Your account is not linked to a clinic' });
      }
      req.user = { id: doctor.id, email: doctor.email, role: 'doctor', organization_id: doctor.tenant_id, tenant_id: doctor.tenant_id };
      const ok = bindQms(req, 'clinic', doctor.tenant_id, {
        id: doctor.id,
        name: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || doctor.email,
        email: doctor.email,
        role: 'doctor',
      });
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Clinic tenant missing for QMS' });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ success: false, message: 'QMS authentication check failed' });
    }
  }

  if (role === 'clinic' || role === 'clinic_admin') {
    return authClinicPortal(req, res, (err) => {
      if (err) return next(err);
      const tid = req.tenantId || req.user?.organization_id || req.user?.tenant_id || req.clinicId;
      const ok = bindQms(req, 'clinic', tid, {
        id: req.user?.id,
        name: req.user?.name || req.user?.email,
        email: req.user?.email,
        role: 'clinic_admin',
      });
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Clinic tenant missing for QMS' });
      }
      return next();
    });
  }

  // Hospital portal JWT: { id, email, role: 'hospital' } — org = hospital id
  if (role === 'hospital') {
    const hospitalId = decoded.id || decoded.hospitalId || decoded.organization_id;
    req.user = {
      id: hospitalId,
      email: decoded.email,
      role: 'hospital',
      organization_id: hospitalId,
      tenant_id: hospitalId,
      type: 'hospital',
    };
    const ok = bindQms(req, 'hospital', hospitalId, {
      id: hospitalId,
      name: decoded.name || decoded.hospitalName || decoded.email,
      email: decoded.email,
      role: 'hospital',
    });
    if (!ok) {
      return res.status(403).json({ success: false, message: 'Hospital id missing for QMS' });
    }
    return next();
  }

  // Staff / doctor / receptionist / admin (user JWT with org)
  return authUser(req, res, (err) => {
    if (err) return next(err);
    const org =
      req.user?.organization_id ||
      req.user?.tenant_id ||
      req.tenantId ||
      decoded.organization_id ||
      decoded.tenant_id ||
      decoded.hospitalId;
    const ok = bindQms(req, 'hospital', org, {
      id: req.user?.id,
      name: req.user?.name || req.user?.email,
      email: req.user?.email,
      role: req.user?.role || role,
    });
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: 'Organization is required for hospital QMS',
      });
    }
    return next();
  });
}

export default authPortalQms;
