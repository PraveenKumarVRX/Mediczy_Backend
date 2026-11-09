/**
 * Patient social login (Google and Facebook, via passport).
 *
 * Mounted at /api/auth, so these are /api/auth/google, /api/auth/google/callback,
 * /api/auth/facebook and /api/auth/facebook/callback. Mobile clients come back
 * through the mysmarthealth://oauth-callback scheme handled below.
 *
 * This file also used to implement an OAuth 2.0 authorization SERVER, so that
 * Rocket.Chat could sign in against Mediqzy. RocketChat was retired on
 * 2026-10-04 and that half is gone; see the note where it used to be.
 */

import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { generateRefreshToken } from '../api/v2/auth.utils.js';

const router = express.Router();

const MOBILE_REDIRECT_SCHEMES = ['mysmarthealth://oauth-callback'];

const toQueryString = (params = {}) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

const isAllowedMobileRedirectUri = (uri = '') =>
  MOBILE_REDIRECT_SCHEMES.some((allowed) => uri.startsWith(allowed));

const buildMobileState = (req) => {
  const mobileRedirectUri = String(req.query.mobile_redirect_uri || '').trim();
  const clientState = String(req.query.state || '').trim();

  if (!mobileRedirectUri || !isAllowedMobileRedirectUri(mobileRedirectUri)) {
    return null;
  }

  const payload = {
    mobileRedirectUri,
    clientState: clientState || undefined,
    source: 'mobile',
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
};

const parseMobileState = (state) => {
  if (!state) return null;

  try {
    const decoded = Buffer.from(String(state), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed?.mobileRedirectUri && isAllowedMobileRedirectUri(parsed.mobileRedirectUri)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const buildOAuthSuccessRedirect = ({ req, provider, token, refreshToken, tenantId }) => {
  const mobileState = parseMobileState(req.query.state);
  const tenantQs = tenantId != null && tenantId !== '' ? `&tenantId=${encodeURIComponent(String(tenantId))}` : '';

  if (mobileState?.mobileRedirectUri) {
    const params = {
      token,
      refreshToken,
      userType: 'patient',
      provider,
      state: mobileState.clientState,
    };
    if (tenantId != null && tenantId !== '') params.tenantId = String(tenantId);

    return `${mobileState.mobileRedirectUri}${mobileState.mobileRedirectUri.includes('?') ? '&' : '?'}${toQueryString(params)}`;
  }

  return process.env.NODE_ENV === 'production'
    ? `https://app.mediqzy.com/oauth-callback?token=${token}&userType=patient&provider=${provider}${tenantQs}`
    : `http://localhost:5173/oauth-callback?token=${token}&userType=patient&provider=${provider}${tenantQs}`;
};

const buildOAuthErrorRedirect = ({ req, provider, error = 'oauth_failed' }) => {
  const mobileState = parseMobileState(req.query.state);
  if (mobileState?.mobileRedirectUri) {
    const params = {
      error,
      provider,
      state: mobileState.clientState,
    };
    return `${mobileState.mobileRedirectUri}${mobileState.mobileRedirectUri.includes('?') ? '&' : '?'}${toQueryString(params)}`;
  }

  return `/login?error=${provider}_${error}`;
};

const handleOAuthProviderSuccess = (req, res, provider) => {
  const { user } = req.user;
  // Carry tenant context through the callback (app convention: always return tenantId at login).
  const tenantId = user.tenant_id || user.tenantId || user.organization_id || user.organizationId || null;
  const refreshToken = generateRefreshToken(user.id, user.role || 'patient');
  const token = jwt.sign(
    {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'patient',
      userType: user.userType || 'patient',
      firstName: user.firstName,
      lastName: user.lastName,
      tenant_id: tenantId,
      organization_id: tenantId
    },
    JWT_CONFIG.SECRET || process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
  const redirectUrl = buildOAuthSuccessRedirect({ req, provider, token, refreshToken, tenantId });
  res.redirect(redirectUrl);
};

// ============================================================================
// REMOVED: OAuth 2.0 authorization-server endpoints (RocketChat SSO)
// ============================================================================
//
// /oauth/authorize, /oauth/token, /oauth/userinfo and the two .well-known
// discovery documents existed solely so Rocket.Chat could sign in against
// Mediqzy. RocketChat was retired on 2026-10-04; the client registry in
// db/oauth-clients.js had already been emptied, so every /oauth/authorize call
// failed client validation and nothing could complete the flow. Serving a
// public, advertised OAuth authorization server that cannot issue a token to
// anyone is attack surface with no user, so it is gone along with the
// client registry and the token service that only it used.
//
// What remains in this file is the patient social login (Google and Facebook
// via passport), which is mounted at /api/auth and is unrelated to RocketChat.

// ============================================================================
// GOOGLE OAUTH2 - PATIENT LOGIN
// ============================================================================

// ============================================================================
// FACEBOOK OAUTH2 - PATIENT LOGIN
// ============================================================================

/**
 * GET /api/auth/facebook
 * Initiates Facebook OAuth2 login for patients
 */
router.get('/facebook', (req, res, next) => {
  const state = buildMobileState(req);
  const options = {
    scope: ['email', 'public_profile'],
    session: false,
    ...(state ? { state } : {}),
  };
  return passport.authenticate('facebook', options)(req, res, next);
});

/**
 * GET /api/auth/facebook/callback
 * Facebook OAuth2 callback for patients
 */
router.get('/facebook/callback',
  (req, res, next) => {
    passport.authenticate('facebook', { session: false }, (err, authResult) => {
      if (err || !authResult) {
        const redirectUrl = buildOAuthErrorRedirect({ req, provider: 'facebook', error: 'auth_failed' });
        return res.redirect(redirectUrl);
      }

      req.user = authResult;
      try {
        return handleOAuthProviderSuccess(req, res, 'facebook');
      } catch (error) {
        console.error('Patient Facebook OAuth success handler error:', error);
        const redirectUrl = buildOAuthErrorRedirect({ req, provider: 'facebook' });
        return res.redirect(redirectUrl);
      }
    })(req, res, next);
  }
);

/**
 * GET /api/auth/google
 * Initiates Google OAuth2 login for patients
 */
router.get('/google', (req, res, next) => {
  const state = buildMobileState(req);
  const options = {
    scope: ['profile', 'email'],
    session: false,
    ...(state ? { state } : {}),
  };
  return passport.authenticate('google', options)(req, res, next);
});

/**
 * GET /api/auth/google/callback
 * Google OAuth2 callback for patients
 */
router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, authResult) => {
      if (err || !authResult) {
        const redirectUrl = buildOAuthErrorRedirect({ req, provider: 'google', error: 'auth_failed' });
        return res.redirect(redirectUrl);
      }

      req.user = authResult;
      try {
        return handleOAuthProviderSuccess(req, res, 'google');
      } catch (error) {
        console.error('Patient Google OAuth success handler error:', error);
        const redirectUrl = buildOAuthErrorRedirect({ req, provider: 'google' });
        return res.redirect(redirectUrl);
      }
    })(req, res, next);
  }
);

export default router;
