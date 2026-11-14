import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The integration layer (server/integrations/): every third-party call gets a
 * kill switch, a configuration check, a host allow-list, a timeout, a circuit
 * breaker, retries only where safe, and metrics without payloads. Google
 * Places is the first vendor moved onto it — and in production it no longer
 * answers a failure with an invented Bangalore address.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: jest.fn(), connect: jest.fn() } }));

const { defineIntegration, IntegrationError } = await import('../integrations/core/integration.js');
const registry = await import('../integrations/core/registry.js');
const { googlePlaces } = await import('../integrations/catalog.js');
const places = await import('../integrations/google-places.js');
const { sendIntegrationError } = await import('../integrations/http.js');
const { buildAppSpec } = await import('../openapi/index.js');
const { validateAgainst } = await import('../openapi/contract.js');

let seq = 0;
const make = (over = {}) => defineIntegration({
  id: `test-vendor-${seq += 1}`, name: 'Test vendor', category: 'maps', dataClass: 'none',
  allowedHosts: ['api.vendor.test'], requiredEnv: [], timeoutMs: 200,
  breaker: { threshold: 3, cooldownMs: 60_000 }, retry: { attempts: 2, backoffMs: 1 }, ...over,
});
const reply = (status, body) => async () => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)), headers: new Map() });

describe('defining an integration', () => {
  it('rejects a bad id, a missing category or data class', () => {
    expect(() => defineIntegration({ id: 'Bad_ID', name: 'x', category: 'maps', dataClass: 'none' })).toThrow(/kebab-case/);
    expect(() => defineIntegration({ id: 'ok-id', name: 'x', dataClass: 'none' })).toThrow(/category/);
    expect(() => defineIntegration({ id: 'ok-id', name: 'x', category: 'maps' })).toThrow(/dataClass/);
  });
});

describe('before anything leaves the box', () => {
  afterEach(() => { delete process.env.INTEGRATION_TEST_VENDOR_KILL_ENABLED; delete process.env.TEST_VENDOR_KEY; });

  it('the kill switch stops every call', async () => {
    const vendor = make({ id: 'test-vendor-kill' });
    process.env.INTEGRATION_TEST_VENDOR_KILL_ENABLED = 'false';
    const fetchImpl = jest.fn();
    await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_DISABLED', status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vendor.status()).toMatchObject({ enabled: false, killSwitch: 'INTEGRATION_TEST_VENDOR_KILL_ENABLED' });
  });

  it('a missing setting refuses the call and is reported by name only', async () => {
    const vendor = make({ requiredEnv: ['TEST_VENDOR_KEY'] });
    const fetchImpl = jest.fn();
    await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vendor.status()).toMatchObject({ configured: false, missingEnv: ['TEST_VENDOR_KEY'] });
    process.env.TEST_VENDOR_KEY = 'super-secret-value';
    expect(JSON.stringify(vendor.status())).not.toContain('super-secret-value');
  });

  it('refuses a host the vendor does not use, and plain http', async () => {
    const vendor = make();
    const fetchImpl = jest.fn();
    await expect(vendor.fetchJson('https://evil.example/steal', { fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_HOST_NOT_ALLOWED' });
    await expect(vendor.fetchJson('http://api.vendor.test/x', { fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_HOST_NOT_ALLOWED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never follows a redirect', async () => {
    const vendor = make();
    const fetchImpl = jest.fn(reply(200, { ok: true }));
    await vendor.fetchJson('https://api.vendor.test/x', { fetchImpl });
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
  });
});

describe('while calling', () => {
  it('times out a vendor that hangs', async () => {
    const vendor = make({ retry: { attempts: 0 } });
    const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl: hang, timeoutMs: 30 })).rejects.toMatchObject({ code: 'INTEGRATION_TIMEOUT' });
  });

  it('retries an idempotent call on a 5xx, then succeeds', async () => {
    const vendor = make();
    const fetchImpl = jest.fn().mockImplementationOnce(reply(503, {})).mockImplementationOnce(reply(200, { ok: 1 }));
    await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl })).resolves.toMatchObject({ status: 200, body: { ok: 1 } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(vendor.status().metrics).toMatchObject({ retries: 1, ok: 1, failed: 1 });
  });

  it('never retries a POST unless told it is idempotent', async () => {
    const vendor = make();
    const fetchImpl = jest.fn(reply(503, {}));
    await expect(vendor.fetchJson('https://api.vendor.test/x', { method: 'POST', body: {}, fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_UPSTREAM_ERROR' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry or trip the breaker on a 4xx — that is the vendor\'s answer', async () => {
    const vendor = make();
    const fetchImpl = jest.fn(reply(400, { error: 'bad' }));
    for (let i = 0; i < 5; i += 1) {
      await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_REJECTED', upstreamStatus: 400 });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(vendor.status().circuit).toBe('CLOSED');
  });

  it('opens the breaker after repeated failures and then fails fast', async () => {
    const vendor = make({ retry: { attempts: 0 } });
    const fetchImpl = jest.fn(reply(500, {}));
    for (let i = 0; i < 3; i += 1) await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl })).rejects.toBeInstanceOf(IntegrationError);
    await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl })).rejects.toMatchObject({ code: 'INTEGRATION_CIRCUIT_OPEN' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(vendor.status().circuit).toBe('OPEN');
  });

  it('keeps a separate breaker per key (e.g. per tenant)', async () => {
    const vendor = make({ retry: { attempts: 0 } });
    const fail = jest.fn(reply(500, {}));
    for (let i = 0; i < 3; i += 1) await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl: fail, key: 'tenant-a' })).rejects.toBeTruthy();
    await expect(vendor.fetchJson('https://api.vendor.test/x', { fetchImpl: reply(200, {}), key: 'tenant-b' })).resolves.toMatchObject({ status: 200 });
  });

  it('refuses an unreadable answer as a bad response, without echoing it', async () => {
    const vendor = make();
    const fetchImpl = async () => ({ status: 200, text: async () => '<html>patient: Ravi</html>', headers: new Map() });
    const error = await vendor.fetchJson('https://api.vendor.test/x', { fetchImpl }).catch((e) => e);
    expect(error).toMatchObject({ code: 'INTEGRATION_BAD_RESPONSE', status: 502 });
    expect(error.message).not.toContain('Ravi');
    expect(JSON.stringify(vendor.status())).not.toContain('Ravi');
  });
});

describe('the catalogue', () => {
  it('lists every vendor, honestly marked, and its status matches the contract', () => {
    const { summary, integrations } = registry.statusAll();
    expect(summary.total).toBeGreaterThanOrEqual(19);
    expect(integrations.find((i) => i.id === 'google-places').managed).toBe('core');
    expect(integrations.find((i) => i.id === 'smartcrm').managed).toBe('own-client');
    expect(integrations.find((i) => i.id === 'smartcrm').health).toHaveProperty('tenantBreakers');
    const spec = buildAppSpec();
    for (const item of integrations) {
      expect([item.id, validateAgainst(spec, { $ref: '#/components/schemas/IntegrationStatus' }, item)]).toEqual([item.id, []]);
    }
  });

  it('every vendor that receives health data is marked phi', () => {
    const phi = registry.list().filter((i) => i.dataClass === 'phi').map((i) => i.id);
    for (const id of ['abdm', 'nhcx', 'smartcrm', 'whatsapp-cloud', 'aws-ses', 'livekit', 'llm-groq', 'llm-openai', 'isha']) expect(phi).toContain(id);
  });

  it('refuses a vendor registered twice', () => {
    expect(() => registry.register(make({ id: 'google-places' }))).toThrow(/registered twice/);
  });
});

describe('Google Places on the core', () => {
  beforeEach(() => { process.env.GOOGLE_PLACES_API_KEY = 'test-key'; googlePlaces._reset(); });
  afterEach(() => { delete process.env.GOOGLE_PLACES_API_KEY; });

  it('sends the key to Google only, and returns predictions', async () => {
    const fetchImpl = jest.fn(reply(200, { status: 'OK', predictions: [{ place_id: 'p1', description: 'Anna Nagar, Chennai' }] }));
    const out = await places.autocomplete({ input: 'anna' }, { fetchImpl });
    expect(out).toEqual([{ place_id: 'p1', description: 'Anna Nagar, Chennai' }]);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.host).toBe('maps.googleapis.com');
    expect(url.searchParams.get('key')).toBe('test-key');
  });

  it('ZERO_RESULTS is an empty answer, not an error', async () => {
    await expect(places.geocode({ address: 'nowhere' }, { fetchImpl: reply(200, { status: 'ZERO_RESULTS', results: [] }) })).resolves.toEqual([]);
  });

  it('REQUEST_DENIED is an integration error, never an empty or invented answer', async () => {
    await expect(places.autocomplete({ input: 'anna' }, { fetchImpl: reply(200, { status: 'REQUEST_DENIED' }) }))
      .rejects.toMatchObject({ code: 'INTEGRATION_UPSTREAM_ERROR', integration: 'google-places' });
  });
});

describe('the address service in production', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; googlePlaces._reset(); });

  it('raises 503 instead of returning "123 MG Road, Bangalore" when the key is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { default: service } = await import('../services/google-places.service.js');
    await expect(service.getPlaceDetails('anything')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED', status: 503 });
    await expect(service.autocomplete('MG Road')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
  });

  it('still offers the development fixtures outside production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { default: service } = await import('../services/google-places.service.js');
    const details = await service.getPlaceDetails('x');
    expect(details.city).toBe('Bangalore');
  });

  it('the routes pass the integration error on as 503 with a stable code', () => {
    const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    sendIntegrationError(res, new IntegrationError('INTEGRATION_CIRCUIT_OPEN', 'Google Places & Geocoding is temporarily unavailable.', { integration: 'google-places' }), 'x');
    expect(res.code).toBe(503);
    expect(res.headers['Retry-After']).toBe('60');
    expect(res.body).toEqual({ success: false, code: 'INTEGRATION_CIRCUIT_OPEN', message: 'Google Places & Geocoding is temporarily unavailable.', retryable: true });
    const plain = { ...res, status(c) { this.code = c; return this; } };
    sendIntegrationError(plain, new Error('db exploded: password=hunter2'), 'Address lookup failed');
    expect(plain.code).toBe(500);
    expect(JSON.stringify(plain.body)).not.toContain('hunter2');
  });

  it('no direct axios call to Google is left in the service', () => {
    const src = readFileSync(join(ROOT, 'services/google-places.service.js'), 'utf8');
    expect(src).not.toMatch(/axios/);
    expect(src).not.toMatch(/maps\.googleapis\.com/);
  });
});
