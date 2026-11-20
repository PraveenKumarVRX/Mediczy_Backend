/**
 * POST /api/users/login/apple — Sign in with Apple.
 *
 * Apple requires this because the app offers Google sign-in (App Store
 * guideline 4.8). The iOS app sends the identity token it got from Apple; we
 * verify it, then match or create the account and return exactly the body
 * POST /users/login returns, so the app can reuse its existing session
 * handling unchanged.
 *
 * Account matching, in order:
 *   1. Apple's stable `sub` (metadata.appleId) — the only durable identifier.
 *   2. A verified, non-relay email that already belongs to an account, which
 *      is then linked to this Apple id.
 *   3. Otherwise a new account.
 *
 * Deliberately never matched on: the `email` or `fullName` the client sends
 * outside the token (unverifiable), or a private-relay address (unique per
 * app, so it cannot identify an account created anywhere else).
 */
import { Op } from 'sequelize';
import userModel, { generateAuthTokenForUser } from '../models/user.model.intelligent.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import { issueRefreshToken } from '../services/auth-token.service.js';
import { setAuthCookies } from '../config/cookies.config.js';
import {
  verifyAppleIdentityToken,
  AppleSignInError,
  exchangeAppleAuthorizationCode,
} from '../services/apple-signin.service.js';
import { rememberAppleRefreshToken } from '../services/apple-token-store.service.js';
import { recordSignupConsent } from '../services/patient-consent.service.js';

/** The user object POST /users/login returns, so clients need no second shape. */
const loginUserPayload = (user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  dateOfBirth: user.dateOfBirth,
  gender: user.gender,
  status: user.status,
  emailVerified: user.emailVerified,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  lastLogin: user.lastLogin,
  role: user.isAdmin ? 'admin' : (user.role && user.role !== 'user' ? user.role : 'user'),
  organization_type: user.organization_type || null,
  organization_id: user.organization_id || null,
  tenant_id: user.tenant_id || null,
  employerName: user.employerName,
  employeeId: user.employeeId,
  corporateId: user.corporateId,
  membershipType: user.membershipType,
});

const readMetadata = (user) => {
  let meta = user?.metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = {}; }
  }
  return meta && typeof meta === 'object' ? meta : {};
};

/** Apple sends the name only on the FIRST authorisation; take it if we have nothing. */
const nameFrom = (fullName) => {
  if (!fullName || typeof fullName !== 'object') return { firstName: null, lastName: null };
  const given = String(fullName.givenName || fullName.firstName || '').trim();
  const family = String(fullName.familyName || fullName.lastName || '').trim();
  return { firstName: given || null, lastName: family || null };
};

export async function signInWithApple(req, res) {
  const { identityToken, nonce, fullName, authorizationCode } = req.body || {};

  let verified;
  try {
    verified = await verifyAppleIdentityToken(identityToken, nonce);
  } catch (error) {
    if (error instanceof AppleSignInError) {
      // Never echo the token or Apple's internal reason back to the caller.
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    console.error('[apple-signin] unexpected verification failure:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to verify Apple sign-in' });
  }

  const { appleUserId, email, emailVerified, isPrivateRelay } = verified;
  const auditIdentifier = email || `apple:${appleUserId}`;

  try {
    // 1. The Apple subject is the identifier that survives email changes.
    let user = await userModel.findOne({
      where: { metadata: { appleId: appleUserId } },
    }).catch(() => null);

    // Sequelize JSONB equality can miss depending on dialect/config; fall back
    // to an explicit containment query rather than silently creating a second
    // account for someone who already has one.
    if (!user) {
      user = await userModel.findOne({
        where: userModel.sequelize.literal(
          `metadata->>'appleId' = ${userModel.sequelize.escape(appleUserId)}`
        ),
      }).catch(() => null);
    }

    let linkedByEmail = false;

    // 2. A verified, non-relay email may belong to an existing account.
    if (!user && email && emailVerified && !isPrivateRelay) {
      user = await userModel.findOne({ where: { email } }).catch(() => null);
      if (user) linkedByEmail = true;
    }

    if (user) {
      const meta = readMetadata(user);
      const updates = {};

      // Link the Apple id on first sign-in with an existing account.
      if (meta.appleId !== appleUserId) {
        updates.metadata = { ...meta, appleId: appleUserId, appleLinkedAt: new Date().toISOString() };
      }
      // Apple gives the name once; fill it only if we are missing it.
      const { firstName, lastName } = nameFrom(fullName);
      if (firstName && !user.firstName) updates.firstName = firstName;
      if (lastName && !user.lastName) updates.lastName = lastName;
      updates.lastLoginAt = new Date();

      await user.update(updates);
    } else {
      // 3. New account. unique_id is omitted on purpose: the database trigger
      // mints it and registers it (CLAUDE.md entity-UID rule 1).
      const { firstName, lastName } = nameFrom(fullName);
      user = await userModel.create({
        email: email || `apple_${appleUserId.replace(/[^A-Za-z0-9]/g, '')}@privaterelay.appleid.com`,
        firstName: firstName || 'Apple',
        lastName: lastName || 'User',
        role: 'user',
        // Opens once the member holds a plan (₹99 Basic or a promo coupon), not on sign-up.
        status: 'inactive',
        emailVerified: Boolean(email && emailVerified),
        lastLoginAt: new Date(),
        metadata: {
          appleId: appleUserId,
          appleLinkedAt: new Date().toISOString(),
          appleIsPrivateRelay: isPrivateRelay,
          signupSource: 'apple',
        },
      });
      // New account: record consent if the app sent the person's acceptance
      // alongside the Apple credential (audit M22). Otherwise consent status
      // reports it as required and the app asks.
      await recordSignupConsent({ userId: user.id, req, source: 'apple' });
    }

    // Trade Apple's one-time authorization code for a refresh token, so that
    // deleting this account can revoke the grant (guideline 5.1.1(v)). Sign-in
    // is the ONLY moment this is possible — Apple expires the code in minutes —
    // so there is no "do it later at deletion time" option.
    //
    // Never allowed to fail the sign-in: the identity token is already verified
    // and the user is authenticated. If this does not happen (no code sent, no
    // Sign in with Apple key configured, Apple unreachable) deletion degrades to
    // "nothing to revoke", which is the pre-existing behaviour.
    if (authorizationCode) {
      try {
        const { refreshToken: appleRefreshToken, reason } =
          await exchangeAppleAuthorizationCode({ code: authorizationCode });
        if (appleRefreshToken) {
          await rememberAppleRefreshToken(user.id, appleRefreshToken);
        } else if (reason && reason !== 'apple_signin_key_not_configured') {
          // The unconfigured case is the expected steady state until the key is
          // issued; anything else is worth seeing in the log.
          console.warn(`[apple-signin] no refresh token stored for user ${user.id}: ${reason}`);
        }
      } catch (error) {
        console.error('[apple-signin] refresh-token capture failed:', error.message);
      }
    }

    const token = generateAuthTokenForUser(user);

    let refreshToken = null;
    try {
      refreshToken = await issueRefreshToken(user);
    } catch (rtErr) {
      console.warn('[apple-signin] refresh token issuance failed (non-fatal):', rtErr.message);
    }

    if (refreshToken) {
      setAuthCookies(res, token, refreshToken);
    } else {
      const { ACCESS_COOKIE_OPTIONS, COOKIE_NAMES } = await import('../config/cookies.config.js');
      res.cookie(COOKIE_NAMES.ACCESS, token, ACCESS_COOKIE_OPTIONS);
    }

    await auditLoginAttempt(req, user.id, auditIdentifier, true, linkedByEmail ? 'apple_linked_existing_account' : undefined);

    const meta = readMetadata(user);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      refreshToken,
      requirePasswordChange: meta.requirePasswordChange === true,
      // The session works, but until the member holds a plan only plans, payment, promo
      // coupons and account settings answer (MEMBERSHIP_REQUIRED elsewhere).
      membershipRequired: user.status !== 'active',
      // So the client can tell a brand-new account from a returning one, and
      // whether it is dealing with a relay address it should not display as
      // "your email".
      apple: { linkedExistingAccount: linkedByEmail, isPrivateRelay },
      user: loginUserPayload(user),
    });
  } catch (error) {
    // A unique-constraint collision means the email is taken by an account we
    // were not allowed to link to automatically.
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        code: 'email_already_registered',
        message: 'An account already exists with this email. Sign in with your password, then link Apple from Privacy & Security.',
      });
    }
    console.error('[apple-signin] sign-in failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to complete Apple sign-in' });
  }
}

export default { signInWithApple };
