import { validateMobileApps, mobileOrigin } from './tenant-mobile-apps.service.js';
/** Non-secret snapshot for independently deployed tenant servers. */
export function mobileDeploymentEnvironment(tenant) {
  const config = tenant.settings?.mobileApps;
  if (!config) return { MOBILE_TENANT_CONFIGURATION: '' };
  validateMobileApps(config, config);
  return { MOBILE_TENANT_CONFIGURATION: JSON.stringify({ id: tenant.id, name: tenant.name, status: tenant.status, settings: { mobileApps: config } }) };
}
export function tenantFromEnvironment(origin, env = process.env) {
  if (!env.MOBILE_TENANT_CONFIGURATION) return null;
  const tenant = JSON.parse(env.MOBILE_TENANT_CONFIGURATION);
  const config = tenant?.settings?.mobileApps;
  validateMobileApps(config, config);
  if (!Number.isSafeInteger(Number(tenant.id)) || Number(tenant.id) < 1) throw new Error('Invalid deployed tenant identity.');
  // Dedicated server snapshots cannot resolve an unrelated host via the registry.
  if (mobileOrigin(config.origin) !== origin) throw new Error('This hostname does not belong to the deployed tenant.');
  return tenant;
}
