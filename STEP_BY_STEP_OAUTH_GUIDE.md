# 🔧 Step-by-Step Google Fit OAuth Configuration Guide

## Current Configuration
- **Project ID**: `mediczy-624ed`
- **OAuth Client ID**: `982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com`

---

## ✅ STEP 1: Add All 5 Fitness Scopes to Consent Screen

### 1.1 Open OAuth Consent Screen
1. Click this link: [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=mediczy-624ed)
2. You should see your project: **mediczy-624ed** at the top
3. If you see "OAuth consent screen", click **EDIT APP** button

### 1.2 Navigate to Scopes Section
1. Click **SAVE AND CONTINUE** on the first page (App information)
2. You'll reach the **"Scopes"** page
3. Click the **"ADD OR REMOVE SCOPES"** button

### 1.3 Add Each Fitness Scope
A side panel will open. Follow these steps for EACH scope:

#### Scope 1: Activity Data
```
https://www.googleapis.com/auth/fitness.activity.read
```
1. In the search box, type: `fitness.activity`
2. Find: **"https://www.googleapis.com/auth/fitness.activity.read"**
3. Check the checkbox next to it
4. Description shows: "View your Google Fit physical activity data"

#### Scope 2: Heart Rate Data
```
https://www.googleapis.com/auth/fitness.heart_rate.read
```
1. In the search box, type: `fitness.heart_rate`
2. Find: **"https://www.googleapis.com/auth/fitness.heart_rate.read"**
3. Check the checkbox next to it
4. Description shows: "View your Google Fit heart rate data"

#### Scope 3: Sleep Data
```
https://www.googleapis.com/auth/fitness.sleep.read
```
1. In the search box, type: `fitness.sleep`
2. Find: **"https://www.googleapis.com/auth/fitness.sleep.read"**
3. Check the checkbox next to it
4. Description shows: "View your Google Fit sleep data"

#### Scope 4: Body Data (Weight/Height)
```
https://www.googleapis.com/auth/fitness.body.read
```
1. In the search box, type: `fitness.body`
2. Find: **"https://www.googleapis.com/auth/fitness.body.read"**
3. Check the checkbox next to it
4. Description shows: "View body measurements in Google Fit"

#### Scope 5: Location Data
```
https://www.googleapis.com/auth/fitness.location.read
```
1. In the search box, type: `fitness.location`
2. Find: **"https://www.googleapis.com/auth/fitness.location.read"**
3. Check the checkbox next to it
4. Description shows: "View your Google Fit location data"

### 1.4 Save the Scopes
1. After checking all 5 scopes, click **UPDATE** button at the bottom of the side panel
2. The panel closes and you should see all 5 scopes listed
3. Click **SAVE AND CONTINUE** to proceed
4. Click **SAVE AND CONTINUE** on the Test users page (optional to add test users)
5. Click **BACK TO DASHBOARD**

### ✅ Verification
You should now see **5 scopes** listed under your OAuth consent screen configuration.

---

## ✅ STEP 2: Add Authorized JavaScript Origins

### 2.1 Open Credentials Page
1. Click this link: [API Credentials](https://console.cloud.google.com/apis/credentials?project=mediczy-624ed)
2. You'll see a list of credentials

### 2.2 Find Your OAuth Client ID
1. Look for **"OAuth 2.0 Client IDs"** section
2. Find the client with ID starting with: **982376166047-j975co5qc5enqhcesggbsee3obnj7tqa**
3. Click the **pencil icon (✏️)** on the right side to edit

### 2.3 Add JavaScript Origins
Scroll down to find **"Authorized JavaScript origins"** section

#### Add Origin 1: Development
1. Click **"+ ADD URI"** button
2. Type exactly: `http://localhost:9443`
3. Press Enter or click outside the box

#### Add Origin 2: Production
1. Click **"+ ADD URI"** button again
2. Type exactly: `https://mediqzy.com`
3. Press Enter or click outside the box

### ⚠️ IMPORTANT NOTES:
- ✅ NO trailing slash: `https://mediqzy.com` (correct)
- ❌ With trailing slash: `https://mediqzy.com/` (wrong)
- ✅ Exact lowercase: `mediqzy.com` (correct)
- ❌ Wrong case: `Mediqzy.com` (wrong)
- ✅ Correct protocol: Development=`http://`, Production=`https://`

---

## ✅ STEP 3: Add Authorized Redirect URIs

### 3.1 Still on Same Page
You should still be editing the OAuth client from Step 2

### 3.2 Add Redirect URIs
Scroll to **"Authorized redirect URIs"** section

#### Add Redirect URI 1: Development
1. Click **"+ ADD URI"** button
2. Type exactly: `http://localhost:9443`
3. Press Enter or click outside the box

#### Add Redirect URI 2: Production
1. Click **"+ ADD URI"** button again
2. Type exactly: `https://mediqzy.com`
3. Press Enter or click outside the box

### 3.3 Save Configuration
1. Scroll to the bottom of the page
2. Click the **SAVE** button
3. Wait for confirmation message: "OAuth client updated"

### ✅ Verification
Your configuration should now show:
```
Authorized JavaScript origins (2):
  - http://localhost:9443
  - https://mediqzy.com

Authorized redirect URIs (2):
  - http://localhost:9443
  - https://mediqzy.com
```

---

## ✅ STEP 4: Verify OAuth Client ID Matches

### 4.1 Check Google Cloud Console
1. On the credentials page you're already on
2. Look at the **"Client ID"** field
3. It should show: `982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com`

### 4.2 Check Your Environment Files
Run this command to verify:
```bash
grep VITE_GOOGLE_CLIENT_ID /home/ubuntu/Mediczy/client/.env.production
```

Expected output:
```
VITE_GOOGLE_CLIENT_ID=982376166047-j975co5qc5enqhcesggbsee3obnj7tqa.apps.googleusercontent.com
```

### ✅ Verification
The Client IDs should match exactly (including `.apps.googleusercontent.com` at the end)

---

## ✅ STEP 5: Allow Popups in Browser

### 5.1 For Chrome/Edge
1. Open your browser
2. Go to: `https://mediqzy.com`
3. Look at the address bar (top)
4. You might see a popup blocked icon (🚫 or crossed-out window)
5. Click the icon
6. Select **"Always allow popups from mediqzy.com"**
7. Click **Done**

### 5.2 For Firefox
1. Open Firefox
2. Go to: `https://mediqzy.com`
3. Look for popup notification at the top
4. Click **Options**
5. Select **"Allow popups for mediqzy.com"**

### 5.3 For Safari
1. Open Safari → Preferences
2. Go to **Websites** tab
3. Select **Pop-up Windows** on the left
4. Find `mediqzy.com` in the list
5. Change dropdown to **"Allow"**

### 5.4 Pre-emptive Setup (Recommended)
Before testing, manually configure:

**Chrome/Edge:**
1. Open: `chrome://settings/content/popups` (or `edge://settings/content/popups`)
2. Click **Add** next to "Allowed to send pop-ups and use redirects"
3. Enter: `https://mediqzy.com`
4. Click **Add**

**Firefox:**
1. Open: `about:preferences#privacy`
2. Scroll to **Permissions** section
3. Click **Exceptions...** next to "Block pop-up windows"
4. Enter: `https://mediqzy.com`
5. Click **Allow** then **Save Changes**

---

## 🧪 TESTING YOUR CONFIGURATION

### Option 1: Use Test Tool (Recommended)
1. Open: https://mediqzy.com/test-google-fit-config.html
2. Check all boxes in the checklist
3. Click **"Test Google Fit Connection"** button
4. Watch for success or error messages

### Option 2: Test in Production App
1. Go to: https://mediqzy.com
2. Log into your account
3. Navigate to **Google Fit Dashboard** or **Health Tracker**
4. Click **"Connect Google Fit"** button
5. A Google OAuth popup should appear

### Expected Success Flow:
```
1. ✅ Popup opens (not blocked)
2. ✅ Shows Google sign-in page
3. ✅ Shows "Mediczy Healthcare Platform" app name
4. ✅ Lists 5 permissions:
   - View your physical activity data
   - View your heart rate data
   - View your sleep data
   - View body measurements
   - View your location data
5. ✅ Click "Allow" button
6. ✅ Popup closes automatically
7. ✅ Dashboard starts showing fitness data
```

---

## 🔧 TROUBLESHOOTING

### Error: "invalid_client"
**What you see:** Red error with "Error 401: invalid_client"

**Cause:** Client ID mismatch or doesn't exist

**Fix:**
1. Go back to [Step 4](#step-4-verify-oauth-client-id-matches)
2. Compare Client IDs character by character
3. Make sure you copied the entire ID including `.apps.googleusercontent.com`

---

### Error: "redirect_uri_mismatch"
**What you see:** "Error 400: redirect_uri_mismatch"

**Cause:** Redirect URIs don't match exactly

**Fix:**
1. Go back to [Step 3](#step-3-add-authorized-redirect-uris)
2. Check for these common mistakes:
   - ❌ `https://mediqzy.com/` (has trailing slash)
   - ✅ `https://mediqzy.com` (correct)
   - ❌ `http://mediqzy.com` (wrong protocol for production)
   - ✅ `https://mediqzy.com` (correct protocol)
3. Remove any incorrect URIs
4. Add the correct ones
5. Click SAVE
6. Wait 1-2 minutes for changes to take effect

---

### Error: "access_denied"
**What you see:** "Error 403: access_denied"

**Cause:** Scopes not configured OR user clicked "Deny"

**Fix:**
1. If you clicked "Deny", just try connecting again
2. If error persists, go back to [Step 1](#step-1-add-all-5-fitness-scopes-to-consent-screen)
3. Verify all 5 scopes are present
4. Make sure OAuth consent screen is published (not in Draft)

---

### Popup is Blocked
**What you see:** No popup appears, or message says "Popup blocked"

**Cause:** Browser is blocking popups

**Fix:**
1. Go back to [Step 5](#step-5-allow-popups-in-browser)
2. Follow browser-specific instructions
3. Refresh the page
4. Try connecting again

---

### API Not Enabled Error
**What you see:** "Fitness API has not been used in project mediczy-624ed"

**Cause:** Google Fitness API not enabled

**Fix:**
1. Go to: https://console.cloud.google.com/apis/library/fitness.googleapis.com?project=mediczy-624ed
2. Click **ENABLE** button
3. Wait for confirmation
4. Try connecting again after 1-2 minutes

---

## 📋 FINAL CHECKLIST

Before declaring success, verify ALL of these:

- [ ] **Step 1 Complete:** 5 scopes visible in OAuth consent screen
- [ ] **Step 2 Complete:** 2 JavaScript origins added (localhost + production)
- [ ] **Step 3 Complete:** 2 redirect URIs added (localhost + production)
- [ ] **Step 4 Complete:** Client IDs match in Google Cloud and .env file
- [ ] **Step 5 Complete:** Popups allowed for mediqzy.com
- [ ] **Testing:** OAuth popup opens successfully
- [ ] **Testing:** Shows "Mediczy Healthcare Platform"
- [ ] **Testing:** Lists all 5 fitness permissions
- [ ] **Testing:** Can click "Allow" and popup closes
- [ ] **Testing:** Dashboard shows "Connected" status

---

## 🎉 SUCCESS INDICATORS

You'll know everything is working when:

1. ✅ Click "Connect Google Fit" → Popup opens immediately
2. ✅ Popup shows your app name: "Mediczy Healthcare Platform"
3. ✅ Permission list shows 5 items (activity, heart rate, sleep, body, location)
4. ✅ Click "Allow" → Popup closes within 2 seconds
5. ✅ Dashboard shows: "Google Fit Connected ✓"
6. ✅ Fitness data starts appearing in the dashboard
7. ✅ No error messages in browser console (F12)

---

## 📞 Need Help?

If you're still stuck after following all steps:

1. **Check browser console** (Press F12, go to Console tab)
2. **Copy the exact error message**
3. **Use the test tool**: https://mediqzy.com/test-google-fit-config.html
4. **Screenshot** what you see in Google Cloud Console
5. **Compare** with the screenshots/examples in this guide

---

**Last Updated:** December 10, 2025
**Configuration Files:** Already updated and deployed ✅
**Status:** Ready for Google Cloud Console configuration

