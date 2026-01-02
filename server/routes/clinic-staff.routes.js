/**
 * Clinic Staff Management Routes
 * Clinic admin can manage their staff (doctors, nurses, doctor assistants)
 */

import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  createClinicStaff,
  listClinicStaff,
  getClinicStaffDetails,
  updateClinicStaff,
  deleteClinicStaff,
  getClinicStaffStats
} from '../controller/clinic-staff.controller.js';

const router = express.Router();

/**
 * Middleware to verify clinic admin
 */
const requireClinicAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'clinic_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only clinic admin can access this resource'
    });
  }
  next();
};

/**
 * POST /api/clinic/:clinicId/staff
 * Create new staff member (doctor, nurse, or doctor assistant)
 */
router.post(
  '/:clinicId/staff',
  authUser,
  requireClinicAdmin,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('role').isIn(['doctor', 'nurse', 'doctor_assistant']).withMessage('Invalid role'),
    body('license_number').optional().trim(),
    body('qualification').optional().trim(),
    body('specialization').optional().trim(),
    body('department').optional().trim(),
    body('experience_years').optional().isInt({ min: 0 })
  ],
  createClinicStaff
);

/**
 * GET /api/clinic/:clinicId/staff
 * List clinic staff with optional filters
 */
router.get(
  '/:clinicId/staff',
  authUser,
  requireClinicAdmin,
  listClinicStaff
);

/**
 * GET /api/clinic/:clinicId/staff/:staffId
 * Get individual staff details
 */
router.get(
  '/:clinicId/staff/:staffId',
  authUser,
  requireClinicAdmin,
  getClinicStaffDetails
);

/**
 * PATCH /api/clinic/:clinicId/staff/:staffId
 * Update staff information
 */
router.patch(
  '/:clinicId/staff/:staffId',
  authUser,
  requireClinicAdmin,
  [
    body('phone').optional().trim(),
    body('license_number').optional().trim(),
    body('qualification').optional().trim(),
    body('specialization').optional().trim(),
    body('department').optional().trim(),
    body('experience_years').optional().isInt({ min: 0 }),
    body('status').optional().isIn(['active', 'inactive', 'suspended'])
  ],
  updateClinicStaff
);

/**
 * DELETE /api/clinic/:clinicId/staff/:staffId
 * Delete staff member (soft delete - marks as inactive)
 */
router.delete(
  '/:clinicId/staff/:staffId',
  authUser,
  requireClinicAdmin,
  deleteClinicStaff
);

/**
 * GET /api/clinic/:clinicId/staff-stats
 * Get staff statistics
 */
router.get(
  '/:clinicId/staff-stats',
  authUser,
  requireClinicAdmin,
  getClinicStaffStats
);

export default router;
