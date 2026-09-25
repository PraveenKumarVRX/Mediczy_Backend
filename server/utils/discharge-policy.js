/**
 * Who may sign a discharge and who may override its safety gates.
 *
 * Audit findings CLN-01/02: the sign routes accepted any authenticated user, and the override approver
 * (`approverId` / `approverRole`) was read from the REQUEST BODY, so the audit row could record a forged
 * approver. The approver is now always the authenticated caller; the body only supplies the reason.
 *
 * The role lists are a clinical-governance decision (see the audit's "decisions needed"), so they are
 * overridable without a code change:  DISCHARGE_SIGN_ROLES / DISCHARGE_OVERRIDE_ROLES = comma-separated roles.
 */
const parse = (envName, fallback) =>
  new Set((process.env[envName] || fallback).split(',').map((s) => s.trim()).filter(Boolean));

export const DISCHARGE_SIGN_ROLES = parse(
  'DISCHARGE_SIGN_ROLES',
  'doctor,ms,medical_superintendent,cmo,chief_medical_officer,medical_director,hospital_admin,discharge_officer,admin,system_admin,super_admin'
);

export const DISCHARGE_OVERRIDE_ROLES = parse(
  'DISCHARGE_OVERRIDE_ROLES',
  'ms,medical_superintendent,cmo,chief_medical_officer,medical_director,hospital_admin,discharge_officer,admin,system_admin,super_admin'
);

// Who may write discharge summaries (clinical + discharge/records staff). Overridable: DISCHARGE_DOC_ROLES.
export const DISCHARGE_DOC_ROLES = parse(
  'DISCHARGE_DOC_ROLES',
  'doctor,nurse,ms,medical_superintendent,cmo,chief_medical_officer,medical_director,hospital_admin,discharge_officer,mrd_staff,admin,system_admin,super_admin'
);

// Who may create/queue MRD records (records department + senior clinical/admin). Overridable: MRD_WRITE_ROLES.
export const MRD_WRITE_ROLES = parse(
  'MRD_WRITE_ROLES',
  'mrd_staff,ms,medical_superintendent,cmo,chief_medical_officer,medical_director,hospital_admin,admin,system_admin,super_admin'
);

/** Middleware: the caller's own (raw) session role must be in `allowed`. Works for hospital-token routes too (req.userRole). */
export function requireSessionRole(allowed) {
  return (req, res, next) => {
    const role = req.user?.role || req.userRole;
    if (!role) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!allowed.has(role)) {
      return res.status(403).json({ success: false, code: 'ROLE_NOT_PERMITTED', message: 'Your role is not permitted to perform this action' });
    }
    return next();
  };
}

/**
 * Builds the override the services act on, from the AUTHENTICATED caller. Returns null when the caller did not
 * ask for an override. Throws {status, code} when they asked but may not.
 */
export function sessionOverride(user, requested, allowed = DISCHARGE_OVERRIDE_ROLES) {
  if (!requested) return null;
  const reason = String(requested.reasonCode || requested.reason || '').trim();
  if (reason.length < 3) {
    throw Object.assign(new Error('An override needs a reason'), { status: 400, code: 'OVERRIDE_REASON_REQUIRED' });
  }
  if (!user?.id || !allowed.has(user.role)) {
    throw Object.assign(new Error('Your role is not permitted to override this safety check'), { status: 403, code: 'OVERRIDE_ROLE_NOT_PERMITTED' });
  }
  return { reasonCode: reason, reason, approverId: user.id, approverRole: user.role };
}

export { sendRouteError } from './route-errors.js';

export default { DISCHARGE_SIGN_ROLES, DISCHARGE_OVERRIDE_ROLES, DISCHARGE_DOC_ROLES, MRD_WRITE_ROLES, requireSessionRole, sessionOverride };
