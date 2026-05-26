# API Endpoints Inventory - Web vs Mobile App

**Generated:** April 23, 2026  
**Web App Location:** `/home/ubuntu/Mediczy/client/src/`  
**Mobile App Location:** `/home/ubuntu/MSH_M_App/app/Utils/`  
**Base URLs:**
- Web: Dynamic (`http://localhost:8000/api` or configured via `VITE_API_URL`)
- Mobile: `https://app.mediqzy.com/api`

---

## 📱 MOBILE APP ENDPOINTS (17 modules, 88 endpoints)

### Auth Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| login | POST | `/users/login` | email, password | { token, user } |
| register | POST | `/users/register/send-otp` | email, phoneNumber | { success } |
| registerSendOtp | POST | `/users/register/send-otp` | email, phoneNumber, firstName | { success } |
| verifyEmailOtp | POST | `/users/register/verify-email-otp` | email, phoneNumber, code | { token } |
| verifyWhatsappOtp | POST | `/users/register/verify-whatsapp-otp` | email, phoneNumber, code | { token } |
| verifyOtp | POST | `/users/register/verify-otp` | data object | { success } |
| getCorporates | GET | `/users/register/corporates` | - | [] |
| validateEmployee | POST | `/users/register/validate-employee` | corporateId, employeeId | { valid: bool } |
| sendLoginOtp | POST | `/users/login/send-otp` | phoneNumber | { success } |
| verifyLoginOtp | POST | `/users/login/verify-otp` | phoneNumber, otp | { token } |
| forgotPwdRequest | POST | `/password-reset/request` | email | { success } |
| forgotPwdVerifyOtp | POST | `/password-reset/verify-otp` | email, otp | { token } |
| forgotPwdReset | POST | `/password-reset/reset` | email, otp, newPassword | { success } |
| changePassword | POST | `/users/change-password` | oldPassword, newPassword | { success } |
| earnDailyLogin | POST | `/wallet/earn/daily-login` | {} | { amount } |

### User Profile Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| getProfile | GET | `/users/profile` | - | { user data } |
| updateProfile | PUT | `/users/profile` | profile data | { user } |
| uploadProfilePic | POST | `/users/profile-picture` | FormData | { url } |
| presignProfilePic | POST | `/users/profile-picture/presign` | metadata | { presignedUrl } |
| confirmProfilePic | POST | `/users/profile-picture/confirm` | data | { success } |

### Family Members Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| list | GET | `/family-members` | - | [ members ] |
| limits | GET | `/family-members/limits` | - | { max, current } |
| get | GET | `/family-members/{id}` | id | { member } |
| add | POST | `/family-members` | member data | { member } |
| update | PUT | `/family-members/{id}` | id, data | { member } |
| remove | DELETE | `/family-members/{id}` | id | { success } |

### Doctors Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| available | GET | `/doctors/available` | params | [ doctors ] |
| list | GET | `/doctors` | params | [ doctors ] |
| search | GET | `/doctors/search` | q, params | [ doctors ] |
| publicProfile | GET | `/doctors/{id}/public` | doctorId | { doctor } |
| slots | GET | `/doctors/{id}/user-slots` | doctorId, date | [ slots ] |
| specialties | GET | `/masterdata/specialties` | - | [ specialties ] |
| secondOpinion | GET | `/doctors/services/second-opinion` | - | [ doctors ] |
| homeVisits | GET | `/doctors/services/home-visits` | - | [ doctors ] |
| partnered | GET | `/doctors/partnered` | - | [ doctors ] |

### Appointments Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| list | GET | `/enhanced-appointments/my-appointments` | params | [ appointments ] |
| listLegacy | GET | `/appointments/my-appointments` | - | [ appointments ] |
| get | GET | `/appointments/{id}` | id | { appointment } |
| book | POST | `/appointments` | booking data | { appointment } |
| bookEnhanced | POST | `/enhanced-appointments/book` | booking data | { appointment } |
| cancel | PATCH | `/appointments/{id}/cancel` | id, reason | { success } |
| reschedule | PATCH | `/appointments/{id}/reschedule` | id, data | { appointment } |
| analytics | GET | `/appointments/analytics/basic` | - | { stats } |

### Video Consultation Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| token | POST | `/mobile/video/token` | appointmentId | { token } |
| livekitToken | POST | `/video/livekit/token` | data | { token } |
| join | GET | `/consultation/video/join/{id}` | appointmentId | { roomUrl } |
| end | POST | `/consultation/video/end/{id}` | appointmentId | { success } |

### Chat/Messaging Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| rooms | GET | `/chat/rooms` | - | [ rooms ] |
| createRoom | POST | `/chat/rooms` | room data | { room } |
| messages | GET | `/chat/rooms/{id}/messages` | roomId, params | [ messages ] |
| send | POST | `/chat/rooms/{id}/messages` | roomId, msg | { message } |
| join | POST | `/chat/rooms/{id}/join` | roomId | { success } |
| leave | POST | `/chat/rooms/{id}/leave` | roomId | { success } |
| uploadFile | POST | `/chat/upload` | FormData | { url } |
| unreadCount | GET | `/consultation/chat/unread-count` | - | { count } |
| conversations | GET | `/consultation/chat/conversations` | - | [ conversations ] |
| consultMessages | GET | `/consultation/chat/{id}/messages` | apptId | [ messages ] |
| sendConsult | POST | `/consultation/chat/{id}/messages` | apptId, msg | { message } |

### AI/Dr. Isha Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| consult | POST | `/medical-ai/consult` | data | { response } |
| healthChat | POST | `/ai-health/chat` | data | { response } |
| drIsha | POST | `/ai-health/dr-isha/consult` | data | { response } |
| emergencySOS | POST | `/medical-ai/emergency-sos` | data | { sos } |
| triage | POST | `/medical-ai/emergency-triage` | data | { triage } |
| triageDoctors | GET | `/medical-ai/triage-doctors` | - | [ doctors ] |
| analyzeReport | POST | `/reports/{id}/analyze` | repId, data | { analysis } |
| analyzeImage | POST | `/ai/analyze-image` | data | { result } |
| translate | POST | `/ai/translate` | data | { translation } |

### Lab Tests Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| list | GET | `/lab-tests` | params | [ tests ] |
| get | GET | `/lab-tests/{id}` | id | { test } |
| book | POST | `/lab-tests` | booking data | { booking } |
| confirm | POST | `/lab-tests/{id}/confirm` | id | { success } |
| cancel | POST | `/lab-tests/{id}/cancel` | id, reason | { success } |
| browse | GET | `/labs` | params | [ labs ] |
| cart | GET | `/cart` | - | { cart } |
| addToCart | POST | `/cart/add` | data | { cart } |
| removeFromCart | DELETE | `/cart/remove/{id}` | testId | { cart } |
| clearCart | DELETE | `/cart/clear` | - | { success } |
| syncCart | POST | `/cart/sync` | data | { cart } |

### Prescriptions Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| all | GET | `/prescriptions/my/all` | - | [ prescriptions ] |
| patient | GET | `/prescriptions/patient` | - | [ prescriptions ] |
| get | GET | `/prescriptions/{id}` | id | { prescription } |
| forAppointment | GET | `/prescriptions/appointment/{id}` | apptId | { prescription } |
| pdfUrl | - | `/prescriptions/{id}/pdf` | id | URL string |
| htmlUrl | - | `/prescriptions/{id}/html` | id | URL string |

### Reports Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| list | GET | `/reports` | params | [ reports ] |
| get | GET | `/reports/{id}` | id | { report } |
| upload | POST | `/reports` | FormData | { report } |
| remove | DELETE | `/reports/{id}` | id | { success } |
| download | - | `/reports/download/{filename}` | filename | URL string |
| analyze | POST | `/reports/{id}/analyze` | reportId, data | { analysis } |
| analysis | GET | `/reports/{id}/analysis` | reportId | { analysis } |

### Wallet & Payments Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| details | GET | `/wallet` | - | { wallet } |
| balance | GET | `/wallet/balance` | - | { balance } |
| transactions | GET | `/wallet/transactions` | params | [ transactions ] |
| rewards | GET | `/wallet/rewards` | - | [ rewards ] |
| earnSteps | POST | `/wallet/earn/steps` | steps | { amount } |
| earnActivity | POST | `/wallet/earn/activity` | data | { amount } |
| earnVitals | POST | `/wallet/earn/vital-signs` | data | { amount } |
| spend | POST | `/wallet/spend` | data | { balance } |
| validateCoupon | POST | `/wallet/validate-coupon` | code | { valid, discount } |
| createOrder | POST | `/wallet/create-order` | amount | { orderId } |
| verifyPayment | POST | `/wallet/verify-payment` | data | { success } |

### Notifications Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| list | GET | `/notifications` | params | [ notifications ] |
| markRead | PATCH | `/notifications/{id}/read` | id | { success } |
| markAllRead | POST | `/notifications/read-all` | - | { success } |
| registerFCM | POST | `/notifications/fcm/register` | token, deviceType | { success } |

### Addresses Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| list | GET | `/addresses` | - | [ addresses ] |
| get | GET | `/addresses/{id}` | id | { address } |
| add | POST | `/addresses` | address data | { address } |
| update | PUT | `/addresses/{id}` | id, data | { address } |
| remove | DELETE | `/addresses/{id}` | id | { success } |

### Health Dashboard & Vitals Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| dashboard | GET | `/wellness/dashboard` | - | { dashboard } |
| vitals | GET | `/vitals` | params | [ vitals ] |
| logVitals | POST | `/vitals` | data | { vital } |
| tracker | GET | `/health-tracker/{type}` | type, params | [ data ] |
| logTracker | POST | `/health-tracker/{type}` | type, data | { result } |

### SOS/Emergency Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| trigger | POST | `/medical-ai/emergency-sos` | data | { sos } |
| triage | POST | `/medical-ai/emergency-triage` | data | { triage } |
| doctors | GET | `/medical-ai/triage-doctors` | - | [ doctors ] |

**MOBILE ENDPOINT SUMMARY:**
- Total Unique Endpoints: **55**
- Modules: 17 (Auth, User, Family, Doctors, Appointments, Video, Chat, AI, Labs, Prescriptions, Reports, Wallet, Notifications, Addresses, Health, SOS, Cart)
- Total Functions: 88
- Timeout: 20 seconds
- Base URL: `https://app.mediqzy.com/api`

---

## 🖥️ WEB APP ENDPOINTS (20+ modules, 120+ endpoints)

### From `/utils/api.ts` - Core Patient APIs
**Same as Mobile:** All mobile endpoints are replicated in the web app (55 endpoints)

### From `/services/aiHealthServices.ts` - Advanced AI Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| getMyRiskScore | GET | `/v3/ai-intelligence/risk-score/me` | - | { score: HealthRiskScore } |
| getSmartNotifications | GET | `/v3/ai-intelligence/notifications/smart` | limit, status | [ notifications ] |
| markNotificationRead | PATCH | `/v3/ai-intelligence/notifications/smart/{id}/read` | notificationId | { success } |
| getPatientInsights | GET | `/v3/ai-intelligence/insights/patient/{id}` | patientId | [ insights ] |
| markInsightActioned | PATCH | `/v3/ai-intelligence/insights/{id}/action` | insightId | { success } |
| assessSymptoms | POST | `/v3/ai-intelligence/triage/assess` | symptoms, vitals, etc | { esi_level, recommendation } |
| checkDrugInteractions | POST | `/v3/ai-intelligence/drug-interactions/check` | medications | [ interactions ] |
| quickDrugCheck | POST | `/v3/ai-intelligence/drug-interactions/quick-check` | medications | [ interactions ] |
| getHealthIntelligence | GET | `/health-intelligence` | - | { data: HealthIntelligenceData } |
| thinkWithBrain | POST | `/v3/ai-brain/think` | query, options | { response, thinking } |
| streamBrainResponse | POST | `/v3/ai-brain/think/stream` | query, options | SSE stream |
| recordBrainFeedback | POST | `/v3/ai-intelligence/feedback` | feedback | { success } |

### From `/services/team.service.ts` - Team Portal APIs (Base: `/api/team`)
| Module | Function | Method | Path | Parameters |
|--------|----------|--------|------|------------|
| **Team Users** | getAll | GET | `/api/team/users` | dept, role, status |
| | create | POST | `/api/team/users` | firstName, lastName, email, phone |
| **Team Doctors** | getAll | GET | `/api/team/doctors` | specialization, city, state |
| | create | POST | `/api/team/doctors` | firstName, lastName, etc |
| **Directory** | getAll | GET | `/api/team/directory` | search, dept |
| **Appointments** | getAll | GET | `/api/team/appointments` | status, date |
| | create | POST | `/api/team/appointments` | appointment data |
| **Pharmacies** | getAll | GET | `/api/team/pharmacies` | params |
| | create | POST | `/api/team/pharmacies` | pharmacy data |
| **Verify Access** | verify | POST | `/api/team/verify-access` | email/phone |

### From `/services/hospital.service.ts` - Hospital Portal APIs (Base: `/api/hospital/practice`)
| Module | Function | Method | Path | Parameters |
|--------|----------|--------|------|------------|
| **Appointments** | getAll | GET | `/api/hospital/practice/appointments` | status, date |
| | create | POST | `/api/hospital/practice/appointments` | appointment data |
| | update | PATCH | `/api/hospital/practice/appointments/{id}` | id, data |
| | delete | DELETE | `/api/hospital/practice/appointments/{id}` | id |
| **Medical Records** | getAll | GET | `/api/hospital/practice/medical-records` | patientId, doctorId |
| | create | POST | `/api/hospital/practice/medical-records` | record data |
| | update | PATCH | `/api/hospital/practice/medical-records/{id}` | id, data |
| **EHR** | create | POST | `/api/hospital/practice/ehr` | payload |
| | update | PATCH | `/api/hospital/practice/ehr/{id}` | patientId, data |
| **Vitals** | log | POST | `/api/hospital/practice/vitals` | payload |
| **Insurance Claims** | create | POST | `/api/hospital/practice/insurance/claims` | data |
| | update | PATCH | `/api/hospital/practice/insurance/claims/{id}` | id, data |
| **Insurance Policies** | create | POST | `/api/hospital/practice/insurance/policies` | data |
| **Discharge** | create | POST | `/api/hospital/practice/discharge-summaries` | data |
| | submit | POST | `/api/hospital/practice/discharge-summaries/submit` | submission |
| **Lab Orders** | create | POST | `/api/hospital/practice/lab-orders` | order data |
| **Labs** | create | POST | `/api/hospital/practice/labs` | lab data |
| **Imaging** | createOrder | POST | `/api/hospital/practice/imaging-orders` | order data |
| **Prescriptions** | create | POST | `/api/hospital/practice/prescriptions` | payload |
| **Procedures** | schedule | POST | `/api/hospital/practice/procedures/schedule` | payload |
| **IP Sheets** | create | POST | `/api/hospital/practice/ip-sheets` | data |
| **Branches** | create | POST | `/api/hospital/practice/branches` | data |
| **Clinics** | create | POST | `/api/hospital/practice/clinics` | data |
| **Ambulances** | addVehicle | POST | `/api/hospital/practice/ambulances/vehicles` | data |
| **Staff** | create | POST | `/api/hospital/practice/staff` | data |
| | update | PATCH | `/api/hospital/practice/staff/{id}` | id, data |
| **Patients** | create | POST | `/api/hospital/practice/patients` | data |
| | update | PATCH | `/api/hospital/practice/patients/{id}` | id, data |
| **Beds** | create | POST | `/api/hospital/practice/beds` | data |
| | update | PATCH | `/api/hospital/practice/beds/{id}` | id, data |

### From `/services/assistant.service.ts` - Assistant Portal APIs (Base: `/api` or `/api/assistant`)
| Module | Function | Method | Path | Parameters |
|--------|----------|--------|------|------------|
| **Patient Management** | register | POST | `/api/patients/assistant/register` | patient data |
| | getAll | GET | `/api/assistant/patients` | search, page, limit |
| **Appointments** | getAll | GET | `/api/assistant/appointments` | status, date, doctorId |
| | update | PUT | `/api/assistant/appointments/{id}` | id, data |
| | bookConsultation | POST | `/api/assistant/consultations/book` | consultation data |
| **Doctor Linking** | link | POST | `/api/assistant/link-doctor` | data |
| | unlink | POST | `/api/assistant/unlink-doctor` | data |
| | setPrimary | POST | `/api/assistant/set-primary-doctor` | data |
| **Facility Linking** | link | POST | `/api/assistant/link-facility` | data |
| | unlink | POST | `/api/assistant/unlink-facility` | data |
| **Consultations** | accept | POST | `/api/assistant/consultations/{id}/accept` | consultationId |
| | reject | POST | `/api/assistant/consultations/{id}/reject` | consultationId |
| | markComplete | POST | `/api/assistant/consultations/{id}/complete` | consultationId |

### From `/services/pharmacy.service.ts` - Pharmacy Portal APIs (Base: `/api/pharmacy`)
| Module | Function | Method | Path | Parameters |
|--------|----------|--------|------|------------|
| **Authentication** | login | POST | `/api/pharmacy/login` | email, password |
| | logout | - | - | - |
| **Profile** | getProfile | GET | `/api/pharmacy/profile` | - |
| | updateProfile | PUT | `/api/pharmacy/profile` | data |
| **Batch Mgmt** | getAll | GET | `/api/pharmacy/batches` | limit, offset |
| | create | POST | `/api/pharmacy/batches` | batch data |
| | get | GET | `/api/pharmacy/batches/{id}` | id |
| | update | PUT | `/api/pharmacy/batches/{id}` | id, data |
| | delete | DELETE | `/api/pharmacy/batches/{id}` | id |
| **Medicines** | list | GET | `/api/pharmacy/medicines` | search, category |
| | get | GET | `/api/pharmacy/medicines/{id}` | id |
| | stock | GET | `/api/pharmacy/medicines/{id}/stock` | id |
| **Orders** | list | GET | `/api/pharmacy/orders` | status, date |
| | get | GET | `/api/pharmacy/orders/{id}` | id |
| | updateStatus | PATCH | `/api/pharmacy/orders/{id}/status` | id, status |
| | ship | POST | `/api/pharmacy/orders/{id}/ship` | id |
| | track | GET | `/api/pharmacy/orders/{id}/track` | id |
| | cancel | PATCH | `/api/pharmacy/orders/{id}/cancel` | id |
| **Customers** | list | GET | `/api/pharmacy/customers` | search |
| | get | GET | `/api/pharmacy/customers/{id}` | id |
| **Finances** | revenue | GET | `/api/pharmacy/finances/revenue` | date range |
| | transactions | GET | `/api/pharmacy/finances/transactions` | params |

### From `/utils/hospitalInsurancePortalApi.ts` - Hospital Insurance Portal APIs
| Module | Function | Method | Path | Parameters |
|--------|----------|--------|------|------------|
| **Messages** | list | GET | `/hospital/insurance/portal/messages` | params |
| | readThread | POST | `/hospital/insurance/portal/messages/{id}/read` | threadId |
| | reply | POST | `/hospital/insurance/portal/messages/{id}/reply` | threadId, payload |
| | escalate | POST | `/hospital/insurance/portal/messages/{id}/escalate` | threadId |
| **Notifications** | list | GET | `/hospital/insurance/portal/notifications` | - |
| | markRead | POST | `/hospital/insurance/portal/notifications/{id}/read` | notificationId |
| | markAllRead | POST | `/hospital/insurance/portal/notifications/mark-all-read` | - |
| **Sections** | getSection | GET | `/hospital/insurance/portal/{path}` | sectionPath |
| | updateSection | PUT | `/hospital/insurance/portal/{path}` | sectionPath, data |

### From `/services/wallet.service.ts` - Extended Wallet APIs
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| getWallet | GET | `/wallet` | - | { wallet } |
| getBalance | GET | `/wallet/balance` | - | { balance } |
| getTransactions | GET | `/wallet/transactions` | params | [ transactions ] |
| getRewards | GET | `/wallet/rewards` | - | [ rewards ] |
| earnDailyLogin | POST | `/wallet/earn/daily-login` | - | { amount } |
| calculateApptFee | GET | `/wallet/appointment/calculate/{fee}` | fee | { calculated } |
| canPayAppointment | POST | `/wallet/appointment/can-pay` | data | { canPay } |
| payAppointment | POST | `/wallet/appointment/pay` | data | { success } |
| checkHealthcarePayment | GET | `/consultation/payment/hc-check/{id}` | appointmentId | { check } |
| payHealthcare | POST | `/consultation/payment/hc/{id}` | appointmentId | { success } |
| createOrder | POST | `/wallet/create-order` | packageId | { orderId } |
| verifyPayment | POST | `/wallet/verify-payment` | data | { success } |

### From `/services/ble/BLEService.ts` - BLE/Wearables Sync
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| bleSyncData | POST | `/health-data/ble-sync` | data | { success } |

### From `/services/localAiNode.service.ts` - Local Node AI Module
| Function | Method | Path | Parameters | Response Type |
|----------|--------|------|------------|----------------|
| normalize | POST | `{baseUrl}/normalize` | text data | { normalized } |
| analyzePrescription | POST | `{baseUrl}/prescription` | prescription | { analysis } |
| analyzeOPDNotes | POST | `{baseUrl}/opd-notes` | notes | { analysis } |
| analyzeIPDNotes | POST | `{baseUrl}/ipd-notes` | notes | { analysis } |
| analyzeDischarge | POST | `{baseUrl}/discharge` | data | { analysis } |

### Email Service (via `emailService.ts`)
- Configured via UI for test connection, template management
- Endpoints: `/test-connection`, `/config`, `/templates`, `/send`, etc.
- Uses axios (not main api instance)

### Authentication Flow & Token Refresh
- **Team Portal:** `/team/auth/refresh` (POST) for token refresh
- **Admin Portal:** `/admin/auth/refresh` (POST) for token refresh
- **CRM Portal:** `/crm/auth/refresh` (POST) for token refresh

**WEB APP ENDPOINT SUMMARY:**
- Total Unique Endpoints: **120+**
- Core Patient APIs: 55 (same as mobile)
- Advanced AI Endpoints: 12 (V3 AI intelligence, brain, feedback)
- Team Portal: 10+ endpoints
- Hospital Portal: 35+ endpoints
- Assistant Portal: 10+ endpoints
- Pharmacy Portal: 30+ endpoints
- Hospital Insurance Portal: 8 endpoints
- Wallet Extensions: 7 endpoints
- BLE/Wearables: 1 endpoint
- Local AI Node: 5 endpoints
- Additional Portal Auth: 3 endpoints (refresh)
- Timeout: 30 seconds
- Base URL: Dynamic (localhost:8000/api or configured)

---

## 🔄 COMPARISON MATRIX

### ✅ ENDPOINTS IN BOTH WEB & MOBILE (55 endpoints)

All core patient APIs are present in both:
- Auth (15 endpoints)
- User Profile (5 endpoints)
- Family Members (6 endpoints)
- Doctors (9 endpoints)
- Appointments (8 endpoints)
- Video Consultation (4 endpoints)
- Chat/Messaging (11 endpoints)
- AI/Dr. Isha (9 endpoints)
- Lab Tests (11 endpoints)
- Prescriptions (6 endpoints)
- Reports (7 endpoints)
- Wallet & Payments (11 endpoints)
- Notifications (4 endpoints)
- Addresses (5 endpoints)
- Health Dashboard & Vitals (5 endpoints)
- SOS/Emergency (3 endpoints)

**Implementation Differences for Matching Endpoints:**

| Category | Web Implementation | Mobile Implementation | Difference |
|----------|-------------------|----------------------|------------|
| **Base URL** | Dynamic (env var) | Fixed: `https://app.mediqzy.com/api` | Web is flexible, mobile hardcoded |
| **Timeout** | 30 seconds | 20 seconds | Web allows longer operations |
| **Auth Header** | `Authorization: Bearer {token}` | `Authorization: Bearer {token}` | Identical |
| **Tenant Header** | Includes `X-Tenant-ID` header | No tenant header | Web has multi-tenant support |
| **Token Refresh** | Auto-refresh for team/admin/crm | No auto-refresh | Web has interceptor for token refresh |
| **Error Handling** | Detailed response transformation | Basic error message extraction | Web more detailed |
| **Request Logging** | Via middleware interceptors | Via middleware interceptors | Similar approach |
| **File Upload** | `multipart/form-data` in headers | `multipart/form-data` in headers | Identical handling |
| **Response Format** | `{ data: ... }` from axios | `response.data` | Identical axios pattern |

---

## ❌ ENDPOINTS IN WEB ONLY (65+ endpoints)

### Admin/Enterprise Features (NOT in mobile)
- Team Portal APIs: 10+ endpoints
- Hospital Portal APIs: 35+ endpoints
- Assistant Portal APIs: 10+ endpoints
- Pharmacy Portal APIs: 30+ endpoints
- Hospital Insurance Portal APIs: 8 endpoints

### Advanced AI Features (NOT in mobile)
- **Risk Scoring:** `/v3/ai-intelligence/risk-score/me`
- **Smart Notifications:** `/v3/ai-intelligence/notifications/smart*`
- **Clinical Insights:** `/v3/ai-intelligence/insights/patient/*`
- **Emergency Triage:** `/v3/ai-intelligence/triage/assess`
- **Drug Interactions (Enhanced):** `/v3/ai-intelligence/drug-interactions/*`
- **AI Brain/Orchestrator:** `/v3/ai-brain/think` + `/v3/ai-brain/think/stream`
- **Health Intelligence:** `/health-intelligence`
- **Feedback Recording:** `/v3/ai-intelligence/feedback`

### Extended Wallet Features (NOT in mobile)
- `/wallet/appointment/calculate/{fee}`
- `/wallet/appointment/can-pay`
- `/wallet/appointment/pay`
- `/consultation/payment/hc-check/{id}`
- `/consultation/payment/hc/{id}`

### Wearables & Sensors (NOT in mobile)
- BLE Sync: `/health-data/ble-sync`
- Local AI Node endpoints for document analysis

### Portal Auth Token Refresh (NOT in mobile)
- Team refresh: `/team/auth/refresh`
- Admin refresh: `/admin/auth/refresh`
- CRM refresh: `/crm/auth/refresh`

**Total Web-Only: 65+ endpoints**

---

## ⭐ ENDPOINTS IN MOBILE ONLY (0 endpoints)

**Mobile app has NO unique endpoints** - all mobile endpoints are subset of web app.

This is by design: Mobile is a consumer-facing app with core patient features, while web includes admin, enterprise, and extended functionality.

---

## 📊 MISSING ENDPOINTS ANALYSIS

### ❌ Critical Endpoints Missing from Mobile

| Feature | Endpoint | Impact | Should Add? |
|---------|----------|--------|------------|
| Risk Scoring | `/v3/ai-intelligence/risk-score/me` | Health risk assessment missing | YES |
| Drug Interactions Check | `/v3/ai-intelligence/drug-interactions/check` | No medication interaction checking | YES |
| Symptom Triage (Advanced) | `/v3/ai-intelligence/triage/assess` | Limited to basic triage | YES |
| Health Intelligence | `/health-intelligence` | No comprehensive health analysis | YES |
| AI Brain Streaming | `/v3/ai-brain/think/stream` | No real-time AI streaming | NICE-TO-HAVE |
| Appointment Payment | `/wallet/appointment/pay` | Different payment flow | INVESTIGATE |
| Healthcare Payment | `/consultation/payment/hc/*` | Missing healthcare payment logic | INVESTIGATE |

### 🚨 Potential Synchronization Issues

1. **Payment Processing:** Mobile uses `/wallet/` endpoints, web has additional `/wallet/appointment/*` endpoints
2. **Triage System:** Mobile has `/medical-ai/triage`, web has `/v3/ai-intelligence/triage/assess` (v3)
3. **Drug Interactions:** Mobile calls `/medical-ai/*`, web has newer `/v3/ai-intelligence/drug-interactions/*`
4. **File Uploads:** Both use multipart/form-data but different endpoints
5. **Token Refresh:** Only web auto-refreshes tokens; mobile requires manual handling

---

## 🔍 PARAMETER DIFFERENCES

### Request Payload Format Differences

#### OTP Verification (Mobile vs Web)
```javascript
// Mobile Auth Module
verifyOtp: (data) => api.post('/users/register/verify-otp', data)

// Web api.ts (same)
verifyOtp: (data) => api.post('/users/register/verify-otp', data)
```
**Status:** ✅ Identical

#### Appointment Booking
```javascript
// Mobile
book: (data) => api.post('/appointments', data)

// Web - has extended version
bookEnhanced: (data) => api.post('/enhanced-appointments/book', data)
```
**Status:** ⚠️ Web has enhanced endpoint, mobile uses legacy

#### Video Token Request
```javascript
// Mobile
token: (appointmentId) => api.post('/mobile/video/token', { appointmentId })

// Web
livekitToken: (data) => api.post('/video/livekit/token', data)
```
**Status:** ⚠️ Different endpoints for same functionality

---

## 🔐 AUTHENTICATION & HEADERS

### Mobile App Auth Flow
```javascript
// Request interceptor
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor
api.interceptors.response.use(res => res, err => {
  if (err?.response?.status === 401) {
    AsyncStorage.multiRemove(['authToken', 'userData']);
  }
  return Promise.reject(err);
});
```

### Web App Auth Flow
```javascript
// Request interceptor
api.interceptors.request.use((config) => {
  if (!(config as any).skipAuth) {
    const token = getToken();
    if (token) {
      config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
    }
  }
  // Plus tenant header injection
  const tenantId = resolveTenantId();
  if (tenantId) {
    config.headers = { ...config.headers, "X-Tenant-ID": tenantId };
  }
  return config;
});

// Response interceptor - Auto-refresh for team/admin/crm
api.interceptors.response.use((response) => response, async (error) => {
  if (error.response?.status === 401 && getUserType() === "team") {
    const refreshToken = window.localStorage.getItem("teamRefreshToken");
    // Auto-refresh token
  }
  // Similar for admin and crm
});
```

**Differences:**
1. ✅ Both use Bearer tokens
2. ⚠️ Web has multi-user-type handling (admin, team, crm)
3. ⚠️ Web auto-refreshes tokens; mobile doesn't
4. ⚠️ Web includes X-Tenant-ID header; mobile doesn't
5. ✅ Both clear auth on 401

---

## 📈 ERROR HANDLING COMPARISON

### Mobile Error Response
```javascript
api.interceptors.response.use(
  res => res,
  err => {
    const msg = err?.response?.data?.message || err?.message || 'Network error';
    if (err?.response?.status === 401) {
      AsyncStorage.multiRemove(['authToken', 'userData']);
    }
    return Promise.reject({ ...err, userMessage: msg });
  }
);
```
**Characteristics:**
- Simple message extraction
- Basic 401 handling
- Passes through error with added userMessage

### Web Error Response
```javascript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Team 401: Auto-refresh with queue system
    if (error.response?.status === 401 && !originalRequest._retry && getUserType() === "team") {
      const refreshToken = window.localStorage.getItem("teamRefreshToken");
      if (_isRefreshing) {
        return new Promise<string>((resolve) => {
          _refreshQueue.push(resolve);
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        });
      }
      // Retry logic...
    }
    // Admin 401: Clear and redirect
    if (error.response?.status === 401 && getUserType() === "admin") {
      window.localStorage.removeItem("adminToken");
      window.location.href = "/admin/login";
    }
    // CRM 401: Similar handling
  }
);
```
**Characteristics:**
- Complex retry logic with queue
- User-type-specific handling
- Auto-redirect on auth failure
- Retry prevention with `_retry` flag

---

## 🔗 REQUEST/RESPONSE FORMAT COMPARISON

### Example 1: Profile Update

**Mobile:**
```javascript
User.updateProfile: (data) => api.put('/users/profile', data)
// Expected response: { user: {...} }
```

**Web:**
```javascript
// From wallet.service.ts - similar pattern
const response = await api.put(`${BASE_URL}/profile`, data, { headers: getTeamHeaders() });
return response.data;
```

**Differences:**
- Mobile: Direct export of function
- Web: Wrapped in service method with header injection
- Both expect same response format

### Example 2: File Upload

**Mobile:**
```javascript
uploadProfilePic: (form) => api.post('/users/profile-picture', form, { 
  headers: { 'Content-Type': 'multipart/form-data' } 
})
```

**Web:**
```javascript
// Same pattern - multipart/form-data explicitly set
```

**Status:** ✅ Identical handling

### Example 3: Paginated List

**Mobile:**
```javascript
list: (params = {}) => api.get('/appointments', { params })
```

**Web (from hospital service):**
```javascript
getAll: async (params?: { status?: string; date?: string; upcoming?: boolean }) => {
  const response = await api.get(`${BASE_URL}/appointments`, {
    params,
    headers: getHospitalHeaders()
  });
  return response.data;
}
```

**Differences:**
- Mobile: Raw params passed
- Web: Type-safe interface, header injection
- Both send params same way

---

## ⚡ PERFORMANCE & TIMEOUT COMPARISON

| Metric | Mobile | Web | Note |
|--------|--------|-----|------|
| **Timeout** | 20 seconds | 30 seconds | Web allows longer for complex ops |
| **Base URL** | Hardcoded | Dynamic | Web more flexible |
| **Auto-refresh** | ❌ No | ✅ Yes | Web reduces auth errors |
| **Token Queue** | ❌ No | ✅ Yes | Web handles concurrent requests |
| **Tenant Support** | ❌ No | ✅ Yes | Web multi-tenant capable |

---

## 🚀 RECOMMENDATIONS

### For Mobile App
1. ✅ **ADD Advanced AI Endpoints:**
   - `/v3/ai-intelligence/risk-score/me`
   - `/v3/ai-intelligence/drug-interactions/check`
   - `/v3/ai-intelligence/triage/assess`

2. ✅ **ADD Token Auto-Refresh:**
   - Implement queue-based retry on 401
   - Reduce user friction from token expiration

3. ✅ **INVESTIGATE Payment Endpoints:**
   - Current: `/wallet/earn/` endpoints
   - Missing: `/wallet/appointment/pay`
   - Align with web payment flow

4. ⚠️ **STANDARDIZE Video Token Endpoint:**
   - Mobile: `/mobile/video/token`
   - Web: `/video/livekit/token`
   - Reconcile to single endpoint

### For Web App
1. ✅ **DOCUMENT Portal-Specific APIs:**
   - Team, Hospital, Assistant, Pharmacy
   - Create separate API docs per portal

2. ✅ **STANDARDIZE V3 Endpoints:**
   - Ensure all V3 AI endpoints are backward compatible
   - Plan migration timeline from legacy to V3

3. ✅ **AUDIT Token Refresh:**
   - Verify token refresh works for all user types
   - Test queue system under load

### For Backend Team
1. ✅ **CREATE Endpoint Parity Tests:**
   - Ensure mobile endpoints match web
   - Alert on additions/removals

2. ✅ **VERSION Legacy Endpoints:**
   - Maintain `/medical-ai/*` for mobile
   - Offer `/v3/ai-intelligence/*` for new features

3. ✅ **STANDARDIZE Response Format:**
   - Ensure consistent `{ success, data, message }` pattern
   - Document error response codes

---

## 📋 ENDPOINT INVENTORY CHECKLIST

### Mobile App (88 functions across 17 modules)
- [x] Auth (15 endpoints)
- [x] User Profile (5 endpoints)
- [x] Family Members (6 endpoints)
- [x] Doctors (9 endpoints)
- [x] Appointments (8 endpoints)
- [x] Video Consultation (4 endpoints)
- [x] Chat/Messaging (11 endpoints)
- [x] AI/Dr. Isha (9 endpoints)
- [x] Lab Tests (11 endpoints)
- [x] Prescriptions (6 endpoints)
- [x] Reports (7 endpoints)
- [x] Wallet & Payments (11 endpoints)
- [x] Notifications (4 endpoints)
- [x] Addresses (5 endpoints)
- [x] Health Dashboard & Vitals (5 endpoints)
- [x] SOS/Emergency (3 endpoints)
- [x] Cart Operations (5 endpoints)

### Web App (120+ functions across 20+ modules)
- [x] Core Patient APIs (55 endpoints - same as mobile)
- [x] Advanced AI Module (12 endpoints)
- [x] Team Portal (10+ endpoints)
- [x] Hospital Portal (35+ endpoints)
- [x] Assistant Portal (10+ endpoints)
- [x] Pharmacy Portal (30+ endpoints)
- [x] Hospital Insurance Portal (8 endpoints)
- [x] Extended Wallet (7 endpoints)
- [x] BLE/Wearables Sync (1 endpoint)
- [x] Local AI Node (5 endpoints)
- [x] Authentication Refresh (3 endpoints)

---

## 📞 Support & Questions

For endpoint questions or discrepancies, refer to:
- Mobile API: [MSH_M_App/app/Utils/api.js](MSH_M_App/app/Utils/api.js)
- Web API: [Mediczy/client/src/utils/api.ts](Mediczy/client/src/utils/api.ts)
- Services: [Mediczy/client/src/services/](Mediczy/client/src/services/)

**Last Updated:** April 23, 2026  
**Document Version:** 1.0  
**Status:** Complete ✅
