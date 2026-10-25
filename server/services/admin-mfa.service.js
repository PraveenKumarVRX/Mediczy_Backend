/**
 * MFA for admin (isAdmin=true) accounts - reuses the same generic TOTP
 * engine (mfa-step-up.service.js) the corporate-login MFA already uses
 * (see corporate-mfa.service.js), scoped to its own identity namespace so
 * an admin's enrollment never collides with a corporate or regular-user
 * enrollment that happens to share a numeric id.
 */
import { getMfaStatus, verifyLoginFactor } from "./mfa-step-up.service.js";

export const adminMfaIdentity = (user) => ({
  userId: `admin:${user.id}`,
  organizationId: "admin",
});

/**
 * Called from the admin login flow after password verification succeeds.
 * No-op (returns {}) if MFA isn't enrolled/enabled for this admin yet -
 * enrollment (via POST /api/auth/mfa/enroll, same generic route) is what
 * turns enforcement on, same opt-in pattern as the corporate flow.
 */
export async function requireAdminMfaOnLogin(user, code, requestId) {
  const context = adminMfaIdentity(user);
  const status = await getMfaStatus(context);
  if (!status.enabled) return {};
  if (!code) {
    throw Object.assign(new Error("Enter your authenticator code to sign in"), {
      statusCode: 401,
      code: "MFA_REQUIRED",
    });
  }
  try {
    return await verifyLoginFactor({ ...context, code, requestId });
  } catch (error) {
    error.statusCode = error.status || 500;
    throw error;
  }
}

export default { adminMfaIdentity, requireAdminMfaOnLogin };
