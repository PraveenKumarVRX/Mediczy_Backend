# 📱 Mobile App API Documentation - Video Consultation

Complete API reference for integrating video consultation features into mobile applications.

**Base URL:** `https://mediqzy.com`

**Last Updated:** February 2, 2026

---

## 📋 Table of Contents

1. [Mobile API Authentication](#mobile-api-authentication)
2. [Doctor Discovery](#doctor-discovery)
3. [Appointment Booking](#appointment-booking)
4. [Video Consultation](#video-consultation)
5. [Prescription Management](#prescription-management)
6. [Payment & Wallet](#payment--wallet)
7. [Real-time Events](#real-time-events)

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
  "phone": "9876543210",
  "dateOfBirth": "1990-05-15",
  "gender": "Male"
}
```

**Required Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `first_name` | string | ✅ Yes | User's first name |
| `last_name` | string | ✅ Yes | User's last name |
| `email` | string | ✅ Yes | Valid email address |
| `phone` | string | ✅ Yes | Phone number |
| `password` | string | ✅ Yes | Min 8 characters |
| `dateOfBirth` | string | ✅ Yes | ISO date format (YYYY-MM-DD) |
| `gender` | string | ✅ Yes | Male/Female/Other |

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
  "phone": "9876543210"
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
      "email": "nandita@mediczy.com",
      "phone": "+919876543210",
      "profileImage": "https://mediczy.com/images/doctors/nandita.jpg",
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
  "paymentMethod": "wallet"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Appointment booked successfully",
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
    "roomId": "apt-456",
    "meetingId": "apt-456-1738022400",
    "amount": 500,
    "paymentStatus": "paid",
    "createdAt": "2026-01-27T10:00:00.000Z"
  },
  "payment": {
    "transactionId": "TXN-789",
    "amount": 500,
    "method": "wallet",
    "status": "success"
  }
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
        "profileImage": "https://mediczy.com/images/doctors/nandita.jpg"
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

### Get Video Room Token (LiveKit)

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
    "pdfUrl": "https://mediczy.com/prescriptions/RX-789-2026.pdf",
    "shareUrl": "https://mediczy.com/rx/RX-789-2026",
    "whatsappShareUrl": "https://mediczy.com/api/prescriptions/RX-789-2026/share/whatsapp",
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
    "pdfUrl": "https://mediczy.com/prescriptions/RX-789-2026.pdf",
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
  "callback": "https://mediczy.com/api/wallet/topup/callback"
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

const socket = io("https://mediczy.com", {
  auth: {
    token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
});

socket.on("connect", () => {
  console.log("Connected to Mediczy");
});
```

### Listen for Doctor Call Initiation

```javascript
socket.on("doctor-initiated-call", (data) => {
  // {
  //   appointmentId: 456,
  //   doctorName: "Dr. Nandita Agarwal",
  //   meetingLink: "https://livekit.mediczy.com/join/apt-456",
  //   callInitiatedAt: "2026-01-28T10:00:00.000Z"
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
  //   pdfUrl: "https://mediczy.com/prescriptions/RX-789-2026.pdf"
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

## 📊 Error Handling

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

const API_BASE_URL = "https://mediczy.com/api";

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

  async bookVideoConsultation(doctorId, date, time, symptoms) {
    const response = await this.client.post("/consultation/book", {
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
      `/video/room/apt-${appointmentId}/join`,
      {
        appointmentId,
      },
    );
    return response.data;
  }

  async getVideoToken(roomName, participantName) {
    const response = await this.client.post("/video/livekit/token", {
      roomName,
      participantName,
    });
    return response.data;
  }
}

export default MediczyAPI;
```

### Flutter/Dart Example

```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class MediczyAPI {
  final String baseUrl = 'https://mediczy.com/api';
  final String token;

  MediczyAPI(this.token);

  Future<Map<String, dynamic>> bookVideoConsultation({
    required int doctorId,
    required String date,
    required String time,
    required String symptoms,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/consultation/book'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'doctorId': doctorId,
        'consultationType': 'online',
        'appointmentDate': date,
        'appointmentTime': time,
        'symptoms': symptoms,
        'paymentMethod': 'wallet',
      }),
    );

    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getVideoToken({
    required String roomName,
    required String participantName,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/video/livekit/token'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'roomName': roomName,
        'participantName': participantName,
      }),
    );

    return jsonDecode(response.body);
  }
}
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
- [ ] Add push notifications for appointment reminders
- [ ] Test on both iOS and Android platforms

---

## 🆘 Support

For API support and questions:

- **Email**: support@mediczy.com
- **Documentation**: https://docs.mediczy.com
- **Status Page**: https://status.mediczy.com

---

## 📝 Changelog

### v2.0.0 (2026-01-27)

- Added LiveKit video integration
- Enhanced prescription system
- Added wallet payment support
- Improved real-time notifications

### v1.0.0 (2025-12-01)

- Initial mobile API release
- Basic video consultation features
- Doctor booking system
