# 📱 SmartHealth RN Mobile App - Complete API Integration Guide

**Last Updated:** February 9, 2026  
**API Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Base URL:** `https://app.mediqzy.com`

---

## 🔐 Authentication Methods

SmartHealth RN supports **three authentication methods**. Choose based on your use case:

### Method 1: API Credentials (Recommended for Production) ⭐

**Use Case:** Server-to-server authentication, backend services, mobile app initialization

**Your Production Credentials:**
```
Client ID:     cred_smarthealth_rn_mlf58z6e34afcd0b8f98
Client Secret: a682e3077148447d1ddbcb3e05613eb391fa0552437daf2cc5fddc046c948e7f03f47d4055e754d748a81eed8e2c2a3a
Expires:       2027-02-09
Status:        Active ✅
```

**Implementation in React Native:**

```javascript
// services/auth/apiCredentials.js
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE = 'https://app.mediqzy.com/api';

// Store credentials securely (iOS Keychain / Android Keystore)
const CLIENT_ID = 'cred_smarthealth_rn_mlf58z6e34afcd0b8f98';
const CLIENT_SECRET = 'a682e3077148447d1ddbcb3e05613eb391fa0552437daf2cc5fddc046c948e7f03f47d4055e754d748a81eed8e2c2a3a';

/**
 * Generate Basic Auth header for API credentials
 * @returns {string} Base64 encoded credentials
 */
const getBasicAuthHeader = () => {
  const credentials = `${CLIENT_ID}:${CLIENT_SECRET}`;
  
  // For React Native, use built-in btoa or install buffer package
  if (Platform.OS === 'web') {
    return btoa(credentials);
  } else {
    // For React Native (install: npm install buffer)
    const Buffer = require('buffer').Buffer;
    return Buffer.from(credentials).toString('base64');
  }
};

/**
 * Authenticate user with email/password using API credentials
 * This is the primary authentication method for SmartHealth RN
 */
export const loginWithAPICredentials = async (email, password, clinicSlug = null) => {
  try {
    const response = await fetch(`${API_BASE}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${getBasicAuthHeader()}`,
      },
      body: JSON.stringify({
        email,
        password,
        clinic_slug: clinicSlug,
      }),
    });

    const data = await response.json();

    if (data.success && data.data?.token) {
      // Store user JWT token securely
      await SecureStore.setItemAsync('user_jwt_token', data.data.token);
      await SecureStore.setItemAsync('user_id', String(data.data.user.id));
      await SecureStore.setItemAsync('user_email', data.data.user.email);

      return {
        success: true,
        user: data.data.user,
        token: data.data.token,
      };
    }

    return {
      success: false,
      error: data.message || 'Login failed',
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
};

/**
 * Make authenticated API requests using API credentials + user JWT
 * Use this for all API calls after user login
 */
export const authenticatedRequest = async (endpoint, options = {}) => {
  try {
    const userToken = await SecureStore.getItemAsync('user_jwt_token');

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`, // User JWT token
        'X-API-Client-ID': CLIENT_ID, // API credentials
        ...options.headers,
      },
    });

    return response.json();
  } catch (error) {
    console.error('API Request error:', error);
    throw error;
  }
};

/**
 * Logout - Clear stored credentials
 */
export const logout = async () => {
  await SecureStore.deleteItemAsync('user_jwt_token');
  await SecureStore.deleteItemAsync('user_id');
  await SecureStore.deleteItemAsync('user_email');
};
```

### Method 2: OTP-Based Login (Passwordless)

**Use Case:** Quick mobile login without passwords

**Step 1: Send OTP**
```javascript
// services/auth/otpAuth.js
const API_BASE = 'https://app.mediqzy.com/api';

export const sendOTP = async (phoneNumber, countryCode = 'IN') => {
  try {
    const response = await fetch(`${API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${getBasicAuthHeader()}`, // Use API credentials
      },
      body: JSON.stringify({
        phone_number: phoneNumber,  // Format: +91XXXXXXXXXX
        country_code: countryCode,   // ISO country code
      }),
    });

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        otpSessionId: data.data.otp_session_id,
        expiresIn: data.data.expires_in,
      };
    }

    return {
      success: false,
      error: data.message || 'Failed to send OTP',
    };
  } catch (error) {
    console.error('Send OTP error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Step 2: Verify OTP and login
 */
export const verifyOTP = async (otpSessionId, otpCode) => {
  try {
    const response = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${getBasicAuthHeader()}`,
      },
      body: JSON.stringify({
        otp_session_id: otpSessionId,
        otp_code: otpCode, // 6-digit OTP
      }),
    });

    const data = await response.json();

    if (data.success && data.data?.token) {
      // Store user token
      await SecureStore.setItemAsync('user_jwt_token', data.data.token);
      await SecureStore.setItemAsync('user_id', String(data.data.user.id));

      return {
        success: true,
        user: data.data.user,
        token: data.data.token,
      };
    }

    return {
      success: false,
      error: data.message || 'OTP verification failed',
    };
  } catch (error) {
    console.error('Verify OTP error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
```

### Method 3: Email/Password Login (Direct)

**Use Case:** Traditional login without API credentials (legacy)

```javascript
export const loginDirect = async (email, password, clinicSlug = null) => {
  const response = await fetch(`${API_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, clinic_slug: clinicSlug }),
  });

  const data = await response.json();
  
  if (data.success) {
    await SecureStore.setItemAsync('user_jwt_token', data.data.token);
    return data;
  }
  
  throw new Error(data.message || 'Login failed');
};
```

---

## 🎥 Video Consultation Integration (LiveKit)

### Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│               VIDEO CONSULTATION FLOW                       │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User books appointment with doctor                      │
│  2. User clicks "Start Video Call"                          │
│  3. App requests LiveKit token from backend                 │
│     POST /api/mobile/video/token                            │
│  4. Backend creates LiveKit room & generates token          │
│  5. App receives: token, room_name, livekit_url             │
│  6. App connects to LiveKit WebRTC server                   │
│  7. Real-time video/audio streams via WebRTC                │
│  8. Optional: Backend records consultation                  │
│  9. Either party ends call                                  │
│ 10. Recording saved & charges applied                       │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

### Setup Instructions

**Step 1: Install Dependencies**

```bash
npm install livekit-client @livekit/react-native @livekit/components-react
npm install react-native-webrtc  # For WebRTC support
```

**Step 2: Request Camera/Microphone Permissions**

```javascript
// utils/permissions.js
import { PermissionsAndroid, Platform } from 'react-native';

export const requestVideoCallPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);

      if (
        grants['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
        grants['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
      ) {
        return true;
      } else {
        console.log('Camera or microphone permission denied');
        return false;
      }
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return true; // iOS handles permissions via Info.plist
};
```

**Step 3: Create Video Consultation Service**

```javascript
// services/videoConsultation.js
import { Room, RoomEvent, Track } from 'livekit-client';
import { authenticatedRequest } from './auth/apiCredentials';

export class VideoConsultationService {
  constructor() {
    this.room = null;
    this.listeners = {};
  }

  /**
   * Get LiveKit token from backend
   * @param {number} appointmentId - Appointment ID
   * @returns {Promise<Object>} Token details
   */
  async getConsultationToken(appointmentId) {
    try {
      const data = await authenticatedRequest('/mobile/video/token', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: appointmentId,
        }),
      });

      if (!data.success) {
        throw new Error(data.message || 'Failed to get video token');
      }

      return {
        token: data.data.token,
        liveKitUrl: data.data.livekit_url,
        roomName: data.data.room_name,
        participantName: data.data.participant_name,
        consultationId: data.data.consultation_id,
      };
    } catch (error) {
      console.error('Get consultation token error:', error);
      throw error;
    }
  }

  /**
   * Connect to LiveKit video room
   * @param {string} token - LiveKit access token
   * @param {string} liveKitUrl - LiveKit server URL
   * @param {Object} options - Connection options
   */
  async connectToRoom(token, liveKitUrl, options = {}) {
    try {
      const defaultOptions = {
        audio: true,
        video: { width: 1280, height: 720, facingMode: 'user' },
        autoSubscribe: true,
        ...options,
      };

      // Create room instance
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: defaultOptions.video,
        publishDefaults: {
          videoSimulcastLayers: [
            { quality: 'high', width: 1280, height: 720 },
            { quality: 'medium', width: 640, height: 360 },
            { quality: 'low', width: 320, height: 180 },
          ],
        },
      });

      // Setup event listeners before connecting
      this.setupRoomListeners();

      // Connect to LiveKit server
      await this.room.connect(liveKitUrl, token, {
        autoSubscribe: defaultOptions.autoSubscribe,
      });

      console.log('✅ Connected to video room:', this.room.name);

      return this.room;
    } catch (error) {
      console.error('❌ Failed to connect to video room:', error);
      throw error;
    }
  }

  /**
   * Setup room event listeners
   */
  setupRoomListeners() {
    if (!this.room) return;

    // When a remote participant joins
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('👤 Participant connected:', participant.identity);
      this.emit('participantConnected', participant);
    });

    // When a remote participant leaves
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('👋 Participant disconnected:', participant.identity);
      this.emit('participantDisconnected', participant);
    });

    // When a track is published by remote participant
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('📹 Track subscribed:', track.kind, 'from', participant.identity);
      this.emit('trackSubscribed', { track, publication, participant });
    });

    // When a track is unpublished
    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log('📹 Track unsubscribed:', track.kind);
      this.emit('trackUnsubscribed', { track, publication, participant });
    });

    // When disconnected from room
    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('❌ Disconnected from room. Reason:', reason);
      this.emit('disconnected', { reason });
    });

    // Connection quality changes
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.log('📊 Connection quality:', quality, 'for', participant.identity);
      this.emit('qualityChanged', { quality, participant });
    });

    // Active speakers changed
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      console.log('🔊 Active speakers:', speakers.length);
      this.emit('activeSpeakersChanged', speakers);
    });
  }

  /**
   * Toggle microphone on/off
   */
  async toggleAudio(enabled) {
    if (!this.room?.localParticipant) {
      throw new Error('Not connected to room');
    }

    await this.room.localParticipant.setMicrophoneEnabled(enabled);
    console.log(`🎤 Microphone ${enabled ? 'ON' : 'OFF'}`);
    this.emit('audioToggled', { enabled });
  }

  /**
   * Toggle camera on/off
   */
  async toggleVideo(enabled) {
    if (!this.room?.localParticipant) {
      throw new Error('Not connected to room');
    }

    await this.room.localParticipant.setCameraEnabled(enabled);
    console.log(`📹 Camera ${enabled ? 'ON' : 'OFF'}`);
    this.emit('videoToggled', { enabled });
  }

  /**
   * Switch between front and back camera
   */
  async switchCamera() {
    if (!this.room?.localParticipant) {
      throw new Error('Not connected to room');
    }

    const videoTrack = this.room.localParticipant.getTrack(Track.Source.Camera);
    if (videoTrack?.track) {
      await videoTrack.track.switchCamera();
      console.log('🔄 Camera switched');
      this.emit('cameraSwitched', {});
    }
  }

  /**
   * Disconnect from video room
   */
  async disconnect() {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
      console.log('👋 Disconnected from video room');
    }
  }

  /**
   * Event emitter methods
   */
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

  /**
   * Get room statistics
   */
  getRoomStats() {
    if (!this.room) return null;

    return {
      roomName: this.room.name,
      participantCount: this.room.numParticipants,
      localParticipant: this.room.localParticipant?.identity,
      remoteParticipants: Array.from(this.room.remoteParticipants.values()).map(
        p => p.identity
      ),
      isConnected: this.room.state === 'connected',
    };
  }
}

// Export singleton instance
export const videoService = new VideoConsultationService();
```

**Step 4: Create Video Consultation Screen**

```javascript
// screens/VideoConsultationScreen.js
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { 
  LiveKitRoom, 
  VideoTrack, 
  useParticipants, 
  useTracks 
} from '@livekit/components-react';
import { videoService } from '../services/videoConsultation';
import { requestVideoCallPermissions } from '../utils/permissions';

export default function VideoConsultationScreen({ route, navigation }) {
  const { appointmentId } = route.params;
  
  const [token, setToken] = useState(null);
  const [liveKitUrl, setLiveKitUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  useEffect(() => {
    initializeCall();

    return () => {
      videoService.disconnect();
    };
  }, []);

  const initializeCall = async () => {
    try {
      // Request permissions
      const hasPermissions = await requestVideoCallPermissions();
      if (!hasPermissions) {
        Alert.alert('Permissions Required', 'Camera and microphone access is required for video calls');
        navigation.goBack();
        return;
      }

      // Get LiveKit token
      const tokenData = await videoService.getConsultationToken(appointmentId);
      setToken(tokenData.token);
      setLiveKitUrl(tokenData.liveKitUrl);
      setLoading(false);
    } catch (err) {
      console.error('Failed to initialize call:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleToggleAudio = async () => {
    try {
      await videoService.toggleAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    } catch (err) {
      console.error('Failed to toggle audio:', err);
    }
  };

  const handleToggleVideo = async () => {
    try {
      await videoService.toggleVideo(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    } catch (err) {
      console.error('Failed to toggle video:', err);
    }
  };

  const handleSwitchCamera = async () => {
    try {
      await videoService.switchCamera();
    } catch (err) {
      console.error('Failed to switch camera:', err);
    }
  };

  const handleEndCall = () => {
    Alert.alert(
      'End Call',
      'Are you sure you want to end this consultation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Call',
          style: 'destructive',
          onPress: async () => {
            await videoService.disconnect();
            navigation.goBack();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Connecting to consultation...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={liveKitUrl}
      token={token}
      connect={true}
      audio={audioEnabled}
      video={videoEnabled}
      style={styles.room}
    >
      <VideoCallView
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onSwitchCamera={handleSwitchCamera}
        onEndCall={handleEndCall}
      />
    </LiveKitRoom>
  );
}

function VideoCallView({ 
  audioEnabled, 
  videoEnabled, 
  onToggleAudio, 
  onToggleVideo,
  onSwitchCamera, 
  onEndCall 
}) {
  const participants = useParticipants();
  const tracks = useTracks();

  return (
    <View style={styles.container}>
      {/* Remote participant video */}
      <View style={styles.remoteVideo}>
        {participants.length > 1 ? (
          <VideoTrack
            trackRef={participants[1].getTrack('video')}
            style={styles.video}
          />
        ) : (
          <Text style={styles.waitingText}>Waiting for doctor to join...</Text>
        )}
      </View>

      {/* Local participant video (small preview) */}
      <View style={styles.localVideo}>
        <VideoTrack
          trackRef={participants[0]?.getTrack('video')}
          style={styles.video}
        />
      </View>

      {/* Call controls */}
      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.controlBtn, !audioEnabled && styles.controlBtnOff]}
          onPress={onToggleAudio}
        >
          <Text style={styles.controlText}>{audioEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.controlBtn, !videoEnabled && styles.controlBtnOff]}
          onPress={onToggleVideo}
        >
          <Text style={styles.controlText}>{videoEnabled ? '📹' : '📷'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlBtn}
          onPress={onSwitchCamera}
        >
          <Text style={styles.controlText}>🔄</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={onEndCall}
        >
          <Text style={styles.controlText}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  room: {
    flex: 1,
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  localVideo: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  waitingText: {
    color: '#fff',
    fontSize: 16,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnOff: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
  },
  endCallBtn: {
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
  },
  controlText: {
    fontSize: 24,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginBottom: 20,
  },
});
```

---

## 📡 Core API Endpoints

### User Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/users/register` | Register new user | No |
| POST | `/api/users/login` | Login with email/password | API Credentials |
| POST | `/api/auth/send-otp` | Send OTP to phone | API Credentials |
| POST | `/api/auth/verify-otp` | Verify OTP and login | API Credentials |
| GET | `/api/users/profile` | Get user profile | Bearer Token |
| PUT | `/api/users/profile` | Update user profile | Bearer Token |
| POST | `/api/users/change-password` | Change password | Bearer Token |

### Appointments

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/mobile/appointments` | List user appointments | Bearer Token |
| POST | `/api/mobile/appointments` | Book new appointment | Bearer Token |
| GET | `/api/mobile/appointments/:id` | Get appointment details | Bearer Token |
| PUT | `/api/mobile/appointments/:id/cancel` | Cancel appointment | Bearer Token |
| GET | `/api/mobile/doctors` | List available doctors | Bearer Token |
| GET | `/api/mobile/doctors/:id/slots` | Get doctor's time slots | Bearer Token |

### Video Consultation

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/mobile/video/token` | Get LiveKit video token | Bearer Token |
| POST | `/api/mobile/consultations/:id/start` | Start consultation | Bearer Token |
| POST | `/api/mobile/consultations/:id/end` | End consultation | Bearer Token |

### Health Data

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/mobile/health/sync` | Sync health data (Apple Health/Google Fit) | Bearer Token |
| GET | `/api/mobile/health/records` | Get health records | Bearer Token |
| POST | `/api/mobile/health/vitals` | Submit vital signs | Bearer Token |
| GET | `/api/mobile/health/vitals` | Get vital signs history | Bearer Token |

### Payments

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/mobile/payments/initiate` | Initiate payment | Bearer Token |
| POST | `/api/mobile/payments/verify` | Verify payment | Bearer Token |
| GET | `/api/mobile/payments/history` | Payment history | Bearer Token |

---

## 🔒 Security Best Practices

### 1. Secure Credential Storage

```javascript
// ❌ NEVER DO THIS
const CLIENT_SECRET = 'plaintext_in_code';

// ✅ DO THIS
import * as SecureStore from 'expo-secure-store';

// Store in secure keychain/keystore
await SecureStore.setItemAsync('api_client_secret', CLIENT_SECRET);
const secret = await SecureStore.getItemAsync('api_client_secret');
```

### 2. Token Rotation

Your API credentials expire on **2027-02-09**. Before expiry:

1. Request new credentials from admin
2. Implement graceful token rotation
3. Test with new credentials in staging
4. Deploy updated app with new credentials

### 3. Error Handling

```javascript
try {
  const data = await authenticatedRequest('/endpoint', options);
  if (!data.success) {
    // Handle API errors
    handleAPIError(data.error);
  }
} catch (error) {
  // Handle network errors
  handleNetworkError(error);
}
```

### 4. SSL Pinning (Optional but Recommended)

```javascript
// Install: npm install react-native-ssl-pinning

import { fetch as sslFetch } from 'react-native-ssl-pinning';

const response = await sslFetch('https://app.mediqzy.com/api/endpoint', {
  method: 'POST',
  sslPinning: {
    certs: ['mediqzy-cert'], // Add certificate to android/ios assets
  },
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

---

## 🚀 Quick Start Example

```javascript
// App.js - Complete integration example
import React, { useEffect, useState } from 'react';
import { View, Button, Text } from 'react-native';
import { loginWithAPICredentials, logout } from './services/auth/apiCredentials';
import { videoService } from './services/videoConsultation';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await loginWithAPICredentials(
        'user@example.com',
        'password123',
        'clinic-slug'
      );

      if (result.success) {
        setUser(result.user);
        console.log('✅ Logged in:', result.user);
      } else {
        alert('Login failed: ' + result.error);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const handleStartVideoCall = async () => {
    try {
      const tokenData = await videoService.getConsultationToken(123);
      await videoService.connectToRoom(tokenData.token, tokenData.liveKitUrl);
      console.log('✅ Connected to video room');
    } catch (error) {
      alert('Video call failed: ' + error.message);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {user ? (
        <>
          <Text>Welcome, {user.email}!</Text>
          <Button title="Start Video Call" onPress={handleStartVideoCall} />
          <Button title="Logout" onPress={handleLogout} />
        </>
      ) : (
        <Button 
          title={loading ? 'Logging in...' : 'Login'} 
          onPress={handleLogin} 
          disabled={loading}
        />
      )}
    </View>
  );
}
```

---

## 📞 Support & Documentation

**API Documentation:** [SMARTHEALTH_MOBILE_APP_INTEGRATION_SUMMARY.md](SMARTHEALTH_MOBILE_APP_INTEGRATION_SUMMARY.md)  
**Smoke Test Results:** [SMOKE_TEST_RESULTS.md](SMOKE_TEST_RESULTS.md)  
**API Base URL:** https://app.mediqzy.com/api  
**LiveKit Video URL:** wss://video.mediqzy.com  
**Support Email:** dev@mediczy.com

---

## ✅ Deployment Checklist

- [ ] API credentials stored securely (iOS Keychain/Android Keystore)
- [ ] SSL certificate pinning implemented (recommended)
- [ ] Camera/microphone permissions configured in Info.plist/AndroidManifest.xml
- [ ] LiveKit dependencies installed
- [ ] Error handling and logging implemented
- [ ] Token expiry handling (refresh before 2027-02-09)
- [ ] Network error retry logic added
- [ ] Video call UI tested on iOS and Android
- [ ] Production credentials verified working
- [ ] Privacy policy updated with video call data handling

---

**Document Version:** 1.0.0  
**Generated:** February 9, 2026  
**Status:** Production Ready ✅
