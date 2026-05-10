/**
 * Credential Stuffing Guard Middleware
 *
 * Tracks failed login attempts per real client IP using Redis.
 * Applies progressive blocking:
 *   - 5  fails in 15 min  → block for 15 min
 *   - 15 fails in 1 hour  → block for 1 hour
 *   - 30 fails in 24 hrs  → block for 24 hours
 *
 * Reads real IP from Cloudflare's CF-Connecting-IP header first,
 * then X-Forwarded-For, then req.ip.
 */

import Redis from 'ioredis';

// Singleton Redis client (lazy-connect so server starts even if Redis is down)
let redis = null;

const getRedis = () => {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 500)),
    });
    redis.on('error', (err) => {
      // Suppress repeated errors — guard degrades gracefully when Redis is down
      if (err.code !== 'ECONNREFUSED') {
        console.warn('[CSGuard] Redis error:', err.message);
      }
    });
  }
  return redis;
};

// Progressive blocking thresholds
// [ windowSeconds, maxFailures, blockDurationSeconds, levelName ]
const THRESHOLDS = [
  { window: 15 * 60,      max: 5,  blockDuration: 15 * 60,      level: 'short'  },
  { window: 60 * 60,      max: 15, blockDuration: 60 * 60,      level: 'medium' },
  { window: 24 * 60 * 60, max: 30, blockDuration: 24 * 60 * 60, level: 'long'   },
];

/**
 * Extract the real client IP, preferring Cloudflare's CF-Connecting-IP
 * header which contains the original visitor IP before Cloudflare.
 */
const getClientIP = (req) => {
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP && cfIP.trim()) return cfIP.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }

  return req.ip || req.connection?.remoteAddress || 'unknown';
};

/**
 * Increment failure counter for one threshold level.
 * Returns the new count.
 */
const incrementCounter = async (r, level, ip, window) => {
  const key = `csguard:fails:${level}:${ip}`;
  const count = await r.incr(key);
  if (count === 1) {
    // Set TTL only on first increment
    await r.expire(key, window);
  }
  return count;
};

/**
 * Record a failed login attempt for the given IP.
 * Checks thresholds and blocks the IP if any is exceeded.
 */
const recordFailure = async (ip, endpoint) => {
  const r = getRedis();

  for (const { window, max, blockDuration, level } of THRESHOLDS) {
    let count;
    try {
      count = await incrementCounter(r, level, ip, window);
    } catch {
      // Redis unavailable — skip this threshold
      continue;
    }

    if (count >= max) {
      const blockKey = `csguard:blocked:${ip}`;
      const alreadyBlocked = await r.exists(blockKey).catch(() => 0);
      if (!alreadyBlocked) {
        const payload = JSON.stringify({
          ip,
          blockedAt: new Date().toISOString(),
          level,
          failCount: count,
          endpoint,
          autoBlock: true,
        });
        await r.set(blockKey, payload, 'EX', blockDuration).catch(() => {});
        console.warn(
          `[CSGuard] ⛔ IP ${ip} auto-blocked (${level}) — ${count} failures on ${endpoint}`
        );
      }
      break;
    }
  }
};

/**
 * Middleware: attach to any login endpoint.
 *
 * 1. Rejects request immediately if IP is in the blocklist.
 * 2. Intercepts the response; if the status indicates an auth failure
 *    (401 / 403, or a body with success:false), increments the counter.
 */
export const credentialStuffingGuard = async (req, res, next) => {
  const r = getRedis();
  const ip = getClientIP(req);

  // ── 1. Check blocklist ──────────────────────────────────────────────────
  let blocked = false;
  let ttl = 0;
  try {
    const blockKey = `csguard:blocked:${ip}`;
    const data = await r.get(blockKey);
    if (data) {
      blocked = true;
      ttl = await r.ttl(blockKey);
    }
  } catch {
    // Redis down — allow request through (fail open to avoid lockout)
  }

  if (blocked) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'IP_BLOCKED',
        message:
          'Too many failed login attempts. Your IP has been temporarily blocked.',
        retryAfter: Math.max(ttl, 0),
      },
    });
  }

  // ── 2. Intercept response to track auth failures ───────────────────────
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const statusCode = res.statusCode;
    const isAuthFailure =
      statusCode === 401 ||
      statusCode === 403 ||
      (statusCode >= 400 && body && body.success === false);

    if (isAuthFailure) {
      recordFailure(ip, req.originalUrl || req.path).catch(() => {});
    }

    return originalJson(body);
  };

  next();
};

// ── Admin helpers (used by admin routes) ─────────────────────────────────

/**
 * List all currently blocked IPs.
 * Returns array of { ip, blockedAt, level, failCount, endpoint, ttl, autoBlock }
 */
export const listBlockedIPs = async () => {
  const r = getRedis();
  const keys = await r.keys('csguard:blocked:*');
  if (!keys.length) return [];

  const results = [];
  for (const key of keys) {
    try {
      const raw = await r.get(key);
      const ttl = await r.ttl(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      results.push({ ...data, ttlSeconds: ttl });
    } catch {
      // skip malformed entries
    }
  }
  return results.sort((a, b) => new Date(b.blockedAt) - new Date(a.blockedAt));
};

/**
 * Manually block an IP for a given duration (seconds).
 */
export const blockIP = async (ip, durationSeconds = 24 * 60 * 60, reason = 'manual') => {
  const r = getRedis();
  const blockKey = `csguard:blocked:${ip}`;
  const payload = JSON.stringify({
    ip,
    blockedAt: new Date().toISOString(),
    level: 'manual',
    failCount: null,
    endpoint: null,
    autoBlock: false,
    reason,
  });
  await r.set(blockKey, payload, 'EX', durationSeconds);
};

/**
 * Unblock an IP.
 */
export const unblockIP = async (ip) => {
  const r = getRedis();
  await r.del(`csguard:blocked:${ip}`);
  // Also clear failure counters so it starts fresh
  for (const { level } of THRESHOLDS) {
    await r.del(`csguard:fails:${level}:${ip}`).catch(() => {});
  }
};

/**
 * Get failure stats for a specific IP.
 */
export const getIPStats = async (ip) => {
  const r = getRedis();
  const stats = {};
  for (const { level, window } of THRESHOLDS) {
    const key = `csguard:fails:${level}:${ip}`;
    const count = await r.get(key).catch(() => null);
    const ttl = await r.ttl(key).catch(() => -1);
    stats[level] = { count: parseInt(count) || 0, ttlSeconds: ttl, windowSeconds: window };
  }
  const blockKey = `csguard:blocked:${ip}`;
  const blockData = await r.get(blockKey).catch(() => null);
  const blockTTL = await r.ttl(blockKey).catch(() => -1);
  stats.blocked = blockData
    ? { ...JSON.parse(blockData), ttlSeconds: blockTTL }
    : null;
  return stats;
};
