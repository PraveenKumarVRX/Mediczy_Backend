/**
 * User Management Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/users - Create user profile
 * - GET /v1/{tenant-id}/users/:userId - Get user profile
 * - PUT /v1/{tenant-id}/users/:userId - Update user profile
 * - GET /v1/{tenant-id}/users/:userId/health-profile - Get health profile
 * - PUT /v1/{tenant-id}/users/:userId/health-profile - Update health profile
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import * as usersController from '../controllers/api-v1/UsersController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes  
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/users
 * Create or update user profile
 */
router.post('/',
  usersController.createOrUpdateUser
);

/**
 * GET /v1/{tenant-id}/users/:userId
 * Get user profile
 */
router.get('/:userId',
  requireScopes('users.read'),
  usersController.getUserProfile
);

/**
 * PUT /v1/{tenant-id}/users/:userId
 * Update user profile
 */
router.put('/:userId',
  requireScopes('users.write'),
  usersController.updateUserProfile
);

/**
 * GET /v1/{tenant-id}/users/:userId/health-profile
 * Get health profile
 */
router.get('/:userId/health-profile',
  requireScopes('users.read'),
  usersController.getHealthProfile
);

/**
 * PUT /v1/{tenant-id}/users/:userId/health-profile
 * Update health profile
 */
router.put('/:userId/health-profile',
  requireScopes('users.write'),
  usersController.updateHealthProfile
);

export default router;
