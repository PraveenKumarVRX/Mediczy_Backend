# Mediqzy — Doctor Mobile App API Integration Guide

> **Version:** 2.2 · **Last Updated:** 2026-05-09  
> **Base URL (Production):** `https://api.mediqzy.com`  
> **WebSocket URL:** `https://app.mediqzy.com` (path: `/socket.io`)  
> **LiveKit URL:** `wss://video.mediqzy.com`

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Authentication](#2-authentication)
3. [Doctor Profile](#3-doctor-profile)
4. [Dashboard & Analytics](#4-dashboard--analytics)
5. [Appointment Management](#5-appointment-management)
6. [Availability & Schedule](#6-availability--schedule)
7. [Doctor Settings & Configuration](#7-doctor-settings--configuration)
8. [Prescriptions](#8-prescriptions)
9. [Patient Management](#9-patient-management) *(updated: vitals, history, update)*
10. [Video Consultations (LiveKit)](#10-video-consultations-livekit)
11. [Chat (REST + Socket.IO)](#11-chat-rest--socketio)
12. [Notifications & FCM](#12-notifications--fcm)
13. [AI Scribe & Autocomplete](#13-ai-scribe--autocomplete)
14. [Offline Scribe (Voice-to-Prescription)](#14-offline-scribe-voice-to-prescription)
15. [Clinical Workflow](#15-clinical-workflow)
16. [Revenue & Earnings](#16-revenue--earnings)
17. [Templates & Invoices](#17-templates--invoices)
18. [Triage & Queue Management](#18-triage--queue-management) *(updated: AI image analysis)*
19. [File Uploads](#19-file-uploads)
20. [Attached Pharmacies & Labs](#20-attached-pharmacies--labs)
21. [Alerts & Messages](#21-alerts--messages)
22. [Error Handling](#22-error-handling)
23. [Pagination](#23-pagination)
24. [Rate Limits](#24-rate-limits)
25. [WebSocket Events Reference](#25-websocket-events-reference)
26. [Enums & Constants](#26-enums--constants)
27. [Remote Health Monitoring](#27-remote-health-monitoring) *(new)*
28. [Lab Imaging (RIS-Referred)](#28-lab-imaging-ris-referred) *(new)*
- [Appendix A: Typical Integration Flows](#appendix-a-typical-integration-flows)
- [Appendix B: Mobile App Specific Notes](#appendix-b-mobile-app-specific-notes)
- [Appendix C: Test Credentials](#appendix-c-test-credentials-development--staging)

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| **2.2** | 2026-05-09 | Section 2.1 updated with social media link fields (`socialMedia` object) in registration payload; Section 3.1/3.2 updated with `socialLinks` field in profile response/update; Section 12 expanded with Firebase dual-app architecture, SenderId mismatch root cause, `mismatched-credential` auto-deactivation, and FCM token hygiene guidance; Appendix B FCM section rewritten with sender ID table and dual-SA setup instructions |
| **2.1** | 2026-05-01 | Section 9 expanded with patient update, vitals & history routes; Section 18 expanded with AI triage image analysis; Sections 6.7–6.8 added for mobile SetTimeSlots weekly schedule flow; New Section 27 (Remote Health Monitoring); New Section 28 (Lab Imaging / RIS-Referred); Appendix A flows A.6–A.9 added; Appendix B mobile notes updated; Base URL corrected to `https://app.mediqzy.com/api`; all endpoints smoke-tested and verified |
| **2.0** | 2026-04-09 | Section 21 (Alerts) rewritten with full DB-backed notification API detail; Section 12 updated with alert polling guidance; Appendix C (test credentials) added; Base URL corrected to `https://api.mediqzy.com`; valid `consultationType` values clarified |
| 1.0 | 2026-03-10 | Initial release |

---

## 1. Getting Started

### Base Configuration

```
Production API:   https://api.mediqzy.com
WebSocket:        https://app.mediqzy.com  (path: /socket.io)
LiveKit Server:   wss://video.mediqzy.com
```

### Request Headers

All authenticated requests must include:

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

For file uploads, use `multipart/form-data` instead of `application/json`.

### Response Envelope

All API responses follow a standard envelope:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { }
}
```

On error:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Technical detail"
}
```

### JWT Token Payload (Doctor)

When a doctor authenticates, the JWT contains:

```json
{
  "id": 1,
  "doctorId": 1,
  "email": "doctor@example.com",
  "role": "doctor",
  "userType": "doctor",
  "organization_id": null,
  "iat": 1709000000,
  "exp": 1709604800
}
```

| Setting | Value |
|---------|-------|
| Algorithm | HS256 |
| Token Expiry | 7 days |
| Refresh Token Expiry | 30 days |
| Delivery | `Authorization: Bearer <token>` header |

---

## 2. Authentication

### 2.1 Register

```
POST /api/doctors/register
```

No authentication required.

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | ✅ | Valid email |
| `password` | string | ✅ | Min 6 characters |
| `firstName` | string | ✅ | 3–20 characters |
| `lastName` | string | ✅ | 3–20 characters |
| `phoneNumber` | string | ✅ | Valid mobile number |
| `specialization` | string | ✅ | Non-empty |
| `experience` | integer | ❌ | ≥ 0 |
| `qualifications` | string[] | ❌ | Min 1 item if provided |
| `socialMedia` | object | ❌ | Social media profile links (see below) |
| `socialMedia.facebook` | string | ❌ | Facebook profile URL |
| `socialMedia.instagram` | string | ❌ | Instagram profile URL |
| `socialMedia.linkedin` | string | ❌ | LinkedIn profile URL |
| `socialMedia.youtube` | string | ❌ | YouTube channel URL |

> **Backend mapping:** The `socialMedia` object is internally stored as `social_links` (JSONB column) in the `doctors` table. When reading a profile the field is returned as `socialLinks`. Always send the registration payload key as `socialMedia`.

```json
{
  "email": "dr.smith@example.com",
  "password": "Secure@123",
  "firstName": "John",
  "lastName": "Smith",
  "phoneNumber": "+919876543210",
  "specialization": "Cardiology",
  "experience": 5,
  "qualifications": ["MBBS", "MD Cardiology"],
  "socialMedia": {
    "facebook": "https://facebook.com/dr.smith",
    "instagram": "https://instagram.com/dr.smith",
    "linkedin": "https://linkedin.com/in/dr-smith",
    "youtube": ""
  }
}
```

**Response (201):**

```json
{
  "message": "Doctor registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "doctor": {
    "id": 1,
    "prefix": "Dr.",
    "firstName": "John",
    "lastName": "Smith",
    "email": "dr.smith@example.com",
    "specialization": "Cardiology",
    "experience": 5,
    "phoneNumber": "+919876543210"
  }
}
```

### 2.2 Login

```
POST /api/doctors/login
```

No authentication required. **Rate limited: 10 attempts / 15 minutes.**

> **Note:** Doctors use email + password login (NOT OTP). Patients use OTP-based login.

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |
| `password` | string | ✅ |

```json
{
  "email": "dr.smith@example.com",
  "password": "Secure@123"
}
```

**Response (200):**

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "doctor": {
    "id": 1,
    "firstName": "John",
    "lastName": "Smith",
    "email": "dr.smith@example.com",
    "specialization": "Cardiology",
    "experience": 5,
    "isOnline": true,
    "lastActive": "2026-03-10T12:00:00.000Z"
  }
}
```

**Error Cases:**
- `401` — Invalid email or password
- `403` — "Please use the patient login portal" (cross-role guard)
- `429` — Rate limit exceeded

### 2.3 Google OAuth

```
POST /api/auth/doctor/google
```

**Request Body:**

```json
{
  "idToken": "<google_id_token>"
}
```

### 2.4 Token Refresh

```
POST /api/auth/refresh
```

**Request Body:**

```json
{
  "refreshToken": "<refresh_token>"
}
```

**Response:**

```json
{
  "success": true,
  "token": "<new_access_token>",
  "refreshToken": "<new_refresh_token>"
}
```

### 2.5 Revoke Token / Logout

```
POST /api/auth/revoke
Authorization: Bearer <token>
```

Invalidates the current JWT (JTI-based revocation).

---

## 3. Doctor Profile

### 3.1 Get Profile

```
GET /api/doctors/profile
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "doctor": {
    "id": 1,
    "prefix": "Dr.",
    "firstName": "John",
    "lastName": "Smith",
    "email": "dr.smith@example.com",
    "phoneNumber": "+919876543210",
    "specialization": "Cardiology",
    "experience": 5,
    "qualifications": ["MBBS", "MD"],
    "about": "Senior cardiologist with 5 years experience",
    "languages": ["English", "Hindi"],
    "profileImage": "/uploads/doctors/1/profile.jpg",
    "digitalSignature": "/uploads/doctors/1/signature.png",
    "medicalSeal": "/uploads/doctors/1/seal.png",
    "isOnline": true,
    "isVerified": true,
    "rating": 4.7,
    "consultationFee": 500,
    "onlineConsultationFee": 500,
    "inPersonConsultationFee": 700,
    "clinicAddress": "123 Medical Lane, Mumbai",
    "city": "Mumbai",
    "state": "Maharashtra",
    "registrationNumber": "MH/2020/12345",
    "socialLinks": {
      "facebook": "https://facebook.com/dr.smith",
      "instagram": "https://instagram.com/dr.smith",
      "linkedin": "https://linkedin.com/in/dr-smith",
      "youtube": ""
    },
    "lastActive": "2026-03-10T12:00:00.000Z",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

### 3.2 Update Profile

```
PUT /api/doctors/profile
Authorization: Bearer <token>
```

All fields optional — only send fields you want to update.

**Request Body:**

| Field | Type | Validation |
|-------|------|------------|
| `firstName` | string | Non-empty |
| `lastName` | string | Non-empty |
| `phoneNumber` | string | Non-empty |
| `specialization` | string | Non-empty |
| `experience` | integer | ≥ 0 |
| `about` | string | Max 1000 chars |
| `languages` | string[] | Array |
| `clinicAddress` | string | — |
| `city` | string | — |
| `state` | string | — |
| `registrationNumber` | string | — |
| `socialLinks` | object | Keys: `facebook`, `instagram`, `linkedin`, `youtube` (all optional strings) |

```json
{
  "about": "Senior cardiologist specializing in interventional procedures",
  "languages": ["English", "Hindi", "Tamil"],
  "experience": 6
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "doctor": { /* full doctor object */ }
}
```

### 3.3 Update Settings (Structured)

```
PUT /api/doctors/settings
Authorization: Bearer <token>
```

Accepts three optional sections:

```json
{
  "profile": {
    "firstName": "John",
    "lastName": "Smith",
    "phoneNumber": "+919876543210",
    "specialization": "Cardiology",
    "experience": 5,
    "bio": "Senior cardiologist",
    "qualifications": ["MBBS", "MD"]
  },
  "practice": {
    "consultationFee": 500,
    "slotDuration": 30,
    "isAvailable": true,
    "weeklySchedule": {},
    "practiceLocations": []
  },
  "notifications": {
    "emailNotifications": true,
    "smsNotifications": true,
    "pushNotifications": true
  }
}
```

### 3.4 Update Online Status

```
PUT /api/doctors/status
Authorization: Bearer <token>
```

```json
{
  "isOnline": true
}
```

### 3.5 Update Consultation Types

```
PUT /api/doctors/consultation-types
Authorization: Bearer <token>
```

```json
{
  "online": {
    "available": true,
    "fee": 500.00,
    "duration": 30
  },
  "walkIn": {
    "available": true,
    "fee": 700.00
  },
  "homeVisit": {
    "available": false,
    "fee": 1500.00
  }
}
```

**Validation:** `fee` ≥ 0 (float), `duration` 5–120 (integer).

### 3.6 Upload Media

```
POST /api/doctors/upload/:mediaType
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Path Parameter `mediaType`:** `profilePicture` | `digitalSignature` | `medicalSeal` | `clinicImage`

**Form Field:** `file` — Max 10 MB, allowed types: `jpeg`, `jpg`, `png`, `pdf`, `doc`, `docx`

**Response (200):**

```json
{
  "success": true,
  "mediaType": "profilePicture",
  "url": "/uploads/doctors/1/profile_1709000000.jpg"
}
```

**Alternative — Presigned S3 Upload (2-step):**

Step 1 — Get presigned URL:
```
POST /api/doctors/upload/:mediaType/presign
```
```json
{ "fileName": "profile.jpg", "contentType": "image/jpeg" }
```

Step 2 — Upload directly to S3, then confirm:
```
POST /api/doctors/upload/:mediaType/confirm
```
```json
{ "fileKey": "doctors/1/profile.jpg", "mimeType": "image/jpeg" }
```

---

## 4. Dashboard & Analytics

### 4.1 Dashboard Stats

```
GET /api/doctors/dashboard/stats
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "totalPatients": 45,
  "totalConsultations": 120,
  "rating": 4.7,
  "responseRate": 95,
  "patientGrowth": 12,
  "consultationGrowth": 8,
  "ratingGrowth": 0.1,
  "responseRateGrowth": 2
}
```

Growth fields represent month-over-month percentage change.

### 4.2 Analytics

```
GET /api/doctors/analytics?period=month
Authorization: Bearer <token>
```

| Query Param | Values | Default |
|-------------|--------|---------|
| `period` | `week`, `month`, `quarter`, `year` | `month` |

**Response:** Detailed analytics data including consultation breakdown, revenue trends, patient demographics.

---

## 5. Appointment Management

### 5.1 Get Doctor's Appointments

```
GET /api/appointments/doctor
Authorization: Bearer <token>
```

Returns all appointments for the authenticated doctor.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter: `pending`, `confirmed`, `completed`, `cancelled` |
| `date` | string | Filter by date (YYYY-MM-DD) |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20) |

**Response (200):**

```json
{
  "success": true,
  "appointments": [
    {
      "id": 101,
      "patientId": 19,
      "patientName": "Test User",
      "patientPhone": "+919884089921",
      "patientAge": 36,
      "patientGender": "Male",
      "doctorId": 1,
      "doctorName": "Dr. John Smith",
      "appointmentDate": "2026-03-15",
      "appointmentTime": "10:00",
      "endTime": "10:30",
      "consultationType": "video",
      "status": "confirmed",
      "symptoms": "headache, fever",
      "reason": "Follow-up",
      "paymentStatus": "paid",
      "paymentAmount": 500,
      "meetingLink": "https://video.mediqzy.com/room/apt-101-abc123",
      "rating": null,
      "createdAt": "2026-03-10T08:00:00.000Z",
      "updatedAt": "2026-03-10T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

### 5.2 Get Today's Appointments

```
GET /api/appointments/doctor/today
Authorization: Bearer <token>
```

Returns appointments for the current day only.

### 5.3 Get Appointment by ID

```
GET /api/appointments/:id
Authorization: Bearer <token>
```

### 5.4 Update Appointment Status

```
PATCH /api/appointments/:id/status
Authorization: Bearer <token>
```

```json
{
  "status": "confirmed"
}
```

**Valid status values:** `pending`, `confirmed`, `in-progress`, `completed`, `cancelled`, `no-show`

### 5.5 Complete Appointment

```
POST /api/appointments/:id/complete
Authorization: Bearer <token>
```

Marks appointment as completed.

### 5.6 Complete with Prescription

```
POST /api/appointments/:id/complete-with-prescription
Authorization: Bearer <token>
```

Marks appointment as completed AND creates a draft prescription automatically.

**Response:**

```json
{
  "success": true,
  "message": "Appointment completed with prescription draft",
  "appointment": { /* updated appointment */ },
  "prescription": {
    "id": 42,
    "prescriptionId": "RX170900...",
    "status": "draft"
  }
}
```

### 5.7 Cancel Appointment

```
PATCH /api/appointments/:id/cancel
Authorization: Bearer <token>
```

```json
{
  "reason": "Patient requested cancellation"
}
```

### 5.8 Reschedule Appointment

```
PATCH /api/appointments/:id/reschedule
Authorization: Bearer <token>
```

```json
{
  "appointmentDate": "2026-03-20",
  "appointmentTime": "14:00"
}
```

### 5.9 Submit Rating

```
PATCH /api/appointments/:id/rating
Authorization: Bearer <token>
```

```json
{
  "rating": 5,
  "review": "Excellent doctor"
}
```

### 5.10 Send Reminder

```
POST /api/appointments/:id/remind
Authorization: Bearer <token>
```

Sends push/WhatsApp reminder to the patient.

### 5.11 Download Calendar Event

```
GET /api/appointments/:id/calendar
Authorization: Bearer <token>
```

Returns an `.ics` (iCalendar) file for download.

### 5.12 Initiate Video Call

```
POST /api/doctors/appointments/:appointmentId/initiate-call
Authorization: Bearer <token>
```

Doctor initiates a video call to the patient. Sends push notification and Socket.IO event to patient.

**Response (200):**

```json
{
  "success": true,
  "message": "Call initiated",
  "meetingLink": "https://video.mediqzy.com/room/apt-101-abc123",
  "roomData": { /* room details */ }
}
```

---

## 6. Availability & Schedule

### 6.1 Get Availability

```
GET /api/doctors/:doctorId/availability
```

**Public endpoint** — no auth required.

**Response (200):**

```json
{
  "success": true,
  "availability": [
    {
      "id": 1,
      "doctorId": 1,
      "dayOfWeek": 1,
      "startTime": "09:00",
      "endTime": "17:00",
      "slotDuration": 30,
      "breakTimes": [{ "start": "13:00", "end": "14:00" }],
      "isAvailable": true,
      "allowVideoConsultation": true,
      "allowInPersonConsultation": true,
      "videoConsultationFee": 500,
      "inPersonConsultationFee": 700,
      "maxAppointmentsPerSlot": 1
    }
  ]
}
```

### 6.2 Get Available Slots for a Date

```
GET /api/doctors/:doctorId/available-slots?date=2026-03-15
```

**Public endpoint.** Returns available time slots for a specific date.

### 6.3 Set Availability

```
POST /api/doctors/:doctorId/availability
Authorization: Bearer <token>
```

```json
{
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "17:00",
  "slotDuration": 30,
  "breakTimes": [{ "start": "13:00", "end": "14:00" }],
  "isAvailable": true,
  "allowVideoConsultation": true,
  "allowAudioConsultation": false,
  "allowChatConsultation": false,
  "allowInPersonConsultation": true,
  "videoConsultationFee": 500,
  "inPersonConsultationFee": 700,
  "maxAppointmentsPerSlot": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `dayOfWeek` | integer | 0 = Sunday, 1 = Monday, ... 6 = Saturday |
| `startTime` | string | HH:MM (24-hour) |
| `endTime` | string | HH:MM (24-hour), must be after startTime |
| `slotDuration` | integer | Minutes: 15, 30, 45, or 60 |
| `breakTimes` | array | Array of `{ start, end }` objects |
| `maxAppointmentsPerSlot` | integer | Max concurrent bookings per slot |

### 6.4 Bulk Set Weekly Availability

```
POST /api/doctors/:doctorId/availability/bulk
Authorization: Bearer <token>
```

```json
{
  "schedule": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00", "slotDuration": 30, "isAvailable": true },
    { "dayOfWeek": 2, "startTime": "09:00", "endTime": "17:00", "slotDuration": 30, "isAvailable": true },
    { "dayOfWeek": 0, "isAvailable": false }
  ]
}
```

### 6.5 Update Availability Slot

```
PATCH /api/doctors/:doctorId/availability/:scheduleId
Authorization: Bearer <token>
```

### 6.6 Delete Availability Slot

```
DELETE /api/doctors/:doctorId/availability/:scheduleId
Authorization: Bearer <token>
```

### 6.7 Mobile: Get Weekly Schedule (SetTimeSlots screen)

> Used by the **SetTimeSlots** screen in the doctor mobile app to load the current weekly schedule on open.

```
GET /api/doctors/availability/dashboard
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "dashboard": {
    "weeklyAvailability": {
      "monday":    { "isAvailable": true,  "slots": [{ "startTime": "09:00", "endTime": "17:00", "consultationType": "online", "slotDuration": 30, "maxPatients": 1 }] },
      "tuesday":   { "isAvailable": true,  "slots": [...] },
      "wednesday": { "isAvailable": false, "slots": [] },
      "thursday":  { "isAvailable": true,  "slots": [...] },
      "friday":    { "isAvailable": true,  "slots": [...] },
      "saturday":  { "isAvailable": false, "slots": [] },
      "sunday":    { "isAvailable": false, "slots": [] }
    },
    "statistics": {
      "availableDays": 4,
      "totalSlots": 4,
      "consultationTypes": { "online": true, "walkIn": true, "homeVisit": false }
    }
  }
}
```

**Mobile app access path:** `res.data.dashboard.weeklyAvailability`

### 6.8 Mobile: Save Weekly Schedule (SetTimeSlots screen)

> Used by the **SetTimeSlots** screen in the doctor mobile app to save the full weekly schedule in one call.

```
POST /api/doctors/availability/bulk-update
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "monday":    { "isAvailable": true,  "slots": [{ "startTime": "09:00", "endTime": "17:00", "consultationType": "online",  "slotDuration": 30, "maxPatients": 1 }] },
  "tuesday":   { "isAvailable": true,  "slots": [{ "startTime": "09:00", "endTime": "17:00", "consultationType": "walkIn", "slotDuration": 20, "maxPatients": 2 }] },
  "wednesday": { "isAvailable": false, "slots": [] },
  "thursday":  { "isAvailable": true,  "slots": [{ "startTime": "10:00", "endTime": "16:00", "consultationType": "online",  "slotDuration": 30, "maxPatients": 1 }] },
  "friday":    { "isAvailable": true,  "slots": [{ "startTime": "09:00", "endTime": "14:00", "consultationType": "online",  "slotDuration": 30, "maxPatients": 1 }] },
  "saturday":  { "isAvailable": false, "slots": [] },
  "sunday":    { "isAvailable": false, "slots": [] }
}
```

| Slot Field | Type | Required | Notes |
|---|---|---|---|
| `startTime` | string | ✅ | `HH:MM` 24-hour format |
| `endTime` | string | ✅ | `HH:MM`, must be after `startTime` |
| `consultationType` | string | ✅ | `online` · `walkIn` · `both` |
| `slotDuration` | integer | ❌ | Minutes: 15, 20, 30, 45, 60 |
| `maxPatients` | integer | ❌ | Max concurrent patients per slot (1–10) |

**Response (200):**

```json
{ "success": true, "message": "Weekly availability updated successfully" }
```

**Mobile app integration (api.js):**

```javascript
// Load schedule
const res = await TimeSlots.list(); // → GET /doctors/availability/dashboard
const weekly = res?.data?.dashboard?.weeklyAvailability;

// Save schedule — build the payload per day:
await TimeSlots.create(payload); // → POST /doctors/availability/bulk-update
```

---

## 7. Doctor Settings & Configuration

### 7.1 Get Appointment Configuration

```
GET /api/doctor-settings/appointment-config
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "config": {
    "slotDuration": 15,
    "weeklySchedule": {
      "monday": {
        "isOff": false,
        "online": { "enabled": true, "startTime": "09:00", "endTime": "13:00" },
        "inPerson": { "enabled": true, "startTime": "14:00", "endTime": "18:00" }
      },
      "tuesday": { "isOff": false, "online": { "enabled": true, "startTime": "09:00", "endTime": "13:00" }, "inPerson": { "enabled": true, "startTime": "14:00", "endTime": "18:00" } },
      "wednesday": { "isOff": false, "online": { "enabled": true, "startTime": "09:00", "endTime": "13:00" }, "inPerson": { "enabled": true, "startTime": "14:00", "endTime": "18:00" } },
      "thursday": { "isOff": false, "online": { "enabled": true, "startTime": "09:00", "endTime": "13:00" }, "inPerson": { "enabled": true, "startTime": "14:00", "endTime": "18:00" } },
      "friday": { "isOff": false, "online": { "enabled": true, "startTime": "09:00", "endTime": "13:00" }, "inPerson": { "enabled": true, "startTime": "14:00", "endTime": "18:00" } },
      "saturday": { "isOff": false, "online": { "enabled": true, "startTime": "10:00", "endTime": "13:00" }, "inPerson": { "enabled": false } },
      "sunday": { "isOff": true }
    },
    "offDays": ["sunday"],
    "onlineConsultationEnabled": true,
    "inPersonConsultationEnabled": true,
    "onlineConsultationFee": 500,
    "inPersonConsultationFee": 500
  }
}
```

### 7.2 Update Appointment Configuration

```
PUT /api/doctor-settings/appointment-config
Authorization: Bearer <token>
```

**Request Body:**

| Field | Type | Validation |
|-------|------|------------|
| `slotDuration` | integer | `15`, `30`, `45`, or `60` |
| `offDays` | string[] | Day names: `["sunday", "saturday"]` |
| `onlineConsultationEnabled` | boolean | — |
| `inPersonConsultationEnabled` | boolean | — |
| `onlineConsultationFee` | number | ≥ 0 |
| `inPersonConsultationFee` | number | ≥ 0 |
| `weeklySchedule` | object | Per-day config (see response above) |

Time format: `HH:MM` (24-hour). End time must be after start time.

### 7.3 Update Slot Duration Only

```
PUT /api/doctor-settings/slot-duration
Authorization: Bearer <token>
```

```json
{ "slotDuration": 30 }
```

### 7.4 Update Single Day Schedule

```
PUT /api/doctor-settings/weekly-schedule/:day
Authorization: Bearer <token>
```

`:day` = `monday` | `tuesday` | ... | `sunday`

```json
{
  "isOff": false,
  "online": { "enabled": true, "startTime": "09:00", "endTime": "13:00" },
  "inPerson": { "enabled": true, "startTime": "14:00", "endTime": "18:00" }
}
```

### 7.5 Update Off Days

```
PUT /api/doctor-settings/off-days
Authorization: Bearer <token>
```

```json
{ "offDays": ["sunday", "saturday"] }
```

### 7.6 Get Available Slots (Public)

```
GET /api/doctor-settings/available-slots/:doctorId?date=2026-03-15&type=online
```

**Public endpoint.** Query param `type`: `online` | `in-person` (optional, returns both if omitted).

**Response (200):**

```json
{
  "success": true,
  "doctorId": 1,
  "doctorName": "Dr. John Smith",
  "date": "2026-03-15",
  "dayOfWeek": "saturday",
  "isOffDay": false,
  "slotDuration": 15,
  "slots": {
    "online": ["09:00-09:15", "09:15-09:30", "09:30-09:45"],
    "inPerson": ["14:00-14:15", "14:15-14:30"]
  },
  "fees": {
    "online": 500,
    "inPerson": 700
  }
}
```

---

## 8. Prescriptions

### 8.1 Create Prescription

```
POST /api/prescriptions
Authorization: Bearer <token>
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `diagnosis` | string | ✅ | Primary diagnosis |
| `chiefComplaints` | string or string[] | ❌ | Presenting complaints |
| `appointmentId` | integer | ❌ | Link to appointment |
| `patientId` | integer | ❌ | Patient ID |
| `userId` | integer | ❌ | Alias for patientId |
| `patientName` | string | ❌ | For walk-in patients |
| `patientAge` | integer | ❌ | Patient age |
| `patientGender` | string | ❌ | Patient gender |
| `patientPhone` | string | ❌ | Patient phone |
| `medications` | array | ❌ | See medication schema below |
| `labTests` | array | ❌ | Array of `{ testName, reason }` or strings |
| `instructions` | string[] | ❌ | Patient instructions |
| `vitals` | object | ❌ | `{ bloodPressure, pulse, temperature, weight }` |
| `followUpDate` | date | ❌ | Follow-up date |
| `validityDays` | integer | ❌ | Prescription validity (default: 30) |
| `notes` | string | ❌ | Doctor's notes |

**Medication Schema:**

```json
{
  "name": "Amoxicillin",
  "composition": "500mg",
  "dosage": "1 tablet",
  "frequency": "3 times daily",
  "duration": "5 days",
  "quantity": "15",
  "instructions": "Take after meals"
}
```

Required medication fields: `name`, `dosage`, `frequency`, `duration`.

**Complete Example:**

```json
{
  "appointmentId": 101,
  "patientId": 19,
  "diagnosis": "Acute bronchitis",
  "chiefComplaints": "Cough, fever for 3 days",
  "medications": [
    {
      "name": "Amoxicillin",
      "composition": "500mg",
      "dosage": "1 tablet",
      "frequency": "3 times daily",
      "duration": "5 days",
      "quantity": "15",
      "instructions": "Take after meals"
    },
    {
      "name": "Paracetamol",
      "composition": "500mg",
      "dosage": "1 tablet",
      "frequency": "As needed (max 4/day)",
      "duration": "3 days",
      "quantity": "12"
    }
  ],
  "labTests": [
    { "testName": "CBC", "reason": "Rule out bacterial infection" },
    { "testName": "Chest X-Ray" }
  ],
  "instructions": [
    "Take medications after meals",
    "Drink plenty of fluids",
    "Rest for 2 days"
  ],
  "vitals": {
    "bloodPressure": "120/80",
    "pulse": "72",
    "temperature": "100.4",
    "weight": "70"
  },
  "followUpDate": "2026-03-25",
  "validityDays": 30,
  "notes": "Follow up in 2 weeks if symptoms persist"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Prescription created successfully",
  "prescription": {
    "id": 42,
    "prescriptionId": "RX170900A1B2",
    "prescriptionNumber": "RX-2026-0042",
    "patientName": "Test User",
    "diagnosis": "Acute bronchitis",
    "medicationsCount": 2,
    "status": "draft",
    "createdAt": "2026-03-10T12:00:00.000Z",
    "expiresAt": "2026-04-09T12:00:00.000Z"
  }
}
```

### 8.2 Create from Appointment

```
POST /api/prescriptions/from-appointment/:appointmentId
Authorization: Bearer <token>
```

Same body as above, but `appointmentId` is taken from the URL. Patient details are auto-populated from the appointment.

### 8.3 List Doctor's Prescriptions

```
GET /api/prescriptions/doctor
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "count": 25,
  "prescriptions": [
    {
      "id": 42,
      "prescriptionId": "RX170900A1B2",
      "prescriptionNumber": "RX-2026-0042",
      "patientName": "Test User",
      "diagnosis": "Acute bronchitis",
      "medications": [ /* medication objects */ ],
      "labTests": [ /* lab test objects */ ],
      "status": "issued",
      "createdAt": "2026-03-10T12:00:00.000Z"
    }
  ]
}
```

### 8.4 List Issued Prescriptions

```
GET /api/prescriptions/doctor/issued
Authorization: Bearer <token>
```

Returns only issued prescriptions (max 100).

### 8.5 Get Prescription by ID

```
GET /api/prescriptions/:id
Authorization: Bearer <token>
```

`:id` accepts both numeric ID and string `prescriptionId` (e.g., `RX170900A1B2`).

### 8.6 Update Prescription (Draft Only)

```
PUT /api/prescriptions/:id
Authorization: Bearer <token>
```

**Only updatable when status is `draft`.** Accepts same fields as create (all optional).

Returns `400` if prescription is not in `draft` status.

### 8.7 Update Status

```
PATCH /api/prescriptions/:id/status
Authorization: Bearer <token>
```

```json
{ "status": "issued" }
```

**Valid statuses:** `draft`, `issued`, `dispensed`, `cancelled`, `expired`

When transitioning to `issued`:
- Creates EHR record
- Creates health diary entries
- Triggers n8n automation workflow

### 8.8 Issue Prescription

```
POST /api/prescriptions/:id/issue
Authorization: Bearer <token>
```

Shortcut to change status from `draft` → `issued`. Same side effects as status update above.

### 8.9 Get Prescription HTML (Print)

```
GET /api/prescriptions/:id/html
Authorization: Bearer <token>  (or ?token=<token> query param)
```

Returns print-friendly HTML with doctor header, patient info, medications table, and digital signature.

### 8.10 Download Prescription PDF

```
GET /api/prescriptions/:id/pdf
Authorization: Bearer <token>  (or ?token=<token> query param)
```

Returns PDF file. Content-Type: `application/pdf`.

### 8.11 Share via WhatsApp

```
GET /api/prescriptions/:id/share/whatsapp
Authorization: Bearer <token>
```

Generates a WhatsApp share link.

```
POST /api/prescriptions/:id/share/whatsapp/:phone
Authorization: Bearer <token>
```

Sends prescription directly to a specific phone number via WhatsApp API.

### 8.12 Share with Pharmacy/Lab

```
POST /api/prescriptions/:id/share
Authorization: Bearer <token>
```

```json
{
  "entityId": 5,
  "entityType": "pharmacy",
  "method": "whatsapp",
  "contact": "+919876543210"
}
```

**`entityType`:** `pharmacy` | `lab`  
**`method`:** `email` | `sms` | `whatsapp`

### 8.13 Cancel Prescription

```
DELETE /api/prescriptions/:id
Authorization: Bearer <token>
```

Soft delete — sets status to `cancelled`. Cannot cancel dispensed prescriptions.

---

## 9. Patient Management

### 9.1 Get Doctor's Patients

```
GET /api/doctors/patients
Authorization: Bearer <token>
```

Returns patients who have had appointments with the doctor.

### 9.2 Get All Patients with Stats

```
GET /api/doctors/my-patients
Authorization: Bearer <token>
```

Returns patients with consultation count, last visit, etc.

### 9.3 Create Patient (Walk-in)

```
POST /api/doctors/my-patients/create
Authorization: Bearer <token>
```

Create a patient account on behalf of a walk-in patient.

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "+919876543210",
  "email": "jane@example.com",
  "dateOfBirth": "1990-05-15",
  "gender": "Female",
  "address": "456 Patient Lane, Mumbai"
}
```

### 9.4 Get Prescriptions by Patient

```
GET /api/prescriptions/patient/:patientId
Authorization: Bearer <token>
```

### 9.5 Get Patient Details

```
GET /api/doctors/patients/:patientId
Authorization: Bearer <token>
```

Returns full patient profile (demographics, allergies, blood group, etc.).

**Response (200):**

```json
{
  "success": true,
  "patient": {
    "id": 42,
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-05-15",
    "gender": "Female",
    "bloodGroup": "O+",
    "allergies": ["Penicillin"],
    "chronicConditions": ["Type 2 Diabetes"],
    "totalVisits": 7,
    "lastVisitDate": "2026-04-01T10:00:00.000Z"
  }
}
```

### 9.6 Get Patient Medical History

```
GET /api/doctors/patients/:patientId/history
Authorization: Bearer <token>
```

Returns diagnoses, conditions, past consultations and history entries.

### 9.7 Update Patient Profile

> **New — verified May 2026**

```
PUT /api/doctors/my-patients/:patientId
Authorization: Bearer <token>
Content-Type: application/json
```

Update editable fields on a patient account. All fields are optional (partial update supported).

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+919876543210",
  "email": "jane@example.com",
  "age": 35,
  "gender": "Female",
  "bloodGroup": "O+",
  "city": "Mumbai",
  "allergies": ["Penicillin", "Sulfa"]
}
```

> **Note:** `phone` in the request body is stored as `phoneNumber` in the DB (`users` table).

**Response (200):**

```json
{
  "success": true,
  "patient": { "id": 42, "firstName": "Jane", "lastName": "Doe", "phoneNumber": "+919876543210", "email": "jane@example.com" }
}
```

**Error Cases:**
- `404` — Patient ID not found in `users` table

### 9.8 Record Patient Vitals

> **New — verified May 2026**

```
POST /api/doctors/my-patients/:patientId/vitals
Authorization: Bearer <token>
Content-Type: application/json
```

Record a new vitals snapshot for the patient.

```json
{
  "bp": "120/80",
  "heartRate": 72,
  "temperature": 98.6,
  "spo2": 98,
  "weight": 70,
  "height": 170,
  "bmi": 24.2,
  "notes": "Post-consultation check"
}
```

| Field | Type | Unit | Notes |
|---|---|---|---|
| `bp` | string | mmHg | Format: `"systolic/diastolic"` |
| `heartRate` | integer | bpm | |
| `temperature` | float | °F | |
| `spo2` | integer | % | Oxygen saturation |
| `weight` | float | kg | |
| `height` | float | cm | |
| `bmi` | float | kg/m² | Can be calculated client-side |
| `notes` | string | — | Optional doctor notes |

**Response (200):**

```json
{
  "success": true,
  "message": "Vitals recorded successfully",
  "vitals": { "patientId": 42, "bp": "120/80", "heartRate": 72, ... }
}
```

> **Note:** If the `patient_vitals` table doesn't exist yet (graceful fallback), the endpoint still returns 200 with a warning flag `{ "tableNotReady": true }`.

### 9.9 Add Medical History Entry

> **New — verified May 2026**

```
POST /api/doctors/my-patients/:patientId/history
Authorization: Bearer <token>
Content-Type: application/json
```

Add a clinical history entry for the patient.

```json
{
  "condition": "Hypertension",
  "onset": "2020-01-01",
  "status": "ongoing",
  "notes": "Managed with Amlodipine 5mg daily",
  "icd10Code": "I10"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "History entry added successfully",
  "entry": { "patientId": 42, "condition": "Hypertension", ... }
}
```

**Mobile App API (`api.js`):**

```javascript
export const Patients = {
  list:           (params) => api.get('/doctors/my-patients', { params }),
  create:         (data)   => api.post('/doctors/my-patients/create', data),
  update:         (id, d)  => api.put(`/doctors/my-patients/${id}`, d),
  getDetails:     (id)     => api.get(`/doctors/patients/${id}`),
  getMedicalHistory:(id)   => api.get(`/doctors/patients/${id}/history`),
  recordVitals:   (id, d)  => api.post(`/doctors/my-patients/${id}/vitals`, d),
  addHistory:     (id, d)  => api.post(`/doctors/my-patients/${id}/history`, d),
};
```

---

## 10. Video Consultations (LiveKit)

### Architecture

The video system uses **LiveKit** (WebRTC SFU). Flow:

```
Doctor initiates call
  → POST /api/doctors/appointments/:id/initiate-call
  → Socket event "doctor-initiated-call" sent to patient
  → Patient gets push notification (FCM)
  → Both parties get LiveKit token
  → Both join LiveKit room via SDK
  → On leave, prescription draft is auto-created
```

### 10.1 Get LiveKit Token

```
POST /api/video/room/token
Authorization: Bearer <token>
```

```json
{
  "roomId": "apt-101-abc123",
  "appointmentId": 101
}
```

**Response (200):**

```json
{
  "success": true,
  "roomToken": "eyJ...",
  "roomId": "apt-101-abc123",
  "roomUrl": "wss://video.mediqzy.com",
  "expiresAt": "2026-03-10T16:00:00.000Z",
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "turn:...", "username": "...", "credential": "..." }
  ]
}
```

### 10.2 Get LiveKit Token (Alternative)

```
GET /api/video/livekit/token?roomId=apt-101-abc123&appointmentId=101
Authorization: Bearer <token>
```

or

```
POST /api/video/livekit/token
Authorization: Bearer <token>
```

```json
{ "roomId": "apt-101-abc123", "appointmentId": 101 }
```

**Response (200):**

```json
{
  "success": true,
  "token": "<livekit-jwt>",
  "serverUrl": "wss://video.mediqzy.com",
  "roomName": "apt-101-abc123",
  "video": {
    "meetingId": "apt-101-abc123",
    "meetingLink": "https://video.mediqzy.com/room/apt-101-abc123",
    "joinUrl": "https://video.mediqzy.com/room/apt-101-abc123",
    "livekit": {
      "token": "<livekit-jwt>",
      "serverUrl": "wss://video.mediqzy.com",
      "roomName": "apt-101-abc123"
    }
  },
  "expiresAt": "2026-03-10T16:00:00.000Z"
}
```

### 10.3 Join Room

```
POST /api/video/room/:roomId/join
Authorization: Bearer <token>
```

Lazy-creates room if it doesn't exist. For appointments, verifies the user is either the doctor or the patient.

**Response (200):**

```json
{
  "success": true,
  "message": "Successfully joined video room",
  "roomData": {
    "roomId": "apt-101-abc123",
    "userId": 1,
    "userRole": "doctor",
    "displayName": "Dr. John Smith",
    "joinedAt": "2026-03-10T12:00:00.000Z",
    "appointmentId": 101,
    "videoToken": "<livekit-jwt>",
    "livekit": {
      "token": "<livekit-jwt>",
      "serverUrl": "wss://video.mediqzy.com",
      "roomName": "apt-101-abc123"
    },
    "iceServers": [ /* STUN/TURN servers */ ]
  },
  "roomCapacity": {
    "max": 2,
    "type": "appointment",
    "description": "1-on-1 consultation"
  }
}
```

### 10.4 Leave Room

```
POST /api/video/room/:roomId/leave
Authorization: Bearer <token>
```

```json
{
  "appointmentId": 101,
  "duration": "00:25:30"
}
```

**When the doctor leaves with an appointmentId**, a draft prescription is automatically created:

```json
{
  "success": true,
  "roomId": "apt-101-abc123",
  "leftAt": "2026-03-10T12:30:00.000Z",
  "prescriptionCreated": true,
  "prescription": {
    "prescriptionId": "RX170900A1B2",
    "status": "draft",
    "editUrl": "/api/prescriptions/42"
  }
}
```

### 10.5 Room Status

```
GET /api/video/room/:roomId/status
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "roomStatus": {
    "roomId": "apt-101-abc123",
    "status": "active",
    "roomType": "appointment",
    "capacity": { "max": 2, "type": "appointment" },
    "participants": [
      {
        "identity": "doctor-1",
        "name": "Dr. John Smith",
        "joinedAt": "2026-03-10T12:00:00.000Z",
        "tracks": 2,
        "isSpeaking": false
      }
    ],
    "participantCount": 1,
    "maxParticipants": 2,
    "features": {
      "screenShare": true,
      "recording": true,
      "chat": true,
      "whiteboard": false,
      "fileShare": true
    }
  }
}
```

### 10.6 Create Invite Link (for guests)

```
POST /api/video/room/:roomId/invite
Authorization: Bearer <token>
```

```json
{
  "label": "Family Member",
  "maxUses": 5
}
```

**Response:**

```json
{
  "success": true,
  "invite": {
    "code": "a1b2c3d4e5f6",
    "roomId": "apt-101-abc123",
    "shareableUrl": "https://app.mediqzy.com/video-consultation?room=apt-101-abc123&invite=a1b2c3d4e5f6",
    "expiresIn": "4 hours",
    "expiresAt": "2026-03-10T16:00:00.000Z",
    "maxUses": 5
  }
}
```

### 10.7 Guest Join via Invite (Public)

```
GET /api/video/join/:inviteCode?name=Guest%20Name
```

**No auth required.** Returns LiveKit token for guest.

### 10.8 Video Stats

```
GET /api/doctors/video-consultations/stats
Authorization: Bearer <token>
```

### 10.9 Recent Video Consultations

```
GET /api/doctors/video-consultations/recent
Authorization: Bearer <token>
```

### 10.10 Upcoming Video Consultations

```
GET /api/doctors/video-consultations/upcoming
Authorization: Bearer <token>
```

### 10.11 Video Health Check

```
GET /api/video/health
```

**Public.** Returns LiveKit server status and connectivity info.

### Room ID Convention

For appointment-based rooms, the room ID follows the pattern:
```
apt-{appointmentId}-{hash}
```

**Time window:** Rooms can be joined 15 minutes before to 60 minutes after the appointment time.

---

## 11. Chat (REST + Socket.IO)

### REST Endpoints

#### 11.1 Create Chat Room

```
POST /api/chat/rooms
Authorization: Bearer <token>
```

```json
{
  "id": "room-doctor-1-patient-19",
  "type": "user_team",
  "participants": [1, 19],
  "title": "Dr. Smith - Patient Consultation",
  "description": "Follow-up chat"
}
```

**Room types:** `user_team`, `team_internal`, `whatsapp_customer`, `channel`

#### 11.2 Get Chat Rooms

```
GET /api/chat/rooms
Authorization: Bearer <token>
```

Returns all rooms the user is a participant of.

#### 11.3 Get Messages (Paginated)

```
GET /api/chat/rooms/:roomId/messages?limit=50&offset=0
Authorization: Bearer <token>
```

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `limit` | integer | 50 | 100 |
| `offset` | integer | 0 | — |

**Response (200):**

```json
{
  "success": true,
  "messages": [
    {
      "id": "msg_170900_abc123",
      "roomId": "room-doctor-1-patient-19",
      "userId": 1,
      "userName": "Dr. John Smith",
      "userRole": "doctor",
      "message": "How are you feeling today?",
      "type": "text",
      "timestamp": "2026-03-10T12:00:00.000Z",
      "edited": false,
      "reactions": []
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### 11.4 Send Message

```
POST /api/chat/rooms/:roomId/messages
Authorization: Bearer <token>
```

```json
{
  "message": "Please take the prescribed medication regularly",
  "type": "text"
}
```

| Field | Type | Validation |
|-------|------|------------|
| `message` | string | 1–1000 characters, required |
| `type` | string | `text` (default), `image`, `file` |

> **Note:** Messages are passed through a **profanity filter**. HIGH/CRITICAL severity blocks the message (402). LOW/MEDIUM replaces offensive text with sanitized version.

#### 11.5 Upload Chat File

```
POST /api/chat/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form field: `file` (max 10 MB)

**Response:**

```json
{
  "success": true,
  "fileUrl": "/api/chat/files/170900_abc123_report.pdf",
  "fileName": "report.pdf",
  "fileSize": 1048576,
  "fileMimeType": "application/pdf"
}
```

#### 11.6 Download Chat File

```
GET /api/chat/files/:fileName
Authorization: Bearer <token>
```

### Socket.IO (Real-Time Chat)

See [Section 25: WebSocket Events Reference](#25-websocket-events-reference) for the complete event list.

---

## 12. Notifications & FCM

### Firebase Project Architecture

The SmartHealth platform uses **two separate Firebase projects** — one for each app:

| App | Firebase Project | Sender ID | Service Account on Server |
|-----|-----------------|-----------|---------------------------|
| Patient app (`MSH_M_App`) | `mysmarthealth-b5695` | `325629386163` | ✅ `config/firebase-service-account.json` |
| Doctor app (`MSH_D_App`) | `doctorapp-6c768` | `498597016909` | ⚠️ Pending — `config/firebase-service-account-doctor.json` |

**Current status:** The backend routes doctor push notifications through the patient Firebase project when the doctor SA file is absent. This causes `messaging/mismatched-credential` errors because the FCM token was issued under `doctorapp-6c768` but the backend is using `mysmarthealth-b5695` credentials.

**To fully enable doctor push notifications:**
1. Download the service account for `doctorapp-6c768` from Firebase Console → Project Settings → Service Accounts.
2. Save it as `/home/ubuntu/Mediczy/config/firebase-service-account-doctor.json`.
3. Restart `mediczy-server` — the backend will automatically detect it and use it for `userType: 'doctor'` pushes.

**Token hygiene (auto-deactivation):** The backend now automatically deactivates FCM tokens that respond with any of:
- `messaging/registration-token-not-registered` (app uninstalled)
- `messaging/invalid-registration-token` (malformed token)
- `messaging/mismatched-credential` (token belongs to wrong Firebase project)

### 12.1 Register FCM Token

```
POST /api/fcm/register-token
Authorization: Bearer <token>
```

```json
{
  "fcmToken": "<firebase_cloud_messaging_token>",
  "deviceType": "android",
  "deviceInfo": {
    "model": "Pixel 7",
    "os": "Android 14",
    "appVersion": "1.0.0"
  },
  "skipValidation": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fcmToken` | string | ✅ | Firebase token |
| `deviceType` | string | ✅ | `web`, `android`, `ios` |
| `deviceInfo` | object | ❌ | Device metadata |
| `skipValidation` | boolean | ❌ | Skip Firebase token validation |

> **Important:** When registering a new token, old tokens for the same user are automatically deactivated.

> **Doctor app note:** The FCM token you register must be obtained from the `doctorapp-6c768` Firebase project (the `google-services.json` bundled in `MSH_D_App`). Tokens from this project will produce `messaging/mismatched-credential` on the backend until the doctor service account file is provisioned (see architecture table above). Once the SA file is in place, no code changes are needed in the app.

### 12.2 Remove FCM Token

```
POST /api/fcm/remove-token
Authorization: Bearer <token>
```

```json
{ "fcmToken": "<token_to_remove>" }
```

### 12.3 Get Notifications

```
GET /api/notifications?page=1&limit=20&unreadOnly=false&type=appointment
Authorization: Bearer <token>
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `unreadOnly` | boolean | false | Only unread |
| `type` | string | — | Filter by type |

**Response (200):**

```json
{
  "success": true,
  "notifications": [
    {
      "id": 1,
      "type": "appointment",
      "title": "New Appointment",
      "message": "You have a new appointment with Test User at 10:00 AM",
      "data": { "appointmentId": 101 },
      "isRead": false,
      "createdAt": "2026-03-10T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1
  }
}
```

### 12.4 Get Unread Count

```
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

```json
{ "success": true, "count": 5 }
```

### 12.5 Mark as Read

```
POST /api/notifications/:id/read
Authorization: Bearer <token>
```

### 12.6 Mark All as Read

```
POST /api/notifications/read-all
Authorization: Bearer <token>
```

### 12.7 Delete Notification

```
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

### 12.8 Send Test Notification

```
POST /api/fcm/test
Authorization: Bearer <token>
```

Sends a test push notification to the current user's registered devices.

### 12.9 Doctor Alerts Polling (In-App Feed)

For the in-app alert feed (appointment requests, confirmations, reminders), use the dedicated alerts endpoint rather than the generic notifications endpoint:

```
GET /api/doctors/alerts
Authorization: Bearer <token>
```

**Recommended polling config (React Query / any query client):**

```javascript
{
  queryKey: ['doctorAlerts'],
  queryFn: () => fetch('/api/doctors/alerts', { headers: { Authorization: `Bearer ${token}` } }),
  staleTime: 0,           // always consider data stale so it re-fetches on focus
  refetchInterval: 30000  // poll every 30 seconds
}
```

See [Section 21: Alerts & Messages](#21-alerts--messages) for full endpoint documentation including response shape, mark-read, and dismiss flows.

### Notification Types for Doctors

| Type | Trigger |
|------|---------|
| `appointment` | New appointment booked / cancelled / rescheduled |
| `video_call` | Incoming video call from patient |
| `chat_message` | New chat message |
| `triage` | New triage case |
| `system` | System announcements |
| `prescription` | Prescription dispensed |
| `payment` | Payment received |

---

## 13. AI Scribe & Autocomplete

### 13.1 Generate Prescription from Notes

```
POST /api/ai/generate-prescription
Authorization: Bearer <token>
```

Generates a structured prescription from consultation notes using AI.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `consultationNotes` | string | ✅ | Free-text consultation notes |
| `sessionNotes` | string[] | ❌ | Additional session notes |
| `existingData` | object | ❌ | Pre-filled data to enhance |
| `appointmentId` | integer | ❌ | Link to appointment |
| `patientId` | integer | ❌ | Patient ID |
| `patientName` | string | ❌ | Patient name |
| `patientAge` | integer | ❌ | Patient age |
| `patientGender` | string | ❌ | Patient gender |
| `patientPhone` | string | ❌ | Patient phone |
| `vitals` | object | ❌ | Recorded vitals |
| `saveToDatabase` | boolean | ❌ | Auto-save as draft prescription |

```json
{
  "consultationNotes": "Patient presents with persistent cough for 5 days, mild fever. Chest clear on auscultation. Prescribe Azithromycin 500mg OD for 3 days, Montelukast 10mg OD, and cough syrup. CBC and chest X-ray advised. Follow up in 1 week.",
  "patientName": "Test User",
  "patientAge": 36,
  "patientGender": "Male",
  "vitals": {
    "bloodPressure": "120/80",
    "pulse": "78",
    "temperature": "100.2",
    "weight": "70"
  },
  "appointmentId": 101,
  "saveToDatabase": true
}
```

**Response (200):**

```json
{
  "success": true,
  "prescription": {
    "chiefComplaints": "Persistent cough for 5 days, mild fever",
    "diagnosis": "Acute upper respiratory infection",
    "medications": [
      {
        "name": "Azithromycin",
        "composition": "500mg",
        "dosage": "1 tablet",
        "frequency": "Once daily",
        "duration": "3 days",
        "quantity": "3",
        "instructions": "Take after meals"
      },
      {
        "name": "Montelukast",
        "composition": "10mg",
        "dosage": "1 tablet",
        "frequency": "Once daily at bedtime",
        "duration": "7 days",
        "quantity": "7"
      }
    ],
    "labTests": ["CBC", "Chest X-Ray PA view"],
    "instructions": [
      "Take medications after meals",
      "Drink plenty of warm fluids",
      "Avoid cold beverages"
    ],
    "notes": "Follow up in 1 week"
  },
  "savedPrescription": {
    "id": 42,
    "prescriptionId": "RX170900A1B2",
    "prescriptionNumber": "RX-2026-0042",
    "createdAt": "2026-03-10T12:00:00.000Z"
  },
  "usingFallback": false,
  "timestamp": "2026-03-10T12:00:00.000Z"
}
```

### 13.2 AI Scribe (Field-Level)

```
POST /api/ai/scribe
Authorization: Bearer <token>
```

Process text for a specific prescription field.

```json
{
  "text": "pt has h/o dm type 2 since 5 yrs, on metformin",
  "field": "diagnosis",
  "context": {}
}
```

| `field` values | Description |
|----------------|-------------|
| `diagnosis` | Process diagnosis text |
| `medications` | Process medication text |
| `chiefComplaints` | Process complaints text |

**Response:**

```json
{
  "success": true,
  "processedText": "Type 2 Diabetes Mellitus, diagnosed 5 years ago. Currently on Metformin.",
  "suggestions": ["Consider HbA1c monitoring", "Check renal function"],
  "originalText": "pt has h/o dm type 2 since 5 yrs, on metformin"
}
```

### 13.3 Autocomplete

```
GET /api/ai/autocomplete?q=para&limit=8&type=drug
Authorization: Bearer <token>
```

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search query (min 2 chars) |
| `limit` | integer | Max results (default: 8) |
| `type` | string | Filter: `drug`, `diagnosis`, `symptom`, `labtest`, `instruction`, `dosage`, `abbreviation` |

**Response (200):**

```json
{
  "success": true,
  "suggestions": [
    {
      "text": "Paracetamol 500mg",
      "category": "Analgesic",
      "full": "Paracetamol (Acetaminophen) 500mg",
      "type": "drug",
      "cimsId": "PARA500",
      "dosageOptions": ["500mg", "650mg", "1000mg"]
    },
    {
      "text": "Paroxetine 20mg",
      "category": "SSRI Antidepressant",
      "full": "Paroxetine Hydrochloride 20mg",
      "type": "drug"
    }
  ],
  "count": 2,
  "query": "para"
}
```

### 13.4 Reference Data

```
GET /api/ai/reference/:type
Authorization: Bearer <token>
```

`:type` = `abbreviations` | `diagnoses` | `dosages` | `labtests`

**Response:**

```json
{
  "success": true,
  "type": "abbreviations",
  "data": [
    { "abbr": "DM", "full": "Diabetes Mellitus" },
    { "abbr": "HTN", "full": "Hypertension" }
  ],
  "count": 150
}
```

---

## 14. Offline Scribe (Voice-to-Prescription)

> Local FastAPI service for audio transcription and document generation. Supports Indian languages.

### 14.1 Health Check

```
GET /api/offline-scribe/health
```

**Public.** Returns service status.

### 14.2 Supported Languages

```
GET /api/offline-scribe/languages
```

**Public.** Returns list of supported Indian languages.

### 14.3 Transcribe Audio

```
POST /api/offline-scribe/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | file | ✅ | Audio file (max 50 MB) |
| `language` | string | ❌ | Language code (default: `auto`) |
| `dominant_language` | string | ❌ | Dominant language hint |
| `chunk_seconds` | number | ❌ | Chunk size (default: 30) |
| `vad` | boolean | ❌ | Voice activity detection (default: true) |
| `beam_size` | number | ❌ | Beam search size (default: 1) |

**Supported audio formats:** `wav`, `mp3`, `mpeg`, `webm`, `ogg`, `m4a`, `mp4`, `flac`

**Response (200):**

```json
{
  "success": true,
  "transcription": "Patient ko 5 din se khansi hai, halka bukhar bhi hai...",
  "language": "hi",
  "processing_time_ms": 3500
}
```

### 14.4 Generate Prescription from Dictation

```
POST /api/offline-scribe/prescription
Authorization: Bearer <token>
```

```json
{
  "dictation": "Patient ko 5 din se khansi hai. Azithromycin 500mg do din, Montelukast 10mg raat ko dena.",
  "language": "hi",
  "patient_context": {
    "name": "Test User",
    "age": "36",
    "gender": "Male"
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "formatted_text": "...",
  "structured_data": {
    "chiefComplaints": "Cough for 5 days",
    "diagnosis": "...",
    "medications": [ /* structured medication objects */ ],
    "instructions": [],
    "followUp": "..."
  },
  "document_type": "prescription",
  "language": "hi",
  "processing_time_ms": 2100,
  "ai_badge": "AI-Generated",
  "disclaimer": "This prescription was generated by AI. Please verify before issuing."
}
```

### 14.5 Generate OPD Notes

```
POST /api/offline-scribe/opd-notes
Authorization: Bearer <token>
```

Same request format as prescription. Returns structured OPD notes.

### 14.6 Generate IPD Notes

```
POST /api/offline-scribe/ipd-notes
Authorization: Bearer <token>
```

### 14.7 Generate Discharge Summary

```
POST /api/offline-scribe/discharge
Authorization: Bearer <token>
```

### 14.8 Full Pipeline (Audio → Document)

```
POST /api/offline-scribe/full-pipeline
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Combines transcription + document generation in one call.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | file | ✅ | Audio file |
| `language` | string | ❌ | Language code |
| `document_type` | string | ❌ | `prescription`, `opd_notes`, `ipd_notes`, `discharge_summary` |
| `patient_context` | string | ❌ | JSON string of patient info |
| `chunk_seconds` | number | ❌ | Audio chunk size |
| `vad` | boolean | ❌ | Voice activity detection |
| `beam_size` | number | ❌ | Beam search size |

### 14.9 Batch Processing

```
POST /api/offline-scribe/batch
Authorization: Bearer <token>
```

Process multiple dictations at once (max 10).

```json
{
  "items": [
    {
      "dictation": "Patient 1 notes...",
      "document_type": "prescription",
      "language": "hi",
      "patient_context": { "name": "Patient 1" }
    },
    {
      "dictation": "Patient 2 notes...",
      "document_type": "opd_notes",
      "language": "en"
    }
  ]
}
```

**Response (200):**

```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    { "index": 0, "status": "success", "result": { /* normalized response */ } },
    { "index": 1, "status": "success", "result": { /* normalized response */ } }
  ],
  "errors": []
}
```

---

## 15. Clinical Workflow

### 15.1 SOAP Notes

```
POST /api/doctor/clinical-workflow/soap-notes
Authorization: Bearer <token>
```

```json
{
  "appointmentId": 101,
  "patientId": 19,
  "subjective": "Patient complains of chest pain on exertion",
  "objective": "BP 140/90, HR 88, Chest auscultation - normal S1S2",
  "assessment": "Hypertension Grade 1, rule out IHD",
  "plan": "Start Amlodipine 5mg OD, ECG, 2D Echo, follow up in 1 week"
}
```

### 15.2 ICD-10 Code Search

```
GET /api/doctor/clinical-workflow/icd10/search?q=diabetes&limit=10
Authorization: Bearer <token>
```

### 15.3 CPT Code Search

```
GET /api/doctor/clinical-workflow/cpt/search?q=consultation&limit=10
Authorization: Bearer <token>
```

---

## 16. Revenue & Earnings

### 16.1 Get Revenue Insights

```
GET /api/doctor/revenue?startDate=2026-01-01&endDate=2026-03-10
Authorization: Bearer <token>
```

| Param | Type | Description |
|-------|------|-------------|
| `startDate` | string | YYYY-MM-DD |
| `endDate` | string | YYYY-MM-DD |

### 16.2 Get Monthly Summary

```
GET /api/doctor/revenue/summary
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "totalCharged": 45000.00,
    "totalPaid": 42000.00,
    "avgProfitMargin": 85.5,
    "totalServices": 120,
    "denials": 3
  }
}
```

---

## 17. Templates & Invoices

### 17.1 Document Templates

```
GET /api/doctors/templates
Authorization: Bearer <token>
```

```
POST /api/doctors/templates
Authorization: Bearer <token>
```

```json
{
  "name": "Standard Prescription Template",
  "type": "prescription",
  "content": { /* template structure */ },
  "isDefault": false
}
```

```
PUT /api/doctors/templates/:templateId
Authorization: Bearer <token>
```

```
DELETE /api/doctors/templates/:templateId
Authorization: Bearer <token>
```

### 17.2 Template Settings (Branding)

```
GET /api/doctors/template-settings
Authorization: Bearer <token>
```

```
PUT /api/doctors/template-settings
Authorization: Bearer <token>
```

Configure logo, seal, header/footer for prescriptions, invoices, etc.

### 17.3 Invoices

```
POST /api/doctors/appointments/:appointmentId/invoice
Authorization: Bearer <token>
```

Create an invoice for a completed appointment.

```
GET /api/doctors/invoices
Authorization: Bearer <token>
```

List all invoices.

```
GET /api/doctors/invoices/:invoiceNumber
Authorization: Bearer <token>
```

```
PUT /api/doctors/invoices/:invoiceNumber/status
Authorization: Bearer <token>
```

```json
{ "status": "paid" }
```

---

## 18. Triage & Queue Management

### 18.1 Get Triage Cases

```
GET /api/doctors/triage/cases
Authorization: Bearer <token>
```

### 18.2 Get Triage Stats

```
GET /api/doctors/triage/stats
Authorization: Bearer <token>
```

### 18.3 Accept Triage Case

```
POST /api/doctors/triage/cases/:caseId/accept
Authorization: Bearer <token>
```

### 18.4 Respond to Triage Case

```
POST /api/doctors/triage/cases/:caseId/respond
Authorization: Bearer <token>
```

```json
{
  "response": "Patient needs immediate attention. Start IV fluids.",
  "urgency": "high",
  "action": "admit"
}
```

### 18.5 Accept/Reject Triage Call

```
POST /api/doctors/triage/accept-call
Authorization: Bearer <token>
```

```
POST /api/doctors/triage/reject-call
Authorization: Bearer <token>
```

### 18.6 Queue Management

```
GET /api/doctor/queue
Authorization: Bearer <token>
```

Get current queue state.

### 18.7 AI Image Analysis (Emergency Triage)

> **New — verified May 2026**

Analyze a patient-submitted photo (wound, rash, injury, etc.) using AI vision to generate a structured triage assessment.

```
POST /api/doctors/triage/:caseId/analyze-image
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | ❌ | Photo of wound/symptom (JPEG/PNG, max 10 MB) |

> If no image is provided the endpoint returns a text-only AI assessment based on the case's stored symptom description.

**Response (200):**

```json
{
  "success": true,
  "analysis": {
    "severity": "moderate",
    "diagnosis": "Possible second-degree burn with erythema and blistering",
    "recommendations": [
      "Clean with saline solution",
      "Apply silver sulfadiazine cream",
      "Do not rupture blisters",
      "Follow up in 48 hours or sooner if signs of infection develop"
    ],
    "urgency": "semi-urgent",
    "referral": "Dermatology or burns unit if area exceeds 1% BSA",
    "confidence": 0.82
  }
}
```

| Field | Type | Description |
|---|---|---|
| `severity` | string | `low` · `moderate` · `high` · `critical` |
| `urgency` | string | `routine` · `semi-urgent` · `urgent` · `immediate` |
| `confidence` | float | AI confidence score 0–1 |

**Mobile App Integration (EmergencyTriage.js):**

```javascript
// From gallery
const handleAIAnalyze = async (caseId, useCamera = false) => {
  const result = useCamera
    ? await launchCamera({ mediaType: 'photo', quality: 0.8 })
    : await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
  
  if (!result.assets?.[0]) return;
  
  const form = new FormData();
  form.append('image', {
    uri: result.assets[0].uri,
    type: result.assets[0].type || 'image/jpeg',
    name: result.assets[0].fileName || 'triage.jpg',
  });
  
  const res = await Triage.analyzeImage(caseId, form);
  setAiAnalysis(res.data.analysis);
};
```

**Mobile app API method:**

```javascript
export const Triage = {
  getCases:     ()        => api.get('/doctors/triage/cases'),
  analyzeImage: (id, form) => api.post(`/doctors/triage/${id}/analyze-image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};
```

---

## 19. File Uploads

### Global Upload Config

| Setting | Value |
|---------|-------|
| Max File Size | 10 MB (50 MB for audio) |
| Library | express-fileupload |
| Temp Directory | `/tmp/` |

### 19.1 Upload Medical Report

```
POST /api/reports/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` or `report` | file | ✅ | The file to upload |
| `reportType` | string | ❌ | `xray`, `bloodtest`, `scan`, `prescription`, `general` |
| `reportDate` | string | ❌ | ISO date |
| `notes` | string | ❌ | Additional notes |

**Allowed file types:** `pdf`, `jpg`, `jpeg`, `png`, `gif`, `webp`, `doc`, `docx`  
**Max size:** 10 MB

**Response (201):**

```json
{
  "success": true,
  "message": "Report uploaded successfully",
  "reportId": 42,
  "fileName": "blood-test-march.pdf",
  "fileUrl": "/uploads/reports/1709000000_abc123_blood-test-march.pdf",
  "reportType": "bloodtest",
  "uploadedAt": "2026-03-10T12:00:00.000Z",
  "fileSize": "245.67 KB"
}
```

### 19.2 Doctor Media Upload

See [Section 3.6: Upload Media](#36-upload-media).

### 19.3 Chat File Upload

See [Section 11: Chat](#11-chat-rest--socketio).

---

## 20. Attached Pharmacies & Labs

### 20.1 Get Attached Pharmacies

```
GET /api/doctor-settings/attached-pharmacies
Authorization: Bearer <token>
```

### 20.2 Add Pharmacy

```
POST /api/doctor-settings/attached-pharmacies
Authorization: Bearer <token>
```

```json
{
  "name": "MedPlus Pharmacy",
  "phone": "+919876543210",
  "email": "medplus@example.com",
  "address": "123 Main Street, Mumbai",
  "gstNumber": "27AADCM1234F1Z5",
  "licenseNumber": "MH-PH-2020-12345"
}
```

### 20.3 Remove Pharmacy

```
DELETE /api/doctor-settings/attached-pharmacies/:pharmacyId
Authorization: Bearer <token>
```

### 20.4 Get Attached Labs

```
GET /api/doctor-settings/attached-labs
Authorization: Bearer <token>
```

### 20.5 Add Lab

```
POST /api/doctor-settings/attached-labs
Authorization: Bearer <token>
```

```json
{
  "name": "Dr. Lal PathLabs",
  "phone": "+919876543210",
  "email": "lal@example.com",
  "address": "456 Health Street, Mumbai",
  "accreditation": "NABL"
}
```

### 20.6 Remove Lab

```
DELETE /api/doctor-settings/attached-labs/:labId
Authorization: Bearer <token>
```

---

## 21. Alerts & Messages

The alerts system provides a **DB-backed, real-time notification feed** for doctors. Every alert comes from one of two sources:

1. **DB Notifications** (`notif-*` prefix) — Real per-appointment records stored in the `notifications` table. Created automatically when patients book, cancel, or trigger payment events. ID format: `notif-<db_id>` (e.g., `notif-1203`).
2. **Aggregate Alerts** — Dynamic counts of pending/today's appointments computed on-the-fly from the `appointments` table. Not stored in DB.

> **Mobile App Polling:** Poll `GET /api/doctors/alerts` every **30 seconds** to ensure alerts appear promptly after patient actions.  
> React Query config: `{ staleTime: 0, refetchInterval: 30000 }`

### 21.1 Get Alerts

```
GET /api/doctors/alerts
Authorization: Bearer <token>
```

Returns a merged, filtered list of DB notification alerts and aggregate appointment alerts, with dismissed items removed.

**Response (200):**

```json
{
  "success": true,
  "unreadCount": 2,
  "alerts": [
    {
      "id": "notif-1203",
      "type": "warning",
      "title": "New Appointment Request",
      "message": "Test User has requested an appointment on 2026-04-09 at 10:00 AM (video)",
      "timestamp": "2026-04-09T08:15:00.000Z",
      "category": "appointment",
      "isRead": false,
      "actionRequired": true,
      "data": {
        "appointmentId": 142,
        "patientId": 19,
        "appointmentDate": "2026-04-09",
        "appointmentTime": "10:00",
        "consultationType": "video"
      }
    },
    {
      "id": "notif-1201",
      "type": "info",
      "title": "Appointment Confirmed",
      "message": "Appointment with Test User has been confirmed",
      "timestamp": "2026-04-09T08:10:00.000Z",
      "category": "appointment",
      "isRead": true,
      "actionRequired": false,
      "data": { "appointmentId": 141 }
    },
    {
      "id": "aggregate-pending",
      "type": "warning",
      "title": "Pending Appointments",
      "message": "You have 2 pending appointment requests that need your attention",
      "timestamp": "2026-04-09T08:00:00.000Z",
      "category": "appointment",
      "isRead": false,
      "actionRequired": true,
      "data": { "count": 2 }
    }
  ]
}
```

**Alert ID Format:**

| Pattern | Source | Persisted in DB? |
|---------|--------|-----------------|
| `notif-<number>` | `notifications` table record | ✅ Yes |
| `aggregate-pending` | Pending appointment count | ❌ No |
| `aggregate-today` | Today's appointment count | ❌ No |

**Alert `type` values:** `warning` (for `appointment_request` notifications) · `info` (all others)

**DB Notification Types Returned by This Endpoint:**

| `type` value | When created |
|-------------|-------------|
| `appointment_request` | Patient books a new appointment |
| `appointment` | Appointment status changes |
| `appointment_cancelled` | Appointment cancelled |
| `payment_received` | Payment confirmed |
| `consultation_reminder` | Reminder sent before consultation |
| `consultation_starting` | Consultation is about to start |

### 21.2 Mark Alert as Read

```
PATCH /api/doctors/alerts/:alertId/read
Authorization: Bearer <token>
```

`:alertId` — the `id` from the alert object (e.g., `notif-1203` or `aggregate-pending`).

- For `notif-*` alerts: marks both the Redis state cache **and** the `notifications` DB record (`isRead = true`, `readAt = now()`).
- For `aggregate-*` alerts: marks only the Redis cache.

**Response (200):**

```json
{ "success": true, "message": "Alert marked as read" }
```

### 21.3 Mark All Alerts as Read

```
PATCH /api/doctors/alerts/mark-all-read
Authorization: Bearer <token>
```

Marks **all** aggregate alerts (Redis cache) and **all** unread DB notifications for this doctor as read in a single call.

**Response (200):**

```json
{ "success": true, "message": "All alerts marked as read" }
```

### 21.4 Dismiss Alert

```
DELETE /api/doctors/alerts/:alertId
Authorization: Bearer <token>
```

- For `notif-*` alerts: adds to Redis dismissed set **and** deletes the DB record permanently.
- For `aggregate-*` alerts: adds to Redis dismissed set only (re-appears after 7-day Redis TTL if the condition still applies).

**Response (200):**

```json
{ "success": true, "message": "Alert dismissed" }
```

> **Redis Cache:** Per-doctor alert state (read IDs, dismissed IDs) is cached at key `doctor:alerts:state:<doctorId>` with a **7-day TTL**.

### 21.5 Alert Notification Flow

When a patient books an appointment, the full server-side chain is:

```
POST /api/appointments  (patient app)
  └─ appointment.controller.js
       └─ notificationService.notifyAppointmentRequest(appointment)
            └─ notification.service.js: creates notifications table record
                 { userId: doctorId, userType: 'doctor',
                   type: 'appointment_request', isRead: false }
                      └─ GET /api/doctors/alerts (doctor polls every 30s)
                           └─ Returns as { id: "notif-<db_id>", actionRequired: true, ... }
```

> **Note:** The notification service also attempts email and WhatsApp delivery. Those channels may fail silently in production (resulting in `status: 'failed'` in the DB row) without affecting the in-app alert visibility.

### 21.6 Get Messages (Inbox)

```
GET /api/doctors/messages
Authorization: Bearer <token>
```

### 21.7 Mark Message as Read

```
PATCH /api/doctors/messages/:messageId/read
Authorization: Bearer <token>
```

### 21.8 Reply to Message

```
POST /api/doctors/messages/reply
Authorization: Bearer <token>
```

```json
{
  "messageId": 5,
  "reply": "I will see you next Tuesday at 10 AM."
}
```

---

## 22. Error Handling

### Standard Error Response

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Technical error detail"
}
```

### Validation Error Response

```json
{
  "success": false,
  "errors": [
    {
      "type": "field",
      "msg": "Must be a valid email",
      "path": "email",
      "location": "body",
      "value": "invalid-email"
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful request |
| `201` | Created | Resource created (registration, prescription, etc.) |
| `400` | Bad Request | Validation error, invalid data |
| `401` | Unauthorized | Missing/invalid/expired token |
| `403` | Forbidden | Insufficient permissions or wrong role |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate resource (e.g., room already exists) |
| `410` | Gone | Expired resource (e.g., invite link) |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Internal error |
| `503` | Service Unavailable | Dependency down (e.g., offline scribe service) |

### Authentication Errors

| Scenario | Status | Message |
|----------|--------|---------|
| No token provided | `401` | "Access denied. No token provided" |
| Invalid token | `401` | "Invalid or expired token" |
| Expired token | `401` | "Token expired" |
| Wrong role | `403` | "Forbidden: insufficient role" |
| Cross-role guard | `403` | "Please use the patient login portal" |
| Account not found | `401` | "Doctor not found" |

---

## 23. Pagination

### Page-Based (Default)

Used by most listing endpoints.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number (≥ 1) |
| `limit` | integer | 20 | Items per page |

**Response Shape:**

```json
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

### Offset-Based (Chat Messages)

**Query Parameters:**

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `limit` | integer | 50 | 100 |
| `offset` | integer | 0 | — |

**Response Shape:**

```json
{
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## 24. Rate Limits

| Scope | Limit | Window |
|-------|-------|--------|
| Global API | 300 requests | 15 minutes |
| Login / Register | 10 requests | 15 minutes |
| Password Reset | Custom | — |

When rate limited, the API returns:

```
HTTP 429 Too Many Requests
```

```json
{
  "success": false,
  "message": "Too many requests, please try again later"
}
```

---

## 25. WebSocket Events Reference

### Connection

```javascript
import { io } from "socket.io-client";

const socket = io("https://app.mediqzy.com", {
  transports: ["websocket", "polling"],
  path: "/socket.io"
});

// Register connection
socket.emit("user-connect", {
  userId: doctorId,
  userType: "doctor",
  fcmToken: "<firebase_token>"
});
```

### Configuration

| Setting | Value |
|---------|-------|
| Path | `/socket.io` |
| Transports | `websocket`, `polling` |
| Ping Interval | 25,000 ms |
| Ping Timeout | 20,000 ms |
| Adapter | Redis (for cluster mode) |

### Doctor Room

After connecting, the doctor is automatically placed in room `doctor-{userId}`.

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user-connect` | `{ userId, userType: "doctor", fcmToken }` | Register connection |
| `send-message` | `{ conversationId, senderId, receiverId, content, type, senderType: "doctor" }` | Send chat message |
| `get-chat-history` | `{ conversationId }` | Fetch chat history |
| `mark-messages-read` | `{ conversationId, userId }` | Mark messages as read |
| `get-conversations` | `{ userId }` | Get active conversations |
| `video-call-invitation` | `{ callerId, callerName, recipientId, appointmentId, meetingLink }` | Send video call invite |
| `update-fcm-token` | `{ userId, fcmToken, userType: "doctor", deviceType }` | Update FCM token |
| `video-join` | `{ channel, uid }` | Join video room (WebRTC) |
| `video-offer` | `{ channel, sdp, type, uid }` | WebRTC SDP offer |
| `video-answer` | `{ channel, sdp, type, uid }` | WebRTC SDP answer |
| `video-ice` | `{ channel, candidate }` | ICE candidate |
| `video-leave` | `{ channel }` | Leave video room |

### Server → Client Events (Listen For)

| Event | Payload | Description |
|-------|---------|-------------|
| `user-status-change` | `{ userId, isOnline }` | User online/offline |
| `new-message` | `{ conversationId, message }` | New chat message received |
| `message-notification` | `{ senderId, senderName, content, conversationId }` | Message notification |
| `video-call-invitation` | `{ callerId, callerName, appointmentId, meetingLink, callType }` | Incoming video call |
| `doctor-initiated-call` | `{ appointmentId, doctorName, doctorId, meetingLink, callInitiatedAt }` | Doctor-initiated call ack |
| `triage-call-request` | `{ appointmentId, patientName, urgency, roomId }` | Incoming triage call request |
| `triage-call-accepted` | `{ appointmentId, doctorName, roomId, timestamp }` | Triage call accepted |
| `triage-call-rejected` | `{ appointmentId, reason, timestamp }` | Triage call rejected |
| `notification` | `{ type, timestamp, ... }` | Generic push notification |
| `claim:update` | `{ type, claimId, status }` | Insurance claim update |
| `preauth:update` | `{ type, preAuthId, status }` | Pre-auth update |
| `authenticated` | `{ success: true, userId }` | Auth confirmation |

---

## 26. Enums & Constants

### Consultation Types

| Value | Description |
|-------|-------------|
| `video` | Video consultation (LiveKit) |
| `audio` | Audio-only consultation |
| `chat` | Text-based consultation |
| `in-person` | In-person / walk-in |

### Appointment Status

| Value | Description |
|-------|-------------|
| `pending` | Awaiting confirmation |
| `confirmed` | Doctor confirmed |
| `in-progress` | Currently in progress |
| `completed` | Consultation completed |
| `cancelled` | Cancelled by either party |
| `no-show` | Patient didn't show up |

### Prescription Status

| Value | Description |
|-------|-------------|
| `draft` | Editable draft |
| `issued` | Finalized and sent to patient |
| `dispensed` | Dispensed by pharmacy |
| `cancelled` | Cancelled by doctor |
| `expired` | Past validity date |

### Days of Week (Availability)

| Value | Day |
|-------|-----|
| `0` | Sunday |
| `1` | Monday |
| `2` | Tuesday |
| `3` | Wednesday |
| `4` | Thursday |
| `5` | Friday |
| `6` | Saturday |

### Device Types (FCM)

| Value | Description |
|-------|-------------|
| `android` | Android device |
| `ios` | iOS device |
| `web` | Web browser |

### Chat Message Types

| Value | Description |
|-------|-------------|
| `text` | Text message |
| `image` | Image attachment |
| `file` | File attachment |

### Revenue Claim Status

| Value |
|-------|
| `pending` |
| `submitted` |
| `in_review` |
| `approved` |
| `partially_paid` |
| `paid` |
| `denied` |
| `appealed` |
| `written_off` |

### Offline Scribe Document Types

| Value | Description |
|-------|-------------|
| `prescription` | Generate prescription |
| `opd_notes` | Generate OPD notes |
| `ipd_notes` | Generate IPD notes |
| `discharge_summary` | Generate discharge summary |

### Media Upload Types

| Value | Description |
|-------|-------------|
| `profilePicture` | Doctor profile photo |
| `digitalSignature` | Digital signature image |
| `medicalSeal` | Medical practice seal |
| `clinicImage` | Clinic / practice photo |

---

## 27. Remote Health Monitoring

The Remote Health Monitoring module lets a doctor track patients enrolled in continuous vital monitoring programs (IoT devices, wearables, or manual submissions).

### 27.1 Get Monitored Patients

```
GET /api/doctors/health-monitoring/patients
Authorization: Bearer <token>
```

Returns patients assigned to the doctor's monitoring panel with latest vitals and alert status.

**Response (200):**

```json
{
  "success": true,
  "patients": [
    {
      "id": 42,
      "name": "Jane Doe",
      "age": 35,
      "condition": "Hypertension",
      "vitals": {
        "bp": "138/88",
        "heartRate": 82,
        "spo2": 97,
        "temperature": 98.4,
        "recordedAt": "2026-05-01T08:00:00.000Z"
      },
      "alertLevel": "warning",
      "alerts": [
        { "type": "bp_high", "value": "138/88", "threshold": "130/80", "timestamp": "2026-05-01T08:00:00.000Z" }
      ],
      "lastUpdated": "2026-05-01T08:00:00.000Z",
      "enrolledSince": "2026-01-15T00:00:00.000Z"
    }
  ]
}
```

| `alertLevel` | Meaning |
|---|---|
| `normal` | All vitals within range |
| `warning` | One or more vitals slightly out of range |
| `critical` | Immediate attention required |

### 27.2 Get Patient Vital Trends

```
GET /api/doctors/health-monitoring/patients/:patientId/trends
Authorization: Bearer <token>
```

**Query Params:** `?metric=bp|heartRate|spo2&days=7|14|30`

Returns time-series data for charting vital trends (used in the **RemoteMonitoring** screen with `LineChart`).

**Response (200):**

```json
{
  "success": true,
  "trends": {
    "metric": "heartRate",
    "days": 7,
    "data": [
      { "date": "2026-04-25", "value": 78, "timestamp": "2026-04-25T08:00:00.000Z" },
      { "date": "2026-04-26", "value": 80, "timestamp": "2026-04-26T08:15:00.000Z" }
    ],
    "stats": { "min": 70, "max": 88, "avg": 79 }
  }
}
```

**Mobile App API (`api.js`):**

```javascript
export const HealthMonitoring = {
  getPatients:  ()            => api.get('/doctors/health-monitoring/patients'),
  getTrends:    (id, params)  => api.get(`/doctors/health-monitoring/patients/${id}/trends`, { params }),
};
```

---

## 28. Lab Imaging (RIS-Referred)

Doctors can view radiology imaging studies that have been referred via the RIS (Radiology Information System). This is a **read-only** view — studies are created by the lab/radiology team.

### 28.1 List Referred Imaging Studies

```
GET /api/doctors/ris-referred
Authorization: Bearer <token>
```

Returns imaging studies referred to or associated with this doctor's patients.

**Query Params:**

| Param | Type | Description |
|---|---|---|
| `modality` | string | Filter: `CT` · `MRI` · `USG` · `ECHO` · `XRAY` · `PET` |
| `status` | string | `pending` · `reported` · `reviewed` |
| `patientId` | integer | Filter by patient |
| `page` | integer | Default: 1 |
| `limit` | integer | Default: 20 |

**Response (200):**

```json
{
  "success": true,
  "studies": [
    {
      "id": 101,
      "patientName": "Jane Doe",
      "patientId": 42,
      "modality": "CT",
      "bodyPart": "Chest",
      "description": "CT Chest with contrast — rule out PE",
      "reportStatus": "reported",
      "reportText": "No evidence of pulmonary embolism. Mild bilateral pleural effusion.",
      "reportedAt": "2026-04-30T14:30:00.000Z",
      "referredAt": "2026-04-29T10:00:00.000Z",
      "fileId": 55,
      "accessionNumber": "RIS-2026-101"
    }
  ],
  "pagination": { "total": 12, "page": 1, "limit": 20, "pages": 1 }
}
```

### 28.2 Get Study Detail

```
GET /api/doctors/ris-referred/:studyId
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "study": { "id": 101, "patientName": "Jane Doe", "modality": "CT", "reportText": "...", "fileId": 55, ... }
}
```

### 28.3 Get Study File (DICOM / PDF Report)

```
GET /api/doctors/ris-referred/file/:fileId
Authorization: Bearer <token>
```

Returns the study file (DICOM viewer link or PDF report). In the mobile app, this URL is opened via `Linking.openURL()` for external viewer or download.

**Response:** File download or redirect to signed S3 URL.

**Mobile App Integration (ImagingScreen.js):**

```javascript
import { Linking } from 'react-native';

// List studies
const res = await DoctorImaging.list({ modality: selectedModality });
setStudies(res.data.studies);

// Open/download report
const fileUrl = DoctorImaging.getFileUrl(study.fileId);
await Linking.openURL(fileUrl);
```

**Mobile App API (`api.js`):**

```javascript
export const DoctorImaging = {
  list:       (params) => api.get('/doctors/ris-referred', { params }),
  getById:    (id)     => api.get(`/doctors/ris-referred/${id}`),
  getFileUrl: (id)     => `${BASE_URL}/doctors/ris-referred/file/${id}`,
};
```

**Modality Color Codes (ImagingScreen UI):**

| Modality | Color |
|---|---|
| CT | `#3B82F6` (blue) |
| MRI | `#8B5CF6` (purple) |
| USG | `#10B981` (green) |
| ECHO | `#F59E0B` (amber) |
| XRAY | `#6B7280` (gray) |
| PET | `#EF4444` (red) |
| Other | `#64748B` (slate) |

---

## Appendix A: Typical Integration Flows

### A.1 Doctor Login → Dashboard

```
1. POST /api/doctors/login         → Get JWT token
2. POST /api/fcm/register-token    → Register push notification token
3. GET  /api/doctors/profile       → Load doctor profile
4. GET  /api/doctors/dashboard/stats → Load dashboard data
5. GET  /api/appointments/doctor/today → Load today's appointments
6. GET  /api/notifications?unreadOnly=true → Load unread notifications
7. Socket.IO connect + emit "user-connect"  → Enable real-time events
```

### A.2 Appointment → Video Call → Prescription

```
1. GET  /api/appointments/doctor/today  → See today's schedule
2. PATCH /api/appointments/:id/status   → Confirm appointment { status: "confirmed" }
3. POST /api/doctors/appointments/:id/initiate-call → Start call (sends push to patient)
4. POST /api/video/livekit/token        → Get LiveKit token
5. POST /api/video/room/:roomId/join    → Join video room
   ↳ Use LiveKit SDK to connect with token
6. POST /api/video/room/:roomId/leave   → Leave room (auto-creates draft Rx)
7. PUT  /api/prescriptions/:id          → Edit the draft prescription
8. POST /api/prescriptions/:id/issue    → Finalize (sends to patient, creates EHR)
9. GET  /api/prescriptions/:id/pdf      → Download PDF copy
```

### A.3 AI-Assisted Prescription

```
1. (During/after consultation, doctor dictates notes)
2. POST /api/ai/generate-prescription   → AI generates structured Rx from notes
   ↳ Set saveToDatabase: true to auto-save as draft
3. PUT  /api/prescriptions/:id          → Doctor reviews and edits
4. POST /api/prescriptions/:id/issue    → Finalize
```

### A.4 Voice-to-Prescription (Offline Scribe)

```
1. Record audio of doctor dictating prescription
2. POST /api/offline-scribe/full-pipeline  → Upload audio (multipart)
   ↳ Returns transcription + structured prescription
3. POST /api/prescriptions               → Save as prescription
4. POST /api/prescriptions/:id/issue     → Finalize
```

### A.5 Schedule Management (Web / Doctor Settings)

```
1. GET  /api/doctor-settings/appointment-config  → Load current config
2. PUT  /api/doctor-settings/appointment-config  → Update fees, slot duration
3. PUT  /api/doctor-settings/weekly-schedule/monday → Set Monday hours
4. PUT  /api/doctor-settings/off-days → Set off days
5. POST /api/doctors/:id/availability/bulk → Bulk set weekly schedule
```

### A.6 Mobile: Weekly Schedule Setup (SetTimeSlots screen)

```
1. GET  /api/doctors/availability/dashboard       → Load weekly schedule on screen open
   Response: { dashboard: { weeklyAvailability: { monday: { isAvailable, slots }, ... } } }
2. (Doctor edits days, times, slot duration, consultation type)
3. POST /api/doctors/availability/bulk-update     → Save on tap "Save Schedule"
   Body: { monday: { isAvailable: true, slots: [{startTime, endTime, consultationType, slotDuration, maxPatients}] }, ... }
```

### A.7 Walk-in Patient Registration & Vitals

```
1. POST /api/doctors/my-patients/create           → Create walk-in patient account
   Body: { firstName, lastName, phoneNumber, email, dateOfBirth, gender }
2. GET  /api/doctors/my-patients                  → Confirm patient appears in list
3. POST /api/doctors/my-patients/:id/vitals       → Record initial vitals
   Body: { bp, heartRate, temperature, spo2, weight, height }
4. POST /api/doctors/my-patients/:id/history      → Add presenting condition
   Body: { condition, onset, status, notes }
5. POST /api/prescriptions                        → Issue prescription if needed
```

### A.8 Emergency Triage with AI Image Analysis

```
1. GET  /api/doctors/triage/cases                 → Poll triage queue (refresh every 30s)
2. (Doctor sees new case, opens detail modal)
3. POST /api/doctors/triage/:caseId/analyze-image → Submit patient photo for AI analysis
   Content-Type: multipart/form-data; field: image (JPEG/PNG)
   Response: { analysis: { severity, diagnosis, recommendations, urgency, confidence } }
4. POST /api/doctors/triage/cases/:caseId/respond → Doctor responds with action
   Body: { action: "prescribe"|"admit"|"refer"|"self_care", details }
```

### A.9 Lab Imaging Review (ImagingScreen)

```
1. GET  /api/doctors/ris-referred                 → List imaging studies (on screen mount)
   Params: ?modality=CT|MRI|USG|ECHO|XRAY (optional filter)
2. GET  /api/doctors/ris-referred/:studyId        → Load study detail on tap
3. GET  /api/doctors/ris-referred/file/:fileId    → Open/download report (via Linking.openURL)
```

---

## Appendix B: Mobile App Specific Notes

### Token Storage

Store the JWT token securely:
- **Android:** EncryptedSharedPreferences or Android Keystore
- **iOS:** Keychain Services

### Token Expiry Handling

- Token expires in **7 days**
- Refresh token expires in **30 days**
- On `401` response, attempt token refresh via `POST /api/auth/refresh`
- If refresh fails, redirect to login screen

### Background Notifications

- Register FCM token immediately after login
- Re-register on app launch (token may change)
- Handle notification payloads for: appointments, video calls, chat messages, triage

### Firebase Configuration (Doctor App)

The doctor app (`MSH_D_App`) uses Firebase project **`doctorapp-6c768`** with sender ID **`498597016909`**. The `google-services.json` in `android/app/` is already configured correctly.

**Current push delivery status:**
- Patient push notifications: ✅ fully working (`mysmarthealth-b5695`)
- Doctor push notifications: ⚠️ blocked until the `doctorapp-6c768` service account is provisioned on the backend (see Section 12)

**What to do when `messaging/mismatched-credential` appears in logs:**
1. The backend will automatically deactivate the token — no action needed from the app.
2. On next login / app launch, re-register the FCM token via `POST /api/fcm/register-token`.
3. Delivery will resume once `config/firebase-service-account-doctor.json` is placed on the server.

### Video Call Integration

- Use **LiveKit SDK** for Android/iOS
- Server URL: `wss://video.mediqzy.com`
- Get room token from API, then connect via LiveKit SDK
- Handle incoming call notifications via FCM + Socket.IO `video-call-invitation` event

### Imaging Studies (ImagingScreen)

- Lists RIS-referred studies: `GET /api/doctors/ris-referred`
- Filter chips (CT/MRI/USG/ECHO/XRAY) pass `?modality=` query param
- Open DICOM/PDF: `Linking.openURL(DoctorImaging.getFileUrl(study.fileId))`
- Accessible via Sidebar → **Lab Imaging**

### Emergency Triage

- **EmergencyTriage** screen polls `GET /api/doctors/triage/cases` for new cases
- "Analyze Photo" / "Camera" buttons → `POST /api/doctors/triage/:id/analyze-image`
- Photo picker: `react-native-image-picker` (gallery) or camera
- AI result displays: severity badge, diagnosis text, recommendations list

### Patient Management

- **PatientsList** screen: `GET /api/doctors/my-patients` (search + pagination)
- **PatientDetails** screen: `GET /api/doctors/patients/:id` + `GET /api/doctors/patients/:id/history`
- Record vitals inline: `POST /api/doctors/my-patients/:id/vitals`
- Edit patient demographics: `PUT /api/doctors/my-patients/:id`
- Add history entry: `POST /api/doctors/my-patients/:id/history`

### SetTimeSlots (Weekly Schedule)

- On screen open: `GET /api/doctors/availability/dashboard` → `res.data.dashboard.weeklyAvailability`
- On save: `POST /api/doctors/availability/bulk-update` with full day-keyed payload
- Supports online/walkIn mode toggle, slot duration (15/20/30/45/60 min), max patients (1–10)

### Offline Support

- Cache doctor profile, today's appointments, and recent prescriptions
- Queue prescription creates/updates when offline, sync when online
- Audio recordings for offline scribe can be uploaded when connectivity returns

### HIPAA/Session Timeout

- Server enforces 15-minute idle timeout
- App should implement auto-lock after inactivity
- Store no PHI in plaintext local storage

---

## Appendix C: Test Credentials (Development / Staging)

These credentials are verified against the production API and can be used for integration testing.

> ⚠️ **Do not commit these credentials to public repositories.**

### Patient Account

| Field | Value |
|-------|-------|
| Email | `user@mediczy.com` |
| Password | `User123` |
| Login endpoint | `POST /api/auth/login` |
| Patient ID | `19` |
| Display name | Test User |

### Doctor Account

| Field | Value |
|-------|-------|
| Email | `doctor@mediczy.com` |
| Password | `Doctor123` |
| Login endpoint | `POST /api/doctors/login` |
| Doctor ID | `70` |
| Display name | Nandita Agarwal (General Physician) |
| Hospital | Mediczy Test Hospital |

### Security / Staff Account

| Field | Value |
|-------|-------|
| Email | `security@mediczy.com` |
| Password | `Security@123` |
| Login endpoint | `POST /api/hospital/staff/security/login` |
| Staff ID | `4883` |
| Login URL | `https://app.mediqzy.com/security/login` |

### E2E Appointment Notification Test Flow

```
1. Login as patient  →  POST /api/auth/login  →  save patient token
2. Login as doctor   →  POST /api/doctors/login  →  save doctor token
3. Patient books appointment:
   POST /api/appointments
   { doctorId: 70, consultationType: "video", appointmentDate: "YYYY-MM-DD",
     appointmentTime: "HH:MM", symptoms: "..." }
4. Doctor polls alerts (≤ 30 s later):
   GET /api/doctors/alerts  →  expect notif-* alert with type "appointment_request"
5. Doctor marks read:
   PATCH /api/doctors/alerts/notif-<id>/read  →  { success: true }
6. Bulk read:
   PATCH /api/doctors/alerts/mark-all-read    →  { success: true }
```

**Valid `consultationType` values (as of v2.0):** `video` · `audio` · `chat` · `in-person`  
`online` is **not** a valid value and will be rejected by the validator.

---

*Document generated for Mediqzy Doctor Mobile App development. All endpoints verified against the production server codebase.*
