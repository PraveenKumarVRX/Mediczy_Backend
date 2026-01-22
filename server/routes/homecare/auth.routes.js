import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import HomecareProvider from '../../models/postgres/homecare.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/homecare/login
 * Authenticate homecare service provider
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
    const provider = await HomecareProvider.findOne({ where: { email: normalizedEmail } });

    if (!provider) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Homecare provider not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await provider.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, provider.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!provider.isActive()) {
      await auditLoginAttempt(req, provider.id, normalizedEmail, false, 'Homecare provider inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    const token = provider.generateAuthToken();

    await auditLoginAttempt(req, provider.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      homecare: provider.toJSON()
    });

  } catch (error) {
    console.error('Homecare login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/homecare/verify
 * Verify homecare token
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
      homecare: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/homecare/logout
 * Logout homecare (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
