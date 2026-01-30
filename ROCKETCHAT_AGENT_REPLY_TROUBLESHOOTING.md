# RocketChat Agent Reply Troubleshooting Guide

## Issue: Agent replies from RocketChat not reaching users on WhatsApp

### Architecture Overview

```
User WhatsApp Message → Mediczy Backend → RocketChat (Agent sees message)
                                            ↓
User WhatsApp ← Mediczy Backend ← RocketChat Webhook (Agent replies)
```

### Current Configuration

**RocketChat URL:** `https://smart-chat.live`
**Webhook Endpoint:** `POST https://your-domain.com/api/support/webhook/rocketchat`
**User ID:** `AAAXSfxydgRxBhHaJ`
**Auth Token:** `0hoYIxI2zxVuyUVX6rltCNswMkXcb9WWCwdMRGQiRNs`

---

## Step-by-Step Troubleshooting

### Step 1: Verify Webhook Configuration in RocketChat

1. **Login to RocketChat Admin**
   - Go to: https://smart-chat.live/admin/integrations
   - Login with admin credentials

2. **Check Outgoing Webhook Settings**
   - Navigate to: **Administration** → **Integrations** → **Outgoing Webhooks**
   - Look for webhook named something like "Mediczy Agent Reply" or "WhatsApp Relay"

3. **Required Webhook Configuration**

   ```
   ✅ Enabled: Yes
   ✅ Event Trigger: Message Sent
   ✅ Channel: #livechat or specific livechat rooms
   ✅ Trigger Words: (leave empty to send all messages)
   ✅ URLs: https://your-domain.com/api/support/webhook/rocketchat
   ✅ Method: POST
   ✅ Send as JSON: Yes
   ✅ Token/Secret: (optional but recommended)
   ```

4. **Critical: Event Triggers**
   - Check "Send the trigger word with the message"
   - Uncheck "Run script when a message is sent"
   - Event should be: **Message Sent**

### Step 2: Verify Webhook Endpoint is Accessible

Test the endpoint from RocketChat server:

```bash
# From any terminal with internet access
curl -X POST https://your-domain.com/api/support/webhook/rocketchat \
  -H "Content-Type: application/json" \
  -d '{
    "room": {
      "v": {
        "phone": [{"phoneNumber": "+917373007737"}]
      }
    },
    "message": {
      "msg": "Test agent reply",
      "u": {
        "type": "user",
        "_id": "agent123"
      }
    }
  }'
```

**Expected Response:** `{"success":true}`

### Step 3: Check Webhook Logs in RocketChat

1. Go to your webhook in RocketChat admin
2. Scroll down to **History** section
3. Check recent webhook attempts:
   - ✅ **Success (200)**: Webhook is working
   - ❌ **Failed (4xx, 5xx)**: Check error message

**Common Errors:**

- **404 Not Found**: Route not registered or typo in URL
- **500 Internal Server Error**: Check Mediczy backend logs
- **Timeout**: Network issue or backend is down

### Step 4: Verify Backend Route Registration

Check that the webhook route is registered in your Express app:

```bash
# SSH to your server
cd /home/ubuntu/Mediczy/server
grep -r "webhook/rocketchat" routes/
```

**Expected Output:**

```
routes/support-chat.route.js:router.post('/webhook/rocketchat', async (req, res) => {
```

### Step 5: Check Backend Logs

```bash
# Check PM2 logs for webhook requests
pm2 logs mediczy-server --lines 100 | grep -i "rocketchat\|webhook"

# Or check Node.js console output
tail -f /home/ubuntu/Mediczy/logs/mediczy-server-out.log | grep -i rocketchat
```

**Look for:**

- `RocketChat webhook error:` - Indicates webhook is receiving data but failing
- `Send to WhatsApp error:` - WhatsApp sending failed
- `No WhatsApp number for visitor` - Room doesn't have phone number

### Step 6: Verify Visitor Phone Number Storage

When a WhatsApp user sends a message, their phone number should be stored in RocketChat visitor:

**Check in code:** [`server/services/omnichannel-chat.service.js:325-360`](server/services/omnichannel-chat.service.js#L325-L360)

The webhook expects this structure:

```javascript
{
  "room": {
    "v": {  // Visitor object
      "phone": [
        {"phoneNumber": "+919876543210"}  // ← Critical!
      ]
    }
  },
  "message": {
    "msg": "Agent's reply text",
    "u": {  // User object (agent)
      "type": "user"  // Not "visitor"
    }
  }
}
```

### Step 7: Test Agent Message Detection

The code filters out visitor messages (only agent messages should be sent to WhatsApp):

**Logic in [`omnichannel-chat.service.js:330-342`](server/services/omnichannel-chat.service.js#L330-L342):**

```javascript
const isVisitorMessage =
  !!message?.token &&
  (message?.u?.type === "visitor" ||
    message?.u?.roles?.includes("livechat-visitor") ||
    message?.u?._id === room?.v?._id ||
    message?.u?.username === room?.v?.username ||
    message?.u?.name === room?.v?.name);
if (isVisitorMessage) {
  return { success: true, skipped: true }; // Don't send back to user
}
```

**Verify:**

- Agent messages have `message.u.type !== 'visitor'`
- Agent `_id` is different from visitor `_id`

### Step 8: Test WhatsApp Sending Service

The webhook uses production WhatsApp service:

```bash
# Test WhatsApp sending directly
curl -X POST http://localhost:8000/api/communication/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "phone": "+917373007737",
    "message": "Test reply from agent"
  }'
```

---

## Quick Fix Checklist

### ✅ Configuration Checklist

1. **RocketChat Webhook Exists?**
   - [ ] Login to https://smart-chat.live/admin/integrations
   - [ ] Check "Outgoing Webhooks" section
   - [ ] Verify webhook is **Enabled**

2. **Webhook URL Correct?**
   - [ ] URL should be: `https://your-domain.com/api/support/webhook/rocketchat`
   - [ ] **NOT** `http://localhost:8000/...`
   - [ ] Method is **POST**

3. **Event Trigger Correct?**
   - [ ] Event: **Message Sent**
   - [ ] Trigger on livechat rooms only (or specific channels)

4. **Backend Route Registered?**
   - [ ] Route exists in [`server/routes/support-chat.route.js:377`](server/routes/support-chat.route.js#L377)
   - [ ] Route is imported in `server/app.js`

5. **Phone Number Stored?**
   - [ ] WhatsApp user's phone is saved in RocketChat visitor object
   - [ ] Phone format: `+[country code][number]` (e.g., `+917373007737`)

---

## Common Issues & Solutions

### Issue 1: Webhook Not Firing

**Symptoms:**

- No entries in RocketChat webhook history
- No logs in Mediczy backend

**Solutions:**

1. **Re-create the webhook** in RocketChat admin
2. Check **Event Trigger** is set to "Message Sent"
3. Verify **Channel/Room** filter includes livechat rooms
4. Test with a simple channel message first (not livechat)

### Issue 2: Webhook Returns 404

**Symptoms:**

- RocketChat history shows "404 Not Found"
- Backend logs show no incoming requests

**Solutions:**

1. Verify route is registered: `grep "webhook/rocketchat" server/routes/*.js`
2. Check `server/app.js` imports support-chat route:
   ```javascript
   import supportChatRoutes from "./routes/support-chat.route.js";
   app.use("/api/support", supportChatRoutes);
   ```
3. Restart backend: `pm2 restart mediczy-server`

### Issue 3: Webhook Returns 500

**Symptoms:**

- RocketChat history shows "500 Internal Server Error"
- Backend logs show errors

**Solutions:**

1. Check backend logs: `pm2 logs mediczy-server --err`
2. Common errors:
   - `No WhatsApp number` → Phone not stored in visitor object
   - `WhatsApp production service unavailable` → Check Twilio config
   - `Cannot read property 'msg'` → Webhook payload structure wrong

### Issue 4: Agent Message Not Detected

**Symptoms:**

- Webhook fires, but message is skipped (logs: `skipped: true`)
- Agent messages treated as visitor messages

**Solutions:**

1. Check agent user object in webhook payload
2. Agent should NOT have:
   - `type: 'visitor'`
   - `roles: ['livechat-visitor']`
   - Same `_id` as visitor
3. Test with admin user reply first

### Issue 5: Phone Number Missing

**Symptoms:**

- Backend logs: `No WhatsApp number for visitor`
- Webhook fails to find phone

**Solutions:**

1. **When creating livechat room**, ensure phone is stored:

   ```javascript
   // In server/services/omnichannel-chat.service.js
   visitor: {
     phone: [
       {
         phoneNumber: "+917373007737", // Must be here!
       },
     ];
   }
   ```

2. **Update existing visitor:**
   ```bash
   # In RocketChat database (MongoDB)
   db.rocketchat_livechat_visitor.updateOne(
     { _id: "visitor_id" },
     { $set: { phone: [{ phoneNumber: "+917373007737" }] } }
   )
   ```

### Issue 6: Message Sent Multiple Times

**Symptoms:**

- User receives duplicate replies
- Webhook history shows multiple successful calls

**Solutions:**

1. Check if webhook is triggered on both "Message Sent" AND "Message Updated"
2. Ensure only ONE webhook is configured for agent replies
3. Add deduplication logic in backend if needed

---

## Testing Flow

### Test 1: Manual Webhook Call

```bash
curl -X POST http://localhost:8000/api/support/webhook/rocketchat \
  -H "Content-Type: application/json" \
  -d '{
    "room": {
      "v": {
        "phone": [{"phoneNumber": "+917373007737"}]
      }
    },
    "message": {
      "msg": "Hello from agent!",
      "u": {
        "type": "user",
        "_id": "agent_id_123",
        "username": "support.agent"
      }
    }
  }'
```

**Expected:**

- Response: `{"success": true}`
- WhatsApp user receives: "Hello from agent!"

### Test 2: End-to-End Flow

1. **Send WhatsApp message** from +917373007737: "I need help"
2. **Check RocketChat**: Agent should see new livechat room with message
3. **Agent replies** in RocketChat: "How can I help you?"
4. **Check WhatsApp**: User should receive agent's reply

### Test 3: Check Logs

```bash
# Watch webhook requests in real-time
pm2 logs mediczy-server --lines 0 | grep -E "rocketchat|webhook|WhatsApp"
```

---

## Configuration Files

### 1. Environment Variables (`.env.production.local`)

```bash
ROCKETCHAT_URL=https://smart-chat.live
ROCKETCHAT_USER_ID=AAAXSfxydgRxBhHaJ
ROCKETCHAT_AUTH_TOKEN=0hoYIxI2zxVuyUVX6rltCNswMkXcb9WWCwdMRGQiRNs
ROCKETCHAT_ENABLE_EMBED=true
ROCKETCHAT_ENABLE_SSO=true
ROCKETCHAT_WEBHOOK_SECRET=your-secure-webhook-secret  # Optional
```

### 2. Webhook Endpoint

**File:** [`server/routes/support-chat.route.js:377-389`](server/routes/support-chat.route.js#L377-L389)

```javascript
router.post("/webhook/rocketchat", async (req, res) => {
  try {
    const webhookData = req.body;
    const result = await omnichannelChatService.sendToWhatsApp(webhookData);
    return res.json({ success: true });
  } catch (error) {
    console.error("RocketChat webhook error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to process webhook" });
  }
});
```

### 3. WhatsApp Sending Logic

**File:** [`server/services/omnichannel-chat.service.js:325-390`](server/services/omnichannel-chat.service.js#L325-L390)

Key steps:

1. Verify message is from agent (not visitor)
2. Extract phone number from visitor object
3. Send via WhatsApp production service
4. Update handoff state

---

## Debugging Commands

```bash
# 1. Check if webhook route is registered
grep -rn "webhook/rocketchat" /home/ubuntu/Mediczy/server/routes/

# 2. Check backend is running
pm2 list | grep mediczy-server

# 3. Test webhook endpoint locally
curl -X POST http://localhost:8000/api/support/webhook/rocketchat \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# 4. Watch logs in real-time
pm2 logs mediczy-server --lines 50

# 5. Check RocketChat connection
curl -H "X-Auth-Token: 0hoYIxI2zxVuyUVX6rltCNswMkXcb9WWCwdMRGQiRNs" \
     -H "X-User-Id: AAAXSfxydgRxBhHaJ" \
     https://smart-chat.live/api/v1/me

# 6. Test WhatsApp sending
# (Use Postman or curl with auth token)
```

---

## Next Steps

1. **Login to RocketChat Admin**: https://smart-chat.live/admin/integrations
2. **Create/Edit Outgoing Webhook**:
   - Name: "Mediczy Agent Reply Webhook"
   - Event: Message Sent
   - URLs: `https://your-domain.com/api/support/webhook/rocketchat`
   - Channel: #livechat or your specific livechat channel
3. **Test with a livechat conversation**
4. **Monitor logs**: `pm2 logs mediczy-server`

---

## Support

If issue persists:

1. Share RocketChat webhook history screenshot
2. Share backend logs: `pm2 logs mediczy-server --lines 100 > logs.txt`
3. Test webhook with curl command above and share output
4. Verify phone number format in RocketChat visitor object
