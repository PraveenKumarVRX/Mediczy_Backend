import Redis from 'ioredis';
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config();
}

// Parse Redis URL or use individual config values
export function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    // Parse redis://[:password@]host[:port][/db]
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        db: url.pathname ? parseInt(url.pathname.slice(1)) || 0 : 0,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      };
    } catch (error) {
      console.error('❌ Failed to parse REDIS_URL:', error);
    }
  }
  
  // Fallback to individual environment variables
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  };
}

export function createRedisClient() {
  return new Redis(createRedisConnection());
}