import express from 'express';
import passport from '../config/oauth.config.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const router = express.Router();

/**
 * OAuth2 Routes for Mediczy
 * 
 * Endpoints:
 * - GET /api/auth/google - Initiate Google OAuth2 flow
 * - GET /api/auth/google/callback - Google OAuth2 callback
 * - GET /api/auth/facebook - Initiate Facebook OAuth2 flow
 * - GET /api/auth/facebook/callback - Facebook OAuth2 callback
 */

/**
 * Generate JWT token for authenticated user
 * FIXED: Use JWT_SECRET (JWT_CONFIG.SECRET) and include required id/role fields
 */
function generateToken(user) {
  const payload = {
    id: user.id,         // Required for authUser middleware
    userId: user.id,
    email: user.email,
    role: 'user',        // Required for authUser middleware role check
    userType: 'user',
    firstName: user.firstName,
    lastName: user.lastName
  };
  
  return jwt.sign(payload, JWT_CONFIG.SECRET || process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
}

/**
 * Handle successful OAuth authentication
 */
function handleOAuthSuccess(req, res, userData, provider) {
  try {
    const { user, accessToken, refreshToken } = userData;
    
    // Generate JWT token for our application
    const token = generateToken(user);
    
    console.log(`✅ ${provider} OAuth successful for: ${user.email}`);
    
    // Store OAuth tokens if needed for later API calls
    // For now, we'll just log them
    console.log(`${provider} Access Token available for user ${user.id}`);
    
    // Redirect to frontend with token
    const redirectUrl = process.env.NODE_ENV === 'production'
      ? `https://app.mediqzy.com/oauth-callback?token=${token}&userType=user&provider=${provider}`
      : `http://localhost:3001/oauth-callback?token=${token}&userType=user&provider=${provider}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error(`Error handling ${provider} OAuth success:`, error);
    const errorUrl = process.env.NODE_ENV === 'production'
      ? `https://mediqzy.com/login?error=oauth_failed&provider=${provider}`
      : `http://localhost:3001/login?error=oauth_failed&provider=${provider}`;
    res.redirect(errorUrl);
  }
}

/**
 * Handle OAuth authentication failure
 */
function handleOAuthFailure(provider, error, res) {
  console.error(`❌ ${provider} OAuth failed:`, error);
  const errorUrl = process.env.NODE_ENV === 'production'
    ? `https://mediqzy.com/login?error=${error.message || 'oauth_failed'}&provider=${provider}`
    : `http://localhost:3001/login?error=${error.message || 'oauth_failed'}&provider=${provider}`;
  res.redirect(errorUrl);
}

// ==================== GOOGLE OAUTH2 ====================

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth2 authentication
 *     description: Redirects user to Google login page
 *     tags: [OAuth2]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth2 consent screen
 */
router.get(
  '/google',
  (req, res, next) => {
    console.log('🔵 Initiating Google OAuth flow...');
    next();
  },
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  })
);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth2 callback endpoint
 *     description: Handles callback from Google after user authentication
 *     tags: [OAuth2]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *     responses:
 *       302:
 *         description: Redirect to frontend with JWT token
 */
router.get(
  '/google/callback',
  (req, res, next) => {
    console.log('🔵 Google OAuth callback received');
    console.log('Query params:', req.query);
    next();
  },
  passport.authenticate('google', { 
    session: false,
    failureRedirect: '/login?error=google_auth_failed'
  }),
  (req, res) => {
    console.log('✅ Google OAuth authentication successful');
    handleOAuthSuccess(req, res, req.user, 'google');
  }
);

// ==================== FACEBOOK OAUTH2 ====================

/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: Initiate Facebook OAuth2 authentication
 *     description: Redirects user to Facebook login page
 *     tags: [OAuth2]
 *     responses:
 *       302:
 *         description: Redirect to Facebook OAuth2 consent screen
 */
router.get(
  '/facebook',
  passport.authenticate('facebook', { 
    scope: ['email', 'public_profile'],
    session: false 
  })
);

/**
 * @swagger
 * /api/auth/facebook/callback:
 *   get:
 *     summary: Facebook OAuth2 callback endpoint
 *     description: Handles callback from Facebook after user authentication
 *     tags: [OAuth2]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Facebook
 *     responses:
 *       302:
 *         description: Redirect to frontend with JWT token
 */
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { 
    session: false,
    failureRedirect: '/login?error=facebook_auth_failed'
  }),
  (req, res) => {
    handleOAuthSuccess(req, res, req.user, 'facebook');
  }
);

// ==================== OAUTH STATUS ENDPOINT ====================

/**
 * @swagger
 * /api/auth/oauth/status:
 *   get:
 *     summary: Check OAuth2 configuration status
 *     description: Returns which OAuth providers are configured and available
 *     tags: [OAuth2]
 *     responses:
 *       200:
 *         description: OAuth configuration status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 google:
 *                   type: object
 *                   properties:
 *                     configured:
 *                       type: boolean
 *                     url:
 *                       type: string
 *                 facebook:
 *                   type: object
 *                   properties:
 *                     configured:
 *                       type: boolean
 *                     url:
 *                       type: string
 */
router.get('/oauth/status', (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://mediqzy.com'
    : 'http://localhost:8000';
  
  res.json({
    google: {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      url: `${baseUrl}/api/auth/google`,
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    },
    facebook: {
      configured: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
      url: `${baseUrl}/api/auth/facebook`,
      enabled: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET)
    }
  });
});

export default router;
