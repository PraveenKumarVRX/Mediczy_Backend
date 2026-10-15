import { checkStaffPrivilege } from '../services/hrms-qualification.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const CLINICAL_ROLES = new Set(['doctor', 'ohc_doctor', 'corporate_cmo', 'nurse', 'pharmacist', 'pharmacy', 'lab_staff', 'lab_technician', 'blood_bank', 'blood_bank_staff']);

const actorClaims = (req) => ({
  ...(req.user || {}),
  ...(req.bloodBankUser || {}),
  organization_id: req.user?.organization_id || req.user?.tenant_id || req.bloodBankOrgId || req.tenantId || req.doctor?.organization_id,
  tenant_id: req.user?.tenant_id || req.user?.organization_id || req.bloodBankOrgId || req.tenantId || req.doctor?.tenant_id,
});

/**
 * Enforces the persisted HRMS privilege decision at a clinical write boundary.
 * It deliberately fails closed when the qualification schema is unavailable or the
 * caller has no tenant/staff identity. System administrators are not clinical actors
 * and therefore must use an explicitly provisioned clinical account.
 */
export const requireStaffPrivilege = (privilegeCode) => async (req, res, next) => {
  const role = String(req.user?.role || req.userRole || req.bloodBankUser?.role || req.doctor?.role || '').toLowerCase();
  if (!CLINICAL_ROLES.has(role)) {
    return res.status(403).json({ success: false, code: 'CLINICAL_ROLE_REQUIRED', message: 'A clinical staff role is required for this action' });
  }
  const tenantId = resolveTenantId(actorClaims(req));
  const staffUserId = req.user?.id || req.user?.userId || req.user?.user_id || req.bloodBankUser?.id || req.bloodBankUser?.userId || req.bloodBankUser?.user_id || req.doctor?.user_id || req.doctor?.userId;
  if (!tenantId || !staffUserId) {
    return res.status(403).json({ success: false, code: 'PRIVILEGE_CONTEXT_REQUIRED', message: 'A tenant-scoped staff identity is required for this action' });
  }
  try {
    const decision = await checkStaffPrivilege(Number(tenantId), Number(staffUserId), privilegeCode);
    if (!decision.allowed) {
      return res.status(403).json({ success: false, code: 'CLINICAL_PRIVILEGE_REQUIRED', message: `Active ${privilegeCode} privilege and qualification are required`, reason: decision.reason });
    }
    req.staffPrivilege = decision.privilege;
    return next();
  } catch (error) {
    const status = error.status || error.statusCode || 503;
    return res.status(status).json({ success: false, code: error.code || 'PRIVILEGE_CHECK_FAILED', message: status === 503 ? 'Clinical privilege verification is unavailable' : error.message });
  }
};

export default { requireStaffPrivilege };
