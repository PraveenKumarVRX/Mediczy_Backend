import express from 'express';
import { body, validationResult } from 'express-validator';
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import XLSX from '../utils/excel-compat.js';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import userModel from '../models/user.model.intelligent.js';
import { authCRM } from '../middleware/crm.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';
import sharedPool from '../db/pgPool.js';
import { getS3Client, getUploadsBucket } from '../services/s3-presign.service.js';
import nodemailer from 'nodemailer';

// ─── CRM Email Helper ─────────────────────────────────────────────────────────
// Loads SMTP config from email_configs table (default/active row) and sends.
// Silently swallows errors — never blocks the main request.
async function sendCRMEmail({ to, cc, subject, html, text }) {
  if (!to) return;
  try {
    // Prefer email_configs table default; fall back to env vars
    let smtpOpts = {
      host:   process.env.SMTP_HOST || 'smtppro.zoho.in',
      port:   parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS },
    };
    let fromLabel = process.env.EMAIL_FROM_NAME || 'Mediqzy';
    let fromAddr  = process.env.SMTP_USER || 'noreply@mediqzy.com';
    try {
      const { rows } = await sharedPool.query(
        `SELECT host, port, username, password, "fromEmail", "fromName" FROM email_configs
          WHERE "isActive" = true ORDER BY "isDefault" DESC, id ASC LIMIT 1`
      );
      if (rows.length && rows[0].username) {
        smtpOpts = {
          host:   rows[0].host,
          port:   rows[0].port,
          secure: rows[0].port === 465,
          auth:   { user: rows[0].username, pass: rows[0].password },
        };
        fromLabel = rows[0].fromName  || fromLabel;
        fromAddr  = rows[0].fromEmail || rows[0].username;
      }
    } catch (_) { /* use env fallback */ }

    if (!smtpOpts.auth.user) return; // no SMTP configured at all
    const transporter = nodemailer.createTransport(smtpOpts);
    await transporter.sendMail({
      from:    `"${fromLabel}" <${fromAddr}>`,
      to, cc, subject,
      html:    html || `<pre>${text || ''}</pre>`,
      text:    text || '',
    });
  } catch (e) {
    console.warn('[CRM Email] send failed:', e.message);
  }
}

// Helper: upload a file buffer to S3 and return the key (silently ignores errors)
async function uploadSlipToS3(buffer, originalName, rfqId) {
  try {
    const bucket = getUploadsBucket();
    if (!bucket) return null;
    const ext = originalName.split('.').pop().toLowerCase();
    const key = `rfqs/slips/${rfqId}_${Date.now()}.${ext}`;
    await getS3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: ext === 'pdf' ? 'application/pdf' : ext === 'xlsx' || ext === 'xls' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream' }));
    return key;
  } catch { return null; }
}

// Helper: fetch a file buffer from S3 by key
async function fetchSlipFromS3(key) {
  const bucket = getUploadsBucket();
  if (!bucket || !key) return null;
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch { return null; }
}

// Helper: upload any RFQ file to S3 and record in crm_rfq_files
async function uploadRfqFile(buffer, originalName, rfqId, category, uploadedById) {
  try {
    const bucket = getUploadsBucket();
    if (!bucket) return null;
    const ext = (originalName.split('.').pop() || 'bin').toLowerCase();
    const mimeMap = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `rfqs/${rfqId}/${category}/${Date.now()}_${safeName}`;
    await getS3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
    await sharedPool.query(
      `INSERT INTO crm_rfq_files (rfq_id, category, original_name, s3_key, file_size, mime_type, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rfqId, category, originalName, key, buffer.length, mimeType, uploadedById]
    );
    return key;
  } catch (e) { console.warn('[uploadRfqFile]', e.message); return null; }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

// Canonical product types: GMC, GPA, GTL, OPD, GMC+OPD, GMC+GPA, GMC+GTL, Parents, TopUp, CI, MIXED
const CANONICAL_PRODUCT_TYPES = ['GMC', 'GPA', 'GTL', 'OPD', 'GMC+OPD', 'GMC+GPA', 'GMC+GTL', 'Parents', 'TopUp', 'CI', 'MIXED'];
const PRODUCT_TYPE_LABELS = {
  GMC:       'Group Mediclaim (GMC / GHI)',
  GPA:       'Group Personal Accident (GPA)',
  GTL:       'Group Term Life Insurance (GTL)',
  OPD:       'Group OPD / Outpatient Benefits',
  'GMC+OPD': 'GMC + OPD Combo',
  'GMC+GPA': 'GMC + GPA Combo',
  'GMC+GTL': 'GMC + GTL Combo',
  Parents:   'Parents Policy / Parents Floater',
  TopUp:     'Super Top-up / Top-up Mediclaim',
  CI:        'Critical Illness (CI)',
  MIXED:     'Multiple Products (Mixed)',
};

function normalizeProductType(raw) {
  if (!raw) return 'GMC';
  const s = raw.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9+]/g, '');

  // Detect combination products first
  const hasGMC  = s.includes('GMC') || s.includes('MEDICLAIM') || s.includes('GHI') || s.includes('HOSPITALI') || s.includes('HEALTHINSUR');
  const hasGPA  = s.includes('GPA') || (s.includes('ACCIDENT') && !s.includes('MEDICLAIM'));
  const hasGTL  = s.includes('GTL') || s.includes('GTLI') || s.includes('TERMLIFE') || (s.includes('LIFE') && s.includes('GROUP'));
  const hasOPD  = s.includes('OPD') || s.includes('OUTPATIENT');
  const comboCount = [hasGMC, hasGPA, hasGTL, hasOPD].filter(Boolean).length;
  if (comboCount >= 3) return 'MIXED';
  if (hasGMC && hasGPA && !hasOPD && !hasGTL) return 'GMC+GPA';
  if (hasGMC && hasGTL && !hasOPD && !hasGPA) return 'GMC+GTL';
  if ((hasGMC || hasGPA) && hasOPD) return 'GMC+OPD';

  // Parents Policy
  if (s.includes('PARENT') || s.includes('FLOATER') || s.includes('FAMILYFLOATER')) return 'Parents';

  // Super Top-up
  if (s.includes('TOPUP') || s.includes('SUPERTOP') || s.includes('SUPERHEALTHTOP') || s.includes('TOPUPMEDICLAIM')) return 'TopUp';

  // Critical Illness
  if (s.includes('CRITICALILLNESS') || s.includes('CRITICALCARE') || (s.includes('CI') && s.length <= 4)) return 'CI';

  // Single products
  if (hasOPD) return 'OPD';
  if (hasGPA) return 'GPA';
  if (hasGTL) return 'GTL';
  if (hasGMC) return 'GMC';

  return 'GMC'; // default for unrecognised
}

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

// ─── RFQ Stats by Product Type ───────────────────────────────────────────────
router.get('/rfqs/stats/by-product', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`
      SELECT
        product_type,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'received')    AS received,
        COUNT(*) FILTER (WHERE status = 'quoting')     AS quoting,
        COUNT(*) FILTER (WHERE status = 'quoted')      AS quoted,
        COUNT(*) FILTER (WHERE status = 'negotiating') AS negotiating,
        COUNT(*) FILTER (WHERE status = 'won')         AS won,
        COUNT(*) FILTER (WHERE status = 'lost')        AS lost
      FROM crm_rfqs
      GROUP BY product_type
      ORDER BY total DESC
    `);
    const stats = {};
    for (const r of rows) {
      stats[r.product_type] = {
        label:       PRODUCT_TYPE_LABELS[r.product_type] || r.product_type,
        total:       parseInt(r.total),
        received:    parseInt(r.received),
        quoting:     parseInt(r.quoting),
        quoted:      parseInt(r.quoted),
        negotiating: parseInt(r.negotiating),
        won:         parseInt(r.won),
        lost:        parseInt(r.lost),
      };
    }
    return res.json({ success: true, data: stats, productTypes: CANONICAL_PRODUCT_TYPES, labels: PRODUCT_TYPE_LABELS });
  } catch (error) { console.error('[CRM RFQ Stats]', error.message); return res.status(500).json({ success: false, message: 'Failed to fetch product stats' }); }
});

// ─── List RFQs ───────────────────────────────────────────────────────────────
router.get('/rfqs', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 25, status, product_type, search, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (status && status !== 'all') { params.push(status); conditions.push(`status = $${params.length}`); }
    if (product_type && product_type !== 'all') { params.push(product_type); conditions.push(`product_type = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(insured_name ILIKE $${params.length} OR rfq_number ILIKE $${params.length} OR broker_company ILIKE $${params.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSorts = ['created_at', 'updated_at', 'insured_name', 'status', 'rfq_number', 'member_count'];
    const sort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const [countRes, dataRes] = await Promise.all([
      sharedPool.query(`SELECT COUNT(*) FROM crm_rfqs ${where}`, params),
      sharedPool.query(`SELECT r.*,
        (SELECT COUNT(*) FROM crm_quotes q WHERE q.rfq_id = r.id) AS quote_count,
        (SELECT total_premium FROM crm_quotes WHERE rfq_id = r.id AND status NOT IN ('draft','rejected') ORDER BY version DESC LIMIT 1) AS latest_quote_premium,
        (SELECT status FROM crm_quotes WHERE rfq_id = r.id ORDER BY version DESC LIMIT 1) AS latest_quote_status,
        (SELECT total_lives FROM crm_quotes WHERE rfq_id = r.id AND status NOT IN ('draft','rejected') ORDER BY version DESC LIMIT 1) AS latest_quote_lives
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
      terms_and_conditions, notes, existing_coverages, required_coverages, sum_insured_slabs
    } = req.body;
    const rfq_number = generateRFQNumber();
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_rfqs (rfq_number, insured_name, insured_address, policy_type, product_type,
        broker_name, broker_company, broker_email, broker_phone,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
        lives_at_inception, lives_at_renewal, coverage_scope, special_conditions, exclusions,
        terms_and_conditions, notes, existing_coverages, required_coverages, sum_insured_slabs, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
      [rfq_number, insured_name, insured_address || null, policy_type || 'Group Mediclaim', product_type || 'OPD',
        broker_name || null, broker_company || null, broker_email || null, broker_phone || null,
        existing_insurer || null, existing_tpa || null, policy_start || null, policy_end || null, premium_paid || null,
        JSON.stringify(lives_at_inception || {}), JSON.stringify(lives_at_renewal || {}),
        JSON.stringify(coverage_scope || {}), JSON.stringify(special_conditions || []), exclusions || null,
        terms_and_conditions || null, notes || null, existing_coverages || null, required_coverages || null,
        JSON.stringify(sum_insured_slabs || []),
        req.crmUser.id, req.crmUser.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) { console.error('[CRM RFQ Create]', error.message); return res.status(500).json({ success: false, message: 'Failed to create RFQ' }); }
});

// ─── Numeric ID guard for /rfqs/:id routes ──────────────────────────────────
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(400).json({ success: false, message: 'Invalid ID: must be numeric' });
  next();
});

// ─── Get RFQ Detail ──────────────────────────────────────────────────────────
router.get('/rfqs/:id', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const [quotes, files] = await Promise.all([
      sharedPool.query(`SELECT * FROM crm_quotes WHERE rfq_id = $1 ORDER BY created_at DESC`, [req.params.id]),
      sharedPool.query(`SELECT id, category, original_name, file_size, mime_type, uploaded_at FROM crm_rfq_files WHERE rfq_id = $1 ORDER BY uploaded_at DESC`, [req.params.id]),
    ]);
    // Ensure every file has a non-null category
    const safeFiles = files.rows.map(f => ({ ...f, category: f.category || 'other' }));
    return res.status(200).json({ success: true, data: { ...rows[0], quotes: quotes.rows, files: safeFiles } });
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
      exclusions, terms_and_conditions, notes, existing_coverages, required_coverages,
      sum_insured_slabs, assigned_to, deal_id, lead_id, lost_reason
    } = req.body;

    // Validate status if provided
    const VALID_RFQ_STATUSES = ['received', 'quoting', 'quoted', 'negotiating', 'won', 'lost'];
    if (status && !VALID_RFQ_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${status}. Allowed: ${VALID_RFQ_STATUSES.join(', ')}` });
    }

    // Transition guard: moving to 'won' requires at least one sent/accepted quote
    if (status === 'won') {
      const quoteCheck = await sharedPool.query(
        `SELECT COUNT(*) FROM crm_quotes WHERE rfq_id = $1 AND status IN ('sent','accepted')`,
        [req.params.id]
      );
      if (parseInt(quoteCheck.rows[0].count) === 0) {
        return res.status(400).json({ success: false, message: 'Cannot mark as Won — at least one quote must be sent or accepted first.' });
      }
    }

    // Validate deal_id exists if provided
    if (deal_id) {
      const dealCheck = await sharedPool.query(`SELECT id FROM crm_deals WHERE id = $1`, [deal_id]);
      if (!dealCheck.rows.length) return res.status(400).json({ success: false, message: `Deal ${deal_id} not found` });
    }

    // Capture old status before UPDATE so audit log comparison is accurate
    let oldStatus = null;
    if (status) {
      const prev = await sharedPool.query(`SELECT status FROM crm_rfqs WHERE id = $1`, [req.params.id]);
      oldStatus = prev.rows[0]?.status ?? null;
    }

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
        notes = COALESCE($21, notes),
        existing_coverages = COALESCE($22, existing_coverages), required_coverages = COALESCE($23, required_coverages),
        sum_insured_slabs = COALESCE($24, sum_insured_slabs),
        assigned_to = COALESCE($25, assigned_to), deal_id = COALESCE($26, deal_id), lead_id = COALESCE($27, lead_id),
        lost_reason = CASE WHEN $5 = 'lost' THEN COALESCE($28, lost_reason) ELSE lost_reason END,
        updated_at = NOW()
       WHERE id = $29 RETURNING *`,
      [insured_name, insured_address, policy_type, product_type, status,
        broker_name, broker_company, broker_email, broker_phone,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid ? parseFloat(String(premium_paid).replace(/[^0-9.]/g, '')) || null : null,
        lives_at_inception ? JSON.stringify(lives_at_inception) : null,
        lives_at_renewal ? JSON.stringify(lives_at_renewal) : null,
        coverage_scope ? JSON.stringify(coverage_scope) : null,
        special_conditions ? JSON.stringify(special_conditions) : null,
        exclusions, terms_and_conditions, notes,
        existing_coverages || null, required_coverages || null,
        sum_insured_slabs ? JSON.stringify(sum_insured_slabs) : null,
        assigned_to, deal_id, lead_id, lost_reason || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });

    // Audit log for status change
    if (status && oldStatus && oldStatus !== status) {
      sharedPool.query(
        `INSERT INTO crm_rfq_audit_log (rfq_id, event_type, old_value, new_value, changed_by) VALUES ($1,'status_change',$2,$3,$4)`,
        [rows[0].id, oldStatus, status, req.crmUser?.id || null]
      ).catch(() => {});
    }

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

// ─── List RFQ Files ──────────────────────────────────────────────────────────
router.get('/rfqs/:id/files', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, category, original_name, file_size, mime_type, uploaded_by, uploaded_at FROM crm_rfq_files WHERE rfq_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.id]
    );
    // Ensure every file has a non-null category
    const safeRows = rows.map(f => ({ ...f, category: f.category || 'other' }));
    return res.status(200).json({ success: true, data: safeRows });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch files' }); }
});

// ─── Download RFQ File ───────────────────────────────────────────────────────
router.get('/rfqs/:id/files/:fileId/download', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT * FROM crm_rfq_files WHERE id = $1 AND rfq_id = $2`,
      [req.params.fileId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'File not found' });
    const file = rows[0];
    const buffer = await fetchSlipFromS3(file.s3_key);
    if (!buffer) return res.status(404).json({ success: false, message: 'File not available in storage' });
    res.set('Content-Type', file.mime_type || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    res.set('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error) { return res.status(500).json({ success: false, message: 'Download failed' }); }
});

// ─── AI Data Cleaning & Standardization Engine ──────────────────────────────
// Normalizes messy Excel data into clean, consistent values for actuarial accuracy
const stdGender = (v) => {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  if (['M', 'MALE', 'BOY', 'MR', 'MR.'].includes(s)) return 'M';
  if (['F', 'FEMALE', 'GIRL', 'MS', 'MS.', 'MRS', 'MRS.', 'MISS'].includes(s)) return 'F';
  if (s.startsWith('M')) return 'M';
  if (s.startsWith('F')) return 'F';
  return null;
};
const stdRelationship = (v) => {
  if (!v) return null;
  const raw = String(v).trim();
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const map = {
    SELF: 'SELF', EMPLOYEE: 'SELF', EMP: 'SELF', PRIMARY: 'SELF', PROPOSER: 'SELF',
    SPOUSE: 'SPOUSE', WIFE: 'SPOUSE', HUSBAND: 'SPOUSE', PARTNER: 'SPOUSE',
    SON: 'CHILD', DAUGHTER: 'CHILD', CHILD: 'CHILD', CHILD1: 'CHILD', CHILD2: 'CHILD', CHILD3: 'CHILD', CHILD4: 'CHILD', KID: 'CHILD',
    FATHER: 'PARENT', MOTHER: 'PARENT', PARENT: 'PARENT', PARENTS: 'PARENT', DAD: 'PARENT', MOM: 'PARENT',
    FATHERINLAW: 'PARENT-IN-LAW', MOTHERINLAW: 'PARENT-IN-LAW',
    PARENTSINLAW: 'PARENT-IN-LAW', PARENTINLAW: 'PARENT-IN-LAW',
    BROTHERINLAW: 'SIBLING-IN-LAW', SISTERINLAW: 'SIBLING-IN-LAW',
    BROTHER: 'SIBLING', SISTER: 'SIBLING', SIBLING: 'SIBLING',
    DEPENDENT: 'DEPENDENT', DEPENDANT: 'DEPENDENT',
  };
  return map[s] || raw;
};
const stdClaimStatus = (v) => {
  if (!v) return null;
  const s = String(v).trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (['APPROVED', 'SETTLED', 'PAID', 'ACCEPTED', 'PROCESSED', 'DISBURSED'].includes(s)) return 'Approved';
  if (['REJECTED', 'DENIED', 'DECLINED', 'REPUDIATED', 'CLOSEDREJECTED'].includes(s)) return 'Rejected';
  if (['PENDING', 'INPROCESS', 'UNDERPROCESS', 'INTIMATED', 'OPEN', 'REGISTERED', 'SUBMITTED'].includes(s)) return 'Pending';
  if (['PARTIALAPPROVED', 'PARTIALLYSETTLED', 'PARTIALPAID', 'PARTIAL'].includes(s)) return 'Partial';
  if (['CANCELLED', 'WITHDRAWN', 'CLOSEDCANCELLED'].includes(s)) return 'Cancelled';
  return String(v).trim();
};
const stdServiceType = (v) => {
  if (!v) return null;
  const s = String(v).trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (['IPD', 'INPATIENT', 'HOSPITALIZATION', 'HOSPITALISATION', 'SURGICAL', 'DAYCARE'].includes(s)) return 'IPD';
  if (['OPD', 'OUTPATIENT', 'OPDCONSULTATION', 'OPDVISIT', 'WALKIN'].includes(s)) return 'OPD';
  if (['PHARMACY', 'MEDICINE', 'MEDICINES', 'DRUGS', 'PHARMA', 'CHEMIST'].includes(s)) return 'Pharmacy';
  if (['LAB', 'LABTEST', 'DIAGNOSTIC', 'DIAGNOSTICS', 'PATHOLOGY', 'RADIOLOGY', 'LABDIAGNOSTIC', 'INVESTIGATION'].includes(s)) return 'Lab/Diagnostic';
  if (['CONSULTATION', 'DOCTORCONSULTATION', 'TELECONSULTATION', 'TELE', 'CONSULT'].includes(s)) return 'Consultation';
  if (['WELLNESS', 'HEALTHCHECK', 'HEALTHCHECKUP', 'PREVENTIVE', 'SCREENING', 'AHC'].includes(s)) return 'Wellness';
  if (['MATERNITY', 'DELIVERY', 'CSECTION', 'NORMALDELIVERY', 'PREGNANCY'].includes(s)) return 'Maternity';
  if (['DENTAL', 'DENTISTRY'].includes(s)) return 'Dental';
  if (['VISION', 'OPTICAL', 'EYE', 'OPHTHALMOLOGY'].includes(s)) return 'Vision';
  return String(v).trim();
};
const stdEmpCode = (v) => {
  if (!v) return null;
  return String(v).trim().toUpperCase();
};
const stdParseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  // Excel serial number (e.g. 45000 = ~2023-03-14)
  if (typeof v === 'number' && v > 25000 && v < 60000) {
    const d = new Date((v - 25569) * 86400000);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  // yyyy-mm-dd or yyyy/mm/dd
  const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const d = new Date(`${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  // Fallback to JS Date parse
  const d = new Date(s);
  return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
};
const stdParseAmount = (v) => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[₹,\s]/g, '')) || 0;
};
const stdComputeAge = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age > 0 && age < 150 ? age : null;
};
// Cleaning stats tracker
const newCleaningStats = () => ({ gender: 0, relationship: 0, age_computed: 0, date_fixed: 0, amount_fixed: 0, emp_code: 0, claim_status: 0, service_type: 0 });

// ─── Upload Member Excel ─────────────────────────────────────────────────────
router.post('/rfqs/:id/upload-members', authCRM, upload.single('file'), async (req, res) => {
  try {
    const rfqId = req.params.id;
    const rfqCheck = await sharedPool.query(`SELECT id FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqCheck.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });

    if (!req.file) return res.status(400).json({ success: false, message: 'Excel file required' });

    const workbook = await XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
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

    // Deduplicate rows within the upload by (emp_code, relationship) — keep last occurrence
    const dedupeKey = (row) => {
      const keys = Object.keys(row);
      const find = (patterns) => { for (const p of patterns) { const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p)); if (k) return String(row[k] || '').trim(); } return ''; };
      return `${find(['empcode','employeecode','empid','employeeid'])}|${find(['relationship','relation'])}`;
    };
    const dedupeMap = new Map();
    for (const row of rows) dedupeMap.set(dedupeKey(row), row);
    const dedupedRows = [...dedupeMap.values()];
    const duplicatesRemoved = rows.length - dedupedRows.length;

    // Build all member rows first, then replace atomically in a transaction
    let inserted = 0;
    const stats = newCleaningStats();
    const batchSize = 500;
    const allBatches = [];
    for (let i = 0; i < dedupedRows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = []; const placeholders = [];
      let pIdx = 1;
      for (const raw of batch) {
        const m = colMap(raw);
        // ── AI Data Standardization ──
        const cleanGender = stdGender(m.gender);
        if (m.gender && cleanGender !== m.gender) stats.gender++;
        const cleanRel = stdRelationship(m.relationship);
        if (m.relationship && cleanRel !== m.relationship) stats.relationship++;
        const cleanEmp = stdEmpCode(m.emp_code);
        if (m.emp_code && cleanEmp !== m.emp_code?.toString()) stats.emp_code++;
        const dobVal = stdParseDate(m.dob);
        if (m.dob && dobVal) stats.date_fixed++;
        const dojVal = stdParseDate(m.doj);
        if (m.doj && dojVal) stats.date_fixed++;
        let ageVal = m.age ? parseInt(m.age) : null;
        if (!ageVal && dobVal) { ageVal = stdComputeAge(dobVal); if (ageVal) stats.age_computed++; }
        const siExp = stdParseAmount(m.si_expiring);
        const siProp = stdParseAmount(m.si_proposed);
        const empName = cleanRel === 'SELF' ? (raw['Name'] || raw['Employee Name'] || null) : null;
        values.push(rfqId, m.sr_no, cleanEmp, cleanRel, m.relation_type, cleanGender,
          dobVal, ageVal, siExp, siProp,
          m.designation, m.band, dojVal, empName);
        placeholders.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13})`);
        pIdx += 14;
        inserted++;
      }
      allBatches.push({ values, placeholders });
    }

    // Atomic replace: DELETE then INSERT in a single transaction
    const txClient = await sharedPool.connect();
    try {
      await txClient.query('BEGIN');
      await txClient.query(`DELETE FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]);
      for (const { values, placeholders } of allBatches) {
        await txClient.query(
          `INSERT INTO crm_rfq_members (rfq_id, sr_no, emp_code, relationship, relation_type, gender, dob, age, si_expiring, si_proposed, designation, band, doj, employee_name)
           VALUES ${placeholders.join(',')}`, values
        );
      }
      await txClient.query(`UPDATE crm_rfqs SET member_count = $1, updated_at = NOW() WHERE id = $2`, [inserted, rfqId]);
      await txClient.query('COMMIT');
    } catch (txErr) {
      await txClient.query('ROLLBACK');
      txClient.release();
      throw txErr;
    }
    txClient.release();
    await uploadRfqFile(req.file.buffer, req.file.originalname, rfqId, 'members', req.crmUser.id);

    console.log(`RFQ ${rfqId}: ${inserted} members (${duplicatesRemoved} dupes removed), cleaned: ${JSON.stringify(stats)}`);
    return res.status(200).json({
      success: true,
      message: `Uploaded ${inserted} members from sheet "${memberSheetName}" — AI cleaned & standardized${duplicatesRemoved > 0 ? ` (${duplicatesRemoved} duplicate rows removed)` : ''}`,
      data: { memberCount: inserted, duplicatesRemoved, sheetName: memberSheetName, cleaning: stats }
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

    const workbook = await XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });

    // Classify each sheet: member sheet = >150 rows; everything else = RFQ/benefits data
    let memberSheet = null, memberSheetName = '';
    const rfqSheets = []; // all non-member sheets

    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rowCount = range.e.r - range.s.r + 1;
      if (rowCount > 150 && !memberSheet) {
        memberSheet = ws; memberSheetName = name;
      } else {
        rfqSheets.push({ name, ws });
      }
    }
    // Fallback: if no RFQ sheets detected, use first sheet
    if (rfqSheets.length === 0 && workbook.SheetNames.length > 0) {
      rfqSheets.push({ name: workbook.SheetNames[0], ws: workbook.Sheets[workbook.SheetNames[0]] });
    }

    // ── Dump ALL RFQ/benefits sheets into a single text blob for LLM ──
    const dumpSheet = (ws, sheetName) => {
      if (!ws) return '';
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      let text = `\n=== Sheet: ${sheetName} ===\n`;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const rowParts = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell?.v !== undefined && cell.v !== null && cell.v !== '') {
            const v = cell.v instanceof Date ? cell.v.toISOString().split('T')[0] : cell.w || cell.v?.toString();
            if (v?.toString().trim()) rowParts.push(v.toString().trim());
          }
        }
        if (rowParts.length) text += rowParts.join(' | ') + '\n';
      }
      return text;
    };

    let sheetText = '';
    for (const { name, ws } of rfqSheets) {
      sheetText += dumpSheet(ws, name);
      if (sheetText.length > 7000) break; // cap to avoid token overflow
    }
    const rfqSheetName = rfqSheets[0]?.name || '';

    // ── Use LLM to extract structured data regardless of layout ──
    const llmMod = await import('../services/ai-brain/llm-provider.js');
    const callLLM = llmMod.default?.chat || llmMod.chat;
    const EXTRACTION_PROMPT = `You are an expert insurance broking slip parser. The following is raw cell data (row by row, cells separated by " | ") extracted from a broker Excel file. Extract all available fields and return ONLY valid JSON with this exact structure (use null for missing fields):
{
  "insured_name": "string",
  "insured_address": "string or null",
  "existing_insurer": "string or null",
  "existing_tpa": "string or null",
  "policy_start": "YYYY-MM-DD or null",
  "policy_end": "YYYY-MM-DD or null",
  "premium_paid": "string or null",
  "policy_type": "Group Mediclaim",
  "product_type": "one of: GMC (Group Mediclaim/GHI), GPA (Group Personal Accident), GTL (Group Term Life/GTLI), OPD (Outpatient Benefits), GMC+OPD, GMC+GPA, GMC+GTL, Parents (Parents Policy/Floater), TopUp (Super Top-up), CI (Critical Illness), MIXED",
  "member_count": number_or_null,
  "lives_at_inception": { "employees": number_or_0, "dependants": number_or_0, "total": number_or_0 },
  "lives_at_renewal": { "employees": number_or_0, "dependants": number_or_0, "total": number_or_0 },
  "coverage_scope": {
    "family_composition": "string or null",
    "type": "Floater or Individual or null",
    "claim_type": "Cashless & Reimbursement or null",
    "sum_insured": "string describing SI slabs e.g. ₹3,00,000 or null",
    "opd_tele_consultation": "string or null",
    "opd_physical_consultation": "string or null",
    "lab_tests": "string or null",
    "pharmacy": "string or null"
  },
  "sum_insured_slabs": [list_of_numbers_in_rupees],
  "special_conditions": [{"condition": "label", "detail": "value"}],
  "exclusions": "string or null",
  "terms_and_conditions": "string or null"
}
Return ONLY the JSON object, no explanation.

---EXCEL DATA---
${sheetText.substring(0, 6000)}`;

    let parsed = {};
    try {
      const llmResult = await callLLM({
        messages: [
          { role: 'system', content: 'You extract structured insurance data from raw Excel cell dumps. Always return valid JSON only.' },
          { role: 'user', content: EXTRACTION_PROMPT },
        ],
        temperature: 0.1,
        maxTokens: 2000,
      });
      const raw = llmResult.content || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (llmErr) {
      console.warn('[CRM RFQ Upload Excel] LLM extraction failed, falling back to column scan:', llmErr.message);
      // Fallback: column B label → column D value scan
      const fallbackSheet = rfqSheets[0]?.ws;
      if (fallbackSheet) {
        const range = XLSX.utils.decode_range(fallbackSheet['!ref'] || 'A1:I50');
        for (let r = range.s.r; r <= range.e.r; r++) {
          const labelCell = fallbackSheet[XLSX.utils.encode_cell({ r, c: 1 })];
          const valueCell = fallbackSheet[XLSX.utils.encode_cell({ r, c: 3 })];
          if (labelCell?.v && valueCell?.v) {
            const label = labelCell.v.toString().toLowerCase().trim();
            const val = valueCell.v instanceof Date ? valueCell.v.toISOString().split('T')[0] : valueCell.v;
            parsed[label] = val;
          }
        }
        parsed = {
          insured_name: parsed['insured name'] || parsed['insured'] || 'Unknown',
          insured_address: parsed['address'] || null,
          existing_insurer: parsed['existing insurer'] || null,
          existing_tpa: parsed['existing tpa'] || null,
          policy_start: parsed['policy period'] || null,
          policy_end: null,
          premium_paid: parsed['premium paid'] || null,
          product_type: normalizeProductType(rfqSheetName.includes('OPD') ? 'OPD' : null),
          lives_at_inception: {
            employees: parseInt(parsed['total no. of employees at inception']) || 0,
            dependants: parseInt(parsed['total no. of dependants at inception']) || 0,
            total: parseInt(parsed['total no. of lives at inception']) || 0,
          },
          lives_at_renewal: {
            employees: parseInt(parsed['total no. of employees at renewal']) || 0,
            dependants: parseInt(parsed['total no. of dependants at renewal']) || 0,
            total: parseInt(parsed['total no. of lives at renewal']) || 0,
          },
          coverage_scope: {
            family_composition: parsed['family composition'] || null,
            type: parsed['type'] || null,
            claim_type: parsed['claim type'] || null,
            sum_insured: parsed['policy sum insured'] || null,
          },
          sum_insured_slabs: [],
          special_conditions: [],
          exclusions: parsed['general opd exclusions'] || null,
          terms_and_conditions: parsed['t&cs to be noted'] || null,
        };
      }
    }

    // SI slab parsing from sum_insured text (handles ₹3,00,000 and 300000 formats)
    const siSlabs = [];
    if (Array.isArray(parsed.sum_insured_slabs) && parsed.sum_insured_slabs.length) {
      siSlabs.push(...parsed.sum_insured_slabs.filter(v => typeof v === 'number' && v > 0));
    } else {
      const siText = parsed.coverage_scope?.sum_insured || '';
      const siMatches = siText.match(/[₹]?[\d,]{4,}/g) || [];
      for (const m of siMatches) {
        const val = parseInt(m.replace(/[₹,]/g, ''));
        if (val && !isNaN(val) && val >= 1000) siSlabs.push(val);
      }
    }

    const rfq_number = generateRFQNumber();
    // Always parse premium_paid using stdParseAmount to handle currency-formatted strings
    const premiumPaidNum = stdParseAmount(parsed.premium_paid);
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_rfqs (rfq_number, insured_name, insured_address, policy_type, product_type,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
        lives_at_inception, lives_at_renewal, coverage_scope, special_conditions, exclusions,
        terms_and_conditions, notes, sum_insured_slabs, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        rfq_number,
        parsed.insured_name || 'Unknown',
        parsed.insured_address || null,
        parsed.policy_type || 'Group Mediclaim',
        normalizeProductType(parsed.product_type || (rfqSheetName.includes('OPD') ? 'OPD' : null)),
        parsed.existing_insurer || null,
        parsed.existing_tpa || null,
        parsed.policy_start || null,
        parsed.policy_end || null,
        premiumPaidNum,
        JSON.stringify(parsed.lives_at_inception || { employees: 0, dependants: 0, total: 0 }),
        JSON.stringify(parsed.lives_at_renewal || { employees: 0, dependants: 0, total: 0 }),
        JSON.stringify(parsed.coverage_scope || {}),
        JSON.stringify(Array.isArray(parsed.special_conditions) ? parsed.special_conditions : []),
        parsed.exclusions || null,
        parsed.terms_and_conditions || null,
        `Auto-parsed from broker Excel: ${req.file.originalname}`,
        JSON.stringify(siSlabs),
        req.crmUser.id,
        req.crmUser.id,
      ]
    );

    const rfqId = rows[0].id;

    // Auto-push parsed T&Cs to product-wise master (as pending, requires admin approval)
    if (parsed.terms_and_conditions) {
      syncTCsFromRFQ(rfqId, rows[0].product_type, parsed.terms_and_conditions, req.crmUser.id).catch(() => {});
    }

    // Persist original file to S3 for future re-parsing
    const slipKey = await uploadSlipToS3(req.file.buffer, req.file.originalname, rfqId);
    if (slipKey) await sharedPool.query('UPDATE crm_rfqs SET slip_file_key=$1 WHERE id=$2', [slipKey, rfqId]);
    await uploadRfqFile(req.file.buffer, req.file.originalname, rfqId, 'slip', req.crmUser.id);

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
          // ── AI Data Standardization ──
          const dobVal = stdParseDate(m.dob);
          const dojVal = stdParseDate(m.doj);
          let ageVal = m.age ? parseInt(m.age) : null;
          if (!ageVal && dobVal) ageVal = stdComputeAge(dobVal);
          values.push(rfqId, m.sr_no, stdEmpCode(m.emp_code), stdRelationship(m.relationship), m.relation_type, stdGender(m.gender),
            dobVal, ageVal, stdParseAmount(m.si_expiring), stdParseAmount(m.si_proposed),
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

// ─── Re-parse existing RFQ from new Excel / PDF / Image upload ───────────────
router.post('/rfqs/:id/reparse', authCRM, (req, res, next) => {
  // multer is optional — skip if content-type is not multipart
  if (!req.headers['content-type']?.includes('multipart/form-data')) return next();
  upload.single('file')(req, res, next);
}, async (req, res) => {
  try {
    const rfqId = req.params.id;
    // Verify the RFQ exists
    const { rows: existing } = await sharedPool.query('SELECT id, slip_file_key FROM crm_rfqs WHERE id = $1', [rfqId]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'RFQ not found' });

    // If no file uploaded, try to fetch the originally stored file from S3
    let fileBuffer = req.file?.buffer || null;
    let originalName = req.file?.originalname || '';
    if (!fileBuffer && existing[0].slip_file_key) {
      fileBuffer = await fetchSlipFromS3(existing[0].slip_file_key);
      if (fileBuffer) originalName = existing[0].slip_file_key.split('/').pop();
    }
    if (!fileBuffer) return res.status(400).json({ success: false, message: 'No file provided and no stored file found for this RFQ. Please upload the file.' });

    const _llm1 = await import('../services/ai-brain/llm-provider.js');
    const callLLM = _llm1.default?.chat || _llm1.chat;
    const vision = _llm1.default?.vision || _llm1.vision;
    const mime = req.file?.mimetype || '';
    const isExcel = /\.(xlsx|xls)$/i.test(originalName);

    const EXTRACTION_PROMPT = `You are an expert insurance broking slip parser. Extract all available fields and return ONLY valid JSON:
{
  "insured_name": "string",
  "insured_address": "string or null",
  "existing_insurer": "string or null",
  "existing_tpa": "string or null",
  "policy_start": "YYYY-MM-DD or null",
  "policy_end": "YYYY-MM-DD or null",
  "premium_paid": "string or null",
  "product_type": "one of: GMC (Group Mediclaim/GHI), GPA (Group Personal Accident), GTL (Group Term Life/GTLI), OPD (Outpatient Benefits), GMC+OPD, GMC+GPA, GMC+GTL, Parents (Parents Policy/Floater), TopUp (Super Top-up), CI (Critical Illness), MIXED",
  "member_count": number_or_null,
  "lives_at_inception": { "employees": number_or_0, "dependants": number_or_0, "total": number_or_0 },
  "lives_at_renewal": { "employees": number_or_0, "dependants": number_or_0, "total": number_or_0 },
  "coverage_scope": {
    "family_composition": "string or null",
    "type": "Floater or Individual or null",
    "claim_type": "string or null",
    "sum_insured": "string or null",
    "opd_tele_consultation": "string or null",
    "opd_physical_consultation": "string or null",
    "lab_tests": "string or null",
    "pharmacy": "string or null"
  },
  "sum_insured_slabs": [list_of_numbers],
  "special_conditions": [{"condition":"string","detail":"string"}],
  "exclusions": "string or null",
  "terms_and_conditions": "string or null"
}
Return ONLY JSON.`;

    let rawContent = '';

    if (isExcel) {
      const workbook = await XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
      let memberSheet = null, memberSheetName = '';
      const rfqSheets = [];
      for (const name of workbook.SheetNames) {
        const ws = workbook.Sheets[name];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const rowCount = range.e.r - range.s.r + 1;
        if (rowCount > 150 && !memberSheet) { memberSheet = ws; memberSheetName = name; }
        else { rfqSheets.push({ name, ws }); }
      }
      if (rfqSheets.length === 0) rfqSheets.push({ name: workbook.SheetNames[0], ws: workbook.Sheets[workbook.SheetNames[0]] });

      // Dump ALL non-member sheets into text for LLM
      const dumpWS = (ws, sheetName) => {
        if (!ws) return '';
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        let text = `\n=== Sheet: ${sheetName} ===\n`;
        for (let r = range.s.r; r <= range.e.r; r++) {
          const rp = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell?.v !== undefined && cell.v !== null && cell.v !== '') {
              const v = cell.v instanceof Date ? cell.v.toISOString().split('T')[0] : cell.w || cell.v?.toString();
              if (v?.toString().trim()) rp.push(v.toString().trim());
            }
          }
          if (rp.length) text += rp.join(' | ') + '\n';
        }
        return text;
      };
      let sheetText = '';
      for (const { name, ws } of rfqSheets) { sheetText += dumpWS(ws, name); if (sheetText.length > 7000) break; }
      const llmResult = await callLLM({
        messages: [
          { role: 'system', content: 'You extract structured insurance data from raw Excel cell dumps. Always return valid JSON only.' },
          { role: 'user', content: `${EXTRACTION_PROMPT}\n\n---EXCEL DATA---\n${sheetText.substring(0, 6000)}` },
        ],
        temperature: 0.1, maxTokens: 2000,
      });
      rawContent = llmResult.content || '';

      // Re-upload members if new member sheet found
      if (memberSheet) {
        await sharedPool.query('DELETE FROM crm_rfq_members WHERE rfq_id = $1', [rfqId]);
        const mRows = XLSX.utils.sheet_to_json(memberSheet, { defval: null });
        const colMap = (row) => {
          const keys = Object.keys(row);
          const find = (patterns) => { for (const p of patterns) { const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p)); if (k) return row[k]; } return null; };
          return { sr_no: find(['srno','sno','serial']), emp_code: find(['empcode','employeecode','empid']), relationship: find(['relationship']),
            relation_type: find(['relation']), gender: find(['gender','sex']), dob: find(['dob','dateofbirth']), age: find(['age']),
            si_expiring: find(['siexpiring','opdsiexpiring','expiringsi']), si_proposed: find(['siproposed','opdsiproposed','proposedsi']),
            designation: find(['designation','jobtitle']), band: find(['band','grade']), doj: find(['doj','dateofjoining']) };
        };
        let memberCount = 0;
        for (let i = 0; i < mRows.length; i += 500) {
          const batch = mRows.slice(i, i + 500);
          const values = []; const placeholders = []; let pIdx = 1;
          for (const raw of batch) {
            const m = colMap(raw);
            const dobVal = stdParseDate(m.dob); const dojVal = stdParseDate(m.doj);
            let ageVal = m.age ? parseInt(m.age) : null;
            if (!ageVal && dobVal) ageVal = stdComputeAge(dobVal);
            values.push(rfqId, m.sr_no, stdEmpCode(m.emp_code), stdRelationship(m.relationship), m.relation_type, stdGender(m.gender),
              dobVal, ageVal, stdParseAmount(m.si_expiring), stdParseAmount(m.si_proposed), m.designation, m.band, dojVal, null);
            placeholders.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13})`);
            pIdx += 14;
          }
          await sharedPool.query(
            `INSERT INTO crm_rfq_members (rfq_id,sr_no,emp_code,relationship,relation_type,gender,dob,age,si_expiring,si_proposed,designation,band,doj,employee_name) VALUES ${placeholders.join(',')}`, values);
          memberCount += batch.length;
        }
        await sharedPool.query('UPDATE crm_rfqs SET member_count=$1, updated_at=NOW() WHERE id=$2', [memberCount, rfqId]);
      }
    } else if (mime === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf')) {
      let pdfText = '';
      try { const pdfParse = (await import('pdf-parse')).default; const p = await pdfParse(fileBuffer); pdfText = p.text || ''; } catch {}
      if (pdfText.length > 100) {
        const llmResult = await callLLM({ messages: [{ role: 'system', content: 'Extract insurance data. Return valid JSON only.' }, { role: 'user', content: `${EXTRACTION_PROMPT}\n\n---TEXT---\n${pdfText.substring(0, 8000)}` }], temperature: 0.1, maxTokens: 2000 });
        rawContent = llmResult.content || '';
      } else {
        const visionResult = await vision({ base64Image: fileBuffer.toString('base64'), mimeType: 'application/pdf', prompt: EXTRACTION_PROMPT, maxTokens: 2000 });
        rawContent = visionResult.content || '';
      }
    } else if (['image/jpeg','image/jpg','image/png','image/webp'].includes(mime)) {
      const visionResult = await vision({ base64Image: fileBuffer.toString('base64'), mimeType: mime, prompt: EXTRACTION_PROMPT, maxTokens: 2000 });
      rawContent = visionResult.content || '';
    } else {
      return res.status(415).json({ success: false, message: `Unsupported file type: ${mime || originalName}` });
    }

    let parsed = {};
    try { const m = rawContent.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch {}

    const siSlabs = Array.isArray(parsed.sum_insured_slabs) ? parsed.sum_insured_slabs.filter(v => typeof v === 'number' && v > 0) : [];

    const { rows } = await sharedPool.query(
      `UPDATE crm_rfqs SET
        insured_name = COALESCE($1, insured_name),
        insured_address = COALESCE($2, insured_address),
        product_type = COALESCE($3, product_type),
        existing_insurer = COALESCE($4, existing_insurer),
        existing_tpa = COALESCE($5, existing_tpa),
        policy_start = COALESCE($6, policy_start),
        policy_end = COALESCE($7, policy_end),
        premium_paid = COALESCE($8, premium_paid),
        lives_at_inception = COALESCE($9, lives_at_inception),
        lives_at_renewal = COALESCE($10, lives_at_renewal),
        coverage_scope = COALESCE($11, coverage_scope),
        special_conditions = COALESCE($12, special_conditions),
        exclusions = COALESCE($13, exclusions),
        terms_and_conditions = COALESCE($14, terms_and_conditions),
        sum_insured_slabs = COALESCE($15, sum_insured_slabs),
        notes = $16,
        updated_at = NOW()
       WHERE id = $17 RETURNING *`,
      [
        parsed.insured_name || null,
        parsed.insured_address || null,
        parsed.product_type ? normalizeProductType(parsed.product_type) : null,
        parsed.existing_insurer || null,
        parsed.existing_tpa || null,
        parsed.policy_start || null,
        parsed.policy_end || null,
        parsed.premium_paid || null,
        parsed.lives_at_inception ? JSON.stringify(parsed.lives_at_inception) : null,
        parsed.lives_at_renewal ? JSON.stringify(parsed.lives_at_renewal) : null,
        parsed.coverage_scope ? JSON.stringify(parsed.coverage_scope) : null,
        parsed.special_conditions?.length ? JSON.stringify(parsed.special_conditions) : null,
        parsed.exclusions || null,
        parsed.terms_and_conditions || null,
        siSlabs.length ? JSON.stringify(siSlabs) : null,
        `Re-parsed from ${originalName}`,
        rfqId,
      ]
    );

    // Auto-push re-parsed T&Cs to product-wise master (pending, requires admin approval)
    if (parsed.terms_and_conditions && rows[0]) {
      syncTCsFromRFQ(rfqId, rows[0].product_type, parsed.terms_and_conditions, req.crmUser.id).catch(() => {});
    }

    // If a new file was uploaded (not from S3), store it in S3 for future reparsing
    if (req.file?.buffer) {
      const newKey = await uploadSlipToS3(req.file.buffer, req.file.originalname, rfqId);
      if (newKey) await sharedPool.query('UPDATE crm_rfqs SET slip_file_key=$1 WHERE id=$2', [newKey, rfqId]);
      await uploadRfqFile(req.file.buffer, req.file.originalname, rfqId, 'slip', req.crmUser.id);
    }

    return res.status(200).json({ success: true, message: `RFQ updated from ${isExcel ? 'Excel' : 'document'} via AI.`, data: rows[0] });
  } catch (error) {
    console.error('[CRM RFQ Reparse]', error.message);
    return res.status(500).json({ success: false, message: 'Re-parse failed: ' + error.message });
  }
});

// ─── Upload RFQ from PDF / Image (Vision AI + LLM parsing) ───────────────────
router.post('/rfqs/upload-document', authCRM, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });

    const _llm2 = await import('../services/ai-brain/llm-provider.js');
    const callLLM = _llm2.default?.chat || _llm2.chat;
    const vision = _llm2.default?.vision || _llm2.vision;
    const mime = req.file.mimetype;
    const originalName = req.file.originalname;
    let rawText = '';

    const RFQ_EXTRACTION_PROMPT = `You are an expert insurance broking slip parser. Extract all available fields from this document and return ONLY valid JSON with this exact structure (use null for missing fields):
{
  "insured_name": "string",
  "insured_address": "string",
  "existing_insurer": "string",
  "existing_tpa": "string",
  "policy_start": "YYYY-MM-DD or null",
  "policy_end": "YYYY-MM-DD or null",
  "premium_paid": "string or null",
  "policy_type": "Group Mediclaim",
  "product_type": "one of: GMC (Group Mediclaim/GHI), GPA (Group Personal Accident), GTL (Group Term Life/GTLI), OPD (Outpatient Benefits), GMC+OPD, GMC+GPA, GMC+GTL, Parents (Parents Policy/Floater), TopUp (Super Top-up), CI (Critical Illness), MIXED",
  "member_count": number_or_null,
  "lives_at_inception": { "employees": number_or_0, "dependants": number_or_0, "total": number_or_0 },
  "lives_at_renewal": { "employees": number_or_0, "dependants": number_or_0, "total": number_or_0 },
  "coverage_scope": {
    "family_composition": "string or null",
    "type": "string or null",
    "claim_type": "Cashless & Reimbursement or null",
    "sum_insured": "string or null",
    "opd_tele_consultation": "string or null",
    "opd_physical_consultation": "string or null",
    "lab_tests": "string or null",
    "pharmacy": "string or null"
  },
  "sum_insured_slabs": [number_array],
  "special_conditions": [{"condition": "string", "detail": "string"}],
  "exclusions": "string or null",
  "terms_and_conditions": "string or null"
}
Return ONLY the JSON object, no explanation.`;

    // ── PDF: extract text then call LLM ──
    if (mime === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf')) {
      let pdfText = '';
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(req.file.buffer);
        pdfText = parsed.text || '';
      } catch (pdfErr) {
        console.warn('[RFQ Upload Doc] pdf-parse failed:', pdfErr.message);
      }

      if (pdfText.length > 100) {
        // Text-based PDF — use LLM to extract
        rawText = pdfText.substring(0, 8000); // cap to avoid token overflow
        const llmResult = await callLLM({
          messages: [
            { role: 'system', content: 'You extract structured insurance broking slip data from raw text. Always return valid JSON.' },
            { role: 'user', content: `${RFQ_EXTRACTION_PROMPT}\n\n---DOCUMENT TEXT---\n${rawText}` },
          ],
          temperature: 0.1,
          maxTokens: 2000,
        });
        rawText = llmResult.content || '';
      } else {
        // Scanned/image PDF — try vision on first page via base64 (send whole buffer as image/jpeg best-effort)
        const base64 = req.file.buffer.toString('base64');
        try {
          const visionResult = await vision({
            base64Image: base64,
            mimeType: 'application/pdf',
            prompt: RFQ_EXTRACTION_PROMPT,
            maxTokens: 2000,
          });
          rawText = visionResult.content || '';
        } catch (vErr) {
          console.warn('[RFQ Upload Doc] Vision failed for PDF:', vErr.message);
          return res.status(422).json({ success: false, message: 'Could not extract text from this scanned PDF. Please upload a text-based PDF or an image.' });
        }
      }
    }

    // ── Image: use vision directly ──
    else if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      const base64 = req.file.buffer.toString('base64');
      const visionResult = await vision({
        base64Image: base64,
        mimeType: mime,
        prompt: RFQ_EXTRACTION_PROMPT,
        maxTokens: 2000,
      });
      rawText = visionResult.content || '';
    }

    // ── Fallback: unknown type ──
    else {
      return res.status(415).json({ success: false, message: `Unsupported file type: ${mime}. Use PDF, JPG, or PNG.` });
    }

    // ── Parse JSON from LLM/Vision response ──
    let parsed = {};
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[RFQ Upload Doc] JSON parse error:', parseErr.message, rawText.substring(0, 300));
      return res.status(422).json({ success: false, message: 'AI could not extract structured data from this document. Please ensure it is a clear broking slip.' });
    }

    // ── Build & insert RFQ ──
    const siSlabs = Array.isArray(parsed.sum_insured_slabs) ? parsed.sum_insured_slabs.filter(v => typeof v === 'number') : [];
    const rfq_number = generateRFQNumber();
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_rfqs (rfq_number, insured_name, insured_address, policy_type, product_type,
        existing_insurer, existing_tpa, policy_start, policy_end, premium_paid,
        lives_at_inception, lives_at_renewal, coverage_scope, special_conditions, exclusions,
        terms_and_conditions, notes, sum_insured_slabs, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        rfq_number,
        parsed.insured_name || 'Unknown',
        parsed.insured_address || null,
        parsed.policy_type || 'Group Mediclaim',
        normalizeProductType(parsed.product_type),
        parsed.existing_insurer || null,
        parsed.existing_tpa || null,
        parsed.policy_start || null,
        parsed.policy_end || null,
        parsed.premium_paid || null,
        JSON.stringify(parsed.lives_at_inception || { employees: 0, dependants: 0, total: 0 }),
        JSON.stringify(parsed.lives_at_renewal || { employees: 0, dependants: 0, total: 0 }),
        JSON.stringify(parsed.coverage_scope || {}),
        JSON.stringify(Array.isArray(parsed.special_conditions) ? parsed.special_conditions : []),
        parsed.exclusions || null,
        parsed.terms_and_conditions || null,
        `Auto-parsed via Vision AI from: ${originalName}`,
        JSON.stringify(siSlabs),
        req.crmUser.id,
        req.crmUser.id,
      ]
    );

    const rfqId = rows[0].id;
    // Update member_count if extracted
    const memberCount = parsed.member_count || parsed.lives_at_renewal?.total || parsed.lives_at_inception?.total || 0;
    if (memberCount) {
      await sharedPool.query(`UPDATE crm_rfqs SET member_count = $1 WHERE id = $2`, [memberCount, rfqId]);
    }

    // Auto-push parsed T&Cs to product-wise master (pending, requires admin approval)
    if (parsed.terms_and_conditions) {
      syncTCsFromRFQ(rfqId, rows[0].product_type, parsed.terms_and_conditions, req.crmUser.id).catch(() => {});
    }

    await uploadRfqFile(req.file.buffer, originalName, rfqId, 'slip', req.crmUser.id);

    return res.status(201).json({
      success: true,
      message: `RFQ created: ${rfq_number}. Parsed from ${originalName.endsWith('.pdf') ? 'PDF' : 'image'} via AI Vision.`,
      data: { ...rows[0], member_count: memberCount },
    });
  } catch (error) {
    console.error('[CRM RFQ Upload Doc]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to parse document: ' + error.message });
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
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%') AS self_count,
        AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age,
        COALESCE(SUM(COALESCE(NULLIF(si_expiring,0), si_proposed)),0) AS total_si_expiring,
        COALESCE(SUM(COALESCE(NULLIF(si_proposed,0), si_expiring)),0) AS total_si_proposed
        FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]),
      pool.query(`SELECT gender, COUNT(*) AS count FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY gender ORDER BY count DESC`, [rfqId]),
      pool.query(`SELECT COALESCE(NULLIF(TRIM(relationship),''), relation_type, 'Unknown') AS relation_type, COUNT(*) AS count FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY 1 ORDER BY count DESC`, [rfqId]),
      pool.query(`SELECT
        CASE WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
             WHEN age < 60 THEN '45-59' WHEN age < 75 THEN '60-74' ELSE '75+' END AS age_band,
        COUNT(*) AS count
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY 1 ORDER BY 1`, [rfqId]),
      pool.query(`SELECT band, COUNT(*) AS count, COUNT(DISTINCT emp_code) AS emp_count
        FROM crm_rfq_members WHERE rfq_id = $1 AND band IS NOT NULL GROUP BY band ORDER BY band`, [rfqId]),
      pool.query(`SELECT COALESCE(NULLIF(si_proposed,0), si_expiring) AS si_proposed, COUNT(*) AS count
        FROM crm_rfq_members WHERE rfq_id = $1 AND COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%' AND COALESCE(NULLIF(si_proposed,0), si_expiring) > 0
        GROUP BY 1 ORDER BY 1`, [rfqId]),
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

// ─── Supplemental input parser for AI quote generation ───────────────────────
// Parses user-uploaded files (Excel, image, PDF) + free-text notes into a
// single string that gets appended to the LLM actuarial prompt.

async function parseSupplementalInputs(files = [], additionalContext = '') {
  const llmMod = await import('../services/ai-brain/llm-provider.js');
  const llmProvider = llmMod.default;
  const sections = [];

  if (additionalContext?.trim()) {
    sections.push(`=== ADDITIONAL CONTEXT PROVIDED BY UNDERWRITER ===\n${additionalContext.trim()}`);
  }

  for (const file of files) {
    const mime = file.mimetype || '';
    const name = file.originalname || 'file';

    try {
      // ── Excel / CSV ──────────────────────────────────────────────────────
      if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')
        || name.match(/\.(xlsx?|csv)$/i)) {
        const wb = await XLSX.read(file.buffer, { type: 'buffer' });
        const sheetLines = [];
        for (const sn of wb.SheetNames.slice(0, 5)) {
          const json = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
          if (json.length > 0) {
            sheetLines.push(`Sheet: ${sn}`);
            // Emit header + up to 100 rows as pipe-delimited text
            const headers = Object.keys(json[0]);
            sheetLines.push(headers.join(' | '));
            for (const row of json.slice(0, 100)) {
              sheetLines.push(headers.map(h => String(row[h] ?? '')).join(' | '));
            }
            if (json.length > 100) sheetLines.push(`... (${json.length - 100} more rows)`);
          }
        }
        if (sheetLines.length) {
          sections.push(`=== EXCEL FILE: ${name} ===\n${sheetLines.join('\n')}`);
        }

      // ── Images ──────────────────────────────────────────────────────────
      } else if (mime.startsWith('image/')) {
        const b64 = file.buffer.toString('base64');
        const visionResult = await llmProvider.vision({
          base64Image: b64,
          mimeType: mime,
          prompt: 'Extract all text, numbers, tables and relevant insurance/underwriting data visible in this image. Return as structured plain text.',
          maxTokens: 1500,
        });
        const extracted = visionResult?.content || visionResult?.text || String(visionResult || '');
        if (extracted.trim()) {
          sections.push(`=== IMAGE FILE: ${name} ===\n${extracted.trim()}`);
        }

      // ── PDF (text extraction via buffer scan for readable text) ──────────
      } else if (mime === 'application/pdf' || name.match(/\.pdf$/i)) {
        // Simple approach: extract printable ASCII from the PDF buffer.
        // Full PDF parsing requires pdfjs-dist; we extract visible text blocks.
        const raw = file.buffer.toString('latin1');
        const textBlocks = [];
        const btRe = /BT([\s\S]*?)ET/g;
        let m;
        while ((m = btRe.exec(raw)) !== null) {
          const content = m[1];
          const strRe = /\(([^)]{1,300})\)\s*Tj/g;
          let sm;
          while ((sm = strRe.exec(content)) !== null) {
            const t = sm[1].replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
                             .replace(/\\n/g, ' ').replace(/\\r/g, ' ').trim();
            if (t.length > 2) textBlocks.push(t);
          }
        }
        const pdfText = textBlocks.join(' ').replace(/\s+/g, ' ').trim();
        if (pdfText.length > 20) {
          sections.push(`=== PDF FILE: ${name} ===\n${pdfText.slice(0, 4000)}`);
        } else {
          // Fallback: send to vision if text extraction failed
          const b64 = file.buffer.toString('base64');
          const visionResult = await llmProvider.vision({
            base64Image: b64,
            mimeType: 'application/pdf',
            prompt: 'Extract all text, numbers and tables from this insurance document. Return as structured plain text.',
            maxTokens: 1500,
          }).catch(() => null);
          const extracted = visionResult?.content || '';
          if (extracted.trim()) {
            sections.push(`=== PDF FILE: ${name} ===\n${extracted.trim()}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[AI Quote] Failed to parse supplemental file ${name}:`, e.message);
      sections.push(`=== FILE: ${name} (parse error — ${e.message}) ===`);
    }
  }

  return sections.join('\n\n');
}

// ─── AI Quote Generation Engine ──────────────────────────────────────────────
// Deep actuarial pricing model using member demographics, claims experience,
// OPD utilization curves, and wellness cost benchmarks.
// Accepts optional multipart/form-data with:
//   - additionalContext (text field)
//   - files[] (Excel, PDF, image — up to 10 files, 50MB each)
router.post('/rfqs/:id/ai-generate-quote', authCRM, upload.array('files', 10), async (req, res) => {
  try {
    const rfqId = req.params.id;
    const pool = sharedPool;

    // ── 1. Fetch RFQ + Members ──────────────────────────────────────────────
    const rfqRes = await pool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];

    const [summaryRes, ageBandRes, siSlabRes, familyRes, genderRes, relationRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT emp_code) AS employees,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%') AS self_count,
        AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age,
        COALESCE(SUM(COALESCE(NULLIF(si_expiring,0), si_proposed)),0) AS total_si_expiring,
        COALESCE(SUM(COALESCE(NULLIF(si_proposed,0), si_expiring)),0) AS total_si_proposed,
        COALESCE(AVG(COALESCE(NULLIF(si_expiring,0), si_proposed)) FILTER (WHERE COALESCE(si_expiring,si_proposed) > 0), 0) AS avg_si_expiring,
        COALESCE(AVG(COALESCE(NULLIF(si_proposed,0), si_expiring)) FILTER (WHERE COALESCE(si_proposed,si_expiring) > 0), 0) AS avg_si_proposed
        FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]),
      pool.query(`SELECT age_band, cnt FROM (
        SELECT CASE WHEN age < 5 THEN '0-4' WHEN age < 18 THEN '5-17' WHEN age < 30 THEN '18-29'
          WHEN age < 45 THEN '30-44' WHEN age < 60 THEN '45-59'
          WHEN age < 75 THEN '60-74' ELSE '75+' END AS age_band, COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY 1
      ) sub ORDER BY age_band`, [rfqId]),
      pool.query(`SELECT COALESCE(NULLIF(si_proposed,0), si_expiring) AS slab, COUNT(*) AS lives
        FROM crm_rfq_members WHERE rfq_id = $1
          AND COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%'
          AND COALESCE(NULLIF(si_proposed,0), si_expiring) > 0
        GROUP BY 1 ORDER BY 1`, [rfqId]),
      pool.query(`SELECT family_size, cnt FROM (
        SELECT fs AS family_size, COUNT(*) AS cnt FROM (
          SELECT emp_code, COUNT(*) AS fs FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY emp_code
        ) sub GROUP BY fs
      ) sub2 ORDER BY family_size`, [rfqId]),
      pool.query(`SELECT UPPER(TRIM(gender)) AS g, COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY 1`, [rfqId]),
      pool.query(`SELECT UPPER(TRIM(COALESCE(NULLIF(TRIM(relationship),''), relation_type))) AS rel, COUNT(*) AS cnt
        FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY 1`, [rfqId]),
    ]);
    const summary = summaryRes.rows[0];
    const totalMembers = parseInt(summary.total) || 0;
    // Fallback: if emp_code is all null, use self_count (members with relationship=SELF); else estimate from avg family size of 4
    const totalEmployees = parseInt(summary.employees) || parseInt(summary.self_count) || Math.ceil(totalMembers / 4);
    if (totalMembers === 0) return res.status(400).json({ success: false, message: 'No members found — upload member data first' });

    // ── 1b. SUPPLEMENTAL INPUTS (text + files) ──────────────────────────────
    const additionalContext = req.body?.additionalContext || '';
    const uploadedFiles = req.files || [];
    let supplementalContext = '';
    if (additionalContext.trim() || uploadedFiles.length > 0) {
      try {
        supplementalContext = await parseSupplementalInputs(uploadedFiles, additionalContext);
        console.log(`[AI Quote] Supplemental context parsed: ${uploadedFiles.length} files, ${supplementalContext.length} chars`);
      } catch (e) {
        console.warn('[AI Quote] Supplemental input parse failed:', e.message);
        supplementalContext = additionalContext.trim() ? `=== ADDITIONAL CONTEXT ===\n${additionalContext.trim()}` : '';
      }
    }

    // ── 1a. DATA QUALITY VALIDATION ─────────────────────────────────────────
    const dataQualityRes = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE age IS NULL) AS missing_age,
      COUNT(*) FILTER (WHERE gender IS NULL OR TRIM(gender) = '') AS missing_gender,
      COUNT(*) FILTER (WHERE si_proposed IS NULL OR si_proposed = 0) AS missing_si,
      COUNT(*) FILTER (WHERE si_expiring IS NULL OR si_expiring = 0) AS missing_si_expiring,
      COUNT(*) FILTER (WHERE dob IS NULL) AS missing_dob,
      COUNT(*) FILTER (WHERE relationship IS NULL OR TRIM(relationship) = '') AS missing_relationship,
      COUNT(*) FILTER (WHERE emp_code IS NULL OR TRIM(emp_code) = '') AS missing_emp_code
      FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]);
    const dq = dataQualityRes.rows[0];
    const dataQualityWarnings = [];
    const missingAge = parseInt(dq.missing_age);
    const missingGender = parseInt(dq.missing_gender);
    const missingSI = parseInt(dq.missing_si);
    const missingDob = parseInt(dq.missing_dob);
    const missingRelationship = parseInt(dq.missing_relationship);
    const missingEmpCode = parseInt(dq.missing_emp_code);
    if (missingAge > 0) dataQualityWarnings.push({ field: 'age', missing: missingAge, impact: 'Excluded from age-banded pricing — may understate risk-weighted costs' });
    if (missingGender > 0) dataQualityWarnings.push({ field: 'gender', missing: missingGender, impact: 'Gender factor defaulted to 50:50 for these members' });
    if (missingSI > 0) dataQualityWarnings.push({ field: 'si_proposed', missing: missingSI, impact: 'Cannot compute slab-wise pricing for these members' });
    if (missingDob > 0) dataQualityWarnings.push({ field: 'dob', missing: missingDob, impact: 'Age may be inaccurate or missing' });
    if (missingRelationship > 0) dataQualityWarnings.push({ field: 'relationship', missing: missingRelationship, impact: 'Employee/dependent split may be inaccurate' });
    if (missingEmpCode > 0) dataQualityWarnings.push({ field: 'emp_code', missing: missingEmpCode, impact: 'Family grouping may be unreliable' });

    const completenessScore = Math.round((1 - (missingAge + missingGender + missingSI) / (totalMembers * 3)) * 100);
    const dataCompleteness = {
      total_members: totalMembers,
      fields_checked: ['age', 'gender', 'si_proposed', 'dob', 'relationship', 'emp_code'],
      missing: { age: missingAge, gender: missingGender, si_proposed: missingSI, dob: missingDob, relationship: missingRelationship, emp_code: missingEmpCode },
      completeness_score: completenessScore,
      grade: completenessScore >= 95 ? 'A' : completenessScore >= 80 ? 'B' : completenessScore >= 60 ? 'C' : 'D',
      warnings: dataQualityWarnings,
    };

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
    let avgFamilySize = 4.0; // industry default
    if (familySizes.length > 0) {
      const totalFamilySizeCount = familySizes.reduce((s, r) => s + parseInt(r.cnt), 0);
      if (totalFamilySizeCount > 0) {
        avgFamilySize = familySizes.reduce((s, r) => s + parseInt(r.family_size) * parseInt(r.cnt), 0) / totalFamilySizeCount;
      }
      // Sanity: if emp_code is missing, all members are in one giant "family" — cap it
      if (avgFamilySize > 10) avgFamilySize = totalMembers / totalEmployees;
      if (!isFinite(avgFamilySize) || avgFamilySize < 1) avgFamilySize = 4.0;
    }

    // ── 1b. CLAIMS EXPERIENCE DATA ──────────────────────────────────────────
    // If claims history is uploaded, use it for experience-based underwriting
    const claimsCountRes = await pool.query(`SELECT COUNT(*) AS total FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]);
    const hasClaimsExperience = parseInt(claimsCountRes.rows[0].total) > 0;
    let claimsExperience = null;

    if (hasClaimsExperience) {
      const [claimsSummary, claimsSvcDist, claimsMonthly, claimsRelDist, claimsAgeDist, claimsSevDist] = await Promise.all([
        pool.query(`SELECT
          COUNT(*) AS total_claims,
          COUNT(DISTINCT emp_code) AS unique_claimants,
          COALESCE(SUM(claimed_amount), 0) AS total_claimed,
          COALESCE(SUM(approved_amount), 0) AS total_approved,
          COALESCE(SUM(paid_amount), 0) AS total_paid,
          COALESCE(AVG(claimed_amount), 0) AS avg_claimed,
          COALESCE(AVG(approved_amount), 0) AS avg_approved,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY claimed_amount) AS median_claim,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY claimed_amount) AS p90_claim,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY claimed_amount) AS p95_claim,
          MAX(claimed_amount) AS max_claim,
          MIN(claim_date) AS earliest_claim, MAX(claim_date) AS latest_claim
          FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]),
        pool.query(`SELECT service_type, COUNT(*) AS cnt, COALESCE(SUM(claimed_amount),0) AS claimed,
          COALESCE(SUM(approved_amount),0) AS approved, COALESCE(AVG(claimed_amount),0) AS avg_claim
          FROM crm_rfq_claims WHERE rfq_id = $1 GROUP BY service_type ORDER BY claimed DESC`, [rfqId]),
        pool.query(`SELECT TO_CHAR(claim_date,'YYYY-MM') AS month, COUNT(*) AS claims,
          COALESCE(SUM(claimed_amount),0) AS claimed, COALESCE(SUM(approved_amount),0) AS approved
          FROM crm_rfq_claims WHERE rfq_id = $1 AND claim_date IS NOT NULL GROUP BY 1 ORDER BY 1`, [rfqId]),
        pool.query(`SELECT UPPER(TRIM(COALESCE(relationship,'UNKNOWN'))) AS rel, COUNT(*) AS cnt,
          COALESCE(SUM(claimed_amount),0) AS claimed, COUNT(DISTINCT emp_code) AS uniqueEmp
          FROM crm_rfq_claims WHERE rfq_id = $1 GROUP BY 1 ORDER BY claimed DESC`, [rfqId]),
        pool.query(`SELECT age_band, cnt, claimed, approved FROM (
          SELECT CASE WHEN age<18 THEN '0-17' WHEN age<30 THEN '18-29' WHEN age<45 THEN '30-44'
            WHEN age<60 THEN '45-59' WHEN age<75 THEN '60-74' ELSE '75+' END AS age_band,
            COUNT(*) AS cnt, COALESCE(SUM(claimed_amount),0) AS claimed, COALESCE(SUM(approved_amount),0) AS approved
          FROM crm_rfq_claims WHERE rfq_id = $1 AND age IS NOT NULL GROUP BY 1) sub ORDER BY age_band`, [rfqId]),
        pool.query(`SELECT
          CASE WHEN claimed_amount<500 THEN '<500' WHEN claimed_amount<1000 THEN '500-1K'
            WHEN claimed_amount<2500 THEN '1K-2.5K' WHEN claimed_amount<5000 THEN '2.5K-5K'
            WHEN claimed_amount<10000 THEN '5K-10K' WHEN claimed_amount<25000 THEN '10K-25K' ELSE '25K+' END AS band,
          COUNT(*) AS cnt, COALESCE(SUM(claimed_amount),0) AS total
          FROM crm_rfq_claims WHERE rfq_id = $1 GROUP BY 1 ORDER BY MIN(claimed_amount)`, [rfqId]),
      ]);

      const cs = claimsSummary.rows[0];
      const totalClaimsCount = parseInt(cs.total_claims);
      const totalClaimedAmt = parseFloat(cs.total_claimed);
      const totalApprovedAmt = parseFloat(cs.total_approved);
      const uniqueClaimants = parseInt(cs.unique_claimants);

      // Compute policy period in months
      const earliestClaim = new Date(cs.earliest_claim);
      const latestClaim = new Date(cs.latest_claim);
      const policyMonths = Math.max(1, Math.round((latestClaim - earliestClaim) / (30.44 * 24 * 60 * 60 * 1000)));
      const annualizationFactor = 12 / Math.min(policyMonths, 12);

      // Annualized claims
      const annualizedClaimed = totalClaimedAmt * annualizationFactor;
      const annualizedApproved = totalApprovedAmt * annualizationFactor;

      // Per-member-per-year (PMPY) cost
      const pmpyClaimed = annualizedClaimed / totalMembers;
      const pmpyApproved = annualizedApproved / totalMembers;

      // Utilization rate
      const claimsUtilizationRate = uniqueClaimants / totalMembers;

      // Claim frequency per member per year
      const claimFreqPMPY = (totalClaimsCount * annualizationFactor) / totalMembers;

      // Approval ratio
      const approvalRatio = totalClaimedAmt > 0 ? totalApprovedAmt / totalClaimedAmt : 0;

      // Monthly trend for growth rate
      const monthlyData = claimsMonthly.rows;
      let observedTrend = 0;
      if (monthlyData.length >= 4) {
        const half = Math.floor(monthlyData.length / 2);
        const firstHalfAvg = monthlyData.slice(0, half).reduce((s, m) => s + parseFloat(m.claimed), 0) / half;
        const secondHalfAvg = monthlyData.slice(half).reduce((s, m) => s + parseFloat(m.claimed), 0) / (monthlyData.length - half);
        observedTrend = firstHalfAvg > 0 ? (secondHalfAvg - firstHalfAvg) / firstHalfAvg : 0;
      }

      // Service-type breakdown for experience
      const svcExperience = {};
      for (const r of claimsSvcDist.rows) {
        svcExperience[r.service_type] = {
          claim_count: parseInt(r.cnt),
          total_claimed: parseFloat(r.claimed),
          total_approved: parseFloat(r.approved),
          avg_claim: parseFloat(r.avg_claim),
          share: totalClaimedAmt > 0 ? parseFloat(r.claimed) / totalClaimedAmt : 0,
        };
      }

      // Age-band experience for actual risk factors
      const ageBandExperience = {};
      for (const r of claimsAgeDist.rows) {
        ageBandExperience[r.age_band] = {
          claims: parseInt(r.cnt),
          claimed: parseFloat(r.claimed),
          approved: parseFloat(r.approved),
          per_claim: parseInt(r.cnt) > 0 ? parseFloat(r.claimed) / parseInt(r.cnt) : 0,
        };
      }

      // Relationship experience
      const relExperience = {};
      for (const r of claimsRelDist.rows) {
        relExperience[r.rel] = {
          claims: parseInt(r.cnt),
          claimed: parseFloat(r.claimed),
          unique_claimants: parseInt(r.uniqueemp),
        };
      }

      claimsExperience = {
        total_claims: totalClaimsCount,
        total_claimed: Math.round(totalClaimedAmt),
        total_approved: Math.round(totalApprovedAmt),
        unique_claimants: uniqueClaimants,
        policy_months: policyMonths,
        annualization_factor: Math.round(annualizationFactor * 100) / 100,
        annualized_claimed: Math.round(annualizedClaimed),
        annualized_approved: Math.round(annualizedApproved),
        pmpy_claimed: Math.round(pmpyClaimed),
        pmpy_approved: Math.round(pmpyApproved),
        utilization_rate: Math.round(claimsUtilizationRate * 1000) / 10,
        claim_frequency_pmpy: Math.round(claimFreqPMPY * 100) / 100,
        approval_ratio: Math.round(approvalRatio * 1000) / 10,
        avg_claim_size: Math.round(parseFloat(cs.avg_claimed)),
        median_claim: Math.round(parseFloat(cs.median_claim) || 0),
        p90_claim: Math.round(parseFloat(cs.p90_claim) || 0),
        p95_claim: Math.round(parseFloat(cs.p95_claim) || 0),
        max_claim: Math.round(parseFloat(cs.max_claim) || 0),
        observed_trend: Math.round(observedTrend * 1000) / 10,
        service_distribution: svcExperience,
        age_band_experience: ageBandExperience,
        relationship_experience: relExperience,
        severity_distribution: claimsSevDist.rows.map(r => ({ band: r.band, count: parseInt(r.cnt), total: Math.round(parseFloat(r.total)) })),
        monthly_trend: monthlyData.map(m => ({ month: m.month, claims: parseInt(m.claims), claimed: Math.round(parseFloat(m.claimed)), approved: Math.round(parseFloat(m.approved)) })),
      };
    }

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

    // ── City Tier Cost Adjustment ───────────────────────────────────────────
    // Indian healthcare costs vary 25-40% by city tier
    const CITY_TIERS = {
      metro:  { multiplier: 1.00, label: 'Metro',  cities: ['mumbai','delhi','bangalore','bengaluru','chennai','hyderabad','kolkata','pune','new delhi','navi mumbai','thane','gurgaon','gurugram','noida','ghaziabad','faridabad'] },
      tier_1: { multiplier: 0.88, label: 'Tier-1', cities: ['ahmedabad','jaipur','lucknow','chandigarh','kochi','cochin','coimbatore','indore','bhopal','nagpur','visakhapatnam','vizag','patna','vadodara','surat','thiruvananthapuram','trivandrum','mysore','mysuru','mangalore','mangaluru','dehradun','bhubaneswar','ludhiana'] },
      tier_2: { multiplier: 0.75, label: 'Tier-2', cities: ['agra','varanasi','allahabad','prayagraj','meerut','jodhpur','raipur','ranchi','guwahati','jabalpur','udaipur','aurangabad','amritsar','rajkot','madurai','salem','tiruchirappalli','trichy','hubli','belgaum','belagavi','nashik','solapur','kolhapur','guntur','warangal'] },
    };
    let detectedCityTier = 'metro';
    let cityTierMultiplier = 1.0;
    const insuredAddr = (rfq.insured_address || rfq.insured_name || '').toLowerCase();
    for (const [tier, info] of Object.entries(CITY_TIERS)) {
      if (info.cities.some(c => insuredAddr.includes(c))) {
        detectedCityTier = tier;
        cityTierMultiplier = info.multiplier;
        break;
      }
    }

    // OPD unit costs (₹) — Indian benchmarks 2025-26, adjusted for city tier (×${cityTierMultiplier})
    const OPD_UNIT_COSTS = {
      tele_consult: Math.round(500 * cityTierMultiplier),
      physical_consult: Math.round(1000 * cityTierMultiplier),
      specialist_consult: Math.round(1500 * cityTierMultiplier),
      lab_test_avg: Math.round(800 * cityTierMultiplier),
      pharmacy_per_episode: Math.round(600 * cityTierMultiplier),
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

    // ── 2b-POST. Medical Inflation Projection ──────────────────────────────
    // Indian medical inflation: 12-14% CAGR. Project benchmark costs from base year
    // (FY 2025-26 = Apr 2025) forward to the new policy inception date.
    const MEDICAL_INFLATION_ANNUAL = 0.13; // 13% annual (India mid-range)
    const BASE_YEAR_DATE = new Date('2025-04-01');
    const policyStart = rfq.policy_start ? new Date(rfq.policy_start) :
                         rfq.inception_date ? new Date(rfq.inception_date) : new Date();
    const monthsFromBase = Math.max(0, (policyStart - BASE_YEAR_DATE) / (30.44 * 24 * 60 * 60 * 1000));
    const inflationProjectionFactor = Math.pow(1 + MEDICAL_INFLATION_ANNUAL, monthsFromBase / 12);

    if (inflationProjectionFactor > 1.005) {
      totalExpectedOPDClaims *= inflationProjectionFactor;
      totalExpectedWellnessCost *= inflationProjectionFactor;
      for (const band of bandAnalysis) {
        band.expected_opd_cost_per_person = Math.round(band.expected_opd_cost_per_person * inflationProjectionFactor);
        band.expected_opd_total = Math.round(band.expected_opd_total * inflationProjectionFactor);
        band.wellness_cost_per_person = Math.round(band.wellness_cost_per_person * inflationProjectionFactor);
        band.wellness_total = Math.round(band.wellness_total * inflationProjectionFactor);
        band.breakdown.consultation = Math.round(band.breakdown.consultation * inflationProjectionFactor);
        band.breakdown.lab_tests = Math.round(band.breakdown.lab_tests * inflationProjectionFactor);
        band.breakdown.pharmacy = Math.round(band.breakdown.pharmacy * inflationProjectionFactor);
      }
    }

    // ── 2c. Experience Rating & Inflation Adjustment ────────────────────────
    const reasoning = [];
    reasoning.push({
      step: 'Population Analysis',
      detail: `${totalMembers.toLocaleString()} total lives (${totalEmployees.toLocaleString()} employees, ${(totalMembers - totalEmployees).toLocaleString()} dependants). Avg age ${avgAge.toFixed(1)} years. Avg family size ${avgFamilySize.toFixed(1)}.`,
      impact: 'neutral'
    });

    // City tier reasoning
    if (cityTierMultiplier !== 1.0) {
      reasoning.push({
        step: 'City Tier Adjustment',
        detail: `Detected ${CITY_TIERS[detectedCityTier]?.label || detectedCityTier} city from "${rfq.insured_address || rfq.insured_name || 'N/A'}". OPD costs adjusted ×${cityTierMultiplier} vs metro baseline. ${detectedCityTier === 'tier_2' ? 'Significantly lower provider costs in this region.' : 'Moderately lower provider costs vs metro.'}`,
        factor: cityTierMultiplier,
        impact: 'favorable'
      });
    }

    // Medical inflation reasoning
    if (inflationProjectionFactor > 1.005) {
      reasoning.push({
        step: 'Medical Inflation Projection',
        detail: `Policy starts ${policyStart.toISOString().slice(0, 10)}. Benchmark costs (FY 2025-26 base) inflated by ${((inflationProjectionFactor - 1) * 100).toFixed(1)}% to project forward ${Math.round(monthsFromBase)} months at 13% annual medical inflation CAGR.`,
        factor: Math.round(inflationProjectionFactor * 1000) / 1000,
        impact: 'adverse'
      });
    }

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

    // Group size credibility & adverse selection loading
    const groupSizeFactor = totalMembers < 50 ? 1.15 :
      totalMembers < 100 ? 1.08 :
      totalMembers < 500 ? 1.03 :
      totalMembers < 2000 ? 1.00 :
      totalMembers < 5000 ? 0.98 : 0.96;
    reasoning.push({
      step: 'Group Size Factor',
      detail: `${totalMembers.toLocaleString()} total lives. ${totalMembers < 100 ? 'Small group — higher adverse selection risk, loading applied.' : totalMembers < 500 ? 'Medium group — modest loading for limited pooling.' : totalMembers >= 2000 ? 'Large group — favorable pooling economics, slight discount applied.' : 'Standard group size — no adjustment.'}`,
      factor: groupSizeFactor,
      impact: groupSizeFactor > 1.05 ? 'adverse' : groupSizeFactor < 1.0 ? 'favorable' : 'neutral'
    });

    // Data quality reasoning
    if (dataQualityWarnings.length > 0) {
      reasoning.push({
        step: 'Data Quality Alert',
        detail: `Data completeness: ${completenessScore}% (Grade ${dataCompleteness.grade}). ${dataQualityWarnings.length} issue(s): ${dataQualityWarnings.map(w => `${w.missing} missing ${w.field}`).join(', ')}. Pricing reliability may be reduced.`,
        factor: completenessScore / 100,
        impact: completenessScore < 80 ? 'adverse' : 'neutral'
      });
    }

    // ── 2c-EXP. CLAIMS EXPERIENCE-BASED UNDERWRITING ──────────────────────
    let experienceFactor = 1.0;
    let experienceMethod = 'benchmark'; // 'benchmark' or 'experience'
    let experienceBasedPurePremium = null; // if we have claims data, this is the experience-derived pure premium
    let icrMetric = null;
    let experienceCredibility = 0; // 0 to 1 — how much we trust experience vs benchmark

    if (hasClaimsExperience && claimsExperience) {
      experienceMethod = 'experience';
      const ce = claimsExperience;

      // Credibility factor: Bühlmann credibility = min(1, sqrt(N/k)) where k depends on variance
      // For group OPD with >100 claims, credibility is very high
      const k = 500; // credibility threshold — lower means we reach full credibility faster
      experienceCredibility = Math.min(1.0, Math.sqrt(ce.total_claims / k));
      experienceCredibility = Math.max(experienceCredibility, 0.3); // minimum 30% credibility for any claims data

      reasoning.push({
        step: 'Claims Experience Loaded',
        detail: `${ce.total_claims.toLocaleString()} claims analyzed over ${ce.policy_months} months. ` +
          `Total claimed: ₹${ce.total_claimed.toLocaleString()}, Approved: ₹${ce.total_approved.toLocaleString()}. ` +
          `Bühlmann credibility factor: ${(experienceCredibility * 100).toFixed(0)}% — ${experienceCredibility >= 0.8 ? 'HIGH confidence in experience data, will dominate pricing' : experienceCredibility >= 0.5 ? 'MODERATE credibility, blending with benchmarks' : 'LOW volume, supplementing with benchmarks'}.`,
        factor: experienceCredibility,
        impact: 'result'
      });

      // ICR — Incurred Claims Ratio
      // If we have premium data, compute actual ICR
      const premiumPaid = rfq.premium_paid;
      let prevPremium = 0;
      if (premiumPaid && premiumPaid !== 'Details awaited' && !isNaN(parseFloat(String(premiumPaid).replace(/[₹,]/g, '')))) {
        prevPremium = parseFloat(String(premiumPaid).replace(/[₹,]/g, ''));
      }
      if (prevPremium > 0) {
        icrMetric = {
          premium: prevPremium,
          incurred: ce.annualized_approved,
          icr: Math.round(ce.annualized_approved / prevPremium * 1000) / 10,
          verdict: ce.annualized_approved / prevPremium > 0.85 ? 'ADVERSE' :
                   ce.annualized_approved / prevPremium > 0.65 ? 'NORMAL' : 'FAVORABLE',
        };
        reasoning.push({
          step: 'Incurred Claims Ratio (ICR)',
          detail: `Annual premium ₹${prevPremium.toLocaleString()} vs annualized incurred claims ₹${ce.annualized_approved.toLocaleString()}. ` +
            `ICR = ${icrMetric.icr}% — ${icrMetric.verdict}. ` +
            `${icrMetric.icr > 85 ? 'Portfolio is loss-making — significant premium increase required.' : icrMetric.icr > 65 ? 'Normal range — standard inflation adjustment.' : 'Favorable — potential for competitive pricing.'}`,
          factor: icrMetric.icr,
          impact: icrMetric.verdict === 'ADVERSE' ? 'adverse' : icrMetric.verdict === 'FAVORABLE' ? 'favorable' : 'neutral'
        });
      }

      // Utilization analysis
      reasoning.push({
        step: 'Utilization Analysis',
        detail: `${ce.utilization_rate}% of members utilized the policy (${ce.unique_claimants.toLocaleString()} of ${totalMembers.toLocaleString()}). ` +
          `Claim frequency: ${ce.claim_frequency_pmpy} claims/member/year. ` +
          `${ce.utilization_rate > 50 ? 'HIGH utilization — indicates heavy usage pattern, pricing must reflect this.' : ce.utilization_rate > 30 ? 'Moderate utilization — standard OPD pattern.' : 'Low utilization — potential for leaner pricing.'}`,
        factor: ce.utilization_rate,
        impact: ce.utilization_rate > 50 ? 'adverse' : ce.utilization_rate < 25 ? 'favorable' : 'neutral'
      });

      // Service-wise distribution insight
      const topSvc = Object.entries(ce.service_distribution).sort((a, b) => b[1].total_claimed - a[1].total_claimed);
      if (topSvc.length > 0) {
        const svcSummary = topSvc.slice(0, 4).map(([svc, d]) => `${svc}: ₹${d.total_claimed.toLocaleString()} (${Math.round(d.share * 100)}%)`).join(', ');
        reasoning.push({
          step: 'Service-Wise Distribution',
          detail: `Claims breakdown: ${svcSummary}. ${topSvc[0] ? `${topSvc[0][0]} dominates at ${Math.round(topSvc[0][1].share * 100)}% of total claims.` : ''}`,
          impact: 'neutral'
        });
      }

      // Trend analysis
      if (ce.observed_trend !== 0) {
        const trendDir = ce.observed_trend > 0 ? 'increasing' : 'decreasing';
        const trendSeverity = Math.abs(ce.observed_trend) > 20 ? 'sharply' : Math.abs(ce.observed_trend) > 10 ? 'moderately' : 'slightly';
        reasoning.push({
          step: 'Claims Trend Analysis',
          detail: `Claims are ${trendSeverity} ${trendDir} at ${ce.observed_trend > 0 ? '+' : ''}${ce.observed_trend}% (H1 vs H2 comparison). ` +
            `${ce.observed_trend > 15 ? 'Significant upward pressure on renewal pricing.' : ce.observed_trend > 5 ? 'Normal medical inflation visible.' : ce.observed_trend < -5 ? 'Declining trend — favorable for renewal.' : 'Stable claims trajectory.'}`,
          factor: ce.observed_trend,
          impact: ce.observed_trend > 15 ? 'adverse' : ce.observed_trend < -5 ? 'favorable' : 'neutral'
        });
      }

      // Severity analysis
      reasoning.push({
        step: 'Claim Severity Profile',
        detail: `Avg claim ₹${ce.avg_claim_size.toLocaleString()}, Median ₹${ce.median_claim.toLocaleString()}, P90 ₹${ce.p90_claim.toLocaleString()}, P95 ₹${ce.p95_claim.toLocaleString()}, Max ₹${ce.max_claim.toLocaleString()}. ` +
          `${ce.p90_claim > ce.avg_claim_size * 3 ? 'Significant tail risk — a few large claims are pulling the average up.' : 'Distribution is fairly concentrated — limited tail risk.'}`,
        impact: ce.p90_claim > ce.avg_claim_size * 3 ? 'adverse' : 'neutral'
      });

      // ── EXPERIENCE-BASED PURE PREMIUM CALCULATION ────────────────────────
      // The gold standard: use actual PMPY cost, adjusted for trend + inflation + IBNR
      const observedMedicalInflation = Math.max(ce.observed_trend / 100, 0.08); // floor at 8% (India baseline)
      const trendAdjustedPMPY = ce.pmpy_approved * (1 + observedMedicalInflation);
      experienceBasedPurePremium = trendAdjustedPMPY * totalMembers;

      // Experience factor vs benchmarks
      if (totalExpectedOPDClaims > 0) {
        experienceFactor = experienceBasedPurePremium / totalExpectedOPDClaims;
        experienceFactor = Math.max(0.5, Math.min(experienceFactor, 3.0)); // cap at 0.5x to 3.0x

        reasoning.push({
          step: 'Experience vs Benchmark Comparison',
          detail: `Experience PMPY (trend-adjusted): ₹${Math.round(trendAdjustedPMPY).toLocaleString()}/member/year. ` +
            `Benchmark PMPY: ₹${Math.round(totalExpectedOPDClaims / totalMembers).toLocaleString()}/member/year. ` +
            `Experience is ${experienceFactor > 1 ? `${Math.round((experienceFactor - 1) * 100)}% HIGHER` : `${Math.round((1 - experienceFactor) * 100)}% LOWER`} than benchmarks. ` +
            `Using credibility-weighted blend: ${(experienceCredibility * 100).toFixed(0)}% experience + ${((1 - experienceCredibility) * 100).toFixed(0)}% benchmark.`,
          factor: Math.round(experienceFactor * 100) / 100,
          impact: experienceFactor > 1.15 ? 'adverse' : experienceFactor < 0.85 ? 'favorable' : 'neutral'
        });
      }
    } else {
      // No claims experience — pure benchmark pricing
      reasoning.push({
        step: 'Claims Experience',
        detail: `No claims history uploaded. Using industry benchmark actuarial rates (IRDA published data 2024-26). Upload previous year claims MIS for experience-rated pricing.`,
        factor: 1.0,
        impact: 'neutral'
      });

      // Fall back to premium-based experience if available
      const premiumPaid = rfq.premium_paid;
      if (premiumPaid && premiumPaid !== 'Details awaited' && !isNaN(parseFloat(String(premiumPaid).replace(/[₹,]/g, '')))) {
        const prevPremium = parseFloat(String(premiumPaid).replace(/[₹,]/g, ''));
        experienceFactor = 1.13; // 13% medical inflation
        reasoning.push({
          step: 'Premium Inflation Adjustment',
          detail: `Previous premium ₹${prevPremium.toLocaleString()} for ${totalMembers.toLocaleString()} lives. Applying 13% medical inflation (no claims data for experience rating).`,
          factor: 1.13,
          impact: 'adverse'
        });
      } else {
        reasoning.push({
          step: 'Premium History',
          detail: `No previous premium data available. Using pure first-principles actuarial pricing.`,
          factor: 1.0,
          impact: 'neutral'
        });
      }
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
    // Credibility-weighted blend: experience data + benchmark
    // Z * Experience + (1-Z) * Benchmark  where Z = credibility factor
    const Z = experienceCredibility;

    // Composite adjustment factor (for benchmark path)
    const benchmarkCompositeFactor = genderFactor * familySizeFactor * groupSizeFactor *
                            ageConcentrationFactor * ibnrFactor * profitMargin * adminLoading * experienceFactor;

    // Pure premium computation
    let blendedPurePremium;
    if (hasClaimsExperience && experienceBasedPurePremium !== null) {
      // Credibility-weighted blend
      const benchmarkPure = totalExpectedOPDClaims * genderFactor * familySizeFactor * groupSizeFactor * ageConcentrationFactor;
      const experiencePure = experienceBasedPurePremium;
      blendedPurePremium = Z * experiencePure + (1 - Z) * benchmarkPure;
      reasoning.push({
        step: 'Credibility-Weighted Pure Premium',
        detail: `Blended pure premium: ${(Z * 100).toFixed(0)}% × Experience (₹${Math.round(experiencePure).toLocaleString()}) + ` +
          `${((1 - Z) * 100).toFixed(0)}% × Benchmark (₹${Math.round(benchmarkPure).toLocaleString()}) = ₹${Math.round(blendedPurePremium).toLocaleString()}`,
        impact: 'result'
      });
    } else {
      blendedPurePremium = totalExpectedOPDClaims * genderFactor * familySizeFactor * groupSizeFactor * ageConcentrationFactor;
    }

    // Apply loadings
    const pureOPDPremium = blendedPurePremium;
    const loadedOPDPremium = pureOPDPremium * ibnrFactor * profitMargin * adminLoading;
    const compositeFactor = loadedOPDPremium / (totalExpectedOPDClaims || 1);

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
          genderFactor * familySizeFactor * groupSizeFactor * ageConcentrationFactor * experienceFactor;
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

    // ── 3e. LLM UNDERWRITING ASSESSMENT (SIB FastAPI primary path) ─
    // Route underwriting analysis through central llmProvider so SIB controls
    // orchestration and downstream provider fallback behavior.

    let llmAssessment = null;
    try {
      const llmMod = await import('../services/ai-brain/llm-provider.js');
      const llmProvider = llmMod.default;

      const llmPayload = {
        rfq: {
          insured_name: rfq.insured_name,
          policy_type: rfq.policy_type,
          product_type: rfq.product_type,
          existing_insurer: rfq.existing_insurer,
          inception_date: rfq.inception_date,
          expiry_date: rfq.expiry_date,
          premium_paid: rfq.premium_paid,
        },
        population: {
          total_members: totalMembers,
          employees: totalEmployees,
          dependants: totalMembers - totalEmployees,
          avg_age: Math.round(avgAge * 10) / 10,
          avg_family_size: Math.round(avgFamilySize * 10) / 10,
          male_pct: Math.round(maleRatio * 100),
          high_risk_pct_45plus: Math.round(highRiskPct * 100),
        },
        actuarial_results: {
          pure_premium: Math.round(pureOPDPremium),
          loaded_premium: Math.round(loadedOPDPremium),
          per_life: Math.round(loadedOPDPremium / totalMembers),
          per_family: Math.round(loadedOPDPremium / totalEmployees),
          risk_score: overallRiskScore,
          risk_category: riskCategory,
          expected_loss_ratio: expectedLossRatio,
          pricing_method: experienceMethod,
          composite_factor: Math.round(compositeFactor * 1000) / 1000,
        },
        age_band_summary: bandAnalysis.map(b => ({
          band: b.age_band, lives: b.lives, pct: b.pct_of_total,
          risk_factor: b.risk_factor, opd_cost_pp: b.expected_opd_cost_per_person,
        })),
        slab_summary: slabPricing.map(s => ({
          si: s.si_amount, families: s.lives, premium_per_family: s.premium_per_family,
          utilization_cap_pct: s.utilization_cap_pct,
        })),
      };

      // Add claims experience if available
      if (hasClaimsExperience && claimsExperience) {
        llmPayload.claims_experience = {
          total_claims: claimsExperience.total_claims,
          total_claimed: claimsExperience.total_claimed,
          total_approved: claimsExperience.total_approved,
          pmpy_approved: claimsExperience.pmpy_approved,
          utilization_rate: claimsExperience.utilization_rate,
          claim_frequency: claimsExperience.claim_frequency_pmpy,
          approval_ratio: claimsExperience.approval_ratio,
          observed_trend: claimsExperience.observed_trend,
          avg_claim_size: claimsExperience.avg_claim_size,
          median_claim: claimsExperience.median_claim,
          p90_claim: claimsExperience.p90_claim,
          p95_claim: claimsExperience.p95_claim,
          service_distribution: Object.entries(claimsExperience.service_distribution || {}).map(([svc, d]) => ({
            service: svc, share_pct: Math.round(d.share * 100), avg_claim: Math.round(d.avg_claim),
          })),
        };
        if (icrMetric) {
          llmPayload.claims_experience.icr = icrMetric.icr;
          llmPayload.claims_experience.icr_verdict = icrMetric.verdict;
        }
      }

      // Build the underwriting prompt
      const llmQuestion = `You are an expert insurance underwriter and actuary specializing in Indian group health insurance (OPD, GMC, GPA).
You are reviewing an RFQ and the actuarial engine's computed pricing. Provide a detailed underwriting assessment.

RESPOND IN JSON FORMAT ONLY with this exact structure:
{
  "executive_summary": "2-3 sentence summary of the risk and recommended action",
  "risk_insights": [
    {"title": "...", "detail": "...", "severity": "high|medium|low"}
  ],
  "pricing_commentary": "Detailed paragraph on whether the computed premium is adequate, aggressive, or conservative and why",
  "claims_commentary": "If claims data present, analyze ICR, utilization, trends, red flags. If no claims data, state that experience rating was not possible",
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ],
  "negotiation_range": {
    "floor_premium_per_family": <number>,
    "recommended_premium_per_family": <number>,
    "ceiling_premium_per_family": <number>,
    "rationale": "Why this range"
  },
  "special_conditions": ["Suggested policy conditions or exclusions"],
  "confidence_level": "high|medium|low",
  "confidence_rationale": "Why this confidence level"
}

Consider Indian market specifics: medical inflation 12-14%, pharmacy dominance in OPD, seasonal patterns (monsoon spike), regional provider cost variations, IRDA regulations.
Do NOT include markdown formatting. Return valid JSON only.

Here is the RFQ data to analyze:
${JSON.stringify(llmPayload, null, 2)}${supplementalContext ? `\n\n${supplementalContext}` : ''}`;

      const llmRes = await llmProvider.chat({
        messages: [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: llmQuestion },
        ],
        maxTokens: 1600,
        temperature: 0.2,
        responseFormat: { type: 'json_object' },
        forceProvider: 'sib',
        skipCache: true,
      });

      const fullAnswer = (llmRes?.content || '').trim();

      if (fullAnswer) {
        // Parse JSON from LLM response — handle potential markdown code blocks
        let cleanContent = fullAnswer.trim();
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        try {
          llmAssessment = JSON.parse(cleanContent);
          reasoning.push({
            step: 'AI Underwriting Assessment',
            detail: llmAssessment.executive_summary || 'LLM underwriting analysis completed.',
            impact: llmAssessment.confidence_level === 'high' ? 'result' :
                    llmAssessment.confidence_level === 'low' ? 'adverse' : 'neutral'
          });
        } catch (parseErr) {
          // If JSON parse fails, still use the raw text
          llmAssessment = { executive_summary: cleanContent, raw: true };
          reasoning.push({
            step: 'AI Underwriting Assessment',
            detail: cleanContent.substring(0, 300),
            impact: 'neutral'
          });
        }
      }
      console.log(`[CRM AI Quote] LLM assessment ${llmAssessment ? 'received' : 'empty'} via ${llmRes?.provider || 'unknown'}`);
    } catch (llmErr) {
      console.warn(`[CRM AI Quote] LLM call failed: ${llmErr.message}. Proceeding without LLM assessment.`);
      reasoning.push({
        step: 'AI Underwriting Assessment',
        detail: `Insurance LLM unavailable — actuarial model pricing stands as-is. Error: ${llmErr.message}`,
        impact: 'neutral'
      });
    }
const aiQuoteResult = {
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

        // Data quality assessment
        data_quality: dataCompleteness,

        // Pricing adjustments applied
        pricing_adjustments: {
          city_tier: { detected: detectedCityTier, label: CITY_TIERS[detectedCityTier]?.label || 'Metro', multiplier: cityTierMultiplier, source: rfq.insured_address || rfq.insured_name || 'N/A' },
          medical_inflation: { annual_rate_pct: Math.round(MEDICAL_INFLATION_ANNUAL * 100), projection_months: Math.round(monthsFromBase), factor: Math.round(inflationProjectionFactor * 1000) / 1000, policy_start: policyStart.toISOString().slice(0, 10), base_year: '2025-26' },
          group_size: { lives: totalMembers, factor: groupSizeFactor },
        },

        // Risk assessment
        risk_assessment: {
          overall_score: overallRiskScore,
          category: riskCategory,
          age_concentration_factor: ageConcentrationFactor,
          gender_factor: Math.round(genderFactor * 1000) / 1000,
          family_size_factor: familySizeFactor,
          group_size_factor: groupSizeFactor,
          composite_factor: Math.round(compositeFactor * 1000) / 1000,
          pricing_method: experienceMethod,
          credibility_factor: Math.round(experienceCredibility * 100),
          icr: icrMetric,
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

        // Claims experience data (if available)
        claims_experience: claimsExperience,


        // LLM underwriting assessment (from isha-inc.com iSHA Insurance LLM)
        llm_assessment: {
          executive_summary: llmAssessment?.executive_summary || 'No LLM assessment available.',
          risk_insights: Array.isArray(llmAssessment?.risk_insights) ? llmAssessment.risk_insights : [],
          pricing_commentary: llmAssessment?.pricing_commentary || 'No pricing commentary.',
          claims_commentary: llmAssessment?.claims_commentary || 'No claims commentary.',
          recommendations: Array.isArray(llmAssessment?.recommendations) ? llmAssessment.recommendations : [],
          negotiation_range: llmAssessment?.negotiation_range || {
            floor_premium_per_family: null,
            recommended_premium_per_family: null,
            ceiling_premium_per_family: null,
            rationale: 'No negotiation range provided.'
          },
          special_conditions: Array.isArray(llmAssessment?.special_conditions) ? llmAssessment.special_conditions : [],
          confidence_level: llmAssessment?.confidence_level || 'unknown',
          confidence_rationale: llmAssessment?.confidence_rationale || 'No rationale provided.',
          raw: llmAssessment?.raw || false
        },

        // Supplemental inputs used in this generation
        supplemental_inputs: {
          has_additional_context: !!additionalContext.trim(),
          files_processed: uploadedFiles.map(f => ({ name: f.originalname, type: f.mimetype, size: f.size })),
          context_length: supplementalContext.length,
        },

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
            `Pricing Method: ${experienceMethod === 'experience' ? 'EXPERIENCE-RATED (claims history analyzed)' : 'BENCHMARK-BASED (no claims data)'}\n` +
            (icrMetric ? `Incurred Claims Ratio: ${icrMetric.icr}% (${icrMetric.verdict})\n` : '') +
            (hasClaimsExperience && claimsExperience ? `Claims Data: ${claimsExperience.total_claims.toLocaleString()} claims, Utilization ${claimsExperience.utilization_rate}%\n` : '') +
            `Risk Score: ${overallRiskScore}/100 (${riskCategory})\n` +
            `Expected Loss Ratio: ${expectedLossRatio}%\n` +
            `City Tier: ${CITY_TIERS[detectedCityTier]?.label || 'Metro'} (cost multiplier ${cityTierMultiplier})\n` +
            (inflationProjectionFactor > 1.005 ? `Medical Inflation: +${((inflationProjectionFactor - 1) * 100).toFixed(1)}% projected to ${policyStart.toISOString().slice(0, 10)}\n` : '') +
            `Data Quality: Grade ${dataCompleteness.grade} (${completenessScore}% complete)\n` +
            `Population: ${totalMembers.toLocaleString()} lives, avg age ${avgAge.toFixed(1)}\n` +
            `Pricing basis: ${experienceMethod === 'experience' ? 'Credibility-weighted experience + benchmark blend' : 'Floater per-family, age-banded actuarial model'} with IBNR & margin loading.`,
        },

        // ── Mediqzy Margin Pricing (tentative client-quote prices) ──
        // Shows what to charge the corporate/insurer for Mediqzy to make 10–30% margin
        mediqzy_pricing: (() => {
          const basePremium = Math.round(totalPremium);
          const basePerLife = Math.round(totalPerLife);
          const basePerFamily = Math.round(totalPerFamily);
          const tiers = [10, 15, 20, 25, 30].map(marginPct => {
            const multiplier = 1 + marginPct / 100;
            return {
              margin_pct: marginPct,
              total_premium: Math.round(basePremium * multiplier),
              per_life: Math.round(basePerLife * multiplier),
              per_family: Math.round(basePerFamily * multiplier),
              mediqzy_revenue: Math.round(basePremium * multiplier) - basePremium,
              effective_margin: marginPct,
              slab_pricing: slabPricing.map(s => ({
                slab: s.slab,
                lives: s.lives,
                base_premium_per_family: s.premium_per_family,
                quoted_premium_per_family: Math.round(s.premium_per_family * multiplier),
                margin_per_family: Math.round(s.premium_per_family * multiplier) - s.premium_per_family,
              })),
            };
          });
          return {
            actuarial_cost: basePremium,
            actuarial_per_life: basePerLife,
            actuarial_per_family: basePerFamily,
            tiers,
            recommended_tier: tiers.find(t => t.margin_pct === 20), // 20% is sweet spot
          };
        })(),
      }
    };

    // Persist AI quote result + inferred industry to DB (survives page refreshes — replaces sessionStorage handoff)
    // Save only the inner data payload (not the outer success wrapper) so the frontend can use it directly
    await sharedPool.query(
      `UPDATE crm_rfqs SET ai_quote_data = $1, industry = COALESCE(industry, $2), updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(aiQuoteResult.data), inferIndustry(rfq.insured_name), rfqId]
    );

    return res.status(200).json(aiQuoteResult);
  } catch (error) {
    console.error('[CRM AI Quote Generate]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'AI quote generation failed: ' + error.message });
  }
});

// ─── Upload Claims History ───────────────────────────────────────────────────
// Accepts claims MIS Excel/CSV with flexible column mapping
router.post('/rfqs/:id/upload-claims', authCRM, upload.single('file'), async (req, res) => {
  try {
    const rfqId = req.params.id;
    const rfqCheck = await sharedPool.query(`SELECT id FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqCheck.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Claims Excel/CSV file required' });

    const workbook = await XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    // Find claims sheet — typically the largest sheet or one with "claim" in name
    let claimsSheet = null;
    let claimsSheetName = '';
    for (const name of workbook.SheetNames) {
      if (name.toLowerCase().includes('claim') || name.toLowerCase().includes('mis') || name.toLowerCase().includes('dump')) {
        claimsSheet = workbook.Sheets[name];
        claimsSheetName = name;
        break;
      }
    }
    if (!claimsSheet) {
      // Use the sheet with most rows
      let maxRows = 0;
      for (const name of workbook.SheetNames) {
        const ws = workbook.Sheets[name];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        if (range.e.r > maxRows) { maxRows = range.e.r; claimsSheet = ws; claimsSheetName = name; }
      }
    }
    if (!claimsSheet) return res.status(400).json({ success: false, message: 'No claims data found in uploaded file' });

    const rows = XLSX.utils.sheet_to_json(claimsSheet, { defval: null });
    if (!rows.length) return res.status(400).json({ success: false, message: 'No claims rows found' });

    // Flexible column mapping for claims — supports various insurer/TPA formats
    const trunc = (v, n) => (v ? v.toString().substring(0, n) : null);
    const colMap = (row) => {
      const keys = Object.keys(row);
      const find = (patterns) => {
        for (const p of patterns) {
          const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p));
          if (k) return row[k];
        }
        return null;
      };
      const parseDate = (v) => stdParseDate(v);
      const parseNum = (v) => stdParseAmount(v);
      return {
        claim_number:    trunc(find(['claimno', 'claimnumber', 'claimid', 'claimref', 'intimationno', 'claimrefno']), 200),
        emp_code:        trunc((find(['empcode', 'employeecode', 'empid', 'employeeid', 'empno', 'employeeno', 'memberid', 'policyholderid']) || '').toString(), 50),
        employee_name:   trunc(find(['employeename', 'empname', 'membername', 'insuredname', 'patientname', 'claimantname']), 255),
        relationship:    trunc(find(['relationship', 'relation', 'relationType', 'dependentrelation']), 50),
        gender:          trunc(find(['gender', 'sex']), 10),
        age:             parseInt(find(['age', 'ageatclaim', 'claimantage'])) || null,
        claim_date:      parseDate(find(['claimdate', 'dateofclaim', 'treatmentdate', 'servicedate', 'admissiondate', 'incurreddate', 'intimationdate', 'visitdate'])),
        service_type:    trunc(find(['servicetype', 'claimtype', 'treatmenttype', 'benefittype', 'service', 'typeofclaim', 'typeofservice', 'category', 'procedure']), 100),
        service_category:trunc(find(['servicecategory', 'category', 'subcategory', 'department', 'speciality', 'specialty']), 100),
        diagnosis:       trunc(find(['diagnosis', 'ailment', 'diseasegroup', 'icd', 'icdcode', 'diagnosisname', 'natureofillness']), 500),
        provider_name:   trunc(find(['providername', 'hospitalname', 'clinicname', 'networkprovider', 'labname', 'pharmacyname', 'vendor']), 255),
        provider_type:   trunc(find(['providertype', 'networktype', 'network', 'cashless', 'reimbursement']), 100),
        claimed_amount:  parseNum(find(['claimedamount', 'claimamount', 'billedamount', 'totalclaim', 'amountclaimed', 'grossclaim', 'incurredamount'])),
        approved_amount: parseNum(find(['approvedamount', 'settledamount', 'sanctionedamount', 'paidamount', 'netpayable', 'admissibleamount'])),
        paid_amount:     parseNum(find(['paidamount', 'netpaid', 'disbursedamount', 'settledamount', 'amountpaid'])),
        rejection_reason:trunc(find(['rejectionreason', 'reason', 'remarks', 'closurereason', 'denialreason']), 255),
        claim_status:    trunc(find(['claimstatus', 'status', 'claimstate']), 100),
        policy_year:     trunc(find(['policyyear', 'policyperiod', 'year', 'policyterm']), 50),
        si_amount:       parseNum(find(['suminsured', 'siamount', 'si', 'coveramount'])),
        band:            trunc(find(['band', 'grade', 'level', 'category']), 100),
      };
    };

    // Build all claim rows first, then replace atomically in a transaction
    let inserted = 0;
    const stats = newCleaningStats();
    const batchSize = 500;
    const allClaimBatches = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);  // claims batch (rows not deduped — keep all claims)
      const values = []; const placeholders = [];
      let pIdx = 1;
      for (const raw of batch) {
        const c = colMap(raw);
        // ── AI Data Standardization ──
        const cleanGender = stdGender(c.gender);
        if (c.gender && cleanGender !== c.gender) stats.gender++;
        const cleanRel = stdRelationship(c.relationship);
        if (c.relationship && cleanRel !== c.relationship) stats.relationship++;
        const cleanEmp = stdEmpCode(c.emp_code);
        if (c.emp_code && cleanEmp !== c.emp_code) stats.emp_code++;
        const cleanStatus = stdClaimStatus(c.claim_status);
        if (c.claim_status && cleanStatus !== c.claim_status) stats.claim_status++;
        const claimDate = stdParseDate(c.claim_date) || c.claim_date;
        if (c.claim_date && claimDate !== c.claim_date) stats.date_fixed++;
        // Standardize service type with fallback inference
        let svcType = stdServiceType(c.service_type);
        if (!svcType) {
          const allVals = Object.values(raw).join(' ').toLowerCase();
          if (allVals.includes('pharmac') || allVals.includes('medicine')) svcType = 'Pharmacy';
          else if (allVals.includes('lab') || allVals.includes('diagnostic') || allVals.includes('pathology') || allVals.includes('radiology')) svcType = 'Lab/Diagnostic';
          else if (allVals.includes('consult') || allVals.includes('doctor') || allVals.includes('opd visit')) svcType = 'Consultation';
          else if (allVals.includes('wellness') || allVals.includes('health check') || allVals.includes('preventive')) svcType = 'Wellness';
          else svcType = 'Other';
        }
        if (c.service_type && svcType !== (c.service_type || '').trim()) stats.service_type++;
        values.push(rfqId, c.claim_number, cleanEmp, c.employee_name, cleanRel, cleanGender,
          c.age, claimDate, svcType, c.service_category, c.diagnosis, c.provider_name, c.provider_type,
          c.claimed_amount, c.approved_amount, c.paid_amount, c.rejection_reason, cleanStatus,
          c.policy_year, c.si_amount, c.band);
        placeholders.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13},$${pIdx+14},$${pIdx+15},$${pIdx+16},$${pIdx+17},$${pIdx+18},$${pIdx+19},$${pIdx+20})`);
        pIdx += 21;
        inserted++;
      }
      if (placeholders.length > 0) {
        allClaimBatches.push({ values, placeholders });
      }
    }

    // Validate emp_codes against crm_rfq_members (warn on orphan claims)
    let orphanEmpCodes = [];
    try {
      const claimEmpCodes = [...new Set(
        allClaimBatches.flatMap(b => {
          const chunk = [];
          for (let i = 2; i < b.values.length; i += 21) chunk.push(b.values[i]);
          return chunk;
        }).filter(Boolean)
      )];
      if (claimEmpCodes.length > 0) {
        const memberEmpRes = await sharedPool.query(
          `SELECT DISTINCT emp_code FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]
        );
        const memberEmpSet = new Set(memberEmpRes.rows.map(r => r.emp_code).filter(Boolean));
        orphanEmpCodes = claimEmpCodes.filter(ec => !memberEmpSet.has(ec)).slice(0, 20);
      }
    } catch (_) { /* non-fatal validation */ }

    // Atomic replace: DELETE then INSERT in a single transaction
    const claimTxClient = await sharedPool.connect();
    try {
      await claimTxClient.query('BEGIN');
      await claimTxClient.query(`DELETE FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]);
      for (const { values, placeholders } of allClaimBatches) {
        await claimTxClient.query(
          `INSERT INTO crm_rfq_claims (rfq_id, claim_number, emp_code, employee_name, relationship, gender,
            age, claim_date, service_type, service_category, diagnosis, provider_name, provider_type,
            claimed_amount, approved_amount, paid_amount, rejection_reason, claim_status,
            policy_year, si_amount, band)
           VALUES ${placeholders.join(',')}`, values
        );
      }
      await claimTxClient.query('COMMIT');
    } catch (txErr) {
      await claimTxClient.query('ROLLBACK');
      claimTxClient.release();
      throw txErr;
    }
    claimTxClient.release();

    console.log(`[CRM Upload Claims] RFQ ${rfqId}: ${inserted} claims, cleaned: ${JSON.stringify(stats)}`);
    await uploadRfqFile(req.file.buffer, req.file.originalname, rfqId, 'claims', req.crmUser.id);
    return res.status(200).json({
      success: true,
      message: `Uploaded ${inserted} claims from sheet "${claimsSheetName}" — AI cleaned & standardized`,
      data: {
        claimCount: inserted, sheetName: claimsSheetName, cleaning: stats,
        warnings: orphanEmpCodes.length > 0
          ? [`${orphanEmpCodes.length} emp_code(s) in claims not found in member list — cross-check: ${orphanEmpCodes.slice(0,5).join(', ')}${orphanEmpCodes.length > 5 ? '...' : ''}`]
          : [],
      }
    });
  } catch (error) {
    console.error('[CRM Claims Upload]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to upload claims: ' + error.message });
  }
});

// ─── Claims Experience Analysis ──────────────────────────────────────────────
// Deep actuarial analysis of claims history for underwriting
router.get('/rfqs/:id/claims-analysis', authCRM, async (req, res) => {
  try {
    const rfqId = req.params.id;
    const pool = sharedPool;

    // Check if claims data exists
    const countRes = await pool.query(`SELECT COUNT(*) AS total FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]);
    const totalClaims = parseInt(countRes.rows[0].total);
    if (totalClaims === 0) {
      return res.status(200).json({ success: true, data: null, message: 'No claims data uploaded yet' });
    }

    // Fetch RFQ for context
    const rfqRes = await pool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    const rfq = rfqRes.rows[0];
    const memberCountRes = await pool.query(`SELECT COUNT(*) AS total, COUNT(DISTINCT emp_code) AS employees FROM crm_rfq_members WHERE rfq_id = $1`, [rfqId]);
    const totalMembers = parseInt(memberCountRes.rows[0].total) || 1;
    const totalEmployees = parseInt(memberCountRes.rows[0].employees) || 1;

    // Run all analytics queries in parallel
    const [
      summaryRes, serviceRes, monthlyRes, relationRes, ageBandRes,
      topDiagRes, statusRes, providerTypeRes, severityRes,
      topClaimantsRes, repeatClaimRes, siUtilRes
    ] = await Promise.all([
      // 1. Overall claims summary
      pool.query(`SELECT 
        COUNT(*) AS total_claims,
        COUNT(DISTINCT emp_code) AS unique_claimants,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved,
        COALESCE(SUM(paid_amount), 0) AS total_paid,
        COALESCE(AVG(claimed_amount), 0) AS avg_claimed,
        COALESCE(AVG(approved_amount), 0) AS avg_approved,
        MAX(claimed_amount) AS max_claim,
        MIN(claim_date) AS earliest_claim,
        MAX(claim_date) AS latest_claim,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY claimed_amount) AS median_claim,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY claimed_amount) AS p90_claim,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY claimed_amount) AS p95_claim,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY claimed_amount) AS p99_claim
        FROM crm_rfq_claims WHERE rfq_id = $1`, [rfqId]),

      // 2. Service-type distribution
      pool.query(`SELECT 
        service_type,
        COUNT(*) AS claim_count,
        COUNT(DISTINCT emp_code) AS unique_claimants,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved,
        COALESCE(AVG(claimed_amount), 0) AS avg_per_claim,
        COALESCE(AVG(approved_amount), 0) AS avg_approved_per_claim
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY service_type ORDER BY total_claimed DESC`, [rfqId]),

      // 3. Monthly trend
      pool.query(`SELECT 
        TO_CHAR(claim_date, 'YYYY-MM') AS month,
        COUNT(*) AS claims,
        COALESCE(SUM(claimed_amount), 0) AS claimed,
        COALESCE(SUM(approved_amount), 0) AS approved,
        COUNT(DISTINCT emp_code) AS claimants
        FROM crm_rfq_claims WHERE rfq_id = $1 AND claim_date IS NOT NULL
        GROUP BY month ORDER BY month`, [rfqId]),

      // 4. Relationship-wise utilization
      pool.query(`SELECT 
        UPPER(TRIM(COALESCE(relationship, 'UNKNOWN'))) AS relationship,
        COUNT(*) AS claim_count,
        COUNT(DISTINCT emp_code) AS unique_claimants,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved,
        COALESCE(AVG(claimed_amount), 0) AS avg_per_claim
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY relationship ORDER BY total_claimed DESC`, [rfqId]),

      // 5. Age-band claims analysis
      pool.query(`SELECT age_band, claim_count, total_claimed, total_approved, avg_per_claim FROM (
        SELECT 
          CASE WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
               WHEN age < 60 THEN '45-59' WHEN age < 75 THEN '60-74' ELSE '75+' END AS age_band,
          COUNT(*) AS claim_count,
          COALESCE(SUM(claimed_amount), 0) AS total_claimed,
          COALESCE(SUM(approved_amount), 0) AS total_approved,
          COALESCE(AVG(claimed_amount), 0) AS avg_per_claim
        FROM crm_rfq_claims WHERE rfq_id = $1 AND age IS NOT NULL
        GROUP BY 1
      ) sub ORDER BY age_band`, [rfqId]),

      // 6. Top diagnoses
      pool.query(`SELECT 
        COALESCE(diagnosis, 'Unspecified') AS diagnosis,
        COUNT(*) AS claim_count,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY diagnosis ORDER BY total_claimed DESC LIMIT 15`, [rfqId]),

      // 7. Claim status distribution
      pool.query(`SELECT 
        UPPER(TRIM(COALESCE(claim_status, 'UNKNOWN'))) AS status,
        COUNT(*) AS count,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY 1 ORDER BY count DESC`, [rfqId]),

      // 8. Provider type (cashless vs reimbursement)
      pool.query(`SELECT 
        UPPER(TRIM(COALESCE(provider_type, 'UNKNOWN'))) AS provider_type,
        COUNT(*) AS claims,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY provider_type ORDER BY claims DESC`, [rfqId]),

      // 9. Claim severity distribution
      pool.query(`SELECT 
        CASE 
          WHEN claimed_amount < 500 THEN '< ₹500'
          WHEN claimed_amount < 1000 THEN '₹500-1K'
          WHEN claimed_amount < 2500 THEN '₹1K-2.5K'
          WHEN claimed_amount < 5000 THEN '₹2.5K-5K'
          WHEN claimed_amount < 10000 THEN '₹5K-10K'
          WHEN claimed_amount < 25000 THEN '₹10K-25K'
          ELSE '₹25K+'
        END AS severity_band,
        COUNT(*) AS count,
        COALESCE(SUM(claimed_amount), 0) AS total
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY 1 ORDER BY MIN(claimed_amount)`, [rfqId]),

      // 10. Top claimants (repeat utilizers)
      pool.query(`SELECT 
        emp_code, employee_name, relationship,
        COUNT(*) AS claim_count,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved
        FROM crm_rfq_claims WHERE rfq_id = $1
        GROUP BY emp_code, employee_name, relationship
        ORDER BY total_claimed DESC LIMIT 20`, [rfqId]),

      // 11. Repeat claimant frequency
      pool.query(`SELECT freq_band, COUNT(*) AS cnt FROM (
        SELECT
          CASE WHEN cc = 1 THEN '1 claim' WHEN cc <= 3 THEN '2-3 claims'
               WHEN cc <= 5 THEN '4-5 claims' WHEN cc <= 10 THEN '6-10 claims'
               ELSE '10+ claims' END AS freq_band
        FROM (SELECT emp_code, COUNT(*) AS cc FROM crm_rfq_claims WHERE rfq_id = $1 GROUP BY emp_code) sub
      ) sub2 GROUP BY freq_band ORDER BY cnt DESC`, [rfqId]),

      // 12. SI utilization rate
      pool.query(`SELECT 
        emp_code,
        COALESCE(MAX(si_amount), 0) AS si,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        CASE WHEN MAX(si_amount) > 0 THEN ROUND(SUM(claimed_amount) / MAX(si_amount) * 100, 1) ELSE 0 END AS utilization_pct
        FROM crm_rfq_claims WHERE rfq_id = $1 AND si_amount > 0
        GROUP BY emp_code
        ORDER BY utilization_pct DESC`, [rfqId]),
    ]);

    const s = summaryRes.rows[0];
    const totalClaimed = parseFloat(s.total_claimed) || 0;
    const totalApproved = parseFloat(s.total_approved) || 0;
    const totalPaid = parseFloat(s.total_paid) || 0;
    const uniqueClaimants = parseInt(s.unique_claimants) || 0;

    // Compute derived metrics
    const utilizationRate = (uniqueClaimants / totalMembers * 100);
    const claimFrequency = totalClaims / totalMembers;
    const approvalRatio = totalClaimed > 0 ? (totalApproved / totalClaimed * 100) : 0;

    // Claims per month trend
    const months = monthlyRes.rows;
    let monthOverMonthGrowth = [];
    for (let i = 1; i < months.length; i++) {
      const prevClaimed = parseFloat(months[i-1].claimed) || 1;
      const currClaimed = parseFloat(months[i].claimed) || 0;
      monthOverMonthGrowth.push({
        month: months[i].month,
        growth_pct: Math.round((currClaimed - prevClaimed) / prevClaimed * 100),
      });
    }
    const avgMonthlyGrowth = monthOverMonthGrowth.length > 0
      ? monthOverMonthGrowth.reduce((s, m) => s + m.growth_pct, 0) / monthOverMonthGrowth.length : 0;

    // Annualized trend (if we have > 6 months of data)
    let annualizedTrend = null;
    if (months.length >= 6) {
      const firstHalf = months.slice(0, Math.floor(months.length / 2));
      const secondHalf = months.slice(Math.floor(months.length / 2));
      const firstTotal = firstHalf.reduce((s, m) => s + parseFloat(m.claimed), 0);
      const secondTotal = secondHalf.reduce((s, m) => s + parseFloat(m.claimed), 0);
      const monthsInHalf = firstHalf.length;
      const annualizedFirst = firstTotal / monthsInHalf * 12;
      const annualizedSecond = secondTotal / secondHalf.length * 12;
      annualizedTrend = annualizedFirst > 0
        ? Math.round((annualizedSecond - annualizedFirst) / annualizedFirst * 100) : 0;
    }

    // SI utilization distribution
    const siUtilRows = siUtilRes.rows;
    const siUtilBands = { '0-25%': 0, '25-50%': 0, '50-75%': 0, '75-100%': 0, '>100%': 0 };
    let avgSIUtil = 0;
    for (const r of siUtilRows) {
      const pct = parseFloat(r.utilization_pct);
      avgSIUtil += pct;
      if (pct > 100) siUtilBands['>100%']++;
      else if (pct > 75) siUtilBands['75-100%']++;
      else if (pct > 50) siUtilBands['50-75%']++;
      else if (pct > 25) siUtilBands['25-50%']++;
      else siUtilBands['0-25%']++;
    }
    avgSIUtil = siUtilRows.length > 0 ? avgSIUtil / siUtilRows.length : 0;

    // Service-type concentration (Herfindahl Index)
    const serviceShares = serviceRes.rows.map(r => {
      const share = totalClaimed > 0 ? parseFloat(r.total_claimed) / totalClaimed : 0;
      return { ...r, share, share_pct: Math.round(share * 1000) / 10 };
    });
    const herfindahl = serviceShares.reduce((s, r) => s + r.share * r.share, 0);

    // Underwriting flags
    const flags = [];
    if (utilizationRate > 50) flags.push({ type: 'warning', message: `High utilization rate (${utilizationRate.toFixed(1)}%) — exceeds 50% threshold` });
    if (avgSIUtil > 60) flags.push({ type: 'warning', message: `High SI exhaustion (${avgSIUtil.toFixed(1)}% avg) — consider increasing SI or premium` });
    if (siUtilBands['>100%'] > uniqueClaimants * 0.05) flags.push({ type: 'critical', message: `${siUtilBands['>100%']} members exceeded their SI — indicates underpricing or adverse selection` });
    if (approvalRatio < 70) flags.push({ type: 'info', message: `Low approval ratio (${approvalRatio.toFixed(1)}%) — high claim rejection, verify exclusion alignment` });
    if (annualizedTrend !== null && annualizedTrend > 20) flags.push({ type: 'critical', message: `Escalating claims trend (+${annualizedTrend}% annualized) — significant deterioration` });
    if (herfindahl > 0.5) flags.push({ type: 'info', message: `Concentrated service utilization (HHI ${(herfindahl * 100).toFixed(0)}) — ${serviceShares[0]?.service_type || 'top service'} dominates` });

    // Large loss analysis — claims > 2x median
    const medianClaim = parseFloat(s.median_claim) || 0;
    const largeLossThreshold = Math.max(medianClaim * 3, 5000);
    const largeLosses = totalClaims > 0 ? {
      threshold: largeLossThreshold,
      // Will compute on the fly
    } : null;

    // Relationship utilization rate (against member population)
    const relMemberRes = await pool.query(`SELECT UPPER(TRIM(COALESCE(NULLIF(TRIM(relationship),''), relation_type))) AS rel, COUNT(*) AS count FROM crm_rfq_members WHERE rfq_id = $1 GROUP BY 1`, [rfqId]);
    const relMemberMap = {};
    for (const r of relMemberRes.rows) relMemberMap[r.rel] = parseInt(r.count);

    const relationAnalysis = relationRes.rows.map(r => {
      const memberCount = relMemberMap[r.relationship] || relMemberMap[r.relationship?.replace('IN_LAW', 'IN LAW')] || 0;
      return {
        relationship: r.relationship,
        claim_count: parseInt(r.claim_count),
        unique_claimants: parseInt(r.unique_claimants),
        member_count: memberCount,
        utilization_rate: memberCount > 0 ? Math.round(parseInt(r.unique_claimants) / memberCount * 1000) / 10 : 0,
        total_claimed: parseFloat(r.total_claimed),
        total_approved: parseFloat(r.total_approved),
        avg_per_claim: Math.round(parseFloat(r.avg_per_claim)),
        claims_per_claimant: parseInt(r.unique_claimants) > 0 ? Math.round(parseInt(r.claim_count) / parseInt(r.unique_claimants) * 10) / 10 : 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        // Header
        rfq_id: parseInt(rfqId),
        total_members: totalMembers,
        total_employees: totalEmployees,

        // Core metrics
        summary: {
          total_claims: totalClaims,
          unique_claimants: uniqueClaimants,
          total_claimed: Math.round(totalClaimed),
          total_approved: Math.round(totalApproved),
          total_paid: Math.round(totalPaid),
          avg_claim_size: Math.round(parseFloat(s.avg_claimed)),
          median_claim: Math.round(medianClaim),
          p90_claim: Math.round(parseFloat(s.p90_claim) || 0),
          p95_claim: Math.round(parseFloat(s.p95_claim) || 0),
          p99_claim: Math.round(parseFloat(s.p99_claim) || 0),
          max_claim: Math.round(parseFloat(s.max_claim) || 0),
          earliest_claim: s.earliest_claim,
          latest_claim: s.latest_claim,
        },

        // Underwriting KPIs
        kpis: {
          utilization_rate: Math.round(utilizationRate * 10) / 10,
          claim_frequency: Math.round(claimFrequency * 100) / 100,
          approval_ratio: Math.round(approvalRatio * 10) / 10,
          avg_si_utilization: Math.round(avgSIUtil * 10) / 10,
          annualized_trend: annualizedTrend,
          avg_monthly_growth: Math.round(avgMonthlyGrowth * 10) / 10,
          service_concentration_hhi: Math.round(herfindahl * 100),
        },

        // Distributions
        service_distribution: serviceShares.map(r => ({
          service_type: r.service_type,
          claim_count: parseInt(r.claim_count),
          unique_claimants: parseInt(r.unique_claimants),
          total_claimed: Math.round(parseFloat(r.total_claimed)),
          total_approved: Math.round(parseFloat(r.total_approved)),
          avg_per_claim: Math.round(parseFloat(r.avg_per_claim)),
          share_pct: r.share_pct,
        })),

        monthly_trend: months.map(m => ({
          month: m.month,
          claims: parseInt(m.claims),
          claimed: Math.round(parseFloat(m.claimed)),
          approved: Math.round(parseFloat(m.approved)),
          claimants: parseInt(m.claimants),
        })),
        month_over_month_growth: monthOverMonthGrowth,

        relationship_analysis: relationAnalysis,

        age_band_claims: ageBandRes.rows.map(r => ({
          age_band: r.age_band,
          claim_count: parseInt(r.claim_count),
          total_claimed: Math.round(parseFloat(r.total_claimed)),
          total_approved: Math.round(parseFloat(r.total_approved)),
          avg_per_claim: Math.round(parseFloat(r.avg_per_claim)),
        })),

        claim_status_distribution: statusRes.rows.map(r => ({
          status: r.status,
          count: parseInt(r.count),
          total_claimed: Math.round(parseFloat(r.total_claimed)),
          total_approved: Math.round(parseFloat(r.total_approved)),
        })),

        provider_type_distribution: providerTypeRes.rows.map(r => ({
          type: r.provider_type,
          claims: parseInt(r.claims),
          total_claimed: Math.round(parseFloat(r.total_claimed)),
          total_approved: Math.round(parseFloat(r.total_approved)),
        })),

        severity_distribution: severityRes.rows.map(r => ({
          band: r.severity_band,
          count: parseInt(r.count),
          total: Math.round(parseFloat(r.total)),
        })),

        top_diagnoses: topDiagRes.rows.map(r => ({
          diagnosis: r.diagnosis,
          claim_count: parseInt(r.claim_count),
          total_claimed: Math.round(parseFloat(r.total_claimed)),
          total_approved: Math.round(parseFloat(r.total_approved)),
        })),

        top_claimants: topClaimantsRes.rows.map(r => ({
          emp_code: r.emp_code,
          name: r.employee_name,
          relationship: r.relationship,
          claim_count: parseInt(r.claim_count),
          total_claimed: Math.round(parseFloat(r.total_claimed)),
          total_approved: Math.round(parseFloat(r.total_approved)),
        })),

        repeat_claimant_freq: repeatClaimRes.rows.map(r => ({
          band: r.freq_band,
          count: parseInt(r.cnt),
        })),

        si_utilization: {
          avg_pct: Math.round(avgSIUtil * 10) / 10,
          distribution: siUtilBands,
        },

        // Underwriting flags
        underwriting_flags: flags,
      }
    });
  } catch (error) {
    console.error('[CRM Claims Analysis]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Claims analysis failed: ' + error.message });
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

    // Validate premium and rate bounds
    const premiumNum = parseFloat(total_premium) || 0;
    if (premiumNum <= 0) {
      return res.status(400).json({ success: false, message: 'Total premium must be greater than zero before saving a quote.' });
    }
    const commissionNum = parseFloat(commission_pct) || 0;
    if (commissionNum < 0 || commissionNum > 30) {
      return res.status(400).json({ success: false, message: 'Commission % must be between 0 and 30.' });
    }
    const discountNum = parseFloat(discount_pct) || 0;
    if (discountNum < 0 || discountNum > 50) {
      return res.status(400).json({ success: false, message: 'Discount % must be between 0 and 50.' });
    }
    const gstNum = parseFloat(gst_pct) ?? 18;
    if (gstNum < 0 || gstNum > 28) {
      return res.status(400).json({ success: false, message: 'GST % must be between 0 and 28.' });
    }

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

// ─── Get Single Quote ────────────────────────────────────────────────────────
router.get('/quotes/:id', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT * FROM crm_quotes WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Quote not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch quote' }); }
});

// ─── Update Quote ────────────────────────────────────────────────────────────
router.put('/quotes/:id', authCRM, async (req, res) => {
  try {
    const {
      status, valid_until, total_premium, total_lives, per_life_cost, per_family_cost,
      pricing_model, commission_pct, gst_pct, discount_pct,
      coverage_details, slab_pricing, terms, notes
    } = req.body;

    const VALID_QUOTE_STATUSES = ['draft', 'sent', 'negotiating', 'accepted', 'rejected'];
    if (status && !VALID_QUOTE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid quote status: ${status}. Allowed: ${VALID_QUOTE_STATUSES.join(', ')}` });
    }

    // Validate state-machine transition before mutating
    if (status) {
      const { rows: curr } = await sharedPool.query(`SELECT status FROM crm_quotes WHERE id = $1`, [req.params.id]);
      if (!curr.length) return res.status(404).json({ success: false, message: 'Quote not found' });
      const ALLOWED_TRANSITIONS = {
        draft:       ['sent', 'negotiating'],
        sent:        ['negotiating', 'accepted', 'rejected'],
        negotiating: ['sent', 'accepted', 'rejected'],
        accepted:    [],
        rejected:    [],
      };
      const currentStatus = curr[0].status;
      if (currentStatus !== status && !ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
        return res.status(400).json({ success: false, message: `Cannot transition quote from '${currentStatus}' to '${status}'` });
      }
    }

    const sentAt = status === 'sent' ? 'sent_at = NOW(),' : '';
    const { rows } = await sharedPool.query(
      `UPDATE crm_quotes SET
        status = COALESCE($1, status), valid_until = COALESCE($2, valid_until),
        total_premium = COALESCE($3, total_premium), total_lives = COALESCE($4, total_lives),
        per_life_cost = COALESCE($5, per_life_cost), per_family_cost = COALESCE($6, per_family_cost),
        pricing_model = COALESCE($7, pricing_model), commission_pct = COALESCE($8, commission_pct),
        gst_pct = COALESCE($9, gst_pct), discount_pct = COALESCE($10, discount_pct),
        coverage_details = COALESCE($11, coverage_details), slab_pricing = COALESCE($12, slab_pricing),
        terms = COALESCE($13, terms), notes = COALESCE($14, notes),
        ${sentAt} updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [status, valid_until, total_premium, total_lives, per_life_cost, per_family_cost,
        pricing_model, commission_pct, gst_pct, discount_pct,
        coverage_details ? JSON.stringify(coverage_details) : null,
        slab_pricing ? JSON.stringify(slab_pricing) : null,
        terms, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Quote not found' });

    // Declared at handler scope so all branches can reference it in the response
    let emailResult = null;

    // Drive RFQ status from quote status transitions
    if (status === 'sent') {
      // sent → rfq becomes 'quoted' only from received/quoting; never revert from negotiating
      await sharedPool.query(`UPDATE crm_rfqs SET status = 'quoted', updated_at = NOW() WHERE id = $1 AND status IN ('received','quoting')`, [rows[0].rfq_id]);

      // ── Email notification on quote send ──────────────────────────────────
      emailResult = { sent: false, recipients: null, error: null };
      try {
        const { rows: rfqRows } = await sharedPool.query(
          `SELECT insured_name, rfq_number, broker_name, broker_email, member_count
           FROM crm_rfqs WHERE id = $1`,
          [rows[0].rfq_id]
        );
        if (rfqRows.length) {
          const rfq = rfqRows[0];
          const q   = rows[0];
          const recipients = rfq.broker_email || null;
          if (recipients) {
            emailResult.recipients = recipients;
            const fmtCurrency = v => v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'N/A';
            const validUntil  = q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-IN') : 'N/A';
            const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
  <div style="background:#1e40af;color:#fff;padding:24px 28px">
    <h2 style="margin:0;font-size:20px">Health Insurance Quote</h2>
    <p style="margin:4px 0 0;opacity:0.85;font-size:14px">RFQ #${rfq.rfq_number}</p>
  </div>
  <div style="padding:28px">
    <p style="margin:0 0 16px;color:#374151">Dear ${rfq.broker_name || 'Valued Partner'},</p>
    <p style="margin:0 0 20px;color:#374151">We are pleased to share our health insurance quote for <strong>${rfq.insured_name}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f3f4f6"><td style="padding:10px 14px;font-size:13px;color:#6b7280;width:40%">Insured Name</td><td style="padding:10px 14px;font-size:14px;color:#111827;font-weight:600">${rfq.insured_name}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Total Lives</td><td style="padding:10px 14px;font-size:14px;color:#111827;font-weight:600">${q.total_lives || rfq.member_count || 'N/A'}</td></tr>
      <tr style="background:#f3f4f6"><td style="padding:10px 14px;font-size:13px;color:#6b7280">Total Premium</td><td style="padding:10px 14px;font-size:14px;color:#1e40af;font-weight:700">${fmtCurrency(q.total_premium)}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Per Life Cost</td><td style="padding:10px 14px;font-size:14px;color:#111827">${fmtCurrency(q.per_life_cost)}</td></tr>
      <tr style="background:#f3f4f6"><td style="padding:10px 14px;font-size:13px;color:#6b7280">Pricing Model</td><td style="padding:10px 14px;font-size:14px;color:#111827">${q.pricing_model || 'N/A'}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280">Valid Until</td><td style="padding:10px 14px;font-size:14px;color:#111827">${validUntil}</td></tr>
      ${q.terms ? `<tr style="background:#f3f4f6"><td style="padding:10px 14px;font-size:13px;color:#6b7280">Terms</td><td style="padding:10px 14px;font-size:13px;color:#374151">${q.terms}</td></tr>` : ''}
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:12px">This quote is subject to underwriting terms and conditions. For queries, please reply to this email.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb">
    <p style="margin:0;font-size:12px;color:#9ca3af">Mediqzy Health Insurance Platform &bull; This is an automated notification.</p>
  </div>
</div>
</body></html>`;
            await sendCRMEmail({
              to:      recipients,
              subject: `Quote for ${rfq.insured_name} (RFQ #${rfq.rfq_number})`,
              html,
              text: `Dear ${rfq.broker_name || 'Partner'},\n\nPlease find the health insurance quote for ${rfq.insured_name} (RFQ #${rfq.rfq_number}).\n\nTotal Premium: ${fmtCurrency(q.total_premium)}\nTotal Lives: ${q.total_lives || rfq.member_count || 'N/A'}\nValid Until: ${validUntil}\n\nRegards,\nMediqzy Team`,
            });
            emailResult.sent = true;
          }
        }
      } catch (e) {
        emailResult.error = e.message;
        console.warn('[CRM] Quote sent email error:', e.message);
      }
    }
    if (status === 'negotiating') {
      await sharedPool.query(`UPDATE crm_rfqs SET status = 'negotiating', updated_at = NOW() WHERE id = $1 AND status IN ('quoted')`, [rows[0].rfq_id]);
    }
    if (status === 'accepted') {
      // Advance RFQ to won; guard to quoted/negotiating so a stale re-accept can't reopen a lost deal
      await sharedPool.query(`UPDATE crm_rfqs SET status = 'won', updated_at = NOW() WHERE id = $1 AND status IN ('quoted','negotiating')`, [rows[0].rfq_id]);
    }
    if (status === 'rejected') {
      const { lost_reason } = req.body;
      // Mark RFQ lost only when no other active (sent/negotiating) quotes remain
      const { rows: activeQuotes } = await sharedPool.query(
        `SELECT COUNT(*) FROM crm_quotes WHERE rfq_id = $1 AND id != $2 AND status IN ('sent','negotiating')`,
        [rows[0].rfq_id, rows[0].id]
      );
      if (parseInt(activeQuotes[0].count) === 0) {
        await sharedPool.query(`UPDATE crm_rfqs SET status = 'lost', lost_reason = COALESCE($2, lost_reason), updated_at = NOW() WHERE id = $1`, [rows[0].rfq_id, lost_reason || null]);
      }
    }

    return res.status(200).json({ success: true, data: rows[0], email: emailResult });
  } catch (error) { console.error('[CRM Quote Update]', error.message); return res.status(500).json({ success: false, message: 'Failed to update quote' }); }
});

// ─── Delete Quote ────────────────────────────────────────────────────────────
router.delete('/quotes/:id', authCRM, async (req, res) => {
  try {
    // Fetch quote before deleting so we can revert RFQ status if needed
    const { rows: quoteRows } = await sharedPool.query(`SELECT rfq_id, status FROM crm_quotes WHERE id = $1`, [req.params.id]);
    if (!quoteRows.length) return res.status(404).json({ success: false, message: 'Quote not found' });
    const { rfq_id, status: deletedStatus } = quoteRows[0];

    await sharedPool.query(`DELETE FROM crm_quotes WHERE id = $1`, [req.params.id]);

    // Revert RFQ status if the deleted quote was the only 'sent' quote
    if (deletedStatus === 'sent' || deletedStatus === 'negotiating') {
      const { rows: remainingQuotes } = await sharedPool.query(
        `SELECT COUNT(*) AS cnt FROM crm_quotes WHERE rfq_id = $1 AND status IN ('sent','negotiating','accepted')`, [rfq_id]
      );
      if (parseInt(remainingQuotes[0].cnt) === 0) {
        // No more sent/negotiating quotes — revert rfq to 'quoting' if it was quoted
        await sharedPool.query(`UPDATE crm_rfqs SET status = 'quoting', updated_at = NOW() WHERE id = $1 AND status IN ('quoted','negotiating')`, [rfq_id]);
      }
    }

    return res.status(200).json({ success: true, message: 'Quote deleted' });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to delete quote' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION — AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/agents', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, channelType, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (search) { params.push(`%${search}%`); conditions.push(`(a.name ILIKE $${params.length} OR a.email ILIKE $${params.length} OR a.agent_code ILIKE $${params.length})`); }
    if (channelType) { params.push(channelType); conditions.push(`a.channel_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);
    const [{ rows }, { rows: cnt }, { rows: statsRows }] = await Promise.all([
      sharedPool.query(`SELECT a.*, ag.name AS agency_name FROM crm_agents a LEFT JOIN crm_agencies ag ON ag.id = a.agency_id ${where} ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      sharedPool.query(`SELECT COUNT(*) FROM crm_agents a ${where}`, params.slice(0, -2)),
      sharedPool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COALESCE(SUM(pending_payout),0) AS pending_payout, COALESCE(SUM(total_earned),0) AS total_paid FROM crm_agents`),
    ]);
    const total = parseInt(cnt[0].count);
    return res.json({ success: true, data: rows, pagination: { total, totalPages: Math.ceil(total / parseInt(limit)), page: parseInt(page) }, stats: { total: parseInt(statsRows[0].total), active: parseInt(statsRows[0].active), pendingPayout: parseFloat(statsRows[0].pending_payout), totalPaid: parseFloat(statsRows[0].total_paid) } });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/agents', authCRM, [body('name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { name, email, phone, city, channelType = 'IFA', agentCode, agencyId, notes } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_agents (name, email, phone, city, channel_type, agent_code, agency_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, email || null, phone || null, city || null, channelType, agentCode || null, agencyId || null, notes || null, req.crmUser?.id || null]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.put('/agents/:id', authCRM, async (req, res) => {
  try {
    const { name, email, phone, city, channelType, agentCode, agencyId, status, notes, totalActivations, totalEarned, pendingPayout } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_agents SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone), city=COALESCE($4,city),
       channel_type=COALESCE($5,channel_type), agent_code=COALESCE($6,agent_code), agency_id=COALESCE($7,agency_id),
       status=COALESCE($8,status), notes=COALESCE($9,notes), total_activations=COALESCE($10,total_activations),
       total_earned=COALESCE($11,total_earned), pending_payout=COALESCE($12,pending_payout), updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name, email, phone, city, channelType, agentCode, agencyId || null, status, notes, totalActivations, totalEarned, pendingPayout, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Agent not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/agents/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_agents WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Agent not found' });
    return res.json({ success: true, message: 'Agent deleted' });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION — AGENCIES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/agencies', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tier } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR owner_name ILIKE $${params.length} OR territory ILIKE $${params.length})`); }
    // tier filter maps to activation thresholds
    if (tier === 'Bronze') { conditions.push(`monthly_activations >= 10 AND monthly_activations < 50`); }
    else if (tier === 'Silver') { conditions.push(`monthly_activations >= 50 AND monthly_activations < 100`); }
    else if (tier === 'Gold') { conditions.push(`monthly_activations >= 100 AND monthly_activations < 200`); }
    else if (tier === 'Platinum') { conditions.push(`monthly_activations >= 200`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);
    const [{ rows }, { rows: cnt }, { rows: statsRows }] = await Promise.all([
      sharedPool.query(`SELECT * FROM crm_agencies ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      sharedPool.query(`SELECT COUNT(*) FROM crm_agencies ${where}`, params.slice(0, -2)),
      sharedPool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active, COALESCE(SUM(monthly_activations),0) AS total_activations, COALESCE(SUM(total_override),0) AS total_override FROM crm_agencies`),
    ]);
    const total = parseInt(cnt[0].count);
    return res.json({ success: true, data: rows, pagination: { total, totalPages: Math.ceil(total / parseInt(limit)), page: parseInt(page) }, stats: { total: parseInt(statsRows[0].total), active: parseInt(statsRows[0].active), totalActivations: parseInt(statsRows[0].total_activations), totalOverride: parseFloat(statsRows[0].total_override) } });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/agencies', authCRM, [body('name').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { name, ownerName, email, phone, city, territory, gstin, notes } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_agencies (name, owner_name, email, phone, city, territory, gstin, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, ownerName || null, email || null, phone || null, city || null, territory || null, gstin || null, notes || null, req.user.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.put('/agencies/:id', authCRM, async (req, res) => {
  try {
    const { name, ownerName, email, phone, city, territory, gstin, onboardingStep, status, monthlyActivations, agentCount, totalOverride, notes } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_agencies SET name=COALESCE($1,name), owner_name=COALESCE($2,owner_name), email=COALESCE($3,email),
       phone=COALESCE($4,phone), city=COALESCE($5,city), territory=COALESCE($6,territory), gstin=COALESCE($7,gstin),
       onboarding_step=COALESCE($8,onboarding_step), status=COALESCE($9,status),
       monthly_activations=COALESCE($10,monthly_activations), agent_count=COALESCE($11,agent_count),
       total_override=COALESCE($12,total_override), notes=COALESCE($13,notes), updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [name, ownerName, email, phone, city, territory, gstin, onboardingStep, status, monthlyActivations, agentCount, totalOverride, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Agency not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/agencies/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_agencies WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Agency not found' });
    return res.json({ success: true, message: 'Agency deleted' });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION — COMMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/commissions', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, status, planCode } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (search) { params.push(`%${search}%`); conditions.push(`(c.agent_name ILIKE $${params.length} OR c.subscriber_name ILIKE $${params.length} OR c.agent_code ILIKE $${params.length})`); }
    if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }
    if (planCode) { params.push(planCode); conditions.push(`c.plan_code = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);
    const [{ rows }, { rows: cnt }, { rows: sumRows }] = await Promise.all([
      sharedPool.query(`SELECT c.* FROM crm_commissions c ${where} ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      sharedPool.query(`SELECT COUNT(*) FROM crm_commissions c ${where}`, params.slice(0, -2)),
      sharedPool.query(`SELECT
        COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) AS total_pending,
        COALESCE(SUM(amount) FILTER (WHERE status='approved'),0) AS total_approved,
        COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) AS total_paid,
        COALESCE(SUM(amount) FILTER (WHERE status='clawback'),0) AS clawbacks
        FROM crm_commissions`),
    ]);
    const total = parseInt(cnt[0].count);
    return res.json({
      success: true, data: rows,
      pagination: { total, totalPages: Math.ceil(total / parseInt(limit)), page: parseInt(page) },
      summary: { totalPending: parseFloat(sumRows[0].total_pending), totalApproved: parseFloat(sumRows[0].total_approved), totalPaid: parseFloat(sumRows[0].total_paid), clawbacks: parseFloat(sumRows[0].clawbacks), nextPayoutDate: '15 May 2026' }
    });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/commissions', authCRM, async (req, res) => {
  try {
    const { agentId, agentCode, agentName, subscriberName, subscriberPhone, subscriberEmail, planCode, amount, commissionType = 'y1', activationDate, eligibleDate, notes } = req.body;
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_commissions (agent_id, agent_code, agent_name, subscriber_name, subscriber_phone, subscriber_email, plan_code, amount, commission_type, activation_date, eligible_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [agentId || null, agentCode || null, agentName || null, subscriberName || null, subscriberPhone || null, subscriberEmail || null, planCode || null, amount, commissionType, activationDate || null, eligibleDate || null, notes || null, req.user.id]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.put('/commissions/:id', authCRM, async (req, res) => {
  try {
    const { status, paidAt, clawbackReason, notes } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_commissions SET status=COALESCE($1,status), paid_at=COALESCE($2,paid_at), clawback_reason=COALESCE($3,clawback_reason), notes=COALESCE($4,notes), updated_at=NOW() WHERE id=$5 RETURNING *`,
      [status, paidAt || null, clawbackReason || null, notes || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Commission record not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORPORATE HEALTH PLANS
// ═══════════════════════════════════════════════════════════════════════════════

// Auto-generate contract ref: <INITIALS>-<YEAR>-<SEQ>
async function generateContractRef(corporateName, planYear) {
  const initials = corporateName.split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 4);
  const { rows } = await sharedPool.query(
    `SELECT COUNT(*) FROM crm_corporate_health_plans WHERE plan_year = $1`, [planYear]
  );
  const seq = String(parseInt(rows[0].count) + 1).padStart(3, '0');
  return `${initials}-${planYear}-${seq}`;
}

router.get('/corporate-plans', authCRM, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, planYear, corporateId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = []; const params = [];
    if (search) { params.push(`%${search}%`); conditions.push(`(p.display_name ILIKE $${params.length} OR p.corporate_name ILIKE $${params.length} OR p.contract_ref ILIKE $${params.length})`); }
    if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
    if (planYear) { params.push(parseInt(planYear)); conditions.push(`p.plan_year = $${params.length}`); }
    if (corporateId) { params.push(parseInt(corporateId)); conditions.push(`p.corporate_id = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);
    const [{ rows }, { rows: cnt }, { rows: sumRows }] = await Promise.all([
      sharedPool.query(
        `SELECT p.*, prev.display_name AS renewal_of_name, r.rfq_number
         FROM crm_corporate_health_plans p
         LEFT JOIN crm_corporate_health_plans prev ON prev.id = p.renewal_of_id
         LEFT JOIN crm_rfqs r ON r.id = p.rfq_id
         ${where} ORDER BY p.plan_year DESC, p.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      sharedPool.query(`SELECT COUNT(*) FROM crm_corporate_health_plans p ${where}`, params.slice(0, -2)),
      sharedPool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active, COALESCE(SUM(employee_headcount),0) AS total_lives, COALESCE(SUM(employee_headcount * COALESCE(negotiated_price_per_emp,0) * 12),0) AS total_acv FROM crm_corporate_health_plans`),
    ]);
    const total = parseInt(cnt[0].count);
    return res.json({
      success: true, data: rows,
      pagination: { total, totalPages: Math.ceil(total / parseInt(limit)), page: parseInt(page) },
      stats: { total: parseInt(sumRows[0].total), active: parseInt(sumRows[0].active), totalLives: parseInt(sumRows[0].total_lives), totalAcv: Math.round(parseFloat(sumRows[0].total_acv)) }
    });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/corporate-plans', authCRM, [body('corporateName').notEmpty(), body('planTemplateCode').optional(), body('displayName').notEmpty()], async (req, res) => {
  try {
    const { corporateId, corporateName, planTemplateCode, displayName, planYear = new Date().getFullYear(), planGrade, negotiatedPricePerEmp, employeeHeadcount, corporateShare = 100, employeeShare = 0, startDate, endDate, renewalOfId, notes, rfqId } = req.body;
    const contractRef = await generateContractRef(corporateName, planYear);
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_corporate_health_plans
       (corporate_id, corporate_name, plan_template_code, display_name, plan_year, plan_grade, contract_ref, negotiated_price_per_emp, employee_headcount, corporate_share, employee_share, start_date, end_date, status, renewal_of_id, notes, rfq_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16,$17) RETURNING *`,
      [corporateId || null, corporateName, planTemplateCode || null, displayName, planYear, planGrade || null, contractRef, negotiatedPricePerEmp || null, employeeHeadcount || 0, corporateShare, employeeShare, startDate || null, endDate || null, renewalOfId || null, notes || null, rfqId ? parseInt(rfqId) : null, req.user.id]
    );
    // Mark the RFQ as won if creating a plan from it
    if (rfqId) {
      await sharedPool.query(`UPDATE crm_rfqs SET status='won', updated_at=NOW() WHERE id=$1 AND status NOT IN ('won','lost')`, [parseInt(rfqId)]);
    }
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.put('/corporate-plans/:id', authCRM, async (req, res) => {
  try {
    const { corporateName, planTemplateCode, displayName, planYear, planGrade, negotiatedPricePerEmp, employeeHeadcount, corporateShare, employeeShare, startDate, endDate, status, notes, contractDocUrl } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_corporate_health_plans SET
       corporate_name=COALESCE($1,corporate_name), plan_template_code=COALESCE($2,plan_template_code),
       display_name=COALESCE($3,display_name), plan_year=COALESCE($4,plan_year), plan_grade=COALESCE($5,plan_grade),
       negotiated_price_per_emp=COALESCE($6,negotiated_price_per_emp), employee_headcount=COALESCE($7,employee_headcount),
       corporate_share=COALESCE($8,corporate_share), employee_share=COALESCE($9,employee_share),
       start_date=COALESCE($10,start_date), end_date=COALESCE($11,end_date),
       status=COALESCE($12,status), notes=COALESCE($13,notes), contract_doc_url=COALESCE($14,contract_doc_url),
       updated_at=NOW() WHERE id=$15 RETURNING *`,
      [corporateName, planTemplateCode, displayName, planYear, planGrade, negotiatedPricePerEmp, employeeHeadcount, corporateShare, employeeShare, startDate, endDate, status, notes, contractDocUrl, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Corporate plan not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// Renew a plan: clone it with incremented year
router.post('/corporate-plans/:id/renew', authCRM, async (req, res) => {
  try {
    const { rows: existing } = await sharedPool.query(`SELECT * FROM crm_corporate_health_plans WHERE id = $1`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Plan not found' });
    const src = existing[0];
    const newYear = (src.plan_year || new Date().getFullYear()) + 1;
    const newDisplayName = src.display_name.replace(/\d{4}/, newYear.toString());
    const contractRef = await generateContractRef(src.corporate_name, newYear);
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_corporate_health_plans
       (corporate_id, corporate_name, plan_template_code, display_name, plan_year, plan_grade, contract_ref, negotiated_price_per_emp, employee_headcount, corporate_share, employee_share, start_date, end_date, status, renewal_of_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$15,$16) RETURNING *`,
      [src.corporate_id, src.corporate_name, src.plan_template_code, newDisplayName, newYear, src.plan_grade, contractRef, src.negotiated_price_per_emp, src.employee_headcount, src.corporate_share, src.employee_share, null, null, src.id, src.notes, req.user.id]
    );
    return res.status(201).json({ success: true, data: rows[0], message: `Renewal plan created for ${newYear}` });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/corporate-plans/:id', authCRM, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_corporate_health_plans WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Corporate plan not found' });
    return res.json({ success: true, message: 'Corporate plan deleted' });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── Autocapture Plan from RFQ ─────────────────────────────────────────────
// Reads all RFQ fields and auto-generates a uniquely named corporate plan.
// Plan name format: "<InuredName> – <ProductType> Plan FY<YYYY>"
// e.g.  "Tata Steel Ltd – GMC+OPD Plan FY2026"
router.post('/rfqs/:id/autocapture-plan', authCRM, async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id);
    if (!rfqId || isNaN(rfqId)) return res.status(400).json({ success: false, message: 'Invalid RFQ ID' });

    const { rows: [rfq] } = await sharedPool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfq) return res.status(404).json({ success: false, message: 'RFQ not found' });

    // Check no plan already exists for this RFQ
    const { rows: existing } = await sharedPool.query(
      `SELECT id, display_name, contract_ref FROM crm_corporate_health_plans WHERE rfq_id = $1 LIMIT 1`, [rfqId]
    );
    if (existing.length) {
      return res.json({ success: true, data: existing[0], alreadyCaptured: true,
        message: `Plan already exists: ${existing[0].display_name} (${existing[0].contract_ref})` });
    }

    // Best accepted/sent quote for pricing
    const { rows: quoteRows } = await sharedPool.query(
      `SELECT total_premium, per_life_cost, per_family_cost, commission_pct FROM crm_quotes
       WHERE rfq_id = $1 AND status NOT IN ('draft','rejected') ORDER BY total_premium DESC LIMIT 1`, [rfqId]
    );
    const bestQuote = quoteRows[0] || null;

    // ── Build unique plan display name ─────────────────────────────────────
    const corporate = (rfq.insured_name || 'Unknown Corp').trim();
    const year = rfq.policy_start ? new Date(rfq.policy_start).getFullYear() : new Date().getFullYear();
    const fyLabel = `FY${year}`;

    // Derive product label from product_type / coverage_scope / policy_type
    let productLabel = '';
    if (rfq.product_type) {
      const pt = rfq.product_type.toUpperCase();
      if (pt.includes('OPD') && (pt.includes('GMC') || pt.includes('GHI'))) productLabel = 'GMC+OPD';
      else if (pt.includes('OPD')) productLabel = 'OPD';
      else if (pt.includes('GMC')) productLabel = 'GMC';
      else if (pt.includes('GHI')) productLabel = 'GHI';
      else if (pt.includes('GAI')) productLabel = 'GAI';
      else if (pt.includes('WELLNESS')) productLabel = 'Wellness';
      else productLabel = rfq.product_type;
    } else if (rfq.policy_type) {
      productLabel = rfq.policy_type.replace(/group\s*/i, '').trim() || 'Health';
    } else {
      productLabel = 'Health';
    }

    const displayName = `${corporate} – ${productLabel} Plan ${fyLabel}`;

    // ── Derive pricing ───────────────────────────────────────────────────────
    const employeeHeadcount = rfq.member_count || 0;
    let negotiatedPricePerEmp = null;
    if (bestQuote?.per_life_cost) {
      negotiatedPricePerEmp = parseFloat(bestQuote.per_life_cost);
    } else if (bestQuote?.total_premium && employeeHeadcount > 0) {
      negotiatedPricePerEmp = parseFloat(bestQuote.total_premium) / employeeHeadcount;
    } else if (rfq.premium_paid && employeeHeadcount > 0) {
      negotiatedPricePerEmp = parseFloat(rfq.premium_paid) / employeeHeadcount;
    }

    // ── Plan template code ───────────────────────────────────────────────────
    const ptUpper = (rfq.product_type || 'OPD').toUpperCase();
    let planTemplateCode = 'OPD-STD';
    if (ptUpper.includes('GMC') && ptUpper.includes('OPD')) planTemplateCode = 'GMC-OPD-COMBO';
    else if (ptUpper.includes('GMC')) planTemplateCode = 'GMC-STD';
    else if (ptUpper.includes('GHI')) planTemplateCode = 'GHI-STD';
    else if (ptUpper.includes('GAI')) planTemplateCode = 'GAI-STD';
    else if (ptUpper.includes('WELLNESS')) planTemplateCode = 'WELLNESS-STD';

    const contractRef = await generateContractRef(corporate, year);

    // ── Coverage notes summary ────────────────────────────────────────────────
    const autoNotes = [
      `Auto-captured from RFQ ${rfq.rfq_number} on ${new Date().toLocaleDateString('en-IN')}.`,
      rfq.existing_insurer ? `Previous insurer: ${rfq.existing_insurer}.` : '',
      rfq.industry ? `Industry: ${rfq.industry}.` : '',
      rfq.required_coverages ? `Required coverages: ${rfq.required_coverages.slice(0, 200)}.` : '',
      bestQuote ? `Best quoted premium: ₹${parseFloat(bestQuote.total_premium || 0).toLocaleString('en-IN')}.` : '',
    ].filter(Boolean).join(' ');

    const { rows: [plan] } = await sharedPool.query(
      `INSERT INTO crm_corporate_health_plans
       (corporate_name, plan_template_code, display_name, plan_year, contract_ref,
        negotiated_price_per_emp, employee_headcount, corporate_share, employee_share,
        start_date, end_date, status, notes, rfq_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,100,0,$8,$9,'draft',$10,$11,$12) RETURNING *`,
      [corporate, planTemplateCode, displayName, year, contractRef,
       negotiatedPricePerEmp ? Math.round(negotiatedPricePerEmp) : null,
       employeeHeadcount,
       rfq.policy_start || null, rfq.policy_end || null,
       autoNotes, rfqId, req.user.id]
    );

    // Mark RFQ as won if it was quoted/negotiating
    if (['quoted', 'negotiating', 'quoting'].includes(rfq.status)) {
      await sharedPool.query(
        `UPDATE crm_rfqs SET status='won', updated_at=NOW() WHERE id=$1`, [rfqId]
      );
    }

    return res.status(201).json({
      success: true, data: plan,
      message: `Plan "${displayName}" created with ref ${contractRef}`,
    });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ─── RFQ Autocapture Inbox — RFQs eligible to be captured as plans ─────────
// Returns quoted/won RFQs that have no corporate plan yet
router.get('/rfqs-autocapture-inbox', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`
      SELECT r.id, r.rfq_number, r.insured_name, r.status, r.member_count,
             r.product_type, r.policy_start, r.premium_paid,
             COALESCE(q.total_premium, 0) AS best_quoted_premium,
             r.created_at
      FROM crm_rfqs r
      LEFT JOIN crm_quotes q ON q.rfq_id = r.id AND q.status NOT IN ('draft','rejected')
      WHERE r.status IN ('quoted','negotiating','won')
        AND NOT EXISTS (SELECT 1 FROM crm_corporate_health_plans p WHERE p.rfq_id = r.id)
      ORDER BY r.updated_at DESC
      LIMIT 20
    `);
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
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

// ─── RFQ Dashboard Stats ────────────────────────────────────────────────────
router.get('/rfqs-stats', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE r.status = 'received') AS received,
      COUNT(*) FILTER (WHERE r.status = 'quoting') AS quoting,
      COUNT(*) FILTER (WHERE r.status = 'quoted') AS quoted,
      COUNT(*) FILTER (WHERE r.status = 'negotiating') AS negotiating,
      COUNT(*) FILTER (WHERE r.status = 'won') AS won,
      COUNT(*) FILTER (WHERE r.status = 'lost') AS lost,
      COUNT(*) FILTER (WHERE r.created_at >= NOW() - INTERVAL '7 days') AS this_week,
      COALESCE(SUM(q.total_premium), 0) AS total_quoted_premium
      FROM crm_rfqs r
      LEFT JOIN crm_quotes q ON q.rfq_id = r.id AND q.status NOT IN ('draft','rejected')`);
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: 'Failed to fetch RFQ stats' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DEEP ANALYTICS ENGINE — Predictive Modelling, Claim Forecasting, Risk Scoring
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /rfqs/:id/deep-analytics
 * Multi-model predictive analytics for CRM underwriting intelligence:
 *  1. Product-wise risk analysis (GHI, GAI, OPD, Wellness, GMC)
 *  2. Age-band claim forecasting (1yr, 3yr, 5yr projections)
 *  3. Employee attrition impact modelling
 *  4. Disease trend analysis & future claim prediction
 *  5. Employee-level risk scoring (heat map tiers)
 *  6. Severity-frequency portfolio cohort model
 *  7. Industry-sector actuarial benchmarking
 */
router.get('/rfqs/:id/deep-analytics', authCRM, async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id);
    if (!rfqId || isNaN(rfqId)) return res.status(400).json({ success: false, message: 'Invalid RFQ ID' });

    const pool = sharedPool;

    // ── Load RFQ ──────────────────────────────────────────────────────────────
    const rfqRes = await pool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];
    const memberCount = parseInt(rfq.member_count) || 0;

    // ── Parallel data loads ───────────────────────────────────────────────────
    const [memberRes, claimsRes, bandDistRes, genderDistRes, tenureDistRes, siDistRes] = await Promise.all([
      // Full member dataset for actuarial modelling
      pool.query(`
        SELECT age, gender, relation_type, band, doj, si_proposed, si_expiring
        FROM crm_rfq_members WHERE rfq_id = $1
      `, [rfqId]),

      // Claims data
      pool.query(`
        SELECT diagnosis, service_type, service_category, claimed_amount, approved_amount,
               paid_amount, claim_status, age, gender, relationship, band, policy_year, claim_date
        FROM crm_rfq_claims WHERE rfq_id = $1
      `, [rfqId]),

      // Age-band distribution
      pool.query(`
        SELECT
          CASE
            WHEN age < 25 THEN 'Under 25'
            WHEN age BETWEEN 25 AND 34 THEN '25-34'
            WHEN age BETWEEN 35 AND 44 THEN '35-44'
            WHEN age BETWEEN 45 AND 54 THEN '45-54'
            WHEN age BETWEEN 55 AND 64 THEN '55-64'
            ELSE '65+'
          END AS age_band,
          COUNT(*) AS count,
          AVG(si_proposed) AS avg_si,
          SUM(CASE WHEN COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%' THEN 1 ELSE 0 END) AS employees,
          SUM(CASE WHEN COALESCE(NULLIF(TRIM(relationship),''), relation_type) NOT ILIKE '%SELF%' THEN 1 ELSE 0 END) AS dependents
        FROM crm_rfq_members WHERE rfq_id = $1 AND age IS NOT NULL
        GROUP BY 1 ORDER BY MIN(age)
      `, [rfqId]),

      // Gender distribution
      pool.query(`
        SELECT gender, COUNT(*) AS count, AVG(age) AS avg_age
        FROM crm_rfq_members WHERE rfq_id = $1 AND gender IS NOT NULL AND gender != ''
        GROUP BY gender
      `, [rfqId]),

      // Tenure distribution (from DOJ) for attrition modelling
      pool.query(`
        SELECT
          CASE
            WHEN doj IS NULL THEN 'Unknown'
            WHEN doj >= NOW() - INTERVAL '1 year' THEN '0-1 yr'
            WHEN doj >= NOW() - INTERVAL '2 years' THEN '1-2 yrs'
            WHEN doj >= NOW() - INTERVAL '3 years' THEN '2-3 yrs'
            WHEN doj >= NOW() - INTERVAL '5 years' THEN '3-5 yrs'
            ELSE '5+ yrs'
          END AS tenure_band,
          COUNT(*) AS count,
          AVG(age) AS avg_age
        FROM crm_rfq_members WHERE rfq_id = $1 AND COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%'
        GROUP BY 1 ORDER BY MIN(COALESCE(doj, '1900-01-01'))
      `, [rfqId]),

      // SI slab distribution
      pool.query(`
        SELECT
          CASE
            WHEN si_proposed BETWEEN 100000 AND 299999 THEN '1L-3L'
            WHEN si_proposed BETWEEN 300000 AND 499999 THEN '3L-5L'
            WHEN si_proposed BETWEEN 500000 AND 999999 THEN '5L-10L'
            WHEN si_proposed BETWEEN 1000000 AND 1999999 THEN '10L-20L'
            WHEN si_proposed >= 2000000 THEN '20L+'
            ELSE 'Not set'
          END AS si_slab,
          COUNT(*) AS count,
          AVG(si_proposed) AS avg_si
        FROM crm_rfq_members WHERE rfq_id = $1 AND COALESCE(NULLIF(TRIM(relationship),''), relation_type) ILIKE '%SELF%'
        GROUP BY 1 ORDER BY MIN(COALESCE(si_proposed, 0))
      `, [rfqId]),
    ]);

    const members = memberRes.rows;
    const claims = claimsRes.rows;
    const ageBands = bandDistRes.rows;
    const genderDist = genderDistRes.rows;
    const tenureDist = tenureDistRes.rows;
    const siDist = siDistRes.rows;

    const hasMemberData = members.length > 0;
    const hasClaimsData = claims.length > 0;

    // ── Infer industry (reuse helper from intelligence engine) and persist if not already set ────────────
    const industryInferred = rfq.industry || inferIndustry(rfq.insured_name);
    if (!rfq.industry) {
      sharedPool.query(`UPDATE crm_rfqs SET industry = $1 WHERE id = $2 AND industry IS NULL`, [industryInferred, rfqId]).catch(() => {});
    }
    const productType = rfq.product_type || 'GMC';
    const isRenewal = !!(rfq.existing_insurer && rfq.existing_insurer.trim() !== 'Not disclosed');

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 1 — Product-Wise Risk Profile
    // ═══════════════════════════════════════════════════════════════════════════
    const PRODUCT_BENCHMARKS = {
      'GMC':       { icr_norm: 0.82, freq_per_100: 22, avg_severity: 45000, inflation: 1.13, catastrophic_pct: 3.5 },
      'GHI':       { icr_norm: 0.85, freq_per_100: 24, avg_severity: 48000, inflation: 1.14, catastrophic_pct: 4.0 },
      'GMC+OPD':   { icr_norm: 0.92, freq_per_100: 38, avg_severity: 28000, inflation: 1.12, catastrophic_pct: 2.0 },
      'OPD':       { icr_norm: 0.95, freq_per_100: 55, avg_severity: 8500,  inflation: 1.11, catastrophic_pct: 0.5 },
      'GPA':       { icr_norm: 0.45, freq_per_100: 4,  avg_severity: 85000, inflation: 1.06, catastrophic_pct: 8.0 },
      'Wellness':  { icr_norm: 0.80, freq_per_100: 18, avg_severity: 12000, inflation: 1.10, catastrophic_pct: 0.5 },
      'Group Term':{ icr_norm: 0.35, freq_per_100: 2,  avg_severity: 500000,inflation: 1.05, catastrophic_pct: 1.5 },
    };

    const bm = PRODUCT_BENCHMARKS[productType] || PRODUCT_BENCHMARKS['GMC'];

    // Industry-specific disease risk multipliers
    const INDUSTRY_DISEASE_RISK = {
      'Pharmaceutical / Life Sciences':   { cardiac: 1.1, diabetes: 1.1, occupational: 1.4, mental_health: 1.1, oncology: 1.2 },
      'Information Technology / IT Services': { cardiac: 1.2, diabetes: 1.3, musculoskeletal: 1.4, mental_health: 1.5, eye: 1.3 },
      'Banking / Financial Services (BFSI)':  { cardiac: 1.4, diabetes: 1.3, hypertension: 1.4, mental_health: 1.3, stroke: 1.2 },
      'Manufacturing / Industrial':           { trauma: 1.6, ortho: 1.5, occupational: 1.3, hearing_loss: 1.3, respiratory: 1.4 },
      'Healthcare / Hospitals':               { occupational: 1.3, infection: 1.4, mental_health: 1.3, musculoskeletal: 1.3, radiation: 1.2 },
      'Education':                            { respiratory: 1.2, infection: 1.3, mental_health: 1.2, eye: 1.2, thyroid: 1.1 },
      'Retail / E-commerce':                  { musculoskeletal: 1.4, varicose: 1.3, fatigue: 1.3, respiratory: 1.1, ortho: 1.3 },
      'Hospitality / Travel':                 { fatigue: 1.4, musculoskeletal: 1.5, infection: 1.2, diabetes: 1.2, hypertension: 1.1 },
      'Telecom / Media':                      { musculoskeletal: 1.3, mental_health: 1.4, eye: 1.4, cardiac: 1.2, hearing_loss: 1.2 },
      'Government / PSU':                     { cardiac: 1.3, diabetes: 1.4, hypertension: 1.4, oncology: 1.2, liver: 1.2 },
      'Construction / Real Estate':           { trauma: 1.8, ortho: 1.6, respiratory: 1.5, eye: 1.3, occupational: 1.5 },
      'FMCG / Consumer Goods':                { musculoskeletal: 1.3, respiratory: 1.2, diabetes: 1.2, cardiac: 1.1, skin: 1.2 },
      'General Corporate':                    { cardiac: 1.2, diabetes: 1.2, hypertension: 1.2, musculoskeletal: 1.2, mental_health: 1.1 },
    };

    const industryRisk = INDUSTRY_DISEASE_RISK[industryInferred] || INDUSTRY_DISEASE_RISK['General Corporate'];

    // Top predicted disease categories for this industry+product
    const diseasePredictions = Object.entries(industryRisk)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([disease, multiplier]) => ({
        disease: disease.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        risk_multiplier: multiplier,
        expected_frequency_pct: Math.round(bm.freq_per_100 * multiplier * 10) / 10,
        risk_level: multiplier >= 1.4 ? 'High' : multiplier >= 1.2 ? 'Moderate' : 'Standard',
      }));

    const productRiskProfile = {
      product_type: productType,
      industry: industryInferred,
      is_renewal: isRenewal,
      existing_insurer: rfq.existing_insurer || null,
      norm_icr_pct: Math.round(bm.icr_norm * 100),
      norm_claims_freq_per_100: bm.freq_per_100,
      norm_avg_severity: bm.avg_severity,
      inflation_rate_pct: Math.round((bm.inflation - 1) * 100),
      catastrophic_claims_pct: bm.catastrophic_pct,
      top_disease_predictions: diseasePredictions,
      product_benchmarks_available: Object.keys(PRODUCT_BENCHMARKS).map(p => ({
        product: p,
        icr_pct: Math.round(PRODUCT_BENCHMARKS[p].icr_norm * 100),
        freq_per_100: PRODUCT_BENCHMARKS[p].freq_per_100,
        avg_severity: PRODUCT_BENCHMARKS[p].avg_severity,
      })),
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 2 — Age-Band Claim Forecasting (1yr, 3yr, 5yr)
    // ═══════════════════════════════════════════════════════════════════════════
    const AGE_RISK_FACTORS = {
      'Under 25': { risk: 0.65, maternity_risk: 0.12, mobility: 0.95 },
      '25-34':    { risk: 0.82, maternity_risk: 0.22, mobility: 0.90 },
      '35-44':    { risk: 1.20, maternity_risk: 0.08, mobility: 0.88 },
      '45-54':    { risk: 1.75, maternity_risk: 0.01, mobility: 0.82 },
      '55-64':    { risk: 2.40, maternity_risk: 0.00, mobility: 0.70 },
      '65+':      { risk: 3.20, maternity_risk: 0.00, mobility: 0.55 },
    };

    const totalAged = ageBands.reduce((s, b) => s + parseInt(b.count), 0) || memberCount || 1;

    const ageBandForecasts = ageBands.map(band => {
      const rf = AGE_RISK_FACTORS[band.age_band] || { risk: 1.0, maternity_risk: 0.05, mobility: 0.85 };
      const count = parseInt(band.count);
      const pct = Math.round((count / totalAged) * 1000) / 10;
      const baseExpectedClaims = Math.round(count * bm.freq_per_100 / 100 * rf.risk);
      const baseBurningCost = Math.round(bm.avg_severity * rf.risk);

      return {
        age_band: band.age_band,
        count,
        pct_of_group: pct,
        employees: parseInt(band.employees) || 0,
        dependents: parseInt(band.dependents) || 0,
        risk_factor: rf.risk,
        maternity_risk: rf.maternity_risk,
        forecast_yr1: {
          expected_claims: baseExpectedClaims,
          expected_burning_cost: baseBurningCost,
          expected_icr_pct: Math.round(bm.icr_norm * rf.risk * 100),
          maternity_claims: Math.round(count * rf.maternity_risk * 0.15),
        },
        forecast_yr3: {
          expected_claims: Math.round(baseExpectedClaims * Math.pow(bm.inflation, 3) * 1.08),
          expected_burning_cost: Math.round(baseBurningCost * Math.pow(bm.inflation, 3)),
          expected_icr_pct: Math.round(bm.icr_norm * rf.risk * Math.pow(1.05, 3) * 100),
          age_adjusted_count: Math.round(count * Math.pow(1 - (1 - rf.mobility) / 3, 3)),
        },
        forecast_yr5: {
          expected_claims: Math.round(baseExpectedClaims * Math.pow(bm.inflation, 5) * 1.18),
          expected_burning_cost: Math.round(baseBurningCost * Math.pow(bm.inflation, 5)),
          expected_icr_pct: Math.round(bm.icr_norm * rf.risk * Math.pow(1.05, 5) * 100),
          age_adjusted_count: Math.round(count * Math.pow(1 - (1 - rf.mobility) / 3, 5)),
        },
      };
    });

    // Portfolio-level rolling forecast
    const totalBurningCostYr1 = ageBandForecasts.reduce((s, b) => s + b.forecast_yr1.expected_burning_cost * b.count, 0);
    const totalBurningCostYr3 = ageBandForecasts.reduce((s, b) => s + b.forecast_yr3.expected_burning_cost * b.count, 0);
    const totalBurningCostYr5 = ageBandForecasts.reduce((s, b) => s + b.forecast_yr5.expected_burning_cost * b.count, 0);
    const baseTotalCount = ageBandForecasts.reduce((s, b) => s + b.count, 0) || memberCount || 1;

    const claimForecast = {
      base_year: {
        member_count: memberCount,
        expected_total_claims: Math.round(memberCount * bm.freq_per_100 / 100),
        expected_burning_cost_per_life: Math.round(totalBurningCostYr1 / baseTotalCount),
        expected_total_outgo: Math.round(totalBurningCostYr1),
        projected_icr_pct: Math.round(bm.icr_norm * 100),
      },
      year_3: {
        member_count_est: Math.round(memberCount * 0.95),
        expected_total_claims: Math.round(memberCount * 0.95 * bm.freq_per_100 / 100 * 1.08),
        expected_burning_cost_per_life: Math.round(totalBurningCostYr3 / baseTotalCount),
        expected_total_outgo: Math.round(totalBurningCostYr3 * 0.95),
        projected_icr_pct: Math.round(bm.icr_norm * 1.12 * 100),
        inflation_impact_pct: 36,
      },
      year_5: {
        member_count_est: Math.round(memberCount * 0.88),
        expected_total_claims: Math.round(memberCount * 0.88 * bm.freq_per_100 / 100 * 1.18),
        expected_burning_cost_per_life: Math.round(totalBurningCostYr5 / baseTotalCount),
        expected_total_outgo: Math.round(totalBurningCostYr5 * 0.88),
        projected_icr_pct: Math.round(bm.icr_norm * 1.28 * 100),
        inflation_impact_pct: 65,
      },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 3 — Attrition Impact Modelling
    // ═══════════════════════════════════════════════════════════════════════════
    const INDUSTRY_ATTRITION = {
      'Information Technology / IT Services':   { annual_rate_pct: 22, high_risk_tenure: '0-1 yr', replacement_lag_months: 2.5 },
      'Banking / Financial Services (BFSI)':    { annual_rate_pct: 18, high_risk_tenure: '0-1 yr', replacement_lag_months: 1.5 },
      'Pharmaceutical / Life Sciences':         { annual_rate_pct: 14, high_risk_tenure: '1-2 yrs', replacement_lag_months: 2.0 },
      'Retail / E-commerce':                    { annual_rate_pct: 30, high_risk_tenure: '0-1 yr', replacement_lag_months: 0.5 },
      'Hospitality / Travel':                   { annual_rate_pct: 28, high_risk_tenure: '0-1 yr', replacement_lag_months: 0.5 },
      'Manufacturing / Industrial':             { annual_rate_pct: 12, high_risk_tenure: '2-3 yrs', replacement_lag_months: 1.5 },
      'Healthcare / Hospitals':                 { annual_rate_pct: 16, high_risk_tenure: '1-2 yrs', replacement_lag_months: 1.0 },
      'Education':                              { annual_rate_pct: 10, high_risk_tenure: '3-5 yrs', replacement_lag_months: 4.0 },
      'Government / PSU':                       { annual_rate_pct: 5,  high_risk_tenure: '5+ yrs',  replacement_lag_months: 6.0 },
      'Telecom / Media':                        { annual_rate_pct: 20, high_risk_tenure: '0-1 yr', replacement_lag_months: 1.5 },
      'Construction / Real Estate':             { annual_rate_pct: 20, high_risk_tenure: '0-1 yr', replacement_lag_months: 1.0 },
      'General Corporate':                      { annual_rate_pct: 15, high_risk_tenure: '0-1 yr', replacement_lag_months: 2.0 },
    };

    const attritionProfile = INDUSTRY_ATTRITION[industryInferred] || INDUSTRY_ATTRITION['General Corporate'];
    const attritionRate = attritionProfile.annual_rate_pct / 100;

    // Count fresh joiners (< 1 yr DOJ) as adverse selection risk
    const freshJoiners = tenureDist.find(t => t.tenure_band === '0-1 yr');
    const freshJoinerCount = parseInt(freshJoiners?.count || 0);
    const freshJoinerPct = memberCount > 0 ? Math.round(freshJoinerCount / memberCount * 100) : 0;

    // Adverse selection: fresh joiners often join due to health events
    const adverseSelectionMultiplier = freshJoinerPct > 25 ? 1.18 : freshJoinerPct > 15 ? 1.10 : 1.03;

    const attritionAnalysis = {
      industry_annual_attrition_pct: attritionProfile.annual_rate_pct,
      high_risk_tenure_band: attritionProfile.high_risk_tenure,
      replacement_lag_months: attritionProfile.replacement_lag_months,
      estimated_exits_yr1: Math.round(memberCount * attritionRate * 0.85), // employees only est.
      estimated_joiners_yr1: Math.round(memberCount * attritionRate),
      net_member_change_yr1: Math.round(memberCount * attritionRate * 0.15), // slight growth
      fresh_joiner_count: freshJoinerCount,
      fresh_joiner_pct: freshJoinerPct,
      adverse_selection_risk: freshJoinerPct > 25 ? 'High' : freshJoinerPct > 15 ? 'Moderate' : 'Low',
      adverse_selection_multiplier: adverseSelectionMultiplier,
      premium_impact_pct: Math.round((adverseSelectionMultiplier - 1) * 100),
      tenure_distribution: tenureDist.map(t => ({
        band: t.tenure_band,
        count: parseInt(t.count),
        avg_age: Math.round(parseFloat(t.avg_age) || 0),
        pct: memberCount > 0 ? Math.round(parseInt(t.count) / memberCount * 100) : 0,
      })),
      underwriting_notes: freshJoinerPct > 25
        ? `${freshJoinerPct}% fresh joiners (< 1yr) indicate high adverse selection exposure. Apply ${Math.round((adverseSelectionMultiplier - 1) * 100)}% loading on new joiner cohort.`
        : freshJoinerPct > 15
        ? `${freshJoinerPct}% fresh joiners — moderate adverse selection. Monitor new joiner claims closely in first 6 months.`
        : 'Stable workforce composition. Standard adverse selection provisions apply.',
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 4 — Claims Experience Analysis (if data exists)
    // ═══════════════════════════════════════════════════════════════════════════
    let claimsExperienceAnalysis = null;
    if (hasClaimsData) {
      const totalClaimed = claims.reduce((s, c) => s + parseFloat(c.claimed_amount || 0), 0);
      const totalApproved = claims.reduce((s, c) => s + parseFloat(c.approved_amount || 0), 0);
      const totalPaid = claims.reduce((s, c) => s + parseFloat(c.paid_amount || 0), 0);
      const approvedClaims = claims.filter(c => parseFloat(c.approved_amount || 0) > 0);
      const avgSeverity = approvedClaims.length > 0 ? totalApproved / approvedClaims.length : 0;

      // Diagnosis distribution
      const diagGroups = {};
      claims.forEach(c => {
        const diag = c.diagnosis || 'Not coded';
        if (!diagGroups[diag]) diagGroups[diag] = { count: 0, amount: 0 };
        diagGroups[diag].count++;
        diagGroups[diag].amount += parseFloat(c.approved_amount || 0);
      });
      const topDiagnoses = Object.entries(diagGroups)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([diag, d]) => ({ diagnosis: diag, count: d.count, total_approved: Math.round(d.amount), avg_per_claim: Math.round(d.amount / d.count) }));

      // Service type distribution
      const svcGroups = {};
      claims.forEach(c => {
        const svc = c.service_type || 'Other';
        if (!svcGroups[svc]) svcGroups[svc] = { count: 0, amount: 0 };
        svcGroups[svc].count++;
        svcGroups[svc].amount += parseFloat(c.approved_amount || 0);
      });

      // Age band claim analysis
      const ageClaimGroups = {};
      claims.forEach(c => {
        const age = parseInt(c.age || 0);
        const band = age < 25 ? 'Under 25' : age <= 34 ? '25-34' : age <= 44 ? '35-44' : age <= 54 ? '45-54' : age <= 64 ? '55-64' : '65+';
        if (!ageClaimGroups[band]) ageClaimGroups[band] = { count: 0, amount: 0 };
        ageClaimGroups[band].count++;
        ageClaimGroups[band].amount += parseFloat(c.approved_amount || 0);
      });

      // Policy year trend
      const policyYearGroups = {};
      claims.forEach(c => {
        const yr = c.policy_year || 'Unknown';
        if (!policyYearGroups[yr]) policyYearGroups[yr] = { count: 0, amount: 0 };
        policyYearGroups[yr].count++;
        policyYearGroups[yr].amount += parseFloat(c.approved_amount || 0);
      });

      // Employee-level risk scoring (top claimants)
      const empClaimGroups = {};
      claims.forEach(c => {
        const emp = c.emp_code || c.employee_name || 'Unknown';
        if (!empClaimGroups[emp]) empClaimGroups[emp] = { emp_code: c.emp_code, name: c.employee_name, age: c.age, claims: 0, total_claimed: 0, total_approved: 0, diagnoses: [] };
        empClaimGroups[emp].claims++;
        empClaimGroups[emp].total_claimed += parseFloat(c.claimed_amount || 0);
        empClaimGroups[emp].total_approved += parseFloat(c.approved_amount || 0);
        if (c.diagnosis && !empClaimGroups[emp].diagnoses.includes(c.diagnosis)) {
          empClaimGroups[emp].diagnoses.push(c.diagnosis);
        }
      });
      const topClaimants = Object.values(empClaimGroups)
        .sort((a, b) => b.total_approved - a.total_approved)
        .slice(0, 20)
        .map(e => ({
          ...e,
          risk_tier: e.total_approved > avgSeverity * 5 ? 'Critical' : e.total_approved > avgSeverity * 2 ? 'High' : e.total_approved > avgSeverity ? 'Moderate' : 'Standard',
          diagnoses: e.diagnoses.slice(0, 3),
        }));

      // High-cost claim analysis
      const highCostThreshold = avgSeverity * 3;
      const highCostClaims = claims.filter(c => parseFloat(c.approved_amount || 0) > highCostThreshold);

      // ICR calculation
      const premiumPaid = parseFloat(rfq.premium_paid) || null;
      const icrPct = premiumPaid && premiumPaid > 0 ? Math.round(totalApproved / premiumPaid * 100) : null;

      claimsExperienceAnalysis = {
        summary: {
          total_claims: claims.length,
          total_claimed: Math.round(totalClaimed),
          total_approved: Math.round(totalApproved),
          total_paid: Math.round(totalPaid),
          approval_rate_pct: claims.length > 0 ? Math.round(totalApproved / totalClaimed * 100) : null,
          avg_claim_severity: Math.round(avgSeverity),
          icr_pct: icrPct,
          claims_freq_per_100: memberCount > 0 ? Math.round(claims.length / memberCount * 100 * 10) / 10 : null,
          high_cost_claims_count: highCostClaims.length,
          high_cost_claims_pct: Math.round(highCostClaims.length / claims.length * 100),
          high_cost_total_approved: Math.round(highCostClaims.reduce((s, c) => s + parseFloat(c.approved_amount || 0), 0)),
        },
        top_diagnoses: topDiagnoses,
        service_type_distribution: Object.entries(svcGroups)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([svc, d]) => ({ service_type: svc, count: d.count, total_amount: Math.round(d.amount), pct_of_total: Math.round(d.count / claims.length * 100) })),
        age_band_claims: Object.entries(ageClaimGroups)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([band, d]) => ({ age_band: band, claim_count: d.count, total_approved: Math.round(d.amount), avg_severity: Math.round(d.amount / d.count) })),
        policy_year_trend: Object.entries(policyYearGroups)
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
          .map(([yr, d]) => ({ policy_year: yr, claims: d.count, total_approved: Math.round(d.amount), avg_severity: Math.round(d.amount / d.count) })),
        top_claimants_by_cost: topClaimants,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 5 — Employee Risk Score Distribution (from member data)
    // ═══════════════════════════════════════════════════════════════════════════
    let employeeRiskDistribution = null;
    if (hasMemberData) {
      const riskBuckets = { 'Low (18-30)': 0, 'Moderate (31-40)': 0, 'Elevated (41-50)': 0, 'High (51-60)': 0, 'Critical (60+)': 0 };
      let totalRiskScore = 0;

      members.forEach(m => {
        const age = parseInt(m.age || 0);
        const ageScore = age < 30 ? 10 : age < 40 ? 25 : age < 50 ? 45 : age < 60 ? 65 : 80;
        const siScore = parseFloat(m.si_proposed || m.si_expiring || 0) > 500000 ? 15 : 5;
        const riskScore = ageScore + siScore;
        totalRiskScore += riskScore;

        if (riskScore < 30) riskBuckets['Low (18-30)']++;
        else if (riskScore < 40) riskBuckets['Moderate (31-40)']++;
        else if (riskScore < 55) riskBuckets['Elevated (41-50)']++;
        else if (riskScore < 70) riskBuckets['High (51-60)']++;
        else riskBuckets['Critical (60+)']++;
      });

      const avgRiskScore = members.length > 0 ? Math.round(totalRiskScore / members.length) : 0;

      employeeRiskDistribution = {
        avg_risk_score: avgRiskScore,
        risk_tier: avgRiskScore < 25 ? 'Preferred' : avgRiskScore < 40 ? 'Standard' : avgRiskScore < 55 ? 'Substandard' : 'High Risk',
        buckets: Object.entries(riskBuckets).map(([label, count]) => ({
          label,
          count,
          pct: members.length > 0 ? Math.round(count / members.length * 100) : 0,
        })),
        gender_distribution: genderDist.map(g => ({
          gender: g.gender,
          count: parseInt(g.count),
          avg_age: Math.round(parseFloat(g.avg_age) || 0),
          pct: members.length > 0 ? Math.round(parseInt(g.count) / members.length * 100) : 0,
        })),
        si_distribution: siDist.map(s => ({
          slab: s.si_slab,
          count: parseInt(s.count),
          avg_si: Math.round(parseFloat(s.avg_si) || 0),
        })),
        age_band_distribution: ageBands.map(b => ({
          age_band: b.age_band,
          count: parseInt(b.count),
          pct: Math.round(parseInt(b.count) / totalAged * 100),
          employees: parseInt(b.employees) || 0,
          dependents: parseInt(b.dependents) || 0,
          avg_si: Math.round(parseFloat(b.avg_si) || 0),
          risk_factor: (AGE_RISK_FACTORS[b.age_band] || { risk: 1.0 }).risk,
        })),
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 6 — Severity-Frequency Cohort Model & Premium Adequacy
    // ═══════════════════════════════════════════════════════════════════════════
    // Weighted age loading for this group
    let weightedAgeLoading = 1.0;
    if (hasMemberData && ageBands.length > 0) {
      const ageLoadingSum = ageBands.reduce((s, b) => {
        const rf = (AGE_RISK_FACTORS[b.age_band] || { risk: 1.0 }).risk;
        return s + rf * parseInt(b.count);
      }, 0);
      weightedAgeLoading = ageLoadingSum / baseTotalCount;
    }

    const premiumPaid = parseFloat(rfq.premium_paid) || 0;
    const premiumPerLife = memberCount > 0 && premiumPaid > 0 ? premiumPaid / memberCount : 0;
    const marketMedianPerLife = bm.avg_severity * bm.icr_norm * bm.freq_per_100 / 100;
    const adequacyRatio = premiumPerLife > 0 ? Math.round(premiumPerLife / marketMedianPerLife * 100) / 100 : null;

    // Catastrophic loss potential (99th percentile estimate)
    const catastrophicPotential = Math.round(memberCount * bm.freq_per_100 / 100 * bm.catastrophic_pct / 100 * bm.avg_severity * 8);

    const cohortModel = {
      weighted_age_loading: Math.round(weightedAgeLoading * 100) / 100,
      base_burning_cost_per_life: Math.round(bm.avg_severity * bm.freq_per_100 / 100),
      age_adjusted_burning_cost: Math.round(bm.avg_severity * bm.freq_per_100 / 100 * weightedAgeLoading),
      industry_adjusted_burning_cost: Math.round(bm.avg_severity * bm.freq_per_100 / 100 * weightedAgeLoading * (adverseSelectionMultiplier || 1)),
      gross_premium_indication: Math.round(bm.avg_severity * bm.freq_per_100 / 100 * weightedAgeLoading * (adverseSelectionMultiplier || 1) * 1.22),
      prior_premium_per_life: Math.round(premiumPerLife),
      market_median_per_life: Math.round(marketMedianPerLife),
      premium_adequacy_ratio: adequacyRatio,
      adequacy_verdict: adequacyRatio === null ? 'No premium data' : adequacyRatio < 0.85 ? 'Under-priced — risk of loss' : adequacyRatio > 1.20 ? 'Over-priced — renewal opportunity' : 'Adequately priced',
      catastrophic_loss_potential: catastrophicPotential,
      recommended_ibnr_provision_pct: Math.round(bm.catastrophic_pct * 1.5 + 5),
      stop_loss_recommendation: catastrophicPotential > 5000000 ? `Stop-loss recommended at 80% aggregate. Catastrophic potential: ₹${(catastrophicPotential / 100000).toFixed(1)}L` : null,
      inflation_adjusted_yr1: Math.round(bm.avg_severity * bm.freq_per_100 / 100 * weightedAgeLoading * bm.inflation),
      inflation_adjusted_yr3: Math.round(bm.avg_severity * bm.freq_per_100 / 100 * weightedAgeLoading * Math.pow(bm.inflation, 3)),
      inflation_adjusted_yr5: Math.round(bm.avg_severity * bm.freq_per_100 / 100 * weightedAgeLoading * Math.pow(bm.inflation, 5)),
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE 7 — Underwriting Summary & Risk Score
    // ═══════════════════════════════════════════════════════════════════════════
    const uwScore = {
      age_risk: weightedAgeLoading > 1.5 ? 'HIGH' : weightedAgeLoading > 1.2 ? 'MODERATE' : 'LOW',
      attrition_risk: attritionAnalysis.adverse_selection_risk,
      premium_adequacy: cohortModel.adequacy_verdict,
      industry_risk: Object.values(industryRisk).filter(v => v >= 1.4).length >= 3 ? 'HIGH' : Object.values(industryRisk).filter(v => v >= 1.2).length >= 3 ? 'MODERATE' : 'LOW',
    };

    const riskFactorCount = Object.values(uwScore).filter(v => v === 'HIGH' || v === 'MODERATE').length;
    const overallRisk = riskFactorCount >= 3 ? 'High Risk' : riskFactorCount >= 2 ? 'Substandard' : riskFactorCount >= 1 ? 'Standard' : 'Preferred';
    const overallColor = overallRisk === 'High Risk' ? 'red' : overallRisk === 'Substandard' ? 'amber' : overallRisk === 'Standard' ? 'blue' : 'emerald';

    const underwritingDecision = overallRisk === 'High Risk' ? 'Refer to Chief Underwriter' :
      overallRisk === 'Substandard' ? 'Acceptable with Loading' : 'Acceptable';

    const uwSummary = {
      overall_risk: overallRisk,
      overall_color: overallColor,
      underwriting_decision: underwritingDecision,
      risk_factors: uwScore,
      key_loadings: {
        age_loading: Math.round((weightedAgeLoading - 1) * 100),
        adverse_selection_loading: Math.round((adverseSelectionMultiplier - 1) * 100),
        industry_loading: Object.values(industryRisk).filter(v => v >= 1.2).length * 3,
        renewal_credit: isRenewal ? -5 : 0,
        total_loading_pct: Math.round((weightedAgeLoading * adverseSelectionMultiplier - 1) * 100) + Object.values(industryRisk).filter(v => v >= 1.2).length * 3 + (isRenewal ? -5 : 0),
      },
      key_risk_flags: [
        weightedAgeLoading > 1.4 && `Ageing workforce — weighted age loading ${Math.round(weightedAgeLoading * 100) / 100}x`,
        freshJoinerPct > 20 && `${freshJoinerPct}% fresh joiners in last 12 months (adverse selection risk)`,
        premiumPerLife > 0 && premiumPerLife < marketMedianPerLife * 0.80 && `Prior premium ₹${Math.round(premiumPerLife).toLocaleString()}/life is significantly below market median — likely under-insured`,
        bm.catastrophic_pct > 5 && `${productType} product has elevated catastrophic claim exposure (${bm.catastrophic_pct}% probability)`,
        Object.values(industryRisk).filter(v => v >= 1.4).length >= 2 && `${industryInferred} industry has ${Object.values(industryRisk).filter(v => v >= 1.4).length} high-risk disease categories`,
      ].filter(Boolean),
      renewal_advantage: isRenewal ? {
        exists: true,
        prior_insurer: rfq.existing_insurer,
        migration_opportunity: /new india|united india|national insurance|oriental/i.test(rfq.existing_insurer || '') ? 'PSU-to-private migration — strong service differentiation play' : 'Private insurer renewal — competitive pricing required',
      } : { exists: false },
    };

    // ── Final response ─────────────────────────────────────────────────────────
    return res.json({
      success: true,
      data: {
        rfq_context: {
          id: rfq.id,
          insured_name: rfq.insured_name,
          member_count: memberCount,
          product_type: productType,
          policy_type: rfq.policy_type,
          industry: industryInferred,
          existing_insurer: rfq.existing_insurer,
          is_renewal: isRenewal,
          has_member_data: hasMemberData,
          has_claims_data: hasClaimsData,
        },
        product_risk_profile: productRiskProfile,
        age_band_forecasts: ageBandForecasts,
        claim_forecast: claimForecast,
        attrition_analysis: attritionAnalysis,
        claims_experience: claimsExperienceAnalysis,
        employee_risk_distribution: employeeRiskDistribution,
        cohort_model: cohortModel,
        underwriting_summary: uwSummary,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Deep Analytics]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Deep analytics failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AI INTELLIGENCE ENGINE — RAG Pipeline + Competition Intelligence + Proposal
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /rfqs/:id/ai-intelligence
 * Full RAG-powered intelligence:
 *  - Historical CRM win/loss analysis (similar size, same product)
 *  - Benchmark pricing from our own won deals
 *  - Win probability scoring
 *  - Competitor benchmarks via LLM
 *  - Trend analysis from our pipeline
 *  - Pricing recommendations
 */
router.post('/rfqs/:id/ai-intelligence', authCRM, async (req, res) => {
  try {
    const rfqId = req.params.id;
    const pool = sharedPool;

    // ── 1. Fetch this RFQ ─────────────────────────────────────────────────
    const rfqRes = await pool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rfqRes.rows[0];
    const memberCount = rfq.member_count || 0;
    const policyType = rfq.policy_type || 'Group Mediclaim';
    const productType = rfq.product_type || 'GMC';

    // ── 2. RAG: Historical CRM data (our own pipeline) ──────────────────
    // 2a. Similar-size RFQs won in the past (±50% member count)
    const sizeMin = Math.max(1, Math.floor(memberCount * 0.5));
    const sizeMax = Math.ceil(memberCount * 1.5);

    const [wonDeals, lostDeals, allQuotedDeals, recentPipeline] = await Promise.all([
      pool.query(`
        SELECT r.insured_name, r.member_count, r.product_type, r.existing_insurer,
               q.total_premium, q.per_life_cost, q.total_lives, q.version,
               ROUND(q.total_premium::numeric / NULLIF(q.total_lives, 0), 0) AS per_life_quoted
        FROM crm_rfqs r
        JOIN crm_quotes q ON q.rfq_id = r.id AND q.status = 'accepted'
        WHERE r.status = 'won'
          AND r.member_count BETWEEN $1 AND $2
          AND r.id != $3
        ORDER BY r.created_at DESC LIMIT 10
      `, [sizeMin, sizeMax, rfqId]),

      pool.query(`
        SELECT r.insured_name, r.member_count, r.product_type, r.existing_insurer, r.notes as lost_reason,
               q.total_premium, q.per_life_cost, q.total_lives
        FROM crm_rfqs r
        LEFT JOIN crm_quotes q ON q.rfq_id = r.id AND q.status = 'rejected'
        WHERE r.status = 'lost'
          AND r.member_count BETWEEN $1 AND $2
          AND r.id != $3
        ORDER BY r.created_at DESC LIMIT 10
      `, [sizeMin, sizeMax, rfqId]),

      pool.query(`
        SELECT q.total_premium, q.per_life_cost, q.total_lives, r.member_count, r.status
        FROM crm_quotes q
        JOIN crm_rfqs r ON r.id = q.rfq_id
        WHERE q.status NOT IN ('draft') AND r.id != $1
        ORDER BY q.created_at DESC LIMIT 50
      `, [rfqId]),

      pool.query(`
        SELECT r.status, COUNT(*) AS cnt,
               AVG(q.per_life_cost) AS avg_per_life,
               AVG(q.total_premium) AS avg_premium
        FROM crm_rfqs r
        LEFT JOIN crm_quotes q ON q.rfq_id = r.id AND q.status NOT IN ('draft','rejected')
        WHERE r.created_at >= NOW() - INTERVAL '90 days'
          AND r.product_type = $1
          AND r.id != $2
        GROUP BY r.status
      `, [productType, rfqId]),
    ]);

    // ── 3. Compute RAG analytics ─────────────────────────────────────────
    const wonQuotes = wonDeals.rows;
    const lostQuotes = lostDeals.rows;

    // Average per-life cost in won deals (benchmark from our own book)
    const wonPerLife = wonQuotes.filter(r => parseFloat(r.per_life_quoted) > 0)
      .map(r => parseFloat(r.per_life_quoted));
    const avgWonPerLife = wonPerLife.length > 0
      ? Math.round(wonPerLife.reduce((a, b) => a + b, 0) / wonPerLife.length) : null;
    const minWonPerLife = wonPerLife.length > 0 ? Math.round(Math.min(...wonPerLife)) : null;
    const maxWonPerLife = wonPerLife.length > 0 ? Math.round(Math.max(...wonPerLife)) : null;

    // Conversion rate for similar deals
    const totalSimilar = wonQuotes.length + lostQuotes.length;
    const winRate = totalSimilar > 0 ? Math.round((wonQuotes.length / totalSimilar) * 100) : 50;

    // Pipeline velocity (90-day)
    const pipelineStats = {};
    for (const row of recentPipeline.rows) {
      pipelineStats[row.status] = {
        count: parseInt(row.cnt),
        avg_per_life: row.avg_per_life ? Math.round(parseFloat(row.avg_per_life)) : null,
        avg_premium: row.avg_premium ? Math.round(parseFloat(row.avg_premium)) : null,
      };
    }

    // Market benchmark (industry standard for India group health)
    const industryBenchmarks = getIndustryBenchmarks(memberCount, policyType, productType);

    // ── 3b. Actuarial: member profile + claims experience ─────────────────
    const [memberProfileRes, ageBandRes, claimsSummaryRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total_members,
          COUNT(DISTINCT emp_code) AS unique_employees,
          ROUND(AVG(age)::numeric, 1) AS avg_age,
          COUNT(CASE WHEN age >= 45 THEN 1 END) AS high_risk_age_count,
          COUNT(CASE WHEN age >= 55 THEN 1 END) AS senior_age_count,
          COUNT(CASE WHEN LOWER(COALESCE(gender,'')) IN ('male','m') THEN 1 END) AS male_count,
          COUNT(CASE WHEN LOWER(COALESCE(gender,'')) IN ('female','f') THEN 1 END) AS female_count,
          COUNT(CASE WHEN LOWER(COALESCE(relation_type,'')) NOT IN ('employee','self','emp') THEN 1 END) AS dependent_count,
          ROUND(AVG(si_proposed)::numeric, 0) AS avg_si,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY si_proposed)::numeric, 0) AS median_si
        FROM crm_rfq_members WHERE rfq_id = $1
      `, [rfqId]),

      pool.query(`
        SELECT
          CASE WHEN age < 18 THEN '0-17' WHEN age < 30 THEN '18-29' WHEN age < 45 THEN '30-44'
               WHEN age < 55 THEN '45-54' WHEN age < 65 THEN '55-64' ELSE '65+' END AS age_band,
          COUNT(*) AS count,
          ROUND(AVG(si_proposed)::numeric,0) AS avg_si
        FROM crm_rfq_members WHERE rfq_id = $1
        GROUP BY 1 ORDER BY 1
      `, [rfqId]),

      pool.query(`
        SELECT
          COUNT(*) AS total_claims,
          COUNT(DISTINCT emp_code) AS unique_claimants,
          COALESCE(SUM(claimed_amount), 0) AS total_claimed,
          COALESCE(SUM(approved_amount), 0) AS total_approved,
          COALESCE(AVG(approved_amount), 0) AS avg_claim_severity,
          COALESCE(MAX(approved_amount), 0) AS max_claim
        FROM crm_rfq_claims WHERE rfq_id = $1
      `, [rfqId]),
    ]);

    const memberProfile = memberProfileRes.rows[0] || {};
    const ageBands = ageBandRes.rows.map(r => ({ age_band: r.age_band, count: parseInt(r.count), avg_si: parseInt(r.avg_si) || 0 }));
    const claimsExp = claimsSummaryRes.rows[0] || {};

    // Actuarial underwriting analysis
    const underwritingAnalysis = computeUnderwritingAnalysis({
      memberCount,
      memberProfile,
      ageBands,
      claimsExperience: claimsExp,
      industryBenchmarks,
      premiumPaid: rfq.premium_paid,
      policyType,
    });

    // Win probability — computed after underwriting so we can use risk tier
    const winProbability = computeWinProbability({
      memberCount, policyType, productType,
      existingInsurer: rfq.existing_insurer,
      wonDealsCount: wonQuotes.length,
      lostDealsCount: lostQuotes.length,
      avgWonPerLife,
      industryBenchmarks,
      riskTier: underwritingAnalysis.risk_classification?.tier,
      premiumPaid: rfq.premium_paid,
    });

    // ── 4. DeepTech: platform-wide claim pattern signals from crm_rfq_claims ──
    let deeptechSignals = null;
    try {
      const deeptechRes = await sharedPool.query(`
        SELECT
          COUNT(*) AS total_decisions,
          COUNT(*) FILTER (WHERE LOWER(claim_status) IN ('approved','settled','paid')) AS approved,
          AVG(claimed_amount) FILTER (WHERE claimed_amount BETWEEN 1000 AND 2000000) AS avg_requested_amount,
          (
            SELECT json_agg(row_to_json(d))
            FROM (
              SELECT diagnosis AS diagnosis_code, COUNT(*) AS cnt
              FROM crm_rfq_claims
              WHERE claim_date >= NOW() - INTERVAL '90 days'
                AND diagnosis IS NOT NULL AND diagnosis <> ''
              GROUP BY diagnosis ORDER BY cnt DESC LIMIT 8
            ) d
          ) AS top_diagnoses
        FROM crm_rfq_claims
        WHERE claim_date >= NOW() - INTERVAL '90 days'
      `);
      const dt = deeptechRes.rows[0];
      if (dt && parseInt(dt.total_decisions) > 0) {
        const total = parseInt(dt.total_decisions);
        const approved = parseInt(dt.approved);
        deeptechSignals = {
          total_decisions: total,
          approval_rate_pct: total > 0 ? Math.round(approved / total * 100) : null,
          avg_requested_amount: Math.round(parseFloat(dt.avg_requested_amount) || 0),
          top_diagnoses: (dt.top_diagnoses || []).filter(d => d.diagnosis_code).slice(0, 8),
        };
      }
    } catch (dtErr) {
      console.warn('[CRM] DeepTech signals error:', dtErr.message);
      deeptechSignals = null;
    }

    // ── 5. LLM call for competitor intelligence + narrative ───────────────
    const llmContext = buildIntelligenceContext(rfq, wonQuotes, lostQuotes, industryBenchmarks, avgWonPerLife, winRate, underwritingAnalysis, deeptechSignals);

    let llmIntelligence = null;
    try {
      const _llm3 = await import('../services/ai-brain/llm-provider.js');
      const callLLM = _llm3.default?.chat || _llm3.chat;
      const llmResult = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are a 20-year veteran senior underwriter and competitive intelligence analyst at Mediczy, a health insurance intermediary in India.
You know India's insurance market deeply: Star Health, ICICI Lombard, HDFC Ergo, New India Assurance, United India, Bajaj Allianz, Reliance General, Care Health (Religare), Niva Bupa, SBI General.

You also understand sector-specific disease patterns: pharma companies have occupational exposure, IT companies have stress/lifestyle disease risk, manufacturing has trauma/ortho claims, BFSI has cardiac/diabetes, hospitality has fatigue/musculoskeletal.

ALWAYS respond with valid JSON only. No markdown, no explanation, no text outside the JSON object. Every string field must be specific to the exact company, sector, and member profile described — never generic.`
          },
          {
            role: 'user',
            content: `Underwrite this group health insurance RFQ and respond with ONLY a JSON object — no markdown, no extra text:

${llmContext}

Required JSON structure (fill every field with data specific to this exact deal):
{
  "recommended_price_per_life": <number, your target per-life price recommendation>,
  "market_position": "aggressive|competitive|premium|defensive",
  "underwriting_decision": "Acceptable|Acceptable with Loading|Refer to Chief Underwriter|Decline",
  "underwriting_notes": "<3-5 sentences specific to this group: reference their avg age, sector, existing insurer, SI level, claims history if available>",
  "competitor_benchmarks": [
    { "insurer": "Star Health", "estimated_per_life_range": "₹X,XXX-₹X,XXX", "notes": "<specific stance for this exact risk profile and sector>" },
    { "insurer": "ICICI Lombard", "estimated_per_life_range": "₹X,XXX-₹X,XXX", "notes": "<specific>" },
    { "insurer": "HDFC Ergo", "estimated_per_life_range": "₹X,XXX-₹X,XXX", "notes": "<specific>" },
    { "insurer": "New India Assurance", "estimated_per_life_range": "₹X,XXX-₹X,XXX", "notes": "<specific>" },
    { "insurer": "Care Health", "estimated_per_life_range": "₹X,XXX-₹X,XXX", "notes": "<specific>" }
  ],
  "pricing_recommendation": {
    "floor_per_life": <number>,
    "target_per_life": <number>,
    "ceiling_per_life": <number>,
    "rationale": "<actuarial rationale: reference ICR, loading factors, credibility weight, specific to this group's profile>"
  },
  "claims_prediction": {
    "expected_icr_pct": <number 60-120>,
    "expected_claims_frequency_per_100": <number>,
    "predicted_high_cost_claims": "<specific to this sector and age profile — e.g. for pharma: occupational exposure, cardiac, musculoskeletal>",
    "ibnr_provision_pct": <number 5-15>
  },
  "disease_prediction": [
    { "disease": "<top disease category for this group>", "expected_frequency_pct": <number>, "rationale": "<why this group is prone>" },
    { "disease": "<2nd>", "expected_frequency_pct": <number>, "rationale": "<specific>" },
    { "disease": "<3rd>", "expected_frequency_pct": <number>, "rationale": "<specific>" }
  ],
  "underwriting_conditions": ["<specific condition 1>", "<specific condition 2>", "<specific condition 3>"],
  "win_strategy": "<3-4 sentences: HOW to win this specific account from ${rfq.existing_insurer || 'the incumbent'} — mention ${rfq.insured_name}, their sector, group size, what pain points they likely have, and what Mediczy should lead with>",
  "risk_flags": ["<specific flag 1 for this group>", "<specific flag 2>", "<specific flag 3>"],
  "usp_talking_points": [
    "<Mediczy-specific USP relevant to this group — e.g. AI-powered claims analytics, Mediqzy health intelligence scores for the group>",
    "<pricing USP — reference our actuarial pricing vs market>",
    "<service USP — TPA management, wellness program, digital tools>"
  ],
  "negotiation_levers": ["<lever 1 specific to this deal>", "<lever 2>", "<lever 3>"],
  "broker_action_plan": {
    "immediate_actions": ["<action to take in next 48 hours>", "<action 2>", "<action 3>"],
    "talk_tracks": ["<what to say to the HR/CFO decision-maker>", "<what to say about incumbent insurer's weakness>"],
    "objection_handling": {
      "price_too_high": "<response when client says our price is too high — reference our target of ₹X,XXX vs market + value adds>",
      "happy_with_current_insurer": "<response when client says they're happy with existing insurer>"
    }
  },
  "trend_insight": "<insight about pricing trends, market conditions, or sector-specific claim trends relevant to this deal>",
  "executive_summary": "<3-4 sentences: overall assessment of this deal's attractiveness, recommended action, and expected outcome. Reference the company name, size, sector, and key risk/opportunity factors>"
}`
          }
        ],
        temperature: 0.3,
        max_tokens: 2500,
      });

      const raw = llmResult.content?.trim() || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        llmIntelligence = JSON.parse(jsonMatch[0]);
      }
    } catch (llmErr) {
      console.error('[AI Intelligence LLM]', llmErr.message);
      llmIntelligence = buildFallbackIntelligence(rfq, industryBenchmarks, avgWonPerLife, winRate);
    }

    // ── 5. Pricing trend from our pipeline ──────────────────────────────
    const trendData = await pool.query(`
      SELECT DATE_TRUNC('month', q.created_at) AS month,
             AVG(q.per_life_cost) AS avg_per_life,
             COUNT(*) AS quote_count
      FROM crm_quotes q
      JOIN crm_rfqs r ON r.id = q.rfq_id
      WHERE q.status NOT IN ('draft')
        AND r.product_type = $1
        AND q.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month ORDER BY month
    `, [productType]);

    const pricingTrend = trendData.rows.map(r => ({
      month: new Date(r.month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      avg_per_life: Math.round(parseFloat(r.avg_per_life) || 0),
      quote_count: parseInt(r.quote_count),
    }));

    return res.json({
      success: true,
      data: {
        rfq_context: {
          insured_name: rfq.insured_name,
          member_count: memberCount,
          policy_type: policyType,
          product_type: productType,
          existing_insurer: rfq.existing_insurer,
        },
        rag_analytics: {
          similar_deals_analyzed: totalSimilar,
          won_deals: wonQuotes.length,
          lost_deals: lostQuotes.length,
          win_rate_pct: winRate,
          our_book_benchmarks: {
            avg_per_life: avgWonPerLife,
            min_per_life: minWonPerLife,
            max_per_life: maxWonPerLife,
            sample_size: wonPerLife.length,
          },
          won_deals_sample: wonQuotes.slice(0, 5).map(r => ({
            insured_name: r.insured_name,
            member_count: r.member_count,
            per_life_quoted: Math.round(parseFloat(r.per_life_quoted) || 0),
            total_premium: Math.round(parseFloat(r.total_premium) || 0),
          })),
        },
        industry_benchmarks: industryBenchmarks,
        win_probability: winProbability,
        underwriting_analysis: underwritingAnalysis,
        llm_intelligence: llmIntelligence,
        recommended_price_per_life: llmIntelligence?.recommended_price_per_life
          || llmIntelligence?.pricing_recommendation?.target_per_life
          || underwritingAnalysis?.premium_waterfall?.gross_premium_per_life
          || null,
        deeptech_signals: deeptechSignals,
        pricing_trend: pricingTrend,
        pipeline_stats: pipelineStats,
        generated_at: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[AI Intelligence]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Intelligence analysis failed' });
  }
});

/**
 * POST /rfqs/:id/ai-proposal
 * Generates a full professional proposal document using LLM
 */
router.post('/rfqs/:id/ai-proposal', authCRM, async (req, res) => {
  try {
    const rfqId = req.params.id;
    const pool = sharedPool;
    const { intelligence } = req.body; // pass intelligence result from previous call

    const [rfqRes, quotesRes] = await Promise.all([
      pool.query(`SELECT * FROM crm_rfqs WHERE id = $1`, [rfqId]),
      pool.query(`SELECT * FROM crm_quotes WHERE rfq_id = $1 AND status NOT IN ('draft') ORDER BY version DESC LIMIT 1`, [rfqId]),
    ]);
    if (!rfqRes.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });

    const rfq = rfqRes.rows[0];
    const quote = quotesRes.rows[0];
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const proposalPrompt = buildProposalPrompt(rfq, quote, intelligence, today);

    let proposalMarkdown = '';
    try {
      const _llm4 = await import('../services/ai-brain/llm-provider.js');
      const callLLM = _llm4.default?.chat || _llm4.chat;
      const result = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are a senior insurance proposal writer at Mediczy, a health insurance intermediary/broker in India.
Write professional, persuasive, data-driven group health insurance proposals.
Format: Markdown with clear sections. Be specific, cite numbers. Tone: professional yet approachable.
Mediqzy (our parent brand) is the technology platform powering Mediczy's analytics and AI.`
          },
          { role: 'user', content: proposalPrompt }
        ],
        temperature: 0.4,
        max_tokens: 2500,
      });
      proposalMarkdown = result.content || '';
    } catch (llmErr) {
      console.error('[AI Proposal LLM]', llmErr.message);
      proposalMarkdown = buildFallbackProposal(rfq, quote, today);
    }

    return res.json({
      success: true,
      data: {
        proposal_markdown: proposalMarkdown,
        rfq_number: rfq.rfq_number,
        insured_name: rfq.insured_name,
        generated_at: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[AI Proposal]', error.message);
    return res.status(500).json({ success: false, message: 'Proposal generation failed' });
  }
});

// ── Helper: Industry Benchmark data (India group health, April 2025) ────────
function getIndustryBenchmarks(memberCount, policyType, productType) {
  // Per-life benchmarks vary by group size (India market, INR)
  let sizeCategory, sizeLabel;
  if (memberCount < 50) { sizeCategory = 'micro'; sizeLabel = '<50 lives'; }
  else if (memberCount < 200) { sizeCategory = 'small'; sizeLabel = '50-200 lives'; }
  else if (memberCount < 500) { sizeCategory = 'medium'; sizeLabel = '200-500 lives'; }
  else if (memberCount < 2000) { sizeCategory = 'large'; sizeLabel = '500-2000 lives'; }
  else { sizeCategory = 'xlarge'; sizeLabel = '2000+ lives'; }

  // Base per-life annual premium (GMC SI ₹3L, floater, includes OPD for OPD products)
  const BASE_RATES = {
    micro:  { gmc: 4500, gpa: 800, gmc_opd: 7500, opd: 3500, gtl: 600 },
    small:  { gmc: 3800, gpa: 700, gmc_opd: 6500, opd: 3000, gtl: 550 },
    medium: { gmc: 3200, gpa: 600, gmc_opd: 5500, opd: 2500, gtl: 500 },
    large:  { gmc: 2800, gpa: 550, gmc_opd: 4800, opd: 2200, gtl: 450 },
    xlarge: { gmc: 2400, gpa: 480, gmc_opd: 4200, opd: 1900, gtl: 400 },
  };

  const base = BASE_RATES[sizeCategory];
  const pt = (productType || '').toLowerCase();
  let baseRate = pt.includes('opd') && pt.includes('gmc') ? base.gmc_opd
               : pt.includes('opd') ? base.opd
               : pt === 'gpa' ? base.gpa
               : pt === 'gtl' ? base.gtl
               : base.gmc;

  // Medical inflation trend (2024-25): ~12-14% YoY
  const inflationFactor = 1.13;

  return {
    size_category: sizeLabel,
    product_type: productType,
    market_per_life: {
      floor: Math.round(baseRate * 0.80),
      median: Math.round(baseRate * inflationFactor),
      ceiling: Math.round(baseRate * inflationFactor * 1.25),
    },
    inflation_rate_pct: 13,
    medical_trend_pct: 8,
    notes: `India group health market benchmarks for ${sizeLabel}, ${productType} (Q1 2026). SI assumed ₹3L floater base. Actual rates vary by SI, age profile, claims history, and insurer underwriting guidelines.`,
  };
}

// ── Helper: Win probability heuristic ────────────────────────────────────────
function computeWinProbability({ memberCount, policyType, productType, existingInsurer, wonDealsCount, lostDealsCount, avgWonPerLife, industryBenchmarks, riskTier, premiumPaid }) {
  let score = 50; // baseline
  const factors = [];

  // Group size scoring — tiered by our operational sweet spot
  if (memberCount >= 500 && memberCount <= 2000) { score += 12; factors.push({ label: 'Sweet-spot group size (500–2000)', impact: +12 }); }
  else if (memberCount >= 200 && memberCount <= 5000) { score += 7; factors.push({ label: 'Good group size segment', impact: +7 }); }
  else if (memberCount < 50) { score -= 12; factors.push({ label: 'Micro group — hyper-competitive market', impact: -12 }); }
  else if (memberCount >= 50 && memberCount < 200) { score -= 3; factors.push({ label: 'Small group — competitive', impact: -3 }); }
  else if (memberCount > 10000) { score -= 8; factors.push({ label: 'Very large group — direct insurer competition', impact: -8 }); }

  // Historical win rate for similar deals
  const total = wonDealsCount + lostDealsCount;
  if (total >= 3) {
    const wr = wonDealsCount / total;
    const scoreAdj = Math.round((wr - 0.5) * 30);
    score += scoreAdj;
    factors.push({ label: `Historical win rate on similar deals: ${Math.round(wr * 100)}%`, impact: scoreAdj });
  }

  // Existing insurer: type-based signals
  if (existingInsurer && existingInsurer.trim() && existingInsurer !== 'Not disclosed') {
    // Renewal = client is actively shopping — that's a good signal
    score += 5;
    factors.push({ label: 'Active renewal — client is in market', impact: +5 });

    if (/new india|united india|national insurance|oriental/i.test(existingInsurer)) {
      score += 10;
      factors.push({ label: 'PSU incumbent — strong digital/service migration opportunity', impact: +10 });
    } else if (/star health|icici lombard|hdfc ergo|bajaj allianz|care health|niva bupa|reliance general/i.test(existingInsurer)) {
      score += 3;
      factors.push({ label: 'Private insurer incumbent — competitive but winnable on service/price', impact: +3 });
    }
  } else {
    score += 3;
    factors.push({ label: 'Fresh account — no incumbent to unseat', impact: +3 });
  }

  // Risk tier: preferred = easier to win (we can be competitive on price)
  if (riskTier === 'Preferred') { score += 8; factors.push({ label: 'Preferred risk tier — competitive pricing advantage', impact: +8 }); }
  else if (riskTier === 'High Risk') { score -= 10; factors.push({ label: 'High risk tier — pricing likely uncompetitive vs market', impact: -10 }); }

  // Prior premium: if we know it, we can benchmark our price vs their current spend
  if (premiumPaid) {
    const priorPremium = parseFloat(premiumPaid);
    if (priorPremium > 0 && memberCount > 0) {
      const priorPerLife = priorPremium / memberCount;
      const marketMedian = industryBenchmarks.market_per_life.median;
      if (priorPerLife > marketMedian * 1.15) {
        score += 7;
        factors.push({ label: 'Prior premium above market median — price-down opportunity', impact: +7 });
      } else if (priorPerLife < marketMedian * 0.90) {
        score -= 5;
        factors.push({ label: 'Prior premium below market median — hard to beat on price', impact: -5 });
      }
    }
  }

  // Our benchmark availability
  if (avgWonPerLife) { score += 5; factors.push({ label: 'Own book benchmark available for this segment', impact: +5 }); }

  score = Math.max(10, Math.min(95, score));

  let category, color;
  if (score >= 70) { category = 'High'; color = 'emerald'; }
  else if (score >= 45) { category = 'Moderate'; color = 'amber'; }
  else { category = 'Low'; color = 'red'; }

  return { score, category, color, factors };
}

// ── Helper: Actuarial underwriting analysis ───────────────────────────────────
function computeUnderwritingAnalysis({ memberCount, memberProfile, ageBands, claimsExperience, industryBenchmarks, premiumPaid, policyType }) {
  // India group health age loading factors (base: 30-44 = 1.0)
  const AGE_LOADING = { '0-17': 0.70, '18-29': 0.88, '30-44': 1.00, '45-54': 1.48, '55-64': 1.90, '65+': 2.40 };

  // 1. Weighted age loading
  const totalAged = ageBands.reduce((s, b) => s + b.count, 0);
  let weightedAgeLoading = 1.0;
  if (totalAged > 0) {
    weightedAgeLoading = ageBands.reduce((sum, b) => sum + (AGE_LOADING[b.age_band] || 1.0) * b.count, 0) / totalAged;
  }

  // 2. Dependency loading
  const employees = parseInt(memberProfile.unique_employees) || 1;
  const dependents = parseInt(memberProfile.dependent_count) || 0;
  const dependencyRatio = Math.round((dependents / employees) * 100) / 100;
  const dependencyLoading = dependencyRatio > 2.5 ? 1.20 : dependencyRatio > 1.5 ? 1.10 : dependencyRatio > 0.5 ? 1.05 : 1.00;

  // 3. SI adequacy loading
  const avgSI = parseFloat(memberProfile.avg_si) || 300000;
  const siLoading = avgSI < 200000 ? 1.10 : avgSI < 300000 ? 1.05 : avgSI >= 1000000 ? 0.95 : 1.00;

  // 4. Claims experience loading (experience rating)
  let claimsLoading = 1.0;
  let icr = null, claimsFreq = null, avgSeverity = null, burningCost = null;
  const totalClaims = parseInt(claimsExperience.total_claims) || 0;
  const premiumBase = parseFloat(premiumPaid) || 0;

  if (totalClaims > 0 && premiumBase > 0) {
    const totalApproved = parseFloat(claimsExperience.total_approved) || 0;
    icr = totalApproved / premiumBase;
    claimsFreq = totalClaims / (memberCount || 1);
    avgSeverity = parseFloat(claimsExperience.avg_claim_severity) || 0;
    burningCost = totalApproved / (memberCount || 1);
    claimsLoading = icr > 1.20 ? 1.35 : icr > 1.00 ? 1.20 : icr > 0.85 ? 1.10 : icr > 0.70 ? 1.00 : icr > 0.50 ? 0.92 : 0.85;
  } else if (totalClaims > 0) {
    // Claims exist but no premium — use normative benchmark
    const totalApproved = parseFloat(claimsExperience.total_approved) || 0;
    burningCost = totalApproved / (memberCount || 1);
  }

  // 5. Medical inflation FY2025-26
  const inflationLoading = 1.13;

  // 6. Pure premium (expected claims cost per member per year)
  const basePremium = industryBenchmarks.market_per_life.median;
  let purePremiumPerLife;
  if (burningCost && burningCost > 0) {
    // Credibility-weighted: blend experience (burning cost) + manual (market) based on group size
    const credibility = Math.min((memberCount || 0) / 500, 1.0);
    purePremiumPerLife = Math.round(
      (burningCost * claimsLoading * credibility) +
      (basePremium * weightedAgeLoading * dependencyLoading * siLoading * (1 - credibility))
    );
  } else {
    purePremiumPerLife = Math.round(basePremium * weightedAgeLoading * dependencyLoading * siLoading * inflationLoading);
  }

  // 7. Gross premium waterfall (India group health structure)
  const EXPENSE_RATIO = 0.22;   // management, admin, commission
  const PROFIT_MARGIN = 0.06;   // insurer target margin
  const REINSURANCE = 0.03;     // RI cost (for large groups / high SI)
  const IBNR_CAT = 0.02;        // IBNR + catastrophe provision
  const retentionRatio = 1 - EXPENSE_RATIO - PROFIT_MARGIN - REINSURANCE - IBNR_CAT;
  const grossPremiumPerLife = Math.round(purePremiumPerLife / retentionRatio);
  const totalGrossPremium = grossPremiumPerLife * (memberCount || 1);

  // 8. Risk classification (underwriting tier)
  const highRiskPct = ((parseInt(memberProfile.high_risk_age_count) || 0) / (parseInt(memberProfile.total_members) || 1)) * 100;
  let riskScore = 0;
  if (weightedAgeLoading > 1.5) riskScore += 3; else if (weightedAgeLoading > 1.25) riskScore += 2; else riskScore += 1;
  if (dependencyRatio > 2.5) riskScore += 2; else if (dependencyRatio > 1.5) riskScore += 1;
  if (icr !== null) { if (icr > 1.0) riskScore += 3; else if (icr > 0.85) riskScore += 2; else if (icr > 0.70) riskScore += 1; } else riskScore += 1;
  if (highRiskPct > 30) riskScore += 2; else if (highRiskPct > 15) riskScore += 1;

  const riskTier = riskScore >= 7 ? 'High Risk' : riskScore >= 4 ? 'Standard' : 'Preferred';
  const riskColor = riskScore >= 7 ? 'red' : riskScore >= 4 ? 'amber' : 'emerald';
  const keyRiskDrivers = [
    weightedAgeLoading > 1.3 ? `Adverse age profile (+${Math.round((weightedAgeLoading-1)*100)}% age loading)` : null,
    dependencyRatio > 1.5 ? `High dependency ratio (${dependencyRatio}:1)` : null,
    icr !== null && icr > 0.85 ? `Prior ICR ${(icr*100).toFixed(1)}% — experience surcharge applies` : null,
    highRiskPct > 20 ? `${Math.round(highRiskPct)}% of insured aged 45+` : null,
    avgSI < 200000 ? 'Under-insured sum insured — potential adverse selection risk' : null,
  ].filter(Boolean);

  return {
    has_member_data: totalAged > 0,
    has_claims_data: totalClaims > 0,
    member_profile: {
      total_members: parseInt(memberProfile.total_members) || 0,
      avg_age: parseFloat(memberProfile.avg_age) || null,
      high_risk_age_pct: Math.round(highRiskPct * 10) / 10,
      senior_age_pct: Math.round(((parseInt(memberProfile.senior_age_count)||0) / (parseInt(memberProfile.total_members)||1)) * 1000) / 10,
      dependency_ratio: dependencyRatio,
      avg_si: Math.round(avgSI),
      median_si: Math.round(parseFloat(memberProfile.median_si) || 0),
      male_pct: (parseInt(memberProfile.male_count)||0) > 0 ? Math.round((parseInt(memberProfile.male_count)/(parseInt(memberProfile.total_members)||1))*100) : null,
    },
    age_bands: ageBands,
    claims_experience: totalClaims > 0 ? {
      total_claims: totalClaims,
      unique_claimants: parseInt(claimsExperience.unique_claimants) || 0,
      total_claimed: Math.round(parseFloat(claimsExperience.total_claimed) || 0),
      total_approved: Math.round(parseFloat(claimsExperience.total_approved) || 0),
      avg_severity: Math.round(avgSeverity || 0),
      max_claim: Math.round(parseFloat(claimsExperience.max_claim) || 0),
      icr_pct: icr !== null ? Math.round(icr * 1000) / 10 : null,
      claims_freq_per_100: claimsFreq !== null ? Math.round(claimsFreq * 1000) / 10 : null,
      burning_cost_per_life: burningCost !== null ? Math.round(burningCost) : null,
    } : null,
    loadings: {
      age_loading: Math.round(weightedAgeLoading * 100) / 100,
      dependency_loading: dependencyLoading,
      si_loading: siLoading,
      claims_loading: claimsLoading,
      inflation_loading: inflationLoading,
      total_loading: Math.round(weightedAgeLoading * dependencyLoading * siLoading * claimsLoading * inflationLoading * 100) / 100,
    },
    premium_waterfall: {
      base_market_per_life: basePremium,
      pure_premium_per_life: purePremiumPerLife,
      gross_premium_per_life: grossPremiumPerLife,
      total_gross_premium: totalGrossPremium,
      expense_ratio_pct: Math.round(EXPENSE_RATIO * 100),
      profit_margin_pct: Math.round(PROFIT_MARGIN * 100),
      reinsurance_pct: Math.round(REINSURANCE * 100),
      ibnr_cat_pct: Math.round(IBNR_CAT * 100),
    },
    risk_classification: {
      tier: riskTier,
      color: riskColor,
      score: riskScore,
      high_risk_age_pct: Math.round(highRiskPct * 10) / 10,
      key_risk_drivers: keyRiskDrivers,
    },
  };
}

// ── Helper: LLM context builder ───────────────────────────────────────────────
// ── Helper: infer industry sector from company name ───────────────────────────
function inferIndustry(name) {
  if (!name) return 'General Corporate';
  const n = name.toLowerCase();
  if (/pharma|laborator|bio|chem|drug|alkem|cipla|sun pharma|lupin|ranbaxy|glenmark|aurobindo/.test(n)) return 'Pharmaceutical / Life Sciences';
  if (/tech|software|it |digital|infosys|tcs|wipro|hcl|cognizant|mphasis|hexaware/.test(n)) return 'Information Technology / IT Services';
  if (/bank|financ|nfbc|capital|insur|invest|mutual fund|securities|asset management/.test(n)) return 'Banking / Financial Services (BFSI)';
  if (/hospital|clinic|health|nursing|care|medic/.test(n)) return 'Healthcare / Hospitals';
  if (/school|college|universit|education|academy|institute/.test(n)) return 'Education';
  if (/manufactur|factor|steel|textile|garment|engg|engineer|industries|auto|component/.test(n)) return 'Manufacturing / Industrial';
  if (/retail|mall|shop|store|supermart|ecomm|amazon|flipkart/.test(n)) return 'Retail / E-commerce';
  if (/hotel|hospitalit|resort|travel|airline|aviation|indigo|spicejet/.test(n)) return 'Hospitality / Travel';
  if (/telecom|jio|airtel|vodafone|bsnl|reliance/.test(n)) return 'Telecom / Media';
  if (/govt|government|municipal|corporation|authority|board|psu/.test(n)) return 'Government / PSU';
  if (/construct|infra|real estate|builder|developer|realty/.test(n)) return 'Construction / Real Estate';
  if (/food|beverage|fmcg|consumer|hul|itc|nestle|britannia/.test(n)) return 'FMCG / Consumer Goods';
  if (/consult|advisory|audit|legal|law|advocate/.test(n)) return 'Professional Services';
  return 'General Corporate';
}

function buildIntelligenceContext(rfq, wonQuotes, lostQuotes, industryBenchmarks, avgWonPerLife, winRate, underwritingAnalysis, deeptechSignals) {
  const uw = underwritingAnalysis || {};
  const mp = uw.member_profile || {};
  const ce = uw.claims_experience;
  const pw = uw.premium_waterfall || {};
  const rc = uw.risk_classification || {};
  const loadings = uw.loadings || {};

  const industryInferred = inferIndustry(rfq.insured_name);
  const isRenewal = !!(rfq.existing_insurer && rfq.existing_insurer.trim() !== 'Not disclosed');
  const isPSUIncumbent = isRenewal && /new india|united india|national insurance|oriental/i.test(rfq.existing_insurer || '');
  const isPrivateIncumbent = isRenewal && /star health|icici lombard|hdfc ergo|bajaj allianz|care health|niva bupa|reliance general/i.test(rfq.existing_insurer || '');
  const cityMatch = (rfq.insured_address || '').match(/mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|pune|kolkata|ahmedabad|noida|gurugram|gurgaon/i);
  const city = cityMatch ? cityMatch[0].charAt(0).toUpperCase() + cityMatch[0].slice(1) : null;

  const deeptechSection = deeptechSignals?.top_diagnoses?.length > 0 ? `
Mediqzy DeepTech Pre-Auth Intelligence (from our claims platform):
- Platform approval rate: ${deeptechSignals.approval_rate_pct}% (last 90 days, all groups)
- Top claim categories on our platform: ${deeptechSignals.top_diagnoses.slice(0, 5).map(d => d.diagnosis_code).join(', ')}
- Avg pre-auth amount (similar group size): ₹${(deeptechSignals.avg_requested_amount || 0).toLocaleString('en-IN')}
- Cardiac/Ortho/Maternity are consistently high-frequency in the ${industryInferred} sector on our platform` : '';

  const actuarialSection = mp.avg_age ? `
Actuarial Member Profile (from uploaded data):
- Average Age: ${mp.avg_age} years | High-risk (45+): ${mp.high_risk_age_pct}%
- Dependency Ratio: ${mp.dependency_ratio} dependents/employee
- Average SI: ₹${(mp.avg_si || 0).toLocaleString('en-IN')}
- Gender Mix: ${mp.male_pct !== null ? `${mp.male_pct}% Male` : 'Not analyzed'}
${ce ? `
Claims Experience (prior year):
- Incurred Claims Ratio (ICR): ${ce.icr_pct}%
- Claims Frequency: ${ce.claims_freq_per_100} per 100 insured
- Average Claim Severity: ₹${(ce.avg_severity || 0).toLocaleString('en-IN')}
- Burning Cost Per Life: ₹${(ce.burning_cost_per_life || 0).toLocaleString('en-IN')}
- Total Claims: ${ce.total_claims} | Max Single Claim: ₹${(ce.max_claim || 0).toLocaleString('en-IN')}` : '- No claims history uploaded (use manual underwriting)'}

Underwriting Loading Analysis:
- Age Loading Factor: ${loadings.age_loading}x
- Dependency Loading: ${loadings.dependency_loading}x
- Claims Experience Loading: ${loadings.claims_loading}x
- Medical Inflation (2025-26): ${loadings.inflation_loading}x
- Total Combined Loading: ${loadings.total_loading}x

Actuarial Premium Waterfall:
- Base Market Rate: ₹${(pw.base_market_per_life || 0).toLocaleString('en-IN')}/life
- Pure Premium (risk cost): ₹${(pw.pure_premium_per_life || 0).toLocaleString('en-IN')}/life
- Gross Premium per Life: ₹${(pw.gross_premium_per_life || 0).toLocaleString('en-IN')}/life
- Total Gross Premium: ₹${(pw.total_gross_premium || 0).toLocaleString('en-IN')}
- Risk Classification: ${rc.tier} (Score: ${rc.score})` : '';

  return `Group: ${rfq.insured_name}
- Member Count: ${rfq.member_count} lives
- Policy Type: ${rfq.policy_type}
- Product: ${rfq.product_type}
- Industry Sector: ${industryInferred}
- Business Type: ${isRenewal ? `RENEWAL (from ${rfq.existing_insurer}${isPSUIncumbent ? ' — PSU, migration opportunity' : isPrivateIncumbent ? ' — private incumbent, strong competition' : ''})` : 'FRESH BUSINESS (new account)'}
- Existing TPA: ${rfq.existing_tpa || 'Not disclosed'}
- Location: ${city ? `${city}, India` : (rfq.insured_address || 'India')}
- Policy Period: ${rfq.policy_start ? new Date(rfq.policy_start).toISOString().slice(0,10) : 'TBD'} to ${rfq.policy_end ? new Date(rfq.policy_end).toISOString().slice(0,10) : 'TBD'}
- Prior Premium: ${rfq.premium_paid ? `₹${parseFloat(rfq.premium_paid).toLocaleString('en-IN')}` : 'Not disclosed'}
${actuarialSection}
${deeptechSection}
Our Historical Performance (similar-sized groups, same product type):
- Won deals: ${wonQuotes.length}, Lost deals: ${lostQuotes.length}, Win rate: ${winRate}%
- Our avg per-life on won deals: ${avgWonPerLife ? `₹${avgWonPerLife.toLocaleString()}` : 'N/A'}
- Lost deal reasons: ${lostQuotes.map(r => r.lost_reason).filter(Boolean).join('; ') || 'Not recorded'}

Industry Benchmarks (${industryBenchmarks.size_category}):
- Market per-life range: ₹${industryBenchmarks.market_per_life.floor.toLocaleString()} – ₹${industryBenchmarks.market_per_life.ceiling.toLocaleString()}
- Median: ₹${industryBenchmarks.market_per_life.median.toLocaleString()}
- Medical inflation: ~${industryBenchmarks.inflation_rate_pct}% YoY (India FY2025-26)

INSTRUCTIONS: Respond with deeply specific, actionable intelligence for THIS exact deal — reference the company name "${rfq.insured_name}", sector "${industryInferred}", group size ${rfq.member_count}, ${isRenewal ? `renewal from ${rfq.existing_insurer}` : 'fresh account'}${city ? `, located in ${city}` : ''}. Do not give generic advice.`;
}

// ── Helper: Fallback intelligence (no LLM) ───────────────────────────────────
function buildFallbackIntelligence(rfq, industryBenchmarks, avgWonPerLife, winRate) {
  const bm = industryBenchmarks.market_per_life;
  return {
    recommended_price_per_life: avgWonPerLife || bm.median,
    market_position: 'competitive',
    underwriting_decision: 'Acceptable',
    underwriting_notes: 'Standard group health risk. No adverse features noted from available data.',
    competitor_benchmarks: [
      { insurer: 'Star Health', estimated_per_life_range: `₹${bm.floor.toLocaleString()}-₹${bm.median.toLocaleString()}`, notes: 'Aggressive on renewal migration; strong retail brand' },
      { insurer: 'ICICI Lombard', estimated_per_life_range: `₹${bm.median.toLocaleString()}-₹${bm.ceiling.toLocaleString()}`, notes: 'Strong TPA network, conservative underwriting' },
      { insurer: 'Niva Bupa', estimated_per_life_range: `₹${Math.round(bm.floor*0.9).toLocaleString()}-₹${bm.median.toLocaleString()}`, notes: 'Competitive mid-size groups; good tech platform' },
      { insurer: 'HDFC Ergo', estimated_per_life_range: `₹${bm.median.toLocaleString()}-₹${Math.round(bm.ceiling*1.05).toLocaleString()}`, notes: 'Premium positioning, wide cashless network' },
      { insurer: 'Care Health', estimated_per_life_range: `₹${Math.round(bm.floor*0.85).toLocaleString()}-₹${bm.median.toLocaleString()}`, notes: 'Growing share; often undercuts on price for new business' },
    ],
    pricing_recommendation: {
      floor_per_life: bm.floor,
      target_per_life: avgWonPerLife || bm.median,
      ceiling_per_life: bm.ceiling,
      rationale: 'Priced at market median using manual underwriting basis. Upload member data for experience-rated actuarial pricing.',
    },
    claims_prediction: {
      expected_icr_pct: 72,
      expected_claims_frequency_per_100: 18,
      predicted_high_cost_claims: 'Low-moderate probability of high-cost claims based on group size.',
      ibnr_provision_pct: 5,
    },
    disease_prediction: [
      { disease: 'Cardiac / Hypertension', expected_frequency_pct: 18, rationale: 'Top claim category for corporate groups in India aged 35+' },
      { disease: 'Diabetes (Type 2)', expected_frequency_pct: 14, rationale: 'High prevalence in sedentary office-based workforce' },
      { disease: 'Musculoskeletal / Orthopaedic', expected_frequency_pct: 12, rationale: 'Back pain and joint issues common in desk-based employees' },
    ],
    underwriting_conditions: ['Medical history declaration required for members above 60 years', 'Pre-existing disease waiting period: 12 months (waivable subject to loading)', 'No room rent capping recommended for SI ≥ ₹5L'],
    win_strategy: `Lead with Mediczy's technology advantage — AI-powered underwriting, real-time claims analytics, and the Mediqzy Health Intelligence Score platform. Target the HR/CFO with a clear cost-benefit narrative vs ${rfq.existing_insurer || 'their current insurer'}.`,
    risk_flags: ['Age profile not analyzed — upload member data for precise actuarial pricing', 'Prior claims history unavailable — underwriting on manual basis only'],
    usp_talking_points: ['Mediqzy DeepTech™: AI Health Intelligence Score for every employee — unique in India', 'AI-powered claims analytics with real-time group dashboards', 'Cashless at 15,000+ hospitals pan-India', 'Dedicated underwriter + relationship manager + wellness program'],
    negotiation_levers: ['Co-pay on out-patient to reduce premium by 5-8%', 'Disease-wise sublimits for cost-effective pricing', 'Wellness discount for health check-up compliance', 'Multi-year lock-in for rate stability'],
    broker_action_plan: {
      immediate_actions: [
        'Send introductory deck with Mediczy AI platform demo within 48 hours',
        'Request last 3 years claims data from client for experience-rated pricing',
        'Schedule HR/CFO meeting to present Mediqzy Health Intelligence Score',
      ],
      talk_tracks: [
        `Highlight that Mediczy's AI analytics will give their HR team a real-time view of group health that no other insurer provides`,
        `Point out any known issues with ${rfq.existing_insurer || 'the current insurer'} — claim settlement delays or network gaps`,
      ],
      objection_handling: {
        price_too_high: `Our target of ₹${(avgWonPerLife || bm.median).toLocaleString()} is in line with market median. We can optimize with co-pay/sublimits. Plus our Mediqzy wellness program has shown 8-12% claims reduction in similar groups.`,
        happy_with_current_insurer: "We completely understand. Our ask is simple — let us run a parallel benchmarking analysis using our AI platform. If we can't improve on price + service, we'll say so honestly. Zero obligation.",
      },
    },
    trend_insight: `Medical inflation in India running at ~13% YoY (FY2025-26). ${rfq.product_type} premiums in ${industryBenchmarks.size_category} segment have risen 10-15% vs FY24. ICR trend: industry avg ~85% for group health.`,
    executive_summary: `${rfq.member_count}-life ${rfq.product_type} group health RFQ from ${rfq.insured_name}. Market benchmark: ₹${bm.floor.toLocaleString()}–₹${bm.ceiling.toLocaleString()} per life. Historical win rate on similar deals: ${winRate}%. Risk profile: Standard. Recommended underwriting action: Quote at target per-life with standard T&Cs.`,
  };
}

// ── Helper: Proposal prompt ───────────────────────────────────────────────────
function buildProposalPrompt(rfq, quote, intelligence, today) {
  const bm = intelligence?.industry_benchmarks?.market_per_life;
  const quoteInfo = quote ? `
Latest Quote:
- Total Premium: ₹${Math.round(parseFloat(quote.total_premium) || 0).toLocaleString()}
- Per Life: ₹${Math.round(parseFloat(quote.per_life_cost) || 0).toLocaleString()}
- Per Family: ₹${Math.round(parseFloat(quote.per_family_cost) || 0).toLocaleString()}
- Valid Until: ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-IN') : 'TBD'}
- Quote Number: ${quote.quote_number}` : 'No quote generated yet.';

  return `Write a professional group health insurance proposal for the following:

Date: ${today}
Client: ${rfq.insured_name}
Address: ${rfq.insured_address || 'India'}
Broker: ${rfq.broker_name || rfq.broker_company ? `${rfq.broker_name || ''} (${rfq.broker_company || ''})` : 'Direct'}
Policy Type: ${rfq.policy_type}
Product: ${rfq.product_type}
Group Size: ${rfq.member_count} members
Existing Insurer: ${rfq.existing_insurer || 'Not disclosed'}
Existing TPA: ${rfq.existing_tpa || 'Not disclosed'}
Policy Period: ${rfq.policy_start ? new Date(rfq.policy_start).toISOString().slice(0,10) : 'TBD'} to ${rfq.policy_end ? new Date(rfq.policy_end).toISOString().slice(0,10) : 'TBD'}
${quoteInfo}
${bm ? `Market Context: Industry per-life range ₹${bm.floor.toLocaleString()}–₹${bm.ceiling.toLocaleString()} for this segment.` : ''}
${intelligence?.llm_intelligence?.win_strategy ? `Win Strategy: ${intelligence.llm_intelligence.win_strategy}` : ''}
${intelligence?.llm_intelligence?.usp_talking_points ? `USPs: ${intelligence.llm_intelligence.usp_talking_points.join(', ')}` : ''}

Write a complete proposal with these sections:
1. Executive Summary
2. Understanding Your Needs
3. Our Proposed Solution
4. Coverage Highlights
5. Pricing Overview (use the quote data if available)
6. Why Mediczy — Our Competitive Edge
7. Technology Platform (Mediczy AI Analytics)
8. Service & Claims Support
9. Terms & Validity
10. Next Steps

Make it persuasive, data-specific, and professional. Include relevant statistics about Indian group health market trends where appropriate.`;
}

// ── Helper: Fallback proposal (no LLM) ───────────────────────────────────────
function buildFallbackProposal(rfq, quote, today) {
  const premium = quote ? `₹${Math.round(parseFloat(quote.total_premium) || 0).toLocaleString()}` : 'TBD';
  const perLife = quote ? `₹${Math.round(parseFloat(quote.per_life_cost) || 0).toLocaleString()}` : 'TBD';
  return `# Group Health Insurance Proposal

**Prepared for:** ${rfq.insured_name}  
**Date:** ${today}  
**RFQ Reference:** ${rfq.rfq_number}  
**Product:** ${rfq.policy_type} — ${rfq.product_type}  

---

## Executive Summary

We are pleased to present our proposal for Group Health Insurance coverage for **${rfq.insured_name}** covering **${rfq.member_count} members**.

---

## Proposed Solution

| Parameter | Details |
|-----------|---------|
| Policy Type | ${rfq.policy_type} |
| Product | ${rfq.product_type} |
| Group Size | ${rfq.member_count} lives |
| Existing Insurer | ${rfq.existing_insurer || 'Not disclosed'} |
| Total Premium | **${premium}** |
| Per Life | **${perLife}** |

---

## Why Mediczy

- **AI-Powered Analytics** — Real-time claims intelligence and cost benchmarking
- **Cashless Network** — Access to 10,000+ hospitals pan-India
- **Dedicated Account Manager** — Single point of contact for all queries
- **Member Self-Service Portal** — Mobile app for cards, claims status, and benefits
- **Quarterly Business Reviews** — Proactive cost management and trend reporting

---

## Next Steps

1. Share member data for age-banded actuarial pricing
2. Upload last 2 years claims experience for experience-rated pricing
3. Schedule a presentation with your team

---

*This proposal is valid for 30 days from the date of issue. All rates are subject to member data verification and underwriter approval.*

**Mediczy Insurance Broking**  
*Powered by Mediqzy AI Platform*`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ─── Product T&C Master ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Splits raw T&C text from a parsed RFQ into individual clauses and upserts
 * them into crm_product_tc_master as pending (is_pending=true, is_active=false).
 * Deduplicates by trimmed content match so re-parsing the same RFQ is safe.
 */
async function syncTCsFromRFQ(rfqId, productType, tcText, createdBy) {
  if (!tcText || !tcText.trim()) return;
  const pool = sharedPool;
  // Split on numbered items, bullet points, or double newlines
  const clauses = tcText
    .split(/\n{2,}|(?:\r?\n)(?=\s*[\d•\-*]\s)/)
    .map(c => c.replace(/^[\d\.\-•*\s]+/, '').trim())
    .filter(c => c.length > 10);

  for (const clause of clauses) {
    // Skip if identical content already exists for this product_type
    const { rowCount } = await pool.query(
      `SELECT 1 FROM crm_product_tc_master WHERE product_type=$1 AND content=$2 LIMIT 1`,
      [productType, clause]
    );
    if (rowCount > 0) continue;

    // Derive a short title from first sentence / first 60 chars
    const title = clause.split(/[.\n]/)[0].trim().slice(0, 120) || 'Parsed clause';
    await pool.query(
      `INSERT INTO crm_product_tc_master
         (product_type, section, title, content, source_rfq_id, is_active, is_pending, created_by)
       VALUES ($1,'parsed',$2,$3,$4,FALSE,TRUE,$5)`,
      [productType, title, clause, rfqId, createdBy || null]
    );
  }
}

// Guard: only CRM users with admin/manager permission or isAdmin flag may manage the T&C master
function requireTCAdmin(req, res, next) {
  const user = req.crmUser || {};
  // Middleware stores permissions as user.permissions (decoded from JWT)
  const perms = user.permissions || user.crmPermissions || [];
  const isAdmin = user.isAdmin === true || user.role === 'admin' || user.role === 'superadmin';
  if (!isAdmin && !perms.includes('admin') && !perms.includes('superadmin') && !perms.includes('manager')) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions to manage T&C master' });
  }
  next();
}

// ─── List T&C Master ──────────────────────────────────────────────────────────
// GET /api/crm/tc-master?product_type=GMC&section=general&pending=true
router.get('/tc-master', authCRM, async (req, res) => {
  try {
    const { product_type, section, pending } = req.query;
    const cond = []; const params = [];
    if (product_type && product_type !== 'all') { params.push(product_type); cond.push(`product_type = $${params.length}`); }
    if (section)      { params.push(section); cond.push(`section = $${params.length}`); }
    if (pending === 'true')  { cond.push(`is_pending = TRUE`); }
    if (pending === 'false') { cond.push(`is_pending = FALSE`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await sharedPool.query(
      `SELECT t.*,
              r.rfq_number AS source_rfq_number, r.insured_name AS source_insured_name
       FROM crm_product_tc_master t
       LEFT JOIN crm_rfqs r ON r.id = t.source_rfq_id
       ${where}
       ORDER BY t.product_type, t.section, t.sort_order, t.created_at DESC`,
      params
    );
    return res.json({
      success: true,
      data: rows,
      productTypes: CANONICAL_PRODUCT_TYPES,
      labels: PRODUCT_TYPE_LABELS,
      sections: ['general', 'coverage', 'exclusions', 'special', 'regulatory', 'pricing', 'renewal', 'parsed'],
    });
  } catch (err) { console.error('[TC Master List]', err.message); return res.status(500).json({ success: false, message: 'Failed to fetch T&C master' }); }
});

// GET /api/crm/tc-master/active/:productType  — active T&Cs for quote creation
router.get('/tc-master/active/:productType', authCRM, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, section, title, content, sort_order
       FROM crm_product_tc_master
       WHERE product_type = $1 AND is_active = TRUE AND is_pending = FALSE
       ORDER BY section, sort_order, created_at`,
      [req.params.productType]
    );
    return res.json({ success: true, data: rows, label: PRODUCT_TYPE_LABELS[req.params.productType] || req.params.productType });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to fetch active T&Cs' }); }
});

// ─── Create T&C Entry ─────────────────────────────────────────────────────────
router.post('/tc-master', authCRM, requireTCAdmin, async (req, res) => {
  try {
    const { product_type, section = 'general', title, content, sort_order = 0 } = req.body;
    if (!product_type || !title || !content) {
      return res.status(400).json({ success: false, message: 'product_type, title and content are required' });
    }
    if (!CANONICAL_PRODUCT_TYPES.includes(product_type)) {
      return res.status(400).json({ success: false, message: `Invalid product_type. Allowed: ${CANONICAL_PRODUCT_TYPES.join(', ')}` });
    }
    const { rows } = await sharedPool.query(
      `INSERT INTO crm_product_tc_master
         (product_type, section, title, content, sort_order, is_active, is_pending, created_by)
       VALUES ($1,$2,$3,$4,$5,TRUE,FALSE,$6) RETURNING *`,
      [product_type, section, title, content, sort_order, req.crmUser?.id || null]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { console.error('[TC Master Create]', err.message); return res.status(500).json({ success: false, message: 'Failed to create T&C entry' }); }
});

// ─── Update T&C Entry ─────────────────────────────────────────────────────────
router.put('/tc-master/:id', authCRM, requireTCAdmin, async (req, res) => {
  try {
    const { section, title, content, sort_order, is_active, is_pending } = req.body;
    const { rows } = await sharedPool.query(
      `UPDATE crm_product_tc_master SET
         section    = COALESCE($1, section),
         title      = COALESCE($2, title),
         content    = COALESCE($3, content),
         sort_order = COALESCE($4, sort_order),
         is_active  = COALESCE($5, is_active),
         is_pending = COALESCE($6, is_pending),
         updated_by = $7,
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [section || null, title || null, content || null,
       sort_order != null ? sort_order : null,
       is_active != null ? is_active : null,
       is_pending != null ? is_pending : null,
       req.crmUser?.id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'T&C entry not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) { console.error('[TC Master Update]', err.message); return res.status(500).json({ success: false, message: 'Failed to update T&C entry' }); }
});

// ─── Approve pending T&C (single endpoint for is_pending→false, is_active→true) ──
router.post('/tc-master/:id/approve', authCRM, requireTCAdmin, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `UPDATE crm_product_tc_master SET is_active=TRUE, is_pending=FALSE, updated_by=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [req.crmUser?.id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'T&C entry not found' });
    return res.json({ success: true, data: rows[0], message: 'T&C approved and activated' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to approve T&C entry' }); }
});

// ─── Reject/Delete T&C Entry ──────────────────────────────────────────────────
router.delete('/tc-master/:id', authCRM, requireTCAdmin, async (req, res) => {
  try {
    const { rowCount } = await sharedPool.query(`DELETE FROM crm_product_tc_master WHERE id=$1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'T&C entry not found' });
    return res.json({ success: true, message: 'T&C entry deleted' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to delete T&C entry' }); }
});

// ─── Bulk approve all pending for a product type ──────────────────────────────
router.post('/tc-master/bulk-approve', authCRM, requireTCAdmin, async (req, res) => {
  try {
    const { product_type } = req.body;
    const cond = product_type ? `AND product_type = $2` : '';
    const params = product_type ? [req.crmUser?.id || null, product_type] : [req.crmUser?.id || null];
    const { rowCount } = await sharedPool.query(
      `UPDATE crm_product_tc_master SET is_active=TRUE, is_pending=FALSE, updated_by=$1, updated_at=NOW()
       WHERE is_pending=TRUE ${cond}`,
      params
    );
    return res.json({ success: true, message: `${rowCount} T&C entries approved`, count: rowCount });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed to bulk-approve T&C entries' }); }
});

// ─── Sync T&Cs from a specific RFQ into pending master ───────────────────────
// POST /api/crm/tc-master/sync-rfq/:rfqId
router.post('/tc-master/sync-rfq/:rfqId', authCRM, requireTCAdmin, async (req, res) => {
  try {
    const { rows } = await sharedPool.query(
      `SELECT id, product_type, terms_and_conditions FROM crm_rfqs WHERE id = $1`,
      [req.params.rfqId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'RFQ not found' });
    const rfq = rows[0];
    if (!rfq.terms_and_conditions) {
      return res.status(400).json({ success: false, message: 'This RFQ has no parsed terms & conditions to sync' });
    }
    await syncTCsFromRFQ(rfq.id, rfq.product_type, rfq.terms_and_conditions, req.crmUser?.id);
    // Count how many pending were created
    const { rows: pending } = await sharedPool.query(
      `SELECT COUNT(*) FROM crm_product_tc_master WHERE source_rfq_id=$1 AND is_pending=TRUE`,
      [rfq.id]
    );
    return res.json({
      success: true,
      message: `Synced T&Cs from RFQ — ${pending[0].count} pending clauses awaiting admin approval`,
      pendingCount: parseInt(pending[0].count),
    });
  } catch (err) { console.error('[TC Sync]', err.message); return res.status(500).json({ success: false, message: 'Failed to sync T&Cs from RFQ' }); }
});

export default router;
