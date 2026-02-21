# Email Send, Receive, and Read Functionality

## Overview

The team member email system now supports **sending**, **receiving/syncing**, and **reading** emails through a fully integrated email management interface.

## Features Implemented

### 1. **Send Emails** ✅
- **Endpoint**: `POST /api/team/emails/send`
- **Features**:
  - Send emails using configured SMTP settings
  - Support for To, CC, and BCC recipients  
  - HTML and plain text content
  - Uses user's default email configuration
  - Automatic email logging

### 2. **Sync Emails** ✅
- **Endpoint**: `POST /api/team/emails/sync`
- **Features**:
  - Manually sync emails from IMAP inbox
  - Receive unread and recent emails
  - Automatic AI processing (intent, sentiment, priority)
  - Fetch emails from configured email provider (Zoho, Gmail, Outlook, etc.)

### 3. **Read Emails** ✅
- **Endpoint**: `GET /api/team/emails/inbox`
- **Features**:
  - View all received emails with pagination
  - Filter by unread status
  - Search functionality
  - View email details including AI analysis
  - Mark emails as read
  - Star/unstar emails for quick access
  - Delete emails

## Backend Implementation

### New Endpoints

#### Send Email
```
POST /api/team/emails/send
Content-Type: application/json
Authorization: Bearer {token}

{
  "to": "recipient@example.com",
  "cc": "cc@example.com",        // optional
  "bcc": "bcc@example.com",      // optional
  "subject": "Email Subject",
  "htmlContent": "<p>Email body</p>",
  "textContent": "Email body"     // optional
}

Response:
{
  "success": true,
  "message": "Email sent successfully",
  "data": {
    "messageId": "...",
    "emailLogId": "..."
  }
}
```

#### Sync Emails
```
POST /api/team/emails/sync
Content-Type: application/json
Authorization: Bearer {token}

{}

Response:
{
  "success": true,
  "message": "Successfully synced 5 new emails",
  "data": {
    "newEmails": 5,
    "processedEmails": 5,
    "failedEmails": 0
  }
}
```

### Modified Services

#### EmailService (`server/services/emailService.js`)
- Added `sendOutboundEmail(emailConfigId, emailData)` method
- Uses nodemailer for SMTP integration
- Logs sent emails for tracking
- Supports Zoho Mail, Gmail, Outlook, and custom SMTP

#### InboundEmailService (`server/services/inboundEmailService.js`)
- Existing `scheduledSync()` method used for email syncing
- Supports IMAP protocol
- AI processing of received emails (intent, sentiment detection)

### Models Used
- **EmailInbox**: Stores received emails
- **EmailSettings**: Stores SMTP/IMAP configuration per user  
- **EmailLog**: Logs sent emails for tracking

## Frontend Implementation

### Updated Component: `EmailInbox.tsx`

#### New UI Elements
1. **Send Email Button** 
   - Opens a modal with email composition form
   - Fields: To, CC, BCC, Subject, Message
   - HTML formatting support

2. **Sync Emails Button**
   - Manually trigger email sync
   - Shows loading state with spinner
   - Displays success/error notifications

3. **Send Email Modal**
   - Forms for email composition
   - Real-time form validation
   - Success/error alerts
   - Automatic inbox refresh after send

#### New State Variables
```typescript
const [showSendModal, setShowSendModal] = useState(false);
const [sendLoading, setSendLoading] = useState(false);
const [syncing, setSyncing] = useState(false);
const [sendData, setSendData] = useState({
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  htmlContent: ''
});
```

#### New Functions
- `sendEmail(e)` - Handle email sending
- `syncEmails()` - Trigger email sync
- Form state management for email composition

## Configuration Requirements

### Email Settings Configuration
Before users can send and receive emails, they must configure:

1. **SMTP Settings (for sending)**
   - Host: `smtp.zoho.in` (for Zoho Mail)
   - Port: `465` (SSL/TLS)
   - Username: Email address
   - Password: Email password

2. **IMAP Settings (for receiving)**
   - Host: `imap.zoho.in` (for Zoho Mail)
   - Port: `993` (SSL/TLS)
   - Username: Email address
   - Password: Email password

### Example Configuration for Parinitha
```
Email: parinitha@mysmarthealth.in
Provider: Zoho Mail
SMTP: mail.zoho.in:465 (SSL)
IMAP: imap.zoho.in:993 (SSL)
Status: Active & Default
```

## Workflow

### Sending Emails
1. User clicks "Send Email" button
2. Modal opens with email form
3. User fills in recipient, subject, and message
4. User clicks "Send Email"
5. Email is sent via configured SMTP
6. Success notification displayed
7. Inbox auto-refreshes

### Receiving/Syncing Emails
1. User clicks "Sync Emails" button
2. System connects to configured IMAP server
3. Downloads unread and recent emails (last 7 days)
4. AI analyzes emails (intent, sentiment, priority)
5. Emails stored in inbox with metadata
6. Success notification shows count of new emails
7. Inbox refreshes to show new emails

### Reading Emails
1. Inbox displays list of received emails
2. Click email to view details in right panel
3. Email automatically marked as read
4. View AI analysis (intent, sentiment)
5. Can star, delete, or move emails
6. Search and filter functionality available

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "No active email configuration found" | SMTP/IMAP not configured | Go to Settings → Configure Email |
| "Authentication failed" | Wrong password | Verify email credentials in Settings |
| "Connection timeout" | Network/firewall issue | Check network connectivity |
| "Invalid API key" | Authentication issue | Ensure bearer token is valid |

## Security Features

1. **User Isolation**
   - Only authenticated users can send/receive emails
   - Users can only access their own email configs
   - User ID verified from JWT token

2. **Password Encryption**
   - SMTP/IMAP passwords stored securely
   - Encryption in transit (TLS/SSL)
   - Connection timeout prevents hanging requests

3. **Email Logging**
   - All sent emails logged for audit trail
   - Message IDs tracked
   - Delivery status monitored

## Testing

### Manual Testing Steps

1. **Login as team member (parinitha)**
   - Navigate to Team section
   - Go to Email Inbox

2. **Sync Emails**
   - Click "Sync Emails" button
   - Should see notification: "Successfully synced X new emails"
   - Check inbox for received emails

3. **Send Email**
   - Click "Send Email" button
   - Fill in form:
     - To: `test@example.com`
     - Subject: `Test Message`
     - Message: `This is a test email`
   - Click "Send Email"
   - Should see success notification

4. **Read Email**
   - Click on any email in inbox
   - View details in right panel
   - See AI analysis, sender info, timestamp

### Automated Testing
Run test script:
```bash
cd server
node scripts/test-email-send-sync.mjs
```

## Database Schema

### EmailInbox Table
```
id (UUID) - Primary key
teamMemberId (INT) - Team member who owns email
messageId (STRING) - Unique email message ID
from (STRING) - Sender email address
fromName (STRING) - Sender display name
subject (STRING) - Email subject
body (TEXT) - Email body
isRead (BOOLEAN) - Read status
isStarred (BOOLEAN) - Starred status
priority (ENUM) - low/normal/high/urgent
aiIntent (STRING) - Detected intent category
aiSentiment (ENUM) - positive/neutral/negative
aiSummary (TEXT) - AI generated summary
receivedAt (DATETIME) - Receive timestamp
createdAt (DATETIME) - Record creation time
```

### EmailSettings Table
```
id (UUID) - Primary key
userId (INT) - User/team member
email (STRING) - Email address
displayName (STRING) - Display name for replies

SMTP Config:
smtpHost (STRING) - SMTP server
smtpPort (INT) - SMTP port
smtpSecure (BOOLEAN) - Use SSL/TLS
smtpUsername (STRING) - SMTP username
smtpPassword (STRING) - SMTP password (encrypted)

IMAP Config:
imapHost (STRING) - IMAP server
imapPort (INT) - IMAP port
imapSecure (BOOLEAN) - Use SSL/TLS
imapUsername (STRING) - IMAP username
imapPassword (STRING) - IMAP password (encrypted)

Status:
provider (ENUM) - gmail/outlook/zoho/custom
isActive (BOOLEAN) - Configuration active
isDefault (BOOLEAN) - Default for user
lastTestedAt (DATETIME) - Last test time
```

## Future Enhancements

1. **Draft Emails** - Save email drafts
2. **Email Scheduling** - Schedule emails to send later
3. **Templates** - Save and use email templates
4. **Attachments** - Add file attachments
5. **Auto-reply** - Set up auto-responder
6. **Forwarding** - Forward emails to other addresses
7. **Email Signature** - Custom email signature
8. **Folder Management** - Organize emails in folders
9. **Labels** - Tag emails for better organization
10. **Integration** - Connect with calendar for meeting invites

## Troubleshooting

### Emails not syncing?
1. Check email configuration is saved
2. Verify IMAP credentials are correct
3. Check network connectivity
4. Review server logs: `tail -f server/logs/server-error.log`

### Emails not sending?
1. Verify SMTP credentials
2. Check that email is configured as default
3. Ensure recipient email is valid format
4. Review error message for specific issue

### Slow performance?
1. Reduce email fetch limit
2. Increase sync interval
3. Archive old emails
4. Check database performance

## Support & Maintenance

### Monitoring
- Monitor email queue status
- Track send/receive success rates
- Alert on authentication failures
- Monitor SMTP/IMAP connection health

### Logs Location
- Error logs: `/home/ubuntu/Mediczy/server/logs/server-error.log`
- Access logs: `/home/ubuntu/Mediczy/server/logs/server.log`
- Email logs: Database `EmailLog` table

### Maintenance Tasks
- Regular backup of email configs
- Monitor disk space for email storage
- Clean up old email logs (retention policy)
- Test SMTP/IMAP connections weekly

## Version Information

- **Implementation Date**: February 15, 2026
- **Node Version**: 16+
- **Dependencies**: nodemailer, imap, mailparser
- **Database**: PostgreSQL with Sequelize ORM
- **Frontend Framework**: React with TypeScript
