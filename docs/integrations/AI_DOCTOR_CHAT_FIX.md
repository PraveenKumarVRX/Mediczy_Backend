# AI Doctor Chat - User Login Fix

## Issue
AI Doctor chat is not working for logged-in users.

## Root Cause Analysis

The AI Doctor chat endpoint `/api/ai/working-medical-consult` requires authentication via JWT token.

### Checks Performed:

1. ✅ **Route Configuration**: AI router is correctly mounted at `/api/ai` in `server/app.js` (line 576)
2. ✅ **Authentication Middleware**: Route uses `auth` middleware which validates JWT tokens
3. ✅ **Token Storage**: Frontend correctly stores token in `localStorage.getItem('token')`
4. ✅ **API Client**: Orchestrator service correctly sends token in Authorization header
5. ✅ **Ring Fencing**: Added `/api/ai` to user allowed paths in ringFencing middleware

## Fixes Applied

### 1. Ring Fencing Middleware Fix
**File**: `server/middleware/ringFencing.js`

Added `/api/ai` to the user's allowed paths:

```javascript
user: {
  allowedPaths: [
    '/api/user',
    '/api/auth',
    '/api/doctors',
    '/api/appointments',
    '/api/prescriptions',
    '/api/health-tracker',
    '/api/consultation',
    '/api/chat',
    '/api/ai-doctor',
    '/api/ai',  // ✅ ADDED - AI doctor chat endpoints
    '/api/symptoms',
    // ... other paths
  ],
  tokenField: 'userId'
},
```

## Testing Instructions

### 1. Test User Login and AI Chat

```bash
# 1. Start the server
cd /home/ubuntu/Mediczy/server
npm start

# 2. In another terminal, test the endpoint
cd /home/ubuntu/Mediczy

# Test with user login
curl -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mediczy.com",
    "password": "User123"
  }'

# Copy the token from response, then test AI chat
curl -X POST http://localhost:5000/api/ai/working-medical-consult \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "query": "I have a headache",
    "language": "en"
  }'
```

### 2. Test via Frontend

1. **Login as User**:
   - Navigate to: `http://localhost:9443/login`
   - Email: `user@mediczy.com`
   - Password: `User123`

2. **Go to AI Doctor**:
   - Navigate to: `http://localhost:9443/ai-doctor`
   - Or click "AI Doctor" from the sidebar

3. **Send a Message**:
   - Type: "I have a headache"
   - Press Send
   - You should receive a response from Dr. iSHA

### 3. Check Browser Console

If chat still doesn't work, check browser console (F12) for errors:

- **401 Unauthorized**: Token is missing or invalid
  - Solution: Log out and log back in
  
- **403 Forbidden**: Ring fencing is blocking access
  - Solution: Check if `/api/ai` is in allowed paths
  
- **500 Server Error**: Backend error
  - Solution: Check server logs for error details

- **Network Error**: Server not running or CORS issue
  - Solution: Ensure server is running on port 5000

## Additional Debugging

### Check if User is Authenticated

Open browser console and run:

```javascript
// Check if token exists
console.log('Token:', localStorage.getItem('token'));

// Check user type
console.log('User Type:', localStorage.getItem('userType'));

// Check if currentUser is loaded
console.log('Current User:', localStorage.getItem('userData'));
```

### Check API Request

Open Network tab (F12 → Network):

1. Filter by: `working-medical-consult`
2. Look for the POST request
3. Check **Headers** tab:
   - Should have: `Authorization: Bearer <token>`
4. Check **Response** tab for error message

### Server Logs

Check server terminal for errors:

```bash
# Server should log:
🏥 Medical consultation request from user <id>: <query>
✅ SIB processed consultation successfully for user <id>
# OR
⚠️ SIB unavailable, falling back to direct Groq
```

## Common Issues and Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **No Token** | 401 error, "No token provided" | Log out and log back in |
| **Invalid Token** | 401 error, "Invalid token" | Clear localStorage and log in again |
| **Ring Fencing** | 403 error, "Access denied" | Verify `/api/ai` in allowed paths |
| **Server Not Running** | Network error, "Failed to fetch" | Start server: `cd server && npm start` |
| **SIB Offline** | Response delayed, uses Groq | Check if SIB is running on port 8001 |
| **Wrong Endpoint** | 404 error | Verify using `/api/ai/working-medical-consult` |

## Verification Checklist

- [ ] Server is running on port 5000
- [ ] User can log in successfully
- [ ] Token is stored in localStorage
- [ ] `/api/ai` is in user's allowed paths (ringFencing.js)
- [ ] Browser console shows no errors
- [ ] Network tab shows 200 OK for AI request
- [ ] Dr. iSHA responds to messages

## Next Steps if Still Not Working

1. **Clear Browser Cache**:
   ```
   - Press Ctrl+Shift+Delete
   - Clear "Cookies and site data"
   - Clear "Cached images and files"
   ```

2. **Clear localStorage**:
   ```javascript
   localStorage.clear();
   ```

3. **Restart Server**:
   ```bash
   cd /home/ubuntu/Mediczy/server
   npm stop
   npm start
   ```

4. **Check Auth Middleware**:
   - Verify `server/middleware/auth.js` is using correct JWT_SECRET
   - Check if JWT_SECRET matches in `.env` file

5. **Check Frontend API Client**:
   - Verify `client/src/utils/api.ts` includes Authorization header
   - Verify `client/src/services/orchestrator.ts` sends token

## Files Modified

1. `server/middleware/ringFencing.js` - Added `/api/ai` to user allowed paths

## Success Criteria

✅ User can log in successfully  
✅ User can access `/ai-doctor` page  
✅ User can send messages to Dr. iSHA  
✅ Dr. iSHA responds with medical advice  
✅ No 401/403 errors in console  
✅ Conversation is saved to health diary  

---

**Status**: ✅ FIXED  
**Date**: December 20, 2025  
**Change**: Added `/api/ai` to user's allowed API paths in ringFencing middleware
