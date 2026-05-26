import { Router } from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { processLabResult, getOpenAlerts, acknowledgeLabAlert, evaluateRules, getRules } from '../services/lab-rule-engine.service.js';

const router = Router();

// GET /api/v1/lab-rules — list all rules
router.get('/', authUser, async (_req, res) => {
  res.json({ success: true, data: await getRules() });
});

// POST /api/v1/lab-rules/evaluate — dry-run (no persistence)
router.post('/evaluate', authUser, async (req, res) => {
  try {
    const { labs = {}, meds = {}, diagnosis = {} } = req.body;
    const alerts = evaluateRules({ labs, meds, diagnosis });
    res.json({ success: true, data: { alertCount: alerts.length, alerts } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/lab-rules/process — persist alerts for a real lab result
router.post('/process', authUser, async (req, res) => {
  try {
    const { patientId, admissionId, labs, meds, diagnosis } = req.body;
    if (!patientId || !labs) return res.status(400).json({ success: false, message: 'patientId and labs required' });
    const alerts = await processLabResult({
      organizationId: req.user.organization_id || req.user.tenant_id || 1,
      patientId,
      admissionId,
      labs,
      meds: meds || {},
      diagnosis: diagnosis || {},
      recordedBy: req.user.id,
    });
    res.status(201).json({ success: true, data: { alertCount: alerts.length, alerts } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/lab-rules/alerts/:patientId — get open alerts for patient
router.get('/alerts/:patientId', authUser, async (req, res) => {
  try {
    const orgId = req.user.organization_id || req.user.tenant_id || 1;
    const alerts = await getOpenAlerts(orgId, parseInt(req.params.patientId));
    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/lab-rules/alerts/:alertId/acknowledge
router.put('/alerts/:alertId/acknowledge', authUser, async (req, res) => {
  try {
    const alert = await acknowledgeLabAlert(parseInt(req.params.alertId), req.user.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
