# WhatsApp Business API Integration Guide

## Overview
This document provides a comprehensive guide for integrating WhatsApp Business API with the Mediczy healthcare platform. The integration supports advanced messaging, templates, media handling, webhooks, and analytics.

## Prerequisites

### 1. WhatsApp Business Account Setup
- Create a WhatsApp Business Account
- Get approved for WhatsApp Business API access
- Obtain the following credentials:
  - Access Token
  - Phone Number ID
  - App ID
  - App Secret
  - Business Account ID
  - Webhook Verify Token

### 2. Environment Configuration
Add the following variables to your `.env` file:

```env
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_here
WHATSAPP_APP_ID=your_app_id_here
WHATSAPP_APP_SECRET=your_app_secret_here
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id_here
```

## API Endpoints

### Base URL
```
http://localhost:8000/api/whatsapp-business
```

### Authentication
All endpoints (except webhooks) require authentication. Include the admin JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Core Functionality

### 1. Business Profile Management

#### Get Business Profile
```http
GET /business/profile
```

#### Update Business Profile
```http
POST /business/profile
Content-Type: application/json

{
  "about": "Mediczy Healthcare - Your trusted healthcare partner",
  "address": "123 Healthcare St, Medical City, MC 12345",
  "description": "Comprehensive healthcare services including telemedicine, lab tests, and pharmacy.",
  "email": "contact@mediczy.com",
  "websites": ["https://mediczy.com"],
  "vertical": "HEALTH"
}
```

### 2. Phone Number Management

#### Get Phone Number Info
```http
GET /phone/info
```

#### Register Phone Number
```http
POST /phone/register
Content-Type: application/json

{
  "pin": "123456"
}
```

#### Request Verification Code
```http
POST /phone/request-code
Content-Type: application/json

{
  "code_method": "SMS",
  "language": "en_US"
}
```

#### Verify Phone Number
```http
POST /phone/verify-code
Content-Type: application/json

{
  "code": "123456"
}
```

### 3. Advanced Messaging

#### Send Text Message
```http
POST /messages/send
Content-Type: application/json

{
  "to": "1234567890",
  "type": "text",
  "content": "Hello! Your appointment is scheduled for tomorrow at 2 PM."
}
```

#### Send Template Message
```http
POST /messages/send
Content-Type: application/json

{
  "to": "1234567890",
  "type": "template",
  "templateName": "appointment_reminder_v2",
  "templateLanguage": "en_US",
  "variables": ["John Doe", "Dr. Smith", "December 15, 2025", "2:00 PM", "+1-555-0123"]
}
```

#### Send Interactive Button Message
```http
POST /messages/interactive/buttons
Content-Type: application/json

{
  "to": "1234567890",
  "headerText": "Appointment Confirmation",
  "bodyText": "Please confirm your appointment for tomorrow at 2 PM with Dr. Smith.",
  "footerText": "Mediczy Healthcare",
  "buttons": [
    {"title": "Confirm"},
    {"title": "Reschedule"},
    {"title": "Cancel"}
  ]
}
```

#### Send Interactive List Message
```http
POST /messages/interactive/list
Content-Type: application/json

{
  "to": "1234567890",
  "bodyText": "Please select your preferred service:",
  "buttonText": "Select Service",
  "sections": [
    {
      "title": "Medical Services",
      "rows": [
        {"id": "consultation", "title": "Online Consultation", "description": "Video call with doctor"},
        {"id": "lab", "title": "Lab Tests", "description": "Home sample collection"},
        {"id": "pharmacy", "title": "Pharmacy", "description": "Medicine delivery"}
      ]
    }
  ]
}
```

#### Send Location Message
```http
POST /messages/send
Content-Type: application/json

{
  "to": "1234567890",
  "type": "location",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "name": "Mediczy Healthcare Center",
  "address": "123 Healthcare St, Medical City, MC 12345"
}
```

#### Send Media Message (Image/Document/Audio/Video)
```http
POST /messages/send
Content-Type: application/json

{
  "to": "1234567890",
  "type": "image",
  "mediaUrl": "https://example.com/prescription.jpg",
  "content": "Your prescription is ready for pickup.",
  "fileName": "prescription_12345.jpg"
}
```

### 4. Bulk Messaging

#### Send Bulk Messages
```http
POST /messages/send-bulk
Content-Type: application/json

{
  "messageData": {
    "type": "template",
    "templateName": "health_checkup_reminder",
    "templateLanguage": "en_US"
  },
  "recipients": [
    {
      "phone": "1234567890",
      "variables": ["John Doe", "6 months"]
    },
    {
      "phone": "9876543210",
      "variables": ["Jane Smith", "1 year"]
    }
  ]
}
```

### 5. Media Management

#### Upload Media
```http
POST /media/upload
Content-Type: multipart/form-data

Form Data:
- media: [file]
```

#### Get Media URL
```http
GET /media/{mediaId}
```

### 6. Template Management

#### Create Message Template
```http
POST /templates/create
Content-Type: application/json

{
  "name": "appointment_reminder_v3",
  "category": "UTILITY",
  "language": "en_US",
  "components": [
    {
      "type": "HEADER",
      "format": "TEXT",
      "text": "Appointment Reminder"
    },
    {
      "type": "BODY",
      "text": "Hello {{1}}, your appointment with {{2}} is scheduled for {{3}} at {{4}}. Please confirm or reschedule if needed."
    },
    {
      "type": "FOOTER",
      "text": "Mediczy Healthcare"
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
  ],
  "allowCategoryChange": false
}
```

#### Get Message Templates
```http
GET /templates?limit=50&fields=name,status,components
```

#### Delete Message Template
```http
DELETE /templates/{templateName}
```

#### Create Healthcare Templates
```http
POST /templates/healthcare
```

### 7. Analytics and Insights

#### Get Analytics
```http
GET /analytics?start=2025-11-01&end=2025-11-30&granularity=daily&metric_types=sent,delivered,read
```

### 8. QR Code Generation

#### Generate QR Code
```http
GET /qr-code?prefilled_message=Hello%20Mediczy&generate_qr_image=PNG
```

### 9. Message Status Tracking

#### Get Message Status
```http
GET /messages/{messageId}/status
```

## Webhook Configuration

### Webhook Verification (GET)
```http
GET /webhook?hub.mode=subscribe&hub.challenge=CHALLENGE_CODE&hub.verify_token=YOUR_VERIFY_TOKEN
```

### Webhook Handler (POST)
```http
POST /webhook
Content-Type: application/json

{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "ENTRY_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "messages": [
              {
                "from": "1234567890",
                "id": "MESSAGE_ID",
                "timestamp": "1699123456",
                "text": {
                  "body": "Hello, I need help"
                },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

## Healthcare-Specific Use Cases

### 1. Appointment Management
- Send appointment reminders with confirmation buttons
- Allow patients to reschedule via interactive messages
- Send appointment confirmations with location details

### 2. Prescription Management
- Notify patients when prescriptions are ready
- Send prescription images or PDFs
- Provide pickup instructions and pharmacy hours

### 3. Lab Results
- Notify patients when test results are available
- Send secure links to view results online
- Provide doctor consultation scheduling

### 4. Health Monitoring
- Send medication reminders
- Collect health data via interactive forms
- Share health tips and educational content

### 5. Emergency Communication
- Send urgent health alerts
- Provide emergency contact information
- Share hospital directions and emergency procedures

## Error Handling

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

## Rate Limiting

WhatsApp Business API has specific rate limits:
- **Messaging**: 250 messages per second per phone number
- **Template Messages**: Limited by messaging throughput tier
- **API Calls**: 4000 requests per hour per access token

## Best Practices

### 1. Message Templates
- Keep templates concise and clear
- Use variables for personalization
- Include clear call-to-action buttons
- Follow WhatsApp's template guidelines

### 2. Media Messages
- Optimize images for mobile viewing
- Keep file sizes reasonable (< 16MB)
- Use appropriate file formats
- Include descriptive captions

### 3. Interactive Messages
- Limit button text to 20 characters
- Use clear and actionable button labels
- Provide fallback text messages
- Handle user responses appropriately

### 4. Webhook Handling
- Verify webhook signatures
- Process messages asynchronously
- Implement idempotency for duplicate messages
- Log all interactions for compliance

### 5. Healthcare Compliance
- Ensure HIPAA compliance for health data
- Use secure media hosting
- Implement proper access controls
- Maintain audit logs

## Troubleshooting

### Common Issues
1. **Authentication Errors**: Check access token validity
2. **Template Rejection**: Review WhatsApp template policies
3. **Rate Limiting**: Implement proper queuing and backoff
4. **Webhook Verification**: Ensure correct verify token
5. **Media Upload Failures**: Check file size and format

### Debug Tools
- Use WhatsApp Business API test numbers
- Enable verbose logging in development
- Monitor webhook delivery status
- Check API response codes and messages

## Security Considerations

### 1. Access Token Management
- Store tokens securely (environment variables)
- Rotate tokens regularly
- Limit token permissions
- Monitor token usage

### 2. Webhook Security
- Verify webhook signatures
- Use HTTPS endpoints
- Implement rate limiting
- Validate incoming data

### 3. Data Protection
- Encrypt sensitive health data
- Implement proper access controls
- Maintain audit logs
- Follow healthcare compliance requirements

## Integration Checklist

- [ ] WhatsApp Business Account approved
- [ ] Environment variables configured
- [ ] Webhook endpoint set up and verified
- [ ] Message templates created and approved
- [ ] Media upload functionality tested
- [ ] Interactive messages implemented
- [ ] Analytics tracking configured
- [ ] Error handling implemented
- [ ] Rate limiting configured
- [ ] Security measures in place
- [ ] Healthcare compliance verified
- [ ] Documentation and training completed

## Support and Resources

### WhatsApp Business API Documentation
- [Official Documentation](https://developers.facebook.com/docs/whatsapp)
- [API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Template Guidelines](https://developers.facebook.com/docs/whatsapp/message-templates)

### Healthcare Integration
- [HIPAA Compliance Guide](https://www.hhs.gov/hipaa/for-professionals/security/guidance/cybersecurity/index.html)
- [Healthcare Communication Best Practices](https://www.healthit.gov/topic/privacy-security-and-hipaa/basics-health-information-privacy)

This integration provides a robust foundation for healthcare communication via WhatsApp Business API, ensuring compliance, security, and excellent patient experience.