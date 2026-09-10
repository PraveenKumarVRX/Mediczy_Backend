import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import {
  createAutomation, updateAutomation, updateAutomationStatus, listAutomations, getAutomation,
  deleteAutomation, listExecutions, runAutomationTick, listAssignableUsers, runAutomationForLead,
} from '../services/crm-automations.service.js';
import { CRM_V2_DEFAULT_TENANT_ID } from '../services/crm-v2-sync.service.js';

const router = express.Router();
router.use(authCRM);

function tenant(req) {
  return Number(req.crmUser?.tenantId) || CRM_V2_DEFAULT_TENANT_ID;
}

const action = (handler, capability = 'automations:read') => async (req, res) => {
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({ success: false, message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.` });
  }
  try {
    return res.json({ success: true, data: await handler(req, tenant(req)) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

router.get('/', action((req, tenantId) => listAutomations(tenantId)));
router.post('/', action((req, tenantId) => createAutomation({
  tenantId, name: req.body.name, description: req.body.description,
  triggerType: req.body.triggerType, triggerConfig: req.body.triggerConfig,
  delayMinutes: req.body.delayMinutes, actionType: req.body.actionType, actionConfig: req.body.actionConfig,
  createdBy: req.crmUser.id,
}), 'automations:write'));
router.get('/assignable-users', action(() => listAssignableUsers()));
router.get('/:id', action((req, tenantId) => getAutomation(tenantId, req.params.id)));
router.patch('/:id', action((req, tenantId) => updateAutomation(tenantId, req.params.id, req.body), 'automations:write'));
router.patch('/:id/status', action((req, tenantId) => updateAutomationStatus(tenantId, req.params.id, req.body.status), 'automations:write'));
router.delete('/:id', action((req, tenantId) => deleteAutomation(tenantId, req.params.id), 'automations:write'));
router.get('/:id/executions', action((req, tenantId) => listExecutions(tenantId, req.params.id, req.query)));
router.post('/:id/run/:leadId', action((req, tenantId) => runAutomationForLead(tenantId, req.params.id, req.params.leadId), 'automations:write'));
router.post('/tick', action(() => runAutomationTick(), 'automations:write')); // manual trigger, mainly for testing/ops

export default router;
