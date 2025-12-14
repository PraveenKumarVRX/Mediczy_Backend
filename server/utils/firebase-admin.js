// Firebase Admin SDK configuration for sending push notifications
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if credentials are properly configured
let messaging = null;
let isFirebaseInitialized = false;

// Check if Firebase should be initialized
const shouldInitializeFirebase = () => {
  // Check for environment variables first
  const hasEnvCredentials = process.env.FIREBASE_PROJECT_ID && 
                           process.env.FIREBASE_PRIVATE_KEY && 
                           process.env.FIREBASE_CLIENT_EMAIL;
  
  const hasCredentialFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  return hasEnvCredentials || hasCredentialFile;
};

// Initialize Firebase if credentials are available
if (shouldInitializeFirebase()) {
  try {
    // Try environment variables first
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    } else {
      // Use default credentials (from GOOGLE_APPLICATION_CREDENTIALS)
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'mediczy-notifications',
      });
    }

    messaging = admin.messaging();
    isFirebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.warn('Firebase Admin SDK initialization failed:', error.message);
    console.warn('Push notifications will be disabled. Please configure Firebase credentials to enable.');
  }
} else {
  console.warn('Firebase credentials not found. Push notifications will be disabled.');
  console.warn('To enable push notifications, configure Firebase environment variables or GOOGLE_APPLICATION_CREDENTIALS.');
}

// FCM notification types
const FCM_NOTIFICATION_TYPES = {
  VIDEO_CALL: 'video_call',
  MESSAGE: 'message',
  APPOINTMENT: 'appointment',
  SYSTEM: 'system'
};

/**
 * Send push notification to a specific user
 * @param {string} token - FCM token of the recipient
 * @param {object} notification - Notification data
 * @param {object} data - Additional data to send with notification
 */
const sendPushNotification = async (token, notification, data = {}) => {
  if (!isFirebaseInitialized || !messaging) {
    console.warn('Firebase not initialized. Cannot send push notification.');
    return Promise.resolve(null);
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.image || undefined,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        clickAction: notification.clickAction || 'FLUTTER_NOTIFICATION_CLICK'
      },
      token: token,
      android: {
        notification: {
          icon: 'notification_icon',
          color: '#2563eb',
          sound: 'default',
          priority: 'high',
          defaultSound: true,
          channelId: 'mediczy_notifications'
        },
        priority: 'high',
        ttl: 3600 * 1000, // 1 hour
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: notification.badge || 1,
            sound: 'default',
            category: notification.category || 'GENERAL'
          },
        },
      },
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/favicon.ico',
          badge: '/badge-icon.png',
          image: notification.image,
          tag: data.type || 'general',
          requireInteraction: notification.requireInteraction || false,
          actions: getNotificationActions(data.type)
        },
        fcm_options: {
          link: notification.link || '/'
        }
      }
    };

    const response = await messaging.send(message);
    console.log('Successfully sent push notification:', response);
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} tokens - Array of FCM tokens
 * @param {object} notification - Notification data
 * @param {object} data - Additional data to send with notification
 */
const sendMulticastNotification = async (tokens, notification, data = {}) => {
  if (!isFirebaseInitialized || !messaging) {
    console.warn('Firebase not initialized. Cannot send multicast notification.');
    return Promise.resolve(null);
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.image || undefined,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      tokens: tokens,
      android: {
        notification: {
          icon: 'notification_icon',
          color: '#2563eb',
          sound: 'default',
          priority: 'high',
          channelId: 'mediczy_notifications'
        },
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: 1,
            sound: 'default',
          },
        },
      },
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/favicon.ico',
          tag: data.type || 'general',
        }
      }
    };

    const response = await messaging.sendMulticast(message);
    console.log(`Successfully sent multicast notification. Success: ${response.successCount}, Failures: ${response.failureCount}`);
    
    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          console.error(`Failed to send to token ${tokens[idx]}:`, resp.error);
        }
      });
      
      // You might want to remove invalid tokens from your database here
      // await removeInvalidTokens(failedTokens);
    }
    
    return response;
  } catch (error) {
    console.error('Error sending multicast notification:', error);
    throw error;
  }
};

/**
 * Send video call notification
 * @param {string} recipientToken - FCM token of call recipient
 * @param {object} callData - Video call information
 */
const sendVideoCallNotification = async (recipientToken, callData) => {
  const notification = {
    title: '📞 Incoming Video Call',
    body: `${callData.callerName} is calling you`,
    icon: '/call-icon.png',
    requireInteraction: true,
    category: 'CALL'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.VIDEO_CALL,
    callId: callData.callId,
    callerId: callData.callerId,
    callerName: callData.callerName,
    channelName: callData.channelName,
    clickAction: 'answer_call'
  };

  return sendPushNotification(recipientToken, notification, data);
};

/**
 * Send message notification
 * @param {string} recipientToken - FCM token of message recipient
 * @param {object} messageData - Message information
 */
const sendMessageNotification = async (recipientToken, messageData) => {
  const notification = {
    title: `💬 New Message from ${messageData.senderName}`,
    body: messageData.message.length > 100 
      ? messageData.message.substring(0, 100) + '...' 
      : messageData.message,
    icon: '/message-icon.png'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.MESSAGE,
    conversationId: messageData.conversationId,
    senderId: messageData.senderId,
    senderName: messageData.senderName,
    messageId: messageData.messageId,
    clickAction: 'open_chat'
  };

  return sendPushNotification(recipientToken, notification, data);
};

/**
 * Send appointment notification
 * @param {string} recipientToken - FCM token of recipient
 * @param {object} appointmentData - Appointment information
 */
const sendAppointmentNotification = async (recipientToken, appointmentData) => {
  const notification = {
    title: '📅 Appointment Reminder',
    body: `Your appointment with ${appointmentData.doctorName} is ${appointmentData.timeUntil}`,
    icon: '/calendar-icon.png'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.APPOINTMENT,
    appointmentId: appointmentData.appointmentId,
    doctorId: appointmentData.doctorId,
    doctorName: appointmentData.doctorName,
    appointmentTime: appointmentData.appointmentTime,
    clickAction: 'view_appointment'
  };

  return sendPushNotification(recipientToken, notification, data);
};

/**
 * Send system notification
 * @param {string} recipientToken - FCM token of recipient
 * @param {object} systemData - System notification data
 */
const sendSystemNotification = async (recipientToken, systemData) => {
  const notification = {
    title: systemData.title,
    body: systemData.message,
    icon: '/system-icon.png'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.SYSTEM,
    category: systemData.category || 'general',
    clickAction: systemData.clickAction || 'open_app'
  };

  return sendPushNotification(recipientToken, notification, data);
};

/**
 * Get notification actions based on type
 */
function getNotificationActions(type) {
  switch (type) {
    case FCM_NOTIFICATION_TYPES.VIDEO_CALL:
      return [
        { action: 'answer', title: 'Answer', icon: '/answer-icon.png' },
        { action: 'decline', title: 'Decline', icon: '/decline-icon.png' }
      ];
    case FCM_NOTIFICATION_TYPES.MESSAGE:
      return [
        { action: 'reply', title: 'Reply', icon: '/reply-icon.png' },
        { action: 'view', title: 'View', icon: '/view-icon.png' }
      ];
    case FCM_NOTIFICATION_TYPES.APPOINTMENT:
      return [
        { action: 'view', title: 'View Details', icon: '/calendar-icon.png' }
      ];
    default:
      return [];
  }
}

/**
 * Validate FCM token
 * @param {string} token - FCM token to validate
 */
const validateToken = async (token) => {
  if (!isFirebaseInitialized || !messaging) {
    console.warn('Firebase not initialized. Cannot validate token.');
    return false;
  }

  try {
    // Try to send a test message to validate token
    const testMessage = {
      token,
      data: { test: 'true' },
      dry_run: true // Don't actually send the message
    };
    
    await messaging.send(testMessage);
    return true;
  } catch (error) {
    console.error('Invalid FCM token:', error);
    return false;
  }
};

export {
  sendPushNotification,
  sendMulticastNotification,
  sendVideoCallNotification,
  sendMessageNotification,
  sendAppointmentNotification,
  sendSystemNotification,
  validateToken,
  FCM_NOTIFICATION_TYPES,
  isFirebaseInitialized
};