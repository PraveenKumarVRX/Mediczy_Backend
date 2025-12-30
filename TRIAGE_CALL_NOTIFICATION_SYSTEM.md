# WhatsApp-Style Triage Call Notification System

## Overview
Real-time notification system for emergency triage video calls between patients and doctors.

## Backend Implementation ✅

### 1. Socket.IO Setup
- **File**: `server/chat/chathandler.controller.js`
- **Exports**:
  - `getIO()` - Get Socket.IO instance
  - `getOnlineUsers()` - Get currently connected users
  - `emitTriageCallRequest(doctorId, callData)` - Send call notification to doctor

### 2. Triage Call Events
**Server → Doctor:**
- `triage-call-request` - Incoming call from patient
  ```json
  {
    "appointmentId": 123,
    "roomId": "triage_abc123_timestamp",
    "patientId": 45,
    "patientName": "John Doe",
    "patientPhone": "+91xxxxxxxxxx",
    "symptoms": "chest pain",
    "urgencyLevel": "HIGH",
    "joinUrl": "https://video.mediqzy.com/join/...",
    "timestamp": "2025-12-29T...",
    "status": "pending"
  }
  ```

**Server → Patient:**
- `triage-call-accepted` - Doctor accepted the call
  ```json
  {
    "appointmentId": 123,
    "doctorName": "Dr. Nandita Agarwal",
    "roomId": "triage_abc123_timestamp",
    "timestamp": "2025-12-29T..."
  }
  ```

- `triage-call-rejected` - Doctor rejected/unavailable
  ```json
  {
    "appointmentId": 123,
    "reason": "Doctor is unavailable",
    "timestamp": "2025-12-29T..."
  }
  ```

### 3. API Endpoints

#### POST `/api/medical-ai/instant-triage-call`
- **Auth**: User token required
- **Body**: `{ doctorId?, symptoms, urgencyLevel, triageId }`
- **Action**: Creates appointment + emits socket notification to doctor
- **Response**: Patient video call details

#### POST `/api/doctors/triage/accept-call`
- **Auth**: Doctor token required
- **Body**: `{ appointmentId }`
- **Action**: Updates appointment status + notifies patient via socket
- **Response**: Appointment details with room ID

#### POST `/api/doctors/triage/reject-call`
- **Auth**: Doctor token required
- **Body**: `{ appointmentId, reason? }`
- **Action**: Cancels appointment + notifies patient via socket
- **Response**: Success message

## Frontend Implementation Needed

### Doctor Dashboard (DoctorTriage.tsx)

1. **Connect to Socket.IO**
   ```typescript
   import { io } from 'socket.io-client';
   
   useEffect(() => {
     const socket = io(API_URL);
     socket.emit('user-connect', {
       userId: doctor.id,
       userType: 'doctor'
     });
     
     socket.on('triage-call-request', (callData) => {
       // Show incoming call UI
       setIncomingCall(callData);
       // Play notification sound
       playCallSound();
     });
     
     return () => socket.disconnect();
   }, []);
   ```

2. **Incoming Call UI Component**
   - WhatsApp-style fullscreen overlay
   - Patient name, photo, symptoms
   - Accept (green) / Reject (red) buttons
   - Ringing animation
   - Auto-timeout after 30 seconds

3. **Accept Call Handler**
   ```typescript
   const handleAcceptCall = async () => {
     await api.post('/doctors/triage/accept-call', {
       appointmentId: incomingCall.appointmentId
     });
     // Join video room
     window.open(incomingCall.joinUrl, '_blank');
     setIncomingCall(null);
   };
   ```

4. **Reject Call Handler**
   ```typescript
   const handleRejectCall = async (reason = 'Busy') => {
     await api.post('/doctors/triage/reject-call', {
       appointmentId: incomingCall.appointmentId,
       reason
     });
     setIncomingCall(null);
   };
   ```

### Patient Emergency Page (Emergency.tsx)

1. **Connect to Socket.IO**
   ```typescript
   useEffect(() => {
     const socket = io(API_URL);
     socket.emit('user-connect', {
       userId: user.id,
       userType: 'user'
     });
     
     socket.on('triage-call-accepted', (data) => {
       // Doctor accepted - show success + auto-join
       toast.success(`${data.doctorName} accepted your call!`);
       setShowEmbeddedVideoCall(true);
     });
     
     socket.on('triage-call-rejected', (data) => {
       // Doctor rejected - show error
       toast.error(data.reason);
       setVideoCallInfo(null);
     });
     
     return () => socket.disconnect();
   }, []);
   ```

2. **Waiting for Doctor UI**
   - Show after clicking "Connect Now"
   - Animated "Connecting to doctor..."
   - Cancel button
   - Timeout after 60 seconds

## UI/UX Flow

### Patient Side:
1. Click "Connect to Online Doctor"
2. See "Connecting to Dr. Nandita Agarwal..." (animated)
3. Wait for doctor to accept (max 60s)
4. On accept → Auto-join video call
5. On reject → Show "Doctor unavailable, try again"

### Doctor Side:
1. Receive incoming call notification (sound + vibration)
2. See fullscreen overlay with patient details
3. Click Accept → Join video room
4. Click Reject → Call ends, patient notified

## Next Steps

1. ✅ Backend Socket.IO setup - DONE
2. ✅ Backend API endpoints - DONE
3. 🔲 Frontend: Add Socket.IO client to Doctor Dashboard
4. 🔲 Frontend: Create IncomingCallNotification component
5. 🔲 Frontend: Add call sounds (ringtone)
6. 🔲 Frontend: Patient waiting UI
7. 🔲 Frontend: Handle accept/reject responses

## Testing

1. Login as Dr. Nandita (doctor@mediczy.com)
2. Open Emergency page as user
3. Click "Connect Now"
4. Doctor should see incoming call popup
5. Doctor accepts → both join video room

## Files Modified

### Backend:
- `server/chat/chathandler.controller.js` - Socket.IO exports
- `server/routes/medical-ai.route.js` - Emit call requests
- `server/routes/doctor.route.js` - Accept/reject endpoints

### Frontend (To Do):
- `client/src/pages/doctor/DoctorTriage.tsx` - Add socket + incoming call UI
- `client/src/pages/Emergency.tsx` - Add socket listeners
- `client/src/components/IncomingCallNotification.tsx` - New component
