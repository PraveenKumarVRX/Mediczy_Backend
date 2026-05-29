/**
 * Ambulance Routes
 * Authentication and ambulance management
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';
import { Ambulance } from '../models/index.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

/**
 * POST /api/ambulance/login
 * Ambulance provider login
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find ambulance by email - select only needed fields for faster query
    const ambulance = await Ambulance.findOne({
      where: { email: normalizedEmail },
      attributes: ['id', 'providerName', 'email', 'password', 'phone', 'emergencyPhone', 'vehicleNumber'],
      raw: true
    });

    if (!ambulance) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Ambulance not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, ambulance.password);

    if (!isValidPassword) {
      await auditLoginAttempt(req, ambulance.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: ambulance.id, email: ambulance.email, role: 'ambulance', type: 'ambulance' },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    await auditLoginAttempt(req, ambulance.id, normalizedEmail, true);

    res.json({
      success: true,
      token,
      ambulance: {
        id: ambulance.id,
        providerName: ambulance.providerName,
        email: ambulance.email,
        phone: ambulance.phone,
      },
    });
  } catch (error) {
    console.error('Ambulance login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
/**
 * POST /api/ambulance/register — handled by ambulance/auth.routes.js (secure wizard)
 */
// Registration is handled by the dedicated auth router (ambulance/auth.routes.js)
// which is mounted at /api/ambulance AFTER this router.
// DO NOT add a register handler here.

/**
 * GET /api/ambulance/profile
 * Get ambulance profile
 */
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    const ambulance = await Ambulance.findByPk(decoded.id);

    if (!ambulance) {
      return res.status(404).json({ success: false, message: 'Ambulance not found' });
    }

    res.json({
      success: true,
      ambulance: {
        id: ambulance.id,
        name: ambulance.name,
        email: ambulance.email,
        phone: ambulance.phone,
        license_number: ambulance.license_number,
        vehicles: ambulance.vehicles,
        address: ambulance.address,
        status: ambulance.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
  }
});

export default router;
