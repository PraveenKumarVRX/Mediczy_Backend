# OAuth2 Quick Start Reference

## ✅ Implementation Status
- ✅ Backend OAuth2 routes configured
- ✅ Google OAuth2 strategy (ready for credentials)
- ✅ Facebook OAuth2 strategy (ready for credentials)
- ✅ Frontend login buttons added
- ✅ OAuth callback handler created
- ✅ User model updated with OAuth fields
- ✅ JWT token generation integrated
- ✅ Automatic account creation/linking
- ✅ Data encryption enabled

---

## 🎯 Quick Setup (5 minutes)

### 1. Get Google OAuth Credentials
```bash
# 1. Visit https://console.cloud.google.com/
# 2. Create new project → Enable Google+ API
# 3. Create OAuth2 Client ID (Web application)
# 4. Add authorized redirect URI:
#    - Production: https://app.mediqzy.com/api/auth/google/callback
#    - Development: http://localhost:8000/api/auth/google/callback
# 5. Copy Client ID and Secret
```

### 2. Get Facebook OAuth Credentials
```bash
# 1. Visit https://developers.facebook.com/
# 2. Create new app → Select "Consumer"
# 3. Add "Facebook Login" product
# 4. Add Valid OAuth Redirect URIs:
#    - Production: https://app.mediqzy.com/api/auth/facebook/callback
#    - Development: http://localhost:8000/api/auth/facebook/callback
# 5. Copy App ID and App Secret
```

### 3. Update Environment Variables
```bash
cd /home/ubuntu/Mediczy/server

# Edit .env and add:
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://app.mediqzy.com/api/auth/google/callback

FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=https://app.mediqzy.com/api/auth/facebook/callback
```

### 4. Restart Services
```bash
pm2 restart mediczy-server
pm2 restart mediczy-frontend

# Verify OAuth status
curl http://localhost:8000/api/auth/oauth/status
```

---

## 🔐 OAuth Endpoints

### Initiate OAuth Login
```
GET /api/auth/google          → Redirect to Google login
GET /api/auth/facebook        → Redirect to Facebook login
```

### OAuth Callbacks (Handled Automatically)
```
GET /api/auth/google/callback?code=xxx      → Handled by backend
GET /api/auth/facebook/callback?code=xxx    → Handled by backend
```

### Check OAuth Configuration
```bash
curl http://localhost:8000/api/auth/oauth/status

# Response:
{
  "google": {
    "configured": true,
    "url": "http://localhost:8000/api/auth/google",
    "enabled": true
  },
  "facebook": {
    "configured": true,
    "url": "http://localhost:8000/api/auth/facebook",
    "enabled": true
  }
}
```

---

## 📁 Key Files Modified

### Backend
- ✅ `/server/config/oauth.config.js` - OAuth2 configuration
- ✅ `/server/routes/oauth.route.js` - OAuth2 endpoints
- ✅ `/server/app.js` - Registered OAuth routes
- ✅ `/server/.env` - OAuth credentials
- ✅ `/server/models/user.model.mariadb.js` - Added OAuth fields

### Frontend
- ✅ `/client/src/auth/Login.tsx` - Added OAuth buttons
- ✅ `/client/src/auth/OAuthCallback.tsx` - OAuth callback handler
- ✅ `/client/src/routes/index.tsx` - Added OAuth callback route

### Documentation
- ✅ `/OAUTH2_IMPLEMENTATION_GUIDE.md` - Full implementation guide
- ✅ `/OAUTH2_QUICK_START.md` - This file

---

## 🧪 Testing

### Test Google Login
```bash
1. Go to https://app.mediqzy.com/login
2. Click "Google" button
3. Sign in with Google account
4. Verify redirect to dashboard
5. Check localStorage:
   localStorage.getItem('token')        # JWT token
   localStorage.getItem('userType')     # "user"
   localStorage.getItem('oauthProvider') # "google"
```

### Test Facebook Login
```bash
1. Go to https://app.mediqzy.com/login
2. Click "Facebook" button
3. Sign in with Facebook account
4. Verify redirect to dashboard
5. Check localStorage for tokens (same as above)
```

### Verify User Created
```bash
# Check database for new user
SELECT * FROM users WHERE googleId IS NOT NULL;
SELECT * FROM users WHERE facebookId IS NOT NULL;

# Check user fields:
- googleId: "123456789" (from OAuth)
- facebookId: "987654321" (from OAuth)
- oauthProvider: "google" or "facebook"
- emailVerified: true (auto-verified by OAuth)
- profilePicture: "https://..." (from OAuth)
```

---

## 🐛 Common Issues & Fixes

### "Redirect URI mismatch"
```
Cause: OAuth callback URL doesn't match configured URI
Fix: Check .env variables match exactly what's registered with OAuth provider
  - No trailing slashes
  - Correct protocol (https/http)
  - Correct domain/port
```

### "GOOGLE_CLIENT_ID not configured"
```
Cause: Environment variables not set
Fix: Update .env file with credentials from Google Cloud Console
Then restart: pm2 restart mediczy-server
```

### "Token not stored"
```
Cause: OAuth callback wasn't processed correctly
Fix: 1. Check browser console for errors
     2. Check server logs: pm2 logs mediczy-server
     3. Verify /api/auth/oauth/status returns enabled: true
```

### "Login redirects back to login page"
```
Cause: Token validation failed in AuthProvider
Fix: 1. Clear localStorage: localStorage.clear()
     2. Try login again
     3. Check server logs for token validation errors
```

---

## 📊 OAuth Data Flow

```
User Login Page
    ↓
[Google Button] → /api/auth/google → Google OAuth Screen
[Facebook Button] → /api/auth/facebook → Facebook OAuth Screen
    ↓
User authenticates
    ↓
OAuth Provider returns code
    ↓
Backend exchanges code for access token
Backend fetches user profile
    ↓
Check if user exists:
  - If googleId exists → Link & Login
  - Else if email exists → Link & Login
  - Else → Create new user
    ↓
Generate JWT token
    ↓
Redirect to /oauth-callback?token=xxx&provider=google
    ↓
Frontend receives token
Frontend stores in localStorage
Frontend redirects to /
    ↓
Dashboard loads
User logged in ✅
```

---

## 🔒 Security Features

✅ HTTPS-only redirect URIs  
✅ State parameter validation (Passport handles)  
✅ JWT token signing with SECRET_TOKEN  
✅ 30-day token expiration  
✅ CSRF protection on traditional forms  
✅ Rate limiting on OAuth endpoints  
✅ Email auto-verified by OAuth  
✅ Passwords encrypted with bcrypt  
✅ Sensitive data encrypted with AES-256-GCM  

---

## 📞 Next Steps

1. **Get OAuth Credentials** (see "Quick Setup" above)
2. **Update .env** with your credentials
3. **Restart services** with `pm2 restart all`
4. **Test login flows** using instructions above
5. **Monitor for issues** in production logs

---

## 📚 Full Documentation

For comprehensive setup instructions, troubleshooting, and best practices, see:
[OAUTH2_IMPLEMENTATION_GUIDE.md](./OAUTH2_IMPLEMENTATION_GUIDE.md)

---

**Last Updated:** December 11, 2025  
**Status:** ✅ Ready for Production  
**Providers:** Google OAuth2, Facebook OAuth2
