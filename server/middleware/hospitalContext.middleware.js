/**
 * Unified hospital context from hospital portal JWT or authUser session.
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authUser } from './auth.middleware.js';
import { verifyHospitalToken } from './hospitalAuth.middleware.js';

const HOSPITAL_ROLES = new Set([
  'hospital', 'hospital_admin', 'ceo', 'coo', 'cfo', 'ms', 'medical_superintendent',
  'cmo', 'chief_medical_officer', 'doctor', 'staff', 'nurse', 'accounts_staff',
  'mrd_staff', 'insurance_desk_staff', 'billing', 'receptionist', 'insurance_coordinator',
]);

export function resolveHospitalIdFromRequest(req) {
  if (req.hospitalId) return Number(req.hospitalId);
  const u = req.user || req.hospitalUser || {};
  return Number(u.hospital_id || u.tenant_id || u.organization_id || u.hospitalId || u.id) || null;
}

export function hospitalContextFromToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return authUser(req, res, () => attachContext(req, res, next));

  try {
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const role = decoded.role || decoded.userType;
    if (HOSPITAL_ROLES.has(role)) {
      req.hospitalId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;
      req.hospitalOrgId = req.hospitalId;
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
  next();
}

export { verifyHospitalToken };
