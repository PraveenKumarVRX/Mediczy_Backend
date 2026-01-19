# Twilio WhatsApp Business API Setup Guide

## Overview
This guide will help you configure Twilio as your WhatsApp provider in Mediczy. Twilio offers one of the easiest and fastest setups for WhatsApp Business API integration.

## Prerequisites
- Twilio Account ([Sign up here](https://www.twilio.com/try-twilio))
- Business verification documents (for production)
- Dedicated phone number for WhatsApp

## Setup Steps

### 1. Create Twilio Account
1. Go to https://www.twilio.com/try-twilio
2. Sign up with your email
3. Verify your email and phone number
4. Complete your profile

### 2. Get Your Twilio Credentials

#### Account SID and Auth Token
1. Log in to [Twilio Console](https://console.twilio.com/)
2. From your dashboard, find:
   - **Account SID**: Found on the main dashboard (e.g., `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - **Auth Token**: Click "Show" to reveal your auth token
3. **Important**: Keep these credentials secure - never share or commit them to version control

#### WhatsApp Sandbox (For Testing)
For testing purposes, Twilio provides a sandbox:

1. Navigate to **Messaging** → **Try it out** → **Send a WhatsApp message**
2. Note your sandbox number (e.g., `whatsapp:+14155238886`)
3. Send "join [your-sandbox-keyword]" to this number from your WhatsApp
4. You can now test sending messages to this number

#### Production WhatsApp Number
For production use:

1. Go to **Messaging** → **Senders** → **WhatsApp senders**
2. Click **"Request to enable my Twilio numbers for WhatsApp"**
3. Follow the business verification process
4. Once approved, your number will be: `whatsapp:+[your-twilio-number]`

### 3. Configure in Mediczy Admin Panel

1. **Login to Admin Dashboard**
   - Navigate to: Admin → WhatsApp Integration

2. **Select Twilio Provider**
   - Find "Twilio WhatsApp Business API" card
   - Click **"Configure"** button

3. **Enter Credentials**
   ```
   Account SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Auth Token: your_auth_token_here
   WhatsApp Phone Number: whatsapp:+14155238886 (sandbox) or whatsapp:+1234567890 (production)
   Sandbox Mode: ☑ (check for testing, uncheck for production)
   ```

4. **Save Configuration**
   - Click "Save Configuration"
   - Wait for confirmation message

5. **Test Connection**
   - Click **"Test"** button on Twilio provider card
   - If successful, you'll see "Connection test successful"

### 4. Send Test Message

1. Go to **Messaging** tab in WhatsApp Integration
2. Enter your WhatsApp number (must be joined to sandbox if using sandbox)
3. Type a test message
4. Click **"Send Test Message"**

### 5. Setup Webhooks (Optional but Recommended)

To receive incoming messages and delivery status:

1. In Twilio Console, go to your WhatsApp sender
2. Under **Webhook Configuration**, set:
   - **When a message comes in**: `https://mayden.in/api/whatsapp/webhook`
   - **Status Callback URL**: `https://mayden.in/api/whatsapp/status`
3. Save webhook settings

## Configuration Details

### Required Fields

| Field | Description | Example | Required |
|-------|-------------|---------|----------|
| Account SID | Your Twilio account identifier | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | ✅ Yes |
| Auth Token | Your Twilio authentication token | `your_auth_token` | ✅ Yes |
| Phone Number | WhatsApp-enabled phone number | `whatsapp:+14155238886` | ✅ Yes |
| Sandbox Mode | Enable for testing with sandbox | `true/false` | ❌ Optional |

### Environment Variables (Alternative Setup)

You can also configure via environment variables in `/root/Mediczy/server/.env`:

```bash
# Twilio WhatsApp Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TWILIO_SANDBOX=true  # Set to false for production
```

## Features Supported

✅ **Text Messages**: Send plain text messages
✅ **Media Messages**: Send images, PDFs, audio, video
✅ **Template Messages**: Pre-approved message templates
✅ **Interactive Messages**: Buttons and lists
✅ **Delivery Reports**: Track message delivery status
✅ **Incoming Messages**: Receive messages via webhooks
✅ **Read Receipts**: Know when messages are read

## Pricing

### Pay-As-You-Go Pricing (India)
- **Conversation-based pricing**: ₹0.65 - ₹2.50 per conversation
- **Business-initiated conversations**: Higher rate
- **User-initiated conversations**: Lower rate
- **24-hour session window**: Multiple messages in 24hrs = 1 conversation

### Free Trial
- New accounts get **$15.50 free credit**
- Enough for ~200-400 messages for testing

### Cost Optimization Tips
1. Use templates for business-initiated messages
2. Respond within 24-hour window (cheaper)
3. Batch notifications to same user
4. Use sandbox for development/testing

## Troubleshooting

### Common Issues

#### 1. Authentication Failed
**Error**: "Authentication failed" or "Invalid credentials"

**Solution**:
- Verify Account SID starts with "AC"
- Double-check Auth Token (click "Show" in console)
- Ensure no extra spaces in credentials
- Regenerate Auth Token if needed

#### 2. Phone Number Format Error
**Error**: "Invalid phone number format"

**Solution**:
- Must include `whatsapp:` prefix
- Format: `whatsapp:+14155238886`
- No spaces or special characters except `+` and `:`

#### 3. Sandbox Not Working
**Error**: "Sandbox number not reachable"

**Solution**:
- Send "join [keyword]" to sandbox number first
- Use your personal WhatsApp number that joined
- Sandbox expires after 3 days of inactivity

#### 4. Production Number Not Working
**Error**: "Number not enabled for WhatsApp"

**Solution**:
- Complete business verification first
- Wait for WhatsApp approval (2-7 days)
- Ensure number is verified in Twilio Console

#### 5. Webhook Not Receiving Messages
**Error**: Incoming messages not showing

**Solution**:
- Verify webhook URL is publicly accessible
- Check webhook URL format: `https://` not `http://`
- Enable status callbacks in Twilio Console
- Check server logs for incoming requests

## API Usage Examples

### Send Simple Text Message

```javascript
const twilioService = require('./services/whatsapp.service');

await twilioService.sendMessage({
  to: '+919876543210',
  content: 'Hello from Mediczy! Your appointment is confirmed.',
  type: 'text'
});
```

### Send Template Message

```javascript
await twilioService.sendMessage({
  to: '+919876543210',
  content: 'Your appointment reminder...',
  type: 'template',
  templateName: 'appointment_reminder'
});
```

### Send Media Message

```javascript
await twilioService.sendMessage({
  to: '+919876543210',
  content: 'Your prescription is attached',
  type: 'media',
  mediaUrl: 'https://example.com/prescription.pdf'
});
```

## Healthcare Use Cases

### 1. Appointment Reminders
```
🩺 Hello {{patient_name}},

This is a reminder for your appointment:
📅 Date: {{appointment_date}}
🕐 Time: {{appointment_time}}
👨‍⚕️ Doctor: {{doctor_name}}

Reply CONFIRM or call us at {{clinic_phone}}
```

### 2. Test Results Available
```
📋 Your test results are now available

Results for: {{test_name}}
Collected on: {{collection_date}}

View your results: {{results_link}}

Need help understanding? Call {{support_phone}}
```

### 3. Prescription Ready
```
💊 Your prescription is ready for pickup!

Patient: {{patient_name}}
Pharmacy: {{pharmacy_name}}
Ready since: {{ready_time}}

Show this message at the pharmacy counter.
```

### 4. Medication Reminder
```
⏰ Medication Reminder

Time to take: {{medication_name}}
Dosage: {{dosage}}
Frequency: {{frequency}}

Set next reminder: {{next_time}}
```

## Best Practices

### 1. Message Content
- Keep messages concise and clear
- Include call-to-action
- Add contact information
- Use emojis sparingly for readability

### 2. Timing
- Send during business hours (9 AM - 8 PM)
- Avoid early morning or late night
- Respect time zones for different locations
- Use scheduled sending for reminders

### 3. Compliance
- Obtain patient consent before sending
- Include opt-out instructions
- Maintain message logs for audit
- Follow healthcare data privacy regulations

### 4. Security
- Never send sensitive health data via WhatsApp
- Use secure links for detailed information
- Implement 2-factor authentication
- Encrypt credentials in database

## Migration from Other Providers

### From Gupshup to Twilio
1. Export your template messages
2. Recreate templates in Twilio
3. Update webhook URLs
4. Test with sandbox before going live

### From Facebook WhatsApp Business
1. Keep Facebook config as backup
2. Add Twilio configuration
3. Test both providers in parallel
4. Switch when Twilio is verified

## Support & Resources

### Twilio Documentation
- [WhatsApp API Docs](https://www.twilio.com/docs/whatsapp)
- [Quickstart Guide](https://www.twilio.com/docs/whatsapp/quickstart)
- [Best Practices](https://www.twilio.com/docs/whatsapp/best-practices)

### Mediczy Support
- Email: support@mediczy.com
- Phone: 1800-XXX-XXXX
- In-app support: Admin → Help & Support

### Twilio Support
- Support Portal: https://support.twilio.com
- Community Forum: https://www.twilio.com/community
- Phone: Available on your Twilio Console

## Next Steps

After successful configuration:

1. ✅ **Test thoroughly** with sandbox
2. ✅ **Request production number** if using sandbox
3. ✅ **Create message templates** for common use cases
4. ✅ **Setup webhooks** for two-way communication
5. ✅ **Train staff** on using WhatsApp messaging
6. ✅ **Monitor usage** and costs regularly

## Changelog

- **2025-11-24**: Initial Twilio WhatsApp integration setup guide
- Added configuration UI in admin panel
- Added provider settings dialog with Twilio fields
- Integrated with existing WhatsApp service layer

---

**Need Help?** Contact our support team or refer to Twilio's comprehensive documentation.
