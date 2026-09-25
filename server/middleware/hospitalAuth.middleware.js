import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const JWT_SECRET = JWT_CONFIG.SECRET;

const VALID_HOSPITAL_ROLES = new Set([
  'hospital', 'hospital_admin', 'ceo', 'coo', 'cfo', 'ms', 'medical_superintendent',
  'cmo', 'chief_medical_officer', 'doctor', 'staff', 'nurse', 'accounts_staff',
  'mrd_staff', 'insurance_desk_staff', 'hr_staff', 'it_edp_staff', 'ot_staff',
  'icu_staff', 'quality_staff', 'security_staff', 'billing', 'receptionist',
  'insurance_coordinator',
]);

export const verifyHospitalToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role || decoded.userType;

    if (!VALID_HOSPITAL_ROLES.has(role)) {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }

    // Tenant comes from the token's tenant claims (incl. organization_id, which department logins mint);
    // `id` counts only for the legacy hospital account. No tenant => not attached to a hospital.
    const tenantId = resolveTenantId(decoded);
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'This account is not attached to a hospital. Ask an administrator to attach it.',
      });
    }
    req.hospitalId = tenantId;
    req.hospitalOrgId = tenantId;
    req.hospitalName = decoded.hospitalName || decoded.name || 'Hospital';
    req.tenantId = tenantId;
    req.userId = decoded.id;
    req.userRole = role;
    req.hospitalUser = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export default verifyHospitalToken;
