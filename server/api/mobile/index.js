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

// ============== Device Management ==============

import db from '../v2/db.js';

router.post('/devices/register', asyncHandler(async (req, res) => {
  const { deviceId, pushToken, platform, model, osVersion } = req.body;
  const userId = req.user?.id;
  
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_DEVICE_ID', message: 'Device ID is required' }
    });
  }
  
  // Upsert device
  await db.query(`
    INSERT INTO devices (device_id, user_id, push_token, platform, model, os_version, last_active)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (device_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      push_token = EXCLUDED.push_token,
      platform = EXCLUDED.platform,
      model = EXCLUDED.model,
      os_version = EXCLUDED.os_version,
      last_active = NOW()
  `, [deviceId, userId, pushToken, platform, model, osVersion]);
  
  res.json({
    success: true,
    message: 'Device registered successfully'
  });
}));

router.put('/devices/push-token', asyncHandler(async (req, res) => {
  const { deviceId, pushToken } = req.body;
  
  await db.query(
    'UPDATE devices SET push_token = $1, last_active = NOW() WHERE device_id = $2',
    [pushToken, deviceId]
  );
  
  res.json({
    success: true,
    message: 'Push token updated'
  });
}));

// ============== Auth Routes ==============

import { authenticate, generateToken, generateRefreshToken } from '../v2/auth.utils.js';

router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password, deviceId, pushToken } = req.body;
  
  // Find user (patients or users table)
  const result = await db.query(
    'SELECT * FROM patients WHERE email = $1 UNION SELECT * FROM users WHERE email = $1',
    [email]
  );
  
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
    await db.query(`
      INSERT INTO devices (device_id, user_id, push_token, platform, last_active)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        user_id = $2,
        push_token = $3,
        last_active = NOW()
    `, [deviceId, user.id, pushToken, req.mobileClient?.platform]);
  }
  
  // Generate tokens
  const accessToken = generateToken({
    id: user.id,
    email: user.email,
    name: user.name
  }, 'patient');
  
  const refreshToken = generateRefreshToken(user.id, 'patient');
  
  // Remove password
  delete user.password;
  
  res.json({
    success: true,
    data: {
      user,
      accessToken,
      refreshToken,
      expiresIn: '30d'
    }
  });
}));

router.post('/auth/otp/request', asyncHandler(async (req, res) => {
  const { phone } = req.body;
  
  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store OTP (in production, use Redis with TTL)
  await db.query(`
    INSERT INTO otp_codes (phone, code, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
    ON CONFLICT (phone) DO UPDATE SET
      code = $2,
      expires_at = NOW() + INTERVAL '5 minutes'
  `, [phone, otp]);
  
  // Send OTP via SMS (placeholder)
  console.log(`OTP for ${phone}: ${otp}`);
  
  res.json({
    success: true,
    message: 'OTP sent successfully',
    data: { expiresIn: 300 }
  });
}));

router.post('/auth/otp/verify', asyncHandler(async (req, res) => {
  const { phone, otp, deviceId, pushToken } = req.body;
  
  // Verify OTP
  const result = await db.query(
    'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND expires_at > NOW()',
    [phone, otp]
  );
  
  if (result.rows.length === 0) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' }
    });
  }
  
  // Find or create user
  let userResult = await db.query('SELECT * FROM patients WHERE phone = $1', [phone]);
  
  if (userResult.rows.length === 0) {
    // Create new user
    userResult = await db.query(
      'INSERT INTO patients (phone, status) VALUES ($1, $2) RETURNING *',
      [phone, 'active']
    );
  }
  
  const user = userResult.rows[0];
  
  // Register device
  if (deviceId) {
    await db.query(`
      INSERT INTO devices (device_id, user_id, push_token, platform, last_active)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        user_id = $2,
        push_token = $3,
        last_active = NOW()
    `, [deviceId, user.id, pushToken, req.mobileClient?.platform]);
  }
  
  // Delete used OTP
  await db.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);
  
  // Generate tokens
  const accessToken = generateToken({
    id: user.id,
    phone: user.phone,
    name: user.name
  }, 'patient');
  
  const refreshToken = generateRefreshToken(user.id, 'patient');
  
  res.json({
    success: true,
    data: {
      user,
      accessToken,
      refreshToken,
      isNewUser: !user.name
    }
  });
}));

// ============== User Profile ==============

router.get('/user/profile', authenticate(), asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT id, name, email, phone, avatar_url, date_of_birth, gender, blood_group, address FROM patients WHERE id = $1',
    [req.userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' }
    });
  }
  
  res.json({
    success: true,
    data: result.rows[0]
  });
}));

router.put('/user/profile', authenticate(), asyncHandler(async (req, res) => {
  const { name, dateOfBirth, gender, bloodGroup, address, avatarUrl } = req.body;
  
  const result = await db.query(`
    UPDATE patients SET
      name = COALESCE($1, name),
      date_of_birth = COALESCE($2, date_of_birth),
      gender = COALESCE($3, gender),
      blood_group = COALESCE($4, blood_group),
      address = COALESCE($5, address),
      avatar_url = COALESCE($6, avatar_url),
      updated_at = NOW()
    WHERE id = $7
    RETURNING id, name, email, phone, avatar_url, date_of_birth, gender, blood_group, address
  `, [name, dateOfBirth, gender, bloodGroup, address, avatarUrl, req.userId]);
  
  res.json({
    success: true,
    data: result.rows[0]
  });
}));

// ============== Doctors ==============

router.get('/doctors', asyncHandler(async (req, res) => {
  const { specialty, location, page = 1, limit = 20, search } = req.query;
  const offset = (page - 1) * limit;
  
  let whereConditions = ['status = $1'];
  let params = ['active'];
  let paramIndex = 2;
  
  if (specialty) {
    whereConditions.push(`specialty = $${paramIndex}`);
    params.push(specialty);
    paramIndex++;
  }
  
  if (search) {
    whereConditions.push(`(name ILIKE $${paramIndex} OR specialty ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  // Get count
  const countResult = await db.query(
    `SELECT COUNT(*) FROM doctors WHERE ${whereClause}`,
    params
  );
  
  // Get doctors
  params.push(limit, offset);
  const result = await db.query(`
    SELECT id, name, email, phone, specialty, qualification, experience, 
           consultation_fee, rating, avatar_url, hospital_name, available
    FROM doctors 
    WHERE ${whereClause}
    ORDER BY rating DESC, name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  res.json({
    success: true,
    data: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
}));

router.get('/doctors/:id', asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT id, name, email, phone, specialty, qualification, experience,
           consultation_fee, rating, avatar_url, hospital_name, available,
           bio, languages, education, certifications
    FROM doctors WHERE id = $1
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
  
  // Get doctor's available slots
  const result = await db.query(`
    SELECT slot_time, is_available
    FROM doctor_slots
    WHERE doctor_id = $1 AND slot_date = $2
    ORDER BY slot_time
  `, [req.params.id, targetDate]);
  
  res.json({
    success: true,
    data: {
      date: targetDate,
      slots: result.rows
    }
  });
}));

// ============== Appointments ==============

router.get('/appointments', authenticate(), asyncHandler(async (req, res) => {
  const { status, upcoming = 'true' } = req.query;
  
  let whereConditions = ['patient_id = $1'];
  let params = [req.userId];
  let paramIndex = 2;
  
  if (status) {
    whereConditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  
  if (upcoming === 'true') {
    whereConditions.push(`appointment_date >= CURRENT_DATE`);
  }
  
  const result = await db.query(`
    SELECT a.*, d.name as doctor_name, d.specialty, d.avatar_url as doctor_avatar
    FROM appointments a
    LEFT JOIN doctors d ON a.doctor_id = d.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY appointment_date, appointment_time
  `, params);
  
  res.json({
    success: true,
    data: result.rows
  });
}));

router.post('/appointments', authenticate(), asyncHandler(async (req, res) => {
  const { doctorId, appointmentDate, appointmentTime, type, symptoms, notes } = req.body;
  
  // Check slot availability
  const slotCheck = await db.query(
    'SELECT * FROM appointments WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND status NOT IN ($4, $5)',
    [doctorId, appointmentDate, appointmentTime, 'cancelled', 'completed']
  );
  
  if (slotCheck.rows.length > 0) {
    return res.status(409).json({
      success: false,
      error: { code: 'SLOT_UNAVAILABLE', message: 'This time slot is no longer available' }
    });
  }
  
  // Create appointment
  const result = await db.query(`
    INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, type, symptoms, notes, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
    RETURNING *
  `, [req.userId, doctorId, appointmentDate, appointmentTime, type || 'consultation', symptoms, notes]);
  
  // Get doctor info for response
  const doctorResult = await db.query(
    'SELECT name, specialty, avatar_url FROM doctors WHERE id = $1',
    [doctorId]
  );
  
  res.status(201).json({
    success: true,
    message: 'Appointment booked successfully',
    data: {
      ...result.rows[0],
      doctor_name: doctorResult.rows[0]?.name,
      doctor_specialty: doctorResult.rows[0]?.specialty
    }
  });
}));

router.put('/appointments/:id/cancel', authenticate(), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const result = await db.query(`
    UPDATE appointments 
    SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
    WHERE id = $2 AND patient_id = $3
    RETURNING *
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
