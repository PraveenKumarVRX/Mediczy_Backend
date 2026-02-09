# 📱 SmartHealth Mobile App Integration - Executive Summary

**Date:** February 8, 2026  
**Status:** ✅ Production Ready  
**Version:** 1.0.0

---

## 🎯 Quick Overview

SmartHealth mobile app is fully integrated with Mediczy backend. This document consolidates all integration documentation for your mobile development team.

### What's Ready to Use
- ✅ Complete REST API endpoints
- ✅ React Native implementation examples
- ✅ Authentication system (JWT)
- ✅ Apple Health & Google Fit sync
- ✅ Multi-tenant clinic support
- ✅ Real-time health data tracking
- ✅ Payment & appointment systems
- ✅ Push notifications (FCM)
- ✅ Video consultation (LiveKit)
- ✅ Emergency services

---

## 📊 Key Integration Points

### 1. User Authentication (Email & Password)
**Endpoint:** `POST /api/users/login`  
**Auth Base URL:** `https://app.mediqzy.com/api`

```javascript
// Email/Password Login
const login = async (email, password, clinicSlug) => {
  const response = await fetch(`${AUTH_BASE}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      clinic_slug: clinicSlug
    })
  });
  const data = await response.json();
  if (data.success) {
    // Store JWT token securely
    await SecureStore.setItemAsync('jwt_token', data.data.token);
    await SecureStore.setItemAsync('user_id', data.data.user.id);
  }
  return data;
};
```

**Token Storage:** Use `expo-secure-store` (iOS Keychain, Android Keystore)

### 2. OTP-Based Login (Phone & OTP) ⭐ **RECOMMENDED**
**Step 1: Send OTP**  
**Endpoint:** `POST /api/auth/send-otp`

```javascript
const sendOTP = async (phoneNumber) => {
  const response = await fetch(`${AUTH_BASE}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone_number: phoneNumber,  // Format: +91XXXXXXXXXX for India
      country_code: 'IN'           // ISO country code
    })
  });
  const data = await response.json();
  if (data.success) {
    console.log('✅ OTP sent successfully');
    return data.data.otp_session_id;  // Save for next step
  }
  return null;
};
```

**Step 2: Verify OTP**  
**Endpoint:** `POST /api/auth/verify-otp`

```javascript
const verifyOTP = async (otpSessionId, otpCode) => {
  const response = await fetch(`${AUTH_BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      otp_session_id: otpSessionId,
      otp_code: otpCode                // 6-digit code sent via SMS
    })
  });
  const data = await response.json();
  if (data.success) {
    // Store tokens
    await SecureStore.setItemAsync('jwt_token', data.data.token);
    await SecureStore.setItemAsync('user_id', data.data.user.id);
    console.log('✅ OTP verified and logged in');
    return data.data;
  } else {
    throw new Error(data.message || 'OTP verification failed');
  }
};
```

### 3. Doctor Authentication
**Endpoint:** `POST /api/doctors/login`

```javascript
const doctorLogin = async (email, password) => {
  const response = await fetch(`${AUTH_BASE}/api/doctors/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (data.success) {
    await SecureStore.setItemAsync('doctorToken', data.token);
    await SecureStore.setItemAsync('doctor_id', data.data.doctor.id);
  }
  return data;
};
```

### 4. Health Data Sync

#### Apple Health (iOS)
```javascript
import AppleHealthKit from 'react-native-health';

const syncAppleHealth = async () => {
  const permissions = {
    permissions: {
      read: ['Height', 'Weight', 'StepCount', 'HeartRate'],
      write: []
    }
  };

  AppleHealthKit.initHealthKit(permissions, async (err) => {
    if (!err) {
      // Fetch data
      const options = { startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      
      AppleHealthKit.getStepCount(options, async (err, results) => {
        if (!err) {
          // Sync to backend
          await fetch(`${API_BASE}/api/apple-health/sync`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              dataType: 'steps',
              value: results.value,
              date: new Date().toISOString()
            })
          });
        }
      });
    }
  });
};
```

#### Google Fit (Android)
```javascript
import GoogleFit from 'react-native-google-fit';

const syncGoogleFit = async () => {
  const options = {
    scopes: [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'https://www.googleapis.com/auth/fitness.body.read'
    ]
  };

  GoogleFit.authorize(options)
    .then(async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      GoogleFit.getDailyStepCountSamples({ startDate, endDate })
        .then(async (steps) => {
          await fetch(`${API_BASE}/api/fitness-data/store`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              steps: steps[0]?.steps,
              date: new Date().toISOString()
            })
          });
        });
    });
};
```

### 5. Appointments
**Endpoint:** `POST /api/appointments`

```javascript
const bookAppointment = async (appointmentData) => {
  const response = await fetch(`${API_BASE}/api/appointments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      doctor_id: appointmentData.doctorId,
      appointment_date: appointmentData.date,
      appointment_time: appointmentData.time,
      consultation_type: appointmentData.type,
      symptoms: appointmentData.symptoms
    })
  });
  return response.json();
};
```

### 6. Get Doctors List
**Endpoint:** `GET /api/doctors?clinic_slug=xxx`

```javascript
const getDoctors = async (clinicSlug, filters = {}) => {
  const params = new URLSearchParams({
    clinic_slug: clinicSlug,
    ...filters
  });
  
  const response = await fetch(`${API_BASE}/api/doctors?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

### 7. Prescriptions
**Endpoint:** `GET /api/prescriptions/patient`

```javascript
const getPrescriptions = async () => {
  const response = await fetch(`${API_BASE}/api/prescriptions/patient`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

### 8. Push Notifications (FCM)
**Endpoint:** `POST /api/notifications/register-device`

```javascript
import messaging from '@react-native-firebase/messaging';

const registerFCMToken = async () => {
  const token = await messaging().getToken();
  
  await fetch(`${API_BASE}/api/notifications/register-device`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_token: token,
      device_type: Platform.OS,
      device_name: await getDeviceName()
    })
  });

  // Listen for messages
  messaging().onMessage(async (remoteMessage) => {
    console.log('Notification received:', remoteMessage);
  });
};
```

---

## 🏗️ Recommended App Structure

```
smarthealth-mobile/
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.js
│   │   │   ├── SignupScreen.js
│   │   │   └── SelectClinicScreen.js
│   │   ├── patient/
│   │   │   ├── HomeScreen.js
│   │   │   ├── DoctorListScreen.js
│   │   │   ├── BookAppointmentScreen.js
│   │   │   ├── MyAppointmentsScreen.js
│   │   │   ├── PrescriptionsScreen.js
│   │   │   ├── HealthDataScreen.js
│   │   │   └── ProfileScreen.js
│   │   ├── doctor/
│   │   │   ├── DoctorHomeScreen.js
│   │   │   ├── AppointmentsScreen.js
│   │   │   ├── PatientsScreen.js
│   │   │   └── VideoConsultationScreen.js
│   ├── components/
│   │   ├── AppointmentCard.js
│   │   ├── DoctorCard.js
│   │   ├── HealthMetrics.js
│   │   └── LoadingSpinner.js
│   ├── services/
│   │   ├── api.js (API client)
│   │   ├── auth.js (Auth service)
│   │   ├── appointments.js
│   │   ├── healthData.js
│   │   ├── notifications.js
│   │   └── storage.js (Secure token storage)
│   ├── contexts/
│   │   ├── AuthContext.js
│   │   ├── ClinicContext.js
│   │   └── UserContext.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useAppointments.js
│   │   └── useHealthData.js
│   ├── utils/
│   │   ├── constants.js
│   │   ├── validators.js
│   │   └── formatters.js
│   └── App.js (Main entry point)
├── android/
│── ios/
├── package.json
└── app.json
```

---

## 📦 Required Dependencies

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.72.0",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/bottom-tabs": "^6.5.0",
    "@react-navigation/stack": "^6.3.0",
    "expo-secure-store": "^13.0.0",
    "@react-native-async-storage/async-storage": "^1.19.0",
    "axios": "^1.6.0",
    "react-native-health": "^8.4.0",
    "react-native-google-fit": "^0.15.0",
    "@react-native-firebase/messaging": "^18.0.0",
    "@react-native-firebase/app": "^18.0.0",
    "react-native-svg": "^13.10.0",
    "react-native-vector-icons": "^10.0.0",
    "date-fns": "^2.30.0"
  }
}
```

---

## 🔐 Environment Configuration

Create `.env` file:

```bash
# Auth Configuration (IMPORTANT: Use app.mediqzy.com for auth endpoints)  
AUTH_BASE_URL=https://app.mediqzy.com/api
AUTH_TIMEOUT=30000

# API Configuration (Use app.mediqzy.com for API calls)
API_BASE_URL=https://app.mediqzy.com/api
API_TIMEOUT=30000

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_PROJECT_ID=mediczy-notifications

# Firebase Messaging (FCM) Configuration
FCM_ENABLED=true
FCM_PUBLIC_VAPID_KEY=your_vapid_key

# Apple Health Configuration (iOS)
APPLE_HEALTH_ENABLED=true

# Google Fit Configuration (Android)
GOOGLE_FIT_ENABLED=true

# Clinic Configuration
DEFAULT_CLINIC_SLUG=default

# LiveKit Configuration (for Video Calls)
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

---

## ✅ Complete API Endpoints Reference

### Authentication Endpoints
| Method | Endpoint | Purpose | Auth Base URL |
|--------|----------|---------|----------------|
| POST | `/api/patient/signup` | User registration | app.mediqzy.com/api |
| POST | `/api/users/login` | Patient email/password login | app.mediqzy.com/api |
| POST | `/api/auth/send-otp` | Send OTP to phone | app.mediqzy.com/api |
| POST | `/api/auth/verify-otp` | Verify OTP and login | app.mediqzy.com/api |
| POST | `/api/doctors/login` | Doctor login | app.mediqzy.com/api |
| GET | `/api/users/profile` | Get user profile | app.mediqzy.com/api |
| PUT | `/api/users/profile` | Update profile | app.mediqzy.com/api |
| POST | `/api/users/logout` | Logout | app.mediqzy.com/api |
|--------|----------|---------|
| GET | `/api/doctors` | List all doctors |
| GET | `/api/doctors/:id` | Get doctor details |
| POST | `/api/appointments` | Book appointment |
| GET | `/api/appointments` | Get user appointments |
| PUT | `/api/appointments/:id` | Update appointment |
| DELETE | `/api/appointments/:id` | Cancel appointment |

### Health Data Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/apple-health/sync` | Sync Apple Health data |
| POST | `/api/fitness-data/store` | Store fitness data |
| GET | `/api/fitness-data/summary?days=7` | Get fitness summary |
| GET | `/api/health/latest` | Get health metrics |

### Prescription Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/prescriptions/patient` | Get user prescriptions |
| GET | `/api/prescriptions/:id` | Get prescription details |
| POST | `/api/prescriptions/:id/refill` | Request refill |

### Video Consultation
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/consultations/start` | Start consultation |
| GET | `/api/consultations/token` | Get LiveKit token |
| POST | `/api/consultations/end` | End consultation |
| GET | `/api/consultations/:id` | Get consultation details |
| POST | `/api/consultations/:id/recording` | Start/stop recording |
| GET | `/api/consultations/:id/recording` | Get recording status |
| GET | `/api/notifications` | Get notification history |

---

## 🔐 API Credentials Setup (SmartHealth Security)

**IMPORTANT:** Your SmartHealth mobile app uses a dual-layer security model with separate API credentials.

### How It Works

```
Layer 1: API Credentials (Generated by Super Admin)
  ├─ client_id (unique identifier)
  ├─ client_secret (secure password)
  └─ Stored in: iOS Keychain / Android Keystore

Layer 2: User Credentials (User's Account)
  ├─ email
  ├─ password
  └─ JWT token (session management)

Every API request includes both layers for maximum security
```

### Getting Your API Credentials

**Step 1: Super Admin generates credentials**
```bash
curl -X POST https://api.mediqzy.com/api/admin/api-credentials/generate \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SmartHealth Mobile App",
    "description": "React Native iOS/Android app",
    "integration_type": "mobile_app",
    "rotation_days": 90
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "credential_id": "cred_uuid_123456",
    "client_id": "smarthealth_mobile_prod_789",
    "client_secret": "sk_live_abcdefghijklmnopqrstuvwxyz123456",
    "created_at": "2026-02-08T16:00:00Z",
    "rotation_days": 90,
    "expires_at": "2026-05-09T16:00:00Z"
  }
}
```

**Step 2: Store securely in mobile app**
```javascript
import * as SecureStore from 'expo-secure-store';

const storeAPICredentials = async (clientId, clientSecret) => {
  try {
    await SecureStore.setItemAsync('api_client_id', clientId);
    await SecureStore.setItemAsync('api_client_secret', clientSecret);
    console.log('✅ API credentials stored securely');
  } catch (error) {
    console.error('❌ Failed to store credentials:', error);
  }
};

// Usage
await storeAPICredentials(
  'smarthealth_mobile_prod_789',
  'sk_live_abcdefghijklmnopqrstuvwxyz123456'
);
```

**Step 3: Use in API requests with Basic Auth**
```javascript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Separate clients for auth vs API endpoints
const authClient = axios.create({
  baseURL: process.env.REACT_APP_AUTH_BASE_URL || 'https://app.mediqzy.com/api',
  timeout: 30000,
});

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'https://api.mediqzy.com',
  timeout: 30000,
});

// Intercept all requests to add credentials
apiClient.interceptors.request.use(async (config) => {
  try {
    const clientId = await SecureStore.getItemAsync('api_client_id');
    const clientSecret = await SecureStore.getItemAsync('api_client_secret');
    
    if (clientId && clientSecret) {
      // Create Basic Auth header: base64(clientId:clientSecret)
      const credentials = `${clientId}:${clientSecret}`;
      const base64Credentials = Buffer.from(credentials).toString('base64');
      config.headers.Authorization = `Basic ${base64Credentials}`;
    }
    
    // Add JWT token for user authentication
    const jwtToken = await SecureStore.getItemAsync('jwt_token');
    if (jwtToken) {
      config.headers['X-User-Token'] = jwtToken;
    }
  } catch (error) {
    console.error('Error adding credentials to request:', error);
  }
  
  return config;
});

export default apiClient;
```

### Full Credential Management Workflows

#### Workflow 1: Login with API Credentials
```javascript
const loginWithAPICredentials = async (email, password, clinicSlug) => {
  try {
    const clientId = await SecureStore.getItemAsync('api_client_id');
    const clientSecret = await SecureStore.getItemAsync('api_client_secret');
    
    if (!clientId || !clientSecret) {
      throw new Error('API credentials not found. Contact Super Admin.');
    }
    
    const credentials = `${clientId}:${clientSecret}`;
    const base64Credentials = Buffer.from(credentials).toString('base64');
    
    const response = await fetch('https://api.mediqzy.com/api/mobile/auth/api-credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        clinic_slug: clinicSlug,
        device_id: await getDeviceId(),
        push_token: await getPushToken(),
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store JWT token
      await SecureStore.setItemAsync('jwt_token', data.data.token);
      await SecureStore.setItemAsync('user_id', data.data.user.id);
      return data;
    } else {
      throw new Error(data.message || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};
```

#### Workflow 2: Rotate Credentials (Admin Only)
```bash
# Super Admin rotates credentials without affecting users
curl -X POST https://api.mediqzy.com/api/admin/api-credentials/cred_uuid_123/rotate \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "grace_period_hours": 24,
    "new_rotation_days": 90
  }'

# Response includes:
# - old_client_id (still works for 24 hours)
# - new_client_id (ready to use immediately)
# - new_client_secret (secure password)
# - grace_period_until (24 hours from now)
```

#### Workflow 3: Emergency Revoke (Instant)
```bash
# If compromised, Super Admin can revoke instantly
curl -X POST https://api.mediqzy.com/api/admin/api-credentials/cred_uuid_123/revoke \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Potential compromise detected",
    "replace_with_new": true
  }'

# All requests using old credentials fail immediately
# New credentials provided for app to use
```

### Complete Reference

For exhaustive API Credentials documentation, see:
- **SMARTHEALTH_RN_API_CREDENTIALS_IMPLEMENTATION.md** - Complete implementation (576 lines)
- **SMARTHEALTH_RN_SUPER_ADMIN_QUICK_REFERENCE.md** - Admin management guide
- **API_CREDENTIALS_QUICK_REFERENCE.md** - One-page summary
- **SMARTHEALTH_RN_API_CREDENTIALS_DEPLOYMENT_GUIDE.md** - Deployment procedures

---

## 🎥 Exhaustive Video Consultation Integration

### Architecture & Flow

```
┌────────────────────────────────────────────────────────────┐
│                  VIDEO CONSULTATION FLOW                    │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User/Doctor initiates call → Request starts on backend │
│  2. Backend creates LiveKit room & generates token         │
│  3. Mobile app gets token via `/api/consultations/token`   │
│  4. App connects to LiveKit server (wss://livekit-url)    │
│  5. Real-time video/audio streams                          │
│  6. Optional: Recording starts on backend                  │
│  7. Either party ends call                                 │
│  8. Recording finalized & available for download           │
│  9. Charges applied & notification sent                    │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

### Complete Setup Instructions

#### Step 1: Install LiveKit Dependencies
```bash
npm install livekit-client @livekit/react-native @livekit/components-react
npm install react-native-webrtc  # For WebRTC support on React Native
```

#### Step 2: Create VideoConsultation Service
```javascript
// services/videoConsultation.js
import { Room, Participant, Track } from 'livekit-client';
import * as SecureStore from 'expo-secure-store';

export class VideoConsultationService {
  constructor(apiBaseUrl = 'https://api.mediqzy.com') {
    this.apiBase = apiBaseUrl;
    this.room = null;
    this.listeners = {};
  }

  // Event management
  on(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  off(event, handler) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(handler => handler(data));
    }
  }

  // Get LiveKit token from backend
  async getConsultationToken(appointmentId, consultationType = 'video') {
    try {
      const jwtToken = await SecureStore.getItemAsync('jwt_token');
      
      const response = await fetch(`${this.apiBase}/api/consultations/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appointment_id: appointmentId,
          consultation_type: consultationType,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to get token');
      }

      return {
        token: data.data.token,
        liveKitUrl: data.data.livekit_url,
        roomName: data.data.room_name,
        participantName: data.data.participant_name,
        consultationId: data.data.consultation_id,
      };
    } catch (error) {
      this.emit('error', {
        type: 'TOKEN_ERROR',
        message: error.message,
        error,
      });
      throw error;
    }
  }

  // Connect to video room with error handling & auto-reconnect
  async connectToRoom(token, liveKitUrl, roomName, options = {}) {
    const defaultOptions = {
      audio: true,
      video: { width: 640, height: 480 },
      maxRetries: 3,
      retryDelay: 2000,
      autoSubscribe: true,
      ...options,
    };

    let retries = 0;
    const maxRetries = defaultOptions.maxRetries;

    while (retries < maxRetries) {
      try {
        this.room = new Room({
          audio: defaultOptions.audio,
          video: defaultOptions.video,
          autoSubscribe: defaultOptions.autoSubscribe,
        });

        // Setup room event listeners
        this.setupRoomListeners();

        // Connect to LiveKit server
        await this.room.connect(liveKitUrl, token, {
          reconnectFallbackUrls: [],
          maxRetries: 3,
        });

        this.emit('connected', {
          roomName,
          participantCount: this.room.numParticipants,
          localParticipant: this.room.localParticipant,
        });

        return this.room;
      } catch (error) {
        retries++;
        console.error(`Connection attempt ${retries}/${maxRetries} failed:`, error);

        if (retries < maxRetries) {
          this.emit('reconnecting', {
            attempt: retries,
            maxRetries,
            nextRetryIn: defaultOptions.retryDelay / 1000,
          });

          // Wait before retrying
          await new Promise(resolve => 
            setTimeout(resolve, defaultOptions.retryDelay * Math.pow(2, retries - 1))
          );
        } else {
          this.emit('error', {
            type: 'CONNECTION_FAILED',
            message: `Failed to connect after ${maxRetries} attempts`,
            error,
          });
          throw new Error(`Connection failed after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
  }

  // Setup room event listeners
  setupRoomListeners() {
    if (!this.room) return;

    // Participant events
    this.room.on('participantConnected', (participant) => {
      console.log(`👤 ${participant.name} joined`);
      this.emit('participantConnected', participant);
    });

    this.room.on('participantDisconnected', (participant) => {
      console.log(`👤 ${participant.name} left`);
      this.emit('participantDisconnected', participant);
    });

    // Track events
    this.room.on('trackSubscribed', (track, publication, participant) => {
      console.log(`📹 Track subscribed from ${participant.name}:`, track.kind);
      this.emit('trackSubscribed', { track, publication, participant });
    });

    this.room.on('trackUnsubscribed', (track, publication) => {
      console.log(`📹 Track unsubscribed:`, track.kind);
      this.emit('trackUnsubscribed', { track, publication });
    });

    // Connection events
    this.room.on('disconnected', () => {
      console.log('❌ Disconnected from room');
      this.emit('disconnected', { reason: 'user' });
    });

    this.room.on('connectionQualityChanged', (quality, participant) => {
      console.log(`📊 Connection quality for ${participant.name}:`, quality);
      this.emit('qualityChanged', { quality, participant });
    });

    // Room events
    this.room.on('activeParticipantsChanged', (participants) => {
      console.log(`🎤 Active speakers:`, participants.length);
      this.emit('activeSpeakersChanged', participants);
    });
  }

  // Enable/Disable audio
  async toggleAudio(enabled) {
    try {
      if (!this.room?.localParticipant) {
        throw new Error('Not connected to room');
      }

      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.emit('audioToggled', { enabled });
      console.log(`🔊 Audio ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this.emit('error', {
        type: 'AUDIO_ERROR',
        message: error.message,
        error,
      });
      throw error;
    }
  }

  // Enable/Disable video
  async toggleVideo(enabled) {
    try {
      if (!this.room?.localParticipant) {
        throw new Error('Not connected to room');
      }

      await this.room.localParticipant.setCameraEnabled(enabled);
      this.emit('videoToggled', { enabled });
      console.log(`📹 Video ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this.emit('error', {
        type: 'VIDEO_ERROR',
        message: error.message,
        error,
      });
      throw error;
    }
  }

  // Switch camera (front/back)
  async switchCamera() {
    try {
      const videoTrack = this.room?.localParticipant.videoTrackPublications[0]?.track;
      if (!videoTrack) {
        throw new Error('No video track found');
      }

      // Get current device ID
      const constraints = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = constraints.filter(d => d.kind === 'videoinput');
      
      if (videoDevices.length > 1) {
        // Switch to next camera
        const currentDeviceId = videoTrack.getSettings().deviceId;
        const nextCamera = videoDevices.find(d => d.deviceId !== currentDeviceId);
        
        if (nextCamera) {
          await this.room.localParticipant.setCameraEnabled(false);
          await this.room.localParticipant.setCameraEnabled(true);
          this.emit('cameraSwitched', { camera: nextCamera });
        }
      }
    } catch (error) {
      console.warn('Camera switch not available:', error.message);
    }
  }

  // Start recording (server-side)
  async startRecording(consultationId) {
    try {
      const jwtToken = await SecureStore.getItemAsync('jwt_token');

      const response = await fetch(
        `${this.apiBase}/api/consultations/${consultationId}/recording`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'start' })
        }
      );

      const data = await response.json();

      if (data.success) {
        this.emit('recordingStarted', {
          recordingId: data.data.recording_id,
          startedAt: data.data.started_at,
        });
        console.log('✅ Recording started');
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to start recording');
      }
    } catch (error) {
      this.emit('error', {
        type: 'RECORDING_ERROR',
        message: error.message,
        error,
      });
      throw error;
    }
  }

  // Stop recording (server-side)
  async stopRecording(consultationId) {
    try {
      const jwtToken = await SecureStore.getItemAsync('jwt_token');

      const response = await fetch(
        `${this.apiBase}/api/consultations/${consultationId}/recording`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'stop' })
        }
      );

      const data = await response.json();

      if (data.success) {
        this.emit('recordingStopped', {
          recordingId: data.data.recording_id,
          duration: data.data.duration,
          fileUrl: data.data.file_url,
        });
        console.log('✅ Recording stopped');
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to stop recording');
      }
    } catch (error) {
      this.emit('error', {
        type: 'RECORDING_ERROR',
        message: error.message,
        error,
      });
      throw error;
    }
  }

  // Get room statistics
  getRoomStats() {
    if (!this.room) return null;

    return {
      roomName: this.room.name,
      participantCount: this.room.numParticipants,
      localParticipant: this.room.localParticipant?.name,
      isConnected: this.room.isConnected,
      audioEnabled: this.room.localParticipant?.isMicrophoneEnabled,
      videoEnabled: this.room.localParticipant?.isCameraEnabled,
      participants: Array.from(this.room.remoteParticipants.values()).map(p => ({
        name: p.name,
        audioEnabled: p.audioTrackPublications.length > 0,
        videoEnabled: p.videoTrackPublications.length > 0,
      })),
    };
  }

  // Graceful disconnect
  async disconnect() {
    try {
      if (this.room) {
        await this.room.disconnect();
        this.room = null;
        console.log('✅ Disconnected from room');
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      throw error;
    }
  }

  // End consultation (notify backend)
  async endConsultation(consultationId, feedback = null) {
    try {
      const jwtToken = await SecureStore.getItemAsync('jwt_token');

      const response = await fetch(
        `${this.apiBase}/api/consultations/${consultationId}/end`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ended_by: 'user',
            feedback,
            ended_at: new Date().toISOString(),
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        this.emit('consultationEnded', {
          consultationId,
          duration: data.data.duration,
          charges: data.data.charges,
        });
        
        // Disconnect from room
        await this.disconnect();
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to end consultation');
      }
    } catch (error) {
      this.emit('error', {
        type: 'END_CONSULTATION_ERROR',
        message: error.message,
        error,
      });
      throw error;
    }
  }
}

export default new VideoConsultationService();
```

#### Step 3: Use in React Native Component
```javascript
// screens/VideoConsultationScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { LiveKitRoom, VideoConference } from '@livekit/react-native';
import VideoConsultationService from '../services/videoConsultation';

export default function VideoConsultationScreen({ route, navigation }) {
  const { appointmentId } = route.params;
  const [connectionState, setConnectionState] = useState('idle'); // idle, connecting, connected, error
  const [token, setToken] = useState(null);
  const [liveKitUrl, setLiveKitUrl] = useState(null);
  const [roomName, setRoomName] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [error, setError] = useState(null);
  const serviceRef = useRef(VideoConsultationService);

  useEffect(() => {
    // Setup event listeners
    serviceRef.current.on('connected', handleConnected);
    serviceRef.current.on('disconnected', handleDisconnected);
    serviceRef.current.on('error', handleError);
    serviceRef.current.on('reconnecting', handleReconnecting);
    serviceRef.current.on('recordingStarted', handleRecordingStarted);
    serviceRef.current.on('recordingStopped', handleRecordingStopped);

    // Get token and connect
    initializeConsultation();

    return () => {
      // Cleanup
      serviceRef.current.disconnect();
    };
  }, [appointmentId]);

  const initializeConsultation = async () => {
    try {
      setConnectionState('connecting');
      const tokenData = await serviceRef.current.getConsultationToken(appointmentId);
      setToken(tokenData.token);
      setLiveKitUrl(tokenData.liveKitUrl);
      setRoomName(tokenData.roomName);
    } catch (err) {
      handleError({ message: err.message });
    }
  };

  const handleConnected = (data) => {
    setConnectionState('connected');
    console.log('✅ Connected to consultation');
  };

  const handleDisconnected = () => {
    setConnectionState('disconnected');
    Alert.alert('Consultation Ended', 'The call has been disconnected.', [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  };

  const handleError = (data) => {
    setConnectionState('error');
    setError(data.message);
    console.error('❌ Error:', data);
    Alert.alert('Error', data.message);
  };

  const handleReconnecting = (data) => {
    console.log(`🔄 Reconnecting... (attempt ${data.attempt}/${data.maxRetries})`);
  };

  const handleRecordingStarted = () => {
    setRecordingEnabled(true);
    console.log('🔴 Recording started');
  };

  const handleRecordingStopped = () => {
    setRecordingEnabled(false);
    console.log('⏹️ Recording stopped');
  };

  const toggleAudio = async () => {
    try {
      await serviceRef.current.toggleAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    } catch (err) {
      Alert.alert('Error', 'Failed to toggle audio');
    }
  };

  const toggleVideo = async () => {
    try {
      await serviceRef.current.toggleVideo(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    } catch (err) {
      Alert.alert('Error', 'Failed to toggle video');
    }
  };

  const toggleRecording = async () => {
    try {
      if (recordingEnabled) {
        await serviceRef.current.stopRecording(appointmentId);
      } else {
        await serviceRef.current.startRecording(appointmentId);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to toggle recording');
    }
  };

  const endConsultation = async () => {
    Alert.alert('End Consultation', 'Are you sure you want to end this call?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'End Call',
        style: 'destructive',
        onPress: async () => {
          try {
            await serviceRef.current.endConsultation(appointmentId, {
              rating: 5,
              comments: '',
            });
          } catch (err) {
            Alert.alert('Error', 'Failed to end consultation');
          }
        },
      },
    ]);
  };

  if (connectionState === 'connecting') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text>Connecting to consultation...</Text>
      </View>
    );
  }

  if (connectionState === 'error' || !token) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red', marginBottom: 20 }}>Connection Error</Text>
        <Text>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <LiveKitRoom
        url={liveKitUrl}
        token={token}
        connect={true}
        audio={audioEnabled}
        video={videoEnabled}
      >
        <VideoConference />
      </LiveKitRoom>

      {/* Controls */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 20 }}>
        <TouchableOpacity onPress={toggleAudio}>
          <Text style={{ color: audioEnabled ? 'green' : 'red' }}>
            🔊 Audio
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleVideo}>
          <Text style={{ color: videoEnabled ? 'green' : 'red' }}>
            📹 Video
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleRecording}>
          <Text style={{ color: recordingEnabled ? 'red' : 'gray' }}>
            {recordingEnabled ? '🔴 Recording' : '⭕ Record'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={endConsultation}
          style={{
            backgroundColor: 'red',
            padding: 10,
            borderRadius: 5,
          }}
        >
          <Text style={{ color: 'white' }}>📞 End Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

### Error Handling Guide

| Error | Cause | Solution |
|-------|-------|----------|
| `TOKEN_ERROR` | Failed to get token from backend | Check JWT token, internet connection, verify appointment ID |
| `CONNECTION_FAILED` | Can't connect to LiveKit after retries | Check LiveKit URL, verify network, check firewall rules |
| `AUDIO_ERROR` | Microphone permission denied | Request audio permission in app settings |
| `VIDEO_ERROR` | Camera permission denied | Request camera permission in app settings |
| `RECORDING_ERROR` | Failed to start/stop recording | Verify consultation is active, check backend logs |
| `END_CONSULTATION_ERROR` | Failed to end call on backend | Check internet, verify consultation exists |

### Network Resilience

```javascript
// Auto-reconnect on network change
import { useNetInfo } from '@react-native-community/netinfo';

useEffect(() => {
  const unsubscribe = netInfo.addEventListener(state => {
    if (!state.isConnected) {
      console.warn('📶 Network disconnected');
      // Prepare for reconnection
    } else if (state.isConnected && connectionState === 'disconnected') {
      console.log('📶 Network restored - attempting to reconnect');
      initializeConsultation();
    }
  });

  return () => unsubscribe();
}, [connectionState]);
```

### Performance Optimization

```javascript
// Memoize video component
const MemoizedVideoConference = React.memo(VideoConference);

// Lazy load heavy components
const VideoConsultationScreen = lazy(() => 
  import('./VideoConsultationScreen')
);

// Monitor connection quality
serviceRef.current.on('qualityChanged', (data) => {
  if (data.quality === 'poor') {
    console.warn('⚠️ Poor connection detected - reducing video quality');
    // Lower video resolution
  }
});
```

### Testing Video Integration

```bash
# Test token generation
curl -X POST https://api.mediqzy.com/api/consultations/token \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appointment_id": "appt_123", "consultation_type": "video"}'

# Test recording (after consultation starts)
curl -X POST https://api.mediqzy.com/api/consultations/consult_123/recording \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

### Troubleshooting Checklist

- [ ] LiveKit server is running and accessible
- [ ] SQLite_TOKEN has `consultation_grants` with appropriate permissions
- [ ] Camera & microphone permissions granted in app settings
- [ ] Network connectivity stable (test with speedtest)
- [ ] LiveKit URL accessible from device
- [ ] Firebase Cloud Messaging configured for notifications
- [ ] Recording endpoint returns 200 OK
- [ ] Device has sufficient storage for recordings
- [ ] TLS certificate is valid (not expired)

---

### Push Notifications
| Method | Endpoint | Purpose |
|--------|----------|---------|  
| POST | `/api/notifications/register-device` | Register FCM token |
| POST | `/api/notifications/send` | Send notification |
| GET | `/api/notifications` | Get notification history |
```bash
npx create-expo-app SmartHealthApp
cd SmartHealthApp
```

### Step 2: Install Dependencies
```bash
npm install
npm install expo-secure-store @react-native-async-storage/async-storage axios
npm install react-native-health react-native-google-fit
npm install @react-native-firebase/app @react-native-firebase/messaging
```

### Step 3: Setup Authentication Context
```javascript
// contexts/AuthContext.js
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    bootstrapAsync();
  }, []);

  const bootstrapAsync = async () => {
    try {
      const savedToken = await SecureStore.getItemAsync('jwt_token');
      const savedUser = await AsyncStorage.getItem('user_data');
      
      if (savedToken) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser || '{}'));
      }
    } catch (err) {
      console.error('Failed to restore token', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, setUser, setToken }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Step 4: Create API Client
```javascript
// services/api.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.mediqzy.com';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Add auth token to requests
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('jwt_token');
      // Redirect to login
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Step 5: Test Connectivity
```bash
# Test API endpoint
curl -X GET https://api.mediqzy.com/api/health \
  -H "Content-Type: application/json"

# Expected response: { "status": "ok", "message": "Server is running" }
```

---

## 🧪 Testing Checklist

- [ ] User login works (patient & doctor)
- [ ] Token is securely stored
- [ ] Authenticated requests include Authorization header
- [ ] Refresh token logic works
- [ ] Doctors list loads correctly
- [ ] Appointments can be booked
- [ ] Health data syncs (Apple Health/Google Fit)
- [ ] Push notifications are received
- [ ] Profile updates work
- [ ] Logout clears all data

---

## 📚 Additional Resources

### Full Documentation Files
- `docs/integrations/SMARTHEALTH_RN_MOBILE_APP_INTEGRATION.md` - Complete technical guide
- `docs/guides/MOBILE_APP_INTEGRATION_GUIDE.md` - Step-by-step implementation
- `docs/integrations/REACT_NATIVE_INTEGRATION.md` - API reference
- `docs/features/APPLE_HEALTH_INTEGRATION.md` - Health data sync details
- `docs/architecture/MEDICZY_MOBILE_APP_MULTI_TENANT.md` - Multi-tenant architecture

### Video Integration (LiveKit)
For video consultations, LiveKit SDK is integrated:
```javascript
import { LiveKitRoom, VideoConference } from '@livekit/react-native';
import { Room, Participant } from 'livekit-client';

const startCall = async (roomId) => {
  // Get token from backend
  const response = await fetch(`${API_BASE}/api/consultations/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ room: roomId })
  });
  
  const { token: liveKitToken } = await response.json();
  
  return (
    <LiveKitRoom
      url={process.env.LIVEKIT_URL}
      token={liveKitToken}
      connect={true}
    >
      <VideoConference />
    </LiveKitRoom>
  );
};
```

### OTP Login Screen (React Native Component)

```javascript
// screens/OTPLoginScreen.js
import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const AUTH_BASE = 'https://app.mediqzy.com/api';

export default function OTPLoginScreen({ navigation }) {
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otp SessionId, setOtpSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const otpInputRef = useRef(null);

  // Step 1: Send OTP
  const handleSendOTP = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${AUTH_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: `+91${phoneNumber}`,
          country_code: 'IN'
        })
      });

      const data = await response.json();

      if (data.success) {
        setOtpSessionId(data.data.otp_session_id);
        setStep('otp');
        setResendTimer(60);  // 60 second cooldown
        
        // Start countdown
        const interval = setInterval(() => {
          setResendTimer(prev => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        Alert.alert('✅ OTP Sent', 'Check your SMS for the 6-digit code');
        otpInputRef.current?.focus();
      } else {
        Alert.alert('Error', data.message || 'Failed to send OTP');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${AUTH_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp_session_id: otpSessionId,
          otp_code: otpCode
        })
      });

      const data = await response.json();

      if (data.success) {
        // Store tokens securely
        await SecureStore.setItemAsync('jwt_token', data.data.token);
        await SecureStore.setItemAsync('user_id', data.data.user.id);
        await SecureStore.setItemAsync('user_phone', phoneNumber);
        
        Alert.alert('✅ Logged In', `Welcome back, ${data.data.user.name}!`);
        navigation.replace('MainApp'); // Navigate to app
      } else {
        Alert.alert('Error', data.message || 'Invalid OTP');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    if (resendTimer > 0) return;
    setOtpCode('');
    await handleSendOTP();
  };

  if (step === 'phone') {
    return (
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
          Login with Phone
        </Text>
        
        <Text style={{ marginBottom: 10, color: '#666' }}>Enter your 10-digit phone number</Text>
        
        <View style={{ flexDirection: 'row', marginBottom: 20 }}>
          <Text style={{
            fontSize: 18,
            padding: 12,
            backgroundColor: '#f0f0f0',
            borderRadius: 5,
            marginRight: 10,
            fontWeight: 'bold'
          }}>
            +91
          </Text>
          
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 5,
              paddingHorizontal: 15,
              fontSize: 16
            }}
            placeholder="XXXXXXXXXX"
            keyboardType="numeric"
            maxLength={10}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
        </View>

        <TouchableOpacity
          onPress={handleSendOTP}
          disabled={loading}
          style={{
            backgroundColor: loading ? '#ccc' : '#2196F3',
            padding: 15,
            borderRadius: 5,
            alignItems: 'center'
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
              Send OTP
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Verify OTP
      </Text>
      
      <Text style={{ marginBottom: 10, color: '#666' }}>
        Enter the 6-digit code sent to +91{phoneNumber}
      </Text>

      <TextInput
        ref={otpInputRef}
        style={{
          borderWidth: 2,
          borderColor: '#2196F3',
          borderRadius: 5,
          padding: 15,
          fontSize: 20,
          marginBottom: 20,
          letterSpacing: 5,
          textAlign: 'center',
          fontWeight: 'bold'
        }}
        placeholder="000000"
        keyboardType="numeric"
        maxLength={6}
        value={otpCode}
        onChangeText={setOtpCode}
      />

      <TouchableOpacity
        onPress={handleVerifyOTP}
        disabled={loading}
        style={{
          backgroundColor: loading ? '#ccc' : '#2196F3',
          padding: 15,
          borderRadius: 5,
          alignItems: 'center',
          marginBottom: 15
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
            Verify & Login
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={resendOTP}
        disabled={resendTimer > 0}
      >
        <Text style={{
          textAlign: 'center',
          color: resendTimer > 0 ? '#ccc' : '#2196F3',
          fontSize: 14
        }}>
          {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Push Notifications with FCM
Firebase Cloud Messaging is pre-configured. Simply register device token on app launch.

---

## 🚀 Deployment Checklist

Before launching to production:

- [ ] All environment variables configured
- [ ] SSL/TLS certificate validation enabled
- [ ] Secure token storage implemented
- [ ] Biometric authentication added (optional)
- [ ] API rate limiting understood
- [ ] Error handling implemented
- [ ] Offline support considered
- [ ] App store guidelines reviewed
- [ ] Security scan completed
- [ ] Performance testing done

---

## 📞 Support & Q&A

**OTP Login Issues:**

1. **OTP not sending:**
   - Verify phone number format: `+91XXXXXXXXXX` (10 digits after +91)
   - Check that SMS service is configured in backend
   - Verify Auth Base URL is `https://app.mediqzy.com/api`
   - Check server logs: `sudo docker logs mediczy-backend | grep -i otp`

2. **OTP verification failing:**
   - Ensure OTP entered correctly (case-sensitive)
   - OTP expires after 10 minutes (call `/api/auth/send-otp` again for new code)
   - Check that `otp_session_id` from step 1 is passed to step 2
   - Verify phone number matches the one used in step 1

3. **OTP sending 403 error:**
   ```
   Error: POST /api/auth/send-otp 403
   ```
   - Check if Auth credentials are correct
   - Verify firewall isn't blocking requests
   - Check CORS settings in nginx

**Firebase Messaging Issues:**

1. **Firebase 403 Error (Your Current Issue):**
   ```
   POST https://firebaseinstallations.googleapis.com/v1/projects/mediczy-notifications/installations 403
   ```
   
   **Solution:** Disable Firebase SW for SSL compatibility (temporary):
   ```javascript
   // Only use web-based FCM, not Service Worker
   const registerFCMToken = async () => {
     try {
       const token = await getToken(messaging);
       console.log('✅ FCM Token:', token);
     } catch (error) {
       console.warn('⚠️ FCM disabled for SSL compatibility:', error);
     }
   };
   ```

2. **Service Worker Registration Failed:**
   - Verify app is served over HTTPS (required for FCM)
   - Clear browser cache and service workers
   - Check browser console for SW errors

3. **IndexedDB Access Denied:**
   - Check browser privacy settings
   - Disable private browsing mode

**Common Issues:**

1. **Token expiration:** Implement refresh token mechanism
   ```javascript
   if (error.status === 401) {
     const newToken = await refreshToken();
     retry with newToken;
   }
   ```

2. **Health data not syncing:** Verify permissions are granted and API endpoint matches your clinic

3. **Push notifications not working:** Ensure FCM is properly configured and device token is registered

4. **Doctor not appearing in list:** Check clinic_slug parameter matches clinic setup

---

## 📝 API Base URLs - Reference

| Purpose | Base URL | Example Endpoint |
|---------|----------|-----------------|
| **Authentication** | `https://app.mediqzy.com/api` | POST /api/auth/send-otp |
| **User API Calls** | `https://api.mediqzy.com` | GET /api/users/profile |
| **Health Data** | `https://api.mediqzy.com` | POST /api/apple-health/sync |
| **Appointments** | `https://api.mediqzy.com` | POST /api/appointments |
| **Video Consultation** | `https://api.mediqzy.com` | POST /api/consultations/token |
| **Notifications** | `https://api.mediqzy.com` | POST /api/notifications/register-device |

**Important:** Always use correct base URL:
- 🔐 **Auth endpoints** → `https://app.mediqzy.com/api`
- 📱 **Everything else** → `https://api.mediqzy.com`

All endpoints require `Content-Type: application/json` header in requests.

---

**Last Updated:** February 8, 2026  
**Status:** ✅ Ready for Mobile Team Implementation  
**Next Step:** Share this with your mobile development team and start implementation!

