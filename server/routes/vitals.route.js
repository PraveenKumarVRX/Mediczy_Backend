import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  saveVitals, getVitalsTrend, getActiveAlerts,
  acknowledgeAlert, resolveAlert, getLatestVitals
} from '../services/vitals-ews.service.js';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

const router = express.Router();

// POST /api/v1/vitals
router.post('/', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const record = await saveVitals({ ...req.body, organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/:admissionId/trend
router.get('/:admissionId/trend', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { hours } = req.query;
    const trend = await getVitalsTrend(parseInt(req.params.admissionId), organizationId, { hours: hours ? parseInt(hours) : 24 });
    res.json({ success: true, data: trend });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/:admissionId/latest
router.get('/:admissionId/latest', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const latest = await getLatestVitals(parseInt(req.params.admissionId), organizationId);
    res.json({ success: true, data: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/alerts
router.get('/alerts', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { admissionId, wardId, severity } = req.query;
    const alerts = await getActiveAlerts(organizationId, {
      admissionId: admissionId ? parseInt(admissionId) : undefined,
      wardId: wardId ? parseInt(wardId) : undefined,
      severity
    });
    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/vitals/alerts/:id/acknowledge
router.post('/alerts/:id/acknowledge', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await acknowledgeAlert(parseInt(req.params.id), organizationId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/vitals/alerts/:id/resolve
router.post('/alerts/:id/resolve', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await resolveAlert(parseInt(req.params.id), organizationId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/vitals/clinical-alerts — document §8 Phase 2: unified clinical alert feed
// Merges vitals EWS alerts + lab CDSS rule alerts into one feed
router.get('/clinical-alerts', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const { patientId, admissionId, severity, limit = 50 } = req.query;

    const [vitalsAlerts, labAlerts] = await Promise.all([
      getActiveAlerts(organizationId, {
        admissionId: admissionId ? parseInt(admissionId) : undefined,
        severity
      }),
      sequelize.query(
        `SELECT id, patient_id, admission_id, rule_id, rule_name, severity, title, message,
                guideline, lab_values, status, created_at, acknowledged_at
         FROM lab_rule_alerts
         WHERE organization_id = :orgId
           ${patientId ? 'AND patient_id = :patientId' : ''}
           ${severity  ? 'AND severity = :severity'    : ''}
           AND status = 'active'
         ORDER BY created_at DESC
         LIMIT :lim`,
        {
          replacements: { orgId: organizationId, patientId: patientId ? parseInt(patientId) : null, severity: severity || null, lim: parseInt(limit) },
          type: QueryTypes.SELECT
        }
      ).catch(() => [])
    ]);

    const combined = [
      ...vitalsAlerts.map(a => ({ ...a, source: 'vitals_ews' })),
      ...labAlerts.map(a => ({ ...a, source: 'lab_cdss' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(0, parseInt(limit));

    res.json({ success: true, count: combined.length, data: combined });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
