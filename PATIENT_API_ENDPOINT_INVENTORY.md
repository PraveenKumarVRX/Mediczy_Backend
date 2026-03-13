# Mediczy Patient-Accessible API Endpoint Inventory

> **Generated**: 2026-03-13  
> **Scope**: All endpoints accessible to patients (using `authUser`, `auth`, or no auth)  
> **Base URL**: `https://app.mediqzy.com` (or `http://localhost:3000` in dev)

---

## Table of Contents
1. [Authentication & Login Flow](#1-authentication--login-flow)
2. [Auth Middleware Summary](#2-auth-middleware-summary)
3. [Rate Limits](#3-rate-limits)
4. [Endpoint Inventory (by Feature Area)](#4-endpoint-inventory)

---

## 1. Authentication & Login Flow

The patient app supports **three login methods**:

### Method A: Email + Password Login
```
POST /api/users/login
Body: { "email": "user@example.com", "password": "password123" }
Response: { success, token, user: { id, firstName, lastName, email, phoneNumber, role } }
```

### Method B: OTP Login (Passwordless) — Email or Phone
```
Step 1: POST /api/users/login/send-otp
Body: { "identifier": "user@example.com" }  OR  { "identifier": "9876543210" }
Response: { success, data: { otpId, expiresAt, deliveryMethod, sentTo } }

Step 2: POST /api/users/login/verify-otp
Body: { "identifier": "user@example.com", "code": "123456" }
Response: { success, token, user: { id, firstName, lastName, email, ... } }
```
- If identifier is an email → OTP sent via email
- If identifier is a phone → OTP sent via WhatsApp

### Method C: Registration (OTP-verified)
```
Step 1: POST /api/users/register/send-otp         → sends OTPs to email + WhatsApp
Step 2: POST /api/users/register/verify-email-otp  → verify email OTP
Step 3: POST /api/users/register/verify-whatsapp-otp → verify WhatsApp OTP
Step 4: POST /api/users/register/verify-otp        → complete registration with both verified
```

### Legacy Auth Aliases (mobile compat)
```
POST /api/auth/send-otp   → forwards to /api/users/login/send-otp
POST /api/auth/verify-otp → forwards to /api/users/login/verify-otp
```

---

## 2. Auth Middleware Summary

| Middleware | Description |
|---|---|
| `authUser` | JWT-based. Extracts token from `Authorization: Bearer <token>`. Looks up user in DB by decoded role (user/doctor/nurse/assistant/corporate). Binds tenant context. Returns 401 if no token or invalid. |
| `auth` | Lightweight JWT check. Verifies token and sets `req.user = decoded`. No DB lookup. Used by fitness/AI/health routes. |
| `authDoctor` | Like `authUser` but requires `role === 'doctor'`. |
| `authUserOptional` | Like `authUser` but continues if no token (for endpoints that work with or without auth). |
| `requireRole('role')` | After `authUser`, checks `req.userRole` matches specified role. |
| `requireAppKey` | Checks `X-App-Key` header for mobile API key validation. |

---

## 3. Rate Limits

| Scope | Window | Max Requests | Applied To |
|---|---|---|---|
| **Global** | 15 min | 300 | All `/api/*` endpoints |
| **Auth** | 15 min | 10 (skip successful) | `/api/users/login`, `/api/users/register`, `/api/doctors/login` |
| **AI** | 15 min | 60 | `/api/ai/*`, `/api/medical-ai/*` |
| **AI Image** | 15 min | 10 | `/api/ai/analyze-image` |
| **Emergency Triage** | 15 min | 3 | `/api/medical-ai/instant-triage-call` |

---

## 4. Endpoint Inventory

### AUTH & USER MANAGEMENT
Mount: `/api/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/users/register/send-otp` | none | Send registration OTPs to email + WhatsApp |
| POST | `/api/users/register/verify-email-otp` | none | Verify email OTP for registration |
| POST | `/api/users/register/verify-whatsapp-otp` | none | Verify WhatsApp OTP for registration |
| POST | `/api/users/register/verify-otp` | none | Complete registration after OTP verification |
| POST | `/api/users/register` | none | Direct registration (email+password, no OTP) |
| POST | `/api/users/login` | none | Login with email/phone + password |
| POST | `/api/users/login/send-otp` | none | Send OTP for passwordless login |
| POST | `/api/users/login/verify-otp` | none | Verify OTP and login |
| GET | `/api/users/profile` | authUser | Get user profile |
| PUT | `/api/users/profile` | authUser | Update profile (firstName, lastName, phone, abhaHealthId, dateOfBirth, gender, corporateId, etc.) |
| PUT | `/api/users/status` | none | Update user online status |
| GET | `/api/users/available` | none | Get list of available users |
| POST | `/api/users/profile-picture/presign` | authUser | Get presigned S3 URL for profile picture upload |
| POST | `/api/users/profile-picture/confirm` | authUser | Confirm profile picture after S3 upload |
| POST | `/api/users/profile-picture` | authUser | Upload profile picture (direct file upload) |

**Register request body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+919876543210",
  "dateOfBirth": "1990-01-15",
  "gender": "Male"
}
```

**Login response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiI...",
  "user": {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1990-01-15",
    "gender": "Male",
    "role": "user",
    "corporateId": null
  }
}
```

---

### PASSWORD RESET
Mount: `/api/password-reset`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/password-reset/request` | none | Request password reset OTP (via email/SMS/WhatsApp) |
| POST | `/api/password-reset/verify-otp` | none | Verify OTP and get reset token |
| POST | `/api/password-reset/reset` | none | Reset password with verified token |

**Request body:**
```json
{ "email": "user@example.com", "userType": "user" }
// OR
{ "phone": "+919876543210", "userType": "user" }
```

---

### OTP MANAGEMENT
Mount: `/api/otp`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/otp/send` | none | Send OTP (phone/email) |
| POST | `/api/otp/verify` | none | Verify OTP code |
| POST | `/api/otp/resend` | none | Resend OTP |

---

### LEGACY AUTH ALIASES
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/send-otp` | none | Forwards to `/api/users/login/send-otp` |
| POST | `/api/auth/verify-otp` | none | Forwards to `/api/users/login/verify-otp` |

---

### APPOINTMENTS
Mount: `/api/appointments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/appointments` | authUser | Create new appointment |
| GET | `/api/appointments` | authUser | Get user's appointments (with filters) |
| GET | `/api/appointments/my-appointments` | authUser | Alias for GET / (frontend compat) |
| GET | `/api/appointments/:id` | authUser | Get appointment by ID |
| GET | `/api/appointments/analytics/basic` | authUser | Basic analytics (counts by status) |
| PATCH | `/api/appointments/:id/cancel` | authUser | Cancel appointment |
| DELETE | `/api/appointments/:id` | authUser | Cancel appointment (alt) |
| PATCH | `/api/appointments/:id/reschedule` | authUser | Reschedule appointment |
| PATCH | `/api/appointments/:id/status` | authUser | Update status (doctor/admin only enforced in handler) |
| POST | `/api/appointments/:id/complete` | authUser | Mark completed (doctor only enforced in handler) |

**Create appointment body:**
```json
{
  "doctorId": 2,
  "appointmentDate": "2026-03-20",
  "appointmentTime": "10:00",
  "consultationType": "video",   // video|audio|chat|in-person
  "symptoms": "headache, fever",
  "reason": "follow-up"
}
```

**Response fields:** `{ success, appointments: [{ id, doctorId, doctorName, appointmentDate, appointmentTime, consultationType, status, paymentAmount, symptoms }] }`

---

### ONLINE CONSULTATION (Full Booking Flow)
Mount: `/api/consultation`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/consultation/doctors` | none (public) | Browse doctors (specialty, rating, fee filters) |
| GET | `/api/consultation/doctors/:id` | none (public) | Get detailed doctor profile |
| GET | `/api/consultation/doctors/:id/slots` | none (public) | Get available time slots for a date |
| POST | `/api/consultation/book` | authUser | Book appointment (with optional HC payment) |
| POST | `/api/consultation/payment/initiate/:appointmentId` | authUser | Initiate Razorpay payment |
| POST | `/api/consultation/payment/verify/:appointmentId` | authUser | Verify Razorpay payment |
| POST | `/api/consultation/payment/manual/:appointmentId` | authUser | Record manual/cash payment |
| GET | `/api/consultation/payment/hc-check/:appointmentId` | authUser | Check if HC balance sufficient |
| POST | `/api/consultation/payment/hc/:appointmentId` | authUser | Pay with Health Coins |
| GET | `/api/consultation/video/join/:appointmentId` | authUser | Join video consultation (get LiveKit token) |
| POST | `/api/consultation/video/end/:appointmentId` | authUser | End video consultation |
| GET | `/api/consultation/my-appointments` | authUser | Get patient's consultation appointments |
| GET | `/api/consultation/chat/conversations` | authUser | Get chat conversations |
| GET | `/api/consultation/chat/:appointmentId/messages` | authUser | Get chat messages for appointment |
| POST | `/api/consultation/chat/:appointmentId/messages` | authUser | Send chat message |
| POST | `/api/consultation/chat/:appointmentId/read` | authUser | Mark messages as read |
| GET | `/api/consultation/chat/unread-count` | authUser | Get unread message count |

**Book body:**
```json
{
  "doctorId": 2,
  "appointmentDate": "2026-03-20",
  "appointmentTime": "10:00",
  "consultationType": "online",
  "symptoms": "cough",
  "paymentMethod": "hc"  // hc|wallet|razorpay|cash
}
```

**Doctor listing response:**
```json
{
  "success": true,
  "count": 5,
  "doctors": [{
    "id": 2,
    "name": "Dr. Nandita Agarwal",
    "specialization": "General Medicine",
    "consultationFee": 500,
    "rating": 4.7,
    "isOnline": true
  }]
}
```

---

### DOCTOR SEARCH (Enhanced)
Mount: `/api/doctors`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/doctors/available` | none (public) | Search/filter available doctors (specialization, city, etc.) |
| GET | `/api/doctors/partnered` | authUser (corporate) | List partner clinic doctors for corporate users |

**Query params:** `?search=cardio&specialization=Cardiology&city=Delhi&page=1&limit=20`

---

### MEDICAL AI (Dr. iSHA)
Mount: `/api/medical-ai`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/medical-ai/test` | none (public) | Test medical AI (no auth) |
| POST | `/api/medical-ai/consult` | authUser | Medical consultation with Dr. iSHA |
| POST | `/api/medical-ai/analyze-symptoms` | authUser | Symptom analysis |
| POST | `/api/medical-ai/emergency-triage` | authUser | Emergency triage assessment |
| POST | `/api/medical-ai/emergency-sos` | authUser | Emergency SOS with location |
| GET | `/api/medical-ai/triage-doctors` | authUser | Get doctors for triage referral |
| POST | `/api/medical-ai/instant-triage-call` | authUserOptional | Instant emergency triage (works without auth) |
| POST | `/api/medical-ai/intent-escalation` | authUser | Handle intent escalation to human doctor |
| GET | `/api/medical-ai/health` | none (public) | Health check for medical AI service |
| DELETE | `/api/medical-ai/session/:sessionId` | authUser | Clear conversation session |
| GET | `/api/medical-ai/session/:sessionId` | authUser | Get session history |
| POST | `/api/medical-ai/conversation-history` | authUser | Get conversation history |
| POST | `/api/medical-ai/feedback` | authUser | Submit feedback on AI response |
| GET | `/api/medical-ai/doctors` | authUser | Get doctors list for booking |
| GET | `/api/medical-ai/doctors/:doctorId/slots` | authUser | Get doctor slots |
| POST | `/api/medical-ai/book-appointment` | authUser | Book appointment from AI flow |
| GET | `/api/medical-ai/my-appointments` | authUser | Get patient appointments |
| POST | `/api/medical-ai/analyze-report` | authUser | Analyze uploaded medical report |

**Consult body:**
```json
{
  "query": "I have a headache and mild fever since 2 days",
  "language": "en",
  "sessionId": "mediczy_1",
  "userContext": { "age": 30, "gender": "male" }
}
```

**Response:** `{ success, response: "AI text...", doctor: "Dr. iSHA", sessionId, confidence, model }`

---

### AI ASSISTANT (Voice/Chat)
Mount: `/api/ai`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/ai/process-command` | auth | Process voice command for navigation |
| POST | `/api/ai/working-medical-consult` | auth | Medical consultation (SIB-backed) |

---

### AI HEALTH (Dr. ISHA)
Mount: `/api/ai-health`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/ai-health/chat` | auth | AI health chat (symptom analysis) |
| POST | `/api/ai-health/dr-isha/consult` | auth | Dr. ISHA consultation |
| POST | `/api/ai-health/diet/generate` | auth | Generate personalized diet plan |

**Diet plan body:**
```json
{
  "age": 30, "weight": 75, "height": 175,
  "goal": "weight_loss", "gender": "male",
  "activityLevel": "moderate",
  "dietaryRestrictions": "vegetarian"
}
```

---

### WALLET & HEALTH COINS
Mount: `/api/wallet`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/wallet` | authUser | Get wallet balance and summary |
| GET | `/api/wallet/balance` | authUser | Get balance only |
| GET | `/api/wallet/transactions` | authUser | Get transaction history |
| POST | `/api/wallet/earn/daily-login` | authUser | Award daily login coins |
| POST | `/api/wallet/earn/steps` | authUser | Award steps milestone coins |
| POST | `/api/wallet/earn/health-assessment` | authUser | Award health assessment coins |
| POST | `/api/wallet/earn/vital-signs` | authUser | Award vital signs logging coins |
| POST | `/api/wallet/earn/activity` | authUser | Award generic activity coins |
| POST | `/api/wallet/spend` | authUser | Spend health coins |
| GET | `/api/wallet/rewards` | authUser | Get rewards configuration |
| POST | `/api/wallet/validate-coupon` | authUser | Validate coupon code |
| POST | `/api/wallet/create-order` | authUser | Create Razorpay order for HC purchase |
| POST | `/api/wallet/verify-payment` | authUser | Verify Razorpay payment |
| POST | `/api/wallet/redeem-free-coupon` | authUser | Redeem free HC coupon |
| POST | `/api/wallet/purchase` | authUser | Purchase HC package |
| GET | `/api/wallet/appointment/calculate/:consultationFee` | authUser | Calculate HC needed for appointment |
| POST | `/api/wallet/appointment/can-pay` | authUser | Check if can pay with HC |
| POST | `/api/wallet/appointment/pay` | authUser | Pay for appointment with HC |
| POST | `/api/wallet/appointment/refund` | authUser | Refund HC for cancelled appointment |

---

### BILLING & ORDERS
Mount: `/api/billing`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/billing/orders/create` | authUser | Create new order |
| GET | `/api/billing/orders` | authUser | Get order history |
| GET | `/api/billing/orders/:orderId` | authUser | Get order details |
| GET | `/api/billing/orders/:orderId/detailed` | authUser | Get detailed order with breakdown |

---

### PAYMENTS
Mount: `/api/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/order` | authUser | Create payment order |
| POST | `/api/payments/verify` | authUser | Verify payment |
| POST | `/api/payments/webhook` | none (public) | Razorpay webhook handler |
| GET | `/api/payments/transactions` | authUser | Get all transactions |
| GET | `/api/payments/transactions/:id` | authUser | Get single transaction |
| POST | `/api/payments/refund` | authUser | Create refund |
| GET | `/api/payments/gateways` | authUser | Get payment gateways |
| GET | `/api/payments/config` | none (public) | Get Razorpay key for frontend |
| GET | `/api/payments/stats` | authUser | Payment statistics |

---

### LAB TESTS
Mount: `/api/lab-tests`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/lab-tests` | authUser | Book a lab test |
| GET | `/api/lab-tests` | authUser | Get user's lab tests |
| GET | `/api/lab-tests/:id` | authUser | Get specific lab test |

**Book body:**
```json
{
  "testType": "blood_test",
  "testName": "Complete Blood Count",
  "appointmentDate": "2026-03-20",
  "appointmentTime": "09:00",
  "urgency": "routine",
  "requiresFasting": true,
  "fastingHours": 12
}
```

---

### MEDICAL REPORTS
Mount: `/api/reports`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/reports` | authUser | Upload medical report (multipart file) |
| GET | `/api/reports` | authUser | List all user reports |
| POST | `/api/reports/upload` | authUser | Upload medical report (alt endpoint) |
| POST | `/api/reports/:reportId/analyze` | authUser | Analyze uploaded report |
| GET | `/api/reports/:reportId/analysis` | authUser | Get report analysis result |

**Upload:** multipart/form-data with field `file` or `report`  
**Body fields:** `reportType` (lab|imaging|prescription|general), `description`, `testName`, `labName`, `reportDate`

---

### PRESCRIPTIONS
Mount: `/api/prescriptions`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/prescriptions/patient` | authUser | Get patient's prescriptions |
| GET | `/api/prescriptions/my/all` | authUser | Get all my prescriptions |
| GET | `/api/prescriptions/:id` | authUser | Get specific prescription |
| GET | `/api/prescriptions/patient/:patientId` | authUser | Get prescriptions by patient ID |
| GET | `/api/prescriptions/appointment/:appointmentId` | authUser | Get prescription for appointment |
| GET | `/api/prescriptions/:id/html` | none (public) | Get prescription as HTML |
| GET | `/api/prescriptions/:id/pdf` | none (public) | Download prescription as PDF |
| GET | `/api/prescriptions/:id/share/whatsapp` | authUser | Share prescription via WhatsApp |

---

### NOTIFICATIONS
Mount: `/api/notifications`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | authUser | Get user's notifications |
| GET | `/api/notifications/unread-count` | authUser | Get unread count |
| POST | `/api/notifications/:id/read` | authUser | Mark notification as read |
| POST | `/api/notifications/read-all` | authUser | Mark all as read |
| DELETE | `/api/notifications/:id` | authUser | Delete notification |
| POST | `/api/notifications/fcm/register` | authUser | Register FCM push token |

---

### FCM PUSH NOTIFICATIONS
Mount: `/api/fcm`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/fcm/register-token` | authUser | Register FCM token for push notifications |
| POST | `/api/fcm/remove-token` | authUser | Remove FCM token |
| POST | `/api/fcm/send-video-call` | authUser | Send video call notification |
| POST | `/api/fcm/send-message` | authUser | Send message notification |

---

### FAMILY MEMBERS
Mount: `/api/family-members`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/family-members/limits` | authUser | Get family member limits (by membership) |
| GET | `/api/family-members` | authUser | Get all family members |
| GET | `/api/family-members/:id` | authUser | Get specific family member |
| POST | `/api/family-members` | authUser | Add family member |
| PUT | `/api/family-members/:id` | authUser | Update family member |
| DELETE | `/api/family-members/:id` | authUser | Remove family member |

**Add body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "relationship": "spouse",
  "dateOfBirth": "1992-05-20",
  "gender": "Female",
  "phoneNumber": "+919876543211",
  "bloodType": "O+",
  "allergies": ["penicillin"],
  "chronicConditions": ["diabetes"],
  "abhaHealthId": "12-3456-7890-1234"
}
```

---

### HEALTH ASSESSMENT
Mount: `/api/health-assessment`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/health-assessment/save` | authUser | Save health risk assessment |
| GET | `/api/health-assessment/latest` | authUser | Get latest assessment |

**Save body:** `{ age, gender, height, weight, waist, hip, bmi, smoking, alcohol, exercise_frequency, hypertension, diabetes, heart_disease, ... }`

**Response:** `{ success, riskScore, riskLevel: "LOW"|"MILD"|"MODERATE"|"HIGH"|"VERY_HIGH", riskFactors: [...] }`

---

### HEALTH DIARY
Mount: `/api/health-diary`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health-diary` | authUser | Get diary entries (with filters) |
| GET | `/api/health-diary/prescriptions` | authUser | Get prescription-related diary entries |
| GET | `/api/health-diary/summary` | authUser | Get dashboard summary |
| POST | `/api/health-diary` | authUser | Create new diary entry |

**Create body:**
```json
{
  "entryDate": "2026-03-13",
  "entryType": "symptom",
  "title": "Headache",
  "description": "Mild headache after work",
  "mood": "neutral",
  "severity": 3,
  "tags": ["headache", "work"]
}
```

---

### HEALTH METRICS
Mount: `/api/health`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health/latest` | auth | Get latest health metrics (HR, steps, BP, SpO2, glucose, etc.) |
| GET | `/api/health/summary` | auth | Get health summary with trends |

**Response:** `{ heartRate, steps, sleepScore, bloodPressure, spo2, temperature, bloodGlucose, timestamp }`

---

### MEMBERSHIP PLANS
Mount: `/api/membership`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/membership/plans` | none (public) | Get all active membership plans |
| GET | `/api/membership/my/current` | authUser | Get user's current active plan |
| POST | `/api/membership/subscribe/:planId` | authUser | Subscribe to a plan |
| POST | `/api/membership/upgrade/:newPlanId` | authUser | Upgrade to higher tier plan |

---

### VIDEO CALLING
Mount: `/api/video`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/video/health` | none (public) | Video service health check |
| GET | `/api/video/test` | none (public) | Test video system |
| POST | `/api/video/room/token` | authUser | Generate video room token |
| GET | `/api/video/livekit/token` | authUser | Generate LiveKit token (GET) |
| POST | `/api/video/livekit/token` | authUser | Generate LiveKit token (POST) |
| POST | `/api/video/room/:roomId/join` | authUser | Join video room |
| POST | `/api/video/room/:roomId/leave` | authUser | Leave video room |
| GET | `/api/video/room/:roomId/status` | authUser | Get room status |
| POST | `/api/video/room/:roomId/invite` | authUser | Create shareable invite link |
| GET | `/api/video/join/:inviteCode` | none (public) | Guest join via invite link |

---

### CHAT
Mount: `/api/chat`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/chat/health` | none (public) | Chat system health check |
| POST | `/api/chat/rooms` | authUser | Create chat room |
| GET | `/api/chat/rooms` | authUser | Get available rooms |
| GET | `/api/chat/rooms/:roomId/messages` | authUser | Get room messages |
| POST | `/api/chat/rooms/:roomId/messages` | authUser | Send message |

---

### TEXT-TO-SPEECH
Mount: `/api/tts`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/tts/speak` | none (public) | Convert text to speech (Eleven Labs) |
| GET | `/api/tts/voices` | none (public) | Get available voices |
| GET | `/api/tts/status` | none (public) | TTS service status |

---

### FITNESS & HEALTH TRACKING
Mount: `/api/fitness`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/fitness/google-fitness` | none (uses Google OAuth token in header) | Proxy for Google Fitness API |
| POST | `/api/fitness/store` | auth | Store fitness data locally |

---

### DIET PLANS
Mount: `/api/diet`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/diet/generate` | auth | Generate personalized diet plan |

---

### PLACES (Nearby Hospitals/Pharmacies)
Mount: `/api/places`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/places/nearby` | none (public) | Find nearby hospitals/pharmacies via Google Places |

**Query:** `?lat=28.6139&lng=77.2090&type=hospital`

---

### PRIVACY & COMPLIANCE (GDPR/DPDP)
Mount: `/api/privacy`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/privacy/consents` | authUser | Get all user consents |
| POST | `/api/privacy/consents` | authUser | Grant consent |
| DELETE | `/api/privacy/consents/:consentType` | authUser | Withdraw consent |
| GET | `/api/privacy/export` | authUser | Export all user data (GDPR Art. 20) |
| DELETE | `/api/privacy/delete` | authUser | Right to erasure (GDPR Art. 17) |

---

### CORPORATE
Mount: `/api/corporate`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/corporate/login` | none | Corporate portal login |
| GET | `/api/corporate/summary` | authUser | Corporate health summary |
| GET | `/api/corporate/analytics` | authUser | Corporate health analytics |

(Most corporate endpoints are for corporate admin role, not patients)

---

### PUBLIC / UTILITY ENDPOINTS

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Public health check (DB status, uptime) |
| GET | `/api/db/health` | none | Database orchestrator health |
| GET | `/api/payments/config` | none | Razorpay key for frontend |
| GET | `/razorpay-test` | none | Payment test page |

---

### ADDRESSES
Mount: `/api/addresses`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/addresses` | authUser | Get user's saved addresses |
| POST | `/api/addresses` | authUser | Add new address |
| PUT | `/api/addresses/:id` | authUser | Update address |
| DELETE | `/api/addresses/:id` | authUser | Delete address |

---

### LEADERBOARD
Mount: `/api/leaderboard`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/leaderboard` | authUser | Get health coins leaderboard |

---

## 5. Route Mount Summary (from app.js)

```
/api/users          → user.route.js (auth, profile, registration)
/api/addresses      → address.route.js
/api/family-members → family-member.route.js
/api/wallet         → wallet.route.js (Health Coins)
/api/membership-plans → membership-plans.route.js
/api/leaderboard    → leaderboard.route.js
/api/password-reset → password-reset.route.js
/api/reports        → reports.route.js + upload.route.js + report-analysis.route.js
/api/health-assessment → health-assessment.route.js
/api/doctors        → doctor.route.js + doctor.enhanced.route.js + availability + settings
/api/appointments   → appointment.route.js
/api/consultation   → online-consultation.route.js
/api/lab-tests      → lab-tests.route.js
/api/prescriptions  → prescription.route.js
/api/health-diary   → health-diary.route.js
/api/health         → health.route.js
/api/billing        → billing.route.js
/api/notifications  → notification.route.js
/api/fcm            → fcm.route.js
/api/fitness        → fitness.route.js
/api/fitness-data   → fitnessData.js
/api/apple-health   → apple-health.route.js
/api/ai             → ai.js (voice commands, medical consult)
/api/medical-ai     → medical-ai.route.js (Dr. iSHA)
/api/ai-health      → ai-health.route.js (Dr. ISHA, diet plans)
/api/diet           → diet.route.js (diet plan alias)
/api/places         → places.js (nearby places)
/api/tts            → tts.route.js (text-to-speech)
/api/video          → video.route.js (video calling)
/api/chat           → chat.route.js
/api/payments       → payment.route.js
/api/membership     → membership.route.js
/api/otp            → otp.route.js
/api/privacy        → privacy.route.js (GDPR/DPDP)
/api/corporate      → corporate.route.js
/api/call-notification → call-notification.route.js
/api/webinars       → webinar.routes.js
/api/auth           → oauth.route.js + auth.login.route.js
/api/health-data    → healthData.route.js (BLE device sync)
/api/wearables      → wearable.route.js
/api/health-intelligence → health-intelligence.route.js
/v1                 → api-v1-index.js (Multi-tenant API)
```

---

## 6. Total Endpoint Count (Patient-Accessible)

| Category | Count |
|---|---|
| Auth & User Management | ~16 |
| Password Reset & OTP | ~6 |
| Appointments | ~10 |
| Online Consultation | ~16 |
| Doctor Search | ~2 |
| Medical AI | ~18 |
| AI Health/Chat/Diet | ~4 |
| Wallet & Health Coins | ~19 |
| Billing & Orders | ~4 |
| Payments | ~9 |
| Lab Tests | ~3 |
| Reports & Analysis | ~5 |
| Prescriptions (patient) | ~7 |
| Notifications | ~6 |
| FCM Push | ~4 |
| Family Members | ~6 |
| Health Assessment | ~2 |
| Health Diary | ~4 |
| Health Metrics | ~2 |
| Membership | ~4 |
| Video Calling | ~10 |
| Chat | ~5 |
| TTS | ~3 |
| Fitness | ~2 |
| Diet | ~1 |
| Places | ~1 |
| Privacy/GDPR | ~5 |
| **TOTAL** | **~172** |
