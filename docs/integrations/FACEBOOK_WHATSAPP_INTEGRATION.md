# Facebook WhatsApp Business Manager Integration

## Overview

This document provides comprehensive information about the Facebook WhatsApp Business Manager integration implemented in the Mediczy healthcare platform. This integration enables healthcare providers to communicate with patients through WhatsApp using Facebook's official WhatsApp Business API.

## Features Implemented

### 🏢 Business Account Management
- **Business Account Info**: Retrieve business account details, timezone, and review status
- **Phone Number Management**: Get all phone numbers associated with the business account
- **Phone Number Details**: Detailed information about specific phone numbers including quality rating

### 📱 Advanced Messaging
- **Text Messages**: Send text messages with preview URL support
- **Template Messages**: Healthcare-specific templates with variables and buttons
- **Interactive Messages**: Buttons and list-based interactive content
- **Media Messages**: Images, documents, audio, and video with Facebook Graph API
- **Location Messages**: Send location coordinates with name and address
- **Contact Messages**: Share contact information
- **Bulk Messaging**: Send messages to multiple recipients with rate limiting

### 📄 Template Management
- **Create Templates**: Healthcare-specific message templates
- **Template Library**: Pre-built templates for appointments, test results, prescriptions
- **Template Status**: Track template approval status and quality scores
- **Template Analytics**: Performance metrics for each template

### 📊 Analytics & Insights
- **Message Analytics**: Sent, delivered, and read message statistics
- **Conversation Metrics**: Total conversations and engagement rates
- **Quality Scoring**: Phone number quality ratings and account health
- **Cost Analysis**: Message costs and conversation pricing
- **Error Tracking**: Failed message analysis and error categorization

### 🔌 Webhook Integration
- **Message Webhooks**: Real-time incoming message processing
- **Status Webhooks**: Message delivery and read status updates
- **Auto-responses**: Healthcare-specific automated responses
- **Error Handling**: Comprehensive webhook error processing

### 🔧 Media Management
- **Media Upload**: Upload images, documents, audio, and video files
- **Media Download**: Retrieve uploaded media files
- **Media Information**: Get metadata about uploaded media
- **File Validation**: Support for multiple file formats and size limits

## Environment Configuration

### Required Environment Variables

```env
# Facebook App Configuration
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_ACCESS_TOKEN=your_permanent_access_token

# WhatsApp Business Configuration
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_PHONE_NUMBER=your_phone_number_with_country_code

# Graph API Configuration
FACEBOOK_GRAPH_API_VERSION=v18.0
FACEBOOK_GRAPH_API_URL=https://graph.facebook.com

# Webhook Configuration
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
```

### Facebook App Setup Requirements

1. **Facebook Developer Account**: Create account at [developers.facebook.com](https://developers.facebook.com)
2. **Facebook App**: Create a new app with WhatsApp Business product
3. **WhatsApp Business Account**: Connect your business account
4. **Phone Number**: Add and verify a phone number
5. **Webhooks**: Configure webhook endpoints for message handling
6. **Permissions**: Ensure your app has necessary permissions

## API Endpoints

### Business Management
```
GET    /api/whatsapp-business/business-account       # Business account info
GET    /api/whatsapp-business/phone-numbers          # Phone numbers list
GET    /api/whatsapp-business/phone-number/:id       # Phone number details
POST   /api/whatsapp-business/business/profile       # Update business profile
```

### Messaging
```
POST   /api/whatsapp-business/messages/send          # Send message
POST   /api/whatsapp-business/messages/template      # Send template message
POST   /api/whatsapp-business/messages/bulk          # Send bulk messages
POST   /api/whatsapp-business/message                # Advanced messaging
```

### Templates
```
GET    /api/whatsapp-business/templates              # Get templates
POST   /api/whatsapp-business/templates              # Create template
GET    /api/whatsapp-business/templates/:id          # Get specific template
DELETE /api/whatsapp-business/templates/:id          # Delete template
POST   /api/whatsapp-business/templates/healthcare   # Create healthcare templates
```

### Media
```
POST   /api/whatsapp-business/upload                 # Upload media
GET    /api/whatsapp-business/media/:id              # Get media info
GET    /api/whatsapp-business/media/:id/download     # Download media
```

### Analytics
```
GET    /api/whatsapp-business/analytics              # Get analytics
```

### Webhooks
```
GET    /api/whatsapp-business/webhook                # Webhook verification
POST   /api/whatsapp-business/webhook                # Webhook handler
```

## Healthcare-Specific Templates

### 1. Appointment Reminder
```json
{
  "name": "appointment_reminder",
  "category": "UTILITY",
  "language": "en_US",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "🩺 Appointment Reminder"
    },
    {
      "type": "BODY",
      "text": "Hello {{1}}, this is a reminder for your appointment with Dr. {{2}} on {{3}} at {{4}}. Please reply YES to confirm or NO to reschedule."
    },
    {
      "type": "FOOTER",
      "text": "Mediczy Health Platform"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "QUICK_REPLY",
          "text": "Confirm"
        },
        {
          "type": "QUICK_REPLY",
          "text": "Reschedule"
        }
      ]
    }
  ]
}
```

### 2. Test Results Ready
```json
{
  "name": "test_results_ready",
  "category": "UTILITY",
  "language": "en_US",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT", 
      "text": "📋 Test Results Available"
    },
    {
      "type": "BODY",
      "text": "Hello {{1}}, your test results for {{2}} are now available. Please log into your Mediczy account or visit the clinic to view your results."
    },
    {
      "type": "FOOTER",
      "text": "Mediczy Health Platform"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "URL",
          "text": "View Results",
          "url": "https://mediczy.com/results/{{3}}"
        }
      ]
    }
  ]
}
```

### 3. Prescription Ready
```json
{
  "name": "prescription_ready",
  "category": "UTILITY",
  "language": "en_US",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "💊 Prescription Ready"
    },
    {
      "type": "BODY",
      "text": "Hello {{1}}, your prescription from Dr. {{2}} is ready for pickup at {{3}}. Pharmacy hours: {{4}}."
    },
    {
      "type": "FOOTER",
      "text": "Mediczy Health Platform"
    }
  ]
}
```

## Usage Examples

### Sending a Text Message
```javascript
const response = await fetch('/api/whatsapp-business/messages/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: '+1234567890',
    type: 'text',
    text: {
      body: 'Hello! Your appointment is confirmed for tomorrow at 2 PM.',
      preview_url: false
    }
  })
});
```

### Sending a Template Message
```javascript
const response = await fetch('/api/whatsapp-business/messages/template', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: '+1234567890',
    templateName: 'appointment_reminder',
    templateLanguage: 'en_US',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'John Doe' },
          { type: 'text', text: 'Dr. Smith' },
          { type: 'text', text: 'January 15, 2024' },
          { type: 'text', text: '2:00 PM' }
        ]
      }
    ]
  })
});
```

### Bulk Messaging
```javascript
const response = await fetch('/api/whatsapp-business/messages/bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    recipients: [
      { phone: '+1234567890', name: 'John Doe' },
      { phone: '+0987654321', name: 'Jane Smith' }
    ],
    message: {
      type: 'text',
      text: {
        body: 'Hello {{name}}, your test results are ready!'
      }
    }
  })
});
```

## Auto-Response System

The webhook handler includes healthcare-specific auto-responses:

### Trigger Keywords and Responses

| Keywords | Auto-Response |
|----------|---------------|
| `appointment`, `booking` | Link to appointment booking page |
| `emergency`, `urgent` | Emergency contact information and urgent care link |
| `test results`, `reports` | Login link to view test results |
| `prescription`, `medicine` | Pharmacy contact and prescription information |
| `help`, `hi`, `hello` | Welcome message with available services |

### Example Auto-Response
```javascript
const handleTextMessage = async (message, phoneNumberId) => {
  const messageText = message.text.body.toLowerCase();
  let responseText = null;
  
  if (messageText.includes('appointment')) {
    responseText = "🩺 To book an appointment, please visit: https://mediczy.com/appointments";
  } else if (messageText.includes('emergency')) {
    responseText = "🚨 For emergencies, call 911. For urgent care: https://mediczy.com/emergency";
  }
  
  if (responseText) {
    await sendAutoResponse(message.from, responseText, phoneNumberId);
  }
};
```

## Frontend Integration

### Admin Dashboard Components

The admin dashboard includes comprehensive WhatsApp management:

1. **Overview Tab**
   - Real-time message statistics
   - Active conversations
   - Quality rating display
   - Recent activity feed

2. **Templates Tab**
   - Template library
   - Template creation form
   - Status tracking
   - Performance metrics

3. **Campaigns Tab**
   - Bulk messaging interface
   - Recipient management
   - Campaign scheduling
   - Success tracking

4. **Messages Tab**
   - Individual message sending
   - Message history
   - Contact management
   - Interactive message builder

5. **Analytics Tab**
   - Comprehensive metrics
   - Charts and graphs
   - Export functionality
   - Custom date ranges

### Admin Access

- **URL**: `https://mediczy.com:9443/admin/whatsapp`
- **Authentication**: Admin credentials required
  - Email: `admin@mediczy.com`
  - Password: `SecurePass123`

## Security & Compliance

### Data Protection
- All messages are encrypted in transit
- Webhook verification prevents unauthorized access
- Access token rotation for security
- HIPAA-compliant data handling

### Rate Limiting
- Bulk messaging uses batches of 5 messages
- 1-second delay between batches
- Automatic retry mechanism for failed messages
- Respect for Facebook API rate limits

### Error Handling
- Comprehensive error logging
- Graceful fallback mechanisms
- User-friendly error messages
- Automatic retry for transient failures

## Development & Testing

### Local Development
1. Start backend server: `npm run start` (port 8000)
2. Start frontend: `npm run dev` (port 9443)
3. Access admin dashboard: `http://localhost:9443/admin/whatsapp`

### Testing Endpoints
Use tools like Postman or curl to test endpoints:

```bash
# Test business account endpoint
curl -X GET "http://localhost:8000/api/whatsapp-business/business-account" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test message sending
curl -X POST "http://localhost:8000/api/whatsapp-business/messages/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"to": "+1234567890", "type": "text", "text": {"body": "Test message"}}'
```

## Troubleshooting

### Common Issues

1. **Access Token Errors**
   - Ensure `FACEBOOK_ACCESS_TOKEN` is valid and permanent
   - Check token permissions and expiration

2. **Webhook Verification Fails**
   - Verify `FACEBOOK_WEBHOOK_VERIFY_TOKEN` matches Facebook configuration
   - Ensure webhook URL is publicly accessible

3. **Phone Number Not Verified**
   - Complete phone number verification in Facebook Business Manager
   - Check business account approval status

4. **Template Creation Fails**
   - Ensure template complies with WhatsApp Business policies
   - Check for required business account approval

5. **Message Delivery Issues**
   - Verify recipient phone number format
   - Check phone number is WhatsApp-enabled
   - Review message content for policy compliance

### Monitoring & Logs

- Backend logs include detailed API interaction information
- Webhook events are logged for debugging
- Error tracking with specific error codes
- Performance metrics for optimization

## Facebook Graph API Integration Details

### API Version
- Using Graph API v18.0 for latest features and stability
- Automatic API version management through environment variables

### Authentication Flow
1. Facebook App token verification
2. Permanent access token for API calls
3. Business account permission verification
4. Phone number authorization check

### Supported Message Types
- Text messages with formatting
- Media messages (images, documents, audio, video)
- Template messages with variables and buttons
- Interactive messages with quick replies
- Location sharing
- Contact sharing
- List messages for multiple options

## Compliance & Best Practices

### WhatsApp Business Policy Compliance
- Template message guidelines adherence
- 24-hour messaging window respect
- Opt-in/opt-out handling
- Content policy compliance

### Healthcare Regulations
- HIPAA compliance for patient data
- Secure message transmission
- Patient consent management
- Data retention policies

### Performance Optimization
- Message batching for bulk operations
- Efficient webhook processing
- Database query optimization
- Caching for frequently accessed data

## Future Enhancements

### Planned Features
1. **Advanced Analytics Dashboard**
   - Real-time conversation analytics
   - Patient engagement metrics
   - Cost optimization insights

2. **AI-Powered Auto-Responses**
   - Intelligent message routing
   - Natural language processing
   - Automated appointment scheduling

3. **Multi-Language Support**
   - Template translations
   - Language detection
   - Localized responses

4. **Integration Expansions**
   - Electronic Health Records (EHR) integration
   - Appointment system synchronization
   - Payment processing integration

5. **Advanced Workflow Automation**
   - Automated follow-up sequences
   - Reminder workflows
   - Treatment adherence tracking

---

## Support

For technical support or questions about the Facebook WhatsApp Business Manager integration:

- **Documentation**: This file and inline code comments
- **API Reference**: [Facebook for Developers](https://developers.facebook.com/docs/whatsapp)
- **Backend Code**: `/server/controller/whatsapp.business.controller.js`
- **Frontend Code**: `/client/src/pages/admin/WhatsAppManagement.tsx`
- **Routes**: `/server/routes/whatsapp.business.route.js`

## Conclusion

The Facebook WhatsApp Business Manager integration provides a comprehensive solution for healthcare communication through WhatsApp. With features including advanced messaging, template management, analytics, and automated responses, healthcare providers can efficiently communicate with patients while maintaining compliance and security standards.

The integration is production-ready with proper error handling, security measures, and scalability considerations. The admin dashboard provides an intuitive interface for managing all WhatsApp Business functionality.