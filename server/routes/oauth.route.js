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
import redis from '../config/redis.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  signState, verifyState, createHandoff, redeemHandoff, pkceRequired, isValidChallenge,
} from '../services/oauth-handoff.service.js';

const router = express.Router();

const MOBILE_REDIRECT_SCHEMES = ['mysmarthealth://oauth-callback'];

const toQueryString = (params = {}) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

const isAllowedMobileRedirectUri = (uri = '') =>
  MOBILE_REDIRECT_SCHEMES.some((allowed) => uri.startsWith(allowed));

const appendQuery = (uri, params) => `${uri}${uri.includes('?') ? '&' : '?'}${toQueryString(params)}`;

/**
 * The state that round-trips through Google/Facebook for a mobile sign-in.
 * Signed (services/oauth-handoff.service.js), so the redirect URI and the
 * PKCE challenge cannot be swapped on the way. Returns { state } for a mobile
 * flow, { state: null } for a web flow, or { error, … } when the app asked
 * for a mobile flow it may not have (bad PKCE, PKCE required, missing state).
 */
const buildMobileState = (req) => {
  const mobileRedirectUri = String(req.query.mobile_redirect_uri || '').trim();
  const clientState = String(req.query.state || '').trim();

  const isMobile = Boolean(mobileRedirectUri) && isAllowedMobileRedirectUri(mobileRedirectUri);
  const codeChallenge = String(req.query.code_challenge || '').trim();
  const method = String(req.query.code_challenge_method || 'S256').trim();
  const target = isMobile ? mobileRedirectUri : null;
  if (codeChallenge) {
    if (method !== 'S256' || !isValidChallenge(codeChallenge)) return { error: 'invalid_pkce', mobileRedirectUri: target, clientState };
    if (!clientState) return { error: 'state_required', mobileRedirectUri: target, clientState };
  } else if (isMobile && pkceRequired()) {
    return { error: 'pkce_required', mobileRedirectUri, clientState };
  }
  // A web sign-in without PKCE keeps the legacy hand-off (until OAUTH_REQUIRE_PKCE).
  if (!isMobile && !codeChallenge) return { state: null };

  return {
    state: signState({
      mobileRedirectUri: target || undefined,
      clientState: clientState || undefined,
      codeChallenge: codeChallenge || undefined,
      source: isMobile ? 'mobile' : 'web',
    }),
  };
};

/** The verified round-trip state (mobile or web PKCE), or null. */
const parseMobileState = (state) => {
  const payload = verifyState(state);
  if (!payload) return null;
  if (payload.mobileRedirectUri && !isAllowedMobileRedirectUri(payload.mobileRedirectUri)) return null;
  return payload;
};

const webCallbackUrl = () => (process.env.NODE_ENV === 'production'
  ? 'https://app.mediqzy.com/oauth-callback'
  : 'http://localhost:5173/oauth-callback');

/** Where an error goes when the app asked for a flow it may not have. */
const startErrorRedirect = ({ error, mobileRedirectUri, clientState, provider }) => (mobileRedirectUri
  ? appendQuery(mobileRedirectUri, { error, provider, state: clientState })
  : `/login?error=${provider}_${error}`);

const buildOAuthSuccessRedirect = ({ req, provider, token, refreshToken, tenantId }) => {
  const mobileState = parseMobileState(req.query.state);
  const tenantQs = tenantId != null && tenantId !== '' ? `&tenantId=${encodeURIComponent(String(tenantId))}` : '';

  if (mobileState?.mobileRedirectUri && !mobileState.codeChallenge) {
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

const handleOAuthProviderSuccess = async (req, res, provider) => {
  const { user } = req.user;
  // Carry tenant context through the callback (app convention: always return tenantId at login).
  const tenantId = user.tenant_id || user.tenantId || user.organization_id || user.organizationId || null;
  const mobileState = parseMobileState(req.query.state);

  // Without PKCE there are no tokens once PKCE is required (mobile and web).
  if (!mobileState?.codeChallenge && pkceRequired()) {
    return res.redirect(buildOAuthErrorRedirect({ req, provider, error: 'pkce_required' }));
  }

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

  // PKCE hand-off: the link carries a one-time code, never a token (audit M20).
  if (mobileState?.codeChallenge) {
    const code = await createHandoff({
      tokens: { token, refreshToken, userType: 'patient', provider, ...(tenantId != null && tenantId !== '' ? { tenantId: String(tenantId) } : {}) },
      codeChallenge: mobileState.codeChallenge,
    }, redis);
    return res.redirect(appendQuery(mobileState.mobileRedirectUri || webCallbackUrl(), { code, provider, state: mobileState.clientState }));
  }

  // Legacy hand-off (token in the link) — only until OAUTH_REQUIRE_PKCE=true.
  const redirectUrl = buildOAuthSuccessRedirect({ req, provider, token, refreshToken, tenantId });
  return res.redirect(redirectUrl);
};

/**
 * POST /api/auth/oauth/exchange   { code, code_verifier }
 * Redeems the one-time code from a PKCE mobile sign-in for the tokens.
 * Single use, 60 seconds; the code is consumed even when the verifier is wrong.
 */
router.post('/oauth/exchange', authLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { code, code_verifier: codeVerifier } = req.body || {};
  try {
    const result = await redeemHandoff({ code, codeVerifier }, redis);
    if (!result.ok) {
      return res.status(400).json({ success: false, code: result.code, message: 'This sign-in has expired or was already used. Please sign in again.' });
    }
    return res.json({ success: true, ...result.tokens });
  } catch (error) {
    console.error('OAuth hand-off exchange failed:', error.message);
    return res.status(503).json({ success: false, code: 'HANDOFF_UNAVAILABLE', message: 'Sign-in could not be completed. Please try again.' });
  }
});

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
  const { state, error, mobileRedirectUri, clientState } = buildMobileState(req);
  if (error) return res.redirect(startErrorRedirect({ error, mobileRedirectUri, clientState, provider: 'facebook' }));
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
        return Promise.resolve(handleOAuthProviderSuccess(req, res, 'facebook')).catch((error) => {
          console.error('Patient Facebook OAuth hand-off error:', error.message);
          if (!res.headersSent) res.redirect(buildOAuthErrorRedirect({ req, provider: 'facebook' }));
        });
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
  const { state, error, mobileRedirectUri, clientState } = buildMobileState(req);
  if (error) return res.redirect(startErrorRedirect({ error, mobileRedirectUri, clientState, provider: 'google' }));
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
        return Promise.resolve(handleOAuthProviderSuccess(req, res, 'google')).catch((error) => {
          console.error('Patient Google OAuth hand-off error:', error.message);
          if (!res.headersSent) res.redirect(buildOAuthErrorRedirect({ req, provider: 'google' }));
        });
      } catch (error) {
        console.error('Patient Google OAuth success handler error:', error);
        const redirectUrl = buildOAuthErrorRedirect({ req, provider: 'google' });
        return res.redirect(redirectUrl);
      }
    })(req, res, next);
  }
);

export default router;
