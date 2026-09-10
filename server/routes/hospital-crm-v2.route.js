import express from 'express';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import {
  createLead,
  findDuplicateIdentities,
  getFunnelSummary,
  getLead,
  getLeadTimeline,
  mergeLeads,
  resolveTenantId,
  transitionLead,
} from '../services/hospital-crm-foundation.service.js';

const router = express.Router();
router.use(authCRM);

function tenantIdFromRequest(req, res) {
  const tenantId = resolveTenantId(req.crmUser);
  if (!tenantId) {
    res.status(400).json({ success: false, message: 'CRM tenant context is required for hospital CRM v2' });
    return null;
  }
  return tenantId;
}

function handleError(res, error) {
  const status = error.statusCode || (error.code === '42P01' ? 503 : 500);
  const message = error.code === '42P01' ? 'Hospital CRM foundation is not migrated yet' : error.message;
  return res.status(status).json({ success: false, message });
}

router.get('/funnel', requireCRMCapability('foundation:read'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  try {
    return res.json({ success: true, data: await getFunnelSummary(tenantId, req.query) });
  } catch (error) { return handleError(res, error); }
});

router.get('/duplicates', requireCRMCapability('foundation:read'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  try {
    return res.json({ success: true, data: await findDuplicateIdentities(tenantId, req.query.limit) });
  } catch (error) { return handleError(res, error); }
});

router.post('/leads', requireCRMCapability('foundation:write'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  const payload = req.body || {};
  if (!payload.name && !payload.email && !payload.phone) {
    return res.status(400).json({ success: false, message: 'name, email, or phone is required' });
  }
  try {
    const data = await createLead({ ...payload, tenantId }, req.crmUser.id);
    return res.status(201).json({ success: true, data });
  } catch (error) { return handleError(res, error); }
});

router.get('/leads/:id/timeline', requireCRMCapability('foundation:read'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  try {
    const lead = await getLead(req.params.id, tenantId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.json({ success: true, data: await getLeadTimeline(req.params.id, tenantId, req.query.limit) });
  } catch (error) { return handleError(res, error); }
});

router.post('/leads/:id/stage', requireCRMCapability('foundation:write'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  if (!req.body?.toStage) return res.status(400).json({ success: false, message: 'toStage is required' });
  try {
    const data = await transitionLead({
      tenantId,
      leadId: req.params.id,
      toStage: req.body.toStage,
      actorUserId: req.crmUser.id,
      note: req.body.note,
      channel: req.body.channel,
    });
    return res.json({ success: true, data });
  } catch (error) { return handleError(res, error); }
});

router.post('/leads/:id/merge', requireCRMCapability('foundation:write'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  if (!req.body?.targetLeadId) return res.status(400).json({ success: false, message: 'targetLeadId is required' });
  try {
    const data = await mergeLeads({
      tenantId,
      sourceLeadId: req.params.id,
      targetLeadId: req.body.targetLeadId,
      actorUserId: req.crmUser.id,
      reason: req.body.reason,
    });
    return res.json({ success: true, data });
  } catch (error) { return handleError(res, error); }
});

router.get('/leads/:id', requireCRMCapability('foundation:read'), async (req, res) => {
  const tenantId = tenantIdFromRequest(req, res);
  if (!tenantId) return;
  try {
    const data = await getLead(req.params.id, tenantId);
    if (!data) return res.status(404).json({ success: false, message: 'Lead not found' });
    return res.json({ success: true, data });
  } catch (error) { return handleError(res, error); }
});

export default router;
