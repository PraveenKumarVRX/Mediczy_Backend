/**
 * Homecare Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - GET /v1/{tenant-id}/homecare/services - List homecare services
 * - POST /v1/{tenant-id}/homecare/bookings - Book homecare service
 * - GET /v1/{tenant-id}/homecare/bookings - List bookings
 * - GET /v1/{tenant-id}/homecare/bookings/:bookingId - Booking details
 * - PUT /v1/{tenant-id}/homecare/bookings/:bookingId - Update booking
 * - POST /v1/{tenant-id}/homecare/bookings/:bookingId/assign - Assign professional
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { homecareValidation, handleValidationErrors } from '../middleware/validation.js';
import * as homecareController from '../controllers/api-v1/HomecareController.js';

const router = express.Router();

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * GET /v1/{tenant-id}/homecare/services
 * List homecare services (catalog)
 */
router.get('/services',
  requireScopes('homecare.read'),
  homecareController.listServices
);

/**
 * POST /v1/{tenant-id}/homecare/bookings
 * Book homecare service
 */
router.post('/bookings',
  requireScopes('homecare.write'),
  homecareValidation.createBooking,
  handleValidationErrors,
  homecareController.createBooking
);

/**
 * GET /v1/{tenant-id}/homecare/bookings  
 * List homecare bookings
 */
router.get('/bookings',
  requireScopes('homecare.read'),
  homecareController.listBookings
);

/**
 * GET /v1/{tenant-id}/homecare/bookings/:bookingId
 * Get booking details
 */
router.get('/bookings/:bookingId',
  requireScopes('homecare.read'),
  homecareController.getBooking
);

/**
 * PUT /v1/{tenant-id}/homecare/bookings/:bookingId
 * Update booking
 */
router.put('/bookings/:bookingId',
  requireScopes('homecare.write'),
  homecareController.updateBooking
);

/**
 * POST /v1/{tenant-id}/homecare/bookings/:bookingId/assign
 * Assign professional to booking
 */
router.post('/bookings/:bookingId/assign',
  requireScopes('homecare.write'),
  homecareController.assignProfessional
);

export default router;
