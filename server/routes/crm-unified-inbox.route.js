/** /api/crm/inbox — unified, lead-centred inbox across WhatsApp, SMS, email, calls and notes.
 * Mounted under /api/crm, so authCRM applies; sends end in /send and stay behind CRM_OUTBOUND_ENABLED. */
import express from 'express';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import * as inbox from '../services/crm-unified-inbox.service.js';
import { updateContactDetails } from '../services/crm-contact-capture.service.js';
import { ownScope, assertLegacyLeadAccess, assertV2LeadAccess, assertCanAssign, assertRecordingAccess } from '../services/crm-access.service.js';

const action = (handler, capability = 'communication:read') => async (req, res) => {
  const tenantId = Number(req.crmUser?.tenantId);
  const tenantUid = req.crmUser?.tenantUid;
  if (!Number.isInteger(tenantId) || tenantId < 1 || !tenantUid) return res.status(400).json({ success: false, message: 'CRM tenant context is required' });
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
  }
  try { return res.json({ success: true, data: await handler(req, tenantId, tenantUid, req.crmUser.id) }); }
  catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500 && !error.statusCode) console.error('[inbox]', error.message);
    return res.status(status).json({ success: false, message: status >= 500 && !error.statusCode ? 'Inbox operation failed' : error.message });
  }
};

export function buildUnifiedInboxRouter() {
  const router = express.Router();
  // Every route that names a patient checks the caller may see that patient (field executives: own only).
  router.param('leadId', async (req, res, next, id) => {
    try { await assertV2LeadAccess(req.crmUser, req.crmUser?.tenantId, id); next(); }
    catch (e) { res.status(e.statusCode || 500).json({ success: false, message: e.statusCode ? e.message : 'Not allowed' }); }
  });
  router.param('legacyId', async (req, res, next, id) => {
    try { await assertLegacyLeadAccess(req.crmUser, id); next(); }
    catch (e) { res.status(e.statusCode || 500).json({ success: false, message: e.statusCode ? e.message : 'Not allowed' }); }
  });
  router.get('/', action((req, t, uid, me) => inbox.listUnifiedInbox(t, uid, me, { ...req.query, ownOnly: ownScope(req.crmUser) })));
  router.get('/summary', action((req, t, uid, me) => inbox.inboxSummary(t, uid, me, ownScope(req.crmUser))));
  router.get('/by-legacy/:legacyId', action((req, t) => inbox.v2ForLegacy(t, req.params.legacyId)));
  router.get('/telephony', action((req, t, uid, me) => inbox.telephonyStatus(t, me)));
  router.get('/telephony/agents', action((req, t) => inbox.telephonyAgents(t), 'team:manage'));
  router.put('/telephony/agents/:userId', action((req, t) => inbox.linkTelephonyAgent(t, req.params.userId, req.body?.telecmiUserId ?? null), 'team:manage'));
  router.post('/:leadId/call', action((req, t, uid, me) => inbox.clickToCall(t, me, req.params.leadId), 'communication:write'));
  router.get('/:leadId/recording/:eventKey', async (req, res) => {
    const tenantId = Number(req.crmUser?.tenantId);
    if (!hasCRMCapability(req.crmUser, 'communication:read')) return res.status(403).json({ success: false, message: 'Not allowed' });
    try {
      await assertRecordingAccess(req.crmUser, tenantId, req.params.eventKey);
      const stream = await inbox.callRecording(tenantId, req.params.leadId, req.params.eventKey);
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) { res.status(error.statusCode || 502).json({ success: false, message: error.message }); }
  });
  router.get('/:leadId', action((req, t, uid, me) => inbox.getUnifiedThread(t, uid, me, req.params.leadId, { markRead: req.query.markRead !== 'false' })));
  router.post('/:leadId/send', action((req, t, uid, me) => inbox.sendUnified(t, uid, me, req.params.leadId, req.body || {}), 'communication:write'));
  router.patch('/:leadId/contact', action((req, t, uid, me) => updateContactDetails(t, uid, Number(req.params.leadId), req.body || {}, me), 'communication:write'));
  router.post('/:leadId/stage', action((req, t, uid, me) => inbox.setJourneyStage(t, me, req.params.leadId, String(req.body?.stage || '')), 'communication:write'));
  router.post('/:leadId/tasks', action((req, t, uid, me) => inbox.createTask(t, uid, me, req.params.leadId, req.body || {}), 'communication:write'));
  router.patch('/tasks/:taskId', action(async (req, t, uid, me) => {
    const leadId = await inbox.taskLead(t, uid, req.params.taskId);
    if (leadId) await assertV2LeadAccess(req.crmUser, t, leadId);
    return inbox.updateTask(t, uid, me, req.params.taskId, req.body || {});
  }, 'communication:write'));
  router.post('/:leadId/appointment', action((req, t, uid, me) => inbox.bookAppointment(t, uid, me, req.params.leadId, req.body || {}), 'communication:write'));
  router.patch('/:leadId/fields', action((req, t) => inbox.setLeadFields(t, req.params.leadId, req.body || {}), 'communication:write'));
  router.patch('/:leadId/status', action((req, t) => inbox.setUnifiedStatus(t, req.params.leadId, req.body?.status), 'communication:write'));
  router.patch('/:leadId/assign', action(async (req, t, uid, me) => {
    const next = req.body?.userId === 'me' ? me : (req.body?.userId ?? null);
    assertCanAssign(req.crmUser, await inbox.currentOwner(t, req.params.leadId), next);
    return inbox.assignUnified(t, req.params.leadId, next);
  }, 'communication:write'));
  return router;
}
