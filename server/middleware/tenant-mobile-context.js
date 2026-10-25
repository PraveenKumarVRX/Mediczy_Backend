import { mobileOrigin, validateMobileApps } from '../services/tenant-mobile-apps.service.js';

const productForPath = path => {
  if (/^\/api\/patient(?:\/|$)/.test(path)) return 'patient';
  if (/^\/api\/phlebotomy(?:\/|$)/.test(path)) return 'phlebo';
  if (/^\/api\/crm(?:\/|$)/.test(path)) return 'crm';
  if (/^\/api\/(?:field|team)(?:\/|$)/.test(path)) return 'smart-force';
  return null;
};
export function buildTenantMobileContext(resolveTenant) {
  return async (req, res, next) => {
    const product = productForPath(req.path);
    if (!product) return next();
    try {
      // Ignore X-Tenant-ID / forwarded-host: only the actual routed origin binds apps.
      const origin = mobileOrigin(`https://${req.get('host') || ''}`);
      const tenant = await resolveTenant(origin);
      if (!tenant) return next(); // Existing non-mobile hosts preserve their contracts.
      const config = tenant.settings?.mobileApps;
      if (config) validateMobileApps(config, config);
      if (tenant.status !== 'active' || !config?.enabled || !config.apps?.some(app => app.product === product)) {
        return res.status(403).json({ message: 'This app is not enabled for this organisation.' });
      }
      req.mobileTenant = { id: tenant.id, product, config };
      req.tenant = tenant;
      req.tenantId = tenant.id;
      req.tenantSource = 'mobile-origin';
      return next();
    } catch { return res.status(503).json({ message: 'Unable to resolve organisation app configuration.' }); }
  };
}
export const tenantMobileContext = buildTenantMobileContext(async origin => {
  const { tenantFromEnvironment } = await import('../services/tenant-mobile-runtime.js');
  const deployed = tenantFromEnvironment(origin);
  if (deployed) return deployed;
  const { tenantMobileRepository } = await import('../services/tenant-mobile-apps.repository.js');
  return tenantMobileRepository.findByOrigin(origin);
});
