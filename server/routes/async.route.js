import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { getAllQueuesStats, queues } from '../config/queues.js';
import { metricsEndpoint, queueSize } from '../config/prometheus.js';
import tasks from '../tasks/index.js';
import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';

const router = express.Router();

// All routes require admin authentication
router.use(authUser, requireRole('admin'));

/**
 * Queue Management Endpoints
 */

// Get stats for all queues
router.get('/queues/stats', async (req, res) => {
  try {
    const stats = await getAllQueuesStats();
    
    // Update Prometheus metrics
    for (const [queueName, queueStats] of Object.entries(stats)) {
      queueSize.set({ queue: queueName, state: 'waiting' }, queueStats.waiting);
      queueSize.set({ queue: queueName, state: 'active' }, queueStats.active);
      queueSize.set({ queue: queueName, state: 'delayed' }, queueStats.delayed);
      queueSize.set({ queue: queueName, state: 'failed' }, queueStats.failed);
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get failed jobs from a queue
router.get('/queues/:queueName/failed', async (req, res) => {
  try {
    const { queueName } = req.params;
    const queue = queues[queueName];
    
    if (!queue) {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    const failedJobs = await queue.getFailed(0, 50);
    const jobs = failedJobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
    
    res.json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Retry a failed job
router.post('/queues/:queueName/jobs/:jobId/retry', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const queue = queues[queueName];
    
    if (!queue) {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    
    await job.retry();
    res.json({ success: true, message: 'Job retried' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clean completed jobs
router.delete('/queues/:queueName/completed', async (req, res) => {
  try {
    const { queueName } = req.params;
    const queue = queues[queueName];
    
    if (!queue) {
      return res.status(404).json({ success: false, message: 'Queue not found' });
    }
    
    await queue.clean(0, 100, 'completed');
    res.json({ success: true, message: 'Completed jobs cleaned' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Task Trigger Endpoints (Manual task execution)
 */

// Send test email
router.post('/tasks/email/test', async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    const job = await tasks.sendWelcomeEmail(email || req.user.email, req.user.firstName);
    res.json({ success: true, jobId: job.id, message: 'Email queued' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Send test notification
router.post('/tasks/notification/test', async (req, res) => {
  try {
    const { userId, title, message } = req.body;
    const job = await tasks.sendPushNotification(
      userId || req.user.id,
      title || 'Test Notification',
      message || 'This is a test notification from the async task system'
    );
    res.json({ success: true, jobId: job.id, message: 'Notification queued' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Generate report
router.post('/tasks/reports/generate', async (req, res) => {
  try {
    const { reportType, filters } = req.body;
    const job = await tasks.generateAdminAnalyticsReport(req.user.id, filters?.dateRange, filters?.metrics);
    res.json({ success: true, jobId: job.id, message: 'Report generation queued' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export CRM data
router.post('/tasks/export/crm-leads', async (req, res) => {
  try {
    const { filters } = req.body;
    const job = await tasks.exportCRMLeads(filters);
    res.json({ success: true, jobId: job.id, message: 'CRM export queued' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Trigger cleanup
router.post('/tasks/cleanup/run', async (req, res) => {
  try {
    const { taskType } = req.body;
    
    let job;
    if (taskType === 'sessions') {
      job = await tasks.cleanupOldSessions();
    } else if (taskType === 'temp-files') {
      job = await tasks.cleanupTempFiles();
    } else {
      return res.status(400).json({ success: false, message: 'Invalid task type' });
    }
    
    res.json({ success: true, jobId: job.id, message: 'Cleanup task queued' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Kafka Event Testing
 */

// Publish test event to Kafka
router.post('/kafka/publish', async (req, res) => {
  try {
    const { topic, message } = req.body;
    
    if (!KAFKA_TOPICS[topic]) {
      return res.status(400).json({ success: false, message: 'Invalid topic' });
    }
    
    await publishEvent(KAFKA_TOPICS[topic], {
      ...message,
      test: true,
      publishedBy: req.user.id,
      timestamp: new Date().toISOString(),
    });
    
    res.json({ success: true, message: 'Event published to Kafka' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Kafka topics
router.get('/kafka/topics', async (req, res) => {
  try {
    res.json({ success: true, topics: KAFKA_TOPICS });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Metrics Endpoint
 */

// Prometheus metrics (public endpoint, no auth required for Prometheus scraper)
router.get('/metrics', metricsEndpoint);

export default router;
