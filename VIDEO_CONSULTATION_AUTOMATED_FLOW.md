# Video Consultation - Automated Meeting Room Flow

**Date**: January 12, 2026  
**Status**: ✅ Fully Automated

---

## 🎯 Problem Resolution

### Original Issue
**Problem**: "Meeting room only connecting when code shared to doctor portal"

**Root Cause**: There was no automated room ID generation and sharing mechanism between patient and doctor

### Current Solution
The system now **automatically generates and shares meeting room IDs** when a video consultation is booked. No manual code sharing needed.

---

## 🔄 Automated Process Flow

### **STEP 1: Patient Books Video Consultation**

When a patient books an **online consultation**, the system automatically:

1. **Generates Unique Room ID**
   ```javascript
   // Auto-generated format
   const roomId = `mediczy-room-${Date.now()}`;
   // Example: mediczy-room-1736689234567
   ```

2. **Creates MiroTalk Video Room** (Pre-created, ready to use)
   ```javascript
   POST /api/video/room/create
   {
     roomId: "mediczy-room-1736689234567",
     doctorId: 5,
     patientId: 123,
     maxParticipants: 2,
     duration: 30
   }
   ```

3. **Stores Room ID in Database**
   ```javascript
   appointment.metadata = {
     meeting: {
       roomId: "mediczy-room-1736689234567",
       meetingLink: "https://meet.mediczy.com/mediczy-room-1736689234567",
       roomToken: "xyz123...",  // Security token
       roomCreated: true
     }
   }
   ```

4. **Returns Booking Confirmation**
   ```json
   {
     "success": true,
     "appointment": {
       "id": 456,
       "appointmentNumber": "MED000456",
       "appointmentDate": "2026-01-15",
       "timeSlot": "10:00-10:30",
       "consultationType": "online",
       "meetingDetails": {
         "roomId": "mediczy-room-1736689234567",
         "meetingLink": "https://meet.mediczy.com/mediczy-room-1736689234567",
         "joinInstructions": "Room is ready. Click the meeting link to join"
       }
     }
   }
   ```

**Implementation**: [enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js#L279)

---

### **STEP 2: Patient Sees Upcoming Consultation**

Patient navigates to `/video-consultation` page and sees:

```
┌─────────────────────────────────────────────────┐
│  📅 Upcoming Video Consultations                │
├─────────────────────────────────────────────────┤
│  Dr. Rajesh Kumar - Cardiology                  │
│  📅 Jan 15, 2026 at 10:00 AM                    │
│  🔗 Room: mediczy-room-1736689234567            │
│  ⏰ Join available 15 mins before               │
│                                                 │
│  [🟢 Join Now]  (appears at 9:45 AM)           │
└─────────────────────────────────────────────────┘
```

**Implementation**: [VideoConsultation.tsx](client/src/pages/VideoConsultation.tsx#L100-L300)

---

### **STEP 3: Doctor Sees Same Consultation**

Doctor navigates to `/doctor/video` and sees the **same room ID automatically**:

```
┌─────────────────────────────────────────────────┐
│  📋 Upcoming Consultations                      │
├─────────────────────────────────────────────────┤
│  Patient: Priya Sharma                          │
│  📅 Jan 15, 2026 at 10:00 AM                    │
│  🔗 Room: mediczy-room-1736689234567            │
│  ⏰ Duration: 30 mins                           │
│                                                 │
│  [🎥 Start Call]                                │
└─────────────────────────────────────────────────┘
```

**Backend Endpoint**: 
```javascript
GET /api/doctors/video-consultations/upcoming

// Returns appointments with roomId
{
  consultations: [{
    id: 456,
    patient: "Priya Sharma",
    time: "10:00 AM",
    duration: "30 mins",
    roomId: "mediczy-room-1736689234567",  // ← Same room ID
    meetingLink: "https://meet.mediczy.com/mediczy-room-1736689234567"
  }]
}
```

**Implementation**: [doctor.route.js](server/routes/doctor.route.js#L1394-L1449)

---

### **STEP 4: Automatic Room Connection**

Both patient and doctor click their join buttons, and the system **automatically constructs the same meeting URL**:

#### Patient Side:
```javascript
// VideoConsultation.tsx - generateMeetingUrl()
const room = appointment.roomId || appointment.meetingLink || `apt-${appointment.id}`;
const meetingUrl = `${MIROTALK_BASE_URL}/join/${room}?name=${patientName}&audio=1&video=1&notify=0`;

// Result:
// https://video.mediqzy.com/join/mediczy-room-1736689234567?name=Priya%20Sharma&audio=1&video=1&notify=0
```

#### Doctor Side:
```javascript
// DoctorVideoConsultation.tsx - generateMeetingUrl()
const room = consultation.roomId || consultation.meetingLink || consultation.id;
const meetingUrl = `${MIROTALK_BASE_URL}/join/${room}?name=${doctorName}&audio=1&video=1&notify=0`;

// Result:
// https://video.mediqzy.com/join/mediczy-room-1736689234567?name=Dr.%20Rajesh%20Kumar&audio=1&video=1&notify=0
```

**Key Point**: Both URLs have the **exact same room ID** → they connect to the **same MiroTalk room**

---

### **STEP 5: Video Connection Established**

1. **MiroTalk SFU receives both connections**
   - Patient joins: `mediczy-room-1736689234567`
   - Doctor joins: `mediczy-room-1736689234567`

2. **WebRTC Signaling** (handled by MiroTalk)
   - Peer-to-peer connection established
   - Media streams (video/audio) exchanged
   - Both participants can see/hear each other

3. **Call In Progress**
   ```
   Patient Screen:              Doctor Screen:
   ┌──────────────────┐        ┌──────────────────┐
   │                  │        │                  │
   │  [Doctor Video]  │        │  [Patient Video] │
   │                  │        │                  │
   ├──────────────────┤        ├──────────────────┤
   │ [Patient Video]  │        │ [Doctor Video]   │
   │    (small)       │        │    (small)       │
   └──────────────────┘        └──────────────────┘
   ```

---

## 🔧 Technical Implementation

### Room ID Generation Strategy

```javascript
// Location: server/routes/enhanced-appointment.route.js:279

// Only for online consultations
const consultationType = req.body.consultationType; // 'online', 'walkIn', 'homeVisit'

if (consultationType === 'online') {
  // Auto-generate unique room ID
  const meetingRoom = `mediczy-room-${Date.now()}`;
  
  // Room ID format:
  // - Prefix: "mediczy-room-"
  // - Suffix: Timestamp (ensures uniqueness)
  // - Example: mediczy-room-1736689234567
  
  // Stored in appointment.metadata.meeting.roomId
  // Shared with both patient and doctor
}
```

### Database Storage

```sql
-- appointments table
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  doctor_id INTEGER REFERENCES doctors(id),
  appointment_date DATE,
  appointment_time TIME,
  consultation_type VARCHAR(50),
  metadata JSONB,  -- ← Room ID stored here
  ...
);

-- metadata structure:
{
  "meeting": {
    "roomId": "mediczy-room-1736689234567",
    "meetingLink": "https://meet.mediczy.com/mediczy-room-1736689234567",
    "roomToken": "xyz123...",
    "roomCreated": true
  }
}
```

### Frontend Retrieval

#### Patient (GET /api/appointments)
```javascript
const { data: appointments } = useQuery({
  queryKey: ["upcomingAppointments"],
  queryFn: async () => {
    const { data } = await api.get('/appointments', {
      params: {
        consultationType: 'online',
        status: 'confirmed'
      }
    });
    return data;
  }
});

// Each appointment has:
appointments[0].roomId = "mediczy-room-1736689234567";
appointments[0].meetingLink = "https://meet.mediczy.com/...";
```

#### Doctor (GET /api/doctors/video-consultations/upcoming)
```javascript
const { data: consultations } = useQuery({
  queryKey: ["upcomingConsultations"],
  queryFn: async () => {
    const { data } = await api.get('/doctors/video-consultations/upcoming');
    return data.consultations;
  }
});

// Each consultation has:
consultations[0].roomId = "mediczy-room-1736689234567";
consultations[0].meetingLink = "https://meet.mediczy.com/...";
```

---

## 🎯 Zero Manual Intervention Required

### What Happens Automatically:

✅ **Room ID Generation** - No manual creation needed  
✅ **Room Pre-Creation** - MiroTalk room ready before appointment  
✅ **Database Storage** - Room ID saved automatically  
✅ **Patient Access** - Room ID appears in patient's upcoming consultations  
✅ **Doctor Access** - Same room ID appears in doctor's upcoming consultations  
✅ **URL Construction** - Meeting URL built automatically from room ID  
✅ **Connection** - Both join the same room automatically  

### What Users Do:

**Patient**:
1. Book online consultation → (System generates room ID)
2. Go to `/video-consultation` page at appointment time
3. Click "Join Now" → (System uses stored room ID)
4. Video call connects automatically

**Doctor**:
1. Go to `/doctor/video` page at appointment time
2. Click "Start Call" → (System uses same room ID)
3. Video call connects automatically

---

## 📊 Flow Diagram

```
BOOKING PHASE
═════════════
Patient Books Online Consultation
           ↓
Backend Generates Room ID: mediczy-room-1736689234567
           ↓
Backend Pre-Creates MiroTalk Room
           ↓
Room ID Stored in Database (appointments.metadata.meeting.roomId)
           ↓
Confirmation Sent to Patient & Doctor


APPOINTMENT TIME
═══════════════
Patient Opens /video-consultation
           ↓
Frontend Fetches: GET /api/appointments
           ↓
Displays: "Room: mediczy-room-1736689234567"
           ↓
Patient Clicks "Join Now"
           ↓
URL Generated: https://video.mediqzy.com/join/mediczy-room-1736689234567?name=Patient

                          ┌──────────────────┐
                          │  MIROTALK ROOM   │
                          │  mediczy-room-   │
                          │  1736689234567   │
                          └──────────────────┘
                                   ↑  ↑
                                   │  │
                     Patient Join ─┘  └─ Doctor Join

Doctor Opens /doctor/video
           ↓
Frontend Fetches: GET /api/doctors/video-consultations/upcoming
           ↓
Displays: "Room: mediczy-room-1736689234567"
           ↓
Doctor Clicks "Start Call"
           ↓
URL Generated: https://video.mediqzy.com/join/mediczy-room-1736689234567?name=Doctor


RESULT: Both Connected to Same Room ✅
```

---

## 🔐 Security Features

### 1. Room Token (Optional)
```javascript
// Pre-created rooms get security token
roomToken: "xyz123abc456..."

// Can be used for:
// - Validating participants
// - Room access control
// - Preventing unauthorized joins
```

### 2. Participant Limits
```javascript
maxParticipants: 2  // Only patient + doctor
```

### 3. Time-Based Access
```javascript
// Patient can only join 15 minutes before appointment
const canJoin = now >= appointmentTime - 15*60*1000;
```

---

## 🎨 User Experience

### Patient Journey
```
1. Book Appointment
   "Your video consultation is scheduled for Jan 15 at 10:00 AM"
   
2. Receive Confirmation
   "Meeting room is ready. You can join 15 minutes before your appointment."
   
3. Before Appointment (9:45 AM)
   [Dashboard shows: "Join Now" button appears]
   
4. Click Join
   "Connecting to video consultation..."
   
5. Connected
   "You are now connected with Dr. Rajesh Kumar"
```

### Doctor Journey
```
1. See Scheduled Consultations
   "Upcoming: Priya Sharma - 10:00 AM - Video Call"
   
2. At Appointment Time
   [Dashboard shows: "Start Call" button active]
   
3. Click Start Call
   "Connecting to patient..."
   
4. Connected
   "Patient Priya Sharma has joined the call"
```

---

## 🚀 Benefits

### ✅ No Manual Code Sharing
- **Before**: Doctor had to share room code manually
- **Now**: System automatically provides same room ID to both

### ✅ Guaranteed Same Room
- **Before**: Risk of joining different rooms if code mistyped
- **Now**: Room ID stored in DB, no typing errors possible

### ✅ Pre-Created Rooms
- **Before**: Room created on first join, second person might fail
- **Now**: Room pre-created during booking, always ready

### ✅ Better UX
- **Before**: "Enter room code" → confusion, errors
- **Now**: "Join Now" → one click, automatic connection

### ✅ Audit Trail
- Room IDs logged in database
- Can track which consultations used which rooms
- Debugging easier if issues occur

---

## 📝 Configuration

### Environment Variables

**.env (Backend)**:
```bash
VIDEO_API_URL=http://localhost:3000
MIROTALK_SERVER_URL=http://mediqzy.com:3010
```

**.env.local (Frontend)**:
```bash
VITE_MIROTALK_URL=https://video.mediqzy.com
VITE_API_URL=http://localhost:8000
```

### MiroTalk Server
```bash
# Check status
pm2 list | grep mirotalk

# Should show:
│ 10 │ mirotalk-sfu  │ fork  │ 0  │ online  │ 65.8mb │
```

---

## 🧪 Testing the Flow

### End-to-End Test

```bash
# 1. Book a video consultation
curl -X POST http://localhost:8000/api/enhanced-appointments/book \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": 5,
    "appointmentDate": "2026-01-15",
    "timeSlot": "10:00-10:30",
    "consultationType": "online",
    "symptoms": "Chest pain"
  }'

# Response includes:
# "roomId": "mediczy-room-1736689234567"

# 2. Patient retrieves upcoming appointments
curl http://localhost:8000/api/appointments?consultationType=online \
  -H "Authorization: Bearer $PATIENT_TOKEN"

# Shows same roomId

# 3. Doctor retrieves upcoming consultations
curl http://localhost:8000/api/doctors/video-consultations/upcoming \
  -H "Authorization: Bearer $DOCTOR_TOKEN"

# Shows same roomId

# ✅ Both have the exact same room ID - automatic matching works!
```

---

## 🎯 Summary

The meeting room issue is now **completely automated**:

1. **Room ID auto-generated** when booking online consultation
2. **Room pre-created** on MiroTalk server
3. **Room ID stored** in database
4. **Patient sees** room ID in their upcoming appointments
5. **Doctor sees** same room ID in their upcoming consultations
6. **Both click join** → system uses stored room ID
7. **Automatic connection** to same MiroTalk room

**No manual code sharing needed. Zero intervention required. Fully automated end-to-end.**

---

**Last Updated**: January 12, 2026  
**Status**: ✅ Production Ready
