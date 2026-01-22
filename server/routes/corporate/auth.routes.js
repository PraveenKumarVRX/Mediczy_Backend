import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import User from '../../models/postgres/user.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/corporate/login
 * Authenticate corporate account
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    const normalizedEmail = String(email).toLowerCase();
    const corporateUser = await User.findOne({
      where: {
        email: normalizedEmail,
        role: 'corporate_admin',
        status: 'active'
      }
    });

    if (!corporateUser) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Corporate admin not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await corporateUser.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, corporateUser.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = corporateUser.generateAuthToken();
    await corporateUser.update({ lastLoginAt: new Date() });

    await auditLoginAttempt(req, corporateUser.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      corporate: {
        id: corporateUser.id,
        email: corporateUser.email,
        role: corporateUser.role,
        organizationId: corporateUser.organization_id || null
      }
    });

  } catch (error) {
    console.error('Corporate login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/corporate/verify
 * Verify corporate token
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];


    if (!JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    res.status(200).json({
      success: true,
      corporate: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/corporate/logout
 * Logout corporate (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
