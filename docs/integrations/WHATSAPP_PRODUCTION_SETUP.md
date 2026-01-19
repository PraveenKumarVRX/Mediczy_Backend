# WhatsApp Business API Production Setup Guide

## Current Status
- ✅ Twilio account configured and active
- ✅ Test infrastructure ready
- ❌ WhatsApp Business API approval pending
- ❌ Message templates not yet approved

## Step 1: Apply for WhatsApp Business API Access

### 1.1 Access Twilio Console
Go to: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders

### 1.2 Business Profile Setup
You'll need to provide:

**Business Information:**
- Business Name: My SmartHealth (or your registered company name)
- Business Category: Healthcare
- Business Description: Digital healthcare platform providing telemedicine, health monitoring, and corporate wellness solutions
- Business Website: https://mayden.in (or your official website)
- Business Address: Your registered business address
- Business Email: Official business email
- Business Phone: Your business contact number

**Documentation Required:**
- Business Registration Certificate
- GST Certificate (for India)
- Address Proof
- Director/Owner ID Proof
- Bank Statement or Cancelled Cheque

### 1.3 Facebook Business Manager
1. Create/Link Facebook Business Manager account
2. Verify your business on Facebook
3. Link to Twilio WhatsApp sender profile

## Step 2: Create Message Templates

WhatsApp requires pre-approved templates for production. Here are templates for your healthcare platform:

### Template 1: Appointment Confirmation
**Name:** `appointment_confirmation`
**Category:** UTILITY
**Language:** English (en)

```
Hello {{1}},

Your appointment has been confirmed with Dr. {{2}}.

📅 Date: {{3}}
🕐 Time: {{4}}
📍 Location: {{5}}

Please arrive 10 minutes early. Reply CANCEL to cancel this appointment.

- Mediczy Healthcare
```

### Template 2: Appointment Reminder
**Name:** `appointment_reminder`
**Category:** UTILITY
**Language:** English (en)

```
Hi {{1}},

Reminder: You have an appointment with Dr. {{2}} tomorrow at {{3}}.

📍 {{4}}

Reply CONFIRM to confirm or RESCHEDULE to change timing.

- Mediczy Healthcare
```

### Template 3: Health Report Ready
**Name:** `health_report_ready`
**Category:** UTILITY
**Language:** English (en)

```
Hello {{1}},

Your health report is now available. Login to view your results: https://mayden.in/reports

For questions, contact your doctor or call our helpline.

- Mediczy Healthcare
```

### Template 4: Prescription Notification
**Name:** `prescription_ready`
**Category:** UTILITY
**Language:** English (en)

```
Hi {{1}},

Your prescription from Dr. {{2}} is ready. View it here: {{3}}

💊 Medications prescribed: {{4}}
🗓️ Follow-up: {{5}}

- Mediczy Healthcare
```

### Template 5: OTP Verification
**Name:** `otp_verification`
**Category:** AUTHENTICATION
**Language:** English (en)

```
Your Mediczy verification code is: {{1}}

This code expires in 10 minutes. Do not share with anyone.

- Mediczy Healthcare
```

### Template 6: Health Checkup Reminder
**Name:** `health_checkup_reminder`
**Category:** MARKETING
**Language:** English (en)

```
Hi {{1}},

It's time for your annual health checkup! 

Your corporate benefits cover:
✓ Full body checkup
✓ Doctor consultation
✓ Health monitoring

Book now: https://mayden.in/checkup

- Mediczy Healthcare
```

## Step 3: Submit Templates for Approval

1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/templates
2. Click "Create New Template"
3. For each template above:
   - Enter template name
   - Select category
   - Select language
   - Paste template content
   - Use {{1}}, {{2}} for variables
   - Submit for approval

**Approval Time:** Usually 1-48 hours per template

## Step 4: Get WhatsApp Business Number

### Option A: Use Existing Twilio Number
- Port your existing business number to WhatsApp
- Costs: ~$1/month + usage fees

### Option B: Get New Twilio WhatsApp Number
1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/search
2. Select country: India (+91)
3. Enable WhatsApp capability
4. Purchase number (~₹500-1000/month)

## Step 5: Pricing (India)

**Message Costs (per message):**
- User-initiated messages: ₹0.36
- Business-initiated (Marketing): ₹2.24
- Business-initiated (Utility): ₹1.12
- Business-initiated (Authentication): ₹0.56
- Business-initiated (Service): ₹0.56

**Monthly Costs:**
- Phone number: ~₹500-1000/month
- Estimated for 1000 messages/month: ~₹1000-2000

## Step 6: Update Environment Variables

After approval, update these in `.env`:

```env
# Production WhatsApp
TWILIO_ACCOUNT_SID=ACe60079054c0b9f2a7aac3a64a5aea744
TWILIO_AUTH_TOKEN=c9d8dd281b9ef0fd858ff936348740bf
TWILIO_PHONE_NUMBER=whatsapp:+91XXXXXXXXXX (your approved number)

# Template IDs (get these after approval)
WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_HEALTH_REPORT=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_PRESCRIPTION=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_OTP=HXxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_CHECKUP_REMINDER=HXxxxxxxxxxxxxxxxxxxxxx
```

## Step 7: Testing Production

Once approved, test with:
```bash
node test-production-whatsapp.js
```

## Important Production Requirements

### Quality Rating
- Maintain high quality rating to avoid blocking
- Monitor undelivered messages
- Implement opt-out mechanism
- Respond to user messages within 24 hours

### Compliance
- ✓ Only send messages users have opted-in for
- ✓ Include business name in all messages
- ✓ Provide opt-out instructions
- ✓ Honor opt-out requests immediately
- ✓ Don't send promotional content via utility templates

### Best Practices
1. Use appropriate template categories
2. Keep message templates clear and concise
3. Include call-to-action buttons where relevant
4. Monitor delivery rates and user feedback
5. Implement webhook for incoming messages

## Webhook Configuration

After approval, configure webhook in Twilio console:
- URL: `https://mayden.in:9443/api/whatsapp-config/webhook/twilio`
- Events: incoming messages, status updates

## Support & Documentation

- Twilio Support: https://support.twilio.com
- WhatsApp Business Policy: https://www.whatsapp.com/legal/business-policy
- Twilio WhatsApp API: https://www.twilio.com/docs/whatsapp

## Estimated Timeline

- Business verification: 3-5 business days
- WhatsApp approval: 5-7 business days
- Template approval: 1-48 hours per template
- **Total: 1-2 weeks**

## Next Steps

1. ✅ Start business verification process today
2. ✅ Submit all 6 message templates
3. ✅ Apply for WhatsApp Business API access
4. ⏳ Wait for approval (1-2 weeks)
5. ✅ Update production configuration
6. ✅ Test with real users
7. ✅ Monitor and optimize

---

**Note:** Keep sandbox active for development/testing while production approval is pending.
