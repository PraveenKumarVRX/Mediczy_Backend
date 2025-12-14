/**
 * Redis Database Connector
 * In-memory cache and session store
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;
let isConnected = false;

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  connectTimeout: 10000,
  keepAlive: 30000,
  family: 4, // IPv4
};

/**
 * Connect to Redis
 * @returns {Promise<Redis>} Redis client instance
 */
export async function connectRedis() {
  if (isConnected && redisClient) {
    console.log("✅ Redis: Using existing connection");
    return redisClient;
  }

  try {
    redisClient = new Redis(REDIS_CONFIG);

    // Connection event handlers
    redisClient.on('connect', () => {
      console.log('✅ Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      isConnected = true;
      console.log('✅ Redis: Connected successfully');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis: Connection error:', err.message);
      isConnected = false;
    });

    redisClient.on('close', () => {
      console.log('⚠️  Redis: Connection closed');
      isConnected = false;
    });

    redisClient.on('reconnecting', (delay) => {
      console.log(`⏳ Redis: Reconnecting in ${delay}ms...`);
    });

    redisClient.on('end', () => {
      console.log('⚠️  Redis: Connection ended');
      isConnected = false;
    });

    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, REDIS_CONFIG.connectTimeout);

      redisClient.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      redisClient.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return redisClient;

  } catch (error) {
    console.error('❌ Redis: Connection failed:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis() {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      isConnected = false;
      console.log('✅ Redis: Connection closed');
    }
  } catch (err) {
    console.error('❌ Redis: Error closing connection:', err);
    // Force disconnect if quit fails
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    throw err;
  }
}

/**
 * Get Redis connection status
 */
export function getRedisStatus() {
  return {
    connected: isConnected,
    status: redisClient?.status || 'disconnected',
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port,
    db: REDIS_CONFIG.db,
  };
}

/**
 * Test Redis connection
 */
export async function testRedis() {
  try {
    if (!isConnected) {
      await connectRedis();
    }
    await redisClient.ping();
    return { success: true, message: 'Redis connection successful' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Cache operations with TTL
 */
export const cache = {
  /**
   * Set value with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   */
  async set(key, value, ttl = 3600) {
    try {
      if (!isConnected) await connectRedis();
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await redisClient.setex(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error('❌ Redis: Cache set error:', error.message);
      return false;
    }
  },

  /**
   * Get value from cache
   * @param {string} key - Cache key
   */
  async get(key) {
    try {
      if (!isConnected) await connectRedis();
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('❌ Redis: Cache get error:', error.message);
      return null;
    }
  },

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    try {
      if (!isConnected) await connectRedis();
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('❌ Redis: Cache delete error:', error.message);
      return false;
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   */
  async exists(key) {
    try {
      if (!isConnected) await connectRedis();
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('❌ Redis: Cache exists error:', error.message);
      return false;
    }
  },

  /**
   * Clear all cache
   */
  async flush() {
    try {
      if (!isConnected) await connectRedis();
      await redisClient.flushdb();
      return true;
    } catch (error) {
      console.error('❌ Redis: Cache flush error:', error.message);
      return false;
    }
  }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await closeRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeRedis();
  process.exit(0);
});

export { redisClient };
export default redisClient;
