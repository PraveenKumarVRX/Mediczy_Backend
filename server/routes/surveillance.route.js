/**
 * Surveillance camera analytics — API routes (Security module)
 * Security/safety monitoring, not SaMD. Service: server/services/surveillance-analytics.service.js.
 *
 *   /api/surveillance/edge/*   on-premises gateway (X-Gateway-Key, sha256 at rest) — no JWT.
 *                              Whitelisted in ringFencing PUBLIC_ENDPOINTS; each request
 *                              authenticates itself here and never reads req.user.
 *   /api/surveillance/*        Security portal staff (security_staff, hospital admin/owner).
 *                              Privacy approvals and gateway keys are admin/owner only.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import Tenant from '../models/postgres/tenant.model.postgres.js';
import surveillance, { SurveillanceError, ANALYTICS, edgeRateLimited } from '../services/surveillance-analytics.service.js';

const router = express.Router();

// ── Edge gateway (device key, no JWT) — registered first ────────────────────
const featureCache = new Map();
async function moduleEnabled(org) {
  const hit = featureCache.get(org);
  if (hit && Date.now() - hit.at < 60000) return hit.on;
  let on = true; // fail open like requireModule: only an explicit false blocks
  try { on = (await Tenant.findByPk(org, { attributes: ['id', 'features'] }))?.features?.module_surveillance !== false; } catch { /* keep open */ }
  featureCache.set(org, { on, at: Date.now() });
  return on;
}

const edgeAuth = async (req, res, next) => {
  try {
    const key = req.get('X-Gateway-Key');
    if (!key) return res.status(401).json({ success: false, message: 'X-Gateway-Key header required' });
    const gateway = await surveillance.authenticateGateway(key, req.get('X-Agent-Version'));
    if (!gateway) return res.status(401).json({ success: false, message: 'Invalid or inactive gateway key' });
    if (edgeRateLimited(gateway.id)) {
      res.set('Retry-After', '60');
      return res.status(429).json({ success: false, message: 'Gateway rate limit exceeded' });
    }
    if (!(await moduleEnabled(gateway.organization_id))) return res.status(403).json({ success: false, error: 'MODULE_NOT_ENABLED', message: 'Camera analytics is not enabled for this organization' });
    req.gateway = gateway;
    next();
  } catch (e) {
    console.error('[Surveillance edge]', e.message);
    res.status(500).json({ success: false, message: 'Gateway authentication failed' });
  }
};

const send = (res, status, data) => res.status(status).json({ success: true, data });
const fail = (e, req, res) => {
  if (e instanceof SurveillanceError) return res.status(e.status).json({ success: false, message: e.message, code: e.code });
  console.error('[Surveillance]', req.method, req.originalUrl, e);
  res.status(500).json({ success: false, message: 'Surveillance request failed' });
};

router.get('/edge/config', edgeAuth, async (req, res) => { try { send(res, 200, await surveillance.getEdgeConfig(req.gateway)); } catch (e) { fail(e, req, res); } });
router.post('/edge/heartbeat', edgeAuth, async (req, res) => { try { send(res, 200, await surveillance.heartbeat(req.gateway, req.body || {})); } catch (e) { fail(e, req, res); } });
router.post('/edge/frames', edgeAuth, async (req, res) => {
  try {
    const out = await surveillance.ingestFrame(req.gateway, req.body || {});
    // A vision outage is not the agent's fault: report it and tell it to back off.
    send(res, 200, out.outcome.startsWith('vision_') ? { ...out, retryAfterSeconds: 120 } : out);
  } catch (e) { fail(e, req, res); }
});
router.post('/edge/events', edgeAuth, async (req, res) => { try { send(res, 200, await surveillance.ingestNativeEvents(req.gateway, req.body?.events)); } catch (e) { fail(e, req, res); } });

// ── Staff routes ────────────────────────────────────────────────────────────
// Same gate as the rest of the Security portal: security staff and the hospital's own
// admin/owner. Portal logins carry userType 'hospital', so the role is checked explicitly.
const SECURITY_ROLES = ['security_staff', 'hospital', 'hospital_admin'];
const requireSecurityStaff = (req, res, next) => {
  const u = req.user || {};
  if (u.userType === 'hospital' && SECURITY_ROLES.includes(u.role)) return next();
  return requireRole(['admin'])(req, res, next);
};
const requireSecurityAdmin = (req, res, next) => {
  const u = req.user || {};
  if (u.userType === 'hospital' && (u.role === 'hospital_admin' || u.role === 'hospital')) return next();
  return requireRole(['admin'])(req, res, next);
};
const staff = [authUser, requireSecurityStaff, requireModule('surveillance')];
const admin = [authUser, requireSecurityAdmin, requireModule('surveillance')];

const orgOf = (req) => req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;
const toId = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) <= 2147483647 ? Number(v) : null);

// Resolves the organization and numeric :params, maps SurveillanceError, and turns
// undefined/null results into 404. Return { __status, data } to send a non-200 success.
const handle = (fn, { ids = [] } = {}) => async (req, res) => {
  try {
    const org = orgOf(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const params = {};
    for (const name of ids) {
      params[name] = toId(req.params[name]);
      if (!params[name]) return res.status(400).json({ success: false, message: `Invalid ${name}` });
    }
    const out = await fn({ req, org, params, userId: req.user?.id ?? null });
    if (out === undefined || out === null) return res.status(404).json({ success: false, message: 'Not found' });
    if (out.__status) return send(res, out.__status, out.data);
    send(res, 200, out);
  } catch (e) { fail(e, req, res); }
};
const created = (d) => (d ? { __status: 201, data: d } : d);

router.get('/catalog', ...staff, handle(() => ({ analytics: Object.entries(ANALYTICS).map(([key, a]) => ({ key, label: a.label, help: a.help, threshold: a.threshold, cmp: a.cmp, defaultSeverity: a.defaultSeverity, needsSchedule: Boolean(a.needsSchedule) })) })));
router.get('/overview', ...staff, handle(({ org }) => surveillance.getOverview(org)));

// gateways (keys are admin/owner only)
router.get('/gateways', ...staff, handle(({ org }) => surveillance.listGateways(org)));
router.post('/gateways', ...admin, handle(async ({ req, org, userId }) => created(await surveillance.registerGateway(org, { ...(req.body || {}), createdBy: userId }))));
router.delete('/gateways/:id', ...admin, handle(({ org, params }) => surveillance.deactivateGateway(org, params.id), { ids: ['id'] }));

// recorders
router.get('/recorders', ...staff, handle(({ org }) => surveillance.listRecorders(org)));
router.post('/recorders', ...staff, handle(async ({ req, org }) => created(await surveillance.createRecorder(org, req.body || {}))));
router.patch('/recorders/:id', ...staff, handle(({ req, org, params }) => surveillance.updateRecorder(org, params.id, req.body || {}), { ids: ['id'] }));
router.delete('/recorders/:id', ...staff, handle(async ({ org, params }) => { const r = await surveillance.archiveRecorder(org, params.id); return r ? { archived: true } : r; }, { ids: ['id'] }));

// cameras
router.get('/cameras', ...staff, handle(({ org }) => surveillance.listCameras(org)));
router.post('/cameras', ...staff, handle(async ({ req, org }) => created(await surveillance.createCamera(org, req.body || {}))));
router.get('/cameras/:id', ...staff, handle(({ org, params }) => surveillance.getCamera(org, params.id), { ids: ['id'] }));
router.patch('/cameras/:id', ...staff, handle(({ req, org, params }) => surveillance.updateCamera(org, params.id, req.body || {}), { ids: ['id'] }));
router.delete('/cameras/:id', ...staff, handle(async ({ org, params }) => { const r = await surveillance.archiveCamera(org, params.id); return r ? { archived: true } : r; }, { ids: ['id'] }));
router.post('/cameras/:id/privacy-approval', ...admin, handle(({ req, org, params, userId }) => surveillance.approvePrivacy(org, params.id, { userId, note: req.body?.note }), { ids: ['id'] }));
router.delete('/cameras/:id/privacy-approval', ...admin, handle(({ org, params }) => surveillance.revokePrivacy(org, params.id), { ids: ['id'] }));

// rules
router.get('/cameras/:id/rules', ...staff, handle(async ({ org, params }) => ((await surveillance.getCamera(org, params.id)) ? surveillance.listRules(org, params.id) : undefined), { ids: ['id'] }));
router.post('/cameras/:id/rules', ...staff, handle(async ({ req, org, params, userId }) => created(await surveillance.createRule(org, params.id, req.body || {}, userId)), { ids: ['id'] }));
router.patch('/rules/:id', ...staff, handle(({ req, org, params }) => surveillance.updateRule(org, params.id, req.body || {}), { ids: ['id'] }));
router.delete('/rules/:id', ...staff, handle(async ({ org, params }) => { const r = await surveillance.deleteRule(org, params.id); return r ? { disabled: true } : r; }, { ids: ['id'] }));

// events
router.get('/events', ...staff, handle(({ req, org }) => surveillance.listEvents(org, { status: req.query.status || null, cameraId: toId(req.query.cameraId), analytic: req.query.analytic || null, limit: req.query.limit })));
router.post('/events/:id/handle', ...staff, handle(({ req, org, params, userId }) => surveillance.handleEvent(org, params.id, { status: req.body?.status, note: req.body?.note, userId }), { ids: ['id'] }));

export default router;
