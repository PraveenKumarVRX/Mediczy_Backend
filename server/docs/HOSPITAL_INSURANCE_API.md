# Hospital Insurance Management API Documentation

## Base URL

```
/api/hospital/insurance
```

## Authentication

All endpoints require JWT authentication with `hospital` or `admin` role.

**Header:**

```
Authorization: Bearer <token>
```

---

## 📊 Dashboard & Overview

### GET /dashboard

Get high-level snapshot of insurance claims work.

**Query Parameters:**

- `hospitalId` (optional): Filter by hospital ID

**Response:**

```json
{
  "success": true,
  "dashboard": {
    "stats": {
      "pending": 45,
      "approved": 120,
      "rejected": 12,
      "query": 8,
      "total": 185
    },
    "recentActivity": [...],
    "alerts": {
      "queriesNeedingResponse": 8,
      "pendingDocuments": 15,
      "expiringSoon": 3
    },
    "charts": {
      "statusBreakdown": {...},
      "monthlyTrend": [...]
    }
  },
  "cached": false
}
```

**Features:**

- ✅ Redis caching (5-minute TTL)
- ✅ Real-time statistics
- ✅ Alerts for action items

---

### POST /dashboard/search

Quick search for claims by Claim ID, Policy No., or Member ID.

**Request Body:**

```json
{
  "searchTerm": "CLM123456"
}
```

**Response:**

```json
{
  "success": true,
  "claims": [
    {
      "id": 1,
      "claimNumber": "CLM123456",
      "status": "pending",
      "claimAmount": 50000,
      ...
    }
  ]
}
```

---

## 🏥 Claims Management

### POST /claims/new

Create a new insurance claim (draft mode).

**Request Body:**

```json
{
  "patientId": 123,
  "policyNumber": "POL123456",
  "insuranceProvider": "Star Health",
  "claimType": "cashless",
  "claimAmount": 50000,
  "diagnosis": "Appendicitis",
  "treatmentDetails": {
    "procedure": "Appendectomy",
    "admissionDate": "2025-01-25",
    "dischargeDate": "2025-01-28"
  }
}
```

**Response:**

```json
{
  "success": true,
  "claim": {
    "id": 456,
    "claimNumber": "CLM202501123",
    "status": "draft",
    ...
  }
}
```

---

### GET /claims/drafts

Get all draft claims (not yet submitted).

**Response:**

```json
{
  "success": true,
  "claims": [...]
}
```

---

### GET /claims/submitted

Get paginated list of submitted claims.

**Query Parameters:**

- `page` (default: 1)
- `limit` (default: 20)
- `status` (optional): Filter by status

**Response:**

```json
{
  "success": true,
  "claims": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200,
    "limit": 20
  }
}
```

---

### POST /claims/:claimId/submit

Submit a draft claim to the insurance provider.

**Features:**

- ✅ Document validation
- ✅ WebSocket notification
- ✅ Cache invalidation

**Response:**

```json
{
  "success": true,
  "message": "Claim submitted successfully",
  "claim": {...}
}
```

**WebSocket Event:**

```javascript
socket.on("claim:update", (data) => {
  // { type: 'claim_update', claimId, status: 'submitted', ... }
});
```

---

### POST /claims/:claimId/enhance

Add clarification or additional documents in response to queries.

**Request Body:**

```json
{
  "clarificationText": "Additional information...",
  "documents": ["doc1.pdf", "doc2.pdf"]
}
```

---

### GET /claims/:claimId/history

Get complete timeline of claim events.

**Response:**

```json
{
  "success": true,
  "claim": {...},
  "timeline": [
    {
      "event": "Created",
      "timestamp": "2025-01-25T10:00:00Z",
      "user": "Dr. Smith"
    },
    {
      "event": "Submitted",
      "timestamp": "2025-01-26T14:30:00Z",
      "user": "Admin"
    }
  ]
}
```

---

### GET /claims/:claimId/pdf

Generate and download claim PDF.

**Features:**

- ✅ PDF generation using PDFKit
- ✅ Includes patient info, claim details, timeline

**Response:**

```json
{
  "success": true,
  "message": "PDF generated successfully",
  "pdfUrl": "/pdfs/claims/claim-CLM123-1234567890.pdf",
  "claim": {
    "claimNumber": "CLM123",
    "claimAmount": 50000,
    "status": "submitted"
  }
}
```

---

### POST /claims/bulk-upload

Upload multiple claims via CSV/Excel file.

**Form Data:**

- `file`: CSV/Excel file

**Response:**

```json
{
  "success": true,
  "imported": 45,
  "failed": 2,
  "errors": [{ "row": 3, "error": "Invalid policy number" }]
}
```

---

## 🔐 Pre-Authorization

### POST /pre-auth/new

Request pre-approval for inpatient admission.

**Request Body:**

```json
{
  "patientId": 123,
  "policyNumber": "POL123456",
  "estimatedAmount": 100000,
  "admissionDetails": {
    "admissionDate": "2025-02-01",
    "procedure": "Cardiac Surgery",
    "expectedDuration": "5 days"
  },
  "procedureDetails": {
    "icdCode": "I25.5",
    "description": "Coronary artery bypass"
  }
}
```

**Response:**

```json
{
  "success": true,
  "preAuth": {
    "id": 789,
    "preAuthNumber": "PA202501123",
    "status": "pending",
    "estimatedAmount": 100000
  }
}
```

---

### GET /pre-auth/pending

List all pending pre-authorization requests.

---

### GET /pre-auth/approved

List all approved pre-authorizations.

---

### GET /pre-auth/rejected

List all rejected pre-authorizations.

---

## 📄 Document Management

### POST /documents/upload

Upload claim-related documents.

**Form Data:**

- `document`: File (PDF, JPG, PNG)
- `claimId`: Claim ID
- `documentType`: Type (discharge-summary, bills, prescriptions, etc.)

**Response:**

```json
{
  "success": true,
  "document": {
    "id": 123,
    "filename": "discharge-summary.pdf",
    "url": "/uploads/claims/123/discharge-summary.pdf"
  }
}
```

---

### GET /documents/missing

Get claims with incomplete/missing documents.

**Response:**

```json
{
  "success": true,
  "claims": [
    {
      "claimNumber": "CLM123",
      "missingDocuments": ["Discharge Summary", "Final Bills"]
    }
  ]
}
```

---

## 👤 Patient / Member Search

### POST /patient/search

Search patients by ABHA, mobile, name, or policy number.

**Request Body:**

```json
{
  "searchTerm": "9876543210",
  "searchType": "mobile" // Options: "mobile", "abha", "name", "policy"
}
```

**Response:**

```json
{
  "success": true,
  "patients": [
    {
      "id": 123,
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "9876543210",
      ...
    }
  ]
}
```

---

### GET /patient/:patientId/eligibility

Check policy validity and coverage details.

**Query Parameters:**

- `policyNumber` (required)
- `insuranceProvider` (optional, default: "Star Health")

**Features:**

- ✅ Real insurance provider API integration
- ✅ Redis caching (1-hour TTL)
- ✅ Fallback to mock data if provider not configured

**Response:**

```json
{
  "success": true,
  "eligibility": {
    "eligible": true,
    "policyNumber": "POL123456",
    "provider": "Star Health",
    "policyStatus": "Active",
    "sumInsured": 500000,
    "availableBalance": 450000,
    "coverageDetails": {
      "roomRent": "Single AC Room",
      "icuCoverage": true,
      "ambulanceCoverage": true,
      "copayment": 10
    },
    "policyExpiry": "2025-12-31",
    "dataSource": "api",
    "timestamp": "2025-01-30T12:00:00Z"
  },
  "cached": false
}
```

---

## 💰 Revenue / Financials

### GET /revenue/receivables

Shows outstanding amounts from insurance companies.

**Response:**

```json
{
  "success": true,
  "receivables": {
    "approvedNotSettled": 2500000,
    "settled": 15000000,
    "pending": 500000,
    "total": 17500000
  }
}
```

---

### GET /revenue/settlement-status

Track settlement status by insurance company.

**Response:**

```json
{
  "success": true,
  "settlements": [
    {
      "insuranceProvider": "Star Health",
      "pendingAmount": 500000,
      "settledAmount": 3000000,
      "claimCount": 45
    }
  ]
}
```

---

## 📈 Reports & Analytics

### GET /reports/claims-aging

Claims aging report (how long claims have been pending).

**Response:**

```json
{
  "success": true,
  "aging": {
    "0-7days": 12,
    "8-15days": 25,
    "16-30days": 18,
    "31-60days": 8,
    "over60days": 5
  }
}
```

---

### GET /reports/tat

Turnaround time analysis (submission to approval).

**Response:**

```json
{
  "success": true,
  "tat": {
    "average": 12,
    "median": 10,
    "byProvider": {
      "Star Health": 8,
      "HDFC ERGO": 15
    }
  }
}
```

---

### GET /reports/query-rejection-trends

Query and rejection trends over time.

**Response:**

```json
{
  "success": true,
  "trends": {
    "monthlyQueries": [...],
    "monthlyRejections": [...],
    "topReasons": [
      { "reason": "Missing documents", "count": 45 },
      { "reason": "Policy expired", "count": 12 }
    ]
  }
}
```

---

## 🔌 WebSocket Events

### Connection

```javascript
const socket = io("https://app.mediqzy.com");

socket.emit("authenticate", {
  userId: 123,
  userType: "hospital",
  organizationId: 1,
});

socket.on("authenticated", (data) => {
  console.log("Connected:", data);
});
```

### Events

#### claim:update

Triggered when claim status changes.

```javascript
socket.on("claim:update", (data) => {
  // {
  //   type: 'claim_update',
  //   claimId: 456,
  //   claimNumber: 'CLM123',
  //   status: 'approved',
  //   message: 'Claim approved',
  //   timestamp: '2025-01-30T12:00:00Z'
  // }
});
```

#### preauth:update

Triggered for pre-authorization updates.

#### document:update

Triggered when documents are uploaded/verified.

#### query:new

Triggered when insurance provider requests clarification.

#### settlement:update

Triggered for payment settlement updates.

---

## 🚀 Performance Features

### Redis Caching

- Dashboard stats: 5-minute TTL
- Eligibility checks: 1-hour TTL
- Claim lists: 1-minute TTL
- Auto-invalidation on updates

### WebSocket Notifications

- Real-time claim status updates
- Pre-auth approval notifications
- Document verification alerts
- Query/clarification requests

### PDF Generation

- High-quality PDFs using PDFKit
- Includes claim summary, patient info, timeline
- Stored in `/public/pdfs/claims/`

### Insurance Provider Integration

- Support for multiple TPAs (Star Health, HDFC ERGO, ICICI Lombard, Bajaj Allianz)
- Configurable API credentials via environment variables
- Graceful fallback to mock data when not configured

---

## 📝 Configuration

### Environment Variables

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Socket.IO
CLIENT_URL=http://localhost:3000

# Insurance Providers
STAR_HEALTH_API_URL=https://api.starhealthinsurance.com
STAR_HEALTH_API_KEY=your-api-key

HDFC_ERGO_API_URL=https://api.hdfcergo.com
HDFC_ERGO_API_KEY=your-api-key

ICICI_LOMBARD_API_URL=https://api.icicilombard.com
ICICI_LOMBARD_API_KEY=your-api-key

BAJAJ_ALLIANZ_API_URL=https://api.bajajallianz.com
BAJAJ_ALLIANZ_API_KEY=your-api-key
```

---

## 🧪 Testing

Run comprehensive test suite:

```bash
cd server
npm test __tests__/hospital-insurance.test.js
```

Test coverage includes:

- All 23 endpoints
- Authentication/authorization
- Error handling
- WebSocket events
- Cache functionality
- PDF generation

---

## 📊 Implementation Status

| Feature           | Status      | Notes                    |
| ----------------- | ----------- | ------------------------ |
| Dashboard         | ✅ Complete | With Redis caching       |
| Claims Management | ✅ Complete | 8 endpoints              |
| Pre-Authorization | ✅ Complete | 4 endpoints              |
| Document Upload   | ✅ Complete | 2 endpoints              |
| Patient Search    | ✅ Complete | With eligibility check   |
| Revenue Reports   | ✅ Complete | 2 endpoints              |
| Analytics Reports | ✅ Complete | 3 endpoints              |
| PDF Generation    | ✅ Complete | Using PDFKit             |
| WebSocket         | ✅ Complete | Real-time notifications  |
| Redis Cache       | ✅ Complete | Performance optimization |
| Tests             | ✅ Complete | Comprehensive test suite |
| Documentation     | ✅ Complete | This document            |

**Total Endpoints:** 23  
**Fully Implemented:** 23 (100%)

---

## 🔗 Related APIs

- Patient Portal: `/api/patient/insurance/*`
- Admin Dashboard: `/api/admin/insurance/*`
- TPA Integration: `/api/tpa/*`

---

**Last Updated:** January 30, 2025  
**API Version:** v1.0  
**Base URL:** https://app.mediqzy.com/api/hospital/insurance
