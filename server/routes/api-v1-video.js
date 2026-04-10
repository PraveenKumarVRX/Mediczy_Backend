/**
 * Video Consultation Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/video/token - Generate video room token
 * - GET /v1/{tenant-id}/video/room/:roomId - Get room status
 * - POST /v1/{tenant-id}/video/room/:roomId/end - End video call
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import * as videoController from '../controllers/api-v1/VideoController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/video/token
 * Generate LiveKit access token for video consultation
 */
router.post('/token',
  requireScopes('consultations.video'),
  videoController.generateToken
);

/**
 * GET /v1/{tenant-id}/video/room/:roomId
 * Get video room status
 */
router.get('/room/:roomId',
  requireScopes('consultations.video'),
  videoController.getRoomStatus
);

/**
 * POST /v1/{tenant-id}/video/room/:roomId/end
 * End video consultation
 */
router.post('/room/:roomId/end',
  requireScopes('consultations.video'),
  videoController.endVideoCall
);

export default router;
