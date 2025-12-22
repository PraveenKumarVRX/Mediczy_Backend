/**
 * Insurance Policy & Claims Management Routes with Rule Engine
 * Handles insurance companies, brokers, TPAs, policies, and claims
 */

import express from 'express';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import {
  InsurancePolicy,
  PolicyRule,
  InsuranceClaim,
  PolicyMember
} from '../models/insurance-policy.model.intelligent.js';
import PolicyRuleEngine from '../services/policy-rule-engine.service.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// ============================================================================
// INSURANCE POLICY ROUTES
// ============================================================================

/**
 * Create new insurance policy
 * POST /api/insurance-policies/policies
 */
router.post('/policies', authUser, requireRole(['admin', 'insurance_company']), async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const {
      policyNumber,
      policyName,
      insuranceCompanyId,
      brokerId,
      tpaId,
      corporateId,
      policyType,
      sumInsured,
      premium,
      policyStartDate,
      policyEndDate,
      coverageConfig,
      limits,
      waitingPeriods,
      networkConfig,
      exclusions,
      addons,
      termsAndConditions
    } = req.body;
    
    // Create policy
    const policy = await InsurancePolicy.create({
      policyNumber,
      policyName,
      insuranceCompanyId,
      brokerId,
      tpaId,
      corporateId,
      policyType,
      sumInsured,
      premium,
      policyStartDate,
      policyEndDate,
      status: 'draft',
      coverageConfig: coverageConfig || {},
      limits: limits || {},
      waitingPeriods: waitingPeriods || {},
      networkConfig: networkConfig || {},
      exclusions: exclusions || {},
      addons: addons || [],
      termsAndConditions
    }, { transaction: t });
    
    // Create default policy rules
    await createDefaultPolicyRules(policy.id, t);
    
    await t.commit();
    
    res.status(201).json({
      success: true,
      message: 'Insurance policy created successfully',
      policy
    });
  } catch (error) {
    await t.rollback();
    console.error('Create policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create policy',
      error: error.message
    });
  }
});

/**
 * Get all policies with filters
 * GET /api/insurance-policies/policies
 */
router.get('/policies', authUser, async (req, res) => {
  try {
    const {
      insuranceCompanyId,
      brokerId,
      tpaId,
      corporateId,
      status,
      policyType,
      page = 1,
      limit = 20
    } = req.query;
    
    const whereClause = {};
    
    if (insuranceCompanyId) whereClause.insuranceCompanyId = insuranceCompanyId;
    if (brokerId) whereClause.brokerId = brokerId;
    if (tpaId) whereClause.tpaId = tpaId;
    if (corporateId) whereClause.corporateId = corporateId;
    if (status) whereClause.status = status;
    if (policyType) whereClause.policyType = policyType;
    
    const offset = (page - 1) * limit;
    
    const { rows: policies, count: total } = await InsurancePolicy.findAndCountAll({
      where: whereClause,
      include: [
        {
          association: 'policyRules',
          attributes: ['id', 'ruleCode', 'ruleName', 'ruleCategory']
        },
        {
          association: 'members',
          attributes: ['id', 'userId', 'relationship', 'isActive']
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      policies,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
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
 * Get policy by ID
 * GET /api/insurance-policies/policies/:id
 */
router.get('/policies/:id', authUser, async (req, res) => {
  try {
    const policy = await InsurancePolicy.findByPk(req.params.id, {
      include: [
        {
          association: 'policyRules',
          order: [['priority', 'ASC']]
        },
        {
          association: 'members'
        },
        {
          association: 'claims'
        }
      ]
    });
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    res.json({
      success: true,
      policy
    });
  } catch (error) {
    console.error('Get policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policy',
      error: error.message
    });
  }
});

/**
 * Update policy
 * PUT /api/insurance-policies/policies/:id
 */
router.put('/policies/:id', authUser, requireRole(['admin', 'insurance_company']), async (req, res) => {
  try {
    const policy = await InsurancePolicy.findByPk(req.params.id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    await policy.update(req.body);
    
    res.json({
      success: true,
      message: 'Policy updated successfully',
      policy
    });
  } catch (error) {
    console.error('Update policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update policy',
      error: error.message
    });
  }
});

/**
 * Activate policy
 * POST /api/insurance-policies/policies/:id/activate
 */
router.post('/policies/:id/activate', authUser, requireRole(['admin', 'insurance_company']), async (req, res) => {
  try {
    const policy = await InsurancePolicy.findByPk(req.params.id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    await policy.update({ status: 'active' });
    
    res.json({
      success: true,
      message: 'Policy activated successfully',
      policy
    });
  } catch (error) {
    console.error('Activate policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate policy',
      error: error.message
    });
  }
});

// ============================================================================
// POLICY RULES ROUTES
// ============================================================================

/**
 * Create policy rule
 * POST /api/insurance-policies/policies/:policyId/rules
 */
router.post('/policies/:policyId/rules', authUser, requireRole(['admin', 'insurance_company']), async (req, res) => {
  try {
    const {
      ruleCode,
      ruleName,
      ruleCategory,
      parameters,
      condition,
      action,
      priority,
      version
    } = req.body;
    
    const rule = await PolicyRule.create({
      policyId: req.params.policyId,
      ruleCode,
      ruleName,
      ruleCategory,
      parameters: parameters || {},
      condition,
      action,
      priority: priority || 100,
      version: version || '1.0',
      isActive: true,
      effectiveFrom: new Date()
    });
    
    res.status(201).json({
      success: true,
      message: 'Policy rule created successfully',
      rule
    });
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create rule',
      error: error.message
    });
  }
});

/**
 * Get policy rules
 * GET /api/insurance-policies/policies/:policyId/rules
 */
router.get('/policies/:policyId/rules', authUser, async (req, res) => {
  try {
    const { category } = req.query;
    
    const whereClause = { policyId: req.params.policyId };
    if (category) whereClause.ruleCategory = category;
    
    const rules = await PolicyRule.findAll({
      where: whereClause,
      order: [['priority', 'ASC']]
    });
    
    res.json({
      success: true,
      rules
    });
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rules',
      error: error.message
    });
  }
});

/**
 * Update policy rule
 * PUT /api/insurance-policies/policies/:policyId/rules/:ruleId
 */
router.put('/policies/:policyId/rules/:ruleId', authUser, requireRole(['admin', 'insurance_company']), async (req, res) => {
  try {
    const rule = await PolicyRule.findOne({
      where: {
        id: req.params.ruleId,
        policyId: req.params.policyId
      }
    });
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }
    
    await rule.update(req.body);
    
    res.json({
      success: true,
      message: 'Rule updated successfully',
      rule
    });
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rule',
      error: error.message
    });
  }
});

/**
 * Evaluate policy rules
 * POST /api/insurance-policies/policies/:policyId/evaluate
 */
router.post('/policies/:policyId/evaluate', authUser, async (req, res) => {
  try {
    const { context, category } = req.body;
    
    const evaluation = await PolicyRuleEngine.evaluateRules(
      req.params.policyId,
      context,
      category
    );
    
    res.json({
      success: true,
      evaluation
    });
  } catch (error) {
    console.error('Evaluate rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to evaluate rules',
      error: error.message
    });
  }
});

// ============================================================================
// POLICY MEMBER ROUTES
// ============================================================================

/**
 * Add member to policy
 * POST /api/insurance-policies/policies/:policyId/members
 */
router.post('/policies/:policyId/members', authUser, async (req, res) => {
  try {
    const {
      userId,
      relationship,
      coverageStartDate,
      coverageEndDate,
      individualSumInsured,
      preExistingDiseases
    } = req.body;
    
    const policy = await InsurancePolicy.findByPk(req.params.policyId);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    const member = await PolicyMember.create({
      policyId: req.params.policyId,
      userId,
      relationship,
      isActive: true,
      coverageStartDate: coverageStartDate || policy.policyStartDate,
      coverageEndDate: coverageEndDate || policy.policyEndDate,
      individualSumInsured: individualSumInsured || policy.sumInsured,
      preExistingDiseases: preExistingDiseases || [],
      sumInsuredUsed: 0,
      sumInsuredRemaining: individualSumInsured || policy.sumInsured
    });
    
    res.status(201).json({
      success: true,
      message: 'Member added successfully',
      member
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add member',
      error: error.message
    });
  }
});

/**
 * Get policy members
 * GET /api/insurance-policies/policies/:policyId/members
 */
router.get('/policies/:policyId/members', authUser, async (req, res) => {
  try {
    const members = await PolicyMember.findAll({
      where: { policyId: req.params.policyId }
    });
    
    res.json({
      success: true,
      members
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

// ============================================================================
// INSURANCE CLAIM ROUTES
// ============================================================================

/**
 * Create insurance claim
 * POST /api/insurance-policies/claims
 */
router.post('/claims', authUser, async (req, res) => {
  try {
    const {
      policyId,
      patientId,
      hospitalId,
      claimType,
      treatmentType,
      admissionDate,
      dischargeDate,
      diagnosis,
      icdCode,
      claimedAmount,
      documents
    } = req.body;
    
    // Generate claim number
    const claimNumber = `CLM${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const claim = await InsuranceClaim.create({
      claimNumber,
      policyId,
      patientId,
      hospitalId,
      claimType,
      treatmentType,
      admissionDate,
      dischargeDate,
      diagnosis,
      icdCode,
      claimedAmount,
      approvedAmount: 0,
      deductedAmount: 0,
      settledAmount: 0,
      documents: documents || [],
      status: 'initiated',
      intimationDate: new Date(),
      ruleEvaluationResult: {}
    });
    
    res.status(201).json({
      success: true,
      message: 'Claim created successfully',
      claim
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create claim',
      error: error.message
    });
  }
});

/**
 * Get all claims with filters
 * GET /api/insurance-policies/claims
 */
router.get('/claims', authUser, async (req, res) => {
  try {
    const {
      policyId,
      patientId,
      hospitalId,
      tpaId,
      status,
      claimType,
      page = 1,
      limit = 20
    } = req.query;
    
    const whereClause = {};
    
    if (policyId) whereClause.policyId = policyId;
    if (patientId) whereClause.patientId = patientId;
    if (hospitalId) whereClause.hospitalId = hospitalId;
    if (tpaId) whereClause.tpaId = tpaId;
    if (status) whereClause.status = status;
    if (claimType) whereClause.claimType = claimType;
    
    const offset = (page - 1) * limit;
    
    const { rows: claims, count: total } = await InsuranceClaim.findAndCountAll({
      where: whereClause,
      include: [
        {
          association: 'policy',
          attributes: ['id', 'policyNumber', 'policyName']
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      claims,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
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
 * Get claim by ID
 * GET /api/insurance-policies/claims/:id
 */
router.get('/claims/:id', authUser, async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.id, {
      include: [
        {
          association: 'policy',
          include: ['policyRules']
        }
      ]
    });
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    res.json({
      success: true,
      claim
    });
  } catch (error) {
    console.error('Get claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim',
      error: error.message
    });
  }
});

/**
 * Adjudicate claim (run rule engine)
 * POST /api/insurance-policies/claims/:id/adjudicate
 */
router.post('/claims/:id/adjudicate', authUser, requireRole(['admin', 'tpa', 'insurance_company']), async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    // Run claim through rule engine
    const adjudication = await PolicyRuleEngine.adjudicateClaim(claim.id);
    
    // Update claim with adjudication results
    await claim.update({
      approvedAmount: adjudication.approvedAmount,
      deductedAmount: adjudication.deductedAmount,
      settledAmount: adjudication.approvedAmount,
      deductions: adjudication.deductions,
      ruleEvaluationResult: adjudication.evaluation,
      status: adjudication.status
    });
    
    res.json({
      success: true,
      message: 'Claim adjudicated successfully',
      adjudication
    });
  } catch (error) {
    console.error('Adjudicate claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjudicate claim',
      error: error.message
    });
  }
});

/**
 * Update claim status
 * PUT /api/insurance-policies/claims/:id/status
 */
router.put('/claims/:id/status', authUser, requireRole(['admin', 'tpa', 'insurance_company']), async (req, res) => {
  try {
    const { status, remarks, rejectionReason } = req.body;
    
    const claim = await InsuranceClaim.findByPk(req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    const updateData = { status };
    
    if (remarks) updateData.remarks = remarks;
    if (rejectionReason) updateData.rejectionReason = rejectionReason;
    
    if (status === 'settled') {
      updateData.settlementDate = new Date();
    }
    
    await claim.update(updateData);
    
    res.json({
      success: true,
      message: 'Claim status updated successfully',
      claim
    });
  } catch (error) {
    console.error('Update claim status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update claim status',
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create default policy rules for a new policy
 */
async function createDefaultPolicyRules(policyId, transaction) {
  const defaultRules = [
    // Eligibility Rules
    {
      ruleCode: 'ELIG_FAMILY_DEF',
      ruleName: 'Family Definition',
      ruleCategory: 'eligibility',
      parameters: {
        allowed_relations: ['self', 'spouse', 'son', 'daughter', 'father', 'mother'],
        max_members: 6
      },
      priority: 10
    },
    {
      ruleCode: 'ELIG_ENTRY_AGE',
      ruleName: 'Entry Age Validation',
      ruleCategory: 'eligibility',
      parameters: {
        min_age: 18,
        max_age: 65
      },
      priority: 11
    },
    
    // Waiting Period Rules
    {
      ruleCode: 'WAIT_INITIAL_30',
      ruleName: 'Initial 30 Days Waiting Period',
      ruleCategory: 'waiting_period',
      parameters: { exceptions: ['accident'] },
      priority: 20
    },
    {
      ruleCode: 'WAIT_PED',
      ruleName: 'Pre-Existing Disease Waiting',
      ruleCategory: 'waiting_period',
      parameters: { waiting_period_months: 36 },
      priority: 21
    },
    
    // Hospitalization Rules
    {
      ruleCode: 'ROOM_RENT_LIMIT',
      ruleName: 'Room Rent Limit',
      ruleCategory: 'claims',
      parameters: { room_cap: null, icu_cap: null },
      priority: 30
    },
    {
      ruleCode: 'HOSP_MIN_DURATION',
      ruleName: 'Minimum Hospitalization Duration',
      ruleCategory: 'coverage',
      parameters: { min_hours: 24, exceptions: ['day_care'] },
      priority: 31
    },
    
    // Financial Rules
    {
      ruleCode: 'DEDUCTIBLE',
      ruleName: 'Policy Deductible',
      ruleCategory: 'financial',
      parameters: { per_claim: 0, aggregate: 0 },
      priority: 40
    },
    {
      ruleCode: 'COPAY',
      ruleName: 'Co-Payment',
      ruleCategory: 'financial',
      parameters: { percentage: 0 },
      priority: 41
    },
    
    // Network Rules
    {
      ruleCode: 'CASHLESS',
      ruleName: 'Cashless Facility',
      ruleCategory: 'network',
      parameters: { ppn_required: true },
      priority: 50
    }
  ];
  
  const rules = defaultRules.map(rule => ({
    ...rule,
    policyId,
    isActive: true,
    version: '1.0',
    effectiveFrom: new Date()
  }));
  
  await PolicyRule.bulkCreate(rules, { transaction });
}

export default router;
