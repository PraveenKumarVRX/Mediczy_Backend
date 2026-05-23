/**
 * Redis Cache Service
 * Provides caching functionality for frequently accessed data
 */

import redis from 'redis';

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      // redis v5: use socket+password+database (not legacy host/port; not url+socket combined)
      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          reconnectStrategy: (attempts) => Math.min(attempts * 100, 3000)
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB || '0', 10),
      });

      this.client.on('connect', () => {
        console.log('✓ Redis cache connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('Redis cache error:', err.message);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('Redis cache disconnected');
        this.isConnected = false;
      });

      await this.client.connect();

    } catch (error) {
      console.error('Failed to initialize Redis cache:', error.message);
      console.log('Cache service will operate in fallback mode (no caching)');
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null
   */
  async get(key) {
    if (!this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
   */
  async set(key, value, ttl = 300) {
    if (!this.isConnected) return false;

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    if (!this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete all keys matching pattern
   * @param {string} pattern - Key pattern (e.g., "claims:*")
   */
  async deletePattern(pattern) {
    if (!this.isConnected) return false;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error.message);
      return false;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   */
  async exists(key) {
    if (!this.isConnected) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists check error for key ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Increment counter
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment (default: 1)
   */
  async increment(key, amount = 1) {
    if (!this.isConnected) return 0;

    try {
      return await this.client.incrBy(key, amount);
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error.message);
      return 0;
    }
  }

  /**
   * Get or set pattern - get from cache or execute function and cache result
   * @param {string} key - Cache key
   * @param {Function} fn - Function to execute if cache miss
   * @param {number} ttl - Time to live in seconds
   */
  async getOrSet(key, fn, ttl = 300) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - execute function
    const result = await fn();

    // Cache the result
    await this.set(key, result, ttl);

    return result;
  }

  /**
   * Cache dashboard statistics
   */
  async cacheDashboardStats(hospitalId, stats, ttl = 300) {
    const key = `dashboard:stats:${hospitalId}`;
    return await this.set(key, stats, ttl);
  }

  /**
   * Get cached dashboard statistics
   */
  async getDashboardStats(hospitalId) {
    const key = `dashboard:stats:${hospitalId}`;
    return await this.get(key);
  }

  /**
   * Invalidate dashboard cache for hospital
   */
  async invalidateDashboard(hospitalId) {
    const pattern = `dashboard:*:${hospitalId}`;
    return await this.deletePattern(pattern);
  }

  /**
   * Cache claim list
   */
  async cacheClaimList(hospitalId, filters, claims, ttl = 60) {
    const filterKey = JSON.stringify(filters);
    const key = `claims:list:${hospitalId}:${Buffer.from(filterKey).toString('base64')}`;
    return await this.set(key, claims, ttl);
  }

  /**
   * Get cached claim list
   */
  async getClaimList(hospitalId, filters) {
    const filterKey = JSON.stringify(filters);
    const key = `claims:list:${hospitalId}:${Buffer.from(filterKey).toString('base64')}`;
    return await this.get(key);
  }

  /**
   * Invalidate all claim caches for hospital
   */
  async invalidateClaimCaches(hospitalId) {
    await this.deletePattern(`claims:*:${hospitalId}*`);
    await this.deletePattern(`dashboard:*:${hospitalId}`);
    return true;
  }

  /**
   * Cache patient eligibility
   */
  async cacheEligibility(policyNumber, eligibilityData, ttl = 3600) {
    const key = `eligibility:${policyNumber}`;
    return await this.set(key, eligibilityData, ttl);
  }

  /**
   * Get cached eligibility
   */
  async getEligibility(policyNumber) {
    const key = `eligibility:${policyNumber}`;
    return await this.get(key);
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      console.log('Redis cache connection closed');
    }
  }
}

export default new CacheService();
