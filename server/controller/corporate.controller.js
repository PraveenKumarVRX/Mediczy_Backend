import { validationResult } from 'express-validator';
import { JWT_CONFIG } from '../config/auth.config.js';
import userModel, { generateAuthTokenForUser } from '../models/user.model.intelligent.js';
import { Corporate } from '../models/index.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const seededEmployees = [
  {
    id: 'EMP-101',
    employeeId: 'EMP-101',
    name: 'Neha Sharma',
    department: 'Engineering',
    designation: 'Senior Developer',
    age: 32,
    gender: 'Female',
    phone: '+91-9876543210',
    email: 'neha.sharma@corporate.com',
    riskLevel: 'medium',
    riskScore: 58,
    healthConditions: ['Hypertension'],
    lastCheckup: '2025-10-12',
    nextCheckup: '2026-01-15',
    bmi: 24.1,
    bloodPressure: '130/85',
    bloodSugar: 98,
    cholesterol: 190,
    smokingStatus: 'Non-Smoker',
    alcoholConsumption: 'Social',
    exerciseFrequency: '3 times/week',
    stressLevel: 'Medium',
    sleepHours: 7,
    chronicDiseases: ['Hypertension'],
    medications: ['Amlodipine'],
    absenteeismDays: 2,
    lastConsultation: '2025-11-02',
    planEnrolled: 'Premium',
    deviceConnected: true,
  },
  {
    id: 'EMP-102',
    employeeId: 'EMP-102',
    name: 'Arjun Mehta',
    department: 'Sales',
    designation: 'Regional Manager',
    age: 38,
    gender: 'Male',
    phone: '+91-9823456780',
    email: 'arjun.mehta@corporate.com',
    riskLevel: 'high',
    riskScore: 76,
    healthConditions: ['Diabetes', 'High Cholesterol'],
    lastCheckup: '2025-09-05',
    nextCheckup: '2025-12-10',
    bmi: 28.3,
    bloodPressure: '145/92',
    bloodSugar: 140,
    cholesterol: 230,
    smokingStatus: 'Former Smoker',
    alcoholConsumption: 'Occasional',
    exerciseFrequency: '1 time/week',
    stressLevel: 'High',
    sleepHours: 5,
    chronicDiseases: ['Diabetes'],
    medications: ['Metformin'],
    absenteeismDays: 6,
    lastConsultation: '2025-10-28',
    planEnrolled: 'Enterprise',
    deviceConnected: true,
  },
  {
    id: 'EMP-103',
    employeeId: 'EMP-103',
    name: 'Riya Patel',
    department: 'Human Resources',
    designation: 'HR Business Partner',
    age: 29,
    gender: 'Female',
    phone: '+91-9812345670',
    email: 'riya.patel@corporate.com',
    riskLevel: 'low',
    riskScore: 32,
    healthConditions: ['Vitamin D Deficiency'],
    lastCheckup: '2025-11-10',
    nextCheckup: '2026-02-14',
    bmi: 21.4,
    bloodPressure: '118/76',
    bloodSugar: 85,
    cholesterol: 160,
    smokingStatus: 'Non-Smoker',
    alcoholConsumption: 'Rare',
    exerciseFrequency: '4 times/week',
    stressLevel: 'Low',
    sleepHours: 8,
    chronicDiseases: [],
    medications: [],
    absenteeismDays: 0,
    lastConsultation: '2025-11-15',
    planEnrolled: 'Premium',
    deviceConnected: true,
  },
  {
    id: 'EMP-104',
    employeeId: 'EMP-104',
    name: 'Karan Verma',
    department: 'Customer Success',
    designation: 'Program Lead',
    age: 35,
    gender: 'Male',
    phone: '+91-9900112233',
    email: 'karan.verma@corporate.com',
    riskLevel: 'medium',
    riskScore: 55,
    healthConditions: ['Obesity'],
    lastCheckup: '2025-08-21',
    nextCheckup: '2025-12-18',
    bmi: 29.1,
    bloodPressure: '135/88',
    bloodSugar: 105,
    cholesterol: 205,
    smokingStatus: 'Non-Smoker',
    alcoholConsumption: 'Weekly',
    exerciseFrequency: '2 times/week',
    stressLevel: 'Medium',
    sleepHours: 6,
    chronicDiseases: [],
    medications: [],
    absenteeismDays: 4,
    lastConsultation: '2025-10-30',
    planEnrolled: 'Standard',
    deviceConnected: false,
  },
  {
    id: 'EMP-105',
    employeeId: 'EMP-105',
    name: 'Sneha Kulkarni',
    department: 'Finance',
    designation: 'FP&A Specialist',
    age: 31,
    gender: 'Female',
    phone: '+91-9988776655',
    email: 'sneha.kulkarni@corporate.com',
    riskLevel: 'critical',
    riskScore: 82,
    healthConditions: ['PCOS', 'Thyroid Disorder'],
    lastCheckup: '2025-11-05',
    nextCheckup: '2025-12-20',
    bmi: 30.5,
    bloodPressure: '148/95',
    bloodSugar: 165,
    cholesterol: 245,
    smokingStatus: 'Non-Smoker',
    alcoholConsumption: 'Rare',
    exerciseFrequency: '1 time/week',
    stressLevel: 'High',
    sleepHours: 5,
    chronicDiseases: ['Thyroid'],
    medications: ['Levothyroxine'],
    absenteeismDays: 8,
    lastConsultation: '2025-11-20',
    planEnrolled: 'Enterprise',
    deviceConnected: true,
  }
];

const seededAppointments = [
  {
    id: 'APT-9001',
    appointmentId: 'APT-9001',
    employeeId: 'EMP-101',
    employeeName: 'Neha Sharma',
    department: 'Engineering',
    phone: '+91-9876543210',
    email: 'neha.sharma@corporate.com',
    appointmentType: 'Annual Checkup',
    doctor: 'Dr. Sameer Joshi',
    specialty: 'Internal Medicine',
    hospitalName: 'CareFirst Clinic',
    appointmentDate: '2025-12-05',
    appointmentTime: '10:00',
    status: 'scheduled',
    benefitType: 'Preventive',
    claimAmount: 0,
    notes: 'Annual screening package',
    bookedOn: '2025-11-18',
  },
  {
    id: 'APT-9002',
    appointmentId: 'APT-9002',
    employeeId: 'EMP-102',
    employeeName: 'Arjun Mehta',
    department: 'Sales',
    phone: '+91-9823456780',
    email: 'arjun.mehta@corporate.com',
    appointmentType: 'Specialist Consultation',
    doctor: 'Dr. R. Iyer',
    specialty: 'Endocrinology',
    hospitalName: 'Metro Specialty Hospital',
    appointmentDate: '2025-11-28',
    appointmentTime: '14:30',
    status: 'completed',
    benefitType: 'Chronic Care',
    claimAmount: 4800,
    notes: 'Follow-up for HbA1c review',
    bookedOn: '2025-11-02',
  },
  {
    id: 'APT-9003',
    appointmentId: 'APT-9003',
    employeeId: 'EMP-103',
    employeeName: 'Riya Patel',
    department: 'Human Resources',
    phone: '+91-9812345670',
    email: 'riya.patel@corporate.com',
    appointmentType: 'Preventive Screening',
    doctor: 'Dr. Lata Menon',
    specialty: 'Gynecology',
    hospitalName: 'CityCare Hospital',
    appointmentDate: '2025-11-18',
    appointmentTime: '09:00',
    status: 'completed',
    benefitType: 'Womens Wellness',
    claimAmount: 3200,
    notes: 'Annual women wellness screening',
    bookedOn: '2025-10-30',
  },
  {
    id: 'APT-9004',
    appointmentId: 'APT-9004',
    employeeId: 'EMP-104',
    employeeName: 'Karan Verma',
    department: 'Customer Success',
    phone: '+91-9900112233',
    email: 'karan.verma@corporate.com',
    appointmentType: 'Nutrition Consultation',
    doctor: 'Dr. Radhika Nair',
    specialty: 'Nutritionist',
    hospitalName: 'WholeLife Wellness Center',
    appointmentDate: '2025-12-02',
    appointmentTime: '16:00',
    status: 'scheduled',
    benefitType: 'Lifestyle Coaching',
    claimAmount: 0,
    notes: 'Weight management plan review',
    bookedOn: '2025-11-10',
  },
  {
    id: 'APT-9005',
    appointmentId: 'APT-9005',
    employeeId: 'EMP-105',
    employeeName: 'Sneha Kulkarni',
    department: 'Finance',
    phone: '+91-9988776655',
    email: 'sneha.kulkarni@corporate.com',
    appointmentType: 'Follow-up',
    doctor: 'Dr. Sapna Rao',
    specialty: 'Endocrinology',
    hospitalName: 'Metro Specialty Hospital',
    appointmentDate: '2025-12-08',
    appointmentTime: '11:15',
    status: 'scheduled',
    benefitType: 'Chronic Care',
    claimAmount: 0,
    notes: 'Glucose stabilization follow-up',
    bookedOn: '2025-11-12',
  }
];

const recentActivityFeed = [
  {
    id: 'ACT-501',
    type: 'Consultation Completed',
    employeeName: 'Arjun Mehta',
    department: 'Sales',
    date: '2025-11-28',
    notes: 'Endocrinology review with improved HbA1c levels',
  },
  {
    id: 'ACT-502',
    type: 'Wellness Challenge',
    employeeName: 'HR Cohort',
    department: 'Human Resources',
    date: '2025-11-24',
    notes: '68% participation recorded in mindfulness sprint',
  },
  {
    id: 'ACT-503',
    type: 'Preventive Screening',
    employeeName: 'Riya Patel',
    department: 'Human Resources',
    date: '2025-11-18',
    notes: 'Full preventive screening completed with green result',
  },
  {
    id: 'ACT-504',
    type: 'Critical Alert',
    employeeName: 'Sneha Kulkarni',
    department: 'Finance',
    date: '2025-11-15',
    notes: 'Early warning triggered for fluctuating glucose readings',
  }
];

const calculateRiskDistribution = (employees) => {
  return employees.reduce(
    (acc, employee) => {
      acc[employee.riskLevel] = (acc[employee.riskLevel] || 0) + 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0, critical: 0 }
  );
};

const buildDepartmentRisks = (employees) => {
  const departmentMap = new Map();

  employees.forEach((employee) => {
    if (!departmentMap.has(employee.department)) {
      departmentMap.set(employee.department, {
        department: employee.department,
        totalEmployees: 0,
        highRisk: 0,
        avgRiskScore: 0,
      });
    }

    const entry = departmentMap.get(employee.department);
    entry.totalEmployees += 1;
    entry.avgRiskScore += employee.riskScore;
    if (employee.riskLevel === 'high' || employee.riskLevel === 'critical') {
      entry.highRisk += 1;
    }
  });

  return Array.from(departmentMap.values()).map((entry) => ({
    ...entry,
    avgRiskScore: Math.round(entry.avgRiskScore / entry.totalEmployees),
  }));
};

const buildConditionStats = (employees) => {
  const conditionCounter = new Map();

  employees.forEach((employee) => {
    employee.healthConditions.forEach((condition) => {
      conditionCounter.set(condition, (conditionCounter.get(condition) || 0) + 1);
    });
  });

  const totalEmployees = employees.length || 1;

  return Array.from(conditionCounter.entries())
    .map(([condition, count]) => ({
      condition,
      count,
      percentage: Math.round((count / totalEmployees) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};

const buildTrendData = () => ([
  { month: 'Jul', avgRiskScore: 64, healthyCount: 42, atRiskCount: 18 },
  { month: 'Aug', avgRiskScore: 62, healthyCount: 45, atRiskCount: 15 },
  { month: 'Sep', avgRiskScore: 60, healthyCount: 47, atRiskCount: 13 },
  { month: 'Oct', avgRiskScore: 59, healthyCount: 48, atRiskCount: 12 },
  { month: 'Nov', avgRiskScore: 58, healthyCount: 49, atRiskCount: 11 },
  { month: 'Dec', avgRiskScore: 57, healthyCount: 50, atRiskCount: 10 }
]);

const buildSummary = (employees, corporate, user) => {
  const riskDistribution = calculateRiskDistribution(employees);
  const completedAppointments = seededAppointments.filter((appt) => appt.status === 'completed').length;

  return {
    KPIs: {
      activeEmployees: employees.length,
      totalConsultationsThisMonth: completedAppointments + 12,
      averageSatisfactionScore: 4.6,
      emergencyCasesHandled: riskDistribution.critical,
    },
    recentActivities: recentActivityFeed,
    corporateProfile: {
      organization: corporate?.companyName || 'Corporate Wellness Program',
      contactPerson: corporate?.contactPerson || user?.firstName || 'HR Leader',
      contactEmail: corporate?.email || user?.email,
      contractStatus: corporate?.status || 'Active',
      packageType: corporate?.packageType || 'Premium',
      employeeCount: corporate?.employeeCount || employees.length,
      renewalDate: corporate?.packageEndDate || null,
    },
    wellbeingHighlights: [
      {
        id: 'HL-1',
        title: 'Mindfulness Challenge',
        metric: '68% adoption',
        description: 'Cross-functional mindfulness sprint improved sleep quality by 12%',
      },
      {
        id: 'HL-2',
        title: 'Chronic Care Coaching',
        metric: '22 critical cases stabilized',
        description: 'Dedicated coaches reduced ER visits across Finance & Sales cohorts',
      },
    ],
  };
};

const buildHealthAnalytics = (employees) => {
  const riskDistribution = calculateRiskDistribution(employees);
  const totalEmployees = employees.length || 1;

  const averageRiskScore = Math.round(
    employees.reduce((sum, employee) => sum + employee.riskScore, 0) / totalEmployees
  );

  const atRiskEmployees = riskDistribution.medium + riskDistribution.high;

  return {
    totalEmployees,
    monitoredEmployees: totalEmployees,
    healthyEmployees: riskDistribution.low,
    atRiskEmployees,
    criticalCases: riskDistribution.critical,
    averageRiskScore,
    riskDistribution,
    departmentRisks: buildDepartmentRisks(employees),
    commonConditions: buildConditionStats(employees),
    trendData: buildTrendData(),
  };
};

export const corporateLogin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();
    const bcrypt = (await import('bcrypt')).default;
    const jwt = (await import('jsonwebtoken')).default;

    // Require an active corporate record in the corporates table (allow pending for demo data)
    const corporateRecord = await Corporate.findOne({
      where: {
        email: normalizedEmail,
        status: ['active', 'Active', 'ACTIVE', 'pending', 'Pending']
      }
    });

    if (!corporateRecord) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Corporate not found');
      return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
    }

    let validPassword = false;
    try {
      if (corporateRecord.password) {
        validPassword = await bcrypt.compare(password, corporateRecord.password);
      }
    } catch (err) {
      console.warn('Corporate password verification failed:', err?.message);
    }

    if (!validPassword) {
      await auditLoginAttempt(req, corporateRecord.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid corporate credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: corporateRecord.id,
        userId: corporateRecord.id,
        corporateId: corporateRecord.id,
        email: corporateRecord.email,
        role: 'corporate',
        userType: 'corporate'
      },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    await auditLoginAttempt(req, corporateRecord.id, normalizedEmail, true);

    return res.json({
      success: true,
      token,
      user: {
        id: corporateRecord.id,
        email: corporateRecord.email,
        firstName: corporateRecord.contactPersonName || corporateRecord.name || corporateRecord.companyName,
        lastName: '',
        role: 'corporate',
        corporateId: corporateRecord.id,
      },
      corporate: corporateRecord,
    });
  } catch (error) {
    console.error('Corporate login error:', error);
    return res.status(500).json({ success: false, message: 'Failed to login corporate user' });
  }
};

export const getCorporateSummary = async (req, res) => {
  try {
    const corporateUser = req.user?.get ? req.user.get({ plain: true }) : req.user;
    const corporateRecord = corporateUser?.corporateId
      ? await Corporate.findByPk(corporateUser.corporateId)
      : null;

    const summary = buildSummary(seededEmployees, corporateRecord, corporateUser);

    return res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Corporate summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch corporate summary' });
  }
};

export const getCorporateHealthAnalytics = async (req, res) => {
  try {
    const analytics = buildHealthAnalytics(seededEmployees);
    return res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Corporate analytics error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch health analytics' });
  }
};

export const getCorporateEmployeesHealth = async (req, res) => {
  try {
    return res.json({ success: true, data: { employees: seededEmployees } });
  } catch (error) {
    console.error('Corporate employees health error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch employee health data' });
  }
};

export const getCorporateAppointments = async (req, res) => {
  try {
    const { Appointment, Doctor, User } = await import('../models/index.js');
    const corporateTenantId = req.user?.organization_id || req.user?.tenant_id;

    if (!corporateTenantId) {
      return res.status(403).json({
        success: false,
        message: 'Corporate tenant context required'
      });
    }

    const appointments = await Appointment.findAll({
      where: { corporate_tenant_id: corporateTenantId },
      include: [
        { model: Doctor, as: 'doctor', attributes: ['id', 'firstName', 'lastName', 'specialization', 'email'] },
        { model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }
      ],
      order: [['appointmentDate', 'DESC'], ['appointmentTime', 'DESC']]
    });

    return res.json({ success: true, data: { appointments } });
  } catch (error) {
    console.error('Corporate appointments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch appointments' });
  }
};
