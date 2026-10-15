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
import { handleLeadStatusChange } from '../services/crm-lead-automation.service.js';
import { syncLegacyLeadToV2, removeLegacyLeadFromV2, resolveV2LeadByLegacyId, CRM_V2_DEFAULT_TENANT_ID } from '../services/crm-v2-sync.service.js';
import { listCrmCommunicationLog, listCrmCallActivity } from '../services/hospital-crm-communication-hub.service.js';
import { DEFAULT_CRM_ROLE } from '../config/crm-roles.config.js';

const router = express.Router();

// ─── Token constants ─────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_SCOPE = 'crm';
const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_MAX_ATTEMPTS = 10;

// ─── Schema readiness ─────────────────────────────────────────────────────────
// CRM tables are deployment-owned. Requests fail closed until the registered
// migration has run; this route never creates or alters tables at import time.
const CRM_SCHEMA_TABLES = ['api_v2_refresh_tokens', 'crm_refresh_tokens', 'crm_login_attempts', 'crm_leads', 'crm_deals', 'crm_activities', 'crm_contacts', 'crm_rfqs', 'crm_rfq_members', 'crm_quotes', 'crm_rfq_claims', 'crm_rfq_files', 'crm_rfq_audit_log', 'crm_product_tc_master', 'crm_agencies', 'crm_agents', 'crm_commissions', 'crm_corporate_health_plans'];
let crmSchemaPromise = null;

async function ensureCrmSchema() {
  if (!crmSchemaPromise) {
    crmSchemaPromise = sharedPool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [CRM_SCHEMA_TABLES]
    ).then(({ rows }) => {
      const present = new Set(rows.map((row) => row.table_name));
      const missingTables = CRM_SCHEMA_TABLES.filter((table) => !present.has(table));
      if (missingTables.length) {
        const error = new Error('CRM schema migration has not been applied');
        error.status = 503;
        error.code = 'SCHEMA_NOT_MIGRATED';
        error.details = { missingTables };
        throw error;
      }
    }).catch((error) => {
      crmSchemaPromise = null;
      throw error;
    });
  }
  return crmSchemaPromise;
}

router.use(async (req, res, next) => {
  try {
    await ensureCrmSchema();
    next();
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 503;
    res.status(status).json({
      success: false,
      code: error.code || 'SCHEMA_UNAVAILABLE',
      message: error.message || 'CRM schema is unavailable',
      details: error.details,
    });
  }
});

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
    `INSERT INTO api_v2_refresh_tokens (jti, user_id, role, token_hash, expires_at, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [jti, payload.id, REFRESH_SCOPE, tokenHash, expiresAt, ip]
  );

  return { accessToken, refreshToken, jti };
}

async function revokeRefreshToken(jti) {
  await sharedPool.query(
    `UPDATE api_v2_refresh_tokens
        SET revoked = TRUE, revoked_at = NOW()
      WHERE jti = $1 AND role = $2`,
    [jti, REFRESH_SCOPE]
  );
}

async function revokeAllUserTokens(userId) {
  await sharedPool.query(
    `UPDATE api_v2_refresh_tokens
        SET revoked = TRUE, revoked_at = NOW()
      WHERE user_id = $1 AND role = $2 AND revoked = FALSE`,
    [userId, REFRESH_SCOPE]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Must be a valid email'),
  // Never validate password SHAPE at login — only that one was sent. The password is checked
  // against a bcrypt hash, so a length rule here adds no security and silently locks out any
  // account whose correct password is shorter than the rule. That is not hypothetical: a 7-char
  // team password could never sign in, and the account was re-keyed to fit this validator rather
  // than the validator being fixed. Shape belongs on the routes that SET a password.
  // (`deptLoginValidation` in unified-hospital-staff.routes.js already does this correctly.)
  body('password').notEmpty().withMessage('Password is required'),
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
    try { metadata = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch (_) { metadata = {}; }

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

    const crmRole = metadata.crmRole || DEFAULT_CRM_ROLE;

    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'crm',
      userType: 'crm',
      isCRM: true,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.tenant_id || user.organizationId || user.organization_id || null,
      crmPermissions: metadata.crmPermissions || ['leads', 'deals', 'contacts', 'activities', 'reports'],
      crmRole
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
      crmRole,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.tenant_id || user.organizationId || user.organization_id || null,
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
      `SELECT * FROM api_v2_refresh_tokens WHERE jti = $1 AND role = $2`,
      [decoded.jti, REFRESH_SCOPE]
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
    try { metadata = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch (_) { metadata = {}; }

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role || 'crm',
      userType: 'crm',
      isCRM: true,
      isAdmin: user.isAdmin || false,
      tenantId: metadata.tenantId || user.tenant_id || user.organizationId || user.organization_id || null,
      crmPermissions: metadata.crmPermissions || ['leads', 'deals', 'contacts', 'activities', 'reports'],
      crmRole: metadata.crmRole || DEFAULT_CRM_ROLE
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
  const user = req.crmUser;
  return res.status(200).json({
    success: true,
    crmUser: {
      id: user.id,
      email: user.email,
      firstName: user.firstName || 'CRM',
      lastName: user.lastName || 'User',
      role: user.role || 'crm',
      crmRole: user.crmRole,
      isAdmin: user.isAdmin || false,
      designation: user.designation || 'Sales Representative',
      department: user.department || 'Sales',
      permissions: user.permissions || [],
      tenantId: user.tenantId || null,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/dashboard/stats', authCRM, async (req, res) => {
  try {
    const pool = sharedPool;
    // Leads carry real, multi-tenant data → scope by the caller's tenant (via the v2 twin). Deals,
    // activities and legacy contacts have no tenant column and are currently empty; they stay
    // un-scoped until a schema migration adds tenant_uid to them (see follow-up notes).
    const leadStatParams = [];
    const leadStatScope = scopeLeadToTenant('id', req.crmUser.tenantUid, leadStatParams);
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
      FROM crm_leads WHERE ${leadStatScope}`, leadStatParams),
      pool.query(`SELECT
        COUNT(*) AS total,
        COALESCE(SUM(value), 0) AS total_value,
        COALESCE(SUM(value) FILTER (WHERE stage = 'won'), 0) AS won_value,
        COUNT(*) FILTER (WHERE stage = 'won')           AS won_count,
        COUNT(*) FILTER (WHERE stage = 'lost')          AS lost_count,
        COUNT(*) FILTER (WHERE stage NOT IN ('won','lost')) AS active_count,
        COALESCE(AVG(probability) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS avg_probability,
        COALESCE(SUM(value * probability / 100.0) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS weighted_pipeline
      FROM crm_deals WHERE tenant_uid = $1`, [req.crmUser.tenantUid || null]),
      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
        COUNT(*) FILTER (WHERE completed_at IS NULL AND scheduled_at < NOW()) AS overdue,
        COUNT(*) FILTER (WHERE completed_at IS NULL AND scheduled_at >= NOW()) AS upcoming,
        COUNT(*) FILTER (WHERE type = 'call')  AS calls,
        COUNT(*) FILTER (WHERE type = 'email') AS emails,
        COUNT(*) FILTER (WHERE type = 'meeting') AS meetings
      FROM crm_activities WHERE tenant_uid = $1`, [req.crmUser.tenantUid || null]),
      pool.query(`SELECT COUNT(*) AS total FROM crm_contacts WHERE tenant_uid = $1`, [req.crmUser.tenantUid || null])
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

// Legacy crm_leads has NO tenant column; its v2 twin crm_leads_v2 carries the unambiguous tenant_uid
// (1:1 via legacy_lead_id). Scope legacy-lead queries to the caller's tenant THROUGH the twin.
// Fail-closed: a null/absent tenantUid matches nothing — we never fall back to showing all tenants.
function scopeLeadToTenant(idCol, tenantUid, params) {
  params.push(tenantUid || null);
  return `${idCol} IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_uid = $${params.length} AND legacy_lead_id IS NOT NULL)`;
}

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
    conditions.push(scopeLeadToTenant('id', req.crmUser.tenantUid, params)); // tenant isolation (always applied)
    const where = `WHERE ${conditions.join(' AND ')}`;
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
    // Associate the new lead's v2 twin with the CREATOR's tenant (not the hardcoded default), so it
    // belongs to — and is visible to — only that tenant. Works for tenants-table tenants
    // (hospital/clinic/broker); corporate-tenant uid derivation is a known follow-up (see notes).
    syncLegacyLeadToV2(rows[0].id, req.crmUser.tenantId || undefined).catch(() => {});
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to create lead' }); }
});

router.get('/leads/:id', authCRM, async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = scopeLeadToTenant('id', req.crmUser.tenantUid, params);
    const { rows } = await sharedPool.query(`SELECT * FROM crm_leads WHERE id = $1 AND ${scope}`, params);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    const activities = await sharedPool.query(`SELECT * FROM crm_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    return res.status(200).json({ success: true, data: { ...rows[0], activities: activities.rows } });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch lead' }); }
});

// The 360° view: everything this session's CRM Growth Engine work knows about
// one lead, in one call — v2 identity, segment membership, automation
// execution history, and communication log. Legacy lead id in, legacy lead
// id space throughout (matches every other CRM endpoint's contract).
router.get('/leads/:id/context', authCRM, async (req, res) => {
  try {
    const legacyLeadId = parseInt(req.params.id, 10);
    const v2 = await resolveV2LeadByLegacyId(legacyLeadId);

    let segments = [];
    let automationExecutions = [];
    let communications = [];
    let calls = [];

    if (v2) {
      const [segRes, autoRes] = await Promise.all([
        sharedPool.query(
          `SELECT s.id, s.name FROM crm_segment_members sm JOIN crm_segments s ON s.id = sm.segment_id
           WHERE sm.tenant_id = $1 AND sm.lead_id = $2 ORDER BY s.name`,
          [v2.tenant_id, v2.id]
        ),
        sharedPool.query(
          `SELECT e.id, e.status, e.scheduled_at, e.completed_at, e.error, a.id AS automation_id, a.name AS automation_name, a.action_type
           FROM crm_automation_executions e JOIN crm_automations a ON a.id = e.automation_id
           WHERE e.tenant_id = $1 AND e.lead_id = $2 ORDER BY e.created_at DESC LIMIT 20`,
          [v2.tenant_id, v2.id]
        ),
      ]);
      segments = segRes.rows;
      automationExecutions = autoRes.rows;
      communications = await listCrmCommunicationLog({ leadId: legacyLeadId, limit: 20 }).catch(() => []);
    }
    calls = await listCrmCallActivity({ leadId: legacyLeadId, limit: 20 }).catch(() => []);

    return res.status(200).json({
      success: true,
      data: {
        v2: v2 ? { leadId: v2.id, contactId: v2.contact_id, identityId: v2.identity_id, tenantId: v2.tenant_id, name: v2.name, email: v2.email, phone: v2.phone } : null,
        segments, automationExecutions, communications, calls,
      },
    });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch lead context' }); }
});

router.put('/leads/:id', authCRM, async (req, res) => {
  try {
    const { name, email, phone, company, designation, source, status, priority, notes, tags, assigned_to, next_followup } = req.body;

    const prevParams = [req.params.id];
    const prevScope = scopeLeadToTenant('id', req.crmUser.tenantUid, prevParams);
    const prevRes = await sharedPool.query(`SELECT status FROM crm_leads WHERE id = $1 AND ${prevScope}`, prevParams);
    if (!prevRes.rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    const previousStatus = prevRes.rows[0].status;

    const upParams = [name, email, phone, company, designation, source, status, priority, notes, tags?JSON.stringify(tags):null, assigned_to, next_followup, req.params.id];
    const upScope = scopeLeadToTenant('id', req.crmUser.tenantUid, upParams); // tenant guard on the write
    const { rows } = await sharedPool.query(
      `UPDATE crm_leads SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone),
       company=COALESCE($4,company), designation=COALESCE($5,designation), source=COALESCE($6,source),
       status=COALESCE($7,status), priority=COALESCE($8,priority), notes=COALESCE($9,notes), tags=COALESCE($10,tags),
       assigned_to=COALESCE($11,assigned_to), next_followup=COALESCE($12,next_followup),
       converted_at=CASE WHEN $7='converted' AND converted_at IS NULL THEN NOW() ELSE converted_at END,
       updated_at=NOW() WHERE id=$13 AND ${upScope} RETURNING *`,
      upParams
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });

    const newStatus = rows[0].status;
    if (status && newStatus !== previousStatus) {
      handleLeadStatusChange(rows[0].id, previousStatus, newStatus).catch(() => {});
    }
    // Keep the twin on the lead's own tenant (the updater is the same tenant, enforced by the scope
    // guard above) — never let a re-sync move the lead to the hardcoded default tenant.
    syncLegacyLeadToV2(rows[0].id, req.crmUser.tenantId || undefined).catch(() => {});

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update lead' }); }
});

router.delete('/leads/:id', authCRM, async (req, res) => {
  try {
    const delParams = [req.params.id];
    const delScope = scopeLeadToTenant('id', req.crmUser.tenantUid, delParams);
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_leads WHERE id = $1 AND ${delScope}`, delParams);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Lead not found' });
    removeLegacyLeadFromV2(req.params.id).catch(() => {});
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
    params.push(req.crmUser.tenantUid || null); conditions.push(`tenant_uid = $${params.length}`); // tenant isolation (fail-closed)
    const where = `WHERE ${conditions.join(' AND ')}`;
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
      `INSERT INTO crm_deals (title,lead_id,value,currency,stage,probability,expected_close,contact_name,contact_email,contact_phone,company,notes,tags,assigned_to,created_by,tenant_uid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [title, lead_id||null, value||0, currency||'INR', stage||'qualification', probability||10, expected_close||null, contact_name||null, contact_email||null, contact_phone||null, company||null, notes||null, JSON.stringify(tags||[]), req.crmUser.id, req.crmUser.id, req.crmUser.tenantUid || null]
    );
    if (lead_id) { await sharedPool.query(`UPDATE crm_leads SET deal_id=$1, updated_at=NOW() WHERE id=$2 AND id IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_uid = $3 AND legacy_lead_id IS NOT NULL)`, [rows[0].id, lead_id, req.crmUser.tenantUid || null]); }
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
       updated_at=NOW() WHERE id=$15 AND tenant_uid=$16 RETURNING *`,
      [title, value, currency, stage, probability, expected_close, contact_name, contact_email, contact_phone, company, notes, tags?JSON.stringify(tags):null, assigned_to, lost_reason, req.params.id, req.crmUser.tenantUid || null]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Deal not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update deal' }); }
});

router.delete('/deals/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_deals WHERE id = $1 AND tenant_uid = $2`, [req.params.id, req.crmUser.tenantUid || null]);
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
    params.push(req.crmUser.tenantUid || null); conditions.push(`tenant_uid = $${params.length}`); // tenant isolation (fail-closed)
    const where = `WHERE ${conditions.join(' AND ')}`;
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
      `INSERT INTO crm_activities (type,title,description,lead_id,deal_id,scheduled_at,created_by,tenant_uid) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [type, title, description||null, lead_id||null, deal_id||null, scheduled_at||null, req.crmUser.id, req.crmUser.tenantUid || null]
    );
    if (lead_id) { await sharedPool.query(`UPDATE crm_leads SET last_contacted=NOW(), updated_at=NOW() WHERE id=$1 AND id IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_uid = $2 AND legacy_lead_id IS NOT NULL)`, [lead_id, req.crmUser.tenantUid || null]); }
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to create activity' }); }
});

router.put('/activities/:id/complete', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`UPDATE crm_activities SET completed_at=NOW(), outcome=$1 WHERE id=$2 AND tenant_uid=$3 RETURNING *`, [req.body.outcome||'completed', req.params.id, req.crmUser.tenantUid || null]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Activity not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to complete activity' }); }
});

router.delete('/activities/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_activities WHERE id = $1 AND tenant_uid = $2`, [req.params.id, req.crmUser.tenantUid || null]);
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
    params.push(req.crmUser.tenantUid || null); conditions.push(`tenant_uid = $${params.length}`); // tenant isolation (fail-closed)
    const where = `WHERE ${conditions.join(' AND ')}`;
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
      `INSERT INTO crm_contacts (name,email,phone,company,designation,address,city,state,tags,notes,lead_id,created_by,tenant_uid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, email||null, phone||null, company||null, designation||null, address||null, city||null, state||null, JSON.stringify(tags||[]), notes||null, lead_id||null, req.crmUser.id, req.crmUser.tenantUid || null]
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
       updated_at=NOW() WHERE id=$11 AND tenant_uid=$12 RETURNING *`,
      [name, email, phone, company, designation, address, city, state, tags?JSON.stringify(tags):null, notes, req.params.id, req.crmUser.tenantUid || null]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Contact not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update contact' }); }
});

router.delete('/contacts/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_contacts WHERE id = $1 AND tenant_uid = $2`, [req.params.id, req.crmUser.tenantUid || null]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Contact not found' });
    return res.status(200).json({ success: true, message: 'Contact deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete contact' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SALES REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/reports/sales-funnel', authCRM, async (req, res) => {
  try {
    // Tenant-scope the lead counts via the v2 twin ($1 reused). Deal counts are empty (no tenant
    // column yet) — left as-is until deals get tenancy.
    const ls = `AND id IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_uid = $1 AND legacy_lead_id IS NOT NULL)`;
    const { rows } = await sharedPool.query(`
      SELECT unnest(ARRAY['new','contacted','qualified','proposal','negotiation','converted','lost']) AS stage,
      unnest(ARRAY[
        (SELECT COUNT(*) FROM crm_leads WHERE status='new' ${ls}),
        (SELECT COUNT(*) FROM crm_leads WHERE status='contacted' ${ls}),
        (SELECT COUNT(*) FROM crm_leads WHERE status='qualified' ${ls}),
        (SELECT COUNT(*) FROM crm_deals WHERE stage IN ('proposal')),
        (SELECT COUNT(*) FROM crm_deals WHERE stage IN ('negotiation','contract')),
        (SELECT COUNT(*) FROM crm_deals WHERE stage='won'),
        (SELECT COUNT(*) FROM crm_deals WHERE stage='lost')+(SELECT COUNT(*) FROM crm_leads WHERE status='lost' ${ls})
      ]) AS count`, [req.crmUser.tenantUid || null]);
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
      FROM users u
      LEFT JOIN crm_leads l ON l.assigned_to=u.id AND l.id IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_uid = $1 AND legacy_lead_id IS NOT NULL)
      LEFT JOIN crm_deals d ON d.assigned_to=u.id
      LEFT JOIN crm_activities a ON a.created_by=u.id
      WHERE u.role IN ('team','admin') OR u."isTeam"=true OR u."isAdmin"=true
      GROUP BY u.id, u."firstName", u."lastName", u.email
      HAVING COUNT(DISTINCT l.id)+COUNT(DISTINCT d.id)+COUNT(DISTINCT a.id)>0
      ORDER BY revenue DESC`, [req.crmUser.tenantUid || null]);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to generate team report' }); }
});

// ─── Funnel Analytics ──────────────────────────────────────────────────────
router.get('/funnel-analytics', authCRM, async (req, res) => {
  try {
    const [rfqFunnel, leadFunnel, dealFunnel, velocity] = await Promise.all([
      sharedPool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='received')    AS s1_received,
          COUNT(*) FILTER (WHERE status='quoting')     AS s2_quoting,
          COUNT(*) FILTER (WHERE status='quoted')      AS s3_quoted,
          COUNT(*) FILTER (WHERE status='negotiating') AS s4_negotiating,
          COUNT(*) FILTER (WHERE status='won')         AS s5_won,
          COUNT(*) FILTER (WHERE status='lost')        AS s6_lost,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_30d,
          COUNT(*) FILTER (WHERE status='won' AND updated_at >= NOW() - INTERVAL '30 days') AS won_30d,
          COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) FILTER (WHERE status IN ('won','lost')), 0)::NUMERIC(8,1) AS avg_cycle_days
        FROM crm_rfqs
      `),
      sharedPool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='new')       AS new_leads,
          COUNT(*) FILTER (WHERE status='contacted') AS contacted,
          COUNT(*) FILTER (WHERE status='qualified') AS qualified,
          COUNT(*) FILTER (WHERE status='converted') AS converted,
          COUNT(*) FILTER (WHERE status='lost')      AS lost,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_30d
        FROM crm_leads
        WHERE id IN (SELECT legacy_lead_id FROM crm_leads_v2 WHERE tenant_uid = $1 AND legacy_lead_id IS NOT NULL)
      `, [req.crmUser.tenantUid || null]),
      sharedPool.query(`
        SELECT
          COUNT(*) FILTER (WHERE stage='qualification') AS qualification,
          COUNT(*) FILTER (WHERE stage='discovery')     AS discovery,
          COUNT(*) FILTER (WHERE stage='proposal')      AS proposal,
          COUNT(*) FILTER (WHERE stage='negotiation')   AS negotiation,
          COUNT(*) FILTER (WHERE stage='contract')      AS contract,
          COUNT(*) FILTER (WHERE stage='won' OR won_at IS NOT NULL) AS won,
          COALESCE(SUM(value) FILTER (WHERE (stage='won' OR won_at IS NOT NULL) AND won_at >= NOW() - INTERVAL '30 days'), 0) AS won_value_30d
        FROM crm_deals
      `),
      sharedPool.query(`
        SELECT
          COALESCE(AVG(EXTRACT(EPOCH FROM (won_at - created_at))/86400) FILTER (WHERE won_at IS NOT NULL), 0)::NUMERIC(8,1) AS avg_deal_days,
          COUNT(*) FILTER (WHERE won_at >= NOW() - INTERVAL '7 days')  AS deals_won_7d,
          COUNT(*) FILTER (WHERE won_at >= NOW() - INTERVAL '30 days') AS deals_won_30d,
          COALESCE(SUM(value) FILTER (WHERE won_at >= NOW() - INTERVAL '30 days'), 0) AS revenue_30d
        FROM crm_deals
      `),
    ]);

    const r = rfqFunnel.rows[0];
    const l = leadFunnel.rows[0];
    const d = dealFunnel.rows[0];
    const v = velocity.rows[0];

    // Conversion rates between consecutive funnel stages
    const rfqConversions = {
      receivedToQuoting:    r.s1_received > 0 ? Math.round((r.s2_quoting    / r.s1_received) * 100) : 0,
      quotingToQuoted:      r.s2_quoting  > 0 ? Math.round((r.s3_quoted     / r.s2_quoting)  * 100) : 0,
      quotedToNegotiating:  r.s3_quoted   > 0 ? Math.round((r.s4_negotiating/ r.s3_quoted)   * 100) : 0,
      negotiatingToWon:     r.s4_negotiating > 0 ? Math.round((r.s5_won / r.s4_negotiating)  * 100) : 0,
      overallWinRate:       r.total > 0 ? Math.round((r.s5_won / r.total) * 100) : 0,
    };

    return res.json({
      success: true,
      data: {
        rfq: { ...r, conversions: rfqConversions },
        leads: l,
        deals: d,
        velocity: v,
      }
    });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

export default router;
