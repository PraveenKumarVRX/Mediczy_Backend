/**
 * Rate Limiter Middleware
 * Provides flexible rate limiting with multiple strategies
 * Supports per-route, per-user, and per-IP limiting
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// In-memory store for development (fallback)
const memoryStore = new Map();

/**
 * Get store based on environment
 * Uses Redis in production for distributed rate limiting
 */
const getStore = () => {
  if (process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
    try {
      const Redis = require('ioredis');
      const client = new Redis(process.env.REDIS_URL);
      
      return new RedisStore({
        sendCommand: (...args) => client.call(...args),
        prefix: 'rl:'
      });
    } catch (error) {
      console.warn('Redis not available, using memory store for rate limiting');
    }
  }
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
  
  // Fallback to IP
  const ip = req.ip || 
    req.headers['x-forwarded-for']?.split(',')[0] || 
    req.connection.remoteAddress;
  return `ip:${ip}`;
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
  
  return rateLimit({
    ...baseConfig,
    ...customConfig,
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit headers
    store: getStore(),
    keyGenerator,
    handler: limitExceededHandler
  });
};

/**
 * Pre-configured rate limiters for common use cases
 */
export const authLimiter = createRateLimiter('auth');
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
export const ipBlocker = () => {
  const blockedIPs = new Map();
  const violations = new Map();
  const BLOCK_THRESHOLD = 10; // Block after 10 violations
  const BLOCK_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0];
    
    // Check if IP is blocked
    const blockedUntil = blockedIPs.get(ip);
    if (blockedUntil && blockedUntil > Date.now()) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_BLOCKED',
          message: 'Your IP has been blocked due to repeated violations.',
          blockedUntil: new Date(blockedUntil).toISOString()
        }
      });
    }
    
    // Track violations on rate limit
    res.on('finish', () => {
      if (res.statusCode === 429) {
        const count = (violations.get(ip) || 0) + 1;
        violations.set(ip, count);
        
        if (count >= BLOCK_THRESHOLD) {
          blockedIPs.set(ip, Date.now() + BLOCK_DURATION);
          violations.delete(ip);
          console.warn(`IP ${ip} blocked for repeated rate limit violations`);
        }
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
