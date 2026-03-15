/**
 * Unified Hospital Staff Routes for Mediczy Mobile App
 * Single mobile app endpoints for all hospital staff roles
 * 
 * All hospital staff from all hospitals use these endpoints
 * Hospital is identified by hospital_id, hospital_slug, or hospital_domain in request body
 */

import express from 'express';
import { body, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  doctorSignup,
  doctorLogin,
  nurseSignup,
  nurseLogin,
  assistantSignup,
  assistantLogin,
  insuranceCoordinatorSignup,
  insuranceCoordinatorLogin,
  accountsStaffSignup,
  accountsStaffLogin,
  mrdStaffSignup,
  mrdStaffLogin,
  insuranceDeskSignup,
  insuranceDeskLogin,
  hrStaffSignup,
  hrStaffLogin,
  itEdpStaffSignup,
  itEdpStaffLogin,
  otStaffSignup,
  otStaffLogin,
  icuStaffSignup,
  icuStaffLogin,
  qualityStaffSignup,
  qualityStaffLogin,
  securityStaffSignup,
  securityStaffLogin,
  searchHospitals,
  getStaffProfile,
  updateStaffProfile
} from '../controller/unified-hospital-staff.controller.js';

const router = express.Router();

/**
 * Middleware to ensure user is hospital staff
 */
const requireHospitalStaff = (req, res, next) => {
  const validRoles = ['doctor', 'nurse', 'doctor_assistant', 'insurance_coordinator',
    'accounts_staff', 'mrd_staff', 'insurance_desk_staff', 'hr_staff',
    'it_edp_staff', 'ot_staff', 'icu_staff', 'quality_staff', 'security_staff'];
  
  if (!req.user || !validRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only hospital staff can access this resource'
    });
  }
  next();
};

// ==================== DOCTOR ENDPOINTS ====================

/**
 * POST /api/hospital/staff/doctor/signup
 * Doctor signup - public endpoint
 */
router.post(
  '/doctor/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('specialization').optional().trim(),
    body('license_number').optional().trim(),
    body('years_of_experience').optional().isInt({ min: 0 }),
    body('qualifications').optional().isArray(),
    body('department').optional().trim()
  ],
  doctorSignup
);

/**
 * POST /api/hospital/staff/doctor/login
 * Doctor login - public endpoint
 */
router.post(
  '/doctor/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  doctorLogin
);

// ==================== NURSE ENDPOINTS ====================

/**
 * POST /api/hospital/staff/nurse/signup
 * Nurse signup - public endpoint
 */
router.post(
  '/nurse/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('license_number').optional().trim(),
    body('department').optional().trim(),
    body('shift_type').optional().isIn(['day', 'night', 'rotating'])
  ],
  nurseSignup
);

/**
 * POST /api/hospital/staff/nurse/login
 * Nurse login - public endpoint
 */
router.post(
  '/nurse/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  nurseLogin
);

// ==================== DOCTOR ASSISTANT ENDPOINTS ====================

/**
 * POST /api/hospital/staff/assistant/signup
 * Doctor assistant signup - public endpoint
 */
router.post(
  '/assistant/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('assigned_doctor_id').optional().isInt(),
    body('department').optional().trim()
  ],
  assistantSignup
);

/**
 * POST /api/hospital/staff/assistant/login
 * Doctor assistant login - public endpoint
 */
router.post(
  '/assistant/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  assistantLogin
);

// ==================== INSURANCE COORDINATOR ENDPOINTS ====================

/**
 * POST /api/hospital/staff/insurance-coordinator/signup
 * Insurance coordinator signup - public endpoint
 */
router.post(
  '/insurance-coordinator/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('department').optional().trim(),
    body('certification').optional().trim()
  ],
  insuranceCoordinatorSignup
);

/**
 * POST /api/hospital/staff/insurance-coordinator/login
 * Insurance coordinator login - public endpoint
 */
router.post(
  '/insurance-coordinator/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  insuranceCoordinatorLogin
);

// ==================== DEPARTMENT STAFF ENDPOINTS ====================

const deptBodyValidation = [
  body('hospital_id').optional().trim(),
  body('hospital_slug').optional().trim(),
  body('hospital_domain').optional().trim(),
  body('email').isEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional().trim(),
  body('department').optional().trim()
];

const deptLoginValidation = [
  body('hospital_id').optional().trim(),
  body('hospital_slug').optional().trim(),
  body('hospital_domain').optional().trim(),
  body('email').isEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Accounts
router.post('/accounts/signup', deptBodyValidation, accountsStaffSignup);
router.post('/accounts/login', authLimiter, deptLoginValidation, accountsStaffLogin);

// MRD
router.post('/mrd/signup', deptBodyValidation, mrdStaffSignup);
router.post('/mrd/login', authLimiter, deptLoginValidation, mrdStaffLogin);

// Insurance Desk
router.post('/insurance-desk/signup', deptBodyValidation, insuranceDeskSignup);
router.post('/insurance-desk/login', authLimiter, deptLoginValidation, insuranceDeskLogin);

// HR
router.post('/hr/signup', deptBodyValidation, hrStaffSignup);
router.post('/hr/login', authLimiter, deptLoginValidation, hrStaffLogin);

// IT/EDP
router.post('/it-edp/signup', deptBodyValidation, itEdpStaffSignup);
router.post('/it-edp/login', authLimiter, deptLoginValidation, itEdpStaffLogin);

// OT
router.post('/ot/signup', deptBodyValidation, otStaffSignup);
router.post('/ot/login', authLimiter, deptLoginValidation, otStaffLogin);

// ICU
router.post('/icu/signup', deptBodyValidation, icuStaffSignup);
router.post('/icu/login', authLimiter, deptLoginValidation, icuStaffLogin);

// Quality / NABH
router.post('/quality/signup', deptBodyValidation, qualityStaffSignup);
router.post('/quality/login', authLimiter, deptLoginValidation, qualityStaffLogin);

// Security
router.post('/security/signup', deptBodyValidation, securityStaffSignup);
router.post('/security/login', authLimiter, deptLoginValidation, securityStaffLogin);

// ==================== COMMON ENDPOINTS ====================

/**
 * GET /api/hospital/staff/search
 * Search for hospitals - public endpoint
 */
router.get(
  '/search',
  [
    query('query').optional().trim(),
    query('city').optional().trim(),
    query('state').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  searchHospitals
);

/**
 * GET /api/hospital/staff/profile
 * Get staff profile - authenticated staff only
 */
router.get(
  '/profile',
  authUser,
  requireHospitalStaff,
  getStaffProfile
);

/**
 * PATCH /api/hospital/staff/profile
 * Update staff profile - authenticated staff only
 */
router.patch(
  '/profile',
  authUser,
  requireHospitalStaff,
  [
    body('first_name').optional().trim(),
    body('last_name').optional().trim(),
    body('phone').optional().trim(),
    body('specialization').optional().trim(),
    body('department').optional().trim(),
    body('license_number').optional().trim(),
    body('qualifications').optional().isArray(),
    body('years_of_experience').optional().isInt({ min: 0 }),
    body('shift_type').optional().isIn(['day', 'night', 'rotating']),
    body('certification').optional().trim()
  ],
  updateStaffProfile
);

export default router;
