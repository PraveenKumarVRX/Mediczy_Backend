# Video Call API Audit & Mobile Integration Guide

**Date:** 2025-07-14  
**Commit:** `f2983c8` (post-fix)  
**Auditor:** Automated audit  

---

## 1. Architecture Overview

| Component | Technology | URL/Config |
|---|---|---|
| Video Engine | LiveKit (self-hosted) | `wss://video.mediqzy.com` |
| Server SDK | `livekit-server-sdk` | AccessToken generation |
| Frontend SDK | `@livekit/components-react` + `livekit-client` | React components |
| Push Notifications | Firebase Cloud Messaging (FCM) | **NOT CONFIGURED** (placeholder env vars) |
| Real-time Signaling | Socket.IO | `video-call-invitation` event |
| ICE/NAT Traversal | STUN only (Google public) | **No TURN relay** |
| Meeting IDs | HMAC-SHA256 canonical IDs | Format: `apt-{appointmentId}-{8char_hash}` |

---

## 2. API Endpoints Reference

### 2.1 Core Video Routes (`/api/video/`)

| Method | Endpoint | Auth | Purpose | Mobile-Ready |
|---|---|---|---|---|
| GET | `/test` | Yes | Health check, returns ICE servers | ✅ |
| POST | `/livekit/token` | Yes | Generate LiveKit token (simple, roomName only) | ✅ |
| GET | `/livekit/token?roomName=X&appointmentId=Y` | Yes | Full token with appointment validation + time window | ✅ |
| POST | `/room/token` | Yes | JWT room token (legacy, not LiveKit) | ⚠️ Legacy |
| POST | `/room/:roomId/join` | Yes | Join room, lazy-create, canonical ID verification | ✅ |
| POST | `/room/:roomId/leave` | Yes | Leave room, auto-create prescription draft if doctor | ✅ |
| POST | `/room/:roomId/invite` | Yes | Create shareable invite link (4h TTL, max 20 uses) | ✅ |
| GET | `/join/:inviteCode` | **No** | Public guest join via invite code | ✅ |
| GET | `/room/:roomId/status` | Yes | Room type, capacity, features | ⚠️ Static data |

### 2.2 Consultation Video Routes (`/api/consultation/video/`)

| Method | Endpoint | Auth | Purpose | Mobile-Ready |
|---|---|---|---|---|
| GET | `/join/:appointmentId` | Yes | **Primary join** — payment check, time window (±15min/1hr), status transition, canonical ID, LiveKit token | ✅ |
| POST | `/end/:appointmentId` | Yes (Doctor) | End consultation, update appointment status | ✅ |

### 2.3 Call Notification Routes (`/api/call-notification/`)

| Method | Endpoint | Auth | Purpose | Mobile-Ready |
|---|---|---|---|---|
| POST | `/doctor-to-patient` | Doctor | Send FCM push + log to DB | ❌ FCM not configured |
| POST | `/end-call` | Doctor | Mark call notifications as read | ✅ |
| GET | `/patient/:patientId/status` | Doctor | Check if patient has active FCM tokens | ✅ |

### 2.4 Video Events Routes (`/api/video-events/`)

| Method | Endpoint | Auth | Purpose | Mobile-Ready |
|---|---|---|---|---|
| POST | `/stream/start` | **None** | Publish stream-start to Kafka | ❌ No auth |
| POST | `/stream/end` | **None** | Publish stream-end to Kafka | ❌ No auth |
| POST | `/stream/quality` | **None** | Publish quality metrics | ❌ No auth |
| POST | `/participant/joined` | **None** | Publish participant-joined | ❌ No auth |
| POST | `/participant/left` | **None** | Publish participant-left | ❌ No auth |
| POST | `/recording/start` | **None** | Publish recording-start | ❌ No auth |
| POST | `/recording/stop` | **None** | Publish recording-stop | ❌ No auth |
| POST | `/stream/error` | **None** | Publish stream error | ❌ No auth |

### 2.5 Video Config Routes (`/api/video-config/`) — Admin Only

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/settings` | Admin | Get video system settings |
| PUT | `/settings` | Admin | Update settings (provider, quality, ICE servers) |
| GET | `/providers` | Admin | List available providers |
| POST | `/test-connection` | Admin | Test LiveKit connection |
| *+7 more* | ... | Admin | Quality presets, status, features |

---

## 3. Mobile Integration Flow

### 3.1 Authentication
```
POST /api/doctors/login    → { token }     (for doctors)
POST /api/patient/login    → { token }     (for patients)
```
Use Bearer token in `Authorization` header for all subsequent calls.

### 3.2 Joining a Video Call (Recommended Flow)

```
Mobile App                              Server
   │                                      │
   ├── GET /api/consultation/video/       │
   │   join/:appointmentId ──────────────►│ Validates payment, time window,
   │                                      │ status, generates canonical meeting ID,
   │◄────────────────────────────────────┤ transitions to 'in-progress'
   │   { livekit: { token, serverUrl,     │
   │     roomName }, meetingId, ... }      │
   │                                      │
   ├── Connect LiveKit SDK ──────────────►│ wss://video.mediqzy.com
   │   serverUrl + token                  │
   │                                      │
   ├── POST /api/video-events/            │
   │   participant/joined ───────────────►│ (Send quality/join events)
   │                                      │
   │  ... video call in progress ...      │
   │                                      │
   ├── POST /api/consultation/video/      │
   │   end/:appointmentId ───────────────►│ (Doctor ends call)
   │                                      │
   └── POST /api/video-events/            │
       participant/left ─────────────────►│
```

### 3.3 Incoming Call Notification (Push)

```
Doctor App                              Server                          Patient App
   │                                      │                                │
   ├── POST /api/call-notification/       │                                │
   │   doctor-to-patient ───────────────►│ Lookup patient FCM tokens      │
   │   { appointmentId, patientId }       │                                │
   │                                      ├── FCM Push ──────────────────►│
   │                                      │   { type: 'VIDEO_CALL',       │
   │                                      │     appointmentId,             │
   │                                      │     doctorName,                │
   │                                      │     clickAction:               │
   │                                      │     'join_video_call' }        │
   │                                      │                                │
   │                                      │         Socket.IO relay ──────►│
   │                                      │   'video-call-invitation'      │
   │                                      │                                │
   │                                      │◄── GET /consultation/video/   │
   │                                      │    join/:appointmentId ────────┤
   │                                      │                                │
```

### 3.4 LiveKit Token Payload (Decoded)

```json
{
  "sub": "doctor-70",         // identity
  "name": "Nandita Agarwal", // display name (BUG FIXED in f2983c8)
  "iss": "API29FkbfieGsfq",  // API key
  "exp": 1752506400,          // 1 hour TTL (default)
  "video": {
    "roomJoin": true,
    "room": "apt-21-cca8a85b",
    "canPublish": true,
    "canSubscribe": true
  }
}
```

---

## 4. Mobile SDK Integration

### 4.1 LiveKit Native SDKs

| Platform | SDK | Install |
|---|---|---|
| iOS | `livekit-swift` | `pod 'LiveKit'` or SPM |
| Android | `livekit-android` | `implementation 'io.livekit:livekit-android:2.x.x'` |
| Flutter | `livekit_client` | `livekit_client: ^2.x.x` |
| React Native | `@livekit/react-native` | `npm install @livekit/react-native` |

### 4.2 Minimum Integration Code (Pseudocode)

```kotlin
// Android Example
val response = api.get("/consultation/video/join/$appointmentId")
val serverUrl = response.livekit.serverUrl  // wss://video.mediqzy.com
val token = response.livekit.token

val room = LiveKit.create(appContext)
room.connect(serverUrl, token)

// Publish camera/mic
val localParticipant = room.localParticipant
localParticipant.setCameraEnabled(true)
localParticipant.setMicrophoneEnabled(true)
```

### 4.3 FCM Setup for Incoming Calls

The mobile app must:
1. Register for FCM and obtain a device token
2. Send token to server via Socket.IO `update-fcm-token` event or a REST endpoint
3. Handle incoming FCM push with `clickAction: 'join_video_call'`
4. Show a call notification UI (CallKit on iOS, ConnectionService on Android)
5. On accept: call `GET /api/consultation/video/join/:appointmentId`

---

## 5. Bugs Found & Fixed

### 5.1 FIXED: Doctor Display Name Shows "System User" (commit `f2983c8`)

| Item | Details |
|---|---|
| **Symptom** | All doctors appeared as "System User" in video calls |
| **Root Cause** | `TENANT_BYPASS_ROLES` includes `"doctor"`, so auth middleware matched doctors at the generic bypass branch (using `decoded.firstName \|\| "System"`) before the doctor-specific branch that loads the DB profile |
| **Fix** | Moved doctor role check before the tenant bypass check in `auth.middleware.js` |
| **Impact** | All video call tokens, in-call display names, and any code relying on `req.user.firstName`/`lastName` for doctors |
| **Verified** | LiveKit token now shows `name: "Nandita Agarwal"` instead of `"System User"` |

---

## 6. Issues & Risks for Mobile

### 6.1 CRITICAL: Firebase/FCM Not Configured

**Status:** Firebase env vars are all placeholders (`your_api_key`, `your_project_id`, etc.)

**Impact:** Push notifications for incoming calls are silently disabled. `sendDoctorCallingNotification()` returns without error but does nothing. Mobile patients will NOT receive incoming call alerts.

**Fix Required:**
1. Create a Firebase project at console.firebase.google.com
2. Generate a service account JSON key
3. Set env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
4. Store FCM device tokens per user (currently in-memory via Socket.IO — lost on restart)
5. Restart PM2

### 6.2 CRITICAL: No TURN Server

**Status:** Only public Google STUN servers configured. No TURN relay exists.

**Impact:** Video calls will fail for users behind:
- Symmetric NATs (common on mobile carriers)
- Corporate firewalls
- Restrictive networks blocking UDP

Mobile users on cellular networks are particularly affected — estimated 10-15% of mobile calls will fail to connect.

**Fix Required:**
1. Deploy coturn server (or use a hosted TURN service like Twilio/Xirsys)
2. Set `TURN_SERVER_URL` env var to `turn:your-turn-server:3478`
3. Add TURN credentials to ICE server config in `video.controller.js`

### 6.3 HIGH: Video Events Routes Have No Authentication

**Status:** All 8 endpoints in `/api/video-events/` are completely unauthenticated.

**Impact:** Anyone can POST fake telemetry/events to Kafka. Potential for abuse, false metrics, and event spoofing.

**Fix Required:** Add `authUser` middleware to video-events routes.

### 6.4 MEDIUM: Invite Codes Stored In-Memory

**Status:** Invite codes and usage counts are stored in a `Map()` — lost on every PM2 restart.

**Impact:** Active invite links become invalid after server restart. With PM2 cluster mode (2 instances), invite created on instance 0 may not be found on instance 1.

**Fix Required:** Move invite storage to Redis or PostgreSQL.

### 6.5 MEDIUM: FCM Token Storage is In-Memory

**Status:** Socket.IO `update-fcm-token` handler stores tokens in a module-level Map, not in the database.

**Impact:** FCM tokens are lost on restart, and not shared across cluster instances. The `call-notification` endpoint does query the DB `notifications` table for device tokens, but the Socket.IO-based token registration doesn't persist.

**Fix Required:** Persist FCM tokens to a `device_tokens` table linked to user ID.

### 6.6 LOW: Room Status Returns Static Data

**Status:** `GET /api/video/room/:roomId/status` returns hardcoded type/capacity/features — it does not query LiveKit for actual participant count or room state.

**Impact:** Mobile apps cannot reliably check if a room is active or how many participants are in it.

**Fix Suggestion:** Use LiveKit Server SDK's `RoomServiceClient.listParticipants()` for live room status.

---

## 7. Mobile Readiness Scorecard

| Category | Score | Notes |
|---|---|---|
| **Token Generation** | ✅ Ready | LiveKit tokens generated correctly with proper identity/name |
| **Join Flow** | ✅ Ready | Validated: payment check, time window, canonical IDs, status transitions |
| **Video Quality** | ✅ Ready | 720p30, adaptive stream, dynacast, echo cancellation, noise suppression |
| **Authentication** | ✅ Ready | Bearer token auth on all critical endpoints |
| **Meeting IDs** | ✅ Ready | Deterministic HMAC-based, consistent across participants |
| **Leave/End Flow** | ✅ Ready | Auto prescription draft, status update to 'completed' |
| **Invite Links** | ⚠️ Partial | Works but in-memory (lost on restart, not cluster-safe) |
| **Push Notifications** | ❌ Blocked | Firebase not configured — incoming call push disabled |
| **NAT Traversal** | ❌ Blocked | No TURN server — mobile cellular connections will fail |
| **Event Telemetry** | ❌ Insecure | Video events routes have no auth |
| **Participant Tracking** | ⚠️ Partial | Room status is static, not live from LiveKit |
| **Deep Linking** | ⚠️ Needs Work | `clickAction: 'join_video_call'` in FCM payload — app must handle |

### Overall: **60% Mobile-Ready**

Core video calling works (token generation, LiveKit connection, join/leave lifecycle). However, **two blocking issues** must be resolved before mobile launch:

1. **Configure Firebase for FCM push notifications** — patients won't know they have an incoming call
2. **Deploy a TURN server** — mobile users on cellular/restricted networks will fail to connect

---

## 8. Recommended Mobile Integration Checklist

- [ ] Configure Firebase project and set env vars
- [ ] Deploy coturn TURN server and update ICE config
- [ ] Add auth middleware to `/api/video-events/` routes
- [ ] Persist FCM device tokens to database (not in-memory)
- [ ] Move invite codes to Redis/PostgreSQL
- [ ] Implement CallKit (iOS) / ConnectionService (Android) for incoming calls
- [ ] Handle `join_video_call` deep link in mobile app
- [ ] Add background audio mode for call in background
- [ ] Implement network quality indicator using LiveKit SDK
- [ ] Add reconnection logic with exponential backoff
- [ ] Test on cellular networks (3G/4G/5G) with real devices
- [ ] Test call quality metrics reporting via `/api/video-events/stream/quality`
- [ ] Set up Sentry/crash reporting for video call failures
