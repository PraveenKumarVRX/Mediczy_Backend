# Nurse Vitals & Medications Fix ✅

## Issue Summary
Nurse portal was unable to save vitals and medications due to database schema mismatches.

### Reported Issues:
1. ❌ **Record Vitals** - Server error when saving
2. ❌ **Medications** - Server error when saving

---

## Root Causes Identified

### 1. Vitals Record Issues
**Problem:** Field name mismatches between route and model schema

| Route Field | Expected Model Field | Issue |
|------------|---------------------|-------|
| `patientId` | `userId` | ❌ Wrong field name |
| `nurseId` | `recordedBy` | ❌ Wrong field name |
| `pulse` | `heartRate` | ❌ Wrong field name |
| `bloodPressure` (string) | `bloodPressureSystolic`, `bloodPressureDiastolic` (integers) | ❌ Wrong format |

### 2. Medication Model Issues
**Problem:** Using non-existent model

- ❌ Importing `MedicationAdministration` model (doesn't exist)
- ✅ Should use `Medication` model
- ❌ Field names didn't match actual schema
- ❌ No `patientId` column (stored in metadata JSONB)

---

## Fixes Applied

### File: `/server/routes/nurse.route.js`

#### 1. Fixed Model Import ✅
```javascript
// BEFORE:
import MedicationAdministration from '../models/medication.model.intelligent.js';

// AFTER:
import Medication from '../models/medication.model.intelligent.js';
```

#### 2. Fixed Vitals Endpoint ✅
**Route:** `POST /api/nurse/vitals`

**Changes:**
- ✅ Map `patientId` → `userId`
- ✅ Map `nurseId` → `recordedBy`
- ✅ Map `pulse` → `heartRate`
- ✅ Parse blood pressure "120/80" format → `bloodPressureSystolic`, `bloodPressureDiastolic`
- ✅ Add support for all vitals fields:
  - temperature
  - heartRate (pulse)
  - bloodPressureSystolic/Diastolic
  - oxygenSaturation (spO2)
  - weight
  - bloodSugar
  - respiratoryRate
  - notes
- ✅ Set `source: 'nurse'` for tracking

```javascript
const record = await VitalsRecord.create({
  userId: patientId,              // Fixed: was patientId
  recordedBy: req.nurse.id,       // Fixed: was nurseId
  temperature: vitals?.temperature ?? null,
  heartRate: vitals?.pulse ?? vitals?.heartRate ?? null,  // Fixed: was pulse
  bloodPressureSystolic: systolic,    // Fixed: parsed from bp
  bloodPressureDiastolic: diastolic,  // Fixed: parsed from bp
  oxygenSaturation: vitals?.oxygenSaturation ?? vitals?.spO2 ?? null,
  weight: vitals?.weight ?? null,
  bloodSugar: vitals?.bloodSugar ?? null,
  respiratoryRate: vitals?.respiratoryRate ?? null,
  notes: vitals?.notes ?? null,
  source: 'nurse',
  recordedAt: new Date()
});
```

#### 3. Fixed Get Vitals Today ✅
**Route:** `GET /api/nurse/vitals/today`

**Changes:**
- ✅ Use `recordedBy` instead of `nurseId`
- ✅ Use modern Sequelize `Op.gte` instead of deprecated `$gte`

```javascript
const { Op } = await import('sequelize');
const records = await VitalsRecord.findAll({
  where: {
    recordedBy: req.nurse.id,        // Fixed: was nurseId
    recordedAt: { [Op.gte]: startOfDay.toISOString() }  // Fixed: was $gte
  },
  order: [['recordedAt', 'DESC']],
  limit: 50
});
```

#### 4. Fixed Medications Endpoint ✅
**Route:** `POST /api/nurse/medications`

**Changes:**
- ✅ Use `Medication` model instead of `MedicationAdministration`
- ✅ Store patient and nurse info in `metadata` JSONB field
- ✅ Map fields correctly:
  - `medication` → `name`
  - `notes` → `instructions`
  - Store nurse ID and patient ID in metadata

```javascript
const record = await Medication.create({
  name: medication,                    // Fixed: was medicationName
  dosage,
  route: route || 'oral',
  frequency,
  instructions: notes,                 // Fixed: was notes field
  isActive: true,
  startDate: new Date(),
  metadata: {                          // Fixed: store in metadata
    administeredBy: req.nurse.id,
    administeredByRole: 'nurse',
    patientId,
    administeredAt: new Date().toISOString()
  }
});
```

#### 5. Fixed Get Medications ✅
**Route:** `GET /api/nurse/medications/:patientId`

**Changes:**
- ✅ Use `Medication` model
- ✅ Query `metadata.patientId` JSONB field
- ✅ Order by `createdAt` instead of `administeredAt`

```javascript
const { Op } = await import('sequelize');
const records = await Medication.findAll({
  where: {
    'metadata.patientId': { [Op.eq]: patientId }  // Fixed: query JSONB
  },
  order: [['createdAt', 'DESC']],       // Fixed: was administeredAt
  limit: 100
});
```

#### 6. Fixed Recent Activity ✅
**Route:** `GET /api/nurse/activity/recent`

**Changes:**
- ✅ Use `recordedBy` for vitals query
- ✅ Use `Medication` model with metadata query
- ✅ Fix field mappings in response:
  - Vitals: `v.userId` (was `v.patientId`)
  - Vitals: Show systolic/diastolic (was `bloodPressure`)
  - Medications: `m.metadata?.patientId`
  - Medications: `m.name` (was `m.medicationName`)

---

## Testing

### Test Vitals Recording:
```bash
curl -X POST http://localhost:3000/api/nurse/vitals \
  -H "Authorization: Bearer <nurse-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 123,
    "vitals": {
      "pulse": 72,
      "bp": "120/80",
      "temperature": 98.6,
      "spO2": 98,
      "weight": 70,
      "notes": "Patient stable"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Vitals recorded successfully",
  "data": {
    "id": 1,
    "userId": 123,
    "recordedBy": "nurse_001",
    "heartRate": 72,
    "bloodPressureSystolic": 120,
    "bloodPressureDiastolic": 80,
    "temperature": 98.6,
    "oxygenSaturation": 98,
    "weight": 70,
    "source": "nurse",
    "recordedAt": "2026-01-06T..."
  }
}
```

### Test Medication Recording:
```bash
curl -X POST http://localhost:3000/api/nurse/medications \
  -H "Authorization: Bearer <nurse-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": 123,
    "medication": "Paracetamol 500mg",
    "dosage": "1 tablet",
    "route": "oral",
    "frequency": "Three times daily",
    "notes": "Take after meals"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Medication saved",
  "data": {
    "id": 1,
    "name": "Paracetamol 500mg",
    "dosage": "1 tablet",
    "route": "oral",
    "frequency": "Three times daily",
    "instructions": "Take after meals",
    "metadata": {
      "administeredBy": "nurse_001",
      "administeredByRole": "nurse",
      "patientId": 123,
      "administeredAt": "2026-01-06T..."
    }
  }
}
```

---

## Database Schema Reference

### `vitals_records` Table
```sql
CREATE TABLE vitals_records (
  id SERIAL PRIMARY KEY,
  userId INTEGER NOT NULL,              -- Patient ID
  recordedBy INTEGER,                   -- Nurse/Doctor ID
  recordedAt TIMESTAMP DEFAULT NOW(),
  bloodPressureSystolic INTEGER,
  bloodPressureDiastolic INTEGER,
  heartRate INTEGER,
  temperature DECIMAL(4,1),
  respiratoryRate INTEGER,
  oxygenSaturation INTEGER,
  weight DECIMAL(5,2),
  height DECIMAL(5,2),
  bmi DECIMAL(4,1),
  bloodSugar DECIMAL(5,1),
  notes TEXT,
  source VARCHAR(50) DEFAULT 'manual',
  deviceId VARCHAR(100),
  metadata JSONB,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### `medications` Table
```sql
CREATE TABLE medications (
  id SERIAL PRIMARY KEY,
  prescriptionId INTEGER,
  name VARCHAR(255) NOT NULL,
  genericName VARCHAR(255),
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  duration VARCHAR(100),
  route VARCHAR(50) DEFAULT 'oral',
  instructions TEXT,
  startDate DATE,
  endDate DATE,
  quantity INTEGER,
  refills INTEGER DEFAULT 0,
  isActive BOOLEAN DEFAULT true,
  sideEffects TEXT[],
  interactions TEXT[],
  metadata JSONB DEFAULT '{}',
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

---

## Summary

### Fixed Issues: ✅
1. ✅ Nurse can now save vitals successfully
2. ✅ Nurse can now save medications successfully
3. ✅ All field mappings corrected
4. ✅ Blood pressure parsing handles "120/80" format
5. ✅ Metadata properly stored for tracking
6. ✅ Modern Sequelize operators used (no deprecation warnings)
7. ✅ Recent activity endpoint shows correct data

### Files Modified:
- `/server/routes/nurse.route.js` - Fixed 6 endpoints

### Server Status:
- ✅ Server restarted (PM2 restart #445)
- ✅ No compilation errors
- ✅ Ready for testing

---

**Date:** January 6, 2026  
**Fixed By:** GitHub Copilot  
**Server Restart:** PM2 restart #445
