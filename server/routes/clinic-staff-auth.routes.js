/**
 * Clinic Staff Authentication Routes
 * Login endpoints for doctors, nurses, and doctor assistants
 */

import express from 'express';
import { body } from 'express-validator';
import {
  clinicStaffLogin,
  doctorLogin,
  nurseLogin,
  assistantLogin,
  verifyStaffToken
} from '../controller/clinic-staff-auth.controller.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

/**
 * POST /api/clinic/staff/login
 * Generic staff login (provide email, password, and role)
 */
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required'),
    body('role').isIn(['doctor', 'nurse', 'doctor_assistant']).withMessage('Invalid role')
  ],
  clinicStaffLogin
);

/**
 * POST /api/clinic/staff/doctor-login
 * Doctor login
 */
router.post(
  '/doctor-login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  doctorLogin
);

/**
 * POST /api/clinic/staff/nurse-login
 * Nurse login
 */
router.post(
  '/nurse-login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  nurseLogin
);

/**
 * POST /api/clinic/staff/assistant-login
 * Doctor assistant login
 */
router.post(
  '/assistant-login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  assistantLogin
);

/**
 * GET /api/clinic/staff/verify
 * Verify staff token
 */
router.get(
  '/verify',
  verifyStaffToken
);

export default router;
