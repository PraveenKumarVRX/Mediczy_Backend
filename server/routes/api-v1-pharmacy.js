/**
 * Pharmacy Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/pharmacy/prescriptions - Create prescription
 * - POST /v1/{tenant-id}/pharmacy/orders - Create medicine order
 * - GET /v1/{tenant-id}/pharmacy/orders - List orders
 * - GET /v1/{tenant-id}/pharmacy/orders/:orderId - Order details
 * - PUT /v1/{tenant-id}/pharmacy/orders/:orderId/status - Update status
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { pharmacyValidation, handleValidationErrors } from '../middleware/validation.js';
import * as pharmacyController from '../controllers/api-v1/PharmacyController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/pharmacy/prescriptions
 * Create a prescription (doctors only)
 */
router.post('/prescriptions',
  requireScopes('pharmacy.prescribe'),
  pharmacyValidation.createPrescription,
  handleValidationErrors,
  pharmacyController.createPrescription
);

/**
 * POST /v1/{tenant-id}/pharmacy/orders
 * Create medicine order
 */
router.post('/orders',
  requireScopes('pharmacy.write'),
  pharmacyValidation.createOrder,
  handleValidationErrors,
  pharmacyController.createOrder
);

/**
 * GET /v1/{tenant-id}/pharmacy/orders
 * List pharmacy orders
 */
router.get('/orders',
  requireScopes('pharmacy.read'),
  pharmacyController.listOrders
);

/**
 * GET /v1/{tenant-id}/pharmacy/orders/:orderId
 * Get order details
 */
router.get('/orders/:orderId',
  requireScopes('pharmacy.read'),
  pharmacyController.getOrder
);

/**
 * PUT /v1/{tenant-id}/pharmacy/orders/:orderId/status
 * Update order status
 */
router.put('/orders/:orderId/status',
  requireScopes('pharmacy.write'),
  pharmacyController.updateOrderStatus
);

export default router;
