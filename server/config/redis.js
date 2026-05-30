import Redis from 'ioredis';
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production' || process.env.DOTENV_IN_PROD === 'true') {
  dotenv.config();
}

import { createRedisClient } from './redis-connection.js';

// Create Redis client instance
export const redisClient = createRedisClient();

// Connection event handlers
redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis Client Error:', err);
});

redisClient.on('close', () => {
  console.log('⚠️  Redis connection closed');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redisClient.quit();
  console.log('Redis connection closed through app termination');
  process.exit(0);
});

export default redisClient;
