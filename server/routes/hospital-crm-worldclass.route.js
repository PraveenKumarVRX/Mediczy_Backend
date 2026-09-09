import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import {
  calculateAttribution,
  completeIntegrationRun,
  createCommunicationEvent,
  createFeedback,
  createReview,
  getDimensionDashboard,
  getExecutiveDashboards,
  getDataQualityIssues,
  getPeoplePerformance,
  getJourneyTimeline,
  getSlaQueue,
  linkAppointment,
  listCommunicationTimeline,
  recordConsent,
  recordRevenue,
  recordTouchpoint,
  recordVisit,
  refreshAnalyticsMarts,
  runDataQualityScan,
  listIntegrationErrors,
  recordIntegrationError,
  startIntegrationRun,
} from '../services/hospital-crm-worldclass.service.js';
import { createAssignmentRule, createBudgetOrCost, createSlaRule, createTask, getMarketingHeadDashboard } from '../services/hospital-crm-worldclass-extra.service.js';

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
    message: error.code === '42P01' ? 'Hospital CRM world-class domains are not migrated yet' : error.message,
  });
}

const action = (handler) => async (req, res) => {
  const tenantId = tenant(req, res);
  if (!tenantId) return;
  try { return res.json({ success: true, data: await handler(req, tenantId) }); } catch (error) { return fail(res, error); }
};

router.post('/communications', action((req, tenantId) => createCommunicationEvent({ ...req.body, tenantId }, req.crmUser.id)));
router.get('/communications/timeline', action((req, tenantId) => listCommunicationTimeline(tenantId, req.query)));
router.get('/journey/:leadId/timeline', action((req, tenantId) => getJourneyTimeline(tenantId, { leadId: req.params.leadId, limit: req.query.limit })));
router.post('/consent', action((req, tenantId) => recordConsent({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/touchpoints', action((req, tenantId) => recordTouchpoint({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/appointments/link', action((req, tenantId) => linkAppointment({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/visits', action((req, tenantId) => recordVisit({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/revenue-events', action((req, tenantId) => recordRevenue({ ...req.body, tenantId }, req.crmUser.id)));
router.get('/sla/queue', action((req, tenantId) => getSlaQueue(tenantId, req.query.limit)));
router.post('/assignment-rules', action((req, tenantId) => createAssignmentRule({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/sla/rules', action((req, tenantId) => createSlaRule({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/tasks', action((req, tenantId) => createTask({ ...req.body, tenantId }, req.crmUser.id)));
router.post("/integrations/runs", action((req, tenantId) => startIntegrationRun({ ...req.body, tenantId })));
router.patch("/integrations/runs/:id", action((req, tenantId) => completeIntegrationRun({ ...req.body, tenantId, runId: req.params.id }, req.crmUser.id)));
router.post("/integrations/errors", action((req, tenantId) => recordIntegrationError({ ...req.body, tenantId }, req.crmUser.id)));
router.get("/integrations/errors", action((req, tenantId) => listIntegrationErrors(tenantId, req.query)));
router.post('/reviews', action((req, tenantId) => createReview({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/budgets', action((req, tenantId) => createBudgetOrCost('budget', { ...req.body, tenantId }, req.crmUser.id)));
router.post("/analytics/attribution", action((req, tenantId) => calculateAttribution({ ...req.body, tenantId }, req.crmUser.id)));
router.post('/campaign-costs', action((req, tenantId) => createBudgetOrCost('cost', { ...req.body, tenantId }, req.crmUser.id)));
router.post('/analytics/refresh', action((req, tenantId) => refreshAnalyticsMarts(tenantId, { metricDate: req.body?.metricDate, actorUserId: req.crmUser.id })));
router.post('/data-quality/scan', action((req, tenantId) => runDataQualityScan(tenantId, req.crmUser.id)));
router.get("/data-quality/issues", action((req, tenantId) => getDataQualityIssues(tenantId, req.query)));
router.get("/people/performance", action((req, tenantId) => getPeoplePerformance(tenantId, req.query)));

router.get('/dashboards/business-head', action((req, tenantId) => getExecutiveDashboards(tenantId, req.query)));
router.get('/dashboards/marketing-head', action((req, tenantId) => getMarketingHeadDashboard(tenantId, req.query)));
router.get('/dashboards/service-lines', action((req, tenantId) => getDimensionDashboard(tenantId, 'service-lines', req.query)));
router.get('/dashboards/doctors', action((req, tenantId) => getDimensionDashboard(tenantId, 'doctors', req.query)));

export default router;
