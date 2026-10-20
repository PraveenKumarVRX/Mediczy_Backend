# Mediczy Mobile App Integration Guide

**Version:** 1.2  
**Last Updated:** April 20, 2026  
**API Base URL:** `https://app.mediqzy.com/api`

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [API Configuration](#api-configuration)
4. [Available Endpoints](#available-endpoints)
5. [Code Examples](#code-examples)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Testing](#testing)

---

## Getting Started

### Prerequisites

- React Native 0.70+
- Node.js 16+
- iOS 13+ / Android 8+

### Required Packages

```bash
npm install axios @react-native-async-storage/async-storage
```

### Environment Configuration

Create `.env` file in your React Native project root:

```env
API_BASE_URL=https://app.mediqzy.com/api
API_TIMEOUT=15000
```

---

## Authentication

### Authentication Flow

The API supports two authentication methods:
1. **Password login** — `POST /api/auth/login`
2. **OTP login** (mobile preferred) — `POST /api/auth/send-otp` → `POST /api/auth/verify-otp`

> **Important for mobile apps:** Always use the `otp` field name (not `code`) in requests. Both are accepted, but `otp` is the mobile convention.

**Password Login Flow:**
```
POST /api/auth/login  {email, password}
         ↓
  {success, token, user}
         ↓
  Store token in AsyncStorage
```

**OTP Login Flow:**
```
POST /api/auth/send-otp  {email | phoneNumber}
         ↓
  {otpId, expiresAt, deliveryMethod, sentTo}
         ↓
POST /api/auth/verify-otp  {email | phoneNumber, otp}
         ↓
  {success, token, user}   ← existing user → store token
  {requiresRegistration: true} ← new user → proceed to register
```

**New User Signup Flow (OTP-based):**
```
POST /api/users/register/send-otp  {email, phoneNumber, firstName}
         ↓
  Sends OTP to email + WhatsApp
         ↓
POST /api/users/register/verify-email-otp  {email, phoneNumber, otp}
POST /api/users/register/verify-whatsapp-otp  {email, phoneNumber, otp}
         ↓  (both OTPs verified)
POST /api/users/register/verify-otp  {email, phoneNumber, password, firstName, lastName, dateOfBirth, gender}
         ↓
  {success, token, user}  ← complete, user is active
```

### Token Management

**Token Storage:**
- Store JWT token in AsyncStorage with key: `authToken`
- Store user data in AsyncStorage with key: `userData`

**Token Expiration:**
- Tokens expire after 24 hours
- 401 response = token expired → redirect to login

**Token Refresh:**
- Currently manual (re-login required)
- Auto-refresh coming in v2.0

---

## API Configuration

### Setup API Client (`services/api.js`)

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = axios.create({
  baseURL: 'https://app.mediqzy.com/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor - Attach Token
API.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor - Handle Errors
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      // Trigger logout navigation
      // NavigationService.navigate('Login');
    }
    return Promise.reject(error);
  }
);

export default API;
```

---

## Available Endpoints

### 1. Authentication Endpoints

> **Field name note:** Mobile apps must send `otp` (not `code`) in all OTP verify requests.

#### **Password Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "patient@example.com",
  "password": "Password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 123,
    "firstName": "John",
    "lastName": "Doe",
    "email": "patient@example.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-01-01T00:00:00.000Z",
    "gender": "Male"
  }
}
```

---

#### **OTP Login — Step 1: Send OTP**
```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "email": "patient@example.com"
  // OR
  "phoneNumber": "+919876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists, an OTP has been sent.",
  "data": {
    "otpId": "74d605a5be90ed90",
    "expiresAt": "2026-04-20T10:00:00.000Z",
    "expiresIn": "5 minutes",
    "deliveryMethod": "email",
    "sentTo": "pa****@example.com"
  }
}
```

#### **OTP Login — Step 2: Verify OTP**
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "patient@example.com",
  "otp": "123456"
}
```

**Response (existing user — login success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 123,
    "firstName": "John",
    "lastName": "Doe",
    "email": "patient@example.com",
    "phoneNumber": "+919876543210"
  }
}
```

**Response (new user — redirect to registration):**
```json
{
  "success": true,
  "requiresRegistration": true,
  "message": "OTP verified. Please complete your registration.",
  "data": {
    "otpVerified": true,
    "channel": "email",
    "identifier": "patient@example.com"
  }
}
```

> When `requiresRegistration: true`, navigate to the signup form. The email/phone OTP is already verified — proceed to `register/verify-otp` after collecting user details.

---

#### **New User Registration — Step 1: Send OTPs**
```http
POST /api/users/register/send-otp
Content-Type: application/json

{
  "email": "patient@example.com",
  "phoneNumber": "+919876543210",
  "firstName": "John"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email and WhatsApp",
  "data": {
    "emailOtpId": "abc123",
    "whatsappOtpId": "def456",
    "expiresIn": "10 minutes",
    "deliveryChannels": {
      "email": { "sent": true },
      "whatsapp": { "sent": true }
    }
  }
}
```

#### **New User Registration — Step 2a: Verify Email OTP**
```http
POST /api/users/register/verify-email-otp
Content-Type: application/json

{
  "email": "patient@example.com",
  "phoneNumber": "+919876543210",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email OTP verified",
  "data": { "emailVerified": true, "phoneVerified": false }
}
```

#### **New User Registration — Step 2b: Verify WhatsApp OTP**
```http
POST /api/users/register/verify-whatsapp-otp
Content-Type: application/json

{
  "email": "patient@example.com",
  "phoneNumber": "+919876543210",
  "otp": "654321"
}
```

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp OTP verified",
  "data": { "emailVerified": true, "phoneVerified": true }
}
```

#### **New User Registration — Step 3: Complete Registration**
```http
POST /api/users/register/verify-otp
Content-Type: application/json

{
  "email": "patient@example.com",
  "phoneNumber": "+919876543210",
  "password": "Password123",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-01",
  "gender": "Male"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 124,
    "firstName": "John",
    "lastName": "Doe",
    "email": "patient@example.com",
    "phoneNumber": "+919876543210",
    "status": "active"
  }
}
```

---

#### **Password Reset — Step 1: Request OTP**
```http
POST /api/users/forgot-password
Content-Type: application/json

{
  "email": "patient@example.com"
  // OR
  "phone": "+919876543210"
}
```

#### **Password Reset — Step 2: Verify OTP**
```http
POST /api/users/verify-reset-otp
Content-Type: application/json

{
  "email": "patient@example.com",
  "otp": "123456",
  "userType": "user"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### **Password Reset — Step 3: Set New Password**
```http
POST /api/users/reset-password
Content-Type: application/json

{
  "resetToken": "<token from step 2>",
  "newPassword": "NewPassword123"
}
```

#### **Logout**
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 2. Doctor Endpoints

#### **Get All Doctors** (No Auth Required)
```http
GET /api/doctors
```

**Query Parameters:**
- `specialization` - Filter by specialization
- `availability` - Filter available doctors
- `page` - Pagination (default: 1)
- `limit` - Results per page (default: 20)

**Example:**
```http
GET /api/doctors?specialization=Cardiologist&availability=true&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "doctors": [
    {
      "id": 71,
      "uid": "aa360398-bfce-40d0-86a6-2f06b384b51a",
      "prefix": "Dr",
      "firstName": "Rajesh",
      "lastName": "Sharma",
      "email": "cardio@test.com",
      "phoneNumber": "8888888887",
      "specialization": "Cardiologist",
      "qualification": "MBBS, MD",
      "experience": 10,
      "consultationFees": null,
      "consultationTypes": {
        "online": {
          "fee": 500,
          "available": true
        },
        "walkIn": {
          "fee": 600,
          "available": true
        }
      },
      "weeklySchedule": {},
      "rating": "0.00",
      "totalReviews": 0,
      "languages": ["English"],
      "status": "pending",
      "isOnline": true,
      "verificationStatus": "verified"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

#### **Get Doctor Details**
```http
GET /api/doctors/:doctorId
```

**Response:**
```json
{
  "success": true,
  "doctor": {
    "id": 71,
    "firstName": "Rajesh",
    "lastName": "Sharma",
    "specialization": "Cardiologist",
    "qualification": "MBBS, MD",
    "experience": 10,
    "weeklySchedule": {
      "monday": {
        "isOff": false,
        "online": {
          "enabled": true,
          "startTime": "09:00",
          "endTime": "17:00"
        }
      }
    },
    "availableSlots": ["09:00", "09:30", "10:00"],
    "reviews": []
  }
}
```

---

### 3. Patient Profile Endpoints (Auth Required)

#### **Get Patient Profile**
```http
GET /api/patients/profile
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "patient": {
    "id": 123,
    "firstName": "John",
    "lastName": "Doe",
    "email": "patient@example.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-01-01",
    "gender": "male",
    "bloodType": "O+",
    "allergies": ["Penicillin"],
    "medications": [],
    "chronicConditions": ["Hypertension"],
    "address": {
      "street": "123 Main St",
      "city": "Bangalore",
      "state": "Karnataka",
      "zipCode": "560001",
      "country": "India"
    }
  }
}
```

#### **Update Patient Profile**
```http
PUT /api/patients/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Smith",
  "phoneNumber": "+919876543210",
  "bloodType": "O+",
  "allergies": ["Penicillin", "Peanuts"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "patient": { /* updated patient data */ }
}
```

---

### 4. Appointment Endpoints (Auth Required)

#### **Book Appointment**
```http
POST /api/patients/appointments
Authorization: Bearer {token}
Content-Type: application/json

{
  "doctorId": 71,
  "appointmentDate": "2026-01-15",
  "appointmentTime": "10:00",
  "consultationType": "online",
  "symptoms": "Chest pain",
  "notes": "First time consultation"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Appointment booked successfully",
  "appointment": {
    "id": 456,
    "doctorId": 71,
    "doctorName": "Dr. Rajesh Sharma",
    "patientId": 123,
    "appointmentDate": "2026-01-15",
    "appointmentTime": "10:00",
    "consultationType": "online",
    "status": "confirmed",
    "meetingLink": "https://mediqzy.com/video/abc123"
  }
}
```

#### **Get My Appointments**
```http
GET /api/patients/appointments
Authorization: Bearer {token}
```

**Query Parameters:**
- `status` - Filter by status (upcoming, completed, cancelled)
- `page` - Pagination
- `limit` - Results per page

**Response:**
```json
{
  "success": true,
  "appointments": [
    {
      "id": 456,
      "doctor": {
        "id": 71,
        "name": "Dr. Rajesh Sharma",
        "specialization": "Cardiologist"
      },
      "appointmentDate": "2026-01-15",
      "appointmentTime": "10:00",
      "consultationType": "online",
      "status": "confirmed",
      "meetingLink": "https://mediqzy.com/video/abc123"
    }
  ]
}
```

#### **Cancel Appointment**
```http
DELETE /api/patients/appointments/:appointmentId
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Appointment cancelled successfully"
}
```

---

### 5. Medical Records Endpoints (Auth Required)

#### **Get Medical Records**
```http
GET /api/patients/medical-records
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "id": 789,
      "type": "prescription",
      "date": "2026-01-05",
      "doctorName": "Dr. Rajesh Sharma",
      "diagnosis": "Hypertension",
      "medications": [
        {
          "name": "Amlodipine",
          "dosage": "5mg",
          "frequency": "Once daily"
        }
      ],
      "fileUrl": "https://mediqzy.com/records/prescription_789.pdf"
    }
  ]
}
```

#### **Upload Medical Record**
```http
POST /api/patients/medical-records
Authorization: Bearer {token}
Content-Type: multipart/form-data

{
  "type": "lab_report",
  "file": <binary>,
  "date": "2026-01-05",
  "notes": "Blood test results"
}
```

---

## Code Examples

### Authentication Service (`services/auth.js`)

```javascript
import API from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Password Login ───────────────────────────────────────────────────────────
export const loginPatient = async (email, password) => {
  try {
    const response = await API.post('/auth/login', { email, password });
    if (response.data.success && response.data.token) {
      await AsyncStorage.setItem('authToken', response.data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
      return { success: true, user: response.data.user };
    }
    return { success: false, message: response.data.message || 'Login failed' };
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Network error.' };
  }
};

// ─── OTP Login ────────────────────────────────────────────────────────────────
export const sendLoginOTP = async (identifier) => {
  // identifier can be email or phoneNumber
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  try {
    const response = await API.post('/auth/send-otp', {
      [isEmail ? 'email' : 'phoneNumber']: identifier,
    });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to send OTP' };
  }
};

export const verifyLoginOTP = async (identifier, otp) => {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  try {
    const response = await API.post('/auth/verify-otp', {
      [isEmail ? 'email' : 'phoneNumber']: identifier,
      otp,  // always use 'otp' field, not 'code'
    });

    if (response.data.requiresRegistration) {
      // New user — OTP is verified but they need to complete signup
      return { success: true, requiresRegistration: true, identifier };
    }

    if (response.data.success && response.data.token) {
      await AsyncStorage.setItem('authToken', response.data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
      return { success: true, user: response.data.user };
    }

    return { success: false, message: response.data.message || 'OTP verification failed' };
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to verify OTP' };
  }
};

// ─── New User Registration ────────────────────────────────────────────────────
export const sendRegistrationOTPs = async (email, phoneNumber, firstName) => {
  try {
    const response = await API.post('/users/register/send-otp', { email, phoneNumber, firstName });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to send OTP' };
  }
};

export const verifyEmailOTP = async (email, phoneNumber, otp) => {
  try {
    const response = await API.post('/users/register/verify-email-otp', { email, phoneNumber, otp });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Invalid email OTP' };
  }
};

export const verifyWhatsAppOTP = async (email, phoneNumber, otp) => {
  try {
    const response = await API.post('/users/register/verify-whatsapp-otp', { email, phoneNumber, otp });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Invalid WhatsApp OTP' };
  }
};

export const completeRegistration = async (userData) => {
  // userData: { email, phoneNumber, password, firstName, lastName, dateOfBirth, gender }
  try {
    const response = await API.post('/users/register/verify-otp', userData);
    if (response.data.success && response.data.token) {
      await AsyncStorage.setItem('authToken', response.data.token);
      await AsyncStorage.setItem('userData', JSON.stringify(response.data.user));
      return { success: true, user: response.data.user };
    }
    return { success: false, message: response.data.message || 'Registration failed' };
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Registration failed' };
  }
};

// ─── Password Reset ───────────────────────────────────────────────────────────
export const requestPasswordReset = async (email) => {
  try {
    const response = await API.post('/users/forgot-password', { email, userType: 'user' });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to send OTP' };
  }
};

export const verifyResetOTP = async (email, otp) => {
  try {
    const response = await API.post('/users/verify-reset-otp', { email, otp, userType: 'user' });
    return response.data; // contains resetToken
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Invalid OTP' };
  }
};

export const resetPassword = async (resetToken, newPassword) => {
  try {
    const response = await API.post('/users/reset-password', { resetToken, newPassword });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Failed to reset password' };
  }
};

// ─── Session ──────────────────────────────────────────────────────────────────
export const logout = async () => {
  try {
    await API.post('/auth/logout');
  } catch (error) {
    // Ignore logout API errors
  } finally {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('userData');
  }
};

export const getCurrentUser = async () => {
  try {
    const userData = await AsyncStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    return null;
  }
};

export const isAuthenticated = async () => {
  const token = await AsyncStorage.getItem('authToken');
  return !!token;
};
```

---

### Doctor Service (`services/doctors.js`)

```javascript
import API from './api';

export const getDoctors = async (filters = {}) => {
  try {
    const response = await API.get('/doctors', { params: filters });
    return {
      success: true,
      doctors: response.data.doctors || [],
      pagination: response.data.pagination
    };
  } catch (error) {
    console.error('Get doctors error:', error);
    return { 
      success: false, 
      doctors: [],
      message: 'Failed to fetch doctors'
    };
  }
};

export const getDoctorById = async (doctorId) => {
  try {
    const response = await API.get(`/doctors/${doctorId}`);
    return {
      success: true,
      doctor: response.data.doctor
    };
  } catch (error) {
    return { 
      success: false, 
      message: 'Failed to fetch doctor details' 
    };
  }
};

export const searchDoctors = async (searchTerm, filters = {}) => {
  try {
    const response = await API.get('/doctors/search', {
      params: { q: searchTerm, ...filters }
    });
    return {
      success: true,
      doctors: response.data.doctors || []
    };
  } catch (error) {
    return { success: false, doctors: [] };
  }
};
```

---

### Appointment Service (`services/appointments.js`)

```javascript
import API from './api';

export const bookAppointment = async (appointmentData) => {
  try {
    const response = await API.post('/patients/appointments', appointmentData);
    return response.data;
  } catch (error) {
    return { 
      success: false, 
      message: error.response?.data?.message || 'Failed to book appointment' 
    };
  }
};

export const getMyAppointments = async (status = null) => {
  try {
    const params = status ? { status } : {};
    const response = await API.get('/patients/appointments', { params });
    return {
      success: true,
      appointments: response.data.appointments || []
    };
  } catch (error) {
    return { success: false, appointments: [] };
  }
};

export const cancelAppointment = async (appointmentId) => {
  try {
    const response = await API.delete(`/patients/appointments/${appointmentId}`);
    return response.data;
  } catch (error) {
    return { 
      success: false, 
      message: 'Failed to cancel appointment' 
    };
  }
};

export const rescheduleAppointment = async (appointmentId, newDate, newTime) => {
  try {
    const response = await API.put(`/patients/appointments/${appointmentId}`, {
      appointmentDate: newDate,
      appointmentTime: newTime
    });
    return response.data;
  } catch (error) {
    return { 
      success: false, 
      message: 'Failed to reschedule appointment' 
    };
  }
};
```

---

### Profile Service (`services/profile.js`)

```javascript
import API from './api';

export const getProfile = async () => {
  try {
    const response = await API.get('/patients/profile');
    return {
      success: true,
      patient: response.data.patient
    };
  } catch (error) {
    return { 
      success: false, 
      message: 'Failed to fetch profile' 
    };
  }
};

export const updateProfile = async (profileData) => {
  try {
    const response = await API.put('/patients/profile', profileData);
    return response.data;
  } catch (error) {
    return { 
      success: false, 
      message: error.response?.data?.message || 'Failed to update profile' 
    };
  }
};

export const uploadProfileImage = async (imageUri) => {
  try {
    const formData = new FormData();
    formData.append('profileImage', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'profile.jpg',
    });

    const response = await API.post('/patients/profile/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    return { 
      success: false, 
      message: 'Failed to upload image' 
    };
  }
};
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": {
    "field": "email",
    "issue": "Email already registered"
  }
}
```

### Common HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response data |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Validate input data |
| 401 | Unauthorized | Redirect to login, clear token |
| 403 | Forbidden | Show permission denied message |
| 404 | Not Found | Resource doesn't exist |
| 422 | Validation Error | Show field-specific errors |
| 500 | Server Error | Show generic error, retry |
| 503 | Service Unavailable | Server maintenance mode |

### Error Handling Utility

```javascript
// utils/errorHandler.js
export const handleAPIError = (error) => {
  if (!error.response) {
    // Network error
    return {
      title: 'Network Error',
      message: 'Please check your internet connection and try again.',
      code: 'NETWORK_ERROR'
    };
  }

  const { status, data } = error.response;

  switch (status) {
    case 400:
      return {
        title: 'Invalid Request',
        message: data.message || 'Please check your input and try again.',
        code: 'BAD_REQUEST'
      };
    
    case 401:
      return {
        title: 'Session Expired',
        message: 'Please login again to continue.',
        code: 'UNAUTHORIZED',
        requiresLogin: true
      };
    
    case 403:
      return {
        title: 'Access Denied',
        message: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN'
      };
    
    case 404:
      return {
        title: 'Not Found',
        message: data.message || 'The requested resource was not found.',
        code: 'NOT_FOUND'
      };
    
    case 422:
      return {
        title: 'Validation Error',
        message: data.message || 'Please check your input.',
        code: 'VALIDATION_ERROR',
        fields: data.details
      };
    
    case 500:
      return {
        title: 'Server Error',
        message: 'Something went wrong. Please try again later.',
        code: 'SERVER_ERROR'
      };
    
    default:
      return {
        title: 'Error',
        message: data.message || 'An unexpected error occurred.',
        code: 'UNKNOWN_ERROR'
      };
  }
};

// Usage in component
import { handleAPIError } from './utils/errorHandler';

const handleSubmit = async () => {
  try {
    const result = await loginPatient(email, password);
    if (result.success) {
      navigation.navigate('Home');
    } else {
      Alert.alert('Login Failed', result.message);
    }
  } catch (error) {
    const errorInfo = handleAPIError(error);
    Alert.alert(errorInfo.title, errorInfo.message);
    
    if (errorInfo.requiresLogin) {
      navigation.navigate('Login');
    }
  }
};
```

---

## Best Practices

### 1. Security

✅ **DO:**
- Store tokens in AsyncStorage (never in global variables)
- Use HTTPS for all API calls
- Clear sensitive data on logout
- Implement token refresh mechanism
- Validate input before sending to API
- Use biometric authentication when available

❌ **DON'T:**
- Store passwords in plain text
- Log sensitive data (tokens, passwords)
- Hardcode API keys in code
- Trust user input without validation

### 2. Performance

✅ **Optimize API Calls:**
```javascript
// Use debounce for search
import { debounce } from 'lodash';

const searchDoctors = debounce(async (query) => {
  const result = await getDoctors({ search: query });
  setDoctors(result.doctors);
}, 500);

// Cache frequently accessed data
import AsyncStorage from '@react-native-async-storage/async-storage';

const getCachedDoctors = async () => {
  const cached = await AsyncStorage.getItem('doctors_cache');
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    // Cache valid for 5 minutes
    if (Date.now() - timestamp < 5 * 60 * 1000) {
      return data;
    }
  }
  
  const result = await getDoctors();
  await AsyncStorage.setItem('doctors_cache', JSON.stringify({
    data: result.doctors,
    timestamp: Date.now()
  }));
  return result.doctors;
};
```

### 3. User Experience

✅ **Loading States:**
```javascript
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

const loadDoctors = async () => {
  setLoading(true);
  setError(null);
  
  try {
    const result = await getDoctors();
    if (result.success) {
      setDoctors(result.doctors);
    } else {
      setError(result.message);
    }
  } catch (err) {
    setError('Failed to load doctors');
  } finally {
    setLoading(false);
  }
};
```

✅ **Offline Support:**
```javascript
import NetInfo from '@react-native-community/netinfo';

const checkConnection = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    Alert.alert('No Internet', 'Please check your connection');
    return false;
  }
  return true;
};

// Use before API calls
const bookAppointment = async (data) => {
  if (!(await checkConnection())) return;
  
  // Proceed with API call
  const result = await API.post('/patients/appointments', data);
  return result;
};
```

### 4. Data Validation

```javascript
// utils/validators.js
export const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const validatePhone = (phone) => {
  const regex = /^\+?[1-9]\d{9,14}$/;
  return regex.test(phone);
};

export const validatePassword = (password) => {
  // Min 8 chars, 1 uppercase, 1 lowercase, 1 number
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};

// Usage in form
const validateForm = () => {
  if (!validateEmail(email)) {
    setError('Invalid email address');
    return false;
  }
  if (!validatePassword(password)) {
    setError('Password must be at least 8 characters with uppercase, lowercase, and number');
    return false;
  }
  return true;
};
```

---

## Testing

### 1. Test Credentials

**Patient Account:**
- Email: `patient@test.com`
- Password: `Test123`

**Available Test Doctors:**
- Dr. Nandita Agarwal (General Physician)
- Dr. Rajesh Sharma (Cardiologist)
- Dr. Priya Patel (Neurologist)

### 2. Testing Endpoints

```javascript
// __tests__/api/auth.test.js
import { loginPatient, registerPatient } from '../services/auth';

describe('Authentication', () => {
  test('should login successfully with valid credentials', async () => {
    const result = await loginPatient('patient@test.com', 'Test123');
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
  });

  test('should fail login with invalid credentials', async () => {
    const result = await loginPatient('wrong@email.com', 'wrongpass');
    expect(result.success).toBe(false);
  });
});
```

### 3. Manual Testing Checklist

- [ ] Patient can register with valid data
- [ ] Patient can login with registered credentials
- [ ] Token is stored in AsyncStorage
- [ ] Authenticated requests include token header
- [ ] 401 responses clear token and redirect to login
- [ ] Patient can view doctors list
- [ ] Patient can view doctor details
- [ ] Patient can book appointment
- [ ] Patient can view their appointments
- [ ] Patient can cancel appointment
- [ ] Patient can view/update profile
- [ ] Patient can logout successfully

---

## Support & Resources

### API Documentation
- Base URL: `https://app.mediqzy.com/api`
- Swagger Docs: `https://app.mediqzy.com/api-docs` (Coming Soon)

### Contact
- Email: support@mediczy.com
- Developer Portal: Coming Soon

### Version History
- **v1.0** (Jan 2026) - Initial mobile API release

---

## Appendix

### Complete Example: Login Screen

```javascript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { loginPatient } from '../services/auth';
import { validateEmail, validatePassword } from '../utils/validators';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      const result = await loginPatient(email.trim(), password);
      
      if (result.success) {
        navigation.replace('Home');
      } else {
        Alert.alert('Login Failed', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Mediczy</Text>
        <Text style={styles.subtitle}>Login to continue</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          {errors.email && (
            <Text style={styles.errorText}>{errors.email}</Text>
          )}
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, errors.password && styles.inputError]}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          {errors.password && (
            <Text style={styles.errorText}>{errors.password}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Register')}
          disabled={loading}
        >
          <Text style={styles.linkText}>
            Don't have an account? Sign Up
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ff3b30',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
  },
});

export default LoginScreen;
```

---

**End of Documentation**

For questions or support, contact: support@mediczy.com
