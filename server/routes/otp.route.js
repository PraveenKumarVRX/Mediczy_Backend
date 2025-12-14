import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  sendOTP,
  verifyOTP,
  resendOTP,
  getOTPStats,
  cleanupExpiredOTPs
} from '../controller/otp.controller.js';

const router = express.Router();

/**
 * OTP Management Routes
 * Base: /api/otp
 */

// Public routes (no auth required)

/**
 * Send OTP
 * POST /api/otp/send
 * Body: { phone, email?, purpose? }
 */
router.post('/send', [
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone format'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('purpose').optional().isIn(['login', 'registration', 'password_reset', 'verification']).withMessage('Invalid purpose')
], sendOTP);

/**
 * Verify OTP
 * POST /api/otp/verify
 * Body: { phone, email?, code, purpose? }
 */
router.post('/verify', [
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone format'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('code').notEmpty().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('purpose').optional().isIn(['login', 'registration', 'password_reset', 'verification']).withMessage('Invalid purpose')
], verifyOTP);

/**
 * Resend OTP
 * POST /api/otp/resend
 * Body: { phone, email?, purpose? }
 */
router.post('/resend', [
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone format'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('purpose').optional().isIn(['login', 'registration', 'password_reset', 'verification']).withMessage('Invalid purpose')
], resendOTP);

// Admin routes (authentication required)

/**
 * Get OTP statistics
 * GET /api/otp/stats
 */
router.get('/stats', authUser, requireRole('admin'), getOTPStats);

/**
 * Clean up expired OTPs
 * POST /api/otp/cleanup
 */
router.post('/cleanup', authUser, requireRole('admin'), cleanupExpiredOTPs);

export default router;
