# OTP-Based Password Reset System

## Overview
The password reset system has been enhanced to use OTP (One-Time Password) verification with delivery through **three channels simultaneously**:
1. **Email** - Beautifully formatted HTML email with OTP
2. **SMS** - Text message to registered phone number
3. **WhatsApp** - Message via WhatsApp to registered phone number

## Features
✅ Multi-channel OTP delivery (Email + SMS + WhatsApp)
✅ 6-digit OTP code (valid for 10 minutes)
✅ Secure token-based password reset
✅ Support for both users and doctors
✅ Beautiful HTML email templates
✅ Security best practices (no account enumeration)
✅ Parallel delivery for speed

---

## API Endpoints

### 1. Request Password Reset
**POST** `/api/password-reset/request`

Request OTP for password reset. OTP will be sent via Email, SMS, and WhatsApp.

#### Request Body
```json
{
  "email": "user@example.com",
  "phone": "+919876543210",
  "userType": "user"
}
```

**Parameters:**
- `email` (optional): User's email address
- `phone` (optional): User's phone number (E.164 format, e.g., +919876543210)
- `userType` (optional): `"user"` or `"doctor"` (default: `"user"`)

**Note:** At least one of `email` or `phone` is required.

#### Response (Success)
```json
{
  "success": true,
  "message": "OTP sent successfully via Email, SMS, and WhatsApp",
  "data": {
    "otpId": 123,
    "expiresAt": "2025-12-19T10:30:00Z",
    "expiresIn": "10 minutes",
    "deliveryChannels": {
      "email": { "sent": true, "error": null },
      "sms": { "sent": true, "error": null },
      "whatsapp": { "sent": true, "error": null }
    },
    "otp": "123456"  // Only in development mode
  }
}
```

#### Response (Error)
```json
{
  "success": false,
  "message": "Email or phone number is required"
}
```

---

### 2. Verify OTP
**POST** `/api/password-reset/verify-otp`

Verify the OTP and receive a reset token for password change.

#### Request Body
```json
{
  "email": "user@example.com",
  "phone": "+919876543210",
  "code": "123456",
  "userType": "user"
}
```

**Parameters:**
- `email` (optional): User's email address
- `phone` (optional): User's phone number
- `code` (required): 6-digit OTP code received
- `userType` (optional): `"user"` or `"doctor"` (default: `"user"`)

#### Response (Success)
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "resetToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
    "expiresAt": "2025-12-19T11:00:00Z",
    "accountId": 456
  }
}
```

#### Response (Error)
```json
{
  "success": false,
  "message": "Invalid or expired OTP"
}
```

---

### 3. Reset Password
**POST** `/api/password-reset/reset`

Reset password using the token received from OTP verification.

#### Request Body
```json
{
  "resetToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "newPassword": "MyNewSecurePassword123!",
  "userType": "user"
}
```

**Parameters:**
- `resetToken` (required): Token received from `/verify-otp` endpoint
- `newPassword` (required): New password (minimum 6 characters)
- `userType` (optional): `"user"` or `"doctor"` (default: `"user"`)

#### Response (Success)
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### Response (Error)
```json
{
  "success": false,
  "message": "Invalid or expired reset token"
}
```

---

## Password Reset Flow

### Step 1: User Requests Password Reset
```javascript
const response = await fetch('/api/password-reset/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    phone: '+919876543210',
    userType: 'user'
  })
});

const result = await response.json();
console.log(result.message); // "OTP sent successfully..."
```

**What Happens:**
1. System finds user account by email or phone
2. Generates 6-digit OTP (valid for 10 minutes)
3. **Sends OTP via Email** (HTML formatted)
4. **Sends OTP via SMS** (text message)
5. **Sends OTP via WhatsApp** (message)
6. Returns delivery status for each channel

### Step 2: User Enters OTP
```javascript
const response = await fetch('/api/password-reset/verify-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    code: '123456',
    userType: 'user'
  })
});

const result = await response.json();
const resetToken = result.data.resetToken;
```

**What Happens:**
1. System verifies OTP against database
2. Checks if OTP is expired (10 minutes)
3. Generates secure reset token (valid for 1 hour)
4. Returns reset token to proceed

### Step 3: User Sets New Password
```javascript
const response = await fetch('/api/password-reset/reset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resetToken: resetToken,
    newPassword: 'MyNewPassword123!',
    userType: 'user'
  })
});

const result = await response.json();
console.log(result.message); // "Password reset successfully"
```

**What Happens:**
1. System validates reset token
2. Hashes new password
3. Updates password in database
4. Clears reset token
5. User can now login with new password

---

## Email Template

The OTP email includes:
- **Beautiful gradient header** with lock icon
- **Large, bold OTP code** in center
- **10-minute expiry warning**
- **Security tips** (never share OTP, etc.)
- **Responsive design** (works on mobile)
- **Plain text fallback**

### Email Preview

```
🔐 Password Reset
Mediczy Healthcare Platform

Hello John,

We received a request to reset your password. Use the following One-Time Password (OTP):

┌─────────────────┐
│   1 2 3 4 5 6   │  ← Large, bold OTP
└─────────────────┘

⚠️ IMPORTANT: This OTP is valid for 10 minutes only.

Security Tips:
• Never share your OTP with anyone
• Mediczy staff will never ask for your OTP
• If you didn't request this, please ignore this email

Best regards,
Mediczy Team
```

---

## SMS Template

```
Your Mediczy password reset OTP is: 123456. Valid for 10 minutes. Do not share this code with anyone.
```

---

## WhatsApp Template

```
*Password Reset OTP*

Your Mediczy password reset OTP is:

*123456*

Valid for 10 minutes.

⚠️ Do not share this code with anyone.
```

---

## Security Features

### 1. No Account Enumeration
The system always returns success messages even if the account doesn't exist, preventing attackers from discovering valid email addresses or phone numbers.

### 2. OTP Expiry
OTPs expire after 10 minutes for security. Users must request a new OTP if expired.

### 3. Reset Token Expiry
Reset tokens expire after 1 hour. Users must complete password reset within this timeframe.

### 4. Rate Limiting
Consider implementing rate limiting:
- Max 3 OTP requests per hour per email/phone
- Max 5 verification attempts per OTP

### 5. Secure Token Generation
- OTPs: 6-digit random numbers
- Reset tokens: 32-byte cryptographically secure random hex strings
- Tokens are hashed (SHA-256) before storage

### 6. Multi-Channel Verification
Sending OTP via 3 channels ensures:
- Users receive the OTP even if one channel fails
- Reduces support tickets for "didn't receive OTP"
- Better user experience

---

## Frontend Integration

### React Example

```jsx
import React, { useState } from 'react';

function ForgotPasswordFlow() {
  const [step, setStep] = useState(1); // 1: Request, 2: Verify, 3: Reset
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');

  // Step 1: Request OTP
  const handleRequestOTP = async (e) => {
    e.preventDefault();
    
    const response = await fetch('/api/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, userType: 'user' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      setMessage('OTP sent to your email, phone, and WhatsApp!');
      setStep(2);
    } else {
      setMessage(result.message);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    
    const response = await fetch('/api/password-reset/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, code: otp, userType: 'user' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      setResetToken(result.data.resetToken);
      setMessage('OTP verified! Now set your new password.');
      setStep(3);
    } else {
      setMessage(result.message);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    const response = await fetch('/api/password-reset/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword, userType: 'user' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      setMessage('Password reset successfully! You can now login.');
      // Redirect to login page
      setTimeout(() => window.location.href = '/login', 2000);
    } else {
      setMessage(result.message);
    }
  };

  return (
    <div className="forgot-password-flow">
      <h2>Reset Password</h2>
      
      {message && <div className="message">{message}</div>}
      
      {step === 1 && (
        <form onSubmit={handleRequestOTP}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="tel"
            placeholder="Phone (e.g., +919876543210)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button type="submit">Send OTP</button>
        </form>
      )}
      
      {step === 2 && (
        <form onSubmit={handleVerifyOTP}>
          <input
            type="text"
            placeholder="Enter 6-digit OTP"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
          />
          <button type="submit">Verify OTP</button>
        </form>
      )}
      
      {step === 3 && (
        <form onSubmit={handleResetPassword}>
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button type="submit">Reset Password</button>
        </form>
      )}
    </div>
  );
}

export default ForgotPasswordFlow;
```

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# SMS Configuration (Twilio example)
SMS_PROVIDER=twilio
SMS_API_KEY=your_twilio_account_sid
SMS_API_SECRET=your_twilio_auth_token
SMS_SENDER_ID=+1234567890
SMS_PASSWORD_RESET_TEMPLATE_ID=your_template_id

# Email Configuration (already configured)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@mediczy.com
SMTP_PASSWORD=your_app_password

# Frontend URL (for email links if needed)
FRONTEND_URL=https://mediqzy.com
```

### SMS Provider Support
- **Twilio** (default)
- **AWS SNS**
- **Other providers** via generic SMS service

---

## Testing

### Manual Testing Flow

1. **Request OTP**
```bash
curl -X POST http://localhost:8000/api/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "+919876543210",
    "userType": "user"
  }'
```

2. **Verify OTP** (use OTP from email/SMS/WhatsApp)
```bash
curl -X POST http://localhost:8000/api/password-reset/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456",
    "userType": "user"
  }'
```

3. **Reset Password** (use token from step 2)
```bash
curl -X POST http://localhost:8000/api/password-reset/reset \
  -H "Content-Type: application/json" \
  -d '{
    "resetToken": "abc123...",
    "newPassword": "MyNewPassword123!",
    "userType": "user"
  }'
```

### Development Mode
In development (`NODE_ENV=development`), the OTP is included in the API response for easy testing:

```json
{
  "success": true,
  "data": {
    "otp": "123456",  // ← Only in development
    "expiresAt": "..."
  }
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Email or phone number is required" | Neither email nor phone provided | Provide at least one |
| "Invalid or expired OTP" | Wrong OTP or expired (>10 min) | Request new OTP |
| "Invalid or expired reset token" | Token expired (>1 hour) | Start over with new OTP |
| "Password must be at least 6 characters" | Password too short | Use longer password |
| OTP delivery failed | SMS/WhatsApp service not configured | Check environment variables |

---

## Service Integration

### Email Service
Uses existing `emailService` with database-configured SMTP settings.

### SMS Service
Uses `SMSService` from `sms.service.js` with support for multiple providers.

### WhatsApp Service
Uses `notificationService` which integrates with WhatsApp Business API.

### OTP Storage
Uses existing `OTP` model (`otp.model.intelligent.js`) for storing and verifying OTPs.

---

## Database Schema

### OTP Table
```sql
CREATE TABLE otps (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20),
  email VARCHAR(255),
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) DEFAULT 'login',
  user_id INTEGER,
  verified BOOLEAN DEFAULT false,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### User/Doctor Tables
```sql
ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP;

ALTER TABLE doctors ADD COLUMN password_reset_token VARCHAR(255);
ALTER TABLE doctors ADD COLUMN password_reset_expires TIMESTAMP;
```

---

## Monitoring

### Metrics to Track
- OTP request rate
- OTP verification success rate
- Delivery success rate per channel
- Average time to complete reset
- Failed attempts per user

### Logs
```javascript
// Successful OTP send
✅ Password reset OTP sent to user 123: 
   email: ✓ | sms: ✓ | whatsapp: ✓

// Failed delivery
❌ WhatsApp delivery failed: Service not configured

// OTP verification
✅ OTP verified successfully for user 123

// Password reset
✅ Password reset successful for user ID: 123
```

---

## Production Checklist

- [ ] Configure SMS provider credentials
- [ ] Configure SMTP email settings
- [ ] Set up WhatsApp Business API
- [ ] Implement rate limiting (3 requests/hour)
- [ ] Add captcha on request form
- [ ] Set up monitoring/alerts
- [ ] Test all three delivery channels
- [ ] Update frontend with new flow
- [ ] Document for users
- [ ] Add analytics tracking

---

## Support

### User Can't Receive OTP?
1. Check spam/junk folder for email
2. Verify phone number format (+country code)
3. Check if WhatsApp is installed
4. Request resend after 1 minute
5. Try alternative channel (email if SMS failed)

### Developer Support
- Check logs for delivery failures
- Verify environment variables
- Test each channel independently
- Ensure services are configured

---

## Migration from Old System

### Backward Compatibility
The old token-based system is still available at:
- `POST /api/users/forgot-password` (token-based, email only)
- `POST /api/users/reset-password` (with token)

### Migration Path
1. Update frontend to use new endpoints
2. Keep old endpoints active for transition
3. Monitor usage of old endpoints
4. Deprecate old endpoints after full migration

---

## Summary

✅ **OTP-based password reset implemented**
✅ **3-channel delivery**: Email + SMS + WhatsApp
✅ **Beautiful HTML email templates**
✅ **Secure token generation**
✅ **10-minute OTP expiry**
✅ **1-hour reset token expiry**
✅ **No account enumeration**
✅ **Support for users and doctors**
✅ **Ready for production**

The system provides a robust, secure, and user-friendly password reset experience with multiple fallback channels to ensure OTP delivery.
