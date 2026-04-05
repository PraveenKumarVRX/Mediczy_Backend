/**
 * Labs Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: April 4, 2026 - Extended with categories, partners, slots, cancel, report, payment
 *
 * Endpoints:
 * GET    /v1/{tenant-id}/labs/categories               - List test categories
 * GET    /v1/{tenant-id}/labs/tests                    - List available tests
 * GET    /v1/{tenant-id}/labs/tests/:testId             - Get test details
 * GET    /v1/{tenant-id}/labs/partners                 - List lab partner centers
 * GET    /v1/{tenant-id}/labs/slots                    - Available collection time slots
 * POST   /v1/{tenant-id}/labs/bookings                 - Book a lab test
 * GET    /v1/{tenant-id}/labs/bookings                 - List bookings
 * GET    /v1/{tenant-id}/labs/bookings/:bookingId       - Booking details
 * PUT    /v1/{tenant-id}/labs/bookings/:bookingId/status - Update booking status
 * POST   /v1/{tenant-id}/labs/bookings/:bookingId/cancel - Cancel booking
 * POST   /v1/{tenant-id}/labs/bookings/:bookingId/report - Upload report (lab/admin)
 * GET    /v1/{tenant-id}/labs/bookings/:bookingId/report - Download/view report
 * POST   /v1/{tenant-id}/labs/bookings/:bookingId/payment - Initiate payment
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { labsValidation, handleValidationErrors } from '../middleware/validation.js';
import * as labsController from '../controllers/api-v1/LabsController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

// -------------------------------------------------------
// Test catalog
// -------------------------------------------------------

/**
 * GET /labs/categories
 */
router.get('/categories',
  requireScopes('labs.read'),
  labsController.listCategories
);

/**
 * GET /labs/tests
 * List available lab tests (catalog)
 */
router.get('/tests',
  requireScopes('labs.read'),
  labsController.listTests
);

/**
 * GET /labs/tests/:testId
 * Get a single test's details
 */
router.get('/tests/:testId',
  requireScopes('labs.read'),
  labsController.getTest
);

// -------------------------------------------------------
// Partners & slots
// -------------------------------------------------------

/**
 * GET /labs/partners
 * List lab partner/collection centers
 */
router.get('/partners',
  requireScopes('labs.read'),
  labsController.listPartners
);

/**
 * GET /labs/slots
 * Available sample-collection time slots
 * Query: date, collection_type, partner_id
 */
router.get('/slots',
  requireScopes('labs.read'),
  labsController.getSlots
);

// -------------------------------------------------------
// Bookings
// -------------------------------------------------------

/**
 * POST /labs/bookings
 * Book lab test
 */
router.post('/bookings',
  requireScopes('labs.write'),
  labsValidation.createBooking,
  handleValidationErrors,
  labsController.createBooking
);

/**
 * GET /labs/bookings
 * List lab bookings
 */
router.get('/bookings',
  requireScopes('labs.read'),
  labsController.listBookings
);

/**
 * GET /labs/bookings/:bookingId
 * Get booking details
 */
router.get('/bookings/:bookingId',
  requireScopes('labs.read'),
  labsController.getBooking
);

/**
 * PUT /labs/bookings/:bookingId/status
 * Update booking status (admin/lab use)
 */
router.put('/bookings/:bookingId/status',
  requireScopes('labs.write'),
  labsController.updateStatus
);

/**
 * POST /labs/bookings/:bookingId/cancel
 * Cancel a booking
 */
router.post('/bookings/:bookingId/cancel',
  requireScopes('labs.write'),
  labsController.cancelBooking
);

/**
 * POST /labs/bookings/:bookingId/report
 * Upload lab report (admin/lab)
 */
router.post('/bookings/:bookingId/report',
  requireScopes('labs.write'),
  labsValidation.uploadReport,
  handleValidationErrors,
  labsController.uploadReport
);

/**
 * GET /labs/bookings/:bookingId/report
 * Get/download lab report for a completed booking
 */
router.get('/bookings/:bookingId/report',
  requireScopes('labs.read'),
  labsController.getReport
);

/**
 * POST /labs/bookings/:bookingId/payment
 * Initiate payment for a booking
 */
router.post('/bookings/:bookingId/payment',
  requireScopes('labs.write'),
  labsController.initiatePayment
);

export default router;
