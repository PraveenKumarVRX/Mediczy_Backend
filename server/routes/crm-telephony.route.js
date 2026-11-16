/** /api/crm/telephony — TeleCMI control: account overview, agents, routing, call-log sync, live calls.
 * Mounted under /api/crm (authCRM). Managing agents and routing needs team:manage (admins). */
import express from 'express';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import * as tc from '../services/telecmi-control.service.js';

const action = (handler, capability = 'communication:read') => async (req, res) => {
  const tenantId = Number(req.crmUser?.tenantId);
  if (!Number.isInteger(tenantId) || tenantId < 1) return res.status(400).json({ success: false, message: 'CRM tenant context is required' });
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
  }
  try { return res.json({ success: true, data: await handler(req, tenantId) }); }
  catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[telephony]', error.message);
    return res.status(status).json({ success: false, message: status >= 500 && !error.statusCode ? 'Telephony operation failed' : error.message });
  }
};

export function buildTelephonyRouter() {
  const r = express.Router();
  r.get('/overview', action((req, t) => tc.telephonyOverview(t).then((o) => (hasCRMCapability(req.crmUser, 'team:manage') ? o : { ...o, urls: null }))));
  r.get('/live', action((req, t) => tc.liveCalls(t)));
  r.get('/agents', action((req, t) => tc.listAgents(t), 'team:manage'));
  r.post('/agents', action((req, t) => tc.addAgent(t, req.body || {}), 'team:manage'));
  r.put('/agents/:id', action((req, t) => tc.updateAgent(t, req.params.id, req.body || {}), 'team:manage'));
  r.delete('/agents/:id', action((req, t) => tc.removeAgent(t, req.params.id), 'team:manage'));
  r.post('/agents/:id/status', action((req) => tc.setAgentStatus(req.params.id, req.body?.status), 'team:manage'));
  r.get('/routing', action((req, t) => tc.getRouting(t)));
  r.put('/routing', action((req, t) => tc.saveRouting(t, req.body || {}), 'team:manage'));
  // Not "/sync": the outbound fence treats a path segment named sync as a send.
  r.post('/logs/refresh', action((req, t) => tc.syncCallLogs(t, { hours: Number(req.body?.hours) || 24 }), 'team:manage'));
  return r;
}
