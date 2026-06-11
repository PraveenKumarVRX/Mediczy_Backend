/**
 * OAuth security helpers
 * ======================
 * Shared utilities for the social-login flows (Google / Facebook) used by the
 * patient web/mobile apps and the doctor app.
 *
 * Two concerns are centralised here so every provider integration behaves the
 * same way:
 *
 *  1. generateOAuthPassword() — OAuth accounts authenticate via the provider,
 *     but the local `password` column must still hold a non-guessable value.
 *     Using Math.random() (the previous approach) is NOT cryptographically
 *     secure; this uses crypto.randomBytes instead.
 *
 *  2. isOAuthEmailVerified() — only an email the provider asserts as *verified*
 *     may be used to auto-link a social identity to an EXISTING local account.
 *     Without this check an attacker could create a provider account carrying a
 *     victim's email address and silently take over the victim's account on
 *     first social sign-in. Facebook does not assert email verification, so it
 *     returns false unless an explicit verified flag is present.
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically strong placeholder password for an
 * OAuth-provisioned account. The result satisfies common complexity policies
 * (upper/lower/digit/symbol) while remaining effectively unguessable.
 *
 * @returns {string}
 */
export function generateOAuthPassword() {
  return `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
}

const isTruthyFlag = (value) =>
  value === true || value === 'true' || value === 1 || value === '1';

/**
 * Determine whether an OAuth provider asserts that the account email is
 * verified. Accepts either a passport profile object (Google/Facebook) or a
 * raw decoded token / Graph payload.
 *
 * @param {object} source - passport profile or token payload
 * @returns {boolean}
 */
export function isOAuthEmailVerified(source) {
  if (!source || typeof source !== 'object') return false;

  // passport profile shape: profile.emails[0].verified
  const emailObj = Array.isArray(source.emails) ? source.emails[0] : null;
  if (emailObj && isTruthyFlag(emailObj.verified)) return true;

  // Google OIDC payload (profile._json or a raw token payload)
  const json = source._json && typeof source._json === 'object' ? source._json : source;
  return (
    isTruthyFlag(json.email_verified) ||
    isTruthyFlag(json.verified_email) ||
    isTruthyFlag(json.verified)
  );
}

export default { generateOAuthPassword, isOAuthEmailVerified };
