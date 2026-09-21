import Scm from '../../models/dept/scm.model.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { createDeptLogin } from './loginController.js';

const baseLogin = createDeptLogin(Scm, 'scm', { requireOrganization: true });

export const loginScm = async (req, res) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.token && body?.user) {
      const scmRole = body.user.scm_role || body.user.scmRole || 'admin';
      const token = jwt.sign(
        { id: body.user.id, role: 'scm', scmRole, organization_id: body.user.organization_id || null },
        JWT_CONFIG.SECRET,
        { expiresIn: JWT_CONFIG.EXPIRY.NORMAL }
      );
      return originalJson({ ...body, token, user: { ...body.user, scmRole } });
    }
    return originalJson(body);
  };
  return baseLogin(req, res);
};
