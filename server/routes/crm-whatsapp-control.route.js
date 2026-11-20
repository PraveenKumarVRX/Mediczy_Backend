/** /api/crm/whatsapp — Gupshup control plane: status, templates (multilingual families, library,
 * submit, sync, delete), template sends and the provider event log. Mounted under /api/crm, so it
 * inherits authCRM; template sends end in /send and so also stay behind the CRM_OUTBOUND_ENABLED gate. */
import express from 'express';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import * as gupshup from '../services/gupshup-control.service.js';
import * as inbox from '../services/crm-whatsapp-inbox.service.js';

const action = (handler, capability = 'communication:read') => async (req, res) => {
  const tenantId = Number(req.crmUser?.tenantId);
  if (!Number.isInteger(tenantId) || tenantId < 1) return res.status(400).json({ success: false, message: 'CRM tenant context is required' });
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
  }
  try { return res.json({ success: true, data: await handler(req, tenantId) }); }
  catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: status >= 500 && !error.statusCode ? 'WhatsApp operation failed' : error.message,
      ...(error.fields ? { details: error.fields } : {}) });
  }
};

export function buildWhatsAppControlRouter() {
  const router = express.Router();

  // Inbox. Replies end in /send so they stay behind the CRM_OUTBOUND_ENABLED fence like other sends.
  router.get('/inbox', action((req, t) => inbox.listInbox(t, { ...req.query, userId: req.crmUser.id })));
  router.get('/inbox/:id', action((req, t) => inbox.getInboxThread(t, req.params.id, { markRead: req.query.markRead !== 'false' })));
  router.post('/inbox/:id/send', action((req, t) => inbox.sendInboxMessage(t, req.params.id, req.body || {}, req.crmUser.id), 'communication:write'));
  router.patch('/inbox/:id/status', action((req, t) => inbox.setStatus(t, req.params.id, req.body?.status), 'communication:write'));
  router.patch('/inbox/:id/assign', action((req, t) => inbox.assignConversation(t, req.params.id,
    req.body?.userId === 'me' ? req.crmUser.id : (req.body?.userId ?? null)), 'communication:write'));
  router.get('/status', action((req, t) => gupshup.gupshupStatus(t)));
  router.get('/languages', action(() => gupshup.TEMPLATE_LANGUAGES));
  router.get('/events', action((req, t) => gupshup.recentChannelEvents(t, req.query.limit)));

  router.get('/templates', action(async (req, t) => {
    if (req.query.sync !== 'false') await gupshup.syncTemplates(t).catch(() => null); // show last known state if Gupshup is unreachable
    return gupshup.listTemplates(t);
  }));
  // Not '/sync': the CRM_OUTBOUND_ENABLED fence blocks any path segment named sync, and this is a read-only pull.
  router.post('/templates/refresh', action((req, t) => gupshup.syncTemplates(t), 'communication:configure'));
  router.post('/templates/lint', action((req) => {
    const { content } = gupshup.toPositional(req.body?.body || '');
    return { content, ...gupshup.lintTemplate(content, String(req.body?.category || 'utility').toUpperCase()) };
  }));
  // { purpose, category, variants: { en: '...', te: '...' }, examples?, header?, footer?, submit? }
  router.post('/templates', action((req, t) => gupshup.createTemplateFamily(t, req.body || {}, req.crmUser.id), 'communication:configure'));
  router.post('/templates/library', action((req, t) => gupshup.loadTemplateLibrary(t, req.crmUser.id, { languages: req.body?.languages }), 'communication:configure'));
  router.post('/templates/submit', action((req, t) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) throw Object.assign(new Error('Provide template ids to submit'), { statusCode: 400 });
    return gupshup.submitTemplates(t, ids);
  }, 'communication:configure'));
  router.post('/templates/:id/submit', action((req, t) => gupshup.submitTemplate(t, Number(req.params.id)), 'communication:configure'));
  router.delete('/templates/:id', action((req, t) => gupshup.deleteTemplate(t, Number(req.params.id)), 'communication:configure'));
  // { templateId | family, language?, leadId, params: [] }
  router.post('/templates/send', action((req, t) => gupshup.sendTemplate(t, req.body || {}, req.crmUser.id), 'communication:write'));
  return router;
}
