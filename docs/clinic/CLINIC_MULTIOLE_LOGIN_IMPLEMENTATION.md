# Clinic Multi-Role Login Implementation Plan

**Date**: January 2, 2026  
**Priority**: HIGH  
**Effort**: 25-30 development hours

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Database Model Updates

#### 1.1 Update Tenant Model
**File**: `server/models/postgres/tenant.model.postgres.js`
**Change**: Add admin credential fields

```diff
+ // Admin Credentials (for clinic admin login)
+ admin_user_id: {
+   type: DataTypes.INTEGER,
+   allowNull: true,
+   references: {
+     model: 'users',
+     key: 'id'
+   },
+   comment: 'Primary admin user ID'
+ },
+ admin_email: {
+   type: DataTypes.STRING(255),
+   allowNull: true,
+   comment: 'Clinic admin email for login'
+ },
+ admin_password: {
+   type: DataTypes.STRING(255),
+   allowNull: true,
+   comment: 'Clinic admin hashed password'
+ },
+ admin_metadata: {
+   type: DataTypes.JSONB,
+   defaultValue: {},
+   comment: 'Admin metadata: phone, lastLogin, loginAttempts, etc.'
+ }
```

**Migration**: Add columns to tenants table
```sql
ALTER TABLE tenants ADD COLUMN admin_user_id INTEGER REFERENCES users(id);
ALTER TABLE tenants ADD COLUMN admin_email VARCHAR(255);
ALTER TABLE tenants ADD COLUMN admin_password VARCHAR(255);
ALTER TABLE tenants ADD COLUMN admin_metadata JSONB DEFAULT '{}';
CREATE INDEX idx_tenants_admin_email ON tenants(admin_email) WHERE admin_email IS NOT NULL;
```

---

### Phase 2: Clinic Admin Login Implementation

#### 2.1 Create Clinic Admin Login Route
**File**: `server/routes/clinic/admin-auth.routes.js` (NEW)

**Features**:
- Email/password authentication
- Rate limiting (same as system admin)
- JWT token generation with clinic context
- Password hashing with bcrypt
- Login attempt tracking
- Clinic status validation

#### 2.2 Update Clinic Auth Routes
**File**: `server/routes/clinic/auth.routes.js`
**Changes**:
- Add admin-login endpoint
- Remove mock data dependency
- Use Tenant model from database
- Add password hashing/verification

---

### Phase 3: Clinic Staff Management

#### 3.1 Create Clinic Staff Routes
**File**: `server/routes/clinic/staff.routes.js` (NEW)

**Endpoints**:
```
POST   /api/clinic/staff/doctors         - Create doctor
POST   /api/clinic/staff/nurses          - Create nurse
POST   /api/clinic/staff/assistants      - Create doctor assistant
GET    /api/clinic/staff/list            - List all staff
GET    /api/clinic/staff/:id             - Get staff details
PATCH  /api/clinic/staff/:id             - Update staff
DELETE /api/clinic/staff/:id             - Delete staff
POST   /api/clinic/staff/bulk-upload     - Bulk create from CSV
GET    /api/clinic/staff/doctors         - List doctors only
GET    /api/clinic/staff/nurses          - List nurses only
GET    /api/clinic/staff/assistants      - List assistants only
```

#### 3.2 Clinic Staff Model Validation
**Ensure**: User model has clinic_id (organization_id) foreign key
**Ensure**: Soft delete support (isActive flag)
**Ensure**: Password hashing on create/update

---

### Phase 4: Clinic Staff Login

#### 4.1 Create Clinic Staff Auth Routes
**File**: `server/routes/clinic/staff-auth.routes.js` (NEW)

**Endpoints**:
```
POST /api/clinic/staff/doctor-login       - Doctor login
POST /api/clinic/staff/nurse-login        - Nurse login
POST /api/clinic/staff/assistant-login    - Doctor assistant login
POST /api/clinic/staff/logout             - Logout
GET  /api/clinic/staff/profile            - Get logged-in staff profile
PUT  /api/clinic/staff/profile            - Update profile
PUT  /api/clinic/staff/change-password    - Change password
```

**Response Format**:
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": 123,
    "email": "doctor@clinic.com",
    "firstName": "Dr.",
    "lastName": "Smith",
    "role": "doctor",
    "specialization": "General Medicine"
  },
  "clinic": {
    "id": 1,
    "name": "Test Medical Clinic",
    "email": "clinic@mediczy.com",
    "phone": "+91-9876543210",
    "city": "Delhi"
  },
  "permissions": [
    "view_appointments",
    "manage_appointments",
    "view_patients",
    "create_prescriptions",
    "view_billing"
  ],
  "expiresIn": 604800
}
```

---

### Phase 5: Backend Middleware Updates

#### 5.1 Update Auth Middleware
**File**: `server/middleware/auth.middleware.js`

**Add**:
```javascript
// Verify clinic staff token
export const verifyClinicStaffToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ensure clinic_id is present
    if (!decoded.clinic_id && !decoded.organization_id) {
      return res.status(403).json({ success: false, message: 'Invalid clinic context' });
    }
    
    req.user = decoded;
    req.clinicId = decoded.clinic_id || decoded.organization_id;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Require clinic admin
export const requireClinicAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'clinic_admin') {
    return res.status(403).json({ success: false, message: 'Clinic admin access required' });
  }
  next();
};

// Require clinic staff (doctor, nurse, or assistant)
export const requireClinicStaff = (req, res, next) => {
  const allowedRoles = ['doctor', 'nurse', 'doctor_assistant'];
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Clinic staff access required' });
  }
  next();
};
```

---

### Phase 6: Create Clinic Admin Controller

#### 6.1 New File: `server/controller/clinic-admin.controller.js`

**Functions**:
```javascript
// Login
export const clinicAdminLogin = async (req, res) => { }

// Create staff (doctor/nurse/assistant)
export const createClinicStaff = async (req, res) => { }

// List clinic staff
export const listClinicStaff = async (req, res) => { }

// Update staff
export const updateClinicStaff = async (req, res) => { }

// Delete staff
export const deleteClinicStaff = async (req, res) => { }

// Get clinic profile
export const getClinicProfile = async (req, res) => { }

// Update clinic settings
export const updateClinicSettings = async (req, res) => { }

// Get dashboard stats
export const getDashboardStats = async (req, res) => { }

// Bulk upload staff
export const bulkUploadStaff = async (req, res) => { }
```

---

### Phase 7: Create Clinic Staff Controller

#### 7.1 New File: `server/controller/clinic-staff.controller.js`

**Functions**:
```javascript
// Doctor, Nurse, Assistant login handlers
export const doctorLogin = async (req, res) => { }
export const nurseLogin = async (req, res) => { }
export const assistantLogin = async (req, res) => { }

// Profile management
export const getStaffProfile = async (req, res) => { }
export const updateStaffProfile = async (req, res) => { }
export const changePassword = async (req, res) => { }

// Clinic-specific profile
export const getClinicContext = async (req, res) => { }
```

---

### Phase 8: Frontend Implementation

#### 8.1 Clinic Admin Login Page
**File**: `client/src/pages/clinic/ClinicAdminLogin.tsx`

**Components**:
- Email/password form
- Remember me checkbox
- Forgot password link
- Sign up for new clinic (link to registration)
- Error display & validation

#### 8.2 Clinic Staff Login Page
**File**: `client/src/pages/clinic/ClinicStaffLogin.tsx`

**Components**:
- Clinic domain/email input
- Staff role selector (Doctor/Nurse/Assistant)
- Email/password form
- Validation & error display

#### 8.3 Clinic Admin Dashboard
**File**: `client/src/pages/clinic/AdminDashboard.tsx`

**Sections**:
- Overview stats (today's appointments, revenue, patients)
- Staff list with management
- Recent appointments
- Quick actions
- Settings link

#### 8.4 Clinic Staff Dashboard
**File**: `client/src/pages/clinic/DoctorDashboard.tsx`, `NurseDashboard.tsx`, `AssistantDashboard.tsx`

**Features**:
- Today's appointments
- Patient list (if authorized)
- Prescription management (for doctors)
- Schedule management
- Messages/notifications

---

## DATABASE SCHEMA SUMMARY

### Tenant Table (Clinic Records)
```sql
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('clinic', 'hospital', ...) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  address JSONB,
  admin_user_id INTEGER REFERENCES users(id),
  admin_email VARCHAR(255),
  admin_password VARCHAR(255),
  admin_metadata JSONB DEFAULT '{}',
  plan VARCHAR(50) DEFAULT 'free',
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### User Table (Clinic Staff)
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255),
  firstName VARCHAR(100),
  lastName VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',  -- 'doctor', 'nurse', 'doctor_assistant'
  organization_id INTEGER REFERENCES tenants(id),  -- Clinic ID
  organization_type VARCHAR(50),  -- 'clinic'
  tenant_id INTEGER REFERENCES tenants(id),
  permissions JSONB DEFAULT '[]',
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(email, organization_id)  -- Email unique per clinic
);
```

---

## EXPECTED OUTCOMES

### Super Admin (admin@mediczy.com)
```
✅ Login to /admin
✅ View all clinics
✅ View all users across platform
✅ Create new clinics
✅ Create clinic admins
✅ Access analytics
✅ Manage billing/plans
```

### Clinic Admin (clinic-specific)
```
✅ Login to /clinic/admin
✅ View only their clinic's staff
✅ Create/manage doctors, nurses, assistants
✅ Manage clinic settings
✅ View clinic analytics
✅ Cannot access other clinics
```

### Clinic Staff (Doctor/Nurse/Assistant)
```
✅ Login with clinic email
✅ View today's appointments
✅ Manage patients (based on role)
✅ Create prescriptions (if doctor)
✅ Manage schedules
✅ Cannot access admin functions
✅ Cannot see other clinics
```

---

## TESTING CHECKLIST

### Authentication Tests
- [ ] Super admin login with admin@mediczy.com
- [ ] Clinic admin login with clinic-specific credentials
- [ ] Doctor login with clinic context
- [ ] Nurse login with clinic context
- [ ] Doctor assistant login with clinic context
- [ ] Invalid credentials rejection
- [ ] Rate limiting on failed attempts
- [ ] Token expiration handling

### Authorization Tests
- [ ] Clinic admin can only create staff for their clinic
- [ ] Doctor cannot access admin functions
- [ ] Staff from clinic A cannot see clinic B's data
- [ ] Super admin can see all clinics

### Functionality Tests
- [ ] Create doctor with specialization
- [ ] Create nurse with role title
- [ ] Create doctor assistant linked to doctor
- [ ] Bulk upload staff from CSV
- [ ] Update staff details
- [ ] Delete/deactivate staff
- [ ] Staff list pagination & filtering

### Data Isolation Tests
- [ ] Clinic A's patients not visible to Clinic B
- [ ] Clinic A's appointments isolated from Clinic B
- [ ] Clinic A's revenue analytics only show Clinic A

---

## DEPLOYMENT STEPS

1. **Database Migration**
   - Run migration to add admin fields to tenants table
   - Create indexes for admin_email

2. **Backend Deployment**
   - Deploy updated models
   - Deploy new routes (admin-auth, staff-auth, staff management)
   - Deploy new controllers
   - Deploy updated middleware

3. **Frontend Deployment**
   - Deploy login pages
   - Deploy admin dashboard
   - Deploy staff dashboards
   - Update routing

4. **Testing**
   - Run full test suite
   - Smoke test all login flows
   - Verify data isolation

5. **Documentation**
   - Update API docs
   - Create admin guide
   - Create staff user guide

---

## TIMELINE ESTIMATE

| Task | Days | Notes |
|------|------|-------|
| Tenant model update | 0.5 | Quick DB change |
| Clinic admin login | 2 | Controller + routes |
| Clinic staff creation | 2 | CRUD operations |
| Clinic staff login | 1.5 | 3 separate endpoints |
| Middleware updates | 0.5 | Auth checks |
| Controllers | 2 | Business logic |
| Frontend (Admin) | 2 | Dashboard + forms |
| Frontend (Staff) | 1 | Login pages |
| Testing | 3 | Comprehensive tests |
| Documentation | 1 | README + guides |
| **TOTAL** | **15 days** | 1 developer |

---

**Status**: Ready for implementation  
**Approval**: Awaiting review & approval to proceed
