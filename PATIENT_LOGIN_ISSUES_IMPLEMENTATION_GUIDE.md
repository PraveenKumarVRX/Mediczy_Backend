# PATIENT LOGIN ISSUES - IMPLEMENTATION FIXES

## 🔴 CRITICAL ISSUE #1: Patient Login Routing to Doctor Login
**Status:** ROOT CAUSE IDENTIFIED  
**Severity:** CRITICAL - Prevents all patient access

### Problem Analysis:

**Current Behavior:**
1. User goes to `/login` ✅ (Correct page)
2. User enters credentials and submits ✅
3. Backend validates at `/api/users/login` ✅ (CORRECT ENDPOINT!)
4. Backend returns token with `role: 'user'` ✅
5. **BUG:** Frontend redirects to `/` instead of `/profile` OR
6. **BUG:** AuthProvider redirects to `/doctor/dashboard` based on token
7. **Result:** Patient sees "patient login" but is in doctor portal

### Code Analysis:

#### Frontend Issue 1: Incorrect Redirect in Login.tsx
**File:** [client/src/auth/Login.tsx](client/src/auth/Login.tsx:160)

```typescript
// CURRENT (LINE 160 - WRONG!)
navigate("/", { replace: true });

// SHOULD BE:
if (response.user.role === 'user') {
  navigate("/profile", { replace: true });
} else if (response.user.role === 'doctor') {
  navigate("/doctor/dashboard", { replace: true });
}
```

#### Frontend Issue 2: AuthProvider Confusion in AuthProvider.tsx
**File:** [client/src/auth/AuthProvider.tsx](client/src/auth/AuthProvider.tsx) (lines TBD)

The AuthProvider needs to check `userType` from localStorage BEFORE redirecting:

```typescript
// Check if user is already authenticated
const token = localStorage.getItem('token');
const userType = localStorage.getItem('userType');

if (token) {
  if (userType === 'doctor') {
    navigate('/doctor/dashboard');
  } else if (userType === 'user') {
    navigate('/profile');
  } else {
    // Default to user if userType not set
    navigate('/profile');
  }
}
```

#### Frontend Issue 3: Check in DoctorLogin Component
**File:** [client/src/auth/DoctorLogin.tsx](client/src/auth/DoctorLogin.tsx:45)

Add check to prevent patient users from accessing doctor login:

```typescript
// SHOULD ADD AT LINE 45 (after useEffect that checks doctorToken)
useEffect(() => {
  const userToken = localStorage.getItem('token');
  const userType = localStorage.getItem('userType');
  
  // If regular user is accessing doctor login, redirect them
  if (userToken && userType === 'user') {
    console.log('⚠️ Patient user cannot access doctor login');
    navigate('/profile', { replace: true });
  }
}, [navigate]);
```

### Backend Verification:

**Test:** Check if backend correctly sets role/userType:

```bash
# Test user login
curl -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@mediczy.com",
    "password": "User123"
  }'

# Should return:
{
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "user@mediczy.com",
    "role": "user"  ← CRITICAL: Must be "user" not "doctor"
  }
}
```

### Frontend Code to Set localStorage Correctly:

**File:** [client/src/auth/Login.tsx](client/src/auth/Login.tsx:120-150)

**CURRENT CODE (Lines 120-150):**
```typescript
const onSubmit = (values: { email: string; password: string }) => {
  // ... validation ...
  loginMutation.mutate(
    { email: values.email, password: values.password },
    {
      onSuccess: (response) => {
        const token = response?.data?.token;
        
        // BUG: Not setting userType!
        localStorage.setItem('token', token);
        localStorage.removeItem('doctorToken');
        // MISSING: localStorage.setItem('userType', 'user');
        
        navigate("/", { replace: true });  // BUG: Wrong redirect
      },
    }
  );
};
```

**FIXED CODE:**
```typescript
const onSubmit = (values: { email: string; password: string }) => {
  // ... validation ...
  loginMutation.mutate(
    { email: values.email, password: values.password },
    {
      onSuccess: (response) => {
        const token = response?.data?.token;
        const userRole = response?.data?.user?.role || 'user';
        
        // FIXED: Set userType correctly
        localStorage.setItem('token', token);
        localStorage.setItem('userType', userRole);  // ← FIX
        localStorage.setItem('userId', response?.data?.user?.id);
        localStorage.removeItem('doctorToken');
        
        // FIXED: Correct redirect based on role
        if (userRole === 'doctor') {
          navigate('/doctor/dashboard', { replace: true });
        } else {
          navigate('/profile', { replace: true });  // ← FIX
        }
        
        window.dispatchEvent(new Event('authChange'));
      },
    }
  );
};
```

---

## 🔴 CRITICAL ISSUE #2: Meeting Room Not Connecting

**Status:** ROOT CAUSE IDENTIFIED  
**Severity:** CRITICAL - Blocks video consultation

### Problem:
- Patient cannot connect to video room until doctor shares code
- Suggests room not being created in advance
- Patient not receiving roomId/token

### Root Cause:
When appointment is booked, video room should be created at that time, NOT when consultation starts.

### Fix Location:
**File:** [server/routes/enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js:220)

**CURRENT CODE (Lines 220-230):**
```javascript
// Generate meeting details
const meetingRoom = consultationType === 'online' ? `mediczy-room-${Date.now()}` : null;
```

**Issue:** Room ID is generated at booking, but room may not be created in video service.

### Required Fix:

#### Backend Enhancement - Pre-create Video Room
**File:** [server/routes/enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js)

**ADD AFTER LINE 220:**
```javascript
// Generate meeting details
const meetingRoom = consultationType === 'online' ? `mediczy-room-${Date.now()}` : null;

// PRE-CREATE VIDEO ROOM if online consultation
let videoRoomToken = null;
if (consultationType === 'online') {
  try {
    const videoResponse = await fetch(`${process.env.VIDEO_API_URL}/api/video/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: meetingRoom,
        appointmentId: dbAppointment.id,
        maxParticipants: 2,
        expiryMinutes: 60
      })
    });
    
    if (videoResponse.ok) {
      const roomData = await videoResponse.json();
      videoRoomToken = roomData.roomToken;
      console.log(`✅ Video room pre-created: ${meetingRoom}`);
    } else {
      console.warn(`⚠️ Failed to pre-create video room: ${meetingRoom}`);
    }
  } catch (error) {
    console.warn(`⚠️ Video room pre-creation skipped: ${error.message}`);
  }
}
```

#### Response Should Include Room Token
**ADD TO APPOINTMENT RESPONSE (Around Line 320):**
```javascript
meetingDetails: {
  meetingLink: consultationType === 'online' ? `https://meet.mediczy.com/${meetingRoom}` : null,
  roomId: meetingRoom,
  roomToken: videoRoomToken,  // ← ADD THIS
  joinInstructions: consultationType === 'online' ? 'Click the meeting link 5 minutes before your appointment' : null
}
```

#### Frontend - Auto-join Video Room
**File:** [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx:210)

**CURRENT (LINE 210):**
```typescript
// Navigate to embedded video consultation page with room parameter
navigate(`/video-consultation/${booking.id}`, {
  state: { room: booking.meetingDetails?.roomId }
});
```

**FIXED:**
```typescript
// Pre-fetch video token and automatically join
const videoTokenResponse = await api.post('/api/video/room/token', {
  roomId: booking.meetingDetails?.roomId,
  appointmentId: booking.id
});

navigate(`/video-consultation/${booking.id}`, {
  state: { 
    room: booking.meetingDetails?.roomId,
    token: videoTokenResponse.data.token,  // ← AUTO-JOIN
    autoJoin: true
  }
});
```

---

## 🔴 CRITICAL ISSUE #3: Video Not Visible During Consultation

**Status:** ROOT CAUSE LIKELY IN VIDEO STREAM INITIALIZATION  
**Severity:** CRITICAL - Blocks consultation

### Problem:
Video streams start but no visible video feed (black screen).

### Potential Root Causes:
1. LocalVideo/RemoteVideo components not rendering
2. Stream not properly attached to video element
3. Camera permission denied
4. Video element `autoplay` attribute missing

### Fix Locations:

#### Check 1: Video Element Attributes
**File:** [client/src/pages/VideoConsultation.tsx](client/src/pages/VideoConsultation.tsx) (approximate)

**SHOULD HAVE:**
```jsx
// For local video
<video
  id="localVideo"
  autoPlay={true}      // ← CRITICAL
  muted={true}         // ← Must be muted
  playsInline={true}   // ← For mobile
  style={{ transform: 'scaleX(-1)' }}  // ← Mirror local video
/>

// For remote video
<video
  id="remoteVideo"
  autoPlay={true}      // ← CRITICAL
  playsInline={true}   // ← For mobile
/>
```

#### Check 2: Stream Attachment
**VERIFY CODE HAS:**
```javascript
// When local stream is obtained
const localStream = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: { 
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
});

// Attach to video element
const videoElement = document.getElementById('localVideo');
if (videoElement) {
  videoElement.srcObject = localStream;  // ← CRITICAL
  videoElement.onloadedmetadata = () => {
    videoElement.play();
  };
}
```

#### Check 3: Remote Stream Attachment
**VERIFY ONTRACK HANDLER:**
```javascript
// When remote stream is received
peerConnection.ontrack = (event) => {
  console.log('Remote stream received:', event.streams);
  const remoteVideo = document.getElementById('remoteVideo');
  if (remoteVideo) {
    remoteVideo.srcObject = event.streams[0];  // ← CRITICAL
  }
};
```

#### Check 4: Camera Permission Request
**ADD PERMISSION CHECK:**
```javascript
// Before calling getUserMedia
async function requestCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log('✅ Camera permission granted');
    stream.getTracks().forEach(track => track.stop());  // Stop the test stream
    return true;
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      console.error('❌ Camera permission denied by user');
      toast({
        title: "Camera Access Required",
        description: "Please allow camera access in browser settings",
        variant: "destructive"
      });
    } else if (error.name === 'NotFoundError') {
      console.error('❌ No camera device found');
      toast({
        title: "Camera Not Found",
        description: "Please connect a camera or check if it's in use",
        variant: "destructive"
      });
    }
    return false;
  }
}
```

---

## 🔴 CRITICAL ISSUE #10: Couldn't Upload Reports

**Status:** ROOT CAUSE - ENDPOINT LIKELY NOT IMPLEMENTED  
**Severity:** CRITICAL - Blocks report submission

### Problem:
File upload for medical reports fails completely.

### Fix Required:

#### Step 1: Implement Upload Endpoint
**File:** [server/routes/upload.route.js](server/routes/upload.route.js) (may need to create)

```javascript
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authUser } from '../middleware/auth.middleware.js';
import Medical Report from '../models/medical-report.model.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow only specific file types
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }  // 10MB max
});

/**
 * @route   POST /api/reports/upload
 * @desc    Upload medical report
 * @access  Private (Patient)
 */
router.post('/upload', authUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Create database record
    const report = await MedicalReport.create({
      userId: req.user.id,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      filePath: req.file.path,
      uploadedAt: new Date(),
      status: 'pending_analysis'  // Will be analyzed later
    });

    res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      report: {
        id: report.id,
        fileName: report.fileName,
        originalName: report.originalName,
        uploadedAt: report.uploadedAt,
        status: 'pending_analysis'
      }
    });
  } catch (error) {
    console.error('Report upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload report',
      error: error.message
    });
  }
});

export default router;
```

#### Step 2: Register Upload Route in Backend
**File:** [server/app.js](server/app.js)

```javascript
// ADD these lines in app.js
import uploadRoute from './routes/upload.route.js';

// ... after other routes ...
app.use('/api/reports', uploadRoute);
```

#### Step 3: Implement Frontend Upload
**File:** [client/src/pages/patient/UploadedDocuments.tsx](client/src/pages/patient/UploadedDocuments.tsx)

```typescript
import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

export const UploadedDocuments = () => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [reports, setReports] = useState([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Only PDF, JPEG, and PNG files are allowed",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB",
        variant: "destructive"
      });
      return;
    }

    // Upload file
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/reports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setReports([...reports, response.data.report]);
        toast({
          title: "Success",
          description: "Report uploaded successfully"
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.response?.data?.message || "Failed to upload report",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="border-2 border-dashed rounded-lg p-6 text-center">
        <Upload className="h-12 w-12 mx-auto mb-2" />
        <label htmlFor="file-upload" className="cursor-pointer">
          <span className="text-primary font-semibold">Click to upload</span>
          <span className="text-gray-500"> or drag and drop</span>
        </label>
        <input
          id="file-upload"
          type="file"
          hidden
          onChange={handleFileUpload}
          disabled={uploading}
          accept=".pdf,.jpg,.jpeg,.png"
        />
        <p className="text-xs text-gray-500 mt-1">PDF, JPG or PNG (max 10MB)</p>
      </div>

      {/* Display uploaded reports */}
      <div className="mt-6 space-y-2">
        {reports.map((report) => (
          <div key={report.id} className="flex items-center justify-between bg-gray-50 p-3 rounded">
            <span>{report.originalName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReports(reports.filter(r => r.id !== report.id))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UploadedDocuments;
```

---

## 🟡 HIGH PRIORITY ISSUE #7: Appointments History Missing Past Appointments

**Status:** NEEDS INVESTIGATION - Query May Not Include All Statuses  
**Severity:** HIGH

### Problem:
Only shows upcoming appointments, not historical ones.

### Root Cause:
Backend query likely filters by status ('scheduled', 'confirmed') only.

### Fix Location:
**File:** [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx:82-95)

**CURRENT CODE:**
```typescript
const { data: bookings = [], isLoading: loading } = useQuery({
  queryKey: ["myBookings", userId],
  queryFn: async () => {
    const { data } = await api.get(`/appointments`);  // ← No status filter!
    return Array.isArray(data) ? data : data.appointments || [];
  },
  enabled: !!userId,
});
```

**ISSUE:** If backend only returns active appointments, frontend has no way to get past ones.

### Fix Required:

#### Backend Fix - Separate Endpoints
**File:** [server/routes/appointment.route.js](server/routes/appointment.route.js)

**ADD ENDPOINT:**
```javascript
// GET /api/appointments?status=completed,cancelled,no-show
router.get('/history', authUser, async (req, res) => {
  try {
    const appointments = await Appointment.findAll({
      where: {
        userId: req.user.id,
        status: ['completed', 'cancelled', 'no-show']
      },
      order: [['appointmentDate', 'DESC']],
      limit: 50
    });
    
    res.json({
      success: true,
      appointments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

#### Frontend Fix - Fetch Both Upcoming and History
**File:** [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx)

**REPLACE QUERY WITH:**
```typescript
const [activeTab, setActiveTab] = useState('upcoming');

// Fetch upcoming appointments
const { data: upcomingAppointments = [], isLoading: upcomingLoading } = useQuery({
  queryKey: ["myBookings", "upcoming", userId],
  queryFn: async () => {
    const { data } = await api.get(`/appointments?status=scheduled,confirmed`);
    return Array.isArray(data) ? data : data.appointments || [];
  },
  enabled: !!userId,
});

// Fetch past appointments
const { data: pastAppointments = [], isLoading: pastLoading } = useQuery({
  queryKey: ["myBookings", "history", userId],
  queryFn: async () => {
    const { data } = await api.get(`/appointments/history`);
    return Array.isArray(data) ? data : data.appointments || [];
  },
  enabled: !!userId,
});

// Use appropriate data based on active tab
const bookings = activeTab === 'upcoming' ? upcomingAppointments : pastAppointments;
const loading = activeTab === 'upcoming' ? upcomingLoading : pastLoading;
```

---

## Summary of Fixes

| Issue | Fix Type | File | Priority |
|-------|----------|------|----------|
| #1: Patient Login → Doctor Login | Frontend Routing | Login.tsx, AuthProvider.tsx, DoctorLogin.tsx | 🔴 CRITICAL |
| #2: Room Not Connecting | Backend Room Pre-creation | enhanced-appointment.route.js, video.route.js | 🔴 CRITICAL |
| #3: Video Not Visible | Video Element Attributes | VideoConsultation.tsx | 🔴 CRITICAL |
| #10: Can't Upload Reports | New Endpoint | upload.route.js, UploadedDocuments.tsx | 🔴 CRITICAL |
| #7: Appointment History Missing | Query Filter | MyBookings.tsx, appointment.route.js | 🟡 HIGH |

