# Hospital Insurance Dashboard - IHX-like Features

## Overview

Comprehensive insurance claim management system for hospitals, modeled after IHX Provider Portal functionality.

## Features Implemented

### 1. Dashboard / Home

- **GET** `/api/hospital/insurance/dashboard`
  - High-level snapshot of claims work
  - Stats: Pending, Approved, Rejected, Query counts
  - Recent claims activity
  - Alerts for queries needing response, pending documents, expiring pre-auths
  - Status breakdown charts

- **POST** `/api/hospital/insurance/dashboard/search`
  - Quick search by Claim ID, Policy No., or Member ID
  - Returns matching claims with patient details

### 2. Claims Management

#### New Claim

- **POST** `/api/hospital/insurance/claims/new`
  - Create new claim submission
  - Fields: Patient, Policy, Amount, Hospitalization Details, Documents, Diagnosis
  - Auto-generates unique claim number
  - Initial status: `draft`

#### Drafts

- **GET** `/api/hospital/insurance/claims/drafts`
  - Access claims started but not submitted
  - Pagination supported
  - Filter by hospital

#### Submitted Claims

- **GET** `/api/hospital/insurance/claims/submitted`
  - View claims already submitted to payer/TPA
  - Filter by status, date range, hospital
  - Pagination supported

#### Submit Claim

- **POST** `/api/hospital/insurance/claims/:claimId/submit`
  - Submit draft claim to payer/TPA
  - Validates required documents
  - Updates status to `submitted`

#### Enhance Claim

- **POST** `/api/hospital/insurance/claims/:claimId/enhance`
  - Upload additional documents
  - Respond to queries from insurance company
  - Track query response history

#### Bulk Upload

- **POST** `/api/hospital/insurance/claims/bulk-upload`
  - Submit multiple claims via array
  - Returns success/failure for each claim

#### Claim History

- **GET** `/api/hospital/insurance/claims/:claimId/history`
  - Shows all events, queries, responses, status changes
  - Timeline view of claim lifecycle

#### Download PDF

- **GET** `/api/hospital/insurance/claims/:claimId/pdf`
  - Download claim PDF with attached documents
  - (Feature placeholder for PDF generation)

### 3. Pre-Authorization

#### New Pre-Auth

- **POST** `/api/hospital/insurance/pre-auth/new`
  - Request pre-approval for inpatient admission
  - Fields: Patient, Policy, Admission Details, Estimated Amount, Diagnosis
  - Auto-generates pre-auth number

#### Pending Pre-Auths

- **GET** `/api/hospital/insurance/pre-auth/pending`
  - List of pre-auth requests waiting for insurer action
  - Pagination supported

#### Approved Pre-Auths

- **GET** `/api/hospital/insurance/pre-auth/approved`
  - Track approved pre-authorization decisions
  - Sorted by approval date

#### Rejected Pre-Auths

- **GET** `/api/hospital/insurance/pre-auth/rejected`
  - Track rejected pre-authorization decisions
  - Includes rejection reasons

### 4. Documents Center

#### Upload Documents

- **POST** `/api/hospital/insurance/documents/upload`
  - Upload documents for claims or pre-auths
  - Support for tagging and categorization
  - Document types: Discharge Summary, Bills, Investigation Reports, etc.

#### Missing Documents

- **GET** `/api/hospital/insurance/documents/missing`
  - Get alerts for missing documents
  - Shows required vs uploaded documents per claim

### 5. Patient / Member Search

#### Patient Search

- **POST** `/api/hospital/insurance/patient/search`
  - Search by ABHA, Mobile, Name, or Policy Number
  - Multi-criteria search

#### Eligibility Check

- **GET** `/api/hospital/insurance/patient/:patientId/eligibility`
  - Check policy validity and coverage
  - Returns coverage amount, available balance, expiry, dependents
  - (Placeholder for insurance provider API integration)

### 6. Revenue / Financials

#### Receivables

- **GET** `/api/hospital/insurance/revenue/receivables`
  - Shows unpaid/settled claims amounts
  - Breakdown: Approved Not Settled, Settled, Pending

#### Settlement Status

- **GET** `/api/hospital/insurance/revenue/settlement-status`
  - Track settlement status of approved claims
  - Shows pending amounts per claim
  - Pagination supported

### 7. Reports / Analytics

#### Claims Aging

- **GET** `/api/hospital/insurance/reports/claims-aging`
  - Claims aging report - TAT analysis
  - Buckets: <7 days, 7-15 days, 15-30 days, >30 days

#### TAT Report

- **GET** `/api/hospital/insurance/reports/tat`
  - Turnaround time reports
  - Average TAT calculation
  - Filter by date range

#### Query/Rejection Trends

- **GET** `/api/hospital/insurance/reports/query-rejection-trends`
  - Analyze query and rejection patterns
  - Rejection reasons breakdown
  - Trend analysis over configurable months

## Database Schema

### insurance_claims Table (Enhanced)

```sql
- id (PK)
- claim_number (unique)
- patient_id (FK → users)
- hospital_id (FK → organizations)
- pre_auth_id (FK → pre_authorizations)
- policy_number
- insurance_provider
- insurance_provider_id (FK → insurance_providers)
- tpa_id (FK → tpa)
- claim_amount
- approved_amount
- settled_amount
- deducted_amount
- claim_type (cashless/reimbursement/emergency)
- status (draft/submitted/pending/query/approved/rejected/paid)
- settlement_status (pending/partial/settled/rejected)
- submitted_at
- submitted_by (FK → users)
- approved_at
- rejected_at
- settlement_date
- hospitalization_details (JSONB)
- diagnosis
- treatment_details (JSONB)
- documents (JSONB array)
- documents_status (incomplete/complete/pending_verification)
- required_documents (JSONB array)
- query_history (JSONB array)
- rejection_reason
- notes
- last_modified_by (FK → users)
- organization_id (FK → organizations)
- created_at, updated_at
```

### pre_authorizations Table (New)

```sql
- id (PK)
- pre_auth_number (unique)
- patient_id (FK → users)
- hospital_id (FK → organizations)
- policy_number
- insurance_provider_id (FK → insurance_providers)
- tpa_id (FK → tpa)
- admission_details (JSONB)
- estimated_amount
- approved_amount
- diagnosis
- planned_procedures (JSONB)
- estimated_duration (days)
- status (pending/approved/rejected/expired/cancelled)
- approval_number
- submitted_at
- submitted_by (FK → users)
- approved_at
- rejected_at
- rejection_reason
- expires_at
- documents (JSONB array)
- query_history (JSONB array)
- remarks
- organization_id (FK → organizations)
- created_at, updated_at
```

### Database Views

- `v_claims_dashboard`: Aggregated claims data with patient/hospital names, TAT calculation
- `v_preauth_dashboard`: Pre-auth data with expiry status and TAT calculation

## Migration

Run migration script:

```bash
psql -U mediczy_helper -d mediczy_ai -f server/migrations/add-hospital-insurance-features.sql
```

## Authentication & Authorization

All endpoints require:

- Authentication: `authUser` middleware
- Authorization: `requireRole(['hospital', 'admin'])`

## Usage Example

### 1. Create New Claim

```javascript
POST /
  api /
  hospital /
  insurance /
  claims /
  new {
    patientId: 123,
    policyNumber: "POL123456",
    insuranceProviderId: 5,
    claimAmount: 50000.0,
    claimType: "cashless",
    hospitalizationDetails: {
      admissionDate: "2026-01-25",
      dischargeDate: "2026-01-28",
      roomType: "Private",
      treatingDoctor: "Dr. Smith",
    },
    diagnosis: "Acute Appendicitis (ICD-10: K35.80)",
    treatmentDetails: {
      procedures: ["Appendectomy"],
      medications: ["Antibiotics", "Pain management"],
    },
  }();
```

### 2. Submit Claim

```javascript
POST / api / hospital / insurance / claims / 123 / submit;
// Changes status from 'draft' to 'submitted'
```

### 3. Dashboard Stats

```javascript
GET /api/hospital/insurance/dashboard?hospitalId=10
// Returns:
{
  "stats": { "pending": 45, "approved": 120, "rejected": 10, "query": 8 },
  "recentActivity": [...],
  "alerts": {
    "queriesNeedingResponse": 8,
    "pendingDocuments": 12,
    "expiringSoon": 3
  }
}
```

## Integration Points

### TPA/Insurance Provider APIs

TODO: Integrate with actual TPA/Insurance provider APIs for:

- Real-time claim submission
- Eligibility verification
- Pre-auth approval status
- Settlement notifications

### ABHA Integration

TODO: Integrate with Ayushman Bharat Health Account for:

- Patient identity verification
- Health record fetching
- Consent management

## Next Steps

1. Frontend UI development for hospital dashboard
2. TPA API integration
3. ABHA integration for patient search
4. PDF generation for claims
5. Document OCR and auto-tagging
6. Real-time notifications for status changes
7. Analytics dashboards with charts
