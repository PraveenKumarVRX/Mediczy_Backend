# Clinic Multi-Role Login System - Current State Analysis

**Date**: January 2, 2026  
**Status**: Design Complete - Ready for Implementation  
**Key Document**: MULTITENANCY_ADMIN_HIERARCHY.md

---

## ✅ WHAT'S ALREADY IMPLEMENTED

### 1. **Database Models** ✅
- **Tenant Model** (`server/models/postgres/tenant.model.postgres.js`)
  - Supports multiple tenant types: hospital, clinic, lab, pharmacy, ambulance, corporate, homecare, tpa, psu, ngo, insurer
  - Has fields: name, slug, subdomain, custom_domain, type, email, phone, address, plan, limits
  - Missing: admin_user_id, admin_email, admin_password fields (NEEDS ADDITION)

- **User Model** (`server/models/postgres/user.model.postgres.js`)
  - Multi-tenant support: organization_id, organization_type, tenant_id
  - Role support: role field (user, system_admin, hospital_admin, clinic_admin, doctor, nurse, etc.)
  - Department context: department_id, department_name
  - Permissions: permissions (JSONB array), scope (JSONB object)
  - Status tracking: status, isAdmin, isVerified

- **OrganizationAdmin Model** (`server/models/postgres/organization-admin.model.postgres.js`)
  - User → Tenant many-to-many mapping
  - Admin roles: org_admin, dept_admin, billing_admin, hr_admin, reports_admin, support_admin
  - Status: active, inactive, suspended
  - Permissions & scope fields (JSONB)

- **Doctor Model** (`server/models/postgres/doctor.model.postgres.js`)
  - Full professional profile support
  - Status: active, inactive, suspended, pending

- **Nurse Model** (`server/models/postgres/nurse.model.intelligent.js`)
  - Nurse staff management

- **DoctorAssistant Model** (`server/models/postgres/doctor-assistant.model.postgres.js`)
  - Permissions (JSONB): canViewAppointments, canManageAppointments, canViewPatients, etc.
  - Linked to specific doctor or facility

### 2. **Authentication & Authorization** ✅
- **Admin Controller** (`server/controller/admin.controller.js`)
  - adminLogin() - System admin authentication
  - adminProfile() - Profile management
  - Rate limiting & security checks built-in

- **Auth Middleware** (`server/middleware/auth.middleware.js`, `auth.js`)
  - authUser middleware for general auth
  - requireRole() for role-based access control
  - JWT token generation & verification

- **Routes**
  - Global admin routes: `/api/admin/*` (admin.route.js)
  - Clinic-specific routes: `/api/clinic/auth/*` (clinic/auth.routes.js)
  - Dashboard routes: `/api/clinic/dashboard/*` (clinic/dashboard.routes.js)

### 3. **User Creation & Management** ✅
- Admin can create:
  - Doctors: POST /api/admin/doctors
  - Nurses: POST /api/admin/nurses
  - Assistants: POST /api/admin/assistants
  - Internal users: POST /api/admin/create-internal-user

- Bulk upload support:
  - bulkUploadDoctors()
  - bulkUploadLabs()
  - bulkUploadPharmacies()
  - bulkUploadCorporates()

### 4. **Design Documents** ✅
- **MULTITENANCY_ADMIN_HIERARCHY.md** - Complete role hierarchy
  - Level 1: System Admin (admin@mediczy.com)
  - Level 2: Organization Admin (clinic_admin, hospital_admin, etc.)
  - Level 3: Department Admin (dept_admin)
  - Level 4: Staff (doctor, nurse, pharmacist, lab_technician)
  - Level 5: Patients (user)

- **MULTI_TENANT_LICENSING_ARCHITECTURE.md** - Module-based licensing

---

## ❌ WHAT NEEDS TO BE IMPLEMENTED

### 1. **Clinic Admin Login Endpoint**
**Status**: MOCK DATA ONLY
**File**: `/server/routes/clinic/auth.routes.js`
**Current Issue**: Using hardcoded mockClinic data instead of database

**Required Changes**:
```javascript
// Currently: Uses mockClinic with hardcoded password
// Should use: Tenant model with clinic_admin check

POST /api/clinic/auth/admin-login
{
  email: "clinic-admin@mediczy.com",
  password: "password123"
}

Response:
{
  token: "jwt_token",
  clinic: { id, name, email, ... },
  role: "clinic_admin",
  permissions: ["manage_staff", "manage_patients", ...]
}
```

### 2. **Super Admin Login Endpoint**
**Status**: EXISTS for general admin
**File**: `/server/routes/admin.route.js`, `/server/controller/admin.controller.js`
**Required Enhancement**: Ensure admin@mediczy.com is created with system_admin role

**Endpoint**: `POST /api/admin/login`
- Email: `admin@mediczy.com`
- Role: `system_admin`
- Permissions: All platform-wide

### 3. **Clinic Staff Creation API**
**Status**: EXISTS but not clinic-specific
**Current**: Admin can create doctors/nurses/assistants globally
**Required**: Clinic admin can create staff ONLY for their clinic

**Endpoints to Create/Update**:
```
POST /api/clinic/staff/doctors
POST /api/clinic/staff/nurses  
POST /api/clinic/staff/assistants
GET /api/clinic/staff/list
PATCH /api/clinic/staff/:id/update
DELETE /api/clinic/staff/:id
```

**Staff Creation Payload**:
```javascript
{
  firstName: "Dr. John",
  lastName: "Smith",
  email: "john@clinic.com",
  password: "secure_password",
  role: "doctor",  // doctor, nurse, doctor_assistant
  specialization: "General Medicine",  // for doctors only
  department_id: 1,  // optional
  permissions: ["view_appointments", "manage_patients"],
  isActive: true
}
```

### 4. **Clinic Staff Login Endpoints**
**Status**: NOT IMPLEMENTED
**Required**: Separate login routes for clinic staff with clinic context

**Endpoints**:
```
POST /api/clinic/staff/doctor-login
POST /api/clinic/staff/nurse-login
POST /api/clinic/staff/assistant-login

Response:
{
  token: "jwt_token",
  user: { id, email, name, role },
  clinic: { id, name, phone },
  permissions: ["view_appointments", ...],
  dashboardUrl: "/clinic/doctor-dashboard"
}
```

### 5. **Clinic-Specific Database Schema**
**Status**: PARTIALLY DESIGNED
**Issue**: Multi-tenancy logic exists but clinic-specific data isolation incomplete

**Required**:
- Ensure clinic_id foreign keys on all clinic-related tables
- Row-level security (RLS) policies per clinic
- Clinic domain routing (clinic.domain.com vs base domain)
- Clinic-specific database connection logic (if separate DBs per clinic)

### 6. **Clinic Admin Dashboard API**
**Status**: EXISTS but limited
**File**: `/server/routes/clinic/dashboard.routes.js`
**Current**: Mock stats and appointments only

**Required Endpoints**:
```
GET /api/clinic/dashboard/stats
GET /api/clinic/dashboard/staff
GET /api/clinic/dashboard/patients
GET /api/clinic/dashboard/appointments
GET /api/clinic/dashboard/analytics
POST /api/clinic/dashboard/settings
```

### 7. **Super Admin Dashboard API**
**Status**: EXISTS
**File**: `/server/routes/admin.route.js`
**Current**: Can list users, doctors, labs, pharmacies

**Already has**:
- Dashboard stats
- User/Doctor/Lab/Pharmacy listings
- Team management
- Module access control

---

## 🔐 AUTHENTICATION FLOW

### Super Admin (System Level)
```
admin@mediczy.com:password
    ↓
POST /api/admin/login
    ↓
Verify: isAdmin=true, role=system_admin
    ↓
Generate JWT: { id, email, role: "system_admin", permissions: ["*"] }
    ↓
Access: /admin/dashboard → can manage all clinics/hospitals/labs
```

### Clinic Admin (Organization Level)
```
clinic-admin@clinic.com:password
    ↓
POST /api/clinic/auth/admin-login
    ↓
Verify: clinic exists, admin_email matches, password correct
    ↓
Generate JWT: { id, email, clinic_id, role: "clinic_admin", permissions: [...] }
    ↓
Access: /clinic/admin-dashboard → can manage only their clinic's staff
```

### Clinic Staff (Operational Level)
```
doctor@clinic.com:password
    ↓
POST /api/clinic/staff/doctor-login
    ↓
Verify: user exists, clinic_id matches, role=doctor, isActive=true
    ↓
Generate JWT: { id, email, clinic_id, role: "doctor", permissions: [...] }
    ↓
Access: /clinic/doctor-dashboard → can view appointments, prescriptions, etc.
```

---

## 📊 DATABASE RELATIONSHIPS

```
Tenant (clinics table)
├── id (PK)
├── name
├── email (clinic contact)
├── type: "clinic"
├── [NEW] admin_user_id (FK → users.id)
├── [NEW] admin_email
├── [NEW] admin_password (hashed)
└── admin_metadata (JSONB)

User (staff table)
├── id (PK)
├── email (unique per clinic)
├── password
├── firstName, lastName
├── role: "doctor" | "nurse" | "doctor_assistant"
├── organization_id (FK → Tenant.id)  ← CLINIC ISOLATION
├── organization_type: "clinic"
├── tenant_id (FK → Tenant.id)
├── permissions (JSONB)
├── status: "active" | "inactive"
└── createdAt, updatedAt

OrganizationAdmin (optional, for admin tracking)
├── id (PK)
├── user_id (FK → users.id)
├── tenant_id (FK → tenants.id)
├── admin_role: "org_admin"
├── permissions (JSONB)
└── is_primary: boolean
```

---

## 🚀 IMPLEMENTATION PRIORITY

### Phase 1: IMMEDIATE (High Priority)
1. **Add admin fields to Tenant model** (clinic_admin_id, admin_email, admin_password)
2. **Implement Clinic Admin Login** - Replace mock login with real database
3. **Implement Clinic Staff Creation API** - Clinic admin can create doctors/nurses/assistants
4. **Implement Clinic Staff Login** - Separate endpoints for each role

### Phase 2: SHORT TERM (Medium Priority)
1. **Clinic Staff Management API** - List, update, delete staff
2. **Clinic Admin Dashboard** - Real stats, staff list, analytics
3. **Role-Based Permissions** - Granular access control per role
4. **Audit Logging** - Track all admin actions

### Phase 3: LONG TERM (Nice to Have)
1. **Clinic-Specific Databases** - Separate DB per clinic domain
2. **Multi-Clinic Admin** - One admin managing multiple clinics
3. **API Key Management** - For clinic integrations
4. **Advanced Analytics** - Revenue, patient metrics, etc.

---

## 📝 NEXT STEPS

1. **Update Tenant Model**
   - Add: admin_user_id, admin_email, admin_password (hashed)
   - Add: admin_metadata JSONB field

2. **Implement Clinic Admin Login**
   - File: `/server/routes/clinic/auth.routes.js`
   - Query database instead of mock data
   - Hash password verification

3. **Implement Clinic Staff Creation**
   - File: `/server/routes/clinic/staff.routes.js` (NEW)
   - Validate clinic_id from JWT token
   - Create users with clinic context

4. **Implement Clinic Staff Login**
   - File: `/server/routes/clinic/staff-auth.routes.js` (NEW)
   - Doctor, Nurse, Assistant specific endpoints
   - Return clinic context in response

5. **Create Frontend Components**
   - Clinic admin login page
   - Admin dashboard for staff management
   - Staff creation form with bulk upload

---

## 💾 CURRENT CREDENTIALS TO USE

**Super Admin (Already Created)**:
- Email: `admin@mediczy.com`
- Password: `Admin123` (or as per database)
- Role: `system_admin`
- Access: Global platform

**System Admin Alternative**:
- Email: `admin@mediczy.local`
- Role: `system_admin`

---

## ✨ MIGRATION PATH

**Current State**: System-wide authentication only
**Target State**: Multi-level authentication (Super Admin → Clinic Admin → Clinic Staff)

**No breaking changes** - All existing APIs continue to work
**New APIs** - Added alongside existing ones for backward compatibility

---

## 📚 Reference Files

| Document | Purpose |
|----------|---------|
| `MULTITENANCY_ADMIN_HIERARCHY.md` | Complete role hierarchy design |
| `MULTI_TENANT_LICENSING_ARCHITECTURE.md` | Module licensing design |
| `server/models/postgres/tenant.model.postgres.js` | Tenant/Clinic model |
| `server/models/postgres/user.model.postgres.js` | User/Staff model |
| `server/models/postgres/organization-admin.model.postgres.js` | Admin mapping |
| `server/routes/clinic/auth.routes.js` | Clinic auth (needs update) |
| `server/routes/admin.route.js` | System admin routes |
| `server/controller/admin.controller.js` | Admin business logic |

---

**Status**: ✅ Ready for implementation  
**Effort**: ~20-30 hours for full implementation  
**Risk Level**: Low (well-designed, backward compatible)
