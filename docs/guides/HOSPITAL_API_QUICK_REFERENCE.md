# Hospital Management System - Quick Reference Guide

## 🚀 Quick Start

### Get Authentication Token
```bash
curl -X POST http://localhost:8000/api/hospital/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hospital@mediczy.com","password":"Hospital123"}'
```

### Use Token in Requests
```bash
curl http://localhost:8000/api/hospital/practice/beds \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📋 Beds Management Endpoints

### List All Beds
```bash
GET /api/hospital/practice/beds
```
**Filters:** `status`, `ward`, `bedType`, `patientId`

### Create Bed
```bash
POST /api/hospital/practice/beds
{
  "bedNumber": "ICU-01",
  "ward": "ICU",
  "bedType": "ICU",
  "notes": "Optional notes"
}
```

### Assign Patient to Bed
```bash
PATCH /api/hospital/practice/beds/1
{
  "patientId": 2
}
```
**Result:** Status automatically set to "occupied"

### Release Bed
```bash
PATCH /api/hospital/practice/beds/1
{
  "patientId": null
}
```
**Result:** Status set to "available", releasedAt timestamp recorded

### Delete Bed
```bash
DELETE /api/hospital/practice/beds/1
```
**Note:** Cannot delete occupied beds

---

## 🧪 Labs Management Endpoints

### List Lab Orders
```bash
GET /api/hospital/practice/labs
```
**Filters:** `status`, `priority`, `testCategory`, `patientId`, `doctorId`, `fromDate`, `toDate`

**Status Values:** `pending`, `sample_collected`, `in_progress`, `completed`, `cancelled`
**Priority Values:** `urgent`, `normal`, `routine`

### Create Lab Order
```bash
POST /api/hospital/practice/labs
{
  "patientId": 2,
  "doctorId": 1,
  "testType": "Complete Blood Count",
  "testCategory": "Blood",
  "priority": "urgent",
  "notes": "Optional notes"
}
```
**Returns:** Unique `orderNumber` like `LAB1768306869209871`

### Update Lab Order Status
```bash
PATCH /api/hospital/practice/labs/1
{
  "status": "sample_collected",
  "sampleCollectedAt": "2026-01-13T12:00:00Z"
}
```

### Record Lab Results
```bash
PATCH /api/hospital/practice/labs/1
{
  "status": "completed",
  "results": "WBC: 7.5, RBC: 4.8, Hb: 14.2, Platelets: 250"
}
```

---

## 💊 Pharmacy Management Endpoints

### List Inventory
```bash
GET /api/hospital/practice/pharmacy
```
**Filters:** `lowStock` (true/false), `search` (medicine name)

**Low Stock Alert:** Shows items with quantity ≤ reorderLevel

### Add Medicine
```bash
POST /api/hospital/practice/pharmacy
{
  "medicineName": "Paracetamol 500mg",
  "genericName": "Acetaminophen",
  "manufacturer": "MediPharma",
  "quantity": 1000,
  "unit": "tablets",
  "unitPrice": 2.5,
  "reorderLevel": 100
}
```

### Update Inventory
```bash
PATCH /api/hospital/practice/pharmacy/1
{
  "quantity": 950,
  "unitPrice": 2.75,
  "reorderLevel": 150
}
```

### List Prescriptions
```bash
GET /api/hospital/practice/pharmacy/prescriptions
```
**Filters:** `dispensed` (true/false), `patientId`, `fromDate`, `toDate`

### Create Prescription
```bash
POST /api/hospital/practice/pharmacy/prescriptions
{
  "patientId": 2,
  "doctorId": 1,
  "medicineId": 1,
  "dosage": "500mg",
  "frequency": "Twice daily",
  "duration": "7 days",
  "quantity": 14
}
```
**Note:** Automatically checks inventory availability
**Returns:** Unique `dispensingNumber` like `DISP1768306869621537`

### Dispense Prescription
```bash
PATCH /api/hospital/practice/pharmacy/prescriptions/1/dispense
{
  "dispensedBy": 1
}
```
**Result:** 
- Prescription marked as dispensed
- Inventory automatically reduced
- Timestamp recorded

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { /* resource data */ },
  "total": 10
}
```

### List Response with Stats
```json
{
  "success": true,
  "data": [ /* items */ ],
  "total": 3,
  "stats": {
    "available": 3,
    "occupied": 0,
    "maintenance": 0
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

---

## 🔍 Example Workflows

### Complete Bed Assignment Workflow
```bash
# 1. Get available beds
curl GET /beds?status=available -H "Authorization: Bearer $TOKEN"

# 2. Assign patient to bed
curl PATCH /beds/1 -d '{"patientId": 2}' -H "Authorization: Bearer $TOKEN"

# 3. Verify assignment
curl GET /beds -H "Authorization: Bearer $TOKEN"

# 4. Later: Release bed
curl PATCH /beds/1 -d '{"patientId": null}' -H "Authorization: Bearer $TOKEN"
```

### Complete Lab Order Workflow
```bash
# 1. Create lab order
ORDER=$(curl POST /labs -d {...} -H "Authorization: Bearer $TOKEN" | jq -r '.data.id')

# 2. Collect sample
curl PATCH /labs/$ORDER -d '{"status": "sample_collected"}' -H "Authorization: Bearer $TOKEN"

# 3. Process in lab
curl PATCH /labs/$ORDER -d '{"status": "in_progress"}' -H "Authorization: Bearer $TOKEN"

# 4. Enter results
curl PATCH /labs/$ORDER -d '{"status": "completed", "results": "..."}' -H "Authorization: Bearer $TOKEN"
```

### Complete Pharmacy Workflow
```bash
# 1. Check inventory
curl GET /pharmacy -H "Authorization: Bearer $TOKEN"

# 2. Add medicine if needed
curl POST /pharmacy -d {...} -H "Authorization: Bearer $TOKEN"

# 3. Create prescription
PRESC=$(curl POST /pharmacy/prescriptions -d {...} -H "Authorization: Bearer $TOKEN" | jq -r '.data.id')

# 4. Dispense medication
curl PATCH /pharmacy/prescriptions/$PRESC/dispense -d '{"dispensedBy": 1}' -H "Authorization: Bearer $TOKEN"

# 5. Verify inventory reduced
curl GET /pharmacy -H "Authorization: Bearer $TOKEN"
```

---

## 🛡️ Authentication & Multi-Tenancy

All endpoints require:
1. **Bearer token** in Authorization header
2. **Hospital role** in token
3. **Organization ID** automatically extracted from token

### Token Claims
```json
{
  "id": 1,
  "email": "hospital@mediczy.com",
  "role": "hospital",
  "iat": 1768306731,
  "exp": 1768911531
}
```

### Multi-Tenant Isolation
- All data filtered by `organization_id`
- Hospital can only see its own beds, labs, and pharmacy
- No data leakage between hospitals

---

## 📈 Common Queries

### Get all urgent lab orders
```bash
curl GET "/api/hospital/practice/labs?priority=urgent" \
  -H "Authorization: Bearer $TOKEN"
```

### Get low-stock medicines
```bash
curl GET "/api/hospital/practice/pharmacy?lowStock=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Get occupied beds
```bash
curl GET "/api/hospital/practice/beds?status=occupied" \
  -H "Authorization: Bearer $TOKEN"
```

### Get pending prescriptions
```bash
curl GET "/api/hospital/practice/pharmacy/prescriptions?dispensed=false" \
  -H "Authorization: Bearer $TOKEN"
```

### Get completed lab orders
```bash
curl GET "/api/hospital/practice/labs?status=completed" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🐛 Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Missing or invalid token | Use valid hospital login token |
| 403 Forbidden | Wrong role in token | Login with hospital account |
| 404 Not Found | Resource doesn't exist | Verify ID is correct |
| 400 Bad Request | Missing required field | Check request payload |
| 409 Conflict | Duplicate entry | Bed number already exists in hospital |

### Debug Mode
Check PM2 logs:
```bash
pm2 logs mediczy-server --lines 50
```

---

## 📚 Testing

### Run all tests
```bash
./test-hospital-endpoints.sh
```

### Run advanced features demo
```bash
./advanced-hospital-features.sh
```

---

## 🔄 Database Info

### Tables
- `beds` - Hospital bed management
- `lab_orders` - Laboratory test orders
- `pharmacy_inventory` - Medicine stock
- `prescription_dispensing` - Prescription dispensing records

### Connection
- Host: localhost
- Port: 5432
- Database: mediczy_ai
- User: mediczy_helper

---

## 📞 Support Information

**Hospital Credentials:**
- Email: hospital@mediczy.com
- Password: Hospital123

**Patient Credentials:**
- Email: user@mediczy.com
- Password: User123

**Doctor Credentials:**
- Email: doctor@mediczy.com
- Password: Doctor123

---

## ✅ Verification Checklist

- [x] Hospital authentication working
- [x] Beds management endpoints working
- [x] Labs management endpoints working
- [x] Pharmacy management endpoints working
- [x] Inventory tracking working
- [x] Prescription dispensing working
- [x] Multi-tenant isolation working
- [x] Error handling working
- [x] All data persisting correctly

---

**Last Updated:** January 13, 2026  
**Status:** Production Ready ✅
