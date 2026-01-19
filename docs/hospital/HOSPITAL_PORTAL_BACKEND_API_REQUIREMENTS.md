# Hospital Portal Backend API Requirements

**Status:** URGENT - Required for Hospital Portal Data Persistence  
**Priority:** P0 - BLOCKING PRODUCTION DEPLOYMENT  
**Date:** January 7, 2026

---

## 🎯 REQUIRED API ENDPOINTS

The following backend endpoints MUST be implemented to support the fixed hospital portal save operations:

### 1. Insurance & Billing Module

#### Update Insurance Claim
```
PATCH /hospital/insurance/claims/:id
```
**Request Body:**
```json
{
  "status": "Approved" | "Rejected" | "Under Review" | "Pre-Auth Pending" | "Pre-Auth Approved" | "Settled",
  "approvedAmount": 125000,
  "remarks": "Claim approved as per policy terms",
  "updatedAt": "2026-01-07"
}
```

**Response:**
```json
{
  "id": "CLM001",
  "claimNumber": "MED-2024-001234",
  "status": "Approved",
  "approvedAmount": 125000,
  "remarks": "Claim approved as per policy terms",
  "updatedAt": "2026-01-07",
  "timeline": [...]
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 2. Medical Records Department (MRD)

#### Add Record to Digitization Queue
```
POST /hospital/mrd/digitization-queue
```

**Request Body:**
```json
{
  "recordId": "MRD001"
}
```

**Response:**
```json
{
  "id": "DIG001",
  "recordId": "MRD001",
  "mrdNumber": "MRD-2024-001234",
  "patientName": "Rajesh Kumar",
  "status": "Pending",
  "queuedAt": "2026-01-07T10:30:00Z",
  "priority": "Normal"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 3. Discharge Summaries

#### Save Discharge Summary Draft
```
POST /hospital/discharge-summaries
```

**Request Body:**
```json
{
  "patientId": "P001",
  "admissionId": "ADM001",
  "diagnosis": "Acute appendicitis",
  "procedures": ["Appendectomy"],
  "medications": ["Paracetamol 500mg", "Amoxicillin 500mg"],
  "followUp": "Review in 7 days",
  "status": "draft"
}
```

**Response:**
```json
{
  "id": "DS001",
  "patientId": "P001",
  "admissionId": "ADM001",
  "status": "draft",
  "createdAt": "2026-01-07T10:30:00Z",
  "createdBy": "Dr. Sharma"
}
```

#### Submit Discharge Summary for Approval
```
POST /hospital/discharge-summaries/submit
```

**Request Body:**
```json
{
  "patientId": "P001",
  "admissionId": "ADM001",
  "diagnosis": "Acute appendicitis",
  "procedures": ["Appendectomy"],
  "medications": ["Paracetamol 500mg", "Amoxicillin 500mg"],
  "followUp": "Review in 7 days",
  "status": "pending_approval"
}
```

**Response:**
```json
{
  "id": "DS001",
  "status": "pending_approval",
  "submittedAt": "2026-01-07T10:30:00Z",
  "approver": "Dr. Senior Consultant",
  "approvalDeadline": "2026-01-08T10:30:00Z"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 4. Prescriptions

#### Create Digital Prescription
```
POST /hospital/prescriptions
```

**Request Body:**
```json
{
  "patientId": "P001",
  "diagnosis": "Hypertension, Type 2 Diabetes",
  "medications": [
    {
      "name": "Amlodipine",
      "dosage": "5mg",
      "frequency": "Once daily",
      "duration": "30 days",
      "instructions": "Take in the morning"
    },
    {
      "name": "Metformin",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "30 days",
      "instructions": "Take after meals"
    }
  ],
  "notes": "Regular BP and blood sugar monitoring advised",
  "doctorId": "DOC001"
}
```

**Response:**
```json
{
  "id": "RX001",
  "prescriptionNumber": "RX-2024-001234",
  "patientId": "P001",
  "doctorId": "DOC001",
  "medications": [...],
  "createdAt": "2026-01-07T10:30:00Z",
  "validUntil": "2026-02-06T23:59:59Z"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 5. Inpatient (IP) Monitoring Sheets

#### Save IP Sheet Data
```
POST /hospital/ip-sheets
```

**Request Body:**
```json
{
  "patientId": "P001",
  "sheetType": "vitals" | "intake-output" | "medication" | "nursing-notes",
  "data": {
    // Sheet-specific data structure
    "bloodPressure": "120/80",
    "temperature": "98.6°F",
    "heartRate": "72 bpm",
    "respiratoryRate": "16 breaths/min"
  },
  "timestamp": "2026-01-07T10:30:00Z"
}
```

**Response:**
```json
{
  "id": "IPS001",
  "patientId": "P001",
  "sheetType": "vitals",
  "timestamp": "2026-01-07T10:30:00Z",
  "recordedBy": "Nurse Kumar"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 6. Branch & Clinic Management

#### Add New Hospital Branch
```
POST /hospital/branches
```

**Request Body:**
```json
{
  "name": "City Hospital - Electronic City Branch",
  "type": "branch" | "main",
  "address": "123, EC Phase 1",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560100",
  "phone": "+91 80 1234 5678",
  "email": "eCity@cityhospital.com",
  "manager": {
    "name": "Dr. Priya Sharma",
    "phone": "+91 98765 43210"
  }
}
```

**Response:**
```json
{
  "id": "HB004",
  "name": "City Hospital - Electronic City Branch",
  "type": "branch",
  "status": "active",
  "establishedDate": "2026-01-07",
  "createdAt": "2026-01-07T10:30:00Z"
}
```

#### Add Outreach Clinic
```
POST /hospital/clinics
```

**Request Body:**
```json
{
  "name": "Mobile Health Camp - Rural Area",
  "type": "mobile" | "daily" | "weekly" | "monthly",
  "parentBranch": "HB001",
  "location": {
    "name": "Village Community Center",
    "address": "XYZ Village",
    "city": "Bangalore Rural",
    "state": "Karnataka",
    "pincode": "560200"
  },
  "schedule": {
    "days": ["Monday", "Wednesday", "Friday"],
    "startTime": "09:00",
    "endTime": "17:00"
  },
  "doctor": {
    "name": "Dr. Anil Kumar",
    "phone": "+91 98765 54321",
    "specialization": "General Medicine"
  },
  "services": ["General Checkup", "Vaccinations", "Basic Lab"],
  "capacity": 50
}
```

**Response:**
```json
{
  "id": "OC005",
  "name": "Mobile Health Camp - Rural Area",
  "type": "mobile",
  "status": "active",
  "launchDate": "2026-01-07",
  "createdAt": "2026-01-07T10:30:00Z"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 7. Ambulance Fleet Management

#### Register New Ambulance Vehicle
```
POST /hospital/ambulances/vehicles
```

**Request Body:**
```json
{
  "vehicleNumber": "KA-01-XY-1234",
  "type": "BLS" | "ALS" | "PICU" | "NICU" | "Mortuary",
  "driver": {
    "name": "Ramesh Kumar",
    "phone": "+91 98765 43210"
  },
  "paramedic": {
    "name": "Dr. Priya Sharma",
    "phone": "+91 87654 32109"
  },
  "equipment": ["Defibrillator", "Ventilator", "Oxygen", "Cardiac Monitor"]
}
```

**Response:**
```json
{
  "id": "AMB006",
  "vehicleNumber": "KA-01-XY-1234",
  "type": "ALS",
  "status": "available",
  "registeredAt": "2026-01-07T10:30:00Z",
  "currentLocation": "Hospital Parking - Bay 3"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 8. Laboratory Orders

#### Create Lab Test Order
```
POST /hospital/lab-orders
```

**Request Body:**
```json
{
  "patientId": "P001",
  "tests": ["LT001", "LT002", "LT003"],
  "priority": "Routine" | "Urgent" | "Emergency",
  "notes": "Fasting sample required",
  "totalAmount": 1400
}
```

**Response:**
```json
{
  "id": "ORD001",
  "orderNumber": "LAB-2024-001234",
  "patientId": "P001",
  "tests": [...],
  "priority": "Routine",
  "status": "Ordered",
  "orderDate": "2026-01-07T10:30:00Z",
  "requiredDate": "2026-01-07T16:00:00Z",
  "totalAmount": 1400
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 9. Imaging Orders (Radiology)

#### Create Imaging Test Order
```
POST /hospital/imaging-orders
```

**Request Body:**
```json
{
  "patientId": "P001",
  "tests": ["IMG001", "IMG005"],
  "priority": "Routine" | "Urgent" | "Emergency",
  "notes": "Suspected fracture - right femur",
  "totalAmount": 600
}
```

**Response:**
```json
{
  "id": "ORD001",
  "orderNumber": "IMG-2024-001234",
  "patientId": "P001",
  "tests": [...],
  "priority": "Urgent",
  "status": "Ordered",
  "orderDate": "2026-01-07T10:30:00Z",
  "scheduledDate": "2026-01-07T14:00:00Z",
  "totalAmount": 600
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

### 10. Procedure Scheduling

#### Schedule Medical/Surgical Procedure
```
POST /hospital/procedures/schedule
```

**Request Body:**
```json
{
  "procedureId": "PROC001",
  "patientId": "P001",
  "scheduledDate": "2026-01-08",
  "scheduledTime": "10:00",
  "priority": "Routine" | "Urgent" | "Emergency",
  "anesthesiaType": "General",
  "room": "OR-1",
  "notes": "Patient prepared for surgery",
  "estimatedDuration": "1-2 hours"
}
```

**Response:**
```json
{
  "id": "SCH001",
  "scheduleNumber": "PROC-2024-001234",
  "procedureId": "PROC001",
  "patientId": "P001",
  "status": "Scheduled",
  "scheduledDate": "2026-01-08",
  "scheduledTime": "10:00",
  "room": "OR-1",
  "anesthesiaType": "General",
  "createdAt": "2026-01-07T10:30:00Z"
}
```

**Headers Required:**
- `Authorization: Bearer <hospitalToken>`

---

## 🔐 AUTHENTICATION & AUTHORIZATION

All endpoints MUST validate the `Authorization: Bearer <token>` header:

1. **Extract JWT token** from `hospitalToken` in localStorage
2. **Verify token** is valid and not expired
3. **Extract hospital context** from token (hospitalId, staff role, permissions)
4. **Apply filters** - staff can only access their hospital's data
5. **Check permissions** - verify user has rights for the operation

**Example Token Payload:**
```json
{
  "userId": "STAFF001",
  "hospitalId": "HOSP001",
  "role": "doctor" | "nurse" | "admin" | "lab_tech" | "radiologist",
  "permissions": ["read_patients", "write_prescriptions", "schedule_procedures"],
  "exp": 1704632400
}
```

---

## 📊 DATABASE SCHEMA REQUIREMENTS

### Required Tables/Collections:

1. **insurance_claims** - Store claim updates and timeline
2. **mrd_digitization_queue** - Queue for medical record digitization
3. **discharge_summaries** - Patient discharge documentation
4. **prescriptions** - Digital prescriptions with medications
5. **ip_monitoring_sheets** - Inpatient vitals and care data
6. **hospital_branches** - Branch and clinic information
7. **ambulance_fleet** - Vehicle registration and tracking
8. **lab_orders** - Laboratory test orders
9. **imaging_orders** - Radiology/imaging test orders
10. **procedure_schedules** - Surgical/medical procedure bookings

---

## ✅ IMPLEMENTATION CHECKLIST

Backend developers should implement:

- [ ] All 10 endpoint categories with proper routes
- [ ] Request body validation (using Joi, Yup, or similar)
- [ ] JWT authentication middleware
- [ ] Hospital context filtering (multi-tenancy)
- [ ] Role-based access control (RBAC)
- [ ] Database models/schemas
- [ ] Error handling with proper HTTP status codes
- [ ] Logging for audit trail
- [ ] Rate limiting to prevent abuse
- [ ] Integration tests for each endpoint

---

## 🚨 CRITICAL NOTES

1. **Multi-Tenancy:** All data MUST be filtered by `hospitalId` from JWT token
2. **Data Validation:** Validate all inputs to prevent SQL injection / NoSQL injection
3. **Audit Trail:** Log all create/update operations for compliance
4. **Error Messages:** Return descriptive error messages for debugging
5. **Response Format:** Maintain consistent JSON structure across all endpoints

---

## 📝 TESTING ENDPOINTS

**Recommended testing approach:**

1. **Unit Tests:** Test each endpoint with valid/invalid data
2. **Integration Tests:** Test full workflow (create → read → update)
3. **Authorization Tests:** Verify cross-hospital data isolation
4. **Performance Tests:** Ensure endpoints respond within 200ms
5. **Error Handling Tests:** Test network failures, DB errors, etc.

---

## 🎯 DEPLOYMENT PRIORITY

**Deploy in this order:**

1. **Phase 1 (P0 - Critical):**
   - Prescriptions (most used)
   - Lab Orders
   - Imaging Orders
   - Discharge Summaries

2. **Phase 2 (P1 - High):**
   - Insurance Claims
   - Procedure Scheduling
   - IP Sheets

3. **Phase 3 (P2 - Medium):**
   - MRD Digitization
   - Branch Management
   - Ambulance Fleet

---

**Status:** PENDING BACKEND IMPLEMENTATION  
**Blocks:** Hospital Portal Production Deployment  
**Target Completion:** Before Dhyan Health Care Rollout
