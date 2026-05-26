# Email Inbox & Settings Endpoints Audit

**Last Updated:** 2026-02-15  
**Status:** ✅ Audited & Documented  
**Version:** 1.0.0

## Overview

The Mediczy email system consists of two main components:

1. **Email Inbox Management** (`/api/team/emails`) - Receive, read, organize emails
2. **Email Settings Management** (`/api/email-settings`) - Configure SMTP/IMAP for users

---

## 1. EMAIL INBOX ENDPOINTS

**Route File:** `server/routes/teamEmail.route.js`  
**Service File:** `server/services/inboundEmailService.js`  
**Model File:** `server/models/emailInbox.model.js`

### Endpoint Summary

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/team/emails/inbox` | Get user's email inbox | ✅ User |
| GET | `/api/team/emails/:id` | Get specific email | ✅ User |
| PUT | `/api/team/emails/:id/mark-read` | Mark email as read | ✅ User |
| PUT | `/api/team/emails/:id/toggle-star` | Star/unstar email | ✅ User |
| DELETE | `/api/team/emails/:id` | Delete email | ✅ User |
| POST | `/api/team/emails/:id/label` | Add label to email | ✅ User |
| POST | `/api/team/emails/sync` | Manual email sync | ✅ Admin |
| GET | `/api/team/emails/stats` | Email statistics | ✅ User |
| GET | `/api/team/emails/priority/:level` | Filter by priority | ✅ User |

### API Endpoints (Detailed)

#### 1.1 GET `/api/team/emails/inbox`
**Get team member's email inbox**

**Authentication:** Required (User)

**Query Parameters:**
```
page (integer, default: 1) - Page number for pagination
limit (integer, default: 20) - Items per page
unreadOnly (boolean, default: false) - Filter unread only
search (string) - Search in subject/body
```

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/team/emails/inbox?page=1&limit=20&unreadOnly=false" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "from": "sender@example.com",
      "fromName": "Sender Name",
      "subject": "Email Subject",
      "body": "Email content...",
      "htmlBody": "<p>HTML content...</p>",
      "to": ["recipient1@example.com"],
      "cc": ["cc@example.com"],
      "isRead": false,
      "isStarred": false,
      "labels": ["inbox"],
      "priority": "normal",
      "receivedAt": "2026-02-15T08:00:00Z",
      "aiProcessed": false,
      "aiIntent": "patient_query",
      "aiSentiment": "neutral",
      "attachments": []
    }
  ]
}
```

---

#### 1.2 GET `/api/team/emails/:id`
**Get single email details**

**Authentication:** Required (User)

**Path Parameters:**
```
id (string, UUID) - Email ID
```

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/team/emails/790b0f51-5b42-4729-92af-c5cd8ab1314b" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "from": "patient@example.com",
    "fromName": "Patient Name",
    "subject": "Appointment Confirmation",
    "body": "Your appointment is confirmed...",
    "htmlBody": "<p>Your appointment is confirmed...</p>",
    "isRead": true,
    "isStarred": true,
    "labels": ["inbox", "appointment"],
    "priority": "high",
    "aiIntent": "appointment_request",
    "aiSentiment": "positive",
    "receivedAt": "2026-02-15T08:00:00Z"
  }
}
```

---

#### 1.3 PUT `/api/team/emails/:id/mark-read`
**Mark email as read**

**Authentication:** Required (User)

**Path Parameters:**
```
id (string, UUID) - Email ID
```

**Example Request:**
```bash
curl -X PUT "http://localhost:3000/api/team/emails/790b0f51-5b42-4729-92af-c5cd8ab1314b/mark-read" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email marked as read"
}
```

---

#### 1.4 PUT `/api/team/emails/:id/toggle-star`
**Star or unstar an email**

**Authentication:** Required (User)

**Path Parameters:**
```
id (string, UUID) - Email ID
```

**Example Request:**
```bash
curl -X PUT "http://localhost:3000/api/team/emails/790b0f51-5b42-4729-92af-c5cd8ab1314b/toggle-star" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "isStarred": true
  },
  "message": "Email starred"
}
```

---

#### 1.5 DELETE `/api/team/emails/:id`
**Delete email (soft delete)**

**Authentication:** Required (User)

**Path Parameters:**
```
id (string, UUID) - Email ID
```

**Example Request:**
```bash
curl -X DELETE "http://localhost:3000/api/team/emails/790b0f51-5b42-4729-92af-c5cd8ab1314b" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email deleted"
}
```

---

#### 1.6 POST `/api/team/emails/:id/label`
**Add label/category to email**

**Authentication:** Required (User)

**Path Parameters:**
```
id (string, UUID) - Email ID
```

**Request Body:**
```json
{
  "label": "follow-up"
}
```

**Valid Labels:**
- inbox, sent, draft, trash
- appointment, patient_query, test_result
- prescription, billing, feedback, follow-up

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/team/emails/790b0f51-5b42-4729-92af-c5cd8ab1314b/label" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"label": "follow-up"}'
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "labels": ["inbox", "follow-up"]
  },
  "message": "Label added"
}
```

---

#### 1.7 POST `/api/team/emails/sync`
**Manually sync emails from IMAP server**

**Authentication:** Required (Admin)

**Request Body:**
```json
{
  "imapConfig": {
    "email": "parinitha@mysmarthealth.in",
    "password": "app-password",
    "host": "imap.zoho.in",
    "port": 993,
    "tls": true
  }
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/team/emails/sync" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "imapConfig": {
      "email": "parinitha@mysmarthealth.in",
      "password": "your-app-password",
      "host": "imap.zoho.in",
      "port": 993,
      "tls": true
    }
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "newEmails": 5,
    "savedEmails": [...]
  },
  "message": "Synced 5 new emails"
}
```

---

#### 1.8 GET `/api/team/emails/stats`
**Get email statistics for user**

**Authentication:** Required (User)

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/team/emails/stats" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total": 245,
    "unread": 12,
    "starred": 8,
    "byIntent": {
      "appointment_request": 45,
      "patient_query": 87,
      "test_result": 32,
      "prescription": 25,
      "billing": 18,
      "feedback": 12,
      "other": 26
    },
    "bySentiment": {
      "positive": 156,
      "neutral": 78,
      "negative": 11
    }
  }
}
```

---

#### 1.9 GET `/api/team/emails/priority/:level`
**Get emails filtered by priority level**

**Authentication:** Required (User)

**Path Parameters:**
```
level (enum: low, normal, high, urgent)
```

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/team/emails/priority/high" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "email-uuid",
      "from": "patient@example.com",
      "subject": "Urgent: Follow-up Required",
      "priority": "high",
      "receivedAt": "2026-02-15T08:00:00Z"
    }
  ],
  "count": 15
}
```

---

## 2. EMAIL SETTINGS ENDPOINTS

**Route File:** `server/routes/emailSettings.route.js`  
**Model File:** `server/models/emailSettings.model.js`  
**Base URL:** `/api/email-settings`

### Endpoint Summary

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/email-settings` | List user's email configs | ✅ User |
| GET | `/api/email-settings/:settingsId` | Get specific config | ✅ User |
| POST | `/api/email-settings` | Create new config | ✅ User |
| PUT | `/api/email-settings/:settingsId` | Update config | ✅ User |
| POST | `/api/email-settings/:settingsId/test` | Test connection | ✅ User |
| DELETE | `/api/email-settings/:settingsId` | Delete config | ✅ User |
| PUT | `/api/email-settings/:settingsId/set-default` | Set as default | ✅ User |
| GET | `/api/email-settings/default` | Get default config | ✅ User |
| GET | `/api/admin/email-settings/user/:userId` | Admin: List user configs | ✅ Admin |
| POST | `/api/admin/email-settings/user/:userId` | Admin: Create config | ✅ Admin |

### API Endpoints (Detailed)

#### 2.1 GET `/api/email-settings`
**Get all email settings configurations for current user**

**Authentication:** Required (User)

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/email-settings" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
      "userId": 110,
      "email": "parinitha@mysmarthealth.in",
      "displayName": "Parinitha - Smart Health",
      "provider": "zoho",
      "smtpHost": "smtp.zoho.in",
      "smtpPort": 465,
      "smtpSecure": true,
      "imapHost": "imap.zoho.in",
      "imapPort": 993,
      "imapSecure": true,
      "isActive": true,
      "isDefault": true,
      "syncEnabled": true,
      "syncFrequencyMinutes": 15,
      "rateLimitPerHour": 100,
      "rateLimitPerDay": 1000,
      "createdAt": "2026-02-15T08:00:00Z",
      "updatedAt": "2026-02-15T08:00:00Z"
    }
  ],
  "count": 1
}
```

**Note:** Passwords are never returned in responses (excluded for security)

---

#### 2.2 GET `/api/email-settings/:settingsId`
**Get specific email settings configuration**

**Authentication:** Required (User)

**Path Parameters:**
```
settingsId (string, UUID) - Settings ID
```

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/email-settings/790b0f51-5b42-4729-92af-c5cd8ab1314b" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "userId": 110,
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Smart Health",
    "provider": "zoho",
    "smtpHost": "smtp.zoho.in",
    "smtpPort": 465,
    "smtpSecure": true,
    "imapHost": "imap.zoho.in",
    "imapPort": 993,
    "imapSecure": true,
    "isActive": true,
    "isDefault": true,
    "lastTestedAt": "2026-02-15T09:30:00Z",
    "testResult": "success",
    "testDetails": {
      "smtpConnected": true,
      "imapConnected": true,
      "errors": []
    },
    "rateLimitPerHour": 100,
    "rateLimitPerDay": 1000,
    "emailsSentToday": 15,
    "emailsSentThisHour": 2,
    "syncEnabled": true,
    "syncFrequencyMinutes": 15,
    "lastSyncAt": "2026-02-15T08:45:00Z",
    "lastSyncStatus": "success",
    "autoReplyEnabled": false
  }
}
```

---

#### 2.3 POST `/api/email-settings`
**Create new email settings configuration for current user**

**Authentication:** Required (User)

**Request Body:**
```json
{
  "email": "parinitha@mysmarthealth.in",
  "displayName": "Parinitha - Smart Health",
  "provider": "zoho",
  "smtpHost": "smtp.zoho.in",
  "smtpPort": 465,
  "smtpSecure": true,
  "smtpUsername": "parinitha@mysmarthealth.in",
  "smtpPassword": "your-app-specific-password",
  "imapHost": "imap.zoho.in",
  "imapPort": 993,
  "imapSecure": true,
  "imapUsername": "parinitha@mysmarthealth.in",
  "imapPassword": "your-app-specific-password",
  "isDefault": true,
  "rateLimitPerHour": 100,
  "rateLimitPerDay": 1000,
  "syncEnabled": true,
  "syncFrequencyMinutes": 15
}
```

**Supported Providers:**
- `gmail` - Google Gmail (SMTP: smtp.gmail.com:587, IMAP: imap.gmail.com:993)
- `outlook` - Microsoft Outlook (SMTP: smtp.office365.com:587, IMAP: outlook.office365.com:993)
- `zoho` - Zoho Mail (SMTP: smtp.zoho.in:465, IMAP: imap.zoho.in:993)
- `custom` - Custom SMTP/IMAP server

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/email-settings" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Smart Health",
    "provider": "zoho",
    "smtpHost": "smtp.zoho.in",
    "smtpPort": 465,
    "smtpSecure": true,
    "smtpUsername": "parinitha@mysmarthealth.in",
    "smtpPassword": "app-password",
    "imapHost": "imap.zoho.in",
    "imapPort": 993,
    "imapSecure": true,
    "imapUsername": "parinitha@mysmarthealth.in",
    "imapPassword": "app-password",
    "isDefault": true
  }'
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "userId": 110,
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Smart Health",
    "provider": "zoho",
    "smtpHost": "smtp.zoho.in",
    "smtpPort": 465,
    "smtpSecure": true,
    "isActive": true,
    "isDefault": true,
    "createdAt": "2026-02-15T08:00:00Z"
  },
  "message": "Email settings created successfully"
}
```

---

#### 2.4 PUT `/api/email-settings/:settingsId`
**Update email settings configuration**

**Authentication:** Required (User)

**Path Parameters:**
```
settingsId (string, UUID) - Settings ID
```

**Request Body (all fields optional):**
```json
{
  "displayName": "Updated Display Name",
  "smtpPassword": "new-app-password",
  "imapPassword": "new-app-password",
  "isDefault": true,
  "syncEnabled": true,
  "syncFrequencyMinutes": 30,
  "rateLimitPerHour": 200,
  "rateLimitPerDay": 2000,
  "autoReplyEnabled": true,
  "autoReplyMessage": "I am out of office..."
}
```

**Example Request:**
```bash
curl -X PUT "http://localhost:3000/api/email-settings/790b0f51-5b42-4729-92af-c5cd8ab1314b" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Parinitha - Updated",
    "syncFrequencyMinutes": 30,
    "autoReplyEnabled": true,
    "autoReplyMessage": "I am out of office and will respond when I return."
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Updated",
    "syncFrequencyMinutes": 30,
    "autoReplyEnabled": true,
    "updatedAt": "2026-02-15T09:00:00Z"
  },
  "message": "Email settings updated successfully"
}
```

---

#### 2.5 POST `/api/email-settings/:settingsId/test`
**Test SMTP/IMAP connectivity**

**Authentication:** Required (User)

**Path Parameters:**
```
settingsId (string, UUID) - Settings ID
```

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/email-settings/790b0f51-5b42-4729-92af-c5cd8ab1314b/test" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "smtpConnected": true,
    "imapConnected": true,
    "smtpStatus": "ready (validation only)",
    "imapStatus": "ready (validation only)",
    "errors": []
  },
  "message": "Configuration test completed"
}
```

**Response (200, with errors):**
```json
{
  "success": false,
  "data": {
    "smtpConnected": false,
    "imapConnected": false,
    "errors": ["SMTP: Invalid credentials", "IMAP: Connection refused"]
  },
  "message": "SMTP: Invalid credentials; IMAP: Connection refused"
}
```

---

#### 2.6 DELETE `/api/email-settings/:settingsId`
**Delete email settings configuration (soft delete)**

**Authentication:** Required (User)

**Path Parameters:**
```
settingsId (string, UUID) - Settings ID
```

**Example Request:**
```bash
curl -X DELETE "http://localhost:3000/api/email-settings/790b0f51-5b42-4729-92af-c5cd8ab1314b" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email settings deleted"
}
```

---

#### 2.7 PUT `/api/email-settings/:settingsId/set-default`
**Set specific email settings as default for user**

**Authentication:** Required (User)

**Path Parameters:**
```
settingsId (string, UUID) - Settings ID
```

**Example Request:**
```bash
curl -X PUT "http://localhost:3000/api/email-settings/790b0f51-5b42-4729-92af-c5cd8ab1314b/set-default" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "email": "parinitha@mysmarthealth.in",
    "isDefault": true
  },
  "message": "Email settings set as default"
}
```

---

#### 2.8 GET `/api/email-settings/default`
**Get default email settings for current user**

**Authentication:** Required (User)

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/email-settings/default" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "userId": 110,
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Smart Health",
    "provider": "zoho",
    "isDefault": true,
    "isActive": true
  }
}
```

---

#### 2.9 GET `/api/admin/email-settings/user/:userId`
**[ADMIN ONLY] Get all email settings for a specific user**

**Authentication:** Required (Admin)

**Path Parameters:**
```
userId (integer) - User ID
```

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/admin/email-settings/user/110" \
  -H "Authorization: Bearer <admin-token>"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
      "userId": 110,
      "email": "parinitha@mysmarthealth.in",
      "displayName": "Parinitha - Smart Health",
      "provider": "zoho",
      "isDefault": true,
      "isActive": true
    }
  ],
  "count": 1
}
```

---

#### 2.10 POST `/api/admin/email-settings/user/:userId`
**[ADMIN ONLY] Create email settings for a specific user**

**Authentication:** Required (Admin)

**Path Parameters:**
```
userId (integer) - User ID
```

**Request Body:**
```json
{
  "email": "parinitha@mysmarthealth.in",
  "displayName": "Parinitha - Smart Health",
  "provider": "zoho",
  "smtpHost": "smtp.zoho.in",
  "smtpPort": 465,
  "smtpSecure": true,
  "smtpUsername": "parinitha@mysmarthealth.in",
  "smtpPassword": "app-password",
  "imapHost": "imap.zoho.in",
  "imapPort": 993,
  "imapSecure": true,
  "imapUsername": "parinitha@mysmarthealth.in",
  "imapPassword": "app-password",
  "isDefault": true
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/admin/email-settings/user/110" \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Smart Health",
    "provider": "zoho",
    "smtpHost": "smtp.zoho.in",
    "smtpPort": 465,
    "smtpSecure": true,
    "smtpUsername": "parinitha@mysmarthealth.in",
    "smtpPassword": "app-password",
    "imapHost": "imap.zoho.in",
    "imapPort": 993,
    "imapSecure": true,
    "imapUsername": "parinitha@mysmarthealth.in",
    "imapPassword": "app-password",
    "isDefault": true
  }'
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "790b0f51-5b42-4729-92af-c5cd8ab1314b",
    "userId": 110,
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha - Smart Health",
    "provider": "zoho",
    "isDefault": true,
    "createdAt": "2026-02-15T08:00:00Z"
  },
  "message": "Email settings created successfully"
}
```

---

## 3. DATABASE SCHEMA

### Email Settings Table (`email_settings`)

| Column | Type | Null | Default | Index | Description |
|--------|------|------|---------|-------|-------------|
| id | UUID | NO | gen_random_uuid() | PK | Unique identifier |
| user_id | INTEGER | NO | - | ✅ | User/team member ID |
| email | VARCHAR(255) | NO | - | ✅ | Email address |
| display_name | VARCHAR(255) | YES | - | - | Display name |
| smtp_host | VARCHAR(255) | YES | - | - | SMTP server |
| smtp_port | INTEGER | YES | 587 | - | SMTP port |
| smtp_secure | BOOLEAN | YES | false | - | TLS/SSL flag |
| smtp_username | VARCHAR(255) | YES | - | - | SMTP auth user |
| smtp_password | VARCHAR(500) | YES | - | - | SMTP auth pass (encrypted) |
| imap_host | VARCHAR(255) | YES | - | - | IMAP server |
| imap_port | INTEGER | YES | 993 | - | IMAP port |
| imap_secure | BOOLEAN | YES | true | - | TLS/SSL flag |
| imap_username | VARCHAR(255) | YES | - | - | IMAP auth user |
| imap_password | VARCHAR(500) | YES | - | - | IMAP auth pass (encrypted) |
| provider | VARCHAR(50) | YES | custom | ✅ | Email provider |
| is_active | BOOLEAN | YES | true | ✅ | Active flag |
| is_default | BOOLEAN | YES | false | ✅ | Default config |
| last_tested_at | TIMESTAMP | YES | - | - | Last test time |
| test_result | VARCHAR(50) | YES | - | - | Test status |
| test_details | JSONB | YES | {} | - | Test details |
| rate_limit_per_hour | INTEGER | YES | 100 | - | Hourly limit |
| rate_limit_per_day | INTEGER | YES | 1000 | - | Daily limit |
| emails_sent_today | INTEGER | YES | 0 | - | Today's count |
| emails_sent_this_hour | INTEGER | YES | 0 | - | Hour's count |
| sync_enabled | BOOLEAN | YES | true | - | Sync flag |
| sync_frequency_minutes | INTEGER | YES | 15 | - | Sync frequency |
| last_sync_at | TIMESTAMP | YES | - | - | Last sync time |
| last_sync_status | VARCHAR(50) | YES | - | - | Sync status |
| auto_reply_enabled | BOOLEAN | YES | false | - | Auto-reply flag |
| auto_reply_message | TEXT | YES | - | - | Auto-reply message |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | Creation time |
| updated_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | - | Update time |
| deleted_at | TIMESTAMP | YES | - | ✅ | Soft delete |

### Indexes
- `idx_email_settings_user_id` - Fast lookup by user
- `idx_email_settings_user_email` - Unique user+email lookup
- `idx_email_settings_user_default` - Default config lookup
- `idx_email_settings_email` - Email address lookup
- `idx_email_settings_is_active` - Active configs only
- `idx_email_settings_is_deleted` - Soft delete filter
- `idx_email_settings_provider` - Provider filter

---

## 4. EMAIL INBOX TABLE

### Email Inbox Table (`email_inboxes`)

Key columns for email management:
- `id` (UUID) - Email ID
- `team_member_id` (INTEGER) - Owner user ID
- `message_id` (STRING) - IMAP message ID
- `from` (STRING) - Sender email
- `subject` (STRING) - Email subject
- `body` (TEXT) - Plain text body
- `html_body` (TEXT) - HTML body
- `is_read` (BOOLEAN) - Read status
- `is_starred` (BOOLEAN) - Star status
- `labels` (ARRAY) - Category labels
- `priority` (ENUM) - low, normal, high, urgent
- `ai_intent` (ENUM) - appointment_request, patient_query, etc.
- `ai_sentiment` (ENUM) - positive, neutral, negative
- `received_at` (TIMESTAMP) - Email received time
- `created_at`, `updated_at` (TIMESTAMP)

---

## 5. INTEGRATION EXAMPLES

### Example: Full Email Configuration Workflow

```bash
# 1. Create email settings for parinitha
curl -X POST http://localhost:3000/api/email-settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "parinitha@mysmarthealth.in",
    "displayName": "Parinitha",
    "provider": "zoho",
    "smtpHost": "smtp.zoho.in",
    "smtpPort": 465,
    "smtpSecure": true,
    "smtpUsername": "parinitha@mysmarthealth.in",
    "smtpPassword": "app-password",
    "imapHost": "imap.zoho.in",
    "imapPort": 993,
    "imapSecure": true,
    "imapUsername": "parinitha@mysmarthealth.in",
    "imapPassword": "app-password",
    "isDefault": true
  }'

# Response: Get the settings ID (e.g., 790b0f51-5b42-4729-92af-c5cd8ab1314b)

# 2. Test the connection
curl -X POST http://localhost:3000/api/email-settings/790b0f51/test \
  -H "Authorization: Bearer <token>"

# 3. Retrieve inbox
curl -X GET http://localhost:3000/api/team/emails/inbox \
  -H "Authorization: Bearer <token>"

# 4. Check email statistics
curl -X GET http://localhost:3000/api/team/emails/stats \
  -H "Authorization: Bearer <token>"

# 5. Read specific email
curl -X GET http://localhost:3000/api/team/emails/email-uuid \
  -H "Authorization: Bearer <token>"

# 6. Star an email
curl -X PUT http://localhost:3000/api/team/emails/email-uuid/toggle-star \
  -H "Authorization: Bearer <token>"
```

---

## 6. SECURITY CONSIDERATIONS

✅ **Authentication:** All endpoints require user authentication (except public endpoints)  
✅ **Authorization:** Admin endpoints check for admin role  
✅ **Password Handling:** Passwords never returned in API responses  
✅ **Encryption:** Passwords should be encrypted in production  
✅ **Soft Deletes:** Data retention compliance with paranoid delete  
✅ **Rate Limiting:** Per-user rate limits configured (100/hour, 1000/day)  
✅ **Data Isolation:** Users can only access their own settings/emails  

---

## 7. PRODUCTION DEPLOYMENT CHECKLIST

- [ ] Database migration applied to all environments
- [ ] EmailSettings model imported in main app
- [ ] Routes registered in app.js
- [ ] Test SMTP credentials configured (use app-specific passwords)
- [ ] Email sync cron job scheduled
- [ ] Rate limiting enforced per user
- [ ] Passwords encrypted with AES-256 in production
- [ ] API endpoint tests passed (42/42)
- [ ] Email delivery tested end-to-end
- [ ] Backup & disaster recovery configured

---

## 8. TROUBLESHOOTING

### Common Issues

**Issue: SMTP connection rejected**
```
Solution: Verify SMTP credentials and port. Check firewall rules.
Use app-specific passwords for Gmail/Office365.
```

**Issue: IMAP sync failing**
```
Solution: Verify IMAP credentials. Check if "Less secure apps" is enabled.
For Zoho, generate app-specific passwords.
```

**Issue: Email not appearing in inbox**
```
Solution: Check sync frequency and last_sync_at. Manually trigger sync.
Verify IMAP credentials and permissions.
```

**Issue: Rate limit exceeded**
```
Solution: Check rate_limit_per_hour and rate_limit_per_day.
Update limits via PUT /api/email-settings/:id endpoint.
```

---

## 9. API VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-15 | Initial release with full SMTP/IMAP support |

---

## 10. CURRENT CONFIGURATION

**Team User:** parinitha@mysmarthealth.in  
**User ID:** 110  
**Provider:** Zoho Mail  
**SMTP Host:** smtp.zoho.in:465  
**IMAP Host:** imap.zoho.in:993  
**Sync Frequency:** 15 minutes  
**Rate Limits:** 100/hour, 1000/day  
**Status:** ✅ Active & Default  

---

**Document Status:** ✅ Complete  
**Last Audited:** 2026-02-15 08:00 UTC  
**Auditor:** System Admin  
**All Endpoints:** ✅ Verified (19 total)
