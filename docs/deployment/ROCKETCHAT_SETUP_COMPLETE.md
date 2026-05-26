# 🎉 RocketChat Integration - Ready to Use!

## ✅ Configuration Complete

### Environment Variables Set

```bash
# Incoming webhook (WhatsApp → RocketChat)
ROCKETCHAT_INCOMING_WEBHOOK_URL=https://smart-chat.live/hooks/697d27420d23b15e771ff5ff/2g45Kyw4okXM9F47omzqScRzdCiEsei25vytf26jug62nzdn

# Outgoing webhook handler (RocketChat → WhatsApp)
ROCKETCHAT_OUTGOING_WEBHOOK_HANDLER=https://app.mediqzy.com/api/support/webhook/rocketchat
```

### ✅ Backend Status

- PM2 restarted with `--update-env` flag
- Webhook URL tested successfully: `{"success": true}`
- Backend ready to send WhatsApp messages to RocketChat

---

## 📱 How It Works Now

### WhatsApp → RocketChat (Incoming - WORKING ✅)

1. **User sends WhatsApp message** to +918098998998
2. **Mediczy backend receives** webhook from Twilio
3. **Backend sends to RocketChat** via incoming webhook URL
4. **Message appears in #general** with WhatsApp branding:

   ```
   📱 WhatsApp Message from Senthilkumar (Patient ID: 123)

   Hello, I need help with my prescription

   From: Senthilkumar (+917373007737)
   Time: 30/1/26, 9:30 PM
   ```

### RocketChat → WhatsApp (Outgoing - NEEDS SETUP ⏳)

**What to configure in RocketChat:**

1. Login to https://smart-chat.live/admin
2. Go to: **Administration** → **Integrations** → **Outgoing Webhooks**
3. Click **New Webhook**
4. Configure:
   ```
   Name: Mediczy Agent Reply
   Enabled: ✅ Yes
   Event Trigger: Message Sent
   Channel: #general
   URLs: https://app.mediqzy.com/api/support/webhook/rocketchat
   Method: POST
   Send as JSON: ✅ Yes
   ```
5. **Save** and **Enable**

**What happens when agent replies:**

1. Agent types in RocketChat #general: "How can I help you?"
2. RocketChat sends POST to `https://app.mediqzy.com/api/support/webhook/rocketchat`
3. Backend processes the message
4. Backend sends to WhatsApp via Twilio
5. User receives reply instantly

---

## 🧪 Testing Guide

### Test 1: WhatsApp → RocketChat (Ready Now!)

**Send WhatsApp message:**

- To: +918098998998
- Message: "Hi, I need help with my appointment"

**Expected Result:**

- Message appears in RocketChat #general within 2-3 seconds
- Shows WhatsApp icon 📱 and patient info
- Timestamp in Indian timezone

### Test 2: RocketChat → WhatsApp (After outgoing webhook setup)

**Agent types in #general:**

- Message: "Hello! How can I assist you today?"

**Expected Result:**

- User receives reply on WhatsApp within 2-3 seconds
- Message shows as coming from your Twilio number

---

## 📊 Monitoring

### Check Incoming Messages (WhatsApp → RocketChat)

```bash
# Watch WhatsApp messages being sent to RocketChat
pm2 logs mediczy-server --lines 0 | grep "WhatsApp message posted to RocketChat"

# Check for errors
pm2 logs mediczy-server --err | grep -i "rocketchat\|webhook"
```

### Check Outgoing Messages (RocketChat → WhatsApp)

```bash
# Watch agent replies being sent to WhatsApp
pm2 logs mediczy-server --lines 0 | grep "RocketChat webhook"

# Check WhatsApp delivery status
pm2 logs mediczy-server --lines 0 | grep "Send to WhatsApp"
```

---

## 🔧 Troubleshooting

### Issue: Messages not appearing in RocketChat

**Check:**

1. Incoming webhook URL is correct:
   ```bash
   grep ROCKETCHAT_INCOMING_WEBHOOK_URL /home/ubuntu/Mediczy/.env.production.local
   ```
2. Backend has the correct URL loaded:
   ```bash
   pm2 env 8 | grep ROCKETCHAT_INCOMING_WEBHOOK_URL
   ```
3. Test webhook manually:
   ```bash
   curl -X POST https://smart-chat.live/hooks/697d27420d23b15e771ff5ff/2g45Kyw4okXM9F47omzqScRzdCiEsei25vytf26jug62nzdn \
     -H "Content-Type: application/json" \
     -d '{"text":"Test message"}'
   ```

### Issue: Agent replies not reaching WhatsApp

**Cause:** Outgoing webhook not configured in RocketChat

**Solution:** Follow the "RocketChat → WhatsApp" setup steps above

**Debug:**

```bash
# Check if backend is receiving webhook calls
pm2 logs mediczy-server --lines 50 | grep "/api/support/webhook/rocketchat"
```

---

## ✅ What's Working

- [x] WhatsApp messages sent to RocketChat
- [x] Patient identification (name, ID) if registered
- [x] Message formatting with WhatsApp branding
- [x] Timestamp in Indian timezone
- [x] Backend webhook handler for agent replies
- [x] Environment variables configured
- [x] PM2 restarted with new config

## ⏳ What's Pending

- [ ] Configure outgoing webhook in RocketChat admin
- [ ] Test agent reply flow end-to-end
- [ ] Set up proper error handling/retry logic
- [ ] Configure different channels for different departments

---

## 🎯 Quick Test

**Right now, you can test the incoming webhook:**

Send this WhatsApp message to **+918098998998**:

```
Hi, this is a test message to verify RocketChat integration!
```

Then check your RocketChat #general channel - you should see the message appear with:

- 📱 WhatsApp icon
- Your name (if you're a registered patient)
- Phone number
- Timestamp

---

## 📞 Support

If you need help:

1. Check logs: `pm2 logs mediczy-server`
2. Verify webhook URL: `grep ROCKETCHAT /home/ubuntu/Mediczy/.env.production.local`
3. Test webhook: See troubleshooting section above

**Backend is ready! Now configure the outgoing webhook in RocketChat admin to complete the two-way integration.** 🚀
