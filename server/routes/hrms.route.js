import express from 'express';
import multer from 'multer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { Op } from 'sequelize';
import { JWT_CONFIG } from '../config/auth.config.js';
import sharedPool from '../db/pgPool.js';
import User from '../models/postgres/user.model.postgres.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import { uploadToMinio } from '../services/minio-upload.service.js';
import { resolveOrgTypeForTenant } from '../utils/organizationType.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});
const hrDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const HR_ALLOWED_ROLES = new Set(['hr_staff', 'hospital_admin', 'corporate_admin', 'admin', 'system_admin', 'super_admin']);
const HR_USER_ROLES = ['hr_staff', 'hospital_admin', 'corporate_admin'];
// Super-users see every location for their tenant; everyone else is scoped to their own assigned locations.
const HR_SUPER_USER_ROLES = new Set(['hospital_admin', 'corporate_admin', 'admin', 'system_admin', 'super_admin']);

/**
 * Resolve the requesting HR user's location scope. Super-users (tenant admins) see
 * everything; sub-users (hr_staff) are restricted to the facilities/branches/locations
 * assigned to their account (scope.locationIds, set at creation via POST /users).
 */
async function getRequesterLocationScope(req) {
  const role = req.hrUser?.role || req.hrUser?.userRole;
  if (HR_SUPER_USER_ROLES.has(role)) {
    return { isSuperUser: true, locationIds: null };
  }
  const requester = await User.findByPk(req.hrUser?.id).catch(() => null);
  const locationIds = normalizeArray(requester?.scope?.locationIds || requester?.metadata?.locationIds || []).map(String);
  return { isSuperUser: false, locationIds };
}
const HR_FEATURE_CATALOG = [
  { key: 'employee_database', label: 'Employee database' },
  { key: 'leave_management', label: 'Leave management' },
  { key: 'onboarding_offboarding', label: 'Onboarding & offboarding' },
  { key: 'document_management', label: 'Document management' },
  { key: 'attendance_tracking', label: 'Attendance tracking' },
  { key: 'shift_roster_management', label: 'Shift & roster management' },
  { key: 'timesheets', label: 'Timesheets' },
  { key: 'performance_appraisals', label: 'Performance appraisals' },
  { key: 'goals_okrs', label: 'Goals & OKRs' },
  { key: 'compensation_salary_revisions', label: 'Compensation & salary revisions' },
  { key: 'employee_engagement_surveys', label: 'Employee engagement surveys' },
  { key: 'learning_management_system', label: 'Learning Management System (LMS)' },
  { key: 'hr_help_desk', label: 'HR Help Desk' },
  { key: 'recruitment_ai_inbox', label: 'AI recruitment inbox and CV storage' },
  { key: 'multi_location_people_management', label: 'Multiple locations, branches, and HR user scope' },
];
const STAFF_ROLES = [
  'doctor',
  'nurse',
  'doctor_assistant',
  'staff',
  'receptionist',
  'billing',
  'accounts_staff',
  'mrd_staff',
  'insurance_desk_staff',
  'hr_staff',
  'it_edp_staff',
  'ot_staff',
  'icu_staff',
  'quality_staff',
  'security_staff',
  'pharmacy_staff',
  'lab_staff'
];
const DEVICE_STATUSES = new Set(['online', 'offline', 'maintenance']);
const ATTENDANCE_EVENT_TYPES = new Set(['check_in', 'check_out', 'in', 'out']);
const BENEFIT_STATUSES = new Set(['active', 'inactive', 'renewal_due', 'expired']);
const PERFORMANCE_STATUSES = new Set(['draft', 'manager_review', 'hr_review', 'completed']);
const MAX_BIOMETRIC_EVENTS_PER_REQUEST = 500;
const CV_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toISOString().slice(11, 16);
const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const safeText = (value, max = 255) => String(value || '').trim().slice(0, max);
const toJsonObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clampInt = (value, fallback, min = 0, max = 10000) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};
const asDateOnly = (value, fallback = todayISO()) => {
  const date = String(value || fallback || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
};
const asTimeOnly = (value, fallback = nowTime()) => {
  const time = String(value || fallback);
  return /^\d{2}:\d{2}$/.test(time) ? time : fallback;
};
const parseEventTimestamp = (value, fallbackDate = todayISO(), fallbackTime = nowTime()) => {
  const raw = value || `${asDateOnly(fallbackDate)}T${asTimeOnly(fallbackTime)}:00.000Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(`${todayISO()}T${nowTime()}:00.000Z`) : parsed;
};
const makeTemporaryPassword = () => `${crypto.randomBytes(12).toString('base64url')}aA1!`;
const normalizeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : String(value || '').split(',').map(v => v.trim()).filter(Boolean);
const looksLikeCv = (file = {}) => {
  const name = String(file.filename || file.originalname || '').toLowerCase();
  const type = String(file.contentType || file.mimetype || '').toLowerCase();
  return CV_MIME_TYPES.has(type) || /\.(pdf|doc|docx|txt)$/i.test(name) || /\b(cv|resume|curriculum[_ -]?vitae)\b/i.test(name);
};
const inferRecruitmentIntent = ({ subject = '', body = '', attachments = [] }) => {
  const text = `${subject} ${body}`.toLowerCase();
  if (attachments.some(looksLikeCv) || /\b(cv|resume|candidate|application|applying|job|vacancy|interview|hiring|recruitment)\b/.test(text)) return 'recruitment';
  if (/\b(benefit|insurance|policy|renewal|premium|coverage|wellness|allowance|esi|pf|claim)\b/.test(text)) return 'benefits';
  return 'general';
};
const buildCandidateFromEmail = (email) => {
  const body = email.body_text || '';
  const fromName = safeText(email.from_name || '', 160);
  const fromAddr = safeText(email.from_addr || '', 255);
  const subject = safeText(email.subject || '', 255);
  const emailMatch = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = body.match(/(?:\+?91[-\s]?)?[6-9]\d{9}/);
  const name = fromName || subject.replace(/^(cv|resume|application|applying for)[:\s-]*/i, '').slice(0, 120) || fromAddr.split('@')[0] || 'Candidate';
  const skills = Array.from(new Set((body.match(/\b(ICU|OT|NABH|JCI|BLS|ACLS|nursing|radiology|billing|pharmacy|lab|EMR|EHR|patient safety|infection control)\b/gi) || []).map(v => v.toLowerCase())));
  return {
    name,
    email: emailMatch?.[0] || fromAddr || null,
    phone: phoneMatch?.[0] || null,
    currentRole: subject || null,
    resumeText: `${subject}\n\n${body}`.slice(0, 50000),
    skills,
    source: 'hr_inbox',
  };
};

async function ensureHrmsTables() {
  await sharedPool.query(`
    CREATE TABLE IF NOT EXISTS hr_locations (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      location_type TEXT NOT NULL DEFAULT 'branch',
      address TEXT,
      city TEXT,
      state TEXT,
      phone TEXT,
      email TEXT,
      hr_manager_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS hr_biometric_devices (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      device_uid TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT,
      vendor TEXT,
      connection_type TEXT DEFAULT 'api',
      status TEXT NOT NULL DEFAULT 'online',
      last_sync_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, device_uid)
    );

    CREATE TABLE IF NOT EXISTS hr_biometric_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      device_id BIGINT REFERENCES hr_biometric_devices(id) ON DELETE SET NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      employee_code TEXT,
      biometric_user_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'check_in',
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'manual',
      confidence NUMERIC(5,2),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );


    CREATE TABLE IF NOT EXISTS hr_recruitment_requisitions (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      requisition_code TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      openings INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      location TEXT,
      employment_type TEXT DEFAULT 'Full-time',
      experience_min INTEGER DEFAULT 0,
      experience_max INTEGER DEFAULT 20,
      skills TEXT[] DEFAULT ARRAY[]::TEXT[],
      description TEXT,
      ai_job_brief JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, requisition_code)
    );

    CREATE TABLE IF NOT EXISTS hr_recruitment_candidates (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      requisition_id BIGINT REFERENCES hr_recruitment_requisitions(id) ON DELETE SET NULL,
      candidate_code TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      current_position TEXT,
      experience_years NUMERIC(4,1) DEFAULT 0,
      source TEXT DEFAULT 'direct',
      stage TEXT NOT NULL DEFAULT 'sourced',
      resume_text TEXT,
      skills TEXT[] DEFAULT ARRAY[]::TEXT[],
      ai_score NUMERIC(5,2),
      ai_summary TEXT,
      ai_recommendation TEXT,
      ai_risks TEXT[] DEFAULT ARRAY[]::TEXT[],
      expected_ctc NUMERIC(12,2),
      notice_period_days INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, candidate_code)
    );

    CREATE TABLE IF NOT EXISTS hr_recruitment_interviews (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      candidate_id BIGINT REFERENCES hr_recruitment_candidates(id) ON DELETE CASCADE,
      round_name TEXT NOT NULL DEFAULT 'HR Screen',
      interviewer TEXT,
      scheduled_at TIMESTAMPTZ,
      mode TEXT DEFAULT 'video',
      status TEXT NOT NULL DEFAULT 'scheduled',
      score NUMERIC(5,2),
      feedback TEXT,
      ai_questions TEXT[] DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_benefit_programs (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'Internal',
      benefit_type TEXT NOT NULL DEFAULT 'wellness',
      coverage TEXT,
      enrolled_count INTEGER NOT NULL DEFAULT 0,
      annual_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
      renewal_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      compliance_notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_performance_reviews (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      cycle TEXT NOT NULL DEFAULT 'current',
      review_period_start DATE,
      review_period_end DATE,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kra_score NUMERIC(5,2) DEFAULT 0,
      attendance_score NUMERIC(5,2) DEFAULT 0,
      patient_score NUMERIC(5,2) DEFAULT 0,
      quality_score NUMERIC(5,2) DEFAULT 0,
      teamwork_score NUMERIC(5,2) DEFAULT 0,
      overall_score NUMERIC(5,2) DEFAULT 0,
      rating NUMERIC(3,1) DEFAULT 0,
      overall_label TEXT DEFAULT 'Pending',
      status TEXT NOT NULL DEFAULT 'draft',
      manager_notes TEXT,
      ai_summary TEXT,
      ai_risks TEXT[] DEFAULT ARRAY[]::TEXT[],
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, staff_user_id, cycle)
    );

    CREATE TABLE IF NOT EXISTS hr_leave_requests (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      leave_type TEXT NOT NULL DEFAULT 'Casual',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days NUMERIC(5,1) NOT NULL DEFAULT 1,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_shift_rosters (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      location_id BIGINT REFERENCES hr_locations(id) ON DELETE SET NULL,
      shift_name TEXT NOT NULL,
      shift_start TIME,
      shift_end TIME,
      roster_date DATE NOT NULL,
      week_day TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_onboarding_tasks (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      task_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date DATE,
      completed_at TIMESTAMPTZ,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, staff_user_id, task_key)
    );

    CREATE TABLE IF NOT EXISTS hr_employee_documents (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL DEFAULT 'general',
      original_name TEXT NOT NULL,
      mime_type TEXT,
      file_size BIGINT DEFAULT 0,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_key TEXT NOT NULL,
      public_url TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      metadata JSONB DEFAULT '{}'::jsonb,
      uploaded_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_timesheets (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      work_date DATE NOT NULL,
      task TEXT NOT NULL DEFAULT 'General duty',
      hours NUMERIC(5,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'submitted',
      notes TEXT,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_lms_programs (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      program_code TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT DEFAULT 'All',
      trainer TEXT,
      scheduled_at TIMESTAMPTZ,
      duration_hours NUMERIC(5,2) DEFAULT 1,
      capacity INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, program_code)
    );

    CREATE TABLE IF NOT EXISTS hr_lms_enrollments (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      program_id BIGINT REFERENCES hr_lms_programs(id) ON DELETE CASCADE,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'enrolled',
      completed_at TIMESTAMPTZ,
      score NUMERIC(5,2),
      certification_expires_at DATE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, program_id, staff_user_id)
    );

    CREATE TABLE IF NOT EXISTS hr_goals (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      metric TEXT DEFAULT 'Completion',
      target_value NUMERIC(12,2) DEFAULT 100,
      current_value NUMERIC(12,2) DEFAULT 0,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_engagement_surveys (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      audience TEXT DEFAULT 'All staff',
      status TEXT NOT NULL DEFAULT 'draft',
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      questions JSONB DEFAULT '[]'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_engagement_survey_responses (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      survey_id BIGINT REFERENCES hr_engagement_surveys(id) ON DELETE CASCADE,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      score NUMERIC(5,2),
      sentiment TEXT DEFAULT 'neutral',
      answers JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_helpdesk_tickets (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      ticket_code TEXT NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category TEXT DEFAULT 'general',
      subject TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, ticket_code)
    );

    CREATE TABLE IF NOT EXISTS hr_cv_documents (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      candidate_id BIGINT REFERENCES hr_recruitment_candidates(id) ON DELETE SET NULL,
      source_email_id BIGINT,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      file_size BIGINT DEFAULT 0,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_key TEXT NOT NULL,
      public_url TEXT,
      ai_summary TEXT,
      ai_skills TEXT[] DEFAULT ARRAY[]::TEXT[],
      ai_score NUMERIC(5,2),
      metadata JSONB DEFAULT '{}'::jsonb,
      uploaded_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_email_settings (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      display_name TEXT,
      email TEXT NOT NULL,
      provider TEXT DEFAULT 'custom',
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 587,
      smtp_secure BOOLEAN DEFAULT false,
      smtp_username TEXT,
      smtp_password TEXT,
      imap_host TEXT,
      imap_port INTEGER DEFAULT 993,
      imap_secure BOOLEAN DEFAULT true,
      imap_username TEXT,
      imap_password TEXT,
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_email_inbox (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      settings_id BIGINT REFERENCES hr_email_settings(id) ON DELETE SET NULL,
      message_id TEXT,
      folder TEXT DEFAULT 'inbox',
      from_addr TEXT DEFAULT '',
      from_name TEXT DEFAULT '',
      to_addrs TEXT[] DEFAULT ARRAY[]::TEXT[],
      cc_addrs TEXT[] DEFAULT ARRAY[]::TEXT[],
      subject TEXT DEFAULT '',
      body_text TEXT,
      body_html TEXT,
      attachments JSONB DEFAULT '[]'::jsonb,
      ai_intent TEXT DEFAULT 'general',
      ai_status TEXT DEFAULT 'new',
      linked_candidate_id BIGINT REFERENCES hr_recruitment_candidates(id) ON DELETE SET NULL,
      linked_benefit_id BIGINT REFERENCES hr_benefit_programs(id) ON DELETE SET NULL,
      is_read BOOLEAN DEFAULT false,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, message_id)
    );

    ALTER TABLE hr_biometric_devices ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES hr_locations(id) ON DELETE SET NULL;
    ALTER TABLE hr_recruitment_requisitions ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES hr_locations(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_hr_locations_tenant ON hr_locations(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_locations_code ON hr_locations(tenant_id, code);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_devices_tenant ON hr_biometric_devices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_devices_location ON hr_biometric_devices(tenant_id, location_id);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_events_tenant_day ON hr_biometric_events(tenant_id, event_at);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_events_staff ON hr_biometric_events(staff_user_id, event_at);

    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_req_tenant ON hr_recruitment_requisitions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_tenant ON hr_recruitment_candidates(tenant_id, stage);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_req ON hr_recruitment_candidates(requisition_id, stage);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_candidate ON hr_recruitment_interviews(candidate_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_hr_benefit_programs_tenant ON hr_benefit_programs(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_tenant ON hr_performance_reviews(tenant_id, cycle, status);
    CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_staff ON hr_performance_reviews(staff_user_id, cycle);
    CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_tenant ON hr_leave_requests(tenant_id, status, start_date);
    CREATE INDEX IF NOT EXISTS idx_hr_shift_rosters_tenant ON hr_shift_rosters(tenant_id, roster_date, staff_user_id);
    CREATE INDEX IF NOT EXISTS idx_hr_onboarding_tasks_staff ON hr_onboarding_tasks(tenant_id, staff_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_staff ON hr_employee_documents(tenant_id, staff_user_id, document_type);
    CREATE INDEX IF NOT EXISTS idx_hr_timesheets_tenant ON hr_timesheets(tenant_id, work_date, status);
    CREATE INDEX IF NOT EXISTS idx_hr_lms_programs_tenant ON hr_lms_programs(tenant_id, status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_hr_lms_enrollments_program ON hr_lms_enrollments(program_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_goals_tenant ON hr_goals(tenant_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_hr_surveys_tenant ON hr_engagement_surveys(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_helpdesk_tenant ON hr_helpdesk_tickets(tenant_id, status, priority);
    CREATE INDEX IF NOT EXISTS idx_hr_cv_documents_tenant ON hr_cv_documents(tenant_id, candidate_id);
    CREATE INDEX IF NOT EXISTS idx_hr_email_settings_tenant ON hr_email_settings(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_hr_email_inbox_tenant ON hr_email_inbox(tenant_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hr_email_inbox_intent ON hr_email_inbox(tenant_id, ai_intent, ai_status);
  `);
}

const tableReady = ensureHrmsTables().catch((error) => {
  console.error('[HRMS] table initialization failed:', error);
});

async function requireHr(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(header.slice('Bearer '.length), JWT_CONFIG.SECRET);
    let role = decoded.role || decoded.userRole;
    let tenantId = decoded.organization_id || decoded.hospital_id || decoded.hospitalId || decoded.tenant_id || decoded.org_id || req.headers['x-tenant-id'] || req.query.tenantId;
    let hrUser = decoded;

    // /api/corporate/login issues a different token shape entirely: role:'corporate',
    // id = the Corporate table's own id, no organization_id/tenant_id at all. Bridge it
    // to the same organization_id/tenant_id/organization_type shape every other HR
    // login already carries, so the rest of this module doesn't need to special-case it.
    if (role === 'corporate' && !tenantId) {
      const { default: Corporate } = await import('../models/postgres/corporate.model.postgres.js');
      const corp = await Corporate.findByPk(decoded.id || decoded.corporateId).catch(() => null);
      if (corp?.tenantId) {
        tenantId = corp.tenantId;
        role = 'corporate_admin';
        const adminUser = await User.findOne({
          where: { organization_id: corp.tenantId, organization_type: 'corporate', role: 'corporate_admin' },
        }).catch(() => null);
        hrUser = {
          ...decoded,
          role: 'corporate_admin',
          organization_id: corp.tenantId,
          organization_type: 'corporate',
          tenant_id: corp.tenantId,
          id: adminUser?.id || decoded.id,
        };
      }
    }

    if (!HR_ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ success: false, message: 'HR privileges required' });
    }

    if (!tenantId) {
      return res.status(403).json({ success: false, message: 'Hospital context missing from token' });
    }

    req.hrUser = hrUser;
    req.tenantId = Number(tenantId);
    if (!Number.isInteger(req.tenantId) || req.tenantId <= 0) {
      return res.status(403).json({ success: false, message: 'Valid hospital context is required' });
    }

    // Which users.organization_type this session scopes by. Resolved ONCE, from the tenant's own
    // type, instead of nine separate `req.hrOrganizationType` fallbacks. Those
    // always produced 'hospital' (the department-login token carries no organization_type at all),
    // so a corporate or clinic tenant's HR saw an empty module — and, worse, four of those nine
    // sites are WRITES that stamped organization_type onto newly created staff, spreading the
    // wrong value.
    const tenantRecord = await Tenant.findByPk(req.tenantId).catch(() => null);
    const resolved = resolveOrgTypeForTenant(tenantRecord, hrUser?.organization_type);
    req.hrOrganizationType = resolved.orgType;
    if (!resolved.expressible) {
      // tenants.type has values users.organization_type cannot express (broker, ambulance, tpa,
      // ngo, psu, insurer, homecare, aggregator). Keep the previous behaviour, but say so.
      console.warn(`[hrms] tenant ${req.tenantId} is type '${resolved.tenantType}', which has no users.organization_type equivalent; scoping by '${resolved.orgType}'`);
    }

    // Real subdomain isolation: extractTenant (global middleware) already resolved
    // req.tenant from the Host header for any tenants-table entity. When a request
    // arrives on a specific subdomain, the session's own tenant must match it —
    // stops a token issued for one tenant being used on another tenant's subdomain.
    // Generic hosts (app.mediqzy.com, no subdomain match) skip this — unchanged.
    if (req.tenant && req.tenant.id !== req.tenantId) {
      return res.status(403).json({ success: false, message: 'This account is not registered to this domain' });
    }

    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

router.use(requireHr);
router.use(async (_req, _res, next) => {
  try {
    await tableReady;
    next();
  } catch (error) {
    next(error);
  }
});

function normalizeStaff(user, locationMap = new Map()) {
  const metadata = user.metadata || {};
  const locationId = metadata.locationId || metadata.branchId || null;
  const location = locationId ? locationMap.get(String(locationId)) : null;
  return {
    id: user.id,
    employeeCode: metadata.employeeCode || user.unique_id || `EMP-${user.id}`,
    biometricUserId: metadata.biometricUserId || null,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email,
    phone: user.phoneNumber,
    department: metadata.department || user.department_name || 'General',
    locationId,
    locationName: metadata.locationName || location?.name || null,
    branchCode: metadata.branchCode || location?.code || null,
    designation: metadata.designation || user.role,
    employmentType: metadata.employmentType || 'Full-time',
    role: user.role,
    joinedAt: metadata.joinedAt || user.createdAt,
    status: user.status,
    gender: user.gender,
    attendancePolicy: metadata.attendancePolicy || 'General',
    deviceUid: metadata.deviceUid || null,
  };
}

async function listHrLocations(tenantId, filters = {}) {
  const params = [tenantId];
  const conditions = ['tenant_id = $1'];
  if (filters.status && filters.status !== 'all') { params.push(filters.status); conditions.push(`status = $${params.length}`); }
  if (filters.search) { params.push(`%${filters.search}%`); conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR city ILIKE $${params.length})`); }
  const { rows } = await sharedPool.query(
    `SELECT id, code, name, location_type AS "locationType", address, city, state, phone, email,
            hr_manager_user_id AS "hrManagerUserId", status, metadata, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM hr_locations
     WHERE ${conditions.join(' AND ')}
     ORDER BY status = 'active' DESC, name ASC`,
    params
  );
  return rows;
}

function makeLocationMap(locations = []) {
  return new Map(locations.map(location => [String(location.id), location]));
}

function normalizeHrUser(user, locationMap = new Map()) {
  const metadata = user.metadata || {};
  const scope = user.scope || {};
  const locationIds = normalizeArray(scope.locationIds || metadata.locationIds || metadata.branchIds).map(String);
  return {
    id: user.id,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email,
    phone: user.phoneNumber,
    role: user.role,
    department: metadata.department || user.department_name || 'HR',
    status: user.status,
    permissions: user.permissions || [],
    locationIds,
    locations: locationIds.map(id => locationMap.get(String(id))).filter(Boolean),
    createdAt: user.createdAt,
  };
}

async function listStaff(tenantId, filters = {}, organizationType = 'hospital') {
  const where = {
    organization_id: tenantId,
    organization_type: organizationType,
    role: { [Op.in]: STAFF_ROLES },
  };

  if (filters.status && filters.status !== 'all') where.status = filters.status;
  if (filters.search) {
    const search = `%${filters.search}%`;
    where[Op.or] = [
      { firstName: { [Op.iLike]: search } },
      { lastName: { [Op.iLike]: search } },
      { email: { [Op.iLike]: search } },
      { unique_id: { [Op.iLike]: search } },
    ];
  }

  const [users, locations] = await Promise.all([
    User.findAll({
      where,
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit: Math.min(Number(filters.limit) || 500, 1000),
    }),
    listHrLocations(tenantId),
  ]);
  const locationMap = makeLocationMap(locations);
  return users.map(user => normalizeStaff(user, locationMap)).filter((member) => {
    if (filters.department && filters.department !== 'all' && member.department !== filters.department) return false;
    if (filters.locationId && filters.locationId !== 'all' && String(member.locationId || '') !== String(filters.locationId)) return false;
    // Sub-user location scoping: restrict to the requester's assigned facilities/branches.
    if (Array.isArray(filters.allowedLocationIds) && !filters.allowedLocationIds.includes(String(member.locationId || ''))) return false;
    return true;
  });
}


const performanceLabel = (score) => {
  const n = Number(score || 0);
  if (n >= 90) return 'Exceptional';
  if (n >= 75) return 'Good';
  if (n >= 60) return 'Average';
  if (n > 0) return 'Needs Improvement';
  return 'Pending';
};

const performanceRating = (score) => {
  const n = Number(score || 0);
  if (!n) return 0;
  return Math.max(1, Math.min(5, Math.round((n / 20) * 10) / 10));
};

const weightedPerformanceScore = ({ kraScore = 0, attendanceScore = 0, patientScore = 0, qualityScore = 0, teamworkScore = 0 }) => {
  const score = (Number(kraScore) * 0.35) + (Number(attendanceScore) * 0.25) + (Number(patientScore) * 0.20) + (Number(qualityScore) * 0.12) + (Number(teamworkScore) * 0.08);
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
};

const defaultPerformanceCycle = () => {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${quarter}`;
};


router.get('/features', async (_req, res) => {
  res.json({ success: true, data: { mode: 'all_features_enabled', features: HR_FEATURE_CATALOG } });
});

router.get('/locations', async (req, res) => {
  const rows = await listHrLocations(req.tenantId, req.query);
  res.json({ success: true, data: rows });
});

router.post('/locations', async (req, res) => {
  const { code, name, locationType = 'branch', address, city, state, phone, email, hrManagerUserId, status = 'active', metadata } = req.body || {};
  if (!safeText(code, 40) || !safeText(name, 160)) return res.status(400).json({ success: false, message: 'Location code and name are required' });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_locations
       (tenant_id, code, name, location_type, address, city, state, phone, email, hr_manager_user_id, status, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     ON CONFLICT (tenant_id, code) DO UPDATE SET
       name = EXCLUDED.name,
       location_type = EXCLUDED.location_type,
       address = EXCLUDED.address,
       city = EXCLUDED.city,
       state = EXCLUDED.state,
       phone = EXCLUDED.phone,
       email = EXCLUDED.email,
       hr_manager_user_id = EXCLUDED.hr_manager_user_id,
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id, code, name, location_type AS "locationType", address, city, state, phone, email,
               hr_manager_user_id AS "hrManagerUserId", status, metadata, created_at AS "createdAt"`,
    [req.tenantId, safeText(code, 40).toUpperCase(), safeText(name, 160), safeText(locationType, 40) || 'branch', safeText(address, 500) || null,
     safeText(city, 120) || null, safeText(state, 120) || null, safeText(phone, 30) || null, normalizeEmail(email) || null,
     hrManagerUserId || null, safeText(status, 40) || 'active', JSON.stringify(toJsonObject(metadata)), req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'HR location saved', data: rows[0] });
});

router.patch('/locations/:id', async (req, res) => {
  const current = await sharedPool.query(`SELECT * FROM hr_locations WHERE tenant_id = $1 AND id = $2`, [req.tenantId, req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ success: false, message: 'Location not found' });
  const body = req.body || {};
  const { rows } = await sharedPool.query(
    `UPDATE hr_locations SET
       name = COALESCE($3, name), location_type = COALESCE($4, location_type), address = COALESCE($5, address),
       city = COALESCE($6, city), state = COALESCE($7, state), phone = COALESCE($8, phone), email = COALESCE($9, email),
       hr_manager_user_id = COALESCE($10, hr_manager_user_id), status = COALESCE($11, status),
       metadata = COALESCE($12::jsonb, metadata), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, code, name, location_type AS "locationType", address, city, state, phone, email,
               hr_manager_user_id AS "hrManagerUserId", status, metadata, updated_at AS "updatedAt"`,
    [req.tenantId, req.params.id, body.name ?? null, body.locationType ?? null, body.address ?? null, body.city ?? null, body.state ?? null,
     body.phone ?? null, body.email ? normalizeEmail(body.email) : null, body.hrManagerUserId ?? null, body.status ?? null,
     body.metadata === undefined ? null : JSON.stringify(toJsonObject(body.metadata))]
  );
  res.json({ success: true, message: 'HR location updated', data: rows[0] });
});

router.get('/users', async (req, res) => {
  const [users, locations] = await Promise.all([
    User.findAll({
      where: { organization_id: req.tenantId, organization_type: req.hrOrganizationType, role: { [Op.in]: HR_USER_ROLES } },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit: 200,
    }),
    listHrLocations(req.tenantId),
  ]);
  res.json({ success: true, data: users.map(user => normalizeHrUser(user, makeLocationMap(locations))) });
});

router.post('/users', async (req, res) => {
  const { firstName, lastName, email, phone, role = 'hr_staff', locationIds = [], permissions, password } = req.body || {};
  if (!safeText(firstName, 100) || !safeText(lastName, 100) || !normalizeEmail(email) || !safeText(phone, 30)) {
    return res.status(400).json({ success: false, message: 'First name, last name, email, and phone are required' });
  }
  const normalizedEmail = normalizeEmail(email);
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ success: false, message: 'A user with this email already exists' });
  const safeRole = HR_USER_ROLES.includes(role) ? role : 'hr_staff';
  const assignedLocationIds = normalizeArray(locationIds).map(String);
  const featurePermissions = Array.isArray(permissions) && permissions.length ? permissions : HR_FEATURE_CATALOG.map(feature => feature.key);
  const user = await User.create({
    firstName: safeText(firstName, 100),
    lastName: safeText(lastName, 100),
    email: normalizedEmail,
    password: safeText(password, 128) || makeTemporaryPassword(),
    dateOfBirth: '1990-01-01',
    gender: 'Other',
    phoneNumber: safeText(phone, 30),
    organization_id: req.tenantId,
    organization_type: req.hrOrganizationType,
    tenant_id: req.tenantId,
    role: safeRole,
    department_name: 'HR',
    permissions: featurePermissions,
    scope: { locationIds: assignedLocationIds, features: featurePermissions },
    status: 'active',
    metadata: {
      department: 'HR',
      designation: safeRole === 'hospital_admin' ? 'HR Administrator' : 'HR Staff',
      locationIds: assignedLocationIds,
      createdByHrUserId: req.hrUser.id || null,
      passwordResetRequired: true,
      temporaryPasswordIssued: true,
      temporaryPasswordIssuedAt: new Date().toISOString(),
    },
  });
  const locations = await listHrLocations(req.tenantId);
  res.status(201).json({ success: true, message: 'HR user created', data: normalizeHrUser(user, makeLocationMap(locations)) });
});

router.patch('/users/:id/scope', async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, organization_id: req.tenantId, organization_type: req.hrOrganizationType, role: { [Op.in]: HR_USER_ROLES } } });
  if (!user) return res.status(404).json({ success: false, message: 'HR user not found' });
  const assignedLocationIds = normalizeArray(req.body?.locationIds ?? user.scope?.locationIds ?? []).map(String);
  const featurePermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : (user.permissions || HR_FEATURE_CATALOG.map(feature => feature.key));
  await user.update({
    permissions: featurePermissions,
    scope: { ...(user.scope || {}), locationIds: assignedLocationIds, features: featurePermissions },
    status: req.body?.status || user.status,
    metadata: { ...(user.metadata || {}), locationIds: assignedLocationIds },
  });
  const locations = await listHrLocations(req.tenantId);
  res.json({ success: true, message: 'HR user scope updated', data: normalizeHrUser(user, makeLocationMap(locations)) });
});

router.get('/summary', async (req, res) => {
  const staff = await listStaff(req.tenantId, { status: 'active', limit: 500 }, req.hrOrganizationType);
  const { rows: attendanceRows } = await sharedPool.query(
    `SELECT
       COUNT(DISTINCT staff_user_id) FILTER (WHERE event_type IN ('check_in','in')) AS present,
       COUNT(*) FILTER (WHERE source = 'biometric') AS biometric_events
     FROM hr_biometric_events
     WHERE tenant_id = $1 AND event_at::date = CURRENT_DATE`,
    [req.tenantId]
  );
  const { rows: deviceRows } = await sharedPool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'online') AS online
     FROM hr_biometric_devices
     WHERE tenant_id = $1`,
    [req.tenantId]
  );

  const present = Number(attendanceRows[0]?.present || 0);
  const totalStaff = staff.length;
  const byDepartment = staff.reduce((acc, member) => {
    acc[member.department] = (acc[member.department] || 0) + 1;
    return acc;
  }, {});
  const byLocation = staff.reduce((acc, member) => {
    const key = member.locationName || 'Unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      totalStaff,
      activeStaff: totalStaff,
      presentToday: present,
      absentToday: Math.max(totalStaff - present, 0),
      attendanceRate: totalStaff ? Math.round((present / totalStaff) * 1000) / 10 : 0,
      biometricEventsToday: Number(attendanceRows[0]?.biometric_events || 0),
      devices: {
        total: Number(deviceRows[0]?.total || 0),
        online: Number(deviceRows[0]?.online || 0),
      },
      byDepartment,
      byLocation,
    },
  });
});

router.get('/staff', async (req, res) => {
  const scope = await getRequesterLocationScope(req);
  // An EMPTY locationIds array means "no location restriction recorded for this user", not
  // "allowed nowhere". listStaff rejects any member whose locationId is absent from the array, so
  // passing [] filtered out every colleague: /hr/summary reported 9 staff while /hr/staff returned
  // []. Only pass the restriction when there is actually one.
  const restrict = !scope.isSuperUser && Array.isArray(scope.locationIds) && scope.locationIds.length > 0;
  const filters = restrict ? { ...req.query, allowedLocationIds: scope.locationIds } : { ...req.query };
  const staff = await listStaff(req.tenantId, filters, req.hrOrganizationType);
  res.json({ success: true, data: staff });
});

router.post('/staff', async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    department,
    designation,
    role = 'staff',
    gender = 'Other',
    dateOfBirth = '1990-01-01',
    joinedAt,
    employmentType,
    employeeCode,
    biometricUserId,
    deviceUid,
    locationId,
    locationName,
    branchCode,
    password
  } = req.body || {};

  if (!safeText(firstName) || !safeText(lastName) || !email || !safeText(phone)) {
    return res.status(400).json({ success: false, message: 'First name, last name, email, and phone are required' });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ success: false, message: 'A user with this email already exists' });
  }

  const safeRole = STAFF_ROLES.includes(role) ? role : 'staff';
  const initialPassword = safeText(password, 128) || makeTemporaryPassword();
  const staff = await User.create({
    firstName: safeText(firstName, 100),
    lastName: safeText(lastName, 100),
    email: normalizedEmail,
    password: initialPassword,
    dateOfBirth,
    gender,
    phoneNumber: safeText(phone, 20),
    organization_id: req.tenantId,
    organization_type: req.hrOrganizationType,
    role: safeRole,
    status: 'active',
    metadata: {
      department: department || 'General',
      designation: designation || safeRole,
      joinedAt: joinedAt || todayISO(),
      employmentType: employmentType || 'Full-time',
      employeeCode: employeeCode || `EMP-${Date.now().toString().slice(-6)}`,
      biometricUserId: biometricUserId || null,
      deviceUid: deviceUid || null,
      locationId: locationId || null,
      locationName: locationName || null,
      branchCode: branchCode || null,
      createdByHrUserId: req.hrUser.id || null,
      passwordResetRequired: true,
      temporaryPasswordIssued: true,
      temporaryPasswordIssuedAt: new Date().toISOString(),
      onboardingStatus: 'pending_documents',
    },
  });

  res.status(201).json({ success: true, message: 'Staff member added', data: normalizeStaff(staff) });
});

router.patch('/staff/:id', async (req, res) => {
  const staff = await User.findOne({
    where: {
      id: req.params.id,
      organization_id: req.tenantId,
      organization_type: req.hrOrganizationType,
      role: { [Op.in]: STAFF_ROLES },
    },
  });

  if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });

  const metadata = { ...(staff.metadata || {}) };
  for (const key of ['department', 'designation', 'joinedAt', 'employmentType', 'employeeCode', 'biometricUserId', 'deviceUid', 'attendancePolicy', 'locationId', 'locationName', 'branchCode']) {
    if (req.body[key] !== undefined) metadata[key] = req.body[key];
  }

  await staff.update({
    firstName: req.body.firstName ?? staff.firstName,
    lastName: req.body.lastName ?? staff.lastName,
    phoneNumber: req.body.phone ?? staff.phoneNumber,
    gender: req.body.gender ?? staff.gender,
    status: req.body.status ?? staff.status,
    role: req.body.role && STAFF_ROLES.includes(req.body.role) ? req.body.role : staff.role,
    metadata,
  });

  res.json({ success: true, message: 'Staff member updated', data: normalizeStaff(staff) });
});

router.delete('/staff/:id', async (req, res) => {
  const staff = await User.findOne({
    where: {
      id: req.params.id,
      organization_id: req.tenantId,
      organization_type: req.hrOrganizationType,
      role: { [Op.in]: STAFF_ROLES },
    },
  });

  if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });
  await staff.update({ status: 'inactive', metadata: { ...(staff.metadata || {}), deactivatedAt: new Date().toISOString() } });
  res.json({ success: true, message: 'Staff member deactivated' });
});

router.get('/biometric-devices', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT d.id, d.device_uid AS "deviceUid", d.name, d.location, d.location_id AS "locationId", l.name AS "locationName",
            d.vendor, d.connection_type AS "connectionType", d.status, d.last_sync_at AS "lastSyncAt", d.metadata, d.created_at AS "createdAt"
     FROM hr_biometric_devices d
     LEFT JOIN hr_locations l ON l.id = d.location_id
     WHERE d.tenant_id = $1
     ORDER BY d.name`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.post('/biometric-devices', async (req, res) => {
  const { deviceUid, name, location, locationId, vendor, connectionType, status, metadata } = req.body || {};
  if (!safeText(deviceUid, 120) || !safeText(name, 160)) {
    return res.status(400).json({ success: false, message: 'Device UID and name are required' });
  }
  const safeStatus = DEVICE_STATUSES.has(status) ? status : 'online';

  const { rows } = await sharedPool.query(
    `INSERT INTO hr_biometric_devices
       (tenant_id, device_uid, name, location, location_id, vendor, connection_type, status, metadata, last_sync_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
     ON CONFLICT (tenant_id, device_uid) DO UPDATE SET
       name = EXCLUDED.name,
       location = EXCLUDED.location,
       location_id = EXCLUDED.location_id,
       vendor = EXCLUDED.vendor,
       connection_type = EXCLUDED.connection_type,
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       last_sync_at = NOW(),
       updated_at = NOW()
     RETURNING id, device_uid AS "deviceUid", name, location, location_id AS "locationId", vendor, connection_type AS "connectionType",
               status, last_sync_at AS "lastSyncAt", metadata`,
    [
      req.tenantId,
      safeText(deviceUid, 120),
      safeText(name, 160),
      safeText(location, 160) || null,
      locationId || null,
      safeText(vendor, 120) || null,
      safeText(connectionType, 40) || 'api',
      safeStatus,
      JSON.stringify(toJsonObject(metadata)),
    ]
  );

  res.status(201).json({ success: true, message: 'Biometric device saved', data: rows[0] });
});

async function resolveStaffForEvent(tenantId, event) {
  if (event.staffId) {
    return User.findOne({ where: { id: event.staffId, organization_id: tenantId } });
  }

  const code = event.employeeCode || event.biometricUserId;
  if (!code) return null;

  const staff = await User.findAll({
    where: {
      organization_id: tenantId,
      organization_type: 'hospital',
      role: { [Op.in]: STAFF_ROLES },
    },
    limit: 500,
  });

  return staff.find((user) => {
    const metadata = user.metadata || {};
    return metadata.employeeCode === code || metadata.biometricUserId === code || user.unique_id === code;
  }) || null;
}

router.post('/biometric-events', async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [req.body || {}];
  if (events.length > MAX_BIOMETRIC_EVENTS_PER_REQUEST) {
    return res.status(413).json({ success: false, message: `Maximum ${MAX_BIOMETRIC_EVENTS_PER_REQUEST} biometric events per request` });
  }
  const saved = [];

  for (const event of events) {
    const eventType = event.eventType || event.event_type || 'check_in';
    if (!ATTENDANCE_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ success: false, message: `Invalid attendance event type: ${eventType}` });
    }
    const deviceUid = safeText(event.deviceUid || event.device_uid || '', 120) || null;
    const { rows: deviceRows } = deviceUid
      ? await sharedPool.query(
          `SELECT id FROM hr_biometric_devices WHERE tenant_id = $1 AND device_uid = $2`,
          [req.tenantId, deviceUid]
        )
      : { rows: [] };
    const staff = await resolveStaffForEvent(req.tenantId, event);
    const eventAt = parseEventTimestamp(event.eventAt || event.event_at);

    const { rows } = await sharedPool.query(
      `INSERT INTO hr_biometric_events
        (tenant_id, device_id, staff_user_id, employee_code, biometric_user_id, event_type, event_at, source, confidence, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id, event_at AS "eventAt", event_type AS "eventType", source`,
      [
        req.tenantId,
        deviceRows[0]?.id || null,
        staff?.id || null,
        safeText(event.employeeCode || staff?.metadata?.employeeCode || '', 80) || null,
        safeText(event.biometricUserId || staff?.metadata?.biometricUserId || '', 80) || null,
        eventType,
        eventAt.toISOString(),
        event.source || 'biometric',
        asNumber(event.confidence),
        JSON.stringify(toJsonObject(event.metadata)),
      ]
    );

    if (deviceRows[0]?.id) {
      await sharedPool.query(`UPDATE hr_biometric_devices SET last_sync_at = NOW(), status = 'online', updated_at = NOW() WHERE id = $1`, [deviceRows[0].id]);
    }

    saved.push(rows[0]);
  }

  res.status(201).json({ success: true, message: 'Biometric events ingested', data: saved });
});

router.get('/attendance', async (req, res) => {
  const date = req.query.date || todayISO();
  const staff = await listStaff(req.tenantId, { status: 'active', limit: 500 }, req.hrOrganizationType);
  const { rows: events } = await sharedPool.query(
    `SELECT e.*, d.device_uid, d.name AS device_name
     FROM hr_biometric_events e
     LEFT JOIN hr_biometric_devices d ON d.id = e.device_id
     WHERE e.tenant_id = $1 AND e.event_at::date = $2::date
     ORDER BY e.event_at ASC`,
    [req.tenantId, date]
  );

  const byStaff = new Map();
  for (const event of events) {
    if (!event.staff_user_id) continue;
    const bucket = byStaff.get(event.staff_user_id) || [];
    bucket.push(event);
    byStaff.set(event.staff_user_id, bucket);
  }

  const rows = staff.map((member) => {
    const memberEvents = byStaff.get(member.id) || [];
    const ins = memberEvents.filter((e) => ['check_in', 'in'].includes(e.event_type));
    const outs = memberEvents.filter((e) => ['check_out', 'out'].includes(e.event_type));
    const firstIn = ins[0]?.event_at || null;
    const lastOut = outs[outs.length - 1]?.event_at || null;
    const status = firstIn ? (new Date(firstIn).getHours() >= 10 ? 'Late' : 'Present') : 'Absent';
    const hours = firstIn && lastOut
      ? Math.max((new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3600000, 0)
      : null;

    return {
      staffId: member.id,
      employeeCode: member.employeeCode,
      name: member.name,
      department: member.department,
      checkIn: firstIn ? new Date(firstIn).toISOString().slice(11, 16) : null,
      checkOut: lastOut ? new Date(lastOut).toISOString().slice(11, 16) : null,
      hours: hours === null ? null : Math.round(hours * 10) / 10,
      status,
      source: memberEvents.some((e) => e.source === 'biometric') ? 'Biometric' : firstIn ? 'Manual' : '-',
      deviceName: memberEvents.find((e) => e.device_name)?.device_name || null,
      events: memberEvents.length,
    };
  });

  const present = rows.filter((row) => row.status === 'Present' || row.status === 'Late').length;
  const late = rows.filter((row) => row.status === 'Late').length;
  const absent = rows.filter((row) => row.status === 'Absent').length;

  res.json({
    success: true,
    data: {
      date,
      summary: {
        present,
        absent,
        late,
        total: rows.length,
        biometricEvents: events.filter((event) => event.source === 'biometric').length,
      },
      rows,
    },
  });
});

router.post('/attendance/manual', async (req, res) => {
  const { staffId, employeeCode, eventType = 'check_in', date = todayISO(), time = nowTime(), note } = req.body || {};
  if (!ATTENDANCE_EVENT_TYPES.has(eventType)) {
    return res.status(400).json({ success: false, message: 'Invalid attendance event type' });
  }
  const staff = await resolveStaffForEvent(req.tenantId, { staffId, employeeCode });
  if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });

  const eventAt = parseEventTimestamp(null, date, time);
  await sharedPool.query(
    `INSERT INTO hr_biometric_events
       (tenant_id, staff_user_id, employee_code, biometric_user_id, event_type, event_at, source, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,'manual',$7::jsonb)`,
    [
      req.tenantId,
      staff.id,
      staff.metadata?.employeeCode || staff.unique_id || null,
      staff.metadata?.biometricUserId || null,
      eventType,
      eventAt.toISOString(),
      JSON.stringify({ note: safeText(note, 500) || null, hrUserId: req.hrUser.id || null }),
    ]
  );

  res.status(201).json({ success: true, message: 'Attendance event recorded' });
});

router.get('/audit', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT e.id, e.event_at AS "eventAt", e.event_type AS "eventType", e.source,
            e.employee_code AS "employeeCode", e.biometric_user_id AS "biometricUserId",
            e.confidence, d.name AS "deviceName", d.device_uid AS "deviceUid",
            u.email, u."firstName", u."lastName"
     FROM hr_biometric_events e
     LEFT JOIN hr_biometric_devices d ON d.id = e.device_id
     LEFT JOIN users u ON u.id = e.staff_user_id
     WHERE e.tenant_id = $1
     ORDER BY e.event_at DESC
     LIMIT 100`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});



router.get('/documents', async (req, res) => {
  const params = [req.tenantId];
  const conditions = ['d.tenant_id = $1'];
  if (req.query.staffId) { params.push(req.query.staffId); conditions.push(`d.staff_user_id = $${params.length}`); }
  const { rows } = await sharedPool.query(
    `SELECT d.id, d.staff_user_id AS "staffId", d.document_type AS "documentType", d.original_name AS "originalName",
            d.mime_type AS "mimeType", d.file_size AS "fileSize", d.storage_provider AS "storageProvider", d.storage_key AS "storageKey",
            d.public_url AS "publicUrl", d.verification_status AS "verificationStatus", d.metadata, d.created_at AS "createdAt",
            u."firstName", u."lastName", u.email
     FROM hr_employee_documents d
     LEFT JOIN users u ON u.id = d.staff_user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.created_at DESC LIMIT 200`,
    params
  );
  res.json({ success: true, data: rows });
});

router.post('/documents', hrDocumentUpload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Document file is required' });
  const doc = await storeEmployeeDocument({ tenantId: req.tenantId, staffId: req.body?.staffId || null, documentType: req.body?.documentType || 'general', file: req.file, uploadedBy: req.hrUser.id || null, metadata: { source: 'manual_upload' } });
  res.status(201).json({ success: true, message: 'Employee document stored', data: doc });
});

router.patch('/documents/:id/verify', async (req, res) => {
  const status = safeText(req.body?.status, 40) || 'verified';
  const { rows } = await sharedPool.query(
    `UPDATE hr_employee_documents SET verification_status = $3, updated_at = NOW(), metadata = COALESCE(metadata,'{}'::jsonb) || $4::jsonb
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, staff_user_id AS "staffId", document_type AS "documentType", verification_status AS "verificationStatus"`,
    [req.tenantId, req.params.id, status, JSON.stringify({ verifiedBy: req.hrUser.id || null, verifiedAt: new Date().toISOString(), note: req.body?.note || null })]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, message: 'Document status updated', data: rows[0] });
});

router.get('/leaves', async (req, res) => {
  const scope = await getRequesterLocationScope(req);
  const params = [req.tenantId];
  const conditions = ['l.tenant_id = $1'];
  if (req.query.status && req.query.status !== 'all') { params.push(req.query.status); conditions.push(`l.status = $${params.length}`); }
  const { rows } = await sharedPool.query(
    `SELECT l.id, l.staff_user_id AS "staffId", l.leave_type AS "leaveType", l.start_date AS "startDate", l.end_date AS "endDate",
            l.days, l.reason, l.status, l.metadata, l.created_at AS "createdAt", u."firstName", u."lastName", u.email, u.metadata AS "staffMetadata"
     FROM hr_leave_requests l
     LEFT JOIN users u ON u.id = l.staff_user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.start_date DESC, l.created_at DESC LIMIT 200`,
    params
  );
  // Sub-user location scoping: restrict to the requester's assigned facilities/branches.
  const filtered = scope.isSuperUser
    ? rows
    : rows.filter((r) => scope.locationIds.includes(String(r.staffMetadata?.locationId || '')));
  res.json({ success: true, data: filtered });
});

router.get('/leaves/summary', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT COUNT(*) FILTER (WHERE CURRENT_DATE BETWEEN start_date AND end_date AND status = 'approved')::int AS on_leave_today,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'approved' AND date_trunc('month', start_date) = date_trunc('month', CURRENT_DATE))::int AS approved_month,
            COALESCE(SUM(days) FILTER (WHERE leave_type ILIKE 'LOP%' AND date_trunc('month', start_date) = date_trunc('month', CURRENT_DATE)),0)::numeric AS lop_days
     FROM hr_leave_requests WHERE tenant_id = $1`,
    [req.tenantId]
  );
  const r = rows[0] || {};
  res.json({ success: true, data: { onLeaveToday: Number(r.on_leave_today || 0), pending: Number(r.pending || 0), approvedMonth: Number(r.approved_month || 0), lopDays: Number(r.lop_days || 0) } });
});

router.post('/leaves', async (req, res) => {
  const { staffId, leaveType = 'Casual', startDate, endDate, reason } = req.body || {};
  if (!staffId || !startDate || !endDate) return res.status(400).json({ success: false, message: 'Staff, start date, and end date are required' });
  const start = new Date(`${asDateOnly(startDate)}T00:00:00Z`);
  const end = new Date(`${asDateOnly(endDate)}T00:00:00Z`);
  const days = Math.max(1, Math.round(((end.getTime() - start.getTime()) / 86400000) + 1));
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_leave_requests (tenant_id, staff_user_id, leave_type, start_date, end_date, days, reason, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
     RETURNING id, staff_user_id AS "staffId", leave_type AS "leaveType", start_date AS "startDate", end_date AS "endDate", days, reason, status`,
    [req.tenantId, staffId, safeText(leaveType, 80), asDateOnly(startDate), asDateOnly(endDate), days, safeText(reason, 1000) || null, req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Leave request created', data: rows[0] });
});

router.patch('/leaves/:id/status', async (req, res) => {
  const status = safeText(req.body?.status, 40) || 'approved';
  const { rows } = await sharedPool.query(
    `UPDATE hr_leave_requests SET status = $3, approver_id = $4, updated_at = NOW(), metadata = COALESCE(metadata,'{}'::jsonb) || $5::jsonb
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, status`,
    [req.tenantId, req.params.id, status, req.hrUser.id || null, JSON.stringify({ actionNote: req.body?.note || null, actionAt: new Date().toISOString() })]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Leave request not found' });
  res.json({ success: true, message: 'Leave status updated', data: rows[0] });
});

router.get('/shifts', async (req, res) => {
  const date = req.query.date || todayISO();
  const { rows } = await sharedPool.query(
    `SELECT r.id, r.staff_user_id AS "staffId", r.location_id AS "locationId", r.shift_name AS "shiftName", r.shift_start AS "shiftStart", r.shift_end AS "shiftEnd",
            r.roster_date AS "rosterDate", r.week_day AS "weekDay", r.status, r.notes, u."firstName", u."lastName", u.metadata AS "staffMetadata", l.name AS "locationName"
     FROM hr_shift_rosters r
     LEFT JOIN users u ON u.id = r.staff_user_id
     LEFT JOIN hr_locations l ON l.id = r.location_id
     WHERE r.tenant_id = $1 AND r.roster_date BETWEEN $2::date - INTERVAL '3 days' AND $2::date + INTERVAL '10 days'
     ORDER BY r.roster_date ASC, r.shift_start NULLS LAST LIMIT 300`,
    [req.tenantId, date]
  );
  res.json({ success: true, data: rows });
});

router.post('/shifts', async (req, res) => {
  const { staffId, locationId, shiftName, shiftStart, shiftEnd, rosterDate, notes } = req.body || {};
  if (!staffId || !shiftName || !rosterDate) return res.status(400).json({ success: false, message: 'Staff, shift, and roster date are required' });
  const weekDay = new Date(`${asDateOnly(rosterDate)}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_shift_rosters (tenant_id, staff_user_id, location_id, shift_name, shift_start, shift_end, roster_date, week_day, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, staff_user_id AS "staffId", location_id AS "locationId", shift_name AS "shiftName", shift_start AS "shiftStart", shift_end AS "shiftEnd", roster_date AS "rosterDate", week_day AS "weekDay", status`,
    [req.tenantId, staffId, locationId || null, safeText(shiftName, 120), shiftStart || null, shiftEnd || null, asDateOnly(rosterDate), weekDay, safeText(notes, 500) || null, req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Shift assigned', data: rows[0] });
});

router.get('/onboarding', async (req, res) => {
  const staff = await listStaff(req.tenantId, { status: 'active', limit: 500 }, req.hrOrganizationType);
  const ids = staff.map(member => Number(member.id)).filter(Boolean);
  const taskRows = ids.length ? await sharedPool.query(
    `SELECT id, staff_user_id AS "staffId", task_key AS "taskKey", task_label AS "taskLabel", status, due_date AS "dueDate", completed_at AS "completedAt"
     FROM hr_onboarding_tasks WHERE tenant_id = $1 AND staff_user_id = ANY($2::int[]) ORDER BY created_at ASC`,
    [req.tenantId, ids]
  ) : { rows: [] };
  const byStaff = new Map();
  for (const task of taskRows.rows) {
    const bucket = byStaff.get(String(task.staffId)) || [];
    bucket.push(task);
    byStaff.set(String(task.staffId), bucket);
  }
  res.json({ success: true, data: staff.map(member => ({ ...member, onboardingStatus: member.onboardingStatus || member.metadata?.onboardingStatus, tasks: byStaff.get(String(member.id)) || [] })) });
});

router.post('/onboarding/tasks', async (req, res) => {
  const { staffId, taskKey, taskLabel, dueDate, ownerUserId } = req.body || {};
  if (!staffId || !taskKey || !taskLabel) return res.status(400).json({ success: false, message: 'Staff, task key, and task label are required' });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_onboarding_tasks (tenant_id, staff_user_id, task_key, task_label, due_date, owner_user_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, staff_user_id, task_key) DO UPDATE SET task_label = EXCLUDED.task_label, due_date = EXCLUDED.due_date, owner_user_id = EXCLUDED.owner_user_id, updated_at = NOW()
     RETURNING id, staff_user_id AS "staffId", task_key AS "taskKey", task_label AS "taskLabel", status, due_date AS "dueDate"`,
    [req.tenantId, staffId, safeText(taskKey, 80), safeText(taskLabel, 160), dueDate ? asDateOnly(dueDate) : null, ownerUserId || null, req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Onboarding task saved', data: rows[0] });
});

router.patch('/onboarding/tasks/:id/status', async (req, res) => {
  const status = safeText(req.body?.status, 40) || 'completed';
  const { rows } = await sharedPool.query(
    `UPDATE hr_onboarding_tasks SET status = $3, completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 RETURNING id, staff_user_id AS "staffId", task_key AS "taskKey", status, completed_at AS "completedAt"`,
    [req.tenantId, req.params.id, status]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Onboarding task not found' });
  res.json({ success: true, message: 'Onboarding task updated', data: rows[0] });
});

router.get('/timesheets', async (req, res) => {
  const date = req.query.date || todayISO();
  const { rows } = await sharedPool.query(
    `SELECT t.id, t.staff_user_id AS "staffId", t.work_date AS "workDate", t.task, t.hours, t.status, t.notes,
            u."firstName", u."lastName", u.metadata AS "staffMetadata"
     FROM hr_timesheets t LEFT JOIN users u ON u.id = t.staff_user_id
     WHERE t.tenant_id = $1 AND date_trunc('week', t.work_date) = date_trunc('week', $2::date)
     ORDER BY t.work_date DESC, t.created_at DESC LIMIT 300`,
    [req.tenantId, date]
  );
  res.json({ success: true, data: rows });
});

router.post('/timesheets', async (req, res) => {
  const { staffId, workDate = todayISO(), task = 'General duty', hours = 0, notes } = req.body || {};
  if (!staffId) return res.status(400).json({ success: false, message: 'Staff is required' });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_timesheets (tenant_id, staff_user_id, work_date, task, hours, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, staff_user_id AS "staffId", work_date AS "workDate", task, hours, status, notes`,
    [req.tenantId, staffId, asDateOnly(workDate), safeText(task, 160), asNumber(hours) || 0, safeText(notes, 1000) || null, req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Timesheet submitted', data: rows[0] });
});

router.patch('/timesheets/:id/status', async (req, res) => {
  const status = safeText(req.body?.status, 40) || 'approved';
  const { rows } = await sharedPool.query(
    `UPDATE hr_timesheets SET status = $3, approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 RETURNING id, status`,
    [req.tenantId, req.params.id, status, req.hrUser.id || null]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Timesheet not found' });
  res.json({ success: true, message: 'Timesheet status updated', data: rows[0] });
});

router.get('/lms/programs', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT p.id, p.program_code AS "programCode", p.title, p.department, p.trainer, p.scheduled_at AS "scheduledAt",
            p.duration_hours AS "durationHours", p.capacity, p.status, p.metadata,
            COUNT(e.id)::int AS enrolled, COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed
     FROM hr_lms_programs p LEFT JOIN hr_lms_enrollments e ON e.program_id = p.id
     WHERE p.tenant_id = $1 GROUP BY p.id ORDER BY p.scheduled_at NULLS LAST, p.created_at DESC`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.post('/lms/programs', async (req, res) => {
  const { title, department = 'All', trainer, scheduledAt, durationHours = 1, capacity = 0, status = 'scheduled', metadata } = req.body || {};
  if (!safeText(title, 180)) return res.status(400).json({ success: false, message: 'Program title is required' });
  const code = `TR-${Date.now().toString().slice(-6)}`;
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_lms_programs (tenant_id, program_code, title, department, trainer, scheduled_at, duration_hours, capacity, status, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING id, program_code AS "programCode", title, department, trainer, scheduled_at AS "scheduledAt", duration_hours AS "durationHours", capacity, status`,
    [req.tenantId, code, safeText(title, 180), safeText(department, 120), safeText(trainer, 160) || null, scheduledAt || null, asNumber(durationHours) || 1, clampInt(capacity, 0, 0, 100000), safeText(status, 40), JSON.stringify(toJsonObject(metadata)), req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'LMS program created', data: rows[0] });
});

router.post('/lms/programs/:id/enroll', async (req, res) => {
  const staffIds = normalizeArray(req.body?.staffIds || req.body?.staffId);
  if (!staffIds.length) return res.status(400).json({ success: false, message: 'At least one staff member is required' });
  const saved = [];
  for (const staffId of staffIds) {
    const { rows } = await sharedPool.query(
      `INSERT INTO hr_lms_enrollments (tenant_id, program_id, staff_user_id)
       VALUES ($1,$2,$3) ON CONFLICT (tenant_id, program_id, staff_user_id) DO UPDATE SET updated_at = NOW()
       RETURNING id, program_id AS "programId", staff_user_id AS "staffId", status`,
      [req.tenantId, req.params.id, staffId]
    );
    saved.push(rows[0]);
  }
  res.status(201).json({ success: true, message: 'Staff enrolled', data: saved });
});

router.patch('/lms/enrollments/:id/status', async (req, res) => {
  const status = safeText(req.body?.status, 40) || 'completed';
  const { rows } = await sharedPool.query(
    `UPDATE hr_lms_enrollments SET status = $3, score = COALESCE($4, score), completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END, certification_expires_at = COALESCE($5, certification_expires_at), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 RETURNING id, status, score`,
    [req.tenantId, req.params.id, status, asNumber(req.body?.score), req.body?.certificationExpiresAt || null]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Enrollment not found' });
  res.json({ success: true, message: 'Enrollment updated', data: rows[0] });
});

router.get('/goals', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT g.id, g.staff_user_id AS "staffId", g.title, g.metric, g.target_value AS "targetValue", g.current_value AS "currentValue",
            CASE WHEN g.target_value > 0 THEN ROUND((g.current_value / g.target_value) * 100, 1) ELSE 0 END AS progress,
            g.due_date AS "dueDate", g.status, g.metadata, u."firstName", u."lastName", u.metadata AS "staffMetadata"
     FROM hr_goals g LEFT JOIN users u ON u.id = g.staff_user_id
     WHERE g.tenant_id = $1 ORDER BY g.status = 'active' DESC, g.due_date NULLS LAST, g.created_at DESC`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.post('/goals', async (req, res) => {
  const { staffId, title, metric = 'Completion', targetValue = 100, currentValue = 0, dueDate, status = 'active', metadata } = req.body || {};
  if (!safeText(title, 180)) return res.status(400).json({ success: false, message: 'Goal title is required' });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_goals (tenant_id, staff_user_id, title, metric, target_value, current_value, due_date, status, owner_user_id, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING id, staff_user_id AS "staffId", title, metric, target_value AS "targetValue", current_value AS "currentValue", due_date AS "dueDate", status`,
    [req.tenantId, staffId || null, safeText(title, 180), safeText(metric, 120), asNumber(targetValue) || 100, asNumber(currentValue) || 0, dueDate ? asDateOnly(dueDate) : null, safeText(status, 40), req.hrUser.id || null, JSON.stringify(toJsonObject(metadata)), req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Goal saved', data: rows[0] });
});

router.patch('/goals/:id/progress', async (req, res) => {
  const { rows } = await sharedPool.query(
    `UPDATE hr_goals SET current_value = COALESCE($3, current_value), status = COALESCE($4, status), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 RETURNING id, current_value AS "currentValue", status`,
    [req.tenantId, req.params.id, asNumber(req.body?.currentValue), req.body?.status || null]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Goal not found' });
  res.json({ success: true, message: 'Goal progress updated', data: rows[0] });
});

router.get('/surveys', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT s.id, s.title, s.audience, s.status, s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.questions, s.metadata,
            COUNT(r.id)::int AS responses, ROUND(COALESCE(AVG(r.score),0),1) AS "avgScore"
     FROM hr_engagement_surveys s LEFT JOIN hr_engagement_survey_responses r ON r.survey_id = s.id
     WHERE s.tenant_id = $1 GROUP BY s.id ORDER BY s.created_at DESC`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.post('/surveys', async (req, res) => {
  const { title, audience = 'All staff', status = 'draft', startsAt, endsAt, questions, metadata } = req.body || {};
  if (!safeText(title, 180)) return res.status(400).json({ success: false, message: 'Survey title is required' });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_engagement_surveys (tenant_id, title, audience, status, starts_at, ends_at, questions, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
     RETURNING id, title, audience, status, starts_at AS "startsAt", ends_at AS "endsAt", questions`,
    [req.tenantId, safeText(title, 180), safeText(audience, 160), safeText(status, 40), startsAt || null, endsAt || null,
     JSON.stringify(Array.isArray(questions) ? questions : ['How satisfied are you with your work environment?', 'Do you have the tools needed to do your job?']), JSON.stringify(toJsonObject(metadata)), req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Engagement survey created', data: rows[0] });
});

router.post('/surveys/:id/responses', async (req, res) => {
  const { staffId, score = 0, sentiment = 'neutral', answers } = req.body || {};
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_engagement_survey_responses (tenant_id, survey_id, staff_user_id, score, sentiment, answers)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id, survey_id AS "surveyId", score, sentiment`,
    [req.tenantId, req.params.id, staffId || null, asNumber(score) || 0, safeText(sentiment, 40), JSON.stringify(toJsonObject(answers))]
  );
  res.status(201).json({ success: true, message: 'Survey response captured', data: rows[0] });
});

router.get('/helpdesk/tickets', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT t.id, t.ticket_code AS "ticketCode", t.staff_user_id AS "staffId", t.category, t.subject, t.description, t.priority,
            t.status, t.assigned_to AS "assignedTo", t.resolved_at AS "resolvedAt", t.created_at AS "createdAt",
            u."firstName", u."lastName", u.email, u.metadata AS "staffMetadata"
     FROM hr_helpdesk_tickets t LEFT JOIN users u ON u.id = t.staff_user_id
     WHERE t.tenant_id = $1 ORDER BY t.status = 'open' DESC, t.priority = 'high' DESC, t.created_at DESC LIMIT 200`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.post('/helpdesk/tickets', async (req, res) => {
  const { staffId, category = 'general', subject, description, priority = 'medium', assignedTo } = req.body || {};
  if (!safeText(subject, 180)) return res.status(400).json({ success: false, message: 'Ticket subject is required' });
  const ticketCode = `HRT-${Date.now().toString().slice(-6)}`;
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_helpdesk_tickets (tenant_id, ticket_code, staff_user_id, category, subject, description, priority, assigned_to, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, ticket_code AS "ticketCode", staff_user_id AS "staffId", category, subject, description, priority, status, assigned_to AS "assignedTo", created_at AS "createdAt"`,
    [req.tenantId, ticketCode, staffId || null, safeText(category, 80), safeText(subject, 180), safeText(description, 2000) || null, safeText(priority, 40), assignedTo || null, req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'HR help desk ticket created', data: rows[0] });
});

router.patch('/helpdesk/tickets/:id/status', async (req, res) => {
  const status = safeText(req.body?.status, 40) || 'resolved';
  const { rows } = await sharedPool.query(
    `UPDATE hr_helpdesk_tickets SET status = $3, assigned_to = COALESCE($4, assigned_to), resolved_at = CASE WHEN $3 IN ('resolved','closed') THEN NOW() ELSE resolved_at END, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 RETURNING id, ticket_code AS "ticketCode", status, resolved_at AS "resolvedAt"`,
    [req.tenantId, req.params.id, status, req.body?.assignedTo || null]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Ticket not found' });
  res.json({ success: true, message: 'Ticket status updated', data: rows[0] });
});

router.get('/performance', async (req, res) => {
  const cycle = safeText(req.query.cycle, 40) || defaultPerformanceCycle();
  const days = clampInt(req.query.days, 30, 7, 180);
  const staff = await listStaff(req.tenantId, { status: 'active', limit: 500 }, req.hrOrganizationType);
  const staffIds = staff.map(member => Number(member.id)).filter(Boolean);

  const [reviewResult, attendanceResult] = await Promise.all([
    sharedPool.query(
      `SELECT r.id, r.staff_user_id AS "staffId", r.cycle, r.review_period_start AS "reviewPeriodStart",
              r.review_period_end AS "reviewPeriodEnd", r.kra_score AS "kraScore", r.attendance_score AS "attendanceScore",
              r.patient_score AS "patientScore", r.quality_score AS "qualityScore", r.teamwork_score AS "teamworkScore",
              r.overall_score AS "overallScore", r.rating, r.overall_label AS "overallLabel", r.status,
              r.manager_notes AS "managerNotes", r.ai_summary AS "aiSummary", r.ai_risks AS "aiRisks", r.updated_at AS "updatedAt"
       FROM hr_performance_reviews r
       WHERE r.tenant_id = $1 AND r.cycle = $2`,
      [req.tenantId, cycle]
    ),
    staffIds.length
      ? sharedPool.query(
          `SELECT staff_user_id AS "staffId",
                  COUNT(DISTINCT event_at::date) FILTER (WHERE event_type IN ('check_in','in'))::int AS "presentDays",
                  COUNT(*) FILTER (WHERE source = 'biometric')::int AS "biometricEvents",
                  COUNT(*) FILTER (WHERE event_type IN ('check_in','in') AND EXTRACT(HOUR FROM event_at) >= 10)::int AS "lateEvents"
           FROM hr_biometric_events
           WHERE tenant_id = $1 AND staff_user_id = ANY($2::int[]) AND event_at >= NOW() - ($3::int * INTERVAL '1 day')
           GROUP BY staff_user_id`,
          [req.tenantId, staffIds, days]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const reviews = new Map(reviewResult.rows.map(row => [String(row.staffId), row]));
  const attendance = new Map(attendanceResult.rows.map(row => [String(row.staffId), row]));
  const workingDays = Math.max(1, Math.round(days * 5 / 7));

  const rows = staff.map((member) => {
    const review = reviews.get(String(member.id));
    const att = attendance.get(String(member.id)) || {};
    const calculatedAttendance = Math.max(0, Math.min(100, Math.round((Number(att.presentDays || 0) / workingDays) * 1000) / 10));
    const kraScore = Number(review?.kraScore ?? 0);
    const attendanceScore = Number(review?.attendanceScore ?? calculatedAttendance);
    const patientScore = Number(review?.patientScore ?? 0);
    const qualityScore = Number(review?.qualityScore ?? 0);
    const teamworkScore = Number(review?.teamworkScore ?? 0);
    const overallScore = Number(review?.overallScore ?? weightedPerformanceScore({ kraScore, attendanceScore, patientScore, qualityScore, teamworkScore }));
    const overallLabel = review?.overallLabel || performanceLabel(overallScore);
    return {
      id: review?.id || null,
      staffId: member.id,
      employeeCode: member.employeeCode,
      name: member.name,
      department: member.department,
      designation: member.designation,
      cycle,
      kraScore,
      attendanceScore,
      patientScore,
      qualityScore,
      teamworkScore,
      overallScore,
      rating: Number(review?.rating ?? performanceRating(overallScore)),
      overallLabel,
      status: review?.status || 'draft',
      managerNotes: review?.managerNotes || '',
      aiSummary: review?.aiSummary || `${overallLabel} performance profile. Attendance ${attendanceScore}%, KRA ${kraScore}%.`,
      aiRisks: review?.aiRisks || [],
      presentDays: Number(att.presentDays || 0),
      biometricEvents: Number(att.biometricEvents || 0),
      lateEvents: Number(att.lateEvents || 0),
      updatedAt: review?.updatedAt || null,
    };
  });

  const reviewed = rows.filter(row => row.id).length;
  const exceptional = rows.filter(row => row.overallScore >= 90).length;
  const needsImprovement = rows.filter(row => row.overallScore > 0 && row.overallScore < 60).length;
  const avgScore = rows.length ? Math.round((rows.reduce((sum, row) => sum + Number(row.overallScore || 0), 0) / rows.length) * 10) / 10 : 0;

  res.json({
    success: true,
    data: {
      cycle,
      summary: {
        totalStaff: rows.length,
        reviewed,
        reviewsDue: Math.max(rows.length - reviewed, 0),
        exceptional,
        needsImprovement,
        avgScore,
      },
      rows,
    },
  });
});

router.post('/performance/reviews', async (req, res) => {
  const {
    staffId,
    cycle = defaultPerformanceCycle(),
    reviewPeriodStart,
    reviewPeriodEnd,
    kraScore = 0,
    attendanceScore = 0,
    patientScore = 0,
    qualityScore = 0,
    teamworkScore = 0,
    status = 'manager_review',
    managerNotes,
    metadata,
  } = req.body || {};

  const staff = await User.findOne({
    where: {
      id: staffId,
      organization_id: req.tenantId,
      organization_type: req.hrOrganizationType,
      role: { [Op.in]: STAFF_ROLES },
    },
  });
  if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });

  const scores = {
    kraScore: Math.max(0, Math.min(100, Number(kraScore) || 0)),
    attendanceScore: Math.max(0, Math.min(100, Number(attendanceScore) || 0)),
    patientScore: Math.max(0, Math.min(100, Number(patientScore) || 0)),
    qualityScore: Math.max(0, Math.min(100, Number(qualityScore) || 0)),
    teamworkScore: Math.max(0, Math.min(100, Number(teamworkScore) || 0)),
  };
  const overallScore = weightedPerformanceScore(scores);
  const overallLabel = performanceLabel(overallScore);
  const rating = performanceRating(overallScore);
  const safeStatus = PERFORMANCE_STATUSES.has(status) ? status : 'manager_review';
  const aiRisks = [];
  if (scores.attendanceScore < 70) aiRisks.push('Attendance below target');
  if (scores.patientScore < 70) aiRisks.push('Patient/service score needs review');
  if (scores.kraScore < 70) aiRisks.push('KRA delivery below target');
  const aiSummary = `${overallLabel} rating (${overallScore}%). Focus: KRA ${scores.kraScore}%, attendance ${scores.attendanceScore}%, patient/service ${scores.patientScore}%.`;

  const { rows } = await sharedPool.query(
    `INSERT INTO hr_performance_reviews
       (tenant_id, staff_user_id, cycle, review_period_start, review_period_end, manager_id, kra_score, attendance_score,
        patient_score, quality_score, teamwork_score, overall_score, rating, overall_label, status, manager_notes,
        ai_summary, ai_risks, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
     ON CONFLICT (tenant_id, staff_user_id, cycle) DO UPDATE SET
       review_period_start = EXCLUDED.review_period_start,
       review_period_end = EXCLUDED.review_period_end,
       manager_id = EXCLUDED.manager_id,
       kra_score = EXCLUDED.kra_score,
       attendance_score = EXCLUDED.attendance_score,
       patient_score = EXCLUDED.patient_score,
       quality_score = EXCLUDED.quality_score,
       teamwork_score = EXCLUDED.teamwork_score,
       overall_score = EXCLUDED.overall_score,
       rating = EXCLUDED.rating,
       overall_label = EXCLUDED.overall_label,
       status = EXCLUDED.status,
       manager_notes = EXCLUDED.manager_notes,
       ai_summary = EXCLUDED.ai_summary,
       ai_risks = EXCLUDED.ai_risks,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id, staff_user_id AS "staffId", cycle, kra_score AS "kraScore", attendance_score AS "attendanceScore",
               patient_score AS "patientScore", quality_score AS "qualityScore", teamwork_score AS "teamworkScore",
               overall_score AS "overallScore", rating, overall_label AS "overallLabel", status, ai_summary AS "aiSummary", ai_risks AS "aiRisks"`,
    [req.tenantId, staff.id, safeText(cycle, 40) || defaultPerformanceCycle(), reviewPeriodStart ? asDateOnly(reviewPeriodStart, null) : null,
     reviewPeriodEnd ? asDateOnly(reviewPeriodEnd, null) : null, req.body?.managerId || null, scores.kraScore, scores.attendanceScore,
     scores.patientScore, scores.qualityScore, scores.teamworkScore, overallScore, rating, overallLabel, safeStatus,
     safeText(managerNotes, 2000) || null, aiSummary, aiRisks, JSON.stringify(toJsonObject(metadata)), req.hrUser.id || null]
  );

  res.status(201).json({ success: true, message: 'Performance review saved', data: rows[0] });
});

router.get('/benefits', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT id, name, provider, benefit_type AS "benefitType", coverage,
            enrolled_count AS "enrolledCount", annual_cost AS "annualCost",
            renewal_date AS "renewalDate", status, compliance_notes AS "complianceNotes",
            metadata, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM hr_benefit_programs
     WHERE tenant_id = $1
     ORDER BY status = 'active' DESC, renewal_date NULLS LAST, name`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.get('/benefits/summary', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active,
       COALESCE(SUM(annual_cost),0)::numeric AS annual_cost,
       COALESCE(SUM(enrolled_count),0)::int AS enrolled,
       COUNT(*) FILTER (WHERE renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days')::int AS renewals_due,
       COUNT(*) FILTER (WHERE status IN ('expired','renewal_due'))::int AS attention_required
     FROM hr_benefit_programs
     WHERE tenant_id = $1`,
    [req.tenantId]
  );
  const row = rows[0] || {};
  res.json({
    success: true,
    data: {
      total: Number(row.total || 0),
      active: Number(row.active || 0),
      annualCost: Number(row.annual_cost || 0),
      enrolled: Number(row.enrolled || 0),
      renewalsDue: Number(row.renewals_due || 0),
      attentionRequired: Number(row.attention_required || 0),
    },
  });
});

router.post('/benefits', async (req, res) => {
  const { name, provider = 'Internal', benefitType = 'wellness', coverage, enrolledCount = 0, annualCost = 0, renewalDate, status = 'active', complianceNotes, metadata } = req.body || {};
  if (!safeText(name, 160)) {
    return res.status(400).json({ success: false, message: 'Benefit name is required' });
  }
  const safeStatus = BENEFIT_STATUSES.has(status) ? status : 'active';
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_benefit_programs
       (tenant_id, name, provider, benefit_type, coverage, enrolled_count, annual_cost, renewal_date, status, compliance_notes, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
     RETURNING id, name, provider, benefit_type AS "benefitType", coverage,
               enrolled_count AS "enrolledCount", annual_cost AS "annualCost",
               renewal_date AS "renewalDate", status, compliance_notes AS "complianceNotes", metadata`,
    [
      req.tenantId,
      safeText(name, 160),
      safeText(provider, 160) || 'Internal',
      safeText(benefitType, 80) || 'wellness',
      safeText(coverage, 160) || null,
      clampInt(enrolledCount, 0, 0, 1000000),
      asNumber(annualCost) || 0,
      renewalDate ? asDateOnly(renewalDate, null) : null,
      safeStatus,
      safeText(complianceNotes, 1000) || null,
      JSON.stringify(toJsonObject(metadata)),
      req.hrUser.id || null,
    ]
  );
  res.status(201).json({ success: true, message: 'Benefit program saved', data: rows[0] });
});


async function storeEmployeeDocument({ tenantId, staffId = null, documentType = 'general', file, uploadedBy = null, metadata = {} }) {
  if (!file?.buffer) throw new Error('Document file buffer is required');
  const safeName = safeText(file.originalname, 120).replace(/[^a-zA-Z0-9._-]/g, '_') || 'document';
  const keyPrefix = `uploads/hr/documents/tenant-${tenantId}/${staffId ? `staff-${staffId}` : 'unassigned'}`;
  let stored;
  try {
    stored = await uploadToMinio({ buffer: file.buffer, originalName: safeName, mimeType: file.mimetype, keyPrefix });
    stored.storageProvider = 'minio';
  } catch (error) {
    const finalName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;
    const uploadDir = path.join(__dirname, '../../uploads/hr/documents', `tenant-${tenantId}`, staffId ? `staff-${staffId}` : 'unassigned');
    await fs.mkdir(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, finalName);
    await fs.writeFile(localPath, file.buffer);
    stored = {
      storageProvider: 'local',
      key: path.relative(path.join(__dirname, '../..'), localPath),
      url: `/uploads/hr/documents/tenant-${tenantId}/${staffId ? `staff-${staffId}` : 'unassigned'}/${finalName}`,
      size: file.buffer.length,
      avResult: { clean: true, detail: `Object storage fallback: ${error.message}` },
    };
  }

  const { rows } = await sharedPool.query(
    `INSERT INTO hr_employee_documents
       (tenant_id, staff_user_id, document_type, original_name, mime_type, file_size, storage_provider, storage_key, public_url, metadata, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING id, staff_user_id AS "staffId", document_type AS "documentType", original_name AS "originalName",
               mime_type AS "mimeType", file_size AS "fileSize", storage_provider AS "storageProvider", storage_key AS "storageKey",
               public_url AS "publicUrl", verification_status AS "verificationStatus", metadata, created_at AS "createdAt"`,
    [tenantId, staffId, safeText(documentType, 80) || 'general', file.originalname, file.mimetype, stored.size || file.size || file.buffer.length,
     stored.storageProvider || 'minio', stored.key, stored.url, JSON.stringify({ ...metadata, avResult: stored.avResult || null }), uploadedBy]
  );
  return rows[0];
}

async function storeCvDocument({ tenantId, candidateId = null, sourceEmailId = null, file, uploadedBy = null, metadata = {} }) {
  if (!file?.buffer) throw new Error('CV file buffer is required');
  if (!looksLikeCv({ originalname: file.originalname, mimetype: file.mimetype })) {
    throw Object.assign(new Error('Only PDF, DOC, DOCX, or TXT CV files are allowed'), { status: 400 });
  }

  const candidateSegment = candidateId ? `/candidate-${candidateId}` : '/incoming';
  const keyPrefix = `uploads/hr/cv/tenant-${tenantId}${candidateSegment}`;
  let stored;
  try {
    stored = await uploadToMinio({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      keyPrefix,
    });
    stored.storageProvider = 'minio';
  } catch (error) {
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeText(file.originalname, 100).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploadDir = path.join(__dirname, '../../uploads/hr/cv', `tenant-${tenantId}`, candidateId ? `candidate-${candidateId}` : 'incoming');
    await fs.mkdir(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, safeName);
    await fs.writeFile(localPath, file.buffer);
    stored = {
      storageProvider: 'local',
      key: path.relative(path.join(__dirname, '../..'), localPath),
      url: `/uploads/hr/cv/tenant-${tenantId}/${candidateId ? `candidate-${candidateId}` : 'incoming'}/${safeName}`,
      size: file.buffer.length,
      avResult: { clean: true, detail: `Object storage fallback: ${error.message}` },
    };
  }

  const textSample = file.mimetype === 'text/plain' ? file.buffer.toString('utf8').slice(0, 50000) : '';
  const aiSkills = Array.from(new Set((textSample.match(/\b(ICU|OT|NABH|JCI|BLS|ACLS|nursing|radiology|billing|pharmacy|lab|EMR|EHR|patient safety|infection control)\b/gi) || []).map(v => v.toLowerCase())));
  const aiSummary = textSample ? textSample.slice(0, 500) : `CV stored for ${candidateId ? `candidate ${candidateId}` : 'HR intake'}; detailed parsing pending.`;

  const { rows } = await sharedPool.query(
    `INSERT INTO hr_cv_documents
       (tenant_id, candidate_id, source_email_id, original_name, mime_type, file_size, storage_provider,
        storage_key, public_url, ai_summary, ai_skills, metadata, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING id, candidate_id AS "candidateId", source_email_id AS "sourceEmailId", original_name AS "originalName",
               mime_type AS "mimeType", file_size AS "fileSize", storage_provider AS "storageProvider",
               storage_key AS "storageKey", public_url AS "publicUrl", ai_summary AS "aiSummary",
               ai_skills AS "aiSkills", metadata, created_at AS "createdAt"`,
    [tenantId, candidateId, sourceEmailId, file.originalname, file.mimetype, stored.size || file.size || file.buffer.length,
     stored.storageProvider || 'minio', stored.key, stored.url, aiSummary, aiSkills, JSON.stringify({ ...metadata, avResult: stored.avResult || null }), uploadedBy]
  );
  return rows[0];
}

async function createCandidateFromEmailRow(req, emailRow, overrides = {}) {
  const candidate = { ...buildCandidateFromEmail(emailRow), ...overrides };
  const candidateCode = `CAN-${Date.now().toString().slice(-7)}`;
  const skillList = normalizeArray(candidate.skills);
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_recruitment_candidates
       (tenant_id, requisition_id, candidate_code, name, email, phone, current_position, experience_years,
        source, stage, resume_text, skills, ai_score, ai_summary, ai_recommendation, ai_risks, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'hr_inbox','screening',$9,$10,$11,$12,$13,$14,$15::jsonb)
     RETURNING id, requisition_id AS "requisitionId", candidate_code AS "candidateCode", name, email, phone,
               current_position AS "currentRole", experience_years AS "experienceYears", source, stage,
               resume_text AS "resumeText", skills, ai_score AS "aiScore", ai_summary AS "aiSummary",
               ai_recommendation AS "aiRecommendation", ai_risks AS "aiRisks", metadata, created_at AS "createdAt"`,
    [req.tenantId, candidate.requisitionId || null, candidateCode, safeText(candidate.name, 180), normalizeEmail(candidate.email) || null,
     safeText(candidate.phone, 30) || null, safeText(candidate.currentRole, 180) || null, asNumber(candidate.experienceYears) || 0,
     candidate.resumeText || null, skillList, 55, 'Created from HR inbox. Run AI screening after assigning a requisition.',
     'Needs HR review and requisition mapping', [], JSON.stringify({ sourceEmailId: emailRow.id, sourceMessageId: emailRow.message_id })]
  );
  const attachments = Array.isArray(emailRow.attachments) ? emailRow.attachments : [];
  await sharedPool.query(
    `UPDATE hr_email_inbox SET linked_candidate_id = $3, ai_status = 'candidate_created', is_read = true WHERE tenant_id = $1 AND id = $2`,
    [req.tenantId, emailRow.id, rows[0].id]
  );
  return { candidate: normalizeCandidate(rows[0]), attachmentCount: attachments.length };
}

async function syncHrImapMailbox(settings, tenantId) {
  const imapConfig = {
    user: settings.imap_username || settings.smtp_username || settings.email,
    password: settings.imap_password || settings.smtp_password,
    host: settings.imap_host || 'imap.gmail.com',
    port: settings.imap_port || 993,
    tls: settings.imap_secure !== false,
    connTimeout: 15000,
    authTimeout: 15000,
  };
  if (!imapConfig.user || !imapConfig.password) throw new Error('IMAP credentials are incomplete');

  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    let saved = 0;
    let cvAttachments = 0;
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) { imap.end(); return reject(err); }
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        imap.search([['SINCE', sinceStr]], (searchErr, uids) => {
          if (searchErr || !uids?.length) { imap.end(); return resolve({ newEmails: 0, cvAttachments: 0 }); }
          const fetch = imap.fetch(uids.slice(-100), { bodies: '', struct: true });
          const tasks = [];
          fetch.on('message', (msg) => {
            const chunks = [];
            msg.on('body', (stream) => stream.on('data', chunk => chunks.push(Buffer.from(chunk))));
            msg.once('end', () => {
              tasks.push((async () => {
                const parsed = await simpleParser(Buffer.concat(chunks));
                const msgId = parsed.messageId || `${settings.id}-${Date.now()}-${Math.random()}`;
                const fromAddr = parsed.from?.value?.[0]?.address || '';
                const fromName = parsed.from?.value?.[0]?.name || '';
                const toAddrs = (parsed.to?.value || []).map(a => a.address).filter(Boolean);
                const ccAddrs = (parsed.cc?.value || []).map(a => a.address).filter(Boolean);
                const attachments = [];
                for (const att of parsed.attachments || []) {
                  const meta = { filename: att.filename || 'attachment', contentType: att.contentType, size: att.size || att.content?.length || 0 };
                  if (looksLikeCv({ filename: meta.filename, contentType: meta.contentType }) && att.content) {
                    try {
                      const doc = await storeCvDocument({
                        tenantId,
                        sourceEmailId: null,
                        file: { buffer: att.content, originalname: meta.filename, mimetype: meta.contentType, size: meta.size },
                        metadata: { source: 'hr_inbox_attachment', messageId: msgId },
                      });
                      attachments.push({ ...meta, cvDocumentId: doc.id, publicUrl: doc.publicUrl });
                      cvAttachments += 1;
                    } catch (error) {
                      attachments.push({ ...meta, rejected: true, reason: error.message });
                    }
                  } else {
                    attachments.push(meta);
                  }
                }
                const subject = parsed.subject || '(no subject)';
                const bodyText = parsed.text?.slice(0, 50000) || null;
                const aiIntent = inferRecruitmentIntent({ subject, body: bodyText || '', attachments });
                const result = await sharedPool.query(
                  `INSERT INTO hr_email_inbox
                     (tenant_id, settings_id, message_id, folder, from_addr, from_name, to_addrs, cc_addrs,
                      subject, body_text, body_html, attachments, ai_intent, received_at)
                   VALUES ($1,$2,$3,'inbox',$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
                   ON CONFLICT (tenant_id, message_id) DO NOTHING
                   RETURNING id`,
                  [tenantId, settings.id, msgId, fromAddr, fromName, toAddrs, ccAddrs, subject, bodyText,
                   parsed.html?.slice(0, 200000) || null, JSON.stringify(attachments), aiIntent, parsed.date || new Date()]
                );
                if (result.rowCount) saved += 1;
              })().catch(() => {}));
            });
          });
          fetch.once('error', fetchErr => { imap.end(); reject(fetchErr); });
          fetch.once('end', async () => {
            await Promise.all(tasks);
            await sharedPool.query(`UPDATE hr_email_settings SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1`, [settings.id]);
            imap.end();
            resolve({ newEmails: saved, cvAttachments });
          });
        });
      });
    });
    imap.once('error', reject);
    imap.connect();
  });
}

router.get('/recruitment/cv-documents', async (req, res) => {
  const { candidateId } = req.query;
  const params = [req.tenantId];
  const conditions = ['tenant_id = $1'];
  if (candidateId) { params.push(candidateId); conditions.push(`candidate_id = $${params.length}`); }
  const { rows } = await sharedPool.query(
    `SELECT id, candidate_id AS "candidateId", source_email_id AS "sourceEmailId", original_name AS "originalName",
            mime_type AS "mimeType", file_size AS "fileSize", storage_provider AS "storageProvider",
            storage_key AS "storageKey", public_url AS "publicUrl", ai_summary AS "aiSummary", ai_skills AS "aiSkills",
            metadata, created_at AS "createdAt"
     FROM hr_cv_documents
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ success: true, data: rows });
});

router.post('/recruitment/cv-documents', cvUpload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'CV file is required' });
    const candidateId = req.body?.candidateId || null;
    if (candidateId) {
      const { rows } = await sharedPool.query(`SELECT id FROM hr_recruitment_candidates WHERE tenant_id = $1 AND id = $2`, [req.tenantId, candidateId]);
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Candidate not found' });
    }
    const doc = await storeCvDocument({ tenantId: req.tenantId, candidateId, file: req.file, uploadedBy: req.hrUser.id || null, metadata: { source: 'manual_upload' } });
    res.status(201).json({ success: true, message: 'CV stored in HR intake folder', data: doc });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.get('/mail/settings', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT id, display_name AS "displayName", email, provider, smtp_host AS "smtpHost", smtp_port AS "smtpPort",
            smtp_secure AS "smtpSecure", smtp_username AS "smtpUsername", imap_host AS "imapHost",
            imap_port AS "imapPort", imap_secure AS "imapSecure", imap_username AS "imapUsername",
            is_default AS "isDefault", is_active AS "isActive", last_synced_at AS "lastSyncedAt", created_at AS "createdAt"
     FROM hr_email_settings WHERE tenant_id = $1 ORDER BY is_default DESC, id ASC`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

router.post('/mail/settings', async (req, res) => {
  const { displayName, email, provider = 'custom', smtpHost, smtpPort = 587, smtpSecure = false, smtpUsername, smtpPassword, imapHost, imapPort = 993, imapSecure = true, imapUsername, imapPassword, isDefault = true } = req.body || {};
  if (!normalizeEmail(email)) return res.status(400).json({ success: false, message: 'HR inbox email is required' });
  if (isDefault) await sharedPool.query(`UPDATE hr_email_settings SET is_default = false WHERE tenant_id = $1`, [req.tenantId]);
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_email_settings
       (tenant_id, display_name, email, provider, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
        imap_host, imap_port, imap_secure, imap_username, imap_password, is_default, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id, display_name AS "displayName", email, provider, imap_host AS "imapHost", imap_port AS "imapPort",
               imap_secure AS "imapSecure", imap_username AS "imapUsername", is_default AS "isDefault", is_active AS "isActive"`,
    [req.tenantId, safeText(displayName, 160) || null, normalizeEmail(email), provider, safeText(smtpHost, 255) || null, Number(smtpPort) || 587, Boolean(smtpSecure),
     safeText(smtpUsername, 255) || normalizeEmail(email), smtpPassword || null, safeText(imapHost, 255) || null, Number(imapPort) || 993, Boolean(imapSecure),
     safeText(imapUsername, 255) || safeText(smtpUsername, 255) || normalizeEmail(email), imapPassword || smtpPassword || null, Boolean(isDefault), req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'HR inbox settings saved', data: rows[0] });
});

router.post('/mail/settings/:id/sync', async (req, res) => {
  const { rows } = await sharedPool.query(`SELECT * FROM hr_email_settings WHERE tenant_id = $1 AND id = $2 AND is_active = true`, [req.tenantId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'HR inbox settings not found' });
  try {
    const result = await syncHrImapMailbox(rows[0], req.tenantId);
    res.json({ success: true, message: 'HR inbox synced', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/mail/inbox', async (req, res) => {
  const { page = 1, limit = 20, intent = 'all', search = '' } = req.query;
  const params = [req.tenantId];
  const conditions = ['tenant_id = $1'];
  if (intent && intent !== 'all') { params.push(intent); conditions.push(`ai_intent = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(subject ILIKE $${params.length} OR from_addr ILIKE $${params.length} OR from_name ILIKE $${params.length})`); }
  const offset = (Number(page) - 1) * Number(limit);
  const where = conditions.join(' AND ');
  const [{ rows }, { rows: countRows }] = await Promise.all([
    sharedPool.query(
      `SELECT id, message_id AS "messageId", folder, from_addr AS "fromAddr", from_name AS "fromName", subject,
              LEFT(COALESCE(body_text,''), 240) AS "bodyPreview", attachments, ai_intent AS "aiIntent", ai_status AS "aiStatus",
              linked_candidate_id AS "linkedCandidateId", linked_benefit_id AS "linkedBenefitId", is_read AS "isRead", received_at AS "receivedAt"
       FROM hr_email_inbox WHERE ${where}
       ORDER BY received_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, Number(limit), offset]
    ),
    sharedPool.query(`SELECT COUNT(*) FROM hr_email_inbox WHERE ${where}`, params),
  ]);
  res.json({ success: true, data: { emails: rows, total: Number(countRows[0]?.count || 0), page: Number(page) } });
});

router.get('/mail/inbox/:id', async (req, res) => {
  const { rows } = await sharedPool.query(`SELECT * FROM hr_email_inbox WHERE tenant_id = $1 AND id = $2`, [req.tenantId, req.params.id]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Email not found' });
  await sharedPool.query(`UPDATE hr_email_inbox SET is_read = true WHERE tenant_id = $1 AND id = $2`, [req.tenantId, req.params.id]);
  res.json({ success: true, data: rows[0] });
});

router.post('/mail/inbox/:id/ai-action', async (req, res) => {
  const { rows } = await sharedPool.query(`SELECT * FROM hr_email_inbox WHERE tenant_id = $1 AND id = $2`, [req.tenantId, req.params.id]);
  const email = rows[0];
  if (!email) return res.status(404).json({ success: false, message: 'Email not found' });
  const action = req.body?.action || email.ai_intent;
  if (action === 'recruitment') {
    const result = await createCandidateFromEmailRow(req, email, { requisitionId: req.body?.requisitionId || null });
    return res.status(201).json({ success: true, message: 'Candidate created from HR inbox', data: result });
  }
  if (action === 'benefits') {
    const name = safeText(req.body?.name || email.subject || 'Inbox benefit item', 160);
    const { rows: benefitRows } = await sharedPool.query(
      `INSERT INTO hr_benefit_programs (tenant_id, name, provider, benefit_type, status, compliance_notes, metadata, created_by)
       VALUES ($1,$2,$3,'inbox_intake','renewal_due',$4,$5::jsonb,$6)
       RETURNING id, name, provider, benefit_type AS "benefitType", status, compliance_notes AS "complianceNotes"`,
      [req.tenantId, name, safeText(email.from_name || email.from_addr || 'Inbox', 160), safeText(email.body_text, 1000) || null,
       JSON.stringify({ sourceEmailId: email.id, sourceMessageId: email.message_id }), req.hrUser.id || null]
    );
    await sharedPool.query(`UPDATE hr_email_inbox SET linked_benefit_id = $3, ai_status = 'benefit_created', is_read = true WHERE tenant_id = $1 AND id = $2`, [req.tenantId, email.id, benefitRows[0].id]);
    return res.status(201).json({ success: true, message: 'Benefit intake item created from HR inbox', data: benefitRows[0] });
  }
  await sharedPool.query(`UPDATE hr_email_inbox SET ai_status = 'reviewed', is_read = true WHERE tenant_id = $1 AND id = $2`, [req.tenantId, email.id]);
  res.json({ success: true, message: 'Email marked reviewed' });
});


const RECRUITMENT_STAGES = ['sourced', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
const REQUISITION_STATUSES = ['draft', 'open', 'paused', 'closed'];

const toTextArray = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
};

const normalizeRecruitmentReq = (row) => ({
  id: row.id,
  requisitionCode: row.requisitionCode,
  title: row.title,
  department: row.department,
  role: row.role,
  openings: Number(row.openings || 0),
  priority: row.priority,
  status: row.status,
  location: row.location,
  employmentType: row.employmentType,
  experienceMin: Number(row.experienceMin || 0),
  experienceMax: Number(row.experienceMax || 0),
  skills: row.skills || [],
  description: row.description,
  aiJobBrief: row.aiJobBrief || {},
  applicants: Number(row.applicants || 0),
  shortlisted: Number(row.shortlisted || 0),
  interviews: Number(row.interviews || 0),
  offers: Number(row.offers || 0),
  hired: Number(row.hired || 0),
  createdAt: row.createdAt,
});

const normalizeCandidate = (row) => ({
  id: row.id,
  requisitionId: row.requisitionId,
  requisitionCode: row.requisitionCode || null,
  requisitionTitle: row.requisitionTitle || null,
  candidateCode: row.candidateCode,
  name: row.name,
  email: row.email,
  phone: row.phone,
  currentRole: row.currentRole,
  experienceYears: Number(row.experienceYears || 0),
  source: row.source,
  stage: row.stage,
  resumeText: row.resumeText,
  skills: row.skills || [],
  aiScore: row.aiScore === null || row.aiScore === undefined ? null : Number(row.aiScore),
  aiSummary: row.aiSummary,
  aiRecommendation: row.aiRecommendation,
  aiRisks: row.aiRisks || [],
  expectedCtc: row.expectedCtc === null || row.expectedCtc === undefined ? null : Number(row.expectedCtc),
  noticePeriodDays: row.noticePeriodDays,
  metadata: row.metadata || {},
  createdAt: row.createdAt,
});

function buildJobBrief({ title, department, skills, experienceMin, experienceMax, description }) {
  const skillList = toTextArray(skills);
  return {
    headline: `${title || 'Role'} for ${department || 'General'} department`,
    mustHave: skillList.slice(0, 6),
    screeningCriteria: [
      `${experienceMin || 0}-${experienceMax || 20} years relevant experience`,
      skillList.length ? `Evidence of ${skillList.slice(0, 3).join(', ')}` : 'Documented hospital workflow exposure',
      'Communication, compliance mindset, and shift readiness',
    ],
    interviewFocus: [
      'Clinical or operational scenario judgement',
      'Patient safety and escalation behaviour',
      'Availability, notice period, and compensation alignment',
    ],
    description: description || '',
  };
}

function scoreCandidateAgainstReq(candidate, requisition) {
  const reqSkills = toTextArray(requisition?.skills).map((skill) => skill.toLowerCase());
  const candidateSkills = toTextArray(candidate?.skills).map((skill) => skill.toLowerCase());
  const resume = String(candidate?.resumeText || '').toLowerCase();
  const candidateRole = String(candidate?.currentRole || '').toLowerCase();
  const matched = reqSkills.filter((skill) => candidateSkills.includes(skill) || resume.includes(skill));
  const skillScore = reqSkills.length ? (matched.length / reqSkills.length) * 45 : 24;
  const exp = Number(candidate?.experienceYears || 0);
  const min = Number(requisition?.experience_min ?? requisition?.experienceMin ?? 0);
  const max = Number(requisition?.experience_max ?? requisition?.experienceMax ?? 20);
  const expScore = exp >= min && exp <= max ? 25 : exp > max ? 20 : Math.max(0, 25 - ((min - exp) * 8));
  const roleSignals = [String(requisition?.title || '').toLowerCase(), String(requisition?.department || '').toLowerCase()].filter(Boolean);
  const roleScore = roleSignals.some((signal) => resume.includes(signal) || candidateRole.includes(signal)) ? 15 : 6;
  const complianceTerms = ['nabh', 'jci', 'hipaa', 'infection', 'patient safety', 'emr', 'ehr', 'icu', 'ot', 'bls', 'acls'];
  const complianceHits = complianceTerms.filter((term) => resume.includes(term)).length;
  const complianceScore = Math.min(complianceHits * 3, 15);
  const score = Math.max(0, Math.min(100, Math.round((skillScore + expScore + roleScore + complianceScore) * 10) / 10));
  const gaps = reqSkills.filter((skill) => !matched.includes(skill)).slice(0, 5);
  const risks = [];
  if (exp < min) risks.push(`Experience below target by ${Math.round((min - exp) * 10) / 10} years`);
  if (gaps.length) risks.push(`Missing evidence for: ${gaps.join(', ')}`);
  if (!candidate?.resumeText || String(candidate.resumeText).length < 80) risks.push('Resume/profile text is too thin for confident screening');
  const recommendation = score >= 82 ? 'Strong match - shortlist for department interview' : score >= 65 ? 'Good match - run HR screen and validate gaps' : score >= 45 ? 'Borderline - keep warm or screen for alternate role' : 'Low match - reject or hold';
  return {
    score,
    matchedSkills: matched,
    missingSkills: gaps,
    risks,
    recommendation,
    summary: `${candidate?.name || 'Candidate'} matches ${matched.length}/${reqSkills.length || 0} priority skills with ${exp} years experience. ${recommendation}.`,
    interviewQuestions: [
      `Walk through a recent ${requisition?.department || 'hospital'} scenario where you handled escalation under pressure.`,
      matched[0] ? `Describe your hands-on experience with ${matched[0]}.` : 'Which hospital workflows have you owned end to end?',
      gaps[0] ? `How would you ramp up on ${gaps[0]} in the first 30 days?` : 'What would your first 30-day plan look like?',
      'How do you document patient-safety or compliance incidents?',
    ],
  };
}

router.get('/recruitment/summary', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM hr_recruitment_requisitions WHERE tenant_id = $1 AND status = 'open') AS open_positions,
       (SELECT COALESCE(SUM(openings),0)::int FROM hr_recruitment_requisitions WHERE tenant_id = $1 AND status = 'open') AS openings,
       (SELECT COUNT(*)::int FROM hr_recruitment_candidates WHERE tenant_id = $1) AS candidates,
       (SELECT COUNT(*)::int FROM hr_recruitment_candidates WHERE tenant_id = $1 AND stage IN ('shortlisted','interview')) AS shortlisted,
       (SELECT COUNT(*)::int FROM hr_recruitment_interviews WHERE tenant_id = $1 AND status = 'scheduled' AND scheduled_at >= NOW()) AS upcoming_interviews,
       (SELECT COUNT(*)::int FROM hr_recruitment_candidates WHERE tenant_id = $1 AND stage = 'offer') AS offers,
       (SELECT COUNT(*)::int FROM hr_recruitment_candidates WHERE tenant_id = $1 AND stage = 'hired' AND created_at >= date_trunc('month', NOW())) AS hired_month`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows[0] });
});

router.get('/recruitment/requisitions', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT r.id, r.requisition_code AS "requisitionCode", r.title, r.department, r.role, r.openings,
            r.priority, r.status, r.location, r.employment_type AS "employmentType",
            r.experience_min AS "experienceMin", r.experience_max AS "experienceMax",
            r.skills, r.description, r.ai_job_brief AS "aiJobBrief", r.created_at AS "createdAt",
            COUNT(c.id)::int AS applicants,
            COUNT(c.id) FILTER (WHERE c.stage IN ('shortlisted','interview'))::int AS shortlisted,
            COUNT(c.id) FILTER (WHERE c.stage = 'interview')::int AS interviews,
            COUNT(c.id) FILTER (WHERE c.stage = 'offer')::int AS offers,
            COUNT(c.id) FILTER (WHERE c.stage = 'hired')::int AS hired
     FROM hr_recruitment_requisitions r
     LEFT JOIN hr_recruitment_candidates c ON c.requisition_id = r.id
     WHERE r.tenant_id = $1
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows.map(normalizeRecruitmentReq) });
});

router.post('/recruitment/requisitions', async (req, res) => {
  const { title, department, role = 'staff', openings = 1, priority = 'normal', status = 'open', location, employmentType = 'Full-time', experienceMin = 0, experienceMax = 20, skills, description } = req.body || {};
  if (!title || !department) return res.status(400).json({ success: false, message: 'Title and department are required' });
  const safeStatus = REQUISITION_STATUSES.includes(status) ? status : 'open';
  const skillList = toTextArray(skills);
  const aiJobBrief = buildJobBrief({ title, department, skills: skillList, experienceMin, experienceMax, description });
  const requisitionCode = `REQ-${Date.now().toString().slice(-7)}`;
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_recruitment_requisitions
       (tenant_id, requisition_code, title, department, role, openings, priority, status, location, employment_type, experience_min, experience_max, skills, description, ai_job_brief, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
     RETURNING id, requisition_code AS "requisitionCode", title, department, role, openings, priority, status, location,
               employment_type AS "employmentType", experience_min AS "experienceMin", experience_max AS "experienceMax",
               skills, description, ai_job_brief AS "aiJobBrief", created_at AS "createdAt"`,
    [req.tenantId, requisitionCode, title, department, role, Number(openings) || 1, priority, safeStatus, location || null, employmentType, Number(experienceMin) || 0, Number(experienceMax) || 20, skillList, description || null, JSON.stringify(aiJobBrief), req.hrUser.id || null]
  );
  res.status(201).json({ success: true, message: 'Recruitment requisition created', data: normalizeRecruitmentReq(rows[0]) });
});

router.patch('/recruitment/requisitions/:id', async (req, res) => {
  const existing = await sharedPool.query(`SELECT * FROM hr_recruitment_requisitions WHERE tenant_id = $1 AND id = $2`, [req.tenantId, req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ success: false, message: 'Requisition not found' });
  const current = existing.rows[0];
  const title = req.body.title ?? current.title;
  const department = req.body.department ?? current.department;
  const skills = req.body.skills !== undefined ? toTextArray(req.body.skills) : current.skills;
  const experienceMin = req.body.experienceMin ?? current.experience_min;
  const experienceMax = req.body.experienceMax ?? current.experience_max;
  const description = req.body.description ?? current.description;
  const aiJobBrief = buildJobBrief({ title, department, skills, experienceMin, experienceMax, description });
  const { rows } = await sharedPool.query(
    `UPDATE hr_recruitment_requisitions SET
       title=$3, department=$4, role=$5, openings=$6, priority=$7, status=$8, location=$9,
       employment_type=$10, experience_min=$11, experience_max=$12, skills=$13, description=$14,
       ai_job_brief=$15::jsonb, updated_at=NOW()
     WHERE tenant_id=$1 AND id=$2
     RETURNING id, requisition_code AS "requisitionCode", title, department, role, openings, priority, status, location,
               employment_type AS "employmentType", experience_min AS "experienceMin", experience_max AS "experienceMax",
               skills, description, ai_job_brief AS "aiJobBrief", created_at AS "createdAt"`,
    [req.tenantId, req.params.id, title, department, req.body.role ?? current.role, Number(req.body.openings ?? current.openings), req.body.priority ?? current.priority, req.body.status ?? current.status, req.body.location ?? current.location, req.body.employmentType ?? current.employment_type, Number(experienceMin), Number(experienceMax), skills, description, JSON.stringify(aiJobBrief)]
  );
  res.json({ success: true, message: 'Requisition updated', data: normalizeRecruitmentReq(rows[0]) });
});

router.get('/recruitment/candidates', async (req, res) => {
  const values = [req.tenantId];
  const filters = ['c.tenant_id = $1'];
  if (req.query.requisitionId && req.query.requisitionId !== 'all') {
    values.push(req.query.requisitionId);
    filters.push(`c.requisition_id = $${values.length}`);
  }
  if (req.query.stage && req.query.stage !== 'all') {
    values.push(req.query.stage);
    filters.push(`c.stage = $${values.length}`);
  }
  const { rows } = await sharedPool.query(
    `SELECT c.id, c.requisition_id AS "requisitionId", r.requisition_code AS "requisitionCode", r.title AS "requisitionTitle",
            c.candidate_code AS "candidateCode", c.name, c.email, c.phone, c.current_position AS "currentRole",
            c.experience_years AS "experienceYears", c.source, c.stage, c.resume_text AS "resumeText", c.skills,
            c.ai_score AS "aiScore", c.ai_summary AS "aiSummary", c.ai_recommendation AS "aiRecommendation", c.ai_risks AS "aiRisks",
            c.expected_ctc AS "expectedCtc", c.notice_period_days AS "noticePeriodDays", c.metadata, c.created_at AS "createdAt"
     FROM hr_recruitment_candidates c
     LEFT JOIN hr_recruitment_requisitions r ON r.id = c.requisition_id
     WHERE ${filters.join(' AND ')}
     ORDER BY COALESCE(c.ai_score, 0) DESC, c.created_at DESC
     LIMIT 500`,
    values
  );
  res.json({ success: true, data: rows.map(normalizeCandidate) });
});

router.post('/recruitment/candidates', async (req, res) => {
  const { requisitionId, name, email, phone, currentRole, experienceYears = 0, source = 'direct', stage = 'sourced', resumeText, skills, expectedCtc, noticePeriodDays, metadata } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: 'Candidate name is required' });
  const safeStage = RECRUITMENT_STAGES.includes(stage) ? stage : 'sourced';
  const candidateCode = `CAN-${Date.now().toString().slice(-7)}`;
  const skillList = toTextArray(skills);
  const reqRows = requisitionId ? await sharedPool.query(`SELECT * FROM hr_recruitment_requisitions WHERE tenant_id = $1 AND id = $2`, [req.tenantId, requisitionId]) : { rows: [] };
  const ai = reqRows.rows[0] ? scoreCandidateAgainstReq({ name, skills: skillList, resumeText, experienceYears, currentRole }, reqRows.rows[0]) : null;
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_recruitment_candidates
       (tenant_id, requisition_id, candidate_code, name, email, phone, current_position, experience_years, source, stage, resume_text, skills,
        ai_score, ai_summary, ai_recommendation, ai_risks, expected_ctc, notice_period_days, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)
     RETURNING id, requisition_id AS "requisitionId", candidate_code AS "candidateCode", name, email, phone, current_position AS "currentRole",
               experience_years AS "experienceYears", source, stage, resume_text AS "resumeText", skills, ai_score AS "aiScore",
               ai_summary AS "aiSummary", ai_recommendation AS "aiRecommendation", ai_risks AS "aiRisks", expected_ctc AS "expectedCtc",
               notice_period_days AS "noticePeriodDays", metadata, created_at AS "createdAt"`,
    [req.tenantId, requisitionId || null, candidateCode, name, normalizeEmail(email), phone || null, currentRole || null, Number(experienceYears) || 0, source, safeStage, resumeText || null, skillList, ai?.score || null, ai?.summary || null, ai?.recommendation || null, ai?.risks || [], asNumber(expectedCtc), noticePeriodDays === undefined ? null : Number(noticePeriodDays), JSON.stringify({ ...(metadata || {}), aiScreen: ai })]
  );
  res.status(201).json({ success: true, message: 'Candidate added', data: normalizeCandidate(rows[0]) });
});

router.post('/recruitment/candidates/:id/ai-screen', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT c.*, r.title, r.department, r.skills AS req_skills, r.experience_min, r.experience_max
     FROM hr_recruitment_candidates c
     LEFT JOIN hr_recruitment_requisitions r ON r.id = c.requisition_id
     WHERE c.tenant_id = $1 AND c.id = $2`,
    [req.tenantId, req.params.id]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Candidate not found' });
  const ai = scoreCandidateAgainstReq({ name: row.name, skills: row.skills, resumeText: row.resume_text, experienceYears: row.experience_years, currentRole: row.current_position }, { title: row.title, department: row.department, skills: row.req_skills, experience_min: row.experience_min, experience_max: row.experience_max });
  await sharedPool.query(
    `UPDATE hr_recruitment_candidates SET ai_score=$3, ai_summary=$4, ai_recommendation=$5, ai_risks=$6, metadata = COALESCE(metadata,'{}'::jsonb) || $7::jsonb, updated_at=NOW()
     WHERE tenant_id=$1 AND id=$2`,
    [req.tenantId, req.params.id, ai.score, ai.summary, ai.recommendation, ai.risks, JSON.stringify({ aiScreen: ai })]
  );
  res.json({ success: true, message: 'AI screening completed', data: ai });
});

router.patch('/recruitment/candidates/:id/stage', async (req, res) => {
  const { stage, note } = req.body || {};
  if (!RECRUITMENT_STAGES.includes(stage)) return res.status(400).json({ success: false, message: 'Invalid recruitment stage' });
  const { rows } = await sharedPool.query(
    `UPDATE hr_recruitment_candidates SET stage=$3, metadata = COALESCE(metadata,'{}'::jsonb) || $4::jsonb, updated_at=NOW()
     WHERE tenant_id=$1 AND id=$2
     RETURNING id, requisition_id AS "requisitionId", candidate_code AS "candidateCode", name, email, phone, current_position AS "currentRole",
               experience_years AS "experienceYears", source, stage, resume_text AS "resumeText", skills, ai_score AS "aiScore",
               ai_summary AS "aiSummary", ai_recommendation AS "aiRecommendation", ai_risks AS "aiRisks", expected_ctc AS "expectedCtc",
               notice_period_days AS "noticePeriodDays", metadata, created_at AS "createdAt"`,
    [req.tenantId, req.params.id, stage, JSON.stringify({ lastStageNote: note || null, lastStageChangedAt: new Date().toISOString(), lastStageChangedBy: req.hrUser.id || null })]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Candidate not found' });
  res.json({ success: true, message: 'Candidate stage updated', data: normalizeCandidate(rows[0]) });
});

router.get('/recruitment/candidates/:id/interviews', async (req, res) => {
  const { rows } = await sharedPool.query(
    `SELECT id, candidate_id AS "candidateId", round_name AS "roundName", interviewer, scheduled_at AS "scheduledAt", mode, status, score, feedback, ai_questions AS "aiQuestions", created_at AS "createdAt"
     FROM hr_recruitment_interviews
     WHERE tenant_id = $1 AND candidate_id = $2
     ORDER BY scheduled_at DESC NULLS LAST, created_at DESC`,
    [req.tenantId, req.params.id]
  );
  res.json({ success: true, data: rows });
});

router.post('/recruitment/candidates/:id/interviews', async (req, res) => {
  const { roundName = 'HR Screen', interviewer, scheduledAt, mode = 'video', status = 'scheduled' } = req.body || {};
  const candidateRows = await sharedPool.query(
    `SELECT c.*, r.title, r.department, r.skills AS req_skills, r.experience_min, r.experience_max FROM hr_recruitment_candidates c LEFT JOIN hr_recruitment_requisitions r ON r.id = c.requisition_id WHERE c.tenant_id = $1 AND c.id = $2`,
    [req.tenantId, req.params.id]
  );
  const candidate = candidateRows.rows[0];
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
  const ai = scoreCandidateAgainstReq({ name: candidate.name, skills: candidate.skills, resumeText: candidate.resume_text, experienceYears: candidate.experience_years, currentRole: candidate.current_position }, { title: candidate.title, department: candidate.department, skills: candidate.req_skills, experience_min: candidate.experience_min, experience_max: candidate.experience_max });
  const { rows } = await sharedPool.query(
    `INSERT INTO hr_recruitment_interviews (tenant_id, candidate_id, round_name, interviewer, scheduled_at, mode, status, ai_questions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, candidate_id AS "candidateId", round_name AS "roundName", interviewer, scheduled_at AS "scheduledAt", mode, status, ai_questions AS "aiQuestions", created_at AS "createdAt"`,
    [req.tenantId, req.params.id, roundName, interviewer || null, scheduledAt || null, mode, status, ai.interviewQuestions]
  );
  await sharedPool.query(`UPDATE hr_recruitment_candidates SET stage = 'interview', updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND stage NOT IN ('offer','hired','rejected')`, [req.tenantId, req.params.id]);
  res.status(201).json({ success: true, message: 'Interview scheduled', data: rows[0] });
});

router.post('/recruitment/candidates/:id/offer', async (req, res) => {
  const { offeredCtc, joiningDate, note } = req.body || {};
  const { rows } = await sharedPool.query(
    `UPDATE hr_recruitment_candidates SET stage='offer', metadata = COALESCE(metadata,'{}'::jsonb) || $3::jsonb, updated_at=NOW()
     WHERE tenant_id=$1 AND id=$2
     RETURNING id, candidate_code AS "candidateCode", name, email, stage, metadata`,
    [req.tenantId, req.params.id, JSON.stringify({ offer: { offeredCtc: asNumber(offeredCtc), joiningDate: joiningDate || null, note: note || null, offeredAt: new Date().toISOString(), offeredBy: req.hrUser.id || null } })]
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Candidate not found' });
  res.json({ success: true, message: 'Offer marked for candidate', data: rows[0] });
});

router.post('/recruitment/candidates/:id/hire', async (req, res) => {
  const { department, designation, role = 'staff', joiningDate, phone, gender = 'Other' } = req.body || {};
  const { rows } = await sharedPool.query(
    `SELECT c.*, r.department AS req_department, r.title AS req_title, r.role AS req_role FROM hr_recruitment_candidates c LEFT JOIN hr_recruitment_requisitions r ON r.id = c.requisition_id WHERE c.tenant_id=$1 AND c.id=$2`,
    [req.tenantId, req.params.id]
  );
  const candidate = rows[0];
  if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
  if (!candidate.email) return res.status(400).json({ success: false, message: 'Candidate email is required before hiring' });
  const existing = await User.findOne({ where: { email: normalizeEmail(candidate.email) } });
  let staff = existing;
  if (!staff) {
    const [firstName, ...rest] = String(candidate.name || '').split(' ');
    const safeRole = STAFF_ROLES.includes(role || candidate.req_role) ? (role || candidate.req_role) : 'staff';
    staff = await User.create({
      firstName: firstName || candidate.name,
      lastName: rest.join(' ') || 'Staff',
      email: normalizeEmail(candidate.email),
      password: makeTemporaryPassword(),
      dateOfBirth: '1990-01-01',
      gender,
      phoneNumber: phone || candidate.phone || '0000000000',
      organization_id: req.tenantId,
      organization_type: req.hrOrganizationType,
      role: safeRole,
      status: 'active',
      metadata: {
        department: department || candidate.req_department || 'General',
        designation: designation || candidate.req_title || safeRole,
        joinedAt: joiningDate || todayISO(),
        employmentType: 'Full-time',
        employeeCode: `EMP-${Date.now().toString().slice(-6)}`,
        sourceCandidateId: candidate.id,
        sourceCandidateCode: candidate.candidate_code,
        passwordResetRequired: true,
        temporaryPasswordIssued: true,
        temporaryPasswordIssuedAt: new Date().toISOString(),
        onboardingStatus: 'pending_documents',
      },
    });
  }
  await sharedPool.query(`UPDATE hr_recruitment_candidates SET stage='hired', metadata = COALESCE(metadata,'{}'::jsonb) || $3::jsonb, updated_at=NOW() WHERE tenant_id=$1 AND id=$2`, [req.tenantId, req.params.id, JSON.stringify({ hiredStaffUserId: staff.id, hiredAt: new Date().toISOString() })]);
  res.json({ success: true, message: existing ? 'Candidate linked to existing staff user' : 'Candidate hired and staff record created', data: normalizeStaff(staff) });
});

router.get('/hospital', async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  res.json({ success: true, data: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null });
});

export default router;
