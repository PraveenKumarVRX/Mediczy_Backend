import express from 'express';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { body, param } from 'express-validator';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import { InsuranceProvider, InsurancePolicy, UserInsurance, InsuranceClaim, InsuranceProviderModel, InsurancePolicyModel } from '../models/insurance.model.intelligent.js';

// Intelligent Database query operators (replaces Sequelize Op)
const Op = {
  like: (value) => ({ $like: value }),
  gte: (value) => ({ $gte: value }),
  lte: (value) => ({ $lte: value }),
  in: (value) => ({ $in: value }),
  ne: (value) => ({ $ne: value })
};

const router = express.Router();

const safeObject = (value, fallback = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value;
};

const normalizeAddress = (address) => {
  if (!address) return {};
  if (typeof address === 'string') return { line1: address };
  return safeObject(address, {});
};

const extractProviderResources = (provider) => {
  const metadata = safeObject(provider?.metadata, {});
  const resources = safeObject(metadata.resources, {});
  const mou = safeObject(resources.mou, {});
  const soc = Array.isArray(resources.soc) ? resources.soc : [];
  const versionHistory = Array.isArray(resources.versionHistory) ? resources.versionHistory : [];

  return { metadata, resources, mou, soc, versionHistory };
};

const mapProviderForHospital = (provider) => {
  const { mou } = extractProviderResources(provider);

  return {
    ...provider.toJSON(),
    contactPerson: provider.contactPerson || provider.metadata?.contactPerson || '',
    email: provider.email || provider.contactEmail || provider.metadata?.email || '',
    phone: provider.phone || provider.contactPhone || provider.metadata?.phone || '',
    mouStart: mou.startDate || '',
    mouEnd: mou.endDate || '',
    creditDays: mou.creditDays || 30,
    tariffType: mou.tariffType || 'percentage',
    discount: Number(mou.discount || 0),
    packageDeals: !!mou.packageDeals,
    mouDocument: mou.documentName || '',
    claimSettlementRatio: Number(mou.claimSettlementRatio || 0),
    totalClaims: Number(mou.totalClaims || 0),
    pendingClaims: Number(mou.pendingClaims || 0),
    settledAmount: mou.settledAmount || '₹0'
  };
};

// ========== ADMIN ROUTES - Insurance Providers ==========

// Get all providers
router.get('/admin/providers', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const providers = await InsuranceProvider.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json({ providers: providers.map(mapProviderForHospital) });
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
    const {
      contactPerson,
      email,
      phone,
      address,
      mouStart,
      mouEnd,
      creditDays,
      tariffType,
      discount,
      packageDeals,
      mouDocument,
      ...basePayload
    } = req.body;

    const provider = await InsuranceProvider.create({
      ...basePayload,
      contactEmail: email || basePayload.contactEmail,
      contactPhone: phone || basePayload.contactPhone,
      address: normalizeAddress(address),
      metadata: {
        ...(safeObject(basePayload.metadata, {})),
        contactPerson: contactPerson || '',
        email: email || '',
        phone: phone || '',
        resources: {
          mou: {
            startDate: mouStart || null,
            endDate: mouEnd || null,
            creditDays: Number(creditDays || 30),
            tariffType: tariffType || 'percentage',
            discount: Number(discount || 0),
            packageDeals: !!packageDeals,
            documentName: mouDocument || '',
            updatedAt: new Date(),
            updatedBy: req.user?.id || null
          },
          soc: [],
          versionHistory: []
        }
      }
    });

    res.status(201).json({ provider: mapProviderForHospital(provider) });
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

    const {
      contactPerson,
      email,
      phone,
      address,
      mouStart,
      mouEnd,
      creditDays,
      tariffType,
      discount,
      packageDeals,
      mouDocument,
      ...baseUpdates
    } = req.body;

    const { metadata, resources, mou, versionHistory } = extractProviderResources(provider);
    const hasMouUpdate =
      typeof mouStart !== 'undefined' ||
      typeof mouEnd !== 'undefined' ||
      typeof creditDays !== 'undefined' ||
      typeof tariffType !== 'undefined' ||
      typeof discount !== 'undefined' ||
      typeof packageDeals !== 'undefined' ||
      typeof mouDocument !== 'undefined';

    const mergedMou = hasMouUpdate
      ? {
          ...mou,
          startDate: typeof mouStart !== 'undefined' ? mouStart : mou.startDate,
          endDate: typeof mouEnd !== 'undefined' ? mouEnd : mou.endDate,
          creditDays: typeof creditDays !== 'undefined' ? Number(creditDays || 30) : mou.creditDays,
          tariffType: typeof tariffType !== 'undefined' ? tariffType : mou.tariffType,
          discount: typeof discount !== 'undefined' ? Number(discount || 0) : Number(mou.discount || 0),
          packageDeals: typeof packageDeals !== 'undefined' ? !!packageDeals : !!mou.packageDeals,
          documentName: typeof mouDocument !== 'undefined' ? mouDocument : mou.documentName,
          updatedAt: new Date(),
          updatedBy: req.user?.id || null
        }
      : mou;

    const nextVersionHistory = hasMouUpdate
      ? [
          ...versionHistory,
          {
            type: 'mou-update',
            at: new Date(),
            by: req.user?.id || null,
            before: mou,
            after: mergedMou
          }
        ]
      : versionHistory;

    await provider.update({
      ...baseUpdates,
      contactEmail: typeof email !== 'undefined' ? email : provider.contactEmail,
      contactPhone: typeof phone !== 'undefined' ? phone : provider.contactPhone,
      address: typeof address !== 'undefined' ? normalizeAddress(address) : provider.address,
      metadata: {
        ...metadata,
        contactPerson: typeof contactPerson !== 'undefined' ? contactPerson : metadata.contactPerson,
        email: typeof email !== 'undefined' ? email : metadata.email,
        phone: typeof phone !== 'undefined' ? phone : metadata.phone,
        resources: {
          ...resources,
          mou: mergedMou,
          soc: resources.soc || [],
          versionHistory: nextVersionHistory
        }
      }
    });

    res.json({ provider: mapProviderForHospital(provider) });
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

// Get provider resources (MOU + SOC + version history)
router.get('/admin/providers/:id/resources', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt()
], async (req, res) => {
  try {
    const provider = await InsuranceProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    const { mou, soc, versionHistory } = extractProviderResources(provider);

    res.json({
      success: true,
      providerId: provider.id,
      resources: {
        mou,
        soc,
        versionHistory
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to fetch provider resources', error: e.message });
  }
});

// Save provider resources (MOU + SOC)
router.put('/admin/providers/:id/resources', authUser, requireRole(['admin', 'hospital']), [
  param('id').isInt(),
  body('mou').optional().isObject(),
  body('soc').optional().isArray()
], async (req, res) => {
  try {
    const provider = await InsuranceProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    const { metadata, resources, mou, soc, versionHistory } = extractProviderResources(provider);
    const incomingMou = safeObject(req.body.mou, {});
    const incomingSoc = Array.isArray(req.body.soc) ? req.body.soc : soc;

    const nextMou = {
      ...mou,
      ...incomingMou,
      updatedAt: new Date(),
      updatedBy: req.user?.id || null
    };

    const nextVersionHistory = [
      ...versionHistory,
      {
        type: 'resources-update',
        at: new Date(),
        by: req.user?.id || null,
        mouChanged: JSON.stringify(mou) !== JSON.stringify(nextMou),
        socChanged: JSON.stringify(soc) !== JSON.stringify(incomingSoc),
        before: { mou, soc },
        after: { mou: nextMou, soc: incomingSoc }
      }
    ];

    await provider.update({
      metadata: {
        ...metadata,
        resources: {
          ...resources,
          mou: nextMou,
          soc: incomingSoc,
          versionHistory: nextVersionHistory
        }
      }
    });

    res.json({
      success: true,
      message: 'Provider resources updated successfully',
      resources: {
        mou: nextMou,
        soc: incomingSoc,
        versionHistory: nextVersionHistory
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to update provider resources', error: e.message });
  }
});

// ========== ADMIN ROUTES - Insurance Policies ==========

// Get all policies
router.get('/admin/policies', authUser, requireRole(['admin', 'hospital']), async (req, res) => {
  try {
    const { providerId } = req.query;
    const where = providerId ? { providerId: Number(providerId) } : {};
    
    const policies = await InsurancePolicyModel.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
    // Attach provider name without a Sequelize association include
    const providerIds = [...new Set(policies.map(p => p.providerId).filter(Boolean))];
    let providerMap = {};
    if (providerIds.length > 0) {
      const providers = await InsuranceProviderModel.findAll({ where: { id: providerIds } });
      providers.forEach(p => { providerMap[p.id] = { id: p.id, name: p.name, logoUrl: p.logoUrl }; });
    }
    const policiesWithProvider = policies.map(p => ({
      ...p.toJSON(),
      provider: providerMap[p.providerId] || null
    }));
    res.json({ policies: policiesWithProvider });
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
    // The attribute list asked for "logo" and "supportedServices". The table
    // has neither: the column is logoUrl, and there is no supportedServices
    // at all — so every call to this endpoint answered 500. The model
    // (insurance.model.intelligent.js) has always been right; only this list
    // was wrong.
    const providers = await InsuranceProvider.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'code', 'logoUrl', 'website', 'contactPhone', 'metadata'],
      order: [['name', 'ASC']]
    });
    res.json({
      providers: providers.map((provider) => {
        const row = provider.toJSON ? provider.toJSON() : provider;
        return {
          ...row,
          // Kept for the clients that already read these names.
          logo: row.logoUrl ?? null,
          supportedServices: Array.isArray(row.metadata?.supportedServices)
            ? row.metadata.supportedServices
            : [],
        };
      }),
    });
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
  // NOTE: this used Sequelize includes ({ model: InsuranceProvider, as: 'provider' } etc.), but the
  // models from insurance.model.intelligent.js are createWrapper() objects (no getTableName) and have
  // no associations defined, and the InsurancePolicy model is mapped to a different schema than the
  // real insurance_policies table — so the include threw "include.model.getTableName is not a function"
  // / "column providerId does not exist" on every call, surfacing as "Unable to load insurance details".
  // Rewritten as a direct query against the real columns so it returns a proper (possibly empty) list.
  try {
    const { rows } = await pool.query(
      `SELECT ui.id, ui."userId", ui."policyId", ui."policyNumber", ui."membershipId",
              ui."startDate", ui."endDate", ui.status, ui."primaryHolder",
              ui.dependents, ui.documents, ui.metadata, ui."createdAt", ui."updatedAt",
              p."policyName", p."policyType", p."sumInsured", p.premium,
              p."policyStartDate", p."policyEndDate", p.status AS policy_status, p."insuranceCompanyId"
         FROM user_insurances ui
         LEFT JOIN insurance_policies p ON p.id = ui."policyId"
        WHERE ui."userId" = $1
        ORDER BY ui."createdAt" DESC`,
      [req.user.id]
    );
    const insurances = rows.map((r) => ({
      id: r.id, userId: r.userId, policyId: r.policyId, policyNumber: r.policyNumber,
      membershipId: r.membershipId, startDate: r.startDate, endDate: r.endDate,
      status: r.status, primaryHolder: r.primaryHolder, dependents: r.dependents,
      documents: r.documents, metadata: r.metadata, createdAt: r.createdAt, updatedAt: r.updatedAt,
      policy: r.policyId ? {
        id: r.policyId,
        name: r.policyName || null,
        type: r.policyType || null,
        coverageAmount: r.sumInsured != null ? Number(r.sumInsured) : null,
        premiumAmount: r.premium != null ? Number(r.premium) : null,
        startDate: r.policyStartDate || null,
        endDate: r.policyEndDate || null,
        status: r.policy_status || null,
        insuranceCompanyId: r.insuranceCompanyId || null,
      } : null,
    }));
    res.json({ insurances });
  } catch (e) {
    console.error('[insurance] /my/insurances failed', e);
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

// Patient's own insurance claims (the app calls GET /insurance/claims?policyId&limit).
// Raw SQL: the Sequelize InsuranceClaim model has drifted from the table (no userId column,
// timestamps:true but no createdAt column), so query the real schema and scope via the
// patient's insurances (user_insurances."userId") plus any direct patient_id linkage.
router.get('/claims', authUser, async (req, res) => {
  try {
    const policyId = req.query.policyId && /^\d+$/.test(String(req.query.policyId)) ? Number(req.query.policyId) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    // insurance_claims has FORCED row-level security: outside the member's own
    // RLS context every row is invisible, so this always returned [] before.
    const { rows } = await withRlsTransaction(pool, { userId: req.user.id }, (client) => client.query(
      `SELECT c.*
         FROM insurance_claims c
         LEFT JOIN user_insurances ui ON ui.id = c.user_insurance_id
        WHERE (ui."userId" = $1 OR c.patient_id = $1)
          AND ($2::int IS NULL OR c.user_insurance_id = $2)
        ORDER BY c.submitted_at DESC NULLS LAST
        LIMIT $3`,
      [req.user.id, policyId, limit]
    ));
    return res.json({ success: true, claims: rows });
  } catch (e) {
    console.error('[insurance] GET /claims error:', e.message);
    return res.status(500).json({ success: false, message: 'Unable to load your claims' });
  }
});

export default router;
