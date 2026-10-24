import express from 'express';
import sharedPool from '../db/pgPool.js';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import { processJourneyQueue } from '../services/hospital-crm-growth-processor.service.js';
import {
  createJourney,
  createLandingPage,
  createScoreRule,
  enrollLead,
  getGrowthDashboard,
  getScoreHistory,
  intakeLead,
  listJourneys,
  listLandingPages,
  listRecoveryQueue,
  listScoreRules,
  recordLandingPageEvent,
  resolveRecoveryCase,
  scanRecoveryQueue,
  scoreLead,
} from '../services/hospital-crm-growth.service.js';

const router = express.Router();
router.use(authCRM);

function tenant(req, res) {
  const id = Number(req.crmUser?.tenantId);
  if (!Number.isInteger(id) || id < 1 || !req.crmUser?.tenantUid) {
    res.status(400).json({ success: false, message: 'CRM tenant context is required' });
    return null;
  }
  return id;
}

function fail(res, error) {
  return res.status(error.statusCode || (error.code === '42P01' ? 503 : 500)).json({
    success: false,
    message: error.code === '42P01' ? 'Hospital CRM growth automation is not migrated yet' : error.message,
  });
}

const action = (handler, capability = 'growth:read') => async (req, res) => {
  const tenantId = tenant(req, res);
  if (!tenantId) return;
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({
      success: false,
      message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.`,
    });
  }
  try {
    const leadId = req.params.leadId || req.body?.leadId || req.body?.lead_id;
    if (leadId) {
      const { rows } = await sharedPool.query(`SELECT v.id FROM crm_leads_v2 v JOIN crm_leads legacy ON legacy.id=v.legacy_lead_id WHERE v.id=$1 AND v.tenant_id=$2 AND v.tenant_uid=$3`, [leadId, tenantId, req.crmUser.tenantUid]);
      if (!rows.length) return res.status(404).json({ success:false, message:'Lead not found' });
    }
    if (req.params.caseId) {
      const { rows } = await sharedPool.query(`SELECT c.id FROM crm_growth_recovery_cases c JOIN crm_leads_v2 v ON v.id=c.lead_id AND v.tenant_id=c.tenant_id JOIN crm_leads legacy ON legacy.id=v.legacy_lead_id WHERE c.id=$1 AND c.tenant_id=$2 AND v.tenant_uid=$3`, [req.params.caseId, tenantId, req.crmUser.tenantUid]);
      if (!rows.length) return res.status(404).json({ success:false, message:'Recovery case not found' });
    }
    return res.json({ success: true, data: await handler(req, tenantId) });
  } catch (error) { return fail(res, error); }
};

router.get('/dashboard', action((req, tenantId) => getGrowthDashboard(tenantId, req.query, req.crmUser.tenantUid)));
router.post('/intake', action((req, tenantId) => intakeLead({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.get('/scoring/rules', action((req, tenantId) => listScoreRules(tenantId, req.query)));
router.post('/scoring/rules', action((req, tenantId) => createScoreRule({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/scoring/leads/:leadId/recalculate', action((req, tenantId) => scoreLead({ ...req.body, tenantId, leadId: req.params.leadId, recalculate: true }, req.crmUser.id), 'growth:write'));
router.post('/scoring/leads/:leadId/events', action((req, tenantId) => scoreLead({ ...req.body, tenantId, leadId: req.params.leadId, recalculate: false }, req.crmUser.id), 'growth:write'));
router.get('/scoring/leads/:leadId/history', action((req, tenantId) => getScoreHistory(tenantId, req.params.leadId, req.query.limit)));
router.get('/journeys', action((req, tenantId) => listJourneys(tenantId)));
router.post('/journeys', action((req, tenantId) => createJourney({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/journeys/:journeyId/enroll', action((req, tenantId) => enrollLead({ ...req.body, tenantId, journeyId: req.params.journeyId }, req.crmUser.id), 'growth:write'));
router.post('/journeys/process', action((req, tenantId) => processJourneyQueue(tenantId, req.crmUser.id, req.body?.limit), 'growth:write'));
router.get('/recovery/queue', action((req, tenantId) => listRecoveryQueue(tenantId, req.query, req.crmUser.tenantUid)));
router.post('/recovery/scan', action((req, tenantId) => scanRecoveryQueue(tenantId, req.crmUser.id, req.crmUser.tenantUid), 'growth:write'));
router.patch('/recovery/:caseId', action((req, tenantId) => resolveRecoveryCase({ ...req.body, tenantId, caseId: req.params.caseId }, req.crmUser.id), 'growth:write'));
router.get('/landing-pages', action((req, tenantId) => listLandingPages(tenantId)));
router.post('/landing-pages', action((req, tenantId) => createLandingPage({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/landing-pages/events', action((req, tenantId) => recordLandingPageEvent({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));

export default router;
