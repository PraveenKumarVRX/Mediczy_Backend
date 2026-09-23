
import { Queue } from 'bullmq';
import { createRedisConnection } from './redis-connection.js';

export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  NOTIFICATIONS: 'notification-queue',
  REPORTS: 'report-queue',
  DATA_EXPORT: 'data-export-queue',
  ANALYTICS: 'analytics-queue',
  CLEANUP: 'cleanup-queue',
  EMERGENCY: 'emergency-queue',    // highest priority — triage, critical alerts
  CRM_SEGMENT_BLAST: 'crm-segment-blast-queue',
  CRM_AUTOMATION: 'crm-automation-queue',
};

const isTest = process.env.NODE_ENV === 'test';

let queues;
let connection = null;
if (isTest) {
  // Mock queues for test mode
  const mockQueue = {
    add: async () => ({}),
    close: async () => {},
    on: () => {},
    process: () => {},
    pause: async () => {},
    resume: async () => {},
    isPaused: async () => true,
    getJobCounts: async () => ({}),
    getJobs: async () => [],
    remove: async () => {},
    obliterate: async () => {},
  };
  queues = {
    email: mockQueue,
    notifications: mockQueue,
    reports: mockQueue,
    dataExport: mockQueue,
    analytics: mockQueue,
    cleanup: mockQueue,
    emergency: mockQueue,
    crmSegmentBlast: mockQueue,
    crmAutomation: mockQueue,
  };
  console.log('✅ BullMQ queues mocked for test mode');
} else {
  // Redis connection for BullMQ
  connection = createRedisConnection();
  queues = {
    email:        new Queue(QUEUE_NAMES.EMAIL,        { connection }),
    notifications: new Queue(QUEUE_NAMES.NOTIFICATIONS, { connection }),
    reports:      new Queue(QUEUE_NAMES.REPORTS,      { connection }),
    dataExport:   new Queue(QUEUE_NAMES.DATA_EXPORT,  { connection }),
    analytics:    new Queue(QUEUE_NAMES.ANALYTICS,    { connection }),
    cleanup:      new Queue(QUEUE_NAMES.CLEANUP,      { connection }),
    emergency:    new Queue(QUEUE_NAMES.EMERGENCY,    { connection }),
    crmSegmentBlast: new Queue(QUEUE_NAMES.CRM_SEGMENT_BLAST, { connection }),
    crmAutomation:   new Queue(QUEUE_NAMES.CRM_AUTOMATION,    { connection }),
  };
  console.log('✅ BullMQ queues initialized');
}

export { queues };

// Helper function to add job to queue
export const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const NINETY_DAYS = 60 * 60 * 24 * 90;
  const THIRTY_DAYS = 60 * 60 * 24 * 30;

  const defaultOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    // Retain completed jobs for 90 days (HIPAA audit trail requirement)
    removeOnComplete: { count: 0, age: NINETY_DAYS },
    // Retain last 1000 failed jobs for 30 days for debugging
    removeOnFail: { count: 1000, age: THIRTY_DAYS },
  };

  const job = await queue.add(jobName, data, { ...defaultOptions, ...options });
  console.log(`📋 Job added to ${queueName}: ${jobName} (ID: ${job.id})`);
  return job;
};

// Helper to dispatch emergency/triage alert (highest priority, no delay)
export const dispatchEmergencyAlert = async (data) => {
  const queue = queues.emergency;
  if (!queue) throw new Error('Emergency queue not initialized');
  return queue.add('emergency-alert', data, {
    priority: 1,              // BullMQ: 1 = highest
    attempts: 5,
    backoff: { type: 'fixed', delay: 500 },
    removeOnComplete: { count: 0, age: 60 * 60 * 24 * 90 },
    removeOnFail:     { count: 1000 },
  });
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

// Graceful shutdown — called by controllers/shutdown.controller.js as part of the single coordinated
// shutdown sequence, not from its own signal handler (a second, independent SIGTERM listener here
// previously raced the app's main shutdown path).
export const shutdownQueues = async () => {
  console.log('Closing BullMQ queues and schedulers...');

  // Close all queues. `connection` (from createRedisConnection()) is a plain ioredis options object,
  // not a client — BullMQ creates and owns its own real client per Queue from those options, and
  // already closes it as part of q.close(); there is nothing else here to quit().
  await Promise.all(Object.values(queues).map(q => q.close()));

  console.log('✅ BullMQ closed');
};

export default queues;
