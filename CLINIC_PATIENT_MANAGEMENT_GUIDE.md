# Clinic Patient Management - Quick Reference

## 📋 Overview

Complete patient management system integrated into clinic portal:
- **Public Signup**: Patients can self-register with clinic
- **Admin Add**: Clinic admin can manually add patients
- **Patient Login**: Patients login with clinic-specific endpoint
- **Patient Management**: Clinic admin can manage all patients

---

## 🔑 Key Endpoints

### Patient Signup (PUBLIC - No Auth Required)
```
POST /api/clinic/:clinicId/patient/signup
```

**Request Body:**
```json
{
  "email": "patient@gmail.com",
  "password": "SecurePass123",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+91-9876543210",
  "date_of_birth": "1990-05-15",
  "gender": "Male",
  "blood_type": "O+",
  "allergies": ["Penicillin", "Aspirin"],
  "address_city": "Mumbai",
  "address_state": "Maharashtra",
  "address_country": "India"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Patient account created successfully",
  "token": "JWT_TOKEN_HERE",
  "patient": {
    "id": 123,
    "email": "patient@gmail.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+91-9876543210",
    "role": "patient",
    "status": "active"
  },
  "clinic": {
    "id": 1,
    "name": "Apollo Hospital",
    "phone": "+91-1234567890",
    "address": {...}
  }
}
```

---

### Patient Login (PUBLIC - No Auth Required)
```
POST /api/clinic/:clinicId/patient/login
```

**Request Body:**
```json
{
  "email": "patient@gmail.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "JWT_TOKEN_HERE",
  "patient": {
    "id": 123,
    "email": "patient@gmail.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+91-9876543210",
    "role": "patient",
    "gender": "Male",
    "blood_type": "O+"
  },
  "clinic": {
    "id": 1,
    "name": "Apollo Hospital",
    "phone": "+91-1234567890",
    "address": {...}
  }
}
```

---

### Clinic Admin - Add Patient
```
POST /api/clinic/:clinicId/patient/add
Headers: Authorization: Bearer CLINIC_ADMIN_TOKEN
```

**Request Body:**
```json
{
  "email": "patient@gmail.com",
  "password": "SecurePass123",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+91-9876543210",
  "date_of_birth": "1990-05-15",
  "gender": "Male",
  "blood_type": "O+",
  "allergies": ["Penicillin"],
  "address_city": "Mumbai",
  "address_state": "Maharashtra"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Patient added successfully",
  "patient": {
    "id": 124,
    "email": "patient@gmail.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+91-9876543210",
    "role": "patient",
    "status": "active",
    "blood_type": "O+",
    "gender": "Male"
  }
}
```

---

### List Clinic Patients
```
GET /api/clinic/:clinicId/patients
Headers: Authorization: Bearer CLINIC_ADMIN_TOKEN
Query Parameters: search, status, limit=20, offset=0
```

**Example Request:**
```
GET /api/clinic/1/patients?search=john&status=active&limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": {
    "patients": [
      {
        "id": 123,
        "email": "patient@gmail.com",
        "firstName": "John",
        "lastName": "Doe",
        "phoneNumber": "+91-9876543210",
        "gender": "Male",
        "bloodType": "O+",
        "status": "active",
        "createdAt": "2026-01-02T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 10,
      "offset": 0,
      "pages": 1
    }
  }
}
```

---

### Get Patient Details
```
GET /api/clinic/:clinicId/patients/:patientId
Headers: Authorization: Bearer CLINIC_ADMIN_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "patient": {
      "id": 123,
      "email": "patient@gmail.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+91-9876543210",
      "dateOfBirth": "1990-05-15",
      "gender": "Male",
      "bloodType": "O+",
      "allergies": ["Penicillin"],
      "address_city": "Mumbai",
      "address_state": "Maharashtra",
      "address_country": "India",
      "status": "active",
      "createdAt": "2026-01-02T10:30:00Z",
      "updatedAt": "2026-01-02T10:30:00Z"
    }
  }
}
```

---

### Update Patient
```
PATCH /api/clinic/:clinicId/patients/:patientId
Headers: Authorization: Bearer CLINIC_ADMIN_TOKEN
```

**Request Body:**
```json
{
  "phone": "+91-9876543210",
  "blood_type": "A+",
  "allergies": ["Penicillin", "Aspirin"],
  "address_city": "Pune",
  "address_state": "Maharashtra",
  "gender": "Male",
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Patient updated successfully",
  "patient": {
    "id": 123,
    "email": "patient@gmail.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+91-9876543210",
    "blood_type": "A+",
    "allergies": ["Penicillin", "Aspirin"],
    "gender": "Male",
    "status": "active"
  }
}
```

---

### Patient Statistics
```
GET /api/clinic/:clinicId/patient-stats
Headers: Authorization: Bearer CLINIC_ADMIN_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "patient_statistics": {
      "total_patients": 150,
      "new_patients_30_days": 25
    }
  }
}
```

---

## 🔐 Patient Permissions & Scope

### Patient Role Permissions:
```json
{
  "appointments": true,      // Can book/view appointments
  "medical_records": true,   // Can view medical records
  "prescriptions": true,     // Can view prescriptions
  "test_results": true,      // Can view lab test results
  "billing": false           // Cannot access billing
}
```

### Patient Scope:
```json
{
  "clinic_id": 1,           // Limited to this clinic
  "access_type": "self_only" // Can only see own data
}
```

---

## 📊 Patient Database Fields

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER | Primary key |
| email | STRING | Unique email (indexed) |
| firstName | STRING | First name |
| lastName | STRING | Last name |
| phoneNumber | STRING | Phone number |
| dateOfBirth | DATE | Date of birth |
| gender | ENUM | Male/Female/Other |
| bloodType | STRING | Blood type (O+, A+, B+, AB+, etc) |
| allergies | ARRAY | Array of allergies |
| role | STRING | Always 'patient' for this model |
| organization_id | INTEGER | Clinic ID (multi-tenancy) |
| organization_type | STRING | Always 'clinic' for clinic patients |
| status | ENUM | active/inactive/suspended |
| address_city | STRING | City |
| address_state | STRING | State |
| address_country | STRING | Country |
| createdAt | TIMESTAMP | Account creation date |
| updatedAt | TIMESTAMP | Last update date |

---

## 🧪 Testing Examples

### 1. Patient Self-Signup
```bash
curl -X POST http://localhost:3000/api/clinic/1/patient/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@gmail.com",
    "password": "SecurePassword123",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+91-9876543210",
    "gender": "Male",
    "blood_type": "O+",
    "allergies": ["Penicillin"]
  }'
```

### 2. Patient Login
```bash
curl -X POST http://localhost:3000/api/clinic/1/patient/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@gmail.com",
    "password": "SecurePassword123"
  }'
```

### 3. Clinic Admin Add Patient
```bash
curl -X POST http://localhost:3000/api/clinic/1/patient/add \
  -H "Authorization: Bearer CLINIC_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@clinic.com",
    "password": "SecurePassword123",
    "first_name": "Jane",
    "last_name": "Smith",
    "phone": "+91-9876543211",
    "blood_type": "A+",
    "allergies": ["Aspirin"]
  }'
```

### 4. List All Patients
```bash
curl -X GET "http://localhost:3000/api/clinic/1/patients?search=john&status=active&limit=10" \
  -H "Authorization: Bearer CLINIC_ADMIN_TOKEN"
```

### 5. Get Patient Details
```bash
curl -X GET http://localhost:3000/api/clinic/1/patients/123 \
  -H "Authorization: Bearer CLINIC_ADMIN_TOKEN"
```

### 6. Update Patient
```bash
curl -X PATCH http://localhost:3000/api/clinic/1/patients/123 \
  -H "Authorization: Bearer CLINIC_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "blood_type": "A+",
    "allergies": ["Penicillin", "Aspirin"],
    "phone": "+91-9876543211"
  }'
```

---

## 🔄 Complete User Journey

### Patient Self-Service
1. Patient visits clinic website
2. Clicks "Sign Up" button
3. Submits signup form at `/api/clinic/:clinicId/patient/signup`
4. Receives JWT token
5. Can login anytime at `/api/clinic/:clinicId/patient/login`
6. Accesses patient dashboard with medical records

### Clinic Admin-Added Patient
1. Clinic admin goes to patient management
2. Clicks "Add Patient"
3. Fills patient form
4. Sends POST to `/api/clinic/:clinicId/patient/add`
5. Patient account created with temporary password
6. Clinic admin can update patient info anytime
7. Patient receives credentials and can login

---

## ⚠️ Important Notes

1. **Password Hashing**: All passwords are hashed with bcrypt before storage
2. **Data Isolation**: Patients from Clinic A cannot see Clinic B data
3. **Rate Limiting**: 5 failed login attempts = 15 minute lockout
4. **Soft Delete**: Patients marked inactive are not deleted, just disabled
5. **Public Endpoints**: Signup and login don't require authentication
6. **Admin Protected**: Patient add/edit/list require clinic admin token

---

**Documentation Date**: January 2, 2026
**System Status**: ✅ Production Ready
