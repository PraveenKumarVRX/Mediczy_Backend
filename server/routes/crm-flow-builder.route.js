import express from 'express';
import { authCRM, requireCRMCapability } from '../middleware/crm.middleware.js';
import { requireFeatureFlag } from '../services/feature-flag.service.js';
import { listFlows, getFlow, createFlow, updateFlow, publishFlow, runFlow, processDueFlowRuns } from '../services/crm-flow-builder.service.js';

const router = express.Router();
const enabled = (_req, res, next) => process.env.CRM_FLOW_BUILDER_ENABLED === 'true' ? next() : res.status(404).json({ success: false, code: 'feature_disabled' });
const sendError = (res, error) => res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Flow operation failed' });

router.use(enabled);
router.use(authCRM);
router.use(requireFeatureFlag('crm.flow_builder', { fallbackEnv: 'CRM_FLOW_BUILDER_ENABLED' }));
router.get('/', authCRM, requireCRMCapability('foundation:read'), async (req, res) => { try { res.json({ success: true, flows: await listFlows(req.crmUser.tenantUid, req.query) }); } catch (e) { sendError(res, e); } });
router.get('/:id', authCRM, requireCRMCapability('foundation:read'), async (req, res) => { try { const flow = await getFlow(req.crmUser.tenantUid, req.params.id); if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' }); res.json({ success: true, flow }); } catch (e) { sendError(res, e); } });
router.post('/', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { res.status(201).json({ success: true, flow: await createFlow(req.crmUser.tenantUid, req.body, req.crmUser) }); } catch (e) { sendError(res, e); } });
router.put('/:id', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const flow = await updateFlow(req.crmUser.tenantUid, req.params.id, req.body, req.crmUser); if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' }); res.status(201).json({ success: true, flow }); } catch (e) { sendError(res, e); } });
router.post('/:id/publish', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const flow = await publishFlow(req.crmUser.tenantUid, req.params.id, req.crmUser); if (!flow) return res.status(404).json({ success: false, message: 'Flow not found' }); res.json({ success: true, flow }); } catch (e) { sendError(res, e); } });
router.post('/:id/run', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const dryRun = req.body?.dryRun !== false; const run = await runFlow(req.crmUser.tenantUid, req.params.id, req.body?.input || {}, { dryRun, user: req.crmUser }); if (!run) return res.status(404).json({ success: false, message: 'Flow not found' }); res.json({ success: true, run }); } catch (e) { sendError(res, e); } });
router.post('/runs/process', authCRM, requireCRMCapability('foundation:write'), async (req, res) => { try { const runs = await processDueFlowRuns({ tenantUid: req.crmUser.tenantUid, limit: req.body?.limit }); res.json({ success: true, processed: runs }); } catch (e) { sendError(res, e); } });

export default router;
