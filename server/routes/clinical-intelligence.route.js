/**
 * Clinical Intelligence API
 * Mount: /api/clinical-intelligence
 *
 * GET  /overview              — live hospital monitoring wall
 * GET  /patients/:admissionId — vitals stream + 24h trends + care team
 * GET  /alerts                — unified clinical alerts
 * POST /analyze               — analyze a vitals payload (CDSS)
 * POST /smart-pharma/check    — Rx validation + drug–drug interactions
 * POST /alerts/:id/ack        — acknowledge EWS alert
 */
import { Router } from 'express';
import { verifyHospitalToken } from '../middleware/hospitalAuth.middleware.js';
import * as ci from '../services/clinical-intelligence.service.js';
import { getActiveAlerts } from '../services/vitals-ews.service.js';

const router = Router();

function orgFrom(req) {
  return (
    req.hospitalOrgId ||
    req.hospitalId ||
    req.tenantId ||
    req.user?.organization_id ||
    req.user?.hospitalId ||
    req.user?.tenant_id ||
    req.query.organizationId ||
    req.body?.organizationId
  );
}

/** Hospital staff JWT (also accepts roles already allowed by verifyHospitalToken). */
router.use(verifyHospitalToken);

router.get('/overview', async (req, res) => {
  try {
    const data = await ci.getMonitoringOverview(orgFrom(req));
    res.json(data);
  } catch (e) {
    console.error('[clinical-intelligence] overview:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/patients/:admissionId', async (req, res) => {
  try {
    const data = await ci.getPatientStream(orgFrom(req), parseInt(req.params.admissionId, 10));
    if (!data.vitals) {
      // Enrich with demo trends so UI panels never empty
      data.trends24h = data.trends24h || ci.demoTrends24h(72);
      data.ecg = data.ecg || ci.generateEcgSamples(72);
      data.analysis = data.analysis || ci.analyzeVitalsFindings({
        hr: 72, sbp: 120, dbp: 80, rr: 16, temp: 36.8, spo2: 98,
      });
      data.careTeam = ci.buildCareTeamPlan(data.analysis);
      data.dataSource = 'partial';
    } else if (!data.trends24h?.hr?.length) {
      data.trends24h = ci.demoTrends24h(data.vitals.hr || 72);
      data.trendsSource = 'demo_fill';
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/alerts', async (req, res) => {
  try {
    const overview = await ci.getMonitoringOverview(orgFrom(req));
    res.json({ success: true, count: overview.alerts.length, alerts: overview.alerts });
  } catch (e) {
    try {
      const rows = await getActiveAlerts(orgFrom(req));
      res.json({ success: true, count: rows.length, alerts: rows });
    } catch (e2) {
      res.status(500).json({ success: false, message: e2.message });
    }
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const analysis = ci.analyzeVitalsFindings(req.body?.vitals || req.body || {});
    const careTeam = ci.buildCareTeamPlan(analysis, req.body?.patient || {});
    const ecg = ci.generateEcgSamples(analysis.vitals.hr || 72);
    res.json({
      success: true,
      analysis,
      careTeam,
      ecg,
      disclaimer: analysis.disclaimer,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/smart-pharma/check', async (req, res) => {
  try {
    const result = await ci.runSmartPharmaCheck({
      medications: req.body?.medications || req.body?.drugs || [],
      patientId: req.body?.patientId || null,
      useLLM: req.body?.useLLM === true,
    });
    if (result.success === false) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[clinical-intelligence] smart-pharma:', e.message);
    res.status(502).json({ success: false, message: e.message });
  }
});

router.post('/alerts/:id/ack', async (req, res) => {
  try {
    const out = await ci.acknowledgeClinicalAlert(
      orgFrom(req),
      req.params.id,
      req.userId || req.user?.id || req.hospitalId || null,
    );
    res.json(out);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
