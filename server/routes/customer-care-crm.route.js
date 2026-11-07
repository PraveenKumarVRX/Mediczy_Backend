import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import { createCustomerCareService } from '../services/customer-care.service.js';

const router = express.Router();
const service = createCustomerCareService();
router.use(authCRM);

function tenant(req, res) {
  const id = Number(req.crmUser?.tenantId);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ success: false, error: 'CRM tenant context is required', code: 'CRM_TENANT_REQUIRED' });
    return null;
  }
  return id;
}

function action(handler, capability) {
  return async (req, res) => {
    const tenantId = tenant(req, res);
    if (!tenantId) return;
    if (!hasCRMCapability(req.crmUser, capability)) {
      return res.status(403).json({
        success: false,
        error: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.`,
        code: 'CRM_CAPABILITY_REQUIRED',
      });
    }
    try { res.json({ success: true, data: await handler(req, tenantId) }); }
    catch (error) { res.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : 'Customer-care CRM service is temporarily unavailable', code: error.code || 'CUSTOMER_CARE_CRM_ERROR' }); }
  };
}

router.get('/handoffs', action((req, tenantId) => service.listHandoffs(tenantId, { status: req.query.status }), 'communication:read'));
router.post('/handoffs/:id/assign', action((req, tenantId) => service.assignHandoff(tenantId, req.params.id, req.crmUser.id, req.body || {}), 'communication:write'));
router.post('/handoffs/:id/resolve', action((req, tenantId) => service.resolveHandoff(tenantId, req.params.id, req.crmUser.id, req.body || {}), 'communication:write'));
router.get('/knowledge', action((_req, tenantId) => service.listKnowledge(tenantId), 'communication:configure'));
router.put('/knowledge', action((req, tenantId) => {
  // Tenant CRM staff can manage only tenant knowledge.  Global guidance must
  // be deployed by a governed platform workflow, never a chat request.
  if (req.body?.global === true) {
    const error = Object.assign(new Error('Global knowledge requires a governed platform workflow'), { statusCode: 403, code: 'GLOBAL_KNOWLEDGE_RESTRICTED' });
    throw error;
  }
  return service.saveKnowledge(tenantId, req.crmUser.id, { ...req.body, global: false });
}, 'communication:configure'));

export default router;
