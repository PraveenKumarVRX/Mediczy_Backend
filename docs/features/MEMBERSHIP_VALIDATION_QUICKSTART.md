# Membership Validation - Quick Reference Guide

## Overview
Users must have a valid, active membership plan to access the Mediczy app. Users without valid memberships are automatically set to inactive status.

## How It Works

### User Access Control
```
User Request → Auth Check → Membership Check → Access Granted/Denied
```

### Status Rules
- **Active**: User has valid membership (startDate ≤ today ≤ endDate, status = 'active')
- **Inactive**: No valid membership or membership expired

### Exempt Roles (No Membership Required)
- Admins: `admin`, `super_admin`, `system_admin`, `platform_admin`
- Healthcare: `doctor`, `nurse`, `assistant`
- Organizations: `corporate`, `lab`
- Development: Dev tokens (when `ALLOW_DEV_TOKENS=true`)

## Key Files

### 1. Membership Middleware
**Location**: `/server/middleware/membership.middleware.js`

```javascript
import { validateMembership } from './middleware/membership.middleware.js';

// In your route:
router.get('/protected', authUser, validateMembership, (req, res) => {
  // User has valid membership
  console.log(req.userMembership); // Contains plan details
});
```

### 2. Auth Middleware (Modified)
**Location**: `/server/middleware/auth.middleware.js`

Automatically validates membership for regular users:
```javascript
// For regular users (role = 'user')
if (req.userRole === 'user' && !user.isAdmin) {
  return validateMembership(req, res, next);
}
```

### 3. Cron Jobs
**Location**: `/server/services/membership-cron.service.js`

- **Daily Sync**: 2:00 AM - Syncs all user statuses
- **Expiry Notifications**: 9:00 AM - Sends expiry warnings

## API Response Examples

### Success (Valid Membership)
```json
// Request proceeds normally
// req.userMembership contains:
{
  "planId": 1,
  "status": "active",
  "startDate": "2024-06-21",
  "endDate": "2025-12-31",
  "autoRenew": false,
  "daysRemaining": 30
}
```

### Error: No Membership
```json
{
  "success": false,
  "message": "Access denied: No active membership plan found",
  "errorCode": "MEMBERSHIP_REQUIRED",
  "details": {
    "userId": 123,
    "reason": "No active membership plan",
    "action": "Please subscribe to a membership plan to continue using the app"
  }
}
```

### Error: Expired Membership
```json
{
  "success": false,
  "message": "Access denied: Membership plan has expired",
  "errorCode": "MEMBERSHIP_EXPIRED",
  "details": {
    "userId": 123,
    "planId": 1,
    "expiredOn": "2024-12-15",
    "reason": "Membership plan expired",
    "action": "Please renew your membership plan to continue"
  }
}
```

## Admin Endpoints

### 1. Sync All Users
```bash
curl -X POST http://localhost:8000/api/admin/membership/sync-all \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 2. Sync Specific User
```bash
curl -X POST http://localhost:8000/api/admin/membership/sync-user/123 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 3. Get Expiring Memberships
```bash
curl -X GET "http://localhost:8000/api/admin/membership/expiring?days=7" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 4. Get Inactive Users
```bash
curl -X GET http://localhost:8000/api/admin/membership/inactive-users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Database Queries

### Check User's Active Membership
```javascript
import { UserPlan } from '../models/membershipPlan.model.intelligent.js';
import { Op } from 'sequelize';

const today = new Date().toISOString().split('T')[0];

const activePlan = await UserPlan.findOne({
  where: {
    userId: 123,
    status: 'active',
    startDate: { [Op.lte]: today },
    endDate: { [Op.gte]: today }
  }
});
```

### Update User Status
```javascript
import userModel from '../models/user.model.intelligent.js';

await userModel.update(
  { status: 'inactive' },
  { where: { id: 123 } }
);
```

## Helper Functions

### Manual Sync (Single User)
```javascript
import { syncUserStatusWithMembership } from '../middleware/membership.middleware.js';

const result = await syncUserStatusWithMembership(123);
// Returns: { success: true, status: 'active', hasActivePlan: true }
```

### Manual Sync (All Users)
```javascript
import { syncAllUsersStatus } from '../middleware/membership.middleware.js';

const results = await syncAllUsersStatus();
// Returns: { total: 1000, activated: 50, deactivated: 30, unchanged: 920, errors: [] }
```

## Frontend Error Handling

### React Example
```javascript
try {
  const response = await api.get('/protected-endpoint');
  // Success
} catch (error) {
  if (error.response?.data?.errorCode === 'MEMBERSHIP_REQUIRED') {
    // Redirect to subscription page
    navigate('/subscribe');
  } else if (error.response?.data?.errorCode === 'MEMBERSHIP_EXPIRED') {
    // Show renewal prompt
    showRenewalDialog();
  }
}
```

### Angular Example
```typescript
this.http.get('/protected-endpoint').subscribe(
  data => { /* Success */ },
  error => {
    if (error.error?.errorCode === 'MEMBERSHIP_REQUIRED') {
      this.router.navigate(['/subscribe']);
    } else if (error.error?.errorCode === 'MEMBERSHIP_EXPIRED') {
      this.showRenewalDialog();
    }
  }
);
```

## Troubleshooting

### Issue: User can't access app
**Check**:
1. User has UserPlan record?
2. UserPlan status is 'active'?
3. startDate ≤ today?
4. endDate ≥ today?
5. User status is 'active'?

**Fix**:
```bash
# Manually sync user
curl -X POST http://localhost:8000/api/admin/membership/sync-user/{userId} \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Issue: Admin can't access app
**Check**: User's `isAdmin` field is `true`
**Fix**: Admins bypass membership validation

### Issue: Cron jobs not running
**Check**: Server logs for cron job initialization
**Expected logs**:
```
✅ Membership sync cron job scheduled (daily at 2:00 AM)
✅ Membership expiry notification cron job scheduled (daily at 9:00 AM)
🚀 All membership cron jobs started
```

### Issue: Users not receiving expiry notifications
**Check**:
1. Email service configured?
2. User has valid email?
3. Cron job running?

**Test**:
```bash
# Check expiring memberships
curl -X GET "http://localhost:8000/api/admin/membership/expiring?days=7" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Testing Commands

### 1. Create Test User with Membership
```javascript
// Create user
const user = await userModel.create({
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: 'password123',
  status: 'active'
});

// Create membership plan
const { UserPlan } = await import('../models/membershipPlan.model.intelligent.js');
await UserPlan.create({
  userId: user.id,
  membershipPlanId: 1,
  status: 'active',
  startDate: '2024-06-21',
  endDate: '2025-12-31',
  autoRenew: false
});
```

### 2. Expire Membership (for testing)
```javascript
await UserPlan.update(
  { endDate: '2024-12-15' },
  { where: { userId: 123 } }
);
```

### 3. Test Validation
```javascript
// Login and make request
const token = generateToken(user);
const response = await fetch('/api/protected-endpoint', {
  headers: { 'Authorization': `Bearer ${token}` }
});
// Should succeed if membership valid, fail otherwise
```

## Performance Tips

### 1. Database Indexes
Ensure indexes exist on user_plans table:
```sql
CREATE INDEX idx_user_plans_user_status ON user_plans(user_id, status);
CREATE INDEX idx_user_plans_dates ON user_plans(start_date, end_date);
```

### 2. Caching (Optional)
For high traffic, cache membership status:
```javascript
// Redis cache example
const cacheKey = `membership:${userId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... fetch from DB ...

await redis.setex(cacheKey, 3600, JSON.stringify(membership)); // Cache 1 hour
```

### 3. Query Optimization
```javascript
// Use findOne instead of findAll
const plan = await UserPlan.findOne({
  where: { userId, status: 'active' },
  attributes: ['id', 'membershipPlanId', 'endDate'], // Only needed fields
  limit: 1
});
```

## Monitoring & Alerts

### Key Metrics to Track
- Number of inactive users (daily trend)
- Number of expiring memberships (7-day window)
- Daily sync success rate
- Notification delivery rate

### Log Patterns
```bash
# Successful validation
grep "✅ User .* has valid membership" logs/server.log

# Denied access
grep "⚠️ User .* has no active membership" logs/server.log

# Daily sync results
grep "Daily membership sync completed" logs/server.log
```

## Quick Checklist

Before going live:
- [ ] Cron jobs initialized ✅
- [ ] Database indexes created
- [ ] Email service configured
- [ ] Admin endpoints tested
- [ ] Frontend error handling implemented
- [ ] User notification flow tested
- [ ] Monitoring/logging setup
- [ ] Documentation updated

## Common Use Cases

### 1. New User Registration
```
User registers → Create user (status: 'inactive') 
→ User subscribes → Create UserPlan (status: 'active')
→ User status auto-updated to 'active'
→ User can access app ✅
```

### 2. Membership Renewal
```
User membership expiring → Notification sent (7 days before)
→ User renews → Update endDate or create new UserPlan
→ User status remains 'active' ✅
```

### 3. Membership Expiry
```
Membership expires → Cron job detects expired plan
→ UserPlan status → 'expired'
→ User status → 'inactive'
→ User denied access on next request ❌
```

---

**Need Help?** Check [MEMBERSHIP_VALIDATION_COMPLETE.md](MEMBERSHIP_VALIDATION_COMPLETE.md) for full documentation.
