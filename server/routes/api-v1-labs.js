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
 * GET    /v1/{tenant-id}/labs/bookings/:bookingId/payment - Get payment details
 * PUT    /v1/{tenant-id}/labs/bookings/:bookingId/payment - Update payment status
 * GET    /v1/{tenant-id}/labs/billing/work-queue - Pending billing action queue
 * GET    /v1/{tenant-id}/labs/billing/centralized-summary - Aggregated billing summary
 * POST   /v1/{tenant-id}/labs/bookings/:bookingId/ip-credit/apply - Apply IP credit
 * POST   /v1/{tenant-id}/labs/bookings/:bookingId/ip-credit/settle - Settle IP credit
 * GET    /v1/{tenant-id}/labs/ip-credit/ledger - IP credit ledger
 * POST   /v1/{tenant-id}/labs/home-collection/jobs        - Create home-collection execution job
 * GET    /v1/{tenant-id}/labs/home-collection/jobs        - List home-collection jobs
 * GET    /v1/{tenant-id}/labs/home-collection/jobs/:jobId - Get home-collection job details
 * POST   /v1/{tenant-id}/labs/home-collection/jobs/:jobId/assign - Assign phlebotomist
 * PUT    /v1/{tenant-id}/labs/home-collection/jobs/:jobId/status - Update collection lifecycle status
 * GET    /v1/{tenant-id}/labs/home-collection/jobs/:jobId/events - Job event timeline
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { labsValidation, handleValidationErrors } from '../middleware/validation.js';
import * as labsController from '../controllers/api-v1/LabsController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

const hasScopeMatch = (userScope, requiredScope) => {
  if (!userScope || !requiredScope) return false;
  if (userScope.endsWith('.*')) {
    const prefix = userScope.substring(0, userScope.length - 2);
    return requiredScope.startsWith(prefix);
  }
  return userScope === requiredScope;
};

const requireBillingOpsAccess = (mode = 'read') => (req, res, next) => {
  const role = (req.role || '').toLowerCase();
  const privilegedRoles = new Set(['admin', 'super_admin', 'finance_admin']);
  if (privilegedRoles.has(role)) return next();

  const userScopes = Array.isArray(req.scopes) ? req.scopes : [];
  const requiredScopes = mode === 'write'
    ? ['labs.billing.write', 'labs.finance.write', 'labs.billing.manage']
    : ['labs.billing.read', 'labs.finance.read', 'labs.billing.view'];

  const hasRequiredScope = requiredScopes.some((requiredScope) =>
    userScopes.some((userScope) => hasScopeMatch(userScope, requiredScope))
  );

  if (!hasRequiredScope) {
    return res.status(403).json({
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Billing Ops requires one of: ${requiredScopes.join(', ')}`,
      },
    });
  }

  return next();
};

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
  requireBillingOpsAccess('write'),
  labsValidation.initiatePayment,
  handleValidationErrors,
  labsController.initiatePayment
);

/**
 * GET /labs/bookings/:bookingId/payment
 * Get payment status/details for a booking
 */
router.get('/bookings/:bookingId/payment',
  requireScopes('labs.read'),
  requireBillingOpsAccess('read'),
  labsController.getPayment
);

/**
 * PUT /labs/bookings/:bookingId/payment
 * Update payment status for a booking
 */
router.put('/bookings/:bookingId/payment',
  requireScopes('labs.write'),
  requireBillingOpsAccess('write'),
  labsValidation.updatePaymentStatus,
  handleValidationErrors,
  labsController.updatePaymentStatus
);

/**
 * GET /labs/billing/work-queue
 * List finance queue for unpaid/failed/credit-pending bookings
 */
router.get('/billing/work-queue',
  requireScopes('labs.read'),
  requireBillingOpsAccess('read'),
  labsController.listBillingWorkQueue
);

/**
 * GET /labs/billing/centralized-summary
 * Aggregated summary grouped by partner/date/collection_type
 */
router.get('/billing/centralized-summary',
  requireScopes('labs.read'),
  requireBillingOpsAccess('read'),
  labsController.getCentralizedBillingSummary
);

/**
 * POST /labs/bookings/:bookingId/ip-credit/apply
 * Add booking amount to IP credit outstanding
 */
router.post('/bookings/:bookingId/ip-credit/apply',
  requireScopes('labs.write'),
  requireBillingOpsAccess('write'),
  labsValidation.applyIpCredit,
  handleValidationErrors,
  labsController.applyIpCredit
);

/**
 * POST /labs/bookings/:bookingId/ip-credit/settle
 * Settle an amount from IP credit outstanding
 */
router.post('/bookings/:bookingId/ip-credit/settle',
  requireScopes('labs.write'),
  requireBillingOpsAccess('write'),
  labsValidation.settleIpCredit,
  handleValidationErrors,
  labsController.settleIpCredit
);

/**
 * GET /labs/ip-credit/ledger
 * List IP credit ledger movements
 */
router.get('/ip-credit/ledger',
  requireScopes('labs.read'),
  requireBillingOpsAccess('read'),
  labsController.listIpCreditLedger
);

// -------------------------------------------------------
// Home Collection Operations
// -------------------------------------------------------

/**
 * POST /labs/home-collection/jobs
 * Create home-collection execution job for a booking
 */
router.post('/home-collection/jobs',
  requireScopes('labs.write'),
  labsValidation.createHomeCollectionJob,
  handleValidationErrors,
  labsController.createHomeCollectionJob
);

/**
 * GET /labs/home-collection/jobs
 * List home collection jobs
 */
router.get('/home-collection/jobs',
  requireScopes('labs.read'),
  labsController.listHomeCollectionJobs
);

/**
 * GET /labs/home-collection/jobs/:jobId
 * Get home collection job
 */
router.get('/home-collection/jobs/:jobId',
  requireScopes('labs.read'),
  labsController.getHomeCollectionJob
);

/**
 * POST /labs/home-collection/jobs/:jobId/assign
 * Assign phlebotomist
 */
router.post('/home-collection/jobs/:jobId/assign',
  requireScopes('labs.write'),
  labsValidation.assignPhlebotomist,
  handleValidationErrors,
  labsController.assignHomeCollectionPhlebotomist
);

/**
 * PUT /labs/home-collection/jobs/:jobId/status
 * Update lifecycle status
 */
router.put('/home-collection/jobs/:jobId/status',
  requireScopes('labs.write'),
  labsValidation.updateHomeCollectionJobStatus,
  handleValidationErrors,
  labsController.updateHomeCollectionJobStatus
);

/**
 * GET /labs/home-collection/jobs/:jobId/events
 * List immutable event timeline
 */
router.get('/home-collection/jobs/:jobId/events',
  requireScopes('labs.read'),
  labsController.listHomeCollectionEvents
);

export default router;
