# Ring-Fencing Security Implementation

## Overview

A comprehensive **ring-fencing** security system has been implemented across the entire Mediczy platform to prevent unauthorized cross-user access. This ensures that users can only access routes and features relevant to their specific role and privileges.

## 🔒 What is Ring-Fencing?

Ring-fencing is a security architecture that creates isolated boundaries around different user types, preventing them from accessing resources outside their designated areas. This prevents:

- **Privilege Escalation**: Users cannot access admin or higher-privilege endpoints
- **Cross-User Contamination**: Doctors cannot access clinic dashboards, users cannot access doctor endpoints, etc.
- **Token Hijacking Protection**: Even with a stolen token, access is limited to designated routes
- **Session Isolation**: Multiple user types cannot be logged in simultaneously

## 🎯 Implementation Details

### Frontend Protection

**File**: `/client/src/hooks/useRingFencing.tsx`

#### Features:
1. **Automatic Route Verification**: Checks every route navigation against user privileges
2. **Token Management**: Ensures only one user type is logged in at a time
3. **Automatic Redirection**: Redirects unauthorized users to their appropriate dashboard
4. **Client-Side Token Cleanup**: Clears all other user tokens on login

#### User Type Configurations:

| User Type | Allowed Paths | Token Key | Login Path |
|-----------|--------------|-----------|------------|
| **User** | /, /profile, /health-tracker, /consultation, /doctors, etc. | `token` | `/login` |
| **Doctor** | /doctor-dashboard, /doctor/appointments, /doctor/prescriptions, etc. | `doctorToken` | `/doctor-login` |
| **Admin** | /admin/*, all management routes | `adminToken` | `/admin/login` |
| **Team** | /team/*, limited admin routes | `teamToken` | `/team/login` |
| **Nurse** | /nurse/*, patient care routes | `nurseToken` | `/nurse/login` |
| **Assistant** | /assistant/*, order management | `assistantToken` | `/assistant/login` |
| **Corporate** | /corporate/*, employee benefits | `corporateToken` | `/corporate/login` |
| **Hospital** | /hospital/* | `hospitalToken` | `/hospital/login` |
| **Clinic** | /clinic/*, practice management | `clinicToken` | `/clinic/login` |
| **Lab** | /lab/*, test results | `labToken` | `/lab/login` |
| **Pharmacy** | /pharmacy/*, prescription fulfillment | `pharmacyToken` | `/pharmacy/login` |

#### Usage:

```tsx
import { RingFencedRoute } from '@/hooks/useRingFencing';

// Wrap your routes
<RingFencedRoute>
  <Routes>
    {/* Your routes here */}
  </Routes>
</RingFencedRoute>
```

### Backend Protection

**File**: `/server/middleware/ringFencing.js`

#### Features:
1. **JWT Token Verification**: Validates tokens and extracts user type
2. **Endpoint Permission Checking**: Matches requested endpoint against allowed paths
3. **Public Endpoint Bypass**: Allows login/register routes without authentication
4. **Detailed Logging**: Logs all access attempts for security auditing

#### Middleware Functions:

##### 1. `ringFencingMiddleware`
Main middleware that enforces route access control:
```javascript
app.use(ringFencingMiddleware);
```

##### 2. `checkPrivilege(requiredPrivilege)`
Fine-grained privilege checking for specific actions:
```javascript
router.delete('/api/users/:id', 
  checkPrivilege('delete_user'), 
  deleteUserHandler
);
```

##### 3. `ensureOwnResource(idParam)`
Ensures users can only access their own resources:
```javascript
router.get('/api/users/:id/profile', 
  ensureOwnResource('id'), 
  getUserProfileHandler
);
```

#### User Type Permissions:

**Admin** has access to all endpoints:
- `/api/admin/*`
- `/api/users/*`
- `/api/doctors/*`
- `/api/team/*`
- `/api/hospitals/*`, `/api/clinics/*`, `/api/labs/*`, `/api/pharmacies/*`
- `/api/billing/*`, `/api/accounting/*`, `/api/payments/*`
- `/api/email/*`, `/api/sms/*`, `/api/whatsapp/*`
- `/api/video/*`, `/api/voice/*`, `/api/tickets/*`
- And more...

**Doctor** has access to:
- `/api/doctor/*`
- `/api/doctors/appointments`
- `/api/doctors/prescriptions`
- `/api/doctors/patients`
- `/api/video/*`, `/api/chat/*`

**User** has access to:
- `/api/user/*`
- `/api/auth/*`
- `/api/doctors/*` (view only)
- `/api/appointments/*`
- `/api/health-tracker/*`
- `/api/consultation/*`
- `/api/chat/*`, `/api/ai-doctor/*`

**Clinic** has access to:
- `/api/clinic/*`
- `/api/clinic/dashboard/*`
- `/api/clinic/appointments/*`
- `/api/clinic/patients/*`
- `/api/clinic/inventory/*`

### Universal Logout System

**Files**: 
- `/server/routes/auth.universal.route.js` (Backend)
- `/client/src/hooks/useUniversalLogout.tsx` (Frontend)

#### Features:
1. **Unified Logout**: Single endpoint for all user types
2. **Token Revocation**: Clears server-side session data
3. **Multi-Token Cleanup**: Removes all client-side tokens
4. **Auto-Detection**: Automatically detects user type and redirects appropriately
5. **Session Info**: Endpoint to check current session details

#### API Endpoints:

##### POST `/api/auth/logout`
Logout current user and clear session:
```bash
curl -X POST https://mediqzy.com/api/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

##### GET `/api/auth/session-info`
Get current session information:
```bash
curl -X GET https://mediqzy.com/api/auth/session-info \
  -H "Authorization: Bearer YOUR_TOKEN"
```

##### POST `/api/auth/revoke-token` (Admin Only)
Revoke a specific user's token:
```bash
curl -X POST https://mediqzy.com/api/auth/revoke-token \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "123", "userType": "doctor"}'
```

#### Frontend Usage:

```tsx
import { useUniversalLogout } from '@/hooks/useUniversalLogout';

function MyComponent() {
  const { logout } = useUniversalLogout();
  
  const handleLogout = async () => {
    await logout(); // Auto-detects user type
    // OR
    await logout('doctor'); // Explicit user type
  };
  
  return <button onClick={handleLogout}>Logout</button>;
}
```

## 🧪 Testing

### Automated Test Script

Run the comprehensive test suite:

```bash
./test-ring-fencing.sh
```

The test script verifies:
1. ✅ Admin can login and access admin endpoints
2. ✅ Admin can access all protected routes
3. ✅ Doctor can login and access doctor endpoints
4. ✅ Doctor is **blocked** from admin endpoints (403)
5. ✅ User can login and access user endpoints
6. ✅ User is **blocked** from admin endpoints (403)
7. ✅ User is **blocked** from doctor endpoints (403)
8. ✅ Clinic can login and access clinic endpoints
9. ✅ Clinic is **blocked** from admin endpoints (403)
10. ✅ Requests without tokens are rejected (401)
11. ✅ Requests with invalid tokens are rejected (401)
12. ✅ Session info endpoint works correctly
13. ✅ Universal logout endpoint works correctly

### Manual Testing

#### Test 1: Cross-User Access Prevention
1. Login as a regular user
2. Try to navigate to `/admin/dashboard`
3. **Expected**: Redirected to `/login` or user dashboard
4. **Verify**: Check browser console for ring-fencing logs

#### Test 2: Token Isolation
1. Login as doctor (stores `doctorToken`)
2. Open developer tools → Application → Local Storage
3. Manually add `adminToken` with a valid token
4. Refresh page
5. **Expected**: Only one token remains, others are cleared

#### Test 3: API Endpoint Protection
1. Login as user and get token
2. Try to access admin endpoint:
```bash
curl -X GET https://mediqzy.com/api/admin/users \
  -H "Authorization: Bearer USER_TOKEN"
```
3. **Expected**: 403 Forbidden response

#### Test 4: Multiple Login Prevention
1. Login as admin in one tab
2. Try to login as doctor in another tab
3. **Expected**: Previous session cleared, only one active session

## 📊 Security Benefits

### Before Ring-Fencing
- ❌ Users could manually navigate to admin routes
- ❌ Stolen tokens gave full access to all endpoints
- ❌ Multiple user types could be logged in simultaneously
- ❌ No validation of user type vs. requested resource
- ❌ Client-side security could be bypassed

### After Ring-Fencing
- ✅ Automatic route validation and redirection
- ✅ Stolen tokens limited to user's designated routes only
- ✅ Only one user type active at a time
- ✅ Server-side enforcement of permissions
- ✅ Defense-in-depth: Frontend + Backend validation
- ✅ Comprehensive audit logging of access attempts

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER REQUEST                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         FRONTEND RING-FENCING (Client-Side)            │
│  • Check localStorage for active token                  │
│  • Verify route is in allowed paths                     │
│  • Redirect if unauthorized                             │
│  • Clear other user tokens                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼ (Allowed)
┌─────────────────────────────────────────────────────────┐
│              NETWORK REQUEST (HTTPS)                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         BACKEND RING-FENCING (Server-Side)             │
│  • Verify JWT token signature                           │
│  • Extract user type from token                         │
│  • Check endpoint against allowed paths                 │
│  • Log access attempt                                   │
│  • Return 403 if unauthorized                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼ (Authorized)
┌─────────────────────────────────────────────────────────┐
│              ROUTE HANDLER / CONTROLLER                 │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Deployment

### Production Deployment

The ring-fencing system is already deployed to production:

✅ Backend middleware active on all API routes  
✅ Frontend protection wrapping all routes  
✅ Universal logout endpoints available  
✅ Session management configured  

### Environment Variables

No additional environment variables required. The system uses existing JWT configuration:

```bash
JWT_SECRET=your-secret-key  # Already configured
```

## 📝 Maintenance

### Adding New User Types

1. Update `/client/src/hooks/useRingFencing.tsx`:
```tsx
const USER_TYPES = {
  // ... existing types
  newUserType: {
    allowedPaths: ['/new-user/*'],
    tokenKey: 'newUserToken',
    loginPath: '/new-user/login',
    userType: 'newUserType'
  }
};
```

2. Update `/server/middleware/ringFencing.js`:
```javascript
const USER_TYPE_PERMISSIONS = {
  // ... existing types
  newUserType: {
    allowedPaths: ['/api/new-user'],
    tokenField: 'newUserId'
  }
};
```

3. Create login endpoint that issues JWT with `userType: 'newUserType'`

### Adding New Protected Routes

Simply add the route to the appropriate user type's `allowedPaths` array in both frontend and backend configurations.

## 🐛 Troubleshooting

### Issue: User keeps getting redirected

**Cause**: Token may be expired or invalid  
**Solution**: Clear localStorage and login again

### Issue: 403 errors on valid requests

**Cause**: Route not in allowed paths for user type  
**Solution**: Add route to user type's `allowedPaths` configuration

### Issue: Multiple tokens in localStorage

**Cause**: Ring-fencing not clearing old tokens  
**Solution**: Call `logoutAllSessions()` manually

### Issue: Backend allows but frontend blocks

**Cause**: Mismatch in path configuration  
**Solution**: Ensure frontend and backend allowed paths match exactly

## 📚 References

- [OWASP Access Control](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/README)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Defense in Depth](https://www.us-cert.gov/bsi/articles/knowledge/principles/defense-in-depth)

## ✅ Compliance

This ring-fencing implementation helps meet:
- **HIPAA**: Access control requirements (§164.308(a)(4))
- **GDPR**: Data access limitation (Article 32)
- **ISO 27001**: Access control policy (A.9)

---

**Status**: ✅ Fully Implemented and Deployed  
**Last Updated**: December 4, 2025  
**Version**: 1.0.0
