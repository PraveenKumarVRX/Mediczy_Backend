# OAuth 2.0 SSO Server Implementation for Rocket.Chat Integration

## Overview

This implementation provides a custom OAuth 2.0 server that enables Rocket.Chat to authenticate users via Mediqzy's PostgreSQL database without direct database sync. The architecture follows these principles:

- **Single Source of Truth**: PostgreSQL (Mediqzy core user database)
- **MongoDB (Internal)**: Rocket.Chat maintains user profiles internally
- **No DB Sync Required**: Users are auto-created in Rocket.Chat on first OAuth login
- **Security**: JWT tokens, short-lived auth codes, HTTPS-only in production

## Files Created/Modified

### New Files

1. **`/server/db/oauth-clients.js`** (101 lines)
   - Centralized OAuth client configuration
   - Stores Rocket.Chat client credentials (client_id, client_secret)
   - Validates client credentials and redirect URIs
   - Manages allowed scopes

2. **`/server/services/oauth-token.service.js`** (168+ lines)
   - OAuth token lifecycle management
   - Generates short-lived authorization codes (10 min TTL)
   - Exchanges codes for JWT access tokens (1 hour TTL)
   - Validates token authenticity
   - Uses Redis for ephemeral auth code storage

3. **`/server/routes/oauth.route.js`** (350+ lines)
   - Three core OAuth endpoints
   - Two optional metadata endpoints (OpenID Connect compliant)

### Modified Files

1. **`/server/app.js`**
   - Registered OAuth routes at `/oauth/*` path
   - Routes accessible at both `/api/auth/*` and `/oauth/*`

2. **`.env`**
   - Added OAuth configuration variables
   - Set JWT_SECRET (already existed)
   - Configured Rocket.Chat client credentials

## OAuth Server Endpoints

### 1. Authorization Endpoint (Step 1 - User Authorization)

**Endpoint**: `GET /oauth/authorize`

**Purpose**: User login/authorization - redirects to consent page, then issues auth code

**Query Parameters**:
- `client_id` (required): OAuth client ID (e.g., "rocketchat")
- `redirect_uri` (required): Where to redirect after authorization
- `response_type` (required): Must be "code"
- `scope` (optional): Space-separated scopes (default: "openid email profile")
- `state` (recommended): CSRF protection token

**Example Request**:
```
GET /oauth/authorize?
  client_id=rocketchat&
  redirect_uri=http://localhost:3100/_oauth/mediqzy&
  response_type=code&
  scope=openid%20email%20profile&
  state=abc123xyz
```

**Requirements**:
- User must be authenticated (redirects to login if not)
- Client must be registered in oauth-clients.js
- Redirect URI must match registered URI for client

**Response on Success**:
- 302 Redirect to `redirect_uri?code=AUTH_CODE&state=abc123xyz`
- Auth code expires in 10 minutes
- Auth code is single-use

**Response on Failure**:
- 400: Invalid request parameters
- 401: Unknown client
- 403: User not authenticated

### 2. Token Endpoint (Step 2 - Code to Token Exchange)

**Endpoint**: `POST /oauth/token`

**Purpose**: Exchange authorization code for JWT access token

**Required Parameters** (form-urlencoded):
- `grant_type`: Must be "authorization_code"
- `code`: Authorization code from /authorize
- `redirect_uri`: Must match original redirect_uri
- `client_id`: OAuth client ID
- `client_secret`: OAuth client secret (for server-to-server auth)

**Example Request**:
```bash
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&
       code=ABC123XYZ&
       redirect_uri=http://localhost:3100/_oauth/mediqzy&
       client_id=rocketchat&
       client_secret=your-secret-key"
```

**Response on Success** (JSON):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid email profile"
}
```

**Response on Failure**:
- 400: Parameter validation failed
- 401: Client authentication failed
- 400: Code expired or invalid

### 3. Userinfo Endpoint (Step 3 - Fetch User Profile)

**Endpoint**: `GET /oauth/userinfo`

**Purpose**: Return authenticated user profile from Postgres

**Required Header**:
```
Authorization: Bearer <access_token>
```

**Example Request**:
```bash
curl -H "Authorization: Bearer eyJhbGci..." \
  http://localhost:3000/oauth/userinfo
```

**Response on Success** (JSON - OpenID Connect format):
```json
{
  "sub": "user_123",
  "email": "doctor@mediqzy.com",
  "email_verified": false,
  "username": "doc_username",
  "name": "Dr. John Doe",
  "given_name": "John",
  "family_name": "Doe",
  "phone_number": "+1234567890",
  "updated_at": 1771090800
}
```

**Response on Failure**:
- 401: Missing or invalid token
- 401: Token expired
- 404: User not found

### 4. Metadata Endpoints (Optional)

These endpoints help OAuth clients auto-discover the server configuration.

**OpenID Connect Metadata**:
```
GET /oauth/.well-known/openid-configuration
```

**OAuth 2.0 Server Metadata**:
```
GET /oauth/.well-known/oauth-authorization-server
```

## Environment Configuration

**Required `.env` variables**:

```env
# OAuth Server Configuration
JWT_SECRET=ad7a94954fc3bdb4adce9a23b516778b...
APP_BASE_URL=http://localhost:8000
OAUTH_ROCKETCHAT_CLIENT_ID=rocketchat-client-id
OAUTH_ROCKETCHAT_CLIENT_SECRET=rocketchat-client-secret-secure-key
ROCKETCHAT_OAUTH_REDIRECT_URI=http://localhost:3100/_oauth/mediqzy

# Redis (for auth code storage)
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL (user data source)
DB_HOST=localhost
DB_NAME=mediczydb
DB_USER=mediczy_user
```

## Authentication Flow

### Step 1: User Initiates Login

```
┌─────────────────┐         ┌──────────────────┐
│ Rocket.Chat     │    1    │  OAuth Authorize │
│ (Browser)       │────────→│  Endpoint        │
│                 │         │  GET /authorize  │
└─────────────────┘         └──────────────────┘
        ▲                             │
        │                             │
        │    3. Redirect with code    │
        └─────────────────────────────┘
```

- User clicks "Login with Mediqzy"
- Redirected to `/oauth/authorize` with client_id, redirect_uri, scope, state
- User logs in (authUser middleware checks session)
- System generates auth code and redirects back to Rocket.Chat with code

### Step 2: Rocket.Chat Backend Exchanges Code

```
┌──────────────┐         ┌────────────────┐
│ Rocket.Chat  │    2    │  OAuth Token   │
│ Backend      │────────→│  Endpoint      │
│              │         │  POST /token   │
└──────────────┘         └────────────────┘
     ▲                            │
     │                            │
     │   Returns JWT Token        │
     └────────────────────────────┘
```

- Rocket.Chat server-to-server calls `/token` with code and client_secret
- System validates code, client credentials, and redirect_uri
- System generates JWT access token and returns

### Step 3: Fetch User Profile

```
┌──────────────┐         ┌───────────────┐
│ Rocket.Chat  │    4    │  OAuth        │
│ Backend      │────────→│  Userinfo     │
│              │         │  GET /user    │
└──────────────┘         └───────────────┘
     ▲                            │
     │                            │
     │  Returns User Profile      │
     └────────────────────────────┘
```

- Rocket.Chat server calls `/userinfo` with Bearer token
- System validates JWT, queries Postgres for user profile
- System returns user data (creates user in RC MongoDB if first login)

## Testing the OAuth Server

### Prerequisites

```bash
# 1. Backend running on localhost:3000
npm run dev:watch

# 2. Redis running (for auth codes)
# 3. PostgreSQL running (for user data)
# 4. Rocket.Chat running on localhost:3100
```

### Test 1: Metadata Endpoint (Public)

```bash
curl http://localhost:3000/oauth/.well-known/openid-configuration
```

Expected: JSON with authorization_endpoint, token_endpoint, userinfo_endpoint URLs

### Test 2: Authorization Endpoint (With Auth)

```bash
# First obtain a valid session token (login as user)
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediqzy.com","password":"password"}'

# Extract JWT token from response, then:
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  "http://localhost:3000/oauth/authorize?
    client_id=rocketchat&
    redirect_uri=http://localhost:3100/_oauth/mediqzy&
    response_type=code&
    scope=openid%20email%20profile&
    state=test123"
```

Expected: 302 Redirect to `http://localhost:3100/_oauth/mediqzy?code=...&state=test123`

### Test 3: Token Exchange

```bash
# Using auth code from Test 2
curl -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&
       code=<AUTH_CODE_FROM_TEST_2>&
       redirect_uri=http://localhost:3100/_oauth/mediqzy&
       client_id=rocketchat&
       client_secret=rocketchat-client-secret-secure-key"
```

Expected: JSON with access_token, token_type:Bearer, expires_in:3600

### Test 4: Userinfo Endpoint

```bash
# Using access_token from Test 3
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
  http://localhost:3000/oauth/userinfo
```

Expected: JSON with user profile (sub, email, username, name, etc.)

## Configuring Rocket.Chat OAuth

### Step 1: Add Custom OAuth in Rocket.Chat Admin

1. Navigate to: Administration → Settings → OAuth
2. Click "Custom Registration"
3. Enter these settings:

| Setting | Value |
|---------|-------|
| Enabled | Yes |
| Application Name | Mediqzy |
| Authorize URL | `http://localhost:3000/oauth/authorize` |
| Access Token URL | `http://localhost:3000/oauth/token` |
| API URL | `http://localhost:3000/oauth/userinfo` |
| Authorize Path | (keep empty) |
| Token Path | (keep empty) |
| Identity Path | (keep empty) |
| Scope | `openid email profile` |
| Param Name for username | `username` |
| Param Name for id | `sub` |
| Param Name for email | `email` |
| Username Field | `username` |
| Email Field | `email` |
| Display Name Field | `name` |
| Client ID | `rocketchat-client-id` |
| Client Secret | `rocketchat-client-secret-secure-key` |

### Step 2: Test OAuth Login

1. Logout of Rocket.Chat
2. On login page, you should see "Login with Mediqzy" button
3. Click it → redirects to Mediqzy login
4. Login with credentials → auth code generated
5. Redirected back to Rocket.Chat with token
6. User auto-created/logged in

## Security Considerations

### 1. Authorization Code Security

- ✅ Short timeout (10 minutes)
- ✅ Single-use only (deleted after exchange)
- ✅ Provider validation (client_id must match)
- ✅ Redirect URI validation (prevents code injection)
- ✅ Cryptographically random (32 chars)
- ✅ Redis-backed (ephemeral, not persistent)

### 2. Token Security

- ✅ JWT with HMAC-SHA256 signature
- ✅ Short expiry (1 hour)
- ✅ Claims validation (sub, client_id, scope)
- ✅ No personal data in token (only sub ID)
- ❌ No refresh token (users must re-login)

### 3. Transport Security

- ⚠️ HTTP in dev (should be HTTPS at scope level per environment)
- ✅ Client secret validation on /token (server-to-server only)
- ✅ Bearer token in Authorization header (not in URL)
- ✅ No password transmitted via OAuth
- ✅ State parameter (prevents CSRF)

### 4. Production Hardening Required

```
BEFORE GOING TO PRODUCTION:

1. ☐ Enable HTTPS on all OAuth endpoints
2. ☐ Add rate limiting to /token endpoint
3. ☐ Implement PKCE for mobile/browser flows
4. ☐ Add logout/token revocation endpoint
5. ☐ Implement audit logging for all OAuth events
6. ☐ Configure CORS properly
7. ☐ Add refresh token support (optional)
8. ☐ Implement account linking/migration strategy
9. ☐ Test with various OAuth clients
10. ☐ Security audit by independent team
```

## Troubleshooting

### Issue: "Unknown client" on /authorize

**Cause**: client_id not registered in oauth-clients.js

**Solution**: 
```javascript
// server/db/oauth-clients.js
export const validateOAuthClient = (client_id, client_secret) => {
  const oauthClients = {
    // ... add your client here
    myapp: {
      client_id: 'myapp',
      client_secret: 'secret123',
      redirect_uris: ['https://myapp.com/callback'],
      scope: ['openid', 'email', 'profile'],
    }
  };
  // ...
};
```

### Issue: "Redirect URI not allowed"

**Cause**: redirect_uri doesn't match registered URIs

**Solution**: Update oauth-clients.js to include your redirect_uri in the array

### Issue: "Authorization code expired"

**Cause**: More than 10 minutes between /authorize and /token calls

**Solution**: Auth codes are short-lived. Implement retries with exponential backoff

### Issue: "Invalid token" on /userinfo

**Cause**:
1. Token expired (more than 1 hour old)
2. Token signature invalid
3. JWT_SECRET changed

**Solution**: Get a fresh token by repeating the flow

## Next Steps

### Immediate (Phase 1)

- [X] Create OAuth clients registry
- [X] Implement token service
- [X] Create OAuth routes
- [X] Register routes in app
- [ ] Test locally with curl
- [ ] Fix proxy routing if needed

### Short-term (Phase 2)

- [ ] Configure Rocket.Chat OAuth settings
- [ ] Test end-to-end flow
- [ ] Implement logout/token revocation
- [ ] Add refresh token support
- [ ] Create admin dashboard for user mapping

### Medium-term (Phase 3)

- [ ] PKCE support (for public clients)
- [ ] Account linking API
- [ ] OAuth token management UI
- [ ] Audit logging dashboard
- [ ] Rate limiting & abuse prevention

### Production (Phase 4)

- [ ] HTTPS/SSL setup
- [ ] Security audit
- [ ] Performance testing (token generation at scale)
- [ ] Backup/recovery strategy for Redis
- [ ] Monitoring & alerting

## Files Structure

```
/server
├── /db
│   └── oauth-clients.js          # Client registry & validators
├── /services
│   └── oauth-token.service.js    # Token lifecycle management
├── /routes
│   └── oauth.route.js            # OAuth endpoints
├── app.js                        # Route registration (modified)
└── .env                          # OAuth configuration (modified)
```

## Support & Documentation

- OAuth 2.0 Spec: https://tools.ietf.org/html/rfc6749
- OpenID Connect: https://openid.net/connect/
- JWT: https://tools.ietf.org/html/rfc7519
- Rocket.Chat OAuth Docs: https://docs.rocket.chat/authentication/oauth

---

**Last Updated**: 2026-02-14
**Status**: ✅ Implementation Complete, 🟠 Testing In Progress
