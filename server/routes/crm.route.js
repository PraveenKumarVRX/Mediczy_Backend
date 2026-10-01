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

// ─── Ensure required tables exist ────────────────────────────────────────────
;(async () => {
  try {
    const pool = sharedPool;
    await pool.query(`
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

      ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_leads_score ON crm_leads(score);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_leadgen_id
        ON crm_leads ((custom_fields->>'leadgen_id'))
        WHERE custom_fields->>'leadgen_id' IS NOT NULL AND custom_fields->>'leadgen_id' != '';

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
        premium_paid      NUMERIC(15,2),
        lives_at_inception JSONB DEFAULT '{}'::jsonb,
        lives_at_renewal   JSONB DEFAULT '{}'::jsonb,
        coverage_scope    JSONB DEFAULT '{}'::jsonb,
        special_conditions JSONB DEFAULT '[]'::jsonb,
        exclusions        TEXT,
        terms_and_conditions TEXT,
        notes             TEXT,
        existing_coverages TEXT,
        required_coverages TEXT,
        member_count      INTEGER DEFAULT 0,
        sum_insured_slabs JSONB DEFAULT '[]'::jsonb,
        deal_id           BIGINT,
        lead_id           BIGINT,
        assigned_to       INTEGER,
        created_by        INTEGER NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        slip_file_key     TEXT,
        lost_reason       TEXT,
        industry          VARCHAR(100),
        ai_quote_data     JSONB
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
        sent_at         TIMESTAMPTZ,
        notes           TEXT,
        created_by      INTEGER NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_rfq ON crm_quotes(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_status ON crm_quotes(status);

      CREATE TABLE IF NOT EXISTS crm_rfq_claims (
        id              BIGSERIAL PRIMARY KEY,
        rfq_id          BIGINT NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
        claim_number    VARCHAR(200),
        emp_code        VARCHAR(50),
        employee_name   VARCHAR(255),
        relationship    VARCHAR(50),
        gender          VARCHAR(10),
        age             INTEGER,
        claim_date      DATE,
        service_type    VARCHAR(100),
        service_category VARCHAR(100),
        diagnosis       VARCHAR(500),
        provider_name   VARCHAR(255),
        provider_type   VARCHAR(100),
        claimed_amount  NUMERIC(12,2) DEFAULT 0,
        approved_amount NUMERIC(12,2) DEFAULT 0,
        paid_amount     NUMERIC(12,2) DEFAULT 0,
        icd_code        VARCHAR(20),
        rejection_reason VARCHAR(255),
        claim_status    VARCHAR(100),
        policy_year     VARCHAR(50),
        si_amount       NUMERIC(12,2) DEFAULT 0,
        band            VARCHAR(100),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rfq_claims_rfq ON crm_rfq_claims(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_claims_emp ON crm_rfq_claims(emp_code);
      CREATE INDEX IF NOT EXISTS idx_rfq_claims_svc ON crm_rfq_claims(service_type);
      CREATE INDEX IF NOT EXISTS idx_rfq_claims_date ON crm_rfq_claims(claim_date);

      CREATE TABLE IF NOT EXISTS crm_rfq_files (
        id            BIGSERIAL PRIMARY KEY,
        rfq_id        BIGINT NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
        category      VARCHAR(30) NOT NULL DEFAULT 'other',
        original_name VARCHAR(500) NOT NULL,
        s3_key        TEXT NOT NULL,
        file_size     BIGINT DEFAULT 0,
        mime_type     VARCHAR(100),
        uploaded_by   INTEGER,
        uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rfq_files_rfq ON crm_rfq_files(rfq_id);

      CREATE TABLE IF NOT EXISTS crm_rfq_audit_log (
        id          BIGSERIAL    PRIMARY KEY,
        rfq_id      BIGINT       NOT NULL,
        event_type  VARCHAR(50)  NOT NULL,
        old_value   TEXT,
        new_value   TEXT,
        changed_by  INTEGER,
        note        TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rfq_audit_rfq ON crm_rfq_audit_log(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_audit_ts  ON crm_rfq_audit_log(created_at);
    `);

    // ─── Product T&C Master ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_product_tc_master (
        id            BIGSERIAL    PRIMARY KEY,
        product_type  VARCHAR(50)  NOT NULL,
        section       VARCHAR(100) NOT NULL DEFAULT 'general',
        title         VARCHAR(255) NOT NULL,
        content       TEXT         NOT NULL,
        source_rfq_id BIGINT       REFERENCES crm_rfqs(id) ON DELETE SET NULL,
        is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
        is_pending    BOOLEAN      NOT NULL DEFAULT FALSE,
        sort_order    INTEGER      NOT NULL DEFAULT 0,
        created_by    INTEGER,
        updated_by    INTEGER,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tc_master_product  ON crm_product_tc_master(product_type);
      CREATE INDEX IF NOT EXISTS idx_tc_master_active   ON crm_product_tc_master(is_active);
      CREATE INDEX IF NOT EXISTS idx_tc_master_pending  ON crm_product_tc_master(is_pending);
    `);

    // ─── Distribution tables ───────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_agencies (
        id                  BIGSERIAL    PRIMARY KEY,
        name                VARCHAR(255) NOT NULL,
        owner_name          VARCHAR(255),
        email               VARCHAR(255),
        phone               VARCHAR(50),
        city                VARCHAR(100),
        territory           VARCHAR(255),
        gstin               VARCHAR(50),
        onboarding_step     INTEGER      NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 5),
        status              VARCHAR(20)  NOT NULL DEFAULT 'onboarding',
        monthly_activations INTEGER      NOT NULL DEFAULT 0,
        agent_count         INTEGER      NOT NULL DEFAULT 0,
        total_override      NUMERIC(15,2) NOT NULL DEFAULT 0,
        notes               TEXT,
        created_by          INTEGER      NOT NULL,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_agencies_status ON crm_agencies(status);
      CREATE INDEX IF NOT EXISTS idx_crm_agencies_city   ON crm_agencies(city);

      CREATE TABLE IF NOT EXISTS crm_agents (
        id                  BIGSERIAL    PRIMARY KEY,
        name                VARCHAR(255) NOT NULL,
        email               VARCHAR(255),
        phone               VARCHAR(50),
        city                VARCHAR(100),
        channel_type        VARCHAR(50)  NOT NULL DEFAULT 'IFA',
        agent_code          VARCHAR(50)  UNIQUE,
        agency_id           BIGINT       REFERENCES crm_agencies(id) ON DELETE SET NULL,
        status              VARCHAR(20)  NOT NULL DEFAULT 'active',
        notes               TEXT,
        total_activations   INTEGER      NOT NULL DEFAULT 0,
        total_earned        NUMERIC(15,2) NOT NULL DEFAULT 0,
        pending_payout      NUMERIC(15,2) NOT NULL DEFAULT 0,
        created_by          INTEGER      NOT NULL,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_agents_channel ON crm_agents(channel_type);
      CREATE INDEX IF NOT EXISTS idx_crm_agents_city    ON crm_agents(city);
      CREATE INDEX IF NOT EXISTS idx_crm_agents_status  ON crm_agents(status);
      CREATE INDEX IF NOT EXISTS idx_crm_agents_agency  ON crm_agents(agency_id);

      CREATE TABLE IF NOT EXISTS crm_commissions (
        id                  BIGSERIAL    PRIMARY KEY,
        agent_id            BIGINT       REFERENCES crm_agents(id) ON DELETE SET NULL,
        agent_code          VARCHAR(50),
        agent_name          VARCHAR(255),
        subscriber_name     VARCHAR(255),
        subscriber_phone    VARCHAR(50),
        subscriber_email    VARCHAR(255),
        plan_code           VARCHAR(50),
        amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
        commission_type     VARCHAR(20)  NOT NULL DEFAULT 'y1',
        activation_date     DATE,
        eligible_date       DATE,
        status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
        paid_at             TIMESTAMPTZ,
        clawback_reason     TEXT,
        notes               TEXT,
        created_by          INTEGER      NOT NULL,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_commissions_agent   ON crm_commissions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_crm_commissions_status  ON crm_commissions(status);
      CREATE INDEX IF NOT EXISTS idx_crm_commissions_plan    ON crm_commissions(plan_code);
      CREATE INDEX IF NOT EXISTS idx_crm_commissions_eligible ON crm_commissions(eligible_date);

      CREATE TABLE IF NOT EXISTS crm_corporate_health_plans (
        id                      BIGSERIAL    PRIMARY KEY,
        corporate_id            INTEGER,
        corporate_name          VARCHAR(255) NOT NULL,
        plan_template_code      VARCHAR(50)  NOT NULL,
        display_name            VARCHAR(255) NOT NULL,
        plan_year               INTEGER      NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
        plan_grade              VARCHAR(100),
        contract_ref            VARCHAR(50)  UNIQUE,
        negotiated_price_per_emp NUMERIC(10,2),
        employee_headcount      INTEGER      NOT NULL DEFAULT 0,
        corporate_share         NUMERIC(5,2) NOT NULL DEFAULT 100.00,
        employee_share          NUMERIC(5,2) NOT NULL DEFAULT 0.00,
        start_date              DATE,
        end_date                DATE,
        status                  VARCHAR(20)  NOT NULL DEFAULT 'draft',
        renewal_of_id           BIGINT       REFERENCES crm_corporate_health_plans(id) ON DELETE SET NULL,
        notes                   TEXT,
        contract_doc_url        VARCHAR(500),
        created_by              INTEGER      NOT NULL,
        created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_corp_plans_corporate ON crm_corporate_health_plans(corporate_id);
      CREATE INDEX IF NOT EXISTS idx_corp_plans_status    ON crm_corporate_health_plans(status);
      CREATE INDEX IF NOT EXISTS idx_corp_plans_year      ON crm_corporate_health_plans(plan_year);
      CREATE INDEX IF NOT EXISTS idx_corp_plans_renewal   ON crm_corporate_health_plans(renewal_of_id);

      ALTER TABLE crm_corporate_health_plans ADD COLUMN IF NOT EXISTS rfq_id BIGINT REFERENCES crm_rfqs(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_corp_plans_rfq ON crm_corporate_health_plans(rfq_id);
    `);
    console.log('[CRM] DB tables initialized (incl. RFQ + Claims + Distribution + Corporate Plans)');
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
    syncLegacyLeadToV2(rows[0].id).catch(() => {});
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

    const prevRes = await sharedPool.query(`SELECT status FROM crm_leads WHERE id = $1`, [req.params.id]);
    if (!prevRes.rows.length) return res.status(404).json({ success: false, message: 'Lead not found' });
    const previousStatus = prevRes.rows[0].status;

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

    const newStatus = rows[0].status;
    if (status && newStatus !== previousStatus) {
      handleLeadStatusChange(rows[0].id, previousStatus, newStatus).catch(() => {});
    }
    syncLegacyLeadToV2(rows[0].id).catch(() => {});

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to update lead' }); }
});

router.delete('/leads/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_leads WHERE id = $1`, [req.params.id]);
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
      FROM users u
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
      `),
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
