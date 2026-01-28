import express from 'express';
import { body } from 'express-validator';
import { signInUser } from '../controller/user.controller.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import userRouter from './user.route.js';

const router = express.Router();

const forwardToUserRouter = (targetPath) => (req, res, next) => {
  const originalUrl = req.url;
  req.url = targetPath;

  userRouter.handle(req, res, (err) => {
    req.url = originalUrl;

    if (err) {
      return next(err);
    }

    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'OTP alias not handled' });
    }
  });
};

// Generic auth login alias for legacy clients and health checks
router.post(
  '/login',
  authLimiter,
  [
    body().custom((_, { req }) => {
      const rawEmail = req.body?.email;
      const rawPhone = req.body?.phoneNumber || req.body?.phone;

      if (!rawEmail && !rawPhone) {
        throw new Error('Email or phone number is required');
      }

      if (rawEmail) {
        const emailValue = String(rawEmail).trim();
        const normalized = emailValue.replace(/[^0-9]/g, '');
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
        const isPhone = normalized.length >= 10;
        if (!isEmail && !isPhone) {
          throw new Error('Must be a valid email or phone number');
        }
      }

      if (rawPhone) {
        const normalizedPhone = String(rawPhone).replace(/[^0-9]/g, '');
        if (normalizedPhone.length < 10) {
          throw new Error('Must be a valid phone number');
        }
      }

      return true;
    }),
    body('password').notEmpty().withMessage('Password is required')
  ],
  signInUser
);

// OTP login aliases for legacy clients (/api/auth/send-otp, /api/auth/verify-otp)
router.post('/send-otp', authLimiter, forwardToUserRouter('/login/send-otp'));
router.post('/verify-otp', authLimiter, forwardToUserRouter('/login/verify-otp'));

export default router;
