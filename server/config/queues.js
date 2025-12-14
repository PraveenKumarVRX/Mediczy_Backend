import { Queue } from 'bullmq';
import { createRedisConnection } from './redis-connection.js';

// Redis connection for BullMQ
const connection = createRedisConnection();

// Queue names
export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  NOTIFICATIONS: 'notification-queue',
  REPORTS: 'report-queue',
  DATA_EXPORT: 'data-export-queue',
  ANALYTICS: 'analytics-queue',
  CLEANUP: 'cleanup-queue',
};

// Create queues
export const queues = {
  email: new Queue(QUEUE_NAMES.EMAIL, { connection }),
  notifications: new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection }),
  reports: new Queue(QUEUE_NAMES.REPORTS, { connection }),
  dataExport: new Queue(QUEUE_NAMES.DATA_EXPORT, { connection }),
  analytics: new Queue(QUEUE_NAMES.ANALYTICS, { connection }),
  cleanup: new Queue(QUEUE_NAMES.CLEANUP, { connection }),
};

// Note: QueueScheduler is deprecated in BullMQ v4+, delayed jobs work automatically

console.log('✅ BullMQ queues initialized');

// Helper function to add job to queue
export const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const defaultOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  };

  const job = await queue.add(jobName, data, { ...defaultOptions, ...options });
  console.log(`📋 Job added to ${queueName}: ${jobName} (ID: ${job.id})`);
  return job;
};

// Helper to add delayed job
export const addDelayedJob = async (queueName, jobName, data, delayMs, options = {}) => {
  return addJob(queueName, jobName, data, { ...options, delay: delayMs });
};

// Helper to add recurring job (cron)
export const addRecurringJob = async (queueName, jobName, data, cronExpression, options = {}) => {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const job = await queue.add(jobName, data, {
    repeat: {
      pattern: cronExpression,
    },
    ...options,
  });
  
  console.log(`🔄 Recurring job added to ${queueName}: ${jobName}`);
  return job;
};

// Get queue stats
export const getQueueStats = async (queueName) => {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
};

// Get all queues stats
export const getAllQueuesStats = async () => {
  const stats = {};
  for (const [key, queue] of Object.entries(queues)) {
    stats[key] = await getQueueStats(key);
  }
  return stats;
};

// Graceful shutdown
const shutdown = async () => {
  console.log('Closing BullMQ queues and schedulers...');
  
  // Close all queues
  await Promise.all(Object.values(queues).map(q => q.close()));
  
  // Close connection
  await connection.quit();
  
  console.log('✅ BullMQ closed');
};

process.on('SIGINT', async () => {
  await shutdown();
});

process.on('SIGTERM', async () => {
  await shutdown();
});

export default queues;
