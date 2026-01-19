# Insurance Company Login & Corporate Policy System

## Overview
Complete health insurance policy management system with role-based access for Insurance Companies, Corporates, and their employees.

## System Architecture

```
Insurance Company → Creates Policies → Purchased by Corporate → Covers Employees & Dependents
                         ↓
                    Policy Rules (Rule Engine)
                         ↓
                  Claims Processing (TPA)
                         ↓
            Hospital/Clinic/Lab/Pharmacy Services
```

## Database Schema

### 1. Insurance Companies Table
- **Purpose**: Insurance providers (HDFC Ergo, ICICI Lombard, Star Health, etc.)
- **Authentication**: Email/password login
- **Features**: 
  - IRDAI registration number
  - Network hospitals
  - TPA partners
  - Policy creation & management

### 2. Corporates Table
- **Purpose**: Companies purchasing group insurance for employees
- **Authentication**: Email/password login
- **Features**:
  - CIN, GSTIN, PAN registration
  - Employee management
  - Policy tracking
  - HR contact details

### 3. Corporate Employees Table
- **Purpose**: Link employees to corporates
- **Features**:
  - Employee ID mapping
  - Department & designation
  - Dependent information
  - Coverage tracking

### 4. Insurance Policies Table
- **Links**:
  - `insuranceCompanyId` → Insurance company offering policy
  - `corporateId` → Corporate purchaser
  - `brokerId` → Insurance broker (optional)
  - `tpaId` → TPA for claims processing

### 5. Policy Members Table
- **Purpose**: Individual coverage under policies
- **Links**: Corporate employees + their dependents

## API Endpoints

### Insurance Company Routes (`/api/insurance-company`)

#### Authentication
```
POST /register                    - Register insurance company
POST /login                       - Insurance company login
GET  /profile                     - Get company profile
PUT  /profile                     - Update company profile
GET  /dashboard                   - Company dashboard (policies, claims stats)
```

#### Corporate Management
```
POST /corporate/register          - Register corporate
POST /corporate/login             - Corporate login
GET  /corporate/profile           - Get corporate profile
GET  /corporate/dashboard         - Corporate dashboard (employees, policies)
POST /corporate/employees         - Add employee
GET  /corporate/employees         - List employees
```

#### Admin Routes
```
GET  /admin/companies             - List all insurance companies
POST /admin/companies/:id/verify  - Verify insurance company
GET  /admin/corporates            - List all corporates
```

### Policy Routes (`/api/insurance-policies`)

#### Policies
```
POST /policies                    - Create policy (insurance company)
GET  /policies                    - List policies (with filters)
GET  /policies/:id                - Get policy details
PUT  /policies/:id                - Update policy
POST /policies/:id/activate       - Activate policy
```

#### Policy Rules
```
POST /policies/:policyId/rules    - Create policy rule
GET  /policies/:policyId/rules    - List policy rules
PUT  /policies/:policyId/rules/:id - Update rule
POST /policies/:policyId/evaluate - Test rule evaluation
```

#### Policy Members
```
POST /policies/:policyId/members  - Add member (employee/dependent)
GET  /policies/:policyId/members  - List policy members
```

#### Claims
```
POST /claims                      - Submit claim
GET  /claims                      - List claims
GET  /claims/:id                  - Get claim details
POST /claims/:id/adjudicate       - Run rule engine (TPA/admin)
PUT  /claims/:id/status           - Update claim status
```

## User Flow

### 1. Insurance Company Setup
```javascript
// Insurance company registers
POST /api/insurance-company/register
{
  "companyName": "HDFC ERGO Health Insurance",
  "companyCode": "HDFC_HEALTH",
  "email": "admin@hdfcergo.com",
  "password": "secure_password",
  "irdaiRegistrationNumber": "155",
  "gstin": "27AAACP1234A1Z5",
  "contactPerson": {
    "name": "John Doe",
    "designation": "VP Operations",
    "email": "john@hdfcergo.com",
    "phone": "+91-9876543210"
  }
}

// Admin verifies company
POST /api/insurance-company/admin/companies/:id/verify

// Insurance company logs in
POST /api/insurance-company/login
{
  "email": "admin@hdfcergo.com",
  "password": "secure_password"
}
// Returns JWT token with role: 'insurance_company'
```

### 2. Corporate Registration
```javascript
// Corporate registers
POST /api/insurance-company/corporate/register
{
  "corporateName": "TechCorp India Pvt Ltd",
  "corporateCode": "TECHCORP",
  "email": "hr@techcorp.com",
  "password": "secure_password",
  "industry": "IT Services",
  "employeeCount": 500,
  "cin": "U72900MH2010PTC123456",
  "gstin": "27AABCT1234F1Z5",
  "hrContact": {
    "name": "Jane Smith",
    "designation": "HR Manager",
    "email": "jane@techcorp.com",
    "phone": "+91-9876543211"
  }
}

// Corporate logs in
POST /api/insurance-company/corporate/login
{
  "email": "hr@techcorp.com",
  "password": "secure_password"
}
// Returns JWT token with role: 'corporate'
```

### 3. Insurance Company Creates Policy
```javascript
// Insurance company creates group policy for corporate
POST /api/insurance-policies/policies
Authorization: Bearer <insurance_company_token>
{
  "policyNumber": "HDFC/GRP/2024/001234",
  "policyName": "TechCorp Group Health Insurance 2024",
  "insuranceCompanyId": 1,
  "corporateId": 1,
  "tpaId": 5,
  "policyType": "group",
  "sumInsured": 500000,
  "premium": 2500000,
  "policyStartDate": "2024-01-01",
  "policyEndDate": "2024-12-31",
  "coverageConfig": {
    "hospitalization": true,
    "daycare": true,
    "maternity": true,
    "newborn": true,
    "prePostHospitalization": {"pre": 60, "post": 90},
    "ambulance": true,
    "opd": true,
    "ayush": true
  },
  "limits": {
    "roomRent": 5000,
    "icuRent": 10000,
    "maternity": 100000,
    "deductible": 0,
    "copayment": 10
  },
  "waitingPeriods": {
    "initial": 30,
    "ped": 24,
    "maternity": 24
  }
}
```

### 4. Corporate Adds Employees
```javascript
// Corporate adds employee to system
POST /api/insurance-company/corporate/employees
Authorization: Bearer <corporate_token>
{
  "userId": 12345,  // From users table
  "employeeId": "EMP001",
  "department": "Engineering",
  "designation": "Senior Developer",
  "joiningDate": "2023-06-15",
  "dependents": [
    {
      "name": "Spouse Name",
      "relationship": "spouse",
      "dob": "1990-05-20"
    },
    {
      "name": "Child Name",
      "relationship": "son",
      "dob": "2018-08-10"
    }
  ]
}
```

### 5. Add Employee & Dependents to Policy
```javascript
// Add employee as policy member
POST /api/insurance-policies/policies/1/members
{
  "userId": 12345,
  "relationship": "self",
  "individualSumInsured": 500000,
  "preExistingDiseases": [
    {
      "disease": "Diabetes Type 2",
      "diagnosedDate": "2020-01-15",
      "waitingPeriodMonths": 24
    }
  ]
}

// Add spouse
POST /api/insurance-policies/policies/1/members
{
  "userId": 12346,  // Spouse's user ID
  "relationship": "spouse",
  "individualSumInsured": 500000
}

// Add child
POST /api/insurance-policies/policies/1/members
{
  "userId": 12347,  // Child's user ID
  "relationship": "son",
  "individualSumInsured": 500000
}
```

### 6. Employee Files Claim
```javascript
// Employee submits claim
POST /api/insurance-policies/claims
Authorization: Bearer <employee_token>
{
  "policyId": 1,
  "patientId": 12345,
  "hospitalId": 456,
  "claimType": "cashless",
  "treatmentType": "inpatient",
  "admissionDate": "2024-03-15T10:00:00Z",
  "dischargeDate": "2024-03-18T12:00:00Z",
  "diagnosis": "Acute Appendicitis",
  "icdCode": "K35.8",
  "claimedAmount": 75000,
  "documents": [
    "discharge_summary.pdf",
    "medical_bills.pdf",
    "lab_reports.pdf"
  ]
}
```

### 7. TPA Processes Claim (Rule Engine)
```javascript
// TPA runs claim through rule engine
POST /api/insurance-policies/claims/1/adjudicate
Authorization: Bearer <tpa_token>

// Rule engine automatically evaluates:
// ✓ Initial waiting period (30 days)
// ✓ Pre-existing disease waiting (if applicable)
// ✓ Room rent limits
// ✓ Treatment coverage
// ✓ Network hospital validation
// ✓ Deductibles & copayment
// ✓ Sub-limits

// Returns adjudication result:
{
  "claimedAmount": 75000,
  "approvedAmount": 65250,
  "deductedAmount": 9750,
  "deductions": {
    "roomRentDeduction": 2250,
    "copayment": 7500,
    "deductible": 0,
    "nonMedicalExpenses": 0
  },
  "status": "approved"
}
```

## Rule Engine Categories

### 1. Eligibility Rules
- `ELIG_FAMILY_DEF` - Family member validation
- `ELIG_ENTRY_AGE` - Age limits for enrollment

### 2. Waiting Period Rules
- `WAIT_INITIAL_30` - 30-day initial waiting
- `WAIT_SPECIFIC_DISEASE` - Disease-specific waiting
- `WAIT_PED` - Pre-existing disease waiting
- `MATERNITY` - Maternity waiting period

### 3. Coverage Rules
- `HOSP_MIN_DURATION` - Minimum hospitalization
- `DAY_CARE` - Day care procedures
- `AYUSH` - Alternative medicine
- `DOMICILIARY` - Home treatment
- `NEWBORN_DAY1` - Newborn coverage

### 4. Financial Rules
- `ROOM_RENT_LIMIT` - Room rent caps
- `PROP_DEDUCTION` - Proportionate deduction
- `DEDUCTIBLE` - Policy deductible
- `COPAY` - Co-payment percentage
- `SUBLIMIT_DISEASE` - Disease sub-limits

### 5. Network Rules
- `CASHLESS` - Cashless facility
- `PPN` - Preferred provider network
- `CLAIM_INTIMATION` - Claim notification timeline

## Benefits

### For Insurance Companies
✓ Digital policy creation & management
✓ Automated rule engine for claims
✓ Corporate client dashboard
✓ Network hospital integration
✓ TPA coordination

### For Corporates
✓ Employee health coverage management
✓ Real-time policy tracking
✓ Claims visibility
✓ Department-wise reporting
✓ Dependent management

### For Employees
✓ Instant policy coverage
✓ Cashless hospitalization
✓ Family coverage (floater)
✓ Digital claim submission
✓ Transparent adjudication

### For TPAs
✓ Automated claim processing
✓ Rule-based adjudication
✓ Quick settlement
✓ Audit trail
✓ Compliance reporting

## Implementation Status

✅ Insurance company authentication
✅ Corporate authentication  
✅ Employee management
✅ Policy creation with rule engine
✅ 25+ policy rules implemented
✅ Automated claim adjudication
✅ Multi-entity integration
✅ Database schema complete
✅ API endpoints active
✅ Server running

## Next Steps (Optional)

- Corporate bulk employee upload via CSV
- Policy renewal automation
- Claim status notifications
- Insurance broker portal
- Hospital cashless pre-authorization
- Mobile app integration
- Analytics dashboard
- Compliance reporting (IRDAI)

---

**Server Status**: ✅ Online  
**Database**: ✅ Connected  
**Routes**: ✅ Registered  
**Ready for**: Production Use
