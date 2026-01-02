/**
 * Clinic Patient Management Routes
 * Public signup and clinic staff patient management
 */

import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  patientSignup,
  addPatient,
  listClinicPatients,
  getPatientDetails,
  updatePatient,
  patientLogin,
  getPatientStats
} from '../controller/clinic-patient.controller.js';

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
 * POST /api/clinic/:clinicId/patient/signup
 * Public patient signup endpoint
 */
router.post(
  '/:clinicId/patient/signup',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('date_of_birth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']),
    body('blood_type').optional().trim(),
    body('allergies').optional().isArray(),
    body('address_city').optional().trim(),
    body('address_state').optional().trim(),
    body('address_country').optional().trim()
  ],
  patientSignup
);

/**
 * POST /api/clinic/:clinicId/patient/add
 * Clinic admin adds patient
 */
router.post(
  '/:clinicId/patient/add',
  authUser,
  requireClinicAdmin,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('date_of_birth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']),
    body('blood_type').optional().trim(),
    body('allergies').optional().isArray(),
    body('address_city').optional().trim(),
    body('address_state').optional().trim(),
    body('address_country').optional().trim()
  ],
  addPatient
);

/**
 * POST /api/clinic/:clinicId/patient/login
 * Patient login endpoint
 */
router.post(
  '/:clinicId/patient/login',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  patientLogin
);

/**
 * GET /api/clinic/:clinicId/patients
 * List all patients in clinic
 */
router.get(
  '/:clinicId/patients',
  authUser,
  requireClinicAdmin,
  listClinicPatients
);

/**
 * GET /api/clinic/:clinicId/patients/:patientId
 * Get patient details
 */
router.get(
  '/:clinicId/patients/:patientId',
  authUser,
  requireClinicAdmin,
  getPatientDetails
);

/**
 * PATCH /api/clinic/:clinicId/patients/:patientId
 * Update patient information
 */
router.patch(
  '/:clinicId/patients/:patientId',
  authUser,
  requireClinicAdmin,
  [
    body('phone').optional().trim(),
    body('blood_type').optional().trim(),
    body('allergies').optional().isArray(),
    body('address_city').optional().trim(),
    body('address_state').optional().trim(),
    body('gender').optional().isIn(['Male', 'Female', 'Other']),
    body('status').optional().isIn(['active', 'inactive', 'suspended'])
  ],
  updatePatient
);

/**
 * GET /api/clinic/:clinicId/patient-stats
 * Get patient statistics
 */
router.get(
  '/:clinicId/patient-stats',
  authUser,
  requireClinicAdmin,
  getPatientStats
);

export default router;
