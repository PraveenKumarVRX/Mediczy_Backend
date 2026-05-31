/**
 * Shared httpOnly cookie configuration for access and refresh tokens.
 *
 * Cookies are set by the server on login/refresh and cleared on logout.
 * Mobile apps (React Native) bypass cookies and use Authorization headers —
 * the auth middleware accepts both mechanisms transparently.
 */

export const COOKIE_NAMES = {
  ACCESS:  'msz_access',
  REFRESH: 'msz_refresh',
};

const IS_PROD = process.env.NODE_ENV === 'production';

// 30 days in seconds — matches patient access token TTL
const ACCESS_MAX_AGE  = 30 * 24 * 60 * 60 * 1000;
// 7 days in seconds — matches auth-token.service refresh TTL
const REFRESH_MAX_AGE =  7 * 24 * 60 * 60 * 1000;

export const ACCESS_COOKIE_OPTIONS = {
  httpOnly:  true,
  secure:    IS_PROD,
  sameSite:  IS_PROD ? 'strict' : 'lax',
  path:      '/',
  maxAge:    ACCESS_MAX_AGE,
};

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly:  true,
  secure:    IS_PROD,
  sameSite:  IS_PROD ? 'strict' : 'lax',
  path:      '/api/auth',   // Scoped so it's only sent to refresh/logout endpoints
  maxAge:    REFRESH_MAX_AGE,
};

/**
 * Set both auth cookies on a response object.
 */
export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(COOKIE_NAMES.ACCESS,  accessToken,  ACCESS_COOKIE_OPTIONS);
  res.cookie(COOKIE_NAMES.REFRESH, refreshToken, REFRESH_COOKIE_OPTIONS);
}

/**
 * Clear both auth cookies (logout).
 */
export function clearAuthCookies(res) {
  res.clearCookie(COOKIE_NAMES.ACCESS,  { path: '/' });
  res.clearCookie(COOKIE_NAMES.REFRESH, { path: '/api/auth' });
}
