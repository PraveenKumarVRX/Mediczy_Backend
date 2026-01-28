# 🚀 Quick Start - Mobile Video Consultation API

Simple guide to get started with video consultation integration in 5 minutes.

---

## 🎯 Complete Flow Example

### 1. User Registration & Login

```bash
# Register new user
curl -X POST https://mediczy.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Rahul",
    "lastName": "Kumar",
    "email": "rahul@example.com",
    "password": "Test@123456",
    "phoneNumber": "+919876543210"
  }'

# Response: Save the token
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 123, ... }
}
```

### 2. Find Available Doctors

```bash
# Get list of doctors for video consultation
curl -X GET "https://mediczy.com/api/consultation/doctors?specialty=Cardiology&sortBy=rating" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "success": true,
  "doctors": [
    {
      "id": 70,
      "name": "Dr. Nandita Agarwal",
      "specialization": "Cardiology",
      "consultationFee": 500,
      "rating": 4.8,
      "isOnline": true
    }
  ]
}
```

### 3. Book Video Consultation

```bash
# Book appointment
curl -X POST https://mediczy.com/api/consultation/book \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": 70,
    "consultationType": "online",
    "appointmentDate": "2026-01-28",
    "appointmentTime": "10:00 AM",
    "symptoms": "Chest pain and shortness of breath",
    "urgency": "URGENT",
    "paymentMethod": "wallet"
  }'

# Response:
{
  "success": true,
  "appointment": {
    "id": 456,
    "appointmentId": "APT-456-2026",
    "roomId": "apt-456",
    "status": "confirmed"
  }
}
```

### 4. Get Video Token & Join Call

```bash
# Get LiveKit token
curl -X POST https://mediczy.com/api/video/livekit/token \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "apt-456",
    "participantName": "Rahul Kumar"
  }'

# Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "serverUrl": "wss://livekit.mediczy.com",
  "roomName": "apt-456"
}

# Join video room
curl -X POST https://mediczy.com/api/video/room/apt-456/join \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentId": 456
  }'
```

### 5. After Consultation - Get Prescription

```bash
# Get prescription for appointment
curl -X GET https://mediczy.com/api/prescriptions/appointment/456 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
{
  "success": true,
  "prescription": {
    "id": 789,
    "prescriptionNumber": "RX-789-2026",
    "diagnosis": "Viral Fever",
    "medications": [...],
    "pdfUrl": "https://mediczy.com/prescriptions/RX-789-2026.pdf"
  }
}

# Download PDF
curl -X GET https://mediczy.com/api/prescriptions/789/pdf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output prescription.pdf
```

---

## 📱 React Native Integration

### Install Dependencies
```bash
npm install @livekit/react-native @livekit/react-native-webrtc socket.io-client axios
```

### VideoConsultation Component
```jsx
import React, { useEffect, useState } from 'react';
import { View, Button, Alert } from 'react-native';
import { LiveKitRoom, AudioSession } from '@livekit/react-native';
import axios from 'axios';
import io from 'socket.io-client';

const API_URL = 'https://mediczy.com/api';

export default function VideoConsultation({ appointment, userToken }) {
  const [videoToken, setVideoToken] = useState(null);
  const [serverUrl, setServerUrl] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Set up Socket.io
    const socketInstance = io('https://mediczy.com', {
      auth: { token: `Bearer ${userToken}` }
    });

    socketInstance.on('doctor-initiated-call', (data) => {
      Alert.alert(
        'Doctor Calling',
        `${data.doctorName} is ready for your consultation`,
        [{ text: 'Join', onPress: () => joinCall() }]
      );
    });

    setSocket(socketInstance);

    return () => socketInstance.disconnect();
  }, []);

  const joinCall = async () => {
    try {
      // Get LiveKit token
      const response = await axios.post(
        `${API_URL}/video/livekit/token`,
        {
          roomName: appointment.roomId,
          participantName: 'Rahul Kumar'
        },
        {
          headers: { Authorization: `Bearer ${userToken}` }
        }
      );

      setVideoToken(response.data.token);
      setServerUrl(response.data.serverUrl);

      // Notify backend that user joined
      await axios.post(
        `${API_URL}/video/room/${appointment.roomId}/join`,
        { appointmentId: appointment.id },
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to join video call');
    }
  };

  const leaveCall = async () => {
    try {
      await axios.post(
        `${API_URL}/video/room/${appointment.roomId}/leave`,
        {},
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      setVideoToken(null);
    } catch (error) {
      console.error('Error leaving call:', error);
    }
  };

  if (!videoToken) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Button title="Join Consultation" onPress={joinCall} />
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={videoToken}
      connect={true}
      options={{
        adaptiveStream: true,
        dynacast: true,
      }}
      audio={true}
      video={true}
      onDisconnected={leaveCall}
    >
      <View style={{ flex: 1 }}>
        {/* Your video UI components here */}
        <Button title="End Call" onPress={leaveCall} color="red" />
      </View>
    </LiveKitRoom>
  );
}
```

### Booking Component
```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import axios from 'axios';

const API_URL = 'https://mediczy.com/api';

export default function BookConsultation({ userToken }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const response = await axios.get(`${API_URL}/consultation/doctors`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      setDoctors(response.data.doctors);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch doctors');
    } finally {
      setLoading(false);
    }
  };

  const bookAppointment = async (doctorId) => {
    try {
      const response = await axios.post(
        `${API_URL}/consultation/book`,
        {
          doctorId,
          consultationType: 'online',
          appointmentDate: '2026-01-28',
          appointmentTime: '10:00 AM',
          symptoms: 'General consultation',
          paymentMethod: 'wallet'
        },
        {
          headers: { Authorization: `Bearer ${userToken}` }
        }
      );

      Alert.alert(
        'Success',
        `Appointment booked! ID: ${response.data.appointment.appointmentId}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Booking failed');
    }
  };

  const renderDoctor = ({ item }) => (
    <TouchableOpacity
      style={{
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee'
      }}
      onPress={() => bookAppointment(item.id)}
    >
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{item.name}</Text>
      <Text style={{ color: '#666' }}>{item.specialization}</Text>
      <Text style={{ marginTop: 5 }}>
        ₹{item.consultationFee} • ⭐ {item.rating}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={doctors}
        renderItem={renderDoctor}
        keyExtractor={(item) => item.id.toString()}
        refreshing={loading}
        onRefresh={fetchDoctors}
      />
    </View>
  );
}
```

---

## 📱 Flutter Integration

### Add Dependencies
```yaml
# pubspec.yaml
dependencies:
  livekit_client: ^2.0.0
  socket_io_client: ^2.0.3
  http: ^1.2.0
```

### Video Call Screen
```dart
import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class VideoConsultationScreen extends StatefulWidget {
  final String appointmentId;
  final String userToken;

  const VideoConsultationScreen({
    required this.appointmentId,
    required this.userToken,
  });

  @override
  _VideoConsultationScreenState createState() =>
      _VideoConsultationScreenState();
}

class _VideoConsultationScreenState extends State<VideoConsultationScreen> {
  Room? _room;
  String? _token;
  String? _serverUrl;

  @override
  void initState() {
    super.initState();
    _getVideoToken();
  }

  Future<void> _getVideoToken() async {
    try {
      final response = await http.post(
        Uri.parse('https://mediczy.com/api/video/livekit/token'),
        headers: {
          'Authorization': 'Bearer ${widget.userToken}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'roomName': 'apt-${widget.appointmentId}',
          'participantName': 'Patient',
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _token = data['token'];
          _serverUrl = data['serverUrl'];
        });
        await _connectToRoom();
      }
    } catch (e) {
      print('Error getting token: $e');
    }
  }

  Future<void> _connectToRoom() async {
    if (_token == null || _serverUrl == null) return;

    try {
      _room = await LiveKitClient.connect(
        _serverUrl!,
        _token!,
        roomOptions: const RoomOptions(
          adaptiveStream: true,
          dynacast: true,
        ),
      );

      setState(() {});

      // Join room in backend
      await http.post(
        Uri.parse('https://mediczy.com/api/video/room/apt-${widget.appointmentId}/join'),
        headers: {
          'Authorization': 'Bearer ${widget.userToken}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'appointmentId': widget.appointmentId,
        }),
      );
    } catch (e) {
      print('Error connecting: $e');
    }
  }

  Future<void> _disconnectRoom() async {
    await _room?.disconnect();
    
    // Leave room in backend
    await http.post(
      Uri.parse('https://mediczy.com/api/video/room/apt-${widget.appointmentId}/leave'),
      headers: {
        'Authorization': 'Bearer ${widget.userToken}',
      },
    );
    
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    if (_room == null) {
      return Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text('Video Consultation')),
      body: Stack(
        children: [
          // Video UI here using livekit_client widgets
          Positioned(
            bottom: 20,
            right: 20,
            child: FloatingActionButton(
              backgroundColor: Colors.red,
              onPressed: _disconnectRoom,
              child: Icon(Icons.call_end),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _room?.disconnect();
    super.dispose();
  }
}
```

---

## 🔔 Push Notifications Setup

### Firebase Cloud Messaging (FCM) Integration

```javascript
// When doctor initiates call, send push notification
POST /api/notifications/send-push
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": 123,
  "title": "Dr. Nandita Agarwal is calling",
  "body": "Tap to join your video consultation",
  "data": {
    "type": "video_call",
    "appointmentId": 456,
    "roomId": "apt-456"
  }
}
```

### React Native Push Handler
```javascript
import messaging from '@react-native-firebase/messaging';

messaging().onMessage(async remoteMessage => {
  if (remoteMessage.data.type === 'video_call') {
    // Show in-app notification
    Alert.alert(
      remoteMessage.notification.title,
      remoteMessage.notification.body,
      [
        {
          text: 'Join',
          onPress: () => {
            navigation.navigate('VideoConsultation', {
              appointmentId: remoteMessage.data.appointmentId
            });
          }
        },
        { text: 'Dismiss' }
      ]
    );
  }
});
```

---

## 🧪 Testing

### Test Account Credentials
```
Email: test_patient@mediczy.com
Password: Test@123456
Phone: +919876543210
```

### Test Doctor
```
Doctor ID: 70
Name: Dr. Nandita Agarwal
Specialty: Cardiology
Fee: ₹500
```

### Postman Collection
Import this collection to test all APIs:
```
https://mediczy.com/api/postman-collection.json
```

---

## 📊 API Rate Limits

| Endpoint Type | Rate Limit |
|--------------|------------|
| Authentication | 10 requests/minute |
| Doctor List | 20 requests/minute |
| Booking | 5 requests/minute |
| Video Token | 10 requests/minute |
| General | 100 requests/minute |

---

## 🆘 Common Issues & Solutions

### Issue: Video not connecting
**Solution:** 
- Check camera/microphone permissions
- Verify LiveKit token is valid
- Ensure appointment is in "confirmed" status

### Issue: Payment failed
**Solution:**
- Check wallet balance: `GET /api/wallet/balance`
- Verify payment method is configured
- Check transaction logs

### Issue: Doctor not available
**Solution:**
- Use availability API to check slots
- Book appointment in advance
- Check doctor's online status

---

## 📞 Support Contacts

- **Technical Support**: dev@mediczy.com
- **API Issues**: api-support@mediczy.com
- **Emergency**: +91-1800-XXX-XXXX

---

## ✅ Pre-launch Checklist

- [ ] Test complete booking flow
- [ ] Test video call on real devices
- [ ] Implement error handling
- [ ] Add push notifications
- [ ] Test wallet payments
- [ ] Verify prescription download
- [ ] Test on different network conditions
- [ ] Add analytics tracking
- [ ] Implement offline mode
- [ ] Security audit complete
- [ ] Performance testing done
- [ ] User acceptance testing complete

---

**Ready to integrate? Start with the authentication flow and progressively add features!**
