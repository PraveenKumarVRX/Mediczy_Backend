/**
 * Hospital Billing Suite API
 * Multi-station cashiering, centralized billing, cash/credit/insurance, PGI, audit, RCM phases
 */

import express from 'express';
import crypto from 'crypto';
import pool from '../../db/pgPool.js';
import { verifyHospitalToken } from '../../middleware/hospitalAuth.middleware.js';
import { requireBillingRead, requireBillingWrite, requireBillingSupervisor } from '../../middleware/billingAuth.middleware.js';
import hospitalBilling from '../../services/hospital-billing.service.js';
import eraService from '../../services/hospital-era.service.js';
import glService from '../../services/hospital-gl.service.js';
import paymentGateway from '../../services/payment-gateway.service.js';

const router = express.Router();

const ctxFrom = (req) => ({
  req,
  actorId: req.userId,
  actorName: req.hospitalUser?.name || req.hospitalUser?.email || req.userRole,
});

// Razorpay webhook — no hospital JWT; mounted before auth middleware and whitelisted in ringFencing.
// Signature is checked over the RAW request text (captured in app.js before JSON parsing), fails closed,
// and each event is applied at most once: the event id is claimed first (payment_gateway_events),
// and the payment itself is protected by a unique (gateway, gateway_payment_id).
router.post('/pgi/webhook', async (req, res) => {
  let claimed = null;
  try {
    const raw = req.rawBody;
    if (typeof raw !== 'string' || !raw) {
      return res.status(400).json({ success: false, message: 'Webhook body was not captured' });
    }
    let signatureOk;
    try {
      signatureOk = paymentGateway.verifyRazorpayWebhook(raw, req.headers['x-razorpay-signature']);
    } catch (e) {
      console.error('[PGI webhook] not configured:', e.message);
      return res.status(503).json({ success: false, message: 'Webhook is not configured' });
    }
    if (!signatureOk) return res.status(400).json({ success: false, message: 'Invalid webhook signature' });

    let event;
    try { event = JSON.parse(raw); } catch { return res.status(400).json({ success: false, message: 'Invalid JSON' }); }
    if (event.event !== 'payment.captured') return res.json({ success: true, ignored: true });

    const payment = event.payload?.payment?.entity;
    const notes = payment?.notes || {};
    const hospitalId = Number(notes.hospitalId);
    const invoiceId = Number(notes.invoiceId);
    if (!payment?.id || !payment.order_id || !Number.isInteger(hospitalId) || !Number.isInteger(invoiceId) || hospitalId <= 0 || invoiceId <= 0) {
      return res.json({ success: true, ignored: true }); // not one of our invoice payments
    }

    // Claim the event id first; a redelivery of the same event stops here.
    const eventId = String(req.headers['x-razorpay-event-id'] || crypto.createHash('sha256').update(raw).digest('hex')).slice(0, 200);
    const { rows } = await pool.query(
      `INSERT INTO payment_gateway_events (gateway, event_id, event_type, hospital_id) VALUES ('razorpay', $1, $2, $3)
       ON CONFLICT (gateway, event_id) DO NOTHING RETURNING id`,
      [eventId, event.event, hospitalId]
    );
    if (!rows[0]) return res.json({ success: true, duplicate: true });
    claimed = rows[0].id;

    const result = await hospitalBilling.applyVerifiedPgiCapture(hospitalId, {
      invoiceId, orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount,
    });
    await pool.query(`UPDATE payment_gateway_events SET processed_at = NOW(), outcome = $2 WHERE id = $1`, [claimed, result.duplicate ? 'duplicate' : result.unapplied ? 'unapplied' : 'applied']);
    res.json({ success: true, duplicate: Boolean(result.duplicate) });
  } catch (e) {
    console.error('[PGI webhook]', e.message);
    // An event that can never apply (unknown order, another invoice's payment id, bad amount) is acknowledged
    // and kept as 'rejected' so the gateway stops retrying it; anything else is a real failure.
    if (claimed && /not found for PGI order|different invoice|amount is not valid|ids are required/i.test(e.message)) {
      await pool.query(`UPDATE payment_gateway_events SET processed_at = NOW(), outcome = 'rejected' WHERE id = $1`, [claimed]).catch(() => {});
      return res.json({ success: true, rejected: true });
    }
    // Release the claim so the gateway's retry can process this event (5xx -> retry).
    if (claimed) await pool.query(`DELETE FROM payment_gateway_events WHERE id = $1`, [claimed]).catch(() => {});
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

router.use(verifyHospitalToken);

// ── Stations ────────────────────────────────────────────────────────────────
router.get('/stations', requireBillingRead, async (req, res) => {
  try {
    const data = await hospitalBilling.listStations(req.hospitalId);
    res.json({ success: true, stations: data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/stations', requireBillingWrite, async (req, res) => {
  try {
    const station = await hospitalBilling.createStation(req.hospitalId, req.body);
    res.status(201).json({ success: true, station });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Cashier sessions ────────────────────────────────────────────────────────
router.post('/sessions/open', requireBillingWrite, async (req, res) => {
  try {
    const session = await hospitalBilling.openCashierSession(req.hospitalId, req.body, ctxFrom(req));
    res.status(201).json({ success: true, session });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/sessions/:sessionId/close', requireBillingWrite, async (req, res) => {
  try {
    const session = await hospitalBilling.closeCashierSession(req.hospitalId, req.params.sessionId, req.body, ctxFrom(req));
    res.json({ success: true, session });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/sessions/:sessionId/reconcile', requireBillingWrite, async (req, res) => {
  try {
    const result = await hospitalBilling.reconcileSession(req.hospitalId, Number(req.params.sessionId), ctxFrom(req), req.body);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/sessions/active', requireBillingRead, async (req, res) => {
  try {
    const { stationId } = req.query;
    if (!stationId) return res.status(400).json({ success: false, message: 'stationId required' });
    const session = await hospitalBilling.getActiveSession(req.hospitalId, Number(stationId));
    res.json({ success: true, session });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Centralized dashboard + CFO ─────────────────────────────────────────────
router.get('/centralized', requireBillingRead, async (req, res) => {
  try {
    const data = await hospitalBilling.getCentralizedDashboard(req.hospitalId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/cfo/dashboard', requireBillingRead, async (req, res) => {
  try {
    const data = await hospitalBilling.getCfoDashboard(req.hospitalId, req.query);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Patient account ─────────────────────────────────────────────────────────
router.get('/patients/:patientId/account', requireBillingRead, async (req, res) => {
  try {
    const data = await hospitalBilling.aggregatePatientAccount(req.hospitalId, {
      patientId: Number(req.params.patientId),
      admissionId: req.query.admissionId ? Number(req.query.admissionId) : undefined,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/patients/:patientId/statements', requireBillingWrite, async (req, res) => {
  try {
    const result = await hospitalBilling.generatePatientStatement(
      req.hospitalId,
      Number(req.params.patientId),
      req.body.admissionId ? Number(req.body.admissionId) : null,
      { deliveryMethod: req.body.deliveryMethod, actorId: req.userId }
    );
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/patients/:patientId/statements', requireBillingRead, async (req, res) => {
  try {
    const statements = await hospitalBilling.listPatientStatements(
      req.hospitalId,
      Number(req.params.patientId),
      req.query
    );
    res.json({ success: true, statements });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/patients/:patientId/statements/:statementId/deliver', requireBillingWrite, async (req, res) => {
  try {
    const channels = req.body.channels || [req.body.channel || 'sms'];
    const delivery = await hospitalBilling.deliverPatientStatement(
      req.hospitalId,
      Number(req.params.statementId),
      { channels: Array.isArray(channels) ? channels : [channels], actorId: req.userId }
    );
    res.json({ success: true, ...delivery });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Templates ───────────────────────────────────────────────────────────────
router.get('/templates', requireBillingRead, async (req, res) => {
  try {
    const templates = await hospitalBilling.listTemplates(req.hospitalId);
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Invoices ────────────────────────────────────────────────────────────────
router.get('/invoices', requireBillingRead, async (req, res) => {
  try {
    const invoices = await hospitalBilling.listInvoices(req.hospitalId, req.query);
    res.json({ success: true, invoices });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/invoices', requireBillingWrite, async (req, res) => {
  try {
    const result = await hospitalBilling.createInvoice(req.hospitalId, {
      ...req.body,
      createdBy: req.userId,
    }, ctxFrom(req));
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/invoices/:invoiceId', requireBillingRead, async (req, res) => {
  try {
    const invoice = await hospitalBilling.getInvoice(req.hospitalId, Number(req.params.invoiceId));
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, invoice });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/invoices/:invoiceId/pdf', requireBillingRead, async (req, res) => {
  try {
    const pdf = await hospitalBilling.generateInvoicePdf(req.hospitalId, Number(req.params.invoiceId), req.hospitalName);
    res.json({ success: true, pdf });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/invoices/:invoiceId/void', requireBillingSupervisor, async (req, res) => {
  try {
    const result = await hospitalBilling.voidInvoice(req.hospitalId, Number(req.params.invoiceId), ctxFrom(req), req.body.reason);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/invoices/:invoiceId/adjustments', requireBillingWrite, async (req, res) => {
  try {
    const adjustment = await hospitalBilling.createAdjustment(req.hospitalId, {
      ...req.body,
      invoiceId: Number(req.params.invoiceId),
    }, ctxFrom(req));
    res.status(201).json({ success: true, adjustment });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/payments', requireBillingRead, async (req, res) => {
  try {
    const payments = await hospitalBilling.listPayments(req.hospitalId, req.query);
    res.json({ success: true, payments });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Payments on invoice ───────────────────────────────────────────────────────
router.post('/invoices/:invoiceId/payments', requireBillingWrite, async (req, res) => {
  try {
    const result = await hospitalBilling.recordPayment(req.hospitalId, Number(req.params.invoiceId), {
      ...req.body,
      receivedBy: req.userId,
      receivedByName: req.hospitalUser?.name || req.userRole,
    }, ctxFrom(req));
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/payments/:paymentId/void', requireBillingSupervisor, async (req, res) => {
  try {
    const result = await hospitalBilling.voidPayment(req.hospitalId, Number(req.params.paymentId), ctxFrom(req), req.body.reason);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/payments/:paymentId/refund', requireBillingSupervisor, async (req, res) => {
  try {
    const result = await hospitalBilling.refundPayment(
      req.hospitalId, Number(req.params.paymentId), req.body.amount, ctxFrom(req), req.body.reason
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/payments/:paymentId/allocate', requireBillingWrite, async (req, res) => {
  try {
    const result = await hospitalBilling.allocatePayment(
      req.hospitalId, Number(req.params.paymentId), req.body.allocations, ctxFrom(req)
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Credit accounts ─────────────────────────────────────────────────────────
router.post('/credit-accounts/:id/approve', requireBillingSupervisor, async (req, res) => {
  try {
    const account = await hospitalBilling.approveCreditAccount(req.hospitalId, Number(req.params.id), ctxFrom(req), req.body);
    res.json({ success: true, account });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── ERA / Insurance remittance ────────────────────────────────────────────────
router.post('/era/post', requireBillingWrite, async (req, res) => {
  try {
    const result = await eraService.postEraRemittance(req.hospitalId, req.body, {
      id: req.userId, name: req.hospitalUser?.name, req,
    });
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.get('/era', requireBillingRead, async (req, res) => {
  try {
    const postings = await eraService.listEraPostings(req.hospitalId, req.query);
    res.json({ success: true, postings });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── GL journal ────────────────────────────────────────────────────────────────
router.get('/gl/export', requireBillingRead, async (req, res) => {
  try {
    const data = await glService.exportGlJournal(req.hospitalId, req.query);
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/gl/summary', requireBillingRead, async (req, res) => {
  try {
    const data = await glService.getGlSummary(req.hospitalId, req.query);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Billing period close ──────────────────────────────────────────────────────
router.post('/periods/close', requireBillingSupervisor, async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.body;
    const result = await hospitalBilling.closeBillingPeriod(req.hospitalId, periodStart, periodEnd, ctxFrom(req));
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Auto PGI ──────────────────────────────────────────────────────────────────
router.post('/invoices/:invoiceId/payment-link', requireBillingWrite, async (req, res) => {
  try {
    const pgi = await hospitalBilling.createPaymentLink(req.hospitalId, Number(req.params.invoiceId), ctxFrom(req));
    res.json({ success: true, pgi });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/pgi/confirm', requireBillingWrite, async (req, res) => {
  try {
    const { invoiceId, razorpayOrderId, razorpayPaymentId, signature } = req.body;
    const result = await hospitalBilling.confirmPgiPayment(req.hospitalId, {
      invoiceId: Number(invoiceId), razorpayOrderId, razorpayPaymentId, signature,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Denial management (Wave 2) ────────────────────────────────────────────────
router.get('/denials', requireBillingRead, async (req, res) => {
  try {
    const denialService = (await import('../../services/denial-management.service.js')).default;
    const denials = await denialService.listDenials(req.hospitalId, req.query);
    res.json({ success: true, denials });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/denials', requireBillingWrite, async (req, res) => {
  try {
    const denialService = (await import('../../services/denial-management.service.js')).default;
    const denial = await denialService.createDenial(req.hospitalId, req.body, req.userId);
    res.status(201).json({ success: true, denial });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/denials/:id/appeal', requireBillingWrite, async (req, res) => {
  try {
    const denialService = (await import('../../services/denial-management.service.js')).default;
    const result = await denialService.draftAppeal(req.hospitalId, Number(req.params.id), req.userId);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/denials/:id/resolve', requireBillingWrite, async (req, res) => {
  try {
    const denialService = (await import('../../services/denial-management.service.js')).default;
    const result = await denialService.resolveDenial(
      req.hospitalId,
      Number(req.params.id),
      { resolution: req.body.resolution, notes: req.body.notes },
      req.userId
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Audit trail ───────────────────────────────────────────────────────────
router.get('/audit', requireBillingRead, async (req, res) => {
  try {
    const audit = await hospitalBilling.listAuditLog(req.hospitalId, req.query);
    res.json({ success: true, audit });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
