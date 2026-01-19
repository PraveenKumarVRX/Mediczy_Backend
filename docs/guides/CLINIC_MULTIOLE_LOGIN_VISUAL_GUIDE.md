# Clinic Multi-Role Login - Visual Architecture & Summary

**Visual Guide for Understanding the Complete System**  
**Date**: January 2, 2026

---

## 🏗️ SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MEDICZY PLATFORM                                    │
│                      (admin@mediczy.com - Super Admin)                       │
│                                                                               │
│  Responsibilities:                                                           │
│  • Create clinics                                                            │
│  • Create clinic admins                                                      │
│  • View all platform data                                                    │
│  • Manage plans & billing                                                    │
│  • Platform-wide analytics                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Creates Clinic
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLINIC A (Organization)                                 │
│                   (admin@clinic-a.com - Clinic Admin)                        │
│                                                                               │
│  Database: Same platform (organization_id = Clinic A ID)                     │
│                                                                               │
│  Responsibilities:                                                           │
│  • Create doctors, nurses, assistants                                        │
│  • Manage clinic settings                                                    │
│  • View clinic-only data                                                     │
│  • Clinic analytics                                                          │
│  • Patient management                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
              │                    │                      │
              │ Creates            │ Creates             │ Creates
              ↓                    ↓                      ↓
        ┌──────────┐         ┌─────────┐          ┌──────────────┐
        │  DOCTOR  │         │  NURSE  │          │  ASSISTANT   │
        │          │         │         │          │              │
        │ Email:   │         │ Email:  │          │ Email:       │
        │ doctor@  │         │ nurse@  │          │ assistant@   │
        │ clinic   │         │ clinic  │          │ clinic-a.com │
        │ -a.com   │         │ -a.com  │          │              │
        │          │         │         │          │ Role:        │
        │ Role:    │         │ Role:   │          │ doctor_      │
        │ doctor   │         │ nurse   │          │ assistant    │
        │          │         │         │          │              │
        │ Scope:   │         │ Scope:  │          │ Scope:       │
        │ Clinic A │         │ Clinic A│          │ Clinic A     │
        │ Data     │         │ Data    │          │ Data         │
        │ Only     │         │ Only    │          │ Only         │
        └──────────┘         └─────────┘          └──────────────┘
```

---

## 📊 DATA ISOLATION MODEL

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL)                        │
│                     Single Instance                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ TENANTS TABLE                                            │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ ID │ NAME           │ TYPE   │ ADMIN_EMAIL              │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 1  │ Clinic A       │ clinic │ admin@clinic-a.com       │  │
│  │ 2  │ Clinic B       │ clinic │ admin@clinic-b.com       │  │
│  │ 3  │ Hospital X     │ hosp   │ admin@hospital-x.com     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                       │
│                          │ Foreign Key                           │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ USERS TABLE                                              │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ ID │ NAME  │ EMAIL      │ ROLE   │ ORG_ID │ PERMISSIONS │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 10 │ Dr. X │ doctor@    │ doctor │  1     │ [...] ✓     │  │
│  │    │       │ clinic-a   │        │        │             │  │
│  │ 11 │ Dr. Y │ doctor@    │ doctor │  2     │ [...] ✓     │  │
│  │    │       │ clinic-b   │        │        │             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Key Isolation Pattern:                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Query: SELECT * FROM users                              │  │
│  │        WHERE organization_id = 1                         │  │
│  │                                                          │  │
│  │ Result: Only users from Clinic A (org_id=1)             │  │
│  │         Dr. X ✓, Dr. Y ✗ (belongs to org_id=2)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 AUTHENTICATION FLOW

### Super Admin Login
```
User enters: admin@mediczy.com + password
                      │
                      ↓
        ┌─────────────────────────┐
        │ POST /api/admin/login   │
        └─────────────────────────┘
                      │
                      ↓
        ┌─────────────────────────┐
        │ Find user in database   │
        │ isAdmin = true          │
        │ role = system_admin     │
        └─────────────────────────┘
                      │
                      ↓
        ┌─────────────────────────┐
        │ Verify password         │
        │ (bcrypt compare)        │
        └─────────────────────────┘
                      │
                      ↓
        ┌─────────────────────────┐
        │ Generate JWT Token:     │
        │ {                       │
        │   id: 1,                │
        │   email: admin@...com   │
        │   role: system_admin    │
        │   permissions: ["*"]    │
        │   expiresIn: "7d"       │
        │ }                       │
        └─────────────────────────┘
                      │
                      ↓
        Access: /admin/dashboard
        Can: Create clinics, view all data
```

### Clinic Admin Login
```
User enters: admin@clinic-a.com + password
                      │
                      ↓
    ┌──────────────────────────────────┐
    │ POST /api/clinic/auth/admin-login│
    └──────────────────────────────────┘
                      │
                      ↓
    ┌──────────────────────────────────┐
    │ Find clinic by admin_email       │
    │ Query: Tenants table             │
    │ WHERE admin_email = input        │
    └──────────────────────────────────┘
                      │
                      ↓
    ┌──────────────────────────────────┐
    │ Verify admin_password            │
    │ (bcrypt compare)                 │
    └──────────────────────────────────┘
                      │
                      ↓
    ┌──────────────────────────────────┐
    │ Generate JWT Token:              │
    │ {                                │
    │   id: 5,                         │
    │   clinicId: 1,                   │
    │   email: admin@clinic-a.com      │
    │   role: clinic_admin             │
    │   permissions: [                 │
    │     'manage_staff',              │
    │     'manage_patients',           │
    │     'view_analytics',            │
    │     ...                          │
    │   ],                             │
    │   expiresIn: "7d"                │
    │ }                                │
    └──────────────────────────────────┘
                      │
                      ↓
    Access: /clinic/admin-dashboard
    Can: Create staff, manage only Clinic A data
```

### Clinic Staff Login (Doctor Example)
```
User enters: doctor@clinic-a.com + password
                      │
                      ↓
    ┌────────────────────────────────┐
    │ POST /api/clinic/staff/        │
    │       doctor-login             │
    └────────────────────────────────┘
                      │
                      ↓
    ┌────────────────────────────────┐
    │ Find user:                      │
    │ WHERE email = input             │
    │ AND role = 'doctor'             │
    │ AND isActive = true             │
    └────────────────────────────────┘
                      │
                      ↓
    ┌────────────────────────────────┐
    │ Verify password                │
    │ (bcrypt compare)               │
    └────────────────────────────────┘
                      │
                      ↓
    ┌────────────────────────────────┐
    │ Generate JWT Token:            │
    │ {                              │
    │   id: 10,                      │
    │   email: doctor@clinic-a.com   │
    │   role: doctor                 │
    │   clinicId: 1,                 │
    │   permissions: [               │
    │     'view_appointments',       │
    │     'manage_appointments',     │
    │     'create_prescriptions',    │
    │     ...                        │
    │   ],                           │
    │   expiresIn: "7d"              │
    │ }                              │
    └────────────────────────────────┘
                      │
                      ↓
    Access: /clinic/doctor-dashboard
    Can: View clinic A appointments, create prescriptions
         Cannot: Manage staff, access Clinic B data
```

---

## 📋 PERMISSION MATRIX

```
┌────────────────────┬──────────┬─────────────┬────────┬─────────┐
│ Permission         │ Super    │ Clinic      │ Doctor │ Nurse   │
│                    │ Admin    │ Admin       │        │         │
├────────────────────┼──────────┼─────────────┼────────┼─────────┤
│ Create Clinic      │    ✓     │      ✗      │   ✗    │   ✗     │
│ Create Clinic Admin│    ✓     │      ✗      │   ✗    │   ✗     │
│ Create Doctor      │    ✓     │      ✓*     │   ✗    │   ✗     │
│ Create Nurse       │    ✓     │      ✓*     │   ✗    │   ✗     │
│ Create Assistant   │    ✓     │      ✓*     │   ✗    │   ✗     │
│ View Appointments  │    ✓     │      ✓*     │   ✓    │   ✓     │
│ Manage Appt        │    ✓     │      ✓*     │   ✓    │   ✓     │
│ Create Prescription│    ✓     │      ✗      │   ✓    │   ✗     │
│ View Patients      │    ✓     │      ✓*     │   ✓    │   ✓     │
│ View Clinic Data   │    ✓     │      ✓*     │   ✓*   │   ✓*    │
│ View All Clinics   │    ✓     │      ✗      │   ✗    │   ✗     │
│ Platform Analytics │    ✓     │      ✗      │   ✗    │   ✗     │
│ Clinic Analytics   │    ✓     │      ✓*     │   ✗    │   ✗     │
│ Manage Settings    │    ✓     │      ✓*     │   ✗    │   ✗     │
│ Manage Billing     │    ✓     │      ✓*     │   ✗    │   ✗     │
└────────────────────┴──────────┴─────────────┴────────┴─────────┘

Legend:
✓  = Full permission
✓* = Only for their own clinic
✗  = No permission
```

---

## 🔄 REQUEST FLOW WITH AUTHENTICATION

```
┌──────────────┐
│ Client Login │
│ Request      │
└──────┬───────┘
       │
       ↓
┌──────────────────────────┐
│ POST /api/clinic/staff/  │
│       doctor-login       │
│ {                        │
│   email: "...",          │
│   password: "..."        │
│ }                        │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Express Server           │
│ Route Handler            │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Validate Input           │
│ • Email required         │
│ • Password required      │
│ • Email format valid     │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Query Database           │
│ SELECT * FROM users      │
│ WHERE email = ?          │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Verify Password          │
│ bcrypt.compare(          │
│   input_password,        │
│   stored_hash            │
│ )                        │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Generate JWT Token       │
│ jwt.sign({               │
│   id, email, role,       │
│   clinicId, permissions  │
│ }, JWT_SECRET)           │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Return Response          │
│ {                        │
│   success: true,         │
│   token: "eyJh...",      │
│   user: {...},           │
│   clinic: {...}          │
│ }                        │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Client Receives Token    │
│ Stores in localStorage   │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Future API Requests      │
│ Header: Authorization:   │
│ Bearer <token>           │
└──────┬───────────────────┘
       │
       ↓
┌──────────────────────────┐
│ Middleware Verifies      │
│ jwt.verify(token,        │
│   JWT_SECRET)            │
│                          │
│ If valid: next()         │
│ If invalid: 401 error    │
└──────────────────────────┘
```

---

## 📱 FEATURE CHECKLIST

### Super Admin (admin@mediczy.com)
```
✅ Login to admin panel
✅ View all clinics in system
✅ Create new clinic
✅ Create clinic admin for each clinic
✅ View all users across platform
✅ View all appointments across platform
✅ View platform-wide analytics
✅ Manage subscription plans
✅ System configuration
✅ View audit logs
✅ Cannot: Access clinic-specific staff data directly
```

### Clinic Admin (clinic-specific)
```
✅ Login with clinic-specific email
✅ View only their clinic's staff
✅ Create doctors
✅ Create nurses
✅ Create doctor assistants
✅ Update staff information
✅ Deactivate staff
✅ View clinic patients
✅ View clinic appointments
✅ View clinic analytics
✅ Manage clinic settings
✅ Cannot: Access other clinics' data
✅ Cannot: Create new clinics
✅ Cannot: Access platform-level features
```

### Doctor (Clinic Staff)
```
✅ Login with clinic email
✅ View today's appointments
✅ Manage appointment status
✅ Create prescriptions
✅ View patient records
✅ View patient vitals
✅ Access own profile
✅ Change own password
✅ Cannot: Create other staff
✅ Cannot: Access clinic settings
✅ Cannot: View billing
✅ Cannot: Access other clinics' data
```

### Nurse (Clinic Staff)
```
✅ Login with clinic email
✅ View today's appointments
✅ Manage appointment status
✅ Update patient vitals
✅ View patient records
✅ View prescriptions
✅ Access own profile
✅ Change own password
✅ Cannot: Create prescriptions
✅ Cannot: Create other staff
✅ Cannot: Access clinic settings
✅ Cannot: View billing
```

### Doctor Assistant (Clinic Staff)
```
✅ Login with clinic email
✅ View appointments
✅ Manage appointment status
✅ View patient list
✅ View patient records
✅ Send notifications
✅ Access own profile
✅ Change own password
✅ Cannot: Create prescriptions
✅ Cannot: Update patient vitals
✅ Cannot: Create other staff
```

---

## 🎯 IMPLEMENTATION PHASES

### Phase 1: Backend Core (5-7 days)
```
Days 1-2:  ┌─ Database model updates
           └─ Add admin fields to Tenant

Days 3-4:  ┌─ Clinic admin login endpoint
           └─ Replace mock with real DB queries

Days 5-6:  ┌─ Clinic staff creation API
           └─ Create doctors, nurses, assistants

Days 7:    ┌─ Clinic staff login endpoints
           ├─ Doctor login
           ├─ Nurse login
           └─ Assistant login

Output: Backend API fully working
Status: Testable with Postman/Curl
```

### Phase 2: Frontend (3-5 days)
```
Days 1-2:  ┌─ Clinic admin login page
           └─ Clinic admin dashboard

Days 3-4:  ┌─ Staff login pages
           ├─ Doctor dashboard
           ├─ Nurse dashboard
           └─ Assistant dashboard

Days 5:    └─ Integration testing

Output: Full UI, user-ready
Status: Ready for staging
```

### Phase 3: Polish & Deploy (2-3 days)
```
Days 1:    ┌─ Security hardening
           ├─ Input validation
           └─ Rate limiting

Days 2:    ├─ Comprehensive testing
           ├─ Bug fixes
           └─ Performance optimization

Days 3:    ├─ Documentation
           ├─ Deployment
           └─ UAT sign-off

Output: Production-ready system
Status: Ready for live deployment
```

---

## 💾 DATABASE RELATIONSHIPS

```
┌─────────────┐
│   TENANTS   │  ← Clinics/Organizations
├─────────────┤
│ id (PK)     │
│ name        │
│ type        │
│ email       │
│ admin_email │ ← NEW
│ admin_pwd   │ ← NEW
│ isActive    │
└────────┬────┘
         │ 1..n
         │ Foreign Key (organization_id)
         │
         ↓
┌──────────────────┐
│      USERS       │  ← All staff/patients
├──────────────────┤
│ id (PK)          │
│ email            │
│ password         │
│ role             │
│ organization_id  │ ← DATA ISOLATION KEY
│ organization_type│
│ permissions      │
│ status           │
│ isActive         │
└──────────────────┘

Additional Relationships:
├─ User → Doctor (userId foreign key)
├─ User → Nurse (userId foreign key)
└─ User → DoctorAssistant (userId foreign key)

Data Isolation Pattern:
All queries MUST include:
WHERE organization_id = :clinicId
```

---

## 🔄 WORKFLOW EXAMPLE

```
1. SUPER ADMIN CREATES CLINIC
   POST /api/admin/tenants
   {
     "name": "Test Medical Clinic",
     "type": "clinic",
     "email": "clinic@mediczy.com",
     "admin_email": "admin@clinic.com",
     "admin_password": "secure123"
   }
   ↓
   Database: New tenant created with id=1
   Admin email and password stored (hashed)

2. CLINIC ADMIN LOGS IN
   POST /api/clinic/auth/admin-login
   {
     "email": "admin@clinic.com",
     "password": "secure123"
   }
   ↓
   Database: Find tenant where admin_email='admin@clinic.com'
   Verify password matches
   Generate JWT: {clinicId: 1, role: 'clinic_admin', ...}

3. CLINIC ADMIN CREATES DOCTOR
   POST /api/clinic/staff/doctors
   Header: Authorization: Bearer <jwt_token>
   {
     "firstName": "John",
     "lastName": "Smith",
     "email": "doctor@clinic.com",
     "password": "doctor123",
     "specialization": "General Medicine"
   }
   ↓
   Middleware: Extract clinicId from token (clinicId=1)
   Verify: Token role = 'clinic_admin' ✓
   Database: Create user with organization_id=1

4. DOCTOR LOGS IN
   POST /api/clinic/staff/doctor-login
   {
     "email": "doctor@clinic.com",
     "password": "doctor123"
   }
   ↓
   Database: Find user where email='doctor@clinic.com'
   Verify: role='doctor' AND organization_id=1
   Generate JWT: {clinicId: 1, role: 'doctor', ...}

5. DOCTOR ACCESSES APPOINTMENTS
   GET /api/clinic/staff/appointments
   Header: Authorization: Bearer <jwt_token>
   ↓
   Middleware: Extract clinicId from token (clinicId=1)
   Database: SELECT * FROM appointments
            WHERE clinic_id=1  ← DATA ISOLATION
   ↓
   Result: Only Clinic 1's appointments returned
           Clinic 2's appointments never visible
```

---

## ✅ FINAL CHECKLIST

### Before Implementation
- [ ] Read EXECUTIVE_SUMMARY.md
- [ ] Understand role hierarchy
- [ ] Review database design
- [ ] Confirm timeline and resources

### During Implementation
- [ ] Follow CODE_GUIDE.md exactly
- [ ] Test each phase before next
- [ ] Keep QUICK_REF.md handy
- [ ] Update IMPLEMENTATION.md progress

### After Implementation
- [ ] Run full test suite
- [ ] Verify data isolation
- [ ] Security audit
- [ ] Load testing
- [ ] Production deployment

---

**Status**: Ready for implementation  
**Quality**: Production-ready architecture  
**Risk Level**: Low (well-designed patterns)  
**Timeline**: 15 days (1 developer, full-time)

---

*This visual guide complements the detailed documentation.*  
*For implementation details, see CLINIC_MULTIOLE_LOGIN_CODE_GUIDE.md*
