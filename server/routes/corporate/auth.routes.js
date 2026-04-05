import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { JWT_CONFIG } from '../../config/auth.config.js';
import User from '../../models/postgres/user.model.postgres.js';
import Corporate from '../../models/postgres/corporate.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

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
 * POST /api/corporate/register
 * Register a new corporate account
 */
router.post('/register', authLimiter, upload.array('documents', 5), async (req, res) => {
  try {
    const {
      companyName,
      email,
      password,
      confirmPassword,
      phoneNumber,
      industry,
      employeeCount,
      city,
      state,
      gstNumber
    } = req.body;

    if (!companyName || !email || !password || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Company name, email, password, and phone are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).toLowerCase();

    const existingUser = await User.findOne({ where: { email: normalizedEmail, role: 'corporate_admin' } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const registrationDocs = [];
    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const { uploadToMinio } = await import('../../services/minio-upload.service.js');
          const result = await uploadToMinio({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, keyPrefix: 'registrations/corporate' });
          if (result.success) registrationDocs.push({ name: file.originalname, url: result.url, key: result.key, size: file.size, uploadedAt: new Date() });
        } catch (e) { console.warn('Corporate doc upload skipped:', e.message); }
      }
    }

    // Create corporate entity
    const corporate = await Corporate.create({
      companyName,
      email: normalizedEmail,
      phoneNumber,
      industry: industry || null,
      employeeCount: employeeCount ? parseInt(employeeCount) : null,
      address: { city: city || '', state: state || '' },
      gstNumber: gstNumber || null,
      metadata: { registrationDocs, submittedAt: new Date() },
      status: 'Pending'
    });

    // Create admin user for login (pending status — login blocked until approved)
    await User.create({
      firstName: companyName,
      lastName: '',
      email: normalizedEmail,
      password,
      role: 'corporate_admin',
      status: 'pending',
      organization_id: corporate.id,
      phone: phoneNumber
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review and activate your account within 24–48 hours.',
      registrationId: corporate.id,
      entityType: 'corporate'
    });
  } catch (error) {
    console.error('Corporate registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

export default router;
