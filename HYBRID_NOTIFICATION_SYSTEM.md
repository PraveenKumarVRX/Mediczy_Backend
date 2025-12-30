# Hybrid Notification System (Socket.IO + Firebase)

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Notification Flow                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Patient → Server → [ Socket.IO + FCM ] → Doctor        │
│                            ↓                             │
│                     Hybrid Delivery:                     │
│                     • Socket.IO (instant, <100ms)       │
│                     • Firebase FCM (backup, 1-3s)       │
│                                                          │
│  Doctor → Server → [ Socket.IO + FCM ] → Patient        │
└─────────────────────────────────────────────────────────┘
```

## 📲 How It Works

### Web App (Current)
- **Active connection**: Socket.IO only (instant)
- **Background**: Browser notifications via Socket.IO

### Mobile App (React Native / Flutter)
- **App open**: Socket.IO (instant)
- **App background**: FCM push notification (wakes app)
- **App closed**: FCM push notification (launches app)

### Hybrid Strategy
1. **Always send Socket.IO** (if user online)
2. **Always send FCM** (as backup for mobile)
3. **Patient/Doctor receives via fastest channel**

## 🔧 Backend Implementation ✅

### Files Modified

1. **`server/chat/chathandler.controller.js`**
   - Tracks FCM tokens: `userFCMTokens Map`
   - Hybrid functions:
     - `emitTriageCallRequest()` - Socket + FCM
     - `emitCallAccepted()` - Socket + FCM
     - `emitCallRejected()` - Socket + FCM

2. **`server/utils/firebase-admin.js`**
   - `sendTriageCallNotification()` - Emergency call to doctor
   - `sendCallAcceptedNotification()` - Doctor accepted
   - `sendCallRejectedNotification()` - Doctor rejected

3. **`server/routes/doctor.route.js`**
   - Updated `/accept-call` endpoint (hybrid)
   - Updated `/reject-call` endpoint (hybrid)

## 📱 Frontend Integration

### Web App (React/TypeScript)

```typescript
import { io } from 'socket.io-client';

// Connect to Socket.IO
const socket = io(process.env.REACT_APP_API_URL);

// Web doesn't need FCM token, Socket.IO is enough
socket.emit('user-connect', {
  userId: user.id,
  userType: 'user', // or 'doctor'
  // fcmToken: null for web
});

// Listen for events
socket.on('triage-call-request', (callData) => {
  // Show incoming call UI
  showIncomingCallNotification(callData);
});

socket.on('triage-call-accepted', (acceptData) => {
  // Doctor accepted - join video
  window.location.href = acceptData.joinUrl;
});

socket.on('triage-call-rejected', (rejectData) => {
  // Doctor rejected - show message
  toast.error(rejectData.reason);
});
```

### Mobile App (React Native)

#### 1. Install Dependencies

```bash
npm install socket.io-client @react-native-firebase/app @react-native-firebase/messaging
```

#### 2. Firebase Setup

**Android**: Download `google-services.json` from Firebase Console
**iOS**: Download `GoogleService-Info.plist` from Firebase Console

#### 3. Request FCM Token

```typescript
import messaging from '@react-native-firebase/messaging';
import { io } from 'socket.io-client';

// Request permission (iOS)
const requestUserPermission = async () => {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
  }
};

// Get FCM token
const getFCMToken = async () => {
  try {
    const fcmToken = await messaging().getToken();
    console.log('FCM Token:', fcmToken);
    return fcmToken;
  } catch (error) {
    console.error('Failed to get FCM token:', error);
    return null;
  }
};

// Connect to Socket.IO with FCM token
const connectSocket = async (userId, userType) => {
  const fcmToken = await getFCMToken();
  
  const socket = io(API_URL);
  
  socket.emit('user-connect', {
    userId,
    userType, // 'user' or 'doctor'
    fcmToken // Send FCM token for mobile push
  });
  
  return socket;
};
```

#### 4. Handle Background Notifications

```typescript
import messaging from '@react-native-firebase/messaging';
import { AppState } from 'react-native';

// Background handler (app in background or quit)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('Background message:', remoteMessage);
  
  if (remoteMessage.data.type === 'video_call') {
    // Show incoming call screen
    navigateToIncomingCall(remoteMessage.data);
  }
});

// Foreground handler (app active)
messaging().onMessage(async (remoteMessage) => {
  console.log('Foreground message:', remoteMessage);
  
  // App is active, Socket.IO already handled it
  // This is just a backup
});

// Notification opened app
messaging().onNotificationOpenedApp((remoteMessage) => {
  console.log('Notification opened app:', remoteMessage);
  
  if (remoteMessage.data.clickAction === 'answer_triage_call') {
    // Navigate to video call screen
    navigateToVideoCall(remoteMessage.data.roomId);
  }
});

// Check if app opened from notification (killed state)
messaging()
  .getInitialNotification()
  .then((remoteMessage) => {
    if (remoteMessage) {
      console.log('App opened from notification:', remoteMessage);
      // Handle navigation
    }
  });
```

#### 5. Listen to Socket.IO Events

```typescript
// Doctor app - Incoming call
socket.on('triage-call-request', (callData) => {
  // Show fullscreen incoming call UI
  showIncomingCallScreen({
    patientName: callData.patientName,
    symptoms: callData.symptoms,
    urgencyLevel: callData.urgencyLevel,
    appointmentId: callData.appointmentId,
    onAccept: () => acceptCall(callData.appointmentId),
    onReject: () => rejectCall(callData.appointmentId)
  });
  
  // Play ringtone
  playRingtone();
});

// Patient app - Call accepted
socket.on('triage-call-accepted', (acceptData) => {
  toast.success(`${acceptData.doctorName} accepted your call!`);
  
  // Navigate to video call
  navigation.navigate('VideoCall', {
    roomId: acceptData.roomId,
    appointmentId: acceptData.appointmentId
  });
});

// Patient app - Call rejected
socket.on('triage-call-rejected', (rejectData) => {
  toast.error(rejectData.reason);
  
  // Show retry option
  showRetryDialog();
});
```

#### 6. Accept/Reject Call (Doctor)

```typescript
import axios from 'axios';

// Accept call
const acceptCall = async (appointmentId: number) => {
  try {
    const response = await axios.post(
      `${API_URL}/api/doctors/triage/accept-call`,
      { appointmentId },
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );
    
    console.log('Call accepted:', response.data);
    
    // Navigate to video room
    navigation.navigate('VideoCall', {
      roomId: response.data.appointment.roomId
    });
  } catch (error) {
    console.error('Failed to accept call:', error);
  }
};

// Reject call
const rejectCall = async (appointmentId: number, reason?: string) => {
  try {
    await axios.post(
      `${API_URL}/api/doctors/triage/reject-call`,
      { appointmentId, reason },
      { headers: { Authorization: `Bearer ${doctorToken}` } }
    );
    
    console.log('Call rejected');
    // Close incoming call screen
    closeIncomingCallScreen();
  } catch (error) {
    console.error('Failed to reject call:', error);
  }
};
```

### Mobile App (Flutter)

#### 1. Add Dependencies

```yaml
# pubspec.yaml
dependencies:
  firebase_core: ^2.24.2
  firebase_messaging: ^14.7.9
  socket_io_client: ^2.0.3
```

#### 2. Initialize Firebase

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

// Background handler
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print('Background message: ${message.data}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  // Register background handler
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  
  runApp(MyApp());
}
```

#### 3. Get FCM Token & Connect

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  IO.Socket? socket;
  
  Future<String?> getFCMToken() async {
    try {
      String? token = await _messaging.getToken();
      print('FCM Token: $token');
      return token;
    } catch (e) {
      print('Error getting FCM token: $e');
      return null;
    }
  }
  
  Future<void> connectSocket(int userId, String userType) async {
    String? fcmToken = await getFCMToken();
    
    socket = IO.io('https://api.mediqzy.com', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
    });
    
    socket?.onConnect((_) {
      print('Socket connected');
      socket?.emit('user-connect', {
        'userId': userId,
        'userType': userType,
        'fcmToken': fcmToken
      });
    });
    
    // Listen for triage call requests
    socket?.on('triage-call-request', (data) {
      _handleIncomingCall(data);
    });
    
    socket?.on('triage-call-accepted', (data) {
      _handleCallAccepted(data);
    });
    
    socket?.on('triage-call-rejected', (data) {
      _handleCallRejected(data);
    });
  }
  
  void _handleIncomingCall(dynamic data) {
    // Show incoming call screen
    print('Incoming call: $data');
  }
  
  void _handleCallAccepted(dynamic data) {
    // Navigate to video call
    print('Call accepted: $data');
  }
  
  void _handleCallRejected(dynamic data) {
    // Show rejection message
    print('Call rejected: $data');
  }
}
```

#### 4. Handle Foreground Messages

```dart
// In your main widget
@override
void initState() {
  super.initState();
  
  // Foreground messages
  FirebaseMessaging.onMessage.listen((RemoteMessage message) {
    print('Foreground message: ${message.data}');
    
    if (message.data['type'] == 'video_call') {
      // Socket.IO already handled it
      // This is backup notification
    }
  });
  
  // App opened from background notification
  FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
    print('Message opened app: ${message.data}');
    
    if (message.data['clickAction'] == 'answer_triage_call') {
      // Navigate to video call
      Navigator.pushNamed(context, '/video-call', arguments: {
        'roomId': message.data['roomId']
      });
    }
  });
}
```

## 🔐 Firebase Project Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Name: `mediczy-notifications`
4. Enable Google Analytics (optional)

### 2. Add Android App
1. Click Android icon
2. Package name: `com.mediczy.app`
3. Download `google-services.json`
4. Place in `android/app/`

### 3. Add iOS App
1. Click iOS icon
2. Bundle ID: `com.mediczy.app`
3. Download `GoogleService-Info.plist`
4. Add to Xcode project

### 4. Get Service Account Key
1. Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download JSON file
4. Add to server `.env`:

```bash
FIREBASE_PROJECT_ID=mediczy-notifications
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@mediczy-notifications.iam.gserviceaccount.com
```

## 🧪 Testing

### Test Web (Socket.IO only)
```bash
# Patient connects
curl -X POST http://localhost:5001/api/medical-ai/instant-triage-call \
  -H "Authorization: Bearer <patient_token>" \
  -d '{"symptoms": "chest pain", "urgencyLevel": "HIGH"}'

# Check console logs:
# ✅ Socket.IO notification sent to doctor 70
```

### Test Mobile (Socket.IO + FCM)
1. Doctor logs into mobile app
2. App sends FCM token to server
3. Patient requests triage call
4. Doctor receives:
   - Socket.IO event (if app active)
   - FCM push notification (if app background)

### Verify Notification Delivery
```javascript
// Server logs show:
✅ Socket.IO notification sent to doctor 70
✅ FCM push notification sent to doctor 70
📲 Hybrid notification sent - Socket: true, FCM: true
```

## 📊 Delivery Priority

| Scenario | Delivery Method | Latency |
|----------|----------------|---------|
| Web app active | Socket.IO | <100ms |
| Mobile app active | Socket.IO | <100ms |
| Mobile app background | FCM → Socket.IO | 1-3s |
| Mobile app closed | FCM (wake) → Socket.IO | 1-5s |
| No internet | ❌ Failed | - |

## 🚀 Next Steps

1. ✅ Backend hybrid system - DONE
2. 🔲 Configure Firebase project
3. 🔲 Add FCM to React Native app
4. 🔲 Test push notifications on physical device
5. 🔲 Create incoming call UI (mobile)
6. 🔲 Add call ringtones/vibrations
7. 🔲 Test background/killed state notifications

## 📝 Important Notes

- **Web doesn't need FCM** - Socket.IO is sufficient
- **Mobile needs both** - Socket.IO when active, FCM when background
- **Always send both** - Server sends Socket + FCM for reliability
- **FCM tokens expire** - Mobile app should refresh tokens periodically
- **iOS requires permission** - Request in `requestUserPermission()`
- **Test on physical device** - Push notifications don't work in simulators

## 🎬 User Flow

### Patient Side (Mobile)
1. Opens Emergency page
2. Clicks "Connect to Doctor"
3. Socket.IO sends request (instant)
4. If background: FCM wakes app
5. Waits for doctor response
6. Receives accept/reject via Socket or FCM

### Doctor Side (Mobile)
1. Receives notification (Socket or FCM)
2. App shows fullscreen incoming call
3. Plays ringtone
4. Doctor clicks Accept/Reject
5. API call to server
6. Server notifies patient (Socket + FCM)
7. Both join video room

---

**Implementation Status**: ✅ Backend Complete | 🔲 Mobile App Pending
