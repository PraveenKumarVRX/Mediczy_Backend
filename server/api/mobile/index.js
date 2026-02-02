/**
 * Mobile API Gateway
 * Dedicated gateway for mobile applications (iOS/Android)
 * 
 * Features:
 * - Device detection and tracking
 * - Mobile-specific rate limiting
 * - Push notification token management
 * - Offline sync support
 * - Response optimization for mobile
 * - Version compatibility checking
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import bcrypt from 'bcrypt';
import { apiLimiter } from '../../middleware/rateLimiter.middleware.js';
import { requestLogger } from '../../middleware/logging.middleware.js';
import { errorHandler, notFoundHandler, asyncHandler } from '../../middleware/errorHandler.middleware.js';
import { multitenancyMiddleware as extractTenant } from '../../middleware/multitenancy.middleware.js';

const router = express.Router();

// ============== Mobile-Specific Middleware ==============

/**
 * Extract and validate mobile client info
 */
const extractMobileInfo = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const appVersion = req.headers['x-app-version'];
  const deviceId = req.headers['x-device-id'];
  const platform = req.headers['x-platform']; // ios, android, flutter
  const buildNumber = req.headers['x-build-number'];
  
  req.mobileClient = {
    isNative: !!platform,
    platform: platform || detectPlatform(userAgent),
    appVersion,
    deviceId,
    buildNumber,
    userAgent,
    isIOS: platform === 'ios' || userAgent.includes('iPhone') || userAgent.includes('iPad'),
    isAndroid: platform === 'android' || userAgent.includes('Android'),
    isFlutter: platform === 'flutter'
  };
  
  // Add client info to response headers
  res.setHeader('X-API-Version', '2.0.0');
  res.setHeader('X-Server-Time', new Date().toISOString());
  
  next();
};

/**
 * Detect platform from user agent
 */
const detectPlatform = (userAgent) => {
  if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iOS')) {
    return 'ios';
  }
  if (userAgent.includes('Android')) {
    return 'android';
  }
  return 'unknown';
};

/**
 * Check app version compatibility
 */
const versionCheck = (minVersion = '1.0.0') => {
  return (req, res, next) => {
    const appVersion = req.mobileClient?.appVersion;
    
    if (!appVersion) {
      // Allow requests without version header (web clients)
      return next();
    }
    
    if (compareVersions(appVersion, minVersion) < 0) {
      return res.status(426).json({
        success: false,
        error: {
          code: 'UPGRADE_REQUIRED',
          message: 'Please update your app to continue',
          minVersion,
          currentVersion: appVersion,
          updateUrl: {
            ios: 'https://apps.apple.com/app/mediczy/id123456789',
            android: 'https://play.google.com/store/apps/details?id=com.mediczy.app'
          }
        }
      });
    }
    
    next();
  };
};

/**
 * Compare semantic versions
 */
const compareVersions = (v1, v2) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

/**
 * Mobile-optimized response transformer
 */
const mobileResponseTransformer = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = (data) => {
    // Transform response for mobile clients
    if (req.mobileClient?.isNative) {
      // Add metadata for mobile apps
      const transformed = {
        ...data,
        _meta: {
          timestamp: Date.now(),
          serverTime: new Date().toISOString(),
          apiVersion: '2.0.0'
        }
      };
      
      // Convert snake_case to camelCase if needed
      if (req.query.camelCase === 'true') {
        return originalJson(transformToCamelCase(transformed));
      }
      
      return originalJson(transformed);
    }
    
    return originalJson(data);
  };
  
  next();
};

/**
 * Transform object keys to camelCase
 */
const transformToCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(transformToCamelCase);
  }
  
  if (obj && typeof obj === 'object') {
    const transformed = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      transformed[camelKey] = transformToCamelCase(value);
    }
    return transformed;
  }
  
  return obj;
};

// ============== Mobile Helper Utilities ==============

const otpFallbackStore = new Map();

const storeOtpFallback = (phone, code, ttlSeconds = 300) => {
  otpFallbackStore.set(phone, {
    code,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
};

const verifyOtpFallback = (phone, code) => {
  const entry = otpFallbackStore.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpFallbackStore.delete(phone);
    return false;
  }
  return entry.code === code;
};

const removeOtpFallback = (phone) => {
  otpFallbackStore.delete(phone);
};

const splitName = (name) => {
  if (!name) return { firstName: null, lastName: null };
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || null
  };
};

const buildAddress = (row) => {
  if (row.address) return row.address;
  const parts = [
    row.address_street,
    row.address_city,
    row.address_state,
    row.address_zip,
    row.address_country
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
};

const buildUserResponse = (row) => {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || null;
  return {
    id: row.id,
    name,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    email: row.email || null,
    phone: row.phone || null,
    avatar_url: row.avatar_url || null,
    date_of_birth: row.date_of_birth || null,
    gender: row.gender || null,
    blood_group: row.blood_group || null,
    address: buildAddress(row),
    role: row.role || null,
    status: row.status || null
  };
};

const normalizeSymptoms = (symptoms) => {
  if (!symptoms) return [];
  if (Array.isArray(symptoms)) return symptoms.filter(Boolean);
  return String(symptoms)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeTime = (timeValue) => {
  if (!timeValue) return null;
  const [hourPart, minutePart = '00'] = String(timeValue).trim().split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseTimeToMinutes = (timeValue) => {
  const normalized = normalizeTime(timeValue);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const expandSlotRange = (startTime, endTime, durationMinutes, consultationType) => {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null || durationMinutes <= 0) return [];
  const slots = [];
  for (let time = start; time + durationMinutes <= end; time += durationMinutes) {
    slots.push({
      slot_time: minutesToTime(time),
      consultation_type: consultationType || null
    });
  }
  return slots;
};

const buildAvailabilitySlots = (schedule, dayKey, durationMinutes) => {
  if (!schedule || !schedule[dayKey]) return [];
  const dayConfig = schedule[dayKey] || {};
  if (dayConfig.isAvailable === false || dayConfig.isOff === true) {
    return [];
  }

  const slots = [];
  if (Array.isArray(dayConfig.slots) && dayConfig.slots.length > 0) {
    for (const slot of dayConfig.slots) {
      slots.push(
        ...expandSlotRange(slot.startTime, slot.endTime, durationMinutes, slot.consultationType)
      );
    }
    return slots;
  }

  const online = dayConfig.online;
  if (online?.enabled) {
    slots.push(...expandSlotRange(online.startTime, online.endTime, durationMinutes, 'online'));
  }
  const inPerson = dayConfig.inPerson;
  if (inPerson?.enabled) {
    slots.push(...expandSlotRange(inPerson.startTime, inPerson.endTime, durationMinutes, 'in-person'));
  }

  return slots;
};

const upsertFcmToken = async ({ userId, userType = 'patient', token, deviceType }) => {
  if (!userId || !token) return;
  try {
    await db.query(`
      INSERT INTO fcm_tokens ("userId", "userType", token, "deviceType", "isActive", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
      ON CONFLICT (token) DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "userType" = EXCLUDED."userType",
        "deviceType" = EXCLUDED."deviceType",
        "isActive" = TRUE,
        "updatedAt" = NOW()
    `, [userId, userType, token, deviceType || 'mobile']);
  } catch (error) {
    console.warn('Failed to store push token:', error.message);
  }
};

const storeDeviceMetadata = async (userId, deviceInfo) => {
  if (!userId || !deviceInfo) return;
  try {
    await db.query(`
      UPDATE users
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          "updatedAt" = NOW()
      WHERE id = $1
    `, [userId, JSON.stringify({ mobile_device: deviceInfo })]);
  } catch (error) {
    console.warn('Failed to store device metadata:', error.message);
  }
};

// ============== Apply Middleware ==============

// CORS for mobile apps
router.use(cors({
  origin: '*', // Mobile apps don't send origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-App-Version', 
    'X-Device-Id', 
    'X-Platform',
    'X-Build-Number',
    'X-Push-Token'
  ]
}));

// Security
router.use(helmet({
  contentSecurityPolicy: false, // Not needed for API
  crossOriginEmbedderPolicy: false
}));

// Compression
router.use(compression());

// Request logging
router.use(requestLogger({ format: 'json' }));

// Rate limiting (more lenient for mobile)
router.use(apiLimiter);

// Mobile info extraction
router.use(extractMobileInfo);

// Response transformer
router.use(mobileResponseTransformer);

// Version check (minimum app version)
router.use(versionCheck('1.0.0'));

// Multi-tenancy
router.use(extractTenant);

// ============== Health & Status ==============

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Mobile API Gateway is healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      apiVersion: '2.0.0',
      minAppVersion: '1.0.0',
      maintenance: false,
      features: {
        pushNotifications: true,
        offlineSync: true,
        videoConsultation: true,
        aiDoctor: true
      },
      endpoints: {
        base: '/api/mobile',
        auth: '/api/mobile/auth',
        user: '/api/mobile/user',
        doctors: '/api/mobile/doctors',
        appointments: '/api/mobile/appointments'
      }
    }
  });
});

// ============== Organizations / Clinics ==============

/**
 * GET /api/mobile/organizations
 * List available organizations for signup
 * Can filter by type: clinic, hospital, corporate, lab, pharmacy, etc.
 */
router.get('/organizations', asyncHandler(async (req, res) => {
  const { type, query, city, page = 1, limit = 20 } = req.query;
  
  let sql = `
    SELECT id, name, slug, type, 
           address->>'city' as city, 
           address->>'state' as state
    FROM tenants 
    WHERE status = 'active'
  `;
  const params = [];
  let paramIndex = 1;
  
  // Filter by organization type
  if (type) {
    sql += ` AND type = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }
  
  // Search by name
  if (query) {
    sql += ` AND (name ILIKE $${paramIndex} OR slug ILIKE $${paramIndex})`;
    params.push(`%${query}%`);
    paramIndex++;
  }
  
  // Filter by city
  if (city) {
    sql += ` AND address->>'city' ILIKE $${paramIndex}`;
    params.push(`%${city}%`);
    paramIndex++;
  }
  
  sql += ` ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  
  const result = await db.query(sql, params);
  
  // Get total count
  let countSql = 'SELECT COUNT(*) FROM tenants WHERE status = $1';
  const countParams = ['active'];
  if (type) {
    countSql += ` AND type = $${countParams.length + 1}`;
    countParams.push(type);
  }
  if (query) {
    countSql += ` AND (name ILIKE $${countParams.length + 1} OR slug ILIKE $${countParams.length + 1})`;
    countParams.push(`%${query}%`);
  }
  if (city) {
    countSql += ` AND address->>'city' ILIKE $${countParams.length + 1}`;
    countParams.push(`%${city}%`);
  }
  
  const countResult = await db.query(countSql, countParams);
  const total = parseInt(countResult.rows[0].count);
  
  res.json({
    success: true,
    data: {
      organizations: result.rows.map(org => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        type: org.type,
        location: org.city ? `${org.city}${org.state ? ', ' + org.state : ''}` : null
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    }
  });
}));

/**
 * GET /api/mobile/organizations/:slug
 * Get organization details by slug
 */
router.get('/organizations/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  
  const result = await db.query(`
    SELECT id, name, slug, type, email, phone, website,
           address->>'street' as street,
           address->>'city' as city, 
           address->>'state' as state,
           address->>'country' as country,
           address->>'pincode' as pincode
    FROM tenants 
    WHERE slug = $1 AND status = 'active'
    LIMIT 1
  `, [slug]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Organization not found' }
    });
  }
  
  const org = result.rows[0];
  res.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      contact: {
        email: org.email,
        phone: org.phone,
        website: org.website
      },
      address: {
        street: org.street,
        city: org.city,
        state: org.state,
        country: org.country,
        pincode: org.pincode
      }
    }
  });
}));

// ============== Device Management ==============

import db from '../v2/db.js';

router.post('/devices/register', authenticate({ optional: true }), asyncHandler(async (req, res) => {
  const { deviceId, pushToken, platform, model, osVersion } = req.body;
  const userId = req.userId || req.user?.id;
  const userType = req.userRole === 'doctor'
    ? 'doctor'
    : (req.userRole === 'admin' ? 'admin' : 'patient');
  
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_DEVICE_ID', message: 'Device ID is required' }
    });
  }
  
  const deviceInfo = {
    deviceId,
    platform: platform || req.mobileClient?.platform || 'unknown',
    model: model || null,
    osVersion: osVersion || null,
    registeredAt: new Date().toISOString()
  };

  if (userId) {
    await storeDeviceMetadata(userId, deviceInfo);
  }

  if (userId && pushToken) {
    await upsertFcmToken({
      userId,
      userType,
      token: pushToken,
      deviceType: platform || req.mobileClient?.platform
    });
  }
  
  res.json({
    success: true,
    message: 'Device registered successfully'
  });
}));

router.put('/devices/push-token', authenticate({ optional: true }), asyncHandler(async (req, res) => {
  const { deviceId, pushToken } = req.body;
  const userId = req.userId || req.user?.id;
  const userType = req.userRole === 'doctor'
    ? 'doctor'
    : (req.userRole === 'admin' ? 'admin' : 'patient');
  
  if (!deviceId || !pushToken) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'deviceId and pushToken are required' }
    });
  }

  if (userId) {
    await storeDeviceMetadata(userId, {
      deviceId,
      pushToken,
      platform: req.mobileClient?.platform || 'unknown',
      updatedAt: new Date().toISOString()
    });
  }

  if (userId) {
    await upsertFcmToken({
      userId,
      userType,
      token: pushToken,
      deviceType: req.mobileClient?.platform
    });
  }
  
  res.json({
    success: true,
    message: 'Push token updated'
  });
}));

// ============== Auth Routes ==============

import { authenticate, generateToken, generateRefreshToken } from '../v2/auth.utils.js';

router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password, deviceId, pushToken } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'Email and password are required' }
    });
  }

  let result;
  try {
    result = await db.query(`
      SELECT u.id,
             u.email,
             u.password,
             u."firstName" AS first_name,
             u."lastName" AS last_name,
             u."phoneNumber" AS phone,
             u."profileImage" AS avatar_url,
             u."dateOfBirth" AS date_of_birth,
             u.gender,
             COALESCE(p."bloodGroup"::text, u."bloodType") AS blood_group,
             NULLIF(TRIM(CONCAT_WS(', ', u.address_street, u.address_city, u.address_state, u."address_zipCode", u.address_country)), '') AS address,
             u.role,
             u.status
      FROM users u
      LEFT JOIN patients p ON p."userId" = u.id
      WHERE u.email = $1
      LIMIT 1
    `, [email]);
  } catch (dbError) {
    console.error('Mobile login DB error:', dbError.code, dbError.message);
    throw dbError;
  }
  
  if (result.rows.length === 0) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_FAILED', message: 'Invalid credentials' }
    });
  }
  
  const user = result.rows[0];
  
  // Verify password using bcrypt
  // FIXED: Use bcrypt.compare instead of plaintext comparison
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_FAILED', message: 'Invalid credentials' }
    });
  }
  
  // Register device if provided
  if (deviceId) {
    await storeDeviceMetadata(user.id, {
      deviceId,
      pushToken: pushToken || null,
      platform: req.mobileClient?.platform || 'unknown',
      lastActive: new Date().toISOString()
    });
  }

  if (deviceId && pushToken) {
    const userType = user.role === 'doctor'
      ? 'doctor'
      : (user.role === 'admin' ? 'admin' : 'patient');
    await upsertFcmToken({
      userId: user.id,
      userType,
      token: pushToken,
      deviceType: req.mobileClient?.platform
    });
  }
  
  const userResponse = buildUserResponse(user);

  // Generate tokens with proper payload for authUser middleware
  // FIXED: Include userId, role, userType fields for compatibility
  const accessToken = generateToken({
    id: user.id,
    userId: user.id,
    email: user.email,
    name: userResponse.name,
    role: user.role || 'patient',
    userType: user.role || 'patient'
  }, 'patient');
  
  const refreshToken = generateRefreshToken(user.id, 'patient');
  
  res.json({
    success: true,
    data: {
      user: userResponse,
      accessToken,
      refreshToken,
      expiresIn: '30d'
    }
  });
}));

router.post('/auth/otp/request', asyncHandler(async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PHONE', message: 'Phone number is required' }
    });
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresInSeconds = 300;
  
  try {
    await db.query(`
      INSERT INTO otp_codes (phone, code, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
      ON CONFLICT (phone) DO UPDATE SET
        code = $2,
        expires_at = NOW() + INTERVAL '5 minutes'
    `, [phone, otp]);
  } catch (error) {
    console.warn('OTP storage fallback engaged:', error.message);
    storeOtpFallback(phone, otp, expiresInSeconds);
  }
  
  // Send OTP via SMS (placeholder)
  console.log(`OTP for ${phone}: ${otp}`);
  
  res.json({
    success: true,
    message: 'OTP sent successfully',
    data: { expiresIn: expiresInSeconds }
  });
}));

router.post('/auth/otp/verify', asyncHandler(async (req, res) => {
  const { phone, otp, deviceId, pushToken } = req.body;
  
  if (!phone || !otp) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Phone and OTP are required' }
    });
  }

  // Verify OTP
  let otpValid = false;
  try {
    const result = await db.query(
      'SELECT id FROM otp_codes WHERE phone = $1 AND code = $2 AND expires_at > NOW()',
      [phone, otp]
    );
    otpValid = result.rows.length > 0;
  } catch (error) {
    console.warn('OTP verification fallback engaged:', error.message);
  }

  if (!otpValid) {
    otpValid = verifyOtpFallback(phone, otp);
  }

  if (!otpValid) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' }
    });
  }

  const userSelectQuery = `
    SELECT u.id,
           u.email,
           u.password,
           u."firstName" AS first_name,
           u."lastName" AS last_name,
           u."phoneNumber" AS phone,
           u."profileImage" AS avatar_url,
           u."dateOfBirth" AS date_of_birth,
           u.gender,
           COALESCE(p."bloodGroup"::text, u."bloodType") AS blood_group,
           NULLIF(TRIM(CONCAT_WS(', ', u.address_street, u.address_city, u.address_state, u."address_zipCode", u.address_country)), '') AS address,
           u.role,
           u.status
    FROM users u
    LEFT JOIN patients p ON p."userId" = u.id
    WHERE u."phoneNumber" = $1
    LIMIT 1
  `;

  let userResult = await db.query(userSelectQuery, [phone]);
  let isNewUser = false;

  if (userResult.rows.length === 0) {
    isNewUser = true;
    const generatedEmail = `patient_${phone}@mediczy.local`;
    const generatedPassword = await bcrypt.hash(`${phone}-${Date.now()}`, 10);

    const createdUser = await db.query(`
      INSERT INTO users (
        email, password, "firstName", "lastName", "phoneNumber",
        "dateOfBirth", gender, role, status, "phoneVerified", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', TRUE, NOW(), NOW())
      RETURNING id
    `, [
      generatedEmail,
      generatedPassword,
      'Patient',
      'User',
      phone,
      '1970-01-01',
      'Other',
      'patient'
    ]);

    const newUserId = createdUser.rows[0]?.id;
    if (newUserId) {
      await db.query(`
        INSERT INTO patients ("userId", status, "createdAt", "updatedAt")
        VALUES ($1, 'active', NOW(), NOW())
        ON CONFLICT ("userId") DO NOTHING
      `, [newUserId]);
    }

    userResult = await db.query(userSelectQuery, [phone]);
  } else {
    const existingUserId = userResult.rows[0].id;
    await db.query(`
      UPDATE users SET "phoneVerified" = TRUE, "updatedAt" = NOW()
      WHERE id = $1
    `, [existingUserId]);
    await db.query(`
      INSERT INTO patients ("userId", status, "createdAt", "updatedAt")
      VALUES ($1, 'active', NOW(), NOW())
      ON CONFLICT ("userId") DO NOTHING
    `, [existingUserId]);
  }

  const user = userResult.rows[0];

  if (!user) {
    return res.status(500).json({
      success: false,
      error: { code: 'USER_RESOLUTION_FAILED', message: 'Failed to resolve user for OTP login' }
    });
  }

  if (deviceId) {
    await storeDeviceMetadata(user.id, {
      deviceId,
      pushToken: pushToken || null,
      platform: req.mobileClient?.platform || 'unknown',
      lastActive: new Date().toISOString()
    });
  }

  if (deviceId && pushToken) {
    const userType = user.role === 'doctor'
      ? 'doctor'
      : (user.role === 'admin' ? 'admin' : 'patient');
    await upsertFcmToken({
      userId: user.id,
      userType,
      token: pushToken,
      deviceType: req.mobileClient?.platform
    });
  }

  try {
    await db.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);
  } catch (error) {
    console.warn('OTP cleanup fallback engaged:', error.message);
  } finally {
    removeOtpFallback(phone);
  }

  const userResponse = buildUserResponse(user);

  // Generate tokens with proper payload for authUser middleware
  // FIXED: Include userId, role, userType fields for compatibility
  const accessToken = generateToken({
    id: user.id,
    userId: user.id,
    phone: user.phone,
    name: userResponse.name,
    role: user.role || 'patient',
    userType: user.role || 'patient'
  }, 'patient');
  
  const refreshToken = generateRefreshToken(user.id, 'patient');
  
  res.json({
    success: true,
    data: {
      user: userResponse,
      accessToken,
      refreshToken,
      isNewUser
    }
  });
}));

// ============== Signup Route ==============

// Default organization for direct Mediqzy.com signups
const DEFAULT_ORGANIZATION_SLUG = 'smarthealth-clinic';
const DEFAULT_ORGANIZATION_ID = 3; // SmartHealth Clinic (subsidiary of My SmartHealth / Mediqzy)

router.post('/auth/signup', asyncHandler(async (req, res) => {
  const { 
    email, password, firstName, first_name, lastName, last_name, phone, 
    dateOfBirth, gender, deviceId, pushToken,
    // Organization tagging - optional, defaults to SmartHealth Clinic
    organization_id, organization_slug, clinic_id, clinic_slug
  } = req.body;
  
  const userFirstName = firstName || first_name;
  const userLastName = lastName || last_name;
  
  // Required fields: name, email, phone number, password
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'Email and password are required' }
    });
  }

  if (!userFirstName || !userLastName) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_NAME', message: 'First name and last name are required' }
    });
  }

  if (!phone) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PHONE', message: 'Phone number is required' }
    });
  }

  // Validate phone number format with country code (e.g., +91xxxxxxxxxx, +1xxxxxxxxxx)
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PHONE', message: 'Phone number must include country code (e.g., +91xxxxxxxxxx)' }
    });
  }

  if (!dateOfBirth) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_DOB', message: 'Date of birth is required' }
    });
  }

  if (!gender) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_GENDER', message: 'Gender is required' }
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }
    });
  }

  // ============== Organization Tagging Logic ==============
  // 1. If organization_id/clinic_id provided → use that organization
  // 2. If organization_slug/clinic_slug provided → lookup and use that organization
  // 3. If nothing provided (direct signup via mediqzy.com) → default to SmartHealth Clinic
  
  let targetOrganizationId = DEFAULT_ORGANIZATION_ID;
  let targetOrganization = null;
  
  const providedOrgId = organization_id || clinic_id;
  const providedOrgSlug = organization_slug || clinic_slug;
  
  if (providedOrgId) {
    // Lookup organization by ID
    const orgResult = await db.query(
      'SELECT id, name, slug, type, status FROM tenants WHERE id = $1 AND status = $2',
      [providedOrgId, 'active']
    );
    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORG_NOT_FOUND', message: 'Organization not found or not active' }
      });
    }
    targetOrganization = orgResult.rows[0];
    targetOrganizationId = targetOrganization.id;
  } else if (providedOrgSlug) {
    // Lookup organization by slug
    const orgResult = await db.query(
      'SELECT id, name, slug, type, status FROM tenants WHERE slug = $1 AND status = $2',
      [providedOrgSlug, 'active']
    );
    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORG_NOT_FOUND', message: 'Organization not found or not active' }
      });
    }
    targetOrganization = orgResult.rows[0];
    targetOrganizationId = targetOrganization.id;
  } else {
    // Default: SmartHealth Clinic for direct Mediqzy.com signups
    const orgResult = await db.query(
      'SELECT id, name, slug, type, status FROM tenants WHERE id = $1',
      [DEFAULT_ORGANIZATION_ID]
    );
    if (orgResult.rows.length > 0) {
      targetOrganization = orgResult.rows[0];
    }
  }

  console.log('📱 Mobile signup - Organization tagging:', {
    email,
    targetOrganizationId,
    organizationName: targetOrganization?.name || 'SmartHealth Clinic',
    signupSource: providedOrgId || providedOrgSlug ? 'specific_org' : 'direct_mediqzy'
  });

  // Check if user already exists in this organization
  const existingUser = await db.query(
    'SELECT id FROM users WHERE email = $1 AND organization_id = $2', 
    [email.toLowerCase(), targetOrganizationId]
  );
  if (existingUser.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: { 
        code: 'USER_EXISTS', 
        message: `An account with this email already exists in ${targetOrganization?.name || 'this organization'}` 
      }
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user with organization tagging
  const result = await db.query(`
    INSERT INTO users (
      email, password, "firstName", "lastName", "phoneNumber",
      "dateOfBirth", gender, role, status, 
      organization_id, tenant_id,
      "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'patient', 'active', $8, $8, NOW(), NOW())
    RETURNING id, email, "firstName" AS first_name, "lastName" AS last_name,
              "phoneNumber" AS phone, "profileImage" AS avatar_url,
              "dateOfBirth" AS date_of_birth, gender, "bloodType" AS blood_group,
              role, status, organization_id
  `, [
    email.toLowerCase(),
    hashedPassword,
    userFirstName,
    userLastName,
    phone,
    dateOfBirth || '1990-01-01',
    gender || 'Other',
    targetOrganizationId
  ]);

  const user = result.rows[0];

  // Create patient record
  await db.query(`
    INSERT INTO patients ("userId", status, "createdAt", "updatedAt")
    VALUES ($1, 'active', NOW(), NOW())
    ON CONFLICT ("userId") DO NOTHING
  `, [user.id]);

  // Register device if provided
  if (deviceId) {
    await storeDeviceMetadata(user.id, {
      deviceId,
      pushToken: pushToken || null,
      platform: req.mobileClient?.platform || 'unknown',
      lastActive: new Date().toISOString()
    });
  }

  if (deviceId && pushToken) {
    await upsertFcmToken({
      userId: user.id,
      userType: 'patient',
      token: pushToken,
      deviceType: req.mobileClient?.platform
    });
  }

  const userResponse = buildUserResponse(user);

  // Generate tokens
  const accessToken = generateToken({
    id: user.id,
    userId: user.id,
    email: user.email,
    name: userResponse.name,
    role: 'patient',
    userType: 'patient',
    organization_id: targetOrganizationId
  }, 'patient');
  
  const refreshToken = generateRefreshToken(user.id, 'patient');
  
  res.status(201).json({
    success: true,
    data: {
      user: {
        ...userResponse,
        organization: targetOrganization ? {
          id: targetOrganization.id,
          name: targetOrganization.name,
          slug: targetOrganization.slug,
          type: targetOrganization.type
        } : null
      },
      accessToken,
      refreshToken,
      expiresIn: '30d'
    },
    message: `Account created successfully with ${targetOrganization?.name || 'SmartHealth Clinic'}`
  });
}));

// ============== User Profile ==============

router.get('/user/profile', authenticate(), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT u.id,
           u.email,
           u."firstName" AS first_name,
           u."lastName" AS last_name,
           u."phoneNumber" AS phone,
           u."profileImage" AS avatar_url,
           u."dateOfBirth" AS date_of_birth,
           u.gender,
           COALESCE(p."bloodGroup"::text, u."bloodType") AS blood_group,
           NULLIF(TRIM(CONCAT_WS(', ', u.address_street, u.address_city, u.address_state, u."address_zipCode", u.address_country)), '') AS address,
           u.role,
           u.status
    FROM users u
    LEFT JOIN patients p ON p."userId" = u.id
    WHERE u.id = $1
    LIMIT 1
  `, [req.userId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }
  
  res.json({
    success: true,
    data: buildUserResponse(result.rows[0])
  });
}));

router.put('/user/profile', authenticate(), asyncHandler(async (req, res) => {
  const { name, dateOfBirth, gender, bloodGroup, address, avatarUrl, phone } = req.body;
  const { firstName, lastName } = splitName(name);
  
  const result = await db.query(`
    UPDATE users SET
      "firstName" = COALESCE($1, "firstName"),
      "lastName" = COALESCE($2, "lastName"),
      "dateOfBirth" = COALESCE($3, "dateOfBirth"),
      gender = COALESCE($4, gender),
      "bloodType" = COALESCE($5, "bloodType"),
      address_street = COALESCE($6, address_street),
      "profileImage" = COALESCE($7, "profileImage"),
      "phoneNumber" = COALESCE($8, "phoneNumber"),
      "updatedAt" = NOW()
    WHERE id = $9
    RETURNING id, email, "firstName" AS first_name, "lastName" AS last_name,
              "phoneNumber" AS phone, "profileImage" AS avatar_url,
              "dateOfBirth" AS date_of_birth, gender, "bloodType" AS blood_group,
              address_street, address_city, address_state, "address_zipCode" AS address_zip,
              address_country, role, status
  `, [firstName, lastName, dateOfBirth, gender, bloodGroup, address, avatarUrl, phone, req.userId]);

  if (bloodGroup) {
    await db.query(`
      INSERT INTO patients ("userId", "bloodGroup", status, "createdAt", "updatedAt")
      VALUES ($1, $2, 'active', NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE SET
        "bloodGroup" = EXCLUDED."bloodGroup",
        "updatedAt" = NOW()
    `, [req.userId, bloodGroup]);
  }

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }
  
  res.json({
    success: true,
    data: buildUserResponse(result.rows[0])
  });
}));

// ============== Doctors ==============

router.get('/doctors', asyncHandler(async (req, res) => {
  console.log('[Mobile API] GET /doctors called');
  try {
  const { specialty, location, page = 1, limit = 20, search } = req.query;
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (safePage - 1) * safeLimit;
  
  let whereConditions = ['d.status = $1'];
  let params = ['active'];
  let paramIndex = 2;
  
  if (specialty) {
    whereConditions.push(`(d.specialization ILIKE $${paramIndex} OR $${paramIndex} = ANY(d.specializations))`);
    params.push(specialty);
    paramIndex++;
  }
  
  if (search) {
    whereConditions.push(`(d."firstName" ILIKE $${paramIndex} OR d."lastName" ILIKE $${paramIndex} OR d.specialization ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  // Get count
  const countResult = await db.query(
    `SELECT COUNT(*) FROM doctors d WHERE ${whereClause}`,
    params
  );
  
  // Get doctors
  params.push(safeLimit, offset);
  const result = await db.query(`
    SELECT d.id,
           CONCAT(d.prefix, ' ', d."firstName", ' ', d."lastName") AS name,
           d.email,
           d."phoneNumber" AS phone,
           d.specialization AS specialty,
           d.qualification,
           d.experience,
           COALESCE(d."consultationFees", d."onlineConsultationFee", d."inPersonConsultationFee") AS consultation_fee,
           d.rating,
           d."profileImage" AS avatar_url,
           t.name AS hospital_name,
           (d.status = 'active') AS available,
           d.status,
           d."isOnline" AS is_online
    FROM doctors d
    LEFT JOIN tenants t ON d.organization_id = t.id
    WHERE ${whereClause}
    ORDER BY d.rating DESC, name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  res.json({
    success: true,
    data: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / safeLimit)
    }
  });
  } catch (dbErr) {
    console.error('[Mobile API] /doctors DB error:', dbErr.code, dbErr.message, dbErr.detail);
    throw dbErr;
  }
}));

router.get('/doctors/:id', asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT d.id,
           CONCAT(d.prefix, ' ', d."firstName", ' ', d."lastName") AS name,
           d.email,
           d."phoneNumber" AS phone,
           d.specialization AS specialty,
           d.qualification,
           d.experience,
           COALESCE(d."consultationFees", d."onlineConsultationFee", d."inPersonConsultationFee") AS consultation_fee,
           d.rating,
           d."profileImage" AS avatar_url,
           t.name AS hospital_name,
           (d.status = 'active') AS available,
           d.status,
           d."isOnline" AS is_online,
           d.metadata->>'bio' AS bio,
           d.languages,
           d.qualifications AS education,
           d.documents AS certifications,
           d.specializations
    FROM doctors d
    LEFT JOIN tenants t ON d.organization_id = t.id
    WHERE d.id = $1
  `, [req.params.id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Doctor not found' }
    });
  }
  
  res.json({
    success: true,
    data: result.rows[0]
  });
}));

router.get('/doctors/:id/availability', asyncHandler(async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const doctorResult = await db.query(`
    SELECT "weeklyAvailability", "weeklySchedule", "slotDuration"
    FROM doctors WHERE id = $1
  `, [req.params.id]);

  if (doctorResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Doctor not found' }
    });
  }

  const doctor = doctorResult.rows[0];
  let schedule = doctor.weeklyAvailability || doctor.weeklySchedule || null;
  if (typeof schedule === 'string') {
    try {
      schedule = JSON.parse(schedule);
    } catch (error) {
      schedule = null;
    }
  }
  const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    new Date(targetDate).getDay()
  ];
  const slotDuration = Number(doctor.slotDuration) || 30;
  const baseSlots = buildAvailabilitySlots(schedule, dayKey, slotDuration);

  if (baseSlots.length === 0) {
    return res.json({
      success: true,
      data: {
        date: targetDate,
        slots: []
      }
    });
  }

  const bookedResult = await db.query(`
    SELECT "appointmentTime"
    FROM appointments
    WHERE "doctorId" = $1
      AND "appointmentDate" = $2
      AND status NOT IN ($3, $4, $5, $6)
  `, [req.params.id, targetDate, 'cancelled', 'completed', 'rejected', 'no-show']);

  const bookedTimes = new Set(
    bookedResult.rows
      .map((row) => normalizeTime(row.appointmentTime))
      .filter(Boolean)
  );

  const slots = baseSlots.map((slot) => ({
    slot_time: slot.slot_time,
    is_available: !bookedTimes.has(slot.slot_time),
    consultation_type: slot.consultation_type
  }));
  
  res.json({
    success: true,
    data: {
      date: targetDate,
      slots
    }
  });
}));

// ============== Video Consultation ==============

import { buildLiveKitJoinData, createMeetingInfo } from '../../utils/videoProvider.js';

/**
 * Generate LiveKit token for video consultation
 * POST /api/mobile/video/token
 */
router.post('/video/token', authenticate(), asyncHandler(async (req, res) => {
  const { roomName, appointmentId } = req.body;
  const userId = req.userId;
  
  // Get user details for display name
  const userResult = await db.query(`
    SELECT "firstName", "lastName", email, role
    FROM users
    WHERE id = $1
  `, [userId]);
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }
  
  const user = userResult.rows[0];
  const userRole = user.role || 'patient';
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Mobile User';
  
  // Generate meeting ID if not provided
  const meetingId = roomName || (appointmentId ? `apt-${appointmentId}` : createMeetingInfo({}).meetingId);
  
  try {
    const livekitData = await buildLiveKitJoinData({
      meetingId,
      identity: `${userRole}-${userId}`,
      name: displayName
    });
    
    res.json({
      success: true,
      data: {
        meetingId,
        serverUrl: livekitData.serverUrl,
        token: livekitData.token,
        roomName: livekitData.roomName,
        meetUrl: livekitData.meetUrl,
        joinUrl: livekitData.joinUrl,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('[Mobile] Failed to generate LiveKit token:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'LIVEKIT_ERROR', message: 'Failed to generate video token' }
    });
  }
}));

// ============== Chat with Doctor ==============

/**
 * Get available doctors for chat
 * GET /api/mobile/chat/doctors
 */
router.get('/chat/doctors', authenticate(), asyncHandler(async (req, res) => {
  const { specialization, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereConditions = ['d.status = $1'];
  let params = ['active'];
  let paramIndex = 2;
  
  if (specialization) {
    whereConditions.push(`d.specialization ILIKE $${paramIndex}`);
    params.push(`%${specialization}%`);
    paramIndex++;
  }
  
  if (search) {
    whereConditions.push(`(d."firstName" ILIKE $${paramIndex} OR d."lastName" ILIKE $${paramIndex} OR d.specialization ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  const result = await db.query(`
    SELECT d.id,
           d."firstName" AS first_name,
           d."lastName" AS last_name,
           d.specialization,
           d."profileImage" AS avatar_url,
           d.qualification,
           d.experience,
           d.rating,
           d."totalReviews" AS total_reviews,
           d."onlineConsultationFee" AS consultation_fee,
           COALESCE(d."isOnline", false) AS is_online
    FROM doctors d
    WHERE ${whereClause}
    ORDER BY d."isOnline" DESC NULLS LAST, d.rating DESC NULLS LAST
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, parseInt(limit), offset]);
  
  res.json({
    success: true,
    data: {
      doctors: result.rows.map(d => ({
        id: d.id,
        _id: String(d.id),
        name: `${d.first_name || ''} ${d.last_name || ''}`.trim(),
        firstName: d.first_name,
        lastName: d.last_name,
        specialization: d.specialization,
        avatarUrl: d.avatar_url,
        qualification: d.qualification,
        experience: d.experience,
        rating: d.rating,
        totalReviews: d.total_reviews,
        consultationFee: d.consultation_fee,
        isOnline: d.is_online
      })),
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
}));

/**
 * Start/Get chat conversation with doctor
 * POST /api/mobile/chat/start
 */
router.post('/chat/start', authenticate(), asyncHandler(async (req, res) => {
  const { doctorId, appointmentId, message } = req.body;
  const userId = req.userId;
  
  if (!doctorId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_DOCTOR', message: 'Doctor ID is required' }
    });
  }
  
  // Get doctor details
  const doctorResult = await db.query(`
    SELECT id, "firstName", "lastName", specialization, "profileImage"
    FROM doctors WHERE id = $1
  `, [doctorId]);
  
  if (doctorResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found' }
    });
  }
  
  const doctor = doctorResult.rows[0];
  const conversationId = `chat_${userId}_${doctorId}`;
  
  // Check for existing conversation or create new
  let conversationResult = await db.query(`
    SELECT id FROM chat_conversations 
    WHERE (user_id = $1 AND doctor_id = $2) OR id = $3
    LIMIT 1
  `, [userId, doctorId, conversationId]);
  
  let conversationDbId;
  
  if (conversationResult.rows.length === 0) {
    // Create new conversation
    const insertResult = await db.query(`
      INSERT INTO chat_conversations (id, user_id, doctor_id, appointment_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `, [conversationId, userId, doctorId, appointmentId || null]);
    conversationDbId = insertResult.rows[0]?.id || conversationId;
  } else {
    conversationDbId = conversationResult.rows[0].id;
  }
  
  // If initial message provided, save it
  if (message) {
    await db.query(`
      INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, created_at)
      VALUES ($1, $2, 'user', $3, NOW())
    `, [conversationDbId, userId, message]);
  }
  
  res.json({
    success: true,
    data: {
      conversationId,
      doctor: {
        id: doctor.id,
        name: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
        specialization: doctor.specialization,
        avatarUrl: doctor.profileImage
      },
      status: 'active',
      createdAt: new Date().toISOString()
    }
  });
}));

/**
 * Send message in chat
 * POST /api/mobile/chat/message
 */
router.post('/chat/message', authenticate(), asyncHandler(async (req, res) => {
  const { conversationId, doctorId, content, messageType = 'text' } = req.body;
  const userId = req.userId;
  
  if (!content) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_CONTENT', message: 'Message content is required' }
    });
  }
  
  const chatConversationId = conversationId || `chat_${userId}_${doctorId}`;
  
  // Insert message
  const result = await db.query(`
    INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content, message_type, created_at)
    VALUES ($1, $2, 'user', $3, $4, NOW())
    RETURNING id, created_at
  `, [chatConversationId, userId, content, messageType]);
  
  // Update conversation timestamp
  await db.query(`
    UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1
  `, [chatConversationId]);
  
  res.json({
    success: true,
    data: {
      messageId: result.rows[0].id,
      conversationId: chatConversationId,
      content,
      messageType,
      sender: { id: userId, type: 'user' },
      sentAt: result.rows[0].created_at
    }
  });
}));

/**
 * Get chat messages
 * GET /api/mobile/chat/messages/:conversationId
 */
router.get('/chat/messages/:conversationId', authenticate(), asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const result = await db.query(`
    SELECT m.id, m.content, m.message_type, m.sender_id, m.sender_type, m.created_at,
           CASE WHEN m.sender_type = 'user' THEN u."firstName" || ' ' || u."lastName"
                ELSE d.prefix || ' ' || d."firstName" || ' ' || d."lastName" END AS sender_name
    FROM chat_messages m
    LEFT JOIN users u ON m.sender_type = 'user' AND m.sender_id = u.id
    LEFT JOIN doctors d ON m.sender_type = 'doctor' AND m.sender_id = d.id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at DESC
    LIMIT $2 OFFSET $3
  `, [conversationId, parseInt(limit), offset]);
  
  res.json({
    success: true,
    data: {
      messages: result.rows.reverse().map(m => ({
        id: m.id,
        content: m.content,
        messageType: m.message_type,
        sender: {
          id: m.sender_id,
          type: m.sender_type,
          name: m.sender_name
        },
        createdAt: m.created_at
      })),
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
}));

// ============== Appointments ==============

router.get('/appointments', authenticate(), asyncHandler(async (req, res) => {
  const { status, upcoming = 'true' } = req.query;
  
  let whereConditions = ['a."userId" = $1'];
  let params = [req.userId];
  let paramIndex = 2;
  
  if (status) {
    whereConditions.push(`a.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  
  if (upcoming === 'true') {
    whereConditions.push(`a."appointmentDate" >= CURRENT_DATE`);
  }
  
  const result = await db.query(`
    SELECT a.id,
           a."appointmentDate" AS appointment_date,
           a."appointmentTime" AS appointment_time,
           a."consultationType" AS type,
           a.status,
           a.symptoms,
           a.notes,
           a."cancellationReason" AS cancellation_reason,
           a."doctorId" AS doctor_id,
           COALESCE(a."doctorName", CONCAT(d.prefix, ' ', d."firstName", ' ', d."lastName")) AS doctor_name,
           COALESCE(a.specialization, d.specialization) AS doctor_specialty,
           d."profileImage" AS doctor_avatar
    FROM appointments a
    LEFT JOIN doctors d ON a."doctorId" = d.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY a."appointmentDate", a."appointmentTime"
  `, params);
  
  res.json({
    success: true,
    data: result.rows
  });
}));

router.post('/appointments', authenticate(), asyncHandler(async (req, res) => {
  const { doctorId, appointmentDate, appointmentTime, type, symptoms, notes } = req.body;
  
  if (!doctorId || !appointmentDate || !appointmentTime) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'doctorId, appointmentDate, and appointmentTime are required' }
    });
  }

  const doctorResult = await db.query(`
    SELECT id,
           prefix,
           "firstName" AS first_name,
           "lastName" AS last_name,
           specialization,
           "profileImage" AS avatar_url,
           COALESCE("consultationFees", "onlineConsultationFee", "inPersonConsultationFee") AS consultation_fee
    FROM doctors
    WHERE id = $1
  `, [doctorId]);

  if (doctorResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found' }
    });
  }

  const userResult = await db.query(`
    SELECT id,
           "firstName" AS first_name,
           "lastName" AS last_name,
           email,
           "phoneNumber" AS phone
    FROM users
    WHERE id = $1
  `, [req.userId]);

  if (userResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  // Check slot availability
  const slotCheck = await db.query(
    `SELECT id FROM appointments
     WHERE "doctorId" = $1
       AND "appointmentDate" = $2
       AND "appointmentTime" = $3
       AND status NOT IN ($4, $5, $6, $7)`,
    [doctorId, appointmentDate, appointmentTime, 'cancelled', 'completed', 'rejected', 'no-show']
  );
  
  if (slotCheck.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: { code: 'SLOT_UNAVAILABLE', message: 'This time slot is no longer available' }
    });
  }

  const doctor = doctorResult.rows[0];
  const patient = userResult.rows[0];
  const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ') || 'Patient';
  const doctorName = [doctor.prefix, doctor.first_name, doctor.last_name].filter(Boolean).join(' ');
  const appointmentDateTime = new Date(`${appointmentDate}T${appointmentTime}`);
  const appointmentDateTimeValue = Number.isNaN(appointmentDateTime.getTime())
    ? null
    : appointmentDateTime;
  const normalizedType = String(type || 'online').toLowerCase();
  const consultationType = ['in-person', 'inperson', 'walk-in', 'walkin', 'clinic'].includes(normalizedType)
    ? 'in-person'
    : 'online';
  const symptomList = normalizeSymptoms(symptoms);

  // Create appointment
  const result = await db.query(`
    INSERT INTO appointments (
      "userId",
      "patientName",
      "patientEmail",
      "patientPhone",
      "doctorId",
      "doctorName",
      specialization,
      "appointmentDate",
      "appointmentTime",
      "appointmentDateTime",
      "consultationType",
      symptoms,
      notes,
      status,
      "createdAt",
      "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    RETURNING id,
              "appointmentDate" AS appointment_date,
              "appointmentTime" AS appointment_time,
              "consultationType" AS type,
              status,
              "doctorId" AS doctor_id,
              "doctorName" AS doctor_name,
              specialization,
              "patientName" AS patient_name,
              "patientPhone" AS patient_phone
  `, [
    req.userId,
    patientName,
    patient.email,
    patient.phone,
    doctorId,
    doctorName,
    doctor.specialization,
    appointmentDate,
    appointmentTime,
    appointmentDateTimeValue,
    consultationType,
    symptomList,
    notes || null,
    'pending'
  ]);
  
  res.status(201).json({
    success: true,
    message: 'Appointment booked successfully',
    data: {
      ...result.rows[0],
      doctor_avatar: doctor.avatar_url || null,
      doctor_specialty: doctor.specialization
    }
  });
}));

router.put('/appointments/:id/cancel', authenticate(), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const result = await db.query(`
    UPDATE appointments 
    SET status = 'cancelled',
        "cancellationReason" = $1,
        "cancelledBy" = 'patient',
        "cancelledAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = $2 AND "userId" = $3
    RETURNING id,
              status,
              "cancellationReason" AS cancellation_reason,
              "appointmentDate" AS appointment_date,
              "appointmentTime" AS appointment_time,
              "doctorId" AS doctor_id
  `, [reason, req.params.id, req.userId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Appointment not found' }
    });
  }
  
  res.json({
    success: true,
    message: 'Appointment cancelled successfully',
    data: result.rows[0]
  });
}));

// ============== Error Handling ==============

router.use(notFoundHandler);
router.use(errorHandler);

export default router;
