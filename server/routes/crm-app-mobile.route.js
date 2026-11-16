/** /api/app — what the Smart-Force app needs beyond the field API, for all three modes.
 *
 * Mounted behind smartForceAuth (the app's own sign-in), which sets req.crmUser exactly like the web's authCRM,
 * so every rule here is the CRM's: field executives see their own patients, agents and managers everyone.
 *
 *   everyone   GET /me, GET|PUT /status, GET /callbacks, PATCH /tasks/:id, POST /call, GET /quick-answers,
 *              GET /doctors, GET /doctors/:id, POST /devices, POST /devices/remove
 *   agent      GET /day, GET /leads/:id (conversation), POST /leads/:id/send (WhatsApp reply), POST /missed/:leadId/clear
 *   manager    GET /team-today, GET /approvals, PATCH /approvals/:kind/:id
 *
 * Sending and calling stay behind CRM_OUTBOUND_ENABLED, like the web. */
import express from 'express';
import * as cc from '../services/crm-call-centre.service.js';
import * as inbox from '../services/crm-unified-inbox.service.js';
import * as net from '../services/crm-referral-network.service.js';
import { registerDevice, unregisterDevice, pushConfigured } from '../services/crm-push.service.js';
import { assertV2LeadAccess } from '../services/crm-access.service.js';

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const action = (handler) => async (req, res) => {
  if (!req.crmUser?.tenantId || !req.crmUser?.tenantUid) return res.status(401).json({ success: false, error: 'Please sign in.', message: 'Please sign in.' });
  try { return res.json({ success: true, data: await handler(req, req.crmUser) }); }
  catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[app]', error.message);
    const message = status >= 500 && !error.statusCode ? 'Something went wrong. Try again.' : error.message;
    return res.status(status).json({ success: false, error: message, message });
  }
};
const modes = (req) => req.smartForceUser?.modes || [];
const need = (mode) => (req, res, next) => (modes(req).includes(mode) ? next()
  : res.status(403).json({ success: false, error: 'Your role does not include this.', message: 'Your role does not include this.' }));
const outbound = () => { if (process.env.CRM_OUTBOUND_ENABLED !== 'true') throw fail(503, 'Calling and messaging are switched off on this CRM.'); };

export function buildAppMobileRouter() {
  const r = express.Router();
  r.get('/me', action(async (req, u) => ({ user: req.smartForceUser, status: await cc.currentStatus(Number(u.tenantId), Number(u.id)),
    telephony: await inbox.telephonyStatus(Number(u.tenantId), Number(u.id)), push: pushConfigured() })));
  r.get('/status', action((req, u) => cc.currentStatus(Number(u.tenantId), Number(u.id))));
  r.put('/status', action((req, u) => cc.setStatus(u, req.body?.status, req.body?.reason)));
  r.get('/callbacks', action((req, u) => cc.callbackQueue(u, { scope: req.query.scope })));
  r.patch('/tasks/:id', action((req, u) => cc.updateQueueTask(u, req.params.id, req.body || {})));
  r.post('/call', action(async (req, u) => {
    outbound();
    if (req.body?.doctor_id) return net.callDoctor(net.scopeFor(u), req.body.doctor_id);
    const leadId = Number(req.body?.lead_id);
    if (!leadId) throw fail(400, 'Choose who to call');
    await assertV2LeadAccess(u, u.tenantId, leadId);
    return inbox.clickToCall(Number(u.tenantId), Number(u.id), leadId);
  }));
  r.get('/quick-answers', action((req, u) => cc.listQuickAnswers(u, req.query)));
  r.post('/devices', action((req, u) => registerDevice(u, req.body || {})));
  r.post('/devices/remove', action((req, u) => unregisterDevice(u, req.body?.token)));

  r.get('/day', need('agent'), action((req, u) => cc.agentDay(Number(u.tenantId), u.tenantUid, Number(u.id), { date: req.query.date })));
  r.post('/missed/:leadId/clear', need('agent'), action((req, u) => cc.clearMissedCall(u, req.params.leadId)));
  r.get('/leads/:id', action(async (req, u) => {
    await assertV2LeadAccess(u, u.tenantId, req.params.id);
    return inbox.getUnifiedThread(Number(u.tenantId), u.tenantUid, Number(u.id), req.params.id, { markRead: true });
  }));
  r.post('/leads/:id/send', action(async (req, u) => {
    outbound();
    await assertV2LeadAccess(u, u.tenantId, req.params.id);
    return inbox.sendUnified(Number(u.tenantId), u.tenantUid, Number(u.id), req.params.id, req.body || {});
  }));

  // Doctors: a field executive sees their own; managers and agents everyone (same service as the web).
  r.get('/doctors', action((req, u) => net.listDoctors(net.scopeFor(u), { search: req.query.search, limit: 200 })));
  r.get('/doctors/:id', action((req, u) => net.doctorProfile(net.scopeFor(u), req.params.id)));

  r.get('/team-today', need('manager'), action((req, u) => net.fieldTeamToday(net.scopeFor(u), req.query)));
  r.get('/approvals', need('manager'), action((req, u) => net.listApprovals(net.scopeFor(u), req.query)));
  r.patch('/approvals/:kind/:id', need('manager'), action((req, u) => net.decideApproval(net.scopeFor(u), req.params.kind, req.params.id, req.body || {})));
  return r;
}
