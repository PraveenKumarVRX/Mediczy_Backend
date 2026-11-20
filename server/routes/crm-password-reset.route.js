import express from 'express';
import { otpLimiter } from '../middleware/rateLimiter.middleware.js';
import { requestPasswordReset, verifyOtpAndIssueResetToken, resetPassword } from '../services/crm-password-reset.service.js';

export function buildCrmPasswordResetRouter(tenantId) {
  const router = express.Router();

  router.post('/request', otpLimiter, async (req, res) => {
    try {
      const result = await requestPasswordReset({ email: req.body?.email, tenantId });
      return res.status(result.success ? 200 : 503).json(result);
    } catch {
      return res.status(500).json({ success: false, message: 'Unable to process password reset request' });
    }
  });

  router.post('/verify-otp', otpLimiter, async (req, res) => {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ success: false, message: 'Email and OTP code are required' });
    try {
      return res.json(await verifyOtpAndIssueResetToken({ email, code, tenantId }));
    } catch {
      return res.status(500).json({ success: false, message: 'Unable to verify OTP' });
    }
  });

  router.post('/reset', otpLimiter, async (req, res) => {
    const { resetToken, newPassword } = req.body || {};
    try {
      return res.json(await resetPassword({ resetToken, newPassword, tenantId }));
    } catch {
      return res.status(500).json({ success: false, message: 'Unable to reset password' });
    }
  });

  return router;
}
