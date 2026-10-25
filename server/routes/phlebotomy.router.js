/**
 * Phlebotomist API (mobile). Mounted at /api/phlebotomy.
 * Contract: docs/api/phlebotomy-collection.openapi.yaml
 *
 * Every mutation requires Idempotency-Key and X-Device-Id and carries `expectedVersion`; the server derives actor,
 * owner and worker from the token, never from the body.
 */
import express from 'express';
import { forbidden, invalid } from '../services/collection/errors.js';
import { handle, send, operationMeta } from './lab/collection-http.js';

/** Pure router factory: everything with side effects (pool, redis limiter, token store) is injected. */
export function buildPhlebotomyRouter({ collectionService, phlebotomistService, authenticate, limiter = [] }) {
  const router = express.Router();
  const authLimiter = limiter;
  const authPhlebotomist = authenticate;

  // ── session ────────────────────────────────────────────────────────────────
  router.post('/auth/login', authLimiter, handle(async (req, res) => {
    const out = await phlebotomistService.login({ email: req.body?.email, password: req.body?.password, deviceId: req.get('X-Device-Id'), expectedOwnerUid: req.mobileTenant?.config.apps.find(app => app.product === 'phlebo')?.ownerUid });
    res.json({ success: true, ...out });
  }));

  router.post('/auth/refresh', authLimiter, handle(async (req, res) => {
    const out = await phlebotomistService.refresh({ refreshToken: req.body?.refreshToken, deviceId: req.get('X-Device-Id'), expectedOwnerUid: req.mobileTenant?.config.apps.find(app => app.product === 'phlebo')?.ownerUid });
    res.json({ success: true, accessToken: out.accessToken, refreshToken: out.refreshToken });
  }));

  router.post('/auth/logout', handle(async (req, res) => {
    res.json({ success: true, ...(await phlebotomistService.logout({ refreshToken: req.body?.refreshToken })) });
  }));

  router.use(authPhlebotomist);

  // A worker on a temporary password can do nothing but change it.
  router.use((req, res, next) => {
    if (req.phleb.mustChangePassword && !['/auth/change-password', '/me'].includes(req.path)) {
      return res.status(403).json({ success: false, code: 'password_change_required', message: 'Change your temporary password to continue' });
    }
    return next();
  });

  router.post('/auth/change-password', handle(async (req, res) => {
    res.json({ success: true, ...(await phlebotomistService.changePassword(req.phleb, req.body || {})) });
  }));

  router.get('/me', handle(async (req, res) => {
    res.json({ success: true, ...(await phlebotomistService.me(req.phleb)) });
  }));

  // ── worklist ───────────────────────────────────────────────────────────────
  router.get('/tasks', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.listWorklist(req.phleb, { mode: req.query.mode, cursor: req.query.cursor, limit: req.query.limit })) });
  }));

  router.get('/tasks/:id', handle(async (req, res) => {
    res.json({ success: true, ...(await collectionService.getTask(req.phleb, req.params.id)) });
  }));

  // ── commands ───────────────────────────────────────────────────────────────
  const COMMANDS = {
    accept: 'accept',
    decline: 'decline',
    arrival: 'arrive',
    depart: 'depart',
    bedside: 'bedside',
    'verify-patient': 'verify_patient',
    consent: 'consent',
    'specimens/scan': 'scan_specimen',
    collect: 'collect',
    'start-transit': 'start_transit',
    handoff: 'handoff',
  };

  for (const [path, command] of Object.entries(COMMANDS)) {
    router.post(`/tasks/:id/${path}`, handle(async (req, res) => {
      const meta = operationMeta(req, { required: true });
      const { expectedVersion, ...payload } = req.body || {};
      if (expectedVersion === undefined) throw invalid('expectedVersion is required', { field: 'expectedVersion' });
      send(res, await collectionService.command({
        principal: req.phleb, command, taskId: req.params.id, expectedVersion, payload, ...meta,
      }));
    }));
  }

  // Collectors may not receive specimens, dispatch or administer: say so explicitly rather than 404.
  router.all(['/lab/*', '/specimens/*'], handle(async () => {
    throw forbidden('Collectors cannot perform lab or dispatch actions');
  }));

  return router;
}
