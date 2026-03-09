/**
 * Hospital Insurance Portal Authentication Routes
 * Separate login system for the Insurance Desk portal
 * Mounts at: /api/hospital-insurance/auth
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { authUser, requireRole } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * POST /hospital-insurance/auth/login
 * Authenticates hospital insurance desk users
 * Uses the hospital user pool but grants insurance-specific claims
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Demo/showcase credentials — works in all environments (including production)
    // This is a presentation-ready demo login that does not require a DB record
    const DEMO_EMAILS = ['insurance@mediczy.com', 'demo@mediczy.com'];
    const DEMO_PASSWORDS = ['Insurance123', 'Hospital123', 'Demo123'];

    if (DEMO_EMAILS.includes(email.toLowerCase().trim()) && DEMO_PASSWORDS.includes(password)) {
      const demoPayload = {
        id: 'demo-insurance-001',
        email: email.toLowerCase().trim(),
        role: 'hospital',
        userType: 'hospital',
        portal: 'insurance',
        hospitalId: 'demo-hospital-001',
        hospital_id: 'demo-hospital-001',
        hospitalName: 'Mediczy Demo Hospital',
      };

      const token = jwt.sign(demoPayload, JWT_CONFIG.SECRET || process.env.JWT_SECRET || 'mediczy-secret', {
        expiresIn: '24h',
      });

      return res.json({
        success: true,
        token,
        user: {
          id: demoPayload.id,
          email: demoPayload.email,
          name: demoPayload.hospitalName,
          hospitalName: demoPayload.hospitalName,
          role: 'insurance_desk',
          portal: 'insurance',
          city: 'Delhi',
          state: 'Delhi',
          phone: '+91 99999 99999',
        },
        demo: true,
      });
    }

    // Try PostgreSQL hospital model first
    let hospital = null;
    try {
      const { default: HospitalPostgres } = await import('../../models/postgres/hospital.model.postgres.js');
      hospital = await HospitalPostgres.findOne({ where: { email: email.toLowerCase().trim() } });
    } catch (e) {
      console.warn('[insurance-auth] PG hospital lookup failed:', e.message);
    }

    // Fallback to MongoDB hospital model
    if (!hospital) {
      try {
        const hospitalModel = await import('../../models/hospital.model.js');
        const Hospital = hospitalModel.default || hospitalModel;
        hospital = await Hospital.findOne({ email: email.toLowerCase().trim() });
      } catch (e) {
        console.warn('[insurance-auth] Mongo hospital lookup failed:', e.message);
      }
    }

    if (!hospital) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Hospital not found.' });
    }

    // Check password
    const plain = hospital.dataValues || hospital;
    let passwordValid = false;

    if (typeof hospital.comparePassword === 'function') {
      passwordValid = await hospital.comparePassword(password);
    } else if (typeof hospital.validatePassword === 'function') {
      passwordValid = await hospital.validatePassword(password);
    } else {
      // bcrypt fallback
      try {
        const bcrypt = await import('bcryptjs');
        const storedHash = plain.password || plain.passwordHash || plain.hashedPassword;
        if (storedHash) {
          passwordValid = await bcrypt.default.compare(password, storedHash);
        }
      } catch (e) {
        console.warn('[insurance-auth] Password compare error:', e.message);
      }
    }

    // Dev bypass for demo credentials
    if (!passwordValid && process.env.NODE_ENV !== 'production') {
      if (password === 'Insurance123' || password === 'Hospital123' || password === 'Demo123') {
        passwordValid = true;
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token with insurance portal claim
    const tokenPayload = {
      id: plain.id || plain._id,
      email: plain.email,
      role: 'hospital',
      portal: 'insurance',
      hospitalId: plain.id || plain._id,
      hospitalName: plain.name || plain.hospitalName,
    };

    const token = jwt.sign(tokenPayload, JWT_CONFIG.SECRET || process.env.JWT_SECRET || 'mediczy-secret', {
      expiresIn: '24h',
    });

    res.json({
      success: true,
      token,
      user: {
        id: plain.id || plain._id,
        email: plain.email,
        name: plain.name || plain.hospitalName,
        hospitalName: plain.name || plain.hospitalName,
        role: 'insurance_desk',
        portal: 'insurance',
        city: plain.city,
        state: plain.state,
        phone: plain.phone || plain.phoneNumber,
      },
    });
  } catch (error) {
    console.error('[insurance-auth] Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

/**
 * GET /hospital-insurance/auth/verify
 * Verify token validity
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET || process.env.JWT_SECRET || 'mediczy-secret');

    res.json({
      success: true,
      user: {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        portal: decoded.portal || 'insurance',
        hospitalId: decoded.hospitalId,
        hospitalName: decoded.hospitalName,
      },
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

/**
 * POST /hospital-insurance/auth/logout
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
