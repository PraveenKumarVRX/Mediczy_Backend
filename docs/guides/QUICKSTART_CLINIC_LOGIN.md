# 🚀 Quick Start - Clinic Multi-Role Login System

**Everything you need to get started with the new clinic system**

---

## 1️⃣ Super Admin Creates Clinic

**Who**: System Admin (admin@mediczy.com)

```bash
curl -X POST http://localhost:3000/api/superadmin/clinics \
  -H "Authorization: Bearer SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "clinic_name": "Apollo Hospital",
    "clinic_email": "admin@apollo.com",
    "clinic_phone": "+91-1234567890",
    "admin_email": "clinic.admin@apollo.com",
    "admin_password": "AdminPass@123",
    "admin_first_name": "Rajesh",
    "admin_last_name": "Kumar",
    "clinic_type": "clinic",
    "plan": "professional"
  }'
```

**Response**: 
```json
{
  "success": true,
  "token": "CLINIC_ADMIN_JWT",
  "clinic": {
    "id": 1,
    "name": "Apollo Hospital",
    "admin_email": "clinic.admin@apollo.com"
  }
}
```

---

## 2️⃣ Clinic Admin Logs In

**Who**: Clinic Admin

```bash
curl -X POST http://localhost:3000/api/clinic/admin-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "clinic.admin@apollo.com",
    "password": "AdminPass@123"
  }'
```

**Response**:
```json
{
  "success": true,
  "token": "CLINIC_ADMIN_JWT_TOKEN",
  "clinic": {
    "id": 1,
    "name": "Apollo Hospital"
  }
}
```

---

## 3️⃣ Clinic Admin Creates Doctor

**Who**: Clinic Admin  
**Header**: `Authorization: Bearer CLINIC_ADMIN_JWT`

```bash
curl -X POST http://localhost:3000/api/clinic/1/staff \
  -H "Authorization: Bearer CLINIC_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dr.amit@apollo.com",
    "password": "DoctorPass@123",
    "first_name": "Amit",
    "last_name": "Sharma",
    "phone": "+91-9876543210",
    "role": "doctor",
    "specialization": "Cardiology",
    "license_number": "LIC123456"
  }'
```

---

## 4️⃣ Doctor Logs In

**Who**: Doctor  
**Auth**: Not required

```bash
curl -X POST http://localhost:3000/api/clinic/staff/doctor-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dr.amit@apollo.com",
    "password": "DoctorPass@123"
  }'
```

**Response**:
```json
{
  "success": true,
  "token": "DOCTOR_JWT_TOKEN",
  "doctor": {
    "id": 10,
    "email": "dr.amit@apollo.com",
    "role": "doctor"
  },
  "clinic": {
    "id": 1,
    "name": "Apollo Hospital"
  }
}
```

---

## 5️⃣ Patient Self-Signup

**Who**: Patient (Public)  
**Auth**: Not required

```bash
curl -X POST http://localhost:3000/api/clinic/1/patient/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@gmail.com",
    "password": "PatientPass@123",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+91-9876543211",
    "gender": "Male",
    "blood_type": "O+",
    "allergies": ["Penicillin"],
    "address_city": "Mumbai",
    "address_state": "Maharashtra"
  }'
```

**Response**:
```json
{
  "success": true,
  "token": "PATIENT_JWT_TOKEN",
  "patient": {
    "id": 100,
    "email": "patient@gmail.com",
    "role": "patient"
  },
  "clinic": {
    "id": 1,
    "name": "Apollo Hospital"
  }
}
```

---

## 6️⃣ Patient Login

**Who**: Patient (Public)  
**Auth**: Not required

```bash
curl -X POST http://localhost:3000/api/clinic/1/patient/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@gmail.com",
    "password": "PatientPass@123"
  }'
```

---

## 7️⃣ Clinic Admin Adds Patient Manually

**Who**: Clinic Admin  
**Header**: `Authorization: Bearer CLINIC_ADMIN_JWT`

```bash
curl -X POST http://localhost:3000/api/clinic/1/patient/add \
  -H "Authorization: Bearer CLINIC_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient2@clinic.com",
    "password": "TempPass@123",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+91-9876543212",
    "blood_type": "A+",
    "allergies": ["Aspirin"]
  }'
```

---

## 8️⃣ Clinic Admin Views All Patients

**Who**: Clinic Admin  
**Header**: `Authorization: Bearer CLINIC_ADMIN_JWT`

```bash
curl -X GET "http://localhost:3000/api/clinic/1/patients?limit=10&offset=0" \
  -H "Authorization: Bearer CLINIC_ADMIN_JWT"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "patients": [
      {
        "id": 100,
        "email": "patient@gmail.com",
        "firstName": "John",
        "lastName": "Doe",
        "bloodType": "O+",
        "status": "active"
      },
      {
        "id": 101,
        "email": "patient2@clinic.com",
        "firstName": "Jane",
        "lastName": "Smith",
        "bloodType": "A+",
        "status": "active"
      }
    ],
    "pagination": {
      "total": 2,
      "limit": 10,
      "offset": 0,
      "pages": 1
    }
  }
}
```

---

## 📋 All Role Logins

### Super Admin
```
Email: admin@mediczy.com
Password: Your super admin password
Endpoint: Built-in system (no API endpoint)
Token Use: All /api/superadmin/* endpoints
```

### Clinic Admin
```
Email: clinic.admin@apollo.com
Password: AdminPass@123
Endpoint: POST /api/clinic/admin-login
Token Use: Clinic management endpoints
```

### Doctor
```
Email: dr.amit@apollo.com
Password: DoctorPass@123
Endpoint: POST /api/clinic/staff/doctor-login
Token Use: Patient care endpoints
```

### Nurse
```
Email: nurse@apollo.com
Password: NursePass@123
Endpoint: POST /api/clinic/staff/nurse-login
Token Use: Patient support endpoints
```

### Assistant
```
Email: assistant@apollo.com
Password: AssistPass@123
Endpoint: POST /api/clinic/staff/assistant-login
Token Use: Administrative endpoints
```

### Patient
```
Email: patient@gmail.com
Password: PatientPass@123
Endpoint: POST /api/clinic/1/patient/login
Token Use: Patient dashboard endpoints
```

---

## 🔑 Token Usage Examples

All authenticated endpoints require token in header:

```bash
curl -X GET http://localhost:3000/api/clinic/1/patients \
  -H "Authorization: Bearer JWT_TOKEN_HERE"
```

---

## 🎯 Complete Flow Summary

```
Super Admin
  ↓ Creates clinic + admin
Clinic Admin
  ├─ Creates doctors/nurses/assistants
  ├─ Adds patients
  └─ Manages all users
  ↓
Staff & Patients
  ├─ Doctor: Prescribes, manages patients
  ├─ Nurse: Supports patient care
  ├─ Assistant: Administrative support
  └─ Patient: Accesses medical records
```

---

## ⚡ Key Features

✅ **Multi-Role System**: 6 different user roles  
✅ **Public Signup**: Patients can self-register  
✅ **Admin Management**: Clinic admin manages all  
✅ **Multi-Tenancy**: Complete clinic isolation  
✅ **Security**: JWT + Bcrypt + Rate limiting  
✅ **API Ready**: All endpoints production-ready  

---

## 📝 Important Notes

1. **Passwords**: Always use strong passwords (min 8 chars)
2. **Rate Limiting**: 5 failed logins = 15 min lockout
3. **Data Isolation**: Clinic A staff ≠ Clinic B staff
4. **Tokens**: Valid for 7 days
5. **Soft Delete**: Users marked inactive, not deleted
6. **Public Endpoints**: Signup & login don't need auth

---

## 🆘 Common Issues & Solutions

### Issue: "Clinic not found"
**Solution**: Ensure clinicId in URL matches actual clinic ID

### Issue: "Invalid credentials"
**Solution**: Double-check email and password are correct

### Issue: "Only clinic admin can access"
**Solution**: Use clinic admin token, not patient token

### Issue: "Too many login attempts"
**Solution**: Wait 15 minutes before trying again

---

## 📚 Full Documentation

- **CLINIC_MULTIOLE_LOGIN_PHASE1_COMPLETE.md** - Complete API reference
- **CLINIC_PATIENT_MANAGEMENT_GUIDE.md** - Patient system details
- **IMPLEMENTATION_COMPLETE_SUMMARY.md** - Full implementation overview

---

**Status**: ✅ Production Ready  
**Last Updated**: January 2, 2026  
**Version**: 1.0  

🎉 **Ready to use!**
