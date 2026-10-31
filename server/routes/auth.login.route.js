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
        // Admin/HR-provisioned corporate employees log in with their 6-char
        // corporate_employees UID (e.g. E7K2PX) instead of an email.
        const isLoginUid = /^[A-Za-z][A-Za-z0-9]{5}$/.test(emailValue);
        if (!isEmail && !isPhone && !isLoginUid) {
          throw new Error('Must be a valid email, phone number, or login ID');
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
// These need direct access to user router without the /login validation that requires password
router.post('/send-otp', authLimiter, (req, res, next) => {
  const originalUrl = req.url;
  req.url = '/login/send-otp';
  userRouter.handle(req, res, (err) => {
    req.url = originalUrl;
    if (err) return next(err);
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'OTP send endpoint not found' });
    }
  });
});

router.post('/verify-otp', authLimiter, (req, res, next) => {
  const originalUrl = req.url;
  req.url = '/login/verify-otp';
  userRouter.handle(req, res, (err) => {
    req.url = originalUrl;
    if (err) return next(err);
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'OTP verify endpoint not found' });
    }
  });
});

export default router;
