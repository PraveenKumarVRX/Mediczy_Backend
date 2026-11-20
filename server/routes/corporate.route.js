import jwtSso from 'jsonwebtoken';
import { JWT_CONFIG as JWT_SSO_CONFIG } from '../config/auth.config.js';
import { encrypt as encryptSsoSecret, decrypt as decryptSsoSecret } from '../utils/encryption.js';
const JWT_SSO_SECRET = JWT_SSO_CONFIG.SECRET;
import { activateAhcBatch, remindAhcBatch } from '../services/ahc-activation.service.js';
import { invitationStatus as ahcInvitationStatus } from '../services/ahc-invitation-dispatch.service.js';
import { findExistingEmployeeAccount, isOneAccountPerPhoneViolation, rosterFinancialYearAvailable } from '../services/corporate-employee-identity.service.js';
import { fiscalYearOf } from '../utils/ist-date.js';
import { parseTestList } from '../utils/health-package-tests.js';
import express from 'express';
import { listCheckupCompletions, getCorporateReportFile, sendReportFile, auditReportAccess } from '../services/checkup-completions.service.js';
import { shareCorporateHealthReport } from './corporate-bookings.route.js';
import { synchronizeCorporateEmployment } from '../services/corporate-employment-sync.service.js';
import { prepareCorporateSchedule } from '../services/corporate-scheduling.service.js';
import { createCorporateSsoRouter } from './corporate-sso.route.js';
import { protectedSettings } from '../services/corporate-sso.service.js';
import { corporateMfaLogin } from '../services/corporate-mfa.service.js';
import { createCorporateAccessRouter } from './corporate-access.route.js';
import { createCorporateSecurityRouter } from './corporate-security.route.js';
import * as corporateMfa from '../services/mfa-step-up.service.js';
import { corporateMfaIdentity } from '../services/corporate-mfa.service.js';
import { createCorporateProgramsRouter } from './corporate-programs.route.js';
import { corporateAccessAudit } from '../services/corporate-access-audit.service.js';
import { body } from 'express-validator';
import { patientAccountOnly } from '../middleware/patient-account.middleware.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authCorporate } from '../middleware/corporate.middleware.js';
import * as tpaMemberLink from '../services/tpa-member-link.service.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  corporateLogin,
  getCorporateSummary,
  getCorporateHealthAnalytics,
  getCorporateEmployeesHealth,
  getCorporateAppointments
} from '../controller/corporate.controller.js';
import { UserPlan, MembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import bcrypt from 'bcrypt';
import { reactivateCorporateEmployeeAccount } from '../services/corporate-employee-activation.service.js';
import { EmployeeConflictError } from '../services/corporate-employee-create.service.js';
import welcomeEmailService from '../services/welcome-email.service.js';
import { dispatchCorporateEmployeeWelcomeEmail } from '../services/corporate-employee-welcome.service.js';
import { setRlsContext } from '../middleware/rls-context.middleware.js';
import {
  generateCorporateMisReport,
  resolveCorporateIdFromUser,
  buildCorporateMisMetrics,
  misMetricsToRows,
} from '../services/corporate-wellness-mis.service.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  createCorporateBenefitProgram,
  cancelBenefitAuthorization,
  enrollEmployeesInBenefitProgram,
  getCorporateBenefitWalletSummary,
  getEmployeeBenefitWallet,
  getEmployeeBenefitWalletByCorporateEmployeeId,
  listCorporateBenefitAuthorizations,
  listCorporateBenefitPrograms,
  requestBenefitAuthorization,
  settleBenefitAuthorization,
  selectBenefitWalletTier,
  listBenefitNetworkProviders,
  resolveEmployeeCorporate,
} from '../services/corporate-benefit-wallet.service.js';

const corporatePasswordMatches = async (user, password) => {
    const { default: bcrypt } = await import('bcrypt');
    const { default: Account } = user.role === 'corporate'
      ? await import('../models/postgres/corporate.model.postgres.js')
      : await import('../models/postgres/user.model.postgres.js');
    const account = await Account.findByPk(user.role === 'corporate' ? user.corporateId : user.userId);
    return Boolean(account?.password && await bcrypt.compare(password, account.password));
  };

const authEmployee = (req,res,next) => authUser(req,res,()=>patientAccountOnly(req,res,next));
const authCorporateOrEmployee = (req,res,next) => {
  const claims=jwtSso.decode(req.headers.authorization?.replace('Bearer ',''));
  return claims?.role==='corporate'||claims?.userType==='corporate' ? authCorporate(req,res,next) : authEmployee(req,res,next);
};
const router = express.Router();
const accessAudit = corporateAccessAudit(postgresSequelize);

const toCsv = (rows, headers) => {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(headers.map((key) => escapeCell(row?.[key])).join(','));
  }
  return lines.join('\n');
};

// Risk monitor alert configuration
const DEFAULT_RISK_ALERTS = {
  enabled: true,
  notifyEmail: true,
  notifySms: false,
  thresholds: {
    critical: 80,
    high: 70,
    medium: 55,
  },
};

// ---------------------------------------------------------------------------
// Corporate authentication & dashboard intelligence endpoints
// ---------------------------------------------------------------------------

/**
 * Corporate portal sign-in accepts a USERNAME or an email.
 *
 * HR is also an employee. users.email is UNIQUE, so one email is one row is one role: while an
 * HR person's work address is held by their hr_staff/corporate_admin row, that same person cannot
 * also have an employee row, and their two identities collide. Signing HR in by username lets the
 * HR account carry a system address (e.g. ninjacart@mediqzy.com) and leaves the work address free
 * for their employee account.
 *
 * Email is still accepted so the existing corporate accounts keep working -- the company-level
 * record in `corporates` has no username column and is keyed by email only.
 */
const corporateLoginValidation = [
  body('username').optional({ checkFalsy: true }).trim()
    .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters')
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Username may contain only letters, numbers, dots, underscores and hyphens'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body().custom((value) => {
    if (!value?.username && !value?.email) {
      throw new Error('Username or email is required');
    }
    return true;
  }),
];

router.post('/login', authLimiter, corporateLoginValidation, corporateLogin);

router.post('/auth/login', authLimiter, corporateLoginValidation, corporateLogin);

router.get('/dashboard/summary', authCorporate, getCorporateSummary);
router.get('/dashboard/health-analytics', authCorporate, getCorporateHealthAnalytics);
router.get('/dashboard/employees-health', authCorporate, getCorporateEmployeesHealth);
router.get('/dashboard/appointments', authCorporate, getCorporateAppointments);

// Corporate profile — must be defined before the aggregator router (also mounted at /api/corporate)
// intercepts /profile via its /:id route which only works for aggregator users.
router.get('/profile', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.id;
    const [rows] = await postgresSequelize.query(
      `SELECT id, uid, "companyName", "contactPerson", email, "phoneNumber", "alternatePhone",
              industry, "employeeCount", "gstNumber", "panNumber", address, "packageType",
              "packageStartDate", "packageEndDate", "packageAmount", services,
              status, unique_id AS "uniqueId", "createdAt", "updatedAt"
       FROM corporates WHERE id = :corporateId LIMIT 1`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (!rows) {
      return res.status(404).json({ success: false, message: 'Corporate profile not found' });
    }
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Corporate profile fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch corporate profile' });
  }
});

router.put('/profile', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.id;
    const allowed = ['contactPerson', 'phoneNumber', 'alternatePhone', 'industry', 'address', 'gstNumber', 'panNumber'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    const setClauses = Object.keys(updates).map(k => `"${k}" = :${k}`).join(', ');
    await postgresSequelize.query(
      `UPDATE corporates SET ${setClauses}, "updatedAt" = NOW() WHERE id = :corporateId`,
      { replacements: { ...updates, corporateId } }
    );
    return res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Corporate profile update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Unmeasured coverage and dates stay absent instead of inheriting demo entitlements.
const DEFAULT_PLAN_TEMPLATE = { id: null, planName: 'No assigned plan', corporateName: '', validFrom: null, validTo: null, planType: '', benefits: [], features: {}, coverage: {} };

async function getActiveUserPlan(userId) {
  return await UserPlan.findOne({
    where: { userId, status: 'active' },
    include: [{ model: MembershipPlan, as: 'plan' }]
  });
}

function normalizePlanPayload(planRecord, userPlan, userContext) {
  const planData = planRecord ? {
    ...DEFAULT_PLAN_TEMPLATE,
    ...planRecord,
    benefits: planRecord.benefits || planRecord.metadata?.benefits
  } : DEFAULT_PLAN_TEMPLATE;

  return {
    id: planData.id || planRecord?.id || userPlan?.membershipPlanId || DEFAULT_PLAN_TEMPLATE.id,
    planName: planData.planName || planData.name || DEFAULT_PLAN_TEMPLATE.planName,
    corporateName: userContext?.corporateName || userContext?.companyName || planData.corporateName || DEFAULT_PLAN_TEMPLATE.corporateName,
    validFrom: userPlan?.startDate || planData.validFrom || null,
    validTo: userPlan?.endDate || planData.validTo || null,
    planType: planData.planType || planData.tier || DEFAULT_PLAN_TEMPLATE.planType,
    benefits: planData.benefits || DEFAULT_PLAN_TEMPLATE.benefits,
    features: {
      ...DEFAULT_PLAN_TEMPLATE.features,
      ...(planData.features || {})
    },
    coverage: {
      ...DEFAULT_PLAN_TEMPLATE.coverage,
      ...(planData.coverage || {})
    }
  };
}

function buildUsageSnapshot(userPlan) {
  const usage = userPlan?.usage || {};
  const benefitLimits = userPlan?.appliedLimits?.benefitLimits || userPlan?.plan?.benefitLimits || {};
  return {
    opdUsed: usage.opdVisits || usage.opdUsed || 0,
    opdLimit: benefitLimits.opdVisits ?? benefitLimits.opdLimit ?? null,
    diagnosticsUsed: usage.diagnostics || usage.diagnosticsUsed || 0,
    diagnosticsLimit: benefitLimits.diagnostics ?? benefitLimits.diagnosticsLimit ?? null,
    amountUsed: usage.benefitINR?.total || usage.amountUsed || 0,
    amountLimit: benefitLimits.totalBenefitINR ?? benefitLimits.amountLimit ?? null
  };
}

// Get user's corporate benefits/plan
// Real subscription_plans.features uses short keys (opd, ipd, ...); the
// frontend's CorporatePlan interface expects the *Coverage suffix form.
const FEATURE_KEY_MAP = {
  opd: 'opdCoverage', ipd: 'ipdCoverage', maternity: 'maternityCoverage', dental: 'dentalCoverage',
  pharmacy: 'pharmacyCoverage', diagnostics: 'diagnosticsCoverage', homecare: 'homecareCoverage',
  ambulance: 'ambulanceCoverage', wellness: 'wellnessCoverage', mentalHealth: 'mentalHealthCoverage',
};

// subscription_plans.features is inconsistently shaped across real rows --
// some corporates have {opd: true, ipd: false, ...}, others have a plain
// label array like ["OPD","Mental Health","Health Calendar"]. Handle both
// rather than silently reporting every feature as false for the array shape
// (confirmed live: was happening for at least 2 real corporate accounts).
const FEATURE_LABEL_ALIASES = {
  opdCoverage: ['opd'],
  ipdCoverage: ['ipd'],
  maternityCoverage: ['maternity'],
  dentalCoverage: ['dental'],
  pharmacyCoverage: ['pharmacy'],
  diagnosticsCoverage: ['diagnostics'],
  homecareCoverage: ['homecare'],
  ambulanceCoverage: ['ambulance'],
  wellnessCoverage: ['wellness'],
  mentalHealthCoverage: ['mental health', 'mentalhealth'],
};

// Platform/perk features (Team-configured, e.g. via TeamCorporateManagement's
// plan editor) are a distinct kind from medical coverage above -- they gate
// access to product features (Wellness Calendar, webinars) or discount
// programs, not what's medically covered. Key names match the source data
// directly (no "Coverage" suffix); label aliases used for the array-shaped
// features case, matching TeamCorporateManagement's planFeatureLabels.
const PLATFORM_FEATURE_KEYS = [
  'healthCalendar', 'webinars', 'labDiscount', 'pharmacyDiscount',
  'discountCoupons', 'gymMembership', 'wellnessMembership', 'wellnessPackageDiscounts',
];
const PLATFORM_FEATURE_LABEL_ALIASES = {
  healthCalendar: ['health calendar'],
  webinars: ['webinars'],
  labDiscount: ['lab discount'],
  pharmacyDiscount: ['pharmacy discount'],
  discountCoupons: ['discount coupons'],
  gymMembership: ['gym membership'],
  wellnessMembership: ['wellness membership'],
  wellnessPackageDiscounts: ['wellness package discounts'],
};

function tagBenefitCategory(b) {
  const text = typeof b === 'string' ? b : String(b?.category || b?.name || '');
  return /\b(ipd|maternity)\b/i.test(text) ? 'insurance' : 'wellness';
}

function extractPlatformFeatures(rawFeatures) {
  const platformFeatures = {};
  if (Array.isArray(rawFeatures)) {
    const labels = new Set(rawFeatures.map((f) => String(f).trim().toLowerCase()));
    for (const [key, aliases] of Object.entries(PLATFORM_FEATURE_LABEL_ALIASES)) {
      platformFeatures[key] = aliases.some((a) => labels.has(a));
    }
  } else {
    for (const key of PLATFORM_FEATURE_KEYS) {
      platformFeatures[key] = Boolean(rawFeatures?.[key]);
    }
  }
  return platformFeatures;
}

function mapSubscriptionPlanToCorporatePlan(planRow, corporateName) {
  const meta = planRow.metadata || {};
  const features = {};
  if (Array.isArray(planRow.features)) {
    const labels = new Set(planRow.features.map((f) => String(f).trim().toLowerCase()));
    for (const [destKey, aliases] of Object.entries(FEATURE_LABEL_ALIASES)) {
      features[destKey] = aliases.some((a) => labels.has(a));
    }
  } else {
    for (const [srcKey, destKey] of Object.entries(FEATURE_KEY_MAP)) {
      features[destKey] = Boolean(planRow.features?.[srcKey]);
    }
  }
  const platformFeatures = extractPlatformFeatures(planRow.features);
  return {
    id: String(planRow.id),
    planName: planRow.name,
    corporateName,
    validFrom: meta.validFrom || null,
    validTo: meta.validTo || null,
    planType: meta.planType || 'Standard',
    // IPD/Maternity are genuine insurance-rider categories; everything else
    // (OPD, Pharmacy, Diagnostics, Dental, Wellness, Mental Health, etc.) is
    // an employer-funded wellness/OPD benefit, not insurance -- surfaced
    // separately so the UI never presents one as the other.
    benefits: Array.isArray(meta.benefits)
      ? meta.benefits.filter((b) => b.isIncluded).map((b) => ({
          category: b.category || b.name,
          description: b.description || b.name,
          coverage: b.coverage || b.limit || '',
          limit: b.limit || undefined,
          benefitCategory: tagBenefitCategory(b),
        }))
      : [],
    features,
    platformFeatures,
    // Real plan config stores room rent / ICU rent / hospitalization windows as
    // descriptive text ("Single Room", "30 days"), not numeric day-counts or
    // per-day rupee rates -- displayed as-is rather than forced into a shape
    // the source data doesn't actually have.
    coverage: {
      sumInsured: Number(meta.coverage?.sumInsured) || 0,
      roomRent: meta.coverage?.roomRent || null,
      icuRent: meta.coverage?.icuRent || null,
      preHospitalization: meta.coverage?.prePolicyMedical || null,
      postHospitalization: meta.coverage?.postPolicyMedical || null,
    },
  };
}

router.get('/my-benefits', authCorporateOrEmployee, async (req, res) => {
  try {
    // Resolve real company name from corporates table (JWT doesn't carry it)
    let resolvedCompanyName = req.user?.corporateName || req.user?.companyName;
    const corporateId = req.user?.corporateId || req.user?.id;
    if (!resolvedCompanyName && corporateId) {
      try {
        const [corpRow] = await postgresSequelize.query(
          `SELECT "companyName" FROM corporates WHERE id = :corporateId LIMIT 1`,
          { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
        );
        if (corpRow?.companyName) resolvedCompanyName = corpRow.companyName;
      } catch (e) {
        // ignore
      }
    }

    // HR/corporate-admin logins don't have a personal insurance plan -- a
    // corporate entity isn't a patient. Show the company's actual subscribed
    // plan instead of one employee's usage.
    if (req.user?.role === 'corporate' || req.user?.userType === 'corporate') {
      const [planRows] = await postgresSequelize.query(
        `SELECT id, name, tier, price, currency, billing_cycle, features, metadata
           FROM subscription_plans
          WHERE type = 'CORPORATE' AND is_active = true
            AND (metadata->>'corporateId')::int = :corporateId
          ORDER BY created_at DESC LIMIT 1`,
        { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (!planRows) {
        return res.json({ success: true, linkedPlan: false, plan: null, usage: null, data: { linkedPlan: false, plan: null, usage: null, viewMode: 'company' } });
      }

      const [enrollment] = await postgresSequelize.query(
        `SELECT used_count AS covered, max_employees AS total
           FROM corporate_plan_sponsorships WHERE corporate_id = :corporateId AND is_active = true
          ORDER BY created_at DESC LIMIT 1`,
        { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );

      const planPayload = mapSubscriptionPlanToCorporatePlan(planRows, resolvedCompanyName);
      return res.json({
        success: true,
        linkedPlan: true,
        plan: planPayload,
        usage: null,
        data: { linkedPlan: true, plan: planPayload, usage: null, viewMode: 'company', enrollment: enrollment || null },
      });
    }

    // Employee/patient view: their own personal plan usage.
    let activePlan = null;
    if (Number.isInteger(parseInt(req.user.id))) {
      try {
        activePlan = await getActiveUserPlan(req.user.id);
      } catch (error) {
        console.log(`Note: Could not fetch active plan for user ${req.user.id}:`, error.message);
      }
    }

    if (!activePlan) {
      return res.json({ success: true, linkedPlan: false, plan: null, usage: null, data: { linkedPlan: false, plan: null, usage: null, viewMode: 'personal' } });
    }

    const planRecord = activePlan.plan?.toJSON();
    const userPlan = activePlan.toJSON();
    const planPayload = {
      id: String(planRecord?.id ?? userPlan?.membershipPlanId ?? ''),
      planName: planRecord?.name || planRecord?.planName || 'Health Plan',
      corporateName: resolvedCompanyName || null,
      validFrom: userPlan?.startDate || null,
      validTo: userPlan?.endDate || null,
      planType: planRecord?.tier ? String(planRecord.tier) : (planRecord?.planType || 'Standard'),
      // membership_plans.benefits is a plain array of description strings (e.g. "10 GP
      // teleconsultations/year"), unlike subscription_plans' metadata.benefits objects below --
      // spreading a string with {...b} explodes it into numeric-indexed characters, so the two
      // shapes are normalized to the same { category, description, benefitCategory } the UI reads.
      benefits: (planRecord?.benefits || planRecord?.metadata?.benefits || []).map((b) => (
        typeof b === 'string'
          ? { category: b, description: '', benefitCategory: tagBenefitCategory(b) }
          : { ...b, benefitCategory: tagBenefitCategory(b) }
      )),
      features: planRecord?.features || {},
      platformFeatures: extractPlatformFeatures(planRecord?.features),
      coverage: planRecord?.metadata?.coverage || {},
    };
    const usage = buildUsageSnapshot(userPlan);

    res.json({
      success: true,
      linkedPlan: true,
      plan: planPayload,
      usage,
      data: { linkedPlan: true, plan: planPayload, usage, viewMode: 'personal' }
    });
  } catch (error) {
    console.error('Error fetching corporate benefits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch corporate benefits',
      error: error.message
    });
  }
});

// ---------------------------------------------------------------------------
// Corporate Benefits Wallet
// ---------------------------------------------------------------------------
// Employer-funded wallet layer: HR configures category programs, employees get
// auditable rupee wallets, and employee cashless/pre-auth requests reserve
// balances. This intentionally stays separate from Health Coins rewards.

router.get('/benefit-wallet/summary', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const summary = await getCorporateBenefitWalletSummary(corporateId);
    return res.json({ success: true, data: summary });
  } catch (error) {
    console.error('[corporate] GET /benefit-wallet/summary error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load benefit wallet summary', error: error.message });
  }
});

router.get('/benefit-wallet/programs', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const programs = await listCorporateBenefitPrograms(corporateId);
    return res.json({ success: true, data: { programs } });
  } catch (error) {
    console.error('[corporate] GET /benefit-wallet/programs error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load benefit programs', error: error.message });
  }
});

// HR-facing cashless network directory (dental/vision/vaccination/etc providers).
router.get('/benefit-wallet/network-providers', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const providers = await listBenefitNetworkProviders(corporateId, req.query.category || null);
    return res.json({ success: true, data: { providers } });
  } catch (error) {
    console.error('[corporate] GET /benefit-wallet/network-providers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load network providers', error: error.message });
  }
});

// Employee-facing version — same directory, no corporate-admin gate.
router.get('/my-benefit-wallet/network-providers', authEmployee, async (req, res) => {
  try {
    const corp = await resolveEmployeeCorporate(req.user.id);
    if (!corp) return res.json({ success: true, data: { providers: [] } });
    const providers = await listBenefitNetworkProviders(corp.corporateId, req.query.category || null);
    return res.json({ success: true, data: { providers } });
  } catch (error) {
    console.error('[corporate] GET /my-benefit-wallet/network-providers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load network providers', error: error.message });
  }
});

router.post('/benefit-wallet/programs', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const program = await createCorporateBenefitProgram(
      corporateId,
      req.body || {},
      req.user?.userId || req.user?.id || null
    );
    return res.status(201).json({ success: true, message: 'Benefit program created', data: { program } });
  } catch (error) {
    console.error('[corporate] POST /benefit-wallet/programs error:', error.message);
    const status = /required|must be|invalid|must match|greater than zero|duplicate/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to create benefit program' });
  }
});

router.post('/benefit-wallet/programs/:programId/enroll', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const programId = parseInt(req.params.programId, 10);
    if (!Number.isInteger(programId) || programId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid program ID is required' });
    }

    const result = await enrollEmployeesInBenefitProgram(
      corporateId,
      programId,
      req.body || {},
      req.user?.userId || req.user?.id || null
    );
    return res.json({ success: true, message: 'Employees enrolled into benefit wallet', data: result });
  } catch (error) {
    console.error('[corporate] POST /benefit-wallet/programs/:programId/enroll error:', error.message);
    const status = /not found|required|must be|No active employees/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to enroll employees' });
  }
});

router.get('/benefit-wallet/employees/:employeeId', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const employeeId = String(req.params.employeeId || '').trim();
    if (!employeeId) return res.status(400).json({ success: false, message: 'Employee ID is required' });

    const wallets = await getEmployeeBenefitWalletByCorporateEmployeeId(corporateId, employeeId);
    return res.json({ success: true, data: { employeeId, wallets } });
  } catch (error) {
    console.error('[corporate] GET /benefit-wallet/employees/:employeeId error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load employee benefit wallet', error: error.message });
  }
});

router.get('/benefit-wallet/authorizations', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const authorizations = await listCorporateBenefitAuthorizations(corporateId, {
      status: req.query.status,
      limit: req.query.limit,
    });
    return res.json({ success: true, data: { authorizations } });
  } catch (error) {
    console.error('[corporate] GET /benefit-wallet/authorizations error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load benefit authorizations', error: error.message });
  }
});

router.post('/benefit-wallet/authorizations/:authorizationId/settle', authCorporate, async (req, res) => {
  if (!requireClaimsAdjudicator(req, res)) return;
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const authorizationId = parseInt(req.params.authorizationId, 10);
    if (!Number.isInteger(authorizationId) || authorizationId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid authorization ID is required' });
    }

    const settlement = await settleBenefitAuthorization(
      corporateId,
      authorizationId,
      req.body || {},
      req.user?.userId || req.user?.id || null
    );
    return res.json({ success: true, message: 'Benefit authorization settled', data: { settlement } });
  } catch (error) {
    console.error('[corporate] POST /benefit-wallet/authorizations/:authorizationId/settle error:', error.message);
    const status = /not found|Only approved|must be|cannot exceed/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to settle authorization' });
  }
});

router.post('/benefit-wallet/authorizations/:authorizationId/cancel', authCorporate, async (req, res) => {
  if (!requireClaimsAdjudicator(req, res)) return;
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

    const authorizationId = parseInt(req.params.authorizationId, 10);
    if (!Number.isInteger(authorizationId) || authorizationId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid authorization ID is required' });
    }

    const cancellation = await cancelBenefitAuthorization(
      corporateId,
      authorizationId,
      req.body || {},
      req.user?.userId || req.user?.id || null
    );
    return res.json({ success: true, message: 'Benefit authorization cancelled and reserved amount released', data: { cancellation } });
  } catch (error) {
    console.error('[corporate] POST /benefit-wallet/authorizations/:authorizationId/cancel error:', error.message);
    const status = /not found|Only submitted|required|must be/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to cancel authorization' });
  }
});

router.get('/my-benefit-wallet', authEmployee, async (req, res) => {
  try {
    const wallet = await getEmployeeBenefitWallet(req.user.id);
    return res.json({ success: true, data: wallet });
  } catch (error) {
    console.error('[corporate] GET /my-benefit-wallet error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load your corporate benefit wallet', error: error.message });
  }
});

router.post('/benefit-wallet/authorizations', authEmployee, async (req, res) => {
  try {
    const authorization = await requestBenefitAuthorization(req.user.id, req.body || {});
    return res.status(201).json({
      success: true,
      message: 'Benefit authorization approved and amount reserved',
      data: { authorization },
    });
  } catch (error) {
    console.error('[corporate] POST /benefit-wallet/authorizations error:', error.message);
    const status = /only for corporate employees|No active|Insufficient|must be/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to request benefit authorization' });
  }
});

// Employee self-service tier upgrade/downgrade — for programs that offer
// selectable tiers (a base allocation plus one or more optional, higher
// tiers; whatever amounts the program was actually configured with).
router.post('/my-benefit-wallet/:walletId/select-tier', authEmployee, async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId, 10);
    if (!Number.isInteger(walletId) || walletId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid wallet ID is required' });
    }
    const { tierKey } = req.body || {};
    const result = await selectBenefitWalletTier(req.user.id, walletId, tierKey);
    return res.json({ success: true, message: result.unchanged ? 'Already on this tier' : 'Tier updated', data: { wallet: result } });
  } catch (error) {
    console.error('[corporate] POST /my-benefit-wallet/:walletId/select-tier error:', error.message);
    const status = /not found|does not offer|Unknown tier|is required|already used or reserved/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to update tier' });
  }
});

// Real checkup availability comes from the corporate's actual subscription
// plan (a "Wellness"/health-checkup benefit line item, e.g. "Annual Health
// Checkup, Once per year"), not a fabricated multi-tier package catalog --
// no such catalog exists anywhere in the platform's real data. Employee
// enrollment/validity comes from user_health_packages when present.
router.get('/health-checkups', authEmployee, async (req, res) => {
  try {
    const isCorporateSession = req.user?.role === 'corporate' || req.user?.userType === 'corporate';
    let corporateId = req.user?.corporateId || req.user?.organization_id;
    let enrollment = null;

    if (!isCorporateSession) {
      const [assoc] = await postgresSequelize.query(
        `SELECT ua."entityId" AS "corporateId" FROM user_associations ua
          JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
          WHERE ua."userId" = :userId AND ua."entityType" = 'corporate' AND ua.status = 'active'
          ORDER BY ua."createdAt" DESC LIMIT 1`,
        { replacements: { userId: req.user.id } }
      );
      corporateId = assoc[0]?.corporateId || null;

      if (corporateId) {
        const [pkgRows] = await postgresSequelize.query(
          `SELECT "packageName", "validFrom", "validTo" FROM user_health_packages
            WHERE "userId" = :userId AND status = 'active' ORDER BY "createdAt" DESC LIMIT 1`,
          { replacements: { userId: req.user.id } }
        );
        enrollment = pkgRows[0] || null;
      }
    }

    if (corporateId) {
      const [planRows] = await postgresSequelize.query(
        `SELECT metadata FROM subscription_plans
          WHERE type = 'CORPORATE' AND is_active = true AND (metadata->>'corporateId')::int = :corporateId
          ORDER BY created_at DESC LIMIT 1`,
        { replacements: { corporateId } }
      );
      const benefits = planRows[0]?.metadata?.benefits;
      const checkupBenefit = Array.isArray(benefits)
        ? benefits.find((b) => b.isIncluded && /health.*check|checkup/i.test(`${b.name || ''} ${b.category || ''}`))
        : null;

      if (checkupBenefit) {
        const checkups = [{
          id: 'plan-annual-checkup',
          name: checkupBenefit.name || 'Annual Health Checkup',
          description: checkupBenefit.description || 'Included as part of your corporate health plan.',
          limit: checkupBenefit.limit || null,
          validFrom: enrollment?.validFrom ? new Date(enrollment.validFrom).toISOString().slice(0, 10) : null,
          validTo: enrollment?.validTo ? new Date(enrollment.validTo).toISOString().slice(0, 10) : null,
        }];
        return res.json({ success: true, linkedPlan: true, checkups, data: { checkups } });
      }
      if (planRows[0]) {
        return res.json({ success: true, linkedPlan: true, checkups: [], data: { checkups: [] } });
      }
    }

    // No corporate-linked plan (user_associations + subscription_plans) was found -- but an
    // employee can also hold a personal plan directly (membership_plans via getActiveUserPlan,
    // the same source /my-benefits reads), independently of that corporate link. Without this
    // fallback, a user with a real active plan sees linkedPlan: true on /my-benefits and
    // linkedPlan: false here, for the same account at the same time.
    if (!isCorporateSession && Number.isInteger(parseInt(req.user.id))) {
      let activePlan = null;
      try {
        activePlan = await getActiveUserPlan(req.user.id);
      } catch (error) {
        console.log(`Note: Could not fetch active plan for user ${req.user.id}:`, error.message);
      }
      const planBenefits = activePlan?.plan?.benefits || activePlan?.plan?.metadata?.benefits;
      if (Array.isArray(planBenefits)) {
        const textOf = (b) => (typeof b === 'string' ? b : `${b?.name || ''} ${b?.category || ''}`);
        const hit = planBenefits.find((b) => (typeof b === 'string' || b.isIncluded) && /health.*check|checkup/i.test(textOf(b)));
        const checkups = hit ? [{
          id: 'plan-annual-checkup',
          name: typeof hit === 'string' ? hit : (hit.name || 'Annual Health Checkup'),
          description: typeof hit === 'string' ? 'Included as part of your health plan.' : (hit.description || 'Included as part of your health plan.'),
          limit: typeof hit === 'string' ? null : (hit.limit || null),
          validFrom: activePlan?.startDate ? new Date(activePlan.startDate).toISOString().slice(0, 10) : null,
          validTo: activePlan?.endDate ? new Date(activePlan.endDate).toISOString().slice(0, 10) : null,
        }] : [];
        return res.json({ success: true, linkedPlan: true, checkups, data: { checkups } });
      }
    }

    return res.json({ success: true, linkedPlan: false, checkups: [], data: { checkups: [] } });
  } catch (error) {
    console.error('Error fetching corporate health checkups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health checkups',
      error: error.message
    });
  }
});

// HR-facing, read-only view of the real health checkup packages Team has
// configured for this corporate (user_health_packages) -- e.g. Pre-Employment
// vs Annual Health Checkup, each with its own real test list. HR cannot
// create or edit packages here; that stays a Team-only action.
router.get('/health-packages', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  try {
    const [rows] = await postgresSequelize.query(
      `SELECT p.id AS "packageId", p.name AS "packageName", p.features AS "packageDetails", p.metadata,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object('partnerId',v.partner_id,'relation',v.relation,'partnerType',v.partner_type,'name',CASE WHEN v.partner_type='hospital' THEN h.hospital_name ELSE l.name END)),'[]'::jsonb) FROM health_package_venues v LEFT JOIN labs l ON l.id=v.partner_id AND v.partner_type='lab' LEFT JOIN hospitals h ON h.id=v.partner_id AND v.partner_type='hospital' WHERE v.package_id=p.id) AS venues,
              MIN(u."validFrom") AS "validFrom", MAX(u."validTo") AS "validTo",
              COUNT(u.id)::int AS "employeeCount"
       FROM corporate_health_package_catalog p
       LEFT JOIN user_health_packages u ON u."packageId"=p.id AND u.corporate_id=p.corporate_id AND LOWER(COALESCE(u.status,'active'))='active'
       WHERE p.corporate_id=:corporateId AND p.metadata->>'kind'='health_checkup' AND p.is_active=true
       GROUP BY p.id ORDER BY p.name ASC`,
      { replacements: { corporateId } }
    );

    const packages = rows
      .map((r) => ({
        ...r,
        packageDetails: typeof r.packageDetails === 'string' ? JSON.parse(r.packageDetails || '{}') : (r.packageDetails || {}),
      }))
      // Exclude the generic placeholder auto-created alongside the base
      // subscription plan (packageDetails = {}) -- not a real customized
      // package, nothing meaningful to show HR.
      .filter((r) => Object.keys(r.packageDetails).length > 0)
      .map((r) => ({
        id: r.packageId,
        eligibleRelations: r.metadata?.eligibleRelations ?? ['self'],
        venueMode: r.metadata?.venueMode || 'inherit',
        venues: r.venues || [],
        name: r.packageName,
        // Packages created before the pre_employment/annual/other type field
        // existed carry whatever free-text type Team used at the time (e.g.
        // "health_checkup") -- normalize anything unrecognized to 'other' so
        // it still shows up in the byType breakdown instead of silently
        // vanishing from every bucket.
        type: ['pre_employment', 'annual'].includes(r.packageDetails.type) ? r.packageDetails.type : 'other',
        // D-7: a package whose tests are stored as one merged string (e.g.
        // "2D Echo/Doppler Study Physician Consultation ...") used to collapse to []
        // here, so HR saw NO tests at all. parseTestList normalises string/array/object
        // shapes into a proper array, the same way the patient endpoint does.
        tests: parseTestList(r.packageDetails.tests),
        price: Number(r.packageDetails.cost ?? r.packageDetails.price ?? 0) || null,
        description: r.packageDetails.description || null,
        employeeCount: r.employeeCount,
        validFrom: r.validFrom ? new Date(r.validFrom).toISOString().slice(0, 10) : null,
        validTo: r.validTo ? new Date(r.validTo).toISOString().slice(0, 10) : null,
      }));

    res.json({
      success: true,
      data: {
        packages,
        byType: {
          pre_employment: packages.filter((p) => p.type === 'pre_employment'),
          annual: packages.filter((p) => p.type === 'annual'),
          other: packages.filter((p) => p.type === 'other'),
        },
      },
    });
  } catch (error) {
    console.error('[corporate] GET /health-packages error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load health packages' });
  }
});

const mapCheckupBooking = (r) => ({
  id: String(r.id),
  appointmentId: `CHK-${r.id}`,
  checkupName: r.checkupName || 'Annual Health Checkup',
  appointmentType: r.appointmentType,
  date: r.date ? r.date.toString().slice(0, 10) : r.date,
  time: r.time,
  hospital: r.hospital || 'Network Hospital',
  location: r.location,
  doctor: 'Corporate Wellness Team',
  status: r.status,
  bookedOn: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  claimAmount: 0,
});

router.get('/my-appointments', authEmployee, async (req, res) => {
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT * FROM corporate_checkup_bookings WHERE "userId" = :userId ORDER BY date DESC, "createdAt" DESC LIMIT 25`,
      { replacements: { userId: req.user.id } }
    );
    const appointments = rows.map(mapCheckupBooking);
    res.json({
      success: true,
      appointments,
      data: { appointments }
    });
  } catch (error) {
    console.error('Error fetching corporate appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Historical bookings remain readable; all new bookings use the validated engine.
router.post('/book-checkup', authEmployee, (_req,res) => res.status(410).json({success:false,code:'booking_endpoint_retired',message:'Use /health-checkups/bookings with an assigned package, beneficiary relation and network venue'}));

router.get('/plans', async (req, res) => {
  try {
    const plans = await MembershipPlan.findAll({
      where: { isActive: true }
    });
    const payload = plans.length
      ? plans.map(plan => normalizePlanPayload(plan.toJSON(), null, {}))
      : [];
    res.json({
      success: true,
      data: payload
    });
  } catch (error) {
    console.error('Error fetching corporate plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch corporate plans',
      error: error.message
    });
  }
});

// Get specific plan details
router.get('/plans/:planId', authCorporateOrEmployee, async (req, res) => {
  try {
    const { planId } = req.params;
    let plan = await MembershipPlan.findOne({ where: { id: planId } });
    if (plan) {
      plan = normalizePlanPayload(plan.toJSON(), null, req.user);
    } else {
      plan = null;
    }
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Error fetching plan details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plan details',
      error: error.message
    });
  }
});

// Enrollment acknowledges only an actual employer-provisioned plan; it never
// grants arbitrary benefits merely because a caller supplies a plan ID.
router.post('/enroll', authEmployee, async (req, res) => {
  const {planId,corporateCode}=req.body||{};
  if(!planId||!corporateCode)return res.status(400).json({success:false,message:'Plan ID and corporate code are required'});
  try{
    const [employee]=await postgresSequelize.query(`SELECT ce.id FROM corporate_employees ce JOIN corporates c ON c.id=ce.corporate_id WHERE ce."userId"=:userId AND ce."isActive"=true AND c.unique_id=:code AND LOWER(c.status)='active'`,{replacements:{userId:req.user.id,code:String(corporateCode)},type:postgresSequelize.QueryTypes.SELECT});
    if(!employee)return res.status(403).json({success:false,message:'An active employee invitation from this corporate is required'});
    const assigned=await UserPlan.findOne({where:{userId:req.user.id,membershipPlanId:planId,status:'active'}});
    if(!assigned)return res.status(409).json({success:false,message:'This plan is not assigned by your employer. Ask HR to synchronize your benefits.'});
    return res.json({success:true,data:{enrollmentId:assigned.id,planId:assigned.membershipPlanId,enrolledAt:assigned.startDate}});
  }catch{return res.status(500).json({success:false,message:'Corporate enrollment could not be verified'});}
});

router.get('/claims', authEmployee, async (req,res)=>{
  try{
    const claims=await postgresSequelize.transaction(async transaction=>{
      await setRlsContext(transaction,{orgId:req.user.tenant_id||req.user.organization_id||0,userId:req.user.id});
      return postgresSequelize.query(`SELECT id,claim_number AS "claimNumber",submitted_date AS date,claim_type AS type,claim_amount AS amount,status FROM insurance_claims WHERE patient_id=:userId ORDER BY submitted_date DESC`,{replacements:{userId:req.user.id},type:postgresSequelize.QueryTypes.SELECT,transaction});
    });
    return res.json({success:true,data:claims});
  }catch{return res.status(500).json({success:false,message:'Claims could not be loaded'});}
});

// ---------------------------------------------------------------------------
// Corporate portal: Notifications
// ---------------------------------------------------------------------------

router.get('/notifications', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { notifications: [] } });
  const [rows] = await postgresSequelize.query(
    `SELECT id, type, title, message, priority, read, "created_at" AS "createdAt"
       FROM corporate_notifications
      WHERE corporate_id = :corporateId
      ORDER BY created_at DESC
      LIMIT 200`,
    { replacements: { corporateId } }
  );
  return res.json({ success: true, data: { notifications: rows } });
});

router.post('/notifications/:id/read', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  await postgresSequelize.query(
    `UPDATE corporate_notifications SET read = true WHERE id = :id AND corporate_id = :corporateId`,
    { replacements: { id, corporateId } }
  );
  return res.json({ success: true });
});

router.post('/notifications/read-all', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  await postgresSequelize.query(
    `UPDATE corporate_notifications SET read = true WHERE corporate_id = :corporateId`,
    { replacements: { corporateId } }
  );
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Corporate portal: Employees
// ---------------------------------------------------------------------------

router.get('/employees', authCorporate, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const department = String(req.query.department || '').trim();
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  // 'active' (default) = current roster; 'inactive' = offboarded employees; 'all' = both.
  const statusFilter = String(req.query.status || 'active').trim().toLowerCase();
  const isActiveClause = statusFilter === 'inactive' ? 'ce."isActive" = false' : statusFilter === 'all' ? 'TRUE' : 'ce."isActive" = true';

  let employees = [];

  // Query real employees from DB if we have a corporate ID
  if (corporateId) {
    try {
      const [rows] = await postgresSequelize.query(
        `SELECT
           ce.id,
           ce."employeeId",
           ce.business_unit,
           ce.department,
           ce.designation,
           ce."joiningDate",
           ce."isActive",
           ce."exitDate",
           ce.email AS on_file_email,
           ce.metadata,
           ce."userId",
           u."firstName",
           u."lastName",
           u.email AS user_email,
           u."phoneNumber",
           hr.last_checkup,
           hr.report_count,
           hr.pre_employment_count,
           hr.annual_count,
           hr.overdue_count
         FROM corporate_employees ce
         LEFT JOIN users u ON u.id = ce."userId"
         LEFT JOIN LATERAL (
           SELECT
             MAX(chr.report_date) AS last_checkup,
             COUNT(*) AS report_count,
             COUNT(*) FILTER (WHERE chr.checkup_type = 'pre_employment') AS pre_employment_count,
             COUNT(*) FILTER (WHERE chr.checkup_type = 'annual_health_checkup') AS annual_count,
             COUNT(*) FILTER (WHERE chr.sla_status IN ('breached', 'pending_overdue')) AS overdue_count
           FROM corporate_health_reports chr
           WHERE chr.corporate_id = ce.corporate_id
             AND chr.employee_id = ce."userId"
         ) hr ON TRUE
         WHERE ce.corporate_id = :corporateId AND ${isActiveClause}
         ORDER BY ce."createdAt" DESC`,
        { replacements: { corporateId } }
      );
      employees = rows.map((r) => {
        const meta = r.metadata || {};
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ')
          || [meta.firstName, meta.lastName].filter(Boolean).join(' ')
          || r.user_email || r.on_file_email || r.employeeId;
        const email = r.user_email || r.on_file_email || '';
        let appStatus;
        if (meta.appAccessDisabled) appStatus = 'inactive';
        else if (r.userId || meta.profileActivation === 'active') appStatus = 'active';
        else if (meta.invitedAt) appStatus = 'invited';
        else appStatus = 'not_invited';
        return {
          id: r.employeeId,
          employeeId: r.employeeId,
          name,
          email,
          phone: r.phoneNumber || '',
          businessUnit: r.business_unit || '',
          department: r.department || 'General',
          designation: r.designation || '',
          joiningDate: r.joiningDate ? r.joiningDate.toString().slice(0, 10) : '',
          isActive: r.isActive,
          exitDate: r.exitDate ? r.exitDate.toString().slice(0, 10) : '',
          exitReason: meta.exitReason || '',
          healthStatus: Number(r.report_count || 0) === 0 ? 'unassessed' : (Number(r.overdue_count || 0) > 0 ? 'moderate' : 'good'),
          lastCheckup: r.last_checkup ? r.last_checkup.toString().slice(0, 10) : '',
          insurancePlan: 'Standard Plan',
          appStatus,
          preEmploymentReports: Number(r.pre_employment_count || 0),
          annualReports: Number(r.annual_count || 0),
          reportCount: Number(r.report_count || 0),
          overdueReports: Number(r.overdue_count || 0),
        };
      });
    } catch (dbErr) {
      console.error('[corporate] GET /employees DB error:', dbErr.message);
    }

    // If no records in corporate_employees, fall back to user_associations (uploaded via team/admin portal)
    if (employees.length === 0) {
      try {
        const [rows] = await postgresSequelize.query(
          `SELECT
             u.id,
             u."firstName",
             u."lastName",
             u.email,
             u."phoneNumber",
             u.department_name,
             ua.metadata,
             ua."startDate",
             ua.status
           FROM users u
           JOIN user_associations ua ON u.id = ua."userId"
           WHERE ua."entityId" = :corporateId
             AND ua."entityType" = 'corporate'
             AND ua.role = 'employee'
             AND ua.status = 'active'
           ORDER BY u."firstName"`,
          { replacements: { corporateId } }
        );
        employees = rows.map((r) => {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {});
          return {
            id: meta.employeeId || String(r.id),
            employeeId: meta.employeeId || String(r.id),
            name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
            email: r.email || '',
            phone: r.phoneNumber || '',
            department: meta.department || r.department_name || 'Not Assigned',
            designation: meta.designation || 'Not Assigned',
            joiningDate: r.startDate ? r.startDate.toString().slice(0, 10) : '',
            healthStatus: 'Not Assessed',
            lastCheckup: '',
            insurancePlan: '',
            appStatus: 'active',
          };
        });
      } catch (uaErr) {
        console.error('[corporate] GET /employees user_associations fallback error:', uaErr.message);
      }
    }
  }

  // Only fall back to demo data when there is no real corporate context
  if (employees.length === 0 && !corporateId) {
    return res.status(403).json({success:false,message:'Corporate context is required'});
  }

  if (department && department !== 'all') {
    employees = employees.filter((e) => e.department === department);
  }
  if (q) {
    employees = employees.filter((e) =>
      [e.name, e.employeeId, e.email].some((field) => String(field || '').toLowerCase().includes(q))
    );
  }

  return res.json({ success: true, data: { employees } });
});

// Health Risk Assessment employees endpoint
router.get('/health-risk/employees', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  try {
    let employees = [];
    if (corporateId) {
      const [rows] = await postgresSequelize.query(
        // Use a LATERAL subquery so each employee gets at most ONE risk score
        // row (the most recent).  A plain LEFT JOIN to ai_health_risk_scores
        // produces one result row per score entry, inflating the employee count.
        `SELECT
           ce."employeeId",
           ce.department,
           ce.designation,
           u.id AS user_id,
           u."firstName",
           u."lastName",
           u.email,
           hrs.overall_score,
           hrs.risk_level,
           hrs.risk_factors,
           hrs.recommendations,
           hrs.created_at AS assessment_date,
           hrs.valid_until
         FROM corporate_employees ce
         LEFT JOIN users u ON u.id = ce."userId"
         LEFT JOIN LATERAL (
           SELECT overall_score, risk_level, risk_factors, recommendations,
                  created_at, valid_until
           FROM ai_health_risk_scores
           WHERE patient_id = u.id
           ORDER BY created_at DESC
           LIMIT 1
         ) hrs ON u.id IS NOT NULL
         WHERE ce.corporate_id = :corporateId AND ce."isActive" = true
         ORDER BY ce."createdAt" DESC`,
        { replacements: { corporateId } }
      );
      const now = new Date();
      employees = rows.map((r) => {
        const riskLevel = r.risk_level || 'low';
        const riskScore = r.overall_score != null ? Math.round(r.overall_score * 10) : 30;
        const healthScore = 100 - riskScore;
        const assessmentDate = r.assessment_date ? r.assessment_date.toString().slice(0, 10) : null;
        const validUntil = r.valid_until ? new Date(r.valid_until) : null;
        let completionStatus = 'pending';
        if (assessmentDate) {
          completionStatus = validUntil && validUntil < now ? 'overdue' : 'completed';
        }
        const nextDue = validUntil
          ? validUntil.toISOString().slice(0, 10)
          : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const riskFactors = Array.isArray(r.risk_factors) ? r.risk_factors : [];
        const recommendations = Array.isArray(r.recommendations) ? r.recommendations : [];
        return {
          id: r.employeeId,
          employeeId: r.employeeId,
          name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || r.employeeId,
          email: r.email || '',
          department: r.department || 'General',
          designation: r.designation || '',
          age: 0,
          gender: 'unknown',
          riskScore,
          riskLevel,
          healthScore,
          lastAssessmentDate: assessmentDate || '',
          nextAssessmentDue: nextDue,
          completionStatus,
          riskFactors,
          recommendations,
          trendDirection: 'stable',
        };
      });
    }
    return res.json({ success: true, data: { employees } });
  } catch (err) {
    console.error('[corporate] GET /health-risk/employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch employee health risk data' });
  }
});

router.post('/employees', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  const { employeeId, name, email, phone, businessUnit, department, designation, joiningDate } = req.body || {};

  if (!name || !employeeId) {
    return res.status(400).json({ success: false, message: 'name and employeeId are required' });
  }

  try {
    const normalizedEmployeeId = String(employeeId).trim();
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

    // Creating an employee must not mutate an existing roster row: an existing
    // employee ID/email is a duplicate, and the explicit PUT endpoint remains
    // the only update path.
    const [existingById] = await postgresSequelize.query(
      `SELECT "employeeId" FROM corporate_employees
        WHERE corporate_id = :corporateId
          AND LOWER("employeeId") = LOWER(:employeeId)
        LIMIT 1`,
      { replacements: { corporateId, employeeId: normalizedEmployeeId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    if (existingById) {
      return res.status(409).json({
        success: false,
        code: 'duplicate_employee',
        field: 'employeeId',
        message: `Employee ID ${normalizedEmployeeId} already exists in this corporate`,
      });
    }

    if (normalizedEmail) {
      const [existingByEmail] = await postgresSequelize.query(
        `SELECT ce."employeeId" FROM corporate_employees ce
          LEFT JOIN users u ON u.id = ce."userId"
          WHERE ce.corporate_id = :corporateId
            AND LOWER(COALESCE(NULLIF(ce.email, ''), u.email)) = :email
          LIMIT 1`,
        { replacements: { corporateId, email: normalizedEmail }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (existingByEmail) {
        return res.status(409).json({
          success: false,
          code: 'duplicate_employee',
          field: 'email',
          message: `Employee email ${normalizedEmail} already exists in this corporate`,
        });
      }
    }

    const [firstName, ...lastNameParts] = String(name).trim().split(/\s+/);
    const metadata = JSON.stringify({
      firstName,
      lastName: lastNameParts.join(' '),
      profileActivation: 'inactive',
      activatedAt: null,
    });

    // Find the account this person already has before creating another — by
    // email, then staff code, then phone among this corporate's own people
    // (services/corporate-employee-identity.service.js). Matching on email
    // alone gave Dairy Day a second account for people already on it from an
    // earlier upload under a different address. Two candidates is refused:
    // a human picks which account survives.
    const normalizedPhone = phone ? String(phone).trim() : null;
    const identity = await findExistingEmployeeAccount({
      corporateId, email: normalizedEmail, employeeCode: normalizedEmployeeId, phone: normalizedPhone,
    });
    if (identity.ambiguous) {
      return res.status(409).json({
        success: false,
        code: 'duplicate_account',
        message: `This employee matches ${identity.candidates.length} existing accounts (${identity.candidates.join(', ')}). Resolve the duplicate before adding them.`,
      });
    }
    let linkedUserId = identity.userId || null;

    // No existing account to link — admin-provision one immediately rather than
    // waiting on self-registration, so the welcome notification below can hand
    // the employee a working login right away. Requires an email (users.email
    // has no safe placeholder to fall back to); without one the roster row is
    // created same as before and the employee still has the self-registration
    // path at /register.
    let newAccountCreated = false;
    let temporaryPassword = null;
    if (!linkedUserId && normalizedEmail) {
      const [corporateRecord] = await postgresSequelize.query(
        `SELECT id, "companyName", aggregator_id, aggregator_type, tenant_id FROM corporates WHERE id = :id AND status = 'Active' LIMIT 1`,
        { replacements: { id: corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (corporateRecord) {
        temporaryPassword = welcomeEmailService.generateSecurePassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        const [newUser] = await postgresSequelize.query(
          `INSERT INTO users (email, "phoneNumber", password, "firstName", "lastName", "emailVerified", "phoneVerified",
             status, "isVerified", "isCorporate", organization_id, organization_type, tenant_id,
             aggregator_id, aggregator_type, metadata, "createdAt", "updatedAt")
           VALUES (:email, :phone, :password, :firstName, :lastName, true, :phoneVerified,
             'active', true, true, :corporateId, 'corporate', :tenantId,
             :aggregatorId, :aggregatorType, '{"requirePasswordChange": true}'::jsonb, NOW(), NOW())
           RETURNING id`,
          {
            replacements: {
              email: normalizedEmail, phone: normalizedPhone || '', password: hashedPassword,
              firstName, lastName: lastNameParts.join(' ') || firstName, phoneVerified: !!normalizedPhone,
              corporateId, tenantId: corporateRecord.tenant_id || null,
              aggregatorId: corporateRecord.aggregator_id || null, aggregatorType: corporateRecord.aggregator_type || null,
            },
            type: postgresSequelize.QueryTypes.SELECT,
          }
        );
        if (newUser?.id) {
          linkedUserId = newUser.id;
          newAccountCreated = true;
        }
      }
    }

    // Resolved per call: the column exists only once 20261113000100 is applied.
    const rosterYearReady = await rosterFinancialYearAvailable();
    const [employeeRow] = await postgresSequelize.query(
      `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", email, business_unit, department, designation, "joiningDate", metadata, "isActive"${rosterYearReady ? ', roster_financial_year, roster_uploaded_at' : ''}, "createdAt", "updatedAt")
       VALUES (:corporateId, :userId, :employeeId, :email, :businessUnit, :department, :designation, :joiningDate, CAST(:metadata AS JSONB), true${rosterYearReady ? ', :rosterFinancialYear, NOW()' : ''}, NOW(), NOW())
       RETURNING unique_id`,
      { replacements: { corporateId, userId: linkedUserId, employeeId: normalizedEmployeeId, email: normalizedEmail, rosterFinancialYear: fiscalYearOf().label, businessUnit: businessUnit || null, department: department || null, designation: designation || '', joiningDate: joiningDate || null, metadata }, type: postgresSequelize.QueryTypes.SELECT }
    );
    const employeeUid = employeeRow?.unique_id || null;

    let appStatus = 'not_invited';
    if (linkedUserId) {
      await postgresSequelize.query(
        `INSERT INTO user_associations ("userId", "entityType", "entityId", role, status, metadata, corporate_unique_id, "createdAt", "updatedAt")
         SELECT :userId, 'corporate', :corporateId, 'employee', 'active',
                jsonb_build_object('employeeId', :employeeId::text, 'profileActivation', 'active'),
                (SELECT unique_id FROM corporates WHERE id = :corporateId), NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM user_associations WHERE "userId" = :userId AND "entityType" = 'corporate' AND "entityId" = :corporateId AND role = 'employee'
         )`,
        { replacements: { userId: linkedUserId, corporateId, employeeId: normalizedEmployeeId } }
      );
      await reactivateCorporateEmployeeAccount(linkedUserId);
      appStatus = 'active';
    }

    let welcomeDispatch = null;
    if (newAccountCreated && temporaryPassword) {
      const [corporateForWelcome] = await postgresSequelize.query(
        `SELECT "companyName" FROM corporates WHERE id = :id LIMIT 1`,
        { replacements: { id: corporateId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      try {
        welcomeDispatch = await dispatchCorporateEmployeeWelcomeEmail({
          welcomeEmailMode: 'send',
          welcomeEmailData: {
            email: normalizedEmail,
            firstName,
            lastName: lastNameParts.join(' '),
            companyName: corporateForWelcome?.companyName || '',
            employeeId: normalizedEmployeeId,
            department: department || '',
            loginUid: employeeUid,
          },
          temporaryPassword,
          userId: linkedUserId,
          corporateId,
        });
      } catch (dispatchError) {
        console.error('[corporate] POST /employees welcome dispatch failed:', dispatchError.message);
        welcomeDispatch = { emailStatus: 'failed', emailError: dispatchError.message };
      }
    }

    const created = {
      id: normalizedEmployeeId, employeeId: normalizedEmployeeId, uid: employeeUid, name,
      email: normalizedEmail || '', phone: normalizedPhone || '',
      businessUnit: businessUnit || '', department: department || '', designation: designation || '', joiningDate: joiningDate || '',
      healthStatus: 'good', lastCheckup: '', insurancePlan: 'Standard Plan', appStatus,
      accountProvisioned: newAccountCreated,
      welcomeNotification: welcomeDispatch ? { email: welcomeDispatch.emailStatus, sms: welcomeDispatch.smsStatus, whatsapp: welcomeDispatch.whatsappStatus } : null,
    };
    return res.status(201).json({ success: true, data: { employee: created } });
  } catch (err) {
    if (err instanceof EmployeeConflictError) {
      return res.status(409).json({ success: false, code: err.code, message: err.message });
    }
    console.error('[corporate] POST /employees error:', err.message);
    const databaseCode = err?.original?.code || err?.parent?.code || err?.code;
    if (isOneAccountPerPhoneViolation(err)) {
      return res.status(409).json({ success: false, code: 'duplicate_account', message: err?.original?.message || err.message });
    }
    if (databaseCode === '23505') {
      return res.status(409).json({
        success: false,
        code: 'duplicate_employee',
        message: 'An employee with this ID already exists in this corporate',
      });
    }
    return res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
});

router.put('/employees/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { businessUnit, department, designation, joiningDate, appStatus } = req.body || {};

  // appStatus is HR-driven app-access enable/disable; 'invited'/'active' via
  // signup and invite flows can't be forced here, but HR can always disable
  // or re-enable access for an employee.
  let metadataPatch = null;
  if (appStatus === 'inactive') metadataPatch = { appAccessDisabled: true };
  else if (appStatus === 'active') metadataPatch = { appAccessDisabled: false };

  try {
    const outcome = await postgresSequelize.transaction(async (transaction) => {
      const [rows] = await postgresSequelize.query(
        `UPDATE corporate_employees SET
           business_unit=COALESCE(:businessUnit, business_unit),
           department=COALESCE(:department, department),
           designation=COALESCE(:designation, designation),
           "joiningDate"=COALESCE(:joiningDate, "joiningDate"),
           metadata=CASE WHEN :metadataPatch::jsonb IS NOT NULL THEN COALESCE(metadata, '{}'::jsonb) || :metadataPatch::jsonb ELSE metadata END,
           "updatedAt"=NOW()
         WHERE corporate_id=:corporateId AND "employeeId"=:id RETURNING *`,
        {
          transaction, replacements: {
            corporateId, id,
            businessUnit: businessUnit || null, department: department || null, designation: designation || null, joiningDate: joiningDate || null,
            metadataPatch: metadataPatch ? JSON.stringify(metadataPatch) : null,
          },
        }
      );
      if (!rows.length) return { statusCode: 404, body: { success: false, message: 'Employee not found' } };
      await accessAudit.record(req, { resourceId: `employee:${id}`, title: 'Employee profile and app access', action: metadataPatch ? (appStatus === 'inactive' ? 'disable_app' : 'enable_app') : 'update' }, transaction);
      return { statusCode: 200, body: { success: true, data: { employee: { ...rows[0], businessUnit: rows[0].business_unit || businessUnit || '', ...(req.body || {}) } } } };
    });
    return res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    console.error('[corporate] PUT /employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
});

router.delete('/employees/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { exitDate, exitReason } = req.body || {};
  const metadataPatch = exitReason ? JSON.stringify({ exitReason }) : null;

  try {
    const outcome = await postgresSequelize.transaction(async (transaction) => {
      const [rows] = await postgresSequelize.query(
        `UPDATE corporate_employees SET
           "isActive"=false,
           "exitDate"=COALESCE(:exitDate::date, "exitDate", CURRENT_DATE),
           metadata=CASE WHEN :metadataPatch::jsonb IS NOT NULL THEN COALESCE(metadata, '{}'::jsonb) || :metadataPatch::jsonb ELSE metadata END,
           "updatedAt"=NOW()
         WHERE corporate_id=:corporateId AND "employeeId"=:id RETURNING id,"employeeId","userId"`,
        { transaction, replacements: { corporateId, id, exitDate: exitDate || null, metadataPatch } }
      );
      if (!rows.length) return { statusCode: 404, body: { success: false, message: 'Employee not found' } };
      await synchronizeCorporateEmployment(postgresSequelize,corporateId,rows,false,transaction);
      await accessAudit.record(req, { resourceId: `employee:${id}`, title: 'Employee offboarding', action: 'deactivate' }, transaction);
      return { statusCode: 200, body: { success: true } };
    });
    return res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    console.error('[corporate] DELETE /employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete employee' });
  }
});

// Bulk upload employees from CSV/Excel — persists to DB
router.post('/employees/bulk-upload', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  const { employees: employeeList } = req.body;
  if (!Array.isArray(employeeList) || employeeList.length === 0) {
    return res.status(400).json({ success: false, message: 'employees array is required and must not be empty' });
  }

  const successfulUploads = [];
  const errors = [];

  for (let index = 0; index < employeeList.length; index++) {
    const emp = employeeList[index];
    if (!emp.name || !emp.employeeId) {
      const missing = [!emp.name && 'name', !emp.employeeId && 'employeeId'].filter(Boolean).join(' and ');
      errors.push({ row: index + 1, employee: emp, error: `Missing required field${missing.includes(' and ') ? 's' : ''}: ${missing}` });
      continue;
    }

    try {
      const generatedEmployeeId = String(emp.employeeId).trim();
      const [firstName, ...lastNameParts] = String(emp.name).trim().split(/\s+/);
      const metadata = JSON.stringify({
        firstName,
        lastName: lastNameParts.join(' '),
        profileActivation: 'inactive',
        activatedAt: null,
      });

      // Insert a new corporate_employees record; duplicates are reported per row.
      const normalizedEmail = emp.email ? String(emp.email).trim().toLowerCase() : null;
      const [existingById] = await postgresSequelize.query(
        `SELECT "employeeId" FROM corporate_employees
          WHERE corporate_id = :corporateId
            AND LOWER("employeeId") = LOWER(:employeeId)
          LIMIT 1`,
        { replacements: { corporateId, employeeId: generatedEmployeeId }, type: postgresSequelize.QueryTypes.SELECT }
      );
      if (existingById) {
        // The employer uploads its list once per financial year, so next
        // April's file contains most of the same staff codes. Rejecting them
        // would reject nearly every row; the row is REFRESHED instead and
        // re-stamped with the current year, which is what marks the employee
        // live for it.
        const rosterYearReady = await rosterFinancialYearAvailable();
        const rosterFinancialYear = fiscalYearOf().label;
        await postgresSequelize.query(
          `UPDATE corporate_employees SET
             email = COALESCE(NULLIF(:email, ''), email),
             business_unit = COALESCE(:businessUnit, business_unit),
             department = COALESCE(:department, department),
             designation = COALESCE(NULLIF(:designation, ''), designation),
             "isActive" = true,
             "exitDate" = NULL,
             ${rosterYearReady ? 'roster_financial_year = :rosterFinancialYear, roster_uploaded_at = NOW(),' : ''}
             "updatedAt" = NOW()
           WHERE corporate_id = :corporateId AND LOWER("employeeId") = LOWER(:employeeId)`,
          { replacements: {
              corporateId, employeeId: generatedEmployeeId, email: normalizedEmail,
              businessUnit: emp.businessUnit || emp.business_unit || null,
              department: emp.department || null, designation: emp.designation || '',
              rosterFinancialYear,
            }, type: postgresSequelize.QueryTypes.UPDATE }
        );
        successfulUploads.push({ employeeId: generatedEmployeeId, uid: null, name: emp.name,
          linked: true, accountProvisioned: false, refreshed: true, financialYear: rosterFinancialYear });
        continue;
      }
      if (normalizedEmail) {
        const [existingByEmail] = await postgresSequelize.query(
          `SELECT ce."employeeId" FROM corporate_employees ce
            LEFT JOIN users u ON u.id = ce."userId"
            WHERE ce.corporate_id = :corporateId
              AND LOWER(COALESCE(NULLIF(ce.email, ''), u.email)) = :email
            LIMIT 1`,
          { replacements: { corporateId, email: normalizedEmail }, type: postgresSequelize.QueryTypes.SELECT }
        );
        if (existingByEmail && String(existingByEmail.employeeId).toLowerCase() !== generatedEmployeeId.toLowerCase()) {
          // Still a real conflict: the same address arriving under a different
          // staff code means two codes claim one person.
          errors.push({ row: index + 1, employee: emp, error: `Employee email ${normalizedEmail} already belongs to ${existingByEmail.employeeId} in this corporate` });
          continue;
        }
      }
      // Find the account this employee already has before creating another.
      // Matching on the address alone created 367 second accounts in one
      // Equitas upload: the employer changed mail domain and its older accounts
      // carry the staff code inside a placeholder address, so every returning
      // employee looked new. The staff code is the authoritative key.
      const normalizedPhone = emp.phone ? String(emp.phone).trim() : null;
      let linkedUserId = null;
      const identity = await findExistingEmployeeAccount({
        corporateId, email: normalizedEmail, employeeCode: generatedEmployeeId, phone: normalizedPhone,
      });
      if (identity.ambiguous) {
        // Two accounts under one code: a human must choose which survives.
        // Guessing attaches the benefit to an account the employee may not be
        // able to sign in to.
        errors.push({ row: index + 1, employee: emp,
          error: `${generatedEmployeeId} matches ${identity.candidates.length} existing accounts (${identity.candidates.join(', ')}) — resolve the duplicate before uploading this row` });
        continue;
      }
      if (identity.userId) linkedUserId = identity.userId;

      // No existing account — admin-provision one immediately (same as single add).
      let newAccountCreated = false;
      let temporaryPassword = null;
      if (!linkedUserId && normalizedEmail) {
        const [corporateRecord] = await postgresSequelize.query(
          `SELECT id, "companyName", aggregator_id, aggregator_type, tenant_id FROM corporates WHERE id = :id AND status = 'Active' LIMIT 1`,
          { replacements: { id: corporateId }, type: postgresSequelize.QueryTypes.SELECT }
        );
        if (corporateRecord) {
          temporaryPassword = welcomeEmailService.generateSecurePassword();
          const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
          const [newUser] = await postgresSequelize.query(
            `INSERT INTO users (email, "phoneNumber", password, "firstName", "lastName", "emailVerified", "phoneVerified",
               status, "isVerified", "isCorporate", organization_id, organization_type, tenant_id,
               aggregator_id, aggregator_type, metadata, "createdAt", "updatedAt")
             VALUES (:email, :phone, :password, :firstName, :lastName, true, :phoneVerified,
               'active', true, true, :corporateId, 'corporate', :tenantId,
               :aggregatorId, :aggregatorType, '{"requirePasswordChange": true}'::jsonb, NOW(), NOW())
             RETURNING id`,
            {
              replacements: {
                email: normalizedEmail, phone: normalizedPhone || '', password: hashedPassword,
                firstName, lastName: lastNameParts.join(' ') || firstName, phoneVerified: !!normalizedPhone,
                corporateId, tenantId: corporateRecord.tenant_id || null,
                aggregatorId: corporateRecord.aggregator_id || null, aggregatorType: corporateRecord.aggregator_type || null,
              },
              type: postgresSequelize.QueryTypes.SELECT,
            }
          );
          if (newUser?.id) {
            linkedUserId = newUser.id;
            newAccountCreated = true;
          }
        }
      }

      const rosterYearReady = await rosterFinancialYearAvailable();
      const [employeeRow] = await postgresSequelize.query(
        `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", email, business_unit, department, designation, "joiningDate", metadata, "isActive"${rosterYearReady ? ', roster_financial_year, roster_uploaded_at' : ''}, "createdAt", "updatedAt")
         VALUES (:corporateId, :userId, :employeeId, :email, :businessUnit, :department, :designation, :joiningDate, CAST(:metadata AS JSONB), true${rosterYearReady ? ', :rosterFinancialYear, NOW()' : ''}, NOW(), NOW())
         RETURNING unique_id`,
        { replacements: { corporateId, userId: linkedUserId, employeeId: generatedEmployeeId, email: normalizedEmail, rosterFinancialYear: fiscalYearOf().label, businessUnit: emp.businessUnit || emp.business_unit || null, department: emp.department || null, designation: emp.designation || '', joiningDate: emp.joiningDate || null, metadata }, type: postgresSequelize.QueryTypes.SELECT }
      );
      const employeeUid = employeeRow?.unique_id || null;

      if (linkedUserId) {
        await postgresSequelize.query(
          `INSERT INTO user_associations ("userId", "entityType", "entityId", role, status, metadata, corporate_unique_id, "createdAt", "updatedAt")
           SELECT :userId, 'corporate', :corporateId, 'employee', 'active',
                  jsonb_build_object('employeeId', :employeeId::text, 'profileActivation', 'active'),
                  (SELECT unique_id FROM corporates WHERE id = :corporateId), NOW(), NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM user_associations WHERE "userId" = :userId AND "entityType" = 'corporate' AND "entityId" = :corporateId AND role = 'employee'
           )`,
          { replacements: { userId: linkedUserId, corporateId, employeeId: generatedEmployeeId } }
        );
        await reactivateCorporateEmployeeAccount(linkedUserId);
      }

      // Fire-and-forget — a large roster upload must not hang the HTTP response
      // waiting on hundreds of emails/SMS/WhatsApp sends.
      if (newAccountCreated && temporaryPassword) {
        (async () => {
          try {
            const [corporateForWelcome] = await postgresSequelize.query(
              `SELECT "companyName" FROM corporates WHERE id = :id LIMIT 1`,
              { replacements: { id: corporateId }, type: postgresSequelize.QueryTypes.SELECT }
            );
            await dispatchCorporateEmployeeWelcomeEmail({
              welcomeEmailMode: 'send',
              welcomeEmailData: {
                email: normalizedEmail,
                firstName,
                lastName: lastNameParts.join(' '),
                companyName: corporateForWelcome?.companyName || '',
                employeeId: generatedEmployeeId,
                department: emp.department || '',
                loginUid: employeeUid,
              },
              temporaryPassword,
              userId: linkedUserId,
              corporateId,
            });
          } catch (dispatchError) {
            console.error(`[corporate] bulk-upload welcome dispatch failed for row ${index + 1}:`, dispatchError.message);
          }
        })();
      }

      successfulUploads.push({ employeeId: generatedEmployeeId, uid: employeeUid, name: emp.name, linked: Boolean(linkedUserId), accountProvisioned: newAccountCreated });
    } catch (rowErr) {
      errors.push({ row: index + 1, employee: emp, error: rowErr.message });
    }
  }

  return res.status(201).json({
    success: true,
    data: {
      summary: { total: employeeList.length, successful: successfulUploads.length, failed: errors.length },
      employees: successfulUploads,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
});

// Download employee template CSV
router.get('/employees/download-template', authCorporate, async (req, res) => {
  const csvHeader = 'employeeId,name,email,phone,businessUnit,department,designation,joiningDate\n';
  const csvSample = 'EMP001,John Doe,john.doe@example.com,+919876543210,Technology BU,Engineering,Software Engineer,2024-01-15\n';
  const csvTemplate = csvHeader + csvSample;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_template.csv"');
  res.send(csvTemplate);
});

// Send an "activate your Mediczy app account" invite email to an employee
// on file. Requires a real email address (from corporate_employees.email or
// a linked users row) — there is no other channel to deliver this to.
router.post('/employees/send-invite', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { employeeId } = req.body || {};
  if (!corporateId || !employeeId) {
    return res.status(400).json({ success: false, message: 'employeeId is required' });
  }

  try {
    const [[row]] = await postgresSequelize.query(
      `SELECT ce.email AS on_file_email, ce.metadata, ce."userId", u.email AS user_email, u."firstName", u."lastName"
       FROM corporate_employees ce
       LEFT JOIN users u ON u.id = ce."userId"
       WHERE ce.corporate_id = :corporateId AND ce."employeeId" = :employeeId`,
      { replacements: { corporateId, employeeId } }
    );
    if (!row) return res.status(404).json({ success: false, message: 'Employee not found' });

    const email = row.user_email || row.on_file_email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'No email on file for this employee. Add one via Edit Employee first.' });
    }

    const meta = row.metadata || {};
    const firstName = row.firstName || meta.firstName || 'there';
    const lastName = row.lastName || meta.lastName || '';

    // corporate_employees.email doesn't get a Mediczy account created until
    // the employee self-activates via their Employee ID (user.route.js), so
    // this invite points them at that flow rather than pre-provisioning a
    // password — email.service.js (the other candidate here) is CJS-style
    // `require()` code that throws under this project's ESM runtime, so it
    // cannot be used for this or any other transactional email.
    const { sendTransactionalEmail } = await import('../services/welcome-email.service.js');
    await sendTransactionalEmail({
      to: email,
      subject: `You're invited to My SmartHealth`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0f766e;">Hi ${firstName},</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #374151;">
            Your employer has set up your health benefits account on My SmartHealth.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #374151;">
            Activate it using your Employee ID: <strong>${employeeId}</strong>
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://app.mediqzy.com/register" style="background-color: #0f766e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Activate My Account →
            </a>
          </div>
        </div>
      `,
    });

    await postgresSequelize.query(
      `UPDATE corporate_employees SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('invitedAt', :invitedAt::text), "updatedAt" = NOW()
       WHERE corporate_id = :corporateId AND "employeeId" = :employeeId`,
      { replacements: { corporateId, employeeId, invitedAt: new Date().toISOString() } }
    );

    return res.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('[corporate] POST /employees/send-invite error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send invite' });
  }
});

// Trigger the standard employee-facing password-reset OTP flow on behalf of
// HR. HR never sets or sees the password — this only sends the same
// email/SMS/WhatsApp OTP an employee would get from "Forgot password".
router.post('/employees/reset-password', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { employeeId } = req.body || {};
  if (!corporateId || !employeeId) {
    return res.status(400).json({ success: false, message: 'employeeId is required' });
  }

  try {
    const [[row]] = await postgresSequelize.query(
      `SELECT ce.email AS on_file_email, ce."userId", u.email AS user_email
       FROM corporate_employees ce
       LEFT JOIN users u ON u.id = ce."userId"
       WHERE ce.corporate_id = :corporateId AND ce."employeeId" = :employeeId`,
      { replacements: { corporateId, employeeId } }
    );
    if (!row) return res.status(404).json({ success: false, message: 'Employee not found' });

    if (!row.userId) {
      return res.status(400).json({ success: false, message: 'This employee has not activated their app account yet — send an invite instead.' });
    }

    const email = row.user_email || row.on_file_email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'No email on file for this employee.' });
    }

    const passwordResetService = (await import('../services/password-reset.service.js')).default;
    const result = await passwordResetService.requestPasswordReset({ email, userType: 'user' });

    if (!result?.success) {
      return res.status(400).json({ success: false, message: result?.message || 'Failed to start password reset' });
    }

    return res.json({ success: true, message: `Password reset code sent to ${email}` });
  } catch (err) {
    console.error('[corporate] POST /employees/reset-password error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to trigger password reset' });
  }
});

// ---------------------------------------------------------------------------
// Corporate portal: Business Units
// ---------------------------------------------------------------------------

async function withComputedHeadcount(rows, corporateId, groupColumn) {
  if (rows.length === 0) return rows;
  const [countRows] = await postgresSequelize.query(
    `SELECT ${groupColumn} AS name, COUNT(*)::int AS cnt
       FROM corporate_employees
      WHERE corporate_id = :corporateId AND "isActive" = true AND ${groupColumn} IS NOT NULL
      GROUP BY ${groupColumn}`,
    { replacements: { corporateId } }
  );
  const counts = Object.fromEntries(countRows.map((r) => [String(r.name).toLowerCase(), r.cnt]));
  return rows.map((r) => ({ ...r, employeeCount: counts[String(r.name).toLowerCase()] || 0, healthScore: null, checkupCompletion: null }));
}

router.get('/business-units', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!corporateId) return res.json({ success: true, data: { businessUnits: [] } });
  const [rows] = await postgresSequelize.query(
    `SELECT id, name, head, budget, region, description FROM corporate_business_units
      WHERE corporate_id = :corporateId ORDER BY created_at DESC`,
    { replacements: { corporateId } }
  );
  let units = await withComputedHeadcount(rows, corporateId, 'business_unit');
  if (q) units = units.filter((u) => [u.name, u.head, u.region].some((f) => String(f || '').toLowerCase().includes(q)));
  return res.json({ success: true, data: { businessUnits: units } });
});

router.post('/business-units', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { name, head, budget, region, description } = req.body || {};
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });
  const [rows] = await postgresSequelize.query(
    `INSERT INTO corporate_business_units (corporate_id, name, head, budget, region, description)
     VALUES (:corporateId, :name, :head, :budget, :region, :description)
     RETURNING id, name, head, budget, region, description`,
    { replacements: { corporateId, name, head: head || 'Unassigned', budget: budget || null, region: region || null, description: description || null } }
  );
  return res.status(201).json({ success: true, data: { businessUnit: { ...rows[0], employeeCount: 0, healthScore: null, checkupCompletion: null } } });
});

router.put('/business-units/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { name, head, budget, region, description } = req.body || {};
  const [rows] = await postgresSequelize.query(
    `UPDATE corporate_business_units SET
       name = COALESCE(:name, name), head = COALESCE(:head, head), budget = COALESCE(:budget, budget),
       region = COALESCE(:region, region), description = COALESCE(:description, description), updated_at = NOW()
     WHERE id = :id AND corporate_id = :corporateId
     RETURNING id, name, head, budget, region, description`,
    { replacements: { id, corporateId, name: name ?? null, head: head ?? null, budget: budget ?? null, region: region ?? null, description: description ?? null } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Business unit not found' });
  return res.json({ success: true, data: { businessUnit: rows[0] } });
});

router.delete('/business-units/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `DELETE FROM corporate_business_units WHERE id = :id AND corporate_id = :corporateId RETURNING id`,
    { replacements: { id, corporateId } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Business unit not found' });
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Corporate portal: Departments
// ---------------------------------------------------------------------------

router.get('/departments', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!corporateId) return res.json({ success: true, data: { departments: [] } });
  const [rows] = await postgresSequelize.query(
    `SELECT id, name, manager, budget, location, description FROM corporate_departments
      WHERE corporate_id = :corporateId ORDER BY created_at DESC`,
    { replacements: { corporateId } }
  );
  let departments = await withComputedHeadcount(rows, corporateId, 'department');
  if (q) {
    departments = departments.filter((d) =>
      [d.name, d.manager, d.location].some((field) => String(field || '').toLowerCase().includes(q))
    );
  }
  return res.json({ success: true, data: { departments } });
});

router.post('/departments', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { name, manager, budget, location, description } = req.body || {};
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });
  const [rows] = await postgresSequelize.query(
    `INSERT INTO corporate_departments (corporate_id, name, manager, budget, location, description)
     VALUES (:corporateId, :name, :manager, :budget, :location, :description)
     RETURNING id, name, manager, budget, location, description`,
    { replacements: { corporateId, name, manager: manager || 'Unassigned', budget: budget || null, location: location || null, description: description || null } }
  );
  return res.status(201).json({ success: true, data: { department: { ...rows[0], employeeCount: 0, healthScore: null, checkupCompletion: null } } });
});

router.put('/departments/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { name, manager, budget, location, description } = req.body || {};
  const [rows] = await postgresSequelize.query(
    `UPDATE corporate_departments SET
       name = COALESCE(:name, name), manager = COALESCE(:manager, manager), budget = COALESCE(:budget, budget),
       location = COALESCE(:location, location), description = COALESCE(:description, description), updated_at = NOW()
     WHERE id = :id AND corporate_id = :corporateId
     RETURNING id, name, manager, budget, location, description`,
    { replacements: { id, corporateId, name: name ?? null, manager: manager ?? null, budget: budget ?? null, location: location ?? null, description: description ?? null } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Department not found' });
  return res.json({ success: true, data: { department: rows[0] } });
});

router.delete('/departments/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `DELETE FROM corporate_departments WHERE id = :id AND corporate_id = :corporateId RETURNING id`,
    { replacements: { id, corporateId } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Department not found' });
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Corporate portal: Reports
// ---------------------------------------------------------------------------

function reportRowShape(r) {
  return {
    id: String(r.id),
    title: r.title,
    description: `${r.category || 'Custom'} report for ${r.period || 'the requested period'}`,
    category: r.category,
    generatedDate: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
    period: r.period,
    periodStart: r.period_start || null,
    periodEnd: r.period_end || null,
    format: r.format,
    size: '—',
    status: r.status,
    reportKey: r.report_key || null,
    scheduledFrequency: r.scheduled_frequency || null,
    deliveryStatus: r.delivery_status || 'not_sent',
    deliveredAt: r.delivered_at || null,
    metrics: r.metrics || {},
  };
}

router.get('/reports', authCorporate, async (req, res) => {
  const corporateId = resolveCorporateIdFromUser(req.user);
  if (!corporateId) return res.json({ success: true, data: { reports: [] } });
  const [rows] = await postgresSequelize.query(
    `SELECT id, title, category, period, period_start, period_end, format, status, created_at,
            report_key, scheduled_frequency, delivery_status, delivered_at, metrics
       FROM corporate_generated_reports WHERE corporate_id = :corporateId
      ORDER BY created_at DESC`,
    { replacements: { corporateId } }
  );
  return res.json({ success: true, data: { reports: rows.map(reportRowShape) } });
});

router.post('/reports/generate', authCorporate, async (req, res) => {
  const corporateId = resolveCorporateIdFromUser(req.user);
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  const { type, period, format } = req.body || {};
  if (String(type || '').toLowerCase().includes('mis')) {
    const report = await generateCorporateMisReport(corporateId, {
      period: period || 'previous_week',
      generatedBy: req.user?.userId || req.user?.id || null,
    });
    return res.status(201).json({ success: true, data: { report: reportRowShape(report) } });
  }

  const [rows] = await postgresSequelize.query(
    `INSERT INTO corporate_generated_reports (corporate_id, title, category, period, format, status, generated_by)
     VALUES (:corporateId, :title, :category, :period, :format, 'ready', :generatedBy)
     RETURNING id, title, category, period, format, status, created_at`,
    {
      replacements: {
        corporateId,
        title: type || 'Custom Report',
        category: type || 'Custom',
        period: period || 'Custom',
        format: format || 'CSV',
        generatedBy: req.user?.id || null,
      },
    }
  );
  return res.status(201).json({ success: true, data: { report: reportRowShape(rows[0]) } });
});

router.post('/reports/weekly-mis/generate', authCorporate, async (req, res) => {
  try {
    const corporateId = resolveCorporateIdFromUser(req.user);
    if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
    const report = await generateCorporateMisReport(corporateId, {
      period: req.body?.period || 'previous_week',
      periodStart: req.body?.periodStart,
      periodEnd: req.body?.periodEnd,
      generatedBy: req.user?.userId || req.user?.id || null,
    });
    return res.status(201).json({ success: true, data: { report: reportRowShape(report) } });
  } catch (error) {
    console.error('[corporate] weekly MIS generation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate weekly MIS report' });
  }
});

router.get('/reports/:id/preview', authCorporate, async (req, res) => {
  const corporateId = resolveCorporateIdFromUser(req.user);
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `SELECT id, title, category, period, period_start, period_end, format, status, created_at,
            report_key, scheduled_frequency, delivery_status, delivered_at, metrics
       FROM corporate_generated_reports WHERE id = :id AND corporate_id = :corporateId`,
    { replacements: { id, corporateId } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Report not found' });
  return res.json({ success: true, data: { report: reportRowShape(rows[0]) } });
});

router.get('/reports/:id/download', authCorporate, async (req, res) => {
  try {
  res.setHeader('Cache-Control', 'no-store');
  const corporateId = resolveCorporateIdFromUser(req.user);
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `SELECT id, title, category, period, period_start, period_end, format, status, created_at,
            report_key, scheduled_frequency, delivery_status, delivered_at, metrics
       FROM corporate_generated_reports WHERE id = :id AND corporate_id = :corporateId`,
    { replacements: { id, corporateId } }
  );
  const report = rows[0];
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

  // Pull real underlying data for the report's category rather than just echoing metadata.
  let reportRows, reportHeaders;
  const category = String(report.category || '').toLowerCase();
  if (category === 'mis' || String(report.report_key || '').startsWith('weekly-mis-')) {
    const metrics = report?.metrics && Object.keys(report.metrics).length
      ? report.metrics
      : await buildCorporateMisMetrics(corporateId, new Date(report.period_start).toISOString().slice(0, 10), new Date(report.period_end).toISOString().slice(0, 10));
    reportRows = misMetricsToRows(metrics).map((row) => ({
      period_start: metrics.periodStart || new Date(report.period_start).toISOString().slice(0, 10),
      period_end: metrics.periodEnd || new Date(report.period_end).toISOString().slice(0, 10),
      metric: row.metric,
      value: row.value,
    }));
    reportHeaders = ['period_start', 'period_end', 'metric', 'value'];
  } else if (category.includes('claim')) {
    const [claimRows] = await postgresSequelize.query(
      `SELECT ic.claim_number, ic.claim_type, ic.claim_amount, ic.status, ic.submitted_date
         FROM insurance_claims ic
         JOIN user_associations ua ON ua."userId" = ic.patient_id
        WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
          AND EXISTS (SELECT 1 FROM corporate_employees ce
            JOIN corporate_employee_consents consent ON consent.corporate_id = ce.corporate_id
              AND consent.employee_id = ce."employeeId" AND consent.consent_type = 'health_data'
              AND consent.granted = true AND consent.revoked_at IS NULL
            WHERE ce.corporate_id = :corporateId AND ce."isActive" = true AND ce."userId" = ic.patient_id)
        ORDER BY ic.submitted_date DESC`,
      { replacements: { corporateId } }
    );
    reportRows = claimRows;
    reportHeaders = ['claim_number', 'claim_type', 'claim_amount', 'status', 'submitted_date'];
  } else if (category.includes('risk') || category.includes('health')) {
    const [riskRows] = await postgresSequelize.query(
      `SELECT u."firstName", u."lastName", r.risk_level, r.overall_score, r.created_at
         FROM ai_health_risk_scores r
         JOIN user_associations ua ON ua."userId" = r.patient_id
         JOIN users u ON u.id = r.patient_id
        WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
          AND EXISTS (SELECT 1 FROM corporate_employees ce
            JOIN corporate_employee_consents consent ON consent.corporate_id = ce.corporate_id
              AND consent.employee_id = ce."employeeId" AND consent.consent_type = 'health_data'
              AND consent.granted = true AND consent.revoked_at IS NULL
            WHERE ce.corporate_id = :corporateId AND ce."isActive" = true AND ce."userId" = r.patient_id)
        ORDER BY r.created_at DESC`,
      { replacements: { corporateId } }
    );
    reportRows = riskRows;
    reportHeaders = ['firstName', 'lastName', 'risk_level', 'overall_score', 'created_at'];
  } else {
    const [empRows] = await postgresSequelize.query(
      `SELECT ce."employeeId", ce.department, ce.designation, u."firstName", u."lastName", u.email
         FROM corporate_employees ce LEFT JOIN users u ON u.id = ce."userId"
        WHERE ce.corporate_id = :corporateId AND ce."isActive" = true`,
      { replacements: { corporateId } }
    );
    reportRows = empRows;
    reportHeaders = ['employeeId', 'department', 'designation', 'firstName', 'lastName', 'email'];
  }

  await accessAudit.record(req, { resourceId: report.id, title: report.title, action: 'download' });
  const format = String(req.query.format || report.format || 'csv').toLowerCase();

  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(String(report.title || 'Report').slice(0, 31));
    sheet.columns = reportHeaders.map((h) => ({ header: h, key: h, width: Math.min(40, Math.max(14, h.length + 4)) }));
    for (const row of reportRows) sheet.addRow(row);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=RPT${report.id}.xlsx`);
    return res.status(200).send(Buffer.from(buffer));
  }

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=RPT${report.id}.pdf`);
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: reportHeaders.length > 5 ? 'landscape' : 'portrait' });
    doc.pipe(res);
    doc.fontSize(16).font('Helvetica-Bold').text(report.title || 'Report', { align: 'center' }).moveDown(1);
    doc.fontSize(9).font('Helvetica-Bold');
    const colWidth = (doc.page.width - 80) / reportHeaders.length;
    let y = doc.y;
    reportHeaders.forEach((h, i) => doc.text(h, 40 + i * colWidth, y, { width: colWidth }));
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8);
    for (const row of reportRows) {
      y = doc.y;
      if (y > doc.page.height - 60) { doc.addPage(); y = doc.y; }
      reportHeaders.forEach((h, i) => doc.text(String(row?.[h] ?? ''), 40 + i * colWidth, y, { width: colWidth }));
      doc.moveDown(0.8);
    }
    doc.end();
    return;
  }

  const csv = toCsv(reportRows, reportHeaders);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=RPT${report.id}.csv`);
  return res.status(200).send(csv);
  } catch (error) {
    console.error('[corporate] report export failed:', error.message);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Report could not be downloaded' });
    res.destroy();
  }
});

// ---------------------------------------------------------------------------
// Corporate portal: Risk monitor alert configuration
// ---------------------------------------------------------------------------

router.get('/risk-monitor/alerts', authCorporate, async (req, res) => {
  try {
    const [rows]=await postgresSequelize.query('SELECT settings FROM corporate_settings WHERE corporate_id=:corporateId',{replacements:{corporateId:req.user.corporateId}});
    return res.json({success:true,data:{config:rows[0]?.settings?.riskAlerts||DEFAULT_RISK_ALERTS}});
  }catch{return res.status(500).json({success:false,message:'Risk alert settings could not be loaded'});}
});
router.put('/risk-monitor/alerts', authCorporate, async (req, res) => {
  const config=req.body,thresholds=config?.thresholds;
  if(['enabled','notifyEmail','notifySms'].some(key=>typeof config?.[key]!=='boolean')||!thresholds||['medium','high','critical'].some(key=>typeof thresholds[key]!=='number'||!Number.isFinite(thresholds[key])||thresholds[key]<0||thresholds[key]>100)||thresholds.medium>thresholds.high||thresholds.high>thresholds.critical)return res.status(400).json({success:false,message:'Provide valid alert channels and increasing thresholds from 0 to 100'});
  const clean={enabled:config.enabled,notifyEmail:config.notifyEmail,notifySms:config.notifySms,thresholds:{medium:thresholds.medium,high:thresholds.high,critical:thresholds.critical}};
  try{
    await postgresSequelize.transaction(async transaction=>{
      await postgresSequelize.query(`INSERT INTO corporate_settings(corporate_id,settings) VALUES(:corporateId,jsonb_build_object('riskAlerts',:config::jsonb)) ON CONFLICT(corporate_id) DO UPDATE SET settings=jsonb_set(corporate_settings.settings,'{riskAlerts}',:config::jsonb),"updatedAt"=NOW()`,{transaction,replacements:{corporateId:req.user.corporateId,config:JSON.stringify(clean)}});
      await accessAudit.record(req,{resourceId:'risk-alerts',title:'Risk alert preferences',action:'update'},transaction);
    });return res.json({success:true,data:{config:clean}});
  }catch{return res.status(500).json({success:false,message:'Risk alert settings could not be saved'});}
});

router.get('/risk-monitor/export', authCorporate, async (req, res) => {
  try {
  res.setHeader('Cache-Control', 'no-store');
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  let rows = [];
  if (corporateId) {
    const [dbRows] = await postgresSequelize.query(
      `SELECT
         ce."employeeId",
         COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), u.email, ce."employeeId") AS name,
         ce.department,
         COALESCE(r.risk_level, 'not_assessed') AS "healthStatus",
         to_char(r.created_at, 'YYYY-MM-DD') AS "lastCheckup"
       FROM corporate_employees ce
       LEFT JOIN users u ON u.id = ce."userId"
       LEFT JOIN LATERAL (
         SELECT risk_level, created_at FROM ai_health_risk_scores
          WHERE patient_id = ce."userId" ORDER BY created_at DESC LIMIT 1
       ) r ON true
       WHERE ce.corporate_id = :corporateId AND ce."isActive" = true
         AND EXISTS (SELECT 1 FROM corporate_employee_consents consent
           WHERE consent.corporate_id = ce.corporate_id AND consent.employee_id = ce."employeeId"
             AND consent.consent_type = 'health_data' AND consent.granted = true AND consent.revoked_at IS NULL)
       ORDER BY ce."createdAt" DESC`,
      { replacements: { corporateId } }
    );
    rows = dbRows;
  }
  await accessAudit.record(req, { resourceId: 'risk-monitor', title: 'Employee risk export', action: 'export' });
  const csv = toCsv(rows, ['employeeId', 'name', 'department', 'healthStatus', 'lastCheckup']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=risk-monitor.csv');
  return res.status(200).send(csv);
  } catch (error) {
    console.error('[corporate] report export failed:', error.message);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Report could not be downloaded' });
    res.destroy();
  }
});

// ---------------------------------------------------------------------------
// Corporate portal: Complaints
// ---------------------------------------------------------------------------

router.get('/complaints', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  if (!corporateId) return res.json({ success: true, data: { complaints: [] } });

  let sql = `SELECT id, employee_name AS "employeeName", employee_id AS "employeeId", category, subject, description,
                    priority, status, assigned_to AS "assignedTo",
                    to_char(submitted_date, 'YYYY-MM-DD') AS "submittedDate",
                    to_char(updated_at, 'YYYY-MM-DD') AS "lastUpdate"
               FROM corporate_complaints WHERE corporate_id = :corporateId`;
  const replacements = { corporateId };
  if (status && status !== 'all') { sql += ' AND status = :status'; replacements.status = status; }
  sql += ' ORDER BY submitted_date DESC';
  const [rows] = await postgresSequelize.query(sql, { replacements });

  let complaints = rows;
  if (q) {
    complaints = complaints.filter((c) =>
      [c.employeeName, c.subject, c.category].some((field) => String(field || '').toLowerCase().includes(q))
    );
  }
  return res.json({ success: true, data: { complaints } });
});

router.post('/complaints', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { category, subject, description, priority, employeeName, employeeId } = req.body || {};
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  if (!category || !subject || !description) {
    return res.status(400).json({ success: false, message: 'category, subject, and description are required' });
  }
  const [rows] = await postgresSequelize.query(
    `INSERT INTO corporate_complaints (corporate_id, employee_name, employee_id, category, subject, description, priority)
     VALUES (:corporateId, :employeeName, :employeeId, :category, :subject, :description, :priority)
     RETURNING id, employee_name AS "employeeName", employee_id AS "employeeId", category, subject, description,
               priority, status, assigned_to AS "assignedTo",
               to_char(submitted_date, 'YYYY-MM-DD') AS "submittedDate",
               to_char(updated_at, 'YYYY-MM-DD') AS "lastUpdate"`,
    { replacements: { corporateId, employeeName: employeeName || null, employeeId: employeeId || null, category, subject, description, priority: priority || 'medium' } }
  );
  return res.status(201).json({ success: true, data: { complaint: rows[0] } });
});

router.put('/complaints/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { status, priority, assignedTo } = req.body || {};
  const [rows] = await postgresSequelize.query(
    `UPDATE corporate_complaints SET
       status = COALESCE(:status, status), priority = COALESCE(:priority, priority),
       assigned_to = COALESCE(:assignedTo, assigned_to), updated_at = NOW()
     WHERE id = :id AND corporate_id = :corporateId
     RETURNING id, employee_name AS "employeeName", employee_id AS "employeeId", category, subject, description,
               priority, status, assigned_to AS "assignedTo",
               to_char(submitted_date, 'YYYY-MM-DD') AS "submittedDate",
               to_char(updated_at, 'YYYY-MM-DD') AS "lastUpdate"`,
    { replacements: { id, corporateId, status: status ?? null, priority: priority ?? null, assignedTo: assignedTo ?? null } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Complaint not found' });
  return res.json({ success: true, data: { complaint: rows[0] } });
});

// ---------------------------------------------------------------------------
// Corporate portal: Billing
// ---------------------------------------------------------------------------

router.get('/billing/history', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { invoices: [] } });
  const [rows] = await postgresSequelize.query(
    `SELECT invoice_number AS id, to_char(invoice_date, 'YYYY-MM-DD') AS date, period,
            plan_name AS plan, amount, currency, status
       FROM corporate_billing_history
      WHERE corporate_id = :corporateId
      ORDER BY invoice_date DESC`,
    { replacements: { corporateId } }
  );
  return res.json({ success: true, data: { invoices: rows } });
});

router.get('/billing/invoices/:id/download', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `SELECT invoice_number AS id, to_char(invoice_date, 'YYYY-MM-DD') AS date, period,
            plan_name AS plan, amount, currency, status
       FROM corporate_billing_history
      WHERE corporate_id = :corporateId AND invoice_number = :id`,
    { replacements: { corporateId, id } }
  );
  const invoice = rows[0];
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const csv = toCsv([invoice], ['id', 'date', 'period', 'plan', 'amount', 'currency', 'status']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${invoice.id}.csv`);
  return res.status(200).send(csv);
});

// ---------------------------------------------------------------------------
// Corporate portal: Claims management
// ---------------------------------------------------------------------------

// insurance_claims.claim_type is constrained to cashless/reimbursement/emergency;
// the human-readable category (e.g. "Dental Care") is kept in metadata->>'category'
// and surfaced back out as claimType so the corporate UI is unaffected.
const CLAIMS_SELECT = `
  SELECT ic.claim_number AS id,
         COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), u.email) AS "employeeName",
         ce."employeeId" AS "employeeId",
         COALESCE(ic.metadata->>'category', ic.claim_type) AS "claimType",
         ic.benefit_category AS "benefitCategory",
         ic.claim_amount AS amount,
         to_char(ic.submitted_date, 'YYYY-MM-DD') AS "submittedDate",
         ic.status,
         COALESCE(ic.insurance_provider, 'Not specified') AS provider,
         to_char(COALESCE((ic.hospitalization_details->>'serviceDate')::date, ic.submitted_date), 'YYYY-MM-DD') AS "serviceDate",
         COALESCE(ic.notes, '') AS description,
         COALESCE(jsonb_array_length(ic.documents), 0) AS documents,
         ic.adjudication_route AS "adjudicationRoute",
         ic.approved_amount AS "approvedAmount",
         ic.rejection_reason AS "rejectionReason",
         ic.cmo_review_status AS "cmoReviewStatus",
         ic.cmo_notes AS "cmoNotes",
         to_char(ic.cmo_reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "cmoReviewedAt",
         COALESCE(NULLIF(TRIM(CONCAT(cmo."firstName", ' ', cmo."lastName")), ''), cmo.email) AS "cmoReviewerName"
    FROM insurance_claims ic
    JOIN user_associations ua ON ua."userId" = ic.patient_id AND ua."entityType" = 'corporate'
    LEFT JOIN users u ON u.id = ic.patient_id
    LEFT JOIN corporate_employees ce ON ce."userId" = ic.patient_id AND ce.corporate_id = ua."entityId"
    LEFT JOIN users cmo ON cmo.id = ic.cmo_reviewed_by
   WHERE ua."entityId" = :corporateId`;

// insurance_claims has row-level security (organization_id = current_org_id()
// OR patient_id = current_app_user_id()) -- every query here MUST run inside
// a transaction with RLS context set via setRlsContext(), using the
// corporate's id as org_id, or Postgres silently returns/writes nothing.
router.get('/claims/management', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  if (!corporateId) return res.json({ success: true, data: { claims: [] } });

  const tx = await postgresSequelize.transaction();
  try {
    await setRlsContext(tx, { orgId: corporateId, userId: 0 });
    let sql = `${CLAIMS_SELECT}`;
    const replacements = { corporateId };
    if (status && status !== 'all') { sql += ' AND ic.status = :status'; replacements.status = status; }
    sql += ' ORDER BY ic.submitted_date DESC NULLS LAST';
    const [rows] = await postgresSequelize.query(sql, { replacements, transaction: tx });
    await tx.commit();

    let claims = rows;
    if (q) {
      claims = claims.filter((c) =>
        [c.employeeName, c.employeeId, c.id, c.claimType].some((field) =>
          String(field || '').toLowerCase().includes(q)
        )
      );
    }
    return res.json({ success: true, data: { claims } });
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
});

// Claims/health-benefit adjudication is deliberately restricted: an external
// TPA (via insurance_claims.tpa_id / the tpa.route.js integrations, once a
// real provider is configured) can adjudicate, or the corporate's own
// clinical staff can decide directly on the corporate's behalf — either the
// Chief Medical Officer (role: corporate_cmo) or, for a corporate that runs
// its own on-site day-care clinic instead of/alongside a CMO, OHC staff
// (role: corporate_ohc, see corporate-hr-hierarchy.migration.js). Plain
// hr_staff — and any other authCorporate session — can view claims/
// authorizations but not decide them; the super-HR (corporate_admin) and
// the root corporate login retain override access since they're
// accountable for the whole account. Used for both insurance_claims
// scrutiny (below) and benefit-wallet authorization settle/cancel (OHC is
// typically the one actually treating the employee and closing out the
// wallet-funded visit).
const CLAIMS_ADJUDICATOR_ROLES = ['corporate', 'corporate_admin', 'corporate_cmo', 'corporate_ohc'];
function requireClaimsAdjudicator(req, res) {
  if (!CLAIMS_ADJUDICATOR_ROLES.includes(req.user?.role)) {
    res.status(403).json({
      success: false,
      message: 'Only the Chief Medical Officer, OHC staff, or the corporate account owner can decide claims',
    });
    return false;
  }
  return true;
}

router.put('/claims/management/:id', authCorporate, async (req, res) => {
  if (!requireClaimsAdjudicator(req, res)) return;
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ success: false, message: 'status is required' });

  const tx = await postgresSequelize.transaction();
  try {
    await setRlsContext(tx, { orgId: corporateId, userId: 0 });

    // Verify the claim actually belongs to this corporate before mutating it.
    const [owned] = await postgresSequelize.query(
      `SELECT ic.id FROM insurance_claims ic
         JOIN user_associations ua ON ua."userId" = ic.patient_id AND ua."entityType" = 'corporate'
        WHERE ic.claim_number = :id AND ua."entityId" = :corporateId`,
      { replacements: { id, corporateId }, transaction: tx }
    );
    if (!owned[0]) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    await postgresSequelize.query(
      `UPDATE insurance_claims SET status = :status,
              approved_at = CASE WHEN :status = 'approved' THEN NOW() ELSE approved_at END,
              rejected_at = CASE WHEN :status = 'rejected' THEN NOW() ELSE rejected_at END,
              updated_at = NOW()
        WHERE id = :claimId`,
      { replacements: { status, claimId: owned[0].id }, transaction: tx }
    );

    const [rows] = await postgresSequelize.query(`${CLAIMS_SELECT} AND ic.claim_number = :id`, { replacements: { corporateId, id }, transaction: tx });
    await tx.commit();
    return res.json({ success: true, data: { claim: rows[0] } });
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
});

// Chief Medical Officer claim scrutiny — the corporate-internal alternative
// to routing a claim through an external TPA. Records a decision with an
// approved amount and notes; deliberately does not trigger any wallet
// settlement or payment (that stays a manual, out-of-band step — see the
// 2026-09-03 corporate wellness plan doc, Section 9 on privacy/compliance,
// for why HR-side automation stays conservative around clinical/financial
// decisions until there's a real consent/audit layer in front of it).
router.post('/claims/management/:id/scrutinize', authCorporate, async (req, res) => {
  if (!requireClaimsAdjudicator(req, res)) return;
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const reviewerId = req.user?.userId || req.user?.id;
  const { id } = req.params;
  const { decision, approvedAmount, notes } = req.body || {};

  const DECISIONS = ['approved', 'rejected', 'partially_approved'];
  if (!DECISIONS.includes(decision)) {
    return res.status(400).json({ success: false, message: `decision must be one of: ${DECISIONS.join(', ')}` });
  }
  if ((decision === 'approved' || decision === 'partially_approved') && !(Number(approvedAmount) > 0)) {
    return res.status(400).json({ success: false, message: 'approvedAmount is required and must be greater than zero for an approval' });
  }

  const tx = await postgresSequelize.transaction();
  try {
    await setRlsContext(tx, { orgId: corporateId, userId: 0 });

    const [owned] = await postgresSequelize.query(
      `SELECT ic.id, ic.claim_amount FROM insurance_claims ic
         JOIN user_associations ua ON ua."userId" = ic.patient_id AND ua."entityType" = 'corporate'
        WHERE ic.claim_number = :id AND ua."entityId" = :corporateId`,
      { replacements: { id, corporateId }, transaction: tx }
    );
    if (!owned[0]) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const isApproval = decision === 'approved' || decision === 'partially_approved';
    const mappedStatus = isApproval ? 'approved' : 'rejected';
    const clampedAmount = isApproval ? Math.min(Number(approvedAmount), Number(owned[0].claim_amount)) : null;

    await postgresSequelize.query(
      `UPDATE insurance_claims SET
              status = :mappedStatus::varchar,
              approved_amount = CASE WHEN :isApproval::boolean THEN :clampedAmount::numeric ELSE approved_amount END,
              approved_at = CASE WHEN :isApproval::boolean THEN NOW() ELSE approved_at END,
              rejected_at = CASE WHEN :isApproval::boolean THEN rejected_at ELSE NOW() END,
              rejection_reason = CASE WHEN :isApproval::boolean THEN rejection_reason ELSE :notes::text END,
              adjudication_route = 'corporate_cmo',
              cmo_reviewed_by = :reviewerId::integer,
              cmo_review_status = :decision::varchar,
              cmo_notes = :notes::text,
              cmo_reviewed_at = NOW(),
              updated_at = NOW()
        WHERE id = :claimId::integer`,
      {
        replacements: {
          mappedStatus, isApproval, clampedAmount, notes: notes || null,
          reviewerId, decision, claimId: owned[0].id,
        },
        transaction: tx,
      }
    );

    const [rows] = await postgresSequelize.query(`${CLAIMS_SELECT} AND ic.claim_number = :id`, { replacements: { corporateId, id }, transaction: tx });
    await tx.commit();
    return res.json({ success: true, data: { claim: rows[0] } });
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
});

router.get('/claims/management/:id/download', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;

  const tx = await postgresSequelize.transaction();
  let claim;
  try {
    await setRlsContext(tx, { orgId: corporateId, userId: 0 });
    const [rows] = await postgresSequelize.query(`${CLAIMS_SELECT} AND ic.claim_number = :id`, { replacements: { corporateId, id }, transaction: tx });
    await tx.commit();
    claim = rows[0];
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  const csv = toCsv(
    [claim],
    ['id', 'employeeName', 'employeeId', 'claimType', 'amount', 'submittedDate', 'status', 'provider', 'serviceDate', 'description', 'documents']
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${claim.id}.csv`);
  return res.status(200).send(csv);
});

// Claim submission lives at POST /api/employee/claims (employee-network.route.js,
// powers SmartBenefitsHub/ClaimsExpress) -- that's the one real submission
// path; this corporate router only reviews/manages what lands there.

// Get network hospitals/providers
router.get('/network-providers', authCorporateOrEmployee, async(req,res)=>{
 try{
  const corporateId=req.user.userType==='corporate'?req.user.corporateId:(await resolveEmployeeCorporate(req.user.id))?.corporateId;
  if(!corporateId)return res.json({success:true,data:[]});
  const providers=await listBenefitNetworkProviders(corporateId,req.query.category||null);
  return res.json({success:true,data:providers});
 }catch{return res.status(500).json({success:false,message:'Network providers could not be loaded'});}
});

// ---------------------------------------------------------------------------
// Wellness Calendar Endpoints
// ---------------------------------------------------------------------------

// In-memory store for wellness activities


const WELLNESS_THEMES = [
  { month: 0, name: 'New Year Wellness Kickoff', description: 'Start the year with health goals and resolutions' },
  { month: 1, name: 'Heart Health Month', description: 'Focus on cardiovascular wellness and heart-healthy habits' },
  { month: 2, name: 'Nutrition & Diet', description: 'Healthy eating habits and nutritional awareness' },
  { month: 3, name: 'Mental Wellness', description: 'Stress management and mental health awareness' },
  { month: 4, name: 'Physical Fitness', description: 'Exercise routines and physical activity promotion' },
  { month: 5, name: 'Eye & Vision Care', description: 'Eye health awareness and vision screening' },
  { month: 6, name: 'Hydration & Detox', description: 'Importance of hydration and body detoxification' },
  { month: 7, name: 'Preventive Health', description: 'Health screenings and preventive care' },
  { month: 8, name: 'Diabetes Awareness', description: 'Blood sugar management and diabetes prevention' },
  { month: 9, name: 'Breast Cancer Awareness', description: 'Cancer awareness and early detection' },
  { month: 10, name: "Men's Health", description: "Focus on men's health issues and wellness" },
  { month: 11, name: 'Sleep & Rest', description: 'Quality sleep and rest for overall wellness' },
];

// Generate sample wellness activities
// Base wellness-calendar route — redirect to activities summary so the aggregator
// router's /:id catch-all doesn't intercept it and crash with a type-cast error.
router.get('/wellness-calendar', authCorporate, async (req, res) => {
  return res.redirect(307,'/api/corporate/wellness-calendar/activities');
});

router.get('/wellness-calendar/activities', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    const rows = await postgresSequelize.query(
      `SELECT id, title, description, event_type AS type,
              TO_CHAR(event_date, 'YYYY-MM-DD') AS date,
              TO_CHAR(event_time, 'HH24:MI') AS "startTime",
              TO_CHAR(end_time, 'HH24:MI') AS "endTime",
              location, organizer AS speaker,
              max_participants AS capacity,
              registered_count AS registered,
              status, color, participant_selection AS "participantSelection",
              total_invited AS "totalInvited", invites_sent AS "invitesSent"
       FROM corporate_wellness_events
       WHERE corporate_id = :corporateId
       ORDER BY event_date ASC`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    res.json({
      success: true,
      data: {
        activities: rows,
        themes: WELLNESS_THEMES
      }
    });
  } catch (error) {
    console.error('Error fetching wellness activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wellness activities',
      error: error.message
    });
  }
});

// Create wellness activity — persists to corporate_wellness_events, scoped to the caller's own corporate
router.post('/wellness-calendar/activities', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    const { title, description, type, date, startTime, endTime, location, speaker, capacity, theme,
      participantSelection = 'all', selectedDepartments, selectedEmployeeIds } = req.body;

    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'title and date are required' });
    }

    // Date-only comparison let a same-day activity through even when its
    // start time had already passed (QA: form pre-fills today 10:00-12:00 at
    // 11:40 PM with no warning) - compare the full date+time instead.
    const activityStart = new Date(`${String(date).slice(0, 10)}T${startTime || '00:00'}:00`);
    if (!Number.isNaN(activityStart.getTime()) && activityStart.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Activity date/time cannot be in the past' });
    }

    const themeName = theme || WELLNESS_THEMES[new Date(date).getMonth()]?.name || null;

    // Compute the target headcount server-side, from live corporate_employees
    // data, at creation time - not just when "Send Invites" is clicked. The
    // create-time toast previously showed a correct client-computed count
    // ("added for 3 participants") while the stored total_invited stayed 0
    // until invites were sent, so event details looked inconsistent/wrong
    // ("Target Participants: 0") for an event nobody had actually invited yet.
    let totalInvited = 0;
    try {
      if (participantSelection === 'department' && Array.isArray(selectedDepartments) && selectedDepartments.length) {
        const [[deptCount]] = await postgresSequelize.query(
          `SELECT COUNT(*)::int AS cnt FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true AND department = ANY(ARRAY[:selectedDepartments])`,
          { replacements: { corporateId, selectedDepartments } }
        );
        totalInvited = deptCount?.cnt || 0;
      } else if (participantSelection === 'custom' && Array.isArray(selectedEmployeeIds) && selectedEmployeeIds.length) {
        const [[customCount]] = await postgresSequelize.query(
          `SELECT COUNT(*)::int AS cnt FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true AND "employeeId" = ANY(ARRAY[:selectedEmployeeIds])`,
          { replacements: { corporateId, selectedEmployeeIds } }
        );
        totalInvited = customCount?.cnt || 0;
      } else {
        const [[allCount]] = await postgresSequelize.query(
          `SELECT COUNT(*)::int AS cnt FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true`,
          { replacements: { corporateId } }
        );
        totalInvited = allCount?.cnt || 0;
      }
    } catch (countErr) {
      console.error('⚠️ Could not compute wellness-activity target headcount:', countErr.message);
    }

    const [rows] = await postgresSequelize.query(
      `INSERT INTO corporate_wellness_events
         (corporate_id, title, description, event_type, event_date, event_time, end_time,
          location, organizer, max_participants, status, color, participant_selection, total_invited)
       VALUES (:corporateId, :title, :description, :type, :date, :startTime, :endTime,
               :location, :speaker, :capacity, 'upcoming', 'teal', :participantSelection, :totalInvited)
       RETURNING id, title, description, event_type AS type,
                 TO_CHAR(event_date, 'YYYY-MM-DD') AS date,
                 TO_CHAR(event_time, 'HH24:MI') AS "startTime",
                 TO_CHAR(end_time, 'HH24:MI') AS "endTime",
                 location, organizer AS speaker, max_participants AS capacity,
                 registered_count AS registered, status, color,
                 participant_selection AS "participantSelection", total_invited AS "totalInvited"`,
      {
        replacements: {
          corporateId, title: title.trim(), description: description || null,
          type: type || 'talk', date, startTime: startTime || null, endTime: endTime || null,
          location: location || null, speaker: speaker || null,
          capacity: capacity ? parseInt(capacity, 10) : 50,
          participantSelection, totalInvited,
        },
        type: postgresSequelize.QueryTypes.INSERT
      }
    );
    const newActivity = { ...(Array.isArray(rows) ? rows[0] : rows), theme: themeName, invitesSent: false };

    res.json({ success: true, message: 'Activity created successfully', data: newActivity });
  } catch (error) {
    console.error('Error creating wellness activity:', error);
    res.status(500).json({ success: false, message: 'Failed to create activity', error: error.message });
  }
});

// Update wellness activity — scoped to the caller's own corporate
router.put('/wellness-calendar/activities/:id', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    const eventId = parseInt(req.params.id, 10);
    if (!eventId) return res.status(400).json({ success: false, message: 'Invalid activity ID' });

    const { title, description, type, date, startTime, endTime, location, speaker, capacity, status, color } = req.body;

    const updated = await postgresSequelize.query(
      `UPDATE corporate_wellness_events SET
         title = COALESCE(:title, title),
         description = COALESCE(:description, description),
         event_type = COALESCE(:type, event_type),
         event_date = COALESCE(:date, event_date),
         event_time = COALESCE(:startTime, event_time),
         end_time = COALESCE(:endTime, end_time),
         location = COALESCE(:location, location),
         organizer = COALESCE(:speaker, organizer),
         max_participants = COALESCE(:capacity, max_participants),
         status = COALESCE(:status, status),
         color = COALESCE(:color, color),
         updated_at = NOW()
       WHERE id = :eventId AND corporate_id = :corporateId
       RETURNING id`,
      {
        replacements: {
          eventId, corporateId, title: title?.trim() || null, description: description ?? null,
          type: type || null, date: date || null, startTime: startTime || null, endTime: endTime || null,
          location: location || null, speaker: speaker || null,
          capacity: capacity ? parseInt(capacity, 10) : null, status: status || null, color: color || null,
        },
        type: postgresSequelize.QueryTypes.UPDATE
      }
    );
    if (!updated || !updated[0] || updated[0].length === 0) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }
    res.json({ success: true, message: 'Activity updated successfully' });
  } catch (error) {
    console.error('Error updating wellness activity:', error);
    res.status(500).json({ success: false, message: 'Failed to update activity', error: error.message });
  }
});

// Delete wellness activity — scoped to the caller's own corporate
router.delete('/wellness-calendar/activities/:id', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    const eventId = parseInt(req.params.id, 10);
    if (!eventId) return res.status(400).json({ success: false, message: 'Invalid activity ID' });

    const [deletedRows] = await postgresSequelize.query(
      `DELETE FROM corporate_wellness_events WHERE id = :eventId AND corporate_id = :corporateId RETURNING id`,
      { replacements: { eventId, corporateId }, type: postgresSequelize.QueryTypes.INSERT }
    );
    if (!deletedRows || deletedRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }
    res.json({ success: true, message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting wellness activity:', error);
    res.status(500).json({ success: false, message: 'Failed to delete activity', error: error.message });
  }
});

// Send invites for wellness activity — persists invite status, scoped to the caller's own corporate
router.post('/wellness-calendar/activities/:id/send-invites', authCorporate, async (req, res) => {
  try {
    const corporateId = req.user?.corporateId || req.user?.organization_id;
    const eventId = Number(req.params.id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) return res.status(400).json({ success: false, message: 'Invalid activity ID' });
    const selection = req.body.participantSelection || 'all';
    const participantIds = Array.isArray(req.body.participantIds) ? req.body.participantIds.map(String) : [];
    if (!['all','department','custom'].includes(selection) || (selection !== 'all' && !participantIds.length))
      return res.status(400).json({ success: false, message: 'Select employees to invite' });
    const result = await postgresSequelize.transaction(async transaction => {
      const query = (sql, replacements) => postgresSequelize.query(sql, { replacements, transaction, type: postgresSequelize.QueryTypes.SELECT });
      const [event] = await query(`SELECT id FROM corporate_wellness_events WHERE id=:eventId AND corporate_id=:corporateId AND status IN ('upcoming','ongoing') FOR UPDATE`, { eventId, corporateId });
      if (!event) return null;
      await query(`INSERT INTO corporate_wellness_event_rsvps (event_id,"userId","employeeId",status)
        SELECT :eventId,ce."userId",ce."employeeId",'pending' FROM corporate_employees ce
        WHERE ce.corporate_id=:corporateId AND ce."isActive"=true AND ce."userId" IS NOT NULL
          ${selection === 'all' ? '' : 'AND ce."employeeId" IN (:participantIds)'}
        ON CONFLICT (event_id,"userId") DO NOTHING RETURNING id`, { eventId, corporateId, ...(participantIds.length ? {participantIds} : {}) });
      const [count] = await query(`SELECT COUNT(*)::int AS total FROM corporate_wellness_event_rsvps WHERE event_id=:eventId`, { eventId });
      await query(`UPDATE corporate_wellness_events SET invites_sent=true,invites_sent_at=NOW(),notify_employees=true,
        participant_selection=:selection,total_invited=:total,updated_at=NOW()
        WHERE id=:eventId AND corporate_id=:corporateId RETURNING id`, {eventId,corporateId,selection,total:count.total});
      return count.total;
    });
    if (result === null) return res.status(404).json({success:false,message:'Upcoming activity not found'});
    return res.json({success:true,message:`Invites sent to ${result} participants`,data:{invited:result}});
  } catch (error) {
    console.error('Error sending invites:',error.message);
    return res.status(500).json({success:false,message:'Failed to send invites'});
  }
});

// Get employee events (for employee wellness calendar view) — real, per-corporate DB data
router.get('/wellness-calendar/employee/events', authEmployee, async (req, res) => {
  try {
    const [assoc] = await postgresSequelize.query(
      `SELECT ua."entityId" AS "corporateId" FROM user_associations ua
       JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
       WHERE ua."userId" = :userId AND ua."entityType" = 'corporate' AND ua.role = 'employee' AND ua.status = 'active'
       ORDER BY ua."createdAt" DESC LIMIT 1`,
      { replacements: { userId: req.user?.id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    if (!assoc) {
      return res.json({ success: true, data: { events: [], themes: WELLNESS_THEMES } });
    }

    // Only events this employee actually has an RSVP row for -- previously
    // every active employee saw every invites_sent event regardless of who
    // was actually selected as a recipient, because no per-employee invite
    // record existed at all until now.
    const rows = await postgresSequelize.query(
      `SELECT e.id, e.title, e.description, e.event_type AS type,
              TO_CHAR(e.event_date, 'YYYY-MM-DD') AS date,
              TO_CHAR(e.event_time, 'HH24:MI') AS "startTime",
              TO_CHAR(e.end_time, 'HH24:MI') AS "endTime",
              e.location, e.organizer AS speaker, e.max_participants AS capacity,
              e.registered_count AS registered,
              r.status AS "myRsvp",
              TO_CHAR(r.invited_at, 'YYYY-MM-DD') AS "invitedDate"
       FROM corporate_wellness_events e
       JOIN corporate_wellness_event_rsvps r ON r.event_id = e.id AND r."userId" = :userId
       WHERE e.corporate_id = :corporateId
         AND e.status IN ('upcoming', 'ongoing')
         AND e.invites_sent = TRUE
       ORDER BY e.event_date ASC`,
      { replacements: { corporateId: assoc.corporateId, userId: req.user.id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    res.json({ success: true, data: { events: rows, themes: WELLNESS_THEMES } });
  } catch (error) {
    console.error('Error fetching employee wellness events:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wellness events', error: error.message });
  }
});

// Real RSVP submission -- was previously a client-only `setTimeout` with no
// backend call at all, so an employee's response was never actually
// recorded anywhere and HR had no real registered-employee data.
router.post('/wellness-calendar/employee/events/:id/rsvp', authEmployee, async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!eventId) return res.status(400).json({ success: false, message: 'Invalid event ID' });
  if (!['confirmed', 'declined', 'cancelled'].includes(status)) {
    return res.status(400).json({ success: false, message: "status must be 'confirmed', 'declined' or 'cancelled'" });
  }

  const tx = await postgresSequelize.transaction();
  try {
    const [[existing]] = await postgresSequelize.query(
      `SELECT status FROM corporate_wellness_event_rsvps WHERE event_id = :eventId AND "userId" = :userId FOR UPDATE`,
      { replacements: { eventId, userId: req.user.id }, transaction: tx }
    );
    if (!existing) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'You were not invited to this event' });
    }

    await postgresSequelize.query(
      `UPDATE corporate_wellness_event_rsvps SET status = :status, responded_at = NOW()
       WHERE event_id = :eventId AND "userId" = :userId`,
      { replacements: { eventId, userId: req.user.id, status }, transaction: tx }
    );

    // Keep the event's registered_count in sync with real confirmations.
    const wasConfirmed = existing.status === 'confirmed';
    const nowConfirmed = status === 'confirmed';
    if (wasConfirmed !== nowConfirmed) {
      await postgresSequelize.query(
        `UPDATE corporate_wellness_events SET registered_count = GREATEST(0, registered_count + :delta), updated_at = NOW() WHERE id = :eventId`,
        { replacements: { eventId, delta: nowConfirmed ? 1 : -1 }, transaction: tx }
      );
    }

    const [[updated]] = await postgresSequelize.query(
      `SELECT registered_count AS registered FROM corporate_wellness_events WHERE id = :eventId`,
      { replacements: { eventId }, transaction: tx }
    );

    await tx.commit();
    res.json({ success: true, data: { myRsvp: status, registered: updated?.registered ?? 0 } });
  } catch (error) {
    await tx.rollback().catch(() => {});
    console.error('Error submitting RSVP:', error);
    res.status(500).json({ success: false, message: 'Failed to submit RSVP', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Settings Routes — real per-corporate row (corporate_settings table).
// The settings object shape is owned by the frontend (general/notifs/
// security/billing/integrations); stored as an opaque JSONB blob and
// shallow-merged on write, same semantics as the old in-memory object had
// minus the cross-tenant leakage (every corporate now gets its own row).
// ---------------------------------------------------------------------------
router.get('/settings', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  try {
    const [rows] = await postgresSequelize.query(
      `SELECT settings FROM corporate_settings WHERE corporate_id = :corporateId`,
      { replacements: { corporateId } }
    );
    return res.json({ success: true, data: { settings: protectedSettings(rows[0]?.settings) } });
  } catch (error) {
    console.error('[corporate] GET /settings error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
});

router.put('/settings', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  try {
    if(!['corporate','corporate_admin'].includes(req.user.role))return res.status(403).json({success:false,message:'Only Super HR can change corporate settings'});
    const updates = protectedSettings(req.body);
    const [rows] = await postgresSequelize.query(
      `INSERT INTO corporate_settings (corporate_id, settings)
       VALUES (:corporateId, CAST(:updates AS JSONB))
       ON CONFLICT (corporate_id) DO UPDATE SET
         settings = corporate_settings.settings || CAST(:updates AS JSONB),
         "updatedAt" = NOW()
       RETURNING settings`,
      { replacements: { corporateId, updates: JSON.stringify(updates) } }
    );
    return res.json({ success: true, message: 'Settings saved successfully', data: { settings: protectedSettings(rows[0].settings) } });
  } catch (error) {
    console.error('[corporate] PUT /settings error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to save settings', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Appointments Routes (HR-scheduled employee health appointments — internal
// scheduling/reminder records, distinct from the doctor-marketplace booking
// pipeline behind /corporate/dashboard/appointments). Real per-corporate
// table (corporate_scheduled_appointments); previously an in-memory array
// that GET never read from, so booked appointments silently vanished.
// ---------------------------------------------------------------------------
const mapScheduledAppointment = (r) => ({
  id: String(r.id),
  employeeId: r.employeeId,
  employeeName: r.employeeName || 'Unknown Employee',
  department: r.department || 'General',
  appointmentType: r.appointmentType,
  doctorName: r.doctorName || 'TBD',
  facility: r.facility || 'Main Medical Center',
  date: r.date ? r.date.toString().slice(0, 10) : r.date,
  time: r.time,
  status: r.status,
  notes: r.notes || '',
});

router.post('/appointments', authCorporate, async (req, res) => {
  try {
    const corporateId=req.user.corporateId;
    if(!req.body.appointmentType) return res.status(400).json({success:false,message:'Appointment type is required'});
    const row=await postgresSequelize.transaction(async transaction=>{
      const schedule=await prepareCorporateSchedule(postgresSequelize,corporateId,req.body,transaction);
      const [[created]]=await postgresSequelize.query(
        `INSERT INTO corporate_scheduled_appointments
          (corporate_id,"employeeId","employeeName",department,"appointmentType","doctorName",doctor_uid,facility,date,time,status,notes)
         VALUES (:corporateId,:employeeId,:employeeName,:department,:appointmentType,:doctorName,:doctorUid,:facility,:date,:time,'scheduled',:notes) RETURNING *`,
        {transaction,replacements:{...schedule,corporateId,appointmentType:String(req.body.appointmentType).slice(0,150),facility:req.body.facility||'',notes:req.body.notes||''}});
      await accessAudit.record(req,{resourceId:`schedule:${created.id}`,title:'Employee care scheduled',action:'create'},transaction);
      return created;
    });
    return res.status(201).json({success:true,data:{appointment:mapScheduledAppointment(row)}});
  }catch(error){
    const conflict=(error.original?.code||error.parent?.code)==='23505';
    return res.status(conflict?409:error.statusCode||500).json({success:false,message:conflict?'The doctor already has an HR appointment at this time':error.statusCode?error.message:'Appointment could not be scheduled'});
  }
});

router.put('/appointments/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { status, date, time, notes } = req.body || {};

  const allowedStatuses = ['scheduled', 'completed', 'cancelled', 'no-show'];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${allowedStatuses.join(', ')}` });
  }

  try {
    let reschedule = null;
    if (date || time) {
      const [existing] = await postgresSequelize.query(`SELECT * FROM corporate_scheduled_appointments WHERE id=:id AND corporate_id=:corporateId`, {replacements:{id,corporateId},type:postgresSequelize.QueryTypes.SELECT});
      if(!existing)return res.status(404).json({success:false,message:'Appointment not found'});
      reschedule=await prepareCorporateSchedule(postgresSequelize,corporateId,{...existing,date:date||String(existing.date).slice(0,10),time:time||existing.time});
    }
    if (status === 'completed') {
      const [[existing]] = await postgresSequelize.query(
        `SELECT "doctorName", "appointmentType" FROM corporate_scheduled_appointments WHERE id = :id AND corporate_id = :corporateId`,
        { replacements: { id, corporateId } }
      );
      if (!existing) return res.status(404).json({ success: false, message: 'Appointment not found' });
      if (/consultation|specialist referral/i.test(existing.appointmentType || '')) {
        return res.status(403).json({ success: false, message: 'Doctor consultations must be completed by the treating clinician' });
      }
      const doctorName = (existing.doctorName || '').trim();
      if (!doctorName || doctorName === 'TBD') {
        return res.status(400).json({
          success: false,
          message: 'Cannot mark this appointment completed until a doctor is assigned',
        });
      }
    }

    const [rows] = await postgresSequelize.query(
      `UPDATE corporate_scheduled_appointments SET
         status = COALESCE(:status, status),
         date = COALESCE(:date, date),
         time = COALESCE(:time, time),
         notes = COALESCE(:notes, notes),
         "updatedAt" = NOW()
       WHERE id = :id AND corporate_id = :corporateId RETURNING *`,
      { replacements: { id, corporateId, status: status || null, date: reschedule?.date || null, time: reschedule?.time || null, notes: notes || null } }
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Appointment not found' });
    res.json({ success: true, data: { appointment: mapScheduledAppointment(rows[0]) } });
  } catch (error) {
    if(error.statusCode)return res.status(error.statusCode).json({success:false,message:error.message});
    if((error.original?.code||error.parent?.code)==='23505')return res.status(409).json({success:false,message:'The doctor already has an HR appointment at this time'});
    console.error('[corporate] PUT /appointments/:id error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update appointment', error: error.message });
  }
});

router.get('/appointments', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  try {
    const [rows] = await postgresSequelize.query(
      `SELECT * FROM corporate_scheduled_appointments WHERE corporate_id = :corporateId ORDER BY date DESC, "createdAt" DESC`,
      { replacements: { corporateId } }
    );
    res.json({ success: true, data: { appointments: rows.map(mapScheduledAppointment) } });
  } catch (error) {
    console.error('[corporate] GET /appointments error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load appointments' });
  }
});

// ---------------------------------------------------------------------------
// Challenges Routes (for gamification) — real per-corporate DB rows.
// Participant counts are real (corporate_challenge_participants); there is
// currently no wearable/activity-tracking pipeline feeding per-employee
// progress, so the leaderboard below honestly returns each joined
// participant at score 0 rather than inventing step/activity numbers.
// ---------------------------------------------------------------------------
router.get('/challenges', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  try {
    const [rows] = await postgresSequelize.query(
      `SELECT c.*, COUNT(p.id)::int AS participants,
         (SELECT COUNT(*) FROM corporate_employees WHERE corporate_id = c.corporate_id AND "isActive" = true)::int AS "totalEmployees"
       FROM corporate_challenges c
       LEFT JOIN corporate_challenge_participants p ON p.challenge_id = c.id
       WHERE c.corporate_id = :corporateId
       GROUP BY c.id
       ORDER BY c."createdAt" DESC`,
      { replacements: { corporateId } }
    );
    const challenges = rows.map((r) => ({
      id: String(r.id),
      title: r.title,
      description: r.description || '',
      type: r.type,
      target: Number(r.target),
      unit: r.unit,
      startDate: r.startDate ? r.startDate.toString().slice(0, 10) : r.startDate,
      endDate: r.endDate ? r.endDate.toString().slice(0, 10) : r.endDate,
      status: r.status,
      participants: r.participants,
      totalEmployees: r.totalEmployees,
      rewards: r.rewards || {},
    }));
    return res.json({ success: true, data: { challenges } });
  } catch (error) {
    console.error('[corporate] GET /challenges error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load challenges' });
  }
});

router.post('/challenges', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  try {
    const { title, description, type, target, unit, startDate, endDate, rewards } = req.body;

    if (!title || !type || !target || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Title, type, target, start date, and end date are required'
      });
    }

    const [[row]] = await postgresSequelize.query(
      `INSERT INTO corporate_challenges (corporate_id, title, description, type, target, unit, "startDate", "endDate", status, rewards)
       VALUES (:corporateId, :title, :description, :type, :target, :unit, :startDate, :endDate, 'draft', CAST(:rewards AS JSONB))
       RETURNING *`,
      {
        replacements: {
          corporateId, title, description: description || '', type, target, unit: unit || 'points', startDate, endDate,
          rewards: JSON.stringify(rewards || { gold: 'TBD', silver: 'TBD', bronze: 'TBD' }),
        },
      }
    );

    const [[{ count: totalEmployees }]] = await postgresSequelize.query(
      `SELECT COUNT(*)::int FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true`,
      { replacements: { corporateId } }
    );

    const newChallenge = {
      id: String(row.id),
      title: row.title,
      description: row.description || '',
      type: row.type,
      target: Number(row.target),
      unit: row.unit,
      startDate: row.startDate ? row.startDate.toString().slice(0, 10) : row.startDate,
      endDate: row.endDate ? row.endDate.toString().slice(0, 10) : row.endDate,
      status: row.status,
      participants: 0,
      totalEmployees,
      rewards: row.rewards || {},
    };

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: { challenge: newChallenge }
    });
  } catch (error) {
    console.error('[corporate] POST /challenges error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create challenge', error: error.message });
  }
});

router.put('/challenges/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { status } = req.body || {};

  try {
    const [rows] = await postgresSequelize.query(
      `UPDATE corporate_challenges SET status = COALESCE(:status, status), "updatedAt" = NOW()
       WHERE id = :id AND corporate_id = :corporateId RETURNING *`,
      { replacements: { id, corporateId, status: status || null } }
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Challenge not found' });
    const r = rows[0];
    res.json({
      success: true,
      data: { challenge: { id: String(r.id), title: r.title, description: r.description || '', type: r.type, target: Number(r.target), unit: r.unit, startDate: r.startDate ? r.startDate.toString().slice(0, 10) : r.startDate, endDate: r.endDate ? r.endDate.toString().slice(0, 10) : r.endDate, status: r.status, rewards: r.rewards || {} } },
    });
  } catch (error) {
    console.error('[corporate] PUT /challenges/:id error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update challenge', error: error.message });
  }
});

// Real per-employee leaderboard join table — currently no wearable/activity
// data source feeds `score`, so every participant shows at 0 until such a
// pipeline exists. Honest empty ranking, not a fabricated one.
// Real per-employee activity data (daily_activity: steps, exercise_minutes,
// sleep_hours, water_glasses, weight) is the only genuine scoring source in
// this platform -- no separate points/badges engine exists. Challenge types
// without a matching column (nutrition, mindfulness, custom) have no real
// data source, so their score stays at whatever was explicitly recorded on
// corporate_challenge_participants.score (0 unless something writes to it).
function challengeScoreSql(type) {
  switch (type) {
    case 'steps': return `COALESCE(SUM(da.steps), 0)`;
    case 'workout': return `COALESCE(SUM(da.exercise_minutes), 0)`;
    case 'sleep': return `COALESCE(SUM(da.sleep_hours), 0)`;
    case 'hydration': return `COALESCE(SUM(da.water_glasses), 0)`;
    // Weight lost over the challenge window (first logged weight minus last) --
    // "progress" here means kg lost, not a cumulative sum.
    case 'weight-loss': return `GREATEST(0, COALESCE((array_agg(da.weight ORDER BY da.date ASC))[1] - (array_agg(da.weight ORDER BY da.date DESC))[1], 0))`;
    default: return null;
  }
}

async function computeLeaderboardRows(corporateId, challengeId) {
  const [[challenge]] = await postgresSequelize.query(
    `SELECT id, type, target, "startDate", "endDate" FROM corporate_challenges WHERE id = :challengeId AND corporate_id = :corporateId`,
    { replacements: { challengeId, corporateId } }
  );
  if (!challenge) return null;

  const scoreExpr = challengeScoreSql(challenge.type);
  const activityJoin = scoreExpr
    ? `LEFT JOIN daily_activity da ON da.user_id = p."userId" AND da.date BETWEEN c."startDate" AND c."endDate"`
    : '';
  // COALESCE(<computed or manual>, 0) as a bare alias -- Postgres only
  // resolves ORDER BY against a *bare* output-column alias; wrapping the
  // alias in another expression there makes it look for an input column of
  // that name instead, which doesn't exist ("column computed_score does not
  // exist"). So the COALESCE has to live in the SELECT list, not ORDER BY.
  const scoreSelect = scoreExpr ? `COALESCE(${scoreExpr}, 0) AS computed_score` : `COALESCE(p.score, 0) AS computed_score`;

  const [rows] = await postgresSequelize.query(
    `SELECT p."employeeId", p.score AS manual_score, ce.department, u."firstName", u."lastName", ${scoreSelect}
     FROM corporate_challenge_participants p
     JOIN corporate_challenges c ON c.id = p.challenge_id AND c.corporate_id = :corporateId
     LEFT JOIN corporate_employees ce ON ce.corporate_id = c.corporate_id AND ce."employeeId" = p."employeeId"
     LEFT JOIN users u ON u.id = p."userId"
     ${activityJoin}
     WHERE p.challenge_id = :challengeId
     GROUP BY p."employeeId", p.score, ce.department, u."firstName", u."lastName"
     ORDER BY computed_score DESC`,
    { replacements: { challengeId, corporateId } }
  );

  return rows.map((r, i) => ({
    rank: i + 1,
    employeeId: r.employeeId,
    name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.employeeId,
    department: r.department || '',
    score: Number(r.computed_score ?? r.manual_score) || 0,
    target: Number(challenge.target) || 0,
    progress: 0,
    streak: 0,
    badges: [],
    medal: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : undefined,
  }));
}

router.get('/gamification/challenges/:id/leaderboard', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;

  try {
    const leaderboard = await computeLeaderboardRows(corporateId, id);
    if (leaderboard === null) return res.status(404).json({ success: false, message: 'Challenge not found' });
    res.json({ success: true, data: { leaderboard } });
  } catch (error) {
    console.error('[corporate] GET /gamification/challenges/:id/leaderboard error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load leaderboard' });
  }
});

// ---------------------------------------------------------------------------
// Employee-facing gamification (join challenges, my progress, real
// leaderboard-derived stats). Resolves the employee's corporateId +
// employeeId from user_associations/corporate_employees -- authUser sessions
// don't carry those directly.
// ---------------------------------------------------------------------------
async function resolveEmployeeContext(userId) {
  const [[assoc]] = await postgresSequelize.query(
    `SELECT ua."entityId" AS "corporateId" FROM user_associations ua
      JOIN corporates c ON c.id = ua."entityId" AND LOWER(c.status) = 'active'
      WHERE ua."userId" = :userId AND ua."entityType" = 'corporate' AND ua.status = 'active'
      ORDER BY ua."createdAt" DESC LIMIT 1`,
    { replacements: { userId } }
  );
  if (!assoc?.corporateId) return null;
  const [[ce]] = await postgresSequelize.query(
    `SELECT "employeeId", department FROM corporate_employees WHERE "userId" = :userId AND corporate_id = :corporateId`,
    { replacements: { userId, corporateId: assoc.corporateId } }
  );
  return { corporateId: assoc.corporateId, employeeId: ce?.employeeId || null, department: ce?.department || null };
}

// Real day-streak: consecutive calendar days (ending today or yesterday)
// with at least one logged daily_activity row for this user.
async function computeActivityStreak(userId) {
  const [rows] = await postgresSequelize.query(
    `SELECT DISTINCT date FROM daily_activity WHERE user_id = :userId ORDER BY date DESC LIMIT 400`,
    { replacements: { userId } }
  );
  if (!rows.length) return 0;
  const dates = rows.map((r) => new Date(r.date).toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const cur = new Date(dates[i]);
    if ((prev - cur) / 86400000 === 1) streak++;
    else break;
  }
  return streak;
}

router.get('/gamification/employee/challenges', authEmployee, async (req, res) => {
  try {
    const ctx = await resolveEmployeeContext(req.user.id);
    if (!ctx) return res.json({ success: true, data: { challenges: [] } });

    const [rows] = await postgresSequelize.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM corporate_challenge_participants WHERE challenge_id = c.id)::int AS "totalParticipants",
         EXISTS(SELECT 1 FROM corporate_challenge_participants WHERE challenge_id = c.id AND "userId" = :userId) AS joined
       FROM corporate_challenges c
       WHERE c.corporate_id = :corporateId AND c.status IN ('draft', 'active', 'completed')
       ORDER BY c."startDate" DESC`,
      { replacements: { corporateId: ctx.corporateId, userId: req.user.id } }
    );

    const today = new Date().toISOString().slice(0, 10);
    const challenges = [];
    for (const r of rows) {
      const startDate = r.startDate ? r.startDate.toString().slice(0, 10) : null;
      const endDate = r.endDate ? r.endDate.toString().slice(0, 10) : null;
      const status = r.status === 'draft'
        ? (startDate && startDate > today ? 'upcoming' : 'active')
        : r.status;
      if (r.status === 'cancelled') continue;

      let myProgress = 0;
      let myRank = 0;
      if (r.joined) {
        const board = await computeLeaderboardRows(ctx.corporateId, r.id);
        const mine = board?.find((b) => b.employeeId === ctx.employeeId);
        myProgress = mine?.score || 0;
        myRank = mine?.rank || 0;
      }

      challenges.push({
        id: String(r.id),
        title: r.title,
        description: r.description || '',
        type: r.type,
        target: Number(r.target),
        unit: r.unit,
        startDate,
        endDate,
        status,
        totalParticipants: r.totalParticipants,
        rewards: r.rewards || {},
        myProgress,
        myRank,
        myStreak: r.joined ? await computeActivityStreak(req.user.id) : 0,
        joined: Boolean(r.joined),
      });
    }

    res.json({ success: true, data: { challenges } });
  } catch (error) {
    console.error('[corporate] GET /gamification/employee/challenges error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load challenges' });
  }
});

router.post('/gamification/employee/challenges/:id/join', authEmployee, async (req, res) => {
  const { id } = req.params;
  try {
    const ctx = await resolveEmployeeContext(req.user.id);
    if (!ctx || !ctx.employeeId) {
      return res.status(403).json({ success: false, message: 'No corporate employee record found for this account' });
    }
    const [[challenge]] = await postgresSequelize.query(
      `SELECT id, status FROM corporate_challenges WHERE id = :id AND corporate_id = :corporateId`,
      { replacements: { id, corporateId: ctx.corporateId } }
    );
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.status === 'completed' || challenge.status === 'cancelled') {
      return res.status(400).json({ success: false, message: `Cannot join a ${challenge.status} challenge` });
    }

    await postgresSequelize.query(
      `INSERT INTO corporate_challenge_participants (challenge_id, "userId", "employeeId", score)
       VALUES (:id, :userId, :employeeId, 0)
       ON CONFLICT (challenge_id, "employeeId") DO NOTHING`,
      { replacements: { id, userId: req.user.id, employeeId: ctx.employeeId } }
    );

    res.status(201).json({ success: true, message: 'Joined challenge' });
  } catch (error) {
    console.error('[corporate] POST /gamification/employee/challenges/:id/join error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to join challenge' });
  }
});

router.get('/gamification/employee/stats', authEmployee, async (req, res) => {
  try {
    const ctx = await resolveEmployeeContext(req.user.id);
    if (!ctx || !ctx.employeeId) {
      return res.json({ success: true, data: { stats: { employeeId: null, department: null, totalPoints: 0, totalChallenges: 0, completedChallenges: 0, currentStreak: 0, longestStreak: 0, badges: [], rank: 0, percentile: 0 } } });
    }

    const [joined] = await postgresSequelize.query(
      `SELECT c.id, c.status FROM corporate_challenge_participants p
       JOIN corporate_challenges c ON c.id = p.challenge_id
       WHERE p."employeeId" = :employeeId AND c.corporate_id = :corporateId`,
      { replacements: { employeeId: ctx.employeeId, corporateId: ctx.corporateId } }
    );

    // Rank/percentile computed relative to everyone else who shares at least
    // one of this employee's joined challenges -- there's no platform-wide
    // "points" concept to rank against otherwise.
    let totalPoints = 0;
    const peerTotals = new Map();
    for (const c of joined) {
      const board = await computeLeaderboardRows(ctx.corporateId, c.id);
      for (const entry of board || []) {
        peerTotals.set(entry.employeeId, (peerTotals.get(entry.employeeId) || 0) + entry.score);
      }
      const mine = board?.find((b) => b.employeeId === ctx.employeeId);
      totalPoints += mine?.score || 0;
    }
    const ranked = Array.from(peerTotals.entries()).sort((a, b) => b[1] - a[1]);
    const myIndex = ranked.findIndex(([empId]) => empId === ctx.employeeId);
    const rank = myIndex >= 0 ? myIndex + 1 : 0;
    const percentile = ranked.length && rank ? Math.round(((ranked.length - rank) / ranked.length) * 100) : 0;

    const currentStreak = await computeActivityStreak(req.user.id);
    const [[longest]] = await postgresSequelize.query(
      `WITH d AS (
         SELECT date, date - (ROW_NUMBER() OVER (ORDER BY date))::int * INTERVAL '1 day' AS grp
         FROM (SELECT DISTINCT date FROM daily_activity WHERE user_id = :userId) x
       )
       SELECT COALESCE(MAX(cnt), 0)::int AS longest FROM (SELECT COUNT(*) AS cnt FROM d GROUP BY grp) y`,
      { replacements: { userId: req.user.id } }
    );

    // No badge-awarding engine exists in this platform -- honestly empty
    // rather than a fabricated achievement list.
    const stats = {
      employeeId: ctx.employeeId,
      department: ctx.department,
      totalPoints,
      totalChallenges: joined.length,
      completedChallenges: joined.filter((c) => c.status === 'completed').length,
      currentStreak,
      longestStreak: longest?.longest || 0,
      badges: [],
      rank,
      percentile,
    };

    res.json({ success: true, data: { stats } });
  } catch (error) {
    console.error('[corporate] GET /gamification/employee/stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
});

// Department-level rankings: average real score across each department's
// participants, for the corporate's currently active/completed challenges.
router.get('/gamification/employee/teams', authEmployee, async (req, res) => {
  try {
    const ctx = await resolveEmployeeContext(req.user.id);
    if (!ctx) return res.json({ success: true, data: { teams: [] } });

    const [challenges] = await postgresSequelize.query(
      `SELECT id FROM corporate_challenges WHERE corporate_id = :corporateId AND status IN ('active', 'completed')`,
      { replacements: { corporateId: ctx.corporateId } }
    );

    const deptScores = new Map();
    const deptMembers = new Map();
    for (const c of challenges) {
      const board = await computeLeaderboardRows(ctx.corporateId, c.id);
      for (const entry of board || []) {
        if (!entry.department) continue;
        deptScores.set(entry.department, (deptScores.get(entry.department) || 0) + entry.score);
        if (!deptMembers.has(entry.department)) deptMembers.set(entry.department, new Set());
        deptMembers.get(entry.department).add(entry.employeeId);
      }
    }

    const [totalsRows] = await postgresSequelize.query(
      `SELECT department, COUNT(*)::int AS total FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true AND department IS NOT NULL GROUP BY department`,
      { replacements: { corporateId: ctx.corporateId } }
    );
    const totalsByDept = Object.fromEntries(totalsRows.map((r) => [r.department, r.total]));

    const teams = Array.from(deptScores.entries())
      .map(([department, totalScore]) => {
        const activeMembers = deptMembers.get(department)?.size || 0;
        return {
          teamName: department,
          department,
          totalMembers: totalsByDept[department] || activeMembers,
          activeMembers,
          avgScore: activeMembers ? Math.round(totalScore / activeMembers) : 0,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .map((t, i) => ({ ...t, rank: i + 1 }));

    res.json({ success: true, data: { teams } });
  } catch (error) {
    console.error('[corporate] GET /gamification/employee/teams error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load team rankings' });
  }
});

// Winners: real top-3 participants of each completed challenge.
router.get('/gamification/employee/winners', authEmployee, async (req, res) => {
  try {
    const ctx = await resolveEmployeeContext(req.user.id);
    if (!ctx) return res.json({ success: true, data: { winners: [] } });

    const [completed] = await postgresSequelize.query(
      `SELECT id, title, rewards, "endDate" FROM corporate_challenges WHERE corporate_id = :corporateId AND status = 'completed' ORDER BY "endDate" DESC LIMIT 10`,
      { replacements: { corporateId: ctx.corporateId } }
    );

    const winners = [];
    for (const c of completed) {
      const board = await computeLeaderboardRows(ctx.corporateId, c.id);
      const rewards = c.rewards || {};
      (board || []).slice(0, 3).forEach((entry, i) => {
        if (!entry.score) return;
        const medal = ['gold', 'silver', 'bronze'][i];
        winners.push({
          challengeId: String(c.id),
          challengeTitle: c.title,
          medal,
          name: entry.name,
          department: entry.department,
          score: entry.score,
          reward: rewards[medal] || '',
          date: c.endDate ? c.endDate.toString().slice(0, 10) : null,
          isMe: entry.employeeId === ctx.employeeId,
        });
      });
    }

    res.json({ success: true, data: { winners } });
  } catch (error) {
    console.error('[corporate] GET /gamification/employee/winners error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load winners' });
  }
});

// Employee-facing leaderboard view for a single challenge -- same real
// scoring as the HR endpoint above, but scoped/authorized for authUser
// sessions (an HR-only authCorporate token can't view this).
router.get('/gamification/employee/challenges/:id/leaderboard', authEmployee, async (req, res) => {
  const { id } = req.params;
  try {
    const ctx = await resolveEmployeeContext(req.user.id);
    if (!ctx) return res.json({ success: true, data: { leaderboard: [] } });

    const leaderboard = await computeLeaderboardRows(ctx.corporateId, id);
    if (leaderboard === null) return res.status(404).json({ success: false, message: 'Challenge not found' });

    res.json({
      success: true,
      data: { leaderboard: leaderboard.map((entry) => ({ ...entry, isMe: entry.employeeId === ctx.employeeId })) },
    });
  } catch (error) {
    console.error('[corporate] GET /gamification/employee/challenges/:id/leaderboard error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load leaderboard' });
  }
});

// Note: an earlier /benefits/book-checkup + /benefits/bookings pair (a
// second, unrelated in-memory array) was removed here — dead code with no
// frontend caller, duplicating the real /book-checkup + /my-appointments
// endpoints above (now backed by corporate_checkup_bookings).

// ---------------------------------------------------------------------------
// Employee Details Route
// ---------------------------------------------------------------------------
async function resolveCorporateEmployee(corporateId, employeeKey) {
  const [corporateEmployee] = await postgresSequelize.query(
    `SELECT
       ce.id AS corporate_employee_row_id,
       ce."employeeId",
       ce.business_unit,
       ce.department,
       ce.designation,
       ce."joiningDate",
       ce.email AS on_file_email,
       ce.metadata,
       ce."userId",
       u."firstName",
       u."lastName",
       u.email AS user_email,
       u."phoneNumber"
     FROM corporate_employees ce
     LEFT JOIN users u ON u.id = ce."userId"
     WHERE ce.corporate_id = :corporateId
       AND ce."isActive" = true
       AND (
         ce."employeeId" = :employeeKey
         OR ce.id::text = :employeeKey
         OR ce."userId"::text = :employeeKey
       )
     LIMIT 1`,
    { replacements: { corporateId, employeeKey }, type: postgresSequelize.QueryTypes.SELECT }
  );

  if (corporateEmployee) {
    const meta = corporateEmployee.metadata || {};
    const name = [corporateEmployee.firstName, corporateEmployee.lastName].filter(Boolean).join(' ')
      || [meta.firstName, meta.lastName].filter(Boolean).join(' ')
      || corporateEmployee.user_email
      || corporateEmployee.on_file_email
      || corporateEmployee.employeeId;
    return {
      userId: corporateEmployee.userId || null,
      employeeId: corporateEmployee.employeeId,
      name,
      email: corporateEmployee.user_email || corporateEmployee.on_file_email || '',
      phone: corporateEmployee.phoneNumber || '',
      businessUnit: corporateEmployee.business_unit || '',
      department: corporateEmployee.department || 'General',
      designation: corporateEmployee.designation || '',
      joiningDate: corporateEmployee.joiningDate ? corporateEmployee.joiningDate.toString().slice(0, 10) : '',
    };
  }

  const [associatedEmployee] = await postgresSequelize.query(
    `SELECT
       u.id AS "userId",
       COALESCE(ua.metadata->>'employeeId', u.employee_id, u.unique_id, u.id::text) AS "employeeId",
       u."firstName",
       u."lastName",
       u.email,
       u."phoneNumber",
       u.department_name,
       ua.metadata,
       ua."startDate"
     FROM user_associations ua
     JOIN users u ON u.id = ua."userId"
     WHERE ua."entityId" = :corporateId
       AND ua."entityType" = 'corporate'
       AND ua.role = 'employee'
       AND ua.status = 'active'
       AND (
         u.id::text = :employeeKey
         OR u.employee_id = :employeeKey
         OR u.unique_id = :employeeKey
         OR ua.metadata->>'employeeId' = :employeeKey
       )
     LIMIT 1`,
    { replacements: { corporateId, employeeKey }, type: postgresSequelize.QueryTypes.SELECT }
  );

  if (!associatedEmployee) return null;
  const meta = associatedEmployee.metadata || {};
  return {
    userId: associatedEmployee.userId,
    employeeId: associatedEmployee.employeeId,
    name: [associatedEmployee.firstName, associatedEmployee.lastName].filter(Boolean).join(' ') || associatedEmployee.email,
    email: associatedEmployee.email || '',
    phone: associatedEmployee.phoneNumber || '',
    businessUnit: meta.businessUnit || '',
    department: meta.department || associatedEmployee.department_name || 'Not Assigned',
    designation: meta.designation || 'Not Assigned',
    joiningDate: associatedEmployee.startDate ? associatedEmployee.startDate.toString().slice(0, 10) : '',
  };
}

function normalizeHealthRecord(row) {
  const rawType = String(row.checkup_type || row.report_type || '').toLowerCase();
  const checkupType = rawType.includes('pre') ? 'pre_employment'
    : rawType.includes('annual') ? 'annual_health_checkup'
      : rawType || 'other';
  return {
    id: String(row.id),
    reportName: row.report_name,
    reportType: row.report_type,
    checkupType,
    reportDate: row.report_date ? new Date(row.report_date).toISOString().slice(0, 10) : '',
    checkupCompletedAt: row.checkup_completed_at || null,
    reportDueAt: row.report_due_at || null,
    reportDeliveredAt: row.report_delivered_at || row.created_at || null,
    slaStatus: row.sla_status || 'not_tracked',
    source: row.source,
    reportUrl: row.report_url || '',
    notes: row.notes || '',
    orderNumber: row.order_number || '',
  };
}

async function buildEmployeeHealthRecordSheet(corporateId, employeeKey, req) {
  const employee = await resolveCorporateEmployee(corporateId, employeeKey);
  if (!employee) return null;
  await accessAudit.requireHealthConsent(req, employee);

  const records = employee.userId ? await postgresSequelize.query(
    `SELECT
       chr.id,
       chr.report_name,
       chr.report_type,
       chr.checkup_type,
       chr.report_date,
       chr.checkup_completed_at,
       chr.report_due_at,
       chr.report_delivered_at,
       chr.sla_status,
       chr.report_url,
       chr.notes,
       chr.created_at,
       lo.order_number,
       'manual' AS source
     FROM corporate_health_reports chr
     LEFT JOIN lab_orders lo ON lo.id = chr.lab_order_id
     WHERE chr.corporate_id = :corporateId
       AND chr.employee_id = :userId

     UNION ALL

     SELECT
       r.id,
       r."fileName" AS report_name,
       r."reportType"::text AS report_type,
       'annual_health_checkup'::varchar AS checkup_type,
       r."reportDate" AS report_date,
       r."reportDate"::timestamptz AS checkup_completed_at,
       NULL::timestamptz AS report_due_at,
       r."createdAt" AS report_delivered_at,
       'on_time'::varchar AS sla_status,
       r."fileUrl" AS report_url,
       r.description AS notes,
       r."createdAt" AS created_at,
       NULL::varchar AS order_number,
       'email' AS source
     FROM reports r
     JOIN user_associations ua ON ua."userId" = r."userId"
       AND ua."entityType" = 'corporate'
       AND ua."entityId" = :corporateId
     WHERE r."userId" = :userId
       AND r."reportType" = 'lab'
       AND COALESCE(r.metadata->>'source', '') <> 'team_corporate_health_upload'

     ORDER BY report_date DESC, created_at DESC`,
    { replacements: { corporateId, userId: employee.userId }, type: postgresSequelize.QueryTypes.SELECT }
  ) : [];

  const allRecords = records.map(normalizeHealthRecord);
  const preEmployment = allRecords.filter((record) => record.checkupType === 'pre_employment');
  const annualHealthCheckups = allRecords.filter((record) => record.checkupType === 'annual_health_checkup');
  const other = allRecords.filter((record) => !['pre_employment', 'annual_health_checkup'].includes(record.checkupType));
  const measured = allRecords.filter((record) => ['on_time', 'breached'].includes(record.slaStatus));
  const onTime = measured.filter((record) => record.slaStatus === 'on_time').length;

  return {
    employee,
    summary: {
      totalRecords: allRecords.length,
      preEmploymentCount: preEmployment.length,
      annualCount: annualHealthCheckups.length,
      pendingReports: allRecords.filter((record) => ['pending_due', 'pending_overdue'].includes(record.slaStatus)).length,
      overdueReports: allRecords.filter((record) => record.slaStatus === 'pending_overdue' || record.slaStatus === 'breached').length,
      slaCompliancePercent: measured.length ? Math.round((onTime / measured.length) * 100) : null,
      lastCheckup: allRecords[0]?.reportDate || null,
    },
    records: {
      preEmployment,
      annualHealthCheckups,
      other,
    },
    allRecords,
  };
}

router.get('/employees/:id/health-records', authCorporate, async (req, res) => {
  try {
    const corporateId = resolveCorporateIdFromUser(req.user);
    if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
    const sheet = await buildEmployeeHealthRecordSheet(corporateId, req.params.id, req);
    if (!sheet) return res.status(404).json({ success: false, message: 'Employee not found' });
    await accessAudit.record(req, { resourceId: `employee:${sheet.employee.employeeId}`, title: 'Employee health records', action: 'view' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: sheet });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    console.error('[corporate] GET employee health records error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch employee health records' });
  }
});

router.get('/employees/:id/health-records/export', authCorporate, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
  const corporateId = resolveCorporateIdFromUser(req.user);
    if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
    const sheet = await buildEmployeeHealthRecordSheet(corporateId, req.params.id, req);
    if (!sheet) return res.status(404).json({ success: false, message: 'Employee not found' });

    const rows = sheet.allRecords.map((record) => ({
      employee_id: sheet.employee.employeeId,
      employee_name: sheet.employee.name,
      record_bucket: record.checkupType === 'pre_employment' ? 'Pre-Employment' : record.checkupType === 'annual_health_checkup' ? 'Annual Health Check-Up' : 'Other',
      report_name: record.reportName,
      report_type: record.reportType,
      report_date: record.reportDate,
      checkup_completed_at: record.checkupCompletedAt,
      report_due_at: record.reportDueAt,
      report_delivered_at: record.reportDeliveredAt,
      sla_status: record.slaStatus,
      source: record.source,
      order_number: record.orderNumber,
      report_url: record.reportUrl,
      notes: record.notes,
    }));

    const csv = toCsv(rows, [
      'employee_id',
      'employee_name',
      'record_bucket',
      'report_name',
      'report_type',
      'report_date',
      'checkup_completed_at',
      'report_due_at',
      'report_delivered_at',
      'sla_status',
      'source',
      'order_number',
      'report_url',
      'notes',
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    await accessAudit.record(req, { resourceId: `employee:${sheet.employee.employeeId}`, title: 'Employee health records', action: 'export' });
    res.setHeader('Content-Disposition', `attachment; filename=${sheet.employee.employeeId || req.params.id}-health-records.csv`);
    return res.status(200).send(csv);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    console.error('[corporate] export employee health records error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export employee health records' });
  }
});

router.get('/employees/:id', authCorporate, async (req, res) => {
  try {
    const corporateId = resolveCorporateIdFromUser(req.user);
    const employee = corporateId ? await resolveCorporateEmployee(corporateId, req.params.id) : null;
    if (employee) {
      return res.json({ success: true, data: { employee } });
    }
    return res.status(404).json({ success: false, message: 'Employee not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch employee', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Notifications — enhanced: send, unread-count, action_url
// ---------------------------------------------------------------------------

router.get('/notifications/unread-count', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { count: 0 } });
  const [row] = await postgresSequelize.query(
    `SELECT COUNT(*)::int AS cnt FROM corporate_notifications
      WHERE corporate_id = :corporateId AND read = false`,
    { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
  );
  return res.json({ success: true, data: { count: row?.cnt || 0 } });
});

router.post('/notifications/send', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  const { type = 'announcement', title, message, priority = 'medium', actionUrl, employeeId } = req.body || {};
  if (!title || !message) return res.status(400).json({ success: false, message: 'title and message are required' });
  const [rows] = await postgresSequelize.query(
    `INSERT INTO corporate_notifications (corporate_id, type, title, message, priority, read, action_url, employee_id, created_at)
     VALUES (:corporateId, :type, :title, :message, :priority, false, :actionUrl, :employeeId, NOW())
     RETURNING id, type, title, message, priority, read, action_url AS "actionUrl", employee_id AS "employeeId", created_at AS "createdAt"`,
    { replacements: { corporateId, type, title, message, priority, actionUrl: actionUrl || null, employeeId: employeeId || null } }
  );
  return res.status(201).json({ success: true, data: { notification: rows[0] } });
});

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

router.get('/consent/summary', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { total: 0, granted: 0, pending: 0, consentRate: 0 } });
  try {
    // Count the same active roster as /consent/employees. Historical consent
    // records for removed employees must not inflate the grant rate.
    const [summary] = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE c.granted = true)::int AS granted
         FROM corporate_employees ce
         LEFT JOIN corporate_employee_consents c
           ON c.corporate_id = ce.corporate_id AND c.employee_id = ce."employeeId" AND c.consent_type = 'health_data'
        WHERE ce.corporate_id = :corporateId AND ce."isActive" = true`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    const total = summary?.total || 0;
    const granted = summary?.granted || 0;
    return res.json({ success: true, data: { total, granted, pending: total - granted, consentRate: total > 0 ? Math.round((granted / total) * 100) : 0 } });
  } catch (err) {
    console.error('[corporate] consent summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch consent summary' });
  }
});

router.get('/consent/employees', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { employees: [] } });
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT ce."employeeId", ce.department, ce.designation,
              COALESCE(u."firstName" || ' ' || u."lastName", (ce.metadata->>'firstName') || ' ' || (ce.metadata->>'lastName'), ce."employeeId") AS name,
              COALESCE(u.email, ce.email) AS email,
              c.granted, c.granted_at AS "grantedAt", c.revoked_at AS "revokedAt", c.updated_at AS "updatedAt"
         FROM corporate_employees ce
         LEFT JOIN users u ON u.id = ce."userId"
         LEFT JOIN corporate_employee_consents c
           ON c.corporate_id = ce.corporate_id AND c.employee_id = ce."employeeId" AND c.consent_type = 'health_data'
        WHERE ce.corporate_id = :corporateId AND ce."isActive" = true
        ORDER BY ce."createdAt" DESC`,
      { replacements: { corporateId } }
    );
    return res.json({ success: true, data: { employees: rows } });
  } catch (err) {
    console.error('[corporate] consent employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch consent data' });
  }
});

router.post('/consent/record', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  const { employeeId, granted, notes } = req.body || {};
  if (typeof granted !== 'boolean') return res.status(400).json({ success: false, message: 'granted must be a boolean' });
  if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId required' });
  try {
    const outcome = await postgresSequelize.transaction(async (transaction) => {
      const [employees] = await postgresSequelize.query(
        `SELECT id FROM corporate_employees WHERE corporate_id=:corporateId AND "employeeId"=:employeeId AND "isActive"=true`,
        { transaction, replacements: { corporateId, employeeId } }
      );
      if (!employees.length) return { statusCode: 404, body: { success: false, message: 'Employee not found' } };
      await postgresSequelize.query(
        `INSERT INTO corporate_employee_consents (corporate_id, employee_id, consent_type, granted, granted_at, revoked_at, notes, created_at, updated_at)
         VALUES (:corporateId, :employeeId, 'health_data', :granted,
                 CASE WHEN :granted THEN NOW() ELSE NULL END,
                 CASE WHEN NOT :granted THEN NOW() ELSE NULL END,
                 :notes, NOW(), NOW())
         ON CONFLICT (corporate_id, employee_id, consent_type) DO UPDATE
           SET granted = EXCLUDED.granted,
               granted_at = CASE WHEN EXCLUDED.granted THEN NOW() ELSE corporate_employee_consents.granted_at END,
               revoked_at = CASE WHEN NOT EXCLUDED.granted THEN NOW() ELSE NULL END,
               notes = COALESCE(EXCLUDED.notes, corporate_employee_consents.notes),
               updated_at = NOW()`,
        { transaction, replacements: { corporateId, employeeId, granted: !!granted, notes: notes || null } }
      );
      await accessAudit.record(req, { resourceId: `employee:${employeeId}`, title: 'Health-data consent', action: granted ? 'consent_grant' : 'consent_revoke' }, transaction);
      return { statusCode: 200, body: { success: true } };
    });
    return res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    console.error('[corporate] consent record error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record consent' });
  }
});

router.post('/consent/bulk-request', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  try {
    // Upsert a consent request row for every active employee who hasn't consented yet.
    // granted=false means "requested but not yet responded"; HR will update per employee.
    const [result] = await postgresSequelize.query(
      `INSERT INTO corporate_employee_consents (corporate_id, employee_id, consent_type, granted, created_at, updated_at)
       SELECT :corporateId, ce."employeeId", 'health_data', false, NOW(), NOW()
         FROM corporate_employees ce
        WHERE ce.corporate_id = :corporateId AND ce."isActive" = true
       ON CONFLICT (corporate_id, employee_id, consent_type) DO NOTHING`,
      { replacements: { corporateId } }
    );
    return res.json({ success: true, data: { message: 'Consent requests created for pending employees' } });
  } catch (err) {
    console.error('[corporate] bulk consent request error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create consent requests' });
  }
});

// ---------------------------------------------------------------------------
// Report access audit log — auto-logged on /reports/:id/download
// ---------------------------------------------------------------------------

router.get('/audit-log', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { entries: [] } });
  const parsedLimit = Number(req.query.limit ?? 100);
  const parsedOffset = Number(req.query.offset ?? 0);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || !Number.isInteger(parsedOffset) || parsedOffset < 0) {
    return res.status(400).json({ success: false, message: 'Invalid audit pagination' });
  }
  const limit = Math.min(parsedLimit, 500);
  const offset = parsedOffset;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT id, report_id AS "reportId", report_title AS "reportTitle",
              accessed_by_type AS "accessedByType", accessed_by_name AS "accessedByName",
              action, ip_address AS "ipAddress", accessed_at AS "accessedAt"
         FROM corporate_report_access_log
        WHERE corporate_id = :corporateId
        ORDER BY accessed_at DESC
        LIMIT :limit OFFSET :offset`,
      { replacements: { corporateId, limit, offset } }
    );
    const [countRow] = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS cnt FROM corporate_report_access_log WHERE corporate_id = :corporateId`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return res.json({ success: true, data: { entries: rows, total: countRow?.cnt || 0 } });
  } catch (err) {
    console.error('[corporate] audit log error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
  }
});

// Compatibility for cached clients. Access is recorded by the actual server
// operation; client claims cannot create or duplicate audit evidence.
// ─── Completed health check-ups with reports (owner decision 2026-11-20: HR has full access to view,
// download and share; every access is written to audit_logs as PHI access) ─────────────────────
const hrCorporateId = (req) => Number(req.user?.corporateId || req.user?.organization_id) || null;

router.get('/checkup-completions', authCorporate, async (req, res) => {
  const corporateId = hrCorporateId(req);
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate on this account' });
  try {
    const { search, from, to, page, limit } = req.query;
    const data = await listCheckupCompletions({ corporateId, actorUserId: req.user.id, search, from, to, page, limit });
    await auditReportAccess(req, { action: 'hr_list_checkup_reports', corporateId, source: 'list', reportId: 0 });
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[corporate] checkup completions error:', err.message);
    return res.status(500).json({ success: false, message: 'Unable to load completed check-ups' });
  }
});

router.get('/checkup-reports/:source/:reportId/file', authCorporate, async (req, res) => {
  const corporateId = hrCorporateId(req);
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate on this account' });
  try {
    const file = await getCorporateReportFile({ corporateId, actorUserId: req.user.id, source: req.params.source, reportId: req.params.reportId });
    if (!file) return res.status(404).json({ success: false, message: 'Report not found' });
    const download = req.query.download === '1';
    await auditReportAccess(req, { action: download ? 'hr_download_checkup_report' : 'hr_view_checkup_report', corporateId, source: req.params.source, reportId: req.params.reportId, employeeUserId: file.employeeUserId });
    return sendReportFile(res, file, download ? 'attachment' : 'inline');
  } catch (err) {
    console.error('[corporate] checkup report file error:', err.message);
    if (!res.headersSent) return res.status(err.status === 404 ? 404 : 502).json({ success: false, code: err.code, message: err.status === 404 ? err.message : 'Unable to load the report' });
  }
});

router.post('/checkup-reports/:reportId/share', authCorporate, async (req, res) => {
  const corporateId = hrCorporateId(req);
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate on this account' });
  try {
    // Sent as the corporate's assigned Team member, so it comes from the same care desk as Team's shares.
    const [corp] = await postgresSequelize.query(
      `SELECT "companyName", "assignedTo" FROM corporates WHERE id = :corporateId LIMIT 1`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT });
    const { sendEmail = true, sendWhatsapp = true } = req.body || {};
    const result = await shareCorporateHealthReport({
      reportId: req.params.reportId, corporateId, senderUserId: Number(corp?.assignedTo) || req.user.id,
      sendEmail, sendWhatsapp, corporateName: corp?.companyName || '',
    });
    if (result.status === 200) await auditReportAccess(req, { action: 'hr_share_checkup_report', corporateId, source: 'manual', reportId: req.params.reportId, employeeUserId: result.body.employeeUserId });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[corporate] checkup report share error:', err.message);
    return res.status(500).json({ success: false, message: 'Unable to share the report' });
  }
});

router.post('/reports/:id/log-access', authCorporate, (req, res) => {
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Annual Health Checkup (AHC) management
// ---------------------------------------------------------------------------

router.get('/ahc/package-options', authCorporate, async (req,res) => {
  try {
    const packages=await postgresSequelize.query(`SELECT id::text AS id,name FROM corporate_health_package_catalog WHERE is_active=true AND metadata->>'kind'='health_checkup' AND metadata->>'corporateId'=:corporateId ORDER BY name`,{replacements:{corporateId:String(req.user?.corporateId || req.user?.organization_id)},type:postgresSequelize.QueryTypes.SELECT});
    return res.json({success:true,data:{packages}});
  } catch { return res.status(500).json({success:false,message:'Unable to load configured health packages'}); }
});

router.get('/ahc/summary', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { batches: 0, enrolled: 0, completed: 0, pending: 0 } });
  try {
    const [batchRow] = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM corporate_ahc_batches WHERE corporate_id = :corporateId`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    const [enrollRow] = await postgresSequelize.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE e.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE e.status IN ('pending','invited'))::int AS pending,
              COUNT(*) FILTER (WHERE e.status = 'invited')::int AS invited,
              COUNT(*) FILTER (WHERE e.status = 'booked')::int AS booked,
              COUNT(*) FILTER (WHERE e.report_ready = true)::int AS report_ready
         FROM corporate_ahc_enrollments e
         JOIN corporate_employees ce ON ce."employeeId" = e.employee_id AND ce.corporate_id = e.corporate_id
        WHERE e.corporate_id = :corporateId AND ce."isActive" = true`,
      { replacements: { corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );
    return res.json({
      success: true,
      data: {
        batches: batchRow?.total || 0,
        activeBatches: batchRow?.active || 0,
        completedBatches: batchRow?.completed || 0,
        enrolled: enrollRow?.total || 0,
        completed: enrollRow?.completed || 0,
        pending: enrollRow?.pending || 0,
        invited: enrollRow?.invited || 0,
        booked: enrollRow?.booked || 0,
        reportReady: enrollRow?.report_ready || 0,
      },
    });
  } catch (err) {
    console.error('[corporate] ahc summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch AHC summary' });
  }
});

router.get('/ahc/batches', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { batches: [] } });
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT b.id, b.batch_name AS "batchName", b.batch_year AS "batchYear",
              b.scheduled_date AS "scheduledDate", b.due_date AS "dueDate",
              b.status, b.priority, b.notes, b.target_departments AS "targetDepartments",
              b.created_at AS "createdAt",
              COUNT(e.id)::int AS enrolled,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed,
              COUNT(e.id) FILTER (WHERE e.status IN ('pending','invited'))::int AS pending,
              COUNT(e.id) FILTER (WHERE e.report_ready = true)::int AS "reportReady"
         FROM corporate_ahc_batches b
         LEFT JOIN corporate_ahc_enrollments e ON e.batch_id = b.id
           AND EXISTS (SELECT 1 FROM corporate_employees roster WHERE roster.corporate_id=e.corporate_id AND roster."employeeId"=e.employee_id AND roster."isActive"=true)
         LEFT JOIN corporate_employees ce ON ce."employeeId" = e.employee_id AND ce.corporate_id = e.corporate_id
        WHERE b.corporate_id = :corporateId
          AND (e.id IS NULL OR ce."isActive" IS NOT FALSE)
        GROUP BY b.id
        ORDER BY b.batch_year DESC, b.created_at DESC`,
      { replacements: { corporateId } }
    );
    return res.json({ success: true, data: { batches: rows } });
  } catch (err) {
    console.error('[corporate] ahc batches error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch AHC batches' });
  }
});

router.post('/ahc/batches', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  const { batchName, batchYear, scheduledDate, dueDate, priority = 'normal', notes, targetDepartments } = req.body || {};
  if (!batchName || !dueDate) return res.status(400).json({ success: false, message: 'batchName and dueDate are required' });
  try {
    const [rows] = await postgresSequelize.query(
      `INSERT INTO corporate_ahc_batches (corporate_id, batch_name, batch_year, scheduled_date, due_date, priority, notes, target_departments, created_by, status)
       VALUES (:corporateId, :batchName, :batchYear, :scheduledDate, :dueDate, :priority, :notes, :targetDepartments, :createdBy, 'planning')
       RETURNING id, batch_name AS "batchName", batch_year AS "batchYear", scheduled_date AS "scheduledDate", due_date AS "dueDate", status, priority, created_at AS "createdAt"`,
      {
        replacements: {
          corporateId, batchName,
          batchYear: batchYear || new Date().getFullYear(),
          scheduledDate: scheduledDate || null,
          dueDate,
          priority,
          notes: notes || null,
          targetDepartments: targetDepartments ? JSON.stringify(targetDepartments) : null,
          createdBy: req.user?.id || null,
        },
      }
    );
    return res.status(201).json({ success: true, data: { batch: rows[0] } });
  } catch (err) {
    console.error('[corporate] ahc create batch error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create AHC batch' });
  }
});

router.put('/ahc/batches/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { status, priority, notes, dueDate, scheduledDate } = req.body || {};
  try {
    if (status === 'active') {
      const data=await activateAhcBatch({corporateId,batchId:id,packageId:req.body?.packageId});
      // Activating a batch grants the entitlement and sends nothing. Report how
      // many are now awaiting the welcome, so a batch cannot be activated and
      // the employees left untold without anyone noticing.
      let invitations=null;
      try {
        const status=await ahcInvitationStatus(req.body?.packageId);
        invitations={sent:false,armed:status.armed,awaitingInvitation:status.counts.pending,
          hint:'POST /api/admin/health-packages/:id/invitations/send to send the AHC welcome'};
      } catch { /* not an AHC package, or no window configured */ }
      return res.json({success:true,data,invitations});
    }
    if (status && !['planning','completed','cancelled'].includes(status)) return res.status(400).json({success:false,message:'Invalid batch status'});
    await postgresSequelize.query(
      `UPDATE corporate_ahc_batches SET
         status = COALESCE(:status, status),
         priority = COALESCE(:priority, priority),
         notes = COALESCE(:notes, notes),
         due_date = COALESCE(:dueDate, due_date),
         scheduled_date = COALESCE(:scheduledDate, scheduled_date),
         updated_at = NOW()
       WHERE id = :id AND corporate_id = :corporateId`,
      { replacements: { id, corporateId, status: status || null, priority: priority || null, notes: notes || null, dueDate: dueDate || null, scheduledDate: scheduledDate || null } }
    );
    return res.json({ success: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({success:false,message:err.message});
    console.error('[corporate] ahc update batch error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update AHC batch' });
  }
});

router.get('/ahc/batches/:id/enrollments', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT e.id, e.employee_id AS "employeeId",
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''),
                       NULLIF(TRIM(CONCAT_WS(' ', ce.metadata->>'firstName', ce.metadata->>'lastName')), ''),
                       e.employee_name, e.employee_id) AS "employeeName",
              COALESCE(NULLIF(ce.department, ''), NULLIF(e.department, ''), 'General') AS department,
              e.status, e.booked_date AS "bookedDate", e.booked_slot AS "bookedSlot",
              e.report_ready AS "reportReady",
              CASE WHEN EXISTS (SELECT 1 FROM corporate_employee_consents consent
                WHERE consent.corporate_id=e.corporate_id AND consent.employee_id=e.employee_id
                  AND consent.consent_type='health_data' AND consent.granted=true AND consent.revoked_at IS NULL)
                THEN e.report_url ELSE NULL END AS "reportUrl",
              e.reminder_sent_at AS "reminderSentAt", e.notes,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''),
                       NULLIF(TRIM(CONCAT_WS(' ', ce.metadata->>'firstName', ce.metadata->>'lastName')), ''),
                       e.employee_name, e.employee_id) AS name,
              COALESCE(u.email, '') AS email,
              (SELECT COUNT(*)::int FROM corporate_ahc_dependents d WHERE d.enrollment_id = e.id) AS dependents
         FROM corporate_ahc_enrollments e
         LEFT JOIN corporate_employees ce ON ce."employeeId" = e.employee_id AND ce.corporate_id = e.corporate_id
         LEFT JOIN users u ON u.id = COALESCE(ce."userId", e.user_id)
        WHERE e.batch_id = :id AND e.corporate_id = :corporateId
          AND ce."isActive" IS NOT FALSE
        ORDER BY department, name`,
      { replacements: { id, corporateId } }
    );
    return res.json({ success: true, data: { enrollments: rows } });
  } catch (err) {
    console.error('[corporate] ahc enrollments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch enrollments' });
  }
});

router.post('/ahc/batches/:id/enroll-all', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { departments } = req.body || {};  // optional: filter by department
  try {
    const outcome = await postgresSequelize.transaction(async (transaction) => {
      // Verify the batch belongs to this corporate
      const [batchRows] = await postgresSequelize.query(
        `SELECT id FROM corporate_ahc_batches WHERE id = :id AND corporate_id = :corporateId`,
        { transaction, replacements: { id, corporateId } }
      );
      if (!batchRows[0]) return { statusCode: 404, body: { success: false, message: 'Batch not found' } };

      let deptFilter = '';
      const replacements = { id, corporateId };
      if (Array.isArray(departments) && departments.length) {
        deptFilter = `AND ce.department = ANY(ARRAY[:departments])`;
        replacements.departments = departments;
      }

      // Age eligibility from Settings > Eligibility (minAge/maxAge). Batch
      // names implying an age cutoff (e.g. "Age 40+") previously enrolled
      // everyone regardless - no age predicate existed anywhere. An employee
      // with no known date of birth (true for most roster-only employees,
      // which have no DOB column at all) is still included rather than
      // silently excluded, since we can't evaluate the rule for them.
      const [[settingsRow]] = await postgresSequelize.query(
        `SELECT settings FROM corporate_settings WHERE corporate_id = :corporateId`,
        { transaction, replacements: { corporateId } }
      );
      const elig = settingsRow?.settings?.eligibility || {};
      const minAge = Number(elig.minAge) || 0;
      const maxAge = Number(elig.maxAge) || 0;
      let ageFilter = '';
      if (minAge > 0) {
        ageFilter += ` AND (u."dateOfBirth" IS NULL OR DATE_PART('year', AGE(u."dateOfBirth")) >= ${minAge})`;
      }
      if (maxAge > 0) {
        ageFilter += ` AND (u."dateOfBirth" IS NULL OR DATE_PART('year', AGE(u."dateOfBirth")) <= ${maxAge})`;
      }

      const [result] = await postgresSequelize.query(
        `INSERT INTO corporate_ahc_enrollments (batch_id, corporate_id, employee_id, employee_name, department, user_id, status, created_at, updated_at)
         SELECT :id, :corporateId, ce."employeeId",
                TRIM(COALESCE(u."firstName" || ' ' || u."lastName", (ce.metadata->>'firstName')::text || ' ' || (ce.metadata->>'lastName')::text, ce."employeeId")),
                ce.department, ce."userId", 'pending', NOW(), NOW()
           FROM corporate_employees ce
           LEFT JOIN users u ON u.id = ce."userId"
          WHERE ce.corporate_id = :corporateId AND ce."isActive" = true ${deptFilter} ${ageFilter}
         ON CONFLICT (batch_id, employee_id) DO NOTHING
         RETURNING id`,
        { transaction, replacements }
      );
      await accessAudit.record(req, { resourceId: `ahc:${id}`, title: `${result.length} employees enrolled`, action: 'enroll' }, transaction);
      return { statusCode: 200, body: { success: true, data: { enrolled: result.length, message: `${result.length} employees enrolled` } } };
    });
    return res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    console.error('[corporate] ahc enroll-all error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to enroll employees' });
  }
});

router.put('/ahc/enrollments/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { status, bookedDate, bookedSlot, reportReady, reportUrl, notes } = req.body || {};
  try {
    await postgresSequelize.query(
      `UPDATE corporate_ahc_enrollments SET
         status = COALESCE(:status, status),
         booked_date = COALESCE(:bookedDate, booked_date),
         booked_slot = COALESCE(:bookedSlot, booked_slot),
         report_ready = COALESCE(:reportReady, report_ready),
         report_url = COALESCE(:reportUrl, report_url),
         notes = COALESCE(:notes, notes),
         updated_at = NOW()
       WHERE id = :id AND corporate_id = :corporateId`,
      { replacements: { id, corporateId, status: status || null, bookedDate: bookedDate || null, bookedSlot: bookedSlot || null, reportReady: reportReady != null ? reportReady : null, reportUrl: reportUrl || null, notes: notes || null } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[corporate] ahc update enrollment error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update enrollment' });
  }
});

router.post('/ahc/batches/:id/send-reminders', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  try {
    const reminded = await remindAhcBatch({corporateId,batchId:id});
    // remindAhcBatch writes an in-app notification only — channels ARRAY['app'].
    // Naming the channel stops this reading as "an email went out", which is
    // what the endpoint's name suggests and what it does not do.
    if (reminded === null) return res.status(404).json({success:false,message:'Batch not found'});
    return res.json({success:true,data:{reminded,channels:['app'],
      message:`In-app reminder sent to ${reminded} employee(s). No email or WhatsApp was sent — use the AHC invitation send for email.`}});
  } catch (err) {
    console.error('[corporate] ahc send reminders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send reminders' });
  }
});

router.post('/ahc/enrollments/:id/dependents', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { name, relationship, dateOfBirth, gender } = req.body || {};
  if (!name || !relationship) return res.status(400).json({ success: false, message: 'name and relationship required' });
  try {
    const [enr] = await postgresSequelize.query(
      `SELECT id FROM corporate_ahc_enrollments WHERE id = :id AND corporate_id = :corporateId`,
      { replacements: { id, corporateId } }
    );
    if (!enr[0]) return res.status(404).json({ success: false, message: 'Enrollment not found' });
    const [rows] = await postgresSequelize.query(
      `INSERT INTO corporate_ahc_dependents (enrollment_id, name, relationship, date_of_birth, gender)
       VALUES (:id, :name, :relationship, :dateOfBirth, :gender)
       RETURNING id, name, relationship, date_of_birth AS "dateOfBirth", gender, status`,
      { replacements: { id, name, relationship, dateOfBirth: dateOfBirth || null, gender: gender || null } }
    );
    return res.status(201).json({ success: true, data: { dependent: rows[0] } });
  } catch (err) {
    console.error('[corporate] ahc add dependent error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to add dependent' });
  }
});

// ─── Bulk employee status ──────────────────────────────────────────────────────
router.patch('/employees/bulk-status', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { employeeIds, action } = req.body || {};
  if (!Array.isArray(employeeIds) || !employeeIds.length) return res.status(400).json({ success: false, message: 'employeeIds required' });
  if (!['activate', 'deactivate'].includes(action)) return res.status(400).json({ success: false, message: 'action must be activate or deactivate' });
  try {
    const outcome = await postgresSequelize.transaction(async (transaction) => {
      const [result] = await postgresSequelize.query(
        `UPDATE corporate_employees SET "isActive" = :active,
           "exitDate"=CASE WHEN :active THEN NULL ELSE COALESCE("exitDate",CURRENT_DATE) END,
           metadata=jsonb_set(COALESCE(metadata,'{}')||jsonb_build_object('appAccessDisabled',NOT :active),'{employmentHistory}',COALESCE(metadata->'employmentHistory','[]')||jsonb_build_array(jsonb_build_object('active',:active,'changedAt',NOW()))),
           "updatedAt" = NOW()
         WHERE corporate_id = :corporateId AND "employeeId" IN (:ids)
         RETURNING "employeeId","userId"`,
        { transaction, replacements: { active: action === 'activate', corporateId, ids: employeeIds } }
      );
      await synchronizeCorporateEmployment(postgresSequelize,corporateId,result,action==='activate',transaction);
      for (const employee of result) {
        await accessAudit.record(req, { resourceId: `employee:${employee.employeeId}`, title: 'Employee status', action }, transaction);
      }
      return { statusCode: 200, body: { success: true, data: { updated: result.length, action } } };
    });
    return res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    console.error('[corporate] bulk-status error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update employees' });
  }
});

// ─── Age distribution analytics ───────────────────────────────────────────────
router.get('/dashboard/age-distribution', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT
         CASE
           WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) < 25 THEN 'Under 25'
           WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) BETWEEN 25 AND 34 THEN '25-34'
           WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) BETWEEN 35 AND 44 THEN '35-44'
           WHEN EXTRACT(YEAR FROM AGE(u."dateOfBirth")) BETWEEN 45 AND 54 THEN '45-54'
           ELSE '55+'
         END AS age_range,
         COUNT(*) AS count
       FROM corporate_employees ce
       LEFT JOIN users u ON u.id = ce."userId"
       WHERE ce.corporate_id = :corporateId AND ce."isActive" = true AND u."dateOfBirth" IS NOT NULL
       GROUP BY age_range
       ORDER BY age_range`,
      { replacements: { corporateId } }
    );
    const total = rows.reduce((s, r) => s + parseInt(r.count, 10), 0);
    const ageGroups = rows.map(r => ({
      range: r.age_range,
      count: parseInt(r.count, 10),
      percentage: total > 0 ? Math.round((parseInt(r.count, 10) / total) * 100) : 0,
    }));
    return res.json({ success: true, data: { ageGroups, totalWithDOB: total } });
  } catch (err) {
    console.error('[corporate] age-distribution error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load age distribution' });
  }
});

// ─── All employee appointments (HR-booked + employee self-booked) ─────────────
router.get('/all-appointments', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  try {
    // HR-booked (no RLS)
    const [hrAppts] = await postgresSequelize.query(
      `SELECT id, "employeeId", "employeeName", department, "appointmentType" AS type,
              "doctorName", facility, date::text, time, status, notes, "createdAt",
              'hr_booked' AS source
       FROM corporate_scheduled_appointments
       WHERE corporate_id = :corporateId
         AND (:status IS NULL OR status = :status)
       ORDER BY date DESC, time DESC`,
      { replacements: { corporateId, status: status || null } }
    );
    // Employee self-booked (appointments table has RLS — use platform-admin bypass)
    let selfAppts = [];
    await postgresSequelize.transaction(async (tx) => {
      await setRlsContext(tx, { orgId: 0, userId: 0, isPlatformAdmin: true });
      const [rows] = await postgresSequelize.query(
        `SELECT a.id,
                ce."employeeId" AS "employeeId",
                CONCAT(u."firstName", ' ', u."lastName") AS "employeeName",
                COALESCE(NULLIF(ce.department,''),'General') AS department,
                COALESCE(a."consultationType"::text, 'Teleconsultation') AS type,
                a."doctorName", NULL AS facility, a."appointmentDate"::text AS date,
                a."appointmentTime"::text AS time, a.status, NULL AS notes,
                a."createdAt", 'employee_booked' AS source
         FROM appointments a
         JOIN users u ON u.id = a."userId"
         JOIN corporate_employees ce ON ce."userId"=a."userId" AND ce.corporate_id=:corporateId
         WHERE a.corporate_tenant_id = :corporateId
           AND (:status IS NULL OR a.status = :status)
         ORDER BY a."appointmentDate" DESC, a."appointmentTime" DESC`,
        { replacements: { corporateId, status: status || null }, transaction: tx }
      );
      selfAppts = rows;
    });
    const all = [...hrAppts, ...selfAppts].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const paginated = all.slice(offset, offset + parseInt(limit, 10));
    return res.json({ success: true, data: { appointments: paginated, total: all.length, page: parseInt(page, 10) } });
  } catch (err) {
    console.error('[corporate] all-appointments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load appointments' });
  }
});

// ─── Send manual appointment reminder ─────────────────────────────────────────
router.post('/appointments/:apptId/remind', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { apptId } = req.params;
  try {
    // apptId may belong to either source table (hr_booked vs employee_booked) — check both.
    const source = req.body?.source || 'hr_booked';
    if (!['hr_booked','employee_booked'].includes(source)) return res.status(400).json({success:false,message:'Invalid appointment source'});
    const [hrRows] = source === 'employee_booked' ? [[]] : await postgresSequelize.query(
      `SELECT a.date::text AS date, a.time, a.status, ce."userId" AS "userId"
         FROM corporate_scheduled_appointments a
         JOIN corporate_employees ce ON ce.corporate_id=a.corporate_id AND ce."employeeId"=a."employeeId" AND ce."isActive"=true
        WHERE a.id = :apptId AND a.corporate_id = :corporateId`,
      { replacements: { apptId, corporateId } }
    );
    let apptRow = hrRows[0] || null;
    if (!apptRow && source === 'employee_booked') {
      await postgresSequelize.transaction(async (tx) => {
        await setRlsContext(tx, { orgId: 0, userId: 0, isPlatformAdmin: true });
        const [rows] = await postgresSequelize.query(
          `SELECT a."appointmentDate"::text AS date, a."appointmentTime"::text AS time, a."userId", a.status
             FROM appointments a
            WHERE a.id = :apptId AND a.corporate_tenant_id = :corporateId`,
          { replacements: { apptId, corporateId }, transaction: tx }
        );
        apptRow = rows[0] || null;
      });
    }
    if (!apptRow) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (!apptRow.userId) return res.status(409).json({ success: false, message: 'Employee has no linked account for reminders' });
    if (['cancelled', 'completed', 'no_show', 'no-show'].includes(String(apptRow.status).toLowerCase()))
      return res.status(400).json({ success: false, message: 'Appointment is no longer upcoming' });
    const time = String(apptRow.time || '00:00').slice(0, 8);
    const apptDateTime = new Date(`${apptRow.date.slice(0, 10)}T${time.length === 5 ? time + ':00' : time}+05:30`);
    if (Number.isNaN(apptDateTime.getTime()) || apptDateTime.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Cannot send a reminder for an appointment that has already passed' });
    }
    await postgresSequelize.query(
      `INSERT INTO notifications ("userId","userType",type,title,message,"isRead",status,channels,"webRoute","createdAt","updatedAt")
       VALUES (:userId,'patient','reminder','Appointment Reminder',:message,false,'sent',ARRAY['app'],'/appointments',NOW(),NOW())`,
      { replacements: { userId: apptRow.userId, message: `Your health appointment is on ${apptRow.date.slice(0, 10)} at ${time.slice(0, 5)} IST. Please be on time.` } }
    );
    return res.json({ success: true, message: 'Reminder sent' });
  } catch (err) {
    console.error('[corporate] remind error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send reminder' });
  }
});

// ─── Doctor list for scheduling ───────────────────────────────────────────────
router.get('/doctors', authCorporate, async (req, res) => {
  const { search = '', specialization = '' } = req.query;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT id, CONCAT("firstName", ' ', "lastName") AS name,
              specialization, "consultationFees" AS fee, rating, status,
              "profileImage" AS avatar, "registrationNumber"
       FROM doctors
       WHERE status = 'active'
         AND (:search = '' OR LOWER(CONCAT("firstName",' ',"lastName")) LIKE LOWER('%' || :search || '%'))
         AND (:spec = '' OR LOWER(specialization) LIKE LOWER('%' || :spec || '%'))
       ORDER BY rating DESC NULLS LAST, "totalReviews" DESC NULLS LAST
       LIMIT 100`,
      { replacements: { search, spec: specialization } }
    );
    return res.json({ success: true, data: { doctors: rows } });
  } catch (err) {
    console.error('[corporate] doctors error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load doctors' });
  }
});

// ─── Wellness activity registrations ──────────────────────────────────────────
router.get('/wellness-calendar/activities/:id/registrations', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  try {
    const [event] = await postgresSequelize.query(
      `SELECT id, title, registered_count, max_participants FROM corporate_wellness_events
       WHERE id = :id AND corporate_id = :corporateId`,
      { replacements: { id, corporateId } }
    );
    if (!event[0]) return res.status(404).json({ success: false, message: 'Event not found' });
    const [rows] = await postgresSequelize.query(
      `SELECT r.id, r."employeeId", r.status, r.invited_at AS "invitedAt", r.responded_at AS "respondedAt",
              COALESCE(CONCAT(u."firstName",' ',u."lastName"), r."employeeId") AS "employeeName",
              ce.department, ce.designation
       FROM corporate_wellness_event_rsvps r
       LEFT JOIN users u ON u.id = r."userId"
       LEFT JOIN corporate_employees ce ON ce."employeeId" = r."employeeId" AND ce.corporate_id = :corporateId
       WHERE r.event_id = :id
       ORDER BY r.invited_at DESC`,
      { replacements: { id, corporateId } }
    );
    return res.json({ success: true, data: { event: event[0], registrations: rows } });
  } catch (err) {
    console.error('[corporate] wellness registrations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load registrations' });
  }
});

router.delete('/wellness-calendar/registrations/:rsvpId', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { rsvpId } = req.params;
  try {
    const [rows] = await postgresSequelize.query(
      `UPDATE corporate_wellness_event_rsvps r
       SET status = 'cancelled', responded_at = NOW()
       FROM corporate_wellness_events e
       WHERE r.id = :rsvpId AND r.event_id = e.id AND e.corporate_id = :corporateId
       RETURNING r.id`,
      { replacements: { rsvpId, corporateId } }
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Registration not found' });
    await postgresSequelize.query(
      `UPDATE corporate_wellness_events SET registered_count = GREATEST(0, registered_count - 1)
       WHERE id = (SELECT event_id FROM corporate_wellness_event_rsvps WHERE id = :rsvpId)`,
      { replacements: { rsvpId } }
    );
    return res.json({ success: true, message: 'Registration cancelled' });
  } catch (err) {
    console.error('[corporate] cancel rsvp error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to cancel registration' });
  }
});

// ─── Health report delivery status ────────────────────────────────────────────
router.get('/health-reports', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { department, status } = req.query;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT hr.id, hr.employee_id AS "employeeId", hr.report_name AS "reportName",
              hr.report_type AS "reportType", hr.report_date::text AS "reportDate",
              hr.sla_status AS "slaStatus", hr.report_delivered_at AS "deliveredAt",
              hr.report_due_at AS "dueAt", hr.notified_email AS "notifiedEmail",
              hr.notified_whatsapp AS "notifiedWhatsapp", hr.checkup_type AS "checkupType",
              COALESCE(CONCAT(u."firstName",' ',u."lastName"), ce."employeeId") AS "employeeName",
              ce.department
       FROM corporate_health_reports hr
       LEFT JOIN users u ON u.id = hr.employee_id
       LEFT JOIN corporate_employees ce ON ce."userId" = hr.employee_id AND ce.corporate_id = :corporateId
       WHERE hr.corporate_id = :corporateId
         AND (:dept IS NULL OR ce.department = :dept)
         AND (:status IS NULL OR hr.sla_status = :status)
       ORDER BY hr.report_date DESC`,
      { replacements: { corporateId, dept: department || null, status: status || null } }
    );
    const stats = {
      total: rows.length,
      delivered: rows.filter(r => r.deliveredAt).length,
      overdue: rows.filter(r => r.slaStatus === 'overdue').length,
      pending: rows.filter(r => !r.deliveredAt).length,
    };
    return res.json({ success: true, data: { reports: rows, stats } });
  } catch (err) {
    console.error('[corporate] health-reports error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load health reports' });
  }
});

// ─── Corporate settings (eligibility rules + general) ─────────────────────────
router.get('/settings/data', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  try {
    const [rows] = await postgresSequelize.query(
      `SELECT settings FROM corporate_settings WHERE corporate_id = :corporateId`,
      { replacements: { corporateId } }
    );
    return res.json({ success: true, data: { settings: protectedSettings(rows[0]?.settings) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
});

router.put('/settings/data', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if(!req.body?.settings || typeof req.body.settings !== 'object' || Array.isArray(req.body.settings))return res.status(400).json({success:false,message:'settings object required'});
  const settings = protectedSettings(req.body.settings);
  if(!['corporate','corporate_admin'].includes(req.user.role))return res.status(403).json({success:false,message:'Only Super HR can change corporate settings'});
  if (!settings || typeof settings !== 'object') return res.status(400).json({ success: false, message: 'settings object required' });
  try {
    await postgresSequelize.query(
      `INSERT INTO corporate_settings (corporate_id, settings, "createdAt", "updatedAt")
       VALUES (:corporateId, :settings, NOW(), NOW())
       ON CONFLICT (corporate_id) DO UPDATE SET settings = corporate_settings.settings || :settings, "updatedAt" = NOW()`,
      { replacements: { corporateId, settings: JSON.stringify(settings) } }
    );
    return res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    console.error('[corporate] save settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
});

// ─── Participation analytics ───────────────────────────────────────────────────
router.get('/analytics/participation', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  try {
    const [totalRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS total FROM corporate_employees WHERE corporate_id = :corporateId AND "isActive" = true`,
      { replacements: { corporateId } }
    );
    const total = parseInt(totalRow[0]?.total || 0, 10);
    // Participation requires completed care; enrollment and unused bookings are not usage.
    const [participantRows] = await postgresSequelize.query(
      `SELECT COUNT(DISTINCT ce."employeeId") AS cnt
       FROM corporate_employees ce
       WHERE ce.corporate_id = :corporateId AND ce."isActive" = true
         AND (
           EXISTS (SELECT 1 FROM corporate_scheduled_appointments a WHERE a.corporate_id = :corporateId AND a."employeeId" = ce."employeeId" AND LOWER(a.status) = 'completed')
           OR EXISTS (SELECT 1 FROM corporate_ahc_enrollments e WHERE e.corporate_id = :corporateId AND e.employee_id = ce."employeeId" AND e.status = 'completed')
         )`,
      { replacements: { corporateId } }
    );
    const participating = parseInt(participantRows[0]?.cnt || 0, 10);
    // Monthly teleconsultation count
    const [tcRows] = await postgresSequelize.query(
      `SELECT COUNT(*) AS cnt FROM appointments
       WHERE corporate_tenant_id = :corporateId
         AND "appointmentDate" >= DATE_TRUNC('month', NOW())`,
      { replacements: { corporateId } }
    );
    const teleconsultationsThisMonth = parseInt(tcRows[0]?.cnt || 0, 10);
    // Pending checkups from AHC enrollments
    const [pendRow] = await postgresSequelize.query(
      `SELECT COUNT(*) AS cnt FROM corporate_ahc_enrollments e
       JOIN corporate_employees ce ON ce.corporate_id=e.corporate_id AND ce."employeeId"=e.employee_id AND ce."isActive"=true
       WHERE e.corporate_id = :corporateId AND e.status IN ('pending','invited')`,
      { replacements: { corporateId } }
    );
    const pendingCheckups = parseInt(pendRow[0]?.cnt || 0, 10);
    // Department-wise participation
    const [deptRows] = await postgresSequelize.query(
      `SELECT ce.department,
              COUNT(*) AS total,
              COUNT(CASE WHEN EXISTS (
                SELECT 1 FROM corporate_scheduled_appointments a WHERE a.corporate_id = :corporateId AND a."employeeId" = ce."employeeId" AND LOWER(a.status) = 'completed'
              ) OR EXISTS (
                SELECT 1 FROM corporate_ahc_enrollments e WHERE e.corporate_id = :corporateId AND e.employee_id = ce."employeeId" AND e.status = 'completed'
              ) THEN 1 END) AS participating
       FROM corporate_employees ce
       WHERE ce.corporate_id = :corporateId AND ce."isActive" = true AND ce.department IS NOT NULL
       GROUP BY ce.department
       ORDER BY total DESC`,
      { replacements: { corporateId } }
    );
    const departments = deptRows.map(r => ({
      department: r.department,
      total: parseInt(r.total, 10),
      participating: parseInt(r.participating, 10),
      rate: parseInt(r.total, 10) > 0 ? Math.round((parseInt(r.participating, 10) / parseInt(r.total, 10)) * 100) : 0,
    }));
    return res.json({
      success: true,
      data: {
        totalEligible: total,
        totalParticipating: participating,
        participationRate: total > 0 ? Math.round((participating / total) * 100) : 0,
        teleconsultationsThisMonth,
        pendingCheckups,
        departments,
      },
    });
  } catch (err) {
    console.error('[corporate] participation analytics error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load participation data' });
  }
});

// ─── Monthly utilization chart ─────────────────────────────────────────────────
router.get('/analytics/monthly-utilization', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  try {
    // Appointments by month (last 12 months)
    const [apptRows] = await postgresSequelize.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YYYY') AS month,
              TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month_key,
              COUNT(*) AS appointments
       FROM corporate_scheduled_appointments
       WHERE corporate_id = :corporateId
         AND date >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY DATE_TRUNC('month', date)`,
      { replacements: { corporateId } }
    );
    // AHC completions by month
    const [ahcRows] = await postgresSequelize.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', updated_at), 'Mon YYYY') AS month,
              TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month_key,
              COUNT(*) AS completions
       FROM corporate_ahc_enrollments
       WHERE corporate_id = :corporateId AND status = 'completed'
         AND updated_at >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', updated_at)
       ORDER BY DATE_TRUNC('month', updated_at)`,
      { replacements: { corporateId } }
    );
    // Merge by month
    const months = {};
    for (const r of apptRows) { months[r.month_key] = { month: r.month, appointments: parseInt(r.appointments, 10), ahcCompletions: 0 }; }
    for (const r of ahcRows) { if (!months[r.month_key]) months[r.month_key] = { month: r.month, appointments: 0, ahcCompletions: 0 }; months[r.month_key].ahcCompletions = parseInt(r.completions, 10); }
    const chart = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    return res.json({ success: true, data: { chart } });
  } catch (err) {
    console.error('[corporate] monthly-utilization error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load utilization data' });
  }
});

router.use(createCorporateSsoRouter({
  database: postgresSequelize, authenticate: authCorporate, limiter: authLimiter, passwordMatches: corporatePasswordMatches, audit: accessAudit,
  loginMfa: corporateMfaLogin,
  encrypt: value => encryptSsoSecret(value), decrypt: value => decryptSsoSecret(value),
  sign: (payload, options) => jwtSso.sign(payload, JWT_SSO_SECRET, { ...options, algorithm: 'HS256', issuer: 'mediqzy-corporate-sso', audience: 'mediqzy-corporate-sso' }),
  verify: token => jwtSso.verify(token, JWT_SSO_SECRET, { algorithms: ['HS256'], issuer: 'mediqzy-corporate-sso', audience: 'mediqzy-corporate-sso' }),
  accessToken: async payload => {const {issuePortalTokenPair}=await import('../services/token-revocation.service.js');const pair=await issuePortalTokenPair(payload,{portal:'corporate'});return {token:pair.accessToken,refreshToken:pair.refreshToken};},
}));
router.use(createCorporateAccessRouter({ database: postgresSequelize, authenticate: authCorporate, audit: accessAudit }));
router.use(createCorporateSecurityRouter({
  authenticate: authCorporate, limiter: authLimiter, mfa: corporateMfa, identity: corporateMfaIdentity,
  passwordMatches: corporatePasswordMatches,
  tokenFor: async (req, proof) => {
    const { exp, iat, nbf, ...claims } = req.corporateToken;
    const {issuePortalTokenPair}=await import('../services/token-revocation.service.js');
    const pair=await issuePortalTokenPair({...claims,...proof},{portal:'corporate',deviceFp:req.headers['x-device-fingerprint']||null});
    return {token:pair.accessToken,refreshToken:pair.refreshToken};
  },
}));
router.use(createCorporateProgramsRouter({
  database: postgresSequelize, authenticate: authCorporate, authenticateEmployee: authEmployee, audit: accessAudit,
  withClinicalContext: async (transaction, action) => {
    await setRlsContext(transaction, { orgId: 0, userId: 0, isPlatformAdmin: true });
    return action();
  },
}));
/**
 * Insurance membership -> employee account linking (HR side).
 *
 * The gap analysis gave HR the member roster from the start ("HR view ...
 * bulk member upload, endorsement requests"), and the employer is the only
 * party that actually knows which staff code belongs to which person. Until a
 * membership names an account, the member-facing e-card has nothing safe to
 * resolve and reports that no card is linked.
 *
 * Every query here is scoped to req.corporateUser.corporateId, and a
 * membership whose corporate is not yet set is shown only when its own
 * corporate name resolves to this employer.
 *
 * GET /api/corporate/insurance-members
 */
router.get('/insurance-members', authCorporate, async (req, res) => {
  try {
    const result = await tpaMemberLink.proposeLinksForCorporate({
      corporateId: req.corporateUser.corporateId,
      limit: req.query.limit,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[corporate] insurance member list error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load insurance memberships' });
  }
});

/**
 * POST /api/corporate/insurance-members/bulk
 *
 * The employer submits its own insurance roster. Each row becomes a
 * `submitted` enrolment for the TPA desk to approve; the desk's approval is
 * what creates the membership, and because the enrolment already carries the
 * account and the corporate, that membership is born linked.
 *
 * Pass dryRun to see what would be submitted, and what would link, first.
 *
 * body: { members: [{ employeeId, memberName, policyNumber, relation?,
 *                     coverageAmount?, dependents? }], dryRun? }
 */
router.post('/insurance-members/bulk', authCorporate, async (req, res) => {
  try {
    const result = await tpaMemberLink.submitEnrolments({
      corporateId: req.corporateUser.corporateId,
      rows: req.body?.members,
      actorId: req.user?.userId || req.corporateUser.corporateId,
      dryRun: req.body?.dryRun === true,
    });
    res.status(result.dryRun ? 200 : 201).json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[corporate] insurance enrolment upload error:', error.message);
    res.status(500).json({ success: false, message: 'Could not submit those enrolments' });
  }
});

/**
 * GET /api/corporate/insurance-members/enrolments
 */
router.get('/insurance-members/enrolments', authCorporate, async (req, res) => {
  try {
    const result = await tpaMemberLink.listEnrolmentsForCorporate({
      corporateId: req.corporateUser.corporateId,
      status: req.query.status,
      limit: req.query.limit,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[corporate] insurance enrolment list error:', error.message);
    res.status(500).json({ success: false, message: 'Could not load your insurance enrolments' });
  }
});

/**
 * GET /api/corporate/insurance-members/template
 */
router.get('/insurance-members/template', authCorporate, (req, res) => {
  const csv = 'employeeId,memberName,policyNumber,relation,coverageAmount\n'
    + 'EMP001,Asha Menon,GRP-2026-0001,self,500000\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="insurance_members_template.csv"');
  res.send(csv);
});

/**
 * POST /api/corporate/insurance-members/:memberId/link   body: { userId }
 */
router.post('/insurance-members/:memberId/link', authCorporate, async (req, res) => {
  try {
    const corporateId = req.corporateUser.corporateId;
    const result = await tpaMemberLink.applyLink({
      memberId: req.params.memberId,
      userId: req.body?.userId,
      corporateId,
      requireCorporateId: corporateId,
      actorId: req.user?.userId || corporateId,
      method: tpaMemberLink.LINK_METHOD.ROSTER,
    });
    if (!result) {
      return res.status(404).json({
        success: false,
        code: 'MEMBER_NOT_IN_CORPORATE',
        message: 'No insurance membership of your company carries that member id. If the membership is new, ask the TPA desk to map it to your company first.',
      });
    }
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[corporate] insurance member link error:', error.message);
    res.status(500).json({ success: false, message: 'Could not link that membership' });
  }
});

/**
 * DELETE /api/corporate/insurance-members/:memberId/link
 */
router.delete('/insurance-members/:memberId/link', authCorporate, async (req, res) => {
  try {
    const corporateId = req.corporateUser.corporateId;
    const result = await tpaMemberLink.removeLink({ memberId: req.params.memberId, requireCorporateId: corporateId });
    if (!result) return res.status(404).json({ success: false, message: 'No insurance membership of your company carries that member id' });
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    console.error('[corporate] insurance member unlink error:', error.message);
    res.status(500).json({ success: false, message: 'Could not unlink that membership' });
  }
});

export default router;
