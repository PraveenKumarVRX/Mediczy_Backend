import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getCommandCenter, getOperationalKPIs, getClinicalKPIs, getQualityKPIs,
  getFinancialKPIs, getPatientExperienceKPIs, getWardCensus, getLOSTrend,
} from '../services/analytics.service.js';
import {
  getReadmissionRiskScores, getPredictedLOS, getDischargeDelayForecast,
  getKPIAnomalies, getDailyTrend, getWardDrillDown, getDoctorPerformance, getBenchmarks,
} from '../services/hmis-predictive.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// Upgrade Plan Phase B2 — role-scoped views. Org-wide roles see the full
// command center by default and may pass ?department= to drill down;
// everyone else is auto-scoped to their own department_name and cannot
// override it via the query string.
const ORG_WIDE_ROLES = new Set(['admin', 'hospital', 'hospital_admin', 'system_admin']);

// GET /api/v1/analytics/command-center
router.get('/command-center', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const isOrgWide = ORG_WIDE_ROLES.has(req.user.role) || ORG_WIDE_ROLES.has(req.user.userType);
    const department = isOrgWide ? (req.query.department || null) : (req.user.department_name || null);
    const data = await getCommandCenter(organizationId, { department });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/operational
router.get('/operational', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getOperationalKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 7 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/clinical
router.get('/clinical', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getClinicalKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 7 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/quality
router.get('/quality', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getQualityKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/financial
router.get('/financial', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getFinancialKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/patient-experience
router.get('/patient-experience', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getPatientExperienceKPIs(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/ward-census
router.get('/ward-census', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getWardCensus(organizationId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/los
router.get('/los', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getLOSTrend(organizationId, { days: req.query.days ? parseInt(req.query.days) : 30 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Predictive Analytics ──────────────────────────────────────────────────────

// GET /api/v1/analytics/readmission-risk
router.get('/readmission-risk', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getReadmissionRiskScores(organizationId, { limit: parseInt(req.query.limit) || 50 });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/predicted-los
router.get('/predicted-los', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getPredictedLOS(organizationId);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/discharge-delay-forecast
router.get('/discharge-delay-forecast', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getDischargeDelayForecast(organizationId);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/anomalies
router.get('/anomalies', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getKPIAnomalies(organizationId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/trend?metric=admissions&days=14
router.get('/trend', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getDailyTrend(organizationId, {
      days:   parseInt(req.query.days)   || 14,
      metric: req.query.metric           || 'admissions',
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/ward-drilldown?wardId=1&days=30
router.get('/ward-drilldown', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getWardDrillDown(organizationId, {
      wardId: req.query.wardId ? parseInt(req.query.wardId) : undefined,
      days:   parseInt(req.query.days) || 30,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/doctor-performance?days=30
router.get('/doctor-performance', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getDoctorPerformance(organizationId, { days: parseInt(req.query.days) || 30 });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/analytics/benchmarks
router.get('/benchmarks', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const data = await getBenchmarks(organizationId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
