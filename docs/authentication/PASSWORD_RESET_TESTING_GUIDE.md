# Password Reset Testing Guide

## Quick Test Instructions

### 1. Access the Password Reset Page

**For Patients:**
```
http://localhost:5173/forgot-password?type=user
```

**For Doctors:**
```
http://localhost:5173/forgot-password?type=doctor
```

### 2. Test Flow (3 Steps)

#### **Step 1: Request OTP**

1. Select account type (Patient/Doctor)
2. Enter email address: `test@example.com`
3. (Optional) Enter phone number: `+1234567890`
4. Click **"Send OTP"**

**Expected Result:**
- Loading spinner appears
- Success toast: "OTP Sent"
- Advances to Step 2
- Delivery status shown for each channel

#### **Step 2: Verify OTP**

1. Check your email for the OTP code
2. Enter the 6-digit code in the input boxes
3. Click **"Verify OTP"**

**Test OTP Features:**
- Try pasting a 6-digit code
- Try backspace navigation
- Try arrow key navigation
- Click "Resend OTP" to get a new code
- Click "Change Email/Phone" to go back

**Expected Result:**
- OTP validated
- Success toast: "OTP Verified"
- Advances to Step 3

#### **Step 3: Reset Password**

1. Enter new password (min 6 characters)
2. Confirm new password (must match)
3. Click **"Reset Password"**

**Expected Result:**
- Password updated
- Success toast: "Password Reset Successful"
- Redirects to login after 2 seconds

### 3. Backend API Testing

#### **Test Request OTP:**

```bash
curl -X POST http://localhost:8000/api/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "+1234567890",
    "userType": "user"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email, SMS, and WhatsApp",
  "deliveryStatus": [
    {
      "channel": "email",
      "success": true
    },
    {
      "channel": "sms",
      "success": false,
      "error": "SMS provider not configured"
    },
    {
      "channel": "whatsapp",
      "success": false,
      "error": "WhatsApp provider not configured"
    }
  ]
}
```

**Check your email for OTP code.**

#### **Test Verify OTP:**

```bash
curl -X POST http://localhost:8000/api/password-reset/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "123456",
    "userType": "user"
  }'
```

**Expected Response (success):**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "resetToken": "abc123def456..."
}
```

**Expected Response (failure):**
```json
{
  "success": false,
  "message": "Invalid or expired OTP"
}
```

#### **Test Reset Password:**

```bash
curl -X POST http://localhost:8000/api/password-reset/reset \
  -H "Content-Type: application/json" \
  -d '{
    "resetToken": "abc123def456...",
    "newPassword": "NewSecurePassword123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

### 4. Error Cases to Test

#### **Invalid Email:**
- Enter: `invalid-email`
- Expected: "Invalid email" error message

#### **Empty Fields:**
- Submit without email/phone
- Expected: "Missing Information" error

#### **Wrong OTP:**
- Enter incorrect 6-digit code
- Expected: "Invalid OTP" error, OTP boxes turn red

#### **Incomplete OTP:**
- Try to submit with fewer than 6 digits
- Expected: "Verify OTP" button disabled

#### **Password Mismatch:**
- Enter different passwords
- Expected: "Passwords Don't Match" error

#### **Weak Password:**
- Enter password with < 6 characters
- Expected: "Weak Password" error

### 5. UI/UX Elements to Verify

#### **Step 1:**
- [ ] Shield icon displays
- [ ] Account type radio buttons work
- [ ] Email input has mail icon
- [ ] Phone input has phone icon
- [ ] Info box about multi-channel security
- [ ] "Send OTP" button shows loading spinner
- [ ] "Back to Login" link works
- [ ] Toast notification appears

#### **Step 2:**
- [ ] 6 OTP input boxes display
- [ ] First box auto-focused
- [ ] Typing moves to next box
- [ ] Backspace moves to previous box
- [ ] Paste functionality works
- [ ] Delivery status indicators show
- [ ] Success (green) vs failure (red) colors
- [ ] Email/SMS/WhatsApp icons display
- [ ] "Resend OTP" button works
- [ ] "Change Email/Phone" button works
- [ ] "Verify OTP" button disabled until 6 digits
- [ ] Loading spinner on submit

#### **Step 3:**
- [ ] Green check icon displays
- [ ] Password input fields work
- [ ] Real-time password match validation
- [ ] Character length hint shows
- [ ] "Reset Password" button disabled on mismatch
- [ ] Loading spinner on submit
- [ ] Success message appears
- [ ] Redirect countdown visible

### 6. Mobile Testing

Test on mobile or use browser dev tools:

1. Open Chrome DevTools (F12)
2. Click device toolbar (Ctrl+Shift+M)
3. Select "iPhone 12 Pro" or similar
4. Test all steps on mobile view

**Mobile-specific checks:**
- [ ] Cards are full-width responsive
- [ ] Touch targets are large enough
- [ ] OTP boxes are touch-friendly
- [ ] Keyboard appears correctly (numeric for OTP)
- [ ] No horizontal scrolling
- [ ] All text is readable

### 7. Accessibility Testing

#### **Keyboard Navigation:**
1. Tab through all form elements
2. Verify logical tab order
3. Enter to submit forms
4. Arrow keys in OTP input
5. Escape to dismiss toasts (if applicable)

#### **Screen Reader:**
If you have a screen reader:
- [ ] Labels are read correctly
- [ ] Error messages are announced
- [ ] Success messages are announced
- [ ] Button states announced (loading, disabled)

### 8. Performance Testing

#### **Load Times:**
- [ ] Page loads quickly
- [ ] No layout shift on load
- [ ] Images/icons load fast
- [ ] Smooth transitions between steps

#### **API Response Times:**
- [ ] Request OTP responds in < 3 seconds
- [ ] Verify OTP responds in < 1 second
- [ ] Reset password responds in < 2 seconds

### 9. Browser Compatibility

Test in multiple browsers:

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

### 10. Integration Testing Scenarios

#### **Scenario 1: Happy Path**
1. User requests OTP with email
2. Receives OTP via email
3. Enters correct OTP
4. Sets new password
5. Successfully logs in with new password

✅ **Expected:** Complete success, redirected to login

#### **Scenario 2: Multi-Channel Success**
1. User provides email + phone
2. Receives OTP via email, SMS, WhatsApp
3. Uses OTP from any channel
4. Completes password reset

✅ **Expected:** All channels deliver, any OTP works

#### **Scenario 3: Partial Delivery**
1. Email configured, SMS/WhatsApp not configured
2. User requests OTP
3. Receives via email only
4. Status shows email success, others failed
5. Uses email OTP successfully

✅ **Expected:** System works with partial delivery

#### **Scenario 4: OTP Expiry**
1. Request OTP
2. Wait 11+ minutes
3. Try to verify expired OTP

❌ **Expected:** "Invalid or expired OTP" error

#### **Scenario 5: Rate Limiting**
1. Request OTP 6 times in a row
2. 6th request should be blocked

❌ **Expected:** "Too many requests" error

#### **Scenario 6: Token Expiry**
1. Verify OTP successfully
2. Wait 61+ minutes
3. Try to reset password

❌ **Expected:** "Invalid or expired token" error

#### **Scenario 7: Network Failure**
1. Disconnect network
2. Try to request OTP
3. Reconnect network
4. Try again

✅ **Expected:** Error shown, retry works

### 11. Console Checks

Open browser console (F12) and verify:

- [ ] No JavaScript errors
- [ ] No React warnings
- [ ] No 404 errors for resources
- [ ] API calls logged correctly
- [ ] No memory leaks (check during navigation)

### 12. Security Testing

#### **Client-Side:**
- [ ] Passwords not logged in console
- [ ] OTP not visible in network tab response (hashed)
- [ ] Reset token not exposed unnecessarily
- [ ] HTTPS in production (not localhost)

#### **Server-Side:**
- [ ] Same response for existing/non-existing users
- [ ] OTP hashed in database
- [ ] Rate limiting enforced
- [ ] Tokens expire properly

### 13. Documentation Verification

Read and verify:

- [ ] [SMS_CONFIGURATION.md](SMS_CONFIGURATION.md) - SMS setup instructions clear
- [ ] [WHATSAPP_CONFIGURATION.md](WHATSAPP_CONFIGURATION.md) - WhatsApp setup instructions clear
- [ ] [PASSWORD_RESET_OTP_SYSTEM.md](PASSWORD_RESET_OTP_SYSTEM.md) - API docs accurate
- [ ] [server/.env.example](server/.env.example) - All variables documented

### 14. Production Readiness

Before deploying to production:

- [ ] Environment variables set correctly
- [ ] SMS provider configured (Twilio)
- [ ] WhatsApp provider configured (Twilio + Facebook)
- [ ] Email delivery tested
- [ ] Rate limiting configured
- [ ] Error tracking set up (Sentry)
- [ ] Monitoring dashboard configured
- [ ] Backup notification channel available
- [ ] User-facing help documentation written
- [ ] Support team trained

### 15. Rollback Plan

If something goes wrong:

1. **Frontend Rollback:**
   ```bash
   cd /home/ubuntu/Mediczy/client/src/pages
   mv ForgotPassword.tsx ForgotPassword.tsx.new
   mv ForgotPassword.tsx.backup ForgotPassword.tsx
   npm run build
   ```

2. **Backend Rollback:**
   - Comment out password-reset routes in app.js
   - Restart server

3. **Database Rollback:**
   - No database changes made (no migrations needed)
   - Safe to rollback

---

## Quick Smoke Test (2 Minutes)

1. ✅ Navigate to forgot password page
2. ✅ Enter email, click "Send OTP"
3. ✅ Check email for OTP code
4. ✅ Enter OTP code
5. ✅ Enter new password
6. ✅ Verify redirect to login

**If all steps pass:** System is working! ✅

**If any step fails:** Check console, network tab, server logs

---

## Getting Help

**Frontend Issues:**
- Check browser console for errors
- Verify component imports
- Check React hooks usage

**Backend Issues:**
- Check server logs: `pm2 logs mediczy-backend`
- Verify environment variables: `cat server/.env`
- Test API directly with curl

**SMS/WhatsApp Issues:**
- See troubleshooting sections in configuration guides
- Check Twilio console for delivery status
- Verify credentials in .env

**Email Issues:**
- Check SMTP settings
- Verify email credentials
- Check spam folder

---

## Success Criteria

✅ **Complete Flow Works:**
- User can request OTP
- OTP delivered via email (minimum)
- OTP verification works
- Password reset successful
- Can login with new password

✅ **UI/UX Polished:**
- No visual bugs
- Smooth transitions
- Clear error messages
- Mobile-friendly
- Accessible

✅ **Documentation Complete:**
- Setup guides written
- Testing documented
- Troubleshooting covered
- Production checklist ready

---

**Current Status:** ✅ Ready for Testing

**Next Action:** Test the frontend flow at http://localhost:5173/forgot-password
