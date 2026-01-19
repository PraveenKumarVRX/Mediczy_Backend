# Phase 2 Hospital API - Quick Reference Guide

**Base URL**: `http://localhost:8000/api/hospital/practice`  
**Authentication**: Hospital JWT Token (get from `/hospital/auth/login`)

---

## Insurance Management

### Policy Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/insurance/policies` | List policies |
| POST | `/insurance/policies` | Create policy |

### Claims Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/insurance/claims` | List claims with stats |
| POST | `/insurance/claims` | Submit new claim |
| PATCH | `/insurance/claims/:id` | Update claim status |

---

## Medical Records

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/medical-records` | List records (with filters) |
| POST | `/medical-records` | Create record |
| PATCH | `/medical-records/:id` | Update record |

**Record Types**: consultation, discharge, follow-up, emergency

---

## Electronic Health Records (EHR)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/ehr/:patientId` | Get patient EHR |
| POST | `/ehr` | Create EHR |
| PATCH | `/ehr/:patientId` | Update EHR |

---

## Vital Signs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/vitals` | List vital signs |
| POST | `/vitals` | Record vitals |

**Special Param**: `?latest=true` - Get only latest vital for each patient

---

## Curl Examples

### 1. Get Hospital Token
```bash
curl -X POST http://localhost:8000/api/hospital/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hospital@mediczy.com",
    "password": "Hospital123"
  }' | jq '.token'
```

### 2. Create Insurance Policy
```bash
TOKEN="your_token_here"
curl -X POST http://localhost:8000/api/hospital/practice/insurance/policies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 1,
    "insuranceProvider": "HDFC Ergo",
    "planName": "Premium Health Plan",
    "coverageAmount": 1000000,
    "deductible": 10000,
    "status": "active"
  }'
```

### 3. Submit Insurance Claim
```bash
curl -X POST http://localhost:8000/api/hospital/practice/insurance/claims \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 1,
    "appointmentId": 1,
    "insuranceProvider": "HDFC Ergo",
    "claimAmount": 50000
  }'
```

### 4. List Claims with Stats
```bash
curl -X GET "http://localhost:8000/api/hospital/practice/insurance/claims" \
  -H "Authorization: Bearer $TOKEN" | jq '.stats'
```

### 5. Approve Claim
```bash
CLAIM_ID=1
curl -X PATCH http://localhost:8000/api/hospital/practice/insurance/claims/$CLAIM_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "approvedAmount": 45000
  }'
```

### 6. Create Medical Record
```bash
curl -X POST http://localhost:8000/api/hospital/practice/medical-records \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 1,
    "doctorId": 2,
    "diagnosis": "Hypertension",
    "treatment": "Amlodipine 5mg daily",
    "symptoms": "High BP, headache",
    "recordType": "consultation",
    "vitalSigns": {
      "systolic": 150,
      "diastolic": 95,
      "temperature": 37.5
    }
  }'
```

### 7. Get Medical Records for Patient
```bash
curl -X GET "http://localhost:8000/api/hospital/practice/medical-records?patientId=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

### 8. Create EHR Record
```bash
curl -X POST http://localhost:8000/api/hospital/practice/ehr \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 1,
    "height": 175,
    "weight": 82,
    "bloodType": "O+",
    "allergies": {
      "items": ["Penicillin", "Aspirin"]
    },
    "chronicDiseases": {
      "conditions": ["Hypertension", "Type 2 Diabetes"]
    },
    "emergencyContact": {
      "name": "John Doe",
      "phone": "9876543210",
      "relationship": "Brother"
    }
  }'
```

### 9. Get Patient EHR
```bash
PATIENT_ID=1
curl -X GET http://localhost:8000/api/hospital/practice/ehr/$PATIENT_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

### 10. Record Vital Signs
```bash
curl -X POST http://localhost:8000/api/hospital/practice/vitals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 1,
    "systolic": 145,
    "diastolic": 92,
    "temperature": 37.2,
    "heartRate": 88,
    "respiratoryRate": 16,
    "oxygenSaturation": 98,
    "weight": 80,
    "notes": "Patient BP controlled",
    "recordedBy": 2
  }'
```

### 11. Get Latest Vitals
```bash
curl -X GET "http://localhost:8000/api/hospital/practice/vitals?latest=true" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

---

## Field Reference

### Insurance Policy Fields
```
patientId (required)
insuranceProvider
planName
coverageAmount
remainingAmount
deductible
copay
validFrom (YYYY-MM-DD)
validUpto (YYYY-MM-DD)
status: "active" | "inactive" | "expired" | "cancelled"
```

### Insurance Claim Status Workflow
```
"submitted" → "under_review" → "approved" OR "rejected" → "paid"
```

### Claim Fields
```
patientId (required)
appointmentId
insuranceProvider
claimAmount (required)
approvedAmount
rejectionReason
status
```

### Medical Record Fields
```
patientId (required)
doctorId (required)
appointmentId
diagnosis
treatment
symptoms
recordType: "consultation" | "discharge" | "follow-up" | "emergency"
vitalSigns (JSON)
prescriptions (JSON)
documents (JSON)
```

### EHR Fields
```
patientId (required, unique)
height
weight
bloodType
allergies (JSON)
chronicDiseases (JSON)
medications (JSON)
emergencyContact (JSON)
insuranceDetails (JSON)
```

### Vital Signs Fields
```
patientId (required)
systolic
diastolic
temperature
heartRate
respiratoryRate
oxygenSaturation
weight
height
notes
recordedBy (user ID of healthcare professional)
recordedAt (auto-set to current time)
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 404 | Not Found |
| 409 | Conflict (duplicate, etc) |
| 500 | Server Error |

---

## Test Data

**Hospital Admin**:
- Email: `hospital@mediczy.com`
- Password: `Hospital123`
- Organization ID: `1`

**Sample Patient ID**: `1`  
**Sample Doctor ID**: `2`

---

## Complete Testing Script

See `/home/ubuntu/Mediczy/test-phase2-endpoints.sh` for automated endpoint testing.

Run with:
```bash
bash /home/ubuntu/Mediczy/test-phase2-endpoints.sh
```

---

## Key Features

✅ **Multi-Tenancy**: All data isolated by organization (hospital)  
✅ **JSONB Support**: Flexible medical data storage  
✅ **Auto-Generated IDs**: Unique claim/record/EHR numbers  
✅ **Status Workflows**: Insurance claim approval workflow  
✅ **Filtering**: Powerful query filters for all resources  
✅ **Timestamps**: Automatic created_at/updated_at tracking  
✅ **Organization Isolation**: No data leakage between hospitals  

---

## Common Scenarios

### Scenario 1: Insurance Claim Submission & Approval
```bash
# 1. Create policy for patient
curl -X POST .../insurance/policies -H ... -d '{...}'

# 2. Submit claim
curl -X POST .../insurance/claims -H ... -d '{...}'

# 3. Review and approve
curl -X PATCH .../insurance/claims/1 -H ... -d '{"status":"approved","approvedAmount":45000}'

# 4. Pay claim
curl -X PATCH .../insurance/claims/1 -H ... -d '{"status":"paid","paymentDate":"2026-01-13T10:00:00Z"}'
```

### Scenario 2: Patient Consultation Workflow
```bash
# 1. Create medical record from doctor
curl -X POST .../medical-records -H ... -d '{...}'

# 2. Record vital signs
curl -X POST .../vitals -H ... -d '{...}'

# 3. Create/update EHR
curl -X POST .../ehr -H ... -d '{...}'

# 4. View complete patient history
curl -X GET .../medical-records?patientId=1 -H ...
curl -X GET .../ehr/1 -H ...
curl -X GET .../vitals?patientId=1&latest=true -H ...
```

### Scenario 3: Patient Monitoring
```bash
# Record vitals multiple times
curl -X POST .../vitals -H ... -d '{vital data at 9am}'
curl -X POST .../vitals -H ... -d '{vital data at 12pm}'
curl -X POST .../vitals -H ... -d '{vital data at 5pm}'

# View trend
curl -X GET ".../vitals?patientId=1&fromDate=2026-01-10&toDate=2026-01-14" -H ...
```

---

## Performance Tips

1. **Use Filters**: Don't fetch all records, use `?patientId=X` etc
2. **Latest Vitals**: Use `?latest=true` to get only newest per patient
3. **Date Ranges**: Use `?fromDate=` and `?toDate=` for historical data
4. **Limit Results**: Pagination can be added if needed

---

## Debugging

**View Server Logs**:
```bash
pm2 logs mediczy-server
```

**Check Health**:
```bash
curl http://localhost:8000/api/health
```

**Verify Database Tables**:
```bash
psql -U mediczy_admin -d mediczy_ai -c "\dt"
```

---

**Last Updated**: January 13, 2026  
**Status**: Production Ready ✅
