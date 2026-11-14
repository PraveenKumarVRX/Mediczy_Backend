/**
 * Social sign-in with PKCE (audit M20).
 *
 * The browser keeps a random code_verifier and state in sessionStorage and
 * sends only SHA-256(verifier) to the server. Google/Facebook bring the user
 * back to /oauth-callback with a one-time `code` (never a token in the URL,
 * where it would sit in history and server logs); OAuthCallback redeems it at
 * POST /api/auth/oauth/exchange with the verifier.
 */
const STORAGE_KEY = 'oauthPkce';

const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  view.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomString = (bytes: number): string => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** Sends the browser to `startUrl` (e.g. `${API}/api/auth/doctor/google`) with PKCE. */
export async function startOAuthWithPkce(startUrl: string): Promise<void> {
  const verifier = randomString(48); // 64 chars, within RFC 7636's 43–128
  const state = randomString(16);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(digest);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ verifier, state, at: Date.now() }));
  const url = new URL(startUrl, window.location.origin);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  window.location.href = url.toString();
}

export interface OAuthTokens {
  token: string;
  refreshToken?: string;
  userType: string;
  provider?: string;
  expiresIn?: number;
  tenantId?: string;
}

/**
 * Redeems the one-time code. Throws when the state does not match the one this
 * browser started with (a forged callback) or the code is expired/used.
 */
export async function redeemOAuthCode(apiBase: string, code: string, state: string | null): Promise<OAuthTokens> {
  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  })();
  sessionStorage.removeItem(STORAGE_KEY);
  if (!saved?.verifier || !state || saved.state !== state) {
    throw new Error('This sign-in did not start in this browser. Please sign in again.');
  }
  const response = await fetch(`${apiBase}/api/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: saved.verifier }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.token) {
    throw new Error(body?.message || 'Sign-in could not be completed. Please sign in again.');
  }
  return body as OAuthTokens;
}
