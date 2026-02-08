# Organizational Hierarchy Architecture - Mediczy Platform

## Overview
Mediczy implements a **4-tier multi-tenant organizational hierarchy** supporting complex B2B2B2C healthcare ecosystem:

```
┌─────────────────────────────────────────────────────┐
│          AGGREGATOR LAYER (Tier 1)                  │
│  Broker / TPA / Insurance / Hospital Network        │
│  (insurance_brokers, tpas, insurance_companies)     │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────────────────────┐
        │                                     │
┌───────▼──────────────┐         ┌───────────▼──────────┐
│  CORPORATE TIER (T2) │         │ WELLNESS PARTNERS    │
│  Client Organizations│         │ Service Providers    │
│  (corporates table)  │         │ (T1 Direct)          │
└───────┬──────────────┘         └──────────────────────┘
        │                        │
    ┌───▼────────────┐      ┌────▼─────────────────┐
    │                │      │                     │
┌───▼──────┐   ┌─────▼──┐  │  PARTNER NETWORK    │
│EMPLOYEES │   │DEPT    │  │                     │
│(Users)   │   │ TEAMS  │  │ • Clinics           │
│(T3)      │   │        │  │ • Hospitals         │
└──────────┘   └────────┘  │ • Labs              │
                            │ • Pharmacies        │
                            │ • Homecare          │
                            │ • Ambulances        │
                            │ • Other Services    │
                            └─────────────────────┘
```

## Current Database Structure

### Tier 1: Aggregators (Platform Level)
**Tables:**
- `insurance_brokers` - Brokers/Aggregators
- `tpas` - TPAs (Third Party Administrators)
- `insurance_companies` - Insurance providers
- `hospitals` - Can act as network aggregators

**Key Fields:**
```sql
insurance_brokers:
  - broker_name, email, phone
  - irdai_license_number (regulatory)
  - commission_percentage
  - active_policies_count, total_premium_facilitated
  - service_areas (JSONB) - geographic coverage
  - certifications, specializations
  - broker_uid (unique identifier)
```

### Tier 2: Corporate Clients
**Table:** `corporates`

**Key Fields:**
```sql
corporates:
  - companyName, email, phone
  - tenant_id ← Links to parent aggregator/tenant
  - industry, employeeCount
  - packageType, packageAmount
  - contractDocument
  - onboarded_by, onboarded_by_id (tracks aggregator)
  - unique_id, uid
```

**Relationship:** Corporate → Aggregator via `tenant_id` field

### Tier 3: Corporate Employees/Users
**Table:** `users` + `corporate_employees`

**Key Fields (users table):**
```sql
users:
  - organization_id ← Link to corporate
  - organization_type (ENUM: 'corporate', 'hospital', 'lab', etc.)
  - corporate_id ← Direct link to corporates table
  - tenant_id ← Inherited from corporate
  - role (corporate, doctor, patient, admin, etc.)
  - isCorporate (boolean flag)
  - isTeam (boolean flag for teams)
```

**Key Fields (corporate_employees table):**
```sql
corporate_employees:
  - corporateId → corporates.id
  - userId → users.id
  - employeeId (unique within corporate)
  - department, designation
  - joiningDate, exitDate
  - dependents (JSONB - family members)
  - isActive (boolean)
```

### Wellness Partners (Direct to Aggregator)
**Tables:**
- `hospitals` - Hospital network partners
- `clinics` (if exists) - Clinic partnerships
- `labs` - Diagnostic labs
- `pharmacies` - Pharmacy network
- `ambulances` - Ambulance services
- `homecare_providers` - Homecare services

**Current Structure (Missing aggregator link):**
```sql
hospitals:
  - hospital_name, registration_number
  - network_type (TPA, Insurance, Broker network)
  - specializations (JSONB)
  - facilities (JSONB)
  - status, is_verified
  
pharmacies, labs, etc.:
  - Similar structure with service offerings
```

**ISSUE:** These partner tables lack direct `aggregator_id` or `broker_id` field

## Existing Linking Mechanisms

### 1. Tenant Partnership System
**Table:** `tenant_partners`
```sql
tenant_partners:
  - corporate_tenant_id (INT) ← Corporate's tenant ID
  - partner_tenant_id (INT) ← Partner's tenant ID
  - status (active/inactive)
  - metadata (JSONB)
```

**Status:** ✅ Already implemented for corporate-to-clinic partnerships
**Current Usage:** Tracks corporate ↔ partner clinic relationships

### 2. User Hierarchy via Tenants
**Table:** `tenants` (Platform tenant management)
```sql
tenants:
  - id (primary key)
  - type (ENUM: 'individual', 'corporate', 'hospital', 'clinic', etc.)
  - parent_id ← For hierarchical relationships
  - aggregator_uid ← References aggregator
  - owner_id, admin_user_id
  - status (active/suspended)
```

**Status:** ⚠️ Partially implemented - `parent_id` and `aggregator_uid` fields exist but need formalization

### 3. Role-Based Access Control
**Table:** `roles` + `user_roles`
```sql
roles:
  - name (admin, doctor, patient, corporate, broker, tpa, etc.)
  - permissions (JSONB)
```

**Status:** ⚠️ Exists but needs aggregator-specific roles

## Current Access Patterns

### Corporate Employee Access
```
User (role='corporate') 
  → corporate_id → corporates table
  → tenant_id → tenants table
  → Can access: own corporate data, partner clinics via tenant_partners
  → Cannot access: other corporates, aggregator data
```

### Doctor Access
```
Doctor (role='doctor')
  → organization_id → Hospital/Clinic
  → Can access: appointments, patients, prescriptions for own clinic
```

### Ring-Fencing Validation
**File:** `server/middleware/ringFencing.js`

Current rules enforce path-based access by role. Structure:
```javascript
{
  corporate: { allowedPaths: ['/api/video', '/api/doctors', ...] },
  doctor: { allowedPaths: [...] },
  patient: { allowedPaths: [...] }
}
```

## Implementation Gaps

### Gap 1: Aggregator-to-Wellness-Partner Linking
**Problem:** Partner tables (hospitals, labs, pharmacies) lack aggregator_id

**Current Workaround:** None properly implemented

**Solution Needed:**
```sql
ALTER TABLE hospitals ADD COLUMN aggregator_id INT REFERENCES insurance_brokers(id);
ALTER TABLE hospitals ADD COLUMN aggregator_type VARCHAR(50); -- 'broker', 'tpa', 'insurance'
CREATE INDEX idx_hospitals_aggregator ON hospitals(aggregator_id, aggregator_type);

-- Apply to all partner tables
```

### Gap 2: Aggregator Access Control
**Problem:** No clear aggregator roles and permissions defined

**Current:** Only corporate/doctor/patient roles

**Solution Needed:**
```sql
-- Define aggregator roles
INSERT INTO roles (name, permissions) VALUES (
  'aggregator_admin',
  '{"manage_corporates": true, "view_partners": true, "manage_network": true}'
);

INSERT INTO roles (name, permissions) VALUES (
  'broker_manager',
  '{"manage_policies": true, "manage_claims": true}'
);

INSERT INTO roles (name, permissions) VALUES (
  'tpa_claims_manager',
  '{"process_claims": true, "manage_authorizations": true}'
);
```

### Gap 3: Cross-Tenant Visibility Rules
**Problem:** Unclear which data aggregators can see from corporates/partners

**Solution Needed:**
- Aggregator sees all corporates they onboarded
- Aggregator sees all pharmacy/hospital/lab partners in their network
- Corporate employees see only partner clinics in their approved network
- No cross-corporate visibility

### Gap 4: Service Network Management
**Problem:** No explicit tracking of which services aggregator offers through partners

**Solution Needed:**
```sql
CREATE TABLE aggregator_wellness_network (
  id SERIAL PRIMARY KEY,
  aggregator_id INT NOT NULL,
  aggregator_type VARCHAR(50), -- 'broker', 'tpa', 'insurance', 'hospital'
  wellness_provider_type VARCHAR(50), -- 'hospital', 'clinic', 'lab', 'pharmacy', etc.
  wellness_provider_id INT NOT NULL,
  network_status VARCHAR(20) DEFAULT 'active',
  commission_percentage NUMERIC(5,2),
  service_categories JSONB, -- Specific services offered
  contract_start_date DATE,
  contract_end_date DATE,
  metadata JSONB,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_aggregator_provider UNIQUE (aggregator_id, wellness_provider_type, wellness_provider_id)
);

CREATE INDEX idx_aggregator_network ON aggregator_wellness_network(aggregator_id);
CREATE INDEX idx_provider_network ON aggregator_wellness_network(wellness_provider_type, wellness_provider_id);
```

## Data Model Relationships

### Current (Implemented)
```
tenants.parent_id → tenants.id (allows hierarchy)
corporates.tenant_id → tenants.id (corporate to aggregator tenant)
users.corporate_id → corporates.id (employee to corporate)
users.tenant_id → tenants.id (inherited from corporate)
tenant_partners.corporate_tenant_id ↔ tenant_partners.partner_tenant_id
```

### Needed (Proposed Additions)
```
aggregator_wellness_network.aggregator_id → insurance_brokers/tpas/insurance_companies
aggregator_wellness_network.wellness_provider_id → hospitals/labs/pharmacies/etc.
hospitals.aggregator_id → insurance_brokers.id (direct link)
labs.aggregator_id → insurance_brokers.id (direct link)
pharmacies.aggregator_id → insurance_brokers.id (direct link)
```

## Authentication & Authorization Flow

### User Authentication
```
1. User logs in with email/password
2. System determines organization_type and role
3. Based on role:
   - If 'corporate': Load corporate data, fetch partner list
   - If 'aggregator_admin': Load aggregator, fetch corporate clients, wellness network
   - If 'doctor': Load clinic/hospital data
4. Token includes: user_id, role, organization_id, tenant_id, aggregator_id (if applicable)
```

### Request Authorization
```javascript
// Example: Corporate user accessing partner doctors
GET /api/doctors/partnered

Validation:
1. User has role='corporate'
2. Load user.corporate_id
3. Load corporates[corporate_id].tenant_id
4. Get partner tenants from tenant_partners WHERE corporate_tenant_id = user.tenant_id
5. Filter doctors WHERE clinic.tenant_id IN (partner_list)
6. Return filtered doctors

// Example: Aggregator viewing their corporates
GET /api/aggregator/corporates

Validation:
1. User has role='aggregator_admin'
2. Load corporates WHERE tenant_id = user.tenant_id
3. Return all corporates under this aggregator
```

## Implementation Roadmap

### Phase 1: Data Model Enhancement (Priority: HIGH)
- [ ] Add `aggregator_id`, `aggregator_type` to all partner tables
- [ ] Create `aggregator_wellness_network` junction table
- [ ] Add direct aggregator references to user tokens
- [ ] Create aggregator-specific roles in database

### Phase 2: API Endpoints (Priority: HIGH)
```
Aggregator Management:
- GET /api/aggregators/profile (own profile)
- GET /api/aggregators/corporates (list client corporates)
- POST /api/aggregators/corporates (add corporate client)
- GET /api/aggregators/wellness-partners (network partners)
- POST /api/aggregators/wellness-partners (add partner)
- GET /api/aggregators/network-settings

Corporate within Aggregator:
- GET /api/corporate/profile
- GET /api/corporate/employees
- GET /api/corporate/wellness-partners (partner access)
- GET /api/corporate/dashboard
```

### Phase 3: Access Control Layer (Priority: HIGH)
- [ ] Enhanced ring-fencing for aggregator roles
- [ ] Service-level authorization checks
- [ ] Aggregator-corporate data isolation

### Phase 4: Wellness Network Management (Priority: MEDIUM)
- [ ] Partner onboarding workflow
- [ ] Network performance analytics
- [ ] Service catalog management
- [ ] Commission & payout tracking

### Phase 5: Analytics & Reporting (Priority: MEDIUM)
- [ ] Aggregator dashboard
- [ ] Network health metrics
- [ ] Corporate utilization reports
- [ ] Partner performance tracking

## Key Design Decisions

### 1. Aggregator Representation
**Decision:** Use existing `insurance_brokers`, `tpas`, `insurance_companies` tables + new unified roles

**Rationale:** Preserves domain-specific data while allowing unified aggregator operations

### 2. Partner Linking
**Decision:** Add `aggregator_id` directly to partner tables + separate `aggregator_wellness_network` junction table

**Rationale:** Direct column enables fast queries; junction table tracks contract details

### 3. Multi-Level Hierarchy
**Decision:** Use `tenants.parent_id` for tenant hierarchy; maintain separate `corporate_id` for user-corporate links

**Rationale:** Supports both tenant inheritance and user-organization mapping

### 4. Access Control
**Decision:** Extend ring-fencing middleware with aggregator-specific rules

**Rationale:** Consistent with existing security model; easy to extend

## Security Considerations

1. **Data Isolation:** Aggregator cannot see other aggregators' corporates
2. **Role Enforcement:** Aggregator_admin can only manage own network
3. **Audit Trail:** Log all aggregator actions (partner additions, removals, policy changes)
4. **Rate Limiting:** Implement per-aggregator API quotas
5. **Network Security:** Validate aggregator identity in multi-aggregator scenarios

## Example Queries Post-Implementation

```sql
-- Get all corporates under a broker
SELECT c.* FROM corporates c
JOIN tenants t ON c.tenant_id = t.id
JOIN insurance_brokers ib ON t.id = ib.broker_id
WHERE ib.id = 123;

-- Get all wellness partners in an aggregator network
SELECT * FROM aggregator_wellness_network
WHERE aggregator_id = 123 AND aggregator_type = 'broker'
AND network_status = 'active';

-- Get employees of a corporate
SELECT u.*, ce.* FROM users u
JOIN corporate_employees ce ON u.id = ce.userId
WHERE ce.corporateId = 45;

-- Get clinics accessible to a corporate employee
SELECT DISTINCT h.* FROM hospitals h
JOIN tenant_partners tp ON h.tenant_id = tp.partner_tenant_id
WHERE tp.corporate_tenant_id = (
  SELECT tenant_id FROM corporates WHERE id = 45
);
```

## Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Basic Tenant Hierarchy | ✅ Ready | `tenants.parent_id` exists |
| Corporate Structure | ✅ Ready | `corporates` table complete |
| Employee Management | ✅ Ready | `users` + `corporate_employees` |
| Partner Tables | ✅ Ready | All wellness provider tables exist |
| Aggregator Link | ⚠️ Partial | `insurance_brokers`/`tpas` exist but not linked |
| Network Management | ❌ Missing | Need `aggregator_wellness_network` |
| Access Control | ⚠️ Partial | Basic role system; need aggregator roles |
| Multi-Level Hierarchy | ⚠️ Partial | Foundation ready; needs formalization |

