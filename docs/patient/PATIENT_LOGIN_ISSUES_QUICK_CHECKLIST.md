# PATIENT LOGIN ISSUES - QUICK IMPLEMENTATION CHECKLIST

**Generated:** January 12, 2026  
**Status:** Ready for Implementation  
**Priority:** URGENT (3 CRITICAL Issues Blocking Usage)

---

## 🔴 CRITICAL ISSUES - IMPLEMENT TODAY

### ✅ Issue #1: Patient Login Redirects to Doctor Login
**Time Estimate:** 30 minutes  
**Files to Modify:** 3  

- [ ] **Fix 1a:** Modify [client/src/auth/Login.tsx](client/src/auth/Login.tsx#L160)
  - Line 160: Change `navigate("/", { replace: true })` to check userType
  - Lines 120-150: Add `localStorage.setItem('userType', userRole)`
  - **Why:** Ensures correct redirect based on role

- [ ] **Fix 1b:** Add guard in [client/src/auth/DoctorLogin.tsx](client/src/auth/DoctorLogin.tsx#L45)
  - Add useEffect to check if patient user accidentally accessing doctor login
  - Redirect patient users back to `/profile`
  - **Why:** Prevents patients from seeing doctor portal

- [ ] **Fix 1c:** Verify [AuthProvider.tsx](client/src/auth/AuthProvider.tsx)
  - Ensure it checks `localStorage.getItem('userType')` before redirecting
  - Use userType to determine correct dashboard
  - **Why:** Maintains correct auth state

**Testing:**
```bash
# Test 1: Patient login should redirect to profile
curl -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@mediczy.com","password":"User123"}'
# Check response has: "role": "user"

# Test 2: In browser, verify redirects to /profile not /doctor/dashboard
```

---

### ✅ Issue #2: Video Meeting Room Not Connecting
**Time Estimate:** 45 minutes  
**Files to Modify:** 2  

- [ ] **Fix 2a:** Pre-create video rooms in backend
  - File: [server/routes/enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js#L220)
  - Add code to call video service when appointment booked (online consultation)
  - Fetch room token and include in response
  - **Why:** Room must exist before patient tries to join

- [ ] **Fix 2b:** Auto-fetch token on frontend
  - File: [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx#L210)
  - Before navigating to video consultation, get room token
  - Pass token to video component
  - **Why:** Patient gets immediate access to room

**Testing:**
```bash
# Test 1: Check room is created when appointment booked
curl -X POST http://localhost:3000/api/enhanced-appointments/book \
  -H 'Authorization: Bearer $PATIENT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"doctorId":1,"appointmentDate":"2026-01-20","timeSlot":"09:00-09:30","consultationType":"online"}'
# Check response includes: "roomId", "roomToken", "meetingDetails"

# Test 2: Patient joins video room immediately when clicking "Join Consultation"
```

---

### ✅ Issue #3: Video Not Visible During Consultation
**Time Estimate:** 30 minutes  
**Files to Modify:** 1  

- [ ] **Fix 3a:** Verify video element attributes
  - File: [client/src/pages/VideoConsultation.tsx](client/src/pages/VideoConsultation.tsx)
  - Check all `<video>` elements have: `autoPlay={true}`, `muted={true}`, `playsInline={true}`
  - **Why:** Video won't display without autoplay

- [ ] **Fix 3b:** Verify stream attachment
  - Check code properly attaches stream: `videoElement.srcObject = stream`
  - Verify ontrack handler for remote video
  - **Why:** Stream must be attached to element

- [ ] **Fix 3c:** Add camera permission handling
  - Test camera access before starting call
  - Show error if camera denied
  - **Why:** Graceful error handling

**Testing:**
```bash
# Test 1: Check browser console for camera permission errors
# Open DevTools → Console
# Should NOT see: "NotAllowedError", "NotFoundError"

# Test 2: During video call, both videos should be visible (not black)
# Video should show mirror image of yourself locally
# Video should show other person remotely
```

---

### ✅ Issue #10: Can't Upload Reports
**Time Estimate:** 1 hour  
**Files to Modify:** 3  

- [ ] **Fix 10a:** Create upload backend endpoint
  - File: [server/routes/upload.route.js](server/routes/upload.route.js) (CREATE NEW FILE)
  - Implement POST /api/reports/upload with multer
  - Save file and create database record
  - **Why:** Frontend has no endpoint to upload to

- [ ] **Fix 10b:** Register route in app.js
  - File: [server/app.js](server/app.js)
  - Import and use upload routes
  - **Why:** Endpoint must be registered

- [ ] **Fix 10c:** Update frontend to use endpoint
  - File: [client/src/pages/patient/UploadedDocuments.tsx](client/src/pages/patient/UploadedDocuments.tsx)
  - Implement file upload form
  - Handle success/error responses
  - **Why:** Users can upload files

**Testing:**
```bash
# Test 1: Upload a file via curl
curl -X POST http://localhost:3000/api/reports/upload \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -F "file=@/path/to/report.pdf"
# Should return: "success": true, with file details

# Test 2: In browser, upload file and verify it appears in list
```

---

## 🟡 HIGH PRIORITY ISSUES - IMPLEMENT THIS WEEK

### ✅ Issue #4: Failed to Add New Member to Profile
**Time Estimate:** 30 minutes  
**Action Items:**
- [ ] Check if family_members table exists in database
- [ ] Verify schema matches frontend expectations
- [ ] Test emergency contact add/update endpoints
- [ ] Check for validation errors in server logs

### ✅ Issue #5: Health Risk Assessment Save Error
**Time Estimate:** 30 minutes  
**Action Items:**
- [ ] Verify /api/health-assessment/save endpoint exists
- [ ] Check if all required fields being sent (height, weight, age, etc.)
- [ ] Test with curl to see exact error
- [ ] Check database for health_assessments table

### ✅ Issue #6: Diet Plan Not Updating
**Time Estimate:** 15 minutes  
**Action Items:**
- [ ] Verify /api/ai-health/diet/generate endpoint exists and works
- [ ] Test with different parameters to see if plan changes
- [ ] Check AI engine is receiving parameters correctly
- [ ] This may already be fixed (see PATIENT_ISSUES_FIXED.md)

### ✅ Issue #7: Appointments History Missing Past Appointments
**Time Estimate:** 45 minutes  
**Action Items:**
- [ ] Add query parameter support: `?status=completed,cancelled,no-show`
- [ ] Create separate history endpoint: `GET /api/appointments/history`
- [ ] Update frontend to fetch both upcoming and past
- [ ] Add tabs or sections to show both

### ✅ Issue #8: Failed to Analyze Uploaded Report
**Time Estimate:** 1.5 hours  
**Action Items:**
- [ ] Implement report analysis endpoint
- [ ] Integrate with OCR service (Tesseract or Vision API)
- [ ] Add medical analysis AI
- [ ] Save analysis results to database

### ✅ Issue #9: Not Able to Book Lab Test Appointment
**Time Estimate:** 1 hour  
**Action Items:**
- [ ] Verify labs exist in database: `SELECT COUNT(*) FROM labs;`
- [ ] Check lab availability slots are configured
- [ ] Test lab appointment booking endpoint
- [ ] Ensure LabBooking frontend sends correct payload

---

## 🔧 QUICK DIAGNOSTIC COMMANDS

### Check Database Status
```bash
# Connect to database
mysql -u root -p mediczy

# Check critical tables
SHOW TABLES LIKE '%lab%';
SHOW TABLES LIKE '%report%';
SHOW TABLES LIKE '%appointment%';

# Check if data exists
SELECT COUNT(*) FROM labs;
SELECT COUNT(*) FROM appointments;
SELECT COUNT(*) FROM medical_reports;
```

### Check Backend Logs
```bash
# Follow backend logs in real-time
tail -f /home/ubuntu/Mediczy/server/server.log

# Search for specific errors
grep -i "error\|failed\|unauthorized" /home/ubuntu/Mediczy/server/server.log

# Check for upload-related errors
grep -i "upload\|multer" /home/ubuntu/Mediczy/server/server.log
```

### Test Critical Endpoints
```bash
# Get auth token first
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r '.token')

# Test appointments endpoint
curl -X GET http://localhost:3000/api/appointments \
  -H "Authorization: Bearer $TOKEN" | jq

# Test video room creation
curl -X POST http://localhost:3000/api/video/room/token \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"roomId":"test-room-123","appointmentId":1}'
```

---

## 📋 IMPLEMENTATION ORDER

### Day 1 (CRITICAL - 2-3 hours)
1. ✅ Fix Issue #1: Patient Login Routing (30 min)
2. ✅ Fix Issue #2: Video Room Connection (45 min)
3. ✅ Fix Issue #3: Video Not Visible (30 min)

### Day 2 (CRITICAL - 1 hour)
4. ✅ Fix Issue #10: Report Upload (1 hour)

### Day 3-4 (HIGH PRIORITY - 4-5 hours)
5. ✅ Fix Issue #4: Add Family Member (30 min)
6. ✅ Fix Issue #5: Health Assessment Save (30 min)
7. ✅ Fix Issue #7: Appointment History (45 min)
8. ✅ Fix Issue #9: Lab Test Booking (1 hour)

### Day 5+ (MEDIUM - 2 hours)
9. ✅ Verify Issue #6: Diet Plan (15 min)
10. ✅ Implement Issue #8: Report Analysis (1.5 hours)

---

## 🧪 TESTING CHECKLIST

### After Each Fix, Verify:
- [ ] No errors in browser console
- [ ] No errors in server logs
- [ ] Feature works as expected
- [ ] Related features not broken

### Full System Test (After All Fixes)
```bash
# 1. Patient Login Flow
[ ] Open /login
[ ] Enter user@mediczy.com / User123
[ ] Verify redirects to /profile
[ ] Verify localStorage has userType: 'user'

# 2. Video Consultation
[ ] Book appointment with online consultation
[ ] Verify room created with roomId
[ ] Click "Join Consultation"
[ ] Verify connects to video room
[ ] Verify both videos visible

# 3. Report Upload
[ ] Go to /patient/uploaded-documents
[ ] Upload test PDF file
[ ] Verify file appears in list
[ ] Verify file saved to server

# 4. Appointment History
[ ] Go to /my-bookings
[ ] Verify has UPCOMING and HISTORY tabs
[ ] Verify past appointments in HISTORY
[ ] Verify can see completed appointments

# 5. Member Profile
[ ] Go to /profile
[ ] Try to add family member
[ ] Verify saves without error
[ ] Verify appears in list

# 6. Health Assessment
[ ] Go to health risk assessment
[ ] Fill form with data
[ ] Click Save
[ ] Verify saves and shows results

# 7. Diet Plan
[ ] Enter personal details
[ ] Select goal (weight loss, etc.)
[ ] Verify plan changes based on inputs
[ ] Not generic plan

# 8. Lab Booking
[ ] Go to Lab Booking
[ ] Select test type
[ ] Select lab center
[ ] Select date/time
[ ] Verify can book
```

---

## 📞 SUPPORT RESOURCES

- **Detailed Bug Report:** [PATIENT_LOGIN_ISSUES_BUG_REPORT.md](PATIENT_LOGIN_ISSUES_BUG_REPORT.md)
- **Implementation Guide:** [PATIENT_LOGIN_ISSUES_IMPLEMENTATION_GUIDE.md](PATIENT_LOGIN_ISSUES_IMPLEMENTATION_GUIDE.md)
- **API Documentation:** [API_REQUIREMENTS.md](API_REQUIREMENTS.md)
- **Video Setup:** [VIDEO_CALL_CONFIGURATION_COMPLETE.md](VIDEO_CALL_CONFIGURATION_COMPLETE.md)
- **Database Schema:** [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md)

---

**Status:** Ready for Development  
**Severity:** CRITICAL  
**Estimated Total Time:** 8-10 hours  
**Next Step:** Start with Issue #1 (Patient Login Routing)
