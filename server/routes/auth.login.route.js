import express from 'express';
import { body } from 'express-validator';
import { signInUser } from '../controller/user.controller.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Generic auth login alias for legacy clients and health checks
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Must be a valid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  signInUser
);

export default router;
