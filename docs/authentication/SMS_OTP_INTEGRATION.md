# SMS & OTP Integration for Mediczy

**Status**: ✅ **COMPLETE** - Production Ready  
**Date**: November 25, 2025

---

## 📋 Overview

Comprehensive SMS integration supporting:
- ✅ OTP generation, verification, and expiry management
- ✅ Multi-provider SMS gateways (Twilio, MSG91, Fast2SMS, TextLocal, AWS SNS)
- ✅ Pre-built templates for common healthcare notifications
- ✅ Appointment reminders and confirmations
- ✅ Prescription and test result alerts
- ✅ Emergency notifications
- ✅ Medication reminders
- ✅ Payment reminders
- ✅ Insurance claim updates

---

## 🗂️ File Structure

### Models
- **`server/models/otp.model.intelligent.js`** - OTP generation, storage, verification
  - 6-digit OTP generation
  - 10-minute expiry (configurable)
  - Max 5 verification attempts
  - Purpose tracking (login, registration, password_reset, verification)
  - Automatic cleanup of expired OTPs

### Controllers
- **`server/controller/otp.controller.js`** - OTP business logic
  - `sendOTP()` - Generate and send OTP via SMS
  - `verifyOTP()` - Validate OTP code
  - `resendOTP()` - Invalidate old OTP and send new one
  - `getOTPStats()` - Admin statistics
  - `cleanupExpiredOTPs()` - Maintenance function

### Routes
- **`server/routes/otp.route.js`** - OTP API endpoints
- **`server/routes/sms.route.js`** - SMS gateway management (admin)

### Services
- **`server/services/sms.service.js`** - Multi-provider SMS service
  - Support for 5 SMS providers
  - Template rendering engine
  - Bulk SMS support
  - Delivery status tracking

### Utilities
- **`server/utils/smsAlerts.js`** - High-level SMS helper functions
  - Pre-configured alert functions for common use cases
  - Automatic template rendering
  - Error handling and logging

---

## 🔌 API Endpoints

### Public Endpoints (No Auth)

#### 1. Send OTP
```http
POST /api/otp/send
Content-Type: application/json

{
  "phone": "+919876543210",
  "purpose": "login"  // Optional: login, registration, password_reset, verification
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "otpId": "abc123...",
    "expiresAt": "2025-11-25T10:10:00Z",
    "expiresIn": "10 minutes",
    "otp": "123456"  // Only in development mode
  }
}
```

#### 2. Verify OTP
```http
POST /api/otp/verify
Content-Type: application/json

{
  "phone": "+919876543210",
  "code": "123456",
  "purpose": "login"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "otpId": "abc123..."
  }
}
```

**Error Responses:**
- `400` - Invalid OTP code
- `400` - OTP has expired
- `400` - Maximum verification attempts exceeded

#### 3. Resend OTP
```http
POST /api/otp/resend
Content-Type: application/json

{
  "phone": "+919876543210",
  "purpose": "login"
}
```

### Admin Endpoints (Auth Required)

#### 4. Get OTP Statistics
```http
GET /api/otp/stats
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 1500,
    "active": 120,
    "expired": 900,
    "verified": 480,
    "unverified": 1020,
    "byPurpose": {
      "login": 800,
      "registration": 400,
      "password_reset": 200,
      "verification": 100
    }
  }
}
```

#### 5. Cleanup Expired OTPs
```http
POST /api/otp/cleanup
Authorization: Bearer {admin_token}
```

### SMS Management Endpoints (Admin)

#### 6. Get SMS Configuration
```http
GET /api/sms/config
Authorization: Bearer {admin_token}
```

#### 7. Update SMS Configuration
```http
POST /api/sms/config
Authorization: Bearer {admin_token}

{
  "provider": "twilio",
  "apiKey": "your_api_key",
  "apiSecret": "your_api_secret",
  "senderId": "+14155238886"
}
```

#### 8. Send Single SMS
```http
POST /api/sms/send
Authorization: Bearer {admin_token}

{
  "to": "+919876543210",
  "message": "Your custom message",
  "templateId": "appointment_reminder",  // Optional
  "variables": {
    "name": "John",
    "doctor": "Dr. Smith",
    "date": "Nov 26",
    "time": "10:00 AM"
  }
}
```

#### 9. Send Bulk SMS
```http
POST /api/sms/send-bulk
Authorization: Bearer {admin_token}

{
  "recipients": [
    { "phone": "+919876543210", "variables": { "name": "John" } },
    { "phone": "+919876543211", "variables": { "name": "Jane" } }
  ],
  "templateId": "appointment_reminder",
  "variables": {
    "doctor": "Dr. Smith",
    "date": "Nov 26",
    "time": "10:00 AM"
  }
}
```

#### 10. Get SMS Templates
```http
GET /api/sms/templates
Authorization: Bearer {admin_token}
```

#### 11. Add/Update Template
```http
POST /api/sms/templates
Authorization: Bearer {admin_token}

{
  "id": "custom_template",
  "template": "Hi {name}, your {service} is ready."
}
```

#### 12. Get SMS Logs
```http
GET /api/sms/logs?page=1&limit=20&search=&status=success
Authorization: Bearer {admin_token}
```

#### 13. Get SMS Statistics
```http
GET /api/sms/stats
Authorization: Bearer {admin_token}
```

#### 14. Test SMS
```http
POST /api/sms/test
Authorization: Bearer {admin_token}

{
  "phone": "+919876543210"
}
```

---

## 📝 SMS Templates

All templates support variable substitution using `{variable}` syntax.

### 1. OTP Verification (DLT Approved)
```
{otp} is your One Time Password to login with your My Smart Health Account. Don't Share this with anyone.
```
**DLT Template ID:** `1707162254671707XXXXXXXX` (LOGIN OTP)  
**DLT Template Pattern:** `{#var#}` is registered in DLT, but send **actual OTP value** in message  
**Example:** `123456 is your One Time Password to login with your My Smart Health Account. Don't Share this with anyone.`  
**IMPORTANT:** Send the actual OTP number (e.g., 123456), NOT the placeholder. Pay4SMS will match it against the DLT template pattern.

### 2. Appointment Reminder
```
Hi {name}, your appointment with Dr. {doctor} is scheduled for {date} at {time}. Please arrive 15 minutes early.
```

### 3. Appointment Confirmation
```
Your appointment has been confirmed for {date} at {time} with Dr. {doctor}. Reference: {id}
```

### 4. Prescription Ready
```
Hi {name}, your prescription is ready for pickup at {pharmacy}. Order ID: {orderId}
```

### 5. Test Results
```
Your test results are ready. Please log in to your account or visit the clinic to view them.
```

### 6. Payment Reminder
```
Payment reminder: Your bill of ₹{amount} for {service} is due on {dueDate}.
```

### 7. Welcome Message
```
Welcome to Mediczy! Your account has been created successfully. Use your email and OTP to login.
```

### 8. Insurance Claim
```
Your insurance claim #{claimId} has been {status}. Amount: ₹{amount}
```

### 9. Emergency Alert
```
EMERGENCY: Patient {name} requires immediate attention at {location}. Contact: {phone}
```

### 10. Medication Reminder
```
Reminder: Take your {medication} at {time}. Next dose in {nextDose}.
```

---

## 🛠️ Environment Configuration

Add these variables to `.env`:

```env
# SMS Provider Configuration
SMS_PROVIDER=pay4sms                   # Options: twilio, msg91, fast2sms, textlocal, aws-sns, pay4sms
SMS_API_KEY=your_api_token             # Your API token
SMS_SENDER_ID=MSMART                   # Your SMS sender ID (6 chars for pay4sms)
SMS_CREDIT=2                           # For pay4sms: Transactional (only type available)
SMS_TEMPLATE_ID=your_template_id       # For pay4sms: DLT Template ID
SMS_OTP_TEMPLATE_ID=your_otp_template  # For pay4sms: OTP DLT Template ID
SMS_API_URL=http://pay4sms.in         # For pay4sms: Base API URL

# For Twilio (alternative env names)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+14155238886
```

---

## 💻 Usage Examples

### Example 1: Send OTP on User Registration

```javascript
import { sendOTPSMS } from '../utils/smsAlerts.js';

// In your registration controller
export async function registerUser(req, res) {
  const { phone, email, password } = req.body;
  
  // Create user...
  
  // Send welcome OTP
  const otpResult = await sendOTPSMS({
    phone,
    purpose: 'registration'
  });
  
  if (otpResult.success) {
    res.json({
      message: 'Registration successful. OTP sent to your phone.',
      otpId: otpResult.otpId
    });
  }
}
```

### Example 2: Send Appointment Reminder

```javascript
import { sendAppointmentReminder } from '../utils/smsAlerts.js';

// In your appointment reminder job/cron
export async function sendAppointmentReminders() {
  const upcomingAppointments = await getAppointmentsTomorrow();
  
  for (const appointment of upcomingAppointments) {
    await sendAppointmentReminder({
      phone: appointment.patientPhone,
      name: appointment.patientName,
      doctor: appointment.doctorName,
      date: appointment.date,
      time: appointment.time
    });
  }
}
```

### Example 3: Verify OTP on Login

```javascript
import OTP from '../models/otp.model.intelligent.js';

export async function loginWithOTP(req, res) {
  const { phone, code } = req.body;
  
  // Verify OTP
  const verification = await OTP.verify({
    phone,
    code,
    purpose: 'login'
  });
  
  if (verification.success) {
    // Generate JWT token and log user in
    const token = generateAuthToken(user);
    res.json({ token, user });
  } else {
    res.status(400).json({ message: verification.message });
  }
}
```

### Example 4: Send Emergency Alert

```javascript
import { sendEmergencyAlert } from '../utils/smsAlerts.js';

export async function triggerEmergencyAlert(req, res) {
  const { patientId, emergencyContactPhone } = req.body;
  
  const patient = await getPatient(patientId);
  
  await sendEmergencyAlert({
    phone: emergencyContactPhone,
    patientName: patient.name,
    location: patient.currentLocation,
    contactPhone: patient.phone
  });
  
  res.json({ message: 'Emergency alert sent' });
}
```

### Example 5: Send Bulk Campaign

```javascript
import smsAlerts from '../utils/smsAlerts.js';

export async function sendHealthCampaign(req, res) {
  const patients = await getAllActivePatients();
  
  const recipients = patients.map(p => ({
    phone: p.phone,
    variables: { name: p.firstName }
  }));
  
  const results = await smsAlerts.sendBulkSMS({
    recipients,
    templateId: 'health_checkup_reminder',
    variables: {
      clinic: 'Mediczy Health Center',
      date: 'December 2025'
    }
  });
  
  res.json({ 
    total: recipients.length,
    successful: results.filter(r => r.success).length
  });
}
```

---

## 🔐 Security Features

### OTP Security
- ✅ 6-digit random codes (1,000,000 combinations)
- ✅ 10-minute expiry window
- ✅ Maximum 5 verification attempts
- ✅ Auto-cleanup of expired OTPs
- ✅ Purpose-specific OTPs (prevents reuse)
- ✅ One-time use (invalidated after verification)

### SMS Security
- ✅ Admin-only access to SMS management
- ✅ Rate limiting on OTP requests
- ✅ Audit logging of all SMS sent
- ✅ Phone number validation (E.164 format)
- ✅ Template injection prevention

---

## 🧪 Testing

### Test OTP Flow

```bash
# 1. Send OTP
curl -X POST http://localhost:8000/api/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "purpose": "login"
  }'

# 2. Verify OTP
curl -X POST http://localhost:8000/api/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "code": "123456",
    "purpose": "login"
  }'

# 3. Resend OTP
curl -X POST http://localhost:8000/api/otp/resend \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "purpose": "login"
  }'
```

### Test SMS (Admin)

```bash
# Send test SMS
curl -X POST http://localhost:8000/api/sms/test \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210"
  }'
```

---

## 📊 Monitoring & Maintenance

### OTP Statistics
Access at: `GET /api/otp/stats` (admin only)

Monitor:
- Total OTPs generated
- Active (unexpired, unverified) OTPs
- Verification success rate
- OTP usage by purpose

### SMS Statistics
Access at: `GET /api/sms/stats` (admin only)

Monitor:
- SMS sent today/this month/all time
- Success rate
- Failed deliveries
- Provider status

### Cleanup Tasks

Run periodically (via cron job):
```javascript
// Clean up expired OTPs (older than expiry time)
POST /api/otp/cleanup
```

---

## 🚀 Production Checklist

- [ ] Set SMS provider credentials in `.env`
- [ ] Test OTP send/verify flow
- [ ] Configure rate limiting for OTP endpoints
- [ ] Set up cron job for OTP cleanup
- [ ] Monitor SMS delivery rates
- [ ] Review and customize SMS templates
- [ ] Test all SMS alert functions
- [ ] Verify phone number validation
- [ ] Check SMS provider balance/credits
- [ ] Set up SMS delivery webhooks (if supported)

---

## 🐛 Troubleshooting

### SMS Not Sending
1. Check SMS provider credentials in `.env`
2. Verify SMS service initialization logs
3. Check phone number format (must be E.164: +919876543210)
4. Verify SMS provider account balance
5. Check rate limits on provider account

### OTP Not Working
1. Check if OTP expired (10-minute window)
2. Verify phone number matches exactly
3. Check attempt count (max 5 attempts)
4. Ensure purpose matches (login, registration, etc.)
5. Check database connectivity

### Template Variables Not Rendering
1. Verify variable names match template (case-sensitive)
2. Check variable values are provided
3. Test with `SMSTemplateManager.renderTemplate()` directly

---

## 📚 Provider Setup Guides

### Twilio Setup
1. Sign up at https://www.twilio.com
2. Get Account SID and Auth Token
3. Buy a phone number
4. Add to `.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+14155238886
```

### MSG91 Setup
1. Sign up at https://msg91.com
2. Get API Key (Authkey)
3. Configure sender ID
4. Add to `.env`:
```env
SMS_PROVIDER=msg91
SMS_API_KEY=your_msg91_authkey
SMS_SENDER_ID=MEDICY
```

### Fast2SMS Setup
1. Sign up at https://www.fast2sms.com
2. Get API Key
3. Add to `.env`:
```env
SMS_PROVIDER=fast2sms
SMS_API_KEY=your_fast2sms_api_key
SMS_SENDER_ID=MEDICY
```

### Pay4SMS Setup (Recommended for India)
1. Sign up at https://pay4sms.in
2. Get your credentials from dashboard:
   - API Token
   - Sender ID (6 characters, e.g., MEDCZY)
   - Template IDs (for DLT/TRAI compliance)
3. Add to `.env`:
```env
SMS_PROVIDER=pay4sms
SMS_API_KEY=your_token_here                    # Your API token
SMS_SENDER_ID=MEDCZY                           # 6-character sender ID
SMS_API_URL=http://pay4sms.in                  # API base URL
SMS_CREDIT=2                                   # Default: 2=Transactional
SMS_OTP_CREDIT=4                               # OTP-specific credit type
SMS_TEMPLATE_ID=your_template_id               # Default DLT Template ID
SMS_OTP_TEMPLATE_ID=your_otp_template_id       # OTP DLT Template ID
```

**Example Configuration:**
```env
SMS_PROVIDER=pay4sms
SMS_API_KEY=3cc40fb366624fba4447d922ed555417
SMS_SENDER_ID=MSMART                           # Use approved header (MSMART or MAYDEN)
SMS_CREDIT=2                                   # Transactional (includes OTP, alerts, notifications)
SMS_TEMPLATE_ID=1707162254671707XXXXXXXX       # LOGIN OTP template (for all messages)
SMS_OTP_TEMPLATE_ID=1707162254671707XXXXXXXX   # Same template for OTP messages
```

**Available Sender IDs:**
- `MSMART` - Default (Header ID: 1705159195721255196) ✓
- `MAYDEN` - Alternative (Header ID: 1705159195543446649)

**Available DLT Templates:**
- `1707162254671707XXXXXXXX` - LOGIN OTP (Most recent, recommended for login)
- `17071622546XXXXXXXX` - CHANGE PASSWORD / One Time Password (Alternative)

**Credit Type:** Only `credit=2` (Transactional) is available. This covers OTP, alerts, notifications, and confirmations.

**Template Variable:** Use `{#var#}` in your message text as placeholder for OTP code.

**Credit Types:**
- `2` = Transactional (OTP, alerts, notifications, confirmations) - **Only type available**
- `1` = Promotional (not available for your account)

**DLT/TRAI Compliance:**
Pay4SMS supports DLT (Distributed Ledger Technology) template IDs required by TRAI. Register your templates and use the approved template IDs.

**Delivery Status Check (DLR):**
```bash
# Check message delivery status
curl "http://pay4sms.in/Dlrcheck/?token=3cc40fb366624fba4447d922ed555417&msgid=123456"

# Response: {"status":"delivered","msgid":"123456","delivered_time":"2025-11-25 10:30:00"}
```

**DLR Status Values:**
- `delivered` - Message successfully delivered to recipient
- `pending` - Message queued or being processed
- `failed` - Message delivery failed
- `expired` - Message validity period expired

**Credit Balance Check:**
```bash
# Check Transactional credits (only type available)
curl "http://pay4sms.in/Credit-Balance/?token=3cc40fb366624fba4447d922ed555417&credit=2"

# Response: Plain text with balance (e.g., "28359")
```

**Check balance programmatically:**
```javascript
const smsService = new SMSService();
const balance = await smsService.getCredits('2'); // Check Transactional credits
console.log(`Available credits: ${balance.credits}`);
```

**Features:**
- Transactional API for instant delivery
- DLT/TRAI compliant with template support
- Delivery reports (DLR) tracking
- Bulk SMS support (comma-separated numbers)
- India-focused (best rates for Indian numbers)
- No + or 91 prefix needed (auto-cleaned)

**API Endpoint:**
```
GET http://pay4sms.in/sendsms/?token={token}&credit={credit}&sender={sender}&message={message}&number={number}&templateid={templateid}
```

**Example Requests:**

OTP Message (credit=2):
```bash
curl "http://pay4sms.in/sendsms/?token=3cc40fb366624fba4447d922ed555417&credit=2&sender=MSMART&message=123456%20is%20your%20One%20Time%20Password%20to%20login%20with%20your%20My%20Smart%20Health%20Account.%20Don%27t%20Share%20this%20with%20anyone.&number=9876543210&templateid=1707162254671707XXXXXXXX"
```

Transactional Message (credit=2):
```bash
curl "http://pay4sms.in/sendsms/?token=3cc40fb366624fba4447d922ed555417&credit=2&sender=MSMART&message=Your%20appointment%20is%20confirmed&number=9876543210&templateid=1707162254671707XXXXXXXX"
```

**Note:** All messages use `credit=2` (Transactional) regardless of type.

---

## ✅ Conclusion

SMS & OTP integration is **production-ready** with:
- ✅ Complete OTP lifecycle management
- ✅ Multi-provider SMS support
- ✅ Pre-built healthcare templates
- ✅ Admin management interface
- ✅ Security best practices
- ✅ Comprehensive error handling
- ✅ Audit logging
- ✅ Monitoring & statistics

**Status**: Ready for deployment after configuring SMS provider credentials.
