import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import {
  createSegment, updateSegment, listSegments, getSegment, deleteSegment,
  listSegmentMembers, refreshSegmentMembership,
} from '../services/crm-segments.service.js';
import { CRM_V2_DEFAULT_TENANT_ID } from '../services/crm-v2-sync.service.js';
import { startSegmentBlast, getBlastStatus } from '../services/crm-segment-blast.service.js';

const router = express.Router();
router.use(authCRM);

function tenant(req) {
  return Number(req.crmUser?.tenantId) || CRM_V2_DEFAULT_TENANT_ID;
}

const action = (handler, capability = 'segments:read') => async (req, res) => {
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
  }
  try {
    return res.json({ success: true, data: await handler(req, tenant(req)) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

router.get('/', action((req, tenantId) => listSegments(tenantId)));
router.post('/', action((req, tenantId) => createSegment({ tenantId, ...req.body, createdBy: req.crmUser.id }), 'segments:write'));
router.get('/:id', action((req, tenantId) => getSegment(tenantId, req.params.id)));
router.patch('/:id', action((req, tenantId) => updateSegment(tenantId, req.params.id, req.body), 'segments:write'));
router.delete('/:id', action((req, tenantId) => deleteSegment(tenantId, req.params.id), 'segments:write'));
router.get('/:id/members', action((req, tenantId) => listSegmentMembers(tenantId, req.params.id, req.query)));
router.post('/:id/refresh', action((req, tenantId) => refreshSegmentMembership(req.params.id, tenantId), 'segments:write'));
router.post('/:id/send', action((req, tenantId) => startSegmentBlast({ tenantId, segmentId: req.params.id, ...req.body, userId: req.crmUser.id }), 'segments:write'));
router.get('/:id/send/:campaignId', action((req, tenantId) => getBlastStatus(tenantId, req.params.campaignId)));

export default router;
