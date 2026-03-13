# Mediczy Patient Mobile App — Complete API Integration Guide

> **Base URL:** `https://mediqzy.com/api`  
> **Auth:** JWT Bearer Token in `Authorization` header  
> **Content-Type:** `application/json`  
> **Socket.IO:** `wss://mediqzy.com` (path: `/socket.io`)  
> **Rate Limits:** Global 300/15min, Auth 10/15min, AI 60/15min

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Profile](#2-user-profile)
3. [Family Members](#3-family-members)
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
32. [Socket.IO Real-Time Events](#32-socketio-real-time-events)
33. [Error Handling Reference](#33-error-handling-reference)
34. [Endpoint Status Summary](#34-endpoint-status-summary)

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

## 3. Family Members

```
GET    /api/family-members       🔐  List family members
GET    /api/family-members/limits 🔐  Get limits (max members allowed)
POST   /api/family-members       🔐  Add family member
PUT    /api/family-members/:id   🔐  Update family member
DELETE /api/family-members/:id   🔐  Remove family member
GET    /api/family-members/:id   🔐  Get family member details
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
       Body: multipart/form-data { file, title, description, reportType, reportDate }
GET    /api/reports         🔐  List my reports
GET    /api/reports/:id     🔐  Report detail
DELETE /api/reports/:id     🔐  Delete report
GET    /api/reports/download/:filename 🔐  Download report file
```

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

```
GET  /api/insurance/providers                (Public)  List insurance providers
GET  /api/insurance/policies/:providerId     (Public)  Provider policies
GET  /api/insurance/my/insurances            🔐  My insurance policies
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

## 32. Socket.IO Real-Time Events

### Connection Setup
```javascript
import { io } from "socket.io-client";

const socket = io("https://mediqzy.com", {
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

## 33. Error Handling Reference

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

## 34. Endpoint Status Summary

### Verified Working (200) ✅
| Feature | Endpoint | Status |
|---|---|---|
| Login | `POST /api/auth/login` | ✅ 200 |
| Profile | `GET /api/users/profile` | ✅ 200 |
| Appointments | `GET /api/appointments` | ✅ 200 |
| Prescriptions | `GET /api/prescriptions/patient` | ✅ 200 |
| Prescriptions All | `GET /api/prescriptions/my/all` | ✅ 200 |
| Wallet | `GET /api/wallet` | ✅ 200 |
| Wallet Txns | `GET /api/wallet/transactions` | ✅ 200 |
| Notifications | `GET /api/notifications` | ✅ 200 |
| Lab Tests | `GET /api/lab-tests` | ✅ 200 |
| Reports | `GET /api/reports` | ✅ 200 |
| Doctors Search | `GET /api/doctors/search` | ✅ 200 |
| Lab Search | `GET /api/labs/` | ✅ 200 |
| AI Health | `GET /api/medical-ai/health` | ✅ 200 |
| Triage Doctors | `GET /api/medical-ai/triage-doctors` | ✅ 200 |
| Family Members | `GET /api/family-members` | ✅ 200 |
| Health Diary | `GET /api/health-diary` | ✅ 200 |
| Health Summary | `GET /api/medical-ai/health-summary` | ✅ 200 |
| Membership | `GET /api/membership/plans` | ✅ 200 |
| Cart | `GET /api/cart` | ✅ 200 |
| Addresses | `GET /api/addresses` | ✅ 200 |
| Corporate Benefits | `GET /api/corporate/my-benefits` | ✅ 200 |
| Leaderboard | `GET /api/leaderboard/goals` | ✅ 200 |
| Masterdata | `GET /api/masterdata/specialties` | ✅ 200 |
| FCM Register | `POST /api/fcm/register-token` | ✅ Ready |

### Known Issues
| Endpoint | Status | Note |
|---|---|---|
| `GET /api/billing/orders` | 500 | DB table may need migration |
| `GET /api/insurance/my/insurances` | 500 | DB table may need migration |
| `GET /api/tts/voices` | 503 | ElevenLabs service dependency |
| `GET /api/appointments/upcoming` | 500 | Query needs fix |

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

*Generated: March 2026 | Audit includes 360+ patient-accessible endpoints across 50+ route files*
*Ring-fencing updated: 30 new path prefixes added for patient/user role*
