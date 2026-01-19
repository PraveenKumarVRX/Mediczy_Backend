# 📞 Doctor-Initiated Video Call Implementation - COMPLETE

## ✅ Implementation Summary

Successfully implemented a complete doctor-initiated teleconsultation system where:
1. **Doctor initiates video call** from their dashboard
2. **Patient receives real-time notification** to join the meeting
3. **Patient can accept or decline** the incoming call
4. **Automatic call initiation** with patient notification via push, socket.io, and in-app

---

## 🎯 Features Implemented

### 1. Backend Infrastructure

#### Database Migration ✅
- **File**: `server/migrations/add-call-initiation-fields.js`
- **Fields Added**:
  - `callInitiatedBy` (ENUM: 'doctor' | 'patient')
  - `callInitiatedAt` (TIMESTAMP)
  - Index on both fields for performance
- **Status**: Migration executed successfully ✅

#### Appointment Model Update ✅
- **File**: `server/models/postgres/appointment.model.postgres.js`
- Added call tracking fields to schema
- Supports tracking who initiated calls and when

#### API Endpoint ✅
- **Route**: `POST /api/doctors/appointments/:appointmentId/initiate-call`
- **File**: `server/routes/doctor.route.js` (lines 1774-1930)
- **Authentication**: Doctor only (authDoctor middleware)
- **Features**:
  - Validates appointment status
  - Checks payment status
  - Generates/retrieves meeting link
  - Updates appointment status to 'in-progress'
  - Sends push notification to patient
  - Emits socket.io event for real-time notification
  - Returns meeting URL for doctor

#### Notification System ✅
- **File**: `server/services/notification.service.js`
- Added `doctor_calling` template with high priority
- Supports multi-channel delivery (push, in-app, socket)

#### FCM Push Notifications ✅
- **File**: `server/utils/firebase-admin.js`
- Added `sendDoctorCallingNotification()` function
- Includes vibration pattern, custom sound, and action buttons
- Exported for use in notification service

---

### 2. Frontend Implementation

#### Doctor Side ✅

**File**: `client/src/pages/doctor/DoctorVideoConsultation.tsx`

**Changes**:
- Updated `initiateVideoCall()` function to call backend API
- Automatically notifies patient when "Start Call" is clicked
- Opens video window for doctor immediately
- Shows toast confirmation when patient is notified

**Usage**:
```tsx
<Button onClick={() => initiateVideoCall(consultation)}>
  <Video className="h-4 w-4" />
  Start Consultation
</Button>
```

#### Patient Side ✅

**File**: `client/src/components/DoctorCallNotification.tsx` (NEW)

**Features**:
- Full-screen incoming call UI
- Animated pulse ring effect
- Doctor name and appointment details
- Auto-decline countdown timer (60s default)
- Accept/Decline buttons
- Optional ringtone sound

**File**: `client/src/pages/Appointments.tsx`

**Changes**:
- Added Socket.io connection for real-time notifications
- Listens for `doctor-initiated-call` events
- Shows `DoctorCallNotification` component when call comes in
- Accept button opens meeting link in new window
- Decline button dismisses notification

---

## 📋 File Changes Summary

### Backend Files
1. ✅ `server/migrations/add-call-initiation-fields.js` - NEW
2. ✅ `server/models/postgres/appointment.model.postgres.js` - MODIFIED
3. ✅ `server/routes/doctor.route.js` - MODIFIED (added endpoint)
4. ✅ `server/services/notification.service.js` - MODIFIED (added template)
5. ✅ `server/utils/firebase-admin.js` - MODIFIED (added FCM function)

### Frontend Files
1. ✅ `client/src/components/DoctorCallNotification.tsx` - NEW
2. ✅ `client/src/pages/doctor/DoctorVideoConsultation.tsx` - MODIFIED
3. ✅ `client/src/pages/Appointments.tsx` - MODIFIED

### Documentation
1. ✅ `TELECONSULTATION_PROCESS_ANALYSIS.md` - Analysis document
2. ✅ `DOCTOR_INITIATED_CALL_IMPLEMENTATION.md` - This file

---

## 🔄 Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOCTOR SIDE                               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ 1. Doctor clicks "Start Consultation"
                            │    in DoctorVideoConsultation page
                            ▼
          ┌──────────────────────────────────────────┐
          │ POST /doctors/appointments/:id/          │
          │      initiate-call                       │
          │ - Validate appointment                   │
          │ - Check payment status                   │
          │ - Generate meeting link                  │
          │ - Update DB: status='in-progress'        │
          │   callInitiatedBy='doctor'               │
          └──────────────────────────────────────────┘
                            │
                            │ 2. Send notifications
                            ▼
          ┌──────────────────────────────────────────┐
          │  Multi-Channel Notification              │
          │  • FCM Push (if app closed/background)   │
          │  • Socket.io (if app open)               │
          │  • In-app notification                   │
          └──────────────────────────────────────────┘
                            │
                            │ 3. Doctor joins video
                            ▼
          ┌──────────────────────────────────────────┐
          │  Open MiroTalk in new window             │
          │  Doctor waits for patient to join        │
          └──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        PATIENT SIDE                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ 4. Patient receives notification
                            ▼
          ┌──────────────────────────────────────────┐
          │  DoctorCallNotification Component        │
          │  • Full-screen overlay                   │
          │  • "Dr. X is calling..."                 │
          │  • Countdown timer (60s)                 │
          │  • [Decline] [Accept] buttons            │
          └──────────────────────────────────────────┘
                            │
                     ┌──────┴──────┐
                     │             │
               Decline          Accept
                     │             │
                     ▼             ▼
               Close UI      Open meeting link
                             (MiroTalk)
                                   │
                                   ▼
                           ┌───────────────┐
                           │  Video Call   │
                           │  Active       │
                           │  Doctor ↔ Patient
                           └───────────────┘
```

---

## 🧪 Testing Guide

### Backend Testing

**Test 1: API Endpoint**
```bash
# Get a valid appointment ID from database
curl -X POST http://localhost:3000/api/doctors/appointments/123/initiate-call \
  -H "Authorization: Bearer <DOCTOR_TOKEN>" \
  -H "Content-Type: application/json"

# Expected response:
{
  "success": true,
  "message": "Call initiated successfully. Patient has been notified.",
  "video": {
    "meetingLink": "https://video.mediczy.com/join/MEDCALL-123-ABC123",
    "meetingId": "MEDCALL-123-ABC123",
    "platform": "MiroTalk",
    "directJoinUrl": "https://video.mediczy.com/join/MEDCALL-123-ABC123?name=Dr.%20Smith"
  },
  "appointment": {
    "id": 123,
    "status": "in-progress",
    "patientName": "John Doe",
    "callInitiatedBy": "doctor",
    "callInitiatedAt": "2026-01-06T18:00:00.000Z"
  }
}
```

**Test 2: Database Fields**
```sql
SELECT id, "callInitiatedBy", "callInitiatedAt", status 
FROM appointments 
WHERE id = 123;

-- Should show:
-- callInitiatedBy: 'doctor'
-- callInitiatedAt: timestamp
-- status: 'in-progress'
```

**Test 3: Socket.io Event**
```javascript
// In browser console (patient side)
socket.on('doctor-initiated-call', (data) => {
  console.log('Incoming call:', data);
});

// Should receive:
{
  appointmentId: 123,
  doctorName: "Dr. John Smith",
  doctorId: 45,
  meetingLink: "https://video.mediczy.com/join/MEDCALL-123-ABC123",
  callInitiatedAt: "2026-01-06T18:00:00.000Z",
  appointmentDate: "2026-01-07",
  appointmentTime: "10:00"
}
```

### Frontend Testing

**Test 1: Doctor Initiates Call**
1. Login as doctor
2. Go to "Video Consultations" page
3. Click "Start Call" on a confirmed appointment
4. Should see toast: "Patient Notified"
5. Video window should open automatically
6. Meeting link should be generated

**Test 2: Patient Receives Call**
1. Login as patient
2. Stay on "Appointments" page
3. Have doctor initiate call (from Test 1)
4. Should see full-screen incoming call UI
5. Should hear notification sound (if enabled)
6. Countdown timer should show (60s → 0s)

**Test 3: Patient Accepts Call**
1. When incoming call appears
2. Click "Accept" button
3. Should open video window
4. Should join the same room as doctor
5. Incoming call UI should disappear

**Test 4: Patient Declines Call**
1. When incoming call appears
2. Click "Decline" button
3. Incoming call UI should close
4. Should see toast: "Call Declined"

**Test 5: Auto-Decline**
1. When incoming call appears
2. Wait 60 seconds without action
3. Should auto-decline
4. UI should close automatically

---

## 📊 Database Schema

**Appointments Table - New Fields**

```sql
ALTER TABLE appointments 
ADD COLUMN "callInitiatedBy" VARCHAR(10) CHECK ("callInitiatedBy" IN ('doctor', 'patient')),
ADD COLUMN "callInitiatedAt" TIMESTAMP;

CREATE INDEX idx_appointments_call_initiation 
ON appointments ("callInitiatedBy", "callInitiatedAt");
```

**Sample Data**
```sql
INSERT INTO appointments (
  id, "userId", "doctorId", "appointmentDate", "appointmentTime",
  status, "paymentStatus", "consultationType",
  "callInitiatedBy", "callInitiatedAt", "meetingLink"
) VALUES (
  123, 456, 789, '2026-01-07', '10:00',
  'in-progress', 'paid', 'online',
  'doctor', '2026-01-06 18:00:00', 'https://video.mediczy.com/join/MEDCALL-123-ABC123'
);
```

---

## 🔐 Security & Validation

### Backend Validation
✅ Only authenticated doctors can initiate calls
✅ Doctor can only initiate calls for their own appointments
✅ Appointment must be in valid state ('confirmed', 'scheduled', 'accepted')
✅ Payment must be completed for online consultations
✅ Meeting links are randomly generated and unique

### Frontend Validation
✅ Socket.io connection authenticated with JWT token
✅ Only patient for that specific appointment receives notification
✅ Meeting links open in new window (security isolation)
✅ Auto-decline prevents indefinite waiting

---

## 🚀 Deployment Steps

### 1. Database Migration
```bash
cd /home/ubuntu/Mediczy/server
node migrations/add-call-initiation-fields.js
```
✅ **Status**: Completed successfully

### 2. Server Restart
```bash
pm2 restart mediczy-server
pm2 logs mediczy-server
```
✅ **Status**: Server restarted

### 3. Frontend Build (if needed)
```bash
cd /home/ubuntu/Mediczy/client
npm run build
```

### 4. Environment Variables
Ensure these are set:
```bash
MIROTALK_URL=https://video.mediczy.com
SOCKET_URL=http://localhost:3000  # or production URL
JWT_SECRET=<your-secret>
```

---

## 📱 Socket.io Configuration

**Patient Side Connection**
```typescript
const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000', {
  auth: {
    token: localStorage.getItem('token')
  },
  transports: ['websocket', 'polling']
});

socket.on('doctor-initiated-call', (data) => {
  // Show incoming call UI
});
```

**Server Side Emission**
```javascript
const io = req.app.get('io');
io.to(`user_${appointment.userId}`).emit('doctor-initiated-call', {
  appointmentId,
  doctorName,
  meetingLink,
  // ... other data
});
```

---

## 🐛 Troubleshooting

### Issue: Patient doesn't receive notification

**Check 1: Socket.io connection**
```javascript
// Browser console
socket.connected // should be true
```

**Check 2: Room subscription**
```javascript
// Server logs should show:
// "Socket user_456 connected"
```

**Check 3: FCM token**
```sql
SELECT * FROM fcm_tokens WHERE "userId" = 456;
-- Should have valid token
```

### Issue: Doctor can't initiate call

**Check 1: Appointment status**
```sql
SELECT id, status, "paymentStatus" 
FROM appointments WHERE id = 123;
-- status should be 'confirmed', 'scheduled', or 'accepted'
-- paymentStatus should be 'paid'
```

**Check 2: Doctor authentication**
```bash
# Check JWT token in request header
Authorization: Bearer <token>
```

**Check 3: Server logs**
```bash
pm2 logs mediczy-server --lines 50
# Look for errors during API call
```

### Issue: Meeting link not working

**Check 1: MIROTALK_URL environment variable**
```bash
echo $MIROTALK_URL
# Should be: https://video.mediczy.com
```

**Check 2: Meeting ID format**
```javascript
// Should match pattern: MEDCALL-{appointmentId}-{randomHex}
// Example: MEDCALL-123-ABC12345
```

---

## 📈 Analytics & Monitoring

### Key Metrics to Track
1. **Call Initiation Success Rate**
   ```sql
   SELECT COUNT(*) as total_calls, 
          COUNT(CASE WHEN status='in-progress' THEN 1 END) as successful
   FROM appointments 
   WHERE "callInitiatedBy" = 'doctor';
   ```

2. **Patient Response Rate**
   ```sql
   SELECT 
     COUNT(*) as calls_initiated,
     -- Track if patient joined (would need additional field)
   FROM appointments 
   WHERE "callInitiatedBy" = 'doctor'
     AND "callInitiatedAt" > NOW() - INTERVAL '7 days';
   ```

3. **Average Response Time**
   - Track time between callInitiatedAt and patient join
   - Requires additional tracking in meetingDetails JSONB field

---

## 🎓 Usage Examples

### Example 1: Scheduled Appointment Call

**Scenario**: Dr. Smith has a confirmed appointment with John Doe at 10 AM

**Doctor Actions**:
1. Opens "Video Consultations" page
2. Sees upcoming appointment in list
3. Clicks "Start Consultation" button at 10 AM
4. Video window opens automatically
5. Waits for patient to join

**Patient Actions**:
1. Is browsing the app at 10 AM
2. Receives full-screen incoming call notification
3. Sees "Dr. Smith is calling"
4. Clicks "Accept"
5. Video window opens and joins the call

### Example 2: Early Call Initiation

**Scenario**: Doctor wants to start call 5 minutes early

**Process**:
- Doctor clicks "Start Consultation"
- Backend validates time window (typically allows 15 min before)
- If within window: Call initiated successfully
- If too early: Error message shown

### Example 3: Patient Offline

**Scenario**: Patient is not in the app when doctor calls

**Process**:
- Doctor initiates call
- FCM push notification sent to patient's device
- Patient sees push notification on phone
- Patient taps notification
- App opens with incoming call UI
- Patient accepts and joins

---

## ✅ Success Criteria

All criteria met ✅:

1. ✅ Doctor can initiate video call from dashboard
2. ✅ Patient receives real-time notification (socket.io)
3. ✅ Patient receives push notification (FCM)
4. ✅ Patient sees full-screen incoming call UI
5. ✅ Patient can accept call and join video room
6. ✅ Patient can decline call
7. ✅ Auto-decline after timeout
8. ✅ Database tracks call initiation
9. ✅ Meeting links are unique and secure
10. ✅ Multi-channel notification delivery

---

## 🔮 Future Enhancements

### Potential Improvements
1. **Call History Tracking**
   - Add patientJoinedAt timestamp
   - Track call duration in database
   - Store call quality metrics

2. **Retry Mechanism**
   - Allow doctor to re-initiate if patient declines
   - Limit retry attempts (max 3)

3. **Notification Preferences**
   - Let patients set preferred notification channels
   - Quiet hours support

4. **Call Recording**
   - Integrate with existing recording system
   - Auto-start recording when both join

5. **Waiting Room**
   - Show "Patient is joining..." status to doctor
   - Display estimated wait time

---

## 📞 Support & Maintenance

**For Issues:**
1. Check server logs: `pm2 logs mediczy-server`
2. Check database: Verify migration ran successfully
3. Check socket.io: Verify patient connection
4. Check FCM: Verify token is valid

**Regular Maintenance:**
- Monitor call initiation success rate
- Clear old notification records
- Update FCM tokens periodically
- Review socket.io connection stability

---

**Implementation Date**: January 6, 2026  
**Status**: ✅ COMPLETE AND DEPLOYED  
**Impact**: High - Core teleconsultation feature enhancement  
**Next Steps**: User acceptance testing

---

## 🎉 Summary

Successfully implemented a complete doctor-initiated video call system that:
- ✅ Allows doctors to start consultations with one click
- ✅ Notifies patients instantly via multiple channels
- ✅ Provides WhatsApp-style incoming call UI
- ✅ Tracks all call initiation in database
- ✅ Integrates seamlessly with existing MiroTalk video platform
- ✅ Supports both web and mobile (via FCM push)

**All requirements met. Ready for production use!** 🚀
