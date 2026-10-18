import express from 'express';
import rateLimit from 'express-rate-limit';
import { INSTALLATION_PROFILES, InstallationError, exactFields } from '../config/dedicated-installation-profiles.js';
import { DedicatedInstallationsService } from '../services/dedicated-installations.service.js';

const platformRoles = ['admin', 'system_admin', 'super_admin', 'platform_admin'];
export function installationAdminGuard(pool) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ success: false, code: 'unauthenticated' });
      // Never look up a doctor/lab/hospital ID in the platform users table.
      if (!platformRoles.includes(req.userRole) && !(req.userRole === 'user' && req.user.isAdmin === true)) {
        return res.status(403).json({ success: false, code: 'forbidden' });
      }
      const user = (await pool.query('SELECT "isAdmin", role, status FROM users WHERE id=$1', [req.user.id])).rows[0];
      if (!user || user.status !== 'active' || !(user.isAdmin === true || platformRoles.includes(user.role))) {
        return res.status(403).json({ success: false, code: 'forbidden' });
      }
      next();
    } catch (error) { next(error); }
  };
}

export function dedicatedInstallationsRouter({ pool, authenticate }) {
  const router = express.Router();
  const service = new DedicatedInstallationsService(pool);
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/reports', rateLimit({ windowMs: 60000, max: 180, standardHeaders: true, legacyHeaders: false }),
    express.json({ limit: '16kb' }), wrap(async (req, res) => {
      const token = /^Bearer (mdi_[a-f0-9]{64})$/.exec(req.get('authorization') || '')?.[1];
      const result = await service.report(token, req.body);
      res.json({ success: true, ...result });
    }));
  router.use(authenticate, installationAdminGuard(pool));
  router.use(express.json({ limit: '16kb' }));
  router.get('/catalog', (req, res) => res.json({ success: true, profiles: INSTALLATION_PROFILES }));
  router.get('/tenant-options', wrap(async (req, res) => {
    if (req.query.search != null && typeof req.query.search !== 'string') throw new InstallationError(422, 'validation_failed', 'Invalid search');
    res.json({ success: true, tenants: await service.tenants(req.query.search || '') });
  }));
  router.get('/', wrap(async (req, res) => {
    const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
    const tenantUid = req.query.tenantUid;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000 ||
        (tenantUid != null && (typeof tenantUid !== 'string' || !/^[A-Z0-9]{6}$/.test(tenantUid)))) throw new InstallationError(422, 'validation_failed', 'Invalid pagination or tenant');
    res.json({ success: true, installations: await service.list({ tenantUid, limit, offset }) });
  }));
  router.post('/', wrap(async (req, res) => {
    res.status(201).json({ success: true, installation: await service.save(req.body, req.user.id) });
  }));
  router.param('id', (req, res, next, id) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return res.status(422).json({ success: false, code: 'invalid_id' });
    next();
  });
  router.get('/:id', wrap(async (req, res) => res.json({ success: true, ...await service.detail(req.params.id) })));
  router.put('/:id', wrap(async (req, res) => res.json({ success: true, installation: await service.save(req.body, req.user.id, req.params.id) })));
  for (const action of ['rotate', 'revoke']) router.post(`/:id/connector/${action}`, wrap(async (req, res) => {
    exactFields(req.body, ['version']);
    res.json({ success: true, ...await service.credential(req.params.id, req.body.version, req.user.id, action === 'revoke') });
  }));
  router.use((error, req, res, next) => {
    if (error.code === '42P01' || error.code === '42703') return res.status(503).json({ success: false, code: 'schema_not_ready', message: 'Dedicated installation migration must be applied before using this page.' });
    if (error.code === '23505') return res.status(409).json({ success: false, code: 'duplicate_installation', message: 'This domain or tenant installation name is already registered.' });
    const status = error instanceof InstallationError ? error.status : error.status === 413 ? 413 : 500;
    res.status(status).json({ success: false, code: error instanceof InstallationError ? error.code : 'request_failed',
      message: error instanceof InstallationError ? error.message : 'The request could not be completed. No change was confirmed.' });
  });
  return router;
}
