# 🏥 Multi-Tenant Module-Based Licensing Architecture
## Mediczy Healthcare Platform

**Model:** On-Premise/Cloud Hybrid with Module-Based Licensing  
**Deployment:** Multiple Organizations, Single Admin Control  
**Architecture:** Multi-Tenant with Data Isolation  

---

## 📋 Executive Summary

### What This Enables:

✅ **Single Platform** → Multiple Organizations  
✅ **Single Admin** → Controls All Tenants  
✅ **Module-Based Licensing** → Pay Only for What You Use  
✅ **Data Isolation** → Complete Security per Organization  
✅ **Scalable** → Add/Remove Organizations Dynamically  
✅ **Not SaaS** → On-Premise or Dedicated Cloud Deployment  

---

## 🏗️ Architecture Overview

### Deployment Model:

```
                         ┌─────────────────────────────────┐
                         │   SINGLE ADMIN CONTROL PANEL    │
                         │  (Super Admin Dashboard)        │
                         └─────────────────────────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
        ┌─────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
        │   HOSPITAL A     │ │   HOSPITAL B    │ │   HOSPITAL C    │
        │  (Tenant ID: H1) │ │ (Tenant ID: H2) │ │ (Tenant ID: H3) │
        │                  │ │                 │ │                 │
        │  Modules:        │ │  Modules:       │ │  Modules:       │
        │  ✓ OPD          │ │  ✓ OPD         │ │  ✓ OPD         │
        │  ✓ IPD          │ │  ✓ IPD         │ │  ✓ Pharmacy    │
        │  ✓ Billing      │ │  ✗ Pharmacy    │ │  ✗ Lab         │
        │  ✗ Pharmacy     │ │  ✗ Lab         │ │  ✗ Imaging     │
        └──────────────────┘ └─────────────────┘ └─────────────────┘

        ┌──────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │    CLINIC A      │ │   CORPORATE A   │ │   PHARMACY A    │
        │ (Tenant ID: C1)  │ │ (Tenant ID: R1) │ │ (Tenant ID: P1) │
        └──────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 🎯 Module-Based Licensing Structure

### Available Modules:

#### 1. **Hospital Modules**
- 📋 **OPD Management** - Outpatient Department
- 🏨 **IPD Management** - Inpatient Department
- 💊 **Pharmacy Integration**
- 🧪 **Laboratory Management**
- 🩺 **Radiology/Imaging**
- 💰 **Billing & Accounting**
- 🏥 **Bed Management**
- 📊 **MRD (Medical Records)**
- 📝 **EHR (Electronic Health Records)**
- 🚑 **Emergency Management**
- 👨‍⚕️ **Doctor Management**
- 👩‍⚕️ **Nurse Management**

#### 2. **Clinic Modules**
- 📅 **Appointment Management**
- 👥 **Patient Management**
- 📋 **Consultation Records**
- 💊 **Prescription Management**
- 💰 **Billing**
- 🧪 **Lab Integration**
- 💊 **Pharmacy Integration**
- 📊 **Reports & Analytics**

#### 3. **Corporate Modules**
- 👥 **Employee Health Management**
- 📊 **Health Analytics Dashboard**
- 🎯 **Risk Monitoring**
- 📋 **Benefits Administration**
- 💳 **Claims Management**
- 📈 **Department-wise Analytics**
- 📝 **Compliance Tracking**

#### 4. **Lab Modules**
- 🧪 **Test Management**
- 📊 **Sample Tracking**
- 📝 **Result Entry**
- 🔬 **Equipment Management**
- 💰 **Billing**
- 📈 **Quality Control**

#### 5. **Pharmacy Modules**
- 💊 **Inventory Management**
- 📦 **Stock Control**
- 💰 **Billing & Sales**
- 📋 **Prescription Verification**
- 📊 **Expiry Management**
- 🚚 **Supplier Management**

#### 6. **Homecare Modules**
- 🏠 **Service Scheduling**
- 👨‍⚕️ **Staff Management**
- 📋 **Patient Care Plans**
- 💰 **Billing**
- 📊 **Visit Tracking**

#### 7. **Ambulance Modules**
- 🚑 **Fleet Management**
- 📞 **Emergency Dispatch**
- 🗺️ **GPS Tracking**
- 👨‍⚕️ **EMT Management**
- 💰 **Billing**
- 📊 **Trip Analytics**

---

## 💾 Database Architecture

### Multi-Tenant Data Isolation Strategy:

#### **Option 1: Shared Database with Tenant ID (RECOMMENDED)**

```sql
-- Every table has organization_id
CREATE TABLE appointments (
    id BIGINT PRIMARY KEY,
    organization_id VARCHAR(50) NOT NULL,  -- Tenant identifier
    organization_type ENUM('hospital', 'clinic', 'corporate', 'lab', 'pharmacy'),
    patient_id BIGINT,
    doctor_id BIGINT,
    appointment_date DATE,
    -- ... other fields
    INDEX idx_org (organization_id),
    INDEX idx_org_type (organization_id, organization_type)
);

-- Row-Level Security
CREATE POLICY tenant_isolation ON appointments
    USING (organization_id = current_setting('app.current_tenant')::VARCHAR);
```

**Pros:**
- ✅ Cost-effective
- ✅ Easy maintenance
- ✅ Easy cross-tenant reporting for admin
- ✅ Simple backups

**Cons:**
- ⚠️ Requires strict access control
- ⚠️ Query complexity increases

---

#### **Option 2: Schema-Per-Tenant**

```sql
-- Each organization gets its own schema
CREATE SCHEMA hospital_h001;
CREATE SCHEMA hospital_h002;
CREATE SCHEMA clinic_c001;

-- Same table structure in each schema
CREATE TABLE hospital_h001.appointments (...);
CREATE TABLE hospital_h002.appointments (...);
CREATE TABLE clinic_c001.appointments (...);
```

**Pros:**
- ✅ Complete data isolation
- ✅ Easy to backup per tenant
- ✅ Can customize schema per tenant

**Cons:**
- ⚠️ More complex maintenance
- ⚠️ Migrations need to run on all schemas

---

#### **Option 3: Database-Per-Tenant**

```
- mediczy_hospital_h001
- mediczy_hospital_h002
- mediczy_clinic_c001
- mediczy_corporate_r001
```

**Pros:**
- ✅ Complete isolation
- ✅ Easy to move tenants
- ✅ Performance isolation

**Cons:**
- ⚠️ Higher infrastructure cost
- ⚠️ Complex cross-tenant reporting

---

## 🔐 Security & Access Control

### Organization Hierarchy:

```javascript
// Organization Structure
{
  organization_id: "H001",
  organization_type: "hospital",
  organization_name: "Apollo Hospitals",
  tenant_code: "APOLLO-BLR-001",
  
  // License Information
  license: {
    plan: "enterprise",
    modules: [
      { name: "opd", enabled: true, expires: "2026-12-31" },
      { name: "ipd", enabled: true, expires: "2026-12-31" },
      { name: "pharmacy", enabled: true, expires: "2026-12-31" },
      { name: "laboratory", enabled: false, expires: null },
      { name: "billing", enabled: true, expires: "2026-12-31" }
    ],
    users_limit: 500,
    storage_limit_gb: 1000,
    api_calls_limit: 1000000
  },
  
  // Access Control
  subdomain: "apollo-blr.mediczy.com", // Optional
  custom_domain: "ehr.apollohospitals.com", // Optional
  
  // Data Residency
  data_region: "IN-BLR",
  backup_region: "IN-MUM"
}
```

---

### User Access Control:

```javascript
// User with Organization Context
{
  user_id: "U12345",
  email: "doctor@apollo.com",
  role: "doctor",
  
  // Organization Context
  organization_id: "H001",
  organization_type: "hospital",
  
  // Module Permissions
  permissions: {
    opd: ["read", "write", "delete"],
    ipd: ["read", "write"],
    pharmacy: ["read"],
    billing: ["read", "write"]
  },
  
  // Department/Branch
  department_id: "D001",
  branch_id: "B001"
}
```

---

## 🎫 Licensing Models

### **Model 1: Module-Based (RECOMMENDED)**

```javascript
// Hospital License
{
  organization_id: "H001",
  license_type: "module_based",
  
  modules: [
    {
      module: "opd_management",
      status: "active",
      price: 5000,  // per month
      users: 50,
      starts: "2025-01-01",
      expires: "2026-01-01"
    },
    {
      module: "ipd_management",
      status: "active",
      price: 8000,
      users: 100,
      starts: "2025-01-01",
      expires: "2026-01-01"
    },
    {
      module: "pharmacy",
      status: "trial",  // 30-day trial
      price: 3000,
      users: 20,
      starts: "2025-12-01",
      expires: "2025-12-31"
    }
  ],
  
  total_monthly_cost: 16000,
  payment_status: "paid",
  payment_method: "annual_upfront"
}
```

---

### **Model 2: User-Based Licensing**

```javascript
{
  organization_id: "C001",
  license_type: "user_based",
  
  tiers: [
    {
      tier: "doctor",
      count: 10,
      price_per_user: 500,
      total: 5000
    },
    {
      tier: "nurse",
      count: 20,
      price_per_user: 200,
      total: 4000
    },
    {
      tier: "receptionist",
      count: 5,
      price_per_user: 100,
      total: 500
    }
  ],
  
  total_monthly_cost: 9500,
  overage_charge: 150  // per extra user
}
```

---

### **Model 3: Bed-Based (Hospitals)**

```javascript
{
  organization_id: "H002",
  license_type: "bed_based",
  
  total_beds: 200,
  price_per_bed: 100,  // per month
  total_monthly_cost: 20000,
  
  included_modules: ["opd", "ipd", "pharmacy", "lab", "billing"],
  
  addons: [
    {
      module: "ambulance",
      price: 2000
    }
  ]
}
```

---

### **Model 4: Transaction-Based**

```javascript
{
  organization_id: "L001",
  license_type: "transaction_based",
  
  pricing: {
    per_test: 2,  // ₹2 per test
    per_report: 5,  // ₹5 per report
    per_consultation: 10  // ₹10 per consultation
  },
  
  monthly_cap: 50000,  // Max ₹50,000 per month
  
  usage_this_month: {
    tests: 2500,
    reports: 1000,
    consultations: 800,
    total_cost: 18000
  }
}
```

---

## 🚀 Implementation Architecture

### Backend Structure:

```javascript
// Middleware: Organization Context
export const organizationMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Extract organization context
    req.organization = {
      id: decoded.organization_id,
      type: decoded.organization_type,
      modules: decoded.licensed_modules
    };
    
    // Set database context for row-level security
    await sequelize.query(
      `SET app.current_tenant = '${decoded.organization_id}'`
    );
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid organization context' });
  }
};

// Module Access Control
export const requireModule = (moduleName) => {
  return (req, res, next) => {
    const hasAccess = req.organization.modules.includes(moduleName);
    
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Module not licensed',
        module: moduleName,
        message: `Your organization doesn't have access to ${moduleName} module`
      });
    }
    
    next();
  };
};

// Usage in routes
app.get(
  '/api/pharmacy/inventory',
  authMiddleware,
  organizationMiddleware,
  requireModule('pharmacy'),
  getPharmacyInventory
);
```

---

### Frontend Structure:

```typescript
// Organization Context Hook
export const useOrganization = () => {
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const decoded = jwtDecode(token);
      return {
        id: decoded.organization_id,
        type: decoded.organization_type,
        name: decoded.organization_name,
        modules: decoded.licensed_modules
      };
    }
  });
  
  return organization.data;
};

// Module Access Component
export const ModuleGuard = ({ module, children }) => {
  const organization = useOrganization();
  
  if (!organization?.modules.includes(module)) {
    return (
      <div className="p-6 text-center">
        <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold">Module Not Licensed</h3>
        <p className="text-muted-foreground">
          Contact admin to enable {module} module
        </p>
        <Button onClick={contactAdmin}>Request Access</Button>
      </div>
    );
  }
  
  return children;
};

// Usage
<ModuleGuard module="pharmacy">
  <PharmacyInventoryPage />
</ModuleGuard>
```

---

## 📊 Admin Control Panel Features

### Super Admin Dashboard:

```typescript
// Features:
1. Organization Management
   - Add/Remove Organizations
   - Enable/Disable Modules
   - Set License Expiry
   - View Usage Statistics

2. License Management
   - Module Activation/Deactivation
   - License Renewal
   - Trial Periods
   - Payment Tracking

3. Usage Monitoring
   - Per-Organization Metrics
   - Module-wise Usage
   - Storage Consumption
   - API Call Tracking

4. Billing & Invoicing
   - Generate Invoices
   - Payment Collection
   - Usage-based Billing
   - Subscription Management

5. System Health
   - Database Performance per Tenant
   - Module Availability
   - Error Tracking
   - Backup Status
```

---

## 💰 Pricing Example (Indian Market)

### Hospital (200 Beds):

| Module | Monthly Cost | Annual Cost | Users |
|--------|-------------|-------------|-------|
| OPD Management | ₹8,000 | ₹96,000 | 50 |
| IPD Management | ₹12,000 | ₹1,44,000 | 100 |
| Pharmacy | ₹5,000 | ₹60,000 | 20 |
| Laboratory | ₹6,000 | ₹72,000 | 30 |
| Billing | ₹4,000 | ₹48,000 | 25 |
| MRD/EHR | ₹7,000 | ₹84,000 | 40 |
| **TOTAL** | **₹42,000** | **₹5,04,000** | **265** |

**Annual Savings:** 15% discount = **₹4,28,400**

---

### Clinic (10 Doctors):

| Module | Monthly Cost | Annual Cost |
|--------|-------------|-------------|
| Appointments | ₹2,000 | ₹24,000 |
| Consultation | ₹3,000 | ₹36,000 |
| Billing | ₹1,500 | ₹18,000 |
| **TOTAL** | **₹6,500** | **₹78,000** |

---

### Corporate (1000 Employees):

| Module | Monthly Cost | Annual Cost |
|--------|-------------|-------------|
| Employee Health | ₹15,000 | ₹1,80,000 |
| Benefits Admin | ₹8,000 | ₹96,000 |
| Claims Processing | ₹10,000 | ₹1,20,000 |
| Analytics | ₹5,000 | ₹60,000 |
| **TOTAL** | **₹38,000** | **₹4,56,000** |

---

## 🔄 Deployment Options

### **Option 1: On-Premise (Recommended for Healthcare)**

```
Customer's Infrastructure:
- Physical/Virtual Servers
- Customer's Database
- Customer's Network
- Full Control & Compliance
- One-time setup cost + Annual AMC
```

**Benefits:**
- ✅ Complete data control
- ✅ HIPAA/ABDM Compliance
- ✅ No recurring cloud costs
- ✅ Custom integrations

---

### **Option 2: Dedicated Cloud**

```
Dedicated AWS/Azure/GCP Instance:
- Dedicated VPC
- Dedicated Database
- Isolated Environment
- Managed by Mediczy Team
```

**Benefits:**
- ✅ No infrastructure management
- ✅ Automatic backups
- ✅ Scalability
- ✅ 99.9% uptime SLA

---

### **Option 3: Hybrid**

```
Critical Data: On-Premise
Analytics/Reporting: Cloud
Backup: Cloud
AI/ML: Cloud
```

---

## 📋 Implementation Checklist

### Phase 1: Database Multi-Tenancy
- [ ] Add `organization_id` to all tables
- [ ] Implement row-level security
- [ ] Create organization management tables
- [ ] Setup license tracking system

### Phase 2: Backend Changes
- [ ] Organization middleware
- [ ] Module access control
- [ ] License validation APIs
- [ ] Usage tracking system

### Phase 3: Frontend Changes
- [ ] Organization context provider
- [ ] Module guards
- [ ] License UI components
- [ ] Billing dashboard

### Phase 4: Admin Panel
- [ ] Organization CRUD
- [ ] Module management
- [ ] License management
- [ ] Billing system

### Phase 5: Testing
- [ ] Multi-tenant data isolation tests
- [ ] Module access control tests
- [ ] License expiry tests
- [ ] Performance tests

---

## 🎯 Key Advantages Over SaaS

| Feature | SaaS Model | Licensing Model (Mediczy) |
|---------|-----------|---------------------------|
| **Data Location** | Shared cloud | Customer premises |
| **Compliance** | Provider responsibility | Customer control |
| **Customization** | Limited | Full control |
| **Cost** | Monthly subscription | One-time + AMC |
| **Internet Dependency** | Required always | Only for updates |
| **Data Ownership** | Provider owns | Customer owns |
| **Vendor Lock-in** | High | Low |

---

## 📞 Next Steps

1. **Confirm Database Strategy** - Choose Option 1, 2, or 3
2. **Define License Structure** - Which modules per org type?
3. **Setup Admin Panel** - Organization & license management
4. **Implement Data Isolation** - Add org_id to all tables
5. **Module Guards** - Frontend & backend access control
6. **Billing System** - Track usage, generate invoices
7. **Pilot Deployment** - Test with 2-3 organizations

---

**Status:** Architecture Complete ✅  
**Ready for:** Implementation Phase  
**Timeline:** 4-6 weeks for full implementation

