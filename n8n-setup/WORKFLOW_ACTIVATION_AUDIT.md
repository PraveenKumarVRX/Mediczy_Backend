# n8n Workflow Activation Audit Report

**Date:** January 23, 2026  
**n8n Version:** 1.123.4  
**n8n URL:** https://n8n.mediqzy.com

---

## 🚨 ROOT CAUSE: Missing Credentials in n8n

**All 11 workflows are imported but CANNOT be activated because no credentials have been configured in n8n.**

When you try to activate a workflow, n8n checks if all required credentials exist. If they don't, activation fails silently or shows an error.

### Database Check Result:
```sql
SELECT id, name, type FROM n8n.credentials_entity;
-- Result: 0 rows (NO CREDENTIALS EXIST!)
```

### Credentials Required by Workflows

| Credential Type | Credential Name | Required By | Status |
|----------------|-----------------|-------------|--------|
| `postgres` | PostgreSQL - Mediczy | 6 workflows | ❌ Missing |
| `smtp` | SMTP Account | 1 workflow | ❌ Missing |
| `twilioApi` | Twilio API | 1 workflow | ❌ Missing |
| `whatsAppApi` | WhatsApp Business API | 1 workflow | ❌ Missing |

---

## 📋 Workflow Status

| # | Workflow Name | Can Activate? | Blocker |
|---|--------------|---------------|---------|
| 1 | SIB: Critical Case Escalation | ❌ NO | Missing `postgres` credential |
| 2 | SIB: Email Notification | ❌ NO | Missing `smtp` credential |
| 3 | SIB: SMS Notification | ❌ NO | Missing `twilioApi` credential |
| 4 | SIB: WhatsApp Notification | ❌ NO | Missing `postgres`, `whatsAppApi` credentials |
| 5 | SIB: Push Notification | ⚠️ PARTIAL | Needs `FCM_SERVER_KEY` env var |
| 6 | SIB AI-Driven Workflow Routing | ❌ NO | Missing `postgres` credential |
| 7 | SIB: Auto Appointment Booking | ❌ NO | Missing `postgres` credential |
| 8 | SIB: High Risk Alert | ✅ YES | HTTP-only, no credentials needed |
| 9 | SIB: Task Reminder Automation | ✅ YES | HTTP-only, no credentials needed |
| 10 | SIB A/B Test Analysis | ❌ NO | Missing `postgres` credential |
| 11 | SIB: EHR Processing Automation | ✅ YES | HTTP-only, no credentials needed |

---

## 🔧 FIX: CREATE CREDENTIALS IN n8n UI

### Step 1: Create PostgreSQL Credential (REQUIRED for 6 workflows)

1. Open https://n8n.mediqzy.com
2. Click the **☰ menu** (top-left) → **Settings** → **Credentials**
3. Click **+ Add Credential**
4. Search for **"PostgreSQL"** and select it
5. Fill in:

| Field | Value |
|-------|-------|
| **Credential Name** | `PostgreSQL - Mediczy` |
| **Host** | `localhost` |
| **Database** | `mediczy_ai` |
| **User** | `mediczy_helper` |
| **Password** | `Mediczy2024Helper` |
| **Port** | `5432` |
| **SSL** | Disable |

6. Click **Test connection** → then **Save**

### Step 2: Create Twilio API Credential (for SMS)

1. Click **+ Add Credential** → Search **"Twilio"**
2. Fill in:

| Field | Value |
|-------|-------|
| **Credential Name** | `Twilio API` |
| **Account SID** | `ACe60079054c0b9f2a7aac3a64a5aea744` |
| **Auth Token** | `c9d8dd281b9ef0fd858ff936348740bf` |

3. Click **Save**

### Step 3: Create SMTP Credential (for Email) - OPTIONAL

⚠️ **Note:** SMTP credentials are NOT configured in your server. You need to set these up first.

Once you have SMTP details:
1. Click **+ Add Credential** → Search **"SMTP"**
2. Fill in your SMTP server details
3. Click **Save**

### Step 4: Create WhatsApp Business Credential - OPTIONAL

⚠️ **Note:** WhatsApp Business API credentials are placeholders. Configure these in server/.env first.

---

## 🚀 ACTIVATION STEPS

### After Creating PostgreSQL Credential:

1. **Go to Workflows** (click n8n logo)
2. **Open each workflow** that needs PostgreSQL
3. Click on the **PostgreSQL node** (purple database icon)
4. In the **Credential** dropdown, select `PostgreSQL - Mediczy`
5. Click **Save**
6. Toggle the **Active** switch (top-right) to activate

### Workflows That Can Be Activated NOW (no credentials needed):

These 3 workflows use only HTTP requests and can be activated immediately:

1. **SIB: High Risk Alert** ✅
2. **SIB: Task Reminder Automation** ✅
3. **SIB: EHR Processing Automation** ✅

Just open each one and toggle the Active switch!

---

## ⚠️ ADDITIONAL ISSUES FOUND

### 1. Localhost API URLs (Will Work - Internal)
The workflows use `localhost` URLs which is correct for internal server communication:
- `http://localhost:3000/api/...` → Mediczy backend ✅
- `http://localhost:8001/...` → SIB FastAPI ✅

These work because n8n runs on the same server.

### 2. Push Notification Needs FCM Key
The Push Notification workflow references `$env.FCM_SERVER_KEY` but it's not configured in n8n.

**Fix:** Add to `~/.n8n/.env`:
```
FCM_SERVER_KEY=your_firebase_server_key_here
```

### 3. Credential Name Mismatch
Some workflows expect different credential names:
- `PostgreSQL Account` (AB Test, AI Routing)
- `PostgreSQL - Mediczy` (Appointment, Escalation, WhatsApp)

**Solution:** After creating the credential, update the credential reference in each workflow to match.

---

## 📊 SUMMARY

| Action | Workflows Affected | Priority |
|--------|-------------------|----------|
| Create PostgreSQL credential | 6 workflows | 🔴 HIGH |
| Create Twilio credential | 1 workflow (SMS) | 🟡 MEDIUM |
| Configure SMTP | 1 workflow (Email) | 🟡 MEDIUM |
| Configure WhatsApp Business | 1 workflow | 🟡 MEDIUM |
| Add FCM_SERVER_KEY | 1 workflow (Push) | 🟡 MEDIUM |
| Activate HTTP-only workflows | 3 workflows | 🟢 NOW |

**Immediate Actions:**
1. ✅ Activate: High Risk Alert, Task Reminder, EHR Processing (no credentials needed)
2. 🔧 Create PostgreSQL credential to unlock 6 more workflows
3. 🔧 Create Twilio credential for SMS notifications
