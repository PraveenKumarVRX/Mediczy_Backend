/** /api/crm/call-centre — callback queue, agent status, my day, team, scripts and quick answers.
 * Mounted under /api/crm (authCRM). Anyone who works conversations (communication:read) may use it; what
 * they see is scoped in the service (crm-access). */
import express from 'express';
import { hasCRMCapability } from '../config/crm-roles.config.js';
import * as cc from '../services/crm-call-centre.service.js';

const action = (handler) => async (req, res) => {
  const u = req.crmUser;
  if (!u?.tenantId || !u?.tenantUid) return res.status(400).json({ success: false, message: 'CRM tenant context is required' });
  if (!hasCRMCapability(u, 'communication:read')) return res.status(403).json({ success: false, message: 'Your role does not include the call centre.' });
  try { return res.json({ success: true, data: await handler(req, u) }); }
  catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[call-centre]', error.message);
    return res.status(status).json({ success: false, message: status >= 500 ? 'Call centre request failed' : error.message });
  }
};

export function buildCallCentreRouter() {
  const r = express.Router();
  r.get('/queue', action((req, u) => cc.callbackQueue(u, { scope: req.query.scope })));
  r.post('/queue/missed/:leadId/clear', action((req, u) => cc.clearMissedCall(u, req.params.leadId)));
  r.patch('/tasks/:id', action((req, u) => cc.updateQueueTask(u, req.params.id, req.body || {})));
  r.get('/status', action((req, u) => cc.currentStatus(Number(u.tenantId), Number(u.id))));
  r.put('/status', action((req, u) => cc.setStatus(u, req.body?.status, req.body?.reason)));
  r.get('/day', action((req, u) => cc.agentDay(Number(u.tenantId), u.tenantUid, Number(u.id), { date: req.query.date })));
  r.get('/team', action((req, u) => cc.teamToday(u, { date: req.query.date })));
  r.get('/quick-answers', action((req, u) => cc.listQuickAnswers(u, req.query)));
  r.post('/quick-answers', action((req, u) => cc.saveQuickAnswer(u, req.body || {})));
  r.patch('/quick-answers/:id', action((req, u) => cc.saveQuickAnswer(u, req.body || {}, req.params.id)));
  r.delete('/quick-answers/:id', action((req, u) => cc.deleteQuickAnswer(u, req.params.id)));
  r.post('/quick-answers/:id/used', action((req, u) => cc.quickAnswerUsed(u, req.params.id)));
  return r;
}
