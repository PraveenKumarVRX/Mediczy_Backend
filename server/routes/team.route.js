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
import TeamMember from '../models/postgres/team-member.model.postgres.js';
import llmProvider from '../services/ai-brain/llm-provider.js';
import nodemailer from 'nodemailer';
import axios from 'axios';
import { SMSService } from '../services/sms.service.js';
import whatsappProductionService from '../services/whatsapp-production.service.js';
import doctorModel from '../models/doctor.model.intelligent.js';
import { generateAssistedEmailDraft, analyzeEmailCommunication } from '../services/ai-email-arg.service.js';

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

      CREATE TABLE IF NOT EXISTS team_communication_logs (
        id                  BIGSERIAL PRIMARY KEY,
        team_user_id        INTEGER NOT NULL,
        corporate_id        INTEGER,
        channel             VARCHAR(20) NOT NULL,
        recipient           VARCHAR(255) NOT NULL,
        recipient_mode      VARCHAR(30) NOT NULL DEFAULT 'single',
        template_id         VARCHAR(100),
        template_name       VARCHAR(150),
        subject             TEXT,
        message             TEXT,
        provider            VARCHAR(50),
        status              VARCHAR(20) NOT NULL,
        provider_message_id VARCHAR(255),
        error_message       TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tcomm_team_created   ON team_communication_logs(team_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tcomm_channel_status ON team_communication_logs(channel, status);
      CREATE INDEX IF NOT EXISTS idx_tcomm_corporate      ON team_communication_logs(corporate_id);
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
        LEFT JOIN user_associations ua
          ON ua."entityId" = c.id
          AND ua."userId" = :userId
          AND ua."entityType" = 'corporate'
          AND ua.status = 'active'
        WHERE ua.id IS NOT NULL
           OR c."assignedTo" = :userId
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
      tenantId: metadata.tenantId || user.tenant_id || user.tenantId || user.organizationId || null,
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
      tenantId: metadata.tenantId || user.tenant_id || user.tenantId || user.organizationId || null
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

    // Fetch full profile from team_members table (lookup by email since JWT id = users.id, not team_members.id)
    const member = await TeamMember.findOne({
      where: { email: teamUser.email },
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'department', 'designation',
        'profileImage', 'phoneNumber', 'employeeId', 'unique_id', 'isActive',
        'permissions', 'accessLevel', 'metadata', 'joiningDate']
    });

    let permissions = [];
    let modules = null;
    // Permissions live in users.metadata (the base user record), not team_members
    const baseUser = await userModel.findOne({
      where: { id: teamUser.id },
      attributes: ['metadata']
    });
    const baseMeta = (() => { try { return baseUser?.metadata ? JSON.parse(baseUser.metadata) : {}; } catch (_) { return {}; } })();
    permissions = baseMeta.permissions || [];
    modules = baseMeta.grantedModules || null;

    res.status(200).json({
      success: true,
      teamUser: {
        id: teamUser.id,
        email: member?.email || teamUser.email,
        firstName: member?.firstName || '',
        lastName: member?.lastName || '',
        role: member?.role || teamUser.role || 'Team Member',
        designation: member?.designation || teamUser.designation || 'Healthcare Staff',
        department: member?.department || teamUser.department || 'Healthcare Operations',
        profileImage: member?.profileImage || null,
        phoneNumber: member?.phoneNumber || null,
        employeeId: member?.employeeId || null,
        uniqueId: member?.unique_id || null,
        isActive: member?.isActive !== false,
        joiningDate: member?.joiningDate || null,
        accessLevel: req.accessLevel || 'view',
        canView: req.canView !== false,
        canEdit: req.canEdit || false,
        canDelete: req.canDelete || false,
        permissions,
        modules,
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

const _normalizePhone = (input = '') => {
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const _smsService = () => {
  const provider = process.env.SMS_PROVIDER || 'pay4sms';
  const apiKey = process.env.SMS_API_KEY || '';
  const apiSecret = process.env.SMS_API_SECRET || '';
  const senderId = process.env.SMS_SENDER_ID || 'MSMART';
  if (!apiKey) return null;
  return new SMSService({
    provider,
    apiKey,
    apiSecret,
    senderId,
    templateId: process.env.SMS_TEMPLATE_ID,
    otpTemplateId: process.env.SMS_OTP_TEMPLATE_ID,
    apiUrl: process.env.SMS_API_URL,
  });
};

const _normalizeEmail = (input = '') => String(input || '').trim().toLowerCase();

const _extractRecipients = ({ to, recipients }) => {
  const all = [];
  if (to) all.push(String(to));
  if (Array.isArray(recipients)) {
    recipients.forEach((item) => {
      if (item !== null && item !== undefined) all.push(String(item));
    });
  }
  const unique = [...new Set(all.map((v) => v.trim()).filter(Boolean))];
  return unique;
};

const _buildProfessionalEmailHtml = ({ subject, message, companyName }) => {
  const safeSubject = String(subject || 'SmartHealth Communication')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeMessage = String(message || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  const safeCompany = String(companyName || 'your organization')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(12,38,74,.12);">
          <tr>
            <td style="background:linear-gradient(120deg,#0f766e,#155e75);padding:22px 28px;color:#ffffff;">
              <div style="font-size:12px;letter-spacing:.08em;opacity:.9;text-transform:uppercase;">SmartHealth Corporate Communication</div>
              <div style="font-size:24px;font-weight:700;margin-top:8px;line-height:1.25;">${safeSubject}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 12px 28px;color:#0f172a;font-size:15px;line-height:1.75;">
              ${safeMessage}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;color:#334155;font-size:13px;line-height:1.6;">
              This communication was sent for <strong>${safeCompany}</strong> via the SmartHealth team dashboard.
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:14px 28px;color:#64748b;font-size:12px;line-height:1.6;">
              Regards,<br/><strong>Team SmartHealth</strong><br/>support@mediqzy.com
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;
};

const _ensureTeamAiCommunicationTable = async () => {
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS crm_ai_email_communications (
      id                 BIGSERIAL PRIMARY KEY,
      entity_type        VARCHAR(40),
      entity_id          BIGINT,
      lead_id            BIGINT,
      deal_id            BIGINT,
      contact_email      VARCHAR(255),
      subject            TEXT,
      body               TEXT,
      intent             VARCHAR(100),
      tone               VARCHAR(80),
      status             VARCHAR(40) DEFAULT $q$draft$q$,
      event_type         VARCHAR(40),
      sentiment          VARCHAR(40),
      engagement_score   INTEGER DEFAULT 0,
      conversion_signal  VARCHAR(40),
      urgency            VARCHAR(40),
      next_action        JSONB DEFAULT '{}'::jsonb,
      suggested_stage    VARCHAR(100),
      revenue_impact     NUMERIC(15,2) DEFAULT 0,
      ai_payload         JSONB DEFAULT '{}'::jsonb,
      learning_tags      JSONB DEFAULT $q$[]$q$::jsonb,
      created_by         INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_email_entity ON crm_ai_email_communications(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_team ON crm_ai_email_communications(created_by, entity_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_email_team_entity_created ON crm_ai_email_communications(created_by, entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_email_team_score_created ON crm_ai_email_communications(created_by, entity_type, engagement_score DESC, created_at DESC);
  `);
};

_ensureTeamAiCommunicationTable().catch((err) => {
  console.warn("[Team] AI communication table initialization skipped:", err.message);
});

const _loadTeamCorporate = async (corporateId) => {
  if (!corporateId) return null;
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, "companyName", "contactPerson", email, "phoneNumber", industry, "employeeCount", "packageType", status
       FROM corporates WHERE id = $1 LIMIT 1`,
      [parseInt(String(corporateId), 10)]
    );
    return rows[0] || null;
  } catch (_) {
    return null;
  }
};

const _recordTeamAiCommunication = async ({ teamUserId, corporateId, contactEmail, subject, message, intent, tone, status, eventType, analysis, draft, replyText }) => {
  await _ensureTeamAiCommunicationTable().catch(() => {});
  const payload = analysis || draft || {};
  const result = await sharedPool.query(
    `INSERT INTO crm_ai_email_communications
      (entity_type, entity_id, contact_email, subject, body, intent, tone, status, event_type, sentiment, engagement_score,
       conversion_signal, urgency, next_action, suggested_stage, revenue_impact, ai_payload, learning_tags, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      "team_corporate", corporateId || null, contactEmail || null, subject || null, message || null, intent || payload.intent || null, tone || payload.tone || null,
      status || eventType || "draft", eventType || null, payload.sentiment || null, Number(payload.engagementScore) || 0, payload.conversionSignal || null, payload.urgency || null,
      JSON.stringify(payload.nextAction || {}), payload.suggestedStage || payload.pipelineStageSuggestion || null, Number(payload.revenueImpact) || 0,
      JSON.stringify({ ...payload, replyText: replyText || null }), JSON.stringify(payload.learningTags || payload.reasons || []), teamUserId || null,
    ]
  );
  return result.rows[0];
};

const _logTeamCommunication = async ({
  teamUserId,
  corporateId,
  channel,
  recipient,
  recipientMode,
  templateId,
  templateName,
  subject,
  message,
  provider,
  status,
  providerMessageId,
  errorMessage,
}) => {
  const pool = sharedPool;
  await pool.query(
    `INSERT INTO team_communication_logs
      (team_user_id, corporate_id, channel, recipient, recipient_mode, template_id, template_name, subject, message, provider, status, provider_message_id, error_message)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      teamUserId,
      corporateId || null,
      channel,
      recipient,
      recipientMode || 'single',
      templateId || null,
      templateName || null,
      subject || null,
      message,
      provider || null,
      status,
      providerMessageId || null,
      errorMessage || null,
    ]
  );
};

router.post('/communications/send', authTeam, async (req, res) => {
  try {
    const {
      channel,
      to,
      recipients = [],
      recipientMode = 'single',
      subject = '',
      message = '',
      corporateId,
      templateId,
      templateName,
      companyName,
    } = req.body || {};
    const safeChannel = String(channel || '').toLowerCase();
    const safeMessage = String(message || '').trim();
    const recipientList = _extractRecipients({ to, recipients });
    const teamUserId = req.teamUser?.id || req.user?.id;

    if (!['email', 'whatsapp', 'sms'].includes(safeChannel)) {
      return res.status(400).json({ success: false, message: 'Invalid channel. Use email, whatsapp, or sms.' });
    }
    if (!safeMessage || recipientList.length === 0) {
      return res.status(400).json({ success: false, message: 'Message and at least one recipient are required.' });
    }
    if (recipientList.length > 500) {
      return res.status(400).json({ success: false, message: 'Recipient limit exceeded. Maximum 500 recipients per request.' });
    }

    if (safeChannel === 'email') {
      const emailRecipients = recipientList.map(_normalizeEmail).filter((email) => /^\S+@\S+\.\S+$/.test(email));
      if (emailRecipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid recipient email addresses found.' });
      }

      const mailer = _teamMailer();
      const sendResults = [];
      for (const email of emailRecipients) {
        try {
          const sent = await mailer.sendMail({
            from: `"SmartHealth Team" <${process.env.SMTP_FROM || 'noreply@mediqzy.com'}>`,
            to: email,
            subject: String(subject || 'SmartHealth Communication').slice(0, 200),
            text: safeMessage,
            html: _buildProfessionalEmailHtml({
              subject: String(subject || 'SmartHealth Communication').slice(0, 200),
              message: safeMessage,
              companyName,
            }),
          });

          await _logTeamCommunication({
            teamUserId,
            corporateId,
            channel: 'email',
            recipient: email,
            recipientMode,
            templateId,
            templateName,
            subject,
            message: safeMessage,
            provider: 'smtp',
            status: 'sent',
            providerMessageId: sent?.messageId || null,
          });
          sendResults.push({ recipient: email, success: true, messageId: sent?.messageId || null });
        } catch (err) {
          await _logTeamCommunication({
            teamUserId,
            corporateId,
            channel: 'email',
            recipient: email,
            recipientMode,
            templateId,
            templateName,
            subject,
            message: safeMessage,
            provider: 'smtp',
            status: 'failed',
            errorMessage: err?.message || 'Email send failed',
          });
          sendResults.push({ recipient: email, success: false, error: err?.message || 'Email send failed' });
        }
      }

      const successCount = sendResults.filter((item) => item.success).length;
      const failedCount = sendResults.length - successCount;
      return res.status(failedCount > 0 ? 207 : 200).json({
        success: failedCount === 0,
        message: `Email send complete. Success: ${successCount}, Failed: ${failedCount}`,
        channel: safeChannel,
        summary: { total: sendResults.length, success: successCount, failed: failedCount },
        results: sendResults,
      });
    }

    if (safeChannel === 'whatsapp') {
      const phoneRecipients = recipientList.map((value) => _normalizePhone(String(value))).filter((value) => value && value.length >= 10);
      if (phoneRecipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid WhatsApp recipient numbers found.' });
      }

      // Prefer Twilio WhatsApp (existing production path), then fallback to Meta Graph API.
      if (whatsappProductionService?.twilioConfigured) {
        const results = [];
        for (const normalizedTo of phoneRecipients) {
          try {
            const twilioResponse = await whatsappProductionService.sendSessionMessage({
              to: normalizedTo,
              body: safeMessage.slice(0, 4096),
            });
            await _logTeamCommunication({
              teamUserId,
              corporateId,
              channel: 'whatsapp',
              recipient: normalizedTo,
              recipientMode,
              templateId,
              templateName,
              subject,
              message: safeMessage,
              provider: 'twilio',
              status: 'sent',
              providerMessageId: twilioResponse?.sid || null,
            });
            results.push({ recipient: normalizedTo, success: true, provider: 'twilio', sid: twilioResponse?.sid || null, status: twilioResponse?.status || null });
          } catch (err) {
            await _logTeamCommunication({
              teamUserId,
              corporateId,
              channel: 'whatsapp',
              recipient: normalizedTo,
              recipientMode,
              templateId,
              templateName,
              subject,
              message: safeMessage,
              provider: 'twilio',
              status: 'failed',
              errorMessage: err?.message || 'WhatsApp send failed',
            });
            results.push({ recipient: normalizedTo, success: false, provider: 'twilio', error: err?.message || 'WhatsApp send failed' });
          }
        }

        const successCount = results.filter((item) => item.success).length;
        const failedCount = results.length - successCount;
        return res.status(failedCount > 0 ? 207 : 200).json({
          success: failedCount === 0,
          message: `WhatsApp send complete (Twilio). Success: ${successCount}, Failed: ${failedCount}`,
          channel: safeChannel,
          provider: 'twilio',
          summary: { total: results.length, success: successCount, failed: failedCount },
          results,
        });
      }

      const accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!accessToken || !phoneNumberId) {
        return res.status(500).json({
          success: false,
          message: 'WhatsApp is not configured on server (Twilio/Meta config missing).',
        });
      }

      const results = [];
      for (const normalizedTo of phoneRecipients) {
        try {
          const metaResponse = await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
              messaging_product: 'whatsapp',
              to: normalizedTo,
              type: 'text',
              text: { body: safeMessage.slice(0, 4096) },
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              timeout: 15000,
            }
          );
          const providerMessageId = metaResponse?.data?.messages?.[0]?.id || null;
          await _logTeamCommunication({
            teamUserId,
            corporateId,
            channel: 'whatsapp',
            recipient: normalizedTo,
            recipientMode,
            templateId,
            templateName,
            subject,
            message: safeMessage,
            provider: 'meta',
            status: 'sent',
            providerMessageId,
          });
          results.push({ recipient: normalizedTo, success: true, provider: 'meta', messageId: providerMessageId });
        } catch (err) {
          await _logTeamCommunication({
            teamUserId,
            corporateId,
            channel: 'whatsapp',
            recipient: normalizedTo,
            recipientMode,
            templateId,
            templateName,
            subject,
            message: safeMessage,
            provider: 'meta',
            status: 'failed',
            errorMessage: err?.message || 'WhatsApp send failed',
          });
          results.push({ recipient: normalizedTo, success: false, provider: 'meta', error: err?.message || 'WhatsApp send failed' });
        }
      }

      const successCount = results.filter((item) => item.success).length;
      const failedCount = results.length - successCount;
      return res.status(failedCount > 0 ? 207 : 200).json({
        success: failedCount === 0,
        message: `WhatsApp send complete (Meta). Success: ${successCount}, Failed: ${failedCount}`,
        channel: safeChannel,
        provider: 'meta',
        summary: { total: results.length, success: successCount, failed: failedCount },
        results,
      });
    }

    const smsService = _smsService();
    if (!smsService) {
      return res.status(500).json({ success: false, message: 'SMS is not configured on server.' });
    }
    const phoneRecipients = recipientList.map((value) => _normalizePhone(String(value))).filter((value) => value && value.length >= 10);
    if (phoneRecipients.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid SMS recipient numbers found.' });
    }

    const results = [];
    for (const normalizedTo of phoneRecipients) {
      try {
        const smsResult = await smsService.sendSMS({
          to: normalizedTo,
          message: safeMessage,
          templateId: templateId || process.env.SMS_TEMPLATE_ID,
        });

        if (!smsResult?.success) {
          await _logTeamCommunication({
            teamUserId,
            corporateId,
            channel: 'sms',
            recipient: normalizedTo,
            recipientMode,
            templateId,
            templateName,
            subject,
            message: safeMessage,
            provider: smsResult?.provider || 'sms',
            status: 'failed',
            errorMessage: smsResult?.error || 'SMS provider rejected the message.',
          });
          results.push({ recipient: normalizedTo, success: false, provider: smsResult?.provider || 'sms', error: smsResult?.error || 'SMS provider rejected the message.' });
          continue;
        }

        await _logTeamCommunication({
          teamUserId,
          corporateId,
          channel: 'sms',
          recipient: normalizedTo,
          recipientMode,
          templateId,
          templateName,
          subject,
          message: safeMessage,
          provider: smsResult?.provider || 'sms',
          status: 'sent',
          providerMessageId: smsResult?.messageId || null,
        });
        results.push({ recipient: normalizedTo, success: true, provider: smsResult?.provider || 'sms', messageId: smsResult?.messageId || null });
      } catch (err) {
        await _logTeamCommunication({
          teamUserId,
          corporateId,
          channel: 'sms',
          recipient: normalizedTo,
          recipientMode,
          templateId,
          templateName,
          subject,
          message: safeMessage,
          provider: 'sms',
          status: 'failed',
          errorMessage: err?.message || 'SMS send failed',
        });
        results.push({ recipient: normalizedTo, success: false, provider: 'sms', error: err?.message || 'SMS send failed' });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    const failedCount = results.length - successCount;
    return res.status(failedCount > 0 ? 207 : 200).json({
      success: failedCount === 0,
      message: `SMS send complete. Success: ${successCount}, Failed: ${failedCount}`,
      channel: safeChannel,
      summary: { total: results.length, success: successCount, failed: failedCount },
      results,
    });
  } catch (error) {
    console.error('[Team] communication send error:', error?.response?.data || error?.message || error);
    return res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error?.message || 'Failed to send communication',
    });
  }
});

router.post("/communications/ai-draft", authTeam, async (req, res) => {
  try {
    const teamUserId = req.teamUser?.id || req.user?.id;
    const corporateId = req.body?.corporateId ? parseInt(String(req.body.corporateId), 10) : null;
    const loadedCorporate = await _loadTeamCorporate(corporateId);
    const corporate = loadedCorporate || req.body?.corporate || {};
    const intent = req.body?.intent || "corporate_follow_up";
    const tone = req.body?.tone || "professional";
    const channel = req.body?.channel || "email";
    const context = { ...(req.body?.context || {}), channel, teamDashboard: true };

    const draft = await generateAssistedEmailDraft({ entityType: "team_corporate", entity: corporate, intent, tone, context, previousMessages: [] });
    const row = await _recordTeamAiCommunication({
      teamUserId, corporateId, contactEmail: corporate.email || req.body?.contactEmail || null, subject: draft.subject, message: draft.body,
      intent, tone: draft.tone || tone, status: "draft", draft,
    });

    return res.json({ success: true, data: { id: row.id, draft: { ...draft, message: draft.body }, communication: row } });
  } catch (error) {
    console.error("[Team] AI communication draft error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to generate AI communication draft" });
  }
});

router.post("/communications/ai-monitor", authTeam, async (req, res) => {
  try {
    const teamUserId = req.teamUser?.id || req.user?.id;
    const corporateId = req.body?.corporateId ? parseInt(String(req.body.corporateId), 10) : null;
    const existingId = req.body?.communicationId ? parseInt(String(req.body.communicationId), 10) : null;
    const eventType = req.body?.eventType || "sent";
    const loadedCorporate = await _loadTeamCorporate(corporateId);
    const corporate = loadedCorporate || req.body?.corporate || {};
    let existing = null;
    if (existingId) {
      const result = await sharedPool.query(`SELECT * FROM crm_ai_email_communications WHERE id = $1 AND created_by = $2`, [existingId, teamUserId]);
      existing = result.rows[0] || null;
    }
    const analysis = await analyzeEmailCommunication({
      eventType, subject: req.body?.subject || existing?.subject || "", body: req.body?.message || req.body?.body || existing?.body || "",
      replyText: req.body?.replyText || "", currentStage: corporate.status || req.body?.currentStage || "", entity: corporate,
      revenueImpact: req.body?.revenueImpact || existing?.revenue_impact || 0,
    });
    const row = await _recordTeamAiCommunication({
      teamUserId, corporateId, contactEmail: corporate.email || req.body?.contactEmail || existing?.contact_email || null,
      subject: req.body?.subject || existing?.subject || null, message: req.body?.message || req.body?.body || existing?.body || null,
      intent: analysis.intent, tone: req.body?.tone || existing?.tone || null, status: eventType, eventType, analysis, replyText: req.body?.replyText || null,
    });
    if (existingId) await sharedPool.query(`UPDATE crm_ai_email_communications SET status=$1, event_type=$2, updated_at=NOW() WHERE id=$3 AND created_by=$4`, [eventType, eventType, existingId, teamUserId]).catch(() => {});
    return res.json({ success: true, data: { id: row.id, analysis, communication: row } });
  } catch (error) {
    console.error("[Team] AI communication monitor error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to monitor AI communication" });
  }
});

router.get("/communications/ai-dashboard", authTeam, async (req, res) => {
  try {
    const teamUserId = req.teamUser?.id || req.user?.id;
    const corporateId = req.query?.corporateId ? parseInt(String(req.query.corporateId), 10) : null;
    const days = Math.min(Math.max(parseInt(String(req.query?.days || 30), 10) || 30, 1), 365);
    const values = [teamUserId, days];
    let corporateClause = "";
    if (corporateId) { values.push(corporateId); corporateClause = "AND entity_id = $3"; }
    const stats = await sharedPool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = $q$draft$q$)::int AS drafts,
              COUNT(*) FILTER (WHERE event_type = $q$sent$q$)::int AS sent,
              COUNT(*) FILTER (WHERE event_type = $q$reply$q$)::int AS replies,
              COUNT(*) FILTER (WHERE conversion_signal = $q$hot$q$)::int AS hot_signals,
              ROUND(AVG(engagement_score))::int AS avg_engagement,
              COALESCE(SUM(revenue_impact),0)::numeric AS revenue_influenced
       FROM crm_ai_email_communications
       WHERE created_by = $1 AND entity_type = $q$team_corporate$q$
         AND created_at >= NOW() - make_interval(days => $2::int)
         ${corporateClause}`, values);
    const actions = await sharedPool.query(
      `SELECT id, subject, body, contact_email AS "contactEmail", status, event_type AS "eventType", sentiment, engagement_score AS "engagementScore",
              conversion_signal AS "conversionSignal", urgency, next_action AS "nextAction", suggested_stage AS "suggestedStage",
              revenue_impact AS "revenueImpact", created_at AS "createdAt"
       FROM crm_ai_email_communications
       WHERE created_by = $1 AND entity_type = $q$team_corporate$q$
         AND created_at >= NOW() - make_interval(days => $2::int)
         ${corporateClause}
       ORDER BY engagement_score DESC, created_at DESC LIMIT 10`, values);
    const row = stats.rows[0] || {};
    const sent = Number(row.sent) || 0;
    const replies = Number(row.replies) || 0;
    const total = Number(row.total) || 0;
    const hotSignals = Number(row.hot_signals) || 0;
    return res.json({ success: true, data: { windowDays: days, totals: { total, drafts: Number(row.drafts) || 0, sent, replies, hotSignals, avgEngagement: Number(row.avg_engagement) || 0, revenueInfluenced: Number(row.revenue_influenced) || 0 }, rates: { replyRate: sent ? Math.round((replies / sent) * 100) : 0, hotSignalRate: total ? Math.round((hotSignals / total) * 100) : 0 }, nextActions: actions.rows } });
  } catch (error) {
    console.error("[Team] AI communication dashboard error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to fetch AI communication dashboard" });
  }
});

router.get('/communications/logs', authTeam, async (req, res) => {
  try {
    const teamUserId = req.teamUser?.id || req.user?.id;
    const {
      page = 1,
      limit = 20,
      channel,
      status,
      corporateId,
      search,
      startDate,
      endDate,
    } = req.query;

    const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 200);
    const safePage = Math.max(parseInt(String(page), 10) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    const conditions = ['team_user_id = $1'];
    const values = [teamUserId];
    let idx = 2;

    if (channel) { conditions.push(`channel = $${idx++}`); values.push(String(channel)); }
    if (status) { conditions.push(`status = $${idx++}`); values.push(String(status)); }
    if (corporateId) { conditions.push(`corporate_id = $${idx++}`); values.push(parseInt(String(corporateId), 10)); }
    if (search) {
      conditions.push(`(recipient ILIKE $${idx} OR COALESCE(template_name,'') ILIKE $${idx} OR COALESCE(subject,'') ILIKE $${idx})`);
      values.push(`%${String(search)}%`);
      idx += 1;
    }
    if (startDate) { conditions.push(`created_at >= $${idx++}`); values.push(new Date(String(startDate))); }
    if (endDate) { conditions.push(`created_at <= $${idx++}`); values.push(new Date(String(endDate))); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const pool = sharedPool;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM team_communication_logs ${whereClause}`,
      values
    );
    const total = countResult.rows[0]?.total || 0;

    const logResult = await pool.query(
      `SELECT id, team_user_id, corporate_id, channel, recipient, recipient_mode, template_id, template_name, subject, provider, status, provider_message_id, error_message, created_at
       FROM team_communication_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, safeLimit, offset]
    );

    return res.json({
      success: true,
      logs: logResult.rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error('[Team] communication logs error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Failed to fetch communication logs' });
  }
});

router.get('/communications/analytics', authTeam, async (req, res) => {
  try {
    const teamUserId = req.teamUser?.id || req.user?.id;
    const { corporateId, days = 30 } = req.query;
    const safeDays = Math.min(Math.max(parseInt(String(days), 10) || 30, 1), 365);

    const values = [teamUserId, safeDays];
    let corporateClause = '';
    if (corporateId) {
      values.push(parseInt(String(corporateId), 10));
      corporateClause = `AND corporate_id = $3`;
    }

    const pool = sharedPool;
    const summary = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM team_communication_logs
       WHERE team_user_id = $1
         AND created_at >= NOW() - ($2 || ' days')::interval
         ${corporateClause}`,
      values
    );

    const byChannel = await pool.query(
      `SELECT channel,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM team_communication_logs
       WHERE team_user_id = $1
         AND created_at >= NOW() - ($2 || ' days')::interval
         ${corporateClause}
       GROUP BY channel
       ORDER BY channel ASC`,
      values
    );

    const trend = await pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM team_communication_logs
       WHERE team_user_id = $1
         AND created_at >= NOW() - ($2 || ' days')::interval
         ${corporateClause}
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY DATE_TRUNC('day', created_at) ASC`,
      values
    );

    const s = summary.rows[0] || { total: 0, sent: 0, failed: 0 };
    const successRate = s.total > 0 ? Number(((s.sent * 100) / s.total).toFixed(2)) : 0;

    return res.json({
      success: true,
      windowDays: safeDays,
      summary: {
        total: Number(s.total) || 0,
        sent: Number(s.sent) || 0,
        failed: Number(s.failed) || 0,
        successRate,
      },
      byChannel: byChannel.rows,
      trend: trend.rows,
    });
  } catch (error) {
    console.error('[Team] communication analytics error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Failed to fetch communication analytics' });
  }
});

// List all registered doctors (with search + status filter)
router.get('/registered-doctors', authTeam, async (req, res) => {
  try {
    const { search = '', status = 'all', limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status === 'pending') {
      where.isVerified = false;
      where.status = 'pending';
    }
    if (status === 'active') {
      where.isVerified = true;
      where.status = 'active';
    }
    if (status === 'rejected') {
      where.isVerified = false;
      where.status = 'inactive';
    }
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
    const metadata = { ...(doctor.metadata || {}) };
    delete metadata.rejectedAt;
    delete metadata.rejectionReason;
    await doctor.update({ isVerified: true, documentVerified: true, status: 'active', metadata });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();
    // Send activation email to doctor
    try {
      await _teamMailer().sendMail({
        from: `"SmartHealth Team" <${process.env.SMTP_FROM || 'noreply@mediqzy.com'}>`,
        to: doctor.email,
        subject: `✅ Your SmartHealth Doctor Account is Active — Welcome, ${doctorName}!`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f4f8"><tr><td align="center" style="padding:40px 20px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">
  <tr><td style="background:linear-gradient(135deg,#059669,#0d9488);padding:40px;text-align:center;">
    <div style="width:72px;height:72px;background:rgba(255,255,255,0.2);border-radius:50%;margin:0 auto 20px;line-height:72px;font-size:36px;">✅</div>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:800;">Account Activated!</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your SmartHealth doctor account is now live</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 12px">Hello, ${doctorName}!</p>
    <p style="color:#475569;line-height:1.8;font-size:14px;margin:0 0 28px">
      Congratulations! Our team has reviewed and verified your registration documents.
      Your SmartHealth doctor account is now <strong style="color:#059669">fully active</strong>.
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
    <p style="margin:0;font-size:11px;color:#94a3b8">SmartHealth · Mayden SmartHealth Pvt Ltd · support@mediqzy.com</p>
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

// Delete doctor account
router.delete('/registered-doctors/:id', authTeam, async (req, res) => {
  try {
    const doctor = await doctorModel.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();
    await doctor.destroy();
    return res.json({ success: true, message: `Doctor ${doctorName} deleted successfully` });
  } catch (err) {
    console.error('[Team] delete doctor error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete doctor' });
  }
});

// Reject doctor account
router.patch('/registered-doctors/:id/reject', authTeam, async (req, res) => {
  try {
    const doctor = await doctorModel.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    const { reason = 'Your documents could not be verified. Please re-register with valid documents.' } = req.body;
    await doctor.update({
      isVerified: false,
      documentVerified: false,
      status: 'inactive',
      metadata: {
        ...(doctor.metadata || {}),
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason,
      },
    });
    const doctorName = `${doctor.prefix || ''} ${doctor.firstName} ${doctor.lastName}`.trim();
    try {
      await _teamMailer().sendMail({
        from: `"SmartHealth Team" <${process.env.SMTP_FROM || 'noreply@mediqzy.com'}>`,
        to: doctor.email,
        subject: `SmartHealth Doctor Registration — Update Required`,
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
      Please contact <a href="mailto:support@mediqzy.com" style="color:#1d4ed8">support@mediqzy.com</a> for assistance or to re-submit your application.
    </p>
  </td></tr>
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">Mediczy · Mayden SmartHealth Pvt Ltd · support@mediqzy.com</p>
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

// ─── AI Text Generation ───────────────────────────────────────────────────────
router.post('/ai/generate', authTeam, async (req, res) => {
  try {
    const { prompt, maxTokens = 400, temperature = 0.7 } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'prompt is required' });
    }
    let content = '';
    try {
      const r = await llmProvider.chat({ messages: [{ role: 'user', content: prompt.trim() }], maxTokens, temperature, forceProvider: 'sib', skipCache: true });
      content = r?.content?.trim() || '';
    } catch (_) {}
    if (!content) {
      const r = await llmProvider.chat({ messages: [{ role: 'user', content: prompt.trim() }], maxTokens, temperature, forceProvider: 'groq', skipCache: true });
      content = r?.content?.trim() || '';
    }
    if (!content) return res.status(500).json({ success: false, message: 'AI provider returned empty response' });
    res.json({ success: true, data: { content } });
  } catch (err) {
    console.error('[ai/generate]', err.message);
    res.status(500).json({ success: false, message: err.message || 'AI generation failed' });
  }
});

export default router;
