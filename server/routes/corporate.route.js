import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authCorporate } from '../middleware/corporate.middleware.js';
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
import { setRlsContext } from '../middleware/rls-context.middleware.js';

const router = express.Router();

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

// Employees (corporate HR view)
let corporateEmployees = [
  {
    id: 'EMP001',
    employeeId: 'EMP001',
    name: 'Rajesh Kumar',
    email: 'rajesh.kumar@company.com',
    phone: '+91 98765 43210',
    department: 'Engineering',
    designation: 'Senior Software Engineer',
    joiningDate: '2020-06-15',
    healthStatus: 'good',
    lastCheckup: '2025-11-15',
    insurancePlan: 'Premium Plan',
  },
  {
    id: 'EMP002',
    employeeId: 'EMP002',
    name: 'Priya Sharma',
    email: 'priya.sharma@company.com',
    phone: '+91 98765 43211',
    department: 'Human Resources',
    designation: 'HR Manager',
    joiningDate: '2019-03-10',
    healthStatus: 'excellent',
    lastCheckup: '2025-12-01',
    insurancePlan: 'Premium Plan',
  },
  {
    id: 'EMP003',
    employeeId: 'EMP003',
    name: 'Amit Patel',
    email: 'amit.patel@company.com',
    phone: '+91 98765 43212',
    department: 'Sales',
    designation: 'Sales Executive',
    joiningDate: '2021-08-20',
    healthStatus: 'moderate',
    lastCheckup: '2025-10-10',
    insurancePlan: 'Standard Plan',
  },
  {
    id: 'EMP004',
    employeeId: 'EMP004',
    name: 'Neha Sharma',
    email: 'neha.sharma@company.com',
    phone: '+91 98765 43213',
    department: 'Finance',
    designation: 'Financial Analyst',
    joiningDate: '2020-11-01',
    healthStatus: 'good',
    lastCheckup: '2025-11-20',
    insurancePlan: 'Premium Plan',
  },
  {
    id: 'EMP005',
    employeeId: 'EMP005',
    name: 'Arjun Mehta',
    email: 'arjun.mehta@company.com',
    phone: '+91 98765 43214',
    department: 'Marketing',
    designation: 'Marketing Manager',
    joiningDate: '2018-07-15',
    healthStatus: 'excellent',
    lastCheckup: '2025-12-05',
    insurancePlan: 'Premium Plan',
  },
  {
    id: 'EMP006',
    employeeId: 'EMP006',
    name: 'Riya Patel',
    email: 'riya.patel@company.com',
    phone: '+91 98765 43215',
    department: 'Engineering',
    designation: 'Product Designer',
    joiningDate: '2022-01-10',
    healthStatus: 'good',
    lastCheckup: '2025-10-25',
    insurancePlan: 'Standard Plan',
  },
  {
    id: 'EMP007',
    employeeId: 'EMP007',
    name: 'Karan Verma',
    email: 'karan.verma@company.com',
    phone: '+91 98765 43216',
    department: 'Operations',
    designation: 'Operations Lead',
    joiningDate: '2019-09-20',
    healthStatus: 'moderate',
    lastCheckup: '2025-09-15',
    insurancePlan: 'Standard Plan',
  },
  {
    id: 'EMP008',
    employeeId: 'EMP008',
    name: 'Sneha Kulkarni',
    email: 'sneha.kulkarni@company.com',
    phone: '+91 98765 43217',
    department: 'Finance',
    designation: 'Accountant',
    joiningDate: '2021-04-05',
    healthStatus: 'excellent',
    lastCheckup: '2025-11-30',
    insurancePlan: 'Premium Plan',
  },
  {
    id: 'EMP009',
    employeeId: 'EMP009',
    name: 'Vikram Singh',
    email: 'vikram.singh@company.com',
    phone: '+91 98765 43218',
    department: 'Sales',
    designation: 'Sales Manager',
    joiningDate: '2017-12-01',
    healthStatus: 'good',
    lastCheckup: '2025-10-18',
    insurancePlan: 'Premium Plan',
  },
  {
    id: 'EMP010',
    employeeId: 'EMP010',
    name: 'Divya Nair',
    email: 'divya.nair@company.com',
    phone: '+91 98765 43219',
    department: 'Human Resources',
    designation: 'HR Executive',
    joiningDate: '2022-06-15',
    healthStatus: 'good',
    lastCheckup: '2025-11-10',
    insurancePlan: 'Standard Plan',
  },
];

// Risk monitor alert configuration
let corporateRiskAlertsConfig = {
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

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  corporateLogin
);

router.post(
  '/auth/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  corporateLogin
);

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

// Mock corporate plans data - replace with database queries in production
const corporatePlans = [
  {
    id: 'corp-plan-1',
    planName: 'Standard Health Plan',
    corporateName: 'Tech Corp India',
    validFrom: '2025-01-01',
    validTo: '2025-12-31',
    planType: 'Standard',
    benefits: [
      {
        category: 'OPD Coverage',
        description: 'General physician consultations',
        coverage: '₹5,000 per year',
        limit: '10 consultations'
      },
      {
        category: 'Diagnostics',
        description: 'Blood tests and X-rays',
        coverage: '₹3,000 per year',
        limit: '5 tests'
      }
    ],
    features: {
      opdCoverage: true,
      ipdCoverage: false,
      maternityCoverage: false,
      dentalCoverage: true,
      pharmacyCoverage: true,
      diagnosticsCoverage: true,
      homecareCoverage: false,
      ambulanceCoverage: true
    }
  },
  {
    id: 'corp-plan-2',
    planName: 'Premium Health Plan',
    corporateName: 'Global Solutions Ltd',
    validFrom: '2025-01-01',
    validTo: '2025-12-31',
    planType: 'Premium',
    benefits: [
      {
        category: 'OPD Coverage',
        description: 'Specialist consultations',
        coverage: '₹15,000 per year',
        limit: '20 consultations'
      },
      {
        category: 'IPD Coverage',
        description: 'Hospitalization coverage',
        coverage: '₹2,00,000 per year',
        limit: 'Up to 10 days'
      },
      {
        category: 'Maternity',
        description: 'Maternity and newborn care',
        coverage: '₹50,000 per year',
        limit: 'Normal delivery'
      }
    ],
    features: {
      opdCoverage: true,
      ipdCoverage: true,
      maternityCoverage: true,
      dentalCoverage: true,
      pharmacyCoverage: true,
      diagnosticsCoverage: true,
      homecareCoverage: true,
      ambulanceCoverage: true
    }
  }
];

const DEFAULT_PLAN_TEMPLATE = corporatePlans[0];
const corporateAppointmentsStore = new Map();

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
    validFrom: userPlan?.startDate || planData.validFrom || '2024-01-01',
    validTo: userPlan?.endDate || planData.validTo || '2024-12-31',
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
    opdLimit: benefitLimits.opdVisits || benefitLimits.opdLimit || 10,
    diagnosticsUsed: usage.diagnostics || usage.diagnosticsUsed || 0,
    diagnosticsLimit: benefitLimits.diagnostics || benefitLimits.diagnosticsLimit || 5,
    amountUsed: usage.benefitINR?.total || usage.amountUsed || 0,
    amountLimit: benefitLimits.totalBenefitINR || benefitLimits.amountLimit || 8000
  };
}

function getUserAppointments(userId) {
  return corporateAppointmentsStore.get(userId) || [];
}

function addUserAppointment(userId, appointment) {
  const existing = corporateAppointmentsStore.get(userId) || [];
  corporateAppointmentsStore.set(userId, [appointment, ...existing].slice(0, 25));
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

function tagBenefitCategory(b) {
  return ['ipd', 'maternity'].includes(String(b.category || b.name || '').toLowerCase()) ? 'insurance' : 'wellness';
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

router.get('/my-benefits', authUser, async (req, res) => {
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
      benefits: (planRecord?.benefits || planRecord?.metadata?.benefits || []).map((b) => ({
        ...b,
        benefitCategory: tagBenefitCategory(b),
      })),
      features: planRecord?.features || {},
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

// Real checkup availability comes from the corporate's actual subscription
// plan (a "Wellness"/health-checkup benefit line item, e.g. "Annual Health
// Checkup, Once per year"), not a fabricated multi-tier package catalog --
// no such catalog exists anywhere in the platform's real data. Employee
// enrollment/validity comes from user_health_packages when present.
router.get('/health-checkups', authUser, async (req, res) => {
  try {
    const isCorporateSession = req.user?.role === 'corporate' || req.user?.userType === 'corporate';
    let corporateId = req.user?.corporateId || req.user?.organization_id;
    let enrollment = null;

    if (!isCorporateSession) {
      const [assoc] = await postgresSequelize.query(
        `SELECT "entityId" AS "corporateId" FROM user_associations
          WHERE "userId" = :userId AND "entityType" = 'corporate' AND status = 'active'
          ORDER BY "createdAt" DESC LIMIT 1`,
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

    if (!corporateId) {
      return res.json({ success: true, linkedPlan: false, checkups: [], data: { checkups: [] } });
    }

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

    if (!checkupBenefit) {
      return res.json({ success: true, linkedPlan: Boolean(planRows[0]), checkups: [], data: { checkups: [] } });
    }

    const checkups = [{
      id: 'plan-annual-checkup',
      name: checkupBenefit.name || 'Annual Health Checkup',
      description: checkupBenefit.description || 'Included as part of your corporate health plan.',
      limit: checkupBenefit.limit || null,
      validFrom: enrollment?.validFrom ? new Date(enrollment.validFrom).toISOString().slice(0, 10) : null,
      validTo: enrollment?.validTo ? new Date(enrollment.validTo).toISOString().slice(0, 10) : null,
    }];

    res.json({
      success: true,
      linkedPlan: true,
      checkups,
      data: { checkups }
    });
  } catch (error) {
    console.error('Error fetching corporate health checkups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health checkups',
      error: error.message
    });
  }
});

router.get('/my-appointments', authUser, async (req, res) => {
  try {
    const appointments = getUserAppointments(req.user.id);
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

router.post('/book-checkup', authUser, async (req, res) => {
  try {
    const { checkupId, preferredDate, preferredTime, location, hospital, specialInstructions } = req.body || {};
    
    // Validate required fields
    if (!checkupId || !preferredDate || !preferredTime || !location) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        details: {
          checkupId: !checkupId ? 'required' : 'provided',
          preferredDate: !preferredDate ? 'required' : 'provided',
          preferredTime: !preferredTime ? 'required' : 'provided',
          location: !location ? 'required' : 'provided'
        }
      });
    }

    // Validate user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    let activePlan = null;
    
    // Only try to fetch active plan for numeric user IDs in production
    if (Number.isInteger(parseInt(req.user.id))) {
      try {
        activePlan = await getActiveUserPlan(req.user.id);
      } catch (error) {
        console.log(`Note: Could not fetch active plan for user ${req.user.id}:`, error.message);
        // Continue - corporate users might not have database records in dev/testing
      }
    }
    
    // For corporate users in development, we may not have a database record, so allow booking without an active plan
    if (!activePlan && process.env.NODE_ENV === 'production') {
      return res.status(400).json({
        success: false,
        message: 'No active corporate plan found for user',
        userId: req.user.id
      });
    }

    const appointment = {
      id: `CHK-${Date.now()}`,
      appointmentId: `CHK-${Math.floor(Math.random() * 1e6)}`,
      userId: req.user.id,
      checkupId,
      checkupName: `Health Checkup ${checkupId}`,
      appointmentType: 'Annual Health Checkup',
      date: preferredDate,
      time: preferredTime,
      hospital: hospital || 'Network Hospital',
      location,
      doctor: 'Corporate Wellness Team',
      status: 'scheduled',
      bookedOn: new Date().toISOString().split('T')[0],
      specialInstructions: specialInstructions || null,
      claimAmount: 0
    };

    addUserAppointment(req.user.id, appointment);

    res.status(201).json({
      success: true,
      message: 'Health checkup booked successfully',
      appointment,
      data: { appointment }
    });
  } catch (error) {
    console.error('Error booking corporate checkup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book health checkup',
      error: error.message
    });
  }
});

// Get all available corporate plans (public - for browsing)
router.get('/plans', async (req, res) => {
  try {
    const plans = await MembershipPlan.findAll({
      where: { isActive: true }
    });
    const payload = plans.length
      ? plans.map(plan => normalizePlanPayload(plan.toJSON(), null, {}))
      : corporatePlans;
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
router.get('/plans/:planId', authUser, async (req, res) => {
  try {
    const { planId } = req.params;
    let plan = await MembershipPlan.findOne({ where: { id: planId } });
    if (plan) {
      plan = normalizePlanPayload(plan.toJSON(), null, req.user);
    } else {
      plan = corporatePlans.find(p => p.id === planId);
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

// Enroll in a corporate plan
router.post('/enroll', authUser, async (req, res) => {
  try {
    const { planId, corporateCode } = req.body;
    const userId = req.user.id;

    if (!planId || !corporateCode) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and corporate code are required'
      });
    }

    // In production, validate corporate code and create enrollment
    res.json({
      success: true,
      message: 'Successfully enrolled in corporate plan',
      data: {
        enrollmentId: `ENR-${Date.now()}`,
        planId,
        enrolledAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error enrolling in plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll in plan',
      error: error.message
    });
  }
});

// Get claims history
router.get('/claims', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Mock claims data
    const claims = [
      {
        id: 'CLM-001',
        date: '2025-11-20',
        type: 'OPD Consultation',
        amount: 1500,
        status: 'Approved',
        approvedAmount: 1500,
        doctor: 'Dr. Sarah Johnson',
        specialization: 'General Physician'
      },
      {
        id: 'CLM-002',
        date: '2025-11-15',
        type: 'Diagnostic Test',
        amount: 1000,
        status: 'Pending',
        approvedAmount: null,
        testName: 'Complete Blood Count'
      }
    ];

    res.json({
      success: true,
      data: claims
    });
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
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
           u."firstName",
           u."lastName",
           u.email,
           u."phoneNumber"
         FROM corporate_employees ce
         LEFT JOIN users u ON u.id = ce."userId"
         WHERE ce.corporate_id = :corporateId AND ce."isActive" = true
         ORDER BY ce."createdAt" DESC`,
        { replacements: { corporateId } }
      );
      employees = rows.map((r) => ({
        id: r.employeeId,
        employeeId: r.employeeId,
        name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || r.employeeId,
        email: r.email || '',
        phone: r.phoneNumber || '',
        businessUnit: r.business_unit || '',
        department: r.department || 'General',
        designation: r.designation || '',
        joiningDate: r.joiningDate ? r.joiningDate.toString().slice(0, 10) : '',
        healthStatus: 'good',
        lastCheckup: '',
        insurancePlan: 'Standard Plan',
      }));
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
          };
        });
      } catch (uaErr) {
        console.error('[corporate] GET /employees user_associations fallback error:', uaErr.message);
      }
    }
  }

  // Only fall back to demo data when there is no real corporate context
  if (employees.length === 0 && !corporateId) {
    employees = [...corporateEmployees];
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
         LEFT JOIN ai_health_risk_scores hrs ON hrs.patient_id = u.id
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

  const { employeeId, name, businessUnit, department, designation, joiningDate } = req.body || {};

  if (!name || !employeeId) {
    return res.status(400).json({ success: false, message: 'name and employeeId are required' });
  }

  try {
    const normalizedEmployeeId = String(employeeId).trim();
    const [firstName, ...lastNameParts] = String(name).trim().split(/\s+/);
    const metadata = JSON.stringify({
      firstName,
      lastName: lastNameParts.join(' '),
      profileActivation: 'inactive',
      activatedAt: null,
    });

    await postgresSequelize.query(
      `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", business_unit, department, designation, "joiningDate", metadata, "isActive", "createdAt", "updatedAt")
       VALUES (:corporateId, NULL, :employeeId, :businessUnit, :department, :designation, :joiningDate, CAST(:metadata AS JSONB), true, NOW(), NOW())
       ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET
         business_unit=:businessUnit,
         department=:department,
         designation=:designation,
         "joiningDate"=:joiningDate,
         metadata=CASE
           WHEN corporate_employees."userId" IS NOT NULL
             THEN COALESCE(corporate_employees.metadata, '{}'::jsonb)
                  || jsonb_build_object('profileActivation', 'active')
           ELSE CAST(:metadata AS JSONB)
         END,
         "isActive"=true,
         "updatedAt"=NOW()`,
      { replacements: { corporateId, employeeId: normalizedEmployeeId, businessUnit: businessUnit || null, department: department || null, designation: designation || '', joiningDate: joiningDate || null, metadata } }
    );

    const created = { id: normalizedEmployeeId, employeeId: normalizedEmployeeId, name, email: '', phone: '', businessUnit: businessUnit || '', department: department || '', designation: designation || '', joiningDate: joiningDate || '', healthStatus: 'good', lastCheckup: '', insurancePlan: 'Standard Plan' };
    return res.status(201).json({ success: true, data: { employee: created } });
  } catch (err) {
    console.error('[corporate] POST /employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
});

router.put('/employees/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const { businessUnit, department, designation, joiningDate } = req.body || {};

  try {
    const [rows] = await postgresSequelize.query(
      `UPDATE corporate_employees SET business_unit=COALESCE(:businessUnit, business_unit), department=COALESCE(:department, department), designation=COALESCE(:designation, designation), "joiningDate"=COALESCE(:joiningDate, "joiningDate"), "updatedAt"=NOW()
       WHERE corporate_id=:corporateId AND "employeeId"=:id RETURNING *`,
      { replacements: { corporateId, id, businessUnit: businessUnit || null, department: department || null, designation: designation || null, joiningDate: joiningDate || null } }
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, data: { employee: { ...rows[0], businessUnit: rows[0].business_unit || businessUnit || '', ...(req.body || {}) } } });
  } catch (err) {
    console.error('[corporate] PUT /employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
});

router.delete('/employees/:id', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;

  try {
    const [rows] = await postgresSequelize.query(
      `UPDATE corporate_employees SET "isActive"=false, "updatedAt"=NOW() WHERE corporate_id=:corporateId AND "employeeId"=:id RETURNING id`,
      { replacements: { corporateId, id } }
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true });
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
      errors.push({ row: index + 1, employee: emp, error: 'Missing required fields: name and employeeId are required' });
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

      // Upsert corporate_employees record
      await postgresSequelize.query(
        `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", business_unit, department, designation, "joiningDate", metadata, "isActive", "createdAt", "updatedAt")
         VALUES (:corporateId, NULL, :employeeId, :businessUnit, :department, :designation, :joiningDate, CAST(:metadata AS JSONB), true, NOW(), NOW())
         ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET
           business_unit=:businessUnit,
           department=:department,
           designation=:designation,
           "joiningDate"=:joiningDate,
           metadata=CASE
             WHEN corporate_employees."userId" IS NOT NULL
               THEN COALESCE(corporate_employees.metadata, '{}'::jsonb)
                    || jsonb_build_object('profileActivation', 'active')
             ELSE CAST(:metadata AS JSONB)
           END,
           "isActive"=true,
           "updatedAt"=NOW()`,
        { replacements: { corporateId, employeeId: generatedEmployeeId, businessUnit: emp.businessUnit || emp.business_unit || null, department: emp.department || null, designation: emp.designation || '', joiningDate: emp.joiningDate || null, metadata } }
      );

      successfulUploads.push({ employeeId: generatedEmployeeId, name: emp.name });
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
  const csvHeader = 'employeeId,name,businessUnit,department,designation,joiningDate\n';
  const csvSample = 'EMP001,John Doe,Technology BU,Engineering,Software Engineer,2024-01-15\n';
  const csvTemplate = csvHeader + csvSample;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_template.csv"');
  res.send(csvTemplate);
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
    format: r.format,
    size: '—',
    status: r.status,
  };
}

router.get('/reports', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.json({ success: true, data: { reports: [] } });
  const [rows] = await postgresSequelize.query(
    `SELECT id, title, category, period, format, status, created_at
       FROM corporate_generated_reports WHERE corporate_id = :corporateId
      ORDER BY created_at DESC`,
    { replacements: { corporateId } }
  );
  return res.json({ success: true, data: { reports: rows.map(reportRowShape) } });
});

router.post('/reports/generate', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  if (!corporateId) return res.status(403).json({ success: false, message: 'No corporate context' });
  const { type, period, format } = req.body || {};
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

router.get('/reports/:id/preview', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `SELECT id, title, category, period, format, status, created_at
       FROM corporate_generated_reports WHERE id = :id AND corporate_id = :corporateId`,
    { replacements: { id, corporateId } }
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Report not found' });
  return res.json({ success: true, data: { report: reportRowShape(rows[0]) } });
});

router.get('/reports/:id/download', authCorporate, async (req, res) => {
  const corporateId = req.user?.corporateId || req.user?.organization_id;
  const { id } = req.params;
  const [rows] = await postgresSequelize.query(
    `SELECT id, title, category, period, format, status, created_at
       FROM corporate_generated_reports WHERE id = :id AND corporate_id = :corporateId`,
    { replacements: { id, corporateId } }
  );
  const report = rows[0];
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

  // Pull real underlying data for the report's category rather than just echoing metadata.
  let csv;
  const category = String(report.category || '').toLowerCase();
  if (category.includes('claim')) {
    const [claimRows] = await postgresSequelize.query(
      `SELECT ic.claim_number, ic.claim_type, ic.claim_amount, ic.status, ic.submitted_date
         FROM insurance_claims ic
         JOIN user_associations ua ON ua."userId" = ic.patient_id
        WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
        ORDER BY ic.submitted_date DESC`,
      { replacements: { corporateId } }
    );
    csv = toCsv(claimRows, ['claim_number', 'claim_type', 'claim_amount', 'status', 'submitted_date']);
  } else if (category.includes('risk') || category.includes('health')) {
    const [riskRows] = await postgresSequelize.query(
      `SELECT u."firstName", u."lastName", r.risk_level, r.overall_score, r.created_at
         FROM ai_health_risk_scores r
         JOIN user_associations ua ON ua."userId" = r.patient_id
         JOIN users u ON u.id = r.patient_id
        WHERE ua."entityId" = :corporateId AND ua."entityType" = 'corporate'
        ORDER BY r.created_at DESC`,
      { replacements: { corporateId } }
    );
    csv = toCsv(riskRows, ['firstName', 'lastName', 'risk_level', 'overall_score', 'created_at']);
  } else {
    const [empRows] = await postgresSequelize.query(
      `SELECT ce."employeeId", ce.department, ce.designation, u."firstName", u."lastName", u.email
         FROM corporate_employees ce LEFT JOIN users u ON u.id = ce."userId"
        WHERE ce.corporate_id = :corporateId AND ce."isActive" = true`,
      { replacements: { corporateId } }
    );
    csv = toCsv(empRows, ['employeeId', 'department', 'designation', 'firstName', 'lastName', 'email']);
  }

  const format = String(req.query.format || report.format || 'csv').toLowerCase();
  const ext = format === 'excel' ? 'csv' : format === 'pdf' ? 'pdf' : 'csv';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=RPT${report.id}.${ext}`);
  return res.status(200).send(csv);
});

// ---------------------------------------------------------------------------
// Corporate portal: Risk monitor alert configuration
// ---------------------------------------------------------------------------

router.get('/risk-monitor/alerts', authCorporate, async (req, res) => {
  return res.json({ success: true, data: { config: corporateRiskAlertsConfig } });
});

router.put('/risk-monitor/alerts', authCorporate, async (req, res) => {
  corporateRiskAlertsConfig = { ...corporateRiskAlertsConfig, ...(req.body || {}) };
  return res.json({ success: true, data: { config: corporateRiskAlertsConfig } });
});

router.get('/risk-monitor/export', authCorporate, async (req, res) => {
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
       ORDER BY ce."createdAt" DESC`,
      { replacements: { corporateId } }
    );
    rows = dbRows;
  }
  const csv = toCsv(rows, ['employeeId', 'name', 'department', 'healthStatus', 'lastCheckup']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=risk-monitor.csv');
  return res.status(200).send(csv);
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
         COALESCE(jsonb_array_length(ic.documents), 0) AS documents
    FROM insurance_claims ic
    JOIN user_associations ua ON ua."userId" = ic.patient_id AND ua."entityType" = 'corporate'
    LEFT JOIN users u ON u.id = ic.patient_id
    LEFT JOIN corporate_employees ce ON ce."userId" = ic.patient_id AND ce.corporate_id = ua."entityId"
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

router.put('/claims/management/:id', authCorporate, async (req, res) => {
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
router.get('/network-providers', authUser, async (req, res) => {
  try {
    const { city, type } = req.query;
    
    // Mock network providers
    const providers = [
      {
        id: 'PRV-001',
        name: 'Apollo Hospital',
        type: 'Hospital',
        city: 'Bangalore',
        address: 'Jayanagar, Bangalore',
        phone: '080-12345678',
        specialties: ['Cardiology', 'Orthopedics', 'General Surgery']
      },
      {
        id: 'PRV-002',
        name: 'Manipal Hospital',
        type: 'Hospital',
        city: 'Bangalore',
        address: 'HAL Airport Road, Bangalore',
        phone: '080-87654321',
        specialties: ['Neurology', 'Oncology', 'Pediatrics']
      }
    ];

    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('Error fetching network providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch network providers',
      error: error.message
    });
  }
});

// ---------------------------------------------------------------------------
// Wellness Calendar Endpoints
// ---------------------------------------------------------------------------

// In-memory store for wellness activities
let wellnessActivities = [];

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
const generateWellnessActivities = () => {
  const currentYear = new Date().getFullYear();
  const sampleActivities = [
    { title: 'New Year Health Goals Workshop', type: 'workshop', month: 0, day: 5 },
    { title: 'BMI & Body Composition Check', type: 'screening', month: 0, day: 15 },
    { title: 'Cardiac Health Awareness Talk', type: 'talk', month: 1, day: 8 },
    { title: 'Heart Health Screening Camp', type: 'health-camp', month: 1, day: 14 },
    { title: 'CPR & First Aid Demo', type: 'demonstration', month: 1, day: 20 },
    { title: 'Healthy Cooking Webinar', type: 'webinar', month: 2, day: 10 },
    { title: 'Nutrition Counseling Sessions', type: 'talk', month: 2, day: 18 },
    { title: 'Calorie Counting Challenge', type: 'challenge', month: 2, day: 1 },
    { title: 'Stress Management Workshop', type: 'workshop', month: 3, day: 7 },
    { title: 'Meditation & Mindfulness Session', type: 'demonstration', month: 3, day: 15 },
    { title: 'Office Fitness Challenge', type: 'challenge', month: 4, day: 1 },
    { title: 'Yoga & Stretching Demo', type: 'demonstration', month: 4, day: 12 },
    { title: 'Eye Checkup Camp', type: 'health-camp', month: 5, day: 10 },
    { title: 'Hydration Challenge', type: 'challenge', month: 6, day: 1 },
    { title: 'Annual Health Checkup Camp', type: 'health-camp', month: 7, day: 5 },
    { title: 'Diabetes Risk Assessment', type: 'screening', month: 8, day: 10 },
    { title: 'Breast Cancer Awareness Session', type: 'talk', month: 9, day: 8 },
    { title: 'Prostate Health Screening', type: 'screening', month: 10, day: 10 },
    { title: 'Sleep Hygiene Webinar', type: 'webinar', month: 11, day: 5 },
  ];

  return sampleActivities.map((act, index) => {
    const theme = WELLNESS_THEMES[act.month];
    return {
      id: `act-${index + 1}`,
      title: act.title,
      description: `Join us for ${act.title.toLowerCase()} as part of our ${theme.name} initiative.`,
      type: act.type,
      date: `${currentYear}-${String(act.month + 1).padStart(2, '0')}-${String(act.day).padStart(2, '0')}`,
      startTime: '10:00',
      endTime: '12:00',
      location: act.type === 'webinar' ? 'Online (Zoom)' : 'Conference Room A',
      speaker: ['Dr. Priya Sharma', 'Dr. Rajesh Kumar', 'Wellness Coach Anita', 'Dr. Vikram Singh'][index % 4],
      capacity: act.type === 'webinar' ? 500 : act.type === 'health-camp' ? 200 : 50,
      registered: Math.floor(Math.random() * 40) + 10,
      status: new Date(`${currentYear}-${String(act.month + 1).padStart(2, '0')}-${String(act.day).padStart(2, '0')}`) < new Date() ? 'completed' : 'scheduled',
      theme: theme.name,
      participantSelection: 'all',
      invitesSent: index < 10,
      totalInvited: index < 10 ? 200 : 0,
      reminders: { enabled: true, fifteenDays: true, threeDays: true, oneDayBefore: true }
    };
  });
};

// Initialize wellness activities
if (wellnessActivities.length === 0) {
  wellnessActivities = generateWellnessActivities();
}

// Base wellness-calendar route — redirect to activities summary so the aggregator
// router's /:id catch-all doesn't intercept it and crash with a type-cast error.
router.get('/wellness-calendar', authCorporate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        activities: wellnessActivities,
        themes: WELLNESS_THEMES,
        total: wellnessActivities.length
      }
    });
  } catch (error) {
    console.error('Error fetching wellness calendar:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wellness calendar' });
  }
});

// Get wellness calendar activities
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
              status, color
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
    const { title, description, type, date, startTime, endTime, location, speaker, capacity, theme } = req.body;

    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'title and date are required' });
    }

    const themeName = theme || WELLNESS_THEMES[new Date(date).getMonth()]?.name || null;

    const [rows] = await postgresSequelize.query(
      `INSERT INTO corporate_wellness_events
         (corporate_id, title, description, event_type, event_date, event_time, end_time,
          location, organizer, max_participants, status, color)
       VALUES (:corporateId, :title, :description, :type, :date, :startTime, :endTime,
               :location, :speaker, :capacity, 'upcoming', 'teal')
       RETURNING id, title, description, event_type AS type,
                 TO_CHAR(event_date, 'YYYY-MM-DD') AS date,
                 TO_CHAR(event_time, 'HH24:MI') AS "startTime",
                 TO_CHAR(end_time, 'HH24:MI') AS "endTime",
                 location, organizer AS speaker, max_participants AS capacity,
                 registered_count AS registered, status, color`,
      {
        replacements: {
          corporateId, title: title.trim(), description: description || null,
          type: type || 'talk', date, startTime: startTime || null, endTime: endTime || null,
          location: location || null, speaker: speaker || null,
          capacity: capacity ? parseInt(capacity, 10) : 50,
        },
        type: postgresSequelize.QueryTypes.INSERT
      }
    );
    const newActivity = { ...(Array.isArray(rows) ? rows[0] : rows), theme: themeName, invitesSent: false, totalInvited: 0 };

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
    const eventId = parseInt(req.params.id, 10);
    if (!eventId) return res.status(400).json({ success: false, message: 'Invalid activity ID' });

    const { participantSelection, participantIds } = req.body;
    const totalInvited = Array.isArray(participantIds) ? participantIds.length : (req.body.totalParticipants || 0);

    const updated = await postgresSequelize.query(
      `UPDATE corporate_wellness_events SET
         invites_sent = TRUE,
         invites_sent_at = NOW(),
         notify_employees = TRUE,
         participant_selection = :participantSelection,
         total_invited = :totalInvited,
         updated_at = NOW()
       WHERE id = :eventId AND corporate_id = :corporateId
       RETURNING id`,
      {
        replacements: { eventId, corporateId, participantSelection: participantSelection || 'all', totalInvited },
        type: postgresSequelize.QueryTypes.UPDATE
      }
    );
    if (!updated || !updated[0] || updated[0].length === 0) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }
    res.json({ success: true, message: `Invites sent to ${totalInvited} participants` });
  } catch (error) {
    console.error('Error sending invites:', error);
    res.status(500).json({ success: false, message: 'Failed to send invites', error: error.message });
  }
});

// Get employee events (for employee wellness calendar view) — real, per-corporate DB data
router.get('/wellness-calendar/employee/events', authUser, async (req, res) => {
  try {
    const [assoc] = await postgresSequelize.query(
      `SELECT "entityId" AS "corporateId" FROM user_associations
       WHERE "userId" = :userId AND "entityType" = 'corporate' AND role = 'employee' AND status = 'active'
       LIMIT 1`,
      { replacements: { userId: req.user?.id }, type: postgresSequelize.QueryTypes.SELECT }
    );

    if (!assoc) {
      return res.json({ success: true, data: { events: [], themes: WELLNESS_THEMES } });
    }

    const rows = await postgresSequelize.query(
      `SELECT id, title, description, event_type AS type,
              TO_CHAR(event_date, 'YYYY-MM-DD') AS date,
              TO_CHAR(event_time, 'HH24:MI') AS "startTime",
              TO_CHAR(end_time, 'HH24:MI') AS "endTime",
              location, organizer AS speaker, max_participants AS capacity,
              registered_count AS registered
       FROM corporate_wellness_events
       WHERE corporate_id = :corporateId
         AND status IN ('upcoming', 'ongoing')
         AND invites_sent = TRUE
       ORDER BY event_date ASC`,
      { replacements: { corporateId: assoc.corporateId }, type: postgresSequelize.QueryTypes.SELECT }
    );

    const employeeEvents = rows.map(r => ({ ...r, isRegistered: false }));

    res.json({ success: true, data: { events: employeeEvents, themes: WELLNESS_THEMES } });
  } catch (error) {
    console.error('Error fetching employee wellness events:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wellness events', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Settings Routes
// ---------------------------------------------------------------------------
let corporateSettings = {
  general: {
    companyName: 'Acme Corporation',
    industry: 'Technology',
    timezone: 'Asia/Kolkata',
    language: 'en'
  },
  notifications: {
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    weeklyDigest: true
  },
  security: {
    twoFactorEnabled: false,
    sessionTimeout: 30,
    ipWhitelist: []
  },
  healthProgram: {
    trackSteps: true,
    trackSleep: true,
    trackNutrition: true,
    trackMentalHealth: true,
    alertThreshold: 70
  }
};

router.get('/settings', authCorporate, async (req, res) => {
  res.json({ success: true, data: { settings: corporateSettings } });
});

router.put('/settings', authCorporate, async (req, res) => {
  try {
    const updates = req.body;
    corporateSettings = { ...corporateSettings, ...updates };
    res.json({ success: true, message: 'Settings saved successfully', data: { settings: corporateSettings } });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ success: false, message: 'Failed to save settings', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Appointments Routes (for schedule appointment)
// ---------------------------------------------------------------------------
let corporateAppointments = [];

router.post('/appointments', authCorporate, async (req, res) => {
  try {
    const { employeeId, employeeName, department, appointmentType, doctorName, facility, date, time, notes } = req.body;
    
    if (!employeeId || !appointmentType || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Employee, appointment type, date, and time are required'
      });
    }

    const newAppointment = {
      id: `APT${Date.now()}`,
      employeeId,
      employeeName: employeeName || 'Unknown Employee',
      department: department || 'General',
      appointmentType,
      doctorName: doctorName || 'TBD',
      facility: facility || 'Main Medical Center',
      date,
      time,
      status: 'scheduled',
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    corporateAppointments.push(newAppointment);

    res.status(201).json({
      success: true,
      message: 'Appointment scheduled successfully',
      data: { appointment: newAppointment }
    });
  } catch (error) {
    console.error('Error scheduling appointment:', error);
    res.status(500).json({ success: false, message: 'Failed to schedule appointment', error: error.message });
  }
});

router.get('/appointments', authCorporate, getCorporateAppointments);

// ---------------------------------------------------------------------------
// Challenges Routes (for gamification)
// ---------------------------------------------------------------------------
let corporateChallenges = [];

router.get('/challenges', authCorporate, async (req, res) => {
  res.json({ success: true, data: { challenges: corporateChallenges } });
});

router.post('/challenges', authCorporate, async (req, res) => {
  try {
    const { title, description, type, target, unit, startDate, endDate, rewards } = req.body;

    if (!title || !type || !target || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Title, type, target, start date, and end date are required'
      });
    }

    const newChallenge = {
      id: `CHL${Date.now()}`,
      title,
      description: description || '',
      type,
      target,
      unit: unit || 'points',
      startDate,
      endDate,
      status: 'draft',
      participants: 0,
      totalEmployees: corporateEmployees.length,
      rewards: rewards || { gold: 'TBD', silver: 'TBD', bronze: 'TBD' },
      createdAt: new Date().toISOString()
    };

    corporateChallenges.push(newChallenge);

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: { challenge: newChallenge }
    });
  } catch (error) {
    console.error('Error creating challenge:', error);
    res.status(500).json({ success: false, message: 'Failed to create challenge', error: error.message });
  }
});

router.put('/challenges/:id', authCorporate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const index = corporateChallenges.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    corporateChallenges[index] = { ...corporateChallenges[index], ...updates };
    res.json({ success: true, data: { challenge: corporateChallenges[index] } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update challenge', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Benefits & Health Checkup Booking Routes
// ---------------------------------------------------------------------------
let healthCheckupBookings = [];

router.post('/benefits/book-checkup', authUser, async (req, res) => {
  try {
    const { checkupType, preferredDate, preferredTime, location, notes } = req.body;
    const userId = req.user.id;

    if (!checkupType || !preferredDate) {
      return res.status(400).json({
        success: false,
        message: 'Checkup type and preferred date are required'
      });
    }

    const booking = {
      id: `BK${Date.now()}`,
      userId,
      checkupType,
      preferredDate,
      preferredTime: preferredTime || '10:00 AM',
      location: location || 'Main Medical Center',
      notes: notes || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    healthCheckupBookings.push(booking);

    res.status(201).json({
      success: true,
      message: 'Health checkup booked successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Error booking health checkup:', error);
    res.status(500).json({ success: false, message: 'Failed to book health checkup', error: error.message });
  }
});

router.get('/benefits/bookings', authUser, async (req, res) => {
  const userId = req.user.id;
  const userBookings = healthCheckupBookings.filter(b => b.userId === userId);
  res.json({ success: true, data: { bookings: userBookings } });
});

// ---------------------------------------------------------------------------
// Employee Details Route
// ---------------------------------------------------------------------------
router.get('/employees/:id', authCorporate, async (req, res) => {
  try {
    const { id } = req.params;
    const employee = corporateEmployees.find(e => e.id === id || e.employeeId === id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, data: { employee } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch employee', error: error.message });
  }
});

export default router;
