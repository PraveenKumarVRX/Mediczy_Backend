# 🔧 OTP Login Troubleshooting Guide - user@mediczy.com

**Issue:** OTP login not working (but ID & password login works)  
**Date:** February 8, 2026  
**User:** user@mediczy.com  
**Status:** Investigating

---

## 📋 Quick Diagnosis

### Backend Requirements for OTP Login

OTP login requires **TWO** conditions to work:

```
✅ Condition 1: User must exist in the database
   └─ Name: user@mediczy.com
   └─ Email: user@mediczy.com  
   └─ Status: active (not blocked/inactive)

✅ Condition 2: OTP delivery service must be configured
   └─ n8n webhook (preferred)
   └─ OR direct email/WhatsApp service
   └─ OR OTP_DEBUG_RESPONSE=true (for testing)
```

**Problem:** If ID & password login works but OTP doesn't, likely the issue is **Condition 2** (OTP delivery not configured).

---

## 🐛 Step 1: Verify User Exists

### Check Database

```bash
# Login to PostgreSQL
psql -h localhost -U mediczy -d mediczy

# Query users table
SELECT id, email, "phoneNumber", "firstName", "lastName", status 
FROM "Users" 
WHERE email = 'user@mediczy.com';

# Expected output:
# id |      email       | phoneNumber | firstName | lastName | status
# ---|-----------------|-------------|-----------|----------|--------
#  1 | user@mediczy.com | +91xxxxxxxx |   User    |   Name   | active
```

**If no results:**
- ❌ User doesn't exist → Create user first
- ✅ User exists → Continue to Step 2

### Create User if Missing

```bash
curl -X POST https://app.mediqzy.com/api/patient/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mediczy.com",
    "password": "SecurePassword123",
    "firstName": "Test",
    "lastName": "User",
    "phoneNumber": "+919876543210"
  }'
```

---

## 🐛 Step 2: Verify OTP Delivery Configuration

### Check Backend Environment Variables

```bash
# SSH into server
ssh admin@your-server.com

# Check if OTP services are configured
docker exec mediczy-backend env | grep -i otp
docker exec mediczy-backend env | grep -i n8n

# Expected output (if configured):
USE_N8N_OTP=true
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/otp
OTP_DEBUG_RESPONSE=true (for development)
```

**If not configured:**
- ❌ No OTP service → Configure n8n or direct delivery (see Step 3)
- ✅ Configured → Continue to Step 4

### Check OTP Logs

```bash
# View backend logs
docker logs -f mediczy-backend | grep -i otp

# Expected log output when sending OTP:
# 📤 Attempting login OTP delivery via n8n...
# ✅ Login OTP sent via n8n (email)
# ✅ User user@mediczy.com logged in via OTP

# Problem log output:
# ⚠️  n8n error, using fallback: ...
# ❌ Failed to send OTP
```

---

## 🔧 Step 3: Enable OTP Delivery (Choose ONE)

### Option A: Enable n8n Webhook (Recommended)

n8n is a workflow automation tool that handles OTP delivery.

**Step 1: Setup n8n OTP Workflow**

```bash
# 1. Login to n8n instance
# 2. Create new workflow
# 3. Add webhook trigger: /webhook/otp
# 4. Add email node (for email OTP)
# 5. Add WhatsApp/SMS node (for phone OTP)
# 6. Deploy workflow
# 7. Copy webhook URL
```

**Step 2: Configure Backend**

```bash
# Edit docker-compose.yml or .env
docker exec mediczy-backend bash

# In container, edit .env:
USE_N8N_OTP=true
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/otp
N8N_API_KEY=your-n8n-api-key (if required)
N8N_TIMEOUT=5000

# Restart backend
exit
docker restart mediczy-backend

# Test
docker logs mediczy-backend | grep "n8n"
```

### Option B: Enable Direct Email (Fast Setup)

For testing without n8n, enable debug response:

```bash
# Edit environment
docker exec -it mediczy-backend bash -c 'echo "OTP_DEBUG_RESPONSE=true" >> /app/.env'

# Restart
docker restart mediczy-backend

# Now OTP will be returned in response (DEVELOPMENT ONLY):
# {
#   "otp": "123456"  ← OTP will appear here
# }
```

### Option C: Setup Email Service

Configure direct email delivery for OTP:

```bash
docker exec mediczy-backend bash

# In container, edit .env:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@mediczy.com
EMAIL_SERVICE_ENABLED=true

# Restart
exit
docker restart mediczy-backend
```

### Option D: Setup SMS/WhatsApp Service

Configure Twilio for SMS/WhatsApp OTP:

```bash
docker exec mediczy-backend bash

# In container, edit .env:
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
WHATSAPP_ENABLED=true

# Restart
exit
docker restart mediczy-backend
```

---

## 🐛 Step 4: Test OTP Send Endpoint

### Test Request

```bash
curl -X POST https://app.mediqzy.com/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@mediczy.com"
  }'
```

**Expected Success Response:**
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
    "otp": "123456"  ← Only if OTP_DEBUG_RESPONSE=true
  }
}
```

### Possible Error Responses

**Error 1: User not found**
```json
{
  "success": true,
  "message": "If an account exists, an OTP has been sent."
  // Generic response - user doesn't exist
}
```
**Fix:** Create the user (Step 1)

**Error 2: Invalid identifier format**
```json
{
  "success": false,
  "message": "Please provide a valid email address or 10-digit phone number"
}
```
**Fix:** Use correct email (user@mediczy.com) or 10-digit phone (9876543210)

**Error 3: OTP send failed**
```json
{
  "success": false,
  "message": "Failed to send OTP",
  "error": "n8n webhook error: ..."
}
```
**Fix:** Configure OTP delivery service (Step 3)

**Error 4: Invalid request**
```json
{
  "success": false,
  "errors": [{
    "param": "identifier",
    "msg": "Email or phone number is required"
  }]
}
```
**Fix:** Include `identifier` field in request body

---

## 🐛 Step 5: Test OTP Verify Endpoint

### Prerequisites
- OTP has been sent (Step 4 succeeded)
- Note the OTP from response (if OTP_DEBUG_RESPONSE=true)
- Or check email for OTP

### Test Request

```bash
curl -X POST https://app.mediqzy.com/api/users/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@mediczy.com",
    "code": "123456"
  }'
```

**Expected Success Response:**
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

### Possible Error Responses

**Error 1: Invalid OTP**
```json
{
  "success": false,
  "message": "Invalid or expired OTP"
}
```
**Fix:** 
- Ensure OTP matches exactly (6 digits)
- Check OTP hasn't expired (5 minutes)
- Check email for latest OTP

**Error 2: User not found**
```json
{
  "success": false,
  "message": "Invalid or expired OTP"
}
```
**Fix:** Create user (Step 1)

**Error 3: Missing fields**
```json
{
  "success": false,
  "errors": [{
    "param": "code",
    "msg": "OTP must be 6 digits"
  }]
}
```
**Fix:** Pass both `identifier` and `code` (6 digits)

---

## 🔍 Full Debugging Checklist

- [ ] **Step 1:** User exists in database
  - Command: `SELECT * FROM "Users" WHERE email = 'user@mediczy.com'`
  - Status field should be: `active`

- [ ] **Step 2a:** Check if n8n is configured
  - Command: `docker logs mediczy-backend | grep n8n`
  - Should see logs about n8n webhook

- [ ] **Step 2b:** OR check if OTP debug is enabled
  - Command: `docker exec mediczy-backend cat /app/.env | grep OTP_DEBUG`
  - Should show: `OTP_DEBUG_RESPONSE=true`

- [ ] **Step 3:** OTP send endpoint responds
  - Command: `curl` to `/api/users/login/send-otp`
  - Should return HTTP 200 with success: true

- [ ] **Step 4:** OTP received (check email or response)
  - If OTP_DEBUG: Check response body for `otp` field
  - If email: Check email inbox

- [ ] **Step 5:** OTP verify endpoint works
  - Command: `curl` to `/api/users/login/verify-otp` with OTP code
  - Should return JWT token

---

## 🚀 Quick Fix (Fastest Solution)

For immediate testing, enable OTP debug response:

```bash
# SSH into server
ssh admin@your-server.com

# Enable OTP debug response
docker exec mediczy-backend bash -c 'echo "OTP_DEBUG_RESPONSE=true" >> /app/.env'

# Restart
docker restart mediczy-backend

# Now test:
curl -X POST https://app.mediqzy.com/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@mediczy.com"}'

# Response will include OTP for testing:
# {
#   "data": {
#     "otp": "123456"
#   }
# }
```

Then test verify with the returned OTP.

---

## 📊 API Endpoints Reference

### Send OTP
- **Endpoint:** `POST /api/users/login/send-otp`
- **Base URL Auth:** `https://app.mediqzy.com/api`
- **Body:** `{"identifier": "user@mediczy.com"}`
- **Response:** OTP ID + expiry + delivery method

### Verify OTP
- **Endpoint:** `POST /api/users/login/verify-otp`
- **Base URL Auth:** `https://app.mediqzy.com/api`
- **Body:** `{"identifier": "user@mediczy.com", "code": "123456"}`
- **Response:** JWT token + user data

---

## 🔍 Additional Resources

### Log Locations
```bash
# Backend logs
docker logs -f mediczy-backend

# OTP-specific logs
docker logs mediczy-backend | grep -i otp
docker logs mediczy-backend | grep -i "send.*otp"

# Module logs
docker logs mediczy-backend | grep "OTP\|n8n\|email\|WhatsApp"
```

### Database Queries
```bash
# Check OTP records
psql -h localhost -U mediczy -d mediczy -c \
  "SELECT * FROM otps WHERE email = 'user@mediczy.com' ORDER BY created_at DESC LIMIT 5;"

# Check Redis cache (if available)
redis-cli
> KEYS otp:login_otp:user@mediczy.com*
> GET key_name
```

### Environment Check
```bash
# All OTP-related environment variables
docker exec mediczy-backend env | grep -E "OTP|N8N|SMTP|TWILIO|EMAIL"

# Specific variables
docker exec mediczy-backend bash -c 'echo "OTP_DEBUG_RESPONSE: $OTP_DEBUG_RESPONSE"'
docker exec mediczy-backend bash -c 'echo "USE_N8N_OTP: $USE_N8N_OTP"'
```

---

## ✅ Success Indicators

When OTP login is working:

1. ✅ Send OTP returns success with otpId
2. ✅ OTP received in email/phone (or returned if debug=true)
3. ✅ Verify OTP returns JWT token
4. ✅ Can use token for authenticated requests
5. ✅ User session established

---

## 🆘 Still Not Working?

If you've completed all steps and OTP still doesn't work:

1. **Collect Debug Information:**
   ```bash
   # Get recent logs
   docker logs mediczy-backend > otp-debug.log
   
   # Get environment
   docker exec mediczy-backend env | grep -i otp > env-otp.log
   
   # Test database
   psql -h localhost -U mediczy -d mediczy -c \
     "SELECT * FROM \"Users\" WHERE email='user@mediczy.com';" > user-check.log
   ```

2. **Share these with backend team:**
   - otp-debug.log
   - env-otp.log  
   - user-check.log
   - Request body being sent
   - API response (full JSON)

3. **Check if ID password is really working:**
   - They might be using different user account
   - user@mediczy.com vs different email

---

## 📝 Configuration Summary

To make OTP work, configure ONE of:

| Method | Ease | Best For | Config |
|--------|------|----------|--------|
| **Debug Mode** | ⭐⭐ Easiest | Testing only | `OTP_DEBUG_RESPONSE=true` |
| **n8n** | ⭐⭐⭐ Medium | Production | `N8N_WEBHOOK_URL=...` |
| **Email** | ⭐⭐ Easy | Testing | `SMTP_HOST=...` |
| **Twilio** | ⭐⭐⭐ Medium | SMS/WhatsApp | `TWILIO_ACCOUNT_SID=...` |

---

**Status:** 🟡 Awaiting Server Configuration  
**Next Step:** Choose OTP delivery method and configure environment  
**Timeline:** ~15-30 minutes to configure

Need help? Check the OTP sending service logs! 📋
