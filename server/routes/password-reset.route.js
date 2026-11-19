import express from 'express';
import { body, validationResult } from 'express-validator';
import passwordResetService from '../services/password-reset.service.js';

const router = express.Router();

// The web sends the code as `code`; the My SmartHealth app sends it as `otp`.
const otpFrom = (body = {}) => String(body.code ?? body.otp ?? '').trim();

/**
 * @route   POST /api/password-reset/request
 * @desc    Request password reset OTP via Email, SMS, and WhatsApp
 * @access  Public
 */
router.post('/request', [
  body('email').optional().isEmail().withMessage('Must be a valid email'),
  body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone format'),
  body('userType').optional().isIn(['user', 'doctor', 'team', 'hospital', 'nurse', 'pharmacy', 'corporate']).withMessage("User type must be one of: user, doctor, team, hospital, nurse, pharmacy, corporate")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }
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
  body().custom((value) => /^\d{6}$/.test(otpFrom(value))).withMessage('OTP must be 6 digits'),
  body('userType').optional().isIn(['user', 'doctor', 'team', 'hospital', 'nurse', 'pharmacy', 'corporate']).withMessage("User type must be one of: user, doctor, team, hospital, nurse, pharmacy, corporate")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }
  try {
    const { email, phone, userType = 'user' } = req.body;
    const code = otpFrom(req.body);

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
  body('resetToken').optional().isString(),
  body('newPassword').notEmpty().isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('userType').optional().isIn(['user', 'doctor', 'team', 'hospital', 'nurse', 'pharmacy', 'corporate']).withMessage("User type must be one of: user, doctor, team, hospital, nurse, pharmacy, corporate")
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }
  try {
    const { resetToken, newPassword, email, phone, userType = 'user' } = req.body;
    const code = otpFrom(req.body);

    let result;
    if (resetToken) {
      result = await passwordResetService.resetPassword({ resetToken, newPassword, userType });
    } else if ((email || phone) && /^\d{6}$/.test(code)) {
      result = await passwordResetService.resetPasswordWithOtp({ email, phone, code, newPassword, userType });
    } else {
      return res.status(400).json({ success: false, message: 'Reset token, or email or phone with the 6-digit code, is required' });
    }

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
