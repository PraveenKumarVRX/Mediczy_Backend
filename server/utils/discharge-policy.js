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

/** Middleware: the caller's own (raw) session role must be in `allowed`. */
export function requireSessionRole(allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
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

// SQLSTATEs that have a caller-meaningful shape; the raw database message (table/constraint names) never reaches the client.
const PG_ERRORS = {
  '23505': [409, 'DUPLICATE', 'That record already exists'],
  '23503': [409, 'REFERENCE_NOT_FOUND', 'A referenced record does not exist'],
  '23514': [422, 'BUSINESS_RULE_VIOLATION', 'The values violate a business rule'],
  '23502': [400, 'REQUIRED_VALUE_MISSING', 'A required value is missing'],
  '22P02': [400, 'INVALID_VALUE', 'A value has the wrong format'],
};

/** Uniform error reply: coded/known errors keep their status and message; database errors never leak. */
export function sendRouteError(res, err, fallbackStatus = 400) {
  const isPg = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && (err.severity || err.routine);
  if (isPg && PG_ERRORS[err.code]) {
    const [status, code, message] = PG_ERRORS[err.code];
    return res.status(status).json({ success: false, code, message });
  }
  if (isPg || err?.name?.startsWith('Sequelize') || err?.parent || err?.original) {
    console.error('[route] database error:', err.message);
    return res.status(500).json({ success: false, message: 'The request could not be completed' });
  }
  return res.status(err?.status || fallbackStatus).json({ success: false, code: err?.code, message: err?.message || 'Request failed' });
}

export default { DISCHARGE_SIGN_ROLES, DISCHARGE_OVERRIDE_ROLES, requireSessionRole, sessionOverride, sendRouteError };
