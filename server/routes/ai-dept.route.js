/**
 * AI Department Intelligence Routes
 * GET /api/v1/ai-dept/lab          — Lab: critical values, TAT, workload
 * GET /api/v1/ai-dept/pharmacy     — Pharmacy: inventory, poly-pharmacy, dispensing
 * GET /api/v1/ai-dept/ward         — Ward: deterioration, fall risk, task board
 * GET /api/v1/ai-dept/ot           — OT: schedule, turnover, delays, utilization
 * GET /api/v1/ai-dept/icu          — ICU: SOFA, weaning, sepsis bundle, fluid balance
 * GET /api/v1/ai-dept/er           — ER: boarding, door-to-doctor, acuity mix
 * GET /api/v1/ai-dept/opd          — OPD: no-show prediction, utilization, wait time
 * GET /api/v1/ai-dept/surveillance — Security: access anomalies, diversion risk
 * GET /api/v1/ai-dept/insurance    — Insurance: aging, denial patterns, insurer score
 * GET /api/v1/ai-dept/accounts     — Accounts: revenue, AR aging, cash flow
 * GET /api/v1/ai-dept/hrms         — HRMS: attendance, overtime, turnover, training
 * GET /api/v1/ai-dept/summary      — Combined headline KPIs for all 11 departments
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getLabAI, getPharmacyAI, getWardAI, getOTAI, getICUAI,
  getERAI, getOPDAI, getSurveillanceAI, getInsuranceAI,
  getAccountsAI, getHRMSAI,
} from '../services/ai-dept.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();
const orgId = req => resolveTenantId(req.user);

const dept = (fn) => async (req, res) => {
  try {
    const data = await fn(orgId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.get('/lab',          authUser, dept(getLabAI));
router.get('/pharmacy',     authUser, dept(getPharmacyAI));
router.get('/ward',         authUser, dept(getWardAI));
router.get('/ot',           authUser, dept(getOTAI));
router.get('/icu',          authUser, dept(getICUAI));
router.get('/er',           authUser, dept(getERAI));
router.get('/opd',          authUser, dept(getOPDAI));
router.get('/surveillance', authUser, dept(getSurveillanceAI));
router.get('/insurance',    authUser, dept(getInsuranceAI));
router.get('/accounts',     authUser, dept(getAccountsAI));
router.get('/hrms',         authUser, dept(getHRMSAI));

// Summary: parallel fetch of headline numbers from all departments
router.get('/summary', authUser, async (req, res) => {
  const org = orgId(req);
  const [lab, pharma, ward, ot, icu, er, opd, sur, ins, acc, hrms] = await Promise.allSettled([
    getLabAI(org), getPharmacyAI(org), getWardAI(org), getOTAI(org), getICUAI(org),
    getERAI(org), getOPDAI(org), getSurveillanceAI(org), getInsuranceAI(org),
    getAccountsAI(org), getHRMSAI(org),
  ]);
  res.json({
    success: true,
    data: {
      lab:          lab.status === 'fulfilled'    ? { critical_values: lab.value.critical_values?.count ?? 0, alerts: lab.value.ai_alerts?.length ?? 0 } : null,
      pharmacy:     pharma.status === 'fulfilled' ? { low_stock: pharma.value.inventory_risk?.items?.filter(i=>i.status==='critical').length ?? 0, expiring: pharma.value.expiry_alerts?.length ?? 0 } : null,
      ward:         ward.status === 'fulfilled'   ? { deteriorating: ward.value.deterioration_watch?.length ?? 0, fall_risk: ward.value.fall_risk?.length ?? 0 } : null,
      ot:           ot.status === 'fulfilled'     ? { todays_cases: ot.value.todays_schedule?.total_cases ?? 0, not_ready: ot.value.todays_schedule?.not_ready ?? 0 } : null,
      icu:          icu.status === 'fulfilled'    ? { high_sofa: icu.value.sofa_monitoring?.filter(s=>s.severity==='severe').length ?? 0, weaning_candidates: icu.value.weaning_candidates?.length ?? 0 } : null,
      er:           er.status === 'fulfilled'     ? { boarding: er.value.boarding_patients?.count ?? 0, diversion_risk: er.value.performance?.diversion_risk ?? 'low' } : null,
      opd:          opd.status === 'fulfilled'    ? { high_noshows: opd.value.no_show_analytics?.filter(d=>d.risk_level==='high').length ?? 0 } : null,
      surveillance: sur.status === 'fulfilled'    ? { risk_score: sur.value.security_risk_score ?? 0, alerts: sur.value.alerts?.length ?? 0 } : null,
      insurance:    ins.status === 'fulfilled'    ? { pending_claims: ins.value.claims_aging?.total_pending ?? 0, at_risk: ins.value.claims_aging?.at_risk ?? false } : null,
      accounts:     acc.status === 'fulfilled'    ? { growth_pct: acc.value.revenue_summary?.growth_pct ?? 0, ar_90plus: acc.value.ar_aging?.ar_90_plus ?? 0 } : null,
      hrms:         hrms.status === 'fulfilled'   ? { overtime_risk: hrms.value.overtime_risk?.length ?? 0, turnover_risk: hrms.value.turnover_risk?.filter(t=>t.risk==='high').length ?? 0 } : null,
    },
  });
});

export default router;
