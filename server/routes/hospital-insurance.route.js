/**
 * Hospital Insurance Claims Dashboard Routes
 * IHX-like functionality for claims management
 */

import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { body, query, param } from 'express-validator';
import InsuranceClaim from '../models/postgres/insuranceClaim.model.postgres.js';
import PreAuthorization from '../models/postgres/preAuthorization.model.postgres.js';
import { User } from '../models/index.js';
import { Op } from 'sequelize';

const router = Router();

// ==================== 1. DASHBOARD / HOME ====================

/**
 * GET /hospital/insurance/dashboard
 * High-level snapshot of claims work
 */
router.get('/dashboard', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = hospitalId ? { hospital_id: hospitalId } : {};

    // Get counts by status
    const [pending, approved, rejected, query_pending] = await Promise.all([
      InsuranceClaim.count({ where: { ...where, status: 'pending' } }),
      InsuranceClaim.count({ where: { ...where, status: 'approved' } }),
      InsuranceClaim.count({ where: { ...where, status: 'rejected' } }),
      InsuranceClaim.count({ where: { ...where, status: 'query' } })
    ]);

    // Recent claims - simplified query without joins for now
    const recentClaims = await InsuranceClaim.findAll({
      where,
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'claimNumber', 'claimAmount', 'status', 'submittedAt', 'createdAt']
    });

    // Alerts & action items
    const alerts = {
      queriesNeedingResponse: query_pending,
      pendingDocuments: await InsuranceClaim.count({
        where: { ...where, documents_status: 'incomplete' }
      }),
      expiringSoon: await PreAuthorization.count({
        where: {
          ...where,
          status: 'approved',
          expires_at: { [Op.lte]: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        }
      })
    };

    res.json({
      success: true,
      dashboard: {
        stats: {
          pending,
          approved,
          rejected,
          query: query_pending,
          total: pending + approved + rejected + query_pending
        },
        recentActivity: recentClaims,
        alerts,
        charts: {
          statusBreakdown: { pending, approved, rejected, query: query_pending },
          monthlyTrend: [] // TODO: Add monthly trend data
        }
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/dashboard/search
 * Quick search - Find a claim by Claim ID, Policy No. or Member ID
 */
router.post('/dashboard/search', authUser, requireRole(['hospital', 'admin']), [
  body('searchTerm').notEmpty().withMessage('Search term required')
], async (req, res) => {
  try {
    const { searchTerm } = req.body;

    const claims = await InsuranceClaim.findAll({
      where: {
        [Op.or]: [
          { claimNumber: { [Op.like]: `%${searchTerm}%` } },
          { policyNumber: { [Op.like]: `%${searchTerm}%` } },
          { patientId: searchTerm }
        ]
      },
      limit: 20,
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] 
        }
      ]
    });

    res.json({ success: true, results: claims });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 2. CLAIMS MANAGEMENT ====================

/**
 * POST /hospital/insurance/claims/new
 * Create new claim submission
 */
router.post('/claims/new', authUser, requireRole(['hospital', 'admin']), [
  body('patientId').isInt(),
  body('policyNumber').notEmpty(),
  body('claimAmount').isFloat({ min: 0 }),
  body('hospitalizationDetails').isObject()
], async (req, res) => {
  try {
    const {
      patientId,
      policyNumber,
      insuranceProviderId,
      claimAmount,
      claimType,
      hospitalizationDetails,
      documents,
      diagnosis,
      treatmentDetails
    } = req.body;

    // Generate claim number
    const claimNumber = `CLM${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const claim = await InsuranceClaim.create({
      claimNumber,
      patientId,
      hospitalId: req.user.hospitalId || req.body.hospitalId,
      policyNumber,
      insuranceProviderId,
      claimAmount,
      claimType: claimType || 'cashless',
      status: 'draft',
      hospitalizationDetails,
      documents: documents || [],
      diagnosis,
      treatmentDetails,
      submittedBy: req.user.id,
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Claim created successfully',
      claim
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/drafts
 * Access claims started but not submitted yet
 */
router.get('/claims/drafts', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'draft' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: drafts } = await InsuranceClaim.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['updatedAt', 'DESC']],
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email'] 
        }
      ]
    });

    res.json({
      success: true,
      drafts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Drafts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/submitted
 * View claims already submitted to payer/TPA
 */
router.get('/claims/submitted', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, status, page = 1, limit = 20, startDate, endDate } = req.query;
    
    const where = {
      status: { [Op.in]: ['submitted', 'pending', 'approved', 'rejected', 'query'] }
    };
    
    if (hospitalId) where.hospitalId = hospitalId;
    if (status) where.status = status;
    if (startDate) where.submittedAt = { [Op.gte]: new Date(startDate) };
    if (endDate) {
      where.submittedAt = where.submittedAt 
        ? { ...where.submittedAt, [Op.lte]: new Date(endDate) }
        : { [Op.lte]: new Date(endDate) };
    }

    const offset = (page - 1) * limit;

    const { count, rows: claims } = await InsuranceClaim.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['submittedAt', 'DESC']],
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] 
        }
      ]
    });

    res.json({
      success: true,
      claims,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Submitted claims error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/submit
 * Submit claim to payer/TPA
 */
router.post('/claims/:claimId/submit', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.claimId);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    if (claim.status !== 'draft') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only draft claims can be submitted' 
      });
    }

    // Validate required documents
    if (!claim.documents || claim.documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload required documents before submission'
      });
    }

    await claim.update({
      status: 'submitted',
      submittedAt: new Date(),
      submittedBy: req.user.id
    });

    // TODO: Integrate with actual TPA/Insurance API
    // await tpaService.submitClaim(claim);

    res.json({
      success: true,
      message: 'Claim submitted successfully',
      claim
    });
  } catch (error) {
    console.error('Submit claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/:claimId/enhance
 * Upload additional documents or provide clarification
 */
router.post('/claims/:claimId/enhance', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt(),
  body('additionalDocuments').optional().isArray(),
  body('queryResponse').optional().isString()
], async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.claimId);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const { additionalDocuments, queryResponse, notes } = req.body;

    const updateData = {
      updatedAt: new Date(),
      lastModifiedBy: req.user.id
    };

    if (additionalDocuments && additionalDocuments.length > 0) {
      updateData.documents = [...(claim.documents || []), ...additionalDocuments];
      updateData.documentsStatus = 'complete';
    }

    if (queryResponse) {
      updateData.queryHistory = [
        ...(claim.queryHistory || []),
        {
          respondedAt: new Date(),
          respondedBy: req.user.id,
          response: queryResponse,
          notes
        }
      ];
      updateData.status = 'pending'; // Back to pending after query response
    }

    await claim.update(updateData);

    res.json({
      success: true,
      message: 'Claim enhanced successfully',
      claim
    });
  } catch (error) {
    console.error('Enhance claim error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /hospital/insurance/claims/bulk-upload
 * Submit multiple claims via Excel template
 */
router.post('/claims/bulk-upload', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { claims } = req.body; // Array of claim data

    if (!Array.isArray(claims) || claims.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Claims array is required'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const claimData of claims) {
      try {
        const claimNumber = `CLM${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        
        const claim = await InsuranceClaim.create({
          ...claimData,
          claimNumber,
          status: 'draft',
          submittedBy: req.user.id,
          hospitalId: req.user.hospitalId || claimData.hospitalId
        });

        results.success.push({ claimNumber, id: claim.id });
      } catch (error) {
        results.failed.push({
          data: claimData,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk upload completed. Success: ${results.success.length}, Failed: ${results.failed.length}`,
      results
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/history
 * Shows all events, queries, responses, and status changes
 */
router.get('/claims/:claimId/history', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.claimId, {
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email'] 
        }
      ]
    });

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    const timeline = [
      {
        event: 'Created',
        timestamp: claim.createdAt,
        status: 'draft',
        user: claim.submittedBy
      },
      ...(claim.submittedAt ? [{
        event: 'Submitted',
        timestamp: claim.submittedAt,
        status: 'submitted',
        user: claim.submittedBy
      }] : []),
      ...(claim.queryHistory || []).map(q => ({
        event: 'Query Response',
        timestamp: q.respondedAt,
        details: q.response,
        user: q.respondedBy
      })),
      ...(claim.approvedAt ? [{
        event: 'Approved',
        timestamp: claim.approvedAt,
        approvedAmount: claim.approvedAmount,
        status: 'approved'
      }] : []),
      ...(claim.rejectedAt ? [{
        event: 'Rejected',
        timestamp: claim.rejectedAt,
        reason: claim.rejectionReason,
        status: 'rejected'
      }] : [])
    ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({
      success: true,
      claim,
      timeline
    });
  } catch (error) {
    console.error('Claim history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/claims/:claimId/pdf
 * Download claim PDF with attached documents
 */
router.get('/claims/:claimId/pdf', authUser, requireRole(['hospital', 'admin']), [
  param('claimId').isInt()
], async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.claimId, {
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] 
        }
      ]
    });

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    // TODO: Generate PDF using puppeteer or similar
    // For now, return JSON data
    res.json({
      success: true,
      message: 'PDF generation feature coming soon',
      claim,
      documents: claim.documents
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 3. PRE-AUTHORIZATION ====================

/**
 * POST /hospital/insurance/pre-auth/new
 * Request pre-approval for inpatient admission
 */
router.post('/pre-auth/new', authUser, requireRole(['hospital', 'admin']), [
  body('patientId').isInt(),
  body('policyNumber').notEmpty(),
  body('admissionDetails').isObject(),
  body('estimatedAmount').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const {
      patientId,
      policyNumber,
      insuranceProviderId,
      admissionDetails,
      estimatedAmount,
      diagnosis,
      plannedProcedures,
      estimatedDuration
    } = req.body;

    const preAuthNumber = `PA${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const preAuth = await PreAuthorization.create({
      preAuthNumber,
      patientId,
      hospitalId: req.user.hospitalId || req.body.hospitalId,
      policyNumber,
      insuranceProviderId,
      admissionDetails,
      estimatedAmount,
      diagnosis,
      plannedProcedures,
      estimatedDuration,
      status: 'pending',
      submittedBy: req.user.id,
      submittedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'Pre-authorization submitted successfully',
      preAuth
    });
  } catch (error) {
    console.error('Pre-auth creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/pre-auth/pending
 * List of pre-auth requests waiting for insurer action
 */
router.get('/pre-auth/pending', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'pending' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: preAuths } = await PreAuthorization.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['submittedAt', 'DESC']],
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email'] 
        }
      ]
    });

    res.json({
      success: true,
      preAuths,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Pending pre-auths error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/pre-auth/approved
 * Track approved pre-authorization decisions
 */
router.get('/pre-auth/approved', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'approved' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: preAuths } = await PreAuthorization.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['approvedAt', 'DESC']],
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email'] 
        }
      ]
    });

    res.json({
      success: true,
      preAuths,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Approved pre-auths error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/pre-auth/rejected
 * Track rejected pre-authorization decisions
 */
router.get('/pre-auth/rejected', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'rejected' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: preAuths } = await PreAuthorization.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['rejectedAt', 'DESC']],
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email'] 
        }
      ]
    });

    res.json({
      success: true,
      preAuths,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Rejected pre-auths error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 4. DOCUMENTS CENTER ====================

/**
 * POST /hospital/insurance/documents/upload
 * Upload documents for claims
 */
router.post('/documents/upload', authUser, requireRole(['hospital', 'admin']), [
  body('claimId').optional().isInt(),
  body('preAuthId').optional().isInt(),
  body('documentType').notEmpty(),
  body('fileUrl').notEmpty()
], async (req, res) => {
  try {
    const { claimId, preAuthId, documentType, fileUrl, tags } = req.body;

    const document = {
      type: documentType,
      url: fileUrl,
      tags: tags || [],
      uploadedAt: new Date(),
      uploadedBy: req.user.id
    };

    if (claimId) {
      const claim = await InsuranceClaim.findByPk(claimId);
      if (!claim) {
        return res.status(404).json({ success: false, message: 'Claim not found' });
      }
      
      await claim.update({
        documents: [...(claim.documents || []), document]
      });
    } else if (preAuthId) {
      const preAuth = await PreAuthorization.findByPk(preAuthId);
      if (!preAuth) {
        return res.status(404).json({ success: false, message: 'Pre-auth not found' });
      }
      
      await preAuth.update({
        documents: [...(preAuth.documents || []), document]
      });
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/documents/missing
 * Get alerts for missing documents
 */
router.get('/documents/missing', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = { documentsStatus: 'incomplete' };
    if (hospitalId) where.hospitalId = hospitalId;

    const claims = await InsuranceClaim.findAll({
      where,
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName'] 
        }
      ]
    });

    res.json({
      success: true,
      missingDocuments: claims.map(c => ({
        claimId: c.id,
        claimNumber: c.claimNumber,
        patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        requiredDocuments: c.requiredDocuments || [],
        uploadedDocuments: (c.documents || []).map(d => d.type)
      }))
    });
  } catch (error) {
    console.error('Missing documents error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 5. PATIENT / MEMBER SEARCH ====================

/**
 * POST /hospital/insurance/patient/search
 * Search patient by ABHA, mobile, name, policy
 */
router.post('/patient/search', authUser, requireRole(['hospital', 'admin']), [
  body('searchTerm').notEmpty()
], async (req, res) => {
  try {
    const { searchTerm, searchType } = req.body;

    let where = {};
    if (searchType === 'abha') {
      where.abhaId = searchTerm;
    } else if (searchType === 'mobile') {
      where.phoneNumber = searchTerm;
    } else if (searchType === 'policy') {
      // Search in claims
      const claims = await InsuranceClaim.findAll({
        where: { policyNumber: searchTerm },
        include: [{ model: User, as: 'patient' }]
      });
      return res.json({ success: true, patients: claims.map(c => c.patient) });
    } else {
      // Name search
      where[Op.or] = [
        { firstName: { [Op.like]: `%${searchTerm}%` } },
        { lastName: { [Op.like]: `%${searchTerm}%` } }
      ];
    }

    const patients = await User.findAll({ where, limit: 20 });

    res.json({ success: true, patients });
  } catch (error) {
    console.error('Patient search error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/patient/:patientId/eligibility
 * Check policy validity and coverage
 */
router.get('/patient/:patientId/eligibility', authUser, requireRole(['hospital', 'admin']), [
  param('patientId').isInt(),
  query('policyNumber').notEmpty()
], async (req, res) => {
  try {
    // TODO: Integrate with actual insurance provider API
    // For now, return mock data
    res.json({
      success: true,
      eligibility: {
        isValid: true,
        policyNumber: req.query.policyNumber,
        coverageAmount: 500000,
        availableBalance: 450000,
        expiryDate: '2027-12-31',
        dependents: 4,
        copayPercent: 10,
        deductible: 5000
      }
    });
  } catch (error) {
    console.error('Eligibility check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 6. REVENUE / FINANCIALS ====================

/**
 * GET /hospital/insurance/revenue/receivables
 * Shows unpaid/settled claims amounts
 */
router.get('/revenue/receivables', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = hospitalId ? { hospitalId } : {};

    const [approved, settled, pending] = await Promise.all([
      InsuranceClaim.sum('approvedAmount', { 
        where: { ...where, status: 'approved', settlementStatus: 'pending' } 
      }),
      InsuranceClaim.sum('settledAmount', { 
        where: { ...where, settlementStatus: 'settled' } 
      }),
      InsuranceClaim.sum('claimAmount', { 
        where: { ...where, status: 'pending' } 
      })
    ]);

    res.json({
      success: true,
      receivables: {
        approvedNotSettled: approved || 0,
        settled: settled || 0,
        pending: pending || 0,
        total: (approved || 0) + (settled || 0)
      }
    });
  } catch (error) {
    console.error('Receivables error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/revenue/settlement-status
 * Track settlement status of claims
 */
router.get('/revenue/settlement-status', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, page = 1, limit = 20 } = req.query;
    const where = { status: 'approved' };
    if (hospitalId) where.hospitalId = hospitalId;

    const offset = (page - 1) * limit;

    const { count, rows: claims } = await InsuranceClaim.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['approvedAt', 'DESC']],
      include: [
        { 
          model: User, 
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName'] 
        }
      ]
    });

    res.json({
      success: true,
      settlements: claims.map(c => ({
        claimNumber: c.claimNumber,
        patientName: `${c.patient.firstName} ${c.patient.lastName}`,
        approvedAmount: c.approvedAmount,
        settledAmount: c.settledAmount,
        settlementStatus: c.settlementStatus,
        settlementDate: c.settlementDate,
        pendingAmount: (c.approvedAmount || 0) - (c.settledAmount || 0)
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Settlement status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 7. REPORTS / ANALYTICS ====================

/**
 * GET /hospital/insurance/reports/claims-aging
 * Claims aging report - TAT analysis
 */
router.get('/reports/claims-aging', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const where = { status: { [Op.in]: ['pending', 'query'] } };
    if (hospitalId) where.hospitalId = hospitalId;

    const claims = await InsuranceClaim.findAll({ where });

    const now = new Date();
    const aging = {
      '<7days': 0,
      '7-15days': 0,
      '15-30days': 0,
      '>30days': 0
    };

    claims.forEach(claim => {
      const days = Math.floor((now - new Date(claim.submittedAt)) / (1000 * 60 * 60 * 24));
      if (days < 7) aging['<7days']++;
      else if (days < 15) aging['7-15days']++;
      else if (days < 30) aging['15-30days']++;
      else aging['>30days']++;
    });

    res.json({ success: true, agingReport: aging });
  } catch (error) {
    console.error('Aging report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/reports/tat
 * Turnaround time reports
 */
router.get('/reports/tat', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, startDate, endDate } = req.query;
    const where = { status: { [Op.in]: ['approved', 'rejected'] } };
    
    if (hospitalId) where.hospitalId = hospitalId;
    if (startDate) where.submittedAt = { [Op.gte]: new Date(startDate) };
    if (endDate) {
      where.submittedAt = where.submittedAt 
        ? { ...where.submittedAt, [Op.lte]: new Date(endDate) }
        : { [Op.lte]: new Date(endDate) };
    }

    const claims = await InsuranceClaim.findAll({ where });

    const tatData = claims.map(claim => {
      const submittedAt = new Date(claim.submittedAt);
      const resolvedAt = new Date(claim.approvedAt || claim.rejectedAt);
      const tatDays = Math.floor((resolvedAt - submittedAt) / (1000 * 60 * 60 * 24));
      
      return {
        claimNumber: claim.claimNumber,
        status: claim.status,
        tatDays
      };
    });

    const avgTAT = tatData.reduce((sum, item) => sum + item.tatDays, 0) / tatData.length || 0;

    res.json({
      success: true,
      tatReport: {
        averageTAT: Math.round(avgTAT * 10) / 10,
        totalClaims: claims.length,
        details: tatData
      }
    });
  } catch (error) {
    console.error('TAT report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /hospital/insurance/reports/query-rejection-trends
 * Analyze query and rejection patterns
 */
router.get('/reports/query-rejection-trends', authUser, requireRole(['hospital', 'admin']), async (req, res) => {
  try {
    const { hospitalId, months = 6 } = req.query;
    const where = {};
    if (hospitalId) where.hospitalId = hospitalId;

    // Get last N months data
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    where.createdAt = { [Op.gte]: startDate };

    const claims = await InsuranceClaim.findAll({ where });

    const trends = {
      queries: claims.filter(c => c.status === 'query').length,
      rejections: claims.filter(c => c.status === 'rejected').length,
      approvals: claims.filter(c => c.status === 'approved').length,
      rejectionReasons: {}
    };

    claims.filter(c => c.status === 'rejected').forEach(claim => {
      const reason = claim.rejectionReason || 'Unknown';
      trends.rejectionReasons[reason] = (trends.rejectionReasons[reason] || 0) + 1;
    });

    res.json({ success: true, trends });
  } catch (error) {
    console.error('Trends report error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
