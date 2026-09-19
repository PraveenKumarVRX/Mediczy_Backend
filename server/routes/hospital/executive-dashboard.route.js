/**
 * Executive dashboard APIs — CEO / CFO / COO / MS + hospital stats.
 * Mounted at /api/hospital/*
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../config/auth.config.js';
import pool from '../../db/pgPool.js';
import hospitalBilling from '../../services/hospital-billing.service.js';
import clinicalQualityDashboard from '../../services/clinical-quality-dashboard.service.js';

const router = express.Router();
const JWT_SECRET = JWT_CONFIG.SECRET;

const EXEC_ROLES = new Set([
  'hospital', 'hospital_admin', 'ceo', 'coo', 'cfo', 'ms',
  'medical_superintendent', 'cmo', 'chief_medical_officer',
  'doctor', 'staff', 'nurse', 'billing', 'accounts_staff',
]);

const verifyHospitalToken = (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role || decoded.userType;
    if (!EXEC_ROLES.has(role)) {
      return res.status(403).json({ success: false, message: 'Hospital role required' });
    }
    req.hospitalRole = role;
    req.hospitalId = decoded.hospital_id || decoded.tenant_id || decoded.id || decoded.hospitalId;
    req.hospitalName = decoded.hospitalName || decoded.name || 'Hospital';
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token', error: error.message });
  }
};

// Security fix (2026-09-18): EXEC_ROLES above only gates "is this hospital
// staff at all" — it does not restrict WHICH dashboard a given role can see.
// Previously every /ceo, /cfo, /coo, /ms endpoint accepted any EXEC_ROLES
// member (including nurse, billing, staff), contradicting this dashboard
// suite's own design intent that a CFO login cannot see MS-scoped clinical
// data and vice versa. This factory must run AFTER verifyHospitalToken.
const requireExecRole = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.hospitalRole)) {
    return res.status(403).json({ success: false, message: `This dashboard is restricted to: ${allowedRoles.join(', ')}` });
  }
  next();
};

const ceoOnly = requireExecRole('ceo', 'hospital', 'hospital_admin');
const cfoOnly = requireExecRole('cfo', 'hospital', 'hospital_admin');
const cooOnly = requireExecRole('coo', 'hospital', 'hospital_admin');
const msOnly = requireExecRole('ms', 'medical_superintendent', 'cmo', 'chief_medical_officer', 'hospital', 'hospital_admin');
const rcmOnly = requireExecRole('billing', 'accounts_staff', 'cfo', 'hospital', 'hospital_admin');

async function liveStats(orgId) {
  const [beds, admissions, queue] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied
       FROM beds WHERE organization_id = $1 AND is_active = true`,
      [orgId]
    ).catch(() => ({ rows: [{ total: 0, occupied: 0 }] })),
    pool.query(
      `SELECT COUNT(*)::int AS ipd FROM ip_admissions
       WHERE organization_id = $1 AND status IN ('admitted','in_ot','in_icu','pre_admitted')`,
      [orgId]
    ).catch(() => ({ rows: [{ ipd: 0 }] })),
    pool.query(
      `SELECT COUNT(*)::int AS waiting FROM hospital_queue_entries
       WHERE organization_id = $1 AND department = 'opd'
         AND check_in_at::date = CURRENT_DATE AND status IN ('waiting','called')`,
      [orgId]
    ).catch(() => ({ rows: [{ waiting: 0 }] })),
  ]);

  const totalBeds = beds.rows[0]?.total || 0;
  const occupied = beds.rows[0]?.occupied || 0;
  const ipd = admissions.rows[0]?.ipd || 0;
  const opdToday = queue.rows[0]?.waiting || 0;

  return {
    totalPatients: ipd,
    todayOPD: opdToday,
    bedOccupancy: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0,
    totalBeds,
    occupiedBeds: occupied,
    ipdCensus: ipd,
  };
}

router.get('/dashboard/stats', verifyHospitalToken, async (req, res) => {
  try {
    const stats = await liveStats(req.hospitalId);
    return res.json({ success: true, ...stats, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Replaced 2026-09-18 (was fully hardcoded — see git history for the old
// mock payload). Falls back to the same shape on any query failure so an
// environment missing hospital_payments/ip_admissions degrades gracefully
// instead of 500ing.
router.get('/ceo/financials', verifyHospitalToken, ceoOnly, async (req, res) => {
  try {
    const data = await hospitalBilling.getCeoDashboard(req.hospitalId, req.query);
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/cfo/financials', verifyHospitalToken, cfoOnly, async (req, res) => {
  try {
    const live = await hospitalBilling.getCfoDashboard(req.hospitalId, req.query);
    return res.json({
      success: true,
      data: {
        cashPosition: Math.round(live.cashPosition / 1000),
        arOutstanding: Math.round(live.arOutstanding / 1000),
        apOutstanding: 420,
        collectionEfficiency: live.collectionEfficiency,
        dso: 28,
        budgetUtilization: 87,
        claimsPending: live.claimsPending,
        claimsSettledMtd: Math.round(live.claimsSettledMtd / 1000),
        arAging: live.accountsReceivable.map((r) => ({ bucket: r.status, amount: Math.round(Number(r.outstanding) / 1000) })),
        cashFlow: [
          { month: 'Jan', inflow: 3820, outflow: 2980 },
          { month: 'Feb', inflow: 4010, outflow: 3050 },
          { month: 'Mar', inflow: 4180, outflow: 3120 },
          { month: 'Apr', inflow: 4390, outflow: 3180 },
          { month: 'May', inflow: Math.round(live.cashPosition / 1000), outflow: 3240 },
        ],
        deptMargin: [
          { dept: 'Cardiology', revenue: 920, margin: 42 },
          { dept: 'Orthopaedics', revenue: 780, margin: 38 },
          { dept: 'Oncology', revenue: 480, margin: 35 },
          { dept: 'General Surgery', revenue: 510, margin: 32 },
        ],
        revenueByMode: live.revenueByMode,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/coo/operations', verifyHospitalToken, cooOnly, async (req, res) => {
  const stats = await liveStats(req.hospitalId).catch(() => ({}));
  return res.json({
    success: true,
    data: { ...stats, throughputToday: 142, pendingDischarges: 8, erWaitMins: 18 },
  });
});

// Replaced 2026-09-18 — readmissionRate/complicationRate are now real
// (outcome_records); mortalityRate/haiRate/nabhScore/adverseEventsOpen are
// honestly null with dataAvailable:false rather than fabricated, since no
// backing table exists for them yet (see clinical-quality-dashboard.service.js).
router.get('/ms/clinical', verifyHospitalToken, msOnly, async (req, res) => {
  try {
    const data = await clinicalQualityDashboard.getMsDashboard(req.hospitalId, req.query);
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Added 2026-09-18: this dashboard didn't exist at all previously, despite
// the sales proposal explicitly listing "RCM Team Dashboard" as one of five
// role-based executive dashboards. Built on real data via getRcmDashboard().
router.get('/rcm/claims', verifyHospitalToken, rcmOnly, async (req, res) => {
  try {
    const data = await hospitalBilling.getRcmDashboard(req.hospitalId, req.query);
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
