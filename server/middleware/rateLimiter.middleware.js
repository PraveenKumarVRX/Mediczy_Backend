/**
 * Rate Limiter Middleware
 * Provides flexible rate limiting with multiple strategies
 * Supports per-route, per-user, and per-IP limiting
 */

import rateLimit from 'express-rate-limit';
import { execFile } from 'child_process';
import { getClientIp } from '../utils/clientIp.js';
import { isIPBlocked, recordRateLimitAbuse } from './credentialStuffingGuard.js';
let RedisStore, Redis;

const isTest = process.env.NODE_ENV === 'test';
if (!isTest) {
  RedisStore = (await import('rate-limit-redis')).default;
  Redis = (await import('ioredis')).default;
}

// In-memory store for development and test (fallback)
const memoryStore = new Map();

// Redis client for rate limiting (singleton)
let redisClient = null;
let redisStore = null;

/**
 * Initialize Redis store for rate limiting
 */
const initRedisStore = () => {
  if (isTest) {
    // In test mode, always use in-memory store
    return undefined;
  }
  if (redisStore) return redisStore;
  try {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT) || 6379;
    const redisPassword = process.env.REDIS_PASSWORD || undefined;
    redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: false,
      enableReadyCheck: true
    });
    redisClient.on('error', (err) => {
      console.warn('Rate limiter Redis error:', err.message);
    });
    redisClient.on('ready', () => {
      console.log('✅ Rate limiter Redis connected');
    });
    redisStore = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'rl:'
    });
    return redisStore;
  } catch (error) {
    console.warn('Redis not available for rate limiting:', error.message);
    return undefined;
  }
};

/**
 * Get store based on environment
 * Uses Redis in production for distributed rate limiting
 */
const getStore = () => {
  if (isTest) {
    // In test mode, always use in-memory store (undefined)
    return undefined;
  }
  // Always try Redis first (saves memory)
  const store = initRedisStore();
  if (store) return store;
  console.warn('Falling back to memory store for rate limiting');
  return undefined; // Use default memory store
};

/**
 * Custom key generator
 * Generates unique key based on IP, user ID, or API key
 */
const keyGenerator = (req) => {
  // Prioritize authenticated user ID
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  
  // Then API key
  if (req.headers['x-api-key']) {
    return `api:${req.headers['x-api-key']}`;
  }
  
  // Fallback to IP - real client IP behind Cloudflare, not the edge/proxy hop
  let ip = getClientIp(req);

  // Normalize IPv6 localhost to IPv4
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  
  return `ip:${ip}`;
};

/**
 * Auth limiter key generator
 * Separates limits per login route and user identifier to avoid cross-portal lockouts.
 */
const authKeyGenerator = (req) => {
  const routeKey = `${req.baseUrl || ''}${req.path || ''}`;
  const normalizedRoute = routeKey.replace(/\//g, ':') || 'unknown-route';

  const email = typeof req.body?.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';

  if (email) {
    return `auth:${normalizedRoute}:email:${email}`;
  }

  const ip = getClientIp(req);
  return `auth:${normalizedRoute}:ip:${ip}`;
};

/**
 * Second, IP-only key for the auth limiter's companion pass. The email-keyed
 * limiter above gives each *email* its own 5-attempt budget — legitimate for
 * shared-office IPs, but it means an attacker rotating through a list of
 * candidate emails from one IP never trips a limit at all (real incident:
 * 2026-08-11, credential-stuffing burst against /api/admin/login). This key
 * ignores email entirely, so one real IP gets one shared ceiling regardless
 * of how many different emails it tries.
 */
const authIpKeyGenerator = (req) => {
  const routeKey = `${req.baseUrl || ''}${req.path || ''}`;
  const normalizedRoute = routeKey.replace(/\//g, ':') || 'unknown-route';
  return `auth-ip:${normalizedRoute}:${getClientIp(req)}`;
};

/**
 * Custom handler for rate limit exceeded
 */
const limitExceededHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    }
  });
};

/**
 * Standard rate limiter configurations
 */
const rateLimitConfigs = {
  // Strict limit for auth endpoints (prevent brute force)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many login attempts. Please try again in 15 minutes.',
    skipSuccessfulRequests: true
  },

  // OTP generation limit — max 3 OTPs per identifier per 15 minutes
  otp: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    message: 'Too many OTP requests. Please wait 15 minutes before requesting another OTP.',
    skipSuccessfulRequests: false,
  },
  
  // Standard API limit
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'API rate limit exceeded. Please slow down.'
  },
  
  // Mobile app limit (more lenient)
  mobile: {
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Mobile API rate limit exceeded.'
  },
  
  // File upload limit
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 uploads per hour
    message: 'Upload limit exceeded. Try again later.'
  },
  
  // Search/expensive operations
  search: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: 'Search rate limit exceeded.'
  },
  
  // Webhook endpoints (very strict)
  webhook: {
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 500 per minute (for automated systems)
    message: 'Webhook rate limit exceeded.'
  },
  
  // Admin endpoints
  admin: {
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Admin API rate limit exceeded.'
  }
};

/**
 * Create rate limiter middleware
 * @param {string} type - Type of rate limit (auth, api, mobile, etc.)
 * @param {Object} customConfig - Override default config
 */
export const createRateLimiter = (type = 'api', customConfig = {}) => {
  const baseConfig = rateLimitConfigs[type] || rateLimitConfigs.api;
  const {
    keyGenerator: customKeyGenerator,
    handler: customHandler,
    ...restCustomConfig
  } = customConfig;
  
  return rateLimit({
    ...baseConfig,
    ...restCustomConfig,
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit headers
    store: getStore(),
    keyGenerator: customKeyGenerator || keyGenerator,
    handler: customHandler || limitExceededHandler,
    validate: false // Disable all validation including IPv6 check
  });
};

/**
 * Pre-configured rate limiters for common use cases
 */
/**
 * Alert handler for the IP-only auth limiter — this one tripping means a
 * single real IP has burned through a generous shared ceiling across every
 * email it tried on this route. Logs to syslog (same channel the resource
 * watchdog uses) so it's visible outside app logs, not just a console line.
 */
const authIpAlertHandler = (req, res) => {
  const ip = getClientIp(req);
  const route = `${req.baseUrl || ''}${req.path || ''}`;
  const msg = `SECURITY ALERT: auth rate-limit burst from ip=${ip} route=${route} — possible credential-stuffing`;
  console.warn(msg);
  execFile('logger', ['-t', 'mediczy-security', msg], () => {
    /* logger not available (e.g. non-Linux dev env) — console.warn above already fired */
  });
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts from this network. Please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    },
  });
};

const authLimiterByEmail = createRateLimiter('auth', { keyGenerator: authKeyGenerator });
// Higher ceiling than the per-email limiter (legitimate shared-office IPs need
// headroom), but shared across every email tried from that IP on this route —
// closes the email-rotation bypass the per-email limiter alone allows.
const authLimiterByIp = createRateLimiter('auth', {
  keyGenerator: authIpKeyGenerator,
  max: 20,
  handler: authIpAlertHandler,
});
export const authLimiter = [authLimiterByEmail, authLimiterByIp];
export const otpLimiter = createRateLimiter('otp');
export const apiLimiter = createRateLimiter('api');
export const mobileLimiter = createRateLimiter('mobile');
export const uploadLimiter = createRateLimiter('upload');
export const searchLimiter = createRateLimiter('search');
export const webhookLimiter = createRateLimiter('webhook');
export const adminLimiter = createRateLimiter('admin');

/**
 * Dynamic rate limiter based on user plan/tier
 */
export const tieredRateLimiter = (req, res, next) => {
  const userPlan = req.user?.plan || req.tenant?.plan || 'free';
  
  const limits = {
    free: 60,       // 60 requests/minute
    basic: 120,     // 120 requests/minute
    pro: 300,       // 300 requests/minute
    enterprise: 1000 // 1000 requests/minute
  };
  
  const limiter = createRateLimiter('api', {
    max: limits[userPlan] || limits.free
  });
  
  return limiter(req, res, next);
};

/**
 * Sliding window rate limiter (more accurate but requires Redis)
 */
export const slidingWindowLimiter = async (req, res, next) => {
  if (!process.env.REDIS_URL) {
    // Fall back to standard limiter
    return apiLimiter(req, res, next);
  }
  
  const key = keyGenerator(req);
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;
  const now = Date.now();
  
  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    
    // Remove old entries
    await redis.zremrangebyscore(key, 0, now - windowMs);
    
    // Count requests in current window
    const count = await redis.zcard(key);
    
    if (count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.'
        }
      });
    }
    
    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, Math.ceil(windowMs / 1000));
    
    // Set headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - count - 1);
    
    redis.disconnect();
    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    next(); // Fail open
  }
};

/**
 * IP-based blocking for repeated violations
 */
// Loopback + Docker-bridge exemption, matching globalLimiter's own skip
// logic in app.js exactly (see that file's comment on why it's the whole
// 172.16.0.0/12 block, not a single hardcoded bridge IP) — internal
// service-to-service calls can't be the abuse this guard exists to catch.
const INTERNAL_IP_RE = /^172\.(1[6-9]|2\d|3[01])\./;
function isInternalOrLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || INTERNAL_IP_RE.test(ip || '');
}

/**
 * Global rate-limit-abuse guard.
 *
 * Rewritten after a safety review found the original version unsafe to
 * deploy as a global, first-in-chain middleware: it tracked blocks in a
 * plain in-memory Map, which is broken under PM2 cluster mode (each worker
 * has its own Map, so violations/blocks aren't shared across workers) and
 * wiped on every restart; it had no allowlist, so it could block internal
 * traffic and even /health itself; and there was no way to clear a
 * false-positive block short of restarting the whole app.
 *
 * This version reuses credentialStuffingGuard.js's Redis-backed blocklist
 * (isIPBlocked/recordRateLimitAbuse) instead of inventing a second store —
 * same csguard:blocked:* keys the credential-stuffing guard already writes,
 * so a block from either cause shows up in the same admin list
 * (GET /api/admin/security/blocked-ips) and can be cleared with the same
 * unblock endpoint, cluster-safe, and survives a restart. Internal/
 * loopback traffic and the health endpoints are always exempt.
 */
export const ipBlocker = () => {
  return async (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === 'true' || req.path === '/health' || req.path === '/api/health') {
      return next();
    }

    const ip = getClientIp(req);
    if (isInternalOrLoopback(ip)) return next();

    const { blocked, ttl } = await isIPBlocked(ip);
    if (blocked) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'IP_BLOCKED',
          message: 'Too many violations from this IP. Temporarily blocked — try again later.',
          retryAfter: ttl,
        },
      });
    }

    res.on('finish', () => {
      if (res.statusCode === 429) {
        recordRateLimitAbuse(ip, req.originalUrl || req.path).catch(() => {});
      }
    });

    next();
  };
};

export default {
  createRateLimiter,
  authLimiter,
  apiLimiter,
  mobileLimiter,
  uploadLimiter,
  searchLimiter,
  webhookLimiter,
  adminLimiter,
  tieredRateLimiter,
  slidingWindowLimiter,
  ipBlocker
};
