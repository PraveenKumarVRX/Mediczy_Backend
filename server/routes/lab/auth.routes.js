import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { JWT_CONFIG } from '../../config/auth.config.js';
import Lab from '../../models/postgres/lab.model.postgres.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import bcrypt from 'bcryptjs';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

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

/**
 * POST /api/lab/register
 * Register a new diagnostic laboratory
 */
router.post('/register', authLimiter, upload.array('documents', 5), async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      phoneNumber,
      licenseNumber,
      address,
      city,
      state,
      labType = 'Diagnostic'
    } = req.body;

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and phone are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await Lab.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const registrationDocs = [];
    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const { uploadToMinio } = await import('../../services/minio-upload.service.js');
          const result = await uploadToMinio({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, keyPrefix: 'registrations/lab' });
          if (result.success) registrationDocs.push({ name: file.originalname, url: result.url, key: result.key, size: file.size, uploadedAt: new Date() });
        } catch (e) { console.warn('Lab doc upload skipped:', e.message); }
      }
    }

    const lab = await Lab.create({
      name,
      email: normalizedEmail,
      password,
      phoneNumber,
      licenseNumber: licenseNumber || null,
      address: address ? { street: address, city: city || '', state: state || '' } : {},
      labType,
      metadata: { registrationDocs, submittedAt: new Date() },
      status: 'pending',
      isVerified: false
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review and activate your account within 24–48 hours.',
      registrationId: lab.id,
      entityType: 'lab'
    });
  } catch (error) {
    console.error('Lab registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

export default router;
