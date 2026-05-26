import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getCommandCenter,
  getOperationalKPIs,
  getClinicalKPIs,
  getQualityKPIs,
  getFinancialKPIs,
  getPatientExperienceKPIs,
  getWardCensus,
  getLOSTrend,
} from '../services/analytics.service.js';

const router = express.Router();

// GET /api/v1/analytics/command-center
router.get('/command-center', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getCommandCenter(organizationId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/operational
router.get('/operational', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getOperationalKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 7 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/clinical
router.get('/clinical', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getClinicalKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 7 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/quality
router.get('/quality', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getQualityKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/financial
router.get('/financial', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getFinancialKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/patient-experience
router.get('/patient-experience', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getPatientExperienceKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/ward-census
router.get('/ward-census', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getWardCensus(organizationId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/los
router.get('/los', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const data = await getLOSTrend(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
