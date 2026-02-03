# 🏥 Super Admin Dashboard - SaaS HIS Platform

Comprehensive monitoring, analytics, and control mechanisms for managing multi-tenant Hospital Information System (HIS) SaaS platform.

**Version:** 1.0  
**Date:** February 3, 2026  
**Product:** Mayden SmartHealth HIS + Voice Scriber

---

## 📋 Table of Contents

1. [Dashboard Overview](#-dashboard-overview)
2. [Tenant Management](#-tenant-management)
3. [Usage Analytics & Metering](#-usage-analytics--metering)
4. [Billing & Subscription](#-billing--subscription)
5. [System Health Monitoring](#-system-health-monitoring)
6. [Error Tracking & Bug Fixing](#-error-tracking--bug-fixing)
7. [Security & Compliance](#-security--compliance)
8. [Voice Scriber Analytics](#-voice-scriber-analytics)
9. [Support & Tickets](#-support--tickets)
10. [Reports & Exports](#-reports--exports)

---

## 📊 Dashboard Overview

### Real-time KPI Cards

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  Active Tenants │  Total Users    │  OPD Today      │  IPD Active     │
│       12        │      156        │     2,847       │      89         │
│   ▲ 2 this mo   │  ▲ 23 this mo   │  ▲ 12% vs avg   │  ▲ 5 admitted   │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  Voice Scribes  │  API Calls/min  │  Error Rate     │  MRR (₹)        │
│    Active: 18   │      1,247      │     0.02%       │   ₹14,50,000    │
│   4 recording   │  ▼ normal load  │   ✅ healthy    │  ▲ 8% growth    │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### Quick Actions

- 🚨 View Critical Alerts (3 pending)
- 📊 Generate Monthly Report
- 🏥 Onboard New Hospital
- 🔧 System Maintenance Mode

---

## 🏥 Tenant Management

### Tenant List View

| Hospital          | Plan    | Units | Users | OPD/Year      | IPD/Year | Status        | Health |
| ----------------- | ------- | ----- | ----- | ------------- | -------- | ------------- | ------ |
| Apollo Kovilpatti | Phase 1 | 2/2   | 8/12  | 18,500/30,000 | 180/300  | Active        | 🟢     |
| Metro Hospital    | Phase 1 | 1/2   | 4/12  | 25,200/30,000 | 290/300  | ⚠️ Near Limit | 🟡     |
| City Care Clinic  | Basic   | 1/1   | 3/6   | 8,400/15,000  | 50/100   | Active        | 🟢     |

### Per-Tenant Dashboard

```yaml
Tenant Details:
  Name: Apollo Hospital - Kovilpatti
  Tenant ID: TENANT-APL-001
  Contract Start: 2026-01-15
  Contract End: 2027-01-14
  Plan: Phase 1 HIS + Voice Scriber

Units/Centers:
  - Kovilpatti Main (Unit 1) - Active
  - Kalugumalai Branch (Unit 2) - Active
  - Outreach Clinic 1 - Pending Setup

Billing:
  HIS Subscription: ₹1,80,000/year
  Voice Scriber (4 users): ₹2,48,000/year
  Device Lease (2 tablets): Included
  Total Annual: ₹4,28,000 + GST
  Payment Status: Paid (Next: 2027-01-15)

Usage Limits:
  OPD Patients: 18,500 / 60,000 (30.8%)
  IPD Patients: 180 / 600 (30%)
  Users: 8 / 12 (66.7%)
  Storage: 45 GB / 100 GB (45%)
```

### Tenant Configuration Controls

```javascript
// Super Admin can configure per tenant
{
  "tenantId": "TENANT-APL-001",
  "features": {
    "modules": {
      "frontDesk": true,
      "doctor": true,
      "nurse": true,
      "lab": true,
      "pharmacy": true,
      "billing": true,
      "insurance": true,
      "mrd": true,
      // Premium modules (not in Phase 1)
      "erDashboard": false,
      "icuMonitoring": false,
      "telemedicine": false,
      "aiScribeOffline": false
    },
    "limits": {
      "maxUnits": 2,
      "maxUsersPerUnit": 6,
      "opdPatientsPerYear": 30000,
      "ipdPatientsPerYear": 300,
      "storageGB": 100,
      "apiCallsPerMinute": 100
    },
    "integrations": {
      "voiceScriber": true,
      "smsNotifications": true,
      "emailNotifications": true,
      "whatsappBusiness": false,
      "paymentGateway": true
    }
  }
}
```

---

## 📈 Usage Analytics & Metering

### Critical for Billing Enforcement

#### 1. Patient Volume Tracking

```sql
-- Daily patient counts per tenant
SELECT
  tenant_id,
  unit_id,
  DATE(created_at) as date,
  COUNT(CASE WHEN visit_type = 'OPD' THEN 1 END) as opd_count,
  COUNT(CASE WHEN visit_type = 'IPD' THEN 1 END) as ipd_count,
  COUNT(*) as total_visits
FROM patient_visits
WHERE created_at >= DATE_TRUNC('year', NOW())
GROUP BY tenant_id, unit_id, DATE(created_at)
ORDER BY date DESC;
```

#### 2. Usage Metering Dashboard

| Metric               | Current | Limit   | % Used | Trend       | Alert        |
| -------------------- | ------- | ------- | ------ | ----------- | ------------ |
| OPD Patients (YTD)   | 18,500  | 30,000  | 61.7%  | ▲ +340/day  | ⚠️ 85% by Q3 |
| IPD Admissions (YTD) | 180     | 300     | 60%    | ▲ +2/day    | Normal       |
| Active Users         | 8       | 12      | 66.7%  | Stable      | Normal       |
| API Calls (24h)      | 45,230  | 144,000 | 31.4%  | Normal      | Normal       |
| Storage Used         | 45 GB   | 100 GB  | 45%    | ▲ +0.5GB/mo | Normal       |
| Voice Minutes (MTD)  | 1,240   | 5,000   | 24.8%  | Normal      | Normal       |

#### 3. Usage Alerts Configuration

```yaml
Usage Alerts:
  - metric: opd_patients_yearly
    thresholds:
      - level: warning
        percentage: 80
        action: email_admin
      - level: critical
        percentage: 95
        action: [email_admin, sms_admin, dashboard_alert]
      - level: exceeded
        percentage: 100
        action: [soft_block, upgrade_prompt]

  - metric: storage_gb
    thresholds:
      - level: warning
        percentage: 75
        action: email_admin
      - level: critical
        percentage: 90
        action: auto_cleanup_old_logs

  - metric: api_calls_per_minute
    thresholds:
      - level: rate_limit
        value: 100
        action: throttle_requests
```

#### 4. Module Usage Analytics

Track which features are being used:

| Module        | Daily Active Users | Sessions/Day | Avg Duration | Top Actions                 |
| ------------- | ------------------ | ------------ | ------------ | --------------------------- |
| Front Desk    | 12                 | 156          | 45 min       | Register Patient, Check-in  |
| Doctor        | 8                  | 89           | 25 min       | View Patient, Write Rx      |
| Lab           | 4                  | 67           | 15 min       | Enter Results, Print Report |
| Pharmacy      | 3                  | 134          | 8 min        | Dispense, Stock Check       |
| Billing       | 6                  | 178          | 12 min       | Generate Invoice, Payment   |
| Voice Scriber | 4                  | 45           | 6 min        | Start Recording, Edit Text  |

---

## 💰 Billing & Subscription

### Subscription Overview

```
Monthly Recurring Revenue (MRR): ₹14,50,000
Annual Recurring Revenue (ARR): ₹1,74,00,000

Revenue Breakdown:
├── HIS Subscriptions: ₹9,60,000/year (55%)
├── Voice Scriber: ₹6,20,000/year (36%)
├── Device Leases: ₹1,20,000/year (7%)
└── Add-ons & Overages: ₹3,50,000/year (2%)
```

### Billing Dashboard

| Tenant            | Plan    | Annual Value | Next Invoice | Status            | Actions |
| ----------------- | ------- | ------------ | ------------ | ----------------- | ------- |
| Apollo Kovilpatti | Phase 1 | ₹5,04,880    | 2027-01-15   | ✅ Paid           | View    |
| Metro Hospital    | Phase 1 | ₹2,12,400    | 2026-03-01   | ⚠️ Due in 25 days | Remind  |
| City Care         | Basic   | ₹1,06,200    | 2026-02-15   | 🔴 Overdue        | Contact |

### Overage Tracking

```yaml
Tenant: Metro Hospital
Period: Jan 2026

Included in Plan:
  OPD: 30,000/year (2,500/month average)
  IPD: 300/year (25/month average)

Actual Usage This Month:
  OPD: 3,200 patients (128% of average)
  IPD: 35 admissions (140% of average)

Overage Projection (if trend continues):
  Estimated Year-End OPD: 38,400 (8,400 over limit)
  Overage Charge: ₹8,400 × ₹3/patient = ₹25,200

Recommendation: Upgrade to Phase 2 plan
```

### Auto-Billing Rules

```javascript
const billingRules = {
  // Grace period before enforcement
  gracePeriodDays: 15,

  // Overage charges
  overageRates: {
    opdPatient: 3, // ₹3 per patient over limit
    ipdPatient: 50, // ₹50 per admission over limit
    storageGB: 100, // ₹100 per GB over limit
    voiceMinutes: 0.5, // ₹0.50 per minute over limit
  },

  // Late payment
  latePaymentPenalty: 0.02, // 2% per month

  // Suspension rules
  suspensionAfterDays: 30,
  dataRetentionAfterSuspension: 90, // days
};
```

---

## 🔧 System Health Monitoring

### Infrastructure Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SYSTEM HEALTH OVERVIEW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  API Servers (3)     Database (Primary)    Database (Replica)       │
│  ████████████ 100%   ████████░░ 78%        ████████░░ 76%          │
│  CPU: 45% | Mem: 62% CPU: 34% | Mem: 78%   Replication Lag: 0.2s   │
│                                                                     │
│  Redis Cache         Kafka Queue           Voice API               │
│  ████████████ 100%   ████████████ 100%    ████████████ 100%        │
│  Hit Rate: 94%       Lag: 0 msgs           Latency: 120ms          │
│                                                                     │
│  Storage (S3)        CDN                   SSL Certificates        │
│  ██████░░░░ 58%      ████████████ 100%    ✅ Valid (89 days)       │
│  2.3 TB / 4 TB       Bandwidth: Normal     Auto-renew: ON          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Real-time Metrics (Per Tenant)

```javascript
// Metrics collected every minute
const tenantMetrics = {
  "TENANT-APL-001": {
    timestamp: "2026-02-03T12:00:00Z",
    apiMetrics: {
      requestsPerMinute: 145,
      avgResponseTime: 89, // ms
      p95ResponseTime: 234, // ms
      p99ResponseTime: 567, // ms
      errorRate: 0.02, // %
    },
    databaseMetrics: {
      activeConnections: 12,
      queryTime: {
        avg: 23, // ms
        slow: 3, // queries > 1s
      },
      rowsRead: 45000,
      rowsWritten: 1200,
    },
    userActivity: {
      activeSessions: 8,
      concurrentUsers: 6,
      actionsPerMinute: 45,
    },
  },
};
```

### Uptime Monitoring

```yaml
Service Level Agreement (SLA):
  Target Uptime: 99.9%
  Monthly Allowed Downtime: 43.8 minutes

Current Month Status:
  Uptime: 99.95%
  Total Downtime: 21 minutes
  Incidents: 1
    - Feb 1, 03:15-03:36 AM: Database maintenance (planned)

Uptime History:
  Jan 2026: 99.98% ✅
  Dec 2025: 99.91% ✅
  Nov 2025: 99.87% ⚠️ (exceeded SLA)
```

---

## 🐛 Error Tracking & Bug Fixing

### Error Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  ERROR OVERVIEW (Last 24 Hours)                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Total Errors: 127    Critical: 2    Warning: 45    Info: 80       │
│  Error Rate: 0.08%    Affected Users: 12    Affected Tenants: 3    │
└─────────────────────────────────────────────────────────────────────┘
```

### Error Categorization

| Category        | Count | Trend  | Top Error                 | Affected  |
| --------------- | ----- | ------ | ------------------------- | --------- |
| API Errors      | 45    | ▼ -12% | 500 Internal Server Error | 3 tenants |
| Database        | 12    | ▲ +5%  | Connection timeout        | 1 tenant  |
| Voice Scriber   | 23    | Stable | Audio processing failed   | 2 devices |
| Authentication  | 8     | ▼ -20% | Token expired             | 5 users   |
| Payment Gateway | 5     | New    | Razorpay timeout          | 2 tenants |
| File Upload     | 34    | ▲ +15% | File too large            | 8 users   |

### Detailed Error Log

```json
{
  "errorId": "ERR-2026020312345",
  "timestamp": "2026-02-03T12:34:56Z",
  "severity": "critical",
  "category": "database",
  "tenant": {
    "id": "TENANT-APL-001",
    "name": "Apollo Kovilpatti"
  },
  "user": {
    "id": 456,
    "role": "doctor",
    "email": "dr.sharma@apollo.com"
  },
  "request": {
    "method": "POST",
    "endpoint": "/api/prescriptions/create",
    "body": "{ patientId: 789, ... }",
    "headers": { "user-agent": "MediczyApp/2.1.0" }
  },
  "error": {
    "type": "DatabaseError",
    "message": "Connection pool exhausted",
    "stack": "Error: Connection pool exhausted\n    at Pool.acquire...",
    "code": "POOL_EXHAUSTED"
  },
  "context": {
    "dbConnections": 50,
    "maxConnections": 50,
    "queueLength": 23
  },
  "resolution": {
    "status": "investigating",
    "assignee": "backend-team",
    "ticketId": "JIRA-1234"
  }
}
```

### Error Alerting Rules

```yaml
Alert Rules:
  - name: High Error Rate
    condition: error_rate > 1% for 5 minutes
    severity: critical
    channels: [slack, pagerduty, email]

  - name: Database Connection Issues
    condition: db_connection_errors > 5 in 1 minute
    severity: critical
    channels: [pagerduty, sms]

  - name: Voice Scriber Failures
    condition: voice_api_errors > 10 in 5 minutes
    severity: warning
    channels: [slack, email]

  - name: Payment Failures
    condition: payment_errors > 3 in 10 minutes
    severity: warning
    channels: [slack, email]

  - name: Slow API Response
    condition: p95_latency > 2000ms for 10 minutes
    severity: warning
    channels: [slack]
```

### Bug Tracking Integration

```yaml
Integrations:
  - Sentry (Error Tracking)
  - Jira (Issue Management)
  - Slack (#prod-alerts channel)
  - PagerDuty (On-call rotation)

Auto-Create Jira Ticket:
  Trigger: New critical error affecting > 5 users
  Template:
    Project: MEDIS
    Type: Bug
    Priority: High
    Labels: [production, auto-generated]
    Description: |
      Error: {error_message}
      Affected Tenants: {tenant_count}
      Affected Users: {user_count}
      First Occurrence: {first_seen}
      Error ID: {error_id}
```

### Error Resolution Workflow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Detect    │───▶│   Triage    │───▶│    Fix      │───▶│   Deploy    │
│             │    │             │    │             │    │             │
│ • Auto-log  │    │ • Severity  │    │ • Root cause│    │ • Staging   │
│ • Alert     │    │ • Assign    │    │ • Code fix  │    │ • Canary    │
│ • Group     │    │ • Priority  │    │ • Test      │    │ • Full      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                │
                   ┌─────────────┐    ┌─────────────┐           │
                   │   Monitor   │◀───│   Verify    │◀──────────┘
                   │             │    │             │
                   │ • Error rate│    │ • Regression│
                   │ • User RPT  │    │ • User test │
                   └─────────────┘    └─────────────┘
```

---

## 🔒 Security & Compliance

### Security Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  SECURITY STATUS                                                    │
├─────────────────────────────────────────────────────────────────────┤
│  Threat Level: LOW    Failed Logins (24h): 23    Blocked IPs: 5    │
│  Last Security Scan: 2 hours ago    Vulnerabilities: 0 critical    │
└─────────────────────────────────────────────────────────────────────┘
```

### Access Audit Log

| Timestamp | User                  | Tenant  | Action              | IP        | Status     |
| --------- | --------------------- | ------- | ------------------- | --------- | ---------- |
| 12:34:56  | admin@apollo.com      | APL-001 | View Patient Record | 203.x.x.x | ✅         |
| 12:33:21  | dr.sharma@apollo.com  | APL-001 | Export Patient List | 203.x.x.x | ✅         |
| 12:30:15  | unknown               | -       | Login Attempt       | 45.x.x.x  | ❌ Blocked |
| 12:28:44  | nurse.priya@metro.com | MET-002 | Update Vitals       | 117.x.x.x | ✅         |

### Compliance Monitoring

```yaml
Healthcare Compliance Checklist:

Data Protection:
  ✅ All PHI encrypted at rest (AES-256)
  ✅ All PHI encrypted in transit (TLS 1.3)
  ✅ Database encryption enabled
  ✅ Backup encryption enabled

Access Control:
  ✅ Role-based access control (RBAC)
  ✅ Multi-factor authentication available
  ⚠️ 3 tenants haven't enabled MFA
  ✅ Session timeout configured (30 min)
  ✅ Password policy enforced

Audit Trail:
  ✅ All PHI access logged
  ✅ Audit logs retained 7 years
  ✅ Logs tamper-proof (immutable)
  ✅ Export capability for audits

Data Retention:
  ✅ Patient records retained as per policy
  ✅ Automatic PII anonymization after retention
  ✅ Right to deletion supported

Incident Response:
  ✅ Breach notification process defined
  ✅ Incident response team assigned
  ✅ Last drill: Jan 15, 2026
```

### Security Alerts

```javascript
const securityAlerts = [
  {
    type: "BRUTE_FORCE",
    threshold: "5 failed logins in 5 minutes",
    action: "block_ip_24h",
    notify: ["security-team@mayden.com"],
  },
  {
    type: "UNUSUAL_DATA_ACCESS",
    threshold: "User accessing >100 patient records/hour",
    action: "flag_for_review",
    notify: ["compliance@mayden.com", "tenant_admin"],
  },
  {
    type: "AFTER_HOURS_ACCESS",
    threshold: "PHI access between 11 PM - 6 AM",
    action: "log_and_alert",
    notify: ["tenant_admin"],
  },
  {
    type: "DATA_EXPORT",
    threshold: "Any bulk export >1000 records",
    action: "require_approval",
    notify: ["tenant_admin", "compliance@mayden.com"],
  },
];
```

---

## 🎤 Voice Scriber Analytics

### Device Status

| Device ID | Hospital          | User       | Status       | Last Sync   | Battery | Storage |
| --------- | ----------------- | ---------- | ------------ | ----------- | ------- | ------- |
| TAB-001   | Apollo Kovilpatti | Dr. Sharma | 🟢 Online    | 2 min ago   | 78%     | 45%     |
| TAB-002   | Apollo Kovilpatti | Dr. Priya  | 🟢 Recording | Now         | 92%     | 23%     |
| TAB-003   | Metro Hospital    | Dr. Kumar  | 🟡 Idle      | 45 min ago  | 34%     | 67%     |
| TAB-004   | Metro Hospital    | Dr. Singh  | 🔴 Offline   | 3 hours ago | 12%     | 89%     |

### Voice Scriber Usage

```yaml
Monthly Statistics:
  Total Recording Sessions: 1,247
  Total Minutes Recorded: 8,340
  Average Session Duration: 6.7 minutes

Transcription Metrics:
  Total Words Transcribed: 2,450,000
  Average Accuracy: 94.2%
  Manual Corrections: 12,340 (0.5%)

Cost Analysis:
  AI Processing Cost: ₹12,500
  Revenue from Voice Scriber: ₹2,48,000
  Margin: 95%

Usage by Doctor:
  - Dr. Sharma: 340 sessions, 2,100 min (Top User)
  - Dr. Priya: 289 sessions, 1,890 min
  - Dr. Kumar: 234 sessions, 1,560 min
  - Dr. Singh: 198 sessions, 1,320 min
```

### Transcription Quality

```
Accuracy Breakdown:
├── Medical Terms: 96.2% ✅
├── Drug Names: 93.8% ✅
├── Patient Names: 89.4% ⚠️ (needs improvement)
├── Numbers/Dosages: 97.1% ✅
└── Overall: 94.2%

Common Corrections:
1. "Paracetamol" misheard as "Paris Tamil" - 23 times
2. Patient name "Krishnamurthy" - 18 corrections
3. Dosage "500mg" heard as "50mg" - 12 times (critical!)

Action Items:
- Add medical dictionary training for regional names
- Implement dosage verification step
```

---

## 🎫 Support & Tickets

### Support Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│  SUPPORT OVERVIEW                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Open Tickets: 23    Critical: 2    Avg Resolution: 4.2 hours      │
│  CSAT Score: 4.6/5   Response Time: 12 min   SLA Compliance: 98%   │
└─────────────────────────────────────────────────────────────────────┘
```

### Ticket Categories

| Category         | Open | This Week | Avg Resolution | Trend  |
| ---------------- | ---- | --------- | -------------- | ------ |
| Login Issues     | 3    | 12        | 0.5 hours      | ▼ -20% |
| Voice Scriber    | 5    | 18        | 2.3 hours      | ▲ +15% |
| Billing/Invoice  | 2    | 8         | 1.2 hours      | Stable |
| Feature Request  | 8    | 15        | N/A            | ▲ +25% |
| Bug Report       | 3    | 10        | 4.5 hours      | ▼ -10% |
| Training Request | 2    | 5         | 24 hours       | Stable |

### Ticket Details View

```yaml
Ticket: TKT-2026-1234
Status: In Progress
Priority: High
Created: Feb 3, 2026 10:30 AM
SLA Deadline: Feb 3, 2026 02:30 PM

Tenant: Apollo Hospital - Kovilpatti
Reporter: admin@apollo.kovilpatti.com
Assigned To: support-l2@mayden.com

Subject: Voice Scriber not saving transcriptions

Description: |
  Since this morning, the voice scriber on TAB-001 is recording
  but transcriptions are not being saved to patient records.

Timeline:
  10:30 - Ticket created
  10:35 - Auto-assigned to L1 support
  10:42 - L1 escalated to L2 (suspected API issue)
  11:15 - Backend team investigating
  11:45 - Root cause identified: Storage quota exceeded

Resolution: |
  Increased storage quota from 50GB to 100GB.
  Cleared old audio files (>90 days) per retention policy.
  Transcriptions now saving successfully.

Follow-up: Schedule storage monitoring alert for this tenant.
```

---

## 📑 Reports & Exports

### Scheduled Reports

| Report                     | Frequency | Recipients       | Last Generated |
| -------------------------- | --------- | ---------------- | -------------- |
| Executive Summary          | Weekly    | CEO, CTO         | Feb 3, 2026    |
| Usage Report (All Tenants) | Monthly   | Finance, Sales   | Feb 1, 2026    |
| Tenant Health Report       | Weekly    | Account Managers | Feb 3, 2026    |
| Security Audit Report      | Monthly   | Compliance, CISO | Feb 1, 2026    |
| Error Summary              | Daily     | Dev Team         | Feb 3, 2026    |
| SLA Compliance             | Monthly   | Operations       | Feb 1, 2026    |

### On-Demand Reports

```yaml
Available Reports:
  Business Reports:
    - Tenant Usage Summary
    - Revenue by Tenant
    - Churn Analysis
    - Feature Adoption

  Technical Reports:
    - API Performance Report
    - Error Analysis Report
    - Database Performance
    - Infrastructure Costs

  Compliance Reports:
    - Access Audit Trail
    - Data Export Log
    - PHI Access Report
    - Security Incident Report

  Tenant-Specific:
    - Monthly Invoice Detail
    - Usage Statement
    - User Activity Report
    - Module Usage Report

Export Formats:
  - PDF (Executive reports)
  - Excel (Data analysis)
  - CSV (Raw data)
  - JSON (API integration)
```

### Sample Executive Report

```
╔═══════════════════════════════════════════════════════════════════╗
║           MAYDEN SMARTHEALTH - MONTHLY EXECUTIVE REPORT           ║
║                       February 2026                               ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  BUSINESS METRICS                                                 ║
║  ───────────────                                                  ║
║  Active Tenants: 12 (+2 new)                                     ║
║  Total Users: 156 (+23)                                          ║
║  MRR: ₹14,50,000 (+8%)                                           ║
║  Churn: 0%                                                        ║
║                                                                   ║
║  PLATFORM USAGE                                                   ║
║  ──────────────                                                   ║
║  OPD Consultations: 34,500                                       ║
║  IPD Admissions: 890                                             ║
║  Prescriptions Generated: 28,400                                 ║
║  Lab Reports: 12,300                                             ║
║  Voice Scriber Sessions: 1,247                                   ║
║                                                                   ║
║  SYSTEM HEALTH                                                    ║
║  ─────────────                                                    ║
║  Uptime: 99.95%                                                  ║
║  Avg Response Time: 89ms                                         ║
║  Error Rate: 0.02%                                               ║
║  Support Tickets Resolved: 145                                   ║
║  CSAT: 4.6/5                                                     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 🛠️ Implementation Priority

### Phase 1 (Must Have) - Week 1-4

1. **Tenant Management**
   - Tenant CRUD operations
   - Feature flag configuration
   - Usage limits enforcement

2. **Usage Metering**
   - Patient count tracking (OPD/IPD)
   - User count per tenant
   - Real-time usage dashboard

3. **Basic Monitoring**
   - System health dashboard
   - Error logging (Sentry integration)
   - Basic alerting

4. **Billing Integration**
   - Subscription status tracking
   - Invoice generation
   - Payment status

### Phase 2 (Should Have) - Week 5-8

5. **Advanced Analytics**
   - Module usage analytics
   - User behavior tracking
   - Trend analysis

6. **Security Dashboard**
   - Audit logs
   - Access monitoring
   - Compliance checklist

7. **Support System**
   - Ticket management
   - SLA tracking
   - Knowledge base

### Phase 3 (Nice to Have) - Week 9-12

8. **Voice Scriber Dashboard**
   - Device management
   - Transcription analytics
   - Quality monitoring

9. **Advanced Reporting**
   - Custom report builder
   - Scheduled exports
   - Executive dashboards

10. **Automation**
    - Auto-scaling alerts
    - Predictive analytics
    - Churn prediction

---

## 🔗 API Endpoints for Super Admin

```yaml
Base URL: https://admin.mediqzy.com/api/v1

Authentication:
  POST /auth/login          # Super admin login
  POST /auth/mfa/verify     # MFA verification
  POST /auth/logout         # Logout

Tenants:
  GET    /tenants                    # List all tenants
  POST   /tenants                    # Create tenant
  GET    /tenants/:id                # Get tenant details
  PUT    /tenants/:id                # Update tenant
  DELETE /tenants/:id                # Deactivate tenant
  GET    /tenants/:id/usage          # Get usage stats
  GET    /tenants/:id/users          # List tenant users
  POST   /tenants/:id/features       # Configure features

Billing:
  GET    /billing/summary            # Revenue overview
  GET    /billing/invoices           # All invoices
  POST   /billing/invoices/:id/send  # Send invoice
  GET    /billing/overages           # Overage report

Monitoring:
  GET    /health                     # System health
  GET    /metrics                    # Real-time metrics
  GET    /errors                     # Error dashboard
  GET    /errors/:id                 # Error details

Security:
  GET    /audit-logs                 # Access logs
  GET    /security/alerts            # Security alerts
  POST   /security/block-ip          # Block IP

Support:
  GET    /tickets                    # All tickets
  POST   /tickets                    # Create ticket
  PUT    /tickets/:id                # Update ticket
  GET    /tickets/:id/timeline       # Ticket history

Reports:
  GET    /reports/executive          # Executive summary
  GET    /reports/usage              # Usage report
  GET    /reports/security           # Security report
  POST   /reports/custom             # Generate custom report
```

---

## 📞 Contact

For implementation support:

- **Technical:** tech@mayden.com
- **Product:** product@mayden.com
- **Sales:** sales@mayden.com
