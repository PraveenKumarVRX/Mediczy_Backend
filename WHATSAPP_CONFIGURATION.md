# WhatsApp Configuration Guide

This guide will help you set up WhatsApp Business API for delivering OTP codes via WhatsApp in the password reset system.

## Overview

WhatsApp Business API allows you to send messages to users via WhatsApp, providing a reliable and familiar communication channel. Unlike the WhatsApp Business app, the API is designed for automated messaging at scale.

## Important Distinctions

### WhatsApp Business App vs WhatsApp Business API

| Feature | WhatsApp Business App | WhatsApp Business API |
|---------|----------------------|----------------------|
| **Target Audience** | Small businesses | Medium to large businesses |
| **Automation** | Limited | Full automation supported |
| **Multiple Users** | 1-4 devices | Unlimited |
| **API Access** | No | Yes |
| **Cost** | Free | Paid (per message) |
| **Approval** | Instant | Requires approval |

**For this integration, you need the WhatsApp Business API.**

## Provider Options

WhatsApp doesn't provide direct API access. You must use an authorized Business Solution Provider (BSP):

### Option 1: Twilio (Recommended)

**Pros:**
- Same provider as SMS (unified billing)
- Excellent documentation
- Easy integration
- Reliable delivery
- Good developer experience

**Cons:**
- Higher cost than some alternatives
- Requires Facebook Business Manager setup

### Option 2: MessageBird

**Pros:**
- Competitive pricing
- Good API documentation
- Strong international coverage

**Cons:**
- Separate provider from SMS
- More complex setup

### Option 3: 360dialog

**Pros:**
- WhatsApp-focused provider
- Transparent pricing
- European data centers

**Cons:**
- Less known brand
- Smaller developer community

### Option 4: Meta Cloud API (Direct)

**Pros:**
- Direct from Meta/Facebook
- No BSP markup
- Good for high volume

**Cons:**
- More complex setup
- Requires Facebook Business Manager
- Less developer-friendly

## Setup Guide: Twilio WhatsApp API

This guide focuses on Twilio as it's the most straightforward option.

### Prerequisites

- Twilio account (same as SMS setup)
- Facebook Business Manager account
- Business verification documents
- A phone number for your business

### Step 1: Request Access to WhatsApp

1. Log in to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Messaging** > **Try it out** > **Send a WhatsApp message**
3. Click **Get started with WhatsApp**
4. Follow the onboarding wizard

### Step 2: Connect to Facebook Business Manager

1. Create a [Facebook Business Manager](https://business.facebook.com/) account if you don't have one
2. In Twilio Console, navigate to **Messaging** > **WhatsApp** > **Senders**
3. Click **Create New Sender**
4. Follow the prompts to:
   - Connect your Facebook Business Manager account
   - Verify your business
   - Submit business profile information

**Business Verification Required:**
- Legal business name
- Business address
- Business phone number
- Business email
- Business website (optional but recommended)
- Tax ID or business registration documents

### Step 3: Submit Display Name and Profile

1. Choose your **WhatsApp Display Name**:
   - Must match your business name
   - Will be shown to users
   - Requires approval from WhatsApp
   - Example: "Mediczy Health"

2. Upload a **Profile Picture**:
   - Square image (640x640px recommended)
   - Represents your brand
   - Clear and professional

3. Write a **Business Description**:
   - 256 characters max
   - Describes your business
   - Example: "Mediczy - Your trusted healthcare platform for appointments, consultations, and health management."

### Step 4: Request Message Template Approval

WhatsApp requires pre-approved message templates for business-initiated conversations.

#### Create OTP Template

1. Go to **Messaging** > **WhatsApp** > **Message Templates**
2. Click **Create New Template**
3. Fill in template details:

**Template Name**: `password_reset_otp`

**Template Category**: `Authentication`

**Template Language**: English (or your target languages)

**Template Content**:
```
Your Mediczy password reset code is: {{1}}

This code will expire in 10 minutes. Do not share this code with anyone.

If you didn't request this, please ignore this message.
```

**Variables:**
- `{{1}}`: OTP code (6 digits)

4. Submit for approval (typically approved within 24 hours)

#### Template Best Practices

- **Be Clear**: State the purpose immediately
- **Include Security**: Mention expiration and not to share
- **Brand Name**: Include your app/company name
- **Call to Action**: Tell users what to do
- **No URLs**: WhatsApp restricts URLs in authentication templates

### Step 5: Get WhatsApp Sender

Once approved, you'll get a WhatsApp sender number:

1. Navigate to **Messaging** > **WhatsApp** > **Senders**
2. Copy your WhatsApp sender number (format: `whatsapp:+14155238886`)

### Step 6: Configure Environment Variables

Add to your `.env` file:

```bash
# WhatsApp Configuration (Twilio)
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
WHATSAPP_TEMPLATE_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Environment Variable Details

| Variable | Description | Example |
|----------|-------------|---------|
| `TWILIO_WHATSAPP_NUMBER` | Your WhatsApp sender number | `whatsapp:+14155238886` |
| `WHATSAPP_TEMPLATE_SID` | Template SID from Twilio | `HXabcdef1234567890abcdef1234567890` |

## Implementation

### Backend Service Code

Update your notification service to use WhatsApp templates:

```javascript
// server/services/notification.service.js
const twilio = require('twilio');

class NotificationService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  async sendWhatsAppOTP(to, otp) {
    try {
      // Format recipient number with whatsapp: prefix
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      const result = await this.client.messages.create({
        from: this.whatsappNumber,
        to: toNumber,
        body: `Your Mediczy password reset code is: ${otp}\n\nThis code will expire in 10 minutes. Do not share this code with anyone.\n\nIf you didn't request this, please ignore this message.`
      });

      return { 
        success: true, 
        messageId: result.sid,
        status: result.status
      };
    } catch (error) {
      console.error('WhatsApp send error:', error);
      return { 
        success: false, 
        error: error.message,
        code: error.code
      };
    }
  }
}

module.exports = new NotificationService();
```

### Using Message Templates (Production)

For production, use approved templates with ContentSid:

```javascript
async sendWhatsAppOTP(to, otp) {
  try {
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    const result = await this.client.messages.create({
      from: this.whatsappNumber,
      to: toNumber,
      contentSid: process.env.WHATSAPP_TEMPLATE_SID,
      contentVariables: JSON.stringify({
        1: otp  // Replace {{1}} with OTP code
      })
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error.message };
  }
}
```

## Step 7: Test WhatsApp Delivery

### Sandbox Testing (Development)

Before going live, use Twilio's WhatsApp Sandbox:

1. In Twilio Console, go to **Messaging** > **Try it out** > **Send a WhatsApp message**
2. Follow instructions to join your sandbox:
   - Scan QR code or send WhatsApp message to Twilio number
   - Send: `join <your-sandbox-name>`
3. You can now test messages from sandbox number

**Test Script:**

```javascript
// test-whatsapp.js
require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function testWhatsApp() {
  try {
    const message = await client.messages.create({
      from: 'whatsapp:+14155238886', // Twilio sandbox number
      to: 'whatsapp:+1234567890', // Your WhatsApp number
      body: 'Test message from Mediczy - Your OTP is: 123456'
    });
    
    console.log('✅ WhatsApp message sent!');
    console.log('Message SID:', message.sid);
    console.log('Status:', message.status);
  } catch (error) {
    console.error('❌ WhatsApp failed:', error.message);
  }
}

testWhatsApp();
```

### Production Testing

After approval, test with real users:

```bash
curl -X POST http://localhost:8000/api/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phone": "+1234567890",
    "userType": "user"
  }'
```

## Monitoring and Analytics

### Twilio Console Monitoring

1. Navigate to **Monitor** > **Logs** > **Messaging**
2. Filter by **WhatsApp** channel
3. View message status:
   - `queued`: Message queued for delivery
   - `sent`: Sent to WhatsApp
   - `delivered`: Delivered to recipient
   - `read`: Read by recipient (if read receipts enabled)
   - `failed`: Failed to deliver

### Message Status Webhooks

Set up webhooks to track delivery status:

```javascript
// server/routes/webhooks.route.js
router.post('/twilio/status', async (req, res) => {
  const { MessageSid, MessageStatus, To, ErrorCode, ErrorMessage } = req.body;
  
  console.log(`WhatsApp Message ${MessageSid} status: ${MessageStatus}`);
  
  if (MessageStatus === 'failed') {
    console.error(`Failed to ${To}: ${ErrorCode} - ${ErrorMessage}`);
  }
  
  res.sendStatus(200);
});
```

Configure webhook URL in Twilio Console:
- **Messaging** > **Settings** > **WhatsApp webhook**
- URL: `https://yourdomain.com/webhooks/twilio/status`

## Troubleshooting

### Issue: "User has not opted in"

**Cause**: User hasn't accepted your Terms of Service for WhatsApp messaging.

**Solution**:
1. Users must initiate first conversation (send any message to your number)
2. OR you must use approved message templates
3. Implement opt-in flow on your platform

### Issue: "Template not approved"

**Cause**: Your message template is pending or rejected.

**Solution**:
1. Check template status in Twilio Console
2. If rejected, review feedback and resubmit
3. Ensure template follows WhatsApp guidelines

### Issue: "Message rejected - spam"

**Cause**: WhatsApp detected spammy behavior.

**Solution**:
1. Don't send too many messages in short time
2. Implement rate limiting
3. Ensure users opted in
4. Use approved templates only

### Issue: "Invalid phone number format"

**Cause**: Phone number not in correct format.

**Solution**:
1. Use international format: `+1234567890`
2. Include country code
3. Prefix with `whatsapp:` for API calls

### Issue: "Business verification pending"

**Cause**: Facebook hasn't verified your business yet.

**Solution**:
1. Check verification status in Facebook Business Manager
2. Provide all required documents
3. Wait for approval (can take 1-3 business days)
4. Contact Facebook support if delayed

## Pricing

### Twilio WhatsApp Pricing (as of 2024)

**Conversation Types:**

1. **User-Initiated**: Free for 24 hours after user message
2. **Business-Initiated**: 
   - Authentication: $0.005 - $0.025 per message (varies by country)
   - Marketing: $0.025 - $0.15 per message
   - Utility: $0.01 - $0.05 per message

**For Password Reset (Authentication):**
- **US**: ~$0.005 per message
- **India**: ~$0.01 per message
- **UK**: ~$0.015 per message

### Cost Example

For 1,000 password resets per month (US):
- WhatsApp messages: 1,000 × $0.005 = $5/month

**Much cheaper than SMS!** ($5 vs $7.90 for Twilio SMS)

## WhatsApp vs SMS: When to Use What

### Use WhatsApp When:
✅ User has WhatsApp (2+ billion users worldwide)
✅ Cost savings important (cheaper than SMS in most countries)
✅ Want rich media (images, buttons - future feature)
✅ Higher engagement desired (90%+ open rates)

### Use SMS When:
✅ User doesn't have WhatsApp
✅ Universal delivery needed (works on all phones)
✅ Immediate setup (no approval process)
✅ Simpler compliance requirements

### Best Practice: Multi-Channel
Send via all available channels (Email + SMS + WhatsApp) for:
- Maximum reliability
- User convenience
- Redundancy if one channel fails

## Compliance and Best Practices

### WhatsApp Commerce Policy

Must comply with:
1. **Opt-In Required**: Users must consent to receiving messages
2. **Clear Identification**: Messages must clearly identify your business
3. **Opt-Out Mechanism**: Provide way to stop messages
4. **No Spam**: Only send relevant, timely messages
5. **Data Privacy**: Comply with GDPR, CCPA, local laws

### Message Content Guidelines

**Do:**
- Use approved templates for business-initiated messages
- Be concise and clear
- Include security warnings for OTPs
- Respect user privacy

**Don't:**
- Send marketing content in authentication messages
- Include URLs (restricted in authentication templates)
- Send too frequently (rate limit)
- Use misleading or deceptive content

### Opt-In Best Practices

Implement clear opt-in on your platform:

```
□ I agree to receive password reset codes and account 
  notifications via WhatsApp. Message and data rates may apply.
  
  [WhatsApp Terms] [Privacy Policy]
```

## Production Checklist

Before launching WhatsApp:

- [ ] Twilio account set up and verified
- [ ] Facebook Business Manager created
- [ ] Business verification completed
- [ ] WhatsApp Business Profile created
- [ ] Display name approved
- [ ] Message template(s) approved
- [ ] Environment variables configured
- [ ] Backend integration complete
- [ ] Opt-in mechanism implemented
- [ ] Rate limiting configured
- [ ] Webhook for delivery status set up
- [ ] Testing completed in sandbox
- [ ] Testing completed in production
- [ ] Error handling implemented
- [ ] Monitoring and logging set up
- [ ] Documentation updated

## Alternative: Meta Cloud API (Direct)

If you want to avoid BSP fees, use Meta's Cloud API directly:

### Setup Steps:

1. Create [Meta Developer Account](https://developers.facebook.com/)
2. Create a new App
3. Add WhatsApp product
4. Configure Business Account
5. Get Access Token
6. Set up webhook

### Implementation:

```javascript
// server/services/meta-whatsapp.service.js
const axios = require('axios');

class MetaWhatsAppService {
  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.phoneNumberId = process.env.META_PHONE_NUMBER_ID;
    this.baseUrl = 'https://graph.facebook.com/v18.0';
  }

  async sendWhatsAppOTP(to, otp) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: 'password_reset_otp',
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: otp }]
              }
            ]
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return { success: true, messageId: response.data.messages[0].id };
    } catch (error) {
      console.error('Meta WhatsApp error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MetaWhatsAppService();
```

**Pros of Meta Cloud API:**
- No BSP markup fees
- Direct integration with Meta
- Good for high volume

**Cons:**
- More complex setup
- Less developer-friendly
- Requires more maintenance

## Support Resources

- **Twilio WhatsApp Docs**: https://www.twilio.com/docs/whatsapp
- **WhatsApp Business API Docs**: https://developers.facebook.com/docs/whatsapp
- **Meta Cloud API**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **WhatsApp Commerce Policy**: https://www.whatsapp.com/legal/commerce-policy
- **Twilio Support**: https://support.twilio.com/

## Next Steps

After WhatsApp is configured:
1. ✅ Test delivery thoroughly
2. ✅ Monitor initial messages closely
3. ⬜ Set up analytics and tracking
4. ⬜ Implement opt-in mechanism
5. ⬜ Create fallback logic if delivery fails
6. ⬜ Document user-facing features

---

**Summary**: WhatsApp provides excellent engagement and cost efficiency for OTP delivery. While setup is more complex than SMS, the benefits are significant for user experience and cost savings.
