import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import {
  acknowledgeCommunicationHubAlert,
  createCommunicationHubCampaign,
  createCommunicationHubTemplate,
  getCommunicationHubDashboard,
  listCommunicationHubCampaigns,
  listCommunicationHubTemplates,
  recordCommunicationIntegrationHealth,
  updateCommunicationHubCampaignStatus,
} from '../services/hospital-crm-communication-hub.service.js';

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
    message: error.code === '42P01' ? 'Communication hub migration is not applied yet' : error.message,
  });
}

const action = (handler) => async (req, res) => {
  const tenantId = tenant(req, res);
  if (!tenantId) return;
  try { return res.json({ success: true, data: await handler(req, tenantId) }); } catch (error) { return fail(res, error); }
};

router.get('/dashboard', action((req, tenantId) => getCommunicationHubDashboard(tenantId, req.query)));
router.get('/campaigns', action((req, tenantId) => listCommunicationHubCampaigns(tenantId, req.query)));
router.post('/campaigns', action((req, tenantId) => createCommunicationHubCampaign({ ...req.body, tenantId }, req.crmUser.id)));
router.patch('/campaigns/:id/status', action((req, tenantId) => updateCommunicationHubCampaignStatus(tenantId, req.params.id, req.body.status, req.crmUser.id)));
router.get('/templates', action((req, tenantId) => listCommunicationHubTemplates(tenantId, req.query)));
router.post('/templates', action((req, tenantId) => createCommunicationHubTemplate({ ...req.body, tenantId }, req.crmUser.id)));
router.patch('/integrations/:id/health', action((req, tenantId) => recordCommunicationIntegrationHealth({ ...req.body, tenantId, integrationId: req.params.id }, req.crmUser.id)));
router.post('/alerts/:id/acknowledge', action((req, tenantId) => acknowledgeCommunicationHubAlert(tenantId, req.params.id, req.crmUser.id)));

export default router;
