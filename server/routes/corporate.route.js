import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
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

const router = express.Router();

// ---------------------------------------------------------------------------
// NOTE: Corporate portal feature endpoints below are implemented with an
// in-memory store so the UI can be functional end-to-end in dev/demo.
// Replace with database-backed services in production.
// ---------------------------------------------------------------------------

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

// Departments
let corporateDepartments = [
  {
    id: 'DEPT001',
    name: 'Engineering',
    manager: 'Sarah Johnson',
    employeeCount: 85,
    healthScore: 76,
    checkupCompletion: 82,
    budget: '$125,000',
    location: 'Building A, Floor 3',
    description: 'Software development and technical infrastructure team',
  },
  {
    id: 'DEPT002',
    name: 'Marketing',
    manager: 'Michael Brown',
    employeeCount: 42,
    healthScore: 81,
    checkupCompletion: 90,
    budget: '$75,000',
    location: 'Building B, Floor 2',
    description: 'Brand management, digital marketing, and communications',
  },
  {
    id: 'DEPT003',
    name: 'Sales',
    manager: 'Emily Davis',
    employeeCount: 58,
    healthScore: 73,
    checkupCompletion: 75,
    budget: '$95,000',
    location: 'Building A, Floor 2',
    description: 'Client acquisition and revenue generation',
  },
  {
    id: 'DEPT004',
    name: 'Finance',
    manager: 'Robert Wilson',
    employeeCount: 35,
    healthScore: 79,
    checkupCompletion: 88,
    budget: '$85,000',
    location: 'Building C, Floor 4',
    description: 'Financial planning, accounting, and analysis',
  },
  {
    id: 'DEPT005',
    name: 'Human Resources',
    manager: 'Lisa Anderson',
    employeeCount: 28,
    healthScore: 84,
    checkupCompletion: 95,
    budget: '$65,000',
    location: 'Building B, Floor 1',
    description: 'Talent acquisition, employee relations, and benefits',
  },
  {
    id: 'DEPT006',
    name: 'Operations',
    manager: 'David Martinez',
    employeeCount: 30,
    healthScore: 74,
    checkupCompletion: 80,
    budget: '$70,000',
    location: 'Building C, Floor 1',
    description: 'Business operations and logistics management',
  },
];

// Notifications
let corporateNotifications = [
  {
    id: 'NOTIF-001',
    type: 'health_alert',
    title: 'High risk cases detected',
    message: '3 employees moved to high/critical risk this week.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    read: false,
    priority: 'high',
  },
  {
    id: 'NOTIF-002',
    type: 'claim_status',
    title: 'Claims processed',
    message: '2 claims approved, 1 requires more documents.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    read: true,
    priority: 'medium',
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

// Claims (corporate portal / management)
let corporateClaims = [
  {
    id: 'CLM2024001',
    employeeName: 'John Smith',
    employeeId: 'EMP001',
    claimType: 'Medical Consultation',
    amount: '$350.00',
    submittedDate: '2024-01-15',
    status: 'approved',
    provider: 'City Medical Center',
    serviceDate: '2024-01-10',
    description: 'Annual health checkup and blood work',
    documents: 3,
  },
  {
    id: 'CLM2024002',
    employeeName: 'Emily Davis',
    employeeId: 'EMP002',
    claimType: 'Dental Care',
    amount: '$450.00',
    submittedDate: '2024-01-14',
    status: 'processing',
    provider: 'Dental Care Plus',
    serviceDate: '2024-01-12',
    description: 'Root canal treatment and crown',
    documents: 2,
  },
  {
    id: 'CLM2024003',
    employeeName: 'Robert Wilson',
    employeeId: 'EMP003',
    claimType: 'Prescription Medication',
    amount: '$120.00',
    submittedDate: '2024-01-13',
    status: 'paid',
    provider: 'HealthPlus Pharmacy',
    serviceDate: '2024-01-11',
    description: 'Prescribed medication for chronic condition',
    documents: 1,
  },
  {
    id: 'CLM2024004',
    employeeName: 'Maria Garcia',
    employeeId: 'EMP004',
    claimType: 'Mental Health',
    amount: '$200.00',
    submittedDate: '2024-01-12',
    status: 'pending',
    provider: 'Wellness Counseling Center',
    serviceDate: '2024-01-09',
    description: 'Therapy sessions (3 sessions)',
    documents: 4,
  },
  {
    id: 'CLM2024005',
    employeeName: 'David Lee',
    employeeId: 'EMP005',
    claimType: 'Vision Care',
    amount: '$280.00',
    submittedDate: '2024-01-11',
    status: 'rejected',
    provider: 'Vision Care Clinic',
    serviceDate: '2024-01-08',
    description: 'Eye examination and prescription glasses',
    documents: 2,
  },
  {
    id: 'CLM2024006',
    employeeName: 'Sarah Johnson',
    employeeId: 'EMP006',
    claimType: 'Laboratory Tests',
    amount: '$175.00',
    submittedDate: '2024-01-10',
    status: 'approved',
    provider: 'Diagnostic Lab Services',
    serviceDate: '2024-01-07',
    description: 'Blood tests and diagnostic imaging',
    documents: 3,
  },
];

// Complaints
let corporateComplaints = [
  {
    id: 'CMP2024001',
    employeeName: 'John Smith',
    employeeId: 'EMP001',
    category: 'Insurance Coverage',
    subject: 'Claim processing delay',
    description: 'My insurance claim for dental work has been pending for over 30 days without any update.',
    priority: 'high',
    status: 'in-progress',
    submittedDate: '2024-01-10',
    assignedTo: 'Sarah Johnson',
    lastUpdate: '2024-01-15',
  },
];

// Reports
let corporateReports = [
  {
    id: 'RPT001',
    title: 'Monthly Health Metrics Report',
    description: 'Comprehensive overview of employee health metrics for January 2024',
    category: 'Health Metrics',
    generatedDate: '2024-01-31',
    period: 'January 2024',
    format: 'PDF',
    size: '2.4 MB',
    status: 'ready',
  },
  {
    id: 'RPT002',
    title: 'Claims Analysis Report',
    description: 'Detailed analysis of insurance claims submitted and processed',
    category: 'Claims',
    generatedDate: '2024-01-30',
    period: 'Q4 2023',
    format: 'Excel',
    size: '1.8 MB',
    status: 'ready',
  },
  {
    id: 'RPT004',
    title: 'Risk Assessment Summary',
    description: 'Summary of identified health risks and intervention outcomes',
    category: 'Risk Analysis',
    generatedDate: '2024-01-28',
    period: 'January 2024',
    format: 'PDF',
    size: '1.9 MB',
    status: 'ready',
  },
];

// Billing history
let corporateBillingHistory = [
  {
    id: 'INV-2024-001',
    date: '2024-01-01',
    period: 'Jan 2024',
    plan: 'Enterprise Plan',
    amount: 4999,
    currency: 'USD',
    status: 'paid',
  },
  {
    id: 'INV-2023-012',
    date: '2023-12-01',
    period: 'Dec 2023',
    plan: 'Enterprise Plan',
    amount: 4999,
    currency: 'USD',
    status: 'paid',
  },
];

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

router.get('/dashboard/summary', authUser, requireRole('corporate'), getCorporateSummary);
router.get('/dashboard/health-analytics', authUser, requireRole('corporate'), getCorporateHealthAnalytics);
router.get('/dashboard/employees-health', authUser, requireRole('corporate'), getCorporateEmployeesHealth);
router.get('/dashboard/appointments', authUser, requireRole('corporate'), getCorporateAppointments);

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

function deriveHealthCheckups(planRecord) {
  const packageData = planRecord?.healthCheckPackage || planRecord?.healthCheckPackages;
  if (packageData?.checkups && Array.isArray(packageData.checkups)) {
    return packageData.checkups;
  }
  return [
    {
      id: 'chk-basic',
      name: 'Basic Health Checkup',
      description: 'Essential screening covering CBC, lipid profile, and vitals',
      tests: ['CBC', 'Blood Sugar', 'Lipid Profile', 'Blood Pressure', 'BMI'],
      duration: '2 hours',
      fasting: true,
      price: 2000,
      discountedPrice: planRecord?.planType === 'elite' ? 0 : 500,
      category: 'Basic',
      ageGroup: '18-40 years',
      gender: 'All'
    },
    {
      id: 'chk-comprehensive',
      name: 'Comprehensive Health Checkup',
      description: 'Advanced tests with imaging for preventive diagnostics',
      tests: ['CBC', 'HbA1c', 'LFT', 'KFT', 'Vitamin D', 'Vitamin B12', 'ECG'],
      duration: '4 hours',
      fasting: true,
      price: 5000,
      discountedPrice: planRecord?.planType === 'elite' ? 0 : 1000,
      category: 'Comprehensive',
      ageGroup: '25-60 years',
      gender: 'All'
    }
  ];
}

function getUserAppointments(userId) {
  return corporateAppointmentsStore.get(userId) || [];
}

function addUserAppointment(userId, appointment) {
  const existing = corporateAppointmentsStore.get(userId) || [];
  corporateAppointmentsStore.set(userId, [appointment, ...existing].slice(0, 25));
}

// Get user's corporate benefits/plan
router.get('/my-benefits', authUser, async (req, res) => {
  try {
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
    
    const planPayload = normalizePlanPayload(activePlan?.plan?.toJSON(), activePlan?.toJSON(), req.user);
    const usage = buildUsageSnapshot(activePlan?.toJSON());

    res.json({
      success: true,
      linkedPlan: Boolean(activePlan),
      plan: planPayload,
      usage,
      data: {
        linkedPlan: Boolean(activePlan),
        plan: planPayload,
        usage
      }
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

router.get('/health-checkups', authUser, async (req, res) => {
  try {
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

    const planConfig = activePlan?.plan?.toJSON();
    const checkups = deriveHealthCheckups(planConfig);
    res.json({
      success: true,
      linkedPlan: Boolean(activePlan),
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

router.get('/notifications', authUser, requireRole('corporate'), async (req, res) => {
  return res.json({ success: true, data: { notifications: corporateNotifications } });
});

router.post('/notifications/:id/read', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  corporateNotifications = corporateNotifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  return res.json({ success: true });
});

router.post('/notifications/read-all', authUser, requireRole('corporate'), async (req, res) => {
  corporateNotifications = corporateNotifications.map((n) => ({ ...n, read: true }));
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Corporate portal: Employees
// ---------------------------------------------------------------------------

router.get('/employees', authUser, requireRole('corporate'), async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const department = String(req.query.department || '').trim();
  const corporateId = req.user?.corporateId;

  let employees = [];

  // Query real employees from DB if we have a corporate ID
  if (corporateId) {
    try {
      const [rows] = await postgresSequelize.query(
        `SELECT
           ce.id,
           ce."employeeId",
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

router.post('/employees', authUser, requireRole('corporate'), async (req, res) => {
  const corporateId = req.user?.corporateId;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  const { employeeId, name, email, phone, department, designation, joiningDate } = req.body || {};

  if (!name || !email || !department) {
    return res.status(400).json({ success: false, message: 'name, email, and department are required' });
  }

  try {
    const generatedEmployeeId = employeeId || `EMP${String(Date.now()).slice(-5)}`;

    // Create user record
    const bcrypt = (await import('bcrypt')).default;
    const tempPassword = await bcrypt.hash(`${generatedEmployeeId}@${corporateId}`, 10);
    const [userResult] = await postgresSequelize.query(
      `INSERT INTO users ("firstName", "lastName", email, "phoneNumber", password, role, organization_id, organization_type, status, "createdAt", "updatedAt")
       VALUES (:firstName, :lastName, :email, :phone, :password, 'user', :corporateId, 'corporate', 'active', NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET organization_id=:corporateId, organization_type='corporate', "updatedAt"=NOW()
       RETURNING id`,
      { replacements: { firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || '', email, phone: phone || '0000000000', password: tempPassword, corporateId } }
    );
    const userId = userResult[0]?.id;

    // Create corporate_employees record
    await postgresSequelize.query(
      `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", department, designation, "joiningDate", "isActive", "createdAt", "updatedAt")
       VALUES (:corporateId, :userId, :employeeId, :department, :designation, :joiningDate, true, NOW(), NOW())
       ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET department=:department, designation=:designation, "isActive"=true, "updatedAt"=NOW()`,
      { replacements: { corporateId, userId, employeeId: generatedEmployeeId, department, designation: designation || '', joiningDate: joiningDate || new Date().toISOString().slice(0, 10) } }
    );

    const created = { id: generatedEmployeeId, employeeId: generatedEmployeeId, name, email, phone: phone || '', department, designation: designation || '', joiningDate: joiningDate || new Date().toISOString().slice(0, 10), healthStatus: 'good', lastCheckup: '', insurancePlan: 'Standard Plan' };
    return res.status(201).json({ success: true, data: { employee: created } });
  } catch (err) {
    console.error('[corporate] POST /employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
});

router.put('/employees/:id', authUser, requireRole('corporate'), async (req, res) => {
  const corporateId = req.user?.corporateId;
  const { id } = req.params;
  const { department, designation, joiningDate } = req.body || {};

  try {
    const [rows] = await postgresSequelize.query(
      `UPDATE corporate_employees SET department=COALESCE(:department, department), designation=COALESCE(:designation, designation), "joiningDate"=COALESCE(:joiningDate, "joiningDate"), "updatedAt"=NOW()
       WHERE corporate_id=:corporateId AND "employeeId"=:id RETURNING *`,
      { replacements: { corporateId, id, department: department || null, designation: designation || null, joiningDate: joiningDate || null } }
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, data: { employee: { ...rows[0], ...(req.body || {}) } } });
  } catch (err) {
    console.error('[corporate] PUT /employees error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
});

router.delete('/employees/:id', authUser, requireRole('corporate'), async (req, res) => {
  const corporateId = req.user?.corporateId;
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
router.post('/employees/bulk-upload', authUser, requireRole('corporate'), async (req, res) => {
  const corporateId = req.user?.corporateId;
  if (!corporateId) return res.status(400).json({ success: false, message: 'Corporate ID missing from token' });

  const { employees: employeeList } = req.body;
  if (!Array.isArray(employeeList) || employeeList.length === 0) {
    return res.status(400).json({ success: false, message: 'employees array is required and must not be empty' });
  }

  const successfulUploads = [];
  const errors = [];
  const bcrypt = (await import('bcrypt')).default;

  for (let index = 0; index < employeeList.length; index++) {
    const emp = employeeList[index];
    if (!emp.name || !emp.email || !emp.department) {
      errors.push({ row: index + 1, employee: emp, error: 'Missing required fields: name, email, and department are required' });
      continue;
    }

    try {
      const generatedEmployeeId = emp.employeeId || `EMP${String(Date.now() + index).slice(-5)}`;
      const tempPassword = await bcrypt.hash(`${generatedEmployeeId}@${corporateId}`, 10);

      // Upsert user record
      const [userResult] = await postgresSequelize.query(
        `INSERT INTO users ("firstName", "lastName", email, "phoneNumber", password, role, organization_id, organization_type, status, "createdAt", "updatedAt")
         VALUES (:firstName, :lastName, :email, :phone, :password, 'user', :corporateId, 'corporate', 'active', NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET organization_id=:corporateId, organization_type='corporate', "updatedAt"=NOW()
         RETURNING id`,
        { replacements: { firstName: emp.name.split(' ')[0], lastName: emp.name.split(' ').slice(1).join(' ') || '', email: emp.email, phone: emp.phone || '0000000000', password: tempPassword, corporateId } }
      );
      const userId = userResult[0]?.id;

      // Upsert corporate_employees record
      await postgresSequelize.query(
        `INSERT INTO corporate_employees (corporate_id, "userId", "employeeId", department, designation, "joiningDate", "isActive", "createdAt", "updatedAt")
         VALUES (:corporateId, :userId, :employeeId, :department, :designation, :joiningDate, true, NOW(), NOW())
         ON CONFLICT (corporate_id, "employeeId") DO UPDATE SET department=:department, designation=:designation, "isActive"=true, "updatedAt"=NOW()`,
        { replacements: { corporateId, userId, employeeId: generatedEmployeeId, department: emp.department, designation: emp.designation || '', joiningDate: emp.joiningDate || new Date().toISOString().slice(0, 10) } }
      );

      successfulUploads.push({ employeeId: generatedEmployeeId, name: emp.name, email: emp.email });
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
router.get('/employees/download-template', authUser, requireRole('corporate'), async (req, res) => {
  const csvHeader = 'employeeId,name,email,phone,department,designation,joiningDate,healthStatus,lastCheckup,insurancePlan\n';
  const csvSample = 'EMP001,John Doe,john.doe@company.com,+1234567890,Engineering,Software Engineer,2024-01-15,good,2024-12-01,Standard Plan\n';
  const csvTemplate = csvHeader + csvSample;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_template.csv"');
  res.send(csvTemplate);
});

// ---------------------------------------------------------------------------
// Corporate portal: Departments
// ---------------------------------------------------------------------------

router.get('/departments', authUser, requireRole('corporate'), async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let departments = [...corporateDepartments];
  if (q) {
    departments = departments.filter((d) =>
      [d.name, d.manager, d.location].some((field) => String(field || '').toLowerCase().includes(q))
    );
  }
  return res.json({ success: true, data: { departments } });
});

router.post('/departments', authUser, requireRole('corporate'), async (req, res) => {
  const { name, manager, employeeCount, healthScore, checkupCompletion, budget, location, description } = req.body || {};
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });
  const created = {
    id: `DEPT${String(Date.now()).slice(-6)}`,
    name,
    manager: manager || 'Unassigned',
    employeeCount: Number.isFinite(employeeCount) ? employeeCount : 0,
    healthScore: Number.isFinite(healthScore) ? healthScore : 75,
    checkupCompletion: Number.isFinite(checkupCompletion) ? checkupCompletion : 80,
    budget: budget || '$0',
    location: location || '',
    description: description || '',
  };
  corporateDepartments = [created, ...corporateDepartments];
  return res.status(201).json({ success: true, data: { department: created } });
});

router.put('/departments/:id', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const idx = corporateDepartments.findIndex((d) => d.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Department not found' });
  corporateDepartments[idx] = { ...corporateDepartments[idx], ...(req.body || {}) };
  return res.json({ success: true, data: { department: corporateDepartments[idx] } });
});

router.delete('/departments/:id', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const before = corporateDepartments.length;
  corporateDepartments = corporateDepartments.filter((d) => d.id !== id);
  if (corporateDepartments.length === before) return res.status(404).json({ success: false, message: 'Department not found' });
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Corporate portal: Reports
// ---------------------------------------------------------------------------

router.get('/reports', authUser, requireRole('corporate'), async (req, res) => {
  return res.json({ success: true, data: { reports: corporateReports } });
});

router.post('/reports/generate', authUser, requireRole('corporate'), async (req, res) => {
  const { type, period, format } = req.body || {};
  const now = new Date();
  const created = {
    id: `RPT${String(Date.now()).slice(-6)}`,
    title: type || 'Custom Report',
    description: 'Generated on demand',
    category: type || 'Custom',
    generatedDate: now.toISOString().slice(0, 10),
    period: period || 'Custom',
    format: format || 'CSV',
    size: '—',
    status: 'ready',
  };
  corporateReports = [created, ...corporateReports];
  return res.status(201).json({ success: true, data: { report: created } });
});

router.get('/reports/:id/preview', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const report = corporateReports.find((r) => r.id === id);
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
  return res.json({ success: true, data: { report } });
});

router.get('/reports/:id/download', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const report = corporateReports.find((r) => r.id === id);
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

  // For now, generate a simple CSV payload
  const rows = [
    { key: 'id', value: report.id },
    { key: 'title', value: report.title },
    { key: 'category', value: report.category },
    { key: 'period', value: report.period },
    { key: 'generatedDate', value: report.generatedDate },
    { key: 'status', value: report.status },
  ];
  const csv = toCsv(rows, ['key', 'value']);

  const fileBase = `${report.id}`;
  const format = String(req.query.format || report.format || 'csv').toLowerCase();
  const ext = format === 'excel' ? 'csv' : format === 'pdf' ? 'pdf' : 'csv';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${fileBase}.${ext}`);
  return res.status(200).send(csv);
});

// ---------------------------------------------------------------------------
// Corporate portal: Risk monitor alert configuration
// ---------------------------------------------------------------------------

router.get('/risk-monitor/alerts', authUser, requireRole('corporate'), async (req, res) => {
  return res.json({ success: true, data: { config: corporateRiskAlertsConfig } });
});

router.put('/risk-monitor/alerts', authUser, requireRole('corporate'), async (req, res) => {
  corporateRiskAlertsConfig = { ...corporateRiskAlertsConfig, ...(req.body || {}) };
  return res.json({ success: true, data: { config: corporateRiskAlertsConfig } });
});

router.get('/risk-monitor/export', authUser, requireRole('corporate'), async (req, res) => {
  // Minimal export: employees list with risk-related fields if present
  const rows = corporateEmployees.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    department: e.department,
    healthStatus: e.healthStatus,
    lastCheckup: e.lastCheckup,
  }));
  const csv = toCsv(rows, ['employeeId', 'name', 'department', 'healthStatus', 'lastCheckup']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=risk-monitor.csv');
  return res.status(200).send(csv);
});

// ---------------------------------------------------------------------------
// Corporate portal: Complaints
// ---------------------------------------------------------------------------

router.get('/complaints', authUser, requireRole('corporate'), async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  let complaints = [...corporateComplaints];
  if (status && status !== 'all') complaints = complaints.filter((c) => c.status === status);
  if (q) {
    complaints = complaints.filter((c) =>
      [c.employeeName, c.subject, c.category].some((field) => String(field || '').toLowerCase().includes(q))
    );
  }
  return res.json({ success: true, data: { complaints } });
});

router.post('/complaints', authUser, requireRole('corporate'), async (req, res) => {
  const { category, subject, description, priority, employeeName, employeeId } = req.body || {};
  if (!category || !subject || !description) {
    return res.status(400).json({ success: false, message: 'category, subject, and description are required' });
  }

  const now = new Date();
  const created = {
    id: `CMP${String(Date.now()).slice(-6)}`,
    employeeName: employeeName || '—',
    employeeId: employeeId || '—',
    category,
    subject,
    description,
    priority: priority || 'medium',
    status: 'open',
    submittedDate: now.toISOString().slice(0, 10),
    assignedTo: 'Unassigned',
    lastUpdate: now.toISOString().slice(0, 10),
  };
  corporateComplaints = [created, ...corporateComplaints];
  return res.status(201).json({ success: true, data: { complaint: created } });
});

router.put('/complaints/:id', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const idx = corporateComplaints.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Complaint not found' });
  const next = { ...corporateComplaints[idx], ...(req.body || {}) };
  next.lastUpdate = new Date().toISOString().slice(0, 10);
  corporateComplaints[idx] = next;
  return res.json({ success: true, data: { complaint: next } });
});

// ---------------------------------------------------------------------------
// Corporate portal: Billing
// ---------------------------------------------------------------------------

router.get('/billing/history', authUser, requireRole('corporate'), async (req, res) => {
  return res.json({ success: true, data: { invoices: corporateBillingHistory } });
});

router.get('/billing/invoices/:id/download', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const invoice = corporateBillingHistory.find((inv) => inv.id === id);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const csv = toCsv([invoice], ['id', 'date', 'period', 'plan', 'amount', 'currency', 'status']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${invoice.id}.csv`);
  return res.status(200).send(csv);
});

// ---------------------------------------------------------------------------
// Corporate portal: Claims management
// ---------------------------------------------------------------------------

router.get('/claims/management', authUser, requireRole('corporate'), async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  let claims = [...corporateClaims];
  if (status && status !== 'all') claims = claims.filter((c) => c.status === status);
  if (q) {
    claims = claims.filter((c) =>
      [c.employeeName, c.employeeId, c.id, c.claimType].some((field) =>
        String(field || '').toLowerCase().includes(q)
      )
    );
  }
  return res.json({ success: true, data: { claims } });
});

router.put('/claims/management/:id', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const idx = corporateClaims.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Claim not found' });
  const next = { ...corporateClaims[idx], ...(req.body || {}) };
  corporateClaims[idx] = next;
  return res.json({ success: true, data: { claim: next } });
});

router.get('/claims/management/:id/download', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const claim = corporateClaims.find((c) => c.id === id);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  const csv = toCsv(
    [claim],
    [
      'id',
      'employeeName',
      'employeeId',
      'claimType',
      'amount',
      'submittedDate',
      'status',
      'provider',
      'serviceDate',
      'description',
      'documents',
    ]
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${claim.id}.csv`);
  return res.status(200).send(csv);
});

// Submit a new claim
router.post('/claims', authUser, async (req, res) => {
  try {
    const { type, amount, description, appointmentId, documents, provider, serviceDate } = req.body;
    const userId = req.user?.id;

    if (!type || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Claim type and amount are required'
      });
    }

    const submittedDate = new Date().toISOString().slice(0, 10);
    const normalizedAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount);

    const newClaim = {
      id: `CLM${Date.now()}`,
      employeeName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : (req.user?.email || 'Corporate User'),
      employeeId: req.user?.employeeId || String(userId || 'EMP-UNKNOWN'),
      claimType: type,
      amount: normalizedAmount,
      submittedDate,
      status: 'pending',
      provider: provider || 'Unknown Provider',
      serviceDate: serviceDate || submittedDate,
      description: description || '',
      documents: Array.isArray(documents) ? documents.length : (documents ? Number(documents) : 0)
    };

    corporateClaims.unshift(newClaim);

    res.json({
      success: true,
      message: 'Claim submitted successfully',
      data: { claim: newClaim }
    });
  } catch (error) {
    console.error('Error submitting claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit claim',
      error: error.message
    });
  }
});

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

// Get wellness calendar activities
router.get('/wellness-calendar/activities', authUser, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        activities: wellnessActivities,
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

// Create wellness activity
router.post('/wellness-calendar/activities', authUser, async (req, res) => {
  try {
    const { title, description, type, date, startTime, endTime, location, speaker, capacity, theme } = req.body;
    
    const newActivity = {
      id: `act-${Date.now()}`,
      title,
      description,
      type,
      date,
      startTime,
      endTime,
      location,
      speaker,
      capacity: capacity || 50,
      registered: 0,
      status: 'scheduled',
      theme,
      participantSelection: 'all',
      invitesSent: false,
      totalInvited: 0,
      reminders: { enabled: true, fifteenDays: true, threeDays: true, oneDayBefore: true },
      createdAt: new Date().toISOString()
    };
    
    wellnessActivities.push(newActivity);
    
    res.json({
      success: true,
      message: 'Activity created successfully',
      data: newActivity
    });
  } catch (error) {
    console.error('Error creating wellness activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create activity',
      error: error.message
    });
  }
});

// Update wellness activity
router.put('/wellness-calendar/activities/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const index = wellnessActivities.findIndex(a => a.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }
    
    wellnessActivities[index] = { ...wellnessActivities[index], ...req.body, updatedAt: new Date().toISOString() };
    
    res.json({
      success: true,
      message: 'Activity updated successfully',
      data: wellnessActivities[index]
    });
  } catch (error) {
    console.error('Error updating wellness activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update activity',
      error: error.message
    });
  }
});

// Delete wellness activity
router.delete('/wellness-calendar/activities/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const index = wellnessActivities.findIndex(a => a.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }
    
    wellnessActivities.splice(index, 1);
    
    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting wellness activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete activity',
      error: error.message
    });
  }
});

// Send invites for wellness activity
router.post('/wellness-calendar/activities/:id/send-invites', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { participantSelection, selectedDepartments, selectedLocations, totalParticipants } = req.body;
    
    const index = wellnessActivities.findIndex(a => a.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }
    
    wellnessActivities[index] = {
      ...wellnessActivities[index],
      invitesSent: true,
      invitesSentDate: new Date().toISOString(),
      participantSelection,
      selectedDepartments,
      selectedLocations,
      totalInvited: totalParticipants || 0
    };
    
    res.json({
      success: true,
      message: `Invites sent to ${totalParticipants || 0} participants`,
      data: wellnessActivities[index]
    });
  } catch (error) {
    console.error('Error sending invites:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invites',
      error: error.message
    });
  }
});

// Get employee events (for employee wellness calendar view)
router.get('/wellness-calendar/employee/events', authUser, async (req, res) => {
  try {
    // Return activities that are scheduled or ongoing
    const employeeEvents = wellnessActivities
      .filter(a => a.status === 'scheduled' || a.status === 'ongoing')
      .map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.type,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        location: a.location,
        speaker: a.speaker,
        theme: a.theme,
        capacity: a.capacity,
        registered: a.registered,
        isRegistered: false
      }));
    
    res.json({
      success: true,
      data: {
        events: employeeEvents,
        themes: WELLNESS_THEMES
      }
    });
  } catch (error) {
    console.error('Error fetching employee wellness events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wellness events',
      error: error.message
    });
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

router.get('/settings', authUser, requireRole('corporate'), async (req, res) => {
  res.json({ success: true, data: { settings: corporateSettings } });
});

router.put('/settings', authUser, requireRole('corporate'), async (req, res) => {
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

router.post('/appointments', authUser, requireRole('corporate'), async (req, res) => {
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

router.get('/appointments', authUser, requireRole('corporate'), getCorporateAppointments);

// ---------------------------------------------------------------------------
// Challenges Routes (for gamification)
// ---------------------------------------------------------------------------
let corporateChallenges = [];

router.get('/challenges', authUser, requireRole('corporate'), async (req, res) => {
  res.json({ success: true, data: { challenges: corporateChallenges } });
});

router.post('/challenges', authUser, requireRole('corporate'), async (req, res) => {
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

router.put('/challenges/:id', authUser, requireRole('corporate'), async (req, res) => {
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
router.get('/employees/:id', authUser, requireRole('corporate'), async (req, res) => {
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
