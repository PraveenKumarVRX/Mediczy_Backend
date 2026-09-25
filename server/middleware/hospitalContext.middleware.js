/**
 * Unified hospital context from hospital portal JWT or authUser session.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authUser } from './auth.middleware.js';
import { verifyHospitalToken } from './hospitalAuth.middleware.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const HOSPITAL_ROLES = new Set([
  'hospital', 'hospital_admin', 'ceo', 'coo', 'cfo', 'ms', 'medical_superintendent',
  'cmo', 'chief_medical_officer', 'doctor', 'staff', 'nurse', 'accounts_staff',
  'mrd_staff', 'insurance_desk_staff', 'billing', 'receptionist', 'insurance_coordinator',
]);

export function resolveHospitalIdFromRequest(req) {
  if (req.hospitalId) return Number(req.hospitalId);
  const u = req.user || req.hospitalUser || {};
  return Number(resolveTenantId(u)) || null;
}

export function hospitalContextFromToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return authUser(req, res, () => attachContext(req, res, next));

  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const role = decoded.role || decoded.userType;
    if (HOSPITAL_ROLES.has(role)) {
      const tenantId = resolveTenantId(decoded);
      if (!tenantId) {
        return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'This account is not attached to a hospital. Ask an administrator to attach it.' });
      }
      req.hospitalId = tenantId;
      req.hospitalOrgId = tenantId;
      req.userId = decoded.id;
      req.userRole = role;
      req.hospitalUser = decoded;
      return next();
    }
  } catch {
    // fall through to authUser
  }
  return authUser(req, res, () => attachContext(req, res, next));
}

function attachContext(req, res, next) {
  req.hospitalId = resolveHospitalIdFromRequest(req);
  req.hospitalOrgId = req.hospitalId;
  req.userId = req.user?.id || req.userId;
  if (!req.hospitalId && !req.user?.id) {
    return res.status(401).json({ success: false, message: 'Hospital organization context required' });
  }
  if (!req.hospitalId) {
    return res.status(403).json({ success: false, code: 'TENANT_CONTEXT_REQUIRED', message: 'This account is not attached to a hospital. Ask an administrator to attach it.' });
  }
  next();
}

export { verifyHospitalToken };
