import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  scheduleFollowUp, getFollowUpsByPatient, updateFollowUpStatus,
  recordRecoveryCheckin, getCheckinsByPatient,
  getActiveAlerts, acknowledgeAlert, resolveAlert, raiseMonitoringAlert,
  submitPatientFeedback,
  recordOutcome, getOutcomesByPatient
} from '../services/follow-up-hmis.service.js';

const router = express.Router();

// ── Follow-up scheduling ──────────────────────────────────────────────────────

// POST /api/v1/follow-up/schedule
router.post('/schedule', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await scheduleFollowUp({ ...req.body, organizationId, scheduledBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/follow-up/patient/:patientId
router.get('/patient/:patientId', authUser, async (req, res) => {
  try {
    const data = await getFollowUpsByPatient(parseInt(req.params.patientId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/follow-up/:planId/status
router.patch('/:planId/status', authUser, async (req, res) => {
  try {
    const result = await updateFollowUpStatus(parseInt(req.params.planId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Recovery check-ins ────────────────────────────────────────────────────────

// POST /api/v1/recovery/check-in
router.post('/check-in', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await recordRecoveryCheckin({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/recovery/patient/:patientId
router.get('/patient/:patientId/checkins', authUser, async (req, res) => {
  try {
    const { limit } = req.query;
    const data = await getCheckinsByPatient(parseInt(req.params.patientId), { limit: limit ? parseInt(limit) : 20 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Monitoring alerts ─────────────────────────────────────────────────────────

// GET /api/v1/recovery/alerts
router.get('/alerts', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { patientId, severity } = req.query;
    const data = await getActiveAlerts(organizationId, {
      patientId: patientId ? parseInt(patientId) : undefined,
      severity
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/recovery/alerts/:alertId/acknowledge
router.put('/alerts/:alertId/acknowledge', authUser, async (req, res) => {
  try {
    const result = await acknowledgeAlert(parseInt(req.params.alertId), { acknowledgedBy: req.user.id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/recovery/alerts/:alertId/resolve
router.put('/alerts/:alertId/resolve', authUser, async (req, res) => {
  try {
    const result = await resolveAlert(parseInt(req.params.alertId));
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/recovery/alerts
router.post('/alerts', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await raiseMonitoringAlert({ ...req.body, organizationId, triggeredBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Patient feedback ──────────────────────────────────────────────────────────

// POST /api/v1/follow-up/feedback
router.post('/feedback', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await submitPatientFeedback({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Clinical outcomes ─────────────────────────────────────────────────────────

// POST /api/v1/follow-up/outcome
router.post('/outcome', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await recordOutcome({ ...req.body, organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/follow-up/outcome/patient/:patientId
router.get('/outcome/patient/:patientId', authUser, async (req, res) => {
  try {
    const data = await getOutcomesByPatient(parseInt(req.params.patientId));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
