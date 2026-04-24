# ENDPOINT COMPARISON - CODE EXAMPLES
## Web App vs Mobile App (Function by Function)

**Purpose:** Show exactly what's different between web and mobile implementations  
**Format:** Side-by-side code comparison

---

## AUTHENTICATION ENDPOINTS

### 1. LOGIN ENDPOINT
**File Locations:**
- Web: `/client/src/utils/api.ts` + `/client/src/hooks/auth.ts`
- Mobile: `/app/Utils/api.js`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/utils/api.ts
// The endpoint call is generic, actual auth handled in hooks

// File: /client/src/hooks/auth.ts (simplified)
export const useAuth = () => {
  const login = async (email: string, password: string) => {
    const response = await api.post('/users/login', { email, password });
    const { token, refreshToken, userType } = response.data;
    
    // Store tokens by type
    if (userType === 'team') {
      localStorage.setItem('teamToken', token);
      localStorage.setItem('teamRefreshToken', refreshToken);
    } else if (userType === 'admin') {
      localStorage.setItem('adminToken', token);
    } else {
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
    }
    
    localStorage.setItem('userType', userType);
    return { token, userType };
  };
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js
export const Auth = {
  login: (email, password) => api.post('/users/login', { email, password }),
};

// Usage in SignIn screen (simplified):
const { data } = await Auth.login(email, password);
const token = data.token;  // ← Gets token
// ❌ MISSING: refreshToken extraction
// ❌ MISSING: userType detection
// ❌ MISSING: role-based storage logic

await AsyncStorage.setItem('authToken', token);
// ❌ MISSING: Storing refreshToken
// ❌ MISSING: Storing userType
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Endpoint | ✅ POST `/users/login` | ✅ POST `/users/login` | Match |
| Request params | ✅ `{email, password}` | ✅ `{email, password}` | Match |
| Response extraction | ✅ Gets token, refreshToken, userType | ❌ Only gets token | ❌ BROKEN |
| Token storage | ✅ Stores in appropriate key | ⚠️ Generic 'authToken' | ⚠️ ISSUE |
| RefreshToken storage | ✅ Stores + uses for refresh | ❌ Not stored at all | ❌ BROKEN |
| UserType handling | ✅ Detects & routes accordingly | ❌ Ignores userType | ❌ BROKEN |

#### FIX REQUIRED

**Mobile needs to match web's response handling:**
```javascript
// File: /app/Utils/api.js - Add to Auth module
const login = async (email, password) => {
  const response = await api.post('/users/login', { email, password });
  const { token, refreshToken, userType } = response.data;
  
  // Store tokens (with future role-based distinction)
  await AsyncStorage.multiSet([
    ['authToken', token],
    ['refreshToken', refreshToken],  // ← NEW: Store this!
    ['userType', userType],           // ← NEW: Store this!
  ]);
  
  return { token, refreshToken, userType };
};
```

---

### 2. VERIFY LOGIN OTP ENDPOINT
**File Locations:**
- Web: `/client/src/hooks/auth.ts`
- Mobile: `/app/Utils/api.js`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/hooks/auth.ts
const verifyLoginOtp = async (phone: string, otp: string) => {
  const response = await api.post('/users/login/verify-otp', {
    phoneNumber: phone,
    otp,
  });
  
  const { token, refreshToken, userType } = response.data;
  
  // Same storage logic as login
  if (userType === 'team') {
    localStorage.setItem('teamToken', token);
    localStorage.setItem('teamRefreshToken', refreshToken);
  } else {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
  }
  
  localStorage.setItem('userType', userType);
  return { token, userType };
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js
export const Auth = {
  verifyLoginOtp: (phone, otp) => api.post('/users/login/verify-otp', { 
    phoneNumber: phone, 
    otp 
  }),
};

// Usage:
const response = await Auth.verifyLoginOtp(phone, otp);
// ❌ Same issues as login:
// - Doesn't extract refreshToken
// - Doesn't extract userType
// - Doesn't store properly
```

#### FIX REQUIRED

**Same as login - extract and store all response fields:**
```javascript
const verifyLoginOtp = async (phone, otp) => {
  const response = await api.post('/users/login/verify-otp', {
    phoneNumber: phone,
    otp,
  });
  
  const { token, refreshToken, userType } = response.data;
  
  await AsyncStorage.multiSet([
    ['authToken', token],
    ['refreshToken', refreshToken],
    ['userType', userType],
  ]);
  
  return { token, refreshToken, userType };
};
```

---

## USER PROFILE ENDPOINTS

### 3. GET PROFILE ENDPOINT
**File Locations:**
- Web: `/client/src/hooks/useAuth.ts`
- Mobile: `/app/Screens/Profile/ProfileScreen.js` (or uses User module)

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/hooks/useAuth.ts (simplified)
const fetchProfile = async (): Promise<UserProfile> => {
  const response = await api.get('/users/profile');
  
  // Web API returns nested structure
  // Response format: { success: true, data: { id, email, firstName, ... } }
  const profile = response.data.data;  // ← Unwrap nested data
  
  // Update auth state
  setUser(profile);
  localStorage.setItem('userData', JSON.stringify(profile));
  
  return profile;
};

// Usage in components:
const profile = await fetchProfile();
console.log(profile.email);  // Works: has email property
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js
export const User = {
  getProfile: () => api.get('/users/profile'),
};

// Usage in ProfileScreen:
useEffect(() => {
  const loadProfile = async () => {
    try {
      const response = await User.getProfile();
      setProfile(response.data);  // ← Gets entire response
      // response.data = { success: true, data: { ... } }
    } catch (err) {
      setError(err);
    }
  };
  loadProfile();
}, []);

// In screen render:
<Text>{profile.data?.email}</Text>  // ← Wrong! Needs extra .data
// OR might crash if profile.email undefined
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Endpoint | ✅ GET `/users/profile` | ✅ GET `/users/profile` | Match |
| Response parsing | ✅ Unwraps `response.data.data` | ❌ Uses `response.data` directly | ❌ BROKEN |
| Error handling | ✅ Has catch block | ✅ Has catch block | Match |
| State update | ✅ Stores full profile | ⚠️ Stores response object | ⚠️ ISSUE |
| Type safety | ✅ TypeScript validation | ❌ No type checking | ❌ UNSAFE |

#### ACTUAL RESPONSE FORMAT

**From Backend:**
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "id": 123,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "9876543210",
    "profilePicture": "https://...",
    "subscription": {
      "plan": "premium",
      "validTill": "2025-04-23"
    }
  }
}
```

**Web correctly gets:**
```javascript
response.data.data  // → { id, email, firstName, ... }
```

**Mobile incorrectly gets:**
```javascript
response.data  // → { success, statusCode, data: {...} }
```

#### FIX REQUIRED

**Option A: Fix in API module (recommended)**
```javascript
// File: /app/Utils/api.js - User module
export const User = {
  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data?.data || response.data;  // ← Unwrap or return raw
  },
  updateProfile: async (data) => {
    const response = await api.put('/users/profile', data);
    return response.data?.data || response.data;
  },
  // ... other profile methods
};
```

**Option B: Fix in every screen that uses it**
```javascript
// File: /app/Screens/Profile/ProfileScreen.js
const response = await User.getProfile();
const profileData = response?.data || response;  // ← Handle both formats
setProfile(profileData);
```

---

### 4. UPDATE PROFILE ENDPOINT
**File Locations:**
- Web: `/client/src/hooks/useAuth.ts`
- Mobile: `/app/Screens/Profile/ProfileScreen.js`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/hooks/useAuth.ts
const updateProfile = async (updates: Partial<UserProfile>) => {
  const response = await api.put('/users/profile', updates);
  
  const updatedProfile = response.data.data;
  setUser(updatedProfile);
  localStorage.setItem('userData', JSON.stringify(updatedProfile));
  
  return updatedProfile;
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js
export const User = {
  updateProfile: (data) => api.put('/users/profile', data),
};

// Usage in Edit Profile Modal:
const handleSave = async () => {
  try {
    const response = await User.updateProfile({
      firstName: editFirstName,
      lastName: editLastName,
      email: editEmail,
    });
    
    // ❌ Same response parsing issue
    setUserData(response.data);  // Gets wrong structure
    Alert.alert('Success');
  } catch (err) {
    Alert.alert('Error', err.message);
  }
};
```

#### FIX REQUIRED

**Same as GET profile - unwrap response:**
```javascript
export const User = {
  updateProfile: async (data) => {
    const response = await api.put('/users/profile', data);
    return response.data?.data || response.data;  // ← Unwrap
  },
};
```

---

## VIDEO CONSULTATION ENDPOINTS

### 5. GET VIDEO TOKEN ENDPOINT
**File Locations:**
- Web: `/client/src/services/videoService.ts` or similar
- Mobile: `/app/Utils/api.js` + `/app/Screens/VideoCall/*`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/services/videoService.ts (likely)
const getVideoToken = async (appointmentId: number) => {
  const response = await api.post('/video/livekit/token', {
    appointmentId,
    role: 'host',  // Might be doctor or patient
  });
  
  const { token, roomName, serverUrl } = response.data.data;
  
  return {
    token,
    roomName,
    serverUrl,
  };
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js - Video module
export const Video = {
  token: (appointmentId) => api.post('/mobile/video/token', { appointmentId }),
  //     ↑ Uses DIFFERENT endpoint!
  
  livekitToken: (data) => api.post('/video/livekit/token', data),
  //           ↑ Duplicate?
};

// Usage in VideoCall screen:
const handleStartVideo = async () => {
  try {
    const response = await Video.token(appointmentId);
    // Calls POST /mobile/video/token
    // If this endpoint doesn't exist → 404 error!
    
    const { token, roomName } = response.data;
    initializeVideoCall(token, roomName);
  } catch (err) {
    Alert.alert('Error', 'Failed to start video call');
  }
};
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Endpoint 1 | ✅ POST `/video/livekit/token` | ✅ POST `/video/livekit/token` | Match |
| Endpoint 2 | N/A | ⚠️ POST `/mobile/video/token` | Extra endpoint |
| Default endpoint | ✅ `/livekit/token` | ❌ `/mobile/video/token` | ❌ MISMATCH |
| Timeout | ⚠️ 30s (might need more) | ❌ 20s (too short) | ❌ BROKEN |
| Request params | ✅ `{appointmentId, role}` | ⚠️ `{appointmentId}` only | ⚠️ INCOMPLETE |

#### KEY QUESTION

**Does `/mobile/video/token` endpoint exist on backend?**

If YES:
```javascript
// Current code is correct
// But why duplicate with /video/livekit/token?
```

If NO:
```javascript
// Current code will fail with 404
// Need to use /video/livekit/token instead
```

#### FIX REQUIRED

**Consolidate endpoints (assumes `/mobile/video/token` doesn't exist):**
```javascript
// File: /app/Utils/api.js - Video module
export const Video = {
  // Use standard endpoint, longer timeout
  token: (appointmentId) => api.post(
    '/video/livekit/token',
    { appointmentId },
    { timeout: 60000 }  // 60s for video token (includes WebRTC negotiation)
  ),
  
  // Legacy endpoint for backward compatibility
  livekitToken: (data) => api.post(
    '/video/livekit/token',
    data,
    { timeout: 60000 }
  ),
  
  join: (appointmentId) => api.get(`/consultation/video/join/${appointmentId}`),
  end: (appointmentId) => api.post(`/consultation/video/end/${appointmentId}`),
};
```

---

## APPOINTMENT ENDPOINTS

### 6. LIST APPOINTMENTS ENDPOINT
**File Locations:**
- Web: `/client/src/pages/appointments/*.tsx`
- Mobile: `/app/Screens/Appointments/*`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// Uses enhanced endpoint for new features
const listAppointments = async () => {
  const response = await api.get('/enhanced-appointments/my-appointments', {
    params: {
      status: 'upcoming',
      limit: 50,
      offset: 0,
    },
  });
  
  return response.data.data.appointments;
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js - Appointments module
export const Appointments = {
  list: (params = {}) => api.get('/enhanced-appointments/my-appointments', { params }),
  listLegacy: () => api.get('/appointments/my-appointments'),
};

// Usage:
useEffect(() => {
  const loadAppointments = async () => {
    try {
      const response = await Appointments.list({ status: 'upcoming' });
      setAppointments(response.data.data || response.data);  // ← Defensive parsing
    } catch (err) {
      setError(err);
    }
  };
  loadAppointments();
}, []);
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Primary endpoint | ✅ `/enhanced-appointments/my-appointments` | ✅ `/enhanced-appointments/my-appointments` | Match |
| Legacy endpoint | ❌ Doesn't use | ✅ Has `.listLegacy()` | Fallback available |
| Params support | ✅ `{status, limit, offset}` | ✅ Generic params object | Match |
| Response parsing | ✅ Unwraps correctly | ⚠️ Defensive parsing | ⚠️ ISSUE |

#### STATUS

✅ **Mostly works** - Just needs response parsing fix like GET profile

---

### 7. BOOK APPOINTMENT ENDPOINT
**File Locations:**
- Web: `/client/src/pages/appointments/booking/*.tsx`
- Mobile: `/app/Screens/Appointments/BookingFlow.js` or similar

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// Uses enhanced endpoint for new features
const bookAppointment = async (bookingData: BookingRequest) => {
  const response = await api.post('/enhanced-appointments/book', {
    doctorId: bookingData.doctorId,
    appointmentDate: bookingData.date,
    appointmentTime: bookingData.time,
    type: bookingData.type || 'consultation',
    notes: bookingData.notes,
    consultationType: bookingData.consultationType,  // video/in-person
    // ... more fields
  });
  
  return response.data.data.appointment;
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js - Appointments module
export const Appointments = {
  book: (data) => api.post('/appointments', data),        // ← LEGACY
  bookEnhanced: (data) => api.post('/enhanced-appointments/book', data),  // ← NEW
};

// Common mistake: Using legacy endpoint
const handleBookAppointment = async () => {
  const result = await Appointments.book({  // ← Using LEGACY endpoint!
    doctorId: selectedDoctor.id,
    appointmentDate: selectedDate,
    appointmentTime: selectedTime,
  });
  // ❌ Missing many fields that enhanced endpoint expects
};

// Should use:
const result = await Appointments.bookEnhanced({  // ← Use NEW endpoint!
  doctorId: selectedDoctor.id,
  appointmentDate: selectedDate,
  appointmentTime: selectedTime,
  type: 'consultation',
  consultationType: 'video',
  // ... include all relevant fields
});
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Endpoint used | ✅ `/enhanced-appointments/book` (NEW) | ⚠️ `/appointments` (LEGACY) default | ⚠️ MISMATCH |
| Enhanced endpoint | ✅ Available | ✅ Available as `.bookEnhanced()` | ✅ Available |
| Fields sent | ✅ Complete (type, consultationType, etc) | ⚠️ Minimal fields | ⚠️ INCOMPLETE |
| Response parsing | ✅ Unwraps correctly | ⚠️ Defensive parsing needed | ⚠️ ISSUE |

#### FIX REQUIRED

**Make enhanced booking the default:**
```javascript
// File: /app/Utils/api.js - Appointments module
export const Appointments = {
  // NEW: Default to enhanced endpoint
  book: (data) => api.post('/enhanced-appointments/book', data),
  
  // LEGACY: Keep for backward compatibility
  bookLegacy: (data) => api.post('/appointments', data),
  
  // Keep for explicit enhanced use
  bookEnhanced: (data) => api.post('/enhanced-appointments/book', data),
  
  // ... other methods
};
```

**And update all screens to use the full payload:**
```javascript
const result = await Appointments.book({
  doctorId: selectedDoctor.id,
  appointmentDate: selectedDate,
  appointmentTime: selectedTime,
  type: bookingData.type || 'consultation',
  consultationType: consultationType,  // ← Add this
  notes: userNotes,                    // ← Add this
  // ... other enhanced fields
});
```

---

## WALLET ENDPOINTS

### 8. GET WALLET BALANCE ENDPOINT
**File Locations:**
- Web: `/client/src/services/wallet.service.ts`
- Mobile: `/app/Utils/api.js` + `/app/Screens/Wallet/*`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/services/wallet.service.ts (simplified)
class WalletService {
  async getBalance(): Promise<number> {
    const response = await api.get('/wallet/balance');
    
    // Response structure: { balance: 500, currency: "INR" }
    // Extract just the number
    return response.data.balance;  // Returns: number
  }
}

// Usage:
const balance = await walletService.getBalance();
console.log(balance + 100);  // Works: 600 (number + number)
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js - Wallet module
export const Wallet = {
  balance: () => api.get('/wallet/balance'),
};

// Usage in Wallet screen:
useEffect(() => {
  const loadBalance = async () => {
    const response = await Wallet.balance();
    setBalance(response.data);  // Gets entire response object!
    // response.data = { balance: 500, currency: "INR" }
  };
  loadBalance();
}, []);

// In screen render:
<Text>${balance.balance}</Text>  // ← Wrong! Needs extra .balance
// OR if trying:
<Text>${balance}</Text>  // Shows "[object Object]" - crashes
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Endpoint | ✅ GET `/wallet/balance` | ✅ GET `/wallet/balance` | Match |
| Response parsing | ✅ Extracts `.balance` (number) | ❌ Returns entire object | ❌ BROKEN |
| Type returned | ✅ `number` | ❌ `{ balance: number, currency: string }` | ❌ TYPE MISMATCH |
| Usage in screen | ✅ Can do math: `balance + 100` | ❌ Math fails: `{...} + 100` | ❌ BROKEN |

#### FIX REQUIRED

**Extract balance in API module:**
```javascript
// File: /app/Utils/api.js - Wallet module
export const Wallet = {
  balance: async () => {
    const response = await api.get('/wallet/balance');
    return response.data?.balance || 0;  // ← Extract number or default 0
  },
  // ... other wallet methods
};
```

---

### 9. PAY FOR APPOINTMENT ENDPOINT
**File Locations:**
- Web: `/client/src/services/wallet.service.ts`
- Mobile: Not implemented!

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/services/wallet.service.ts
class WalletService {
  /**
   * Pay for appointment using Health Coins (via wallet route)
   */
  async payForAppointmentWithHC(
    appointmentId: number,
    consultationFee: number,
    doctorName: string
  ): Promise<PaymentResponse> {
    const response = await api.post('/wallet/appointment/pay', {
      appointmentId,
      consultationFee,
      doctorName,
    });
    return response.data.data;  // Returns: { appointmentId, hcPaid, newBalance, ... }
  }

  /**
   * Calculate HC required for a consultation fee
   */
  async calculateHCForConsultation(consultationFee: number): Promise<HCCalculation> {
    const response = await api.get(`/wallet/appointment/calculate/${consultationFee}`);
    return response.data.data;
  }

  /**
   * Check if user can pay for appointment with HC
   */
  async canPayWithHC(consultationFee: number): Promise<HCCalculation> {
    const response = await api.post('/wallet/appointment/can-pay', {
      consultationFee,
    });
    return response.data.data;
  }
}
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js - Wallet module
export const Wallet = {
  // Generic endpoints only:
  details: () => api.get('/wallet'),
  balance: () => api.get('/wallet/balance'),
  transactions: (params={}) => api.get('/wallet/transactions', { params }),
  rewards: () => api.get('/wallet/rewards'),
  
  // Generic spending:
  spend: (data) => api.post('/wallet/spend', data),  // ← Not appointment-specific
  createOrder: (amount) => api.post('/wallet/create-order', { amount }),
  verifyPayment: (data) => api.post('/wallet/verify-payment', data),
  
  // ❌ MISSING:
  // payForAppointment - NO APPOINTMENT PAYMENT!
  // canPayWithHC - NO HC CALCULATION!
  // calculateHCForConsultation - NO CALCULATION!
};

// In mobile appointment booking:
// How do users pay? This is broken!
```

#### COMPARISON TABLE

| Endpoint | Web | Mobile | Status |
|----------|-----|--------|--------|
| `/wallet/balance` | ✅ | ✅ | Exists |
| `/wallet/transactions` | ✅ | ✅ | Exists |
| `/wallet/spend` | ✅ | ✅ | Exists |
| `/wallet/appointment/pay` | ✅ | ❌ | **MISSING** |
| `/wallet/appointment/can-pay` | ✅ | ❌ | **MISSING** |
| `/wallet/appointment/calculate/{fee}` | ✅ | ❌ | **MISSING** |

#### FIX REQUIRED

**Add appointment-specific payment endpoints to mobile:**
```javascript
// File: /app/Utils/api.js - Wallet module
export const Wallet = {
  // ... existing endpoints ...

  // NEW: Appointment-specific payment
  payForAppointment: (appointmentId, consultationFee, doctorName) =>
    api.post('/wallet/appointment/pay', {
      appointmentId,
      consultationFee,
      doctorName,
    }),

  // NEW: Check if can pay
  canPayWithHC: (consultationFee) =>
    api.post('/wallet/appointment/can-pay', {
      consultationFee,
    }),

  // NEW: Calculate HC required
  calculateHCForConsultation: (consultationFee) =>
    api.get(`/wallet/appointment/calculate/${consultationFee}`),
};
```

**And update appointment booking flow:**
```javascript
// In BookingFlow.js
const handlePayment = async () => {
  // 1. Check if can pay
  const hcCalc = await Wallet.canPayWithHC(consultation Fee);
  if (!hcCalc.canPay) {
    Alert.alert('Insufficient health coins');
    return;
  }

  // 2. Process payment
  try {
    const result = await Wallet.payForAppointment(
      appointmentId,
      consultationFee,
      doctorName
    );
    
    Alert.alert('Success', `Paid ${result.hcPaid} HC`);
    setAppointmentConfirmed(true);
  } catch (err) {
    Alert.alert('Payment failed', err.message);
  }
};
```

---

## AI HEALTH ENDPOINTS

### 10. HEALTH CHAT ENDPOINT
**File Locations:**
- Web: `/client/src/services/aiHealthServices.ts`
- Mobile: `/app/Utils/api.js` + `/app/Screens/AIAssistant/*`

#### ENDPOINT DEFINITION

**WEB:**
```typescript
// File: /client/src/services/aiHealthServices.ts (simplified)
const chatWithHealthAssistant = async (
  message: string,
  conversationHistory: ConversationItem[] = []
) => {
  const response = await api.post('/ai-health/chat', {
    message,
    conversationHistory: conversationHistory.map(item => ({
      role: item.role,  // 'user' or 'assistant'
      content: item.content,
    })),
  }, {
    timeout: 30000,  // AI responses can take a while
  });
  
  return {
    response: response.data.data.response,
    confidence: response.data.data.confidence,
    references: response.data.data.references || [],
  };
};
```

**MOBILE:**
```javascript
// File: /app/Utils/api.js - AI module
export const AI = {
  consult: (data) => api.post('/medical-ai/consult', data),
  healthChat: (data) => api.post('/ai-health/chat', data),
  drIsha: (data) => api.post('/ai-health/dr-isha/consult', data),
  // ↑ Three similar endpoints - which to use?
};

// Usage in AIAssistant screen:
const handleSendMessage = async (message) => {
  try {
    const response = await AI.drIsha({  // ← Using drIsha endpoint
      message,
      conversationHistory: messages,
    });
    
    // Timeout after 20 seconds!
    // Response structure: ?
    // No documentation on which endpoint to use
  } catch (err) {
    Alert.alert('Error', err.message);
  }
};
```

#### COMPARISON TABLE

| Aspect | Web | Mobile | Status |
|--------|-----|--------|--------|
| Endpoint | ✅ POST `/ai-health/chat` | ⚠️ `/healthChat` AND `/drIsha` | ⚠️ UNCLEAR |
| Timeout | ✅ 30s | ❌ 20s | ❌ TOO SHORT |
| Message format | ✅ Documented | ❌ Not clear | ❌ UNCLEAR |
| History format | ✅ Array of `{role, content}` | ⚠️ Needs confirmation | ⚠️ UNCLEAR |
| Response parsing | ✅ `.data.data.response` | ❌ Raw response | ❌ BROKEN |

#### QUESTION FOR BACKEND

**What's the difference between these endpoints?**
```
1. POST /ai-health/chat
2. POST /ai-health/dr-isha/consult
3. POST /medical-ai/consult

Which should mobile use? Are they different features or duplicates?
```

#### FIX REQUIRED

**Consolidate to single endpoint with longer timeout:**
```javascript
// File: /app/Utils/api.js - AI module
export const AI = {
  // Consolidated health chat
  healthChat: (data) => api.post('/ai-health/chat', data, {
    timeout: 60000,  // 60s for AI processing
  }),
  
  // Alias for backward compatibility if drIsha is used elsewhere
  drIsha: (data) => api.post('/ai-health/chat', data, {
    timeout: 60000,
  }),
  
  // Remove duplicate if not needed:
  // consult: (data) => api.post('/medical-ai/consult', data),
  // Remove if not used
  
  // ... other AI endpoints
};
```

**And fix response parsing in screens:**
```javascript
const response = await AI.healthChat({
  message: userMessage,
  conversationHistory: messages,
});

// Handle response correctly
const assistantMessage = response.data?.data?.response || response.data?.response;
setMessages([...messages, {
  role: 'assistant',
  content: assistantMessage,
}]);
```

---

## SUMMARY TABLE - ALL ENDPOINTS

| # | Endpoint | HTTP | Web | Mobile | Issue | Fix Time |
|---|----------|------|-----|--------|-------|----------|
| 1 | `/users/login` | POST | ✅ | ⚠️ | No refresh token handling | 1h |
| 2 | `/users/login/verify-otp` | POST | ✅ | ⚠️ | No refresh token handling | 1h |
| 3 | `/users/profile` | GET | ✅ | ❌ | Response parsing | 1h |
| 4 | `/users/profile` | PUT | ✅ | ❌ | Response parsing | 30m |
| 5 | `/video/livekit/token` | POST | ✅ | ⚠️ | Timeout + endpoint confusion | 1h |
| 6 | `/enhanced-appointments/my-appointments` | GET | ✅ | ⚠️ | Response parsing | 30m |
| 7 | `/appointments` (legacy) | POST | ❌ | ⚠️ | Using legacy instead of enhanced | 30m |
| 8 | `/enhanced-appointments/book` | POST | ✅ | ⚠️ | Incomplete fields | 1h |
| 9 | `/wallet/balance` | GET | ✅ | ❌ | Response type mismatch | 30m |
| 10 | `/wallet/appointment/pay` | POST | ✅ | ❌ | MISSING endpoint | 1h |
| 11 | `/ai-health/chat` | POST | ✅ | ⚠️ | Timeout + endpoint confusion | 1h |
| 12 | `/reports` | POST | ✅ | ✅ | OK | N/A |
| 13 | `/reports/{id}/analyze` | POST | ✅ | ⚠️ | Timeout | 10m |

**Total Implementation Time Estimate:** 10-12 hours

---

**Document Generated:** April 23, 2026  
**Next Step:** Prioritize fixes and assign to developers

