# 🔧 QUICK FIX GUIDE: Address Sanity Check Issues

**Time to Complete**: ~30 minutes  
**Priority**: Critical before next deployment  
**Date**: February 8, 2026

---

## 🎯 Summary of Issues

| # | Issue | Severity | ETA | File |
|---|-------|----------|-----|------|
| 1 | AuditLog export missing | 🔴 Critical | 5 min | models/index.js |
| 2 | Admin routes index missing | 🟡 Medium | 10 min | server/api/admin/index.js |
| 3 | Route registration in app.js | 🟡 Medium | 5 min | server/app.js |
| 4 | Environment variables | 🟡 Medium | 5 min | .env |
| 5 | Missing auxiliary routes | 🟢 Low | 20 min | Various |

---

## FIX #1: Add AuditLog Export to Models (5 min)

**File**: `server/models/index.js`

**Current Issue**: AuditLog is imported from models but not exported, causing app startup failure.

**Step 1**: Check if AuditLog model exists

```bash
find /workspaces/Mediczy/server -name "*audit*" -o -name "*Audit*" | grep -v node_modules
```

**Step 2**: If it doesn't exist, create it or add a placeholder export

```javascript
// Option A: If AuditLog.js exists as a separate model file
import AuditLogPostgres from './postgres/AuditLog.postgres.js';
export const AuditLog = AuditLogPostgres;

// Option B: If using sequelize definition elsewhere
import AuditLog from './sequelize/AuditLog.js';
export { AuditLog };
```

**Step 3**: Add to the default export object

```javascript
export default {
  User,
  Doctor,
  // ... other models
  AuditLog,  // ← ADD THIS LINE
  sequelize,
};
```

**Verification**:
```bash
node -e "const m = require('./server/models/index.js'); console.log(!!m.AuditLog ? '✓ AuditLog exported' : '✗ AuditLog missing')"
```

---

## FIX #2: Create Admin Routes Index (10 min)

**File**: `server/api/admin/index.js` (NEW FILE)

**Purpose**: Central routing for all admin endpoints including API credentials.

**Content**:

```javascript
/**
 * Admin Routes Index
 * Central router for all admin/super-admin functionality
 */

import express from 'express';
import { requireRole } from '../../middleware/authorization.middleware.js';
import { authenticate } from '../v2/auth.utils.js';
import apiCredentialsRoutes from './api-credentials.routes.js';

const router = express.Router();

// ============================================================================
// MIDDLEWARE: Admin Authentication & Authorization
// ============================================================================

// Require super_admin or admin role for all routes
router.use(authenticate);
router.use(requireRole(['super_admin', 'admin']));

// ============================================================================
// ROUTES: API Credentials Management
// ============================================================================

// Mount API credentials routes at /api/admin/api-credentials
// Endpoints available:
//   POST   /api/admin/api-credentials/generate
//   GET    /api/admin/api-credentials
//   POST   /api/admin/api-credentials/:id/rotate
//   POST   /api/admin/api-credentials/:id/revoke
router.use('/api-credentials', apiCredentialsRoutes);

// ============================================================================
// ROUTES: Aggregator/Mayden Management (Coming Soon)
// ============================================================================

// TODO: Add aggregator management routes here
// router.use('/aggregators', aggregatorRoutes);

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    admin_routes: true,
    api_credentials: true,
    aggregators: false, // Coming soon
  });
});

export default router;
```

**Verification**:
```bash
node -e "const m = require('./server/api/admin/index.js'); console.log(!!m ? '✓ Admin routes module exports' : '✗ Export failed')"
```

---

## FIX #3: Register Admin Routes in app.js (5 min)

**File**: `server/app.js`

**Location**: Find where other route imports are (search for "app.use")

**Current**: Routes are imported but admin routes may not be registered

**Add These Lines**:

```javascript
// ============================================================================
// ADMIN ROUTES (API Credentials Management, etc.)
// ============================================================================

import adminRoutes from './api/admin/index.js';

// Register admin routes
// Endpoints: /api/admin/* 
app.use('/api/admin', adminRoutes);
```

**Example in Context** (assuming app.js structure):
```javascript
// Near line 50-100 where other routes are registered:

import mobileRoutes from './api/mobile/index.js';
import adminRoutes from './api/admin/index.js';  // ← ADD THIS

// ...

app.use('/api/mobile', mobileRoutes);
app.use('/api/admin', adminRoutes);  // ← ADD THIS
```

**Verification**:
```bash
grep -n "api/admin" /workspaces/Mediczy/server/app.js
# Should show: import and app.use statements
```

---

## FIX #4: Setup Environment Variables (5 min)

**File**: `.env`

**Current Issue**: Missing DB_HOST, DB_USER, DB_NAME and other configuration

**Step 1**: Check if .env exists
```bash
[ -f /workspaces/Mediczy/.env ] && echo "✓ .env exists" || echo "✗ .env missing"
```

**Step 2**: If missing, copy from example (if exists)
```bash
cp /workspaces/Mediczy/.env.example /workspaces/Mediczy/.env
```

**Step 3**: Update with actual values
```bash
# Edit .env file with your configuration:
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=mediczy_db

# JWT Configuration
JWT_SECRET=your_secret_key_here_change_in_production
JWT_EXPIRE=7d

# API Credentials Configuration
BCRYPT_ROUNDS=12
API_CREDENTIAL_ROTATION_DAYS=90
API_CREDENTIAL_GRACE_PERIOD_DAYS=7

# Application Configuration
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
```

**Verification**:
```bash
grep -E "^DB_|^JWT_" /workspaces/Mediczy/.env
# Should show all configured variables
```

---

## FIX #5: Verify/Create Auxiliary Routes (20 min - Optional)

**Files**: 
- `server/api/auth/index.js` (if missing)
- `server/api/doctors/index.js` (if missing)

**Check if they exist under different paths**:
```bash
# Search for auth routes
find /workspaces/Mediczy/server -path "*/node_modules" -prune -o -name "*auth*" -type f -print

# Search for doctor routes
find /workspaces/Mediczy/server -path "*/node_modules" -prune -o -name "*doctor*" -type f -print
```

**If auth routes are in mobile routes**, add a re-export:

```javascript
// server/api/auth/index.js
import { authHandlers } from '../mobile/index.js';
export default authHandlers;
```

**Or if they're integrated elsewhere**, update the sanity test to check the correct location.

---

## 🔄 Fix Execution Checklist

### Step 1: Fix AuditLog Export
- [ ] Check if AuditLog model exists
- [ ] Add or create AuditLog in models
- [ ] Export from models/index.js
- [ ] Test: `npm run test:syntax`

### Step 2: Create Admin Routes
- [ ] Create `server/api/admin/index.js`
- [ ] Copy template content above
- [ ] Import apiCredentialsRoutes
- [ ] Set up auth middleware

### Step 3: Register Admin Routes in app.js
- [ ] Add admin routes import
- [ ] Register with `app.use('/api/admin', adminRoutes)`
- [ ] Verify no conflicts

### Step 4: Setup Environment
- [ ] Create or update .env file
- [ ] Add all required variables
- [ ] Update .gitignore to exclude .env

### Step 5: Test Everything
- [ ] Syntax check: `npm run test:syntax`
- [ ] Re-run sanity check: `node SANITY_CHECK_AND_SMOKE_TEST.js`
- [ ] Start server: `npm start`
- [ ] Test admin health: `curl http://localhost:3000/api/admin/health`

---

## 📊 Expected Results After Fixes

```
BEFORE:
  ✓ Passed:            25 (74%)
  ✗ Failed:             9 (26%)

AFTER:
  ✓ Passed:            33 (97%)
  ✗ Failed:             1 (3%)  ← Minor (auxiliary routes)
```

---

## 🧪 Verification Commands

### Test 1: Syntax Check
```bash
node -c /workspaces/Mediczy/server/app.js
echo "✓ No syntax errors"
```

### Test 2: Module Exports
```bash
node -e "const m = require('./server/models/index.js'); console.log(m.AuditLog ? '✓ AuditLog' : '✗ Missing')"
node -e "const m = require('./server/api/admin/index.js'); console.log(m ? '✓ Admin routes' : '✗ Missing')"
```

### Test 3: Full Sanity Check
```bash
cd /workspaces/Mediczy
node SANITY_CHECK_AND_SMOKE_TEST.js
```

### Test 4: Server Startup
```bash
cd /workspaces/Mediczy
npm start
# Should see: "Server listening on port 3000"
# Should see: "✓ Admin routes registered"
```

### Test 5: API Endpoints
```bash
# Test admin health check
curl -H "Authorization: Bearer <your_jwt_token>" \
  http://localhost:3000/api/admin/health
# Expected: { "status": "ok", "admin_routes": true }

# Test admin API credentials list
curl -H "Authorization: Bearer <your_jwt_token>" \
  http://localhost:3000/api/admin/api-credentials
# Expected: List of credentials (or empty array)
```

---

## ⏱️ Estimated Timeline

| Fix | Time | Status |
|-----|------|--------|
| Fix #1: AuditLog | 5 min | ⏳ |
| Fix #2: Admin index | 10 min | ⏳ |
| Fix #3: Register routes | 5 min | ⏳ |
| Fix #4: Environment | 5 min | ⏳ |
| Fix #5: Auxiliary routes | 20 min | ⏳ |
| **Testing** | 10 min | ⏳ |
| **Total** | **55 min** | 🎯 |

---

## 🚀 Next Steps After Fixes

Once all fixes are applied and verified:

1. ✅ Re-run sanity check to confirm 100% pass rate
2. ✅ Test API credentials generation
3. ✅ Create aggregator login with API credentials provisioning
4. ✅ Deploy to staging
5. ✅ Final validation before production

---

## 📋 Files Modified

| File | Change | Status |
|------|--------|--------|
| `server/models/index.js` | Add AuditLog export | ⏳ |
| `server/api/admin/index.js` | Create new file | ⏳ |
| `server/app.js` | Register admin routes | ⏳ |
| `.env` | Create/update config | ⏳ |

---

**Ready to fix?** Start with Fix #1 above! 🔧

