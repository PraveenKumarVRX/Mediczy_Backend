# Mediczy Mobile API Integration Guide
## Complete API Reference — All Modules

**V1 Base URL:** `https://api.mediqzy.com/v1/{tenant-id}`  
**AI Services Base URL:** `https://api.mediqzy.com/api`  
**Auth:** Bearer token (JWT, HS256)  
**Content-Type:** `application/json`

---

## Authentication

All endpoints require a valid Bearer token. Obtain one via the token exchange endpoint:

```
POST /v1/auth/exchange
```

**Request:**
```json
{
  "external_token": "<OIDC token from identity provider>",
  "provider": "google"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user_id": "usr-abc123",
  "tenant_id": 1
}
```

Pass the `access_token` in every subsequent request:
```
Authorization: Bearer <access_token>
```

**Refresh Token:**
```
POST /v1/auth/refresh
Body: { "refresh_token": "<refresh_token>" }
```

**Revoke Token (Logout):**
```
POST /v1/auth/revoke
Authorization: Bearer <access_token>
Body: {} (no body required)
```

**Response 200:**
```json
{ "success": true, "message": "Token revoked" }
```

**Complete Token Scopes:**

| Module | Read Scope | Write Scope | Other |
|--------|-----------|------------|-------|
| Labs | `labs.read` | `labs.write` | — |
| Activity | `activity.read` | `activity.write` | — |
| Users | `users.read` | `users.write` | — |
| Doctors | `doctors.read` | — | — |
| Appointments | `appointments.read` | `appointments.write` | — |
| Chat | `chat.read` | `chat.write` | — |
| Video | `consultations.video` | `consultations.video` | — |
| Pharmacy | `pharmacy.read` | `pharmacy.write` | `pharmacy.prescribe` (doctors only) |
| Homecare | `homecare.read` | `homecare.write` | — |
| Wellness / HRA | `wellness.read` | `wellness.write` | — |
| Webhooks | `webhooks.read` | `webhooks.write` | — |

---

## Lab Flow API

Base path: `/v1/{tenant-id}/labs`

---

### 1. List Test Categories

```
GET /v1/{tenant-id}/labs/categories
Scope: labs.read
```

**Response 200:**
```json
{
  "data": [
    { "category": "Blood Tests", "test_count": 15 },
    { "category": "Radiology", "test_count": 8 }
  ]
}
```

---

### 2. List Lab Tests

```
GET /v1/{tenant-id}/labs/tests
Scope: labs.read
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Results per page (default: 50, max: 100) |
| `category` | string | Filter by category |
| `search` | string | Search by name or description |

**Response 200:**
```json
{
  "data": [
    {
      "test_id": "test-abc123",
      "name": "Complete Blood Count (CBC)",
      "category": "Blood Tests",
      "description": "Measures red/white blood cells and platelets",
      "price": 299.00,
      "turnaround_days": 1,
      "home_collection": true,
      "fasting_required": false,
      "status": "active"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

---

### 3. Get Single Test

```
GET /v1/{tenant-id}/labs/tests/:testId
Scope: labs.read
```

**Response 200:** Single test object (same schema as list item above).

---

### 4. List Lab Partners

```
GET /v1/{tenant-id}/labs/partners
Scope: labs.read
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `city` | string | Filter by city |
| `pincode` | string | Filter by pincode |
| `lat` / `lng` | float | GPS coordinates for proximity search |

**Response 200:**
```json
{
  "data": [
    {
      "partner_id": "partner-xyz",
      "name": "PathLabs Diagnostics",
      "city": "Mumbai",
      "address": "123 Main Street, Andheri West",
      "pincode": "400058",
      "phone": "+912212345678",
      "home_collection": true,
      "rating": 4.5
    }
  ]
}
```

---

### 5. Get Available Slots

```
GET /v1/{tenant-id}/labs/slots
Scope: labs.read
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | YYYY-MM-DD | No | Specific date (default: today) |
| `partner_id` | string | No | Filter slots by partner |
| `collection_type` | string | No | `home` or `lab` |

**Response 200:**
```json
{
  "data": [
    {
      "date": "2026-04-05",
      "time_slot": "09:00-10:00",
      "available": true,
      "collection_type": "home"
    }
  ]
}
```

---

### 6. Create Booking

```
POST /v1/{tenant-id}/labs/bookings
Scope: labs.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "tests": ["test-abc123", "test-def456"],
  "collection_type": "home",
  "collection_date": "2026-04-05",
  "collection_time_slot": "09:00-10:00",
  "collection_address": {
    "line1": "42 Park Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  },
  "patient_name": "Rahul Sharma",
  "patient_age": 30,
  "partner_id": "partner-xyz"
}
```

**Response 201:**
```json
{
  "booking_id": "lab-1714000000-abc123",
  "status": "pending",
  "total_price": 598.00,
  "collection_date": "2026-04-05",
  "collection_time_slot": "09:00-10:00",
  "created_at": "2026-04-04T07:30:00Z"
}
```

---

### 7. List Bookings

```
GET /v1/{tenant-id}/labs/bookings
Scope: labs.read
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `user_id` | string | Filter by user |
| `status` | string | `pending` / `confirmed` / `completed` / `cancelled` |
| `page` / `limit` | integer | Pagination |

**Response 200:** Paginated array of booking objects.

---

### 8. Get Booking Details

```
GET /v1/{tenant-id}/labs/bookings/:bookingId
Scope: labs.read
```

**Response 200:** Full booking object including tests list, collection address, payment and report status.

---

### 9. Update Booking Status

```
PUT /v1/{tenant-id}/labs/bookings/:bookingId/status
Scope: labs.write
```

**Request Body:**
```json
{
  "status": "confirmed",
  "notes": "Sample collection confirmed by lab"
}
```

Valid status values: `pending` → `confirmed` → `sample_collected` → `processing` → `completed` / `cancelled`

---

### 10. Initiate Payment

```
POST /v1/{tenant-id}/labs/bookings/:bookingId/payment
Scope: labs.write
```

**Request Body:**
```json
{
  "payment_method": "upi",
  "upi_id": "user@upi"
}
```

**Response 200:**
```json
{
  "payment_id": "pay-abc123",
  "payment_status": "initiated",
  "payment_initiated_at": "2026-04-04T07:31:00Z"
}
```

---

### 11. Upload Lab Report

```
POST /v1/{tenant-id}/labs/bookings/:bookingId/report
Scope: labs.write
```

**Request Body:**
```json
{
  "report_url": "https://reports.mediczy.com/lab-report-uuid.pdf"
}
```

**Response 200:** Updated booking object with `report_url` and `report_uploaded_at` set.

---

### 12. Get Lab Report

```
GET /v1/{tenant-id}/labs/bookings/:bookingId/report
Scope: labs.read
```

**Response 200:**
```json
{
  "booking_id": "lab-1714000000-abc123",
  "patient_name": "Rahul Sharma",
  "report_url": "https://reports.mediczy.com/lab-report-uuid.pdf",
  "report_uploaded_at": "2026-04-04T09:00:00Z",
  "tests": ["test-abc123"],
  "status": "completed"
}
```

**Response 404** if report has not yet been uploaded.

---

### 13. Cancel Booking

```
POST /v1/{tenant-id}/labs/bookings/:bookingId/cancel
Scope: labs.write
```

**Request Body:**
```json
{
  "reason": "Rescheduling to next week"
}
```

**Response 200:** Updated booking with `status: "cancelled"` and `cancellation_reason` set.

---

## Activity Monitor API

Base path: `/v1/{tenant-id}/activity`

Supported metrics: `heart_rate`, `bmi`, `calories`, `distance`, `sleep`

---

### 1. Log Single Activity Entry

```
POST /v1/{tenant-id}/activity/log
Scope: activity.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "metric_type": "heart_rate",
  "value": 72.5,
  "unit": "bpm",
  "recorded_at": "2026-04-04T08:00:00Z",
  "source": "manual",
  "notes": "Resting"
}
```

**Metric units:**

| Metric | Unit |
|--------|------|
| `heart_rate` | `bpm` |
| `bmi` | `kg/m2` |
| `calories` | `kcal` |
| `distance` | `km` |
| `sleep` | `hours` |

**`source` values:** `manual`, `wearable`, `google_fit`, `apple_health`, `fitbit`, `garmin`

**`metadata` field:** free-form JSON for device details — see [Smartwatch Integration](#smartwatch--health-device-integration) below.

**Response 201:** Created activity log entry.

---

### 2. Batch Log

```
POST /v1/{tenant-id}/activity/log/batch
Scope: activity.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "entries": [
    { "metric_type": "heart_rate", "value": 72, "unit": "bpm", "recorded_at": "2026-04-04T08:00:00Z" },
    { "metric_type": "calories",   "value": 450, "unit": "kcal", "recorded_at": "2026-04-04T08:00:00Z" },
    { "metric_type": "distance",   "value": 3.2, "unit": "km",   "recorded_at": "2026-04-04T08:00:00Z" }
  ]
}
```

**Response 201:**
```json
{
  "inserted": 3,
  "entries": [ ... ]
}
```

---

### 3. Heart Rate Data

```
GET /v1/{tenant-id}/activity/heart-rate
Scope: activity.read
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | ✅ | User ID |
| `period` | string | ✅* | `daily` / `weekly` / `monthly` |
| `start_date` | YYYY-MM-DD | ✅* | Custom range start (`period` not needed) |
| `end_date` | YYYY-MM-DD | No | Custom range end (defaults to today) |

*Either `period` **or** `start_date` is required.

**Period behaviour:**

| Period | Range |
|--------|-------|
| `daily` | Last 24 hours, grouped by hour |
| `weekly` | Last 7 days, grouped by day |
| `monthly` | Last 30 days, grouped by day |

**Response 200:**
```json
{
  "metric": "heart_rate",
  "unit": "bpm",
  "period": "weekly",
  "start": "2026-03-29",
  "end": "2026-04-04",
  "summary": {
    "min": 58.0,
    "max": 112.0,
    "avg": 74.3,
    "count": 14
  },
  "data": [
    { "date": "2026-03-29", "avg": 70.1, "min": 58.0, "max": 88.0, "count": 2 },
    { "date": "2026-03-30", "avg": 75.5, "min": 62.0, "max": 95.0, "count": 2 }
  ]
}
```

---

### 4. BMI Data

```
GET /v1/{tenant-id}/activity/bmi
Scope: activity.read
```

Same query parameters and response shape as Heart Rate (unit: `kg/m2`).

---

### 5. Calories Data

```
GET /v1/{tenant-id}/activity/calories
Scope: activity.read
```

Same query parameters and response shape as Heart Rate (unit: `kcal`).

---

### 6. Distance Data

```
GET /v1/{tenant-id}/activity/distance
Scope: activity.read
```

Same query parameters and response shape as Heart Rate (unit: `km`).

---

### 7. Sleep Data

```
GET /v1/{tenant-id}/activity/sleep
Scope: activity.read
```

Same query parameters and response shape as Heart Rate (unit: `hours`).

---

### 8. Activity Dashboard / Summary

```
GET /v1/{tenant-id}/activity/summary
Scope: activity.read
```

Returns all 5 metrics in one call.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | ✅ | User ID |
| `period` | string | No | `daily` / `weekly` / `monthly` (default: `weekly`) |
| `start_date` | YYYY-MM-DD | No | Custom range start |
| `end_date` | YYYY-MM-DD | No | Custom range end |

**Response 200:**
```json
{
  "period": "weekly",
  "start": "2026-03-29",
  "end": "2026-04-04",
  "metrics": {
    "heart_rate": {
      "unit": "bpm",
      "summary": { "min": 58.0, "max": 112.0, "avg": 74.3, "count": 14 },
      "data": [ ... ]
    },
    "bmi": {
      "unit": "kg/m2",
      "summary": { "min": 22.1, "max": 22.4, "avg": 22.3, "count": 3 },
      "data": [ ... ]
    },
    "calories": { ... },
    "distance": { ... },
    "sleep": { ... }
  }
}
```

---

### 9. Update Activity Entry

```
PUT /v1/{tenant-id}/activity/:activityId
Scope: activity.write
```

**Request Body** (all fields optional):
```json
{
  "value": 75.0,
  "unit": "bpm",
  "recorded_at": "2026-04-04T08:30:00Z",
  "notes": "After exercise"
}
```

**Response 200:** Updated entry.

---

### 10. Delete Activity Entry

```
DELETE /v1/{tenant-id}/activity/:activityId
Scope: activity.write
```

Performs a soft delete (`deleted_at` timestamp set). Entry is excluded from all future queries.

**Response 200:**
```json
{ "message": "Entry deleted" }
```

---

## Smartwatch & Health Device Integration

Base path: `/v1/{tenant-id}/activity` (same as Activity Monitor)

Mediczy natively accepts health data from all major wearable platforms via the `source` field on every activity log endpoint. No separate SDK is required — sync your device data using `POST /activity/log/batch`.

**Supported sources:**

| Source value | Platform |
|---|---|
| `manual` | User-entered data |
| `wearable` | Generic wearable / BLE device |
| `google_fit` | Android — Google Fit / Health Connect |
| `apple_health` | iOS — Apple HealthKit |
| `fitbit` | Fitbit / Google Pixel Watch |
| `garmin` | Garmin Connect |

**Supported metrics:**

| `metric_type` | Unit | Example sources |
|---|---|---|
| `heart_rate` | `bpm` | All wearables |
| `sleep` | `hours` | All wearables |
| `steps` → log as `distance` | `km` | Pedometers, all wearables |
| `calories` | `kcal` | All wearables |
| `bmi` | `kg/m2` | Smart scales, manual |

> **Note on steps:** Convert steps to km before logging (`distance`). Typical conversion: `steps × 0.000762 km`.

---

### Syncing Apple HealthKit Data

Call `POST /activity/log/batch` after every HealthKit `HKObserverQuery` background delivery. Pass `source: "apple_health"` and populate `metadata` with the HealthKit UUID for idempotency.

**Example — iOS daily sync:**
```json
{
  "user_id": "usr-abc123",
  "entries": [
    {
      "metric_type": "heart_rate",
      "value": 68,
      "unit": "bpm",
      "recorded_at": "2026-04-04T07:32:00Z",
      "source": "apple_health",
      "metadata": {
        "hk_uuid": "A3B4C5D6-...",
        "device_name": "Apple Watch Series 9",
        "device_model": "Watch6,9"
      }
    },
    {
      "metric_type": "sleep",
      "value": 7.25,
      "unit": "hours",
      "recorded_at": "2026-04-04T06:00:00Z",
      "source": "apple_health",
      "metadata": {
        "hk_uuid": "B7C8D9E0-...",
        "sleep_stage_breakdown": {
          "deep_minutes": 98,
          "rem_minutes": 112,
          "light_minutes": 125,
          "awake_minutes": 18
        }
      }
    },
    {
      "metric_type": "calories",
      "value": 520,
      "unit": "kcal",
      "recorded_at": "2026-04-04T23:59:00Z",
      "source": "apple_health",
      "metadata": { "hk_uuid": "C1D2E3F4-..." }
    }
  ]
}
```

**Recommended HealthKit quantity types to sync:**

| HealthKit Type | Maps to `metric_type` |
|---|---|
| `HKQuantityTypeIdentifierHeartRate` | `heart_rate` |
| `HKCategoryTypeIdentifierSleepAnalysis` | `sleep` |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | `calories` |
| `HKQuantityTypeIdentifierDistanceWalkingRunning` | `distance` |
| `HKQuantityTypeIdentifierBodyMassIndex` | `bmi` |

---

### Syncing Google Fit / Health Connect Data

Use `source: "google_fit"` and populate `metadata` with the `dataPointId` for deduplication.

**Example — Android daily sync:**
```json
{
  "user_id": "usr-abc123",
  "entries": [
    {
      "metric_type": "heart_rate",
      "value": 74,
      "unit": "bpm",
      "recorded_at": "2026-04-04T07:45:00Z",
      "source": "google_fit",
      "metadata": {
        "data_point_id": "derived:com.google.heart_rate.bpm:...",
        "device_model": "Pixel Watch 2",
        "data_source": "com.google.android.apps.fitness"
      }
    },
    {
      "metric_type": "distance",
      "value": 4.8,
      "unit": "km",
      "recorded_at": "2026-04-04T23:59:00Z",
      "source": "google_fit",
      "metadata": {
        "data_point_id": "derived:com.google.distance.delta:...",
        "steps": 6300
      }
    }
  ]
}
```

**Health Connect data types to read:**

| Health Connect record | Maps to `metric_type` |
|---|---|
| `HeartRateRecord` | `heart_rate` |
| `SleepSessionRecord` | `sleep` |
| `ActiveCaloriesBurnedRecord` | `calories` |
| `DistanceRecord` | `distance` |
| `BodyMassIndexRecord` | `bmi` |

---

### Syncing Fitbit Data

Use the Fitbit Web API with OAuth 2.0 on your backend, then push to Mediczy with `source: "fitbit"`.

**Backend sync flow:**
```
Fitbit OAuth token → GET api.fitbit.com/1/user/-/activities/heart/date/today/1d.json
                   → POST /v1/{tid}/activity/log/batch  (source: "fitbit")
```

**Example batch entry:**
```json
{
  "metric_type": "heart_rate",
  "value": 71,
  "unit": "bpm",
  "recorded_at": "2026-04-04T10:00:00Z",
  "source": "fitbit",
  "metadata": {
    "fitbit_log_id": "51023489012",
    "device": "Fitbit Charge 6",
    "zone": "Fat Burn"
  }
}
```

---

### Syncing Garmin Data

Use Garmin's Health API (requires partner agreement) or Garmin Connect IQ. Push with `source: "garmin"`.

```json
{
  "metric_type": "sleep",
  "value": 6.5,
  "unit": "hours",
  "recorded_at": "2026-04-04T06:30:00Z",
  "source": "garmin",
  "metadata": {
    "garmin_summary_id": "gsum-9988776655",
    "device": "Garmin Forerunner 965",
    "sleep_score": 78
  }
}
```

---

### Generic BLE Wearable

For custom BLE devices (oximeters, glucometers, smart scales), use `source: "wearable"` and store the raw device reading in `metadata`.

```json
{
  "user_id": "usr-abc123",
  "entries": [
    {
      "metric_type": "heart_rate",
      "value": 98,
      "unit": "bpm",
      "recorded_at": "2026-04-04T09:00:00Z",
      "source": "wearable",
      "metadata": {
        "device_type": "pulse_oximeter",
        "device_name": "CheckMe O2+",
        "mac_address": "AA:BB:CC:DD:EE:FF",
        "spo2": 98,
        "pi": 4.2
      }
    }
  ]
}
```

> **SpO2 / blood oxygen:** Store as a `heart_rate` entry (same BLE polling cycle) with `spo2` in `metadata` until a dedicated `spo2` metric type is added.

---

### Best Practices for Device Sync

1. **Batch all data in one call** — use `POST /activity/log/batch` (up to 200 entries). Never loop with single `/log` calls.
2. **Store device UUIDs in `metadata`** — use `hk_uuid` / `data_point_id` / `fitbit_log_id` to deduplicate on re-sync.
3. **Background sync cadence:**
   - iOS: Use `HKObserverQuery` + `enableBackgroundDelivery` — system calls your app; sync immediately.
   - Android: Use `HealthConnect.readRecords` in a `WorkManager` periodic task (15 min interval minimum).
   - Fitbit/Garmin: Schedule a server-side cron every 30 minutes via their respective webhook/push APIs.
4. **Timestamps matter** — always pass `recorded_at` as the actual measurement time, not the upload time.
5. **Handle 409 gracefully** — if a `metadata.hk_uuid` was already saved, the server returns 200 with the existing record (idempotent upsert).

---

## Error Responses

All errors follow a consistent shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

**Common Error Codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Request body / params failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 401 | `TOKEN_EXPIRED` | Token expired — refresh and retry |
| 403 | `FORBIDDEN` | Token lacks required scope |
| 403 | `ACCESS_DENIED` | Ring-fencing: not permitted for this user role |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Quick Reference

### Lab Flow (complete booking lifecycle)

```
1. GET  /labs/categories              ← browse test categories
2. GET  /labs/tests?search=CBC        ← search for tests
3. GET  /labs/partners?city=Mumbai    ← find nearby partners
4. GET  /labs/slots?date=2026-04-05   ← see available times
5. POST /labs/bookings                ← create booking
6. POST /labs/bookings/:id/payment    ← initiate payment
7. GET  /labs/bookings/:id            ← poll booking status
8. GET  /labs/bookings/:id/report     ← download report when ready
9. POST /labs/bookings/:id/cancel     ← cancel if needed
```

### Activity Monitor (daily sync)

```
1. POST /activity/log/batch           ← sync device data in bulk
2. GET  /activity/summary?user_id=X&period=weekly   ← dashboard
3. GET  /activity/heart-rate?user_id=X&period=daily ← per-metric detail
```

---

## Smoke Test

A full smoke test covering all 35 test cases is located at:

```
server/scripts/smoke-test-lab-activity-api.mjs
```

Run:
```bash
node server/scripts/smoke-test-lab-activity-api.mjs
```

**Result (verified 2026-04-04): 35/35 tests passing ✅**

---

## Users API

Base path: `/v1/{tenant-id}/users`

---

### Create or Update User Profile

```
POST /v1/{tenant-id}/users
Scope: (no scope required — verifyToken only)
```

Upsert operation. If `user_id` is present in the body, updates the existing user; otherwise creates a new one.

**Request Body (create):**
```json
{
  "first_name": "Priya",
  "last_name": "Sharma",
  "email": "priya.sharma@example.com",
  "phone": "+919876543210",
  "date_of_birth": "1990-05-14",
  "gender": "female"
}
```

**Request Body (update — include `user_id`):**
```json
{
  "user_id": "usr-abc123",
  "phone": "+919876543210"
}
```

**Response 201 (created) / 200 (updated):**
```json
{
  "user_id": "usr-abc123",
  "tenant_id": 1,
  "first_name": "Priya",
  "last_name": "Sharma",
  "email": "priya.sharma@example.com",
  "phone": "+919876543210",
  "date_of_birth": "1990-05-14",
  "gender": "female",
  "is_active": true,
  "created_at": "2026-04-04T10:00:00Z"
}
```

---

### Get User Profile

```
GET /v1/{tenant-id}/users/:userId
Scope: users.read
```

**Response 200:**
```json
{
  "user_id": "usr-abc123",
  "first_name": "Priya",
  "last_name": "Sharma",
  "email": "priya.sharma@example.com",
  "phone": "+919876543210",
  "date_of_birth": "1990-05-14",
  "gender": "female",
  "abha_id": null,
  "is_active": true
}
```

---

### Update User Profile

```
PUT /v1/{tenant-id}/users/:userId
Scope: users.write
```

**Request Body:** (any subset of user fields)
```json
{
  "phone": "+919999888877",
  "address": { "city": "Mumbai", "state": "Maharashtra", "pin": "400001" }
}
```

**Response 200:** Updated user object.

---

### Get Health Profile

```
GET /v1/{tenant-id}/users/:userId/health-profile
Scope: users.read
```

**Response 200:**
```json
{
  "user_id": "usr-abc123",
  "blood_group": "O+",
  "height_cm": 165,
  "weight_kg": 62,
  "allergies": ["penicillin"],
  "chronic_conditions": ["hypertension"],
  "current_medications": ["amlodipine 5mg"],
  "smoking_status": "never",
  "alcohol_consumption": "occasional",
  "exercise_frequency": "3x/week",
  "updated_at": "2026-03-15T08:30:00Z"
}
```

---

### Update Health Profile

```
PUT /v1/{tenant-id}/users/:userId/health-profile
Scope: users.write
```

**Request Body:** (any subset of health profile fields)
```json
{
  "weight_kg": 64,
  "current_medications": ["amlodipine 5mg", "metformin 500mg"],
  "exercise_frequency": "daily"
}
```

**Response 200:** Updated health profile object.

---

## Doctors API

Base path: `/v1/{tenant-id}/doctors`

---

### Search Doctors

```
GET /v1/{tenant-id}/doctors
Scope: doctors.read
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Name or keyword search |
| `specialization` | string | Filter by specialty (e.g. `cardiology`) |
| `isAvailable` | boolean | Filter for currently available only |
| `minRating` | float | Minimum rating (e.g. `4.0`) |
| `page` | int | Page number (default 1) |
| `limit` | int | Page size (default 20) |
| `sortBy` | string | `rating` (default), `name`, `created_at` |
| `sortOrder` | string | `ASC` / `DESC` |

**Response 200:**
```json
{
  "data": [
    {
      "doctor_id": "doc-xyz789",
      "name": "Dr. Rajesh Kumar",
      "specialization": "cardiology",
      "qualifications": ["MBBS", "MD"],
      "experience_years": 12,
      "rating": 4.8,
      "consultation_count": 520,
      "is_available": true,
      "consultation_fee": 700
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 45 }
}
```

---

### Get Doctor Profile

```
GET /v1/{tenant-id}/doctors/:doctorId
Scope: doctors.read
```

**Response 200:** Full doctor profile object with biography, clinic details, and languages spoken.

---

### Get Doctor Availability

```
GET /v1/{tenant-id}/doctors/:doctorId/availability?date=2026-04-10
Scope: doctors.read
```

**Response 200:**
```json
{
  "doctor_id": "doc-xyz789",
  "date": "2026-04-10",
  "available": true,
  "working_hours": { "start": "09:00", "end": "17:00" },
  "booked_slots": ["10:00", "14:30"]
}
```

---

### Get Doctor Time Slots

```
GET /v1/{tenant-id}/doctors/:doctorId/slots?date=2026-04-10
Scope: doctors.read
```

**Response 200:**
```json
{
  "doctor_id": "doc-xyz789",
  "date": "2026-04-10",
  "slots": [
    { "time": "09:00", "available": true },
    { "time": "09:30", "available": true },
    { "time": "10:00", "available": false }
  ]
}
```

---

## Appointments API

Base path: `/v1/{tenant-id}/appointments`

---

### Create Appointment

```
POST /v1/{tenant-id}/appointments
Scope: appointments.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "doctor_id": "doc-xyz789",
  "appointment_date": "2026-04-10",
  "appointment_time": "09:30",
  "duration_minutes": 30,
  "appointment_type": "opd",
  "notes": "Follow-up for hypertension"
}
```

**Response 201:**
```json
{
  "appointment_id": "appt-001",
  "user_id": "usr-abc123",
  "doctor_id": "doc-xyz789",
  "appointment_date": "2026-04-10",
  "appointment_time": "09:30",
  "duration_minutes": 30,
  "status": "scheduled",
  "appointment_type": "opd",
  "notes": "Follow-up for hypertension",
  "created_at": "2026-04-04T11:00:00Z"
}
```

---

### List Appointments

```
GET /v1/{tenant-id}/appointments
Scope: appointments.read
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `userId` | string | Filter by patient |
| `userType` | string | `patient` or `doctor` |
| `status` | string | `scheduled`, `completed`, `cancelled` |
| `fromDate` | string | ISO date filter start |
| `toDate` | string | ISO date filter end |
| `page` / `limit` | int | Pagination |

**Response 200:**
```json
{
  "data": [ { "appointment_id": "appt-001", "status": "scheduled", "..." : "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 8 }
}
```

---

### Get Appointment Details

```
GET /v1/{tenant-id}/appointments/:appointmentId
Scope: appointments.read
```

**Response 200:** Full appointment object.

---

### Reschedule Appointment

```
PUT /v1/{tenant-id}/appointments/:appointmentId/reschedule
Scope: appointments.write
```

**Request Body:**
```json
{
  "appointment_date": "2026-04-12",
  "appointment_time": "11:00"
}
```

**Response 200:** Updated appointment object with `status: "scheduled"`.

---

### Cancel Appointment

```
POST /v1/{tenant-id}/appointments/:appointmentId/cancel
Scope: appointments.write
```

**Request Body:**
```json
{ "reason": "Patient request" }
```

**Response 200:** Updated appointment object with `status: "cancelled"`.

---

### Complete Appointment

```
POST /v1/{tenant-id}/appointments/:appointmentId/complete
Scope: appointments.write
```

**Request Body:** `{}`

**Response 200:** Updated appointment object with `status: "completed"`.

---

## Chat API

Base path: `/v1/{tenant-id}/chat`

---

### Create Chat Room

```
POST /v1/{tenant-id}/chat/rooms
Scope: chat.write
```

**Request Body:**
```json
{
  "name": "Dr. Kumar — Priya Sharma",
  "participants": ["usr-abc123", "doc-xyz789"],
  "type": "consultation",
  "appointment_id": "appt-001"
}
```

**Response 201:**
```json
{
  "room_id": "room-001",
  "name": "Dr. Kumar — Priya Sharma",
  "type": "consultation",
  "status": "active",
  "participants": ["usr-abc123", "doc-xyz789"],
  "created_at": "2026-04-04T12:00:00Z"
}
```

---

### List Chat Rooms

```
GET /v1/{tenant-id}/chat/rooms?userId=usr-abc123
Scope: chat.read
```

**Response 200:**
```json
{
  "data": [
    {
      "room_id": "room-001",
      "name": "Dr. Kumar — Priya Sharma",
      "status": "active",
      "last_message_at": "2026-04-04T13:00:00Z",
      "unread_count": 2
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

---

### Get Chat Room Details

```
GET /v1/{tenant-id}/chat/rooms/:roomId
Scope: chat.read
```

**Response 200:** Full room object including participants and message count.

---

### Send Message

```
POST /v1/{tenant-id}/chat/rooms/:roomId/messages
Scope: chat.write
```

**Request Body:**
```json
{
  "sender_id": "usr-abc123",
  "content": "I have been experiencing chest tightness since yesterday.",
  "message_type": "text"
}
```

`message_type` can be `text`, `image`, or `file`.

**Response 201:**
```json
{
  "message_id": "msg-001",
  "room_id": "room-001",
  "sender_id": "usr-abc123",
  "content": "I have been experiencing chest tightness since yesterday.",
  "message_type": "text",
  "sent_at": "2026-04-04T13:05:00Z"
}
```

---

### Get Messages

```
GET /v1/{tenant-id}/chat/rooms/:roomId/messages
Scope: chat.read
```

**Query Parameters:** `page`, `limit` (default 50), `before` (cursor), `after` (cursor).

**Response 200:**
```json
{
  "data": [ { "message_id": "msg-001", "content": "..." } ],
  "pagination": { "page": 1, "limit": 50, "total": 14 }
}
```

---

### Mark Messages as Read

```
POST /v1/{tenant-id}/chat/rooms/:roomId/read
Scope: chat.write
```

**Request Body:**
```json
{ "userId": "usr-abc123" }
```

**Response 200:**
```json
{ "success": true, "marked_read": 2 }
```

---

### Close Chat Room

```
PATCH /v1/{tenant-id}/chat/rooms/:roomId/close
Scope: chat.write
```

**Response 200:** Room object with `status: "closed"`.

---

## Video Consultation API

Base path: `/v1/{tenant-id}/video`

Video consultations use [LiveKit](https://livekit.io) for real-time audio/video. The flow is:
1. Generate a LiveKit token (`POST /video/token`)
2. Connect to the LiveKit room using the SDK on the mobile/web client
3. End the session (`POST /video/room/:roomId/end`)

---

### Generate Video Token

```
POST /v1/{tenant-id}/video/token
Scope: consultations.video
```

**Request Body:**
```json
{
  "roomId": "room-appt-001",
  "userId": "usr-abc123",
  "role": "patient"
}
```

`role` can be `patient` or `doctor`.

**Response 200:**
```json
{
  "token": "eyJhbGci...",
  "room_name": "room-appt-001",
  "server_url": "wss://livekit.mediqzy.com",
  "expires_at": "2026-04-04T15:00:00Z"
}
```

Connect with the LiveKit SDK:
```js
const room = new Room();
await room.connect(serverUrl, token);
```

---

### Get Room Status

```
GET /v1/{tenant-id}/video/room/:roomId
Scope: consultations.video
```

**Response 200:**
```json
{
  "room_id": "room-appt-001",
  "status": "active",
  "participant_count": 2,
  "started_at": "2026-04-04T13:00:00Z",
  "duration_seconds": 420
}
```

---

### End Video Session

```
POST /v1/{tenant-id}/video/room/:roomId/end
Scope: consultations.video
```

**Response 200:**
```json
{
  "room_id": "room-appt-001",
  "status": "ended",
  "duration_seconds": 600,
  "ended_at": "2026-04-04T13:10:00Z"
}
```

---

## Pharmacy API

Base path: `/v1/{tenant-id}/pharmacy`

---

### Create Prescription (Doctors Only)

```
POST /v1/{tenant-id}/pharmacy/prescriptions
Scope: pharmacy.prescribe
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "doctor_id": "doc-xyz789",
  "appointment_id": "appt-001",
  "medications": [
    {
      "name": "Amlodipine",
      "dosage": "5mg",
      "frequency": "once daily",
      "duration_days": 30
    }
  ],
  "instructions": "Take after breakfast. Monitor blood pressure weekly.",
  "diagnosis": "Stage 1 hypertension"
}
```

**Response 201:**
```json
{
  "prescription_id": "rx-001",
  "user_id": "usr-abc123",
  "doctor_id": "doc-xyz789",
  "medications": [ { "name": "Amlodipine", "dosage": "5mg", "..." : "..." } ],
  "created_at": "2026-04-04T14:00:00Z"
}
```

> A workflow notification is automatically triggered via n8n when a prescription is created.

---

### Create Pharmacy Order

```
POST /v1/{tenant-id}/pharmacy/orders
Scope: pharmacy.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "prescription_id": "rx-001",
  "items": [
    { "medication_name": "Amlodipine 5mg", "quantity": 30 }
  ],
  "delivery_address": {
    "line1": "12, Shanti Nagar",
    "city": "Mumbai",
    "pin": "400001"
  },
  "delivery_preference": "home"
}
```

**Response 201:**
```json
{
  "order_id": "ord-001",
  "status": "pending",
  "estimated_delivery": "2026-04-06",
  "total_amount": 450
}
```

---

### List Orders

```
GET /v1/{tenant-id}/pharmacy/orders?userId=usr-abc123
Scope: pharmacy.read
```

**Response 200:**
```json
{
  "data": [ { "order_id": "ord-001", "status": "dispatched", "..." : "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

---

### Get Order Details

```
GET /v1/{tenant-id}/pharmacy/orders/:orderId
Scope: pharmacy.read
```

**Response 200:** Full order object with tracking info.

---

### Update Order Status

```
PUT /v1/{tenant-id}/pharmacy/orders/:orderId/status
Scope: pharmacy.write
```

**Request Body:**
```json
{ "status": "dispatched" }
```

Valid statuses: `pending`, `confirmed`, `packed`, `dispatched`, `delivered`, `cancelled`.

**Response 200:** Updated order object.

---

## Homecare API

Base path: `/v1/{tenant-id}/homecare`

---

### List Services

```
GET /v1/{tenant-id}/homecare/services?category=nursing
Scope: homecare.read
```

**Query Parameters:** `category` (optional), `page`, `limit`.

**Response 200:**
```json
{
  "data": [
    {
      "service_id": "svc-001",
      "name": "Post-Surgery Nursing Care",
      "category": "nursing",
      "description": "Wound dressing, vitals monitoring",
      "price_per_session": 800,
      "duration_hours": 2,
      "available": true
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 12 }
}
```

---

### Book Homecare Service

```
POST /v1/{tenant-id}/homecare/bookings
Scope: homecare.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "service_id": "svc-001",
  "service_date": "2026-04-08",
  "service_time_slot": "09:00-11:00",
  "sessions_count": 5,
  "patient_name": "Priya Sharma",
  "patient_age": 36,
  "service_address": {
    "line1": "12, Shanti Nagar",
    "city": "Mumbai",
    "pin": "400001"
  },
  "special_instructions": "Patient has latex allergy"
}
```

**Response 201:**
```json
{
  "booking_id": "hc-001",
  "status": "pending",
  "service_date": "2026-04-08",
  "service_time_slot": "09:00-11:00",
  "sessions_count": 5,
  "total_amount": 4000
}
```

---

### List Homecare Bookings

```
GET /v1/{tenant-id}/homecare/bookings?userId=usr-abc123
Scope: homecare.read
```

**Response 200:**
```json
{
  "data": [ { "booking_id": "hc-001", "status": "confirmed", "..." : "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 2 }
}
```

---

### Get Booking Details

```
GET /v1/{tenant-id}/homecare/bookings/:bookingId
Scope: homecare.read
```

**Response 200:** Full booking object with assigned professional info.

---

### Update Booking

```
PUT /v1/{tenant-id}/homecare/bookings/:bookingId
Scope: homecare.write
```

**Request Body:** (any subset of booking fields, e.g. reschedule date/time)

**Response 200:** Updated booking object.

---

### Assign Professional

```
POST /v1/{tenant-id}/homecare/bookings/:bookingId/assign
Scope: homecare.write
```

**Request Body:**
```json
{
  "professionalId": "pro-001",
  "name": "Nurse Radha Menon",
  "phone": "+919988776655"
}
```

**Response 200:** Booking object with `assigned_professional` details.

---

## Wellness / Health Risk Assessment API

Base path: `/v1/{tenant-id}/wellness`

The wellness module computes a **Health Risk Assessment (HRA)** score in real-time from biometric and lifestyle inputs. Scores are also computed via a background cron that runs nightly; use the [AI Intelligence API](#ai-intelligence-api) (`GET /risk-score/me`) to retrieve the latest scored result.

**Risk score interpretation:**

| Score | Level |
|-------|-------|
| 0–29 | `low` |
| 30–49 | `moderate` |
| 50–69 | `high` |
| 70–100 | `critical` |

---

### Create Health Risk Assessment

```
POST /v1/{tenant-id}/wellness/hra
Scope: wellness.write
```

**Request Body:**
```json
{
  "user_id": "usr-abc123",
  "bmi": 27.4,
  "bp_systolic": 138,
  "bp_diastolic": 88,
  "smoking_status": "never",
  "alcohol_consumption": "occasional",
  "exercise_frequency": "3x/week",
  "stress_level": "moderate",
  "sleep_hours": 6,
  "responses": {
    "family_history_diabetes": true,
    "family_history_heart_disease": false
  }
}
```

**Risk scoring factors:**
- BMI > 30 → +30 pts; BMI 25–30 → +15 pts
- Systolic > 140 → +20 pts; 130–140 → +10 pts
- Current smoker → +25 pts
- Heavy alcohol → +15 pts
- Never exercises → +10 pts

**Response 201:**
```json
{
  "assessment_id": "hra-001",
  "user_id": "usr-abc123",
  "risk_score": 45,
  "risk_level": "moderate",
  "risk_factors": [
    { "factor": "Elevated BMI", "contribution": 15 },
    { "factor": "Elevated blood pressure", "contribution": 10 }
  ],
  "recommendations": [
    "Aim for 30 minutes of moderate exercise 5 days per week",
    "Reduce sodium intake. Monitor BP weekly."
  ],
  "created_at": "2026-04-04T15:00:00Z"
}
```

---

### List Health Risk Assessments

```
GET /v1/{tenant-id}/wellness/hra?userId=usr-abc123
Scope: wellness.read
```

**Response 200:**
```json
{
  "data": [
    {
      "assessment_id": "hra-001",
      "risk_score": 45,
      "risk_level": "moderate",
      "created_at": "2026-04-04T15:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

---

### Get Assessment Details

```
GET /v1/{tenant-id}/wellness/hra/:assessmentId
Scope: wellness.read
```

**Response 200:** Full assessment with all risk factors and recommendations.

---

### List Wellness Plans

```
GET /v1/{tenant-id}/wellness/plans?category=nutrition
Scope: wellness.read
```

**Response 200:**
```json
{
  "data": [
    {
      "plan_id": "plan-001",
      "title": "DASH Diet for Hypertension",
      "category": "nutrition",
      "duration_days": 30,
      "description": "Evidence-based dietary plan to reduce blood pressure."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 8 }
}
```

---

## Webhooks API

Base path: `/v1/{tenant-id}/webhooks`

Register HTTPS endpoints to receive real-time event notifications. Each delivery includes an HMAC-SHA256 signature for verification.

**Signature verification:**
```
X-Mediczy-Signature: sha256=<hmac>
```

Compute: `HMAC-SHA256(secret, JSON.stringify(eventData))`

**Available event types:**
- `appointment.created` / `appointment.cancelled` / `appointment.completed`
- `lab.report_ready`
- `pharmacy.order_dispatched` / `pharmacy.prescription_issued`
- `homecare.booking_confirmed` / `homecare.professional_assigned`
- `payment.success` / `payment.failed`

---

### Register Webhook

```
POST /v1/{tenant-id}/webhooks
Scope: webhooks.write
```

**Request Body:**
```json
{
  "name": "Appointment Events",
  "url": "https://your-backend.com/webhooks/mediczy",
  "secret": "your-shared-secret",
  "events": ["appointment.created", "appointment.cancelled"],
  "enabled": true,
  "retry_enabled": true
}
```

**Response 201:**
```json
{
  "webhook_id": "wh-001",
  "name": "Appointment Events",
  "url": "https://your-backend.com/webhooks/mediczy",
  "events": ["appointment.created", "appointment.cancelled"],
  "enabled": true,
  "created_at": "2026-04-04T16:00:00Z"
}
```

---

### List Webhooks

```
GET /v1/{tenant-id}/webhooks
Scope: webhooks.read
```

**Response 200:**
```json
{
  "data": [ { "webhook_id": "wh-001", "name": "Appointment Events", "enabled": true } ],
  "pagination": { "page": 1, "limit": 20, "total": 2 }
}
```

---

### Get Webhook Details

```
GET /v1/{tenant-id}/webhooks/:webhookId
Scope: webhooks.read
```

**Response 200:** Full webhook config (secret is masked).

---

### Update Webhook

```
PUT /v1/{tenant-id}/webhooks/:webhookId
Scope: webhooks.write
```

**Request Body:** (any subset of webhook fields)
```json
{
  "events": ["appointment.created", "lab.report_ready"],
  "enabled": false
}
```

**Response 200:** Updated webhook object.

---

### Delete Webhook

```
DELETE /v1/{tenant-id}/webhooks/:webhookId
Scope: webhooks.write
```

**Response 204:** No content.

---

### Test Webhook (Trigger Test Delivery)

```
POST /v1/{tenant-id}/webhooks/:webhookId/test
Scope: webhooks.write
```

**Request Body:**
```json
{
  "eventType": "appointment.created",
  "eventData": { "appointment_id": "test-001", "status": "scheduled" }
}
```

**Response 200:**
```json
{
  "delivery_id": "dlv-001",
  "status": "delivered",
  "response_code": 200,
  "latency_ms": 142
}
```

---

### Get Delivery History

```
GET /v1/{tenant-id}/webhooks/:webhookId/deliveries?status=failed
Scope: webhooks.read
```

**Query Parameters:** `status` (`delivered`, `failed`, `pending`), `page`, `limit`.

**Response 200:**
```json
{
  "data": [
    {
      "delivery_id": "dlv-001",
      "event_type": "appointment.created",
      "status": "delivered",
      "response_code": 200,
      "attempted_at": "2026-04-04T16:05:00Z",
      "latency_ms": 142
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 8 }
}
```

---

## AI Brain API (Conversational AI)

Base URL: `https://api.mediqzy.com/api/v3/ai-brain`  
Auth: Standard session Bearer token (same JWT — no special scope required)

The AI Brain is an agentic LLM layer with RAG (retrieval-augmented generation), persistent conversation memory, and 15 integrated tools (lab search, appointment booking, prescription lookup, drug interaction check, etc.). It can understand natural-language health queries and take action.

---

### Ask a Question / Take Action

```
POST /api/v3/ai-brain/think
```

**Request Body:**
```json
{
  "message": "What were my last blood test results?",
  "conversationId": 42,
  "stream": false
}
```

`conversationId` is optional — omit to start a new conversation.  
Set `stream: true` to receive Server-Sent Events (SSE) with real-time tool calls and interim responses.

**Response 200 (JSON, non-streaming):**
```json
{
  "success": true,
  "response": "Your last CBC test on March 28 showed haemoglobin 11.2 g/dL (slightly low). Your doctor flagged this — would you like to book a follow-up?",
  "conversationId": 42,
  "toolsUsed": ["lab_report_lookup", "appointment_checker"],
  "iterations": 2,
  "tokensUsed": 840,
  "latencyMs": 1250,
  "model": "claude-3-haiku-20240307",
  "provider": "anthropic"
}
```

**Streaming (SSE) event types:**

| Event type | Meaning |
|------------|---------|
| `thinking` | Brain started processing |
| `tool_call` | A tool is being invoked |
| `tool_result` | Tool returned a result |
| `iteration` | Agentic loop iteration update |
| `response` | Final answer (same fields as JSON above) |
| `[DONE]` | Stream complete |

---

### List Conversations

```
GET /api/v3/ai-brain/conversations
```

**Response 200:**
```json
{
  "conversations": [
    {
      "id": 42,
      "title": "Blood test results",
      "message_count": 6,
      "last_message_at": "2026-04-04T13:00:00Z"
    }
  ]
}
```

---

### Get Conversation History

```
GET /api/v3/ai-brain/conversations/:id
```

**Response 200:**
```json
{
  "conversation": { "id": 42, "title": "Blood test results" },
  "messages": [
    { "role": "user", "content": "What were my last blood test results?", "created_at": "..." },
    { "role": "assistant", "content": "Your last CBC...", "created_at": "..." }
  ]
}
```

---

### Delete Conversation

```
DELETE /api/v3/ai-brain/conversations/:id
```

**Response 200:**
```json
{ "success": true, "deleted": true }
```

---

### Get User Memory

```
GET /api/v3/ai-brain/memory
```

Returns the AI's persistent memory about the current user (health history summaries, preferences, etc.).

**Response 200:**
```json
{
  "memory": [
    { "key": "last_lab_date", "value": "2026-03-28" },
    { "key": "known_allergies", "value": "penicillin" }
  ]
}
```

---

### List Available Tools

```
GET /api/v3/ai-brain/tools
```

No auth required. Returns all 15 tools the brain can invoke.

**Response 200:**
```json
{
  "tools": [
    { "name": "lab_report_lookup", "description": "Look up lab reports for a patient" },
    { "name": "appointment_checker", "description": "Check and book appointments" }
  ]
}
```

---

### Upload Knowledge Document

```
POST /api/v3/ai-brain/documents
Content-Type: multipart/form-data
```

Upload a PDF, TXT, MD, HTML, or CSV file for the RAG knowledge base. Max 20MB.

**Form fields:**
- `file` — the document
- `title` (optional) — document title
- `category` (optional) — e.g. `clinical_guidelines`

**Response 201:**
```json
{
  "document_id": "doc-001",
  "filename": "hypertension-guidelines.pdf",
  "status": "processing",
  "chunk_count": 0
}
```

---

### Get Knowledge Base Stats

```
GET /api/v3/ai-brain/knowledge-stats
```

**Response 200:**
```json
{
  "total_documents": 12,
  "total_chunks": 1840,
  "last_updated": "2026-04-03T22:00:00Z"
}
```

---

## AI Intelligence API

Base URL: `https://api.mediqzy.com/api/v3/ai-intelligence`  
Auth: Standard session Bearer token

High-level AI services: drug interaction checking, insurance AI, emergency triage, patient risk scores, smart notifications, and clinical insights.

---

### Drug Interaction Check (Full)

```
POST /api/v3/ai-intelligence/drug-interactions/check
```

**Request Body:**
```json
{
  "medications": ["amlodipine 5mg", "metformin 500mg", "ibuprofen 400mg"],
  "patientId": "usr-abc123",
  "useLLM": true
}
```

**Response 200:**
```json
{
  "interactions": [
    {
      "pair": ["amlodipine", "ibuprofen"],
      "severity": "moderate",
      "description": "NSAIDs may reduce antihypertensive effect of amlodipine.",
      "recommendation": "Monitor blood pressure if co-administration is necessary."
    }
  ],
  "overall_risk": "moderate",
  "safe_to_take": false
}
```

---

### Drug Interaction Quick Check

```
POST /api/v3/ai-intelligence/drug-interactions/quick-check
```

**Request Body:**
```json
{
  "medications": ["warfarin", "aspirin"]
}
```

**Response 200:**
```json
{
  "has_interactions": true,
  "highest_severity": "major",
  "count": 1
}
```

---

### Emergency Triage Assessment

```
POST /api/v3/ai-intelligence/triage/assess
```

Use this for AI-assisted symptom triage. The engine classifies severity as `emergency`, `urgent`, `semi-urgent`, or `non-urgent`.

**Request Body:**
```json
{
  "symptoms": "Sudden severe chest pain radiating to left arm, sweating profusely, shortness of breath",
  "vitals": {
    "heart_rate": 118,
    "bp_systolic": 160,
    "bp_diastolic": 100,
    "spo2": 94
  },
  "painScale": 9,
  "age": 54,
  "gender": "male",
  "patientId": "usr-abc123"
}
```

**Response 200:**
```json
{
  "success": true,
  "triage_level": "emergency",
  "recommended_action": "Call emergency services (112) immediately. Do not drive. Chew aspirin 325mg if not contraindicated.",
  "suspected_conditions": ["Acute Myocardial Infarction", "Unstable Angina"],
  "confidence": 0.92,
  "llm_enhanced": true
}
```

> This endpoint assists clinical decision-making but is NOT a substitute for professional medical judgment.

---

### Get My Health Risk Score

```
GET /api/v3/ai-intelligence/risk-score/me
```

Returns the latest nightly-computed risk score for the authenticated user.

**Response 200:**
```json
{
  "success": true,
  "score": {
    "overall_score": 48,
    "risk_level": "moderate",
    "component_scores": {
      "cardiovascular": 55,
      "metabolic": 40,
      "lifestyle": 30
    },
    "updated_at": "2026-04-04T02:00:00Z"
  }
}
```

If not yet calculated:
```json
{ "success": true, "score": null, "message": "Risk score not yet calculated. Check back in a few hours." }
```

---

### Get Patient Risk Score (Doctors)

```
GET /api/v3/ai-intelligence/risk-score/:patientId
```

Requires doctor role. Returns the risk score for a specific patient.

---

### Smart Notifications

```
GET /api/v3/ai-intelligence/notifications/smart
```

Returns AI-generated health nudges and alerts for the authenticated user.

**Response 200:**
```json
{
  "notifications": [
    {
      "id": "notif-001",
      "type": "health_reminder",
      "title": "Time for your weekly blood pressure check",
      "body": "You have elevated BP readings. Regular monitoring helps track your progress.",
      "priority": "high",
      "read": false,
      "created_at": "2026-04-04T08:00:00Z"
    }
  ]
}
```

---

### Mark Notification as Read

```
PATCH /api/v3/ai-intelligence/notifications/smart/:id/read
```

**Response 200:**
```json
{ "success": true }
```

---

### Patient Clinical Insights

```
GET /api/v3/ai-intelligence/insights/patient/:patientId
```

AI-generated clinical insights based on patient history.

**Response 200:**
```json
{
  "insights": [
    {
      "id": "ins-001",
      "type": "trend",
      "title": "BP trending upward over last 4 weeks",
      "recommendation": "Consider medication adjustment at next appointment.",
      "confidence": 0.85
    }
  ]
}
```

---

### Submit AI Feedback

```
POST /api/v3/ai-intelligence/feedback
```

Help improve AI recommendations by submitting feedback.

**Request Body:**
```json
{
  "feature": "triage",
  "feedback_type": "incorrect",
  "details": "Severity was underestimated — patient needed emergency care",
  "reference_id": "triage-001"
}
```

**Response 200:**
```json
{ "success": true, "feedback_id": "fb-001" }
```

---

## AI Vision API (Medical Image Analysis)

Base URL: `https://api.mediqzy.com/api/ai/vision`  
Auth: Doctor session token only (`authDoctor` middleware)

Analyzes medical images (X-rays, ECGs, lab result photos) using a multimodal LLM and returns structured clinical observations.

---

### Analyze Medical Image

```
POST /api/ai/vision/analyze
Content-Type: multipart/form-data
```

**Form fields:**
- `image` — Image file (JPEG/PNG/WebP, max 10MB)
- `analysisType` — `xray`, `ecg`, `lab_report`, `prescription`, `wound`
- `patientId` (optional) — to attach result to patient record
- `notes` (optional) — Clinical context (e.g. "Patient complains of right-sided chest pain")

**Response 200:**
```json
{
  "analysis_id": "vis-001",
  "analysis_type": "xray",
  "observations": [
    "Increased opacity in right lower lobe consistent with consolidation",
    "No pneumothorax detected",
    "Cardiac silhouette within normal limits"
  ],
  "impression": "Findings suggestive of right lower lobe pneumonia",
  "confidence": 0.88,
  "recommended_action": "Correlate with clinical findings. Consider sputum culture and antibiotic therapy.",
  "model": "claude-3-5-sonnet-20241022",
  "processed_at": "2026-04-04T16:00:00Z"
}
```

> AI Vision outputs are decision-support tools. All findings must be reviewed and confirmed by a qualified physician.

---

## Updated Quick Reference

### All API Modules

| Module | Base Path | # Endpoints | Auth Type |
|--------|-----------|-------------|-----------|
| **Auth** | `/v1/auth/` | 3 | None (exchange/refresh), Bearer (revoke) |
| **Users** | `/v1/{tid}/users/` | 5 | Bearer + scope |
| **Doctors** | `/v1/{tid}/doctors/` | 4 | Bearer + scope |
| **Appointments** | `/v1/{tid}/appointments/` | 6 | Bearer + scope |
| **Chat** | `/v1/{tid}/chat/` | 7 | Bearer + scope |
| **Video** | `/v1/{tid}/video/` | 3 | Bearer + scope |
| **Labs** | `/v1/{tid}/labs/` | 13 | Bearer + scope |
| **Pharmacy** | `/v1/{tid}/pharmacy/` | 5 | Bearer + scope |
| **Homecare** | `/v1/{tid}/homecare/` | 6 | Bearer + scope |
| **Activity + Wearables** | `/v1/{tid}/activity/` | 10 | Bearer + scope |
| **Wellness/HRA** | `/v1/{tid}/wellness/` | 4 | Bearer + scope |
| **Webhooks** | `/v1/{tid}/webhooks/` | 7 | Bearer + scope |
| **AI Brain** | `/api/v3/ai-brain/` | 8 | Bearer (session) |
| **AI Intelligence** | `/api/v3/ai-intelligence/` | 12 | Bearer (session) |
| **AI Vision** | `/api/ai/vision/` | 1 | Bearer (doctor) |
| **Mobile Gateway** | `/api/mobile/` | 18 | Bearer or none (auth/orgs) |
| **Push Notifications** | `/api/notifications/` | 8 | Bearer (session) |
| **Health Wallet** | `/api/wallet/` | 10 | Bearer (session) |

**Total: ~130 endpoints**  
**Wearable sources:** Apple HealthKit, Google Fit / Health Connect, Fitbit, Garmin, generic BLE — all via `POST /activity/log/batch`

---

### Typical Patient App Flow

```
1. POST /v1/auth/exchange            ← obtain JWT from OIDC token
2. POST /v1/{tid}/users              ← create/sync user profile
3. PUT  /v1/{tid}/users/:id/health-profile  ← set health data
4. GET  /v1/{tid}/doctors?specialization=cardiology  ← find doctor
5. GET  /v1/{tid}/doctors/:id/slots?date=...   ← see available slots
6. POST /v1/{tid}/appointments       ← book appointment
7. POST /v1/{tid}/video/token        ← join video call (if tele)
8. POST /v1/{tid}/chat/rooms/:id/messages  ← chat during/after
9. GET  /v1/{tid}/labs/bookings/:id/report ← receive lab report
10. POST /v1/{tid}/wellness/hra      ← submit health risk assessment
11. POST /api/v3/ai-brain/think      ← ask AI about results
12. POST /v1/auth/revoke             ← logout
```

### Doctor App Flow

```
1. POST /v1/auth/exchange
2. GET  /v1/{tid}/appointments?userType=doctor
3. POST /api/v3/ai-intelligence/triage/assess  ← triage incoming patient
4. POST /api/ai/vision/analyze                 ← analyze X-ray/ECG
5. POST /api/v3/ai-intelligence/drug-interactions/check  ← before prescribing
6. POST /v1/{tid}/pharmacy/prescriptions       ← issue prescription
7. POST /v1/{tid}/appointments/:id/complete    ← close appointment
```

### Lab Flow (unchanged)

```
1. GET  /labs/categories
2. GET  /labs/tests?search=CBC
3. GET  /labs/partners?city=Mumbai
4. GET  /labs/slots?date=2026-04-05
5. POST /labs/bookings
6. POST /labs/bookings/:id/payment
7. GET  /labs/bookings/:id
8. GET  /labs/bookings/:id/report
9. POST /labs/bookings/:id/cancel
```

### Activity Monitor (daily sync)

```
1. POST /activity/log/batch
2. GET  /activity/summary?user_id=X&period=weekly
3. GET  /activity/heart-rate?user_id=X&period=daily
```

---

## Mobile API Gateway

Base URL: `https://api.mediqzy.com/api/mobile`  
Auth: Bearer token (JWT) via `Authorization: Bearer <token>` **or** `X-Auth-Token: <token>`

The Mobile API Gateway is the **recommended entry point for iOS and Android apps**. It includes response compression, version checks, and mobile-specific features like push token management and device tracking — all optimized for low-bandwidth usage.

**Required mobile headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `X-Platform` | Recommended | `ios`, `android`, or `flutter` |
| `X-App-Version` | Recommended | e.g. `2.1.0` |
| `X-Device-ID` | Recommended | Unique device identifier (UUID) |
| `X-Build-Number` | Optional | App build number |

---

### Auth — Email/Password Login

```
POST /api/mobile/auth/login
```

**Request Body:**
```json
{
  "email": "priya.sharma@example.com",
  "password": "SecurePass123",
  "deviceId": "device-uuid-here",
  "pushToken": "fcm-or-apns-token"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr-abc123",
      "name": "Priya Sharma",
      "email": "priya.sharma@example.com",
      "phone": "+919876543210",
      "avatar_url": null,
      "role": "patient"
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresIn": "30d"
  }
}
```

---

### Auth — OTP Login (Phone)

**Step 1: Request OTP**
```
POST /api/mobile/auth/otp/request
Body: { "phone": "+919876543210" }
```

**Response:**
```json
{ "success": true, "message": "OTP sent successfully", "data": { "expiresIn": 300 } }
```

**Step 2: Verify OTP**
```
POST /api/mobile/auth/otp/verify
Body: { "phone": "+919876543210", "otp": "482910", "deviceId": "uuid", "pushToken": "fcm..." }
```

**Response:** Same shape as email/password login — returns `accessToken`, `refreshToken`, user object.

---

### Auth — Signup

```
POST /api/mobile/auth/signup
```

**Request Body:**
```json
{
  "firstName": "Priya",
  "lastName": "Sharma",
  "email": "priya.sharma@example.com",
  "phone": "+919876543210",
  "password": "SecurePass123",
  "dateOfBirth": "1990-05-14",
  "gender": "female",
  "deviceId": "device-uuid",
  "pushToken": "fcm..."
}
```

**Response 201:** Same shape as login — user object + `accessToken` + `refreshToken`.

---

### Auth — Corporate Login

```
POST /api/mobile/auth/corporate-login
Body: { "email": "employee@company.com", "password": "..." }
```

Returns the same token shape plus `corporate_profile` with employer name and plan details.

---

### Device Registration

Register the device after login to enable push notifications and analytics.

```
POST /api/mobile/devices/register
Authorization: Bearer <token>  (optional — can be called before login)
```

**Request Body:**
```json
{
  "deviceId": "a1b2c3d4-...",
  "platform": "ios",
  "model": "iPhone 15 Pro",
  "osVersion": "17.4",
  "pushToken": "apns-token-here"
}
```

**Response 200:** `{ "success": true, "message": "Device registered successfully" }`

---

### Update Push Token

Call this whenever the FCM/APNs token rotates.

```
PUT /api/mobile/devices/push-token
Authorization: Bearer <token>
Body: { "deviceId": "a1b2c3d4-...", "pushToken": "new-token-here" }
```

**Response 200:** `{ "success": true, "message": "Push token updated" }`

---

### List Organisations (Tenant Discovery)

No auth required. Used on the login screen to let users select their organisation.

```
GET /api/mobile/organizations
```

**Query Parameters:**

| Param | Description |
|-------|-------------|
| `type` | `hospital`, `clinic`, `corporate`, `broker`, etc. |
| `query` | Name search |
| `city` | Filter by city |
| `parent_id` | Children of a specific org |
| `aggregator_uid` | All orgs under an aggregator |
| `page` / `limit` | Pagination |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": 1,
        "name": "Apollo Hospitals",
        "slug": "apollo-hospitals",
        "type": "hospital",
        "location": "Mumbai, Maharashtra",
        "parent": null
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
  }
}
```

---

### Home Dashboard

```
GET /api/mobile/dashboard
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "upcoming_appointments": [
      {
        "id": "appt-001",
        "appointment_date": "2026-04-08",
        "appointment_time": "10:30",
        "type": "opd",
        "status": "scheduled",
        "doctor_name": "Dr. Rajesh Kumar",
        "doctor_specialty": "Cardiology"
      }
    ],
    "unread_notifications": 3,
    "quick_actions": [
      { "title": "Book Appointment", "icon": "calendar", "action": "/doctors" },
      { "title": "My Prescriptions", "icon": "file-text", "action": "/prescriptions" },
      { "title": "Lab Tests", "icon": "beaker", "action": "/lab" },
      { "title": "Video Consult", "icon": "video", "action": "/video" }
    ],
    "available_services": [
      { "id": "doctors", "name": "Doctor Consultations", "icon": "stethoscope" },
      { "id": "video_consultation", "name": "Video Consultation", "icon": "video" },
      { "id": "lab_services", "name": "Lab Services", "icon": "microscope" },
      { "id": "pharmacy_services", "name": "Pharmacy Services", "icon": "pill-bottle" }
    ]
  }
}
```

---

### User Profile (Mobile)

```
GET /api/mobile/user/profile
Authorization: Bearer <token>
```

```
PUT /api/mobile/user/profile
Authorization: Bearer <token>
Body: { "firstName": "Priya", "phone": "+919876543210", ... }
```

---

### Wellness Service Catalog

Lists all available wellness services for the logged-in employee/member.

```
GET /api/mobile/wellness/services
Authorization: Bearer <token>
```

Returns categories: Lab Services, Pharmacy Services, Homecare Services, Ambulance Services.

---

### Wellness — Request Lab Test (Home Collection)

```
POST /api/mobile/wellness/lab/request
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "testType": "Complete Blood Count (CBC)",
  "preferredDate": "2026-04-08",
  "preferredTime": "08:00",
  "address": "12, Shanti Nagar, Mumbai 400001"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "req-001",
    "testType": "Complete Blood Count (CBC)",
    "preferredDate": "2026-04-08",
    "preferredTime": "08:00",
    "status": "pending",
    "nextSteps": "Our team will contact you within 2 hours to confirm the appointment"
  }
}
```

---

### Wellness — Order Medicines

```
POST /api/mobile/wellness/pharmacy/order
Authorization: Bearer <token>
Body: {
  "medicines": [{ "name": "Amlodipine 5mg", "quantity": 30 }],
  "prescriptionUrl": "https://...",
  "deliveryAddress": "12, Shanti Nagar...",
  "notes": "Urgent"
}
```

---

### Wellness — Request Homecare

```
POST /api/mobile/wellness/homecare/request
Authorization: Bearer <token>
Body: {
  "serviceType": "Nursing Care",
  "preferredDate": "2026-04-08",
  "address": "..."
}
```

---

### Wellness — Request Ambulance

```
POST /api/mobile/wellness/ambulance/request
Authorization: Bearer <token>
Body: {
  "serviceType": "Emergency",
  "pickupAddress": "...",
  "dropAddress": "...",
  "notes": "Patient unconscious"
}
```

---

### Get All Wellness Requests

```
GET /api/mobile/wellness/requests?type=all
Authorization: Bearer <token>
```

`type`: `all` (default), `lab`, `pharmacy`, `homecare`, `ambulance`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "request_type": "lab",
        "id": "req-001",
        "service_detail": "CBC",
        "preferred_date": "2026-04-08",
        "status": "confirmed",
        "created_at": "2026-04-04T10:00:00Z"
      }
    ]
  }
}
```

---

## Push Notifications API

Base URL: `https://api.mediqzy.com/api/notifications`  
Auth: Standard session Bearer token

Push/in-app notification management for both patients and doctors.

---

### List Notifications

```
GET /api/notifications
Authorization: Bearer <token>
```

**Query Parameters:** `page`, `limit` (default 20), `unreadOnly=true`, `type` (notification category filter)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notif-001",
      "type": "appointment_reminder",
      "title": "Appointment Tomorrow",
      "message": "Your appointment with Dr. Kumar is at 10:30 AM tomorrow.",
      "isRead": false,
      "actionUrl": "/appointments/appt-001",
      "createdAt": "2026-04-04T08:00:00Z"
    }
  ],
  "unreadCount": 3,
  "pagination": { "page": 1, "limit": 20, "total": 8 }
}
```

---

### Get Unread Count

```
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

**Response 200:** `{ "success": true, "count": 3 }`

---

### Mark as Read

```
POST /api/notifications/:id/read
Authorization: Bearer <token>
```

**Response 200:** `{ "success": true, "message": "Notification marked as read" }`

---

### Mark All as Read

```
POST /api/notifications/read-all
Authorization: Bearer <token>
```

**Response 200:** `{ "success": true, "message": "All notifications marked as read" }`

---

### Delete Notification

```
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

**Response 200:** `{ "success": true, "message": "Notification deleted" }`

---

### Register Push Token (FCM / APNs)

Call after login and whenever the token rotates. This enables push delivery from all server-side events (appointments, prescriptions, reports, etc.).

```
POST /api/notifications/fcm/register
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "token": "fcm-or-apns-token-string",
  "deviceType": "android"
}
```

`deviceType`: `android`, `ios`, or `web`

**Response 200:** `{ "success": true, "message": "FCM token registered successfully" }`

> **Tip:** Use `/api/mobile/devices/register` (above) at startup — it registers the push token and device metadata in one call.

---

### Get Notification Preferences

```
GET /api/notifications/preferences
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "preferences": {
    "push": true,
    "email": true,
    "sms": true,
    "inApp": true,
    "appointmentReminders": true,
    "paymentAlerts": true,
    "promotions": false
  }
}
```

---

### Notification Types Reference

| Type | Trigger |
|------|---------|
| `appointment_reminder` | 24 hrs before appointment |
| `appointment_confirmed` | Appointment booked/confirmed |
| `appointment_cancelled` | Appointment cancelled |
| `lab_report_ready` | Lab report uploaded |
| `prescription_issued` | Doctor issued prescription |
| `payment_success` | Payment confirmed |
| `pharmacy_dispatched` | Medicine order shipped |
| `homecare_assigned` | Professional assigned to booking |
| `health_reminder` | AI-generated health nudge |
| `general` | Admin/system message |

---

## Health Wallet (Health Coins) API

Base URL: `https://api.mediqzy.com/api/wallet`  
Auth: Standard session Bearer token

Mediczy Health Coins (HC) are a rewards currency earned by healthy behaviours. **1 HC = ₹1 INR** and can be redeemed against consultations, lab tests, and medicines.

**Earn rates:**

| Action | Coins |
|--------|-------|
| Daily app login | 1 HC |
| Login streak (7 days) | +5 HC bonus |
| Login streak (14 days) | +10 HC bonus |
| Login streak (30 days) | +25 HC bonus |
| 100 steps walked | 1 HC (max 10 HC/day) |
| Log vital signs | 2 HC |
| Complete Health Risk Assessment | 5 HC |
| Book an appointment | 3 HC |
| Complete an appointment | 5 HC |
| Complete profile | 10 HC |
| Refer a friend | 20 HC |
| Leave a review | 5 HC |
| Achieve weekly steps goal | 15 HC |
| Birthday bonus | 50 HC |

---

### Get Wallet Summary

```
GET /api/wallet
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "balance": 125,
    "total_earned": 340,
    "total_spent": 215,
    "streak": 7,
    "level": "Silver",
    "next_level_coins": 500
  }
}
```

---

### Get Balance

```
GET /api/wallet/balance
Authorization: Bearer <token>
```

**Response 200:** `{ "success": true, "balance": 125 }`

---

### Get Transaction History

```
GET /api/wallet/transactions?limit=50&offset=0
Authorization: Bearer <token>
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "txn-001",
      "type": "earn",
      "amount": 5,
      "description": "Completed health risk assessment",
      "reference_type": "hra",
      "reference_id": "hra-001",
      "created_at": "2026-04-04T15:00:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "count": 12 }
}
```

---

### Earn — Daily Login

Call once per session on app foreground entry.

```
POST /api/wallet/earn/daily-login
Authorization: Bearer <token>
Body: {}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Earned 1 health coins for daily login!",
  "coinsEarned": 1,
  "bonusCoins": 0,
  "streak": 3,
  "newBalance": 128
}
```

If already claimed today: `{ "success": false, "message": "Daily login reward already claimed", "streak": 3 }`

---

### Earn — Steps

Call once daily after syncing step count from wearable/pedometer.

```
POST /api/wallet/earn/steps
Authorization: Bearer <token>
Body: { "steps": 8500 }
```

**Response 200:**
```json
{
  "success": true,
  "message": "Earned 8 health coins for steps!",
  "coinsEarned": 8,
  "steps": 8500,
  "newBalance": 136
}
```

> Formula: `min(floor(steps / 100), 10)` HC per day.

---

### Earn — Vital Signs

Call when user logs blood pressure, weight, or other vitals.

```
POST /api/wallet/earn/vital-signs
Authorization: Bearer <token>
Body: {}
```

**Response 200:** `{ "success": true, "coinsEarned": 2, "newBalance": 138 }`

---

### Earn — Health Assessment

Call after the user completes a Health Risk Assessment (HRA).

```
POST /api/wallet/earn/health-assessment
Authorization: Bearer <token>
Body: {}
```

**Response 200:** `{ "success": true, "coinsEarned": 5, "newBalance": 143 }`

---

### Earn — Generic Activity

```
POST /api/wallet/earn/activity
Authorization: Bearer <token>
Body: { "activityType": "appointment_booking", "metadata": { "appointmentId": "appt-001" } }
```

**Response 200:** `{ "success": true, "coinsEarned": 3, "newBalance": 146 }`

---

### Spend Health Coins

```
POST /api/wallet/spend
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "amount": 50,
  "activityType": "appointment_payment",
  "description": "Partial payment for Dr. Kumar consultation",
  "referenceType": "appointment",
  "referenceId": "appt-001"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "50 health coins spent",
  "coinsSpent": 50,
  "newBalance": 75
}
```

---

### View Rewards & Offers

```
GET /api/wallet/rewards
Authorization: Bearer <token>
```

Returns available redemption offers (discounts on labs, consultations, medicines).

---

### Validate Coupon

```
POST /api/wallet/validate-coupon
Authorization: Bearer <token>
Body: { "code": "HEALTH20" }
```

**Response 200:**
```json
{
  "success": true,
  "coupon": {
    "code": "HEALTH20",
    "discount_type": "percentage",
    "discount_value": 20,
    "applicable_on": ["lab_tests", "consultations"],
    "expires_at": "2026-04-30T23:59:59Z"
  }
}
```

---

### Purchase Health Coins

```
POST /api/wallet/purchase
Authorization: Bearer <token>
Body: { "package_coins": 250 }
```

**Coin packages:**

| Coins | Price (INR) | Discount |
|-------|-------------|---------|
| 100 | ₹99 | — |
| 250 | ₹199 | 20% |
| 500 | ₹349 | 30% |
| 1,000 | ₹599 | 40% |
| 2,500 | ₹1,299 | 48% |

**Response 200:** Returns a Razorpay order object for client-side checkout.

---

## Razorpay Payment Gateway API

Base URL: `https://api.mediqzy.com/api/payments`  
Auth: Standard session Bearer token (except `/webhook` — no auth)

Mediczy uses Razorpay as the primary payment gateway. All monetary amounts are in **paise** (1 INR = 100 paise). The standard integration flow is:

```
1. POST /api/payments/order      ← create Razorpay order on server
2. Client opens Razorpay Checkout SDK with the returned order_id + key_id
3. User pays → Razorpay calls your success handler with 3 params
4. POST /api/payments/verify     ← verify signature server-side
5. Unlock purchased resource (lab booking, consultation, etc.)
```

> **Processing fee:** 2.36% of the transaction amount is deducted. The `netAmount` field in the order response shows the amount Mediczy will receive.

---

### Create Payment Order

```
POST /api/payments/order
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "amount": 70000,
  "currency": "INR",
  "clientType": "lab_booking",
  "clientId": "booking-abc123",
  "clientName": "Priya Sharma",
  "description": "CBC + Lipid Profile — Thyrocare",
  "metadata": {
    "tenant_id": 1,
    "user_id": "usr-abc123"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ | Amount in **paise** (₹700 = 70000) |
| `currency` | string | — | Default `INR` |
| `clientType` | string | ✅ | `lab_booking`, `appointment`, `pharmacy_order`, `homecare_booking`, `wallet_purchase` |
| `clientId` | string | ✅ | ID of the entity being paid for |
| `clientName` | string | ✅ | Customer display name |
| `description` | string | — | Line item description shown in Razorpay |
| `metadata` | object | — | Any extra key-value pairs stored in Razorpay notes |

**Response 200:**
```json
{
  "success": true,
  "order": {
    "id": "order_PjXXXXXXXXXXXX",
    "entity": "order",
    "amount": 70000,
    "currency": "INR",
    "receipt": "rcpt_1712222222222_booking-abc123",
    "status": "created"
  },
  "transaction": {
    "id": "txn_1712222222222",
    "razorpayOrderId": "order_PjXXXXXXXXXXXX",
    "clientType": "lab_booking",
    "clientId": "booking-abc123",
    "amount": 70000,
    "currency": "INR",
    "fees": 1652,
    "netAmount": 68348,
    "status": "pending"
  },
  "gatewayConfig": {
    "key_id": "rzp_live_XXXXXXXXXXXXXXX",
    "name": "Mediczy",
    "currency": "INR",
    "theme": { "color": "#3399cc" }
  }
}
```

**Client-side checkout (React Native / Flutter / Web):**
```js
// Use gatewayConfig.key_id + order.id from the response above
const options = {
  key: gatewayConfig.key_id,
  amount: order.amount,
  currency: order.currency,
  order_id: order.id,
  name: gatewayConfig.name,
  description: "Payment for your health service",
  handler: function(response) {
    // response contains: razorpay_order_id, razorpay_payment_id, razorpay_signature
    // → call POST /api/payments/verify
  }
};
const rzp = new Razorpay(options);
rzp.open();
```

---

### Verify Payment (After Checkout)

Call this immediately after the Razorpay `handler` callback fires on the client.

```
POST /api/payments/verify
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "razorpay_order_id": "order_PjXXXXXXXXXXXX",
  "razorpay_payment_id": "pay_PjYYYYYYYYYYYY",
  "razorpay_signature": "hmac-sha256-of-order_id|payment_id"
}
```

The server computes `HMAC-SHA256(key_secret, order_id + "|" + payment_id)` and compares to the provided signature. If it matches, the payment is authentic.

**Response 200 (success):**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "payment": {
    "id": "pay_PjYYYYYYYYYYYY",
    "amount": 70000,
    "currency": "INR",
    "status": "captured",
    "method": "upi",
    "email": "priya.sharma@example.com",
    "contact": "+919876543210",
    "created_at": 1712222300
  },
  "transaction": {
    "id": "txn_1712222222222",
    "status": "completed",
    "razorpayPaymentId": "pay_PjYYYYYYYYYYYY",
    "paymentMethod": "upi",
    "completedAt": "2026-04-04T12:05:00Z"
  }
}
```

**Response 400 (signature invalid):**
```json
{ "success": false, "message": "Payment signature verification failed" }
```

> A `payment.success` Kafka event is published on successful verification, triggering downstream workflows (lab booking confirmation, appointment confirmation, etc.).

---

### Get Transaction History

```
GET /api/payments/transactions
Authorization: Bearer <token>
```

**Query Parameters:**

| Param | Description |
|-------|-------------|
| `status` | `pending`, `completed`, `failed`, `refunded` |
| `clientType` | `lab_booking`, `appointment`, `pharmacy_order`, etc. |
| `gatewayId` | Filter by gateway |
| `startDate` / `endDate` | ISO date range |
| `limit` | Default 100 |
| `offset` | Pagination offset |

**Response 200:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "txn_1712222222222",
      "razorpayOrderId": "order_PjXXXXXXXXXXXX",
      "razorpayPaymentId": "pay_PjYYYYYYYYYYYY",
      "clientType": "lab_booking",
      "clientId": "booking-abc123",
      "clientName": "Priya Sharma",
      "amount": 70000,
      "currency": "INR",
      "fees": 1652,
      "netAmount": 68348,
      "status": "completed",
      "paymentMethod": "upi",
      "description": "CBC + Lipid Profile — Thyrocare",
      "createdAt": "2026-04-04T12:00:00Z",
      "completedAt": "2026-04-04T12:05:00Z"
    }
  ],
  "stats": {
    "total": 1,
    "completed": 1,
    "pending": 0,
    "failed": 0,
    "totalRevenue": 70000
  },
  "pagination": { "limit": 100, "offset": 0, "total": 1 }
}
```

---

### Get Single Transaction

```
GET /api/payments/transactions/:id
Authorization: Bearer <token>
```

**Response 200:** Full transaction object.

---

### Create Refund

```
POST /api/payments/refund
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "transactionId": "txn_1712222222222",
  "amount": 70000,
  "reason": "Service cancelled by patient",
  "speed": "normal"
}
```

| Field | Description |
|-------|-------------|
| `transactionId` | Internal transaction ID (not Razorpay order ID) |
| `amount` | Paise — omit for full refund |
| `reason` | Stored in notes |
| `speed` | `normal` (5–7 days) or `optimum` (instant, extra fee) |

Only `completed` transactions can be refunded.

**Response 200:**
```json
{
  "success": true,
  "message": "Refund created successfully",
  "refund": {
    "id": "rfnd_XXXXXXXXXXXXXXX",
    "payment_id": "pay_PjYYYYYYYYYYYY",
    "amount": 70000,
    "status": "processed",
    "speed_processed": "normal",
    "created_at": 1712225000
  }
}
```

---

### Razorpay Webhook Handler

```
POST /api/payments/webhook
(No auth — verified via X-Razorpay-Signature header)
```

Configure this URL in your Razorpay Dashboard → Webhooks. The server verifies the `X-Razorpay-Signature` header using HMAC-SHA256 with your webhook secret.

**Handled events:**

| Razorpay Event | Action |
|----------------|--------|
| `payment.captured` | Mark transaction `completed`, publish Kafka event |
| `payment.failed` | Mark transaction `failed` |
| `refund.created` | Record refund |
| `refund.speed_changed` | Update refund status |
| `order.paid` | Confirm order settled |

**Response 200:** `{ "success": true, "message": "Webhook processed successfully" }`

---

### Get Payment Config (Public)

```
GET /api/payments/config
(No auth required)
```

Returns the Razorpay `key_id` (public key) and gateway metadata for client-side initialisation.

**Response 200:**
```json
{
  "success": true,
  "config": {
    "key_id": "rzp_live_XXXXXXXXXXXXXXX",
    "currency": "INR",
    "gateway": "Razorpay",
    "processingFeePercent": 2.36
  }
}
```

---

### Payment Flow — Integration Notes

**Amount format:** Always pass amounts in **paise**. Divide by 100 when displaying to users.

```
₹700.00  →  70000 paise
₹1,299   →  129900 paise
```

**Supported payment methods** (all handled by Razorpay Checkout automatically):
- UPI (GPay, PhonePe, Paytm, BHIM)
- Credit / Debit cards (Visa, Mastercard, Rupay, Amex)
- Net banking (50+ banks)
- Wallets (Paytm, Mobikwik, Freecharge)
- EMI
- Pay Later (Simpl, ZestMoney)

**Test credentials:**
```
Key ID:     rzp_test_XXXXXXXXXXXXXXX   (from Razorpay test dashboard)
Card:       4111 1111 1111 1111  Exp: any future  CVV: any 3 digits
UPI:        success@razorpay
```

**clientType reference table:**

| clientType | What is being paid for |
|------------|----------------------|
| `lab_booking` | Lab test booking |
| `appointment` | Doctor consultation |
| `pharmacy_order` | Medicine order |
| `homecare_booking` | Homecare service |
| `wallet_purchase` | Buying Health Coins |
| `subscription` | Membership / plan |
