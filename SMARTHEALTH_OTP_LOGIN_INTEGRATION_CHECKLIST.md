# 📱 SmartHealth OTP Login Integration Checklist

**Date:** February 8, 2026  
**Status:** Ready for Implementation  
**Version:** 1.0.0

---

## 🎯 Quick Start

This document guides your mobile team through implementing OTP-based authentication for SmartHealth React Native app.

**Estimated Time:** 2-4 hours  
**Difficulty:** Medium  
**Required Skills:** React Native, JavaScript, Async/Await

---

## ✅ Pre-Implementation Setup

- [ ] **Environment Configured**
  - [ ] `.env` file created with Auth Base URL: `https://app.mediqzy.com/api`
  - [ ] Separate axios clients created for auth vs API
  - [ ] `REACT_APP_AUTH_BASE_URL=https://app.mediqzy.com/api` set
  - [ ] `REACT_APP_API_BASE_URL=https://api.mediqzy.com` set

- [ ] **Dependencies Installed**
  ```bash
  npm install expo-secure-store @react-native-async-storage/async-storage axios
  ```
  - [ ] `expo-secure-store` (secure token storage)
  - [ ] `axios` or `fetch` (HTTP requests)
  - [ ] `react-native` (UI components)

- [ ] **Backend Verified**
  - [ ] `/api/auth/send-otp` endpoint is accessible
  - [ ] `/api/auth/verify-otp` endpoint is accessible
  - [ ] SMS service is configured and working
  - [ ] Auth Base URL responds to requests

---

## 📋 Implementation Steps

### Step 1: Create OTP Service Layer

**File:** `services/otpService.js`

- [ ] Create `OTPService` class with methods:
  - [ ] `sendOTP(phoneNumber)` - Send OTP to phone
  - [ ] `verifyOTP(sessionId, code)` - Verify OTP and login
  - [ ] `resendOTP(sessionId)` - Resend OTP
  - [ ] Add error handling for all methods
  - [ ] Add timeout handling (10 minute expiry)

**Checklist:**
```javascript
// Verify these methods exist:
✅ sendOTP(phoneNumber)
   └─ Makes POST to /api/auth/send-otp
   └─ Returns { otp_session_id, expires_in }
   └─ Handles 400/500 errors

✅ verifyOTP(otpSessionId, otpCode)
   └─ Makes POST to /api/auth/verify-otp
   └─ Returns { token, user }
   └─ Stores token in SecureStore
   └─ Validates OTP format (6 digits)

✅ Error handling for:
   └─ Invalid phone format
   └─ OTP send failure
   └─ OTP verification failure
   └─ Network timeout (30s)
   └─ Session expired
```

### Step 2: Create OTP Login Screen

**File:** `screens/OTPLoginScreen.js`

- [ ] Two-phase login flow implemented:
  - **Phase 1:** Phone number entry
    - [ ] Input validation (10 digits)
    - [ ] +91 country code prepended
    - [ ] "Send OTP" button
    - [ ] Loading state during request
    - [ ] Error display
  
  - **Phase 2:** OTP verification
    - [ ] 6-digit input field
    - [ ] "Verify & Login" button
    - [ ] Resend timer (60 seconds)
    - [ ] Loading state during verification
    - [ ] Error display
    - [ ] Back button to change phone

- [ ] State Management:
  - [ ] `step` state ('phone' or 'otp')
  - [ ] `phoneNumber` state
  - [ ] `otpCode` state
  - [ ] `otpSessionId` state
  - [ ] `loading` state
  - [ ] `resendTimer` state

- [ ] Event Handlers:
  - [ ] `handleSendOTP()` - Send OTP
  - [ ] `handleVerifyOTP()` - Verify and login
  - [ ] `resendOTP()` - Resend OTP (with timer)

**Checklist:**
```
Screen Rendering:
✅ Show phone input on "phone" step
✅ Show OTP input on "otp" step
✅ Validate inputs before submission
✅ Display error alerts for failures
✅ Show loading spinner during requests

User Experience:
✅ Auto-focus OTP input after sending
✅ Keyboard type set to "numeric"
✅ Max length validation (10 for phone, 6 for OTP)
✅ Resend button disabled during cooldown
✅ Back/change phone option available
```

### Step 3: Integrate with Authentication Context

**File:** `contexts/AuthContext.js`

- [ ] Add OTP methods to `AuthContext`:
  - [ ] `loginWithOTP(phoneNumber, otpCode)`
  - [ ] Handle OTP session persistence
  - [ ] Store JWT token after verification
  - [ ] Store user data
  - [ ] Set auth state to 'authenticated'

- [ ] State handling:
  - [ ] `authState` = 'idle' | 'authenticating' | 'authenticated' | 'error'
  - [ ] `user` = currently logged-in user
  - [ ] `token` = JWT token

**Checklist:**
```javascript
AuthContext should provide:
✅ loginWithOTP(phone, otp) function
✅ logout() function to clear tokens
✅ user state
✅ token state
✅ authState for loading states
✅ error state for displaying messages
```

### Step 4: Update Navigation Flow

**File:** `App.js` or `RootNavigator.js`

- [ ] Navigation logic:
  - [ ] Show `OTPLoginScreen` when not authenticated
  - [ ] Show `MainApp` stack when authenticated
  - [ ] Handle token refresh on app startup
  - [ ] Clear auth state on logout

**Checklist:**
```
✅ OTPLoginScreen rendered before authentication
✅ MainApp stack rendered after successful login
✅ Token persisted and restored on app restart
✅ Logout clears all stored data
✅ Handle deep links after login
```

### Step 5: Add Security Features

**File:** `services/secureStorage.js`

- [ ] Secure storage implementation:
  - [ ] Store JWT token in `SecureStore` (iOS Keychain, Android Keystore)
  - [ ] Store user ID securely
  - [ ] Do NOT store sensitive data in AsyncStorage
  - [ ] Clear all data on logout

**Checklist:**
```javascript
SecureStore.setItemAsync() usage:
✅ 'jwt_token' → Store JWT token
✅ 'user_id' → Store user ID
✅ 'user_phone' → Store phone number (optional)

On logout:
✅ SecureStore.deleteItemAsync('jwt_token')
✅ SecureStore.deleteItemAsync('user_id')
✅ AsyncStorage.clear()
✅ Navigation reset to login
```

### Step 6: Add Error Handling

**File:** `services/otpErrorHandler.js`

- [ ] Error types handled:
  - [ ] Invalid phone format
  - [ ] OTP send failure (network, backend error)
  - [ ] OTP already sent (try again in X seconds)
  - [ ] OTP verification failure
  - [ ] OTP expired (resend new code)
  - [ ] Session ID expired
  - [ ] Network timeout

**Checklist:**
```javascript
Error codes to handle:
✅ 400 - Invalid request (phone format, OTP format)
✅ 401 - Unauthorized (invalid OTP)
✅ 403 - Forbidden (too many attempts)
✅ 404 - Session not found
✅ 500 - Server error
✅ Network errors (timeout, no internet)

User-friendly messages:
✅ Show error modal/alert
✅ Suggest corrective action
✅ Allow retry
```

### Step 7: Test All Flows

**Testing Checklist:**

#### A. Happy Path
- [ ] Enter valid phone number
- [ ] Receive OTP SMS
- [ ] Enter correct OTP
- [ ] Successfully logged in
- [ ] JWT token stored securely
- [ ] Can access protected screens

#### B. Error Cases
- [ ] Invalid phone number format
  - [ ] Show error: "Enter valid 10-digit phone number"
  - [ ] Cannot proceed to OTP screen
  
- [ ] OTP send fails (network)
  - [ ] Show error
  - [ ] Retry button available
  
- [ ] Wrong OTP entered
  - [ ] Show error: "Invalid OTP"
  - [ ] Allow retry with same session
  
- [ ] OTP expired (>10 minutes)
  - [ ] Show error: "OTP expired"
  - [ ] Allow resend from phone screen

#### C. Edge Cases
- [ ] User switches back and forth between phone/OTP screens
- [ ] User sends multiple OTPs (should use latest)
- [ ] User closes app and reopens during OTP process
- [ ] No network connection during OTP send
- [ ] Network drops after OTP verified but before token saves

#### D. Security Testing
- [ ] Token stored in secure storage (not AsyncStorage)
- [ ] Token cleared on logout
- [ ] No sensitive data in logs
- [ ] HTTPS used for all requests
- [ ] No hardcoded credentials

---

## 🧪 Testing Commands

### Test OTP Send
```bash
curl -X POST https://app.mediqzy.com/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+919876543210", "country_code": "IN"}'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "otp_session_id": "session_abc123",
#     "expires_in": 600,
#     "sent_via": "sms"
#   }
# }
```

### Test OTP Verify
```bash
curl -X POST https://app.mediqzy.com/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "otp_session_id": "session_abc123",
    "otp_code": "123456"
  }'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "token": "eyJhbGc...",
#     "user": {
#       "id": "user_123",
#       "phone": "+919876543210",
#       "name": "John Doe"
#     }
#   }
# }
```

### Automated Testing (Jest)
```javascript
describe('OTP Login', () => {
  it('should send OTP successfully', async () => {
    const result = await otpService.sendOTP('+919876543210');
    expect(result.otp_session_id).toBeDefined();
    expect(result.expires_in).toEqual(600);
  });

  it('should verify OTP and return token', async () => {
    const result = await otpService.verifyOTP('session_123', '123456');
    expect(result.token).toBeDefined();
    expect(result.user.id).toBeDefined();
  });

  it('should fail with invalid OTP', async () => {
    expect(() => otpService.verifyOTP('session_123', '000000'))
      .rejects.toThrow('Invalid OTP');
  });
});
```

---

## 📊 Progress Tracking

### Phase 1: Setup (Day 1)
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] OTP service created
- [ ] Manual testing with curl

### Phase 2: UI & Integration (Day 1-2)
- [ ] OTP Login Screen created
- [ ] AuthContext updated
- [ ] Navigation integrated
- [ ] Manual testing complete

### Phase 3: Security & Testing (Day 2-3)
- [ ] Secure storage implemented
- [ ] Error handling complete
- [ ] Automated tests passing
- [ ] Security review completed

### Phase 4: Deployment (Day 3)
- [ ] Code review completed
- [ ] Staging environment testing
- [ ] Production deployment
- [ ] Monitoring active

---

## 🐛 Debugging Guide

### Issue: OTP Not Sending

**Check 1: Network Request**
```javascript
// Enable network logging
import { enableScreens } from 'react-native-screens';
enableScreens();

// Log request details
console.log('Sending OTP to:', phoneNumber);
console.log('Auth Base URL:', process.env.REACT_APP_AUTH_BASE_URL);
```

**Check 2: Server Response**
```bash
# Check if endpoint exists
curl -i https://app.mediqzy.com/api/auth/send-otp

# Should return 400 (bad request) or 200 (success), not 404
```

**Check 3: Phone Format**
```javascript
// Ensure phone format is correct
const phoneNumber = '9876543210'; // ✅ Correct (10 digits)
const formatted = `+91${phoneNumber}`;
console.log(formatted); // +919876543210

// ❌ Wrong formats to avoid
const wrong1 = '09876543210'; // Leading 0
const wrong2 = '91-9876543210'; // With dashes
const wrong3 = '+91 9876543210'; // With space
```

### Issue: OTP Token Not Stored

**Check: SecureStore Configuration**
```javascript
import * as SecureStore from 'expo-secure-store';

// Test SecureStore
const testSecureStore = async () => {
  try {
    await SecureStore.setItemAsync('test_key', 'test_value');
    const value = await SecureStore.getItemAsync('test_key');
    console.log('✅ SecureStore works:', value);
  } catch (error) {
    console.error('❌ SecureStore error:', error);
  }
};
```

### Issue: Firebase 403 Error

**Solution: Use OTP Without Firebase (Recommended for now)**
```javascript
// Do NOT wait for Firebase token before OTP login
// Firebase can be enabled after OTP is working

const loginWithOTP = async (phone, otp) => {
  // OTP login works independently
  // Firebase is optional for push notifications
  try {
    const result = await otpService.verifyOTP(sessionId, otp);
    // Success - user is logged in
  } catch (error) {
    // Handle error
  }
};
```

---

## 📞 Support Resources

### Additional Documentation
- [OTP Implementation in Mobile App](./SMARTHEALTH_MOBILE_APP_INTEGRATION_SUMMARY.md) - Lines 200-350
- [API Credentials Setup](./SMARTHEALTH_RN_API_CREDENTIALS_IMPLEMENTATION.md)
- [Firebase Configuration](./SMARTHEALTH_FIREBASE_CONFIGURATION_GUIDE.md)

### External References
- [Twilio OTP Best Practices](https://www.twilio.com/docs/verify/api/verification-code)
- [React Native Secure Storage](https://docs.expo.dev/modules/expo-secure-store/)
- [OAuth 2.0 Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

### Contact
- **Backend Support:** Backend team (OTP endpoints)
- **Mobile Support:** Mobile team lead
- **DevOps:** Check Auth Base URL routing

---

## 🎓 Key Takeaways

1. **Two Base URLs:** Auth → `app.mediqzy.com/api` | API → `api.mediqzy.com`
2. **OTP Flow:** Phone (step 1) → SMS Code (step 2) → JWT Token
3. **Secure Storage:** Token in SecureStore, not AsyncStorage
4. **Error Handling:** Always validate phone format and handle network errors
5. **Testing:** Use curl commands to verify backend before testing mobile app
6. **Firebase:** Optional for now (causes 403), enable after OTP works

---

**Version:** 1.0.0  
**Last Updated:** February 8, 2026  
**Status:** ✅ Ready for Team Implementation  
**Estimated Completion:** 2-4 hours  

Good luck! 🚀
