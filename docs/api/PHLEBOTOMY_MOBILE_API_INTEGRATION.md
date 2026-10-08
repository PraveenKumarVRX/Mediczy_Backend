# Phlebotomist Mobile App — API Integration Guide

| | |
|---|---|
| **Audience** | Engineers building the phlebotomist ("collector") mobile app — including the `phlebotomy-app-development` prototype ("Carepath mobile") |
| **API version** | 0.1 — live in production since 2026-10-07 (server `main` @ `566651f4`) |
| **Base URL** | `https://app.mediqzy.com/api` |
| **Machine-readable contract** | [`phlebotomy-collection.openapi.yaml`](./phlebotomy-collection.openapi.yaml) (same endpoints; this guide adds behaviour, flows and gaps) |
| **Design record** | [`COLLECTION_PLATFORM_ADR.md`](../architecture/COLLECTION_PLATFORM_ADR.md) |
| **Examples** | Every request/response below was **captured from the real service** (production schema, rolled-back transaction), not hand-written. Identifiers and timestamps are from that run. |

---

## 0. Read this first

1. **There is no staging environment.** The only API is production. Development needs a test lab, a test collector and test tasks created through the lab portal (§12). Never point a build at real patients until the pilot is agreed.
2. **The server is the source of truth for the workflow.** The app does not decide what a collector may do next — it renders `permittedCommands` from the server. A button that is not in that list must not be shown.
3. **Every write is idempotent and versioned.** Each command carries an `Idempotency-Key` header and the task `expectedVersion` in the body. This is what makes offline queues and flaky mobile networks safe (§8).
4. **Several things in the prototype have no backend yet** — route optimisation, patient chat, selfie proof, on-site extra tests, payment collection, replacement-sticker printing, QC fields, push notifications. They are listed screen by screen in §9. Do not build UI that pretends they work.
5. **A browser/PWA build is blocked by CORS today** (the prototype is a Next.js web app). A native build (Expo/React Native, or a WebView wrapper that sends no `Origin`) is not. See §11.

---

## 1. Quick start

```bash
BASE=https://app.mediqzy.com/api

# 1. sign in (credentials are issued by the lab; the first password is temporary)
curl -s -X POST $BASE/phlebotomy/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-Id: device-3f9c1a7e-0001' \
  -d '{"email":"aisha.khan@example.com","password":"<temporary password>"}'
# → { "accessToken": "...", "refreshToken": "...", "mustChangePassword": true, "worker": { "uid": "FCQ76L", ... } }

# 2. change the temporary password (required before anything else works)
curl -s -X POST $BASE/phlebotomy/auth/change-password -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' -d '{"currentPassword":"...","newPassword":"..."}'
# …then sign in again (this call revoked every session)

# 3. read your assignments
curl -s $BASE/phlebotomy/tasks -H "Authorization: Bearer $ACCESS"

# 4. act on one (note the three required pieces: Idempotency-Key, X-Device-Id, expectedVersion)
curl -s -X POST $BASE/phlebotomy/tasks/$TASK/accept -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: op-0001-9f3a1c2e' -H 'X-Device-Id: device-3f9c1a7e-0001' \
  -d '{"expectedVersion":2,"assignmentVersion":1}'
```

---

## 2. Conventions

### 2.1 Requests

| Item | Rule |
|---|---|
| Format | JSON bodies (`Content-Type: application/json`), UTF-8. Timestamps are ISO-8601 UTC (`2026-10-07T19:20:17.936Z`). |
| `Authorization` | `Bearer <accessToken>` on every call except `auth/login`, `auth/refresh`, `auth/logout`. |
| `Idempotency-Key` | **Required on every task command** (`POST /tasks/:id/*`). 8–128 chars from `A-Za-z0-9._:-`. Generate one UUID per *user action*, persist it with the queued command and **reuse it for every retry** of that action. |
| `X-Device-Id` | **Required on every task command.** A stable per-install id (8–128 chars, same alphabet). Generate once at first launch and keep it in secure storage. Also send it on login/refresh (it scopes the refresh-token family). |
| `X-Correlation-Id` | Optional, ≤64 chars. Stored with the event; quote it to support. |
| `X-App-Version` | Optional. Currently ignored by the server; send it anyway so it can be used without an app update. |
| `expectedVersion` | **Required in the body of every task command.** The `version` from the most recent task response you hold. See §8. |
| Unknown body fields | Unknown fields *inside* `evidence` are rejected (422); unknown top-level fields are currently ignored — do not rely on that, send only documented fields. |

### 2.2 Responses

Success: HTTP 200 (201 for creation), body always contains `"success": true`.
Failure: a 4xx/5xx with the same envelope:

```json
{ "success": false, "code": "version_conflict", "message": "The task changed since you loaded it",
  "details": { "currentVersion": 7, "status": "consented" } }
```

Branch on `code`, never on `message` (messages are for logs and may change). `details` carries machine-usable context when there is any.

### 2.3 Identifiers

| Id | Shape | Notes |
|---|---|---|
| Collector (`worker.uid`) | `F` + 5 chars, e.g. `FCQ76L` | The collector's public identity. The only collector id the API ever returns. |
| Owner (`ownerUid`) | 6 chars, e.g. `LDQM9T` | The lab (or hospital) the collector works for. A collector can belong to more than one. |
| Task / test / specimen | UUID v4 | |
| Barcode | `^[A-Za-z0-9._-]{4,64}$` | The sticker value. Unique per lab forever — a rejected tube's barcode is never reusable. |

### 2.4 Limits

| Limit | Value |
|---|---|
| Failed sign-ins | 5 per email per 15 min, 20 per IP per 15 min (only *failures* count). Beyond that: HTTP 429. |
| Account lock | 5 wrong passwords lock the account for 15 minutes. The response is the same `401 invalid_credentials` — the app cannot (and should not) distinguish "locked" from "wrong password". |
| Global | 300 requests per 15 minutes per client IP across `/api` (mobile networks often share an IP — do not poll aggressively; §8.4). HTTP 429 with standard `RateLimit-*` headers. |
| Page size | `GET /tasks?limit=` 1–100 (default 50). |
| Closed tasks | Stay in the worklist for **2 days** after closing, so the app can reconcile. |

---

## 3. Authentication

### 3.1 Lifecycle

```
login ──► mustChangePassword? ──yes──► change-password (revokes ALL sessions) ──► login again
   │                                   
   no
   ▼
access token (15 min) ──expires──► refresh (rotates both tokens; the OLD access token stops working) ──► new pair
refresh token (7 days)                       │
                                             └─ invalid_refresh_token / token_revoked ──► back to sign-in, wipe local data
```

| Token | Lifetime | Where it goes |
|---|---|---|
| Access | 15 minutes | `Authorization: Bearer` |
| Refresh | 7 days, **single use** (rotated on every refresh) | `POST /auth/refresh` body only |

Rules that matter:

* The access and refresh token of a pair share an id, so **refreshing invalidates the previous access token immediately**. Run refresh **single-flight** (one in-flight refresh; queue other requests behind it) and always persist the *new* refresh token before using the new access token.
* A used refresh token returns `401 invalid_refresh_token`. If two requests race to refresh, the loser must retry with the winner's tokens, not re-sign-in.
* The worker is **re-checked on every request** (and at refresh): suspension, an expired qualification or the lab being deactivated take effect on the very next call — you will see `401 token_revoked` or `403 account_unavailable`.
* Tokens must live in the platform secure store (iOS Keychain / Android Keystore). **Never** in `localStorage`, `AsyncStorage`, logs or crash reports.

### 3.2 Endpoints

**Login (temporary password)**

```http
POST /api/phlebotomy/auth/login
X-Device-Id: device-3f9c1a7e-0001

{ "email": "aisha.khan@probe.invalid", "password": "<password>" }
```

```http
HTTP 200

{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1Ni…",
  "refreshToken": "eyJhbGciOiJIUzI1Ni…",
  "jti": "6a47dc89-67b7-4f91-89ab-0acd7cf2cd2c",
  "mustChangePassword": true,
  "worker": { "uid": "FCQ76L", "displayName": "Aisha Khan" }
}
```

**Tasks before changing the temporary password**

```http
GET /api/phlebotomy/tasks
Authorization: Bearer <accessToken>

```

```http
HTTP 403

{ "success": false, "code": "password_change_required", "message": "Change your temporary password to continue" }
```

**Change password**

```http
POST /api/phlebotomy/auth/change-password
Authorization: Bearer <accessToken>

{ "currentPassword": "<password>", "newPassword": "<password>" }
```

```http
HTTP 200

{ "success": true, "ok": true }
```

**Login with wrong credentials**

```http
POST /api/phlebotomy/auth/login
X-Device-Id: device-3f9c1a7e-0001

{ "email": "aisha.khan@probe.invalid", "password": "<password>" }
```

```http
HTTP 401

{ "success": false, "code": "invalid_credentials", "message": "Invalid email or password" }
```

**Refresh**

```http
POST /api/phlebotomy/auth/refresh
X-Device-Id: device-3f9c1a7e-0001

{ "refreshToken": "eyJhbGciOiJIUzI1Ni…" }
```

```http
HTTP 200

{ "success": true, "accessToken": "eyJhbGciOiJIUzI1Ni…", "refreshToken": "eyJhbGciOiJIUzI1Ni…" }
```

**Refresh with a token that was already used**

```http
POST /api/phlebotomy/auth/refresh
X-Device-Id: device-3f9c1a7e-0001

{ "refreshToken": "eyJhbGciOiJIUzI1Ni…" }
```

```http
HTTP 401

{ "success": false, "code": "invalid_refresh_token", "message": "Session expired. Sign in again." }
```

**Logout**

```http
POST /api/phlebotomy/auth/logout

{ "refreshToken": "eyJhbGciOiJIUzI1Ni…" }
```

```http
HTTP 200

{ "success": true, "ok": true }
```

### 3.3 `GET /phlebotomy/me`

Call after sign-in and on app resume. `memberships[].canHome / canWard` decide which modes to show; `serverTime` lets you detect device clock skew (§8.5).

**Me**

```http
GET /api/phlebotomy/me
Authorization: Bearer <accessToken>

```

```http
HTTP 200

{
  "success": true,
  "worker": {
    "uid": "FCQ76L",
    "displayName": "Aisha Khan",
    "email": "aisha.khan@probe.invalid",
    "phone": "9000000001",
    "status": "active",
    "qualification": "DMLT",
    "qualificationExpires": null,
    "verifiedAt": "2026-10-07T19:20:17.936Z",
    "mustChangePassword": false,
    "lastLoginAt": "2026-10-07T19:20:17.936Z"
  },
  "memberships": [
    {
      "ownerUid": "LDQM9T",
      "scopes": ["phlebotomy.worklist.read", "phlebotomy.collection.write"],
      "canHome": true,
      "canWard": true
    }
  ],
  "capabilities": { "home": true, "ward": true },
  "serverTime": "2026-10-07T19:20:20.024Z"
}
```

### 3.4 Auth error reference

| HTTP | `code` | Meaning | App action |
|---|---|---|---|
| 401 | `unauthenticated` | No `Authorization` header | Go to sign-in |
| 401 | `token_expired` | Access token expired | Refresh once, retry |
| 401 | `invalid_token` | Malformed/forged token | Sign out |
| 401 | `token_revoked` | Session revoked (password change, suspension, logout elsewhere) | Wipe local data, sign in |
| 401 | `invalid_credentials` | Wrong email/password, **or the account is locked** | Show a generic message; do not reveal which |
| 401 | `invalid_refresh_token` | Refresh token used, expired or revoked | Sign in again |
| 403 | `password_change_required` | Temporary password still in use | Show the change-password screen (only `/me` and `/auth/change-password` work) |
| 403 | `account_unavailable` | Correct password but the account may not work (suspended, qualification expired, no active membership, lab inactive) | "Contact your lab administrator" |
| 403 | `wrong_account_type` | A token that is not a collector token (e.g. a lab login) | Sign out |

---

## 4. The data you work with

### 4.1 Task (worklist projection)

```ts
interface Task {
  id: string;                         // uuid
  mode: 'home' | 'ward';
  status: TaskStatus;                 // see §5
  priority: 'routine' | 'urgent' | 'stat';
  scheduledStart: string | null;      // often null: manual tasks have no window; booking tasks have a day window
  scheduledEnd: string | null;
  version: number;                    // send back as expectedVersion
  assignmentVersion: number;          // send back when accepting
  patient: { name: string | null; age: number | null; gender: string | null };
  collectedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  permittedCommands: CommandName[];   // what THIS collector may do NOW — render buttons from this
  home?: {                            // mode === 'home'
    departedAt: string | null; arrivedAt: string | null;
    address?: { line1: string; line2: string | null; city: string; state: string | null; pincode: string | null; landmark: string | null };
    contactPhone?: string | null;     // address & phone appear only AFTER the task is accepted
  };
  ward?: {                            // mode === 'ward'
    facilityUid: string; wardName: string | null; bedLabel: string | null; roundLabel: string | null;
    isolationRequired: boolean; isolationAckAt: string | null; atBedsideAt: string | null;
  };
}
```

**Minimum necessary data.** The server deliberately does *not* send date of birth, UHID, phone (before acceptance) or address (before acceptance). The collector verifies identity by **asking the patient and comparing with name / age / gender** (home) or wristband + name (ward). See §9 for how this differs from the prototype's DOB screen.

**Worklist with an assignment**

```http
GET /api/phlebotomy/tasks
Authorization: Bearer <accessToken>

```

```http
HTTP 200

{
  "success": true,
  "tasks": [
    {
      "id": "02e8e074-6357-492c-b8ef-972fae915907",
      "mode": "home",
      "status": "assigned",
      "priority": "routine",
      "scheduledStart": null,
      "scheduledEnd": null,
      "version": 2,
      "assignmentVersion": 1,
      "patient": { "name": "Maya Patel", "age": 29, "gender": "female" },
      "collectedAt": null,
      "closedAt": null,
      "createdAt": "2026-10-07T19:20:17.936Z",
      "permittedCommands": ["accept", "decline"],
      "home": { "departedAt": null, "arrivedAt": null }
    }
  ],
  "nextCursor": null,
  "serverTime": "2026-10-07T19:20:20.106Z"
}
```

**Task detail (not yet accepted: address withheld)**

```http
GET /api/phlebotomy/tasks/{taskId}
Authorization: Bearer <accessToken>

```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "assigned",
    "priority": "routine",
    "scheduledStart": null,
    "scheduledEnd": null,
    "version": 2,
    "assignmentVersion": 1,
    "patient": { "name": "Maya Patel", "age": 29, "gender": "female" },
    "collectedAt": null,
    "closedAt": null,
    "createdAt": "2026-10-07T19:20:17.936Z",
    "permittedCommands": ["accept", "decline"],
    "home": { "departedAt": null, "arrivedAt": null }
  },
  "tests": [
    {
      "id": "f923ca44-6f41-4bbc-b71d-69583836a1b7",
      "code": "LIP",
      "name": "Lipid profile",
      "containerType": "serum",
      "requiredVolumeMl": null,
      "handling": null,
      "priority": "routine",
      "status": "required",
      "specimenId": null
    }
  ],
  "specimens": []
}
```

_(`tests` shortened to 1 of 3)_

### 4.2 Tests and specimens

```ts
interface Test {                      // what must be collected
  id: string; code: string | null; name: string;
  containerType: 'unspecified'|'edta'|'serum'|'plasma_heparin'|'fluoride'|'citrate'|'urine'|'culture'|'other';
  requiredVolumeMl: number | null; handling: string | null; priority: 'routine'|'urgent'|'stat';
  status: 'required'|'scanned'|'collected'|'received'|'rejected';
  specimenId: string | null;
}
```

Map `containerType` to the tube colour/name in the app (the prototype's "Gold · SST", "Lavender · EDTA", "Grey · Fluoride" are presentation, not API values). One tube (barcode) may carry several tests **only if they share a `containerType`**.

`GET /phlebotomy/tasks/:id` returns `{ task, tests, specimens }`. A task that is not assigned to you — or does not exist — is **404**, never 403.

---

## 5. Workflow and state machine

### 5.1 Home collection

```
assigned ─accept─► accepted ─depart─► en_route ─arrival─► arrived ─verify-patient─► verified ─consent─► consented
                                                                                                         │ scan ×N (no state change)
consented ─collect─► collected ─start-transit─► in_transit ─handoff─► handed_over ─(lab receives)─► lab_received
```

### 5.2 Ward collection

```
assigned ─accept─► accepted ─bedside─► at_bedside ─verify-patient─► verified ─consent─► consented ─scan ×N─► collect ─► collected ─handoff─► ward_handoff ─(lab receives)─► lab_received
```

### 5.3 Side exits

| From | Command | Result |
|---|---|---|
| `assigned`, `accepted`, `en_route` (home) / `assigned`, `accepted` (ward) | `decline` + reason | back to `unassigned`; the task leaves your worklist (404 afterwards) |
| `verified` | `consent` with `outcome: "refused"` | `refused` (closed) — the patient declined |
| `arrived`/`at_bedside` | `verify-patient` with `result: "mismatch"` | **No state change**; an exception is raised for dispatch; do not collect |
| any pre-collection state | (dispatch cancels or reassigns) | the task disappears from your worklist (404) or its `assignmentVersion` changes (`assignment_changed` on accept) |
| `handed_over` / `ward_handoff` | (lab decides each tube) | `lab_received`, or `rejected_by_lab` → dispatch arranges a redraw as a **new** task |

Final statuses (no commands accepted): `lab_received`, `rejected_by_lab`, `refused`, `cancelled`.

### 5.4 Command table

| Endpoint (POST `/phlebotomy/tasks/:id/…`) | Command name | Mode | Allowed from | Leads to | Body (besides `expectedVersion`) |
|---|---|---|---|---|---|
| `accept` | `accept` | both | `assigned` | `accepted` | `assignmentVersion` |
| `decline` | `decline` | both | `assigned`, `accepted`, (`en_route` home) | `unassigned` | `reason` (≤300) |
| `depart` | `depart` | home | `accepted` | `en_route` | – |
| `arrival` | `arrive` | home | `en_route` | `arrived` | `evidence?` |
| `bedside` | `bedside` | ward | `accepted` | `at_bedside` | `locationConfirmed: true` |
| `verify-patient` | `verify_patient` | both | `arrived` / `at_bedside` | `verified` (match) / unchanged (mismatch) | `method`, `result`, `identifierTypes[]` |
| `consent` | `consent` | both | `verified` | `consented` / `refused` | `outcome`, `consentVersion`, `method`, `language`, `givenBy?` |
| `specimens/scan` | `scan_specimen` | both | `consented` | unchanged | `barcode`, `testIds[]` |
| `collect` | `collect` | both | `consented` | `collected` | ward: `isolationAcknowledged?`, `orderVersion?` |
| `start-transit` | `start_transit` | home | `collected` | `in_transit` | – |
| `handoff` | `handoff` | both | `in_transit` (home) / `collected` (ward) | `handed_over` / `ward_handoff` | `receiverKind`, `receiverRef?` |

`permittedCommands` uses the **command name** column (snake_case), not the URL segment — note `arrive` ↔ `…/arrival`, `verify_patient` ↔ `…/verify-patient`, `scan_specimen` ↔ `…/specimens/scan`, `start_transit` ↔ `…/start-transit`.

**Command response.** Every successful command returns the updated `task` (with the new `version`) and `tests`; `scan` and `verify-patient` add a `result` / `outcome`. A mismatch returns HTTP 200 with `"outcome": "mismatch"` — check it.

---

## 6. Command reference (with captured examples)

### 6.1 Accept

**Accept**

```http
POST /api/phlebotomy/tasks/{taskId}/accept
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0003-85a390d2

{ "expectedVersion": 2, "assignmentVersion": 1 }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "accepted",
    "priority": "routine",
    "scheduledStart": null,
    "scheduledEnd": null,
    "version": 3,
    "assignmentVersion": 1,
    "patient": { "name": "Maya Patel", "age": 29, "gender": "female" },
    "collectedAt": null,
    "closedAt": null,
    "createdAt": "2026-10-07T19:20:17.936Z",
    "permittedCommands": ["decline", "depart"],
    "home": {
      "departedAt": null,
      "arrivedAt": null,
      "address": {
        "city": "Bengaluru",
        "line1": "14 Linden Avenue, Apt 4B",
        "line2": null,
        "state": null,
        "pincode": "560001",
        "landmark": null
      },
      "contactPhone": "9000000002"
    }
  },
  "tests": [
    {
      "id": "f923ca44-6f41-4bbc-b71d-69583836a1b7",
      "code": "LIP",
      "name": "Lipid profile",
      "containerType": "serum",
      "requiredVolumeMl": null,
      "handling": null,
      "priority": "routine",
      "status": "required",
      "specimenId": null
    }
  ]
}
```

_(`tests` shortened to 1 of 3)_

If dispatch reassigned the task between your fetch and your tap you get `409 assignment_changed` (`details.currentAssignmentVersion`) — refetch; the task may no longer be yours.

### 6.2 Depart (home)

**Depart**

```http
POST /api/phlebotomy/tasks/{taskId}/depart
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0005-22b73fc9

{ "expectedVersion": 3 }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "en_route",
    "version": 4,
    "permittedCommands": ["decline", "arrive"],
    "home": { "departedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[3 items]"
}
```

_(`task` abbreviated to the fields that changed)_

### 6.3 Arrival (home) — bounded evidence only

`evidence` is optional policy-dependent proof of arrival. Only three fields are accepted; **raw coordinates are refused by design** (no continuous location trail is stored).

| Field | Type | Values |
|---|---|---|
| `method` | string | `geo`, `manual`, `otp` |
| `withinRadius` | boolean | computed **on the device** against the address |
| `accuracyM` | integer | 0–100000 |

**Arrive with raw coordinates (refused)**

```http
POST /api/phlebotomy/tasks/{taskId}/arrival
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0006-426bd34f

{
  "expectedVersion": 4,
  "evidence": { "method": "geo", "lat": 12.97, "lng": 77.59 }
}
```

```http
HTTP 422

{
  "success": false,
  "code": "validation_failed",
  "message": "evidence has unexpected fields: lat, lng",
  "details": {
    "field": "evidence",
    "extra": ["lat", "lng"]
  }
}
```

**Arrive (with bounded evidence)**

```http
POST /api/phlebotomy/tasks/{taskId}/arrival
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0007-1e281c8d

{
  "expectedVersion": 4,
  "evidence": { "method": "geo", "withinRadius": true, "accuracyM": 18 }
}
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "arrived",
    "version": 5,
    "permittedCommands": ["verify_patient"],
    "home": { "departedAt": "2026-10-07T19:20:17.936Z", "arrivedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[3 items]"
}
```

_(`task` abbreviated to the fields that changed)_

### 6.4 Bedside (ward)

`locationConfirmed` must be `true` (the collector confirmed ward and bed). The server rechecks the admission: a discharged patient or one moved to another bed returns `409 source_changed` and raises an exception — do not collect.

**Ward: at the bedside**

```http
POST /api/phlebotomy/tasks/{taskId}/bedside
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0024-34680509

{ "expectedVersion": 3, "locationConfirmed": true }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "71cfe708-950c-4ae2-93c0-296a0f582c2e",
    "mode": "ward",
    "status": "at_bedside",
    "version": 4,
    "permittedCommands": ["verify_patient"],
    "ward": { "atBedsideAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[1 items]"
}
```

_(`task` abbreviated to the fields that changed)_

### 6.5 Verify patient

Send **which identifier types you checked**, never the identifiers. `two_identifiers` needs at least two different types (e.g. `name`, `dob`); `wristband` needs one.

| Field | Values |
|---|---|
| `method` | `two_identifiers`, `wristband` |
| `result` | `match`, `mismatch` |
| `identifierTypes` | non-empty list of short strings (≤40 chars each) |

A **mismatch is recorded, raises an exception for dispatch, and the task stays where it is** (HTTP 200, `outcome: "mismatch"`). Show "Do not collect. Contact dispatch." You may submit a later `match`.

**Verify patient: mismatch**

```http
POST /api/phlebotomy/tasks/{taskId}/verify-patient
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0008-d7b8cd5c

{
  "expectedVersion": 5,
  "method": "two_identifiers",
  "identifierTypes": ["name", "dob"],
  "result": "mismatch"
}
```

```http
HTTP 200

{
  "success": true,
  "outcome": "mismatch",
  "message": "Mismatch recorded. Do not collect.",
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "arrived",
    "version": 5,
    "permittedCommands": ["verify_patient"],
    "home": { "departedAt": "2026-10-07T19:20:17.936Z", "arrivedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  }
}
```

_(`task` abbreviated to the fields that changed)_

### 6.6 Consent

`outcome: "refused"` closes the task as `refused` and raises an exception for dispatch.

| Field | Values |
|---|---|
| `outcome` | `granted`, `refused` |
| `consentVersion` | string ≤40 (the text version the patient was shown) |
| `method` | `verbal`, `written`, `digital` |
| `language` | string ≤40 |
| `givenBy` | `patient` (default), `guardian`, `witnessed` |

**Consent (granted)**

```http
POST /api/phlebotomy/tasks/{taskId}/consent
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0010-aed178a2

{
  "expectedVersion": 6,
  "outcome": "granted",
  "consentVersion": "v1",
  "method": "verbal",
  "language": "en",
  "givenBy": "patient"
}
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "consented",
    "version": 7,
    "permittedCommands": ["collect", "scan_specimen"],
    "home": { "departedAt": "2026-10-07T19:20:17.936Z", "arrivedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[3 items]"
}
```

_(`task` abbreviated to the fields that changed)_

### 6.7 Scan tubes

Bind a barcode to the tests it contains. Does **not** change status or `version`. Rules: all `testIds` must belong to this task, still be `required`, and share one `containerType`.

**Scan tube 1**

```http
POST /api/phlebotomy/tasks/{taskId}/specimens/scan
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0012-12406386

{
  "expectedVersion": 7,
  "barcode": "ST-20481-1",
  "testIds": ["f923ca44-6f41-4bbc-b71d-69583836a1b7"]
}
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "consented",
    "version": 7,
    "permittedCommands": ["collect", "scan_specimen"],
    "home": { "departedAt": "2026-10-07T19:20:17.936Z", "arrivedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[3 items]",
  "result": { "specimenId": "14e6da13-6a99-4ba2-89a9-ef03e32fee64", "barcode": "ST-20481-1" }
}
```

_(`task` abbreviated to the fields that changed)_

**Scan: barcode already used**

```http
POST /api/phlebotomy/tasks/{taskId}/specimens/scan
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0013-17bda82d

{
  "expectedVersion": 7,
  "barcode": "ST-20481-1",
  "testIds": ["47f4d3ee-a119-48c3-af38-7f9e3fdd34a6"]
}
```

```http
HTTP 409

{
  "success": false,
  "code": "duplicate_barcode",
  "message": "That barcode is already registered",
  "details": { "barcode": "ST-20481-1" }
}
```

`collect` is refused until every test has a tube:

**Collect before every tube is scanned**

```http
POST /api/phlebotomy/tasks/{taskId}/collect
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0011-4a6e469e

{ "expectedVersion": 7 }
```

```http
HTTP 409

{
  "success": false,
  "code": "specimens_incomplete",
  "message": "Every required test needs a scanned specimen first",
  "details": {
    "missing": ["Lipid profile", "CBC", "Fasting glucose"]
  }
}
```

### 6.8 Collect

Atomic: all tubes move to `collected`. For a ward task whose `isolationRequired` is true you must send `isolationAcknowledged: true`; `orderVersion` (optional) guards against the order changing under you (`409 order_changed`). The booking/admission is rechecked here too (`409 source_changed`).

**Ward: collect without the isolation acknowledgement (refused)**

```http
POST /api/phlebotomy/tasks/{taskId}/collect
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0028-6f7df0c1

{ "expectedVersion": 6 }
```

```http
HTTP 422

{
  "success": false,
  "code": "validation_failed",
  "message": "The isolation precautions must be acknowledged",
  "details": { "field": "isolationAcknowledged" }
}
```

**Collect**

```http
POST /api/phlebotomy/tasks/{taskId}/collect
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0017-726b7e70

{ "expectedVersion": 7 }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "collected",
    "version": 8,
    "permittedCommands": ["start_transit"],
    "collectedAt": "2026-10-07T19:20:17.936Z",
    "home": { "departedAt": "2026-10-07T19:20:17.936Z", "arrivedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[3 items]"
}
```

_(`task` abbreviated to the fields that changed)_

### 6.9 Transit and hand-off

Home: `start-transit` then `handoff` with `receiverKind: "lab"`. Ward: `handoff` straight from `collected`, `receiverKind` `lab` or `collection_point`, `receiverRef` (≤80) names the person/place.

**Hand off to the lab**

```http
POST /api/phlebotomy/tasks/{taskId}/handoff
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0019-a6b34f8f

{ "expectedVersion": 9, "receiverKind": "lab", "receiverRef": "Front desk" }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "mode": "home",
    "status": "handed_over",
    "version": 10,
    "permittedCommands": [],
    "collectedAt": "2026-10-07T19:20:17.936Z",
    "home": { "departedAt": "2026-10-07T19:20:17.936Z", "arrivedAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[3 items]"
}
```

_(`task` abbreviated to the fields that changed)_

**Ward: hand off to the nurse station**

```http
POST /api/phlebotomy/tasks/{taskId}/handoff
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0030-486e6f83

{ "expectedVersion": 7, "receiverKind": "collection_point", "receiverRef": "Ward 3 nurse station" }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "71cfe708-950c-4ae2-93c0-296a0f582c2e",
    "mode": "ward",
    "status": "ward_handoff",
    "version": 8,
    "permittedCommands": [],
    "collectedAt": "2026-10-07T19:20:17.936Z",
    "ward": { "isolationAckAt": "2026-10-07T19:20:17.936Z", "atBedsideAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[1 items]"
}
```

_(`task` abbreviated to the fields that changed)_

After hand-off **the lab, not the app, completes the task**: the lab receives (or rejects) each tube. The collector's task stays `handed_over` / `ward_handoff` until then.

---

## 7. End-to-end flows

### 7.1 Home collection — call sequence

| # | Call | `expectedVersion` | New status | New version |
|---|---|---|---|---|
| 1 | `GET /tasks` | – | `assigned` | 2 |
| 2 | `POST …/accept` `{assignmentVersion:1}` | 2 | `accepted` | 3 |
| 3 | `POST …/depart` | 3 | `en_route` | 4 |
| 4 | `POST …/arrival` | 4 | `arrived` | 5 |
| 5 | `POST …/verify-patient` (match) | 5 | `verified` | 6 |
| 6 | `POST …/consent` (granted) | 6 | `consented` | 7 |
| 7–9 | `POST …/specimens/scan` ×3 | 7 | `consented` | 7 (unchanged) |
| 10 | `POST …/collect` | 7 | `collected` | 8 |
| 11 | `POST …/start-transit` | 8 | `in_transit` | 9 |
| 12 | `POST …/handoff` | 9 | `handed_over` | 10 |

(Versions are from the captured run; a new task starts at `version` 1 and is `2` once assigned. **Always use the version in your last response, not a computed one.**)

### 7.2 Ward collection — differences

`bedside` replaces `depart` + `arrival`; there is no `start-transit`; `collect` may need `isolationAcknowledged`; `handoff` goes straight to `ward_handoff`. See the captured ward exchanges in Appendix B.

---

## 8. Reliability: versions, idempotency, offline

### 8.1 Optimistic concurrency

`expectedVersion` must equal the task's current `version`, or the command fails with `409 version_conflict` and **nothing is written**:

**Stale version (another device changed the task)**

```http
POST /api/phlebotomy/tasks/{taskId}/collect
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0016-156d765b

{ "expectedVersion": 3 }
```

```http
HTTP 409

{
  "success": false,
  "code": "version_conflict",
  "message": "The task changed since you loaded it",
  "details": { "currentVersion": 7, "status": "consented" }
}
```

On `version_conflict`: fetch the task (`GET /tasks/:id`), re-evaluate `permittedCommands`, and let the user decide. **Do not silently retry with the new version** — the world changed (another device, a dispatch reassign, a cancel).

### 8.2 Idempotency (safe retries)

* The same `Idempotency-Key` + the same body returns the **stored original response** with `Idempotent-Replayed: true`, and does nothing a second time. Use this for every retry after a timeout or a dropped connection.
* The same key with a **different** body → `422 idempotency_key_reuse`. A retry must therefore be byte-for-byte the same request: persist the body (including `expectedVersion`) with the key when you first send it.
* Keys are scoped to the collector; the same key from two collectors never collides.
* **A replayed response is a snapshot of the past.** Do not overwrite newer local state with it — compare `task.version` and keep the higher one.

**Accept (the same request retried: replay)**

```http
POST /api/phlebotomy/tasks/{taskId}/accept
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0003-85a390d2

{ "expectedVersion": 2, "assignmentVersion": 1 }
```

```http
HTTP 200
idempotent-replayed: true

{
  "success": true,
  "task": {
    "id": "02e8e074-6357-492c-b8ef-972fae915907",
    "home": {
      "address": {
        "city": "Bengaluru",
        "line1": "14 Linden Avenue, Apt 4B",
        "line2": null,
        "state": null,
        "pincode": "560001",
        "landmark": null
      },
      "arrivedAt": null,
      "departedAt": null,
      "contactPhone": "9000000002"
    },
    "mode": "home",
    "status": "accepted",
    "patient": { "age": 29, "name": "Maya Patel", "gender": "female" },
    "version": 3,
    "closedAt": null,
    "priority": "routine",
    "createdAt": "2026-10-07T19:20:17.936Z",
    "collectedAt": null,
    "scheduledEnd": null,
    "scheduledStart": null,
    "assignmentVersion": 1,
    "permittedCommands": ["decline", "depart"]
  },
  "tests": [
    {
      "id": "f923ca44-6f41-4bbc-b71d-69583836a1b7",
      "code": "LIP",
      "name": "Lipid profile",
      "status": "required",
      "handling": null,
      "priority": "routine",
      "specimenId": null,
      "containerType": "serum",
      "requiredVolumeMl": null
    }
  ]
}
```

_(`tests` shortened to 1 of 3)_

### 8.3 Offline queue (recommended design)

Queue **commands**, not state. Each queue item: `{ idempotencyKey, taskId, path, body, expectedVersion?, enqueuedAt }`.

1. Process items **per task, in order** (different tasks may run in parallel).
2. When an item is first sent, fix its `expectedVersion` from the latest known version and persist it with the item; retries reuse it unchanged.
3. On `200`: store the returned `task`/`version`; the next item for that task uses that version.
4. `scan_specimen` does not bump the version — consecutive scans legitimately share one `expectedVersion`.
5. On `409 version_conflict` / `assignment_changed` / `invalid_transition` / `task_closed`: **stop that task's queue**, refetch, mark the remaining items as "needs review" and ask the user. Never drop them silently.
6. On `404 not_found` for a queued task: the task was cancelled/reassigned — surface it, discard the items only after the user acknowledges.
7. Expire stale queued PHI according to the agreed offline policy (open decision; assume ≤24 h) and **wipe the queue on sign-out**.
8. A `5xx` or network error → keep the item, retry with backoff and the **same key**. A `4xx` is a decision, not a retry (except `429`).

### 8.4 Refreshing the worklist (there is no push yet)

* `GET /tasks` on app foreground, on pull-to-refresh, after every successful command, and on a **timer of ≥ 60 s while the app is active** (never in the background without a push channel). Remember the 300 requests / 15 min / IP cap.
* Page with `nextCursor` (opaque). Order is by scheduled start (falling back to creation time), stable across pages.
* Reconcile by `id`: a task absent from a fresh full list has left your worklist (cancelled, reassigned, or closed more than 2 days ago).
* There is **no delta/sync endpoint** yet; a full refetch is the contract.

### 8.5 Clocks

Use `serverTime` (from `/me` and `/tasks`) to compute the device's clock offset. Display and order by server timestamps; do not stamp your own times into requests (the API does not accept client timestamps).

---

## 9. Mapping the prototype to the API — and the gaps

The prototype (`app/page.tsx`) is a single screen driven by local `useState`; nothing in it calls an API. This table says what each element becomes. ✅ supported · ⚠️ partly · ❌ no backend (do not fake it).

| Prototype element | Status | Integration notes |
|---|---|---|
| Header "Good morning, Aisha" | ✅ | `GET /me` → `worker.displayName`. |
| "Today · Tue, Sep 23" / "Next collection" | ✅ | Derive from `GET /tasks`; use `serverTime`. |
| **New assignment** card with Accept / Decline | ✅ | `accept` (needs `assignmentVersion`), `decline` (needs a reason). The "Accept by 09:05" countdown has **no server rule** — there is no acceptance deadline. |
| "Morning home collection **route**" (4 patients, 11.8 km, 09:30–12:15) | ❌ | There is no route/batch entity. The unit is a single task. Group tasks client-side by `scheduledStart`; distance is a client calculation. |
| **AI route plan** / "Optimize my route" | ❌ | No API. Use the device maps SDK/intents against each task's `home.address`. |
| **Special instructions** ("anxious about needles…") | ❌ | No field exists on the task. Needs a product + schema decision (new `instructions` field). |
| **Patient chat** / Message | ❌ | No chat API for collectors. |
| **Call patient** | ⚠️ | `home.contactPhone` appears after acceptance → a `tel:` link. No call logging. |
| Visit notes | ❌ | No notes endpoint. |
| Patient card (name, age, gender, "Home visit") | ✅ | `task.patient`, `task.mode`. `#PT-20481` (patient id) is **not** provided. |
| Address + "Navigate" + distance | ✅/⚠️ | `home.address` (after accept) → open the maps app. Distance is client-side. |
| Time window "09:30 – 10:00" | ⚠️ | `scheduledStart/End` exist but are frequently `null`; booking-derived tasks only carry a day. Handle null. |
| **Arrival proof** (GPS + selfie) | ⚠️ | `arrival` accepts `{method, withinRadius, accuracyM}` only. **Selfie/photo upload does not exist**; raw GPS is rejected (422). Compute `withinRadius` on the device. |
| Workflow step bar: Verify → Consent → Collect → Complete | ⚠️ | The real flow has more steps (§5). Drive the bar from `status`. |
| **Verify identity** screen (full name + **date of birth**) | ⚠️ | The API sends name, age, gender — **not DOB** (minimum-necessary data). Change the screen to "ask the patient their name and date of birth; confirm it matches the name/age shown", then report `identifierTypes: ["name","dob"]` and `result`. If operations require showing DOB, that is a server + privacy decision. |
| "Scan ID or confirm manually" | ❌/⚠️ | No ID-document scan or Aadhaar endpoint. Only the result of the check is recorded. |
| **Consent** checkbox | ⚠️ | `consent` records outcome/version/method/language/given-by. **No signature capture, no witness identity** (open policy decision). The consent text and its `consentVersion` must come from the app until a consent-text API exists. |
| **Collect & label**: scan pre-printed sticker per tube | ✅ | `specimens/scan` with `barcode` + `testIds`. Prototype sticker `ST-20481-1` satisfies the barcode pattern. |
| Tube list ("Gold · SST · 1 tube"…) | ⚠️ | Derive from `tests[].containerType`. Colours/names are presentation. Required **volume** and handling exist in the model but are mostly empty today. |
| **Generate replacement sticker / print** | ❌ | No endpoint (label-replacement exception flow is not built). Today a damaged sticker means asking dispatch. |
| "Confirm all samples collected" | ✅ | `collect` (server refuses until every test has a tube: `specimens_incomplete`). |
| **Add another test on site** | ❌ | Tests are fixed at dispatch. The prototype's own warning ("never add tests without confirmation, price recalculation, consent, ERP approval") is right: route such requests to dispatch. |
| **Collect payment / receipt** | ❌ — by design | Collection never touches payment state (finance boundary). A payment feature needs a separate, finance-owned API and cannot be added to these endpoints. Remove or disable it. |
| **Handoff & QC** (seal, temperature, label match, receiving lab) | ⚠️ | `handoff` records `receiverKind` + `receiverRef` and writes a custody event. **Seal id, temperature and label-match QC are not stored.** |
| "Collection complete · ERP/CRM updated · Synced just now" | ⚠️ | "Complete" for the collector = status `handed_over`/`ward_handoff`. The task is only `lab_received` once the **lab** receives it. "Synced" must mean "the last command returned 200"; the integration outbox has no downstream consumer yet, so do not claim ERP/CRM updates. |
| Notifications bell | ❌ | No push or notification API. Use polling (§8.4). |
| Quick actions: Call / Message / Visit notes | see above | |
| "Privacy & security" panel (encrypted sync, audit trail, no screenshots, auto-logout) | – | These are **app obligations** (§10); the server already keeps an audit trail. |

---

## 10. Security and privacy obligations for the app

The server enforces authorisation, minimum-necessary projection and audit. The app must still:

1. Store tokens only in Keychain/Keystore; never log tokens, request bodies, patient names or addresses.
2. Disable screenshots/screen recording on screens showing patient data; blur in the app switcher.
3. Auto-lock after inactivity; require device unlock (biometric/PIN) to resume; sign out on repeated failures.
4. Keep any offline queue/cache **encrypted at rest** and **wipe it on sign-out**, on `token_revoked`, and on `account_unavailable`.
5. Persist `X-Device-Id` in the secure store (new id on reinstall is fine).
6. Never put patient data in push payloads, analytics events, crash reports or URLs.
7. Pin to the production host; reject user-installed CAs where the platform allows.
8. Do not request location permission unless the arrival-evidence policy requires it; if used, compute `withinRadius` on the device and send only the three evidence fields.
9. Treat `404 not_found` for a task you used to hold as a normal event (reassigned/cancelled), not an error to retry.

---

## 11. Platform notes

* **Native (Expo / React Native, Swift, Kotlin)** — works against the API as documented. Requests with no `Origin` header are accepted.
* **Browser / PWA / Next.js (the prototype's stack)** — two things govern whether a web build can call the API:
  1. **Headers (fixed 2026-10-08).** The CORS `Access-Control-Allow-Headers` list now includes `Idempotency-Key`, `X-Device-Id`, `X-Correlation-Id` and `X-App-Version` (alongside `Content-Type, Authorization, X-Requested-With, Accept, Origin, Cookie`), and `Idempotent-Replayed` is exposed to JavaScript (`server/config/cors.config.js`).
  2. **Origin (needs a deployment setting).** The server only allows origins from an allow-list (production hosts, tenant sub-domains `*.mediqzy.com` / `*.mediczy.in`). Any other origin gets `403 CORS blocked`. To serve a web build from its own host, add that exact origin (scheme + host, no path) to `CORS_ORIGIN` (comma separated) in the production parameters and reload the API. Serving the build from a `*.mediqzy.com` sub-domain needs no change.
  A web build still cannot use a secure token store — prefer native.
* The prototype's analytics (`@vercel/analytics`) must not be included in a build that handles patient data.

---

## 12. Environments and test data

| | |
|---|---|
| Environments | **Production only.** No staging. |
| Test lab / hospital link | A lab and a linked hospital are needed to create bookings/admissions-backed tasks. A task can also be created **manually** (home) by the lab with no link. |
| Creating a collector | Lab portal → **Collection Operations → Collectors → Add collector** (name, email, temporary password ≥10 chars with a letter and a digit, qualification, home/ward). The collector must change the password at first sign-in. |
| Creating work | Lab portal → **Collection Operations → New home/ward collection**, then **Assign collector** on the task. |
| Receiving | The lab portal's task drawer shows handed-over tubes with **Receive** / **Reject** — use it to finish the cycle and to test `lab_received` / `rejected_by_lab`. |
| Cleanup | There is no delete. Cancel test tasks (pre-collection) with a reason; suspend test collectors. Use clearly named test patients. |

Currently **no collectors, partner links or tasks exist in production** — they must be created before the app can show anything but an empty worklist.

---

## 13. Error cookbook (task endpoints)

| HTTP | `code` | Typical cause | App behaviour |
|---|---|---|---|
| 400 | `unknown_command` | Wrong path | Bug — report |
| 403 | `forbidden` / `actor_not_permitted` | Command not allowed for a collector | Bug — report |
| 404 | `not_found` | Task not assigned to you, cancelled, reassigned, or never existed | Remove from list; inform the user |
| 409 | `version_conflict` | Another device/dispatch changed the task | Refetch, let the user re-decide (§8.1) |
| 409 | `assignment_changed` | Task was reassigned before you accepted | Refetch; it may be gone |
| 409 | `invalid_transition` | Command not allowed from the current status (`details.allowedFrom`) | Refetch; fix UI to use `permittedCommands` |
| 409 | `task_closed` | Task already finished/cancelled | Refetch |
| 409 | `specimens_incomplete` | `collect` before every test has a tube (`details.missing`) | Show which tests lack a tube |
| 409 | `duplicate_barcode` | Barcode already used by this lab | "Sticker already used — scan another" |
| 409 | `test_already_scanned` | The test already has a tube | Refresh the test list |
| 409 | `source_changed` | Booking cancelled / patient discharged or moved | Stop; "Contact dispatch" (an exception was raised) |
| 409 | `order_changed` | Ward order changed (`orderVersion`) | Refetch and review |
| 409 | `no_specimens` | Hand-off with nothing to hand over | Refetch |
| 409 | `operation_in_progress` | The same key is being processed | Retry shortly with the same key |
| 422 | `validation_failed` | Bad/missing field (`details.field`) | Fix input; do not retry unchanged |
| 422 | `idempotency_key_reuse` | Same key, different body | Bug — never reuse a key for a different action |
| 429 | – | Rate limit | Back off using `RateLimit-Reset` / `Retry-After` |
| 500 | `internal_error` | Server fault | Retry with the same key and backoff |

---

## 14. Reference client (TypeScript)

A minimal, dependency-free client that implements the rules above. Adapt the storage hooks to the platform secure store.

```ts
type Tokens = { accessToken: string; refreshToken: string };
interface Store { get(): Promise<Tokens | null>; set(t: Tokens): Promise<void>; clear(): Promise<void>; }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

export class PhleboApi {
  private refreshing: Promise<Tokens> | null = null;
  constructor(private cfg: { baseUrl: string; deviceId: string; appVersion: string; store: Store; onSignedOut: () => void }) {}

  private async raw(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string>; auth?: boolean } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Device-Id': this.cfg.deviceId, 'X-App-Version': this.cfg.appVersion, ...opts.headers };
    if (opts.auth !== false) { const t = await this.cfg.store.get(); if (t) headers.Authorization = `Bearer ${t.accessToken}`; }
    const res = await fetch(`${this.cfg.baseUrl}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.code ?? 'error', json.message ?? res.statusText, json.details);
    return { json, replayed: res.headers.get('Idempotent-Replayed') === 'true' };
  }

  /** Refresh single-flight; the new refresh token is persisted BEFORE it is used. */
  private refresh(): Promise<Tokens> {
    this.refreshing ??= (async () => {
      try {
        const cur = await this.cfg.store.get(); if (!cur) throw new ApiError(401, 'unauthenticated', 'Signed out');
        const { json } = await this.raw('POST', '/phlebotomy/auth/refresh', { body: { refreshToken: cur.refreshToken }, auth: false });
        const next = { accessToken: json.accessToken, refreshToken: json.refreshToken };
        await this.cfg.store.set(next); return next;
      } catch (e) { await this.cfg.store.clear(); this.cfg.onSignedOut(); throw e; }
      finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  async request(method: string, path: string, opts: Parameters<PhleboApi['raw']>[2] = {}) {
    try { return await this.raw(method, path, opts); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401 && (e.code === 'token_expired' || e.code === 'invalid_token') && opts.auth !== false) {
        await this.refresh(); return this.raw(method, path, opts);      // exactly one retry
      }
      if (e instanceof ApiError && (e.code === 'token_revoked' || e.code === 'account_unavailable')) { await this.cfg.store.clear(); this.cfg.onSignedOut(); }
      throw e;
    }
  }

  async signIn(email: string, password: string) {
    const { json } = await this.raw('POST', '/phlebotomy/auth/login', { body: { email, password }, auth: false });
    await this.cfg.store.set({ accessToken: json.accessToken, refreshToken: json.refreshToken });
    return { mustChangePassword: !!json.mustChangePassword, worker: json.worker as { uid: string; displayName: string } };
  }

  worklist(cursor?: string, mode?: 'home' | 'ward') {
    const q = new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(mode ? { mode } : {}) }).toString();
    return this.request('GET', `/phlebotomy/tasks${q ? `?${q}` : ''}`).then((r) => r.json);
  }
  task(id: string) { return this.request('GET', `/phlebotomy/tasks/${id}`).then((r) => r.json); }

  /**
   * One task command. `idempotencyKey` and `expectedVersion` MUST be generated once per user action and persisted
   * with the queued item; every retry passes the identical values and body.
   */
  async command(taskId: string, endpoint: string, body: Record<string, unknown>, o: { idempotencyKey: string; expectedVersion: number }) {
    return this.request('POST', `/phlebotomy/tasks/${taskId}/${endpoint}`, {
      body: { expectedVersion: o.expectedVersion, ...body }, headers: { 'Idempotency-Key': o.idempotencyKey },
    });   // → { json: { task, tests, ... }, replayed }
  }
}
```

Usage:

```ts
const key = crypto.randomUUID();                          // once per user action — persist it
const { json, replayed } = await api.command(task.id, 'accept', { assignmentVersion: task.assignmentVersion },
                                              { idempotencyKey: key, expectedVersion: task.version });
if (!replayed) cache.put(json.task);                      // never overwrite newer local state with a replay
```

---

## Appendix A — What the lab and dispatch side does (context)

Collectors only see what dispatch gives them. In the lab portal dispatch creates a task (from a linked hospital's booking, from an admitted patient, or manually), assigns an eligible collector (active, verified, qualification valid, enabled for the mode), may reassign or cancel until collection, and later receives or rejects each tube. A rejected tube produces a **new** linked task (a redraw) for the rejected tests. Exceptions (identity mismatch, refusal, decline, source changed, rejected tube) appear in dispatch's queue.

## Appendix B — Captured ward exchanges

**Ward task detail**

```http
GET /api/phlebotomy/tasks/{taskId}
Authorization: Bearer <accessToken>

```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "71cfe708-950c-4ae2-93c0-296a0f582c2e",
    "mode": "ward",
    "status": "assigned",
    "priority": "stat",
    "scheduledStart": null,
    "scheduledEnd": null,
    "version": 2,
    "assignmentVersion": 1,
    "patient": { "name": "Ravi Menon", "age": 63, "gender": "male" },
    "collectedAt": null,
    "closedAt": null,
    "createdAt": "2026-10-07T19:20:17.936Z",
    "permittedCommands": ["accept", "decline"],
    "ward": {
      "facilityUid": "HLH9CT",
      "wardName": "General Ward A",
      "bedLabel": "GEN-11",
      "roundLabel": null,
      "isolationRequired": true,
      "isolationAckAt": null,
      "atBedsideAt": null
    }
  },
  "tests": [
    {
      "id": "b1b9bc17-0dec-4837-bc3c-cd283e2eeb35",
      "code": "TRP",
      "name": "Troponin",
      "containerType": "serum",
      "requiredVolumeMl": null,
      "handling": null,
      "priority": "routine",
      "status": "required",
      "specimenId": null
    }
  ],
  "specimens": []
}
```

**Ward: accept**

```http
POST /api/phlebotomy/tasks/{taskId}/accept
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0022-09bd3f52

{ "expectedVersion": 2, "assignmentVersion": 1 }
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "71cfe708-950c-4ae2-93c0-296a0f582c2e",
    "mode": "ward",
    "status": "accepted",
    "version": 3,
    "permittedCommands": ["decline", "bedside"],
    "…": "unchanged fields omitted"
  },
  "tests": "[1 items]"
}
```

_(`task` abbreviated to the fields that changed)_

**Ward: depart is a home step (refused)**

```http
POST /api/phlebotomy/tasks/{taskId}/depart
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0023-002945f5

{ "expectedVersion": 3 }
```

```http
HTTP 409

{
  "success": false,
  "code": "invalid_transition",
  "message": "\"depart\" is not allowed on a ward task that is accepted",
  "details": {
    "mode": "ward",
    "status": "accepted",
    "command": "depart",
    "allowedFrom": []
  }
}
```

**Ward: verify (wristband + name)**

```http
POST /api/phlebotomy/tasks/{taskId}/verify-patient
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0025-bccf2b35

{
  "expectedVersion": 4,
  "method": "wristband",
  "identifierTypes": ["wristband", "name"],
  "result": "match"
}
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "71cfe708-950c-4ae2-93c0-296a0f582c2e",
    "mode": "ward",
    "status": "verified",
    "version": 5,
    "permittedCommands": ["consent"],
    "ward": { "atBedsideAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[1 items]"
}
```

_(`task` abbreviated to the fields that changed)_

**Ward: scan**

```http
POST /api/phlebotomy/tasks/{taskId}/specimens/scan
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0027-0af26b05

{
  "expectedVersion": 6,
  "barcode": "WD-77120-1",
  "testIds": ["b1b9bc17-0dec-4837-bc3c-cd283e2eeb35"]
}
```

```http
HTTP 200

{
  "success": true,
  "task": {
    "id": "71cfe708-950c-4ae2-93c0-296a0f582c2e",
    "mode": "ward",
    "status": "consented",
    "version": 6,
    "permittedCommands": ["collect", "scan_specimen"],
    "ward": { "atBedsideAt": "2026-10-07T19:20:17.936Z" },
    "…": "unchanged fields omitted"
  },
  "tests": "[1 items]",
  "result": { "specimenId": "8698c4bc-50e9-498c-92f9-140b94e2c86f", "barcode": "WD-77120-1" }
}
```

_(`task` abbreviated to the fields that changed)_

## Appendix C — Other captured failures

**Collect too early (invalid transition)**

```http
POST /api/phlebotomy/tasks/{taskId}/collect
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001
Idempotency-Key: op-0004-c113efd9

{ "expectedVersion": 3 }
```

```http
HTTP 409

{
  "success": false,
  "code": "invalid_transition",
  "message": "\"collect\" is not allowed on a home task that is accepted",
  "details": {
    "mode": "home",
    "status": "accepted",
    "command": "collect",
    "allowedFrom": ["consented"]
  }
}
```

**No token**

```http
GET /api/phlebotomy/tasks

```

```http
HTTP 401

{ "success": false, "code": "unauthenticated", "message": "No token provided" }
```

**A lab token on the phlebotomist API**

```http
GET /api/phlebotomy/tasks
Authorization: Bearer <accessToken>

```

```http
HTTP 403

{ "success": false, "code": "wrong_account_type", "message": "Not a phlebotomist account" }
```

**Missing Idempotency-Key**

```http
POST /api/phlebotomy/tasks/{taskId}/accept
Authorization: Bearer <accessToken>
X-Device-Id: device-3f9c1a7e-0001
X-App-Version: 1.0.0
X-Correlation-Id: corr-0001

{ "expectedVersion": 1, "assignmentVersion": 1 }
```

```http
HTTP 422

{
  "success": false,
  "code": "validation_failed",
  "message": "Idempotency-Key header is required",
  "details": { "header": "Idempotency-Key" }
}
```

**A task that is not yours (or does not exist)**

```http
GET /api/phlebotomy/tasks/2315fc7e-28b9-4317-b440-f8607fd66f71
Authorization: Bearer <accessToken>

```

```http
HTTP 404

{ "success": false, "code": "not_found", "message": "Task not found" }
```

**Suspended collector (the very next request)**

```http
GET /api/phlebotomy/tasks
Authorization: Bearer <accessToken>

```

```http
HTTP 401

{ "success": false, "code": "token_revoked", "message": "Session has been revoked" }
```

## Appendix D — Changelog

| Date | Change |
|---|---|
| 2026-10-07 | First release. Endpoints as in the OpenAPI contract; examples captured from the live service. |

## Appendix E — Open items that affect the app

These are decisions or work not yet done (see the ADR §4/§6): consent text/witness policy; arrival-evidence policy (mandatory or optional, photo or not); tube/volume catalogue and enforcement; offline retention period; push/SMS notification channel and SLA; adding the web build's origin to `CORS_ORIGIN` (the header change is done); collector-visible instructions/notes; label-replacement flow; QC fields at hand-off; a staging environment; a delta-sync endpoint.
