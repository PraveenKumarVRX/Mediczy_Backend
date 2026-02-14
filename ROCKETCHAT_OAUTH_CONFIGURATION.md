# Rocket.Chat OAuth Configuration for Mediqzy SSO

## Quick Start - Copy These Settings

After implementation, configure Rocket.Chat with these exact settings:

### Step 1: Access Rocket.Chat Admin Panel

1. Log in as Rocket.Chat administrator
2. Navigate to: **Administration** → **Settings** → **OAuth**
3. Click **Custom OAuth** (or create new if not visible)

### Step 2: Enter OAuth Settings

Copy the exact values below into Rocket.Chat admin panel:

```
ENABLED:  Yes (toggle ON)
```

#### Core OAuth URLs

| Setting | Value |
|---------|-------|
| **Authorize URL** | `http://localhost:8000/oauth/authorize` (dev) or `https://mediqzy.com/oauth/authorize` (prod) |
| **Access Token URL** | `http://localhost:8000/oauth/token` (dev) or `https://mediqzy.com/oauth/token` (prod) |
| **Identity URL** | `http://localhost:8000/oauth/userinfo` (dev) or `https://mediqzy.com/oauth/userinfo` (prod) |

#### Client Credentials

| Setting | Value |
|---------|-------|
| **Client ID** | `rocketchat-client-id` |
| **Client Secret** | `rocketchat-client-secret-secure-key` |

#### Field Mapping

| Setting | Value |
|---------|-------|
| **Scope** | `openid email profile` |
| **Username Field** | `username` |
| **Email Field** | `email` |
| **Name Field** | `name` |
| **ID Field** | `sub` |

#### Optional Settings

| Setting | Value | Notes |
|---------|-------|-------|
| **Display Name** | Mediqzy | Name shown on login button |
| **Button Color** | #0052CC | Brand color (optional) |
| **Button Text** | Login with Mediqzy | Custom button text |
| **Authorize Path** | (leave empty) | |
| **Token Path** | (leave empty) | |
| **Identity Path** | (leave empty) | |

### Step 3: Test Configuration

1. Click **Test OAuth**
2. Should see: "OAuth authentication successful"
3. If error, check logs at `/home/ubuntu/Mediczy/logs/server-out.log`

### Step 4: Save Settings

1. Click **Save Changes**
2. Restart Rocket.Chat (recommended)
3. Logout and verify login button appears

## Visual Configuration Guide

### Complete Settings Screen

```
OAuth - Custom OAuth Configuration
═══════════════════════════════════════════════════════════════

[✓] ENABLED

[+] Custom OAuth - New Custom OAuth Registration

  Application Name: Mediqzy
  ┌─────────────────────────────────────────────────────────┐
  
  Authorize URL (Authorize_url):
  ┌─────────────────────────────────────────────────────────┐
  │ https://mediqzy.com/oauth/authorize                      │
  └─────────────────────────────────────────────────────────┘
  
  Access Token URL (Access_token_url):
  ┌─────────────────────────────────────────────────────────┐
  │ https://mediqzy.com/oauth/token                          │
  └─────────────────────────────────────────────────────────┘
  
  Identity URL (Identity_url):
  ┌─────────────────────────────────────────────────────────┐
  │ https://mediqzy.com/oauth/userinfo                       │
  └─────────────────────────────────────────────────────────┘
  
  Scope (Scope):
  ┌─────────────────────────────────────────────────────────┐
  │ openid email profile                                    │
  └─────────────────────────────────────────────────────────┘
  
  Username Field (Param_name_for_username):
  ┌─────────────────────────────────────────────────────────┐
  │ username                                                │
  └─────────────────────────────────────────────────────────┘
  
  Email Field (Param_name_for_email):
  ┌─────────────────────────────────────────────────────────┐
  │ email                                                   │
  └─────────────────────────────────────────────────────────┘
  
  Name Field (Param_name_for_name):
  ┌─────────────────────────────────────────────────────────┐
  │ name                                                    │
  └─────────────────────────────────────────────────────────┘
  
  ID Field (Param_name_for_id):
  ┌─────────────────────────────────────────────────────────┐
  │ sub                                                     │
  └─────────────────────────────────────────────────────────┘
  
  Client ID (Client_id):
  ┌─────────────────────────────────────────────────────────┐
  │ rocketchat-client-id                                    │
  └─────────────────────────────────────────────────────────┘
  
  Client Secret (Client_secret):
  ┌─────────────────────────────────────────────────────────┐
  │ rocketchat-client-secret-secure-key                     │
  └─────────────────────────────────────────────────────────┘

  [Save Changes] [Test OAuth] [Delete]
```

## Expected Behavior After Configuration

### Login Flow

1. **Logout of Rocket.Chat**
   - See standard login page

2. **Look for OAuth Button**
   - Should see: "Login with Mediqzy" button
   - Or: "Login with [Application Name]" if custom name set

3. **Click OAuth Button**
   - Redirected to: `https://mediqzy.com/oauth/authorize?...`
   - Shown: Mediqzy login page

4. **Login with Mediqzy Credentials**
   - Enter email/password
   - Click login

5. **Consent/Authorization**
   - May see consent screen (depends on scope)
   - User grants permission to Rocket.Chat

6. **Redirect Back to Rocket.Chat**
   - OAuth code exchanged for token
   - User info retrieved from Mediqzy
   - Automatic user creation in Rocket.Chat (if first login)

7. **Logged In**
   - Redirect to Rocket.Chat main page
   - User fully authenticated

### User Auto-Creation

When OAuth user logs in for first time:
- ✅ User object created in Rocket.Chat MongoDB
- ✅ Username: from `username` field
- ✅ Email: from `email` field
- ✅ Display Name: from `name` field
- ✅ Avatar: generated or fetched (if available)

On subsequent logins:
- ✅ User found and logged in
- ✅ No new user created
- ✅ Profile updated if changed in Mediqzy

## Troubleshooting

### Issue: "Invalid OAuth Configuration"

**Cause**: URLs are incorrect or endpoints not responding

**Solution**:
```bash
# Verify endpoints are accessible
curl https://mediqzy.com/oauth/authorize
curl https://mediqzy.com/oauth/token
curl https://mediqzy.com/oauth/userinfo

# Check Mediqzy logs
tail -100 /home/ubuntu/Mediczy/logs/server-out.log | grep -i oauth
```

### Issue: "Login button not appearing"

**Cause**: OAuth not enabled or not saved

**Solution**:
1. Verify ENABLED toggle is ON
2. Click [Save Changes]
3. Clear browser cache
4. Refresh Rocket.Chat page
5. Restart Rocket.Chat if needed: `docker restart rocketchat` or `systemctl restart rocketchat`

### Issue: "Invalid client_id"

**Cause**: client_id doesn't match Mediqzy configuration

**Solution**:
- Verify client_id is exactly: `rocketchat-client-id`
- Check .env in Mediqzy: `OAUTH_ROCKETCHAT_CLIENT_ID=rocketchat-client-id`
- Restart Mediqzy backend if changed

### Issue: "Redirect URI mismatch"

**Cause**: Rock.Chat redirect URI not registered in Mediqzy

**Solution**:
1. Verify redirect URI in Mediqzy `.env`:
   ```
   ROCKETCHAT_OAUTH_REDIRECT_URI=http://localhost:3100/_oauth/mediqzy
   ```
2. For production, update to: `https://rocketchat.mediqzy.com/_oauth/mediqzy`
3. Restart Mediqzy backend

### Issue: "User not found in Mediqzy"

**Cause**: User exists in Rocket.Chat but not in Mediqzy Postgres

**Solution**:
1. Create user in Mediqzy first
2. Then attempt OAuth login
3. User should be auto-created in Rocket.Chat

### Issue: "Token expired immediately"

**Cause**: Token TTL too short or JWT_SECRET mismatch

**Solution**:
```javascript
// Check oauth-token.service.js
const TOKEN_EXPIRY = 3600;  // Should be 3600 (1 hour)

// Verify JWT_SECRET is consistent
# In Mediqzy .env
JWT_SECRET=ad7a94954fc3bdb4adce9a23b516778b...
```

## Testing the Configuration

### Test 1: Metadata Endpoint

```bash
curl http://localhost:8000/oauth/.well-known/openid-configuration
```

Should return:
```json
{
  "issuer": "http://localhost:8000",
  "authorization_endpoint": "http://localhost:8000/oauth/authorize",
  "token_endpoint": "http://localhost:8000/oauth/token",
  "userinfo_endpoint": "http://localhost:8000/oauth/userinfo",
  ...
}
```

### Test 2: Authorization Endpoint

```bash
# Get a valid JWT token from Mediqzy
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediqzy.com","password":"password"}'

# Use token to request auth code
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8000/oauth/authorize?
    client_id=rocketchat&
    redirect_uri=http://localhost:3100/_oauth/mediqzy&
    response_type=code&
    state=test123"
```

Should redirect (302) to:
```
http://localhost:3100/_oauth/mediqzy?code=ABC123...&state=test123
```

### Test 3: Full Flow with curl

```bash
#!/bin/bash

# 1. Get auth code (see Test 2 above)
AUTH_CODE="..."

# 2. Exchange code for token
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:8000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&
       code=$AUTH_CODE&
       redirect_uri=http://localhost:3100/_oauth/mediqzy&
       client_id=rocketchat&
       client_secret=rocketchat-client-secret-secure-key")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')
echo "Access Token: $ACCESS_TOKEN"

# 3. Fetch user profile
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:8000/oauth/userinfo | jq .
```

Expected output:
```json
{
  "sub": "12345",
  "email": "user@mediqzy.com",
  "username": "john_doe",
  "name": "John Doe",
  ...
}
```

## Production Configuration Template

For production deployment, update settings:

```ini
# Replace in Rocket.Chat OAuth settings

# Domain
APP_BASE_URL=https://api.mediqzy.com
ROCKETCHAT_OAUTH_REDIRECT_URI=https://chat.mediqzy.com/_oauth/mediqzy

Authorize URL       = https://api.mediqzy.com/oauth/authorize
Access Token URL    = https://api.mediqzy.com/oauth/token
Identity URL        = https://api.mediqzy.com/oauth/userinfo

Client ID           = rc-prod-<random-id>
Client Secret       = <64-char-secure-random-secret>
```

## Related Documents

- **Implementation Guide**: `OAUTH_SSO_IMPLEMENTATION.md`
- **Deployment Checklist**: `OAUTH_DEPLOYMENT_CHECKLIST.md`
- **Implementation Summary**: `OAUTH_IMPLEMENTATION_SUMMARY.md`

---

**Last Updated**: 2026-02-14
**Status**: Ready for Configuration
**Next Step**: Enter these settings in Rocket.Chat admin panel
