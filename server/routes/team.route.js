import express from 'express';
import { body } from 'express-validator';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import userModel from '../models/user.model.intelligent.js';
import jwt from 'jsonwebtoken';
import { InsuranceBroker } from '../models/insurance-broker.model.intelligent.js';
import { Op } from 'sequelize';
import { authTeam, requireModule, attachAccessLevel } from '../middleware/team.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import sharedPool from '../db/pgPool.js';
import nodemailer from 'nodemailer';
import doctorModel from '../models/doctor.model.intelligent.js';

const router = express.Router();

// ─── Token constants ─────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL  = '8h';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_MAX_ATTEMPTS = 10;

// ─── Ensure required tables exist ────────────────────────────────────────────
;(async () => {
  try {
    const pool = sharedPool;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_refresh_tokens (
        id         BIGSERIAL   PRIMARY KEY,
        jti        UUID        NOT NULL UNIQUE,
        user_id    INTEGER     NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
        revoked_at TIMESTAMPTZ,
        device_fp  VARCHAR(64),
        ip_address VARCHAR(45)
      );
      CREATE INDEX IF NOT EXISTS idx_trt_jti     ON team_refresh_tokens(jti);
      CREATE INDEX IF NOT EXISTS idx_trt_user_id ON team_refresh_tokens(user_id);

      CREATE TABLE IF NOT EXISTS team_login_attempts (
        id         BIGSERIAL    PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        succeeded  BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tla_email_ts
        ON team_login_attempts(email, created_at);

      CREATE TABLE IF NOT EXISTS team_appointments (
        id               BIGSERIAL    PRIMARY KEY,
        doctor_id        INTEGER      NOT NULL,
        patient_email    VARCHAR(255) NOT NULL,
        appointment_date DATE         NOT NULL,
        appointment_time VARCHAR(20)  NOT NULL,
        type             VARCHAR(50)  NOT NULL DEFAULT 'consultation',
        notes            TEXT,
        status           VARCHAR(30)  NOT NULL DEFAULT 'confirmed',
        tenant_id        INTEGER,
        created_by       INTEGER      NOT NULL,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tappt_doctor  ON team_appointments(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_tappt_status  ON team_appointments(status);
      CREATE INDEX IF NOT EXISTS idx_tappt_tenant  ON team_appointments(tenant_id);
    `);
  } catch (err) {
    console.error('[Team] DB table init error:', err.message);
  }
})();

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function checkLockout(email, ip) {
  const pool = sharedPool;
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60 * 1000);
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt
       FROM team_login_attempts
      WHERE (email = $1 OR ip_address = $2)
        AND succeeded = FALSE
        AND created_at >= $3`,
    [email.toLowerCase(), ip, windowStart]
  );
  return parseInt(rows[0].cnt, 10) >= LOCKOUT_MAX_ATTEMPTS;
}

async function recordAttempt(email, ip, succeeded) {
  const pool = sharedPool;
  await pool.query(
    `INSERT INTO team_login_attempts (email, ip_address, succeeded)
     VALUES ($1, $2, $3)`,
    [email.toLowerCase(), ip, succeeded]
  );
}

async function clearFailedAttempts(email, ip) {
  const pool = sharedPool;
  await pool.query(
    `DELETE FROM team_login_attempts
      WHERE (email = $1 OR ip_address = $2) AND succeeded = FALSE`,
    [email.toLowerCase(), ip]
  );
}

async function issueTokenPair(payload, ip) {
  const pool = sharedPool;
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

  const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt  = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await pool.query(
    `INSERT INTO team_refresh_tokens
       (jti, user_id, token_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [jti, payload.id, tokenHash, expiresAt, ip]
  );

  return { accessToken, refreshToken, jti };
}

async function revokeRefreshToken(jti) {
  const pool = sharedPool;
  await pool.query(
    `UPDATE team_refresh_tokens
        SET revoked = TRUE, revoked_at = NOW()
      WHERE jti = $1`,
    [jti]
  );
}

async function revokeAllUserTokens(userId) {
  const pool = sharedPool;
  await pool.query(
    `UPDATE team_refresh_tokens
        SET revoked = TRUE, revoked_at = NOW()
      WHERE user_id = $1 AND revoked = FALSE`,
    [userId]
  );
}

// ─── Team login ───────────────────────────────────────────────────────────────
router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password required'),
], async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    // --- lockout check ---
    const locked = await checkLockout(email, ip).catch(() => false);
    if (locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MIN} minutes.`
      });
    }

    const user = await userModel.findOne({ where: { email } });

    if (!user) {
      await recordAttempt(email, ip, false);
      await auditLoginAttempt(req, null, email, false, 'Team user not found');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // --- active status check ---
    if (user.status && user.status !== 'active') {
      await auditLoginAttempt(req, user.id, email, false, 'Account inactive');
      return res.status(403).json({ success: false, message: 'Account is inactive. Contact admin.' });
    }

    // --- role guard (tenant-safe: must be team member of this org) ---
    let metadata = {};
    try { metadata = user.metadata ? JSON.parse(user.metadata) : {}; } catch (_) { metadata = {}; }

    const hasTeamAccess = Boolean(
      user.isAdmin || user.isTeam ||
      user.role === 'team' || user.membershipType === 'team' ||
      metadata.isTeam === true
    );

    if (!hasTeamAccess) {
      await recordAttempt(email, ip, false);
      await auditLoginAttempt(req, user.id, email, false, 'Team access denied');
      return res.status(403).json({
        success: false,
        message: 'Access denied. Team member privileges required.'
      });
    }

    // --- password verify ---
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await recordAttempt(email, ip, false);
      await auditLoginAttempt(req, user.id, email, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // --- assigned corporates (tenant-scoped, limited) ---
    let assignedCorporates = [];
    try {
      const corporates = await postgresSequelize.query(`
        SELECT DISTINCT c.id, c."companyName", c.industry, c.status
        FROM corporates c
        JOIN user_associations ua ON ua."entityId" = c.id
        WHERE ua."userId" = :userId
          AND ua."entityType" = 'corporate'
          AND ua.status = 'active'
        ORDER BY c."companyName" ASC
        LIMIT 50
      `, {
        replacements: { userId: user.id },
        type: postgresSequelize.QueryTypes.SELECT
      });
      assignedCorporates = Array.isArray(corporates) ? corporates : [];
    } catch (err) {
      console.warn('[Team Login] Could not fetch assigned corporates:', err.message);
    }

    // --- issue 15m access + 30d refresh token pair ---
    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'team',
      userType: 'team',
      isTeam: true,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.organizationId || null,
      assignedCorporates: assignedCorporates.map(c => c.id)
    };

    const { accessToken, refreshToken } = await issueTokenPair(payload, ip);

    await clearFailedAttempts(email, ip);
    await user.update({ lastLoginAt: new Date() });
    await auditLoginAttempt(req, user.id, email, true);

    // --- fetch stored permissions from DB ---
    let storedPermissions = metadata.permissions || null;
    let storedModules    = metadata.grantedModules || null;

    const teamUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role || 'team',
      designation: user.designation || 'Healthcare Staff',
      department: user.department || 'Healthcare Operations',
      permissions: storedPermissions || [
        'User Management', 'Doctor Management', 'Appointment Management',
        'Patient Reports', 'Chat Dashboard Access', 'Hospital Management',
        'Pharmacy Management', 'Health Plans Access'
      ],
      modules: storedModules || null
    };

    return res.status(200).json({
      success: true,
      message: 'Team login successful',
      token: accessToken,
      refreshToken,
      teamUser,
      assignedCorporates
    });

  } catch (error) {
    console.error('[Team Login] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Auth: verify access token ────────────────────────────────────────────────
router.get('/auth/verify', authTeam, (req, res) => {
  res.status(200).json({ success: true, teamUser: req.teamUser });
});

// ─── Auth: refresh token rotation ────────────────────────────────────────────
router.post('/auth/refresh', async (req, res) => {
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

    const pool = sharedPool;
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await pool.query(
      `SELECT * FROM team_refresh_tokens WHERE jti = $1`,
      [decoded.jti]
    );

    if (!rows.length || rows[0].revoked || rows[0].token_hash !== tokenHash) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked or not found' });
    }

    // Revoke old token (rotation)
    await revokeRefreshToken(decoded.jti);

    const user = await userModel.findOne({ where: { id: decoded.id } });
    if (!user || user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account inactive' });
    }

    let metadata = {};
    try { metadata = user.metadata ? JSON.parse(user.metadata) : {}; } catch (_) { metadata = {}; }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'team',
      userType: 'team',
      isTeam: true,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.organizationId || null
    };

    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(payload, ip);

    return res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('[Team Refresh] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Update team profile endpoint
router.put('/profile', authTeam, async (req, res) => {
  try {
    const { firstName, lastName, department, designation } = req.body;
    const userId = req.teamUser.id;

    const user = await userModel.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (department) user.department = department;
    if (designation) user.designation = designation;

    await user.save();

    const teamUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department || 'Healthcare Operations',
      designation: user.designation || 'Healthcare Staff',
      role: user.role || 'Team Member',
      permissions: [
        'User Management', 'Doctor Management', 'Appointment Management',
        'Patient Reports', 'Chat Dashboard Access', 'Hospital Management',
        'Pharmacy Management', 'Health Plans Access'
      ],
      isActive: user.isActive
    };

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      teamUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// Team directory endpoint (tenant-scoped + paginated)
router.get('/directory', authTeam, async (req, res) => {
  try {
    const teamUser = req.teamUser;
    const { page = 1, limit = 50, department, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { status: 'active' };
    if (department) where.department = department;

    // Tenant scope: if tenantId is set, caller only sees members in the same org
    if (teamUser.tenantId) {
      // Filter by organizationId column if it exists; gracefully degrades
      where.organizationId = teamUser.tenantId;
    }

    const { count, rows: users } = await userModel.findAndCountAll({
      where,
      limit: Math.min(parseInt(limit), 100),
      offset,
      order: [['firstName', 'ASC']]
    });

    const members = users
      .map(user => {
        let metadata = {};
        try { metadata = user.metadata ? JSON.parse(user.metadata) : {}; } catch (_) { metadata = {}; }

        const role = user.role || metadata.role || 'team';
        const isTeamMember = role === 'team' || user.membershipType === 'team' || metadata.isTeam === true;

        if (!isTeamMember) return null;

        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
        if (search && !fullName.includes(search.toLowerCase()) &&
            !(user.email || '').toLowerCase().includes(search.toLowerCase())) return null;

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phoneNumber || metadata.phone || 'N/A',
          department: user.department || metadata.department || 'Healthcare',
          designation: user.designation || metadata.designation || 'Staff',
          role: role === 'team' ? 'Team Member' : (role || 'Staff'),
          isActive: user.isActive,
          avatar: null
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      members,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    console.error('Team directory error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching team directory' });
  }
});

// Team profile endpoint
router.get('/profile', authTeam, attachAccessLevel, async (req, res) => {
  try {
    const teamUser = req.teamUser;

    // In production, fetch full team user details from database
    res.status(200).json({
      success: true,
      teamUser: {
        id: teamUser.id,
        email: teamUser.email,
        role: teamUser.role || 'Team Member',
        isActive: true,
        accessLevel: req.accessLevel || 'view',
        canView: req.canView !== false,
        canEdit: req.canEdit || false,
        canDelete: req.canDelete || false,
        permissions: [
          'User Management',
          'Doctor Management',
          'Appointment Management',
          'Patient Reports',
          'Chat Dashboard Access',
          'Hospital Management',
          'Pharmacy Management',
          'Health Plans Access'
        ],
        modules: [
          'users', 'doctors', 'appointments', 'chat',
          'hospitals', 'pharmacies', 'plans', 'reports'
        ],
        editableModules: req.editableModules || [],
        deletableModules: req.deletableModules || []
      }
    });

  } catch (error) {
    console.error('Team profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
});

// Get team member's accessible modules with access levels
router.get('/modules', authTeam, attachAccessLevel, async (req, res) => {
  try {
    const editableModules = req.editableModules || [];
    const deletableModules = req.deletableModules || [];
    const isAdmin = req.accessLevel === 'full';

    const modules = [
      {
        id: 'users',
        name: 'User Management',
        icon: 'Users',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('users'),
        canDelete: isAdmin || deletableModules.includes('users')
      },
      {
        id: 'doctors',
        name: 'Doctor Management',
        icon: 'Stethoscope',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('doctors'),
        canDelete: isAdmin || deletableModules.includes('doctors')
      },
      {
        id: 'appointments',
        name: 'Appointments',
        icon: 'Calendar',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('appointments'),
        canDelete: isAdmin || deletableModules.includes('appointments')
      },
      {
        id: 'chat',
        name: 'Chat Dashboard',
        icon: 'MessageSquare',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('chat'),
        canDelete: isAdmin || deletableModules.includes('chat')
      },
      {
        id: 'hospitals',
        name: 'Hospitals',
        icon: 'Building2',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('hospitals'),
        canDelete: isAdmin || deletableModules.includes('hospitals')
      },
      {
        id: 'pharmacies',
        name: 'Pharmacies',
        icon: 'Pill',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('pharmacies'),
        canDelete: isAdmin || deletableModules.includes('pharmacies')
      },
      {
        id: 'plans',
        name: 'Health Plans',
        icon: 'Heart',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('plans'),
        canDelete: isAdmin || deletableModules.includes('plans')
      },
      {
        id: 'reports',
        name: 'Reports & Analytics',
        icon: 'BarChart3',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('reports'),
        canDelete: false // Reports typically don't allow delete
      },
      {
        id: 'team_directory',
        name: 'Team Directory',
        icon: 'Users',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('team_directory'),
        canDelete: isAdmin || deletableModules.includes('team_directory')
      },
      {
        id: 'notifications',
        name: 'Notifications',
        icon: 'Bell',
        enabled: true,
        canView: true,
        canEdit: isAdmin || editableModules.includes('notifications'),
        canDelete: isAdmin || deletableModules.includes('notifications')
      }
    ];

    res.status(200).json({
      success: true,
      modules,
      accessLevel: req.accessLevel,
      globalPermissions: {
        canView: req.canView !== false,
        canEdit: req.canEdit || false,
        canDelete: req.canDelete || false
      }
    });
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching modules'
    });
  }
});

// Verify team member has access to specific module
router.post('/verify-access', authTeam, attachAccessLevel, async (req, res) => {
  try {
    const { module, action } = req.body; // action can be 'view', 'edit', 'delete'

    const allowedModules = [
      'users', 'doctors', 'appointments', 'chat',
      'hospitals', 'pharmacies', 'plans', 'reports',
      'team_directory', 'profile', 'notifications'
    ];

    const hasViewAccess = allowedModules.includes(module);
    const hasEditAccess = req.canEdit || (req.editableModules || []).includes(module);
    const hasDeleteAccess = req.canDelete || (req.deletableModules || []).includes(module);

    let hasAccess = false;
    if (action === 'view') {
      hasAccess = hasViewAccess;
    } else if (action === 'edit') {
      hasAccess = hasEditAccess;
    } else if (action === 'delete') {
      hasAccess = hasDeleteAccess;
    } else {
      hasAccess = hasViewAccess; // Default to view access
    }

    res.status(200).json({
      success: true,
      hasAccess,
      module,
      action: action || 'view',
      permissions: {
        canView: hasViewAccess,
        canEdit: hasEditAccess,
        canDelete: hasDeleteAccess
      }
    });
  } catch (error) {
    console.error('Verify access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying access'
    });
  }
});

// Admin endpoint to update team member privileges
router.put('/privileges/:teamUserId', authTeam, async (req, res) => {
  try {
    const { teamUserId } = req.params;
    const { editableModules, deletableModules, permissions } = req.body;
    const adminUser = req.teamUser;

    // Only admins can modify privileges
    if (adminUser.role !== 'admin' && adminUser.role !== 'super_admin' && !adminUser.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required to modify privileges'
      });
    }

    const targetUser = await userModel.findOne({ where: { id: teamUserId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Team member not found' });
    }

    let metadata = {};
    try { metadata = targetUser.metadata ? JSON.parse(targetUser.metadata) : {}; } catch (_) { metadata = {}; }

    if (editableModules  !== undefined) metadata.editableModules  = editableModules;
    if (deletableModules !== undefined) metadata.deletableModules = deletableModules;
    if (permissions      !== undefined) metadata.permissions      = permissions;
    metadata.privilegesUpdatedAt = new Date().toISOString();
    metadata.privilegesUpdatedBy = adminUser.id;

    await targetUser.update({ metadata: JSON.stringify(metadata) });

    return res.status(200).json({
      success: true,
      message: 'Privileges updated successfully',
      teamUserId,
      privileges: {
        editableModules:  metadata.editableModules  || [],
        deletableModules: metadata.deletableModules || [],
        permissions:      metadata.permissions      || []
      }
    });
  } catch (error) {
    console.error('Update privileges error:', error);
    return res.status(500).json({ success: false, message: 'Error updating privileges' });
  }
});

// ============== TEAM USERS MANAGEMENT ==============

// Create new team user/member
router.post('/users', authTeam, [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number'),
  body('role').optional().isIn(['team_member', 'team_lead', 'admin']).withMessage('Invalid role'),
  body('department').optional().notEmpty().withMessage('Department cannot be empty'),
  body('designation').optional().notEmpty().withMessage('Designation cannot be empty'),
], async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role = 'team_member', department, designation } = req.body;
    const adminUser = req.teamUser;

    // Only admins can create users
    if (!adminUser.isAdmin && adminUser.role !== 'admin' && adminUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required to create users'
      });
    }

    // Check if email already exists
    const existingUser = await userModel.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create new user with team membership
    const newUser = await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      role: role,
      department: department || 'Healthcare Operations',
      designation: designation || 'Team Member',
      isActive: true,
      status: 'active',
      membershipType: 'team',
      metadata: JSON.stringify({
        isTeam: true,
        department: department || 'Healthcare Operations',
        designation: designation || 'Team Member',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString()
      })
    });

    res.status(201).json({
      success: true,
      message: 'Team member created successfully',
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phone: newUser.phoneNumber,
        role: newUser.role,
        department: newUser.department,
        designation: newUser.designation,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
});

// List all team users (tenant-scoped + paginated)
router.get('/users', authTeam, async (req, res) => {
  try {
    const teamUser = req.teamUser;
    const { department, role, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { membershipType: 'team', status: status || 'active' };
    if (department) where.department = department;
    if (role)       where.role = role;
    if (teamUser.tenantId) where.organizationId = teamUser.tenantId;

    const { count, rows: users } = await userModel.findAndCountAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'role', 'status', 'lastLoginAt', 'metadata', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(limit), 100),
      offset
    });

    const teamUsers = users.map(user => {
      let meta = {};
      try { meta = user.metadata && typeof user.metadata === 'object' ? user.metadata : JSON.parse(user.metadata || '{}'); } catch (_) { meta = {}; }
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phoneNumber,
        role: user.role,
        department: meta.department || 'Healthcare',
        designation: meta.designation || 'Staff',
        isActive: user.status === 'active',
        lastLogin: user.lastLoginAt,
        createdAt: user.createdAt
      };
    });

    return res.status(200).json({
      success: true,
      users: teamUsers,
      count,
      page: parseInt(page),
      pages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching users' });
  }
});

// ============== TEAM DOCTORS MANAGEMENT ==============

// Create/Add new doctor to team
router.post('/doctors', authTeam, [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('license').notEmpty().withMessage('License number is required'),
  body('specialization').notEmpty().withMessage('Specialization is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number'),
], async (req, res) => {
  try {
    const { firstName, lastName, email, license, specialization, phone, qualification, experience } = req.body;
    const adminUser = req.teamUser;

    // Only admins/team leads can add doctors
    if (!adminUser.isAdmin && !['admin', 'super_admin', 'team_lead'].includes(adminUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Team lead or admin access required.'
      });
    }

    // Check if doctor email already exists
    const existingDoctor = await userModel.findOne({ where: { email } });
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: 'Doctor email already registered'
      });
    }

    // Create doctor user account
    const newDoctor = await userModel.create({
      firstName,
      lastName,
      email,
      phoneNumber: phone,
      role: 'doctor',
      designation: 'Doctor',
      department: 'Medical',
      isActive: true,
      status: 'active',
      metadata: JSON.stringify({
        licenseNumber: license,
        specialization,
        qualification: qualification || '',
        experience: experience || '0',
        isTeamDoctor: true,
        verificationStatus: 'pending',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString()
      })
    });

    res.status(201).json({
      success: true,
      message: 'Doctor added to team successfully',
      doctor: {
        id: newDoctor.id,
        firstName: newDoctor.firstName,
        lastName: newDoctor.lastName,
        email: newDoctor.email,
        phone: newDoctor.phoneNumber,
        specialization,
        license,
        qualification: qualification || '',
        experience: experience || '0',
        isActive: newDoctor.isActive,
        createdAt: newDoctor.createdAt
      }
    });
  } catch (error) {
    console.error('Create doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding doctor',
      error: error.message
    });
  }
});

// List team doctors
router.get('/doctors', authTeam, async (req, res) => {
  try {
    const { specialization, status } = req.query;
    const where = { role: 'doctor', status: status || 'active' };

    let doctors = await userModel.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'status', 'createdAt', 'metadata'],
      order: [['createdAt', 'DESC']],
      limit: 200
    });

    // Filter and parse metadata
    doctors = doctors.filter(doc => {
      try {
        const metadata = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {});
        return metadata.isTeamDoctor === true || metadata.specialization;
      } catch (e) {
        return false;
      }
    }).map(doc => {
      const metadata = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : (doc.metadata || {});

      if (specialization && metadata.specialization !== specialization) {
        return null;
      }

      return {
        id: doc.id,
        firstName: doc.firstName,
        lastName: doc.lastName,
        email: doc.email,
        phone: doc.phoneNumber,
        specialization: metadata.specialization || 'General',
        license: metadata.licenseNumber || '',
        qualification: metadata.qualification || '',
        experience: metadata.experience || '0',
        verificationStatus: metadata.verificationStatus || 'pending',
        isActive: doc.status === 'active',
        createdAt: doc.createdAt
      };
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      doctors,
      count: doctors.length
    });
  } catch (error) {
    console.error('List doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctors'
    });
  }
});

// ============== TEAM PHARMACIES MANAGEMENT ==============

// Add pharmacy to team
router.post('/pharmacies', authTeam, [
  body('name').notEmpty().withMessage('Pharmacy name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('licenseNumber').notEmpty().withMessage('License number is required'),
], async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zipCode, licenseNumber, registrationNumber } = req.body;
    const adminUser = req.teamUser;

    // Only admins/team leads can add pharmacies
    if (!adminUser.isAdmin && !['admin', 'super_admin', 'team_lead'].includes(adminUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Team lead or admin access required.'
      });
    }

    // Check if pharmacy email already exists
    const existingPharmacy = await userModel.findOne({ where: { email } });
    if (existingPharmacy) {
      return res.status(400).json({
        success: false,
        message: 'Pharmacy email already registered'
      });
    }

    // Create pharmacy user account
    const newPharmacy = await userModel.create({
      firstName: name,
      lastName: '',
      email,
      phoneNumber: phone,
      role: 'pharmacy',
      designation: 'Pharmacy',
      department: 'Pharmacy Operations',
      isActive: true,
      status: 'active',
      metadata: JSON.stringify({
        type: 'pharmacy',
        address,
        city,
        state,
        zipCode: zipCode || '',
        licenseNumber,
        registrationNumber: registrationNumber || '',
        isTeamPharmacy: true,
        verificationStatus: 'pending',
        createdBy: adminUser.id,
        createdAt: new Date().toISOString()
      })
    });

    res.status(201).json({
      success: true,
      message: 'Pharmacy added to team successfully',
      pharmacy: {
        id: newPharmacy.id,
        name,
        email,
        phone,
        address,
        city,
        state,
        zipCode: zipCode || '',
        licenseNumber,
        registrationNumber: registrationNumber || '',
        isActive: newPharmacy.isActive,
        createdAt: newPharmacy.createdAt
      }
    });
  } catch (error) {
    console.error('Create pharmacy error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding pharmacy',
      error: error.message
    });
  }
});

// List team pharmacies
router.get('/pharmacies', authTeam, async (req, res) => {
  try {
    const { city, state, status } = req.query;
    const where = { role: 'pharmacy', status: status || 'active' };

    let pharmacies = await userModel.findAll({
      where,
      attributes: ['id', 'firstName', 'email', 'phoneNumber', 'status', 'createdAt', 'metadata'],
      order: [['createdAt', 'DESC']],
      limit: 200
    });

    // Filter and parse metadata
    pharmacies = pharmacies.filter(pharm => {
      try {
        const metadata = typeof pharm.metadata === 'string' ? JSON.parse(pharm.metadata) : (pharm.metadata || {});
        return metadata.isTeamPharmacy === true || metadata.type === 'pharmacy';
      } catch (e) {
        return false;
      }
    }).map(pharm => {
      const metadata = typeof pharm.metadata === 'string' ? JSON.parse(pharm.metadata) : (pharm.metadata || {});

      if (city && metadata.city !== city) return null;
      if (state && metadata.state !== state) return null;

      return {
        id: pharm.id,
        name: pharm.firstName,
        email: pharm.email,
        phone: pharm.phoneNumber,
        address: metadata.address || '',
        city: metadata.city || '',
        state: metadata.state || '',
        zipCode: metadata.zipCode || '',
        licenseNumber: metadata.licenseNumber || '',
        registrationNumber: metadata.registrationNumber || '',
        verificationStatus: metadata.verificationStatus || 'pending',
        isActive: pharm.status === 'active',
        createdAt: pharm.createdAt
      };
    }).filter(Boolean);

    res.status(200).json({
      success: true,
      pharmacies,
      count: pharmacies.length
    });
  } catch (error) {
    console.error('List pharmacies error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pharmacies'
    });
  }
});

// ─── Appointments ─────────────────────────────────────────────────────────────
// Create team appointment (DB-persisted)
router.post('/appointments', authTeam, [
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('patientEmail').isEmail().withMessage('Valid patient email is required'),
  body('appointmentDate').notEmpty().withMessage('Appointment date is required'),
  body('appointmentTime').notEmpty().withMessage('Appointment time is required'),
], async (req, res) => {
  try {
    const { doctorId, patientEmail, appointmentDate, appointmentTime, notes, type = 'consultation' } = req.body;
    const teamUser = req.teamUser;

    const doctor = await userModel.findOne({ where: { id: doctorId, role: 'doctor' } });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    const pool = sharedPool;
    const { rows } = await pool.query(
      `INSERT INTO team_appointments
         (doctor_id, patient_email, appointment_date, appointment_time, type, notes, status, tenant_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)
       RETURNING id, created_at`,
      [doctorId, patientEmail, appointmentDate, appointmentTime, type, notes || '', teamUser.tenantId || null, teamUser.id]
    );

    const row = rows[0];

    return res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      appointment: {
        id: row.id,
        doctorId,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        patientEmail,
        appointmentDate,
        appointmentTime,
        type,
        notes: notes || '',
        status: 'confirmed',
        createdBy: teamUser.id,
        createdAt: row.created_at
      }
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    return res.status(500).json({ success: false, message: 'Error creating appointment', error: error.message });
  }
});

// List team appointments (DB-backed, tenant-scoped)
router.get('/appointments', authTeam, async (req, res) => {
  try {
    const { doctorId, status, fromDate, toDate, page = 1, limit = 50 } = req.query;
    const teamUser = req.teamUser;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params = [];
    let idx = 1;

    if (teamUser.tenantId) {
      conditions.push(`(ta.tenant_id = $${idx} OR ta.tenant_id IS NULL)`);
      params.push(teamUser.tenantId);
      idx++;
    }
    if (doctorId) { conditions.push(`ta.doctor_id = $${idx}`); params.push(parseInt(doctorId)); idx++; }
    if (status)   { conditions.push(`ta.status = $${idx}`);    params.push(status); idx++; }
    if (fromDate) { conditions.push(`ta.appointment_date >= $${idx}`); params.push(fromDate); idx++; }
    if (toDate)   { conditions.push(`ta.appointment_date <= $${idx}`); params.push(toDate);   idx++; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit), offset);
    const pool = sharedPool;
    const { rows } = await pool.query(
      `SELECT ta.*, u.first_name || ' ' || u.last_name AS doctor_name
         FROM team_appointments ta
         LEFT JOIN users u ON u.id = ta.doctor_id
         ${where}
         ORDER BY ta.appointment_date DESC, ta.appointment_time DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return res.status(200).json({
      success: true,
      appointments: rows,
      count: rows.length,
      page: parseInt(page)
    });
  } catch (error) {
    console.error('List appointments error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching appointments' });
  }
});

// ─── Logout — revoke refresh token ───────────────────────────────────────────
router.post('/logout', authTeam, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_CONFIG.SECRET);
        if (decoded?.jti) {
          await revokeRefreshToken(decoded.jti);
        }
      } catch (_) { /* expired tokens still safely no-op */ }
    }
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Team Logout] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Error during logout' });
  }
});

// ============== ROCKETCHAT AGENT LINKING ==============

/**
 * Link team user to RocketChat agent
 * POST /api/team/link-to-rocketchat
 * 
 * This endpoint links a Mediczy team user to a RocketChat livechat agent
 * so that the team user can respond to WhatsApp users through RocketChat.
 * 
 * Body:
 * {
 *   "teamUserId": 42,
 *   "rocketchatUserId": "RC_USER_ID",
 *   "rocketchatUsername": "parinitha_smarthealth"
 * }
 */
router.post('/link-to-rocketchat', authTeam, async (req, res) => {
  try {
    const { teamUserId, rocketchatUserId, rocketchatUsername } = req.body;

    // Validate input
    if (!teamUserId || !rocketchatUserId || !rocketchatUsername) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: teamUserId, rocketchatUserId, rocketchatUsername'
      });
    }

    // Get team user
    const teamUser = await userModel.findOne({
      where: { id: teamUserId, role: 'team' }
    });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Parse existing metadata
    let metadata = {};
    try {
      metadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      console.warn('Error parsing metadata:', e.message);
      metadata = {};
    }

    // Link to RocketChat
    metadata.rocketchatUserId = rocketchatUserId;
    metadata.rocketchatUsername = rocketchatUsername;
    metadata.isRocketchatAgent = true;
    metadata.linkedAt = new Date().toISOString();

    // Update user
    await teamUser.update({
      metadata: JSON.stringify(metadata)
    });

    console.log(`✅ Team user ${teamUser.email} linked to RocketChat agent ${rocketchatUsername}`);

    return res.status(200).json({
      success: true,
      message: 'Team user linked to RocketChat agent',
      linking: {
        teamUserEmail: teamUser.email,
        teamUserId: teamUser.id,
        rocketchatUsername: rocketchatUsername,
        rocketchatUserId: rocketchatUserId,
        linkedAt: metadata.linkedAt
      }
    });

  } catch (error) {
    console.error('Error linking team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * Get team user's RocketChat agent information
 * GET /api/team/:id/rocketchat-agent
 * 
 * Returns:
 * {
 *   "success": true,
 *   "isAgent": true,
 *   "agentInfo": {
 *     "rocketchatUserId": "RC_USER_ID",
 *     "rocketchatUsername": "parinitha_smarthealth",
 *     "linkedAt": "2026-02-15T10:30:00.000Z"
 *   }
 * }
 */
router.get('/:id/rocketchat-agent', authTeam, async (req, res) => {
  try {
    const teamUser = await userModel.findOne({
      where: { id: req.params.id, role: 'team' }
    });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    let metadata = {};
    try {
      metadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    const isAgent = metadata.isRocketchatAgent === true;

    return res.status(200).json({
      success: true,
      teamUser: {
        id: teamUser.id,
        email: teamUser.email,
        firstName: teamUser.firstName,
        lastName: teamUser.lastName,
        department: metadata.department || 'Support'
      },
      isAgent,
      agentInfo: isAgent ? {
        rocketchatUserId: metadata.rocketchatUserId,
        rocketchatUsername: metadata.rocketchatUsername,
        linkedAt: metadata.linkedAt,
        status: 'active'
      } : null
    });

  } catch (error) {
    console.error('Error fetching agent info:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * List all team users who are RocketChat agents
 * GET /api/team/agents/list
 * 
 * Returns all team users currently linked to RocketChat agents
 */
router.get('/agents/list', authTeam, async (req, res) => {
  try {
    const teamUsers = await userModel.findAll({
      where: { role: 'team', status: 'active' }
    });

    const agents = [];

    for (const user of teamUsers) {
      let metadata = {};
      try {
        metadata = user.metadata ? JSON.parse(user.metadata) : {};
      } catch (e) {
        metadata = {};
      }

      if (metadata.isRocketchatAgent === true) {
        agents.push({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          department: metadata.department || 'Support',
          rocketchatUsername: metadata.rocketchatUsername,
          linkedAt: metadata.linkedAt
        });
      }
    }

    return res.status(200).json({
      success: true,
      agents,
      count: agents.length
    });

  } catch (error) {
    console.error('Error fetching agent list:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ─── Activity Logs ────────────────────────────────────────────────────────────

/**
 * GET /api/team/activity-logs
 * Returns platform activity logs visible to team members.
 * - "mine" scope: only the logged-in team member's own actions
 * - "users" scope: only end-user (patient) actions
 * - default (all): everything
 */
router.get('/activity-logs', authTeam, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      scope,       // 'mine' | 'users' | omit for all
      userType,    // 'user' | 'doctor' | 'admin' | 'system'
      action,
      result,
      startDate,
      endDate,
      search
    } = req.query;

    const teamUserId = req.teamUser?.id;
    let logs = global.activityLogs || [];

    // Scope filter
    if (scope === 'mine') {
      logs = logs.filter(l => String(l.userId) === String(teamUserId));
    } else if (scope === 'users') {
      logs = logs.filter(l => l.userType === 'user');
    }

    // Additional filters
    if (userType && userType !== 'all') {
      logs = logs.filter(l => l.userType === userType);
    }
    if (action && action !== 'all') {
      logs = logs.filter(l => l.action === action);
    }
    if (result && result !== 'all') {
      logs = logs.filter(l => l.result === result);
    }
    if (startDate) {
      const from = new Date(startDate);
      logs = logs.filter(l => new Date(l.timestamp) >= from);
    }
    if (endDate) {
      const to = new Date(endDate + 'T23:59:59');
      logs = logs.filter(l => new Date(l.timestamp) <= to);
    }
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l =>
        l.activity?.toLowerCase().includes(q) ||
        l.details?.toLowerCase().includes(q) ||
        l.userEmail?.toLowerCase().includes(q) ||
        l.ipAddress?.toLowerCase().includes(q) ||
        l.resource?.toLowerCase().includes(q)
      );
    }

    const total = logs.length;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const start = (pageNum - 1) * limitNum;
    const paginatedLogs = logs.slice(start, start + limitNum);

    return res.json({
      success: true,
      logs: paginatedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Team] activity-logs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
  }
});

/**
 * GET /api/team/activity-stats
 * Aggregate stats for the activity dashboard.
 */
router.get('/activity-stats', authTeam, async (req, res) => {
  try {
    const logs = global.activityLogs || [];
    const now = Date.now();
    const h24 = new Date(now - 24 * 60 * 60 * 1000);
    const d7  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const todayLogs = logs.filter(l => new Date(l.timestamp) > h24);

    const byResult = { success: 0, failure: 0, warning: 0, info: 0 };
    const byUserType = { admin: 0, doctor: 0, user: 0, system: 0, team: 0 };
    const byAction = {};

    for (const l of logs) {
      if (byResult[l.result] !== undefined) byResult[l.result]++;
      if (byUserType[l.userType] !== undefined) byUserType[l.userType]++;
      byAction[l.action] = (byAction[l.action] || 0) + 1;
    }

    const topActions = Object.entries(byAction)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));

    return res.json({
      success: true,
      stats: {
        total: logs.length,
        last24Hours: todayLogs.length,
        last7Days: logs.filter(l => new Date(l.timestamp) > d7).length,
        failures24h: todayLogs.filter(l => l.result === 'failure').length,
        byResult,
        byUserType,
        topActions
      }
    });
  } catch (error) {
    console.error('[Team] activity-stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch activity stats' });
  }
});

// ─── Broker Management ───────────────────────────────────────────────────────

router.get('/brokers', authTeam, async (req, res) => {
  try {
    const { search = '', status = 'all', limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status !== 'all') where.status = status;
    if (search) {
      where[Op.or] = [
        { brokerName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { contactPersonName: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
      ];
    }
    const { count, rows } = await InsuranceBroker.findAndCountAll({
      where,
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['password'] },
    });
    return res.json({ success: true, data: rows, total: count });
  } catch (err) {
    console.error('[Team] brokers list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch brokers' });
  }
});

router.get('/brokers/:id', authTeam, async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.params.id, {
      attributes: { exclude: ['password'] },
    });
    if (!broker) return res.status(404).json({ success: false, message: 'Broker not found' });
    return res.json({ success: true, broker });
  } catch (err) {
    console.error('[Team] broker get error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch broker' });
  }
});

router.put('/brokers/:id', authTeam, async (req, res) => {
  try {
    const broker = await InsuranceBroker.findByPk(req.params.id);
    if (!broker) return res.status(404).json({ success: false, message: 'Broker not found' });
    const allowed = ['status', 'contactPersonName', 'phoneNumber', 'city', 'state', 'pincode',
      'businessType', 'commissionPercentage', 'officeAddress', 'irdaiLicenseNumber'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await broker.update(updates);
    return res.json({ success: true, broker: { ...broker.toJSON(), password: undefined } });
  } catch (err) {
    console.error('[Team] broker update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update broker' });
  }
});

// ─── Doctor Registration Management ─────────────────────────────────────────

const _teamMailer = () => {
  const port = parseInt(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: port === 465,
    auth: { user: (process.env.SMTP_USER||'').trim(), pass: (process.env.SMTP_PASSWORD||process.env.SMTP_PASS||'').trim() },
  });
};

// List all registered doctors (with search + status filter)
router.get('/registered-doctors', authTeam, async (req, res) => {
  try {
    const { search = '', status = 'all', limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status === 'pending')  where.isVerified = false;
    if (status === 'active')   where.isVerified = true;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName:  { [Op.iLike]: `%${search}%` } },
        { email:     { [Op.iLike]: `%${search}%` } },
        { specialization: { [Op.iLike]: `%${search}%` } },
      ];
    }
    const { count, rows } = await doctorModel.findAndCountAll({
      where,
      limit: Math.min(Number(limit), 100),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password', 'passwordResetToken'] },
    });
    return res.json({ success: true, data: rows, total: count });
  } catch (err) {
    console.error('[Team] registered-doctors list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch doctors' });
  }
});

// Get single doctor detail
router.get('/registered-doctors/:id', authTeam, async (req, res) => {
  try {
    const doctor = await doctorModel.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'passwordResetToken'] },
    });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    return res.json({ success: true, doctor });
  } catch (err) {
    console.error('[Team] registered-doctor get error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch doctor' });
  }
});

// Activate doctor account
router.patch('/registered-doctors/:id/activate', authTeam, async (req, res) => {
  try {
    const doctor = await doctorModel.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    await doctor.update({ isVerified: true, documentVerified: true });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();
    // Send activation email to doctor
    try {
      await _teamMailer().sendMail({
        from: `"Mediczy Team" <${process.env.SMTP_USER || 'support@mediczy.com'}>`,
        to: doctor.email,
        subject: `✅ Your Mediczy Doctor Account is Active — Welcome, ${doctorName}!`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8"><tr><td align="center" style="padding:40px 20px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <tr><td style="background:linear-gradient(135deg,#059669,#0d9488);padding:40px;text-align:center;">
    <div style="width:72px;height:72px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 20px;line-height:72px;font-size:36px;">✅</div>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;">Account Activated!</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your Mediczy doctor account is now live</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 12px">Hello, ${doctorName}!</p>
    <p style="color:#475569;line-height:1.8;font-size:14px;margin:0 0 28px">
      Congratulations! Our team has reviewed and verified your registration documents.
      Your Mediczy doctor account is now <strong style="color:#059669">fully active</strong>.
      You can now log in and start seeing patients.
    </p>
    <div style="text-align:center;margin-bottom:28px">
      <a href="${process.env.FRONTEND_URL || 'https://app.mediczy.com'}/doctor/login"
         style="background:linear-gradient(135deg,#059669,#0d9488);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;display:inline-block">
        Login to Your Dashboard →
      </a>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px">
      <p style="margin:0;font-size:13px;color:#166534">📧 Login Email: <strong>${doctor.email}</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#166534">🔐 Use the password you created during registration.</p>
    </div>
  </td></tr>
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · Mayden SmartHealth Pvt Ltd · support@mediczy.com</p>
  </td></tr>
</table></td></tr></table></body></html>`,
      });
    } catch (mailErr) { console.warn('[Team] Activation email failed:', mailErr.message); }
    return res.json({ success: true, message: 'Doctor account activated', doctor: { id: doctor.id, isVerified: true } });
  } catch (err) {
    console.error('[Team] activate doctor error:', err);
    return res.status(500).json({ success: false, message: 'Failed to activate doctor' });
  }
});

// Reject doctor account
router.patch('/registered-doctors/:id/reject', authTeam, async (req, res) => {
  try {
    const doctor = await doctorModel.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    const { reason = 'Your documents could not be verified. Please re-register with valid documents.' } = req.body;
    await doctor.update({ isVerified: false, documentVerified: false, accountStatus: 'rejected' });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();
    try {
      await _teamMailer().sendMail({
        from: `"Mediczy Team" <${process.env.SMTP_USER || 'support@mediczy.com'}>`,
        to: doctor.email,
        subject: `Mediczy Doctor Registration — Update Required`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8"><tr><td align="center" style="padding:40px 20px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <tr><td style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:40px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">Registration Update</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px">Action required for your Mediczy doctor account</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 12px">Hello, ${doctorName},</p>
    <p style="color:#475569;line-height:1.8;font-size:14px;margin:0 0 20px">
      After reviewing your registration, we were unable to activate your account at this time.
    </p>
    <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#b91c1c;font-weight:700">Reason:</p>
      <p style="margin:6px 0 0;font-size:13px;color:#dc2626">${reason}</p>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7">
      Please contact <a href="mailto:support@mediczy.com" style="color:#1d4ed8">support@mediczy.com</a> for assistance or to re-submit your application.
    </p>
  </td></tr>
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · Mayden SmartHealth Pvt Ltd · support@mediczy.com</p>
  </td></tr>
</table></td></tr></table></body></html>`,
      });
    } catch (mailErr) { console.warn('[Team] Rejection email failed:', mailErr.message); }
    return res.json({ success: true, message: 'Doctor registration rejected', reason });
  } catch (err) {
    console.error('[Team] reject doctor error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reject doctor' });
  }
});

export default router;
