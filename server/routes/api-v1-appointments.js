/**
 * Appointments Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/appointments - Create appointment
 * - GET /v1/{tenant-id}/appointments - List appointments
 * - GET /v1/{tenant-id}/appointments/:appointmentId - Get appointment details
 * - PUT /v1/{tenant-id}/appointments/:appointmentId/reschedule - Reschedule
 * - POST /v1/{tenant-id}/appointments/:appointmentId/cancel - Cancel
 * - POST /v1/{tenant-id}/appointments/:appointmentId/complete - Mark complete
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { appointmentsValidation, handleValidationErrors } from '../middleware/validation.js';
import * as appointmentsController from '../controllers/api-v1/AppointmentsController.js';

const router = express.Router();

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/appointments
 * Create new appointment
 */
router.post('/',
  requireScopes('appointments.write'),
  appointmentsValidation.createAppointment,
  handleValidationErrors,
  appointmentsController.createAppointment
);

/**
 * GET /v1/{tenant-id}/appointments
 * List appointments with filters
 */
router.get('/',
  requireScopes('appointments.read'),
  appointmentsController.listAppointments
);

/**
 * GET /v1/{tenant-id}/appointments/:appointmentId
 * Get appointment details
 */
router.get('/:appointmentId',
  requireScopes('appointments.read'),
  appointmentsController.getAppointment
);

/**
 * PUT /v1/{tenant-id}/appointments/:appointmentId/reschedule
 * Reschedule appointment
 */
router.put('/:appointmentId/reschedule',
  requireScopes('appointments.write'),
  appointmentsController.rescheduleAppointment
);

/**
 * POST /v1/{tenant-id}/appointments/:appointmentId/cancel
 * Cancel appointment
 */
router.post('/:appointmentId/cancel',
  requireScopes('appointments.write'),
  appointmentsController.cancelAppointment
);

/**
 * POST /v1/{tenant-id}/appointments/:appointmentId/complete
 * Mark appointment as completed
 */
router.post('/:appointmentId/complete',
  requireScopes('appointments.write'),
  appointmentsController.completeAppointment
);

export default router;
