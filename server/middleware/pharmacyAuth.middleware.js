import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const PHARMACY_ROLES = new Set(['pharmacy', 'pharmacy_staff']);

export const requirePharmacyAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const userType = String(decoded.userType || decoded.role || decoded.type || '').toLowerCase();

    if (!PHARMACY_ROLES.has(userType)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const pharmacyId = decoded.pharmacyId || decoded.id || decoded.userId;
    if (!pharmacyId) {
      return res.status(401).json({ success: false, message: 'Invalid pharmacy token' });
    }

    req.user = {
      ...decoded,
      id: pharmacyId,
      pharmacyId,
      role: userType,
      userType,
      tenant_id: decoded.tenant_id || decoded.tenantId || null,
    };
    req.userType = userType;
    req.pharmacyId = pharmacyId;
    req.pharmacyToken = decoded;

    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export default requirePharmacyAuth;
