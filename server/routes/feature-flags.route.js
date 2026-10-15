import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  assertFlagKey,
  deleteFlag,
  deleteTenantOverride,
  evaluateFlag,
  listFlags,
  upsertFlag,
  upsertTenantOverride,
} from '../services/feature-flag.service.js';

const router = express.Router();
const errorResponse = (res, error) => res.status(error.statusCode || 500).json({ success: false, code: error.code || 'feature_flag_error', message: error.message || 'Feature flag operation failed' });

// The admin surface is intentionally separate from tenant-facing evaluation.
router.use(authUser, requireRole('admin'));

router.get('/', async (req, res) => {
  try { return res.json({ success: true, flags: await listFlags(req.query.tenantUid || null) }); }
  catch (error) { return errorResponse(res, error); }
});

router.post('/', async (req, res) => {
  try { return res.status(201).json({ success: true, flag: await upsertFlag(req.body || {}, req.user) }); }
  catch (error) { return errorResponse(res, error); }
});

router.patch('/:key', async (req, res) => {
  try { return res.json({ success: true, flag: await upsertFlag({ ...(req.body || {}), key: req.params.key }, req.user) }); }
  catch (error) { return errorResponse(res, error); }
});

router.delete('/:key', async (req, res) => {
  try { return res.json({ success: true, deleted: await deleteFlag(req.params.key, req.user) }); }
  catch (error) { return errorResponse(res, error); }
});

router.put('/:key/tenants/:tenantUid', async (req, res) => {
  try { return res.json({ success: true, override: await upsertTenantOverride(req.params.key, req.params.tenantUid, req.body || {}, req.user) }); }
  catch (error) { return errorResponse(res, error); }
});

router.delete('/:key/tenants/:tenantUid', async (req, res) => {
  try { return res.json({ success: true, deleted: await deleteTenantOverride(req.params.key, req.params.tenantUid, req.user) }); }
  catch (error) { return errorResponse(res, error); }
});

// Authenticated application clients can ask for a small, tenant-scoped snapshot.
export const publicFeatureFlagsRouter = express.Router();
publicFeatureFlagsRouter.get('/', authUser, async (req, res) => {
  try {
    const tenantUid = req.user?.tenant_uid || req.user?.organization_uid || req.user?.tenantUid || req.tenantContext?.tenantUid || null;
    const requested = Array.isArray(req.query.keys) ? req.query.keys : String(req.query.keys || '').split(',').filter(Boolean);
    const keys = requested.length ? requested.map(assertFlagKey) : [];
    const flags = {};
    for (const key of keys) flags[key] = await evaluateFlag(key, { tenantUid, userUid: req.user?.uid || req.user?.id });
    return res.json({ success: true, tenantUid, flags });
  } catch (error) { return errorResponse(res, error); }
});

export default router;
