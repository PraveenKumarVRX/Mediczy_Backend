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

// Graceful shutdown — called (not self-registered) by controllers/shutdown.controller.js as part of
// the single coordinated shutdown sequence. This client was previously closed only on SIGINT (never
// SIGTERM, which is what PM2/containers actually send), and did so via its own process.exit(0) call
// that raced every other independent shutdown handler in the app — see db/postgres.js for why that's
// dangerous.
export async function closeConfigRedisClient() {
  await redisClient.quit();
  console.log('Redis connection (config/redis.js) closed');
}

export default redisClient;
