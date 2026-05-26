# ✅ API v1 Integration Complete - Testing Guide

**Status:** Routes integrated ✅ | Database migration ready ✅ | Awaiting DB connection & testing

---

## What's Been Done

✅ **Converted all routes to ES modules**  
✅ **Integrated API v1 routes into Express app** (`/v1/*` endpoints)  
✅ **Created database migration script** (`run-migration.js`)  
✅ **Generated environment configuration** (`.env.api-v1`)

---

## Next Steps to Complete Setup

### Step 1: Configure Database Connection

The app is trying to connect to a local Postgres instance, but none is running. You need to:

**Option A: Use Remote Database**
```bash
# Add to your .env file (or set as environment variables):
export POSTGRES_HOST=your-database-host.com
export POSTGRES_PORT=5432
export POSTGRES_DATABASE=mediczy_ai
export POSTGRES_USER=mediczy_helper
export POSTGRES_PASSWORD=your-password
```

**Option B: Start Local Postgres (Docker)**
```bash
# If you have docker-compose:
docker-compose up -d postgres

# Or run Postgres container:
docker run -d \
  --name mediczy-postgres \
  -e POSTGRES_DB=mediczy_ai \
  -e POSTGRES_USER=mediczy_helper \
  -e POSTGRES_PASSWORD=your-password \
  -p 5432:5432 \
  postgres:15
```

### Step 2: Run Database Migration

Once Postgres is connected:

```bash
# Run the migration script
cd /workspaces/Mediczy
node run-migration.js
```

**Expected Output:**
```
🔄 Running API v1 schema migration...
✅ Migration completed successfully!
✅ Created 18 tables:
   ✓ api_appointments
   ✓ api_audit_logs
   ✓ api_chat_messages
   ✓ api_chat_rooms
   ✓ api_consent_logs
   ✓ api_doctors
   ✓ api_homecare_bookings
   ✓ api_homecare_services
   ✓ api_hra_assessments
   ✓ api_lab_bookings
   ✓ api_lab_tests
   ✓ api_pharmacy_orders
   ✓ api_prescriptions
   ✓ api_users
   ✓ api_webhook_deliveries
   ✓ api_webhooks
   ✓ api_wellness_plans
   ✓ tenants
```

### Step 3: Configure JWT Secrets

Generate secure secrets:

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate refresh secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add to your `.env` file or environment:

```bash
JWT_SECRET=<paste-first-generated-secret>
JWT_REFRESH_SECRET=<paste-second-generated-secret>
```

### Step 4: Start/Restart Server

```bash
# If using PM2:
pm2 restart ecosystem.config.js

# Or if running with npm:
npm start

# Or direct node:
node server/index.js
```

### Step 5: Test API Endpoints

#### Test 1: Health Check

```bash
curl http://localhost:5000/v1/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-06T..."
}
```

#### Test 2: API Info

```bash
curl http://localhost:5000/v1/
```

**Expected Response:**
```json
{
  "name": "Mediqzy API",
  "version": "1.0.0",
  "description": "Multi-tenant wellness platform API",
  "endpoints": {
    "auth": "/v1/auth",
    "users": "/v1/{tenant-id}/users",
    "doctors": "/v1/{tenant-id}/doctors",
    "appointments": "/v1/{tenant-id}/appointments",
    "video": "/v1/{tenant-id}/video"
  }
}
```

#### Test 3: Token Exchange (Requires OIDC Setup)

For full testing, you'll need to configure OIDC providers first.

**Quick Test (Development Only):**

You can temporarily modify the token validation for testing:

```javascript
// server/middleware/api-auth.js
// In validateExternalToken method, add at the top:

if (process.env.NODE_ENV === 'development' && providerToken === 'test-token') {
  return {
    sub: 'test-user-001',
    email: 'test@example.com',
    name: 'Test User'
  };
}
```

Then test:

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

**⚠️ IMPORTANT:** Remove the test bypass before production!

---

## Import Postman Collection

1. Open Postman
2. Click **Import**
3. Select file: `/workspaces/Mediczy/postman/mediqzy-api-v1.postman_collection.json`
4. Import environment: `/workspaces/Mediczy/postman/environments/mediqzy-sandbox.postman_environment.json`
5. Update environment variables:
   - `base_url`: `http://localhost:5000/v1`
   - `tenant_id`: `clinic-demo`
6. Run requests!

---

## Verification Checklist

- [ ] Database connection configured
- [ ] Migration completed successfully (18+ tables created)
- [ ] JWT secrets generated and set in environment
- [ ] Server restarted
- [ ] `/v1/health` returns 200 OK
- [ ] `/v1/` returns API info
- [ ] Postman collection imported
- [ ] Test token exchange works (with OIDC or temp bypass)

---

## Current Status

### ✅ Completed
- Database schema (20+ tables designed)
- Authentication middleware (OIDC, JWT, RBAC)
- 5 core API route modules (auth, users, doctors, appointments, video)
- Routes integrated into Express app (`/v1/*`)
- Postman collection (40+ requests)
- JavaScript SDK with TypeScript types
- Documentation

### ⏸️ Pending (Needs DB Connection)
- Database migration execution
- Live API testing
- Token exchange testing
- End-to-end booking flow

### 📋 To Do Later
- Configure real OIDC providers (Azure AD, Google, Okta)
- Set up Redis for rate limiting
- Implement remaining 6 API modules (Chat, Labs, Pharmacy, Homecare, Wellness, Webhooks)
- Add input validation (Joi schemas)
- Set up monitoring and logging
- Deploy to staging/production

---

## Files Created Today

```
server/
├── migrations/
│   └── 20260206_create_api_v1_schemas.sql (650 lines)
├── middleware/
│   └── api-auth.js (533 lines)
└── routes/
    ├── api-v1-auth.js (180 lines)
    ├── api-v1-users.js (220 lines)
    ├── api-v1-doctors.js (260 lines)
    ├── api-v1-appointments.js (420 lines)
    ├── api-v1-video.js (210 lines)
    └── api-v1-index.js (60 lines)

postman/
├── mediqzy-api-v1.postman_collection.json
└── environments/
    ├── mediqzy-sandbox.postman_environment.json
    ├── mediqzy-staging.postman_environment.json
    └── mediqzy-production.postman_environment.json

sdk/javascript/
├── mediqzy-client.js (580 lines)
├── mediqzy-client.d.ts (320 lines)
├── package.json
└── README.md (450 lines)

Root:
├── run-migration.js (migration runner script)
├── .env.api-v1 (environment configuration template)
├── API_V1_TESTING_GUIDE.md (this file)
├── MEDIQZY_API_V1_IMPLEMENTATION_SUMMARY.md
└── QUICK_START_DEPLOYMENT.md
```

---

## Troubleshooting

### "Cannot connect to database"
**Solution:** Configure `POSTGRES_HOST` and other DB vars in your environment

### "JWT secret not configured"
**Solution:** Generate secrets and add to `.env` file

### "Cannot find module 'livekit-server-sdk'"
**Solution:** Install missing dependency:
```bash
npm install livekit-server-sdk
```

### "Routes not found / 404"
**Solution:** Ensure server was restarted after integrating routes

---

## Support

- 📧 Email: api-support@mediqzy.com
- 📚 Full Docs: See `MEDIQZY_API_V1_IMPLEMENTATION_SUMMARY.md`
- 🚀 Quick Start: See `QUICK_START_DEPLOYMENT.md`

---

**Next Action:** Configure database connection and run `node run-migration.js`
