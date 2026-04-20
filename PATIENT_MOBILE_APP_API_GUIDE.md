# Mediczy — Patient Mobile App API Guide

> **Version:** 2.1 | **Last Updated:** April 19, 2026

- **Base URL:** `https://app.mediqzy.com/api`
- **Auth:** `Authorization: Bearer <jwt-token>` (JWT, expires 7 days)
- **Content-Type:** `application/json`
- **Socket.IO:** `wss://app.mediqzy.com` — path `/socket.io`
- **Rate Limits:** Global 300 req/15 min · Auth 10 req/15 min · AI 60 req/15 min

> `🔐` = Requires authentication | `(Public)` = No auth required

---

## Table of Contents

1. [Authentication](#1-authentication)
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
> Store the `token` securely (Keychain/Keystore). Include it in all subsequent requests as `Authorization: Bearer <token>`. Token expires in 7 days.

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
```
POST /api/users/register/send-otp
Body: { "email": "new@example.com", "phoneNumber": "9876543210" }

POST /api/users/register/verify-otp
Body: { "email": "new@example.com", "otp": "123456", "firstName": "John", "lastName": "Doe", "password": "SecurePass123", "dateOfBirth": "1990-01-01", "gender": "Male" }
```

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
GET /api/appointments           🔐  All appointments
GET /api/appointments/my-appointments  🔐  My appointments (alias)
GET /api/appointments/:id       🔐  Appointment detail
```

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
     → Returns: { "token": "<livekit-token>", "url": "wss://livekit...", "roomName": "..." }
POST /api/consultation/video/end/:appointmentId  🔐  End video call
```
**LiveKit Integration:**
- Use LiveKit SDK (iOS/Android) with the returned token and URL
- Room name format: `mediczy-{appointmentId}`
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
POST /api/video/livekit/token       🔐  Get LiveKit token
POST /api/video/room/:roomId/join   🔐  Join room
POST /api/video/room/:roomId/leave  🔐  Leave room
GET  /api/video/room/:roomId/status 🔐  Room status
```

---

## 8. Prescriptions

```
GET /api/prescriptions/patient                           🔐  My prescriptions
GET /api/prescriptions/my/all                            🔐  All my prescriptions
GET /api/prescriptions/:id                               🔐  Prescription detail
GET /api/prescriptions/appointment/:appointmentId        🔐  By appointment
GET /api/prescriptions/:id/html                          (Public)  HTML view
GET /api/prescriptions/:id/pdf                           (Public)  PDF download
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

### 10.2 Book Lab Tests
```
POST /api/labs/book                  🔐  Book lab test
POST /api/lab-tests                  🔐  Create lab test order
GET  /api/lab-tests                  🔐  List my lab tests
GET  /api/lab-tests/:id              🔐  Lab test detail
POST /api/lab-tests/:id/confirm      🔐  Confirm booking
POST /api/lab-tests/:id/cancel       🔐  Cancel booking
PUT  /api/lab-tests/:id              🔐  Update lab test
```

---

## 11. Cart (Lab Tests)

```
GET    /api/cart                  🔐  Get cart
POST   /api/cart/add              🔐  Add item
       Body: { "testId": 1, "labId": 5, "quantity": 1 }
DELETE /api/cart/remove/:testId   🔐  Remove item
PUT    /api/cart/update/:testId   🔐  Update item
DELETE /api/cart/clear            🔐  Clear cart
POST   /api/cart/sync             🔐  Sync cart (merge offline/online)
```

---

## 12. Wallet & HC Coins

### 12.1 Balance & History
```
GET /api/wallet              🔐  Wallet details (balance, tier)
GET /api/wallet/balance      🔐  HC coin balance
GET /api/wallet/transactions 🔐  Transaction history
GET /api/wallet/rewards      🔐  Rewards catalog
```

### 12.2 Earn HC Coins
```
POST /api/wallet/earn/daily-login      🔐  Daily login bonus
POST /api/wallet/earn/steps            🔐  Step count reward
     Body: { "steps": 10000, "date": "2026-03-15" }
POST /api/wallet/earn/health-assessment 🔐  Complete assessment bonus
POST /api/wallet/earn/vital-signs      🔐  Vitals logging bonus
POST /api/wallet/earn/activity         🔐  General activity reward
     Body: { "activityType": "meditation", "duration": 30 }
```

### 12.3 Spend & Payments
```
POST /api/wallet/spend              🔐  Spend HC coins
POST /api/wallet/validate-coupon    🔐  Validate coupon code
POST /api/wallet/create-order       🔐  Create Razorpay order
POST /api/wallet/verify-payment     🔐  Verify Razorpay payment
POST /api/wallet/redeem-free-coupon 🔐  Redeem free coupon
POST /api/wallet/purchase           🔐  Purchase with wallet
```

---

## 13. Payments (Razorpay)

```
POST /api/payments/order           🔐  Create payment order
     Body: { "amount": 500, "purpose": "appointment", "referenceId": "apt_123" }
POST /api/payments/verify          🔐  Verify payment
     Body: { "razorpay_payment_id": "...", "razorpay_order_id": "...", "razorpay_signature": "..." }
GET  /api/payments/transactions    🔐  List transactions
GET  /api/payments/transactions/:id 🔐  Transaction detail
POST /api/payments/refund          🔐  Request refund
GET  /api/payments/config          (Public)  Gateway config (Razorpay key)
```

---

## 14. Billing & Invoices

```
POST /api/billing/orders/create              🔐  Create order
GET  /api/billing/orders                     🔐  List orders
GET  /api/billing/orders/:orderId            🔐  Order detail
GET  /api/billing/orders/:orderId/detailed   🔐  Detailed order
POST /api/billing/orders/:orderId/reorder    🔐  Reorder
GET  /api/billing/orders/pharmacy/history    🔐  Pharmacy history
POST /api/billing/invoices/generate          🔐  Generate invoice
GET  /api/billing/invoices                   🔐  List invoices
GET  /api/billing/invoices/:invoiceId        🔐  Get invoice
GET  /api/billing/invoices/:invoiceId/download 🔐  Download PDF
GET  /api/billing/transactions               🔐  Transaction list
```

---

## 15. Membership Plans

### 15.1 Browse Plans
```
GET /api/membership/plans                                (Public)  List plans
GET /api/membership-plans/plans                          (Public)  List plans (v2)
GET /api/membership-plans/plans/:slug                    (Public)  Plan detail
```

### 15.2 Subscribe
```
GET  /api/membership/my/current                          🔐  Current subscription
POST /api/membership/subscribe/:planId                   🔐  Subscribe
POST /api/membership/upgrade/:newPlanId                  🔐  Upgrade
GET  /api/membership/upgrade-options                     🔐  Upgrade options
GET  /api/membership/addons                              🔐  Available add-ons
GET  /api/membership/my/all                              🔐  All memberships
GET  /api/membership/my/usage                            🔐  Usage statistics
POST /api/membership/usage/teleconsult                   🔐  Use teleconsult benefit
POST /api/membership/usage/benefit                       🔐  Use benefit
```

### 15.3 Referrals
```
POST /api/membership-plans/validate-referral              (Public)  Validate referral
GET  /api/membership-plans/referral                       🔐  My referral info
POST /api/membership-plans/generate-referral              🔐  Generate code
POST /api/membership-plans/check-feature                  🔐  Check feature access
```

---

## 16. AI Medical Features

### 16.1 AI Consultation (Dr. iSHA)
```
POST /api/medical-ai/consult 🔐
Body: {
  "message": "I have a headache and fever for 2 days",
  "sessionId": null,          // null for new session, pass for follow-up
  "language": "en"
}
```
**Response:**
```json
{
  "success": true,
  "response": "Based on your symptoms...",
  "sessionId": "sess_abc123",
  "suggestions": ["Take paracetamol", "Rest well"],
  "urgencyLevel": "low",
  "shouldConsultDoctor": false,
  "specialtySuggestion": "General Medicine"
}
```

### 16.2 Symptom Analysis
```
POST /api/medical-ai/analyze-symptoms 🔐
Body: { "symptoms": ["headache", "fever", "nausea"], "duration": "2 days", "severity": "moderate" }
```

### 16.3 Emergency Triage
```
POST /api/medical-ai/emergency-triage 🔐
Body: { "symptoms": "chest pain and difficulty breathing", "age": 35, "gender": "Male" }
→ Returns urgency level + nearest hospital + recommended action
```

### 16.4 Emergency SOS
```
POST /api/medical-ai/emergency-sos 🔐
Body: { "reason": "Heart attack symptoms", "urgencyLevel": "critical", "location": { "lat": 19.076, "lng": 72.877 }, "contacts": [] }
→ Alerts emergency contacts, nearby doctors, and ambulance services
```

### 16.5 AI Report Analysis
```
POST /api/medical-ai/analyze-report 🔐
Body: multipart/form-data { file, reportType }
```

### 16.6 Session Management
```
GET    /api/medical-ai/session/:sessionId    🔐  Get session
DELETE /api/medical-ai/session/:sessionId    🔐  Delete session
POST   /api/medical-ai/conversation-history  🔐  Get history
POST   /api/medical-ai/feedback              🔐  Submit feedback
```

### 16.7 AI-Assisted Booking
```
GET  /api/medical-ai/doctors                     🔐  List doctors
GET  /api/medical-ai/doctors/:doctorId/slots      🔐  Doctor slots
POST /api/medical-ai/book-appointment             🔐  Book via AI
GET  /api/medical-ai/my-appointments              🔐  AI-booked appointments
GET  /api/medical-ai/triage-doctors               🔐  Triage-recommended doctors
```

### 16.8 AI Health Chat
```
POST /api/ai-health/chat                 🔐  General health chat
POST /api/ai-health/dr-isha/consult      🔐  Dr. iSHA consultation
POST /api/ai-health/diet/generate        🔐  Generate diet plan
```

### 16.9 AI Utilities
```
POST /api/ai/working-medical-consult      🔐  Medical consultation
POST /api/ai/appointment-conversation     🔐  Booking conversation AI
POST /api/ai/translate                    🔐  Text translation
POST /api/ai/text-to-speech              🔐  TTS conversion
GET  /api/ai/voices                       🔐  Available voices
POST /api/ai/feedback                     🔐  AI feedback
POST /api/ai/analyze-image               (Public)  Image analysis
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

### 18.1 Drug Interactions
```
POST /api/v3/ai-intelligence/drug-interactions/check 🔐
Body: { "medications": ["Aspirin", "Warfarin", "Ibuprofen"] }

POST /api/v3/ai-intelligence/drug-interactions/quick-check 🔐
Body: { "drug1": "Aspirin", "drug2": "Warfarin" }
```

### 18.2 Insurance AI
```
POST /api/v3/ai-intelligence/insurance/query     🔐  Insurance Q&A
POST /api/v3/ai-intelligence/insurance/pre-auth  🔐  Pre-auth check
POST /api/v3/ai-intelligence/insurance/coverage   🔐  Coverage analysis
```

### 18.3 AI Triage
```
POST /api/v3/ai-intelligence/triage/assess       🔐  Triage assessment
GET  /api/v3/ai-intelligence/risk-score/me       🔐  My health risk score
```

### 18.4 Smart Notifications
```
GET   /api/v3/ai-intelligence/notifications/smart              🔐  AI smart notifications
PATCH /api/v3/ai-intelligence/notifications/smart/:id/read     🔐  Mark read
```

### 18.5 Health Insights
```
GET   /api/v3/ai-intelligence/insights/patient/:patientId      🔐  Patient insights
PATCH /api/v3/ai-intelligence/insights/:id/action              🔐  Act on insight
POST  /api/v3/ai-intelligence/feedback                         🔐  Submit feedback
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

```
GET  /api/health-assessment       🔐  Get my assessments
POST /api/health-assessment/save  🔐  Save assessment
     Body: { "responses": { "smoking": false, "exercise": "moderate", "diet": "balanced", "sleep_hours": 7, "stress_level": "low" } }
```

---

## 21. Health Intelligence Dashboard

```
GET  /api/health-intelligence                    🔐  Dashboard overview
GET  /api/health-intelligence/reminders/:type    🔐  Reminders by type
     type: "medication" | "appointment" | "exercise" | "checkup"
POST /api/health-intelligence/action             🔐  Take action on recommendation
     Body: { "recommendationId": "rec_123", "action": "completed" }
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
```
POST /api/diet/generate       🔐  Generate AI diet plan
     Body: { "goal": "weight_loss", "restrictions": ["vegetarian"], "allergies": ["nuts"] }
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
POST /api/tts/speak          (Public)  Text-to-speech
     Body: { "text": "Your next appointment is tomorrow", "language": "en", "voice": "default" }
     → Returns: audio/mpeg stream

GET  /api/tts/voices          (Public)  Available voices
GET  /api/tts/status          (Public)  TTS service status
```
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
GET  /api/ayushman/e-card                (Public)  Get e-card
POST /api/ayushman/check-status          (Public)  Check status
POST /api/ayushman/download              (Public)  Download ABHA card
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
- Token expires in **7 days**
- On 401 response → redirect to login
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

### Appointments & Consultations
| Endpoint | Method | Status |
|---|---|---|
| `GET /api/appointments` | List appointments | ✅ 200 |
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
| `GET /api/tts/voices` | ⚠️ 503 | ElevenLabs service dependency |
| `GET /api/appointments/upcoming` | ⚠️ 500 | Query needs fix |

---

## Mobile App Development Notes

### Authentication Flow
1. App launch → Check for stored token
2. If token exists → Call `GET /api/users/profile` to verify
3. If 401 → Show login screen
4. Login → Store token in secure storage
5. All API calls include `Authorization: Bearer <token>`

### Push Notification Flow
1. Initialize Firebase in mobile app
2. Get FCM token from Firebase
3. Call `POST /api/fcm/register-token` with device info
4. Handle incoming notifications by `type` field
5. On token refresh → re-register
6. On logout → call `POST /api/fcm/remove-token`

### Video Call Flow
1. Receive FCM notification `type: "video_call"`
2. Show incoming call UI
3. On accept → `GET /api/consultation/video/join/:appointmentId`
4. Use LiveKit SDK with returned `token` and `url`
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
| Apr 19, 2026 | 2.1 | §3 Family member insurance CRUD (`/api/family-members/:id/insurances`); §9 Medical Reports `familyMemberId` upload + filter; §26 Insurance restructured with correct user policy path (`/api/users/my-insurances`) |
| Apr 2026 | 2.0 | §32 AI DeepTech Layer (HIS, Clinical NLP, Pre-auth, Context Bridge, Federated Learning); §33 EHR; §34 FHIR R4; §35 Pharmacy Orders; §36 Activity Tracker; §37 Offline AI Scribe; §38 Omnichannel Messaging; 30 new path prefixes ring-fenced for patient role |
| Mar 2026 | 1.0 | Initial release — 400+ patient-accessible endpoints across 55+ route files |

> This guide covers the **Mediczy patient/user role** API surface only. Admin, doctor, hospital, and insurance-company APIs are documented separately.
