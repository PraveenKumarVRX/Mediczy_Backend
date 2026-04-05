import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { Sequelize } from 'sequelize';
import { JWT_CONFIG } from '../../config/auth.config.js';
import { authLimiter } from '../../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../../middleware/audit.middleware.js';
import Hospital from '../../models/hospital.model.intelligent.js';

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

// Database connection
const sequelize = new Sequelize(
  process.env.POSTGRES_DATABASE || 'mediczy_ai',
  process.env.POSTGRES_USER || 'mediczy_helper',
  process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper',
  {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    dialect: 'postgres',
    logging: false
  }
);

// Clinic Login - Now using database
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🏥 Clinic login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Query hospital/clinic from database
    const clinics = await sequelize.query(
      `SELECT id, hospital_name, email, password, phone_number, city, state,
              registration_number, total_beds, available_beds, specializations,
              facilities, metadata, status, is_verified
       FROM hospitals 
       WHERE email = :email 
       LIMIT 1`,
      {
        replacements: { email },
        type: Sequelize.QueryTypes.SELECT
      }
    );

    if (!clinics || clinics.length === 0) {
      console.warn('⚠️ Clinic not found:', email);
      await auditLoginAttempt(req, null, email, false, 'Clinic not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or clinic not found'
      });
    }

    const clinic = clinics[0];

    if (!clinic.password) {
      console.error('❌ Clinic has no password hash:', clinic.id);
      return res.status(500).json({
        success: false,
        message: 'Account configuration error. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, clinic.password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, clinic.id, email, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if clinic is pending approval
    if (clinic.status === 'pending') {
      await auditLoginAttempt(req, clinic.id, email, false, 'Clinic pending approval');
      return res.status(403).json({
        success: false,
        pending: true,
        message: 'Your account is under review by our team. You will receive an email once approved.'
      });
    }
    // Check if clinic is active
    if (clinic.status !== 'active') {
      await auditLoginAttempt(req, clinic.id, email, false, 'Clinic inactive');
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: clinic.id,
        email: clinic.email,
        type: 'clinic',
        name: clinic.hospital_name,
        userType: 'clinic',
        role: 'clinic'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Clinic login successful:', clinic.hospital_name);

    await auditLoginAttempt(req, clinic.id, email, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      clinic: {
        id: clinic.id,
        name: clinic.hospital_name,
        email: clinic.email,
        phone: clinic.phone_number,
        registrationNumber: clinic.registration_number,
        clinicType: clinic.metadata?.clinicType || 'General',
        numberOfRooms: clinic.metadata?.numberOfRooms || 0,
        city: clinic.city,
        state: clinic.state,
        totalBeds: clinic.total_beds,
        availableBeds: clinic.available_beds,
        specializations: clinic.specializations || [],
        facilities: clinic.facilities || [],
        isVerified: clinic.is_verified
      }
    });
  } catch (error) {
    console.error('❌ Clinic login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Verify Token
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

    res.json({
      success: true,
      clinic: decoded
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

/**
 * POST /api/clinic/register
 * Register a new clinic
 */
router.post('/register', authLimiter, upload.array('documents', 5), async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      phone,
      clinicType = 'general',
      address,
      city,
      state,
      registrationNumber
    } = req.body;

    if (!name || !email || !password || !phone || !city) {
      return res.status(400).json({ success: false, message: 'Name, email, password, phone, and city are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const existing = await Hospital.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Upload registration documents to MinIO (optional — graceful fallback)
    const registrationDocs = [];
    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const { uploadToMinio } = await import('../../services/minio-upload.service.js');
          const result = await uploadToMinio({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype, keyPrefix: 'registrations/clinic' });
          if (result.success) registrationDocs.push({ name: file.originalname, url: result.url, key: result.key, size: file.size, uploadedAt: new Date() });
        } catch (e) { console.warn('Clinic doc upload skipped:', e.message); }
      }
    }

    const clinic = await Hospital.create({
      hospitalName: name,
      email: email.toLowerCase(),
      password,
      phoneNumber: phone,
      city,
      state: state || '',
      address: address || '',
      registrationNumber: registrationNumber || null,
      metadata: { clinicType, registeredAs: 'clinic', registrationDocs, submittedAt: new Date() },
      status: 'pending',
      isVerified: false
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted. Our team will review and activate your account within 24–48 hours.',
      registrationId: clinic.id,
      entityType: 'clinic'
    });
  } catch (error) {
    console.error('Clinic registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
  }
});

export default router;
