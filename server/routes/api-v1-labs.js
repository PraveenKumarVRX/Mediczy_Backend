/**
 * Labs Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - GET /v1/{tenant-id}/labs/tests - List available tests
 * - POST /v1/{tenant-id}/labs/bookings - Book lab test
 * - GET /v1/{tenant-id}/labs/bookings - List bookings
 * - GET /v1/{tenant-id}/labs/bookings/:bookingId - Booking details
 * - PUT /v1/{tenant-id}/labs/bookings/:bookingId/status - Update status
 * - POST /v1/{tenant-id}/labs/bookings/:bookingId/report - Upload report
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { labsValidation, handleValidationErrors } from '../middleware/validation.js';
import * as labsController from '../controllers/api-v1/LabsController.js';

const router = express.Router();

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * GET /v1/{tenant-id}/labs/tests
 * List available lab tests (catalog)
 */
router.get('/tests',
  requireScopes('labs.read'),
  labsController.listTests
);

/**
 * POST /v1/{tenant-id}/labs/bookings
 * Book lab test
 */
router.post('/bookings',
  requireScopes('labs.write'),
  labsValidation.createBooking,
  handleValidationErrors,
  labsController.createBooking
);

/**
 * GET /v1/{tenant-id}/labs/bookings
 * List lab bookings
 */
router.get('/bookings',
  requireScopes('labs.read'),
  labsController.listBookings
);

/**
 * GET /v1/{tenant-id}/labs/bookings/:bookingId
 * Get booking details
 */
router.get('/bookings/:bookingId',
  requireScopes('labs.read'),
  labsController.getBooking
);

/**
 * PUT /v1/{tenant-id}/labs/bookings/:bookingId/status
 * Update booking status
 */
router.put('/bookings/:bookingId/status',
  requireScopes('labs.write'),
  labsController.updateStatus
);

/**
 * POST /v1/{tenant-id}/labs/bookings/:bookingId/report
 * Upload lab report
 */
router.post('/bookings/:bookingId/report',
  requireScopes('labs.write'),
  labsValidation.uploadReport,
  handleValidationErrors,
  labsController.uploadReport
);

export default router;
