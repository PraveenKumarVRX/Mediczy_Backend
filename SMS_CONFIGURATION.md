# SMS Configuration Guide (Twilio)

This guide will help you set up Twilio for SMS delivery in the password reset system.

## Overview

The password reset system uses Twilio to send SMS messages containing OTP codes to users. Twilio is a reliable, enterprise-grade communications platform with excellent deliverability.

## Prerequisites

- A credit card or payment method (Twilio requires verification)
- Access to server environment variables
- Admin access to configure the backend

## Step 1: Create Twilio Account

1. Visit [Twilio Sign Up](https://www.twilio.com/try-twilio)
2. Fill in your details:
   - Email address
   - Password
   - First and last name
3. Verify your email address
4. Complete phone verification
5. Answer the questionnaire about your use case:
   - **Product:** Messaging
   - **Use Case:** Alerts & Notifications
   - **Language:** Node.js

## Step 2: Get Your Twilio Credentials

### Account SID and Auth Token

1. Log in to [Twilio Console](https://console.twilio.com/)
2. On the dashboard, you'll see:
   - **Account SID**: A unique identifier for your account (starts with `AC...`)
   - **Auth Token**: Your authentication token (click "View" to reveal)
3. **IMPORTANT**: Keep these credentials secure. Never commit them to version control.

### Get a Twilio Phone Number

1. In the Twilio Console, navigate to **Phone Numbers** > **Manage** > **Buy a number**
2. Select your country
3. Check the **SMS** capability checkbox
4. Click **Search** to find available numbers
5. Choose a number and click **Buy**
6. The number will appear in format `+1234567890`

**Cost**: Typically $1-2/month per number + per-SMS charges

## Step 3: Configure Environment Variables

Add the following variables to your `.env` file:

```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Environment Variable Details

| Variable | Description | Example |
|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | `AC1234567890abcdef1234567890abcdef` |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | `abcdef1234567890abcdef1234567890` |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (with country code) | `+12025551234` |

## Step 4: Verify Implementation

### Backend Service Location

The SMS service is implemented in:
- **Service**: `/server/services/sms.service.js`
- **Password Reset**: `/server/services/password-reset.service.js`

### SMS Service Code

```javascript
// server/services/sms.service.js
const twilio = require('twilio');

class SMSService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  async sendSMS(to, message) {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('SMS send error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SMSService();
```

## Step 5: Install Twilio SDK

If not already installed, add the Twilio package:

```bash
cd /home/ubuntu/Mediczy/server
npm install twilio
```

## Step 6: Test SMS Delivery

### Manual Test Script

Create a test script to verify SMS delivery:

```bash
# test-sms.js
require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function testSMS() {
  try {
    const message = await client.messages.create({
      body: 'Test message from Mediczy - Your OTP is: 123456',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: '+1234567890' // Replace with your phone number
    });
    
    console.log('✅ SMS sent successfully!');
    console.log('Message SID:', message.sid);
    console.log('Status:', message.status);
  } catch (error) {
    console.error('❌ SMS failed:', error.message);
  }
}

testSMS();
```

Run the test:
```bash
node test-sms.js
```

### Test via Password Reset API

Test the complete password reset flow:

```bash
curl -X POST http://localhost:8000/api/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "phone": "+1234567890",
    "userType": "user"
  }'
```

## Step 7: Monitor SMS Delivery

### Twilio Console

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Monitor** > **Logs** > **Messaging**
3. View all sent messages with:
   - Status (delivered, failed, etc.)
   - Timestamp
   - Error codes (if any)

### Common Status Codes

| Status | Description |
|--------|-------------|
| `queued` | Message is queued for sending |
| `sent` | Message sent to carrier |
| `delivered` | Message delivered to recipient |
| `undelivered` | Message failed to deliver |
| `failed` | Message failed before reaching carrier |

## Troubleshooting

### Issue: "The number +XXX is unverified"

**Cause**: Trial accounts can only send to verified numbers.

**Solution**:
1. Add the recipient number to verified numbers:
   - Go to **Phone Numbers** > **Manage** > **Verified Caller IDs**
   - Click **Add a new Caller ID**
   - Enter phone number and verify via SMS
2. **OR** upgrade to a paid account (recommended for production)

### Issue: "Authentication Error"

**Cause**: Invalid Account SID or Auth Token.

**Solution**:
1. Double-check your `.env` variables
2. Regenerate Auth Token if necessary:
   - Console > Settings > General
   - Click **View** next to Auth Token
   - Or generate a secondary token

### Issue: "Invalid 'From' Phone Number"

**Cause**: The phone number format is incorrect or not owned by your account.

**Solution**:
1. Ensure format includes country code: `+1234567890`
2. Verify the number exists in your Twilio account:
   - Console > Phone Numbers > Manage > Active Numbers

### Issue: Messages Not Delivered

**Causes and Solutions**:

1. **Recipient's phone is off or out of service**
   - Check delivery status in Twilio Console
   - Wait and retry

2. **Carrier blocking**
   - Some carriers block automated messages
   - Register your use case with Twilio: [Message Campaign Registry](https://www.twilio.com/docs/sms/a2p-10dlc)

3. **Content filtering**
   - Avoid spam trigger words
   - Keep messages clear and professional

4. **International sending restrictions**
   - Enable international permissions in Twilio Console
   - Check [Geographic Permissions](https://www.twilio.com/console/sms/settings/geo-permissions)

### Issue: High Costs

**Solution**: Optimize SMS usage
1. Only send SMS to users who provide phone numbers
2. Consider email as primary channel, SMS as fallback
3. Set up usage alerts in Twilio Console
4. Use Twilio's free tier during development

## Production Checklist

Before going live, ensure:

- [ ] Twilio account is upgraded (not trial)
- [ ] Phone number is purchased and verified
- [ ] Environment variables are set in production
- [ ] Test SMS delivery to real phone numbers
- [ ] Set up [Message Campaign Registry](https://www.twilio.com/docs/sms/a2p-10dlc) (US only, required for A2P messaging)
- [ ] Enable international sending if needed
- [ ] Configure usage alerts and billing limits
- [ ] Review Twilio's [Messaging Best Practices](https://www.twilio.com/docs/sms/best-practices)
- [ ] Implement rate limiting to prevent abuse
- [ ] Monitor delivery rates and error logs

## Cost Estimation

### Twilio Pricing (as of 2024)

- **Phone Number**: ~$1-2/month
- **SMS (US/Canada)**: $0.0079 per message
- **SMS (International)**: Varies by country ($0.02-0.20 per message)

### Example Monthly Cost

For 1,000 password resets per month (US only):
- Phone number: $1.50/month
- SMS: 1,000 × $0.0079 = $7.90/month
- **Total**: ~$9.40/month

## Alternative SMS Providers

If Twilio doesn't meet your needs, consider:

1. **AWS SNS (Amazon Simple Notification Service)**
   - Lower cost for high volume
   - Requires AWS account
   - Less user-friendly interface

2. **MessageBird**
   - Similar features to Twilio
   - Competitive pricing
   - Good international coverage

3. **Vonage (formerly Nexmo)**
   - Enterprise-grade reliability
   - Global presence
   - Higher pricing tier

## Security Best Practices

1. **Never expose credentials**
   - Use environment variables
   - Add `.env` to `.gitignore`
   - Rotate tokens regularly

2. **Implement rate limiting**
   - Prevent SMS bombing
   - Limit OTP requests per user/IP

3. **Message content**
   - Don't include sensitive data beyond OTP
   - Keep messages professional
   - Include app name for context

4. **Logging**
   - Log SMS attempts (but not content)
   - Monitor for suspicious patterns
   - Set up alerts for failures

## Support Resources

- **Twilio Documentation**: https://www.twilio.com/docs/sms
- **Twilio Support**: https://support.twilio.com/
- **Twilio Status Page**: https://status.twilio.com/
- **Community Forum**: https://www.twilio.com/community

## Next Steps

After SMS is configured:
1. ✅ Test SMS delivery thoroughly
2. ⬜ Configure WhatsApp Business API (see `WHATSAPP_CONFIGURATION.md`)
3. ⬜ Set up monitoring and alerts
4. ⬜ Document operational procedures

---

**Need Help?**

If you encounter issues:
1. Check the troubleshooting section above
2. Review Twilio Console logs
3. Consult Twilio's excellent documentation
4. Contact Twilio support (they're very responsive)
