import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { JWT_CONFIG } from '../../config/auth.config.js';
import HomecareProvider from '../../models/postgres/homecare.model.postgres.js';
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
const JWT_SECRET = JWT_CONFIG.SECRET;

/**
 * POST /api/homecare/login
 * Authenticate homecare service provider
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
    const provider = await HomecareProvider.findOne({ where: { email: normalizedEmail } });

    if (!provider) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Homecare provider not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await provider.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, provider.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (provider.status === 'pending') {
      await auditLoginAttempt(req, provider.id, normalizedEmail, false, 'Homecare pending approval');
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is under review by our team. You will receive an email once approved.'
      });
    }
    if (!provider.isActive()) {
      await auditLoginAttempt(req, provider.id, normalizedEmail, false, 'Homecare provider inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    const token = provider.generateAuthToken();

    await auditLoginAttempt(req, provider.id, normalizedEmail, true);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      homecare: provider.toJSON()
    });

  } catch (error) {
    console.error('Homecare login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

/**
 * GET /api/homecare/verify
 * Verify homecare token
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
      homecare: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
});

/**
 * POST /api/homecare/logout
 * Logout homecare (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /api/homecare/register
 * Register a new homecare provider
 */
router.post('/register', authLimiter, upload.array('documents', 5), async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      phone,
      registrationNumber,
      address,
      city,
      state,
      serviceArea,
      providerType = 'homecare'
    } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and phone are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await HomecareProvider.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const registrationDocs = [];
    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const { uploadToMinio } = await import('../../services/minio-upload.service.js');
          const result = await uploadToMinio({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, keyPrefix: 'registrations/homecare' });
          if (result.success) registrationDocs.push({ name: file.originalname, url: result.url, key: result.key, size: file.size, uploadedAt: new Date() });
        } catch (e) { console.warn('Homecare doc upload skipped:', e.message); }
      }
    }

    const provider = await HomecareProvider.create({
      name,
      email: normalizedEmail,
      password,
      phone,
      registrationNumber: registrationNumber || null,
      address: address ? { street: address, city: city || '', state: state || '' } : {},
      serviceAreas: serviceArea ? [{ city: serviceArea }] : [],
      providerType,
      metadata: { registrationDocs, submittedAt: new Date() },
      status: 'pending',
      isVerified: false,
      isAvailable: false
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review and activate your account within 24–48 hours.',
      registrationId: provider.id,
      entityType: 'homecare'
    });
  } catch (error) {
    console.error('Homecare registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

export default router;
