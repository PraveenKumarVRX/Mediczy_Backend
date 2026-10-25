import userModel from '../models/user.model.intelligent.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes, Op } from 'sequelize';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import XLSX from '../utils/excel-compat.js';
import sharedPool from '../db/pgPool.js';
import getClientIp from '../utils/clientIp.js';
import { isIpTrusted } from '../services/admin-ip-binding.service.js';
import { requireAdminMfaOnLogin } from '../services/admin-mfa.service.js';

// Production-level rate limiting store (would be Redis in production cluster)
const loginAttempts = new Map();

// Auth token configuration — mirrors team.route.js
const ACCESS_TOKEN_TTL     = '4h';
const REFRESH_TOKEN_TTL    = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_REFRESH_SCOPE  = 'admin';

// Security configuration
const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  PASSWORD_MIN_LENGTH: 4,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

// ── Token helpers (same pattern as team.route.js) ─────────────────────────────

export async function issueAdminTokenPair(payload, ip) {
  const jti = randomUUID();

  const accessToken = jwt.sign(
    { ...payload, jti, tokenType: 'access' },
    JWT_CONFIG.SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  const refreshToken = jwt.sign(
    { id: payload.id, jti, tokenType: 'refresh' },
    JWT_CONFIG.SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  const tokenHash  = createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt  = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await sharedPool.query(
    `INSERT INTO api_v2_refresh_tokens
       (jti, user_id, role, token_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [jti, payload.id, ADMIN_REFRESH_SCOPE, tokenHash, expiresAt, ip]
  );

  return { accessToken, refreshToken, jti };
}

async function revokeAdminRefreshToken(jti) {
  await sharedPool.query(
    `UPDATE api_v2_refresh_tokens
        SET revoked = TRUE, revoked_at = NOW()
      WHERE jti = $1 AND role = $2`,
    [jti, ADMIN_REFRESH_SCOPE]
  );
}

// Helper function for rate limiting
const checkRateLimit = (clientIP) => {
  const now = Date.now();
  const attempts = loginAttempts.get(clientIP) || { count: 0, lastAttempt: now, locked: false };
  
  // Reset if lockout period expired
  if (attempts.locked && (now - attempts.lastAttempt) > SECURITY_CONFIG.LOCKOUT_DURATION) {
    attempts.locked = false;
    attempts.count = 0;
  }
  
  if (attempts.locked) {
    const remainingTime = Math.ceil((SECURITY_CONFIG.LOCKOUT_DURATION - (now - attempts.lastAttempt)) / 1000 / 60);
    throw new Error(`Too many failed login attempts. Try again in ${remainingTime} minutes.`);
  }
  
  return attempts;
};

// Helper function to log failed attempts
const logFailedAttempt = (clientIP, email, reason) => {
  const now = Date.now();
  const attempts = loginAttempts.get(clientIP) || { count: 0, lastAttempt: now, locked: false };
  attempts.count += 1;
  attempts.lastAttempt = now;
  
  if (attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    attempts.locked = true;
    console.warn(`SECURITY ALERT: IP ${clientIP} locked out after ${attempts.count} failed login attempts for email: ${email}`);
  }
  
  loginAttempts.set(clientIP, attempts);
  console.warn(`Failed admin login attempt ${attempts.count}/${SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS} from IP: ${clientIP}, Email: ${email}, Reason: ${reason}`);
};

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  // req.ip/X-Forwarded-For behind Cloudflare resolve to Cloudflare's own edge
  // IP (different per PoP/request), not the real visitor - getClientIp()
  // reads CF-Connecting-IP first, which nginx passes through untouched.
  // This also means every rate-limit/audit-log entry below was previously
  // keyed on the wrong IP for Cloudflare-proxied traffic.
  const clientIP = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';

  if (!JWT_CONFIG.SECRET) {
    console.error('FATAL: JWT_SECRET environment variable not set!');
    return res.status(500).json({
      success: false,
      message: 'Server configuration error',
      code: 'JWT_SECRET_MISSING'
    });
  }
  
  // Enhanced input validation
  if (!email || !password) {
    logFailedAttempt(clientIP, email || 'missing', 'Missing credentials');
    await auditLoginAttempt(req, null, email || 'missing', false, 'Missing credentials');
    return res.status(400).json({ 
      success: false,
      message: 'Email and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  // Email format validation
  if (!SECURITY_CONFIG.EMAIL_REGEX.test(email)) {
    logFailedAttempt(clientIP, email, 'Invalid email format');
    await auditLoginAttempt(req, null, email, false, 'Invalid email format');
    return res.status(400).json({ 
      success: false,
      message: 'Invalid email format',
      code: 'INVALID_EMAIL'
    });
  }

  // Password length validation
  if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
    logFailedAttempt(clientIP, email, 'Password too short');
    await auditLoginAttempt(req, null, email, false, 'Password too short');
    return res.status(400).json({ 
      success: false,
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS'
    });
  }
  
  try {
    // Check rate limiting
    checkRateLimit(clientIP);
    
    console.log(`🔐 Admin login attempt - IP: ${clientIP}, Email: ${email.substring(0, 3)}***`);
    
    // Find admin user using userModel (same approach as working doctor/user logins)
    console.log('🔍 Querying database for admin user...');
    let adminUser;
    try {
      adminUser = await userModel.findOne({ 
        where: { 
          email: email.toLowerCase(),
          isAdmin: true
        } 
      });
      console.log('🔍 Query completed');
    } catch (queryError) {
      console.error('❌ Admin DB query error:', queryError.message);
      throw queryError;
    }
    
    console.log('🔍 Admin user found:', !!adminUser);
    
    if (!adminUser) {
      logFailedAttempt(clientIP, email, 'User not found or not admin');
      await auditLoginAttempt(req, null, email, false, 'Admin not found');
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Account status guard — reject before password check to avoid timing oracle
    if (adminUser.status !== 'active' || adminUser.isActive === false) {
      logFailedAttempt(clientIP, email, 'Inactive admin attempted login');
      await auditLoginAttempt(req, adminUser.id, email, false, 'Admin account inactive or suspended');
      return res.status(403).json({
        success: false,
        message: 'Admin account is inactive or suspended. Contact platform support.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    // Verify password
    console.log('🔍 Verifying password...');
    const isPasswordValid = await adminUser.comparePassword(password);
    console.log('🔍 Password valid:', isPasswordValid);

    if (isPasswordValid) {
      // IP binding: no-op (unrestricted) until this admin has at least one
      // trusted IP configured - adding the first one is what turns
      // enforcement on, same opt-in shape as MFA below.
      const ipOk = await isIpTrusted(adminUser.id, clientIP);
      if (!ipOk) {
        logFailedAttempt(clientIP, email, 'IP not authorized for this admin account');
        await auditLoginAttempt(req, adminUser.id, email, false, 'IP not authorized');
        console.warn(`❌ Admin login blocked - untrusted IP - Email: ${email}, IP: ${clientIP}`);
        return res.status(403).json({
          success: false,
          message: 'Login blocked: this network is not authorized for this admin account.',
          code: 'IP_NOT_TRUSTED',
        });
      }

      // MFA: no-op (mfaClaims = {}) until this admin has enrolled via
      // POST /api/admin/security/mfa/enroll - throws MFA_REQUIRED (401) once
      // enrolled, if no/invalid code was supplied with this login request.
      let mfaClaims;
      try {
        mfaClaims = await requireAdminMfaOnLogin(adminUser, req.body.code, req.id);
      } catch (mfaError) {
        logFailedAttempt(clientIP, email, mfaError.message);
        await auditLoginAttempt(req, adminUser.id, email, false, mfaError.message);
        return res.status(mfaError.statusCode || 401).json({
          success: false,
          code: mfaError.code || 'MFA_REQUIRED',
          message: mfaError.message,
        });
      }

      // Update last login
      await adminUser.update({
        lastLoginAt: new Date()
      });

      // Issue access + refresh token pair (same pattern as team login)
      const ip = clientIP;
      const payload = {
        ...mfaClaims,
        id:       adminUser.id,
        email:    adminUser.email,
        role:     'admin',
        userType: 'admin',
        isAdmin:  true,
      };
      const { accessToken, refreshToken } = await issueAdminTokenPair(payload, ip);

      // Clear any failed attempts on successful login
      loginAttempts.delete(clientIP);

      // Security audit log
      console.log(`✅ Admin login successful - ID: ${adminUser.id}, Email: ${adminUser.email}, IP: ${clientIP}`);
      await auditLoginAttempt(req, adminUser.id, adminUser.email, true);

      return res.json({
        success: true,
        message: 'Admin login successful',
        token: accessToken,
        refreshToken,
        user: {
          id:         adminUser.id,
          email:      adminUser.email,
          firstName:  adminUser.firstName,
          lastName:   adminUser.lastName,
          role:       'admin',
          userType:   'admin',
          isAdmin:    true,
          lastLogin:  adminUser.lastLoginAt,
        }
      });
    }
    
    // Failed login attempt
    logFailedAttempt(clientIP, email, 'Invalid credentials');
    await auditLoginAttempt(req, adminUser.id, email, false, 'Invalid password');
    console.warn(`❌ Failed admin login - Email: ${email}, IP: ${clientIP}, UA: ${userAgent}`);
    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (e) {
    console.error('❌ ADMIN LOGIN ERROR:', e);
    console.error('❌ Error message:', e.message);
    console.error('❌ Error stack:', e.stack);
    return res.status(500).json({ message: 'Internal server error. Please try again later.' });
  }
};

// Validate current admin and return profile (rich shape matching team profile)
export const adminProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      console.warn(`Unauthorized admin profile access from IP: ${req.ip}`);
      return res.status(403).json({ message: 'Forbidden: not an admin' });
    }

    console.log(`Admin profile accessed - ID: ${req.user.id}, Email: ${req.user.email}`);
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });

    // Fetch fresh DB record so profile reflects latest state
    const admin = await userModel.findByPk(req.user.id, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status',
                   'isAdmin', 'isTeam', 'phoneNumber', 'profileImage', 'lastLoginAt',
                   'createdAt', 'tenant_id']
    });

    return res.json({
      success: true,
      user: {
        id:           admin?.id ?? req.user.id,
        email:        admin?.email ?? req.user.email,
        firstName:    admin?.firstName ?? req.user.firstName,
        lastName:     admin?.lastName ?? req.user.lastName,
        role:         'admin',
        userType:     'admin',
        isAdmin:      true,
        isActive:     admin?.status === 'active',
        phoneNumber:  admin?.phoneNumber ?? null,
        profileImage: admin?.profileImage ?? null,
        tenantId:     admin?.tenant_id ?? null,
        lastLogin:    admin?.lastLoginAt ?? null,
        createdAt:    admin?.createdAt ?? null,
        permissions:  ['*'],   // admins have unrestricted access
      }
    });
  } catch (e) {
    console.error('Admin profile error:', e);
    return res.status(500).json({ message: 'Failed to fetch admin profile', error: e.message });
  }
};

// Utility to normalize array input
const ensureArray = (data) => Array.isArray(data) ? data : [data];

const normalizeObjectField = (value) => {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
};

const normalizeArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

export const bulkUploadDoctors = async (req, res) => {
  try {
    const records = ensureArray(req.body.doctors || []);
    if (!records.length) return res.status(400).json({ message: 'No doctor data provided' });
    const created = [];
    for (const d of records) {
      // Minimal required fields with fallbacks
      if (!d.email || !d.firstName || !d.lastName) continue;
      const exists = await doctorModel.findOne({ where: { email: d.email } });
      if (exists) continue;
      const password = d.password || Math.random().toString(36).slice(-8);
      const doctor = await doctorModel.create({
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        password,
        phoneNumber: d.phoneNumber || '',
        specialization: d.specialization || 'General Practitioner',
        experience: d.experience || 0,
        registrationNumber: d.registrationNumber || null,
        clinicAddress: d.clinicAddress ? (typeof d.clinicAddress === 'string' ? d.clinicAddress : JSON.stringify(d.clinicAddress)) : null,
        consultationFees: d.consultationFees || null,
        availableSlots: d.availableSlots ? (typeof d.availableSlots === 'string' ? d.availableSlots : JSON.stringify(d.availableSlots)) : null,
        expertise: d.expertise ? (typeof d.expertise === 'string' ? d.expertise : JSON.stringify(d.expertise)) : null,
        languages: d.languages ? (typeof d.languages === 'string' ? d.languages : JSON.stringify(d.languages)) : null,
        about: d.about || '',
        awards: d.awards ? (typeof d.awards === 'string' ? d.awards : JSON.stringify(d.awards)) : null,
        publications: d.publications ? (typeof d.publications === 'string' ? d.publications : JSON.stringify(d.publications)) : null
      });
      created.push({ id: doctor.id, email: doctor.email });
    }
    return res.json({ message: 'Doctors uploaded', count: created.length, created });
  } catch (e) {
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
};

export const bulkUploadLabs = async (req, res) => {
  try {
    const records = ensureArray(req.body.labs || []);
    if (!records.length) return res.status(400).json({ success: false, message: 'No lab records provided' });

    let inserted = 0, skipped = 0;
    const errors = [];
    const created = [];

    for (const lab of records) {
      if (!lab.name) {
        skipped++;
        errors.push({ lab: 'unnamed', reason: 'Name is required' });
        continue;
      }
      try {
        const email = lab.email || `lab_${Date.now()}_${Math.random().toString(36).slice(-4)}@mediczy-import.com`;
        const plainPassword = lab.password || Math.random().toString(36).slice(-10) + 'A1!';
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        const phoneNumber = lab.phone || lab.phoneNumber || '';
        const address = JSON.stringify({
          street: lab.street || '',
          city: lab.city || '',
          state: lab.state || '',
          area: lab.area || '',
          locality: lab.locality || '',
          pincode: lab.pincode || '',
        });

        const rows = await sequelize.query(`
          -- unique_id is deliberately NOT supplied: the database issues it (an L-prefixed uid,
          -- registered in entity_registry) on every insert. This statement used to mint one with
          -- Math.random().toString(36), which has no kind prefix and can contain 0/O -- the source of
          -- the 13 labs holding prefix-less ids -- and the strict prefix check would now refuse it.
          INSERT INTO labs (name, email, password, "phoneNumber", address, status, "isVerified", "createdAt", "updatedAt")
          VALUES (:name, :email, :password, :phoneNumber, :address::jsonb, 'active', true, NOW(), NOW())
          ON CONFLICT (email) DO UPDATE SET
            password = EXCLUDED.password,
            "phoneNumber" = COALESCE(NULLIF(EXCLUDED."phoneNumber", ''), labs."phoneNumber"),
            name = COALESCE(EXCLUDED.name, labs.name),
            status = 'active',
            "isVerified" = true,
            "updatedAt" = NOW()
          RETURNING id, name, email, unique_id
        `, {
          replacements: { name: lab.name, email, password: hashedPassword, phoneNumber, address },
          type: QueryTypes.SELECT,
        });

        if (rows && rows.length > 0) {
          inserted++;
          created.push({ id: rows[0].id, name: rows[0].name, email: rows[0].email, uniqueId: rows[0].unique_id });
        } else {
          skipped++;
          errors.push({ lab: lab.name, reason: 'No row returned' });
        }
      } catch (e) {
        skipped++;
        errors.push({ lab: lab.name, reason: e.message.substring(0, 120) });
      }
    }

    return res.json({
      success: true,
      message: `Bulk upload complete: ${inserted} inserted, ${skipped} skipped`,
      inserted,
      skipped,
      errors: errors.slice(0, 50),
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const bulkUploadPharmacies = async (req, res) => {
  // TODO: Migrate Pharmacy model to PostgreSQL
  return res.status(503).json({ 
    success: false, 
    message: 'Pharmacy management temporarily unavailable during database migration' 
  });
};

export const bulkUploadCorporates = async (req, res) => {
  try {
    return res.status(501).json({ 
      message: 'Corporate management not yet implemented in intelligent database',
      details: 'Corporate model needs to be created in intelligent database adapter'
    });
    
    /* TODO: Implement when Corporate model is available
    const records = ensureArray(req.body.corporates || []);
    if (!records.length) return res.status(400).json({ message: 'No corporate data provided' });
    const created = await Corporate.bulkCreate(records.map(c => ({
      companyName: c.companyName,
      contactPerson: c.contactPerson,
      email: c.email,
      phoneNumber: c.phoneNumber,
      alternatePhone: c.alternatePhone || null,
      industry: c.industry || null,
      employeeCount: c.employeeCount || null,
      gstNumber: c.gstNumber || null,
      panNumber: c.panNumber || null,
      address: c.address || {},
      packageType: c.packageType || 'Standard',
      packageStartDate: c.packageStartDate || null,
      packageEndDate: c.packageEndDate || null,
      packageAmount: c.packageAmount || null,
      services: c.services || [],
      contractDocument: c.contractDocument || null,
      status: c.status || 'Pending',
      leadSource: c.leadSource || null,
      salesRep: c.salesRep || null,
      notes: c.notes || null,
      billingCycle: c.billingCycle || 'Yearly',
      paymentMethod: c.paymentMethod || null,
      isActive: c.isActive !== undefined ? c.isActive : true
    })), { validate: true });
    return res.json({ message: 'Corporates uploaded', count: created.length });
    */
  } catch (e) {
    console.error('Corporate upload error:', e);
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
};

// Get dashboard stats

// List all entities with pagination


export const listLabs = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', city = '', state = '', area = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const replacements = {};

    if (search) {
      conditions.push(`(LOWER(name) LIKE :search OR LOWER(address->>'city') LIKE :search OR LOWER(address->>'area') LIKE :search)`);
      replacements.search = `%${search.toLowerCase()}%`;
    }
    if (city) {
      conditions.push(`LOWER(address->>'city') LIKE :city`);
      replacements.city = `%${city.toLowerCase()}%`;
    }
    if (state) {
      conditions.push(`LOWER(address->>'state') LIKE :state`);
      replacements.state = `%${state.toLowerCase()}%`;
    }
    if (area) {
      conditions.push(`LOWER(address->>'area') LIKE :area`);
      replacements.area = `%${area.toLowerCase()}%`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await sequelize.query(
      `SELECT COUNT(*) AS cnt FROM labs ${where}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
    const total = parseInt(countRows.cnt || 0, 10);

    const rows = await sequelize.query(
      `SELECT id, name, email, "phoneNumber" AS phone, address, status, "isVerified",
              accreditation, rating, "createdAt"
       FROM labs ${where}
       ORDER BY name ASC
       LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit: parseInt(limit), offset }, type: sequelize.QueryTypes.SELECT }
    );

    const data = rows.map(l => {
      const addr = typeof l.address === 'string' ? JSON.parse(l.address) : (l.address || {});
      return {
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        address: addr.street || addr.address || null,
        area: addr.area || null,
        locality: addr.locality || null,
        city: addr.city || null,
        state: addr.state || null,
        pincode: addr.pincode || null,
        pincode_mapped: !!(addr.pincode),
        status: l.status,
        isVerified: l.isVerified,
        accreditation: l.accreditation,
        rating: l.rating,
        coordinates: addr.coordinates || null,
        formatted: addr.formatted || null,
      };
    });

    return res.json({
      success: true,
      data,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('listLabs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch labs', error: err.message });
  }
};

export const listPharmacies = async (req, res) => {
  // TODO: Migrate Pharmacy model to PostgreSQL
  return res.status(503).json({ 
    success: false, 
    message: 'Pharmacy management temporarily unavailable during database migration',
    total: 0,
    data: [],
    page: 1,
    limit: 20
  });
};

export const listCorporates = async (req, res) => {
  try {
    return res.status(501).json({ 
      message: 'Corporate management not yet implemented in intelligent database',
      details: 'Corporate model needs to be created in intelligent database adapter'
    });
    
    /* TODO: Implement when Corporate model is available
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const { count, rows } = await Corporate.findAndCountAll({
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    return res.json({ total: count, data: rows, page: parseInt(page), limit: parseInt(limit) });
    */
  } catch (e) {
    console.error('List corporates error:', e);
    return res.status(500).json({ message: 'Failed to fetch corporates', error: e.message });
  }
};




// Create single internal user (admin managed)
export const createInternalUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, dateOfBirth, gender } = req.body;
    if (!firstName || !lastName || !email || !password || !phoneNumber || !dateOfBirth || !gender) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const exists = await userModel.findOne({ where: { email } });
    if (exists) return res.status(409).json({ message: 'Email already exists' });
    const user = await userModel.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      dateOfBirth: new Date(dateOfBirth),
      gender,
      isAdmin: false
    });
    return res.status(201).json({ message: 'User created', user: { id: user.id, email: user.email } });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to create user', error: e.message });
  }
};




export const getDashboardStats = async (req, res) => {
  try {
    // Import postgresSequelize for database queries
    const { postgresSequelize } = await import('../db/postgres-sequelize.js');
    const fs = (await import('fs/promises')).default;
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Get users count
    const [usersResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(usersResult[0]?.count || 0);
    
    // Get doctors count from database
    const [doctorsResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM doctors');
    const doctorCountDB = parseInt(doctorsResult[0]?.count || 0);
    
    // Get nurses count
    const [nursesResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM nurses');
    const nursesCount = parseInt(nursesResult[0]?.count || 0);
    
    // Get active users count (use status field instead of isActive)
    const [activeUsersResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM users WHERE status = \'active\'');
    const activeUsersCount = parseInt(activeUsersResult[0]?.count || 0);
    
    // Get admin users count
    const [adminUsersResult] = await postgresSequelize.query('SELECT COUNT(*) as count FROM users WHERE "isAdmin" = true');
    const adminUsersCount = parseInt(adminUsersResult[0]?.count || 0);

    // Get recent users (last 5 created)
    const [recentUsers] = await postgresSequelize.query(`
      SELECT id, "firstName", "lastName", email, "createdAt" 
      FROM users 
      ORDER BY "createdAt" DESC 
      LIMIT 5
    `);

    // Get recent doctors (last 5 created)
    const [recentDoctors] = await postgresSequelize.query(`
      SELECT id, "firstName", "lastName", email, specialization, "createdAt" 
      FROM doctors 
      ORDER BY "createdAt" DESC 
      LIMIT 5
    `);
    
    const [entityCounts] = await postgresSequelize.query(`SELECT
      (SELECT COUNT(*) FROM hospitals)::int AS hospitals,
      (SELECT COUNT(*) FROM labs)::int AS labs,
      (SELECT COUNT(*) FROM provider_clinics)::int AS clinics,
      (SELECT COUNT(*) FROM pharmacies)::int AS pharmacies,
      (SELECT COUNT(*) FROM corporates)::int AS corporates`);
    const { hospitals: hospitalCount, labs: labCount, clinics: clinicCount,
      pharmacies: pharmacyCount, corporates: corporateCount } = entityCounts[0];

    const stats = {
      users: userCount,
      activeUsers: activeUsersCount,
      adminUsers: adminUsersCount,
      doctors: doctorCountDB,
      nurses: nursesCount,
      labs: labCount,
      clinics: clinicCount,
      pharmacies: pharmacyCount,
      hospitals: hospitalCount,
      corporates: corporateCount
    };

    console.log('Dashboard stats generated successfully:', stats);
    
    return res.json({ 
      success: true,
      stats, 
      recentUsers,
      recentDoctors
    });
  } catch (e) {
    console.error('Failed to fetch dashboard stats:', e);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch dashboard stats", 
      error: e.message 
    });
  }
};

export const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await userModel.findAndCountAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'createdAt'],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    console.log(`Fetched ${rows.length} users, page ${page}`);
    return res.json({ 
      total: count, 
      data: rows, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (e) {
    console.error('Failed to fetch users:', e);
    return res.status(500).json({ message: "Failed to fetch users", error: e.message });
  }
};

export const listDoctors = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await doctorModel.findAndCountAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'specialization', 'experience', 'createdAt'],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    console.log(`Fetched ${rows.length} doctors, page ${page}`);
    return res.json({ 
      total: count, 
      data: rows, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (e) {
    console.error('Failed to fetch doctors:', e);
    return res.status(500).json({ message: "Failed to fetch doctors", error: e.message });
  }
};

// Get unique cities from doctors (for filter dropdown)
export const getDoctorCities = async (req, res) => {
  try {
    // Get from database
    const doctors = await doctorModel.findAll({
      attributes: ['city'],
      where: { city: { [Op.ne]: null } },
      group: ['city'],
      order: [['city', 'ASC']]
    });
    const cities = doctors.map(d => d.city).filter(Boolean);
    
    // In future, can merge with other sources here
    return res.json({ success: true, data: cities });
  } catch (e) {
    console.error('Failed to fetch cities:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};

// Get unique states from doctors (for filter dropdown)
export const getDoctorStates = async (req, res) => {
  try {
    // Get from database
    const doctors = await doctorModel.findAll({
      attributes: ['state'],
      where: { state: { [Op.ne]: null } },
      group: ['state'],
      order: [['state', 'ASC']]
    });
    const states = doctors.map(d => d.state).filter(Boolean);
    
    // In future, can merge with other sources here
    return res.json({ success: true, data: states });
  } catch (e) {
    console.error('Failed to fetch states:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};

// Get unique specialties from doctors (for filter dropdown)
export const getDoctorSpecialties = async (req, res) => {
  try {
    // Get from database
    const doctors = await doctorModel.findAll({
      attributes: ['specialization'],
      where: { specialization: { [Op.ne]: null } },
      group: ['specialization'],
      order: [['specialization', 'ASC']]
    });
    const specialties = doctors.map(d => d.specialization).filter(Boolean);
    
    // In future, can merge with other sources here
    return res.json({ success: true, data: specialties });
  } catch (e) {
    console.error('Failed to fetch specialties:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};

// ── Refresh — issue new access + refresh token pair (rotation) ────────────────

export const adminRefresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_CONFIG.SECRET);
    } catch (_) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    if (decoded.tokenType !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await sharedPool.query(
      `SELECT * FROM api_v2_refresh_tokens WHERE jti = $1 AND role = $2`,
      [decoded.jti, ADMIN_REFRESH_SCOPE]
    );

    if (!rows.length || rows[0].revoked || rows[0].token_hash !== tokenHash) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked or not found' });
    }

    // Revoke old token before issuing new one (rotation)
    await revokeAdminRefreshToken(decoded.jti);

    const admin = await userModel.findByPk(decoded.id);
    if (!admin || admin.status !== 'active' || !admin.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin account inactive or access revoked' });
    }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const payload = {
      id:       admin.id,
      email:    admin.email,
      role:     'admin',
      userType: 'admin',
      isAdmin:  true,
    };
    const { accessToken, refreshToken: newRefreshToken } = await issueAdminTokenPair(payload, ip);

    return res.json({ success: true, token: accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('[Admin Refresh] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── Logout — revoke refresh token ─────────────────────────────────────────────

export const adminLogout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_CONFIG.SECRET);
        if (decoded?.jti) await revokeAdminRefreshToken(decoded.jti);
      } catch (_) { /* expired tokens: still a clean logout */ }
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Admin Logout] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Error during logout' });
  }
};
