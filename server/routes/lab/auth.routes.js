import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Lab from '../../models/postgres/lab.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import bcrypt from 'bcryptjs';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from '../shared/registrationHelpers.js';

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

    if (lab.status === 'pending') {
      await auditLoginAttempt(req, lab.id, normalizedEmail, false, 'Lab pending approval');
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is under review by our team. You will receive an email once approved.'
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

const labUploadFields = createUploadMiddleware('contactIdCard');

/**
 * POST /api/lab/register  (full security: bot-protection, ClamAV, MinIO, admin email)
 */
router.post('/register', registerLimiter, labUploadFields, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, labType, city, state, address,
            registrationNumber, directorName, directorQual, directorRegNo, medicalCouncil,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Name, email, password, phone, and city are required' });
    if (!directorName || !directorQual)
      return res.status(400).json({ success: false, message: 'Lab Director name and qualification are required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await Lab.findOne({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'lab', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'lab', req });

    const lab = await Lab.create({
      name, email: normalizedEmail, password, phoneNumber: phone,
      address: { street: address || '', city, state: state || '', zipCode: '',
                 coordinates: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null },
      labType: labType || 'Pathology',
      registrationNumber: registrationNumber || null,
      metadata: { registrationDocs: docs,
        primaryContact: { name: directorName, qualification: directorQual,
                          regNumber: directorRegNo || '', medicalCouncil: medicalCouncil || '', idCard },
        submittedAt: new Date() },
      status: 'pending', isVerified: false,
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: lab.id, entityType: 'lab' });

    sendAdminLeadEmail({ entityLabel: 'Lab', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: lab.id,
      extraRows: [['Lab Type', labType || 'Pathology'], ...(registrationNumber ? [['Reg. Number', registrationNumber]] : []),
                  ['Director', directorName], ['Qualification', directorQual]],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Lab registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

// OTP routes (send-email-otp, verify-email-otp, send-phone-otp, verify-phone-otp)
addOtpRoutes(router, 'Lab', '#8b5cf6');

export default router;
