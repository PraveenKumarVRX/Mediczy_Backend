import { randomUUID } from 'node:crypto';
export const MOBILE_PRODUCTS = ['patient', 'phlebo', 'crm', 'smart-force'];
export function mobileOrigin(input) {
  if (typeof input !== 'string' || !/^https:\/\//i.test(input) || /[\\\s?#]/.test(input)) throw new Error('Enter an HTTPS tenant URL without a path, query or fragment.');
  const url = new URL(input);
  if (url.username || url.password || url.pathname !== '/') throw new Error('Enter only the HTTPS tenant origin.');
  return url.origin;
}
export function validateMobileApps(input, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Mobile app configuration is required.');
  if (typeof input.enabled !== 'boolean') throw new Error('Choose whether mobile apps are enabled.');
  const origin = mobileOrigin(input.origin);
  if (!Array.isArray(input.apps) || !input.apps.length || input.apps.length > MOBILE_PRODUCTS.length) throw new Error('Configure at least one app product.');
  const seen = new Set();
  const apps = input.apps.map(app => {
    if (!app || !MOBILE_PRODUCTS.includes(app.product) || seen.has(app.product)) throw new Error('App products must be supported and unique.');
    seen.add(app.product);
    if (typeof app.name !== 'string' || !app.name.trim() || app.name.length > 100) throw new Error('Each app needs a name of at most 100 characters.');
    if (typeof app.appId !== 'string' || !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(app.appId)) throw new Error('Each app needs a valid package/bundle identifier.');
    if (app.registration !== 'disabled' && !(app.product === 'patient' && app.registration === 'open')) throw new Error('Only patient self-registration may be enabled.');
    if (app.product === 'phlebo' && !/^[A-Z0-9]{6}$/.test(app.ownerUid || '')) throw new Error('Phlebo requires the lab/hospital collection owner UID.');
    return { product: app.product, name: app.name.trim(), appId: app.appId, registration: app.registration, ...(app.product === 'phlebo' ? { ownerUid: app.ownerUid } : {}) };
  });
  if (new Set(apps.map(app => app.appId)).size !== apps.length) throw new Error('Each product needs a distinct package/bundle identifier.');
  return { enabled: input.enabled, origin, apps,
    deploymentId: previous.deploymentId || randomUUID(), revision: (Number(previous.revision) || 0) + 1 };
}
export function tenantMobileDiscovery(tenant) {
  const config = tenant?.settings?.mobileApps;
  if (tenant?.status !== 'active' || !config?.enabled || typeof config.deploymentId !== 'string') return null;
  // Revalidate persisted settings; old generic settings routes must not bypass schema.
  const validated = validateMobileApps(config, config);
  return { product: 'mediczy-mobile', mobileApiVersion: 1, apiBasePath: '/api',
    deploymentId: config.deploymentId, displayName: tenant.name,
    products: validated.apps.map(app => ({ id: app.product, registration: app.registration })),
    configurationRevision: config.revision,
  };
}
