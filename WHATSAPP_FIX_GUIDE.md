# WhatsApp Integration Fix Guide

## Status: ✅ WORKING (with fix needed in backend)

### What's Working
- ✅ N8N running and connected to PostgreSQL
- ✅ SIB FastAPI service running on port 8001  
- ✅ WhatsApp workflow is **ACTIVE** in n8n
- ✅ Twilio credentials are configured
- ✅ Messages have been successfully sent before (Dec 1-3, 2024)

### The Problem
Messages are not being received because **the `phone` parameter is missing** from webhook requests.

**Error in latest attempts:**
```
"error": "A text message body or media urls must be specified"
"To": "whatsapp:undefined"  ← Phone number is missing
```

### The Solution

When your backend code calls the n8n webhook, it MUST include the phone number:

```bash
# CORRECT - Must include phone number
curl -X POST "http://localhost:5678/webhook/whatsapp-notification" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+917373007737",
    "message": "Your message text"
  }'
```

### Backend Code Changes Required

Find where your code calls the WhatsApp webhook (typically in appointment notifications, lab reports, etc.) and ensure it includes the phone number:

**Example Node.js fix:**
```javascript
// BEFORE (broken)
await fetch('http://localhost:5678/webhook/whatsapp-notification', {
  method: 'POST',
  body: JSON.stringify({ message: 'Hello' })
});

// AFTER (fixed)
await fetch('http://localhost:5678/webhook/whatsapp-notification', {
  method: 'POST',
  body: JSON.stringify({ 
    phone: patientPhone,  // ADD THIS
    message: 'Hello'
  })
});
```

### Configuration Details

| Component | Status | Details |
|-----------|--------|---------|
| N8N | ✅ Running | Port 5678, PostgreSQL connected |
| SIB Service | ✅ Running | Port 8001, PostgreSQL connected (Fixed: port 5432) |
| PostgreSQL | ✅ Connected | Port 5432, database: mediczy_ai |
| Twilio Credentials | ✅ Configured | Account: ACe60079054c0b9f2a7aac3a64a5aea744 |
| Webhook URL | ✅ Active | `http://localhost:5678/webhook/whatsapp-notification` |
| Workflow | ✅ Active | "SIB: WhatsApp Notification" (ID: ph3thkVWaLomxg5v) |

### Successful Message History

**Last successful send:** 2026-01-23 17:27:42 UTC
- **Recipient:** +917373007737
- **Status:** Sent successfully via Twilio

### Steps to Verify Fix

1. Check your appointment notification handler
2. Locate where it calls n8n webhook
3. Add `phone` field to the JSON payload
4. Test with: `curl -X POST "http://localhost:5678/webhook/whatsapp-notification" -H "Content-Type: application/json" -d '{"phone":"+917373007737","message":"Test message"}'`
5. Check n8n execution logs for success

### Files Modified
- `/home/ubuntu/Mediczy/ecosystem.config.js` - Fixed SIB PostgreSQL port from 5433 → 5432

### Dashboard Access
- N8N UI: http://n8n.mediqzy.com (or http://localhost:5678)
- Login: admin@mediczy.com / welcome
