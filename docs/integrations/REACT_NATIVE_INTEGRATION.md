# React Native Mobile App Integration Guide

## Overview
This guide explains how to connect a React Native mobile app to the Mediczy backend API.

## Backend API Details

### Base URL
```javascript
const API_BASE_URL = 'https://api.mediczy.com'; // Production
// or
const API_BASE_URL = 'http://13.234.17.52:8000'; // Current server
// or
const API_BASE_URL = 'http://localhost:8000'; // Development
```

## Authentication Flow

### 1. User Registration
```javascript
// POST /api/users/register
const registerUser = async (userData) => {
  const response = await fetch(`${API_BASE_URL}/api/users/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      password: userData.password,
      phone: userData.phone,
    }),
  });
  
  const data = await response.json();
  return data; // Returns { success: true, token, user }
};
```

### 2. User Login
```javascript
// POST /api/users/login
const loginUser = async (credentials) => {
  const response = await fetch(`${API_BASE_URL}/api/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store token securely
    await AsyncStorage.setItem('userToken', data.token);
    await AsyncStorage.setItem('userData', JSON.stringify(data.user));
  }
  
  return data;
};
```

### 3. Doctor Login
```javascript
// POST /api/doctors/login
const loginDoctor = async (credentials) => {
  const response = await fetch(`${API_BASE_URL}/api/doctors/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    await AsyncStorage.setItem('doctorToken', data.token);
    await AsyncStorage.setItem('doctorData', JSON.stringify(data.doctor));
  }
  
  return data;
};
```

## API Client Setup

### Create API Utility (api.js)

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://13.234.17.52:8000';

// API client with automatic token attachment
const apiClient = async (endpoint, options = {}) => {
  // Get token from storage
  const token = await AsyncStorage.getItem('userToken') || 
                await AsyncStorage.getItem('doctorToken') ||
                await AsyncStorage.getItem('adminToken');
  
  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add authorization if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    const data = await response.json();
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Clear tokens and redirect to login
      await AsyncStorage.multiRemove(['userToken', 'userData', 'doctorToken', 'doctorData']);
      // Navigate to login screen
      throw new Error('Session expired. Please login again.');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export default apiClient;
```

## Core API Endpoints

### User Endpoints
```javascript
import apiClient from './api';

// Get user profile
export const getUserProfile = () => apiClient('/api/users/profile', { method: 'GET' });

// Update user profile
export const updateUserProfile = (userData) => 
  apiClient('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify(userData),
  });

// Get user appointments
export const getUserAppointments = () => 
  apiClient('/api/appointments', { method: 'GET' });
```

### Doctor Endpoints
```javascript
// Get list of doctors
export const getDoctors = (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return apiClient(`/api/doctors?${params}`, { method: 'GET' });
};

// Get doctor details
export const getDoctorById = (doctorId) => 
  apiClient(`/api/doctors/${doctorId}`, { method: 'GET' });

// Book appointment
export const bookAppointment = (appointmentData) => 
  apiClient('/api/appointments', {
    method: 'POST',
    body: JSON.stringify(appointmentData),
  });
```

### Health Tracking Endpoints
```javascript
// Google Fit integration
export const syncGoogleFit = (fitData) => 
  apiClient('/api/fitness/store', {
    method: 'POST',
    body: JSON.stringify(fitData),
  });

// Apple Health integration
export const syncAppleHealth = (healthData) => 
  apiClient('/api/apple-health/sync', {
    method: 'POST',
    body: JSON.stringify(healthData),
  });

// Get fitness summary
export const getFitnessSummary = (days = 7) => 
  apiClient(`/api/fitness/summary?days=${days}`, { method: 'GET' });
```

### AI Consultation
```javascript
// Get AI medical consultation
export const getAIConsultation = (symptomData) => 
  apiClient('/api/ai-doctor/consult', {
    method: 'POST',
    body: JSON.stringify(symptomData),
  });

// Medical AI orchestrator
export const consultOrchestrator = (query, language = 'en') => 
  apiClient('/api/medical-ai/orchestrator/consult', {
    method: 'POST',
    body: JSON.stringify({ query, language }),
  });
```

## React Native Implementation Example

### 1. Install Required Packages

```bash
npm install @react-native-async-storage/async-storage
npm install react-navigation
npm install axios # Optional alternative to fetch
```

### 2. Auth Context Provider

```javascript
// contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  // Check for existing token on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('userToken');
      const storedUser = await AsyncStorage.getItem('userData');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    try {
      const data = await apiClient('/api/users/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      if (data.success) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      }

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userData']);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

### 3. Login Screen Example

```javascript
// screens/LoginScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await login({ email, password });
      
      if (result.success) {
        navigation.replace('Home');
      } else {
        setError(result.message || 'Login failed');
      }
    } catch (err) {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mediczy</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      {loading ? (
        <ActivityIndicator size="large" color="#4F46E5" />
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}
      
      <Text 
        style={styles.link} 
        onPress={() => navigation.navigate('Register')}
      >
        Don't have an account? Register
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
    textAlign: 'center',
    color: '#4F46E5',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
    fontSize: 16,
  },
  error: {
    color: 'red',
    marginBottom: 16,
    textAlign: 'center',
  },
  link: {
    marginTop: 20,
    color: '#4F46E5',
    textAlign: 'center',
  },
});

export default LoginScreen;
```

## Mobile-Specific Considerations

### 1. Push Notifications (Firebase)
```javascript
// The backend already has FCM integration
export const registerPushToken = async (fcmToken) => {
  await apiClient('/api/fcm/register', {
    method: 'POST',
    body: JSON.stringify({ fcmToken }),
  });
};
```

### 2. Health Data Integration

#### iOS - Apple HealthKit
```javascript
import AppleHealthKit from 'react-native-health';

// Request permissions
const permissions = {
  permissions: {
    read: ['Height', 'Weight', 'StepCount', 'HeartRate'],
    write: [],
  },
};

AppleHealthKit.initHealthKit(permissions, async (err) => {
  if (err) {
    console.log('Error initializing HealthKit:', err);
    return;
  }
  
  // Fetch health data
  const options = { startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() };
  
  AppleHealthKit.getStepCount(options, async (err, results) => {
    if (!err) {
      // Sync to backend
      await apiClient('/api/apple-health/sync', {
        method: 'POST',
        body: JSON.stringify({
          dataType: 'steps',
          value: results.value,
          startDate: results.startDate,
          endDate: results.endDate,
        }),
      });
    }
  });
});
```

#### Android - Google Fit
```javascript
import GoogleFit from 'react-native-google-fit';

// Initialize Google Fit
const options = {
  scopes: [
    Scopes.FITNESS_ACTIVITY_READ,
    Scopes.FITNESS_BODY_READ,
  ],
};

GoogleFit.authorize(options)
  .then(async (authResult) => {
    if (authResult.success) {
      // Get daily steps
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      GoogleFit.getDailyStepCountSamples({ startDate, endDate })
        .then(async (steps) => {
          // Sync to backend
          await apiClient('/api/fitness/store', {
            method: 'POST',
            body: JSON.stringify({
              steps: steps[0]?.steps,
              date: new Date().toISOString(),
            }),
          });
        });
    }
  })
  .catch((err) => console.warn(err));
```

### 3. Video Consultation (Agora)
```javascript
// The backend already has Agora integration
import { RtcEngine } from 'react-native-agora';

const startVideoCall = async (appointmentId) => {
  // Get token from backend
  const { token, channelName } = await apiClient(
    `/api/video/token?appointmentId=${appointmentId}`,
    { method: 'GET' }
  );
  
  // Initialize Agora
  const engine = await RtcEngine.create('YOUR_AGORA_APP_ID');
  await engine.joinChannel(token, channelName, null, 0);
};
```

## Environment Configuration

### .env file
```bash
API_BASE_URL=http://13.234.17.52:8000
AGORA_APP_ID=your_agora_app_id
GOOGLE_MAPS_API_KEY=AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4
```

## Testing Endpoints

Test your integration with these curl commands:

```bash
# Test user registration
curl -X POST http://13.234.17.52:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","password":"Test@123","phone":"9876543210"}'

# Test user login
curl -X POST http://13.234.17.52:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123"}'

# Test authenticated request
curl -X GET http://13.234.17.52:8000/api/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Security Best Practices

1. **Store tokens securely** - Use AsyncStorage or Keychain (iOS) / Keystore (Android)
2. **Handle token expiration** - Implement token refresh logic
3. **Validate SSL certificates** - Ensure HTTPS in production
4. **Implement biometric authentication** - Use TouchID/FaceID for sensitive operations
5. **Clear sensitive data on logout** - Remove all tokens and user data

## Available Backend Features

Your Mediczy backend already supports:

✅ User authentication (JWT)
✅ Doctor authentication
✅ Admin/Team/Nurse/Assistant authentication
✅ Appointment booking
✅ AI medical consultation
✅ Health tracking (Google Fit + Apple Health)
✅ Prescription management
✅ Video consultations (Agora)
✅ Push notifications (FCM)
✅ Insurance management
✅ Corporate wellness
✅ Emergency services
✅ Device management (wearables)
✅ Real-time chat
✅ File uploads

All endpoints are documented and ready for mobile integration!

## Next Steps

1. Create your React Native project: `npx react-native init MediczyApp`
2. Install dependencies
3. Implement the API client utility
4. Create authentication screens
5. Build feature-specific screens
6. Test with backend endpoints
7. Deploy to App Store / Play Store

Need help with specific features? Let me know!
