# Mediczy Healthcare Platform - Required APIs & External Services

## 🔗 Complete API Dependencies & Configuration Guide

This document lists all external APIs, services, and credentials needed for the Mediczy healthcare platform to function fully.

---

## 🔥 Firebase Services

### Firebase Cloud Messaging (FCM) - Push Notifications
**Purpose**: Real-time push notifications for video calls, messages, and appointments
**Status**: ⚠️ **CONFIGURED BUT NEEDS CREDENTIALS**

**Required Configuration:**
```bash
# Frontend (.env)
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=mediczy-notifications.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mediczy-notifications
VITE_FIREBASE_STORAGE_BUCKET=mediczy-notifications.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key

# Backend (.env)
FIREBASE_PROJECT_ID=mediczy-notifications
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@mediczy-notifications.iam.gserviceaccount.com
```

**Setup Steps:**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project: "mediczy-notifications"
3. Enable Cloud Messaging
4. Generate service account credentials
5. Generate VAPID keys for web push
6. Configure notification topics and channels

**Current Implementation:**
- ✅ Frontend FCM integration ready
- ✅ Service worker for background notifications
- ✅ Backend push notification system
- ✅ Notification types: video calls, messages, appointments
- ⚠️ Needs Firebase project credentials

---

## 🔍 Google Services

### Google OAuth 2.0 - Authentication
**Purpose**: Social login with Google accounts
**Status**: ⚠️ **CONFIGURED BUT NEEDS CLIENT ID**

**Required Configuration:**
```bash
# Frontend (.env)
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.googleusercontent.com
```

**Setup Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 Client IDs
3. Configure authorized origins: `https://192.168.1.72`
4. Add redirect URIs for authentication flow

**Current Implementation:**
- ✅ Google OAuth Provider integrated
- ✅ Login flow implemented
- ⚠️ Needs Google Client ID

### Google Gemini AI - Medical AI Assistant
**Purpose**: AI-powered medical responses and image analysis
**Status**: ⚠️ **CONFIGURED BUT NEEDS API KEY**

**Required Configuration:**
```bash
# Frontend (.env)
VITE_GEMINI_API_KEY=your-gemini-api-key

# Backend (.env)
GEMINI_API_KEY=your-gemini-api-key
```

**Setup Steps:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API key for Gemini Pro
3. Enable Gemini Pro Vision for image analysis

**Current Implementation:**
- ✅ Gemini Pro for text generation
- ✅ Gemini Pro Vision for medical image analysis  
- ✅ AI doctor consultation features
- ✅ Medical report generation
- ⚠️ Needs Gemini API key

### Google Maps Platform - Location Services
**Purpose**: Find nearby hospitals, pharmacies, and healthcare facilities
**Status**: ⚠️ **CONFIGURED BUT NEEDS API KEY**

**Required Configuration:**
```bash
# Backend (.env)
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

**APIs Needed:**
- Places API (for nearby search)
- Maps JavaScript API
- Geocoding API

**Setup Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Maps Platform APIs
3. Create API key with restrictions
4. Set up billing (required for Maps APIs)

**Current Implementation:**
- ✅ Places API integration for hospital search
- ✅ Emergency services locator
- ✅ Pharmacy finder
- ⚠️ Needs Google Maps API key

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

### WebRTC + STUN/TURN Servers
**Purpose**: Peer-to-peer video calling (replaces Agora)
**Status**: ✅ **FULLY CONFIGURED AND WORKING**

**Current Configuration:**
```bash
# Backend (.env)
TURN_SERVER_URL=stun:stun.l.google.com:19302
```

**Current Implementation:**
- ✅ Native WebRTC implementation
- ✅ Socket.IO signaling server
- ✅ Google STUN servers for NAT traversal
- ✅ Multi-device video calling
- ✅ Audio/video device management
- ✅ Production-ready performance

**Optional TURN Server Setup:**
For better connectivity behind firewalls, consider:
- [Coturn Server](https://github.com/coturn/coturn)
- [AWS/Google Cloud TURN services](https://www.twilio.com/docs/stun-turn)

### ~~Agora Video SDK~~ (REPLACED)
**Status**: ❌ **REMOVED - REPLACED WITH WEBRTC**

Previously configured but replaced with native WebRTC:
- Old: `VITE_AGORA_APP_ID`, `VITE_AGORA_APP_CERTIFICATE`
- New: Native WebRTC with Socket.IO signaling

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

**Last Updated**: November 11, 2025  
**Status**: Core platform ✅ OPERATIONAL | External APIs ⚠️ NEED CREDENTIALS