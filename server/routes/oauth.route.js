/**
 * OAuth 2.0 SSO Routes for Rocket.Chat Integration
 * 
 * Endpoints:
 * - GET  /oauth/authorize    - Authorization endpoint (user authorization)
 * - POST /oauth/token        - Token endpoint (code->token exchange)
 * - GET  /oauth/userinfo     - Userinfo endpoint (token->user profile)
 */

import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { authUser } from '../middleware/auth.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel from '../models/postgres/user.model.postgres.js';
import oauthTokenService from '../services/oauth-token.service.js';
import {
  validateOAuthClient,
  validateRedirectUri,
  getClientScopes
} from '../db/oauth-clients.js';

const router = express.Router();

// ============================================================================
// AUTHORIZATION ENDPOINT (Step 1 - User Authorization)
// ============================================================================

/**
 * GET /oauth/authorize
 * User authorization endpoint - redirects to login if needed, then issues auth code
 * 
 * Query Parameters:
 * - client_id: OAuth client ID
 * - redirect_uri: Where to redirect after authorization
 * - response_type: must be 'code'
 * - scope: space-separated scopes (optional)
 * - state: CSRF protection parameter (recommended)
 * 
 * Example:
 * https://app.mediqzy.com/oauth/authorize?
 *   client_id=rocketchat&
 *   redirect_uri=http://localhost:3100/_oauth/mediqzy&
 *   response_type=code&
 *   scope=openid%20email%20profile&
 *   state=abc123
 */
router.get('/authorize', authUser, async (req, res) => {
  try {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    // ✅ Step 1: Validate request parameters
    if (!client_id || !redirect_uri || response_type !== 'code') {
      console.warn(`❌ OAuth: Invalid authorization request`);
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing or invalid parameters'
      });
    }

    // ✅ Step 2: Validate OAuth client
    const client = validateOAuthClient(client_id);
    if (!client) {
      console.warn(`❌ OAuth: Unknown client: ${client_id}`);
      return res.status(401).json({
        error: 'unauthorized_client',
        error_description: 'Client not registered'
      });
    }

    // ✅ Step 3: Validate redirect URI
    if (!validateRedirectUri(client_id, redirect_uri)) {
      console.warn(`❌ OAuth: Invalid redirect_uri: ${redirect_uri}`);
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Redirect URI not allowed'
      });
    }

    // ✅ Step 4: Get current user (already authenticated by authUser middleware)
    const user = req.user;
    if (!user || !user.id) {
      return res.status(403).json({
        error: 'access_denied',
        error_description: 'User not authenticated'
      });
    }

    // ✅ Step 5: Get requested scopes
    const requestedScopes = scope ? scope.split(' ') : [];
    const allowedScopes = getClientScopes(client_id);
    const approvedScopes = requestedScopes.filter(s => allowedScopes.includes(s)) || allowedScopes;

    // ✅ Step 6: Generate authorization code
    const authCode = await oauthTokenService.generateAuthorizationCode(
      user,
      client_id,
      redirect_uri,
      approvedScopes
    );

    // ✅ Step 7: Redirect to client with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.append('code', authCode);
    if (state) {
      redirectUrl.searchParams.append('state', state);
    }

    console.log(`✅ OAuth: User ${user.email} authorized, redirecting to ${redirect_uri}`);
    return res.redirect(redirectUrl.toString());

  } catch (error) {
    console.error('❌ OAuth authorize error:', error.message);
    return res.status(500).json({
      error: 'server_error',
      error_description: error.message
    });
  }
});

// ============================================================================
// TOKEN ENDPOINT (Step 2 - Code to Token Exchange)
// ============================================================================

/**
 * POST /oauth/token
 * Token endpoint - exchanges authorization code for access token
 * 
 * Body (form-urlencoded):
 * - grant_type: 'authorization_code'
 * - code: authorization code from /authorize
 * - redirect_uri: must match original redirect_uri
 * - client_id: OAuth client ID
 * - client_secret: OAuth client secret (for confidential clients)
 * 
 * Example Request:
 * POST /oauth/token HTTP/1.1
 * Content-Type: application/x-www-form-urlencoded
 * 
 * grant_type=authorization_code&
 * code=ABC123&
 * redirect_uri=http://localhost:3100/_oauth/mediqzy&
 * client_id=rocketchat&
 * client_secret=secret123
 * 
 * Response:
 * {
 *   "access_token": "eyJhbGc...",
 *   "token_type": "Bearer",
 *   "expires_in": 3600,
 *   "scope": "openid email profile"
 * }
 */
router.post('/token', async (req, res) => {
  try {
    const { grant_type, code, redirect_uri, client_id, client_secret } = req.body;

    // ✅ Step 1: Validate request
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant supported'
      });
    }

    if (!code || !client_id || !redirect_uri) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }

    // ✅ Step 2: Validate OAuth client
    const client = validateOAuthClient(client_id, client_secret);
    if (!client) {
      console.warn(`❌ OAuth: Token endpoint - invalid credentials for ${client_id}`);
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client authentication failed'
      });
    }

    // ✅ Step 3: Exchange code for token
    const tokenResponse = await oauthTokenService.exchangeCodeForToken(
      code,
      client_id,
      redirect_uri
    );

    console.log(`✅ OAuth: Token issued for client ${client_id}`);
    return res.json(tokenResponse);

  } catch (error) {
    console.error('❌ OAuth token error:', error.message);
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: error.message
    });
  }
});

// ============================================================================
// USERINFO ENDPOINT (Step 3 - Fetch User Profile)
// ============================================================================

/**
 * GET /oauth/userinfo
 * Userinfo endpoint - returns authenticated user profile
 * 
 * Headers:
 * - Authorization: Bearer <access_token>
 * 
 * Response:
 * {
 *   "sub": "user_123",
 *   "email": "user@example.com",
 *   "username": "username",
 *   "name": "John Doe"
 * }
 */
router.get('/userinfo', async (req, res) => {
  try {
    // ✅ Step 1: Extract token from Authorization header
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/);

    if (!match || !match[1]) {
      console.warn(`❌ OAuth: Missing or invalid Authorization header`);
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing or invalid token'
      });
    }

    const token = match[1];

    // ✅ Step 2: Validate token
    const payload = oauthTokenService.validateAccessToken(token);

    // ✅ Step 3: Fetch user from Postgres
    const user = await userModel.findByPk(payload.sub);

    if (!user) {
      console.warn(`❌ OAuth: User not found: ${payload.sub}`);
      return res.status(404).json({
        error: 'user_not_found',
        error_description: 'User profile not found'
      });
    }

    // ✅ Step 4: Return user profile (OpenID Connect format)
    const userProfile = {
      sub: user.id.toString(),
      email: user.email,
      email_verified: user.emailVerified || false,
      username: user.username,
      name: `${user.firstName} ${user.lastName}`.trim(),
      given_name: user.firstName,
      family_name: user.lastName,
      phone_number: user.phoneNumber || null,
      updated_at: Math.floor(user.updatedAt.getTime() / 1000)
    };

    console.log(`✅ OAuth: Userinfo retrieved for ${user.email}`);
    return res.json(userProfile);

  } catch (error) {
    console.error('❌ OAuth userinfo error:', error.message);

    if (error.message === 'Invalid or expired token') {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Token is invalid or expired'
      });
    }

    return res.status(500).json({
      error: 'server_error',
      error_description: error.message
    });
  }
});

// ============================================================================
// METADATA ENDPOINTS (Optional but useful)
// ============================================================================

/**
 * GET /oauth/.well-known/oauth-authorization-server
 * OAuth server metadata (helps OAuth clients auto-configure)
 */
router.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

  return res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    scopes_supported: ['openid', 'email', 'profile'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post']
  });
});

/**
 * GET /oauth/.well-known/openid-configuration
 * OpenID Connect metadata
 */
router.get('/.well-known/openid-configuration', (req, res) => {
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

  return res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    scopes_supported: ['openid', 'email', 'profile'],
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256', 'RS256'],
    claims_supported: ['sub', 'email', 'email_verified', 'name', 'given_name', 'family_name', 'username']
  });
});

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
router.get('/facebook', passport.authenticate('facebook', {
  scope: ['email', 'public_profile'],
  session: false
}));

/**
 * GET /api/auth/facebook/callback
 * Facebook OAuth2 callback for patients
 */
router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=facebook_auth_failed' }),
  (req, res) => {
    try {
      const { user } = req.user;
      const token = jwt.sign(
        {
          id: user.id,
          userId: user.id,
          email: user.email,
          role: user.role || 'patient',
          userType: user.userType || 'patient',
          firstName: user.firstName,
          lastName: user.lastName
        },
        JWT_CONFIG.SECRET || process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      const redirectUrl = process.env.NODE_ENV === 'production'
        ? `https://app.mediqzy.com/oauth-callback?token=${token}&userType=patient&provider=facebook`
        : `http://localhost:5173/oauth-callback?token=${token}&userType=patient&provider=facebook`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Patient Facebook OAuth success handler error:', error);
      res.redirect('/login?error=oauth_failed');
    }
  }
);

/**
 * GET /api/auth/google
 * Initiates Google OAuth2 login for patients
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false
}));

/**
 * GET /api/auth/google/callback
 * Google OAuth2 callback for patients
 */
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_auth_failed' }),
  (req, res) => {
    try {
      const { user } = req.user;
      const token = jwt.sign(
        {
          id: user.id,
          userId: user.id,
          email: user.email,
          role: user.role || 'patient',
          userType: user.userType || 'patient',
          firstName: user.firstName,
          lastName: user.lastName
        },
        JWT_CONFIG.SECRET || process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      const redirectUrl = process.env.NODE_ENV === 'production'
        ? `https://app.mediqzy.com/oauth-callback?token=${token}&userType=patient&provider=google`
        : `http://localhost:5173/oauth-callback?token=${token}&userType=patient&provider=google`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Patient Google OAuth success handler error:', error);
      res.redirect('/login?error=oauth_failed');
    }
  }
);

export default router;
