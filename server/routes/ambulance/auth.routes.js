import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Ambulance from '../../models/postgres/ambulance.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from '../shared/registrationHelpers.js';

const ambulanceUploadFields = createUploadMiddleware('contactIdCard');
const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/ambulance/login
 * Authenticate ambulance service provider
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
    const ambulance = await Ambulance.findOne({ where: { email: normalizedEmail } });

    if (!ambulance) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Ambulance not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await ambulance.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, ambulance.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!ambulance.isActive()) {
      await auditLoginAttempt(req, ambulance.id, normalizedEmail, false, 'Ambulance inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    const token = ambulance.generateAuthToken();

    await auditLoginAttempt(req, ambulance.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      ambulance: ambulance.toJSON()
    });

  } catch (error) {
    console.error('Ambulance login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/ambulance/verify
 * Verify ambulance token
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
      ambulance: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/ambulance/logout
 * Logout ambulance (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /api/ambulance/register
 */
router.post('/register', registerLimiter, ambulanceUploadFields, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, ambulanceType, city, state, address,
            registrationNumber, managerName, managerPhone, vehicleRegNo,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Provider name, email, password, phone, and city are required' });
    if (!managerName)
      return res.status(400).json({ success: false, message: 'Fleet Manager name is required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await Ambulance.findOne({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'ambulance', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'ambulance', req });

    const ambulance = await Ambulance.create({
      providerName: name, email: normalizedEmail, password, phone,
      baseLocation: { street: address || '', city, state: state || '', zipCode: '',
                      latitude: lat ? parseFloat(lat) : null, longitude: lng ? parseFloat(lng) : null },
      ambulanceType: ambulanceType || 'BLS',
      registrationNumber: registrationNumber || null,
      metadata: {
        registrationDocs: docs,
        primaryContact: { name: managerName, phone: managerPhone || '', vehicleRegNo: vehicleRegNo || '', idCard },
        submittedAt: new Date(),
      },
      status: 'pending', isVerified: false,
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: ambulance.id, entityType: 'ambulance' });

    sendAdminLeadEmail({ entityLabel: 'Ambulance Service', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: ambulance.id,
      extraRows: [['Service Type', ambulanceType || 'BLS'], ...(registrationNumber ? [['Reg. Number', registrationNumber]] : []),
                  ['Fleet Manager', managerName], ...(managerPhone ? [['Manager Phone', managerPhone]] : []),
                  ...(vehicleRegNo ? [['Vehicle Reg', vehicleRegNo]] : [])],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Ambulance registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

// OTP routes
addOtpRoutes(router, 'Ambulance', '#f97316');

export default router;
