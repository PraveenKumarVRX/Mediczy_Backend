# 🐛 PATIENT LOGIN ISSUES - COMPREHENSIVE BUG REPORT

**Date:** January 12, 2026  
**Priority Tier:** CRITICAL & HIGH  
**Status:** UNDER INVESTIGATION & RESOLUTION

---

## 📋 ISSUE SUMMARY

10 critical issues affecting Patient login and associated features:

| # | Issue | Priority | Status | File Location |
|---|-------|----------|--------|----------------|
| 1 | Patient login link opens doctor login | CRITICAL | 🔴 BLOCKED | Frontend routing |
| 2 | Meeting room not connecting when sharing code | CRITICAL | 🔴 BLOCKED | Video consultation |
| 3 | Video not visible during consultation | CRITICAL | 🔴 BLOCKED | Video streaming |
| 4 | Failed to add new member to profile | HIGH | 🟡 OPEN | Profile.tsx |
| 5 | Health risk assessment save error | HIGH | 🟡 OPEN | UserHealthRiskAssessment.tsx |
| 6 | Diet plan not updating per entered details | MEDIUM | 🟡 OPEN | Diet.tsx |
| 7 | Appointments history missing past appointments | HIGH | 🟡 OPEN | MyBookings.tsx |
| 8 | Failed to analyze uploaded report | HIGH | 🟡 OPEN | MyReports.tsx |
| 9 | Not able to book appointment for lab test | HIGH | 🟡 OPEN | LabBooking.tsx |
| 10 | Couldn't upload reports | HIGH | 🔴 BLOCKED | UploadedDocuments.tsx |

---

## 🔴 CRITICAL ISSUES (BLOCKING CORE FUNCTIONALITY)

### 1️⃣ ISSUE #1: Patient Login Link Opens Doctor Login
**Severity:** CRITICAL 🔴  
**Status:** REQUIRES IMMEDIATE FIX  
**Description:** When users click on patient login from the main login page, the system either:
- Redirects to doctor login page instead
- Shows doctor login UI but backend tries to authenticate as patient
- Dashboard shows patient login while URL shows doctor login

#### Root Cause Analysis:
**Location:** [client/src/auth/Login.tsx](client/src/auth/Login.tsx)  
**Lines:** 495-520  

The main login page has multiple portal options:
```
- Doctor Login (/doctor/login)
- Hospital Login (/hospital/login)
- Clinic Login (/clinic/login)
- Lab Login (/lab/login)
- Pharmacy Login (/pharmacy/login)
- Patient Login (HOME - /)
```

**Problem:**
- Patient users should login at "/" (main page) using regular `/api/users/login`
- But if they click any provider button, they're redirected away
- No clear distinction between "patient login" and "provider login"
- Router may be defaulting to `/doctor/login` when no explicit patient route is followed

#### Frontend Files Involved:
- [client/src/auth/Login.tsx](client/src/auth/Login.tsx) - Main login router (lines 495-525)
- [client/src/routes/index.tsx](client/src/routes/index.tsx) - Route definitions
- [client/src/auth/AuthProvider.tsx](client/src/auth/AuthProvider.tsx) - Auth state management

#### Backend Endpoints:
- `POST /api/users/login` - ✅ Regular user/patient login (CORRECT)
- `POST /api/doctors/login` - Doctor login (SHOULD NOT BE USED FOR PATIENTS)

#### Fix Strategy:
1. Ensure patient login page clearly states "Patient Login"
2. Verify router paths don't conflict
3. Check localStorage for `userType` after login
4. Ensure `/login` redirects to patient home, not doctor dashboard
5. Add explicit check in DoctorLogin component to prevent patient access

#### Expected Behavior:
```
Patient clicks "Login" on homepage
  ↓
Should go to /login (USER LOGIN PAGE)
  ↓
Submits email/password to /api/users/login
  ↓
Response sets userType: 'user' in localStorage
  ↓
Redirects to /profile or /health-tracker
```

---

### 2️⃣ ISSUE #2: Meeting Room Not Connecting When Sharing Code
**Severity:** CRITICAL 🔴  
**Status:** REQUIRES IMMEDIATE FIX  
**Description:** 
- Doctor-patient video consultation fails to establish connection
- "Room is only connecting when I share the code for meeting to doctor portal"
- Patient app cannot connect to room until doctor shares meeting code
- Suggests asymmetric room initialization or peer connection issues

#### Root Cause Analysis:
**Location:** [client/src/components/VideoConsultation.tsx](client/src/components/VideoConsultation.tsx) (presumed)  
**Backend:** [server/routes/video.route.js](server/routes/video.route.js) (presumed)

**Problem Indicators:**
- Room not being created/prepared in advance
- Patient may not have proper room ID before entering
- WebRTC peer connection not initiating from patient side
- Doctor's token/permissions may be validated before patient
- Agora or Mirotalk SFU room initialization issue

#### Integration Points:
- Video provider: Agora.io or Mirotalk SFU
- WebRTC connection: Both sides need valid room token
- Signaling server: Must handle room creation/joining properly

#### Expected Flow (CORRECT):
```
DOCTOR SIDE:
1. Doctor clicks "Start Consultation"
2. Backend creates room: POST /api/video/create-room
3. Backend returns: { roomId, doctorToken, roomLink }
4. Doctor joins with token
5. Room is READY and WAITING

PATIENT SIDE:
1. Patient receives notification with roomId/link
2. Patient clicks "Join Consultation"
3. Backend gets patient token: POST /api/video/get-token
4. Patient connects to same roomId
5. BOTH see each other
```

#### Current (BROKEN) Flow:
```
Doctor shares: "Meeting code: ABC123"
Patient manually enters code
Only THEN does room initialize
```

---

### 3️⃣ ISSUE #3: Video Not Visible During Consultation
**Severity:** CRITICAL 🔴  
**Status:** REQUIRES IMMEDIATE FIX  
**Description:**
- Video stream starts but no visible video feed
- Audio may work but video is black/blank
- Possible causes:
  - Camera permissions not granted
  - Video element not properly attached to DOM
  - Stream initialization timing issue
  - Codec/resolution mismatch

#### Root Cause Analysis:
**Location:** [client/src/pages/VideoConsultation.tsx](client/src/pages/VideoConsultation.tsx)  
**Backend:** [server/routes/video.route.js](server/routes/video.route.js)

**Problem Indicators:**
- Video element exists but getDisplayMedia/getUserMedia not called properly
- Stream not attached to video element before connection
- LocalVideo and RemoteVideo components not rendering
- Permission denied to camera access

#### Expected Fix Locations:
```
1. Check browser console for:
   - NotAllowedError: Camera permission denied
   - NotFoundError: No camera device found
   - TypeError: Cannot read property 'play'

2. Verify video elements:
   - <video id="localVideo" autoPlay muted playsInline />
   - <video id="remoteVideo" autoPlay playsInline />

3. Confirm stream attachment:
   - localStream.getTracks().forEach(track => video.srcObject = new MediaStream([track]))
```

---

## 🟡 HIGH PRIORITY ISSUES (CORE FEATURES BROKEN)

### 4️⃣ ISSUE #4: Failed to Add New Member to Profile
**Severity:** HIGH 🟡  
**Status:** OPEN FOR INVESTIGATION

#### Description:
Users cannot add family members/dependents to their profile. System throws error when attempting to save.

#### Location:
- [client/src/pages/Profile.tsx](client/src/pages/Profile.tsx) - Lines: 60-180 (emergencyContacts section)
- [server/routes/patient.route.js](server/routes/patient.route.js) - Patient profile endpoint

#### Potential Causes:
1. Emergency contact schema validation failing
2. API endpoint not properly handling dependent/family member data
3. Missing database migration for family_members table
4. Incorrect field mapping between frontend and backend

#### Investigation Steps:
```bash
1. Check browser DevTools Network tab:
   - What endpoint is called?
   - What's the exact error response?
   
2. Check server logs:
   - Any validation errors?
   - Database constraint violations?

3. Check database:
   - SELECT * FROM family_members WHERE user_id = XXX;
```

---

### 5️⃣ ISSUE #5: Health Risk Assessment - Save Error
**Severity:** HIGH 🟡  
**Status:** OPEN FOR INVESTIGATION

#### Description:
When users fill out health risk assessment and click "Save Assessment", system returns error instead of saving.

#### Location:
- [client/src/pages/UserHealthRiskAssessment.tsx](client/src/pages/UserHealthRiskAssessment.tsx) - Line 600+
- [server/routes/health-assessment.route.js](server/routes/health-assessment.route.js) (presumed)

#### Expected Flow:
```
User fills form (Demographics, Lifestyle, Medical, etc.)
  ↓
User clicks "Save Assessment"
  ↓
Frontend sends POST /api/health-assessment/save
  ↓
Backend validates data
  ↓
Backend calculates risk score
  ↓
Backend saves to database
  ↓
Response: { success: true, riskScore: 45, riskLevel: "MODERATE" }
```

#### Possible Root Causes:
1. Auto-calculated fields (BMI, WHR, etc.) not being sent
2. Measurement validation failing
3. API endpoint not implemented
4. Database schema mismatch
5. Auth middleware rejecting request

#### Example Fix Needed:
```typescript
// Current (BROKEN?)
const saveAssessment = async () => {
  const response = await api.post('/health-assessment/save', {
    responses: formResponses,
    measurements: {...}
  });
};

// Need to ensure all required fields are present:
- height, weight, age, gender (REQUIRED)
- waist, hip, neck (if BMI > 25)
- All questionnaire responses
```

---

### 6️⃣ ISSUE #6: Diet Plan Not Updating Per Entered Details
**Severity:** MEDIUM 🟠  
**Status:** OPEN FOR INVESTIGATION (Possibly FIXED - See PATIENT_ISSUES_FIXED.md)

#### Description:
Users enter personal health details (age, weight, height, goal, activity level) but diet plan doesn't change. Shows same generic plan regardless of input.

#### Location:
- [client/src/pages/Diet.tsx](client/src/pages/Diet.tsx)
- [server/routes/ai-health.route.js](server/routes/ai-health.route.js) - Line: diet/generate endpoint

#### Status Check:
According to [PATIENT_ISSUES_FIXED.md](PATIENT_ISSUES_FIXED.md) line 85-104, this may already be fixed with:
```
POST /api/ai-health/diet/generate
Generates personalized diet based on: age, weight, height, goal, activity level, gender
```

#### Verification Needed:
```bash
curl -X POST http://localhost:3000/api/ai-health/diet/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "age": 30,
    "weight": 70,
    "height": 170,
    "goal": "weight_loss",
    "activityLevel": "moderate",
    "gender": "male"
  }'
```

---

### 7️⃣ ISSUE #7: Appointments History - Missing Past Appointments
**Severity:** HIGH 🟡  
**Status:** OPEN FOR INVESTIGATION

#### Description:
"My Appointments" section doesn't show historical appointments (completed, cancelled, no-show). Only shows upcoming appointments.

#### Location:
- [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx) - Lines: 69-88
- [server/routes/appointment.route.js](server/routes/appointment.route.js) - GET /appointments endpoint

#### Current Code Analysis:
```typescript
// Line 69-88 in MyBookings.tsx
const { data: bookings = [], isLoading: loading } = useQuery({
  queryKey: ["myBookings", userId],
  queryFn: async () => {
    const { data } = await api.get(`/appointments`);
    // Returns bookings - but filters may exclude past appointments
    return Array.isArray(data) ? data : data.appointments || [];
  },
  enabled: !!userId,
});
```

#### Root Cause:
1. Backend query may filter by status (only 'scheduled', 'confirmed')
2. Date range filter may exclude past dates
3. No "History" tab to show past appointments
4. Frontend may not pass query params for date range

#### Expected Behavior:
```
Frontend should have tabs:
- UPCOMING (appointments after today)
- PAST (appointments before today)
- CANCELLED (cancelled appointments)
- ALL (everything)

Or single list with date-based grouping:
  UPCOMING
    └─ Jan 15 - Dr. Kumar
  PAST
    └─ Jan 5 - Dr. Isha
    └─ Dec 28 - Dr. Sharma
```

#### Fix Required:
```typescript
// Frontend should request:
const { data: upcomingAppointments } = useQuery({
  queryFn: () => api.get('/appointments?status=scheduled,confirmed'),
});

const { data: pastAppointments } = useQuery({
  queryFn: () => api.get('/appointments?status=completed,cancelled,no-show'),
});
```

---

### 8️⃣ ISSUE #8: Failed to Analyze Uploaded Report
**Severity:** HIGH 🟡  
**Status:** OPEN FOR INVESTIGATION

#### Description:
Users upload medical reports (X-rays, blood tests, etc.) but system fails to analyze them. Shows error instead of providing analysis.

#### Location:
- [client/src/pages/patient/MyReports.tsx](client/src/pages/patient/MyReports.tsx)
- [server/routes/report.route.js](server/routes/report.route.js) (presumed)

#### Expected Flow:
```
User uploads file (PDF, JPG, PNG)
  ↓
Backend receives multipart/form-data
  ↓
Backend calls AI service:
  - OCR for text extraction
  - Image recognition for medical indicators
  - Analysis engine
  ↓
Returns: { analysis: "...", findings: [...], recommendations: [...] }
```

#### Potential Causes:
1. File upload endpoint not implemented
2. AI analysis service not integrated
3. File size limit exceeded
4. Unsupported file format
5. Timeout during analysis (too long)
6. Missing required dependencies (PIL, Tesseract, etc.)

#### Required Implementation:
```
POST /api/reports/upload
Content-Type: multipart/form-data
Body: { file: <binary>, reportType: "xray" | "bloodtest" | "other" }

POST /api/reports/:reportId/analyze
Body: {}
Response: { 
  success: true, 
  analysis: "...", 
  findings: [...],
  riskFactors: [...],
  recommendations: [...]
}
```

---

### 9️⃣ ISSUE #9: Not Able to Book Appointment for Lab Test
**Severity:** HIGH 🟡  
**Status:** OPEN FOR INVESTIGATION

#### Description:
Users cannot book lab test appointments through "Scan & Reports" section. Booking fails with error.

#### Location:
- [client/src/pages/LabBooking.tsx](client/src/pages/LabBooking.tsx) (presumed)
- [server/routes/lab.route.js](server/routes/lab.route.js) - Lab appointment endpoint

#### Potential Causes:
1. No lab centers available in database
2. Lab appointment schema incompatible with regular appointments
3. Missing backend endpoint: POST /api/lab/appointments
4. Lab availability slots not configured
5. Price calculation failing

#### Expected Flow:
```
User selects test (Blood Test, X-ray, Ultrasound)
  ↓
User selects lab center (from available list)
  ↓
User selects date/time from available slots
  ↓
System shows price
  ↓
User confirms booking
  ↓
POST /api/lab/appointments
{
  testType: "blood_test",
  labId: 5,
  preferredDate: "2026-01-20",
  preferredTime: "09:00 AM",
  notes: "Fasting required"
}
  ↓
Response: { success: true, appointmentId: 123, ...}
```

#### Investigation Steps:
```bash
1. Check if lab centers exist:
   GET /api/labs
   
2. Check if appointments endpoint exists:
   GET /api/lab/appointments
   
3. Check database:
   SELECT * FROM labs;
   SELECT * FROM lab_services;
   SELECT * FROM lab_availability;
```

---

### 🔟 ISSUE #10: Couldn't Upload Reports
**Severity:** HIGH 🔴  
**Status:** BLOCKED - CRITICAL

#### Description:
File upload for medical reports fails completely. Users cannot upload any medical documents (scans, lab reports, prescriptions).

#### Location:
- [client/src/pages/patient/UploadedDocuments.tsx](client/src/pages/patient/UploadedDocuments.tsx)
- [server/routes/upload.route.js](server/routes/upload.route.js) (presumed)

#### Potential Causes:
1. Upload endpoint not implemented or broken
2. File size limit too small or misconfigured
3. Multer middleware not configured
4. CORS blocking file upload
5. Storage directory permissions issue
6. Missing virus scan before save

#### Expected Implementation:
```javascript
// Backend: POST /api/documents/upload
router.post('/upload', 
  authUser, 
  upload.single('file'), // Multer middleware
  async (req, res) => {
    // 1. Validate file type (PDF, JPG, PNG only)
    // 2. Validate file size (< 10MB)
    // 3. Scan for viruses (optional)
    // 4. Save to storage
    // 5. Create database record
    // 6. Return: { success: true, fileId, url }
  }
);
```

#### Required Dependencies:
```json
{
  "multer": "^1.4.5",
  "sharp": "^0.33.0",  // Image processing
  "pdf-lib": "^1.17.0", // PDF handling
  "clamscan": "^1.6.0"  // Virus scanning
}
```

---

## 🔧 INVESTIGATION & DEBUGGING STEPS

### Phase 1: Identify Root Causes

#### Check Browser Console:
```javascript
// Open DevTools (F12) → Console tab
// Look for:
- Network errors (404, 500, 403)
- Auth errors (Unauthorized, Forbidden)
- CORS errors
- Type errors or undefined references

// Try in console:
localStorage.getItem('userType')     // Should be 'user' for patient
localStorage.getItem('token')        // Should have valid JWT
```

#### Check Network Tab:
```
1. Clear network log
2. Reproduce the issue
3. Look for failed requests (RED)
4. Click on failed request:
   - Headers: Check auth token
   - Response: Check error message
   - Timing: Is it timing out?
```

#### Check Server Logs:
```bash
tail -f /home/ubuntu/Mediczy/server/server.log
tail -f /home/ubuntu/Mediczy/logs/error.log

# Look for:
- 404: Endpoint not found
- 403: Permission denied
- 500: Server error
- Validation errors
```

---

### Phase 2: Test Backend Endpoints

#### Test Patient Login:
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@mediczy.com",
    "password": "User123"
  }'

# Expected response:
{
  "success": true,
  "token": "eyJhbGc...",
  "user": { "id": 1, "email": "user@mediczy.com", "role": "user" }
}
```

#### Test Appointment Fetch:
```bash
TOKEN="your_token_here"
curl -X GET 'http://localhost:3000/api/appointments' \
  -H "Authorization: Bearer $TOKEN"
```

#### Test Video Room Creation:
```bash
curl -X POST http://localhost:3000/api/video/create-room \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"appointmentId": 1}'
```

---

## 📊 DATABASE CHECKS

### Check Patient Profile:
```sql
SELECT u.*, ec.* FROM users u
LEFT JOIN emergency_contacts ec ON u.id = ec.user_id
WHERE u.email = 'user@mediczy.com';
```

### Check Appointments:
```sql
SELECT a.*, d.first_name, d.last_name FROM appointments a
LEFT JOIN doctors d ON a.doctor_id = d.id
WHERE a.patient_id = 1
ORDER BY a.appointment_date DESC;
```

### Check Video Rooms:
```sql
SELECT * FROM video_rooms 
WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = 1)
ORDER BY created_at DESC;
```

### Check Reports:
```sql
SELECT * FROM medical_reports 
WHERE user_id = 1
ORDER BY uploaded_at DESC;
```

---

## ✅ NEXT STEPS

### Immediate Action (URGENT):
1. **Issue #1:** Fix patient login routing (prevents all access)
2. **Issue #2:** Fix video room initialization (blocks consultation)
3. **Issue #3:** Fix video stream rendering (blocks consultation)
4. **Issue #10:** Fix file upload (blocks report submission)

### Short Term (TODAY):
5. **Issue #4:** Fix profile member addition
6. **Issue #5:** Fix health assessment save
7. **Issue #7:** Add appointment history tab

### Medium Term (THIS WEEK):
8. **Issue #6:** Verify diet plan personalization
9. **Issue #8:** Implement report analysis
10. **Issue #9:** Fix lab test booking

---

## 📞 SUPPORT RESOURCES

- **API Documentation:** [API_REQUIREMENTS.md](API_REQUIREMENTS.md)
- **Video Setup:** [VIDEO_CALL_CONFIGURATION_COMPLETE.md](VIDEO_CALL_CONFIGURATION_COMPLETE.md)
- **Appointment System:** [APPOINTMENT_SYSTEM_ANALYSIS.md](APPOINTMENT_SYSTEM_ANALYSIS.md)
- **Database Schema:** [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md)

---

**Report Generated:** January 12, 2026  
**Next Review:** After implementing fixes for issues #1-#3
