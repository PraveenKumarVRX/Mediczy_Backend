import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import User from '../../models/postgres/user.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/tpa/login
 * Authenticate TPA account
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
    const tpaUser = await User.findOne({
      where: {
        email: normalizedEmail,
        role: 'tpa_admin',
        status: 'active'
      }
    });

    if (!tpaUser) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'TPA admin not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await tpaUser.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, tpaUser.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = tpaUser.generateAuthToken();
    await tpaUser.update({ lastLoginAt: new Date() });

    await auditLoginAttempt(req, tpaUser.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      tpa: {
        id: tpaUser.id,
        email: tpaUser.email,
        role: tpaUser.role,
        organizationId: tpaUser.organization_id || null
      }
    });

  } catch (error) {
    console.error('TPA login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/verify
 * Verify TPA token
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

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    res.status(200).json({
      success: true,
      tpa: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/tpa/logout
 * Logout TPA (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
