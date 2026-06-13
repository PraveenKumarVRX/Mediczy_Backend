/**
 * X12N EDI API — HIPAA 5010
 *
 * POST /api/edi/270           Build + send eligibility inquiry
 * POST /api/edi/271           Build eligibility response (payer-side)
 * POST /api/edi/837p          Build professional claim
 * POST /api/edi/837i          Build institutional claim
 * POST /api/edi/835           Build remittance advice
 * POST /api/edi/278           Build prior authorization request
 * POST /api/edi/parse         Parse raw X12 EDI into structured JSON
 * GET  /api/edi/transactions  List EDI transactions for tenant
 * GET  /api/edi/transactions/:id  Get single transaction (with raw EDI)
 * PATCH /api/edi/transactions/:id/status  Update processing status
 *
 * Standards: ASC X12 v005010, HIPAA §162
 */

import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  ensureEdiTables,
  build270, build271,
  build837P, build837I,
  build835, build278, build999,
  parseEdi,
  saveEdiTransaction,
  listEdiTransactions,
  getEdiTransaction,
  updateEdiStatus,
} from '../services/x12n-edi.service.js';

const router = Router();

ensureEdiTables().catch(e => console.warn('[EDI] Table init warning:', e.message));

router.use(authUser);

const tenantId = (req) => req.user?.tenant_id || req.user?.organization_id || req.user?.id;

// ── 270 Eligibility Inquiry ───────────────────────────────────────────────────
router.post('/270', async (req, res) => {
  try {
    const result = build270(req.body);
    const saved  = await saveEdiTransaction(tenantId(req), {
      transactionSet: '270', direction: 'outbound',
      raw: result.raw, ...result,
      referenceId: req.body.referenceId, referenceType: 'eligibility',
    });
    res.status(201).json({ success: true, transaction: saved, edi: result.raw });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 271 Eligibility Response ──────────────────────────────────────────────────
router.post('/271', async (req, res) => {
  try {
    const result = build271(req.body);
    const saved  = await saveEdiTransaction(tenantId(req), {
      transactionSet: '271', direction: 'inbound',
      raw: result.raw, ...result,
      referenceId: req.body.referenceId, referenceType: 'eligibility',
    });
    res.status(201).json({ success: true, transaction: saved, edi: result.raw });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 837P Professional Claim ───────────────────────────────────────────────────
router.post(
  '/837p',
  requireRole('hospital_admin', 'admin', 'super_admin', 'billing_staff'),
  async (req, res) => {
    try {
      if (!req.body.npi)          return res.status(400).json({ success: false, message: 'npi is required' });
      if (!req.body.totalCharge)  return res.status(400).json({ success: false, message: 'totalCharge is required' });
      const result = build837P(req.body);
      const saved  = await saveEdiTransaction(tenantId(req), {
        transactionSet: '837P', direction: 'outbound',
        raw: result.raw, ...result,
        referenceId: req.body.referenceId, referenceType: 'claim',
      });
      res.status(201).json({ success: true, transaction: saved, edi: result.raw });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── 837I Institutional Claim ──────────────────────────────────────────────────
router.post(
  '/837i',
  requireRole('hospital_admin', 'admin', 'super_admin', 'billing_staff'),
  async (req, res) => {
    try {
      if (!req.body.npi)         return res.status(400).json({ success: false, message: 'npi is required' });
      if (!req.body.totalCharge) return res.status(400).json({ success: false, message: 'totalCharge is required' });
      const result = build837I(req.body);
      const saved  = await saveEdiTransaction(tenantId(req), {
        transactionSet: '837I', direction: 'outbound',
        raw: result.raw, ...result,
        referenceId: req.body.referenceId, referenceType: 'claim',
      });
      res.status(201).json({ success: true, transaction: saved, edi: result.raw });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── 835 Remittance Advice ─────────────────────────────────────────────────────
router.post('/835', async (req, res) => {
  try {
    const result = build835(req.body);
    const saved  = await saveEdiTransaction(tenantId(req), {
      transactionSet: '835', direction: 'inbound',
      raw: result.raw, ...result,
      referenceId: req.body.claimId, referenceType: 'remittance',
    });
    res.status(201).json({ success: true, transaction: saved, edi: result.raw });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 278 Prior Authorization ───────────────────────────────────────────────────
router.post('/278', async (req, res) => {
  try {
    if (!req.body.patientId) return res.status(400).json({ success: false, message: 'patientId is required' });
    const result = build278(req.body);
    const saved  = await saveEdiTransaction(tenantId(req), {
      transactionSet: '278', direction: 'outbound',
      raw: result.raw, ...result,
      referenceId: req.body.referenceId, referenceType: 'prior_auth',
    });
    res.status(201).json({ success: true, transaction: saved, edi: result.raw });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Parse raw EDI ─────────────────────────────────────────────────────────────
router.post('/parse', async (req, res) => {
  try {
    const { rawEdi } = req.body;
    if (!rawEdi) return res.status(400).json({ success: false, message: 'rawEdi is required' });
    const parsed = parseEdi(rawEdi);
    // Auto-generate 999 ACK for inbound transactions
    let ack999 = null;
    if (parsed.transactionCtrl && parsed.transactionSet) {
      const ack = build999(parsed.transactionCtrl, parsed.transactionSet, true);
      ack999 = ack.raw;
      await saveEdiTransaction(tenantId(req), {
        transactionSet: '999', direction: 'outbound',
        raw: ack.raw, ...ack,
        referenceId: parsed.interchangeCtrl, referenceType: 'ack',
      });
    }
    // Store parsed inbound
    const saved = await saveEdiTransaction(tenantId(req), {
      transactionSet: parsed.transactionSet || 'UNKNOWN', direction: 'inbound',
      raw: rawEdi, parsed,
    });
    res.json({ success: true, parsed, transactionId: saved.id, ack999 });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── List transactions ─────────────────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const { transactionSet, direction, status, limit } = req.query;
    const txns = await listEdiTransactions(tenantId(req), { transactionSet, direction, status, limit });
    res.json({ success: true, transactions: txns, total: txns.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get single transaction ────────────────────────────────────────────────────
router.get('/transactions/:id', async (req, res) => {
  try {
    const txn = await getEdiTransaction(Number(req.params.id), tenantId(req));
    res.json({ success: true, transaction: txn });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
});

// ── Update status ─────────────────────────────────────────────────────────────
router.patch(
  '/transactions/:id/status',
  requireRole('hospital_admin', 'admin', 'super_admin', 'billing_staff'),
  async (req, res) => {
    try {
      const { status, errorMessage } = req.body;
      const validStatuses = ['pending', 'sent', 'acknowledged', 'accepted', 'rejected', 'error'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
      }
      await updateEdiStatus(Number(req.params.id), status, errorMessage);
      res.json({ success: true, id: Number(req.params.id), status });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

export default router;
