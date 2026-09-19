/**
 * Unified Hospital Staff Routes for Mediczy Mobile App
 * Single mobile app endpoints for all hospital staff roles
 * 
 * All hospital staff from all hospitals use these endpoints
 * Hospital is identified by hospital_id, hospital_slug, or hospital_domain in request body
 */

import express from 'express';
import { body, query } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import hospitalGl from '../services/hospital-gl.service.js';
import {
  doctorSignup,
  doctorLogin,
  nurseSignup,
  nurseLogin,
  assistantSignup,
  assistantLogin,
  insuranceCoordinatorSignup,
  insuranceCoordinatorLogin,
  accountsStaffSignup,
  accountsStaffLogin,
  mrdStaffSignup,
  mrdStaffLogin,
  insuranceDeskSignup,
  insuranceDeskLogin,
  hrStaffSignup,
  hrStaffLogin,
  itEdpStaffSignup,
  itEdpStaffLogin,
  otStaffSignup,
  otStaffLogin,
  icuStaffSignup,
  icuStaffLogin,
  qualityStaffSignup,
  qualityStaffLogin,
  securityStaffSignup,
  securityStaffLogin,
  searchHospitals,
  getStaffProfile,
  updateStaffProfile
} from '../controller/unified-hospital-staff.controller.js';
import {
  createITEDPAsset,
  createITEDPAssetLabel,
  createITEDPNetworkAdmin,
  createITEDPTicket,
  createITEDPUserProvision,
  deleteITEDPAsset,
  deleteITEDPAssetLabel,
  deleteITEDPNetworkAdmin,
  deleteITEDPTicket,
  deleteITEDPUserProvision,
  getITEDPAccess,
  getITEDPAssets,
  getITEDPBackups,
  getITEDPNetwork,
  getITEDPPortalData,
  getITEDPReports,
  getITEDPSecurity,
  getITEDPSettings,
  getITEDPSupport,
  getITEDPSystems,
  getITEDPTickets,
  getITEDPUsers,
  updateITEDPAsset,
  updateITEDPAssetLabel,
  updateITEDPNetworkAdmin,
  updateITEDPTicket,
  updateITEDPUserProvision,
} from '../controller/it-edp-portal.controller.js';
import {
  createQualityIncident,
  createQualityPolicy,
  getQualityAccreditation,
  getQualityAssessments,
  getQualityAuditReports,
  getQualityFeedback,
  getQualityIncidents,
  getQualityKpis,
  getQualityNabhCompliance,
  getQualityNabhTemplates,
  getQualityPolicies,
  getQualityPortalData,
  getQualityReports,
  getQualitySettings,
  getQualitySupport,
  updateQualityIncident,
  updateQualityPolicy,
} from '../controller/quality-portal.controller.js';
import {
  createSecurityIncident,
  createSecurityVisitor,
  getSecurityAccessLogsList,
  getSecurityAccessPoints,
  getSecurityAlerts,
  getSecurityCCTV,
  getSecurityGuardDuty,
  getSecurityIncidentsList,
  getSecurityPortalData,
  getSecurityReports,
  getSecuritySettings,
  getSecurityStaffLog,
  getSecuritySupport,
  getSecurityVisitorsList,
  updateSecurityIncident,
  updateSecurityVisitor,
} from '../controller/security-portal.controller.js';

const router = express.Router();

/**
 * Middleware to ensure user is hospital staff
 */
const requireHospitalStaff = (req, res, next) => {
  const validRoles = ['doctor', 'nurse', 'doctor_assistant', 'insurance_coordinator',
    'accounts_staff', 'mrd_staff', 'insurance_desk_staff', 'hr_staff',
    'it_edp_staff', 'ot_staff', 'icu_staff', 'quality_staff', 'security_staff'];
  
  if (!req.user || !validRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only hospital staff can access this resource'
    });
  }
  next();
};

const requireQualityStaff = (req, res, next) => {
  if (!req.user || req.user.role !== 'quality_staff') {
    return res.status(403).json({
      success: false,
      message: 'Only quality staff can access this resource'
    });
  }
  next();
};

const requireItEdpStaff = (req, res, next) => {
  if (!req.user || req.user.role !== 'it_edp_staff') {
    return res.status(403).json({
      success: false,
      message: 'Only IT/EDP staff can access this resource'
    });
  }
  next();
};

const requireSecurityStaff = (req, res, next) => {
  if (!req.user || req.user.role !== 'security_staff') {
    return res.status(403).json({
      success: false,
      message: 'Only security staff can access this resource'
    });
  }
  next();
};

const requireAccountsStaff = (req, res, next) => {
  if (!req.user || !['accounts_staff', 'admin', 'hospital_admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only accounts staff can access this resource'
    });
  }
  next();
};

const getOrgIdForAccounts = (req) => Number(req.user?.organization_id || req.user?.tenant_id || req.user?.hospital_id || 0) || null;

// ==================== DOCTOR ENDPOINTS ====================

/**
 * POST /api/hospital/staff/doctor/signup
 * Doctor signup - public endpoint
 */
router.post(
  '/doctor/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('specialization').optional().trim(),
    body('license_number').optional().trim(),
    body('years_of_experience').optional().isInt({ min: 0 }),
    body('qualifications').optional().isArray(),
    body('department').optional().trim()
  ],
  doctorSignup
);

/**
 * POST /api/hospital/staff/doctor/login
 * Doctor login - public endpoint
 */
router.post(
  '/doctor/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  doctorLogin
);

// ==================== NURSE ENDPOINTS ====================

/**
 * POST /api/hospital/staff/nurse/signup
 * Nurse signup - public endpoint
 */
router.post(
  '/nurse/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('license_number').optional().trim(),
    body('department').optional().trim(),
    body('shift_type').optional().isIn(['day', 'night', 'rotating'])
  ],
  nurseSignup
);

/**
 * POST /api/hospital/staff/nurse/login
 * Nurse login - public endpoint
 */
router.post(
  '/nurse/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  nurseLogin
);

// ==================== DOCTOR ASSISTANT ENDPOINTS ====================

/**
 * POST /api/hospital/staff/assistant/signup
 * Doctor assistant signup - public endpoint
 */
router.post(
  '/assistant/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('assigned_doctor_id').optional().isInt(),
    body('department').optional().trim()
  ],
  assistantSignup
);

/**
 * POST /api/hospital/staff/assistant/login
 * Doctor assistant login - public endpoint
 */
router.post(
  '/assistant/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  assistantLogin
);

// ==================== INSURANCE COORDINATOR ENDPOINTS ====================

/**
 * POST /api/hospital/staff/insurance-coordinator/signup
 * Insurance coordinator signup - public endpoint
 */
router.post(
  '/insurance-coordinator/signup',
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
    body('phone').optional().trim(),
    body('department').optional().trim(),
    body('certification').optional().trim()
  ],
  insuranceCoordinatorSignup
);

/**
 * POST /api/hospital/staff/insurance-coordinator/login
 * Insurance coordinator login - public endpoint
 */
router.post(
  '/insurance-coordinator/login',
  authLimiter,
  [
    body('hospital_id').optional().trim(),
    body('hospital_slug').optional().trim(),
    body('hospital_domain').optional().trim(),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  insuranceCoordinatorLogin
);

// ==================== DEPARTMENT STAFF ENDPOINTS ====================

const deptBodyValidation = [
  body('hospital_id').optional().trim(),
  body('hospital_slug').optional().trim(),
  body('hospital_domain').optional().trim(),
  body('email').isEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('phone').optional().trim(),
  body('department').optional().trim()
];

const deptLoginValidation = [
  body('hospital_id').optional().trim(),
  body('hospital_slug').optional().trim(),
  body('hospital_domain').optional().trim(),
  body('email').isEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Accounts
router.post('/accounts/signup', deptBodyValidation, accountsStaffSignup);
router.post('/accounts/login', authLimiter, deptLoginValidation, accountsStaffLogin);

// Added 2026-09-18: the audit found the Accounts portal had signup/login
// only, no data endpoints — hospital-gl.service.js's GL logic is real and
// already used correctly by billing, it just had no Accounts-facing API.
// Additive only; does not touch signup/login above.
router.get('/accounts/portal-data', authUser, requireAccountsStaff, async (req, res) => {
  try {
    const orgId = getOrgIdForAccounts(req);
    if (!orgId) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const summary = await hospitalGl.getGlSummary(orgId, req.query);
    res.json({ success: true, data: summary });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/accounts/gl-journal', authUser, requireAccountsStaff, async (req, res) => {
  try {
    const orgId = getOrgIdForAccounts(req);
    if (!orgId) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const journal = await hospitalGl.exportGlJournal(orgId, req.query);
    res.json({ success: true, data: journal });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// MRD
router.post('/mrd/signup', deptBodyValidation, mrdStaffSignup);
router.post('/mrd/login', authLimiter, deptLoginValidation, mrdStaffLogin);

// Insurance Desk
router.post('/insurance-desk/signup', deptBodyValidation, insuranceDeskSignup);
router.post('/insurance-desk/login', authLimiter, deptLoginValidation, insuranceDeskLogin);

// HR
router.post('/hr/signup', deptBodyValidation, hrStaffSignup);
router.post('/hr/login', authLimiter, deptLoginValidation, hrStaffLogin);

// IT/EDP
router.post('/it-edp/signup', deptBodyValidation, itEdpStaffSignup);
router.post('/it-edp/login', authLimiter, deptLoginValidation, itEdpStaffLogin);
router.get('/it-edp/portal-data', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPPortalData);
router.get('/it-edp/tickets', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPTickets);
router.post('/it-edp/tickets', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('department').optional().trim(),
  body('priority').optional().trim(),
  body('status').optional().trim(),
  body('owner').optional().trim(),
  body('aging').optional().trim(),
  body('note').optional().trim(),
], createITEDPTicket);
router.patch('/it-edp/tickets/:id', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('title').optional().trim(),
  body('department').optional().trim(),
  body('priority').optional().trim(),
  body('status').optional().trim(),
  body('owner').optional().trim(),
  body('aging').optional().trim(),
  body('note').optional().trim(),
], updateITEDPTicket);
router.delete('/it-edp/tickets/:id', authUser, requireHospitalStaff, requireItEdpStaff, deleteITEDPTicket);
router.get('/it-edp/users', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPUsers);
router.post('/it-edp/users', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('name').trim().notEmpty().withMessage('name is required'),
  body('department').optional().trim(),
  body('role').optional().trim(),
  body('state').optional().trim(),
  body('access').optional().trim(),
  body('lastSeen').optional().trim(),
  body('note').optional().trim(),
], createITEDPUserProvision);
router.patch('/it-edp/users/:id', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('name').optional().trim(),
  body('department').optional().trim(),
  body('role').optional().trim(),
  body('state').optional().trim(),
  body('access').optional().trim(),
  body('lastSeen').optional().trim(),
  body('note').optional().trim(),
], updateITEDPUserProvision);
router.delete('/it-edp/users/:id', authUser, requireHospitalStaff, requireItEdpStaff, deleteITEDPUserProvision);
router.get('/it-edp/assets', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPAssets);
router.post('/it-edp/assets', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('asset').trim().notEmpty().withMessage('asset is required'),
  body('assetTag').optional().trim(),
  body('type').optional().trim(),
  body('location').optional().trim(),
  body('lifecycle').optional().trim(),
  body('labelStatus').optional().trim(),
  body('owner').optional().trim(),
  body('note').optional().trim(),
], createITEDPAsset);
router.patch('/it-edp/assets/:id', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('asset').optional().trim(),
  body('type').optional().trim(),
  body('location').optional().trim(),
  body('lifecycle').optional().trim(),
  body('labelStatus').optional().trim(),
  body('owner').optional().trim(),
  body('note').optional().trim(),
], updateITEDPAsset);
router.delete('/it-edp/assets/:id', authUser, requireHospitalStaff, requireItEdpStaff, deleteITEDPAsset);
router.get('/it-edp/systems', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPSystems);
router.get('/it-edp/network', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPNetwork);
router.post('/it-edp/network-admin', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('scope').trim().notEmpty().withMessage('scope is required'),
  body('admin').optional().trim(),
  body('changeWindow').optional().trim(),
  body('configState').optional().trim(),
  body('note').optional().trim(),
], createITEDPNetworkAdmin);
router.patch('/it-edp/network-admin/:id', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('scope').optional().trim(),
  body('admin').optional().trim(),
  body('changeWindow').optional().trim(),
  body('configState').optional().trim(),
  body('note').optional().trim(),
], updateITEDPNetworkAdmin);
router.delete('/it-edp/network-admin/:id', authUser, requireHospitalStaff, requireItEdpStaff, deleteITEDPNetworkAdmin);
router.get('/it-edp/backup', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPBackups);
router.get('/it-edp/security', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPSecurity);
router.get('/it-edp/access', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPAccess);
router.post('/it-edp/asset-labels', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('assetTag').trim().notEmpty().withMessage('assetTag is required'),
  body('asset').optional().trim(),
  body('template').optional().trim(),
  body('status').optional().trim(),
  body('owner').optional().trim(),
  body('note').optional().trim(),
], createITEDPAssetLabel);
router.patch('/it-edp/asset-labels/:id', authUser, requireHospitalStaff, requireItEdpStaff, [
  body('asset').optional().trim(),
  body('template').optional().trim(),
  body('status').optional().trim(),
  body('owner').optional().trim(),
  body('note').optional().trim(),
], updateITEDPAssetLabel);
router.delete('/it-edp/asset-labels/:id', authUser, requireHospitalStaff, requireItEdpStaff, deleteITEDPAssetLabel);
router.get('/it-edp/reports', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPReports);
router.get('/it-edp/settings', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPSettings);
router.get('/it-edp/support', authUser, requireHospitalStaff, requireItEdpStaff, getITEDPSupport);

// OT
router.post('/ot/signup', deptBodyValidation, otStaffSignup);
router.post('/ot/login', authLimiter, deptLoginValidation, otStaffLogin);

// ICU
router.post('/icu/signup', deptBodyValidation, icuStaffSignup);
router.post('/icu/login', authLimiter, deptLoginValidation, icuStaffLogin);

// Quality / NABH
router.post('/quality/signup', deptBodyValidation, qualityStaffSignup);
router.post('/quality/login', authLimiter, deptLoginValidation, qualityStaffLogin);
router.get('/quality/portal-data', authUser, requireHospitalStaff, requireQualityStaff, getQualityPortalData);
router.get('/quality/nabh-templates', authUser, requireHospitalStaff, requireQualityStaff, getQualityNabhTemplates);
router.get('/quality/incidents', authUser, requireHospitalStaff, requireQualityStaff, getQualityIncidents);
router.post('/quality/incidents', authUser, requireHospitalStaff, requireQualityStaff, [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('category').trim().notEmpty().withMessage('category is required'),
  body('severity').optional().trim(),
  body('location').optional().trim(),
  body('owner').optional().trim(),
  body('status').optional().trim(),
  body('description').optional().trim(),
  body('message').optional().trim(),
  body('tags').optional().isArray(),
], createQualityIncident);
router.patch('/quality/incidents/:id', authUser, requireHospitalStaff, requireQualityStaff, [
  body('title').optional().trim(),
  body('category').optional().trim(),
  body('severity').optional().trim(),
  body('location').optional().trim(),
  body('owner').optional().trim(),
  body('status').optional().trim(),
  body('description').optional().trim(),
  body('resolution').optional().trim(),
  body('capa').optional(),
  body('tags').optional().isArray(),
], updateQualityIncident);
router.get('/quality/assessments', authUser, requireHospitalStaff, requireQualityStaff, getQualityAssessments);
router.get('/quality/audit-reports', authUser, requireHospitalStaff, requireQualityStaff, getQualityAuditReports);
router.get('/quality/accreditation', authUser, requireHospitalStaff, requireQualityStaff, getQualityAccreditation);
router.get('/quality/kpis', authUser, requireHospitalStaff, requireQualityStaff, getQualityKpis);
router.get('/quality/policies', authUser, requireHospitalStaff, requireQualityStaff, getQualityPolicies);
router.post('/quality/policies', authUser, requireHospitalStaff, requireQualityStaff, [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('version').optional().trim(),
  body('owner').optional().trim(),
  body('review').optional().trim(),
  body('status').optional().trim(),
], createQualityPolicy);
router.patch('/quality/policies/:id', authUser, requireHospitalStaff, requireQualityStaff, [
  body('title').optional().trim(),
  body('version').optional().trim(),
  body('owner').optional().trim(),
  body('review').optional().trim(),
  body('status').optional().trim(),
], updateQualityPolicy);
router.get('/quality/feedback', authUser, requireHospitalStaff, requireQualityStaff, getQualityFeedback);
router.get('/quality/reports', authUser, requireHospitalStaff, requireQualityStaff, getQualityReports);
router.get('/quality/nabh-compliance', authUser, requireHospitalStaff, requireQualityStaff, getQualityNabhCompliance);
router.get('/quality/settings', authUser, requireHospitalStaff, requireQualityStaff, getQualitySettings);
router.get('/quality/support', authUser, requireHospitalStaff, requireQualityStaff, getQualitySupport);

// Security
router.post('/security/signup', deptBodyValidation, securityStaffSignup);
router.post('/security/login', authLimiter, deptLoginValidation, securityStaffLogin);
router.get('/security/portal-data', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityPortalData);
router.get('/security/cctv', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityCCTV);
router.get('/security/access-points', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityAccessPoints);
router.get('/security/access-logs', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityAccessLogsList);
router.get('/security/incidents', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityIncidentsList);
router.post('/security/incidents', authUser, requireHospitalStaff, requireSecurityStaff, [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('category').optional().trim(),
  body('priority').optional().trim(),
  body('location').optional().trim(),
  body('owner').optional().trim(),
  body('status').optional().trim(),
  body('description').optional().trim(),
  body('message').optional().trim(),
  body('tags').optional().isArray(),
], createSecurityIncident);
router.patch('/security/incidents/:id', authUser, requireHospitalStaff, requireSecurityStaff, [
  body('title').optional().trim(),
  body('category').optional().trim(),
  body('priority').optional().trim(),
  body('location').optional().trim(),
  body('owner').optional().trim(),
  body('status').optional().trim(),
  body('description').optional().trim(),
  body('resolution').optional().trim(),
  body('tags').optional().isArray(),
], updateSecurityIncident);
router.get('/security/alerts', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityAlerts);
router.get('/security/guard-duty', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityGuardDuty);
router.get('/security/visitors', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityVisitorsList);
router.post('/security/visitors', authUser, requireHospitalStaff, requireSecurityStaff, [
  body('visitor').trim().notEmpty().withMessage('visitor is required'),
  body('patient').optional().trim(),
  body('passType').optional().trim(),
  body('checkIn').optional().trim(),
  body('status').optional().trim(),
  body('destination').optional().trim(),
  body('escort').optional().trim(),
], createSecurityVisitor);
router.patch('/security/visitors/:id', authUser, requireHospitalStaff, requireSecurityStaff, [
  body('visitor').optional().trim(),
  body('patient').optional().trim(),
  body('passType').optional().trim(),
  body('checkIn').optional().trim(),
  body('status').optional().trim(),
  body('destination').optional().trim(),
  body('escort').optional().trim(),
], updateSecurityVisitor);
router.get('/security/staff-log', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityStaffLog);
router.get('/security/reports', authUser, requireHospitalStaff, requireSecurityStaff, getSecurityReports);
router.get('/security/settings', authUser, requireHospitalStaff, requireSecurityStaff, getSecuritySettings);
router.get('/security/support', authUser, requireHospitalStaff, requireSecurityStaff, getSecuritySupport);

// ==================== COMMON ENDPOINTS ====================

/**
 * GET /api/hospital/staff/search
 * Search for hospitals - public endpoint
 */
router.get(
  '/search',
  [
    query('query').optional().trim(),
    query('city').optional().trim(),
    query('state').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  searchHospitals
);

/**
 * GET /api/hospital/staff/profile
 * Get staff profile - authenticated staff only
 */
router.get(
  '/profile',
  authUser,
  requireHospitalStaff,
  getStaffProfile
);

/**
 * PATCH /api/hospital/staff/profile
 * Update staff profile - authenticated staff only
 */
router.patch(
  '/profile',
  authUser,
  requireHospitalStaff,
  [
    body('first_name').optional().trim(),
    body('last_name').optional().trim(),
    body('phone').optional().trim(),
    body('specialization').optional().trim(),
    body('department').optional().trim(),
    body('license_number').optional().trim(),
    body('qualifications').optional().isArray(),
    body('years_of_experience').optional().isInt({ min: 0 }),
    body('shift_type').optional().isIn(['day', 'night', 'rotating']),
    body('certification').optional().trim()
  ],
  updateStaffProfile
);

export default router;
