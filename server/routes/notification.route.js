import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import notificationService, { Notification, FCMToken } from '../services/notification.service.js';

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    const userType = req.user.role === 'doctor' ? 'doctor' : 'patient';
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
    const userType = req.user.role === 'doctor' ? 'doctor' : 'patient';

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
    const userType = req.user.role === 'doctor' ? 'doctor' : 'patient';

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
    const userType = req.user.role === 'doctor' ? 'doctor' : 'patient';
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
    const userType = req.user.role === 'doctor' ? 'doctor' : 'patient';
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
    // Return default preferences (can be extended with user preferences model)
    res.json({
      success: true,
      preferences: {
        push: true,
        email: true,
        sms: true,
        inApp: true,
        appointmentReminders: true,
        paymentAlerts: true,
        promotions: false
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get preferences',
      error: error.message
    });
  }
});

export default router;
