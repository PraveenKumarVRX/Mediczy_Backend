# Patient Login Issues - Bug Investigation Report

**Date**: January 13, 2026  
**Status**: Under Investigation  
**Priority**: Critical - Affects Core Patient Features

---

## Summary of Issues

| Issue | Feature | Status | Severity |
|-------|---------|--------|----------|
| Booking Failed | Find & Book Doctor | 🔴 Critical | High |
| Confirm Not Working | Lab Test Booking | 🔴 Critical | High |
| Upload Failed | My Reports | 🔴 Critical | High |
| Tabs Not Opening | My Reports | 🟡 High | Medium |
| Analysis Failed | Scan Reports | 🔴 Critical | High |
| No Doctor List | Chat with Doctor | 🔴 Critical | High |
| Not Showing | My Appointments | 🔴 Critical | High |
| Not Showing | History | 🟡 High | Medium |
| Wrong Status | Dashboard | 🟡 High | Medium |

---

## Detailed Issue Analysis

### 1. Find & Book Doctor - "Shows Booking Failed"

**Issue**: Appointment creation returns "Booking Failed" error

**Potential Root Causes**:

#### A. Validation Errors
```javascript
// File: /server/routes/appointment.route.js (Line 27-34)
body('doctorId').notEmpty().withMessage('Doctor ID is required'),
body('appointmentDate').isDate().withMessage('Valid date is required'),
body('appointmentTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
body('consultationType').isIn(['video', 'audio', 'chat', 'in-person']),
```

**Hypothesis**: Frontend might be sending:
- Invalid doctorId format (not numeric or valid unique_id)
- Invalid appointmentDate format (not ISO date)
- Invalid appointmentTime format (not HH:MM)
- Incorrect consultationType enum values

**Debug Solution**:
```javascript
// Check request validation in browser console
// Verify payload format before sending
const payload = {
  doctorId: 2,  // Must be numeric ID or unique_id like 'D2C193'
  appointmentDate: "2026-01-15",  // ISO format YYYY-MM-DD
  appointmentTime: "14:30",  // HH:MM format (24-hour)
  consultationType: "video"  // Must be: video, audio, chat, or in-person
};
```

#### B. Doctor Resolution Failure
```javascript
// File: /server/controller/appointment.controller.js (Line 152-160)
const resolveDoctorId = async (doctorIdOrUniqueId) => {
  if (!doctorIdOrUniqueId) return null;
  
  // Checks if doctor exists by ID or unique_id
};

// If doctor not found, returns 404:
if (!doctor) {
  return res.status(404).json({ message: 'Doctor not found' });
}
```

**Hypothesis**: Frontend might be passing:
- Non-existent doctorId
- Invalid unique_id format
- Doctor ID from wrong organization/context

**Debug Solution**:
```bash
# Get valid doctor IDs from database
curl -X GET http://localhost:8000/api/doctors \
  -H "Authorization: Bearer $TOKEN"

# Verify doctor exists before booking
curl -X GET http://localhost:8000/api/doctors/2 \
  -H "Authorization: Bearer $TOKEN"
```

#### C. Conflicting Appointments
```javascript
// File: /server/controller/appointment.controller.js (Line 162-175)
// Check if doctor already has appointment at this time
const doctorConflict = await Appointment.findOne({
  where: {
    doctorId: resolvedDoctorId,
    appointmentDate,
    appointmentTime,
    status: { [Op.notIn]: ['cancelled', 'no-show'] }
  }
});

if (doctorConflict) {
  return res.status(409).json({ 
    message: `Dr. is not available at the selected time`
  });
}
```

**Hypothesis**: 
- Time slot already booked by another patient
- Patient already has appointment at same time
- Availability check not working correctly

**Debug Solution**:
```bash
# Check available slots for doctor
curl -X GET http://localhost:8000/api/doctor-availability/2 \
  -H "Authorization: Bearer $TOKEN"

# Check patient's existing appointments
curl -X GET http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN"
```

#### D. Consultation Fee Not Set
```javascript
// File: /server/controller/appointment.controller.js (Line 223-235)
let consultationFee = 500; // Default
if (availability) {
  switch (requestedConsultationType) {
    case 'video':
      consultationFee = availability.videoConsultationFee;
      break;
    // ...
  }
}
```

**Hypothesis**:
- Doctor availability record doesn't exist
- Consultation fees not configured
- Consultation type mismatch in database

**Diagnosis Steps**:
1. Check if DoctorAvailability exists for doctor
2. Verify consultation fees are not null
3. Check if consultationType matches database enums

---

### 2. Lab Test - Confirm Booking Not Working

**Issue**: Clicking "confirm booking" button doesn't trigger booking

**Potential Root Causes**:

#### A. Form Validation Not Complete
- Required fields empty (test type, hospital, date, time)
- Patient details not filled
- No lab selected

#### B. API Endpoint Not Found or Wrong URL
```javascript
// Expected route (need to verify exists):
POST /api/lab-tests
// or
POST /api/orders
```

**Debug Solution**:
```bash
# Find lab test related routes
grep -r "lab" /home/ubuntu/Mediczy/server/routes/*.js
grep -r "test.*booking" /home/ubuntu/Mediczy/server/routes/*.js
```

#### C. Frontend Button Not Wired
- Event listener not attached
- Form not submitting
- Missing onClick handler

**Diagnosis**:
1. Check browser console for JavaScript errors
2. Check Network tab for failed requests
3. Verify button has proper form submission

---

### 3. My Reports - Upload Failed

**Issue**: Unable to upload medical reports

**Potential Root Causes**:

#### A. No Upload Endpoint Implemented
```bash
# Search for report upload routes
grep -r "upload.*report\|report.*upload" /home/ubuntu/Mediczy/server/routes/
```

#### B. File Size Limit Exceeded
- Max file upload size not configured
- Large PDF/image files rejected

#### C. Missing Authentication
- Authorization header not sent
- Token expired
- Wrong token format

#### D. No File Storage Configured
- Upload directory doesn't exist
- S3/Cloud storage not configured
- Permissions not set

**Diagnosis Steps**:
1. Check if `/api/reports/upload` endpoint exists
2. Test with cURL:
```bash
curl -X POST http://localhost:8000/api/reports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@report.pdf"
```

---

### 4. My Reports - Tab Options Not Opening

**Issue**: Tabs (Total Reports, Lab Reports, Imaging, Prescription) don't toggle

**Potential Root Causes**:

#### A. Frontend State Management Issue
- React state not updating
- Tab state not persisted
- Click event not firing

#### B. Missing Tab Content Data
- API not returning filtered reports
- Reports array empty for each category
- Data fetch failing silently

#### C. CSS/Display Issue
- Tabs hidden by CSS
- Wrong z-index
- Visibility set to hidden

**Diagnosis**:
1. Open browser DevTools → Elements
2. Check if click event listeners attached
3. Verify API calls in Network tab
4. Check for console errors

---

### 5. Scan Reports - Image Analysis Failed

**Issue**: After uploading scan image, shows "failed to analyse"

**Potential Root Causes**:

#### A. AI Analysis Service Not Running
- MedGemma model not loaded
- Python AI service crashed
- Memory insufficient for model

#### B. Image Processing Error
- Image format not supported
- Image corrupted
- Image too large/small

#### C. API Integration Failure
```javascript
// Likely flow:
// 1. Upload image → /api/reports/upload
// 2. Trigger analysis → /api/ai-health/analyze
// 3. Return results → Frontend
```

#### D. Wrong Model Configuration
- Model path incorrect
- Model not downloaded
- Insufficient vRAM/CPU resources

**Diagnosis**:
```bash
# Check MedGemma model status
ps aux | grep medgemma

# Check model file exists
ls -lh /home/ubuntu/Mediczy/server/models/medgemma*.gguf

# Test AI service
curl -X POST http://localhost:8000/api/ai-health/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"image": "base64-encoded-image"}'
```

---

### 6. Chat with Doctor - Doctor List Not Showing

**Issue**: Doctor list not populated in chat interface

**Potential Root Causes**:

#### A. Doctor Fetch Endpoint Fails
```javascript
// Expected endpoint:
GET /api/doctors
GET /api/doctors/available
GET /api/doctors/chat-available
```

**Diagnosis**:
```bash
# Test doctor list endpoint
curl -X GET http://localhost:8000/api/doctors \
  -H "Authorization: Bearer $TOKEN" | jq

# Check if doctors exist
curl -X GET http://localhost:8000/api/doctors?status=active \
  -H "Authorization: Bearer $TOKEN" | jq
```

#### B. No Doctors in Database
- Doctor collection empty
- All doctors inactive
- Filtering too strict

#### C. Authentication Issue
- Patient not authorized to see doctor list
- Organization/tenant mismatch
- Token expired

#### D. Frontend Data Binding
- Component not rendering data
- Data not passed to component
- Map/forEach not working

**Debug Solution**:
```javascript
// Frontend console check
console.log('Doctors data:', availableDoctors);
console.log('Is loading:', isLoadingDoctors);
console.log('Error state:', doctorsError);
```

---

### 7. My Appointments - Scheduled Appointments Not Showing

**Issue**: Upcoming appointments don't display

**Potential Root Causes**:

#### A. Status Filter Incorrect
```javascript
// File: /server/controller/appointment.controller.js
// Valid statuses: scheduled, confirmed, in-progress, completed, cancelled, no-show, rescheduled

// Issue: Frontend might filter only 'confirmed' but database has 'scheduled'
const appointments = await Appointment.findAll({
  where: {
    userId,
    status: 'confirmed'  // ← Problem: Should include 'scheduled' too
  }
});
```

**Fix**:
```javascript
const appointments = await Appointment.findAll({
  where: {
    userId,
    status: { [Op.in]: ['scheduled', 'confirmed', 'in-progress'] },
    appointmentDate: { [Op.gte]: new Date() }  // Future dates only
  }
});
```

#### B. Appointment Date/Time Filtering
- Past appointments shown as upcoming
- Date comparison wrong (string vs Date)
- Timezone mismatch

#### C. Organization Isolation Issue
- Patient appointments filtered by wrong organization
- Multi-tenant data leak or data isolation too strict

#### D. No Appointments in Database
- Bookings actually failed (relates to Issue #1)
- Patient hasn't booked any appointments
- Appointments deleted unexpectedly

**Diagnosis**:
```bash
# Check patient's appointments directly
curl -X GET http://localhost:8000/api/appointments?upcoming=true \
  -H "Authorization: Bearer $TOKEN" | jq

# Check raw database count
curl -X GET http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN" | jq '.length'
```

---

### 8. History - Attended Appointments Not Showing

**Issue**: Past/completed appointments not displaying

**Potential Root Causes**:

#### A. Status Filter Wrong
```javascript
// Issue: Frontend might only look for 'completed'
// But appointments might be 'scheduled', 'cancelled', or 'no-show'

const appointments = await Appointment.findAll({
  where: {
    userId,
    status: 'completed',  // ← Only 'completed'
    appointmentDate: { [Op.lt]: new Date() }  // Past dates only
  }
});
```

**Fix**:
```javascript
const appointments = await Appointment.findAll({
  where: {
    userId,
    status: { [Op.in]: ['completed', 'cancelled', 'no-show'] },
    appointmentDate: { [Op.lt]: new Date() }
  }
});
```

#### B. Date Comparison Failing
- Date stored as string, compared as Date
- Timezone conversion issue
- Past date calculation wrong

#### C. No Completed Appointments
- All appointments still in 'scheduled' state
- Status never updated after appointment
- Completion logic not implemented

**Diagnosis**:
```bash
curl -X GET http://localhost:8000/api/appointments?past=true \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

### 9. Dashboard - Shows Finished Appointments as Pending

**Issue**: Completed appointments still show in "upcoming" widget

**Potential Root Causes**:

#### A. Status Update Not Called
```javascript
// After appointment completes, status should be updated:
await appointment.update({ status: 'completed' });

// But this might not be happening
```

#### B. Dashboard Query Filter Wrong
```javascript
// Issue: Query doesn't check status
const upcomingAppointments = await Appointment.findAll({
  where: { userId },
  order: [['appointmentDate', 'ASC']],
  limit: 5
  // ← Missing: status check and future date check
});

// Should be:
const upcomingAppointments = await Appointment.findAll({
  where: {
    userId,
    status: { [Op.in]: ['scheduled', 'confirmed', 'in-progress'] },
    appointmentDate: { [Op.gte]: new Date() }
  },
  order: [['appointmentDate', 'ASC']],
  limit: 5
});
```

#### C. Frontend Caching Issue
- Old data cached
- Not refreshing on page load
- Stale state not cleared

#### D. Appointment Completion Logic Missing
```javascript
// Is there an endpoint to mark appointment as completed?
// POST /api/appointments/:id/complete
// PATCH /api/appointments/:id (with status: 'completed')
```

---

## Root Cause Summary

| Issue | Root Cause | Fix Complexity |
|-------|-----------|-----------------|
| #1: Booking Failed | Validation error OR doctor not found OR time slot conflict | Medium |
| #2: Lab Test Confirm | Frontend button not wired OR endpoint missing | Low |
| #3: Reports Upload | No upload endpoint OR auth issue OR storage not configured | High |
| #4: Report Tabs | Frontend state not updating OR data not fetched | Low |
| #5: Scan Analysis | AI service down OR image processing error | High |
| #6: Doctor List Empty | No doctors in DB OR fetch endpoint fails OR auth issue | Medium |
| #7: Appointments Not Showing | Status filter wrong OR date comparison issue | Low |
| #8: History Empty | Status filter wrong OR no completed appointments | Low |
| #9: Finished Shows Pending | Status not updated OR query filter wrong | Low |

---

## Testing Checklist

### Prerequisites
```bash
# Get valid token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r '.token')

echo "Token: $TOKEN"
```

### Test Issue #1 (Doctor Booking)
```bash
# 1. Get list of doctors
curl -X GET http://localhost:8000/api/doctors \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0]'

# 2. Try booking appointment with valid doctor ID
DOCTOR_ID=2  # From step 1
curl -X POST http://localhost:8000/api/appointments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"doctorId\": $DOCTOR_ID,
    \"appointmentDate\": \"2026-01-20\",
    \"appointmentTime\": \"14:30\",
    \"consultationType\": \"video\"
  }"
```

### Test Issue #6 (Doctor List)
```bash
curl -X GET http://localhost:8000/api/doctors \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```

### Test Issue #7 (Upcoming Appointments)
```bash
curl -X GET http://localhost:8000/api/appointments?upcoming=true \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

## Next Steps

1. **Immediate**: Run diagnostic tests using curl commands above
2. **Short-term**: Fix Issues #2, #4, #7, #8, #9 (low complexity)
3. **Medium-term**: Fix Issues #1, #6 (medium complexity)
4. **Long-term**: Fix Issues #3, #5 (high complexity, require infrastructure setup)

---

## Files to Review

- `/server/controller/appointment.controller.js` - Appointment creation logic
- `/server/routes/appointment.route.js` - Appointment endpoints
- `/server/routes/patient.route.js` - Patient endpoints
- `/server/models/appointment.model.intelligent.js` - Appointment schema
- Frontend appointment booking component (React/Vue)
- Frontend reports upload component
- `/server/services/ai-health.service.js` - AI analysis service

---

**Investigation Date**: January 13, 2026  
**Last Updated**: 12:45 UTC  
**Next Review**: After running diagnostic tests
