# 🔥 SmartHealth Firebase Configuration Guide

**Date:** February 8, 2026  
**Status:** In Progress (OTP Login First)  
**Version:** 1.0.0  
**Firebase Project:** `mediczy-notifications`

---

## 🎯 Overview

This guide helps you configure Firebase Cloud Messaging (FCM) for SmartHealth mobile app. Currently experiencing 403 error due to API permissions - this guide provides troubleshooting steps.

**Note:** Implement OTP login first (SMARTHEALTH_OTP_LOGIN_INTEGRATION_CHECKLIST.md), then enable Firebase for push notifications.

---

## 📋 Pre-Configuration Checklist

### Step 1: Verify Firebase Project

- [ ] Firebase Console Access
  - [ ] Login to [Firebase Console](https://console.firebase.google.com)
  - [ ] Select project: `mediczy-notifications`
  - [ ] Verify project ID: `mediczy-notifications`

- [ ] Enable Required APIs
  - [ ] Go to **Project Settings** → **APIs & Services**
  - [ ] Enable: **Cloud Messaging API**
  - [ ] Enable: **Firebase Installations API**
  - [ ] Enable: **Firebase Cloud Messaging API**
  - [ ] Enable: **Firebase Realtime Database API** (optional)

### Step 2: Get Firebase Credentials

**Location:** Firebase Console → Project Settings → Service Accounts

- [ ] Download Service Account Key JSON
- [ ] Save as `firebase-service-account.json` (never commit to git)
- [ ] Extract following credentials:

```json
{
  "type": "service_account",
  "project_id": "mediczy-notifications",
  "private_key_id": "xxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-xxx@mediczy-notifications.iam.gserviceaccount.com",
  "client_id": "xxx",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

### Step 3: Get Web Configuration

**Location:** Firebase Console → Project Settings → General (scroll down)

- [ ] Web apps section:
  - [ ] If no web app exists, click **Add App**
  - [ ] Select **Web** (</>)
  - [ ] Enter App Name: "SmartHealth Web"
  - [ ] Create

- [ ] Copy Firebase SDK configuration:

```javascript
// Example (replace with actual values from your firebase console)
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "mediczy-notifications.firebaseapp.com",
  projectId: "mediczy-notifications",
  storageBucket: "mediczy-notifications.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456",
  measurementId: "G-XXXXXXX"
};
```

### Step 4: Get VAPID Key

**Location:** Firebase Console → Project Settings → Cloud Messaging tab

- [ ] Copy **Server API Key** (legacy - deprecated)
- [ ] Copy **Web Push certificates**
  - [ ] Click **Generate Key Pair** if not exists
  - [ ] Save **Public Key** (used as VAPID key)
  - [ ] Example: `BCxxxxxxxxxxxxxxxxx...` (long string)

---

## 🔧 Environment Configuration

Create/Update `.env` file with Firebase credentials:

```bash
# Firebase Web Configuration
REACT_APP_FIREBASE_API_KEY=AIzaSyC...
REACT_APP_FIREBASE_AUTH_DOMAIN=mediczy-notifications.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=mediczy-notifications
REACT_APP_FIREBASE_STORAGE_BUCKET=mediczy-notifications.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:abcdef123456
REACT_APP_FIREBASE_MEASUREMENT_ID=G-XXXXXXX

# FCM Push Notifications
REACT_APP_FCM_PUBLIC_VAPID_KEY=BCxxxxxxxxxxxxxxxxx...

# Backend Integration
REACT_APP_AUTH_BASE_URL=https://app.mediqzy.com/api
REACT_APP_API_BASE_URL=https://api.mediqzy.com
REACT_APP_ENABLE_FCM=true

# Firebase Debug Mode (for troubleshooting)
REACT_APP_FIREBASE_DEBUG=false
```

**NEVER commit `.env` to git!** Add to `.gitignore`:
```bash
.env
.env.local
.env.*.local
firebase-service-account.json
```

---

## 💻 Web/React Configuration

### Step 1: Initialize Firebase

**File:** `services/firebase.js`

```javascript
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging/sw';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize FCM
let messaging = null;
try {
  messaging = getMessaging(app);
  console.log('✅ Firebase Messaging initialized');
} catch (error) {
  console.warn('⚠️ Firebase Messaging initialization skipped:', error.message);
}

export { app, messaging };
```

### Step 2: Register FCM Token

**File:** `services/fcmService.js`

```javascript
import { getMessaging, getToken, onMessage } from 'firebase/messaging/sw';
import { app } from './firebase';
import * as SecureStore from 'expo-secure-store';

export const FCMService = {
  async registerToken() {
    try {
      const messaging = getMessaging(app);
      
      const token = await getToken(messaging, {
        vapidKey: process.env.REACT_APP_FCM_PUBLIC_VAPID_KEY
      });

      if (token) {
        console.log('✅ FCM Token:', token);
        await SecureStore.setItemAsync('fcm_token', token);
        
        // Register device on backend
        await this.registerDeviceOnBackend(token);
        return token;
      } else {
        console.log('⚠️ No FCM token available');
      }
    } catch (error) {
      console.warn('⚠️ FCM token registration failed:', error);
      console.warn('   This is normal if:');
      console.warn('   - Private browsing mode is enabled');
      console.warn('   - IndexedDB is blocked');
      console.warn('   - Notifications are disabled in browser');
      console.warn('   - HTTPS is not enabled');
    }
  },

  async registerDeviceOnBackend(token) {
    try {
      const jwtToken = await SecureStore.getItemAsync('jwt_token');
      
      if (!jwtToken) {
        console.log('⚠️ No JWT token available, skipping device registration');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/notifications/register-device`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_token: token,
          device_type: 'web',
          device_name: navigator.userAgent,
          platform: 'web'
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ Device registered on backend');
      } else {
        console.warn('⚠️ Device registration failed:', data.message);
      }
    } catch (error) {
      console.error('❌ Error registering device:', error);
    }
  },

  // Listen for incoming messages
  onMessageListener() {
    const messaging = getMessaging(app);
    
    return new Promise(resolve => {
      onMessage(messaging, payload => {
        console.log('📬 Message received:', payload);
        
        const notificationTitle = payload.notification?.title || 'SmartHealth';
        const notificationOptions = {
          body: payload.notification?.body || 'New message',
          icon: '/icon.png',
          badge: '/badge.png',
          tag: 'notification',
          data: payload.data || {}
        };

        if (Notification.permission === 'granted') {
          new Notification(notificationTitle, notificationOptions);
        }

        resolve(payload);
      });
    });
  }
};
```

### Step 3: Service Worker Configuration

**File:** `public/firebase-messaging-sw.js`

```javascript
// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Firebase configuration (from your Firebase console)
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "mediczy-notifications.firebaseapp.com",
  projectId: "mediczy-notifications",
  storageBucket: "mediczy-notifications.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(payload => {
  console.log('📬 Background message received:', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png',
    badge: '/badge.png',
    tag: 'notification',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

### Step 4: Request Notification Permission

**File:** `utils/notificationPermission.js`

```javascript
export const requestNotificationPermission = async () => {
  // Check if Notification API is available
  if (!('Notification' in window)) {
    console.log('⚠️ Notifications not supported in this browser');
    return false;
  }

  // Check if permission already granted
  if (Notification.permission === 'granted') {
    console.log('✅ Notification permission already granted');
    return true;
  }

  // Skip if already denied
  if (Notification.permission === 'denied') {
    console.log('⚠️ Notification permission denied by user');
    return false;
  }

  // Request permission
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Notification permission granted');
      return true;
    } else {
      console.log('⚠️ Notification permission not granted');
      return false;
    }
  } catch (error) {
    console.error('❌ Error requesting permission:', error);
    return false;
  }
};
```

### Step 5: Integrate into App

**File:** `App.js` or `providers/FCMProvider.js`

```javascript
import { useEffect } from 'react';
import { FCMService } from './services/fcmService';
import { requestNotificationPermission } from './utils/notificationPermission';

export function FCMProvider({ children }) {
  useEffect(() => {
    const initFCM = async () => {
      // Request notification permission
      const hasPermission = await requestNotificationPermission();

      if (hasPermission) {
        // Register FCM token
        await FCMService.registerToken();

        // Listen for incoming messages
        FCMService.onMessageListener();
      }
    };

    initFCM();
  }, []);

  return children;
}

// In App.js:
import { FCMProvider } from './providers/FCMProvider';

export default function App() {
  return (
    <FCMProvider>
      <AuthProvider>
        {/* Your app content */}
      </AuthProvider>
    </FCMProvider>
  );
}
```

---

## 📱 React Native/Expo Configuration

### Step 1: Install Dependencies

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
npm install expo-secure-store
```

### Step 2: Configure Firebase

**File:** `services/firebaseRN.js`

```javascript
import { initializeApp } from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// Request permission for iOS
export async function requestMessagingPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
  }
}

// Get FCM token
export async function getFCMToken() {
  try {
    const token = await messaging().getToken();
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

// Listen for messages (foreground)
export function listenForMessages() {
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    console.log('📬 Message received (foreground):', remoteMessage);
    
    // Handle notification
    Alert.alert(
      remoteMessage.notification?.title || 'Notification',
      remoteMessage.notification?.body || 'You have a new message'
    );
  });

  return unsubscribe;
}

// Handle background messages
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📬 Message received (background):', remoteMessage);
});

// Handle notification tap
messaging().onNotificationOpenedApp(remoteMessage => {
  console.log('📬 App opened from notification:', remoteMessage);
  // Navigate to relevant screen based on notification data
});

export { messaging };
```

---

## 🐛 Troubleshooting

### Issue 1: Firebase 403 Error

**Error Message:**
```
POST https://firebaseinstallations.googleapis.com/v1/projects/mediczy-notifications/installations 403 (Forbidden)
```

**Root Cause:**
- API not enabled in Firebase console
- Invalid/expired API key
- CORS policy violation
- Insufficient permissions

**Solutions:**

**Option A: Enable Cloud Messaging API**
1. Open [Google Cloud Console](https://console.cloud.google.com)
2. Select project: `mediczy-notifications`
3. Search: **Cloud Messaging API**
4. Click **Enable**
5. Wait 5 minutes for changes to propagate

**Option B: Verify API Key**
```javascript
// Log API key to verify it's loaded
console.log('Firebase Config:', {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY?.substring(0, 20) + '...',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID
});
```

**Option C: Disable Firebase (Temporary Workaround)**
```javascript
const enableFirebase = process.env.REACT_APP_ENABLE_FCM === 'true';

if (enableFirebase) {
  initFirebase();
} else {
  console.log('⚠️ Firebase disabled - OTP login will work, but no push notifications');
}
```

### Issue 2: Service Worker Registration Failed

**Check:**
1. App must be served over HTTPS (not localhost)
2. Service worker file must be in `public/` folder
3. Browser privacy mode may block service workers

**Solution:**
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then(registration => {
      console.log('✅ Service Worker registered:', registration);
    })
    .catch(error => {
      console.warn('⚠️ Service Worker registration failed:', error);
    });
}
```

### Issue 3: Notification Permission Denied

**User sees "Block" button instead of "Allow"**

1. Check browser notification settings:
   - Chrome: Settings → Privacy → Site Settings → Notifications
   - Firefox: Settings → Privacy → Permissions → Notifications

2. Reset permission:
   - Click info icon next to URL
   - Change Notifications permission
   - Reload page

### Issue 4: IndexedDB Access Denied

**Error:** `IndexedDB is not accessible`

**Causes:**
- Private browsing mode
- Browser storage quota exceeded
- Browser privacy extensions blocking IndexedDB

**Solution:**
```javascript
const checkIndexedDB = () => {
  try {
    const request = indexedDB.open('test');
    request.onsuccess = () => {
      console.log('✅ IndexedDB accessible');
      indexedDB.deleteDatabase('test');
    };
    request.onerror = () => {
      console.warn('⚠️ IndexedDB blocked - try disabling private browsing');
    };
  } catch (e) {
    console.warn('⚠️ IndexedDB error:', e.message);
  }
};

checkIndexedDB();
```

---

## ✅ Testing & Verification

### Test 1: Firebase Initialization

```javascript
import { get Messaging, getApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';

const testFirebaseInit = () => {
  try {
    const app = getApp();
    console.log('✅ Firebase app initialized:', app.name);
    
    const messaging = getMessaging(app);
    console.log('✅ Firebase Messaging initialized');
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
  }
};

testFirebaseInit();
```

### Test 2: Request Notification Permission

```javascript
if (Notification.permission === 'granted') {
  console.log('✅ Notification permission granted');
} else if (Notification.permission === 'denied') {
  console.log('❌ Notification permission denied');
} else {
  console.log('⏳ Notification permission not requested yet');
}
```

### Test 3: Get FCM Token

```javascript
import { getMessaging, getToken } from 'firebase/messaging/sw';

const testGetToken = async () => {
  try {
    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: process.env.REACT_APP_FCM_PUBLIC_VAPID_KEY
    });
    console.log('✅ FCM Token:', token);
  } catch (error) {
    console.error('❌ Error getting token:', error.message);
  }
};

testGetToken();
```

### Test 4: Send Test Notification

**From Firebase Console:**
1. Firebase Console → Cloud Messaging
2. Click **Send your first message**
3. Enter Title: "Test Notification"
4. Enter Message: "Hello from Firebase"
5. Click **Send**

**From Backend (Node.js):**
```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const message = {
  notification: {
    title: 'Test Notification',
    body: 'This is a test message'
  },
  webpush: {
    headers: {
      TTL: '3600'
    }
  },
  token: 'FCM_TOKEN_HERE'
};

admin.messaging().send(message)
  .then(response => {
    console.log('✅ Message sent:', response);
  })
  .catch(error => {
    console.error('❌ Error sending message:', error);
  });
```

---

## 📊 Migration Plan

**Phase 1: OTP Login (Priority 1)** ✅
- [ ] Implement OTP-based authentication
- [ ] Test login flow
- [ ] Deploy to staging/production

**Phase 2: Firebase Troubleshooting (Priority 2)**
- [ ] Fix 403 error
- [ ] Enable Cloud Messaging API
- [ ] Verify VAPID key configuration

**Phase 3: Push Notifications (Priority 3)**
- [ ] Implement FCM token registration
- [ ] Handle foreground/background messages
- [ ] Test notification delivery

**Phase 4: Advanced Features (Priority 4)**
- [ ] Rich notifications with images
- [ ] Deep linking from notifications
- [ ] Notification preferences/settings

---

## 🔐 Security Best Practices

1. **Never expose private key**
   - Keep `firebase-service-account.json` out of git
   - Use `.gitignore` for sensitive files
   - Store credentials in secure environment variables

2. **Use HTTPS only**
   - Firebase requires secure context
   - All API calls must be over HTTPS

3. **Validate tokens**
   - Always verify JWT token on backend
   - Check notification source before processing

4. **Limit permissions**
   - FCM tokens should be associated with user accounts
   - Implement proper authorization checks

---

## 📞 Support & Resources

### Debugging Tools
- [Firebase Console](https://console.firebase.google.com) - Monitor messages
- [Chrome DevTools](chrome://devtools/) - Network & console logs
- [Service Worker Inspector](chrome://serviceworker-internals/) - SW debugging

### Official Documentation
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Notifications](https://web.dev/notifications/)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

### Common Links
- [Firebase Troubleshooting Guide](https://firebase.google.com/support/troubleshoot)
- [Google Cloud Console](https://console.cloud.google.com)
- [Firebase Console](https://console.firebase.google.com)

---

## 📝 Environment Checklist

- [ ] `.env` file created with all Firebase credentials
- [ ] `.gitignore` includes `.env` and `firebase-service-account.json`
- [ ] Firebase APIs enabled in Google Cloud Console
- [ ] Service worker file exists at `public/firebase-messaging-sw.js`
- [ ] VAPID key configured in environment
- [ ] Firebase app initialized in code
- [ ] Notification permission requested
- [ ] FCM token registration implemented
- [ ] Backend device registration endpoint accessible

---

**Version:** 1.0.0  
**Last Updated:** February 8, 2026  
**Status:** 🟡 In Progress (OTP Login First)  
**Priority:** Medium (after OTP Authentication)

**Next Step:** Implement OTP login first, then enable Firebase for push notifications.
