/**
 * The one list of every third-party API Mediqzy talks to. Registering is how
 * a vendor becomes visible on GET /api/admin/integrations; calling through
 * integration.fetchJson()/call() is how its traffic becomes managed.
 */
const integrations = new Map();

export function register(integration) {
  if (integrations.has(integration.id)) throw new Error(`integration ${integration.id} registered twice`);
  integrations.set(integration.id, integration);
  return integration;
}

export function get(id) {
  const integration = integrations.get(id);
  if (!integration) throw new Error(`unknown integration: ${id}`);
  return integration;
}

export const list = () => [...integrations.values()];

export function statusAll() {
  const items = list().map((i) => i.status()).sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  const count = (pred) => items.filter(pred).length;
  return {
    summary: {
      total: items.length,
      managedByCore: count((i) => i.managed === 'core'),
      ownClient: count((i) => i.managed === 'own-client'),
      unmanaged: count((i) => i.managed === 'unmanaged'),
      notConfigured: count((i) => !i.configured),
      disabled: count((i) => !i.enabled),
      circuitOpen: count((i) => i.circuit === 'OPEN'),
      handlesPhi: count((i) => i.dataClass === 'phi'),
    },
    integrations: items,
  };
}

export default { register, get, list, statusAll };
