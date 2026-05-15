/**
 * Redis Database Connector
 * In-memory cache and session store
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';

export let redisClient = null;
let isConnected = false;

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  retryStrategy: (times) => {
    if (times > 5) {
      console.error('Redis: Max retries reached, giving up');
      return null;
    }
    const delay = Math.min(times * 100, 2000);
    console.log(`Redis: Retry ${times} in ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  connectTimeout: 5000,
  keepAlive: 30000,
  family: 4,
};

export async function connectRedis() {
  if (isTest) return null;

  if (isConnected && redisClient) {
    console.log('Redis: Using existing connection');
    return redisClient;
  }

  try {
    redisClient = new Redis(REDIS_CONFIG);

    redisClient.on('connect', () => {
      console.log('Redis: Connecting...');
    });
    redisClient.on('ready', () => {
      isConnected = true;
      console.log('Redis: Connected successfully');
    });
    redisClient.on('error', (err) => {
      console.error('Redis: Connection error:', err.message);
      isConnected = false;
    });
    redisClient.on('close', () => {
      console.log('Redis: Connection closed');
      isConnected = false;
    });
    redisClient.on('reconnecting', (delay) => {
      console.log(`Redis: Reconnecting in ${delay}ms...`);
    });
    redisClient.on('end', () => {
      console.log('Redis: Connection ended');
      isConnected = false;
    });

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
    console.error('Redis: Connection failed:', error.message);
    isConnected = false;
    throw error;
  }
}

export async function closeRedis() {
  if (isTest) return null;

  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      isConnected = false;
      console.log('Redis: Connection closed');
    }
    return null;
  } catch (err) {
    console.error('Redis: Error closing connection:', err);
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    throw err;
  }
}

export function getRedisStatus() {
  if (isTest) {
    return { connected: false, status: 'mock', host: 'mock', port: 0, db: 0 };
  }

  return {
    connected: isConnected,
    status: redisClient?.status || 'disconnected',
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port,
    db: REDIS_CONFIG.db,
  };
}

export async function testRedis() {
  if (isTest) {
    return { success: true, message: 'Mock Redis (test mode)' };
  }

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

const ensureConnected = () => {
  if (isTest) return false;
  if (!isConnected || !redisClient) {
    throw new Error('Redis not connected');
  }
  return true;
};

export const cache = {
  async set(key, value, ttl = 3600) {
    if (isTest) return true;

    try {
      ensureConnected();
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await redisClient.setex(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error('Redis: Cache set error:', error.message);
      throw error;
    }
  },

  async get(key) {
    if (isTest) return null;

    try {
      if (!isConnected || !redisClient) {
        return null;
      }
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis: Cache get error:', error.message);
      return null;
    }
  },

  async del(key) {
    if (isTest) return true;

    try {
      ensureConnected();
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis: Cache delete error:', error.message);
      throw error;
    }
  },

  async exists(key) {
    if (isTest) return false;

    try {
      if (!isConnected || !redisClient) {
        return false;
      }
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Redis: Cache exists error:', error.message);
      return false;
    }
  },

  async setNX(key, value, ttl = 3600) {
    if (isTest) return 'OK';

    try {
      ensureConnected();
      const serialized = JSON.stringify(value);
      return await redisClient.set(key, serialized, 'EX', ttl, 'NX');
    } catch (error) {
      console.error('Redis: Cache setNX error:', error.message);
      throw error;
    }
  },

  async flush() {
    if (isTest) return true;

    try {
      ensureConnected();
      await redisClient.flushdb();
      return true;
    } catch (error) {
      console.error('Redis: Cache flush error:', error.message);
      throw error;
    }
  },
};

process.on('SIGINT', async () => {
  await closeRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeRedis();
  process.exit(0);
});

export default redisClient;
