import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  recordEntry, getFlowsheet, getLatestVitals, getIOSummary, getVitalsTrend
} from '../services/nursing-echart.service.js';

const router = express.Router();

// POST /api/v1/echart/entry
router.post('/entry', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await recordEntry({ ...req.body, organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/echart/flowsheet/:admissionId
router.get('/flowsheet/:admissionId', authUser, async (req, res) => {
  try {
    const { entryType, from, to, limit } = req.query;
    const rows = await getFlowsheet(parseInt(req.params.admissionId), {
      entryType, from, to, limit: limit ? parseInt(limit) : 100
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/echart/vitals/:admissionId/latest
router.get('/vitals/:admissionId/latest', authUser, async (req, res) => {
  try {
    const row = await getLatestVitals(parseInt(req.params.admissionId));
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/echart/vitals/:admissionId/trend
router.get('/vitals/:admissionId/trend', authUser, async (req, res) => {
  try {
    const hours = req.query.hours ? parseInt(req.query.hours) : 24;
    const rows = await getVitalsTrend(parseInt(req.params.admissionId), hours);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/echart/io/:admissionId
router.get('/io/:admissionId', authUser, async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 3;
    const rows = await getIOSummary(parseInt(req.params.admissionId), days);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
