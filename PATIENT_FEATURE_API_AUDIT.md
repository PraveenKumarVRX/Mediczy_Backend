# Mediczy Patient Feature → API Endpoint Complete Audit

> Generated: March 13, 2026  
> API Base URL: `VITE_API_URL || http://localhost:8000/api`  
> Auth: Bearer JWT token in `Authorization` header (via axios interceptor in `client/src/lib/api.ts`)

---

## Table of Contents

1. [Authentication & Account](#1-authentication--account)
2. [User Profile](#2-user-profile)
3. [Family Members](#3-family-members)
4. [Doctor Discovery & Booking](#4-doctor-discovery--booking)
5. [Appointments](#5-appointments)
6. [Video Consultation](#6-video-consultation)
7. [Chat / Messaging](#7-chat--messaging)
8. [AI Doctor (Dr. iSHA)](#8-ai-doctor-dr-isha)
9. [Emergency / SOS / Triage](#9-emergency--sos--triage)
10. [Lab Tests](#10-lab-tests)
11. [Lab Test Cart](#11-lab-test-cart)
12. [Medical Reports](#12-medical-reports)
13. [Report Analysis (AI)](#13-report-analysis-ai)
14. [Prescriptions](#14-prescriptions)
15. [Wallet & Payments](#15-wallet--payments)
16. [Billing & Orders](#16-billing--orders)
17. [Membership Plans](#17-membership-plans)
18. [Notifications](#18-notifications)
19. [Health Dashboard & Vitals](#19-health-dashboard--vitals)
20. [Health Tracker / Fitness](#20-health-tracker--fitness)
21. [Health Diary](#21-health-diary)
22. [Health Intelligence](#22-health-intelligence)
23. [Health Risk Assessment](#23-health-risk-assessment)
24. [Health Feed (YouTube)](#24-health-feed-youtube)
25. [AI Report Scanner / Image Analysis](#25-ai-report-scanner--image-analysis)
26. [AI Symptom Triage](#26-ai-symptom-triage)
27. [Wearables & Devices](#27-wearables--devices)
28. [Health Data (BLE Sync)](#28-health-data-ble-sync)
29. [Diet & Calorie](#29-diet--calorie)
30. [Ayushman](#30-ayushman)
31. [Insurance](#31-insurance)
32. [Nurse Booking](#32-nurse-booking)
33. [Homecare Booking](#33-homecare-booking)
34. [Lab Booking (Direct)](#34-lab-booking-direct)
35. [Pharmacy (Order History)](#35-pharmacy-order-history)
36. [Addresses](#36-addresses)
37. [Employee Network](#37-employee-network-corporate-patients)
38. [Gamification & Leaderboard](#38-gamification--leaderboard)
39. [Wellness Calendar](#39-wellness-calendar)
40. [TTS (Text-to-Speech)](#40-tts-text-to-speech)
41. [OTP](#41-otp)
42. [Password Reset](#42-password-reset)
43. [Network Hospitals & Clinics](#43-network-hospitals--clinics)
44. [Smart Health Dashboard](#44-smart-health-dashboard)
45. [AI Health Analysis](#45-ai-health-analysis)
46. [Pages with No Backend (Mock/Static)](#46-pages-with-no-backend-mockstatic)

---

## 1. Authentication & Account

**Frontend Pages:** `/login`, `/register`, `/forgot-password`, `/reset-password`, `/change-password`, `/oauth-callback`  
**Components:** `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `ChangePassword.tsx`, `OAuthCallback.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Login (email/phone+password) | POST | `/api/users/login` | None | `user.route.js` L53 |
| Login (send OTP) | POST | `/api/users/login/send-otp` | None | `user.route.js` L188 |
| Login (verify OTP) | POST | `/api/users/login/verify-otp` | None | `user.route.js` L253 |
| Register (send OTP) | POST | `/api/users/register/send-otp` | None | `user.route.js` L318 |
| Register (verify email OTP) | POST | `/api/users/register/verify-email-otp` | None | `user.route.js` L533 |
| Register (verify WhatsApp OTP) | POST | `/api/users/register/verify-whatsapp-otp` | None | `user.route.js` L607 |
| Register (complete) | POST | `/api/users/register/verify-otp` | None | `user.route.js` L651 |
| Google OAuth redirect | GET | `/api/auth/google` | None | `oauth.route.js` |
| Get profile (on load) | GET | `/api/users/profile` | `authUser` | `user.route.js` L987 |
| Change password | POST | `/api/users/change-password` | `authUser` | `user.route.js` L1446 |
| Forgot password - request | POST | `/api/password-reset/request` | None | `password-reset.route.js` L12 |
| Forgot password - verify OTP | POST | `/api/password-reset/verify-otp` | None | `password-reset.route.js` L55 |
| Forgot password - reset | POST | `/api/password-reset/reset` | None | `password-reset.route.js` L98 |
| Reset password (legacy) | POST | `/api/users/reset-password` | None | `user.route.js` L1357 |
| Daily login reward (on login) | POST | `/api/wallet/earn/daily-login` | `authUser` | `wallet.route.js` L97 |

---

## 2. User Profile

**Frontend Page:** `/profile`  
**Component:** `ProfileEnhanced.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get profile | GET | `/api/users/profile` | `authUser` | `user.route.js` L987 |
| Update profile | PUT | `/api/users/profile` | `authUser` | `user.route.js` L1170 |
| Upload profile picture | POST | `/api/users/profile-picture` | `authUser` | `user.route.js` L1109 |
| Presign profile picture | POST | `/api/users/profile-picture/presign` | `authUser` | `user.route.js` L1003 |
| Confirm profile picture | POST | `/api/users/profile-picture/confirm` | `authUser` | `user.route.js` L1053 |

---

## 3. Family Members

**Frontend Page:** `/profile` (family members tab)  
**Component:** `ProfileEnhanced.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List family members | GET | `/api/family-members` | `authUser` | `family-member.route.js` L39 |
| Get limits | GET | `/api/family-members/limits` | `authUser` | `family-member.route.js` L17 |
| Get single member | GET | `/api/family-members/:id` | `authUser` | `family-member.route.js` L67 |
| Add family member | POST | `/api/family-members` | `authUser` | `family-member.route.js` L101 |
| Update member | PUT | `/api/family-members/:id` | `authUser` | `family-member.route.js` L190 |
| Delete member | DELETE | `/api/family-members/:id` | `authUser` | `family-member.route.js` L275 |

---

## 4. Doctor Discovery & Booking

**Frontend Pages:** `/doctors`, `/consultation`, `/consultation/:doctorId`  
**Components:** `DoctorListBooking.tsx`, `Consultation.tsx`, `ConsultationBooking.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List available doctors | GET | `/api/doctors/available` | None | `doctor.enhanced.route.js` L78 |
| List all doctors | GET | `/api/doctors` | None | `doctor.enhanced.route.js` L226 |
| Search doctors | GET | `/api/doctors/search` | None | `doctor.enhanced.route.js` L881 |
| Get doctor public profile | GET | `/api/doctors/:doctorId/public` | None | `doctor.enhanced.route.js` L946 |
| Get doctor slots (patient view) | GET | `/api/doctors/:doctorId/user-slots` | None | `doctor.route.js` L1138 |
| Get doctor slots (enhanced) | GET | `/api/doctors/:doctorId/slots` | None | `doctor.enhanced.route.js` L653 |
| Get masterdata doctors | GET | `/api/masterdata/doctors` | None | `masterdata.routes.js` |
| Book appointment | POST | `/api/appointments` | `authUser` | `appointment.route.js` L38 |
| Book via mobile endpoint | POST | `/api/mobile/appointments` | `authUser` | (mobile routes) |
| Get services (second opinion) | GET | `/api/doctors/services/second-opinion` | None | `doctor.enhanced.route.js` L1228 |
| Get services (home visits) | GET | `/api/doctors/services/home-visits` | None | `doctor.enhanced.route.js` L1272 |
| Get partnered doctors | GET | `/api/doctors/partnered` | `authUser` | `doctor.enhanced.route.js` L170 |

---

## 5. Appointments

**Frontend Pages:** `/appointments`, `/my-bookings` → redirects to `/appointments`  
**Component:** `Appointments.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List my appointments (enhanced) | GET | `/api/enhanced-appointments/my-appointments` | `authUser` | `enhanced-appointment.route.js` L734 |
| List my appointments (legacy) | GET | `/api/appointments/my-appointments` | `authUser` | `appointment.route.js` L60 |
| Get analytics/basic | GET | `/api/appointments/analytics/basic` | `authUser` | `appointment.route.js` L186 |
| Get appointment by ID | GET | `/api/appointments/:id` | `authUser` | `appointment.route.js` L93 |
| Cancel appointment | PATCH | `/api/appointments/:id/cancel` | `authUser` | `appointment.route.js` L264 |
| Reschedule appointment | PATCH | `/api/appointments/:id/reschedule` | `authUser` | `appointment.route.js` L294 |
| Get prescription for appt | GET | `/api/prescriptions/appointment/:appointmentId` | `authUser` | `prescription.route.js` L688 |
| Book enhanced appointment | POST | `/api/enhanced-appointments/book` | `authUser` | `enhanced-appointment.route.js` L132 |

---

## 6. Video Consultation

**Frontend Page:** `/video-consultation`, `/chat`, `/chatdoctor`  
**Components:** `VideoConsultation.tsx`, `VideoChat.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List upcoming appointments | GET | `/api/appointments?status=confirmed` | `authUser` | `appointment.route.js` L60 |
| Get video token (mobile) | POST | `/api/mobile/video/token` | `authUser` | (mobile routes) |
| Get video token (LiveKit) | POST | `/api/video/livekit/token` | `authUser` | `video.route.js` L34 |
| Join video room | GET | `/api/consultation/video/join/:appointmentId` | `authUser` | `online-consultation.route.js` L1181 |
| End video call | POST | `/api/consultation/video/end/:appointmentId` | `authUser` | `online-consultation.route.js` L1370 |
| Get chat conversations | GET | `/api/consultation/chat/conversations` | `authUser` | `online-consultation.route.js` L1627 |
| Get chat messages | GET | `/api/consultation/chat/:appointmentId/messages` | `authUser` | `online-consultation.route.js` L1709 |
| Send chat message | POST | `/api/consultation/chat/:appointmentId/messages` | `authUser` | `online-consultation.route.js` L1802 |
| Mark chat as read | POST | `/api/consultation/chat/:appointmentId/read` | `authUser` | `online-consultation.route.js` L1878 |
| Unread chat count | GET | `/api/consultation/chat/unread-count` | `authUser` | `online-consultation.route.js` L1932 |

---

## 7. Chat / Messaging

**Frontend Page:** `/chat`, `/chatdoctor`  
**Component:** `VideoChat.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Create chat room | POST | `/api/chat/rooms` | `authUser` | `chat.route.js` L55 |
| List chat rooms | GET | `/api/chat/rooms` | `authUser` | `chat.route.js` L86 |
| Get room messages | GET | `/api/chat/rooms/:roomId/messages` | `authUser` | `chat.route.js` L182 |
| Send message | POST | `/api/chat/rooms/:roomId/messages` | `authUser` | `chat.route.js` L274 |
| Join room | POST | `/api/chat/rooms/:roomId/join` | `authUser` | `chat.route.js` L409 |
| Leave room | POST | `/api/chat/rooms/:roomId/leave` | `authUser` | `chat.route.js` L456 |
| Room participants | GET | `/api/chat/rooms/:roomId/participants` | `authUser` | `chat.route.js` L485 |
| Upload file | POST | `/api/chat/upload` | `authUser` | `chat.route.js` L531 |
| Get file | GET | `/api/chat/files/:fileName` | `authUser` | `chat.route.js` L595 |
| Chat stats | GET | `/api/chat/chat-stats` | `authUser` | `chat.route.js` L761 |

---

## 8. AI Doctor (Dr. iSHA)

**Frontend Page:** `/ai-doctor`  
**Component:** `AiDoctor.tsx`  
**Service:** `drIsha.ts`, `orchestrator.ts`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Dr. iSHA consult | POST | `/api/medical-ai/consult` | `authUser` | `medical-ai.route.js` L142 |
| AI Brain think | POST | `/api/v3/ai-brain/think` | `authUser` | `ai-brain.route.js` |
| AI health chat | POST | `/api/ai-health/chat` | `authUser` | `ai-health.route.js` L47 |
| Dr. iSHA consult (alt) | POST | `/api/ai-health/dr-isha/consult` | `authUser` | `ai-health.route.js` L114 |
| Working medical consult | POST | `/api/ai/working-medical-consult` | `authUser` | `ai.js` L522 |
| AI process command | POST | `/api/ai/process-command` | `authUser` | `ai.js` L140 |
| AI appointment conversation | POST | `/api/ai/appointment-conversation` | `authUser` | `ai.js` L854 |
| AI translate | POST | `/api/ai/translate` | `authUser` | `ai.js` L1168 |
| AI text-to-speech | POST | `/api/ai/text-to-speech` | `authUser` | `ai.js` L1225 |
| AI feedback | POST | `/api/ai/feedback` | `authUser` | `ai.js` L1371 |
| AI feedback (quick) | POST | `/api/ai/feedback/quick` | `authUser` | `ai.js` L1419 |
| Conversation history | POST | `/api/medical-ai/conversation-history` | `authUser` | `medical-ai.route.js` L1274 |
| Session get | GET | `/api/medical-ai/session/:sessionId` | `authUser` | `medical-ai.route.js` L1225 |
| Session delete | DELETE | `/api/medical-ai/session/:sessionId` | `authUser` | `medical-ai.route.js` L1179 |

---

## 9. Emergency / SOS / Triage

**Frontend Page:** `/emergency`  
**Component:** `Emergency.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Emergency SOS | POST | `/api/medical-ai/emergency-sos` | `authUser` | `medical-ai.route.js` L451 |
| Emergency triage | POST | `/api/medical-ai/emergency-triage` | `authUser` | `medical-ai.route.js` L331 |
| Get triage doctors | GET | `/api/medical-ai/triage-doctors` | `authUser` | `medical-ai.route.js` L677 |
| Instant triage call | POST | `/api/medical-ai/instant-triage-call` | `authUser` (opt) | `medical-ai.route.js` L752 |
| Get wallet balance (for payment) | GET | `/api/wallet/balance` | `authUser` | `wallet.route.js` L42 |
| TTS speak | POST | `/api/tts/speak` | None | `tts.route.js` L21 |

---

## 10. Lab Tests

**Frontend Page:** `/patient/lab-tests`  
**Component:** `LabTests.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List my lab tests | GET | `/api/lab-tests` | `authUser` | `lab-tests.route.js` L142 |
| Get lab test by ID | GET | `/api/lab-tests/:id` | `authUser` | `lab-tests.route.js` L195 |
| Book lab test | POST | `/api/lab-tests` | `authUser` | `lab-tests.route.js` L18 |
| Confirm lab test | POST | `/api/lab-tests/:id/confirm` | `authUser` | `lab-tests.route.js` L233 |
| Cancel lab test | POST | `/api/lab-tests/:id/cancel` | `authUser` | `lab-tests.route.js` L282 |
| Update lab test | PUT | `/api/lab-tests/:id` | `authUser` | `lab-tests.route.js` L333 |
| Delete lab test | DELETE | `/api/lab-tests/:id` | `authUser` | `lab-tests.route.js` L386 |
| Browse labs | GET | `/api/labs` | None | enhanced lab router |
| Get employee network labs | GET | `/api/employee/my-labs` | `authUser` | `employee-network.route.js` L59 |

---

## 11. Lab Test Cart

**Frontend Page:** `/patient/lab-tests` (cart panel)  
**Component:** `LabTests.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get cart | GET | `/api/cart` | `authUser` | `cart.route.js` L18 |
| Add to cart | POST | `/api/cart/add` | `authUser` | `cart.route.js` L40 |
| Remove from cart | DELETE | `/api/cart/remove/:testId` | `authUser` | `cart.route.js` L82 |
| Update quantity | PUT | `/api/cart/update/:testId` | `authUser` | `cart.route.js` L110 |
| Clear cart | DELETE | `/api/cart/clear` | `authUser` | `cart.route.js` L146 |
| Sync cart | POST | `/api/cart/sync` | `authUser` | `cart.route.js` L166 |

---

## 12. Medical Reports

**Frontend Page:** `/patient/my-reports`  
**Component:** `MyReports.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List reports | GET | `/api/reports` | `authUser` | `reports.route.js` L178 |
| Upload report | POST | `/api/reports` (multipart) | `authUser` | `reports.route.js` L71 |
| Get report by ID | GET | `/api/reports/:id` | `authUser` | `reports.route.js` L231 |
| Delete report | DELETE | `/api/reports/:id` | `authUser` | `reports.route.js` L269 |
| Download report file | GET | `/api/reports/download/:filename` | `authUser` | `reports.route.js` L328 |

---

## 13. Report Analysis (AI)

**Frontend Page:** `/patient/my-reports`, `/report-scanner`  
**Components:** `MyReports.tsx`, `AIReportScanner.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Analyze report (AI) | POST | `/api/reports/:reportId/analyze` | `authUser` | `report-analysis.route.js` L70 |
| Get analysis results | GET | `/api/reports/:reportId/analysis` | `authUser` | `report-analysis.route.js` L145 |
| Analyze medical report | POST | `/api/medical-ai/analyze-report` | `authUser` | `medical-ai.route.js` L1730 |
| AI image analysis | POST | `/api/ai/analyze-image` | None | `ai.js` L496 |

---

## 14. Prescriptions

**Frontend Page:** `/my-prescriptions`  
**Component:** `MyPrescriptions.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List patient prescriptions | GET | `/api/prescriptions/patient` | `authUser` | `prescription.route.js` L543 |
| Get all my prescriptions | GET | `/api/prescriptions/my/all` | `authUser` | `prescription.route.js` L659 |
| Get prescription by ID | GET | `/api/prescriptions/:id` | `authUser` | `prescription.route.js` L572 |
| Get for patient | GET | `/api/prescriptions/patient/:patientId` | `authUser` | `prescription.route.js` L614 |
| Get for appointment | GET | `/api/prescriptions/appointment/:appointmentId` | `authUser` | `prescription.route.js` L688 |
| Download PDF | GET | `/api/prescriptions/:id/pdf` | None | `prescription.route.js` L1221 |
| View HTML | GET | `/api/prescriptions/:id/html` | None | `prescription.route.js` L1115 |
| Share via WhatsApp | GET | `/api/prescriptions/:id/share/whatsapp` | `authUser` | `prescription.route.js` L1326 |

---

## 15. Wallet & Payments

**Frontend Page:** `/wallet`  
**Component:** `Wallet.tsx`  
**Service:** `wallet.service.ts`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get wallet details | GET | `/api/wallet` | `authUser` | `wallet.route.js` L20 |
| Get balance | GET | `/api/wallet/balance` | `authUser` | `wallet.route.js` L42 |
| Get transactions | GET | `/api/wallet/transactions` | `authUser` | `wallet.route.js` L64 |
| Earn daily login | POST | `/api/wallet/earn/daily-login` | `authUser` | `wallet.route.js` L97 |
| Earn steps reward | POST | `/api/wallet/earn/steps` | `authUser` | `wallet.route.js` L134 |
| Earn health assessment | POST | `/api/wallet/earn/health-assessment` | `authUser` | `wallet.route.js` L172 |
| Earn vital signs | POST | `/api/wallet/earn/vital-signs` | `authUser` | `wallet.route.js` L200 |
| Earn activity | POST | `/api/wallet/earn/activity` | `authUser` | `wallet.route.js` L228 |
| Spend coins | POST | `/api/wallet/spend` | `authUser` | `wallet.route.js` L265 |
| Get rewards | GET | `/api/wallet/rewards` | `authUser` | `wallet.route.js` L306 |
| Validate coupon | POST | `/api/wallet/validate-coupon` | `authUser` | `wallet.route.js` L329 |
| Create Razorpay order | POST | `/api/wallet/create-order` | `authUser` | `wallet.route.js` L436 |
| Verify Razorpay payment | POST | `/api/wallet/verify-payment` | `authUser` | `wallet.route.js` L588 |
| Redeem free coupon | POST | `/api/wallet/redeem-free-coupon` | `authUser` | `wallet.route.js` L717 |
| Purchase package | POST | `/api/wallet/purchase` | `authUser` | `wallet.route.js` L826 |
| Calculate appointment cost | GET | `/api/wallet/appointment/calculate/:fee` | `authUser` | `wallet.route.js` L909 |
| Check can pay | POST | `/api/wallet/appointment/can-pay` | `authUser` | `wallet.route.js` L940 |
| Pay for appointment | POST | `/api/wallet/appointment/pay` | `authUser` | `wallet.route.js` L971 |
| Refund appointment | POST | `/api/wallet/appointment/refund` | `authUser` | `wallet.route.js` L1029 |

---

## 16. Billing & Orders

**Frontend Pages:** `/billing/checkout`, `/billing/orders`, `/billing/orders/:orderId`, `/billing/invoices`  
**Components:** `OrderCheckout.tsx`, `OrderHistory.tsx`, `OrderDetails.tsx`, `MyInvoices.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Create order | POST | `/api/billing/orders/create` | `authUser` | `billing.route.js` L21 |
| List orders | GET | `/api/billing/orders` | `authUser` | `billing.route.js` L93 |
| Order details | GET | `/api/billing/orders/:orderId` | `authUser` | `billing.route.js` L150 |
| Detailed order | GET | `/api/billing/orders/:orderId/detailed` | `authUser` | `billing.route.js` L195 |
| Reorder | POST | `/api/billing/orders/:orderId/reorder` | `authUser` | `billing.route.js` L308 |
| Pharmacy order history | GET | `/api/billing/orders/pharmacy/history` | `authUser` | `billing.route.js` L429 |
| Razorpay create | POST | `/api/billing/payments/razorpay/create` | `authUser` | `billing.route.js` L513 |
| Razorpay verify | POST | `/api/billing/payments/razorpay/verify` | `authUser` | `billing.route.js` L582 |
| List invoices | GET | `/api/billing/invoices` | `authUser` | `billing.route.js` L831 |
| Get invoice | GET | `/api/billing/invoices/:invoiceId` | `authUser` | `billing.route.js` L882 |
| Download invoice | GET | `/api/billing/invoices/:invoiceId/download` | `authUser` | `billing.route.js` L923 |
| Generate invoice | POST | `/api/billing/invoices/generate` | `authUser` | `billing.route.js` L747 |
| Billing transactions | GET | `/api/billing/transactions` | `authUser` | `billing.route.js` L968 |
| Billing stats | GET | `/api/billing/stats` | `authUser` | `billing.route.js` L1017 |

---

## 17. Membership Plans

**Frontend Pages:** `/my-plans`, `/membership-card`  
**Components:** `MyPlans.tsx`, `MyMembershipCard.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get current membership | GET | `/api/membership/my/current` | `authUser` | `membership.route.js` L106 |
| Get usage stats | GET | `/api/membership/my/usage` | `authUser` | `membership.route.js` L462 |
| Get all plans | GET | `/api/membership/plans` | None | `membership.route.js` L96 |
| Get upgrade options | GET | `/api/membership/upgrade-options` | `authUser` | `membership.route.js` L319 |
| Get addons | GET | `/api/membership/addons` | `authUser` | `membership.route.js` L406 |
| Subscribe to plan | POST | `/api/membership/subscribe/:planId` | `authUser` | `membership.route.js` L128 |
| Upgrade plan | POST | `/api/membership/upgrade/:newPlanId` | `authUser` | `membership.route.js` L188 |
| Get all memberships | GET | `/api/membership/my/all` | `authUser` | `membership.route.js` L438 |
| Record teleconsult usage | POST | `/api/membership/usage/teleconsult` | `authUser` | `membership.route.js` L482 |
| Record benefit usage | POST | `/api/membership/usage/benefit` | `authUser` | `membership.route.js` L522 |
| HC check for appointment | GET | `/api/consultation/payment/hc-check/:appointmentId` | `authUser` | `online-consultation.route.js` L984 |
| HC pay for appointment | POST | `/api/consultation/payment/hc/:appointmentId` | `authUser` | `online-consultation.route.js` L1042 |

---

## 18. Notifications

**Frontend Page:** `/patient/notifications`  
**Component:** `PatientNotifications.tsx`  
**Hook:** `useServerNotifications.ts`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List notifications | GET | `/api/notifications` | `authUser` | `notification.route.js` L14 |
| Unread count | GET | `/api/notifications/unread-count` | `authUser` | `notification.route.js` L48 |
| Mark as read | POST | `/api/notifications/:id/read` | `authUser` | `notification.route.js` L75 |
| Mark all as read | POST | `/api/notifications/read-all` | `authUser` | `notification.route.js` L106 |
| Delete notification | DELETE | `/api/notifications/:id` | `authUser` | `notification.route.js` L133 |
| Register FCM token | POST | `/api/notifications/fcm/register` | `authUser` | `notification.route.js` L170 |
| Get preferences | GET | `/api/notifications/preferences` | `authUser` | `notification.route.js` L247 |

---

## 19. Health Dashboard & Vitals

**Frontend Pages:** `/health-dashboard`, `/patient/devices`  
**Components:** `UnifiedHealthDashboard.tsx`, `HealthDashboard.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get latest health metrics | GET | `/api/health/latest` | `authUser` | `health.route.js` L12 |
| Get health summary | GET | `/api/health/summary` | `authUser` | `health.route.js` L148 |
| Get health data summary | GET | `/api/health-data/summary` | `authUser` | `healthData.route.js` L171 |

---

## 20. Health Tracker / Fitness

**Frontend Page:** `/health-tracker`  
**Component:** `HealthTracker.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get fitness summary | GET | `/api/fitness/summary` | `authUser` | `fitness.route.js` L252 |
| Get fitness data | GET | `/api/fitness/data` | `authUser` | `fitness.route.js` L217 |
| Get latest fitness | GET | `/api/fitness/latest` | `authUser` | `fitness.route.js` L240 |
| Store fitness data | POST | `/api/fitness/store` | `authUser` | `fitness.route.js` L176 |

---

## 21. Health Diary

**Frontend Page:** `/health-diary`  
**Component:** `HealthDiary.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List entries | GET | `/api/health-diary` | `authUser` | `health-diary.route.js` L19 |
| Get prescriptions | GET | `/api/health-diary/prescriptions` | `authUser` | `health-diary.route.js` L58 |
| Get summary | GET | `/api/health-diary/summary` | `authUser` | `health-diary.route.js` L97 |
| Create entry | POST | `/api/health-diary` | `authUser` | `health-diary.route.js` L175 |
| Update entry | PUT | `/api/health-diary/:id` | `authUser` | `health-diary.route.js` L224 |
| Delete entry | DELETE | `/api/health-diary/:id` | `authUser` | `health-diary.route.js` L278 |
| Log medication | POST | `/api/health-diary/log-medication` | `authUser` | `health-diary.route.js` L313 |
| Log symptom | POST | `/api/health-diary/log-symptom` | `authUser` | `health-diary.route.js` L356 |

---

## 22. Health Intelligence

**Frontend Page:** `/health-intelligence`  
**Component:** `HealthIntelligence.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get intelligence data | GET | `/api/health-intelligence` | `authUser` | `health-intelligence.route.js` L12 |
| Get reminders | GET | `/api/health-intelligence/reminders/:type` | `authUser` | `health-intelligence.route.js` L60 |
| Take action | POST | `/api/health-intelligence/action` | `authUser` | `health-intelligence.route.js` L91 |

---

## 23. Health Risk Assessment

**Frontend Page:** `/health-risk-assessment`  
**Component:** `UserHealthRiskAssessment.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get history | GET | `/api/health-risk/:userId/history` | `authUser` | (health-assessment routes) |
| Submit assessment | POST | `/api/health-risk/:userId/assessments` | `authUser` | (health-assessment routes) |
| Save assessment | POST | `/api/health-assessment/save` | `authUser` | `health-assessment.route.js` L184 |
| Get assessments | GET | `/api/health-assessment` | `authUser` | `health-assessment.route.js` L372 |

---

## 24. Health Feed (YouTube)

**Frontend Page:** `/health-feed`  
**Component:** `HealthFeedPage.tsx`

| Action | Method | API Endpoint | Auth | Notes |
|--------|--------|-------------|------|-------|
| Fetch YouTube videos | GET | `https://www.googleapis.com/youtube/v3/search` | None | External API (YouTube Data API v3) |
| Fetch video details | GET | `https://www.googleapis.com/youtube/v3/videos` | None | External API |

> **No backend API calls** — this page calls YouTube API directly from the frontend.

---

## 25. AI Report Scanner / Image Analysis

**Frontend Page:** `/report-scanner`, `/reposts`  
**Components:** `AIReportScanner.tsx`, `Reposts.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Analyze image | POST | `/api/ai/analyze-image` | None | `ai.js` L496 |

> `AIReportScanner.tsx` and `AISymptomTriage.tsx` currently have **no API calls** in the component files — they appear to be UI-only mockups pending backend integration.

---

## 26. AI Symptom Triage

**Frontend Page:** `/symptom-checker`  
**Component:** `AISymptomTriage.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Analyze symptoms | POST | `/api/medical-ai/analyze-symptoms` | `authUser` | `medical-ai.route.js` L248 |

> The component itself has no direct API calls; it's a UI page. The actual symptom analysis endpoints exist on the backend and are used via the AI Doctor flow.

---

## 27. Wearables & Devices

**Frontend Page:** `/` (Index — wearable setup), `/patient/devices`  
**Component:** `Index.tsx`, `HealthDashboard.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Register wearable | POST | `/api/wearables` | `authUser` | `wearable.route.js` L18 |
| Provision wearable | POST | `/api/wearables/provision` | `authUser` | `wearable.route.js` L110 |
| Assign wearable | POST | `/api/wearables/:id/assign` | `authUser` | `wearable.route.js` L177 |
| List wearables | GET | `/api/wearables` | `authUser` | `wearable.route.js` L241 |
| Get user wearables | GET | `/api/wearables/user/:user_id` | `authUser` | `wearable.route.js` L286 |
| Get wearable by ID | GET | `/api/wearables/:id` | `authUser` | `wearable.route.js` L327 |
| Sync wearable | PUT | `/api/wearables/:id/sync` | None | `wearable.route.js` L361 |
| Post readings | POST | `/api/wearables/:id/readings` | None | `wearable.route.js` L408 |
| Get readings | GET | `/api/wearables/:id/readings` | `authUser` | `wearable.route.js` L477 |
| Health summary | GET | `/api/wearables/user/:user_id/health-summary` | `authUser` | `wearable.route.js` L522 |
| Update settings | PUT | `/api/wearables/:id/settings` | `authUser` | `wearable.route.js` L570 |

---

## 28. Health Data (BLE Sync)

**Mount:** `/api/health-data`  
**Server File:** `healthData.route.js`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| BLE sync | POST | `/api/health-data/ble-sync` | `authUser` | `healthData.route.js` L30 |
| Recent data | GET | `/api/health-data/recent` | `authUser` | `healthData.route.js` L134 |
| Summary | GET | `/api/health-data/summary` | `authUser` | `healthData.route.js` L171 |
| Trends | GET | `/api/health-data/trends/:dataType` | `authUser` | `healthData.route.js` L255 |
| History | GET | `/api/health-data/history/:dataType` | `authUser` | `healthData.route.js` L386 |
| List devices | GET | `/api/health-data/devices` | `authUser` | `healthData.route.js` L447 |
| Remove device | DELETE | `/api/health-data/device/:deviceId` | `authUser` | `healthData.route.js` L488 |
| Veepoo sync | POST | `/api/health-data/veepoo-sync` | `authUser` | `healthData.route.js` L539 |
| Apple Health sync | POST | `/api/health-data/apple-health-sync` | `authUser` | `healthData.route.js` L674 |
| Google Fit sync | POST | `/api/health-data/google-fit-sync` | `authUser` | `healthData.route.js` L765 |
| Register device | POST | `/api/health-data/devices/register` | `authUser` | `healthData.route.js` L876 |
| Remove device (alt) | DELETE | `/api/health-data/devices/:deviceId` | `authUser` | `healthData.route.js` L925 |

---

## 29. Diet & Calorie

**Frontend Pages:** `/diet`, `/calorie-calculator`  
**Components:** `Diet.tsx`, `CalorieCalculator.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Generate diet plan | POST | `/api/ai-health/diet/generate` | `authUser` | `ai-health.route.js` L145 |
| Diet alias | POST | `/api/diet/generate` | `authUser` | `diet.route.js` (alias) |

> `Diet.tsx` and `CalorieCalculator.tsx` have **no direct API calls** in the components — `Diet` likely calls the diet endpoint via the AI Doctor service. `CalorieCalculator` is a client-side calculator only.

---

## 30. Ayushman

**Frontend Page:** `/ayushman`  
**Component:** `Ayushman.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| (No API calls) | — | — | — | `ayushman.route.js` exists on backend |

> The `Ayushman.tsx` component is a UI-only page with no API calls. Based on the server route file at `/api/ayushman`, backend endpoints exist but are not yet integrated in the frontend.

---

## 31. Insurance

**Frontend Pages:** `/patient/buy-insurance`, `/patient/claims`  
**Components:** `BuyInsurance.tsx`, `ClaimsManagement.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List providers | GET | `/api/insurance/providers` | None | `insurance.route.js` L483 |
| Get policies | GET | `/api/insurance/policies/:providerId` | None | `insurance.route.js` L498 |
| Get my insurances | GET | `/api/insurance/my/insurances` | `authUser` | `insurance.route.js` L515 |
| Submit claim | POST | `/api/insurance/claims` | `authUser` | `insurance.route.js` L533 |

> **Note:** Both `BuyInsurance.tsx` and `ClaimsManagement.tsx` are currently **mock/static** UI pages with hardcoded data. The backend endpoints above exist but the frontend has not integrated them yet.

---

## 32. Nurse Booking

**Frontend Page:** `/nurse-booking/:nurseId`  
**Component:** `NurseBooking.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get nurse details | GET | `/api/nurses/:nurseId` | `authUser` | (nurse route) |
| Book nurse | POST | `/api/nurses/book` | `authUser` | (nurse route) |

---

## 33. Homecare Booking

**Frontend Page:** `/homecare-booking/:homecareId`  
**Component:** `HomecareBooking.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get provider details | GET | `/api/homecare/:homecareId` | `authUser` | `homecare.route.js` |
| Book homecare | POST | `/api/homecare/book` | `authUser` | `homecare.route.js` |

---

## 34. Lab Booking (Direct)

**Frontend Page:** `/lab-booking/:labId`  
**Component:** `LabBooking.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get lab details | GET | `/api/labs/:labId` | None | enhanced lab router |
| Get lab tests | GET | `/api/labs/:labId/tests` | None | enhanced lab router |
| Book lab test | POST | `/api/labs/book` | `authUser` | enhanced lab router |

---

## 35. Pharmacy (Order History)

**Frontend Page:** `/patient/pharmacy`  
**Component:** `Pharmacy.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Pharmacy order history | GET | `/api/billing/orders/pharmacy/history` | `authUser` | `billing.route.js` L429 |
| Detailed order | GET | `/api/billing/orders/:orderId/detailed` | `authUser` | `billing.route.js` L195 |
| Reorder | POST | `/api/billing/orders/:orderId/reorder` | `authUser` | `billing.route.js` L308 |

---

## 36. Addresses

**Mount:** `/api/addresses`  
**Server File:** `address.route.js`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Autocomplete | GET | `/api/addresses/autocomplete` | `authUser` | `address.route.js` L14 |
| Place details | GET | `/api/addresses/place/:placeId` | `authUser` | `address.route.js` L51 |
| Create address | POST | `/api/addresses` | `authUser` | `address.route.js` L76 |
| List addresses | GET | `/api/addresses` | `authUser` | `address.route.js` L157 |
| Get default | GET | `/api/addresses/default` | `authUser` | `address.route.js` L181 |
| Get by ID | GET | `/api/addresses/:id` | `authUser` | `address.route.js` L212 |
| Update | PUT | `/api/addresses/:id` | `authUser` | `address.route.js` L247 |
| Set default | PUT | `/api/addresses/:id/set-default` | `authUser` | `address.route.js` L307 |
| Delete | DELETE | `/api/addresses/:id` | `authUser` | `address.route.js` L346 |

---

## 37. Employee Network (Corporate Patients)

**Mount:** `/api/employee`  
**Server File:** `employee-network.route.js`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get my corporate | GET | `/api/employee/my-corporate` | `authUser` | `employee-network.route.js` L38 |
| Get my labs | GET | `/api/employee/my-labs` | `authUser` | `employee-network.route.js` L59 |
| Get my hospitals | GET | `/api/employee/my-hospitals` | `authUser` | `employee-network.route.js` L119 |
| Get my clinics | GET | `/api/employee/my-clinics` | `authUser` | `employee-network.route.js` L180 |

---

## 38. Gamification & Leaderboard

**Frontend Pages:** `/patient/wellness-challenges`, `/wellness-challenges`  
**Component:** `EmployeeGamification.tsx`  
**Mount:** `/api/leaderboard`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get challenges (corporate) | GET | `/api/corporate/gamification/employee/challenges` | `authUser` | `corporate.route.js` |
| Get stats (corporate) | GET | `/api/corporate/gamification/employee/stats` | `authUser` | `corporate.route.js` |
| List goals | GET | `/api/leaderboard/goals` | `authUser` | `leaderboard.route.js` L10 |
| Get goal detail | GET | `/api/leaderboard/goals/:goalId` | `authUser` | `leaderboard.route.js` L34 |
| Create goal | POST | `/api/leaderboard/goals` | `authUser` | `leaderboard.route.js` L59 |
| Join goal | POST | `/api/leaderboard/goals/:goalId/join` | `authUser` | `leaderboard.route.js` L78 |
| Update goal progress | POST | `/api/leaderboard/goals/:goalId/progress` | `authUser` | `leaderboard.route.js` L97 |
| My goals | GET | `/api/leaderboard/my-goals` | `authUser` | `leaderboard.route.js` L121 |
| List challenges | GET | `/api/leaderboard/challenges` | `authUser` | `leaderboard.route.js` L142 |
| Join challenge | POST | `/api/leaderboard/challenges/:id/join` | `authUser` | `leaderboard.route.js` L209 |
| Update challenge progress | POST | `/api/leaderboard/challenges/:id/progress` | `authUser` | `leaderboard.route.js` L231 |
| Challenge leaderboard | GET | `/api/leaderboard/challenges/:id/leaderboard` | `authUser` | `leaderboard.route.js` L255 |
| Global leaderboard | GET | `/api/leaderboard/leaderboard/global` | `authUser` | `leaderboard.route.js` L279 |
| Peers leaderboard | GET | `/api/leaderboard/leaderboard/peers` | `authUser` | `leaderboard.route.js` L301 |
| My rank | GET | `/api/leaderboard/leaderboard/my-rank` | `authUser` | `leaderboard.route.js` L346 |
| Stats summary | GET | `/api/leaderboard/stats/summary` | `authUser` | `leaderboard.route.js` L365 |
| Achievements | GET | `/api/leaderboard/achievements` | `authUser` | `leaderboard.route.js` L385 |
| My achievements | GET | `/api/leaderboard/achievements/my` | `authUser` | `leaderboard.route.js` L406 |

---

## 39. Wellness Calendar

**Frontend Pages:** `/patient/wellness-calendar`, `/wellness-calendar`  
**Component:** `EmployeeWellnessCalendar.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get employee events | GET | `/api/corporate/wellness-calendar/employee/events` | `authUser` | `corporate.route.js` |

---

## 40. TTS (Text-to-Speech)

**Used by:** Emergency page, AI Doctor  
**Mount:** `/api/tts`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Text-to-speech (Eleven Labs) | POST | `/api/tts/speak` | None | `tts.route.js` L21 |
| List voices | GET | `/api/tts/voices` | None | `tts.route.js` L136 |
| Status | GET | `/api/tts/status` | None | `tts.route.js` L190 |

---

## 41. OTP

**Mount:** `/api/otp`  
**Server File:** `otp.route.js`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Send OTP | POST | `/api/otp/send` | None | `otp.route.js` L26 |
| Verify OTP | POST | `/api/otp/verify` | None | `otp.route.js` L37 |
| Resend OTP | POST | `/api/otp/resend` | None | `otp.route.js` L49 |

---

## 42. Password Reset

**Mount:** `/api/password-reset`  
**Server File:** `password-reset.route.js`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Request reset | POST | `/api/password-reset/request` | None | `password-reset.route.js` L12 |
| Verify OTP | POST | `/api/password-reset/verify-otp` | None | `password-reset.route.js` L55 |
| Reset password | POST | `/api/password-reset/reset` | None | `password-reset.route.js` L98 |

---

## 43. Network Hospitals & Clinics

**Frontend Pages:** `/patient/network-hospitals`, `/patient/network-clinics`  
**Components:** `NetworkHospitals.tsx`, `NetworkClinics.tsx`

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| List network clinics | GET | `/api/patient/provider-clinics` | `authUser` | `patient.route.js` / `unified-patient.routes.js` |
| List hospitals | GET | `/api/hospitals` | None | `hospital.route.js` |
| List clinics | GET | `/api/clinics` | None | `clinic.route.js` |

> `NetworkHospitals.tsx` is a **static mock** page. `NetworkClinics.tsx` calls the API for provider clinics.

---

## 44. Smart Health Dashboard

**Frontend Page:** `/smart-health`  
**Component:** `SmartHealthDashboard.tsx`

| Action | Method | API Endpoint | Auth | Notes |
|--------|--------|-------------|------|-------|
| (No API calls) | — | — | — | Static UI page |

---

## 45. AI Health Analysis

**Frontend Page:** `/patient/ai-health-analysis`  
**Component:** `AIHealthAnalysis.tsx`  
**Service:** `orchestrator.ts` (`orchestratorAPI`)

| Action | Method | API Endpoint | Auth | Server File |
|--------|--------|-------------|------|-------------|
| Get health score | GET | `/api/v3/ai-intelligence/health-score` | `authUser` | `ai-intelligence.route.js` |
| Get risk assessment | GET | `/api/v3/ai-intelligence/risk-assessment` | `authUser` | `ai-intelligence.route.js` |
| AI Brain think | POST | `/api/v3/ai-brain/think` | `authUser` | `ai-brain.route.js` |

---

## 46. Pages with No Backend (Mock/Static)

These patient-facing pages exist in the frontend but use **hardcoded/mock data** with no API calls:

| Page | Route | Notes |
|------|-------|-------|
| Vital Reports | `/patient/vital-reports` | Hardcoded vital readings |
| Uploaded Documents | `/patient/documents` | Hardcoded document list |
| Buy Insurance | `/patient/buy-insurance` | Hardcoded insurance plans |
| Claims Management | `/patient/claims` | Hardcoded claims data |
| Network Hospitals | `/patient/network-hospitals` | Hardcoded hospital list |
| Smart Health Dashboard | `/smart-health` | UI-only |
| AI Report Scanner | `/report-scanner` | UI shell, no API integration |
| AI Symptom Triage | `/symptom-checker` | UI shell, endpoint exists but not integrated |
| Ayushman | `/ayushman` | UI-only, no API calls |
| Symptoms | `/symptoms` | UI-only, no API calls |
| Medicine | `/medicine` | UI-only, no API calls |
| Diet | `/diet` | UI-only, diet API exists on backend |
| Calorie Calculator | `/calorie-calculator` | Client-side calculator, no API |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Total patient-facing routes** | ~65 |
| **Routes with active API integration** | ~45 |
| **Routes with mock/static data** | ~13 |
| **Total unique backend endpoints used** | ~180+ |
| **Server route files relevant to patients** | 30+ |
| **Backend endpoints using `authUser`** | 150+ |
| **Endpoints with no auth (public)** | ~20 |

---

## Architecture Notes

1. **API Client:** Single axios instance at `client/src/lib/api.ts` with base URL from `VITE_API_URL`, auto-attaches JWT from `localStorage.token`
2. **Auth Middleware:** `authUser` = JWT verification for any logged-in user; `authDoctor`, `authAdmin` restrict to those roles
3. **Server Mounts:** All patient routes mount under `/api/` defined in `server/app.js`
4. **AI Stack:** Three-tier AI: `ai.js` (basic), `medical-ai.route.js` (clinical), `ai-brain.route.js` (agentic orchestrator with tools)
5. **Payment:** Razorpay integration in both `wallet.route.js` and `billing.route.js`
6. **Real-time:** Socket.io via `SocketProvider` context for chat and notifications
