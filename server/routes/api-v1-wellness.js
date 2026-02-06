/**
 * Wellness & HRA Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/wellness/hra - Create HRA assessment
 * - GET /v1/{tenant-id}/wellness/hra - List HRA assessments
 * - GET /v1/{tenant-id}/wellness/hra/:assessmentId - Get HRA details
 * - GET /v1/{tenant-id}/wellness/plans - List wellness plans
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { wellnessValidation, handleValidationErrors } from '../middleware/validation.js';
import * as wellnessController from '../controllers/api-v1/WellnessController.js';

const router = express.Router();

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/wellness/hra
 * Create health risk assessment
 */
router.post('/hra',
  requireScopes('wellness.write'),
  wellnessValidation.createHRA,
  handleValidationErrors,
  wellnessController.createHRA
);

/**
 * GET /v1/{tenant-id}/wellness/hra
 * List health risk assessments
 */
router.get('/hra',
  requireScopes('wellness.read'),
  wellnessController.listHRAs
);

/**
 * GET /v1/{tenant-id}/wellness/hra/:assessmentId
 * Get HRA assessment details
 */
router.get('/hra/:assessmentId',
  requireScopes('wellness.read'),
  wellnessController.getHRA
);

/**
 * GET /v1/{tenant-id}/wellness/plans
 * List wellness plans (catalog)
 */
router.get('/plans',
  requireScopes('wellness.read'),
  wellnessController.listWellnessPlans
);

export default router;
