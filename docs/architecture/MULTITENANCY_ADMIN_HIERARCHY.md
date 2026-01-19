# Multitenancy Admin Hierarchy - Design Document

**Date**: December 20, 2025  
**Status**: 🔄 In Progress  
**Purpose**: Rework login hierarchy to support organization-level super admins across all tenant types

---

## 📊 Current State Analysis

### Existing Tenant Types
From `tenant.model.postgres.js`:
- ✅ Hospital
- ✅ Clinic
- ✅ Lab
- ✅ Pharmacy
- ✅ Ambulance
- ✅ Corporate
- ✅ Homecare

### Missing Tenant Types (To Add):
- ❌ TPA (Third Party Administrator)
- ❌ PSU (Public Sector Undertaking)
- ❌ NGO (Non-Governmental Organization)
- ❌ Insurer

### Current Admin System
- **Global Admin**: System-level admin (isAdmin: true, role: 'admin' or 'super_admin')
- **No Organization Admins**: Currently no tenant-specific super admins

---

## 🎯 Proposed Hierarchy

### Level 1: System Admins (Platform Level)
**Role**: `system_admin` or `platform_admin`  
**Scope**: Entire Mediczy platform  
**Can Access**: All organizations, all tenants, system-wide settings

```javascript
{
  isAdmin: true,
  role: 'system_admin',
  organization_type: null,
  organization_id: null,
  permissions: ['*'] // All permissions
}
```

**Capabilities**:
- Create/manage any organization
- Access all tenant data (with audit logging)
- System-wide configuration
- Platform analytics
- Billing and subscriptions

---

### Level 2: Organization Super Admins (Tenant Level)
**Role**: `org_admin` or `<type>_admin`  
**Scope**: Single organization (tenant)  
**Can Access**: Only their organization's data

#### Organization Types & Admin Roles:

| Organization Type | Admin Role | Token Key | Scope |
|------------------|-----------|-----------|-------|
| **Hospital** | `hospital_admin` | `hospitalToken` | Single hospital or hospital chain |
| **Clinic** | `clinic_admin` | `clinicToken` | Single clinic or clinic chain |
| **Lab** | `lab_admin` | `labToken` | Single lab or lab chain |
| **Pharmacy** | `pharmacy_admin` | `pharmacyToken` | Single pharmacy or pharmacy chain |
| **TPA** | `tpa_admin` | `tpaToken` | TPA organization |
| **Corporate** | `corporate_admin` | `corporateToken` | Corporate health program |
| **Homecare** | `homecare_admin` | `homecareToken` | Homecare services |
| **PSU** | `psu_admin` | `psuToken` | Public sector organization |
| **NGO** | `ngo_admin` | `ngoToken` | NGO health programs |
| **Insurer** | `insurer_admin` | `insurerToken` | Insurance company |
| **Ambulance** | `ambulance_admin` | `ambulanceToken` | Ambulance services |

**User Model Structure**:
```javascript
{
  isAdmin: false, // Not system admin
  role: 'hospital_admin', // Organization-specific admin role
  organization_type: 'hospital',
  organization_id: 123, // Tenant ID
  tenant_id: 123, // Reference to Tenant table
  permissions: [
    'manage_staff',
    'manage_departments',
    'manage_patients',
    'view_analytics',
    'manage_billing',
    'manage_settings'
  ]
}
```

**Capabilities**:
- Manage organization staff (doctors, nurses, assistants)
- Configure organization settings
- View organization analytics
- Manage organization billing
- Manage departments/specialties
- Patient management within organization
- **Cannot access other organizations**

---

### Level 3: Department/Unit Admins (Sub-Organization Level)
**Role**: `dept_admin` or `unit_admin`  
**Scope**: Department or unit within organization

Examples:
- **Hospital**: Cardiology dept admin, ICU admin, OPD admin
- **Corporate**: HR admin, Benefits admin
- **Lab**: Pathology admin, Radiology admin

```javascript
{
  role: 'dept_admin',
  organization_type: 'hospital',
  organization_id: 123,
  department_id: 45, // Reference to department
  permissions: [
    'manage_dept_staff',
    'view_dept_analytics',
    'manage_dept_schedule'
  ]
}
```

---

### Level 4: Staff/Providers (Operational Level)
**Roles**: `doctor`, `nurse`, `pharmacist`, `lab_technician`, etc.  
**Scope**: Assigned organization, limited to professional duties

```javascript
{
  role: 'doctor',
  organization_type: 'hospital',
  organization_id: 123,
  department_id: 45,
  permissions: [
    'view_patients',
    'create_prescriptions',
    'view_appointments'
  ]
}
```

---

### Level 5: Patients (Consumer Level)
**Role**: `user` or `patient`  
**Scope**: Own data only

```javascript
{
  role: 'user',
  organization_type: null,
  organization_id: null,
  permissions: [
    'view_own_records',
    'book_appointments',
    'view_prescriptions'
  ]
}
```

---

## 🗄️ Database Schema Changes

### 1. Update Tenant Model

**File**: `server/models/postgres/tenant.model.postgres.js`

```javascript
// Add new tenant types
type: {
  type: DataTypes.ENUM(
    'hospital',
    'clinic', 
    'lab',
    'pharmacy',
    'ambulance',
    'corporate',
    'homecare',
    'tpa',          // NEW
    'psu',          // NEW
    'ngo',          // NEW
    'insurer'       // NEW
  ),
  allowNull: false,
  comment: 'Type of healthcare organization'
},

// Add admin user reference
admin_user_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'Primary organization admin user ID',
  references: {
    model: 'users',
    key: 'id'
  }
},

// Add admin email for initial setup
admin_email: {
  type: DataTypes.STRING(255),
  allowNull: true,
  comment: 'Primary admin email for organization'
},

// Add multi-admin support
admin_users: {
  type: DataTypes.JSONB,
  defaultValue: [],
  comment: 'Array of admin user IDs for this organization'
}
```

### 2. Update User Model

**File**: `server/models/postgres/user.model.postgres.js`

```javascript
// Organization Context (Already exists - just document)
organization_type: {
  type: DataTypes.STRING(50),
  allowNull: true,
  comment: 'hospital, clinic, lab, pharmacy, tpa, psu, ngo, insurer, etc.'
},
organization_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'Reference to Tenant ID'
},

// Add tenant reference
tenant_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'tenants',
    key: 'id'
  },
  comment: 'Direct reference to tenant (same as organization_id)'
},

// Expand role enum
role: {
  type: DataTypes.STRING(50),
  defaultValue: 'user',
  comment: 'User role: user, system_admin, hospital_admin, clinic_admin, lab_admin, pharmacy_admin, tpa_admin, psu_admin, ngo_admin, insurer_admin, corporate_admin, homecare_admin, ambulance_admin, dept_admin, doctor, nurse, etc.'
},

// Add department context
department_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'Department/unit ID within organization'
},
department_name: {
  type: DataTypes.STRING(100),
  allowNull: true,
  comment: 'Department name (e.g., Cardiology, HR, Pathology)'
},

// Add permission array
permissions: {
  type: DataTypes.JSONB,
  defaultValue: [],
  comment: 'Array of permission strings'
},

// Add scope restrictions
scope: {
  type: DataTypes.JSONB,
  defaultValue: {},
  comment: 'Access scope restrictions { organization_ids: [], department_ids: [] }'
}
```

### 3. Create Organization Admin Table (Optional)

**File**: `server/models/postgres/organization-admin.model.postgres.js`

```javascript
const OrganizationAdmin = sequelize.define('OrganizationAdmin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM(
      'org_admin',      // Full organization admin
      'dept_admin',     // Department admin
      'billing_admin',  // Billing only
      'hr_admin',       // HR/staff management only
      'reports_admin'   // Analytics/reports only
    ),
    defaultValue: 'org_admin'
  },
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'For dept_admin role'
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Specific permissions for this admin'
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Primary admin for organization'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active'
  }
});
```

---

## 🔐 Authentication & Authorization

### JWT Token Structure

#### System Admin Token:
```javascript
{
  id: 1,
  email: "admin@mediczy.com",
  role: "system_admin",
  isAdmin: true,
  organization_type: null,
  organization_id: null,
  permissions: ["*"],
  scope: "global"
}
```

#### Organization Admin Token (Hospital):
```javascript
{
  id: 123,
  email: "admin@apollohospital.com",
  role: "hospital_admin",
  isAdmin: false,
  organization_type: "hospital",
  organization_id: 45,
  tenant_id: 45,
  permissions: [
    "manage_staff",
    "manage_departments",
    "view_analytics",
    "manage_billing",
    "manage_settings"
  ],
  scope: {
    organization_ids: [45],
    tenant_id: 45
  }
}
```

#### TPA Admin Token:
```javascript
{
  id: 234,
  email: "admin@medsure.com",
  role: "tpa_admin",
  isAdmin: false,
  organization_type: "tpa",
  organization_id: 67,
  tenant_id: 67,
  permissions: [
    "manage_claims",
    "manage_providers",
    "view_analytics",
    "manage_policies"
  ],
  scope: {
    organization_ids: [67],
    tenant_id: 67
  }
}
```

### Middleware Updates

**File**: `server/middleware/auth.middleware.js`

```javascript
// Check if user is system admin
export const requireSystemAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin || req.user.role !== 'system_admin') {
    return res.status(403).json({
      success: false,
      message: 'System admin access required'
    });
  }
  next();
};

// Check if user is organization admin (any type)
export const requireOrgAdmin = (req, res, next) => {
  const orgAdminRoles = [
    'hospital_admin', 'clinic_admin', 'lab_admin', 'pharmacy_admin',
    'tpa_admin', 'psu_admin', 'ngo_admin', 'insurer_admin',
    'corporate_admin', 'homecare_admin', 'ambulance_admin'
  ];
  
  if (!req.user || !orgAdminRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Organization admin access required'
    });
  }
  next();
};

// Check if user has access to specific organization
export const requireOrgAccess = (organizationId) => {
  return (req, res, next) => {
    // System admins can access any organization
    if (req.user.isAdmin && req.user.role === 'system_admin') {
      return next();
    }
    
    // Organization admins can only access their organization
    if (req.user.organization_id !== parseInt(organizationId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this organization'
      });
    }
    
    next();
  };
};

// Check for specific organization type admin
export const requireOrgTypeAdmin = (orgType) => {
  return (req, res, next) => {
    const expectedRole = `${orgType}_admin`;
    
    // System admins can access any organization type
    if (req.user.isAdmin && req.user.role === 'system_admin') {
      return next();
    }
    
    if (req.user.role !== expectedRole) {
      return res.status(403).json({
        success: false,
        message: `${orgType} admin access required`
      });
    }
    
    next();
  };
};
```

---

## 📍 Login Endpoints

### System Admin
- **Endpoint**: `POST /api/admin/login`
- **Token Key**: `adminToken`
- **Redirect**: `/admin/dashboard`
- **Scope**: Global

### Organization Admins

| Organization | Endpoint | Token Key | Redirect | Scope |
|-------------|----------|-----------|----------|-------|
| Hospital | `POST /api/hospital/admin/login` | `hospitalAdminToken` | `/hospital/admin/dashboard` | Single hospital |
| Clinic | `POST /api/clinic/admin/login` | `clinicAdminToken` | `/clinic/admin/dashboard` | Single clinic |
| Lab | `POST /api/lab/admin/login` | `labAdminToken` | `/lab/admin/dashboard` | Single lab |
| Pharmacy | `POST /api/pharmacy/admin/login` | `pharmacyAdminToken` | `/pharmacy/admin/dashboard` | Single pharmacy |
| TPA | `POST /api/tpa/admin/login` | `tpaAdminToken` | `/tpa/admin/dashboard` | Single TPA |
| Corporate | `POST /api/corporate/admin/login` | `corporateAdminToken` | `/corporate/admin/dashboard` | Single corporate |
| Homecare | `POST /api/homecare/admin/login` | `homecareAdminToken` | `/homecare/admin/dashboard` | Single homecare |
| PSU | `POST /api/psu/admin/login` | `psuAdminToken` | `/psu/admin/dashboard` | Single PSU |
| NGO | `POST /api/ngo/admin/login` | `ngoAdminToken` | `/ngo/admin/dashboard` | Single NGO |
| Insurer | `POST /api/insurer/admin/login` | `insurerAdminToken` | `/insurer/admin/dashboard` | Single insurer |
| Ambulance | `POST /api/ambulance/admin/login` | `ambulanceAdminToken` | `/ambulance/admin/dashboard` | Single ambulance |

---

## 🎨 UI/UX Hierarchy

### System Admin Dashboard
**Route**: `/admin/dashboard`  
**Features**:
- Platform-wide analytics
- Manage all organizations
- Create new tenants
- System configuration
- View all users across organizations
- Billing & subscriptions
- Audit logs

### Organization Admin Dashboard
**Route**: `/{org-type}/admin/dashboard`  
**Features**:
- Organization-specific analytics
- Manage organization staff
- Department management
- Organization settings
- Patient management
- Billing (organization level)
- Organization-specific reports
- **Cannot see other organizations**

### Permission Matrix

| Feature | System Admin | Org Admin | Dept Admin | Staff | Patient |
|---------|-------------|-----------|-----------|-------|---------|
| View all organizations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create organizations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage own org staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage departments | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage dept staff | ✅ | ✅ | ✅ | ❌ | ❌ |
| View org analytics | ✅ | ✅ | ✅ (dept) | ❌ | ❌ |
| Org settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage patients | ✅ | ✅ | ✅ | ✅ | ❌ |
| View own records | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🔄 Migration Plan

### Phase 1: Database Schema Updates
1. ✅ Add new tenant types (TPA, PSU, NGO, Insurer)
2. ✅ Add admin fields to Tenant model
3. ✅ Add organization context fields to User model
4. ✅ Create OrganizationAdmin table (optional)

### Phase 2: Authentication Updates
1. ✅ Update JWT token generation for organization context
2. ✅ Create organization-specific login endpoints
3. ✅ Update authentication middleware
4. ✅ Add authorization middleware (requireOrgAdmin, requireOrgAccess)

### Phase 3: API Routes Updates
1. ✅ Create `/api/{org-type}/admin/*` routes
2. ✅ Add organization scope to existing routes
3. ✅ Update access control on all routes
4. ✅ Add audit logging for cross-organization access

### Phase 4: Frontend Updates
1. ✅ Create organization admin login pages
2. ✅ Create organization admin dashboards
3. ✅ Update ringfencing for organization admins
4. ✅ Add organization switcher for system admins

### Phase 5: Data Migration
1. ✅ Identify existing organization data
2. ✅ Create tenant records
3. ✅ Assign admin users to organizations
4. ✅ Migrate organization-specific data

---

## 📝 Next Steps

1. **Immediate**: Update Tenant model to add TPA, PSU, NGO, Insurer types
2. **Short-term**: Add organization admin fields to User model
3. **Medium-term**: Create organization admin login endpoints
4. **Long-term**: Build organization admin dashboards

---

## 🔍 Questions to Resolve

1. **Multi-organization access**: Should some users (like doctors) work across multiple organizations?
2. **Admin hierarchy**: Can organization admins create other admins, or only system admins?
3. **Data isolation**: Should organization admins see ANY data from other organizations?
4. **Billing**: Is billing per organization, or can system admin see all billing?
5. **Analytics**: Can organization admins see cross-organization comparisons?

---

**Status**: Ready for implementation  
**Next Action**: Implement database schema changes
