# ❌ WhatsApp → RocketChat Delivery Still Failing - Diagnosis & Solution

**Date:** February 15, 2026  
**Status:** DEBUGGING - AUTH ISSUE IDENTIFIED

---

## Problem Identified

Despite webhook URL fix and API fallback implementation, messages still not reaching RocketChat #general.

### Error Found in Logs
```
"You must be logged in to do this."
```

This means the **RocketChat authentication credentials are invalid or expired**.

---

## Root Cause

The `ROCKETCHAT_AUTH_TOKEN` and `ROCKETCHAT_USER_ID` in `.env` are **expired**.

**Current Configuration:**
```bash
ROCKETCHAT_URL=https://smart-chat.live
ROCKETCHAT_USER_ID=mNXynidBmMpLDv6Fj
ROCKETCHAT_AUTH_TOKEN=uQM8DVr6wFeHwJiZdCMWN6PySPL1MLrcrscpzj2TVgj
ROCKETCHAT_ADMIN_USER=support_admin
ROCKETCHAT_ADMIN_PASSWORD=Password@1234567
```

❌ The `ROCKETCHAT_AUTH_TOKEN` and `ROCKETCHAT_USER_ID` are no longer valid.

---

## Solution: Regenerate RocketChat Credentials

### Method 1: Get New Auth Token (Recommended)

```bash
# Login to RocketChat API and get a new token
curl -X POST https://smart-chat.live/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "user": "support_admin",
    "password": "Password@1234567"
  }'

# Response will include:
# {
#   "status": "success",
#   "data": {
#     "userId": "NEW_USER_ID_HERE",
#     "authToken": "NEW_TOKEN_HERE"
#   }
# }
```

### Step-by-Step To Fix

1. **Get New Credentials**
   ```bash
   RESPONSE=$(curl -s -X POST https://smart-chat.live/api/v1/login \
     -H "Content-Type: application/json" \
     -d '{
       "user": "support_admin",
       "password": "Password@1234567"
     }')
   
   echo "$RESPONSE" | jq '.data'
   ```

2. **Extract New Values**
   ```bash
   NEW_USER_ID=$(echo "$RESPONSE" | jq -r '.data.userId')
   NEW_AUTH_TOKEN=$(echo "$RESPONSE" | jq -r '.data.authToken')
   
   echo "User ID: $NEW_USER_ID"
   echo "Auth Token: $NEW_AUTH_TOKEN"
   ```

3. **Update `.env` File**
   ```bash
   sed -i "s/ROCKETCHAT_USER_ID=.*/ROCKETCHAT_USER_ID=$NEW_USER_ID/" server/.env
   sed -i "s/ROCKETCHAT_AUTH_TOKEN=.*/ROCKETCHAT_AUTH_TOKEN=$NEW_AUTH_TOKEN/" server/.env
   ```

4. **Restart Backend**
   ```bash
   pm2 restart mediczy-server --update-env
   ```

5. **Test Message Delivery**
   ```bash
   curl -X POST http://localhost:8888/api/whatsapp-production/webhook \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'MessageSid=SMtest_auth_fix&From=whatsapp%3A%2B917373007737&Body=Test+after+auth+fix&NumMedia=0'
   ```

6. **Check Logs**
   ```bash
   pm2 logs mediczy-server | grep "posted to RocketChat"
   # Should see:
   # ✅ WhatsApp message posted to RocketChat #general via incoming webhook
   # OR
   # ✅ WhatsApp message posted to RocketChat #general via rocketChatService
   ```

---

## Why This Happened

RocketChat auth tokens have an **expiration time** (typically 30 days). The tokens in your `.env` file were likely:
- Generated weeks/months ago
- Never refreshed
- Now considered expired

The API call fails because RocketChat logs out the authenticated user after token expiration.

---

## Automatic Solution Script

I can create an automated script to:
1. Login to RocketChat
2. Get fresh credentials  
3. Update `.env` file
4. Restart backend
5. Verify messages are delivered

**Would you like me to create this script?**

---

## Prevention

To avoid this in future:
1. **Refresh tokens regularly** (every 15-20 days):
   ```bash
   # Add to crontab to run weekly
   0 0 * * 0 /home/ubuntu/Mediczy/scripts/refresh-rocketchat-auth.sh
   ```

2. **Monitor token expiration** in logs

3. **Set up alerts** when auth fails

---

## Additional: Webhook as Alternative

If the API continues to fail, we can rely on the **Incoming Webhook URL** instead:

**Current Webhook:**
```
https://smart-chat.live/hooks/697d27420d23b15e771ff5ff/2g45Kyw4okXM9F47omzqScRzdCiEsei25vytf26jug62nzdn
```

Webhooks don't require authentication, so they're more reliable. The current code already uses webhook as primary method and API as fallback.

---

## Quick Fix Command

Run this to regenerate and restart:

```bash
#!/bin/bash
set -e

echo "🔄 Regenerating RocketChat auth credentials..."

# Get new token
RESPONSE=$(curl -s -X POST https://smart-chat.live/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "user": "support_admin",
    "password": "Password@1234567"
  }')

NEW_USER_ID=$(echo "$RESPONSE" | jq -r '.data.userId')
NEW_AUTH_TOKEN=$(echo "$RESPONSE" | jq -r '.data.authToken')

if [ -z "$NEW_USER_ID" ] || [ "$NEW_USER_ID" == "null" ]; then
  echo "❌ Failed to get new credentials"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✅ Got new credentials"
echo "   User ID: $NEW_USER_ID"
echo "   Token: ${NEW_AUTH_TOKEN:0:20}..."

# Update .env
cd /home/ubuntu/Mediczy
sed -i "s/ROCKETCHAT_USER_ID=.*/ROCKETCHAT_USER_ID=$NEW_USER_ID/" server/.env
sed -i "s/ROCKETCHAT_AUTH_TOKEN=.*/ROCKETCHAT_AUTH_TOKEN=$NEW_AUTH_TOKEN/" server/.env

echo "✅ Updated .env file"

# Restart
pm2 restart mediczy-server --update-env
echo "✅ Restarted backend"

echo "✅ Done! Messages should now reach RocketChat."
```

---

## Summary

**Problem:** RocketChat auth token expired  
**Symptom:**  "You must be logged in to do this" error
**Solution:** Regenerate auth token from RocketChat API  
**Expected Result:** Messages successfully posted to RocketChat #general ✅

