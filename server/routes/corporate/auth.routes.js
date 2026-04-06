import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import User from '../../models/postgres/user.model.postgres.js';
import Corporate from '../../models/postgres/corporate.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import {
  createUploadMiddleware, registerLimiter,
  uploadDocuments, uploadIdCard, sendAdminLeadEmail, addOtpRoutes,
} from '../shared/registrationHelpers.js';

const corpUploadFields = createUploadMiddleware('contactIdCard');
const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/corporate/login
 * Authenticate corporate account
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    const normalizedEmail = String(email).toLowerCase();
    // Check for pending corporate user first
    const pendingUser = await User.findOne({ where: { email: normalizedEmail, role: 'corporate_admin', status: 'pending' } });
    if (pendingUser) {
      await auditLoginAttempt(req, pendingUser.id, normalizedEmail, false, 'Corporate pending approval');
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is under review by our team. You will receive an email once approved.'
      });
    }

    const corporateUser = await User.findOne({
      where: {
        email: normalizedEmail,
        role: 'corporate_admin',
        status: 'active'
      }
    });

    if (!corporateUser) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Corporate admin not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await corporateUser.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, corporateUser.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = corporateUser.generateAuthToken();
    await corporateUser.update({ lastLoginAt: new Date() });

    await auditLoginAttempt(req, corporateUser.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      corporate: {
        id: corporateUser.id,
        email: corporateUser.email,
        role: corporateUser.role,
        organizationId: corporateUser.organization_id || null
      }
    });

  } catch (error) {
    console.error('Corporate login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/corporate/verify
 * Verify corporate token
 */
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];


    if (!JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable not set!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    res.status(200).json({
      success: true,
      corporate: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/corporate/logout
 * Logout corporate (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /api/corporate/register  (full security: bot-protection, ClamAV, MinIO, admin email)
 */
router.post('/register', registerLimiter, corpUploadFields, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, industry, employeeCount,
            city, state, address, registrationNumber, contactPersonName, gstNumber,
            _hp, _fat, lat, lng } = req.body;

    if (_hp?.trim()) return res.status(201).json({ success: true });
    if (_fat && Date.now() - parseInt(_fat, 10) < 4000) return res.status(201).json({ success: true });
    if (!name || !email || !password || !phone || !city)
      return res.status(400).json({ success: false, message: 'Company name, email, password, phone, and city are required' });
    if (!contactPersonName)
      return res.status(400).json({ success: false, message: 'HR / Admin Contact name is required' });
    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const normalizedEmail = email.toLowerCase();
    const existing = await Corporate.findOne({ where: { email: normalizedEmail } });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const emailKey = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const docs   = await uploadDocuments({ files: req.files?.documents || [], emailKey, entityKey: 'corporate', req });
    const idCard = await uploadIdCard({ file: req.files?.contactIdCard?.[0], emailKey, entityKey: 'corporate', req });

    const corporate = await Corporate.create({
      companyName: name, email: normalizedEmail, password, phoneNumber: phone,
      address: { street: address || '', city, state: state || '', zipCode: '',
                 coordinates: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null },
      industry: industry || null,
      contactPerson: contactPersonName,
      employeeCount: employeeCount ? parseInt(employeeCount, 10) : null,
      gstNumber: gstNumber || null,
      registrationNumber: registrationNumber || null,
      metadata: { registrationDocs: docs,
        primaryContact: { name: contactPersonName, idCard },
        submittedAt: new Date() },
      status: 'Active',  // Corporate model uses capital-A Active
    });

    res.status(201).json({ success: true, message: 'Application submitted. Our team will review within 24–48 hours.', registrationId: corporate.id, entityType: 'corporate' });

    sendAdminLeadEmail({ entityLabel: 'Corporate', name, email: normalizedEmail, phone, city, state: state || '',
      registrationId: corporate.id,
      extraRows: [['Industry', industry || 'N/A'], ['Employee Count', employeeCount || 'N/A'],
                  ...(gstNumber ? [['GST Number', gstNumber]] : []), ['HR Contact', contactPersonName]],
      docs, idCardMeta: idCard });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Corporate registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

// OTP routes (send-email-otp, verify-email-otp, send-phone-otp, verify-phone-otp)
addOtpRoutes(router, 'Corporate', '#6366f1');

export default router;
