# Appointment + Video Call Audit (Micro-Level)
Date: 2026-02-11
Scope: video join timing, room ID creation/sharing, appointment booking to confirmation, notifications, doctor/patient join flow.

## Flow Map (Observed)
1) Patient books appointment
   - Standard API: `/api/appointments` -> `createAppointment` generates meeting data
   - Enhanced API: `/api/enhanced-appointments/book` generates canonical room ID in metadata

2) Patient joins video
   - MyBookings navigates directly to `/video-consultation?room=...` (no appointmentId)
   - VideoConsultation fetches LiveKit token via `/video/livekit/token` (no appointment gate)

3) Doctor starts call
   - Doctor UI calls `/doctors/appointments/:id/initiate-call`
   - Server updates meeting link and attempts to notify patient

4) Timing enforcement
   - Only enforced in `/api/consultation/video/join/:appointmentId`
   - Client does not call this endpoint

## Findings (With Evidence)

### 1) 15-minute join rule is not enforced in the actual client join path
- Enforcement exists only in the consultation join API (server-side time window check).
  - Evidence: [server/routes/online-consultation.route.js](server/routes/online-consultation.route.js#L1238-L1278)
- Patient UI does not call `/api/consultation/video/join/:appointmentId`.
  - Evidence: [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx#L244-L271)
  - Evidence: [client/src/pages/VideoConsultation.tsx](client/src/pages/VideoConsultation.tsx#L64-L110)
- LiveKit token endpoint accepts `roomId`/`appointmentId` and returns token without timing or status validation.
  - Evidence: [server/controller/video.controller.js](server/controller/video.controller.js#L88-L129)

Impact:
- The UI can attempt to join outside the 15-minute window, or in any window, because the only gate is bypassed.

### 2) Meeting ID generation is inconsistent between booking flows
- Standard booking uses `createMeetingInfo({ appointmentId: Date.now() })`, which creates a meeting ID unrelated to the actual appointment ID.
  - Evidence: [server/controller/appointment.controller.js](server/controller/appointment.controller.js#L300-L319)
- Enhanced booking generates a canonical meeting ID derived from the appointment ID and stores it in metadata.
  - Evidence: [server/routes/enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js#L392-L439)

Impact:
- Standard flow: meetingLink/meetingId can drift from the appointment record, making sharing and join resolution unreliable.
- Enhanced flow: canonical IDs differ from standard flow and are not surfaced to the patient UI consistently.

### 3) Meeting link storage is split across metadata vs top-level fields
- Notification service pulls meeting info from `appointment.metadata.meeting.*`.
  - Evidence: [server/services/appointment-notification.service.js](server/services/appointment-notification.service.js#L96-L165)
- Standard booking stores `meetingLink` and `meetingId` at top-level and does NOT set `metadata.meeting.*`.
  - Evidence: [server/controller/appointment.controller.js](server/controller/appointment.controller.js#L319-L343)
- Enhanced booking stores meeting info only inside `metadata.meeting.*` and uses `meet.mediczy.com/...` URLs.
  - Evidence: [server/routes/enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js#L412-L439)

Impact:
- Reminders may lack room ID/link for standard appointments (metadata missing).
- Patient UI might not receive meetingLink for enhanced appointments (top-level fields missing).

### 4) Patient join URL does not include appointmentId
- MyBookings uses only `room` query param and omits `appointmentId`.
  - Evidence: [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx#L244-L271)
- VideoConsultation refuses to fetch LiveKit token if `appointmentId` is missing.
  - Evidence: [client/src/pages/VideoConsultation.tsx](client/src/pages/VideoConsultation.tsx#L78-L108)

Impact:
- Patient join can fail or use stale room IDs; no server-side authorization/time gate is applied.

### 5) Doctor notify flow uses an undefined notification template
- Doctor initiate-call sends notification type `consultation_started`.
  - Evidence: [server/routes/doctor.route.js](server/routes/doctor.route.js#L2526-L2542)
- Notification templates do NOT include `consultation_started`.
  - Evidence: [server/services/notification.service.js](server/services/notification.service.js#L52-L132)

Impact:
- Patient may never receive the call notification, even though the room is created.

### 6) Meeting link format mismatch can break room extraction
- Enhanced booking uses `https://meet.mediczy.com/${canonicalMeetingId}`.
  - Evidence: [server/routes/enhanced-appointment.route.js](server/routes/enhanced-appointment.route.js#L412-L439)
- Room extraction in MyBookings expects `/rooms/`, `/room/`, `/join/`, or query params; otherwise it returns the full URL as room ID.
  - Evidence: [client/src/pages/MyBookings.tsx](client/src/pages/MyBookings.tsx#L235-L258)

Impact:
- The room ID can become the full URL string, which then gets passed to LiveKit token generation and leads to invalid room names or mismatched meeting IDs.

## Summary of Root Causes
- The only timing enforcement exists in `/consultation/video/join`, but client bypasses it.
- Two parallel appointment flows generate and store meeting IDs in incompatible ways.
- Notifications read metadata while standard booking writes top-level fields only.
- Patient join route omits `appointmentId`, so the client never hits the intended gate.
- Doctor notifications use a template key that does not exist.

## Recommended Fix Plan (Priority Order)
1) Enforce join gate in the token endpoint (or route all joins through `/consultation/video/join`).
2) Normalize meeting ID generation across both booking flows (use canonical appointment-based ID everywhere).
3) Store meeting data in one canonical place (top-level fields + metadata sync) and update all reads to match.
4) Update MyBookings to include `appointmentId` in the video route query string.
5) Add or correct notification template `consultation_started` (or use `consultation_starting`/`video_ready`).
6) Align meeting link format with the client’s room extraction logic.

## Suggested Next Steps
- I can implement fixes 1-5 in a single PR and add regression checks if you want.
- If you want runtime verification, we can run a targeted flow test against a real appointment ID.
