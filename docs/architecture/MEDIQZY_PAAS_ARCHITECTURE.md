# Mediqzy PaaS Architecture Documentation

## Version 1.0.0 | December 2024

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Control Plane vs Tenant Plane](#control-plane-vs-tenant-plane)
4. [Entity Types](#entity-types)
5. [Database Strategy](#database-strategy)
6. [Domain & Routing](#domain--routing)
7. [Authentication & Authorization](#authentication--authorization)
8. [Permission Catalog](#permission-catalog)
9. [Event System](#event-system)
10. [API Reference](#api-reference)
11. [Implementation Files](#implementation-files)
12. [Deployment Guide](#deployment-guide)

---

## Overview

Mediqzy is a **Multi-tenant Healthcare PaaS** (Platform as a Service) designed to serve various healthcare entities including:

- **Hospitals & Clinics**
- **Diagnostic Labs**
- **Pharmacies**
- **Ambulance Services**
- **Insurance Companies, TPAs, and Brokers**
- **Corporate Wellness Programs**
- **PSUs and NGOs**

### Key Principles

1. **Tenant Isolation**: Complete data isolation between tenants
2. **Flexible Database Strategy**: SHARED, SCHEMA, or DEDICATED per tenant
3. **Single User, Multiple Entities**: A user can belong to multiple organizations
4. **Granular Permissions**: Three-tier permission model (PLATFORM, TENANT, ENTITY)
5. **Event-Driven**: All significant actions emit events for audit, notifications, and analytics

---

## Architecture Diagram

```
                          ┌────────────────────────────┐
                          │     Super Super Admin       │
                          │   admin@mediqzy.com         │
                          └─────────────┬──────────────┘
                                        │
                              Control Plane (Shared)
                                        │
┌────────────────────────────────────────────────────────────────────┐
│                          API Gateway / WAF                          │
│         (Domain → Tenant Resolver + Auth Middleware)                │
└───────────────┬───────────────────────────────┬────────────────────┘
                │                               │
      ┌─────────▼─────────┐          ┌─────────▼─────────┐
      │  Auth Service     │          │  Tenant Registry  │
      │  (Multi-Entity)   │          │  & Metadata DB    │
      └─────────┬─────────┘          └─────────┬─────────┘
                │                               │
      ┌─────────▼───────────────────────────────▼─────────┐
      │                Control Plane DB                     │
      │ platform_tenants | platform_entities | platform_users │
      │ platform_roles | platform_permissions | audit_logs   │
      └─────────┬───────────────────────────────┬─────────┘
                │                               │
────────────────┼───────────────────────────────┼────────────────────
                │                               │
        Tenant Plane (Isolated Runtime & Data)
                │                               │
   ┌────────────▼────────────┐     ┌────────────▼────────────┐
   │ Clinic / Hospital A     │     │ Insurance / Lab B        │
   │ Domain: clinicA.*       │     │ Domain: labB.*           │
   │                          │     │                          │
   │  Tenant App Instance    │     │  Tenant App Instance    │
   │  (same codebase)        │     │  (same codebase)        │
   │                          │     │                          │
   │  Tenant DB (Isolated)   │     │  Tenant DB (Isolated)   │
   │  patients, claims, EHR  │     │  reports, billing       │
   └─────────────────────────┘     └─────────────────────────┘
```

---

## Control Plane vs Tenant Plane

### Control Plane (Shared Services)

**Purpose**: Platform management, never stores PHI (Protected Health Information)

**Database Tables**:
- `platform_tenants` - Organization registry
- `platform_entities` - Sub-organizations/branches
- `platform_domains` - Domain routing
- `platform_users` - Global identity
- `platform_roles` - Permission groups
- `platform_permissions` - Granular permissions
- `platform_user_entity_map` - User-entity assignments
- `platform_subscriptions` - Billing & plans
- `platform_audit_logs` - Platform-level events
- `platform_api_keys` - Programmatic access

**Services**:
- Tenant Management
- User Identity
- Subscription & Billing
- Domain Resolution
- High-level Audit Logging

### Tenant Plane (Isolated Data)

**Purpose**: Tenant-specific operations, stores all PHI

**Database Strategy Options**:

| Strategy | Use Case | Isolation | Cost |
|----------|----------|-----------|------|
| SHARED | Small clinics, NGOs | Row-level (tenant_id) | Lowest |
| SCHEMA | Medium organizations | Schema-level | Medium |
| DEDICATED | Hospitals, Insurance, PSU | Database-level | Highest |

**Tenant Data**:
- Patients
- Appointments
- Medical Records (EHR)
- Prescriptions
- Lab Orders & Results
- Claims & Pre-authorizations
- Billing & Invoices

---

## Entity Types

### Healthcare Facilities
| Type | Code | Description |
|------|------|-------------|
| CLINIC | CLN | Standalone clinic |
| HOSPITAL | HSP | Hospital/Multi-specialty |
| LAB | LAB | Diagnostic laboratory |
| PHARMACY | PHR | Retail/Hospital pharmacy |
| AMBULANCE | AMB | Emergency services |

### Insurance Entities
| Type | Code | Description |
|------|------|-------------|
| INSURANCE_COMPANY | INS | Insurance provider |
| INSURANCE_TPA | TPA | Third Party Administrator |
| INSURANCE_BROKER | IBR | Insurance broker |

### Corporate & Wellness
| Type | Code | Description |
|------|------|-------------|
| CORPORATE | CRP | Corporate wellness |
| WELLNESS_AGGREGATOR | WLN | Wellness platform |
| PSU | PSU | Public Sector Undertaking |
| NGO | NGO | Non-Governmental Org |

---

## Database Strategy

### SHARED (Default)
```javascript
// All tenants share one database with tenant_id filtering
SELECT * FROM patients WHERE tenant_id = 'tenant-uuid';
```

### SCHEMA (Medium Isolation)
```javascript
// Each tenant has a dedicated schema
SET search_path TO tenant_cln0001, public;
SELECT * FROM patients;
```

### DEDICATED (Maximum Isolation)
```javascript
// Each tenant has a dedicated database
// Connection pool per tenant
const pool = getTenantPool('mediqzy_hsp0001');
```

---

## Domain & Routing

### Domain Resolution Order

1. **X-Tenant-ID Header** (API clients)
2. **X-Tenant-Code Header** (API clients)
3. **Subdomain** (tenant.mediqzy.com)
4. **Custom Domain** (ehr.cityhospital.com)
5. **Default Tenant** (development only)

### Example Domains

| Type | Example |
|------|---------|
| Platform | api.mediqzy.com |
| Subdomain | cityhospital.mediqzy.com |
| Custom | health.apollohospitals.com |

### Domain Middleware

```javascript
import { domainResolver, requireTenant } from './middleware/domainResolver.middleware.js';

// Auto-resolve tenant from domain
app.use(domainResolver);

// Require tenant for specific routes
app.use('/api/patients', requireTenant, patientRoutes);
```

---

## Authentication & Authorization

### User Types

| Type | Scope | Description |
|------|-------|-------------|
| Super Super Admin | PLATFORM | admin@mediqzy.com - full platform control |
| Platform Ops | PLATFORM | Infrastructure team |
| Tenant Admin | TENANT | Full tenant control |
| Entity Admin | ENTITY | Entity-level control |
| Users (Doctor, Nurse, etc.) | ENTITY | Role-based access |

### Multi-Entity Authentication Flow

```
1. User Login (email/password)
   ↓
2. Return user + available entities
   ↓
3. User selects entity (if multiple)
   ↓
4. Generate token with tenant/entity context
   ↓
5. Token includes permissions for that context
```

### Token Structure

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "tenantId": "uuid",
  "entityId": "uuid",
  "roleCode": "DOCTOR",
  "roleScope": "ENTITY",
  "permissions": ["ENTITY.PATIENT.READ", "ENTITY.APPOINTMENT.CREATE"],
  "isPlatformAdmin": false
}
```

### Entity Switching

```javascript
// User can switch between entities they belong to
POST /api/v2/auth/switch-entity
{
  "tenantId": "new-tenant-uuid",
  "entityId": "new-entity-uuid"
}
```

---

## Permission Catalog

### Permission Format

```
<SCOPE>.<RESOURCE>.<ACTION>
```

### Permission Scopes

| Scope | Description | Example |
|-------|-------------|---------|
| PLATFORM | System-wide | PLATFORM.TENANT.CREATE |
| TENANT | Tenant-wide | TENANT.USER.CREATE |
| ENTITY | Entity-specific | ENTITY.PATIENT.READ |

### Sample Permissions

#### Platform Permissions
```
PLATFORM.TENANT.CREATE
PLATFORM.TENANT.SUSPEND
PLATFORM.SUBSCRIPTION.MANAGE
PLATFORM.USER.IMPERSONATE
PLATFORM.AUDIT.READ
```

#### Tenant Permissions
```
TENANT.CONFIG.UPDATE
TENANT.ENTITY.CREATE
TENANT.USER.CREATE
TENANT.ROLE.MANAGE
TENANT.BILLING.VIEW
```

#### Entity Permissions (Healthcare)
```
ENTITY.PATIENT.CREATE
ENTITY.PATIENT.READ
ENTITY.MEDICAL_RECORD.CREATE
ENTITY.APPOINTMENT.CREATE
ENTITY.PRESCRIPTION.CREATE
ENTITY.LAB_ORDER.CREATE
ENTITY.CLAIM.SUBMIT
ENTITY.CLAIM.APPROVE
```

### Permission Check Middleware

```javascript
import { requirePermission } from './services/permission.service.js';

// Single permission
router.post('/patients', requirePermission('ENTITY.PATIENT.CREATE'), createPatient);

// Any of multiple permissions
router.get('/records', requirePermission(['ENTITY.MEDICAL_RECORD.READ', 'ENTITY.PATIENT.READ']), getRecords);

// All permissions required
router.delete('/records/:id', requirePermission(
  ['ENTITY.MEDICAL_RECORD.DELETE', 'ENTITY.AUDIT.WRITE'],
  { requireAll: true }
), deleteRecord);
```

---

## Event System

### Event Types

```javascript
import { EventTypes } from './services/event.service.js';

// Platform Events
EventTypes.PLATFORM.TENANT_CREATED
EventTypes.PLATFORM.TENANT_SUSPENDED
EventTypes.PLATFORM.SUBSCRIPTION_UPGRADED

// Auth Events
EventTypes.AUTH.LOGIN_SUCCESS
EventTypes.AUTH.LOGIN_FAILED
EventTypes.AUTH.MFA_ENABLED

// Healthcare Events
EventTypes.APPOINTMENT.CREATED
EventTypes.APPOINTMENT.COMPLETED
EventTypes.CLAIM.APPROVED
EventTypes.LAB.RESULT_PUBLISHED
EventTypes.LAB.CRITICAL_VALUE
```

### Event Envelope

```json
{
  "eventId": "uuid",
  "eventType": "appointment.created",
  "eventVersion": "1.0",
  "timestamp": "2025-01-05T10:30:00Z",
  "platformContext": {
    "tenantId": "uuid",
    "entityId": "uuid",
    "domain": "clinic.mediqzy.com"
  },
  "actor": {
    "userId": "uuid",
    "email": "doctor@clinic.com",
    "role": "DOCTOR",
    "ipAddress": "x.x.x.x"
  },
  "payload": {
    "appointmentId": "uuid",
    "patientId": "uuid",
    "scheduledAt": "2025-01-10T09:00:00Z"
  },
  "metadata": {
    "correlationId": "uuid",
    "source": "mediqzy-platform"
  }
}
```

### Emitting Events

```javascript
import { eventBus, AppointmentEvents } from './services/event.service.js';

// Using helper
AppointmentEvents.created(appointment, context, actor);

// Direct emit
eventBus.emitEvent(
  EventTypes.APPOINTMENT.CREATED,
  { appointmentId: '123', patientId: '456' },
  { tenantId: 'xxx', entityId: 'yyy' },
  { userId: 'zzz', role: 'DOCTOR' }
);
```

### Subscribing to Events

```javascript
import { eventBus, EventTypes } from './services/event.service.js';

// Subscribe to specific event
eventBus.subscribe(EventTypes.CLAIM.APPROVED, async (event) => {
  // Send notification
  await sendNotification(event.payload.claimId);
});

// Subscribe to all events (audit)
eventBus.subscribe('*', async (event) => {
  await writeToAuditLog(event);
});
```

---

## API Reference

### Platform Admin API (`/api/platform`)

```
GET  /platform/dashboard              # Platform statistics
GET  /platform/tenants                # List tenants
POST /platform/tenants                # Create tenant
GET  /platform/tenants/:id            # Get tenant details
PATCH /platform/tenants/:id           # Update tenant
POST /platform/tenants/:id/provision  # Provision resources
POST /platform/tenants/:id/suspend    # Suspend tenant
POST /platform/tenants/:id/activate   # Activate tenant
DELETE /platform/tenants/:id          # Delete tenant

POST /platform/tenants/:id/entities   # Create entity
GET  /platform/tenants/:id/entities   # List entities
PATCH /platform/entities/:id          # Update entity

POST /platform/tenants/:id/domains    # Add domain
POST /platform/domains/:id/verify     # Verify DNS

GET  /platform/users                  # List platform users
POST /platform/users                  # Create platform user

GET  /platform/permissions            # List all permissions
GET  /platform/roles                  # List system roles
GET  /platform/audit-logs             # View audit logs
GET  /platform/health                 # Health check
```

### Multi-Entity Auth API (`/api/v2/auth`)

```
POST /api/v2/auth/login               # Login (returns entities)
POST /api/v2/auth/entity-token        # Get token for entity
POST /api/v2/auth/switch-entity       # Switch to different entity
POST /api/v2/auth/refresh             # Refresh access token
GET  /api/v2/auth/entities            # Get user's entities
POST /api/v2/auth/logout              # Logout
```

### Tenant API (`/api/v2`)

All tenant APIs require:
- Valid JWT token
- Tenant context (resolved from domain or X-Tenant-ID header)

```
# Patients
GET  /api/v2/patients
POST /api/v2/patients
GET  /api/v2/patients/:id

# Appointments
GET  /api/v2/appointments
POST /api/v2/appointments

# ... (see full API documentation)
```

---

## Implementation Files

### Database Schema
- [server/db/migrations/001-mediqzy-paas-control-plane.sql](server/db/migrations/001-mediqzy-paas-control-plane.sql)
- [server/db/migrations/002-mediqzy-permission-catalog.sql](server/db/migrations/002-mediqzy-permission-catalog.sql)

### Services
- [server/services/platform-tenant.service.js](server/services/platform-tenant.service.js) - Tenant lifecycle
- [server/services/permission.service.js](server/services/permission.service.js) - RBAC
- [server/services/event.service.js](server/services/event.service.js) - Event bus
- [server/services/multi-entity-auth.service.js](server/services/multi-entity-auth.service.js) - Auth

### Middleware
- [server/middleware/domainResolver.middleware.js](server/middleware/domainResolver.middleware.js) - Domain → Tenant
- [server/middleware/multitenancy.middleware.js](server/middleware/multitenancy.middleware.js) - Tenant context

### API Routes
- [server/api/platform/index.js](server/api/platform/index.js) - Platform Admin API
- [server/api/v2/index.js](server/api/v2/index.js) - Enterprise API v2

---

## Deployment Guide

### 1. Run Migrations

```bash
cd server
# Run control plane schema
psql -U postgres -d mediczy_ai -f db/migrations/001-mediqzy-paas-control-plane.sql

# Seed permissions and roles
psql -U postgres -d mediczy_ai -f db/migrations/002-mediqzy-permission-catalog.sql
```

### 2. Set Environment Variables

```bash
# Platform
PLATFORM_DOMAIN=mediqzy.com

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=7d

# Database
POSTGRES_HOST=localhost
POSTGRES_DATABASE=mediczy_ai
```

### 3. Create Super Super Admin

```sql
UPDATE platform_users 
SET password_hash = '$2b$10$...' -- bcrypt hash
WHERE email = 'admin@mediqzy.com';
```

### 4. Restart Server

```bash
pm2 restart mediczy-server --update-env
```

### 5. Test Platform API

```bash
# Health check
curl http://localhost:8000/api/platform/health

# Login as platform admin
curl -X POST http://localhost:8000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@mediqzy.com", "password": "xxx"}'
```

---

## Next Steps

1. **Implement Repository Layer**: Add `base.repository.js` for data access
2. **Add Redis for Events**: Production event bus with Redis Pub/Sub
3. **Swagger Documentation**: OpenAPI spec for all endpoints
4. **Tenant Provisioning Automation**: Background job for DB/schema creation
5. **Billing Integration**: Payment gateway for subscriptions

---

## Support

For questions or issues:
- Email: support@mediqzy.com
- Documentation: https://docs.mediqzy.com
- API Reference: https://api.mediqzy.com/docs

---

*Last Updated: December 30, 2024*
