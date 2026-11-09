/**
 * Sign in with Apple — identity token verification.
 *
 * The iOS app obtains an identity token from Apple and posts it here. That
 * token is the only thing we trust: the `email`, `fullName` and `user` fields
 * the client also sends are conveniences, not evidence, and are never used to
 * decide *which* account is being signed into.
 *
 * Verification follows Apple's published requirements:
 *   - RS256 signature against Apple's JWKS (https://appleid.apple.com/auth/keys)
 *   - iss === https://appleid.apple.com
 *   - aud === our bundle id
 *   - exp in the future (jose enforces this)
 *   - nonce claim === SHA-256 of the raw nonce the app generated
 *
 * The nonce check is what stops a token minted for some other app, or captured
 * from an earlier sign-in, being replayed at this endpoint.
 */
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = `${APPLE_ISSUER}/auth/keys`;

/**
 * Bundle ids allowed to sign in. The iOS app is
 * `com.mysmarthealthapplications`; APPLE_BUNDLE_IDS can list more
 * (comma-separated) if a second bundle — a sibling app or a TestFlight-only
 * id — ever needs to share these accounts.
 */
export const allowedAudiences = () => String(
  process.env.APPLE_BUNDLE_IDS || process.env.APPLE_BUNDLE_ID || 'com.mysmarthealthapplications'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/**
 * jose caches the keys and refetches on rotation, so this is created once per
 * process rather than per request — Apple rate-limits the JWKS endpoint, and a
 * fetch on every sign-in would be both slow and rude.
 */
let jwks = null;
export function getAppleJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return jwks;
}

/** Apple compares the nonce claim against the SHA-256 hex digest of the raw nonce. */
export const hashNonce = (rawNonce) => crypto.createHash('sha256').update(String(rawNonce)).digest('hex');

/**
 * Apple issues a per-app relay address when the user hides their real one.
 * Such an address is routable but opaque, is unique to this app, and must
 * never be used to match against an account created elsewhere — two different
 * apps see two different relay addresses for the same person.
 */
export const isPrivateRelayEmail = (email) =>
  /@privaterelay\.appleid\.com$/i.test(String(email || '').trim());

export class AppleSignInError extends Error {
  constructor(message, { status = 400, code = 'apple_token_invalid' } = {}) {
    super(message);
    this.name = 'AppleSignInError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Verify an Apple identity token.
 *
 * @param {string} identityToken  the JWT from Apple
 * @param {string} [rawNonce]     the nonce the app generated, unhashed
 * @returns {Promise<{appleUserId: string, email: string|null, emailVerified: boolean, isPrivateRelay: boolean, audience: string, claims: object}>}
 * @throws {AppleSignInError}
 */
export async function verifyAppleIdentityToken(identityToken, rawNonce) {
  if (!identityToken || typeof identityToken !== 'string') {
    throw new AppleSignInError('identityToken is required', { code: 'identity_token_missing' });
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, getAppleJwks(), {
      issuer: APPLE_ISSUER,
      audience: allowedAudiences(),
      algorithms: ['RS256'],
    }));
  } catch (error) {
    // Apple's own message can name the audience or key id; that is useful in a
    // log but must not be handed to an unauthenticated caller.
    const reason = String(error?.code || error?.message || 'verification failed');
    console.warn('[apple-signin] identity token rejected:', reason);
    throw new AppleSignInError('Apple identity token could not be verified', { code: 'apple_token_invalid' });
  }

  if (!payload.sub) {
    throw new AppleSignInError('Apple identity token has no subject', { code: 'apple_token_invalid' });
  }

  // A token minted for another session has a different nonce. Apple omits the
  // claim entirely when the app did not send one, so a client that supplies a
  // nonce must get one back — otherwise the replay protection is silently off.
  if (rawNonce) {
    const expected = hashNonce(rawNonce);
    if (payload.nonce !== expected) {
      throw new AppleSignInError('Apple identity token nonce does not match', { code: 'apple_nonce_mismatch' });
    }
  }

  const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
  // Apple sends email_verified as either a boolean or the string "true".
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

  return {
    appleUserId: String(payload.sub),
    email,
    emailVerified,
    isPrivateRelay: isPrivateRelayEmail(email) || payload.is_private_email === true || payload.is_private_email === 'true',
    audience: Array.isArray(payload.aud) ? payload.aud[0] : payload.aud,
    claims: payload,
  };
}

/**
 * Is a "Sign in with Apple" key configured? This is NOT the APNs key — it is a
 * separate key from the developer portal. Without it we can neither exchange an
 * authorization code nor revoke a token, so both callers check this first and
 * degrade quietly instead of failing the operation they are attached to.
 */
export function appleServerKeyConfigured() {
  return Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

/**
 * The ES256 client secret Apple's token endpoints require in place of a static
 * secret. Short-lived on purpose (Apple caps it at 6 months; 5 minutes is all a
 * single request needs).
 */
async function appleClientSecret() {
  const { SignJWT, importPKCS8 } = await import('jose');
  const key = await importPKCS8(String(process.env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({ sub: allowedAudiences()[0] })
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

/**
 * Exchange the one-time `authorizationCode` the app receives from Apple for a
 * durable refresh token.
 *
 * This exists only so that deletion can revoke later. The authorization code
 * itself is useless at deletion time — Apple expires it in about five minutes —
 * so if we do not trade it for a refresh token *during sign-in*, there is
 * nothing left to revoke when the user asks to be forgotten, and guideline
 * 5.1.1(v) cannot be met. Never throws: sign-in must not fail because Apple is
 * unreachable or the key is missing.
 */
export async function exchangeAppleAuthorizationCode({ code } = {}) {
  if (!code) return { refreshToken: null, reason: 'no_code_supplied' };
  if (!appleServerKeyConfigured()) {
    return { refreshToken: null, reason: 'apple_signin_key_not_configured' };
  }

  try {
    const body = new URLSearchParams({
      client_id: allowedAudiences()[0],
      client_secret: await appleClientSecret(),
      code,
      grant_type: 'authorization_code',
    });
    const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) return { refreshToken: null, reason: `apple_responded_${response.status}` };
    const json = await response.json().catch(() => ({}));
    return json?.refresh_token
      ? { refreshToken: json.refresh_token }
      : { refreshToken: null, reason: 'no_refresh_token_in_response' };
  } catch (error) {
    console.error('[apple-signin] code exchange failed:', error.message);
    return { refreshToken: null, reason: 'exchange_request_failed' };
  }
}

/**
 * Revoke a user's Apple token — App Store guideline 5.1.1(v) requires this
 * when the account is deleted. Needs a "Sign in with Apple" key from the
 * developer portal (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY); it is NOT
 * the APNs key. Returns {revoked:false, reason} rather than throwing so that
 * account deletion is never blocked by Apple being unreachable.
 */
export async function revokeAppleToken({ token, tokenTypeHint = 'refresh_token' } = {}) {
  const clientId = allowedAudiences()[0];

  if (!token) return { revoked: false, reason: 'no_token_supplied' };
  if (!appleServerKeyConfigured()) {
    return { revoked: false, reason: 'apple_signin_key_not_configured' };
  }

  try {
    const clientSecret = await appleClientSecret();

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenTypeHint,
    });

    const response = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    // Apple answers 200 with an empty body on success.
    if (response.ok) return { revoked: true };
    return { revoked: false, reason: `apple_responded_${response.status}` };
  } catch (error) {
    console.error('[apple-signin] revoke failed:', error.message);
    return { revoked: false, reason: 'revoke_request_failed' };
  }
}

export default {
  verifyAppleIdentityToken,
  revokeAppleToken,
  exchangeAppleAuthorizationCode,
  appleServerKeyConfigured,
  hashNonce,
  isPrivateRelayEmail,
  allowedAudiences,
};
