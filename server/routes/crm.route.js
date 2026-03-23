import express from 'express';
import { body, validationResult } from 'express-validator';
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import userModel from '../models/user.model.intelligent.js';
import { authCRM } from '../middleware/crm.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import sharedPool from '../db/pgPool.js';

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
      CREATE TABLE IF NOT EXISTS crm_refresh_tokens (
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
      CREATE INDEX IF NOT EXISTS idx_crt_jti     ON crm_refresh_tokens(jti);
      CREATE INDEX IF NOT EXISTS idx_crt_user_id ON crm_refresh_tokens(user_id);

      CREATE TABLE IF NOT EXISTS crm_login_attempts (
        id         BIGSERIAL    PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        succeeded  BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_cla_email_ts
        ON crm_login_attempts(email, created_at);

      CREATE TABLE IF NOT EXISTS crm_leads (
        id              BIGSERIAL    PRIMARY KEY,
        name            VARCHAR(255) NOT NULL,
        email           VARCHAR(255),
        phone           VARCHAR(50),
        company         VARCHAR(255),
        designation     VARCHAR(255),
        source          VARCHAR(100) DEFAULT 'manual',
        status          VARCHAR(50)  NOT NULL DEFAULT 'new',
        priority        VARCHAR(20)  DEFAULT 'medium',
        assigned_to     INTEGER,
        notes           TEXT,
        tags            JSONB        DEFAULT '[]'::jsonb,
        custom_fields   JSONB        DEFAULT '{}'::jsonb,
        last_contacted  TIMESTAMPTZ,
        next_followup   TIMESTAMPTZ,
        converted_at    TIMESTAMPTZ,
        deal_id         BIGINT,
        created_by      INTEGER      NOT NULL,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_leads_status      ON crm_leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_assigned     ON crm_leads(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_leads_source       ON crm_leads(source);
      CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON crm_leads(next_followup);

      CREATE TABLE IF NOT EXISTS crm_deals (
        id              BIGSERIAL    PRIMARY KEY,
        title           VARCHAR(255) NOT NULL,
        lead_id         BIGINT,
        value           NUMERIC(15,2) DEFAULT 0,
        currency        VARCHAR(10)  DEFAULT 'INR',
        stage           VARCHAR(50)  NOT NULL DEFAULT 'qualification',
        probability     INTEGER      DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
        expected_close  DATE,
        assigned_to     INTEGER,
        contact_name    VARCHAR(255),
        contact_email   VARCHAR(255),
        contact_phone   VARCHAR(50),
        company         VARCHAR(255),
        notes           TEXT,
        tags            JSONB        DEFAULT '[]'::jsonb,
        won_at          TIMESTAMPTZ,
        lost_at         TIMESTAMPTZ,
        lost_reason     TEXT,
        created_by      INTEGER      NOT NULL,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_deals_stage     ON crm_deals(stage);
      CREATE INDEX IF NOT EXISTS idx_deals_assigned  ON crm_deals(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_deals_lead      ON crm_deals(lead_id);

      CREATE TABLE IF NOT EXISTS crm_activities (
        id           BIGSERIAL    PRIMARY KEY,
        type         VARCHAR(50)  NOT NULL,
        title        VARCHAR(255) NOT NULL,
        description  TEXT,
        lead_id      BIGINT,
        deal_id      BIGINT,
        scheduled_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        outcome      VARCHAR(100),
        created_by   INTEGER      NOT NULL,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activities_lead ON crm_activities(lead_id);
      CREATE INDEX IF NOT EXISTS idx_activities_deal ON crm_activities(deal_id);
      CREATE INDEX IF NOT EXISTS idx_activities_type ON crm_activities(type);

      CREATE TABLE IF NOT EXISTS crm_contacts (
        id           BIGSERIAL    PRIMARY KEY,
        name         VARCHAR(255) NOT NULL,
        email        VARCHAR(255),
        phone        VARCHAR(50),
        company      VARCHAR(255),
        designation  VARCHAR(255),
        address      TEXT,
        city         VARCHAR(100),
        state        VARCHAR(100),
        tags         JSONB        DEFAULT '[]'::jsonb,
        notes        TEXT,
        lead_id      BIGINT,
        created_by   INTEGER      NOT NULL,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_email   ON crm_contacts(email);
      CREATE INDEX IF NOT EXISTS idx_contacts_company  ON crm_contacts(company);
    `);
    console.log('[CRM] DB tables initialized');
  } catch (err) {
    console.error('[CRM] DB table init error:', err.message);
  }
})();

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function checkLockout(email, ip) {
  const pool = sharedPool;
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60 * 1000);
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM crm_login_attempts
     WHERE (email = $1 OR ip_address = $2)
       AND succeeded = FALSE AND created_at >= $3`,
    [email.toLowerCase(), ip, windowStart]
  );
  return parseInt(rows[0].cnt, 10) >= LOCKOUT_MAX_ATTEMPTS;
}

async function recordAttempt(email, ip, succeeded) {
  await sharedPool.query(
    `INSERT INTO crm_login_attempts (email, ip_address, succeeded) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), ip, succeeded]
  );
}

async function clearFailedAttempts(email, ip) {
  await sharedPool.query(
    `DELETE FROM crm_login_attempts WHERE (email = $1 OR ip_address = $2) AND succeeded = FALSE`,
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
    `INSERT INTO crm_refresh_tokens (jti, user_id, token_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [jti, payload.id, tokenHash, expiresAt, ip]
  );

  return { accessToken, refreshToken, jti };
}

async function revokeRefreshToken(jti) {
  await sharedPool.query(
    `UPDATE crm_refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE jti = $1`,
    [jti]
  );
}

async function revokeAllUserTokens(userId) {
  await sharedPool.query(
    `UPDATE crm_refresh_tokens SET revoked = TRUE, revoked_at = NOW()
     WHERE user_id = $1 AND revoked = FALSE`,
    [userId]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

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
      await auditLoginAttempt(req, null, email, false, 'CRM user not found').catch(() => {});
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.status && user.status !== 'active') {
      await auditLoginAttempt(req, user.id, email, false, 'Account inactive').catch(() => {});
      return res.status(403).json({ success: false, message: 'Account is inactive. Contact admin.' });
    }

    // CRM access guard: admin, team, or explicit CRM flag in metadata
    let metadata = {};
    try { metadata = user.metadata ? JSON.parse(user.metadata) : {}; } catch (_) { metadata = {}; }

    const hasCRMAccess = Boolean(
      user.isAdmin || user.isTeam ||
      user.role === 'team' || user.role === 'admin' ||
      metadata.isCRM === true || metadata.crmAccess === true
    );

    if (!hasCRMAccess) {
      await recordAttempt(email, ip, false);
      await auditLoginAttempt(req, user.id, email, false, 'CRM access denied').catch(() => {});
      return res.status(403).json({
        success: false,
        message: 'Access denied. CRM privileges required.'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await recordAttempt(email, ip, false);
      await auditLoginAttempt(req, user.id, email, false, 'Invalid password').catch(() => {});
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'crm',
      userType: 'crm',
      isCRM: true,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.organizationId || null,
      crmPermissions: metadata.crmPermissions || ['leads', 'deals', 'contacts', 'activities', 'reports']
    };

    const { accessToken, refreshToken } = await issueTokenPair(payload, ip);

    await clearFailedAttempts(email, ip);
    await user.update({ lastLoginAt: new Date() });
    await auditLoginAttempt(req, user.id, email, true).catch(() => {});

    const crmUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role || 'crm',
      designation: user.designation || 'Sales Representative',
      department: user.department || 'Sales',
      permissions: metadata.crmPermissions || ['leads', 'deals', 'contacts', 'activities', 'reports']
    };

    return res.status(200).json({
      success: true,
      message: 'CRM login successful',
      token: accessToken,
      refreshToken,
      crmUser
    });

  } catch (error) {
    console.error('[CRM Login] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/auth/verify', authCRM, (req, res) => {
  res.status(200).json({ success: true, crmUser: req.crmUser });
});

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
      `SELECT * FROM crm_refresh_tokens WHERE jti = $1`,
      [decoded.jti]
    );

    if (!rows.length || rows[0].revoked || rows[0].token_hash !== tokenHash) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked or not found' });
    }

    await revokeRefreshToken(decoded.jti);

    const user = await userModel.findOne({ where: { id: decoded.id } });
    if (!user || (user.status && user.status !== 'active')) {
      return res.status(403).json({ success: false, message: 'Account inactive' });
    }

    let metadata = {};
    try { metadata = user.metadata ? JSON.parse(user.metadata) : {}; } catch (_) { metadata = {}; }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'crm',
      userType: 'crm',
      isCRM: true,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.organizationId || null,
      crmPermissions: metadata.crmPermissions || ['leads', 'deals', 'contacts', 'activities', 'reports']
    };

    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(payload, ip);

    return res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('[CRM Refresh] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/logout', authCRM, async (req, res) => {
  try {
    await revokeAllUserTokens(req.crmUser.id);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/profile', authCRM, async (req, res) => {
  try {
    const user = await userModel.findOne({
      where: { id: req.crmUser.id },
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'metadata', 'designation', 'department']
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({
      success: true,
      crmUser: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, designation: user.designation || 'Sales Representative',
        department: user.department || 'Sales',
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/dashboard/stats', authCRM, async (req, res) => {
  try {
    const pool = sharedPool;
    const [leads, deals, activities, contacts] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'new')        AS new_leads,
        COUNT(*) FILTER (WHERE status = 'contacted')   AS contacted,
        COUNT(*) FILTER (WHERE status = 'qualified')   AS qualified,
        COUNT(*) FILTER (WHERE status = 'converted')   AS converted,
        COUNT(*) FILTER (WHERE status = 'lost')        AS lost,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS this_week,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
      FROM crm_leads`),
      pool.query(`SELECT
        COUNT(*) AS total,
        COALESCE(SUM(value), 0) AS total_value,
        COALESCE(SUM(value) FILTER (WHERE stage = 'won'), 0) AS won_value,
        COUNT(*) FILTER (WHERE stage = 'won')           AS won_count,
        COUNT(*) FILTER (WHERE stage = 'lost')          AS lost_count,
        COUNT(*) FILTER (WHERE stage NOT IN ('won','lost')) AS active_count,
        COALESCE(AVG(probability) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS avg_probability,
        COALESCE(SUM(value * probability / 100.0) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS weighted_pipeline
      FROM crm_deals`),
      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
        COUNT(*) FILTER (WHERE completed_at IS NULL AND scheduled_at < NOW()) AS overdue,
        COUNT(*) FILTER (WHERE completed_at IS NULL AND scheduled_at >= NOW()) AS upcoming,
        COUNT(*) FILTER (WHERE type = 'call')  AS calls,
        COUNT(*) FILTER (WHERE type = 'email') AS emails,
        COUNT(*) FILTER (WHERE type = 'meeting') AS meetings
      FROM crm_activities`),
      pool.query(`SELECT COUNT(*) AS total FROM crm_contacts`)
    ]);
    return res.status(200).json({
      success: true,
      data: { leads: leads.rows[0], deals: deals.rows[0], activities: activities.rows[0], contacts: { total: contacts.rows[0].total } }
    });
  } catch (error) {
    console.error('[CRM Stats] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEADS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/leads', authCRM, async (req, res) => {
  try {
    const pool = sharedPool;
    const { page = 1, limit = 25, status, source, search, sortBy = 'created_at', sortOrder = 'DESC', assigned_to, priority } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (status && status !== 'all') { params.push(status); conditions.push(`status = $${params.length}`); }
    if (source && source !== 'all') { params.push(source); conditions.push(`source = $${params.length}`); }
    if (priority && priority !== 'all') { params.push(priority); conditions.push(`priority = $${params.length}`); }
    if (assigned_to) { params.push(parseInt(assigned_to)); conditions.push(`assigned_to = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR company ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['created_at', 'updated_at', 'name', 'status', 'priority', 'next_followup'];
    const sort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM crm_leads ${where}`, params),
      pool.query(`SELECT * FROM crm_leads ${where} ORDER BY ${sort} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, parseInt(limit), offset])
    ]);
    return res.status(200).json({ success: true, data: dataRes.rows, pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)) } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch leads' }); }
});

router.post('/leads', authCRM, [body('name').notEmpty().withMessage('Lead name is required')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const { name, email, phone, company, designation, source, status, priority, notes, tags, next_followup } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_leads (name, email, phone, company, designation, source, status, priority, notes, tags, next_followup, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, email||null, phone||null, company||null, designation||null, source||'manual', status||'new', priority||'medium', notes||null, JSON.stringify(tags||[]), next_followup||null, req.crmUser.id, req.crmUser.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to create lead' }); }
});

router.get('/leads/:id', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_leads WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    const activities = await sharedPool.query(`SELECT * FROM crm_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    return res.status(200).json({ success: true, data: { ...rows[0], activities: activities.rows } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch lead' }); }
});

router.put('/leads/:id', authCRM, async (req, res) => {
  try {
    const { name, email, phone, company, designation, source, status, priority, notes, tags, assigned_to, next_followup } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_leads SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone),
       company=COALESCE($4,company), designation=COALESCE($5,designation), source=COALESCE($6,source),
       status=COALESCE($7,status), priority=COALESCE($8,priority), notes=COALESCE($9,notes), tags=COALESCE($10,tags),
       assigned_to=COALESCE($11,assigned_to), next_followup=COALESCE($12,next_followup),
       converted_at=CASE WHEN $7='converted' AND converted_at IS NULL THEN NOW() ELSE converted_at END,
       updated_at=NOW() WHERE id=$13 RETURNING *`,
      [name, email, phone, company, designation, source, status, priority, notes, tags?JSON.stringify(tags):null, assigned_to, next_followup, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update lead' }); }
});

router.delete('/leads/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_leads WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.status(200).json({ success: true, message: 'Lead deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete lead' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEALS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/deals/pipeline', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`
      SELECT stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS total_value,
             COALESCE(SUM(value*probability/100.0),0) AS weighted_value
      FROM crm_deals WHERE stage NOT IN ('won','lost')
      GROUP BY stage ORDER BY CASE stage WHEN 'qualification' THEN 1 WHEN 'discovery' THEN 2 WHEN 'proposal' THEN 3 WHEN 'negotiation' THEN 4 WHEN 'contract' THEN 5 ELSE 6 END`);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch pipeline' }); }
});

router.get('/deals', authCRM, async (req, res) => {
  try {
    const pool = sharedPool;
    const { page = 1, limit = 25, stage, search, sortBy = 'created_at', sortOrder = 'DESC', assigned_to } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (stage && stage !== 'all') { params.push(stage); conditions.push(`stage = $${params.length}`); }
    if (assigned_to) { params.push(parseInt(assigned_to)); conditions.push(`assigned_to = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(title ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR company ILIKE $${params.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['created_at','updated_at','title','value','stage','expected_close','probability'];
    const sort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM crm_deals ${where}`, params),
      pool.query(`SELECT * FROM crm_deals ${where} ORDER BY ${sort} ${order} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, parseInt(limit), offset])
    ]);
    return res.status(200).json({ success: true, data: dataRes.rows, pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(countRes.rows[0].count)/parseInt(limit)) } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch deals' }); }
});

router.post('/deals', authCRM, [body('title').notEmpty().withMessage('Deal title is required')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const { title, lead_id, value, currency, stage, probability, expected_close, contact_name, contact_email, contact_phone, company, notes, tags } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_deals (title,lead_id,value,currency,stage,probability,expected_close,contact_name,contact_email,contact_phone,company,notes,tags,assigned_to,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [title, lead_id||null, value||0, currency||'INR', stage||'qualification', probability||10, expected_close||null, contact_name||null, contact_email||null, contact_phone||null, company||null, notes||null, JSON.stringify(tags||[]), req.crmUser.id, req.crmUser.id]
    );
    if (lead_id) { await sharedPool.query(`UPDATE crm_leads SET deal_id=$1, updated_at=NOW() WHERE id=$2`, [rows[0].id, lead_id]); }
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to create deal' }); }
});

router.put('/deals/:id', authCRM, async (req, res) => {
  try {
    const { title, value, currency, stage, probability, expected_close, contact_name, contact_email, contact_phone, company, notes, tags, assigned_to, lost_reason } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_deals SET title=COALESCE($1,title), value=COALESCE($2,value), currency=COALESCE($3,currency),
       stage=COALESCE($4,stage), probability=CASE WHEN $4='won' THEN 100 WHEN $4='lost' THEN 0 ELSE COALESCE($5,probability) END,
       expected_close=COALESCE($6,expected_close), contact_name=COALESCE($7,contact_name), contact_email=COALESCE($8,contact_email),
       contact_phone=COALESCE($9,contact_phone), company=COALESCE($10,company), notes=COALESCE($11,notes), tags=COALESCE($12,tags),
       assigned_to=COALESCE($13,assigned_to),
       won_at=CASE WHEN $4='won' AND won_at IS NULL THEN NOW() ELSE won_at END,
       lost_at=CASE WHEN $4='lost' AND lost_at IS NULL THEN NOW() ELSE lost_at END,
       lost_reason=CASE WHEN $4='lost' THEN COALESCE($14,lost_reason) ELSE lost_reason END,
       updated_at=NOW() WHERE id=$15 RETURNING *`,
      [title, value, currency, stage, probability, expected_close, contact_name, contact_email, contact_phone, company, notes, tags?JSON.stringify(tags):null, assigned_to, lost_reason, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Deal not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update deal' }); }
});

router.delete('/deals/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_deals WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Deal not found' });
    return res.status(200).json({ success: true, message: 'Deal deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete deal' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/activities', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 25, type, lead_id, deal_id, overdue } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (type && type !== 'all') { params.push(type); conditions.push(`type = $${params.length}`); }
    if (lead_id) { params.push(parseInt(lead_id)); conditions.push(`lead_id = $${params.length}`); }
    if (deal_id) { params.push(parseInt(deal_id)); conditions.push(`deal_id = $${params.length}`); }
    if (overdue === 'true') { conditions.push(`completed_at IS NULL AND scheduled_at < NOW()`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRes, dataRes] = await Promise.all([
      sharedPool.query(`SELECT COUNT(*) FROM crm_activities ${where}`, params),
      sharedPool.query(`SELECT * FROM crm_activities ${where} ORDER BY COALESCE(scheduled_at,created_at) DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, parseInt(limit), offset])
    ]);
    return res.status(200).json({ success: true, data: dataRes.rows, pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(countRes.rows[0].count)/parseInt(limit)) } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch activities' }); }
});

router.post('/activities', authCRM, [body('type').notEmpty(), body('title').notEmpty()], async (req, res) => {
  const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const { type, title, description, lead_id, deal_id, scheduled_at } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_activities (type,title,description,lead_id,deal_id,scheduled_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type, title, description||null, lead_id||null, deal_id||null, scheduled_at||null, req.crmUser.id]
    );
    if (lead_id) { await sharedPool.query(`UPDATE crm_leads SET last_contacted=NOW(), updated_at=NOW() WHERE id=$1`, [lead_id]); }
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to create activity' }); }
});

router.put('/activities/:id/complete', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`UPDATE crm_activities SET completed_at=NOW(), outcome=$1 WHERE id=$2 RETURNING *`, [req.body.outcome||'completed', req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Activity not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to complete activity' }); }
});

router.delete('/activities/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_activities WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Activity not found' });
    return res.status(200).json({ success: true, message: 'Activity deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete activity' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/contacts', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, company } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    if (company) { params.push(`%${company}%`); conditions.push(`company ILIKE $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRes, dataRes] = await Promise.all([
      sharedPool.query(`SELECT COUNT(*) FROM crm_contacts ${where}`, params),
      sharedPool.query(`SELECT * FROM crm_contacts ${where} ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, parseInt(limit), offset])
    ]);
    return res.status(200).json({ success: true, data: dataRes.rows, pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(countRes.rows[0].count)/parseInt(limit)) } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch contacts' }); }
});

router.post('/contacts', authCRM, [body('name').notEmpty()], async (req, res) => {
  const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const { name, email, phone, company, designation, address, city, state, tags, notes, lead_id } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_contacts (name,email,phone,company,designation,address,city,state,tags,notes,lead_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, email||null, phone||null, company||null, designation||null, address||null, city||null, state||null, JSON.stringify(tags||[]), notes||null, lead_id||null, req.crmUser.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to create contact' }); }
});

router.put('/contacts/:id', authCRM, async (req, res) => {
  try {
    const { name, email, phone, company, designation, address, city, state, tags, notes } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_contacts SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone),
       company=COALESCE($4,company), designation=COALESCE($5,designation), address=COALESCE($6,address),
       city=COALESCE($7,city), state=COALESCE($8,state), tags=COALESCE($9,tags), notes=COALESCE($10,notes),
       updated_at=NOW() WHERE id=$11 RETURNING *`,
      [name, email, phone, company, designation, address, city, state, tags?JSON.stringify(tags):null, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Contact not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update contact' }); }
});

router.delete('/contacts/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_contacts WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Contact not found' });
    return res.status(200).json({ success: true, message: 'Contact deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete contact' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SALES REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/reports/sales-funnel', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`
      SELECT unnest(ARRAY['new','contacted','qualified','proposal','negotiation','converted','lost']) AS stage,
      unnest(ARRAY[
        (SELECT COUNT(*) FROM crm_leads WHERE status='new'),
        (SELECT COUNT(*) FROM crm_leads WHERE status='contacted'),
        (SELECT COUNT(*) FROM crm_leads WHERE status='qualified'),
        (SELECT COUNT(*) FROM crm_deals WHERE stage IN ('proposal')),
        (SELECT COUNT(*) FROM crm_deals WHERE stage IN ('negotiation','contract')),
        (SELECT COUNT(*) FROM crm_deals WHERE stage='won'),
        (SELECT COUNT(*) FROM crm_deals WHERE stage='lost')+(SELECT COUNT(*) FROM crm_leads WHERE status='lost')
      ]) AS count`);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to generate funnel' }); }
});

router.get('/reports/revenue', authCRM, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period) || 30;
    const { rows } = await sharedPool.query(`
      SELECT DATE_TRUNC('day',won_at) AS date, COUNT(*) AS deals_won, SUM(value) AS revenue
      FROM crm_deals WHERE stage='won' AND won_at >= NOW()-($1||' days')::INTERVAL
      GROUP BY DATE_TRUNC('day',won_at) ORDER BY date ASC`, [days.toString()]);
    const totals = await sharedPool.query(`
      SELECT COUNT(*) AS total_won, COALESCE(SUM(value),0) AS total_revenue
      FROM crm_deals WHERE stage='won' AND won_at >= NOW()-($1||' days')::INTERVAL`, [days.toString()]);
    return res.status(200).json({ success: true, data: { daily: rows, totals: totals.rows[0] }, period: days });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to generate revenue report' }); }
});

router.get('/reports/team-performance', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`
      SELECT u.id, u."firstName", u."lastName", u.email,
        COUNT(DISTINCT l.id) AS total_leads,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status='converted') AS converted_leads,
        COUNT(DISTINCT d.id) AS total_deals,
        COUNT(DISTINCT d.id) FILTER (WHERE d.stage='won') AS won_deals,
        COALESCE(SUM(d.value) FILTER (WHERE d.stage='won'),0) AS revenue,
        COUNT(DISTINCT a.id) AS total_activities
      FROM "Users" u
      LEFT JOIN crm_leads l ON l.assigned_to=u.id
      LEFT JOIN crm_deals d ON d.assigned_to=u.id
      LEFT JOIN crm_activities a ON a.created_by=u.id
      WHERE u.role IN ('team','admin') OR u."isTeam"=true OR u."isAdmin"=true
      GROUP BY u.id, u."firstName", u."lastName", u.email
      HAVING COUNT(DISTINCT l.id)+COUNT(DISTINCT d.id)+COUNT(DISTINCT a.id)>0
      ORDER BY revenue DESC`);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to generate team report' }); }
});

export default router;
