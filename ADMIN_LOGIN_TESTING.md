# Admin Login & Dashboard Testing Guide

## Overview
This document provides step-by-step instructions for testing the admin login functionality and admin dashboard endpoints in the Mediczy healthcare platform.

---

## Test Scope

The admin system has been updated with the following improvements:

1. **Real Backend Authentication**: Admin login now uses proper API calls instead of hardcoded demo tokens
2. **Token Validation**: Admin tokens are validated via `/api/admin/profile` endpoint
3. **Demo Mode Fallback**: Optional "Use Demo Mode" button for testing without backend
4. **Secure Role-Based Access**: `authUser + requireRole('admin')` middleware on all protected routes
5. **Demo Data Fallback**: Admin pages attempt real API first, fallback to demo data on error

---

## Prerequisites

### 1. Ensure Services are Running

**Backend (Port 8000):**
```bash
cd /root/Mediczy/server
npm start
```

**Frontend (Port 4000):**
```bash
cd /root/Mediczy/client
npm run dev
```

### 2. Create/Reset Admin User

The default admin credentials are:
- **Email**: `admin@mediczy.local`
- **Password**: `Admin@1234`

To ensure the admin user exists with correct credentials:
```bash
cd /root/Mediczy/server
npm run seed:admin
```

If you encounter login issues, reset the password:
```bash
cd /root/Mediczy/server
node debug-admin-login.js
```

---

## Automated Backend Testing

### Test Script: `test-admin-login-flow.js`

This script tests all admin endpoints programmatically.

**Run the test:**
```bash
cd /root/Mediczy/server
npm run test:admin
```

**Expected Output:**
```
=== Admin Login Flow Test ===
Base URL: http://localhost:8000/api
Email: admin@mediczy.local
✔ Login status: 200 Admin login successful
Token prefix: eyJhbGciOiJIUzI1NiIs...
✔ Profile: admin@mediczy.local
✔ Dashboard stats keys: ['users', 'doctors', 'labs', 'pharmacies', 'corporates', 'activeCorporates']
✔ Users returned: 2
✔ Doctors returned: 2

All admin endpoints tested successfully.
```

### Endpoints Tested

1. **POST /api/admin/login**
   - Validates admin credentials
   - Returns JWT token with `role: 'admin'`
   - Response: `{ token, admin: { id, email } }`

2. **GET /api/admin/profile** (Protected)
   - Validates admin token
   - Returns admin user details
   - Response: `{ id, email, firstName, lastName, role: 'admin' }`

3. **GET /api/admin/dashboard/stats** (Protected)
   - Aggregates platform statistics
   - Response: `{ stats: { users, doctors, labs, pharmacies, corporates, activeCorporates }, recentUsers }`

4. **GET /api/admin/users** (Protected)
   - Lists all users with pagination
   - Query: `?page=1&limit=20&search=keyword`
   - Response: `{ total, data, page, limit }`

5. **GET /api/admin/doctors** (Protected)
   - Lists all doctors with pagination
   - Response: `{ total, data, page, limit }`

---

## Manual Frontend Testing

### Test 1: Admin Login (Real Authentication)

**URL**: `http://192.168.1.72:4000/admin/login` or `http://localhost:4000/admin/login`

**Steps:**
1. Navigate to admin login page
2. Enter credentials:
   - Email: `admin@mediczy.local`
   - Password: `Admin@1234`
3. Click **"Sign In"** button
4. **Expected**: Successful login, redirect to `/admin` dashboard
5. **Verify**: Dashboard displays real data (user count, doctor count, etc.)

**Failure Scenarios:**
- ❌ **Invalid credentials**: Shows "Invalid credentials" error message
- ❌ **Network error**: Shows "Login failed" with error details
- ❌ **Server down**: Connection refused error

---

### Test 2: Admin Login (Demo Mode)

**URL**: `http://192.168.1.72:4000/admin/login`

**Steps:**
1. Navigate to admin login page
2. Click **"Use Demo Mode"** button (no need to enter credentials)
3. **Expected**: Instant redirect to `/admin` dashboard with demo data
4. **Verify**: Dashboard displays mock statistics:
   - Users: 1250
   - Doctors: 85
   - Labs: 12
   - Pharmacies: 28

**Use Case**: Testing UI/UX without backend dependency

---

### Test 3: Admin Dashboard

**URL**: `http://192.168.1.72:4000/admin`

**Prerequisites**: Logged in as admin (real or demo)

**Components to Verify:**

#### Stats Cards
- ✅ Total Users
- ✅ Doctors
- ✅ Labs
- ✅ Pharmacies
- ✅ Corporates
- ✅ Active Corporates

#### CRM Snapshot (if available)
- Open Pipeline Value
- Conversion Rate
- Open Leads count

#### Recent Users
- List of latest registered users
- Name, email, registration date

#### Quick Actions
- Manage Doctors button → `/admin/doctors`
- Manage Labs button → `/admin/labs`
- Manage Pharmacies button → `/admin/pharmacies`
- Manage Corporates button → `/admin/corporates`

---

### Test 4: Membership Plans Page

**URL**: `http://192.168.1.72:4000/admin/plans`

**Tests:**

1. **View Plans List**
   - Real mode: Displays plans from database
   - Demo mode: Displays "Basic Plan" and "Premium Plan"

2. **Create New Plan**
   - Click "+ New Plan" button
   - Fill form:
     - Name: "Gold Plan"
     - Description: "Premium healthcare"
     - Duration: 90 days
     - Price: ₹4999
     - Teleconsult limits: 10 for all specialties
     - Benefits: Pharmacy ₹2000, Home Care ₹5000
   - Click "Create Plan"
   - **Expected**: Plan added, list refreshes

3. **Edit Plan**
   - Click "Edit" on any plan
   - Modify price to ₹5999
   - Click "Save Changes"
   - **Expected**: Plan updated

4. **Delete Plan**
   - Click "Delete" on any plan
   - Confirm deletion
   - **Expected**: Plan removed from list

---

### Test 5: Insurance Management Page

**URL**: `http://192.168.1.72:4000/admin/insurance`

**Tabs to Test:**

#### Providers Tab
- View list of insurance providers
- Demo mode shows: ICICI Lombard, Star Health
- Create/Edit/Delete providers

#### Policies Tab
- View insurance policies
- Demo mode shows: "Family Health Plus", "Senior Citizen Care"
- Create/Edit/Delete policies

#### Enrollments Tab
- View user insurance enrollments
- Shows enrollment number, status, claims used

#### Claims Tab
- View insurance claims
- Update claim status (Submitted → Under Review → Approved → Settled)

---

### Test 6: Token Validation & Auto-Logout

**URL**: Any admin route (`/admin/*`)

**Test Invalid Token:**
1. Open browser DevTools → Application → Local Storage
2. Modify `adminToken` value to invalid string
3. Reload page or navigate to `/admin`
4. **Expected**: Redirect to `/admin/login`

**Test Expired Token:**
- JWT tokens expire after 7 days
- Expired tokens automatically redirect to login

---

## API Testing with cURL

### 1. Login
```bash
curl -X POST http://localhost:8000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mediczy.local","password":"Admin@1234"}'
```

**Response:**
```json
{
  "message": "Admin login successful",
  "token": "eyJhbGciOiJIUzI1...",
  "admin": {
    "id": 5,
    "email": "admin@mediczy.local"
  }
}
```

### 2. Validate Profile
```bash
TOKEN="<your_token_from_login>"
curl http://localhost:8000/api/admin/profile \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "id": 5,
  "email": "admin@mediczy.local",
  "firstName": "Platform",
  "lastName": "Admin",
  "role": "admin"
}
```

### 3. Dashboard Stats
```bash
curl http://localhost:8000/api/admin/dashboard/stats \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "stats": {
    "users": 10,
    "doctors": 5,
    "labs": 2,
    "pharmacies": 3,
    "corporates": 1,
    "activeCorporates": 1
  },
  "recentUsers": [...]
}
```

### 4. List Users
```bash
curl "http://localhost:8000/api/admin/users?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. List Doctors
```bash
curl "http://localhost:8000/api/admin/doctors?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Troubleshooting

### Issue: "Invalid credentials" on login

**Solutions:**
1. Reset admin password:
   ```bash
   cd /root/Mediczy/server
   node debug-admin-login.js
   ```

2. Verify admin user exists:
   ```bash
   npm run seed:admin
   ```

3. Check backend logs for bcrypt comparison errors

### Issue: Token validation fails / Auto-redirect to login

**Solutions:**
1. Check backend is running: `curl http://localhost:8000/api/admin/profile`
2. Verify token in localStorage is not corrupted
3. Check browser console for 401/403 errors
4. Restart backend server

### Issue: Demo mode doesn't show data

**Cause**: Demo data fallback only activates for demo tokens

**Solution**: Click "Use Demo Mode" button on login page

### Issue: Real API calls return empty data

**Cause**: Database has no records

**Solutions:**
1. Use bulk upload endpoints to seed data
2. Manually create users/doctors via registration
3. Fallback to demo mode for UI testing

---

## Environment Variables

### Backend (.env)
```bash
# Required for admin login
SECRET_TOKEN=your-secret-key
DB_HOST=localhost
DB_NAME=mediczy_db
DB_USER=root
DB_PASSWORD=your_password

# Optional admin credentials
ADMIN_EMAIL=admin@mediczy.local
ADMIN_PASSWORD=Admin@1234
```

### Frontend (.env.local)
```bash
VITE_API_BASE_URL=http://localhost:8000/api
```

---

## Security Recommendations

### Production Hardening

1. **Change Default Credentials**
   ```bash
   # Update in .env
   ADMIN_EMAIL=admin@yourdomain.com
   ADMIN_PASSWORD=<strong-password>
   
   # Re-run seed script
   npm run seed:admin
   ```

2. **Use Strong SECRET_TOKEN**
   ```bash
   # Generate secure token
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **Enable HTTPS** (via Nginx reverse proxy with Let's Encrypt)

4. **Rate Limiting**: Already enabled via `express-rate-limit`

5. **Token Refresh**: Implement refresh tokens for long sessions

6. **Role-Based Permissions**: Extend `requireRole` middleware for granular access

7. **Audit Logging**: Log all admin actions to database

8. **Two-Factor Authentication**: Add 2FA for admin logins

---

## Test Results Summary

### ✅ Passing Tests

| Test | Status | Notes |
|------|--------|-------|
| Admin Login API | ✅ PASS | Returns valid JWT token |
| Profile Validation | ✅ PASS | Returns admin details |
| Dashboard Stats | ✅ PASS | Aggregates real data |
| User Listing | ✅ PASS | Pagination works |
| Doctor Listing | ✅ PASS | Returns doctor records |
| Demo Mode Fallback | ✅ PASS | Shows mock data |
| Token Validation | ✅ PASS | Redirects on invalid token |
| Membership Plans | ✅ PASS | CRUD operations work |
| Insurance Management | ✅ PASS | Multi-tab interface functional |

### ⚠️ Known Limitations

- Demo mode bypasses role validation (client-side only)
- Claims/Enrollments require real data (demo fallback limited)
- CRM stats endpoint may fail if no leads exist
- Firebase push notifications disabled (credentials not configured)

---

## Next Steps

1. **Extend RBAC**: Add `super_admin`, `admin`, `moderator` roles
2. **Implement Token Refresh**: Extend session duration seamlessly
3. **Add Audit Trail**: Log admin actions (who, what, when)
4. **Bulk Operations**: Add CSV import/export for entities
5. **Real-time Dashboard**: Use Socket.io for live stats
6. **Analytics Dashboards**: Add charts with Chart.js
7. **Email Notifications**: Alert on critical admin actions

---

## Contact & Support

For issues or questions:
- Check `__INIT__.md` for complete application documentation
- Review backend logs: `tail -f server/backend.log`
- Test with automated script: `npm run test:admin`
- Inspect network requests in browser DevTools

---

**Last Updated**: November 9, 2025  
**Version**: 1.0.0  
**Tested By**: Mediczy Development Team
