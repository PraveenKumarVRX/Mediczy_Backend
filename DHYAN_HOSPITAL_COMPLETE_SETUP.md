# Dhyan Hospital Dashboard - Complete Setup Guide

## ✅ All Features Available

**Dhyan hospital now has access to ALL hospital dashboard features:**

| Feature | Route | Status |
|---------|-------|--------|
| Dashboard | `/hospital/dashboard` | ✅ Full access |
| Practice Management | `/hospital/practice-management` | ✅ Appointments, Patients, Staff, Resources |
| Insurance & Billing | `/hospital/insurance-billing` | ✅ Claims tracking |
| Medical Records (MRD) | `/hospital/mrd` | ✅ Record digitization |
| Electronic Health Records (EHR) | `/hospital/ehr` | ✅ Patient records |
| Lab Orders | `/hospital/lab-order` | ✅ Test ordering |
| Imaging Orders | `/hospital/imaging-order` | ✅ X-Ray, CT, MRI, etc. |
| Prescriptions | `/hospital/prescription-creator` | ✅ Rx creation |
| Procedures | `/hospital/procedure-adder` | ✅ OT scheduling |
| Appointments | `/hospital/appointments` | ✅ Scheduling |
| Beds | `/hospital/beds` | ✅ Bed management |
| Patients | `/hospital/patients` | ✅ Patient management |
| Staff | `/hospital/staff` | ✅ Staff management |
| Notifications | `/hospital/notifications` | ✅ Real-time alerts |
| Settings | `/hospital/settings` | ✅ Hospital configuration |
| Support | `/hospital/support` | ✅ Help & support |

---

## 🚀 Quick Start - Login Flow for Dhyan

### **Step 1: Create Dhyan Hospital Admin User**

After creating Dhyan hospital via Admin Panel, you need to create an admin user:

```bash
# Option A: Use API
POST https://dhyan.mediqzy.com/api/hospital/auth/register
{
  "hospitalName": "Dhyan Hospital",
  "email": "admin@dhyanhospital.com",
  "password": "SecurePassword123",
  "phoneNumber": "+91-1234567890",
  "address": "123 Hospital Street",
  "city": "Your City",
  "state": "Your State",
  "pincode": "123456",
  "totalBeds": 100
}
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "hospital": {
    "id": 1,
    "hospitalName": "Dhyan Hospital",
    "email": "admin@dhyanhospital.com",
    "status": "active"
  }
}
```

### **Step 2: Login to Dhyan Hospital**

```
URL: https://dhyan.mediqzy.com/hospital/login
Email: admin@dhyanhospital.com
Password: SecurePassword123
```

Or via API (multitenancy-aware):

```bash
POST https://dhyan.mediqzy.com/api/hospital/auth/login-tenant
{
  "email": "admin@dhyanhospital.com",
  "password": "SecurePassword123"
}
```

### **Step 3: Access Dashboard**

After login, you'll see:
- **Dashboard**: Overview of hospital operations
- **Quick Access Modules**: 8 tiles for main features
- **Recent Data**: Admissions, claims, bed occupancy
- **Sidebar Navigation**: Access all features

---

## 📊 Dashboard Features Breakdown

### **1. Practice Management** 🏥
**Location**: `/hospital/practice-management`

**Features**:
- ✅ **Appointments Tab**: Create, view, edit, delete appointments
- ✅ **Patients Tab**: Register new patients, view patient records
- ✅ **Staff Tab**: Manage doctors, nurses, assistants
- ✅ **Resources Tab**: Manage beds, equipment, facilities
- ✅ **Bed Allocation**: Assign beds to admitted patients

**Actions Available**:
```
• Create new appointment
• Update appointment status
• Register new patient
• Add hospital staff
• Add beds and resources
• Allocate/Release beds
• View patient details
• Search & filter
```

### **2. Insurance & Billing** 💳
**Location**: `/hospital/insurance-billing`

**Features**:
- ✅ Insurance claim tracking
- ✅ Claim status updates
- ✅ Insurance verification
- ✅ Billing records

### **3. Medical Records (MRD)** 📁
**Location**: `/hospital/mrd`

**Features**:
- ✅ Patient medical record digitization
- ✅ Record scanning queue
- ✅ Document storage
- ✅ Record retrieval

### **4. Electronic Health Records (EHR)** 📋
**Location**: `/hospital/ehr`

**Features**:
- ✅ Digital patient records
- ✅ Visit history
- ✅ Diagnosis & treatment
- ✅ Medication history

### **5. Lab Orders** 🧪
**Location**: `/hospital/lab-order`

**Features**:
- ✅ Create lab test orders
- ✅ Order tracking
- ✅ Test result management
- ✅ Report generation

### **6. Imaging Orders** 📸
**Location**: `/hospital/imaging-order`

**Features**:
- ✅ X-Ray, CT, MRI orders
- ✅ Imaging scheduling
- ✅ Result management

### **7. Prescriptions** 💊
**Location**: `/hospital/prescription-creator`

**Features**:
- ✅ Create prescriptions
- ✅ Dosage calculation
- ✅ Print prescriptions
- ✅ Prescription history

### **8. Procedures** ⚕️
**Location**: `/hospital/procedure-adder`

**Features**:
- ✅ Schedule OT procedures
- ✅ Pre-surgery checklists
- ✅ Post-op tracking

---

## 🔐 Multitenancy Data Isolation

**Key Security Features**:

✅ **Hospital Isolation**: Dhyan only sees Dhyan data  
✅ **User Role-Based Access**: Different staff see different features  
✅ **Subdomain Routing**: `dhyan.mediqzy.com` → Dhyan Hospital  
✅ **JWT Token Isolation**: Token contains `tenant_id: dhyan_hospital`  
✅ **Database Filtering**: All queries filtered by `hospital_id`  

**Example**:
```javascript
// When Doctor at Dhyan logs in with token:
{
  "id": 123,
  "email": "doctor@dhyan.com",
  "role": "doctor",
  "hospital_id": dhyan_hospital_id,
  "tenant_id": dhyan_hospital_id
}

// API automatically filters all data:
SELECT * FROM appointments 
WHERE hospital_id = dhyan_hospital_id  // Only Dhyan's data
```

---

## 📱 Staff Roles Supported

In Dhyan Hospital, you can create staff with these roles:

| Role | Permissions | Dashboard Access |
|------|-------------|------------------|
| **Hospital Admin** | Full access, all features | ✅ All pages |
| **Doctor** | Patient care, prescriptions, procedures | ✅ EHR, Lab, Imaging |
| **Nurse** | Patient monitoring, vitals, notes | ✅ Patient records |
| **Staff** | Admin tasks, appointments | ✅ Practice mgmt |
| **Insurance Coordinator** | Claims, billing, verification | ✅ Insurance/Billing |

---

## 🔧 API Endpoints Available

All these endpoints work for Dhyan hospital:

```
GET    /api/hospital/practice              # Get all hospital data
GET    /api/hospital/practice/summary      # Dashboard stats
POST   /api/hospital/practice/appointments # Create appointment
GET    /api/hospital/practice/appointments # List appointments
POST   /api/hospital/practice/patients     # Add patient
GET    /api/hospital/practice/patients     # List patients
POST   /api/hospital/practice/staff        # Add staff
GET    /api/hospital/practice/staff        # List staff
POST   /api/hospital/practice/resources    # Add bed/resource
GET    /api/hospital/practice/resources    # List resources

# Database-backed endpoints (NEW)
POST   /api/hospital/practice/insurance/claims/:id      # Update claims
POST   /api/hospital/practice/mrd/digitization-queue    # Queue for scanning
POST   /api/hospital/practice/discharge-summaries       # Create discharge
POST   /api/hospital/practice/prescriptions             # Create Rx
POST   /api/hospital/practice/ip-sheets                 # Save vitals
POST   /api/hospital/practice/lab-orders                # Order tests
POST   /api/hospital/practice/imaging-orders            # Order imaging
POST   /api/hospital/practice/procedures/schedule       # Schedule OT
```

**All endpoints require**: `Authorization: Bearer {token}`

---

## ✅ Testing Dhyan Hospital Setup

### **Test Checklist**

```
□ Create Dhyan hospital via /admin/tenants
□ Login to https://dhyan.mediqzy.com/hospital/login
□ See dashboard with stats
□ Create appointment via Practice Management
□ Add patient via Patients tab
□ View all features in sidebar
□ Create lab order via Lab Orders
□ Submit insurance claim via Insurance/Billing
□ Verify data isolation (Dhyan only sees Dhyan data)
```

### **Sample Test Data**

**Hospital Admin**:
```
Email: admin@dhyanhospital.com
Password: Admin@123
Role: Hospital Admin
```

**Doctor**:
```
Email: doctor@dhyanhospital.com
Password: Doctor@123
Role: Doctor
```

**Patient**:
```
Name: Rajesh Kumar
Phone: +91-9876543210
Age: 45
Admission: IPD
```

---

## 🎯 Common Tasks

### **Create New Appointment**

```
1. Go to /hospital/practice-management
2. Click "Appointments" tab
3. Click "+ Add Appointment"
4. Fill form:
   - Patient Name
   - Department
   - Doctor
   - Date & Time
   - Type (OPD/IPD)
5. Click "Save"
```

### **Add Staff Member**

```
1. Go to /hospital/practice-management
2. Click "Staff" tab
3. Click "+ Add Staff"
4. Fill form:
   - Name
   - Role (Doctor/Nurse/Staff)
   - Department
   - Email & Phone
5. Click "Save"
```

### **Register Patient**

```
1. Go to /hospital/practice-management
2. Click "Patients" tab
3. Click "+ Add Patient"
4. Fill form:
   - Name, Age, Gender
   - Phone, Email
   - Address
   - Department
5. Click "Save"
```

---

## 📞 Support

**For Dhyan Hospital Support**:
- Admin Panel: `/admin/tenants` (manage hospital)
- Hospital Support: `/hospital/support`
- API Docs: Check individual endpoint documentation
- Contact: support@mediqzy.com

---

## 🔄 Data Flow

```
User Login (dhyan.mediqzy.com)
    ↓
POST /api/hospital/auth/login-tenant
    ↓
Verify email & password in Dhyan tenant
    ↓
Generate JWT with tenant_id=dhyan
    ↓
Store token in localStorage
    ↓
Access /hospital/dashboard
    ↓
All API calls include Bearer token
    ↓
Backend verifies tenant_id from token
    ↓
Return only Dhyan's data
    ↓
✅ Complete isolation!
```

---

## 🎊 Summary

**Dhyan Hospital is now fully operational with:**

✅ Complete dashboard access  
✅ All 8 major modules  
✅ Full practice management  
✅ Insurance & billing  
✅ Medical records  
✅ Lab & imaging orders  
✅ Prescription management  
✅ Procedure scheduling  
✅ Complete data isolation  
✅ Multi-role staff support  
✅ Real-time statistics  

**Ready to go live!** 🚀
