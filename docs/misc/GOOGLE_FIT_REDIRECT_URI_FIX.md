# 🔧 Fix: Invalid Redirect URI (storagerelay://)

## Problem
```
storagerelay://https/mediqzy.com
Invalid redirect: Must end with a public top-level domain (such as .com or .org).
```

## Why This Happens
The `@react-oauth/google` library with `flow: 'implicit'` generates a `storagerelay://` URI automatically for cross-origin communication. Google OAuth doesn't accept this scheme.

## ✅ SOLUTION: Use Standard Redirect URIs

You should NOT add the `storagerelay://` URI. Instead, use only standard HTTP/HTTPS URIs.

---

## 🎯 CORRECT REDIRECT URI CONFIGURATION

### Authorized Redirect URIs (Add these ONLY):
```
http://localhost:9443
https://app.mediqzy.com
```

### Authorized JavaScript Origins (Add these):
```
http://localhost:9443
https://app.mediqzy.com
```

### ❌ DO NOT ADD:
```
storagerelay://https/mediqzy.com  ❌ Don't add this!
```

---

## 📋 COMPLETE FIX STEPS

### STEP 1: Add Test User (Required - Fix 403 Error)
1. Go to: https://console.cloud.google.com/apis/credentials/consent?project=mediczy-624ed
2. Scroll to **"Test users"** section
3. Click **"+ ADD USERS"**
4. Enter: `shivakumar.jay@gmail.com`
5. Click **"SAVE"**

### STEP 2: Configure Redirect URIs (Correct Way)
1. Go to: https://console.cloud.google.com/apis/credentials?project=mediczy-624ed
2. Click OAuth Client: `982376166047-j975co5qc5enqhcesggbsee3obnj7tqa`
3. Under **"Authorized redirect URIs"** section:
   - Remove any `storagerelay://` entries if present
   - Ensure these are present:
     ```
     http://localhost:9443
     https://app.mediqzy.com
     ```
4. Under **"Authorized JavaScript origins"** section:
   - Ensure these are present:
     ```
     http://localhost:9443
     https://app.mediqzy.com
     ```
5. Click **"SAVE"**

### STEP 3: Verify All Scopes Are Added
1. Go to: https://console.cloud.google.com/apis/credentials/consent?project=mediczy-624ed
2. Click **"EDIT APP"**
3. Go to **"Scopes"** section
4. Verify all 5 scopes are present:
   ```
   ✓ https://www.googleapis.com/auth/fitness.activity.read
   ✓ https://www.googleapis.com/auth/fitness.heart_rate.read
   ✓ https://www.googleapis.com/auth/fitness.sleep.read
   ✓ https://www.googleapis.com/auth/fitness.body.read
   ✓ https://www.googleapis.com/auth/fitness.location.read
   ```

### STEP 4: Test
1. Wait 2-3 minutes for changes to propagate
2. Clear browser cache (Ctrl+Shift+Delete)
3. Go to: https://app.mediqzy.com
4. Try Google Fit connection
5. Should work now! ✅

---

## 🔍 WHY THE STORAGERELAY URI APPEARED

The `@react-oauth/google` library uses different redirect mechanisms:
- **Implicit flow**: Uses `storagerelay://` for security (cross-origin postMessage)
- **Authorization code flow**: Uses standard HTTP/HTTPS redirects

Since Google doesn't accept `storagerelay://` scheme, the implicit flow with standard redirect URIs should work fine. The library handles the OAuth popup and callback automatically.

---

## ✅ FINAL CONFIGURATION SUMMARY

### OAuth Consent Screen
- **Status**: Testing
- **Test Users**: shivakumar.jay@gmail.com (MUST ADD)
- **Scopes**: All 5 fitness scopes

### OAuth Client ID: 982376166047-j975co5qc5enqhcesggbsee3obnj7tqa

**Authorized JavaScript origins:**
```
http://localhost:9443
https://app.mediqzy.com
```

**Authorized redirect URIs:**
```
http://localhost:9443
https://app.mediqzy.com
```

**❌ DO NOT ADD:**
- ~~storagerelay://https/mediqzy.com~~
- Any other custom schemes

---

## 🎯 QUICK ACTION CHECKLIST

- [ ] Add shivakumar.jay@gmail.com as test user
- [ ] Verify 2 JavaScript origins (http://localhost:9443 and https://app.mediqzy.com)
- [ ] Verify 2 redirect URIs (http://localhost:9443 and https://app.mediqzy.com)
- [ ] Remove any storagerelay:// URIs if present
- [ ] Verify all 5 fitness scopes are added
- [ ] Save all changes
- [ ] Wait 2-3 minutes
- [ ] Clear browser cache
- [ ] Test Google Fit connection

---

## 🎉 EXPECTED SUCCESS

After completing these steps:
1. ✅ No "Access blocked" error (because you're a test user)
2. ✅ No redirect URI error
3. ✅ OAuth popup opens
4. ✅ Shows "Mediczy Healthcare Platform"
5. ✅ Lists 5 fitness permissions
6. ✅ Click "Allow" → Success!

---

**Priority Actions:**
1. **MOST IMPORTANT**: Add yourself as test user (fixes 403 error)
2. Verify redirect URIs (don't add storagerelay)
3. Test the integration

