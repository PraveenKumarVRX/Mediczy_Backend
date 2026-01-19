# 📹 Teleconsultation Process Analysis

## 🔍 Current Implementation Status

### ❌ MISSING: Doctor-Initiated Video Call with Patient Notification

**Your Required Process:**
1. ✅ Doctor initiates video call
2. ❌ **Patient receives notification to join meeting as a call**
3. ✅ Patient joins the call

---

## 📊 What Currently Exists

### 1. **Patient-Initiated Consultation** ✅

**Flow:**
```
Patient books appointment → Pays → Gets meeting link → Both join at scheduled time
```

**Implementation:**
- File: [server/routes/online-consultation.route.js](server/routes/online-consultation.route.js#L900-L1000)
- Endpoint: `GET /api/consultation/video/join/:appointmentId`
- Process:
  1. Patient books and pays for appointment
  2. Meeting link generated automatically after payment
  3. Both doctor and patient can join 15 minutes before appointment
  4. No real-time "call notification" - both access via meeting link

**Code:**
```javascript
// Lines 748-759
const meetingId = `MEDCALL-${appointment.id}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const meetingLink = `${process.env.MIROTALK_URL || 'https://video.mediczy.com'}/join/${meetingId}`;

await appointment.update({
  status: 'confirmed',
  paymentStatus: 'paid',
  meetingId,
  meetingLink,
});
```

### 2. **Emergency Triage (Doctor Accepts Incoming Call)** ✅

**Flow:**
```
Patient requests emergency → Doctor receives notification → Doctor accepts → Both join
```

**Implementation:**
- File: [server/routes/medical-ai.route.js](server/routes/medical-ai.route.js#L492)
- File: [client/src/pages/doctor/DoctorTriage.tsx](client/src/pages/doctor/DoctorTriage.tsx#L464)
- Process:
  1. **Patient initiates** emergency triage call
  2. Doctor receives push notification via FCM
  3. Doctor clicks "Accept Call"
  4. Both join video room

**Code:**
```javascript
// Server: Send notification to doctor
await notificationService.send({
  userId: doctor.id,
  userType: 'doctor',
  type: 'triage_call',
  variables: { 
    patientName, 
    symptoms, 
    urgencyLevel, 
    joinUrl: doctorJoinUrl 
  },
  channels: ['push', 'in-app']
});
```

### 3. **Chat-Based Video Call** ✅

**Flow:**
```
Chat session active → Either party clicks video icon → Other gets socket notification → Both join
```

**Implementation:**
- File: [client/src/pages/chat/VideoChatdoctor.tsx](client/src/pages/chat/VideoChatdoctor.tsx#L328)
- File: [client/src/pages/chat/VideoChat.tsx](client/src/pages/chat/VideoChat.tsx#L314)
- Process:
  1. During active chat session
  2. Doctor/Patient clicks "Start Video Call" button
  3. Socket.io emits `video-call-invitation` event
  4. Recipient gets real-time notification
  5. Both join MiroTalk room

**Code:**
```javascript
// Lines 396-405
socket.emit("video-call-invitation", {
  channelName,
  callerId: currentId,
  callerName: `Dr. ${currentDoctor.firstName} ${currentDoctor.lastName}`,
  recipientId: selectedRecipient._id
});
```

---

## ❌ What's MISSING

### **Doctor-Initiated Call for Scheduled Appointment**

**Required Flow:**
```
Doctor clicks "Start Consultation" → 
Patient receives PUSH notification "Dr. X is calling" → 
Patient clicks "Join Call" → 
Both enter video room
```

**What's Missing:**
1. ❌ **API endpoint**: `POST /api/doctors/appointments/:id/initiate-call`
2. ❌ **Push notification** to patient when doctor starts call
3. ❌ **Frontend**: "Join Call Now" notification banner/popup for patient
4. ❌ **Database field**: `callInitiatedAt`, `callInitiatedBy`

---

## 🛠️ Required Implementation

### 1. **Backend API Endpoint**

**File:** `server/routes/doctor.route.js` or `server/routes/online-consultation.route.js`

```javascript
/**
 * @route   POST /api/doctors/appointments/:appointmentId/initiate-call
 * @desc    Doctor initiates video call, notifies patient
 * @access  Private (Doctor only)
 */
router.post('/appointments/:appointmentId/initiate-call', authDoctor, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const doctorId = req.doctor.id;

    // Get appointment
    const appointment = await Appointment.findOne({
      where: { id: appointmentId, doctorId },
      include: [
        { model: User, as: 'patient' },
        { model: Doctor, as: 'doctor' }
      ]
    });

    if (!appointment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appointment not found' 
      });
    }

    // Check if paid and confirmed
    if (appointment.paymentStatus !== 'paid' || appointment.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Appointment must be confirmed and paid'
      });
    }

    // Generate/get meeting link
    let meetingLink = appointment.meetingLink;
    let meetingId = appointment.meetingId;

    if (!meetingLink) {
      meetingId = `MEDCALL-${appointment.id}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      meetingLink = `${process.env.MIROTALK_URL || 'https://video.mediczy.com'}/join/${meetingId}`;
      
      await appointment.update({ meetingId, meetingLink });
    }

    // Update status
    await appointment.update({
      status: 'in-progress',
      callInitiatedBy: 'doctor',
      callInitiatedAt: new Date()
    });

    // Send PUSH notification to patient
    await notificationService.send({
      userId: appointment.userId,
      userType: 'patient',
      type: 'doctor_calling',
      title: `📞 Dr. ${appointment.doctor.firstName} is calling`,
      message: `Your doctor has started the video consultation. Tap to join now!`,
      variables: {
        doctorName: `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        appointmentId: appointment.id,
        meetingLink
      },
      data: { 
        appointmentId: appointment.id, 
        meetingLink,
        action: 'join_call'
      },
      actionUrl: meetingLink,
      channels: ['push', 'in-app', 'socket'], // Real-time via socket
      priority: 'critical' // High priority for immediate delivery
    });

    // Emit socket event for instant notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${appointment.userId}`).emit('doctor-initiated-call', {
        appointmentId: appointment.id,
        doctorName: `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        meetingLink,
        callInitiatedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Call initiated successfully. Patient has been notified.',
      video: {
        meetingLink,
        meetingId,
        platform: 'MiroTalk'
      },
      appointment: {
        id: appointment.id,
        status: 'in-progress',
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`
      }
    });

  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate call',
      error: error.message
    });
  }
});
```

### 2. **Database Migration**

**File:** `server/migrations/add-call-initiation-fields.js`

```javascript
export const up = async ({ context: sequelize }) => {
  const queryInterface = sequelize.getQueryInterface();
  
  await queryInterface.addColumn('appointments', 'callInitiatedBy', {
    type: DataTypes.ENUM('doctor', 'patient'),
    allowNull: true
  });

  await queryInterface.addColumn('appointments', 'callInitiatedAt', {
    type: DataTypes.DATE,
    allowNull: true
  });
};

export const down = async ({ context: sequelize }) => {
  const queryInterface = sequelize.getQueryInterface();
  
  await queryInterface.removeColumn('appointments', 'callInitiatedAt');
  await queryInterface.removeColumn('appointments', 'callInitiatedBy');
};
```

### 3. **Frontend: Doctor Side**

**File:** `client/src/pages/doctor/DoctorVideoConsultation.tsx`

```tsx
const initiateVideoCall = async (appointment: Appointment) => {
  try {
    // Call API to initiate and notify patient
    const response = await api.post(
      `/doctors/appointments/${appointment.id}/initiate-call`
    );

    toast({
      title: "📞 Calling Patient",
      description: `${appointment.patientName} has been notified. Waiting for them to join...`,
    });

    // Open video in new window/iframe
    const meetingUrl = response.data.video.meetingLink;
    window.open(meetingUrl, '_blank');

  } catch (error) {
    toast({
      variant: "destructive",
      title: "Failed to initiate call",
      description: error.response?.data?.message || "Please try again",
    });
  }
};
```

**UI Button:**
```tsx
<Button
  onClick={() => initiateVideoCall(consultation)}
  className="gap-2 bg-teal-600 hover:bg-teal-700"
>
  <Phone className="h-4 w-4" />
  Start Consultation
</Button>
```

### 4. **Frontend: Patient Side**

**File:** `client/src/components/IncomingCallNotification.tsx` (NEW)

```tsx
import { Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IncomingCallProps {
  doctorName: string;
  appointmentId: number;
  meetingLink: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallNotification({ 
  doctorName, 
  meetingLink, 
  onAccept, 
  onReject 
}: IncomingCallProps) {
  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black/80 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        {/* Doctor Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-teal-100 flex items-center justify-center">
            <Phone className="w-12 h-12 text-teal-600 animate-pulse" />
          </div>
          
          <div className="text-center">
            <h2 className="text-2xl font-bold">{doctorName}</h2>
            <p className="text-slate-600 mt-1">is calling...</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6 w-full">
            <Button
              onClick={onReject}
              variant="outline"
              className="flex-1 h-14 rounded-full"
            >
              <PhoneOff className="w-5 h-5 mr-2" />
              Decline
            </Button>
            <Button
              onClick={onAccept}
              className="flex-1 h-14 rounded-full bg-green-600 hover:bg-green-700"
            >
              <Phone className="w-5 h-5 mr-2" />
              Join Call
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**File:** `client/src/pages/patient/MyAppointments.tsx`

```tsx
// Add socket listener
useEffect(() => {
  if (!socket) return;

  socket.on('doctor-initiated-call', (data) => {
    setIncomingCall({
      appointmentId: data.appointmentId,
      doctorName: data.doctorName,
      meetingLink: data.meetingLink,
      callInitiatedAt: data.callInitiatedAt
    });

    // Show notification
    toast({
      title: "📞 Incoming Call",
      description: `${data.doctorName} is calling you`,
      duration: 10000,
    });
  });

  return () => {
    socket.off('doctor-initiated-call');
  };
}, [socket]);

// Render incoming call UI
{incomingCall && (
  <IncomingCallNotification
    doctorName={incomingCall.doctorName}
    appointmentId={incomingCall.appointmentId}
    meetingLink={incomingCall.meetingLink}
    onAccept={() => {
      window.open(incomingCall.meetingLink, '_blank');
      setIncomingCall(null);
    }}
    onReject={() => {
      setIncomingCall(null);
      toast({ title: "Call declined" });
    }}
  />
)}
```

### 5. **Notification Service Update**

**File:** `server/services/notification.service.js`

Add new notification type:

```javascript
// Notification templates
const templates = {
  // ... existing templates ...
  
  doctor_calling: {
    title: '📞 Dr. {doctorName} is calling',
    message: 'Your doctor has started the video consultation. Tap to join now!',
    priority: 'critical',
    sound: 'call_ringtone',
    requireInteraction: true,
    buttons: [
      { title: 'Join Call', action: 'join_call' },
      { title: 'Decline', action: 'decline_call' }
    ]
  }
};
```

### 6. **FCM Push Notification**

**File:** `server/utils/firebase-admin.js`

```javascript
const sendDoctorCallingNotification = async (recipientToken, callData) => {
  const notification = {
    title: `📞 Dr. ${callData.doctorName} is calling`,
    body: 'Your doctor has started the video consultation',
    icon: '/doctor-calling-icon.png',
    requireInteraction: true,
    category: 'CALL',
    sound: 'call_ringtone.mp3'
  };

  const data = {
    type: 'DOCTOR_CALLING',
    appointmentId: String(callData.appointmentId),
    meetingLink: callData.meetingLink,
    doctorName: callData.doctorName,
    clickAction: 'join_call'
  };

  return sendPushNotification(recipientToken, notification, data);
};
```

---

## 📋 Implementation Checklist

### Backend
- [ ] Create `POST /api/doctors/appointments/:id/initiate-call` endpoint
- [ ] Add migration for `callInitiatedBy` and `callInitiatedAt` fields
- [ ] Update Appointment model with new fields
- [ ] Add `doctor_calling` notification template
- [ ] Implement FCM push notification for incoming call
- [ ] Add socket.io event `doctor-initiated-call`

### Frontend (Doctor)
- [ ] Add "Start Consultation" button in doctor dashboard
- [ ] Implement `initiateVideoCall()` function
- [ ] Show "Waiting for patient..." status after initiating

### Frontend (Patient)
- [ ] Create `IncomingCallNotification` component
- [ ] Add socket listener for `doctor-initiated-call`
- [ ] Show fullscreen incoming call UI
- [ ] Implement "Join Call" and "Decline" actions
- [ ] Handle FCM push notification tap

### Testing
- [ ] Test doctor initiates call
- [ ] Test patient receives notification (web + mobile)
- [ ] Test patient joins call
- [ ] Test patient declines call
- [ ] Test when patient is offline (FCM push)
- [ ] Test when patient is online (socket.io)

---

## 🔄 Process Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DOCTOR SIDE                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ 1. Doctor clicks
                           │    "Start Consultation"
                           ▼
        ┌──────────────────────────────────────┐
        │ POST /doctors/appointments/:id/      │
        │      initiate-call                   │
        └──────────────────────────────────────┘
                           │
                           │ 2. Create/get meeting link
                           │    Update appointment status
                           ▼
        ┌──────────────────────────────────────┐
        │  Send Notification to Patient        │
        │  - FCM Push (if app closed)          │
        │  - Socket.io (if app open)           │
        │  - In-app notification               │
        └──────────────────────────────────────┘
                           │
                           │ 3. Notification sent
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    PATIENT SIDE                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ 4. Patient receives notification
                           ▼
        ┌──────────────────────────────────────┐
        │  Fullscreen Incoming Call UI         │
        │  "Dr. X is calling..."               │
        │  [Decline] [Join Call]               │
        └──────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
              Decline        Join Call
                    │             │
                    ▼             ▼
              Close UI    Open meeting link
                              (MiroTalk)
                                  │
                                  ▼
                          ┌──────────────┐
                          │ Video Call   │
                          │ Doctor ↔ Patient│
                          └──────────────┘
```

---

## 💡 Summary

### ✅ What Exists:
1. **Scheduled appointments** with pre-generated meeting links
2. **Emergency triage** where patient calls, doctor accepts
3. **Chat-based video calls** during active chat sessions

### ❌ What's Missing:
1. **Doctor-initiated call** for scheduled appointments
2. **Real-time push notification** to patient ("Dr. X is calling")
3. **Incoming call UI** for patient to accept/decline
4. **Socket.io integration** for instant notification delivery

### 🎯 Recommendation:

**Implement the missing doctor-initiated call flow** to match your requirement. This involves:
- Backend API endpoint for doctor to initiate call
- Push notification + socket.io for real-time patient notification
- Fullscreen "incoming call" UI on patient side
- Database fields to track call initiation

---

**Estimated Development Time:** 6-8 hours
**Priority:** High (Core teleconsultation feature)

