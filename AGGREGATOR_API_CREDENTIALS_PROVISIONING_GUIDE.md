# 🏢 AGGREGATOR API CREDENTIALS PROVISIONING GUIDE

**Feature**: Automatic API credentials generation when creating aggregator login (e.g., Mayden)  
**Date**: February 8, 2026  
**Status**: ✅ Ready for Implementation

---

## 📋 Overview

When a **super admin creates an aggregator account** (e.g., Mayden EHR system partner), the system:

1. ✅ Creates the aggregator account
2. ✅ Automatically generates unique API credentials
3. ✅ Securely stores credentials
4. ✅ Provides credentials for setup
5. ✅ Tracks all credential usage and rotations
6. ✅ Enables credential management (rotate, revoke)

---

## 🎯 Key Features

### Auto-Provisioning
- API credentials generated instantly when aggregator created
- No separate credential generation step needed
- Credentials linked to aggregator account automatically

### Security
- Client secrets hashed with bcrypt (12 rounds)
- Credentials shown only once during creation
- Version tracking for rotations
- Audit trail for all operations

### Management
- Super admin can rotate credentials
- Emergency revocation capability
- Grace period for smooth transitions
- Usage tracking and monitoring

### Compliance
- All operations logged in audit table
- Performer, IP, timestamp recorded
- Action details stored
- HIPAA-ready audit trail

---

## 🛠️ Implementation Steps

### Step 1: Create Required Database Tables

**If tables don't exist, run these migrations:**

```sql
-- Table for aggregator accounts
CREATE TABLE IF NOT EXISTS aggregators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Account Information
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  aggregator_type VARCHAR(50),  -- 'mayden', 'hospital_chain', 'clinic_network', etc.
  description TEXT,
  contact_person VARCHAR(255),
  contact_email VARCHAR(255),
  
  -- Credentials
  password_hash VARCHAR(255) NOT NULL,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active',  -- active, inactive, suspended
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Linking table: aggregators <-> api_credentials
CREATE TABLE IF NOT EXISTS aggregator_api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregator_id UUID NOT NULL REFERENCES aggregators(id) ON DELETE CASCADE,
  credential_id UUID NOT NULL REFERENCES api_credentials(id) ON DELETE CASCADE,
  
  -- Primary credential for this aggregator
  is_primary BOOLEAN DEFAULT false,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active',  -- active, inactive, revoked
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Composite unique key
  UNIQUE(aggregator_id, credential_id)
);

-- Indexes
CREATE INDEX idx_aggregators_organization_id ON aggregators(organization_id);
CREATE INDEX idx_aggregators_email ON aggregators(email);
CREATE INDEX idx_aggregators_status ON aggregators(status);
CREATE INDEX idx_aggregator_api_credentials_aggregator_id ON aggregator_api_credentials(aggregator_id);
CREATE INDEX idx_aggregator_api_credentials_credential_id ON aggregator_api_credentials(credential_id);
```

### Step 2: Register Aggregator Routes

**Update `server/api/admin/index.js`:**

```javascript
import express from 'express';
import apiCredentialsRoutes from './api-credentials.routes.js';
import aggregatorRoutes from './aggregators.routes.js';  // ← ADD THIS

const router = express.Router();

// Middleware
router.use(authenticate);
router.use(requireRole(['super_admin', 'admin']));

// Routes
router.use('/api-credentials', apiCredentialsRoutes);
router.use('/aggregators', aggregatorRoutes);  // ← ADD THIS

export default router;
```

### Step 3: Register in app.js

**Ensure admin routes are mounted:**

```javascript
import adminRoutes from './api/admin/index.js';
app.use('/api/admin', adminRoutes);
```

---

## 📡 API Endpoints

### 1. Create Aggregator with Auto-Provisioned Credentials

**Endpoint**: `POST /api/admin/aggregators/create`

**Authorization**: Super Admin required

**Request Body**:
```json
{
  "name": "Mayden EHR Integration",
  "email": "mayden@partner.com",
  "phone": "+1-800-MAYDEN-1",
  "aggregator_type": "mayden",
  "integration_type": "smarthealth_rn",
  "description": "Integration with Mayden hospital management system",
  "contact_person": "John Doe",
  "contact_email": "john.doe@mayden.com"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Aggregator account created with API credentials",
  "data": {
    "aggregator": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Mayden EHR Integration",
      "email": "mayden@partner.com",
      "aggregator_type": "mayden",
      "status": "active",
      "created_at": "2026-02-08T10:30:00Z",
      "temporary_password": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
    },
    "api_credentials": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "client_id": "agg_may_a1b2c3d4e5f6g7h8",
      "client_secret": "0x1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z",
      "version": 1,
      "status": "active",
      "expires_at": "2027-02-08T10:30:00Z",
      "rotation_required_at": "2026-05-09T10:30:00Z",
      "scopes": [
        "aggregator:auth",
        "aggregator:access",
        "hospital:data",
        "clinic:data",
        "patient:read",
        "appointments:read"
      ],
      "integration_type": "aggregator_mayden",
      "created_at": "2026-02-08T10:30:00Z",
      "important_notice": "⚠️ SAVE THESE CREDENTIALS IMMEDIATELY - Cannot be retrieved later"
    },
    "setup_instructions": {
      "step1": "Save the client_id and client_secret securely",
      "step2": "Store in 1Password or vault system",
      "step3": "Share with aggregator contact person",
      "step4": "Aggregator uses credentials for API authentication",
      "step5": "Set up rotation schedule (90 days recommended)"
    }
  }
}
```

**Important**: 
- Client secret is shown **only once**
- Super admin must save credentials immediately
- Share securely with aggregator contact
- Cannot retrieve lost credentials - must rotate

---

### 2. List All Aggregators with Credential Status

**Endpoint**: `GET /api/admin/aggregators`

**Authorization**: Super Admin required

**Query Parameters**:
```
?status=active        # Filter: active, inactive, all
&type=mayden          # Filter by aggregator type
&include_credentials=true  # Include credential details
```

**Response (200 OK)**:
```json
{
  "success": true,
  "count": 3,
  "aggregators": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Mayden EHR Integration",
      "email": "mayden@partner.com",
      "phone": "+1-800-MAYDEN-1",
      "aggregator_type": "mayden",
      "status": "active",
      "contact_person": "John Doe",
      "contact_email": "john.doe@mayden.com",
      "created_at": "2026-02-08T10:30:00Z",
      "credential_count": 1,
      "primary_credential_id": "660e8400-e29b-41d4-a716-446655440001",
      "credentials": [
        {
          "credential_id": "660e8400-e29b-41d4-a716-446655440001",
          "client_id": "agg_may_a1b2c3d4e5f6g7h8",
          "status": "active",
          "version": 1,
          "created_at": "2026-02-08T10:30:00Z",
          "expires_at": "2027-02-08T10:30:00Z",
          "rotation_required_at": "2026-05-09T10:30:00Z",
          "last_used_at": "2026-02-08T14:22:00Z",
          "usage_count": 245,
          "failed_attempts": 0,
          "rotation_urgency": "SCHEDULED",
          "is_primary": true
        }
      ]
    }
  ]
}
```

---

### 3. Get Aggregator Details with Credentials

**Endpoint**: `GET /api/admin/aggregators/{aggregatorId}`

**Response**:
```json
{
  "success": true,
  "aggregator": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Mayden EHR Integration",
    "email": "mayden@partner.com",
    "status": "active",
    "credentials": [...],
    "credential_count": 1,
    "primary_credential": {...}
  }
}
```

---

### 4. Rotate Aggregator Credential

**Endpoint**: `POST /api/admin/aggregators/{aggregatorId}/rotate-credential`

**Request Body**:
```json
{
  "credential_id": "660e8400-e29b-41d4-a716-446655440001",
  "grace_period_days": 7
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Credential rotated successfully",
  "data": {
    "old_credential_id": "660e8400-e29b-41d4-a716-446655440001",
    "new_credential_id": "770e8400-e29b-41d4-a716-446655440002",
    "new_client_id": "agg_may_a1b2c3d4e5f6g7h8",
    "new_client_secret": "1x2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y",
    "new_version": 2,
    "grace_period_ends_at": "2026-02-15T10:30:00Z",
    "next_rotation_due": "2026-05-16T10:30:00Z"
  }
}
```

**Grace Period**: 
- Old credential still works for 7 days
- Allows gradual transition to new credential
- Aggregator can update without downtime

---

### 5. Revoke Credential (Emergency)

**Endpoint**: `POST /api/admin/aggregators/{aggregatorId}/revoke-credential`

**Request Body**:
```json
{
  "credential_id": "660e8400-e29b-41d4-a716-446655440001",
  "reason": "Credential compromised in security incident"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Credential revoked successfully",
  "data": {
    "credential_id": "660e8400-e29b-41d4-a716-446655440001",
    "status": "revoked",
    "revoke_time": "2026-02-08T15:45:00Z"
  }
}
```

**Effect**: 
- Immediate - credential stops working instantly
- All API calls with revoked credential get 401 Unauthorized
- Aggregator must use new credential

---

## 🔐 Security Considerations

### Credential Storage
- ✅ Client secrets hashed with bcrypt (12 rounds)
- ✅ Never stored in plain text
- ✅ Never logged or printed
- ✅ Shown only on creation

### Credential Sharing
- ✅ Share securely (1Password, Vault, encrypted email)
- ❌ Don't share over Slack or unencrypted channels
- ❌ Don't store in version control
- ❌ Don't hardcode in applications

### Credential Rotation
- ✅ Rotate every 90 days (configurable)
- ✅ Use 7-day grace period (configurable)
- ✅ Schedule rotations in advance
- ✅ Track rotation history

### Monitoring
- ✅ Track usage count
- ✅ Monitor failed attempts
- ✅ Alert on unusual patterns
- ✅ Audit all operations

---

## 📊 Super Admin Dashboard Integration

### Dashboard View

**Aggregators Section**:
```
┌─────────────────────────────────────────────────────────────┐
│ AGGREGATORS & API CREDENTIALS                               │
├─────────────────────────────────────────────────────────────┤
│ [+ Create New Aggregator]  Filter: [All ▼]  Sort: [Name ▼] │
├─────────────────────────────────────────────────────────────┤
│ Aggregator Name          │ Type   │ Status │ Credentials   │
├──────────────────────────┼────────┼────────┼───────────────┤
│ ✓ Mayden EHR Integration │ Mayden │ Active │ 1 (Primary)   │
│   mayden@partner.com     │        │        │ ➜ View/Manage │
│   Contact: John Doe      │        │        │   [View] [Edit]│
├──────────────────────────┼────────┼────────┼───────────────┤
│ ✓ Hospital Chain XYZ     │ Chain  │ Active │ 1 (Primary)   │
│   xyz@hospital.com       │        │        │ ➜ View/Manage │
└──────────────────────────┴────────┴────────┴───────────────┘

Aggregator Details Panel:
┌─────────────────────────────────────────────────────────────┐
│ Mayden EHR Integration                    [Edit] [Deactivate]│
├─────────────────────────────────────────────────────────────┤
│ Email: mayden@partner.com                                   │
│ Type: Mayden                                                │
│ Status: Active                                              │
│ Created: Feb 8, 2026 10:30 AM                              │
│                                                             │
│ API CREDENTIALS:                                            │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Client ID: agg_may_a1b2c3d4e5f6g7h8                 │   │
│ │ Status: ACTIVE (v1)                                 │   │
│ │ Created: Feb 8, 2026                                │   │
│ │ Expires: Feb 8, 2027                                │   │
│ │ Rotation Due: May 9, 2026 (SCHEDULED)               │   │
│ │ Usage: 245 requests                                 │   │
│ │ Failed Attempts: 0                                  │   │
│ │                                                     │   │
│ │ [View Secret] [Rotate] [Revoke] [Audit Log]        │   │
│ └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Quick Actions

| Action | Time | Impact |
|--------|------|--------|
| **Rotate Credential** | 2 min | Zero downtime (grace period) |
| **Revoke Credential** | < 1 min | Immediate access denial |
| **View Audit Log** | Instant | Complete action history |
| **Send Setup Instructions** | 1 min | Email to contact |

---

## 🔄 Credential Lifecycle

```
1. CREATION (Aggregator Signup)
   ├─ Super admin creates aggregator
   ├─ System generates API credentials
   ├─ Credentials shown once
   └─ Stored securely (hashed)

2. ACTIVE (Normal Use)
   ├─ Aggregator uses credentials for API calls
   ├─ Usage tracked
   ├─ Failed attempts monitored
   └─ Rotation due date tracked

3. ROTATION (90-day cycle)
   ├─ Super admin initiates rotation
   ├─ New credential generated
   ├─ Grace period starts (7 days)
   ├─ Both old & new work during grace period
   ├─ After grace period: old credential deactivated
   └─ Version incremented

4. REVOCATION (Emergency)
   ├─ Super admin revokes immediately
   ├─ Credential marked as 'revoked'
   ├─ All API calls rejected
   ├─ Aggregator notified
   └─ New credential must be generated

5. EXPIRATION (After 365 days)
   ├─ Credential automatically expires
   ├─ API calls rejected
   ├─ Super admin rotates for new credential
   └─ Cycle repeats
```

---

## 📝 Implementation Checklist

- [ ] Database tables created (aggregators, aggregator_api_credentials)
- [ ] Migrations applied - [ ] Aggregator routes file created (`aggregators.routes.js`)
- [ ] Routes registered in admin index
- [ ] Admin routes mounted in app.js
- [ ] Test endpoint: POST /api/admin/aggregators/create
- [ ] Test endpoint: GET /api/admin/aggregators
- [ ] Test endpoint: POST /api/admin/aggregators/{id}/rotate-credential
- [ ] Test endpoint: POST /api/admin/aggregators/{id}/revoke-credential
- [ ] Super admin dashboard updated
- [ ] Documentation shared with team
- [ ] Deployment to staging
- [ ] Load testing with sample aggregators
- [ ] Production deployment

---

## 🧪 Testing the Feature

### Test 1: Create Aggregator with Credentials

```bash
curl -X POST http://localhost:3000/api/admin/aggregators/create \
  -H "Authorization: Bearer <super_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Mayden Integration",
    "email": "test@mayden.local",
    "phone": "+1-800-TEST-1",
    "aggregator_type": "mayden",
    "contact_person": "Test User",
    "contact_email": "test@mayden.local"
  }' | jq .
```

Expected: Returns aggregator and API credentials

### Test 2: List Aggregators

```bash
curl -X GET "http://localhost:3000/api/admin/aggregators?include_credentials=true" \
  -H "Authorization: Bearer <super_admin_jwt>" | jq .
```

Expected: List of all aggregators with credentials

### Test 3: Rotate Credential

```bash
curl -X POST "http://localhost:3000/api/admin/aggregators/<agg_id>/rotate-credential" \
  -H "Authorization: Bearer <super_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "credential_id": "<credential_id>",
    "grace_period_days": 7
  }' | jq .
```

Expected: New credential generated with grace period

---

## 🔍 Monitoring & Alerts

### Setup Alerts For:

```
1. Credentials needing rotation (OVERDUE or UPCOMING)
2. Failed authentication attempts (> 5 in 1 hour)
3. Credential access attempts after revocation
4. Credentials expiring within 30 days
5. Unusual usage patterns
```

### Audit Queries

```sql
-- Recent aggregator credential activity
SELECT * FROM api_credential_audit_log
WHERE metadata->>'aggregator_id' IS NOT NULL
ORDER BY timestamp DESC
LIMIT 20;

-- Credentials needing rotation
SELECT ac.id, ac.name, ac.client_id, ac.rotation_required_at
FROM api_credentials ac
WHERE ac.rotation_required_at <= NOW() + INTERVAL '14 days'
  AND ac.status = 'active'
ORDER BY ac.rotation_required_at ASC;

-- Failed authentication attempts
SELECT COUNT(*) as failures, credential_id
FROM api_credential_audit_log
WHERE action = 'failed_access' AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY credential_id
HAVING COUNT(*) > 5;
```

---

## 📞 Support & Troubleshooting

**Q: How do I share credentials securely?**  
A: Use 1Password, Vault, or encrypted email. Never Slack or unencrypted channels.

**Q: What if the credential is lost?**  
A: Revoke it and issue a new one. Old one is worthless without client_id.

**Q: Can I use the same credential for multiple aggregators?**  
A: No - each aggregator gets unique credentials for security and auditability.

**Q: How often should credentials rotate?**  
A: Every 90 days by default, but configurable per organization.

**Q: What's the grace period for?**  
A: Allows smooth transition from old to new credential without downtime.

---

## ✅ Success Criteria

✅ Aggregators can be created with auto-generated API credentials  
✅ Credentials are secure (hashed, shown once)  
✅ Super admin can manage credentials (list, rotate, revoke)  
✅ Audit trail records all operations  
✅ Grace period enables smooth rotations  
✅ Compliance ready (HIPAA/DPDP audit trail)  

---

**Implementation Status**: ✅ Ready for deployment

