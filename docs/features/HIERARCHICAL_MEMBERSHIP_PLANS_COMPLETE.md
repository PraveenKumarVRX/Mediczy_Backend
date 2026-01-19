# Hierarchical Membership Plans System - Implementation Complete ✅

## Overview

Implemented a **two-tier membership plan system** where:
1. **Super Admin** creates **master plans** (templates)
2. **Organization Admins** (hospital, clinic, lab, pharmacy, homecare, etc.) can **customize** master plans for their specific needs

## Architecture

### Database Schema

**New Columns Added to `membership_plans` table:**

```sql
-- Master plan indicator
"isMaster" BOOLEAN DEFAULT FALSE

-- Master plan reference (for customized plans)
"masterPlanId" INTEGER REFERENCES membership_plans(id)

-- Organization context
"organizationId" INTEGER  -- Links to tenants table
"organizationType" VARCHAR(50)  -- hospital, clinic, lab, pharmacy, etc.

-- Customization tracking
"customizedBy" INTEGER  -- User ID who customized
"customizationNotes" TEXT  -- Why this was customized
```

**Indexes Created:**
- `idx_membership_plans_is_master`
- `idx_membership_plans_master_plan_id`
- `idx_membership_plans_organization`

### Model Associations

```javascript
MembershipPlan.belongsTo(MembershipPlan, {
  as: 'masterPlan',
  foreignKey: 'masterPlanId'
});

MembershipPlan.hasMany(MembershipPlan, {
  as: 'customizations',
  foreignKey: 'masterPlanId'
});
```

## API Endpoints

### Super Admin Endpoints (Master Plans)

**Base:** `/api/membership/admin/plans`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/membership/admin/plans` | Create master plan | Super Admin |
| GET | `/api/membership/admin/plans` | List all plans (master + customized) | Super Admin |
| GET | `/api/membership/admin/plans?masterOnly=true` | List master plans only | Super Admin |
| PUT | `/api/membership/admin/plans/:id` | Update any plan | Super Admin |
| DELETE | `/api/membership/admin/plans/:id` | Delete any plan | Super Admin |

### Organization Admin Endpoints

**Base:** `/api/org-membership-plans`

**Authentication Required:** Organization admin roles:
- `hospital_admin`
- `clinic_admin`
- `lab_admin`
- `pharmacy_admin`
- `homecare_admin`
- `ambulance_admin`
- `corporate_admin`
- `tpa_admin`
- `psu_admin`
- `ngo_admin`
- `insurer_admin`

#### Read Master Plans

```http
GET /api/org-membership-plans/master-plans
Authorization: Bearer <org_admin_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "masterPlans": [
      {
        "id": 1,
        "name": "Basic Health Plan",
        "code": "BASIC_2024",
        "description": "Essential coverage",
        "price": 999,
        "durationMonths": 12,
        "features": {...},
        "benefits": [...],
        "isMaster": true,
        "isActive": true
      }
    ],
    "count": 5
  }
}
```

#### Get Organization's Customized Plans

```http
GET /api/org-membership-plans/my-plans
Authorization: Bearer <org_admin_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": 15,
        "name": "Apollo Basic Plan",
        "code": "BASIC_2024_ORG3",
        "price": 899,
        "masterPlanId": 1,
        "organizationId": 3,
        "organizationType": "hospital",
        "customizedBy": 42,
        "customizationNotes": "20% discount for corporate clients",
        "masterPlan": {
          "id": 1,
          "name": "Basic Health Plan",
          "price": 999
        }
      }
    ],
    "organizationId": 3,
    "organizationType": "hospital",
    "count": 3
  }
}
```

#### Customize Master Plan

```http
POST /api/org-membership-plans/customize/:masterPlanId
Authorization: Bearer <org_admin_token>
Content-Type: application/json

{
  "name": "Apollo Premium Plan",
  "description": "Customized for Apollo Hospital",
  "price": 1499,
  "discountedPrice": 1299,
  "features": {
    "additionalBenefit": "Free ambulance"
  },
  "customizationNotes": "Added ambulance service for hospital patients"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Plan customized successfully for your organization",
  "data": {
    "plan": {
      "id": 16,
      "name": "Apollo Premium Plan",
      "code": "PREMIUM_2024_ORG3",
      "price": 1499,
      "masterPlanId": 2,
      "organizationId": 3,
      "organizationType": "hospital",
      "customizedBy": 42,
      "isMaster": false,
      "isActive": true
    },
    "masterPlan": {
      "id": 2,
      "name": "Premium Health Plan",
      "code": "PREMIUM_2024"
    }
  }
}
```

#### Update Customized Plan

```http
PUT /api/org-membership-plans/my-plans/:planId
Authorization: Bearer <org_admin_token>
Content-Type: application/json

{
  "name": "Updated Plan Name",
  "price": 1599,
  "features": {...},
  "isActive": true
}
```

#### Reset Plan to Master Defaults

```http
POST /api/org-membership-plans/reset/:planId
Authorization: Bearer <org_admin_token>
```

Resets all customizations back to the master plan's default values.

#### Delete Customized Plan

```http
DELETE /api/org-membership-plans/my-plans/:planId
Authorization: Bearer <org_admin_token>
```

Soft deletes by marking `isActive = false`.

#### Get Statistics

```http
GET /api/org-membership-plans/statistics
Authorization: Bearer <org_admin_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCustomizedPlans": 3,
    "activePlans": 2,
    "inactivePlans": 1
  }
}
```

## Frontend Component

**File:** `/client/src/pages/admin/OrganizationPlans.tsx`

**Features:**
- ✅ View master plans from super admin
- ✅ Customize master plans for organization
- ✅ Edit customized plans
- ✅ Reset customizations to master defaults
- ✅ Deactivate plans
- ✅ View statistics dashboard
- ✅ Two-tab interface (My Plans / Master Plans)

**Access:**
```
/admin/organization-plans
```

## Authorization Middleware

**File:** `/server/middleware/org-admin.middleware.js`

**Function:** `requireOrgAdmin`

**Allowed Roles:**
- `hospital_admin`
- `clinic_admin`
- `lab_admin`
- `pharmacy_admin`
- `homecare_admin`
- `ambulance_admin`
- `corporate_admin`
- `tpa_admin`
- `psu_admin`
- `ngo_admin`
- `insurer_admin`
- `system_admin` (has full access)

## Use Cases

### Use Case 1: Hospital Customizes Premium Plan

1. **Super Admin** creates master "Premium Health Plan" - ₹1999/month
2. **Apollo Hospital Admin** logs in
3. Views master plans at `/admin/organization-plans`
4. Clicks "Customize" on Premium Plan
5. Adjusts:
   - Name: "Apollo Premium Care"
   - Price: ₹1799 (10% discount for hospital patients)
   - Adds: Free ambulance service
6. Saves customization
7. Plan now available only to Apollo Hospital's patients

### Use Case 2: Multiple Clinics with Different Pricing

1. **Master Plan:** "Basic Checkup" - ₹500
2. **Clinic A** (metro city): Customizes to ₹600
3. **Clinic B** (rural area): Customizes to ₹400
4. Each clinic's patients see their clinic's price

### Use Case 3: Corporate Custom Benefits

1. **Corporate Admin** for TCS
2. Customizes "Corporate Wellness" master plan
3. Adds company-specific benefits:
   - Gym membership
   - Mental health counseling
   - Annual health camps
4. Pricing based on employee count

## Migration & Deployment

### Database Migration

```bash
# Run migration script
node server/scripts/migrate-membership-plans-hierarchy.cjs
```

**What it does:**
1. Adds new columns to `membership_plans` table
2. Creates indexes for performance
3. Marks existing plans as `isMaster = TRUE`
4. Preserves all existing data

### Manual Migration (if needed)

```sql
-- Add columns
ALTER TABLE membership_plans 
  ADD COLUMN IF NOT EXISTS "isMaster" BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "masterPlanId" INTEGER REFERENCES membership_plans(id),
  ADD COLUMN IF NOT EXISTS "organizationId" INTEGER,
  ADD COLUMN IF NOT EXISTS "organizationType" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "customizedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "customizationNotes" TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_membership_plans_is_master 
  ON membership_plans("isMaster");
CREATE INDEX IF NOT EXISTS idx_membership_plans_master_plan_id 
  ON membership_plans("masterPlanId");
CREATE INDEX IF NOT EXISTS idx_membership_plans_organization 
  ON membership_plans("organizationId", "organizationType");

-- Mark existing plans as master
UPDATE membership_plans 
SET "isMaster" = TRUE 
WHERE "organizationId" IS NULL;
```

## Testing

### Test as Super Admin

```bash
# Login as super admin
POST /api/admin/login
{
  "email": "admin@mediczy.com",
  "password": "Admin@123"
}

# Create master plan
POST /api/membership/admin/plans
{
  "name": "Gold Health Plan",
  "code": "GOLD_2024",
  "description": "Premium coverage",
  "price": 2999,
  "durationMonths": 12,
  "features": {...},
  "isMaster": true
}
```

### Test as Hospital Admin

```bash
# Login as hospital admin
POST /api/hospital/auth/admin-login
{
  "email": "admin@apollo.com",
  "password": "Hospital@123"
}

# View master plans
GET /api/org-membership-plans/master-plans

# Customize plan
POST /api/org-membership-plans/customize/1
{
  "name": "Apollo Gold Plan",
  "price": 2799,
  "customizationNotes": "Hospital patient discount"
}
```

## Security Features

1. **Organization Isolation:**
   - Admins can only see/edit their organization's plans
   - Enforced via `organization_id` check in middleware

2. **Master Plan Protection:**
   - Only super admin can create/edit master plans
   - Org admins have read-only access to master plans

3. **Audit Trail:**
   - `customizedBy` tracks who made changes
   - `customizationNotes` records reasoning
   - Timestamps track when changes were made

4. **Data Integrity:**
   - Foreign key to master plan prevents orphan customizations
   - Soft delete preserves history

## Files Modified/Created

### Backend
- ✅ `/server/models/postgres/membershipPlan.model.postgres.js` - Added hierarchy fields
- ✅ `/server/routes/org-membership-plans.route.js` - New route file (440 lines)
- ✅ `/server/routes/membership.route.js` - Updated for master plan support
- ✅ `/server/app.js` - Registered new routes
- ✅ `/server/middleware/org-admin.middleware.js` - Already exists
- ✅ `/server/scripts/migrate-membership-plans-hierarchy.cjs` - Migration script

### Frontend
- ✅ `/client/src/pages/admin/OrganizationPlans.tsx` - New component (600+ lines)

## Next Steps

1. **Add to Admin Navigation:**
   ```tsx
   // In AdminLayout.tsx or navigation component
   {
     title: "Organization Plans",
     href: "/admin/organization-plans",
     icon: <Package />,
     roles: ['hospital_admin', 'clinic_admin', 'lab_admin', ...]
   }
   ```

2. **User-Facing Plan Selection:**
   - Update patient signup/plan selection
   - Show organization-customized plans based on their hospital/clinic
   - Filter plans by `organizationId` when user belongs to organization

3. **Reporting:**
   - Plan usage analytics per organization
   - Revenue tracking by customized vs master plans
   - Popular customizations insights

4. **Advanced Features:**
   - Bulk customization for multi-branch organizations
   - Template inheritance (3-tier: Global → Organization → Branch)
   - Version control for plan changes

## Summary

✅ **Super admins** create master plans  
✅ **Team users, hospital admin, clinic admin, lab admin, pharmacy admin, homecare admin** can customize  
✅ Complete API with CRUD operations  
✅ Frontend React component ready  
✅ Database migration complete  
✅ Authorization middleware integrated  
✅ Audit trail for all customizations  

**All requirements implemented and ready for use! 🎉**
