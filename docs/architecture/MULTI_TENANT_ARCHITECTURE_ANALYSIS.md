# Multi-Tenant Architecture Analysis - Mediczy Platform
**Date:** January 14, 2026  
**Status:** Current Implementation vs. Proposed Architecture

---

## Executive Summary

### Current State
- **Database Strategy:** Single PostgreSQL database (`mediczy_ai`)
- **Multi-tenancy:** Partial implementation with `organization_id`/`tenant_id` fields
- **Entities:** Separate models but NO database isolation
- **Domains:** No subdomain/domain routing implemented
- **Access Control:** Limited organization-level filtering

### Your Vision
Each entity should have:
1. ✅ Own database
2. ✅ Own server instance
3. ✅ Own domain/subdomain
4. ✅ Hierarchical relationships

---

## 1. Current Implementation

### 1.1 Database Architecture

**Single Database:** `mediczy_ai` (PostgreSQL)

```sql
-- Current Structure
mediczy_ai/
├── users (all users across all organizations)
├── doctors (with organization_id field)
├── hospitals (separate entity table)
├── clinics (separate entity table)
├── tenants (organization metadata)
├── appointments (with organization_id)
├── lab_tests (with organization_id)
├── pharmacy_inventory (with organization_id)
└── ... (all other tables)
```

**Multi-Tenancy Pattern:** Shared Database, Shared Schema (Column-based isolation)

```javascript
// Example: Doctor Model
organization_id: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'Organization ID (hospital/clinic)'
},
organization_type: {
  type: DataTypes.ENUM('hospital', 'clinic', 'individual'),
  allowNull: true,
  defaultValue: 'individual'
}
```

### 1.2 Entity Models (Current)

| Entity | Model File | Has Own DB? | Multi-Tenant? | Status |
|--------|-----------|-------------|---------------|--------|
| **Hospital** | `hospital.model.intelligent.js` | ❌ No | ✅ Yes (via tenant) | Active |
| **Clinic** | `clinic.model.postgres.js` | ❌ No | ✅ Yes (via tenant) | Active |
| **Corporate** | ❓ Missing | ❌ No | ❌ No | **Not Found** |
| **TPA** | ❓ Missing | ❌ No | ❌ No | **Not Found** |
| **PSU** | ❓ Missing | ❌ No | ❌ No | **Not Found** |
| **Insurance** | `insurancePolicy.model` | ❌ No | ✅ Yes | Partial |
| **Broker** | ❓ Missing | ❌ No | ❌ No | **Not Found** |
| **Lab** | `labTest.model.postgres.js` | ❌ No | ✅ Yes | Active |
| **Pharmacy** | `pharmacyInventory.model` | ❌ No | ✅ Yes | Active |
| **Ambulance** | ❓ Missing | ❌ No | ❌ No | **Not Found** |
| **NGO** | ❓ Missing | ❌ No | ❌ No | **Not Found** |
| **Homecare** | ❓ Missing | ❌ No | ❌ No | **Not Found** |

### 1.3 Tenant Model (Master Organization Table)

**File:** `server/models/postgres/tenant.model.postgres.js`

```javascript
type: {
  type: DataTypes.ENUM(
    'hospital',    // ✅ Implemented
    'clinic',      // ✅ Implemented
    'lab',         // ✅ Implemented
    'pharmacy',    // ✅ Implemented
    'ambulance',   // ❌ NOT Implemented
    'corporate',   // ❌ NOT Implemented
    'homecare',    // ❌ NOT Implemented
    'tpa',         // ❌ NOT Implemented
    'psu',         // ❌ NOT Implemented
    'ngo',         // ❌ NOT Implemented
    'insurer'      // ⚠️ Partial (policy model exists)
  ),
  allowNull: false
}
```

**Subdomain/Domain Support (Defined but NOT Implemented):**
```javascript
subdomain: {
  type: DataTypes.STRING(63),
  comment: 'Subdomain for tenant (e.g., apollo.mediqzy.com)'
},
custom_domain: {
  type: DataTypes.STRING(255),
  comment: 'Custom domain (e.g., health.apollohospitals.com)'
}
```

### 1.4 Hierarchical Relationships

**Current Support:** ❌ NOT Implemented

The tenant model has fields defined but no relationship logic:
- `parent_organization_id` - Field exists but NOT used
- Lab/Pharmacy part of Hospital/Clinic - NO relationship enforcement

---

## 2. Proposed Architecture (Your Vision)

### 2.1 Database-per-Tenant Strategy

**Architecture:** Separate PostgreSQL Database per Organization

```
Database Instances:
├── mediczy_platform (Master DB)
│   ├── tenants (registry of all organizations)
│   ├── users (global user registry)
│   └── cross_tenant_analytics
│
├── apollo_hospital_chennai
│   ├── doctors
│   ├── patients
│   ├── appointments
│   ├── lab_tests (if hasLab: true)
│   ├── pharmacy_inventory (if hasPharmacy: true)
│   └── ambulances (if hasAmbulance: true)
│
├── fortis_hospital_bangalore
│   ├── doctors
│   ├── appointments
│   └── ...
│
├── max_healthcare_corporate
│   ├── employees
│   ├── health_camps
│   ├── wellness_programs
│   └── ...
│
├── icici_lombard_insurance
│   ├── policies
│   ├── claims
│   └── network_providers
│
├── star_health_tpa
│   ├── claims_processing
│   ├── pre_authorization
│   └── provider_network
│
└── ... (one DB per organization)
```

### 2.2 Hierarchical Organization Structure

```javascript
// Parent-Child Relationships

Hospital (Parent)
├── Lab (Child - Department)
│   ├── pathology_lab
│   ├── radiology_lab
│   └── microbiology_lab
├── Pharmacy (Child - Department)
│   ├── inpatient_pharmacy
│   └── outpatient_pharmacy
├── Ambulance Service (Child - Department)
└── Homecare Service (Child - Department)

Clinic (Parent)
├── Lab (Child - Optional)
└── Pharmacy (Child - Optional)

Corporate (Parent)
├── Health Camps
├── Wellness Programs
├── Contracted Hospitals
└── Contracted Labs

NGO (Parent)
├── Mobile Clinics
├── Health Camps
└── Community Pharmacies

Insurance Company (Parent)
├── TPA (Third Party Administrator)
├── Network Hospitals
└── Network Labs

TPA (Can be Independent or Child of Insurance)
├── Claims Processing
└── Provider Network
```

### 2.3 Domain/Subdomain Strategy

**Level 1: Subdomain per Organization**
```
https://apollo.mediqzy.com        → Apollo Hospital Chennai
https://fortis.mediqzy.com        → Fortis Hospital Bangalore
https://max.mediqzy.com           → Max Healthcare Corporate
https://icici-lombard.mediqzy.com → ICICI Lombard Insurance
https://star-health.mediqzy.com   → Star Health TPA
```

**Level 2: Custom Domains (Enterprise)**
```
https://health.apollohospitals.com → Apollo Hospital (Custom Domain)
https://wellness.maxhealthcare.com → Max Healthcare (Custom Domain)
```

**Level 3: Department Subdomains (Hierarchical)**
```
https://lab.apollo.mediqzy.com      → Apollo Lab Services
https://pharmacy.apollo.mediqzy.com → Apollo Pharmacy
https://ambulance.apollo.mediqzy.com → Apollo Ambulance Service
```

### 2.4 Server Architecture per Tenant

**Option A: Shared Infrastructure (Cost-Effective)**
```
Single Server with Database Routing:
├── Nginx (Subdomain Router)
├── Node.js Server Pool (PM2 Cluster)
└── PostgreSQL (Multiple Databases)
```

**Option B: Dedicated Infrastructure (True Isolation)**
```
Per-Tenant Infrastructure:
apollo.mediqzy.com:
├── Dedicated Server (VM/Container)
├── Dedicated Node.js Instance
└── Dedicated PostgreSQL Database

fortis.mediqzy.com:
├── Dedicated Server (VM/Container)
├── Dedicated Node.js Instance
└── Dedicated PostgreSQL Database
```

**Option C: Hybrid (Recommended)**
```
Tier-Based:
- Enterprise Clients → Dedicated Infrastructure
- Professional/Basic → Shared Infrastructure with DB Isolation
- Free Tier → Single Database with tenant_id filtering
```

---

## 3. Implementation Gap Analysis

### 3.1 Missing Components

| Component | Current | Required | Priority | Effort |
|-----------|---------|----------|----------|--------|
| **Database Provisioning** | Single DB | DB-per-Tenant | 🔴 High | 3-4 weeks |
| **Tenant Registry** | Partial | Complete | 🔴 High | 1 week |
| **Subdomain Routing** | None | Full Support | 🔴 High | 2 weeks |
| **Corporate Entity** | Missing | Full Model | 🟡 Medium | 1 week |
| **TPA Entity** | Missing | Full Model | 🟡 Medium | 1 week |
| **PSU Entity** | Missing | Full Model | 🟡 Medium | 1 week |
| **Broker Entity** | Missing | Full Model | 🟡 Medium | 1 week |
| **Ambulance Entity** | Missing | Full Model | 🟢 Low | 1 week |
| **NGO Entity** | Missing | Full Model | 🟢 Low | 1 week |
| **Homecare Entity** | Missing | Full Model | 🟢 Low | 1 week |
| **Parent-Child Relations** | None | Hierarchical | 🔴 High | 2 weeks |
| **Data Migration Tool** | None | Required | 🔴 High | 2 weeks |

### 3.2 Current Multi-Tenant Fields

**Present in Models:**
- ✅ `organization_id` - Doctor, Lab, Pharmacy
- ✅ `tenant_id` - Device, Health Camp
- ❌ Missing in User, Appointment (uses doctor's org_id)

**Issues:**
1. Inconsistent field naming (`organization_id` vs `tenant_id`)
2. No foreign key constraints to tenant table
3. No cascade delete/update policies
4. No tenant isolation middleware

---

## 4. Recommended Implementation Plan

### Phase 1: Foundation (Weeks 1-4)

**Week 1: Complete Tenant Registry**
```javascript
// Enhanced Tenant Model
✅ Add parent_organization_id relationship
✅ Add department_type field
✅ Add is_independent flag
✅ Implement cascade rules
```

**Week 2: Create Missing Entity Models**
```javascript
✅ Corporate Model
✅ TPA Model
✅ PSU Model
✅ Broker Model
✅ Ambulance Model
✅ NGO Model
✅ Homecare Model
```

**Week 3: Implement Subdomain Routing**
```javascript
// Nginx Configuration
server {
    server_name ~^(?<tenant>.+)\.mediqzy\.com$;
    location / {
        proxy_pass http://backend;
        proxy_set_header X-Tenant-Slug $tenant;
    }
}

// Express Middleware
app.use(async (req, res, next) => {
    const tenantSlug = req.headers['x-tenant-slug'];
    const tenant = await Tenant.findOne({ where: { slug: tenantSlug }});
    req.tenant = tenant;
    next();
});
```

**Week 4: Database Isolation Middleware**
```javascript
// Sequelize Dynamic Connection
const getTenantConnection = (tenantId) => {
    return new Sequelize({
        database: `mediczy_tenant_${tenantId}`,
        // ... connection details
    });
};
```

### Phase 2: Database Per Tenant (Weeks 5-8)

**Week 5-6: Database Provisioning System**
```javascript
// Auto-provision database on tenant creation
async function createTenantDatabase(tenant) {
    // 1. Create PostgreSQL database
    await adminClient.query(`CREATE DATABASE mediczy_tenant_${tenant.id}`);
    
    // 2. Run migrations
    await runMigrations(`mediczy_tenant_${tenant.id}`);
    
    // 3. Seed initial data
    await seedTenantData(tenant);
    
    // 4. Update tenant record
    tenant.database_name = `mediczy_tenant_${tenant.id}`;
    await tenant.save();
}
```

**Week 7: Data Migration Tool**
```javascript
// Migrate existing data to tenant databases
async function migrateToTenantDB(tenantId) {
    const tenant = await Tenant.findByPk(tenantId);
    const sourceDB = sharedSequelize;
    const targetDB = getTenantConnection(tenantId);
    
    // Migrate doctors
    const doctors = await sourceDB.Doctor.findAll({
        where: { organization_id: tenantId }
    });
    await targetDB.Doctor.bulkCreate(doctors);
    
    // Migrate appointments, etc.
    // ...
}
```

**Week 8: Testing & Validation**

### Phase 3: Hierarchical Relationships (Weeks 9-10)

**Department Management**
```javascript
// Tenant Model Enhancement
{
    parent_organization_id: {
        type: DataTypes.INTEGER,
        references: { model: 'tenants', key: 'id' }
    },
    department_type: {
        type: DataTypes.ENUM('lab', 'pharmacy', 'ambulance', 'homecare'),
        allowNull: true
    },
    is_independent: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}

// Relationships
Tenant.hasMany(Tenant, { as: 'departments', foreignKey: 'parent_organization_id' });
Tenant.belongsTo(Tenant, { as: 'parent', foreignKey: 'parent_organization_id' });
```

### Phase 4: Advanced Features (Weeks 11-12)

- ✅ Cross-tenant analytics
- ✅ Data sharing agreements
- ✅ Inter-organization referrals
- ✅ Network provider management
- ✅ Custom domain SSL provisioning

---

## 5. Database Schema Recommendations

### 5.1 Master Platform Database

```sql
-- mediczy_platform DB
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    uid UUID UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    subdomain VARCHAR(63) UNIQUE,
    custom_domain VARCHAR(255) UNIQUE,
    database_name VARCHAR(100) UNIQUE, -- 'mediczy_tenant_123'
    parent_organization_id INT REFERENCES tenants(id),
    department_type VARCHAR(50),
    is_independent BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE global_users (
    id SERIAL PRIMARY KEY,
    uid UUID UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    primary_tenant_id INT REFERENCES tenants(id),
    tenant_access JSONB, -- { "123": "admin", "456": "doctor" }
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tenant_access (
    user_id INT REFERENCES global_users(id),
    tenant_id INT REFERENCES tenants(id),
    role VARCHAR(50) NOT NULL,
    granted_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);
```

### 5.2 Tenant-Specific Database Template

```sql
-- mediczy_tenant_{id} DB
CREATE TABLE local_users (
    id SERIAL PRIMARY KEY,
    global_user_id INT, -- Reference to platform.global_users
    role VARCHAR(50),
    department_id INT,
    metadata JSONB
);

CREATE TABLE doctors (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES local_users(id),
    specialization VARCHAR(100),
    -- No organization_id needed (isolated DB)
);

CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    doctor_id INT REFERENCES doctors(id),
    patient_id INT REFERENCES local_users(id),
    -- No tenant_id needed (isolated DB)
);

-- Conditional tables based on tenant features
CREATE TABLE lab_tests (...);      -- If tenant.features.lab = true
CREATE TABLE pharmacy_stock (...);  -- If tenant.features.pharmacy = true
CREATE TABLE ambulances (...);      -- If tenant.features.ambulance = true
```

---

## 6. Nginx Configuration Example

```nginx
# /etc/nginx/sites-available/mediczy-multi-tenant

# Wildcard subdomain handler
server {
    listen 80;
    listen 443 ssl http2;
    server_name ~^(?<tenant_slug>[^.]+)\.mediqzy\.com$;

    ssl_certificate /etc/letsencrypt/live/mediqzy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mediqzy.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-Slug $tenant_slug;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Custom domain handler
server {
    listen 80;
    listen 443 ssl http2;
    server_name health.apollohospitals.com;

    ssl_certificate /etc/letsencrypt/live/apollohospitals.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/apollohospitals.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Custom-Domain $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 7. Code Migration Examples

### 7.1 Current Approach (Shared DB)

```javascript
// Current: Filter by organization_id
const doctors = await Doctor.findAll({
    where: { organization_id: req.organizationId }
});
```

### 7.2 Proposed Approach (Tenant DB)

```javascript
// Proposed: Use tenant-specific connection
const tenantDB = getTenantConnection(req.tenant.id);
const doctors = await tenantDB.Doctor.findAll({
    // No organization_id filter needed!
});
```

### 7.3 Hierarchical Query

```javascript
// Get all departments of a hospital
const hospital = await Tenant.findByPk(hospitalId, {
    include: [{
        model: Tenant,
        as: 'departments',
        where: { status: 'active' }
    }]
});

// Result:
{
    id: 123,
    name: "Apollo Hospital Chennai",
    type: "hospital",
    departments: [
        { id: 124, name: "Apollo Lab", department_type: "lab" },
        { id: 125, name: "Apollo Pharmacy", department_type: "pharmacy" },
        { id: 126, name: "Apollo Ambulance", department_type: "ambulance" }
    ]
}
```

---

## 8. Cost & Performance Analysis

### 8.1 Current Architecture (Single DB)

**Pros:**
- ✅ Low infrastructure cost
- ✅ Simple deployment
- ✅ Easy cross-tenant queries
- ✅ Centralized backups

**Cons:**
- ❌ No data isolation
- ❌ Security risks
- ❌ Scalability limits
- ❌ All tenants share resources
- ❌ One tenant's load affects all

### 8.2 Proposed Architecture (DB-per-Tenant)

**Pros:**
- ✅ Complete data isolation
- ✅ Better security
- ✅ Independent scaling
- ✅ Custom configurations per tenant
- ✅ Easy tenant offboarding

**Cons:**
- ❌ Higher infrastructure cost
- ❌ Complex cross-tenant queries
- ❌ More backup overhead
- ❌ More complex deployment

### 8.3 Cost Estimate

**Single Database (Current):**
- PostgreSQL: 1 instance = $50/month
- Server: 1 instance = $100/month
- **Total: $150/month**

**DB-per-Tenant (100 tenants):**
- PostgreSQL: Shared instance with 100 DBs = $500/month
- Server: Load-balanced cluster = $500/month
- Storage: 100GB @ $10/GB = $1000/month
- **Total: $2000/month**

---

## 9. Recommended Hybrid Approach

### Tier 1: Free/Basic (Single DB)
- Shared database
- Column-based isolation
- Subdomain: `{slug}.mediqzy.com`
- Shared resources

### Tier 2: Professional (DB Isolation)
- Dedicated database
- Shared infrastructure
- Subdomain + SSL
- Resource limits enforced

### Tier 3: Enterprise (Full Isolation)
- Dedicated database
- Dedicated server instance
- Custom domain + SSL
- Unlimited resources

---

## 10. Implementation Priority

### Immediate (Week 1-2)
1. ✅ Complete tenant model with all entity types
2. ✅ Create missing entity models (Corporate, TPA, PSU, etc.)
3. ✅ Implement subdomain routing in Nginx

### Short-term (Week 3-6)
1. ✅ Database provisioning automation
2. ✅ Tenant isolation middleware
3. ✅ Parent-child relationship implementation

### Medium-term (Week 7-10)
1. ✅ Data migration from shared to tenant DBs
2. ✅ Department management system
3. ✅ Cross-tenant analytics

### Long-term (Week 11-12)
1. ✅ Custom domain SSL automation
2. ✅ Tenant self-service portal
3. ✅ Advanced networking features

---

## 11. Next Steps

### Action Items

**Immediate:**
1. Review this architecture with stakeholders
2. Decide on hybrid vs. full isolation approach
3. Estimate budget for infrastructure scaling
4. Create detailed technical specifications

**Short-term:**
1. Set up development environment for multi-tenant testing
2. Create proof-of-concept with 3 tenant databases
3. Test subdomain routing
4. Benchmark performance

**Documentation:**
1. API documentation for tenant management
2. Deployment guide for new tenants
3. Migration guide for existing data
4. Developer handbook for multi-tenant development

---

## Conclusion

**Current State:** Basic multi-tenancy with shared database and column-based isolation

**Proposed State:** Full multi-tenancy with:
- ✅ Database-per-tenant
- ✅ Server instances per tier
- ✅ Subdomain/custom domain support
- ✅ Hierarchical organization structure

**Recommendation:** Implement **Hybrid Approach** with tiered isolation based on subscription level.

**Timeline:** 12 weeks for complete implementation
**Cost Impact:** $150/month → $2000/month (for 100 tenants)
**ROI:** Better security, scalability, and enterprise readiness

---

**Document Version:** 1.0  
**Last Updated:** January 14, 2026  
**Author:** System Architecture Team
