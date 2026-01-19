# Patient Registration System - Multi-Role Access

## Overview
Implemented comprehensive patient registration functionality accessible by **Admin**, **Doctor**, **Nurse**, and **Doctor Assistant** roles with role-specific features and permissions.

---

## 🎯 Key Features

### Multi-Role Access
Patient registration is now available for:
- ✅ **Admin** - Full patient registration with all fields
- ✅ **Doctor** - Register patients with automatic doctor assignment
- ✅ **Nurse** - Register patients with nurse tracking
- ✅ **Assistant** - Register patients linked to assigned doctor

---

## 🔐 API Endpoints

### Backend Routes (`/api/patients/`)

#### Registration Endpoints
1. **POST /admin/register**
   - Authentication: `authUser` (admin role required)
   - Tracks: `registeredBy`, `registeredByRole: 'admin'`
   - Returns: Patient details with ID

2. **POST /doctor/register**
   - Authentication: `authUser` (doctor role required)
   - Auto-assigns: `assignedDoctorId` to registering doctor
   - Tracks: `registeredBy`, `registeredByRole: 'doctor'`
   - Returns: Patient details with doctor assignment

3. **POST /nurse/register**
   - Authentication: `authNurse` middleware
   - Tracks: `registeredBy`, `registeredByRole: 'nurse'`
   - Returns: Patient details

4. **POST /assistant/register**
   - Authentication: `authAssistant` middleware
   - Auto-assigns: `assignedDoctorId` from assistant's linked doctor
   - Tracks: `registeredBy`, `registeredByRole: 'assistant'`
   - Returns: Patient details with doctor assignment

#### Patient List Endpoints
1. **GET /admin/patients**
   - Pagination support (page, limit)
   - Search functionality (name, email, phone)
   - Returns: All patients with pagination

2. **GET /doctor/patients**
   - Returns: Only patients assigned to the doctor

3. **GET /nurse/patients**
   - Returns: Active patients (limit 50)

4. **GET /assistant/patients**
   - Returns: Patients assigned to assistant's linked doctor

---

## 📋 Patient Data Fields

### Required Fields
- `firstName` (2-50 characters)
- `lastName` (2-50 characters)
- `email` (valid email, unique)
- `password` (minimum 4 characters, bcrypt hashed)
- `phoneNumber` (valid mobile number)
- `dateOfBirth` (ISO8601 format)
- `gender` (Male/Female/Other)

### Optional Fields
- `address` - Full residential address
- `emergencyContact` - Emergency contact phone
- `bloodGroup` - A+, A-, B+, B-, AB+, AB-, O+, O-
- `allergies` - Known allergies (text)
- `medicalHistory` - Brief medical history (text)

### System-Generated Fields
- `role: 'patient'` - Auto-assigned
- `isActive: true` - Default active status
- `registeredBy` - ID of registering user
- `registeredByRole` - Role of registering user
- `assignedDoctorId` - Auto-assigned for doctor/assistant registrations

---

## 🎨 Frontend Components

### PatientRegistrationForm Component
**Location:** `/client/src/components/PatientRegistrationForm.tsx`

**Props:**
```typescript
interface PatientRegistrationFormProps {
  role: 'admin' | 'doctor' | 'nurse' | 'assistant';
  onSuccess?: () => void;
  onCancel?: () => void;
}
```

**Features:**
- ✅ Form validation with error display
- ✅ Success notifications
- ✅ Auto-form reset after successful registration
- ✅ Loading states during submission
- ✅ Role-based API endpoint selection
- ✅ Responsive design (mobile-friendly)
- ✅ Organized sections (Personal, Contact, Medical)

**Sections:**
1. **Personal Information**
   - First Name, Last Name
   - Date of Birth, Gender

2. **Contact Information**
   - Email, Phone Number
   - Password, Emergency Contact
   - Address

3. **Medical Information**
   - Blood Group (dropdown)
   - Allergies (textarea)
   - Medical History (textarea)

---

## 🚀 Access Routes

### Nurse Portal
- **Dashboard:** http://localhost:9443/nurse/dashboard
- **Register Patient:** http://localhost:9443/nurse/register-patient
- Quick Action Button: "Register Patient" on dashboard

### Assistant Portal
- **Dashboard:** http://localhost:9443/assistant/dashboard
- **Register Patient:** http://localhost:9443/assistant/register-patient
- Quick Action Button: "Register Patient" on dashboard

### Admin Portal
- **Register Patient:** http://localhost:9443/admin/register-patient
- Access: Add button to Users Management page

### Doctor Portal
- API endpoint available: `/api/patients/doctor/register`
- Frontend integration: TBD (add to doctor dashboard)

---

## 🔒 Security Features

### Authentication & Authorization
- JWT token validation for all endpoints
- Role-specific middleware enforcement
- Token extraction from Authorization header
- 403 Forbidden for unauthorized access

### Data Protection
- Password hashing with bcrypt (10 rounds)
- Duplicate email prevention (409 Conflict)
- Input validation using express-validator
- SQL injection protection via Sequelize

### Audit Trail
- Tracks who registered each patient
- Records registering user's role
- Maintains creation timestamps
- Links patients to doctors automatically

---

## 📊 Updated Permissions

### Nurse Permissions (Enhanced)
```json
[
  "View Patients",
  "Register Patients",  // ✨ NEW
  "Record Vitals",
  "Medication Administration",
  "View Appointments",
  "Patient Notes",
  "Lab Results View",
  "Emergency Response",
  "Vital Signs Monitoring",
  "Patient Assessment",
  "Care Plan Updates"
]
```

### Assistant Permissions (Enhanced)
```json
[
  "Manage Appointments",
  "View Patient List",
  "Register Patients",  // ✨ NEW
  "Update Appointment Status",
  "Send Notifications",
  "Manage Schedule",
  "View Reports",
  "Handle Queries",
  "Document Management",
  "Calendar Management",
  "Patient Communication"
]
```

---

## 🧪 Testing

### Test Patient Registration

#### As Nurse:
1. Login: http://localhost:9443/nurse/login (nurse@mediczy.com / Nurse123)
2. Click "Register Patient" quick action
3. Fill form and submit
4. Patient created with `registeredByRole: 'nurse'`

#### As Assistant:
1. Login: http://localhost:9443/assistant/login (assistant@mediczy.com / AssistantPass123)
2. Click "Register Patient" quick action
3. Fill form and submit
4. Patient created with `assignedDoctorId` from assistant's linked doctor

#### API Testing:
```bash
# Nurse Registration
curl -X POST http://localhost:8000/api/patients/nurse/register \
  -H "Authorization: Bearer <nurse_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "patient@test.com",
    "password": "test123",
    "phoneNumber": "+1234567890",
    "dateOfBirth": "1990-01-01",
    "gender": "Male"
  }'

# Get Nurse Patients
curl http://localhost:8000/api/patients/nurse/patients \
  -H "Authorization: Bearer <nurse_token>"
```

---

## 📁 Files Created/Modified

### Backend Files
- ✅ `/server/routes/patient.route.js` - NEW (570+ lines)
  - 4 registration endpoints
  - 4 patient list endpoints
  - Validation rules
  - Role-specific authentication

- ✅ `/server/routes/nurse.route.js` - MODIFIED
  - Added "Register Patients" permission

- ✅ `/server/routes/assistant.route.js` - MODIFIED
  - Added "Register Patients" permission

- ✅ `/server/app.js` - MODIFIED
  - Added patient router import
  - Registered `/api/patients` routes

### Frontend Files
- ✅ `/client/src/components/PatientRegistrationForm.tsx` - NEW
  - Reusable form component
  - Role-based submission
  - Full validation and error handling

- ✅ `/client/src/pages/nurse/NurseRegisterPatient.tsx` - NEW
  - Nurse-specific registration page

- ✅ `/client/src/pages/assistant/AssistantRegisterPatient.tsx` - NEW
  - Assistant-specific registration page

- ✅ `/client/src/pages/admin/AdminRegisterPatient.tsx` - NEW
  - Admin-specific registration page

- ✅ `/client/src/pages/nurse/NurseDashboard.tsx` - MODIFIED
  - Added "Register Patient" quick action button

- ✅ `/client/src/pages/assistant/AssistantDashboard.tsx` - MODIFIED
  - Added "Register Patient" quick action button

- ✅ `/client/src/routes/index.tsx` - MODIFIED
  - Added 3 new registration routes

---

## 🎯 Usage Examples

### Nurse Registration Flow
1. Nurse logs in
2. Sees dashboard with quick actions
3. Clicks "Register Patient"
4. Fills comprehensive form
5. Submits → Patient created
6. Success message → Auto-redirect to dashboard
7. Patient appears in nurse's patient list

### Assistant Registration Flow
1. Assistant logs in (linked to Dr. Roberts)
2. Clicks "Register Patient"
3. Fills patient information
4. Submits → Patient auto-assigned to Dr. Roberts
5. Patient now visible in doctor's patient list

### Admin Registration Flow
1. Admin accesses user management
2. Navigates to patient registration
3. Complete form with all medical fields
4. Patient created with admin tracking

---

## 🔄 Database Schema Updates

### User Model (Enhanced)
```javascript
{
  // Existing fields...
  role: 'patient',
  registeredBy: String,        // ID of registering user
  registeredByRole: String,    // 'admin'|'doctor'|'nurse'|'assistant'
  assignedDoctorId: String,    // Auto-assigned by doctor/assistant
  bloodGroup: String,
  allergies: Text,
  medicalHistory: Text,
  emergencyContact: String
}
```

---

## ✅ Implementation Status

- ✅ Backend API endpoints (4 registration + 4 list)
- ✅ Authentication middleware integration
- ✅ Form validation and error handling
- ✅ Frontend registration form component
- ✅ Role-specific registration pages (3)
- ✅ Dashboard quick action buttons
- ✅ Routes configured
- ✅ Permissions updated
- ✅ PM2 services restarted
- ✅ System ready for use

---

## 🚀 Next Steps

### Recommended Enhancements
1. **Doctor Dashboard Integration**
   - Add "Register Patient" to doctor dashboard
   - Create doctor registration page

2. **Patient List Management**
   - View registered patients
   - Edit patient information
   - Patient search and filtering

3. **Appointment Integration**
   - Link patient registration to appointment booking
   - Quick appointment creation after registration

4. **Advanced Features**
   - Bulk patient import (CSV/Excel)
   - Patient photo upload
   - QR code generation for patient ID
   - SMS/Email notification on registration

5. **Reports & Analytics**
   - Patient registration statistics
   - Registrations by role
   - Patient demographics analysis

---

## 📞 Support

**Patient Registration System Ready!**
All roles can now register patients with appropriate permissions and tracking.

**System Status:** ✅ Production Ready
**Services:** ✅ Running (PM2)
**API Endpoints:** ✅ Active
**Frontend Pages:** ✅ Accessible
