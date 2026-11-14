/**
 * Safe hand-off of social-login tokens to the mobile app (audit M20).
 *
 * Before: the Google/Facebook callback redirected to
 *   mysmarthealth://oauth-callback?token=<30-day JWT>&refreshToken=<…>
 * On Android any app can register the same custom scheme and receive that
 * link, and the server's `state` was optional and unsigned.
 *
 * Now (OAuth 2.0 authorization-code hand-off with PKCE, RFC 7636):
 *   1. The app creates a random code_verifier, sends
 *      code_challenge = BASE64URL(SHA256(code_verifier)) and its own `state`
 *      to /api/auth/google|facebook, together with mobile_redirect_uri.
 *   2. The server signs its round-trip state (HMAC), so the redirect URI and
 *      the challenge cannot be swapped on the way through Google/Facebook.
 *   3. The callback redirects with only a one-time `code` (60 s, single use)
 *      and the app's `state` — never a token.
 *   4. The app POSTs { code, code_verifier } to /api/auth/oauth/exchange over
 *      HTTPS and receives the tokens. An app that intercepted the link holds a
 *      code it cannot redeem without the verifier, which never left the phone.
 *
 * OAUTH_REQUIRE_PKCE=true refuses the old token-in-link hand-off for mobile;
 * leave it false until the app release that sends code_challenge is live.
 */
import crypto from 'node:crypto';
import { JWT_CONFIG } from '../config/auth.config.js';

const CODE_TTL_SECONDS = 60;
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;      // RFC 7636 §4.1
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;            // BASE64URL(SHA-256), no padding

export const pkceRequired = () => String(process.env.OAUTH_REQUIRE_PKCE || '').trim().toLowerCase() === 'true';
export const isValidChallenge = (value) => CHALLENGE.test(String(value || ''));

const stateKey = () => {
  const secret = JWT_CONFIG.SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT secret is required to sign OAuth state');
  return crypto.createHash('sha256').update(`oauth-state:${secret}`).digest();
};
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sha256b64 = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const sameString = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** payload -> "<base64url json>.<base64url hmac>" */
export function signState(payload) {
  const body = b64(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const mac = b64(crypto.createHmac('sha256', stateKey()).update(body).digest());
  return `${body}.${mac}`;
}

/** The payload if the signature verifies and it is under 15 minutes old, else null. */
export function verifyState(state, { maxAgeSeconds = 900 } = {}) {
  const [body, mac] = String(state || '').split('.');
  if (!body || !mac) return null;
  const expected = b64(crypto.createHmac('sha256', stateKey()).update(body).digest());
  if (!sameString(mac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.iat || Date.now() / 1000 - payload.iat > maxAgeSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

const handoffKey = (code) => `oauth:handoff:${sha256b64(code)}`;

/** Stores the tokens behind a fresh one-time code; returns the code. */
export async function createHandoff({ tokens, codeChallenge }, redis) {
  if (!isValidChallenge(codeChallenge)) throw new Error('A valid S256 code_challenge is required');
  const code = b64(crypto.randomBytes(32));
  const stored = await redis.set(handoffKey(code), JSON.stringify({ tokens, codeChallenge }), 'EX', CODE_TTL_SECONDS, 'NX');
  if (stored !== 'OK') throw new Error('Could not store the sign-in hand-off');
  return code;
}

/**
 * Redeems a code once. Returns { ok: true, tokens } or { ok: false, code }.
 * The code is consumed whether or not the verifier matches, so it cannot be
 * guessed at by retrying.
 */
export async function redeemHandoff({ code, codeVerifier }, redis) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) return { ok: false, code: 'INVALID_GRANT' };
  if (!VERIFIER.test(String(codeVerifier || ''))) return { ok: false, code: 'INVALID_VERIFIER' };
  const key = handoffKey(code);
  const [[, raw]] = await redis.multi().get(key).del(key).exec();
  if (!raw) return { ok: false, code: 'INVALID_GRANT' };
  let record;
  try { record = JSON.parse(raw); } catch { return { ok: false, code: 'INVALID_GRANT' }; }
  if (!sameString(sha256b64(codeVerifier), record.codeChallenge)) return { ok: false, code: 'INVALID_GRANT' };
  return { ok: true, tokens: record.tokens };
}

export default { pkceRequired, isValidChallenge, signState, verifyState, createHandoff, redeemHandoff };
