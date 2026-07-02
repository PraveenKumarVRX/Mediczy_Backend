/**
 * Hospital Billing Suite API
 * Multi-station cashiering, centralized billing, cash/credit/insurance, PGI, templates, audit
 */

import express from 'express';
import { verifyHospitalToken } from '../../middleware/hospitalAuth.middleware.js';
import hospitalBilling from '../../services/hospital-billing.service.js';

const router = express.Router();
router.use(verifyHospitalToken);

const ctxFrom = (req) => ({
  req,
  actorId: req.userId,
  actorName: req.hospitalUser?.name || req.hospitalUser?.email || req.userRole
});

// ── Stations ────────────────────────────────────────────────────────────────
router.get('/stations', async (req, res) => {
  try {
    const data = await hospitalBilling.listStations(req.hospitalId);
    res.json({ success: true, stations: data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/stations', async (req, res) => {
  try {
    const station = await hospitalBilling.createStation(req.hospitalId, req.body);
    res.status(201).json({ success: true, station });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Cashier sessions ────────────────────────────────────────────────────────
router.post('/sessions/open', async (req, res) => {
  try {
    const session = await hospitalBilling.openCashierSession(req.hospitalId, req.body, ctxFrom(req));
    res.status(201).json({ success: true, session });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/sessions/:sessionId/close', async (req, res) => {
  try {
    const session = await hospitalBilling.closeCashierSession(req.hospitalId, req.params.sessionId, req.body, ctxFrom(req));
    res.json({ success: true, session });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/sessions/active', async (req, res) => {
  try {
    const { stationId } = req.query;
    if (!stationId) return res.status(400).json({ success: false, message: 'stationId required' });
    const session = await hospitalBilling.getActiveSession(req.hospitalId, Number(stationId));
    res.json({ success: true, session });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Centralized dashboard ───────────────────────────────────────────────────
router.get('/centralized', async (req, res) => {
  try {
    const data = await hospitalBilling.getCentralizedDashboard(req.hospitalId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Patient account ─────────────────────────────────────────────────────────
router.get('/patients/:patientId/account', async (req, res) => {
  try {
    const data = await hospitalBilling.aggregatePatientAccount(req.hospitalId, {
      patientId: Number(req.params.patientId),
      admissionId: req.query.admissionId ? Number(req.query.admissionId) : undefined
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Templates ───────────────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    const templates = await hospitalBilling.listTemplates(req.hospitalId);
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Invoices ────────────────────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await hospitalBilling.listInvoices(req.hospitalId, req.query);
    res.json({ success: true, invoices });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const result = await hospitalBilling.createInvoice(req.hospitalId, {
      ...req.body,
      createdBy: req.userId
    }, ctxFrom(req));
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const invoice = await hospitalBilling.getInvoice(req.hospitalId, Number(req.params.invoiceId));
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, invoice });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/invoices/:invoiceId/pdf', async (req, res) => {
  try {
    const pdf = await hospitalBilling.generateInvoicePdf(req.hospitalId, Number(req.params.invoiceId), req.hospitalName);
    res.json({ success: true, pdf });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Payments (cash / card / UPI / credit / insurance) ─────────────────────
router.post('/invoices/:invoiceId/payments', async (req, res) => {
  try {
    const result = await hospitalBilling.recordPayment(req.hospitalId, Number(req.params.invoiceId), {
      ...req.body,
      receivedBy: req.userId,
      receivedByName: req.hospitalUser?.name || req.userRole
    }, ctxFrom(req));
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Auto PGI (Razorpay payment link / order) ────────────────────────────────
router.post('/invoices/:invoiceId/payment-link', async (req, res) => {
  try {
    const pgi = await hospitalBilling.createPaymentLink(req.hospitalId, Number(req.params.invoiceId), ctxFrom(req));
    res.json({ success: true, pgi });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/pgi/confirm', async (req, res) => {
  try {
    const { invoiceId, razorpayOrderId, razorpayPaymentId, signature } = req.body;
    const result = await hospitalBilling.confirmPgiPayment(req.hospitalId, {
      invoiceId: Number(invoiceId), razorpayOrderId, razorpayPaymentId, signature
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Audit trail ───────────────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const audit = await hospitalBilling.listAuditLog(req.hospitalId, req.query);
    res.json({ success: true, audit });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
