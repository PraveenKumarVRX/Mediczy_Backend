import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  sendVideoCallNotification,
  sendMessageNotification,
  sendAppointmentNotification,
  sendSystemNotification,
  validateToken,
  isFirebaseInitialized
} from '../utils/firebase-admin.js';
import { FCMToken } from '../services/notification.service.js';

const router = express.Router();

/**
 * Register FCM token for a user
 * POST /api/fcm/register-token
 */
router.post('/register-token', authUser, async (req, res) => {
  try {
    const { fcmToken, deviceType = 'web', deviceInfo, skipValidation } = req.body;
    const userId = req.user.id || req.user.dataValues?.id;
    const userRole = req.user.role || req.userRole || 'patient';
    const userType = userRole === 'doctor' ? 'doctor' : (userRole === 'admin' ? 'admin' : 'patient');

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: fcmToken'
      });
    }

    // Validate the FCM token if Firebase is initialized
    // Skip validation if explicitly requested (for testing) or if token looks like a real FCM token
    const shouldValidate = isFirebaseInitialized && !skipValidation && fcmToken.length > 100;
    if (shouldValidate) {
      const isValidToken = await validateToken(fcmToken);
      if (!isValidToken) {
        return res.status(400).json({
          success: false,
          message: 'Invalid FCM token'
        });
      }
    }

    // Deactivate old tokens for this user
    await FCMToken.update(
      { isActive: false },
      { where: { userId, userType } }
    );

    // Create or update the token in database
    await FCMToken.upsert({
      userId,
      userType,
      token: fcmToken,
      deviceType,
      deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : null,
      isActive: true
    });

    console.log(`✅ FCM token registered for ${userType} ${userId} (${deviceType})`);

    res.json({
      success: true,
      message: 'FCM token registered successfully'
    });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register FCM token',
      error: error.message
    });
  }
});

/**
 * Remove FCM token for a user
 * POST /api/fcm/remove-token
 */
router.post('/remove-token', authUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user.dataValues?.id;
    const userRole = req.user.role || req.userRole || 'patient';
    const userType = userRole === 'doctor' ? 'doctor' : (userRole === 'admin' ? 'admin' : 'patient');

    // Deactivate all tokens for this user
    const [updated] = await FCMToken.update(
      { isActive: false },
      { where: { userId, userType } }
    );

    res.json({
      success: true,
      message: updated > 0 ? 'FCM token removed successfully' : 'No active token found'
    });
  } catch (error) {
    console.error('Error removing FCM token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove FCM token',
      error: error.message
    });
  }
});

/**
 * Send video call notification
 * POST /api/fcm/send-video-call
 */
router.post('/send-video-call', authUser, async (req, res) => {
  try {
    const { recipientId, recipientType = 'patient', callData } = req.body;

    if (!recipientId || !callData) {
      return res.status(400).json({
        success: false,
        message: 'Missing recipientId or callData'
      });
    }

    // Get recipient's FCM token from database
    const tokenRecord = await FCMToken.findOne({
      where: { userId: recipientId, userType: recipientType, isActive: true }
    });
    
    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Recipient FCM token not found'
      });
    }

    // Send video call notification
    const response = await sendVideoCallNotification(tokenRecord.token, callData);

    res.json({
      success: true,
      message: 'Video call notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending video call notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send video call notification',
      error: error.message
    });
  }
});

/**
 * Send message notification
 * POST /api/fcm/send-message
 */
router.post('/send-message', authUser, async (req, res) => {
  try {
    const { recipientId, recipientType = 'patient', messageData } = req.body;

    if (!recipientId || !messageData) {
      return res.status(400).json({
        success: false,
        message: 'Missing recipientId or messageData'
      });
    }

    // Get recipient's FCM token from database
    const tokenRecord = await FCMToken.findOne({
      where: { userId: recipientId, userType: recipientType, isActive: true }
    });
    
    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Recipient FCM token not found'
      });
    }

    // Send message notification
    const response = await sendMessageNotification(tokenRecord.token, messageData);

    res.json({
      success: true,
      message: 'Message notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending message notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message notification',
      error: error.message
    });
  }
});

/**
 * Send appointment notification
 * POST /api/fcm/send-appointment
 */
router.post('/send-appointment', authUser, async (req, res) => {
  try {
    const { recipientId, recipientType = 'patient', appointmentData } = req.body;

    if (!recipientId || !appointmentData) {
      return res.status(400).json({
        success: false,
        message: 'Missing recipientId or appointmentData'
      });
    }

    // Get recipient's FCM token from database
    const tokenRecord = await FCMToken.findOne({
      where: { userId: recipientId, userType: recipientType, isActive: true }
    });
    
    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Recipient FCM token not found'
      });
    }

    // Send appointment notification
    const response = await sendAppointmentNotification(tokenRecord.token, appointmentData);

    res.json({
      success: true,
      message: 'Appointment notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending appointment notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send appointment notification',
      error: error.message
    });
  }
});

/**
 * Send system notification
 * POST /api/fcm/send-system
 */
router.post('/send-system', authUser, async (req, res) => {
  try {
    const { recipientId, recipientType = 'patient', systemData } = req.body;

    if (!recipientId || !systemData) {
      return res.status(400).json({
        success: false,
        message: 'Missing recipientId or systemData'
      });
    }

    // Get recipient's FCM token from database
    const tokenRecord = await FCMToken.findOne({
      where: { userId: recipientId, userType: recipientType, isActive: true }
    });
    
    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Recipient FCM token not found'
      });
    }

    // Send system notification
    const response = await sendSystemNotification(tokenRecord.token, systemData);

    res.json({
      success: true,
      message: 'System notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending system notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send system notification',
      error: error.message
    });
  }
});

/**
 * Get all registered tokens (admin only)
 * GET /api/fcm/tokens
 */
router.get('/tokens', authUser, async (req, res) => {
  try {
    const userRole = req.user.role || req.userRole;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Get all active tokens from database
    const tokens = await FCMToken.findAll({
      where: { isActive: true },
      attributes: ['id', 'userId', 'userType', 'deviceType', 'createdAt', 'updatedAt']
    });
    
    res.json({
      success: true,
      tokens,
      count: tokens.length
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tokens',
      error: error.message
    });
  }
});

/**
 * Test notification endpoint
 * POST /api/fcm/test
 */
router.post('/test', authUser, async (req, res) => {
  try {
    const { recipientId, recipientType = 'patient', title, message } = req.body;

    if (!recipientId || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing recipientId, title, or message'
      });
    }

    // Get recipient's FCM token from database
    const tokenRecord = await FCMToken.findOne({
      where: { userId: recipientId, userType: recipientType, isActive: true }
    });
    
    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        message: 'Recipient FCM token not found'
      });
    }

    // Send test notification
    const systemData = {
      title,
      message,
      category: 'test'
    };

    const response = await sendSystemNotification(tokenRecord.token, systemData);

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      messageId: response
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
});

export default router;