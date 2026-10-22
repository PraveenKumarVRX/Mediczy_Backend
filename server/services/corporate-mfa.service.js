import { getMfaStatus, verifyLoginFactor } from "./mfa-step-up.service.js";
export const corporateMfaIdentity = (user) => ({
  userId:
    user.role === "corporate"
      ? `corporate:${user.corporateId || user.id}`
      : `corporate-user:${user.userId || user.id}`,
  organizationId: `corporate:${user.corporateId}`,
});
export async function corporateMfaLogin(user, code, requestId) {
  const context = corporateMfaIdentity(user);
  const status = await getMfaStatus(context);
  if (!status.enabled) return {};
  if (!code)
    throw Object.assign(new Error("Enter your authenticator code to sign in"), {
      statusCode: 401,
      code: "MFA_REQUIRED",
    });
  try {
    return await verifyLoginFactor({ ...context, code, requestId });
  } catch (error) {
    error.statusCode = error.status || 500;
    throw error;
  }
}
export async function requireCorporateMfa(user, decoded) {
  const status = await getMfaStatus(corporateMfaIdentity(user));
  if (
    status.enabled &&
    (!decoded.mfaVerified ||
      decoded.mfaFactorId !== status.factor.id ||
      !decoded.mfaAt ||
      new Date(decoded.mfaAt) < new Date(status.factor.enrolledAt))
  ) {
    throw Object.assign(
      new Error("Sign in again with your authenticator code"),
      { statusCode: 401, code: "MFA_REQUIRED" },
    );
  }
}
