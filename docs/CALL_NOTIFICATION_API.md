# Call Notification API Documentation

## Overview

FCM-based call notification system for doctor-to-patient video/voice calls on mobile app. When a doctor initiates a call, the patient receives a native call notification with ringtone, vibration, and full-screen incoming call UI.

## Base URL

```
Production: https://app.mediqzy.com/api/call-notification
Local: http://localhost:8000/api/call-notification
```

## Authentication

All endpoints require JWT authentication with doctor role.

Headers:

```
Authorization: Bearer <doctor_jwt_token>
Content-Type: application/json
```

---

## Endpoints

### 1. Send Call Notification to Patient

**Endpoint:** `POST /doctor-to-patient`

**Description:** Sends an FCM push notification to patient's mobile app that appears as an incoming call notification with answer/decline buttons.

**Request Body:**

```json
{
  "patientId": 123,
  "appointmentId": 456,
  "callType": "video", // or "voice"
  "meetingLink": "https://meet.mediqzy.com/room/abc123", // Optional
  "roomId": "abc123" // Optional
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Call notification sent to patient",
  "results": {
    "sentCount": 2,
    "failedCount": 0,
    "notifications": [
      {
        "deviceType": "android",
        "success": true,
        "messageId": "projects/mediczy/messages/0:1234567890"
      },
      {
        "deviceType": "ios",
        "success": true,
        "messageId": "projects/mediczy/messages/0:9876543210"
      }
    ]
  },
  "callData": {
    "doctorName": "Dr. Nandita Agarwal",
    "patientId": 123,
    "appointmentId": 456,
    "callType": "video",
    "timestamp": "2026-02-04T05:30:00.000Z"
  }
}
```

**Error Responses:**

400 - Missing required fields:

```json
{
  "success": false,
  "message": "Missing required fields: patientId and appointmentId are required"
}
```

404 - Patient FCM token not found:

```json
{
  "success": false,
  "message": "Patient FCM token not found. Patient may not have push notifications enabled."
}
```

404 - Doctor not found:

```json
{
  "success": false,
  "message": "Doctor not found"
}
```

**Mobile App Notification Format:**

The patient's mobile app will receive a high-priority FCM message with:

- **Title:** "📞 Dr. Nandita Agarwal is calling"
- **Body:** "Your doctor has started the video consultation. Tap to join now!"
- **Priority:** HIGH (bypasses battery optimization)
- **Sound:** call_ringtone (custom ringtone)
- **Vibration:** [200, 100, 200, 100, 200, 100, 200]
- **Full-screen intent:** Shows incoming call UI even when phone is locked
- **Actions:** Answer, Decline buttons
- **Category:** CALL
- **Channel:** mediczy_calls (must be created in mobile app)

**Data Payload:**

```json
{
  "type": "video_call",
  "appointmentId": "456",
  "meetingLink": "https://meet.mediqzy.com/room/abc123",
  "doctorName": "Dr. Nandita Agarwal",
  "doctorId": "70",
  "doctorSpecialization": "General Physician",
  "doctorProfilePic": "https://...",
  "callType": "video",
  "roomId": "abc123",
  "callInitiatedAt": "2026-02-04T05:30:00.000Z",
  "clickAction": "join_video_call"
}
```

---

### 2. End Call Notification

**Endpoint:** `POST /end-call`

**Description:** Marks the call notification as ended and updates in-app notification status.

**Request Body:**

```json
{
  "patientId": 123,
  "appointmentId": 456,
  "duration": 1800 // Optional: call duration in seconds
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Call ended notification processed"
}
```

---

### 3. Check Patient Notification Status

**Endpoint:** `GET /patient/:patientId/status`

**Description:** Check if a patient can receive call notifications (has FCM token registered).

**URL Parameters:**

- `patientId` - Patient's user ID

**Success Response (200):**

```json
{
  "success": true,
  "canReceiveCallNotifications": true,
  "devices": [
    {
      "type": "android",
      "lastUpdated": "2026-02-04T05:00:00.000Z"
    },
    {
      "type": "ios",
      "lastUpdated": "2026-02-03T12:30:00.000Z"
    }
  ]
}
```

**Use Case:** Call this endpoint before initiating a call to check if patient can receive call notifications. If `canReceiveCallNotifications` is false, consider using alternative notification methods (SMS, email).

---

## Mobile App Integration Guide

### Android (Flutter)

#### 1. Create Notification Channel

```dart
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

Future<void> createCallNotificationChannel() async {
  const AndroidNotificationChannel channel = AndroidNotificationChannel(
    'mediczy_calls',
    'Incoming Calls',
    description: 'Call notifications from your doctor',
    importance: Importance.max,
    playSound: true,
    sound: RawResourceAndroidNotificationSound('call_ringtone'),
    enableVibration: true,
    vibrationPattern: Int64List.fromList([0, 200, 100, 200, 100, 200, 100, 200]),
    showBadge: true,
  );

  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);
}
```

#### 2. Handle Incoming Call Notification

```dart
import 'package:firebase_messaging/firebase_messaging.dart';

FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  if (message.data['type'] == 'video_call') {
    _showIncomingCallScreen(
      doctorName: message.data['doctorName'],
      doctorProfilePic: message.data['doctorProfilePic'],
      meetingLink: message.data['meetingLink'],
      appointmentId: message.data['appointmentId'],
      onAnswer: () => _joinCall(message.data['meetingLink']),
      onDecline: () => _declineCall(message.data['appointmentId']),
    );
  }
});

// Background/terminated handler
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (message.data['type'] == 'video_call') {
    // Show full-screen incoming call activity
    await _showFullScreenIncomingCall(message.data);
  }
}
```

#### 3. Full-Screen Incoming Call UI

```dart
import 'package:flutter/material.dart';

class IncomingCallScreen extends StatelessWidget {
  final String doctorName;
  final String doctorProfilePic;
  final String meetingLink;
  final VoidCallback onAnswer;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.blue.shade900,
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            // Doctor profile
            CircleAvatar(
              radius: 80,
              backgroundImage: NetworkImage(doctorProfilePic),
            ),
            Text(
              doctorName,
              style: TextStyle(color: Colors.white, fontSize: 28),
            ),
            Text(
              'Incoming Video Call',
              style: TextStyle(color: Colors.white70, fontSize: 18),
            ),

            // Answer/Decline buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                FloatingActionButton.extended(
                  onPressed: onDecline,
                  backgroundColor: Colors.red,
                  icon: Icon(Icons.call_end),
                  label: Text('Decline'),
                ),
                FloatingActionButton.extended(
                  onPressed: onAnswer,
                  backgroundColor: Colors.green,
                  icon: Icon(Icons.videocam),
                  label: Text('Answer'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
```

### iOS (Flutter)

#### 1. Configure APNs Capabilities

Add to `ios/Runner/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>remote-notification</string>
  <string>voip</string>
</array>
```

#### 2. Request Notification Permissions

```dart
FirebaseMessaging messaging = FirebaseMessaging.instance;

NotificationSettings settings = await messaging.requestPermission(
  alert: true,
  announcement: false,
  badge: true,
  carPlay: false,
  criticalAlert: true,  // For call notifications
  provisional: false,
  sound: true,
);

if (settings.authorizationStatus == AuthorizationStatus.authorized) {
  print('User granted permission');
}
```

---

## Testing

### Test with cURL

```bash
# Get doctor JWT token first
DOCTOR_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Send call notification
curl -X POST https://app.mediqzy.com/api/call-notification/doctor-to-patient \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 123,
    "appointmentId": 456,
    "callType": "video",
    "meetingLink": "https://meet.mediqzy.com/room/test123",
    "roomId": "test123"
  }'

# Check patient notification status
curl -X GET https://app.mediqzy.com/api/call-notification/patient/123/status \
  -H "Authorization: Bearer $DOCTOR_TOKEN"

# End call
curl -X POST https://app.mediqzy.com/api/call-notification/end-call \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 123,
    "appointmentId": 456,
    "duration": 1800
  }'
```

### Test with Postman

1. **Login as Doctor:**
   - POST `/api/doctors/login`
   - Body: `{ "email": "doctor@mediczy.com", "password": "Doctor123" }`
   - Copy the `token` from response

2. **Send Call Notification:**
   - POST `/api/call-notification/doctor-to-patient`
   - Headers: `Authorization: Bearer <token>`
   - Body: See request body format above

3. **Verify on Mobile:**
   - Patient's mobile app should show incoming call notification
   - Test answer/decline functionality

---

## Database Schema

The API creates an in-app notification record:

```sql
INSERT INTO notifications (
  user_id,
  user_type,
  type,
  title,
  message,
  data,
  is_read,
  created_at
) VALUES (
  <patientId>,
  'patient',
  'call_incoming',
  'Dr. Nandita Agarwal is calling',
  'Video call from Dr. Nandita Agarwal',
  '{"appointmentId":"456","doctorId":"70",...}',
  false,
  NOW()
);
```

---

## Error Handling

### Common Issues

1. **Patient has no FCM token:**
   - Patient hasn't enabled push notifications
   - Patient hasn't logged into mobile app
   - Solution: Prompt patient to enable notifications

2. **FCM token expired:**
   - Token is invalid or revoked
   - Solution: Patient needs to re-login to mobile app

3. **Notification not received:**
   - Check patient's notification settings
   - Verify Firebase project configuration
   - Check network connectivity

### Debugging

Enable verbose logging:

```javascript
// In mobile app
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
  print('FCM Token refreshed: $newToken');
  // Send new token to server
});
```

---

## Best Practices

1. **Always check patient notification status** before initiating call
2. **Provide fallback** if FCM notification fails (SMS, email, in-app)
3. **Clean up ended calls** to prevent notification buildup
4. **Test on multiple devices** (Android/iOS, different OS versions)
5. **Monitor notification delivery rates** and retry failed notifications
6. **Handle token refresh** on mobile app side

---

## Security

- Doctor JWT must have valid `role: 'doctor'`
- Patient ID is validated against database
- FCM tokens are encrypted in database
- Call data is sanitized before sending
- Rate limiting applied to prevent spam

---

## Support

For issues or questions:

- Email: support@mediqzy.com
- Documentation: https://docs.mediqzy.com/call-notifications
- GitHub: https://github.com/MySmartHealth/Mediczy
