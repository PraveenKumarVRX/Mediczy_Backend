# Wallet User Login - Troubleshooting Guide

## ✅ Diagnostic Results (Jan 27, 2026)

**Backend Status: FULLY FUNCTIONAL** 🎉

All wallet APIs are working correctly:
- ✅ User authentication
- ✅ Wallet balance retrieval
- ✅ Transaction history
- ✅ Daily login rewards
- ✅ Auto-claim on login

## 🔍 Common Issues & Solutions

### Issue 1: "Wallet Not Loading" in Browser

**Symptoms:**
- Wallet page shows loading spinner indefinitely
- Error message "Failed to load wallet"
- Blank wallet page

**Solutions:**

1. **Clear Browser Cache & LocalStorage**
   ```javascript
   // Open browser console (F12) and run:
   localStorage.clear();
   location.reload();
   ```

2. **Check Browser Console Errors**
   - Press F12 to open Developer Tools
   - Go to "Console" tab
   - Look for red errors related to wallet API
   - Share error messages for diagnosis

3. **Check Network Requests**
   - Press F12 → Network tab
   - Reload wallet page
   - Look for `/api/wallet` request
   - Check if it's failing (red color)
   - Click on it to see response

### Issue 2: "401 Unauthorized" Error

**Cause:** Token expired or invalid

**Solution:**
```bash
# User needs to logout and login again
1. Go to Profile → Logout
2. Login again with credentials
3. Navigate to Wallet page
```

**Frontend Fix (Already Implemented):**
- Wallet page now auto-redirects to login on 401 errors
- Better error messages showing exact issue

### Issue 3: Token Not Being Sent

**Check in Browser Console:**
```javascript
// Verify token exists
console.log('Token:', localStorage.getItem('token'));

// Verify userType
console.log('UserType:', localStorage.getItem('userType'));
```

**If token is missing:**
- User needs to login again
- Check if logout was called accidentally

### Issue 4: CORS or Network Issues

**Symptoms:**
- Network errors in console
- "Failed to fetch" errors
- CORS policy errors

**Check `.env` Configuration:**
```bash
# Client .env
VITE_API_URL=http://localhost:8000/api  # or https://mediczy.com/api for production
```

**Quick Test:**
```bash
# From terminal, test if API is reachable
curl http://localhost:8000/api/wallet \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🧪 Testing Tools

### 1. HTML Diagnostic Tool
Open in browser: `http://localhost:5173/test-wallet-user-login.html`
- Tests login → wallet → rewards flow
- Shows detailed results for each step
- Identifies exact failure point

### 2. Bash Diagnostic Script
Run from terminal:
```bash
cd /home/ubuntu/Mediczy
./test-wallet-diagnosis.sh
```

## 📱 Frontend Code Improvements (Already Applied)

### Enhanced Error Handling
```typescript
// Location: client/src/pages/Wallet.tsx
- Added detailed console logging
- Better error messages
- Auto-redirect on 401
- Retry mechanism for failed requests
- Fallback UI when wallet fails to load
```

### Features Added:
1. **Console Logging:** Debug info in browser console
2. **Error Details:** Shows specific error message from API
3. **Auto-Redirect:** Redirects to login on auth failure
4. **Retry Button:** User can manually retry loading wallet
5. **Fallback UI:** Shows helpful message when wallet can't load

## 🔧 Manual Testing Steps

### Step 1: Login Test
```bash
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq '.'
```

Expected: `{"message":"Login successful","token":"...","user":{...}}`

### Step 2: Wallet Test
```bash
# Use token from Step 1
curl http://localhost:8000/api/wallet \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.'
```

Expected: `{"success":true,"data":{"balance":365,...}}`

### Step 3: Browser Test
1. Open http://localhost:5173 (or your frontend URL)
2. Login with user@mediczy.com / User123
3. Navigate to `/wallet`
4. Check browser console for logs
5. Verify wallet displays balance

## 📋 User Instructions

If wallet is not working on your device:

1. **Logout and Login Again**
   - This refreshes your authentication token
   - Ensures wallet is initialized

2. **Clear Browser Data**
   ```
   Chrome/Edge: Ctrl+Shift+Delete → Clear browsing data
   Firefox: Ctrl+Shift+Delete → Clear cache
   ```

3. **Check Internet Connection**
   - Wallet requires active internet
   - Test by accessing other pages

4. **Try Different Browser**
   - Sometimes browser extensions block requests
   - Try incognito/private mode

5. **Contact Support**
   - Email: dev@mediczy.com
   - Include: Browser console errors
   - Include: Screenshot of issue

## 🎯 For Developers

### Quick Debug Checklist
- [ ] Server is running (pm2 status)
- [ ] Database is accessible
- [ ] User has valid token
- [ ] Token is being sent in Authorization header
- [ ] /api/wallet endpoint responds correctly
- [ ] Frontend .env has correct API URL
- [ ] CORS is configured properly
- [ ] Browser console shows no errors

### API Endpoints
```
POST /api/users/login          - User authentication
GET  /api/wallet               - Get wallet summary
GET  /api/wallet/balance       - Get balance only
GET  /api/wallet/transactions  - Get transaction history
POST /api/wallet/earn/daily-login - Claim daily reward
```

### Required Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## 🎉 Verified Working Features

Based on diagnostic test (Jan 27, 2026):

✅ **User Login**
- Email: user@mediczy.com
- User ID: 19
- Token generation working

✅ **Wallet Balance**
- Current: 365 HC
- Total Earned: 18 HC
- Total Spent: 3 HC
- Streak: 1 day

✅ **Transaction History**
- 10+ transactions recorded
- Daily login rewards tracked
- Consultation payments recorded

✅ **Daily Rewards**
- Auto-claim on login working
- Streak tracking functional
- Bonus rewards calculated

✅ **Frontend Flow**
- Login → Auto-claim → Wallet page
- All steps executing correctly

## 📞 Support

If issue persists after following this guide:
1. Run diagnostic script: `./test-wallet-diagnosis.sh`
2. Save output
3. Check browser console (F12)
4. Screenshot error messages
5. Contact: dev@mediczy.com

---

**Last Updated:** January 27, 2026
**Status:** All systems operational ✅
