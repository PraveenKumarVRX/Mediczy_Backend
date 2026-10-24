import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import {
  calculateAttribution,
  completeIntegrationRun,
  createCommunicationEvent,
  createFeedback,
  createReview,
  getDimensionDashboard,
  getExecutiveDashboards,
  getBusinessHeadTeamDashboard,
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

import sharedPool from '../db/pgPool.js';

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

const action = (handler, capability = 'worldclass:read') => async (req, res) => {
  const tenantId = tenant(req, res);
  if (!tenantId) return;
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({
      success: false,
      message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.`,
    });
  }
  try { return res.json({ success: true, data: await handler(req, tenantId) }); } catch (error) { return fail(res, error); }
};

router.get('/audit-log', action(async (req, tenantId) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  return (await sharedPool.query(`SELECT a.id, a.entity_type, a.entity_id, a.event_type, a.actor_user_id, a.reason, a.created_at,
    NULLIF(TRIM(CONCAT_WS(' ',u."firstName",u."lastName")), '') AS actor_name
    FROM crm_audit_log a LEFT JOIN users u ON u.id=a.actor_user_id AND u.tenant_id=a.tenant_id
    WHERE a.tenant_id=$1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2`, [tenantId, limit])).rows;
}, 'dashboard:business-head'));

router.post('/communications', action((req, tenantId) => createCommunicationEvent({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.get('/communications/timeline', action((req, tenantId) => listCommunicationTimeline(tenantId, req.query)));
router.get('/journey/:leadId/timeline', action((req, tenantId) => getJourneyTimeline(tenantId, { leadId: req.params.leadId, limit: req.query.limit })));
router.post('/consent', action((req, tenantId) => recordConsent({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.post('/touchpoints', action((req, tenantId) => recordTouchpoint({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.post('/appointments/link', action((req, tenantId) => linkAppointment({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.post('/visits', action((req, tenantId) => recordVisit({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.post('/revenue-events', action((req, tenantId) => recordRevenue({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.get('/sla/queue', action((req, tenantId) => getSlaQueue(tenantId, req.query.limit)));
router.post('/assignment-rules', action((req, tenantId) => createAssignmentRule({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/sla/rules', action((req, tenantId) => createSlaRule({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/tasks', action((req, tenantId) => createTask({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.post("/integrations/runs", action((req, tenantId) => startIntegrationRun({ ...req.body, tenantId }), 'specialty:write'));
router.patch("/integrations/runs/:id", action((req, tenantId) => completeIntegrationRun({ ...req.body, tenantId, runId: req.params.id }, req.crmUser.id), 'specialty:write'));
router.post("/integrations/errors", action((req, tenantId) => recordIntegrationError({ ...req.body, tenantId }, req.crmUser.id), 'specialty:write'));
router.get("/integrations/errors", action((req, tenantId) => listIntegrationErrors(tenantId, req.query)));
router.post('/reviews', action((req, tenantId) => createReview({ ...req.body, tenantId }, req.crmUser.id), 'worldclass:write'));
router.post('/budgets', action((req, tenantId) => createBudgetOrCost('budget', { ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post("/analytics/attribution", action((req, tenantId) => calculateAttribution({ ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/campaign-costs', action((req, tenantId) => createBudgetOrCost('cost', { ...req.body, tenantId }, req.crmUser.id), 'growth:write'));
router.post('/analytics/refresh', action((req, tenantId) => refreshAnalyticsMarts(tenantId, { metricDate: req.body?.metricDate, actorUserId: req.crmUser.id }), 'growth:write'));
router.post('/data-quality/scan', action((req, tenantId) => runDataQualityScan(tenantId, req.crmUser.id), 'growth:write'));
router.get("/data-quality/issues", action((req, tenantId) => getDataQualityIssues(tenantId, req.query), 'dashboard:business-head'));
router.get("/people/performance", action((req, tenantId) => getPeoplePerformance(tenantId, req.query), 'dashboard:people-performance'));
router.get('/dashboards/business-head/team', action((req, tenantId) => getBusinessHeadTeamDashboard(tenantId, req.query), 'dashboard:business-head'));

router.get('/dashboards/business-head', action((req, tenantId) => getExecutiveDashboards(tenantId, req.query), 'dashboard:business-head'));
router.get('/dashboards/marketing-head', action((req, tenantId) => getMarketingHeadDashboard(tenantId, req.query), 'dashboard:marketing-head'));
router.get('/dashboards/service-lines', action((req, tenantId) => getDimensionDashboard(tenantId, 'service-lines', req.query), 'dashboard:service-lines'));
router.get('/dashboards/doctors', action((req, tenantId) => getDimensionDashboard(tenantId, 'doctors', req.query), 'dashboard:doctors'));

export default router;
