import express from 'express';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import { requireFeatureFlag } from '../services/feature-flag.service.js';
import {
  listInboxConversations,
  assignConversation,
  setConversationStatus,
  setConversationLabels,
  takeoverConversation,
  releaseConversation,
  listInboxRules,
  createInboxRule,
  updateInboxRule,
  deleteInboxRule,
  applyInboxRules,
  normalizeInboundEvent,
  listWhatsAppTemplates,
  createWhatsAppTemplate,
  transitionWhatsAppTemplate,
  requestSocialErasure,
  listSocialErasureRequests,
  processSocialErasure,
  listInboxReminders,
  createInboxReminder,
  cancelInboxReminder,
  processDueInboxReminders,
} from '../services/crm-brightbean-chat.service.js';

const router = express.Router();
const enabled = (_req, res, next) => process.env.CRM_SOCIAL_GROWTH_ENABLED === 'true'
  ? next()
  : res.status(404).json({ success: false, code: 'feature_disabled' });
const sendError = (res, error) => res.status(error.statusCode || 500).json({ success: false, message: error.message || 'CRM chat operation failed' });

router.use(enabled);
router.use(authCRM);
router.use(requireFeatureFlag('crm.brightbean_chat', { fallbackEnv: 'CRM_SOCIAL_GROWTH_ENABLED' }));

// Shared inbox operator surface.
router.get('/inbox/conversations', requireCRMCapability('foundation:read'), async (req, res) => {
  try { return res.json({ success: true, conversations: await listInboxConversations(req.crmUser.tenantUid, req.query) }); }
  catch (error) { return sendError(res, error); }
});
router.patch('/inbox/conversations/:id/assignment', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const conversation = await assignConversation(req.crmUser.tenantUid, req.params.id, req.body?.assignedTo, req.crmUser);
    return conversation ? res.json({ success: true, conversation }) : res.status(404).json({ success: false, message: 'Conversation not found' });
  } catch (error) { return sendError(res, error); }
});
router.patch('/inbox/conversations/:id/status', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const conversation = await setConversationStatus(req.crmUser.tenantUid, req.params.id, req.body?.status);
    return conversation ? res.json({ success: true, conversation }) : res.status(404).json({ success: false, message: 'Conversation not found' });
  } catch (error) { return sendError(res, error); }
});
router.patch('/inbox/conversations/:id/labels', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const conversation = await setConversationLabels(req.crmUser.tenantUid, req.params.id, req.body?.labels);
    return conversation ? res.json({ success: true, conversation }) : res.status(404).json({ success: false, message: 'Conversation not found' });
  } catch (error) { return sendError(res, error); }
});
router.post('/inbox/conversations/:id/takeover', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const pause = await takeoverConversation(req.crmUser.tenantUid, req.params.id, req.body?.reason, req.crmUser);
    return pause ? res.json({ success: true, pause }) : res.status(404).json({ success: false, message: 'Conversation not found' });
  } catch (error) { return sendError(res, error); }
});
router.post('/inbox/conversations/:id/release', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const pause = await releaseConversation(req.crmUser.tenantUid, req.params.id);
    return pause ? res.json({ success: true, pause }) : res.status(404).json({ success: false, message: 'Active human takeover not found' });
  } catch (error) { return sendError(res, error); }
});

// Deterministic inbox rules; only bounded CRM actions are accepted.
router.get('/inbox/rules', requireCRMCapability('foundation:read'), async (req, res) => {
  try { return res.json({ success: true, rules: await listInboxRules(req.crmUser.tenantUid, req.query) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/inbox/rules', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.status(201).json({ success: true, rule: await createInboxRule(req.crmUser.tenantUid, req.body, req.crmUser) }); }
  catch (error) { return sendError(res, error); }
});
router.patch('/inbox/rules/:id', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const rule = await updateInboxRule(req.crmUser.tenantUid, req.params.id, req.body, req.crmUser);
    return rule ? res.json({ success: true, rule }) : res.status(404).json({ success: false, message: 'Rule not found' });
  } catch (error) { return sendError(res, error); }
});
router.delete('/inbox/rules/:id', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.json({ success: true, deleted: await deleteInboxRule(req.crmUser.tenantUid, req.params.id) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/inbox/rules/evaluate', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.json({ success: true, matched: await applyInboxRules(req.crmUser.tenantUid, req.body || {}, req.crmUser) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/events/normalize', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.json({ success: true, events: normalizeInboundEvent(req.body || {}) }); }
  catch (error) { return sendError(res, error); }
});

// WhatsApp template lifecycle. Provider submission remains an explicit
// operator action; no template is treated as approved by default.
router.get('/whatsapp/templates', requireCRMCapability('foundation:read'), async (req, res) => {
  try { return res.json({ success: true, templates: await listWhatsAppTemplates(req.crmUser.tenantUid, req.query) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/whatsapp/templates', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.status(201).json({ success: true, template: await createWhatsAppTemplate(req.crmUser.tenantUid, req.body, req.crmUser) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/whatsapp/templates/:id/status', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const template = await transitionWhatsAppTemplate(req.crmUser.tenantUid, req.params.id, req.body?.status, req.crmUser, req.body?.rejectionReason);
    return template ? res.json({ success: true, template }) : res.status(404).json({ success: false, message: 'Template not found' });
  } catch (error) { return sendError(res, error); }
});

// DPDP/GDPR-style social identity erasure with an auditable request lifecycle.
router.get('/erasure-requests', requireCRMCapability('foundation:read'), async (req, res) => {
  try { return res.json({ success: true, requests: await listSocialErasureRequests(req.crmUser.tenantUid, req.query) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/erasure-requests', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.status(201).json({ success: true, request: await requestSocialErasure(req.crmUser.tenantUid, req.body, req.crmUser) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/erasure-requests/:id/process', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const request = await processSocialErasure(req.crmUser.tenantUid, req.params.id, req.crmUser);
    return request ? res.json({ success: true, request }) : res.status(404).json({ success: false, message: 'Pending erasure request not found' });
  } catch (error) { return sendError(res, error); }
});

// Operator reminders are separate from outbound scheduled replies.
router.get('/inbox/reminders', requireCRMCapability('foundation:read'), async (req, res) => {
  try { return res.json({ success: true, reminders: await listInboxReminders(req.crmUser.tenantUid, req.query) }); }
  catch (error) { return sendError(res, error); }
});
router.post('/inbox/reminders', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const reminder = await createInboxReminder(req.crmUser.tenantUid, req.body, req.crmUser);
    return reminder ? res.status(201).json({ success: true, reminder }) : res.status(404).json({ success: false, message: 'Conversation not found' });
  } catch (error) { return sendError(res, error); }
});
router.post('/inbox/reminders/:id/cancel', requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const reminder = await cancelInboxReminder(req.crmUser.tenantUid, req.params.id);
    return reminder ? res.json({ success: true, reminder }) : res.status(404).json({ success: false, message: 'Scheduled reminder not found' });
  } catch (error) { return sendError(res, error); }
});
router.post('/inbox/reminders/process', requireCRMCapability('foundation:write'), async (req, res) => {
  try { return res.json({ success: true, processed: await processDueInboxReminders({ tenantUid: req.crmUser.tenantUid, limit: req.body?.limit }) }); }
  catch (error) { return sendError(res, error); }
});

export default router;
