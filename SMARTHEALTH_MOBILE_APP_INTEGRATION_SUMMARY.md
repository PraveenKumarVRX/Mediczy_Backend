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

### 1. User Authentication
**Endpoint:** `POST /api/users/login` or `POST /api/patient/login`

```javascript
// Login
const login = async (email, password, clinicSlug) => {
  const response = await fetch(`${API_BASE}/api/patient/login`, {
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
  }
  return data;
};
```

**Token Storage:** Use `expo-secure-store` (iOS Keychain, Android Keystore)

### 2. Doctor Authentication
**Endpoint:** `POST /api/doctors/login`

```javascript
const doctorLogin = async (email, password) => {
  const response = await fetch(`${API_BASE}/api/doctors/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (data.success) {
    await SecureStore.setItemAsync('doctorToken', data.token);
  }
  return data;
};
```

### 3. Health Data Sync

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
          await fetch(`${API_BASE}/api/fitness/store`, {
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

### 4. Appointments
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

### 5. Get Doctors List
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

### 6. Prescriptions
**Endpoint:** `GET /api/prescriptions`

```javascript
const getPrescriptions = async () => {
  const response = await fetch(`${API_BASE}/api/prescriptions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

### 7. Push Notifications (FCM)
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
# API Configuration
API_BASE_URL=https://api.mediqzy.com
API_TIMEOUT=30000

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_APP_ID=your_firebase_app_id

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
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/patient/signup` | User registration |
| POST | `/api/patient/login` | Patient login |
| POST | `/api/doctors/login` | Doctor login |
| POST | `/api/users/profile` | Get user profile |
| PUT | `/api/users/profile` | Update profile |
| POST | `/api/users/logout` | Logout |

### Appointment Endpoints
| Method | Endpoint | Purpose |
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
| POST | `/api/fitness/store` | Store fitness data |
| GET | `/api/fitness/summary?days=7` | Get fitness summary |
| GET | `/api/health-metrics` | Get health metrics |

### Prescription Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/prescriptions` | Get user prescriptions |
| GET | `/api/prescriptions/:id` | Get prescription details |
| POST | `/api/prescriptions/:id/refill` | Request refill |

### Video Consultation
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/consultations/start` | Start consultation |
| GET | `/api/consultations/token` | Get LiveKit token |
| POST | `/api/consultations/end` | End consultation |

### Push Notifications
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/notifications/register-device` | Register FCM token |
| POST | `/api/notifications/send` | Send notification |
| GET | `/api/notifications` | Get notification history |

---

## 🛠️ Setup Instructions for Your Team

### Step 1: Initialize React Native Project
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

## 📝 API Base URL

**Production:** `https://api.mediqzy.com`  
**Staging:** `https://staging-api.mediqzy.com` (if available)

All endpoints are RESTful JSON APIs. Include `Content-Type: application/json` header in all requests.

---

**Last Updated:** February 8, 2026  
**Status:** ✅ Ready for Mobile Team Implementation  
**Next Step:** Share this with your mobile development team and start implementation!

