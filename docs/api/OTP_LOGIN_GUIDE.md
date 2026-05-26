# OTP Login Flow - User Guide

**Date:** January 26, 2026  
**Status:** ✅ **OPERATIONAL**  
**Endpoint:** `/api/users/login/send-otp` and `/api/users/login/verify-otp`

---

## Overview

The OTP (One-Time Password) login flow allows users to log in without remembering passwords. Users receive a 6-digit code via Email, SMS, or WhatsApp, which they enter to authenticate.

---

## User Flow

### Step 1: Choose OTP Login
1. Navigate to **https://app.mediqzy.com** or `/auth/login`
2. Click the **"Use OTP"** button (top right of login form)
3. The form switches to OTP mode

### Step 2: Enter Identifier
1. Enter either:
   - **Email address**: `user@example.com`
   - **Phone number**: `9876543210` (10 digits, no country code)
2. Click **"Send OTP"**
3. System validates the identifier format
4. OTP is sent via:
   - **Email** (if email provided)
   - **WhatsApp** (if phone provided)

### Step 3: Enter OTP Code
1. Check your email/phone for the 6-digit code
2. Enter the code in the OTP input fields
3. Code auto-advances as you type
4. Click **"Verify & Login"**
5. Upon successful verification:
   - User is logged in
   - Redirected to dashboard
   - Session token stored

### Step 4: Alternative Actions
- **Didn't receive code?** Click "Resend OTP"
- **Wrong email/phone?** Click "← Change email/phone"
- **Use password instead?** Click "Use Password"

---

## Technical Implementation

### Frontend Component Structure

```
Login.tsx (Main Component)
├── OTP Mode Toggle (useOtpLogin state)
├── Step 1: Enter Identifier
│   ├── Input field (email or phone)
│   ├── Send OTP button
│   └── Validation feedback
└── Step 2: Enter OTP
    ├── OTPInput component (6 digits)
    ├── Resend OTP option
    ├── Change identifier option
    └── Verify button
```

### API Endpoints

#### 1. Send OTP
**Endpoint:** `POST /api/users/login/send-otp`

**Request:**
```json
{
  "identifier": "user@mediczy.com" // or "9876543210"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent successfully via Email",
  "data": {
    "otpId": "83ce9d8e9a46c6f36142988f49e4b663",
    "expiresAt": "2026-01-26T18:26:56.291Z",
    "expiresIn": "5 minutes",
    "deliveryMethod": "email",
    "sentTo": "us****@mediczy.com"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "User not found with this email/phone"
}
```

#### 2. Verify OTP
**Endpoint:** `POST /api/users/login/verify-otp`

**Request:**
```json
{
  "identifier": "user@mediczy.com",
  "code": "764880"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@mediczy.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+91 9876543210"
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

## Frontend Code Examples

### State Management
```tsx
const [useOtpLogin, setUseOtpLogin] = useState(false);
const [otpIdentifier, setOtpIdentifier] = useState('');
const [otpCode, setOtpCode] = useState('');
const [otpSent, setOtpSent] = useState(false);
const [otpLoading, setOtpLoading] = useState(false);
const [otpVerifying, setOtpVerifying] = useState(false);
```

### Send OTP Function
```tsx
const handleOtpSend = async () => {
  if (!otpIdentifier.trim()) {
    toast({
      variant: "destructive",
      title: "Error",
      description: "Email or phone number is required",
    });
    return;
  }

  setOtpLoading(true);
  try {
    const { data } = await api.post(
      "/users/login/send-otp",
      { identifier: otpIdentifier.trim() },
      { skipAuth: true } as any
    );
    
    if (data?.success) {
      setOtpSent(true);
      toast({
        title: "OTP sent",
        description: data?.message || "OTP sent successfully",
      });
    }
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: "Error",
      description: error?.response?.data?.message || "Failed to send OTP",
    });
  } finally {
    setOtpLoading(false);
  }
};
```

### Verify OTP Function
```tsx
const handleOtpVerify = async () => {
  if (!otpIdentifier.trim() || !otpCode.trim()) {
    toast({
      variant: "destructive",
      title: "Error",
      description: "Identifier and OTP code are required",
    });
    return;
  }

  setOtpVerifying(true);
  try {
    const { data } = await api.post(
      "/users/login/verify-otp",
      { identifier: otpIdentifier.trim(), code: otpCode.trim() },
      { skipAuth: true } as any
    );

    if (!data?.token) {
      throw new Error(data?.message || "OTP verification failed");
    }

    // Store authentication data
    localStorage.setItem("token", data.token);
    localStorage.setItem("userType", "user");
    localStorage.setItem("userId", String(data.user.id));
    localStorage.setItem("userData", JSON.stringify(data.user));

    toast({
      title: "Success",
      description: "Logged in successfully. Redirecting...",
    });

    window.dispatchEvent(new Event("authChange"));
    navigate("/", { replace: true });
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: "Error",
      description: error?.response?.data?.message || "OTP verification failed",
    });
  } finally {
    setOtpVerifying(false);
  }
};
```

---

## OTP Input Component

### Features
- 6 separate input boxes for each digit
- Auto-focus next input on digit entry
- Auto-focus previous input on backspace
- Paste support (full OTP at once)
- Keyboard navigation
- Error state highlighting
- Disabled state support

### Usage
```tsx
import { OTPInput } from "@/components/OTPInput";

<OTPInput
  length={6}
  value={otpCode}
  onChange={setOtpCode}
  className="justify-center"
/>
```

### Props
```tsx
interface OTPInputProps {
  length?: number;        // Default: 6
  value: string;          // Current OTP value
  onChange: (value: string) => void;  // Callback when OTP changes
  error?: boolean;        // Show error state
  disabled?: boolean;     // Disable input
  className?: string;     // Additional CSS classes
}
```

---

## UI/UX Enhancements

### Visual Feedback
1. **Loading States:**
   - "Sending OTP..." with spinner
   - "Verifying..." with spinner
   - Disabled buttons during API calls

2. **Success States:**
   - Green checkmark icons
   - Success toast notifications
   - Smooth transitions between steps

3. **Error States:**
   - Red border on OTP inputs
   - Error toast notifications
   - Clear error messages

### Animations
- Fade-in/fade-out transitions
- Scale animations on step changes
- Slide transitions for smooth UX
- Hover effects on buttons

### Accessibility
- Keyboard navigation support
- ARIA labels on inputs
- Focus management
- Screen reader friendly

---

## Security Features

### OTP Generation
- Random 6-digit numeric code
- SHA-256 hashing for storage
- 5-minute expiration
- One-time use only

### Rate Limiting
- Max 5 OTP requests per 15 minutes
- IP-based rate limiting
- Account lockout after 10 failed attempts

### Validation
- Email format validation
- Phone number format validation (10 digits)
- OTP code validation (6 digits)
- Expiration check on verification

---

## Testing Guide

### Manual Testing

#### Test Case 1: Email OTP Login
1. Go to https://app.mediqzy.com
2. Click "Use OTP"
3. Enter: `user@mediczy.com`
4. Click "Send OTP"
5. Check email for code
6. Enter the 6-digit code
7. Click "Verify & Login"
8. ✅ Should be logged in

#### Test Case 2: Phone OTP Login
1. Go to https://app.mediqzy.com
2. Click "Use OTP"
3. Enter: `7373007737`
4. Click "Send OTP"
5. Check WhatsApp for code
6. Enter the 6-digit code
7. Click "Verify & Login"
8. ✅ Should be logged in

#### Test Case 3: Invalid Identifier
1. Click "Use OTP"
2. Enter: `invalid-email`
3. Click "Send OTP"
4. ❌ Should show error

#### Test Case 4: Invalid OTP
1. Send OTP successfully
2. Enter wrong code: `000000`
3. Click "Verify & Login"
4. ❌ Should show error

#### Test Case 5: Resend OTP
1. Send OTP successfully
2. Click "Resend OTP"
3. ✅ New OTP should be sent

#### Test Case 6: Change Identifier
1. Send OTP successfully
2. Click "← Change email/phone"
3. ✅ Should go back to step 1

### API Testing

```bash
# Test send OTP with email
curl -X POST http://localhost:8000/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user@mediczy.com"}'

# Test send OTP with phone
curl -X POST http://localhost:8000/api/users/login/send-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"7373007737"}'

# Test verify OTP
curl -X POST http://localhost:8000/api/users/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user@mediczy.com","code":"123456"}'
```

---

## Troubleshooting

### Issue: OTP not received
**Symptoms:** User doesn't receive OTP code
**Solutions:**
1. Check spam/junk folder (email)
2. Check WhatsApp message requests
3. Verify phone number is correct
4. Try resending OTP
5. Check backend logs for delivery errors

### Issue: "Invalid or expired OTP"
**Symptoms:** Correct OTP shows as invalid
**Solutions:**
1. Check if OTP expired (5 min limit)
2. Request new OTP
3. Verify identifier matches
4. Check for typos in code

### Issue: "User not found"
**Symptoms:** Error when sending OTP
**Solutions:**
1. Verify user account exists
2. Check email/phone spelling
3. Use correct identifier format
4. Contact support if persistent

### Issue: Rate limit exceeded
**Symptoms:** "Too many requests" error
**Solutions:**
1. Wait 15 minutes
2. Clear browser cache
3. Try different identifier
4. Contact support if blocked

---

## Configuration

### Environment Variables

**Backend (.env):**
```bash
# OTP Configuration
OTP_EXPIRY_MINUTES=5
OTP_LENGTH=6
OTP_RATE_LIMIT=5  # Per 15 minutes

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# WhatsApp Configuration
WHATSAPP_API_KEY=your-api-key
WHATSAPP_PHONE_ID=your-phone-id
```

**Frontend (.env.production):**
```bash
VITE_API_URL=https://app.mediqzy.com/api
```

---

## Best Practices

### For Developers
1. Always validate input before API calls
2. Show loading states during async operations
3. Handle all error cases gracefully
4. Clear sensitive data after use
5. Use HTTPS in production
6. Implement rate limiting
7. Log security events

### For Users
1. Use a valid email/phone number
2. Don't share OTP codes
3. Enter code within 5 minutes
4. Check spam folder if not received
5. Contact support if issues persist

---

## Deployment Checklist

- [x] OTP endpoints implemented
- [x] Frontend UI redesigned
- [x] OTPInput component created
- [x] Error handling added
- [x] Loading states implemented
- [x] Toast notifications configured
- [x] Validation logic added
- [x] Rate limiting enabled
- [x] Email delivery working
- [x] WhatsApp delivery working
- [x] Security measures in place
- [x] Frontend rebuilt and deployed
- [x] Git commit created
- [x] Documentation complete

---

## Related Files

### Frontend
- `client/src/auth/Login.tsx` - Main login component
- `client/src/components/OTPInput.tsx` - OTP input component
- `client/src/utils/api.ts` - API client
- `client/src/hooks/use-toast.ts` - Toast notifications

### Backend
- `server/routes/user.route.js` - OTP endpoints
- `server/controller/user.controller.js` - OTP logic
- `server/middleware/rateLimiter.js` - Rate limiting
- `server/utils/otp.js` - OTP generation/validation

---

## Future Enhancements

### Planned Features
1. **SMS OTP:** Add SMS delivery option
2. **Biometric Login:** Add fingerprint/face ID
3. **Remember Device:** Skip OTP for trusted devices
4. **OTP via Voice Call:** Audio OTP delivery
5. **Multi-factor Auth:** Combine OTP + password
6. **Social Login:** Google/Facebook OAuth
7. **Magic Link:** Email-based passwordless login

### Improvements
1. Add OTP retry counter
2. Show remaining time for OTP expiry
3. Auto-verify on paste
4. Add animation on success
5. Implement progressive enhancement
6. Add offline support
7. Optimize bundle size

---

**Status:** ✅ **PRODUCTION READY**  
**Last Updated:** January 26, 2026  
**Version:** 2.0  
**Commit:** `1198d57`
