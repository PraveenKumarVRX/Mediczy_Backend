/**
 * Billing RBAC — segregation of duties for financial operations.
 */
const BILLING_READ_ROLES = new Set([
  'hospital', 'hospital_admin', 'ceo', 'coo', 'cfo', 'ms', 'billing', 'accounts_staff',
  'insurance_desk_staff', 'insurance_coordinator', 'doctor', 'receptionist',
]);

const BILLING_WRITE_ROLES = new Set([
  'hospital', 'hospital_admin', 'cfo', 'billing', 'accounts_staff', 'receptionist',
]);

const BILLING_SUPERVISOR_ROLES = new Set([
  'hospital', 'hospital_admin', 'cfo', 'ms', 'medical_superintendent',
]);

export function requireBillingRead(req, res, next) {
  const role = req.userRole || req.hospitalUser?.role;
  if (!BILLING_READ_ROLES.has(role)) {
    return res.status(403).json({ success: false, message: 'Billing read access required' });
  }
  next();
}

export function requireBillingWrite(req, res, next) {
  const role = req.userRole || req.hospitalUser?.role;
  if (!BILLING_WRITE_ROLES.has(role)) {
    return res.status(403).json({ success: false, message: 'Billing write access required' });
  }
  next();
}

export function requireBillingSupervisor(req, res, next) {
  const role = req.userRole || req.hospitalUser?.role;
  if (!BILLING_SUPERVISOR_ROLES.has(role) && req.body?.supervisorPin !== process.env.BILLING_SUPERVISOR_PIN) {
    return res.status(403).json({ success: false, message: 'Supervisor authorization required for this action' });
  }
  next();
}
