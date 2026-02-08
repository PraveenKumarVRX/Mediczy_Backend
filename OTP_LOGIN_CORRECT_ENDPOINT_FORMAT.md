# 🔧 OTP Login - Correct API Endpoint Format

**Issue:** user@mediczy.com unable to login via OTP  
**Date:** February 8, 2026  
**Root Cause:** Documentation had incorrect request format

---

## ❌ INCORRECT Format (Old Documentation)

```bash
# ❌ WRONG - This format is NOT supported
curl -X POST https://app.mediqzy.com/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+919876543210",
    "country_code": "IN"
  }'
```

**Why it fails:**
- Uses `phone_number` field (doesn't exist)
- Uses `country_code` field (doesn't exist)
- Doesn't go through proper user lookup

---

## ✅ CORRECT Format (Actual Implementation)

### Endpoint 1: Send OTP

```bash
# ✅ CORRECT - Use email OR phone (not both)
curl -X POST https://app.mediqzy.com/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@mediczy.com"
  }'
```

**Request Parameters:**
- **Field:** `identifier` (required)
- **Value:** Email address OR 10-digit phone number
- **Examples:**
  - `"user@mediczy.com"` (email) ✅
  - `"9876543210"` (10-digit phone) ✅
  - `"+91-9876543210"` (formatted phone) ✅
  - `"+919876543210"` (E.164 format) ✅

**Response (Success):**
```json
{
  "success": true,
  "message": "If an account exists, an OTP has been sent.",
  "data": {
    "otpId": "a1b2c3d4e5f6g7h8",
    "expiresAt": "2026-02-08T17:30:00Z",
    "expiresIn": "5 minutes",
    "deliveryMethod": "email",
    "sentTo": "us****@mediczy.com",
    "otp": "123456"  // Only if OTP_DEBUG_RESPONSE=true
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Please provide a valid email address or 10-digit phone number"
}
```

---

### Endpoint 2: Verify OTP

```bash
# ✅ CORRECT - Same identifier + 6-digit OTP
curl -X POST https://app.mediqzy.com/api/users/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@mediczy.com",
    "code": "123456"
  }'
```

**Request Parameters:**
- **Field:** `identifier` (required) - Same as sent OTP step
- **Field:** `code` (required) - 6-digit OTP
- **Examples:**
  - Email: `"identifier": "user@mediczy.com"`
  - Phone: `"identifier": "9876543210"`

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@mediczy.com",
    "firstName": "Test",
    "lastName": "User",
    "status": "active"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid or expired OTP"
}
```

---

## 📋 Complete Working Example

### Step 1: Send OTP
```bash
curl -X POST https://app.mediqzy.com/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@mediczy.com"}'

# Response:
# {
#   "success": true,
#   "data": {
#     "otpId": "abc123",
#     "expiresIn": "5 minutes",
#     "deliveryMethod": "email",
#     "otp": "123456"    // Only in development
#   }
# }
```

### Step 2: User receives OTP in email
- OTP expires in 5 minutes
- Check email/SMS inbox for code

### Step 3: Verify OTP
```bash
curl -X POST https://app.mediqzy.com/api/users/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@mediczy.com",
    "code": "123456"
  }'

# Response:
# {
#   "success": true,
#   "message": "Login successful",
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "user": { ... }
# }
```

### Step 4: Use JWT token
```bash
curl -X GET https://api.mediqzy.com/api/users/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

---

## 🔗 Endpoint Routing Map

To understand how OTP endpoints work:

```
Web Request:
  POST /api/auth/send-otp      ◄── Alias (for web compatibility)
       └─► Forwards to
           POST /api/users/login/send-otp  ◄── Actual handler

Web Request:
  POST /api/auth/verify-otp    ◄── Alias (for web compatibility)
       └─► Forwards to
           POST /api/users/login/verify-otp ◄── Actual handler

Mobile Request:
  POST /api/users/login/send-otp      ◄── Direct call (no alias)
  POST /api/users/login/verify-otp    ◄── Direct call (no alias)
```

**Both routes work, but the actual handler is always in `/api/users/login/*`**

---

## ⚠️ Common Mistakes

### ❌ Mistake 1: Wrong Field Names
```javascript
// WRONG
{
  "phoneNumber": "9876543210",    // Should be: identifier
  "emailAddress": "user@test.com" // Should be: identifier
}

// CORRECT
{
  "identifier": "9876543210"
}
```

### ❌ Mistake 2: Both Email & Phone
```javascript
// WRONG - Don't send both
{
  "email": "user@mediczy.com",
  "phone": "9876543210"
}

// CORRECT - Send ONE or the other
{
  "identifier": "user@mediczy.com"  // OR
  "identifier": "9876543210"
}
```

### ❌ Mistake 3: Wrong Base URL
```bash
# WRONG - Using api.mediqzy.com for OTP auth
curl -X POST https://api.mediqzy.com/api/users/login/send-otp

# CORRECT - Use app.mediqzy.com for auth endpoints
curl -X POST https://app.mediqzy.com/api/users/login/send-otp
```

### ❌ Mistake 4: OTP Format
```javascript
// WRONG - OTP can be any string
{
  "code": "abc123"    // Should be 6 digits
  "code": "000000"    // String is OK, but must be 6 chars exactly
}

// CORRECT - 6-digit OTP
{
  "code": "123456"    // String with 6 digits
}
```

---

## 🧪 Quick Test Checklist

Run these commands in order:

```bash
# 1. Verify user exists
echo "Step 1: Checking if user exists..."
curl -s -X POST https://app.mediqzy.com/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@mediczy.com"}' | jq '.data.otpId'

# If you see otpId, user exists ✅
# If you see error, user doesn't exist ❌
```

```bash
# 2. Check if OTP was sent (look in email)
echo "Step 2: Check email for OTP..."
# Look for "OTP" or 6-digit code in inbox

# Or if OTP_DEBUG_RESPONSE=true:
curl -s -X POST https://app.mediqzy.com/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@mediczy.com"}' | jq '.data.otp'
```

```bash
# 3. Verify OTP (use actual code from email)
echo "Step 3: Verifying OTP..."
curl -X POST https://app.mediqzy.com/api/users/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@mediczy.com", "code": "123456"}'

# Should return token ✅
```

---

## 🔄 Comparison: Password vs OTP Login

| Step | Password Login | OTP Login |
|------|---|---|
| 1 | POST `/api/patient/login` | POST `/api/users/login/send-otp` |
| 2 | Body: `{email, password}` | Body: `{identifier}` |
| 3 | Response: JWT token | Response: OTP sent successfully |
| 4 | User receives token | User receives OTP via email/SMS |
| 5 | - | POST `/api/users/login/verify-otp` |
| 6 | - | Body: `{identifier, code}` |
| 7 | - | Response: JWT token |

**Key Difference:** OTP requires 2 API calls (send + verify)

---

## 🐛 Troubleshooting Requests

If OTP login still doesn't work:

1. **Verify request format:**
   ```bash
   # Check request body structure
   curl -v -X POST https://app.mediqzy.com/api/users/login/send-otp \
     -H "Content-Type: application/json" \
     -d '{"identifier": "user@mediczy.com"}'
   ```

2. **Check response:**
   - HTTP 200 = Request received ✅
   - HTTP 400 = Invalid format ❌
   - HTTP 500 = Server error ❌

3. **Verify user exists:**
   ```bash
   # Does the user exist in database?
   psql -c "SELECT email FROM \"Users\" WHERE email = 'user@mediczy.com';"
   ```

4. **Enable debug mode for testing:**
   ```bash
   docker exec mediczy-backend bash -c 'echo "OTP_DEBUG_RESPONSE=true" >> /app/.env'
   docker restart mediczy-backend
   ```

---

## 📚 Related Documentation

- [OTP_LOGIN_TROUBLESHOOTING.md](OTP_LOGIN_TROUBLESHOOTING.md) - Full diagnostic guide
- [otp-diagnostic.sh](otp-diagnostic.sh) - Automated diagnostic script
- [SMARTHEALTH_OTP_LOGIN_INTEGRATION_CHECKLIST.md](SMARTHEALTH_OTP_LOGIN_INTEGRATION_CHECKLIST.md) - Mobile integration

---

## ✅ Summary

| What | Correct |
|------|---------|
| Send OTP endpoint | `/api/users/login/send-otp` ✅ |
| Request field | `identifier` (not `phone_number`) ✅ |
| Identifier value | Email or 10-digit phone ✅ |
| Verify OTP endpoint | `/api/users/login/verify-otp` ✅ |
| OTP code format | 6 digits (string) ✅ |
| Base URL for auth | `app.mediqzy.com/api` ✅ |
| Base URL for API | `api.mediqzy.com` ✅ |

---

**Last Updated:** February 8, 2026  
**Status:** ✅ Correct API Format Reference  
**For Issues:** Run `bash otp-diagnostic.sh` or check OTP_LOGIN_TROUBLESHOOTING.md
