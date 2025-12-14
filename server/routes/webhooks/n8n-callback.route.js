import express from 'express';
import Appointment from '../../models/appointment.model.intelligent.js';
import { queues } from '../../config/queues.js';

const router = express.Router();

/**
 * n8n Callback Routes
 * 
 * These endpoints receive callbacks from n8n workflows
 * after workflow execution or errors.
 */

/**
 * n8n workflow completion callback
 * POST /api/webhooks/n8n-callback/workflow-complete
 */
router.post('/workflow-complete', async (req, res) => {
  try {
    const { 
      workflowId, 
      workflowName,
      executionId, 
      status, 
      data,
      timestamp 
    } = req.body;

    console.log(`✅ n8n workflow completed: ${workflowName} (${executionId})`);

    // Update appointment if applicable
    if (data.appointmentId) {
      await Appointment.findByIdAndUpdate(data.appointmentId, {
        $set: {
          'metadata.n8nExecutionId': executionId,
          'metadata.n8nWorkflowName': workflowName,
          'metadata.lastN8nUpdate': new Date()
        },
        $inc: {
          'metadata.n8nExecutionCount': 1
        }
      });
    }

    // Log to analytics queue
    await queues.analytics.add('n8n-workflow-complete', {
      workflowId,
      workflowName,
      executionId,
      status,
      timestamp: timestamp || new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Workflow completion recorded' 
    });
  } catch (error) {
    console.error('❌ n8n callback error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * n8n workflow error callback
 * POST /api/webhooks/n8n-callback/workflow-error
 */
router.post('/workflow-error', async (req, res) => {
  try {
    const { 
      workflowId, 
      workflowName,
      executionId, 
      error,
      data,
      timestamp 
    } = req.body;

    console.error(`❌ n8n workflow failed: ${workflowName} (${executionId})`);
    console.error('Error details:', error);

    // Alert admins via notification queue
    await queues.notifications.add('admin-alert', {
      type: 'n8n-workflow-error',
      severity: 'high',
      workflowId,
      workflowName,
      executionId,
      error,
      data,
      timestamp: timestamp || new Date().toISOString()
    });

    // Log to analytics
    await queues.analytics.add('n8n-workflow-error', {
      workflowId,
      workflowName,
      executionId,
      error,
      timestamp: timestamp || new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Error logged and admins notified' 
    });
  } catch (error) {
    console.error('❌ n8n error callback failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * n8n notification status callback
 * POST /api/webhooks/n8n-callback/notification-status
 */
router.post('/notification-status', async (req, res) => {
  try {
    const {
      notificationId,
      channel, // 'whatsapp', 'sms', 'email'
      status, // 'sent', 'delivered', 'failed'
      recipientId,
      error,
      timestamp
    } = req.body;

    console.log(`📱 Notification status: ${channel} - ${status} (${notificationId})`);

    // Log to analytics
    await queues.analytics.add('notification-status', {
      notificationId,
      channel,
      status,
      recipientId,
      error,
      timestamp: timestamp || new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Notification status recorded' 
    });
  } catch (error) {
    console.error('❌ Notification status callback error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * n8n payment retry callback
 * POST /api/webhooks/n8n-callback/payment-retry
 */
router.post('/payment-retry', async (req, res) => {
  try {
    const {
      paymentId,
      appointmentId,
      retryAttempt,
      status, // 'success', 'failed'
      error,
      timestamp
    } = req.body;

    console.log(`💳 Payment retry #${retryAttempt}: ${status} (${paymentId})`);

    // Update appointment payment status if successful
    if (status === 'success' && appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, {
        paymentStatus: 'completed',
        'metadata.paymentRetryCount': retryAttempt,
        'metadata.paymentRetrySuccess': true,
        'metadata.lastPaymentAttempt': new Date()
      });
    }

    // Log to analytics
    await queues.analytics.add('payment-retry', {
      paymentId,
      appointmentId,
      retryAttempt,
      status,
      error,
      timestamp: timestamp || new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Payment retry status recorded' 
    });
  } catch (error) {
    console.error('❌ Payment retry callback error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Health check endpoint
 * GET /api/webhooks/n8n-callback/health
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'n8n-callback',
    timestamp: new Date().toISOString()
  });
});

export default router;
