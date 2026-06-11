import express from 'express';
import { body, param, query } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import { Doctor, User } from '../models/index.js';
import {
  issuePortalTokenPair,
  rotatePortalRefreshToken,
  listActivePortalSessions,
  revokePortalSessionForUser,
  revokeOtherPortalSessions,
} from '../services/token-revocation.service.js';
import tenantPartnerService from '../services/tenant-partner.service.js';
import {
  buildDoctorMediaKeyPrefix,
  buildPublicFileUrl,
  createPresignedUpload,
  getUploadsBucket
} from '../services/s3-presign.service.js';
import { uploadToMinio } from '../services/minio-upload.service.js';
import { normalizeDoctorProfile } from '../utils/doctorNormalizer.js';

const router = express.Router();
// Ensure request bodies are parsed even if app-level parser order changes.
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const getCurrentAccessJti = (req) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || !JWT_CONFIG.SECRET) return null;
    const decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    return decoded?.jti || null;
  } catch {
    return null;
  }
};

// Sensitive fields that must NEVER be returned in public doctor listing APIs
const DOCTOR_SENSITIVE_FIELDS = [
  'password', 'passwordResetToken', 'passwordResetExpires',
  'verificationDocuments', 'documents', 'metadata',
  'search_vector', 'uid', 'unique_id', 'userId',
  'lastLoginAt', 'lastActivityAt',
  'passwordResetToken', 'passwordResetExpires'
];

// Configure multer for file uploads — memory storage (file goes to MinIO)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const mimeType = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimeType && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and documents are allowed'));
    }
  }
});

const validMediaTypes = ['profilePicture', 'digitalSignature', 'medicalSeal', 'clinicImage'];
const doctorMediaMimeTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// normalizeDoctorProfile is imported from utils/doctorNormalizer.js above

const normalizeClinicLocationUpdate = (payload = {}, existingDoctor = null) => {
  const nextPayload = { ...payload };
  const existingJson = (existingDoctor?.clinicAddress_json && typeof existingDoctor.clinicAddress_json === 'object')
    ? existingDoctor.clinicAddress_json
    : {};
  const incomingJson = (payload.clinicAddress_json && typeof payload.clinicAddress_json === 'object')
    ? payload.clinicAddress_json
    : {};

  const clinicAddressJson = { ...existingJson, ...incomingJson };

  const placeId =
    payload.placeId ||
    payload.place_id ||
    payload.googlePlaceId ||
    payload.google_place_id ||
    incomingJson.placeId ||
    incomingJson.place_id ||
    incomingJson.googlePlaceId ||
    incomingJson.google_place_id;

  if (placeId) {
    const normalizedPlaceId = String(placeId).trim();
    clinicAddressJson.placeId = normalizedPlaceId;
    clinicAddressJson.place_id = normalizedPlaceId;
    clinicAddressJson.googlePlaceId = normalizedPlaceId;
    clinicAddressJson.google_place_id = normalizedPlaceId;
    clinicAddressJson.source = clinicAddressJson.source || 'google_places';
    clinicAddressJson.provider = clinicAddressJson.provider || 'google_places';
    clinicAddressJson.verificationStatus = 'verified';
    clinicAddressJson.verifiedAt = new Date().toISOString();
  }

  const lat =
    toFiniteNumber(payload.latitude) ??
    toFiniteNumber(payload.lat) ??
    toFiniteNumber(payload.practiceLatitude) ??
    toFiniteNumber(incomingJson.latitude) ??
    toFiniteNumber(incomingJson.lat);
  const lng =
    toFiniteNumber(payload.longitude) ??
    toFiniteNumber(payload.lng) ??
    toFiniteNumber(payload.lon) ??
    toFiniteNumber(payload.practiceLongitude) ??
    toFiniteNumber(incomingJson.longitude) ??
    toFiniteNumber(incomingJson.lng) ??
    toFiniteNumber(incomingJson.lon);

  if (lat !== null) {
    clinicAddressJson.latitude = lat;
    clinicAddressJson.lat = lat;
  }
  if (lng !== null) {
    clinicAddressJson.longitude = lng;
    clinicAddressJson.lng = lng;
  }

  if (payload.practiceCity && !clinicAddressJson.city) clinicAddressJson.city = payload.practiceCity;
  if (payload.practiceState && !clinicAddressJson.state) clinicAddressJson.state = payload.practiceState;
  if (payload.practiceZipCode && !clinicAddressJson.pincode) clinicAddressJson.pincode = payload.practiceZipCode;

  if (Object.keys(clinicAddressJson).length > 0) {
    nextPayload.clinicAddress_json = clinicAddressJson;
  }

  if (!nextPayload.clinicAddress) {
    const fallbackAddress = payload.practiceAddress || existingDoctor?.clinicAddress;
    if (typeof fallbackAddress === 'string' && fallbackAddress.trim()) {
      nextPayload.clinicAddress = fallbackAddress.trim();
    }
  }

  return nextPayload;
};

// ==========================================================================
// DOCTOR LISTING & SEARCH
// ==========================================================================

/**
 * @route   GET /api/doctors/available
 * @desc    List available doctors (verified + active by default)
 * @access  Public
 */
router.get('/available', [
  query('search').optional().trim(),
  query('specialization').optional().notEmpty(),
  query('city').optional().notEmpty(),
  query('consultationType').optional().isIn(['online', 'walkIn', 'homeVisit']),
  query('strictQc').optional().isBoolean(),
  query('isVerified').optional().isBoolean(),
  query('isOnline').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const {
      search,
      specialization,
      city,
      consultationType,
      strictQc,
      isVerified,
      isOnline,
      page = 1,
      limit = 20
    } = req.query;

    const whereClause = {
      status: 'active'
    };

    const onlineCapabilityLiteral = `("isOnline" = true)`;

    const hasAddressLiteral = `(
      ("clinicAddress" IS NOT NULL AND BTRIM("clinicAddress") <> '')
      OR COALESCE("clinicAddress_json", '{}'::jsonb) <> '{}'::jsonb
    )`;

    const googleVerifiedLocationLiteral = `(
      COALESCE(
        "clinicAddress_json"->>'placeId',
        "clinicAddress_json"->>'place_id',
        "clinicAddress_json"->>'googlePlaceId',
        "clinicAddress_json"->>'google_place_id',
        ''
      ) <> ''
      OR (
        COALESCE("clinicAddress_json"->>'source', '') ILIKE 'google%'
        AND COALESCE("clinicAddress_json"->>'verificationStatus', '') IN ('verified', 'VERIFIED')
      )
      OR (
        COALESCE("clinicAddress_json"->>'provider', '') ILIKE 'google%'
        AND (("clinicAddress_json" ? 'lat') OR ("clinicAddress_json" ? 'latitude'))
        AND (("clinicAddress_json" ? 'lng') OR ("clinicAddress_json" ? 'longitude') OR ("clinicAddress_json" ? 'lon'))
      )
    )`;

    const inPersonCapabilityLiteral = `(
      ${hasAddressLiteral}
      AND ${googleVerifiedLocationLiteral}
    )`;

    const strictQcLiteral = `(
      ${onlineCapabilityLiteral}
      OR (
        COALESCE(
          NULLIF("clinicAddress_json"->>'city', ''),
          NULLIF(metadata->'web_scraped'->'address'->>'city', ''),
          NULLIF(metadata->'web_scraped'->>'city', ''),
          ''
        ) <> ''
        AND
        COALESCE(
          NULLIF("clinicAddress_json"->>'state', ''),
          NULLIF(metadata->'web_scraped'->'address'->>'state', ''),
          ''
        ) <> ''
      )
    )`;

    if (specialization) {
      whereClause.specialization = specialization;
    }

    if (city) {
      whereClause.city = city;
    }

    if (isVerified !== undefined) {
      whereClause.isVerified = isVerified === 'true';
    } else {
      whereClause.isVerified = true;
    }

    if (isOnline !== undefined) {
      whereClause.isOnline = isOnline === 'true';
    }

    if (search) {
      whereClause[sequelize.Sequelize.Op.or] = [
        { firstName: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { lastName: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { specialization: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const strictQcEnabled = strictQc !== 'false';

    if (strictQcEnabled) {
      if (!whereClause[sequelize.Sequelize.Op.and]) {
        whereClause[sequelize.Sequelize.Op.and] = [];
      }
      whereClause[sequelize.Sequelize.Op.and].push(sequelize.literal(strictQcLiteral));
    }

    if (consultationType) {
      const normalizedConsultationType = String(consultationType).toLowerCase();

      if (normalizedConsultationType === 'online') {
        if (!whereClause[sequelize.Sequelize.Op.and]) {
          whereClause[sequelize.Sequelize.Op.and] = [];
        }
        whereClause[sequelize.Sequelize.Op.and].push(sequelize.literal(onlineCapabilityLiteral));
      }

      if (
        normalizedConsultationType === 'inperson' ||
        normalizedConsultationType === 'in-person' ||
        normalizedConsultationType === 'walkin' ||
        normalizedConsultationType === 'walk-in' ||
        normalizedConsultationType === 'homevisit' ||
        normalizedConsultationType === 'home-visit'
      ) {
        if (!whereClause[sequelize.Sequelize.Op.and]) {
          whereClause[sequelize.Sequelize.Op.and] = [];
        }
        whereClause[sequelize.Sequelize.Op.and].push(sequelize.literal(inPersonCapabilityLiteral));
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: doctors } = await doctorModel.findAndCountAll({
      where: whereClause,
      attributes: { exclude: DOCTOR_SENSITIVE_FIELDS },
      limit: parseInt(limit),
      offset,
      order: [
        ['isOnline', 'DESC'],
        ['rating', 'DESC'],
        ['createdAt', 'DESC']
      ]
    });

    const normalizedDoctors = doctors.map(normalizeDoctorProfile);
    res.json({
      success: true,
      doctors: normalizedDoctors,
      data: normalizedDoctors,  // Add data alias for compatibility with frontend
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get available doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available doctors'
    });
  }
});

/**
 * @route   GET /api/doctors/partnered
 * @desc    List doctors from partner clinics for corporate users
 * @access  Private (Corporate user)
 */
router.get('/partnered', authUser, async (req, res) => {
  try {
    const corporateTenantId = req.user?.organization_type === 'corporate'
      ? (req.user.organization_id || req.user.tenant_id)
      : null;

    if (!corporateTenantId) {
      return res.status(403).json({
        success: false,
        message: 'Corporate tenant context required'
      });
    }

    const partnerIds = await tenantPartnerService.listActivePartnerIds(corporateTenantId);
    if (partnerIds.length === 0) {
      return res.json({
        success: true,
        doctors: [],
        count: 0
      });
    }

    const doctors = await doctorModel.findAll({
      where: {
        organization_type: 'clinic',
        organization_id: { [sequelize.Sequelize.Op.in]: partnerIds },
        isVerified: true
      },
      attributes: { exclude: DOCTOR_SENSITIVE_FIELDS },
      order: [
        ['isOnline', 'DESC'],
        ['rating', 'DESC'],
        ['createdAt', 'DESC']
      ]
    });

    return res.json({
      success: true,
      doctors: doctors.map(normalizeDoctorProfile),
      count: doctors.length
    });
  } catch (error) {
    console.error('Get partnered doctors error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch partner clinic doctors'
    });
  }
});

/**
 * @route   GET /api/doctors
 * @desc    List all doctors with optional filters
 * @access  Public
 */
router.get('/', [
  query('search').optional().trim(),
  query('specialization').optional().notEmpty(),
  query('city').optional().notEmpty(),
  query('consultationType').optional().isIn(['online', 'walkIn', 'homeVisit']),
  query('isVerified').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 2000 })
], async (req, res) => {
  try {
    const {
      search,
      specialization,
      city,
      consultationType,
      isVerified,
      page = 1,
      limit = 20
    } = req.query;

    // Build where clause
    const whereClause = {};

    const onlineCapabilityLiteral = `("isOnline" = true)`;

    const hasAddressLiteral = `(
      ("clinicAddress" IS NOT NULL AND BTRIM("clinicAddress") <> '')
      OR COALESCE("clinicAddress_json", '{}'::jsonb) <> '{}'::jsonb
    )`;

    const googleVerifiedLocationLiteral = `(
      COALESCE(
        "clinicAddress_json"->>'placeId',
        "clinicAddress_json"->>'place_id',
        "clinicAddress_json"->>'googlePlaceId',
        "clinicAddress_json"->>'google_place_id',
        ''
      ) <> ''
      OR (
        COALESCE("clinicAddress_json"->>'source', '') ILIKE 'google%'
        AND COALESCE("clinicAddress_json"->>'verificationStatus', '') IN ('verified', 'VERIFIED')
      )
      OR (
        COALESCE("clinicAddress_json"->>'provider', '') ILIKE 'google%'
        AND (("clinicAddress_json" ? 'lat') OR ("clinicAddress_json" ? 'latitude'))
        AND (("clinicAddress_json" ? 'lng') OR ("clinicAddress_json" ? 'longitude') OR ("clinicAddress_json" ? 'lon'))
      )
    )`;

    const inPersonCapabilityLiteral = `(
      ${hasAddressLiteral}
      AND ${googleVerifiedLocationLiteral}
    )`;

    if (specialization) {
      whereClause.specialization = specialization;
    }

    if (city) {
      whereClause.city = city;
    }

    if (isVerified !== undefined) {
      whereClause.isVerified = isVerified === 'true';
    }

    // Search in name or specialization
    if (search) {
      whereClause[sequelize.Sequelize.Op.or] = [
        { firstName: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { lastName: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } },
        { specialization: { [sequelize.Sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    if (consultationType) {
      const normalizedConsultationType = String(consultationType).toLowerCase();

      if (normalizedConsultationType === 'online') {
        if (!whereClause[sequelize.Sequelize.Op.and]) {
          whereClause[sequelize.Sequelize.Op.and] = [];
        }
        whereClause[sequelize.Sequelize.Op.and].push(sequelize.literal(onlineCapabilityLiteral));
      }

      if (
        normalizedConsultationType === 'inperson' ||
        normalizedConsultationType === 'in-person' ||
        normalizedConsultationType === 'walkin' ||
        normalizedConsultationType === 'walk-in' ||
        normalizedConsultationType === 'homevisit' ||
        normalizedConsultationType === 'home-visit'
      ) {
        if (!whereClause[sequelize.Sequelize.Op.and]) {
          whereClause[sequelize.Sequelize.Op.and] = [];
        }
        whereClause[sequelize.Sequelize.Op.and].push(sequelize.literal(inPersonCapabilityLiteral));
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: doctors } = await doctorModel.findAndCountAll({
      where: whereClause,
      attributes: { exclude: DOCTOR_SENSITIVE_FIELDS },
      limit: parseInt(limit),
      offset,
      order: [
        ['isVerified', 'DESC'],
        ['rating', 'DESC'],
        ['createdAt', 'DESC']
      ]
    });

    res.json({
      success: true,
      doctors: doctors.map(normalizeDoctorProfile),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('List doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors'
    });
  }
});

// ==========================================================================
// DOCTOR AUTHENTICATION & REGISTRATION
// ==========================================================================

/**
 * @route   POST /api/doctors/register
 * @desc    Register new doctor with comprehensive profile
 * @access  Public
 */
router.post('/register', [
  body('prefix').optional().isIn(['Dr', 'Prof', 'Dr.']),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phoneNumber').notEmpty().withMessage('Phone number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('specialization').notEmpty().withMessage('Specialization is required'),
  body('experience').isInt({ min: 0 }).withMessage('Experience must be a positive number'),
  body('registrationNumber').optional({ nullable: true }).trim(),
  body('medicalCouncil').optional({ nullable: true }).trim()
], async (req, res) => {
  try {
    // Check if doctor already exists
    const existingDoctor = await doctorModel.findOne({
      where: { email: req.body.email }
    });

    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: 'Doctor with this email already exists'
      });
    }

    const payload = { ...req.body };

    // Normalize optional registration fields so Postgres UNIQUE doesn't collide on empty strings.
    if (typeof payload.registrationNumber === 'string') {
      const normalized = payload.registrationNumber.trim();
      payload.registrationNumber = normalized || null;
    }
    if (typeof payload.medicalCouncil === 'string') {
      const normalizedCouncil = payload.medicalCouncil.trim();
      payload.medicalCouncil = normalizedCouncil || null;
    }

    // Create doctor profile
    const doctor = await doctorModel.create(payload);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: doctor.id,
        doctorId: doctor.id,
        email: doctor.email,
        role: 'doctor',
        userType: 'doctor'
      },
      JWT_CONFIG.SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    res.status(201).json({
      success: true,
      message: 'Doctor registered successfully',
      doctor: {
        id: doctor.id,
        name: `${doctor.prefix} ${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        specialization: doctor.specialization,
        verificationStatus: doctor.verificationStatus
      },
      token
    });
  } catch (error) {
    console.error('Doctor registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register doctor',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/login
 * @desc    Doctor login
 * @access  Public
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, phone, phoneNumber, identifier, password } = req.body;
    const rawIdentifier = email || phone || phoneNumber || identifier;
    const password_val = password;

    if (!rawIdentifier || !password_val) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number and password are required'
      });
    }

    const identifierStr = String(rawIdentifier).trim();
    const digitsOnly = identifierStr.replace(/[^0-9]/g, '');
    const isPhone = digitsOnly.length >= 7 && digitsOnly.length <= 15 && !/[@.]/.test(identifierStr);
    const normalizedPhone = isPhone
      ? (digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly)
      : null;
    const normalizedEmail = isPhone ? null : identifierStr.toLowerCase();

    const loginIdentifier = normalizedEmail || normalizedPhone || identifierStr;

    // Find doctor by email or phone number
    let doctor = null;
    if (!isPhone) {
      doctor = await doctorModel.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('email')),
          sequelize.fn('LOWER', normalizedEmail)
        )
      });
    } else {
      // Try phone match using regexp_replace to normalize stored numbers
      doctor = await doctorModel.findOne({
        where: sequelize.where(
          sequelize.fn('regexp_replace', sequelize.col('phoneNumber'), '[^0-9]', '', 'g'),
          normalizedPhone
        )
      });
      if (!doctor) {
        doctor = await doctorModel.findOne({ where: { phoneNumber: normalizedPhone } });
      }
      if (!doctor) {
        doctor = await doctorModel.findOne({ where: { phoneNumber: identifierStr } });
      }
    }
    const normalizedIdentifier = loginIdentifier;
    if (!doctor) {
      await auditLoginAttempt(req, null, normalizedIdentifier, false, 'Doctor not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errorCode: 'DOCTOR_NOT_FOUND'
      });
    }

    if (doctor.status && doctor.status !== 'active') {
      await auditLoginAttempt(req, doctor.id, normalizedIdentifier, false, `Doctor inactive: ${doctor.status}`);
      return res.status(403).json({
        success: false,
        message: 'Doctor account is inactive or suspended. Contact support.',
        errorCode: 'DOCTOR_INACTIVE',
      });
    }

    if (doctor.isActive === false) {
      await auditLoginAttempt(req, doctor.id, normalizedIdentifier, false, 'Doctor disabled (isActive=false)');
      return res.status(403).json({
        success: false,
        message: 'Doctor account has been disabled. Contact support.',
        errorCode: 'DOCTOR_DISABLED',
      });
    }

    // A doctor may also have a patient/user row with the same email.
    // Once a doctor record is found and active, authenticate against the doctor password.

    // Verify password — detect SHA-256 legacy hashes (64 hex chars, no $2b$ prefix)
    // and transparently upgrade to bcrypt on successful login
    let isValidPassword = false;
    const isSha256Legacy = /^[a-f0-9]{64}$/.test(doctor.password);
    if (isSha256Legacy) {
      const sha256Input = crypto.createHash('sha256').update(password_val).digest('hex');
      isValidPassword = sha256Input === doctor.password;
      if (isValidPassword) {
        try {
          const newHash = await bcrypt.hash(password_val, 10);
          await doctor.update({ password: newHash });
        } catch (upgradeErr) {
          console.warn('[doctor-login] bcrypt upgrade failed (non-fatal):', upgradeErr.message);
        }
      }
    } else {
      isValidPassword = typeof doctor.comparePassword === 'function'
        ? await doctor.comparePassword(password_val)
        : await bcrypt.compare(password_val, doctor.password);
    }
    if (!isValidPassword) {
      await auditLoginAttempt(req, doctor.id, normalizedIdentifier, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errorCode: 'INVALID_PASSWORD'
      });
    }

    if (!doctor.isVerified) {
      await auditLoginAttempt(req, doctor.id, normalizedIdentifier, false, 'Account pending activation');
      return res.status(403).json({
        success: false,
        message: 'Your registration is under review. Our team will activate your account after document verification. Please check your email for updates.',
        pendingActivation: true,
        errorCode: 'DOCTOR_PENDING_ACTIVATION',
      });
    }

    // Update last login
    try {
      if (typeof doctor.update === 'function') {
        await doctor.update({ lastLoginAt: new Date() });
      } else if (typeof doctor.save === 'function') {
        doctor.lastLoginAt = new Date();
        await doctor.save();
      }
    } catch (updateError) {
      console.warn('Doctor lastLoginAt update failed:', updateError.message);
    }

    const deviceFp = req.headers['x-device-fingerprint'] || null;
    const { accessToken: token, refreshToken } = await issuePortalTokenPair(
      { id: doctor.id, email: doctor.email, role: 'doctor' },
      { portal: 'doctor', deviceFp, accessTtl: '4h' }
    );

    await auditLoginAttempt(req, doctor.id, normalizedIdentifier, true);

    res.json({
      success: true,
      message: 'Login successful',
      expiresIn: 14400,
      refreshToken,
      doctor: {
        id: doctor.id,
        name: `${doctor.prefix} ${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        specialization: doctor.specialization,
        isVerified: doctor.isVerified,
        profilePicture: doctor.profilePicture
      },
      token
    });
  } catch (error) {
    console.error('Doctor login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/forgot-password
 * @desc    Request a password reset OTP (public — no auth required)
 * @access  Public
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required' });
    }
    const passwordResetService = (await import('../services/password-reset.service.js')).default;
    const result = await passwordResetService.requestPasswordReset({ email, phone, userType: 'doctor' });
    return res.json(result);
  } catch (error) {
    console.error('[doctor/forgot-password] error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to process password reset request' });
  }
});

/**
 * @route   POST /api/doctors/refresh
 * @desc    Rotate doctor refresh token and issue a new access token pair
 * @access  Public (refresh token required)
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'refreshToken is required',
        errorCode: 'REFRESH_TOKEN_REQUIRED',
      });
    }

    const deviceFp = req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || null;
    const result = await rotatePortalRefreshToken(refreshToken, {
      portal: 'doctor',
      deviceFp,
      accessTtl: '4h',
      resolvePayload: async (decoded) => {
        const doctor = await doctorModel.findByPk(decoded.userId);
        if (!doctor) return null;
        if (doctor.status && doctor.status !== 'active') return null;
        if (doctor.isActive === false) return null;
        if (!doctor.isVerified) return null;
        return { id: doctor.id, email: doctor.email, role: 'doctor' };
      }
    });

    if (!result) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        errorCode: 'INVALID_REFRESH_TOKEN',
      });
    }

    return res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: 14400,
    });
  } catch (error) {
    console.error('Doctor refresh error:', error);
    return res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      errorCode: 'TOKEN_REFRESH_FAILED',
    });
  }
});

/**
 * @route   POST /api/doctors/session/bootstrap
 * @desc    Silent session restore for mobile app startup (rotate refresh token + return doctor profile)
 * @access  Public (refresh token required)
 */
router.post('/session/bootstrap', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'refreshToken is required',
        errorCode: 'REFRESH_TOKEN_REQUIRED',
      });
    }

    const deviceFp = req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || null;
    let resolvedDoctor = null;

    const result = await rotatePortalRefreshToken(refreshToken, {
      portal: 'doctor',
      deviceFp,
      accessTtl: '4h',
      resolvePayload: async (decoded) => {
        const doctor = await doctorModel.findByPk(decoded.userId);
        if (!doctor) return null;
        if (doctor.status && doctor.status !== 'active') return null;
        if (doctor.isActive === false) return null;
        if (!doctor.isVerified) return null;
        resolvedDoctor = doctor;
        return { id: doctor.id, email: doctor.email, role: 'doctor' };
      }
    });

    if (!result || !resolvedDoctor) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        errorCode: 'INVALID_REFRESH_TOKEN',
      });
    }

    return res.json({
      success: true,
      token: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: 14400,
      doctor: {
        id: resolvedDoctor.id,
        firstName: resolvedDoctor.firstName,
        lastName: resolvedDoctor.lastName,
        email: resolvedDoctor.email,
        specialization: resolvedDoctor.specialization,
        isVerified: !!resolvedDoctor.isVerified,
        profilePicture: resolvedDoctor.profilePicture || null,
      },
    });
  } catch (error) {
    console.error('Doctor session bootstrap error:', error);
    return res.status(401).json({
      success: false,
      message: 'Session bootstrap failed',
      errorCode: 'SESSION_BOOTSTRAP_FAILED',
    });
  }
});

/**
 * @route   GET /api/doctors/sessions
 * @desc    List active doctor sessions (simple device list)
 * @access  Private (Doctor)
 */
router.get('/sessions', authUser, requireRole('doctor'), async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const currentJti = getCurrentAccessJti(req);
    const currentDeviceFp = req.headers['x-device-fingerprint'] || null;

    const rows = await listActivePortalSessions(doctorId, 'doctor');
    const sessions = rows.map((row, index) => ({
      id: row.jti,
      deviceFingerprint: row.device_fp || null,
      isCurrentSession: Boolean((currentJti && row.jti === currentJti) || (currentDeviceFp && row.device_fp === currentDeviceFp && index === 0)),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));

    return res.json({ success: true, sessions });
  } catch (error) {
    console.error('Doctor sessions list error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch active sessions',
    });
  }
});

/**
 * @route   DELETE /api/doctors/sessions/:sessionId
 * @desc    Logout a selected doctor device/session
 * @access  Private (Doctor)
 */
router.delete('/sessions/:sessionId', authUser, requireRole('doctor'), async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    const ok = await revokePortalSessionForUser(doctorId, 'doctor', sessionId);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    return res.json({ success: true, message: 'Session logged out successfully' });
  } catch (error) {
    console.error('Doctor session revoke error:', error);
    return res.status(500).json({ success: false, message: 'Failed to revoke session' });
  }
});

/**
 * @route   POST /api/doctors/sessions/logout-others
 * @desc    Keep current session, logout all other doctor sessions
 * @access  Private (Doctor)
 */
router.post('/sessions/logout-others', authUser, requireRole('doctor'), async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const currentJti = getCurrentAccessJti(req);
    const revokedCount = await revokeOtherPortalSessions(doctorId, 'doctor', currentJti);

    return res.json({
      success: true,
      message: 'Logged out from other devices',
      revokedCount,
    });
  } catch (error) {
    console.error('Doctor logout others error:', error);
    return res.status(500).json({ success: false, message: 'Failed to logout other sessions' });
  }
});

/**
 * @route   POST /api/doctors/login-diagnostics
 * @desc    Admin-only diagnostic endpoint to explain doctor login failures
 * @access  Private (Admin)
 */
router.post('/login-diagnostics', authUser, requireRole(['admin', 'system_admin', 'super_admin']), async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const raw = String(identifier || '').trim();

    if (!raw) {
      return res.status(400).json({
        success: false,
        message: 'identifier is required',
      });
    }

    const digitsOnly = raw.replace(/[^0-9]/g, '');
    const isPhone = digitsOnly.length >= 7 && digitsOnly.length <= 15 && !raw.includes('@');
    const normalizedEmail = isPhone ? null : raw.toLowerCase();
    const normalizedPhone = isPhone ? (digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly) : null;

    let doctor = null;
    if (normalizedEmail) {
      doctor = await doctorModel.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('email')),
          sequelize.fn('LOWER', normalizedEmail)
        )
      });
    } else {
      const candidates = [raw, normalizedPhone, `+91${normalizedPhone}`, `91${normalizedPhone}`].filter(Boolean);
      for (const phoneCandidate of candidates) {
        doctor = await doctorModel.findOne({ where: { phoneNumber: phoneCandidate } });
        if (doctor) break;
      }
    }

    const userRecord = normalizedEmail
      ? await User.findOne({
        where: sequelize.where(
          sequelize.fn('lower', sequelize.col('email')),
          normalizedEmail
        ),
        attributes: ['id', 'role', 'isAdmin', 'status']
      })
      : null;

    let passwordMatch = null;
    if (doctor && typeof password === 'string' && password.length > 0) {
      passwordMatch = typeof doctor.comparePassword === 'function'
        ? await doctor.comparePassword(password)
        : await bcrypt.compare(password, doctor.password);
    }

    const checks = {
      doctorFound: !!doctor,
      doctorActiveStatus: doctor ? (doctor.status === 'active') : null,
      doctorEnabled: doctor ? (doctor.isActive !== false) : null,
      doctorVerified: doctor ? (!!doctor.isVerified) : null,
      crossRoleConflict: !!(userRecord && userRecord.role !== 'doctor' && !userRecord.isAdmin),
      passwordMatch,
    };

    let outcomeCode = 'LOGIN_OK';
    if (!checks.doctorFound) outcomeCode = 'DOCTOR_NOT_FOUND';
    else if (!checks.doctorActiveStatus) outcomeCode = 'DOCTOR_INACTIVE';
    else if (!checks.doctorEnabled) outcomeCode = 'DOCTOR_DISABLED';
    else if (checks.crossRoleConflict) outcomeCode = 'PATIENT_PORTAL_ACCOUNT';
    else if (!checks.doctorVerified) outcomeCode = 'DOCTOR_PENDING_ACTIVATION';
    else if (checks.passwordMatch === false) outcomeCode = 'INVALID_PASSWORD';

    return res.json({
      success: true,
      identifier: raw,
      normalized: {
        email: normalizedEmail,
        phone: normalizedPhone,
      },
      outcomeCode,
      checks,
      doctor: doctor ? {
        id: doctor.id,
        email: doctor.email,
        phoneNumber: doctor.phoneNumber,
        status: doctor.status,
        isActive: doctor.isActive,
        isVerified: doctor.isVerified,
      } : null,
      linkedUser: userRecord ? {
        id: userRecord.id,
        role: userRecord.role,
        isAdmin: !!userRecord.isAdmin,
        status: userRecord.status,
      } : null,
    });
  } catch (error) {
    console.error('Doctor login diagnostics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to run login diagnostics',
      error: error.message,
    });
  }
});

// ==========================================================================
// DOCTOR PROFILE MANAGEMENT
// ==========================================================================

/**
 * @route   GET /api/doctors/profile
 * @desc    Get doctor's own profile
 * @access  Private (Doctor)
 */
router.get('/profile', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await doctorModel.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }

    // Convert Sequelize instance to plain object
    const doctorData = doctor.get ? doctor.get({ plain: true }) : doctor;
    const { password, ...doctorProfile } = doctorData;

    res.json({
      success: true,
      doctor: doctorProfile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/profile
 * @desc    Update doctor profile
 * @access  Private (Doctor)
 */
router.put('/profile', authUser, [
  body('firstName').optional().notEmpty(),
  body('lastName').optional().notEmpty(),
  body('phoneNumber').optional().notEmpty(),
  body('specialization').optional().notEmpty(),
  body('experience').optional().isInt({ min: 0 }),
  body('about').optional().isLength({ max: 1000 }),
  body('languages').optional().isArray()
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await doctorModel.findByPk(req.user.id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const normalizedPayload = normalizeClinicLocationUpdate(req.body, doctor);

    // Update profile using the model's update method
    const updatedDoctor = await doctorModel.update(req.user.id, normalizedPayload);

    const { password, ...doctorProfile } = updatedDoctor;

    console.log(`Doctor profile updated for ID ${req.user.id}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      doctor: doctorProfile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// ==========================================================================
// CONSULTATION TYPES & FEES
// ==========================================================================

/**
 * @route   PUT /api/doctors/consultation-types
 * @desc    Update consultation types and fees
 * @access  Private (Doctor)
 */
router.put('/consultation-types', authUser, [
  body('online.available').optional().isBoolean(),
  body('online.fee').optional().isFloat({ min: 0 }),
  body('online.duration').optional().isInt({ min: 5, max: 120 }),
  body('walkIn.available').optional().isBoolean(),
  body('walkIn.fee').optional().isFloat({ min: 0 }),
  body('homeVisit.available').optional().isBoolean(),
  body('homeVisit.fee').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    await doctorModel.updateConsultationFees(req.user.id, req.body);

    res.json({
      success: true,
      message: 'Consultation types updated successfully'
    });
  } catch (error) {
    console.error('Update consultation types error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consultation types',
      error: error.message
    });
  }
});

// ==========================================================================
// AVAILABILITY MANAGEMENT
// ==========================================================================

/**
 * @route   PUT /api/doctors/availability
 * @desc    Update weekly availability slots
 * @access  Private (Doctor)
 */
router.put('/availability', authUser, [
  body('*.isAvailable').optional().isBoolean(),
  body('*.slots').optional().isArray(),
  body('*.slots.*.startTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('*.slots.*.endTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('*.slots.*.consultationType').optional().isIn(['online', 'walkIn', 'both'])
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    await doctorModel.updateAvailability(req.user.id, req.body);

    res.json({
      success: true,
      message: 'Availability updated successfully'
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/:doctorId/slots
 * @desc    Get available slots for a specific date
 * @access  Public
 */
router.get('/:doctorId/slots', [
  param('doctorId').notEmpty(),
  query('date').isISO8601().withMessage('Valid date required (YYYY-MM-DD)'),
  query('consultationType').optional().isIn(['online', 'walkIn', 'homeVisit'])
], async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, consultationType = 'online' } = req.query;

    let doctor = null;
    if (/^\d+$/.test(doctorId)) {
      doctor = await Doctor.findByPk(doctorId);
    } else if (/^D[A-Z0-9]{5}$/i.test(doctorId)) {
      doctor = await Doctor.findOne({ where: { unique_id: doctorId.toUpperCase() } });
    }
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const slots = await doctorModel.getAvailableSlots(doctor.id, date, consultationType);

    res.json({
      success: true,
      date,
      consultationType,
      slots
    });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: error.message
    });
  }
});

// ==========================================================================
// MEDIA UPLOADS
// ==========================================================================

/**
 * @route   POST /api/doctors/upload/:mediaType
 * @desc    Upload doctor media (profile, signature, seal, clinic images)
 * @access  Private (Doctor)
 */
router.post('/upload/:mediaType', authUser, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const { mediaType } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid media type'
      });
    }

    // Upload to MinIO with AV scan
    const { url: minioUrl } = await uploadToMinio({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      keyPrefix: `uploads/doctors/${req.user.id}/${mediaType}`,
    });

    await doctorModel.updateMedia(req.user.id, mediaType, minioUrl);

    res.json({
      success: true,
      message: 'Media uploaded successfully',
      mediaType,
      url: minioUrl
    });
  } catch (error) {
    if (error.code === 'MALWARE_DETECTED') {
      const detail = error.avResult?.detail || '';
      const threat = detail.replace(/^.*:\s*/, '').replace(/\s*FOUND\s*$/, '').trim() || 'Unknown threat';
      return res.status(400).json({
        success: false,
        code: 'MALWARE_DETECTED',
        message: 'File rejected: malware detected in uploaded file',
        threat
      });
    }
    console.error('Upload media error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/upload/:mediaType/presign
 * @desc    Create presigned URL for doctor media upload
 * @access  Private (Doctor)
 */
router.post('/upload/:mediaType/presign', authUser, [
  body('fileName').notEmpty().withMessage('fileName is required'),
  body('contentType').notEmpty().withMessage('contentType is required')
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const { mediaType } = req.params;
    const { fileName, contentType } = req.body;

    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid media type'
      });
    }

    if (!doctorMediaMimeTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type'
      });
    }

    const tenantId = req.tenantId || req.user.organization_id || null;
    const keyPrefix = buildDoctorMediaKeyPrefix(tenantId, req.user.id, mediaType).replace(/\/$/, '');

    const presign = await createPresignedUpload({
      keyPrefix,
      fileName,
      contentType,
      tenantId,
      userId: req.user.id,
      metadata: { media_type: mediaType }
    });

    return res.status(200).json({
      success: true,
      message: 'Presigned upload URL generated',
      data: presign
    });
  } catch (error) {
    console.error('Doctor media presign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate presigned URL',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/upload/:mediaType/confirm
 * @desc    Save doctor media after S3 upload
 * @access  Private (Doctor)
 */
router.post('/upload/:mediaType/confirm', authUser, [
  body('fileKey').notEmpty().withMessage('fileKey is required'),
  body('mimeType').notEmpty().withMessage('mimeType is required')
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const { mediaType } = req.params;
    const { fileKey, mimeType } = req.body;

    if (!validMediaTypes.includes(mediaType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid media type'
      });
    }

    if (!doctorMediaMimeTypes.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type'
      });
    }

    const tenantId = req.tenantId || req.user.organization_id || null;
    const expectedPrefix = buildDoctorMediaKeyPrefix(tenantId, req.user.id, mediaType);
    if (!fileKey.startsWith(expectedPrefix)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file key for doctor'
      });
    }

    const bucket = getUploadsBucket();
    const fileUrl = buildPublicFileUrl(fileKey, bucket);

    await doctorModel.updateMedia(req.user.id, mediaType, fileUrl);

    return res.json({
      success: true,
      message: 'Media saved successfully',
      mediaType,
      url: fileUrl
    });
  } catch (error) {
    console.error('Doctor media confirm error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save media',
      error: error.message
    });
  }
});

// ==========================================================================
// DOCTOR SEARCH & DISCOVERY
// ==========================================================================

/**
 * @route   GET /api/doctors/search
 * @desc    Search doctors with filters
 * @access  Public
 */
router.get('/search', [
  query('specialization').optional().notEmpty(),
  query('city').optional().notEmpty(),
  query('consultationType').optional().isIn(['online', 'walkIn', 'homeVisit']),
  query('languages').optional(),
  query('maxFee').optional().isFloat({ min: 0 }),
  query('isVerified').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const filters = {
      specialization: req.query.specialization,
      city: req.query.city,
      consultationType: req.query.consultationType,
      languages: req.query.languages ? req.query.languages.split(',') : undefined,
      maxFee: req.query.maxFee ? parseFloat(req.query.maxFee) : undefined,
      isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

    const doctors = await doctorModel.searchDoctors(filters);

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedDoctors = doctors.slice(startIndex, endIndex);

    // Remove sensitive data and normalize to consistent schema
    const publicDoctors = paginatedDoctors.map(doctor => {
      const { password, verificationDocuments, ...publicDoctor } = doctor;
      return normalizeDoctorProfile(publicDoctor);
    });

    res.json({
      success: true,
      doctors: publicDoctors,
      pagination: {
        page,
        limit,
        total: doctors.length,
        pages: Math.ceil(doctors.length / limit)
      },
      filters
    });
  } catch (error) {
    console.error('Search doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search doctors',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/:doctorId/public
 * @desc    Get public doctor profile
 * @access  Public
 */
router.get('/:doctorId/public', [
  param('doctorId').notEmpty()
], async (req, res) => {
  try {
    const { doctorId } = req.params;

    let doctor = null;
    if (/^\d+$/.test(doctorId)) {
      doctor = await doctorModel.findByPk(doctorId);
    } else if (/^D[A-Z0-9]{5}$/i.test(doctorId)) {
      doctor = await Doctor.findOne({ where: { unique_id: doctorId.toUpperCase() } });
    }
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Check if doctor is verified - status 'pending' is allowed if isVerified is true
    const isActive = doctor.isVerified || doctor.status === 'active';
    if (!isActive) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile is not active'
      });
    }

    // Remove sensitive information, then normalize to consistent schema
    const {
      password,
      verificationDocuments,
      digitalSignature,
      medicalSeal,
      ...publicProfile
    } = typeof doctor.toJSON === 'function' ? doctor.toJSON() : doctor;

    res.json({
      success: true,
      doctor: normalizeDoctorProfile(publicProfile)
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor profile',
      error: error.message
    });
  }
});

// ==========================================================================
// ADMIN ROUTES
// ==========================================================================

/**
 * @route   GET /api/doctors/admin/all
 * @desc    Get all doctors (Admin only)
 * @access  Private (Admin)
 */
router.get('/admin/all', authUser, requireRole('admin'), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('verificationStatus').optional().isIn(['pending', 'verified', 'rejected'])
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const verificationStatus = req.query.verificationStatus;

    let doctors = await doctorModel.findAll();

    // Filter by verification status if provided
    if (verificationStatus) {
      doctors = doctors.filter(doctor => doctor.verificationStatus === verificationStatus);
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedDoctors = doctors.slice(startIndex, endIndex);

    res.json({
      success: true,
      doctors: paginatedDoctors,
      pagination: {
        page,
        limit,
        total: doctors.length,
        pages: Math.ceil(doctors.length / limit)
      }
    });
  } catch (error) {
    console.error('Get all doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/admin/:doctorId/verification
 * @desc    Update doctor verification status (Admin only)
 * @access  Private (Admin)
 */
router.put('/admin/:doctorId/verification', authUser, requireRole('admin'), [
  param('doctorId').notEmpty(),
  body('status').isIn(['pending', 'verified', 'rejected']),
  body('notes').optional().isLength({ max: 500 })
], async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { status, notes } = req.body;

    await doctorModel.updateVerificationStatus(doctorId, status, notes);

    res.json({
      success: true,
      message: 'Doctor verification status updated successfully'
    });
  } catch (error) {
    console.error('Update verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification status',
      error: error.message
    });
  }
});

// ==========================================================================
// SERVICE ENROLLMENT (Second Opinion & Home Visits)
// ==========================================================================

/**
 * @route   GET /api/doctors/services
 * @desc    Get current doctor's service offerings
 * @access  Private (Doctor)
 */
router.get('/services', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctor = await doctorModel.findByPk(req.user.id);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    res.json({
      success: true,
      data: {
        offersSecondOpinion: doctor.offersSecondOpinion || false,
        secondOpinionFee: doctor.secondOpinionFee || 0,
        offersHomeVisits: doctor.offersHomeVisits || false,
        homeVisitFee: doctor.homeVisitFee || 0,
        homeVisitRadiusKm: doctor.homeVisitRadiusKm || 0
      }
    });
  } catch (error) {
    console.error('Get doctor services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service preferences',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/doctors/services
 * @desc    Update doctor service enrollment (Second Opinion, Home Visits)
 * @access  Private (Doctor)
 */
router.put('/services', authUser, [
  body('offersSecondOpinion').optional().isBoolean(),
  body('secondOpinionFee').optional().isFloat({ min: 0 }),
  body('offersHomeVisits').optional().isBoolean(),
  body('homeVisitFee').optional().isFloat({ min: 0 }),
  body('homeVisitRadiusKm').optional().isInt({ min: 1, max: 100 }),
  body('practiceLocations').optional().isArray()
], async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const {
      offersSecondOpinion,
      secondOpinionFee,
      offersHomeVisits,
      homeVisitFee,
      homeVisitRadiusKm,
      practiceLocations
    } = req.body;

    // Update doctor services
    const updateData = {};
    if (typeof offersSecondOpinion === 'boolean') updateData.offersSecondOpinion = offersSecondOpinion;
    if (secondOpinionFee !== undefined) updateData.secondOpinionFee = secondOpinionFee;
    if (typeof offersHomeVisits === 'boolean') updateData.offersHomeVisits = offersHomeVisits;
    if (homeVisitFee !== undefined) updateData.homeVisitFee = homeVisitFee;
    if (homeVisitRadiusKm !== undefined) updateData.homeVisitRadiusKm = homeVisitRadiusKm;
    if (practiceLocations !== undefined) updateData.practiceLocations = practiceLocations;

    // File logging for debugging
    const logFile = '/tmp/doctor-service-debug.log';
    
    try {
      fs.appendFileSync(logFile, `\n=== ${new Date().toISOString()} ===\n`);
      fs.appendFileSync(logFile, `Doctor ID: ${req.user.id}\n`);
      fs.appendFileSync(logFile, `Update data: ${JSON.stringify(updateData)}\n`);
      
      const doctor = await Doctor.findByPk(req.user.id);
      
      if (!doctor) {
        fs.appendFileSync(logFile, `ERROR: Doctor not found\n`);
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      fs.appendFileSync(logFile, `Before: offersSecondOpinion=${doctor.offersSecondOpinion}, secondOpinionFee=${doctor.secondOpinionFee}\n`);

      // Update fields
      Object.keys(updateData).forEach(key => {
        doctor[key] = updateData[key];
      });

      await doctor.save();
      fs.appendFileSync(logFile, `Save completed\n`);

      // Verify
      const savedDoctor = await Doctor.findByPk(req.user.id);
      fs.appendFileSync(logFile, `After: offersSecondOpinion=${savedDoctor.offersSecondOpinion}, secondOpinionFee=${savedDoctor.secondOpinionFee}\n`);

      const responsePayload = {
        success: true,
        message: 'Service preferences updated successfully',
        data: updateData,
        savedValues: {
          offersSecondOpinion: savedDoctor.offersSecondOpinion,
          secondOpinionFee: savedDoctor.secondOpinionFee,
          offersHomeVisits: savedDoctor.offersHomeVisits,
          homeVisitFee: savedDoctor.homeVisitFee,
          homeVisitRadiusKm: savedDoctor.homeVisitRadiusKm,
          practiceLocations: savedDoctor.practiceLocations
        }
      };

      fs.appendFileSync(logFile, `Response: ${JSON.stringify(responsePayload)}\n`);
      res.json(responsePayload);
    } catch (fileError) {
      fs.appendFileSync(logFile, `ERROR: ${fileError.message}\n`);
      throw fileError;
    }
  } catch (error) {
    console.error('Update doctor services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service preferences',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/services/second-opinion
 * @desc    Get doctors offering second opinion service
 * @access  Public
 */
router.get('/services/second-opinion', async (req, res) => {
  try {
    const { specialization, page = 1, limit = 20 } = req.query;

    const whereClause = {
      offersSecondOpinion: true,
      isVerified: true,
      status: 'active'
    };

    if (specialization) {
      whereClause.specialization = specialization;
    }

    const doctors = await doctorModel.findAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['rating', 'DESC']]
    });

    res.json({
      success: true,
      data: doctors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get second opinion doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/services/home-visits
 * @desc    Get doctors offering home visit service
 * @access  Public
 */
router.get('/services/home-visits', async (req, res) => {
  try {
    const { specialization, page = 1, limit = 20 } = req.query;

    const whereClause = {
      offersHomeVisits: true,
      isVerified: true,
      status: 'active'
    };

    if (specialization) {
      whereClause.specialization = specialization;
    }

    const doctors = await doctorModel.findAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['rating', 'DESC']]
    });

    res.json({
      success: true,
      data: doctors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get home visit doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
});

// ==========================================================================
// MESSAGING & COMMUNICATION
// ==========================================================================

/**
 * @route   GET /api/doctors/messages
 * @desc    Get doctor's chat conversations
 * @access  Private (Doctor)
 */
router.get('/messages', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctorId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    // Get doctor's appointments to build conversation list
    const { Appointment } = await import('../models/index.js');
    
    const appointments = await Appointment.findAll({
      where: { doctorId },
      attributes: ['id', 'userId', 'patientName', 'patientPhone', 'status', 'appointmentDate', 'appointmentTime', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Build conversations from appointments
    const conversations = appointments
      .filter(apt => apt.userId && ['confirmed', 'in-progress', 'completed'].includes(apt.status))
      .map(apt => ({
        id: `conv_${doctorId}_${apt.userId}`,
        appointmentId: apt.id,
        patient: {
          id: apt.userId,
          name: apt.patientName,
          phone: apt.patientPhone
        },
        lastMessage: null,
        unreadCount: 0,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        status: apt.status,
        updatedAt: apt.updatedAt
      }));

    res.json({
      success: true,
      conversations,
      unreadCount: 0,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: conversations.length
      }
    });
  } catch (error) {
    console.error('Get doctor messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/doctors/messages/:patientId
 * @desc    Get chat messages with a specific patient
 * @access  Private (Doctor)
 */
router.post('/messages/start', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Access denied. Doctor role required.' });
    }

    const doctorId = req.user.id;
    const { patientId, appointmentId, message } = req.body || {};
    if (!patientId && !appointmentId) {
      return res.status(400).json({ success: false, message: 'patientId or appointmentId is required' });
    }

    const { Appointment } = await import('../models/index.js');
    const where = { doctorId };
    if (appointmentId) where.id = appointmentId;
    if (patientId) where.userId = patientId;

    const appointment = await Appointment.findOne({ where, order: [['updatedAt', 'DESC']] });
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'No appointment found with this patient' });
    }

    const resolvedPatientId = appointment.userId || patientId;
    const conversation = {
      id: 'conv_' + doctorId + '_' + resolvedPatientId,
      appointmentId: appointment.id,
      patient: { id: resolvedPatientId, name: appointment.patientName, phone: appointment.patientPhone },
      lastMessage: message ? { content: message, senderType: 'doctor', createdAt: new Date().toISOString() } : null,
      unreadCount: 0,
      status: appointment.status,
      updatedAt: new Date().toISOString()
    };

    return res.status(201).json({ success: true, message: 'Conversation ready', conversation });
  } catch (error) {
    console.error('Start doctor conversation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to start conversation', error: error.message });
  }
});

router.get('/messages/:patientId', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctorId = req.user.id;
    const { patientId } = req.params;
    const { appointmentId, limit = 50 } = req.query;
    
    // Verify doctor has an appointment with this patient
    const { Appointment } = await import('../models/index.js');
    
    const where = { doctorId, userId: patientId };
    if (appointmentId) {
      where.id = appointmentId;
    }
    
    const appointment = await Appointment.findOne({
      where,
      order: [['updatedAt', 'DESC']]
    });
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'No appointment found with this patient'
      });
    }

    // Get patient info
    const userModel = (await import('../models/user.model.intelligent.js')).default;
    const patient = await userModel.findByPk(patientId);

    res.json({
      success: true,
      conversationId: `conv_${doctorId}_${patientId}`,
      appointmentId: appointment.id,
      patient: {
        id: patientId,
        name: patient ? `${patient.firstName} ${patient.lastName}` : appointment.patientName,
        phone: patient?.phoneNumber || patient?.phone || appointment.patientPhone,
        email: patient?.email
      },
      messages: [],
      appointmentStatus: appointment.status,
      canChat: ['confirmed', 'in-progress'].includes(appointment.status)
    });
  } catch (error) {
    console.error('Get patient messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/doctors/messages/:patientId
 * @desc    Send message to a patient
 * @access  Private (Doctor)
 */
router.post('/messages/:patientId', authUser, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Doctor role required.'
      });
    }

    const doctorId = req.user.id;
    const { patientId } = req.params;
    const { message, appointmentId } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    // Verify appointment exists
    const { Appointment } = await import('../models/index.js');
    
    const where = { doctorId, userId: patientId };
    if (appointmentId) {
      where.id = appointmentId;
    }
    
    const appointment = await Appointment.findOne({ where });
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'No appointment found with this patient'
      });
    }

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      conversationId: `conv_${doctorId}_${patientId}`,
      appointmentId: appointment.id,
      senderId: doctorId,
      senderType: 'doctor',
      recipientId: patientId,
      recipientType: 'patient',
      content: message,
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    // TODO: Store in database
    // TODO: Send real-time notification via socket.io
    // TODO: Send push notification to patient

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });
  } catch (error) {
    console.error('Send message to patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

/**
 * POST /smart-route — Symptom-based smart doctor ranking
 * Returns top matching doctors sorted by relevance and fees
 */
router.post('/smart-route', async (req, res) => {
  try {
    const { symptoms = [], specialty, maxFee, consultationType = 'online', limit = 10 } = req.body;

    // Symptom → specialization map
    const symptomMap = {
      'chest pain': 'cardiologist', 'heart': 'cardiologist', 'palpitation': 'cardiologist',
      'skin': 'dermatologist', 'rash': 'dermatologist', 'acne': 'dermatologist', 'itch': 'dermatologist',
      'eye': 'ophthalmologist', 'vision': 'ophthalmologist', 'squint': 'ophthalmologist',
      'child': 'pediatrician', 'baby': 'pediatrician', 'infant': 'pediatrician', 'kid': 'pediatrician',
      'bone': 'orthopedic', 'joint': 'orthopedic', 'fracture': 'orthopedic', 'knee': 'orthopedic',
      'teeth': 'dentist', 'dental': 'dentist', 'gum': 'dentist',
      'mental': 'psychiatrist', 'anxiety': 'psychiatrist', 'depression': 'psychiatrist', 'stress': 'psychologist',
      'sugar': 'diabetologist', 'diabetes': 'diabetologist', 'thyroid': 'endocrinologist',
      'stomach': 'gastroenterologist', 'acidity': 'gastroenterologist', 'liver': 'hepatologist',
      'urine': 'urologist', 'kidney': 'nephrologist',
      'pregnancy': 'gynecologist', 'periods': 'gynecologist', 'women': 'gynecologist',
      'brain': 'neurologist', 'headache': 'neurologist', 'migraine': 'neurologist',
      'lungs': 'pulmonologist', 'breath': 'pulmonologist', 'asthma': 'pulmonologist',
      'ear': 'ent', 'nose': 'ent', 'throat': 'ent',
      'cancer': 'oncologist', 'tumor': 'oncologist',
      'blood': 'hematologist', 'infection': 'general physician', 'fever': 'general physician',
    };

    // Derive target specialization from symptoms or explicit specialty
    let targetSpecialty = specialty || null;
    if (!targetSpecialty && symptoms.length > 0) {
      const lowerSymptoms = symptoms.map(s => s.toLowerCase()).join(' ');
      for (const [keyword, spec] of Object.entries(symptomMap)) {
        if (lowerSymptoms.includes(keyword)) { targetSpecialty = spec; break; }
      }
    }

    const { Op } = sequelize.constructor ?? {};
    const where = {};
    if (targetSpecialty) {
      // Use Sequelize literal if Op not available (since sequelize.constructor may differ)
      where.specialization = sequelize.literal
        ? sequelize.literal(`LOWER("specialization") LIKE '%${targetSpecialty.toLowerCase().replace(/'/g, '')}%'`)
        : { [Op?.iLike ?? Symbol()]: `%${targetSpecialty}%` };
    }
    if (maxFee) where.consultationFees = sequelize.literal
      ? sequelize.literal(`"consultationFees" <= ${parseInt(maxFee, 10)}`)
      : { [Op?.lte ?? Symbol()]: parseInt(maxFee, 10) };

    const rawDoctors = await Doctor.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'specialization', 'consultationFees', 'isAvailable', 'profilePicture'],
      order: [['consultationFees', 'ASC'], ['firstName', 'ASC']],
      limit: parseInt(limit, 10) > 20 ? 20 : parseInt(limit, 10),
    });

    const doctors = rawDoctors.map(d => ({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`.trim(),
      specialization: d.specialization,
      consultationFees: d.consultationFees,
      availableToday: d.isAvailable !== false,
      profilePicture: d.profilePicture || null,
      recommendedReason: targetSpecialty
        ? `Best match for ${targetSpecialty}`
        : 'Available doctor',
    }));

    res.json({ success: true, data: doctors, matchedSpecialty: targetSpecialty });
  } catch (error) {
    console.error('Smart route error:', error);
    res.status(500).json({ success: false, message: 'Smart routing failed', error: error.message });
  }
});

export default router;
