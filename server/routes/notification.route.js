import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import nodemailer from 'nodemailer';
import { authUser } from '../middleware/auth.middleware.js';
import notificationService, { Notification, FCMToken } from '../services/notification.service.js';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../services/notification-preferences.service.js';
import { getKafkaWorkerStatus, getKafkaWorkerAnalytics } from '../workers/index.js';

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    // Map role to userType: 'user' and 'patient' both map to 'patient'
    const userType = req.user.role === 'doctor' ? 'doctor' : 
                     req.user.role === 'admin' ? 'admin' : 'patient';
    const { page = 1, limit = 20, unreadOnly, type } = req.query;

    const result = await notificationService.getNotifications(userId, userType, {
      page,
      limit,
      unreadOnly: unreadOnly === 'true',
      type
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/unread-count', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    // Map role to userType: 'user' and 'patient' both map to 'patient'
    const userType = req.user.role === 'doctor' ? 'doctor' : 
                     req.user.role === 'admin' ? 'admin' : 'patient';

    const count = await notificationService.getUnreadCount(userId, userType);

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.post('/:id/read', authUser, [
  param('id').isInt().withMessage('Valid notification ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id || req.user.dataValues?.id;
    const result = await notificationService.markAsRead(req.params.id, userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark as read',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.post('/read-all', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    // Map role to userType: 'user' and 'patient' both map to 'patient'
    const userType = req.user.role === 'doctor' ? 'doctor' : 
                     req.user.role === 'admin' ? 'admin' : 'patient';

    const result = await notificationService.markAllAsRead(userId, userType);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark all as read',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:id', authUser, [
  param('id').isInt().withMessage('Valid notification ID required')
], async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;

    const notification = await Notification.findOne({
      where: { id: req.params.id, userId }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.destroy();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/notifications/fcm/register
 * @desc    Register FCM token for push notifications
 * @access  Private
 */
router.post('/fcm/register', authUser, [
  body('token').notEmpty().withMessage('FCM token is required'),
  body('deviceType').optional().isIn(['web', 'android', 'ios'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id || req.user.dataValues?.id;
    // Map role to userType: 'user' and 'patient' both map to 'patient'
    const userType = req.user.role === 'doctor' ? 'doctor' : 
                     req.user.role === 'admin' ? 'admin' : 'patient';
    const { token, deviceType = 'web' } = req.body;

    const result = await notificationService.registerFCMToken(userId, userType, token, deviceType);

    res.json({
      success: true,
      message: 'FCM token registered successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to register FCM token',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/notifications/test
 * @desc    Send a test notification (development only)
 * @access  Private
 */
router.post('/test', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    // Map role to userType: 'user' and 'patient' both map to 'patient'
    const userType = req.user.role === 'doctor' ? 'doctor' : 
                     req.user.role === 'admin' ? 'admin' : 'patient';
    const { type = 'general', title, message } = req.body;

    const result = await notificationService.send({
      userId,
      userType,
      type,
      variables: {
        patientName: 'Test Patient',
        doctorName: 'Test Doctor',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        amount: '500'
      },
      channels: ['in-app']
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get notification preferences
 * @access  Private
 */
router.get('/preferences', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    const preferences = await getNotificationPreferences(userId);
    res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get preferences',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Save notification preferences for current user
 * @access  Private
 */
router.put('/preferences', authUser, [
  body('preferences').isObject().withMessage('preferences object is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id || req.user.dataValues?.id;
    const preferences = await saveNotificationPreferences(userId, req.body.preferences || {});

    res.json({
      success: true,
      message: 'Notification preferences saved',
      preferences,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to save preferences',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/notifications/send
 * @desc    Send notification (for n8n workflows)
 * @access  Internal/Admin
 */
router.post('/send', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('userType').isIn(['patient', 'doctor', 'admin', 'hospital']).withMessage('Valid user type required'),
  body('type').notEmpty().withMessage('Notification type is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { userId, userType, type, title, message, channels = ['push', 'in-app'], priority, actionUrl, metadata } = req.body;

    const result = await notificationService.send({
      userId,
      userType,
      type,
      title,
      message,
      channels,
      priority,
      actionUrl,
      data: metadata
    });

    res.json({
      success: true,
      message: 'Notification sent successfully',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/notifications/automation/status
 * @desc    Get Kafka-n8n automation worker status
 * @access  Private (Admin)
 */
router.get('/automation/status', authUser, async (req, res) => {
  try {
    const status = getKafkaWorkerStatus();
    res.json({
      success: true,
      worker: status,
      kafkaEnabled: process.env.KAFKA_ENABLED === 'true',
      n8nUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get automation status',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/notifications/automation/analytics
 * @desc    Get notification automation analytics
 * @access  Private (Admin)
 */
router.get('/automation/analytics', authUser, async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    const analytics = await getKafkaWorkerAnalytics(timeRange);
    
    res.json({
      success: true,
      analytics: analytics || { message: 'Kafka worker not available' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get analytics',
      error: error.message
    });
  }
});

// Lazy singleton transporter for internal n8n notifications
let _internalTransporter = null;
function getInternalTransporter() {
  if (_internalTransporter) return _internalTransporter;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = port === 465;
  _internalTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtppro.zoho.in',
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });
  return _internalTransporter;
}

function isEmailRecipient(value) {
  return typeof value === 'string' && value.includes('@');
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUserType(userType) {
  return ['patient', 'doctor', 'admin', 'hospital'].includes(userType) ? userType : 'patient';
}

function normalizeNotificationType(type) {
  const normalizedType = String(type || 'system').toLowerCase();
  const allowedTypes = new Set([
    'appointment', 'appointment_request', 'appointment_booked',
    'appointment_accepted', 'appointment_rejected', 'appointment_cancelled',
    'prescription', 'prescription_issued', 'prescription_ready', 'payment', 'payment_received', 'reminder',
    'message', 'alert', 'promotion', 'system', 'verification',
    'booking_confirmed', 'booking_cancelled', 'doctor_message',
    'lab_report', 'medicine_reminder', 'health_tip',
    'consultation_started', 'consultation_starting', 'consultation_reminder',
    'consultation_ended', 'consultation_completed',
    'call_incoming', 'video_call', 'video_ready', 'call_missed', 'call_ended'
  ]);
  const typeMap = {
    appointment_reminder: 'appointment',
    appointment_no_show: 'appointment',
    daily_kpi_report: 'system',
    performance_report: 'system',
    doctor_performance: 'system',
    medication_reminder: 'medicine_reminder',
    membership_expiring: 'reminder',
    payment_failed: 'payment',
    payment_reminder: 'payment',
    payment_success: 'payment_received',
    prescription_expiring_soon: 'prescription',
    webinar_reminder: 'reminder',
    system_alert: 'alert',
    user_registered: 'system',
    health_report_ready: 'lab_report'
  };

  if (allowedTypes.has(normalizedType)) {
    return normalizedType;
  }

  return typeMap[normalizedType] || 'system';
}

function normalizePriority(priority) {
  const normalizedPriority = String(priority || 'normal').toLowerCase();

  if (normalizedPriority === 'critical') {
    return 'urgent';
  }

  return ['low', 'normal', 'high', 'urgent'].includes(normalizedPriority)
    ? normalizedPriority
    : 'normal';
}

/**
 * @route   POST /api/notifications/send-internal
 * @desc    Internal notification endpoint called by n8n workflows
 *          Sends admin alerts, custom user notifications, and direct email/WhatsApp payloads
 * @access  Internal (MEDICZY_INTERNAL_TOKEN)
 */
router.post('/send-internal', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const expectedToken = process.env.MEDICZY_INTERNAL_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      adminEmail,
      to,
      toEmail,
      toPhone,
      userId,
      userType = 'patient',
      type = 'general',
      channels = [],
      subject,
      title,
      body: bodyText,
      html,
      whatsappBody,
      priority = 'normal',
      data = {},
      actionUrl
    } = payload || {};

    const normalizedUserType = normalizeUserType(userType);
    const normalizedNotificationType = normalizeNotificationType(type);
    const normalizedPriority = normalizePriority(priority);
    const emailRecipient = toEmail || (isEmailRecipient(to) ? to : undefined) || adminEmail;
    const phoneRecipient = toPhone || (typeof to === 'string' && !isEmailRecipient(to) ? to : undefined);
    const notificationTitle = subject || title || 'Mediczy Notification';
    const notificationMessage = bodyText || stripHtml(html) || whatsappBody || 'You have a new notification from Mediczy.';
    const requestedChannels = channels.length
      ? channels
      : emailRecipient || html
        ? ['email']
        : userId
          ? ['in-app']
          : [];

    if (!emailRecipient && !phoneRecipient && !userId) {
      return res.status(400).json({
        success: false,
        error: 'At least one recipient is required: adminEmail, to/toEmail/toPhone, or userId'
      });
    }

    const sent = { email: false, whatsapp: false, inApp: false, push: false };
    const errors = [];

    if (requestedChannels.includes('email')) {
      try {
        if (emailRecipient) {
          const transporter = getInternalTransporter();
          await transporter.sendMail({
            from: `"Mediczy System" <${process.env.SMTP_USER}>`,
            to: emailRecipient,
            subject: notificationTitle,
            text: bodyText || stripHtml(html) || notificationMessage,
            html: html || undefined
          });
        } else if (userId) {
          const emailResult = await notificationService.sendEmail(
            userId,
            normalizedUserType,
            notificationTitle,
            notificationMessage,
            type,
            data
          );
          if (!emailResult.success) {
            throw new Error(emailResult.error || 'Email delivery failed');
          }
        } else {
          throw new Error('No email recipient available');
        }
        sent.email = true;
      } catch (emailErr) {
        console.error(`[send-internal] Email failed for type=${type}:`, emailErr.message);
        errors.push({ channel: 'email', error: emailErr.message });
      }
    }

    if (requestedChannels.includes('in-app') && userId) {
      try {
        await Notification.create({
          userId,
          userType: normalizedUserType,
          type: normalizedNotificationType,
          title: notificationTitle,
          message: notificationMessage,
          data: {
            ...data,
            originalType: type
          },
          channels: requestedChannels,
          priority: normalizedPriority,
          webRoute: actionUrl,
          deepLink: actionUrl,
          status: 'sent',
          sentAt: new Date(),
          isRead: false
        });
        sent.inApp = true;
      } catch (inAppErr) {
        console.error(`[send-internal] In-app notification failed for type=${type}:`, inAppErr.message);
        errors.push({ channel: 'in-app', error: inAppErr.message });
      }
    }

    if (requestedChannels.includes('push') && userId) {
      try {
        const pushResult = await notificationService.sendPush(
          userId,
          normalizedUserType,
          notificationTitle,
          notificationMessage,
          data,
          actionUrl
        );
        if (!pushResult.success) {
          throw new Error(pushResult.error || 'Push delivery failed');
        }
        sent.push = true;
      } catch (pushErr) {
        console.error(`[send-internal] Push failed for type=${type}:`, pushErr.message);
        errors.push({ channel: 'push', error: pushErr.message });
      }
    }

    if (requestedChannels.includes('whatsapp')) {
      const adminPhone = process.env.MEDICZY_ADMIN_WHATSAPP;
      try {
        if (phoneRecipient) {
          const { default: whatsappService } = await import('../services/whatsapp-production.service.js');
          await whatsappService.sendSessionMessage({
            to: phoneRecipient,
            body: whatsappBody || notificationMessage
          });
        } else if (userId) {
          const whatsappResult = await notificationService.sendWhatsApp(
            userId,
            normalizedUserType,
            notificationTitle,
            whatsappBody || notificationMessage,
            data
          );
          if (!whatsappResult.success) {
            throw new Error(whatsappResult.error || 'WhatsApp delivery failed');
          }
        } else if (adminPhone) {
          const { default: whatsappService } = await import('../services/whatsapp-production.service.js');
          await whatsappService.sendSessionMessage({
            to: adminPhone,
            body: whatsappBody || notificationMessage
          });
        } else {
          throw new Error('No WhatsApp recipient available');
        }
        sent.whatsapp = true;
      } catch (waErr) {
        console.warn(`[send-internal] WhatsApp failed for type=${type}:`, waErr.message);
        errors.push({ channel: 'whatsapp', error: waErr.message });
      }
    }

    if (!sent.email && !sent.whatsapp && !sent.inApp && !sent.push && errors.length) {
      return res.status(400).json({ success: false, type, sent, errors });
    }

    console.log(
      `[send-internal] type=${type} normalizedType=${normalizedNotificationType} priority=${normalizedPriority} channels=${requestedChannels.join(',')} sent=`,
      sent
    );

    res.json({ success: true, type, sent, errors: errors.length ? errors : undefined });
  } catch (error) {
    console.error('[send-internal] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
