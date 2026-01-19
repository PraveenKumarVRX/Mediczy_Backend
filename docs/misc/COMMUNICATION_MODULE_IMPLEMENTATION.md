# Communication Module Implementation - Complete

## Overview

The communication module has been successfully extended from admin-only to all user types including:
- **Hospital**
- **TPA (Third Party Administrator)**
- **Insurance Broker**
- **Insurance Company**
- **Admin**

This module provides Email, SMS, and WhatsApp communication capabilities for each user type with proper tenant isolation and access control.

## Architecture

### Frontend Components

#### Shared Component
**Location:** `/client/src/components/shared/CommunicationModule.tsx`

A reusable React component that provides:
- **Dashboard Tab**: Communication statistics (sent, delivered, failed)
- **Email Tab**: Send emails with subject and body
- **SMS Tab**: Send SMS messages (160 char limit)
- **WhatsApp Tab**: Send WhatsApp messages with template support
- **Settings Tab**: Communication preferences

**Props:**
```typescript
interface CommunicationModuleProps {
  userType: 'admin' | 'broker' | 'insurance' | 'hospital' | 'tpa';
  userId?: string;
  organizationId?: string;
}
```

#### User Type Pages

1. **Hospital Communication**
   - Location: `/client/src/pages/hospital/HospitalCommunication.tsx`
   - Route: `/hospital/communication`
   - Uses: `<CommunicationModule userType="hospital" />`

2. **TPA Communication**
   - Location: `/client/src/pages/tpa/TPACommunication.tsx`
   - Route: `/tpa/communication`
   - Uses: `<CommunicationModule userType="tpa" />`

3. **Broker Communication**
   - Location: `/client/src/pages/insurance-broker/BrokerCommunication.tsx`
   - Route: `/intermediary/communication`
   - Uses: `<CommunicationModule userType="broker" />`

4. **Insurance Company Communication**
   - Location: `/client/src/pages/insurance-company/InsuranceCommunication.tsx`
   - Routes: `/insurer/communication` or `/insurance-company/communication`
   - Uses: `<CommunicationModule userType="insurance" />`

### Backend API

#### Routes

**Shared Communication Router**
Location: `/server/routes/communication.route.js`

Endpoints mounted at multiple paths:
- `/api/hospital/communication/*` - Hospital users
- `/api/tpa/communication/*` - TPA users
- `/api/broker/communication/*` - Broker users
- `/api/insurance/communication/*` - Insurance company users
- `/api/insurer/communication/*` - Insurer users (alias)
- `/api/admin/communication/*` - Admin users

#### Endpoints

**1. GET /stats**
Get communication statistics for the authenticated user/organization

Request: `GET /api/{userType}/communication/stats`
Response:
```json
{
  "success": true,
  "stats": {
    "email": { "sent": 150, "delivered": 145, "failed": 5 },
    "sms": { "sent": 320, "delivered": 315, "failed": 5 },
    "whatsapp": { "sent": 450, "delivered": 440, "read": 420, "failed": 10 }
  }
}
```

**2. POST /email/send**
Send an email

Request:
```json
{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "body": "Email body content",
  "userId": "user-uuid",
  "organizationId": "org-uuid"
}
```

Response:
```json
{
  "success": true,
  "message": "Email sent successfully",
  "messageId": "msg-123"
}
```

**3. POST /sms/send**
Send an SMS

Request:
```json
{
  "phone": "+91XXXXXXXXXX",
  "message": "SMS content (max 160 chars)",
  "userId": "user-uuid",
  "organizationId": "org-uuid"
}
```

Response:
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "messageSid": "SM..."
}
```

**4. POST /whatsapp/send**
Send a WhatsApp message

Request:
```json
{
  "phone": "+91XXXXXXXXXX",
  "message": "WhatsApp message",
  "template": "otp",  // Optional: "otp", "appointment", "reminder"
  "userId": "user-uuid",
  "organizationId": "org-uuid"
}
```

Response:
```json
{
  "success": true,
  "message": "WhatsApp message sent successfully",
  "messageSid": "MM..."
}
```

**5. GET /recent**
Get recent messages

Request: `GET /api/{userType}/communication/recent?limit=20`
Response:
```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "type": "whatsapp",
      "recipient": "+91...",
      "status": "delivered",
      "createdAt": "2025-01-08T...",
      "subject": null
    }
  ]
}
```

### Database Model

**Table:** `communication_logs`
**Location:** `/server/models/postgres/communication-log.model.postgres.js`

**Schema:**
```sql
CREATE TABLE communication_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type ENUM('email', 'sms', 'whatsapp') NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status ENUM('sent', 'delivered', 'read', 'failed', 'pending') DEFAULT 'pending',
  createdBy UUID NOT NULL,
  organizationId UUID,
  metadata JSONB DEFAULT '{}',
  sentAt TIMESTAMP,
  deliveredAt TIMESTAMP,
  readAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_communication_logs_createdBy ON communication_logs(createdBy);
CREATE INDEX idx_communication_logs_organizationId ON communication_logs(organizationId);
CREATE INDEX idx_communication_logs_type ON communication_logs(type);
CREATE INDEX idx_communication_logs_status ON communication_logs(status);
CREATE INDEX idx_communication_logs_createdAt ON communication_logs(createdAt);
CREATE INDEX idx_communication_logs_recipient ON communication_logs(recipient);
```

**Metadata Field:**
Stores additional information as JSONB:
- `messageSid`: Twilio message SID
- `messageId`: Email message ID
- `templateSid`: WhatsApp template SID
- `provider`: "twilio", "zoho", etc.
- `error`: Error message if failed

### Services Integration

The communication routes integrate with existing services:

1. **SMS Service**
   - Location: `/server/services/sms.service.js`
   - Provider: Twilio
   - Method: `sendSMS(phone, message)`

2. **WhatsApp Service**
   - Location: `/server/services/whatsapp.service.js`
   - Provider: Twilio Business API
   - Methods: 
     - `sendMessage(phone, message)`
     - `sendTemplateMessage(phone, templateSid, variables)`
   - Approved Templates:
     - OTP: `HX33ae0014bd63fad4404789d2373b6174`

3. **Email Service**
   - Location: `/server/services/emailService.js`
   - Provider: Zoho SMTP
   - Method: `sendEmail({ to, subject, html, from })`

## Multi-Tenant Isolation

### How It Works

1. **Authentication**: Each request uses `authUser` middleware to verify JWT token
2. **User Context**: Extracts `req.user.id` and `req.user.organizationId`
3. **Data Filtering**: All queries filter by `createdBy` and/or `organizationId`
4. **Logging**: All communications are logged with tenant context

### Example Flow

1. Hospital admin logs in → receives JWT with `organizationId: hospital-123`
2. Sends WhatsApp message → API logs with `organizationId: hospital-123`
3. Views stats → Only sees messages for `organizationId: hospital-123`

## Frontend Routes

Added to `/client/src/routes/index.tsx`:

```tsx
// Hospital
<Route path="/hospital/communication" element={<HospitalCommunication />} />

// TPA
<Route path="/tpa/communication" element={<TPACommunication />} />

// Insurance Broker
<Route path="/intermediary/communication" element={<BrokerCommunication />} />

// Insurance Company
<Route path="/insurer/communication" element={<InsuranceCommunication />} />
<Route path="/insurance-company/communication" element={<InsuranceCommunication />} />
```

## Backend Routes

Added to `/server/app.js`:

```javascript
import communicationRouter from './routes/communication.route.js';

app.use('/api/hospital/communication', communicationRouter);
app.use('/api/tpa/communication', communicationRouter);
app.use('/api/broker/communication', communicationRouter);
app.use('/api/insurance/communication', communicationRouter);
app.use('/api/insurer/communication', communicationRouter);
app.use('/api/admin/communication', communicationRouter);
```

## Migration

Created database table using:
```bash
node migrations/create-communication-logs-table.js
```

**Result:**
- ✅ Table `communication_logs` created
- ✅ All indexes created
- ✅ Verified table exists in PostgreSQL

## Testing

### Manual Testing Steps

1. **Test Hospital Communication**
   ```bash
   # Login as hospital admin
   POST /api/hospital/login
   
   # Send SMS
   POST /api/hospital/communication/sms/send
   {
     "phone": "+91XXXXXXXXXX",
     "message": "Test SMS from hospital"
   }
   
   # View stats
   GET /api/hospital/communication/stats
   ```

2. **Test TPA Communication**
   ```bash
   # Login as TPA admin
   POST /api/tpa/login
   
   # Send WhatsApp
   POST /api/tpa/communication/whatsapp/send
   {
     "phone": "+91XXXXXXXXXX",
     "message": "Test WhatsApp from TPA"
   }
   ```

3. **Test Email**
   ```bash
   POST /api/{userType}/communication/email/send
   {
     "to": "test@example.com",
     "subject": "Test Email",
     "body": "<h1>Test</h1><p>This is a test email</p>"
   }
   ```

### Frontend Testing

1. Navigate to:
   - `http://localhost:5173/hospital/communication`
   - `http://localhost:5173/tpa/communication`
   - `http://localhost:5173/intermediary/communication`
   - `http://localhost:5173/insurer/communication`

2. Test each tab:
   - Dashboard: View statistics
   - Email: Send test email
   - SMS: Send test SMS
   - WhatsApp: Send test WhatsApp
   - Settings: View preferences

## Features

### Communication Dashboard
- Real-time statistics for Email, SMS, WhatsApp
- Color-coded status indicators (green=delivered, red=failed)
- Message counts and delivery rates

### Email Management
- Rich text email support (HTML)
- Subject and body fields
- Delivery tracking
- Error handling and logging

### SMS Management
- 160 character limit with counter
- International phone number support
- Twilio integration
- Delivery status tracking

### WhatsApp Management
- Template-based messaging
- Approved template support (OTP, Appointment, Reminder)
- Free-form messages
- Read receipts tracking
- Twilio Business API integration

### Settings
- Communication preferences
- Enable/disable channels
- Future: Custom templates, scheduling

## Security

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: Users can only send messages from their organization
3. **Logging**: All communications logged with user and tenant context
4. **Rate Limiting**: Backend rate limiting prevents abuse
5. **Input Validation**: Phone numbers, email addresses validated
6. **Tenant Isolation**: Strict filtering by organizationId

## Next Steps / Future Enhancements

1. **Bulk Messaging**
   - Send to multiple recipients
   - CSV upload for contact lists
   - Batch processing

2. **Templates**
   - Custom templates per organization
   - Variable substitution
   - Template library

3. **Scheduling**
   - Schedule messages for future delivery
   - Recurring messages
   - Timezone support

4. **Analytics**
   - Detailed delivery reports
   - Click tracking for emails
   - Response rates

5. **Integrations**
   - SendGrid for email
   - Additional WhatsApp providers
   - SMS aggregators

6. **Automation**
   - Trigger-based messaging
   - Workflow integration
   - Event-driven communication

## Files Created/Modified

### Created Files

**Frontend:**
1. `/client/src/components/shared/CommunicationModule.tsx` (391 lines)
2. `/client/src/pages/hospital/HospitalCommunication.tsx`
3. `/client/src/pages/tpa/TPACommunication.tsx`
4. `/client/src/pages/insurance-broker/BrokerCommunication.tsx`
5. `/client/src/pages/insurance-company/InsuranceCommunication.tsx`

**Backend:**
1. `/server/routes/communication.route.js` (260 lines)
2. `/server/models/postgres/communication-log.model.postgres.js` (98 lines)
3. `/server/migrations/create-communication-logs-table.js`

**Documentation:**
1. `/COMMUNICATION_MODULE_IMPLEMENTATION.md` (this file)

### Modified Files

**Frontend:**
1. `/client/src/routes/index.tsx` - Added communication routes

**Backend:**
1. `/server/app.js` - Added communication router imports and routes

## Deployment Status

- ✅ Database table created
- ✅ Backend routes configured
- ✅ Frontend routes configured
- ✅ Server restarted (PM2 restart #2222)
- ✅ Multi-tenant support enabled
- ✅ All user types supported

## Summary

The communication module is now fully functional for:
- ✅ Hospital
- ✅ TPA (Third Party Administrator)
- ✅ Insurance Broker
- ✅ Insurance Company
- ✅ Admin

Each user type has:
- ✅ Dedicated frontend page
- ✅ API endpoints with tenant isolation
- ✅ Email, SMS, WhatsApp capabilities
- ✅ Communication logging and statistics
- ✅ Proper authentication and authorization

**Server Status:** Online (PM2 restart #2222)
**Database:** PostgreSQL with `communication_logs` table
**Frontend Routes:** Configured and ready
**Backend Routes:** Configured and ready

The module is production-ready and can be accessed by navigating to the respective communication pages for each user type.
