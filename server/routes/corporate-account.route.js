/**
 * Corporate Account Layer — API routes (Module 24 completion)
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import corporateAccount from '../services/corporate-account.service.js';
import greenChannel from '../services/green-channel.service.js';

const router = express.Router();

// requireModule('corporate_health') demonstrates Workstream 12's entitlement
// enforcement end-to-end on a real module: a tenant whose Tenant.features
// JSONB has module_corporate_health === false gets a clear 403 here instead
// of silent access, closing the "config exists, zero enforcement" gap the
// audit found in tenant-module-packs.js / super-admin-tenant.route.js.
const corporateDeskOnly = [authUser, requireRole(['admin', 'hospital', 'hospital_admin', 'corporate_desk']), requireModule('corporate_health')];

const gcOrgId = (req) => req.user?.organization_id || req.user?.tenant_id || req.hospitalId;

// Every :id route runs this first: the corporate must belong to the caller's
// organization (corporates.tenant_id). Foreign ids and legacy NULL-tenant rows
// both answer 404 so existence is not disclosed. Sets req.corporateId.
const ownCorporate = async (req, res, next) => {
  try {
    const corporateId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
    if (!corporateId) return res.status(400).json({ success: false, error: 'Invalid corporate id' });
    const org = gcOrgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    if (!(await corporateAccount.assertCorporateInOrg(corporateId, org))) {
      return res.status(404).json({ success: false, error: 'Corporate not found' });
    }
    req.corporateId = corporateId;
    next();
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
const ownedCorporateDesk = [...corporateDeskOnly, ownCorporate];

// ── MoU ──────────────────────────────────────────────────────────
router.post('/corporates/:id/mou', ...ownedCorporateDesk, async (req, res) => {
  try {
    const { terms, documentUrl, effectiveDate, renewalDate } = req.body;
    const mou = await corporateAccount.addMouVersion({
      corporateId: req.corporateId, terms, documentUrl, effectiveDate, renewalDate,
      createdBy: req.user?.email || req.user?.id || 'unknown',
    });
    res.status(201).json({ success: true, data: mou });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/corporates/:id/mou', ...ownedCorporateDesk, async (req, res) => {
  try {
    const history = await corporateAccount.getMouHistory(req.corporateId);
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Rate card ────────────────────────────────────────────────────
router.post('/corporates/:id/rate-card', ...ownedCorporateDesk, async (req, res) => {
  try {
    const { rateCard, effectiveDate } = req.body;
    const version = await corporateAccount.addRateCardVersion({
      corporateId: req.corporateId, rateCard, effectiveDate,
      createdBy: req.user?.email || req.user?.id || 'unknown',
    });
    res.status(201).json({ success: true, data: version });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/corporates/:id/rate-card', ...ownedCorporateDesk, async (req, res) => {
  try {
    const rateCard = await corporateAccount.getEffectiveRateCard(req.corporateId, req.query.asOf || null);
    res.json({ success: true, data: rateCard });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── SPOC ─────────────────────────────────────────────────────────
router.post('/corporates/:id/spoc', ...ownedCorporateDesk, async (req, res) => {
  try {
    const { staffUserId } = req.body;
    if (!staffUserId) return res.status(400).json({ success: false, error: 'staffUserId is required' });
    const spoc = await corporateAccount.assignSpoc(req.corporateId, staffUserId);
    res.status(201).json({ success: true, data: spoc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/corporates/:id/spoc', ...ownedCorporateDesk, async (req, res) => {
  try {
    const spoc = await corporateAccount.getSpoc(req.corporateId);
    res.json({ success: true, data: spoc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Credit ledger ────────────────────────────────────────────────
router.post('/corporates/:id/credit-limit', ...ownedCorporateDesk, async (req, res) => {
  try {
    const { creditLimit } = req.body;
    if (creditLimit == null) return res.status(400).json({ success: false, error: 'creditLimit is required' });
    const ledger = await corporateAccount.setCreditLimit(req.corporateId, creditLimit);
    res.status(201).json({ success: true, data: ledger });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/corporates/:id/credit-status', ...ownedCorporateDesk, async (req, res) => {
  try {
    const status = await corporateAccount.getCreditStatus(req.corporateId);
    res.json({ success: true, data: status });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Consent grants — employee-controlled only; admin cannot set on someone else's behalf ──
router.post('/corporates/:id/consent', authUser, async (req, res) => {
  try {
    const { dataCategory, granted } = req.body;
    if (!dataCategory || typeof granted !== 'boolean') {
      return res.status(400).json({ success: false, error: 'dataCategory and granted (boolean) are required' });
    }
    // Only the employee themselves may set their own consent — this is
    // deliberately not delegable to admin/corporate-desk roles, per the
    // design doc's "employee-controlled, default off" requirement.
    const grant = await corporateAccount.setConsentGrant({
      employeeUserId: req.user.id, corporateId: Number(req.params.id), dataCategory, granted,
    });
    res.status(201).json({ success: true, data: grant });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Corporate desk can check what's been granted (read-only) for reporting within consented bounds.
router.get('/corporates/:id/employees/:employeeUserId/consent', ...ownedCorporateDesk, async (req, res) => {
  try {
    const categories = await corporateAccount.getGrantedCategories(Number(req.params.employeeUserId), req.corporateId);
    res.json({ success: true, data: categories });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Green channel (corporate fast-track) ─────────────────────────
// Default display mode is 'quiet' (priority nudge, no visible marker). The
// mode is a per-organization choice; clinical triage always outranks it.

router.get('/green-channel/config', ...corporateDeskOnly, async (req, res) => {
  try {
    const org = gcOrgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const [config, corporates, impact] = await Promise.all([
      greenChannel.getConfig(org),
      greenChannel.listCorporates(org),
      greenChannel.getImpactSummary(org, 30),
    ]);
    res.json({ success: true, data: { ...config, corporates, impactLast30Days: impact } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/green-channel/config', ...corporateDeskOnly, async (req, res) => {
  try {
    const org = gcOrgId(req);
    if (!org) return res.status(400).json({ success: false, error: 'Organization context missing' });
    const config = await greenChannel.setDisplayMode(org, req.body.displayMode, req.user?.email || req.user?.id);
    res.json({ success: true, data: config });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.put('/corporates/:id/green-channel', ...ownedCorporateDesk, async (req, res) => {
  try {
    const row = await greenChannel.setCorporateEnabled(gcOrgId(req), req.corporateId, req.body.enabled, req.user?.email || req.user?.id);
    if (!row) return res.status(404).json({ success: false, error: 'Corporate not found' });
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
