# Mediczy Platform - Complete Testing Guide

## 🚀 Application Status
- **Backend**: ✅ Running on http://localhost:8000
- **Frontend**: ✅ Running on http://localhost:8081
- **Database**: ✅ MariaDB connected and synced
- **Redis**: ✅ Connected (v6.0.16)
- **Kafka**: ✅ Producer connected
- **BullMQ**: ✅ Queues initialized

## ⚠️ Known Warnings (Non-Critical)
- Firebase credentials not found (push notifications disabled)
- Redis version 6.0.16 (recommended: 6.2.0+)

---

## 📋 Testing Checklist

### 1. Authentication System ✓
**Test User Registration:**
- [ ] Navigate to http://localhost:8081
- [ ] Click "Register" or "Sign Up"
- [ ] Fill in user details (name, email, password, phone)
- [ ] Submit and verify JWT token is stored
- [ ] Check that user is redirected to dashboard

**Test User Login:**
- [ ] Go to login page
- [ ] Enter registered credentials
- [ ] Verify successful login and token storage
- [ ] Check user role (patient/doctor/admin)

**Test Doctor Registration:**
- [ ] Navigate to doctor registration
- [ ] Fill in doctor-specific fields (specialization, qualification, registration number)
- [ ] Upload documents if required
- [ ] Submit and verify doctor profile creation

**Test Admin Access:**
- [ ] Login with admin credentials
- [ ] Verify admin menu appears in sidebar
- [ ] Check access to admin routes

---

### 2. Membership Plans System ✓

#### Admin Side (http://localhost:8081/admin/plans)
**Test Plan Creation:**
- [ ] Login as admin
- [ ] Navigate to "My Members" or "Plans"
- [ ] Click "Create Plan"
- [ ] Fill in plan details:
  - Name (e.g., "Gold Plan")
  - Duration (30/90/180/365 days)
  - Price
  - Description
- [ ] Add Teleconsultation Limits:
  - Option 1: "All Specialties" with count (e.g., 10)
  - Option 2: Per-specialty (Cardiology: 5, Dermatology: 3, etc.)
- [ ] Add Benefit Limits:
  - Pharmacy INR (e.g., 500)
  - Home Care INR (e.g., 1000)
  - Ambulance INR (e.g., 2000)
- [ ] Add Health Check Package (optional)
- [ ] Save and verify plan appears in list

**Test Plan Editing:**
- [ ] Click "Edit" on existing plan
- [ ] Modify any field
- [ ] Save and verify changes persist

**Test Plan Deletion:**
- [ ] Click "Delete" on test plan
- [ ] Confirm deletion
- [ ] Verify plan removed from list

#### User Side (http://localhost:8081/my-plans)
**Test Plan Subscription:**
- [ ] Login as regular user (patient)
- [ ] Navigate to "My Plans"
- [ ] View available plans
- [ ] Click "Subscribe" on a plan
- [ ] Verify optimistic UI update (immediate feedback)
- [ ] Check that plan appears as "Active"
- [ ] Verify remaining limits display correctly

**Test Usage Tracking:**
- [ ] With active plan, book and complete a consultation
- [ ] After doctor marks appointment "Completed"
- [ ] Navigate to "My Plans"
- [ ] Verify:
  - [ ] Green animated banner appears ("Your plan usage has been updated!")
  - [ ] Teleconsult count decremented
  - [ ] Usage stats updated
  - [ ] Banner auto-dismisses after 5 seconds

---

### 3. Insurance Management System ✓

#### Admin Side (http://localhost:8081/admin/insurance)
**Test Dashboard Stats:**
- [ ] Login as admin
- [ ] Navigate to "My Insurance"
- [ ] Verify stats cards show:
  - Total Providers count
  - Total Policies count
  - Active Enrollments count
  - Pending Claims count

**Test Provider Management:**
- [ ] Click "Providers" tab
- [ ] Click "Create Provider"
- [ ] Fill in provider details:
  - Name (e.g., "ICICI Lombard")
  - Code (e.g., "ICICI01")
  - Contact email and phone
  - Website URL
  - Address
  - Network Type (TPA/Direct/Both)
  - Claim Process Days (e.g., 15)
  - Active toggle
- [ ] Save and verify provider card appears
- [ ] Test Edit: Modify provider details
- [ ] Test Delete: Remove test provider
- [ ] Verify changes persist

**Test Policy Management:**
- [ ] Click "Policies" tab
- [ ] Click "Create Policy"
- [ ] Fill in policy details:
  - Select Provider from dropdown
  - Policy Name (e.g., "Family Health Plus")
  - Policy Number
  - Policy Type (Individual/Family/Group/Senior/Critical)
  - Coverage Amount (e.g., 500000)
  - Premium Amount (e.g., 15000)
  - Co-Payment % (e.g., 10)
  - Waiting Period (days)
  - Room Rent Limit (e.g., 5000)
  - Description
  - Valid From/To dates
  - Active toggle
- [ ] Save and verify policy appears in list
- [ ] Verify provider name displays correctly
- [ ] Test Edit: Modify policy details
- [ ] Test Delete: Remove test policy

**Test Enrollments View:**
- [ ] Click "Enrollments" tab
- [ ] Verify list shows user insurance subscriptions
- [ ] Check displayed fields:
  - User ID
  - Provider name
  - Policy name
  - Enrollment number
  - Status badge (color-coded)
  - Enrollment/Expiry dates
  - Claims used (amount + count)

**Test Claims Management:**
- [ ] Click "Claims" tab
- [ ] View submitted claims list
- [ ] For each claim, verify visible:
  - Claim number
  - Provider and policy info
  - Claim amount and approved amount
  - Claim type
  - Treatment date
  - Hospital name
  - Status dropdown
- [ ] Test Status Update:
  - [ ] Select claim
  - [ ] Change status via dropdown:
    - Submitted → Under Review
    - Under Review → Approved
    - Approved → Settled
  - [ ] Verify status badge color updates
  - [ ] Check API call succeeds

---

### 4. Appointment System ✓

#### Patient Side
**Test Appointment Booking:**
- [ ] Login as patient
- [ ] Navigate to "Consultations" or "Book Appointment"
- [ ] Search for doctors by:
  - Specialty
  - Name
  - Availability
- [ ] View doctor profile (qualifications, rating, fees)
- [ ] Select available time slot
- [ ] Confirm booking
- [ ] Verify appointment appears in "My Bookings"
- [ ] Check email/SMS notification sent (if configured)

**Test Appointment Actions:**
- [ ] View upcoming appointments in "My Bookings"
- [ ] Test Cancel Appointment:
  - [ ] Click "Cancel" on booking
  - [ ] Confirm cancellation
  - [ ] Verify status changes to "Cancelled"
- [ ] Test Join Video Call:
  - [ ] For upcoming appointment, click "Join"
  - [ ] Verify Agora video interface loads
  - [ ] Test camera/microphone permissions
- [ ] Test Rate Appointment:
  - [ ] After completed consultation, rate doctor (1-5 stars)
  - [ ] Add review comment
  - [ ] Submit and verify rating saved

#### Doctor Side (http://localhost:8081/doctor/appointments)
**Test Doctor Dashboard:**
- [ ] Login as doctor
- [ ] Navigate to "Appointments" or "My Appointments"
- [ ] View appointment list with filters:
  - All
  - Pending
  - Confirmed
  - Completed
  - Cancelled

**Test Appointment Status Updates:**
- [ ] Select pending appointment
- [ ] Change status to "Confirmed"
- [ ] Verify patient receives notification
- [ ] For ongoing appointment:
  - [ ] Mark as "Completed"
  - [ ] **Verify usage increment trigger**:
    - Check server logs for usage increment call
    - Patient's membership plan usage should auto-update
  - [ ] Add consultation notes (optional)
- [ ] Test video consultation:
  - [ ] Click "Join" for confirmed appointment
  - [ ] Verify Agora video loads
  - [ ] Test screen share, chat, recording features

**Test Auto-Usage Increment:**
- [ ] Doctor marks appointment "Completed"
- [ ] Check backend logs: `POST /api/membership/usage/teleconsult`
- [ ] Patient navigates to "My Plans"
- [ ] Verify:
  - [ ] Teleconsult count decremented
  - [ ] Animated banner shows usage update
  - [ ] Remaining limits updated

---

### 5. Health Tracking ✓
**Test Vitals Entry:**
- [ ] Login as patient
- [ ] Navigate to "Health Tracker"
- [ ] Add vitals:
  - Blood Pressure (systolic/diastolic)
  - Heart Rate (bpm)
  - Blood Sugar (mg/dL)
  - Weight (kg)
  - Temperature (°F)
  - Oxygen Saturation (%)
- [ ] Submit and verify saved
- [ ] Check vitals display in chart/graph format

**Test Health Metrics Dashboard:**
- [ ] View historical vitals data
- [ ] Verify graphs render correctly
- [ ] Test date range filters
- [ ] Export data (if feature exists)

**Test BMI Calculator:**
- [ ] Navigate to "BMI Calculator"
- [ ] Enter height and weight
- [ ] Calculate and verify result
- [ ] Check BMI category (Underweight/Normal/Overweight/Obese)

**Test Calorie Calculator:**
- [ ] Navigate to "Calorie Calculator"
- [ ] Enter age, gender, activity level
- [ ] Calculate daily calorie needs
- [ ] Verify result displays correctly

---

### 6. AI Doctor & Chat ✓
**Test AI Doctor:**
- [ ] Navigate to "AI Doctor"
- [ ] Enter symptoms or health query
- [ ] Submit and verify AI response
- [ ] Check response quality and relevance
- [ ] Test follow-up questions

**Test Symptom Checker:**
- [ ] Navigate to "Symptoms"
- [ ] Select multiple symptoms from list
- [ ] Submit for analysis
- [ ] Verify AI provides possible conditions
- [ ] Check severity assessment and recommendations

**Test Chat System:**
- [ ] Navigate to "Chat"
- [ ] Start conversation with doctor/support
- [ ] Send text messages
- [ ] Test real-time delivery (Socket.io)
- [ ] Upload images/files (if supported)
- [ ] Verify message history persists

---

### 7. Admin CRM System ✓
**Test User Management:**
- [ ] Login as admin
- [ ] Navigate to "My Members" or "Users"
- [ ] View all registered users
- [ ] Test filters:
  - By role (Patient/Doctor/Admin)
  - By status (Active/Inactive)
  - By registration date
- [ ] Search users by name/email/phone
- [ ] View user details
- [ ] Edit user information
- [ ] Block/Unblock users
- [ ] Delete test users

**Test Doctor Management:**
- [ ] Navigate to "My Doctors"
- [ ] View all registered doctors
- [ ] Check doctor profiles:
  - Specialization
  - Qualifications
  - Registration number
  - Verification status
- [ ] Test Verify/Reject doctor applications
- [ ] Edit doctor details
- [ ] View doctor's appointment history
- [ ] Check doctor ratings and reviews

**Test Appointment Management:**
- [ ] Navigate to "Appointments" in admin
- [ ] View all appointments across platform
- [ ] Filter by:
  - Date range
  - Status
  - Doctor
  - Patient
- [ ] View appointment details
- [ ] Cancel appointments (if needed)
- [ ] Export appointment reports

---

### 8. Google Fit Integration ✓
**Test Google Fit Connection:**
- [ ] Navigate to "Google Fit" or "Fitness"
- [ ] Click "Connect Google Fit"
- [ ] Authenticate with Google account
- [ ] Grant permissions for fitness data
- [ ] Verify connection successful

**Test Fitness Data Sync:**
- [ ] After connection, trigger data sync
- [ ] Verify data imports:
  - Steps count
  - Calories burned
  - Heart rate
  - Sleep data
  - Active minutes
- [ ] Check data displays in dashboard
- [ ] Verify charts render with imported data

---

### 9. Ayushman Bharat Integration ✓
**Test Ayushman Card Verification:**
- [ ] Navigate to "Ayushman"
- [ ] Enter Ayushman card number
- [ ] Fetch beneficiary details
- [ ] Verify API response displays:
  - Beneficiary name
  - Family members
  - Scheme status
  - Card validity
- [ ] Check error handling for invalid cards

---

### 10. Emergency Services ✓
**Test Emergency Booking:**
- [ ] Navigate to "Emergency"
- [ ] Select emergency type:
  - Ambulance
  - Urgent consultation
  - Home visit
- [ ] Enter location
- [ ] Submit request
- [ ] Verify:
  - Request ID generated
  - SMS/notification sent
  - Status tracking available

**Test Ambulance Booking:**
- [ ] Fill in emergency details
- [ ] Add pickup/drop location
- [ ] Submit booking
- [ ] Verify ambulance provider notified
- [ ] Track ambulance location (if GPS enabled)

---

### 11. Medicine & Pharmacy ✓
**Test Medicine Search:**
- [ ] Navigate to "Medicine"
- [ ] Search for medicines by name
- [ ] View medicine details:
  - Composition
  - Manufacturer
  - Price
  - Availability
- [ ] Add to cart
- [ ] Check cart updates

**Test Pharmacy Order:**
- [ ] Upload prescription image
- [ ] Add medicines to order
- [ ] Enter delivery address
- [ ] Apply membership benefit (if active)
- [ ] Verify INR benefit deduction
- [ ] Place order
- [ ] Check order confirmation

---

### 12. Diet Planning ✓
**Test Diet Recommendations:**
- [ ] Navigate to "Diet"
- [ ] Enter personal details:
  - Age, weight, height
  - Health goals (weight loss/gain/maintenance)
  - Dietary preferences (veg/non-veg/vegan)
  - Allergies
- [ ] Generate diet plan
- [ ] Verify:
  - Meal plan displays (breakfast/lunch/dinner/snacks)
  - Calorie breakdown shown
  - Recipe suggestions provided

---

### 13. Video Consultation (Agora) ✓
**Test Video Setup:**
- [ ] Join scheduled appointment
- [ ] Test camera preview
- [ ] Test microphone input
- [ ] Adjust video/audio settings

**Test During Call:**
- [ ] Verify video streaming works
- [ ] Test audio quality
- [ ] Test features:
  - [ ] Mute/Unmute microphone
  - [ ] Turn camera on/off
  - [ ] Screen share (if enabled)
  - [ ] Chat during call
  - [ ] End call
- [ ] Verify connection stability
- [ ] Check bandwidth adaptation

---

### 14. Notifications System ✓
**Test In-App Notifications:**
- [ ] Trigger various events:
  - New appointment booking
  - Appointment status change
  - Membership plan activated
  - Insurance claim updated
- [ ] Verify notifications appear in UI
- [ ] Check notification badge count
- [ ] Test mark as read
- [ ] Test clear all notifications

**Test Push Notifications:**
- [ ] Enable browser notifications
- [ ] Trigger event (appointment reminder)
- [ ] Verify push notification appears
- [ ] Click notification to navigate to relevant page

---

### 15. Offline Mode (PWA) ✓
**Test Service Worker:**
- [ ] Open DevTools → Application → Service Workers
- [ ] Verify service worker registered and active
- [ ] Check cached resources

**Test Offline Functionality:**
- [ ] Disconnect internet
- [ ] Navigate through app
- [ ] Verify offline indicator appears
- [ ] Test cached pages load
- [ ] Try to submit form (should queue)
- [ ] Reconnect internet
- [ ] Verify queued actions execute

**Test PWA Install:**
- [ ] Check if "Install App" prompt appears
- [ ] Install as PWA
- [ ] Launch installed app
- [ ] Verify works standalone

---

### 16. Voice Navigation ✓
**Test Voice Commands:**
- [ ] Click microphone icon
- [ ] Grant microphone permissions
- [ ] Speak commands:
  - "Navigate to appointments"
  - "Show my bookings"
  - "Open health tracker"
- [ ] Verify app navigates correctly
- [ ] Test voice input for forms
- [ ] Check voice-to-text accuracy

---

### 17. Profile Management ✓
**Test Profile View:**
- [ ] Navigate to "Profile"
- [ ] Verify all details display:
  - Name, email, phone
  - Profile picture
  - Date of birth
  - Gender
  - Address
- [ ] For doctors, check:
  - Specialization
  - Qualifications
  - Registration number
  - Consultation fees

**Test Profile Edit:**
- [ ] Click "Edit Profile"
- [ ] Modify any field
- [ ] Upload new profile picture
- [ ] Save changes
- [ ] Verify updates persist
- [ ] Check validation errors for invalid data

---

### 18. Payment Integration ✓
**Test Membership Payment:**
- [ ] Subscribe to membership plan
- [ ] Proceed to payment
- [ ] Verify payment gateway loads (Razorpay/Stripe)
- [ ] Complete test transaction
- [ ] Verify:
  - Payment recorded
  - Membership activated
  - Receipt generated

**Test Consultation Payment:**
- [ ] Book paid consultation
- [ ] Complete payment
- [ ] Verify appointment confirmed
- [ ] Check payment history

---

### 19. Reports & Analytics ✓
**Test Admin Analytics:**
- [ ] Login as admin
- [ ] Navigate to dashboard
- [ ] Verify metrics:
  - Total users count
  - Total appointments (today/week/month)
  - Revenue statistics
  - Active memberships
  - Claims statistics
- [ ] Test date range filters
- [ ] Export reports (CSV/PDF)

**Test Doctor Analytics:**
- [ ] Login as doctor
- [ ] View doctor dashboard
- [ ] Check metrics:
  - Appointments count
  - Earnings
  - Patient ratings
  - Consultation hours

---

### 20. API Testing ✓

#### Test Membership APIs:
```bash
# Get current plan (requires auth token)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:8000/api/membership/current

# Increment teleconsult usage
curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"specialty": "Cardiology"}' \
  http://localhost:8000/api/membership/usage/teleconsult

# Increment benefit usage
curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "pharmacyINR", "amount": 100}' \
  http://localhost:8000/api/membership/usage/benefit
```

#### Test Insurance APIs:
```bash
# Get all providers (user)
curl http://localhost:8000/api/insurance/providers

# Get policies by provider
curl http://localhost:8000/api/insurance/policies/PROVIDER_ID

# Admin: Get all providers (requires admin token)
curl -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  http://localhost:8000/api/insurance/admin/providers

# Admin: Update claim status
curl -X PATCH -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "Approved", "approvedAmount": 5000}' \
  http://localhost:8000/api/insurance/admin/claims/CLAIM_ID/status
```

---

## 🐛 Common Issues & Fixes

### Issue: Firebase credentials not found
**Fix:** Set environment variables in `server/.env`:
```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-credentials.json
```

### Issue: Redis version warning
**Fix:** Upgrade Redis to 6.2.0+:
```bash
# For Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server

# Check version
redis-server --version
```

### Issue: Video not working
**Fix:** 
- Check Agora app ID in environment variables
- Verify camera/microphone permissions in browser
- Test in Chrome/Firefox (Safari may have issues)

### Issue: Payment gateway not loading
**Fix:** 
- Verify Razorpay/Stripe API keys in `.env`
- Check network requests in DevTools
- Ensure test mode is enabled for testing

### Issue: Service worker not updating
**Fix:**
- Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Clear cache: DevTools → Application → Clear storage
- Unregister service worker and reload

---

## ✅ Test Completion Checklist

- [ ] All authentication flows work
- [ ] Membership plans create/edit/delete successfully
- [ ] User can subscribe to plans and see usage updates
- [ ] Auto-increment works when appointment completed
- [ ] Insurance providers/policies CRUD works
- [ ] Claims can be submitted and status updated
- [ ] Appointments can be booked, confirmed, completed
- [ ] Video consultations load and function
- [ ] Health vitals can be added and viewed
- [ ] AI doctor responds to queries
- [ ] Admin can manage users/doctors/appointments
- [ ] Google Fit connects and syncs data
- [ ] Notifications appear in real-time
- [ ] Offline mode works with service worker
- [ ] Voice navigation responds to commands
- [ ] Profile can be viewed and edited
- [ ] Payments process successfully
- [ ] Reports and analytics display correctly
- [ ] All APIs return expected responses

---

## 📊 Performance Testing

### Load Testing:
- [ ] Test with 100+ concurrent users
- [ ] Monitor response times
- [ ] Check database query performance
- [ ] Verify Redis caching works
- [ ] Monitor Kafka message throughput

### Stress Testing:
- [ ] Test appointment booking under load
- [ ] Stress test video consultations (multiple simultaneous)
- [ ] Test membership usage increment race conditions
- [ ] Verify database transaction isolation

---

## 🔒 Security Testing

- [ ] Test SQL injection in forms
- [ ] Verify JWT token expiration
- [ ] Test unauthorized access to admin routes
- [ ] Check CORS configuration
- [ ] Verify password hashing (bcrypt)
- [ ] Test rate limiting on APIs
- [ ] Check for XSS vulnerabilities
- [ ] Verify file upload restrictions

---

## 📱 Cross-Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

---

## 📝 Notes

- Keep browser DevTools console open to catch errors
- Monitor server logs in terminal while testing
- Take screenshots of any bugs found
- Document unexpected behavior
- Test with different user roles (patient/doctor/admin)
- Verify email/SMS notifications if configured

---

**Happy Testing! 🚀**
