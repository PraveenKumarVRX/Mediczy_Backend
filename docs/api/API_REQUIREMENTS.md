# Mediczy Healthcare Platform - Required APIs & External Services

## 🔗 Complete API Dependencies & Configuration Guide

This document lists all external APIs, services, and credentials needed for the Mediczy healthcare platform to function fully.

---

## 🔥 Firebase Services

### Firebase Cloud Messaging (FCM) - Push Notifications
**Purpose**: Real-time push notifications for video calls, messages, and appointments
**Status**: ✅ **CONFIGURED AND WORKING**

**Current Configuration:**
```bash
# Frontend (.env.production)
VITE_FIREBASE_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4
VITE_FIREBASE_AUTH_DOMAIN=mediczy-notifications.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mediczy-notifications
VITE_FIREBASE_STORAGE_BUCKET=mediczy-notifications.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=982376166047
VITE_FIREBASE_APP_ID=1:982376166047:web:mediczy-app-id
VITE_FIREBASE_VAPID_KEY=BMR-v0zDJTYcXyF-69jwyk4BPzcPGOArW5VK8WxBLiB99Ult0I7gNkcJiFLTmRTUc8VdbcpwYlL7EMOpG9hCsk4

# Backend (.env)
FIREBASE_PROJECT_ID=mediczy-624ed
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@mediczy-624ed.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Mobile App FCM Registration:**
```javascript
// POST /api/fcm/register-token
{
  "fcmToken": "device-fcm-token",
  "deviceType": "android|ios",
  "deviceInfo": { "model": "iPhone 14", "os": "iOS 17" }
}
```

**Current Implementation:**
- ✅ Frontend FCM integration ready
- ✅ Service worker for background notifications
- ✅ Backend push notification system
- ✅ Notification types: video calls, messages, appointments
- ✅ FCM token registration endpoint

---

## 🔍 Google Services

### Google OAuth 2.0 - Authentication
**Purpose**: Social login with Google accounts
**Status**: ✅ **CONFIGURED AND WORKING**

**Current Configuration:**
```bash
# Frontend (.env.production)
VITE_GOOGLE_CLIENT_ID=982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com

# Backend (.env)
GOOGLE_CLIENT_ID=982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=https://app.mediqzy.com/api/auth/google/callback
```

**Current Implementation:**
- ✅ Google OAuth Provider integrated
- ✅ Patient login flow implemented
- ✅ Doctor login flow implemented
- ✅ Callback URLs configured for mediqzy.com

### Google Gemini AI - Medical AI Assistant
**Purpose**: AI-powered medical responses and image analysis
**Status**: ✅ **CONFIGURED AND WORKING**

**Current Configuration:**
```bash
# Frontend (.env.production)
VITE_GEMINI_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4

# Backend (.env)
GEMINI_API_KEY=AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48
GROQ_API_KEY=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
```

**AI Consultation Endpoints:**
```javascript
// POST /api/medical-ai/orchestrator/consult
{ "query": "I have a headache", "language": "en" }

// POST /api/ai-doctor/consult
{ "symptoms": "headache, fever", "duration": "2 days" }
```

**Current Implementation:**
- ✅ Gemini Pro for text generation
- ✅ Gemini Pro Vision for medical image analysis  
- ✅ AI doctor consultation features
- ✅ Medical report generation
- ✅ Groq API as backup/alternative

### Google Maps Platform - Location Services
**Purpose**: Find nearby hospitals, pharmacies, and healthcare facilities
**Status**: ✅ **CONFIGURED AND WORKING**

**Current Configuration:**
```bash
# Backend (.env)
GOOGLE_MAPS_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4

# Frontend (.env.production)
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4
```

**APIs Enabled:**
- Places API (for nearby search)
- Maps JavaScript API
- Geocoding API

**Current Implementation:**
- ✅ Places API integration for hospital search
- ✅ Emergency services locator
- ✅ Pharmacy finder
- ✅ Location-based doctor search

### Google Fit API - Health Data Integration
**Purpose**: Sync fitness and health data from Google Fit
**Status**: ⚠️ **CONFIGURED BUT NEEDS OAUTH SETUP**

**Required Configuration:**
- Google OAuth scope: `https://www.googleapis.com/auth/fitness.read`
- Fit API enabled in Google Cloud Console

**Current Implementation:**
- ✅ Google Fit dashboard component
- ✅ Fitness data visualization
- ✅ Health metrics tracking
- ⚠️ Needs Google Fit API credentials

### YouTube Data API - Health Education Content
**Purpose**: Display health and wellness educational videos
**Status**: ⚠️ **CONFIGURED BUT NEEDS API KEY**

**Required Configuration:**
```bash
# Frontend (.env)
VITE_YOUTUBE_API_KEY=your-youtube-data-api-key
```

**Setup Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable YouTube Data API v3
3. Create API key

**Current Implementation:**
- ✅ Health education video feed
- ✅ YouTube video player integration
- ✅ Curated health content
- ⚠️ Needs YouTube Data API key

---

## 🎥 Video Calling Services

### MiroTalk SFU - Video Consultations
**Purpose**: WebRTC-based video consultations for doctor-patient calls
**Status**: ✅ **FULLY CONFIGURED AND WORKING**

**Production URL:** `https://video.mediqzy.com`

**Current Configuration:**
```bash
# Frontend (.env.production)
VITE_MIROTALK_URL=https://video.mediqzy.com

# Backend (.env)
MIROTALK_SERVER_URL=http://localhost:3010
MIROTALK_API_KEY=mirotalk_default_key
MIROTALK_API_SECRET=mirotalk_default_secret
```

**Video Join URL Format:**
```
https://video.mediqzy.com/join/{roomId}?name={userName}&audio=1&video=1&notify=0
```

**Current Implementation:**
- ✅ MiroTalk SFU server running at video.mediqzy.com
- ✅ WebRTC with mediasoup for scalable video
- ✅ Socket.IO signaling server
- ✅ Multi-device video calling
- ✅ Audio/video device management
- ✅ Screen sharing support
- ✅ Chat during video calls
- ✅ Mobile browser compatible
- ✅ Production-ready performance

**Mobile App Integration:**
```javascript
// React Native - Open in WebView
import { WebView } from 'react-native-webview';

const VideoCallScreen = ({ meetingUrl }) => (
  <WebView
    source={{ uri: meetingUrl }}
    mediaPlaybackRequiresUserAction={false}
    allowsInlineMediaPlayback={true}
    javaScriptEnabled={true}
  />
);
```

### ~~Agora Video SDK~~ (REPLACED)
**Status**: ❌ **REMOVED - REPLACED WITH MIROTALK SFU**

Previously configured but replaced with MiroTalk:
- Old: `VITE_AGORA_APP_ID`, `VITE_AGORA_APP_CERTIFICATE`
- New: MiroTalk SFU at video.mediqzy.com

---

## 🗄️ Database & Storage

### MongoDB Atlas (Optional Cloud Database)
**Purpose**: Cloud database alternative to local MongoDB
**Status**: 🔧 **OPTIONAL - CURRENTLY USING LOCAL MONGODB**

**Configuration if using Atlas:**
```bash
# Backend (.env)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mediczy
```

### Redis Cloud (Optional Cloud Cache)
**Purpose**: Cloud Redis alternative to local Redis
**Status**: 🔧 **OPTIONAL - CURRENTLY USING LOCAL REDIS**

**Configuration if using Redis Cloud:**
```bash
# Backend (.env)
REDIS_URL=redis://username:password@redis-cloud-endpoint:port
```

---

## 📧 Email Services

### SMTP Email Service
**Purpose**: Send email notifications, password resets, appointment reminders
**Status**: ⚠️ **CONFIGURED BUT NEEDS SMTP CREDENTIALS**

**Required Configuration:**
```bash
# Backend (.env)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@mediczy.com
```

**Recommended Providers:**
- **Gmail SMTP** (for development)
- **SendGrid** (for production)
- **AWS SES** (for high volume)
- **Mailgun** (for transactional emails)

---

## 📱 Offline & PWA Features

### Service Workers
**Status**: ✅ **FULLY IMPLEMENTED**
- ✅ Offline data caching
- ✅ Background sync
- ✅ Push notification handling
- ✅ API request caching

### IndexedDB
**Status**: ✅ **FULLY IMPLEMENTED**  
- ✅ Offline health data storage
- ✅ Sync when online
- ✅ Emergency data backup

---

## 🔐 Security & Compliance

### SSL/TLS Certificates
**Status**: ✅ **CONFIGURED WITH SELF-SIGNED CERTS**

**Current Setup:**
- ✅ Self-signed certificates for development
- ✅ HTTPS redirection
- ✅ Security headers

**Production Recommendation:**
```bash
# Use Let's Encrypt for production
certbot --nginx -d yourdomain.com
```

### Rate Limiting
**Status**: ✅ **FULLY CONFIGURED**
- ✅ API rate limiting
- ✅ Authentication rate limiting
- ✅ DDoS protection

---

## 📊 Monitoring & Analytics (Optional)

### Application Monitoring
**Recommended Services:**
- **Sentry** (error tracking)
- **Google Analytics** (usage analytics)
- **Prometheus + Grafana** (system metrics)
- **DataDog** (full-stack monitoring)

**Current Setup:**
- ✅ Basic health checks
- ✅ Container monitoring
- ✅ Error handling
- 🔧 Advanced monitoring available

---

## 🚀 Required Environment Variables Summary

### Frontend (.env)
```bash
# Google Services
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
VITE_GEMINI_API_KEY=your-gemini-api-key  
VITE_YOUTUBE_API_KEY=your-youtube-api-key

# Firebase
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=mediczy-notifications.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mediczy-notifications
VITE_FIREBASE_STORAGE_BUCKET=mediczy-notifications.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key

# API Endpoints
VITE_API_URL=https://192.168.1.72
VITE_SOCKET_URL=https://192.168.1.72
```

### Backend (.env)
```bash
# Google Services
GEMINI_API_KEY=your-gemini-api-key
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# Firebase Admin
FIREBASE_PROJECT_ID=mediczy-notifications
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@mediczy-notifications.iam.gserviceaccount.com

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@mediczy.com

# Database & Cache (already configured)
MONGODB_URI=mongodb://mediczy_app:MediczY2024!SecurePass@mongo:27017/mediczy
REDIS_URL=redis://:RedisSecure2024!@redis:6379

# Security (already configured)
SESSION_SECRET=MediczYS3ss10nK3yV3ryS3cur3AndL0ng2024!
JWT_SECRET=MediczYJWTK3yS3cur3AndStr0ng2024!
```

---

## ✅ Priority Setup Order

### 1. Essential for Core Functionality
1. **Google OAuth** - User authentication
2. **Firebase FCM** - Push notifications  
3. **SMTP Email** - User communications

### 2. Important for Full Features  
4. **Google Gemini AI** - AI medical assistant
5. **Google Maps** - Location services
6. **YouTube API** - Health education content

### 3. Optional Enhancements
7. **Google Fit API** - Fitness integration
8. **Monitoring Services** - Production monitoring
9. **Cloud Databases** - Scalability

---

## 🔧 Setup Commands

### Update Frontend Environment
```bash
# Copy and edit frontend environment
cp /root/Mediczy/client/.env.example /root/Mediczy/client/.env
nano /root/Mediczy/client/.env
```

### Update Backend Environment  
```bash
# Edit backend environment
nano /root/Mediczy/.env
```

### Rebuild with New APIs
```bash
cd /root/Mediczy
docker-compose build
docker-compose up -d
```

---

## 📞 Support & Documentation

- **Firebase Setup**: https://firebase.google.com/docs/cloud-messaging
- **Google Cloud APIs**: https://console.cloud.google.com/apis
- **OAuth 2.0 Setup**: https://developers.google.com/identity/protocols/oauth2
- **WebRTC Documentation**: https://webrtc.org/getting-started/

---

**Last Updated**: January 20, 2026  
**Status**: Core platform ✅ OPERATIONAL | Video Calls ✅ LIVE at video.mediqzy.com | External APIs ✅ CONFIGURED