# 🔐 Super Admin Quick Reference: API Credentials Management
**For**: Mediqzy Super Admin & Integration Teams  
**Purpose**: Manage SmartHealth RN (and other) mobile app API credentials  
**Last Updated**: February 8, 2026

---

## 🚀 TL;DR - 30 Second Overview

| Task | Super Admin | Developer | User |
|------|-------------|-----------|------|
| **Generate Credentials** | ✅ Only super admin can do this | Receives credentials securely | N/A |
| **Store Credentials** | Shares securely | Stores in app keychain | N/A |
| **Use in App** | N/A | Includes in Authorization header | Benefits from it |
| **Rotate Credentials** | ✅ Easy 1-click rotation | Updates app within grace period | No change needed |
| **Revoke (Emergency)** | ✅ Instant revocation | Updates app to new credentials | Might experience interruption |

---

## 📝 Common Tasks & Commands

### Task 1: Generate New API Credentials (Initial Setup)

**When**: Setting up a new mobile app integration  
**Time**: ~5 minutes  
**Who**: Mediqzy Super Admin

#### Admin Portal (Recommended)
```
Dashboard → Admin → Integrations → Create API Credential
├─ Name: "SmartHealth RN - Mayden"
├─ Description: "Mobile wellness app for Mayden employees"
├─ Integration Type: "smarthealth-rn"
├─ Organization: "Mayden Health"
├─ Expiration: "365 days"
└─ Rotation Required After: "90 days"
→ GENERATE
→ Copy credentials
→ Share with development team (encrypted)
```

#### Via API (Alternative)
```bash
curl -X POST https://api.mediczy.com/api/admin/api-credentials/generate \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SmartHealth RN - Mayden",
    "description": "Mobile wellness app for Mayden employees",
    "integration_type": "smarthealth-rn",
    "organization_id": "org_mayden_123",
    "expires_in_days": 365,
    "rotation_required_in_days": 90,
    "scopes": ["mobile:auth", "doctors:search", "appointments:book", "wellness:order"]
  }'
```

**You Will Receive**:
```
✅ client_id: cred_smarthealth_abc123xyz789
✅ client_secret: [64-char secret - SAVE THIS!]
✅ expires_at: 2027-02-08
✅ rotation_required_at: 2026-05-09
```

⚠️ **IMPORTANT**: You can only see the secret ONCE. Share it securely!

---

### Task 2: View All API Credentials & Status

**When**: Daily monitoring, security reviews  
**Time**: ~2 minutes  
**Who**: Mediqzy Super Admin

#### Admin Portal (Recommended)
```
Dashboard → Admin → Integrations → API Credentials
→ View list with status, usage, and health
```

#### Via API
```bash
curl https://api.mediczy.com/api/admin/api-credentials \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN"
```

**You Will See**:
```json
[
  {
    "id": "cred_uuid_123",
    "name": "SmartHealth RN - Mayden",
    "client_id": "cred_smarthealth_abc123xyz789",
    "status": "active",
    "version": 1,
    
    "created_at": "2026-02-08T16:00:00Z",
    "expires_at": "2027-02-08T16:00:00Z",
    "rotation_required_at": "2026-05-09T16:00:00Z",
    
    "last_used_at": "2026-02-08T15:30:00Z",
    "usage_count": 4782,
    "failed_attempts": 3,
    
    "issues": [
      "⚠️ ROTATION OVERDUE"  // if past rotation date
    ]
  }
]
```

**What to Look For**:
- ✅ `status: "active"` - Credential is working
- ⚠️ `issues: ["ROTATION OVERDUE"]` - Schedule rotation
- 🚨 `failed_attempts > 5` - Possible security issue
- 🟡 `last_used_at` recent - Credential is being used
- 🔴 Old usage - Might be disconnected

---

### Task 3: Monitor Credential Usage

**When**: Weekly security reviews, troubleshooting  
**Time**: ~5 minutes  
**Who**: Mediqzy Super Admin

#### Check Usage Stats
```bash
curl https://api.mediczy.com/api/admin/api-credentials/cred_uuid_123 \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN"
```

**Key Metrics**:
- `usage_count`: 4782 API calls made
- `failed_attempts`: 3 failed authentication attempts
- `last_used_at`: "2026-02-08T15:30:00Z" (recent = healthy)
- `version`: 1 (currently on version 1)

#### View Audit Log
```bash
curl https://api.mediczy.com/api/admin/api-credentials/cred_uuid_123/audit-log \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN"
```

**Sample Audit Trail**:
```
2026-02-08 16:00:00 [CREATED] by admin@mediqzy.com
2026-02-08 16:05:00 [ACCESSED] user@smarthealth.com (iOS) from 123.45.67.89
2026-02-08 16:10:00 [ACCESSED] user2@smarthealth.com (Android) from 123.45.67.90
2026-02-08 16:15:00 [FAILED_ACCESS] Invalid secret from 192.168.1.1
```

---

### Task 4: Rotate Credentials (Planned Maintenance)

**When**: Every 90 days (or as policy dictates), or for security review  
**Time**: ~10 minutes  
**Who**: Mediqzy Super Admin

#### Admin Portal (Recommended)
```
Dashboard → Admin → Integrations → API Credentials
→ Find credential
→ Click "Rotate Credentials"
→ Set Grace Period: "7 days"
→ CONFIRM
→ Share new secret with development team
→ Set reminder: 7 days
```

#### Via API
```bash
curl -X POST https://api.mediczy.com/api/admin/api-credentials/cred_uuid_123/rotate \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gracePeriodDays": 7
  }'
```

**What Happens**:
```
✅ New secret generated
✅ Old secret still works for 7 days (grace period)
✅ Version incremented (1 → 2)
✅ Audit log recorded
✅ A warning header sent to clients: X-Warning: Please update credentials
```

**Super Admin Checklist**:
- [ ] Generate new secret
- [ ] Notify development team
- [ ] Development team updates app
- [ ] App submitted to app stores (if needed)
- [ ] Wait for grace period to end (~7 days)
- [ ] Confirm no more 401 errors from old secret
- [ ] Celebrate secure rotation! ✅

---

### Task 5: Revoke Credentials (Emergency - IMMEDIATE)

**When**: Security breach, unauthorized access, discontinued service  
**Time**: ~2 minutes  
**Who**: Mediqzy Super Admin

#### Admin Portal (Recommended)
```
Dashboard → Admin → Integrations → API Credentials
→ Find credential
→ Click "Revoke" (RED BUTTON - destructive)
→ Reason: "Security breach - multiple failed attempts"
→ CONFIRM
→ Notify all users
→ Notify development team
```

#### Via API
```bash
curl -X POST https://api.mediczy.com/api/admin/api-credentials/cred_uuid_123/revoke \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "SECURITY ALERT: Unauthorized access detected from IP 192.168.1.1"
  }'
```

**What Happens**:
```
🚨 IMMEDIATE:
  └─ Credential status changed from "active" to "revoked"
  └─ All API calls with this credential get 401 Unauthorized
  └─ Apps cannot authenticate anymore
  
✅ NEXT STEPS:
  └─ Mobile users see "Please update the app" error
  └─ Development team must generate NEW credentials
  └─ App updated with new credentials
  └─ Users can access again
```

**Emergency Protocol**:
1. Revoke credential (< 2 min)
2. Notify development team (< 5 min)
3. Generate new credential (< 5 min)
4. Update app deployment (varies)
5. Monitor for successful authenticate (< 1 hour)
6. Post-incident review (next business day)

---

## 📊 Dashboard Metrics (What to Monitor)

### Green Flags ✅
- ✅ `status: "active"` on all credentials
- ✅ `last_used_at` within last 24 hours
- ✅ `failed_attempts < 5` in last week
- ✅ `usage_count` steadily increasing
- ✅ No warnings in `issues` array
- ✅ `rotation_required_at` not overdue

### Yellow Flags 🟡
- 🟡 `rotation_required_at` past due (rotation needed soon)
- 🟡 `failed_attempts` between 3-5 (monitor closely)
- 🟡 `last_used_at` more than 7 days ago (possibly disconnected?)
- 🟡 Sudden drop in `usage_count` (check if app is working)

### Red Flags 🔴
- 🔴 `failed_attempts > 10` (possible brute force attack)
- 🔴 `status: "revoked"` for active integrations (unplanned restart?)
- 🔴 Multiple IPs accessing from unusual locations
- 🔴 Spikes in failed attempts from same IP
- 🔴 Credential about to expire (less than 30 days)

---

## 🔒 Security Best Practices for Super Admin

### DO ✅
- ✅ Share credentials **SECURELY** (encrypted email, secure vault, 1password, etc.)
- ✅ Rotate credentials every **90 days**
- ✅ Monitor failed attempts weekly
- ✅ Keep rotation policy documented
- ✅ Audit log access quarterly for compliance
- ✅ Revoke immediately if breach suspected
- ✅ Document reasons for revocation

### DON'T ❌
- ❌ Share secrets in Slack, unencrypted email, or messages
- ❌ Hardcode secrets in configuration files
- ❌ Skip rotation windows
- ❌ Use same secret across multiple apps
- ❌ Store credentials in version control
- ❌ Share credentials with non-essential personnel
- ❌ Delay revocation in security incident

---

## 📋 Credential Lifecycle Workflow

```
Week 1: GENERATE
├─ Super Admin generates API credential
├─ Client ID + Secret created
└─ Shared securely with dev team

Weeks 2-12: USE
├─ App uses credential in every request
├─ Usage tracked automatically
├─ Audit log recorded
└─ Security monitoring active

Week 13: ROTATE (90-day cycle)
├─ Super Admin initiates rotation
├─ New secret generated
├─ 7-day grace period starts
├─ Dev team updates app within grace period
└─ Old secret expires after grace period

Ongoing: MONITOR
├─ Weekly usage review
├─ Failed attempt tracking
├─ Expiration date awareness
└─ Security incident monitoring

Emergency: REVOKE (if needed)
├─ Credential revoked immediately
├─ All access denied
├─ New credential generated
├─ App updated with new secret
└─ Service restored
```

---

## 🎯 Quick Action Reference

| Need | Action | Time |
|------|--------|------|
| Set up new app | Generate credentials | 5 min |
| Check health | View dashboard | 2 min |
| Rotate routine | Run rotation | 10 min |
| Emergency | Revoke + regenerate | 15 min |
| Compliance audit | Export audit log | 30 min |

---

## 📞 Troubleshooting Quick Fixes

| User reports | Likely cause | Solution |
|--------------|-------------|----------|
| "App won't login" | Old credentials expired | Rotate → share new secret → user updates |
| "Intermittent access" | Grace period ending | Check rotation status → validate app version |
| "Multiple failed logins" | Wrong credentials stored | Revoke → regenerate → distribute to team |
| "Can't authenticate" | Credential revoked | Check audit log → generate new → share |

---

## ✅ Implementation Status

- [x] System designed & documented
- [x] Database schema created
- [x] API routes implemented
- [x] Audit logging integrated
- [x] Admin portal ready (or use API)
- [ ] **NEXT**: Deploy to production
- [ ] First credential generated for SmartHealth RN
- [ ] Developers update app
- [ ] Monitor & celebrate! 🎉

---

**Questions?** Contact DevOps or Security Team

