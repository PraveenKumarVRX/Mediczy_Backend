import express from 'express';
import { addJob, getAllQueuesStats, queues } from '../config/queues.js';

const router = express.Router();

/**
 * @route GET /api/queues/stats
 * @desc Get statistics for all queues
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getAllQueuesStats();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      queues: stats
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/queues/:queueName
 * @desc Add a job to a specific queue
 */
router.post('/:queueName', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { jobName, data, options } = req.body;

    if (!queues[queueName]) {
      return res.status(404).json({
        success: false,
        error: `Queue '${queueName}' not found`
      });
    }

    const job = await addJob(queueName, jobName, data, options);

    res.json({
      success: true,
      message: `Job added to ${queueName}`,
      job: {
        id: job.id,
        name: job.name,
        queueName: job.queueName,
        data: job.data
      }
    });
  } catch (error) {
    console.error('Error adding job to queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/queues/test/email
 * @desc Test email queue with sample job
 */
router.post('/test/email', async (req, res) => {
  try {
    const job = await addJob('email', 'test-email', {
      to: 'test@example.com',
      subject: 'Test Email from BullMQ',
      body: 'This is a test email sent via BullMQ queue system.'
    });

    res.json({
      success: true,
      message: 'Test email job added',
      jobId: job.id
    });
  } catch (error) {
    console.error('Error testing email queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/queues/test/notification
 * @desc Test notification queue with sample job
 */
router.post('/test/notification', async (req, res) => {
  try {
    const job = await addJob('notifications', 'test-notification', {
      userId: 'test-user-123',
      type: 'info',
      title: 'Test Notification',
      message: 'This is a test notification from BullMQ',
      data: { source: 'api-test' }
    });

    res.json({
      success: true,
      message: 'Test notification job added',
      jobId: job.id
    });
  } catch (error) {
    console.error('Error testing notification queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/queues/health
 * @desc Check queue system health
 */
router.get('/health', async (req, res) => {
  try {
    const stats = await getAllQueuesStats();
    const totalJobs = Object.values(stats).reduce((acc, queue) => 
      acc + queue.waiting + queue.active + queue.delayed, 0
    );

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      totalQueues: Object.keys(queues).length,
      totalActiveJobs: totalJobs,
      queues: Object.keys(queues)
    });
  } catch (error) {
    console.error('Error checking queue health:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
