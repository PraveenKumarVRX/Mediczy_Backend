/**
 * Real safety review found the original global IP-blocker unsafe to
 * deploy: in-memory state broken across PM2 cluster workers, no allowlist
 * (ran before /health), and no way to clear a false-positive block short
 * of restarting the app. Rewritten to reuse credentialStuffingGuard.js's
 * Redis-backed blocklist instead of a second in-memory store. These tests
 * cover both the new credentialStuffingGuard exports and the rewritten
 * ipBlocker middleware, against a mocked ioredis client (no live Redis
 * dependency).
 */
import { jest } from '@jest/globals';

function makeMockRedisClient() {
  const store = new Map();
  const ttls = new Map();
  return {
    get: jest.fn(async (key) => store.get(key) ?? null),
    set: jest.fn(async (key, value, _ex, seconds) => {
      store.set(key, value);
      if (seconds) ttls.set(key, seconds);
      return 'OK';
    }),
    incr: jest.fn(async (key) => {
      const next = (parseInt(store.get(key), 10) || 0) + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: jest.fn(async (key, seconds) => { ttls.set(key, seconds); return 1; }),
    ttl: jest.fn(async (key) => (ttls.has(key) ? ttls.get(key) : -1)),
    exists: jest.fn(async (key) => (store.has(key) ? 1 : 0)),
    del: jest.fn(async (key) => { store.delete(key); ttls.delete(key); return 1; }),
    keys: jest.fn(async (pattern) => {
      const prefix = pattern.replace('*', '');
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    }),
    on: jest.fn(),
    _store: store,
  };
}

describe('credentialStuffingGuard — general abuse tracking (isIPBlocked / recordRateLimitAbuse)', () => {
  let mockClient;
  let isIPBlocked, recordRateLimitAbuse, blockIP, unblockIP;

  beforeEach(async () => {
    jest.resetModules();
    mockClient = makeMockRedisClient();
    jest.unstable_mockModule('ioredis', () => ({ default: jest.fn(() => mockClient) }));
    const mod = await import('../middleware/credentialStuffingGuard.js');
    isIPBlocked = mod.isIPBlocked;
    recordRateLimitAbuse = mod.recordRateLimitAbuse;
    blockIP = mod.blockIP;
    unblockIP = mod.unblockIP;
  });

  test('an IP with no history is not blocked', async () => {
    const result = await isIPBlocked('1.2.3.4');
    expect(result.blocked).toBe(false);
  });

  test('fewer than 10 rate-limit violations does not block the IP', async () => {
    for (let i = 0; i < 9; i++) await recordRateLimitAbuse('5.6.7.8', '/api/some-route');
    const result = await isIPBlocked('5.6.7.8');
    expect(result.blocked).toBe(false);
  });

  test('the 10th violation blocks the IP for 24h, and isIPBlocked reports it', async () => {
    for (let i = 0; i < 10; i++) await recordRateLimitAbuse('9.9.9.9', '/api/some-route');
    const result = await isIPBlocked('9.9.9.9');
    expect(result.blocked).toBe(true);
    expect(result.ttl).toBeGreaterThan(0);
  });

  test('a rate-limit-abuse block shares the exact same blocklist as blockIP/unblockIP — one admin view covers both', async () => {
    for (let i = 0; i < 10; i++) await recordRateLimitAbuse('10.10.10.10', '/api/whatever');
    expect((await isIPBlocked('10.10.10.10')).blocked).toBe(true);

    // The real, already-live admin endpoint (server/routes/admin.route.js)
    // calls unblockIP for a manual override — must clear this block too.
    await unblockIP('10.10.10.10');
    expect((await isIPBlocked('10.10.10.10')).blocked).toBe(false);
  });

  test('a manual blockIP() call (admin-initiated) is also visible via isIPBlocked', async () => {
    await blockIP('11.11.11.11', 3600, 'manual test block');
    expect((await isIPBlocked('11.11.11.11')).blocked).toBe(true);
  });

  test('isIPBlocked fails open (not blocked) when Redis throws — must never lock everyone out because the store is down', async () => {
    mockClient.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await isIPBlocked('12.12.12.12');
    expect(result.blocked).toBe(false);
  });
});

describe('ipBlocker middleware (rateLimiter.middleware.js)', () => {
  let mockClient;
  let ipBlocker;

  beforeEach(async () => {
    jest.resetModules();
    mockClient = makeMockRedisClient();
    jest.unstable_mockModule('ioredis', () => ({ default: jest.fn(() => mockClient) }));
    const mod = await import('../middleware/rateLimiter.middleware.js');
    ipBlocker = mod.ipBlocker;
  });

  function mockReqRes({ path = '/api/whatever', ip = '203.0.113.5', statusCode = 200 } = {}) {
    const req = { path, headers: {}, ip, connection: { remoteAddress: ip }, originalUrl: path };
    const listeners = {};
    const res = {
      statusCode,
      on: jest.fn((event, cb) => { listeners[event] = cb; }),
      status: jest.fn(function (code) { this.statusCode = code; return this; }),
      json: jest.fn(),
      _fireFinish: () => listeners.finish && listeners.finish(),
    };
    return { req, res };
  }

  test('internal/loopback IPs bypass the guard entirely — real regression this fix closes (was globally unexempted)', async () => {
    const middleware = ipBlocker();
    const { req, res } = mockReqRes({ ip: '127.0.0.1' });
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('/health is always exempt, even for an already-blocked IP', async () => {
    for (let i = 0; i < 10; i++) {
      const m = ipBlocker();
      const { req, res } = mockReqRes({ ip: '198.51.100.9', statusCode: 429 });
      const next = jest.fn();
      await m(req, res, next);
      res._fireFinish();
      // recordRateLimitAbuse is deliberately fire-and-forget in the
      // middleware (must not hold up the response on a Redis write) — flush
      // microtasks so the write lands before the next iteration checks state.
      await new Promise((r) => setImmediate(r));
    }
    const middleware = ipBlocker();
    const { req, res } = mockReqRes({ path: '/health', ip: '198.51.100.9' });
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('an external IP that racks up 10 real 429s gets blocked on the 11th request', async () => {
    const ip = '198.51.100.42';
    for (let i = 0; i < 10; i++) {
      const middleware = ipBlocker();
      const { req, res } = mockReqRes({ ip, statusCode: 429 });
      const next = jest.fn();
      await middleware(req, res, next);
      res._fireFinish();
      await new Promise((r) => setImmediate(r));
    }
    const middleware = ipBlocker();
    const { req, res } = mockReqRes({ ip });
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('DISABLE_RATE_LIMIT=true bypasses the guard entirely', async () => {
    process.env.DISABLE_RATE_LIMIT = 'true';
    try {
      const middleware = ipBlocker();
      const { req, res } = mockReqRes({ ip: '203.0.113.99' });
      const next = jest.fn();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    } finally {
      delete process.env.DISABLE_RATE_LIMIT;
    }
  });
});
