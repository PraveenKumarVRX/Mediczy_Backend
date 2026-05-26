/**
 * Clinical Reports Routes
 * GET /api/v1/reports/census           — daily ward census
 * GET /api/v1/reports/ot-utilization   — OT utilization
 * GET /api/v1/reports/emar-compliance  — eMAR compliance
 * GET /api/v1/reports/readmission-risk — readmission risk
 * GET /api/v1/reports/executive-digest — executive daily digest
 * GET /api/v1/reports/preauth-status   — pre-auth status
 * GET /api/v1/reports/catalog          — available report types
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getDailyCensusData, getOTUtilizationReport, getEMARComplianceReport,
  getReadmissionRiskReport, getExecutiveDailyDigest, getPreAuthStatusReport
} from '../services/clinical-reports.service.js';

const router = express.Router();
const orgId = req => req.user.organization_id || req.user.tenant_id || req.user.id;

// GET /api/v1/reports/catalog
router.get('/catalog', authUser, (_req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'census',          name: 'Daily Ward Census',        description: 'Real-time bed occupancy, admissions, discharges, OT summary',       params: ['date'] },
      { id: 'ot-utilization',  name: 'OT Utilization Report',    description: 'Case volume, delay %, room/surgeon performance',                    params: ['days'] },
      { id: 'emar-compliance', name: 'eMAR Compliance Report',   description: 'Medication administration compliance by ward, medication, and day',  params: ['days'] },
      { id: 'readmission-risk',name: 'Readmission Risk Report',  description: 'Readmission rates by diagnosis, doctor, and weekly trend',          params: ['days'] },
      { id: 'executive-digest',name: 'Executive Daily Digest',   description: 'One-page KPI snapshot for C-suite — occupancy, alerts, OT, eMAR',   params: [] },
      { id: 'preauth-status',  name: 'Pre-Auth Status Report',   description: 'Insurance pre-auth pipeline — approval rates, amounts, by insurer',  params: ['days'] },
    ]
  });
});

// GET /api/v1/reports/census
router.get('/census', authUser, async (req, res) => {
  try {
    const data = await getDailyCensusData(orgId(req), req.query.date);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reports/ot-utilization
router.get('/ot-utilization', authUser, async (req, res) => {
  try {
    const data = await getOTUtilizationReport(orgId(req), { days: parseInt(req.query.days) || 7 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reports/emar-compliance
router.get('/emar-compliance', authUser, async (req, res) => {
  try {
    const data = await getEMARComplianceReport(orgId(req), { days: parseInt(req.query.days) || 7 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reports/readmission-risk
router.get('/readmission-risk', authUser, async (req, res) => {
  try {
    const data = await getReadmissionRiskReport(orgId(req), { days: parseInt(req.query.days) || 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reports/executive-digest
router.get('/executive-digest', authUser, async (req, res) => {
  try {
    const data = await getExecutiveDailyDigest(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/reports/preauth-status
router.get('/preauth-status', authUser, async (req, res) => {
  try {
    const data = await getPreAuthStatusReport(orgId(req), { days: parseInt(req.query.days) || 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
