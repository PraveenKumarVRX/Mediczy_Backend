# Mediqzy API v1 - Quick Start Deployment Guide

Complete setup guide to get Mediqzy API v1 running in under 10 minutes.

---

## Prerequisites

- ✅ PostgreSQL 12+ running
- ✅ Node.js 14+ installed
- ✅ Existing Mediqzy Express.js app
- ✅ LiveKit configured (for video)

---

## Step 1: Run Database Migration (2 minutes)

```bash
# Navigate to workspace
cd /workspaces/Mediczy

# Run migration
psql -U mediczy_helper -d mediczy_ai -f server/migrations/20260206_create_api_v1_schemas.sql

# Verify tables created
psql -U mediczy_helper -d mediczy_ai -c "\dt api_*"

# Expected output: 18+ tables starting with api_*
```

---

## Step 2: Configure Environment Variables (1 minute)

Add to your `.env` file:

```bash
# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_REFRESH_SECRET=your_super_secret_refresh_key_change_this_too

# Database (already configured)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mediczy_ai
DB_USER=mediczy_helper
DB_PASSWORD=your_existing_password

# LiveKit (already configured)
LIVEKIT_API_KEY=your_existing_livekit_key
LIVEKIT_API_SECRET=your_existing_livekit_secret
LIVEKIT_WS_URL=wss://mediczy-livekit.com

# Optional: OIDC Provider Keys
AZURE_AD_TENANT_ID=your_tenant_id
AZURE_AD_CLIENT_ID=your_client_id
GOOGLE_CLIENT_ID=your_google_client_id
OKTA_DOMAIN=your_okta_domain.okta.com
```

---

## Step 3: Integrate Routes into Your App (3 minutes)

### Option A: Minimal Integration

Edit your main Express app file (e.g., `server/app.js` or `server/index.js`):

```javascript
const express = require('express');
const apiV1Routes = require('./routes/api-v1-index');

const app = express();

// Existing middleware
app.use(express.json());

// Add API v1 routes
app.use('/v1', apiV1Routes);

// Your existing routes
// ... rest of your app

app.listen(5000);
```

### Option B: Full Integration with Logging

```javascript
const express = require('express');
const apiV1Routes = require('./routes/api-v1-index');

const app = express();

app.use(express.json());

// Request logging for API v1
app.use('/v1', (req, res, next) => {
  console.log(`[API v1] ${req.method} ${req.path}`);
  next();
});

// Mount API v1
app.use('/v1', apiV1Routes);

// Error handler
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Mediqzy API v1 running on port ${PORT}`);
});
```

---

## Step 4: Start Your Server (1 minute)

```bash
# If using PM2 (recommended)
pm2 restart ecosystem.config.js

# Or using node directly
node server/index.js

# Or using npm
npm start
```

---

## Step 5: Test API (3 minutes)

### Test 1: Health Check

```bash
curl http://localhost:5000/v1/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-06T10:30:00.000Z"
}
```

### Test 2: API Info

```bash
curl http://localhost:5000/v1/
```

**Expected Response:**
```json
{
  "name": "Mediqzy API",
  "version": "1.0.0",
  "description": "Multi-tenant wellness platform API for health insurance stakeholders",
  "endpoints": {
    "auth": "/v1/auth",
    "users": "/v1/{tenant-id}/users",
    "doctors": "/v1/{tenant-id}/doctors",
    "appointments": "/v1/{tenant-id}/appointments",
    "video": "/v1/{tenant-id}/video"
  }
}
```

### Test 3: Token Exchange (with mock token)

You'll need a real OIDC token from Azure AD/Google/Okta for this to work in production.

For **testing purposes only**, you can temporarily modify the middleware to accept a test token:

```bash
curl -X POST http://localhost:5000/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "provider_token": "test-token",
    "provider": "azure_ad",
    "external_user_id": "test-user-001",
    "role": "patient",
    "tenant_id": "clinic-demo"
  }'
```

---

## Step 6: Import Postman Collection (Optional)

1. Open Postman
2. Click **Import**
3. Select file: `/workspaces/Mediczy/postman/mediqzy-api-v1.postman_collection.json`
4. Import environment: `/workspaces/Mediczy/postman/environments/mediqzy-sandbox.postman_environment.json`
5. Run requests from the collection

---

## Step 7: Use SDK in Your App (Optional)

### Install SDK

```bash
cd your-frontend-app
npm install /workspaces/Mediczy/sdk/javascript
```

### Initialize Client

```javascript
import { MediqzyClient } from '@mediqzy/api-client';

const client = new MediqzyClient({
  baseUrl: 'http://localhost:5000/v1',
  tenantId: 'clinic-demo',
  onTokenRefresh: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  }
});

// Authenticate
await client.exchangeToken({
  providerToken: azureADToken,
  provider: 'azure_ad',
  externalUserId: 'user-12345',
  role: 'patient'
});

// Use API
const doctors = await client.searchDoctors({
  specialty: 'Cardiology',
  city: 'Mumbai'
});
```

---

## Troubleshooting

### Issue: "Cannot find module './routes/api-v1-index'"

**Solution:**
```bash
# Verify route files exist
ls -la server/routes/api-v1-*

# Should see:
# api-v1-auth.js
# api-v1-users.js
# api-v1-doctors.js
# api-v1-appointments.js
# api-v1-video.js
# api-v1-index.js
```

### Issue: Database connection error

**Solution:**
```bash
# Test database connection
psql -U mediczy_helper -d mediczy_ai -c "SELECT 1;"

# Check .env variables
echo $DB_HOST
echo $DB_NAME
echo $DB_USER
```

### Issue: JWT token errors

**Solution:**
```bash
# Generate secure JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Update .env with generated secrets
JWT_SECRET=<generated_secret>
JWT_REFRESH_SECRET=<generated_secret>
```

### Issue: OIDC validation failures

**Solution:**
For development/testing, you can temporarily bypass OIDC validation:

```javascript
// server/middleware/api-auth.js
// In TokenExchangeService.validateExternalToken()

// Add this at the top (REMOVE IN PRODUCTION):
if (process.env.NODE_ENV === 'development') {
  return {
    sub: 'test-user',
    email: 'test@example.com',
    name: 'Test User'
  };
}
```

**⚠️ IMPORTANT:** Remove this bypass before deploying to production!

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Change JWT secrets to cryptographically secure values
- [ ] Configure real OIDC provider credentials (Azure AD/Google/Okta)
- [ ] Enable HTTPS/TLS (use Nginx reverse proxy)
- [ ] Set up Redis for rate limiting (replace in-memory implementation)
- [ ] Configure webhook signature validation
- [ ] Enable audit logging to persistent storage
- [ ] Set up monitoring (API response times, error rates)
- [ ] Configure backup for PostgreSQL database
- [ ] Review and update rate limits per tenant tier
- [ ] Load test with expected traffic
- [ ] Set up API gateway (Kong/AWS API Gateway)
- [ ] Configure CORS for allowed origins
- [ ] Enable request/response logging
- [ ] Set up alerting for API errors
- [ ] Document API versioning strategy

---

## Next Steps

1. ✅ **Test Core Flows**
   - User registration → Doctor search → Appointment booking → Video call

2. ✅ **Integrate with Frontend**
   - Import SDK into React Native app
   - Implement authentication flow
   - Build booking UI

3. ✅ **Set Up Monitoring**
   - Application Performance Monitoring (APM)
   - Error tracking (Sentry/Rollbar)
   - API analytics

4. ✅ **Deploy Remaining Modules**
   - Chat API
   - Lab booking API
   - Pharmacy API
   - Homecare API
   - Wellness/HRA API

---

## Support

- 📧 Email: api-support@mediqzy.com
- 📚 Docs: See MEDIQZY_API_V1_IMPLEMENTATION_SUMMARY.md
- 🔧 Issues: Check logs at `pm2 logs` or `server/logs/`

---

**Deployment Time:** ~10 minutes  
**Difficulty:** Easy  
**Status:** ✅ Ready for Testing
