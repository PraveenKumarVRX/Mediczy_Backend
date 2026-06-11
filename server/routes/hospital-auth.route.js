import express from 'express';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { Hospital } from '../models/hospital.model.intelligent.js';
import { Corporate } from '../models/insurance-company.model.intelligent.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import User from '../models/postgres/user.model.postgres.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

const normalizeEmail = (email) => String(email || '').toLowerCase();

// ─── Minimum password length ──────────────────────────────────────────────────
const PASSWORD_MIN_LEN = 8;

// ─── Access / Refresh token lifetimes ─────────────────────────────────────────
const ACCESS_TOKEN_TTL  = '4h';    // aligned with team login; refresh token handles revocation
const REFRESH_TOKEN_TTL = '30d';   // stored server-side, supports rotation
const REFRESH_SCOPE = 'hospital';
const LOCKOUT_MAX_ATTEMPTS = 10;   // failed logins before 15-min lockout
const LOCKOUT_WINDOW_MIN   = 15;

// ─── Ensure hospital_refresh_tokens table exists (idempotent) ─────────────────
(async () => {
  try {
    await sharedPool.query(`
      CREATE TABLE IF NOT EXISTS api_v2_refresh_tokens (
        id             BIGSERIAL   PRIMARY KEY,
        jti            UUID        NOT NULL UNIQUE,
        user_id        INTEGER     NOT NULL,
        role           VARCHAR(50) NOT NULL,
        token_hash     VARCHAR(64) NOT NULL,
        expires_at     TIMESTAMPTZ NOT NULL,
        revoked        BOOLEAN     NOT NULL DEFAULT FALSE,
        revoked_at     TIMESTAMPTZ,
        replaced_by_jti UUID,
        ip_address     TEXT,
        user_agent     TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_user_role ON api_v2_refresh_tokens(user_id, role);
      CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_expires_at ON api_v2_refresh_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_api_v2_refresh_tokens_revoked ON api_v2_refresh_tokens(revoked);

      CREATE TABLE IF NOT EXISTS hospital_refresh_tokens (
        jti         UUID PRIMARY KEY,
        user_id     TEXT        NOT NULL,
        tenant_id   INTEGER,
        issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
        device_fp   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_hrt_user_id  ON hospital_refresh_tokens (user_id);
      CREATE INDEX IF NOT EXISTS idx_hrt_expires  ON hospital_refresh_tokens (expires_at);
    `);

    await sharedPool.query(`
      CREATE TABLE IF NOT EXISTS hospital_login_attempts (
        email         TEXT        PRIMARY KEY,
        failed_count  INTEGER     NOT NULL DEFAULT 0,
        locked_until  TIMESTAMPTZ
      );
    `);
  } catch (err) {
    console.error('[hospital-auth] Table init warning:', err.message);
  }
})();

// ─── Lockout helpers ──────────────────────────────────────────────────────────
async function checkLockout(email) {
  try {
    const { rows } = await sharedPool.query(
      'SELECT failed_count, locked_until FROM hospital_login_attempts WHERE email = $1',
      [email.toLowerCase()]
    );
    if (!rows.length) return { locked: false };
    const row = rows[0];
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(row.locked_until) - Date.now()) / 60000);
      return { locked: true, remaining };
    }
    return { locked: false, failedCount: row.failed_count };
  } catch { return { locked: false }; }
}

async function recordFailedAttempt(email) {
  try {
    const { rows } = await sharedPool.query(
      `INSERT INTO hospital_login_attempts (email, failed_count)
       VALUES ($1, 1)
       ON CONFLICT (email) DO UPDATE
         SET failed_count = hospital_login_attempts.failed_count + 1
       RETURNING failed_count`,
      [email.toLowerCase()]
    );
    const count = rows[0]?.failed_count || 1;
    if (count >= LOCKOUT_MAX_ATTEMPTS) {
      await sharedPool.query(
        `UPDATE hospital_login_attempts SET locked_until = NOW() + INTERVAL '${LOCKOUT_WINDOW_MIN} minutes' WHERE email = $1`,
        [email.toLowerCase()]
      );
    }
  } catch { /* non-fatal */ }
}

async function clearFailedAttempts(email) {
  try {
    await sharedPool.query(
      'DELETE FROM hospital_login_attempts WHERE email = $1',
      [email.toLowerCase()]
    );
  } catch { /* non-fatal */ }
}

// ─── Token issuance & revocation ──────────────────────────────────────────────
/**
 * Issue an access token (15 m) + refresh token (30 d).
 * The refresh token JTI is stored in api_v2_refresh_tokens under role='hospital'.
 * @param {object} payload - JWT claims (without exp/jti)
 * @param {{ deviceFp?: string }} opts
 * @returns {{ accessToken, refreshToken, jti }}
 */
async function issueTokenPair(payload, { deviceFp } = {}) {
  const jti = randomUUID();
  const accessToken = jwt.sign(
    { ...payload, jti, tokenType: 'access' },
    JWT_CONFIG.SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  const refreshToken = jwt.sign(
    { jti, userId: payload.id || payload.hospital_id, tokenType: 'refresh' },
    JWT_CONFIG.SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  try {
    await sharedPool.query(
      `INSERT INTO api_v2_refresh_tokens (jti, user_id, role, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        jti,
        payload.id || payload.hospital_id,
        REFRESH_SCOPE,
        tokenHash,
        expiresAt,
        null,
        deviceFp || null,
      ]
    );
  } catch (err) {
    console.error('[hospital-auth] Failed to store refresh token:', err.message);
    throw err;
  }
  return { accessToken, refreshToken, jti };
}

async function revokeRefreshToken(jti) {
  try {
    await sharedPool.query(
      'UPDATE api_v2_refresh_tokens SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW() WHERE jti = $1 AND role = $2',
      [jti, REFRESH_SCOPE]
    );
  } catch { /* non-fatal */ }
}

async function revokeAllUserTokens(userId) {
  try {
    await sharedPool.query(
      'UPDATE api_v2_refresh_tokens SET revoked = TRUE, revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND role = $2 AND revoked = FALSE',
      [Number(userId), REFRESH_SCOPE]
    );
  } catch { /* non-fatal */ }
}

// ─── Host-header slug extraction ─────────────────────────────────────────────
/**
 * Extract the subdomain from the request Host header.
 * Returns null if the host is the root domain or an IP.
 */
function extractSubdomainFromHost(req) {
  const host = (req.headers.host || '').split(':')[0]; // strip port
  const parts = host.split('.');
  // e.g. apollo.mediqzy.com → ['apollo','mediqzy','com']
  if (parts.length >= 3 && !host.match(/^(www\.|mediqzy\.com|localhost)/)) {
    return parts[0].toLowerCase();
  }
  return null;
}

const normalizeCapabilities = (...sources) => {
  for (const source of sources) {
    if (Array.isArray(source)) return source.filter(Boolean);
    if (source && typeof source === 'object') {
      return Object.entries(source).filter(([, enabled]) => enabled === true).map(([key]) => key);
    }
  }
  return undefined;
};

const buildHospitalTokenPayload = ({ hospital, tenant, user }) => {
  if (tenant && user) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      userType: 'hospital',
      tenant_id: tenant.id,
      organization_id: tenant.id,
      hospitalName: tenant.name,
      hospital_slug: tenant.slug,
      subdomain: tenant.subdomain,
      custom_domain: tenant.custom_domain,
      capabilities: normalizeCapabilities(user.metadata?.capabilities, tenant.metadata?.capabilities, tenant.features)
    };
  }

  if (hospital) {
    return {
      id: hospital.id,
      email: hospital.email,
      role: 'hospital',
      userType: 'hospital',
      hospitalName: hospital.hospitalName || hospital.name,
      tenant_id: hospital.tenantId || null,
      capabilities: normalizeCapabilities(hospital.metadata?.capabilities, hospital.features)
    };
  }

  return null;
};

/**
 * Hospital Registration
 * POST /api/hospital/auth/register
 */
export const hospitalRegister = async (req, res) => {
  try {
    const {
      hospitalName,
      registrationNumber,
      email,
      password,
      phoneNumber,
      address,
      city,
      state,
      pincode,
      totalBeds,
      specializations,
      facilities
    } = req.body;

    if (!hospitalName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Hospital name, email, and password are required'
      });
    }

    const existing = await Hospital.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Hospital with this email already exists'
      });
    }

    const hospital = await Hospital.create({
      hospitalName,
      registrationNumber,
      email,
      password,
      phoneNumber,
      address,
      city,
      state,
      pincode,
      totalBeds: totalBeds || 0,
      availableBeds: totalBeds || 0,
      specializations: specializations || [],
      facilities: facilities || [],
      status: 'active',
      isVerified: false
    });

    const token = jwt.sign(
      { id: hospital.id, email: hospital.email, role: 'hospital' },
      JWT_CONFIG.SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    res.status(201).json({
      success: true,
      message: 'Hospital registered successfully',
      token,
      hospital: {
        id: hospital.id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
        city: hospital.city,
        status: hospital.status
      }
    });
  } catch (error) {
    console.error('Hospital registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register hospital',
      error: error.message
    });
  }
};

router.post('/register', hospitalRegister);

/**
 * Hospital Login
 * POST /api/hospital/auth/login
 */
export const hospitalLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < PASSWORD_MIN_LEN) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${PASSWORD_MIN_LEN} characters`
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const hostSubdomain = extractSubdomainFromHost(req);

    if (hostSubdomain) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Generic hospital login blocked on subdomain ' + hostSubdomain);
      return res.status(403).json({
        success: false,
        message: 'Use the tenant-scoped hospital login endpoint for this request origin'
      });
    }

    // — Lockout check
    const lockStatus = await checkLockout(normalizedEmail);
    if (lockStatus.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${lockStatus.remaining} minute(s).`
      });
    }

    const hospital = await Hospital.findOne({
      where: { email: normalizedEmail }
    });

    if (!hospital) {
      // Fallback: try multitenant hospital staff login by email (no subdomain)
      const user = await User.findOne({
        where: {
          email: normalizedEmail,
          status: 'active',
          isActive: { [Op.ne]: false }, // P0-A: must not be explicitly disabled
          [Op.or]: [
            { organization_type: 'hospital' },
            { role: { [Op.in]: ['hospital_admin', 'doctor', 'staff', 'nurse', 'insurance_coordinator', 'billing', 'receptionist', 'ceo', 'coo', 'ms', 'medical_superintendent', 'cmo', 'chief_medical_officer'] } }
          ]
        }
      });

      if (!user) {
        await recordFailedAttempt(normalizedEmail);
        await auditLoginAttempt(req, null, normalizedEmail, false, 'Hospital not found');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await recordFailedAttempt(normalizedEmail);
        await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Invalid password');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const tenantId = user.tenant_id || user.organization_id;
      if (!tenantId) {
        await recordFailedAttempt(normalizedEmail);
        await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Hospital tenant missing');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const tenant = await Tenant.findOne({
        where: { id: tenantId, status: 'active', type: 'hospital' }
      });

      if (!tenant) {
        await recordFailedAttempt(normalizedEmail);
        await auditLoginAttempt(req, user.id, normalizedEmail, false, 'Hospital tenant not found');
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const tokenPayload = buildHospitalTokenPayload({ tenant, user });
      const deviceFp = req.headers['x-device-fingerprint'] || undefined;
      const { accessToken, refreshToken } = await issueTokenPair(tokenPayload, { deviceFp });

      await clearFailedAttempts(normalizedEmail);
      await auditLoginAttempt(req, user.id, normalizedEmail, true);

      return res.json({
        success: true,
        message: 'Login successful',
        token: accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        hospital: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          subdomain: tenant.subdomain,
          custom_domain: tenant.custom_domain,
          email: tenant.email,
          phone: tenant.phone,
          type: tenant.type,
          plan: tenant.plan,
          status: tenant.status
        }
      });
    }

    const isPasswordValid = await hospital.comparePassword(password);
    if (!isPasswordValid) {
      await recordFailedAttempt(normalizedEmail);
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (hospital.status !== 'active') {
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Hospital inactive');
      return res.status(403).json({ success: false, message: 'Hospital account is not active' });
    }
    if (hospital.isActive === false) {
      await auditLoginAttempt(req, hospital.id, normalizedEmail, false, 'Hospital disabled (isActive=false)');
      return res.status(403).json({ success: false, message: 'Hospital account has been disabled' });
    }

    const tokenPayload = buildHospitalTokenPayload({ hospital });
    const deviceFp = req.headers['x-device-fingerprint'] || undefined;
    const { accessToken, refreshToken } = await issueTokenPair(tokenPayload, { deviceFp });

    await clearFailedAttempts(normalizedEmail);
    await auditLoginAttempt(req, hospital.id, normalizedEmail, true);

    res.json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      hospital: {
        id: hospital.id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
        phoneNumber: hospital.phoneNumber,
        city: hospital.city,
        state: hospital.state,
        status: hospital.status,
        totalBeds: hospital.totalBeds,
        availableBeds: hospital.availableBeds
      }
    });
  } catch (error) {
    console.error('Hospital login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

router.post('/login', authLimiter, hospitalLogin);

/**
 * Hospital Login v2 (Multitenancy-aware + tenant-scoped)
 * POST /api/hospital/auth/login/v2
 *
 * Security contract:
 * 1. Subdomain is derived from the request Host header (ground truth).
 * 2. Any slug/subdomain supplied in the body MUST match the host-derived
 *    subdomain or be absent — mismatches are rejected (403).
 * 3. Password must meet minimum length policy.
 * 4. Account lockout after LOCKOUT_MAX_ATTEMPTS failures in a window.
 * 5. Issues 15-min access token + 30-day refresh token (stored server-side).
 */
export const hospitalLoginV2 = async (req, res) => {
  try {
    const rawEmail    = req.body.email;
    const password    = req.body.password;
    const bodySlug    = req.body.hospital_slug || req.body.hospitalSlug || req.body.slug;
    const bodySubdomain = req.body.subdomain;

    if (!rawEmail || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (password.length < PASSWORD_MIN_LEN) {
      return res.status(400).json({ success: false, message: `Password must be at least ${PASSWORD_MIN_LEN} characters` });
    }

    const email = normalizeEmail(rawEmail);

    // ─ Lockout check ────────────────────────────────────────────────────────
    const lockStatus = await checkLockout(email);
    if (lockStatus.locked) {
      return res.status(429).json({ success: false, message: `Too many failed attempts. Try again in ${lockStatus.remaining} minute(s).` });
    }

    // ─ Derive authoritative subdomain from Host header ─────────────────────
    const hostSubdomain = extractSubdomainFromHost(req);

    // ─ Validate body slug/subdomain against Host header ────────────────────
    // If the caller sent a slug/subdomain, it must match what the Host reports.
    const callerIdent = bodySlug || bodySubdomain;  // what the body claims
    if (callerIdent && hostSubdomain && callerIdent.toLowerCase() !== hostSubdomain.toLowerCase()) {
      await auditLoginAttempt(req, null, email, false, `Slug mismatch: body="${callerIdent}" host="${hostSubdomain}"`);
      return res.status(403).json({
        success: false,
        message: 'Hospital identifier does not match the request origin'
      });
    }

    // Resolved identifier: Host takes precedence, body slug as fallback
    const resolvedIdent = hostSubdomain || callerIdent || null;

    if (resolvedIdent) {
      // ── Tenant-scoped path ─────────────────────────────────────────────────
      const tenant = await Tenant.findOne({
        where: {
          status: 'active',
          type: 'hospital',
          [Op.or]: [{ subdomain: resolvedIdent }, { slug: resolvedIdent }]
        }
      });

      if (!tenant) {
        await recordFailedAttempt(email);
        await auditLoginAttempt(req, null, email, false, `Tenant not found for ident="${resolvedIdent}"`);
        return res.status(404).json({ success: false, message: 'Hospital not found' });
      }

      const user = await User.findOne({
        where: {
          email,
          status: 'active',
          [Op.or]: [{ tenant_id: tenant.id }, { organization_id: tenant.id }],
          role: { [Op.in]: ['hospital_admin', 'doctor', 'staff', 'nurse', 'insurance_coordinator', 'billing', 'receptionist', 'ceo', 'coo', 'ms', 'medical_superintendent', 'cmo', 'chief_medical_officer'] }
        }
      });

      if (!user) {
        await recordFailedAttempt(email);
        await auditLoginAttempt(req, null, email, false, 'Hospital user not found');
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await recordFailedAttempt(email);
        await auditLoginAttempt(req, user.id, email, false, 'Invalid password');
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'User account is not active' });
      }

      const payload   = buildHospitalTokenPayload({ tenant, user });
      const deviceFp  = req.headers['x-device-fingerprint'] || undefined;
      const { accessToken, refreshToken } = await issueTokenPair(payload, { deviceFp });

      await clearFailedAttempts(email);
      await auditLoginAttempt(req, user.id, email, true);

      return res.json({
        success: true,
        message: 'Login successful',
        token: accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
        hospital: {
          id: tenant.id, name: tenant.name, slug: tenant.slug,
          subdomain: tenant.subdomain, custom_domain: tenant.custom_domain,
          email: tenant.email, phone: tenant.phone, type: tenant.type,
          plan: tenant.plan, status: tenant.status
        }
      });
    }

    // ── No subdomain: legacy Hospital model fallback ───────────────────────
    const hospital = await Hospital.findOne({ where: { email } });

    if (!hospital) {
      await recordFailedAttempt(email);
      await auditLoginAttempt(req, null, email, false, 'Hospital not found');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isPasswordValid = await hospital.comparePassword(password);
    if (!isPasswordValid) {
      await recordFailedAttempt(email);
      await auditLoginAttempt(req, hospital.id, email, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (hospital.status !== 'active') {
      await auditLoginAttempt(req, hospital.id, email, false, 'Hospital inactive');
      return res.status(403).json({ success: false, message: 'Hospital account is not active' });
    }

    const payload  = buildHospitalTokenPayload({ hospital });
    const deviceFp = req.headers['x-device-fingerprint'] || undefined;
    const { accessToken, refreshToken } = await issueTokenPair(payload, { deviceFp });

    await clearFailedAttempts(email);
    await auditLoginAttempt(req, hospital.id, email, true);

    return res.json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      hospital: {
        id: hospital.id, hospitalName: hospital.hospitalName, email: hospital.email,
        phoneNumber: hospital.phoneNumber, city: hospital.city, state: hospital.state,
        status: hospital.status, totalBeds: hospital.totalBeds, availableBeds: hospital.availableBeds
      }
    });

  } catch (error) {
    console.error('Hospital login v2 error:', error);
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
};

router.post('/login/v2', authLimiter, hospitalLoginV2);

/**
 * Hospital Login via Subdomain (for dedicated subdomain hosting)
 * POST /api/hospital/auth/login-tenant
 * Derives tenant exclusively from the Host header — no body slug accepted.
 */
export const hospitalLoginTenant = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (password.length < PASSWORD_MIN_LEN) {
      return res.status(400).json({ success: false, message: `Password must be at least ${PASSWORD_MIN_LEN} characters` });
    }

    const normalizedEmail = normalizeEmail(email);
    const lockStatus = await checkLockout(normalizedEmail);
    if (lockStatus.locked) {
      return res.status(429).json({ success: false, message: `Too many failed attempts. Try again in ${lockStatus.remaining} minute(s).` });
    }

    // Derive subdomain ONLY from Host header — never from body
    const subdomain = extractSubdomainFromHost(req);

    if (!subdomain) {
      return res.status(400).json({ success: false, message: 'Cannot resolve hospital from request origin' });
    }

    const tenant = await Tenant.findOne({
      where: { [Op.or]: [{ subdomain }, { slug: subdomain }], status: 'active', type: 'hospital' }
    });

    if (!tenant) {
      await recordFailedAttempt(normalizedEmail);
      await auditLoginAttempt(req, null, email, false, 'Hospital tenant not found');
      return res.status(404).json({ success: false, message: 'Hospital not found' });
    }

    const user = await User.findOne({
      where: { email: normalizedEmail, tenant_id: tenant.id, status: 'active' }
    });

    if (!user) {
      await recordFailedAttempt(normalizedEmail);
      await auditLoginAttempt(req, null, email, false, 'Hospital user not found');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await recordFailedAttempt(normalizedEmail);
      await auditLoginAttempt(req, user.id, email, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const payload  = buildHospitalTokenPayload({ tenant, user });
    const deviceFp = req.headers['x-device-fingerprint'] || undefined;
    const { accessToken, refreshToken } = await issueTokenPair(payload, { deviceFp });

    await clearFailedAttempts(normalizedEmail);
    await auditLoginAttempt(req, user.id, email, true);

    res.json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      hospital: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain, slug: tenant.slug }
    });
  } catch (error) {
    console.error('Hospital tenant login error:', error);
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
};

router.post('/login-tenant', authLimiter, hospitalLoginTenant);

/**
 * Refresh Token Rotation
 * POST /api/hospital/auth/refresh
 * Body: { refreshToken }
 * Issues a new access + refresh token pair; revokes the old refresh token.
 */
export const hospitalRefresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_CONFIG.SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    if (decoded.tokenType !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    // Verify against server-side allowlist
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await sharedPool.query(
      `SELECT * FROM api_v2_refresh_tokens
       WHERE jti = $1 AND role = $2 AND revoked = FALSE AND expires_at > NOW()`,
      [decoded.jti, REFRESH_SCOPE]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Refresh token not found or revoked' });
    }

    const stored = rows[0];
    if (stored.token_hash !== tokenHash) {
      return res.status(401).json({ success: false, message: 'Refresh token mismatch' });
    }

    // Revoke the old refresh token immediately (rotation)
    await revokeRefreshToken(decoded.jti);

    // Re-build payload from the stored record — look up user/hospital
    let newPayload;
    const tenant = stored.tenant_id
      ? await Tenant.findByPk(stored.tenant_id)
      : null;

    const userRec = await User.findOne({
      where: { id: stored.user_id, status: 'active' }
    }).catch(() => null);

    if (userRec) {
      newPayload = buildHospitalTokenPayload({ tenant, user: userRec });
    } else {
      const hosp = await Hospital.findByPk(stored.user_id).catch(() => null);
      if (!hosp) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      newPayload = buildHospitalTokenPayload({ hospital: hosp });
    }

    const deviceFp = stored.device_fp || req.headers['x-device-fingerprint'];
    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(newPayload, { deviceFp });

    res.json({ success: true, token: accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Hospital refresh error:', error);
    res.status(500).json({ success: false, message: 'Token refresh failed', error: error.message });
  }
};

router.post('/refresh', hospitalRefresh);

/**
 * Hospital Profile
 * GET /api/hospital/auth/profile
 */
export const hospitalProfile = async (req, res) => {
  try {
    const hospital = await Hospital.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires'] }
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    res.json({
      success: true,
      hospital
    });
  } catch (error) {
    console.error('Get hospital profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

router.get('/profile', authUser, requireRole('hospital'), hospitalProfile);

/**
 * Onboard Corporate (Hospital creates corporate record)
 * POST /api/hospital/auth/corporates
 */
export const hospitalCreateCorporate = async (req, res) => {
  try {
    const {
      companyName, cin, gstin, pan, industry, employeeCount,
      hrContactName, hrContactEmail, hrContactPhone,
      officeAddress, city, state, pincode
    } = req.body;

    if (!companyName || !hrContactEmail) {
      return res.status(400).json({
        success: false,
        message: 'Company name and HR contact email are required'
      });
    }

    const existing = await Corporate.findOne({ where: { hrContactEmail } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this HR email already exists'
      });
    }

    const corporate = await Corporate.create({
      companyName, cin, gstin, pan, industry,
      employeeCount: employeeCount || 0,
      hrContactName, hrContactEmail, hrContactPhone,
      officeAddress, city, state, pincode,
      status: 'active',
      isVerified: false,
      onboardedBy: 'hospital',
      onboardedById: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Corporate onboarded successfully',
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        industry: corporate.industry,
        employeeCount: corporate.employeeCount,
        status: corporate.status
      }
    });
  } catch (error) {
    console.error('Hospital corporate onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard corporate',
      error: error.message
    });
  }
};

router.post('/corporates', authUser, requireRole('hospital'), hospitalCreateCorporate);

/**
 * List Corporates onboarded by hospital
 * GET /api/hospital/auth/corporates
 */
export const hospitalListCorporates = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const whereClause = { onboardedBy: 'hospital', onboardedById: req.user.id };
    if (status) whereClause.status = status;

    const offset = (page - 1) * limit;
    const { count, rows: corporates } = await Corporate.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      corporates
    });
  } catch (error) {
    console.error('Get hospital corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get corporates',
      error: error.message
    });
  }
};

router.get('/corporates', authUser, requireRole('hospital'), hospitalListCorporates);

/**
 * Verify hospital access token (server-side revocation-aware)
 * GET /api/hospital/auth/verify
 *
 * Validates:
 * 1. Token is a valid JWT.
 * 2. tokenType === 'access' (prevents refresh tokens being used here).
 * 3. The JTI is NOT in the revoked tokens table.
 */
export const hospitalVerify = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_CONFIG.SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // Only access tokens are valid for this endpoint
    if (decoded.tokenType !== 'access') {
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    // Check that the refresh-side entry for this session still exists and is not revoked.
    // We key the access token's jti against the refresh_tokens table that tracks the session.
    if (decoded.jti) {
      const { rows } = await sharedPool.query(
        `SELECT revoked FROM api_v2_refresh_tokens
         WHERE jti = $1 AND role = $2 AND expires_at > NOW()`,
        [decoded.jti, REFRESH_SCOPE]
      );
      // Access tokens must map to an active persisted session. Missing rows are rejected
      // so token issuance/storage failures cannot create bearer-only sessions.
      if (!rows.length || rows[0].revoked) {
        return res.status(401).json({ success: false, message: 'Session revoked' });
      }
    }

    return res.status(200).json({ success: true, hospital: decoded });
  } catch (error) {
    console.error('Hospital verify error:', error);
    return res.status(401).json({ success: false, message: 'Token verification failed' });
  }
};

router.get('/verify', hospitalVerify);

/**
 * Logout hospital — server-side session revocation
 * POST /api/hospital/auth/logout
 * Body: { refreshToken } (optional but recommended for clean revocation)
 *       { logoutAll: true } (optional — revokes ALL sessions for this user)
 */
export const hospitalLogout = async (req, res) => {
  try {
    const { refreshToken, logoutAll } = req.body;

    if (logoutAll) {
      // Attempt to get user id from the access token header if present
      const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (accessToken) {
        try {
          const decoded = jwt.decode(accessToken);
          if (decoded?.userId || decoded?.id) {
            await revokeAllUserTokens(decoded.userId || decoded.id);
          }
        } catch { /* ignore */ }
      }
    } else if (refreshToken) {
      try {
        const decoded = jwt.decode(refreshToken);
        if (decoded?.jti) {
          await revokeRefreshToken(decoded.jti);
        }
      } catch { /* ignore */ }
    }

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Hospital logout error:', error);
    return res.status(200).json({ success: true, message: 'Logged out' });
  }
};

router.post('/logout', hospitalLogout);

// ─── POST /api/hospital/auth/change-password ──────────────────────────────────
// Change password for the logged-in hospital account.
// Handles two login paths:
//   1. Direct hospital login  → password stored in `hospitals` table
//   2. Tenant staff login     → password stored in `users` table
// ─────────────────────────────────────────────────────────────────────────────
router.post('/change-password', authUser, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }
    const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(newPassword);
    if (!strongPwd) {
      return res.status(400).json({ success: false, message: 'Password must contain uppercase, lowercase, number, and special character (@$!%*?&)' });
    }

    const hospitalId = req.user?.id;
    const userId     = req.user?.id;
    const userEmail  = req.user?.email;

    // Path 1: direct hospital account (hospitals table)
    const { rows: hospRows } = await sharedPool.query(
      'SELECT id, email, password FROM hospitals WHERE id = $1 OR email = $2 LIMIT 1',
      [hospitalId, userEmail]
    );

    if (hospRows.length) {
      const hospital = hospRows[0];
      const valid = await bcrypt.compare(currentPassword, hospital.password);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }
      const same = await bcrypt.compare(newPassword, hospital.password);
      if (same) {
        return res.status(400).json({ success: false, message: 'New password must be different from current password' });
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      await sharedPool.query('UPDATE hospitals SET password = $1 WHERE id = $2', [hashed, hospital.id]);
      console.log(`✅ Hospital password changed (hospitals table): ${hospital.email}`);
      return res.json({ success: true, message: 'Password changed successfully.' });
    }

    // Path 2: tenant staff login — password is in users table
    const { rows: userRows } = await sharedPool.query(
      'SELECT id, email, password FROM users WHERE id = $1 AND email = $2 LIMIT 1',
      [userId, userEmail]
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, message: 'Hospital account not found' });
    }

    const user = userRows[0];
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    const same = await bcrypt.compare(newPassword, user.password);
    if (same) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await sharedPool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id]);
    console.log(`✅ Hospital password changed (users table): ${user.email}`);
    return res.json({ success: true, message: 'Password changed successfully.' });

  } catch (err) {
    console.error('[hospital-auth] change-password error:', err);
    return res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

export default router;
