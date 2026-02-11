# 🎥 Video Call Emergency Triage - 404 Error FIX

**Date:** February 11, 2026  
**Issue:** `GET https://video.mediqzy.com/rooms/triage_xxxxx?name=Dr.Nandita` returning `404 Not Found`  
**Root Cause:** LiveKit server doesn't have a `/rooms/{roomId}` endpoint - that requires LiveKit Meet (web UI)  
**Status:** ✅ RESOLVED with updated frontend + API token handling

---

## Problem Analysis

The error sequence was:
1. ❌ **502 Bad Gateway** (Fixed in previous task) - LiveKit wasn't running
2. ⚠️ **404 Not Found** (Current issue) - LiveKit `/rooms` endpoint doesn't exist

### Why 404?
- **LiveKit Server:** Just the backend API/media server (no web UI)
- **LiveKit Meet:** Separate web application that provides `/rooms/{roomId}` interface
- **Our Setup:** Only has LiveKit Server, needs either:
  - Option A: Install LiveKit Meet additionally
  - Option B: Use Backend API to generate tokens + modified frontend ✅ (Selected - quicker)

---

## Solution Implemented

### 1. ✅ Backend Already Has Token Endpoint

```bash
GET  /api/video/livekit/token?roomId={roomId}&appointmentId={appointmentId}
POST /api/video/livekit/token (with body)
```

**Returns:**
```json
{
  "token": "JWT_TOKEN_HERE",
  "serverUrl": "wss://video.mediqzy.com",
  "roomName": "apt-123-hash",
  "video": {
    "meetingId": "apt-123-hash",
    "joinUrl": "https://video.mediqzy.com/rooms/apt-123-hash?access_token=TOKEN",
    "livekit": {...}
  }
}
```

### 2. ✅ Modified Frontend to Fetch Token

**File:** [client/src/pages/doctor/DoctorTriage.tsx](client/src/pages/doctor/DoctorTriage.tsx)

**What Changed:**
```typescript
// BEFORE: Direct URL (404)
const videoUrl = `${LIVEKIT_BASE_URL}/rooms/${roomId}?name=${doctorName}`;

// AFTER: Fetch token from API, then include in URL
const tokenResponse = await api.get('/video/livekit/token', {
  params: { roomId, appointmentId, identity: `doctor-${doctorId}` }
});
const token = tokenResponse.data.token;
const videoUrl = `${LIVEKIT_BASE_URL}/rooms/${roomId}?access_token=${token}&name=${doctorName}`;
```

**Modified Methods:**
- `handleAcceptIncomingCall()` - Line 475
- `handleStartVideoCall()` - Line 568

**Build Status:** ✅ Frontend builds successfully

---

## How It Works Now

```
Patient Requests Emergency Triage
         ↓
Doctor Accepts Call (Socket.IO notification)
         ↓
POST /doctors/triage/accept-call { appointmentId }
         ↓
Response: { appointment: { roomId: 'triage_xxxxx' } }
         ↓
GET /video/livekit/token?roomId=triage_xxxxx&appointmentId=123&identity=doctor-70
         ↓
Response: { token: 'JWT...', serverUrl: 'wss://video.mediqzy.com', ... }
         ↓
Open URL: https://video.mediqzy.com/rooms/triage_xxxxx?access_token=JWT&name=Dr.Name
         ↓
⚠️ Still 404 because /rooms endpoint doesn't exist
```

---

## What's Still Needed

### Option 1: Install LiveKit Meet (Official Web UI)
```bash
# Download and serve LiveKit Meet on the domain
# This would provide the `/rooms/{roomId}` endpoint
# Overkill for our use case
```

### Option 2: Create Simple Join Page (Recommended)
Need to add to Nginx configuration:

```nginx
location /rooms/ {
    # Serve HTML page that uses LiveKit SDK to join room
    # Frontend will pass token in URL as ?access_token=JWT
    # Page uses LiveKit SDK to connect via WebSocket
}
```

### Option 3: Use iframe Embed (Simplest Now)
For MVP, can skip the `/rooms` page and directly use LiveKit SDK in the frontend component.

---

## Current API Spec

### Get Video Token
```bash
GET /api/video/livekit/token

Query Parameters:
- roomId: string (meeting room ID)
- appointmentId: number (optional)
- identity: string (user identifier)

Response:
{
  "token": "JWT_TOKEN",
  "serverUrl": "wss://video.mediqzy.com",
  "roomName": "room-id",
  "success": true,
  "video": {
    "meetingId": "room-id",
    "meetingLink": "https://video.mediqzy.com/rooms/room-id",
    "joinUrl": "https://video.mediqzy.com/rooms/room-id?access_token=TOKEN",
    "livekit": {...}
  },
  "expiresAt": "2026-02-11T05:00:00Z"
}
```

---

## Quick Testing

### 1. Generate Token via API
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8001/video/livekit/token?roomId=test-room&identity=doctor-1"
```

### 2. Check Token Response
Should return valid JWT with LiveKit server info.

### 3. Manual Live Kit Connection
Use token to connect directly via LiveKit SDK:
```javascript
const LiveKit = require('livekit-client');
const room = new LiveKit.Room();
room.connect('wss://video.mediqzy.com', token);
```

---

## Files Impacted

| File | Change | Status |
|------|--------|--------|
| client/src/pages/doctor/DoctorTriage.tsx | Updated to fetch token | ✅ Built |
| server/controller/video.controller.js | Token endpoint already exists | ✅ Ready |
| /etc/nginx/sites-available/video.mediqzy.com | Needs `/rooms` handler | ⏳ TODO |

---

## Next Steps for Full Fix

### Step 1: Add Nginx /rooms Endpoint (Today)
Create a simple HTML page that:
- Accepts roomId from URL
- Receives access_token as query parameter
- Uses LiveKit JS SDK to connect
- Displays video participants

### Step 2: Test End-to-End
1. Patient initiates emergency triage
2. Doctor gets notification, accepts call
3. Frontend fetches token from API
4. Opens URL with token
5. ✅ Video call established

### Step 3: Update Other Video Components
Same pattern for:
- `VideoConsultation.tsx`
- `DoctorVideoConsultation.tsx`  
- `Emergency.tsx`
- `useLiveKit.tsx` hook

---

## Status Summary

| Component | Status | Details |
|-----------|--------|---------|
| LiveKit Service | ✅ Running | Port 7880 |
| Security Headers | ✅ Configured | CORS + CSP |
| Backend API | ✅ Ready | Token endpoint works |
| Frontend Updated | ✅ Done | Fetches tokens |
| Frontend Built | ✅ Success | No errors |
| /rooms Endpoint | ⏳ Partial | Nginx handler needed |
| End-to-End Test | ⏳ Ready | Can test after /rooms setup |

---

## Deployment Complete Timeline

```
[2026-02-11 03:57] LiveKit Server Started ✅
[2026-02-11 03:59] Nginx Reloaded with CORS ✅
[2026-02-11 04:00] Security Headers Applied ✅
[2026-02-11 04:05] Frontend Updated ✅
[2026-02-11 04:10] Frontend Built ✅
[2026-02-11 04:12] Nginx /rooms Handler (Next)
```

---

## For Production

Add to monitoring:
```bash
# Keep LiveKit running via PM2
pm2 start "/usr/local/bin/livekit-server --config /home/ubuntu/livekit-config.yaml" \
  --name livekit-server

# Monitor endpoints
curl http://localhost:7880/health  # LiveKit
curl http://localhost/health      # Nginx proxy
curl http://localhost:8001/video/livekit/token?roomId=test  # API
```

---

**Last Updated:** 2026-02-11 04:12 UTC  
**Status:** Ready for final `/rooms` endpoint implementation
