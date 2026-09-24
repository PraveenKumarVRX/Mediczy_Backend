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
      // WP-0.3c: `beds` has no `is_active` column (verified against the live schema on
      // 2026-09-24) — the old filter made this query throw, and the .catch() below turned
      // that into a silent "0 beds" on every exec dashboard. Filter removed.
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied
       FROM beds WHERE organization_id = $1`,
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

// Replaced 2026-09-23 (WP-0.3c) — apOutstanding/dso/budgetUtilization/cashFlow/
// deptMargin were all hardcoded (cashFlow and deptMargin duplicated exactly in
// the client's own seed data as a fallback). None of these are computable from
// the current schema: there is no expense ledger / chart of accounts (same gap
// documented in getCeoDashboard for ebitdaMargin/arpob), so they're now honest
// nulls with a dataAvailable map instead of fabricated numbers. arAging is now
// real day-based buckets from invoice age (previously labeled "aging" but was
// actually grouped by invoice status, not age).
router.get('/cfo/financials', verifyHospitalToken, cfoOnly, async (req, res) => {
  try {
    const [live, agingBuckets] = await Promise.all([
      hospitalBilling.getCfoDashboard(req.hospitalId, req.query),
      pool.query(
        `SELECT CASE
                  WHEN NOW() - created_at < INTERVAL '30 days' THEN '0-30 days'
                  WHEN NOW() - created_at < INTERVAL '60 days' THEN '31-60 days'
                  WHEN NOW() - created_at < INTERVAL '90 days' THEN '61-90 days'
                  ELSE '90+ days'
                END AS bucket,
                COALESCE(SUM(amount_due), 0) AS amount
         FROM hospital_invoices
         WHERE hospital_id = $1 AND status IN ('issued','partial','overdue') AND voided_at IS NULL
         GROUP BY bucket`,
        [req.hospitalId]
      ).catch(() => ({ rows: [] })),
    ]);

    const bucketOrder = ['0-30 days', '31-60 days', '61-90 days', '90+ days'];
    const bucketMap = new Map(agingBuckets.rows.map((r) => [r.bucket, Math.round(Number(r.amount) / 1000)]));

    return res.json({
      success: true,
      data: {
        cashPosition: Math.round(live.cashPosition / 1000),
        arOutstanding: Math.round(live.arOutstanding / 1000),
        collectionEfficiency: live.collectionEfficiency,
        claimsPending: live.claimsPending,
        claimsSettledMtd: Math.round(live.claimsSettledMtd / 1000),
        arAging: bucketOrder.map((bucket) => ({ bucket, amount: bucketMap.get(bucket) || 0 })),
        revenueByMode: live.revenueByMode,
        // Not computable from current schema — no expense ledger/chart of
        // accounts or vendor-payables table exists yet.
        apOutstanding: null,
        dso: null,
        budgetUtilization: null,
        cashFlow: null,
        deptMargin: null,
        payerSettlements: null,
        dataAvailable: { apOutstanding: false, dso: false, budgetUtilization: false, cashFlow: false, deptMargin: false, payerSettlements: false },
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Replaced 2026-09-23 (WP-0.3c) — was fully hardcoded (throughputToday: 142,
// pendingDischarges: 8, erWaitMins: 18) plus the client's own ward-wise beds,
// hourly patient flow, ALOS-by-ward, staffing and supply/maintenance sections
// were all static seed arrays with zero backing endpoint. Beds/throughput/ALOS
// are now real (beds+wards, ip_admissions, hospital_queue_entries). Staffing
// (HRMS) and supply/CMMS (SCM, biomedical) are left as honest empty states —
// wiring them needs the HRMS staff-normalization logic and SCM's tenant-scoped
// schema respectively, both out of scope for this pass; see
// docs/IMPLEMENTATION_STATUS_AND_NEXT_STEPS.md.
router.get('/coo/operations', verifyHospitalToken, cooOnly, async (req, res) => {
  const orgId = req.hospitalId;
  const [stats, bedsByWard, throughput, alosByWard, extras] = await Promise.all([
    liveStats(orgId).catch(() => ({})),
    pool.query(
      // WP-0.3c: `beds.is_active` does not exist — this threw and the .catch below swallowed
      // it, so bedsByWard was always empty. Most beds also still carry only the legacy `ward`
      // text with a null `ward_id` (11/11 text vs 4/11 id in prod on 2026-09-24), so the label
      // falls back to that text instead of collapsing those beds into 'Unassigned'.
      `SELECT COALESCE(w.name, NULLIF(b.ward, ''), 'Unassigned') AS ward,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE b.status = 'occupied')::int AS occupied,
              COUNT(*) FILTER (WHERE b.status = 'reserved')::int AS reserved,
              COUNT(*) FILTER (WHERE b.status = 'maintenance')::int AS maintenance
       FROM beds b
       LEFT JOIN wards w ON w.id = b.ward_id
       WHERE b.organization_id = $1
       GROUP BY COALESCE(w.name, NULLIF(b.ward, ''), 'Unassigned') ORDER BY total DESC`,
      [orgId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT hour, COALESCE(SUM(admissions),0)::int AS admissions,
              COALESCE(SUM(discharges),0)::int AS discharges,
              COALESCE(SUM(er_arrivals),0)::int AS er
       FROM (
         SELECT EXTRACT(HOUR FROM admission_datetime)::int AS hour, 1 AS admissions, 0 AS discharges, 0 AS er_arrivals
         FROM ip_admissions WHERE organization_id = $1 AND admission_datetime::date = CURRENT_DATE
         UNION ALL
         SELECT EXTRACT(HOUR FROM discharge_datetime)::int, 0, 1, 0
         FROM ip_admissions WHERE organization_id = $1 AND discharge_datetime::date = CURRENT_DATE
         UNION ALL
         SELECT EXTRACT(HOUR FROM check_in_at)::int, 0, 0, 1
         FROM hospital_queue_entries WHERE organization_id = $1 AND department = 'er' AND check_in_at::date = CURRENT_DATE
       ) x
       GROUP BY hour ORDER BY hour`,
      [orgId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT COALESCE(w.name, 'Unassigned') AS ward,
              ROUND(AVG(EXTRACT(EPOCH FROM (a.discharge_datetime - a.admission_datetime)) / 86400)::numeric, 1) AS alos,
              COUNT(*)::int AS n
       FROM ip_admissions a
       LEFT JOIN wards w ON w.id = a.ward_id
       WHERE a.organization_id = $1 AND a.discharge_datetime IS NOT NULL
         AND a.admission_datetime >= NOW() - INTERVAL '90 days'
       GROUP BY w.name HAVING COUNT(*) >= 3 ORDER BY alos DESC`,
      [orgId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM ip_admissions WHERE organization_id = $1 AND admission_datetime::date = CURRENT_DATE) AS admits_today,
         (SELECT COUNT(*)::int FROM ip_admissions WHERE organization_id = $1 AND discharge_datetime::date = CURRENT_DATE) AS discharges_today,
         (SELECT COUNT(*)::int FROM ip_admissions WHERE organization_id = $1 AND status != 'discharged' AND expected_los_days IS NOT NULL
            AND (admission_datetime + (expected_los_days || ' days')::interval)::date <= CURRENT_DATE) AS pending_discharges,
         (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - check_in_at)) / 60)::numeric)::int FROM hospital_queue_entries
            WHERE organization_id = $1 AND department = 'er' AND status IN ('waiting','called') AND check_in_at::date = CURRENT_DATE) AS er_wait_mins`,
      [orgId]
    ).catch(() => ({ rows: [{ admits_today: 0, discharges_today: 0, pending_discharges: 0, er_wait_mins: null }] })),
  ]);

  const e = extras.rows[0] || {};
  return res.json({
    success: true,
    data: {
      ...stats,
      throughputToday: (e.admits_today || 0) + (e.discharges_today || 0),
      admissionsToday: e.admits_today || 0,
      dischargesToday: e.discharges_today || 0,
      pendingDischarges: e.pending_discharges || 0,
      erWaitMins: e.er_wait_mins,
      bedsByWard: bedsByWard.rows,
      hourlyThroughput: throughput.rows,
      alosByWard: alosByWard.rows.map((r) => ({ ...r, alos: r.alos != null ? Number(r.alos) : null })),
      dataAvailable: { staffing: false, supplyChain: false, maintenance: false, equipment: false },
    },
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

// Added 2026-09-24 (WP-0.3c): backs AccountsDashboard.tsx, whose KPIs, recent transactions,
// payer-pending list and "today's summary" were all hardcoded. Everything here is computed from
// hospital_invoices / hospital_payments / hospital_payment_refunds. Named-payer breakdowns are NOT
// returned: invoices carry no payer name, so a per-TPA list cannot be derived honestly.
const accountsOnly = requireExecRole('billing', 'accounts_staff', 'cfo', 'hospital', 'hospital_admin');
router.get('/accounts/today', verifyHospitalToken, accountsOnly, async (req, res) => {
  const hid = req.hospitalId;
  try {
    const q = (sql) => pool.query(sql, [hid]);
    const [today, byMethod, bills, open, month, recent, refunds] = await Promise.all([
      q(`SELECT COALESCE(SUM(amount),0) AS total FROM hospital_payments
         WHERE hospital_id = $1 AND status = 'completed' AND created_at::date = CURRENT_DATE`),
      q(`SELECT payment_method, COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS cnt FROM hospital_payments
         WHERE hospital_id = $1 AND status = 'completed' AND created_at::date = CURRENT_DATE GROUP BY payment_method ORDER BY total DESC`),
      q(`SELECT COUNT(*)::int AS cnt FROM hospital_invoices
         WHERE hospital_id = $1 AND created_at::date = CURRENT_DATE AND status NOT IN ('voided','cancelled')`),
      q(`SELECT COUNT(*)::int AS cnt, COALESCE(SUM(amount_due),0) AS due,
                COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS older_7d
         FROM hospital_invoices WHERE hospital_id = $1 AND status IN ('issued','partial','overdue') AND voided_at IS NULL`),
      q(`SELECT COALESCE(SUM(amount),0) AS total FROM hospital_payments
         WHERE hospital_id = $1 AND status = 'completed' AND created_at >= date_trunc('month', CURRENT_DATE)`),
      q(`SELECT id, bill_number, patient_id, bill_type, total_amount, status, created_at FROM hospital_invoices
         WHERE hospital_id = $1 AND status NOT IN ('voided','cancelled') ORDER BY created_at DESC LIMIT 10`),
      q(`SELECT COALESCE(SUM(amount),0) AS total FROM hospital_payment_refunds
         WHERE hospital_id = $1 AND status <> 'failed' AND created_at::date = CURRENT_DATE`),
    ]);
    return res.json({
      success: true,
      data: {
        todaysCollection: Number(today.rows[0].total),
        collectionByMethod: byMethod.rows.map((r) => ({ method: r.payment_method, total: Number(r.total), count: r.cnt })),
        billsGeneratedToday: bills.rows[0].cnt,
        pendingBills: open.rows[0].cnt,
        pendingBillsOlderThan7d: open.rows[0].older_7d,
        outstandingAmount: Number(open.rows[0].due),
        monthCollection: Number(month.rows[0].total),
        refundsToday: Number(refunds.rows[0].total),
        recentInvoices: recent.rows.map((r) => ({
          id: r.id, billNumber: r.bill_number, patientId: r.patient_id, billType: r.bill_type,
          totalAmount: Number(r.total_amount), status: r.status, createdAt: r.created_at,
        })),
        dataAvailable: { collectionTarget: false, pendingByPayer: false },
      },
    });
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
