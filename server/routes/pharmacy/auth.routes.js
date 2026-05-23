import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Pharmacy from '../../models/postgres/pharmacy.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from '../shared/registrationHelpers.js';

const pharmUploadFields = createUploadMiddleware('contactIdCard');
const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/pharmacy/register
 */
router.post('/register', registerLimiter, pharmUploadFields, async (req, res) => {
  try {
    req.body = req.body || {};
    const { name, email, password, confirmPassword, phone, pharmacyType, city, state, address,
            pharmacistName, pharmacistQual, pharmacistRegNo,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Pharmacy name, email, password, phone, and city are required' });
    if (!pharmacistName || !pharmacistQual)
      return res.status(400).json({ success: false, message: 'Pharmacist name and qualification are required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await Pharmacy.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.status === 'pending') {
        return res.status(200).json({
          success: true,
          message: 'Your registration was already submitted and is pending review. We will contact you soon.',
          alreadyRegistered: true,
          registrationId: existing.id,
          entityType: 'pharmacy',
        });
      }
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'pharmacy', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'pharmacy', req });

    const pharmacy = await Pharmacy.create({
      name, email: normalizedEmail, password, phoneNumber: phone,
      address: { street: address || '', city, state: state || '', zipCode: '',
                 coordinates: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null },
      metadata: {
        registrationDocs: docs,
        pharmacyType: pharmacyType || 'Retail Pharmacy',
        primaryContact: { name: pharmacistName, qualification: pharmacistQual,
                          regNumber: pharmacistRegNo || '', idCard },
        submittedAt: new Date(),
      },
      status: 'pending', isVerified: false,
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: pharmacy.id, entityType: 'pharmacy' });

    sendAdminLeadEmail({ entityLabel: 'Pharmacy', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: pharmacy.id,
      extraRows: [['Pharmacy Type', pharmacyType || 'Retail Pharmacy'], ['Pharmacist', pharmacistName], ['Qualification', pharmacistQual]],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ success: false, message: 'Email already registered' });
    console.error('Pharmacy registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

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

// OTP routes (send-email-otp, verify-email-otp, send-phone-otp, verify-phone-otp)
addOtpRoutes(router, 'Pharmacy', '#10b981');

export default router;
