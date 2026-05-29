// Firebase Admin SDK configuration for sending push notifications
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin SDK only if credentials are properly configured
let messaging = null;          // patient/mobile default app
let doctorMessaging = null;    // doctor app
let webMessaging = null;       // web app, if configured separately
let isFirebaseInitialized = false;

// ── Service-account file locators ─────────────────────────────────────────────
const findServiceAccountFile = () => {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    resolve(__dirname, '../../config/firebase-service-account.json'),
    resolve(__dirname, '../config/firebase-service-account.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
};

// Optional separate service account for the doctor app project (doctorapp-6c768).
// Drop firebase-service-account-doctor.json next to the patient one to enable it.
const findDoctorServiceAccountFile = () => {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS_DOCTOR,
    resolve(__dirname, '../../config/firebase-service-account-doctor.json'),
    resolve(__dirname, '../config/firebase-service-account-doctor.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
};

// Optional separate service account for browser/web FCM project.
const findWebServiceAccountFile = () => {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS_WEB,
    resolve(__dirname, '../../config/firebase-service-account-web.json'),
    resolve(__dirname, '../config/firebase-service-account-web.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
};

// Check if Firebase should be initialized
const shouldInitializeFirebase = () => {
  const hasEnvCredentials = process.env.FIREBASE_PROJECT_ID && 
                           process.env.FIREBASE_PRIVATE_KEY && 
                           process.env.FIREBASE_CLIENT_EMAIL;
  const hasCredentialFile = !!findServiceAccountFile();
  return hasEnvCredentials || hasCredentialFile;
};

// Initialize Firebase if credentials are available
if (shouldInitializeFirebase()) {
  try {
    // ── Patient / default Firebase app ───────────────────────────────────────
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
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
      const saFile = findServiceAccountFile();
      if (saFile) {
        const serviceAccount = JSON.parse(readFileSync(saFile, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        console.log(`Firebase (patient) initialized from: ${saFile}`);
      } else {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'mediczy-notifications',
        });
      }
    }

    messaging = admin.messaging();
    isFirebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully');

    // ── Doctor Firebase app (separate project) ───────────────────────────────
    const doctorSaFile = findDoctorServiceAccountFile();
    if (doctorSaFile) {
      try {
        const dsa = JSON.parse(readFileSync(doctorSaFile, 'utf8'));
        const doctorApp = admin.initializeApp(
          { credential: admin.credential.cert(dsa), projectId: dsa.project_id },
          'doctor-app'
        );
        doctorMessaging = doctorApp.messaging();
        console.log(`Firebase (doctor) initialized from: ${doctorSaFile} [project: ${dsa.project_id}]`);
      } catch (dErr) {
        console.warn('Firebase doctor app init failed:', dErr.message);
      }
    } else {
      console.warn(
        '[Firebase] Doctor-app service account not found.\n' +
        '  Doctor push notifications will use the patient project, which may cause\n' +
        '  "SenderId mismatch" errors for the MSH_D_App (project: doctorapp-6c768).\n' +
        '  To fix: download the service account for doctorapp-6c768 from Firebase Console\n' +
        '  and save it as: config/firebase-service-account-doctor.json'
      );
    }


    // ── Web Firebase app (separate browser project, if configured) ───────────
    const webSaFile = findWebServiceAccountFile();
    if (webSaFile) {
      try {
        const wsa = JSON.parse(readFileSync(webSaFile, 'utf8'));
        const webApp = admin.initializeApp(
          { credential: admin.credential.cert(wsa), projectId: wsa.project_id },
          'web-app'
        );
        webMessaging = webApp.messaging();
        console.log(`Firebase (web) initialized from: ${webSaFile} [project: ${wsa.project_id}]`);
      } catch (wErr) {
        console.warn('Firebase web app init failed:', wErr.message);
      }
    } else {
      console.warn(
        '[Firebase] Web-app service account not found. Browser FCM tokens must use the default Firebase project,\n' +
        '  or you must provide config/firebase-service-account-web.json / GOOGLE_APPLICATION_CREDENTIALS_WEB.'
      );
    }
  } catch (error) {
    console.warn('Firebase Admin SDK initialization failed:', error.message);
    console.warn('Push notifications will be disabled. Please configure Firebase credentials to enable.');
  }
} else {
  console.warn('Firebase credentials not found. Push notifications will be disabled.');
  console.warn('To enable push notifications, configure Firebase environment variables or GOOGLE_APPLICATION_CREDENTIALS.');
}

/**
 * Pick the correct Firebase Messaging instance for the given recipient.
 * Falls back to the default (patient) instance when the doctor instance is absent.
 * @param {'doctor'|'patient'|string} [userType]
 */
function getMessaging(userType, deviceType) {
  if (userType === 'doctor' && doctorMessaging) return doctorMessaging;
  if ((deviceType === 'web' || deviceType === 'mobile-web') && webMessaging) return webMessaging;
  return messaging;
}

function hasMessagingFor(userType, deviceType) {
  if (userType === 'doctor') return !!doctorMessaging;
  if (deviceType === 'web' || deviceType === 'mobile-web') return !!webMessaging;
  return !!messaging;
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
 * @param {string} [userType] - 'doctor' or 'patient' — selects the correct Firebase app
 */
const sendPushNotification = async (token, notification, data = {}, userType, deviceType) => {
  if (!isFirebaseInitialized || !messaging) {
    console.warn('Firebase not initialized. Cannot send push notification.');
    return Promise.resolve(null);
  }
  const fcm = getMessaging(userType, deviceType);

  try {
    // FCM requires ALL data values to be strings — coerce everything
    const stringData = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        stringData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.image || undefined,
      },
      data: {
        ...stringData,
        timestamp: new Date().toISOString(),
        clickAction: notification.clickAction || 'FLUTTER_NOTIFICATION_CLICK'
      },
      token: token,
      android: {
        notification: {
          icon: 'notification_icon',
          color: '#2563eb',
          sound: notification.sound || 'default',
          priority: 'high',
          defaultSound: !notification.sound,
          channelId: notification.channelId || 'mediczy_notifications',
          notificationPriority: notification.notificationPriority || 'PRIORITY_DEFAULT',
          visibility: notification.visibility || 'PRIVATE',
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

    const response = await fcm.send(message);
    console.log('Successfully sent push notification:', response);
    return response;
  } catch (error) {
    const errCode = error?.errorInfo?.code || error?.code || '';
    // Mismatched-credential = FCM token belongs to a different Firebase project.
    // Treat the same as a stale token so callers can deactivate it.
    if (errCode.includes('mismatched-credential') || errCode.includes('invalid-registration-token') || errCode.includes('registration-token-not-registered')) {
      console.warn(`[FCM] Stale/mismatched token detected (${errCode}). Token should be deactivated.`);
    } else {
      console.error('Error sending push notification:', error);
    }
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
    // FCM requires ALL data values to be strings — coerce everything
    const stringData = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        stringData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.image || undefined,
      },
      data: {
        ...stringData,
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
const sendVideoCallNotification = async (recipientToken, callData, userType, deviceType) => {
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

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
};

/**
 * Send triage call notification to doctor
 * @param {string} recipientToken - FCM token of doctor
 * @param {object} callData - Triage call information
 */
const sendTriageCallNotification = async (recipientToken, callData, userType, deviceType) => {
  const notification = {
    title: '🚨 Emergency Triage Call',
    body: `${callData.patientName} needs urgent medical attention`,
    icon: '/emergency-icon.png',
    requireInteraction: true,
    category: 'CALL'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.VIDEO_CALL,
    appointmentId: String(callData.appointmentId),
    roomId: callData.roomId,
    patientId: String(callData.patientId),
    patientName: callData.patientName,
    patientPhone: callData.patientPhone || '',
    symptoms: callData.symptoms || '',
    urgencyLevel: callData.urgencyLevel || 'MEDIUM',
    joinUrl: callData.joinUrl || '',
    clickAction: 'answer_triage_call'
  };

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
};

/**
 * Send call accepted notification to patient
 * @param {string} recipientToken - FCM token of patient
 * @param {object} acceptData - Call acceptance data
 */
const sendCallAcceptedNotification = async (recipientToken, acceptData, userType, deviceType) => {
  const notification = {
    title: '✅ Doctor Accepted Your Call',
    body: `${acceptData.doctorName} is joining the video call`,
    icon: '/doctor-icon.png',
    requireInteraction: true
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.VIDEO_CALL,
    appointmentId: String(acceptData.appointmentId),
    roomId: acceptData.roomId,
    doctorName: acceptData.doctorName,
    clickAction: 'join_call'
  };

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
};

/**
 * Send call rejected notification to patient
 * @param {string} recipientToken - FCM token of patient
 * @param {object} rejectData - Call rejection data
 */
const sendCallRejectedNotification = async (recipientToken, rejectData, userType, deviceType) => {
  const notification = {
    title: '❌ Call Not Available',
    body: rejectData.reason || 'Doctor is currently unavailable',
    icon: '/info-icon.png'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.SYSTEM,
    appointmentId: String(rejectData.appointmentId),
    reason: rejectData.reason || 'unavailable',
    clickAction: 'try_again'
  };

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
};

/**
 * Send a data-only FCM message for incoming call notifications.
 * Data-only messages wake the Android app even when it's killed/backgrounded,
 * allowing the app to display a full-screen call UI and play a ringtone.
 * @param {string} token - FCM token of the recipient
 * @param {object} data - Call data payload
 */
const sendCallDataOnlyMessage = async (token, data = {}) => {
  if (!isFirebaseInitialized || !messaging) {
    console.warn('Firebase not initialized. Cannot send call notification.');
    return Promise.resolve(null);
  }

  try {
    const stringData = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        stringData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
    stringData.timestamp = new Date().toISOString();

    const message = {
      data: stringData,
      token: token,
      android: {
        priority: 'high',    // wakes the device even in Doze mode
        ttl: 30 * 1000,      // 30-second TTL — discard if device offline > 30 s
        // Include a notification payload so the OS shows a visible heads-up /
        // lock-screen notification even when the app is killed or in standby.
        // Without this, data-only messages are silently dropped if the app
        // has not registered a setBackgroundMessageHandler.
        notification: {
          title: stringData.title || '📞 Incoming Video Call',
          body: stringData.body || 'Your doctor has started the video consultation. Tap to join.',
          channelId: stringData.channelId || 'mediczy_incoming_call',
          sound: 'default',
          defaultSound: true,
          vibrateTimingsMillis: [0, 500, 500, 500],
          visibility: 'PUBLIC',
          priority: 'high',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            alert: {
              title: stringData.title || '📞 Incoming Video Call',
              body: stringData.body || 'Your doctor has started the video consultation. Tap to join.',
            },
            badge: 1,
            sound: 'call_ringtone.caf',
            category: 'INCOMING_CALL',
            'content-available': 1,
          }
        }
      }
    };

    const response = await messaging.send(message);
    console.log('Successfully sent call data notification:', response);
    return response;
  } catch (error) {
    console.error('Error sending call data notification:', error);
    throw error;
  }
};

/**
 * Send doctor calling notification to patient
 * @param {string} recipientToken - FCM token of patient
 * @param {object} callData - Call data with doctor info and meeting link
 */
const sendDoctorCallingNotification = async (recipientToken, callData) => {
  // Use data-only message so the Android app wakes up and handles the call UI.
  // A notification+data message lets the OS handle it silently in the background.
  const data = {
    type: FCM_NOTIFICATION_TYPES.VIDEO_CALL,
    notificationType: 'incoming_call',
    appointmentId: String(callData.appointmentId),
    meetingLink: callData.meetingLink || '',
    doctorName: callData.doctorName || '',
    doctorId: String(callData.doctorId || ''),
    callInitiatedAt: callData.callInitiatedAt || new Date().toISOString(),
    action: 'join_call',
    clickAction: 'join_video_call',
    // Notification display hints for the Android handler
    title: `📞 ${callData.doctorName || 'Your doctor'} is calling`,
    body: 'Your doctor has started the video consultation. Tap to join now!',
    sound: 'call_ringtone',
    channelId: 'mediczy_incoming_call',
  };

  return sendCallDataOnlyMessage(recipientToken, data);
};

/**
 * Send message notification
 * @param {string} recipientToken - FCM token of message recipient
 * @param {object} messageData - Message information
 */
const sendMessageNotification = async (recipientToken, messageData, userType, deviceType) => {
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

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
};

/**
 * Send appointment notification
 * @param {string} recipientToken - FCM token of recipient
 * @param {object} appointmentData - Appointment information
 */
const sendAppointmentNotification = async (recipientToken, appointmentData, userType, deviceType) => {
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

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
};

/**
 * Send system notification
 * @param {string} recipientToken - FCM token of recipient
 * @param {object} systemData - System notification data
 */
const sendSystemNotification = async (recipientToken, systemData, userType, deviceType) => {
  const notification = {
    title: systemData.title,
    body: systemData.message,
    icon: '/system-icon.png'
  };

  const data = {
    type: FCM_NOTIFICATION_TYPES.SYSTEM,
    category: systemData.category || 'general',
    clickAction: systemData.clickAction || 'open_app',
    // Merge any extra data (appointmentId, meetingLink, etc.) from the caller
    ...(systemData.extraData || {})
  };

  return sendPushNotification(recipientToken, notification, data, userType, deviceType);
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
const validateToken = async (token, userType, deviceType) => {
  if (!isFirebaseInitialized || !messaging) {
    console.warn('Firebase not initialized. Cannot validate token.');
    return false;
  }

  const fcm = getMessaging(userType, deviceType);
  if (!fcm) {
    console.warn(`Firebase messaging not available for userType=${userType || 'unknown'} deviceType=${deviceType || 'unknown'}.`);
    return false;
  }

  try {
    // Firebase Admin validates a token by sending a dry-run message.
    // dryRun is the second argument to send(); it is not part of the message payload.
    const testMessage = {
      token,
      data: { test: 'true' }
    };

    await fcm.send(testMessage, true);
    return true;
  } catch (error) {
    console.error('Invalid FCM token:', error);
    return false;
  }
};

export {
  sendPushNotification,
  sendCallDataOnlyMessage,
  sendMulticastNotification,
  sendVideoCallNotification,
  sendTriageCallNotification,
  sendCallAcceptedNotification,
  sendCallRejectedNotification,
  sendDoctorCallingNotification,
  sendMessageNotification,
  sendAppointmentNotification,
  sendSystemNotification,
  validateToken,
  FCM_NOTIFICATION_TYPES,
  getMessaging,
  hasMessagingFor,
  isFirebaseInitialized
};