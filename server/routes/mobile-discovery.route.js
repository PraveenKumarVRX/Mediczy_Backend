import express from 'express';
import rateLimit from 'express-rate-limit';

const PRODUCTS = new Set(['patient', 'phlebo', 'crm', 'smart-force']);

// Explicit provisioning only: never infer deployment identity from a hostname,
// generate it per process, or advertise products a deployment has not enabled.
export function discoveryConfiguration(env = process.env) {
  const deploymentId = env.MOBILE_DEPLOYMENT_ID;
  const displayName = env.MOBILE_DISPLAY_NAME;
  const products = (env.MOBILE_PRODUCTS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(deploymentId || '') ||
      !displayName?.trim() || displayName.length > 100 || !products.length ||
      products.some(product => !PRODUCTS.has(product)) ||
      (products.includes('patient') && !/^[1-9][0-9]*$/.test(env.MOBILE_PATIENT_CLINIC_ID || ''))) return null;
  return {
    product: 'mediczy-mobile', mobileApiVersion: 1, apiBasePath: '/api',
    deploymentId, displayName: displayName.trim(),
    products: [...new Set(products)].map(id => ({
      id, registration: id === 'patient' && env.MOBILE_PATIENT_REGISTRATION === 'open' ? 'open' : 'disabled',
    })),
  };
}

export function buildMobileDiscoveryRouter({ env = process.env, limiter, resolveTenant } = {}) {
  const router = express.Router();
  router.get('/discovery', limiter || rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let config;
    try {
      config = resolveTenant ? await resolveTenant(req) : discoveryConfiguration(env);
    } catch { return res.status(503).json({ message: 'Mobile connection is temporarily unavailable.' }); }
    if (!config) return res.status(503).json({ code: 'mobile_not_configured', message: 'Mobile connection is not configured. Contact your organisation administrator.' });
    return res.json(config);
  });
  return router;
}

// Lazy import keeps contract tests and unconfigured installations free of DB work.
export default buildMobileDiscoveryRouter({ resolveTenant: async req => {
  const { mobileOrigin, tenantMobileDiscovery } = await import('../services/tenant-mobile-apps.service.js');
  const origin = mobileOrigin(`https://${req.get('host') || ''}`);
  const { tenantFromEnvironment } = await import('../services/tenant-mobile-runtime.js');
  const deployed = tenantFromEnvironment(origin);
  if (deployed) return tenantMobileDiscovery(deployed);
  const { tenantMobileRepository } = await import('../services/tenant-mobile-apps.repository.js');
  const tenant = await tenantMobileRepository.findByOrigin(origin);
  if (tenant) return tenantMobileDiscovery(tenant);
  // Dedicated deployments may use explicit provisioning instead of admin storage.
  // A provisioned identity alone must never advertise on arbitrary virtual hosts.
  return envOriginMatches(origin) ? discoveryConfiguration() : null;
} });
function envOriginMatches(origin) {
  try { return new URL(process.env.MOBILE_PUBLIC_ORIGIN).origin === origin; } catch { return false; }
}
