# Mediczy — Doctor Mobile App API Reference

> **Base URL:** `https://mediqzy.com/api` (production) · `http://localhost:8000/api` (dev)
>
> **Auth Header:** `Authorization: Bearer <JWT>`
>
> **JWT Payload:** `{ id, email, role: "doctor" }` · Expires in `7d`
>
> **Rate Limits:** Auth endpoints: 10 req / 15 min · Global: 300 req / 15 min · AI: 60 req / 15 min

---

## Table of Contents

1. [Authentication & OAuth](#1-authentication--oauth)
2. [Doctor Profile & Settings](#2-doctor-profile--settings)
3. [Availability & Scheduling](#3-availability--scheduling)
4. [Appointments](#4-appointments)
5. [Online Consultation Flow](#5-online-consultation-flow)
6. [Video Calling](#6-video-calling)
7. [Prescriptions](#7-prescriptions)
8. [Patients](#8-patients)
9. [Messaging / Chat (REST)](#9-messaging--chat-rest)
10. [Notifications & FCM](#10-notifications--fcm)
11. [Call Notifications](#11-call-notifications)
12. [AI Scribe & Vision](#12-ai-scribe--vision)
13. [Offline Scribe](#13-offline-scribe)
14. [Clinical Workflow](#14-clinical-workflow)
15. [Recordings](#15-recordings)
16. [Consultation Recordings & Transcription](#16-consultation-recordings--transcription)
17. [Wallet / Health Coins](#17-wallet--health-coins)
18. [Webinars](#18-webinars)
19. [Document Templates & Invoices](#19-document-templates--invoices)
20. [Triage / Emergency](#20-triage--emergency)
21. [Health Monitoring](#21-health-monitoring)
22. [Doctor Services (Second Opinion / Home Visits)](#22-doctor-services)
23. [Attached Pharmacies & Labs](#23-attached-pharmacies--labs)
24. [File Uploads](#24-file-uploads)
25. [Alerts](#25-alerts)
26. [OTP](#26-otp)
27. [Socket.IO Real-time Events](#27-socketio-real-time-events)
28. [Auth Middleware Reference](#28-auth-middleware-reference)

---

## 1. Authentication & OAuth

### 1.1 Register

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/register` |
| **Auth** | None |
| **Request Body** | `{ email, password, firstName, lastName, phoneNumber, specialization }` — Enhanced variant also accepts `registrationNumber`, `medicalCouncil` |
| **Response** | `{ success: true, token: "<JWT>", doctor: { id, email, firstName, lastName, ... } }` |
| **Notes** | Password hashed with bcrypt (10 rounds). Creates wallet + default settings. Duplicate email returns 400. |

### 1.2 Login

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/login` |
| **Auth** | None |
| **Rate Limit** | 10 req / 15 min per IP |
| **Request Body** | `{ email, password }` |
| **Response** | `{ success: true, token: "<JWT>", doctor: { id, email, firstName, lastName, specialization, isVerified, ... } }` |
| **Notes** | Returns 401 for invalid credentials. Check `isVerified` — unverified doctors may have limited access. |

### 1.3 Google OAuth

| | |
|---|---|
| **Method + URL** | `GET /api/auth/doctor/google` |
| **Auth** | None (browser redirect flow) |
| **Response** | Redirects to Google → callback at `GET /api/auth/doctor/google/callback` → redirects to app with token in URL |
| **Notes** | Scope: `profile, email`. Uses Passport.js `google-doctor` strategy. |

### 1.4 Facebook OAuth

| | |
|---|---|
| **Method + URL** | `GET /api/auth/doctor/facebook` |
| **Auth** | None (browser redirect flow) |
| **Response** | Callback at `GET /api/auth/doctor/facebook/callback` → redirects with token |
| **Notes** | Scope: `email, public_profile`. Uses Passport.js `facebook-doctor` strategy. |

### 1.5 OAuth Status Check

| | |
|---|---|
| **Method + URL** | `GET /api/auth/doctor/oauth/status` |
| **Auth** | None |
| **Response** | `{ google: { configured, url, enabled }, facebook: { configured, url, enabled } }` |

### 1.6 Token Refresh

| | |
|---|---|
| **Method + URL** | `POST /api/auth/refresh` |
| **Auth** | Refresh token in body |
| **Request Body** | `{ refreshToken }` |
| **Response** | `{ success: true, token: "<new_JWT>", refreshToken: "<new_refresh>" }` |

### 1.7 Revoke Token (Logout)

| | |
|---|---|
| **Method + URL** | `POST /api/auth/revoke` |
| **Auth** | `Bearer <JWT>` |
| **Response** | `{ success: true, message: "Token revoked" }` |

### 1.8 Logout All Devices

| | |
|---|---|
| **Method + URL** | `POST /api/auth/logout-all` |
| **Auth** | `Bearer <JWT>` |
| **Response** | `{ success: true, message: "All sessions revoked" }` |

---

## 2. Doctor Profile & Settings

### 2.1 Get Profile

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/profile` |
| **Auth** | `authDoctor` or `authUser + role:doctor` |
| **Response** | `{ success: true, doctor: { id, email, firstName, lastName, phoneNumber, specialization, registrationNumber, medicalCouncil, profilePicture, digitalSignature, rating, totalConsultations, isVerified, consultationTypes, weeklyAvailability, ... } }` |

### 2.2 Update Profile

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/profile` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ firstName, lastName, phoneNumber, specialization, qualifications, experience, bio, consultationFee, ... }` (partial updates allowed) |
| **Response** | `{ success: true, doctor: { ...updated } }` |

### 2.3 Update Online/Offline Status

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/status` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ isOnline: true/false }` |
| **Response** | `{ success: true, status: "online" | "offline" }` |

### 2.4 Update Consultation Types & Fees

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/consultation-types` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ consultationTypes: [{ type: "video"|"audio"|"chat"|"in-person", fee, duration, isAvailable }] }` |
| **Response** | `{ success: true, consultationTypes: [...] }` |

### 2.5 Get Settings

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/settings` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, settings: { profile: {...}, practice: {...}, notifications: {...} } }` |

### 2.6 Update Settings

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/settings` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ profile: {...}, practice: {...}, notifications: {...} }` (partial) |
| **Response** | `{ success: true, settings: { ...updated } }` |

### 2.7 Dashboard Stats

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/dashboard/stats` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, stats: { totalPatients, totalConsultations, rating, responseRate, todayAppointments, pendingAppointments } }` |

### 2.8 Analytics

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/analytics` |
| **Auth** | `authDoctor` |
| **Query Params** | `?period=week|month|year` |
| **Response** | `{ success: true, analytics: { appointmentsByStatus: {...}, appointmentsByDay: [...], totalRevenue, averageRating } }` |

### 2.9 Appointment Config

| | |
|---|---|
| **Method + URL** | `GET /api/doctor-settings/appointment-config` |
| **Auth** | `authUser + role:doctor` |
| **Response** | `{ success: true, config: { slotDuration, weeklySchedule: { monday: { isWorking, slots: [...] }, ... }, fees, offDays, bufferTime } }` |

### 2.10 Update Appointment Config

| | |
|---|---|
| **Method + URL** | `PUT /api/doctor-settings/appointment-config` |
| **Auth** | `authUser` |
| **Request Body** | `{ slotDuration, weeklySchedule: {...}, fees: { consultation, followUp }, bufferTime, offDays: [...] }` |
| **Response** | `{ success: true, config: { ...updated } }` |

### 2.11 Update Slot Duration

| | |
|---|---|
| **Method + URL** | `PUT /api/doctor-settings/slot-duration` |
| **Auth** | `authUser` |
| **Request Body** | `{ slotDuration: 15|20|30|45|60 }` |
| **Response** | `{ success: true }` |

### 2.12 Update Day Schedule

| | |
|---|---|
| **Method + URL** | `PUT /api/doctor-settings/weekly-schedule/:day` |
| **Auth** | `authUser` |
| **Params** | `day` = monday–sunday |
| **Request Body** | `{ isWorking: true, slots: [{ start: "09:00", end: "17:00" }] }` |
| **Response** | `{ success: true }` |

### 2.13 Update Off Days

| | |
|---|---|
| **Method + URL** | `PUT /api/doctor-settings/off-days` |
| **Auth** | `authUser` |
| **Request Body** | `{ offDays: ["2025-01-15", "2025-01-20"] }` |
| **Response** | `{ success: true }` |

### 2.14 Get Public Doctor Profile

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/:doctorId/public` |
| **Auth** | None (public) |
| **Response** | `{ success: true, doctor: { id, firstName, lastName, specialization, rating, consultationFee, consultationTypes, isOnline, ... } }` |

### 2.15 Search Doctors

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/search` |
| **Auth** | None (public) |
| **Query Params** | `?q=name&specialization=...&minRating=4&maxFee=500&isOnline=true&page=1&limit=10` |
| **Response** | `{ success: true, doctors: [...], pagination: { total, page, limit, pages } }` |

### 2.16 List Available Doctors

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/available` |
| **Auth** | None (public) |
| **Response** | `{ success: true, doctors: [...] }` |
| **Notes** | Filters by `isOnline: true` and verified status. |

### 2.17 List All Doctors

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/` |
| **Auth** | None (public) |
| **Query Params** | `?specialization=&page=1&limit=10` |
| **Response** | `{ success: true, doctors: [...], pagination: {...} }` |

---

## 3. Availability & Scheduling

### 3.1 Get Doctor Availability

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/:doctorId/availability` |
| **Auth** | None (public) |
| **Response** | `{ success: true, availability: { weeklySchedule: {...}, offDays: [...] } }` |

### 3.2 Get Available Slots

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/:doctorId/available-slots` |
| **Auth** | None (public) |
| **Query Params** | `?date=2025-01-15` |
| **Response** | `{ success: true, slots: [{ time: "09:00", available: true }, ...], date, doctorId }` |

### 3.3 Get User Slots (Booking Page)

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/:doctorId/user-slots` |
| **Auth** | None (public) |
| **Query Params** | `?date=2025-01-15` |
| **Response** | `{ success: true, slots: [...], doctor: { name, specialization, fee } }` |

### 3.4 Set Availability

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/:doctorId/availability` |
| **Auth** | `authUser` |
| **Request Body** | `{ dayOfWeek: 1-7, startTime: "09:00", endTime: "17:00", slotDuration: 30 }` |
| **Response** | `{ success: true, schedule: {...} }` |

### 3.5 Bulk Set Availability

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/:doctorId/availability/bulk` |
| **Auth** | `authUser` |
| **Request Body** | `{ schedules: [{ dayOfWeek, startTime, endTime, slotDuration }] }` |
| **Response** | `{ success: true, schedules: [...] }` |

### 3.6 Update Availability

| | |
|---|---|
| **Method + URL** | `PATCH /api/doctors/:doctorId/availability/:scheduleId` |
| **Auth** | `authUser` |
| **Request Body** | `{ startTime, endTime, slotDuration, isActive }` |
| **Response** | `{ success: true, schedule: {...} }` |

### 3.7 Delete Availability

| | |
|---|---|
| **Method + URL** | `DELETE /api/doctors/:doctorId/availability/:scheduleId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true }` |

### 3.8 Update Weekly Availability

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/availability` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ weeklyAvailability: { monday: { isWorking, slots: [...] }, ... } }` |
| **Response** | `{ success: true, availability: {...} }` |

### 3.9 Availability Dashboard

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/availability/dashboard` |
| **Auth** | `authUser + role:doctor` |
| **Response** | `{ success: true, dashboard: { weeklySchedule, nextAvailable, totalSlots, bookedSlots, availableSlots } }` |

### 3.10 Bulk Update Availability

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/availability/bulk-update` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ weeklySchedule: { monday: {...}, ... } }` |
| **Response** | `{ success: true }` |

### 3.11 Quick Setup Availability

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/availability/quick-setup` |
| **Auth** | `authUser` |
| **Request Body** | `{ template: "weekdays-only"|"weekend-only"|"full-week"|"custom", startTime: "09:00", endTime: "17:00", slotDuration: 30 }` |
| **Response** | `{ success: true, availability: {...} }` |

### 3.12 Get Availability Templates

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/availability/templates` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, templates: [{ name, description, schedule }] }` |

### 3.13 Clear All Slots

| | |
|---|---|
| **Method + URL** | `DELETE /api/doctors/availability/slots` |
| **Auth** | `authUser + role:doctor` |
| **Response** | `{ success: true }` |

### 3.14 Get Available Slots (Settings)

| | |
|---|---|
| **Method + URL** | `GET /api/doctor-settings/available-slots/:doctorId` |
| **Auth** | None (public) |
| **Query Params** | `?date=2025-01-15` |
| **Response** | `{ success: true, slots: [...] }` |

---

## 4. Appointments

### 4.1 Create Appointment

| | |
|---|---|
| **Method + URL** | `POST /api/appointments/` |
| **Auth** | `authUser` |
| **Request Body** | `{ doctorId, date: "2025-01-15", time: "10:00", type: "video"|"in-person"|"audio"|"chat", symptoms, notes }` |
| **Response** | `{ success: true, appointment: { id, doctorId, patientId, date, time, status: "pending", type, ... } }` |

### 4.2 Get My Appointments

| | |
|---|---|
| **Method + URL** | `GET /api/appointments/` or `GET /api/appointments/my-appointments` |
| **Auth** | `authUser` |
| **Query Params** | `?status=pending|confirmed|completed|cancelled&page=1&limit=10` |
| **Response** | `{ success: true, appointments: [...], pagination: {...} }` |

### 4.3 Get Doctor's Appointments

| | |
|---|---|
| **Method + URL** | `GET /api/appointments/doctor` |
| **Auth** | `authUser + role:doctor` |
| **Query Params** | `?status=...&date=2025-01-15&page=1&limit=10` |
| **Response** | `{ success: true, appointments: [...], pagination: {...} }` |

### 4.4 Get Doctor's Appointments (from doctor.route.js)

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/appointments` |
| **Auth** | `authDoctor` |
| **Query Params** | `?status=pending|confirmed|completed|cancelled&date=2025-01-15&upcoming=true` |
| **Response** | `{ success: true, appointments: [...] }` |

### 4.5 Get Today's Appointments

| | |
|---|---|
| **Method + URL** | `GET /api/appointments/doctor/today` |
| **Auth** | `authUser + role:doctor` |
| **Response** | `{ success: true, appointments: [...] }` |

### 4.6 Get Appointment by ID

| | |
|---|---|
| **Method + URL** | `GET /api/appointments/:id` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, appointment: { id, doctorId, patientId, date, time, status, type, symptoms, notes, prescription, ... } }` |

### 4.7 Cancel Appointment

| | |
|---|---|
| **Method + URL** | `PATCH /api/appointments/:id/cancel` or `DELETE /api/appointments/:id` |
| **Auth** | `authUser` |
| **Request Body** | `{ reason }` (optional) |
| **Response** | `{ success: true, appointment: { ...status: "cancelled" } }` |

### 4.8 Reschedule Appointment

| | |
|---|---|
| **Method + URL** | `PATCH /api/appointments/:id/reschedule` |
| **Auth** | `authUser` |
| **Request Body** | `{ date: "2025-01-20", time: "14:00" }` |
| **Response** | `{ success: true, appointment: { ...updated } }` |

### 4.9 Update Appointment Status

| | |
|---|---|
| **Method + URL** | `PATCH /api/appointments/:id/status` |
| **Auth** | `authUser` (doctor or admin only) |
| **Request Body** | `{ status: "confirmed"|"in-progress"|"completed"|"cancelled"|"no-show" }` |
| **Response** | `{ success: true, appointment: { ...updated } }` |

### 4.10 Complete Appointment

| | |
|---|---|
| **Method + URL** | `POST /api/appointments/:id/complete` |
| **Auth** | `authUser` |
| **Request Body** | `{ notes, diagnosis, followUpDate }` (optional) |
| **Response** | `{ success: true, appointment: { ...status: "completed" } }` |

### 4.11 Complete with Prescription

| | |
|---|---|
| **Method + URL** | `POST /api/appointments/:id/complete-with-prescription` |
| **Auth** | `authUser` |
| **Request Body** | `{ notes, diagnosis, medications: [...], followUpDate }` |
| **Response** | `{ success: true, appointment: { ...status: "completed" }, prescription: { id, ... } }` |
| **Notes** | Auto-creates a prescription draft linked to the appointment. |

### 4.12 Submit Rating

| | |
|---|---|
| **Method + URL** | `PATCH /api/appointments/:id/rating` or `POST /api/appointments/:id/rating` |
| **Auth** | `authUser` |
| **Request Body** | `{ rating: 1-5, review: "..." }` |
| **Response** | `{ success: true, appointment: { ...rating, review } }` |

### 4.13 Update Payment Status

| | |
|---|---|
| **Method + URL** | `PATCH /api/appointments/:id/payment` |
| **Auth** | `authUser` |
| **Request Body** | `{ paymentStatus: "paid"|"pending"|"failed", paymentMethod, transactionId }` |
| **Response** | `{ success: true, appointment: { ...updated } }` |

### 4.14 Send Reminder

| | |
|---|---|
| **Method + URL** | `POST /api/appointments/:id/remind` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, message: "Reminder sent" }` |
| **Notes** | Sends push notification via FCM + in-app notification. |

### 4.15 Download Calendar Event

| | |
|---|---|
| **Method + URL** | `GET /api/appointments/:id/calendar` |
| **Auth** | `authUser` |
| **Response** | iCal (.ics) file download |

### 4.16 Basic Analytics

| | |
|---|---|
| **Method + URL** | `GET /api/appointments/analytics/basic` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, analytics: { total, completed, cancelled, noShow, avgRating } }` |

### 4.17 Enhanced: Book Appointment

| | |
|---|---|
| **Method + URL** | `POST /api/enhanced-appointments/book` |
| **Auth** | `authUser` |
| **Request Body** | `{ doctorId, date, time, type, symptoms, ... }` |
| **Response** | `{ success: true, appointment: {...} }` |

### 4.18 Enhanced: Get Available Slots

| | |
|---|---|
| **Method + URL** | `GET /api/enhanced-appointments/available-slots` |
| **Auth** | None |
| **Query Params** | `?doctorId=&date=` |
| **Response** | `{ success: true, slots: [...] }` |

### 4.19 Enhanced: Get Doctor Appointments

| | |
|---|---|
| **Method + URL** | `GET /api/enhanced-appointments/doctor-appointments` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, appointments: [...] }` |

---

## 5. Online Consultation Flow

> Mounted at `/api/consultation`

### 5.1 Browse Doctors

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/doctors` |
| **Auth** | None (public) |
| **Query Params** | `?specialization=&page=&limit=` |
| **Response** | `{ success: true, doctors: [...] }` |

### 5.2 Doctor Detail

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/doctors/:id` |
| **Auth** | None (public) |
| **Response** | `{ success: true, doctor: {...} }` |

### 5.3 Doctor Slots

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/doctors/:id/slots` |
| **Auth** | None (public) |
| **Query Params** | `?date=` |
| **Response** | `{ success: true, slots: [...] }` |

### 5.4 Book Consultation

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/book` |
| **Auth** | `authUser` |
| **Request Body** | `{ doctorId, date, time, type, symptoms, ... }` (validated) |
| **Response** | `{ success: true, appointment: {...} }` |

### 5.5 Doctor: Get Pending Requests

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/doctor/requests` |
| **Auth** | `authUser` (doctor) |
| **Response** | `{ success: true, requests: [...] }` |

### 5.6 Doctor: Accept Request

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/doctor/accept/:appointmentId` |
| **Auth** | `authUser` (doctor, validated) |
| **Response** | `{ success: true, appointment: { ...status: "confirmed" } }` |
| **Notes** | Sends notification to patient. |

### 5.7 Doctor: Reject Request

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/doctor/reject/:appointmentId` |
| **Auth** | `authUser` (doctor, validated) |
| **Request Body** | `{ reason }` |
| **Response** | `{ success: true, appointment: { ...status: "rejected" } }` |

### 5.8 Doctor: Get Consultation Appointments

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/doctor/appointments` |
| **Auth** | `authUser` (doctor) |
| **Query Params** | `?status=&date=&page=&limit=` |
| **Response** | `{ success: true, appointments: [...] }` |

### 5.9 Payment: Initiate

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/payment/initiate/:appointmentId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, orderId, amount, currency }` |

### 5.10 Payment: Verify

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/payment/verify/:appointmentId` |
| **Auth** | `authUser` (validated) |
| **Request Body** | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` |
| **Response** | `{ success: true, payment: {...} }` |

### 5.11 Payment: Manual

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/payment/manual/:appointmentId` |
| **Auth** | `authUser` (validated) |
| **Request Body** | `{ paymentMethod, transactionId, amount }` |
| **Response** | `{ success: true }` |

### 5.12 Payment: Health Coin Check

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/payment/hc-check/:appointmentId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, canPayWithHC: true/false, balance, requiredAmount }` |

### 5.13 Payment: Pay with Health Coins

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/payment/hc/:appointmentId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, payment: {...} }` |

### 5.14 Video: Join Consultation

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/video/join/:appointmentId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, token: "<LiveKit_JWT>", url: "wss://livekit.server", room: "room_name", participantName }` |
| **Notes** | Generates LiveKit token. Updates appointment status to `in-progress`. |

### 5.15 Video: End Consultation

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/video/end/:appointmentId` |
| **Auth** | `authUser` (validated) |
| **Request Body** | `{ notes, duration }` |
| **Response** | `{ success: true, appointment: { ...status: "completed" } }` |

### 5.16 Consultation Chat: Conversations

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/chat/conversations` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, conversations: [...] }` |

### 5.17 Consultation Chat: Messages

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/chat/:appointmentId/messages` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, messages: [...] }` |

### 5.18 Consultation Chat: Send Message

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/chat/:appointmentId/messages` |
| **Auth** | `authUser` (validated) |
| **Request Body** | `{ message, type: "text"|"image"|"file" }` |
| **Response** | `{ success: true, message: {...} }` |

### 5.19 Consultation Chat: Mark Read

| | |
|---|---|
| **Method + URL** | `POST /api/consultation/chat/:appointmentId/read` |
| **Auth** | `authUser` |
| **Response** | `{ success: true }` |

### 5.20 Consultation Chat: Unread Count

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/chat/unread-count` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, unreadCount: 5 }` |

### 5.21 My Appointments (patient view)

| | |
|---|---|
| **Method + URL** | `GET /api/consultation/my-appointments` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, appointments: [...] }` |

---

## 6. Video Calling

> Mounted at `/api/video` — Uses LiveKit

### 6.1 Health Check

| | |
|---|---|
| **Method + URL** | `GET /api/video/health` |
| **Auth** | None |
| **Response** | `{ status: "ok", videoProvider: "livekit" }` |

### 6.2 Generate Room Token

| | |
|---|---|
| **Method + URL** | `POST /api/video/room/token` |
| **Auth** | `authUser` |
| **Request Body** | `{ roomName, participantName }` |
| **Response** | `{ success: true, token: "<LiveKit_JWT>", url: "wss://..." }` |

### 6.3 Get LiveKit Token (GET)

| | |
|---|---|
| **Method + URL** | `GET /api/video/livekit/token` |
| **Auth** | `authUser` |
| **Query Params** | `?room=&identity=` |
| **Response** | `{ token: "...", url: "wss://..." }` |

### 6.4 Get LiveKit Token (POST)

| | |
|---|---|
| **Method + URL** | `POST /api/video/livekit/token` |
| **Auth** | `authUser` |
| **Request Body** | `{ room, identity, name }` |
| **Response** | `{ token: "...", url: "wss://..." }` |

### 6.5 Join Room

| | |
|---|---|
| **Method + URL** | `POST /api/video/room/:roomId/join` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, token, room, participant }` |

### 6.6 Leave Room

| | |
|---|---|
| **Method + URL** | `POST /api/video/room/:roomId/leave` |
| **Auth** | `authUser` |
| **Response** | `{ success: true }` |

### 6.7 Room Status

| | |
|---|---|
| **Method + URL** | `GET /api/video/room/:roomId/status` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, room: { participants, isActive, duration } }` |

### 6.8 Create Invite Link

| | |
|---|---|
| **Method + URL** | `POST /api/video/room/:roomId/invite` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, inviteCode, link }` |

### 6.9 Join via Invite

| | |
|---|---|
| **Method + URL** | `GET /api/video/join/:inviteCode` |
| **Auth** | None (public) |
| **Response** | `{ success: true, token, room }` |

### 6.10 Initiate Call to Patient (from doctor.route.js)

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/appointments/:appointmentId/initiate-call` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, callData: { token, url, room, participantName }, appointment }` |
| **Notes** | Sends FCM push notification + Socket.IO event to patient. Updates appointment status. Returns LiveKit join data for doctor. |

---

## 7. Prescriptions

> Mounted at `/api/prescriptions`

### 7.1 Create Prescription

| | |
|---|---|
| **Method + URL** | `POST /api/prescriptions/` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ patientId, appointmentId, diagnosis, medications: [{ name, dosage, frequency, duration, instructions }], notes, followUpDate }` |
| **Response** | `{ success: true, prescription: { id, prescriptionNumber, ... } }` |

### 7.2 Create from Appointment

| | |
|---|---|
| **Method + URL** | `POST /api/prescriptions/from-appointment/:appointmentId` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ diagnosis, medications: [...], notes }` |
| **Response** | `{ success: true, prescription: {...} }` |
| **Notes** | Auto-fills patient info from appointment. |

### 7.3 Get Doctor's Prescriptions

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/doctor` |
| **Auth** | `authDoctor` |
| **Query Params** | `?page=1&limit=10&status=draft|issued` |
| **Response** | `{ success: true, prescriptions: [...], pagination: {...} }` |

### 7.4 Get Doctor's Issued Prescriptions

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/doctor/issued` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, prescriptions: [...] }` |

### 7.5 Get Prescription by ID

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/:id` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, prescription: { id, prescriptionNumber, doctorId, patientId, diagnosis, medications: [...], status, createdAt, ... } }` |

### 7.6 Get Prescription for Appointment

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/appointment/:appointmentId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, prescription: {...} }` |

### 7.7 Get Patient Prescriptions

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/patient/:patientId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, prescriptions: [...] }` |

### 7.8 Get Patient's Own Prescriptions

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/patient` or `GET /api/prescriptions/my/all` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, prescriptions: [...] }` |

### 7.9 Update Prescription

| | |
|---|---|
| **Method + URL** | `PUT /api/prescriptions/:id` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ diagnosis, medications: [...], notes, followUpDate }` |
| **Response** | `{ success: true, prescription: { ...updated } }` |

### 7.10 Update Prescription Status

| | |
|---|---|
| **Method + URL** | `PATCH /api/prescriptions/:id/status` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ status: "draft"|"issued"|"dispensed"|"cancelled" }` |
| **Response** | `{ success: true, prescription: { ...updated } }` |

### 7.11 Issue (Finalize) Prescription

| | |
|---|---|
| **Method + URL** | `POST /api/prescriptions/:id/issue` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, prescription: { ...status: "issued" } }` |
| **Notes** | Marks as issued, sends notification to patient. |

### 7.12 Get Prescription HTML

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/:id/html` |
| **Auth** | None (public, for rendering) |
| **Response** | HTML content of prescription (for webview rendering) |

### 7.13 Get Prescription PDF

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/:id/pdf` |
| **Auth** | None (public) |
| **Response** | PDF binary stream (`Content-Type: application/pdf`) |

### 7.14 Share Prescription

| | |
|---|---|
| **Method + URL** | `POST /api/prescriptions/:id/share` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ method: "whatsapp"|"email"|"sms", recipient }` |
| **Response** | `{ success: true, shareLink }` |

### 7.15 Get WhatsApp Share Link

| | |
|---|---|
| **Method + URL** | `GET /api/prescriptions/:id/share/whatsapp` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, whatsappLink }` |

### 7.16 Share via WhatsApp

| | |
|---|---|
| **Method + URL** | `POST /api/prescriptions/:id/share/whatsapp/:phone` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 7.17 Delete Prescription

| | |
|---|---|
| **Method + URL** | `DELETE /api/prescriptions/:id` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |
| **Notes** | Only draft prescriptions can be deleted. |

---

## 8. Patients

### 8.1 Get My Patients

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/my-patients` |
| **Auth** | `authDoctor` |
| **Query Params** | `?search=name&page=1&limit=10` |
| **Response** | `{ success: true, patients: [{ id, firstName, lastName, email, phone, lastAppointment, totalVisits, ... }], stats: { total, active, new }, pagination: {...} }` |

### 8.2 Create Patient on Behalf

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/my-patients/create` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ firstName, lastName, email, phoneNumber, dateOfBirth, gender, bloodGroup, address }` |
| **Response** | `{ success: true, patient: { id, ... }, credentials: { email, password } }` |
| **Notes** | Creates patient account, sends credentials via SMS/WhatsApp/email. Auto-generates password. |

### 8.3 Get Patients (from appointments)

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/patients` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, patients: [...] }` |
| **Notes** | Derives patient list from appointment history. |

---

## 9. Messaging / Chat (REST)

### 9.1 Doctor Messages / Inbox

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/messages` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, messages: [{ id, patientId, patientName, lastMessage, unreadCount, timestamp }] }` |

### 9.2 Get Chat with Patient

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/messages/:patientId` |
| **Auth** | `authUser + role:doctor` |
| **Query Params** | `?page=1&limit=50` |
| **Response** | `{ success: true, messages: [{ id, senderId, content, timestamp, isRead }] }` |

### 9.3 Send Message to Patient

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/messages/:patientId` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ content, type: "text"|"image"|"file" }` |
| **Response** | `{ success: true, message: { id, ... } }` |

### 9.4 Mark Message Read

| | |
|---|---|
| **Method + URL** | `PATCH /api/doctors/messages/:messageId/read` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 9.5 Reply to Message

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/messages/reply` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ messageId, content }` |
| **Response** | `{ success: true, message: {...} }` |

### 9.6 Chat Rooms (REST)

| | |
|---|---|
| **Method + URL** | `POST /api/chat/rooms` |
| **Auth** | `authUser` |
| **Request Body** | `{ participantId, participantType }` |
| **Response** | `{ success: true, room: { id, participants } }` |

### 9.7 Get Chat Rooms

| | |
|---|---|
| **Method + URL** | `GET /api/chat/rooms` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, rooms: [...] }` |

### 9.8 Get Room Messages

| | |
|---|---|
| **Method + URL** | `GET /api/chat/rooms/:roomId/messages` |
| **Auth** | `authUser` |
| **Query Params** | `?page=1&limit=50` |
| **Response** | `{ success: true, messages: [...] }` |

### 9.9 Send Room Message

| | |
|---|---|
| **Method + URL** | `POST /api/chat/rooms/:roomId/messages` |
| **Auth** | `authUser` |
| **Request Body** | `{ content, type }` |
| **Response** | `{ success: true, message: {...} }` |

### 9.10 Upload Chat File

| | |
|---|---|
| **Method + URL** | `POST /api/chat/upload` |
| **Auth** | `authUser` |
| **Request Body** | `multipart/form-data` with `file` field |
| **Response** | `{ success: true, url, fileName, fileType }` |

---

## 10. Notifications & FCM

### 10.1 Get Notifications

| | |
|---|---|
| **Method + URL** | `GET /api/notifications/` |
| **Auth** | `authUser` |
| **Query Params** | `?page=1&limit=20&type=appointment|message|system` |
| **Response** | `{ success: true, notifications: [{ id, title, body, type, data, isRead, createdAt }], pagination: {...} }` |
| **Notes** | Auto-maps `role: doctor` to `userType: doctor` for query. |

### 10.2 Unread Count

| | |
|---|---|
| **Method + URL** | `GET /api/notifications/unread-count` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, unreadCount: 5 }` |

### 10.3 Mark as Read

| | |
|---|---|
| **Method + URL** | `POST /api/notifications/:id/read` |
| **Auth** | `authUser` |
| **Response** | `{ success: true }` |

### 10.4 Mark All Read

| | |
|---|---|
| **Method + URL** | `POST /api/notifications/read-all` |
| **Auth** | `authUser` |
| **Response** | `{ success: true }` |

### 10.5 Delete Notification

| | |
|---|---|
| **Method + URL** | `DELETE /api/notifications/:id` |
| **Auth** | `authUser` |
| **Response** | `{ success: true }` |

### 10.6 Register FCM Token (via notifications)

| | |
|---|---|
| **Method + URL** | `POST /api/notifications/fcm/register` |
| **Auth** | `authUser` |
| **Request Body** | `{ token, deviceType: "android"|"ios"|"web" }` |
| **Response** | `{ success: true }` |

### 10.7 Register FCM Token (via fcm)

| | |
|---|---|
| **Method + URL** | `POST /api/fcm/register-token` |
| **Auth** | `authUser` |
| **Request Body** | `{ token, deviceType: "android"|"ios"|"web", userType: "doctor" }` |
| **Response** | `{ success: true }` |

### 10.8 Remove FCM Token

| | |
|---|---|
| **Method + URL** | `POST /api/fcm/remove-token` |
| **Auth** | `authUser` |
| **Request Body** | `{ token }` |
| **Response** | `{ success: true }` |

### 10.9 Send Video Call Notification

| | |
|---|---|
| **Method + URL** | `POST /api/fcm/send-video-call` |
| **Auth** | `authUser` |
| **Request Body** | `{ recipientId, callerName, roomName, appointmentId }` |
| **Response** | `{ success: true }` |

### 10.10 Send Message Notification

| | |
|---|---|
| **Method + URL** | `POST /api/fcm/send-message` |
| **Auth** | `authUser` |
| **Request Body** | `{ recipientId, senderName, message, conversationId }` |
| **Response** | `{ success: true }` |

### 10.11 Send Appointment Notification

| | |
|---|---|
| **Method + URL** | `POST /api/fcm/send-appointment` |
| **Auth** | `authUser` |
| **Request Body** | `{ recipientId, appointmentId, type: "booked"|"confirmed"|"reminder"|"cancelled" }` |
| **Response** | `{ success: true }` |

---

## 11. Call Notifications

> Mounted at `/api/call-notification`

### 11.1 Doctor-to-Patient Call

| | |
|---|---|
| **Method + URL** | `POST /api/call-notification/doctor-to-patient` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ patientId, appointmentId, callType: "video"|"audio" }` |
| **Response** | `{ success: true, callId, token, room }` |
| **Notes** | Sends FCM push with high-priority data payload (rings patient's phone). Also emits Socket.IO event. |

### 11.2 End Call

| | |
|---|---|
| **Method + URL** | `POST /api/call-notification/end-call` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ callId, appointmentId, duration }` |
| **Response** | `{ success: true }` |

### 11.3 Patient Status

| | |
|---|---|
| **Method + URL** | `GET /api/call-notification/patient/:patientId/status` |
| **Auth** | `authUser + role:doctor` |
| **Response** | `{ success: true, isOnline, lastSeen, hasFCMToken }` |

---

## 12. AI Scribe & Vision

### 12.1 Generate Prescription from Notes

| | |
|---|---|
| **Method + URL** | `POST /api/ai/scribe/generate-prescription` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ consultationNotes, patientId, appointmentId, specialty }` |
| **Response** | `{ success: true, prescription: { diagnosis, medications: [...], advice, followUp } }` |
| **Rate Limit** | 60 req / 15 min |

### 12.2 AI Scribe (Clinical Note Processing)

| | |
|---|---|
| **Method + URL** | `POST /api/ai/scribe/scribe` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ text, type: "soap"|"clinical"|"general", specialty }` |
| **Response** | `{ success: true, structuredNote: {...} }` |

### 12.3 Autocomplete

| | |
|---|---|
| **Method + URL** | `GET /api/ai/scribe/autocomplete` |
| **Auth** | `authDoctor` |
| **Query Params** | `?query=&type=medication|diagnosis|procedure&limit=10` |
| **Response** | `{ success: true, suggestions: [...] }` |

### 12.4 Medical Reference

| | |
|---|---|
| **Method + URL** | `GET /api/ai/scribe/reference/:type` |
| **Auth** | `authDoctor` |
| **Params** | `type` = "drug"|"condition"|"procedure" |
| **Query Params** | `?query=` |
| **Response** | `{ success: true, references: [...] }` |

### 12.5 AI Vision: Analyze Image

| | |
|---|---|
| **Method + URL** | `POST /api/ai/vision/analyze` |
| **Auth** | `authDoctor` |
| **Request Body** | `multipart/form-data` with `image` field |
| **Response** | `{ success: true, analysis: { findings, suggestions, confidence } }` |
| **Notes** | Accepts medical images (X-rays, lab reports, etc.) for AI analysis. |

### 12.6 AI Vision: Health Check

| | |
|---|---|
| **Method + URL** | `GET /api/ai/vision/health` |
| **Auth** | None |
| **Response** | `{ status: "ok", model: "..." }` |

### 12.7 Scribe (Public / Legacy)

| | |
|---|---|
| **Method + URL** | `GET /api/scribe/health` |
| **Auth** | None |
| **Response** | `{ status: "ok" }` |

### 12.8 Scribe: Get Specialties

| | |
|---|---|
| **Method + URL** | `GET /api/scribe/specialties` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, specialties: [...] }` |

### 12.9 Scribe: Get Template

| | |
|---|---|
| **Method + URL** | `GET /api/scribe/template/:specialty` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, template: { fields, sections } }` |

### 12.10 Scribe: Transcribe Audio

| | |
|---|---|
| **Method + URL** | `POST /api/scribe/transcribe` |
| **Auth** | None (public) |
| **Request Body** | `multipart/form-data` with `audio` file |
| **Response** | `{ success: true, transcription: "..." }` |

### 12.11 Scribe: Expand Abbreviations

| | |
|---|---|
| **Method + URL** | `POST /api/scribe/expand-abbreviations` |
| **Auth** | None |
| **Request Body** | `{ text, specialty }` |
| **Response** | `{ success: true, expanded: "..." }` |

### 12.12 Scribe: Process Text

| | |
|---|---|
| **Method + URL** | `POST /api/scribe/process` |
| **Auth** | None |
| **Request Body** | `{ text, specialty, outputFormat }` |
| **Response** | `{ success: true, processed: {...} }` |

### 12.13 Scribe: Generate Summary

| | |
|---|---|
| **Method + URL** | `POST /api/scribe/generate-summary` |
| **Auth** | None |
| **Request Body** | `{ text, type }` |
| **Response** | `{ success: true, summary: "..." }` |

### 12.14 Scribe: Analyze Text

| | |
|---|---|
| **Method + URL** | `POST /api/scribe/analyze-text` |
| **Auth** | None |
| **Request Body** | `{ text }` |
| **Response** | `{ success: true, analysis: {...} }` |

### 12.15 Scribe: GPU Stats

| | |
|---|---|
| **Method + URL** | `GET /api/scribe/gpu-stats` |
| **Auth** | None |
| **Response** | `{ ...gpuUsage }` |

### 12.16 Scribe: Stats

| | |
|---|---|
| **Method + URL** | `GET /api/scribe/stats` |
| **Auth** | None |
| **Response** | `{ ...systemStats }` |

---

## 13. Offline Scribe

> Mounted at `/api/offline-scribe` — Requires `requireScribeAccess` middleware

### 13.1 Health

| | |
|---|---|
| **Method + URL** | `GET /api/offline-scribe/health` |
| **Auth** | None |

### 13.2 Supported Languages

| | |
|---|---|
| **Method + URL** | `GET /api/offline-scribe/languages` |
| **Auth** | None |
| **Response** | `{ languages: [...] }` |

### 13.3 Templates

| | |
|---|---|
| **Method + URL** | `GET /api/offline-scribe/templates` |
| **Auth** | None |
| **Response** | `{ templates: [...] }` |

### 13.4 Transcribe Audio

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/transcribe` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `multipart/form-data` with `audio` file |
| **Response** | `{ success: true, transcription: "..." }` |

### 13.5 Normalize Text

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/normalize` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `{ text, language }` |
| **Response** | `{ success: true, normalized: "..." }` |

### 13.6 Generate Prescription

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/prescription` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `{ transcription, patientInfo, specialty }` |
| **Response** | `{ success: true, prescription: {...} }` |

### 13.7 Generate OPD Notes

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/opd-notes` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `{ transcription, specialty }` |
| **Response** | `{ success: true, opdNotes: {...} }` |

### 13.8 Generate IPD Notes

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/ipd-notes` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `{ transcription, specialty }` |
| **Response** | `{ success: true, ipdNotes: {...} }` |

### 13.9 Generate Discharge Summary

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/discharge` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `{ transcription, patientInfo }` |
| **Response** | `{ success: true, dischargeSummary: {...} }` |

### 13.10 Full Pipeline (Audio → Prescription)

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/full-pipeline` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `multipart/form-data` with `audio` file + `specialty`, `language` fields |
| **Response** | `{ success: true, transcription, prescription, opdNotes }` |
| **Notes** | End-to-end: transcribe → normalize → generate prescription in one call. |

### 13.11 Batch Processing

| | |
|---|---|
| **Method + URL** | `POST /api/offline-scribe/batch` |
| **Auth** | `authUser + requireScribeAccess` |
| **Request Body** | `{ items: [{ text, type }] }` |
| **Response** | `{ success: true, results: [...] }` |

### 13.12 Status

| | |
|---|---|
| **Method + URL** | `GET /api/offline-scribe/status` |
| **Auth** | `authUser + requireScribeAccess` |
| **Response** | `{ status, queueLength, processingTime }` |

---

## 14. Clinical Workflow

> Mounted at `/api/doctor/clinical-workflow`

### 14.1 Create Clinical Notes

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/clinical-workflow/notes` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ patientId, appointmentId, subjective, objective, assessment, plan, type: "soap"|"progress"|"procedure" }` |
| **Response** | `{ success: true, note: { id, ... } }` |

### 14.2 AI Generate Summary

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/clinical-workflow/notes/:id/generate-summary` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, summary: "..." }` |

### 14.3 Get Patient Clinical Notes

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/clinical-workflow/notes/patient/:patientId` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, notes: [...] }` |

### 14.4 Sign Clinical Notes

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/clinical-workflow/notes/:id/sign` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, note: { ...signed: true, signedAt } }` |
| **Notes** | Digitally signs the note, making it immutable. |

### 14.5 Search ICD-10 Codes

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/clinical-workflow/icd10/search` |
| **Auth** | `authDoctor` |
| **Query Params** | `?query=diabetes&limit=10` |
| **Response** | `{ success: true, codes: [{ code: "E11", description: "Type 2 diabetes mellitus" }] }` |

### 14.6 Search CPT Codes

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/clinical-workflow/cpt/search` |
| **Auth** | `authDoctor` |
| **Query Params** | `?query=consultation&limit=10` |
| **Response** | `{ success: true, codes: [{ code: "99213", description: "Office visit, established patient" }] }` |

---

## 15. Recordings

> Mounted at `/api/recordings`

### 15.1 Start Recording

| | |
|---|---|
| **Method + URL** | `POST /api/recordings/start` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ appointmentId, roomName }` |
| **Response** | `{ success: true, recordingId }` |

### 15.2 Upload Recording

| | |
|---|---|
| **Method + URL** | `POST /api/recordings/upload` |
| **Auth** | `authDoctor` |
| **Request Body** | `multipart/form-data` with recording file |
| **Response** | `{ success: true, recording: { id, url, duration } }` |

### 15.3 Get Recordings for Appointment

| | |
|---|---|
| **Method + URL** | `GET /api/recordings/appointment/:appointmentId` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, recordings: [...] }` |

### 15.4 Download Recording

| | |
|---|---|
| **Method + URL** | `GET /api/recordings/download/:recordingId` |
| **Auth** | `authUser` |
| **Response** | Binary file stream |

### 15.5 Stream Recording

| | |
|---|---|
| **Method + URL** | `GET /api/recordings/stream/:recordingId` |
| **Auth** | `authUser` |
| **Response** | Audio/video stream (supports range requests) |

### 15.6 Delete Recording

| | |
|---|---|
| **Method + URL** | `DELETE /api/recordings/:recordingId` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 15.7 List Doctor's Recordings

| | |
|---|---|
| **Method + URL** | `GET /api/recordings/doctor/list` |
| **Auth** | `authDoctor` |
| **Query Params** | `?page=1&limit=10` |
| **Response** | `{ success: true, recordings: [...], pagination: {...} }` |

---

## 16. Consultation Recordings & Transcription

> Mounted at `/api/consultation-recordings`

### 16.1 Start Recording

| | |
|---|---|
| **Method + URL** | `POST /api/consultation-recordings/start` |
| **Auth** | `authDoctor` (validated) |
| **Request Body** | `{ appointmentId, roomName }` |
| **Response** | `{ success: true, recordingId }` |

### 16.2 Stop Recording

| | |
|---|---|
| **Method + URL** | `POST /api/consultation-recordings/stop/:recordingId` |
| **Auth** | `authDoctor` (validated) |
| **Response** | `{ success: true, recording: { id, duration, filePath } }` |

### 16.3 Get Recordings for Appointment

| | |
|---|---|
| **Method + URL** | `GET /api/consultation-recordings/appointment/:appointmentId` |
| **Auth** | `authDoctor` (validated) |
| **Response** | `{ success: true, recordings: [...] }` |

### 16.4 Get Doctor's Recordings

| | |
|---|---|
| **Method + URL** | `GET /api/consultation-recordings/doctor` |
| **Auth** | `authDoctor` (validated) |
| **Query Params** | `?page=1&limit=10` |
| **Response** | `{ success: true, recordings: [...], pagination: {...} }` |

### 16.5 Get Recording by ID

| | |
|---|---|
| **Method + URL** | `GET /api/consultation-recordings/:id` |
| **Auth** | `authDoctor` (validated) |
| **Response** | `{ success: true, recording: { id, appointmentId, duration, transcription, ... } }` |

### 16.6 Delete Recording

| | |
|---|---|
| **Method + URL** | `DELETE /api/consultation-recordings/:id` |
| **Auth** | `authDoctor` (validated) |
| **Response** | `{ success: true }` |

### 16.7 Transcribe Recording

| | |
|---|---|
| **Method + URL** | `POST /api/consultation-recordings/:id/transcribe` |
| **Auth** | `authDoctor` (validated) |
| **Response** | `{ success: true, transcription: "...", processing: true/false }` |
| **Notes** | Triggers async transcription. Poll the recording GET endpoint for results. |

---

## 17. Wallet / Health Coins

> Mounted at `/api/wallet` — primarily patient-facing but doctors can check balance

### 17.1 Get Wallet Summary

| | |
|---|---|
| **Method + URL** | `GET /api/wallet/` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, wallet: { balance, totalEarned, totalSpent, tier } }` |

### 17.2 Get Balance

| | |
|---|---|
| **Method + URL** | `GET /api/wallet/balance` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, balance: 500 }` |

### 17.3 Transaction History

| | |
|---|---|
| **Method + URL** | `GET /api/wallet/transactions` |
| **Auth** | `authUser` |
| **Query Params** | `?page=1&limit=20&type=earn|spend` |
| **Response** | `{ success: true, transactions: [...], pagination: {...} }` |

### 17.4 Calculate Appointment Cost

| | |
|---|---|
| **Method + URL** | `GET /api/wallet/appointment/calculate/:consultationFee` |
| **Auth** | `authUser` |
| **Response** | `{ success: true, fee, discount, hcAmount, finalAmount }` |

### 17.5 Can Pay with HC

| | |
|---|---|
| **Method + URL** | `POST /api/wallet/appointment/can-pay` |
| **Auth** | `authUser` |
| **Request Body** | `{ consultationFee }` |
| **Response** | `{ success: true, canPay: true/false, balance, required }` |

### 17.6 Pay for Appointment with HC

| | |
|---|---|
| **Method + URL** | `POST /api/wallet/appointment/pay` |
| **Auth** | `authUser` |
| **Request Body** | `{ appointmentId, consultationFee }` |
| **Response** | `{ success: true, transaction: {...} }` |

### 17.7 Refund Appointment

| | |
|---|---|
| **Method + URL** | `POST /api/wallet/appointment/refund` |
| **Auth** | `authUser` |
| **Request Body** | `{ appointmentId }` |
| **Response** | `{ success: true, refunded: true }` |

---

## 18. Webinars

> Mounted at `/api/doctor/webinars`

### 18.1 My Webinars

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/webinars/my-webinars` |
| **Auth** | `authDoctor` (assumed) |
| **Response** | `{ success: true, webinars: [...] }` |

### 18.2 Get Webinar Details

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/webinars/webinars/:id` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, webinar: { id, title, description, scheduledAt, status, attendeeCount } }` |

### 18.3 Start Webinar

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/webinars/webinars/:id/start` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, webinar: { ...status: "live" }, token }` |

### 18.4 End Webinar

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/webinars/webinars/:id/end` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, webinar: { ...status: "ended" } }` |

### 18.5 Start Recording

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/webinars/webinars/:id/start-recording` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 18.6 Stop Recording

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/webinars/webinars/:id/stop-recording` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 18.7 Get Attendees

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/webinars/webinars/:id/attendees` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, attendees: [...] }` |

### 18.8 Get Questions

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/webinars/webinars/:id/questions` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, questions: [...] }` |

### 18.9 Answer Question

| | |
|---|---|
| **Method + URL** | `POST /api/doctor/webinars/webinars/:id/questions/:questionId/answer` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ answer }` |
| **Response** | `{ success: true }` |

### 18.10 Get Recordings

| | |
|---|---|
| **Method + URL** | `GET /api/doctor/webinars/webinars/:id/recordings` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, recordings: [...] }` |

---

## 19. Document Templates & Invoices

### 19.1 Get Templates

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/templates` |
| **Auth** | `authDoctor` |
| **Query Params** | `?type=prescription|invoice|referral` |
| **Response** | `{ success: true, templates: [{ id, name, type, content, isDefault }] }` |

### 19.2 Create Template

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/templates` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ name, type, content, isDefault }` |
| **Response** | `{ success: true, template: {...} }` |

### 19.3 Update Template

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/templates/:templateId` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ name, content, isDefault }` |
| **Response** | `{ success: true, template: { ...updated } }` |

### 19.4 Delete Template

| | |
|---|---|
| **Method + URL** | `DELETE /api/doctors/templates/:templateId` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 19.5 Get Template Settings (Logo, Seal, Signature)

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/template-settings` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, settings: { logo, seal, signature, clinicName, clinicAddress } }` |

### 19.6 Update Template Settings

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/template-settings` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ logo, seal, signature, clinicName, clinicAddress }` |
| **Response** | `{ success: true, settings: { ...updated } }` |

### 19.7 Create Invoice

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/appointments/:appointmentId/invoice` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ items: [{ description, amount }], tax, discount, notes }` |
| **Response** | `{ success: true, invoice: { invoiceNumber, total, ... } }` |

### 19.8 Get All Invoices

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/invoices` |
| **Auth** | `authDoctor` |
| **Query Params** | `?page=1&limit=10&status=paid|unpaid` |
| **Response** | `{ success: true, invoices: [...], pagination: {...} }` |

### 19.9 Get Invoice

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/invoices/:invoiceNumber` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, invoice: { invoiceNumber, items, total, status, patient, ... } }` |

### 19.10 Update Invoice Status

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/invoices/:invoiceNumber/status` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ status: "paid"|"unpaid"|"cancelled" }` |
| **Response** | `{ success: true, invoice: { ...updated } }` |

---

## 20. Triage / Emergency

### 20.1 Get Triage Cases

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/triage/cases` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, cases: [{ id, patientName, severity, symptoms, status, createdAt }] }` |

### 20.2 Get Triage Stats

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/triage/stats` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, stats: { total, pending, accepted, resolved } }` |

### 20.3 Accept Triage Case

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/triage/cases/:caseId/accept` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, case: { ...status: "accepted" } }` |

### 20.4 Respond to Triage Case

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/triage/cases/:caseId/respond` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ action: "prescribe"|"schedule"|"refer"|"ambulance"|"self_care"|"escalate", details, prescription, referralInfo }` |
| **Response** | `{ success: true, case: { ...status: "responded", action } }` |

### 20.5 Accept Triage Call

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/triage/accept-call` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ caseId, callType }` |
| **Response** | `{ success: true, callData: { token, url, room } }` |
| **Notes** | Returns LiveKit token for emergency video call. |

### 20.6 Reject Triage Call

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/triage/reject-call` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ caseId, reason }` |
| **Response** | `{ success: true }` |

---

## 21. Health Monitoring

### 21.1 Monitored Patients

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/health-monitoring/patients` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, patients: [{ id, name, vitals, alerts, lastUpdated }] }` |

---

## 22. Doctor Services

### 22.1 Get Services

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/services` |
| **Auth** | `authUser + role:doctor` |
| **Response** | `{ success: true, services: { secondOpinion: { enrolled, fee }, homeVisits: { enrolled, radius, fee } } }` |

### 22.2 Update Services

| | |
|---|---|
| **Method + URL** | `PUT /api/doctors/services` |
| **Auth** | `authUser + role:doctor` |
| **Request Body** | `{ secondOpinion: { enrolled, fee }, homeVisits: { enrolled, radius, fee } }` |
| **Response** | `{ success: true, services: { ...updated } }` |

### 22.3 List Doctors Offering Second Opinion (public)

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/services/second-opinion` |
| **Auth** | None |
| **Response** | `{ success: true, doctors: [...] }` |

### 22.4 List Doctors Offering Home Visits (public)

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/services/home-visits` |
| **Auth** | None |
| **Response** | `{ success: true, doctors: [...] }` |

---

## 23. Attached Pharmacies & Labs

### 23.1 Get Attached Pharmacies

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/attached-pharmacies` or `GET /api/doctor-settings/attached-pharmacies` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, pharmacies: [{ id, name, address, phone, isDefault }] }` |

### 23.2 Add Pharmacy

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/attached-pharmacies` or `POST /api/doctor-settings/attached-pharmacies` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ name, address, phone, email, isDefault }` |
| **Response** | `{ success: true, pharmacy: {...} }` |

### 23.3 Remove Pharmacy

| | |
|---|---|
| **Method + URL** | `DELETE /api/doctors/attached-pharmacies/:pharmacyId` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 23.4 Get Attached Labs

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/attached-labs` or `GET /api/doctor-settings/attached-labs` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, labs: [{ id, name, address, phone, services }] }` |

### 23.5 Add Lab

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/attached-labs` or `POST /api/doctor-settings/attached-labs` |
| **Auth** | `authDoctor` |
| **Request Body** | `{ name, address, phone, email, services: [...] }` |
| **Response** | `{ success: true, lab: {...} }` |

### 23.6 Remove Lab

| | |
|---|---|
| **Method + URL** | `DELETE /api/doctors/attached-labs/:labId` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

---

## 24. File Uploads

### 24.1 Upload Media (Multer — Direct)

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/upload/:mediaType` |
| **Auth** | `authUser` |
| **Params** | `mediaType` = `profilePicture` \| `digitalSignature` \| `medicalSeal` \| `clinicImage` |
| **Request Body** | `multipart/form-data` with `file` field |
| **Response** | `{ success: true, url: "/uploads/doctors/<file>" }` |
| **Notes** | Stored locally in `./uploads/doctors/`. Max 5MB for images. |

### 24.2 Get Presigned S3 Upload URL

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/upload/:mediaType/presign` |
| **Auth** | `authUser` |
| **Params** | `mediaType` = `profilePicture` \| `digitalSignature` \| `medicalSeal` \| `clinicImage` |
| **Request Body** | `{ fileName, fileType: "image/jpeg" }` |
| **Response** | `{ success: true, uploadUrl: "https://s3...", key: "doctors/..." }` |
| **Notes** | Client uploads directly to S3 using the presigned URL, then confirms. |

### 24.3 Confirm S3 Upload

| | |
|---|---|
| **Method + URL** | `POST /api/doctors/upload/:mediaType/confirm` |
| **Auth** | `authUser` |
| **Request Body** | `{ key: "doctors/..." }` |
| **Response** | `{ success: true, url: "https://s3.../doctors/..." }` |

---

## 25. Alerts

### 25.1 Get Alerts

| | |
|---|---|
| **Method + URL** | `GET /api/doctors/alerts` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true, alerts: [{ id, type, title, message, isRead, createdAt }] }` |

### 25.2 Mark Alert Read

| | |
|---|---|
| **Method + URL** | `PATCH /api/doctors/alerts/:alertId/read` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 25.3 Mark All Alerts Read

| | |
|---|---|
| **Method + URL** | `PATCH /api/doctors/alerts/mark-all-read` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

### 25.4 Dismiss Alert

| | |
|---|---|
| **Method + URL** | `DELETE /api/doctors/alerts/:alertId` |
| **Auth** | `authDoctor` |
| **Response** | `{ success: true }` |

---

## 26. OTP

> Mounted at `/api/otp`

### 26.1 Send OTP

| | |
|---|---|
| **Method + URL** | `POST /api/otp/send` |
| **Auth** | None |
| **Request Body** | `{ phoneNumber }` or `{ email }` |
| **Response** | `{ success: true, message: "OTP sent" }` |

### 26.2 Verify OTP

| | |
|---|---|
| **Method + URL** | `POST /api/otp/verify` |
| **Auth** | None |
| **Request Body** | `{ phoneNumber, otp }` or `{ email, otp }` |
| **Response** | `{ success: true, verified: true }` |

### 26.3 Resend OTP

| | |
|---|---|
| **Method + URL** | `POST /api/otp/resend` |
| **Auth** | None |
| **Request Body** | `{ phoneNumber }` or `{ email }` |
| **Response** | `{ success: true }` |

### 26.4 Legacy Auth OTP

| | |
|---|---|
| **Method + URL** | `POST /api/auth/send-otp` and `POST /api/auth/verify-otp` |
| **Auth** | None |
| **Notes** | Aliases that forward to the OTP system. |

---

## 27. Socket.IO Real-time Events

> **Connection URL:** `wss://mediqzy.com` (or `ws://localhost:8000`)
>
> **Path:** `/socket.io`
>
> **Transports:** `['websocket', 'polling']`
>
> **Redis Adapter:** Enabled for PM2 cluster mode

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user-connect` | `{ userId, userType: "doctor", fcmToken }` | Register doctor presence on connect. Joins room `doctor-{userId}`. Persists FCM token. |
| `send-message` | `{ conversationId, senderId, senderType, recipientId, content, messageType }` | Send chat message. Emits `new-message` to recipient + sends FCM push if offline. |
| `get-chat-history` | `{ conversationId }` | Request chat history → receives `chat-history` event. |
| `mark-messages-read` | `{ conversationId, userId }` | Mark all messages in conversation as read. Emits `messages-marked-read`. |
| `get-conversations` | `{ userId }` | Get all conversations → receives `user-conversations` event. |
| `video-call-invitation` | `{ callerId, callerName, callerType, recipientId, recipientType, appointmentId, roomName }` | Send video call invitation. Emits `incoming-video-call` to recipient + FCM push. |
| `update-fcm-token` | `{ userId, fcmToken, userType, deviceType }` | Update FCM token at runtime. Persisted to DB. |
| `video-join` | `{ roomName, userId, userName }` | Notify room that user joined video. |
| `video-offer` | `{ to, offer, from }` | WebRTC offer (fallback signaling). |
| `video-answer` | `{ to, answer, from }` | WebRTC answer. |
| `video-ice` | `{ to, candidate, from }` | WebRTC ICE candidate. |
| `video-leave` | `{ roomName, userId }` | Notify room that user left video. |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user-status-change` | `{ userId, isOnline }` | Broadcast when any user connects/disconnects. |
| `new-message` | `{ id, conversationId, senderId, content, ... }` | New incoming message. |
| `chat-history` | `{ conversationId, messages: [...] }` | Response to `get-chat-history`. |
| `messages-marked-read` | `{ conversationId }` | Confirmation that messages were marked read. |
| `user-conversations` | `{ conversations: [...] }` | Response to `get-conversations`. |
| `incoming-video-call` | `{ callerId, callerName, roomName, appointmentId }` | Incoming video call notification. |
| `video-user-joined` | `{ userId, userName }` | User joined video room. |
| `video-offer` | `{ offer, from }` | WebRTC offer received. |
| `video-answer` | `{ answer, from }` | WebRTC answer received. |
| `video-ice` | `{ candidate, from }` | ICE candidate received. |
| `video-user-left` | `{ userId }` | User left video room. |
| `error` | `{ message }` | Error event for any failed operation. |

### Notification Room Pattern

- Doctors join room: `doctor-{userId}`
- Patients join room: `user-{userId}`
- Targeted notifications use `io.to('doctor-{id}').emit(...)` or `io.to('user-{id}').emit(...)`

---

## 28. Auth Middleware Reference

### `authDoctor`
- Parses `Authorization: Bearer <JWT>` header
- Verifies JWT with `JWT_CONFIG.SECRET`
- Loads full doctor profile from PostgreSQL
- Sets `req.doctor` with complete doctor object
- Returns 401 if token invalid/expired or doctor not found

### `authUser`
- Universal auth middleware
- Parses JWT, detects `decoded.role`
- If `role === 'doctor'`: loads full doctor profile, sets `req.user` with doctor data, `req.userRole = 'doctor'`
- If `role === 'patient'`: loads patient profile, sets `req.user`, `req.userRole = 'patient'`
- Returns 401 if token invalid/expired

### `requireRole(role)`
- Used after `authUser`
- Checks `req.userRole === role`
- Supports arrays: `requireRole(['doctor', 'admin'])`
- Returns 403 if role doesn't match

### `authUserOptional`
- Same as `authUser` but doesn't reject if no token
- Sets `req.user = null` if no token present

---

## Additional Route Mounts (Not Fully Documented)

These routes are mounted in `app.js` but contain sub-module functionality. They exist at:

| Base Path | Description |
|-----------|-------------|
| `/api/doctor/lab-integration` | Lab result integration |
| `/api/doctor/care-plans` | Patient care plans |
| `/api/doctor/queue` | Queue management (walk-in patients) |
| `/api/doctor/consent` | Consent forms & e-signatures |
| `/api/doctor/delegation` | Task delegation & audit trails |
| `/api/doctor/revenue` | Revenue insights & analytics |
| `/api/doctor/engagement` | Patient engagement tools |

---

## Quick Reference: HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (wrong role) |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limited |
| 500 | Internal server error |

---

*Generated from source code analysis of `/home/ubuntu/Mediczy/server` — routes, middleware, and Socket.IO handlers.*
