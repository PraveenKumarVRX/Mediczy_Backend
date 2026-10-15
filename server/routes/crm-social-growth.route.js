import express from 'express';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import { listIdentities, resolveIdentity, listTriggers, createTrigger, dispatchTrigger, pauseConversation, resumeConversation, scheduleReply, listScheduledReplies, processDueScheduledReplies } from '../services/crm-social-growth.service.js';
import { addPostComment, approvePost, createPost, getPost, listPosts, planPost, rejectPost, submitPost, updatePost } from '../services/crm-social-content.service.js';

const router = express.Router();
const enabled = (_req, res, next) => process.env.CRM_SOCIAL_GROWTH_ENABLED === 'true' ? next() : res.status(404).json({ success: false, code: 'feature_disabled' });
const sendError = (res, e) => res.status(e.statusCode || 500).json({ success: false, message: e.message || 'Social operation failed' });
const tenantUid = (req, res) => {
  if (!req.crmUser?.tenantUid) {
    res.status(400).json({ success: false, code: 'tenant_context_required', message: 'A tenant context is required.' });
    return null;
  }
  return req.crmUser.tenantUid;
};
router.use(enabled);
router.get('/posts', authCRM, requireCRMCapability('foundation:read'), async (req, res) => {
  try { const tenant = tenantUid(req, res); if (!tenant) return; res.json({ success: true, posts: await listPosts(tenant, req.query) }); }
  catch (e) { sendError(res, e); }
});
router.post('/posts', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try { const tenant = tenantUid(req, res); if (!tenant) return; res.status(201).json({ success: true, post: await createPost(tenant, req.body, req.crmUser) }); }
  catch (e) { sendError(res, e); }
});
router.get('/posts/:id', authCRM, requireCRMCapability('foundation:read'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await getPost(tenant, req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
router.patch('/posts/:id', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await updatePost(tenant, req.params.id, req.body, req.crmUser);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
router.post('/posts/:id/submit', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await submitPost(tenant, req.params.id, req.crmUser);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
router.post('/posts/:id/approve', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await approvePost(tenant, req.params.id, req.crmUser);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
router.post('/posts/:id/reject', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await rejectPost(tenant, req.params.id, req.body, req.crmUser);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
router.post('/posts/:id/plan', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await planPost(tenant, req.params.id, req.body, req.crmUser);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
router.post('/posts/:id/comments', authCRM, requireCRMCapability('foundation:write'), async (req, res) => {
  try {
    const tenant = tenantUid(req, res); if (!tenant) return;
    const post = await addPostComment(tenant, req.params.id, req.body, req.crmUser);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.status(201).json({ success: true, post });
  } catch (e) { sendError(res, e); }
});
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
