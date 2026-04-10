# Homecare Services API Integration Guide — Patient / User Mobile App

**Version:** 1.0  
**Date:** July 2026  
**Base URL (Production):** `https://api.mediqzy.com`  
**API Path Prefixes:**
- Patient-facing: `/api/homecare`
- B2B Tenant API (v1): `/v1/{tenant-id}/homecare`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Homecare Provider Authentication](#3-homecare-provider-authentication)
4. [Patient: Book Homecare Appointment](#4-patient-book-homecare-appointment)
5. [API v1: Homecare Services Catalog](#5-api-v1-homecare-services-catalog)
6. [API v1: Create Booking](#6-api-v1-create-booking)
7. [API v1: List My Bookings](#7-api-v1-list-my-bookings)
8. [API v1: Get Booking Details](#8-api-v1-get-booking-details)
9. [API v1: Update Booking](#9-api-v1-update-booking)
10. [Enums & Constants](#10-enums--constants)
11. [Error Handling](#11-error-handling)
12. [Integration Flows](#12-integration-flows)
13. [Test Credentials](#13-test-credentials)

---

## 1. Overview

Mediqzy Homecare allows patients to book at-home medical services — nursing care, physiotherapy, elder care, post-surgical care, and more. There are two integration tracks:

| Track | Auth Type | Base Path | Use Case |
|-------|-----------|-----------|----------|
| Patient / Consumer | Patient JWT (from `/api/auth/login`) | `/api/homecare` | Patients booking services via mobile app |
| B2B Tenant API v1 | API Key + Tenant JWT | `/v1/{tenant-id}/homecare` | Aggregators, TPAs, and enterprise clients |

The **patient-facing** `/api/homecare/book` endpoint supports quick, unauthenticated bookings with fee estimation.  
The **v1 API** is scoped to tenant accounts and requires API credentials and `homecare.read` / `homecare.write` scopes.

---

## 2. Authentication

### 2.1 Patient Login (required for v1 API)

```
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "YourPassword"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 19,
    "name": "Test User",
    "email": "user@example.com",
    "role": "patient"
  }
}
```

Use the returned `token` as a Bearer token for all subsequent requests:
```
Authorization: Bearer <token>
```

JWT tokens are valid for **7 days**.

---

## 3. Homecare Provider Authentication

These endpoints are used by **homecare service providers** — not by patients.

### 3.1 Provider Login

```
POST /api/homecare/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "provider@example.com",
  "password": "ProviderPassword"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGci...",
  "homecare": {
    "id": 1,
    "name": "Health At Home Services",
    "email": "provider@example.com",
    "phone": "+91-9876543210",
    "providerType": "agency",
    "status": "active",
    "isVerified": true,
    "services": [...]
  }
}
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 400 | Missing email or password |
| 401 | Invalid credentials |
| 403 (pending: true) | Account awaiting review |
| 403 | Account inactive |

### 3.2 Verify Token

```
GET /api/homecare/verify
Authorization: Bearer <provider-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "homecare": {
    "id": 1,
    "email": "provider@example.com",
    "role": "homecare"
  }
}
```

### 3.3 Provider Logout

```
POST /api/homecare/logout
Authorization: Bearer <provider-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```
> Tokens are stateless JWT — the client must discard the token upon logout.

### 3.4 Provider Registration

```
POST /api/homecare/register
Content-Type: multipart/form-data
```

Registers a new homecare service provider (bot-protected, admin-reviewed).

**Required Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Provider/organisation name |
| `email` | string | Login email |
| `password` | string | Minimum 8 characters |
| `confirmPassword` | string | Must match password |
| `phone` | string | Contact phone number |
| `city` | string | Operating city |
| `coordinatorName` | string | Primary service coordinator name |
| `coordinatorQual` | string | Coordinator qualification |

**Optional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `serviceType` | string | E.g. `"Nursing Care"`, `"Physiotherapy"` |
| `state` | string | State |
| `address` | string | Street address |
| `registrationNumber` | string | Business registration number |
| `coordinatorCert` | string | Certification details |
| `lat` / `lng` | number | GPS coordinates |
| `contactIdCard` | file | ID card upload (image/pdf) |
| `_hp` | string | Honeypot field — leave empty |
| `_fat` | number | Form-submission timestamp (ms) |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Application submitted. Our team will review within 24–48 hours.",
  "registrationId": 12,
  "entityType": "homecare"
}
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 400 | Missing required fields |
| 409 | Email already registered |
| 500 | Server/upload error |

### 3.5 Provider Profile

```
GET /api/homecare/profile
Authorization: Bearer <provider-token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "homecare": {
    "id": 1,
    "name": "Health At Home Services",
    "email": "provider@example.com",
    "phone": "+91-9876543210",
    "license_number": "REG-2024-001",
    "services": [...],
    "address": {...},
    "status": "active"
  }
}
```

---

## 4. Patient: Book Homecare Appointment

> **Note:** This is the primary patient-facing booking endpoint. It does **not** require patient authentication — useful for guest bookings or quick-flow integrations. The booking is confirmed immediately with fee estimation (not yet persisted to a DB table; track via the returned `id`).

```
POST /api/homecare/book
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `homecareId` | number | ✅ | ID of the homecare provider |
| `appointmentDate` | string | ✅ | Format: `YYYY-MM-DD` |
| `appointmentTime` | string | ✅ | Format: `HH:MM` (24h) |
| `serviceType` | string | ✅ | `"doctor"`, `"nurse"`, or `"lab"` |
| `patientAddress` | object | ✅ | Must include `street` and `city` |
| `patientAddress.street` | string | ✅ | Street / locality |
| `patientAddress.city` | string | ✅ | City |
| `patientAddress.state` | string | ❌ | State |
| `patientAddress.pincode` | string | ❌ | Postal code |
| `patientName` | string | ❌ | Patient's full name (default: `"Patient"`) |
| `patientPhone` | string | ❌ | Patient contact number |
| `emergencyContact` | string | ❌ | Emergency contact (defaults to patientPhone) |
| `specificService` | string | ❌ | Specific service description |
| `duration` | number | ❌ | Duration in minutes (default: 60) |
| `symptoms` | string | ❌ | Symptoms or notes |
| `notes` | string | ❌ | Additional instructions |

**Example Request:**
```json
{
  "homecareId": 1,
  "appointmentDate": "2026-08-01",
  "appointmentTime": "10:00",
  "serviceType": "nurse",
  "patientName": "Rohini Sharma",
  "patientPhone": "9876543210",
  "patientAddress": {
    "street": "42, Nagar Road",
    "city": "Pune",
    "state": "Maharashtra",
    "pincode": "411001"
  },
  "specificService": "Post-surgical wound dressing",
  "duration": 60,
  "symptoms": "Post appendectomy care",
  "notes": "Bring sterile dressing kit"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Homecare appointment booked successfully",
  "appointment": {
    "id": "homecare-appt-1753000000000",
    "homecareId": 1,
    "patientName": "Rohini Sharma",
    "patientPhone": "9876543210",
    "emergencyContact": "9876543210",
    "appointmentDate": "2026-08-01",
    "appointmentTime": "10:00",
    "serviceType": "nurse",
    "specificService": "Post-surgical wound dressing",
    "duration": 60,
    "symptoms": "Post appendectomy care",
    "notes": "Bring sterile dressing kit",
    "patientAddress": {
      "street": "42, Nagar Road",
      "city": "Pune",
      "state": "Maharashtra",
      "pincode": "411001"
    },
    "status": "scheduled",
    "bookingTime": "2026-07-20T10:30:00.000Z",
    "fee": 1000,
    "visitStatus": "pending"
  }
}
```

### Fee Calculation

The fee is automatically calculated based on service type and duration:

| Service Type | Base Rate (per hour) |
|-------------|---------------------|
| `doctor` | ₹2,000 |
| `nurse` | ₹1,000 |
| `lab` | ₹1,500 |

**Formula:** `fee = baseRate × ceil(duration / 60)`

**Examples:**
- nurse, 60 min → ₹1,000 × 1 = **₹1,000**
- doctor, 90 min → ₹2,000 × 2 = **₹4,000**
- lab, 30 min → ₹1,500 × 1 = **₹1,500**

**Error Responses:**

| Status | Message |
|--------|---------|
| 400 | `"Homecare ID, appointment date, and time are required"` |
| 400 | `"Service type must be "doctor", "nurse", or "lab""` |
| 400 | `"Complete patient address is required for homecare services"` |

---

## 5. API v1: Homecare Services Catalog

> **Auth Required:** Tenant API Key + Bearer token with `homecare.read` scope.

```
GET /v1/{tenant-id}/homecare/services
Authorization: Bearer <tenant-user-token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | — | Filter by service category |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 50) |

**Example Request:**
```
GET /v1/tenant-abc123/homecare/services?category=nursing&page=1&limit=10
Authorization: Bearer eyJhbGci...
```

**Response (200 OK):**
```json
[
  {
    "service_id": "svc-abc123",
    "tenant_id": "tenant-abc123",
    "name": "Home Nursing Care",
    "description": "Professional nursing care at home post discharge",
    "category": "nursing",
    "qualifications_required": "GNM / B.Sc Nursing",
    "equipment_needed": "BP monitor, stethoscope",
    "duration_minutes": 60,
    "price": 1200,
    "price_per_session": 1200,
    "currency": "INR",
    "available": true,
    "tenant_meta": {},
    "created_at": "2026-02-06T00:00:00.000Z",
    "updated_at": "2026-02-06T00:00:00.000Z"
  }
]
```

---

## 6. API v1: Create Booking

> **Auth Required:** Tenant API Key + Bearer token with `homecare.write` scope.

```
POST /v1/{tenant-id}/homecare/bookings
Authorization: Bearer <tenant-user-token>
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | number | ✅ | Patient user ID (from `api_users`) |
| `service_id` | string | ✅ | Service ID from catalog |
| `service_date` | string | ✅ | Format: `YYYY-MM-DD` |
| `service_time_slot` | string | ✅ | E.g. `"09:00-10:00"` or `"Morning"` |
| `service_address` | object | ✅ | JSON object with address details |
| `patient_name` | string | ✅ | Patient full name (max 255 chars) |
| `patient_age` | number | ✅ | Patient age (0–150) |
| `patient_gender` | string | ✅ | `"male"`, `"female"`, or `"other"` |
| `patient_condition` | string | ❌ | Medical condition description (max 1000 chars) |
| `duration_days` | number | ❌ | Number of days (default: 1, max: 365) |
| `sessions_count` | number | ❌ | Number of sessions (default: 1, max: 100) |
| `total_amount` | number | ❌ | Total booking amount |
| `special_instructions` | string | ❌ | Special care instructions |

**Example Request:**
```json
{
  "user_id": 19,
  "service_id": "svc-abc123",
  "service_date": "2026-08-01",
  "service_time_slot": "09:00-10:00",
  "duration_days": 7,
  "sessions_count": 7,
  "service_address": {
    "street": "42, Nagar Road",
    "area": "Koregaon Park",
    "city": "Pune",
    "state": "Maharashtra",
    "pincode": "411001",
    "landmark": "Near Cafe Coffee Day"
  },
  "patient_name": "Rohini Sharma",
  "patient_age": 45,
  "patient_gender": "female",
  "patient_condition": "Post appendectomy recovery, wound dressing required",
  "total_amount": 8400,
  "special_instructions": "Patient is diabetic. Bring sterile dressing kit."
}
```

**Response (201 Created):**
```json
{
  "booking_id": "hc-1753000000",
  "tenant_id": "tenant-abc123",
  "user_id": 19,
  "service_id": "svc-abc123",
  "service_date": "2026-08-01",
  "service_time_slot": "09:00-10:00",
  "duration_days": 7,
  "sessions_count": 7,
  "patient_name": "Rohini Sharma",
  "patient_age": 45,
  "patient_gender": "female",
  "patient_condition": "Post appendectomy recovery, wound dressing required",
  "service_address": {
    "street": "42, Nagar Road",
    "city": "Pune",
    "pincode": "411001"
  },
  "professional_id": null,
  "professional_name": null,
  "professional_phone": null,
  "status": "pending",
  "payment_status": null,
  "total_amount": "8400",
  "currency": "INR",
  "payment_id": null,
  "special_instructions": "Patient is diabetic. Bring sterile dressing kit.",
  "service_notes": null,
  "tenant_meta": null,
  "created_at": "2026-07-20T06:00:00.000Z",
  "updated_at": "2026-07-20T06:00:00.000Z",
  "completed_at": null,
  "cancelled_at": null
}
```

---

## 7. API v1: List My Bookings

> **Auth Required:** Tenant API Key + Bearer token with `homecare.read` scope.

```
GET /v1/{tenant-id}/homecare/bookings
Authorization: Bearer <tenant-user-token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |
| `sortBy` | string | `created_at` | Sort field |
| `sortOrder` | string | `DESC` | `ASC` or `DESC` |
| `userId` | number | — | Admin/doctor only: filter by user |

**Response (200 OK):**
```json
{
  "data": [
    {
      "booking_id": "hc-1753000000",
      "service_id": "svc-abc123",
      "service_date": "2026-08-01",
      "service_time_slot": "09:00-10:00",
      "patient_name": "Rohini Sharma",
      "status": "pending",
      "total_amount": "8400",
      "created_at": "2026-07-20T06:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

---

## 8. API v1: Get Booking Details

> **Auth Required:** Tenant API Key + Bearer token with `homecare.read` scope.

```
GET /v1/{tenant-id}/homecare/bookings/{bookingId}
Authorization: Bearer <tenant-user-token>
```

**Path Parameter:** `bookingId` — The booking ID returned at creation (e.g. `hc-1753000000`)

**Response (200 OK):** Full booking object (see Section 6 for schema)

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 404 | Booking not found or belongs to different tenant |

---

## 9. API v1: Update Booking

> **Auth Required:** Tenant API Key + Bearer token with `homecare.write` scope.

```
PUT /v1/{tenant-id}/homecare/bookings/{bookingId}
Authorization: Bearer <tenant-user-token>
Content-Type: application/json
```

Update mutable booking fields such as status, service notes, special instructions.

**Example — Cancel Booking:**
```json
{
  "status": "cancelled",
  "service_notes": "Patient recovered, no longer requires service"
}
```

**Example — Mark Completed:**
```json
{
  "status": "completed",
  "service_notes": "7-day wound dressing completed successfully"
}
```

**Example — Update Payment:**
```json
{
  "payment_status": "paid",
  "payment_id": "pay_abc123xyz"
}
```

**Updatable Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | See booking status enum |
| `payment_status` | string | `"pending"`, `"paid"`, `"refunded"` |
| `payment_id` | string | Payment gateway transaction ID |
| `service_notes` | string | Post-service notes |
| `special_instructions` | string | Updated care instructions |
| `service_time_slot` | string | Reschedule time slot |
| `service_date` | string | Reschedule date (YYYY-MM-DD) |

**Response (200 OK):** Updated booking object

---

## 10. Enums & Constants

### Booking Status

| Value | Description |
|-------|-------------|
| `pending` | Booking created, awaiting professional assignment |
| `confirmed` | Professional assigned, booking confirmed |
| `in_progress` | Service is currently being delivered |
| `completed` | Service fully completed |
| `cancelled` | Booking cancelled |

### Service Types (Patient `/api/homecare/book`)

| Value | Base Rate | Description |
|-------|-----------|-------------|
| `doctor` | ₹2,000/hr | Home doctor visit |
| `nurse` | ₹1,000/hr | Home nursing care |
| `lab` | ₹1,500/hr | Home sample collection |

### Patient Gender

| Value |
|-------|
| `male` |
| `female` |
| `other` |

### Provider Types

| Value | Description |
|-------|-------------|
| `individual` | Solo practitioner |
| `agency` | Staffing agency |
| `organization` | Healthcare organisation |

### Service Categories (v1)

Common values (configured per tenant):

| Category | Examples |
|----------|----------|
| `nursing` | Wound care, IV infusion, catheter care |
| `physiotherapy` | Post-surgery rehab, stroke recovery |
| `eldercare` | Daily living assistance, companionship |
| `babycare` | New-born care, lactation support |
| `postsurgical` | Post-op monitoring, dressing changes |
| `medicalequipment` | Oxygen delivery, nebulizer setup |

---

## 11. Error Handling

### Standard Error Format

All APIs return errors in a consistent shape:

```json
{
  "success": false,
  "message": "Human-readable error description",
  "error": "Technical detail (development only)"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created successfully |
| 400 | Invalid request / missing required fields |
| 401 | Not authenticated (missing/invalid token) |
| 403 | Forbidden (insufficient permissions or account inactive) |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Validation Errors (v1 API)

When field validation fails, response includes detailed errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "patient_gender",
      "message": "patient_gender must be one of: male, female, other"
    },
    {
      "field": "service_date",
      "message": "service_date must be a valid date (YYYY-MM-DD)"
    }
  ]
}
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/homecare/login` | 10 requests / 15 min per IP |
| `POST /api/homecare/register` | 5 requests / hour per IP |
| All other endpoints | Standard 100 req/min |

---

## 12. Integration Flows

### Flow 1: Patient Books a Home Nursing Visit (Quick Flow)

```
1. Patient opens "Book Homecare" screen
2. Patient selects service type = "nurse"
3. Patient enters date, time, and address
4. POST /api/homecare/book
   → Returns appointment object with fee estimate
5. Display booking confirmation with appointment.id
```

**cURL Example:**
```bash
curl -X POST https://api.mediqzy.com/api/homecare/book \
  -H "Content-Type: application/json" \
  -d '{
    "homecareId": 1,
    "appointmentDate": "2026-08-01",
    "appointmentTime": "09:00",
    "serviceType": "nurse",
    "patientName": "Test Patient",
    "patientPhone": "9876543210",
    "patientAddress": {
      "street": "123 MG Road",
      "city": "Bengaluru"
    },
    "duration": 60
  }'
```

---

### Flow 2: Authenticated Patient Books via API v1 (Tenant App)

```
1.  POST /api/auth/login             → Get patient JWT
2.  GET  /v1/{tenantId}/homecare/services  → Browse service catalog
3.  Select a service (note service_id)
4.  POST /v1/{tenantId}/homecare/bookings  → Create booking
    → Returns booking_id with status: "pending"
5.  GET  /v1/{tenantId}/homecare/bookings/{bookingId}  → Poll for status
6.  When status = "confirmed" → Show assigned professional details
7.  After service → PUT /v1/{tenantId}/homecare/bookings/{bookingId}
    with payment_status / service_notes
```

---

### Flow 3: Homecare Provider Accepts & Delivers Service

```
1.  POST /api/homecare/login          → Provider JWT
2.  (Admin/provider assigns professional via POST .../assign)
3.  PUT  /v1/{tenantId}/homecare/bookings/{bookingId}
         { "status": "confirmed" }
4.  On service day: PUT ... { "status": "in_progress" }
5.  On completion:  PUT ... { "status": "completed", "service_notes": "..." }
```

**Assign Professional (Admin/Provider):**
```bash
curl -X POST https://api.mediqzy.com/v1/{tenantId}/homecare/bookings/{bookingId}/assign \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "professionalId": "pro-001",
    "name": "Nurse Priya Sharma",
    "phone": "9123456789"
  }'
```

---

### Flow 4: Check Available Services by Category

```bash
curl -X GET "https://api.mediqzy.com/v1/{tenantId}/homecare/services?category=nursing&limit=10" \
  -H "Authorization: Bearer <patient-jwt>"
```

---

## 13. Test Credentials

> Use these credentials in **development / staging** only. Do not use in production.

### Patient Login
| Field | Value |
|-------|-------|
| Email | `user@mediczy.com` |
| Password | `User123` |
| User ID | 19 |
| Login URL | `POST /api/auth/login` |

### Test Homecare Provider
| Field | Value |
|-------|-------|
| Provider ID | 1 |
| Email | `homecare@mediczy.com` |
| Password | `Homecare123` |
| Status | `active` (verified) |
| Login URL | `POST /api/homecare/login` |

### Test v1 API User (tenant_id=2)
| Field | Value |
|-------|-------|
| `user_id` | `api-user-patient-001` |
| Email | `user@mediczy.com` |
| Tenant | `mediczy-test-clinic` (tenant_id=2) |
| Notes | This `api_users` record is required for v1 homecare booking FK |

> **Important:** v1 endpoints (`/v1/:tenantId/homecare/*`) must be accessed via **direct server** at `http://localhost:8888` or the backend origin. CloudFront routes `/v1/*` paths to the SPA, not the API.

### Quick Test: Book a Home Visit

```bash
# Step 1: Get patient token
TOKEN=$(curl -s -X POST https://api.mediqzy.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Step 2: Book a home nurse appointment
curl -s -X POST https://api.mediqzy.com/api/homecare/book \
  -H "Content-Type: application/json" \
  -d '{
    "homecareId": 1,
    "appointmentDate": "2026-08-10",
    "appointmentTime": "10:00",
    "serviceType": "nurse",
    "patientName": "Demo Patient",
    "patientPhone": "9000000000",
    "patientAddress": {
      "street": "1 Test Street",
      "city": "Bengaluru"
    },
    "duration": 60
  }' | python3 -m json.tool
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Homecare appointment booked successfully",
  "appointment": {
    "id": "homecare-appt-...",
    "serviceType": "nurse",
    "fee": 1000,
    "status": "scheduled"
  }
}
```

---

## Appendix: Database Schema Reference

### `api_homecare_bookings`

| Column | Type | Description |
|--------|------|-------------|
| `booking_id` | varchar PK | Generated ID prefix `hc-` |
| `tenant_id` | varchar FK | Tenant identifier |
| `user_id` | varchar FK | Patient user ID (references `api_users.user_id`) |
| `service_id` | varchar FK | References `api_homecare_services` |
| `service_date` | date | Scheduled service date |
| `service_time_slot` | varchar | Time slot string |
| `duration_days` | integer | Number of service days |
| `sessions_count` | integer | Total sessions |
| `patient_name` | varchar | Patient full name |
| `patient_age` | integer | Patient age |
| `patient_gender` | varchar | `male/female/other` |
| `patient_condition` | text | Medical condition |
| `service_address` | jsonb | Address JSON object |
| `professional_id` | varchar | Assigned professional ID |
| `professional_name` | varchar | Assigned professional name |
| `professional_phone` | varchar | Professional phone |
| `status` | varchar | Booking lifecycle status |
| `payment_status` | varchar | `pending/paid/refunded` |
| `total_amount` | numeric | Total fee |
| `currency` | varchar | Default: `INR` |
| `payment_id` | varchar | Payment gateway reference |
| `special_instructions` | text | Care instructions |
| `service_notes` | text | Post-service notes |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update time |
| `completed_at` | timestamp | Completion timestamp |
| `cancelled_at` | timestamp | Cancellation timestamp |

### `api_homecare_services`

| Column | Type | Description |
|--------|------|-------------|
| `service_id` | varchar PK | Service identifier |
| `tenant_id` | varchar FK | Tenant scope |
| `name` | varchar | Service name |
| `description` | text | Detailed description |
| `category` | varchar | Service category |
| `qualifications_required` | text | Staff qualifications needed |
| `equipment_needed` | text | Equipment requirements |
| `duration_minutes` | integer | Default session duration |
| `price` | numeric | Base price |
| `price_per_session` | numeric | Per-session rate |
| `currency` | varchar | Currency code (INR) |
| `available` | boolean | Is service bookable |
| `created_at` / `updated_at` | timestamp | Audit timestamps |

---

*Document generated from live codebase — July 2026*  
*For integration support, refer to the Mediqzy API team.*
