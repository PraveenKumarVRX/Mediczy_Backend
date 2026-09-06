import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { TPA } from '../models/tpa.model.intelligent.js';
import Corporate from '../models/postgres/corporate.model.postgres.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authTPA } from '../middleware/tpa.middleware.js';
import jwt from 'jsonwebtoken';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { Op } from 'sequelize';
import heritageTPA from '../services/heritage-tpa.service.js';
import mdIndiaTPA from '../services/mdindia-tpa.service.js';
import healthIndiaTPA from '../services/healthindia-tpa.service.js';
import tpaAggregator from '../services/tpa-aggregator.service.js';
import tpaClaimsLifecycleService from '../services/tpa-claims-lifecycle.service.js';
import { JWT_CONFIG } from '../config/auth.config.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { auditLoginAttempt } from '../middleware/audit.middleware.js';

const router = express.Router();
const tpaClaimUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const tpaUploadRoot = path.resolve(process.cwd(), 'uploads', 'tpa-claims');


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
 * GET /api/tpa/ecard/verify/:verificationCode
 * Authenticated QR verification endpoint for native Mediqzy e-cards
 */
router.get('/ecard/verify/:verificationCode', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.verifyECard(req.params.verificationCode);
    if (!result) {
      return res.status(404).json({ success: false, verified: false, message: 'E-card verification failed' });
    }
    res.json(result);
  } catch (error) {
    console.error('Verify native TPA e-card error:', error);
    res.status(500).json({ success: false, verified: false, message: 'Failed to verify e-card', error: error.message });
  }
});

/**
 * GET /api/tpa/network-hospitals
 * Native Mediqzy network hospital intelligence with cashless/package hints
 */
router.get('/network-hospitals', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listNetworkHospitals({
      tpaId: req.user.id,
      search: req.query.search,
      city: req.query.city,
      specialty: req.query.specialty,
      cashless: req.query.cashless,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (error) {
    console.error('Native TPA network hospital search error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch network hospitals', error: error.message });
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
      { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
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
router.post('/login', authLimiter, async (req, res) => {
  try {
    console.log('=== TPA LOGIN ROUTE HIT ===');
    console.log('Email:', req.body.email);

    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log('Searching for TPA with email (case-insensitive):', normalizedEmail);
    const tpa = await TPA.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('email')),
        sequelize.fn('LOWER', normalizedEmail)
      )
    });

    console.log('TPA found:', tpa ? 'YES' : 'NO');
    if (!tpa) {
      console.log('TPA not found for email:', email);
      await auditLoginAttempt(req, null, normalizedEmail, false, 'TPA not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Account status guard before password (avoids timing oracle on inactive accounts)
    if (tpa.status !== 'active') {
      await auditLoginAttempt(req, tpa.id, normalizedEmail, false, 'TPA inactive');
      return res.status(403).json({ success: false, message: 'TPA account is not active' });
    }
    if (tpa.isActive === false) {
      await auditLoginAttempt(req, tpa.id, normalizedEmail, false, 'TPA disabled (isActive=false)');
      return res.status(403).json({ success: false, message: 'TPA account has been disabled' });
    }

    const isPasswordValid = await tpa.comparePassword(password);
    if (!isPasswordValid) {
      await auditLoginAttempt(req, tpa.id, normalizedEmail, false, 'Invalid password');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const { issuePortalTokenPair } = await import('../services/token-revocation.service.js');
    const deviceFp = req.headers['x-device-fingerprint'] || null;
    const { accessToken: token } = await issuePortalTokenPair(
      { id: tpa.id, email: tpa.email, role: 'tpa' },
      { portal: 'tpa', deviceFp }
    );

    await auditLoginAttempt(req, tpa.id, normalizedEmail, true);

    const tpaUser = {
      id: tpa.id,
      tpa_name: tpa.tpaName,
      tpaName: tpa.tpaName,
      contact_person_name: tpa.contactPersonName,
      contactPersonName: tpa.contactPersonName,
      email: tpa.email,
      phone_number: tpa.phoneNumber,
      phoneNumber: tpa.phoneNumber,
      status: tpa.status,
      claimsProcessed: tpa.claimsProcessed,
      role: 'tpa'
    };

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: tpaUser,
      tpa: tpaUser
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
router.get('/profile', authTPA, async (req, res) => {
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
router.post('/corporates', authTPA, async (req, res) => {
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
      where: { email: hrContactEmail }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Corporate with this HR email already exists'
      });
    }

    const corporate = await Corporate.create({
      companyName,
      contactPerson: hrContactName || 'HR Admin',
      email: hrContactEmail,
      phoneNumber: hrContactPhone || 'Not provided',
      gstNumber: gstin,
      panNumber: pan,
      industry,
      employeeCount: employeeCount || 0,
      address: {
        street: officeAddress || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        country: 'India'
      },
      status: 'Active',
      metadata: {
        cin,
        hrContactName,
        hrContactEmail,
        hrContactPhone,
        isVerified: false
      },
      onboardedBy: 'tpa',
      onboardedById: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Corporate onboarded successfully',
      corporate: {
        id: corporate.id,
        companyName: corporate.companyName,
        cin: corporate.metadata?.cin || cin,
        industry: corporate.industry,
        employeeCount: corporate.employeeCount,
        hrContactEmail: corporate.email,
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
router.get('/corporates', authTPA, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    // The 'Corporate' model name is registered on this same Sequelize
    // instance by two other model files (crm.model.intelligent.js,
    // insurance-company.model.intelligent.js — a pre-existing collision,
    // not something to unwind here). In the full app, Corporate.count()
    // (called internally by findAndCountAll) has been observed resolving
    // onboardedBy against the wrong registry entry and failing with
    // "column Corporate.onboardedBy does not exist" even though this
    // Corporate model's own attribute mapping is correct. Referencing the
    // real column via sequelize.where/col sidesteps attribute-name
    // resolution entirely so this is immune to that collision regardless
    // of which model definition Sequelize's internals pick.
    const whereClause = {
      [Op.and]: [sequelize.where(sequelize.col('Corporate.onboarded_by'), 'tpa')],
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
router.get('/dashboard', authTPA, async (req, res) => {
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
 * GET /api/tpa/functions
 * TPA function catalog shown after login
 */
router.get('/functions', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const functions = [
      {
        id: 'claim_submission',
        title: 'Submit Claim',
        description: 'Reimbursement claim intake with member, policy, hospital, amount, and document checklist.',
        path: '/tpa/claim-submission',
        status: 'enabled'
      },
      {
        id: 'ecard',
        title: 'E-Card',
        description: 'Generate member IDs and issue/download QR-ready e-cards for hospital verification.',
        path: '/tpa/ecard',
        status: 'enabled'
      },
      {
        id: 'network_hospitals',
        title: 'Network Hospitals',
        description: 'Search network hospitals by TPA provider, city, specialty, and cashless availability.',
        path: '/tpa/hospitals',
        status: 'enabled'
      },
      {
        id: 'benefit_estimator',
        title: 'OOPE Estimator',
        description: 'Estimate payable, co-pay, sub-limit impact, and member out-of-pocket before approval.',
        path: '/tpa/benefit-estimator',
        status: 'enabled'
      },
      {
        id: 'hospitalization_intimation',
        title: 'Hospital Intimation',
        description: 'Track planned and emergency hospitalisation intimations with SLA status.',
        path: '/tpa/hospitalization-intimations',
        status: 'enabled'
      },
      {
        id: 'document_intelligence',
        title: 'Document AI',
        description: 'OCR, classify, and validate claim documents before processing.',
        path: '/tpa/document-intelligence',
        status: 'enabled'
      },
      {
        id: 'fraud_guard',
        title: 'Fraud Guard',
        description: 'Fraud, waste, and abuse alert queue with explainable rule triggers.',
        path: '/tpa/fraud-guard',
        status: 'enabled'
      },
      {
        id: 'weekly_mis',
        title: 'Weekly MIS',
        description: 'Corporate weekly claims, SLA, settlement, and utilisation reports.',
        path: '/tpa/weekly-mis',
        status: 'enabled'
      },
      {
        id: 'grievances',
        title: 'Grievances',
        description: 'SLA-backed grievance redressal and escalation management.',
        path: '/tpa/grievances',
        status: 'enabled'
      }
    ];

    res.json({
      success: true,
      functions,
      stats: {
        enabledFunctions: functions.length,
        pendingPreAuth: 1,
        documentAIQueue: 2,
        grievanceSLA: '96%'
      }
    });
  } catch (error) {
    console.error('Get TPA functions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch TPA functions',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/claims
 * Get DB-backed TPA claims list
 */
router.get('/claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listClaims({
      tpaId: req.user.id,
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
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
 * POST /api/tpa/claims
 * Create a new TPA claim
 */
router.post('/claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    if (!req.body.policyNumber || !(req.body.employeeName || req.body.patientName)) {
      return res.status(400).json({
        success: false,
        message: 'Policy number and employee/member name are required'
      });
    }

    const result = await tpaClaimsLifecycleService.createClaim(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('Create TPA claim error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to create claim',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/claims/:claimNumber
 * Get claim detail, timeline, documents, shortfalls, and FWA score
 */
router.get('/claims/:claimNumber', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.getClaim(req.user.id, req.params.claimNumber);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    res.json(result);
  } catch (error) {
    console.error('Get TPA claim detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim detail',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/documents
 * Add document metadata and AI/OCR status to a claim
 */
router.post('/claims/:claimNumber/documents', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.addDocument(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    res.status(201).json(result);
  } catch (error) {
    console.error('Add TPA claim document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add claim document',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/files
 * Upload a claim file into the TPA document vault and link it to document intelligence.
 */
router.post('/claims/:claimNumber/files', authUser, requireRole('tpa'), tpaClaimUpload.single('file'), async (req, res) => {
  try {
    const safeClaimNumber = String(req.params.claimNumber || '').replace(/[^a-zA-Z0-9-_]/g, '_');
    let payload = { ...req.body };

    if (req.file) {
      const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const extension = path.extname(req.file.originalname || '') || '.bin';
      const storageDir = path.join(tpaUploadRoot, safeClaimNumber);
      await fs.mkdir(storageDir, { recursive: true });
      const storageFileName = `${Date.now()}-${checksum.slice(0, 12)}${extension}`;
      const storagePath = path.join(storageDir, storageFileName);
      await fs.writeFile(storagePath, req.file.buffer);
      payload = {
        ...payload,
        storageProvider: 'local',
        storageKey: path.relative(process.cwd(), storagePath),
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        checksumSha256: checksum,
      };
    }

    if (!payload.storageKey) {
      return res.status(400).json({ success: false, message: 'File upload or storageKey is required' });
    }

    const fileResult = await tpaClaimsLifecycleService.attachClaimFile(req.user.id, req.params.claimNumber, payload, req.user.id);
    if (!fileResult) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    let documentResult = null;
    if (payload.classifyAsDocument !== 'false') {
      documentResult = await tpaClaimsLifecycleService.addDocument(req.user.id, req.params.claimNumber, {
        documentType: payload.documentType || 'claim_file',
        fileName: payload.originalFileName || payload.fileName || 'claim-file',
        fileUrl: fileResult.file.storage_key,
        ocrStatus: payload.ocrStatus || 'queued',
        completenessScore: payload.completenessScore || 70,
        extractedFields: { storageKey: fileResult.file.storage_key, checksumSha256: fileResult.file.checksum_sha256 },
        missingFields: payload.missingFields || ['ocr_pending'],
        riskSignal: payload.riskSignal || 'low',
      }, req.user.id);
    }

    res.status(201).json({ success: true, file: fileResult.file, document: documentResult?.document || null });
  } catch (error) {
    console.error('Upload TPA claim file error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload claim file', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/document-intelligence
 * Run claim document checklist/OCR readiness workflow.
 */
router.post('/claims/:claimNumber/document-intelligence', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.runDocumentIntelligence(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA document intelligence error:', error);
    res.status(500).json({ success: false, message: 'Failed to run document intelligence', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/payable-estimate
 * Apply policy rules to calculate payable/non-payable estimate.
 */
router.post('/claims/:claimNumber/payable-estimate', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.calculateClaimPayable(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA payable estimate error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate payable estimate', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/approval-requests
 * Queue maker-checker approval for high-risk/high-value actions.
 */
router.post('/claims/:claimNumber/approval-requests', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createApprovalRequest(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA maker-checker request error:', error);
    res.status(500).json({ success: false, message: 'Failed to create approval request', error: error.message });
  }
});

/**
 * POST /api/tpa/approval-requests/:approvalNumber/decision
 * Checker approves/rejects a pending maker-checker request.
 */
router.post('/approval-requests/:approvalNumber/decision', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.decideApprovalRequest(req.user.id, req.params.approvalNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Approval request not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA maker-checker decision error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to decide approval request', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/notifications
 * Queue claim-triggered Email/SMS/WhatsApp notification with delivery receipt.
 */
router.post('/claims/:claimNumber/notifications', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.queueClaimNotification(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA claim notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to queue claim notification', error: error.message });
  }
});

/**
 * GET /api/tpa/claims/:claimNumber/enterprise-controls
 * Get file vault, approvals, notifications, provider handoffs, and interop events.
 */
router.get('/claims/:claimNumber/enterprise-controls', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.getEnterpriseControls(req.user.id, req.params.claimNumber);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA enterprise controls error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch enterprise controls', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/shortfalls
 * Raise claim shortfall/query
 */
router.post('/claims/:claimNumber/shortfalls', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.raiseShortfall(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    res.status(201).json(result);
  } catch (error) {
    console.error('Raise TPA claim shortfall error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to raise claim shortfall',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/decision
 * Approve, reject, settle, or pay a claim
 */
router.post('/claims/:claimNumber/decision', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.decideClaim(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    res.json(result);
  } catch (error) {
    console.error('TPA claim decision error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to update claim decision',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/fwa-score
 * Generate Fraud/Waste/Abuse score for a claim
 */
router.post('/claims/:claimNumber/fwa-score', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.scoreClaimFraud(req.user.id, req.params.claimNumber);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    res.json(result);
  } catch (error) {
    console.error('TPA claim FWA score error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to score claim fraud risk',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/members
 * Get native TPA members and dependent coverage snapshots
 */
router.get('/members', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listMembers({
      tpaId: req.user.id,
      page: req.query.page,
      limit: req.query.limit,
      corporate: req.query.corporateId || req.query.corporate,
      search: req.query.search,
      status: req.query.status,
    });
    res.json(result);
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
 * GET /api/tpa/members/:memberId/eligibility
 * Native eligibility and benefit balance check
 */
router.get('/members/:memberId/eligibility', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.getMemberEligibility(req.user.id, req.params.memberId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Get member eligibility error:', error);
    res.status(500).json({ success: false, message: 'Failed to check member eligibility', error: error.message });
  }
});

/**
 * POST /api/tpa/members/:memberId/ecard/generate
 * Explicitly generate/persist a native Mediqzy e-card payload with QR verification data
 */
router.post('/members/:memberId/ecard/generate', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.generateECard(req.user.id, req.params.memberId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Member not found for e-card generation' });
    }
    res.json(result);
  } catch (error) {
    console.error('Generate native TPA e-card error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate e-card', error: error.message });
  }
});

/**
 * GET /api/tpa/members/:memberId/ecard
 * Read/generate-compatible endpoint kept for existing clients
 */
router.get('/members/:memberId/ecard', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.generateECard(req.user.id, req.params.memberId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Get native TPA e-card error:', error);
    res.status(500).json({ success: false, message: 'Failed to get e-card', error: error.message });
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
 * Get DB-backed pre-authorization requests
 */
router.get('/pre-auth', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listPreAuths({
      tpaId: req.user.id,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
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
 * GET /api/tpa/underwriting/cases
 */
router.get('/underwriting/cases', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listUnderwritingCases({ tpaId: req.user.id, status: req.query.status, page: req.query.page, limit: req.query.limit });
    res.json(result);
  } catch (error) {
    console.error('TPA underwriting list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch underwriting cases', error: error.message });
  }
});

/**
 * POST /api/tpa/underwriting/cases
 */
router.post('/underwriting/cases', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createUnderwritingCase(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA underwriting create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create underwriting case', error: error.message });
  }
});

/**
 * POST /api/tpa/underwriting/cases/:caseNumber/decision
 */
router.post('/underwriting/cases/:caseNumber/decision', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.decideUnderwritingCase(req.user.id, req.params.caseNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Underwriting case not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA underwriting decision error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to decide underwriting case', error: error.message });
  }
});

/**
 * GET /api/tpa/member-enrollments
 */
router.get('/member-enrollments', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listMemberEnrollments({ tpaId: req.user.id, status: req.query.status, page: req.query.page, limit: req.query.limit });
    res.json(result);
  } catch (error) {
    console.error('TPA enrollment list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch member enrollments', error: error.message });
  }
});

/**
 * POST /api/tpa/member-enrollments
 */
router.post('/member-enrollments', authUser, requireRole('tpa'), async (req, res) => {
  try {
    if (!req.body.policyNumber || !(req.body.employeeName || req.body.memberName)) {
      return res.status(400).json({ success: false, message: 'Policy number and member name are required' });
    }
    const result = await tpaClaimsLifecycleService.createMemberEnrollment(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA enrollment create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create member enrollment', error: error.message });
  }
});

/**
 * POST /api/tpa/member-enrollments/:enrollmentNumber/decision
 */
router.post('/member-enrollments/:enrollmentNumber/decision', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.decideMemberEnrollment(req.user.id, req.params.enrollmentNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Member enrollment not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA enrollment decision error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to decide member enrollment', error: error.message });
  }
});

/**
 * GET /api/tpa/provider-contracts
 */
router.get('/provider-contracts', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listProviderContracts({ tpaId: req.user.id, status: req.query.status, page: req.query.page, limit: req.query.limit });
    res.json(result);
  } catch (error) {
    console.error('TPA provider contract list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch provider contracts', error: error.message });
  }
});

/**
 * POST /api/tpa/provider-contracts
 */
router.post('/provider-contracts', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.upsertProviderContract(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA provider contract upsert error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to save provider contract', error: error.message });
  }
});

/**
 * POST /api/tpa/provider-contracts/:providerCode/soc
 */
router.post('/provider-contracts/:providerCode/soc', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.addProviderSOC(req.user.id, req.params.providerCode, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA provider SOC error:', error);
    res.status(500).json({ success: false, message: 'Failed to add provider SOC', error: error.message });
  }
});

/**
 * POST /api/tpa/provider-contracts/:providerCode/blacklist
 */
router.post('/provider-contracts/:providerCode/blacklist', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.blacklistProvider(req.user.id, req.params.providerCode, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA provider blacklist error:', error);
    res.status(500).json({ success: false, message: 'Failed to blacklist provider', error: error.message });
  }
});

/**
 * GET /api/tpa/cashless/forms
 */
router.get('/cashless/forms', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listCashlessForms({ tpaId: req.user.id, status: req.query.status, page: req.query.page, limit: req.query.limit });
    res.json(result);
  } catch (error) {
    console.error('TPA cashless form list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cashless forms', error: error.message });
  }
});

/**
 * POST /api/tpa/cashless/forms
 */
router.post('/cashless/forms', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createCashlessForm(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA cashless form create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create cashless form', error: error.message });
  }
});

/**
 * GET /api/tpa/cashless/requests
 */
router.get('/cashless/requests', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listCashlessRequests({ tpaId: req.user.id, status: req.query.status, page: req.query.page, limit: req.query.limit });
    res.json(result);
  } catch (error) {
    console.error('TPA cashless request list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cashless requests', error: error.message });
  }
});

/**
 * POST /api/tpa/cashless/requests
 */
router.post('/cashless/requests', authUser, requireRole('tpa'), async (req, res) => {
  try {
    if (!req.body.policyNumber || !(req.body.patientName || req.body.employeeName)) {
      return res.status(400).json({ success: false, message: 'Policy number and patient/member name are required' });
    }
    const result = await tpaClaimsLifecycleService.createCashlessRequest(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA cashless request create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create cashless request', error: error.message });
  }
});

/**
 * POST /api/tpa/cashless/requests/:requestNumber/decision
 */
router.post('/cashless/requests/:requestNumber/decision', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.decideCashlessRequest(req.user.id, req.params.requestNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Cashless request not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA cashless request decision error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to decide cashless request', error: error.message });
  }
});

/**
 * POST /api/tpa/provider-claims
 */
router.post('/provider-claims', authUser, requireRole('tpa'), async (req, res) => {
  try {
    if (!req.body.policyNumber || !(req.body.patientName || req.body.employeeName)) {
      return res.status(400).json({ success: false, message: 'Policy number and patient/member name are required' });
    }
    const result = await tpaClaimsLifecycleService.submitProviderClaim(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA provider claim submission error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit provider claim', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/inward
 */
router.post('/claims/:claimNumber/inward', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.registerClaimInward(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA claim inward error:', error);
    res.status(500).json({ success: false, message: 'Failed to register claim inward', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/scan
 */
router.post('/claims/:claimNumber/scan', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.scanClaim(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA claim scan error:', error);
    res.status(500).json({ success: false, message: 'Failed to scan claim', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/bill-entry
 */
router.post('/claims/:claimNumber/bill-entry', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createBillEntry(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA bill entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to create bill entry', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/adjudication
 */
router.post('/claims/:claimNumber/adjudication', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.adjudicateClaim(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA adjudication error:', error);
    res.status(500).json({ success: false, message: 'Failed to adjudicate claim', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/charge-entry
 */
router.post('/claims/:claimNumber/charge-entry', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createChargeEntry(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA charge entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to create charge entry', error: error.message });
  }
});

/**
 * POST /api/tpa/claims/:claimNumber/payment-advice
 */
router.post('/claims/:claimNumber/payment-advice', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createPaymentAdvice(req.user.id, req.params.claimNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA payment advice error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment advice', error: error.message });
  }
});

/**
 * GET /api/tpa/claims/:claimNumber/operations
 */
router.get('/claims/:claimNumber/operations', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.getClaimOperations(req.user.id, req.params.claimNumber);
    if (!result) return res.status(404).json({ success: false, message: 'Claim not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA claim operations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claim operations', error: error.message });
  }
});

/**
 * GET /api/tpa/provider-cases
 * List hospital/provider handoff cases.
 */
router.get('/provider-cases', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listProviderCases({
      tpaId: req.user.id,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (error) {
    console.error('TPA provider cases list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch provider cases', error: error.message });
  }
});

/**
 * POST /api/tpa/provider-cases
 * Create provider admission/pre-auth/discharge handoff case.
 */
router.post('/provider-cases', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.createProviderCase(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA provider case create error:', error);
    res.status(500).json({ success: false, message: 'Failed to create provider case', error: error.message });
  }
});

/**
 * POST /api/tpa/provider-cases/:caseNumber/status
 * Update provider handoff status and final-bill metadata.
 */
router.post('/provider-cases/:caseNumber/status', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.updateProviderCaseStatus(req.user.id, req.params.caseNumber, req.body, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Provider case not found' });
    res.json(result);
  } catch (error) {
    console.error('TPA provider case update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update provider case', error: error.message });
  }
});

/**
 * GET /api/tpa/interop/events
 * List NHCX/API/webhook interoperability queue events.
 */
router.get('/interop/events', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.listInteropEvents({
      tpaId: req.user.id,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (error) {
    console.error('TPA interop event list error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch interoperability events', error: error.message });
  }
});

/**
 * POST /api/tpa/interop/events
 * Queue NHCX/API/webhook event with idempotency key.
 */
router.post('/interop/events', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const result = await tpaClaimsLifecycleService.enqueueInteropEvent(req.user.id, req.body, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    console.error('TPA interop event queue error:', error);
    res.status(500).json({ success: false, message: 'Failed to queue interoperability event', error: error.message });
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
 * GET /api/tpa/reports/download/:reportId
 * Download a lightweight CSV report
 */
router.get('/reports/download/:reportId', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const generatedAt = new Date().toISOString();
    const csv = [
      ['Report ID', 'Generated At', 'Metric', 'Value'],
      [reportId, generatedAt, 'Total Claims', '1247'],
      [reportId, generatedAt, 'Pending Claims', '89'],
      [reportId, generatedAt, 'Approved Claims', '1089'],
      [reportId, generatedAt, 'Rejected Claims', '69'],
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportId}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Download TPA report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download report',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/approvals
 * Get consolidated approval queue
 */
router.get('/approvals', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const approvals = [
      {
        id: 'APR-2025-001',
        type: 'Claim',
        referenceId: 'CLM-2025-002',
        employeeName: 'Priya Sharma',
        corporate: 'Digital Marketing Inc',
        approvedAmount: 5000,
        approvedDate: '2025-01-19',
        approvedBy: 'TPA Medical Reviewer',
        status: 'approved',
        turnaroundTime: '1 day'
      },
      {
        id: 'APR-2025-002',
        type: 'Pre-Authorization',
        referenceId: 'PA-2025-002',
        employeeName: 'Priya Sharma',
        corporate: 'Digital Marketing Inc',
        approvedAmount: 180000,
        approvedDate: '2025-01-20',
        approvedBy: 'TPA Operations Lead',
        status: 'approved',
        turnaroundTime: '2 days'
      },
      {
        id: 'APR-2025-003',
        type: 'Claim',
        referenceId: 'CLM-2025-003',
        employeeName: 'Amit Patel',
        corporate: 'Manufacturing Corp',
        approvedAmount: 8500,
        approvedDate: '2025-01-21',
        approvedBy: 'Auto-Adjudication Rule',
        status: 'approved',
        turnaroundTime: '6 hours'
      }
    ];

    res.json({
      success: true,
      approvals,
      total: approvals.length
    });
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approvals',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/hospitalization-intimations
 * Get planned/emergency hospitalization intimation queue
 */
router.get('/hospitalization-intimations', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const intimations = [
      {
        id: 'INT-2025-001',
        employeeName: 'Rajesh Kumar',
        corporate: 'Tech Solutions Pvt Ltd',
        policyNumber: 'POL-2025-001',
        hospitalName: 'Apollo Hospital',
        admissionType: 'Planned',
        plannedAdmissionDate: '2025-02-01',
        ailment: 'Cardiac Surgery',
        estimatedAmount: 350000,
        slaStatus: 'Within SLA',
        status: 'pending'
      },
      {
        id: 'INT-2025-002',
        employeeName: 'Priya Sharma',
        corporate: 'Digital Marketing Inc',
        policyNumber: 'POL-2025-002',
        hospitalName: 'Max Healthcare',
        admissionType: 'Emergency',
        plannedAdmissionDate: '2025-01-25',
        ailment: 'Orthopedic Trauma',
        estimatedAmount: 180000,
        slaStatus: 'Priority Review',
        status: 'approved'
      }
    ];

    res.json({
      success: true,
      intimations,
      total: intimations.length
    });
  } catch (error) {
    console.error('Get hospitalization intimations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospitalization intimations',
      error: error.message
    });
  }
});

/**
 * POST /api/tpa/benefits/estimate
 * Estimate payable and out-of-pocket exposure
 */
router.post('/benefits/estimate', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const {
      memberId,
      policyNumber,
      hospitalName,
      treatmentType = 'Hospitalization',
      estimatedAmount = 0,
      roomCategory = 'single'
    } = req.body;

    if (!memberId || !policyNumber || !hospitalName) {
      return res.status(400).json({
        success: false,
        message: 'Member ID, policy number, and hospital name are required'
      });
    }

    const amount = Math.max(0, Number(estimatedAmount) || 0);
    const coPayRate = amount > 200000 ? 0.1 : 0.05;
    const roomRentDeduction = String(roomCategory).toLowerCase().includes('suite') ? Math.round(amount * 0.08) : 0;
    const nonPayable = Math.round(amount * 0.03);
    const coPay = Math.round(amount * coPayRate);
    const payableAmount = Math.max(0, amount - coPay - roomRentDeduction - nonPayable);

    res.json({
      success: true,
      estimate: {
        memberId,
        policyNumber,
        hospitalName,
        treatmentType,
        roomCategory,
        estimatedAmount: amount,
        payableAmount,
        outOfPocket: amount - payableAmount,
        coPay,
        roomRentDeduction,
        nonPayable,
        decision: payableAmount > 0 ? 'Likely Payable' : 'Manual Review Required',
        recommendation: amount > 300000
          ? 'Route for medical reviewer approval due to high estimate.'
          : 'Eligible for standard TPA processing if documents are complete.',
        rulesApplied: [
          `${Math.round(coPayRate * 100)}% co-pay simulation`,
          '3% non-payable consumables provision',
          roomRentDeduction ? 'Room category sub-limit adjustment' : 'No room-rent deduction applied',
          'Final payable subject to policy terms and document verification'
        ]
      }
    });
  } catch (error) {
    console.error('Benefit estimate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to estimate benefits',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/documents/intelligence
 * Get document AI worklist
 */
router.get('/documents/intelligence', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const documents = [
      {
        id: 'DOC-AI-001',
        claimId: 'CLM-2025-001',
        documentType: 'Discharge Summary',
        employeeName: 'Rajesh Kumar',
        ocrStatus: 'completed',
        completenessScore: 92,
        missingFields: 'None',
        riskSignal: 'Low',
        status: 'approved'
      },
      {
        id: 'DOC-AI-002',
        claimId: 'CLM-2025-004',
        documentType: 'Hospital Bill',
        employeeName: 'Neha Gupta',
        ocrStatus: 'completed',
        completenessScore: 71,
        missingFields: 'GSTIN, consultant signature',
        riskSignal: 'Medium',
        status: 'pending'
      }
    ];

    res.json({
      success: true,
      documents,
      total: documents.length
    });
  } catch (error) {
    console.error('Get document intelligence error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document intelligence queue',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/fraud-guard
 * Get fraud, waste, and abuse alerts
 */
router.get('/fraud-guard', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const alerts = [
      {
        id: 'FWA-2025-001',
        claimId: 'CLM-2025-004',
        employeeName: 'Neha Gupta',
        provider: 'Metro Care Hospital',
        riskScore: 78,
        trigger: 'Duplicate bill pattern and inflated consumables',
        recommendedAction: 'Manual audit before settlement',
        status: 'pending'
      },
      {
        id: 'FWA-2025-002',
        claimId: 'CLM-2025-003',
        employeeName: 'Amit Patel',
        provider: 'Fortis Hospital',
        riskScore: 22,
        trigger: 'No anomaly detected',
        recommendedAction: 'Standard processing',
        status: 'approved'
      }
    ];

    res.json({
      success: true,
      alerts,
      total: alerts.length
    });
  } catch (error) {
    console.error('Get fraud guard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fraud guard alerts',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/mis/weekly
 * Get weekly MIS report packs
 */
router.get('/mis/weekly', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const reports = [
      {
        id: 'MIS-WK-2025-004',
        title: 'Weekly Corporate Claims MIS',
        corporate: 'Tech Solutions Pvt Ltd',
        week: '2025-W04',
        claimsReceived: 34,
        claimsApproved: 29,
        pendingShortfall: 3,
        slaCompliance: '94%',
        status: 'available',
        fileUrl: '/api/tpa/reports/download/MIS-WK-2025-004'
      },
      {
        id: 'MIS-WK-2025-005',
        title: 'Weekly Pre-Auth & Cashless MIS',
        corporate: 'Digital Marketing Inc',
        week: '2025-W04',
        claimsReceived: 18,
        claimsApproved: 16,
        pendingShortfall: 1,
        slaCompliance: '97%',
        status: 'available',
        fileUrl: '/api/tpa/reports/download/MIS-WK-2025-005'
      }
    ];

    res.json({
      success: true,
      reports,
      total: reports.length
    });
  } catch (error) {
    console.error('Get weekly MIS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly MIS',
      error: error.message
    });
  }
});

/**
 * GET /api/tpa/grievances
 * Get grievance and escalation queue
 */
router.get('/grievances', authUser, requireRole('tpa'), async (req, res) => {
  try {
    const grievances = [
      {
        id: 'GRV-2025-001',
        subject: 'Claim settlement delay',
        corporate: 'Tech Solutions Pvt Ltd',
        memberName: 'Rajesh Kumar',
        priority: 'high',
        slaDueAt: '2025-01-24T18:00:00.000Z',
        escalationLevel: 'Level 2',
        owner: 'TPA Support Lead',
        status: 'open'
      },
      {
        id: 'GRV-2025-002',
        subject: 'Network hospital cashless denial',
        corporate: 'Manufacturing Corp',
        memberName: 'Amit Patel',
        priority: 'medium',
        slaDueAt: '2025-01-25T18:00:00.000Z',
        escalationLevel: 'Level 1',
        owner: 'Provider Relations',
        status: 'pending'
      }
    ];

    res.json({
      success: true,
      grievances,
      total: grievances.length
    });
  } catch (error) {
    console.error('Get grievances error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch grievances',
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
