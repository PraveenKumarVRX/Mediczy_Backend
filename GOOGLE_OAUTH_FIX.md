# Google OAuth Status & Fix

## 🔴 Current Issue
Google OAuth is **NOT ENABLED** because the Client Secret is missing.

```json
{
  "google": {
    "configured": false,
    "url": "https://mediqzy.com/api/auth/google",
    "enabled": false
  }
}
```

## ✅ What's Already Configured
- ✅ Google Client ID: `982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com`
- ✅ OAuth configuration code (backend)
- ✅ OAuth login buttons (frontend)
- ✅ OAuth callback handler (frontend & backend)
- ❌ **Missing: Google Client Secret**

## 🔧 Quick Fix (2 minutes)

### Option 1: Run Setup Script (Easiest)
```bash
cd /home/ubuntu/Mediczy
./setup-google-oauth.sh
```

The script will:
1. Guide you to get the Client Secret from Google Cloud Console
2. Update the `.env` file automatically
3. Restart the server
4. Verify OAuth is working

### Option 2: Manual Setup

#### Step 1: Get Client Secret
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=mediczy-624ed)
2. Click on OAuth Client: `982376166047-j975co5qc5enqhcesggbsee3obnj7tqa`
3. Find "Client secret" field
4. Click the copy icon (or click SHOW if hidden)
5. Copy the secret

#### Step 2: Add OAuth Callback URLs
While in the OAuth client editor:
1. Scroll to **"Authorized redirect URIs"**
2. Add these URLs:
   - Production: `https://mediqzy.com/api/auth/google/callback`
   - Development: `http://localhost:8000/api/auth/google/callback`
3. Click **SAVE**

#### Step 3: Update .env
```bash
cd /home/ubuntu/Mediczy/server
nano .env
```

Find the line:
```bash
GOOGLE_CLIENT_SECRET=
```

Replace with:
```bash
GOOGLE_CLIENT_SECRET=YOUR_ACTUAL_SECRET_HERE
```

Save and exit (Ctrl+X, Y, Enter)

#### Step 4: Restart Server
```bash
pm2 restart mediczy-server
```

#### Step 5: Verify
```bash
curl -s http://localhost:8000/api/auth/oauth/status | jq .
```

Should show:
```json
{
  "google": {
    "configured": true,
    "url": "https://mediqzy.com/api/auth/google",
    "enabled": true
  }
}
```

## 🧪 Test Google Login

Once enabled:
1. Go to https://mediqzy.com/login
2. Click the **Google** button
3. Sign in with Google account
4. Should redirect to dashboard
5. Check localStorage for token

## 📊 Current Environment Status

### Backend (.env)
```bash
GOOGLE_CLIENT_ID=982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=                    # ❌ EMPTY - NEEDS TO BE SET
GOOGLE_CALLBACK_URL=https://mediqzy.com/api/auth/google/callback
```

### Frontend (.env)
```bash
VITE_GOOGLE_CLIENT_ID=982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com
```
✅ Frontend is correctly configured

## 🔐 Security Note

**IMPORTANT:** The Client Secret is sensitive. After you add it:
- ✅ DO NOT commit it to git (it's in .gitignore)
- ✅ DO NOT share it publicly
- ✅ DO rotate it regularly (every 6-12 months)
- ✅ DO use environment variables (already done)

## 🐛 Troubleshooting

### Issue: "Redirect URI mismatch"
**Fix:** Make sure you added the callback URLs in Step 2

### Issue: Still shows "configured: false"
**Fix:** 
1. Check if secret was saved: `grep GOOGLE_CLIENT_SECRET /home/ubuntu/Mediczy/server/.env`
2. Verify it's not empty or placeholder
3. Restart server: `pm2 restart mediczy-server`

### Issue: "Invalid client"
**Fix:** Client ID or Secret is wrong
1. Double-check both values in Google Cloud Console
2. Make sure there are no extra spaces or newlines
3. Update .env and restart

## 📚 Resources

- Full Implementation Guide: [OAUTH2_IMPLEMENTATION_GUIDE.md](./OAUTH2_IMPLEMENTATION_GUIDE.md)
- Quick Start Guide: [OAUTH2_QUICK_START.md](./OAUTH2_QUICK_START.md)
- Google Cloud Console: https://console.cloud.google.com/apis/credentials?project=mediczy-624ed
- Setup Script: `./setup-google-oauth.sh`

---

**Last Updated:** December 12, 2025  
**Status:** ⚠️ Waiting for Client Secret  
**Action Required:** Run `./setup-google-oauth.sh` or follow manual steps above
