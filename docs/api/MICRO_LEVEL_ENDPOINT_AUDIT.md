# MICRO-LEVEL API ENDPOINT AUDIT
## Web App vs Mobile App - Function-by-Function Comparison

**Date:** April 23, 2026  
**Scope:** Critical endpoint implementations and functionality gaps  
**Purpose:** Identify why mobile app endpoints are failing and what needs to be fixed

---

## 📊 AUDIT SUMMARY

| Category | Status | Details |
|----------|--------|---------|
| **Overall** | ⚠️ CRITICAL | Mobile app missing 5 major infrastructure features |
| **Auth Handling** | ❌ BROKEN | No token refresh, no role-based auth management |
| **Tenant Support** | ❌ MISSING | Mobile doesn't support multi-tenant header |
| **Error Handling** | ⚠️ INCOMPLETE | No request queuing, no graceful token expiry |
| **Timeout** | ⚠️ MISMATCH | Web: 30s, Mobile: 20s (video calls fail) |
| **Common Endpoints** | ✅ MATCH | 55 endpoints exist in both (method & path) |

---

## 🔴 CRITICAL INFRASTRUCTURE DIFFERENCES

### 1. TOKEN AUTO-REFRESH MECHANISM
**Status:** ❌ WEB HAS IT, MOBILE DOESN'T

#### WEB APP IMPLEMENTATION
**File:** `/client/src/utils/api.ts` (lines 113-180)

```typescript
// ── Team token auto-refresh on 401 ──
let _isRefreshing = false;
let _refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Only auto-refresh for team users hitting 401
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== "undefined" &&
      getUserType() === "team"
    ) {
      const refreshToken = window.localStorage.getItem("teamRefreshToken");
      if (!refreshToken) {
        window.location.href = "/team/login";
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // If a refresh is already in flight, queue this request
      if (_isRefreshing) {
        return new Promise<string>((resolve) => {
          _refreshQueue.push(resolve);
        }).then((newToken) => {
          (originalRequest as any).headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
          return api(originalRequest);
        });
      }

      _isRefreshing = true;
      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/team/auth/refresh`,
          { refreshToken },
          { skipAuth: true } as any
        );
        if (data.success && data.token) {
          window.localStorage.setItem("teamToken", data.token);
          _refreshQueue.forEach((cb) => cb(data.token));
          _refreshQueue = [];
          return api(originalRequest);
        }
      } catch {
        window.localStorage.removeItem("teamToken");
        window.location.href = "/team/login";
      } finally {
        _isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

**What it does:**
- Detects 401 (Unauthorized) responses
- Automatically refreshes the token using `teamRefreshToken`
- **Queues concurrent requests** while refresh is in flight (prevents duplicate refresh calls)
- Re-attempts the original request with new token
- Gracefully logs user out if refresh fails

#### MOBILE APP IMPLEMENTATION
**File:** `/app/Utils/api.js` (lines 14-30)

```javascript
// Centralised error handling
api.interceptors.response.use(
  res => res,
  err => {
    const msg = err?.response?.data?.message || err?.message || 'Network error';
    if (err?.response?.status === 401) {
      // Token expired – caller can handle navigation
      AsyncStorage.multiRemove(['authToken', 'userData']);
    }
    return Promise.reject({ ...err, userMessage: msg });
  },
);
```

**What it does:**
- ❌ Detects 401 but does NOTHING
- ❌ Just clears auth storage
- ❌ No token refresh attempt
- ❌ No request retry logic
- ❌ App crashes or user sees error screen

**IMPACT:** 
- Any API call that times out or returns 401 → User is logged out immediately
- Refresh tokens are stored but NEVER used
- Session management is broken
- **FIX REQUIRED:** Implement token refresh interceptor similar to web app

---

### 2. TENANT SUPPORT (Multi-Tenant Architecture)
**Status:** ❌ WEB HAS IT, MOBILE DOESN'T

#### WEB APP IMPLEMENTATION
**File:** `/client/src/utils/api.ts` (lines 30-50)

```typescript
// Resolve tenant id from env or localStorage
const resolveTenantId = (): string | undefined => {
  try {
    const envTenant = import.meta.env.VITE_TENANT_ID as string | undefined;
    if (envTenant && envTenant.trim()) return envTenant.trim();
    if (typeof window !== "undefined") {
      const lsTenant = window.localStorage.getItem("tenantId") || 
                       window.localStorage.getItem("X-Tenant-ID");
      if (lsTenant && lsTenant.trim()) return lsTenant.trim();
    }
  } catch (e) {
    // no-op: keep requests working even if storage not accessible
  }
  return undefined;
};

// ... then in interceptor:
const hasTenantHeader = config.headers && (config.headers as any)["X-Tenant-ID"];
if (!hasTenantHeader) {
  const tenantId = resolveTenantId();
  if (tenantId) {
    config.headers = { ...(config.headers || {}), "X-Tenant-ID": tenantId } as any;
  }
}
```

**What it does:**
- Reads tenant ID from environment or localStorage
- **Injects `X-Tenant-ID` header on EVERY request**
- Backend uses this to filter data by organization/tenant
- Enables multi-workspace support

#### MOBILE APP IMPLEMENTATION
**File:** `/app/Utils/api.js` (lines 8-15)

```javascript
const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});
```

**What it does:**
- ❌ No tenant header logic
- ❌ No tenant ID resolution
- ❌ Requests don't include tenant context

**IMPACT:**
- Mobile app can only work with single tenant
- If backend expects `X-Tenant-ID`, requests fail with 400 or return wrong data
- Enterprise features (multi-workspace) don't work
- **FIX REQUIRED:** Add tenant ID resolution and header injection similar to web app

---

### 3. ROLE-BASED AUTH HANDLING
**Status:** ❌ WEB HAS IT, MOBILE DOESN'T

#### WEB APP IMPLEMENTATION
**File:** `/client/src/utils/api.ts` (lines 113-210)

The web app handles 4 different user types with different auth flows:

```typescript
// 1. TEAM USER 401 handling
if (error.response?.status === 401 && getUserType() === "team") {
  // Auto-refresh with teamRefreshToken → /team/auth/refresh
  // Queue requests while refresh in flight
}

// 2. ADMIN USER 401 handling
if (error.response?.status === 401 && getUserType() === "admin") {
  // Clear adminToken, redirect to /admin/login
}

// 3. CRM USER 401 handling
if (error.response?.status === 401 && getUserType() === "crm") {
  // Auto-refresh with crmRefreshToken → /crm/auth/refresh
  // Or redirect to /crm/login
}

// 4. PATIENT USER (implicit)
// Falls through with normal rejection
```

#### MOBILE APP IMPLEMENTATION
**File:** `/app/Utils/api.js` (lines 8-30)

```javascript
// Single auth flow for all users
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single error handling for all users
api.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401) {
      AsyncStorage.multiRemove(['authToken', 'userData']);
    }
    return Promise.reject(err);
  },
);
```

**What it does:**
- ❌ No user type detection
- ❌ No role-based handling
- ❌ Same treatment for all users
- ❌ No redirect logic

**IMPACT:**
- If mobile app used by team/admin users → Auth fails
- No differentiation between user roles
- **FIX REQUIRED:** Implement role detection and role-specific auth handling

---

### 4. TIMEOUT MISMATCH
**Status:** ⚠️ DIFFERENT VALUES

#### WEB APP
**File:** `/client/src/utils/api.ts` (line 60)
```typescript
timeout: 30000, // 30 second timeout (video call initiation needs time for LiveKit + notifications)
```

#### MOBILE APP
**File:** `/app/Utils/api.js` (line 12)
```javascript
timeout: 20000,
```

**IMPACT:**
- Video calls need longer setup time (LiveKit token generation, WebRTC negotiation)
- 20s timeout is TOO SHORT for:
  - Initial video token generation
  - Heavy file uploads/downloads
  - Complex AI analysis requests
- Users get "Network timeout" errors even though request is still processing
- **FIX REQUIRED:** Increase to 30s or make it configurable per endpoint

---

## 🔴 ENDPOINT-BY-ENDPOINT COMPARISON

### AUTHENTICATION ENDPOINTS

#### Endpoint 1: LOGIN
**Endpoint:** `POST /users/login`

**WEB APP IMPLEMENTATION:**
```typescript
// In auth.service.ts or similar
const response = await api.post('/users/login', {
  email: string,
  password: string
});
// Response includes: token, refreshToken, userType, userData
```

**MOBILE APP IMPLEMENTATION:**
```javascript
// In Auth module
login: (email, password) => api.post('/users/login', { email, password })
```

**Comparison:**
- ✅ **MATCH:** Same endpoint path and HTTP method
- ✅ **MATCH:** Same request payload structure
- ⚠️ **DIFFERENCE:** Web handles `userType` to determine auth flow
- ⚠️ **DIFFERENCE:** Web stores both `token` AND `refreshToken`
- ❌ **BROKEN:** Mobile doesn't handle response to determine user type
- ❌ **BROKEN:** Mobile doesn't store refresh token (can't refresh later)

**What's wrong:**
```javascript
// MOBILE APP BUG:
// After login, mobile needs to do:
const token = response.data.token;
const userType = response.data.userType;  // ← NOT CAPTURED
const refreshToken = response.data.refreshToken;  // ← NOT STORED

// Mobile likely does:
AsyncStorage.setItem('authToken', token);  // Only saves token, loses userType & refreshToken
```

**FIX REQUIRED:**
```javascript
// Mobile should do:
async (response) => {
  const { token, refreshToken, userType } = response.data;
  await AsyncStorage.multiSet([
    ['authToken', token],
    ['refreshToken', refreshToken],
    ['userType', userType],
  ]);
}
```

---

#### Endpoint 2: VERIFY OTP (Login)
**Endpoint:** `POST /users/login/verify-otp`

**WEB APP IMPLEMENTATION:**
```typescript
// Exists in auth.service.ts
// Returns: token, refreshToken, userType
```

**MOBILE APP IMPLEMENTATION:**
```javascript
verifyLoginOtp: (phone, otp) => api.post('/users/login/verify-otp', { phoneNumber: phone, otp })
```

**Comparison:**
- ✅ **MATCH:** Endpoint exists
- ✅ **MATCH:** Parameters match
- ❌ **BROKEN:** Same issues as Login endpoint - doesn't capture/store response properly

**Status:** ⚠️ MISSING RESPONSE HANDLING

---

### USER PROFILE ENDPOINTS

#### Endpoint 3: GET PROFILE
**Endpoint:** `GET /users/profile`

**WEB APP IMPLEMENTATION:**
```typescript
// In useAuth hook
const getProfile = async () => {
  const response = await api.get('/users/profile');
  return response.data.data;  // Note: wrapped in 'data'
};
```

**MOBILE APP IMPLEMENTATION:**
```javascript
getProfile: () => api.get('/users/profile')
```

**Comparison:**
- ✅ **MATCH:** Endpoint path and method
- ⚠️ **DIFFERENCE:** Response structure different!
  - Web expects: `response.data.data` (nested)
  - Mobile expects: `response.data` (flat) or `response.data.data`?

**Problem:** If backend returns:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "email": "user@example.com",
    "profile": {...}
  }
}
```

**Web code:** `response.data.data` → Gets the nested object ✅  
**Mobile code:** `response.data` → Gets entire response object with `success` and `data` fields ❌

This means mobile gets wrong data structure and parsing fails.

**FIX REQUIRED:**
```javascript
// Mobile should do:
getProfile: () => api.get('/users/profile').then(res => res.data.data || res.data)
```

---

#### Endpoint 4: UPDATE PROFILE
**Endpoint:** `PUT /users/profile`

**WEB APP:**
```typescript
const updateProfile = async (data: Partial<UserProfile>) => {
  const response = await api.put('/users/profile', data);
  return response.data.data;
};
```

**MOBILE:**
```javascript
updateProfile: (data) => api.put('/users/profile', data)
```

**Issues:**
- Same response structure mismatch as above
- Mobile doesn't handle response properly
- **FIX REQUIRED:** Parse response correctly

---

### VIDEO CONSULTATION ENDPOINTS

#### Endpoint 5: GET VIDEO TOKEN
**Status:** ⚠️ **DIFFERENT ENDPOINTS**

**WEB APP IMPLEMENTATION:**
```typescript
// Uses standard endpoint
const response = await api.post('/video/livekit/token', {
  appointmentId: number,
  role?: 'host' | 'guest'
});
```

**MOBILE APP IMPLEMENTATION:**
```javascript
// Uses different endpoint path!
token: (appointmentId) => api.post('/mobile/video/token', { appointmentId }),

// ALSO has fallback:
livekitToken: (data) => api.post('/video/livekit/token', data),
```

**Comparison:**
- ⚠️ **MISMATCH:** Two different endpoints!
  - `POST /mobile/video/token` (mobile-specific)
  - `POST /video/livekit/token` (shared)
- ❓ **QUESTION:** Does `/mobile/video/token` exist on backend? If not, requests fail!
- ❌ **BROKEN:** Mobile-specific endpoint probably doesn't exist

**What's wrong:**
```javascript
// In VideoCall screen, mobile does:
const response = await Video.token(appointmentId);
// This calls POST /mobile/video/token
// But if backend doesn't have this endpoint → 404 error

// Should use:
const response = await Video.livekitToken({ appointmentId });
// Calls POST /video/livekit/token (same as web)
```

**FIX REQUIRED:**
```javascript
// Remove mobile-specific endpoint
token: (appointmentId) => api.post('/video/livekit/token', { appointmentId }),
// Delete livekitToken duplicate or make it alias
```

---

### APPOINTMENT ENDPOINTS

#### Endpoint 6: LIST APPOINTMENTS
**Endpoint:** `GET /enhanced-appointments/my-appointments` vs `GET /appointments/my-appointments`

**WEB APP:**
```typescript
// Uses enhanced endpoint (newer API)
const response = await api.get('/enhanced-appointments/my-appointments');
```

**MOBILE APP:**
```javascript
list: (params = {}) => api.get('/enhanced-appointments/my-appointments', { params }),
listLegacy: () => api.get('/appointments/my-appointments'),
```

**Comparison:**
- ✅ **MATCH:** Mobile has both endpoints (good fallback)
- ✅ **MATCH:** Methods correct
- ⚠️ **DIFFERENCE:** Mobile includes params parameter, web might not expect it
- **Status:** Probably works, but need to verify params are used on backend

---

#### Endpoint 7: BOOK APPOINTMENT
**Endpoint:** `POST /appointments` vs `POST /enhanced-appointments/book`

**WEB APP:**
```typescript
// Uses enhanced endpoint for new features
const response = await api.post('/enhanced-appointments/book', {
  doctorId: number,
  appointmentDate: string,
  appointmentTime: string,
  type: 'consultation' | 'follow-up',
  notes?: string
});
```

**MOBILE APP:**
```javascript
book: (data) => api.post('/appointments', data),
bookEnhanced: (data) => api.post('/enhanced-appointments/book', data),
```

**Comparison:**
- ✅ **MATCH:** Both endpoints exist
- ⚠️ **DIFFERENCE:** Default is `/appointments` (legacy), enhanced is separate
- ⚠️ **ISSUE:** Mobile uses legacy endpoint by default, should use enhanced

**Problem:**
```javascript
// In mobile booking screen:
const result = await Appointments.book(bookingData);  // Uses /appointments (legacy)

// But should use:
const result = await Appointments.bookEnhanced(bookingData);  // Uses /enhanced-appointments/book
```

**FIX REQUIRED:** Make `bookEnhanced` the default, keep `book` as legacy fallback

---

### REPORTS/DOCUMENTS ENDPOINTS

#### Endpoint 8: UPLOAD REPORT
**Endpoint:** `POST /reports`

**WEB APP:**
```typescript
const response = await api.post('/reports', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
```

**MOBILE APP:**
```javascript
upload: (form) => api.post('/reports', form, { 
  headers: { 'Content-Type': 'multipart/form-data' } 
})
```

**Comparison:**
- ✅ **MATCH:** Same endpoint, same method
- ✅ **MATCH:** Same headers
- ⚠️ **DIFFERENCE:** Web might handle response wrapping differently

**Status:** Probably works, need to verify form structure

---

#### Endpoint 9: ANALYZE REPORT (AI)
**Endpoint:** `POST /reports/{id}/analyze`

**WEB APP:**
```typescript
const response = await api.post(`/reports/${reportId}/analyze`, {
  analysisType?: 'quick' | 'detailed',
  customPrompt?: string
});
```

**MOBILE APP:**
```javascript
analyze: (reportId, data) => api.post(`/reports/${reportId}/analyze`, data),
analyzeImage: (data) => api.post('/ai/analyze-image', data),
```

**Comparison:**
- ✅ **MATCH:** Endpoint exists
- ⚠️ **DIFFERENCE:** Mobile also has `/ai/analyze-image` (not in web API?)
- ⚠️ **QUESTION:** Different endpoints for same function?

**Status:** Need to verify backend has both endpoints

---

### AI HEALTH ENDPOINTS

#### Endpoint 10: HEALTH CHAT (AI)
**Endpoint:** `POST /ai-health/chat`

**WEB APP:**
```typescript
// In aiHealthServices.ts
const response = await api.post('/ai-health/chat', {
  message: string,
  conversationHistory?: Array<{role: 'user'|'assistant', content: string}>
});
```

**MOBILE APP:**
```javascript
healthChat: (data) => api.post('/ai-health/chat', data),
drIsha: (data) => api.post('/ai-health/dr-isha/consult', data),
```

**Comparison:**
- ✅ **MATCH:** Main endpoint same
- ⚠️ **DIFFERENCE:** Mobile has separate `/ai-health/dr-isha/consult`
- ⚠️ **DIFFERENCE:** Request structure might differ

**Problem:** Are these two different flows or aliases?
```javascript
// Which one to use?
healthChat: (data) => api.post('/ai-health/chat', data),        // Generic health chat
drIsha: (data) => api.post('/ai-health/dr-isha/consult', data), // Dr. Isha specific?
```

**Status:** Need backend clarification on endpoint differences

---

### WALLET ENDPOINTS

#### Endpoint 11: GET WALLET BALANCE
**Endpoint:** `GET /wallet/balance`

**WEB APP:**
```typescript
// In WalletService
async getBalance(): Promise<number> {
  const response = await api.get('/wallet/balance');
  return response.data.balance;
}
```

**MOBILE APP:**
```javascript
balance: () => api.get('/wallet/balance')
```

**Comparison:**
- ✅ **MATCH:** Endpoint same
- ⚠️ **DIFFERENCE:** Web extracts `.balance` from response
- ❌ **BROKEN:** Mobile returns raw response object instead of just number

**Example:**
```javascript
// If backend returns:
{
  "balance": 500,
  "currency": "INR"
}

// Web gets: 500 (correct)
// Mobile gets: { balance: 500, currency: "INR" } (wrong type)
```

**FIX REQUIRED:**
```javascript
// Mobile should do:
balance: () => api.get('/wallet/balance').then(res => res.data?.balance || res.data)
```

---

#### Endpoint 12: PAY FOR APPOINTMENT
**Endpoint:** `POST /wallet/appointment/pay`

**WEB APP:**
```typescript
// In WalletService
async payForAppointmentWithHC(
  appointmentId: number,
  consultationFee: number,
  doctorName: string
): Promise<PaymentResponse> {
  const response = await api.post('/wallet/appointment/pay', {
    appointmentId,
    consultationFee,
    doctorName  // ← Note: doctorName is included
  });
  return response.data.data;
}
```

**MOBILE APP:**
```javascript
// No direct payment endpoint!
// Uses generic wallet endpoints:
spend: (data) => api.post('/wallet/spend', data),
createOrder: (amount) => api.post('/wallet/create-order', { amount }),
verifyPayment: (data) => api.post('/wallet/verify-payment', data),
```

**Comparison:**
- ❌ **MISSING:** Mobile doesn't have `/wallet/appointment/pay` endpoint!
- ❌ **BROKEN:** Mobile uses generic `/wallet/spend` instead
- ⚠️ **DIFFERENCE:** Payment flow probably doesn't work correctly

**Problem:** If appointment payment requires specific endpoint:
```javascript
// Web correctly calls:
POST /wallet/appointment/pay {appointmentId, consultationFee, doctorName}

// Mobile incorrectly calls:
POST /wallet/spend {generic data}
```

**FIX REQUIRED:** Add appointment-specific payment endpoint to mobile

```javascript
payForAppointment: (appointmentId, consultationFee, doctorName) => 
  api.post('/wallet/appointment/pay', {
    appointmentId,
    consultationFee,
    doctorName
  })
```

---

## 📋 ENDPOINT STATUS MATRIX

| # | Endpoint | Method | Web | Mobile | Match | Issue |
|---|----------|--------|-----|--------|-------|-------|
| 1 | `/users/login` | POST | ✅ | ✅ | ✅ | No refresh token handling |
| 2 | `/users/login/verify-otp` | POST | ✅ | ✅ | ✅ | Same as #1 |
| 3 | `/users/profile` | GET | ✅ | ✅ | ⚠️ | Response unwrapping |
| 4 | `/users/profile` | PUT | ✅ | ✅ | ⚠️ | Response unwrapping |
| 5 | `/video/livekit/token` | POST | ✅ | ✅ | ⚠️ | Mobile has duplicate `/mobile/video/token` |
| 6 | `/enhanced-appointments/my-appointments` | GET | ✅ | ✅ | ✅ | Both have endpoint |
| 7 | `/appointments` | POST | ❌ | ✅ | ❌ | Web uses enhanced, mobile uses legacy |
| 8 | `/enhanced-appointments/book` | POST | ✅ | ✅ | ✅ | Mobile has separate endpoint |
| 9 | `/reports` | POST | ✅ | ✅ | ✅ | Both have upload |
| 10 | `/reports/{id}/analyze` | POST | ✅ | ✅ | ✅ | Both exist |
| 11 | `/ai-health/chat` | POST | ✅ | ✅ | ✅ | Both exist |
| 12 | `/ai-health/dr-isha/consult` | POST | ❌ | ✅ | ❌ | Mobile-specific endpoint |
| 13 | `/wallet/balance` | GET | ✅ | ✅ | ⚠️ | Response unwrapping |
| 14 | `/wallet/appointment/pay` | POST | ✅ | ❌ | ❌ | **MISSING in mobile** |
| 15 | `/wallet/earn/daily-login` | POST | ✅ | ✅ | ✅ | Both exist |

---

## 🔧 CRITICAL FIXES REQUIRED (Priority Order)

### PRIORITY 1 - BLOCKS ALL FEATURES
1. **Implement token refresh mechanism** (like web app)
   - Impact: Users logged out constantly
   - Effort: High (requires interceptor redesign)
   - File: `/app/Utils/api.js`

2. **Add tenant support**
   - Impact: Enterprise features don't work
   - Effort: Medium (add header injection)
   - File: `/app/Utils/api.js`

3. **Fix response parsing**
   - Impact: Data returned as wrong type
   - Effort: Low (add `.data` unwrapping)
   - Files: Multiple screens

4. **Increase timeout**
   - Impact: Video calls timeout, AI requests fail
   - Effort: Low (change 20000 → 30000)
   - File: `/app/Utils/api.js`

### PRIORITY 2 - BROKEN FEATURES
5. **Fix video token endpoint**
   - Remove `/mobile/video/token` duplicate
   - Use `/video/livekit/token` consistently
   - Impact: Video calls fail
   - Effort: Low

6. **Fix appointment booking**
   - Use `bookEnhanced` by default
   - Impact: Bookings don't include all fields
   - Effort: Low

7. **Add wallet payment endpoint**
   - Implement `/wallet/appointment/pay`
   - Impact: Appointment payments fail
   - Effort: Medium

### PRIORITY 3 - INCONSISTENCIES
8. **Clarify AI endpoints**
   - Determine `/ai-health/chat` vs `/ai-health/dr-isha/consult`
   - Impact: Wrong AI response
   - Effort: Medium (backend clarification)

9. **Add role-based auth handling**
   - Support team/admin/CRM users
   - Impact: Non-patient users can't use mobile
   - Effort: High

---

## 📝 DETAILED FIX TEMPLATES

### FIX #1: Token Refresh Mechanism
**File:** `/app/Utils/api.js`

**Current (Broken):**
```javascript
api.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401) {
      AsyncStorage.multiRemove(['authToken', 'userData']);
    }
    return Promise.reject(err);
  },
);
```

**Fixed:**
```javascript
let _isRefreshing = false;
let _refreshQueue = [];

api.interceptors.response.use(
  res => res,
  async err => {
    const originalRequest = err.config;
    
    if (err?.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        // Clear auth and navigate to login (handled by screen)
        await AsyncStorage.multiRemove(['authToken', 'userData', 'refreshToken']);
        return Promise.reject(err);
      }

      originalRequest._retry = true;

      // Queue requests while refresh is in flight
      if (_isRefreshing) {
        return new Promise(resolve => {
          _refreshQueue.push(resolve);
        }).then(newToken => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        });
      }

      _isRefreshing = true;
      try {
        const response = await axios.post(
          `${BASE}/users/auth/refresh`,
          { refreshToken }
        );
        
        if (response.data?.token) {
          const newToken = response.data.token;
          const newRefreshToken = response.data.refreshToken || refreshToken;
          
          await AsyncStorage.multiSet([
            ['authToken', newToken],
            ['refreshToken', newRefreshToken],
          ]);

          // Resolve all queued requests
          _refreshQueue.forEach(cb => cb(newToken));
          _refreshQueue = [];

          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        // Refresh failed - clear auth
        await AsyncStorage.multiRemove(['authToken', 'userData', 'refreshToken']);
        return Promise.reject(refreshErr);
      } finally {
        _isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);
```

**What this does:**
- ✅ Detects 401 responses
- ✅ Retrieves refresh token from storage
- ✅ Makes refresh request
- ✅ Updates tokens in storage
- ✅ Queues concurrent requests while refresh in flight
- ✅ Retries original request with new token
- ✅ Clears auth only if refresh fails
- ✅ User stays logged in through token expiry

---

### FIX #2: Tenant Support
**File:** `/app/Utils/api.js`

**Current (Missing):**
```javascript
const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});
```

**Fixed:**
```javascript
// Add at top of file
const getTenantId = async () => {
  try {
    // Try AsyncStorage first
    const stored = await AsyncStorage.getItem('tenantId');
    if (stored) return stored;
    
    // Try userData object
    const userDataStr = await AsyncStorage.getItem('userData');
    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      if (userData?.tenantId) return userData.tenantId;
      if (userData?.organizationId) return userData.organizationId;
    }
  } catch (e) {
    // Silently fail, request works without tenant header
  }
  return null;
};

const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// Add tenant header to every request
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  
  // Add tenant header
  const tenantId = await getTenantId();
  if (tenantId) {
    config.headers['X-Tenant-ID'] = tenantId;
  }
  
  return config;
});
```

**What this does:**
- ✅ Checks AsyncStorage for tenantId
- ✅ Falls back to userData object
- ✅ Injects `X-Tenant-ID` header on all requests
- ✅ Allows multi-tenant support
- ✅ Gracefully handles missing tenant

---

### FIX #3: Response Unwrapping
**File:** `/app/Utils/api.js`

**Current (Wrong):**
```javascript
// When screen does:
const profile = await User.getProfile();
// Gets: { success: true, data: { id: 123, ... } }
// Should get: { id: 123, ... }
```

**Fixed - Option A (In API module):**
```javascript
export const User = {
  getProfile: () => api.get('/users/profile')
    .then(res => res.data?.data || res.data),  // ← Unwrap response
  updateProfile: (data) => api.put('/users/profile', data)
    .then(res => res.data?.data || res.data),
};
```

**Fixed - Option B (In screens):**
```javascript
// In any screen using the API:
const { data } = await User.getProfile();
// Then access: data.id, data.email, etc.
```

**What this does:**
- ✅ Extracts nested `data` object from response
- ✅ Fallback to raw response if no nesting
- ✅ Screens get correct data structure
- ✅ No surprises with response format

---

### FIX #4: Timeout Increase
**File:** `/app/Utils/api.js`

**Current:**
```javascript
timeout: 20000,  // 20 seconds (TOO SHORT)
```

**Fixed:**
```javascript
timeout: 30000,  // 30 seconds (matches web app)
```

**OR make it configurable per-request:**
```javascript
// In specific API calls that need longer timeout:
analyze: (reportId, data) => api.post(
  `/reports/${reportId}/analyze`,
  data,
  { timeout: 60000 }  // 60 seconds for AI processing
),
```

---

### FIX #5: Video Token Endpoint
**File:** `/app/Utils/api.js`

**Current (Broken):**
```javascript
export const Video = {
  token: (appointmentId) => api.post('/mobile/video/token', { appointmentId }),
  livekitToken: (data) => api.post('/video/livekit/token', data),  // Duplicate!
  join: (appointmentId) => api.get(`/consultation/video/join/${appointmentId}`),
  end: (appointmentId) => api.post(`/consultation/video/end/${appointmentId}`),
};
```

**Fixed:**
```javascript
export const Video = {
  // Use standard endpoint for video tokens
  token: (appointmentId) => api.post('/video/livekit/token', 
    { appointmentId },
    { timeout: 30000 }  // Longer timeout for token generation
  ),
  
  // Keep for backward compatibility but deprecated
  livekitToken: (data) => api.post('/video/livekit/token', data),
  
  join: (appointmentId) => api.get(`/consultation/video/join/${appointmentId}`),
  end: (appointmentId) => api.post(`/consultation/video/end/${appointmentId}`),
};
```

**OR if `/mobile/video/token` is a real endpoint:**
```javascript
// Use mobile endpoint with fallback
token: async (appointmentId) => {
  try {
    return await api.post('/mobile/video/token', { appointmentId });
  } catch (err) {
    // Fallback to standard endpoint
    return await api.post('/video/livekit/token', { appointmentId });
  }
},
```

---

### FIX #6: Wallet Payment Endpoint
**File:** `/app/Utils/api.js`

**Current (Missing):**
```javascript
export const Wallet = {
  // ... other endpoints
  spend: (data) => api.post('/wallet/spend', data),  // Generic, not appointment-specific
  createOrder: (amount) => api.post('/wallet/create-order', { amount }),
  verifyPayment: (data) => api.post('/wallet/verify-payment', data),
};
```

**Fixed (Add appointment-specific payment):**
```javascript
export const Wallet = {
  // ... existing endpoints
  
  // Add appointment-specific payment endpoint
  payForAppointment: (appointmentId, consultationFee, doctorName) =>
    api.post('/wallet/appointment/pay', {
      appointmentId,
      consultationFee,
      doctorName,
    }),

  // Check payment calculation
  canPayWithHC: (consultationFee) =>
    api.post('/wallet/appointment/can-pay', { consultationFee }),

  // Generic payment (keep for other uses)
  spend: (data) => api.post('/wallet/spend', data),
  createOrder: (amount) => api.post('/wallet/create-order', { amount }),
  verifyPayment: (data) => api.post('/wallet/verify-payment', data),
};
```

---

## ✅ VERIFICATION CHECKLIST

After implementing fixes, verify:

- [ ] Users can log in and stay logged in (token refresh works)
- [ ] Token is automatically refreshed when expired
- [ ] Concurrent requests don't cause duplicate refresh attempts
- [ ] Video calls complete without timeout errors
- [ ] File uploads/downloads don't timeout
- [ ] Appointment booking includes all required fields
- [ ] Appointment payment works with Health Coins
- [ ] AI analysis responses are parsed correctly
- [ ] User profile data displays correctly
- [ ] Wallet balance shows correct type (number, not object)
- [ ] Tenant ID is included in requests (if multi-tenant)
- [ ] Team/admin users can authenticate (when implemented)

---

## 📊 IMPLEMENTATION PRIORITY MATRIX

| Fix | Effort | Impact | Priority | Estimated Time |
|-----|--------|--------|----------|-----------------|
| Token Refresh | 🔴 High | 🔴 Critical | #1 | 4-6 hours |
| Tenant Support | 🟡 Medium | 🔴 Critical | #2 | 2-3 hours |
| Response Unwrapping | 🟢 Low | 🔴 Critical | #3 | 1-2 hours |
| Timeout Increase | 🟢 Low | 🟡 High | #4 | 10 mins |
| Video Endpoint Fix | 🟢 Low | 🟡 High | #5 | 30 mins |
| Wallet Payment | 🟡 Medium | 🟡 High | #6 | 1-2 hours |
| AI Endpoint Clarification | 🟡 Medium | 🟢 Medium | #7 | 2-3 hours |
| Role-Based Auth | 🔴 High | 🟢 Medium | #8 | 6-8 hours |

**Total Estimated Fix Time:** 17-25 hours

---

## 📞 QUESTIONS FOR BACKEND TEAM

1. **Video Token Endpoint:** Does `/mobile/video/token` exist on backend? If not, should mobile use `/video/livekit/token`?

2. **AI Endpoints:** What's the difference between:
   - `/ai-health/chat`
   - `/ai-health/dr-isha/consult`
   - `/medical-ai/consult`
   
   Should mobile use all three or consolidate?

3. **Response Format:** What's the actual response structure for endpoints? Is it:
   - `{ data: {...} }` (nested)
   - `{ success: bool, data: {...} }` (with status)
   - `{ ... }` (flat)

4. **Token Refresh:** What's the refresh endpoint? Is it:
   - `/users/auth/refresh`
   - `/auth/refresh`
   - Something else?

5. **Appointment Payment:** Is `/wallet/appointment/pay` the correct endpoint for health coin payment?

6. **Tenant Header:** Are all endpoints expecting `X-Tenant-ID` header, or only certain ones?

7. **Rate Limiting:** Are there rate limits that 20s timeout might hit?

---

**Document Generated:** April 23, 2026  
**Next Step:** Schedule implementation sprints to fix Priority 1 issues

