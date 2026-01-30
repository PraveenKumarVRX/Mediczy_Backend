import express from 'express';
import { body, param } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { InsuranceProvider, InsurancePolicy, UserInsurance, InsuranceClaim } from '../models/insurance.model.intelligent.js';

// Intelligent Database query operators (replaces Sequelize Op)
const Op = {
  like: (value) => ({ $like: value }),
  gte: (value) => ({ $gte: value }),
  lte: (value) => ({ $lte: value }),
  in: (value) => ({ $in: value }),
  ne: (value) => ({ $ne: value })
};

const router = express.Router();

// ========== ADMIN ROUTES - Insurance Providers ==========

// Get all providers
router.get('/admin/providers', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const providers = await InsuranceProvider.findAll({
      order: [['createdAt', 'DESC']],
      include: [{ 
        model: InsurancePolicy, 
        as: 'policies',
        attributes: ['id', 'policyName', 'isActive']
      }]
    });
    res.json({ providers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch providers', error: e.message });
  }
});

// Create provider
router.post('/admin/providers', authUser, requireRole(['admin', 'hospital']), [
  body('name').notEmpty(),
  body('code').optional().isString(),
], async (req, res) => {
  try {
    const provider = await InsuranceProvider.create(req.body);
    res.status(201).json({ provider });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to create provider', error: e.message });
  }
});

// Update provider
router.put('/admin/providers/:id', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt()
], async (req, res) => {
  try {
    const provider = await InsuranceProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    await provider.update(req.body);
    res.json({ provider });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update provider', error: e.message });
  }
});

// Delete provider
router.delete('/admin/providers/:id', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt()
], async (req, res) => {
  try {
    const provider = await InsuranceProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    await provider.destroy();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to delete provider', error: e.message });
  }
});

// ========== ADMIN ROUTES - Insurance Policies ==========

// Get all policies
router.get('/admin/policies', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { providerId } = req.query;
    const where = providerId ? { providerId: Number(providerId) } : {};
    
    const policies = await InsurancePolicy.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ 
        model: InsuranceProvider, 
        as: 'provider',
        attributes: ['id', 'name', 'logo']
      }]
    });
    res.json({ policies });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch policies', error: e.message });
  }
});

// Create policy
router.post('/admin/policies', authUser, requireRole(['admin', 'hospital']), [
  body('providerId').isInt(),
  body('policyName').notEmpty(),
  body('coverageAmount').isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const policy = await InsurancePolicy.create(req.body);
    res.status(201).json({ policy });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to create policy', error: e.message });
  }
});

// Update policy
router.put('/admin/policies/:id', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt()
], async (req, res) => {
  try {
    const policy = await InsurancePolicy.findByPk(req.params.id);
    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    await policy.update(req.body);
    res.json({ policy });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update policy', error: e.message });
  }
});

// Delete policy
router.delete('/admin/policies/:id', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt()
], async (req, res) => {
  try {
    const policy = await InsurancePolicy.findByPk(req.params.id);
    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    await policy.destroy();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to delete policy', error: e.message });
  }
});

// ========== ADMIN ROUTES - User Insurance Enrollments ==========

// Get all user insurances
router.get('/admin/enrollments', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { status, providerId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (providerId) where.providerId = Number(providerId);
    
    const enrollments = await UserInsurance.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: InsuranceProvider, as: 'provider', attributes: ['id', 'name', 'logo'] },
        { model: InsurancePolicy, as: 'policy', attributes: ['id', 'policyName', 'coverageAmount'] }
      ]
    });
    res.json({ enrollments });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch enrollments', error: e.message });
  }
});

// ========== ADMIN ROUTES - Insurance Claims ==========

// Get all claims
router.get('/admin/claims', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { status, claimType } = req.query;
    const where = {};
    if (status) where.status = status;
    if (claimType) where.claimType = claimType;
    
    const claims = await InsuranceClaim.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [{ 
        model: UserInsurance, 
        as: 'userInsurance',
        include: [
          { model: InsuranceProvider, as: 'provider', attributes: ['name'] },
          { model: InsurancePolicy, as: 'policy', attributes: ['policyName'] }
        ]
      }]
    });
    res.json({ claims });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch claims', error: e.message });
  }
});

// Update claim status
router.patch('/admin/claims/:id/status', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt(),
  body('status').isIn(['Submitted', 'UnderReview', 'Approved', 'Rejected', 'PartiallyApproved', 'Settled']),
], async (req, res) => {
  try {
    const claim = await InsuranceClaim.findByPk(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });
    
    const { status, approvedAmount, rejectionReason, processingNotes } = req.body;
    const updates = { status, processingNotes };
    
    if (status === 'Approved' || status === 'PartiallyApproved') {
      updates.approvedAmount = approvedAmount || claim.claimAmount;
      updates.reviewedAt = new Date();
    }
    if (status === 'Rejected') {
      updates.rejectionReason = rejectionReason;
      updates.reviewedAt = new Date();
    }
    if (status === 'Settled') {
      updates.settledAt = new Date();
    }
    
    await claim.update(updates);
    res.json({ claim });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update claim', error: e.message });
  }
});

// ========== USER ROUTES ==========

// Get active providers
router.get('/providers', async (req, res) => {
  try {
    const providers = await InsuranceProvider.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'logo', 'website', 'supportedServices'],
      order: [['name', 'ASC']]
    });
    res.json({ providers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch providers', error: e.message });
  }
});

// Get active policies by provider
router.get('/policies/:providerId', async (req, res) => {
  try {
    const policies = await InsurancePolicy.findAll({
      where: { 
        providerId: req.params.providerId,
        isActive: true 
      },
      order: [['coverageAmount', 'ASC']]
    });
    res.json({ policies });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch policies', error: e.message });
  }
});

// Get user's own insurances
router.get('/my/insurances', authUser, async (req, res) => {
  try {
    const insurances = await UserInsurance.findAll({
      where: { userId: req.user.id },
      include: [
        { model: InsuranceProvider, as: 'provider' },
        { model: InsurancePolicy, as: 'policy' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ insurances });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch insurances', error: e.message });
  }
});

// User submits a claim
router.post('/claims', authUser, [
  body('userInsuranceId').isInt(),
  body('claimAmount').isFloat({ min: 0 }),
  body('claimType').isIn(['Hospitalization', 'Pharmacy', 'Diagnostic', 'Consultation', 'Ambulance', 'Other']),
], async (req, res) => {
  try {
    const { userInsuranceId, claimAmount, claimType, treatmentDate, hospitalName, diagnosis, documents } = req.body;
    
    const userIns = await UserInsurance.findByPk(userInsuranceId);
    if (!userIns || userIns.userId !== req.user.id) {
      return res.status(404).json({ message: 'Insurance not found' });
    }
    if (userIns.status !== 'Active') {
      return res.status(400).json({ message: 'Insurance is not active' });
    }
    
    // Generate claim number
    const claimNumber = `CLM${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const claim = await InsuranceClaim.create({
      userInsuranceId,
      userId: req.user.id,
      claimNumber,
      claimAmount,
      claimType,
      treatmentDate,
      hospitalName,
      diagnosis,
      documents,
      submittedAt: new Date()
    });
    
    res.status(201).json({ claim });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to submit claim', error: e.message });
  }
});

export default router;
