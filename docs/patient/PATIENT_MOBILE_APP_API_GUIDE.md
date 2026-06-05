# Mediczy — Patient Mobile App API Guide

> **Version:** 2.7 | **Last Updated:** 2026-05-30

- **Base URL:** `https://app.mediqzy.com/api`
- **Auth:** `Authorization: Bearer <jwt-token>` (JWT, expires 7 days)
- **Content-Type:** `application/json`
- **Socket.IO:** `wss://app.mediqzy.com` — path `/socket.io`
- **LiveKit:** `wss://msh-kw9tvxa9.livekit.cloud` *(LiveKit Cloud)*
- **Rate Limits:** Global 300 req/15 min · Auth 10 req/15 min · AI 60 req/15 min

> `🔐` = Requires authentication | `(Public)` = No auth required

---

## Table of Contents

1. [Authentication](#1-authentication)
   - 1.1 [Login — Email + Password](#11-login-email--password)
   - 1.2 [Login — OTP (Email)](#12-login-otp--email)
   - 1.3 [Login — OTP (WhatsApp)](#13-login-otp--whatsapp)
   - 1.4 [Registration](#14-registration)
   - 1.5 [Password Reset](#15-password-reset)
   - 1.6 [Change Password](#16-change-password-logged-in)
   - 1.7 [Social Login — Google OAuth](#17-social-login--google-oauth)
   - 1.8 [Social Login — Facebook OAuth](#18-social-login--facebook-oauth)
2. [User Profile](#2-user-profile)
3. [Family Members & Insurance](#3-family-members--insurance)
4. [Addresses](#4-addresses)
5. [Doctor Discovery](#5-doctor-discovery)
6. [Appointment Booking](#6-appointment-booking)
7. [Online Consultation (Video/Chat)](#7-online-consultation-videochat)
8. [Prescriptions](#8-prescriptions)
9. [Medical Reports](#9-medical-reports)
10. [Lab Tests & Diagnostics](#10-lab-tests--diagnostics)
11. [Cart (Lab Tests)](#11-cart-lab-tests)
12. [Wallet & HC Coins](#12-wallet--hc-coins)
13. [Payments (Razorpay)](#13-payments-razorpay)
14. [Billing & Invoices](#14-billing--invoices)
15. [Membership Plans](#15-membership-plans)
16. [AI Medical Features](#16-ai-medical-features)
17. [AI Brain (Dr. iSHA Advanced)](#17-ai-brain-dr-isha-advanced)
18. [AI Intelligence (Drug/Insurance/Triage)](#18-ai-intelligence-druginsurancetriage)
19. [Health Diary](#19-health-diary)
20. [Health Assessment](#20-health-assessment)
21. [Health Intelligence Dashboard](#21-health-intelligence-dashboard)
22. [Fitness & Wearables](#22-fitness--wearables)
23. [Leaderboard & Challenges](#23-leaderboard--challenges)
24. [Notifications & FCM](#24-notifications--fcm)
25. [Text-to-Speech](#25-text-to-speech)
26. [Insurance](#26-insurance)
27. [Corporate Benefits](#27-corporate-benefits)
28. [Support & Tickets](#28-support--tickets)
29. [Privacy & GDPR](#29-privacy--gdpr)
30. [Directory (Hospitals/Labs/Clinics)](#30-directory-hospitalslabsclinics)
31. [Ayushman Bharat](#31-ayushman-bharat)
32. [AI DeepTech Layer](#32-ai-deeptech-layer)
33. [Electronic Health Records (EHR)](#33-electronic-health-records-ehr)
34. [FHIR R4 (Interoperability)](#34-fhir-r4-interoperability)
35. [Pharmacy Orders](#35-pharmacy-orders)
36. [Activity Tracker (Advanced)](#36-activity-tracker-advanced)
37. [Offline AI Scribe](#37-offline-ai-scribe)
38. [Omnichannel Messaging](#38-omnichannel-messaging)
39. [Socket.IO Real-Time Events](#39-socketio-real-time-events)
40. [Error Handling Reference](#40-error-handling-reference)
41. [Endpoint Status Summary](#41-endpoint-status-summary)

---

## 1. Authentication

### 1.1 Login (Email + Password)
```
POST /api/auth/login
```
**Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```
**Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "requirePasswordChange": false,
  "user": {
    "id": 19,
    "unique_id": "UC12E4",
    "firstName": "Test",
    "lastName": "User",
    "email": "user@example.com",
    "role": "user",
    "phoneNumber": "9884089921"
  }
}
```
> Store the `token` securely (Keychain/Keystore). Include it in all subsequent requests as `Authorization: Bearer <token>`. Token expires in **30 days**. Use the refresh token endpoint (`POST /api/v2/auth/refresh`) to obtain a new access token silently before expiry.

### 1.2 Login (OTP — Email)
```
POST /api/auth/send-otp
Body: { "email": "user@example.com", "channel": "email" }

POST /api/auth/verify-otp
Body: { "email": "user@example.com", "otp": "123456" }
```

### 1.3 Login (OTP — WhatsApp)
```
POST /api/auth/send-otp
Body: { "phoneNumber": "9884089921", "channel": "whatsapp" }

POST /api/auth/verify-otp
Body: { "phoneNumber": "9884089921", "otp": "123456" }
```

### 1.4 Registration

Registration supports two member types: **Individual** (auto-enrolled in Free Basic plan) and **Corporate** (linked to employer via pre-loaded employee roster).

#### Step 1 — Fetch available corporates (Corporate path only)
```
GET /api/users/register/corporates  (Public)
```
**Response:**
```json
{
  "success": true,
  "corporates": [
    { "id": 1, "name": "TCS Limited" },
    { "id": 2, "name": "Mediqzy Health Solutions" }
  ]
}
```

#### Step 2 — Validate employee ID (Corporate path only)
```
POST /api/users/register/validate-employee  (Public)
Body: { "corporateId": 1, "employeeId": "EMP-001" }
```
**Response (200 — verified):**
```json
{
  "success": true,
  "message": "Employee verified",
  "employee": {
    "dbId": 4,
    "employeeId": "EMP-001",
    "department": "Engineering",
    "designation": "Software Engineer",
    "corporateName": "TCS Limited",
    "firstName": null,
    "lastName": null
  }
}
```
**Error codes:** `404` employee not found · `409` employee ID already registered (use login)

#### Step 3 — Send OTP
```
POST /api/users/register/send-otp  (Public)
Body: { "email": "new@example.com", "phoneNumber": "+919876543210", "firstName": "John" }
```
> OTP sent to email (required) and WhatsApp (optional). OTPs are never included in the response body — retrieve from server logs during development.

#### Step 4 — Verify email OTP
```
POST /api/users/register/verify-email-otp  (Public)
Body: { "email": "new@example.com", "phoneNumber": "+919876543210", "code": "123456" }
```

#### Step 5 — Verify WhatsApp OTP (optional)
```
POST /api/users/register/verify-whatsapp-otp  (Public)
Body: { "email": "new@example.com", "phoneNumber": "+919876543210", "code": "654321" }
```

#### Step 6 — Complete registration
```
POST /api/users/register/verify-otp  (Public)
```
**Body — Individual:**
```json
{
  "email": "new@example.com",
  "phoneNumber": "+919876543210",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-01",
  "gender": "Male",
  "memberType": "individual"
}
```
**Body — Corporate:**
```json
{
  "email": "john@company.com",
  "phoneNumber": "+919876543210",
  "password": "SecurePass123",
  "firstName": "John",
  "lastName": "Doe",
  "memberType": "corporate",
  "corporateId": 1,
  "employeeDbId": 4
}
```
> `dateOfBirth` and `gender` are optional for corporate members.

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": { "id": 6165, "email": "new@example.com", "firstName": "John" }
}
```
> **Individual** → Free Basic plan (`plan_id=1`) auto-activated on registration.  
> **Corporate** → `isCorporate=true`, linked to employer via `user_associations`, `corporate_employees.userId` updated.

### 1.5 Password Reset
```
POST /api/users/forgot-password    → Body: { "email": "..." }
POST /api/users/verify-reset-otp   → Body: { "email": "...", "otp": "123456" }
POST /api/users/reset-password     → Body: { "email": "...", "otp": "123456", "newPassword": "..." }
```

### 1.6 Change Password (Logged In)
```
POST /api/users/change-password 🔐
Body: { "currentPassword": "...", "newPassword": "..." }
```

---

### 1.7 Social Login — Google OAuth

```
POST /api/mobile/auth/google  (Public)
```

Exchange a Google ID token obtained from the native Google Sign-In SDK for a Mediczy JWT. A new patient account is created automatically on first sign-in. If the email already exists, the Google ID is linked to that account.

**Token expiry:** Mediczy access token is valid for **30 days**.

#### Prerequisites — React Native SDK
```bash
npm install @react-native-google-signin/google-signin
```

Configure once at app startup:
```js
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com', // from Google Cloud Console
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com', // iOS only
  offlineAccess: false,
});
```

#### Sign-In Flow

```js
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  const { idToken } = userInfo;                // step 1: get idToken from Google

  const res = await fetch('https://app.mediqzy.com/api/mobile/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      deviceId: '<unique-device-id>',           // optional — for push notifications
      pushToken: '<fcm-token>',                  // optional — for push notifications
    }),
  });

  const { data } = await res.json();
  // Store data.accessToken securely (Keychain / Keystore)
  // data.isNewUser === true → navigate to profile completion screen
}
```

**Request body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "deviceId": "a1b2c3d4-e5f6",
  "pushToken": "fMSuXxYZ..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idToken` | string | Yes | Google ID token from `GoogleSignin.signIn()` |
| `deviceId` | string | No | Unique device identifier for push notifications |
| `pushToken` | string | No | FCM push notification token |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 6201,
      "name": "John Doe",
      "email": "john@gmail.com",
      "avatar": "https://lh3.googleusercontent.com/...",
      "role": "patient"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": "30d",
    "provider": "google",
    "isNewUser": true
  }
}
```

> Store `accessToken` securely. Use it as `Authorization: Bearer <accessToken>` for all subsequent API calls.  
> When `isNewUser` is `true`, prompt the user to complete their profile (phone number, date of birth).

**Error responses:**

| HTTP | `error.code` | Cause |
|------|-------------|-------|
| 400 | `MISSING_TOKEN` | `idToken` field not provided |
| 400 | `MISSING_PROFILE` | Google account has no email (email scope not granted) |
| 401 | `INVALID_TOKEN` | Token expired, malformed, or Google verification failed |
| 401 | `INVALID_AUDIENCE` | Token issued for a different OAuth client ID |

#### Account Linking Behaviour

| Scenario | Result |
|----------|--------|
| First time — email not in system | New patient account created; free trial plan activated |
| Email already registered (email+password) | Google ID linked to existing account; no duplicate created |
| Google ID recognised from previous sign-in | Existing session returned |

#### Environment Variables (server)
```
GOOGLE_CLIENT_ID=<web-client-id>
GOOGLE_ANDROID_CLIENT_ID=<android-client-id>
GOOGLE_IOS_CLIENT_ID=<ios-client-id>
```

---

### 1.8 Social Login — Facebook OAuth

```
POST /api/mobile/auth/facebook  (Public)
```

Exchange a Facebook access token obtained from the native Facebook Login SDK for a Mediczy JWT. A new patient account is created automatically on first login. If the email already exists, the Facebook ID is linked to that account.

**Important:** The Facebook Login dialog **must** request the `email` permission. Users who deny email access will receive a `400 EMAIL_REQUIRED` error.

**Token expiry:** Mediczy access token is valid for **30 days**.

#### Prerequisites — React Native SDK
```bash
npm install react-native-fbsdk-next
```

iOS — `Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>fbYOUR_APP_ID</string></array>
  </dict>
</array>
<key>FacebookAppID</key><string>YOUR_APP_ID</string>
<key>FacebookClientToken</key><string>YOUR_CLIENT_TOKEN</string>
<key>FacebookDisplayName</key><string>Mediczy</string>
```

Android — `strings.xml`:
```xml
<string name="facebook_app_id">YOUR_APP_ID</string>
<string name="fb_login_protocol_scheme">fbYOUR_APP_ID</string>
<string name="facebook_client_token">YOUR_CLIENT_TOKEN</string>
```

#### Sign-In Flow

```js
import { LoginManager, AccessToken } from 'react-native-fbsdk-next';

async function signInWithFacebook() {
  const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);

  if (result.isCancelled) throw new Error('User cancelled Facebook login');

  const tokenData = await AccessToken.getCurrentAccessToken();
  const accessToken = tokenData.accessToken.toString();  // step 1: get accessToken from Facebook

  const res = await fetch('https://app.mediqzy.com/api/mobile/auth/facebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken,
      deviceId: '<unique-device-id>',           // optional — for push notifications
      pushToken: '<fcm-token>',                  // optional — for push notifications
    }),
  });

  const { data } = await res.json();
  // Store data.accessToken securely (Keychain / Keystore)
  // data.isNewUser === true → navigate to profile completion screen
}
```

**Request body:**
```json
{
  "accessToken": "EAABsbCS4ZCpsBAMZCZBpN...",
  "deviceId": "a1b2c3d4-e5f6",
  "pushToken": "fMSuXxYZ..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | Facebook access token from `AccessToken.getCurrentAccessToken()` |
| `deviceId` | string | No | Unique device identifier for push notifications |
| `pushToken` | string | No | FCM push notification token |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 6202,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "avatar": "https://graph.facebook.com/.../picture",
      "role": "patient"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": "30d",
    "provider": "facebook",
    "isNewUser": false
  }
}
```

> Store `accessToken` securely. Use it as `Authorization: Bearer <accessToken>` for all subsequent API calls.  
> When `isNewUser` is `true`, prompt the user to complete their profile (phone number, date of birth).

**Error responses:**

| HTTP | `error.code` | Cause |
|------|-------------|-------|
| 400 | `MISSING_TOKEN` | `accessToken` field not provided |
| 400 | `EMAIL_REQUIRED` | User did not grant email permission in Facebook dialog |
| 401 | `INVALID_TOKEN` | Token expired, revoked, or Facebook Graph API call failed |

#### Account Linking Behaviour

| Scenario | Result |
|----------|--------|
| First time — email not in system | New patient account created; free trial plan activated |
| Email already registered (email+password or Google) | Facebook ID linked to existing account; no duplicate created |
| Facebook ID recognised from previous login | Existing session returned |

#### Environment Variables (server)
```
# No server-side Facebook App Secret required — token validation is performed
# via the Facebook Graph API (/me endpoint) using the client access token.
# Ensure your Facebook App is configured to allow requests from the server IP.
```

---

## 2. User Profile

### 2.1 Get My Profile
```
GET /api/users/profile 🔐
```
**Response:**
```json
{
  "success": true,
  "user": {
    "id": 19,
    "unique_id": "UC12E4",
    "firstName": "Test",
    "lastName": "User",
    "email": "user@example.com",
    "dateOfBirth": "1990-01-01T00:00:00.000Z",
    "gender": "Male",
    "phoneNumber": "9884089921",
    "bloodType": null,
    "allergies": [],
    "medications": [],
    "chronicConditions": [],
    "medicalHistory": {},
    "profileImage": null,
    "abhaHealthId": null,
    "isVerified": true,
    "primaryDoctorId": 70,
    "status": "active"
  }
}
```

### 2.2 Update Profile
```
PUT /api/users/profile 🔐
Body: { "firstName": "John", "lastName": "Doe", "dateOfBirth": "1990-01-01", "gender": "Male", "bloodType": "O+", "allergies": ["Penicillin"], "emergencyContact_name": "Jane", "emergencyContact_phoneNumber": "9876543210" }
```

### 2.3 Profile Picture
```
POST /api/users/profile-picture/presign 🔐
Body: { "fileName": "photo.jpg", "contentType": "image/jpeg" }
→ Returns: { "uploadUrl": "https://s3...", "key": "..." }

POST /api/users/profile-picture/confirm 🔐
Body: { "key": "..." }
```

---

## 3. Family Members & Insurance

### 3.1 Manage Family Members
```
GET    /api/family-members        🔐  List family members
GET    /api/family-members/limits  🔐  Get limits (max members allowed by plan)
POST   /api/family-members        🔐  Add family member
PUT    /api/family-members/:id    🔐  Update family member
DELETE /api/family-members/:id    🔐  Remove family member
GET    /api/family-members/:id    🔐  Get family member details
```
**Add Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "relationship": "spouse",
  "dateOfBirth": "1992-05-15",
  "gender": "Female",
  "phoneNumber": "9876543210",
  "bloodType": "A+"
}
```
> Valid `relationship` values: `spouse` | `father` | `mother` | `son` | `daughter` | `brother` | `sister` | `grandfather` | `grandmother` | `grandson` | `granddaughter` | `uncle` | `aunt` | `nephew` | `niece` | `cousin` | `guardian` | `other`  
> **Plan restriction:** Family members can only be added if the user's plan type is `family` or `corporate`. `individual` plans do not allow family members.

### 3.2 Family Member Insurance Policies
```
GET    /api/family-members/:id/insurances              🔐  List insurance policies for a family member
POST   /api/family-members/:id/insurances              🔐  Add insurance policy to a family member
DELETE /api/family-members/:id/insurances/:policyId    🔐  Remove insurance policy
```
**Add Insurance Body:**
```json
{
  "insurerName": "Star Health Insurance",
  "policyNumber": "SH-2024-001234",
  "coverageAmount": 500000,
  "premium": 12000,
  "validFrom": "2024-01-01",
  "validTo": "2025-01-01",
  "policyType": "health"
}
```
**Required fields:** `insurerName`, `policyNumber`  
**Response (GET):**
```json
{
  "success": true,
  "policies": [
    {
      "id": "1776575344274",
      "insurerName": "Star Health Insurance",
      "policyNumber": "SH-2024-001234",
      "coverageAmount": 500000
    }
  ]
}
```
> Policies are stored as a JSON array in the family member's `metadata`. Each policy receives a unique `id` (timestamp-based) on creation. Use the `id` to delete a specific policy.

---

## 4. Addresses

```
GET    /api/addresses               🔐  List my addresses
POST   /api/addresses               🔐  Add new address
GET    /api/addresses/default       🔐  Get default address
GET    /api/addresses/:id           🔐  Get address by ID
PUT    /api/addresses/:id           🔐  Update address
PUT    /api/addresses/:id/set-default 🔐  Set as default
DELETE /api/addresses/:id           🔐  Delete address
GET    /api/addresses/autocomplete?q=...  🔐  Address autocomplete (Google Places)
GET    /api/addresses/place/:placeId 🔐  Get place details
```

---

## 5. Doctor Discovery

### 5.1 Search Doctors
```
GET /api/doctors/search?q=cardiology&city=Mumbai  (Public)
GET /api/doctors/available                         (Public)
GET /api/doctors/                                   (Public)
```

### 5.2 Doctor Profile & Slots
```
GET /api/doctors/:doctorId/public                  (Public)
GET /api/doctors/:doctorId/slots?date=2026-03-15   (Public)
```

### 5.3 Specialties & Directory
```
GET /api/masterdata/specialties    (Public)  All medical specialties
GET /api/masterdata/doctors        (Public)  Doctor masterdata
GET /api/masterdata/hospitals      (Public)  Hospital directory
GET /api/masterdata/cities         (Public)  Available cities
```

### 5.4 Partnered Doctors
```
GET /api/doctors/partnered 🔐  Partnered/network doctors
```

### 5.5 Enhanced Appointment Slots
```
GET /api/enhanced-appointments/available-slots?doctorId=70&date=2026-03-15 (Public)
```

---

## 6. Appointment Booking

### 6.1 Book Appointment
```
POST /api/appointments 🔐
Body: {
  "doctorId": 70,
  "appointmentDate": "2026-03-15",
  "appointmentTime": "10:00",
  "consultationType": "video",       // "video" | "in-person" | "chat"
  "reason": "General checkup",
  "familyMemberId": null,            // Optional: book for family member
  "paymentMethod": "razorpay"        // "razorpay" | "hc_coins" | "wallet"
}
```

### 6.2 List Appointments
```
GET /api/appointments                🔐  All appointments
GET /api/appointments/my-appointments 🔐  My appointments (alias)
GET /api/appointments/upcoming        🔐  Upcoming appointments only (status ≠ cancelled/completed, date ≥ today)
GET /api/appointments/:id            🔐  Appointment detail
```
> `GET /api/appointments/upcoming` is a named alias for `GET /api/appointments?upcoming=true`. Returns the same response shape as the list endpoint filtered to future non-cancelled appointments.

### 6.3 Manage Appointments
```
PATCH /api/appointments/:id/cancel     🔐  Cancel appointment
PATCH /api/appointments/:id/reschedule 🔐  Reschedule
      Body: { "newDate": "2026-03-16", "newTime": "14:00" }
PATCH /api/appointments/:id/rating     🔐  Rate (post-consultation)
      Body: { "rating": 5, "review": "Excellent consultation" }
POST  /api/appointments/:id/remind     🔐  Send reminder
GET   /api/appointments/:id/calendar   🔐  Download iCal file
```

### 6.4 Enhanced Booking (Alternative)
```
POST /api/enhanced-appointments/book 🔐
GET  /api/enhanced-appointments/my-appointments 🔐
```

### 6.5 Payment for Appointment
```
GET  /api/wallet/appointment/calculate/:consultationFee 🔐  Calculate with HC discount
POST /api/wallet/appointment/can-pay 🔐  Check if can pay
     Body: { "appointmentId": 1, "consultationFee": 500 }
POST /api/wallet/appointment/pay     🔐  Pay with HC coins
POST /api/consultation/payment/initiate/:appointmentId 🔐  Razorpay payment
POST /api/consultation/payment/verify/:appointmentId   🔐  Verify payment
POST /api/consultation/payment/hc/:appointmentId       🔐  Pay with HC coins
GET  /api/consultation/payment/hc-check/:appointmentId 🔐  Check HC eligibility
```

---

## 7. Online Consultation (Video/Chat)

### 7.1 Browse Consultation Doctors
```
GET /api/consultation/doctors                    (Public)  List doctors
GET /api/consultation/doctors/:id                (Public)  Doctor detail
GET /api/consultation/doctors/:id/slots          (Public)  Available slots
```

### 7.2 Book Consultation
```
POST /api/consultation/book 🔐
Body: {
  "doctorId": 70,
  "date": "2026-03-15",
  "timeSlot": "10:00-10:30",
  "consultationType": "video",
  "reason": "Follow-up consultation"
}
```

### 7.3 Video Call
```
GET  /api/consultation/video/join/:appointmentId 🔐  Join video call
     → Returns appointment-scoped LiveKit credentials (see response below)
POST /api/consultation/video/end/:appointmentId  🔐  End video call
```

**Response (200):**
```json
{
  "success": true,
  "message": "Video consultation ready",
  "appointmentId": 101,
  "video": {
    "meetingId": "apt-101-abc123ef",
    "meetingLink": "https://msh-kw9tvxa9.livekit.cloud/room/apt-101-abc123ef",
    "joinUrl": "https://msh-kw9tvxa9.livekit.cloud/room/apt-101-abc123ef",
    "livekit": {
      "token": "<livekit-jwt>",
      "serverUrl": "wss://msh-kw9tvxa9.livekit.cloud",
      "roomName": "apt-101-abc123ef"
    }
  },
  "token": "<livekit-jwt>",
  "serverUrl": "wss://msh-kw9tvxa9.livekit.cloud",
  "roomName": "apt-101-abc123ef"
}
```

**LiveKit Integration:**
- Use LiveKit SDK (iOS/Android) with `video.livekit.token` and `video.livekit.serverUrl`
- Canonical room format: `apt-{appointmentId}-{hash}`
- Some endpoints include compatibility fields at top-level (`token`, `serverUrl`, `roomName`) for older clients
- Time window: 15 minutes before to 1 hour after scheduled time
- If doctor initiates call, patient can join anytime

### 7.4 Consultation Chat
```
GET  /api/consultation/chat/conversations                 🔐  List conversations
GET  /api/consultation/chat/:appointmentId/messages       🔐  Get messages
POST /api/consultation/chat/:appointmentId/messages       🔐  Send message
     Body: { "content": "Hello doctor", "type": "text" }
POST /api/consultation/chat/:appointmentId/read           🔐  Mark as read
GET  /api/consultation/chat/unread-count                  🔐  Unread count
```

### 7.5 Standalone Chat Rooms
```
POST /api/chat/rooms                        🔐  Create chat room
GET  /api/chat/rooms                        🔐  List chat rooms
GET  /api/chat/rooms/:roomId/messages       🔐  Get messages
POST /api/chat/rooms/:roomId/messages       🔐  Send message
POST /api/chat/rooms/:roomId/join           🔐  Join room
POST /api/chat/rooms/:roomId/leave          🔐  Leave room
POST /api/chat/upload                       🔐  Upload file in chat
```

### 7.6 Video Rooms (Standalone)
```
GET  /api/video/health              (Public)  Video system health
POST /api/video/room/token          🔐  Generate room token
GET  /api/video/livekit/token       🔐  Get LiveKit token (query)
POST /api/video/livekit/token       🔐  Get LiveKit token (body)
POST /api/video/room/:roomId/join   🔐  Join room
POST /api/video/room/:roomId/leave  🔐  Leave room
GET  /api/video/room/:roomId/status 🔐  Room status
```

**Direct token API usage (when room is already known):**
```http
GET /api/video/livekit/token?roomId=apt-101-abc123ef&appointmentId=101
Authorization: Bearer <token>
```

```http
POST /api/video/livekit/token
Authorization: Bearer <token>
Content-Type: application/json

{ "roomName": "apt-101-abc123ef", "roomId": "apt-101-abc123ef", "appointmentId": 101 }
```

At least one of `appointmentId` or `roomId`/`roomName` is required.

---

## 8. Prescriptions

```
GET /api/prescriptions/patient                           🔐  My prescriptions
GET /api/prescriptions/my/all                            🔐  All my prescriptions
GET /api/prescriptions/:id                               🔐  Prescription detail
GET /api/prescriptions/appointment/:appointmentId        🔐  By appointment
GET /api/prescriptions/:id/html                          🔐  HTML view (or ?token=<share-jwt> for link sharing)
GET /api/prescriptions/:id/pdf                           🔐  PDF download (or ?token=<share-jwt> for link sharing)
GET /api/prescriptions/:id/share/whatsapp                🔐  Share via WhatsApp
```
> Prescriptions are created by doctors post-consultation. Patients can only view/download/share.

---

## 9. Medical Reports

### 9.1 Upload & Manage Reports
```
POST   /api/reports         🔐  Upload medical report
GET    /api/reports         🔐  List reports (optionally filtered by family member)
GET    /api/reports/:id     🔐  Report detail
DELETE /api/reports/:id     🔐  Delete report
GET    /api/reports/download/:filename 🔐  Download report file
```
**Upload Body (multipart/form-data):**
```
file           <binary>     Required
title          "Blood Test Results"
description    "Annual checkup panel"
reportType     "lab"
reportDate     "2026-04-15"
familyMemberId 3            Optional — link report to a family member (omit for primary user)
```
> When `familyMemberId` is provided, the server verifies the family member belongs to the authenticated user before saving. Returns `403` if the family member is not found or does not belong to the user.

**GET Query Parameters:**
| Param | Value | Effect |
|---|---|---|
| `familyMemberId` | (omitted) | Returns all reports for the account |
| `familyMemberId=3` | integer | Only reports linked to family member id=3 |
| `familyMemberId=null` | string `"null"` | Only primary user's own reports |

### 9.2 AI Report Analysis
```
POST /api/reports/:reportId/analyze  🔐  AI-analyze medical report
GET  /api/reports/:reportId/analysis 🔐  Get analysis results
```
> Upload lab reports/X-rays and get AI-powered analysis with key findings, recommendations, and risk flags.

---

## 10. Lab Tests & Diagnostics

### 10.1 Discover Labs
```
GET /api/labs/                       (Public)  Search labs
GET /api/labs/:id                    (Public)  Lab details
GET /api/labs/search/advanced        (Public)  Advanced search
GET /api/labs/categories/tests       (Public)  Test categories
GET /api/labs/:labId/tests           (Public)  Lab test menu
GET /api/labs/equipment/types        (Public)  Equipment types
```

### 10.2 Lab Test Catalog (Browse & Search)
```
GET /api/lab-tests/catalog           (Public)  Browse test catalog with prices
```
**Query params:**

| Param | Type | Description |
|---|---|---|
| `q` | string | Partial name / code search (e.g. `CBC`, `thyroid`, `MRI`) |
| `category` | string | Exact category filter (e.g. `Haematology`, `Radiology`) |
| `limit` | int | Max results (default 50, max 200) |
| `offset` | int | Pagination offset (default 0) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "test_id": "CBC-001",
      "name": "Complete Blood Count (CBC)",
      "description": "Routine blood cell analysis — RBC, WBC, platelets, haemoglobin, haematocrit",
      "category": "Haematology",
      "test_code": "CBC",
      "sample_type": "EDTA Blood",
      "turnaround_time_hours": 6,
      "price": "299.00",
      "home_collection_charge": "50.00",
      "currency": "INR"
    }
  ],
  "pagination": { "total": 116, "limit": 50, "offset": 0 },
  "categories": ["Biochemistry", "Cardiology", "Endocrinology", "Haematology", "Health Packages", "Immunology", "Microbiology", "Oncology", "Radiology"]
}
```

> **Tip:** When booking via `POST /api/lab-tests`, omit `price` — the server auto-looks up the price from the catalog using `testName`.

### 10.3 Book Lab Tests
```
POST /api/labs/book                  🔐  Book lab test
POST /api/lab-tests                  🔐  Create lab test order (price auto-filled from catalog)
GET  /api/lab-tests                  🔐  List my lab tests
GET  /api/lab-tests/:id              🔐  Lab test detail
POST /api/lab-tests/:id/confirm      🔐  Confirm booking
POST /api/lab-tests/:id/cancel       🔐  Cancel booking
PUT  /api/lab-tests/:id              🔐  Update lab test
```

**`POST /api/lab-tests` body:**
```json
{
  "testType": "blood_test",
  "testName": "Complete Blood Count (CBC)",
  "appointmentDate": "2026-05-01",
  "appointmentTime": "09:00",
  "urgency": "routine",
  "requiresFasting": false
}
```
> `price` is **optional** — if omitted, the server matches `testName` against the catalog and fills it automatically.

---

## 11. Cart (Lab Tests)

### 11.1 Endpoint Overview

```
GET    /api/cart                  🔐  Get cart
POST   /api/cart/add              🔐  Add item to cart
DELETE /api/cart/remove/:testId   🔐  Remove item by test ID
PUT    /api/cart/update/:testId   🔐  Update item quantity
DELETE /api/cart/clear            🔐  Clear entire cart
POST   /api/cart/sync             🔐  Bulk sync (replace cart with local state)
```

### 11.2 Add Item — `POST /api/cart/add` ⭐

**Request Body:**
```json
{
  "test": {
    "id": "urine-routine",
    "name": "Urine Routine & Microscopy",
    "price": 200,
    "duration": "Same day report"
  },
  "quantity": 1
}
```

> **Critical:** The test object **must** be nested under the `"test"` key. Sending flat fields (e.g. `{ "testId": 1, "labId": 5 }`) returns `400 Bad Request`.

**Response (200):**
```json
{
  "success": true,
  "message": "Item added to cart",
  "cart": [
    { "test": { "id": "urine-routine", "name": "Urine Routine & Microscopy", "price": 200 }, "quantity": 1 }
  ],
  "itemCount": 1,
  "total": 200
}
```

**Response (400 — missing test wrapper):**
```json
{ "success": false, "message": "Test item is required" }
```

### 11.3 Price Format

`price` in the `test` object accepts any of these formats — the backend strips non-numeric characters:

| Format | Example | Parsed as |
|--------|---------|-----------|
| Plain integer | `200` | `200` |
| ₹ prefix string | `"₹200"` | `200` |
| Rs. prefix string | `"Rs. 200"` | `200` |
| Range string | `"₹220 - ₹330"` | `220` (first number) |

### 11.4 Get Cart — `GET /api/cart`

**Response:**
```json
{
  "success": true,
  "cart": [
    { "test": { "id": "cbc", "name": "CBC", "price": 500 }, "quantity": 1 }
  ],
  "total": 500,
  "itemCount": 1,
  "updatedAt": "2026-04-26T06:00:00.000Z"
}
```

### 11.5 Remove Item — `DELETE /api/cart/remove/:testId`

`:testId` = the value of `test.id` used when adding.

### 11.6 Update Quantity — `PUT /api/cart/update/:testId`

```json
{ "quantity": 2 }
```

### 11.7 Sync Cart — `POST /api/cart/sync`

Replaces the server cart entirely with the provided items array:

```json
{
  "items": [
    { "test": { "id": "cbc", "name": "CBC", "price": 500 }, "quantity": 1 },
    { "test": { "id": "urine-routine", "name": "Urine Routine", "price": 200 }, "quantity": 1 }
  ]
}
```

### 11.8 Mobile Integration Notes

- **CartContext** (`app/context/CartContext.js`) manages local cart state and fire-and-forgets a server sync on every `addToCart()` call.
- `addToCart(test, labInfo)` sends: `{ test: { id, name, price, duration }, quantity: 1 }` to `POST /cart/add`.
- Subtotal is computed locally: `price.toString().match(/\d+/)?.[0]` extracts the first numeric value to handle range prices like `"₹220 - ₹330"`.
- Server uses in-memory store (Map); a Redis/DB replacement is planned for production scale.

---

## 12. Wallet & HC Coins

### 12.1 Balance & History
```
GET /api/wallet                          🔐  Full wallet summary (balance, streak, tier, recent transactions)
GET /api/wallet/balance                  🔐  HC coin balance only → { success, balance }
GET /api/wallet/transactions?limit&offset 🔐  Paginated transaction history
GET /api/wallet/rewards                  🔐  Packages (HEALTH_COINS_PRICING) + rewards config
```

### 12.2 Earn HC Coins

| Activity | Endpoint | Notes |
|---|---|---|
| Daily login | `POST /api/wallet/earn/daily-login` | Streak bonus applied automatically |
| Step count | `POST /api/wallet/earn/steps` | Body: `{ "steps": 10000 }` |
| Health assessment | `POST /api/wallet/earn/health-assessment` | After completing §20 assessment |
| Log vital signs | `POST /api/wallet/earn/vital-signs` | Body: `{ "vitalData": { ... } }` |
| Any activity | `POST /api/wallet/earn/activity` | Body: `{ "activityType": "meditation", "value": 30 }` |

**Daily login response:**
```json
{ "success": true, "coinsEarned": 10, "bonusCoins": 5, "streak": 7, "newBalance": 250 }
```

### 12.3 Spend HC Coins
```
POST /api/wallet/spend  🔐
Body: {
  "amount": 50,
  "activityType": "APPOINTMENT_PAYMENT",
  "description": "Consultation with Dr. Sharma",
  "referenceType": "appointment",
  "referenceId": "123",
  "metadata": {}
}
```

### 12.4 Purchase HC Coins (3-Step Flow)

#### Step 1 — Validate coupon (optional)
```
POST /api/wallet/validate-coupon  🔐
Body: { "code": "WELCOME50", "packageId": 1 }
→ { "coupon": { "type": "discount", "value": 50, "discount": 50, "bonusHC": 0, "finalPrice": 99 } }
```

#### Step 2a — Create Razorpay order (paid)
```
POST /api/wallet/create-order  🔐
Body: { "packageId": 1, "couponCode": "WELCOME50" }
→ {
    "order": { "orderId": "order_xxx", "amount": 99, "amountInPaise": 9900, "currency": "INR", "key": "rzp_live_xxx" },
    "coupon": { "finalAmount": 99 }
  }
```
> Open Razorpay modal using `order.key`, `order.amountInPaise`, `order.orderId`.

#### Step 2b — Free coupon shortcut (no payment)
```
POST /api/wallet/redeem-free-coupon  🔐
Body: { "packageId": 1, "couponCode": "FREEHC100" }
→ { "success": true, "totalCoins": 100, "newBalance": 350 }
```

#### Step 3 — Verify payment (Razorpay callback)
```
POST /api/wallet/verify-payment  🔐
Body: {
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "abc123...",
  "packageId": 1,
  "couponCode": "WELCOME50"
}
→ { "success": true, "totalCoins": 100, "newBalance": 350 }
```
> Server verifies HMAC-SHA256 signature before crediting coins. CouponUsage is recorded to prevent reuse.

### 12.5 Appointment Payment with HC

```
GET  /api/wallet/appointment/calculate/:consultationFee  🔐
     → { "canPay": true, "hcRequired": 50, "currentBalance": 250, "bonusPercent": 10 }

POST /api/wallet/appointment/can-pay  🔐
     Body: { "consultationFee": 500 }
     → same shape as calculate

POST /api/wallet/appointment/pay  🔐
     Body: { "appointmentId": 123, "consultationFee": 500, "doctorName": "Dr. Sharma" }
     → { "hcPaid": 50, "consultationFeeINR": 500, "bonusPercent": 10, "newBalance": 200, "transactionId": "txn_xxx" }

POST /api/wallet/appointment/refund  🔐
     Body: { "appointmentId": 123, "hcAmount": 50, "doctorName": "Dr. Sharma" }
     → HC refunded on appointment cancellation
```
> Conversion: `₹500 consultation = 50 HC` (10:1 ratio). Emergency triage via instant call costs 50 HC.

---

## 13. Payments (Razorpay / Stripe)

There are two payment gateway route groups depending on context:

### 13.1 Generic Gateway — `/api/payments` (plans, general use)
```
GET  /api/payments/config                (Public)  Razorpay key + currency
     → { "keyId": "rzp_live_xxx", "currency": "INR" }

POST /api/payments/order             🔐  Create Razorpay order
     Body: { "amount": 500, "currency": "INR", "clientType": "user", "clientId": "19",
             "clientName": "John Doe", "description": "Membership plan" }
     → { "order": { "id": "order_xxx", "amount": 50000, "currency": "INR" },
         "transaction": { "description": "..." }, "gatewayConfig": { "keyId": "...", "name": "Mediczy" } }

POST /api/payments/verify            🔐  Verify Razorpay payment
     Body: { "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "..." }

GET  /api/payments/transactions      🔐  ?status&clientType&startDate&endDate&limit&offset
GET  /api/payments/transactions/:id  🔐  Single transaction
POST /api/payments/refund            🔐  Body: { "transactionId": "...", "amount": 500, "reason": "..." }
POST /api/payments/webhook               Razorpay webhook (no auth)
```

### 13.2 Billing Gateway — `/api/billing/payments` (orders, lab tests, pharmacy)

#### Razorpay
```
POST /api/billing/payments/razorpay/create  🔐
     Body: { "orderId": "ord_123", "amount": 500, "currency": "INR" }
     → { "orderId": "order_xxx", "amount": 500, "currency": "INR", "key": "rzp_live_xxx" }

POST /api/billing/payments/razorpay/verify  🔐
     Body: { "orderId": "ord_123", "razorpayOrderId": "order_xxx",
             "razorpayPaymentId": "pay_xxx", "razorpaySignature": "abc..." }
     [Verifies HMAC-SHA256, updates Order → "completed", creates Transaction record]
     → { "success": true, "data": { "payment": { ... } } }
```

#### Stripe (international)
```
POST /api/billing/payments/stripe/create  🔐
     Body: { "orderId": "ord_123", "amount": 500, "currency": "usd" }
     → { "clientSecret": "pi_xxx_secret_yyy", "paymentIntentId": "pi_xxx", "amount": 500, "currency": "usd" }
```
> Use `clientSecret` with `stripe.confirmCardPayment()` on the client. No server-side verify step needed for Stripe — PaymentIntent status is checked via webhook.

### 13.3 Signature Verification (both gateways)
HMAC-SHA256 of `razorpay_order_id + "|" + razorpay_payment_id` signed with `RAZORPAY_KEY_SECRET`. Always verified server-side before any order is marked complete or coins are credited.

### 13.4 Order Payment State Machine
```
Order:       pending → completed   (on Razorpay/Stripe verify)
Payment:     initiated → success
Transaction: created on verify     (type: credit, linked to Order)
Invoice:     generated on demand   POST /api/billing/invoices/generate
```

---

## 14. Billing & Invoices

### 14.1 Create Orders

```
POST /api/billing/orders/create  🔐  Generic order (lab_test, appointment, subscription, etc.)
     Body: {
       "orderType": "lab_test",     // "lab_test" | "medicine" | "appointment" | "plan" | ...
       "itemId": 5,
       "subtotal": 800,
       "tax": 0,
       "discount": 0,
       "currency": "INR",
       "billingAddress": { ... },
       "notes": "Urgent"
     }
     → { "success": true, "data": { "order": { "id": "ord_123", "orderNumber": "ORD-2026-001", "status": "pending", "total": 800 } } }

POST /api/billing/orders  🔐  Pharmacy order (shortcut — creates order + line items)
     Body: {
       "orderType": "medicine",
       "items": [{ "medicineId": "MED-001", "name": "Paracetamol 500mg", "quantity": 2, "price": 45 }],
       "deliveryAddress": { "line1": "...", "city": "Mumbai", "pincode": "400001" }
     }
     → { "data": { "order": { "id": "ord_124", "orderNumber": "ORD-2026-002" } } }
```

### 14.2 Read Orders

> ⚠️ **`GET /api/billing/orders` is temporarily unavailable (returns 500 — DB migration pending).** Use `GET /api/billing/orders/pharmacy/history` for pharmacy order history. Do not build against the base list endpoint until this notice is removed.

```
GET  /api/billing/orders                     🔐  ?status&page&limit  ⚠️ 500 — migration pending
GET  /api/billing/orders/:orderId            🔐  Basic order detail
GET  /api/billing/orders/:orderId/detailed   🔐  Full: items, payments, timeline, tracking, invoice, addresses
POST /api/billing/orders/:orderId/reorder    🔐  Duplicate a previous pharmacy order
GET  /api/billing/orders/pharmacy/history    🔐
     → { "orders": [], "stats": { "totalOrders", "activeOrders", "deliveredOrders", "totalSpent" } }
GET  /api/billing/orders/pharmacy/medicine-search?q=paracetamol&limit=10  🔐  Medicine catalog search
```

### 14.3 Invoices
```
POST /api/billing/invoices/generate  🔐
     Body: { "orderId": "ord_123", "lineItems": [], "notes": "Thank you" }
     → { "invoice": { "id": "inv_xxx", "invoiceNumber": "INV-2026-001", "pdfUrl": "...", "status": "sent" } }

GET  /api/billing/invoices                      🔐  ?status&page&limit
GET  /api/billing/invoices/:invoiceId           🔐  Invoice with linked order
GET  /api/billing/invoices/:invoiceId/download  🔐  PDF file stream (download)
```

### 14.4 Transactions & Stats
```
GET  /api/billing/transactions  🔐  ?type&status&page&limit  Full payment audit trail
GET  /api/billing/stats         🔐
     → { "totalSpent": 4500, "orderCounts": [{ "status": "completed", "count": 12 }],
         "recentPayments": [], "pendingInvoices": 2 }
```

---

## 15. Membership Plans

Two route groups serve membership. **Use `/api/membership-plans/enroll` (§15.4) as the canonical subscribe path.** `POST /api/membership/subscribe/:planId` (§15.3) is **deprecated — use only for internal/admin tooling**.
- `/api/membership` — upgrade, usage tracking (`membership.route.js`)
- `/api/membership-plans` — enroll, referrals, card image — **primary path** (`membership-plans.route.js`)

### 15.1 Browse Plans
```
GET /api/membership/plans         (Public)  ?type=individual|family|corporate|...
GET /api/membership-plans/plans   (Public)  Same — v2 route via membershipService
GET /api/membership-plans/plans/:slug  (Public)  Single plan detail by slug
```
**Response shape (`/api/membership/plans`):**
```json
{
  "plans": [{
    "id": 3,
    "name": "Silver Plus",
    "description": "...",
    "tier": 2,
    "tierName": "Silver Plus",
    "type": "individual",
    "planType": "primary",
    "price": "999.00",
    "discountedPrice": "799.00",
    "durationMonths": 1,
    "features": ["Unlimited teleconsult", "₹2000 pharmacy benefit"],
    "benefits": { ... },
    "limitations": { ... },
    "isActive": true,
    "sortOrder": 2
  }]
}
```

### 15.2 My Subscription

```
GET /api/membership/my/current   🔐
```
**Response:**
```json
{
  "userPlan": {
    "id": 42,
    "userId": 19,
    "membershipPlanId": 3,
    "status": "active",
    "startDate": "2026-04-01",
    "endDate": "2026-05-01",
    "paidAmount": "799.00",
    "paymentMethod": "razorpay",
    "appliedLimits": {
      "benefitLimits": {
        "pharmacyLimitINR": 2000,
        "homeCareLimitINR": 1000,
        "ambulanceLimitINR": 500
      },
      "teleConsultLimits": { "allSpecialties": 10 },
      "healthCheckPackage": null,
      "priceINR": 799
    },
    "usage": {
      "benefitINR": { "pharmacyINR": 350, "homeCareINR": 0, "ambulanceINR": 0 },
      "teleConsult": { "General Physician": 2 }
    }
  },
  "plan": { "id": 3, "name": "Silver Plus", ... }
}
```

```
GET /api/membership-plans/subscription  🔐   (alternative — uses UserPlan model directly)
GET /api/membership/my/all              🔐   Primary plan + all active add-ons
     → { "primaryPlan": {...}, "addonPlans": [...], "totalActive": 2 }
GET /api/membership/my/usage            🔐
     → { "active": {...}, "remaining": { "pharmacyLimitINR": 1650, "homeCareLimitINR": 1000, "ambulanceLimitINR": 500 } }
```

### 15.3 Subscribe (new primary plan)

```
POST /api/membership/subscribe/:planId  🔐
```
> Creates a `UserPlan` immediately (no payment verification — call `POST /api/membership/payment-order` first then upgrade to pass payment ID).  
> Returns `{ userPlan }`.

### 15.4 Subscribe via Slug (with referral & billing cycle)

```
POST /api/membership-plans/enroll  🔐
Body: {
  "planSlug": "silver-plus",
  "billingCycle": "MONTHLY",    // "MONTHLY" | "ANNUAL"
  "referralCode": "REF-ABC123", // optional
  "paymentId": "pay_xxx",       // optional — Razorpay payment id
  "paymentMethod": "razorpay"
}
→ { "success": true, "message": "Successfully enrolled", "data": { "subscription": {...} } }
```

### 15.5 Plan Upgrade (prorated pricing)

#### Step 1 — Get upgrade options
```
GET /api/membership/upgrade-options  🔐
→ {
    "hasActivePlan": true,
    "currentPlan": { "id": 3, "name": "Silver Plus", "tier": 2, "endDate": "...", "remainingDays": 18, "proratedRefund": 463 },
    "upgradeOptions": [{
      "id": 5, "name": "Gold", "tier": 4,
      "originalPrice": 1999, "proratedRefund": 463, "amountDue": 1536,
      "features": [...], "durationMonths": 1
    }]
  }
```

#### Step 2 — Create Razorpay order for amount due
```
POST /api/membership/payment-order  🔐
Body: { "amount": 1536, "planId": 5, "planName": "Gold" }
→ { "success": true, "order": { "id": "order_xxx", "amount": 153600, "currency": "INR" },
    "gatewayConfig": { "key": "rzp_live_xxx", "name": "Mediczy" } }
```

#### Step 3 — Confirm upgrade with payment
```
POST /api/membership/upgrade/:newPlanId  🔐
Body: { "razorpay_payment_id": "pay_xxx", "razorpay_order_id": "order_xxx", "razorpay_signature": "abc..." }
→ {
    "success": true,
    "previousPlan": { "id": 3, "name": "Silver Plus", "tier": 2, "proratedRefund": 463 },
    "newPlan": { "id": 5, "name": "Gold", "tier": 4, "amountDue": 1536 },
    "userPlan": { ... }
  }
```
> Upgrade via slug (legacy service): `POST /api/membership-plans/upgrade` with `{ planSlug, billingCycle, paymentId, paymentMethod }`.

### 15.6 Add-on Plans
```
GET  /api/membership/addons  🔐
     → { "addons": [{ ..., "isSubscribed": false }], "activeAddons": [] }

POST /api/membership/subscribe/:addonPlanId  🔐   (same endpoint — detects planType = 'addon')
```

### 15.7 Cancel Subscription
```
POST /api/membership-plans/cancel  🔐
Body: { "reason": "Too expensive" }
→ { "success": true, "message": "Subscription cancelled successfully" }
```

### 15.8 Usage Recording
```
POST /api/membership/usage/teleconsult  🔐
Body: { "specialty": "Cardiology", "count": 1 }
→ { "success": true, "usage": { "teleConsult": { "Cardiology": 1 } } }

POST /api/membership/usage/benefit  🔐
Body: { "type": "pharmacyINR", "amount": 250 }
     type: "pharmacyINR" | "homeCareINR" | "ambulanceINR"
→ { "success": true, "usage": { "benefitINR": { "pharmacyINR": 600, "homeCareINR": 0, "ambulanceINR": 0 } } }
```
> Call `POST /usage/teleconsult` after every teleconsult. Call `POST /usage/benefit` when a covered benefit (pharmacy delivery, home care, ambulance) is reimbursed.

### 15.9 Feature Gate
```
POST /api/membership-plans/check-feature  🔐
Body: { "feature": "ai_consult" }
→ { "success": true, "data": { "hasAccess": true, "usageRemaining": 8, "limit": 10 } }
```

### 15.10 Referrals
```
POST /api/membership-plans/validate-referral  (Public)
Body: { "code": "REF-ABC123" }
→ { "data": { "valid": true, "discount": 100, "bonusCoins": 50, "planId": 3 } }

GET  /api/membership-plans/referral           🔐
     → { "referralCode": "REF-XYZ789", "totalReferrals": 5, "bonusCoinsEarned": 250, "referrals": [...] }

POST /api/membership-plans/generate-referral  🔐
Body: { "planId": 3 }     // optional — ties code to specific plan
→ { "data": { "referralCode": { "code": "REF-XYZ789", "discount": 100, ... } } }
```

### 15.11 Membership Card (Server-Rendered PNG)

The server renders a dynamic membership card via Puppeteer (tier gradient, QR code, member ID).

```
GET /api/membership-plans/card-image  🔐
    ?scale=2          // 1 | 2 | 3  (default: 2, 2× = 960×560px)
    ?format=png       // "png" | "jpeg"
→   PNG/JPEG binary stream (Content-Type: image/png)
    Cache-Control: private, max-age=300
    Filename: mediqzy-card-MED-000019.png
```

**Usage in React Native:**
```jsx
import { Image } from 'react-native';
import { BASE } from '../../Utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Build authenticated URL — headers not supported in RN <Image/> src
// Option A: Use Membership.cardImageUrl() for display in a WebView
// Option B: Download to local file with fetch() + Authorization header
const token = await AsyncStorage.getItem('authToken');
const cardUrl = `${BASE}/membership-plans/card-image?scale=2&format=png`;

// With react-native-fast-image (supports headers):
<FastImage source={{ uri: cardUrl, headers: { Authorization: `Bearer ${token}` } }} />
```

**Card design by tier:**
| Tier | Gradient |
|---|---|
| free | Grey slate |
| basic | Blue |
| premium | Purple → Pink → Red |
| enterprise | Gold → Orange → Red |
| corporate | Green → Teal → Cyan |

> QR code data: `{ memberId, name, email, tier, ts }` — use for scan-to-verify at partner clinics.

### 15.12 Corporate Self-Enroll
```
POST /api/membership-plans/corporate/self-enroll  🔐
Body: {
  "corporateName": "Reliance Industries",
  "employeeId": "EMP-4512",
  "officialEmail": "john.doe@reliance.com"
}
→ { "success": true, "message": "Corporate plan mapped successfully.", "data": { "subscription": {...} } }
```

---

## 16. AI Medical Features

> **Canonical AI endpoint:** Always use `POST /api/medical-ai/consult` (§16.1) for all Dr. iSHA interactions. The rule-based endpoint `POST /api/ai-health/dr-isha/consult` and legacy `POST /api/ai/working-medical-consult` are **deprecated — Sunset: 2026-11-01** and will be removed.

### 16.1 AI Consultation (Dr. iSHA) — Primary
```
POST /api/medical-ai/consult  🔐
Body: {
  "query": "I have a headache and fever for 2 days",
  "sessionId": null,             // null → new session; pass existing id for follow-up
  "language": "en",              // "en" | "hi" | "ta" | "te" | "kn" | "ml" | "bn" | "mr"
  "userContext": {
    "emergencyMode": false       // true → 15s timeout, no DB context loaded
  }
}
```
**Response:**
```json
{
  "success": true,
  "response": "Based on your symptoms of headache and fever...",
  "sessionId": "mediczy_19",
  "suggestions": ["Rest adequately", "Stay hydrated"],
  "urgencyLevel": "low",
  "shouldConsultDoctor": false,
  "specialtySuggestion": "General Medicine",
  "provider": "sib-fastapi",
  "processingTime": 1240
}
```
> Full user medical context (prescriptions, vitals, appointments) is automatically loaded and sent to the SIB AI engine. Sessions persist in memory enabling multi-turn conversation.

### 16.2 Symptom Analysis
```
POST /api/medical-ai/analyze-symptoms  🔐
Body: {
  "symptoms": ["headache", "fever", "nausea"],
  "description": "Throbbing pain behind the eyes",
  "severity": "moderate",           // "mild" | "moderate" | "severe"
  "duration": "2 days",
  "language": "en"
}
```
**Response:** Same shape as `/consult` plus `{ symptoms, description, severity, duration }` echoed back.

### 16.3 Emergency Triage
```
POST /api/medical-ai/emergency-triage  🔐
Body: { "symptoms": "chest pain and difficulty breathing", "description": "sharp pain radiating to arm", "language": "en" }
```
**Response:**
```json
{
  "success": true,
  "urgencyLevel": "CRITICAL",
  "response": "Based on symptoms...",
  "requiresImmediateAttention": true,
  "callAmbulance": true,
  "recommendedActions": ["Seek immediate medical attention", "Do not drive yourself"],
  "triageId": "triage_1714046400000_19"
}
```
> Urgency levels: `CRITICAL` | `HIGH` | `MODERATE` | `LOW`. Defaults to `HIGH` if ambiguous (safety-first).

### 16.4 Emergency SOS
```
POST /api/medical-ai/emergency-sos  🔐
Body: {
  "reason": "Heart attack symptoms",
  "urgencyLevel": "critical",
  "location": { "lat": 19.076, "lng": 72.877 },
  "visionAnalysis": { "distressLevel": "high", "consciousnessLevel": "alert", "respiratoryPattern": "labored" },
  "contacts": [{ "name": "Jane Doe", "email": "jane@example.com", "type": "family" }]
}
```
**Response:**
```json
{
  "success": true,
  "message": "Emergency SOS sent to 3 contact(s)",
  "notifiedContacts": [
    { "type": "doctor", "name": "Dr. Sharma", "method": "push" },
    { "type": "doctor", "name": "Dr. Sharma", "method": "email" },
    { "type": "family", "name": "Jane Doe", "method": "email" }
  ],
  "timestamp": "2026-04-25T10:00:00.000Z"
}
```
> Notifies: assigned doctor (push + email) → organization HR (if corporate) → family contacts provided. Google Maps location link embedded in email.

### 16.5 Instant Emergency Video Call with Doctor
```
GET  /api/medical-ai/triage-doctors  🔐
     → { "count": 3, "doctors": [{ "id", "name", "specialization", "consultationFee", "isOnline": true }] }

POST /api/medical-ai/instant-triage-call  🔐 (auth optional — emergency)
Body: {
  "doctorId": 70,                // optional — auto-assigns if not specified
  "symptoms": "chest pain",
  "urgencyLevel": "HIGH",
  "triageId": "triage_xxx",
  "paymentMethod": "hc"          // "hc" for HC coins, omit for credit (pay later)
}
```
**Response:**
```json
{
  "success": true,
  "doctor": { "id": 70, "name": "Dr. Sharma", "specialization": "Cardiology" },
  "videoCall": {
    "roomId": "triage_abc123_1714046400000",
    "patientJoinUrl": "https://msh-kw9tvxa9.livekit.cloud/rooms/triage_abc123...",
    "livekit": { "patient": { "token": "eyJ...", "serverUrl": "wss://..." } }
  },
  "billing": {
    "paymentType": "credit",
    "consultationFee": 500,
    "creditUsed": true,
    "healthCoinsUsed": 0,
    "creditsRemaining": 0,
    "pendingAmount": 500,
    "message": "This emergency consultation is on credit - pay later."
  }
}
```
> Registered users get 1 free emergency consultation on credit. Guests limited to 5 anonymous calls/day by IP. Paying with HC: 50 HC = ₹500 consultation.

### 16.6 AI Report Analysis
```
POST /api/medical-ai/analyze-report  🔐
Body: multipart/form-data { "file": <binary>, "reportType": "blood_test" }
→ AI-powered analysis with key findings, risk flags, and recommendations
```

### 16.7 Health Summary
```
GET /api/medical-ai/health-summary  🔐
```
Returns the user's profile snapshot including BMI, chronic conditions, allergies, medications, family history, and upcoming appointment count. Used as the context card in the Dr. iSHA screen.

**Response:**
```json
{
  "success": true,
  "healthSummary": {
    "profile": {
      "name": "John Doe",
      "age": 35,
      "gender": "Male",
      "bloodType": "O+",
      "weight": 72,
      "height": 170,
      "bmi": 24.9
    },
    "conditions": {
      "chronicConditions": ["Hypertension"],
      "allergies": ["Penicillin"],
      "medications": ["Amlodipine 5mg"],
      "familyHistory": ["Diabetes"]
    },
    "upcomingAppointments": 2,
    "generatedAt": "2026-04-25T10:00:00.000Z"
  }
}
```

### 16.8 Session & Conversation Management
```
GET    /api/medical-ai/session/:sessionId      🔐  Restore conversation history
DELETE /api/medical-ai/session/:sessionId      🔐  Clear session memory
POST   /api/medical-ai/conversation-history   🔐  Body: { "sessionId": "..." }
POST   /api/medical-ai/intent-escalation       🔐  Detect if message needs live doctor
       Body: { "sessionId": "...", "message": "I feel worse" }
POST   /api/medical-ai/feedback                🔐  Body: { "conversationId": "...", "thumbs": "up", "rating": 5 }
```

### 16.9 AI Health Chat (`/api/ai-health`) — PHI-Safe Rule-Based

A lightweight, schema-validated alternative to the SIB backend. PHI-redacted before responding. Audits every request to `ai_request_audit`.

```
POST /api/ai-health/chat  🔐
Body: { "message": "I have chest pain", "symptoms": "chest pain, shortness of breath", "sessionId": null }
```
**Response (high-risk example):**
```json
{
  "success": true,
  "message": "I understand you mentioned: \"chest pain\". Based on this, here's my assessment:",
  "analysis": {
    "severity": "high",
    "possibleConditions": ["Cardiac event", "Angina", "Pulmonary embolism"],
    "recommendations": ["Seek immediate medical attention"],
    "urgency": "URGENT: Please seek immediate medical attention."
  },
  "suggestedActions": [
    { "action": "See a Doctor NOW", "type": "urgent", "url": "/consultation-booking?urgency=emergency" },
    { "action": "Book Consultation", "type": "primary", "url": "/consultation-booking" }
  ],
  "highRisk": true,
  "auditId": "550e8400-e29b-41d4-a716-446655440000",
  "bookingCta": { "url": "/consultation-booking?urgency=emergency", "label": "Book Emergency Consultation" },
  "disclaimer": "This is an AI-generated response and should not replace professional medical advice."
}
```
> High-risk terms that trigger `highRisk: true`: chest pain, shortness of breath, stroke, unconscious, heart attack, severe bleeding, seizure, paralysis, sudden vision loss, suicidal, overdose.

### 16.10 Dr. iSHA Rule-Based Consult
```
POST /api/ai-health/dr-isha/consult  🔐
Body: { "message": "I feel dizzy after standing up", "symptoms": "dizziness", "medicalHistory": "Hypertension" }
→ {
    "drIshaResponse": {
      "greeting": "Hello! I'm Dr. ISHA, your AI health assistant.",
      "analysis": "Based on your input...",
      "insights": ["Monitor condition closely", "Consider symptom diary"],
      "recommendations": [
        { "title": "Immediate Care", "steps": ["Rest", "Hydrate", "Monitor temperature"] },
        { "title": "When to See a Doctor", "steps": ["If symptoms worsen", "Fever above 101°F"] }
      ],
      "nextSteps": ["Track symptoms daily", "Book a consultation if needed"]
    }
  }
```

### 16.11 AI Utilities
```
POST /api/ai/working-medical-consult      🔐  Full medical consultation (legacy)
POST /api/ai/appointment-conversation     🔐  Booking conversation AI
POST /api/ai/translate                    🔐  Body: { "text": "...", "targetLanguage": "hi" }
POST /api/ai/text-to-speech              🔐  Body: { "text": "...", "voice": "alloy" }
GET  /api/ai/voices                       🔐  Available TTS voices
POST /api/ai/feedback                     🔐  AI feedback submission
POST /api/ai/analyze-image               🔐  Image analysis
```

---

## 17. AI Brain (Dr. iSHA Advanced)

```
POST   /api/v3/ai-brain/think                     🔐  AI reasoning query
       Body: { "message": "What doctor should I see for knee pain?", "conversationId": null }
GET    /api/v3/ai-brain/conversations              🔐  List conversations
GET    /api/v3/ai-brain/conversations/:id          🔐  Get conversation
DELETE /api/v3/ai-brain/conversations/:id          🔐  Delete conversation
GET    /api/v3/ai-brain/memory                     🔐  Get AI memory context
GET    /api/v3/ai-brain/tools                      🔐  List available tools
GET    /api/v3/ai-brain/tool-history               🔐  Tool usage history
POST   /api/v3/ai-brain/documents                  🔐  Upload document for RAG
GET    /api/v3/ai-brain/knowledge-stats            🔐  Knowledge base stats
GET    /api/v3/ai-brain/providers                  🔐  List AI providers
GET    /api/v3/ai-brain/health                     🔐  AI system health
```

---

## 18. AI Intelligence (Drug/Insurance/Triage)

> **Base path:** `/api/ai-intelligence`  
> All endpoints require `Authorization: Bearer <token>`.

### 18.1 Drug Interactions
```
POST /api/ai-intelligence/drug-interactions/check  🔐
Body: { "medications": ["Aspirin", "Warfarin", "Ibuprofen"], "useLLM": true }
→ { "interactions": [{ "pair": [...], "severity": "major", "description": "..." }], "recommendations": [] }

POST /api/ai-intelligence/drug-interactions/quick-check  🔐
Body: { "medications": ["Aspirin", "Warfarin"] }
→ Database-only check — sub-10ms, no LLM call
```

### 18.2 Insurance AI
```
POST /api/ai-intelligence/insurance/query     🔐
Body: { "query": "Is my knee replacement covered?", "insuranceType": "health" }

POST /api/ai-intelligence/insurance/pre-auth  🔐
Body: { "treatmentType": "hospitalization", "estimatedCost": 75000, "procedureCode": "Z51.11" }

POST /api/ai-intelligence/insurance/coverage  🔐
Body: { "treatmentType": "MRI scan", "estimatedCost": 5000, "insuranceProvider": "Star Health" }

GET  /api/ai-intelligence/insurance/health    (Public)  GPU model status
```

### 18.3 AI Triage (ESI 5-Level)
```
POST /api/ai-intelligence/triage/assess  🔐
Body: {
  "symptoms": "severe chest pain radiating to left arm",
  "vitals": { "heartRate": 112, "bp": "160/100", "spo2": 94 },
  "painScale": 8,
  "age": 52,
  "gender": "male"
}
→ { "esiLevel": 1, "disposition": "immediate", "interventions": ["ECG", "IV access", "O2"] }
```

### 18.4 Health Risk Scores
```
GET  /api/v3/ai-intelligence/risk-score/me           🔐
     → { "score": { "overall": 0.34, "cardiovascular": 0.22, "diabetes": 0.18, ... } }

GET  /api/v3/ai-intelligence/risk-score/:patientId   🔐  (doctors only)
```
> Mobile clients should use the `/api/v3/ai-intelligence/*` base path.

### 18.5 Smart Notifications
```
GET   /api/ai-intelligence/notifications/smart        🔐  ?limit&status
      → { "notifications": [{ "id", "message", "category", "priority", "status", "createdAt" }] }

PATCH /api/ai-intelligence/notifications/smart/:id/read  🔐  Mark as read
```

### 18.6 Clinical Insights
```
GET   /api/ai-intelligence/insights/patient/:patientId  🔐
      → { "insights": [{ "id", "type", "severity", "message", "actionRequired" }] }

GET   /api/ai-intelligence/insights/system              🔐  System-level insights (admin/doctor)

PATCH /api/ai-intelligence/insights/:id/action          🔐  Mark insight as actioned

POST  /api/ai-intelligence/feedback                     🔐
      Body: { "conversationId": "...", "thumbs": "up", "rating": 5, "comment": "..." }
```

### 18.7 Self-Learning Quality Metrics
```
GET  /api/ai-intelligence/learning/insights  🔐  Recent learning insights from sib_learning_insights
GET  /api/ai-intelligence/learning/quality   🔐
     → { "metrics": { "avg_relevance": 0.87, "avg_accuracy": 0.91, "thumbs_up": 142, "avg_rating": 4.2 } }
```

---

## 19. Health Diary

```
GET    /api/health-diary                    🔐  List entries
POST   /api/health-diary                    🔐  Create entry
       Body: { "type": "symptom", "title": "Headache", "notes": "Moderate pain", "severity": 6, "date": "2026-03-15" }
PUT    /api/health-diary/:id                🔐  Update entry
DELETE /api/health-diary/:id                🔐  Delete entry
GET    /api/health-diary/prescriptions      🔐  Prescriptions in diary
GET    /api/health-diary/summary            🔐  Diary summary
POST   /api/health-diary/log-medication     🔐  Log medication intake
       Body: { "medicationName": "Paracetamol", "dosage": "500mg", "takenAt": "2026-03-15T08:00:00Z" }
POST   /api/health-diary/log-symptom        🔐  Log symptom
       Body: { "symptom": "headache", "severity": 7, "notes": "Started after lunch" }
```

---

## 20. Health Assessment

> Base path: `/api/health-assessment` · Alias: `/api/hra`

All endpoints require authentication (`🔐`) unless noted.

### 20.1 Questionnaire Schema
```
GET /api/health-assessment/questions  🔐
```
Returns the full question schema for building the health assessment form on the mobile app. Sections: `measurements` (age, gender, height, weight, waist, hip), `lifestyle` (smoking, alcohol, exercise_frequency, diet_quality, sleep_hours, stress_level), `medical_history` (hypertension, diabetes, heart_disease, cholesterol, mental_health), `family_history` (family_heart_disease, family_diabetes, family_cancer).

**Response:**
```json
{
  "success": true,
  "version": "1.0",
  "sections": [
    {
      "id": "measurements",
      "title": "Body Measurements",
      "fields": [
        { "id": "age",    "label": "Age",    "type": "number", "unit": "years", "required": true },
        { "id": "gender", "label": "Gender", "type": "select", "options": ["male", "female", "other"], "required": true },
        { "id": "height", "label": "Height", "type": "number", "unit": "cm", "required": true },
        { "id": "weight", "label": "Weight", "type": "number", "unit": "kg", "required": true }
      ]
    }
  ]
}
```

---

### 20.2 Save / Submit Assessment
```
POST /api/health-assessment/save  🔐
```
Creates a new assessment row on each submit (history is preserved).

**Body:**
```json
{
  "age": 35,
  "gender": "male",
  "height": 175,
  "weight": 82,
  "waist": 88,
  "hip": 96,
  "bmi": 26.8,
  "whr": 0.92,
  "smoking": "never",
  "alcohol": "occasionally",
  "exercise_frequency": "moderate",
  "hypertension": "no",
  "diabetes": "no",
  "heart_disease": "no",
  "cholesterol": "no",
  "mental_health": "normal",
  "family_heart_disease": "no",
  "family_diabetes": "yes",
  "family_cancer": "no",
  "stress_level": 4,
  "sleep_hours": 7,
  "diet_quality": "good",
  "responses": {}
}
```
> Required: `age`, `gender`, `height`, `weight`. All others default gracefully.

**Assessment Save Payload Contract (recommended for mobile):**

| Field | Required | Type | Allowed / Notes |
|---|---|---|---|
| `age` | Yes | number | Integer years |
| `gender` | Yes | string | `male` \| `female` \| `other` |
| `height` | Yes | number | cm |
| `weight` | Yes | number | kg |
| `waist`, `hip`, `bmi`, `whr` | No | number | Anthropometrics |
| `smoking` | No | string | Canonical: `never` \| `former` \| `current` |
| `alcohol` | No | string | Canonical: `none` \| `occasionally` \| `weekly` \| `daily` |
| `exercise_frequency` | No | string | Canonical: `sedentary` \| `light` \| `moderate` \| `active` |
| `hypertension`, `diabetes`, `heart_disease`, `cholesterol` | No | string | `yes` \| `no` |
| `mental_health` | No | string | `normal` \| `stressed` \| `anxious` \| `depressed` |
| `family_heart_disease`, `family_diabetes`, `family_cancer` | No | string | `yes` \| `no` |
| `stress_level` | No | number | 1-10 |
| `sleep_hours` | No | number | Hours/night |
| `diet_quality` | No | string | `poor` \| `fair` \| `good` \| `excellent` |
| `responses` | No | object | Raw questionnaire responses preserved as metadata |

**Optional Clinical Inputs (if available):**
`ethnicity`, `neck_cm`, `sbp`, `af`, `family_heart_disease_premature`, `snores_loudly`, `daytime_sleepiness`, `observed_apneas`, `hba1c`, `total_chol_mmol`, `hdl_mmol`, `creatinine_mgdl`, `urine_acr`

Optional clinical fields are used to compute richer `riskAssessment.clinicalScores` in the response.

**Normalization Notes (server-side):**
- `smoking` aliases like `occasional`, `regular_lt10`, `heavy_gte10` are normalized to `current`.
- `alcohol` aliases like `occasional`, `moderate`, `heavy_daily`, `binge` are normalized to canonical values.
- `exercise_frequency` aliases like `150_mod`, `75_150_mod`, `lt75` are normalized to canonical values.

**Field Reference:**

| Field | Type | Values |
|---|---|---|
| `smoking` | string | `never` \| `former` \| `current` |
| `alcohol` | string | `none` \| `occasionally` \| `weekly` \| `daily` |
| `exercise_frequency` | string | `sedentary` \| `light` \| `moderate` \| `active` |
| `hypertension` / `diabetes` / `heart_disease` / `cholesterol` | string | `yes` \| `no` |
| `mental_health` | string | `normal` \| `stressed` \| `anxious` \| `depressed` |
| `family_heart_disease` / `family_diabetes` / `family_cancer` | string | `yes` \| `no` |
| `diet_quality` | string | `poor` \| `fair` \| `good` \| `excellent` |
| `stress_level` | number | 1–10 |
| `sleep_hours` | number | hours per night |

**Response (201):**
```json
{
  "success": true,
  "assessment": {
    "id": 42,
    "userId": 19,
    "assessedAt": "2026-04-21T10:30:00.000Z",
    "measurements": { "age": 35, "height": 175, "weight": 82, "bmi": 26.8, "waist": 88, "hip": 96, "whr": 0.92 },
    "lifestyle": { "smoking": "never", "alcohol": "occasionally", "exercise_frequency": "moderate", "sleep_hours": 7, "diet_quality": "good" },
    "medical": { "hypertension": "no", "diabetes": "no", "heart_disease": "no", "cholesterol": "no", "mental_health": "normal" },
    "family_history": { "heart_disease": "no", "diabetes": "yes", "cancer": "no" }
  },
  "riskAssessment": {
    "score": 24,
    "maxScore": 100,
    "riskLevel": "MILD",
    "riskFactors": ["Family History - Diabetes"],
    "recommendations": ["Maintain current health habits", "Annual health checkup"]
  }
}
```

**Risk Levels (user-facing assessment):**
| Level | Score Range | Description |
|---|---|---|
| `LOW` | 0–14 | Healthy profile |
| `MILD` | 15–29 | Low-grade risk factors |
| `MODERATE` | 30–49 | Lifestyle modification recommended |
| `HIGH` | 50–69 | Clinical consultation advised |
| `VERY_HIGH` | 70–100 | Immediate medical review |

---

### 20.3 Get Latest Assessment
```
GET /api/health-assessment         🔐
GET /api/health-assessment/latest  🔐  (alias)
GET /api/health-assessment/my      🔐  (alias — mobile-friendly, returns 200 + null when none)
```
**Response (200):**
```json
{
  "success": true,
  "assessment": {
    "id": 42,
    "userId": 19,
    "assessedAt": "2026-04-21T10:30:00.000Z",
    "measurements": { "age": 35, "height": 175, "weight": 82, "bmi": 26.8, "waist": 88, "hip": 96, "whr": 0.92 },
    "riskAssessment": { "score": 24, "riskLevel": "MILD", "riskFactors": ["Family History - Diabetes"] }
  }
}
```
> `GET /api/health-assessment` and `/latest` return `404` if no assessment exists.  
> `GET /api/health-assessment/my` always returns `200` — if no assessment exists, returns `{ success: true, assessment: null, hasAssessment: false, message: "..." }`. Prefer `/my` in mobile screens to avoid error-handling for first-time users.

---

### 20.4 Get Assessment History
```
GET /api/health-assessment/history  🔐
```
Returns all assessments with period-based groupings (daily, weekly, monthly, quarterly, half-yearly, annual). Annual period is calculated from the user's birthday.

**Response (200):**
```json
{
  "success": true,
  "total": 6,
  "assessments": [
    {
      "id": 42,
      "score": 24,
      "riskLevel": "MILD",
      "assessedAt": "2026-04-21T10:30:00.000Z",
      "bmi": 26.8,
      "whr": 0.92,
      "periods": { "daily": true, "weekly": true, "monthly": true, "quarterly": true, "halfYearly": true, "annual": true }
    }
  ],
  "periodSummaries": {
    "daily":     { "count": 1, "avgScore": 24, "latestScore": 24, "latestLevel": "MILD", "trend": "stable" },
    "weekly":    { "count": 2, "avgScore": 26, "latestScore": 24, "latestLevel": "MILD", "trend": "improving" },
    "monthly":   { "count": 3, "avgScore": 27, "latestScore": 24, "latestLevel": "MILD", "trend": "improving" },
    "quarterly": { "count": 5, "avgScore": 28, "latestScore": 24, "latestLevel": "MILD", "trend": "stable" },
    "halfYearly":{ "count": 5, "avgScore": 28, "latestScore": 24, "latestLevel": "MILD", "trend": "stable" },
    "annual":    { "count": 6, "avgScore": 29, "latestScore": 24, "latestLevel": "MILD", "trend": "improving" }
  },
  "dailyCycle": { "start": "2026-04-20T15:30:00.000Z", "end": "2026-04-21T15:30:00.000Z", "label": "9 PM – 9 PM IST" },
  "birthday": {
    "date": "1990-03-15T00:00:00.000Z",
    "nextBirthday": "2027-03-15T00:00:00.000Z",
    "daysUntilBirthday": 328,
    "annualPeriodStart": "2026-03-15T00:00:00.000Z",
    "annualPeriodEnd": "2027-03-15T00:00:00.000Z",
    "monthlyMonitoring": [
      { "month": 1, "label": "Mar 26", "isCurrent": false, "count": 2, "avgScore": 30 }
    ]
  }
}
```

---

### 20.4A React Native Integration (Create + Fetch + Score)

Use this in a React Native app (TypeScript) with Axios.

```ts
// src/services/healthFlowApi.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://app.mediqzy.com',
  timeout: 20000,
});

export const setAuthToken = (token: string) => {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
};

export type YesNo = 'yes' | 'no';
export type Gender = 'male' | 'female' | 'other';
export type Smoking = 'never' | 'former' | 'current';
export type Alcohol = 'none' | 'occasionally' | 'weekly' | 'daily';
export type ExerciseFrequency = 'sedentary' | 'light' | 'moderate' | 'active';
export type MentalHealth = 'normal' | 'stressed' | 'anxious' | 'depressed';
export type DietQuality = 'poor' | 'fair' | 'good' | 'excellent';

export interface SaveAssessmentPayload {
  age: number;
  gender: Gender;
  height: number;
  weight: number;
  waist?: number;
  hip?: number;
  bmi?: number;
  whr?: number;
  smoking?: Smoking;
  alcohol?: Alcohol;
  exercise_frequency?: ExerciseFrequency;
  hypertension?: YesNo;
  diabetes?: YesNo;
  heart_disease?: YesNo;
  cholesterol?: YesNo;
  mental_health?: MentalHealth;
  family_heart_disease?: YesNo;
  family_diabetes?: YesNo;
  family_cancer?: YesNo;
  stress_level?: number;
  sleep_hours?: number;
  diet_quality?: DietQuality;
  responses?: Record<string, unknown>;

  // Optional advanced clinical fields
  ethnicity?: string;
  neck_cm?: number;
  sbp?: number;
  af?: YesNo;
  family_heart_disease_premature?: YesNo;
  snores_loudly?: YesNo;
  daytime_sleepiness?: YesNo;
  observed_apneas?: YesNo;
  hba1c?: number;
  total_chol_mmol?: number;
  hdl_mmol?: number;
  creatinine_mgdl?: number;
  urine_acr?: number;
}

export async function saveAssessment(payload: SaveAssessmentPayload) {
  const { data } = await api.post('/api/health-assessment/save', payload);
  return data;
}

export async function fetchLatestAssessment() {
  const { data } = await api.get('/api/health-assessment/my');
  return data;
}

export async function fetchDailyHealthScore() {
  const { data } = await api.get('/api/health-score/today');
  return data;
}

export async function fetchAiRiskScore() {
  const { data } = await api.get('/api/v3/ai-intelligence/risk-score/me');
  return data;
}

export async function runHealthFlow(payload: SaveAssessmentPayload) {
  // 1) Save current assessment
  const saved = await saveAssessment(payload);

  // 2) Fetch latest persisted assessment (mobile-safe endpoint)
  const latest = await fetchLatestAssessment();

  // 3) Fetch daily score + AI risk score for dashboard cards
  const [dailyScore, aiRisk] = await Promise.all([
    fetchDailyHealthScore(),
    fetchAiRiskScore(),
  ]);

  return { saved, latest, dailyScore, aiRisk };
}
```

Minimal usage from a screen/service:

```ts
import { runHealthFlow, setAuthToken } from '../services/healthFlowApi';

setAuthToken(accessToken);

const result = await runHealthFlow({
  age: 35,
  gender: 'male',
  height: 175,
  weight: 82,
  smoking: 'never',
  exercise_frequency: 'moderate',
  diabetes: 'no',
  hypertension: 'no',
});

// result.saved         -> POST /save response (assessment + riskAssessment)
// result.latest        -> GET /my response
// result.dailyScore    -> GET /health-score/today response
// result.aiRisk        -> GET /v3/ai-intelligence/risk-score/me response
```

---

### 20.4B React Native + React Query Hooks

If your app uses React Query, you can wrap the same endpoints with query/mutation hooks.

```ts
// src/hooks/useHealthFlow.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAiRiskScore,
  fetchDailyHealthScore,
  fetchLatestAssessment,
  saveAssessment,
  type SaveAssessmentPayload,
} from '../services/healthFlowApi';

const QK = {
  latestAssessment: ['health', 'assessment', 'latest'] as const,
  dailyScore: ['health', 'score', 'today'] as const,
  aiRisk: ['health', 'risk', 'ai'] as const,
};

export function useLatestAssessment(enabled = true) {
  return useQuery({
    queryKey: QK.latestAssessment,
    queryFn: fetchLatestAssessment,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useDailyHealthScore(enabled = true) {
  return useQuery({
    queryKey: QK.dailyScore,
    queryFn: fetchDailyHealthScore,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useAiRiskScore(enabled = true) {
  return useQuery({
    queryKey: QK.aiRisk,
    queryFn: fetchAiRiskScore,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useSaveAssessmentAndRefresh() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveAssessmentPayload) => saveAssessment(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: QK.latestAssessment }),
        qc.invalidateQueries({ queryKey: QK.dailyScore }),
        qc.invalidateQueries({ queryKey: QK.aiRisk }),
      ]);
    },
  });
}
```

```ts
// src/screens/HealthAssessmentScreen.tsx (minimal usage)
import React from 'react';
import { Button, View } from 'react-native';
import {
  useAiRiskScore,
  useDailyHealthScore,
  useLatestAssessment,
  useSaveAssessmentAndRefresh,
} from '../hooks/useHealthFlow';

export default function HealthAssessmentScreen() {
  const latest = useLatestAssessment(true);
  const daily = useDailyHealthScore(true);
  const risk = useAiRiskScore(true);
  const saveMutation = useSaveAssessmentAndRefresh();

  const onSubmit = () => {
    saveMutation.mutate({
      age: 35,
      gender: 'male',
      height: 175,
      weight: 82,
      smoking: 'never',
      exercise_frequency: 'moderate',
      diabetes: 'no',
      hypertension: 'no',
    });
  };

  return (
    <View>
      <Button title="Save Assessment" onPress={onSubmit} />
    </View>
  );
}
```

Recommended defaults for mobile:
- `staleTime`: 60s for score cards.
- Retry: keep React Query default retries for transient network issues.
- On assessment submit success: invalidate latest assessment, daily score, and AI risk queries.

---

### 20.4C React Native Persistent Login + SSO (No Re-Login)

Use refresh-token rotation + secure storage to keep users logged in across app restarts.

Backend endpoints already available:
- `POST /api/auth/login` -> returns `token` + `refreshToken`
- `POST /api/auth/refresh` -> rotates and returns new `accessToken` + `refreshToken`
- `POST /api/auth/logout` -> revoke current refresh token
- `GET /api/users/profile` -> session check for startup restore

SSO endpoints already available:
- `GET /api/auth/google`
- `GET /api/auth/facebook`
- Mobile callback scheme supported: `mysmarthealth://oauth-callback`

#### Recommended mobile auth policy

1. Store `accessToken` + `refreshToken` in secure storage (Keychain/Keystore), never AsyncStorage.
2. On app launch, try `/api/users/profile` with current access token.
3. If access token is expired (401), call `/api/auth/refresh` with refresh token.
4. Save rotated tokens after every successful refresh.
5. Retry the original API request once after refresh.
6. If refresh fails, clear tokens and route to login.

```ts
// src/services/authSession.ts
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ]);
}

export async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
```

```ts
// src/services/apiClient.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { clearTokens, getTokens, saveTokens } from './authSession';

const api = axios.create({
  baseURL: 'https://app.mediqzy.com',
  timeout: 20000,
});

let isRefreshing = false;
let queue: Array<(token: string | null) => void> = [];

const flushQueue = (token: string | null) => {
  queue.forEach((cb) => cb(token));
  queue = [];
};

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { accessToken } = await getTokens();
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    if (status !== 401 || original?._retry) {
      throw error;
    }

    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push((token) => {
          if (!token) return reject(error);
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const { refreshToken } = await getTokens();
      if (!refreshToken) throw error;

      const refreshRes = await axios.post('https://app.mediqzy.com/api/auth/refresh', {
        refreshToken,
      });

      const newAccess = refreshRes.data?.accessToken;
      const newRefresh = refreshRes.data?.refreshToken;
      if (!newAccess || !newRefresh) throw error;

      await saveTokens(newAccess, newRefresh);
      flushQueue(newAccess);

      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshError) {
      flushQueue(null);
      await clearTokens();
      throw refreshError;
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
```

```ts
// src/bootstrap/restoreSession.ts
import api from '../services/apiClient';
import { clearTokens } from '../services/authSession';

export async function restoreSession(): Promise<boolean> {
  try {
    await api.get('/api/users/profile');
    return true;
  } catch {
    await clearTokens();
    return false;
  }
}
```

#### SSO deep-link flow for RN

Use your browser auth start URL with `mobile_redirect_uri`:

```text
https://app.mediqzy.com/api/auth/google?mobile_redirect_uri=mysmarthealth://oauth-callback&state=abc123
```

After login, backend redirects to your deep link with query params:
- `token`
- `refreshToken`
- `provider`
- `state` (echo)

Handle the callback and persist tokens immediately:

```ts
// src/auth/handleSsoCallback.ts
import * as Linking from 'expo-linking';
import { saveTokens } from '../services/authSession';

export async function handleSsoUrl(url: string) {
  const parsed = Linking.parse(url);
  const token = typeof parsed.queryParams?.token === 'string' ? parsed.queryParams.token : null;
  const refreshToken = typeof parsed.queryParams?.refreshToken === 'string' ? parsed.queryParams.refreshToken : null;

  if (token && refreshToken) {
    await saveTokens(token, refreshToken);
    return { success: true };
  }

  return { success: false, error: parsed.queryParams?.error || 'SSO token missing' };
}
```

---

### 20.4D Production Auth Module Template (RN)

Use this pattern when you want app-wide auth state, protected navigation, and zero-friction auto-login behavior.

```ts
// src/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/apiClient';
import { clearTokens, getTokens, saveTokens } from '../services/authSession';

type AuthState = {
  bootstrapping: boolean;
  isAuthenticated: boolean;
  profile: any | null;
};

type AuthContextValue = AuthState & {
  signInWithPassword: (input: { email?: string; phoneNumber?: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  onSsoTokens: (accessToken: string, refreshToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile() {
  const res = await api.get('/api/users/profile');
  return res.data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);

  const bootstrap = async () => {
    try {
      const { accessToken, refreshToken } = await getTokens();
      if (!accessToken || !refreshToken) {
        setIsAuthenticated(false);
        setProfile(null);
        return;
      }

      const me = await fetchProfile();
      setProfile(me?.user || me?.data || null);
      setIsAuthenticated(true);
    } catch {
      await clearTokens();
      setIsAuthenticated(false);
      setProfile(null);
    } finally {
      setBootstrapping(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  const signInWithPassword = async (input: { email?: string; phoneNumber?: string; password: string }) => {
    const res = await api.post('/api/auth/login', input);
    const token = res.data?.token;
    const refreshToken = res.data?.refreshToken;

    if (!token || !refreshToken) {
      throw new Error('Login response missing token/refreshToken');
    }

    await saveTokens(token, refreshToken);
    const me = await fetchProfile();
    setProfile(me?.user || me?.data || null);
    setIsAuthenticated(true);
  };

  const signOut = async () => {
    try {
      const { refreshToken } = await getTokens();
      if (refreshToken) {
        await api.post('/api/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore network/logout errors; local token clear still proceeds.
    } finally {
      await clearTokens();
      setProfile(null);
      setIsAuthenticated(false);
    }
  };

  const refreshProfile = async () => {
    const me = await fetchProfile();
    setProfile(me?.user || me?.data || null);
  };

  const onSsoTokens = async (accessToken: string, refreshToken: string) => {
    await saveTokens(accessToken, refreshToken);
    const me = await fetchProfile();
    setProfile(me?.user || me?.data || null);
    setIsAuthenticated(true);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      bootstrapping,
      isAuthenticated,
      profile,
      signInWithPassword,
      signOut,
      refreshProfile,
      onSsoTokens,
    }),
    [bootstrapping, isAuthenticated, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

```ts
// src/auth/AuthGate.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from './AuthContext';
import { AppStack } from '../navigation/AppStack';
import { AuthStack } from '../navigation/AuthStack';

export function AuthGate() {
  const { bootstrapping, isAuthenticated } = useAuth();

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
```

```ts
// src/auth/useRefreshScheduler.ts
import { useEffect } from 'react';
import axios from 'axios';
import { getTokens, saveTokens, clearTokens } from '../services/authSession';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Refresh every 10 minutes

export function useRefreshScheduler(onAuthLost: () => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const { refreshToken } = await getTokens();
        if (!refreshToken) return;

        const res = await axios.post('https://app.mediqzy.com/api/auth/refresh', {
          refreshToken,
        });

        const nextAccess = res.data?.accessToken;
        const nextRefresh = res.data?.refreshToken;
        if (!nextAccess || !nextRefresh) throw new Error('Invalid refresh response');
        await saveTokens(nextAccess, nextRefresh);
      } catch {
        await clearTokens();
        onAuthLost();
      } finally {
        running = false;
      }
    };

    timer = setInterval(() => {
      void tick();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [onAuthLost]);
}
```

```ts
// src/App.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { AuthGate } from './auth/AuthGate';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

Production notes:
- Keep logout explicit: call `/api/auth/logout` with current refresh token, then clear secure storage.
- Keep one source of truth for auth state inside `AuthProvider`; avoid duplicated token state in screens.
- On SSO callback success, call `onSsoTokens(accessToken, refreshToken)` and navigate into the authenticated stack.

---

### 20.4E Expo vs Bare RN Setup Checklist

Use the same backend API flow for both, but platform wiring differs for storage and deep links.

#### Expo-managed app

Packages:
- `expo-secure-store` for token storage
- `expo-linking` for deep-link parsing
- `expo-web-browser` (optional) for OAuth browser flow

`app.json`:

```json
{
  "expo": {
    "scheme": "mysmarthealth",
    "ios": {
      "bundleIdentifier": "com.smarthealth.patient"
    },
    "android": {
      "package": "com.smarthealth.patient"
    }
  }
}
```

Build SSO start URL in app:

```ts
import * as Linking from 'expo-linking';

const redirectUri = Linking.createURL('oauth-callback');
// e.g. mysmarthealth://oauth-callback
const googleSsoUrl = `https://app.mediqzy.com/api/auth/google?mobile_redirect_uri=${encodeURIComponent(redirectUri)}`;
```

#### Bare React Native app

Packages:
- `react-native-keychain` for token storage (preferred)
- `react-native-url-polyfill` if URL parsing support is needed consistently

Android intent filter (`android/app/src/main/AndroidManifest.xml`):

```xml
<activity
  android:name=".MainActivity"
  android:launchMode="singleTask">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="mysmarthealth" android:host="oauth-callback" />
  </intent-filter>
</activity>
```

iOS URL type (`ios/<app>/Info.plist`):

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>mysmarthealth</string>
    </array>
  </dict>
</array>
```

Keychain token helper (bare RN):

```ts
import * as Keychain from 'react-native-keychain';

const SERVICE = 'smarthealth-auth';

export async function saveTokens(accessToken: string, refreshToken: string) {
  await Keychain.setGenericPassword('token', JSON.stringify({ accessToken, refreshToken }), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getTokens() {
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  if (!creds) return { accessToken: null, refreshToken: null };
  const parsed = JSON.parse(creds.password);
  return { accessToken: parsed.accessToken ?? null, refreshToken: parsed.refreshToken ?? null };
}
```

Common hardening for both Expo and bare RN:
- Never log tokens in production builds.
- Clear tokens on refresh failure or HTTP 401 from `/api/auth/refresh`.
- Keep `mysmarthealth://oauth-callback` consistent across backend and app config.
- Prefer one global HTTP client with 401-refresh-retry behavior.

---

### 20.4F Mobile Go-Live Validation Checklist (QA)

Run this full checklist on Android + iOS before release.

1. Password Login Persists Across Restart
- Login with email/phone + password.
- Kill app process and relaunch.
- Expected: user lands in authenticated stack without login prompt.

2. Silent Refresh on Expired Access Token
- Force access token expiry (or wait until expired) while keeping refresh token valid.
- Call a protected endpoint like `/api/users/profile`.
- Expected: app refreshes token via `/api/auth/refresh`, retries request, and continues session.

3. Refresh Token Rotation
- Capture refresh token A after login.
- Trigger refresh and capture refresh token B.
- Expected: A != B and subsequent refresh with A fails.

4. Refresh Failure Handling
- Corrupt stored refresh token and call protected API.
- Expected: refresh fails, tokens are cleared, user is redirected to login stack.

5. Explicit Logout
- Login, then call logout action.
- Expected: `/api/auth/logout` called, secure tokens removed, app returns to unauthenticated stack.

6. Google SSO Deep Link Success
- Start SSO using mobile redirect URI.
- Complete Google auth flow.
- Expected: deep link callback contains token + refreshToken, app stores both, profile fetch succeeds.

7. Facebook SSO Deep Link Success
- Repeat SSO flow with Facebook provider.
- Expected: same success path as Google SSO.

8. SSO Error Path
- Cancel provider consent/login.
- Expected: callback includes error, app shows recoverable message and stays in auth stack.

9. First-Time Health Flow
- Submit `POST /api/health-assessment/save` with valid required fields.
- Then fetch:
  - `GET /api/health-assessment/my`
  - `GET /api/health-score/today`
  - `GET /api/v3/ai-intelligence/risk-score/me`
- Expected: submit succeeds and all cards load without auth interruption.

10. App Upgrade Migration Safety
- Install old build, login, then upgrade to latest build.
- Expected: secure token read/parse succeeds, no forced logout due to storage schema mismatch.

Release gate recommendation:
- Mark mobile auth as release-ready only if all 10 cases pass on at least:
  - Android (latest + one previous major)
  - iOS (latest + one previous major)

QA execution tracker template:

| Test ID | Scenario | Platform | OS Version | Build | Result (Pass/Fail) | Evidence Link | Owner | Date |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Password Login Persists Across Restart | Android |  |  |  |  |  |  |
| AUTH-02 | Silent Refresh on Expired Access Token | Android |  |  |  |  |  |  |
| AUTH-03 | Refresh Token Rotation | Android |  |  |  |  |  |  |
| AUTH-04 | Refresh Failure Handling | Android |  |  |  |  |  |  |
| AUTH-05 | Explicit Logout | Android |  |  |  |  |  |  |
| AUTH-06 | Google SSO Deep Link Success | Android |  |  |  |  |  |  |
| AUTH-07 | Facebook SSO Deep Link Success | Android |  |  |  |  |  |  |
| AUTH-08 | SSO Error Path | Android |  |  |  |  |  |  |
| AUTH-09 | First-Time Health Flow | Android |  |  |  |  |  |  |
| AUTH-10 | App Upgrade Migration Safety | Android |  |  |  |  |  |  |
| AUTH-01 | Password Login Persists Across Restart | iOS |  |  |  |  |  |  |
| AUTH-02 | Silent Refresh on Expired Access Token | iOS |  |  |  |  |  |  |
| AUTH-03 | Refresh Token Rotation | iOS |  |  |  |  |  |  |
| AUTH-04 | Refresh Failure Handling | iOS |  |  |  |  |  |  |
| AUTH-05 | Explicit Logout | iOS |  |  |  |  |  |  |
| AUTH-06 | Google SSO Deep Link Success | iOS |  |  |  |  |  |  |
| AUTH-07 | Facebook SSO Deep Link Success | iOS |  |  |  |  |  |  |
| AUTH-08 | SSO Error Path | iOS |  |  |  |  |  |  |
| AUTH-09 | First-Time Health Flow | iOS |  |  |  |  |  |  |
| AUTH-10 | App Upgrade Migration Safety | iOS |  |  |  |  |  |  |

---

### 20.5 Admin — Health Risk Assessment (Bayesian Scoring Model)

> These endpoints use the **admin HRA schema** — a structured multi-section questionnaire (Demographics, Lifestyle, Physical Indicators, Medical History, Family History, Mental Health, Preventive Screening, Environmental). Max theoretical score: **300**. Results include Bayesian inference for probabilistic disease risk.

> **Base:** `/api/admin/health-risk/...` · Requires admin role + auth.

#### Get member's HRA history
```
GET /api/admin/health-risk/members/:memberId  🔐 (admin)
Query: ?limit=12
```
**Response:**
```json
{
  "success": true,
  "memberId": "19",
  "total": 3,
  "history": [
    {
      "id": 7,
      "date": "2026-04-21T10:00:00.000Z",
      "score": 82,
      "band": "Moderate Risk",
      "completionPct": 95,
      "createdBy": "Admin User",
      "notes": null,
      "bayesianInference": { "cardiovascular": { "probability": 0.24 } }
    }
  ],
  "latestAssessment": { "..." : "..." },
  "meta": {
    "maxScore": 300,
    "totalQuestions": 40,
    "bands": [
      { "label": "Low Risk",      "min": 0,   "max": 50  },
      { "label": "Moderate Risk", "min": 51,  "max": 100 },
      { "label": "High Risk",     "min": 101, "max": 150 },
      { "label": "Severe Risk",   "min": 151, "max": 999 }
    ]
  }
}
```

#### Create HRA assessment for a member
```
POST /api/admin/health-risk/members/:memberId  🔐 (admin)
```
**Body:**
```json
{
  "memberName": "John Doe",
  "memberSegment": "corporate",
  "responses": {
    "age": "40_49",
    "gender": "male",
    "smoking": "never",
    "alcohol": "occasional",
    "food": "balanced",
    "activity": "150_mod",
    "sleep": "7_8",
    "stress": "moderate",
    "bmi": "overweight",
    "whr": "elevated",
    "bp": "pre",
    "hx_diabetes": "none",
    "hx_hypertension": "controlled",
    "fh_diabetes": "yes",
    "fh_heart": "no"
  },
  "notes": "Annual review",
  "flags": []
}
```
> Each `responses` key maps to a question ID from the HRA schema. Values are the selected option `id` (not the label).

**Response (201):**
```json
{
  "success": true,
  "assessment": {
    "id": 8,
    "memberId": "19",
    "totalScore": 68,
    "riskBandLabel": "Moderate Risk",
    "riskBandColor": "text-amber-500",
    "completionPct": 87,
    "sectionBreakdown": [
      { "sectionId": "demographics", "score": 4, "maxScore": 14 },
      { "sectionId": "lifestyle",    "score": 9, "maxScore": 50 }
    ],
    "bayesianInference": {
      "cardiovascular": { "probability": 0.22 },
      "diabetes":       { "probability": 0.31 },
      "evidence": [ "bmi_overweight", "whr_elevated" ],
      "generatedAt": "2026-04-21T10:00:00.000Z"
    }
  },
  "meta": { "maxScore": 300, "totalQuestions": 40 }
}
```

#### Run Bayesian inference standalone
```
POST /api/admin/health-risk/inference  🔐 (admin)
```
**Body:**
```json
{
  "responses": { "bmi": "obese", "hx_diabetes": "uncontrolled", "smoking": "heavy_gte10" },
  "context": { "memberId": "19", "note": "ad-hoc inference" }
}
```
**Response:**
```json
{
  "success": true,
  "inference": {
    "cardiovascular": { "probability": 0.61 },
    "diabetes": { "probability": 0.78 },
    "evidence": [ "bmi_obese", "diabetes_uncontrolled", "smoking_heavy" ],
    "generatedAt": "2026-04-21T10:05:00.000Z"
  },
  "context": { "nodesReceived": 3, "generatedAt": "2026-04-21T10:05:00.000Z" }
}
```

---

### 20.6 HRA Question Schema Reference

The admin HRA uses structured sections. Each question accepts the option `id` as the response value.

| Section | Questions |
|---|---|
| `demographics` | `age` (18_29 · 30_39 · 40_49 · 50_59 · 60_69 · 70_79 · 80_plus), `gender` (male · female · other) |
| `lifestyle` | `smoking`, `alcohol`, `food`, `activity`, `sleep`, `snoring`, `stress`, `hydration` |
| `physical` | `bmi`, `whr`, `neck`, `body_fat`, `bp`, `resting_hr`, `spo2` |
| `medical` | `hx_hypertension`, `hx_diabetes`, `hx_cholesterol`, `hx_heart`, `hx_respiratory`, `hx_kidney`, `hx_liver`, `hx_cancer` |
| `family` | `fh_diabetes`, `fh_hypertension`, `fh_heart`, `fh_cancer`, `fh_kidney`, `fh_respiratory` |

> All option IDs and scores are defined in `server/config/health-risk.schema.js`.

---

## 21. Health Intelligence Dashboard

Powered by `healthReminderService` — reads the user's medical history, vitals, appointments, and lab tests to generate personalized, prioritized reminders. Reminders have a `priority` score (0–10); values ≥ 8 are considered high-priority.

### 21.1 Full Dashboard
```
GET /api/health-intelligence  🔐
```
**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": 19,
    "generated_at": "2026-04-25T10:00:00.000Z",
    "summary": {
      "total_reminders": 7,
      "high_priority": 2,
      "actionable": 5
    },
    "categories": {
      "medication": [{ "id": "rem_001", "message": "Take Metformin 500mg", "priority": 9, "actionable": true }],
      "checkups":   [{ "id": "rem_002", "message": "Annual blood sugar test due", "priority": 8, "actionable": true }],
      "lifestyle":  [],
      "diet":       [{ "id": "rem_003", "message": "Reduce sodium intake", "priority": 6, "actionable": true }],
      "activity":   [],
      "vitals":     [{ "id": "rem_004", "message": "Log today's blood pressure", "priority": 7, "actionable": true }],
      "lab_tests":  []
    },
    "all_reminders": [ ... ]
  }
}
```

### 21.2 Reminders by Type
```
GET /api/health-intelligence/reminders/:type  🔐
```
> Valid `type` values: `medication` | `checkup` | `lifestyle` | `diet` | `activity` | `vitals` | `lab_test`
```json
{ "type": "medication", "count": 2, "reminders": [...] }
```

### 21.3 Take Action on Reminder
```
POST /api/health-intelligence/action  🔐
Body: {
  "reminder_id": "rem_001",
  "action_type": "completed",       // "completed" | "dismissed" | "snoozed"
  "action_data": { "note": "Taken with breakfast" }
}
→ { "success": true, "message": "Action completed for reminder rem_001", "timestamp": "..." }
```

---

## 22. Fitness & Wearables

### 22.1 Fitness Data
```
POST /api/fitness/store       🔐  Store fitness data
     Body: { "steps": 10000, "calories": 450, "distance": 7.5, "activeMinutes": 45, "date": "2026-03-15" }
GET  /api/fitness/data         🔐  Get fitness data
GET  /api/fitness/latest       🔐  Latest readings
GET  /api/fitness/summary      🔐  Fitness summary
```

### 22.2 Health Data (BLE Devices)
```
POST /api/health-data/ble-sync               🔐  Sync BLE device data
GET  /api/health-data/recent                 🔐  Recent health data
GET  /api/health-data/summary                🔐  Health data summary
GET  /api/health-data/trends/:dataType       🔐  Trends (bp, heartRate, spo2, temperature)
GET  /api/health-data/history/:dataType      🔐  History by type
GET  /api/health-data/devices                🔐  List connected devices
POST /api/health-data/devices/register       🔐  Register device
DELETE /api/health-data/devices/:deviceId    🔐  Remove device
POST /api/health-data/veepoo-sync            🔐  Veepoo watch sync
POST /api/health-data/apple-health-sync      🔐  Apple Health sync
POST /api/health-data/google-fit-sync        🔐  Google Fit sync
```

### 22.3 Apple Health
```
POST   /api/apple-health/sync         🔐  Sync Apple Health data
POST   /api/apple-health/sync-batch   🔐  Batch sync
GET    /api/apple-health/status        🔐  Connection status
GET    /api/apple-health/summary       🔐  Health summary
DELETE /api/apple-health/disconnect    🔐  Disconnect
```

### 22.4 Wearable Devices
```
POST /api/wearables                    🔐  Register wearable
POST /api/wearables/provision          🔐  Provision wearable
GET  /api/wearables                    🔐  List wearables
GET  /api/wearables/:id                🔐  Get wearable detail
GET  /api/wearables/:id/readings       🔐  Get readings
GET  /api/wearables/user/:user_id/health-summary 🔐  Health summary from wearable
PUT  /api/wearables/:id/settings       🔐  Update settings
```

### 22.5 Health Metrics
```
GET /api/health/latest        🔐  Latest health metrics
GET /api/health/summary       🔐  Health summary
```

### 22.6 Diet Plan

Two routes — identical logic, alias for backward compatibility:
```
POST /api/diet/generate          🔐
POST /api/ai-health/diet/generate 🔐
```
**Body:**
```json
{
  "age": 30,
  "weight": 72,
  "height": 170,
  "gender": "female",
  "goal": "weight_loss",
  "activityLevel": "moderate",
  "dietaryPreference": "vegetarian",
  "cuisineRegion": "north_indian",
  "dietaryRestrictions": "lactose intolerant"
}
```
> `goal`: `weight_loss` | `weight_gain` | `muscle_gain` | `maintenance`  
> `activityLevel`: `sedentary` | `light` | `moderate` | `active` | `very_active`  
> `dietaryPreference`: `vegetarian` | `vegan` | `non_vegetarian` | `eggetarian`  
> `cuisineRegion`: `north_indian` | `south_indian` | `continental` (and others)

**Response:**
```json
{
  "success": true,
  "plan": {
    "personalInfo": {
      "bmi": 24.9,
      "bmiCategory": "Normal weight",
      "activityLevel": "moderate",
      "goal": "weight_loss"
    },
    "calories": {
      "bmr": 1508,
      "tdee": 2337,
      "target": 1837,
      "description": "500 calorie deficit for gradual weight loss (~0.5kg/week)"
    },
    "macronutrients": {
      "protein": { "grams": 115, "calories": 460, "percentage": 25 },
      "carbs":   { "grams": 206, "calories": 824, "percentage": 45 },
      "fats":    { "grams": 61,  "calories": 553, "percentage": 30 }
    },
    "mealPlan": {
      "breakfast":        [{ "item": "Oatmeal with berries", "calories": 300, "protein": "10g", "carbs": "45g", "fats": "8g" }],
      "midMorningSnack":  [{ "item": "Apple with almond butter", "calories": 150 }],
      "lunch":            [{ "item": "Dal + brown rice + sabzi", "calories": 450 }],
      "afternoonSnack":   [{ "item": "Greek yogurt", "calories": 120 }],
      "dinner":           [{ "item": "Paneer tikka + roti + salad", "calories": 500 }],
      "eveningSnack":     [{ "item": "Herbal tea", "calories": 0 }]
    },
    "hydration": {
      "daily": "2.5 liters",
      "recommendation": "Drink water regularly, especially before meals"
    },
    "tips": ["Eat smaller meals every 3-4 hours", "Avoid processed sugar"],
    "dietaryPreference": "vegetarian",
    "cuisineRegion": "north_indian"
  }
}
```

---

## 23. Leaderboard & Challenges

### 23.1 Health Goals
```
GET  /api/leaderboard/goals                    🔐  List health goals
POST /api/leaderboard/goals                    🔐  Create goal
     Body: { "type": "steps", "target": 10000, "duration": "daily" }
POST /api/leaderboard/goals/:goalId/join       🔐  Join a goal
POST /api/leaderboard/goals/:goalId/progress   🔐  Log progress
GET  /api/leaderboard/my-goals                 🔐  My joined goals
```

### 23.2 Challenges
```
GET  /api/leaderboard/challenges                              🔐  List challenges
GET  /api/leaderboard/challenges/:id                          🔐  Challenge detail
POST /api/leaderboard/challenges/:id/join                     🔐  Join challenge
POST /api/leaderboard/challenges/:id/progress                 🔐  Log progress
GET  /api/leaderboard/challenges/:id/leaderboard              🔐  Challenge leaderboard
```

### 23.3 Leaderboard Rankings
```
GET /api/leaderboard/leaderboard/global           🔐  Global leaderboard
GET /api/leaderboard/leaderboard/peers             🔐  Peer leaderboard
GET /api/leaderboard/leaderboard/my-rank           🔐  My rank
GET /api/leaderboard/stats/summary                 🔐  Stats summary
GET /api/leaderboard/achievements                  🔐  List achievements
GET /api/leaderboard/achievements/my               🔐  My achievements
```

---

## 24. Notifications & FCM

### 24.1 Notifications
```
GET    /api/notifications                 🔐  List notifications
GET    /api/notifications/unread-count    🔐  Unread count
POST   /api/notifications/:id/read       🔐  Mark as read
POST   /api/notifications/read-all       🔐  Mark all as read
DELETE /api/notifications/:id            🔐  Delete notification
GET    /api/notifications/preferences    🔐  Get preferences
```

### 24.2 FCM Push Notifications (Mobile Essential)
```
POST /api/fcm/register-token 🔐
Body: {
  "token": "<firebase-fcm-token>",
  "deviceType": "android",       // "android" | "ios" | "web"
  "deviceId": "device-unique-id"
}

POST /api/fcm/remove-token 🔐
Body: { "token": "<firebase-fcm-token>" }
```
> **Critical for mobile:** Register FCM token on app launch and after token refresh. Remove on logout.

### 24.3 Push Notification Types Received
| Event | FCM Data Fields |
|---|---|
| Video Call Incoming | `type: "video_call"`, `appointmentId`, `callerName`, `roomName` |
| Appointment Reminder | `type: "appointment_reminder"`, `appointmentId`, `doctorName`, `time` |
| Chat Message | `type: "chat_message"`, `senderId`, `message`, `roomId` |
| Prescription Ready | `type: "prescription"`, `prescriptionId`, `doctorName` |
| System Notification | `type: "system"`, `title`, `body` |

---

## 25. Text-to-Speech

```
POST /api/tts/speak          🔐  Text-to-speech
     Body: { "text": "Your next appointment is tomorrow", "language": "en", "voice": "default" }
     → Returns: audio/mpeg stream

GET  /api/tts/voices          (Public)  Available voices
GET  /api/tts/status          (Public)  TTS service status
```
> `GET /api/tts/voices` always returns `200`. When ElevenLabs is not configured, it returns a static list of 5 voices with `"configured": false` instead of a 503 error.

> Alternative TTS via AI route:
```
POST /api/ai/text-to-speech  🔐
Body: { "text": "...", "voice": "alloy" }
```

---

## 26. Insurance

### 26.1 User's Own Insurance Policies
```
GET    /api/users/my-insurances              🔐  List my insurance policies
POST   /api/users/my-insurances              🔐  Add insurance policy
DELETE /api/users/my-insurances/:policyId    🔐  Remove insurance policy
```
**Add Policy Body:**
```json
{
  "insurerName": "HDFC Ergo",
  "policyNumber": "HDFC-2024-88812",
  "coverageAmount": 1000000,
  "premium": 18000,
  "validFrom": "2024-04-01",
  "validTo": "2025-03-31",
  "policyType": "health"
}
```

### 26.2 Family Member Insurance Policies
```
GET    /api/family-members/:id/insurances              🔐  List FM insurance policies
POST   /api/family-members/:id/insurances              🔐  Add FM insurance policy
DELETE /api/family-members/:id/insurances/:policyId    🔐  Remove FM insurance policy
```
> See §3.2 for full details and request body.

### 26.3 Insurance Providers & Claims
```
GET  /api/insurance/providers                (Public)  List insurance providers
GET  /api/insurance/policies/:providerId     (Public)  Provider policies
POST /api/insurance/claims                   🔐  Submit insurance claim
     Body: { "policyId": 1, "claimType": "hospitalization", "amount": 50000, "description": "...", "documents": [...] }
```

---

## 27. Corporate Benefits

```
GET  /api/corporate/plans                  (Public)  Corporate plans
GET  /api/corporate/my-benefits            🔐  My corporate benefits
GET  /api/corporate/health-checkups        🔐  Available health checkups
GET  /api/corporate/my-appointments        🔐  My corporate appointments
POST /api/corporate/book-checkup           🔐  Book health checkup
     Body: { "checkupId": 1, "date": "2026-03-15", "labId": 5 }
POST /api/corporate/enroll                 🔐  Enroll in corporate plan
GET  /api/corporate/claims                 🔐  My corporate claims
GET  /api/employee/my-corporate            🔐  My corporate info
GET  /api/employee/my-labs                 🔐  Corporate partner labs
GET  /api/employee/my-hospitals            🔐  Corporate partner hospitals
GET  /api/employee/my-clinics              🔐  Corporate partner clinics
```

---

## 28. Support & Tickets

### 28.1 Support Chat
```
POST /api/support/chat/start        🔐  Start support chat
     Body: { "department": "billing", "message": "I have a billing question" }
POST /api/support/chat/message      🔐  Send message
GET  /api/support/chat/history      🔐  Chat history
GET  /api/support/chat/active       🔐  Active sessions
POST /api/support/chat/close        🔐  Close session
GET  /api/support/chat/transcript   🔐  Download transcript
GET  /api/support/config            (Public)  Support config
GET  /api/support/departments       (Public)  Departments
GET  /api/support/queue             (Public)  Queue status
```

### 28.2 Support Tickets
```
POST /api/tickets                  🔐  Create ticket
     Body: { "subject": "Payment issue", "description": "...", "priority": "high", "department": "billing" }
GET  /api/tickets                  🔐  List my tickets
GET  /api/tickets/:id              🔐  Ticket detail
PUT  /api/tickets/:id              🔐  Update ticket
POST /api/tickets/:id/messages     🔐  Add message to ticket
POST /api/tickets/:id/satisfaction 🔐  Submit satisfaction rating
```

---

## 29. Privacy & GDPR

```
GET    /api/privacy/consents                🔐  Get my consents
POST   /api/privacy/consents                🔐  Grant consent
       Body: { "consentType": "analytics", "granted": true }
DELETE /api/privacy/consents/:consentType   🔐  Revoke consent
GET    /api/privacy/export                  🔐  Export my data (GDPR)
DELETE /api/privacy/delete-account          🔐  Delete my account
GET    /api/privacy/audit-logs              🔐  View audit logs
POST   /api/privacy/report-breach           🔐  Report data breach
```

---

## 30. Directory (Hospitals/Labs/Clinics)

### 30.1 Hospitals
```
GET /api/hospitals                          (Public)  Search hospitals
GET /api/hospitals/:id                      (Public)  Hospital detail
GET /api/hospitals/place/:placeId           (Public)  By Google Place ID
GET /api/hospitals/spn/list                 (Public)  SPN network
```

### 30.2 Labs
```
GET /api/labs                               (Public)  Search labs
GET /api/labs/:id                           (Public)  Lab detail
GET /api/labs/search/advanced               (Public)  Advanced search
GET /api/labs/categories/tests              (Public)  Test categories
GET /api/labs/:labId/tests                  (Public)  Lab test menu
```

### 30.3 Clinics
```
GET /api/clinics                            (Public)  Search clinics
GET /api/clinics/:id                        (Public)  Clinic detail
```

### 30.4 Masterdata Directory
```
GET /api/masterdata/specialties             (Public)  Medical specialties
GET /api/masterdata/hospitals               (Public)  All hospitals
GET /api/masterdata/labs                    (Public)  All labs
GET /api/masterdata/clinics                 (Public)  All clinics
GET /api/masterdata/pharmacies              (Public)  All pharmacies
GET /api/masterdata/doctors                 (Public)  All doctors
GET /api/masterdata/cities                  (Public)  City list
GET /api/masterdata/states                  (Public)  State list
GET /api/masterdata/areas                   (Public)  Area list
```

### 30.5 Nearby Places
```
GET /api/places/nearby?lat=19.076&lng=72.877&type=hospital (Public)
```

---

## 31. Ayushman Bharat

```
GET  /api/ayushman/details              (Public)  ABHA details
GET  /api/ayushman/hospitals             (Public)  ABHA hospitals
GET  /api/ayushman/eligibility           (Public)  Check eligibility
GET  /api/ayushman/e-card                🔐  Get e-card
POST /api/ayushman/check-status          🔐  Check status
POST /api/ayushman/download              🔐  Download ABHA card
```

---

## 32. AI DeepTech Layer

> **Base path:** `/api/v3/ai-deeptech`  
> All endpoints require `Authorization: Bearer <token>` (user or admin).

### 32.1 Health Intelligence Score (HIS)
```
GET  /api/v3/ai-deeptech/his/:patientId            🔐  Get HIS score (0–100) + risk tier
GET  /api/v3/ai-deeptech/his/:patientId/history     🔐  HIS trend history
GET  /api/v3/ai-deeptech/his/population             🔐  Population risk distribution (admin)
POST /api/v3/ai-deeptech/his/:patientId/recompute   🔐  Force recompute score (admin)
```
**HIS Score Response:**
```json
{
  "success": true,
  "patientId": 2,
  "score": 72.4,
  "tier": "moderate",
  "dimensions": {
    "cardiovascular": 3.1,
    "diabetes": 2.8,
    "hypertension": 2.5,
    "medication_adherence": 1.2,
    "lifestyle": 1.8,
    "mental_health": 1.0
  },
  "algorithm_version": "his-v1",
  "computed_at": "2026-04-18T10:00:00Z"
}
```
> **Tiers:** `optimal` (90–100) | `low` (75–89) | `moderate` (50–74) | `high` (30–49) | `critical` (0–29)  
> Score auto-refreshes every 6 hours via background cron.

### 32.2 Clinical NLP / Medical Entity Extraction
```
POST /api/v3/ai-deeptech/entities/extract             🔐  Extract medical entities from free text
GET  /api/v3/ai-deeptech/entities/:patientId           🔐  All extracted entities for patient
GET  /api/v3/ai-deeptech/entities/:patientId/fhir      🔐  FHIR R4 Bundle of entities
```
**Extract Body:**
```json
{
  "text": "Patient complains of severe headache and fever for 2 days. On Paracetamol 500mg. No known allergies.",
  "patientId": 2,
  "source": "consultation_notes",
  "tenantId": "tenant_123"
}
```
**Response:**
```json
{
  "success": true,
  "entities": [
    { "type": "symptom", "value": "headache", "severity": "severe", "icd10": "R51", "negated": false },
    { "type": "symptom", "value": "fever", "duration": "2 days", "icd10": "R50.9", "negated": false },
    { "type": "medication", "value": "Paracetamol", "dosage": "500mg", "rxnorm": "161" }
  ],
  "entity_count": 3
}
```
> Supports: symptoms, diagnoses, medications, procedures, allergies, lab results, vitals. Includes ICD-10 + RxNorm codes, negation detection, and LLM fallback for complex text.

### 32.3 Claims Pre-Authorization Engine
```
POST  /api/v3/ai-deeptech/preauth                      🔐  Submit pre-auth request
GET   /api/v3/ai-deeptech/preauth/:ref                 🔐  Get decision by reference
POST  /api/v3/ai-deeptech/preauth/:ref/override        🔐  Human reviewer override (admin)
GET   /api/v3/ai-deeptech/preauth/analytics            🔐  Decision analytics (admin)
```
**Submit Pre-auth Body:**
```json
{
  "patientId": 2,
  "claimType": "hospitalization",
  "procedureCode": "Z51.11",
  "diagnosisCode": "J18.9",
  "requestedAmount": 75000,
  "insurancePolicyId": "POL-2024-001",
  "tenantId": "tenant_123"
}
```
**Response:**
```json
{
  "success": true,
  "referenceId": "PAD-20260418-151858",
  "decision": "escalated",
  "confidence": 0.78,
  "fraud_score": 0.12,
  "processing_time_ms": 2340
}
```
> Decisions: `approved` | `partial` | `rejected` | `escalated` | `pending` | `withdrawn`  
> Audit hash (IRDA-compliant) attached to every decision. Sub-5-second processing.

### 32.4 Multi-Agent Context Bridge
```
POST   /api/v3/ai-deeptech/context/:patientId/session              🔐  Create context session
GET    /api/v3/ai-deeptech/context/:patientId                       🔐  Get latest active session
PUT    /api/v3/ai-deeptech/context/:patientId/session/:sessionId    🔐  Update context slot
DELETE /api/v3/ai-deeptech/context/:patientId/session/:sessionId    🔐  Close session
```
**Update Slot Body:**
```json
{
  "slot": "triage_context",
  "data": {
    "urgency": "moderate",
    "symptoms": ["fever", "cough"],
    "esi_level": 3
  }
}
```
> Available slots: `triage_context` | `clinical_context` | `billing_context` | `insurance_context` | `his_context`  
> Sessions expire after 24 hours. Used by AI agents to share patient context across triage → diagnosis → billing pipeline.

### 32.5 Federated Learning (Admin Only)
```
GET  /api/v3/ai-deeptech/federated/status                   🔐🔒  FL dashboard (admin)
POST /api/v3/ai-deeptech/federated/submit                   🔐🔒  Submit local model update (admin)
GET  /api/v3/ai-deeptech/federated/model/:modelName         🔐🔒  Get global aggregated model (admin)
```
> Available models: `his_risk_model` | `triage_esi_model` | `drug_safety_model` | `readmission_model`  
> Differential privacy enforced (Gaussian noise + gradient clipping). Minimum 2 tenants + 10 samples required to aggregate. No raw patient data leaves the tenant.

---

## 33. Electronic Health Records (EHR)

> **Base path:** `/api/ehr`

```
GET  /api/ehr/patient/:patientId          🔐  Full EHR for a patient
GET  /api/ehr/record/:id                  🔐  Single EHR record detail
GET  /api/ehr/summary/:patientId          🔐  EHR summary (diagnoses, meds, allergies)
GET  /api/ehr/prescriptions/:patientId    🔐  EHR prescription history
GET  /api/ehr/reports/:patientId          🔐  EHR lab/diagnostic reports
POST /api/ehr/record                      🔐  Create new EHR record
```
**EHR Summary Response:**
```json
{
  "success": true,
  "summary": {
    "diagnoses": ["Hypertension", "Type 2 Diabetes"],
    "medications": ["Metformin 500mg", "Amlodipine 5mg"],
    "allergies": ["Penicillin"],
    "last_visit": "2026-03-15",
    "upcoming_appointments": 2
  }
}
```
> Authorization: patients can only access their own records; doctors and admins can access assigned patients.

---

## 34. FHIR R4 (Interoperability)

> **Base path:** `/api/fhir/r4`  
> Compliant with HL7 FHIR R4 specification for EHR interoperability.

```
GET /api/fhir/r4/metadata                     (Public)  FHIR capability statement
GET /api/fhir/r4/Patient/:id                  🔐  Get FHIR Patient resource
GET /api/fhir/r4/Patient                      🔐  Search patients (FHIR query)
GET /api/fhir/r4/Encounter/:id                🔐  Get Encounter resource
GET /api/fhir/r4/Encounter                    🔐  Search encounters
GET /api/fhir/r4/Condition                    🔐  Patient conditions/diagnoses
GET /api/fhir/r4/MedicationRequest            🔐  Medication requests (prescriptions)
GET /api/fhir/r4/Observation                  🔐  Vitals and lab observations
GET /api/fhir/r4/AllergyIntolerance           🔐  Allergy records
```
**Example: Get FHIR Conditions**
```
GET /api/fhir/r4/Condition?subject=Patient/2&_format=json
Authorization: Bearer <token>
```
**Response (FHIR Bundle):**
```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "entry": [
    {
      "resource": {
        "resourceType": "Condition",
        "id": "cond-001",
        "subject": { "reference": "Patient/2" },
        "code": { "coding": [{ "system": "http://hl7.org/fhir/sid/icd-10", "code": "I10", "display": "Hypertension" }] },
        "clinicalStatus": { "coding": [{ "code": "active" }] }
      }
    }
  ]
}
```
> Use FHIR R4 endpoints to export patient data to external EHR systems (Apollo, Practo, government ABDM). Also used internally by the Clinical NLP FHIR bundle endpoint.

---

## 35. Pharmacy Orders

> **Base path:** `/api/pharmacy-orders`

### 35.1 Browse & Order
```
GET    /api/pharmacy-orders                   🔐  List my pharmacy orders
POST   /api/pharmacy-orders                   🔐  Place new pharmacy order
GET    /api/pharmacy-orders/:orderId          🔐  Order detail
POST   /api/pharmacy-orders/:orderId/cancel   🔐  Cancel order
```
**Place Order Body:**
```json
{
  "items": [
    { "medicineId": "MED-001", "name": "Paracetamol 500mg", "quantity": 2, "price": 45.00 },
    { "medicineId": "MED-022", "name": "Metformin 500mg", "quantity": 1, "price": 120.00 }
  ],
  "delivery_type": "home_delivery",
  "delivery_address": {
    "line1": "123 Main Street",
    "city": "Mumbai",
    "pincode": "400001"
  },
  "delivery_date": "2026-04-20",
  "delivery_time_slot": "10:00-12:00",
  "prescription_note": "Prescription uploaded in reports section",
  "subtotal": 165.00,
  "delivery_charge": 30.00,
  "discount": 0,
  "total_amount": 195.00,
  "customer_notes": "Please ring the bell twice"
}
```
> `delivery_type`: `"home_delivery"` | `"store_pickup"`  
> Order statuses: `pending` | `confirmed` | `dispatched` | `delivered` | `cancelled`

### 35.2 Medicine Search (Public)
```
GET /api/pharmacy/medicines?q=paracetamol   (Public)  Search medicine catalog
```

---

## 36. Activity Tracker (Advanced)

> **Base path:** `/api/activity-tracker`  
> Logs daily activities: steps, stairs, sleep, exercise, calories, vitals.

```
POST /api/activity-tracker/log       🔐  Log an activity
GET  /api/activity-tracker/today     🔐  Today's activity summary
GET  /api/activity-tracker/history   🔐  Activity history (with date range)
GET  /api/activity-tracker/summary   🔐  Aggregated stats
GET  /api/activity-tracker/          🔐  All activity records (paginated)
```
**Log Activity Body:**
```json
{
  "activity_type": "steps",
  "value": 8500,
  "unit": "count",
  "date": "2026-04-18",
  "metadata": { "source": "manual", "deviceId": "phone" }
}
```
> Supported `activity_type` values: `steps` | `stairs` | `sleep` | `exercise` | `calories` | `heart_rate` | `blood_pressure` | `spo2` | `weight` | `water_intake`

**Today Summary Response:**
```json
{
  "success": true,
  "date": "2026-04-18",
  "totals": {
    "steps": 8500,
    "calories": 320,
    "sleep_hours": 7.5,
    "exercise_minutes": 35
  },
  "goals": {
    "steps_goal": 10000,
    "steps_progress": 85
  }
}
```

---

## 37. Offline AI Scribe

> **Base path:** `/api/offline-scribe`  
> CPU-only, Indian language speech-to-structured-clinical-notes. Requires `scribe_access` permission on the account (granted to doctors and licensed clinical staff).

### 37.1 Service Info (Public)
```
GET /api/offline-scribe/health       (Public)  Service health check
GET /api/offline-scribe/languages    (Public)  Supported languages (Hindi, Tamil, Telugu, Kannada, Bengali, Marathi + English)
GET /api/offline-scribe/templates    (Public)  Available note templates
```

### 37.2 Clinical Transcription (Scribe Access Required)
```
POST /api/offline-scribe/transcribe     🔐🎤  Transcribe audio → structured notes
     multipart/form-data: { audio: <file>, language: "hi", note_type: "opd" }

POST /api/offline-scribe/normalize      🔐  Normalize/clean raw transcription text
POST /api/offline-scribe/full-pipeline  🔐🎤  Audio → transcribe → normalize → notes (single call)
     multipart/form-data: { audio: <file>, language: "hi", note_type: "opd" }
```

### 37.3 Note Generation
```
POST /api/offline-scribe/prescription   🔐  Generate prescription from transcribed text
POST /api/offline-scribe/opd-notes      🔐  Generate OPD consultation notes
POST /api/offline-scribe/ipd-notes      🔐  Generate IPD admission notes
POST /api/offline-scribe/discharge      🔐  Generate discharge summary
POST /api/offline-scribe/batch          🔐  Batch process multiple transcriptions
GET  /api/offline-scribe/status         🔐  Scribe job status
```
**Full Pipeline Body (multipart/form-data):**
```
audio: <binary audio file (mp3/wav/ogg/m4a, max 25MB)>
language: "hi"       // ISO 639-1 code
note_type: "opd"     // "opd" | "ipd" | "discharge" | "prescription"
patient_id: 2        // Optional: associate with patient
```
**Response:**
```json
{
  "success": true,
  "transcription": "मरीज़ को 2 दिनों से बुखार और सिरदर्द है...",
  "normalized": "Patient has had fever and headache for 2 days...",
  "structured_note": {
    "chief_complaint": "Fever and headache",
    "duration": "2 days",
    "diagnosis": "Viral fever",
    "medications": [{ "name": "Paracetamol", "dose": "500mg", "frequency": "TDS", "duration": "5 days" }]
  }
}
```

---

## 38. Omnichannel Messaging

> **Base path:** `/api/omnichannel`  
> Send health messages, reminders, and automated journey campaigns across WhatsApp, SMS, and Email.

```
GET  /api/omnichannel/journeys          🔐  List messaging journeys
POST /api/omnichannel/send              🔐  Send a single message
POST /api/omnichannel/journey           🔐  Start an automated journey
```
**Send Message Body:**
```json
{
  "channel": "whatsapp",
  "recipient": "9884089921",
  "template": "appointment_reminder",
  "variables": {
    "patient_name": "John",
    "doctor_name": "Dr. Sharma",
    "appointment_time": "Tomorrow 10:00 AM"
  }
}
```
> Available channels: `whatsapp` | `sms` | `email`

**Start Journey Body:**
```json
{
  "journey_type": "medication_adherence",
  "patient_id": 2,
  "config": {
    "medication": "Metformin 500mg",
    "reminder_times": ["08:00", "20:00"],
    "duration_days": 30
  }
}
```
> Journey types: `medication_adherence` | `appointment_followup` | `lab_result_notification` | `post_discharge_care` | `health_checkup_reminder`

---

## 39. Socket.IO Real-Time Events

### Connection Setup
```javascript
import { io } from "socket.io-client";

const socket = io("https://app.mediqzy.com", {
  auth: { token: "Bearer <jwt-token>" },
  transports: ["websocket"],
  path: "/socket.io"
});

socket.on("authenticated", (data) => {
  console.log("Connected:", data.userId);
});
```

### Events to Listen For (Patient)

| Event | Description | Payload |
|---|---|---|
| `notification` | General notification | `{ type, title, message, data }` |
| `claim:update` | Insurance claim update | `{ claimId, status, message }` |
| `preauth:update` | Pre-auth status update | `{ preAuthId, status }` |
| `document:update` | Document processing update | `{ documentId, status }` |
| `query:new` | New query from provider | `{ queryId, message }` |
| `video-call-incoming` | Incoming video call | `{ appointmentId, callerName, roomName }` |
| `chat-message` | New chat message | `{ roomId, senderId, message }` |
| `appointment-update` | Appointment status change | `{ appointmentId, status }` |

### Events to Emit

| Event | Description | Payload |
|---|---|---|
| `ping` | Keep alive | `{}` → receives `pong` |
| `join-room` | Join user room | `{ userId }` |

---

## 40. Error Handling Reference

### Standard Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "DETAILED_ERROR_CODE"
}
```

### HTTP Status Codes
| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (missing/invalid params) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (no access to resource) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |

### Rate Limits
| Category | Limit | Window |
|---|---|---|
| Global | 300 requests | 15 minutes |
| Auth (login/register) | 10 requests | 15 minutes |
| AI endpoints | 60 requests | 15 minutes |
| AI Image analysis | 10 requests | 15 minutes |

### Token Handling
- Patient access token expires in **30 days**
- Social login (Google/Facebook) tokens also expire in **30 days**
- On 401 response → attempt silent refresh via `POST /api/v2/auth/refresh` → on refresh failure, redirect to login
- Store token securely (iOS Keychain / Android Keystore)
- Include in every request: `Authorization: Bearer <token>`

---

## 41. Endpoint Status Summary

### Auth & User
| Endpoint | Method | Status |
|---|---|---|
| `POST /api/auth/login` | Login | ✅ 200 |
| `GET /api/users/profile` | Get profile | ✅ 200 |
| `POST /api/fcm/register-token` | Register push token | ✅ 200 |

### Family Members
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/family-members` | List | ✅ 200 |
| `GET /api/family-members/limits` | Plan limits | ✅ 200 |
| `GET /api/family-members/:id/insurances` | List FM policies | ✅ 200 |
| `POST /api/family-members/:id/insurances` | Add FM policy | ✅ 201 |
| `DELETE /api/family-members/:id/insurances/:policyId` | Remove FM policy | ✅ 200 |

### Medical Records
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/reports` | All reports | ✅ 200 |
| `GET /api/reports?familyMemberId=:id` | Filter by FM | ✅ 200 |
| `POST /api/reports` with `familyMemberId` | Upload linked to FM | ✅ 201 |
| `GET /api/prescriptions/patient` | Prescriptions | ✅ 200 |
| `GET /api/prescriptions/my/all` | All prescriptions | ✅ 200 |
| `GET /api/health-diary` | Health diary | ✅ 200 |
| `GET /api/medical-ai/health-summary` | Health summary | ✅ 200 |
| `GET /api/health-assessment/questions` | Assessment questionnaire schema | ✅ 200 |
| `GET /api/health-assessment/my` | Latest assessment (200 + null if none) | ✅ 200 |

### Appointments & Consultations
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/appointments` | List appointments | ✅ 200 |
| `GET /api/appointments/upcoming` | Upcoming appointments | ✅ 200 |
| `GET /api/doctors/search` | Search doctors | ✅ 200 |
| `GET /api/medical-ai/triage-doctors` | Triage doctors | ✅ 200 |

### Lab & Diagnostics
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/lab-tests` | My lab tests | ✅ 200 |
| `GET /api/labs/` | Search labs | ✅ 200 |
| `GET /api/cart` | Cart | ✅ 200 |
| `GET /api/masterdata/specialties` | Specialties | ✅ 200 |

### Wallet, Payments & Membership
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/wallet` | Wallet balance | ✅ 200 |
| `GET /api/wallet/transactions` | Transaction history | ✅ 200 |
| `GET /api/membership/plans` | Browse plans | ✅ 200 |

### Insurance & Corporate
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/users/my-insurances` | User's own policies | ✅ 200 |
| `GET /api/corporate/my-benefits` | Corporate benefits | ✅ 200 |

### AI & Advanced Features
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/medical-ai/health` | AI service health | ✅ 200 |
| `GET /api/v3/ai-deeptech/his/2` | HIS score | ✅ 200 |
| `POST /api/v3/ai-deeptech/entities/extract` | Clinical NLP | ✅ 200 |
| `POST /api/v3/ai-deeptech/preauth` | Pre-auth engine | ✅ 200 |
| `POST /api/v3/ai-deeptech/context/2/session` | Context bridge | ✅ 200 |
| `GET /api/offline-scribe/health` | Offline scribe | ✅ 200 |
| `GET /api/omnichannel/journeys` | Omnichannel | ✅ 200 |

### EHR, FHIR & Platform
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/ehr/summary/:patientId` | EHR summary | ✅ 200 |
| `GET /api/fhir/r4/metadata` | FHIR capability | ✅ 200 |
| `GET /api/fhir/r4/Condition` | FHIR conditions | ✅ 200 |
| `GET /api/pharmacy-orders` | Pharmacy orders | ✅ 200 |
| `GET /api/activity-tracker/today` | Activity tracker | ✅ 200 |
| `GET /api/addresses` | Addresses | ✅ 200 |
| `GET /api/leaderboard/goals` | Leaderboard goals | ✅ 200 |
| `GET /api/notifications` | Notifications | ✅ 200 |

### Known Issues
| Endpoint | Status | Note |
|---|---|---|
| `GET /api/billing/orders` | ⚠️ 500 | DB migration pending |

---

## Mobile App Development Notes

### Authentication Flow
1. App launch → Check for stored token
2. If token exists → Call `GET /api/users/profile` to verify
3. If 401 → Show login screen
4. Login → Store token in secure storage
5. All API calls include `Authorization: Bearer <token>`

### Token Refresh Flow
1. Store both `accessToken` and `refreshToken` in secure storage (Keychain/Keystore) on login
2. On any `401` response → call `POST /api/v2/auth/refresh` with body `{ "refreshToken": "<stored-refresh-token>" }`
3. Queue all in-flight requests while refresh is in progress
4. On success → store new `accessToken` + `refreshToken` → retry all queued requests
5. On refresh failure (refresh token expired/revoked) → clear all tokens → navigate to login

```js
// Refresh endpoint
POST /api/v2/auth/refresh
Body: { "refreshToken": "<stored-refresh-token>" }
Response: { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

### Push Notification Deep-Link Routing

Handle incoming FCM notifications by `type` field and navigate accordingly:

| `type` | Navigate to | Required params |
|---|---|---|
| `video_call` | `/consultation/:appointmentId/video` | `appointmentId`, `roomName` |
| `appointment_reminder` | `/appointments/:appointmentId` | `appointmentId` |
| `chat_message` | `/consultation/:appointmentId/chat` | `appointmentId`, `roomId` |
| `prescription` | `/prescriptions/:prescriptionId` | `prescriptionId` |
| `system` | `/notifications` | — |

### Push Notification Flow
1. Initialize Firebase in mobile app
2. Get FCM token from Firebase
3. Call `POST /api/fcm/register-token` with device info
4. Handle incoming notifications by `type` field using the routing table above
5. On token refresh → re-register
6. On logout → call `POST /api/fcm/remove-token`

### Video Call Flow
1. Receive FCM notification `type: "video_call"`
2. Show incoming call UI
3. On accept → `GET /api/consultation/video/join/:appointmentId`
4. Use LiveKit SDK with `video.livekit.token` + `video.livekit.serverUrl` (fallback: top-level `token` + `serverUrl`)
5. On end → `POST /api/consultation/video/end/:appointmentId`

### Offline Support Recommendations
- Cache user profile, appointments, prescriptions locally
- Queue wallet earn activities for sync
- Use `/api/cart/sync` to merge offline cart on reconnect
- Store health diary entries offline, sync on connection

### Key Libraries Needed
| Platform | Library | Purpose |
|---|---|---|
| iOS/Android | Firebase SDK | FCM push notifications |
| iOS/Android | LiveKit SDK | Video calling |
| iOS/Android | Razorpay SDK | Payment processing |
| iOS | HealthKit | Apple Health sync |
| Android | Google Fit API | Google Fit sync |
| Both | Socket.IO client | Real-time events |

---

---

## Changelog

| Date | Version | Changes |
|---|---|---|
| Apr 25, 2026 | 2.4 | **Bug fixes & new endpoints:** §6 Added `GET /api/appointments/upcoming` named alias; §16 Added `GET /api/medical-ai/health-summary` (profile, BMI, conditions, upcoming count) as new §16.7, renumbered §16.7–16.10 → §16.8–16.11; §20 Added `GET /api/health-assessment/questions` (questionnaire schema) as new §20.1, added `GET /api/health-assessment/my` alias (200+null-safe) to §20.3, renumbered §20.2–20.5; §25 `GET /api/tts/voices` now returns static fallback list instead of 503 when ElevenLabs not configured; §41 Known Issues — removed two resolved entries (`/tts/voices`, `/appointments/upcoming`); **Mobile app fix:** `AI.drIsha` in `Utils/api.js` corrected to call `/medical-ai/consult` (real SIB backend) instead of static `/ai-health/dr-isha/consult`; `toReadableReply` in `AIAssistantScreen.js` updated to handle `chat_answer` field and `drIshaResponse` nested structure |
| Apr 25, 2026 | 2.3 | §12 Wallet — 3-step HC purchase flow, appointment payment (calculate/can-pay/pay/refund), earn activities table; §13 Payments restructured — `/api/billing/payments/razorpay` + Stripe routes, state machine; §14 Billing — `POST /api/billing/orders` pharmacy, `GET stats`, full response shapes; §16 AI Doctor — expanded consult body/response, language list, emergency triage response, SOS notified-contacts response, instant triage call billing response, PHI-safe chat detail, Dr. iSHA rule-based consult, high-risk term list; §18 AI Intelligence — route prefix corrected to `/api/ai-intelligence/...` (was `/api/v3/`), drug interaction body fixed, triage body expanded, risk score, learning/quality endpoints added; §21 Health Intelligence — reminder types fixed (medication/checkup/lifestyle/diet/activity/vitals/lab_test), action body corrected; §22 Diet Plan — full body/response with macronutrients, meal plan, BMR/TDEE calculation |
| Apr 19, 2026 | 2.1 | §3 Family member insurance CRUD (`/api/family-members/:id/insurances`); §9 Medical Reports `familyMemberId` upload + filter; §26 Insurance restructured with correct user policy path (`/api/users/my-insurances`) |
| Apr 2026 | 2.0 | §32 AI DeepTech Layer (HIS, Clinical NLP, Pre-auth, Context Bridge, Federated Learning); §33 EHR; §34 FHIR R4; §35 Pharmacy Orders; §36 Activity Tracker; §37 Offline AI Scribe; §38 Omnichannel Messaging; 30 new path prefixes ring-fenced for patient role |
| Mar 2026 | 1.0 | Initial release — 400+ patient-accessible endpoints across 55+ route files |

> This guide covers the **Mediczy patient/user role** API surface only. Admin, doctor, hospital, and insurance-company APIs are documented separately.
