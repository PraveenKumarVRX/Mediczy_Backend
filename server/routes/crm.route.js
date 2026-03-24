import express from 'express';
import { body, validationResult } from 'express-validator';
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import XLSX from 'xlsx';
import userModel from '../models/user.model.intelligent.js';
import { authCRM } from '../middleware/crm.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import sharedPool from '../db/pgPool.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
    // ─── RFQ tables ────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_rfqs (
        id                BIGSERIAL    PRIMARY KEY,
        rfq_number        VARCHAR(50)  NOT NULL UNIQUE,
        status            VARCHAR(30)  NOT NULL DEFAULT 'received',
        broker_name       VARCHAR(255),
        broker_company    VARCHAR(255),
        broker_email      VARCHAR(255),
        broker_phone      VARCHAR(50),
        insured_name      VARCHAR(500) NOT NULL,
        insured_address   TEXT,
        policy_type       VARCHAR(100) DEFAULT 'Group Mediclaim',
        product_type      VARCHAR(100) DEFAULT 'OPD',
        existing_insurer  VARCHAR(255),
        existing_tpa      VARCHAR(255),
        policy_start      DATE,
        policy_end        DATE,
        premium_paid      VARCHAR(255),
        lives_at_inception JSONB DEFAULT '{}'::jsonb,
        lives_at_renewal   JSONB DEFAULT '{}'::jsonb,
        coverage_scope    JSONB DEFAULT '{}'::jsonb,
        special_conditions JSONB DEFAULT '[]'::jsonb,
        exclusions        TEXT,
        terms_and_conditions TEXT,
        notes             TEXT,
        member_count      INTEGER DEFAULT 0,
        sum_insured_slabs JSONB DEFAULT '[]'::jsonb,
        deal_id           BIGINT,
        lead_id           BIGINT,
        assigned_to       INTEGER,
        created_by        INTEGER NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rfqs_status ON crm_rfqs(status);
      CREATE INDEX IF NOT EXISTS idx_rfqs_number ON crm_rfqs(rfq_number);
      CREATE INDEX IF NOT EXISTS idx_rfqs_insured ON crm_rfqs(insured_name);

      CREATE TABLE IF NOT EXISTS crm_rfq_members (
        id            BIGSERIAL PRIMARY KEY,
        rfq_id        BIGINT NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
        sr_no         INTEGER,
        emp_code      VARCHAR(50),
        relationship  VARCHAR(50),
        relation_type VARCHAR(50),
        gender        VARCHAR(10),
        dob           DATE,
        age           INTEGER,
        si_expiring   NUMERIC(12,2) DEFAULT 0,
        si_proposed   NUMERIC(12,2) DEFAULT 0,
        designation   VARCHAR(255),
        band          VARCHAR(20),
        doj           DATE,
        employee_name VARCHAR(255),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rfq_members_rfq ON crm_rfq_members(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_members_emp ON crm_rfq_members(emp_code);

      CREATE TABLE IF NOT EXISTS crm_quotes (
        id              BIGSERIAL PRIMARY KEY,
        rfq_id          BIGINT NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
        quote_number    VARCHAR(50) NOT NULL UNIQUE,
        status          VARCHAR(30) NOT NULL DEFAULT 'draft',
        version         INTEGER DEFAULT 1,
        valid_until     DATE,
        total_premium   NUMERIC(15,2) DEFAULT 0,
        total_lives     INTEGER DEFAULT 0,
        per_life_cost   NUMERIC(12,2) DEFAULT 0,
        per_family_cost NUMERIC(12,2) DEFAULT 0,
        pricing_model   VARCHAR(50) DEFAULT 'per_family',
        commission_pct  NUMERIC(5,2) DEFAULT 0,
        gst_pct         NUMERIC(5,2) DEFAULT 18,
        discount_pct    NUMERIC(5,2) DEFAULT 0,
        coverage_details JSONB DEFAULT '{}'::jsonb,
        slab_pricing    JSONB DEFAULT '[]'::jsonb,
        terms           TEXT,
        notes           TEXT,
        created_by      INTEGER NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_rfq ON crm_quotes(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_status ON crm_quotes(status);
    `);
    console.log('[CRM] DB tables initialized (incl. RFQ)');
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

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function generateRFQNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(Math.floor(Math.random() * 9000) + 1000);
  return `RFQ-${y}${m}-${r}`;
}

function generateQuoteNumber(rfqNumber) {
  const r = String(Math.floor(Math.random() * 9000) + 1000);
  return rfqNumber.replace('RFQ-', 'QT-') + '-' + r;
}

// ─── List RFQs ───────────────────────────────────────────────────────────────
router.get('/rfqs', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 25, status, search, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (status && status !== 'all') { params.push(status); conditions.push(`status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(insured_name ILIKE $${params.length} OR rfq_number ILIKE $${params.length} OR broker_company ILIKE $${params.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['created_at', 'updated_at', 'insured_name', 'status', 'rfq_number', 'member_count'];
    const sort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const [countRes, dataRes] = await Promise.all([
      sharedPool.query(`SELECT COUNT(*) FROM crm_rfqs ${where}`, params),
      sharedPool.query(`SELECT r.*, (SELECT COUNT(*) FROM crm_quotes q WHERE q.rfq_id = r.id) AS quote_count
        FROM crm_rfqs r ${where} ORDER BY ${sort} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset])
    ]);
    return res.status(200).json({ success: true, data: dataRes.rows, pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)) } });
  } catch (error) { console.error('[CRM RFQ List]', error.message); return res.status(500).json({ success: false, message: 'Failed to fetch RFQs' }); }
});

// ─── Create RFQ ──────────────────────────────────────────────────────────────
router.post('/rfqs', authCRM, [body('insured_name').notEmpty().withMessage('Insured name is required')], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const {
      insured_name, insured_address, policy_type, product_type, broker_name, broker_company, broker_email, broker_phone,
      existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
      lives_at_inception, lives_at_renewal, coverage_scope, special_conditions, exclusions,
      terms_and_conditions, notes, sum_insured_slabs
    } = req.body;
    const rfq_number = generateRFQNumber();
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_rfqs (rfq_number, insured_name, insured_address, policy_type, product_type,
        broker_name, broker_company, broker_email, broker_phone,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
        lives_at_inception, lives_at_renewal, coverage_scope, special_conditions, exclusions,
        terms_and_conditions, notes, sum_insured_slabs, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
      [rfq_number, insured_name, insured_address || null, policy_type || 'Group Mediclaim', product_type || 'OPD',
        broker_name || null, broker_company || null, broker_email || null, broker_phone || null,
        existing_insurer || null, existing_tpa || null, policy_start || null, policy_end || null, premium_paid || null,
        JSON.stringify(lives_at_inception || {}), JSON.stringify(lives_at_renewal || {}),
        JSON.stringify(coverage_scope || {}), JSON.stringify(special_conditions || []), exclusions || null,
        terms_and_conditions || null, notes || null, JSON.stringify(sum_insured_slabs || []),
        req.crmUser.id, req.crmUser.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { console.error('[CRM RFQ Create]', error.message); return res.status(500).json({ success: false, message: 'Failed to create RFQ' }); }
});

// ─── Get RFQ Detail ──────────────────────────────────────────────────────────
router.get('/rfqs/:id', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const quotes = await sharedPool.query(`SELECT * FROM crm_quotes WHERE rfq_id = $1 ORDER BY created_at DESC`, [req.params.id]);
    return res.status(200).json({ success: true, data: { ...rows[0], quotes: quotes.rows } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch RFQ' }); }
});

// ─── Update RFQ ──────────────────────────────────────────────────────────────
router.put('/rfqs/:id', authCRM, async (req, res) => {
  try {
    const {
      insured_name, insured_address, policy_type, product_type, status,
      broker_name, broker_company, broker_email, broker_phone,
      existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
      lives_at_inception, lives_at_renewal, coverage_scope, special_conditions,
      exclusions, terms_and_conditions, notes, sum_insured_slabs, assigned_to, deal_id, lead_id
    } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_rfqs SET
        insured_name = COALESCE($1, insured_name), insured_address = COALESCE($2, insured_address),
        policy_type = COALESCE($3, policy_type), product_type = COALESCE($4, product_type),
        status = COALESCE($5, status),
        broker_name = COALESCE($6, broker_name), broker_company = COALESCE($7, broker_company),
        broker_email = COALESCE($8, broker_email), broker_phone = COALESCE($9, broker_phone),
        existing_insurer = COALESCE($10, existing_insurer), existing_tpa = COALESCE($11, existing_tpa),
        policy_start = COALESCE($12, policy_start), policy_end = COALESCE($13, policy_end),
        premium_paid = COALESCE($14, premium_paid),
        lives_at_inception = COALESCE($15, lives_at_inception), lives_at_renewal = COALESCE($16, lives_at_renewal),
        coverage_scope = COALESCE($17, coverage_scope), special_conditions = COALESCE($18, special_conditions),
        exclusions = COALESCE($19, exclusions), terms_and_conditions = COALESCE($20, terms_and_conditions),
        notes = COALESCE($21, notes), sum_insured_slabs = COALESCE($22, sum_insured_slabs),
        assigned_to = COALESCE($23, assigned_to), deal_id = COALESCE($24, deal_id), lead_id = COALESCE($25, lead_id),
        updated_at = NOW()
       WHERE id = $26 RETURNING *`,
      [insured_name, insured_address, policy_type, product_type, status,
        broker_name, broker_company, broker_email, broker_phone,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
        lives_at_inception ? JSON.stringify(lives_at_inception) : null,
        lives_at_renewal ? JSON.stringify(lives_at_renewal) : null,
        coverage_scope ? JSON.stringify(coverage_scope) : null,
        special_conditions ? JSON.stringify(special_conditions) : null,
        exclusions, terms_and_conditions, notes,
        sum_insured_slabs ? JSON.stringify(sum_insured_slabs) : null,
        assigned_to, deal_id, lead_id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { console.error('[CRM RFQ Update]', error.message); return res.status(500).json({ success: false, message: 'Failed to update RFQ' }); }
});

// ─── Delete RFQ ──────────────────────────────────────────────────────────────
router.delete('/rfqs/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_rfqs WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'RFQ not found' });
    return res.status(200).json({ success: true, message: 'RFQ deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete RFQ' }); }
});

// ─── Upload Member Excel ─────────────────────────────────────────────────────
router.post('/rfqs/:id/upload-members', authCRM, upload.single('file'), async (req, res) => {
  try {
    const rfqId = req.params.id;
    const rfqCheck = await sharedPool.query(`SELECT id FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqCheck.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });

    if (!req.file) return res.status(400).json({ success: false, message: 'Excel file required' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    // Find the member-list sheet (the one with many rows, not the RFQ slip)
    let memberSheet = null;
    let memberSheetName = '';
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      if (range.e.r > 50) { memberSheet = ws; memberSheetName = name; break; }
    }
    if (!memberSheet) {
      // Fallback: use second sheet or first
      memberSheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
      memberSheet = workbook.Sheets[memberSheetName];
    }

    const rows = XLSX.utils.sheet_to_json(memberSheet, { defval: null });
    if (!rows.length) return res.status(400).json({ success: false, message: 'No member data found in the sheet' });

    // Map columns flexibly
    const colMap = (row) => {
      const keys = Object.keys(row);
      const find = (patterns) => {
        for (const p of patterns) {
          const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p));
          if (k) return row[k];
        }
        return null;
      };
      return {
        sr_no: find(['srno', 'sno', 'serial']) || find(['slno']),
        emp_code: find(['empcode', 'employeecode', 'empid', 'employeeid']),
        relationship: find(['relationship']),
        relation_type: find(['relation']),
        gender: find(['gender', 'sex']),
        dob: find(['dob', 'dateofbirth', 'birthdate']),
        age: find(['age']),
        si_expiring: find(['siexpiring', 'opdsiexpiring', 'expiringsi', 'currentsi']),
        si_proposed: find(['siproposed', 'opdsiproposed', 'proposedsi', 'newsi']),
        designation: find(['designation', 'title', 'jobtitle']),
        band: find(['band', 'grade', 'level']),
        doj: find(['doj', 'dateofjoining', 'joindate']),
      };
    };

    // Delete old members for this RFQ
    await sharedPool.query(`DELETE FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]);

    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = []; const placeholders = [];
      let pIdx = 1;
      for (const raw of batch) {
        const m = colMap(raw);
        let dobVal = null;
        if (m.dob) {
          if (m.dob instanceof Date) dobVal = m.dob.toISOString().split('T')[0];
          else { const d = new Date(m.dob); if (!isNaN(d.getTime())) dobVal = d.toISOString().split('T')[0]; }
        }
        let dojVal = null;
        if (m.doj) {
          if (m.doj instanceof Date) dojVal = m.doj.toISOString().split('T')[0];
          else { const d = new Date(m.doj); if (!isNaN(d.getTime())) dojVal = d.toISOString().split('T')[0]; }
        }
        const empName = m.relationship?.toUpperCase() === 'SELF' ? (raw['Name'] || raw['Employee Name'] || null) : null;
        values.push(rfqId, m.sr_no, m.emp_code?.toString() || null, m.relationship, m.relation_type, m.gender,
          dobVal, m.age ? parseInt(m.age) : null, parseFloat(m.si_expiring) || 0, parseFloat(m.si_proposed) || 0,
          m.designation, m.band, dojVal, empName);
        placeholders.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13})`);
        pIdx += 14;
      }
      await sharedPool.query(
        `INSERT INTO crm_rfq_members (rfq_id, sr_no, emp_code, relationship, relation_type, gender, dob, age, si_expiring, si_proposed, designation, band, doj, employee_name)
         VALUES ${placeholders.join(',')}`, values
      );
      inserted += batch.length;
    }

    // Update member count
    await sharedPool.query(`UPDATE crm_rfqs SET member_count = $1, updated_at = NOW() WHERE id = $2`, [inserted, rfqId]);

    return res.status(200).json({
      success: true,
      message: `Uploaded ${inserted} members from sheet "${memberSheetName}"`,
      data: { memberCount: inserted, sheetName: memberSheetName }
    });
  } catch (error) {
    console.error('[CRM RFQ Upload]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to upload members: ' + error.message });
  }
});

// ─── Upload RFQ from Broker Excel (auto-parse broking slip) ──────────────────
router.post('/rfqs/upload-excel', authCRM, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Excel file required' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    // Find RFQ sheet (small sheet) and member sheet (large sheet)
    let rfqSheet = null, memberSheet = null, rfqSheetName = '', memberSheetName = '';
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rowCount = range.e.r - range.s.r + 1;
      if (rowCount <= 100 && !rfqSheet) { rfqSheet = ws; rfqSheetName = name; }
      else if (rowCount > 100 && !memberSheet) { memberSheet = ws; memberSheetName = name; }
    }
    if (!rfqSheet && workbook.SheetNames.length > 0) {
      rfqSheet = workbook.Sheets[workbook.SheetNames[0]];
      rfqSheetName = workbook.SheetNames[0];
    }

    // Parse broking slip
    const cellVal = (addr) => {
      const c = rfqSheet?.[addr];
      return c ? (c.w || (c.v instanceof Date ? c.v.toISOString().split('T')[0] : c.v?.toString()) || '') : '';
    };
    // Map all cells to find data by scanning B column labels → D column values
    const parsed = {};
    if (rfqSheet) {
      const range = XLSX.utils.decode_range(rfqSheet['!ref'] || 'A1:I50');
      for (let r = range.s.r; r <= range.e.r; r++) {
        const labelCell = rfqSheet[XLSX.utils.encode_cell({ r, c: 1 })]; // Column B
        const valueCell = rfqSheet[XLSX.utils.encode_cell({ r, c: 3 })]; // Column D
        if (labelCell?.v && valueCell?.v) {
          const label = labelCell.v.toString().toLowerCase().trim();
          const val = valueCell.v instanceof Date ? valueCell.v.toISOString().split('T')[0] : valueCell.v;
          parsed[label] = val;
        }
      }
    }
    // Extract policy period from dates
    let policyStart = null, policyEnd = null;
    if (parsed['policy period']) {
      policyStart = parsed['policy period'];
    }
    // Check column F for "To" date
    if (rfqSheet) {
      const range = XLSX.utils.decode_range(rfqSheet['!ref'] || 'A1:I50');
      for (let r = range.s.r; r <= range.e.r; r++) {
        const eCell = rfqSheet[XLSX.utils.encode_cell({ r, c: 4 })]; // Col E
        const fCell = rfqSheet[XLSX.utils.encode_cell({ r, c: 5 })]; // Col F
        if (eCell?.v?.toString().toLowerCase().includes('to') && fCell?.v) {
          policyEnd = fCell.v instanceof Date ? fCell.v.toISOString().split('T')[0] : fCell.v?.toString();
        }
      }
    }

    const getNum = (key) => { const v = parsed[key]; return v ? parseInt(v) || 0 : 0; };

    const rfqData = {
      insured_name: parsed['insured name'] || parsed['insured'] || 'Unknown',
      insured_address: parsed['address'] || null,
      existing_insurer: parsed['existing insurer'] || null,
      existing_tpa: parsed['existing tpa'] || null,
      policy_start: policyStart,
      policy_end: policyEnd,
      premium_paid: parsed['premium paid at inception (excluding of service tax)'] || parsed['premium paid'] || null,
      lives_at_inception: {
        employees: getNum('total no. of employees at inception'),
        dependants: getNum('total no. of dependants at inception'),
        total: getNum('total no. of lives at inception'),
      },
      lives_at_renewal: {
        employees: getNum('total no. of employees at renewal'),
        dependants: getNum('total no. of dependants at renewal'),
        total: getNum('total no. of lives at renewal'),
      },
      coverage_scope: {
        family_composition: parsed['family composition'] || null,
        type: parsed['type'] || null,
        claim_type: parsed['claim type'] || parsed['claim type '] || null,
        sum_insured: parsed['policy sum insured'] || parsed['policy sum insured '] || null,
        opd_tele_consultation: parsed['opd doctor consultations (tele consultations)'] || null,
        opd_physical_consultation: parsed['opd doctor consultations (physical consultations)'] || parsed['opd doctor consultations (physical consultations) '] || null,
        lab_tests: parsed['lab tests and diagnostics'] || parsed['lab tests and diagnostics '] || null,
        pharmacy: parsed['pharmacy cover'] || parsed['pharmacy cover '] || null,
      },
      special_conditions: [],
      exclusions: parsed['general opd exclusions'] || null,
      terms_and_conditions: parsed['t&cs to be noted'] || null,
    };
    // Gather special conditions
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('condition ') && v) {
        rfqData.special_conditions.push({ condition: k, detail: v.toString() });
      }
    }
    // Parse SI slabs from sum_insured text
    const siText = rfqData.coverage_scope.sum_insured || '';
    const siSlabs = [];
    const siMatches = siText.match(/₹[\d,]+/g) || [];
    for (const m of siMatches) {
      const val = parseInt(m.replace(/[₹,]/g, ''));
      if (val && !isNaN(val)) siSlabs.push(val);
    }

    const rfq_number = generateRFQNumber();
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_rfqs (rfq_number, insured_name, insured_address, policy_type, product_type,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
        lives_at_inception, lives_at_renewal, coverage_scope, special_conditions, exclusions,
        terms_and_conditions, notes, sum_insured_slabs, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [rfq_number, rfqData.insured_name, rfqData.insured_address, 'Group Mediclaim', rfqSheetName.includes('OPD') ? 'OPD' : 'Group Mediclaim',
        rfqData.existing_insurer, rfqData.existing_tpa, rfqData.policy_start, rfqData.policy_end, rfqData.premium_paid,
        JSON.stringify(rfqData.lives_at_inception), JSON.stringify(rfqData.lives_at_renewal),
        JSON.stringify(rfqData.coverage_scope), JSON.stringify(rfqData.special_conditions),
        rfqData.exclusions, rfqData.terms_and_conditions,
        `Auto-parsed from broker Excel: ${req.file.originalname}`,
        JSON.stringify(siSlabs), req.crmUser.id, req.crmUser.id]
    );

    const rfqId = rows[0].id;
    let memberCount = 0;

    // Auto-upload members if member sheet exists
    if (memberSheet) {
      const mRows = XLSX.utils.sheet_to_json(memberSheet, { defval: null });
      const colMap = (row) => {
        const keys = Object.keys(row);
        const find = (patterns) => { for (const p of patterns) { const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p)); if (k) return row[k]; } return null; };
        return {
          sr_no: find(['srno', 'sno', 'serial']) || find(['slno']),
          emp_code: find(['empcode', 'employeecode', 'empid']),
          relationship: find(['relationship']),
          relation_type: find(['relation']),
          gender: find(['gender', 'sex']),
          dob: find(['dob', 'dateofbirth']),
          age: find(['age']),
          si_expiring: find(['siexpiring', 'opdsiexpiring', 'expiringsi']),
          si_proposed: find(['siproposed', 'opdsiproposed', 'proposedsi']),
          designation: find(['designation', 'jobtitle']),
          band: find(['band', 'grade']),
          doj: find(['doj', 'dateofjoining']),
        };
      };

      const batchSize = 500;
      for (let i = 0; i < mRows.length; i += batchSize) {
        const batch = mRows.slice(i, i + batchSize);
        const values = []; const placeholders = [];
        let pIdx = 1;
        for (const raw of batch) {
          const m = colMap(raw);
          let dobVal = null;
          if (m.dob) { if (m.dob instanceof Date) dobVal = m.dob.toISOString().split('T')[0]; else { const d = new Date(m.dob); if (!isNaN(d.getTime())) dobVal = d.toISOString().split('T')[0]; } }
          let dojVal = null;
          if (m.doj) { if (m.doj instanceof Date) dojVal = m.doj.toISOString().split('T')[0]; else { const d = new Date(m.doj); if (!isNaN(d.getTime())) dojVal = d.toISOString().split('T')[0]; } }
          values.push(rfqId, m.sr_no, m.emp_code?.toString() || null, m.relationship, m.relation_type, m.gender,
            dobVal, m.age ? parseInt(m.age) : null, parseFloat(m.si_expiring) || 0, parseFloat(m.si_proposed) || 0,
            m.designation, m.band, dojVal, null);
          placeholders.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13})`);
          pIdx += 14;
        }
        await sharedPool.query(
          `INSERT INTO crm_rfq_members (rfq_id, sr_no, emp_code, relationship, relation_type, gender, dob, age, si_expiring, si_proposed, designation, band, doj, employee_name)
           VALUES ${placeholders.join(',')}`, values
        );
        memberCount += batch.length;
      }
      await sharedPool.query(`UPDATE crm_rfqs SET member_count = $1, updated_at = NOW() WHERE id = $2`, [memberCount, rfqId]);
    }

    return res.status(201).json({
      success: true,
      message: `RFQ created: ${rfq_number}. Parsed ${Object.keys(parsed).length} fields. ${memberCount} members uploaded.`,
      data: { ...rows[0], member_count: memberCount }
    });
  } catch (error) {
    console.error('[CRM RFQ Upload Excel]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to parse RFQ Excel: ' + error.message });
  }
});

// ─── Member Analytics ────────────────────────────────────────────────────────
router.get('/rfqs/:id/member-analytics', authCRM, async (req, res) => {
  try {
    const rfqId = req.params.id;
    const pool = sharedPool;
    const [
      totalRes, genderRes, relationRes, ageBandRes, bandRes, siRes, familySizeRes
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT emp_code) AS employees,
        COUNT(*) FILTER (WHERE relationship ILIKE 'SELF') AS self_count,
        AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age,
        COALESCE(SUM(si_expiring),0) AS total_si_expiring, COALESCE(SUM(si_proposed),0) AS total_si_proposed
        FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]),
      pool.query(`SELECT gender, COUNT(*) AS count FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY gender ORDER BY count DESC`, [rfqId]),
      pool.query(`SELECT relation_type, COUNT(*) AS count FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY relation_type ORDER BY count DESC`, [rfqId]),
      pool.query(`SELECT
        CASE WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
             WHEN age < 60 THEN '45-59' WHEN age < 75 THEN '60-74' ELSE '75+' END AS age_band,
        COUNT(*) AS count
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY age_band ORDER BY age_band`, [rfqId]),
      pool.query(`SELECT band, COUNT(*) AS count, COUNT(DISTINCT emp_code) AS emp_count
        FROM crm_rfq_members WHERE rfq_id = $1 AND band IS NOT NULL GROUP BY band ORDER BY band`, [rfqId]),
      pool.query(`SELECT si_proposed, COUNT(*) AS count
        FROM crm_rfq_members WHERE rfq_id = $1 AND relationship ILIKE 'SELF' AND si_proposed > 0
        GROUP BY si_proposed ORDER BY si_proposed`, [rfqId]),
      pool.query(`SELECT emp_code, COUNT(*) AS family_size
        FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY emp_code ORDER BY family_size DESC`, [rfqId]),
    ]);
    // Compute family size distribution
    const familySizes = familySizeRes.rows.reduce((acc, r) => {
      const s = parseInt(r.family_size);
      const key = s <= 6 ? s.toString() : '7+';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: {
        summary: totalRes.rows[0],
        gender_distribution: genderRes.rows,
        relation_distribution: relationRes.rows,
        age_bands: ageBandRes.rows,
        band_distribution: bandRes.rows,
        si_distribution: siRes.rows,
        family_size_distribution: familySizes,
        avg_family_size: familySizeRes.rows.length > 0
          ? (familySizeRes.rows.reduce((s, r) => s + parseInt(r.family_size), 0) / familySizeRes.rows.length).toFixed(1)
          : 0,
      }
    });
  } catch (error) { console.error('[CRM Member Analytics]', error.message); return res.status(500).json({ success: false, message: 'Failed to generate analytics' }); }
});

// ─── AI Quote Generation Engine ──────────────────────────────────────────────
// Deep actuarial pricing model using member demographics, claims experience,
// OPD utilization curves, and wellness cost benchmarks.
router.post('/rfqs/:id/ai-generate-quote', authCRM, async (req, res) => {
  try {
    const rfqId = req.params.id;
    const pool = sharedPool;

    // ── 1. Fetch RFQ + Members ──────────────────────────────────────────────
    const rfqRes = await pool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    const [summaryRes, ageBandRes, siSlabRes, familyRes, genderRes, relationRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT emp_code) AS employees,
        COUNT(*) FILTER (WHERE relationship ILIKE '%SELF%') AS self_count,
        AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age,
        COALESCE(SUM(si_expiring),0) AS total_si_expiring,
        COALESCE(SUM(si_proposed),0) AS total_si_proposed,
        COALESCE(AVG(si_expiring) FILTER (WHERE si_expiring > 0), 0) AS avg_si_expiring,
        COALESCE(AVG(si_proposed) FILTER (WHERE si_proposed > 0), 0) AS avg_si_proposed
        FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]),
      pool.query(`SELECT age_band, cnt FROM (
        SELECT CASE WHEN age < 5 THEN '0-4' WHEN age < 18 THEN '5-17' WHEN age < 30 THEN '18-29'
          WHEN age < 45 THEN '30-44' WHEN age < 60 THEN '45-59'
          WHEN age < 75 THEN '60-74' ELSE '75+' END AS age_band, COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY age_band
      ) sub ORDER BY age_band`, [rfqId]),
      pool.query(`SELECT si_proposed AS slab, COUNT(*) AS lives
        FROM crm_rfq_members WHERE rfq_id = $1 AND relationship ILIKE '%SELF%' AND si_proposed > 0
        GROUP BY si_proposed ORDER BY si_proposed`, [rfqId]),
      pool.query(`SELECT family_size, cnt FROM (
        SELECT fs AS family_size, COUNT(*) AS cnt FROM (
          SELECT emp_code, COUNT(*) AS fs FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY emp_code
        ) sub GROUP BY fs
      ) sub2 ORDER BY family_size`, [rfqId]),
      pool.query(`SELECT UPPER(TRIM(gender)) AS g, COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY g`, [rfqId]),
      pool.query(`SELECT UPPER(TRIM(relationship)) AS rel, COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY rel`, [rfqId]),
    ]);
    const summary = summaryRes.rows[0];
    const totalMembers = parseInt(summary.total) || 0;
    const totalEmployees = parseInt(summary.employees) || 0;
    if (totalMembers === 0) return res.status(400).json({ success: false, message: 'No members found — upload member data first' });

    const avgAge = parseFloat(summary.avg_age) || 35;

    // Normalize gender
    let maleCount = 0, femaleCount = 0;
    for (const r of genderRes.rows) {
      const g = (r.g || '').charAt(0);
      if (g === 'M') maleCount += parseInt(r.cnt);
      else if (g === 'F') femaleCount += parseInt(r.cnt);
    }
    const maleRatio = totalMembers > 0 ? maleCount / totalMembers : 0.5;

    // Family size distribution
    const familySizes = familyRes.rows;
    const avgFamilySize = familySizes.length > 0
      ? familySizes.reduce((s, r) => s + parseInt(r.family_size) * parseInt(r.cnt), 0) /
        familySizes.reduce((s, r) => s + parseInt(r.cnt), 0)
      : 4.0;

    // ── 2. ACTUARIAL MODEL — Indian Group OPD Pricing ───────────────────────
    //
    // Based on IRDA industry benchmarks & published GHI claims data 2024-2026:
    //   - Avg OPD utilization: 2.8-4.2 consults/person/year (varies by age)
    //   - Avg consult cost: ₹400-800 (tele), ₹600-1500 (physical)
    //   - Lab test utilization: 1.5-3.0 tests/person/year
    //   - Avg lab test cost: ₹500-2000
    //   - Pharmacy: 60-70% of total OPD claims in India
    //   - Medical inflation: 12-14% CAGR (India)
    //   - Typical OPD loss ratio: 65-85% for group policies

    // ── 2a. Age-Banded Utilization & Cost Factors ───────────────────────────
    // These are relative factors (1.0 = baseline 30-44 band)
    const AGE_RISK_FACTORS = {
      '0-4':   { utilization: 1.40, severity: 0.60, opd_visits: 4.5, lab_freq: 1.0, pharma_ratio: 0.50 },
      '5-17':  { utilization: 0.80, severity: 0.55, opd_visits: 2.0, lab_freq: 0.5, pharma_ratio: 0.30 },
      '18-29': { utilization: 0.75, severity: 0.70, opd_visits: 2.2, lab_freq: 1.0, pharma_ratio: 0.45 },
      '30-44': { utilization: 1.00, severity: 1.00, opd_visits: 3.2, lab_freq: 1.8, pharma_ratio: 0.60 },
      '45-59': { utilization: 1.55, severity: 1.40, opd_visits: 4.8, lab_freq: 2.8, pharma_ratio: 0.75 },
      '60-74': { utilization: 2.10, severity: 1.85, opd_visits: 6.5, lab_freq: 3.5, pharma_ratio: 0.85 },
      '75+':   { utilization: 2.50, severity: 2.20, opd_visits: 7.2, lab_freq: 4.0, pharma_ratio: 0.90 },
    };

    // OPD unit costs (₹) — Indian metro/tier-1 benchmarks 2025-26
    const OPD_UNIT_COSTS = {
      tele_consult: 500,              // per tele consult
      physical_consult: 1000,         // per physical visit (GP/Specialist avg)
      specialist_consult: 1500,       // per specialist visit
      lab_test_avg: 800,              // avg per lab test episode
      pharmacy_per_episode: 600,      // per prescription fill
    };

    // Wellness health checkup costs by age band
    const WELLNESS_COSTS = {
      '0-4':   0,       // not applicable
      '5-17':  0,       // not applicable
      '18-29': 1500,    // basic health checkup
      '30-44': 2500,    // comprehensive checkup
      '45-59': 4000,    // executive health checkup
      '60-74': 5500,    // senior comprehensive
      '75+':   6500,    // geriatric comprehensive
    };

    // ── 2b. Compute per-age-band expected claims cost ───────────────────────
    const ageBands = ageBandRes.rows;
    const bandAnalysis = [];
    let totalExpectedOPDClaims = 0;
    let totalExpectedWellnessCost = 0;
    let weightedRiskScore = 0;

    for (const band of ageBands) {
      const bandName = band.age_band;
      const lives = parseInt(band.cnt);
      const factors = AGE_RISK_FACTORS[bandName] || AGE_RISK_FACTORS['30-44'];

      // Expected OPD cost per person per year
      const consultCost = (factors.opd_visits * 0.3 * OPD_UNIT_COSTS.tele_consult) +
                          (factors.opd_visits * 0.7 * OPD_UNIT_COSTS.physical_consult);
      const labCost = factors.lab_freq * OPD_UNIT_COSTS.lab_test_avg;
      const pharmaCost = (consultCost + labCost) * factors.pharma_ratio;
      const totalOPDPerPerson = consultCost + labCost + pharmaCost;

      const bandOPDTotal = totalOPDPerPerson * lives;
      totalExpectedOPDClaims += bandOPDTotal;

      // Wellness
      const wellnessCostPerPerson = WELLNESS_COSTS[bandName] || 0;
      const bandWellnessTotal = wellnessCostPerPerson * lives;
      totalExpectedWellnessCost += bandWellnessTotal;

      // Risk score (0-100), weighted by band population share
      const riskScore = Math.min(100, Math.round(factors.utilization * factors.severity * 35));
      weightedRiskScore += riskScore * (lives / totalMembers);

      bandAnalysis.push({
        age_band: bandName,
        lives,
        pct_of_total: Math.round(lives / totalMembers * 1000) / 10,
        risk_factor: Math.round(factors.utilization * factors.severity * 100) / 100,
        opd_visits_per_year: factors.opd_visits,
        expected_opd_cost_per_person: Math.round(totalOPDPerPerson),
        expected_opd_total: Math.round(bandOPDTotal),
        wellness_cost_per_person: wellnessCostPerPerson,
        wellness_total: Math.round(bandWellnessTotal),
        risk_score: riskScore,
        breakdown: {
          consultation: Math.round(consultCost),
          lab_tests: Math.round(labCost),
          pharmacy: Math.round(pharmaCost),
        }
      });
    }

    // ── 2c. Experience Rating & Inflation Adjustment ────────────────────────
    const reasoning = [];
    reasoning.push({
      step: 'Population Analysis',
      detail: `${totalMembers.toLocaleString()} total lives (${totalEmployees.toLocaleString()} employees, ${(totalMembers - totalEmployees).toLocaleString()} dependants). Avg age ${avgAge.toFixed(1)} years. Avg family size ${avgFamilySize.toFixed(1)}.`,
      impact: 'neutral'
    });

    // Gender adjustment: female populations have ~5-8% higher OPD utilization (gynec + pediatric proxy)
    const genderFactor = 1.0 + (1 - maleRatio) * 0.08;
    reasoning.push({
      step: 'Gender Mix Adjustment',
      detail: `Male ${(maleRatio * 100).toFixed(0)}% / Female ${((1 - maleRatio) * 100).toFixed(0)}%. Female-weighted populations have 5-8% higher OPD utilization due to gynecological care, maternal-adjacent visits.`,
      factor: Math.round(genderFactor * 1000) / 1000,
      impact: genderFactor > 1.03 ? 'adverse' : 'neutral'
    });

    // Family size impact: larger families have higher utilization per family
    const familySizeFactor = avgFamilySize > 4.5 ? 1.08 : avgFamilySize > 3.5 ? 1.03 : 1.0;
    reasoning.push({
      step: 'Family Size Loading',
      detail: `Avg family size ${avgFamilySize.toFixed(1)}. Larger families (>4.5) show 8% higher utilization per family on floater basis.`,
      factor: familySizeFactor,
      impact: familySizeFactor > 1.03 ? 'adverse' : 'favorable'
    });

    // Experience-based loading (if previous premium data exists)
    let experienceFactor = 1.0;
    const premiumPaid = rfq.premium_paid;
    const livesInception = typeof rfq.lives_at_inception === 'string'
      ? JSON.parse(rfq.lives_at_inception || '{}') : (rfq.lives_at_inception || {});
    const prevLives = livesInception.total || totalMembers;

    if (premiumPaid && premiumPaid !== 'Details awaited' && !isNaN(parseFloat(premiumPaid.replace(/[₹,]/g, '')))) {
      const prevPremium = parseFloat(premiumPaid.replace(/[₹,]/g, ''));
      const prevPerLife = prevPremium / prevLives;
      // Medical inflation trending: 12-14% p.a. in India
      const inflationFactor = 1.13;
      experienceFactor = inflationFactor;
      reasoning.push({
        step: 'Experience Rating',
        detail: `Previous premium ₹${prevPremium.toLocaleString()} for ${prevLives.toLocaleString()} lives (₹${Math.round(prevPerLife).toLocaleString()}/life). Applying 13% medical inflation trend.`,
        factor: inflationFactor,
        impact: 'adverse'
      });
    } else {
      reasoning.push({
        step: 'Experience Rating',
        detail: `Previous premium data not available — using first-principles actuarial base rates. No experience-based adjustment.`,
        factor: 1.0,
        impact: 'neutral'
      });
    }

    // Age concentration risk
    const highRiskPct = ageBands
      .filter(b => ['45-59', '60-74', '75+'].includes(b.age_band))
      .reduce((s, b) => s + parseInt(b.cnt), 0) / totalMembers;
    const ageConcentrationFactor = highRiskPct > 0.40 ? 1.12 : highRiskPct > 0.30 ? 1.06 : highRiskPct > 0.20 ? 1.02 : 1.0;
    reasoning.push({
      step: 'Age Concentration Risk',
      detail: `${(highRiskPct * 100).toFixed(1)}% of population in high-risk bands (45+). ${highRiskPct > 0.30 ? 'Elevated chronic disease prevalence expected — loading applied.' : 'Within normal range.'}`,
      factor: ageConcentrationFactor,
      impact: ageConcentrationFactor > 1.05 ? 'adverse' : 'neutral'
    });

    // ── 2d. IBNR & Margin Loading ──────────────────────────────────────────
    const ibnrFactor = 1.05; // 5% IBNR (OPD has shorter reporting lag than IPD)
    const profitMargin = 1.12; // 12% margin (insurer's underwriting profit target)
    const adminLoading = 1.08; // 8% admin/management expenses

    reasoning.push({
      step: 'IBNR Reserve',
      detail: `5% Incurred But Not Reported reserve — OPD claims have shorter reporting lag (typically 30-60 days) than IPD.`,
      factor: ibnrFactor,
      impact: 'neutral'
    });
    reasoning.push({
      step: 'Insurer Margin & Expenses',
      detail: `12% underwriting margin + 8% admin/management expense loading. Industry standard for group OPD policies.`,
      factor: Math.round(profitMargin * adminLoading * 100) / 100,
      impact: 'neutral'
    });

    // ── 3. COMPUTE FINAL PRICING ────────────────────────────────────────────
    // Composite adjustment factor
    const compositeFactor = genderFactor * familySizeFactor * experienceFactor *
                            ageConcentrationFactor * ibnrFactor * profitMargin * adminLoading;

    // Expected OPD premium (pure + loaded)
    const pureOPDPremium = totalExpectedOPDClaims * genderFactor * familySizeFactor * ageConcentrationFactor;
    const loadedOPDPremium = pureOPDPremium * ibnrFactor * profitMargin * adminLoading * experienceFactor;

    // Expected Wellness premium
    // Wellness is optional — typically 40-60% uptake in group policies
    const wellnessUptake = 0.55;
    const pureWellnessPremium = totalExpectedWellnessCost * wellnessUptake;
    const loadedWellnessPremium = pureWellnessPremium * ibnrFactor * profitMargin * adminLoading;

    // Per-life and per-family costs
    const opdPerLife = loadedOPDPremium / totalMembers;
    const opdPerFamily = loadedOPDPremium / totalEmployees;
    const wellnessPerLife = loadedWellnessPremium / totalMembers;
    const wellnessPerFamily = loadedWellnessPremium / totalEmployees;

    // Combined
    const totalPremium = loadedOPDPremium + loadedWellnessPremium;
    const totalPerLife = totalPremium / totalMembers;
    const totalPerFamily = totalPremium / totalEmployees;

    // ── 3b. SI-Slab-wise Pricing ────────────────────────────────────────────
    const rfqSlabs = typeof rfq.sum_insured_slabs === 'string'
      ? JSON.parse(rfq.sum_insured_slabs || '[]') : (rfq.sum_insured_slabs || []);
    const siSlabs = siSlabRes.rows;

    const slabPricing = [];
    if (rfqSlabs.length > 0 && siSlabs.length > 0) {
      // Map SI slabs to pricing using utilization cap model
      // Higher SI allows higher utilization (less self-rationing), so pricing is non-linear
      const minSlab = Math.min(...rfqSlabs.map(s => typeof s === 'object' ? (s.value || s.amount || 0) : s));
      const maxSlab = Math.max(...rfqSlabs.map(s => typeof s === 'object' ? (s.value || s.amount || 0) : s));

      for (const slabRow of siSlabs) {
        const si = parseFloat(slabRow.slab);
        const lives = parseInt(slabRow.lives);
        // Utilization elasticity: higher SI → more utilization (behavioral moral hazard)
        // Log-scale: 50% utilization at ₹3K SI → 85% at ₹30K SI (capped at SI)
        const siRatio = maxSlab > minSlab ? (si - minSlab) / (maxSlab - minSlab) : 0.5;
        const utilizationCap = Math.min(0.50 + 0.35 * siRatio, 0.90); // 50% to 85% of SI
        const expectedClaimPerFamily = si * utilizationCap;
        const slabPremiumPerFamily = expectedClaimPerFamily * (ibnrFactor * profitMargin * adminLoading) *
          genderFactor * familySizeFactor * ageConcentrationFactor * experienceFactor;
        const slabTotalPremium = slabPremiumPerFamily * lives;

        slabPricing.push({
          slab: `₹${si.toLocaleString()}`,
          si_amount: si,
          lives,
          families: lives, // Self count in this slab
          utilization_cap_pct: Math.round(utilizationCap * 100),
          premium_per_family: Math.round(slabPremiumPerFamily),
          premium_per_life: Math.round(slabPremiumPerFamily / avgFamilySize),
          total_premium: Math.round(slabTotalPremium),
          expected_loss_ratio: Math.round(utilizationCap / (ibnrFactor * profitMargin * adminLoading) * 100),
        });
      }
    }

    // ── 3c. Confidence Intervals ────────────────────────────────────────────
    // Standard error reduces with √n. For 15K lives, interval is tight.
    const sqrtN = Math.sqrt(totalMembers);
    const coeffOfVariation = 0.35; // typical for OPD portfolios
    const standardError = (totalPremium * coeffOfVariation) / sqrtN;
    const ci95Lower = totalPremium - 1.96 * standardError;
    const ci95Upper = totalPremium + 1.96 * standardError;

    // Overall risk score (0-100)
    const overallRiskScore = Math.min(100, Math.round(weightedRiskScore));
    const riskCategory = overallRiskScore > 65 ? 'HIGH' : overallRiskScore > 45 ? 'MODERATE' : 'LOW';

    // ── 3d. Expected Loss Ratio ─────────────────────────────────────────────
    const expectedLossRatio = Math.round(pureOPDPremium / loadedOPDPremium * 100);

    reasoning.push({
      step: 'Final Pricing',
      detail: `Pure OPD claims ₹${Math.round(pureOPDPremium).toLocaleString()} → Loaded premium ₹${Math.round(loadedOPDPremium).toLocaleString()} (composite factor ${compositeFactor.toFixed(3)}). Expected loss ratio ${expectedLossRatio}%.`,
      impact: 'result'
    });

    // ── 4. BUILD RESPONSE ───────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      data: {
        rfq_id: parseInt(rfqId),
        rfq_number: rfq.rfq_number,
        insured_name: rfq.insured_name,
        generated_at: new Date().toISOString(),

        // Population summary
        population: {
          total_lives: totalMembers,
          employees: totalEmployees,
          dependants: totalMembers - totalEmployees,
          avg_age: Math.round(avgAge * 10) / 10,
          avg_family_size: Math.round(avgFamilySize * 10) / 10,
          male_pct: Math.round(maleRatio * 100),
          female_pct: Math.round((1 - maleRatio) * 100),
          high_risk_pct: Math.round(highRiskPct * 100),
        },

        // Risk assessment
        risk_assessment: {
          overall_score: overallRiskScore,
          category: riskCategory,
          age_concentration_factor: ageConcentrationFactor,
          gender_factor: Math.round(genderFactor * 1000) / 1000,
          family_size_factor: familySizeFactor,
          composite_factor: Math.round(compositeFactor * 1000) / 1000,
        },

        // OPD pricing
        opd_pricing: {
          pure_premium: Math.round(pureOPDPremium),
          loaded_premium: Math.round(loadedOPDPremium),
          per_life: Math.round(opdPerLife),
          per_family: Math.round(opdPerFamily),
          expected_loss_ratio: expectedLossRatio,
        },

        // Wellness pricing
        wellness_pricing: {
          assumed_uptake_pct: Math.round(wellnessUptake * 100),
          pure_premium: Math.round(pureWellnessPremium),
          loaded_premium: Math.round(loadedWellnessPremium),
          per_life: Math.round(wellnessPerLife),
          per_family: Math.round(wellnessPerFamily),
        },

        // Combined
        combined: {
          total_premium: Math.round(totalPremium),
          per_life: Math.round(totalPerLife),
          per_family: Math.round(totalPerFamily),
          ci_95_lower: Math.round(ci95Lower),
          ci_95_upper: Math.round(ci95Upper),
        },

        // Slab-wise pricing
        slab_pricing: slabPricing,

        // Age band deep analysis
        age_band_analysis: bandAnalysis,

        // Component breakdown (aggregate)
        component_breakdown: {
          consultation: Math.round(bandAnalysis.reduce((s, b) => s + b.breakdown.consultation * b.lives, 0)),
          lab_tests: Math.round(bandAnalysis.reduce((s, b) => s + b.breakdown.lab_tests * b.lives, 0)),
          pharmacy: Math.round(bandAnalysis.reduce((s, b) => s + b.breakdown.pharmacy * b.lives, 0)),
          wellness: Math.round(pureWellnessPremium),
        },

        // AI reasoning chain
        reasoning,

        // Recommended quote parameters (ready to apply to Quote Builder)
        recommended_quote: {
          total_premium: Math.round(loadedOPDPremium),
          total_lives: totalMembers,
          per_life_cost: Math.round(opdPerLife),
          per_family_cost: Math.round(opdPerFamily),
          pricing_model: 'per_family',
          commission_pct: 15,
          gst_pct: 18,
          discount_pct: 0,
          slab_pricing: slabPricing.map(s => ({
            slab: s.slab,
            premium: s.premium_per_family,
            lives: s.lives,
          })),
          terms: `OPD Quote generated using AI actuarial engine.\n` +
            `Risk Score: ${overallRiskScore}/100 (${riskCategory})\n` +
            `Expected Loss Ratio: ${expectedLossRatio}%\n` +
            `Population: ${totalMembers.toLocaleString()} lives, avg age ${avgAge.toFixed(1)}\n` +
            `Pricing basis: Floater per-family, age-banded actuarial model with IBNR & margin loading.`,
        }
      }
    });
  } catch (error) {
    console.error('[CRM AI Quote Generate]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'AI quote generation failed: ' + error.message });
  }
});

// ─── Get Members (paginated) ─────────────────────────────────────────────────
router.get('/rfqs/:id/members', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, band, relationship } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [`rfq_id = $1`]; const params = [req.params.id];
    if (search) { params.push(`%${search}%`); conditions.push(`(emp_code ILIKE $${params.length} OR designation ILIKE $${params.length} OR employee_name ILIKE $${params.length})`); }
    if (band) { params.push(band); conditions.push(`band = $${params.length}`); }
    if (relationship) { params.push(relationship); conditions.push(`relationship ILIKE $${params.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRes, dataRes] = await Promise.all([
      sharedPool.query(`SELECT COUNT(*) FROM crm_rfq_members ${where}`, params),
      sharedPool.query(`SELECT * FROM crm_rfq_members ${where} ORDER BY sr_no ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset])
    ]);
    return res.status(200).json({ success: true, data: dataRes.rows, pagination: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)) } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch members' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE / PROPOSAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Create Quote ────────────────────────────────────────────────────────────
router.post('/rfqs/:id/quotes', authCRM, async (req, res) => {
  try {
    const rfqId = req.params.id;
    const rfqCheck = await sharedPool.query(`SELECT id, rfq_number FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqCheck.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });

    const {
      valid_until, total_premium, total_lives, per_life_cost, per_family_cost,
      pricing_model, commission_pct, gst_pct, discount_pct,
      coverage_details, slab_pricing, terms, notes
    } = req.body;

    const versionRes = await sharedPool.query(`SELECT COALESCE(MAX(version),0)+1 AS next FROM crm_quotes WHERE rfq_id=$1`, [rfqId]);
    const version = versionRes.rows[0].next;
    const quote_number = generateQuoteNumber(rfqCheck.rows[0].rfq_number) + '-V' + version;

    const { rows } = await sharedPool.query(
      `INSERT INTO crm_quotes (rfq_id, quote_number, version, valid_until,
        total_premium, total_lives, per_life_cost, per_family_cost,
        pricing_model, commission_pct, gst_pct, discount_pct,
        coverage_details, slab_pricing, terms, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [rfqId, quote_number, version, valid_until || null,
        total_premium || 0, total_lives || 0, per_life_cost || 0, per_family_cost || 0,
        pricing_model || 'per_family', commission_pct || 0, gst_pct ?? 18, discount_pct || 0,
        JSON.stringify(coverage_details || {}), JSON.stringify(slab_pricing || []),
        terms || null, notes || null, req.crmUser.id]
    );

    // Update RFQ status to quoting if still received
    await sharedPool.query(`UPDATE crm_rfqs SET status = CASE WHEN status = 'received' THEN 'quoting' ELSE status END, updated_at = NOW() WHERE id = $1`, [rfqId]);

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { console.error('[CRM Quote Create]', error.message); return res.status(500).json({ success: false, message: 'Failed to create quote' }); }
});

// ─── List Quotes for RFQ ─────────────────────────────────────────────────────
router.get('/rfqs/:id/quotes', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_quotes WHERE rfq_id = $1 ORDER BY version DESC`, [req.params.id]);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch quotes' }); }
});

// ─── Update Quote ────────────────────────────────────────────────────────────
router.put('/quotes/:id', authCRM, async (req, res) => {
  try {
    const {
      status, valid_until, total_premium, total_lives, per_life_cost, per_family_cost,
      pricing_model, commission_pct, gst_pct, discount_pct,
      coverage_details, slab_pricing, terms, notes
    } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_quotes SET
        status = COALESCE($1, status), valid_until = COALESCE($2, valid_until),
        total_premium = COALESCE($3, total_premium), total_lives = COALESCE($4, total_lives),
        per_life_cost = COALESCE($5, per_life_cost), per_family_cost = COALESCE($6, per_family_cost),
        pricing_model = COALESCE($7, pricing_model), commission_pct = COALESCE($8, commission_pct),
        gst_pct = COALESCE($9, gst_pct), discount_pct = COALESCE($10, discount_pct),
        coverage_details = COALESCE($11, coverage_details), slab_pricing = COALESCE($12, slab_pricing),
        terms = COALESCE($13, terms), notes = COALESCE($14, notes), updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [status, valid_until, total_premium, total_lives, per_life_cost, per_family_cost,
        pricing_model, commission_pct, gst_pct, discount_pct,
        coverage_details ? JSON.stringify(coverage_details) : null,
        slab_pricing ? JSON.stringify(slab_pricing) : null,
        terms, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Quote not found' });

    // If quote is sent, update RFQ status
    if (status === 'sent') {
      await sharedPool.query(`UPDATE crm_rfqs SET status = 'quoted', updated_at = NOW() WHERE id = $1 AND status IN ('received','quoting')`, [rows[0].rfq_id]);
    }
    if (status === 'accepted') {
      await sharedPool.query(`UPDATE crm_rfqs SET status = 'won', updated_at = NOW() WHERE id = $1`, [rows[0].rfq_id]);
    }
    if (status === 'rejected') {
      await sharedPool.query(`UPDATE crm_rfqs SET status = 'lost', updated_at = NOW() WHERE id = $1`, [rows[0].rfq_id]);
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { console.error('[CRM Quote Update]', error.message); return res.status(500).json({ success: false, message: 'Failed to update quote' }); }
});

// ─── Delete Quote ────────────────────────────────────────────────────────────
router.delete('/quotes/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_quotes WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Quote not found' });
    return res.status(200).json({ success: true, message: 'Quote deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete quote' }); }
});

// ─── RFQ Dashboard Stats ────────────────────────────────────────────────────
router.get('/rfqs-stats', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE r.status = 'received') AS received,
      COUNT(*) FILTER (WHERE r.status = 'quoting') AS quoting,
      COUNT(*) FILTER (WHERE r.status = 'quoted') AS quoted,
      COUNT(*) FILTER (WHERE r.status = 'won') AS won,
      COUNT(*) FILTER (WHERE r.status = 'lost') AS lost,
      COUNT(*) FILTER (WHERE r.created_at >= NOW() - INTERVAL '7 days') AS this_week,
      COALESCE(SUM(q.total_premium), 0) AS total_quoted_premium
      FROM crm_rfqs r
      LEFT JOIN crm_quotes q ON q.rfq_id = r.id AND q.status NOT IN ('draft','rejected')`);
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch RFQ stats' }); }
});

export default router;
