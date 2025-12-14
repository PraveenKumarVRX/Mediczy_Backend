// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import api from '@/utils/api';

// Firebase config - Using env variables with fallback
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mediczy-notifications.firebaseapp.com", 
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mediczy-notifications",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mediczy-notifications.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "982376166047",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:982376166047:web:mediczy-app-id",
  measurementId: "G-XXXXXXXXXX"
};

// VAPID key for FCM
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BMR-v0zDJTYcXyF-69jwyk4BPzcPGOArW5VK8WxBLiB99Ult0I7gNkcJiFLTmRTUc8VdbcpwYlL7EMOpG9hCsk4";// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging (only in supported environments)
let messaging: any = null;

// Check if messaging is supported before initializing
// Enhanced check for FCM browser support
export const isMessagingSupported = (): boolean => {
  try {
    // Check essential requirements
    const hasServiceWorker = 'serviceWorker' in navigator;
    const hasNotification = 'Notification' in window;
    const hasSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
    const hasIndexedDB = 'indexedDB' in window;
    const hasPushManager = 'PushManager' in window;
    const hasPromise = typeof Promise !== 'undefined';
    
    // Log detailed compatibility information
    console.log('🔧 Firebase messaging compatibility check:');
    console.log('  Service Worker:', hasServiceWorker);
    console.log('  Notifications:', hasNotification);
    console.log('  Secure Context:', hasSecureContext);
    console.log('  IndexedDB:', hasIndexedDB);
    console.log('  Push Manager:', hasPushManager);
    console.log('  Promise Support:', hasPromise);
    
    // All requirements must be met
    const isSupported = hasServiceWorker && hasNotification && hasSecureContext && hasIndexedDB && hasPushManager && hasPromise;
    
    if (!isSupported) {
      if (!hasSecureContext) {
        console.warn('⚠️  Firebase messaging requires HTTPS or localhost');
      }
      if (!hasServiceWorker) {
        console.warn('⚠️  Service Worker not supported in this browser');
      }
      if (!hasNotification) {
        console.warn('⚠️  Notifications not supported in this browser');
      }
      if (!hasPushManager) {
        console.warn('⚠️  Push Manager not supported in this browser');
      }
    }
    
    return isSupported;
  } catch (error) {
    console.error('❌ Error checking Firebase messaging support:', error);
    return false;
  }
};

// Initialize messaging only if supported
if (isMessagingSupported()) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.warn('Firebase Messaging not supported in this browser:', error);
  }
}

export { messaging };

// Firebase configuration object for export
export { firebaseConfig };

// Get FCM registration token
export const getFCMToken = async (): Promise<string | null> => {
  try {
    // Check if messaging is supported and initialized
    if (!messaging) {
      console.warn('Firebase messaging is not available');
      return null;
    }

    if (!isMessagingSupported()) {
      console.warn('Firebase messaging is not supported in this environment');
      return null;
    }

    // Check if already registered
    let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    
    if (!registration) {
      // Register service worker
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
    }
    
    // Get FCM token
    const currentToken = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    
    if (currentToken) {
      console.log('✅ FCM registration token:', currentToken);
      return currentToken;
    } else {
      console.log('📱 No FCM token available. Request permission first.');
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Retry getting token
        const retryToken = await getToken(messaging, { 
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration
        });
        return retryToken;
      }
      return null;
    }
  } catch (error) {
    console.error('❌ Error retrieving FCM token:', error);
    return null;
  }
};

// Listen for foreground messages
export const onMessageListener = (): Promise<MessagePayload> => {
  return new Promise((resolve, reject) => {
    if (!messaging) {
      reject(new Error('Firebase messaging not initialized'));
      return;
    }

    onMessage(messaging, (payload) => {
      console.log('Message received in foreground:', payload);
      resolve(payload);
    });
  });
};

// Firebase messaging types
export interface FCMNotificationData {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  data?: Record<string, any>;
}

export interface FCMMessage extends MessagePayload {
  notification?: {
    title?: string;
    body?: string;
    image?: string;
  };
  data?: Record<string, string>;
}

// Helper function to handle notification click
export const handleNotificationClick = (data: Record<string, any>) => {
  // Handle different notification types
  switch (data.type) {
    case 'video_call':
      // Navigate to video call
      window.location.href = `/chat/video?appointmentId=${data.callId}`;
      break;
    case 'message':
      // Navigate to chat
      window.location.href = `/chat?conversationId=${data.conversationId}`;
      break;
    case 'appointment':
      // Navigate to appointments
      window.location.href = '/appointments';
      break;
    default:
      // Navigate to dashboard
      window.location.href = '/';
  }
};

// Initialize Firebase messaging for the app
export const initializeFirebaseMessaging = async () => {
  try {
    // Check if messaging is available
    if (!isMessagingSupported()) {
      console.log('🔔 Firebase messaging not supported in this browser - push notifications disabled');
      return;
    }

    if (!messaging) {
      console.log('🔔 Firebase messaging not available - check configuration');
      return;
    }

    // Request notification permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('🔔 Notification permission denied');
      return;
    }

    // Get FCM token
    const token = await getFCMToken();
    
    if (token) {
      // Store token in localStorage for server to use
      localStorage.setItem('fcmToken', token);
      
      // Send token to your server
      await sendTokenToServer(token);
    }
    
    // Listen for foreground messages
    onMessageListener()
      .then((payload) => {
        console.log('📱 Received foreground message:', payload);
        
        // Show notification if permission is granted
        if (Notification.permission === 'granted' && payload.notification) {
          new Notification(payload.notification.title || 'New Notification', {
            body: payload.notification.body,
            icon: payload.notification.image || '/favicon.ico',
            tag: payload.data?.type || 'general',
            data: payload.data
          });
        }
      })
      .catch((error) => {
        console.log('🔔 Firebase messaging listener not available:', error.message);
      });
    
  } catch (error) {
    console.error('❌ Error initializing Firebase messaging:', error);
  }
};

// Send FCM token to server
const sendTokenToServer = async (token: string) => {
  try {
    const userId = localStorage.getItem('userId');
    const userType = localStorage.getItem('userType');
    const authToken = localStorage.getItem('token');
    
    console.log('📤 Sending FCM token to server:', { userId, userType, hasAuthToken: !!authToken });
    
    if (!userId || !userType) {
      console.warn('⚠️ Cannot register FCM token: userId or userType not found in localStorage');
      console.log('   Available localStorage keys:', Object.keys(localStorage));
      return;
    }
    
    if (!authToken) {
      console.warn('⚠️ Cannot register FCM token: No auth token found');
      return;
    }
    
    const response = await api.post(
      '/fcm/register-token',
      {
        userId,
        userType,
        fcmToken: token,
        deviceType: detectDeviceType(),
      },
      {
        // Use the explicit user token here, not whatever getToken() chooses.
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    console.log('✅ FCM token registered successfully:', response.data);
  } catch (error) {
    console.error('❌ Error sending FCM token to server:', error);
  }
};

// Detect device type for token registration
const detectDeviceType = (): string => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/mobile/i.test(ua)) return 'mobile-web';
  return 'web';
};

export default app;