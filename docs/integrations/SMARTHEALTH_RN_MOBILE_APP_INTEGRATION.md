# SmartHealth RN Mobile App - Mediqzy Integration Guide

## Overview

SmartHealth RN is the mobile app for **Mayden** (Insurance Broker) serving corporate customers like **My SmartHealth**. Corporate employees access **Mediqzy** wellness platform services through the app.

**Integration Architecture**:
```
SmartHealth RN Mobile App
         ↓
  Mayden (Broker)
         ↓
  My SmartHealth (Corporate)
         ↓
  Corporate Employees (e.g., user@mediczy.com)
         ↓
  Mediqzy Wellness Platform Services
         ↓
  Doctors (e.g., doctor@mediqzy.com), Labs, Pharmacies, etc.
```

## Table of Contents

1. [Getting Started](#getting-started)
2. [Corporate Employee Authentication](#corporate-employee-authentication)
3. [API Endpoints](#api-endpoints)
4. [Use Case: Video Consultation](#use-case-video-consultation)
5. [Available Services](#available-services)
6. [React Native Implementation](#react-native-implementation)
7. [Testing Guide](#testing-guide)
8. [Best Practices](#best-practices)

---

## Getting Started

### Prerequisites

- React Native 0.70+
- Node.js 16+
- iOS 13+ / Android 8+
- Axios or Fetch API for HTTP requests

### Environment Configuration

Create `.env` file in your React Native project root:

```env
# Mediqzy API Configuration
API_BASE_URL=https://api.mediqzy.com
MOBILE_API_BASE_URL=https://api.mediqzy.com/api/mobile
API_TIMEOUT=15000

# SmartHealth App Configuration
APP_NAME=SmartHealth
APP_VERSION=1.0.0
BROKER_SLUG=mayden
CORPORATE_SLUG=my-smarthealth
```

### Install Dependencies

```bash
npm install axios @react-native-async-storage/async-storage
# For secure credential storage (recommended)
npm install @react-native-keychain/keychain
```

---

## Corporate Employee Authentication

### Flow Diagram

```
┌─────────────────────┐
│  Corporate Employee │
│  (user@mediczy.com) │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────┐
│  SmartHealth RN Mobile App   │
│  1. Login Screen             │
│     - Email                  │
│     - Password               │
│     - Corporate Slug (auto)  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  POST /api/mobile/auth/      │
│  corporate-login             │
│  (Mediqzy API)               │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Access Token Generated       │
│  - Includes corporate context │
│  - Valid for 30 days         │
│  - Stored securely           │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  SmartHealth RN Dashboard    │
│  - Corporate info            │
│  - Available services        │
│  - Doctor appointments       │
│  - Wellness requests         │
└──────────────────────────────┘
```

### Login Endpoint

**POST** `/api/mobile/auth/corporate-login`

#### Request Body

```json
{
  "email": "user@mediczy.com",
  "password": "SecurePassword123",
  "deviceId": "device_abc123xyz",          // Optional: device identifier
  "pushToken": "fcm_token_xyz",             // Optional: for push notifications
  "corporateSlug": "my-smarthealth"         // Optional: corporate identifier
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 456,
      "name": "John Doe",
      "email": "user@mediczy.com",
      "phone": "+919876543210",
      "avatar_url": "https://...",
      "corporate": {
        "id": 789,
        "name": "My SmartHealth",
        "slug": "my-smarthealth",
        "type": "corporate"
      }
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_...",
    "expiresIn": "30d"
  },
  "message": "Welcome John Doe! You're accessing Mediqzy wellness services via My SmartHealth"
}
```

---

## API Endpoints

### Corporate Employee Endpoints

#### GET `/api/mobile/corporate/profile`
Get employee's profile with corporate context

**Headers**: `Authorization: Bearer {accessToken}`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 456,
    "name": "John Doe",
    "email": "user@mediczy.com",
    "corporate": {
      "id": 789,
      "name": "My SmartHealth",
      "slug": "my-smarthealth",
      "aggregatorUid": "mayden_123"
    },
    "services": [
      "doctor_consultations",
      "video_consultation",
      "lab_services",
      "pharmacy_services",
      "homecare_services",
      "ambulance_services"
    ],
    "accessContext": "mediqzy_wellness_platform"
  }
}
```

#### GET `/api/mobile/corporate/dashboard`
Corporate employee dashboard with available services

**Headers**: `Authorization: Bearer {accessToken}`

**Response**:
```json
{
  "success": true,
  "data": {
    "corporate": {
      "id": 789,
      "name": "My SmartHealth",
      "slug": "my-smarthealth"
    },
    "wellness_platform": {
      "name": "Mediqzy",
      "description": "Comprehensive wellness services for corporate employees"
    },
    "upcoming_appointments": [
      {
        "id": 101,
        "appointment_date": "2026-02-15",
        "appointment_time": "14:00",
        "type": "video",
        "status": "confirmed",
        "doctor_name": "Dr. Asha Sharma",
        "doctor_specialty": "General Medicine"
      }
    ],
    "available_services": [
      {
        "id": "doctors",
        "name": "Doctor Consultations",
        "description": "Connect with verified doctors for online and in-person consultations",
        "icon": "stethoscope",
        "action": "/doctors"
      },
      // ... more services
    ],
    "quick_actions": [
      {
        "title": "Book Appointment",
        "icon": "calendar",
        "action": "/doctors"
      },
      // ... more quick actions
    ]
  }
}
```

### Doctor & Appointment Endpoints

#### GET `/api/mobile/doctors`
Search for doctors

**Query Parameters**:
- `specialty`: Filter by specialization (e.g., "Cardiology")
- `search`: Search by doctor name
- `corporateOnly=true`: Filter to corporate's network doctors only
- `page`, `limit`: Pagination

**Headers**: `Authorization: Bearer {accessToken}` (required if `corporateOnly=true`)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 201,
      "name": "Dr. Asha Sharma",
      "email": "asha.sharma@mediqzy.com",
      "specialty": "General Medicine",
      "experience": "8 years",
      "consultation_fee": 500,
      "rating": 4.8,
      "avatar_url": "https://...",
      "hospital_name": "Apollo Clinic",
      "available": true,
      "is_online": true
    }
  ],
  "pagination": {
    "page": 1,
    "total": 150,
    "totalPages": 8
  },
  "filter": {
    "corporateOnly": true,
    "specialty": null
  }
}
```

#### POST `/api/mobile/appointments`
Book an appointment with a doctor

**Headers**: `Authorization: Bearer {accessToken}`

**Request Body**:
```json
{
  "doctorId": 201,
  "appointmentDate": "2026-02-15",
  "appointmentTime": "14:00",
  "type": "video",
  "symptoms": ["headache", "fever"],
  "notes": "First-time appointment, need general checkup"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Appointment booked successfully",
  "data": {
    "id": 5001,
    "appointment_date": "2026-02-15",
    "appointment_time": "14:00",
    "type": "video",
    "status": "pending",
    "doctor_id": 201,
    "doctor_name": "Dr. Asha Sharma",
    "doctor_specialty": "General Medicine",
    "doctor_avatar": "https://..."
  }
}
```

#### POST `/api/mobile/video/token`
Get video consultation token (for Agora/LiveKit)

**Headers**: `Authorization: Bearer {accessToken}`

**Request Body**:
```json
{
  "appointmentId": 5001,
  "channelName": "appointment_5001",
  "userId": 456
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "agora_token_xyz...",
    "appId": "agora_app_id",
    "channelName": "appointment_5001",
    "userId": 456,
    "ttl": 3600,
    "expiresAt": "2026-02-08T19:30:00Z"
  }
}
```

### Wellness Services Endpoints

#### GET `/api/mobile/wellness/services`
Get available wellness services

**Headers**: `Authorization: Bearer {accessToken}`

**Response**:
```json
{
  "success": true,
  "data": {
    "corporate": {
      "id": 789,
      "name": "My SmartHealth"
    },
    "services": [
      {
        "id": "lab_services",
        "name": "Lab Services",
        "description": "Home pathology tests with free sample collection",
        "category": "diagnostics",
        "features": [
          "Blood tests",
          "COVID-19 testing",
          "Home sample collection",
          "Reports in 24 hours"
        ],
        "icon": "microscope",
        "action": "/wellness/lab"
      },
      {
        "id": "pharmacy_services",
        "name": "Pharmacy Services",
        "description": "Medicine delivery and online pharmacy consultations",
        "category": "pharmacy",
        "features": [
          "Fast medicine delivery",
          "Prescription verification",
          "Generic alternatives",
          "24/7 availability"
        ],
        "icon": "pill-bottle",
        "action": "/wellness/pharmacy"
      },
      {
        "id": "homecare_services",
        "name": "Homecare Services",
        "description": "Nursing care and medical support at home",
        "category": "healthcare",
        "features": [
          "Trained nurses",
          "Post-operative care",
          "Chronic disease management"
        ],
        "icon": "home",
        "action": "/wellness/homecare"
      },
      {
        "id": "ambulance_services",
        "name": "Ambulance Services",
        "description": "Emergency and non-emergency ambulance availability",
        "category": "emergency",
        "features": [
          "BLS equipped",
          "ALS equipped",
          "GPS tracking"
        ],
        "icon": "ambulance",
        "action": "/wellness/ambulance"
      }
    ]
  }
}
```

#### POST `/api/mobile/wellness/lab/request`
Request lab service with home sample collection

**Headers**: `Authorization: Bearer {accessToken}`

**Request Body**:
```json
{
  "testType": "Complete Blood Count",
  "preferredDate": "2026-02-10",
  "preferredTime": "09:00",
  "address": "123 Main St, Bangalore"
}
```

#### POST `/api/mobile/wellness/pharmacy/order`
Order medicines with prescription

**Headers**: `Authorization: Bearer {accessToken}`

**Request Body**:
```json
{
  "medicines": [
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "quantity": 10,
      "unit": "tablets"
    }
  ],
  "prescriptionUrl": "https://...",
  "deliveryAddress": "123 Main St, Bangalore",
  "notes": "Deliver by 5 PM"
}
```

#### POST `/api/mobile/wellness/homecare/request`
Request homecare services (nursing, medical support)

**Headers**: `Authorization: Bearer {accessToken}`

**Request Body**:
```json
{
  "serviceType": "Post-operative care",
  "duration": "7 days",
  "preferredDate": "2026-02-12",
  "specialRequirements": "IV therapy required",
  "address": "123 Main St, Bangalore"
}
```

#### POST `/api/mobile/wellness/ambulance/request`
Request ambulance service

**Headers**: `Authorization: Bearer {accessToken}`

**Request Body**:
```json
{
  "emergency": true,
  "serviceType": "BLS equipped",
  "pickupAddress": "123 Main St, Bangalore",
  "destinationAddress": "Apollo Hospital, Bangalore",
  "reason": "Emergency transfer",
  "notes": "Patient with chest pain"
}
```

#### GET `/api/mobile/wellness/requests`
Get all wellness service requests history

**Headers**: `Authorization: Bearer {accessToken}`

---

## Use Case: Video Consultation

### Scenario
`user@mediczy.com` (My SmartHealth employee) books a video consultation with `doctor@mediqzy.com` (Mediqzy doctor)

### Flow

```
1. Employee logs into SmartHealth RN
   POST /api/mobile/auth/corporate-login
   ├─ Email: user@mediczy.com
   ├─ Password: SecurePassword123
   └─ CorporateSlug: my-smarthealth
   
2. Receives access token with corporate context
   Response includes:
   ├─ Token valid for 30 days
   ├─ Corporate: My SmartHealth
   └─ Available services: [doctors, video_consultation, lab, etc.]

3. Views available doctors
   GET /api/mobile/doctors?corporateOnly=true
   Response: List of My SmartHealth's network doctors

4. Selects Dr. Asha Sharma (General Medicine)
   GET /api/mobile/doctors/201
   Response: Doctor details, fees, availability

5. Books appointment for video consultation
   POST /api/mobile/appointments
   ├─ DoctorId: 201
   ├─ Type: video
   ├─ Date: 2026-02-15
   └─ Time: 14:00
   
   Response: Appointment ID 5001, status: pending

6. At appointment time, gets video token
   POST /api/mobile/video/token
   ├─ AppointmentId: 5001
   └─ ChannelName: appointment_5001
   
   Response: Agora token for video call

7. Initiates video call with doctor
   ConnectToRoom(token)
   └─ Video consultation happens in real-time

8. After consultation
   ├─ Appointment marked as completed
   ├─ Doctor can prescribe medicines
   └─ Employee can order from pharmacy or book lab test
```

### Code Implementation

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = axios.create({
  baseURL: process.env.MOBILE_API_BASE_URL,
  timeout: 15000
});

// Add token to requests
API.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Video Consultation Booking Flow
export const bookVideoConsultation = async (doctorId, appointmentDate, appointmentTime) => {
  try {
    // Book appointment
    const appointmentResponse = await API.post('/appointments', {
      doctorId,
      appointmentDate,
      appointmentTime,
      type: 'video'
    });

    const appointmentId = appointmentResponse.data.data.id;

    // Get video token
    const tokenResponse = await API.post('/video/token', {
      appointmentId,
      channelName: `appointment_${appointmentId}`,
      userId: (await AsyncStorage.getItem('userId'))
    });

    return {
      appointmentId,
      token: tokenResponse.data.data.token,
      channelName: tokenResponse.data.data.channelName,
      appId: tokenResponse.data.data.appId
    };
  } catch (error) {
    console.error('Video consultation booking failed:', error);
    throw error;
  }
};
```

---

## Available Services

### 1. Doctor Consultations
- Online and in-person appointments
- Verified doctors across specializations
- Real-time video consultations
- Doctor ratings and reviews

### 2. Video Consultation
- Live video calls with doctors
- HD quality (optimized for mobile)
- Screen sharing for health records
- Secure and encrypted

### 3. Lab Services
- Home pathology tests
- Free sample collection
- Reports in 24 hours
- Doctor consultation included

### 4. Pharmacy Services
- Fast medicine delivery
- Prescription verification
- Generic alternatives
- 24/7 availability

### 5. Homecare Services
- Trained nurses
- Post-operative care
- Chronic disease management
- Wound dressing and IV therapy

### 6. Ambulance Services
- BLS and ALS equipped
- ICU ambulance
- GPS tracking
- 24/7 availability

---

## React Native Implementation

### Login Screen

```typescript
import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export function CorporateLoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        `${process.env.MOBILE_API_BASE_URL}/auth/corporate-login`,
        {
          email,
          password,
          corporateSlug: 'my-smarthealth',
          deviceId: 'device_123', // Generate device ID
          pushToken: 'fcm_token_xyz'
        }
      );

      const { accessToken, refreshToken, user } = response.data.data;

      // Store tokens securely
      await AsyncStorage.multiSet([
        ['accessToken', accessToken],
        ['refreshToken', refreshToken],
        ['user', JSON.stringify(user)],
        ['userId', user.id.toString()],
        ['corporateSlug', user.corporate.slug]
      ]);

      // Navigate to dashboard
      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' }]
      });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        SmartHealth Wellness
      </Text>

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          marginBottom: 15,
          borderRadius: 5
        }}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!loading}
      />

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          marginBottom: 20,
          borderRadius: 5
        }}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      {error ? (
        <Text style={{ color: 'red', marginBottom: 15 }}>{error}</Text>
      ) : null}

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        style={{
          backgroundColor: '#007AFF',
          padding: 15,
          borderRadius: 5,
          alignItems: 'center'
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
            Login
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
```

### Dashboard Screen

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function DashboardScreen({ navigation }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const response = await axios.get(
        `${process.env.MOBILE_API_BASE_URL}/corporate/dashboard`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setDashboard(response.data.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, padding: 15 }}>
      {/* Corporate Info */}
      <View style={{ marginBottom: 25 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          {dashboard?.corporate.name}
        </Text>
        <Text style={{ color: '#666' }}>
          Accessing {dashboard?.wellness_platform.name} wellness services
        </Text>
      </View>

      {/* Upcoming Appointments */}
      {dashboard?.upcoming_appointments.length > 0 && (
        <View style={{ marginBottom: 25 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>
            Upcoming Appointments
          </Text>
          {dashboard.upcoming_appointments.map((apt) => (
            <View
              key={apt.id}
              style={{
                padding: 15,
                backgroundColor: '#f5f5f5',
                borderRadius: 8,
                marginBottom: 10
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>{apt.doctor_name}</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>
                {apt.doctor_specialty}
              </Text>
              <Text style={{ color: '#666', fontSize: 12, marginTop: 5 }}>
                {apt.appointment_date} at {apt.appointment_time}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>
          Services
        </Text>
        {dashboard?.available_services.map((service) => (
          <TouchableOpacity
            key={service.id}
            onPress={() => navigation.navigate(service.id)}
            style={{
              padding: 15,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              marginBottom: 10
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>{service.name}</Text>
            <Text style={{ color: '#666', fontSize: 12 }}>
              {service.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
```

---

## Testing Guide

### 1. Test Corporate Employee Login

```bash
curl -X POST \
  https://api.mediqzy.com/api/mobile/auth/corporate-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mediczy.com",
    "password": "SecurePassword123",
    "corporateSlug": "my-smarthealth"
  }'
```

### 2. Test Dashboard Access

```bash
curl -X GET \
  https://api.mediqzy.com/api/mobile/corporate/dashboard \
  -H "Authorization: Bearer <accessToken>"
```

### 3. Test Doctor Search (Corporate Network Only)

```bash
curl -X GET \
  "https://api.mediqzy.com/api/mobile/doctors?corporateOnly=true&specialty=General%20Medicine" \
  -H "Authorization: Bearer <accessToken>"
```

### 4. Test Appointment Booking

```bash
curl -X POST \
  https://api.mediqzy.com/api/mobile/appointments \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": 201,
    "appointmentDate": "2026-02-15",
    "appointmentTime": "14:00",
    "type": "video"
  }'
```

### 5. Test Video Token Request

```bash
curl -X POST \
  https://api.mediqzy.com/api/mobile/video/token \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentId": 5001,
    "channelName": "appointment_5001"
  }'
```

### 6. Test Wellness Services

```bash
curl -X GET \
  https://api.mediqzy.com/api/mobile/wellness/services \
  -H "Authorization: Bearer <accessToken>"
```

---

## Best Practices

### 1. Token Management

```javascript
// Store tokens securely
await Keychain.setGenericPassword('tokens', JSON.stringify({
  accessToken,
  refreshToken,
  expiresAt: new Date().getTime() + (30 * 24 * 60 * 60 * 1000)
}));

// Check and refresh token if expired
const isTokenExpired = (expiresAt) => {
  return new Date().getTime() > expiresAt;
};
```

### 2. Error Handling

```javascript
API.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token expired, logout user
      AsyncStorage.removeItem('accessToken');
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return Promise.reject(error);
  }
);
```

### 3. Offline Support

```javascript
// Queue requests when offline
const requestQueue = [];

addEventListener('online', async () => {
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    try {
      await request();
    } catch (error) {
      requestQueue.push(request);
      break;
    }
  }
});
```

### 4. Security

- Always use HTTPS
- Store sensitive data securely (tokens in Keychain/Keystore)
- Validate SSL certificates
- Implement biometric authentication
- Clear sensitive data on logout

### 5. Performance

- Implement pagination for doctor search
- Cache frequently accessed data
- Compress images before upload
- Minimize API calls using batch endpoints
- Use HTTP/2 with connection pooling

---

## Support & Documentation

For issues or questions:
- **API Documentation**: https://docs.mediqzy.com/api
- **Mobile SDK**: https://github.com/mediqzy/mobile-sdk
- **Support**: support@mediqzy.com

