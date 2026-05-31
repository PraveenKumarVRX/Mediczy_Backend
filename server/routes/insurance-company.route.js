/**
 * Insurance Company & Corporate Authentication Routes
 * Login and management for insurance companies and corporates
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { InsuranceCompany, Corporate, CorporateEmployee } from '../models/insurance-company.model.intelligent.js';
import { InsurancePolicy, PolicyMember } from '../models/insurance-policy.model.intelligent.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();

// ============================================================================
// INSURANCE COMPANY ROUTES
// ============================================================================

/**
 * Insurance Company Registration
 * POST /api/insurance-company/register
 */
router.post('/register', async (req, res) => {
  try {
    const {
      companyName,
      companyCode,
      email,
      password,
      phone,
      website,
      irdaiRegistrationNumber,
      gstin,
      address,
      contactPerson
    } = req.body;

    // Check if company already exists
    const existing = await InsuranceCompany.findOne({
      where: { email }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Insurance company with this email already exists'
      });
    }

    const company = await InsuranceCompany.create({
      companyName,
      companyCode,
      email,
      password,
      phone,
      website,
      irdaiRegistrationNumber,
      gstin,
      address,
      contactPerson,
      isActive: true,
      isVerified: false
    });

    res.status(201).json({
      success: true,
      message: 'Insurance company registered successfully. Awaiting admin verification.',
      company
    });
  } catch (error) {
    console.error('Insurance company registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * Insurance Company Login
 * POST /api/insurance-company/login
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();

    const company = await InsuranceCompany.findOne({
      where: { email: normalizedEmail }
    });

    if (!company) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Insurance company not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await company.comparePassword(password);

    if (!isPasswordValid) {
      await auditLoginAttempt(req, company.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!company.isActive) {
      await auditLoginAttempt(req, company.id, normalizedEmail, false, 'Company inactive');
      return res.status(403).json({
        success: false,
        message: 'Company account is inactive. Please contact support.'
      });
    }

    if (!company.isVerified) {
      await auditLoginAttempt(req, company.id, normalizedEmail, false, 'Company not verified');
      return res.status(403).json({
        success: false,
        message: 'Company account pending verification. Please contact admin.'
      });
    }

    const token = jwt.sign(
      {
        id: company.id,
        insuranceCompanyId: company.id,
        email: company.email,
        role: 'insurance_company',
        userType: 'insurance_company',
        companyName: company.companyName
      },
      JWT_CONFIG.SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    await auditLoginAttempt(req, company.id, normalizedEmail, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      company
    });
  } catch (error) {
    console.error('Insurance company login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * Get Insurance Company Profile
 * GET /api/insurance-company/profile
 */
router.get('/profile', authUser, requireRole('insurance_company'), async (req, res) => {
  try {
    const company = await InsuranceCompany.findByPk(req.user.id, {
      include: [
        {
          association: 'policies',
          attributes: ['id', 'policyNumber', 'policyName', 'status', 'sumInsured']
        }
      ]
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

/**
 * Update Insurance Company Profile
 * PUT /api/insurance-company/profile
 */
router.put('/profile', authUser, requireRole('insurance_company'), async (req, res) => {
  try {
    const company = await InsuranceCompany.findByPk(req.user.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    const {
      phone,
      website,
      address,
      contactPerson,
      logo,
      description,
      settings
    } = req.body;

    await company.update({
      phone,
      website,
      address,
      contactPerson,
      logo,
      description,
      settings
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      company
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

/**
 * Get Company's Policies Dashboard
 * GET /api/insurance-company/dashboard
 */
router.get('/dashboard', authUser, requireRole('insurance_company'), async (req, res) => {
  try {
    const policies = await InsurancePolicy.findAll({
      where: { insuranceCompanyId: req.user.id },
      include: [
        {
          association: 'members',
          attributes: ['id', 'userId', 'relationship', 'isActive']
        },
        {
          association: 'claims',
          attributes: ['id', 'claimNumber', 'status', 'claimedAmount']
        }
      ]
    });

    const stats = {
      totalPolicies: policies.length,
      activePolicies: policies.filter(p => p.status === 'active').length,
      totalMembers: policies.reduce((sum, p) => sum + (p.members?.length || 0), 0),
      totalClaims: policies.reduce((sum, p) => sum + (p.claims?.length || 0), 0)
    };

    res.json({
      success: true,
      stats,
      policies
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard',
      error: error.message
    });
  }
});

/**
 * Onboard Corporate (Insurance Company creates corporate record)
 * POST /api/insurance-company/onboard-corporate
 */
router.post('/onboard-corporate', authUser, requireRole('insurance_company'), async (req, res) => {
  try {
    const {
      companyName, cin, gstin, pan, industry, employeeCount,
      hrContactName, hrContactEmail, hrContactPhone,
      officeAddress, city, state, pincode
    } = req.body;

    if (!companyName || !hrContactEmail) {
      return res.status(400).json({
        success: false,
        message: 'Company name and HR contact email are required'
      });
    }

    const existing = await Corporate.findOne({ where: { hrContactEmail } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this HR email already exists'
      });
    }

    const corporate = await Corporate.create({
      companyName, cin, gstin, pan, industry,
      employeeCount: employeeCount || 0,
      hrContactName, hrContactEmail, hrContactPhone,
      officeAddress, city, state, pincode,
      status: 'active',
      isVerified: false,
      onboardedBy: 'insurance_company',
      onboardedById: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Corporate onboarded successfully',
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        industry: corporate.industry,
        status: corporate.status
      }
    });
  } catch (error) {
    console.error('Insurance company corporate onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard corporate',
      error: error.message
    });
  }
});

// ============================================================================
// CORPORATE ROUTES
// ============================================================================

/**
 * Corporate Registration
 * POST /api/insurance-company/corporate/register
 */
router.post('/corporate/register', async (req, res) => {
  try {
    const {
      corporateName,
      corporateCode,
      email,
      password,
      phone,
      website,
      industry,
      employeeCount,
      cin,
      gstin,
      pan,
      address,
      hrContact
    } = req.body;

    const existing = await Corporate.findOne({ where: { email } });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Corporate with this email already exists'
      });
    }

    const corporate = await Corporate.create({
      corporateName,
      corporateCode,
      email,
      password,
      phone,
      website,
      industry,
      employeeCount,
      cin,
      gstin,
      pan,
      address,
      hrContact,
      isActive: true,
      isVerified: false
    });

    res.status(201).json({
      success: true,
      message: 'Corporate registered successfully. Awaiting verification.',
      corporate
    });
  } catch (error) {
    console.error('Corporate registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * Corporate Login
 * POST /api/insurance-company/corporate/login
 */
router.post('/corporate/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').toLowerCase();

    const corporate = await Corporate.findOne({ where: { email: normalizedEmail } });

    if (!corporate) {
      await auditLoginAttempt(req, null, normalizedEmail, false, 'Corporate not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await corporate.comparePassword(password);

    if (!isPasswordValid) {
      await auditLoginAttempt(req, corporate.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!corporate.isActive) {
      await auditLoginAttempt(req, corporate.id, normalizedEmail, false, 'Corporate inactive');
      return res.status(403).json({
        success: false,
        message: 'Corporate account is inactive'
      });
    }

    const token = jwt.sign(
      {
        id: corporate.id,
        corporateId: corporate.id,
        email: corporate.email,
        role: 'corporate',
        userType: 'corporate',
        corporateName: corporate.corporateName
      },
      JWT_CONFIG.SECRET,
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
    );

    await auditLoginAttempt(req, corporate.id, normalizedEmail, true);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      corporate
    });
  } catch (error) {
    console.error('Corporate login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * Get Corporate Profile
 * GET /api/insurance-company/corporate/profile
 */
router.get('/corporate/profile', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const corporate = await Corporate.findByPk(req.user.id, {
      include: [
        {
          association: 'employees',
          attributes: ['id', 'employeeId', 'userId', 'department', 'isActive']
        },
        {
          association: 'policies',
          attributes: ['id', 'policyNumber', 'policyName', 'status', 'sumInsured']
        }
      ]
    });

    if (!corporate) {
      return res.status(404).json({
        success: false,
        message: 'Corporate not found'
      });
    }

    res.json({
      success: true,
      corporate
    });
  } catch (error) {
    console.error('Get corporate profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
});

/**
 * Add Employee to Corporate
 * POST /api/insurance-company/corporate/employees
 */
router.post('/corporate/employees', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const {
      userId,
      employeeId,
      department,
      designation,
      joiningDate,
      dependents
    } = req.body;

    // Check if employee already exists
    const existing = await CorporateEmployee.findOne({
      where: {
        corporateId: req.user.id,
        employeeId
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Employee already exists'
      });
    }

    const employee = await CorporateEmployee.create({
      corporateId: req.user.id,
      userId,
      employeeId,
      department,
      designation,
      joiningDate,
      dependents: dependents || [],
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Employee added successfully',
      employee
    });
  } catch (error) {
    console.error('Add employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add employee',
      error: error.message
    });
  }
});

/**
 * Get Corporate Employees
 * GET /api/insurance-company/corporate/employees
 */
router.get('/corporate/employees', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const { isActive, department } = req.query;

    const whereClause = { corporateId: req.user.id };
    if (isActive !== undefined) whereClause.isActive = isActive === 'true';
    if (department) whereClause.department = department;

    const employees = await CorporateEmployee.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      employees
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
      error: error.message
    });
  }
});

/**
 * Corporate Dashboard - Policies & Employee Coverage
 * GET /api/insurance-company/corporate/dashboard
 */
router.get('/corporate/dashboard', authUser, requireRole('corporate'), async (req, res) => {
  try {
    const [employees, policies] = await Promise.all([
      CorporateEmployee.findAll({
        where: { corporateId: req.user.id }
      }),
      InsurancePolicy.findAll({
        where: { corporateId: req.user.id },
        include: ['members', 'claims']
      })
    ]);

    const stats = {
      totalEmployees: employees.length,
      activeEmployees: employees.filter(e => e.isActive).length,
      totalPolicies: policies.length,
      activePolicies: policies.filter(p => p.status === 'active').length,
      totalCoveredMembers: policies.reduce((sum, p) => sum + (p.members?.length || 0), 0),
      totalClaims: policies.reduce((sum, p) => sum + (p.claims?.length || 0), 0)
    };

    res.json({
      success: true,
      stats,
      employees,
      policies
    });
  } catch (error) {
    console.error('Corporate dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard',
      error: error.message
    });
  }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * Admin: Get All Insurance Companies
 * GET /api/insurance-company/admin/companies
 */
router.get('/admin/companies', authUser, requireRole('admin'), async (req, res) => {
  try {
    const companies = await InsuranceCompany.findAll({
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      companies
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: error.message
    });
  }
});

/**
 * Admin: Verify Insurance Company
 * POST /api/insurance-company/admin/companies/:id/verify
 */
router.post('/admin/companies/:id/verify', authUser, requireRole('admin'), async (req, res) => {
  try {
    const company = await InsuranceCompany.findByPk(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    await company.update({ isVerified: true });

    res.json({
      success: true,
      message: 'Company verified successfully',
      company
    });
  } catch (error) {
    console.error('Verify company error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message
    });
  }
});

/**
 * Admin: Get All Corporates
 * GET /api/insurance-company/admin/corporates
 */
router.get('/admin/corporates', authUser, requireRole('admin'), async (req, res) => {
  try {
    const corporates = await Corporate.findAll({
      include: [
        {
          association: 'employees',
          attributes: ['id', 'isActive']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      corporates
    });
  } catch (error) {
    console.error('Get corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch corporates',
      error: error.message
    });
  }
});

export default router;
