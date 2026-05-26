# ✅ RocketChat Outgoing Webhook Setup - Agent Replies to WhatsApp

## Problem
**Messages from RocketChat are not going back to WhatsApp users**

## Root Cause
The **outgoing webhook** is not configured in RocketChat admin panel. This webhook is needed to send agent replies from RocketChat back to WhatsApp users.

**Current Status:**
- ✅ WhatsApp → RocketChat (WORKING) - Users can send messages
- ❌ RocketChat → WhatsApp (NOT WORKING) - Agent replies don't reach users
- ✅ Backend endpoint ready: `/api/support/webhook/rocketchat` (tested and working)

---

## Solution: Configure Outgoing Webhook in RocketChat

### Step 1: Login to RocketChat Admin

1. Go to: **https://smart-chat.live/admin**
2. Login with admin credentials:
   - Username: `support_admin`
   - Password: `Password@1234567`

### Step 2: Navigate to Integrations

1. Click **Administration** (top-left menu icon with 3 lines)
2. Go to: **Workspace** → **Integrations**
3. Click **New Integration** button (top-right)
4. Select: **Outgoing Webhook**

### Step 3: Configure the Webhook

**Basic Settings:**
```
Name: Mediczy WhatsApp Replies
Enabled: ✅ Yes (toggle ON)
```

**Event Trigger:**
```
Event Trigger: Message Sent
```

**Channel Settings:**
```
Channel: #general
(Or the specific channel where WhatsApp conversations happen)
```

**URLs:**
```
URLs: https://app.mediqzy.com/api/support/webhook/rocketchat

Note: Use the public domain, not localhost
```

**HTTP Settings:**
```
Method: POST
Content Type: application/json (should be default)
```

**Advanced Settings (Optional but Recommended):**
```
Script Enabled: No (leave disabled unless you need custom processing)
Retry Failed Calls: ✅ Yes (recommended)
Retry Count: 3
Retry Delay: 5 seconds
```

### Step 4: Save and Enable

1. Scroll to bottom
2. Click **Save**
3. Ensure **Enabled** toggle is ON (green)

---

## How to Verify It's Working

### Test 1: Send WhatsApp Message
```
1. Send WhatsApp message to: +918098998998
2. Message appears in RocketChat #general
```

### Test 2: Agent Reply
```
1. Agent types in RocketChat #general: "Hello! How can I help you?"
2. Message should be delivered to WhatsApp user within 2-3 seconds
```

### Test 3: Check Logs
```bash
# On production server
pm2 logs mediczy-server | grep -E 'sendToWhatsApp|RocketChat webhook'

# Expected output when agent sends message:
# ✅ Public endpoint allowed: /api/support/webhook/rocketchat
# WhatsApp sendSessionMessage trace { to: '+91...' }
```

---

## Backend Verification (Already Done ✅)

I've verified the backend endpoint is working:

**Test Command:**
```bash
curl -X POST http://localhost:8888/api/support/webhook/rocketchat \
  -H "Content-Type: application/json" \
  -d '{
    "room": {
      "v": {
        "phone": [{"phoneNumber": "+917373007737"}]
      }
    },
    "message": {
      "msg": "Test reply from RocketChat",
      "u": {
        "type": "user",
        "username": "admin"
      }
    }
  }'
```

**Response:** `{"success":true}` ✅

**Backend Log:**
```
✅ Public endpoint allowed: /api/support/webhook/rocketchat
WhatsApp sendSessionMessage trace {
  to: '+917373007737',
  snippet: 'Test reply from RocketChat'
}
```

---

## Webhook Payload Format

RocketChat sends this payload to your webhook when an agent sends a message:

```json
{
  "token": "webhook_token",
  "bot": false,
  "channel_id": "GENERAL",
  "channel_name": "general",
  "message_id": "msg_id_123",
  "timestamp": "2026-02-21T10:00:00.000Z",
  "user_id": "user_123",
  "user_name": "support_admin",
  "text": "Hello! How can I help you?",
  "trigger_word": "",
  "room": {
    "_id": "room_id",
    "v": {
      "phone": [
        {"phoneNumber": "+917373007737"}
      ],
      "token": "visitor_token",
      "name": "Patient Name"
    }
  },
  "message": {
    "_id": "msg_id",
    "rid": "room_id",
    "msg": "Hello! How can I help you?",
    "ts": "2026-02-21T10:00:00.000Z",
    "u": {
      "_id": "user_id",
      "username": "support_admin",
      "name": "Support Admin"
    }
  }
}
```

**What the backend extracts:**
- `room.v.phone[0].phoneNumber` → WhatsApp number
- `message.msg` → Message text to send
- `message.u.type` → Check if it's agent (not visitor)

---

## Troubleshooting

### Issue: Webhook Not Firing

**Check:**
1. Is webhook **Enabled**? (toggle should be green)
2. Is channel name correct? (should be `#general` or the exact channel name)
3. Is the URL accessible from RocketChat server?
4. Try sending test message from integration settings

**Test URL Accessibility:**
```bash
# From RocketChat server
curl -X POST https://app.mediqzy.com/api/support/webhook/rocketchat \
  -H "Content-Type: application/json" \
  -d '{"test":true}'

# Should return: {"success":true}
```

### Issue: Messages Not Reaching WhatsApp

**Check Backend Logs:**
```bash
pm2 logs mediczy-server | grep -i whatsapp
```

**Common Issues:**
1. **Twilio credentials not set** - Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
2. **WhatsApp number not registered** - User must have messaged first (24hr window)
3. **Phone number format issue** - Should be E.164 format (+917373007737)

### Issue: Agent Messages Appear in Loop

**Symptom:** Agent's own message appears as new incoming message

**Cause:** Webhook triggering on all messages including visitor messages

**Solution:** Backend already filters this:
```javascript
// In sendToWhatsApp method
const isVisitorMessage = !!message?.token && (
  message?.u?.type === 'visitor'
  || message?.u?.roles?.includes('livechat-visitor')
);
if (isVisitorMessage) {
  return { success: true, skipped: true }; // Don't send back to WhatsApp
}
```

---

## Testing Checklist

After configuring the webhook:

- [ ] Webhook created in RocketChat admin
- [ ] Webhook enabled (toggle ON)
- [ ] Channel set to `#general`
- [ ] URL: `https://app.mediqzy.com/api/support/webhook/rocketchat`
- [ ] Method: POST
- [ ] Send WhatsApp message → appears in RocketChat
- [ ] Agent replies in RocketChat → user receives on WhatsApp
- [ ] Check backend logs for webhook processing
- [ ] Verify no error messages in RocketChat integration logs

---

## Alternative Channels

If you want agent replies to work on different channels:

1. Create separate outgoing webhook for each channel
2. Or use single webhook with multiple channels (comma-separated)
3. Or use event trigger "Message Sent" with regex pattern

**Example for multiple channels:**
```
Channel: #general,#support,#whatsapp
```

---

## Security (Optional Enhancement)

### Add Webhook Secret Validation

1. **In RocketChat webhook settings:**
   ```
   Token: your-secret-token-here
   ```

2. **Update backend to verify:**
   ```javascript
   // In server/routes/support-chat.route.js
   router.post('/webhook/rocketchat', async (req, res) => {
     const token = req.body.token;
     const expectedToken = process.env.ROCKETCHAT_WEBHOOK_SECRET;
     
     if (token !== expectedToken) {
       return res.status(401).json({ success: false, error: 'Invalid token' });
     }
     
     // ... rest of the code
   });
   ```

3. **Add to .env:**
   ```
   ROCKETCHAT_WEBHOOK_SECRET=your-secret-token-here
   ```

---

## Summary

**What's Working:**
- ✅ Backend webhook endpoint ready and tested
- ✅ Message routing logic implemented
- ✅ Phone number extraction and normalization
- ✅ Twilio integration for sending messages
- ✅ Visitor message filtering (prevents loops)

**What's Needed:**
- ⏳ Configure outgoing webhook in RocketChat admin panel (5-10 minutes)
- ⏳ Test end-to-end flow (2 minutes)

**After Setup:**
- Agent types in RocketChat #general
- RocketChat → POST webhook → Backend → Twilio → WhatsApp user
- Response time: < 3 seconds

---

**Next Action:** Login to https://smart-chat.live/admin and configure the outgoing webhook following the steps above.
