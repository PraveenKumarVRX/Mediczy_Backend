import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Hospital from '../../models/hospital.model.intelligent.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/hospital/login
 * Authenticate hospital account
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
    const hospital = await Hospital.findOne({ where: { email: normalizedEmail } });

    if (!hospital) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Hospital not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await hospital.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (hospital.status && hospital.status !== 'active') {
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Hospital inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    const token = jwt.sign(
      {
        id: hospital.id,
        hospitalId: hospital.id,
        email: hospital.email,
        name: hospital.hospitalName || hospital.name,
        userType: 'hospital',
        role: 'hospital'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await auditLoginAttempt(req, hospital.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      hospital: {
        id: hospital.id,
        name: hospital.hospitalName || hospital.name,
        email: hospital.email,
        phone: hospital.phoneNumber || hospital.phone,
        registrationNumber: hospital.registrationNumber,
        hospitalType: hospital.hospitalType,
        totalBeds: hospital.totalBeds,
        availableBeds: hospital.availableBeds,
        city: hospital.city,
        accreditation: hospital.accreditation
      }
    });

  } catch (error) {
    console.error('Hospital login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/hospital/verify
 * Verify hospital token
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
      hospital: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/hospital/logout
 * Logout hospital (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
