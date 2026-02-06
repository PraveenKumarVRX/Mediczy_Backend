/**
 * Authentication & Authorization Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/auth/exchange - Exchange external token
 * - POST /v1/auth/refresh - Refresh access token
 * - POST /v1/auth/revoke - Revoke token
 */

import express from 'express';
import { verifyToken } from '../middleware/api-auth.js';
import * as authController from '../controllers/api-v1/AuthController.js';

const router = express.Router();

/**
 * POST /v1/auth/exchange
 * Exchange external OIDC token for Mediqzy access token
 */
router.post('/exchange',
  authController.exchangeToken
);

/**
 * POST /v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh',
  authController.refreshToken
);

/**
 * POST /v1/auth/revoke
 * Revoke access token (logout)
 */
router.post('/revoke',
  verifyToken,
  authController.revokeToken
);

export default router;
