import express from 'express';
import { body } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  corporateLogin,
  getCorporateSummary,
  getCorporateHealthAnalytics,
  getCorporateEmployeesHealth,
  getCorporateAppointments
} from '../controller/corporate.controller.js';
import { UserPlan, MembershipPlan } from '../models/postgres/membershipPlan.model.postgres.js';

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
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  corporateLogin
);

router.post(
  '/auth/login',
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

  let employees = [...corporateEmployees];
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
  const {
    employeeId,
    name,
    email,
    phone,
    department,
    designation,
    joiningDate,
    healthStatus,
    lastCheckup,
    insurancePlan,
  } = req.body || {};

  if (!name || !email || !department) {
    return res.status(400).json({ success: false, message: 'name, email, and department are required' });
  }

  const generatedEmployeeId = employeeId || `EMP${String(Date.now()).slice(-5)}`;
  const created = {
    id: generatedEmployeeId,
    employeeId: generatedEmployeeId,
    name,
    email,
    phone: phone || '',
    department,
    designation: designation || '',
    joiningDate: joiningDate || new Date().toISOString().slice(0, 10),
    healthStatus: healthStatus || 'good',
    lastCheckup: lastCheckup || new Date().toISOString().slice(0, 10),
    insurancePlan: insurancePlan || 'Standard Plan',
  };

  corporateEmployees = [created, ...corporateEmployees];
  return res.status(201).json({ success: true, data: { employee: created } });
});

router.put('/employees/:id', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const idx = corporateEmployees.findIndex((e) => e.id === id || e.employeeId === id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Employee not found' });
  corporateEmployees[idx] = { ...corporateEmployees[idx], ...(req.body || {}) };
  return res.json({ success: true, data: { employee: corporateEmployees[idx] } });
});

router.delete('/employees/:id', authUser, requireRole('corporate'), async (req, res) => {
  const { id } = req.params;
  const before = corporateEmployees.length;
  corporateEmployees = corporateEmployees.filter((e) => e.id !== id && e.employeeId !== id);
  if (corporateEmployees.length === before) return res.status(404).json({ success: false, message: 'Employee not found' });
  return res.json({ success: true });
});

// Bulk upload employees from CSV/Excel
router.post('/employees/bulk-upload', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const { employees: employeeList } = req.body;
    
    if (!Array.isArray(employeeList) || employeeList.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'employees array is required and must not be empty' 
      });
    }

    const successfulUploads = [];
    const errors = [];

    employeeList.forEach((emp, index) => {
      // Validate required fields
      if (!emp.name || !emp.email || !emp.department) {
        errors.push({
          row: index + 1,
          employee: emp,
          error: 'Missing required fields: name, email, and department are required'
        });
        return;
      }

      // Check for duplicate email
      const existingEmployee = corporateEmployees.find(e => e.email === emp.email);
      if (existingEmployee) {
        errors.push({
          row: index + 1,
          employee: emp,
          error: `Email already exists: ${emp.email}`
        });
        return;
      }

      // Create employee
      const generatedEmployeeId = emp.employeeId || `EMP${String(Date.now() + index).slice(-5)}`;
      const created = {
        id: generatedEmployeeId,
        employeeId: generatedEmployeeId,
        name: emp.name,
        email: emp.email,
        phone: emp.phone || '',
        department: emp.department,
        designation: emp.designation || '',
        joiningDate: emp.joiningDate || new Date().toISOString().slice(0, 10),
        healthStatus: emp.healthStatus || 'good',
        lastCheckup: emp.lastCheckup || new Date().toISOString().slice(0, 10),
        insurancePlan: emp.insurancePlan || 'Standard Plan',
      };

      corporateEmployees = [created, ...corporateEmployees];
      successfulUploads.push(created);
    });

    return res.status(201).json({ 
      success: true, 
      data: { 
        employees: successfulUploads,
        summary: {
          total: employeeList.length,
          successful: successfulUploads.length,
          failed: errors.length
        },
        errors: errors.length > 0 ? errors : undefined
      } 
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to process bulk upload',
      error: error.message 
    });
  }
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
    const { type, amount, description, appointmentId, documents } = req.body;
    const userId = req.user.id;

    if (!type || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Claim type and amount are required'
      });
    }

    // In production, create claim in database
    const newClaim = {
      id: `CLM-${Date.now()}`,
      userId,
      type,
      amount,
      description,
      appointmentId,
      documents: documents || [],
      status: 'Pending',
      submittedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Claim submitted successfully',
      data: newClaim
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

export default router;
