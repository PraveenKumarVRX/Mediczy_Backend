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
      attributes: ['id', 'providerName', 'email', 'password', 'phone', 'emergencyPhone', 'vehicleNumber', 'tenant_id'],
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
      {
        id: ambulance.id,
        email: ambulance.email,
        type: 'ambulance',
        tenant_id: ambulance.tenant_id
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    await auditLoginAttempt(req, ambulance.id, normalizedEmail, true);

    res.json({
      success: true,
      token,
      ambulance: {
        id: ambulance.id,
        name: ambulance.name,
        email: ambulance.email,
        phone: ambulance.phone,
        license_number: ambulance.license_number,
        vehicles: ambulance.vehicles,
        tenant_id: ambulance.tenant_id
      }
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
 * POST /api/ambulance/register
 * Register new ambulance service
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      license_number,
      address,
      vehicles = 1,
      tenant_id
    } = req.body;

    // Check if ambulance exists
    const existing = await Ambulance.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create ambulance
    const ambulance = await Ambulance.create({
      name,
      email,
      password: hashedPassword,
      phone,
      license_number,
      address,
      vehicles,
      tenant_id,
      status: 'active'
    });

    // Generate token
    const token = jwt.sign(
      {
        id: ambulance.id,
        email: ambulance.email,
        type: 'ambulance',
        tenant_id: ambulance.tenant_id
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      ambulance: {
        id: ambulance.id,
        name: ambulance.name,
        email: ambulance.email,
        phone: ambulance.phone,
        vehicles: ambulance.vehicles
      }
    });
  } catch (error) {
    console.error('Ambulance registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

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
