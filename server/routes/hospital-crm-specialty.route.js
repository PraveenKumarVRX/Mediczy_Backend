import express from 'express';
import { authCRM } from '../middleware/crm.middleware.js';
import { CRM_CAPABILITY_ROLES, hasCRMCapability } from '../config/crm-roles.config.js';
import {
  compareSpecialties,
  createContent,
  createDiagnosticBooking,
  createDiagnosticCentre,
  createDiagnosticProduct,
  createIntegration,
  createReferral,
  getDiagnosticDashboard,
  getDigitalOverview,
  getSpecialtyDashboard,
  listContent,
  listDiagnosticCentres,
  listDiagnosticProducts,
  listIntegrations,
  listReferrals,
  listSpecialties,
} from '../services/hospital-crm-specialty.service.js';

const router = express.Router();
router.use(authCRM);

function tenant(req, res) {
  const id = Number(req.crmUser?.tenantId);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ success: false, message: 'CRM tenant context is required' });
    return null;
  }
  return id;
}

function fail(res, error) {
  return res.status(error.statusCode || (error.code === '42P01' ? 503 : 500)).json({
    success: false,
    message: error.code === '42P01' ? 'Hospital CRM specialty and diagnostic domains are not migrated yet' : error.message,
  });
}

const action = (handler, capability = 'specialty:read') => async (req, res) => {
  const tenantId = tenant(req, res);
  if (!tenantId) return;
  if (!hasCRMCapability(req.crmUser, capability)) {
    return res.status(403).json({
      success: false,
      message: `This action is restricted to: ${(CRM_CAPABILITY_ROLES[capability] || []).join(', ') || 'admin'}.`,
    });
  }
  try { return res.json({ success: true, data: await handler(req, tenantId) }); } catch (error) { return fail(res, error); }
};

router.get('/specialties', action((req, tenantId) => listSpecialties(tenantId)));
router.get('/specialties/compare', action((req, tenantId) => compareSpecialties(tenantId, String(req.query.codes || '').split(',').filter(Boolean))));
router.get('/specialties/:code/dashboard', action((req, tenantId) => getSpecialtyDashboard(tenantId, req.params.code, req.query)));

router.get('/diagnostic/dashboard', action((req, tenantId) => getDiagnosticDashboard(tenantId, req.query)));
router.get('/diagnostic/centres', action((req, tenantId) => listDiagnosticCentres(tenantId)));
router.post('/diagnostic/centres', action((req, tenantId) => createDiagnosticCentre({ ...req.body, tenantId }, req.crmUser.id), 'specialty:write'));
router.get('/diagnostic/products', action((req, tenantId) => listDiagnosticProducts(tenantId)));
router.post('/diagnostic/products', action((req, tenantId) => createDiagnosticProduct({ ...req.body, tenantId }), 'specialty:write'));
router.post('/diagnostic/bookings', action((req, tenantId) => createDiagnosticBooking({ ...req.body, tenantId }, req.crmUser.id), 'foundation:write'));

router.get('/digital/overview', action((req, tenantId) => getDigitalOverview(tenantId, req.query)));
router.get('/digital/integrations', action((req, tenantId) => listIntegrations(tenantId)));
router.post('/digital/integrations', action((req, tenantId) => createIntegration({ ...req.body, tenantId }, req.crmUser.id), 'specialty:write'));
router.get('/digital/content', action((req, tenantId) => listContent(tenantId, req.query.specialtyCode)));
router.post('/digital/content', action((req, tenantId) => createContent({ ...req.body, tenantId }, req.crmUser.id), 'specialty:write'));
router.get('/digital/referrals', action((req, tenantId) => listReferrals(tenantId)));
router.post('/digital/referrals', action((req, tenantId) => createReferral({ ...req.body, tenantId }), 'specialty:write'));

export default router;
