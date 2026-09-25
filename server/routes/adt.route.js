import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  admitPatient, transferPatient, dischargePatient,
  convertOpToIp, convertErToIp,
  getAdmission, getActiveAdmissions, getPatientAdtHistory, cancelAdmit,
  getDischargeReadiness, updateReadinessItem, initDischargeReadiness
} from '../services/adt.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';
import { sessionOverride } from '../utils/discharge-policy.js';

const router = express.Router();

// POST /api/v1/adt/admit
router.post('/admit', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const admission = await admitPatient({ ...req.body, organizationId, performedBy: req.user.id });
    res.status(201).json({ success: true, data: admission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/transfer
router.post('/transfer', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await transferPatient({ ...req.body, organizationId, performedBy: req.user.id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/discharge
// B4: accepts optional override: { reasonCode } — approver identity comes from the session, never the body
router.post('/discharge', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    // The approver is the authenticated caller — approverId/approverRole in the body are ignored (audit CLN-01).
    const override = sessionOverride(req.user, req.body.override);
    const result = await dischargePatient({ ...req.body, organizationId, performedBy: req.user.id, override });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code, message: err.message });
  }
});

// GET /api/v1/adt/discharge/readiness/:admissionId   B4
router.get('/discharge/readiness/:admissionId', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await getDischargeReadiness(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/discharge/readiness/:admissionId/init   B4 — seed checklist on admission
router.post('/discharge/readiness/:admissionId/init', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    await initDischargeReadiness(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, message: 'Discharge readiness checklist initialised' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/adt/discharge/readiness/:admissionId/:dimension   B4 — mark item complete
router.put('/discharge/readiness/:admissionId/:dimension', authUser, async (req, res) => {
  try {
    const result = await updateReadinessItem(parseInt(req.params.admissionId), req.params.dimension, {
      completedBy: req.user.id,
      notes: req.body.notes
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/adt/admissions
router.get('/admissions', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { wardId, status, limit, offset } = req.query;
    const admissions = await getActiveAdmissions(organizationId, {
      wardId: wardId ? parseInt(wardId) : undefined,
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });
    res.json({ success: true, data: admissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/adt/admission/:id
router.get('/admission/:id', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const admission = await getAdmission(parseInt(req.params.id), organizationId);
    if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
    res.json({ success: true, data: admission });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/adt/patient/:patientId
router.get('/patient/:patientId', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const history = await getPatientAdtHistory(parseInt(req.params.patientId), organizationId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/convert-op-to-ip
router.post('/convert-op-to-ip', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const admission = await convertOpToIp({ ...req.body, organizationId, performedBy: req.user.id });
    res.status(201).json({ success: true, data: admission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/er-to-ip
router.post('/er-to-ip', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const admission = await convertErToIp({ ...req.body, organizationId, performedBy: req.user.id });
    res.status(201).json({ success: true, data: admission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/cancel-admit
router.post('/cancel-admit', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { admissionId, reason } = req.body;
    const result = await cancelAdmit(admissionId, organizationId, req.user.id, reason);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/adt/discharge/readiness/check — document §26.4 B4
// POST version of the readiness check (used in automated discharge gate workflows)
router.post('/discharge/readiness/check', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { admissionId } = req.body;
    if (!admissionId) return res.status(400).json({ success: false, message: 'admissionId required' });
    const result = await getDischargeReadiness(parseInt(admissionId), organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
