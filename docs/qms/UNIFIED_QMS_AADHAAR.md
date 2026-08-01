# Unified QMS — Hospital · Clinic · Lab (+ Aadhaar QR)

## Product

One Queue Management System (QMS) for:

| Portal | UI | Zone | Department | Tokens |
|---|---|---|---|---|
| Hospital | `/hospital/qms`, `/hospital/queue-console`, `/kiosk/checkin` | `opd-waiting` / `opd-doc-{id}` | `opd` | `A{doctorId}-###` |
| Clinic | `/clinic/queue` | `clinic-waiting` / `opd-doc-{id}` | `opd` | `A{doctorId}-###` |
| Lab | `/lab/qms` (patient) · `/lab/queue` remains sample workflow | `lab-waiting` | `lab` | `L-###` |

Engine: `hospital_queue_entries` via `server/services/hospital-queue.service.js`.

## API (`/api/qms`)

Auth: hospital staff JWT, clinic portal JWT, or lab JWT (`authPortalQms`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/context` | Portal defaults |
| POST | `/aadhaar/parse` | Extract demographics from Aadhaar Secure QR raw bytes |
| GET | `/opds` | Multi-doctor OPD index (clinic/hospital) |
| GET | `/console` | Live board for tenant |
| GET | `/analytics` | Today stats |
| POST | `/check-in` | Issue token (manual or Aadhaar-assisted) |
| PATCH | `/:id/call\|start\|complete\|no-show` | Reception actions |

### Patient mobile token (P3)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/queue/my-token` | Today's token(s) for logged-in patient |
| POST | `/api/v1/queue/activate-appointment` | Activate token on arrival day (`mode: force`) |

UI: `/my-queue-token?appointmentId=…`

### Aadhaar QR

Client: `KioskAadhaarScanner` → `getRawBytes()` → base64 → `POST /api/qms/aadhaar/parse`.

Extracted fields (never full Aadhaar number):

- `firstName`, `lastName`, `fullName`
- `dateOfBirth`, `gender`
- `careOf`, `address`, `pincode`, `state`
- `aadhaarLast4` only

Stored on check-in in `metadata` (PHI — last4 only). Purged after 30 days by daily retention cron (`qms_phi_purge`).

## Security hardening (P0)

### Device token for kiosk / display mutations

Mutations require `x-device-token` (or `?deviceToken=`). Organization is bound from `display_devices.organization_id` / `config.organization_id` — never from client body.

Provision:

```http
POST /api/display/devices
{ "name": "OPD Kiosk 1", "zone_id": "opd-waiting", "url_path": "/kiosk/checkin", "organization_id": 1 }
```

Open kiosk as: `/kiosk/checkin?deviceToken=<token>` (stored in `localStorage.displayDeviceToken`).

Without token → `401 DEVICE_TOKEN_REQUIRED`.

### Public board `organizationId` override

`GET /api/display/queue`, `/er-triage`, `/command`, `/signage`, `/floor-map`, and `/api/v1/queue/board`:

- No token + no `organizationId` → default org (`HOSPITAL_DEFAULT_ORG_ID`)
- `organizationId` query **without** device token → `401`
- Device token present → org from registry; mismatch → `403`

### Zone-scoped SSE (no PHI fan-out)

`pushQueueEvent(zone, event, data)`:

1. Full payload only to SSE clients subscribed to that zone
2. Global clients get non-PHI `queue_updated` signal: `{ zone, event, ts }`

Optional Redis pub/sub (multi-instance):

- `QMS_SSE_REDIS=true` (default when Redis env present)
- `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`
- Channel: `QMS_SSE_REDIS_CHANNEL` (default `mediczy:qms:sse`)

## Booking → QMS (P1)

When `consultationType` is in-person (patient booking, clinic dashboard, enhanced-appointment, hospital practice):

1. Appointment row is created
2. `issueTokenForAppointment(..., { mode: 'auto' })`:
   - **Today** → issue token immediately
   - **Future date** → deferred (`activateOn` = appointment date); activate at kiosk / `/my-queue-token` / reception
3. WhatsApp/SMS only when `notifyOptIn === true` (explicit checkbox; default off)
4. Response may include `qmsToken` or `deferred: true`

Token sequences: `hospital_queue_token_sequences` with row lock (no COUNT race).  
Unique index: one active token per `(appointment_id, check_in_at::date)`.

Migration: `server/migrations/20260801-qms-hardening.migration.js`

## Token slip

- **Print:** kiosk, QueueConsole, patient `/my-queue-token` (`client/src/utils/qmsPrintSlip.ts`)
- **WhatsApp + SMS (both):** `queue-notify.service.js` (parallel; not fallback-only)
  - Toggle: `QUEUE_NOTIFY_WHATSAPP`, `QUEUE_NOTIFY_SMS`
  - SMS: `SMS_*` or Twilio

## Legacy stubs (P3)

`/api/doctor/queue` mutations return `410 LEGACY_QUEUE_GONE`.  
Reads (`my-queue`, `analytics`) stay on Hospital OS. Prefer `/api/qms` or `/api/v1/queue`.

## Deploy notes

1. Pull + run hardening migration (auto-applied on first token issue if missed)
2. `pm2 restart mediczy-server --update-env`
3. Rebuild frontend (`client` build + `deploy-frontend-s3.sh`)
4. Register kiosk devices with `organization_id`; open with `?deviceToken=`
5. Confirm Twilio WhatsApp + SMS env vars
6. Optional: Redis for multi-PM2 SSE fan-out
