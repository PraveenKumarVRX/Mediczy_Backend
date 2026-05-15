import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis-connection.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { queueJobsTotal, queueJobDuration } from '../config/prometheus.js';
import emailService from '../services/emailService.js';
import emailSyncWorker from './email-sync.worker.js';

const isTest = process.env.NODE_ENV === 'test';

const createMockWorker = () => ({
  on: () => {},
  close: async () => {},
  pause: async () => {},
  resume: async () => {},
  isPaused: async () => true,
  getJobCounts: async () => ({}),
  getJobs: async () => [],
  remove: async () => {},
  obliterate: async () => {},
});

// Kafka-n8n notification worker
let kafkaN8NWorker = null;
const initKafkaWorker = async () => {
  try {
    const { worker } = await import('./kafka-n8n.worker.js');
    const initialized = await worker.initialize();
    if (initialized) {
      await worker.start();
      kafkaN8NWorker = worker;
      console.log('✅ Kafka-n8n notification worker started');
    }
  } catch (error) {
    console.warn('⚠️  Kafka-n8n worker not available:', error.message);
  }
};

// Initialize Kafka worker (non-blocking)
if (!isTest && process.env.KAFKA_ENABLED === 'true') {
  initKafkaWorker();
}

// Initialize Email Inbox Sync worker
const initEmailSyncWorker = async () => {
  try {
    const initialized = await emailSyncWorker.initialize();
    if (initialized) {
      await emailSyncWorker.start();
      // Schedule periodic sync every 5 minutes
      await emailSyncWorker.schedulePeriodicSync();
      console.log('✅ Email inbox sync worker started and scheduled');
    }
  } catch (error) {
    console.warn('⚠️  Email sync worker initialization failed:', error.message);
  }
};

// Start email sync worker (non-blocking)
if (!isTest) {
  initEmailSyncWorker();
}

// Redis connection for workers
const connection = isTest ? null : createRedisConnection();

// Email worker processor
const processEmailJob = async (job) => {
  console.log(`📧 Processing email job ${job.id}:`, job.data);
  
  try {
    const result = await emailService.sendEmailFromQueue(job.data);
    console.log(`✅ Email job ${job.id} completed:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Email job ${job.id} failed:`, error);
    throw error;
  }
};

// Notification worker processor
const processNotificationJob = async (job) => {
  const { userId, type, title, message, data } = job.data;
  
  console.log(`🔔 Processing notification job ${job.id}:`, { userId, type, title });
  
  // Simulate notification dispatch
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // In production: Firebase push, in-app notification, SMS, etc.
  // await notificationService.send({ userId, type, title, message, data });
  
  console.log(`✅ Notification sent to user ${userId}`);
  return { sent: true, userId, type, timestamp: new Date().toISOString() };
};

// Report generation worker processor
const processReportJob = async (job) => {
  const { reportType, userId, filters, format } = job.data;
  
  console.log(`📊 Processing report job ${job.id}:`, { reportType, format });
  
  // Simulate report generation
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // In production: Generate PDF, Excel, CSV
  // const report = await reportService.generate({ reportType, filters, format });
  // await storage.upload(report);
  // await notifyUser(userId, report.url);
  
  console.log(`✅ Report generated: ${reportType}`);
  return { 
    generated: true, 
    reportType, 
    format, 
    url: `/reports/${job.id}.${format}`,
    timestamp: new Date().toISOString() 
  };
};

// Data export worker processor
const processDataExportJob = async (job) => {
  const { entityType, filters, format, userId } = job.data;
  
  console.log(`💾 Processing data export job ${job.id}:`, { entityType, format });
  
  // Simulate data export
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // In production: Query database, format data, compress, upload
  // const data = await database.export({ entityType, filters });
  // const file = await formatter.toFormat(data, format);
  // await storage.upload(file);
  
  console.log(`✅ Data exported: ${entityType} (${format})`);
  return { 
    exported: true, 
    entityType, 
    format, 
    recordCount: 1234,
    url: `/exports/${job.id}.${format}`,
    timestamp: new Date().toISOString() 
  };
};

// Analytics processing worker
const processAnalyticsJob = async (job) => {
  const { eventType, data, timestamp } = job.data;
  
  console.log(`📈 Processing analytics job ${job.id}:`, eventType);
  
  // Simulate analytics processing
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // In production: Store in analytics database, update aggregates
  // await analyticsDB.store({ eventType, data, timestamp });
  // await metricsService.update(eventType, data);
  
  console.log(`✅ Analytics processed: ${eventType}`);
  return { processed: true, eventType, timestamp: new Date().toISOString() };
};

// Cleanup worker processor
const processCleanupJob = async (job) => {
  const { taskType, olderThan } = job.data;
  
  console.log(`🧹 Processing cleanup job ${job.id}:`, { taskType, olderThan });
  
  // Simulate cleanup
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // In production: Delete old records, clear caches, archive data
  // const count = await database.cleanup({ taskType, olderThan });
  
  console.log(`✅ Cleanup completed: ${taskType}`);
  return { 
    cleaned: true, 
    taskType, 
    recordsDeleted: 42,
    timestamp: new Date().toISOString() 
  };
};

// Create workers
const createWorker = (queueName, processor) => {
  if (isTest) {
    return createMockWorker();
  }

  const worker = new Worker(queueName, async (job) => {
    const start = Date.now();
    
    try {
      const result = await processor(job);
      
      const duration = (Date.now() - start) / 1000;
      queueJobDuration.observe({ queue: queueName, job_name: job.name }, duration);
      queueJobsTotal.inc({ queue: queueName, status: 'completed' });
      
      return result;
    } catch (error) {
      queueJobsTotal.inc({ queue: queueName, status: 'failed' });
      throw error;
    }
  }, { 
    connection,
    concurrency: 2, // Reduced from 5 to limit memory pressure
    removeOnComplete: { count: 100 }, // Keep only last 100 completed jobs in Redis
    removeOnFail:     { count: 50  }, // Keep only last 50 failed jobs
  });

  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} in ${queueName} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} in ${queueName} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`❌ Worker error in ${queueName}:`, err);
  });

  return worker;
};

// Initialize all workers
export const workers = {
  email: createWorker(QUEUE_NAMES.EMAIL, processEmailJob),
  notifications: createWorker(QUEUE_NAMES.NOTIFICATIONS, processNotificationJob),
  reports: createWorker(QUEUE_NAMES.REPORTS, processReportJob),
  dataExport: createWorker(QUEUE_NAMES.DATA_EXPORT, processDataExportJob),
  analytics: createWorker(QUEUE_NAMES.ANALYTICS, processAnalyticsJob),
  cleanup: createWorker(QUEUE_NAMES.CLEANUP, processCleanupJob),
  kafkaN8N: kafkaN8NWorker,
  emailSync: emailSyncWorker
};

// Export Kafka worker status
export const getKafkaWorkerStatus = () => {
  return kafkaN8NWorker ? kafkaN8NWorker.getStatus() : { running: false, reason: 'Not initialized' };
};

// Export Kafka worker analytics
export const getKafkaWorkerAnalytics = async (timeRange = '24h') => {
  return kafkaN8NWorker ? await kafkaN8NWorker.getAnalytics(timeRange) : null;
};

// Export Email Sync worker
export const getEmailSyncWorker = () => emailSyncWorker;

console.log('✅ All workers initialized');

// Graceful shutdown
const shutdown = async () => {
  console.log('Closing workers...');
  await Promise.all(Object.values(workers).filter(w => w && typeof w.close === 'function').map(w => w.close()));
  if (kafkaN8NWorker) {
    await kafkaN8NWorker.stop();
  }
  if (emailSyncWorker) {
    await emailSyncWorker.stop();
  }
  await connection.quit();
  console.log('✅ Workers closed');
};

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

export default workers;
