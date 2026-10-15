import express from 'express';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import { listIdentities, resolveIdentity, listTriggers, createTrigger, dispatchTrigger, pauseConversation, resumeConversation, scheduleReply, listScheduledReplies, processDueScheduledReplies } from '../services/crm-social-growth.service.js';

const router = express.Router();
const enabled = (_req, res, next) => process.env.CRM_SOCIAL_GROWTH_ENABLED === 'true' ? next() : res.status(404).json({ success: false, code: 'feature_disabled' });
const sendError = (res, e) => res.status(e.statusCode || 500).json({ success: false, message: e.message || 'Social operation failed' });
router.use(enabled);
router.get('/identities', authCRM, requireCRMCapability('foundation:read'), async (req, res) => { try { res.json({ success: true, identities: await listIdentities(req.crmUser.tenantUid, req.query) }); } catch (e) { sendError(res, e); } });
router.post('/identities/resolve', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { res.status(200).json({ success: true, identity: await resolveIdentity(req.crmUser.tenantUid, req.body, req.crmUser) }); } catch (e) { sendError(res, e); } });
router.get('/triggers', authCRM, requireCRMCapability('foundation:read'), async (req, res) => { try { res.json({ success: true, triggers: await listTriggers(req.crmUser.tenantUid) }); } catch (e) { sendError(res, e); } });
router.post('/triggers', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { res.status(201).json({ success: true, trigger: await createTrigger(req.crmUser.tenantUid, req.body, req.crmUser) }); } catch (e) { sendError(res, e); } });
router.post('/triggers/dispatch', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { res.json({ success: true, ...(await dispatchTrigger(req.crmUser.tenantUid, req.body, req.crmUser)) }); } catch (e) { sendError(res, e); } });
router.post('/conversations/:id/pause', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const pause = await pauseConversation(req.crmUser.tenantUid, req.params.id, req.body?.reason, req.crmUser); if (!pause) return res.status(404).json({ success: false, message: 'Conversation not found in tenant' }); res.json({ success: true, pause }); } catch (e) { sendError(res, e); } });
router.post('/conversations/:id/resume', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const pause = await resumeConversation(req.crmUser.tenantUid, req.params.id); if (!pause) return res.status(404).json({ success: false, message: 'Active pause not found' }); res.json({ success: true, pause }); } catch (e) { sendError(res, e); } });
router.get('/scheduled-replies', authCRM, requireCRMCapability('foundation:read'), async (req, res) => { try { res.json({ success: true, replies: await listScheduledReplies(req.crmUser.tenantUid, req.query) }); } catch (e) { sendError(res, e); } });
router.post('/scheduled-replies', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const reply = await scheduleReply(req.crmUser.tenantUid, req.body, req.crmUser); if (!reply) return res.status(404).json({ success: false, message: 'Conversation not found in tenant' }); res.status(201).json({ success: true, reply }); } catch (e) { sendError(res, e); } });
router.post('/scheduled-replies/process', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const replies = await processDueScheduledReplies({ tenantUid: req.crmUser.tenantUid, limit: req.body?.limit }); res.json({ success: true, processed: replies }); } catch (e) { sendError(res, e); } });
export default router;
