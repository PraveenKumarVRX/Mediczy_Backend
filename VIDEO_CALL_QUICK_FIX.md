# Video Call Not Connecting - Quick Fix Reference

## Problem
Users cannot join video calls - receiving 403 "Not authorized" errors

## Root Cause
User ID field inconsistency between Postgres (`id`) and MongoDB (`_id`) models causing authentication to fail in video endpoints

## Solution Applied ✅

### 1. Auth Middleware Fix
**File:** `server/middleware/auth.middleware.js` Line 291

```javascript
// Added ID normalization
req.user = {
  ...user,
  id: user.id || user._id || decoded.id,  // ✅ FIX
  isTeam: user.isTeam || decoded.isTeam,
  isAdmin: user.isAdmin || decoded.isAdmin
};
```

### 2. Video Endpoint Fix
**File:** `server/routes/online-consultation.route.js` Line 1127

```javascript
// Added defensive ID extraction
const userId = req.user.id || req.user._id || req.user.dataValues?.id || req.user.dataValues?._id;

// Added validation
if (!userId) {
  return res.status(500).json({
    success: false,
    message: 'Internal error: Unable to identify user'
  });
}
```

### 3. Debug Logging
Added comprehensive logging to track video join requests and authorization checks

## Deployment Status
- ✅ Code committed
- ✅ Server restarted (PM2)
- ✅ All instances online
- ✅ No errors in logs
- 🔄 Awaiting user testing

## Testing Steps

### User Testing
1. Login at https://mediqzy.com/login
2. Go to Appointments
3. Click "Join Video Call"
4. **Expected:** Video room loads successfully
5. **No more:** 403 Forbidden errors

### Monitor Logs
```bash
# Real-time monitoring
pm2 logs mediczy-server | grep "🎥"

# Check recent joins
pm2 logs mediczy-server --lines 100 | grep "Video Join"
```

## Expected Log Output
```
🎥 Video Join Request: { appointmentId: 123, userId: 456, userRole: 'user' }
🔐 Authorization Check: { isPatient: true, isDoctor: false }
```

## Files Modified
1. `server/middleware/auth.middleware.js` - User ID normalization
2. `server/routes/online-consultation.route.js` - Defensive extraction + logging

## Quick Verification
```bash
# Run test script
./test-video-call-user-auth.sh

# Check server status
pm2 status

# View recent logs
pm2 logs mediczy-server --lines 50
```

## Rollback (If Needed)
```bash
git checkout HEAD~1 server/middleware/auth.middleware.js
git checkout HEAD~1 server/routes/online-consultation.route.js
pm2 restart mediczy-server
```

## Documentation
- Full Audit: `VIDEO_CALL_USER_LOGIN_AUDIT.md`
- Implementation: `VIDEO_CALL_FIX_SUMMARY.md`
- Test Script: `test-video-call-user-auth.sh`

## Status: ✅ FIXED & DEPLOYED
**Next:** User verification required
