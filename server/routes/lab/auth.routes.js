import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Lab from '../../models/postgres/lab.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const router = express.Router();

/**
 * POST /api/lab/login
 * Authenticate laboratory account
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = String(email).toLowerCase();
    const lab = await Lab.findOne({ where: { email: normalizedEmail } });

    if (!lab) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Lab not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await lab.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, lab.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!lab.isActive()) {
      await auditLoginAttempt(req, lab.id, normalizedEmail, false, 'Lab inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    const token = lab.generateAuthToken();

    await auditLoginAttempt(req, lab.id, normalizedEmail, true);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      lab: lab.toJSON()
    });

  } catch (error) {
    console.error('Lab login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/lab/verify
 * Verify lab token
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

    res.status(200).json({
      success: true,
      lab: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/lab/logout
 * Logout lab (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
