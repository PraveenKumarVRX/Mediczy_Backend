/**
 * Unified Patient Routes for Mediczy Mobile App
 * Single mobile app endpoints for all clinic patients
 * 
 * All patients from all clinics use these endpoints
 * Clinic is identified by clinic_id, clinic_slug, or clinic_domain in request body
 */

import express from 'express';
import { body, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  unifiedPatientSignup,
  unifiedPatientLogin,
  searchClinics,
  getPatientProfile,
  updatePatientProfile
} from '../controller/unified-patient.controller.js';

const router = express.Router();

/**
 * Middleware to ensure user is a patient
 */
const requirePatient = (req, res, next) => {
  if (!req.user || req.user.role !== 'patient') {
    return res.status(403).json({
      success: false,
      message: 'Only patients can access this resource'
    });
  }
  next();
};

/**
 * POST /api/patient/signup
 * Patient signup - public endpoint
 * Accepts clinic identifier (clinic_id, clinic_slug, or clinic_domain)
 */
router.post(
  '/signup',
  [
    body('clinic_id').optional().trim(),
    body('clinic_slug').optional().trim(),
    body('clinic_domain').optional().trim(),
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
  unifiedPatientSignup
);

/**
 * POST /api/patient/login
 * Patient login - public endpoint
 * Accepts clinic identifier (clinic_id, clinic_slug, or clinic_domain)
 */
router.post(
  '/login',
  authLimiter,
  [
    body('clinic_id').optional().trim(),
    body('clinic_slug').optional().trim(),
    body('clinic_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  unifiedPatientLogin
);

/**
 * GET /api/patient/clinics/search
 * Search for clinics - public endpoint
 * Allows patients to find clinics to join
 */
router.get(
  '/clinics/search',
  [
    query('query').optional().trim(),
    query('city').optional().trim(),
    query('state').optional().trim(),
    query('type').optional().isIn(['hospital', 'clinic', 'lab', 'pharmacy', 'ambulance', 'corporate', 'homecare']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  searchClinics
);

/**
 * GET /api/patient/profile
 * Get patient profile - authenticated patient only
 */
router.get(
  '/profile',
  authUser,
  requirePatient,
  getPatientProfile
);

/**
 * PATCH /api/patient/profile
 * Update patient profile - authenticated patient only
 */
router.patch(
  '/profile',
  authUser,
  requirePatient,
  [
    body('first_name').optional().trim(),
    body('last_name').optional().trim(),
    body('phone').optional().trim(),
    body('date_of_birth').optional().isISO8601().withMessage('Invalid date format'),
    body('gender').optional().isIn(['Male', 'Female', 'Other']),
    body('blood_type').optional().trim(),
    body('allergies').optional().isArray(),
    body('address_city').optional().trim(),
    body('address_state').optional().trim(),
    body('address_country').optional().trim()
  ],
  updatePatientProfile
);

export default router;
