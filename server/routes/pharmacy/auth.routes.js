import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Pharmacy from '../../models/postgres/pharmacy.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/pharmacy/login
 * Authenticate pharmacy account
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
    const pharmacy = await Pharmacy.findOne({ where: { email: normalizedEmail } });

    if (!pharmacy) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Pharmacy not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await pharmacy.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, pharmacy.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!pharmacy.isActive()) {
      await auditLoginAttempt(req, pharmacy.id, normalizedEmail, false, 'Pharmacy inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    const token = pharmacy.generateAuthToken();

    await auditLoginAttempt(req, pharmacy.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      pharmacy: pharmacy.toJSON()
    });

  } catch (error) {
    console.error('Pharmacy login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/pharmacy/verify
 * Verify pharmacy token
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

    const decoded = jwt.verify(token, JWT_SECRET);

    res.status(200).json({
      success: true,
      pharmacy: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/pharmacy/logout
 * Logout pharmacy (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
