import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

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

export default router;
