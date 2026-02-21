# 📱 Mobile App API Documentation - Video Consultation

Complete API reference for integrating video consultation features into mobile applications.

**Last Updated:** February 18, 2026

---

## 🌐 Environment URLs

| Environment      | Base URL                      | Purpose                       |
| ---------------- | ----------------------------- | ----------------------------- |
| **Production**   | `https://app.mediqzy.com`     | Live users, real transactions |
| **UAT**          | `http://16.112.137.160`       | User Acceptance Testing       |
| **Staging**      | `https://staging.mediqzy.com` | Testing before production     |
| **Video Server** | `wss://video.mediqzy.com`     | LiveKit video (shared)        |

> ⚠️ **IMPORTANT:** Use the base domain WITHOUT `/api` suffix. All endpoints include the full path.
>
> ✅ Correct: `https://app.mediqzy.com` + `/api/mobile/video/token`
>
> ❌ Wrong: `https://app.mediqzy.com/api` + `/api/mobile/video/token` (causes double `/api/`)

---

## 📋 Table of Contents

1. [Mobile API Authentication](#mobile-api-authentication)
2. [Doctor Discovery](#doctor-discovery)
3. [Appointment Booking](#appointment-booking)
4. [Video Consultation](#video-consultation)
5. [Prescription Management](#prescription-management)
6. [Payment & Wallet](#payment--wallet)
7. [Real-time Events](#real-time-events)
8. [Push Notifications (FCM)](#-push-notifications-fcm)

---

## 🔐 Mobile API Authentication

> **Important:** The mobile app should use the dedicated `/api/mobile/` endpoints for better mobile-optimized responses.

### Signup (Register New User)

```http
POST /api/mobile/auth/signup
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone": "+919876543210",
  "dateOfBirth": "1990-05-15",
  "gender": "Male",
  "abhaHealthId": "12345678901234"
}
```

**Required Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `first_name` | string | ✅ Yes | User's first name |
| `last_name` | string | ✅ Yes | User's last name |
| `email` | string | ✅ Yes | Valid email address |
| `phone` | string | ✅ Yes | Phone with country code (e.g., +919876543210) |
| `password` | string | ✅ Yes | Min 8 characters |
| `dateOfBirth` | string | ✅ Yes | ISO date format (YYYY-MM-DD) |
| `gender` | string | ✅ Yes | Male/Female/Other |
| `abhaHealthId` | string | ⭕ Optional | 14-digit ABHA ID (Ayushman Bharat Health Account) |

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "name": "John Doe",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "avatar_url": null,
      "date_of_birth": "1990-01-01T00:00:00.000Z",
      "gender": "Other",
      "blood_group": null,
      "address": null,
      "abhaHealthId": "12345678901234",
      "role": "patient",
      "status": "active"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "30d"
  },
  "message": "Account created successfully"
}
```

**Error Responses:**

```json
// Missing phone
{ "success": false, "error": { "code": "MISSING_PHONE", "message": "Phone number is required" } }

// Invalid phone format
{ "success": false, "error": { "code": "INVALID_PHONE", "message": "Phone number must include country code (e.g., +91xxxxxxxxxx)" } }

// Missing name
{ "success": false, "error": { "code": "MISSING_NAME", "message": "First name and last name are required" } }

// Missing date of birth
{ "success": false, "error": { "code": "MISSING_DOB", "message": "Date of birth is required" } }

// Missing gender
{ "success": false, "error": { "code": "MISSING_GENDER", "message": "Gender is required" } }

// Weak password
{ "success": false, "error": { "code": "WEAK_PASSWORD", "message": "Password must be at least 8 characters" } }

// User exists
{ "success": false, "error": { "code": "USER_EXISTS", "message": "An account with this email already exists" } }
```

### Login (Email/Password)

```http
POST /api/mobile/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!",
  "deviceId": "optional-device-id",
  "pushToken": "optional-fcm-token"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "name": "John Doe",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "avatar_url": "https://...",
      "date_of_birth": "1990-05-15T00:00:00.000Z",
      "gender": "Male",
      "blood_group": "O+",
      "address": "123 Main St, City",
      "abhaHealthId": "12345678901234",
      "role": "patient",
      "status": "active"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "30d"
  }
}
```

### OTP Login (Phone-based)

**Step 1: Request OTP**

```http
POST /api/mobile/auth/otp/request
Content-Type: application/json

{
  "phone": "9876543210"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": { "expiresIn": 300 }
}
```

**Step 2: Verify OTP**

```http
POST /api/mobile/auth/otp/verify
Content-Type: application/json

{
  "phone": "9876543210",
  "otp": "123456",
  "deviceId": "optional-device-id",
  "pushToken": "optional-fcm-token"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isNewUser": false
  }
}
```

### Get User Profile

```http
GET /api/mobile/user/profile
Authorization: Bearer <accessToken>
```

### Update User Profile

```http
PUT /api/mobile/user/profile
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "John Doe",
  "dateOfBirth": "1990-05-15",
  "gender": "Male",
  "bloodGroup": "O+",
  "address": "123 Main St, City",
  "phone": "9876543210",
  "abhaHealthId": "12345678901234"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": 123,
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "dateOfBirth": "1990-05-15T00:00:00.000Z",
      "gender": "Male",
      "bloodGroup": "O+",
      "address": "123 Main St, City",
      "abhaHealthId": "12345678901234"
    }
  }
}
```

---

## 👨‍⚕️ Doctor Discovery

### List Doctors

```http
GET /api/consultation/doctors?specialty=Cardiology&sortBy=rating&limit=20&page=1
Authorization: Bearer <token>
```

**Query Parameters:**

- `specialty` (optional): Filter by doctor specialization
- `date` (optional): Check availability for specific date
- `minRating` (optional): Minimum doctor rating (0-5)
- `maxFee` (optional): Maximum consultation fee
- `sortBy` (optional): `rating` or `fee`
- `page` (default: 1): Page number
- `limit` (default: 20): Items per page

**Response:**

```json
{
  "success": true,
  "count": 15,
  "doctors": [
    {
      "id": 70,
      "name": "Dr. Nandita Agarwal",
      "email": "nandita@mediqzy.com",
      "phone": "+919876543210",
      "profileImage": "https://mediqzy.com/images/doctors/nandita.jpg",
      "specialization": "Cardiology",
      "qualifications": "MBBS, MD (Cardiology)",
      "experience": 15,
      "registrationNumber": "MH/12345/2008",
      "consultationFee": 500,
      "rating": 4.8,
      "totalReviews": 234,
      "bio": "Specialist in heart care with 15 years of experience",
      "languages": ["English", "Hindi", "Marathi"],
      "isOnline": true,
      "isAvailable": true
    }
  ]
}
```

### Get Doctor Details

```http
GET /api/doctors/:doctorId
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "doctor": {
    "id": 70,
    "name": "Dr. Nandita Agarwal",
    "specialization": "Cardiology",
    "consultationFee": 500,
    "availableSlots": [
      {
        "date": "2026-01-28",
        "slots": [
          { "time": "10:00 AM", "available": true },
          { "time": "11:00 AM", "available": true },
          { "time": "02:00 PM", "available": false }
        ]
      }
    ]
  }
}
```

---

## 📅 Appointment Booking

### Create Video Consultation Appointment

```http
POST /api/consultation/book
Authorization: Bearer <token>
Content-Type: application/json

{
  "doctorId": 70,
  "consultationType": "online",
  "appointmentDate": "2026-01-28",
  "appointmentTime": "10:00 AM",
  "symptoms": "Chest pain and shortness of breath",
  "urgency": "URGENT",
  "paymentMethod": "hc"
}
```

**Request Parameters:**

| Field              | Type   | Required | Description                                                   |
| ------------------ | ------ | -------- | ------------------------------------------------------------- |
| `doctorId`         | number | ✅ Yes   | Doctor's ID                                                   |
| `consultationType` | string | Optional | `online` (default) or `in-person`                             |
| `appointmentDate`  | string | ✅ Yes   | Date in YYYY-MM-DD format                                     |
| `appointmentTime`  | string | ✅ Yes   | Time in HH:MM format (24-hour)                                |
| `symptoms`         | string | Optional | Patient symptoms description                                  |
| `reason`           | string | Optional | Reason for consultation                                       |
| `urgency`          | string | Optional | `NORMAL`, `URGENT`, or `EMERGENCY`                            |
| `paymentMethod`    | string | Optional | `hc` (Health Coins), `wallet`, `razorpay`, or `cash` (default: pending) |

**Payment Methods:**

- **`hc` (Health Coins)** - Immediate payment using Health Coins
  - ✅ Auto-deducts HC from wallet
  - ✅ Auto-confirms appointment (status: `confirmed`)
  - ✅ Auto-generates meeting link
  - ✅ Creates HC transaction record
  - ⚠️ Requires sufficient HC balance
  
- **`wallet`** - Pay from cash wallet balance
- **`razorpay`** - Payment gateway integration
- **`cash`** - Pay at clinic (for in-person only)
- **No paymentMethod** - Appointment created with `pending` status (requires manual payment)

**Response (with Health Coins payment):**

```json
{
  "success": true,
  "message": "Paid 500 HC for ₹500. Appointment confirmed!",
  "appointment": {
    "id": 456,
    "appointmentId": "APT-456-2026",
    "doctorId": 70,
    "doctorName": "Dr. Nandita Agarwal",
    "patientId": 123,
    "patientName": "John Doe",
    "consultationType": "online",
    "appointmentDate": "2026-01-28",
    "appointmentTime": "10:00 AM",
    "status": "confirmed",
    "paymentStatus": "paid",
    "meetingId": "apt-456-1738022400",
    "meetingLink": "https://video.mediqzy.com/rooms/apt-456-1738022400",
    "amount": 500,
    "createdAt": "2026-01-27T10:00:00.000Z"
  },
  "payment": {
    "method": "health_coins",
    "hcPaid": 500,
    "consultationFeeINR": 500,
    "bonusPercent": 0,
    "newBalance": 1500,
    "transactionId": 123
  }
}
```

**Response (without payment - pending appointment):**

```json
{
  "success": true,
  "message": "Appointment booked successfully. Waiting for doctor confirmation.",
  "appointment": {
    "id": 456,
    "appointmentId": "APT-456-2026",
    "doctorId": 70,
    "doctorName": "Dr. Nandita Agarwal",
    "patientId": 123,
    "patientName": "John Doe",
    "consultationType": "online",
    "appointmentDate": "2026-01-28",
    "appointmentTime": "10:00 AM",
    "status": "pending",
    "paymentStatus": "pending",
    "amount": 500,
    "createdAt": "2026-01-27T10:00:00.000Z"
  }
}
```

**Error Response (Insufficient HC):**

```json
{
  "success": false,
  "message": "Insufficient Health Coins. You need 500 HC but have 250 HC",
  "healthCoins": {
    "canPay": false,
    "hcRequired": 500,
    "currentBalance": 250,
    "shortfall": 250
  },
  "consultationFee": 500
}
```

### Get My Appointments

```http
GET /api/appointments?status=confirmed&consultationType=online&limit=10
Authorization: Bearer <token>
```

**Query Parameters:**

- `status`: `all`, `confirmed`, `completed`, `cancelled`, `pending`
- `consultationType`: `online`, `in-person`, `all`
- `limit`: Number of results
- `page`: Page number

**Response:**

```json
{
  "success": true,
  "count": 5,
  "appointments": [
    {
      "id": 456,
      "appointmentId": "APT-456-2026",
      "doctor": {
        "id": 70,
        "name": "Dr. Nandita Agarwal",
        "specialization": "Cardiology",
        "profileImage": "https://mediqzy.com/images/doctors/nandita.jpg"
      },
      "consultationType": "online",
      "appointmentDate": "2026-01-28",
      "appointmentTime": "10:00 AM",
      "status": "confirmed",
      "roomId": "apt-456",
      "meetingId": "apt-456-1738022400",
      "canJoin": true,
      "joinTime": "2026-01-28T09:45:00.000Z"
    }
  ]
}
```

### Cancel Appointment

```http
POST /api/appointments/:appointmentId/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Unable to attend"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Appointment cancelled successfully",
  "refund": {
    "amount": 500,
    "method": "wallet",
    "status": "processed"
  }
}
```

---

## 🎥 Video Consultation

### Get Mobile Video Token (Recommended) ✅

> **📱 Recommended for Mobile Apps:** Use this endpoint for better mobile-optimized responses.

```http
POST /api/mobile/video/token
Authorization: Bearer <token>
Content-Type: application/json

{
  "appointmentId": 456
}
```

**Or with custom room name:**

```json
{
  "roomName": "custom-room-name"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "meetingId": "apt-456",
    "serverUrl": "wss://video.mediqzy.com",
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "roomName": "apt-456",
    "meetUrl": "https://video.mediqzy.com/rooms/apt-456",
    "joinUrl": "https://video.mediqzy.com/rooms/apt-456?access_token=...",
    "expiresAt": "2026-02-03T07:00:00.000Z"
  }
}
```

**Error Responses:**

| Code             | Status | Description                    |
| ---------------- | ------ | ------------------------------ |
| `USER_NOT_FOUND` | 404    | User not found in database     |
| `LIVEKIT_ERROR`  | 500    | Failed to generate video token |
| `NO_TOKEN`       | 401    | Missing authentication token   |
| `ACCESS_DENIED`  | 403    | Insufficient privileges        |

---

### Get Persistent Video Token (Long-lived) 🔐

> **📱 For apps needing persistent tokens:** This endpoint generates a token valid for multiple days that can be reused for all video calls without requesting a new token each time.

```http
POST /api/mobile/video/persistent-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "ttlDays": 7,
  "roomAgnostic": true
}
```

**Request Parameters:**

| Field          | Type    | Default | Description                                             |
| -------------- | ------- | ------- | ------------------------------------------------------- |
| `ttlDays`      | number  | 1       | Token validity in days (1-7 days max)                   |
| `roomAgnostic` | boolean | true    | If true, token works for ANY room; if false, restricted |

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...<long-lived-token>",
    "serverUrl": "wss://video.mediqzy.com",
    "identity": "patient-123",
    "displayName": "John Doe",
    "roomAgnostic": true,
    "validForDays": 7,
    "expiresAt": "2026-02-10T12:00:00.000Z",
    "usage": {
      "note": "Store this token securely. It can be used for all video calls until expiry.",
      "howToJoin": "Use serverUrl + token + any roomName to join calls"
    }
  },
  "message": "Persistent token generated, valid for 7 day(s)"
}
```

**⚠️ Security Considerations:**

1. **Store securely** - Use encrypted storage (Keychain/Keystore)
2. **Token rotation** - Refresh before expiry for seamless experience
3. **Revocation** - Contact admin if token is compromised
4. **Max TTL** - 7 days maximum for security

**Usage in Mobile App:**

```javascript
// Store persistent token on first login or app install
const { token, serverUrl, expiresAt } = await getPersistentToken({
  ttlDays: 7,
});

// Use for any video call without requesting new token
async function joinVideoCall(roomName) {
  const room = new Room();
  await room.connect(serverUrl, token, {
    roomOptions: { adaptiveStream: true },
  });
  await room.localParticipant.setCameraEnabled(true);
  await room.localParticipant.setMicrophoneEnabled(true);
}
```

---

### Get Video Room Token (Legacy)

```http
POST /api/video/livekit/token
Authorization: Bearer <token>
Content-Type: application/json

{
  "roomName": "apt-456",
  "participantName": "John Doe"
}
```

**⚠️ Authentication Required:** This endpoint requires a valid JWT Bearer token.

**Response (200 OK):**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "serverUrl": "wss://video.mediqzy.com",
  "roomName": "apt-456",
  "participantName": "John Doe",
  "expiresAt": "2026-01-28T12:00:00.000Z"
}
```

**Error Response (401 Unauthorized):**

```json
{
  "success": false,
  "error": "Authentication required"
}
```

### Join Video Consultation

```http
POST /api/video/room/:roomId/join
Authorization: Bearer <token>
Content-Type: application/json

{
  "appointmentId": 456
}
```

**Response:**

```json
{
  "success": true,
  "message": "Joined video room successfully",
  "room": {
    "roomId": "apt-456",
    "appointmentId": 456,
    "participants": [
      {
        "id": "user-123",
        "name": "John Doe",
        "role": "patient",
        "isDoctor": false
      }
    ],
    "startedAt": "2026-01-28T10:00:00.000Z"
  },
  "video": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "serverUrl": "wss://video.mediqzy.com",
    "provider": "livekit"
  }
}
```

### Leave Video Consultation

```http
POST /api/video/room/:roomId/leave
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Left video room successfully",
  "duration": 1200,
  "appointmentStatus": "completed"
}
```

### Get Room Status

```http
GET /api/video/room/:roomId/status
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "room": {
    "roomId": "apt-456",
    "isActive": true,
    "participants": [
      {
        "id": "user-123",
        "name": "John Doe",
        "role": "patient",
        "joinedAt": "2026-01-28T10:00:00.000Z"
      },
      {
        "id": "doctor-70",
        "name": "Dr. Nandita Agarwal",
        "role": "doctor",
        "joinedAt": "2026-01-28T10:02:00.000Z"
      }
    ],
    "startedAt": "2026-01-28T10:00:00.000Z",
    "duration": 300
  }
}
```

### End Video Consultation (Doctor Only)

```http
POST /api/consultation/video/end/:appointmentId
Authorization: Bearer <doctor-token>
Content-Type: application/json

{
  "notes": "Patient showing signs of viral fever. Prescribed medications.",
  "prescription": "Paracetamol 500mg TDS for 5 days"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Consultation ended successfully",
  "appointment": {
    "id": 456,
    "status": "completed",
    "duration": 1200,
    "endedAt": "2026-01-28T10:20:00.000Z"
  }
}
```

---

## 💊 Prescription Management

### Create Prescription (Doctor Only)

```http
POST /api/prescriptions/from-appointment/:appointmentId
Authorization: Bearer <doctor-token>
Content-Type: application/json

{
  "diagnosis": "Viral Fever with Myalgia",
  "chiefComplaints": [
    "Fever (102°F)",
    "Severe headache",
    "Body pain"
  ],
  "vitals": {
    "temperature": "102°F",
    "bloodPressure": "120/80",
    "pulse": "88",
    "weight": "70kg"
  },
  "medications": [
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "frequency": "Three times daily",
      "duration": "5 days",
      "instructions": "Take after meals"
    },
    {
      "name": "Ibuprofen",
      "dosage": "400mg",
      "frequency": "Twice daily",
      "duration": "3 days",
      "instructions": "Take with food"
    }
  ],
  "labTests": ["CBC", "ESR"],
  "followUpDate": "2026-02-03",
  "specialInstructions": "Stay hydrated, rest for 3-4 days"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Prescription created successfully",
  "prescription": {
    "id": 789,
    "prescriptionNumber": "RX-789-2026",
    "appointmentId": 456,
    "doctorId": 70,
    "patientId": 123,
    "diagnosis": "Viral Fever with Myalgia",
    "medications": [...],
    "pdfUrl": "https://mediqzy.com/prescriptions/RX-789-2026.pdf",
    "shareUrl": "https://mediqzy.com/rx/RX-789-2026",
    "whatsappShareUrl": "https://mediqzy.com/api/prescriptions/RX-789-2026/share/whatsapp",
    "createdAt": "2026-01-28T10:20:00.000Z"
  }
}
```

### Get Prescription by Appointment

```http
GET /api/prescriptions/appointment/:appointmentId
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "prescription": {
    "id": 789,
    "prescriptionNumber": "RX-789-2026",
    "doctor": {
      "name": "Dr. Nandita Agarwal",
      "specialization": "Cardiology",
      "registrationNumber": "MH/12345/2008"
    },
    "patient": {
      "name": "John Doe",
      "age": 35,
      "gender": "Male"
    },
    "diagnosis": "Viral Fever with Myalgia",
    "medications": [...],
    "labTests": ["CBC", "ESR"],
    "pdfUrl": "https://mediqzy.com/prescriptions/RX-789-2026.pdf",
    "createdAt": "2026-01-28T10:20:00.000Z"
  }
}
```

### Download Prescription PDF

```http
GET /api/prescriptions/:prescriptionId/pdf
Authorization: Bearer <token>
```

Returns PDF file for download.

### Share Prescription via WhatsApp

```http
POST /api/prescriptions/:prescriptionId/share/whatsapp/:phoneNumber
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Prescription shared via WhatsApp successfully",
  "whatsappUrl": "https://wa.me/919876543210?text=..."
}
```

---

## 💰 Payment & Wallet

### Get Wallet Balance

```http
GET /api/wallet/balance
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "balance": {
    "totalBalance": 1500,
    "availableBalance": 1500,
    "lockedBalance": 0,
    "healthCoins": 250,
    "currency": "INR"
  }
}
```

### Add Money to Wallet

```http
POST /api/wallet/topup
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 1000,
  "paymentMethod": "razorpay"
}
```

**Response:**

```json
{
  "success": true,
  "orderId": "order_123456",
  "amount": 1000,
  "currency": "INR",
  "razorpayKey": "rzp_live_xxxxx",
  "callback": "https://mediqzy.com/api/wallet/topup/callback"
}
```

### Calculate Consultation Cost

```http
GET /api/wallet/appointment/calculate/:consultationFee
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "consultationFee": 500,
  "healthCoinsBalance": 250,
  "healthCoinsValue": 50,
  "amountToPay": 450,
  "canPayWithHC": true,
  "savings": 50
}
```

### Transaction History

```http
GET /api/wallet/transactions?type=consultation&limit=20&page=1
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "transactions": [
    {
      "id": "TXN-789",
      "type": "debit",
      "amount": 500,
      "purpose": "Video Consultation",
      "appointmentId": 456,
      "doctorName": "Dr. Nandita Agarwal",
      "status": "completed",
      "timestamp": "2026-01-28T10:00:00.000Z"
    }
  ]
}
```

---

## 🔔 Real-time Events (Socket.io)

### Connect to Socket

```javascript
import io from "socket.io-client";

const socket = io("https://mediqzy.com", {
  auth: {
    token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
});

socket.on("connect", () => {
  console.log("Connected to Mediczy");

  // REQUIRED: join personal notification room after connect
  socket.emit("user-connect", {
    userId: currentUser.id,
    userType: "patient", // use "doctor" for doctor app
    // fcmToken: optional
  });
});
```

> ⚠️ **Important:** `doctor-initiated-call` is emitted to room `user-{userId}`. If `user-connect` is not sent after socket connection, the patient device will not join that room and will miss the call event.

### Listen for Doctor Call Initiation

```javascript
socket.on("doctor-initiated-call", (data) => {
  // {
  //   appointmentId: 456,
  //   doctorName: "Dr. Nandita Agarwal",
  //   doctorId: 70,
  //   meetingLink: "https://video.mediqzy.com/rooms/apt-456",
  //   callInitiatedAt: "2026-01-28T10:00:00.000Z",
  //   appointmentDate: "2026-01-28",
  //   appointmentTime: "10:00 AM"
  // }

  // Show notification to patient
  showNotification({
    title: `${data.doctorName} is calling`,
    message: "Tap to join video consultation",
    action: () => joinVideoCall(data.appointmentId, data.meetingLink),
  });
});
```

### Listen for Appointment Updates

```javascript
socket.on("appointment-update", (data) => {
  // {
  //   appointmentId: 456,
  //   status: "in-progress",
  //   message: "Doctor has joined the consultation"
  // }

  updateAppointmentStatus(data.appointmentId, data.status);
});
```

### Listen for Prescription Ready

```javascript
socket.on("prescription-ready", (data) => {
  // {
  //   appointmentId: 456,
  //   prescriptionId: 789,
  //   prescriptionNumber: "RX-789-2026",
  //   pdfUrl: "https://mediqzy.com/prescriptions/RX-789-2026.pdf"
  // }

  showNotification({
    title: "Prescription Ready",
    message: "Your prescription is ready to download",
    action: () => downloadPrescription(data.pdfUrl),
  });
});
```

### Send Typing Indicator

```javascript
socket.emit("typing", {
  appointmentId: 456,
  isTyping: true,
});
```

---

## � Push Notifications (FCM)

Firebase Cloud Messaging integration for push notifications on mobile devices.

### Register FCM Token

Register your device's FCM token to receive push notifications. Call this after login and whenever the token refreshes.

```http
POST /api/notifications/fcm/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "fMhkZ9Xt...FCM_TOKEN_HERE",
  "deviceType": "android"
}
```

**Request Parameters:**

| Field        | Type   | Required | Description                          |
| ------------ | ------ | -------- | ------------------------------------ |
| `token`      | string | ✅ Yes   | FCM device token from Firebase SDK   |
| `deviceType` | string | Optional | `android`, `ios`, or `web` (default) |

**Response (200 OK):**

```json
{
  "success": true,
  "message": "FCM token registered successfully"
}
```

### Register Device (Alternative)

Alternative endpoint that registers device info along with FCM token.

```http
POST /api/mobile/devices/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "unique-device-uuid",
  "pushToken": "fMhkZ9Xt...FCM_TOKEN_HERE",
  "platform": "android",
  "model": "Samsung Galaxy S23",
  "osVersion": "14.0"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

### Update Push Token

Update FCM token when it refreshes (Firebase can refresh tokens periodically).

```http
PUT /api/mobile/devices/push-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "unique-device-uuid",
  "pushToken": "NEW_FCM_TOKEN_HERE"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Push token updated"
}
```

### Get Notifications

Retrieve user's notification history.

```http
GET /api/notifications?page=1&limit=20&unreadOnly=true&type=appointment
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter    | Type    | Default | Description                                                                           |
| ------------ | ------- | ------- | ------------------------------------------------------------------------------------- |
| `page`       | number  | 1       | Page number                                                                           |
| `limit`      | number  | 20      | Items per page                                                                        |
| `unreadOnly` | boolean | false   | Only return unread notifications                                                      |
| `type`       | string  | all     | Filter by type: `appointment`, `payment`, `consultation`, `prescription`, `promotion` |

**Response:**

```json
{
  "success": true,
  "notifications": [
    {
      "id": 123,
      "type": "appointment_booked",
      "title": "Appointment Booked Successfully! ✅",
      "message": "Your appointment with Dr. Nandita Agarwal is scheduled for Jan 28, 2026 at 10:00 AM",
      "isRead": false,
      "actionUrl": "/appointments/456",
      "metadata": {
        "appointmentId": 456,
        "doctorId": 70
      },
      "createdAt": "2026-01-27T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### Get Unread Count

Get the count of unread notifications (for badge display).

```http
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "unreadCount": 5
}
```

### Mark Notification as Read

```http
POST /api/notifications/:id/read
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### Mark All as Read

```http
POST /api/notifications/read-all
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

### Delete Notification

```http
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Notification deleted"
}
```

### Get Notification Preferences

```http
GET /api/notifications/preferences
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "preferences": {
    "push": true,
    "email": true,
    "sms": true,
    "inApp": true,
    "appointmentReminders": true,
    "paymentAlerts": true,
    "promotions": false
  }
}
```

### Push Notification Types

Your app will receive these notification types via FCM:

| Type                    | Trigger                        | Priority | Channels              |
| ----------------------- | ------------------------------ | -------- | --------------------- |
| `appointment_booked`    | Appointment confirmed          | High     | Push, Email, WhatsApp |
| `appointment_accepted`  | Doctor accepts appointment     | High     | Push, Email           |
| `appointment_rejected`  | Doctor rejects appointment     | Normal   | Push, Email           |
| `payment_pending`       | Payment reminder               | High     | Push                  |
| `payment_received`      | Payment successful             | High     | Push, Email, SMS      |
| `payment_failed`        | Payment failed                 | High     | Push                  |
| `consultation_reminder` | 1 hour before consultation     | High     | Push, SMS             |
| `consultation_starting` | 15 mins before consultation    | Urgent   | Push                  |
| `video_ready`           | Doctor is ready for video call | Urgent   | Push                  |
| `doctor_calling`        | Doctor initiates video call    | Urgent   | Push                  |
| `prescription_ready`    | Prescription created           | High     | Push, Email, WhatsApp |
| `lab_report_ready`      | Lab results available          | High     | Push, Email           |
| `membership_expiring`   | Membership expiry warning      | Normal   | Push, Email           |

### FCM Payload Structure

Your app will receive FCM messages with this structure:

```json
{
  "notification": {
    "title": "Appointment Booked Successfully! ✅",
    "body": "Your appointment with Dr. Nandita is scheduled for Jan 28 at 10:00 AM"
  },
  "data": {
    "type": "appointment_booked",
    "appointmentId": "456",
    "doctorId": "70",
    "actionUrl": "/appointments/456",
    "priority": "high",
    "timestamp": "2026-01-27T10:00:00.000Z"
  }
}
```

### React Native FCM Integration

```javascript
import messaging from "@react-native-firebase/messaging";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Request permission (iOS)
async function requestPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log("Push notification permission granted");
  }
}

// Get and register FCM token
async function registerFCMToken(authToken) {
  const fcmToken = await messaging().getToken();

  // Register with backend
  await fetch("https://mediqzy.com/api/notifications/fcm/register", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: fcmToken,
      deviceType: Platform.OS, // 'android' or 'ios'
    }),
  });

  // Store locally to detect changes
  await AsyncStorage.setItem("fcmToken", fcmToken);
}

// Listen for token refresh
messaging().onTokenRefresh(async (newToken) => {
  const authToken = await AsyncStorage.getItem("authToken");
  if (authToken) {
    await fetch("https://mediqzy.com/api/notifications/fcm/register", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: newToken,
        deviceType: Platform.OS,
      }),
    });
  }
});

// Handle foreground messages
messaging().onMessage(async (remoteMessage) => {
  console.log("Foreground notification:", remoteMessage);

  const { type, appointmentId, actionUrl } = remoteMessage.data;

  // Show local notification or in-app alert
  showLocalNotification({
    title: remoteMessage.notification.title,
    body: remoteMessage.notification.body,
    data: remoteMessage.data,
  });

  // Handle specific notification types
  if (type === "doctor_calling" || type === "video_ready") {
    // Navigate to video call screen
    navigation.navigate("VideoCall", { appointmentId });
  }
});

// Handle background/quit state messages
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("Background notification:", remoteMessage);
  // Handle data-only messages here
});

// Handle notification tap (app opened from notification)
messaging().onNotificationOpenedApp((remoteMessage) => {
  const { type, appointmentId, actionUrl } = remoteMessage.data;

  if (actionUrl) {
    // Navigate to the relevant screen
    handleDeepLink(actionUrl);
  }
});

// Check if app was opened from a notification (cold start)
messaging()
  .getInitialNotification()
  .then((remoteMessage) => {
    if (remoteMessage) {
      const { actionUrl } = remoteMessage.data;
      if (actionUrl) {
        handleDeepLink(actionUrl);
      }
    }
  });
```

### Flutter FCM Integration

```dart
import 'package:firebase_messaging/firebase_messaging.dart';

class PushNotificationService {
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final String baseUrl = 'https://mediqzy.com';
  String? authToken;

  Future<void> initialize(String token) async {
    authToken = token;

    // Request permission (iOS)
    NotificationSettings settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      // Get FCM token and register
      String? fcmToken = await _fcm.getToken();
      if (fcmToken != null) {
        await _registerToken(fcmToken);
      }

      // Listen for token refresh
      _fcm.onTokenRefresh.listen(_registerToken);

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

      // Handle notification taps
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
    }
  }

  Future<void> _registerToken(String fcmToken) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/notifications/fcm/register'),
      headers: {
        'Authorization': 'Bearer $authToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'token': fcmToken,
        'deviceType': Platform.isAndroid ? 'android' : 'ios',
      }),
    );

    if (response.statusCode == 200) {
      print('FCM token registered successfully');
    }
  }

  void _handleForegroundMessage(RemoteMessage message) {
    print('Foreground message: ${message.notification?.title}');

    final data = message.data;
    final type = data['type'];

    // Show local notification
    _showLocalNotification(message);

    // Handle video call notifications immediately
    if (type == 'doctor_calling' || type == 'video_ready') {
      _navigateToVideoCall(data['appointmentId']);
    }
  }

  void _handleNotificationTap(RemoteMessage message) {
    final actionUrl = message.data['actionUrl'];
    if (actionUrl != null) {
      _handleDeepLink(actionUrl);
    }
  }
}
```

---

## �📊 Error Handling

All API responses follow a consistent error format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code                   | Status | Description                             |
| ---------------------- | ------ | --------------------------------------- |
| `UNAUTHORIZED`         | 401    | Invalid or missing authentication token |
| `FORBIDDEN`            | 403    | Insufficient permissions                |
| `NOT_FOUND`            | 404    | Resource not found                      |
| `VALIDATION_ERROR`     | 400    | Invalid request data                    |
| `INSUFFICIENT_BALANCE` | 402    | Insufficient wallet balance             |
| `APPOINTMENT_CONFLICT` | 409    | Time slot already booked                |
| `SERVER_ERROR`         | 500    | Internal server error                   |

---

## 🔒 Security Best Practices

1. **Token Storage**: Store JWT tokens securely using encrypted storage
2. **HTTPS Only**: Always use HTTPS for API calls
3. **Token Refresh**: Implement token refresh mechanism
4. **Rate Limiting**: Respect API rate limits (100 requests/minute)
5. **Input Validation**: Validate all user inputs before sending to API
6. **WebRTC Security**: Use secure WebRTC connections with TURN/STUN servers

---

## 📱 Mobile SDK Integration Examples

### React Native Example

```javascript
import axios from "axios";

// Environment configuration for React Native
const ENVIRONMENTS = {
  development: {
    API_URL: "http://localhost:8000",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
  uat: {
    API_URL: "http://16.112.137.160",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
  staging: {
    API_URL: "https://staging.mediqzy.com",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
  production: {
    API_URL: "https://app.mediqzy.com",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
};

// Set environment based on build config
const ENV = __DEV__ ? "staging" : "production";
const config = ENVIRONMENTS[ENV];

// ✅ IMPORTANT: Use base domain WITHOUT /api suffix
const API_BASE_URL = config.API_URL;

// Endpoint constants for clarity and maintainability
const ENDPOINTS = {
  // Mobile-optimized endpoints (recommended)
  mobileVideoToken: "/api/mobile/video/token",
  mobileLogin: "/api/mobile/auth/login",
  mobileSignup: "/api/mobile/auth/signup",
  mobileProfile: "/api/mobile/user/profile",
  mobileDoctors: "/api/mobile/doctors",
  mobileAppointments: "/api/mobile/appointments",

  // Legacy endpoints (still supported)
  consultationBook: "/api/consultation/book",
  videoJoin: "/api/video/room",
  videoToken: "/api/video/livekit/token",
};

class MediczyAPI {
  constructor(token) {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  // ✅ RECOMMENDED: Use mobile-optimized endpoint
  async getVideoToken(appointmentId) {
    const response = await this.client.post(ENDPOINTS.mobileVideoToken, {
      appointmentId,
    });
    return response.data;
  }

  async bookVideoConsultation(doctorId, date, time, symptoms) {
    const response = await this.client.post(ENDPOINTS.consultationBook, {
      doctorId,
      consultationType: "online",
      appointmentDate: date,
      appointmentTime: time,
      symptoms,
      paymentMethod: "wallet",
    });
    return response.data;
  }

  async joinVideoCall(appointmentId) {
    const response = await this.client.post(
      `${ENDPOINTS.videoJoin}/apt-${appointmentId}/join`,
      { appointmentId },
    );
    return response.data;
  }
}

export default MediczyAPI;
```

### Complete React Native API Service

Here's a comprehensive API service class for React Native with environment support:

```javascript
// services/MediczyAPI.js
import AsyncStorage from "@react-native-async-storage/async-storage";

// Environment configuration
const ENVIRONMENTS = {
  development: {
    API_URL: "http://localhost:8000",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
  uat: {
    API_URL: "http://16.112.137.160",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
  staging: {
    API_URL: "https://staging.mediqzy.com",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
  production: {
    API_URL: "https://app.mediqzy.com",
    VIDEO_URL: "wss://video.mediqzy.com",
  },
};

// Set this based on your build configuration
// For testing: 'uat' or 'staging', For release: 'production'
const CURRENT_ENV = __DEV__ ? "staging" : "production";
const config = ENVIRONMENTS[CURRENT_ENV];

const API_BASE_URL = config.API_URL;

class MediczyAPI {
  static instance = null;
  token = null;

  static getInstance() {
    if (!MediczyAPI.instance) {
      MediczyAPI.instance = new MediczyAPI();
    }
    return MediczyAPI.instance;
  }

  async initialize() {
    this.token = await AsyncStorage.getItem("authToken");
  }

  setToken(token) {
    this.token = token;
  }

  getHeaders(includeAuth = true) {
    const headers = { "Content-Type": "application/json" };
    if (includeAuth && this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: this.getHeaders(options.auth !== false),
      ...options,
    };

    if (options.body && typeof options.body === "object") {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;
  }

  // ============ AUTH ============
  async login(email, password, deviceId, pushToken) {
    const data = await this.request("/api/mobile/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password, deviceId, pushToken },
    });

    if (data.success) {
      this.token = data.data.accessToken;
      await AsyncStorage.setItem("authToken", this.token);
      await AsyncStorage.setItem("refreshToken", data.data.refreshToken);
      await AsyncStorage.setItem("user", JSON.stringify(data.data.user));
    }

    return data;
  }

  async signup(userData) {
    const data = await this.request("/api/mobile/auth/signup", {
      method: "POST",
      auth: false,
      body: userData,
    });

    if (data.success) {
      this.token = data.data.accessToken;
      await AsyncStorage.setItem("authToken", this.token);
      await AsyncStorage.setItem("refreshToken", data.data.refreshToken);
    }

    return data;
  }

  async requestOTP(phone) {
    return this.request("/api/mobile/auth/otp/request", {
      method: "POST",
      auth: false,
      body: { phone },
    });
  }

  async verifyOTP(phone, otp, deviceId, pushToken) {
    const data = await this.request("/api/mobile/auth/otp/verify", {
      method: "POST",
      auth: false,
      body: { phone, otp, deviceId, pushToken },
    });

    if (data.success) {
      this.token = data.data.accessToken;
      await AsyncStorage.setItem("authToken", this.token);
    }

    return data;
  }

  async logout() {
    this.token = null;
    await AsyncStorage.multiRemove([
      "authToken",
      "refreshToken",
      "user",
      "fcmToken",
    ]);
  }

  // ============ PROFILE ============
  async getProfile() {
    return this.request("/api/mobile/user/profile");
  }

  async updateProfile(profileData) {
    return this.request("/api/mobile/user/profile", {
      method: "PUT",
      body: profileData,
    });
  }

  // ============ DOCTORS ============
  async getDoctors(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/consultation/doctors?${query}`);
  }

  async getDoctorDetails(doctorId) {
    return this.request(`/api/doctors/${doctorId}`);
  }

  // ============ APPOINTMENTS ============
  async bookAppointment(appointmentData) {
    return this.request("/api/consultation/book", {
      method: "POST",
      body: appointmentData,
    });
  }

  async getAppointments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/appointments?${query}`);
  }

  async cancelAppointment(appointmentId, reason) {
    return this.request(`/api/appointments/${appointmentId}/cancel`, {
      method: "POST",
      body: { reason },
    });
  }

  // ============ VIDEO ============
  async getVideoToken(appointmentId) {
    return this.request("/api/mobile/video/token", {
      method: "POST",
      body: { appointmentId },
    });
  }

  async getPersistentVideoToken(ttlDays = 7) {
    return this.request("/api/mobile/video/persistent-token", {
      method: "POST",
      body: { ttlDays, roomAgnostic: true },
    });
  }

  async joinVideoRoom(roomId, appointmentId) {
    return this.request(`/api/video/room/${roomId}/join`, {
      method: "POST",
      body: { appointmentId },
    });
  }

  async leaveVideoRoom(roomId) {
    return this.request(`/api/video/room/${roomId}/leave`, {
      method: "POST",
    });
  }

  // ============ PRESCRIPTIONS ============
  async getPrescription(appointmentId) {
    return this.request(`/api/prescriptions/appointment/${appointmentId}`);
  }

  async getPrescriptionPDF(prescriptionId) {
    return this.request(`/api/prescriptions/${prescriptionId}/pdf`);
  }

  // ============ WALLET ============
  async getWalletBalance() {
    return this.request("/api/wallet/balance");
  }

  async topupWallet(amount, paymentMethod = "razorpay") {
    return this.request("/api/wallet/topup", {
      method: "POST",
      body: { amount, paymentMethod },
    });
  }

  async getTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/wallet/transactions?${query}`);
  }

  // ============ NOTIFICATIONS ============
  async registerFCMToken(token, deviceType) {
    return this.request("/api/notifications/fcm/register", {
      method: "POST",
      body: { token, deviceType },
    });
  }

  async getNotifications(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/notifications?${query}`);
  }

  async getUnreadCount() {
    return this.request("/api/notifications/unread-count");
  }

  async markNotificationRead(notificationId) {
    return this.request(`/api/notifications/${notificationId}/read`, {
      method: "POST",
    });
  }

  async markAllNotificationsRead() {
    return this.request("/api/notifications/read-all", {
      method: "POST",
    });
  }

  async getNotificationPreferences() {
    return this.request("/api/notifications/preferences");
  }
}

export default MediczyAPI;
```

### Usage Examples

```javascript
// In your React Native components
import MediczyAPI from "./services/MediczyAPI";

const api = MediczyAPI.getInstance();

// Login
const handleLogin = async () => {
  try {
    const result = await api.login("user@example.com", "password123");
    if (result.success) {
      // Navigate to home
    }
  } catch (error) {
    Alert.alert("Login Failed", error.message);
  }
};

// Book appointment
const handleBookAppointment = async () => {
  try {
    const result = await api.bookAppointment({
      doctorId: 70,
      consultationType: "online",
      appointmentDate: "2026-02-05",
      appointmentTime: "10:00 AM",
      symptoms: "Headache and fever",
      paymentMethod: "wallet",
    });
    if (result.success) {
      Alert.alert("Success", "Appointment booked!");
    }
  } catch (error) {
    Alert.alert("Booking Failed", error.message);
  }
};

// Join video call
const handleJoinVideoCall = async (appointmentId) => {
  try {
    const { data } = await api.getVideoToken(appointmentId);
    // Use data.serverUrl and data.token with LiveKit SDK
    navigation.navigate("VideoCall", {
      serverUrl: data.serverUrl,
      token: data.token,
      roomName: data.roomName,
    });
  } catch (error) {
    Alert.alert("Error", "Failed to join video call");
  }
};
```

---

## 🎯 Integration Checklist

- [ ] Implement user authentication (register/login)
- [ ] Integrate doctor listing and search
- [ ] Implement appointment booking flow
- [ ] Integrate wallet and payment system
- [ ] Set up Socket.io for real-time notifications
- [ ] Integrate LiveKit for video calls
- [ ] Implement prescription viewing and download
- [ ] Add error handling and retry logic
- [ ] Test video calls on different networks
- [ ] Implement offline support for viewing past consultations
- [x] Add push notifications for appointment reminders _(see FCM section)_
- [x] Register FCM token on login and token refresh _(see FCM section)_
- [x] Handle background and foreground push notifications _(see FCM section)_
- [ ] Test on both iOS and Android platforms

---

## 🆘 Support

For API support and questions:

- **Email**: support@mediqzy.com
- **Documentation**: https://docs.mediqzy.com
- **Status Page**: https://status.mediqzy.com

---

## 📝 Changelog

### v2.5.0 (2026-02-20)

- **NEW**: Health Coins (HC) payment integration in booking endpoint
- **NEW**: `paymentMethod` parameter supports `hc`, `wallet`, `razorpay`, `cash`
- **ENHANCED**: Immediate HC payment during appointment booking
  - Auto-validates HC balance before booking
  - Auto-deducts HC from user wallet
  - Auto-confirms appointment (no doctor approval needed)
  - Auto-generates meeting link for video calls
  - Creates HC transaction record for audit trail
- **IMPROVED**: One-step booking with HC payment (no separate payment call needed)
- **DOCS**: Added comprehensive HC payment examples and error responses

### v2.3.0 (2026-02-03)

- **NEW**: Added comprehensive Push Notifications (FCM) section
- **NEW**: FCM token registration endpoints (`/api/notifications/fcm/register`)
- **NEW**: Device registration endpoints (`/api/mobile/devices/register`, `/api/mobile/devices/push-token`)
- **NEW**: Notification management endpoints (list, read, delete)
- **NEW**: Complete React Native FCM integration with PushNotificationService class
- **DOCS**: Added notification types and FCM payload structure reference

### v2.4.0 (2026-02-18)

- **FIXED**: Realtime socket contract clarified for call notifications
- **NEW**: Added required `user-connect` handshake immediately after socket connection
- **UPDATED**: `doctor-initiated-call` payload example now matches backend fields (`doctorId`, `appointmentDate`, `appointmentTime`)
- **DOCS**: Normalized domain references to `mediqzy.com` for consistency

### v2.2.0 (2026-02-03)

- **NEW**: Added `/api/mobile/video/persistent-token` endpoint for long-lived tokens (up to 7 days)
- **NEW**: Room-agnostic tokens - single token can join any room
- **IMPROVED**: Configurable TTL for video tokens (1 hour to 7 days)
- Persistent tokens eliminate need for new token on each call

### v2.1.0 (2026-02-03)

- **BREAKING**: Clarified Base URL usage - use `https://mediqzy.com` WITHOUT `/api` suffix
- Added `/api/mobile/video/token` endpoint for mobile-optimized video tokens
- Updated SDK examples with correct endpoint configuration
- Fixed double `/api/` prefix issue in documentation

### v2.0.0 (2026-01-27)

- Added LiveKit video integration
- Enhanced prescription system
- Added wallet payment support
- Improved real-time notifications

### v1.0.0 (2025-12-01)

- Initial mobile API release
- Basic video consultation features
- Doctor booking system
