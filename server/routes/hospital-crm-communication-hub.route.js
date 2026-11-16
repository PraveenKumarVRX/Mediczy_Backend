import { ownScope, assertLegacyLeadAccess } from '../services/crm-access.service.js';
import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import { chatwootBridge } from '../services/chatwoot-bridge.service.js';
import {
  acknowledgeCommunicationHubAlert,
  createCommunicationHubCampaign,
  createCommunicationHubTemplate,
  getCommunicationHubDashboard,
  getConversationThread,
  listCommunicationHubCampaigns,
  listCommunicationHubTemplates,
  listCrmCallActivity,
  listCrmCommunicationLog,
  recordCommunicationIntegrationHealth,
  sendCrmMessage,
  updateCommunicationHubCampaignStatus,
} from '../services/hospital-crm-communication-hub.service.js';
import {
  listCrmChannelIntegrations,
  upsertCrmChannelIntegration,
  testCrmChannelIntegration,
  changeCrmChannelIntegration,
} from '../services/crm-channel-integrations.service.js';

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
  return res.status(error.statusCode || (['42P01', '42703'].includes(error.code) ? 503 : 500)).json({
    success: false,
    ...(error.fields ? { fields: error.fields } : {}),
    message: ['42P01', '42703'].includes(error.code) ? 'Communication hub/channel settings migration is not applied yet' : error.message,
  });
}

const action = (handler, capability = 'communication:read') => async (req, res) => {
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

router.get('/dashboard', action((req, tenantId) => getCommunicationHubDashboard(tenantId, req.query)));
router.get('/chatwoot', action((req, tenantId) => chatwootBridge.status(tenantId)));
router.get('/chatwoot/health', action((req, tenantId) => chatwootBridge.checkHealth(tenantId)));
router.get('/campaigns', action((req, tenantId) => listCommunicationHubCampaigns(tenantId, req.query)));
router.post('/campaigns', action((req, tenantId) => createCommunicationHubCampaign({ ...req.body, tenantId }, req.crmUser.id), 'communication:write'));
router.patch('/campaigns/:id/status', action((req, tenantId) => updateCommunicationHubCampaignStatus(tenantId, req.params.id, req.body.status, req.crmUser.id), 'communication:write'));
router.get('/templates', action((req, tenantId) => listCommunicationHubTemplates(tenantId, req.query)));
router.post('/templates', action((req, tenantId) => createCommunicationHubTemplate({ ...req.body, tenantId }, req.crmUser.id), 'communication:write'));
// Tenant-owned provider settings. Secret values are accepted only on writes,
// encrypted at rest, and never included in list/test responses.
router.get('/integrations', action((req, tenantId) => listCrmChannelIntegrations(tenantId)));
router.put('/integrations/:channel', action((req, tenantId) => upsertCrmChannelIntegration(tenantId, req.params.channel, req.body, req.crmUser.id), 'communication:configure'));
router.post('/integrations/:channel/test', action((req, tenantId) => testCrmChannelIntegration(tenantId, req.params.channel, req.body, req.crmUser.id), 'communication:configure'));
router.post('/integrations/:channel/disable', action((req, tenantId) => changeCrmChannelIntegration(tenantId, req.params.channel, 'disable', req.body, req.crmUser.id), 'communication:configure'));
router.delete('/integrations/:channel', action((req, tenantId) => changeCrmChannelIntegration(tenantId, req.params.channel, 'disconnect', req.body, req.crmUser.id), 'communication:configure'));
router.patch('/integrations/:id/health', action((req, tenantId) => recordCommunicationIntegrationHealth({ ...req.body, tenantId, integrationId: req.params.id }, req.crmUser.id), 'communication:configure'));
router.post('/alerts/:id/acknowledge', action((req, tenantId) => acknowledgeCommunicationHubAlert(tenantId, req.params.id, req.crmUser.id), 'communication:write'));

// ─── Real send + calls, scoped to this CRM user's own leads/contacts/deals ───
router.post('/send', action(async (req) => { if (req.body?.leadId) await assertLegacyLeadAccess(req.crmUser, req.body.leadId); return sendCrmMessage({ ...req.body, tenantId: req.crmUser.tenantId, tenantUid: req.crmUser.tenantUid, userId: req.crmUser.id }); }, 'communication:write'));
router.get('/calls', action(async (req) => { if (req.query.leadId) await assertLegacyLeadAccess(req.crmUser, req.query.leadId); return listCrmCallActivity({ ...req.query, tenantUid: req.crmUser.tenantUid, ownerUserId: ownScope(req.crmUser) ? req.crmUser.id : null }); }));
router.get('/log', action(async (req) => { if (req.query.leadId) await assertLegacyLeadAccess(req.crmUser, req.query.leadId); return listCrmCommunicationLog({ ...req.query, tenantId: req.crmUser.tenantId, tenantUid: req.crmUser.tenantUid, ownerUserId: ownScope(req.crmUser) ? req.crmUser.id : null }); }));
router.get('/conversations/:id', action(async (req, tenantId) => {
  const thread = await getConversationThread(tenantId, req.params.id);
  if (thread.conversation.metadata?.provider === 'chatwoot') {
    thread.conversation.agentUrl = await chatwootBridge.conversationLink(tenantId, req.params.id);
  }
  return thread;
}));

export default router;
