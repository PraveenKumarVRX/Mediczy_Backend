/** Explicit transport adapters; no global fetch/axios monkey patching. */
import './catalog.js';
import { get, list } from './core/registry.js';

export function integrationForUrl(value) {
  const url = new URL(typeof value === 'string' || value instanceof URL ? value : value.url);
  const configuredOrigins = { ABDM_BASE_URL: 'abdm', ABHA_API_BASE_URL: 'abdm', NHCX_ENDPOINT: 'nhcx', ISHA_INC_URL: 'isha', SARVAM_URL: 'llm-sarvam', INFOBIP_BASE_URL: 'infobip' };
  for (const [name, id] of Object.entries(configuredOrigins)) {
    try { if (process.env[name] && new URL(process.env[name]).origin === url.origin) return get(id); } catch { /* Invalid configuration is rejected by the vendor-bound adapter. */ }
  }
  return list().find(integration => integration.id !== 'smartcrm' && integration.status().allowedHosts.some(host =>
    host.startsWith('.') ? url.hostname === host.slice(1) || url.hostname.endsWith(host) : url.hostname === host));
}

export function createManagedFetch(fetchImpl = globalThis.fetch, vendor) {
  return async (input, options = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const integration = vendor ? get(vendor) : integrationForUrl(url);
    if (!integration) return fetchImpl(input, options);
    integration.assertUrl(url);
    const method = String(options.method || input.method || 'GET').toUpperCase();
    const originalSignal = options.signal || input.signal;
    const bodyDeadline = AbortSignal.timeout(integration.status().timeoutMs);
    return integration.call(signal => fetchImpl(input, {
      ...options, redirect: 'error', signal: AbortSignal.any([signal, bodyDeadline, ...(originalSignal ? [originalSignal] : [])]),
    }), { idempotent: ['GET', 'HEAD', 'OPTIONS'].includes(method), statusOf: response => response.status,
      timeoutMs: options.integrationTimeoutMs,
      configuration: credentialConfigured(integration, { ...options, url }),
      isRetryable: error => !originalSignal?.aborted && ['INTEGRATION_UNAVAILABLE', 'INTEGRATION_TIMEOUT', 'INTEGRATION_UPSTREAM_ERROR'].includes(error.code) });
  };
}

export const managedFetch = (...args) => createManagedFetch(globalThis.fetch)(...args);
export const vendorFetch = id => (...args) => createManagedFetch(globalThis.fetch, id)(...args);

// Wrap the adapter, after Axios has merged defaults/headers/URL and before I/O.
export function manageAxios(instance, axiosModule, vendor) {
  instance.interceptors.request.use(config => {
    const url = new URL(config.url, config.baseURL || undefined).toString();
    const integration = vendor ? get(vendor) : integrationForUrl(url);
    if (!integration) return config;
    integration.assertUrl(url);
    const adapter = axiosModule.getAdapter(config.adapter || instance.defaults.adapter);
    config.adapter = request => integration.call(signal => adapter({
      ...request, signal: request.signal ? AbortSignal.any([signal, request.signal]) : signal,
      maxRedirects: 0, timeout: Math.min(Number(request.timeout) || integration.status().timeoutMs, integration.status().timeoutMs),
    }), { idempotent: ['get', 'head', 'options'].includes(String(request.method || 'get').toLowerCase()),
      preserveError: true, statusOf: response => response.status,
      configuration: credentialConfigured(integration, { ...request, url }) });
    config.maxRedirects = 0;
    return config;
  });
  return instance;
}

/** SDK calls cannot always be cancelled. Their own timeout must also be set. */
export function sdkCall(id, fn, options = {}) {
  return get(id).call(fn, { preserveError: true, ...options });
}

export function assertSdkEndpoint(id, endpoint) { return get(id).assertUrl(endpoint); }

function credentialConfigured(integration, request) {
  if (integration.configured()) return true;
  const headers = Object.fromEntries(new Headers(request.headers || {}));
  const suppliedAuth = /^(?:Bearer|Basic|App)\s+(?!undefined$|null$)\S+/i.test(headers.authorization || '');
  if (['llm-openai', 'llm-groq', 'llm-sarvam', 'isha'].includes(integration.id) && suppliedAuth) return true;
  if (integration.id === 'elevenlabs' && headers['xi-api-key']) return true;
  let payload = request.data ?? request.body;
  try { if (typeof payload === 'string') payload = JSON.parse(payload); } catch { payload = null; }
  if (integration.id === 'isha' && new URL(request.url).pathname === '/auth/login') return Boolean(payload?.username && payload?.password);
  if (!['twilio', 'whatsapp-cloud', 'gupshup', 'infobip', 'razorpay'].includes(integration.id)) return false;
  return Boolean(request.auth?.username && request.auth?.password || suppliedAuth || headers.apikey ||
    (integration.id === 'whatsapp-cloud' && (payload?.access_token || (request.url && new URL(request.url).searchParams.get('access_token')))));
}
