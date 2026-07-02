import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

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

    req.hospitalId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;
    req.hospitalOrgId = req.hospitalId;
    req.hospitalName = decoded.hospitalName || decoded.name || 'Hospital';
    req.tenantId = decoded.tenant_id || decoded.hospital_id || decoded.id;
    req.userId = decoded.id;
    req.userRole = role;
    req.hospitalUser = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export default verifyHospitalToken;
