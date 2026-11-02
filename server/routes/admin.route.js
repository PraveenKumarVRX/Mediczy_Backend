import { corporateDisplayName } from '../utils/corporate-data-quality.js';
import express from 'express';
import { body } from 'express-validator';
import { listCronLeases } from '../services/cron-lease.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { requireCorporateAccess } from '../middleware/corporateTenant.js';
import { listBlockedIPs, blockIP, unblockIP, getIPStats } from '../middleware/credentialStuffingGuard.js';
import { getThreatEvents, getThreatStats, lookupIP } from '../middleware/ipThreatIntelligence.js';
import { attachTenantScope, scopeFilter } from '../middleware/tenantScope.middleware.js';
import { createCorporateSecurityRouter } from './corporate-security.route.js';
import mfaStepUp from '../services/mfa-step-up.service.js';
import { adminMfaIdentity } from '../services/admin-mfa.service.js';
import { issueAdminTokenPair } from '../controller/admin.controller.js';
import { listTrustedIps, addTrustedIp, removeTrustedIp } from '../services/admin-ip-binding.service.js';
import getClientIp from '../utils/clientIp.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import userModel, { generateAuthTokenForUser } from '../models/user.model.intelligent.js';
import { Corporate } from '../models/crm.model.intelligent.js';
import { Corporate as InsuranceCorporate, InsuranceCompany } from '../models/insurance-company.model.intelligent.js';
import Nurse from '../models/nurse.model.intelligent.js';
import Assistant from '../models/assistant.model.intelligent.js';
import { Op } from 'sequelize';
import welcomeEmailService from '../services/welcome-email.service.js';
import { dispatchCorporateEmployeeWelcomeEmail } from '../services/corporate-employee-welcome.service.js';
import { normalizeFlexibleDate } from '../utils/flexibleDate.js';
import { auditAction } from '../utils/action-audit.js';
import {
  CORPORATE_EMPLOYEE_ASSOCIATION_SQL,
  CORPORATE_EMPLOYEE_ROSTER_SQL,
  CORPORATE_WELCOME_PREPARE_BULK_SQL,
  mergeCorporateEmployeeRows,
  parseMetadata,
} from '../services/corporate-employee-list.service.js';
import { findPriorBrevoWelcomeEmail, isBrevoHistoryConfigured } from '../services/brevo-transactional-history.service.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { checkQuota, recordSent, getQuotaStatus } from '../utils/emailQuota.js';
import cimsService from '../services/cims-medicine.service.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import {
  reactivateCorporateEmployeeAccount,
  reactivateCorporateEmployeeByIdentifier,
} from '../services/corporate-employee-activation.service.js';
import {
  adminLogin,
  adminRefresh,
  adminLogout,
  adminProfile,
  bulkUploadDoctors,
  bulkUploadLabs,
  bulkUploadPharmacies,
  bulkUploadCorporates,
  getDashboardStats,
  listUsers,
  listDoctors,
  getDoctorCities,
  getDoctorStates,
  getDoctorSpecialties,
  listLabs,
  listPharmacies,
  listCorporates,
  createInternalUser
} from '../controller/admin.controller.js';
import {
  createHealthRiskAssessment,
  getMemberHealthRiskHistory,
  runHealthRiskInference
} from '../controller/healthRisk.controller.js';
import {
  getWhatsAppStats,
  getWhatsAppTemplates,
  createWhatsAppTemplate,
  updateWhatsAppTemplate,
  deleteWhatsAppTemplate,
  getWhatsAppCampaigns,
  createWhatsAppCampaign,
  updateWhatsAppCampaignStatus,
  getWhatsAppMessages,
  sendWhatsAppMessage,
  verifyWhatsAppWebhook,
  getWhatsAppWebhook
} from '../controller/whatsapp.controller.js';

const router = express.Router();

/**
 * Generate unique alphanumeric ID
 * @param {string} prefix - 'C' for Corporate, 'T' for Team member
 * @param {number} length - Total length including prefix (default: 6)
 * @returns {string} Unique ID like C12AB3 or T45XY6
 */
function generateUniqueId(prefix, length = 6) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const randomLength = length - prefix.length;
  let result = prefix;
  
  for (let i = 0; i < randomLength; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    result += chars[randomIndex];
  }
  
  return result;
}

/**
 * Check if unique ID exists in database
 * @param {string} uniqueId - The ID to check
 * @param {string} table - 'corporates' or 'users'
 * @returns {Promise<boolean>}
 */
async function isUniqueIdExists(uniqueId, table) {
  try {
    const [result] = await postgresSequelize.query(
      `SELECT unique_id FROM ${table} WHERE unique_id = :uniqueId LIMIT 1`,
      { replacements: { uniqueId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return result && result.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Generate guaranteed unique ID with retries
 * @param {string} prefix - 'C' for Corporate, 'T' for Team member
 * @param {string} table - 'corporates' or 'users'
 * @param {number} maxRetries - Maximum retry attempts (default: 10)
 * @returns {Promise<string>}
 */
async function generateGuaranteedUniqueId(prefix, table, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const uniqueId = generateUniqueId(prefix);
    const exists = await isUniqueIdExists(uniqueId, table);
    if (!exists) {
      return uniqueId;
    }
  }
  // Fallback: use timestamp suffix if all retries failed
  return `${prefix}${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

// --------------------------------------------------------------------------
// Demo data for admin tables (team/users/doctors) - non-persistent
// --------------------------------------------------------------------------

const demoTeamUsers = [
  {
    id: 'team_001',
    firstName: 'Anita',
    lastName: 'Verma',
    email: 'anita.verma@mediczy.com',
    phoneNumber: '+91-9876543210',
    employeeId: 'EMP-1001',
    department: 'Care Coordination',
    designation: 'Senior Care Manager',
    role: 'Team Member',
    permissions: [
      'User Management',
      'Appointment Management',
      'Support Tickets',
      'Audit Logs'
    ],
    address: { street: '12 Care Street', city: 'Mumbai', state: 'MH', pincode: '400001' },
    emergencyContact: { name: 'Rohit Verma', relationship: 'Spouse', phone: '+91-9876500000' },
    joiningDate: '2024-01-10',
    isActive: true,
    canLogin: true
  },
  {
    id: 'team_002',
    firstName: 'Rahul',
    lastName: 'Mehta',
    email: 'rahul.mehta@mediczy.com',
    phoneNumber: '+91-9876543211',
    employeeId: 'EMP-1002',
    department: 'Support',
    designation: 'Support Specialist',
    role: 'Team Member',
    permissions: [
      'User Management',
      'Support Tickets'
    ],
    address: { street: '8 Health Lane', city: 'Pune', state: 'MH', pincode: '411001' },
    emergencyContact: { name: 'Neha Mehta', relationship: 'Sister', phone: '+91-9876511111' },
    joiningDate: '2024-03-05',
    isActive: true,
    canLogin: true
  }
];

const demoMemberUsers = [
  {
    id: 'user_001',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.sharma@example.com',
    phoneNumber: '+91-9000000001',
    dateOfBirth: '1990-05-12',
    gender: 'Female',
    address: { street: '21 Wellness Road', city: 'Delhi', state: 'DL', pincode: '110001' },
    emergencyContact: { name: 'Anil Sharma', relationship: 'Father', phone: '+91-9000000002' },
    membershipType: 'Premium',
    isActive: true,
    verified: true,
    createdAt: '2024-02-01T10:00:00Z'
  },
  {
    id: 'user_002',
    firstName: 'Amit',
    lastName: 'Kumar',
    email: 'amit.kumar@example.com',
    phoneNumber: '+91-9000000003',
    dateOfBirth: '1985-09-20',
    gender: 'Male',
    address: { street: '55 Care Avenue', city: 'Bengaluru', state: 'KA', pincode: '560001' },
    emergencyContact: { name: 'Sunita Kumar', relationship: 'Mother', phone: '+91-9000000004' },
    membershipType: 'Free',
    isActive: true,
    verified: false,
    createdAt: '2024-02-15T09:30:00Z'
  }
];

const demoDoctors = [
  {
    id: 'dr_001',
    prefix: 'Dr',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@mediczy.com',
    phoneNumber: '+1-234-567-8901',
    specialization: 'Cardiologist',
    experience: 12,
    languages: ['English', 'Hindi'],
    about: 'Experienced cardiologist specializing in interventional procedures.',
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: 'dr_002',
    prefix: 'Dr',
    firstName: 'Michael',
    lastName: 'Chen',
    email: 'michael.chen@mediczy.com',
    phoneNumber: '+1-234-567-8902',
    specialization: 'Pediatrician',
    experience: 8,
    languages: ['English'],
    about: 'Dedicated pediatrician with focus on preventive care.',
    createdAt: '2024-02-10T14:15:00Z'
  }
];

// Demo lists for corporates (admin-only, non-persistent)

const demoAdminCorporates = [
  {
    id: 'corp_001',
    organizationName: 'TechCorp Solutions',
    contactPersonName: 'Rahul Sharma',
    contactEmail: 'rahul.sharma@techcorp.com',
    contactPhone: '+91-9000033331',
    employeeCount: 500,
    contractStatus: 'Active',
    isActive: true,
    createdAt: '2024-02-20T08:00:00Z'
  },
  {
    id: 'corp_002',
    organizationName: 'HealthPlus Insurance',
    contactPersonName: 'Meera Iyer',
    contactEmail: 'meera.iyer@healthplus.com',
    contactPhone: '+91-9000033332',
    employeeCount: 2000,
    contractStatus: 'Prospect',
    isActive: true,
    createdAt: '2024-03-02T09:30:00Z'
  }
];

// Admin login
router.post('/login', authLimiter, [
  body('email').isEmail(),
  // Never validate password SHAPE at login — only that one was sent. The password is checked
  // against a bcrypt hash, so a length rule here adds no security and silently locks out any
  // account whose correct password is shorter than the rule. That is not hypothetical: a 7-char
  // team password could never sign in, and the account was re-keyed to fit this validator rather
  // than the validator being fixed. Shape belongs on the routes that SET a password.
  // (`deptLoginValidation` in unified-hospital-staff.routes.js already does this correctly.)
  body('password').notEmpty().withMessage('Password is required')
], adminLogin);

// Refresh — issue new access + refresh token pair (rotation, no re-login needed)
router.post('/refresh', adminRefresh);

// Logout — revoke refresh token server-side
router.post('/logout', adminLogout);

// Admin profile — rich shape matching team profile
router.get('/profile', authUser, requireRole('admin'), adminProfile);

// Protected admin endpoints
router.post('/masters/doctors', authUser, requireRole('admin'), bulkUploadDoctors);
router.post('/masters/labs', authUser, requireRole('admin'), bulkUploadLabs);
router.post('/masters/pharmacies', authUser, requireRole('admin'), bulkUploadPharmacies);
router.post('/masters/corporates', authUser, requireRole('admin'), bulkUploadCorporates);

// Dashboard and listings
router.get('/dashboard/stats', authUser, requireRole('admin'), getDashboardStats);
// Enhanced users management with filtering and pagination
router.get('/users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      status = 'all',
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;
    
    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    // Build where clause for filtering
    const whereClause = {};
    
    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (status !== 'all') {
      whereClause.isActive = status === 'active';
    }
    
    // Validate sort parameters
    const allowedSortFields = ['createdAt', 'firstName', 'lastName', 'email', 'lastLoginAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    const { count, rows: users } = await userModel.findAndCountAll({
      where: whereClause,
      order: [[sortField, sortDirection]],
      limit: limitNum,
      offset: offset,
      attributes: {
        exclude: ['password', 'resetPasswordToken', 'verificationToken']
      }
    });
    
    // Add computed fields
    const enrichedUsers = users.map(user => ({
      ...user.toJSON(),
      fullName: `${user.firstName} ${user.lastName}`,
      daysSinceJoining: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      status: user.isActive ? 'Active' : 'Inactive'
    }));
    
    res.json({
      success: true,
      data: enrichedUsers,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
        hasNext: (pageNum * limitNum) < count,
        hasPrev: pageNum > 1
      },
      filters: {
        search,
        status,
        sortBy: sortField,
        sortOrder: sortDirection
      }
    });
  } catch (error) {
    console.error('Users list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Health risk assessment endpoints
router.get('/health-risk/members/:memberId', authUser, requireRole('admin'), getMemberHealthRiskHistory);
router.post('/health-risk/members/:memberId/assessments', authUser, requireRole('admin'), createHealthRiskAssessment);
router.post('/health-risk/inference', authUser, requireRole('admin'), runHealthRiskInference);

// Note: /doctors routes are handled by adminDoctorsRouter mounted at /api/admin/doctors in app.js
// This includes GET /doctors, /doctors/filters/*, POST /doctors/:id/create-login, PATCH /doctors/:id/status

router.get('/labs', authUser, requireRole('admin'), listLabs);
router.post('/labs/ensure-login', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { resetLabQaAccount } = await import('../scripts/qa/reset-lab-qa-account.mjs');
    const email = String(req.body?.email || 'lab@mediczy.com').toLowerCase().trim();
    if (!req.body?.password) {
      return res.status(400).json({ success: false, message: 'password is required — no default is set' });
    }
    const password = String(req.body.password);
    const name = String(req.body?.name || 'Mediczy Diagnostics Lab');
    const phoneNumber = String(req.body?.phoneNumber || '+919999000003');

    const result = await resetLabQaAccount({
      email,
      password,
      values: {
        name,
        phoneNumber,
        status: 'active',
        isVerified: true,
        department: req.body?.department || 'pathology',
      },
    });

    return res.json({
      success: true,
      message: `Lab login account ${result.action}`,
      result: { ...result, passwordSet: true },
      login: { email, password, url: '/lab/login' },
    });
  } catch (error) {
    console.error('[admin/labs/ensure-login]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to ensure lab login account',
    });
  }
});

/**
 * Ensure clinic tenant + hospitals login account (subdomain clinic portals).
 * Example: AJDENTAL → https://ajdental.mediqzy.com/clinic/login
 */
router.post('/clinics/ensure-login', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { ensureClinicLoginAccount } = await import('../scripts/qa/ensure-clinic-login-account.mjs');
    const result = await ensureClinicLoginAccount({
      name: req.body?.name || req.body?.clinic_name,
      code: req.body?.code || req.body?.clinic_code,
      subdomain: req.body?.subdomain || req.body?.clinic_slug,
      slug: req.body?.slug || req.body?.clinic_slug || req.body?.subdomain,
      email: req.body?.email || req.body?.admin_email,
      password: req.body?.password || req.body?.admin_password,
      phone: req.body?.phone || req.body?.clinic_phone,
      city: req.body?.city,
      specialty: req.body?.specialty || 'dental',
      plan: req.body?.plan,
      tenantId: req.body?.tenant_id || req.body?.tenantId,
      registrationNumber: req.body?.registration_number,
      admin_first_name: req.body?.admin_first_name,
      admin_last_name: req.body?.admin_last_name,
    });

    return res.json({
      success: true,
      message: `Clinic tenant ${result.tenantAction}; login ${result.hospitalAction}; admin ${result.adminAction}`,
      result,
      login: result.login,
    });
  } catch (error) {
    console.error('[admin/clinics/ensure-login]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to ensure clinic login account',
    });
  }
});

router.get('/pharmacies', authUser, requireRole('admin'), listPharmacies);

/**
 * Get Corporates - Filters by user associations for team users
 * Admin users and Corporate Management team users see the corporate list; limited team users see assigned corporates
 */

const parseMetadataSafe = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

const hasNamedPermission = (permissions = [], required = []) => {
  const needles = (Array.isArray(required) ? required : [required])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const granted = (Array.isArray(permissions) ? permissions : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);

  return needles.some((needle) => granted.some((permission) =>
    permission === needle || permission.includes(needle) || needle.includes(permission)
  ));
};

const teamUserHasCorporateListAccess = (user = {}) => {
  if (user.isAdmin === true) return true;
  const metadata = parseMetadataSafe(user.metadata);
  const role = String(user.role || "").toLowerCase();
  const permissions = Array.isArray(metadata.permissions) ? metadata.permissions : [];
  const accessLevel = String(metadata.accessLevel || "").toLowerCase();

  return Boolean(
    role === "admin" ||
    role === "super_admin" ||
    accessLevel === "full" ||
    hasNamedPermission(permissions, ["Corporate Management", "Corporate Management Access", "All Access"])
  );
};

router.get('/corporates', authUser, requireRole(['admin', 'team']), attachTenantScope, async (req, res) => {
  try {
    const userId = req.user.id;
    const isTeam = req.user.isTeam;
    const isAdmin = req.user.isAdmin;
    const scope   = req.tenantScope;   // set by attachTenantScope
    
    let corporates;
    
    const hasTeamWideCorporateAccess = isTeam && !isAdmin && teamUserHasCorporateListAccess(req.user);

    if (isTeam && !isAdmin && !hasTeamWideCorporateAccess) {
      // Team users without corporate-management-wide permission: get assigned corporates respecting tenant hierarchy scope
      try {
        // Build scope condition from tenant hierarchy (aggregator sees all its brokers' corporates)
        let scopeCondition = '';
        let scopeReplacements = { userId };

        if (scope?.accessibleIds?.length > 0) {
          // Hierarchical access: any corporate whose owned_by_tenant_id is in scope
          scopeCondition = `
            OR c.owned_by_tenant_id IN (:scopeIds)
            OR c.tenant_id IN (:scopeIds)
          `;
          scopeReplacements.scopeIds = scope.accessibleIds;
        }

        const assignedResult = await postgresSequelize.query(`
          SELECT DISTINCT c.*,
            CASE LOWER(COALESCE(c.status, 'active')) WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'suspended' THEN 2 WHEN 'inactive' THEN 3 ELSE 2 END AS sort_status_rank
          FROM corporates c
          LEFT JOIN user_associations ua 
            ON ua."entityId" = c.id 
            AND ua."userId" = :userId 
            AND ua."entityType" = 'corporate'
          LEFT JOIN corporate_team_assignments cta
            ON cta.corporate_id = c.id
            AND cta.team_member_id = :userId
          WHERE (ua.id IS NOT NULL OR cta.id IS NOT NULL OR c."assignedTo" = :userId
            ${scopeCondition})
          ORDER BY sort_status_rank, c."createdAt" DESC NULLS LAST, c.id DESC
        `, {
          replacements: scopeReplacements,
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const assigned = Array.isArray(assignedResult) ? assignedResult : [assignedResult].filter(Boolean);
        corporates = assigned;
        
        console.log(`[Corporates] Team user ${req.user.email} scope=${scope?.mode} - Found ${corporates.length} corporates`);
      } catch (teamQueryError) {
        console.error('[Corporates] Team corporates query error:', teamQueryError.message);
        corporates = [];
      }
    } else {
      // Admin users and team users with Corporate Management permission: get the corporate list
      try {
        const allResult = await postgresSequelize.query(`
          SELECT * FROM corporates ORDER BY CASE LOWER(COALESCE(status, 'active')) WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'suspended' THEN 2 WHEN 'inactive' THEN 3 ELSE 2 END, "createdAt" DESC NULLS LAST, id DESC
        `, {
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const all = Array.isArray(allResult) ? allResult : [];
        corporates = all;
        console.log(`[Corporates] Privileged user ${req.user.email} teamWide=${hasTeamWideCorporateAccess} - Found ${corporates.length} total corporates`);
      } catch (adminQueryError) {
        console.error('[Corporates] All corporates query error:', adminQueryError.message);
        corporates = [];
      }
    }
    
    // Fetch plans for all corporates
    const corporateIds = corporates.map(c => c.id).filter(Boolean);
    let plansMap = {};
    
    if (corporateIds.length > 0) {
      try {
        const plansResult = await postgresSequelize.query(`
          SELECT 
            cps.id as sponsorship_id,
            cps.corporate_id,
            cps.plan_id,
            cps.start_date,
            cps.end_date,
            cps.is_active,
            cps.sponsorship_type,
            cps.corporate_share,
            cps.employee_share
          FROM corporate_plan_sponsorships cps
          WHERE cps.corporate_id IN (:corporateIds)
          ORDER BY cps.start_date DESC
        `, {
          replacements: { corporateIds },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const plans = Array.isArray(plansResult) ? plansResult : [plansResult].filter(Boolean);
        
        // Fetch network partners for each sponsorship
        const sponsorshipIds = (plans || []).map(p => p.sponsorship_id).filter(Boolean);
        let partnersMap = {};
        
        if (sponsorshipIds.length > 0) {
          try {
            const partnersResult = await postgresSequelize.query(`
              SELECT sponsorship_id, partner_tenant_id, status
              FROM tenant_partners
              WHERE sponsorship_id IN (:sponsorshipIds)
            `, {
              replacements: { sponsorshipIds },
              type: postgresSequelize.QueryTypes.SELECT
            });
            
            const partners = Array.isArray(partnersResult) ? partnersResult : [partnersResult].filter(Boolean);
            
            // Group partners by sponsorship_id
            (partners || []).forEach(p => {
              if (!partnersMap[p.sponsorship_id]) {
                partnersMap[p.sponsorship_id] = { hospitals: [], labs: [] };
              }
              // We'll need to determine if it's a hospital or lab - for now add to hospitals
              // In production, you'd query the partner type or join with tenants table
              partnersMap[p.sponsorship_id].hospitals.push(p.partner_tenant_id);
            });
          } catch (partnersError) {
            console.error('[Corporates] Partners query error:', partnersError.message);
            // Continue without partners data
          }
        }
        
        // Group plans by corporate_id
        (plans || []).forEach(plan => {
          if (!plansMap[plan.corporate_id]) {
            plansMap[plan.corporate_id] = [];
          }
          plansMap[plan.corporate_id].push({
            sponsorshipId: plan.sponsorship_id,
            planId: plan.plan_id,
            startDate: plan.start_date,
            endDate: plan.end_date,
            isActive: plan.is_active,
            sponsorshipType: plan.sponsorship_type,
            corporateShare: plan.corporate_share,
            employeeShare: plan.employee_share,
            networkPartners: partnersMap[plan.sponsorship_id] || { hospitals: [], labs: [] }
          });
        });
      } catch (plansError) {
        console.error('[Corporates] Plans query error:', plansError.message);
        // Continue without plans data
      }
    }
    
    // Fetch team assignments for all corporates
    let teamAssignmentsMap = {};
    if (corporateIds.length > 0) {
      try {
        const teamAssignmentsResult = await postgresSequelize.query(`
          SELECT 
            cta.corporate_id,
            cta.team_member_id,
            cta.clinic_id,
            cta.is_primary
          FROM corporate_team_assignments cta
          WHERE cta.corporate_id IN (:corporateIds)
          ORDER BY cta.is_primary DESC, cta.created_at ASC
        `, {
          replacements: { corporateIds },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        const teamAssignments = Array.isArray(teamAssignmentsResult) ? teamAssignmentsResult : [];
        
        // Group team assignments by corporate_id
        (teamAssignments || []).forEach(ta => {
          if (!teamAssignmentsMap[ta.corporate_id]) {
            teamAssignmentsMap[ta.corporate_id] = [];
          }
          teamAssignmentsMap[ta.corporate_id].push({
            teamMemberId: ta.team_member_id,
            clinicId: ta.clinic_id,
            isPrimary: ta.is_primary
          });
        });
      } catch (teamError) {
        console.error('[Corporates] Team assignments query error:', teamError.message);
        // Continue without team assignments
      }
    }

    // Fetch employee counts for all corporates
    let employeeCountMap = {};
    if (corporateIds.length > 0) {
      try {
        const result = await postgresSequelize.query(`
          SELECT "entityId" as corporate_id, COUNT(DISTINCT "userId") as employee_count
          FROM user_associations
          WHERE "entityType" = 'corporate'
          AND "entityId" IN (:corporateIds)
          AND role = 'employee'
          AND status = 'active'
          GROUP BY "entityId"
        `, {
          replacements: { corporateIds },
          type: postgresSequelize.QueryTypes.SELECT
        });
        
        console.log('[Corporates] Employee counts raw result:', result);
        
        // Handle both array and direct result formats
        let employeeCounts = result;
        if (Array.isArray(result) && result.length > 0) {
          // If result is array with single item that's an array, use that
          if (Array.isArray(result[0])) {
            employeeCounts = result[0];
          }
        }
        
        // Ensure employeeCounts is always an array
        if (!Array.isArray(employeeCounts)) {
          employeeCounts = employeeCounts ? [employeeCounts] : [];
        }
        
        console.log('[Corporates] Processing employee counts:', employeeCounts);
        
        employeeCounts.forEach(ec => {
          employeeCountMap[ec.corporate_id] = parseInt(ec.employee_count, 10) || 0;
        });
      } catch (queryError) {
        console.error('[Corporates] Employee counts query error:', queryError.message);
        // Continue without employee counts
      }
    }
    
    // Map to expected format
    const formattedCorporates = corporates.map(c => {
      let metadata = {};
      try {
        metadata = c.metadata ? (typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata) : {};
      } catch (e) {
        metadata = {};
      }
      
      return {
        id: Number(c.id) || c.id,
        uniqueId: c.unique_id || null,
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        email: c.email,
        phoneNumber: c.phoneNumber,
        industry: c.industry,
        employeeCount: employeeCountMap[c.id] ?? c.employeeCount ?? 0,
        packageType: c.packageType || 'Standard',
        billingCycle: c.billingCycle || 'Yearly',
        status: c.status || 'Active',
        gstNumber: c.gstNumber,
        panNumber: c.panNumber,
        createdAt: c.createdAt,
        // Onboarding details
        assignedTeamMemberId: c.assignedTo, // Kept for backward compatibility
        teamAssignments: teamAssignmentsMap[c.id] || [], // Array of {teamMemberId, clinicId, isPrimary}
        plans: plansMap[c.id] || [] // Array of plans with clinic, doctor, partners
      };
    });
    
    return res.json({ 
      success: true, 
      data: formattedCorporates, 
      total: formattedCorporates.length,
      isFiltered: isTeam && !isAdmin
    });
  } catch (error) {
    console.error('[Corporates] Error fetching corporates:', error);
    console.error('[Corporates] Error stack:', error.stack);
    // Return empty list instead of demo data to force frontend to use team login data
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch corporates',
      error: error.message,
      data: []
    });
  }
});

/**
 * Get All Active Insurance Corporates (Master List)
 * GET /api/admin/insurance-corporates
 */
router.get('/insurance-corporates', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 50, onboardedBy } = req.query;
    
    const whereClause = {};
    if (status) whereClause.status = status;
    if (onboardedBy) whereClause.onboardedBy = onboardedBy;

    const offset = (page - 1) * limit;
    
    const { count, rows: corporates } = await InsuranceCorporate.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'companyName', 'cin', 'gstin', 'pan', 'industry', 
        'employeeCount', 'hrContactName', 'hrContactEmail', 'hrContactPhone',
        'officeAddress', 'city', 'state', 'pincode', 
        'status', 'isVerified', 'onboardedBy', 'onboardedById',
        'createdAt', 'updatedAt'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Group by onboarding source
    const groupedBySource = corporates.reduce((acc, corp) => {
      const source = corp.onboardedBy || 'direct';
      if (!acc[source]) acc[source] = [];
      acc[source].push(corp);
      return acc;
    }, {});

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      corporates,
      groupedBySource,
      stats: {
        total: count,
        bySource: Object.keys(groupedBySource).reduce((acc, key) => {
          acc[key] = groupedBySource[key].length;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Get insurance corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get corporates',
      error: error.message
    });
  }
});

// Nurses admin listings backed by Sequelize
router.get('/nurses', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurses = await Nurse.findAll({ order: [['createdAt', 'DESC']] });

    const nursesWithLoginFlag = await Promise.all(
      nurses.map(async (nurse) => {
        const existingUser = await userModel.findOne({ where: { email: nurse.email } });
        return {
          ...nurse.toJSON(),
          hasLogin: !!existingUser,
        };
      })
    );

    return res.json({ success: true, data: nursesWithLoginFlag, total: nurses.length });
  } catch (e) {
    console.error('Failed to fetch nurses:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch nurses' });
  }
});

router.post('/nurses', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nursePayload = req.body?.nurse || req.body;
    let generatedPassword;
    
    // Generate default password if not provided
    if (!nursePayload.password) {
      generatedPassword = Math.random().toString(36).slice(-8) + 'Nurse123!';
      nursePayload.password = generatedPassword;
    }
    
    const created = await Nurse.create(nursePayload);
    
    // Don't return password in response
    const nurseResponse = { ...created.toJSON() };
    delete nurseResponse.password;
    
    return res.status(201).json({
      success: true,
      message: 'Nurse created',
      nurse: nurseResponse,
      ...(generatedPassword ? { generatedPassword } : {}),
    });
  } catch (e) {
    console.error('Failed to create nurse:', e);
    return res.status(500).json({ success: false, message: 'Failed to create nurse', error: e.message });
  }
});

// Reset nurse password (admin-only)
router.post('/nurses/:id/reset-password', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurse = await Nurse.findByPk(req.params.id);
    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    const requestedPassword = String(req.body?.password || '').trim();
    const generatedPassword = requestedPassword
      ? undefined
      : Math.random().toString(36).slice(-10) + 'Nurse123!';
    const newPassword = requestedPassword || generatedPassword;

    // Nurse model hooks will hash the password.
    await nurse.update({ password: newPassword });

    // Best-effort: keep any associated userModel (role=nurse) password aligned.
    try {
      const nurseEmail = String(nurse.email || '').trim().toLowerCase();
      if (nurseEmail) {
        const nurseUser = await userModel.findOne({ where: { email: nurseEmail, role: 'nurse' } });
        if (nurseUser) {
          const hashedPassword = await bcrypt.hash(newPassword, 10);
          await nurseUser.update({ password: hashedPassword });
        }
      }
    } catch (e) {
      console.warn('Failed to sync nurse password to nurse user record:', e?.message || e);
    }

    const nurseResponse = { ...nurse.toJSON() };
    delete nurseResponse.password;

    return res.json({
      success: true,
      message: 'Nurse password reset',
      nurse: nurseResponse,
      ...(generatedPassword ? { generatedPassword } : {}),
    });
  } catch (e) {
    console.error('Failed to reset nurse password:', e);
    return res.status(500).json({ success: false, message: 'Failed to reset nurse password', error: e.message });
  }
});

// Update nurse
router.put('/nurses/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurseData = req.body?.nurse || req.body;
    const nurse = await Nurse.findByPk(req.params.id);

    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    const updateData = {
      firstName: nurseData.firstName || nurse.firstName,
      lastName: nurseData.lastName || nurse.lastName,
      email: nurseData.email || nurse.email,
      phone: nurseData.phone || nurse.phone,
      specialization: nurseData.specialization || nurse.specialization,
      qualification: nurseData.qualification || nurse.qualification,
      experience: nurseData.experience || nurse.experience,
      isActive: nurseData.isActive !== undefined ? nurseData.isActive : nurse.isActive
    };

    if (nurseData.password && nurseData.password.trim() !== '') {
      updateData.password = nurseData.password;
    }

    await nurse.update(updateData);

    const nurseResponse = { ...nurse.toJSON() };
    delete nurseResponse.password;

    return res.json({
      success: true,
      message: 'Nurse updated successfully',
      nurse: nurseResponse
    });
  } catch (e) {
    console.error('Failed to update nurse:', e);
    return res.status(500).json({ success: false, message: 'Failed to update nurse', error: e.message });
  }
});

router.put('/nurses/:id/status', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const nurse = await Nurse.findByPk(id);
    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    if (typeof isActive === 'boolean') {
      nurse.isActive = isActive;
    }
    await nurse.save();

    return res.json({ success: true, nurse });
  } catch (e) {
    console.error('Failed to update nurse status:', e);
    return res.status(500).json({ success: false, message: 'Failed to update nurse status' });
  }
});

// Delete nurse - soft delete
router.delete('/nurses/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const nurse = await Nurse.findByPk(req.params.id);

    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse not found' });
    }

    await nurse.update({ isActive: false });

    return res.json({
      success: true,
      message: 'Nurse deleted successfully'
    });
  } catch (e) {
    console.error('Failed to delete nurse:', e);
    return res.status(500).json({ success: false, message: 'Failed to delete nurse', error: e.message });
  }
});

// Doctor assistants admin listings backed by Sequelize
router.get('/assistants', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistants = await Assistant.findAll({ order: [['createdAt', 'DESC']] });

    const assistantsWithLoginFlag = await Promise.all(
      assistants.map(async (assistant) => {
        const existingUser = await userModel.findOne({ where: { email: assistant.email } });
        return {
          ...assistant.toJSON(),
          hasLogin: !!existingUser,
        };
      })
    );

    return res.json({ success: true, data: assistantsWithLoginFlag, total: assistants.length });
  } catch (e) {
    console.error('Failed to fetch assistants:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch assistants' });
  }
});

router.post('/assistants', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistantPayload = req.body?.assistant || req.body;
    const created = await Assistant.create(assistantPayload);
    return res.status(201).json({
      success: true,
      message: 'Assistant created',
      assistant: created,
    });
  } catch (e) {
    console.error('Failed to create assistant:', e);
    return res.status(500).json({ success: false, message: 'Failed to create assistant' });
  }
});

// Update assistant
router.put('/assistants/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistantData = req.body?.assistant || req.body;
    const assistant = await Assistant.findByPk(req.params.id);

    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    const updateData = {
      firstName: assistantData.firstName || assistant.firstName,
      lastName: assistantData.lastName || assistant.lastName,
      email: assistantData.email || assistant.email,
      phone: assistantData.phone || assistant.phone,
      specialization: assistantData.specialization || assistant.specialization,
      qualification: assistantData.qualification || assistant.qualification,
      experience: assistantData.experience || assistant.experience,
      isActive: assistantData.isActive !== undefined ? assistantData.isActive : assistant.isActive
    };

    if (assistantData.password && assistantData.password.trim() !== '') {
      updateData.password = assistantData.password;
    }

    await assistant.update(updateData);

    return res.json({
      success: true,
      message: 'Assistant updated successfully',
      assistant: {
        id: assistant.id,
        firstName: assistant.firstName,
        lastName: assistant.lastName,
        email: assistant.email
      }
    });
  } catch (e) {
    console.error('Failed to update assistant:', e);
    return res.status(500).json({ success: false, message: 'Failed to update assistant', error: e.message });
  }
});

router.put('/assistants/:id/status', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const assistant = await Assistant.findByPk(id);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    if (typeof isActive === 'boolean') {
      assistant.isActive = isActive;
    }
    await assistant.save();

    return res.json({ success: true, assistant });
  } catch (e) {
    console.error('Failed to update assistant status:', e);
    return res.status(500).json({ success: false, message: 'Failed to update assistant status' });
  }
});

// Delete assistant - soft delete
router.delete('/assistants/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const assistant = await Assistant.findByPk(req.params.id);

    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant not found' });
    }

    await assistant.update({ isActive: false });

    return res.json({
      success: true,
      message: 'Assistant deleted successfully'
    });
  } catch (e) {
    console.error('Failed to delete assistant:', e);
    return res.status(500).json({ success: false, message: 'Failed to delete assistant', error: e.message });
  }
});

// Free-text fields are stored via parameterized queries (never string-concatenated
// into SQL), so this is data-hygiene validation, not an injection boundary — but a
// corporate record with "'; DROP TABLE corporates; --" as its company name is what
// prompted adding it: names/contacts should look like names, not raw input dumped
// straight into a column.
const CORPORATE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateCorporateFields({ companyName, contactPerson, email, phoneNumber }, { requireCompanyName = false, requireEmail = false } = {}) {
  const looksLikeText = (v) => /[a-zA-Z0-9]/.test(v) && !/[;<>]|--/.test(v);

  if (requireCompanyName || companyName !== undefined) {
    if (!companyName || !companyName.trim()) {
      if (requireCompanyName) return 'Company name is required';
    } else {
      const trimmed = companyName.trim();
      if (trimmed.length < 2 || trimmed.length > 255) return 'Company name must be between 2 and 255 characters';
      if (!looksLikeText(trimmed)) return 'Company name contains invalid characters';
    }
  }
  if (requireEmail || email !== undefined) {
    if (!email || !email.trim()) {
      if (requireEmail) return 'Email is required';
    } else if (!CORPORATE_EMAIL_REGEX.test(email.trim()) || email.trim().length > 255) {
      return 'A valid email address is required';
    }
  }
  if (contactPerson !== undefined && contactPerson !== null && contactPerson.trim()) {
    const trimmed = contactPerson.trim();
    if (trimmed.length > 255) return 'Contact person name is too long';
    if (!looksLikeText(trimmed)) return 'Contact person name contains invalid characters';
  }
  if (phoneNumber !== undefined && phoneNumber !== null && phoneNumber.trim()) {
    if (!/^[0-9+\-()\s]{6,20}$/.test(phoneNumber.trim())) return 'Phone number format is invalid';
  }
  return null;
}

router.post('/corporates', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const corporateData = req.body?.corporate || req.body;
    const { 
      companyName, contactPerson, email, phoneNumber, industry, employeeCount, 
      packageType, gstNumber, panNumber, status,
      // Onboarding fields
      assignedTeamMemberId,
      teamAssignments, // Array of: { teamMemberId, clinicId, isPrimary }
      plans // Array of: { planId, clinicId, doctorId, startDate, endDate, networkPartners }
    } = corporateData;
    
    if (!companyName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Company name and email are required'
      });
    }

    const validationError = validateCorporateFields(
      { companyName, contactPerson, email, phoneNumber },
      { requireCompanyName: true, requireEmail: true }
    );
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    // Check if corporate with this email already exists
    const existingRows = await postgresSequelize.query(`
      SELECT id FROM corporates WHERE email = :email LIMIT 1
    `, {
      replacements: { email: email.toLowerCase() },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (existingRows && existingRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this email already exists'
      });
    }

    // Check if corporate with this company name already exists
    const existingNameRows = await postgresSequelize.query(`
      SELECT id FROM corporates WHERE LOWER(TRIM("companyName")) = LOWER(TRIM(:companyName)) LIMIT 1
    `, {
      replacements: { companyName },
      type: postgresSequelize.QueryTypes.SELECT
    });

    if (existingNameRows && existingNameRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this company name already exists'
      });
    }
    
    // Build metadata
    const metadata = {
      onboardedAt: new Date().toISOString(),
      onboardedBy: req.user.email
    };
    
    // Parse assignedTeamMemberId
    const parsedAssignedTeamMemberId = assignedTeamMemberId === null ? null : (parseInt(assignedTeamMemberId) || null);
    
    // Generate unique corporate ID
    const corporateUniqueId = await generateGuaranteedUniqueId('C', 'corporates');
    
    // Insert new corporate
    const [result] = await postgresSequelize.query(`
      INSERT INTO corporates (
        "companyName", "contactPerson", email, "phoneNumber", industry, 
        "employeeCount", "packageType", "gstNumber", "panNumber", status, 
        "assignedTo", metadata, unique_id, "createdAt", "updatedAt"
      )
      VALUES (
        :companyName, :contactPerson, :email, :phoneNumber, :industry, 
        :employeeCount, :packageType, :gstNumber, :panNumber, :status, 
        :assignedTo, :metadata, :uniqueId, NOW(), NOW()
      )
      RETURNING id, uid, unique_id, "companyName", email, status
    `, {
      replacements: {
        companyName: corporateDisplayName(companyName),
        contactPerson: contactPerson || companyName,
        email: email.toLowerCase(),
        phoneNumber: phoneNumber || '',
        industry: industry || 'Other',
        employeeCount: parseInt(employeeCount) || 0,
        packageType: packageType || 'Standard',
        gstNumber: gstNumber || null,
        panNumber: panNumber || null,
        status: status || 'Active',
        assignedTo: parsedAssignedTeamMemberId || (req.user.isTeam ? req.user.id : null),
        metadata: JSON.stringify(metadata),
        uniqueId: corporateUniqueId
      },
      type: postgresSequelize.QueryTypes.INSERT
    });
    
    const newCorporate = result && result[0] ? result[0] : { id: Date.now() };

    let defaultCorporatePlan = null;
    if (newCorporate?.id) {
      try {
        defaultCorporatePlan = await createDefaultCorporatePlanForCorporate({
          corporateId: newCorporate.id,
          companyName,
          employeeCount,
        });
      } catch (planBootstrapError) {
        await postgresSequelize.query(
          `DELETE FROM corporates WHERE id = :corporateId`,
          {
            replacements: { corporateId: newCorporate.id },
            type: postgresSequelize.QueryTypes.DELETE,
          }
        );
        throw new Error(`Corporate plan bootstrap failed: ${planBootstrapError.message}`);
      }
    }
    
    // Create user association for assigned team member
    if (parsedAssignedTeamMemberId && newCorporate.id) {
      await postgresSequelize.query(`
        INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
        VALUES (:userId, 'corporate', :corporateId, 'team_member', true, 'active', NOW(), NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, {
        replacements: { userId: parsedAssignedTeamMemberId, corporateId: newCorporate.id }
      });
    } else if (req.user.isTeam && !req.user.isAdmin && newCorporate.id) {
      // Fallback: assign to current user if team member
      await postgresSequelize.query(`
        INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
        VALUES (:userId, 'corporate', :corporateId, 'team_member', true, 'active', NOW(), NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, {
        replacements: { userId: req.user.id, corporateId: newCorporate.id }
      });
    }
    
    // Create team assignments
    const createdTeamAssignments = [];
    if (teamAssignments && Array.isArray(teamAssignments) && teamAssignments.length > 0 && newCorporate.id) {
      for (const assignment of teamAssignments) {
        const { teamMemberId, clinicId, isPrimary } = assignment;
        const parsedTeamMemberId = teamMemberId ? parseInt(teamMemberId) : null;
        const parsedClinicId = clinicId ? parseInt(clinicId) : null;
        
        if (!parsedTeamMemberId) continue; // Skip if no team member ID
        
        await postgresSequelize.query(`
          INSERT INTO corporate_team_assignments 
          (corporate_id, team_member_id, clinic_id, is_primary, created_at, updated_at)
          VALUES (:corporateId, :teamMemberId, :clinicId, :isPrimary, NOW(), NOW())
          ON CONFLICT (corporate_id, team_member_id) 
          DO UPDATE SET clinic_id = :clinicId, is_primary = :isPrimary, updated_at = NOW()
        `, {
          replacements: {
            corporateId: newCorporate.id,
            teamMemberId: parsedTeamMemberId,
            clinicId: parsedClinicId,
            isPrimary: isPrimary || false
          }
        });
        
        // Also create user association for each team member
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'team_member', :isPrimary, 'active', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, {
          replacements: { 
            userId: parsedTeamMemberId, 
            corporateId: newCorporate.id,
            isPrimary: isPrimary || false
          }
        });
        
        createdTeamAssignments.push({
          teamMemberId: parsedTeamMemberId,
          clinicId: parsedClinicId,
          isPrimary: isPrimary || false
        });
      }
    }
    
    // Create multiple membership plans
    const createdPlans = [];
    if (plans && Array.isArray(plans) && plans.length > 0 && newCorporate.id) {
      for (const plan of plans) {
        const {
          planId,
          startDate,
          endDate,
          networkPartners
        } = plan;

        // Parse and validate IDs
        const parsedPlanId = planId ? parseInt(planId) : null;

        if (!parsedPlanId) continue; // Skip if no plan ID

        // Insert into corporate_plan_sponsorships — no clinic_id/doctor_id
        // columns on this table (see corporate-plan-sponsorship.model.postgres.js)
        const [sponsorshipResult] = await postgresSequelize.query(`
          INSERT INTO corporate_plan_sponsorships
          (corporate_id, plan_id, sponsorship_type, corporate_share, employee_share,
           start_date, end_date, is_active, created_at, updated_at)
          VALUES (:corporateId, :planId, 'FULL', 100, 0,
                  :startDate, :endDate, true, NOW(), NOW())
          RETURNING id
        `, {
          replacements: {
            corporateId: newCorporate.id,
            planId: parsedPlanId,
            startDate: startDate || new Date().toISOString(),
            endDate: endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          },
          type: postgresSequelize.QueryTypes.INSERT
        });
        
        const sponsorshipId = sponsorshipResult && sponsorshipResult[0] ? sponsorshipResult[0].id : null;
        
        // Link network partners to this specific sponsorship
        if (sponsorshipId && networkPartners) {
          const { hospitals = [], labs = [] } = networkPartners;
          
          // Link hospitals
          for (const hospitalId of hospitals) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId: newCorporate.id, 
                partnerId: parseInt(hospitalId),
                sponsorshipId
              }
            });
          }
          
          // Link labs
          for (const labId of labs) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId: newCorporate.id, 
                partnerId: parseInt(labId),
                sponsorshipId
              }
            });
          }
        }
        
        createdPlans.push({
          sponsorshipId,
          planId: parsedPlanId,
          clinicId: parsedClinicId,
          doctorId: parsedDoctorId,
          startDate,
          endDate,
          networkPartners
        });
      }
    }
    
    console.log(`[Corporates] Created corporate ${companyName} by ${req.user.email}`);
    console.log(`[Corporates] - Team Member: ${assignedTeamMemberId || req.user.id}`);
    console.log(`[Corporates] - Team Assignments: ${createdTeamAssignments.length} assignment(s) created`);
    console.log(`[Corporates] - Plans: ${createdPlans.length} plan(s) created`);
    
    return res.status(201).json({
      success: true,
      message: 'Corporate created successfully with onboarding details',
      corporate: {
        id: newCorporate.id,
        uid: newCorporate.uid,
        uniqueId: newCorporate.unique_id,
        companyName: newCorporate.companyName || companyName,
        email: newCorporate.email || email,
        status: newCorporate.status || 'Active',
        assignedTeamMemberId: assignedTeamMemberId || (req.user.isTeam ? req.user.id : null),
        teamAssignments: createdTeamAssignments,
        plans: createdPlans,
        defaultCorporatePlan,
        isActive: true,
        createdAt: new Date().toISOString()
      },
    });
  } catch (error) {
    console.error('Failed to create corporate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate',
      error: error.message
    });
  }
});

/**
 * Update Corporate
 * PUT /api/admin/corporates/:id
 */
router.put('/corporates/:id', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const corporateId = req.resolvedCorporate.id;
    const corporateData = req.body?.corporate || req.body;
    const { 
      companyName, contactPerson, email, phoneNumber, industry, employeeCount, 
      packageType, gstNumber, panNumber, status,
      // Onboarding fields
      assignedTeamMemberId,
      teamAssignments, // Array of: { teamMemberId, clinicId, isPrimary }
      plans // Array of: { sponsorshipId (optional), planId, clinicId, doctorId, startDate, endDate, networkPartners }
    } = corporateData;

    const validationError = validateCorporateFields({ companyName, contactPerson, email, phoneNumber });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    // Fetch existing metadata for partial-update merging
    const [existingCorporate] = await postgresSequelize.query(`
      SELECT id, metadata, "assignedTo" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (!existingCorporate) {
      return res.status(404).json({ success: false, message: 'Corporate not found' });
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const replacements = { corporateId };
    
    if (companyName !== undefined) {
      updates.push('"companyName" = :companyName');
      replacements.companyName = companyName;
    }
    if (contactPerson !== undefined) {
      updates.push('"contactPerson" = :contactPerson');
      replacements.contactPerson = contactPerson;
    }
    if (email !== undefined) {
      updates.push('email = :email');
      replacements.email = email.toLowerCase();
    }
    if (phoneNumber !== undefined) {
      updates.push('"phoneNumber" = :phoneNumber');
      replacements.phoneNumber = phoneNumber;
    }
    if (industry !== undefined) {
      updates.push('industry = :industry');
      replacements.industry = industry;
    }
    if (employeeCount !== undefined) {
      updates.push('"employeeCount" = :employeeCount');
      replacements.employeeCount = parseInt(employeeCount) || 0;
    }
    if (packageType !== undefined) {
      updates.push('"packageType" = :packageType');
      replacements.packageType = packageType;
    }
    if (gstNumber !== undefined) {
      updates.push('"gstNumber" = :gstNumber');
      replacements.gstNumber = gstNumber || null;
    }
    if (panNumber !== undefined) {
      updates.push('"panNumber" = :panNumber');
      replacements.panNumber = panNumber || null;
    }
    if (status !== undefined) {
      updates.push('status = :status');
      replacements.status = status;
    }
    if (assignedTeamMemberId !== undefined) {
      updates.push('"assignedTo" = :assignedTo');
      replacements.assignedTo = assignedTeamMemberId === null ? null : (parseInt(assignedTeamMemberId) || null);
    }
    
    // Always add updatedAt if there are any updates
    if (updates.length > 0) {
      updates.push('"updatedAt" = NOW()');
      
      // Execute update
      await postgresSequelize.query(`
        UPDATE corporates 
        SET ${updates.join(', ')}
        WHERE id = :corporateId
      `, {
        replacements,
        type: postgresSequelize.QueryTypes.UPDATE
      });
    }
    
    // Update user association if team member changed
    if (assignedTeamMemberId !== undefined && assignedTeamMemberId !== existingCorporate.assignedTo) {
      // Deactivate old association
      await postgresSequelize.query(`
        UPDATE user_associations 
        SET status = 'inactive', "updatedAt" = NOW()
        WHERE "entityType" = 'corporate' AND "entityId" = :corporateId
      `, {
        replacements: { corporateId }
      });
      
      // Create new association (only if assignedTeamMemberId is not null)
      const parsedTeamMemberId = assignedTeamMemberId === null ? null : (parseInt(assignedTeamMemberId) || null);
      if (parsedTeamMemberId) {
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'team_member', true, 'active', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, {
          replacements: { userId: parsedTeamMemberId, corporateId }
        });
      }
    }
    
    // Handle plans array (add/update/remove)
    if (plans && Array.isArray(plans)) {
      // Get existing plans for this corporate
      // corporate_plan_sponsorships has no clinic_id/doctor_id columns — the
      // model (corporate-plan-sponsorship.model.postgres.js) only has
      // employeeId, no clinic/doctor reference.
      const [existingPlans] = await postgresSequelize.query(`
        SELECT id as sponsorship_id, plan_id, start_date, end_date
        FROM corporate_plan_sponsorships
        WHERE corporate_id = :corporateId
      `, {
        replacements: { corporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
      
      const existingPlanMap = {};
      (existingPlans || []).forEach(p => {
        existingPlanMap[p.sponsorship_id] = p;
      });
      
      const updatedSponsorshipIds = [];
      
      // Process each plan in the request
      for (const plan of plans) {
        const {
          sponsorshipId,
          planId,
          startDate,
          endDate,
          networkPartners
        } = plan;

        const parsedPlanId = planId ? parseInt(planId) : null;

        if (!parsedPlanId) continue; // Skip if no plan ID

        if (sponsorshipId && existingPlanMap[sponsorshipId]) {
          // Update existing plan
          await postgresSequelize.query(`
            UPDATE corporate_plan_sponsorships
            SET plan_id = :planId,
                start_date = :startDate,
                end_date = :endDate,
                updated_at = NOW()
            WHERE id = :sponsorshipId AND corporate_id = :corporateId
          `, {
            replacements: {
              sponsorshipId,
              corporateId,
              planId: parsedPlanId,
              startDate: startDate || new Date().toISOString(),
              endDate: endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            }
          });

          updatedSponsorshipIds.push(sponsorshipId);

          // Update network partners for this sponsorship
          await postgresSequelize.query(`
            DELETE FROM tenant_partners WHERE sponsorship_id = :sponsorshipId
          `, { replacements: { sponsorshipId } });

        } else {
          // Insert new plan
          const [sponsorshipResult] = await postgresSequelize.query(`
            INSERT INTO corporate_plan_sponsorships
            (corporate_id, plan_id, sponsorship_type, corporate_share, employee_share,
             start_date, end_date, is_active, created_at, updated_at)
            VALUES (:corporateId, :planId, 'FULL', 100, 0,
                    :startDate, :endDate, true, NOW(), NOW())
            RETURNING id
          `, {
            replacements: {
              corporateId,
              planId: parsedPlanId,
              startDate: startDate || new Date().toISOString(),
              endDate: endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            },
            type: postgresSequelize.QueryTypes.INSERT
          });
          
          const newSponsorshipId = sponsorshipResult && sponsorshipResult[0] ? sponsorshipResult[0].id : null;
          if (newSponsorshipId) {
            updatedSponsorshipIds.push(newSponsorshipId);
          }
        }
        
        // Link network partners to sponsorship
        const currentSponsorshipId = sponsorshipId || updatedSponsorshipIds[updatedSponsorshipIds.length - 1];
        if (currentSponsorshipId && networkPartners) {
          const { hospitals = [], labs = [] } = networkPartners;
          
          // Add hospitals
          for (const hospitalId of hospitals) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId, 
                partnerId: parseInt(hospitalId),
                sponsorshipId: currentSponsorshipId
              }
            });
          }
          
          // Add labs
          for (const labId of labs) {
            await postgresSequelize.query(`
              INSERT INTO tenant_partners (corporate_tenant_id, partner_tenant_id, sponsorship_id, status, "createdAt", "updatedAt")
              VALUES (:corporateId, :partnerId, :sponsorshipId, 'active', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, {
              replacements: { 
                corporateId, 
                partnerId: parseInt(labId),
                sponsorshipId: currentSponsorshipId
              }
            });
          }
        }
      }
      
      // Remove plans that were not in the updated list
      const existingIds = Object.keys(existingPlanMap).map(id => parseInt(id));
      const toRemove = existingIds.filter(id => !updatedSponsorshipIds.includes(id));
      
      for (const removeId of toRemove) {
        await postgresSequelize.query(`
          DELETE FROM corporate_plan_sponsorships WHERE id = :sponsorshipId AND corporate_id = :corporateId
        `, {
          replacements: { sponsorshipId: removeId, corporateId }
        });
      }
    }
    
    // Handle team assignments array (add/update/remove)
    if (teamAssignments && Array.isArray(teamAssignments)) {
      // Get existing team assignments for this corporate
      const [existingAssignments] = await postgresSequelize.query(`
        SELECT team_member_id, clinic_id, is_primary
        FROM corporate_team_assignments
        WHERE corporate_id = :corporateId
      `, {
        replacements: { corporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
      
      const existingTeamMemberIds = (existingAssignments || []).map(a => a.team_member_id);
      const updatedTeamMemberIds = [];
      
      // Process each team assignment in the request
      for (const assignment of teamAssignments) {
        const { teamMemberId, clinicId, isPrimary } = assignment;
        const parsedTeamMemberId = teamMemberId ? parseInt(teamMemberId) : null;
        const parsedClinicId = clinicId ? parseInt(clinicId) : null;
        
        if (!parsedTeamMemberId) continue; // Skip if no team member ID
        
        updatedTeamMemberIds.push(parsedTeamMemberId);
        
        // Upsert team assignment
        await postgresSequelize.query(`
          INSERT INTO corporate_team_assignments 
          (corporate_id, team_member_id, clinic_id, is_primary, created_at, updated_at)
          VALUES (:corporateId, :teamMemberId, :clinicId, :isPrimary, NOW(), NOW())
          ON CONFLICT (corporate_id, team_member_id) 
          DO UPDATE SET clinic_id = :clinicId, is_primary = :isPrimary, updated_at = NOW()
        `, {
          replacements: {
            corporateId,
            teamMemberId: parsedTeamMemberId,
            clinicId: parsedClinicId,
            isPrimary: isPrimary || false
          }
        });
        
        // Also update user association
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, 'team_member', :isPrimary, 'active', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, {
          replacements: { 
            userId: parsedTeamMemberId, 
            corporateId,
            isPrimary: isPrimary || false
          }
        });
      }
      
      // Remove team assignments that were not in the updated list
      const toRemoveTeamMembers = existingTeamMemberIds.filter(id => !updatedTeamMemberIds.includes(id));
      
      for (const removeTeamMemberId of toRemoveTeamMembers) {
        await postgresSequelize.query(`
          DELETE FROM corporate_team_assignments 
          WHERE corporate_id = :corporateId AND team_member_id = :teamMemberId
        `, {
          replacements: { corporateId, teamMemberId: removeTeamMemberId }
        });
      }
    }
    
    // Fetch updated record with plans
    const [updated] = await postgresSequelize.query(`
      SELECT * FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    const updatedCorporate = Array.isArray(updated) ? updated[0] : updated;
    
    // Fetch updated team assignments
    const [updatedTeamAssignments] = await postgresSequelize.query(`
      SELECT 
        team_member_id,
        clinic_id,
        is_primary
      FROM corporate_team_assignments
      WHERE corporate_id = :corporateId
      ORDER BY is_primary DESC, created_at ASC
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    // Fetch updated plans
    const [updatedPlans] = await postgresSequelize.query(`
      SELECT
        id as sponsorship_id,
        plan_id,
        start_date,
        end_date,
        is_active
      FROM corporate_plan_sponsorships
      WHERE corporate_id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    console.log(`[Corporates] Updated corporate ID ${corporateId} by ${req.user.email}`);
    console.log(`[Corporates] - Team Assignments: ${(updatedTeamAssignments || []).length} assignment(s) active`);
    console.log(`[Corporates] - Plans: ${(updatedPlans || []).length} plan(s) active`);
    
    return res.json({
      success: true,
      message: 'Corporate updated successfully',
      corporate: {
        id: updatedCorporate.id?.toString(),
        companyName: updatedCorporate.companyName,
        contactPerson: updatedCorporate.contactPerson,
        email: updatedCorporate.email,
        phoneNumber: updatedCorporate.phoneNumber,
        industry: updatedCorporate.industry,
        employeeCount: updatedCorporate.employeeCount || 0,
        packageType: updatedCorporate.packageType || 'Standard',
        status: updatedCorporate.status || 'Active',
        gstNumber: updatedCorporate.gstNumber,
        panNumber: updatedCorporate.panNumber,
        assignedTeamMemberId: updatedCorporate.assignedTo,
        teamAssignments: (updatedTeamAssignments || []).map(ta => ({
          teamMemberId: ta.team_member_id,
          clinicId: ta.clinic_id,
          isPrimary: ta.is_primary
        })),
        plans: (updatedPlans || []).map(p => ({
          sponsorshipId: p.sponsorship_id,
          planId: p.plan_id,
          startDate: p.start_date,
          endDate: p.end_date,
          isActive: p.is_active
        })),
        updatedAt: updatedCorporate.updatedAt
      }
    });
  } catch (error) {
    console.error('Failed to update corporate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update corporate',
      error: error.message
    });
  }
});

/**
 * Delete/Deactivate Corporate
 * DELETE /api/admin/corporates/:id
 */
router.delete('/corporates/:id', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const corporateId = req.resolvedCorporate.id;
    const corporate = req.resolvedCorporate;
    
    // Soft delete: Update status to Inactive
    await postgresSequelize.query(`
      UPDATE corporates 
      SET status = 'Inactive', "updatedAt" = NOW()
      WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.UPDATE
    });
    
    console.log(`[Corporates] Deactivated corporate ${corporate.companyName} (ID ${corporateId}) by ${req.user.email}`);
    
    return res.json({
      success: true,
      message: 'Corporate deactivated successfully'
    });
  } catch (error) {
    console.error('Failed to delete corporate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete corporate',
      error: error.message
    });
  }
});

/**
 * Create Corporate HR/Admin User
 * POST /api/admin/corporate-users
 * Creates a user account with corporate_admin role and links to corporate
 */
router.post('/corporate-users', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId, firstName, lastName, email, phoneNumber, password, promoteExisting } = req.body;
    
    if (!corporateId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'corporateId, email, and password are required'
      });
    }
    
    const normalizedEmail = email.toLowerCase().trim();

    // Verify corporate exists
    const corporates = await postgresSequelize.query(`
      SELECT id, "companyName" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    if (!corporates || corporates.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }

    // FIX (2026-09-26): an email that already belongs to a plain employee of
    // THIS corporate used to hit a dead-end "User with this email already
    // exists" — the employee shows in Corporate Employees but can never be
    // made HR. users has one row per email, so the right move is to grant HR
    // access to that same account (role + a second user_associations row;
    // the unique index includes role so the employee association stays).
    // Needs an explicit promoteExisting=true so a permission change is never
    // silent. Lookup is case-insensitive, matching the edit endpoint.
    const [existingUser] = await postgresSequelize.query(`
      SELECT u.id, u.role, u.status, u.organization_type, u.organization_id,
        EXISTS (
          SELECT 1 FROM user_associations ua
          WHERE ua."userId" = u.id AND ua."entityType" = 'corporate'
            AND ua."entityId" = :corporateId AND ua.role = 'employee' AND ua.status = 'active'
        ) AS is_employee_here,
        EXISTS (
          SELECT 1 FROM user_associations ua
          WHERE ua."userId" = u.id AND ua."entityType" = 'corporate'
            AND ua."entityId" = :corporateId AND ua.role IN ('admin', 'staff')
        ) AS is_hr_here
      FROM users u
      WHERE LOWER(u.email) = :email
      LIMIT 1
    `, {
      replacements: { email: normalizedEmail, corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    let promoteUserId = null;
    if (existingUser) {
      const companyName = corporates[0].companyName || 'this corporate';
      const hrRoles = ['corporate_admin', 'hr_staff'];

      if (existingUser.is_hr_here || (hrRoles.includes(existingUser.role) && String(existingUser.organization_id) === String(corporateId))) {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_ALREADY_HR',
          message: `This email is already an HR admin of ${companyName}.`
        });
      }

      if (!existingUser.is_employee_here || existingUser.role !== 'patient') {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_IN_USE',
          message: 'User with this email already exists (registered outside this corporate\'s employee list). Use a different email.'
        });
      }

      if (existingUser.status && existingUser.status !== 'active') {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_IS_INACTIVE_EMPLOYEE',
          message: `This email is an ${existingUser.status} employee account of ${companyName}. Reactivate the employee first, then make them HR admin.`
        });
      }

      // Feature flag, OFF by default. Promotion overwrites users.role (patient ->
      // HR) and the password on the employee's own account, and mixes HR and
      // employee access in one login. Not enabled until the one-account /
      // two-context design lands. With it off, promoteExisting is ignored.
      if (process.env.ENABLE_EMPLOYEE_TO_HR_PROMOTION !== 'true') {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_IS_EMPLOYEE',
          canPromote: false,
          message: `This email is already an employee of ${companyName}. Use a different email for the HR login (for example a plus-address such as name+hr@company.com).`
        });
      }

      if (promoteExisting !== true && promoteExisting !== 'true') {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_IS_EMPLOYEE',
          canPromote: true,
          message: `This email is already an employee of ${companyName}. Make them an HR admin as well?`
        });
      }

      promoteUserId = existingUser.id;
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // FIX (2026-09-03): one super-HR (corporate_admin) per corporate is
    // now a real, DB-enforced invariant (migrations/corporate-hr
    // -hierarchy.migration.js). If this corporate already has an active
    // corporate_admin, this endpoint creates hr_staff instead — matching
    // what the corporate's own self-service invite flow
    // (services/corporate-hr-management.service.js) does — rather than
    // attempting a second admin the database would reject anyway.
    const existingAdmin = await postgresSequelize.query(`
      SELECT id FROM users
      WHERE organization_type = 'corporate' AND organization_id = :corporateId
        AND role = 'corporate_admin' AND status = 'active'
      LIMIT 1
    `, { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT });
    const roleToAssign = existingAdmin.length > 0 ? 'hr_staff' : 'corporate_admin';

    // Create user
    //
    // FIX (2026-09-03): this INSERT previously omitted organization_type
    // and organization_id entirely. corporateLogin's HR-user lookup
    // (controller/corporate.controller.js) requires
    // organization_type='corporate' AND organization_id matching a real
    // Corporate row — without them, every account created here existed
    // in the database but could never actually log in via the real
    // corporate login form. Confirmed against two real accounts
    // (Ninjacart HR admins) that were silently broken by this exact gap.
    let userResult;
    if (promoteUserId) {
      // Promote the existing employee account: same row, same email — only
      // role/org scope (required by corporateLogin) and the password the admin
      // just set change. Employee association is left untouched.
      userResult = await postgresSequelize.query(`
        UPDATE users
           SET role = :roleToAssign,
               "isCorporate" = true,
               organization_type = 'corporate',
               organization_id = :corporateId,
               password = :password,
               status = 'active',
               "updatedAt" = NOW()
         WHERE id = :userId
        RETURNING id, email, "firstName", "lastName", role
      `, {
        replacements: { userId: promoteUserId, roleToAssign, corporateId, password: hashedPassword },
        type: postgresSequelize.QueryTypes.SELECT
      });
    } else {
      [userResult] = await postgresSequelize.query(`
        INSERT INTO users (
          email, password, "firstName", "lastName", role,
          "isCorporate", "isAdmin", "isTeam",
          "dateOfBirth", "phoneNumber", gender,
          organization_type, organization_id, status,
          "createdAt", "updatedAt"
        )
        VALUES (
          :email, :password, :firstName, :lastName, :roleToAssign,
          true, false, false,
          '1990-01-01', :phoneNumber, 'Male',
          'corporate', :corporateId, 'active',
          NOW(), NOW()
        )
        RETURNING id, email, "firstName", "lastName", role
      `, {
        replacements: {
          email: normalizedEmail,
          password: hashedPassword,
          firstName: firstName || 'HR',
          lastName: lastName || 'Admin',
          phoneNumber: phoneNumber || '',
          corporateId,
          roleToAssign
        },
        type: postgresSequelize.QueryTypes.INSERT
      });
    }
    
    const newUser = userResult && userResult[0] ? userResult[0] : null;
    
    if (!newUser) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create user'
      });
    }
    
    // Create user association to corporate — 'admin'/isPrimary for the
    // actual super-HR, 'staff' otherwise. Previously hardcoded 'admin'
    // + isPrimary:true for every single user this endpoint created,
    // which meant nothing here ever actually distinguished the owner
    // from staff even though user_associations.role already supports it.
    await postgresSequelize.query(`
      INSERT INTO user_associations ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", "createdAt", "updatedAt")
      VALUES (:userId, 'corporate', :corporateId, :assocRole, :isPrimary, 'active', NOW(), NOW(), NOW())
      ON CONFLICT DO NOTHING
    `, {
      replacements: {
        userId: newUser.id,
        corporateId,
        assocRole: roleToAssign === 'corporate_admin' ? 'admin' : 'staff',
        isPrimary: roleToAssign === 'corporate_admin',
      }
    });

    // FIX (2026-09-03): this UPDATE previously ran unconditionally —
    // every hr_staff created here silently overwrote the Corporate
    // record's OWN root login password with the new hire's password,
    // breaking the corporate's direct-login path each time HR staff was
    // added. Only meaningful for the actual first/primary admin.
    if (roleToAssign === 'corporate_admin') {
      await postgresSequelize.query(`
        UPDATE corporates SET password = :password WHERE id = :corporateId
      `, {
        replacements: { password: hashedPassword, corporateId }
      });
    }

    // ── Send HR admin credential email (non-fatal: creation must not fail if email fails) ──
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.mediczy.com';
    const hrDisplayName = `${newUser.firstName || 'HR'} ${newUser.lastName || 'Admin'}`.trim();
    let emailStatus = 'skipped';
    try {
      await welcomeEmailService.sendTransactionalEmail({
        to: normalizedEmail,
        subject: 'Your SmartHealth Corporate HR Login Credentials',
        html: `
          <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
            <h2 style="color:#0f766e;margin:0 0 12px;">Welcome, ${hrDisplayName}!</h2>
            <p>An HR admin login has been created for you on the SmartHealth corporate platform.</p>
            <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:4px 0;"><strong>Login URL:</strong> <a href="${frontendUrl}/corporate/login">${frontendUrl}/corporate/login</a></p>
              <p style="margin:4px 0;"><strong>Email:</strong> ${normalizedEmail}</p>
              <p style="margin:4px 0;"><strong>Password:</strong> (the password set by your administrator)</p>
            </div>
            <p style="color:#64748b;font-size:13px;">For security reasons, please change your password after your first login. If you did not expect this email, please contact support@mediqzy.com.</p>
          </div>`,
        text: `Welcome, ${hrDisplayName}!\n\nAn HR admin login has been created for you.\nLogin URL: ${frontendUrl}/corporate/login\nEmail: ${normalizedEmail}\n\nFor security reasons, please change your password after your first login.`,
        fromName: 'SmartHealth Team',
      });
      emailStatus = 'sent';
    } catch (emailErr) {
      emailStatus = 'failed';
      console.error(`[Corporate Users] Credential email failed for ${normalizedEmail}:`, emailErr?.message || emailErr);
    }

    console.log(`[Corporate Users] Created HR admin ${normalizedEmail} for corporate ${corporates[0]?.companyName || corporateId} (email: ${emailStatus})`);

    return res.status(201).json({
      success: true,
      message: 'Corporate HR admin created successfully',
      emailStatus,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: roleToAssign,
        corporateId
      }
    });
  } catch (error) {
    console.error('Failed to create corporate user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate HR admin',
      error: error.message
    });
  }
});

/**
 * Get Corporate HR/Admin Users
 * GET /api/admin/corporate-users/:corporateId
 * Lists corporate admins linked to the corporate via user_associations
 */
router.get('/corporate-users/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const numericCorporateId = req.resolvedCorporate.id;

    const users = await postgresSequelize.query(
      // DISTINCT ON: a user promoted from employee holds two associations
      // (employee + admin/staff) for this corporate — list them once, preferring
      // the HR association. 'staff' is included so hr_staff created by this
      // endpoint (when a corporate_admin already exists) are actually visible.
      `SELECT * FROM (
         SELECT DISTINCT ON (u.id)
                u.id,
                u.email,
                u."firstName",
                u."lastName",
                u."phoneNumber",
                u.status,
                u."lastLoginAt",
                u."createdAt",
                u."updatedAt",
                ua.role AS association_role,
                ua.status AS association_status
           FROM users u
           JOIN user_associations ua ON ua."userId" = u.id
          WHERE ua."entityType" = 'corporate'
            AND ua."entityId" = :corporateId
            AND (u.role IN ('corporate_admin', 'hr_staff') OR ua.role IN ('admin', 'staff'))
          ORDER BY u.id, (ua.role IN ('admin', 'staff')) DESC
       ) hr
       ORDER BY COALESCE(hr."lastLoginAt", hr."updatedAt") DESC NULLS LAST,
                hr."createdAt" DESC`,
      {
        replacements: { corporateId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phoneNumber: user.phoneNumber || '',
        status: user.status || user.association_status || 'active',
        lastLoginAt: user.lastLoginAt || null,
        createdAt: user.createdAt,
        role: user.association_role || 'admin',
      })),
    });
  } catch (error) {
    console.error('Failed to fetch corporate users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch corporate users',
      error: error.message,
    });
  }
});

/**
 * Update Corporate HR/Admin User
 * PUT /api/admin/corporate-users/:corporateId/:userId
 */
router.put('/corporate-users/:corporateId/:userId', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const corporateId = req.resolvedCorporate.id;
    const userId = parseInt(String(req.params.userId), 10);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const { firstName, lastName, email, phoneNumber, password, status } = req.body || {};
    const normalizedStatus = String(status || '').toLowerCase();
    const allowedStatuses = new Set(['active', 'inactive', 'suspended', 'pending']);

    const [existing] = await postgresSequelize.query(
      `SELECT u.id, u.email
         FROM users u
         JOIN user_associations ua ON ua."userId" = u.id
        WHERE u.id = :userId
          AND ua."entityType" = 'corporate'
          AND ua."entityId" = :corporateId
          AND (u.role IN ('corporate_admin', 'hr_staff') OR ua.role IN ('admin', 'staff'))
        LIMIT 1`,
      {
        replacements: { userId, corporateId },
        type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Corporate HR/admin user not found' });
    }

    const updates = ['"updatedAt" = NOW()'];
    const replacements = { userId };

    if (firstName !== undefined) { updates.push('"firstName" = :firstName'); replacements.firstName = String(firstName || '').trim(); }
    if (lastName !== undefined) { updates.push('"lastName" = :lastName'); replacements.lastName = String(lastName || '').trim(); }
    if (phoneNumber !== undefined) { updates.push('"phoneNumber" = :phoneNumber'); replacements.phoneNumber = String(phoneNumber || '').trim(); }

    if (email !== undefined) {
      const normalizedEmail = String(email || '').toLowerCase().trim();
      if (!normalizedEmail) {
        return res.status(400).json({ success: false, message: 'Email cannot be empty' });
      }

      const [emailConflict] = await postgresSequelize.query(
        `SELECT id FROM users WHERE LOWER(email) = :email AND id != :userId LIMIT 1`,
        {
          replacements: { email: normalizedEmail, userId },
          type: postgresSequelize.QueryTypes.SELECT,
        }
      );

      if (emailConflict) {
        return res.status(409).json({ success: false, message: 'User with this email already exists' });
      }

      updates.push('email = :email');
      replacements.email = normalizedEmail;
    }

    if (password !== undefined && String(password).trim()) {
      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
      updates.push('password = :password');
      replacements.password = hashedPassword;
    }

    if (normalizedStatus) {
      if (!allowedStatuses.has(normalizedStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
      }
      updates.push('status = :status');
      replacements.status = normalizedStatus;
    }

    await postgresSequelize.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = :userId`,
      {
        replacements,
        type: postgresSequelize.QueryTypes.UPDATE,
      }
    );

    if (normalizedStatus) {
      const assocStatus = normalizedStatus === 'inactive' ? 'inactive' : 'active';
      await postgresSequelize.query(
        `UPDATE user_associations
            SET status = :assocStatus,
                "updatedAt" = NOW()
          WHERE "userId" = :userId
            AND "entityType" = 'corporate'
            AND "entityId" = :corporateId
            AND role = 'admin'`,
        {
          replacements: { userId, corporateId, assocStatus },
          type: postgresSequelize.QueryTypes.UPDATE,
        }
      );
    }

    const [updated] = await postgresSequelize.query(
      `SELECT u.id, u.email, u."firstName", u."lastName", u."phoneNumber", u.status, u."lastLoginAt", u."createdAt"
         FROM users u
        WHERE u.id = :userId
        LIMIT 1`,
      {
        replacements: { userId },
        type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,
      message: 'Corporate HR/admin updated successfully',
      user: updated,
    });
  } catch (error) {
    console.error('Failed to update corporate user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update corporate HR/admin user',
      error: error.message,
    });
  }
});

const WELCOME_DRAFT_PASSWORD_PLACEHOLDER = '[generated securely at send time]';
const WELCOME_DRAFT_TTL_HOURS = Math.max(1, Math.min(parseInt(String(process.env.WELCOME_DRAFT_TTL_HOURS || '24'), 10) || 24, 168));

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function safeParseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function ensureCorporateNetworkAssignmentsTable() {
  await postgresSequelize.query(`
    CREATE TABLE IF NOT EXISTS corporate_network_assignments (
      id SERIAL PRIMARY KEY,
      corporate_id INTEGER NOT NULL,
      partner_id INTEGER NOT NULL,
      partner_type VARCHAR(20) NOT NULL,
      employee_ids JSONB DEFAULT '"all"',
      assigned_by INTEGER,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (corporate_id, partner_id, partner_type)
    )
  `);
}

function createWelcomeDraftToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashWelcomeDraftToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function buildCorporateEmployeeWelcomeEmailData({ employee, corporate, fallbackEmployeeId = '' }) {
  const assocMeta = safeParseJsonObject(employee?.assoc_metadata || employee?.metadata);
  const userMeta = safeParseJsonObject(employee?.user_metadata);
  const mergedMeta = { ...userMeta, ...assocMeta };
  const resolvedEmployeeId = employee?.corporate_employee_id || employee?.employee_id || mergedMeta.employeeId || fallbackEmployeeId || '';

  return {
    email: normalizeEmailAddress(employee?.email),
    firstName: employee?.firstName || mergedMeta.firstName || 'Employee',
    lastName: employee?.lastName || mergedMeta.lastName || '',
    companyName: corporate.companyName,
    employeeId: resolvedEmployeeId,
    department: employee?.department_name || mergedMeta.department || '',
    planName: mergedMeta.planName || mergedMeta.insurancePlan || corporate.packageType || 'Corporate Employee Health Plan',
    coverageAmount: mergedMeta.coverageAmount || mergedMeta.sumInsured,
    planStartDate: mergedMeta.planStartDate,
    planEndDate: mergedMeta.planEndDate,
    planValidity: mergedMeta.planValidity,
    planBenefits: mergedMeta.planBenefits,
    sponsor: mergedMeta.sponsor,
    copay: mergedMeta.copay,
  };
}

async function loadCorporateEmployeeForWelcome({ corporateId, userId, employeeId }) {
  const numericUserId = userId ? parseInt(String(userId), 10) : null;
  if (userId && Number.isNaN(numericUserId)) {
    const error = new Error('Invalid userId');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmployeeId = String(employeeId || '').trim().toLowerCase();
  if (!numericUserId && !normalizedEmployeeId) {
    const error = new Error('userId or employeeId is required');
    error.statusCode = 400;
    throw error;
  }

  const filters = [];
  const replacements = { corporateId };
  if (numericUserId) {
    replacements.userId = numericUserId;
    filters.push('u.id = :userId');
  }
  if (normalizedEmployeeId) {
    replacements.employeeIdLower = normalizedEmployeeId;
    filters.push("(LOWER(COALESCE(u.employee_id, '')) = :employeeIdLower OR LOWER(COALESCE(ua.metadata->>'employeeId', '')) = :employeeIdLower OR LOWER(COALESCE(ce.\"employeeId\", '')) = :employeeIdLower)");
  }

  const [employee] = await postgresSequelize.query(
    `SELECT u.id, u.email, u."firstName", u."lastName", u.employee_id, u.department_name,
            u.password, u.metadata AS user_metadata, u.status AS user_status, u."isVerified" AS user_is_verified,
            ua.metadata AS assoc_metadata, ce."employeeId" AS corporate_employee_id
       FROM users u
       JOIN user_associations ua ON u.id = ua."userId"
        AND ua."entityType" = 'corporate'
        AND ua."entityId" = :corporateId
        AND ua.role = 'employee'
       LEFT JOIN LATERAL (
         SELECT "employeeId" FROM corporate_employees
          WHERE "userId" = u.id AND corporate_id = :corporateId
          ORDER BY id DESC LIMIT 1
       ) ce ON true
      WHERE ${filters.join(' AND ')}
      LIMIT 1`,
    { replacements, type: postgresSequelize.QueryTypes.SELECT }
  );

  if (!employee) {
    const error = new Error('Employee not found in this corporate');
    error.statusCode = 404;
    throw error;
  }

  if (numericUserId && Number(employee.id) !== Number(numericUserId)) {
    const error = new Error('Employee user mismatch');
    error.statusCode = 400;
    throw error;
  }

  return employee;
}

let ensureWelcomeDeliveryAuditTablePromise = null;

async function ensureWelcomeDeliveryAuditTable() {
  if (!ensureWelcomeDeliveryAuditTablePromise) {
    ensureWelcomeDeliveryAuditTablePromise = (async () => {
      await postgresSequelize.query(`
        CREATE TABLE IF NOT EXISTS corporate_welcome_email_deliveries (
          id BIGSERIAL PRIMARY KEY,
          corporate_id BIGINT NOT NULL,
          user_id BIGINT NOT NULL DEFAULT 0,
          employee_id VARCHAR(100),
          recipient_email VARCHAR(320) NOT NULL,
          subject TEXT,
          idempotency_key VARCHAR(160) NOT NULL,
          request_scope VARCHAR(40) NOT NULL DEFAULT 'batch_send',
          status VARCHAR(24) NOT NULL DEFAULT 'prepared',
          attempts INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by BIGINT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await postgresSequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_welcome_delivery_idempotency
        ON corporate_welcome_email_deliveries (corporate_id, user_id, recipient_email, idempotency_key, request_scope)
      `);

      await postgresSequelize.query(`
        UPDATE corporate_welcome_email_deliveries
           SET status = 'external_sent',
               metadata = metadata || jsonb_build_object('legacyStatus', 'sent', 'externalHistoryNormalizedAt', NOW()),
               updated_at = NOW()
         WHERE status = 'sent'
           AND COALESCE(metadata->>'source', '') = 'brevo_transactional_history'
      `);

      await postgresSequelize.query(`
        WITH ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY corporate_id, LOWER(recipient_email)
                   ORDER BY CASE WHEN status = 'sent' THEN 0 ELSE 1 END, updated_at DESC, id DESC
                 ) AS rn
            FROM corporate_welcome_email_deliveries
           WHERE status IN ('queued', 'sent')
        )
        UPDATE corporate_welcome_email_deliveries d
           SET status = 'duplicate',
               error_message = COALESCE(error_message, 'Duplicate active welcome delivery superseded'),
               metadata = metadata || jsonb_build_object(
                 'dedupedActiveRecipientAt', NOW(),
                 'previousStatus', d.status
               ),
               updated_at = NOW()
          FROM ranked r
         WHERE d.id = r.id
           AND r.rn > 1
      `);

      await postgresSequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_welcome_active_recipient
        ON corporate_welcome_email_deliveries (corporate_id, LOWER(recipient_email))
        WHERE status IN ('queued', 'sent')
      `);

      await postgresSequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_corp_welcome_delivery_status
        ON corporate_welcome_email_deliveries (corporate_id, status, updated_at DESC)
      `);
    })().catch((error) => {
      ensureWelcomeDeliveryAuditTablePromise = null;
      throw error;
    });
  }

  await ensureWelcomeDeliveryAuditTablePromise;
}

async function findWelcomeDeliveryByIdempotency({
  corporateId,
  userId,
  recipientEmail,
  idempotencyKey,
  requestScope = 'batch_send',
}) {
  await ensureWelcomeDeliveryAuditTable();
  const [row] = await postgresSequelize.query(
    `SELECT id, status, attempts
       FROM corporate_welcome_email_deliveries
      WHERE corporate_id = :corporateId
        AND user_id = :userId
        AND recipient_email = :recipientEmail
        AND idempotency_key = :idempotencyKey
        AND request_scope = :requestScope
      LIMIT 1`,
    {
      replacements: {
        corporateId,
        userId: userId || 0,
        recipientEmail,
        idempotencyKey,
        requestScope,
      },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  return row || null;
}

async function findActiveWelcomeDeliveryForRecipient({
  corporateId,
  recipientEmail,
}) {
  await ensureWelcomeDeliveryAuditTable();

  const [row] = await postgresSequelize.query(
    `SELECT id, status, updated_at
       FROM corporate_welcome_email_deliveries
      WHERE corporate_id = :corporateId
        AND LOWER(recipient_email) = LOWER(:recipientEmail)
        AND COALESCE(metadata->>'source', '') <> 'brevo_transactional_history'
        AND status IN ('queued', 'sent')
      ORDER BY CASE WHEN status = 'sent' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
    {
      replacements: {
        corporateId,
        recipientEmail,
      },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  return row || null;
}

async function createWelcomeDeliveryRecord({
  corporateId,
  userId,
  employeeId,
  recipientEmail,
  subject,
  idempotencyKey,
  requestScope = 'batch_send',
  createdBy,
  metadata = {},
}) {
  await ensureWelcomeDeliveryAuditTable();
  const [row] = await postgresSequelize.query(
    `INSERT INTO corporate_welcome_email_deliveries
      (corporate_id, user_id, employee_id, recipient_email, subject, idempotency_key, request_scope, status, attempts, metadata, created_by)
     VALUES
      (:corporateId, :userId, :employeeId, :recipientEmail, :subject, :idempotencyKey, :requestScope, 'prepared', 0, :metadata::jsonb, :createdBy)
     ON CONFLICT (corporate_id, user_id, recipient_email, idempotency_key, request_scope)
     DO UPDATE SET
      subject = EXCLUDED.subject,
      metadata = corporate_welcome_email_deliveries.metadata || EXCLUDED.metadata,
      updated_at = NOW()
     RETURNING id, status, attempts`,
    {
      replacements: {
        corporateId,
        userId: userId || 0,
        employeeId: employeeId || null,
        recipientEmail,
        subject,
        idempotencyKey,
        requestScope,
        metadata: JSON.stringify(metadata || {}),
        createdBy: createdBy || null,
      },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );
  return row || null;
}

async function supersedeActiveWelcomeDeliveriesForRecipient({
  corporateId,
  recipientEmail,
  actorUserId,
  reason = 'Superseded by explicit resend override',
}) {
  await ensureWelcomeDeliveryAuditTable();

  if (!recipientEmail) return [];

  const rows = await postgresSequelize.query(
    `UPDATE corporate_welcome_email_deliveries
        SET status = 'duplicate',
            error_message = COALESCE(error_message, :reason),
            metadata = metadata || jsonb_build_object(
              'supersededByForceResendAt', NOW(),
              'supersededByUserId', :actorUserId
            ),
            updated_at = NOW()
      WHERE corporate_id = :corporateId
        AND LOWER(recipient_email) = LOWER(:recipientEmail)
        AND status IN ('queued', 'sent')
      RETURNING id, status`,
    {
      replacements: {
        corporateId,
        recipientEmail,
        actorUserId: actorUserId || null,
        reason,
      },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  return Array.isArray(rows) ? rows : [];
}

async function updateWelcomeDeliveryRecordStatus({
  deliveryId,
  status,
  errorMessage,
  incrementAttempts = false,
  metadata,
}) {
  await ensureWelcomeDeliveryAuditTable();
  await postgresSequelize.query(
    `UPDATE corporate_welcome_email_deliveries
        SET status = :status,
            error_message = :errorMessage,
            attempts = attempts + :attemptIncrement,
            metadata = CASE
              WHEN :metadataJson IS NULL THEN metadata
              ELSE metadata || :metadataJson::jsonb
            END,
            updated_at = NOW()
      WHERE id = :deliveryId`,
    {
      replacements: {
        deliveryId,
        status,
        errorMessage: errorMessage || null,
        attemptIncrement: incrementAttempts ? 1 : 0,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
      type: postgresSequelize.QueryTypes.UPDATE,
    }
  );
}

async function createPreparedWelcomeDraft({
  corporateId,
  corporate,
  employee,
  temporaryPassword,
  actorUserId,
  teamUserId,
}) {
  const welcomeEmailData = buildCorporateEmployeeWelcomeEmailData({ employee, corporate });
  const draftPreview = await welcomeEmailService.buildCorporateEmployeeWelcomeEmail(
    welcomeEmailData,
    WELCOME_DRAFT_PASSWORD_PLACEHOLDER,
    { teamUserId, corporateId }
  );
  const draftToken = createWelcomeDraftToken();
  const draftTokenHash = hashWelcomeDraftToken(draftToken);
  const expiresAt = new Date(Date.now() + WELCOME_DRAFT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const deliveryRecord = await createWelcomeDeliveryRecord({
    corporateId,
    userId: employee.id,
    employeeId: welcomeEmailData.employeeId,
    recipientEmail: welcomeEmailData.email,
    subject: draftPreview.subject,
    idempotencyKey: draftTokenHash.slice(0, 120),
    requestScope: 'draft_prepare',
    createdBy: actorUserId,
    metadata: {
      source: 'draft_prepare',
      draftTokenHash,
      draftExpiresAt: expiresAt,
      passwordEncrypted: encrypt(temporaryPassword),
      canonicalEmail: welcomeEmailData.email,
      userId: Number(employee.id),
      employeeId: welcomeEmailData.employeeId || null,
    },
  });

  return {
    draftToken,
    draftExpiresAt: expiresAt,
    deliveryId: deliveryRecord?.id || null,
    draft: {
      to: draftPreview.to,
      subject: draftPreview.subject,
      html: draftPreview.html,
    },
  };
}

async function loadPreparedWelcomeDraft({ corporateId, draftToken }) {
  const token = String(draftToken || '').trim();
  if (!token) return null;

  await ensureWelcomeDeliveryAuditTable();
  const draftTokenHash = hashWelcomeDraftToken(token);
  const [row] = await postgresSequelize.query(
    `SELECT id, corporate_id, user_id, employee_id, recipient_email, subject, status, metadata, created_by
       FROM corporate_welcome_email_deliveries
      WHERE corporate_id = :corporateId
        AND request_scope = 'draft_prepare'
        AND status = 'prepared'
        AND metadata->>'draftTokenHash' = :draftTokenHash
      LIMIT 1`,
    {
      replacements: { corporateId, draftTokenHash },
      type: postgresSequelize.QueryTypes.SELECT,
    }
  );

  if (!row) return null;
  const metadata = safeParseJsonObject(row.metadata);
  const expiresAt = metadata.draftExpiresAt ? new Date(metadata.draftExpiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await updateWelcomeDeliveryRecordStatus({
      deliveryId: row.id,
      status: 'expired',
      errorMessage: 'Draft token expired',
      metadata: { expiredAt: new Date().toISOString() },
    });
    return null;
  }

  const temporaryPassword = decrypt(metadata.passwordEncrypted);
  if (!temporaryPassword) {
    throw new Error('Prepared draft is missing encrypted credentials');
  }

  return { ...row, metadata, temporaryPassword };
}

async function assertNoPriorWelcomeDelivery({ corporateId, userId, employeeId, recipientEmail, subject, actorUserId }) {
  const activeRecipientDelivery = await findActiveWelcomeDeliveryForRecipient({
    corporateId,
    recipientEmail,
  });

  if (activeRecipientDelivery) {
    const error = new Error('Welcome email already queued or sent for this recipient');
    error.statusCode = 409;
    error.delivery = activeRecipientDelivery;
    throw error;
  }

  if (isBrevoHistoryConfigured()) {
    const brevoMatch = await findPriorBrevoWelcomeEmail({
      email: recipientEmail,
      subject,
      days: Number(process.env.BREVO_WELCOME_HISTORY_DAYS || 90),
    });

    if (brevoMatch?.found) {
      let externalDelivery = null;
      try {
        externalDelivery = await createExternalWelcomeDeliveryFromBrevo({
          corporateId,
          userId,
          employeeId,
          recipientEmail,
          subject: brevoMatch.subject || subject || 'Welcome',
          actorUserId,
          brevoMatch,
        });
      } catch (auditError) {
        console.warn('[welcome-email] Brevo history audit insert skipped:', auditError?.message || auditError);
      }

      const error = new Error('Brevo transactional history shows this welcome email was already sent');
      error.statusCode = 409;
      error.delivery = externalDelivery;
      error.brevoMatch = brevoMatch;
      throw error;
    }
  }
}

async function createExternalWelcomeDeliveryFromBrevo({
  corporateId,
  userId,
  employeeId,
  recipientEmail,
  subject,
  actorUserId,
  brevoMatch,
}) {
  const idempotencyRaw = [
    corporateId,
    recipientEmail,
    brevoMatch?.messageId || brevoMatch?.uuid || brevoMatch?.date || '',
  ].join('|');
  const idempotencyKey = 'brevo-history-' + crypto.createHash('sha256').update(idempotencyRaw).digest('hex').slice(0, 32);

  const deliveryRecord = await createWelcomeDeliveryRecord({
    corporateId,
    userId,
    employeeId,
    recipientEmail,
    subject: subject || brevoMatch?.subject || 'Welcome email',
    idempotencyKey,
    createdBy: actorUserId,
    metadata: {
      source: 'brevo_transactional_history',
      brevo: brevoMatch,
    },
  });

  if (deliveryRecord?.id) {
    await updateWelcomeDeliveryRecordStatus({
      deliveryId: deliveryRecord.id,
      status: 'external_sent',
      metadata: {
        externalSentAt: brevoMatch?.date || new Date().toISOString(),
        externalProvider: 'brevo',
      },
    });
  }

  return deliveryRecord || null;
}
const SYSTEM_WELCOME_EMAIL_ALLOWLIST = new Set([
  'support@mediqzy.com',
  'noreply@mediqzy.com',
  'hello@mysmarthealth.in',
  'support@mysmarthealth.in',
  'corporate@mediqzy.com',
]);

function extractEmailAddresses(content = '') {
  const matches = String(content || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((value) => String(value).trim().toLowerCase())));
}

function findMismatchedCredentialEmails({ recipientEmail, subject, html }) {
  const recipient = String(recipientEmail || '').trim().toLowerCase();
  const found = extractEmailAddresses(`${subject || ''}\n${html || ''}`);
  return found.filter((email) => email !== recipient && !SYSTEM_WELCOME_EMAIL_ALLOWLIST.has(email));
}

function parseJsonSafe(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function getDefaultCorporatePlanDates() {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  return {
    start,
    end: end.toISOString().slice(0, 10),
  };
}

/** Normalize Sequelize INSERT…RETURNING / SELECT row payloads into a single object. */
function firstReturningRow(queryResult) {
  if (!queryResult) return null;
  // QueryTypes.INSERT → [rows|row, rowCount]; QueryTypes.SELECT → rows[]
  const head = Array.isArray(queryResult) ? queryResult[0] : queryResult;
  if (!head) return null;
  if (Array.isArray(head)) return head[0] || null;
  if (typeof head === 'object') return head;
  return null;
}

async function getActiveCorporateSubscriptionPlan({ corporateId, transaction = null }) {
  const [plan] = await postgresSequelize.query(
    `SELECT id, name, slug, price, currency, billing_cycle, metadata
       FROM subscription_plans
      WHERE type = 'CORPORATE'
        AND is_active = true
        AND (
          (metadata->>'corporateId')::int = :corporateId
          OR slug LIKE ('corp-' || CAST(:corporateId AS TEXT) || '-%')
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`,
    {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT,
      transaction,
    }
  );

  return plan || null;
}

async function requireActiveCorporatePlanOrThrow({ corporateId, transaction = null }) {
  const activePlan = await getActiveCorporateSubscriptionPlan({ corporateId, transaction });
  if (activePlan) {
    return activePlan;
  }

  const error = new Error('No active corporate plan found. Create/activate a corporate plan before adding employees or sending welcome emails.');
  error.statusCode = 412;
  throw error;
}

/**
 * Resolve an active corporate plan for employee onboarding.
 * Auto-creates a default plan when missing (same path as welcome-email bootstrap)
 * so bulk uploads for new corporates (e.g. Truvae) are not blocked with HTTP 412.
 */
async function ensureActiveCorporatePlanForEmployees({ corporateId, corporate, transaction = null }) {
  const existing = await getActiveCorporateSubscriptionPlan({ corporateId, transaction });
  if (existing) return { plan: existing, autoCreated: false };

  const companyName = corporate?.companyName || corporate?.name || `Corporate ${corporateId}`;
  const created = await createDefaultCorporatePlanForCorporate({
    corporateId,
    companyName,
    employeeCount: Number(corporate?.employeeCount) || 0,
    transaction,
  });
  if (!created?.id) {
    const error = new Error('No active corporate plan found. Create/activate a corporate plan before adding employees or sending welcome emails.');
    error.statusCode = 412;
    throw error;
  }

  console.log(`[Corporate Employees] Auto-created default plan ${created.id} (${created.slug}) for corporate ${corporateId}`);
  // Re-read so callers always get the SELECT-shaped row (id/name/slug/…).
  const plan = await getActiveCorporateSubscriptionPlan({ corporateId, transaction }) || created;
  return { plan, autoCreated: true };
}

async function ensureCorporatePlanForWelcome({ corporateId, corporate, transaction = null }) {
  const activePlan = await getActiveCorporateSubscriptionPlan({ corporateId, transaction });
  if (activePlan) return activePlan;

  const companyName = corporate?.companyName || corporate?.name || `Corporate ${corporateId}`;
  try {
    const created = await createDefaultCorporatePlanForCorporate({
      corporateId,
      companyName,
      employeeCount: 0,
      transaction,
    });
    if (created) {
      console.log(`[welcome-email] Auto-created default corporate plan for corporate ${corporateId}`);
      return created;
    }
  } catch (bootstrapError) {
    console.warn('[welcome-email] Default corporate plan bootstrap failed:', bootstrapError?.message || bootstrapError);
  }

  const error = new Error('No active corporate plan found. Create/activate a corporate plan before sending welcome emails.');
  error.statusCode = 412;
  throw error;
}

async function createDefaultCorporatePlanForCorporate({ corporateId, companyName, employeeCount = 0, transaction = null }) {
  const { start, end } = getDefaultCorporatePlanDates();
  const tsFragment = String(Date.now()).slice(-9);
  const planSlug = `corp-${corporateId}-${tsFragment}`;
  const defaultFeatures = [
    'OPD',
    'Mental Health',
    'Health Calendar',
    'Pharmacy Discount',
    'Webinars',
    'Lab Discount',
  ];
  const pricePerEmployee = 250;

  const insertResult = await postgresSequelize.query(
    `INSERT INTO subscription_plans (
       name, slug, type, price, annual_price, currency, billing_cycle,
       description, features, metadata,
       is_active, is_popular, requires_referral, allows_upgrade,
       created_at, updated_at
     )
     VALUES (
       :name, :slug, 'CORPORATE', :price, :annualPrice, 'INR', 'ANNUAL',
       :description, :features, :metadata,
       true, false, false, true,
       NOW(), NOW()
     )
     RETURNING id, name, slug, price, annual_price, currency, billing_cycle, metadata`,
    {
      replacements: {
        name: `${companyName} Corporate Basic Plus`,
        slug: planSlug,
        price: pricePerEmployee,
        annualPrice: pricePerEmployee * 12,
        description: `Default corporate plan for ${companyName}`,
        features: JSON.stringify(defaultFeatures),
        metadata: JSON.stringify({
          corporateId,
          planType: 'Standard',
          status: 'Active',
          validFrom: start,
          validTo: end,
          totalEmployees: Number(employeeCount) || 0,
          premiumPerEmployee: pricePerEmployee,
          totalPremium: (Number(employeeCount) || 0) * pricePerEmployee,
          benefits: defaultFeatures,
          createdBySystem: true,
          autoCreatedAt: new Date().toISOString(),
        }),
      },
      type: postgresSequelize.QueryTypes.INSERT,
      transaction,
    }
  );

  return firstReturningRow(insertResult);
}

async function assignUserToActiveCorporatePlan({ userId, corporateId, corporatePlan, transaction = null }) {
  const planId = Number(corporatePlan?.id);
  if (!userId || Number.isNaN(planId)) {
    throw new Error('Cannot assign corporate plan: invalid userId or planId');
  }

  await postgresSequelize.query(
    `UPDATE user_subscriptions us
        SET status = 'CANCELLED',
            updated_at = NOW()
      WHERE us.user_id = :userId
        AND us.status = 'ACTIVE'
        AND us.plan_id <> :planId
        AND EXISTS (
          SELECT 1
            FROM subscription_plans sp
           WHERE sp.id = us.plan_id
             AND sp.type = 'CORPORATE'
             AND (sp.metadata->>'corporateId')::int = :corporateId
        )`,
    {
      replacements: { userId, planId, corporateId },
      type: postgresSequelize.QueryTypes.UPDATE,
      transaction,
    }
  );

  const [existing] = await postgresSequelize.query(
    `SELECT id, status
       FROM user_subscriptions
      WHERE user_id = :userId
        AND plan_id = :planId
      ORDER BY id DESC
      LIMIT 1`,
    {
      replacements: { userId, planId },
      type: postgresSequelize.QueryTypes.SELECT,
      transaction,
    }
  );

  const metadata = parseJsonSafe(corporatePlan?.metadata, {});
  const cycle = String(corporatePlan?.billing_cycle || 'ANNUAL').toUpperCase();
  const price = Number(corporatePlan?.price || metadata.premiumPerEmployee || 0);
  const currency = String(corporatePlan?.currency || 'INR').toUpperCase();
  const planStartDate = metadata.validFrom || new Date().toISOString().slice(0, 10);
  const planEndDate = metadata.validTo || null;

  if (existing) {
    await postgresSequelize.query(
      `UPDATE user_subscriptions
          SET status = 'ACTIVE',
              start_date = COALESCE(start_date, :startDate::date),
              end_date = COALESCE(end_date, :endDate::date),
              billing_cycle = :billingCycle,
              price = :price,
              currency = :currency,
              updated_at = NOW()
        WHERE id = :id`,
      {
        replacements: {
          id: existing.id,
          startDate: planStartDate,
          endDate: planEndDate,
          billingCycle: cycle,
          price,
          currency,
        },
        type: postgresSequelize.QueryTypes.UPDATE,
        transaction,
      }
    );
    return;
  }

  await postgresSequelize.query(
    `INSERT INTO user_subscriptions (
       user_id, plan_id, status, start_date, end_date, auto_renew, billing_cycle, price, currency, created_at, updated_at
     )
     VALUES (
       :userId, :planId, 'ACTIVE', :startDate::date, :endDate::date, false, :billingCycle, :price, :currency, NOW(), NOW()
     )`,
    {
      replacements: {
        userId,
        planId,
        startDate: planStartDate,
        endDate: planEndDate,
        billingCycle: cycle,
        price,
        currency,
      },
      type: postgresSequelize.QueryTypes.INSERT,
      transaction,
    }
  );
}

/**
 * Add Corporate Employees
 * POST /api/admin/corporate-employees
 * Creates user accounts for corporate employees with patient role
 */
router.post('/corporate-employees', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporate = req.resolvedCorporate;
    const corporateId = corporate.id;
    const teamUserId = req.user?.id || req.user?.userId || null;
    const { employees, sendWelcomeEmail = true, welcomeEmailMode } = req.body;
    const sendWelcomeEmailDisabled = sendWelcomeEmail === false || sendWelcomeEmail === 'false' || sendWelcomeEmail === 0 || sendWelcomeEmail === '0';
    const normalizedWelcomeEmailMode = sendWelcomeEmailDisabled ? 'skip' : (welcomeEmailMode || 'send');
    const shouldSendWelcomeEmail = normalizedWelcomeEmailMode === 'send';
    const shouldPrepareWelcomeEmail = normalizedWelcomeEmailMode === 'draft' || normalizedWelcomeEmailMode === 'prepare';

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'employees array is required'
      });
    }

    // Auto-bootstrap a default plan when missing — hard 412 blocked new corporates
    // (Truvae and similar) from any bulk employee upload even though welcome-email
    // already had ensureCorporatePlanForWelcome().
    const { plan: activeCorporatePlan, autoCreated: planAutoCreated } =
      await ensureActiveCorporatePlanForEmployees({ corporateId, corporate });
    
    const results = { created: [], failed: [], qcLog: [], emailWarnings: [], planAutoCreated };

    // ─── Internal QC pass ────────────────────────────────────────────────────
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_RE = /^(?:\+91[-\s]?)?[6-9]\d{9}$|^\d{10}$/;
    const PIN_RE   = /^\d{6}$/;
    const DOB_RE   = /^\d{4}-\d{2}-\d{2}$/;
    const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
    const VALID_GENDERS = new Set(['male', 'female', 'other']);
    const seenEmails = new Map(); // email -> rowIndex
    const seenEmployeeIds = new Map(); // employeeId -> rowIndex
    const qcIssuesByRow = new Map(); // row -> fatal string[]

    employees.forEach((emp, idx) => {
      const row = idx + 2; // 1-indexed with header
      const rowIssues = [];
      const rowWarnings = [];

      if (!emp.firstName || String(emp.firstName).trim() === '') rowIssues.push('Missing First Name');
      if (emp.email && !EMAIL_RE.test(emp.email)) rowIssues.push(`Invalid email format: ${emp.email}`);
      if (emp.phoneNumber && !PHONE_RE.test(String(emp.phoneNumber).replace(/[\s\-]/g, ''))) {
        rowWarnings.push(`Phone should be 10 digits: ${emp.phoneNumber}`);
      }
      if (emp.gender && !VALID_GENDERS.has(String(emp.gender).toLowerCase())) {
        const normalizedGender = String(emp.gender).trim().toLowerCase();
        if (normalizedGender === 'm') {
          emp.gender = 'male';
        } else if (normalizedGender === 'f') {
          emp.gender = 'female';
        } else {
          rowWarnings.push(`Invalid gender (use Male/Female/Other): ${emp.gender}`);
          emp.gender = '';
        }
      }
      // Excel round-trip fix: a CSV template's date columns get reformatted
      // by Excel into a locale short-date (D/M/YYYY, M/D/YYYY, 2-digit
      // year) the instant a user opens and re-saves it — there's no date
      // serial preserved in CSV to recover the real value from, only that
      // display text. A bare YYYY-MM-DD regex rejects every such row
      // outright even though the date is real and valid. normalizeFlexibleDate
      // resolves it when only one of day-first/month-first is a valid
      // calendar date, and mutates emp.* in place so the resolved ISO value
      // is what actually gets stored below — but never silently guesses a
      // genuinely ambiguous date (e.g. "5/6/1998"): that still fails QC,
      // with a message explaining the ambiguity instead of just restating
      // the expected format.
      if (emp.dateOfBirth && !DOB_RE.test(emp.dateOfBirth)) {
        const resolved = normalizeFlexibleDate(emp.dateOfBirth);
        if (resolved && !resolved.ambiguous) {
          emp.dateOfBirth = resolved.iso;
        } else if (resolved?.ambiguous) {
          rowWarnings.push(`Date of Birth "${emp.dateOfBirth}" is ambiguous (could be ${resolved.iso} or a day/month-swapped date) — left blank; enter as YYYY-MM-DD to store it`);
          emp.dateOfBirth = '';
        } else {
          rowWarnings.push(`Date of Birth must be YYYY-MM-DD: ${emp.dateOfBirth}`);
          emp.dateOfBirth = '';
        }
      }
      if (emp.joiningDate && !DATE_RE.test(emp.joiningDate)) {
        const resolved = normalizeFlexibleDate(emp.joiningDate);
        if (resolved && !resolved.ambiguous) {
          emp.joiningDate = resolved.iso;
        } else if (resolved?.ambiguous) {
          rowWarnings.push(`Joining Date "${emp.joiningDate}" is ambiguous (could be ${resolved.iso} or a day/month-swapped date) — left blank; enter as YYYY-MM-DD to store it`);
          emp.joiningDate = '';
        } else {
          rowWarnings.push(`Joining Date must be YYYY-MM-DD: ${emp.joiningDate}`);
          emp.joiningDate = '';
        }
      }
      if (emp.pinCode && !PIN_RE.test(String(emp.pinCode))) {
        rowWarnings.push(`Pin Code must be 6 digits: ${emp.pinCode}`);
        emp.pinCode = '';
      }

      const lowerEmail = (emp.email || '').toLowerCase();
      if (lowerEmail && seenEmails.has(lowerEmail)) {
        rowIssues.push(`Duplicate email in CSV (also on row ${seenEmails.get(lowerEmail)}): ${lowerEmail}`);
      } else if (lowerEmail) {
        seenEmails.set(lowerEmail, row);
      }

      const normalizedEmployeeId = String(emp.employeeId || '').trim().toLowerCase();
      if (normalizedEmployeeId && seenEmployeeIds.has(normalizedEmployeeId)) {
        rowIssues.push(`Duplicate Employee ID in CSV (also on row ${seenEmployeeIds.get(normalizedEmployeeId)}): ${emp.employeeId}`);
      } else if (normalizedEmployeeId) {
        seenEmployeeIds.set(normalizedEmployeeId, row);
      }

      if (rowIssues.length > 0) {
        qcIssuesByRow.set(row, rowIssues);
      }
      if (rowIssues.length > 0 || rowWarnings.length > 0) {
        results.qcLog.push({
          row,
          employeeId: emp.employeeId || '',
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          email: emp.email || '',
          issues: [...rowIssues, ...rowWarnings]
        });
      }
    });
    // ─────────────────────────────────────────────────────────────────────────

    for (let idx = 0; idx < employees.length; idx++) {
      const emp = employees[idx];
      let tx = null;
      try {
        const row = idx + 2;
        const { firstName, lastName, email, phoneNumber, employeeId, department, designation, city, state, pinCode, location, facility, gender, dateOfBirth, joiningDate } = emp;

        if (qcIssuesByRow.has(row)) {
          const issues = qcIssuesByRow.get(row) || [];
          results.failed.push({
            email: email || '',
            name: `${firstName || ''} ${lastName || ''}`.trim(),
            employeeId: employeeId || '',
            reason: `QC failed: ${issues.join('; ')}`,
          });
          continue;
        }
        
        if (!firstName) {
          results.failed.push({ email: email || '', name: `Row data`, reason: 'First Name is required' });
          continue;
        }

        if (!email || !String(email).trim()) {
          results.failed.push({ email: '', name: `${firstName} ${lastName || ''}`.trim(), reason: 'Email is required' });
          continue;
        }
        
        const normalizedEmail = String(email).toLowerCase().trim();
        tx = await postgresSequelize.transaction();
        
        // Check if user exists
        const [existingUser] = await postgresSequelize.query(`
          SELECT id FROM users WHERE email = :email
        `, {
          replacements: { email: normalizedEmail },
          type: postgresSequelize.QueryTypes.SELECT,
          transaction: tx
        });
        
        let userId;
        let isNewUser = false;
        let temporaryPassword = null;
        
        if (existingUser) {
          // User exists — activate, link to corporate, and issue a fresh temporary password
          userId = existingUser.id;
          temporaryPassword = welcomeEmailService.generateSecurePassword();
          const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
          const corpAggregatorId = corporate.dataValues?.aggregator_id ?? corporate.aggregator_id ?? null;
          const corpAggregatorType = corporate.dataValues?.aggregator_type ?? corporate.aggregator_type ?? null;
          const corpTenantId = corporate.dataValues?.tenant_id ?? corporate.tenant_id ?? null;
          await postgresSequelize.query(
            `UPDATE users SET status = 'active', "isVerified" = true, "isCorporate" = true,
              password = :password,
              metadata = COALESCE(metadata, '{}'::jsonb) || '{"requirePasswordChange": true}'::jsonb,
              aggregator_id = COALESCE(aggregator_id, :aggregatorId),
              aggregator_type = COALESCE(aggregator_type, :aggregatorType),
              tenant_id = COALESCE(tenant_id, :tenantId),
              "updatedAt" = NOW()
             WHERE id = :userId`,
            {
              replacements: { userId, password: hashedPassword, aggregatorId: corpAggregatorId, aggregatorType: corpAggregatorType, tenantId: corpTenantId },
              type: postgresSequelize.QueryTypes.UPDATE,
              transaction: tx
            }
          );
        } else {
          // Generate a secure temporary password
          temporaryPassword = welcomeEmailService.generateSecurePassword();
          const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
          
          // Resolve corporate's aggregator and tenant for activation
          const corpAggregatorId = corporate.dataValues?.aggregator_id ?? corporate.aggregator_id ?? null;
          const corpAggregatorType = corporate.dataValues?.aggregator_type ?? corporate.aggregator_type ?? null;
          const corpTenantId = corporate.dataValues?.tenant_id ?? corporate.tenant_id ?? null;

          const uniqueId = await generateGuaranteedUniqueId('U', 'users');
          const userInsertResult = await postgresSequelize.query(`
            INSERT INTO users (
              email, password, "firstName", "lastName", role, status,
              "isCorporate", "isAdmin", "isTeam", "isVerified",
              "dateOfBirth", "phoneNumber", gender,
              address_city, address_state, "address_zipCode",
              department_name, employee_id,
              unique_id,
              aggregator_id, aggregator_type, tenant_id,
              "createdAt", "updatedAt"
            )
            VALUES (
              :email, :password, :firstName, :lastName, 'patient', 'active',
              true, false, false, true,
              :dob, :phoneNumber, :gender,
              :addressCity, :addressState, :addressZip,
              :deptName, :empId,
              :uniqueId,
              :aggregatorId, :aggregatorType, :tenantId,
              NOW(), NOW()
            )
            RETURNING id
          `, {
            replacements: {
              email: normalizedEmail,
              password: hashedPassword,
              firstName,
              lastName: lastName || '',
              phoneNumber: phoneNumber || '',
              dob: dateOfBirth || '1990-01-01',
              gender: gender ? (gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()) : 'Male',
              addressCity: city || null,
              addressState: state || null,
              addressZip: pinCode || null,
              deptName: department || null,
              empId: employeeId || null,
              uniqueId,
              aggregatorId: corpAggregatorId,
              aggregatorType: corpAggregatorType,
              tenantId: corpTenantId,
            },
            type: postgresSequelize.QueryTypes.INSERT,
            transaction: tx
          });
          
          userId = firstReturningRow(userInsertResult)?.id || null;
          isNewUser = true;

          // Mark new employee as requiring a password change on first login
          if (userId) {
            await postgresSequelize.query(
              `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"requirePasswordChange": true}'::jsonb WHERE id = :userId`,
              { replacements: { userId }, type: postgresSequelize.QueryTypes.UPDATE, transaction: tx }
            );
          }
        }
        
        if (!userId) {
          await tx.rollback();
          tx = null;
          results.failed.push({ email, reason: 'Failed to create/find user' });
          continue;
        }

        if (employeeId) {
          const normalizedEmployeeId = String(employeeId).trim();
          const [employeeIdOwner] = await postgresSequelize.query(
            `SELECT "userId"
               FROM corporate_employees
              WHERE corporate_id = :corporateId
                AND LOWER("employeeId") = LOWER(:employeeId)
              LIMIT 1`,
            {
              replacements: { corporateId, employeeId: normalizedEmployeeId },
              type: postgresSequelize.QueryTypes.SELECT,
              transaction: tx,
            }
          );

          if (employeeIdOwner && Number(employeeIdOwner.userId) !== Number(userId)) {
            await tx.rollback();
            tx = null;
            results.failed.push({
              email: normalizedEmail,
              name: `${firstName || ''} ${lastName || ''}`.trim(),
              employeeId: normalizedEmployeeId,
              reason: `Employee ID ${normalizedEmployeeId} is already mapped to another employee in this corporate`,
            });
            continue;
          }
        }
        
        // Create user association to corporate as employee (include corporate_unique_id for traceability)
        await postgresSequelize.query(`
          INSERT INTO user_associations ("userId", "entityType", "entityId", corporate_unique_id, role, "isPrimary", status, metadata, "startDate", "createdAt", "updatedAt")
          VALUES (:userId, 'corporate', :corporateId, :corpUniqueId, 'employee', false, 'active', :metadata, :startDate, NOW(), NOW())
          ON CONFLICT ("userId", "entityType", "entityId", role) WHERE "entityType" = 'corporate' DO UPDATE SET
            status = 'active',
            metadata = EXCLUDED.metadata,
            "startDate" = EXCLUDED."startDate",
            corporate_unique_id = EXCLUDED.corporate_unique_id,
            "updatedAt" = NOW()
        `, {
          replacements: { 
            userId, 
            corporateId,
            corpUniqueId: corporate.uniqueId || null,
            startDate: joiningDate || new Date().toISOString().slice(0, 10),
            metadata: JSON.stringify({ employeeId, department, designation, location, facility, joiningDate: joiningDate || null, city: city || null, state: state || null, pinCode: pinCode || null })
          },
          transaction: tx
        });

        // Sync employeeId and employee_id to corporate_employees and users tables
        if (employeeId) {
          await postgresSequelize.query(
            `UPDATE users SET employee_id = :employeeId, "updatedAt" = NOW() WHERE id = :userId AND (employee_id IS NULL OR employee_id = '')`,
            { replacements: { employeeId, userId }, type: postgresSequelize.QueryTypes.UPDATE, transaction: tx }
          );
          await postgresSequelize.query(
            `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", department, designation, "isActive", "createdAt", "updatedAt")
             VALUES (:corporateId, :userId, :employeeId, :department, :designation, true, NOW(), NOW())
             ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET
               "userId" = :userId, department = :department, designation = :designation, "isActive" = true, "updatedAt" = NOW()`,
            {
              replacements: { corporateId, userId, employeeId, department: department || 'General', designation: designation || '' },
              type: postgresSequelize.QueryTypes.INSERT,
              transaction: tx
            }
          );
        }

        await assignUserToActiveCorporatePlan({
          userId,
          corporateId,
          corporatePlan: activeCorporatePlan,
          transaction: tx,
        });

        await postgresSequelize.query(
          `UPDATE users SET status = 'active', "isCorporate" = true, "isVerified" = true, "updatedAt" = NOW()
           WHERE id = :userId`,
          { replacements: { userId }, type: postgresSequelize.QueryTypes.UPDATE, transaction: tx }
        );

        await tx.commit();
        tx = null;

        let emailStatus = "not_applicable";
        let emailError = null;
        let welcomeEmailDraft = null;
        let emailSent = false;
        const welcomeEmailData = {
          email: normalizedEmail,
          firstName,
          lastName: lastName || "",
          companyName: corporate.companyName,
          employeeId,
          department,
          planName: emp.planName || emp.insurancePlan || emp.plan || corporate.packageType || "Corporate Employee Health Plan",
          coverageAmount: emp.coverageAmount || emp.sumInsured || emp.sum_insured || emp.coverage,
          planStartDate: emp.planStartDate || emp.startDate || emp.coverageStartDate,
          planEndDate: emp.planEndDate || emp.endDate || emp.coverageEndDate,
          planValidity: emp.planValidity || emp.validity,
          planBenefits: emp.planBenefits || emp.benefits,
          sponsor: emp.sponsor || emp.employerContribution,
          copay: emp.copay || emp.employeeShare
        };

        if (temporaryPassword) {
          const welcomeMode = shouldSendWelcomeEmail ? 'send' : (shouldPrepareWelcomeEmail ? 'draft' : 'skip');
          let welcomeBlockedByQualityGate = false;

          if (welcomeMode === 'send') {
            const activeRecipientDelivery = await findActiveWelcomeDeliveryForRecipient({
              corporateId,
              recipientEmail: normalizedEmail,
            });

            if (activeRecipientDelivery) {
              emailStatus = 'skipped';
              emailError = 'Welcome email already queued or sent for this employee; skipped by quality check.';
              welcomeBlockedByQualityGate = true;
            } else if (isBrevoHistoryConfigured()) {
              try {
                const brevoMatch = await findPriorBrevoWelcomeEmail({
                  email: normalizedEmail,
                  days: Number(process.env.BREVO_WELCOME_HISTORY_DAYS || 90),
                });

                if (brevoMatch?.found) {
                  try {
                    await createExternalWelcomeDeliveryFromBrevo({
                      corporateId,
                      userId,
                      employeeId,
                      recipientEmail: normalizedEmail,
                      subject: brevoMatch.subject || 'Welcome',
                      actorUserId: teamUserId,
                      brevoMatch,
                    });
                  } catch (auditError) {
                    console.warn('[bulk-onboarding] Brevo history audit insert skipped:', auditError?.message || auditError);
                  }

                  emailStatus = 'skipped';
                  emailError = 'Welcome email already sent previously; skipped by quality check.';
                  welcomeBlockedByQualityGate = true;
                }
              } catch (historyError) {
                emailStatus = 'failed';
                emailError = 'Brevo history lookup failed; welcome email blocked to prevent duplicate send.';
                welcomeBlockedByQualityGate = true;
              }
            }
          }

          if (!welcomeBlockedByQualityGate) {
            const welcomeDispatchResult = await dispatchCorporateEmployeeWelcomeEmail({
              welcomeEmailMode: welcomeMode,
              welcomeEmailData,
              temporaryPassword,
              userId,
              teamUserId,
              corporateId,
            });
            emailStatus = welcomeDispatchResult.emailStatus;
            emailError = welcomeDispatchResult.emailError;
            welcomeEmailDraft = welcomeDispatchResult.welcomeEmailDraft;
            emailSent = welcomeDispatchResult.emailSent;
          }

          if (emailStatus === 'failed') {
            console.error(`Failed to send welcome email to employee ${normalizedEmail}:`, emailError || 'Unknown send failure');
          }
        }

        results.created.push({
          email: normalizedEmail,
          userId,
          isNewUser,
          welcomeEmailRequested: shouldSendWelcomeEmail || shouldPrepareWelcomeEmail,
          emailStatus,
          emailError,
          emailSent,
          welcomeEmailDraft
        });

        if (emailStatus === 'failed') {
          results.emailWarnings.push({
            email: normalizedEmail,
            name: `${firstName || ''} ${lastName || ''}`.trim(),
            employeeId: employeeId || '',
            reason: emailError || 'Failed to send welcome email'
          });
        }
      } catch (empError) {
        if (tx) {
          await tx.rollback().catch(() => {});
        }
        results.failed.push({ email: emp.email, reason: empError.message });
      }
    }

    const createdUserIds = Array.from(new Set(
      results.created
        .map((item) => parseInt(String(item.userId), 10))
        .filter((value) => !Number.isNaN(value))
    ));

    let verification = [];
    if (createdUserIds.length > 0) {
      verification = await postgresSequelize.query(
        `SELECT u.id AS "userId",
                u.unique_id AS "uniqueId",
                u.email,
                COALESCE(ce."employeeId", u.employee_id, ua.metadata->>'employeeId') AS "employeeId",
                ua."startDate" AS "startDate"
           FROM users u
           JOIN user_associations ua
             ON ua."userId" = u.id
            AND ua."entityType" = 'corporate'
            AND ua."entityId" = :corporateId
            AND ua.role = 'employee'
           LEFT JOIN LATERAL (
             SELECT "employeeId"
               FROM corporate_employees ce
              WHERE ce."userId" = u.id
                AND ce.corporate_id = :corporateId
              ORDER BY ce.id DESC
              LIMIT 1
           ) ce ON true
          WHERE u.id IN (:createdUserIds)
          ORDER BY u.id`,
        {
          replacements: { corporateId, createdUserIds },
          type: postgresSequelize.QueryTypes.SELECT,
        }
      );
    }

    const qcRejected = results.failed.filter((item) => String(item.reason || '').startsWith('QC failed:')).length;
    const dbInserted = results.created.filter((item) => item.isNewUser === true).length;
    const dbLinkedExisting = results.created.filter((item) => item.isNewUser === false).length;
    const welcomeEmailFailed = results.created.filter((item) => item.emailStatus === 'failed').length;
    
    console.log(`[Corporate Employees] Added ${results.created.length}, failed ${results.failed.length}, QC issues: ${results.qcLog.length}, email warnings: ${results.emailWarnings.length} — corporate ${corporateId}`);
    
    return res.status(201).json({
      success: true,
      message: `Added ${results.created.length} employees, ${results.failed.length} failed`,
      summary: {
        requested: employees.length,
        created: results.created.length,
        dbInserted,
        dbLinkedExisting,
        qcRejected,
        failed: results.failed.length,
        welcomeEmailFailed,
        emailWarnings: results.emailWarnings.length,
        planAutoCreated: !!planAutoCreated,
        planId: activeCorporatePlan?.id || null,
        planName: activeCorporatePlan?.name || null,
      },
      verification,
      results
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    console.error('Failed to add corporate employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add corporate employees',
      error: error.message
    });
  }
});

/**
 * Prepare or send a fresh corporate employee welcome email for an existing employee.
 * POST /api/admin/corporate-employee-welcome-emails/resend
 */
router.post('/corporate-employee-welcome-emails/resend', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporate = req.resolvedCorporate;
    const corporateId = corporate.id;
    const teamUserId = req.user?.id || req.user?.userId || null;
    const { employeeId, userId, welcomeEmailMode = 'draft' } = req.body || {};
    const normalizedWelcomeEmailMode = welcomeEmailMode === 'send' ? 'send' : 'draft';

    await ensureCorporatePlanForWelcome({ corporateId, corporate });

    if (!employeeId && !userId) {
      return res.status(400).json({ success: false, message: 'employeeId or userId is required' });
    }

    const replacements = { corporateId };
    const filters = [];

    if (userId) {
      const numericUserId = parseInt(String(userId), 10);
      if (Number.isNaN(numericUserId)) {
        return res.status(400).json({ success: false, message: 'Invalid userId' });
      }
      replacements.userId = numericUserId;
      filters.push('u.id = :userId');
    }

    if (employeeId) {
      replacements.employeeIdLower = String(employeeId).trim().toLowerCase();
      filters.push(`(LOWER(COALESCE(u.employee_id, '')) = :employeeIdLower OR LOWER(COALESCE(ua.metadata->>'employeeId', '')) = :employeeIdLower OR LOWER(COALESCE(ce."employeeId", '')) = :employeeIdLower)`);
    }

    const employeeQuery = [
      'SELECT u.id, u.email, u."firstName", u."lastName", u.employee_id, u.department_name, u.password, u.metadata AS user_metadata, u.status AS user_status, u."isVerified" AS user_is_verified,',
      '       ua.metadata, ce."employeeId" AS corporate_employee_id',
      'FROM users u',
      'JOIN user_associations ua ON u.id = ua."userId"',
      'LEFT JOIN corporate_employees ce ON ce."userId" = u.id AND ce.corporate_id = :corporateId',
      `WHERE ua."entityType" = 'corporate'`,
      '  AND ua."entityId" = :corporateId',
      "  AND ua.role = 'employee'",
      '  AND (' + filters.join(' OR ') + ')',
      'LIMIT 1'
    ].join('\n');

    const [employee] = await postgresSequelize.query(employeeQuery, {
      replacements,
      type: postgresSequelize.QueryTypes.SELECT
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found in this corporate' });
    }

    const temporaryPassword = welcomeEmailService.generateSecurePassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const welcomeEmailData = buildCorporateEmployeeWelcomeEmailData({ employee, corporate, fallbackEmployeeId: employeeId || '' });
    const resolvedEmployeeId = welcomeEmailData.employeeId;

    let emailStatus = 'draft';
    let welcomeEmailDraft = null;
    let passwordPersisted = false;
    let emailSent = false;

    if (normalizedWelcomeEmailMode === 'send') {
      const previewMessage = await welcomeEmailService.buildCorporateEmployeeWelcomeEmail(
        welcomeEmailData,
        temporaryPassword,
        { teamUserId }
      );
      await assertNoPriorWelcomeDelivery({
        corporateId,
        userId: employee.id,
        employeeId: resolvedEmployeeId,
        recipientEmail: welcomeEmailData.email,
        subject: previewMessage.subject,
        actorUserId: teamUserId,
      });
      const resendDeliveryRecord = await createWelcomeDeliveryRecord({
        corporateId,
        userId: employee.id,
        employeeId: resolvedEmployeeId,
        recipientEmail: welcomeEmailData.email,
        subject: previewMessage.subject,
        idempotencyKey: `resend-${crypto.createHash('sha256').update(`${corporateId}|${employee.id}|${welcomeEmailData.email}|${previewMessage.subject}`).digest('hex').slice(0, 24)}`,
        requestScope: 'resend_send',
        createdBy: teamUserId,
        metadata: { source: 'resend_send', serverRendered: true },
      });
      if (resendDeliveryRecord?.id) {
        await updateWelcomeDeliveryRecordStatus({
          deliveryId: resendDeliveryRecord.id,
          status: 'queued',
          incrementAttempts: true,
          metadata: { queuedAt: new Date().toISOString() },
        });
      }

      const updatePasswordQuery = [
        'UPDATE users',
        'SET password = :hashedPassword,',
        '    "isVerified" = true,',
        "    status = 'active',",
        `    metadata = COALESCE(metadata, '{}'::jsonb) || '{"requirePasswordChange": true}'::jsonb,`,
        '    "updatedAt" = NOW()',
        'WHERE id = :userId'
      ].join('\n');

      await postgresSequelize.query(updatePasswordQuery, {
        replacements: { userId: employee.id, hashedPassword },
        type: postgresSequelize.QueryTypes.UPDATE
      });
      passwordPersisted = true;

      try {
        const welcomeDispatchResult = await dispatchCorporateEmployeeWelcomeEmail({
          welcomeEmailMode: 'send',
          welcomeEmailData,
          temporaryPassword,
          userId: employee.id,
          teamUserId,
          corporateId,
          throwOnSendFailure: true,
        });
        emailStatus = welcomeDispatchResult.emailStatus;
        emailSent = welcomeDispatchResult.emailSent;
        if (resendDeliveryRecord?.id) {
          await updateWelcomeDeliveryRecordStatus({
            deliveryId: resendDeliveryRecord.id,
            status: 'sent',
            metadata: { sentAt: new Date().toISOString() },
          });
        }
      } catch (sendErr) {
        // Compensating rollback so failed sends do not silently invalidate credentials.
        await postgresSequelize.query(
          `UPDATE users
             SET password = :oldPassword,
                 metadata = :oldMetadata::jsonb,
                 status = :oldStatus,
                 "isVerified" = :oldIsVerified,
                 "updatedAt" = NOW()
           WHERE id = :userId`,
          {
            replacements: {
              userId: employee.id,
              oldPassword: employee.password,
              oldMetadata: JSON.stringify(employee.user_metadata || {}),
              oldStatus: employee.user_status || 'active',
              oldIsVerified: Boolean(employee.user_is_verified)
            },
            type: postgresSequelize.QueryTypes.UPDATE
          }
        );
        passwordPersisted = false;
        if (resendDeliveryRecord?.id) {
          await updateWelcomeDeliveryRecordStatus({
            deliveryId: resendDeliveryRecord.id,
            status: 'rolled_back',
            errorMessage: sendErr?.message || String(sendErr),
            metadata: { rolledBackAt: new Date().toISOString() },
          });
        }
        throw sendErr;
      }
    } else {
      // Draft mode never sends anything or persists a password — it's a pure
      // preview, so it must not be blocked by assertNoPriorWelcomeDelivery.
      // That guard exists to stop duplicate REAL sends (see the 'send' branch
      // above); applying it here too meant any employee with even one past
      // real send (e.g. via the qc_sweep reminder cron) could never get a
      // "Prepare" preview again — the template area just came back empty.
      const preparedDraft = await createPreparedWelcomeDraft({
        corporateId,
        corporate,
        employee,
        temporaryPassword,
        actorUserId: teamUserId,
        teamUserId,
      });
      emailStatus = 'draft';
      welcomeEmailDraft = {
        ...preparedDraft.draft,
        draftToken: preparedDraft.draftToken,
        draftExpiresAt: preparedDraft.draftExpiresAt,
        deliveryId: preparedDraft.deliveryId,
      };
    }

    return res.json({
      success: true,
      message: normalizedWelcomeEmailMode === 'send' ? 'Welcome email sent again.' : 'Welcome email draft prepared.',
      result: {
        email: employee.email,
        userId: employee.id,
        isNewUser: false,
        passwordPersisted,
        welcomeEmailRequested: true,
        emailStatus,
        emailSent,
        welcomeEmailDraft,
        name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email
      }
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Failed to resend corporate employee welcome email:', error);
    return res.status(500).json({ success: false, message: 'Failed to resend welcome email', error: error.message });
  }
});

/**
 * Background worker for the bulk reminder route below. Resets each employee's
 * password and sends the reminder email, logging every step to the existing
 * welcome-delivery audit table. Deliberately bypasses assertNoPriorWelcomeDelivery
 * (via supersedeActiveWelcomeDeliveriesForRecipient) since this IS a deliberate
 * re-send, unlike the duplicate-prevention guard on /resend.
 */
export async function runCorporateEmployeeReminderBulkSend({ corporateId, corporate, employees, teamUserId }) {
  const dayBucket = new Date().toISOString().slice(0, 10);

  for (const employee of employees) {
    let deliveryRecord = null;
    try {
      const quota = await checkQuota('bulk');
      if (!quota.allowed || quota.remaining <= 0) {
        console.warn(`[reminder-bulk] Daily bulk email quota reached — stopping at corporate ${corporateId}, remaining employees skipped.`);
        break;
      }

      const welcomeEmailData = buildCorporateEmployeeWelcomeEmailData({ employee, corporate, fallbackEmployeeId: employee.corporate_employee_id || '' });
      if (!welcomeEmailData.email) {
        console.warn(`[reminder-bulk] Skipping employee ${employee.id} — no email address on file`);
        continue;
      }

      const temporaryPassword = welcomeEmailService.generateSecurePassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      const message = await welcomeEmailService.buildCorporateEmployeeReminderEmail(
        welcomeEmailData,
        temporaryPassword,
        { teamUserId, corporateId }
      );

      const mismatchedEmails = findMismatchedCredentialEmails({
        recipientEmail: welcomeEmailData.email,
        subject: message.subject,
        html: message.html,
      });
      if (mismatchedEmails.length > 0) {
        console.error(`[reminder-bulk] Skipping employee ${employee.id} — template leaked another recipient's email: ${mismatchedEmails.join(', ')}`);
        continue;
      }

      await supersedeActiveWelcomeDeliveriesForRecipient({
        corporateId,
        recipientEmail: welcomeEmailData.email,
        actorUserId: teamUserId,
        reason: 'Superseded by bulk reminder send',
      });

      const idempotencyKey = `reminder-${crypto.createHash('sha256').update(`${corporateId}|${employee.id}|${welcomeEmailData.email}|${dayBucket}`).digest('hex').slice(0, 24)}`;
      deliveryRecord = await createWelcomeDeliveryRecord({
        corporateId,
        userId: employee.id,
        employeeId: welcomeEmailData.employeeId,
        recipientEmail: welcomeEmailData.email,
        subject: message.subject,
        idempotencyKey,
        requestScope: 'reminder_send',
        createdBy: teamUserId,
        metadata: { source: 'bulk_reminder_send' },
      });
      await updateWelcomeDeliveryRecordStatus({
        deliveryId: deliveryRecord.id,
        status: 'queued',
        incrementAttempts: true,
        metadata: { queuedAt: new Date().toISOString() },
      });

      await postgresSequelize.query(
        `UPDATE users
           SET password = :hashedPassword,
               "isVerified" = true,
               status = 'active',
               metadata = COALESCE(metadata, '{}'::jsonb) || '{"requirePasswordChange": true}'::jsonb,
               "updatedAt" = NOW()
         WHERE id = :userId`,
        { replacements: { userId: employee.id, hashedPassword }, type: postgresSequelize.QueryTypes.UPDATE }
      );

      try {
        await welcomeEmailService.sendPreparedCorporateEmployeeWelcomeEmail(
          { to: message.to, subject: message.subject, html: message.html },
          { teamUserId }
        );
        await recordSent('bulk', 1);
        await updateWelcomeDeliveryRecordStatus({
          deliveryId: deliveryRecord.id,
          status: 'sent',
          metadata: { sentAt: new Date().toISOString() },
        });
      } catch (sendErr) {
        // Compensating rollback so a failed send does not silently invalidate credentials.
        await postgresSequelize.query(
          `UPDATE users
             SET password = :oldPassword,
                 metadata = :oldMetadata::jsonb,
                 status = :oldStatus,
                 "isVerified" = :oldIsVerified,
                 "updatedAt" = NOW()
           WHERE id = :userId`,
          {
            replacements: {
              userId: employee.id,
              oldPassword: employee.password,
              oldMetadata: JSON.stringify(employee.user_metadata || {}),
              oldStatus: employee.user_status || 'active',
              oldIsVerified: Boolean(employee.user_is_verified),
            },
            type: postgresSequelize.QueryTypes.UPDATE,
          }
        );
        await updateWelcomeDeliveryRecordStatus({
          deliveryId: deliveryRecord.id,
          status: 'rolled_back',
          errorMessage: sendErr?.message || String(sendErr),
          metadata: { rolledBackAt: new Date().toISOString() },
        });
        console.error(`[reminder-bulk] Send failed for employee ${employee.id} (${welcomeEmailData.email}):`, sendErr?.message || sendErr);
      }
    } catch (err) {
      console.error(`[reminder-bulk] Unexpected error for employee ${employee?.id}:`, err?.message || err);
    }

    // Small delay between sends to stay friendly to the mail provider's rate limits.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`[reminder-bulk] Finished reminder batch for corporate ${corporateId} (${employees.length} employees processed)`);
}

/**
 * POST /api/admin/corporate-employee-welcome-emails/send-reminder-bulk
 * Sends a "reminder" email (distinct copy from the welcome email, same
 * personalization placeholders) with a freshly generated temporary password
 * to every employee of the given corporate — including employees who already
 * received and acted on the original welcome email. Runs as a background
 * job; progress is visible in the Welcome Delivery Audit table
 * (request_scope = 'reminder_send').
 */
router.post('/corporate-employee-welcome-emails/send-reminder-bulk', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporate = req.resolvedCorporate;
    const corporateId = corporate.id;
    const teamUserId = req.user?.id || req.user?.userId || null;

    await ensureCorporatePlanForWelcome({ corporateId, corporate });

    const employees = await postgresSequelize.query(
      [
        'SELECT u.id, u.email, u."firstName", u."lastName", u.employee_id, u.department_name, u.password,',
        '       u.metadata AS user_metadata, u.status AS user_status, u."isVerified" AS user_is_verified,',
        '       ua.metadata, ce."employeeId" AS corporate_employee_id',
        'FROM users u',
        'JOIN user_associations ua ON u.id = ua."userId"',
        'LEFT JOIN corporate_employees ce ON ce."userId" = u.id AND ce.corporate_id = :corporateId',
        `WHERE ua."entityType" = 'corporate'`,
        '  AND ua."entityId" = :corporateId',
        "  AND ua.role = 'employee'",
      ].join('\n'),
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );

    if (employees.length === 0) {
      return res.status(404).json({ success: false, message: 'No employees found for this corporate' });
    }

    // Fire-and-forget: a sequential per-employee send for a large corporate can
    // exceed the HTTP/proxy timeout. Progress is tracked in the audit table
    // instead of the response.
    runCorporateEmployeeReminderBulkSend({ corporateId, corporate, employees, teamUserId }).catch((err) => {
      console.error('[reminder-bulk] Background job crashed:', err?.message || err);
    });

    return res.json({
      success: true,
      message: `Reminder emails queued for ${employees.length} employee(s). Track progress in the Welcome Delivery Audit table.`,
      totalQueued: employees.length,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Failed to queue corporate employee reminder emails:', error);
    return res.status(500).json({ success: false, message: 'Failed to queue reminder emails', error: error.message });
  }
});

/**
 * Bulk-prepare welcome email drafts for multiple employees in one request.
 * POST /api/admin/corporate-employee-welcome-emails/prepare-bulk
 * Body: { userIds: number[], corporateId }
 * Returns: { drafts: [{ userId, email, employeeId, draftToken, draftExpiresAt, subject, html }] }
 * Max 500 userIds per call. Temporary passwords are encrypted server-side and finalised by the /send endpoint.
 */
router.post('/corporate-employee-welcome-emails/prepare-bulk', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporate = req.resolvedCorporate;
    const corporateId = corporate.id;
    const teamUserId = req.user?.id || req.user?.userId || null;
    const { userIds } = req.body || {};

    await ensureCorporatePlanForWelcome({ corporateId, corporate });

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'userIds array is required' });
    }
    if (userIds.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 userIds per request' });
    }

    const numericIds = userIds.map(id => parseInt(String(id), 10)).filter(id => !Number.isNaN(id));
    if (numericIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid userIds provided' });
    }

    const employees = await postgresSequelize.query(CORPORATE_WELCOME_PREPARE_BULK_SQL, {
      replacements: { corporateId, numericIds },
      type: postgresSequelize.QueryTypes.SELECT,
    });

    const uniqueEmployees = employees;
    const drafts = [];
    const failed = [];
    const skipped = [];
    const employeesById = new Map(uniqueEmployees.map((employee) => [Number(employee.id), employee]));

    for (const requestedId of numericIds) {
      if (!employeesById.has(Number(requestedId))) {
        failed.push({
          userId: requestedId,
          email: null,
          reason: 'Employee not linked to this corporate or missing email',
        });
      }
    }

    for (const employee of uniqueEmployees) {
      try {
        const assocMeta = parseMetadata(employee.assoc_metadata);

        const temporaryPassword = welcomeEmailService.generateSecurePassword();
        const resolvedEmployeeId = employee.corporate_employee_id || employee.employee_id || assocMeta.employeeId || '';
        // Draft generation is a pure preview — it never sends anything or
        // persists a password — so a prior real delivery must not block it.
        // The duplicate-send guard still applies at actual send time; here we
        // just surface the prior delivery as metadata for the admin's awareness.
        const activeRecipientDelivery = await findActiveWelcomeDeliveryForRecipient({
          corporateId,
          userId: employee.id,
          recipientEmail: employee.email,
        });

        const preparedDraft = await createPreparedWelcomeDraft({
          corporateId,
          corporate,
          employee,
          temporaryPassword,
          actorUserId: teamUserId,
          teamUserId,
        });

        drafts.push({
          userId: employee.id,
          email: normalizeEmailAddress(employee.email),
          employeeId: resolvedEmployeeId,
          draftToken: preparedDraft.draftToken,
          draftExpiresAt: preparedDraft.draftExpiresAt,
          deliveryId: preparedDraft.deliveryId,
          subject: preparedDraft.draft.subject,
          html: preparedDraft.draft.html,
          alreadySent: Boolean(activeRecipientDelivery),
          existingDeliveryStatus: activeRecipientDelivery?.status || null,
        });
      } catch (err) {
        failed.push({ userId: employee.id, email: employee.email, reason: err.message });
      }
    }

    return res.json({
      success: true,
      message: drafts.length + ' draft(s) prepared' + (skipped.length > 0 ? ', ' + skipped.length + ' already sent skipped' : '') + (failed.length > 0 ? ', ' + failed.length + ' failed' : '') + '.',
      drafts,
      skipped,
      failed,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Failed to bulk-prepare welcome email drafts:', error);
    return res.status(500).json({ success: false, message: 'Failed to prepare drafts', error: error.message });
  }
});

/**
 * GET /api/admin/email-quota — current Brevo daily quota usage
 */
router.get('/email-quota', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const status = await getQuotaStatus();
    res.json({ success: true, quota: status, resetAt: 'midnight UTC' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Send prepared corporate employee welcome emails
 * POST /api/admin/corporate-employee-welcome-emails/send
 */
router.post("/corporate-employee-welcome-emails/send", authUser, requireRole(["admin", "team", "corporate_admin"]), requireCorporateAccess, async (req, res) => {
  try {
    const corporate = req.resolvedCorporate;
    const corporateId = corporate.id;
    const actorUserId = req.user?.id || req.user?.userId || null;
    const teamUserId = actorUserId;
    const headerIdempotencyKey = String(req.headers['x-idempotency-key'] || '').trim();
    const { emails, provider } = req.body || {};

    await ensureCorporatePlanForWelcome({ corporateId, corporate });

    const resolvedProvider = ['ses', 'brevo'].includes(String(provider || '').toLowerCase())
      ? String(provider).toLowerCase()
      : 'auto';

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, message: "emails array is required" });
    }

    if (emails.length > 500) {
      return res.status(400).json({ success: false, message: "A maximum of 500 emails can be sent in one batch" });
    }

    const results = { sent: [], failed: [], skipped: [] };
    const seenBatchKeys = new Set();

    for (const item of emails) {
      const requestedTo = normalizeEmailAddress(item?.to);
      const requestedUserId = item?.userId ? parseInt(String(item.userId), 10) : null;
      const requestedEmployeeId = String(item?.employeeId || '').trim();
      const draftToken = String(item?.draftToken || '').trim();
      const forceResendRequested = Boolean(item?.forceResend);
      let deliveryRecord = null;
      let canonicalEmail = requestedTo || null;
      let userId = requestedUserId;
      let employeeId = requestedEmployeeId;
      let computedIdempotencyKey = String(item?.idempotencyKey || req.body?.idempotencyKey || headerIdempotencyKey || '').trim();

      try {
        if (forceResendRequested) {
          const error = new Error('forceResend is disabled for welcome-email credential sends; duplicate/history checks are mandatory');
          error.statusCode = 400;
          throw error;
        }

        let preparedDraft = null;
        let temporaryPassword = null;
        let employee = null;

        if (draftToken) {
          preparedDraft = await loadPreparedWelcomeDraft({ corporateId, draftToken });
          if (!preparedDraft) {
            const error = new Error('Draft token is invalid, expired, already used, or not scoped to this corporate');
            error.statusCode = 400;
            throw error;
          }

          userId = Number(preparedDraft.user_id);
          employeeId = preparedDraft.employee_id || requestedEmployeeId || '';
          canonicalEmail = normalizeEmailAddress(preparedDraft.recipient_email);
          temporaryPassword = preparedDraft.temporaryPassword;
          employee = await loadCorporateEmployeeForWelcome({ corporateId, userId, employeeId });

          const reloadedEmail = normalizeEmailAddress(employee.email);
          if (reloadedEmail !== canonicalEmail || normalizeEmailAddress(preparedDraft.metadata?.canonicalEmail) !== reloadedEmail) {
            const error = new Error('Draft token recipient no longer matches the employee canonical email');
            error.statusCode = 400;
            throw error;
          }

          if (requestedTo && requestedTo !== reloadedEmail) {
            const error = new Error('Requested recipient does not match the employee canonical email');
            error.statusCode = 400;
            throw error;
          }

          deliveryRecord = preparedDraft;
        } else {
          employee = await loadCorporateEmployeeForWelcome({
            corporateId,
            userId: requestedUserId,
            employeeId: requestedEmployeeId,
          });
          const welcomeEmailDataForIdentity = buildCorporateEmployeeWelcomeEmailData({ employee, corporate, fallbackEmployeeId: requestedEmployeeId });
          canonicalEmail = welcomeEmailDataForIdentity.email;
          userId = Number(employee.id);
          employeeId = welcomeEmailDataForIdentity.employeeId;
          temporaryPassword = welcomeEmailService.generateSecurePassword();

          if (requestedTo && requestedTo !== canonicalEmail) {
            const error = new Error('Requested recipient does not match the employee canonical email');
            error.statusCode = 400;
            throw error;
          }
        }

        const welcomeEmailData = buildCorporateEmployeeWelcomeEmailData({ employee, corporate, fallbackEmployeeId: employeeId });
        canonicalEmail = welcomeEmailData.email;
        employeeId = welcomeEmailData.employeeId;
        const message = await welcomeEmailService.buildCorporateEmployeeWelcomeEmail(
          welcomeEmailData,
          temporaryPassword,
          { teamUserId }
        );

        const mismatchedEmails = findMismatchedCredentialEmails({
          recipientEmail: canonicalEmail,
          subject: message.subject,
          html: message.html,
        });
        if (mismatchedEmails.length > 0) {
          const error = new Error('Email template content contains credential email for another employee: ' + mismatchedEmails.join(', '));
          error.statusCode = 400;
          throw error;
        }

        const dedupeKey = `${userId}|${canonicalEmail}|${message.subject}`;
        if (seenBatchKeys.has(dedupeKey)) {
          results.failed.push({
            to: canonicalEmail,
            userId,
            employeeId: employeeId || null,
            reason: 'Duplicate recipient payload in batch request',
          });
          continue;
        }
        seenBatchKeys.add(dedupeKey);

        await assertNoPriorWelcomeDelivery({
          corporateId,
          userId,
          employeeId,
          recipientEmail: canonicalEmail,
          subject: message.subject,
          actorUserId,
        });

        const latestBulkQuota = await checkQuota('bulk');
        if (!latestBulkQuota.allowed || latestBulkQuota.remaining <= 0) {
          results.skipped.push({
            to: canonicalEmail,
            userId,
            employeeId: employeeId || null,
            reason: `Daily bulk email quota reached (${latestBulkQuota.limit}/day via Brevo). Resets at midnight UTC.`,
            quota: latestBulkQuota,
          });
          continue;
        }

        if (!deliveryRecord?.id) {
          computedIdempotencyKey = computedIdempotencyKey || `auto-${crypto.createHash('sha256').update(`${corporateId}|${userId}|${canonicalEmail}|${message.subject}`).digest('hex').slice(0, 24)}`;
          const existingDelivery = await findWelcomeDeliveryByIdempotency({
            corporateId,
            userId,
            recipientEmail: canonicalEmail,
            idempotencyKey: computedIdempotencyKey,
          });

          if (existingDelivery && (existingDelivery.status === 'queued' || existingDelivery.status === 'sent')) {
            results.skipped.push({
              to: canonicalEmail,
              userId,
              employeeId: employeeId || null,
              reason: 'Welcome email already queued or sent for this exact request',
              duplicate: true,
              idempotentReplay: true,
              deliveryId: existingDelivery.id,
              existingStatus: existingDelivery.status,
            });
            continue;
          }

          deliveryRecord = await createWelcomeDeliveryRecord({
            corporateId,
            userId,
            employeeId,
            recipientEmail: canonicalEmail,
            subject: message.subject,
            idempotencyKey: computedIdempotencyKey,
            requestScope: 'batch_send',
            createdBy: actorUserId,
            metadata: { source: 'server_rendered_send', draftTokenUsed: false },
          });
        } else {
          computedIdempotencyKey = String(deliveryRecord.metadata?.draftTokenHash || '').slice(0, 120) || `draft-${deliveryRecord.id}`;
        }

        await updateWelcomeDeliveryRecordStatus({
          deliveryId: deliveryRecord.id,
          status: 'queued',
          incrementAttempts: true,
          metadata: {
            queuedAt: new Date().toISOString(),
            source: draftToken ? 'draft_token_send' : 'server_rendered_send',
            draftTokenUsed: Boolean(draftToken),
          },
        });

        const [previousUserState] = await postgresSequelize.query(
          `SELECT password, metadata, status, "isVerified"
             FROM users
            WHERE id = :userId
            LIMIT 1`,
          {
            replacements: { userId },
            type: postgresSequelize.QueryTypes.SELECT,
          }
        );

        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        await postgresSequelize.query(
          `UPDATE users
              SET password = :hashedPassword,
                  "isVerified" = true,
                  status = 'active',
                  metadata = COALESCE(metadata, '{}'::jsonb) || '{"requirePasswordChange": true}'::jsonb,
                  "updatedAt" = NOW()
            WHERE id = :userId`,
          {
            replacements: { userId, hashedPassword },
            type: postgresSequelize.QueryTypes.UPDATE,
          }
        );

        if (results.sent.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }

        try {
          await welcomeEmailService.sendPreparedCorporateEmployeeWelcomeEmail(
            { to: canonicalEmail, subject: message.subject, html: message.html },
            { provider: resolvedProvider }
          );
          await updateWelcomeDeliveryRecordStatus({
            deliveryId: deliveryRecord.id,
            status: 'sent',
            metadata: {
              sentAt: new Date().toISOString(),
              draftConsumedAt: draftToken ? new Date().toISOString() : undefined,
            },
          });
        } catch (mailError) {
          let rolledBack = false;
          let rollbackErrorMessage = null;
          if (previousUserState) {
            try {
              await postgresSequelize.query(
                `UPDATE users
                    SET password = :oldPassword,
                        metadata = :oldMetadata::jsonb,
                        status = :oldStatus,
                        "isVerified" = :oldIsVerified,
                        "updatedAt" = NOW()
                  WHERE id = :userId`,
                {
                  replacements: {
                    userId,
                    oldPassword: previousUserState.password,
                    oldMetadata: JSON.stringify(previousUserState.metadata || {}),
                    oldStatus: previousUserState.status || 'active',
                    oldIsVerified: Boolean(previousUserState.isVerified),
                  },
                  type: postgresSequelize.QueryTypes.UPDATE,
                }
              );
              rolledBack = true;
            } catch (rollbackErr) {
              rollbackErrorMessage = rollbackErr?.message || 'Rollback failed';
            }
          }

          await updateWelcomeDeliveryRecordStatus({
            deliveryId: deliveryRecord.id,
            status: rolledBack ? 'rolled_back' : 'failed',
            errorMessage: rollbackErrorMessage
              ? `${mailError?.message || mailError} | ${rollbackErrorMessage}`
              : (mailError?.message || String(mailError)),
            metadata: rolledBack ? { rolledBackAt: new Date().toISOString() } : null,
          });
          throw mailError;
        }

        results.sent.push({
          to: canonicalEmail,
          userId,
          employeeId: employeeId || null,
          idempotencyKey: computedIdempotencyKey,
          deliveryId: deliveryRecord?.id || null,
        });
        await recordSent('bulk', 1);
      } catch (sendError) {
        const dbCode = sendError?.parent?.code || sendError?.original?.code || sendError?.code;
        const isActiveRecipientConflict = dbCode === '23505' && String(sendError?.parent?.constraint || sendError?.original?.constraint || sendError?.constraint || '').includes('uq_corp_welcome_active_recipient');

        if (isActiveRecipientConflict) {
          if (deliveryRecord?.id) {
            await updateWelcomeDeliveryRecordStatus({
              deliveryId: deliveryRecord.id,
              status: 'failed',
              errorMessage: 'Duplicate active welcome delivery blocked by database guard',
            });
          }

          const activeDelivery = canonicalEmail ? await findActiveWelcomeDeliveryForRecipient({
            corporateId,
            recipientEmail: canonicalEmail,
          }) : null;

          results.skipped.push({
            to: canonicalEmail,
            userId,
            employeeId: employeeId || null,
            reason: 'Welcome email already queued or sent for this recipient',
            duplicate: true,
            deliveryId: activeDelivery?.id || null,
            existingStatus: activeDelivery?.status || null,
          });
          continue;
        }

        if (sendError?.statusCode === 409) {
          results.skipped.push({
            to: canonicalEmail,
            userId,
            employeeId: employeeId || null,
            reason: sendError.message,
            duplicate: true,
            deliveryId: sendError.delivery?.id || null,
            existingStatus: sendError.delivery?.status || null,
          });
          continue;
        }

        results.failed.push({
          to: canonicalEmail || requestedTo || null,
          userId: userId || requestedUserId || null,
          employeeId: employeeId || requestedEmployeeId || null,
          reason: sendError.message,
          deliveryId: deliveryRecord?.id || null,
        });
      }
    }

    return res.json({
      success: results.failed.length === 0,
      message: `Sent ${results.sent.length} emails, ${results.failed.length} failed, ${results.skipped.length} skipped`,
      results
    });
  } catch (error) {
    console.error("Failed to send prepared corporate employee welcome emails:", error);
    return res.status(500).json({ success: false, message: "Failed to send welcome emails", error: error.message });
  }
});

/**
 * Get corporate employee welcome email delivery history
 * GET /api/admin/corporate-employee-welcome-emails/deliveries
 */
router.get('/corporate-employee-welcome-emails/deliveries', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporate = req.resolvedCorporate;
    const corporateId = corporate.id;
    const {
      status,
      employeeId,
      userId,
      recipient,
      from,
      to,
      requestScope,
      limit: qLimit = 50,
      offset: qOffset = 0,
    } = req.query || {};

    const parsedLimit = Math.min(Math.max(parseInt(String(qLimit), 10) || 50, 1), 200);
    const parsedOffset = Math.max(parseInt(String(qOffset), 10) || 0, 0);
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedEmployeeId = String(employeeId || '').trim().toLowerCase();
    const normalizedRecipient = String(recipient || '').trim().toLowerCase();
    const normalizedRequestScope = String(requestScope || '').trim().toLowerCase();
    const parsedUserId = userId ? parseInt(String(userId), 10) : null;

    if (userId && Number.isNaN(parsedUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId filter' });
    }

    const parsedFrom = from ? new Date(String(from)) : null;
    const parsedTo = to ? new Date(String(to)) : null;

    if (from && Number.isNaN(parsedFrom?.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid from date filter' });
    }
    if (to && Number.isNaN(parsedTo?.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid to date filter' });
    }

    await ensureWelcomeDeliveryAuditTable();

    const whereClauses = ['d.corporate_id = :corporateId'];
    const replacements = {
      corporateId,
      limit: parsedLimit,
      offset: parsedOffset,
    };

    if (normalizedStatus) {
      whereClauses.push('LOWER(d.status) = :status');
      replacements.status = normalizedStatus;
    }

    if (normalizedEmployeeId) {
      whereClauses.push("LOWER(COALESCE(d.employee_id, '')) = :employeeId");
      replacements.employeeId = normalizedEmployeeId;
    }

    if (parsedUserId) {
      whereClauses.push('d.user_id = :userId');
      replacements.userId = parsedUserId;
    }

    if (normalizedRecipient) {
      whereClauses.push('LOWER(d.recipient_email) LIKE :recipient');
      replacements.recipient = `%${normalizedRecipient}%`;
    }

    if (normalizedRequestScope) {
      whereClauses.push('LOWER(d.request_scope) = :requestScope');
      replacements.requestScope = normalizedRequestScope;
    }

    if (parsedFrom) {
      whereClauses.push('d.created_at >= :fromDate');
      replacements.fromDate = parsedFrom.toISOString();
    }

    if (parsedTo) {
      whereClauses.push('d.created_at <= :toDate');
      replacements.toDate = parsedTo.toISOString();
    }

    const whereSql = whereClauses.join(' AND ');

    const rows = await postgresSequelize.query(
      `SELECT d.id,
              d.corporate_id AS "corporateId",
              d.user_id AS "userId",
              d.employee_id AS "employeeId",
              d.recipient_email AS "recipientEmail",
              d.subject,
              d.idempotency_key AS "idempotencyKey",
              d.request_scope AS "requestScope",
              d.status,
              d.attempts,
              d.error_message AS "errorMessage",
              d.metadata,
              d.created_by AS "createdBy",
              d.created_at AS "createdAt",
              d.updated_at AS "updatedAt",
              u.email AS "userEmail",
              u."firstName" AS "userFirstName",
              u."lastName" AS "userLastName"
         FROM corporate_welcome_email_deliveries d
         LEFT JOIN users u ON u.id = d.user_id
        WHERE ${whereSql}
        ORDER BY d.created_at DESC
        LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    const [totals] = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE d.status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE d.status = 'queued')::int AS queued,
              COUNT(*) FILTER (WHERE d.status = 'failed')::int AS failed,
              COUNT(*) FILTER (WHERE d.status = 'rolled_back')::int AS rolledBack,
              COUNT(*) FILTER (WHERE d.status = 'prepared')::int AS prepared
         FROM corporate_welcome_email_deliveries d
        WHERE ${whereSql}`,
      {
        replacements,
        type: postgresSequelize.QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,
      filters: {
        status: normalizedStatus || null,
        employeeId: normalizedEmployeeId || null,
        userId: parsedUserId || null,
        recipient: normalizedRecipient || null,
        requestScope: normalizedRequestScope || null,
        from: parsedFrom ? parsedFrom.toISOString() : null,
        to: parsedTo ? parsedTo.toISOString() : null,
        limit: parsedLimit,
        offset: parsedOffset,
      },
      summary: {
        total: totals?.total || 0,
        sent: totals?.sent || 0,
        queued: totals?.queued || 0,
        failed: totals?.failed || 0,
        rolledBack: totals?.rolledBack || 0,
        prepared: totals?.prepared || 0,
      },
      deliveries: rows,
    });
  } catch (error) {
    console.error('Failed to get corporate welcome email delivery history:', error);
    return res.status(500).json({ success: false, message: 'Failed to get welcome email delivery history', error: error.message });
  }
});

/**
 * Get Corporate Employees
 * GET /api/admin/corporate-employees/:corporateId/activation-stats
 * Returns login & onboarding funnel stats for the team/HR portal dashboard.
 */
router.get('/corporate-employees/:corporateId/activation-stats', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporateId = req.resolvedCorporate.id;

    // Build the same merged roster+association employee list the employee table itself
    // uses (GET /corporate-employees/:corporateId below), so this widget's "N active
    // employees" can never drift from what the roster table on the same page shows.
    // The previous version counted only user_associations rows directly, silently
    // excluding every corporate_employees roster row with no linked login account yet
    // (confirmed live for Ninjacart: 1457 active roster rows vs. 1291 linked accounts —
    // 166 real employees missing from the denominator and from "never logged in").
    const [associationRows, rosterRows] = await Promise.all([
      postgresSequelize.query(CORPORATE_EMPLOYEE_ASSOCIATION_SQL, {
        replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT,
      }),
      postgresSequelize.query(CORPORATE_EMPLOYEE_ROSTER_SQL, {
        replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT,
      }),
    ]);
    const merged = mergeCorporateEmployeeRows(associationRows, rosterRows);
    const active = merged.filter((e) => String(e.status || 'active').toLowerCase() === 'active');

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const lastLoginMs = (e) => (e.lastLoginAt ? new Date(e.lastLoginAt).getTime() : null);

    const total = active.length;
    const welcomeSent = active.filter((e) => e.welcomeEmailStatus === 'sent').length;
    const loggedIn = active.filter((e) => Boolean(e.lastLoginAt)).length;
    const passwordChanged = active.filter((e) => Boolean(e.lastLoginAt) && e.requirePasswordChange !== true).length;
    const active7d = active.filter((e) => { const ms = lastLoginMs(e); return ms !== null && ms >= sevenDaysAgo; }).length;
    const active30d = active.filter((e) => { const ms = lastLoginMs(e); return ms !== null && ms >= thirtyDaysAgo; }).length;
    const notYetProvisioned = active.filter((e) => !e.hasUserAccount).length;

    return res.json({
      success: true,
      stats: {
        total,
        welcomeSent,
        loggedIn,
        passwordChanged,
        active7d,
        active30d,
        neverLoggedIn: total - loggedIn,
        notYetOnboarded: total - welcomeSent,
        // New: distinct from "welcome not sent" — these employees have no login account
        // provisioned at all yet (on the roster, but never self-registered or
        // admin-provisioned), so no welcome email could have been sent to them either.
        notYetProvisioned,
      }
    });
  } catch (error) {
    console.error('Activation stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/admin/corporate-employees/reactivate
 * Reactivate login for a corporate employee stuck on "Account is inactive".
 * Body: { email?, employeeId?, userId? }
 */
router.post('/corporate-employees/reactivate', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporateId = req.resolvedCorporate?.id;
    const { email, employeeId, userId } = req.body || {};

    let result;
    if (userId) {
      result = await reactivateCorporateEmployeeAccount(parseInt(userId, 10));
    } else {
      result = await reactivateCorporateEmployeeByIdentifier({
        email: email || null,
        employeeId: employeeId || null,
        corporateId,
      });
    }

    if (!result.success) {
      const status = result.reason === 'user_not_found' ? 404 : 400;
      return res.status(status).json({ success: false, message: result.reason, ...result });
    }

    return res.json({
      success: true,
      message: 'Employee account activated for login',
      ...result,
    });
  } catch (error) {
    console.error('Corporate employee reactivate error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/corporate-employees/:corporateId
 */
router.get('/corporate-employees/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const numericCorporateId = req.resolvedCorporate.id;

    const { limit: qLimit = 5000, offset: qOffset = 0 } = req.query;
    const limit = Math.min(parseInt(qLimit, 10) || 5000, 5000);
    const offset = parseInt(qOffset, 10) || 0;

    const [associationRows, rosterRows] = await Promise.all([
      postgresSequelize.query(CORPORATE_EMPLOYEE_ASSOCIATION_SQL, {
        replacements: { corporateId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT,
        benchmark: true,
      }),
      postgresSequelize.query(CORPORATE_EMPLOYEE_ROSTER_SQL, {
        replacements: { corporateId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT,
        benchmark: true,
      }),
    ]);

    const merged = mergeCorporateEmployeeRows(associationRows, rosterRows);
    const employees = merged.slice(offset, offset + limit).map((e) => ({
      ...e,
      address_city: e.address_city || null,
      address_state: e.address_state || null,
      address_zipCode: e.address_zipCode || null,
      department_name: e.department_name || null,
      user_employee_id: e.user_employee_id || null,
      corporate_employee_id: e.corporate_employee_id || null,
      corporate_employee_row_id: e.corporate_employee_row_id || null,
      gender: e.gender || null,
      dateOfBirth: e.dateOfBirth || null,
      metadata: parseMetadata(e.metadata),
    }));

    return res.json({
      success: true,
      total: merged.length,
      employees,
    });
  } catch (error) {
    console.error('Failed to get corporate employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate employees',
      error: error.message
    });
  }
});

/**
 * Update Corporate Employee
 * PUT /api/admin/corporate-employees/:userId
 * Updates user fields and/or association status (active/inactive)
 */
router.put('/corporate-employees/:userId', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, firstName, lastName, email, phoneNumber, department, designation, city, state, pinCode, secondaryEmail, packageId, employeeId, location, facility } = req.body;
    const numericUserId = parseInt(userId, 10);
    const numericCorporateId = req.resolvedCorporate.id;

    if (isNaN(numericUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Update users table (personal info fields + work address fields)
    const userUpdates = ['"updatedAt" = NOW()'];
    const userReplacements = { userId: numericUserId };
    if (firstName) { userUpdates.push('"firstName" = :firstName'); userReplacements.firstName = firstName; }
    if (lastName !== undefined) { userUpdates.push('"lastName" = :lastName'); userReplacements.lastName = lastName; }
    if (email) { userUpdates.push('"email" = :email'); userReplacements.email = email.toLowerCase().trim(); }
    if (phoneNumber) { userUpdates.push('"phoneNumber" = :phoneNumber'); userReplacements.phoneNumber = phoneNumber; }
    if (city !== undefined) { userUpdates.push('address_city = :addressCity'); userReplacements.addressCity = city; }
    if (state !== undefined) { userUpdates.push('address_state = :addressState'); userReplacements.addressState = state; }
    if (pinCode !== undefined) { userUpdates.push('"address_zipCode" = :addressZip'); userReplacements.addressZip = pinCode; }
    if (department !== undefined) { userUpdates.push('department_name = :deptName'); userReplacements.deptName = department; }
    if (employeeId !== undefined) { userUpdates.push('employee_id = :employeeId'); userReplacements.employeeId = employeeId; }
    if (status === 'active') {
      userUpdates.push("status = 'active'");
      userUpdates.push('"isCorporate" = true');
    } else if (status === 'inactive' || status === 'suspended') {
      userUpdates.push('status = :userStatus');
      userReplacements.userStatus = status;
    }
    await postgresSequelize.query(
      `UPDATE users SET ${userUpdates.join(', ')} WHERE id = :userId`,
      { replacements: userReplacements, type: postgresSequelize.QueryTypes.UPDATE }
    );

    // Normalise the incoming status to lowercase ('active' / 'inactive')
    const normalizedStatus = status ? String(status).toLowerCase() : null;
    const isActivating = normalizedStatus === 'active';
    const isDeactivating = normalizedStatus === 'inactive';

    // Update user_associations table (status + metadata)
    const assocUpdates = ['"updatedAt" = NOW()'];
    const assocReplacements = { userId: numericUserId, corpId: numericCorporateId };
    if (normalizedStatus) { assocUpdates.push('status = :status'); assocReplacements.status = normalizedStatus; }
    if (designation !== undefined || secondaryEmail !== undefined || employeeId !== undefined || location !== undefined || facility !== undefined) {
      const metaParts = [];
      if (designation !== undefined) { metaParts.push("'designation', :designation"); assocReplacements.designation = designation; }
      if (secondaryEmail !== undefined) { metaParts.push("'secondaryEmail', :secondaryEmail"); assocReplacements.secondaryEmail = secondaryEmail; }
      if (employeeId !== undefined) { metaParts.push("'employeeId', :empId"); assocReplacements.empId = employeeId; }
      if (location !== undefined) { metaParts.push("'location', :location"); assocReplacements.location = location; }
      if (facility !== undefined) { metaParts.push("'facility', :facility"); assocReplacements.facility = facility; }
      assocUpdates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(${metaParts.join(', ')})`);
    }
    await postgresSequelize.query(
      `UPDATE user_associations SET ${assocUpdates.join(', ')}
       WHERE "userId" = :userId AND "entityId" = :corpId
         AND "entityType" = 'corporate' AND role = 'employee'`,
      { replacements: assocReplacements, type: postgresSequelize.QueryTypes.UPDATE }
    );

    // Sync users.status and corporate_employees.isActive when toggling activation
    if (normalizedStatus) {
      await postgresSequelize.query(
        `UPDATE users SET status = :status, "updatedAt" = NOW() WHERE id = :userId`,
        { replacements: { status: normalizedStatus, userId: numericUserId }, type: postgresSequelize.QueryTypes.UPDATE }
      );
    }

    // Sync employeeId + isActive to corporate_employees table
    const ceUpdates = ['"updatedAt" = NOW()'];
    const ceReplacements = { userId: numericUserId, corpId: numericCorporateId };
    if (employeeId !== undefined) { ceUpdates.push('"employeeId" = :employeeId'); ceReplacements.employeeId = employeeId; }
    if (normalizedStatus) {
      ceUpdates.push('"isActive" = :isActive');
      ceReplacements.isActive = isActivating;
    }
    await postgresSequelize.query(
      `UPDATE corporate_employees SET ${ceUpdates.join(', ')} WHERE "userId" = :userId AND corporate_id = :corpId`,
      { replacements: ceReplacements, type: postgresSequelize.QueryTypes.UPDATE }
    );

    // Assign active corporate plan when activating; deactivate when deactivating
    if (isActivating) {
      try {
        const activePlan = await getActiveCorporateSubscriptionPlan({ corporateId: numericCorporateId });
        if (activePlan) {
          await assignUserToActiveCorporatePlan({ userId: numericUserId, corporateId: numericCorporateId, corporatePlan: activePlan });
        }
      } catch (planErr) {
        console.warn(`[PUT employee] Could not assign plan to user ${numericUserId}:`, planErr.message);
      }
    } else if (isDeactivating) {
      await postgresSequelize.query(
        `UPDATE user_subscriptions us
            SET status = 'INACTIVE', updated_at = NOW()
          WHERE us.user_id = :userId
            AND us.status = 'ACTIVE'
            AND EXISTS (
              SELECT 1 FROM subscription_plans sp
               WHERE sp.id = us.plan_id
                 AND sp.type = 'CORPORATE'
                 AND (sp.metadata->>'corporateId')::int = :corpId
            )`,
        { replacements: { userId: numericUserId, corpId: numericCorporateId }, type: postgresSequelize.QueryTypes.UPDATE }
      );
    }

    // Update / assign health plan if packageId provided
    if (packageId) {
      // Try user_health_packages first (explicit per-corporate packages)
      let [pkgRef] = await postgresSequelize.query(`
        SELECT DISTINCT ON ("packageId") "packageId", "packageName", "packageDetails", "validTo"
        FROM user_health_packages
        WHERE "packageId" = :packageId AND corporate_id = :corpId
        ORDER BY "packageId", "validTo" DESC
      `, {
        replacements: { packageId, corpId: numericCorporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });

      // Fall back to subscription_plans if not found in user_health_packages
      if (!pkgRef && /^\d+$/.test(String(packageId))) {
        const [spRef] = await postgresSequelize.query(`
          SELECT id::text AS "packageId", name AS "packageName",
                 COALESCE(features, '{}'::jsonb) AS "packageDetails",
                 (metadata->>'validTo') AS "validTo"
          FROM subscription_plans
          WHERE id = :planId
            AND (metadata->>'corporateId')::int = :corpId
            AND is_active = true
          LIMIT 1
        `, {
          replacements: { planId: parseInt(packageId, 10), corpId: numericCorporateId },
          type: postgresSequelize.QueryTypes.SELECT
        });
        pkgRef = spRef;
      }

      if (pkgRef) {
        const pkgDetails = typeof pkgRef.packageDetails === 'string'
          ? pkgRef.packageDetails
          : JSON.stringify(pkgRef.packageDetails || {});
        const validTo = pkgRef.validTo || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        await postgresSequelize.query(`
          INSERT INTO user_health_packages
            ("userId", corporate_id, "packageId", "packageName", "packageDetails", "validFrom", "validTo", status, "createdAt", "updatedAt")
          VALUES
            (:userId, :corpId, :packageId, :packageName, :packageDetails, NOW(), :validTo, 'active', NOW(), NOW())
          ON CONFLICT ("userId", "packageId") DO UPDATE SET
            "packageName"    = EXCLUDED."packageName",
            "packageDetails" = EXCLUDED."packageDetails",
            "validTo"        = EXCLUDED."validTo",
            status           = 'active',
            "updatedAt"      = NOW()
        `, {
          replacements: {
            userId: numericUserId,
            corpId: numericCorporateId,
            packageId,
            packageName: pkgRef.packageName,
            packageDetails: pkgDetails,
            validTo
          },
          type: postgresSequelize.QueryTypes.INSERT
        });
      }
    }

    return res.json({ success: true, message: 'Employee updated successfully' });
  } catch (error) {
    console.error('Failed to update corporate employee:', error);
    if (error.name === 'SequelizeUniqueConstraintError' && error.fields && error.fields.email) {
      return res.status(409).json({ success: false, message: `Email '${error.fields.email}' is already registered to another account.` });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get Corporate Health Packages
 * GET /api/admin/corporate-health-packages/:corporateId
 */
router.get('/corporate-health-packages/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const numericCorporateId = req.resolvedCorporate.id;
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';

    // Fetch from user_health_packages (explicit per-corporate packages)
    const uhpPackages = await postgresSequelize.query(`
      SELECT "packageId", "packageName", "packageDetails",
             MIN("validFrom") AS "validFrom",
             MAX("validTo") AS "validTo",
             COUNT(*)::int AS "employeeCount",
             COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'active')) = 'active')::int AS "activeEmployeeCount",
             COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'active')) <> 'active')::int AS "inactiveEmployeeCount",
             CASE WHEN p.id IS NOT NULL THEN CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END ELSE CASE
               WHEN COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'active')) = 'active') > 0 THEN 'active'
               ELSE 'inactive'
             END END AS status
      FROM user_health_packages uhp LEFT JOIN corporate_health_package_catalog p ON p.id=uhp."packageId" AND p.corporate_id=uhp.corporate_id
      WHERE uhp.corporate_id = :corporateId
        AND (:includeInactive = true OR LOWER(COALESCE(status, 'active')) = 'active')
        AND (:includeInactive = true OR p.is_active IS DISTINCT FROM false)
      GROUP BY "packageId", "packageName", "packageDetails",p.id,p.is_active
      ORDER BY "packageName" ASC
    `, {
      replacements: { corporateId: numericCorporateId, includeInactive },
      type: postgresSequelize.QueryTypes.SELECT
    });

    // Also fetch subscription_plans assigned to this corporate
    const spPackages = await postgresSequelize.query(`
      SELECT id::text AS "packageId",
             name AS "packageName",
             COALESCE(features, '{}'::jsonb) AS "packageDetails",
             (metadata->>'validFrom') AS "validFrom",
             (metadata->>'validTo')   AS "validTo"
      FROM subscription_plans
      WHERE type = 'CORPORATE'
        AND is_active = true
        AND (metadata->>'corporateId')::int = :corporateId
      ORDER BY name ASC
    `, {
      replacements: { corporateId: numericCorporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    // Merge, de-duplicate by packageId (uhp takes precedence)
    const uhpIds = new Set(uhpPackages.map(p => String(p.packageId)));
    const merged = [
      ...uhpPackages,
      ...spPackages.filter(p => !uhpIds.has(String(p.packageId)))
    ];

    return res.json({
      success: true,
      packages: merged.map(pkg => ({
        ...pkg,
        source: uhpIds.has(String(pkg.packageId)) ? 'user_health_packages' : 'subscription_plans',
        canDelete: uhpIds.has(String(pkg.packageId)),
        canToggleStatus: uhpIds.has(String(pkg.packageId)),
        status: pkg.status || 'active',
        packageDetails: typeof pkg.packageDetails === 'string'
          ? JSON.parse(pkg.packageDetails)
          : (pkg.packageDetails || {})
      }))
    });
  } catch (error) {
    console.error('Failed to get corporate health packages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate health packages',
      error: error.message
    });
  }
});

/**
 * Update a team-created corporate health package status for all assignments.
 * PATCH /api/admin/corporate-health-packages/:corporateId/:packageId/status
 */
router.patch('/corporate-health-packages/:corporateId/:packageId/status', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const numericCorporateId = req.resolvedCorporate.id;
    const packageId = String(req.params.packageId || '').trim();
    const status = String(req.body?.status || '').trim().toLowerCase();

    if (!packageId) {
      return res.status(400).json({ success: false, message: 'packageId is required' });
    }
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be active or inactive' });
    }

    // Catalog availability and individual employee eligibility are separate decisions.
    const catalogRows=await postgresSequelize.query(`UPDATE corporate_health_package_catalog SET is_active=:active,metadata=metadata||jsonb_build_object('status',CAST(:catalogStatus AS text)),updated_at=NOW() WHERE id=:packageId AND corporate_id=:corporateId AND metadata->>'kind'='health_checkup' RETURNING id`,{replacements:{active:status==='active',catalogStatus:status==='active'?'Active':'Inactive',packageId,corporateId:numericCorporateId},type:postgresSequelize.QueryTypes.SELECT});
    if(catalogRows.length){
      await auditAction({module:'corporate',entityType:'health_package',entityId:packageId,action:`status_${status}`,actor:req.user?.id,details:{corporateId:numericCorporateId,employeeAssignmentsPreserved:true}});
      return res.json({success:true,message:`Package marked ${status}. Employee eligibility preserved.`,status,updatedAssignments:0});
    }

    const updatedAssignments = await postgresSequelize.query(`
      UPDATE user_health_packages
      SET status = :status,
          "updatedAt" = NOW()
      WHERE corporate_id = :corporateId
        AND "packageId" = :packageId
      RETURNING "userId"
    `, {
      replacements: { corporateId: numericCorporateId, packageId, status },
      type: postgresSequelize.QueryTypes.SELECT
    });

    if (updatedAssignments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found for this corporate, or it is a subscription plan package that must be edited from Plans.'
      });
    }

    await auditAction({ module: 'corporate', entityType: 'health_package', entityId: packageId, action: `status_${status}`, actor: req.user?.id, details: { corporateId: numericCorporateId, updatedAssignments: updatedAssignments.length, role: req.user?.role } });
    return res.json({
      success: true,
      message: `Package marked ${status}.`,
      status,
      updatedAssignments: updatedAssignments.length,
    });
  } catch (error) {
    console.error('Failed to update corporate health package status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update health package status',
      error: error.message
    });
  }
});

/**
 * Delete a team-created corporate health package.
 * DELETE /api/admin/corporate-health-packages/:corporateId/:packageId
 */
router.delete('/corporate-health-packages/:corporateId/:packageId', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const numericCorporateId = req.resolvedCorporate.id;
    const packageId = String(req.params.packageId || '').trim();

    if (!packageId) {
      return res.status(400).json({ success: false, message: 'packageId is required' });
    }

    const deletedAssignments = await postgresSequelize.query(`
      DELETE FROM user_health_packages
      WHERE corporate_id = :corporateId
        AND "packageId" = :packageId
      RETURNING "userId"
    `, {
      replacements: { corporateId: numericCorporateId, packageId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    if (deletedAssignments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found for this corporate, or it is a subscription plan package that must be edited from Plans.'
      });
    }

    const linkedPlans = await postgresSequelize.query(`
      SELECT id, metadata
      FROM subscription_plans
      WHERE type = 'CORPORATE'
        AND (metadata->>'corporateId')::int = :corporateId
        AND is_active = true
    `, {
      replacements: { corporateId: numericCorporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    let cleanedPlanCount = 0;
    for (const plan of linkedPlans) {
      const metadata = typeof plan.metadata === 'string'
        ? JSON.parse(plan.metadata || '{}')
        : (plan.metadata || {});
      const healthPackageIds = Array.isArray(metadata.healthPackageIds)
        ? metadata.healthPackageIds.map(String)
        : [];
      if (!healthPackageIds.includes(packageId)) continue;

      const nextMetadata = {
        ...metadata,
        healthPackageIds: healthPackageIds.filter(id => id !== packageId),
      };
      await postgresSequelize.query(`
        UPDATE subscription_plans
        SET metadata = :metadata,
            updated_at = NOW()
        WHERE id = :planId
      `, {
        replacements: { planId: plan.id, metadata: JSON.stringify(nextMetadata) },
        type: postgresSequelize.QueryTypes.UPDATE
      });
      cleanedPlanCount++;
    }

    await auditAction({ module: 'corporate', entityType: 'health_package', entityId: packageId, action: 'delete', actor: req.user?.id, details: { corporateId: numericCorporateId, deletedAssignments: deletedAssignments.length, cleanedPlanCount, deletedUserIds: deletedAssignments.map((r) => r.userId), role: req.user?.role } });
    return res.json({
      success: true,
      message: `Deleted package from ${deletedAssignments.length} employee${deletedAssignments.length !== 1 ? 's' : ''}.`,
      deletedAssignments: deletedAssignments.length,
      cleanedPlanCount,
    });
  } catch (error) {
    console.error('Failed to delete corporate health package:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete health package',
      error: error.message
    });
  }
});

// ─── Corporate Wellness Calendar ─────────────────────────────────────────────

/** Ensure table exists once on startup */
;(async () => {
  try {
    await postgresSequelize.query(`
      CREATE TABLE IF NOT EXISTS corporate_wellness_events (
        id            BIGSERIAL PRIMARY KEY,
        corporate_id  INTEGER NOT NULL,
        title         VARCHAR(255) NOT NULL,
        description   TEXT,
        event_type    VARCHAR(80)  NOT NULL DEFAULT 'Wellness Session',
        event_date    DATE         NOT NULL,
        event_time    TIME,
        end_date      DATE,
        end_time      TIME,
        location      VARCHAR(255),
        organizer     VARCHAR(255),
        max_participants INTEGER,
        registered_count INTEGER DEFAULT 0,
        status        VARCHAR(30)  DEFAULT 'upcoming',
        color         VARCHAR(20)  DEFAULT 'teal',
        notify_employees BOOLEAN  DEFAULT FALSE,
        created_by    INTEGER,
        created_at    TIMESTAMPTZ  DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_cwe_corporate ON corporate_wellness_events(corporate_id);
      CREATE INDEX IF NOT EXISTS idx_cwe_event_date ON corporate_wellness_events(event_date);
      ALTER TABLE corporate_wellness_events ADD COLUMN IF NOT EXISTS invites_sent BOOLEAN DEFAULT FALSE;
      ALTER TABLE corporate_wellness_events ADD COLUMN IF NOT EXISTS invites_sent_at TIMESTAMPTZ;
      ALTER TABLE corporate_wellness_events ADD COLUMN IF NOT EXISTS participant_selection VARCHAR(50);
      ALTER TABLE corporate_wellness_events ADD COLUMN IF NOT EXISTS total_invited INTEGER DEFAULT 0;
    `);
  } catch (e) {
    console.warn('[Wellness Calendar] Table setup warning:', e.message);
  }
})();

/**
 * GET /api/admin/corporate-calendar/:corporateId
 * List wellness events for a corporate (optional ?month=YYYY-MM)
 */
router.get('/corporate-calendar/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const corporateId = req.resolvedCorporate.id;

    let dateFilter = '';
    const { month } = req.query; // e.g. "2026-04"
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      dateFilter = `AND DATE_TRUNC('month', event_date) = DATE_TRUNC('month', :monthDate::date)`;
    }

    const events = await postgresSequelize.query(
      `SELECT id, corporate_id, title, description, event_type, event_date, event_time,
              end_date, end_time, location, organizer, max_participants, registered_count,
              status, color, notify_employees, created_at
       FROM corporate_wellness_events
       WHERE corporate_id = :corporateId ${dateFilter}
       ORDER BY event_date ASC, event_time ASC`,
      {
        replacements: { corporateId, monthDate: month ? `${month}-01` : null },
        type: postgresSequelize.QueryTypes.SELECT
      }
    );
    return res.json({ success: true, events });
  } catch (error) {
    console.error('[Wellness Calendar] GET error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch wellness events' });
  }
});

/**
 * POST /api/admin/corporate-calendar
 * Create a new wellness event
 */
router.post('/corporate-calendar', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const {
      corporateId, title, description, eventType, eventDate, eventTime,
      endDate, endTime, location, organizer, maxParticipants, status,
      color, notifyEmployees
    } = req.body;

    if (!corporateId || !title || !eventDate) {
      return res.status(400).json({ success: false, message: 'corporateId, title, and eventDate are required' });
    }

    const [result] = await postgresSequelize.query(
      `INSERT INTO corporate_wellness_events
         (corporate_id, title, description, event_type, event_date, event_time,
          end_date, end_time, location, organizer, max_participants, status, color,
          notify_employees, created_by)
       VALUES (:corporateId, :title, :description, :eventType, :eventDate, :eventTime,
               :endDate, :endTime, :location, :organizer, :maxParticipants, :status, :color,
               :notifyEmployees, :createdBy)
       RETURNING *`,
      {
        replacements: {
          corporateId: parseInt(corporateId, 10),
          title: title.trim(),
          description: description || null,
          eventType: eventType || 'Wellness Session',
          eventDate,
          eventTime: eventTime || null,
          endDate: endDate || null,
          endTime: endTime || null,
          location: location || null,
          organizer: organizer || null,
          maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : null,
          status: status || 'upcoming',
          color: color || 'teal',
          notifyEmployees: notifyEmployees === true,
          createdBy: req.user?.id || null,
        },
        type: postgresSequelize.QueryTypes.INSERT
      }
    );
    return res.status(201).json({ success: true, event: Array.isArray(result) ? result[0] : result });
  } catch (error) {
    console.error('[Wellness Calendar] POST error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create wellness event' });
  }
});

/**
 * PUT /api/admin/corporate-calendar/:eventId
 * Update a wellness event
 */
router.put('/corporate-calendar/:eventId', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ success: false, message: 'Invalid event ID' });

    const {
      title, description, eventType, eventDate, eventTime,
      endDate, endTime, location, organizer, maxParticipants, status, color, notifyEmployees
    } = req.body;

    await postgresSequelize.query(
      `UPDATE corporate_wellness_events SET
         title = COALESCE(:title, title),
         description = :description,
         event_type = COALESCE(:eventType, event_type),
         event_date = COALESCE(:eventDate, event_date),
         event_time = :eventTime,
         end_date = :endDate,
         end_time = :endTime,
         location = :location,
         organizer = :organizer,
         max_participants = :maxParticipants,
         status = COALESCE(:status, status),
         color = COALESCE(:color, color),
         notify_employees = COALESCE(:notifyEmployees, notify_employees),
         updated_at = NOW()
       WHERE id = :eventId AND corporate_id = :corporateId`,
      {
        replacements: {
          eventId,
          corporateId: req.resolvedCorporate.id,
          title: title?.trim() || null,
          description: description ?? null,
          eventType: eventType || null,
          eventDate: eventDate || null,
          eventTime: eventTime || null,
          endDate: endDate || null,
          endTime: endTime || null,
          location: location || null,
          organizer: organizer || null,
          maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : null,
          status: status || null,
          color: color || null,
          notifyEmployees: notifyEmployees ?? null,
        },
        type: postgresSequelize.QueryTypes.UPDATE
      }
    );
    return res.json({ success: true, message: 'Event updated' });
  } catch (error) {
    console.error('[Wellness Calendar] PUT error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update wellness event' });
  }
});

/**
 * DELETE /api/admin/corporate-calendar/:eventId
 */
router.delete('/corporate-calendar/:eventId', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ success: false, message: 'Invalid event ID' });
    await postgresSequelize.query(
      `DELETE FROM corporate_wellness_events WHERE id = :eventId AND corporate_id = :corporateId`,
      { replacements: { eventId, corporateId: req.resolvedCorporate.id }, type: postgresSequelize.QueryTypes.DELETE }
    );
    return res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('[Wellness Calendar] DELETE error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete wellness event' });
  }
});

/**
 * Get Corporate Subscription Plans
 * GET /api/admin/corporate-plans/:corporateId
 */
router.get('/corporate-plans/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), requireCorporateAccess, async (req, res) => {
  try {
    const numericCorporateId = req.resolvedCorporate.id;

    const plans = await postgresSequelize.query(`
      SELECT p.id, p.name, p.slug, p.price, p.annual_price, p.currency, p.billing_cycle, p.is_active,
             p.description, p.features, p.metadata,
             COALESCE(cnt.enrolled, 0) AS enrolled
      FROM subscription_plans p
      LEFT JOIN (
        SELECT us.plan_id, COUNT(*) AS enrolled
        FROM user_subscriptions us
        JOIN user_associations ua ON ua."userId" = us.user_id
        WHERE ua."entityType" = 'corporate'
          AND ua."entityId" = :corporateId
          AND ua.role = 'employee'
          AND us.status = 'ACTIVE'
        GROUP BY us.plan_id
      ) cnt ON cnt.plan_id = p.id
      WHERE p.type = 'CORPORATE'
        AND p.is_active = true
        AND (
          (p.metadata->>'corporateId')::int = :corporateId
          OR p.slug ILIKE 'corporate-%'
        )
      ORDER BY p.id DESC
    `, {
      replacements: { corporateId: numericCorporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });

    return res.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Failed to get corporate plans:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate plans',
      error: error.message
    });
  }
});

/**
 * Create Corporate Subscription Plan
 * POST /api/admin/corporate-plans
 */
router.post('/corporate-plans', authUser, requireRole(['admin', 'team']), requireCorporateAccess, async (req, res) => {
  try {
    const {
      // rich fields from team/admin UI
      planName, planType, description,
      validFrom, validTo,
      totalEmployees, premiumPerEmployee, totalPremium,
      status = 'Active', currency = 'INR', billingCycle,
      features, benefits, coverage,
      // legacy simple-form fallback
      name, slug, price, annualPrice,
    } = req.body || {};

    // corporateId comes from the ring-fenced resolved corporate (not req.body)
    const corporateId = req.resolvedCorporate?.id || null;

    const resolvedName = planName || name;
    const resolvedPrice = premiumPerEmployee != null ? Number(premiumPerEmployee) : (price != null ? Number(price) : null);

    if (!resolvedName || resolvedPrice == null) {
      return res.status(400).json({
        success: false,
        message: 'planName (or name) and premiumPerEmployee (or price) are required'
      });
    }

    // billing_cycle enum: MONTHLY | ANNUAL | LIFETIME
    const cycleMap = { ANNUAL: 'ANNUAL', MONTHLY: 'MONTHLY', LIFETIME: 'LIFETIME' };
    const resolvedCycle = cycleMap[billingCycle] || 'ANNUAL';

    // Build a compact unique slug that always fits within varchar(50)
    // Format: corp-{corpId}-{last9-of-timestamp} OR corp-{last13-of-timestamp}
    // e.g. "corp-5-999999999" = 17 chars — well under 50
    const tsFragment = String(Date.now()).slice(-9);
    const planSlug = corporateId
      ? `corp-${corporateId}-${tsFragment}`
      : `corp-${tsFragment}`;

    const resolvedAnnualPrice = annualPrice != null
      ? Number(annualPrice)
      : (resolvedCycle === 'ANNUAL' ? resolvedPrice * 12 : resolvedPrice);

    // Compose metadata — all rich corporate fields
    const metadata = {
      planType: planType || 'Standard',
      corporateId: corporateId || null,
      validFrom: validFrom || null,
      validTo: validTo || null,
      totalEmployees: totalEmployees ? Number(totalEmployees) : null,
      totalPremium: totalPremium ? Number(totalPremium) : (totalEmployees && premiumPerEmployee ? Number(totalEmployees) * Number(premiumPerEmployee) : null),
      status,
      benefits: benefits || [],
      coverage: coverage || {},
    };

    const [inserted] = await postgresSequelize.query(`
      INSERT INTO subscription_plans (
        name, slug, type, price, annual_price, currency, billing_cycle,
        description, features, metadata,
        is_active, is_popular, requires_referral, allows_upgrade,
        created_at, updated_at
      )
      VALUES (
        :name, :slug, 'CORPORATE', :price, :annualPrice, :currency, :billingCycle,
        :description, :features, :metadata,
        :isActive, false, false, true,
        NOW(), NOW()
      )
      RETURNING id, name, slug, price, annual_price, currency, billing_cycle, is_active, metadata, features, description
    `, {
      replacements: {
        name: resolvedName,
        slug: planSlug,
        price: resolvedPrice,
        annualPrice: resolvedAnnualPrice,
        currency,
        billingCycle: resolvedCycle,
        description: description || null,
        features: features ? JSON.stringify(features) : null,
        metadata: JSON.stringify(metadata),
        isActive: status === 'Active',
      },
      type: postgresSequelize.QueryTypes.INSERT
    });

    return res.status(201).json({
      success: true,
      plan: inserted
    });
  } catch (error) {
    console.error('Failed to create corporate plan:', error);
    // Handle unique constraint violations gracefully
    if (error.original?.constraint === 'subscription_plans_name_key') {
      return res.status(409).json({
        success: false,
        message: `A plan named "${req.body?.planName || req.body?.name}" already exists. Please use a different plan name.`
      });
    }
    if (error.original?.constraint === 'subscription_plans_slug_key') {
      return res.status(409).json({
        success: false,
        message: 'Plan slug conflict. Please try again.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to create corporate plan',
      error: error.message
    });
  }
});

/**
 * Update Corporate Plan
 * PUT /api/admin/corporate-plans/:planId
 */
router.put('/corporate-plans/:planId', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { planId } = req.params;
    const id = parseInt(planId, 10);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan ID' });
    }

    const {
      planName, planType, description, validFrom, validTo,
      totalEmployees, premiumPerEmployee, status, currency,
      features, benefits, coverage, healthPackageIds
    } = req.body;

    const resolvedName = planName || req.body.name;
    if (!resolvedName) {
      return res.status(400).json({ success: false, message: 'Plan name is required' });
    }

    // Fetch existing plan
    const [existing] = await postgresSequelize.query(
      `SELECT id, metadata FROM subscription_plans WHERE id = :id AND type = 'CORPORATE'`,
      { replacements: { id }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Corporate plan not found' });
    }

    const existingMeta = typeof existing.metadata === 'string'
      ? JSON.parse(existing.metadata) : (existing.metadata || {});

    const metadata = {
      ...existingMeta,
      planType: planType || existingMeta.planType,
      status: status || existingMeta.status,
      validFrom: validFrom || existingMeta.validFrom,
      validTo: validTo || existingMeta.validTo,
      totalEmployees: totalEmployees !== undefined ? parseInt(totalEmployees) : existingMeta.totalEmployees,
      premiumPerEmployee: premiumPerEmployee !== undefined ? parseFloat(premiumPerEmployee) : existingMeta.premiumPerEmployee,
      totalPremium: (totalEmployees && premiumPerEmployee)
        ? parseInt(totalEmployees) * parseFloat(premiumPerEmployee)
        : existingMeta.totalPremium,
      benefits: benefits || existingMeta.benefits,
      coverage: coverage || existingMeta.coverage,
      healthPackageIds: healthPackageIds !== undefined ? healthPackageIds : existingMeta.healthPackageIds,
    };

    const resolvedPrice = premiumPerEmployee !== undefined ? parseFloat(premiumPerEmployee) : null;

    await postgresSequelize.query(`
      UPDATE subscription_plans SET
        name = :name,
        description = :description,
        currency = :currency,
        features = :features,
        metadata = :metadata,
        is_active = :isActive,
        updated_at = NOW()
        ${resolvedPrice !== null ? ', price = :price' : ''}
      WHERE id = :id
    `, {
      replacements: {
        id,
        name: resolvedName,
        description: description || '',
        currency: currency || 'INR',
        features: JSON.stringify(features || {}),
        metadata: JSON.stringify(metadata),
        isActive: (status || existingMeta.status) === 'Active',
        ...(resolvedPrice !== null ? { price: resolvedPrice } : {}),
      },
      type: postgresSequelize.QueryTypes.UPDATE
    });

    return res.json({ success: true, message: 'Plan updated successfully' });
  } catch (error) {
    console.error('Failed to update corporate plan:', error);
    return res.status(500).json({ success: false, message: 'Failed to update plan', error: error.message });
  }
});

/**
 * Delete Corporate Plan
 * DELETE /api/admin/corporate-plans/:planId
 */
router.delete('/corporate-plans/:planId', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { planId } = req.params;
    const id = parseInt(planId, 10);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid plan ID' });
    }

    // Verify the plan exists and is a CORPORATE plan
    const [plan] = await postgresSequelize.query(
      `SELECT id, name, type FROM subscription_plans WHERE id = :id AND type = 'CORPORATE'`,
      { replacements: { id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Corporate plan not found' });
    }

    await postgresSequelize.query(
      `DELETE FROM subscription_plans WHERE id = :id`,
      { replacements: { id }, type: postgresSequelize.QueryTypes.DELETE }
    );

    return res.json({ success: true, message: `Plan "${plan.name}" deleted successfully` });
  } catch (error) {
    console.error('Failed to delete corporate plan:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete corporate plan', error: error.message });
  }
});

/**
 * Get Corporate Network Partners
 * GET /api/admin/corporate-network/:corporateId
 */
router.get('/corporate-network/:corporateId', authUser, requireRole(['admin', 'team', 'corporate_admin']), async (req, res) => {
  try {
    const corporateId = parseInt(req.params.corporateId, 10);
    if (!corporateId || Number.isNaN(corporateId)) {
      return res.status(400).json({ success: false, message: 'Invalid corporate ID' });
    }

    await ensureCorporateNetworkAssignmentsTable();

    const available = req.query.available === 'true'; // true = return UNassigned partners
    const searchTerm = (req.query.search || '').trim(); // optional search filter
    const HOSPITAL_LIMIT = 500; // cap for large tables

    const assignedFilter = available
      ? `WHERE l.id NOT IN (
           SELECT partner_id FROM corporate_network_assignments
           WHERE corporate_id = :corporateId AND partner_type = 'lab'
         )`
      : `WHERE EXISTS (
           SELECT 1 FROM corporate_network_assignments
           WHERE corporate_id = :corporateId AND partner_type = 'lab' AND partner_id = l.id
         )`;

    const assignedFilterH = available
      ? `WHERE h.id NOT IN (
           SELECT partner_id FROM corporate_network_assignments
           WHERE corporate_id = :corporateId AND partner_type = 'hospital'
           AND partner_id IS NOT NULL
         )`
      : `WHERE EXISTS (
           SELECT 1 FROM corporate_network_assignments
           WHERE corporate_id = :corporateId AND partner_type = 'hospital' AND partner_id = h.id
         )`;

    const assignedFilterC = available
      ? `WHERE pc.id NOT IN (
           SELECT partner_id FROM corporate_network_assignments
           WHERE corporate_id = :corporateId AND partner_type = 'clinic'
           AND partner_id IS NOT NULL
         )`
      : `WHERE EXISTS (
           SELECT 1 FROM corporate_network_assignments
           WHERE corporate_id = :corporateId AND partner_type = 'clinic' AND partner_id = pc.id
         )`;

    const labs = await postgresSequelize.query(`
      SELECT l.id, l.name, l.address, l."testCatalog", l.status, l.metadata
      FROM labs l
      ${assignedFilter}
      ORDER BY l.name ASC
    `, { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT });

    // Build optional hospital search clause (applied after the assignedFilter WHERE)
    const hospitalSearchClause = searchTerm
      ? `AND (LOWER(h.hospital_name) LIKE :hSearch OR LOWER(h.city) LIKE :hSearch OR h.pincode LIKE :hPinSearch)`
      : '';

    const [hospitals, [{ total_hospitals }]] = await Promise.all([
      postgresSequelize.query(`
        SELECT h.id, h.hospital_name, h.city, h.pincode, h.address, h.specializations, h.total_beds, h.status
        FROM hospitals h
        ${assignedFilterH}
        ${hospitalSearchClause}
        ORDER BY h.hospital_name ASC
        LIMIT ${HOSPITAL_LIMIT}
      `, {
        replacements: {
          corporateId,
          hSearch: `%${searchTerm.toLowerCase()}%`,
          hPinSearch: `${searchTerm}%`
        },
        type: postgresSequelize.QueryTypes.SELECT
      }),
      postgresSequelize.query(`
        SELECT COUNT(*) AS total_hospitals FROM hospitals h ${assignedFilterH} ${hospitalSearchClause}
      `, {
        replacements: {
          corporateId,
          hSearch: `%${searchTerm.toLowerCase()}%`,
          hPinSearch: `${searchTerm}%`
        },
        type: postgresSequelize.QueryTypes.SELECT
      })
    ]);

    // Build optional clinic search clause
    const clinicSearchClause = searchTerm
      ? `AND (LOWER(pc.name) LIKE :cSearch OR LOWER(pc.location->>'city') LIKE :cSearch OR pc.location->>'pincode' LIKE :cPinSearch)`
      : '';

    const clinics = await postgresSequelize.query(`
      SELECT pc.id, pc.name, pc.type, pc.specialty, pc.location, pc.status
      FROM provider_clinics pc
      ${assignedFilterC}
      ${clinicSearchClause}
      ORDER BY pc.name ASC
    `, {
      replacements: {
        corporateId,
        cSearch: `%${searchTerm.toLowerCase()}%`,
        cPinSearch: `${searchTerm}%`
      },
      type: postgresSequelize.QueryTypes.SELECT
    });

    const normalizedLabs = labs.map((lab) => {
      const address = safeParseJsonObject(lab.address);
      const testCatalog = safeParseJsonObject(lab.testCatalog);
      const metadata = safeParseJsonObject(lab.metadata);
      const testsAvailable = testCatalog
        ? Object.values(testCatalog).reduce((count, group) => count + (Array.isArray(group) ? group.length : 0), 0)
        : 0;

      return {
        id: lab.id,
        name: lab.name,
        city: address?.city || 'N/A',
        address: address?.street || null,
        pincode: address?.pincode || null,
        testsAvailable,
        discount: metadata?.discount || metadata?.corporateDiscount || null,
        status: lab.status || 'active'
      };
    });

    const normalizedHospitals = hospitals.map((hospital) => {
      const specializations = typeof hospital.specializations === 'string'
        ? safeParseJsonObject(hospital.specializations)
        : hospital.specializations || [];

      return {
        id: hospital.id,
        name: hospital.hospital_name,
        city: hospital.city || 'N/A',
        address: hospital.address || null,
        pincode: hospital.pincode || null,
        specialities: Array.isArray(specializations) ? specializations.join(', ') : (specializations || ''),
        beds: hospital.total_beds || 0,
        status: hospital.status || 'active'
      };
    });

    const normalizedClinics = clinics.map((clinic) => {
      const location = safeParseJsonObject(clinic.location);
      return {
        id: clinic.id,
        name: clinic.name,
        city: location?.city || 'N/A',
        address: location?.address || null,
        pincode: location?.pincode || null,
        type: clinic.type || clinic.specialty || 'Clinic',
        doctors: 0,
        status: clinic.status || 'active'
      };
    });

    return res.json({
      success: true,
      labs: normalizedLabs,
      hospitals: normalizedHospitals,
      totalHospitals: parseInt(total_hospitals || 0, 10),
      hospitalLimit: HOSPITAL_LIMIT,
      clinics: normalizedClinics
    });
  } catch (error) {
    console.error('Failed to get corporate network partners:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get corporate network partners',
      error: error.message
    });
  }
});

/**
 * Assign Network Partners to Corporate Employees
 * POST /api/admin/corporate-network-assignments
 */
router.post('/corporate-network-assignments', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId, partnerId, partnerType, employeeIds } = req.body;
    const validTypes = ['lab', 'hospital', 'clinic'];
    const requestedPartners = Array.isArray(req.body.partners)
      ? req.body.partners
      : (partnerId && partnerType ? [{ partnerId, partnerType }] : []);

    if (!corporateId || requestedPartners.length === 0) {
      return res.status(400).json({ success: false, message: 'corporateId and at least one partner are required' });
    }

    const partnerMap = new Map();
    for (const partner of requestedPartners) {
      const normalizedPartnerId = parseInt(partner.partnerId, 10);
      const normalizedPartnerType = partner.partnerType;

      if (!normalizedPartnerId || Number.isNaN(normalizedPartnerId)) {
        return res.status(400).json({ success: false, message: 'partnerId must be a valid number' });
      }

      if (!validTypes.includes(normalizedPartnerType)) {
        return res.status(400).json({ success: false, message: 'partnerType must be lab, hospital or clinic' });
      }

      partnerMap.set(`${normalizedPartnerType}:${normalizedPartnerId}`, {
        partnerId: normalizedPartnerId,
        partnerType: normalizedPartnerType,
      });
    }
    const normalizedPartners = Array.from(partnerMap.values());

    // Resolve employee count for the response
    let assignedCount = 0;
    if (employeeIds === 'all' || !employeeIds) {
      const [countRow] = await postgresSequelize.query(
        `SELECT COUNT(DISTINCT "userId") AS cnt FROM user_associations WHERE "entityType" = 'corporate' AND "entityId" = :corporateId AND role = 'employee' AND status = 'active'`,
        { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      assignedCount = parseInt(countRow?.cnt || 0, 10);
    } else if (Array.isArray(employeeIds)) {
      assignedCount = employeeIds.length;
    }

    // COR-03: the upsert REPLACES a partner's stored employee list. Keep the previous value in the audit row so an
    // overwrite is recoverable.
    let previousAssignments = [];
    try {
      const prev = await postgresSequelize.query(
        'SELECT partner_id, partner_type, employee_ids FROM corporate_network_assignments WHERE corporate_id = :corporateId',
        { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT });
      const wanted = new Set(normalizedPartners.map((p) => `${p.partnerType}:${p.partnerId}`));
      previousAssignments = prev.filter((r) => wanted.has(`${r.partner_type}:${r.partner_id}`));
    } catch { /* table may not exist yet on first use */ }

    try {
      await ensureCorporateNetworkAssignmentsTable();
      for (const partner of normalizedPartners) {
        await postgresSequelize.query(`
          INSERT INTO corporate_network_assignments (corporate_id, partner_id, partner_type, employee_ids, assigned_by, assigned_at)
          VALUES (:corporateId, :partnerId, :partnerType, :employeeIds, :assignedBy, NOW())
          ON CONFLICT (corporate_id, partner_id, partner_type) DO UPDATE
            SET employee_ids = EXCLUDED.employee_ids,
                assigned_by = EXCLUDED.assigned_by,
                assigned_at = NOW()
        `, {
          replacements: {
            corporateId,
            partnerId: partner.partnerId,
            partnerType: partner.partnerType,
            employeeIds: JSON.stringify(employeeIds || 'all'),
            assignedBy: req.user?.id || null,
          },
          type: postgresSequelize.QueryTypes.INSERT
        });
      }
    } catch (dbErr) {
      console.error('corporate_network_assignments persistence failed:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to save corporate network assignment',
        error: dbErr.message
      });
    }

    await auditAction({ module: 'corporate', entityType: 'network_assignment', entityId: corporateId, action: 'assign_partners', actor: req.user?.id, details: { partners: normalizedPartners, employeeScope: employeeIds || 'all', previous: previousAssignments, role: req.user?.role } });
    return res.json({
      success: true,
      message: `${normalizedPartners.length} partner${normalizedPartners.length !== 1 ? 's' : ''} assigned to ${assignedCount} employee${assignedCount !== 1 ? 's' : ''} successfully`,
      assignedCount,
      corporateId,
      partnerId: normalizedPartners[0]?.partnerId,
      partnerType: normalizedPartners[0]?.partnerType,
      assignedPartners: normalizedPartners,
    });
  } catch (error) {
    console.error('Failed to assign network partner:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign network partner', error: error.message });
  }
});

/**
 * Assign Health Package to Corporate Employees
 * POST /api/admin/corporate-package-assignments
 * Creates health package assignments for corporate employees
 */
router.post('/corporate-package-assignments', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const { corporateId, packageId, packageName, packageDetails, employeeIds, validityDays = 365 } = req.body;
    
    if (!corporateId || !packageId) {
      return res.status(400).json({
        success: false,
        message: 'corporateId and packageId are required'
      });
    }
    
    // Verify corporate exists
    const [corporate] = await postgresSequelize.query(`
      SELECT id, "companyName" FROM corporates WHERE id = :corporateId
    `, {
      replacements: { corporateId },
      type: postgresSequelize.QueryTypes.SELECT
    });
    
    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }
    
    // Get employees to assign package to
    let employeesToAssign = [];
    
    if (employeeIds === 'all' || !employeeIds) {
      // Get all employees of this corporate
      employeesToAssign = await postgresSequelize.query(`
        SELECT u.id, u.email, u."firstName", u."lastName"
        FROM users u
        JOIN user_associations ua ON u.id = ua."userId"
        WHERE ua."entityType" = 'corporate' 
          AND ua."entityId" = :corporateId
          AND ua.role = 'employee'
          AND ua.status = 'active'
      `, {
        replacements: { corporateId },
        type: postgresSequelize.QueryTypes.SELECT
      });
    } else if (Array.isArray(employeeIds)) {
      // Get specific employees
      employeesToAssign = await postgresSequelize.query(`
        SELECT u.id, u.email, u."firstName", u."lastName"
        FROM users u
        WHERE u.id IN (:employeeIds)
      `, {
        replacements: { employeeIds },
        type: postgresSequelize.QueryTypes.SELECT
      });
    }
    
    const results = { assigned: [], failed: [] };
    const validFrom = new Date();
    const validTo = new Date();
    validTo.setDate(validTo.getDate() + validityDays);
    
    for (const emp of employeesToAssign) {
      try {
        // Create health package assignment
        await postgresSequelize.query(`
          INSERT INTO user_health_packages (
            "userId", corporate_id, "packageId", "packageName", 
            "packageDetails", "validFrom", "validTo", status,
            "createdAt", "updatedAt"
          )
          VALUES (
            :userId, :corporateId, :packageId, :packageName,
            :packageDetails, :validFrom, :validTo, 'active',
            NOW(), NOW()
          )
          ON CONFLICT ("userId", "packageId") DO UPDATE SET
            "packageName"    = CASE WHEN EXCLUDED."packageDetails" != '{}'::jsonb THEN EXCLUDED."packageName"    ELSE user_health_packages."packageName"    END,
            "packageDetails" = CASE WHEN EXCLUDED."packageDetails" != '{}'::jsonb THEN EXCLUDED."packageDetails" ELSE user_health_packages."packageDetails" END,
            "validTo" = EXCLUDED."validTo",
            status = 'active',
            "updatedAt" = NOW()
        `, {
          replacements: {
            userId: emp.id,
            corporateId,
            packageId,
            packageName: packageName || `Health Package ${packageId}`,
            packageDetails: JSON.stringify(packageDetails || {}),
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString()
          },
          type: postgresSequelize.QueryTypes.INSERT
        });
        
        results.assigned.push({
          userId: emp.id,
          email: emp.email,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
        });
      } catch (empError) {
        results.failed.push({
          userId: emp.id,
          email: emp.email,
          reason: empError.message
        });
      }
    }
    
    console.log(`[Package Assignment] Corporate ${corporate.companyName}: Assigned ${results.assigned.length} employees, Failed ${results.failed.length}`);
    
    return res.json({
      success: true,
      message: `Health package assigned to ${results.assigned.length} employees`,
      data: {
        corporate: corporate.companyName,
        packageId,
        packageName: packageName || `Health Package ${packageId}`,
        validFrom,
        validTo,
        summary: {
          total: employeesToAssign.length,
          assigned: results.assigned.length,
          failed: results.failed.length
        },
        assigned: results.assigned,
        failed: results.failed.length > 0 ? results.failed : undefined
      }
    });
  } catch (error) {
    console.error('Failed to assign corporate health package:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign health package',
      error: error.message
    });
  }
});

// Note: a second, unreachable GET /corporate-health-packages/:corporateId
// (Express matches the first-registered route above) was removed here --
// its one real improvement, a per-package employeeCount, has been merged
// into the live handler instead of leaving dead code with a slightly
// different response shape around.

// Admin creates internal users
router.post('/users', authUser, requireRole('admin'), createInternalUser);
// --------------------------------------------------------------------------
// Nurse and Assistant user provisioning helpers (intelligent DB userModel)
// --------------------------------------------------------------------------

router.post('/nurse-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { nurseId, email, firstName, lastName, phoneNumber, password } = req.body || {};
    const requestedEmail = String(email || '').trim().toLowerCase();

    if (!nurseId || !requestedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'nurseId, email and password are required',
      });
    }

    const existing = await userModel.findOne({ where: { email: requestedEmail } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    const nurse = await Nurse.findByPk(nurseId);
    if (!nurse) {
      return res.status(404).json({ success: false, message: 'Nurse record not found' });
    }

    const nurseEmail = String(nurse.email || '').trim().toLowerCase();
    if (requestedEmail !== nurseEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email must match the nurse record email to provision nurse portal login',
      });
    }

    // Ensure this nurse does not already have an associated login by email
    const existingNurseUser = await userModel.findOne({ where: { email: nurse.email } });
    if (existingNurseUser) {
      return res.status(409).json({
        success: false,
        message: 'Login already exists for this nurse',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Keep the nurse portal login (which authenticates against the nurses table)
    // in sync with the provisioned credentials.
    try {
      await nurse.update({ password: hashedPassword });
    } catch (e) {
      console.warn('Failed to sync nurse password to nurse record:', e?.message || e);
    }

    const nurseUser = await userModel.create({
      firstName: firstName || nurse.firstName,
      lastName: lastName || nurse.lastName,
      email: requestedEmail,
      phoneNumber: phoneNumber || nurse.phoneNumber,
      password: hashedPassword,
      role: 'nurse',
      isAdmin: false,
      isActive: true
    });

    const token = generateAuthTokenForUser(nurseUser);

    return res.status(201).json({
      success: true,
      message: 'Nurse user created',
      token,
      user: {
        id: nurseUser.id,
        email: nurseUser.email,
        firstName: nurseUser.firstName,
        lastName: nurseUser.lastName,
        phoneNumber: nurseUser.phoneNumber,
        role: nurseUser.role,
        isActive: nurseUser.isActive,
        createdAt: nurseUser.createdAt,
        updatedAt: nurseUser.updatedAt
      },
    });
  } catch (error) {
    console.error('Create nurse user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create nurse user',
    });
  }
});

router.post('/assistant-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { assistantId, email, firstName, lastName, phoneNumber, password } = req.body || {};

    if (!assistantId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'assistantId, email and password are required',
      });
    }

    const existing = await userModel.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    const assistant = await Assistant.findByPk(assistantId);
    if (!assistant) {
      return res.status(404).json({ success: false, message: 'Assistant record not found' });
    }

    // Ensure this assistant does not already have an associated login by email
    const existingAssistantUser = await userModel.findOne({ where: { email: assistant.email } });
    if (existingAssistantUser) {
      return res.status(409).json({
        success: false,
        message: 'Login already exists for this assistant',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const assistantUser = await userModel.create({
      firstName: firstName || assistant.firstName,
      lastName: lastName || assistant.lastName,
      email,
      phoneNumber: phoneNumber || assistant.phoneNumber,
      password: hashedPassword,
      role: 'assistant',
      isAdmin: false,
      isActive: true
    });

    const token = generateAuthTokenForUser(assistantUser);

    return res.status(201).json({
      success: true,
      message: 'Assistant user created',
      token,
      user: {
        id: assistantUser.id,
        email: assistantUser.email,
        firstName: assistantUser.firstName,
        lastName: assistantUser.lastName,
        phoneNumber: assistantUser.phoneNumber,
        role: assistantUser.role,
        isActive: assistantUser.isActive,
        createdAt: assistantUser.createdAt,
        updatedAt: assistantUser.updatedAt
      },
    });
  } catch (error) {
    console.error('Create assistant user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create assistant user',
    });
  }
});

// --------------------------------------------------------------------------
// Filter endpoints for dropdowns and lists
// --------------------------------------------------------------------------

// Get filter options for doctors - cities
router.get('/doctors/filters/cities', async (req, res) => {
  try {
    // Specialties don't require auth - they're just static data
    const doctors = await DoctorPostgres.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('city')), 'city']],
      where: { city: { [Op.ne]: null } },
      order: [['city', 'ASC']]
    });
    const cities = doctors.map(d => d.city).filter(Boolean);
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cities'
    });
  }
});

// Get filter options for doctors - states
router.get('/doctors/filters/states', async (req, res) => {
  try {
    // Specialties don't require auth - they're just static data
    const doctors = await DoctorPostgres.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('state')), 'state']],
      where: { state: { [Op.ne]: null } },
      order: [['state', 'ASC']]
    });
    const states = doctors.map(d => d.state).filter(Boolean);
    res.json({
      success: true,
      data: states
    });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch states'
    });
  }
});

// Get filter options for doctors - specialties
router.get('/doctors/filters/specialties', async (req, res) => {
  try {
    // Specialties don't require auth - they're just static data for dropdowns
    const specialties = [
      'General Practitioner',
      'Cardiologist',
      'Dermatologist',
      'Pediatrician',
      'Orthopedist',
      'Neurologist',
      'Psychiatrist',
      'Psychologist',
      'Gynecologist',
      'ENT Specialist',
      'Ophthalmologist',
      'Rheumatologist',
      'Pulmonologist',
      'Physiotherapist',
      'Occupational Therapist',
      'Nutritionist',
      'Dietician',
      'Nephrologist',
      'Urologist',
      'Diabetologist',
      'Intensivist',
      'Cardio Thoracic Surgeon',
      'Vascular Surgeon',
      'Neuro Surgeon',
      'Cardio Vascular Surgeon',
      'Gastroenterologist',
      'Gastro Surgeon',
      'General Surgeon',
      'Proctologist',
      'Podiatrician',
      'Dentist',
      'Endocrinologist',
      'Oncologist',
      'Other'
    ];
    res.json({
      success: true,
      data: specialties
    });
  } catch (error) {
    console.error('Error fetching specialties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch specialties'
    });
  }
});

// --------------------------------------------------------------------------
// Minimal stubs for admin-managed team endpoints used by frontend
// --------------------------------------------------------------------------

// List team users from database
router.get('/team', authUser, requireRole('admin'), async (req, res) => {
  try {
    // Support ?includeInactive=true to show deleted users
    const includeInactive = req.query.includeInactive === 'true';
    
    // Fetch team users from database
    const whereClause = { role: 'team' };
    if (!includeInactive) {
      whereClause.status = 'active'; // Filter for active status
    }
    
    const teamUsers = await userModel.findAll({ 
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    const formattedUsers = teamUsers.map(user => {
      let metadata = {};
      try {
        metadata = user.metadata ? JSON.parse(user.metadata) : {};
      } catch (e) {
        metadata = {};
      }

      return {
        id: user.id,
        uniqueId: user.unique_id || null,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber || '',
        employeeId: metadata.employeeId || '',
        department: metadata.department || '',
        designation: metadata.designation || '',
        role: metadata.roleTitle || 'Team Member', // Return role title from metadata for display
        permissions: metadata.permissions || [],
        address: metadata.address || { street: '', city: '', state: '', pincode: '' },
        emergencyContact: metadata.emergencyContact || { name: '', relationship: '', phone: '' },
        joiningDate: metadata.joiningDate || new Date().toISOString().split('T')[0],
        lastLogin: user.lastLoginAt,
        isActive: user.isActive !== undefined ? user.isActive : true,
        canLogin: metadata.canLogin !== undefined ? metadata.canLogin : true,
        createdAt: user.createdAt
      };
    });

    // Return actual team users (could be empty if all are inactive and filter is applied)
    // Only return demo data if no users exist at all (check without filter)
    let responseData = formattedUsers;
    if (formattedUsers.length === 0 && !includeInactive) {
      // Check if there are ANY team users (active or inactive)
      const totalCount = await userModel.count({ where: { role: 'team' } });
      // Only use demo data if truly no users exist
      responseData = totalCount === 0 ? demoTeamUsers : [];
    }

    return res.json({
      success: true,
      teamUsers: responseData,
      data: responseData,
      total: responseData.length
    });
  } catch (error) {
    console.error('Error fetching team users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch team users',
      teamUsers: demoTeamUsers,
      data: demoTeamUsers,
      total: demoTeamUsers.length
    });
  }
});

// Create team user
router.post('/team', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userData = req.body?.user || req.body;
    
    // Validate required fields
    if (!userData.firstName || !userData.lastName || !userData.email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
      });
    }

    // Check if user already exists
    const existingUser = await userModel.findOne({ where: { email: userData.email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate secure temporary password
    const temporaryPassword = welcomeEmailService.generateSecurePassword();

    // Generate unique team member ID
    const teamUniqueId = await generateGuaranteedUniqueId('T', 'users');

    // Create team user in database with metadata
    const teamMetadata = {
      employeeId: userData.employeeId,
      department: userData.department,
      designation: userData.designation,
      roleTitle: userData.role || 'Team Member', // Store display role in metadata
      permissions: userData.permissions || [],
      address: userData.address || {},
      emergencyContact: userData.emergencyContact || {},
      joiningDate: userData.joiningDate || new Date().toISOString().split('T')[0],
      canLogin: userData.canLogin !== undefined ? userData.canLogin : true,
      isTeam: true,
      requirePasswordChange: true  // Force password change on first login
    };

    const newUser = await userModel.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: temporaryPassword, // Will be hashed by model
      phoneNumber: userData.phoneNumber || '',
      dateOfBirth: userData.dateOfBirth || '1990-01-01',  // Default date if not provided
      gender: userData.gender || 'Other',
      role: 'team',
      membershipType: 'team',
      unique_id: teamUniqueId,
      metadata: teamMetadata,  // Pass as object, not JSON string
      status: userData.isActive === false ? 'inactive' : 'active'
    });

    // Send welcome email with credentials (async, non-blocking)
    welcomeEmailService.sendTeamWelcomeEmail({
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: userData.designation || 'Team Member',
      department: userData.department || 'General'
    }, temporaryPassword).catch(err => {
      console.error('Failed to send welcome email to team user:', err);
    });

    return res.status(201).json({
      success: true,
      message: 'Team user created successfully. Welcome email sent with login credentials.',
      user: {
        id: newUser.id,
        uniqueId: newUser.unique_id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        employeeId: newUser.employeeId,
        department: newUser.department,
        designation: newUser.designation,
        role: newUser.role,
        membershipType: newUser.membershipType,
        phoneNumber: newUser.phoneNumber,
        isActive: newUser.isActive,
        canLogin: newUser.canLogin,
        joiningDate: newUser.joiningDate,
        createdAt: newUser.createdAt
      },
      notification: 'Welcome email sent to ' + newUser.email
    });
  } catch (error) {
    console.error('Error creating team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create team user'
    });
  }
});

// Bulk create team users
router.post('/team/bulk', authUser, requireRole('admin'), async (req, res) => {
  try {
    const users = req.body?.users || [];
    
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Users array is required'
      });
    }

    const created = [];
    const errors = [];

    for (const userData of users) {
      try {
        // Check if user exists
        const exists = await userModel.findOne({ where: { email: userData.email } });
        if (exists) {
          errors.push({ email: userData.email, error: 'User already exists' });
          continue;
        }

        const teamMetadata = {
          employeeId: userData.employeeId,
          department: userData.department,
          designation: userData.designation,
          permissions: userData.permissions || [],
          address: userData.address || {},
          emergencyContact: userData.emergencyContact || {},
          joiningDate: userData.joiningDate || new Date().toISOString().split('T')[0],
          canLogin: userData.canLogin !== undefined ? userData.canLogin : true,
          isTeam: true
        };

        const newUser = await userModel.create({
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          password: userData.password || 'TempPassword123!',
          phoneNumber: userData.phoneNumber || '',
          role: 'team',
          membershipType: 'team',
          metadata: JSON.stringify(teamMetadata),
          status: userData.isActive === false ? 'inactive' : 'active'
        });

        created.push(newUser.id);
      } catch (err) {
        errors.push({ email: userData.email, error: err.message });
      }
    }

    return res.status(201).json({
      success: true,
      message: `Created ${created.length} team users`,
      count: created.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating team users:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk create team users'
    });
  }
});

router.put('/team/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userData = req.body?.user || req.body;
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    console.log(`📝 Updating team member ID ${req.params.id}:`);
    console.log(`   Current status: ${teamUser.status}`);
    console.log(`   isActive from request: ${userData.isActive}`);

    // Parse existing metadata
    let existingMetadata = {};
    try {
      existingMetadata = teamUser.metadata ? JSON.parse(teamUser.metadata) : {};
    } catch (e) {
      existingMetadata = {};
    }

    // Update metadata (store role title in metadata, not in role field)
    const updatedMetadata = {
      ...existingMetadata,
      employeeId: userData.employeeId || existingMetadata.employeeId,
      department: userData.department || existingMetadata.department,
      designation: userData.designation || existingMetadata.designation,
      roleTitle: userData.role || existingMetadata.roleTitle || 'Team Member', // Store display role in metadata
      permissions: userData.permissions || existingMetadata.permissions,
      address: userData.address || existingMetadata.address,
      emergencyContact: userData.emergencyContact || existingMetadata.emergencyContact,
      joiningDate: userData.joiningDate || existingMetadata.joiningDate,
      canLogin: userData.canLogin !== undefined ? userData.canLogin : existingMetadata.canLogin,
      isTeam: true
    };

    // Update user fields
    const updateData = {
      firstName: userData.firstName || teamUser.firstName,
      lastName: userData.lastName || teamUser.lastName,
      email: userData.email || teamUser.email,
      phoneNumber: userData.phoneNumber || teamUser.phoneNumber,
      role: 'team', // Always keep role as 'team' for team members
      membershipType: 'team',
      metadata: JSON.stringify(updatedMetadata)
    };

    // Only update status if explicitly provided
    if (userData.isActive !== undefined) {
      updateData.status = userData.isActive === false ? 'inactive' : 'active';
    }

    // Only update password if provided
    if (userData.password && userData.password.trim() !== '') {
      updateData.password = userData.password;
    }

    await teamUser.update(updateData);

    console.log(`✅ Team member updated - New status: ${teamUser.status}`);

    return res.status(200).json({
      success: true,
      message: 'Team user updated successfully',
      user: {
        id: teamUser.id,
        firstName: teamUser.firstName,
        lastName: teamUser.lastName,
        email: teamUser.email,
        employeeId: teamUser.employeeId,
        department: teamUser.department,
        designation: teamUser.designation
      }
    });
  } catch (error) {
    console.error('Error updating team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update team user'
    });
  }
});

// Delete team user (soft delete)
router.delete('/team/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Soft delete - set status to 'inactive'
    await teamUser.update({ status: 'inactive' });

    return res.status(200).json({
      success: true,
      message: 'Team user deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete team user'
    });
  }
});

// Restore team user (undo soft delete)
router.patch('/team/:id/restore', authUser, requireRole('admin'), async (req, res) => {
  try {
    const teamUser = await userModel.findOne({ where: { id: req.params.id, role: 'team' } });

    if (!teamUser) {
      return res.status(404).json({
        success: false,
        message: 'Team user not found'
      });
    }

    // Restore - set status to 'active'  
    await teamUser.update({ status: 'active' });
    await teamUser.reload();

    return res.status(200).json({
      success: true,
      message: 'Team user restored successfully',
      user: {
        id: teamUser.id,
        email: teamUser.email,
        status: teamUser.status,
        isActive: teamUser.isActive
      }
    });
  } catch (error) {
    console.error('Error restoring team user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore team user'
    });
  }
});

// --------------------------------------------------------------------------
// Minimal stubs for updating/deleting admin users and doctors
// --------------------------------------------------------------------------

// Update user (member)
router.put('/users/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userData = req.body?.user || req.body;
    const user = await userModel.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updateData = {
      firstName: userData.firstName || user.firstName,
      lastName: userData.lastName || user.lastName,
      email: userData.email || user.email,
      phone: userData.phone || user.phone,
      dateOfBirth: userData.dateOfBirth || user.dateOfBirth,
      gender: userData.gender || user.gender,
      isActive: userData.isActive !== undefined ? userData.isActive : user.isActive,
      isVerified: userData.isVerified !== undefined ? userData.isVerified : user.isVerified
    };

    // Only update password if provided
    if (userData.password && userData.password.trim() !== '') {
      updateData.password = userData.password;
    }

    await user.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user'
    });
  }
});

// Delete user (member) - soft delete
router.delete('/users/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const user = await userModel.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete
    await user.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete user'
    });
  }
});

// Create doctor
router.post('/doctors', authUser, requireRole('admin'), async (req, res) => {
  try {
    const doctorData = req.body?.doctor || req.body;
    
    // Validate required fields
    if (!doctorData.firstName || !doctorData.lastName || !doctorData.email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
      });
    }

    // Check if user/doctor already exists
    const existingUser = await userModel.findOne({ where: { email: doctorData.email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate secure temporary password
    const temporaryPassword = welcomeEmailService.generateSecurePassword();

    // Store doctor-specific data in metadata
    const doctorMetadata = {
      specialization: doctorData.specialization,
      qualification: doctorData.qualification,
      experience: doctorData.experience,
      consultationFee: doctorData.consultationFee,
      languages: doctorData.languages || [],
      availability: doctorData.availability || {},
      isDoctor: true,
      requirePasswordChange: true  // Force password change on first login
    };

    const newDoctor = await userModel.create({
      firstName: doctorData.firstName,
      lastName: doctorData.lastName,
      email: doctorData.email,
      password: temporaryPassword,  // Will be hashed by model beforeCreate hook
      phone: doctorData.phone || '',
      phoneNumber: doctorData.phone || '',
      dateOfBirth: doctorData.dateOfBirth || '1990-01-01',  // Default date if not provided
      gender: doctorData.gender || 'Other',
      role: 'doctor',
      metadata: doctorMetadata,  // Pass as object, not JSON string
      isActive: doctorData.isActive !== undefined ? doctorData.isActive : true
    });

    // Send welcome email with credentials (async, non-blocking)
    welcomeEmailService.sendDoctorWelcomeEmail({
      email: newDoctor.email,
      firstName: newDoctor.firstName,
      lastName: newDoctor.lastName,
      specialization: doctorData.specialization
    }, temporaryPassword).catch(err => {
      console.error('Failed to send welcome email to doctor:', err);
      // Log error but don't block the response
    });

    return res.status(201).json({
      success: true,
      message: 'Doctor created successfully. Welcome email sent with login credentials.',
      doctor: {
        id: newDoctor.id,
        firstName: newDoctor.firstName,
        lastName: newDoctor.lastName,
        email: newDoctor.email,
        phone: newDoctor.phone,
        specialization: doctorData.specialization
      },
      notification: 'Welcome email sent to ' + newDoctor.email
    });
  } catch (error) {
    console.error('Error creating doctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create doctor'
    });
  }
});

// Update doctor
router.put('/doctors/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const doctorData = req.body?.doctor || req.body;
    const doctor = await userModel.findOne({ where: { id: req.params.id, role: 'doctor' } });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Parse existing metadata
    let existingMetadata = {};
    try {
      existingMetadata = doctor.metadata ? JSON.parse(doctor.metadata) : {};
    } catch (e) {
      existingMetadata = {};
    }

    // Update metadata
    const updatedMetadata = {
      ...existingMetadata,
      specialization: doctorData.specialization || existingMetadata.specialization,
      qualification: doctorData.qualification || existingMetadata.qualification,
      experience: doctorData.experience || existingMetadata.experience,
      consultationFee: doctorData.consultationFee || existingMetadata.consultationFee,
      languages: doctorData.languages || existingMetadata.languages,
      availability: doctorData.availability || existingMetadata.availability,
      isDoctor: true
    };

    const updateData = {
      firstName: doctorData.firstName || doctor.firstName,
      lastName: doctorData.lastName || doctor.lastName,
      email: doctorData.email || doctor.email,
      phone: doctorData.phone || doctor.phone,
      metadata: JSON.stringify(updatedMetadata),
      isActive: doctorData.isActive !== undefined ? doctorData.isActive : doctor.isActive
    };

    if (doctorData.password && doctorData.password.trim() !== '') {
      updateData.password = doctorData.password;
    }

    await doctor.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'Doctor updated successfully',
      doctor: {
        id: doctor.id,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        email: doctor.email
      }
    });
  } catch (error) {
    console.error('Error updating doctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update doctor'
    });
  }
});

// Delete doctor - soft delete
router.delete('/doctors/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const doctor = await userModel.findOne({ where: { id: req.params.id, role: 'doctor' } });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    await doctor.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: 'Doctor deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete doctor'
    });
  }
});

// --------------------------------------------------------------------------
// Example corporate-only API routes (requireRole('corporate'))
// These are separate from admin routes and are meant for corporate users
// logging in with role: 'corporate'. They return stub data that the
// corporate dashboard can consume.
// --------------------------------------------------------------------------

router.get('/corporate/summary', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const corporateId = req.user?.corporateId;

    if (!corporateId) {
      return res.status(400).json({
        success: false,
        message: 'Corporate ID missing on user profile'
      });
    }

    const corporate = await Corporate.findByPk(corporateId);

    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate record not found'
      });
    }

    // Derive some basic KPIs from the corporate record itself for now.
    const employeeCount = corporate.employeeCount || 0;

    // Placeholder metrics that could later be replaced with real aggregates
    const KPIs = {
      activeEmployees: employeeCount,
      totalConsultationsThisMonth: 0,
      averageSatisfactionScore: 0,
      emergencyCasesHandled: 0
    };

    return res.json({
      success: true,
      corporateId,
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        contactPerson: corporate.contactPerson,
        email: corporate.email,
        phoneNumber: corporate.phoneNumber,
        employeeCount: corporate.employeeCount,
        industry: corporate.industry,
        status: corporate.status,
        packageType: corporate.packageType,
        billingCycle: corporate.billingCycle,
        isActive: corporate.isActive
      },
      KPIs,
      recentActivities: []
    });
  } catch (error) {
    console.error('Corporate summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load corporate summary'
    });
  }
});

// WhatsApp integration endpoints
router.get('/whatsapp/stats', authUser, requireRole('admin'), getWhatsAppStats);
router.get('/whatsapp/templates', authUser, requireRole('admin'), getWhatsAppTemplates);
router.post('/whatsapp/templates', authUser, requireRole('admin'), createWhatsAppTemplate);
router.put('/whatsapp/templates/:id', authUser, requireRole('admin'), updateWhatsAppTemplate);
router.delete('/whatsapp/templates/:id', authUser, requireRole('admin'), deleteWhatsAppTemplate);
router.get('/whatsapp/campaigns', authUser, requireRole('admin'), getWhatsAppCampaigns);
router.post('/whatsapp/campaigns', authUser, requireRole('admin'), createWhatsAppCampaign);
router.put('/whatsapp/campaigns/:id/status', authUser, requireRole('admin'), updateWhatsAppCampaignStatus);
router.get('/whatsapp/messages', authUser, requireRole('admin'), getWhatsAppMessages);
router.post('/whatsapp/send', authUser, requireRole('admin'), sendWhatsAppMessage);
router.post('/whatsapp/webhook', verifyWhatsAppWebhook);
router.get('/whatsapp/webhook', getWhatsAppWebhook);


// Analytics endpoints
router.get('/analytics/payments', authUser, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      totalRevenue: 1250000,
      pendingPayments: 85000,
      collectedThisMonth: 450000,
      paymentsByMethod: {
        card: 650000,
        upi: 400000,
        cash: 150000,
        insurance: 50000
      },
      recentPayments: []
    }
  });
});

router.get('/analytics/accounts-receivable', authUser, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      totalReceivable: 85000,
      overdue: 25000,
      current: 60000,
      aging: {
        '0-30': 40000,
        '31-60': 20000,
        '61-90': 15000,
        '90+': 10000
      }
    }
  });
});


// ============================================================================
// MEMBERSHIP VALIDATION MANAGEMENT
// ============================================================================

/**
 * POST /api/admin/membership/sync-all
 * Manually trigger membership status sync for all users
 */
router.post('/membership/sync-all', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { syncAllUsersStatus } = await import('../middleware/membership.middleware.js');
    
    console.log('🔄 Admin triggered full membership sync...');
    const results = await syncAllUsersStatus();
    
    return res.json({
      success: true,
      message: 'Membership status sync completed',
      data: results
    });
  } catch (error) {
    console.error('Membership sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync membership status',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/membership/sync-user/:userId
 * Manually trigger membership status sync for specific user
 */
router.post('/membership/sync-user/:userId', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { syncUserStatusWithMembership } = await import('../middleware/membership.middleware.js');
    
    const result = await syncUserStatusWithMembership(parseInt(userId));
    
    if (result.success) {
      return res.json({
        success: true,
        message: `User ${userId} membership status synced`,
        data: {
          userId: userId,
          status: result.status,
          hasActivePlan: result.hasActivePlan
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to sync user membership',
        error: result.error
      });
    }
  } catch (error) {
    console.error('User membership sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync user membership',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/membership/expiring
 * Get list of users with expiring memberships
 */
router.get('/membership/expiring', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
    const { Op } = await import('sequelize');
    
    const days = parseInt(req.query.days) || 7;
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);
    
    const expiringPlans = await UserPlan.findAll({
      where: {
        status: 'active',
        endDate: {
          [Op.gte]: today.toISOString().split('T')[0],
          [Op.lte]: futureDate.toISOString().split('T')[0]
        }
      },
      order: [['endDate', 'ASC']]
    });

    // Get user details for each plan
    const userModel = await import('../models/user.model.intelligent.js');
    const usersWithExpiringPlans = await Promise.all(
      expiringPlans.map(async (plan) => {
        const user = await userModel.default.findByPk(plan.userId, {
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'status']
        });
        
        const daysRemaining = Math.ceil(
          (new Date(plan.endDate) - today) / (1000 * 60 * 60 * 24)
        );
        
        return {
          userId: plan.userId,
          user: user ? {
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            phone: user.phoneNumber,
            status: user.status
          } : null,
          membershipPlanId: plan.membershipPlanId,
          startDate: plan.startDate,
          endDate: plan.endDate,
          daysRemaining: daysRemaining,
          autoRenew: plan.autoRenew,
          planStatus: plan.status
        };
      })
    );

    return res.json({
      success: true,
      data: {
        total: usersWithExpiringPlans.length,
        daysFilter: days,
        expiringMemberships: usersWithExpiringPlans
      }
    });
  } catch (error) {
    console.error('Get expiring memberships error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch expiring memberships',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/membership/inactive-users
 * Get list of users with inactive status due to no membership
 */
router.get('/membership/inactive-users', authUser, requireRole('admin'), async (req, res) => {
  try {
    const userModel = await import('../models/user.model.intelligent.js');
    const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
    
    // Get all inactive users
    const inactiveUsers = await userModel.default.findAll({
      where: {
        status: 'inactive',
        isAdmin: false
      },
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'createdAt', 'status']
    });

    // Check if they have any membership history
    const usersWithMembershipInfo = await Promise.all(
      inactiveUsers.map(async (user) => {
        const latestPlan = await UserPlan.findOne({
          where: { userId: user.id },
          order: [['endDate', 'DESC']]
        });
        
        return {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phoneNumber,
          status: user.status,
          joinedDate: user.createdAt,
          lastMembership: latestPlan ? {
            planId: latestPlan.membershipPlanId,
            endDate: latestPlan.endDate,
            status: latestPlan.status,
            daysExpired: Math.floor(
              (new Date() - new Date(latestPlan.endDate)) / (1000 * 60 * 60 * 24)
            )
          } : null,
          hasNeverHadMembership: !latestPlan
        };
      })
    );

    return res.json({
      success: true,
      data: {
        total: usersWithMembershipInfo.length,
        users: usersWithMembershipInfo
      }
    });
  } catch (error) {
    console.error('Get inactive users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch inactive users',
      error: error.message
    });
  }
});

// --------------------------------------------------------------------------
// Insurance companies / Insurers (Admin managed)
// --------------------------------------------------------------------------

router.get('/insurers', authUser, requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const insurers = await InsuranceCompany.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });

    return res.json({ success: true, insurers });
  } catch (error) {
    console.error('Failed to fetch insurers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load insurers',
      error: error.message
    });
  }
});

// System settings endpoints
router.get('/settings/system', authUser, requireRole('admin'), async (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        siteName: process.env.SITE_NAME || 'Mediqzy',
        siteUrl: process.env.SITE_URL || 'https://app.mediqzy.com',
        emailFrom: process.env.SENDGRID_FROM_EMAIL || 'noreply@mediqzy.com',
        timezone: process.env.TZ || 'Asia/Kolkata',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
        features: {
          whatsapp: !!process.env.TWILIO_WHATSAPP_NUMBER,
          sms: !!process.env.TWILIO_ACCOUNT_SID,
          email: !!process.env.SENDGRID_API_KEY,
          videoCall: !!process.env.AGORA_APP_ID,
          aiChat: !!process.env.SIB_API_URL
        }
      }
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings',
      error: error.message
    });
  }
});

router.post('/settings/system', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating system settings:', settings);
    res.json({
      success: true,
      message: 'System settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings',
      error: error.message
    });
  }
});

router.post('/settings/general', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating general settings:', settings);
    res.json({
      success: true,
      message: 'General settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating general settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update general settings',
      error: error.message
    });
  }
});

router.post('/settings/api', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating API settings:', settings);
    res.json({
      success: true,
      message: 'API settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating API settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update API settings',
      error: error.message
    });
  }
});

router.post('/settings/security', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating security settings:', settings);
    res.json({
      success: true,
      message: 'Security settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update security settings',
      error: error.message
    });
  }
});

router.post('/settings/notifications', authUser, requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body;
    console.log('Updating notification settings:', settings);
    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings',
      error: error.message
    });
  }
});

router.post('/settings/api/regenerate', authUser, requireRole('admin'), async (req, res) => {
  try {
    const newApiKey = `medi_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    console.log('Generated new API key');
    res.json({
      success: true,
      message: 'API key regenerated successfully',
      apiKey: newApiKey
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key',
      error: error.message
    });
  }
});

router.post('/insurers', authUser, requireRole('admin'), async (req, res) => {
  try {
    const payload = req.body?.insurer || req.body || {};
    const {
      insurerName,
      registrationNumber,
      email,
      phoneNumber,
      contactPerson,
      city,
      state,
      insuranceTypes = [],
      claimSettlementRatio,
      networkHospitals,
      status = 'Active',
      joinedDate,
      website,
      companyCode
    } = payload;

    if (!insurerName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Insurer name and email are required'
      });
    }

    // Prevent duplicates
    const existing = await InsuranceCompany.findOne({
      where: { email: email.toLowerCase() }
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An insurer with this email already exists'
      });
    }

    const normalizedPolicies = Array.isArray(insuranceTypes)
      ? insuranceTypes.map((t) => String(t).toLowerCase().replace(/\s+/g, '_')).filter(Boolean)
      : String(insuranceTypes || '')
          .split(',')
          .map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'))
          .filter(Boolean);

    const passwordToUse = payload.password || 'Insurer123';

    const insurer = await InsuranceCompany.create({
      companyName: insurerName,
      companyCode: companyCode || registrationNumber || insurerName?.slice(0, 12)?.toUpperCase(),
      email: email.toLowerCase(),
      password: passwordToUse,
      phone: phoneNumber,
      website: website || '',
      address: { city: city || '', state: state || '' },
      irdaiRegistrationNumber: registrationNumber,
      contactPerson: { name: contactPerson || '', phone: phoneNumber || '', city: city || '', state: state || '' },
      supportedPolicyTypes: normalizedPolicies.length ? normalizedPolicies : undefined,
      networkHospitals: typeof networkHospitals === 'number' ? { count: networkHospitals } : networkHospitals || [],
      isActive: status !== 'Inactive',
      isVerified: status === 'Active',
      description: payload.description || '',
      metadata: {
        claimSettlementRatio: claimSettlementRatio || null,
        joinedDate: joinedDate || null
      }
    });

    return res.status(201).json({ success: true, insurer });
  } catch (error) {
    console.error('Failed to create insurer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create insurer',
      error: error.message
    });
  }
});

// ─── Medicine Price Management ───

/**
 * PUT /admin/medicines/prices
 * Bulk update medicine MRP prices
 * Body: { updates: [{ id: "CIMS5001", mrp: 25.50 }, ...] }
 */
router.put('/medicines/prices', authUser, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'updates array is required' });
    }
    if (updates.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 updates per request' });
    }

    // Validate each entry
    for (const u of updates) {
      if (!u.id || typeof u.id !== 'string') {
        return res.status(400).json({ success: false, message: `Invalid id: ${u.id}` });
      }
      if (typeof u.mrp !== 'number' || u.mrp < 0 || u.mrp > 100000) {
        return res.status(400).json({ success: false, message: `Invalid mrp for ${u.id}: ${u.mrp}` });
      }
    }

    const result = cimsService.updatePrices(updates);
    return res.json({
      success: true,
      updated: result.updated,
      notFound: result.notFound,
      message: `${result.updated} prices updated${result.notFound.length ? `, ${result.notFound.length} IDs not found` : ''}`
    });
  } catch (error) {
    console.error('Medicine price update failed:', error);
    return res.status(500).json({ success: false, message: 'Price update failed' });
  }
});

/**
 * GET /admin/medicines/stats
 * Get medicine database statistics
 */
router.get('/medicines/stats', authUser, requireRole('admin', 'superadmin'), (req, res) => {
  try {
    const stats = cimsService.getStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

/**
 * POST /admin/medicines/reload
 * Reload medicine database from files (after adding new data files)
 */
router.post('/medicines/reload', authUser, requireRole('admin', 'superadmin'), (req, res) => {
  try {
    const result = cimsService.reloadDatabase();
    return res.json({
      success: true,
      message: `Database reloaded: ${result.total} medicines`,
      total: result.total
    });
  } catch (error) {
    console.error('Medicine database reload failed:', error);
    return res.status(500).json({ success: false, message: 'Reload failed' });
  }
});

// ── Automation / Cron Jobs Dashboard ─────────────────────────────────────────

/**
 * GET /api/admin/automation/jobs
 * Returns live status of all registered cron jobs.
 */
router.get('/automation/jobs', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { getStatus } = await import('../utils/cronRegistry.js');
    return res.json({ success: true, data: getStatus(), retrievedAt: new Date().toISOString() });
  } catch (err) {
    console.error('automation/jobs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch automation status' });
  }
});

/**
 * GET /api/admin/automation/jobs/:key/logs
 * Returns recent execution log for a single task.
 */
router.get('/automation/leases', authUser, requireRole('admin'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listCronLeases() });
  } catch (err) {
    console.error('automation/leases error:', err);
    return res.status(503).json({ success: false, message: 'Lease status is unavailable' });
  }
});

router.get('/automation/jobs/:key/logs', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { getTaskLogs } = await import('../utils/cronRegistry.js');
    const logs = getTaskLogs(req.params.key);
    return res.json({ success: true, key: req.params.key, logs });
  } catch (err) {
    console.error('automation/jobs/:key/logs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch task logs' });
  }
});

/**
 * POST /api/admin/automation/jobs/:key/trigger
 * Manually trigger a task (runs its function immediately).
 */
router.post('/automation/jobs/:key/trigger', authUser, requireRole('admin'), async (req, res) => {
  return res.status(501).json({ success: false, message: 'Manual trigger not yet implemented for this task' });
});

/**
 * GET /api/admin/activity-logs
 * Returns recent activity logs from audit_logs table with filtering support.
 */
router.get('/activity-logs', authUser, requireRole('admin'), async (req, res) => {
  try {
    const {
      limit = 500,
      page = 1,
      search,
      from,
      to,
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 500, 1000);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const replacements = {};

    if (search) {
      conditions.push(`(user_email ILIKE :search OR endpoint ILIKE :search OR action ILIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (from) {
      conditions.push(`created_at >= :from`);
      replacements.from = new Date(from).toISOString();
    }
    if (to) {
      conditions.push(`created_at <= :to`);
      replacements.to = new Date(`${to}T23:59:59`).toISOString();
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        id, user_id, user_type, user_email, action, resource_type, resource_id,
        method, endpoint, status, status_code, error_message, ip_address, user_agent,
        created_at, timestamp
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
    `;
    replacements.limit = limitNum;
    replacements.offset = offset;

    const rows = await postgresSequelize.query(sql, {
      replacements,
      type: postgresSequelize.QueryTypes.SELECT,
    });

    const logs = rows.map(row => {
      const actionRaw = (row.action || '').toUpperCase();
      let actionMapped = 'view';
      if (actionRaw === 'CREATE') actionMapped = 'create';
      else if (actionRaw === 'UPDATE' || actionRaw === 'PATCH') actionMapped = 'update';
      else if (actionRaw === 'DELETE') actionMapped = 'delete';
      else if (actionRaw.startsWith('LOGIN')) actionMapped = 'login';
      else if (actionRaw === 'LOGOUT') actionMapped = 'logout';
      else if (actionRaw === 'READ' || actionRaw === 'GET') actionMapped = 'view';
      else if (actionRaw === 'EXPORT') actionMapped = 'export';
      else if (actionRaw === 'IMPORT') actionMapped = 'import';

      let resultMapped = 'info';
      if (row.status_code) {
        if (row.status_code >= 200 && row.status_code < 300) resultMapped = 'success';
        else if (row.status_code >= 400) resultMapped = 'failure';
      } else if (row.status) {
        const s = row.status.toUpperCase();
        if (s === 'SUCCESS' || s === 'COMPLETED') resultMapped = 'success';
        else if (s === 'FAILED' || s === 'ERROR') resultMapped = 'failure';
        else if (s === 'WARNING') resultMapped = 'warning';
      }
      if (actionRaw === 'LOGIN_FAILED') resultMapped = 'failure';

      const userTypeLower = (row.user_type || 'system').toLowerCase();
      const validTypes = ['user', 'doctor', 'admin', 'system'];
      const userTypeMapped = validTypes.includes(userTypeLower) ? userTypeLower : 'system';

      const resource = (row.resource_type || 'system').toLowerCase();
      const activity = `${actionMapped.charAt(0).toUpperCase() + actionMapped.slice(1)} ${resource}`.trim();
      let details = row.error_message || `${row.method || ''} ${row.endpoint || ''}`.trim();
      if (!details) details = `${row.action || 'Unknown'} on ${resource}`;

      return {
        id: row.id,
        timestamp: row.created_at || row.timestamp,
        userId: row.user_id || row.user_email,
        userType: userTypeMapped,
        activity,
        action: actionMapped,
        resource,
        resourceId: row.resource_id,
        result: resultMapped,
        details,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        metadata: {
          method: row.method,
          endpoint: row.endpoint,
          statusCode: row.status_code,
          userEmail: row.user_email,
        },
      };
    });

    return res.json({ success: true, logs });
  } catch (err) {
    console.error('[Admin] activity-logs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
  }
});

/**
 * GET /api/admin/activity/export
 * Export activity logs as CSV.
 */
router.get('/activity/export', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { search, from, to } = req.query;

    const conditions = [];
    const replacements = {};

    if (search) {
      conditions.push(`(user_email ILIKE :search OR endpoint ILIKE :search OR action ILIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (from) {
      conditions.push(`created_at >= :from`);
      replacements.from = new Date(from).toISOString();
    }
    if (to) {
      conditions.push(`created_at <= :to`);
      replacements.to = new Date(`${to}T23:59:59`).toISOString();
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    replacements.limit = 5000;

    const rows = await postgresSequelize.query(
      `SELECT id, user_email, user_type, action, resource_type, method, endpoint, status_code, ip_address, created_at, error_message
       FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT :limit`,
      { replacements, type: postgresSequelize.QueryTypes.SELECT }
    );

    const csvHeader = 'Timestamp,User Email,User Type,Action,Resource,Method,Endpoint,Status Code,IP Address,Details\n';
    const csvRows = rows.map(r =>
      [
        r.created_at,
        r.user_email || '',
        r.user_type || '',
        r.action || '',
        r.resource_type || '',
        r.method || '',
        r.endpoint || '',
        r.status_code || '',
        r.ip_address || '',
        `"${(r.error_message || '').replace(/"/g, '""')}"`,
      ].join(',')
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="activity-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csvHeader + csvRows.join('\n'));
  } catch (err) {
    console.error('[Admin] activity/export error:', err);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
});


// ═══════════════════════════════════════════════════════════
// THREAT INTELLIGENCE — IP origin tracking & intrusion data
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/admin/security/threats
 * Paginated threat event log — all enriched intrusion attempts
 * Query params: page, limit, threatType, action (blocked|allowed), country (2-letter code), ip
 */
router.get('/security/threats', authUser, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 50, threatType, action, country, ip } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 200);
    const result = await getThreatEvents({
      page: parseInt(page) || 1,
      limit: safeLimit,
      threatType,
      action,
      country,
      ip,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Admin Threats] getThreatEvents error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch threat events' });
  }
});

/**
 * GET /api/admin/security/threats/stats
 * Aggregated stats: by threat type, by blocked country, by action
 */
router.get('/security/threats/stats', authUser, requireRole('admin'), async (req, res) => {
  try {
    const stats = await getThreatStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[Admin Threats] getThreatStats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch threat stats' });
  }
});

/**
 * GET /api/admin/security/threats/lookup/:ip
 * On-demand IP intelligence — fresh lookup (bypasses cache)
 * Returns: country, city, ISP, org, ASN, proxy/VPN/Tor/hosting flags
 */
router.get('/security/threats/lookup/:ip', authUser, requireRole('admin'), async (req, res) => {
  try {
    const ip = req.params.ip;
    if (!/^[\d.:a-fA-F]+$/.test(ip)) {
      return res.status(400).json({ success: false, message: 'Invalid IP address format' });
    }
    const intel = await lookupIP(ip);
    return res.json({ success: true, data: intel });
  } catch (err) {
    console.error('[Admin Threats] lookupIP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to lookup IP' });
  }
});


/**
 * GET /api/admin/security/blocked-ips
 * List all currently blocked IPs (auto-blocked or manually blocked)
 */
router.get('/security/blocked-ips', authUser, requireRole('admin'), async (req, res) => {
  try {
    const blocked = await listBlockedIPs();
    return res.json({ success: true, total: blocked.length, data: blocked });
  } catch (err) {
    console.error('[Admin Security] listBlockedIPs error:', err);
    return res.status(500).json({ success: false, message: 'Failed to list blocked IPs' });
  }
});

/**
 * GET /api/admin/security/ip-stats/:ip
 * Get failure counters for a specific IP
 */
router.get('/security/ip-stats/:ip', authUser, requireRole('admin'), async (req, res) => {
  try {
    const ip = req.params.ip;
    // Basic IP format validation
    if (!/^[\d.:a-fA-F]+$/.test(ip)) {
      return res.status(400).json({ success: false, message: 'Invalid IP address format' });
    }
    const stats = await getIPStats(ip);
    return res.json({ success: true, ip, stats });
  } catch (err) {
    console.error('[Admin Security] getIPStats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to get IP stats' });
  }
});

/**
 * POST /api/admin/security/block-ip
 * Manually block an IP address
 * Body: { ip, durationHours, reason }
 */
router.post(
  '/security/block-ip',
  authUser,
  requireRole('admin'),
  [
    body('ip').notEmpty().withMessage('IP address is required')
      .matches(/^[\d.:a-fA-F]+$/).withMessage('Invalid IP address format'),
    body('durationHours').optional().isInt({ min: 1, max: 720 }).withMessage('Duration must be 1–720 hours'),
    body('reason').optional().isString().isLength({ max: 200 }),
  ],
  async (req, res) => {
    try {
      const { ip, durationHours = 24, reason = 'manual block by admin' } = req.body;
      await blockIP(ip, durationHours * 3600, reason);
      console.log(`[Admin Security] IP ${ip} manually blocked for ${durationHours}h by admin`);
      return res.json({
        success: true,
        message: `IP ${ip} has been blocked for ${durationHours} hour(s)`,
        ip,
        durationHours,
      });
    } catch (err) {
      console.error('[Admin Security] blockIP error:', err);
      return res.status(500).json({ success: false, message: 'Failed to block IP' });
    }
  }
);

/**
 * DELETE /api/admin/security/blocked-ips/:ip
 * Unblock an IP address
 */
router.delete('/security/blocked-ips/:ip', authUser, requireRole('admin'), async (req, res) => {
  try {
    const ip = req.params.ip;
    if (!/^[\d.:a-fA-F]+$/.test(ip)) {
      return res.status(400).json({ success: false, message: 'Invalid IP address format' });
    }
    await unblockIP(ip);
    return res.json({ success: true, message: `IP ${ip} has been unblocked` });
  } catch (err) {
    console.error('[Admin Security] unblockIP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to unblock IP' });
  }
});

// Team member privilege management lives in the Team portal itself:
// see GET/PATCH /api/team/users and PUT /api/team/privileges/:id in team.route.js.

// ─── Corporate Employee QC ───────────────────────────────────────────────────
import corporateEmployeeQcService from '../services/corporate-employee-qc.service.js';

/**
 * POST /api/admin/corporate-employee-qc/run
 * Manually trigger the QC sweep (admin/team only)
 */
router.post('/corporate-employee-qc/run', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const result = await corporateEmployeeQcService.runNow();
    return res.json({ success: true, message: 'QC sweep completed', result });
  } catch (err) {
    console.error('[QC] manual run failed:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/corporate-employee-qc/logs?limit=20
 * Fetch recent QC run logs
 */
router.get('/corporate-employee-qc/logs', authUser, requireRole(['admin', 'team']), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const { rows } = await postgresSequelize.query(
      `SELECT id, run_at, duration_ms, corporates_scanned, checks_run,
              issues_found, issues_fixed, issues_failed, errors
       FROM corporate_employee_qc_log
       ORDER BY run_at DESC
       LIMIT :limit`,
      { replacements: { limit }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return res.json({ success: true, logs: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Admin MFA enrollment/confirm/disable - reuses the same generic TOTP engine
// and router factory the corporate-login MFA already uses, under its own
// identity namespace (adminMfaIdentity) so an admin's enrollment never
// collides with a corporate account that happens to share a numeric id.
// Exposed at /api/admin/security/mfa[...] (this router is mounted at /api/admin).
router.use(createCorporateSecurityRouter({
  authenticate: [authUser, requireRole('admin')],
  limiter: authLimiter,
  mfa: mfaStepUp,
  identity: adminMfaIdentity,
  passwordMatches: async (user, password) => {
    const row = await userModel.findByPk(user.id);
    return !!row?.password && bcrypt.compare(password, row.password);
  },
  tokenFor: async (req, proof) => {
    const payload = {
      id: req.user.id, email: req.user.email, role: 'admin', userType: 'admin', isAdmin: true, ...proof,
    };
    const { accessToken, refreshToken } = await issueAdminTokenPair(payload, getClientIp(req));
    return { token: accessToken, refreshToken };
  },
}));

// Admin trusted-IP binding management. Empty list = unrestricted (opt-in) -
// adding the first entry is what turns IP enforcement on at login, see
// adminLogin in admin.controller.js. requireRole('admin') here (not a
// self-service corporate-style route) since this guards the platform's own
// highest-privilege account, not a per-tenant setting.
router.get('/security/trusted-ips', authUser, requireRole('admin'), async (req, res) => {
  try {
    const ips = await listTrustedIps(req.user.id);
    return res.json({ success: true, data: { ips, currentIp: getClientIp(req) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/security/trusted-ips', authUser, requireRole('admin'),
  [body('ipOrCidr').isString().trim().notEmpty(), body('label').optional().isString().isLength({ max: 100 })],
  async (req, res) => {
    try {
      const row = await addTrustedIp(req.user.id, req.body.ipOrCidr, req.body.label, req.user.id);
      return res.status(201).json({ success: true, data: row });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

router.delete('/security/trusted-ips/:id', authUser, requireRole('admin'), async (req, res) => {
  try {
    const removed = await removeTrustedIp(req.user.id, Number(req.params.id));
    if (!removed) return res.status(404).json({ success: false, message: 'Trusted IP entry not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
