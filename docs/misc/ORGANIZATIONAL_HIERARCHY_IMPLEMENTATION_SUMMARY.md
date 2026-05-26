# Mediczy Organizational Hierarchy - Implementation Summary

## Hierarchy Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ TIER 1: AGGREGATORS (Platform Operators)                        │
├─────────────────────────────────────────────────────────────────┤
│ Types: Broker, TPA, Insurance Company, Hospital Network         │
│ Tables: insurance_brokers, tpas, insurance_companies            │
│ Key Operations:                                                  │
│  • Manage multiple corporate clients                            │
│  • Build wellness partner network                               │
│  • Track commissions & contracts                                │
│  • View network analytics & performance                         │
│  • Audit logging of all actions                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴─────────────────────────┐
        │                                      │
┌───────▼──────────────────────┐      ┌──────▼──────────────────┐
│ TIER 2: CORPORATE CLIENTS    │      │ TIER 2B: WELLNESS       │
├───────────────────────────── │      ├──────────────────────   │
│ Table: corporates            │      │ PARTNERS                │
│                              │      │                          │
│ • Company name, contact      │      │ Tables:                 │
│ • Industry, employee count   │      │ • hospitals             │
│ • Package/plan details       │      │ • clinics (if exists)   │
│ • Status tracking            │      │ • labs                  │
│                              │      │ • pharmacies            │
│ Aggregator sees:             │      │ • ambulances            │
│ • All their corporate clients│      │ • homecare_providers    │
│ • Utilization metrics        │      │ • Other services        │
│ • Contract compliance        │      │                          │
│ • Employee count & health    │      │ Aggregator manages:     │
│ • Billing & payments         │      │ • Commission rates      │
│                              │      │ • Service categories    │
│                              │      │ • Contract periods      │
│                              │      │ • Coverage areas        │
└───────┬──────────────────────┘      │ • Network status        │
        │                              │                          │
        │                              └───────────────────────┘
        │
        │ (Contains)
        │
┌───────▼──────────────────────────────┐
│ TIER 3: CORPORATE EMPLOYEES/USERS    │
├────────────────────────────────────  │
│ Table: users + corporate_employees   │
│                                      │
│ • Employee ID, name, email           │
│ • Department, designation            │
│ • Joining/exit dates                 │
│ • Dependencies (family members)      │
│ • Status (active/inactive)           │
│                                      │
│ Employee can:                        │
│ • Book appointments with doctors     │
│ • Access wellness partners           │
│ • Use video consultation             │
│ • View health records                │
│ • Download prescriptions             │
│ • Pay from corporate wallet          │
│                                      │
│ Can see:                             │
│ • Partner hospitals, clinics         │
│ • Partner labs, pharmacies           │
│ • In-network ambulances              │
│ • Wellness program details           │
└──────────────────────────────────────┘
```

## Database Schema Relationships

```
aggregator_wellness_network (NEW)
├── aggregator_id ──→ insurance_brokers.id
├── wellness_provider_type (enum)
├── wellness_provider_id ──→ hospitals/labs/pharmacies/etc.
├── commission_percentage
├── service_categories (JSONB)
├── contract_dates (start/end)
└── status (active/pending/inactive/suspended)

corporates (ENHANCED)
├── aggregator_id ──→ insurance_brokers.id (NEW)
├── aggregator_type (broker/tpa/insurance) (NEW)
├── tenant_id ──→ tenants.id (existing)
└── ... existing fields

users (ENHANCED)
├── corporate_id ──→ corporates.id (existing)
├── tenant_id ──→ tenants.id (existing)
├── aggregator_id ──→ insurance_brokers.id (NEW)
├── aggregator_type (NEW)
└── ... existing fields

corporate_employees (EXISTING, unchanged)
├── corporateId ──→ corporates.id
├── userId ──→ users.id
└── ... existing fields

aggregator_action_logs (NEW - Audit Trail)
├── aggregator_id
├── aggregator_type
├── user_id ──→ users.id
├── action_type (add_partner, remove_partner, etc.)
├── entity_type ──→ (corporate, partner, etc.)
├── changes (JSONB)
└── timestamp
```

## API Endpoints Overview

### Aggregator Management
```
GET  /api/aggregators/profile
        → Get aggregator profile + network statistics
        
GET  /api/aggregators/corporates?status=active&limit=50
        → List corporate clients under aggregator
        
GET  /api/aggregators/wellness-partners?partnerType=hospital
        → Get wellness network (hospitals, labs, pharmacies, etc.)
        
POST /api/aggregators/wellness-partners
        → Add new partner to network
        {
          wellnessProviderType: 'hospital',
          wellnessProviderId: 5,
          commissionPercentage: 5.5,
          contractStartDate: '2026-02-01',
          contractEndDate: '2027-02-01'
        }
        
GET  /api/aggregators/network-statistics
        → Network analytics (active partners, commissions, etc.)
        
GET  /api/aggregators/action-logs?actionType=add_partner
        → Audit trail of all aggregator actions
```

### Corporate Management (by Aggregator Admin)
```
GET  /api/aggregators/corporates/:id/employees?isActive=true
        → Get employees of corporate (for aggregator admin)
        
GET  /api/corporates/:corporateId/wellness-partners
        → Get partners accessible to corporate employees
```

### Corporate Employee Access
```
GET  /api/corporate/my-profile
        → Current user + corporate information
        
GET  /api/corporate/dashboard
        → Corporate-specific dashboard with:
        - Corporate info
        - Available wellness services
        - Feature flags
        - Service endpoints
```

## Authentication & Authorization

### User Token Structure
```javascript
{
  id: 19,                              // User ID
  role: 'corporate',                   // User role (corporate|doctor|patient|aggregator_admin|etc.)
  organization_id: 7,                  // Corporate ID or Clinic ID
  organization_type: 'corporate',      // Type of organization
  corporate_id: 7,                     // Direct link to corporate (if employee)
  tenant_id: 7,                        // Aggregator tenant ID
  aggregator_id: 1,                    // Aggregator ID (if admin or aggregator user)
  aggregator_type: 'broker',           // Aggregator type (broker|tpa|insurance)
  iat: 1707417600,
  exp: 1709009600
}
```

### Ring-Fencing Rules (Access Control)

**Corporate Role:**
```javascript
allowedPaths: [
  '/api/corporate',
  '/api/corporate/employees',
  '/api/corporate/appointments',
  '/api/doctors',           // Can browse doctors
  '/api/video',             // Can do video consultations
  '/api/appointments',      // Can manage own appointments
  '/api/chat'               // Can chat with providers
]
```

**Aggregator Admin Role:**
```javascript
allowedPaths: [
  '/api/aggregators',                  // Aggregator management
  '/api/aggregators/profile',
  '/api/aggregators/corporates',
  '/api/aggregators/wellness-partners',
  '/api/corporates/:id/employees',     // View corporate employees
  '/api/aggregators/network-statistics',
  '/api/aggregators/action-logs'
]
```

## Access Flow Example

### Scenario: Corporate Employee booking with partner clinic doctor

```
1. Employee logs in
   → JWT token created with:
     - role: 'corporate'
     - corporate_id: 7
     - tenant_id: 7
     - aggregator_id: 1 (inherited from corporate)

2. Browse available doctors
   GET /api/doctors/partnered
     → Middleware checks: role='corporate' ✓
     → Services queries:
       a) Get corporate.tenant_id = 7
       b) Get partners via tenant_partners WHERE corporate_tenant_id=7
       c) Filter doctors WHERE clinic.tenant_id IN (partner_list)
       d) Return doctors from partner clinics only
     → Results: [Dr. Nandita (clinic_id=3), Dr. Sharma (clinic_id=5)]

3. Book appointment
   POST /api/appointments
     → Validate: clinic is partner ✓
     → Validate: doctor is in partner clinic ✓
     → Create appointment with:
       - corporate_tenant_id: 7 (corporate's tenant)
       - user_id: 19
       - doctor_id: 70
       
4. Aggregator admin sees this booking
   → Can view via /api/aggregators/corporates/7/employees
   → Can see all corporate appointments
   → Can generate analytics
   → Can audit who booked when
```

## Key Implementation Features

### ✅ Completed
- [x] Multi-level organizational hierarchy documentation
- [x] Aggregator Service with full business logic
- [x] API Controllers and endpoints
- [x] Route definitions
- [x] Database migration script
- [x] Audit logging framework
- [x] Service layer abstractions

### 🚀 Ready for Implementation
- [ ] Run database migration
- [ ] Integrate aggregator routes into main app
- [ ] Update ring-fencing middleware with aggregator roles
- [ ] Update JWT generation to include aggregator context
- [ ] Test aggregator endpoints
- [ ] Deploy to production

### 📊 Advanced Features (Future)
- [ ] Dashboards & analytics for aggregators
- [ ] Performance metrics for wellness network
- [ ] Commission settlement & payout system
- [ ] Contract management & e-signature
- [ ] Network utilization reports
- [ ] Benchmarking against industry standards
- [ ] Dynamic pricing per partner
- [ ] Automated partner onboarding workflow

## Security Considerations

1. **Data Isolation**
   - Aggregator A cannot see corporates of Aggregator B
   - Corporate A employees cannot see Corporate B data
   - Partner data visible only to authorized aggregators

2. **Role-Based Access Control**
   - Ring-fencing enforces allowed paths
   - Aggregator_admin role unlocks aggregator endpoints
   - Corporate role limited to corporate-specific endpoints

3. **Audit Trail**
   - All aggregator actions logged with timestamps
   - User identity captured
   - Changes tracked in JSONB format
   - IP address recorded for security

4. **API Rate Limiting**
   - Per-aggregator quotas to prevent abuse
   - Per-role rate limits
   - Burst protection

5. **Data Validation**
   - Commission percentages validated (0-100)
   - Contract dates chronologically valid
   - Partner IDs verified before adding
   - Status values from allowed enum

## Files Created/Modified

###📄 New Files
```
ORGANIZATIONAL_HIERARCHY_ARCHITECTURE.md          # Architecture & design documentation
server/services/aggregator.service.js             # Business logic service
server/controller/aggregator.controller.js        # API controllers
server/routes/aggregator.route.js                 # Route definitions
database_migrations/001_organizational_hierarchy.sh  # Database schema migration
```

### 📝 Documentation
```
ORGANIZATIONAL_HIERARCHY_IMPLEMENTATION_SUMMARY.md (This file)
```

## Status

✅ **Architecture Designed**  
✅ **Service Layer Implemented**  
✅ **API Endpoints Defined**  
✅ **Database Schema Prepared**  
✅ **Code Committed to GitHub**  

⏳ **Next Steps**
1. Run database migration script
2. Register routes in app
3. Update middleware configurations
4. End-to-end testing
5. Production deployment

---

**Commit**: a39dc76  
**Date**: February 8, 2026  
**Status**: ✅ Ready for Implementation
