import express from 'express';
import { mobileDeploymentEnvironment } from '../services/tenant-mobile-runtime.js';
import { validateMobileApps } from '../services/tenant-mobile-apps.service.js';

// Mounted behind authUser + superAdminOnly. Require an actual platform role too:
// the older parent middleware also supports legacy email-based bypasses.
export function buildTenantMobileAdminRouter(repository) {
  const router = express.Router();
  router.use('/tenants/:id/mobile-apps', (req, res, next) => {
    if (!['admin', 'super_admin', 'platform_admin'].includes(req.userRole || req.user?.role)) return res.status(403).json({ message: 'Platform administrator access required.' });
    return next();
  });
  router.param('id', (req, res, next, id) => /^[1-9][0-9]*$/.test(id) ? next() : res.status(400).json({ message: 'Invalid tenant ID.' }));
  router.get('/tenants/:id/mobile-apps', async (req, res) => {
    try {
      const tenant = await repository.get(req.params.id);
      if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
      return res.json({ success: true, configuration: tenant.settings?.mobileApps || null });
    } catch { return res.status(500).json({ message: 'Unable to load app configuration.' }); }
  });
  router.get('/tenants/:id/mobile-apps/deployment', async (req, res) => {
    try {
      const tenant = await repository.get(req.params.id);
      if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, environment: mobileDeploymentEnvironment(tenant) });
    } catch { return res.status(500).json({ message: 'Unable to export deployment configuration.' }); }
  });
  router.put('/tenants/:id/mobile-apps', async (req, res) => {
    try { validateMobileApps(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
    try {
      const config = await repository.save(req.params.id, req.body, req.user.email || String(req.user.id));
      if (!config) return res.status(404).json({ message: 'Tenant not found.' });
      return res.json({ success: true, configuration: config });
    } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to save app configuration.' }); }
  });
  return router;
}
