#!/usr/bin/env node
/**
 * Dedicated BullMQ Worker Process
 * Separate PM2 process for background job processing
 */

import workers from './workers/index.js';
import { validateEnvironment } from './config/env-validator.js';

console.log('🚀 Starting BullMQ Worker Process...\n');

// Validate environment
try {
  validateEnvironment();
  console.log('✅ Environment validation passed\n');
} catch (error) {
  console.warn('⚠️ Environment validation warnings:', error.message);
}

// Workers are already initialized via import
console.log('✅ All BullMQ workers are running and processing jobs');
console.log('📋 Active workers:');
console.log('  - Email Queue');
console.log('  - Notification Queue');
console.log('  - Report Queue');
console.log('  - Data Export Queue');
console.log('  - Analytics Queue');
console.log('  - Cleanup Queue\n');

// Keep process alive
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received. Shutting down workers gracefully...');
  await Promise.all(Object.values(workers).filter(Boolean).map(w => w.close())); // disabled queues are null
  console.log('✅ All workers shut down');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received. Shutting down workers gracefully...');
  await Promise.all(Object.values(workers).filter(Boolean).map(w => w.close())); // disabled queues are null
  console.log('✅ All workers shut down');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('🎯 Worker process is ready and waiting for jobs...');
