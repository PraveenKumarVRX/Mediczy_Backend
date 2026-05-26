# ENDPOINT AUDIT - QUICK REFERENCE & IMPLEMENTATION ROADMAP

**Generated:** April 23, 2026  
**Purpose:** Quick lookup for developers implementing fixes

---

## 🚨 CRITICAL ISSUES SUMMARY

### Issue #1: TOKEN REFRESH BROKEN ⚠️ BLOCKS ALL FEATURES
**Why it's broken:** Mobile doesn't retry requests after token expiry  
**Impact:** Users get logged out immediately when token expires  
**Symptom:** "Unauthorized" error after 1 hour of use  
**Fix file:** `/app/Utils/api.js` (response interceptor)  
**Effort:** 4-6 hours  
**Status:** 🔴 NOT STARTED

### Issue #2: NO TENANT SUPPORT ⚠️ ENTERPRISE FEATURES BROKEN
**Why it's broken:** Missing `X-Tenant-ID` header on all requests  
**Impact:** Multi-tenant/enterprise features don't work  
**Symptom:** Wrong data returned or 403 Forbidden  
**Fix file:** `/app/Utils/api.js` (request interceptor)  
**Effort:** 2-3 hours  
**Status:** 🔴 NOT STARTED

### Issue #3: RESPONSE PARSING ERRORS ⚠️ DATA TYPE MISMATCHES
**Why it's broken:** Screens expect `data.field` but get `response.data.data.field`  
**Impact:** Data validation fails, UI shows wrong data type  
**Symptom:** Console errors like "Cannot read property of undefined"  
**Fix files:** `/app/Utils/api.js` + screens using API  
**Effort:** 1-2 hours  
**Status:** 🔴 NOT STARTED

### Issue #4: TIMEOUT TOO SHORT ⚠️ VIDEO & AI FEATURES TIMEOUT
**Why it's broken:** 20s timeout insufficient for video/AI endpoints  
**Impact:** Video calls fail, AI analysis times out  
**Symptom:** "Network timeout" error on video/analysis  
**Fix file:** `/app/Utils/api.js` (line 12)  
**Effort:** 10 minutes  
**Status:** 🟢 EASY FIX

### Issue #5: WRONG VIDEO ENDPOINT ⚠️ VIDEO CALLS FAIL
**Why it's broken:** Mobile uses `/mobile/video/token` which may not exist  
**Impact:** Video token generation fails  
**Symptom:** "Cannot get video token" error  
**Fix file:** `/app/Utils/api.js` (Video module)  
**Effort:** 30 minutes  
**Status:** 🟢 EASY FIX

### Issue #6: MISSING WALLET PAYMENT ⚠️ APPOINTMENT PAYMENT BROKEN
**Why it's broken:** No `/wallet/appointment/pay` endpoint in mobile  
**Impact:** Users can't pay for appointments with health coins  
**Symptom:** Payment flow fails silently  
**Fix file:** `/app/Utils/api.js` (Wallet module)  
**Effort:** 1-2 hours  
**Status:** 🔴 NOT STARTED

---

## 🔧 QUICK FIX GUIDE

### QUICK FIX #1: Increase Timeout (10 min)
```javascript
// File: /app/Utils/api.js, Line 12
// BEFORE:
timeout: 20000,

// AFTER:
timeout: 30000,
```

### QUICK FIX #2: Remove Duplicate Video Endpoint (30 min)
```javascript
// File: /app/Utils/api.js, Video module

// BEFORE:
export const Video = {
  token:    (appointmentId) => api.post('/mobile/video/token', { appointmentId }),
  livekitToken: (data) => api.post('/video/livekit/token', data),
};

// AFTER:
export const Video = {
  token: (appointmentId) => api.post('/video/livekit/token', { appointmentId }),
};
```

### QUICK FIX #3: Add Wallet Payment Endpoint (1 hour)
```javascript
// File: /app/Utils/api.js, Wallet module

// ADD THIS:
payForAppointment: (appointmentId, consultationFee, doctorName) =>
  api.post('/wallet/appointment/pay', {
    appointmentId,
    consultationFee,
    doctorName,
  }),
```

### QUICK FIX #4: Fix Response Unwrapping (1 hour)
```javascript
// File: /app/Utils/api.js, User module

// BEFORE:
getProfile: () => api.get('/users/profile'),

// AFTER:
getProfile: () => api.get('/users/profile')
  .then(res => res.data?.data || res.data),
```

### MAJOR FIX #1: Add Token Refresh (4-6 hours)
**See full details in MICRO_LEVEL_ENDPOINT_AUDIT.md → FIX #1**

### MAJOR FIX #2: Add Tenant Support (2-3 hours)
**See full details in MICRO_LEVEL_ENDPOINT_AUDIT.md → FIX #2**

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Quick Wins (1 hour total)
- [ ] Increase timeout from 20s to 30s
- [ ] Remove duplicate `/mobile/video/token` endpoint
- [ ] Add `/wallet/appointment/pay` endpoint
- [ ] Add response unwrapping to User endpoints
- [ ] Test video calls
- [ ] Test wallet operations

### Phase 2: Core Fixes (3-5 hours total)
- [ ] Implement token refresh mechanism
  - [ ] Add refresh interceptor
  - [ ] Add request queue
  - [ ] Test concurrent requests
  - [ ] Test token expiry flow
- [ ] Add tenant ID support
  - [ ] Add tenant resolution function
  - [ ] Inject header on all requests
  - [ ] Test multi-tenant scenarios

### Phase 3: Advanced Features (6-8 hours total)
- [ ] Implement role-based auth
  - [ ] Detect user type (patient/team/admin/crm)
  - [ ] Different 401 handling per role
  - [ ] Role-specific refresh endpoints
- [ ] Clarify AI endpoints
  - [ ] Get backend docs on 3 endpoints
  - [ ] Consolidate if duplicates
  - [ ] Test AI flows

### Phase 4: Testing & Validation (2-3 hours total)
- [ ] Integration tests for all endpoints
- [ ] Test on slow networks (3G)
- [ ] Test with token expiry
- [ ] Test concurrent requests
- [ ] Test error scenarios
- [ ] Regression test all screens

---

## 🔍 ENDPOINT IMPLEMENTATION STATUS

### ✅ Working (No fix needed)
- ✅ POST `/users/login` - Auth works
- ✅ GET `/users/profile` - Gets user data (but needs response fix)
- ✅ POST `/appointments` - Booking works
- ✅ GET `/family-members` - List works
- ✅ POST `/wallet/spend` - Generic spend works
- ✅ POST `/chat/rooms/*/messages` - Chat messaging works
- ✅ GET `/wellness/dashboard` - Dashboard works
- ✅ POST `/vitals` - Log vitals works

### ⚠️ Partially Working (Needs fix)
- ⚠️ GET `/users/profile` - Response parsing wrong
- ⚠️ GET `/wallet/balance` - Returns object instead of number
- ⚠️ POST `/video/livekit/token` - Timeout too short, endpoint confusion
- ⚠️ POST `/ai-health/chat` - Timeout too short
- ⚠️ POST `/reports/*/analyze` - Timeout too short

### ❌ Broken (Major fix needed)
- ❌ Token refresh on 401 - No mechanism at all
- ❌ Session management - Users logged out on token expiry
- ❌ Tenant support - No X-Tenant-ID header
- ❌ POST `/wallet/appointment/pay` - Endpoint missing
- ❌ Role-based auth - No detection/handling

---

## 🧪 TESTING SCENARIOS

### Scenario 1: Token Expiry
**Steps:**
1. Login to app
2. Wait for token to expire (or manually expire in debugger)
3. Make any API call
4. Expected: Request should auto-refresh token and succeed
5. Actual: ❌ App logs user out immediately

**Fix needed:** Token refresh mechanism

### Scenario 2: Concurrent Requests During Refresh
**Steps:**
1. Login
2. Make 5 simultaneous API calls
3. On first 401, token should refresh
4. Expected: All 5 requests queue, token refreshes once, all 5 retry
5. Actual: ❌ All 5 attempt refresh (5x refresh calls)

**Fix needed:** Request queuing in interceptor

### Scenario 3: Video Call Initiation
**Steps:**
1. Click "Start Video Call"
2. Wait for token generation
3. Expected: Video loads within 30 seconds
4. Actual: ❌ Timeout after 20 seconds

**Fix needed:** Increase timeout + check video endpoint

### Scenario 4: Long AI Analysis
**Steps:**
1. Upload medical report
2. Click "AI Analyze"
3. Wait for analysis
4. Expected: Analysis completes in <30 seconds
5. Actual: ❌ Timeout after 20 seconds

**Fix needed:** Increase timeout + optimize backend

### Scenario 5: Multi-Tenant Request
**Steps:**
1. Login with tenant B credentials
2. Fetch appointments
3. Expected: Only tenant B appointments returned
4. Actual: ❌ May return tenant A data or 403 error

**Fix needed:** Add X-Tenant-ID header

---

## 🔗 ENDPOINT REFERENCE

### Auth Flow
```
1. POST /users/login → token, refreshToken, userType
2. Store: authToken, refreshToken
3. Every request: Bearer {authToken}
4. On 401: POST /users/auth/refresh {refreshToken} → new token
5. Store new token
6. Retry original request
```

### Video Call Flow
```
1. GET /appointments/{id} → appointment data
2. POST /video/livekit/token {appointmentId} → { token, url, roomName }
3. Connect to LiveKit with token
4. POST /consultation/video/join/{appointmentId}
5. (video call in progress)
6. POST /consultation/video/end/{appointmentId}
```

### Appointment Payment Flow
```
1. POST /appointments {doctorId, date, time} → appointment
2. POST /wallet/appointment/can-pay {consultationFee} → HCCalculation
3. POST /wallet/appointment/pay {appointmentId, consultationFee, doctorName} → confirmation
```

### Report Analysis Flow
```
1. POST /reports {file} → report (multipart/form-data)
2. POST /reports/{reportId}/analyze {analysisType} → analysis_id
3. GET /reports/{reportId}/analysis → { status, result }
```

### Health Chat Flow
```
1. POST /ai-health/chat {message, conversationHistory} → response
2. Store response in history
3. Send next message with updated history
```

---

## 📞 COMMUNICATION CHECKLIST

### Before Starting Implementation
- [ ] Ask backend team about token refresh endpoint (is it `/users/auth/refresh`?)
- [ ] Ask about video token timeout (does it need 60s?)
- [ ] Ask about AI analysis timeout (how long does analysis take?)
- [ ] Ask about `/mobile/video/token` endpoint (does it exist?)
- [ ] Ask about tenant header (all endpoints or specific ones?)
- [ ] Ask about response format (is it always nested `.data`?)

### During Implementation
- [ ] Share quick fix list with team
- [ ] Get code review for token refresh logic
- [ ] Test with staging backend before production

### After Implementation
- [ ] Load test with concurrent users
- [ ] Test on slow networks
- [ ] Monitor error rates in production
- [ ] Track user session duration

---

## 🎯 SUCCESS METRICS

After all fixes implemented:
- [ ] Average session duration > 4 hours (currently broken)
- [ ] 0 "Unauthorized" errors (currently many)
- [ ] Video calls complete 100% (currently many failures)
- [ ] AI analysis timeout < 5% (currently high)
- [ ] Concurrent request errors 0 (currently race conditions)
- [ ] User satisfaction improves (measure NPS)

---

## 📝 FILES TO MODIFY

**Main API file:**
- `/home/ubuntu/MSH_M_App/app/Utils/api.js` (200+ lines)

**Screens using API (need response unwrapping verification):**
- `/app/Screens/Profile/ProfileScreen.js`
- `/app/Screens/Appointments/*`
- `/app/Screens/Video/*`
- `/app/Screens/Health/*`
- `/app/Screens/Wallet/*`

**Auth/Context files (may need token storage updates):**
- `/app/Context/AuthContext.js` or similar
- Any auth provider

---

## 🚀 DEPLOYMENT PLAN

### Week 1: Quick Wins
- Implement Quick Fixes #1-4 (1 hour coding + 4 hours testing)
- Deploy to staging
- Get team feedback
- Estimate: 1 business day

### Week 2: Major Fixes
- Implement token refresh (4-6 hours)
- Implement tenant support (2-3 hours)
- Integration testing
- Estimate: 2 business days

### Week 3: Advanced & Polish
- Role-based auth (if needed)
- AI endpoint clarification
- Full regression testing
- Estimate: 2-3 business days

### Week 4: Production
- Deploy to production
- Monitor error rates
- Collect user feedback
- Prepare hotfix plan
- Estimate: 1 business day

**Total Timeline:** 3-4 weeks for full implementation

---

## 💡 IMPLEMENTATION TIPS

1. **Start with Quick Fixes** - Low effort, high impact
2. **Test Token Refresh Heavily** - This is the most critical
3. **Use Mobile Lab for Testing** - Test on real devices, not just emulator
4. **Load Test Concurrent Requests** - Verify queue logic works
5. **Test Network Failures** - Airplane mode, timeout scenarios
6. **Monitor Production** - Use Sentry/Firebase Crashlytics
7. **Get User Feedback** - Ask testers about session stability

---

## 📚 RESOURCES

- **Full Technical Audit:** `MICRO_LEVEL_ENDPOINT_AUDIT.md`
- **API Endpoint Inventory:** `API_ENDPOINTS_INVENTORY.md`
- **Web App Reference:** `/client/src/utils/api.ts`
- **Mobile App Current:** `/app/Utils/api.js`

---

**Document Status:** 🟢 COMPLETE & READY FOR DEVELOPMENT

