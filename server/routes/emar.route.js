import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createMedicationOrder, recordAdministration, validateAdministration,
  getActiveOrders, getDueMedications, updateOrderStatus
} from '../services/emar.service.js';
import { enforceHighAlertMedConsent } from '../services/consent-enforcement.service.js';

const router = express.Router();

// POST /api/v1/emar/orders
router.post('/orders', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const order = await createMedicationOrder({ ...req.body, organizationId, prescribedBy: req.user.id });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/emar/orders/:admissionId
router.get('/orders/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const orders = await getActiveOrders(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/emar/validate-administration   B3: pre-flight safety check
router.post('/validate-administration', authUser, async (req, res) => {
  try {
    const result = await validateAdministration(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/emar/administer  — B3 + B7: 5-rights + consent enforcement
router.post('/administer', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;

    // B7: pre-validate to check if high-alert, then enforce consent
    const preCheck = await validateAdministration(req.body).catch(() => ({ blocked: false, highAlert: false }));
    if (preCheck.highAlert) {
      const consentOverride = req.body.consentOverride
        ? { ...req.body.consentOverride, approverId: req.body.consentOverride.approverId || req.user.id, approverRole: req.body.consentOverride.approverRole || req.user.role }
        : null;
      await enforceHighAlertMedConsent({
        organizationId, patientId: req.body.patientId,
        drugName: req.body.drugName || 'unknown', override: consentOverride
      });
    }

    const result = await recordAdministration({ ...req.body, administeredBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const status = (err.blocked || err.consentBlocked) ? 403 : 400;
    res.status(status).json({
      success: false, message: err.message,
      blocked: !!err.blocked, reasons: err.reasons,
      consentBlocked: err.consentBlocked || false
    });
  }
});

// GET /api/v1/emar/due
router.get('/due', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { wardId, windowMinutes } = req.query;
    const due = await getDueMedications(organizationId, {
      wardId: wardId ? parseInt(wardId) : undefined,
      windowMinutes: windowMinutes ? parseInt(windowMinutes) : 120
    });
    res.json({ success: true, count: due.length, data: due });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/emar/due/:admissionId  (admission-scoped alias)
router.get('/due/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const due = await getDueMedications(organizationId, { admissionId: parseInt(req.params.admissionId) });
    res.json({ success: true, count: due.length, data: due });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/emar/history/:admissionId
router.get('/history/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const orders = await getActiveOrders(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/emar/:orderId/administer  (order-scoped alias)
router.post('/:orderId/administer', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const preCheck = await validateAdministration({ ...req.body, orderId: parseInt(req.params.orderId) }).catch(() => ({ blocked: false, highAlert: false }));
    if (preCheck.highAlert) {
      const consentOverride = req.body.consentOverride
        ? { ...req.body.consentOverride, approverId: req.body.consentOverride.approverId || req.user.id, approverRole: req.body.consentOverride.approverRole || req.user.role }
        : null;
      await enforceHighAlertMedConsent({ organizationId, patientId: req.body.patientId, drugName: req.body.drugName || 'unknown', override: consentOverride });
    }
    const result = await recordAdministration({ ...req.body, orderId: parseInt(req.params.orderId), administeredBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const status = (err.blocked || err.consentBlocked) ? 403 : 400;
    res.status(status).json({ success: false, message: err.message, blocked: !!err.blocked, reasons: err.reasons, consentBlocked: err.consentBlocked || false });
  }
});

// POST /api/v1/emar/:orderId/hold  (order-scoped alias)
router.post('/:orderId/hold', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await updateOrderStatus(organizationId, parseInt(req.params.orderId), 'on_hold', req.body.holdReason);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/emar/orders/:id/hold
router.put('/orders/:id/hold', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await updateOrderStatus(organizationId, parseInt(req.params.id), 'on_hold', req.body.reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/emar/orders/:id/discontinue
router.put('/orders/:id/discontinue', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await updateOrderStatus(organizationId, parseInt(req.params.id), 'discontinued', req.body.reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
