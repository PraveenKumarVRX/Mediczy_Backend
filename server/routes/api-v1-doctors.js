/**
 * Doctor Search Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - GET /v1/{tenant-id}/doctors - Search doctors
 * - GET /v1/{tenant-id}/doctors/:doctorId - Get doctor details
 * - GET /v1/{tenant-id}/doctors/:doctorId/availability - Get doctor availability
 * - GET /v1/{tenant-id}/doctors/:doctorId/slots - Get available time slots
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { doctorsValidation, handleValidationErrors } from '../middleware/validation.js';
import * as doctorsController from '../controllers/api-v1/DoctorsController.js';

const router = express.Router();

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * GET /v1/{tenant-id}/doctors
 * Search doctors with filters
 */
router.get('/',
  requireScopes('doctors.read'),
  doctorsController.searchDoctors
);

/**
 * GET /v1/{tenant-id}/doctors/:doctorId
 * Get doctor details
 */
router.get('/:doctorId',
  requireScopes('doctors.read'),
  doctorsController.getDoctorProfile
);

/**
 * GET /v1/{tenant-id}/doctors/:doctorId/availability
 * Get doctor availability
 */
router.get('/:doctorId/availability',
  requireScopes('doctors.read'),
  doctorsController.getDoctorAvailability
);

/**
 * GET /v1/{tenant-id}/doctors/:doctorId/slots
 * Get available time slots
 */
router.get('/:doctorId/slots',
  requireScopes('doctors.read'),
  doctorsController.getAvailableSlots
);

export default router;
