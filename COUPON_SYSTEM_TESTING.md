# Coupon Management System - Testing & Verification

## ✅ System Implementation Status

### Backend Components
- ✅ **Database Models** 
  - `Coupon` model with full validation (`/server/models/postgres/coupon.model.postgres.js`)
  - `CouponUsage` model for tracking redemptions (`/server/models/postgres/coupon-usage.model.postgres.js`)
  - Models exported in `/server/models/index.js`

- ✅ **API Routes**
  - GET `/api/coupons` - List all coupons with search/filter
  - GET `/api/coupons/stats` - Get statistics dashboard
  - POST `/api/coupons` - Create new coupon
  - PUT `/api/coupons/:id` - Update coupon
  - DELETE `/api/coupons/:id` - Delete coupon (blocked if used)
  - GET `/api/coupons/:id/usage` - Get usage history
  - Routes registered in `/server/app.js` at line 721

- ✅ **Wallet Integration**
  - POST `/api/wallet/validate-coupon` - Validate before purchase
  - Enhanced `create-order` endpoint with coupon parameter
  - Enhanced `verify-payment` endpoint to apply coupon and track usage

- ⚠️ **Authentication** (Fixed)
  - Fixed import from `authAdmin` to `adminAuthMiddleware`
  - All routes now use correct middleware from `/server/middleware/admin.middleware.js`
  - Server restarted to apply changes

### Frontend Components
- ✅ **Admin Dashboard** 
  - Full-featured UI at `/client/src/pages/admin/CouponManagement.tsx`
  - Statistics cards (Total, Active, Expired, Usage)
  - Create/Edit/Delete dialogs
  - Search & filter functionality
  - Color-coded badges for coupon types
  - Usage tracking table

- ✅ **User Purchase Flow**
  - Enhanced `/client/src/components/wallet/PurchaseCoinsDialog.tsx`
  - Coupon code input field
  - Real-time validation
  - Visual feedback for applied coupons
  - Auto-application during payment

- ✅ **Navigation & Routing**
  - Route added to `/client/src/routes/index.tsx` at line 737
  - Menu item added to `/client/src/components/layout/Sidebar.tsx` at line 119
  - Accessible at `/admin/coupons` for team/admin users
  - Using Ticket icon from lucide-react

- ✅ **Build Status**
  - Frontend built successfully (8,723.38 kB)
  - No compilation errors
  - All components properly imported

## 🧪 Testing Procedures

### Testing Option 1: Interactive HTML Test Page
Located at: `/home/ubuntu/Mediczy/test-coupon-system.html`

**Usage:**
```bash
# Open in browser
http://localhost:3000/test-coupon-system.html
# or
http://YOUR_SERVER_IP:3000/test-coupon-system.html
```

**Features:**
- Test all API endpoints
- Create test coupons
- Validate coupon codes
- Simulate complete purchase flow
- Quick system status check

### Testing Option 2: Manual API Testing

#### 1. Generate Admin Token
```bash
cd /home/ubuntu/Mediczy/server && node -e "
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'ad7a94954fc3bdb4adce9a23b516778b2ce1d945ec068cbbf093aa82535a95ab37350ed908cae1874029aefd6696fd7a67153f4a279a7b3229b11be064f05052';
const token = jwt.sign(
  { userId: 1, id: 1, email: 'admin@mediqzy.com', role: 'admin', isAdmin: true },
  JWT_SECRET,
  { expiresIn: '24h' }
);
console.log(token);
"
```

#### 2. Test Statistics API
```bash
ADMIN_TOKEN="YOUR_TOKEN_HERE"
curl -X GET "http://localhost:3000/api/coupons/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "stats": {
    "total": 0,
    "active": 0,
    "expired": 0,
    "totalUsage": 0
  }
}
```

#### 3. Create Test Coupon
```bash
curl -X POST "http://localhost:3000/api/coupons" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST100",
    "type": "FREE_HC",
    "value": 100,
    "maxUsage": 100,
    "maxUsagePerUser": 1,
    "validFrom": "2026-01-26",
    "validUntil": "2026-02-26",
    "corporateName": "Test Corporate",
    "description": "Test coupon for system verification"
  }' | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Coupon created successfully",
  "coupon": {
    "id": 1,
    "code": "TEST100",
    "type": "FREE_HC",
    "value": 100,
    ...
  }
}
```

#### 4. List All Coupons
```bash
curl -X GET "http://localhost:3000/api/coupons" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
```

#### 5. Validate Coupon (User Flow)
```bash
USER_TOKEN="YOUR_USER_TOKEN_HERE"
curl -X POST "http://localhost:3000/api/wallet/validate-coupon" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "couponCode": "TEST100",
    "hcAmount": 500
  }' | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "valid": true,
  "coupon": {
    "code": "TEST100",
    "type": "FREE_HC",
    "bonusHC": 100
  },
  "bonusHC": 100,
  "message": "Coupon is valid"
}
```

### Testing Option 3: Frontend UI Testing

#### Access Admin Dashboard
1. Login as admin or team member
2. Navigate to sidebar → Finance → Coupons
3. Or directly visit: `/admin/coupons`

#### Create Coupon via UI
1. Click "Create Coupon" button
2. Fill in form:
   - Code: WELCOME2026
   - Type: Select (PERCENTAGE, FIXED_HC, or FREE_HC)
   - Value: Enter discount % or HC amount
   - Max Usage: Total redemptions allowed
   - Valid Until: Expiry date
   - Corporate Name: Optional corporate identifier
3. Click "Create"
4. Verify coupon appears in table

#### Test User Purchase Flow
1. Logout and login as regular user
2. Navigate to Emergency consultation or Wallet
3. Click "Buy Health Coins"
4. Enter coupon code in input field
5. Click "Apply"
6. Verify discount/bonus is shown
7. Complete purchase (use test Razorpay credentials)

## 🐛 Known Issues & Fixes

### Issue 1: Authentication Middleware (FIXED)
- **Problem:** Routes used non-existent `authAdmin` middleware
- **Solution:** Updated to `adminAuthMiddleware` from `admin.middleware.js`
- **Status:** ✅ Fixed and server restarted

### Issue 2: API Key Validation
- **Current Status:** Investigating global API key middleware
- **Workaround:** Testing in progress with proper JWT tokens
- **Next Steps:** Check if API gateway or proxy is intercepting requests

## 📊 Test Scenarios

### Scenario 1: Corporate Bulk Purchase
1. Admin creates coupon: CODE="CORP2026", Type=FREE_HC, Value=1000
2. Corporate distributes code to employees
3. Employee enters code during HC purchase
4. System validates: User hasn't used this code before
5. Purchase completes with 1000 free HC added
6. Usage count increments in database
7. Admin sees usage in dashboard

### Scenario 2: Percentage Discount
1. Admin creates: CODE="SAVE20", Type=PERCENTAGE, Value=20, MinPurchase=500
2. User purchases 500 HC (₹500)
3. Enters coupon code
4. System calculates: 20% discount = ₹100 off
5. User pays ₹400 for 500 HC
6. Transaction recorded in coupon_usages

### Scenario 3: Fixed HC Bonus
1. Admin creates: CODE="BONUS50", Type=FIXED_HC, Value=50
2. User purchases 100 HC
3. Applies coupon
4. Receives 100 + 50 = 150 HC total
5. Usage tracked for reporting

### Scenario 4: Expiry & Limits
1. Coupon with maxUsage=10, maxUsagePerUser=1
2. First 10 users redeem successfully
3. 11th user gets "Coupon usage limit reached"
4. Same user tries again: "Already used this coupon"
5. Expired coupon returns "Coupon has expired"

## 🔍 Verification Checklist

### Database
- [ ] Tables created: `coupons`, `coupon_usages`
- [ ] Models sync on server start
- [ ] Indexes created for performance
- [ ] Foreign key constraints working

### Backend API
- [ ] All 6 admin endpoints respond correctly
- [ ] Validate endpoint works for users
- [ ] Create-order accepts coupon parameter
- [ ] Verify-payment applies discount/bonus
- [ ] Usage count increments correctly
- [ ] Duplicate usage prevention works

### Frontend
- [ ] Admin dashboard accessible at `/admin/coupons`
- [ ] Menu item visible to team/admin users
- [ ] Create coupon form validation works
- [ ] Statistics display correctly
- [ ] Search and filter functional
- [ ] Delete blocked for used coupons
- [ ] Purchase dialog shows coupon input
- [ ] Validation shows real-time feedback

### Integration
- [ ] Complete purchase flow end-to-end
- [ ] Razorpay integration preserves coupon
- [ ] HC balance updates with bonus
- [ ] Transaction history shows discount
- [ ] Admin can view usage reports

## 📝 Test Results Log

### Test Run: [DATE/TIME]
- **Tester:** [NAME]
- **Environment:** [Development/Staging/Production]
- **Results:**
  - Statistics API: ⏳ Pending
  - Create Coupon: ⏳ Pending
  - Validate Coupon: ⏳ Pending
  - Purchase Flow: ⏳ Pending
  - Admin Dashboard: ⏳ Pending

## 🚀 Next Steps

1. **Complete Authentication Testing**
   - Verify admin token authentication works
   - Test with actual admin login credentials
   - Check if API gateway needs configuration

2. **Database Verification**
   - Confirm tables created in PostgreSQL
   - Verify Sequelize sync completed
   - Check table structure matches models

3. **End-to-End Flow**
   - Create real test coupon via UI
   - Complete actual HC purchase with coupon
   - Verify HC credit and usage tracking
   - Check admin usage reports

4. **Performance Testing**
   - Test with multiple concurrent coupon validations
   - Verify race conditions don't allow duplicate usage
   - Check query performance with many coupons

5. **Security Audit**
   - Verify only admins can create/modify coupons
   - Check coupon code tampering prevention
   - Test SQL injection on search fields
   - Validate XSS protection on coupon descriptions

## 📞 Support

For issues or questions:
- Review documentation in `COUPON_SYSTEM_IMPLEMENTATION.md`
- Check server logs: `pm2 logs mediczy-server`
- Test endpoints with provided HTML test page
- Verify database tables exist in PostgreSQL

---
**Last Updated:** January 26, 2026
**Status:** Implementation Complete, Testing In Progress
**Version:** 1.0.0
