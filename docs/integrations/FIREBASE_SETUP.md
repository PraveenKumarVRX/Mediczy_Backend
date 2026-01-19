# Firebase Push Notifications Setup Guide

## 🔥 Firebase Project Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or use existing project
3. Name your project: `mediczy-notifications`
4. Enable Google Analytics (optional)

### 2. Enable Cloud Messaging
1. In Firebase Console, go to **Project Settings** (gear icon)
2. Click on **Cloud Messaging** tab
3. Note down your **Server Key** and **Sender ID**

### 3. Generate Web App Credentials
1. In Project Settings, go to **General** tab
2. Scroll to "Your apps" section
3. Click **Web app icon** (</>) to add web app
4. Register your app with nickname: `mediczy-web`
5. Copy the Firebase configuration object

### 4. Generate VAPID Key
1. In **Cloud Messaging** tab of Project Settings
2. Scroll to **Web configuration**
3. Click **Generate key pair** under "Web push certificates"
4. Copy the **Key pair** (VAPID key)

### 5. Generate Service Account Key (Server)
1. Go to **Project Settings** → **Service Accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. Keep this file secure - it contains private keys!

## 🔧 Configuration

### Client Configuration (`/client/src/lib/firebase-config.ts`)

Replace the placeholder values with your actual Firebase config:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", 
  authDomain: "mediczy-notifications.firebaseapp.com",
  projectId: "mediczy-notifications", 
  storageBucket: "mediczy-notifications.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdefghijklmnop",
  measurementId: "G-XXXXXXXXXX"
};

const VAPID_KEY = "BNdoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
```

### Server Configuration (`/server/utils/firebase-admin.js`)

Replace the service account with your downloaded JSON:

```javascript
const serviceAccount = {
  "type": "service_account",
  "project_id": "mediczy-notifications", 
  "private_key_id": "abcdef1234567890",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_PRIVATE_KEY\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@mediczy-notifications.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs/firebase-adminsdk-xxxxx%40mediczy-notifications.iam.gserviceaccount.com"
};
```

### Service Worker Configuration (`/client/public/firebase-messaging-sw.js`)

Update the Firebase config in service worker to match your client config.

## 🔒 Environment Variables (Recommended)

For production, use environment variables instead of hardcoded values:

### Client (.env)
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=mediczy-notifications.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mediczy-notifications
VITE_FIREBASE_STORAGE_BUCKET=mediczy-notifications.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
VITE_FIREBASE_VAPID_KEY=your_vapid_key
```

### Server (.env)
```env
FIREBASE_PROJECT_ID=mediczy-notifications
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
# OR
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
```

## 🚀 Testing Push Notifications

### 1. Test Browser Notifications
1. Open the app and grant notification permissions
2. Check browser developer tools for FCM token in console
3. Use the `/api/fcm/test` endpoint to send test notifications

### 2. Test Video Call Notifications
1. Start a video call between two users
2. Check that offline user receives push notification
3. Test notification actions (Answer/Decline)

### 3. Test Message Notifications
1. Send a chat message when recipient is offline
2. Check push notification is received
3. Test clicking notification to open chat

### 4. Test Different States
- **Foreground**: App is open and active
- **Background**: App is open but not active
- **Closed**: App is completely closed

## 📱 Notification Features

### Video Call Notifications
- **Title**: "📞 Incoming Video Call"
- **Body**: "Dr. Smith is calling you"
- **Actions**: Answer, Decline
- **Auto-open**: Video call screen

### Message Notifications  
- **Title**: "💬 New Message from Dr. Smith"
- **Body**: Preview of message text
- **Actions**: Reply, View
- **Auto-open**: Chat conversation

### Appointment Notifications
- **Title**: "📅 Appointment Reminder" 
- **Body**: "Your appointment with Dr. Smith is in 30 minutes"
- **Actions**: View Details
- **Auto-open**: Appointment details

### System Notifications
- **Title**: Custom title
- **Body**: Custom message
- **Actions**: Open App
- **Auto-open**: Dashboard

## 🔧 Troubleshooting

### Common Issues

1. **FCM Token not generated**
   - Check browser notification permissions
   - Verify service worker registration
   - Check Firebase config

2. **Notifications not received**
   - Verify FCM token is sent to server
   - Check Firebase Admin SDK configuration
   - Verify user is offline for push notifications

3. **Service Worker errors**
   - Check service worker console for errors
   - Verify Firebase config matches client config
   - Clear service worker cache

4. **CORS errors**
   - Ensure Firebase domain is whitelisted
   - Check Firebase project settings

### Debug Tips

```javascript
// Check FCM token
console.log('FCM Token:', localStorage.getItem('fcmToken'));

// Check notification permissions
console.log('Notification permission:', Notification.permission);

// Test notification manually
new Notification('Test', { body: 'Test message' });
```

## 📊 Analytics & Monitoring

Firebase provides built-in analytics for push notifications:

1. **Delivery Reports**: See how many notifications were delivered
2. **Open Rates**: Track notification engagement
3. **Device Analytics**: Monitor device/browser compatibility

Access these in Firebase Console → **Cloud Messaging** → **Reports**

## 🔒 Security Considerations

1. **Keep Service Account Keys Secure**: Never commit to version control
2. **Use Environment Variables**: For production deployments
3. **Token Validation**: Validate FCM tokens before sending notifications
4. **Rate Limiting**: Implement rate limits for notification APIs
5. **User Consent**: Always request notification permissions properly

## 🌟 Advanced Features (Future)

1. **Notification Scheduling**: Schedule appointment reminders
2. **Rich Notifications**: Include images and custom actions
3. **Deep Linking**: Direct users to specific app sections
4. **A/B Testing**: Test different notification formats
5. **Multi-language**: Support notifications in multiple languages

Happy notifying! 🎉