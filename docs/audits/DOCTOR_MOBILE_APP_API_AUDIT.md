# Audit Report — Doctor Mobile App (`msh_d_app`) API

> **Date:** 2026-05-31
> **Sources audited:**
> - `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` (v2.5, 3889 lines)
> - `docs/doctor/DOCTOR_APP_API_REFERENCE.md` (2454 lines)
> - Cross-referenced against: `server/controller/doctor.controller.js`, `server/routes/doctor.route.js`, `server/routes/prescription.route.js`, `server/routes/scribe.js`, `server/routes/offline-scribe.route.js`, `server/routes/auth.token.route.js`, `server/services/token-revocation.service.js`
> **Audience:** `msh_d_app` React Native team, backend engineers
> **Status:** Open — not yet remediated

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Critical Findings](#critical-findings)
3. [High Severity](#high-severity)
4. [Medium Severity](#medium-severity)
5. [Low Severity](#low-severity)
6. [Fix Priority Matrix](#fix-priority-matrix)

---

## Executive Summary (AI CTO)

The doctor app API surface is large (~200 endpoints across 28 sections) and broadly well-structured — `authDoctor` middleware is consistently applied to the doctor route group, prescriptions are scoped to the authenticated doctor's identity, and the AI scribe endpoints are properly protected (note: the subagent's D-SEC-3 finding was a false positive — `router.use(authDoctor)` at line 63 of `scribe.js` correctly precedes all POST routes at lines 82+).

However, **three Critical findings** block a production release of the doctor app:

1. **Doctor login never returns the refresh token.** `issuePortalTokenPair` generates and stores a 30-day refresh token but the controller destructures only `accessToken`. The access token TTL is **15 minutes** — both doc files say "7 days", which is wrong. Every doctor silently logs out after 15 minutes with no recovery path.
2. **IDOR on patient write operations.** `PUT /api/doctors/my-patients/:patientId` (demographics update), `POST /api/doctors/my-patients/:patientId/vitals` (vitals write), and `GET /api/doctors/my-patients/:patientId/vitals-history` (vitals read) have no doctor–patient relationship check. Any authenticated doctor can write vitals to — or read vitals from — any patient in the entire system.
3. **Production credentials in plain text in Appendix C of the integration guide.** `doctor@mediczy.com` / `Doctor123` are documented as "verified against the production API." Any person with repository read access can log in as this doctor account. Rotate immediately.

One High severity finding has immediate operational impact: the Firebase doctor service account file is missing from the server, causing all FCM push notifications to fail with `messaging/mismatched-credential`. Doctors are not receiving incoming call alerts in production.

---

## Critical Findings

---

### [D-SEC-1] Doctor Login Never Returns Refresh Token — Docs Claim 7-Day TTL

**File:** `server/controller/doctor.controller.js` line 729; both doc files
**Status:** 🔴 Open

`issuePortalTokenPair` returns `{ accessToken, refreshToken, jti }` with:
- `accessToken` TTL = **15 minutes** (default in `issuePortalTokenPair`, `accessTtl = '15m'`)
- `refreshToken` TTL = **30 days** (stored in `portal_refresh_tokens`)

The controller destructures only `accessToken`:

```js
const { accessToken: token } = await issuePortalTokenPair(
  { id: doctor.id, email: doctor.email, role: 'doctor' },
  { portal: 'doctor', deviceFp }
);
```

`refreshToken` is generated and stored in the database but **never sent to the client**. The response JSON contains only `token` and `doctor`. Both doc files state "Token Expiry: 7 days" — the actual TTL is 15 minutes.

Without a refresh token, every doctor session silently expires after 15 minutes, showing a login screen mid-consultation. This is a showstopper for production.

**Fix:**
```js
// server/controller/doctor.controller.js line 729
const { accessToken: token, refreshToken } = await issuePortalTokenPair(
  { id: doctor.id, email: doctor.email, role: 'doctor' },
  { portal: 'doctor', deviceFp }
);

// In response JSON:
return res.status(200).json({
  message: "Login successful",
  token,
  refreshToken,          // ← add this
  expiresIn: 900,        // ← 15 minutes in seconds (for mobile to schedule pre-emptive refresh)
  doctor: { ... }
});
```

**Documentation fix:** In both doc files, update "Token Expiry: 7 days" → "Access token: 15 minutes · Refresh token: 30 days". Add a note that on any 401 the app must call `POST /api/auth/refresh` with the stored `refreshToken` before showing the login screen.

---

### [D-SEC-2] IDOR — Any Doctor Can Write Vitals to or Read Vitals from Any Patient

**File:** `server/routes/doctor.route.js` lines 2078, 2114, 4167, 4091
**Status:** 🔴 Open

Four endpoints accept a `:patientId` URL parameter with no verification that the requesting doctor has an appointment relationship with that patient:

| Endpoint | Line | Impact |
|---|---|---|
| `PUT /api/doctors/my-patients/:patientId` | 2078 | Any doctor updates demographics of any user |
| `POST /api/doctors/my-patients/:patientId/vitals` | 2114 | Any doctor writes vitals for any patient |
| `GET /api/doctors/my-patients/:patientId/vitals-history` | 4167 | Any doctor reads any patient's vitals |
| `GET /api/doctors/my-patients/:patientId/profile` | 4091 | Any doctor reads any patient's full profile |

Doctor A can write blood pressure reading `"200/130"` to Doctor B's patient. This is a data integrity and patient safety failure in a clinical context.

**Fix:** Add a relationship check helper and call it at the top of each handler:

```js
// At top of each my-patients handler:
const hasRelationship = await Appointment.count({
  where: {
    doctorId: req.doctor.id,
    userId: parseInt(patientId),
    status: { [Op.notIn]: ['cancelled'] }
  }
});
if (!hasRelationship) {
  return res.status(403).json({ success: false, message: 'No appointment relationship with this patient' });
}
```

---

### [D-SEC-3] Production Credentials Committed in Plain Text in Integration Guide

**File:** `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` lines 3832-3866, Appendix C
**Status:** 🔴 Open

Appendix C documents working production API credentials:

```
Email:    doctor@mediczy.com
Password: Doctor123
```

The warning "Do not commit these credentials to public repositories" is present but the file is already in a git repository accessible to anyone with repo access. These credentials can be used to log into the production doctor portal, access real patient appointments, view prescriptions, and potentially issue new ones.

**Fix:**
- Replace credentials with `<your-email>` / `<your-password>` placeholder text immediately.
- Rotate the `doctor@mediczy.com` production account password immediately.
- Rotate the `user@mediczy.com` patient account credentials referenced in the same appendix.

---

## High Severity

---

### [D-SEC-4] Doctor FCM Push Notifications Failing in Production — Missing Service Account

**File:** `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` lines 1984-1997
**Status:** 🟠 Open

The integration guide explicitly documents this known failure:

> "The backend routes doctor push notifications through the patient Firebase project when the doctor SA file is absent. This causes `messaging/mismatched-credential` errors because the FCM token was issued under `doctorapp-6c768` but the backend is using `mysmarthealth-b5695` credentials."

All incoming video call notifications, appointment alerts, and triage alerts to doctor devices are silently failing. A patient initiating a call gets no response because the doctor never receives the push.

**Fix (operational, no code change):**
- Provision `config/firebase-service-account-doctor.json` from the `doctorapp-6c768` Firebase project.
- Add a server startup assertion that logs `ERROR: Doctor FCM service account file missing` if the file is absent, rather than silently falling back.
- Add a monitoring alert for FCM `mismatched-credential` error patterns in server logs.

---

### [D-SEC-5] Guest Video Join — No Logging, IP Enumeration Risk

**File:** `server/routes/video.route.js`; `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` section 10.7
**Status:** 🟠 Open

`GET /api/video/join/:inviteCode` is public and returns a LiveKit room token for anyone who presents a valid invite code. If the invite code is guessed, brute-forced, or leaked from a URL, an unauthorized party can join a clinical consultation. Currently there is no logging of who joined as a guest (IP, user-agent, timestamp) and the endpoint has no rate-limiting beyond the global 300 req/15 min limit.

**Fix:**
- Add per-IP rate limit: 5 attempts per 15 minutes on this endpoint.
- Log `{ inviteCode, ip, userAgent, timestamp, joinedAs: 'guest' }` on every guest join.
- Consider requiring a guest name + phone OTP before issuing the LiveKit token.

---

### [D-SEC-6] Appointment Status PATCH Has Insufficient Cross-Role Authorization

**File:** `server/routes/appointment.route.js` lines 338-440
**Status:** 🟠 Open

`PATCH /api/appointments/:id/status` uses `authUser` middleware which accepts both patient and doctor JWTs. The doctor ownership check is:
```js
const isDoctorOwner = req.userRole === 'doctor' && Number(appointment.doctorId) === Number(req.user.id);
```

If `req.userRole !== 'doctor'` and `req.userRole !== 'admin'`, the handler falls through to a "forbidden" path — but the condition does not explicitly gate on `appointment.userId === req.user.id` for patient tokens. The `cancelled` status can be set by any token that passes the middleware if the ownership derivation has any ambiguity.

**Fix:**
- Add an explicit patient-ownership guard: if `getUserType() === 'patient'`, verify `appointment.userId === req.user.id` before processing any status change.
- Restrict status changes other than `cancelled` to doctor/admin only.

---

### [D-SEC-7] No Medical License Verification at Doctor Registration

**File:** `server/routes/doctor.route.js` lines 195-244; `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` section 2.1
**Status:** 🟠 Open

Doctor registration accepts `registrationNumber` and `medicalCouncil` as optional fields. An account is created with `isVerified: false` pending manual review, but there is no validation of registration number format and no integration with NMC or state medical council registries.

**Fix:**
- Make `registrationNumber` and `medicalCouncil` **required** fields at registration.
- Add regex validation for Indian medical council number format (e.g., `MH/YEAR/NNNNN`).
- Require a credential document upload before account activation.
- Establish and document the verification SLA (e.g., 24-48 hours).

---

## Medium Severity

---

### [D-AI-1] AI-Generated Prescriptions Lack a Mandatory Human-Review Gate

**File:** `server/routes/offline-scribe.route.js` line 646; `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` Appendix A.4
**Status:** 🟡 Open

The offline scribe `POST /api/offline-scribe/full-pipeline` can produce a fully-structured prescription in a single API call. Appendix A.4 shows this feeding directly into `POST /api/prescriptions` → `POST /api/prescriptions/:id/issue` without a mandatory human-review step. A poorly designed app can auto-issue an AI-generated prescription in three API calls.

**Fix:**
- Tag prescriptions originating from scribe output with `aiGenerated: true` in the database.
- In `POST /api/prescriptions/:id/issue`, when `aiGenerated` is true, require `{ reviewedByDoctor: true }` in the request body. Return `422` with a clear message if absent.
- Store the original AI generation metadata (model, timestamp, raw transcription) in an immutable audit column.

---

### [D-AI-2] Nurses and Assistants Can Generate Prescription Drafts via Offline Scribe

**File:** `server/routes/offline-scribe.route.js` line 22
**Status:** 🟡 Open

`requireScribeAccess` allows: `doctor`, `assistant`, `nurse`, `team`, `admin`, `hospital`. The prescription-generation endpoints (`POST /api/offline-scribe/prescription`, `/full-pipeline`) inherit this permission. A nurse can generate a prescription draft with specific medication names and dosages.

**Fix:**
- Restrict `POST /api/offline-scribe/prescription` and `POST /api/offline-scribe/full-pipeline` to `doctor` and `admin` roles only.
- Nurses and assistants may use `/transcribe` and `/normalize` (documentation-only steps) but not prescription generation.

---

### [D-ARCH-1] `GET /api/doctors/patients/:patientId` Is Documented but Does Not Exist

**File:** `docs/doctor/DOCTOR_APP_API_REFERENCE.md` section 8.4; `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` section 9.5
**Status:** 🟡 Open

Both documents list `GET /api/doctors/patients/:patientId` — this route does not exist in `doctor.route.js`. The actual route is `GET /api/doctors/my-patients/:patientId/profile`. Any doctor app calling the documented URL receives a 404.

**Fix:**
- Add alias: `router.get('/patients/:patientId', authDoctor, ...)` delegating to the same handler.
- Or update both docs and the app's API helper to use `/my-patients/:patientId/profile`.

---

### [D-ARCH-2] Dual Appointment Route Groups With Different Auth Middleware

**File:** Both doc files; `server/routes/appointment.route.js` and `server/routes/doctor.route.js`
**Status:** 🟡 Open

Two routes return a doctor's appointments:
- `GET /api/appointments/doctor` — uses `authUser + role:doctor`
- `GET /api/doctors/appointments` — uses `authDoctor`

Both return the same data but via different auth middleware chains and potentially different response shapes. The integration guide documents only one, the reference doc lists both. Developers may pick either and encounter subtle differences.

**Fix:**
- Mark `GET /api/appointments/doctor` as deprecated in documentation and add a `Deprecation` response header.
- The canonical mobile app path is `GET /api/doctors/appointments`.

---

### [D-BACK-1] Patient Vitals Accepted Without Range or Unit Validation

**File:** `server/routes/doctor.route.js` lines 2114-2153
**Status:** 🟡 Open

`POST /api/doctors/my-patients/:patientId/vitals` accepts `bp`, `heartRate`, `temperature`, `spo2`, `weight`, `height`, `bloodGlucose`, `notes` with no server-side validation. Temperature in °C (e.g., `37.2`) and °F (e.g., `98.6`) are both stored identically. Blood pressure `"normal"` is as valid as `"120/80"`.

**Fix:**
- Add validation: `bp` must match `/^\d{2,3}\/\d{2,3}$/`, `heartRate` must be integer 20–300, `temperature` must be float 95–108 (°F), `spo2` must be integer 0–100.
- Return `422` with field-level errors for out-of-range values.
- Add a `temperatureUnit` field (`F` or `C`) to allow unit disambiguation.

---

### [D-BACK-2] `GET /api/prescriptions/doctor/issued` Hard-Capped at 100, No Pagination

**File:** `server/routes/prescription.route.js` line 882
**Status:** 🟡 Open

The `/doctor/issued` endpoint returns a hard-coded maximum of 100 prescriptions. High-volume doctors with more than 100 prescriptions lose access to older records silently.

**Fix:**
- Add `?page` (default 0) and `?limit` (default 20, max 100) query parameters.
- Document pagination in the same format as the primary `/doctor` endpoint.

---

### [D-QA-1] Vitals Table Missing Returns 200 — Silent Data Loss

**File:** `server/routes/doctor.route.js` lines 2148-2153
**Status:** 🟡 Open

When the `patient_vitals` table does not exist, the endpoint catches the error and returns `200`:

```js
if (error.original?.code === '42P01' || error.message?.includes('does not exist')) {
  return res.status(200).json({ success: true, message: 'Vitals recorded (pending migration)', vitals: req.body });
}
```

A doctor records critical vitals believing they are saved. The data is silently discarded. This is a patient safety issue.

**Fix:**
- Return `503 Service Unavailable` with `{ success: false, code: 'VITALS_TABLE_NOT_READY', message: 'Vitals service is being set up. Please try again shortly.' }`.
- Add a startup check that logs a prominent warning if the `patient_vitals` table is absent.

---

### [D-COMP-1] Consultation Recordings Start Without Patient Consent Check

**File:** `server/routes/recording.route.js`, `server/routes/consultation-recording.route.js`
**Status:** 🟡 Open

`POST .../recordings/start` requires only `authDoctor`. There is no check for a patient consent record before recording begins. Recording voice/video without explicit consent violates DPDP Act 2023 (India).

**Fix:**
- Before recording starts, query: does a consent record exist with `{ appointmentId, consentType: "recording", status: "granted" }`?
- If not, return `403 CONSENT_REQUIRED`.
- Add the consent-before-recording flow to Appendix A.

---

### [D-DOC-1] `prescriptionNumber` Still Present in AI Scribe Response Example

**File:** `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` line 2239
**Status:** 🟡 Open

The v2.4 changelog (line 51) states "`prescriptionNumber` removed from response examples (field does not exist — use `prescriptionId`)." However, the AI scribe `generate-prescription` response at line 2239 still shows `"prescriptionNumber": "RX-2026-0042"` in the `savedPrescription` object.

**Fix:** Remove the `"prescriptionNumber"` line from the example. The `savedPrescription` object should contain only `id`, `prescriptionId`, and `createdAt`.

---

### [D-DOC-2] Both Docs State Token Expiry Is 7 Days — Reality Is 15 Minutes / 30 Days

**File:** `docs/doctor/DOCTOR_APP_API_REFERENCE.md` line 123; `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` line 3757
**Status:** 🟡 Open

Every token TTL reference says "7 days" for the access token. The actual server implementation (`issuePortalTokenPair`) issues a **15-minute** access token and a **30-day** refresh token.

**Fix:** Update all TTL references in both documents. Add a note in Appendix B: any 401 must trigger a silent refresh attempt before showing the login screen.

---

### [D-DOC-3] Prescription HTML/PDF Marked `Auth: None (public)` in Reference Doc

**File:** `docs/doctor/DOCTOR_APP_API_REFERENCE.md` lines 954, 963
**Status:** 🟡 Open

Both `GET /api/prescriptions/:id/html` and `/:id/pdf` are documented as `Auth: None (public)`. These routes were fixed in the previous patient audit session — both routes now require either an `Authorization` header or a `?token=` query param and return 403 without valid credentials.

**Fix:** Update both entries in the reference doc to `Auth: Bearer <JWT> or ?token=<valid-JWT>`.

---

## Low Severity

---

### [D-DOC-4] `phone` vs `phoneNumber` Field Inconsistency Across PUT/GET

**File:** `server/routes/doctor.route.js` line 2085; `docs/doctor/DOCTOR_APP_API_REFERENCE.md` section 8.6
**Status:** 🔵 Open

`PUT /api/doctors/my-patients/:patientId` reads `phone` from the body but `GET .../profile` returns `phoneNumber`. A developer reading the GET response and sending the field back in the PUT body will have the phone silently ignored.

**Fix:**
- Accept both `phone` and `phoneNumber` in the PUT handler body: `const phone = req.body.phone || req.body.phoneNumber`.
- Align both docs to use `phoneNumber` consistently.

---

### [D-ARCH-3] Availability `:doctorId` URL Routes Lack Ownership Check

**File:** `server/routes/doctor.route.js` — availability routes with `:doctorId` parameter
**Status:** 🔵 Open

Routes like `POST /api/doctors/:doctorId/availability` accept a `doctorId` in the URL. If the backend does not verify that the URL `doctorId` matches the authenticated doctor's ID, Doctor A can set availability slots for Doctor B.

**Fix:**
- Add: `if (parseInt(req.params.doctorId) !== req.doctor.id) return res.status(403).json({ message: 'Cannot modify another doctor\'s availability' });`
- Mark these routes as admin-only in the docs and recommend the token-derived `/doctors/availability/bulk-update` path for the mobile app.

---

### [D-FE-1] `getFileUrl()` Constructs Bare URL — Auth Header Not Sent, Returns 401

**File:** `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` section 28.3
**Status:** 🔵 Open

The documented helper constructs a URL and opens it via `Linking.openURL()`, which does not attach the `Authorization` header. The `/api/doctors/ris-referred/file/:id` endpoint requires `authDoctor`, so every DICOM/PDF file download will return 401.

**Fix:**
- Use `fetch()` with the Authorization header, write the binary to a temp file, and open with a viewer library.
- Or add a `GET /api/doctors/ris-referred/file/:id/presign` endpoint that returns a short-lived (60s) signed URL safe for `Linking.openURL()`.

---

### [D-UX-1] Socket.IO `send-message` Payload Fields Differ Between the Two Docs

**File:** `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` section 25; `docs/doctor/DOCTOR_APP_API_REFERENCE.md` section 27
**Status:** 🔵 Open

Integration guide uses `{ receiverId, type }` while reference doc uses `{ recipientId, messageType }`. The wrong field name silently fails to route the message.

**Fix:** Verify the actual Socket.IO handler field names and align both documents.

---

## Fix Priority Matrix

| Priority | ID | Finding | Status | Effort / Next Action |
|---|---|---|---|---|
| 🔴 P0 | D-SEC-1 | Doctor login never returns refresh token; 15-min TTL undocumented | ✅ Resolved | Implemented in `doctor.controller.js` login response |
| 🔴 P0 | D-SEC-3 | Production credentials in Appendix C | ✅ Resolved | Redacted in integration guide; continue secret rotation hygiene |
| 🔴 P0 | D-SEC-2 | IDOR — any doctor writes/reads any patient vitals | ✅ Resolved | Relationship guard enforced on critical my-patients endpoints |
| 🟠 P1 | D-SEC-4 | Doctor FCM service account missing — push silent fail | ⏳ Open | Operational: provision doctor Firebase SA in prod + smoke validate |
| 🟠 P1 | D-SEC-5 | Guest video join — no rate limit or audit log | ⏳ Open | Add rate limiting and explicit audit trail for guest joins |
| 🟠 P1 | D-SEC-6 | Appointment status PATCH cross-role gap | ⏳ Open | Tighten role gate + ownership checks on status mutation endpoints |
| 🟠 P1 | D-SEC-7 | No medical license validation at registration | ⏳ Open | Add mandatory verification workflow before activation |
| 🟡 P2 | D-QA-1 | Vitals/history table missing returns success — silent data loss | ✅ Resolved | Changed to 503 with explicit not-ready error codes |
| 🟡 P2 | D-AI-1 | AI prescriptions lack mandatory review gate | ⏳ Open | Enforce explicit doctor review/attestation before issue |
| 🟡 P2 | D-AI-2 | Nurses can generate prescription drafts | ✅ Resolved | Offline scribe prescription generation is now doctor-only |
| 🟡 P2 | D-BACK-1 | Vitals accepted without range/unit validation | ✅ Resolved | Added BP/HR/temp/SpO2 validation and 422 responses |
| 🟡 P2 | D-BACK-2 | `/prescriptions/doctor/issued` capped at 100 | ✅ Resolved | `findAndCountAll` pagination with page/limit implemented |
| 🟡 P2 | D-ARCH-1 | `GET /doctors/patients/:id` documented but 404 | ✅ Resolved | Alias route added to canonical my-patients profile handler |
| 🟡 P2 | D-ARCH-2 | Dual appointment routes | ⏳ Open | Add deprecation notice + converge to one route family |
| 🟡 P2 | D-COMP-1 | Recording starts without patient consent | ⏳ Open | Require consent artifact before recording token issuance |
| 🟡 P2 | D-DOC-1 | `prescriptionNumber` in AI scribe example | ⏳ Open | Align examples with actual response schema |
| 🟡 P2 | D-DOC-2 | Both docs say 7-day TTL — reality is 15 min | ⏳ Open | Update TTL docs and refresh flow guidance |
| 🟡 P2 | D-DOC-3 | Prescription HTML/PDF marked Auth:None in reference | ⏳ Open | Correct auth contract in reference documentation |
| 🔵 P3 | D-ARCH-3 | Availability `:doctorId` routes lack ownership check | ✅ Resolved | Controller now enforces doctor role + self-only mutation |
| 🔵 P3 | D-DOC-4 | phone vs phoneNumber inconsistency | ✅ Resolved | Normalized `phone`/`phoneNumber` mapping in patient update |
| 🔵 P3 | D-FE-1 | `getFileUrl()` bare URL fails auth | ⏳ Open | Use auth fetch + temp file open, or short-lived pre-signed URL |
| 🔵 P3 | D-UX-1 | Socket.IO send-message fields differ between two docs | ⏳ Open | Verify server contract and align both docs |

> **D-SEC-3 (scribe routes public) was a false positive** — `router.use(authDoctor)` at line 63 in `scribe.js` correctly precedes all POST routes (lines 82+). No fix needed.

---

*Report generated: 2026-05-31. Status matrix updated after implementation pass on 2026-05-31; re-audit recommended after remaining P1 items are deployed.*
