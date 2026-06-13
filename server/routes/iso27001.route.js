/**
 * ISO/IEC 27001:2022 ISMS Control Registry API
 *
 * GET  /api/iso27001/controls                 All 93 controls with tenant evidence status
 * GET  /api/iso27001/controls/:controlId      Single control with evidence detail
 * POST /api/iso27001/controls/:controlId/evidence  Submit / update control evidence
 * GET  /api/iso27001/scorecard                Domain-level maturity scorecard
 * GET  /api/iso27001/soa                      Statement of Applicability export
 * GET  /api/iso27001/risks                    Risk register
 * POST /api/iso27001/risks                    Add risk
 * PATCH /api/iso27001/risks/:id              Update risk treatment / residual score
 */

import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  ensureIso27001Tables,
  listControls,
  getControlDetail,
  upsertControlEvidence,
  getMaturityScorecard,
  generateSoA,
  addRisk,
  listRisks,
  updateRisk,
} from '../services/iso27001.service.js';

const router = Router();

ensureIso27001Tables().catch(e => console.warn('[ISO27001] Table init warning:', e.message));

router.use(authUser);

const tenantId = (req) => req.user?.tenant_id || req.user?.organization_id || req.user?.id;

// ── List controls ─────────────────────────────────────────────────────────────
router.get('/controls', async (req, res) => {
  try {
    const { domain, applicability, status } = req.query;
    const controls = await listControls(tenantId(req), { domain, applicability, status });
    res.json({ success: true, controls, total: controls.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Control detail ────────────────────────────────────────────────────────────
router.get('/controls/:controlId', async (req, res) => {
  try {
    const control = await getControlDetail(req.params.controlId, tenantId(req));
    res.json({ success: true, control });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
});

// ── Submit evidence ───────────────────────────────────────────────────────────
router.post(
  '/controls/:controlId/evidence',
  requireRole('hospital_admin', 'admin', 'super_admin', 'quality_manager', 'security_officer'),
  async (req, res) => {
    try {
      const controlId = req.params.controlId;
      const validApplicability = ['applicable', 'not_applicable', 'not_assessed'];
      const validStatus = ['not_started', 'partial', 'in_place', 'not_applicable'];
      const { applicability, implementationStatus } = req.body;
      if (applicability && !validApplicability.includes(applicability)) {
        return res.status(400).json({ success: false, message: `applicability must be one of: ${validApplicability.join(', ')}` });
      }
      if (implementationStatus && !validStatus.includes(implementationStatus)) {
        return res.status(400).json({ success: false, message: `implementationStatus must be one of: ${validStatus.join(', ')}` });
      }
      const result = await upsertControlEvidence(tenantId(req), controlId, {
        ...req.body, reviewedBy: req.user?.id,
      });
      res.status(201).json({ success: true, evidence: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── Maturity scorecard ────────────────────────────────────────────────────────
router.get('/scorecard', async (req, res) => {
  try {
    const scorecard = await getMaturityScorecard(tenantId(req));
    res.json({ success: true, ...scorecard });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Statement of Applicability ────────────────────────────────────────────────
router.get('/soa', async (req, res) => {
  try {
    const soa = await generateSoA(tenantId(req));
    if (req.query.format === 'json') {
      return res.json({ success: true, soa });
    }
    // Default: JSON (CSV/PDF generation can be added later)
    res.json({ success: true, soa });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Risk register: list ───────────────────────────────────────────────────────
router.get('/risks', async (req, res) => {
  try {
    const { status, treatment, limit } = req.query;
    const risks = await listRisks(tenantId(req), { status, treatment, limit });
    res.json({ success: true, risks, total: risks.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Risk register: add ────────────────────────────────────────────────────────
router.post(
  '/risks',
  requireRole('hospital_admin', 'admin', 'super_admin', 'quality_manager', 'security_officer'),
  async (req, res) => {
    try {
      const { riskTitle } = req.body;
      if (!riskTitle) return res.status(400).json({ success: false, message: 'riskTitle is required' });
      const risk = await addRisk(tenantId(req), req.body);
      res.status(201).json({ success: true, risk });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── Risk register: update ─────────────────────────────────────────────────────
router.patch(
  '/risks/:id',
  requireRole('hospital_admin', 'admin', 'super_admin', 'quality_manager', 'security_officer'),
  async (req, res) => {
    try {
      const risk = await updateRisk(Number(req.params.id), tenantId(req), req.body);
      res.json({ success: true, risk });
    } catch (err) {
      const code = err.message === 'Risk not found' ? 404 : 500;
      res.status(code).json({ success: false, message: err.message });
    }
  }
);

export default router;
