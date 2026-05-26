# ✅ RocketChat Integration Complete!

## Configuration Applied

### Environment Variables Configured

```bash
# RocketChat Server
ROCKETCHAT_URL=https://smart-chat.live
ROCKETCHAT_USER_ID=AAAXSfxydgRxBhHaJ
ROCKETCHAT_AUTH_TOKEN=0hoYIxI2zxVuyUVX6rltCNswMkXcb9WWCwdMRGQiRNs

# Incoming webhook - Send WhatsApp messages TO RocketChat #general
ROCKETCHAT_INCOMING_WEBHOOK_URL=https://smart-chat.live/hooks/697d27420d23b15e771ff5ff/2g45Kyw4okXM9F47omzqScRzdCiEsei25vytf26jug62nzdn

# Outgoing webhook - Backend receives agent replies FROM RocketChat
# (Configure this URL in RocketChat Admin → Integrations → Outgoing Webhooks)
ROCKETCHAT_OUTGOING_WEBHOOK_HANDLER=https://app.mediqzy.com/api/support/webhook/rocketchat
```

✅ **Webhook Tested Successfully!** Response: `{"success": true}`

---

## Code Changes Made

### 1. Updated `omnichannel-chat.service.js`

**Added incoming webhook URL to constructor:**

```javascript
this.incomingWebhookUrl = process.env.ROCKETCHAT_INCOMING_WEBHOOK_URL;
```

**Added new method `sendToRocketChatWebhook()`:**

- Sends WhatsApp messages directly to RocketChat #general channel
- Uses incoming webhook for fast, simple integration
- Formats messages with WhatsApp branding (green color, emoji)
- Includes user info (name, phone number, timestamp)

### 2. Updated `whatsapp-production.route.js`

**Imported omnichannel service:**

```javascript
import omnichannelChatService from "../services/omnichannel-chat.service.js";
```

**Updated webhook handler (line ~970):**

- Now uses `omnichannelChatService.sendToRocketChatWebhook()`
- Sends formatted messages with patient context
- Includes fallback to old method if webhook fails

---

## How It Works

### Flow: WhatsApp → Mediczy Backend → RocketChat

1. **WhatsApp User Sends Message**

   ```
   User: "Hi, I need help with my appointment"
   Phone: +917373007737
   ```

2. **Mediczy Backend Receives Webhook**
   - Route: `POST /api/whatsapp/webhook`
   - Extracts: phone number, message, user context
   - Identifies user from database (if known)

3. **Formatted Message Sent to RocketChat**

   ```javascript
   {
     text: "📱 WhatsApp Message from Senthilkumar (Patient ID: 123)",
     attachments: [{
       title: "WhatsApp Message",
       text: "Hi, I need help with my appointment",
       color: "#25D366", // WhatsApp green
       fields: [
         { title: "From", value: "Senthilkumar (+917373007737)" },
         { title: "Time", value: "30/1/26, 2:30 PM" }
       ]
     }]
   }
   ```

4. **Agent Sees Message in RocketChat #general**
   - Beautiful formatted card with WhatsApp branding
   - Patient name (if registered) or phone number
   - Timestamp in Indian timezone

5. **Agent Replies in RocketChat**
   - Agent types response in #general

6. **Outgoing Webhook Sends Reply to Backend**
   - RocketChat POST to: `https://your-domain.com/api/support/webhook/rocketchat`
   - Backend processes agent reply

7. **User Receives WhatsApp Reply**
   - Message sent via Twilio to user's WhatsApp
   - Conversation continues seamlessly

---

## Testing

### Test 1: Send WhatsApp Message

Send a WhatsApp message to your Twilio number (+918098998998):

```
Hi, I need help with my prescription
```

**Expected in RocketChat #general:**

- Message appears with 📱 WhatsApp icon
- Shows sender name/phone
- Timestamp in IST

### Test 2: Agent Reply

1. Agent types in RocketChat #general: "Hello! How can I help you?"
2. User receives reply on WhatsApp

**Required Setup:**

- Outgoing webhook configured in RocketChat
- Points to: `https://your-domain.com/api/support/webhook/rocketchat`

### Test 3: Manual Webhook Test

If RocketChat is running locally on port 3005:

```bash
curl -X POST http://localhost:3005/hooks/697d27420d23b15e771ff5ff/2g45Kyw4okXM9F47omzqScRzdCiEsei25vytf26jug62nzdn \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Test message from Mediczy backend!"
  }'
```

**Expected Response:** `{"success": true}`

---

## Configuration Checklist

### ✅ Incoming Webhook (WhatsApp → RocketChat)

- [x] Created incoming webhook in RocketChat admin
- [x] Added webhook URL to `.env.production.local`
- [x] Updated `omnichannel-chat.service.js` with new method
- [x] Updated `whatsapp-production.route.js` to use webhook
- [x] Restarted backend: `pm2 restart mediczy-server`

### ⏳ Outgoing Webhook (RocketChat → WhatsApp) - PENDING

- [ ] Create outgoing webhook in RocketChat admin
  - URL: `https://your-domain.com/api/support/webhook/rocketchat`
  - Trigger: Message Sent
  - Channel: #general
- [ ] Test agent reply flow

---

## Troubleshooting

### Issue: Connection Refused (ECONNREFUSED)

**Problem:** RocketChat not running on `localhost:3005`

**Solutions:**

1. If using external RocketChat (https://smart-chat.live):
   - Update webhook URL in `.env.production.local`:
     ```bash
     ROCKETCHAT_INCOMING_WEBHOOK_URL=https://smart-chat.live/hooks/YOUR_WEBHOOK_ID
     ```

2. If running RocketChat locally:

   ```bash
   # Check if RocketChat is running
   pm2 list | grep rocket

   # Or check port 3005
   netstat -tuln | grep 3005
   ```

### Issue: Messages Not Appearing in RocketChat

**Check:**

1. Webhook URL is correct
2. RocketChat is accessible from backend server
3. Incoming webhook is enabled in RocketChat admin
4. Backend logs: `pm2 logs mediczy-server | grep RocketChat`

**Debug Command:**

```bash
pm2 logs mediczy-server --lines 50 | grep -i "rocketchat\|webhook"
```

### Issue: Backend Not Loading New Environment Variable

**Solution:**

```bash
# Restart with environment update
pm2 restart mediczy-server --update-env

# Or delete and recreate
pm2 delete mediczy-server
pm2 start ecosystem.config.js --only mediczy-server
```

---

## Next Steps

### 1. Configure Outgoing Webhook (Agent Replies)

Login to RocketChat admin panel and create outgoing webhook:

**Settings:**

- Name: `Mediczy Agent Reply`
- Enabled: ✅ Yes
- Event Trigger: **Message Sent**
- Channel: `#general`
- URLs: `https://app.mediqzy.com/api/support/webhook/rocketchat`
- Method: **POST**
- Send as JSON: ✅ Yes

**Steps to Configure:**

1. Login to https://smart-chat.live/admin
2. Navigate to: **Administration** → **Integrations** → **Outgoing Webhooks**
3. Click **New Webhook**
4. Fill in the settings above
5. Save and enable

### 2. Test End-to-End Flow

1. Send WhatsApp to **+918098998998**: "Hello, I need help"
2. Check RocketChat #general: Message should appear with 📱 WhatsApp branding
3. Agent replies in #general: "How can I help you?"
4. Check WhatsApp: User should receive reply instantly

### 3. Monitor Logs

```bash
# Watch incoming WhatsApp messages
pm2 logs mediczy-server --lines 0 | grep "WhatsApp message posted to RocketChat"

# Watch agent replies
pm2 logs mediczy-server --lines 0 | grep "RocketChat webhook"
```

---

## Files Modified

1. **`.env.production.local`**
   - Added `ROCKETCHAT_INCOMING_WEBHOOK_URL`

2. **`server/services/omnichannel-chat.service.js`**
   - Added `incomingWebhookUrl` to constructor
   - Added `sendToRocketChatWebhook()` method

3. **`server/routes/whatsapp-production.route.js`**
   - Imported `omnichannelChatService`
   - Updated webhook handler to use new method
   - Added fallback to old method

---

## Summary

✅ **WhatsApp → RocketChat** integration is complete!

- Environment variable configured
- Backend code updated
- PM2 restarted
- Ready to receive WhatsApp messages in RocketChat #general

⏳ **RocketChat → WhatsApp** integration pending:

- Need to configure outgoing webhook in RocketChat admin
- See "Next Steps" section above

---

## Support Commands

```bash
# View backend logs
pm2 logs mediczy-server

# Check environment
pm2 env 8  # Replace 8 with your mediczy-server process ID

# Restart backend
pm2 restart mediczy-server --update-env

# Test webhook manually (if RocketChat on localhost:3005)
node /home/ubuntu/Mediczy/test-rocketchat-webhook.js
```

🎉 Your WhatsApp messages will now appear in RocketChat #general!
