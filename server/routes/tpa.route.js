import express from 'express';
import { TPA } from '../models/tpa.model.intelligent.js';
import { Corporate } from '../models/insurance-company.model.intelligent.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import heritageTPA from '../services/heritage-tpa.service.js';
import mdIndiaTPA from '../services/mdindia-tpa.service.js';
import healthIndiaTPA from '../services/healthindia-tpa.service.js';
import tpaAggregator from '../services/tpa-aggregator.service.js';
import { JWT_CONFIG } from '../config/auth.config.js';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  console.log('=== TPA TEST ROUTE HIT ===');
  res.json({ message: 'TPA router is working!' });
});

/**
 * Get all available TPA providers
 * GET /api/tpa/providers
 */
router.get('/providers', authUser, async (req, res) => {
  try {
    const providers = tpaAggregator.getAvailableProviders();
    res.json({
      success: true,
      providers,
      total: providers.length
    });
  } catch (error) {
    console.error('Get TPA Providers Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get TPA providers',
      error: error.message
    });
  }
});

/**
 * Execute TPA operation (Unified endpoint)
 * POST /api/tpa/execute
 */
router.post('/execute', authUser, async (req, res) => {
  try {
    const { provider, operation, data } = req.body;

    if (!provider || !operation) {
      return res.status(400).json({
        success: false,
        message: 'Provider and operation are required'
      });
    }

    const result = await tpaAggregator.executeOperation({
      provider,
      operation,
      data: data || {}
    });

    res.json(result);
  } catch (error) {
    console.error('TPA Execute Operation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute TPA operation',
      error: error.message
    });
  }
});

/**
 * Get enrollment details from any TPA
 * POST /api/tpa/:provider/enrollment
 */
router.post('/:provider/enrollment', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getEnrollmentDetails(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Enrollment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enrollment details',
      error: error.message
    });
  }
});

/**
 * Get claims from any TPA
 * POST /api/tpa/:provider/claims
 */
router.post('/:provider/claims', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getClaimsList(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Claims Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get claims',
      error: error.message
    });
  }
});

/**
 * Submit claim intimation to any TPA
 * POST /api/tpa/:provider/claim-intimation
 */
router.post('/:provider/claim-intimation', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.submitClaimIntimation(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Submit Claim Intimation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit claim intimation',
      error: error.message
    });
  }
});

/**
 * Get E-card from any TPA
 * POST /api/tpa/:provider/ecard
 */
router.post('/:provider/ecard', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getECard(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get E-Card Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get E-card',
      error: error.message
    });
  }
});

/**
 * Get network hospitals from any TPA
 * POST /api/tpa/:provider/hospitals
 */
router.post('/:provider/hospitals', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getNetworkHospitals(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Network Hospitals Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get network hospitals',
      error: error.message
    });
  }
});

/**
 * Get network hospital count from any TPA
 * POST /api/tpa/:provider/hospitals/count
 */
router.post('/:provider/hospitals/count', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getNetworkHospitalCount(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Hospital Count Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get hospital count',
      error: error.message
    });
  }
});

/**
 * Get policy details from any TPA
 * POST /api/tpa/:provider/policy
 */
router.post('/:provider/policy', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getPolicyDetails(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Policy Details Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get policy details',
      error: error.message
    });
  }
});

/**
 * Get claim status from any TPA
 * POST /api/tpa/:provider/claim-status
 */
router.post('/:provider/claim-status', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getClaimStatus(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Claim Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get claim status',
      error: error.message
    });
  }
});

/**
 * Upload document to any TPA
 * POST /api/tpa/:provider/upload
 */
router.post('/:provider/upload', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.uploadDocument(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Upload Document Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
});

/**
 * Get pre-auth details from any TPA
 * POST /api/tpa/:provider/preauth
 */
router.post('/:provider/preauth', authUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await tpaAggregator.getPreAuthDetails(provider, req.body);
    res.json(result);
  } catch (error) {
    console.error('TPA Get Pre-Auth Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pre-auth details',
      error: error.message
    });
  }
});

/**
 * TPA Registration
 * POST /api/tpa/register
 */
router.post('/register', async (req, res) => {
  try {
    const {
      tpaName,
      contactPersonName,
      email,
      password,
      phoneNumber,
      irdaiLicenseNumber,
      panNumber,
      gstin,
      officeAddress,
      city,
      state,
      pincode
    } = req.body;

    if (!tpaName || !contactPersonName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'TPA name, contact person, email, and password are required'
      });
    }

    const existingTPA = await TPA.findOne({ where: { email } });
    if (existingTPA) {
      return res.status(409).json({
        success: false,
        message: 'TPA with this email already exists'
      });
    }

    const tpa = await TPA.create({
      tpaName,
      contactPersonName,
      email,
      password,
      phoneNumber,
      irdaiLicenseNumber,
      panNumber,
      gstin,
      officeAddress,
      city,
      state,
      pincode,
      status: 'active',
      isVerified: false
    });

    const token = jwt.sign(
      { id: tpa.id, email: tpa.email, role: 'tpa' },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'TPA registered successfully',
      token,
      tpa: {
        id: tpa.id,
        tpaName: tpa.tpaName,
        contactPersonName: tpa.contactPersonName,
        email: tpa.email,
        phoneNumber: tpa.phoneNumber,
        status: tpa.status
      }
    });
  } catch (error) {
    console.error('TPA registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register TPA',
      error: error.message
    });
  }
});

/**
 * TPA Login
 * POST /api/tpa/login
 */
router.post('/login', async (req, res) => {
  try {
    console.log('=== TPA LOGIN ROUTE HIT ===');
    console.log('Email:', req.body.email);

    const { email, password } = req.body;

    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log('Searching for TPA with email (case-insensitive):', email);
    const tpa = await TPA.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('email')),
        sequelize.fn('LOWER', email)
      )
    });

    console.log('TPA found:', tpa ? 'YES' : 'NO');
    if (!tpa) {
      console.log('TPA not found for email:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await tpa.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (tpa.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'TPA account is not active'
      });
    }

    const token = jwt.sign(
      { id: tpa.id, email: tpa.email, role: 'tpa' },
      JWT_CONFIG.SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: tpa.id,
        tpa_name: tpa.tpaName,
        contact_person_name: tpa.contactPersonName,
        email: tpa.email,
        phone_number: tpa.phoneNumber,
        status: tpa.status,
        claimsProcessed: tpa.claimsProcessed,
        role: 'tpa'
      }
    });
  } catch (error) {
    console.error('TPA login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * TPA Profile
 * GET /api/tpa/profile
 */
router.get('/profile', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const tpa = await TPA.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!tpa) {
      return res.status(404).json({
        success: false,
        message: 'TPA not found'
      });
    }

    res.json({
      success: true,
      tpa
    });
  } catch (error) {
    console.error('Get TPA profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
});

/**
 * Onboard Corporate (TPA creates corporate record)
 * POST /api/tpa/corporates
 */
router.post('/corporates', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const {
      companyName,
      cin,
      gstin,
      pan,
      industry,
      employeeCount,
      hrContactName,
      hrContactEmail,
      hrContactPhone,
      officeAddress,
      city,
      state,
      pincode
    } = req.body;

    if (!companyName || !hrContactEmail) {
      return res.status(400).json({
        success: false,
        message: 'Company name and HR contact email are required'
      });
    }

    // Check if corporate already exists
    const existing = await Corporate.findOne({
      where: { hrContactEmail }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this HR email already exists'
      });
    }

    const corporate = await Corporate.create({
      companyName,
      cin,
      gstin,
      pan,
      industry,
      employeeCount: employeeCount || 0,
      hrContactName,
      hrContactEmail,
      hrContactPhone,
      officeAddress,
      city,
      state,
      pincode,
      status: 'active',
      isVerified: false,
      onboardedBy: 'tpa',
      onboardedById: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Corporate onboarded successfully',
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        cin: corporate.cin,
        industry: corporate.industry,
        employeeCount: corporate.employeeCount,
        hrContactEmail: corporate.hrContactEmail,
        status: corporate.status
      }
    });
  } catch (error) {
    console.error('TPA corporate onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard corporate',
      error: error.message
    });
  }
});

/**
 * List Corporates (onboarded by this TPA)
 * GET /api/tpa/corporates
 */
router.get('/corporates', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const whereClause = {
      onboardedBy: 'tpa',
      onboardedById: req.user.id
    };
    if (status) whereClause.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: corporates } = await Corporate.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      corporates
    });
  } catch (error) {
    console.error('Get TPA corporates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get corporates',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/dashboard
 * Get TPA dashboard statistics
 */
router.get('/dashboard', authUser, requireRole('tpa'), async (req, res) => {
  try {
    // Mock stats - replace with actual database queries later
    const stats = {
      totalClaims: 1247,
      pendingClaims: 89,
      approvedClaims: 1089,
      rejectedClaims: 69,
      totalCorporates: 45,
      activePolicies: 234,
      avgProcessingTime: '2.5 days',
      monthlyRevenue: 8547000
    };

    res.json(stats);
  } catch (error) {
    console.error('TPA dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/claims
 * Get claims list
 */
router.get('/claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    // Mock claims data
    const allClaims = [
      {
        id: 'CLM-2025-001',
        employeeName: 'Rajesh Kumar',
        employeeId: 'EMP-001',
        corporate: 'Tech Solutions Pvt Ltd',
        claimType: 'Hospitalization',
        claimAmount: 125000,
        claimedDate: '2025-01-15',
        status: 'pending',
        policyNumber: 'POL-2025-001',
        hospitalName: 'Apollo Hospital',
        treatmentDate: '2025-01-10'
      },
      {
        id: 'CLM-2025-002',
        employeeName: 'Priya Sharma',
        employeeId: 'EMP-002',
        corporate: 'Digital Marketing Inc',
        claimType: 'OPD',
        claimAmount: 5000,
        claimedDate: '2025-01-18',
        status: 'approved',
        policyNumber: 'POL-2025-002',
        hospitalName: 'Max Healthcare',
        treatmentDate: '2025-01-15'
      },
      {
        id: 'CLM-2025-003',
        employeeName: 'Amit Patel',
        employeeId: 'EMP-003',
        corporate: 'Manufacturing Corp',
        claimType: 'Diagnostic Tests',
        claimAmount: 8500,
        claimedDate: '2025-01-20',
        status: 'approved',
        policyNumber: 'POL-2025-003',
        hospitalName: 'Fortis Hospital',
        treatmentDate: '2025-01-18'
      }
    ];

    let filteredClaims = status && status !== 'all'
      ? allClaims.filter(c => c.status === status)
      : allClaims;

    const total = filteredClaims.length;
    const offset = (page - 1) * limit;
    const paginatedClaims = filteredClaims.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      claims: paginatedClaims,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/members
 * Get members list
 */
router.get('/members', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { page = 1, limit = 20, corporateId, search } = req.query;

    // Mock members data
    const allMembers = [
      {
        id: 'MEM-001',
        employeeId: 'EMP-001',
        name: 'Rajesh Kumar',
        email: 'rajesh.k@techsolutions.com',
        phone: '+91-9876543210',
        corporate: 'Tech Solutions Pvt Ltd',
        designation: 'Senior Developer',
        policyNumber: 'POL-2025-001',
        policyStartDate: '2025-01-01',
        policyEndDate: '2025-12-31',
        coverageAmount: 500000,
        dependents: 2,
        status: 'active'
      },
      {
        id: 'MEM-002',
        employeeId: 'EMP-002',
        name: 'Priya Sharma',
        email: 'priya.s@digitalmarketing.com',
        phone: '+91-9876543211',
        corporate: 'Digital Marketing Inc',
        designation: 'Marketing Manager',
        policyNumber: 'POL-2025-002',
        policyStartDate: '2025-01-01',
        policyEndDate: '2025-12-31',
        coverageAmount: 300000,
        dependents: 3,
        status: 'active'
      }
    ];

    let filteredMembers = allMembers;
    if (corporateId) {
      filteredMembers = filteredMembers.filter(m => m.corporate === corporateId);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filteredMembers = filteredMembers.filter(m =>
        m.name.toLowerCase().includes(searchLower) ||
        m.email.toLowerCase().includes(searchLower) ||
        m.employeeId.toLowerCase().includes(searchLower)
      );
    }

    const total = filteredMembers.length;
    const offset = (page - 1) * limit;
    const paginatedMembers = filteredMembers.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      members: paginatedMembers,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch members',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/policies
 * Get policies list
 */
router.get('/policies', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    // Mock policies data
    const allPolicies = [
      {
        id: 'POL-2025-001',
        corporate: 'Tech Solutions Pvt Ltd',
        policyType: 'Group Health Insurance',
        coverageAmount: 500000,
        numberOfMembers: 250,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        premiumAmount: 3750000,
        status: 'active',
        claimsThisYear: 45
      },
      {
        id: 'POL-2025-002',
        corporate: 'Digital Marketing Inc',
        policyType: 'Group Health Insurance',
        coverageAmount: 300000,
        numberOfMembers: 150,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        premiumAmount: 1800000,
        status: 'active',
        claimsThisYear: 28
      }
    ];

    let filteredPolicies = status && status !== 'all'
      ? allPolicies.filter(p => p.status === status)
      : allPolicies;

    const total = filteredPolicies.length;
    const offset = (page - 1) * limit;
    const paginatedPolicies = filteredPolicies.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      policies: paginatedPolicies,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policies',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/pre-auth
 * Get pre-authorization requests
 */
router.get('/pre-auth', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    // Mock pre-auth data
    const allPreAuths = [
      {
        id: 'PA-2025-001',
        employeeName: 'Rajesh Kumar',
        employeeId: 'EMP-001',
        corporate: 'Tech Solutions Pvt Ltd',
        treatmentType: 'Cardiac Surgery',
        hospitalName: 'Apollo Hospital',
        doctorName: 'Dr. Sharma',
        estimatedAmount: 350000,
        requestedDate: '2025-01-20',
        plannedAdmissionDate: '2025-02-01',
        status: 'pending',
        documents: ['prescription.pdf', 'medical-reports.pdf']
      },
      {
        id: 'PA-2025-002',
        employeeName: 'Priya Sharma',
        employeeId: 'EMP-002',
        corporate: 'Digital Marketing Inc',
        treatmentType: 'Orthopedic Surgery',
        hospitalName: 'Max Healthcare',
        doctorName: 'Dr. Patel',
        estimatedAmount: 180000,
        requestedDate: '2025-01-18',
        plannedAdmissionDate: '2025-01-25',
        status: 'approved',
        approvedAmount: 180000,
        documents: ['prescription.pdf']
      }
    ];

    let filteredPreAuths = status && status !== 'all'
      ? allPreAuths.filter(p => p.status === status)
      : allPreAuths;

    const total = filteredPreAuths.length;
    const offset = (page - 1) * limit;
    const paginatedPreAuths = filteredPreAuths.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      preAuths: paginatedPreAuths,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get pre-auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pre-authorizations',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/analytics
 * Get TPA analytics data
 */
router.get('/analytics', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const analytics = {
      claimsTrend: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        submitted: [120, 145, 132, 156, 178, 189],
        approved: [98, 120, 115, 138, 155, 167],
        rejected: [22, 25, 17, 18, 23, 22]
      },
      claimsByType: [
        { type: 'Hospitalization', count: 445, amount: 15680000 },
        { type: 'OPD', count: 320, amount: 2450000 },
        { type: 'Diagnostic Tests', count: 280, amount: 1890000 },
        { type: 'Pharmacy', count: 202, amount: 780000 }
      ],
      corporatePerformance: [
        { corporate: 'Tech Solutions Pvt Ltd', claims: 125, approvalRate: 92.5 },
        { corporate: 'Digital Marketing Inc', claims: 89, approvalRate: 95.2 },
        { corporate: 'Manufacturing Corp', claims: 67, approvalRate: 88.7 }
      ],
      processingTime: {
        average: 2.5,
        fastest: 0.5,
        slowest: 7.0,
        withinSLA: 87.5
      }
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/reports
 * Get TPA reports
 */
router.get('/reports', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const reports = [
      {
        id: 'RPT-2025-001',
        title: 'Monthly Claims Report - January 2025',
        type: 'claims',
        period: '2025-01',
        generatedDate: '2025-02-01',
        status: 'available',
        fileUrl: '/api/tpa/reports/download/RPT-2025-001'
      },
      {
        id: 'RPT-2025-002',
        title: 'Corporate Performance Report - Q1 2025',
        type: 'corporate-performance',
        period: '2025-Q1',
        generatedDate: '2025-04-01',
        status: 'available',
        fileUrl: '/api/tpa/reports/download/RPT-2025-002'
      }
    ];

    res.json({
      success: true,
      reports
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/settings
 * Get TPA settings
 */
router.get('/settings', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const settings = {
      organization: {
        name: 'Heritage Health TPA',
        email: 'Deepthi@bajoria.in',
        phone: '+91-9876543210',
        irdaiLicense: 'TPA-2024-001',
        address: 'TPA Tower, Business District, Mumbai'
      },
      notifications: {
        emailNotifications: true,
        smsNotifications: true,
        whatsappNotifications: false
      },
      claims: {
        autoApprovalLimit: 10000,
        requireDocuments: true,
        maxProcessingDays: 7
      }
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

/**
 * PUT /api/tpa/settings
 * Update TPA settings
 */
router.put('/settings', authUser, requireRole('tpa'), async (req, res) => {
  try {
    // Mock settings update
    const updatedSettings = req.body;

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/support
 * Get support tickets
 */
router.get('/support', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const tickets = [
      {
        id: 'TKT-2025-001',
        subject: 'Claim Processing Delay',
        corporate: 'Tech Solutions Pvt Ltd',
        priority: 'high',
        status: 'open',
        createdDate: '2025-01-20',
        lastUpdated: '2025-01-21'
      }
    ];

    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error('Get support error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets',
      error: error.message
    });
  }
});

/**
 * Communication Endpoints
 */

/**
 * POST /api/tpa/communication/email/send
 * Send email
 */
router.post('/communication/email/send', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'To, subject, and body are required'
      });
    }

    // Mock email sending
    console.log('TPA Email sent:', { to, subject, body });

    res.json({
      success: true,
      message: 'Email sent successfully',
      data: {
        id: `EMAIL-${Date.now()}`,
        to,
        subject,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/sms/send
 * Send SMS
 */
router.post('/communication/sms/send', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'To and message are required'
      });
    }

    // Mock SMS sending
    console.log('TPA SMS sent:', { to, message });

    res.json({
      success: true,
      message: 'SMS sent successfully',
      data: {
        id: `SMS-${Date.now()}`,
        to,
        message,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/whatsapp/send
 * Send WhatsApp message
 */
router.post('/communication/whatsapp/send', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'To and message are required'
      });
    }

    // Mock WhatsApp sending
    console.log('TPA WhatsApp sent:', { to, message });

    res.json({
      success: true,
      message: 'WhatsApp message sent successfully',
      data: {
        id: `WA-${Date.now()}`,
        to,
        message,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send WhatsApp message',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/voice/call
 * Initiate voice call
 */
router.post('/communication/voice/call', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Mock voice call initiation
    console.log('TPA Voice call initiated:', { to });

    res.json({
      success: true,
      message: 'Call initiated successfully',
      data: {
        id: `CALL-${Date.now()}`,
        to,
        status: 'initiated',
        initiatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate call',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/communication/config
 * Get communication configuration
 */
router.get('/communication/config', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const config = {
      email: {
        provider: 'sendgrid',
        smtpHost: 'smtp.example.com',
        smtpPort: '587',
        fromEmail: 'noreply@tpa.com',
        fromName: 'Heritage Health TPA',
        isConfigured: true
      },
      sms: {
        provider: 'twilio',
        senderId: 'TPA',
        isConfigured: true
      },
      whatsapp: {
        provider: 'gupshup',
        isConfigured: true
      },
      voice: {
        provider: 'exotel',
        isConfigured: true
      }
    };

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Get communication config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch communication configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/email/config
 * Save email configuration
 */
router.post('/communication/email/config', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const config = req.body;
    console.log('Email config saved:', config);

    res.json({
      success: true,
      message: 'Email configuration saved successfully',
      config
    });
  } catch (error) {
    console.error('Save email config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save email configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/email/test
 * Test email configuration
 */
router.post('/communication/email/test', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, provider } = req.body;
    console.log('Email test:', { to, provider });

    res.json({
      success: true,
      message: 'Test email sent successfully',
      data: {
        to,
        provider,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/sms/config
 * Save SMS configuration
 */
router.post('/communication/sms/config', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const config = req.body;
    console.log('SMS config saved:', config);

    res.json({
      success: true,
      message: 'SMS configuration saved successfully',
      config
    });
  } catch (error) {
    console.error('Save SMS config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save SMS configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/sms/test
 * Test SMS configuration
 */
router.post('/communication/sms/test', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, provider } = req.body;
    console.log('SMS test:', { to, provider });

    res.json({
      success: true,
      message: 'Test SMS sent successfully',
      data: {
        to,
        provider,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test SMS',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/whatsapp/config
 * Save WhatsApp configuration
 */
router.post('/communication/whatsapp/config', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const config = req.body;
    console.log('WhatsApp config saved:', config);

    res.json({
      success: true,
      message: 'WhatsApp configuration saved successfully',
      config
    });
  } catch (error) {
    console.error('Save WhatsApp config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save WhatsApp configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/whatsapp/test
 * Test WhatsApp configuration
 */
router.post('/communication/whatsapp/test', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, provider } = req.body;
    console.log('WhatsApp test:', { to, provider });

    res.json({
      success: true,
      message: 'Test WhatsApp message sent successfully',
      data: {
        to,
        provider,
        sentAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test WhatsApp error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test WhatsApp message',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/voice/config
 * Save voice call configuration
 */
router.post('/communication/voice/config', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const config = req.body;
    console.log('Voice config saved:', config);

    res.json({
      success: true,
      message: 'Voice call configuration saved successfully',
      config
    });
  } catch (error) {
    console.error('Save voice config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save voice call configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/communication/voice/test
 * Test voice call configuration
 */
router.post('/communication/voice/test', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { to, provider } = req.body;
    console.log('Voice test:', { to, provider });

    res.json({
      success: true,
      message: 'Test call initiated successfully',
      data: {
        to,
        provider,
        initiatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test voice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate test call',
      error: error.message
    });
  }
});

/**
 * Heritage TPA Integration Endpoints
 */

/**
 * POST /api/tpa/heritage/claims
 * Get claims list from Heritage TPA
 */
router.post('/heritage/claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNumber, FromDate, ToDate, EmployeeNumber, MemberID } = req.body;

    if (!PolicyNumber) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await heritageTPA.getClaimsList({
      PolicyNumber,
      FromDate,
      ToDate,
      EmployeeNumber,
      MemberID
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = heritageTPA.parseResponse(result);

    res.json({
      success: true,
      data: parsedResponse
    });
  } catch (error) {
    console.error('Heritage TPA claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims from Heritage TPA',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/heritage/claim-intimation
 * Submit claim intimation to Heritage TPA
 */
router.post('/heritage/claim-intimation', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const {
      AilmentDescription,
      ContactNo,
      ProviderNumber,
      DateOfAdmission,
      HospName,
      HospAddress,
      MemberId,
      PolicyNo
    } = req.body;

    if (!MemberId || !PolicyNo || !DateOfAdmission) {
      return res.status(400).json({
        success: false,
        message: 'Member ID, Policy Number, and Date of Admission are required'
      });
    }

    const result = await heritageTPA.submitClaimIntimation({
      AilmentDescription,
      ContactNo,
      ProviderNumber,
      DateOfAdmission,
      HospName,
      HospAddress,
      MemberId,
      PolicyNo
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      message: 'Claim intimation submitted successfully',
      data: result.data
    });
  } catch (error) {
    console.error('Heritage TPA claim intimation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit claim intimation',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/heritage/enrollment
 * Get enrollment details from Heritage TPA
 */
router.post('/heritage/enrollment', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNumber, EmployeeNumber, MemberID } = req.body;

    if (!PolicyNumber) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await heritageTPA.getEnrollmentDetails({
      PolicyNumber,
      EmployeeNumber,
      MemberID
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = heritageTPA.parseResponse(result);

    res.json({
      success: true,
      data: parsedResponse
    });
  } catch (error) {
    console.error('Heritage TPA enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollment details',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/heritage/ecard
 * Get member E-Card URL from Heritage TPA
 */
router.post('/heritage/ecard', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNumber, EmployeeNumber, TPAId, MemberID } = req.body;

    if (!PolicyNumber) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await heritageTPA.getMemberECardURL({
      PolicyNumber,
      EmployeeNumber,
      TPAId,
      MemberID
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = heritageTPA.parseResponse(result);

    res.json({
      success: true,
      data: parsedResponse
    });
  } catch (error) {
    console.error('Heritage TPA ecard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch E-Card URL',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/heritage/hospitals/count
 * Get network hospital count from Heritage TPA
 */
router.get('/heritage/hospitals/count', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await heritageTPA.getNetworkHospitalCount();

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = heritageTPA.parseResponse(result);

    res.json({
      success: true,
      data: parsedResponse
    });
  } catch (error) {
    console.error('Heritage TPA hospital count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospital count',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/heritage/hospitals
 * Get network hospitals list from Heritage TPA
 */
router.get('/heritage/hospitals', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { start = 0, end = 100 } = req.query;

    const result = await heritageTPA.getNetworkHospitals({
      StartIndex: parseInt(start),
      EndIndex: parseInt(end)
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = heritageTPA.parseResponse(result);

    res.json({
      success: true,
      data: parsedResponse
    });
  } catch (error) {
    console.error('Heritage TPA hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospitals list',
      error: error.message
    });
  }
});

/**
 * MD India TPA Integration Endpoints
 */

/**
 * POST /api/tpa/mdindia/enrollment
 * Get enrollment details from MD India TPA
 */
router.post('/mdindia/enrollment', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNo, IsCount, StartIndex, EndIndex } = req.body;

    if (!PolicyNo) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await mdIndiaTPA.getEnrollmentDetails({
      PolicyNo,
      IsCount,
      StartIndex,
      EndIndex
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = mdIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('MD India TPA enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollment details',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/mdindia/claims
 * Get claims from MD India TPA
 */
router.post('/mdindia/claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNo, FromDate, ToDate } = req.body;

    if (!PolicyNo) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await mdIndiaTPA.getClaims({ PolicyNo, FromDate, ToDate });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = mdIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('MD India TPA claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/mdindia/hospitals
 * Get policy-wise hospitals from MD India TPA
 */
router.post('/mdindia/hospitals', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNo, StartIndex, EndIndex } = req.body;

    if (!PolicyNo) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await mdIndiaTPA.getPolicyWiseHospital({ PolicyNo, StartIndex, EndIndex });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = mdIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('MD India TPA hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospitals',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/mdindia/ecard
 * Get E-Card from MD India TPA
 */
router.post('/mdindia/ecard', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNo, MemberId } = req.body;

    if (!PolicyNo || !MemberId) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number and Member ID are required'
      });
    }

    const result = await mdIndiaTPA.getEcard({ PolicyNo, MemberId });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = mdIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('MD India TPA ecard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch E-Card',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/mdindia/endorsement
 * Get endorsement data from MD India TPA
 */
router.post('/mdindia/endorsement', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNo, FromDate, ToDate } = req.body;

    if (!PolicyNo) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await mdIndiaTPA.getEndorsementData({ PolicyNo, FromDate, ToDate });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = mdIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('MD India TPA endorsement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch endorsement data',
      error: error.message
    });
  }
});

/**
 * Health India TPA Integration Endpoints
 */

/**
 * POST /api/tpa/healthindia/claims
 * Get claims from Health India TPA
 */
router.post('/healthindia/claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNumber, FromDate, ToDate, EmployeeNumber, MemberID } = req.body;

    if (!PolicyNumber) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await healthIndiaTPA.getClaimsList({
      PolicyNumber,
      FromDate,
      ToDate,
      EmployeeNumber,
      MemberID
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = healthIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('Health India TPA claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/healthindia/claim-intimation
 * Submit claim intimation to Health India TPA
 */
router.post('/healthindia/claim-intimation', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const {
      PolicyNo,
      MemberId,
      DateOfAdmission,
      HospitalName,
      HospitalAddress,
      ContactNo,
      AilmentDescription,
      EstimatedAmount
    } = req.body;

    if (!PolicyNo || !MemberId || !DateOfAdmission) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number, Member ID, and Date of Admission are required'
      });
    }

    const result = await healthIndiaTPA.submitClaimIntimation({
      PolicyNo,
      MemberId,
      DateOfAdmission,
      HospitalName,
      HospitalAddress,
      ContactNo,
      AilmentDescription,
      EstimatedAmount
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = healthIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('Health India TPA claim intimation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit claim intimation',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/healthindia/enrollment
 * Get enrollment details from Health India TPA
 */
router.post('/healthindia/enrollment', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNumber, EmployeeNumber, MemberID } = req.body;

    if (!PolicyNumber) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number is required'
      });
    }

    const result = await healthIndiaTPA.getEnrollmentDetails({
      PolicyNumber,
      EmployeeNumber,
      MemberID
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = healthIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('Health India TPA enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollment details',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/healthindia/ecard
 * Get E-Card from Health India TPA
 */
router.post('/healthindia/ecard', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { PolicyNumber, MemberID, EmployeeNumber } = req.body;

    if (!PolicyNumber || !MemberID) {
      return res.status(400).json({
        success: false,
        message: 'Policy Number and Member ID are required'
      });
    }

    const result = await healthIndiaTPA.getMemberECardURL({
      PolicyNumber,
      MemberID,
      EmployeeNumber
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = healthIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('Health India TPA ecard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch E-Card',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/healthindia/hospitals/count
 * Get hospital count from Health India TPA
 */
router.get('/healthindia/hospitals/count', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await healthIndiaTPA.getNetworkHospitalCount();

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = healthIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('Health India TPA hospital count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospital count',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/healthindia/hospitals
 * Get hospitals from Health India TPA
 */
router.get('/healthindia/hospitals', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { start = 0, end = 100, city, state } = req.query;

    const result = await healthIndiaTPA.getNetworkHospitals({
      StartIndex: parseInt(start),
      EndIndex: parseInt(end),
      CityName: city,
      StateName: state
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    const parsedResponse = healthIndiaTPA.parseResponse(result);

    res.json(parsedResponse);
  } catch (error) {
    console.error('Health India TPA hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospitals',
      error: error.message
    });
  }
});

export default router;
