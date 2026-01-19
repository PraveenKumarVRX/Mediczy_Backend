# WhatsApp Multi-Number Management System

## Overview

The WhatsApp Multi-Number Management system allows Mediczy to manage multiple WhatsApp numbers for different communication routes. This provides better organization, load distribution, and specialized communication channels for various healthcare purposes.

## Key Features

### 1. Multiple Number Support
- Add unlimited WhatsApp numbers to your system
- Each number can be configured for specific communication purposes
- Support for all major WhatsApp Business providers

### 2. Intelligent Routing
- Automatic selection of the best number based on route and availability
- Priority-based routing for multiple numbers on same route
- Load balancing across numbers to prevent rate limiting

### 3. Route Management
Available communication routes:
- **Appointments**: Appointment reminders and confirmations
- **Prescriptions**: Prescription ready notifications
- **Test Results**: Lab test result notifications
- **General Support**: Customer support messages
- **Emergency**: Urgent medical alerts
- **Reminders**: Medication and general reminders
- **Billing**: Payment and billing notifications
- **Marketing**: Promotional campaigns
- **Teleconsultation**: Video consultation links
- **Feedback**: Patient feedback and surveys
- **Custom**: User-defined routes

### 4. Usage Monitoring
- Real-time tracking of messages sent per number
- Daily and monthly usage limits
- Usage statistics and analytics
- Automatic failover when limits are reached

### 5. Provider Support
Supported WhatsApp Business providers:
- **Gupshup** (Recommended for India)
- **Karix** (Indian company)
- **Facebook WhatsApp Business**
- **Twilio**
- **Infobip**
- **MessageBird**

## Architecture

### Database Model
**Collection**: `whatsappnumbers`

Key fields:
```javascript
{
  phoneNumber: String,           // E.164 format (+91XXXXXXXXXX)
  displayName: String,            // User-friendly name
  description: String,            // Optional description
  provider: String,               // gupshup, karix, facebook, etc.
  route: String,                  // appointments, prescriptions, etc.
  active: Boolean,                // Enable/disable number
  verified: Boolean,              // Verification status
  priority: Number,               // 1-100 (lower = higher priority)
  dailyLimit: Number,             // Max messages per day
  monthlyLimit: Number,           // Max messages per month
  stats: {
    totalMessagesSent: Number,
    messagesToday: Number,
    messagesThisMonth: Number,
    lastMessageSentAt: Date
  }
}
```

### API Endpoints

#### Number Management
- `GET /api/whatsapp-numbers` - List all WhatsApp numbers
- `GET /api/whatsapp-numbers/:id` - Get specific number
- `POST /api/whatsapp-numbers` - Add new number
- `PUT /api/whatsapp-numbers/:id` - Update number
- `DELETE /api/whatsapp-numbers/:id` - Delete number
- `PATCH /api/whatsapp-numbers/:id/toggle-active` - Toggle active status
- `PATCH /api/whatsapp-numbers/:id/verify` - Verify number
- `POST /api/whatsapp-numbers/:id/test` - Send test message

#### Routing & Statistics
- `GET /api/whatsapp-numbers/route/:route/best` - Get best number for route
- `GET /api/whatsapp-numbers/stats/overview` - Get overall statistics
- `POST /api/whatsapp-numbers/bulk/import` - Bulk import numbers

### Routing Service
**File**: `server/services/whatsapp-router.service.js`

Main methods:
- `sendMessage()` - Send message with intelligent routing
- `sendAppointmentReminder()` - Send appointment reminder
- `sendPrescriptionNotification()` - Send prescription notification
- `sendTestResultsNotification()` - Send test results
- `sendEmergencyAlert()` - Send emergency alert
- `bulkSendMessages()` - Send bulk messages

## Setup Instructions

### 1. Add WhatsApp Numbers

Navigate to **Admin Dashboard → WhatsApp Number Management**

Click "Add WhatsApp Number" and fill in:
- **Phone Number**: Your WhatsApp Business number (e.g., +91 98765 43210)
- **Display Name**: Friendly name (e.g., "Appointment Reminders")
- **Provider**: Select your WhatsApp provider (Gupshup recommended)
- **Route**: Select communication purpose
- **Priority**: Set priority (1 = highest priority)
- **Daily Limit**: Max messages per day (default: 1000)
- **Monthly Limit**: Max messages per month (default: 30000)

### 2. Configure Provider Settings

Go to **WhatsApp Configuration** and configure your provider credentials:

**Gupshup Example:**
```javascript
{
  apiKey: "your_gupshup_api_key",
  appName: "your_app_name",
  sourceNumber: "your_whatsapp_number"
}
```

**Facebook Example:**
```javascript
{
  accessToken: "your_access_token",
  businessAccountId: "your_business_account_id",
  phoneNumberId: "your_phone_number_id"
}
```

### 3. Verify Numbers

After adding numbers, click "Verify" to confirm they're working correctly.

### 4. Set Priorities

If you have multiple numbers for the same route:
1. Lower priority number = used first
2. System automatically fails over to next priority if limits reached
3. Recommended priorities:
   - Primary number: Priority 1-3
   - Backup numbers: Priority 4-10
   - Overflow numbers: Priority 11+

## Usage Examples

### Using the Router Service

```javascript
import whatsAppRouter from './services/whatsapp-router.service.js';

// Send appointment reminder
await whatsAppRouter.sendAppointmentReminder({
  to: '+919876543210',
  patientName: 'John Doe',
  doctorName: 'Dr. Smith',
  appointmentDate: 'December 25, 2024',
  appointmentTime: '2:00 PM'
});

// Send prescription notification
await whatsAppRouter.sendPrescriptionNotification({
  to: '+919876543210',
  patientName: 'John Doe',
  doctorName: 'Dr. Smith',
  pharmacyLocation: 'City Pharmacy, MG Road',
  pharmacyHours: '9 AM - 9 PM'
});

// Send test results
await whatsAppRouter.sendTestResultsNotification({
  to: '+919876543210',
  patientName: 'John Doe',
  testName: 'Blood Test - Complete Blood Count'
});

// Send custom message
await whatsAppRouter.sendMessage({
  to: '+919876543210',
  content: 'Your message here',
  route: 'general-support'
});
```

### Bulk Messaging

```javascript
const recipients = [
  { phoneNumber: '+919876543210', patientName: 'John Doe' },
  { phoneNumber: '+919876543211', patientName: 'Jane Smith' }
];

await whatsAppRouter.bulkSendMessages({
  recipients,
  content: 'Hello {{patientName}}, your appointment is confirmed.',
  route: 'appointments',
  templateParams: { /* common params */ }
});
```

## Best Practices

### 1. Number Organization
- **Dedicated Routes**: Assign each number to a specific route for better tracking
- **Multiple Numbers per Route**: Add backup numbers for high-volume routes
- **Priority Distribution**: Spread priorities to ensure even load distribution

### 2. Limit Configuration
- **Start Conservative**: Begin with lower limits and increase based on usage
- **Monitor Usage**: Regularly check usage statistics
- **Buffer Capacity**: Keep some unused capacity for urgent messages

### 3. Provider Selection
For Indian Healthcare:
1. **Gupshup** - Best pricing, local support, healthcare templates
2. **Karix** - Indian company, compliance focus
3. **Facebook** - Free tier, official API
4. **Twilio** - Global reliability, higher costs

### 4. Operating Hours (Optional)
Configure operating hours for non-urgent routes:
```javascript
operatingHours: {
  enabled: true,
  timezone: 'Asia/Kolkata',
  schedule: [
    { day: 'monday', startTime: '09:00', endTime: '18:00' },
    { day: 'tuesday', startTime: '09:00', endTime: '18:00' },
    // ... etc
  ]
}
```

## Monitoring & Analytics

### Dashboard Statistics
Monitor in real-time:
- Total active numbers
- Messages sent today/this month
- Usage percentages
- Available capacity
- Per-route and per-provider statistics

### Usage Alerts
System automatically:
- Fails over to backup numbers when limits reached
- Tracks daily/monthly usage
- Prevents over-limit sending
- Logs all routing decisions

## Troubleshooting

### No Available Numbers Error
**Problem**: "No available WhatsApp number found for route"

**Solutions**:
1. Check if numbers are active and verified
2. Verify daily/monthly limits not exceeded
3. Check operating hours if configured
4. Add more numbers for the route

### Message Not Sending
**Problem**: Messages fail to send

**Solutions**:
1. Verify provider credentials in WhatsApp Config
2. Check number verification status
3. Ensure sufficient daily limit remaining
4. Test number connectivity

### Rate Limiting
**Problem**: Provider rate limits exceeded

**Solutions**:
1. Add more numbers to distribute load
2. Increase daily limits on existing numbers
3. Use priority system for better distribution
4. Implement message queuing for bulk sends

## Migration from Single Number

If you're currently using a single WhatsApp number:

1. **Create your first number**:
   - Add your existing number with route: 'general-support'
   - Set priority: 1
   - Verify the number

2. **Add specialized numbers**:
   - Add dedicated numbers for appointments, prescriptions, etc.
   - Set appropriate priorities

3. **Update application code**:
   - Replace direct WhatsApp service calls with router service
   - Use route-specific methods for better organization

4. **Test thoroughly**:
   - Send test messages through each route
   - Verify routing logic works correctly
   - Monitor usage statistics

## Security Considerations

1. **Phone Number Protection**: Numbers are stored in database, not exposed in frontend
2. **Admin-Only Access**: Only admins can manage WhatsApp numbers
3. **Audit Logging**: All number changes are logged with user ID
4. **Verification Required**: Numbers must be verified before use
5. **Rate Limiting**: Built-in protection against abuse

## Future Enhancements

Planned features:
- [ ] Webhook integration for incoming messages
- [ ] Conversation tracking across numbers
- [ ] Advanced analytics and reporting
- [ ] AI-powered routing optimization
- [ ] Template message builder
- [ ] Number health monitoring
- [ ] Automatic failover testing
- [ ] Cost tracking per provider

## API Reference

See [API Documentation](./API_DOCUMENTATION.md) for complete API reference.

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review API documentation
3. Contact system administrator
4. Check provider documentation

---

**Last Updated**: December 2024
**Version**: 1.0.0
