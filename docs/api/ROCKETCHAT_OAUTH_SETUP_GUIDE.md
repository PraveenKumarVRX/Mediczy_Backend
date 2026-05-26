# Rocket.Chat OAuth Configuration - Quick Reference

**Status**: ✅ OAuth Server is Running and Tested  
**Date**: February 14, 2026

## 🚀 Quick Start - Manual Configuration

### Option 1: Automated Configuration (Recommended)

```bash
# Run automated configuration script
cd /home/ubuntu/Mediczy
node configure-rocketchat-oauth.js
```

This script will:
- Authenticate with Rocket.Chat admin account
- Update all OAuth settings
- Test the connection
- Provide next steps

### Option 2: Manual Configuration (If automated fails)

#### Step 1: Access Rocket.Chat Admin Panel

1. Navigate to: `http://your-rocketchat-url/admin`
2. Log in with admin credentials
3. Go to: **Administration** → **Settings** → **OAuth**

#### Step 2: Configure Custom OAuth Provider

Look for section: **Custom OAuth** (or similar OAuth provider settings)

Fill in these exact values:

| Field | Value |
|-------|-------|
| **Enabled** | ✓ Yes |
| **Application Name** | Mediqzy |
| **Authorize URL** | http://localhost:8000/oauth/authorize |
| **Access Token URL** | http://localhost:8000/oauth/token |
| **Identity URL** | http://localhost:8000/oauth/userinfo |
| **Client ID** | rocketchat-client-id |
| **Client Secret** | rocketchat-client-secret-secure-key-12345 |
| **Scope** | openid email profile |
| **Username Field** | username |
| **Email Field** | email |
| **Name Field** | name |
| **ID Field** | sub |

#### Step 3: Advanced Settings (Optional)

| Field | Value | Notes |
|-------|-------|-------|
| **Display Name** | Login with Mediqzy | Button text |
| **Button Color** | #0052CC | Optional - brand color |
| **Authorize Path** | (leave empty) | |
| **Token Path** | (leave empty) | |
| **Identity Path** | (leave empty) | |

#### Step 4: Test Connection

1. Click **Test OAuth** button in Rocket.Chat
2. Should show: "OAuth authentication successful"
3. If error, check output below

#### Step 5: Save and Restart

1. Click **Save Changes**
2. Optionally restart Rocket.Chat daemon: `systemctl restart rocketchat` or `docker restart rocketchat`

## ✅ Verification Checklist

After configuration, verify:

- [ ] Rocket.Chat successfully saved OAuth settings
- [ ] Logout of Rocket.Chat completely
- [ ] See "Login with Mediqzy" button on login page
- [ ] Click button and get redirected to Mediqzy login
- [ ] After login, redirected back to Rocket.Chat
- [ ] User auto-created in Rocket.Chat
- [ ] Can send/receive messages

## 🔍 Testing the OAuth Flow

### Test 1: Verify OAuth Server is Running

```bash
# Should return OAuth endpoints
curl http://localhost:8000/oauth/.well-known/oauth-authorization-server | jq .
```

**Expected output:**
```json
{
  "issuer": "http://localhost:8000",
  "authorization_endpoint": "http://localhost:8000/oauth/authorize",
  "token_endpoint": "http://localhost:8000/oauth/token",
  "userinfo_endpoint": "http://localhost:8000/oauth/userinfo"
}
```

### Test 2: Run OAuth Flow Tests

```bash
# Run comprehensive test suite
cd /home/ubuntu/Mediczy
node oauth-flow-test.js
```

**Expected:** 9/10 tests should pass

### Test 3: Manual Flow Test

```bash
# 1. Get authorization code
# Open in browser: http://localhost:8000/oauth/authorize?client_id=rocketchat-client-id&response_type=code&redirect_uri=http://localhost:3100/_oauth/mediqzy&scope=openid%20email%20profile&state=random123

# 2. After login, you'll be redirected with code in URL
# Example: http://localhost:3100/_oauth/mediqzy?code=ABC123&state=random123

# 3. Exchange code for token (from backend)
curl -X POST http://localhost:8000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=ABC123&client_id=rocketchat-client-id&client_secret=rocketchat-client-secret-secure-key-12345&redirect_uri=http://localhost:3100/_oauth/mediqzy"

# 4. Should receive access token in response
```

## 🐛 Troubleshooting

### Issue: OAuth button not appearing

**Cause 1**: Settings not saved or wrong URL

**Solution**:
```bash
# Verify settings in Rocket.Chat admin panel
# Check Rocket.Chat logs
tail -100 /var/log/rocketchat/rocketchat.log | grep -i oauth

# Restart Rocket.Chat
systemctl restart rocketchat
```

### Issue: "Invalid redirect URI"

**Cause**: Redirect URI doesn't match

**Solution**:
- Verify: `http://localhost:3100/_oauth/mediqzy` is correct
- Check `.env`: `ROCKETCHAT_OAUTH_REDIRECT_URI`
- Must match exactly in Rocket.Chat OAuth settings

### Issue: "Invalid client credentials"

**Cause**: Wrong client ID or secret

**Solution**:
- Verify values match `.env`:
  - `OAUTH_ROCKETCHAT_CLIENT_ID=rocketchat-client-id`
  - `OAUTH_ROCKETCHAT_CLIENT_SECRET=rocketchat-client-secret-secure-key-12345`
- Check Rocket.Chat settings exactly match

### Issue: Login redirects to blank page

**Cause**: User info endpoint failing

**Solution**:
```bash
# Test userinfo endpoint
curl -H "Authorization: Bearer <your-token>" \
  http://localhost:8000/oauth/userinfo

# Check logs
tail -100 /home/ubuntu/Mediczy/logs/server-out.log | grep -i userinfo
```

### Issue: User not auto-created in Rocket.Chat

**Cause 1**: Scope too limited
- Solution: Ensure scope includes `openid email profile`

**Cause 2**: User info mapping wrong
- Solution: Verify field names match:
  - Username: `username` (not `user_name`)
  - Email: `email` (not `mail`)
  - Name: `name` (not `display_name`)

**Cause 3**: Email validation
- Solution: Ensure OAuth returns valid email address

## 📝 Configuration Files Reference

### Main Configuration
- **OAuth Server**: `/home/ubuntu/Mediczy/server/routes/oauth.route.js`
- **Token Service**: `/home/ubuntu/Mediczy/server/services/oauth-token.service.js`
- **Client Registry**: `/home/ubuntu/Mediczy/server/db/oauth-clients.js`
- **Environment**: `/home/ubuntu/Mediczy/.env`

### Test Files
- **OAuth Flow Test**: `/home/ubuntu/Mediczy/oauth-flow-test.js`
- **Rocket.Chat Config Script**: `/home/ubuntu/Mediczy/configure-rocketchat-oauth.js`

### Documentation
- **Full API Docs**: `/home/ubuntu/Mediczy/OAUTH_SSO_IMPLEMENTATION.md`
- **Deployment Checklist**: `/home/ubuntu/Mediczy/OAUTH_DEPLOYMENT_CHECKLIST.md`
- **RC Configuration Guide**: `/home/ubuntu/Mediczy/ROCKETCHAT_OAUTH_CONFIGURATION.md`
- **Implementation Summary**: `/home/ubuntu/Mediczy/OAUTH_IMPLEMENTATION_SUMMARY.md`

## 📊 OAuth Settings Summary

```javascript
// OAuth Server Configuration (Running)
{
  "issuer": "http://localhost:8000",
  "authorization_endpoint": "http://localhost:8000/oauth/authorize",
  "token_endpoint": "http://localhost:8000/oauth/token",
  "userinfo_endpoint": "http://localhost:8000/oauth/userinfo",
  "token_endpoint_auth_methods": ["client_secret_basic", "client_secret_post"],
  "scopes_supported": ["openid", "email", "profile"]
}

// Rocket.Chat OAuth Client (To Configure)
{
  "client_id": "rocketchat-client-id",
  "client_secret": "rocketchat-client-secret-secure-key-12345",
  "authorize_url": "http://localhost:8000/oauth/authorize",
  "token_url": "http://localhost:8000/oauth/token",
  "identity_url": "http://localhost:8000/oauth/userinfo",
  "scope": "openid email profile",
  "redirect_uri": "http://localhost:3100/_oauth/mediqzy"
}
```

## ⏭️ Next Steps

1. Configure Rocket.Chat OAuth (use automated or manual steps above)
2. Test end-to-end OAuth login flow
3. Verify user auto-creation in Rocket.Chat
4. Monitor logs for any errors
5. Deploy to production (follow OAUTH_DEPLOYMENT_CHECKLIST.md)

## 📞 Support

For detailed implementation help, see:
- Full docs: `OAUTH_SSO_IMPLEMENTATION.md` (500+ lines)
- Deployment: `OAUTH_DEPLOYMENT_CHECKLIST.md` (400+ lines)
- Quick start: This guide

For production deployment, follow `OAUTH_DEPLOYMENT_CHECKLIST.md` carefully.

---

**Status**: ✅ OAuth Server Ready for Rocket.Chat Integration  
**Test Results**: 9/10 Tests Passing  
**Last Updated**: February 14, 2026
