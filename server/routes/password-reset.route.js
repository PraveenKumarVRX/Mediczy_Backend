import express from 'express';
import { body } from 'express-validator';
import passwordResetService from '../services/password-reset.service.js';

const router = express.Router();

/**
 * @route   POST /api/password-reset/request
 * @desc    Request password reset OTP via Email, SMS, and WhatsApp
 * @access  Public
 */
router.post('/request', [
  body('email').optional().isEmail().withMessage('Must be a valid email'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone format'),
  body('userType').optional().isIn(['user', 'doctor', 'hospital', 'nurse', 'pharmacy', 'corporate']).withMessage("User type must be one of: user, doctor, hospital, nurse, pharmacy, corporate")
], async (req, res) => {
  try {
    const { email, phone, userType = 'user' } = req.body;

    // Require at least email or phone
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    // Request password reset with OTP
    const result = await passwordResetService.requestPasswordReset({
      email,
      phone,
      userType
    });

    res.json(result);

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    });
  }
});

/**
 * @route   POST /api/password-reset/verify-otp
 * @desc    Verify OTP and get reset token
 * @access  Public
 */
router.post('/verify-otp', [
  body('email').optional().isEmail().withMessage('Must be a valid email'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone format'),
  body('code').notEmpty().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('userType').optional().isIn(['user', 'doctor', 'hospital', 'nurse', 'pharmacy', 'corporate']).withMessage("User type must be one of: user, doctor, hospital, nurse, pharmacy, corporate")
], async (req, res) => {
  try {
    const { email, phone, code, userType = 'user' } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    const result = await passwordResetService.verifyOTPAndGenerateToken({
      email,
      phone,
      code,
      userType
    });

    res.json(result);

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

/**
 * @route   POST /api/password-reset/reset
 * @desc    Reset password with verified token
 * @access  Public
 */
router.post('/reset', [
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('userType').optional().isIn(['user', 'doctor', 'hospital', 'nurse', 'pharmacy', 'corporate']).withMessage("User type must be one of: user, doctor, hospital, nurse, pharmacy, corporate")
], async (req, res) => {
  try {
    const { resetToken, newPassword, userType = 'user' } = req.body;

    const result = await passwordResetService.resetPassword({
      resetToken,
      newPassword,
      userType
    });

    res.json(result);

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

export default router;
