# ✅ ORGANIZATIONAL HIERARCHY SETUP - MAYDEN

**Date**: February 8, 2026  
**Status**: 🎉 **COMPLETE**

---

## 📊 Hierarchical Structure Created

```
┌─────────────────────────────────┐
│ TIER 1: AGGREGATOR              │
│ ────────────────────────────    │
│ Name: Mayden                    │
│ ID: 2                           │
│ Type: Insurance Broker          │
│ Email: admin@mayden.com         │
│ Phone: +91-9876543210          │
│ License: MAYDEN-BROKER-001      │
│ Commission: 8.50%               │
│ Status: Active ✅               │
│ Verified: Yes ✅                │
└──────────────┬──────────────────┘
               │
               │ (aggregator_id = 2)
               │
┌──────────────▼──────────────────┐
│ TIER 2: CORPORATE               │
│ ────────────────────────────    │
│ Name: My SmartHealth            │
│ ID: 4                           │
│ Tenant ID: 7                    │
│ Aggregator: Mayden (ID: 2)      │
│ Email: info@mysmarthealth.in    │
│ Status: Active ✅               │
│ Tenant: my-smarthealth          │
│ Plan: Enterprise                │
└─────────────────────────────────┘
```

---

## 🗄️ Database Records Created/Updated

### 1. Aggregator Created (insurance_brokers table)

**Record Details:**
```sql
INSERT INTO insurance_brokers (...)
VALUES (
  broker_name: 'Mayden',
  contact_person_name: 'Mayden Admin',
  email: 'admin@mayden.com',
  phone_number: '+91-9876543210',
  irdai_license_number: 'MAYDEN-BROKER-001',
  business_type: 'corporate',
  office_address: '123 Business Plaza',
  city: 'Bangalore',
  state: 'Karnataka',
  pincode: '560001',
  commission_percentage: 8.50,
  status: 'active',
  is_verified: true
);
```

**Result:**
- ID: `2`
- Status: ✅ **CREATED**

### 2. Tenant Created (tenants table)

**Record Details:**
```sql
INSERT INTO tenants (...)
VALUES (
  name: 'My SmartHealth',
  slug: 'my-smarthealth',
  subdomain: 'my-smarthealth',
  type: 'corporate',
  email: 'contact@mysmarthoalth.com',
  phone: '+91-9999999999',
  website: 'https://mysmarthoalth.com',
  plan: 'enterprise',
  status: 'active',
  is_verified: true
);
```

**Query Result:**
```
ID: 7
Name: My SmartHealth
Slug: my-smarthealth
Type: corporate
Plan: enterprise
Status: active
Verified: true
```

**Status:** ⚠️ **ALREADY EXISTED** (reused)

### 3. Corporate Updated (corporates table)

**Update Query:**
```sql
UPDATE corporates 
SET 
  aggregator_id = 2,          -- Links to Mayden
  aggregator_type = 'broker',
  tenant_id = 7,              -- Links to tenant
  status = 'Active'
WHERE id = 4;
```

**Before:**
```
id: 4
companyName: My SmartHealth
email: info@mysmarthealth.in
aggregator_id: NULL (was not set)
tenant_id: NULL (was not set)
status: Active
```

**After:**
```
id: 4
companyName: My SmartHealth
email: info@mysmarthealth.in
aggregator_id: 2 ✅ (linked to Mayden)
tenant_id: 7 ✅ (linked to tenant)
status: Active
```

**Status:** ✅ **UPDATED**

---

## 🔗 Relationships Established

### Mayden Aggregator
```
Mayden (insurance_brokers.id = 2)
  └─ Referenced by:
     • corporates.aggregator_id = 2
     • hospitals.aggregator_id = 2 (can be used)
     • labs.aggregator_id = 2 (can be used)
     • pharmacies.aggregator_id = 2 (can be used)
     • ambulances.aggregator_id = 2 (can be used)
     • homecare_providers.aggregator_id = 2 (can be used)
```

### My SmartHealth Corporate
```
My SmartHealth (corporates.id = 4)
  ├─ Tenant: my-smarthealth (tenants.id = 7)
  ├─ Aggregator: Mayden (aggregator_id = 2)
  ├─ Status: Active
  └─ Type: Corporate (Tier 2 in hierarchy)
```

---

## 📋 Organizational Hierarchy Levels

### Level 1: Aggregator (Mayden)
- **Table**: insurance_brokers
- **ID**: 2
- **Key Fields**:
  - `broker_name`: 'Mayden'
  - `commission_percentage`: 8.50
  - `status`: 'active'
  - `is_verified`: true
  - `irdai_license_number`: 'MAYDEN-BROKER-001'

### Level 2: Corporate (My SmartHealth)
- **Table**: corporates
- **ID**: 4
- **Key Fields**:
  - `companyName`: 'My SmartHealth'
  - `aggregator_id`: 2 (linked to Mayden)
  - `tenant_id`: 7 (linked to My SmartHealth tenant)
  - `status`: 'Active'
  - `email`: 'info@mysmarthealth.in'

### Level 3: Employees (To Be Created)
- **Table**: users + corporate_employees
- **Data**: Not yet created (can be added via `/api/corporates/4/employees`)
- **Employees will have**:
  - `corporate_id`: 4 (link to My SmartHealth)
  - `tenant_id`: 7 (link to My SmartHealth tenant)
  - `aggregator_id`: 2 (inherited from corporate)

### Level 2B: Wellness Partners (To Be Added)
- **Table**: aggregator_wellness_network + partner tables
- **Partners accessible by Mayden**: hospitals, labs, pharmacies, ambulances, homecare
- **Data**: Not yet created (can be added via `/api/aggregators/wellness-partners`)

---

## 🌐 API Access Points

### For Mayden Aggregator Admin
```
GET  /api/aggregators/profile
     └─ Returns: Mayden profile + network stats

GET  /api/aggregators/corporates
     └─ Returns: [My SmartHealth, ...other corporates]

GET  /api/aggregators/wellness-partners
     └─ Returns: [List of wellness partners managed by Mayden]

POST /api/aggregators/wellness-partners
     └─ Action: Add new wellness partner to Mayden's network

GET  /api/aggregators/network-statistics
     └─ Returns: Analytics dashboard for Mayden

GET  /api/aggregators/action-logs
     └─ Returns: Audit trail of Mayden's operations
```

### For My SmartHealth Corporate Admin
```
GET  /api/corporates/4/employees
     └─ Returns: [List of employees under My SmartHealth]

GET  /api/corporates/4/wellness-partners
     └─ Returns: [Wellness partners accessible to My SmartHealth]
              (from both tenant_partners + aggregator_id path)
```

### For My SmartHealth Employees
```
GET  /api/corporate/my-profile
     └─ Returns: Current employee's profile + corporate info

GET  /api/corporate/dashboard
     └─ Returns: Corporate dashboard with services
```

---

## 🔐 Access Control (Ring-Fencing)

### Mayden (Aggregator Admin) Can Access:
- ✅ Own profile and statistics
- ✅ Manage corporate clients (create, read, update, delete)
- ✅ Manage wellness network (add partners, track commissions)
- ✅ View action logs and audit trails
- ✅ View network analytics and KPIs

### One-Way Restrictions:
- ❌ Cannot see other aggregators' data
- ❌ Cannot directly modify corporate data (only view/manage)
- ❌ Cannot access wellness partners not in network

### My SmartHealth (Corporate) Can Access:
- ✅ Own corporate profile
- ✅ Employee management
- ✅ Aggregator's wellness partners
- ✅ Book appointments/services through Mayden's network

### My SmartHealth Employees Can Access:
- ✅ Own profile
- ✅ Corporate benefits/services
- ✅ Book appointments with wellness partners
- ✅ View prescriptions, health records

---

## 📊 Data Summary

### Created/Updated Records:
| Component | ID | Name | Status |
|-----------|----|----|--------|
| Aggregator | 2 | Mayden | ✅ Created |
| Corporate | 4 | My SmartHealth | ✅ Updated (linked) |
| Tenant | 7 | My SmartHealth | ⚠️ Already existed |

### Relationships Established:
| Relationship | From | To | Field |
|--------------|------|-----|-------|
| Corporate → Aggregator | Corporate #4 | Aggregator #2 | `aggregator_id` |
| Corporate → Tenant | Corporate #4 | Tenant #7 | `tenant_id` |
| Aggregator → Partners | Aggregator #2 | Hospitals/Labs/etc | `aggregator_id` (optional) |

---

## ✨ Next Steps

### Immediate:
1. ✅ **Mayden Aggregator Created** - Ready to manage corporate clients
2. ✅ **My SmartHealth Corporate Linked** - Ready to onboard employees
3. ⏭️ **Add Wellness Partners** - Add hospitals, labs, pharmacies to Mayden's network
   ```
   POST /api/aggregators/wellness-partners
   {
     "wellnessProviderType": "hospital",
     "wellnessProviderId": 1,
     "commissionPercentage": 5.5
   }
   ```

### Short Term:
4. ⏭️ **Create Employees** - Add employees to My SmartHealth
   ```
   POST /api/employees
   {
     "corporate_id": 4,
     "name": "John Doe",
     "email": "john@mysmarthoalth.in",
     "department": "IT"
   }
   ```

5. ⏭️ **Configure Wellness Network** - Set up service categories, commissions, coverage areas
6. ⏭️ **Create Admin Users** - Set up Mayden and My SmartHealth admins

### Medium Term:
7. ⏭️ **Dashboard Implementation** - Create UI for aggregator and corporate admins
8. ⏭️ **Reporting & Analytics** - Generate performance reports
9. ⏭️ **Provider Onboarding** - Add wellness providers to network

---

## 📝 SQL Verification Queries

### Verify Mayden Aggregator
```sql
SELECT id, broker_name, email, status, is_verified, commission_percentage
FROM insurance_brokers 
WHERE id = 2;
```

### Verify My SmartHealth Corporate
```sql
SELECT id, "companyName", aggregator_id, tenant_id, status, email
FROM corporates 
WHERE id = 4;
```

### Verify Relationship
```sql
SELECT 
  ib.id as aggregator_id,
  ib.broker_name,
  c.id as corporate_id,
  c."companyName",
  c.aggregator_id as linked_to
FROM insurance_brokers ib
LEFT JOIN corporates c ON c.aggregator_id = ib.id
WHERE ib.id = 2;
```

### Count Corporates under Mayden
```sql
SELECT COUNT(*) as corporate_count
FROM corporates 
WHERE aggregator_id = 2;
```

---

## 🎯 Organizational Hierarchy Complete

```
┌────────────────────────────────────────────────────┐
│                   MEDICZY PLATFORM                 │
├────────────────────────────────────────────────────┤
│                                                    │
│   MAYDEN (Aggregator/Broker)                      │
│   ├──► Commission: 8.50%                          │
│   ├──► Status: Active ✅                          │
│   ├──► License: MAYDEN-BROKER-001                 │
│   │                                                │
│   └─────► MY SMARTHEALTH (Corporate)              │
│           ├──► Tenant: my-smarthealth             │
│           ├──► Plan: Enterprise                   │
│           ├──► Status: Active ✅                  │
│           │                                        │
│           └─────► EMPLOYEES (Tier 3)              │
│                   └──► (To be added)              │
│                                                    │
│   Networks:                                        │
│   ├──► Wellness Partners (To be configured)       │
│       ├──► Hospitals                              │
│       ├──► Labs                                   │
│       ├──► Pharmacies                             │
│       ├──► Ambulances                             │
│       └──► Homecare Providers                     │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

**Status**: ✅ **OPERATIONAL**

All hierarchical relationships have been created and verified.
System is ready for employee onboarding and wellness partner integration.

**Created**: February 8, 2026  
**Last Updated**: February 8, 2026
