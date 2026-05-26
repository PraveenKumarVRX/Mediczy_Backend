# Mediqzy — Patient Mobile App: Lab & Pharmacy API Guide

> **Version:** 1.0 · **Last Updated:** 2026-04-09
> **Base URL (Production):** `https://api.mediqzy.com`
> **Auth:** Bearer JWT — obtained from `POST /api/auth/login`

---

## Table of Contents

- [Mediqzy — Patient Mobile App: Lab \& Pharmacy API Guide](#mediqzy--patient-mobile-app-lab--pharmacy-api-guide)
  - [Table of Contents](#table-of-contents)
  - [1. Authentication](#1-authentication)
    - [Login](#login)
    - [OTP Login](#otp-login)
    - [Authorization Header](#authorization-header)
  - [2. Addresses (Home Sample Collection)](#2-addresses-home-sample-collection)
    - [2.1 Autocomplete Address](#21-autocomplete-address)
    - [2.2 Get Place Details](#22-get-place-details)
    - [2.3 List Saved Addresses](#23-list-saved-addresses)
    - [2.4 Get Default Address](#24-get-default-address)
    - [2.5 Add Address](#25-add-address)
    - [2.6 Update Address](#26-update-address)
    - [2.7 Set as Default](#27-set-as-default)
    - [2.8 Delete Address](#28-delete-address)
  - [3. Lab Discovery](#3-lab-discovery)
    - [3.1 Search \& Browse Labs](#31-search--browse-labs)
    - [3.2 Get Lab Details](#32-get-lab-details)
    - [3.3 Advanced Test Search](#33-advanced-test-search)
    - [3.4 Get Tests Offered by a Lab](#34-get-tests-offered-by-a-lab)
    - [3.5 Test Category Catalog](#35-test-category-catalog)
    - [3.6 Lab Network Statistics](#36-lab-network-statistics)
  - [4. Lab Booking (via Labs Endpoint)](#4-lab-booking-via-labs-endpoint)
    - [4.1 Book a Lab Appointment](#41-book-a-lab-appointment)
    - [4.2 View My Lab Bookings](#42-view-my-lab-bookings)
  - [5. Lab Test Tracking (via Lab-Tests Endpoint)](#5-lab-test-tracking-via-lab-tests-endpoint)
    - [5.1 Book a Lab Test](#51-book-a-lab-test)
    - [5.2 List My Lab Tests](#52-list-my-lab-tests)
    - [5.3 Get Lab Test by ID](#53-get-lab-test-by-id)
    - [5.4 Confirm Booking](#54-confirm-booking)
    - [5.5 Cancel Booking](#55-cancel-booking)
    - [5.6 Reschedule / Update](#56-reschedule--update)
    - [5.7 Delete Lab Test Record](#57-delete-lab-test-record)
  - [6. Medical Reports](#6-medical-reports)
    - [6.1 Upload a Report](#61-upload-a-report)
    - [6.2 List My Reports](#62-list-my-reports)
    - [6.3 Get Report by ID](#63-get-report-by-id)
    - [6.4 Download Report](#64-download-report)
    - [6.5 Delete Report](#65-delete-report)
  - [7. Prescriptions (Read Access)](#7-prescriptions-read-access)
    - [7.1 Get My Prescriptions](#71-get-my-prescriptions)
    - [7.2 Get Prescription by ID](#72-get-prescription-by-id)
    - [7.3 Get Prescription for Appointment](#73-get-prescription-for-appointment)
    - [7.4 View Prescription (HTML)](#74-view-prescription-html)
    - [7.5 Download Prescription PDF](#75-download-prescription-pdf)
    - [7.6 Get WhatsApp Share Link](#76-get-whatsapp-share-link)
  - [8. Pharmacy Discovery](#8-pharmacy-discovery)
    - [8.1 Search Pharmacies Directory](#81-search-pharmacies-directory)
  - [9. Enums \& Constants](#9-enums--constants)
    - [Lab Test Status](#lab-test-status)
    - [Lab Test Urgency](#lab-test-urgency)
    - [Lab Booking Service Type](#lab-booking-service-type)
    - [Report Types](#report-types)
    - [Prescription Status](#prescription-status)
  - [10. Error Handling](#10-error-handling)
    - [Standard Error Shape](#standard-error-shape)
    - [Key Status Codes](#key-status-codes)
  - [11. Typical Integration Flows](#11-typical-integration-flows)
    - [A. Find a Lab and Book a Test](#a-find-a-lab-and-book-a-test)
    - [B. View Prescription and Share with Lab or Pharmacy](#b-view-prescription-and-share-with-lab-or-pharmacy)
    - [C. Upload and Manage Lab Reports](#c-upload-and-manage-lab-reports)
  - [12. Test Credentials](#12-test-credentials)

---

## 1. Authentication

All patient endpoints require a `Bearer` JWT token obtained at login.

### Login

```
POST /api/auth/login
```

```json
{
  "email": "user@mediczy.com",
  "password": "User123"
}
```

Alternatively, log in with phone number:

```json
{
  "phoneNumber": "+919884089921",
  "password": "User123"
}
```

**Response (200):**

```json
{
  "success": true,
  "token": "<jwt>",
  "refreshToken": "<refresh_jwt>",
  "user": {
    "id": 19,
    "firstName": "Test",
    "lastName": "User",
    "email": "user@mediczy.com",
    "phoneNumber": "+919884089921",
    "role": "user"
  }
}
```

**Token expiry:** 7 days. Refresh via `POST /api/auth/refresh` with `{ "refreshToken": "..." }`.

### OTP Login

```
POST /api/auth/send-otp
```
```json
{ "phoneNumber": "+919884089921" }
```

```
POST /api/auth/verify-otp
```
```json
{ "phoneNumber": "+919884089921", "otp": "123456" }
```

### Authorization Header

All authenticated requests must include:

```
Authorization: Bearer <token>
```

---

## 2. Addresses (Home Sample Collection)

Saved addresses are used when booking lab tests with home sample collection.

### 2.1 Autocomplete Address

```
GET /api/addresses/autocomplete?q=Koramangala
Authorization: Bearer <token>
```

Returns place suggestions for input text.

### 2.2 Get Place Details

```
GET /api/addresses/place/:placeId
Authorization: Bearer <token>
```

### 2.3 List Saved Addresses

```
GET /api/addresses
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "addresses": [
    {
      "id": 3,
      "label": "Home",
      "addressLine1": "12, Green Park",
      "addressLine2": "Koramangala 5th Block",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560034",
      "latitude": 12.9352,
      "longitude": 77.6234,
      "isDefault": true
    }
  ]
}
```

### 2.4 Get Default Address

```
GET /api/addresses/default
Authorization: Bearer <token>
```

### 2.5 Add Address

```
POST /api/addresses
Authorization: Bearer <token>
```

```json
{
  "label": "Home",
  "addressLine1": "12, Green Park",
  "addressLine2": "Koramangala 5th Block",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560034",
  "latitude": 12.9352,
  "longitude": 77.6234,
  "isDefault": true
}
```

### 2.6 Update Address

```
PUT /api/addresses/:id
Authorization: Bearer <token>
```

Accepts same fields as create (all optional).

### 2.7 Set as Default

```
PUT /api/addresses/:id/set-default
Authorization: Bearer <token>
```

### 2.8 Delete Address

```
DELETE /api/addresses/:id
Authorization: Bearer <token>
```

---

## 3. Lab Discovery

These endpoints help patients find labs. Most are **public** (no auth required).

### 3.1 Search & Browse Labs

```
GET /api/labs
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Full-text search across name, address, services, test catalog |
| `city` | string | Filter by city (partial match) |
| `state` | string | Filter by state |
| `pincode` | string | Filter by pin code prefix (first 3 digits = region) |
| `services` | string | Comma-separated service types |
| `testCategories` | string | Filter by test category |
| `accreditation` | string | e.g., `NABL`, `CAP` |
| `homeSampleCollection` | boolean | `true` to show only home-collection labs |
| `emergencyServices` | boolean | `true` for emergency/24-hour labs |
| `isVerified` | boolean | Show only verified labs |
| `featured` | boolean | Show only featured/partner labs |
| `minRating` | number | Minimum rating (0–5) |
| `maxPrice` | number | Maximum price filter |
| `latitude` | number | Patient's latitude (for proximity) |
| `longitude` | number | Patient's longitude (for proximity) |
| `radius` | number | Search radius in km |
| `sortBy` | string | `rating` (default), `price`, `distance`, `name` |
| `sortOrder` | string | `ASC` or `DESC` (default: `DESC`) |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20) |
| `includeDetails` | boolean | Include full testCatalog in listing |

**Response (200):**

```json
{
  "success": true,
  "total": 45,
  "page": 1,
  "limit": 20,
  "labs": [
    {
      "id": 1,
      "name": "Agilus Diagnostics",
      "address": {
        "street": "12, MG Road",
        "city": "Bangalore",
        "state": "Karnataka",
        "zipCode": "560001"
      },
      "phone": "+918012345678",
      "email": "info@agilus.com",
      "website": "https://agilus.com",
      "rating": 4.5,
      "totalReviews": 320,
      "accreditation": ["NABL", "CAP"],
      "homeSampleCollection": true,
      "emergencyServices": false,
      "isVerified": true,
      "featured": true,
      "services": ["blood_tests", "urine_tests", "imaging", "genetic"],
      "testCategories": ["hematology", "biochemistry", "radiology"],
      "openingHours": {
        "monday": "07:00-20:00",
        "sunday": "08:00-14:00"
      },
      "turnaroundTime": {
        "routine_tests": "Same day",
        "culture_tests": "2–7 days"
      },
      "createdAt": "2025-10-01T00:00:00.000Z"
    }
  ]
}
```

### 3.2 Get Lab Details

```
GET /api/labs/:id
```

Returns the full lab record plus computed fields.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Agilus Diagnostics",
    "address": { /* full address */ },
    "accreditation": ["NABL"],
    "homeSampleCollection": true,
    "testCatalog": {
      "hematology": { "CBC": true, "ESR": true },
      "biochemistry": { "LFT": true, "RFT": true }
    },
    "equipment": ["Cobas 8000", "Diasorin Liaison"],
    "digitalFeatures": {
      "onlineBooking": true,
      "digitalReports": true,
      "appIntegration": true
    },
    "computed": {
      "totalTestsOffered": 128,
      "accreditationScore": 40,
      "digitalScore": 30,
      "serviceScore": 20,
      "overallScore": 90
    }
  }
}
```

### 3.3 Advanced Test Search

```
GET /api/labs/search/advanced?testName=thyroid&homeCollection=true&urgentTest=false
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `testName` | string | Specific test name (e.g., `CBC`, `thyroid`, `HbA1c`) |
| `testCategory` | string | Category filter |
| `urgentTest` | boolean | `true` filters to labs with emergency services |
| `homeCollection` | boolean | `true` filters to home-collection labs |
| `reportTime` | string | Desired report turnaround |
| `equipment` | string | Required equipment |
| `location` | string | Location string |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "labs": [
      {
        "id": 1,
        "name": "Agilus Diagnostics",
        "testAvailability": "Very Likely",
        "estimatedCost": "₹200 - ₹300",
        "estimatedTime": "4-6 hours",
        "suitabilityScore": 88
      }
    ],
    "recommendations": [
      "Test \"thyroid\" is typically available in endocrinology, biochemistry categories"
    ],
    "totalResults": 12
  }
}
```

### 3.4 Get Tests Offered by a Lab

```
GET /api/labs/:labId/tests?serviceType=checkup
```

| `serviceType` | Description |
|---------------|-------------|
| `checkup` | Pathology / blood tests |
| `diagnostic` | Radiology / imaging / scans |
| _(omit)_ | Returns both categories |

**Response (200):**

```json
{
  "success": true,
  "tests": [
    { "id": 1, "name": "Complete Blood Count (CBC)", "price": 500, "duration": "2 hours" },
    { "id": 2, "name": "Lipid Profile", "price": 800, "duration": "4 hours" },
    { "id": 3, "name": "Blood Sugar (Fasting)", "price": 200, "duration": "1 hour" },
    { "id": 4, "name": "Thyroid Profile (T3/T4/TSH)", "price": 1200, "duration": "6 hours" },
    { "id": 5, "name": "X-Ray", "price": 1500, "duration": "30 minutes" },
    { "id": 6, "name": "Ultrasound (Abdomen)", "price": 2000, "duration": "45 minutes" },
    { "id": 7, "name": "ECG", "price": 800, "duration": "15 minutes" },
    { "id": 8, "name": "MRI Scan", "price": 8000, "duration": "1 hour" }
  ]
}
```

### 3.5 Test Category Catalog

```
GET /api/labs/categories/tests
GET /api/labs/categories/tests?category=hematology&detailed=true
```

Returns the master catalog of test categories and subcategories.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "categories": {
      "hematology": { "name": "Hematology", "subcategories": ["cbc", "coagulation", "blood_group"] },
      "biochemistry": { "name": "Biochemistry", "subcategories": ["lft", "rft", "lipids", "thyroid"] },
      "microbiology": { "name": "Microbiology", "subcategories": ["culture", "sensitivity", "serology"] },
      "radiology": { "name": "Radiology", "subcategories": ["xray", "ultrasound", "ct", "mri"] },
      "pathology": { "name": "Pathology", "subcategories": ["biopsy", "cytology", "histopathology"] }
    },
    "totalCategories": 18
  }
}
```

### 3.6 Lab Network Statistics

```
GET /api/labs/statistics
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "overview": {
      "totalLaboratories": 145,
      "verifiedLaboratories": 98,
      "featuredLaboratories": 22,
      "homeCollectionAvailable": 87,
      "emergencyServicesAvailable": 34,
      "averageRating": "4.25",
      "totalReviews": 12840
    },
    "features": {
      "verificationRate": "67.6",
      "homeCollectionRate": "60.0",
      "emergencyServiceRate": "23.4"
    }
  }
}
```

---

## 4. Lab Booking (via Labs Endpoint)

Creates an appointment record in the `appointments` table (tracks the visit).

### 4.1 Book a Lab Appointment

```
POST /api/labs/book
Authorization: Bearer <token>
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `labId` | integer | ✅ | ID from lab search |
| `appointmentDate` | string | ✅ | YYYY-MM-DD |
| `appointmentTime` | string | ✅ | HH:MM (24-hour) |
| `serviceType` | string | ✅ | `checkup` \| `diagnostic` |
| `testType` | string | ❌ | Free text e.g. `blood_test`, `xray` |
| `tests` | array | ❌ | Array of `{ id, name, price }` from `GET /api/labs/:id/tests` |
| `symptoms` | string | ❌ | Patient-reported symptoms |
| `notes` | string | ❌ | Additional notes |
| `patientName` | string | ❌ | Defaults to authenticated user's name |
| `patientPhone` | string | ❌ | Defaults to authenticated user's phone |
| `patientAddress` | object | ❌ | `{ street, city, state, zipCode }` |
| `prescriptionUrl` | string | ❌ | URL of doctor's prescription if available |

**Example:**

```json
{
  "labId": 1,
  "appointmentDate": "2026-04-15",
  "appointmentTime": "09:00",
  "serviceType": "checkup",
  "testType": "blood_test",
  "tests": [
    { "id": 1, "name": "Complete Blood Count (CBC)", "price": 500 },
    { "id": 2, "name": "Lipid Profile", "price": 800 }
  ],
  "symptoms": "Fatigue, mild fever for 3 days",
  "notes": "Fasting since last night"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Lab appointment booked successfully",
  "appointment": {
    "id": 201,
    "patientName": "Test User",
    "appointmentDate": "2026-04-15",
    "appointmentTime": "09:00",
    "labName": "Agilus Diagnostics",
    "labAddress": { "city": "Bangalore", "street": "12, MG Road" },
    "serviceType": "checkup",
    "testType": "blood_test",
    "tests": [
      { "id": 1, "name": "Complete Blood Count (CBC)", "price": 500 },
      { "id": 2, "name": "Lipid Profile", "price": 800 }
    ],
    "totalFee": 2800,
    "status": "scheduled"
  }
}
```

> `totalFee` = base fee (`checkup`: ₹1500, `diagnostic`: ₹2500) + sum of individual test prices.

### 4.2 View My Lab Bookings

```
GET /api/labs/team-bookings?page=1&limit=20
Authorization: Bearer <token>
```

Returns all lab appointments booked by the authenticated user.

**Response (200):**

```json
{
  "success": true,
  "total": 5,
  "page": 1,
  "appointments": [
    {
      "id": 201,
      "patientName": "Test User",
      "labName": "Agilus Diagnostics",
      "labAddress": { "city": "Bangalore" },
      "appointmentDate": "2026-04-15",
      "appointmentTime": "09:00",
      "status": "scheduled",
      "serviceType": "checkup",
      "testType": "blood_test",
      "totalFee": 2800,
      "bookedAt": "2026-04-09T10:00:00.000Z"
    }
  ]
}
```

---

## 5. Lab Test Tracking (via Lab-Tests Endpoint)

While Section 4 creates an `appointment` record, this endpoint creates a `lab_test` record — used for more granular test tracking with confirmation workflow.

> **Use this endpoint when:** the patient needs to track test results, confirmation status, and fasting requirements at the individual-test level.

### 5.1 Book a Lab Test

```
POST /api/lab-tests
Authorization: Bearer <token>
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `testType` | string | ✅ | See valid types table below |
| `appointmentDate` | string | ✅ | YYYY-MM-DD |
| `testName` | string | ❌ | Human-readable test name |
| `hospitalId` | integer | ❌ | Lab/hospital ID (auto-assigned if not provided) |
| `appointmentTime` | string | ❌ | HH:MM |
| `urgency` | string | ❌ | `routine` (default) \| `urgent` \| `stat` |
| `notes` | string | ❌ | Additional notes |
| `requiresFasting` | boolean | ❌ | Whether fasting is required |
| `fastingHours` | integer | ❌ | Required fasting hours |

**Valid `testType` values:**

| Value | Description |
|-------|-------------|
| `blood_test` | Blood test / CBC / panels |
| `pathology` | Tissue / histology |
| `radiology` | General radiology |
| `scan` | Scan (generic) |
| `ultrasound` | Ultrasound |
| `xray` | X-Ray |
| `ct_scan` | CT Scan |
| `mri` | MRI |
| `ecg` | ECG / EKG |
| `echo` | Echocardiogram |
| `eeg` | EEG |
| `endoscopy` | Endoscopy |
| `colonoscopy` | Colonoscopy |
| `other` | Other |

**Example:**

```json
{
  "testType": "blood_test",
  "testName": "Complete Blood Count",
  "appointmentDate": "2026-04-15",
  "appointmentTime": "08:00",
  "urgency": "routine",
  "requiresFasting": true,
  "fastingHours": 12,
  "notes": "Fasting since 8 PM previous night"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Lab test booked successfully",
  "data": {
    "id": 55,
    "userId": 19,
    "testType": "blood_test",
    "testName": "Complete Blood Count",
    "hospitalId": 3,
    "appointmentDate": "2026-04-15T00:00:00.000Z",
    "appointmentTime": "08:00",
    "urgency": "routine",
    "requiresFasting": true,
    "fastingHours": 12,
    "status": "pending_confirmation",
    "confirmationStatus": "pending",
    "resultStatus": "pending",
    "referralNote": "Referred by Dr. Nandita Agarwal, CMO - SmartHealth Clinic",
    "createdAt": "2026-04-09T10:00:00.000Z"
  }
}
```

> **Auto-assignment:** If no `hospitalId` is provided, the test is auto-assigned to SmartHealth Clinic (ID=3) with a referral note from Dr. Nandita Agarwal.

### 5.2 List My Lab Tests

```
GET /api/lab-tests?status=booked&testType=blood_test&skip=0&limit=20
Authorization: Bearer <token>
```

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (see status table in §9) |
| `testType` | string | Filter by test type |
| `skip` | integer | Offset for pagination (default: 0) |
| `limit` | integer | Items per page (default: 20) |

**Response (200):**

```json
{
  "success": true,
  "data": [ /* array of lab test objects */ ],
  "pagination": {
    "total": 8,
    "skip": 0,
    "limit": 20,
    "hasMore": false
  }
}
```

### 5.3 Get Lab Test by ID

```
GET /api/lab-tests/:id
Authorization: Bearer <token>
```

Returns full details of the lab test record.

### 5.4 Confirm Booking

```
POST /api/lab-tests/:id/confirm
Authorization: Bearer <token>
```

Moves status from `pending_confirmation` → `booked`. Call this when the patient acknowledges the booking details.

**Response (200):**

```json
{
  "success": true,
  "message": "Lab test confirmed successfully",
  "data": { /* updated lab test */ }
}
```

### 5.5 Cancel Booking

```
POST /api/lab-tests/:id/cancel
Authorization: Bearer <token>
```

```json
{ "reason": "Patient traveling" }
```

Can only cancel tests in `pending_confirmation` or `booked` status.

**Response (200):**

```json
{
  "success": true,
  "message": "Lab test cancelled successfully",
  "data": { /* updated lab test with status: "cancelled" */ }
}
```

### 5.6 Reschedule / Update

```
PUT /api/lab-tests/:id
Authorization: Bearer <token>
```

Can only update tests in `pending_confirmation` or `booked` status.

```json
{
  "appointmentDate": "2026-04-18",
  "appointmentTime": "10:00",
  "notes": "Rescheduled due to travel",
  "requiresFasting": true,
  "fastingHours": 8
}
```

All fields are optional.

### 5.7 Delete Lab Test Record

```
DELETE /api/lab-tests/:id
Authorization: Bearer <token>
```

Permanently removes the record. Only use for erroneous entries.

---

## 6. Medical Reports

Patients can upload and manage their medical reports (lab results, X-rays, prescriptions).

### 6.1 Upload a Report

```
POST /api/reports
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | ✅ | The report file (max 10 MB) |
| `reportType` | string | ❌ | `xray`, `bloodtest`, `scan`, `prescription`, `general` |
| `reportDate` | string | ❌ | ISO date string |
| `notes` | string | ❌ | Notes about this report |

**Allowed formats:** `pdf`, `jpg`, `jpeg`, `png`, `gif`, `webp`, `doc`, `docx`

**Response (201):**

```json
{
  "success": true,
  "message": "Report uploaded successfully",
  "reportId": 88,
  "fileName": "blood-report-april.pdf",
  "fileUrl": "/uploads/reports/1712600000_abc_blood-report-april.pdf",
  "reportType": "bloodtest",
  "uploadedAt": "2026-04-09T12:00:00.000Z",
  "fileSize": "245.67 KB"
}
```

### 6.2 List My Reports

```
GET /api/reports
Authorization: Bearer <token>
```

Returns all reports uploaded by the authenticated patient.

**Response (200):**

```json
{
  "success": true,
  "reports": [
    {
      "id": 88,
      "fileName": "blood-report-april.pdf",
      "fileUrl": "/uploads/reports/...",
      "reportType": "bloodtest",
      "reportDate": "2026-04-09",
      "notes": null,
      "uploadedAt": "2026-04-09T12:00:00.000Z"
    }
  ]
}
```

### 6.3 Get Report by ID

```
GET /api/reports/:id
Authorization: Bearer <token>
```

### 6.4 Download Report

```
GET /api/reports/download/:id
Authorization: Bearer <token>
```

Returns the raw file for download.

### 6.5 Delete Report

```
DELETE /api/reports/:id
Authorization: Bearer <token>
```

---

## 7. Prescriptions (Read Access)

Patients can view prescriptions issued by their doctors. Prescriptions are created by doctors only.

### 7.1 Get My Prescriptions

```
GET /api/prescriptions/patient
Authorization: Bearer <token>
```

Returns all prescriptions where the authenticated user is the patient.

```
GET /api/prescriptions/my/all
Authorization: Bearer <token>
```

Alias for the same data (full prescription objects).

**Response (200):**

```json
{
  "success": true,
  "count": 3,
  "prescriptions": [
    {
      "id": 42,
      "prescriptionId": "RX170900A1B2",
      "prescriptionNumber": "RX-2026-0042",
      "doctorName": "Dr. Nandita Agarwal",
      "patientName": "Test User",
      "diagnosis": "Acute bronchitis",
      "medications": [
        {
          "name": "Azithromycin",
          "composition": "500mg",
          "dosage": "1 tablet",
          "frequency": "Once daily",
          "duration": "3 days",
          "instructions": "Take after meals"
        }
      ],
      "labTests": [
        { "testName": "CBC", "reason": "Rule out bacterial infection" }
      ],
      "instructions": ["Rest for 2 days", "Drink plenty of fluids"],
      "followUpDate": "2026-04-23",
      "status": "issued",
      "createdAt": "2026-04-09T12:00:00.000Z",
      "expiresAt": "2026-05-09T12:00:00.000Z"
    }
  ]
}
```

### 7.2 Get Prescription by ID

```
GET /api/prescriptions/:id
Authorization: Bearer <token>
```

`:id` accepts both numeric ID (`42`) and string `prescriptionId` (`RX170900A1B2`).

> Returns `403` if the prescription belongs to a different patient.

### 7.3 Get Prescription for Appointment

```
GET /api/prescriptions/appointment/:appointmentId
Authorization: Bearer <token>
```

Fetches the prescription linked to a specific appointment.

### 7.4 View Prescription (HTML)

```
GET /api/prescriptions/:id/html
Authorization: Bearer <token>
```

or

```
GET /api/prescriptions/:id/html?token=<jwt>
```

Returns a print-ready HTML page with doctor's letterhead, patient info, medications table.

### 7.5 Download Prescription PDF

```
GET /api/prescriptions/:id/pdf
Authorization: Bearer <token>
```

or

```
GET /api/prescriptions/:id/pdf?token=<jwt>
```

Returns a PDF file. Useful for downloading and sharing with pharmacies/labs.

**Content-Type:** `application/pdf`

### 7.6 Get WhatsApp Share Link

```
GET /api/prescriptions/:id/share/whatsapp
Authorization: Bearer <token>
```

Returns a WhatsApp share link for the prescription.

---

## 8. Pharmacy Discovery

### 8.1 Search Pharmacies Directory

```
GET /api/masterdata/pharmacies?search=MedPlus&city=Bangalore&page=1&limit=20
Authorization: Bearer <token>
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Search by pharmacy name or address |
| `city` | string | Filter by city |
| `state` | string | Filter by state |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 50) |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "pharma-001",
      "name": "MedPlus Pharmacy",
      "address": "12, MG Road, Koramangala",
      "area": "Koramangala",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560034",
      "latitude": 12.9352,
      "longitude": 77.6234,
      "services": ["retail", "home_delivery", "prescription_dispensing"],
      "classification": "retail",
      "chain": true,
      "chain_name": "MedPlus",
      "quality_score": 0.92,
      "contact": "+918012345678",
      "email": "koramangala@medplus.in",
      "home_delivery": true
    }
  ],
  "pagination": {
    "total": 48,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

> **Note:** To order medicines through an attached pharmacy, share the prescription PDF (`GET /api/prescriptions/:id/pdf`) directly with the pharmacy. Online medicine ordering through the patient app is via the pharmacy's own system.

---

## 9. Enums & Constants

### Lab Test Status

| Value | Description |
|-------|-------------|
| `pending_confirmation` | Booking created, awaiting patient confirmation |
| `booked` | Confirmed by patient |
| `completed` | Test completed, results available |
| `cancelled` | Cancelled by patient or lab |
| `no_show` | Patient did not show up |
| `rescheduled` | Booking rescheduled |

### Lab Test Urgency

| Value | Description |
|-------|-------------|
| `routine` | Standard turnaround (default) |
| `urgent` | Expedited (same-day results) |
| `stat` | Immediate / emergency |

### Lab Booking Service Type

| Value | Description |
|-------|-------------|
| `checkup` | Pathology / blood tests — base fee ₹1500 |
| `diagnostic` | Radiology / imaging — base fee ₹2500 |

### Report Types

| Value | Description |
|-------|-------------|
| `bloodtest` | Blood test report |
| `xray` | X-Ray image |
| `scan` | CT / MRI / Ultrasound scan |
| `prescription` | Scanned prescription |
| `general` | General / other |

### Prescription Status

| Value | Description |
|-------|-------------|
| `draft` | Being prepared by doctor |
| `issued` | Finalized — patient can access |
| `dispensed` | Dispensed by pharmacy |
| `cancelled` | Cancelled by doctor |
| `expired` | Past validity date |

---

## 10. Error Handling

### Standard Error Shape

```json
{
  "success": false,
  "message": "Human-readable error",
  "error": "Technical detail"
}
```

### Key Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `201` | Created |
| `400` | Bad Request — validation error |
| `401` | Unauthorized — missing or expired token |
| `403` | Forbidden — accessing another patient's data |
| `404` | Not Found |
| `429` | Rate limit exceeded |
| `500` | Server error |

---

## 11. Typical Integration Flows

### A. Find a Lab and Book a Test

```
1. GET  /api/labs?city=Bangalore&homeSampleCollection=true&search=thyroid
     → Browse list, pick labId

2. GET  /api/labs/:labId/tests?serviceType=checkup
     → Show available tests and prices to patient

3. GET  /api/addresses/default
     → Pre-fill patient address for home collection

4. POST /api/labs/book
     → Book appointment (creates appointment record)

   AND/OR:

4b. POST /api/lab-tests
     → Book with fasting/test-tracking details (creates lab_test record)

5. GET  /api/lab-tests/:id (polling)
     → Track status updates

6. POST /api/lab-tests/:id/confirm
     → Patient confirms booking

7. POST /api/reports
     → Upload results when received from lab
```

### B. View Prescription and Share with Lab or Pharmacy

```
1. GET  /api/prescriptions/patient
     → List prescriptions from doctor appointments

2. GET  /api/prescriptions/:id
     → View full prescription with medications and lab tests

3. GET  /api/prescriptions/:id/pdf?token=<jwt>
     → Download PDF to share with pharmacy or lab

4. GET  /api/prescriptions/:id/share/whatsapp
     → Send to pharmacist or lab via WhatsApp

5. GET  /api/masterdata/pharmacies?city=Bangalore
     → Find a nearby pharmacy to dispense medicines
```

### C. Upload and Manage Lab Reports

```
1. POST /api/reports (multipart)
     → Upload PDF/image of lab result

2. GET  /api/reports
     → View all uploaded reports

3. GET  /api/reports/download/:id
     → Download / share specific report with doctor
```

---

## 12. Test Credentials

| Role | Email | Password | Login Endpoint | User ID |
|------|-------|----------|----------------|---------|
| Patient | `user@mediczy.com` | `User123` | `POST /api/auth/login` | 19 |
| Doctor | `doctor@mediczy.com` | `Doctor123` | `POST /api/doctors/login` | 70 |

**Quick test — lab search (no auth):**
```bash
curl https://api.mediqzy.com/api/labs?city=bangalore&homeSampleCollection=true&limit=5
```

**Quick test — my lab tests:**
```bash
TOKEN=$(curl -s -X POST https://api.mediqzy.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}' | jq -r .token)

curl https://api.mediqzy.com/api/lab-tests \
  -H "Authorization: Bearer $TOKEN"
```

---

*All endpoints verified against the Mediqzy production server (https://api.mediqzy.com) · April 9, 2026*
