/** /api/crm/engage — templates, audiences, campaigns and automations in one API (Engage screen), and
 * /api/crm/home — the role-based home dashboard. Mounted under /api/crm, so authCRM applies.
 * Campaign launches are not sends themselves; the runner only sends while CRM_BULK_SENDING_ENABLED=true. */
import express from 'express';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import * as engage from '../services/crm-engage.service.js';
import * as automations from '../services/crm-automations.service.js';
import { homeData } from '../services/crm-home.service.js';

const action = (handler, capability = 'communication:read') => async (req, res) => {
  const tenantId = Number(req.crmUser?.tenantId);
  if (!Number.isInteger(tenantId) || tenantId < 1) return res.status(400).json({ success: false, message: 'CRM tenant context is required' });
  if (capability && !hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
  }
  try { return res.json({ success: true, data: await handler(req, tenantId, req.crmUser.id) }); }
  catch (error) {
    const status = error.statusCode || (error.code === '23505' ? 409 : 500);
    if (status >= 500) console.error('[engage]', error.message);
    return res.status(status).json({ success: false, message: status >= 500 && !error.statusCode ? 'Engage operation failed' : error.message });
  }
};

export function buildEngageRouter() {
  const r = express.Router();
  // templates
  r.get('/templates', action((req, t) => engage.listTemplates(t, req.query)));
  r.post('/templates', action((req, t, me) => engage.saveTemplate(t, me, req.body || {}), 'campaigns:manage'));
  r.put('/templates/:id', action((req, t, me) => engage.saveTemplate(t, me, req.body || {}, req.params.id), 'campaigns:manage'));
  r.delete('/templates/:id', action((req, t) => engage.archiveTemplate(t, req.params.id), 'campaigns:manage'));
  // audiences
  r.get('/audiences', action((req, t) => engage.listAudiences(t), 'segments:read'));
  r.post('/audiences/preview', action((req, t) => engage.previewAudience(t, req.body || {}), 'segments:read'));
  r.post('/audiences', action((req, t, me) => engage.saveAudience(t, me, req.body || {}), 'segments:write'));
  r.put('/audiences/:id', action((req, t, me) => engage.saveAudience(t, me, req.body || {}, req.params.id), 'segments:write'));
  r.delete('/audiences/:id', action((req, t) => engage.removeAudience(t, req.params.id), 'segments:write'));
  r.get('/audiences/:id/members', action((req, t) => engage.audienceMembers(t, req.params.id, req.query), 'campaigns:manage'));
  r.get('/leads', action((req, t) => engage.searchLeads(t, req.query.q), 'campaigns:manage'));
  // campaigns
  r.get('/campaigns', action((req, t) => engage.listCampaigns(t), 'campaigns:manage'));
  r.post('/campaigns', action((req, t, me) => engage.saveCampaign(t, me, req.body || {}), 'campaigns:manage'));
  r.put('/campaigns/:id', action((req, t, me) => engage.saveCampaign(t, me, req.body || {}, req.params.id), 'campaigns:manage'));
  r.post('/campaigns/:id/:verb(launch|pause|resume|archive)', action((req, t) => engage.campaignAction(t, req.params.id, req.params.verb), 'campaigns:manage'));
  r.get('/campaigns/:id/recipients', action((req, t) => engage.campaignRecipients(t, req.params.id), 'campaigns:manage'));
  // automations
  r.get('/automations/options', action((req, t) => engage.automationOptions(t), 'automations:read'));
  r.get('/automations', action((req, t) => automations.listAutomations(t), 'automations:read'));
  r.post('/automations', action((req, t, me) => automations.createAutomation({ ...req.body, tenantId: t, createdBy: me }), 'automations:write'));
  r.put('/automations/:id', action((req, t) => automations.updateAutomation(t, req.params.id, req.body || {}), 'automations:write'));
  r.patch('/automations/:id/status', action((req, t) => automations.updateAutomationStatus(t, req.params.id, req.body?.status), 'automations:write'));
  r.delete('/automations/:id', action((req, t) => automations.deleteAutomation(t, req.params.id).then(() => ({ deleted: true })), 'automations:write'));
  r.get('/automations/:id/executions', action((req, t) => automations.listExecutions(t, req.params.id), 'automations:read'));
  return r;
}

export function buildHomeRouter() {
  const r = express.Router();
  r.get('/', action((req) => homeData(req.crmUser, req.query), null));
  return r;
}
