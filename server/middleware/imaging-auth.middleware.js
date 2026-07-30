/**
 * Shared auth for imaging platform routes — doctor/hospital/lab JWT.
 */
import { authUser } from './auth.middleware.js';
import { authLab } from './authLab.middleware.js';
import { optionalKeycloakAuth } from './imaging-keycloak.middleware.js';

const PACS_ROLES = new Set(['doctor', 'admin', 'hospital', 'lab', 'clinic', 'clinic_admin', 'super-admin', 'medical_director']);

export function authImaging(req, res, next) {
  return optionalKeycloakAuth(req, res, () => {
    if (req.keycloakUser) {
      req.user = req.keycloakUser;
      return next();
    }
    const authHeader = req.headers.authorization || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authUser(req, res, () => {
        if (!PACS_ROLES.has(req.user?.role)) {
          return res.status(403).json({ success: false, message: 'Imaging access denied for this role' });
        }
        req.user.tenantId = req.user.tenantId || req.user.hospitalId || req.user.id;
        return next();
      });
    }
    return authLab(req, res, () => {
      req.user = {
        id: req.lab?.id,
        tenantId: req.lab?.id,
        role: 'lab',
        name: req.lab?.labName || req.lab?.name,
      };
      return next();
    });
  });
}

export function getTenantId(req) {
  return req.user?.tenantId || req.lab?.id || req.user?.id;
}
