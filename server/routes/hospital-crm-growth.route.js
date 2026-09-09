import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
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
  if (!Number.isInteger(id) || id < 1) {
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

const action = (handler) => async (req, res) => {
  const tenantId = tenant(req, res);
  if (!tenantId) return;
  try { return res.json({ success: true, data: await handler(req, tenantId) }); } catch (error) { return fail(res, error); }
};

router.get('/dashboard', action((req, tenantId) => getGrowthDashboard(tenantId, req.query)));
router.post('/intake', action((req, tenantId) => intakeLead({ ...req.body, tenantId }, req.crmUser.id)));
router.get('/scoring/rules', action((req, tenantId) => listScoreRules(tenantId, req.query)));
router.post('/scoring/rules', action((req, tenantId) => createScoreRule({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/scoring/leads/:leadId/recalculate', action((req, tenantId) => scoreLead({ ...req.body, tenantId, leadId: req.params.leadId, recalculate: true }, req.crmUser.id)));
router.post('/scoring/leads/:leadId/events', action((req, tenantId) => scoreLead({ ...req.body, tenantId, leadId: req.params.leadId, recalculate: false }, req.crmUser.id)));
router.get('/scoring/leads/:leadId/history', action((req, tenantId) => getScoreHistory(tenantId, req.params.leadId, req.query.limit)));
router.get('/journeys', action((req, tenantId) => listJourneys(tenantId)));
router.post('/journeys', action((req, tenantId) => createJourney({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/journeys/:journeyId/enroll', action((req, tenantId) => enrollLead({ ...req.body, tenantId, journeyId: req.params.journeyId }, req.crmUser.id)));
router.post('/journeys/process', action((req, tenantId) => processJourneyQueue(tenantId, req.crmUser.id, req.body?.limit)));
router.get('/recovery/queue', action((req, tenantId) => listRecoveryQueue(tenantId, req.query)));
router.post('/recovery/scan', action((req, tenantId) => scanRecoveryQueue(tenantId, req.crmUser.id)));
router.patch('/recovery/:caseId', action((req, tenantId) => resolveRecoveryCase({ ...req.body, tenantId, caseId: req.params.caseId }, req.crmUser.id)));
router.get('/landing-pages', action((req, tenantId) => listLandingPages(tenantId)));
router.post('/landing-pages', action((req, tenantId) => createLandingPage({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/landing-pages/events', action((req, tenantId) => recordLandingPageEvent({ ...req.body, tenantId }, req.crmUser.id)));

export default router;
