import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Audit fixes M1, M6, M9, M19, M21, M23, M24 (2026-11-14). Behaviour is tested
 * where the code can run alone; route files that import models and the
 * database are checked at the source, and verified live after deploy.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

const fakeRes = () => {
  const headers = {};
  const handlers = {};
  const res = {
    statusCode: 200,
    getHeader: (k) => headers[k.toLowerCase()],
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    set(k, v) { headers[k.toLowerCase()] = v; return this; },
    writeHead: jest.fn(),
    on: (event, fn) => { (handlers[event] ||= []).push(fn); },
    emit: (event) => (handlers[event] || []).forEach((fn) => fn()),
    status(c) { this.statusCode = c; return this; },
    json: jest.fn(function json(body) { this.body = body; return this; }),
    headers,
  };
  return res;
};

describe('M21: every 429 carries Retry-After', () => {
  it('adds a default to a 429 that has none', async () => {
    const { ensureRetryAfter } = await import('../middleware/retry-after.middleware.js');
    const res = fakeRes();
    ensureRetryAfter({}, res, () => {});
    res.writeHead(429);
    expect(res.headers['retry-after']).toBe('60');
  });

  it('never overrides a limiter\'s own value, and leaves other statuses alone', async () => {
    const { ensureRetryAfter } = await import('../middleware/retry-after.middleware.js');
    const own = fakeRes();
    ensureRetryAfter({}, own, () => {});
    own.setHeader('Retry-After', '17');
    own.writeHead(429);
    expect(own.headers['retry-after']).toBe('17');
    const ok = fakeRes();
    ensureRetryAfter({}, ok, () => {});
    ok.writeHead(200);
    expect(ok.headers['retry-after']).toBeUndefined();
  });

  it('the OTP cooldown says exactly how long, and the backstop is mounted', () => {
    expect(src('controller/otp.controller.js')).toMatch(/res\.set\('Retry-After', String\(Math\.max\(1, Math\.ceil\(cooldownCheck\.retryAfterSeconds/);
    expect(src('app.js')).toMatch(/app\.use\(ensureRetryAfter\)/);
  });
});

describe('M19: duplicate-request protection', () => {
  const redisStore = new Map();
  const redis = {
    set: jest.fn(async (k, v, ...args) => { if (args.includes('NX') && redisStore.has(k)) return null; redisStore.set(k, v); return 'OK'; }),
    get: jest.fn(async (k) => redisStore.get(k) ?? null),
    del: jest.fn(async (k) => { redisStore.delete(k); return 1; }),
  };

  it('keys on the verified account, so a retry after a token refresh still replays', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../config/redis-hardened.js', () => ({ redisCache: () => redis }));
    const mod = await import('../middleware/idempotency.middleware.js');
    const mw = (mod.idempotency || mod.default)();
    const req = (auth) => ({
      method: 'POST', path: '/book', baseUrl: '/api/appointments', originalUrl: '/api/appointments/book',
      rateLimitAccountKey: 'account:user:42', get: (h) => ({ 'idempotency-key': 'retry-key-1', authorization: auth }[h.toLowerCase()]), headers: {},
    });
    redisStore.clear();
    const first = fakeRes();
    await mw(req('Bearer old-token'), first, () => {});
    const claimedKey = [...redisStore.keys()][0];
    expect(claimedKey).toMatch(/^idem:a[0-9a-f]{16}:POST:/);
    first.statusCode = 201;
    first.json({ ok: true });
    await new Promise((r) => setImmediate(r));
    const retry = fakeRes();
    const next = jest.fn();
    await mw(req('Bearer refreshed-token'), retry, next);
    expect(next).not.toHaveBeenCalled();
    expect(retry.statusCode).toBe(201);
  });

  it('a response sent without res.json releases the claim instead of blocking retries for 24 hours', async () => {
    const mod = await import('../middleware/idempotency.middleware.js');
    const mw = (mod.idempotency || mod.default)();
    redisStore.clear();
    const res = fakeRes();
    await mw({ method: 'POST', path: '/x', baseUrl: '', originalUrl: '/x', rateLimitAccountKey: 'account:user:7', get: (h) => (h.toLowerCase() === 'idempotency-key' ? 'k-send-1' : undefined), headers: {} }, res, () => {});
    expect(redisStore.size).toBe(1);
    res.emit('finish');
    await new Promise((r) => setImmediate(r));
    expect(redisStore.size).toBe(0);
  });
});

describe('M23: the login token, not a header, decides the tenant', () => {
  it('HR authentication no longer falls back to X-Tenant-ID or ?tenantId', () => {
    const line = src('routes/hrms.route.js').split('\n').find((l) => l.includes('let tenantId = decoded.organization_id'));
    expect(line).not.toMatch(/x-tenant-id|req\.query\.tenantId/);
  });

  it('mobile multitenancy ranks the token first and gates the header', () => {
    const mt = src('middleware/multitenancy.middleware.js');
    expect(mt.indexOf('tokenTenant')).toBeLessThan(mt.indexOf("req.headers['x-tenant-id']"));
    expect(mt).toMatch(/process\.env\.ALLOW_TENANT_HEADER === 'true' && !req\.user/);
  });
});

describe('M24: doctors show their registration number, not an invented rating', () => {
  const triage = src('routes/medical-ai.route.js');
  it('the triage list selects and returns registrationNumber', () => {
    expect(triage).toMatch(/'registrationNumber',/);
    expect(triage).toMatch(/registrationNumber: doc\.registrationNumber \|\| null/);
  });
  it('no hard-coded 4.5 rating', () => {
    expect(triage).not.toMatch(/rating: 4\.5/);
  });
});

describe('M6, M1, M9: routes that were missing or unreachable', () => {
  it('a patient can decline a call on their own appointment, and the doctor is told', () => {
    const calls = src('routes/call-notification.route.js');
    expect(calls).toMatch(/router\.post\('\/decline', authUser/);
    expect(calls).toMatch(/WHERE id = :appointmentId AND "userId" = :userId/);
    expect(calls).toMatch(/emit\('call-declined'/);
    expect(calls).not.toMatch(/WHERE user_id = :patientId/); // the old end-call update matched nothing
    expect((src('middleware/ringFencing.js').match(/'\/api\/call-notification\/decline'/g) || []).length).toBe(2);
  });

  it('medicine search honours the app\'s q, and a medicine opens by id or CIMS id', () => {
    const pharmacy = src('routes/pharmacy.route.js');
    expect(pharmacy).toMatch(/req\.query\.search \|\| req\.query\.q/);
    expect(pharmacy.indexOf("router.get('/medicines/:id'")).toBeGreaterThan(pharmacy.indexOf("router.get('/medicines',"));
    expect(pharmacy.indexOf("router.get('/medicines/:id'")).toBeLessThan(pharmacy.indexOf("router.get('/medicines/:id/alternatives'"));
  });

  it('a shared report link opens without an account (the signed token is the authorisation)', () => {
    expect(src('middleware/ringFencing.js')).toMatch(/'\/api\/reports\/shared\/',/);
    expect(src('routes/reports.route.js')).toMatch(/payload\?\.t !== 'report_share'/);
  });
});
