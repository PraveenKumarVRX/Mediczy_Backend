/**
 * Super Admin - Clinic Management Routes
 * Only super admin (admin@mediczy.com) can access these endpoints
 */

import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  createClinicWithAdmin,
  listClinics,
  getClinicDetails,
  updateClinic,
  deleteClinic
} from '../controller/superadmin-clinic.controller.js';

const router = express.Router();

/**
 * Middleware to verify super admin
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.email !== 'admin@mediczy.com' || req.user.role !== 'system_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only super admin can access this resource'
    });
  }
  next();
};

/**
 * POST /api/superadmin/clinics
 * Create new clinic with clinic admin
 * Super admin only
 */
router.post(
  '/',
  authUser,
  requireSuperAdmin,
  [
    body('clinic_name').trim().notEmpty().withMessage('Clinic name is required'),
    body('clinic_email').isEmail().withMessage('Invalid clinic email'),
    body('clinic_phone').trim().notEmpty().withMessage('Clinic phone is required'),
    body('clinic_type').isIn(['clinic', 'hospital', 'lab']).withMessage('Invalid clinic type'),
    body('clinic_slug').optional().trim(),
    body('clinic_address').optional().trim(),
    body('clinic_city').optional().trim(),
    body('clinic_state').optional().trim(),
    body('clinic_pincode').optional().trim(),
    body('registration_number').optional().trim(),
    body('tax_id').optional().trim(),
    body('admin_email').isEmail().withMessage('Invalid admin email'),
    body('admin_password').isLength({ min: 8 }).withMessage('Admin password must be at least 8 characters'),
    body('admin_first_name').trim().notEmpty().withMessage('Admin first name is required'),
    body('admin_last_name').trim().notEmpty().withMessage('Admin last name is required'),
    body('plan').optional().isIn(['free', 'basic', 'professional', 'enterprise']),
    body('timezone').optional().trim(),
    body('language').optional().trim(),
    body('currency').optional().trim()
  ],
  createClinicWithAdmin
);

/**
 * GET /api/superadmin/clinics
 * List all clinics with filters
 * Super admin only
 */
router.get(
  '/',
  authUser,
  requireSuperAdmin,
  listClinics
);

/**
 * GET /api/superadmin/clinics/:clinicId
 * Get clinic details
 * Super admin only
 */
router.get(
  '/:clinicId',
  authUser,
  requireSuperAdmin,
  getClinicDetails
);

/**
 * PATCH /api/superadmin/clinics/:clinicId
 * Update clinic
 * Super admin only
 */
router.patch(
  '/:clinicId',
  authUser,
  requireSuperAdmin,
  [
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().trim(),
    body('status').optional().isIn(['active', 'suspended', 'cancelled']),
    body('plan').optional().isIn(['free', 'basic', 'professional', 'enterprise'])
  ],
  updateClinic
);

/**
 * DELETE /api/superadmin/clinics/:clinicId
 * Delete clinic (soft delete - marks as cancelled)
 * Super admin only
 */
router.delete(
  '/:clinicId',
  authUser,
  requireSuperAdmin,
  deleteClinic
);

export default router;
