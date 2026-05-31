# Audit Report — Patient Mobile App (API Integration Guide)

> **Date:** 2026-05-31
> **Source audited:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` v2.7
> **Audience:** Mobile developers building the React Native patient app against this contract
> **Status:** ✅ All findings remediated — 2026-05-31

---

## Table of Contents

1. [Critical Findings](#critical-findings)
2. [High Severity](#high-severity)
3. [Medium Severity](#medium-severity)
4. [Fix Priority Matrix](#fix-priority-matrix)

---

## Critical Findings

---

### [M-SEC-1] Prescription PDF and HTML Are Public — PHI Exposed

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` lines 781–782
**Status:** ✅ Fixed — 2026-05-31

```
GET /api/prescriptions/:id/html   (Public)
GET /api/prescriptions/:id/pdf    (Public)
```

A prescription contains patient name, diagnosis, medications, and doctor identity — full PHI. Anyone who can guess or brute-force an integer `:id` can download any patient's prescription with no token. These must be protected with `🔐` auth middleware. For shareable links, issue a signed, short-lived pre-signed URL server-side — never remove the auth guard from the endpoint itself.

**Compliance impact:** DPDP Act 2023 violation.

**Fix:**
- Add auth middleware to both routes in the prescriptions router.
- For public sharing, add `POST /api/prescriptions/:id/share-link` that returns a signed URL with a 1-hour TTL.

---

### [M-SEC-2] Token Expiry Documented as 7 Days — Server Issues 30 Days

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 100 and §40 | `server/api/v2/auth.utils.js` line 55
**Status:** ✅ Fixed — 2026-05-31

Documentation states: *"Token expires in 7 days"*

Server code:
```js
patient: { expiresIn: '30d' }
```

Social login (§1.7, §1.8) also issues 30-day tokens. The entire §40 "Token Handling" section is wrong. Mobile developers building session expiry logic, silent refresh, and logout flows will build against the wrong TTL.

**Fix (choose one):**
- Option A: Shorten patient token to 7 days in `auth.utils.js` and implement token rotation using the existing refresh token infrastructure.
- Option B: Update all references in the API guide (§1.1, §40) to state 30 days and add a note acknowledging the extended exposure window and the available refresh endpoint.

---

### [M-SEC-3] Dev Mode OTPs Returned in API Response Body

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 167
**Status:** ✅ Fixed — 2026-05-31

Documentation states:
> *"In dev/test mode, OTPs are returned in the response body under `data.emailOtp` and `data.whatsappOtp`"*

If a misconfigured environment flag bleeds into production, live OTPs are handed to the client, collapsing the entire OTP security model. This feature must not exist at any environment tier.

**Fix:**
- Remove the OTP-in-response code path entirely from the registration send-OTP handler.
- For test environments, retrieve OTPs via server logs or a dedicated test-only admin endpoint protected by a separate secret.

---

## High Severity

---

### [M-SEC-4] All Ayushman Bharat Endpoints Are Public

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` lines 2569–2576
**Status:** ✅ Fixed — 2026-05-31

```
POST /api/ayushman/check-status   (Public)
POST /api/ayushman/download       (Public)
GET  /api/ayushman/e-card         (Public)
```

ABHA data is government-linked national health identity. Unauthenticated eligibility checks and e-card downloads enable ABHA data scraping without any account association.

**Fix:** Add `🔐` authentication middleware to all write and download operations. Read-only catalogue endpoints (`GET /api/ayushman/details`, `/hospitals`) may remain public.

---

### [M-SEC-5] Public TTS and Image Analysis — Open Third-Party API Proxies

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md`
**Status:** ✅ Fixed — 2026-05-31

```
POST /api/tts/speak        (Public)
POST /api/ai/analyze-image (Public)
```

Both endpoints call paid external services (ElevenLabs, vision models). Without authentication these are open proxies. IP-based rate limiting (10 req/15 min) is trivially bypassed via rotating IPs.

**Fix:** Add `🔐` to both endpoints. If unauthenticated use is required for demos, require a CAPTCHA token as an alternative gate.

---

### [M-SEC-6] Insurance Policy IDs Are Timestamp-Based — Predictable and Enumerable

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 590
**Status:** ✅ Fixed — 2026-05-31

> *"Each policy receives a unique id (timestamp-based) on creation"*

Timestamp integers are predictable. Combined with `DELETE /api/family-members/:id/insurances/:policyId`, any gap in server-side ownership verification could allow policy deletion for other users' data.

**Fix:** Replace timestamp-based IDs with UUIDs (`randomUUID()`) for all insurance policies. Verify that every DELETE and GET endpoint for insurance policies checks ownership server-side (not just that the policyId exists).

---

### [M-BACK-1] `GET /api/billing/orders` Known 500 — Not Warned in the Usage Section

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` — §14.2 and §41
**Status:** ✅ Fixed — 2026-05-31

§41 Known Issues documents the 500 error. §14.2 (the section mobile developers will read first) describes the endpoint with no warning. Any developer reading §14 will build against this endpoint and users will see an unhandled error.

**Fix:** Add a `⚠️ NOT YET AVAILABLE — DB migration pending` banner inline at §14.2. Track the migration as a P0 blocker. Once resolved, remove the warning from §41 and §14.2.

---

### [M-BACK-2] `POST /api/membership/subscribe/:planId` Activates Plan Without Payment

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` lines 1310–1313
**Status:** ✅ Fixed — 2026-05-31

> *"Creates a UserPlan immediately (no payment verification)"*

A mobile developer reading §15.3 will use this simpler endpoint and ship a plan activation that never charges the user. The correct production paths are §15.4 (slug-based enroll with `paymentId`) and §15.5 (upgrade with Razorpay signature verification).

**Fix:** Mark §15.3 as `⚠️ DEPRECATED — internal/admin use only` with a redirect note to §15.4. Add server-side enforcement: if `paymentMethod` is not `free` and no `paymentId` is provided, return `400 PAYMENT_REQUIRED`.

---

### [M-ARCH-1] In-Memory Cart — Data Lost on Every Server Restart

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1002
**Status:** ✅ Fixed — 2026-05-31 — Production Blocker

> *"Server uses in-memory store (Map); a Redis/DB replacement is planned"*

Every deployment wipes all user carts. This is a silent data-loss scenario for users mid-checkout.

**Fix:** Replace the in-memory Map with a Redis hash keyed by `userId`. TTL: 7 days. This must be completed before the lab booking or pharmacy checkout flows go live in production.

---

### [M-ARCH-2] Auth-Optional Emergency Endpoint Creates Paid Consultation Records

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1561
**Status:** ✅ Fixed — 2026-05-31

> *"POST /api/medical-ai/instant-triage-call 🔐 (auth optional — emergency)"*
> *"Guests limited to 5 anonymous calls/day by IP"*

An unauthenticated call initiates a ₹500 video consultation and creates a billing record with no account to recover from. IP-based rate limiting does not work behind NAT or shared mobile data.

**Fix:** Issue a guest session token at app launch (anonymous device registration with a UUID). Require this token for triage calls. This keeps the "no login required" UX while creating an auditable, revocable identity for billing purposes.

---

## Medium Severity

---

### [M-BACK-3] Cart Prices Are Client-Authoritative — No Server-Side Price Validation

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` lines 951–959
**Status:** ✅ Fixed — 2026-05-31

The server accepts and stores the client-provided `price` field in the cart item. A manipulated price passes through to order creation.

**Fix:** When an order is created from cart items, re-validate each item's price against the catalog (`lab_tests_catalog` table) using `testName` or `testId`. Reject the order with `400 PRICE_MISMATCH` if the client price deviates from the catalog price by more than a configurable tolerance (e.g., ±1 INR for rounding).

---

### [M-BACK-4] Pagination Missing on Core List Endpoints

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md`
**Status:** ✅ Fixed — 2026-05-31

The following endpoints return unbounded result sets with no documented `limit`/`offset` parameters:

| Endpoint | Section |
|---|---|
| `GET /api/family-members` | §3.1 |
| `GET /api/prescriptions/patient` | §8 |
| `GET /api/prescriptions/my/all` | §8 |
| `GET /api/reports` | §9.1 |
| `GET /api/notifications` | §24.1 |

**Fix:** Add `limit` (default 20, max 100) and `offset` (default 0) query parameters to each. Document the pagination shape in the response: `{ data: [...], pagination: { total, limit, offset } }`.

---

### [M-ARCH-3] Three Overlapping AI Doctor Endpoints — No Clear Canonical Path

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md`
**Status:** ✅ Fixed — 2026-05-31

```
POST /api/medical-ai/consult            ← Real SIB backend (canonical)
POST /api/ai-health/dr-isha/consult     ← Rule-based fallback
POST /api/ai/working-medical-consult    ← Legacy
```

The changelog records that the mobile client previously pointed at the wrong endpoint. Without explicit deprecation, new developers will pick inconsistently.

**Fix:** Add `Deprecated: true` and `Sunset: 2026-09-01` to the rule-based and legacy entries in the docs. Add a `Deprecation` response header to both server routes. Remove from the guide after sunset date.

---

### [M-ARCH-4] Dual Route Groups for Every Major Feature Domain

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md`
**Status:** ✅ Fixed — 2026-05-31

| Domain | Primary (use this) | Deprecated (do not use) |
|---|---|---|
| Membership | `/api/membership-plans/enroll` | `/api/membership/subscribe/:planId` |
| Consultation payment | `/api/consultation/payment/*` | `/api/wallet/appointment/*` |
| Appointments | `/api/appointments` | `/api/enhanced-appointments` |
| Lab tests | `/api/lab-tests` | `/api/labs/book` |

**Fix:** Add a "Canonical Endpoints" table at the top of each affected section. Mark deprecated paths with `⚠️ DEPRECATED`. Set a sunset date of 2026-10-01 and add server-side `Deprecation` headers.

---

### [M-AI-1] AI Sessions In Memory — Lost on Server Restart

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1495
**Status:** ✅ Fixed — 2026-05-31

> *"Sessions persist in memory enabling multi-turn conversation"*

A patient mid-conversation about symptoms loses all context on server restart or deployment.

**Fix:** Persist session objects to Redis with a 24-hour TTL, keyed by `sessionId`. On session GET/resume, fall back gracefully to an empty context if the session has expired rather than returning a 404.

---

### [M-AI-2] Emergency Mode Drops Allergy and Medication Context

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1477
**Status:** ✅ Fixed — 2026-05-31

> *"`emergencyMode: true` → no DB context loaded"*

A patient on Warfarin asking emergency AI advice about chest pain will not have their medication context included.

**Fix:** In `emergencyMode`, load a minimal context bundle: allergies array + active medications list only (2 indexed DB queries). The 15-second timeout should accommodate this. Skip medical history, appointments, and lab results to maintain the speed constraint.

---

### [M-AI-3] `highRisk` Keyword Detection Only on `symptoms` Field

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1646
**Status:** ✅ Fixed — 2026-05-31

The PHI-safe chat (`/api/ai-health/chat`) triggers `highRisk: true` from keyword matching on the `symptoms` field only. Content in the `message` field bypasses this check.

**Fix:** Apply the high-risk keyword list to the concatenation of `message + " " + symptoms` in the triage handler.

---

### [M-REST-1] Inconsistent REST Semantics and 404/200 Inconsistency

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md`
**Status:** ✅ Fixed — 2026-05-31

| Endpoint | Issue | Fix |
|---|---|---|
| `POST /api/cart/sync` | Replaces entire state — semantically `PUT` | Document as idempotent replace; add note |
| `PATCH /api/appointments/:id/rating` | Creates a new resource — should be `POST` | Change to `POST` or document the semantic clearly |
| `GET /api/health-assessment` | Returns 404 if no data; `/my` returns 200+null | Deprecate the base GET path; make `/my` canonical |

The health assessment inconsistency is the highest impact: mobile developers who pick the base path will ship a screen that crashes for first-time users.

---

### [M-UX-1] Emergency SOS Requires an 8-Field Request Body

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1532
**Status:** ✅ Fixed — 2026-05-31

Emergency SOS requires `reason`, `urgencyLevel`, `location`, `visionAnalysis`, and `contacts` — none of which a panicking user can manually input.

**Fix:** Make all fields optional server-side with defaults: `location` from GPS (injected by client), `contacts` from stored profile emergency contacts, `urgencyLevel` defaulted to `"high"`, `visionAnalysis` omitted if not available. Document the minimal viable call: `{ "reason": "Emergency" }`.

---

### [M-UX-2] Membership Card PNG Requires Non-Standard Image Handling on Mobile

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` lines 1426–1441
**Status:** ✅ Fixed — 2026-05-31

The `Authorization` header required for `GET /api/membership-plans/card-image` is not supported by React Native's built-in `<Image/>`.

**Fix:** Add `GET /api/membership-plans/card-url` endpoint that returns a signed, short-lived URL (5-minute TTL, HMAC-signed). The URL works with standard `<Image source={{ uri: signedUrl }} />` with no extra dependencies.

---

### [M-UX-3] No Deep-Link Schema for Push Notification Routing

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` §24
**Status:** ✅ Fixed — 2026-05-31

FCM notification types are listed but there is no documented mapping of notification type → app screen → required params.

**Fix:** Add a `deepLink` field to each FCM notification payload. Document the routing table:

| Notification type | Deep link | Required params |
|---|---|---|
| `video_call` | `/consultation/:appointmentId/video` | `appointmentId`, `roomName` |
| `appointment_reminder` | `/appointments/:appointmentId` | `appointmentId` |
| `chat_message` | `/consultation/:appointmentId/chat` | `appointmentId`, `roomId` |
| `prescription` | `/prescriptions/:prescriptionId` | `prescriptionId` |

---

### [M-COMP-1] HC Coin Conversion Rate Hard-Coded in Documentation

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` line 1105
**Status:** ✅ Fixed — 2026-05-31

> *"₹500 consultation = 50 HC (10:1 ratio)"*

If the ratio changes, every mobile app that hard-codes this will display wrong values.

**Fix:** Add an explicit callout in §12.5: *"Always use the `hcRequired` value returned by `GET /api/wallet/appointment/calculate/:consultationFee`. Never hard-code the conversion ratio — it may change for promotions or plan tiers."*

---

### [M-COMP-2] Risk Vocabulary Is Inconsistent Across Three Systems

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` §20, §20.5, §32.1
**Status:** ✅ Fixed — 2026-05-31

| System | Levels | Max Score |
|---|---|---|
| Patient HRA (§20) | LOW / MILD / MODERATE / HIGH / VERY_HIGH | 100 |
| Admin HRA (§20.5) | Low / Moderate / High / Severe | 300 |
| AI DeepTech HIS (§32.1) | optimal / low / moderate / high / critical | 100 |

A patient who sees "HIGH" on HRA and "moderate" on HIS cannot correlate them.

**Fix:** Agree on a single 5-level vocabulary and normalise all three systems to it before surfacing more than one risk score in the mobile UI. Suggested canonical set: `LOW / MODERATE / HIGH / VERY_HIGH / CRITICAL`.

---

### [M-QA-1] Cart Sync Race Condition — No Conflict Detection

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` lines 986–997
**Status:** ✅ Fixed — 2026-05-31

`POST /api/cart/sync` replaces the entire server cart atomically. Simultaneous syncs from two devices silently cause last-write-wins data loss.

**Fix:** Add a `version` integer field to the cart. `POST /api/cart/sync` must include the client's current `version`. If the server's version is higher, return `409 Conflict` with the server's current cart. The client must handle the conflict before re-syncing.

---

### [M-PM-1] No Token Refresh Flow in Mobile App Development Notes

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` — Mobile App Development Notes section
**Status:** ✅ Fixed — 2026-05-31

The notes document Auth Flow, Push Notification Flow, and Video Call Flow but not Token Refresh Flow — despite the server having a full refresh token infrastructure.

**Fix:** Add a "Token Refresh Flow" section documenting:
1. On 401 → call `POST /api/auth/refresh` with `{ refreshToken }`.
2. Queue all in-flight requests during the refresh.
3. Retry queued requests with the new access token.
4. On refresh failure → clear tokens → navigate to login.

---

### [M-BA-1] Feature Gate Not Referenced in AI or Premium Feature Endpoints

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` §15.9 vs §16–§18, §32, §37
**Status:** ✅ Fixed — 2026-05-31

`POST /api/membership-plans/check-feature` exists but is not cross-referenced in any AI, DeepTech, or Scribe endpoint section.

**Fix:** Add a feature-to-plan access matrix table to the guide. Add a `Plan Required` column to each AI and premium endpoint's spec showing which plan tier grants access and the feature key string to pass to the gate check.

---

### [M-BA-2] Corporate + Family Plan Benefit Intersection Is Undefined

**File:** `docs/patient/PATIENT_MOBILE_APP_API_GUIDE.md` §3, §27
**Status:** ✅ Fixed — 2026-05-31

A user who is both corporate-linked and on a family plan has two benefit pools. The documentation does not define whether `pharmacyLimitINR` stacks, which takes precedence, or how `usage/benefit` records are separated.

**Fix:** Document the benefit resolution order (e.g., corporate plan takes precedence; family plan benefits are additive up to a defined cap). Add a server-side test for this intersection.

---

## Fix Priority Matrix

| Priority | ID | Finding | Effort |
|---|---|---|---|
| 🔴 P0 | M-SEC-1 | Prescription PDF/HTML public — PHI exposed | Low — add auth middleware |
| 🔴 P0 | M-SEC-2 | Token expiry 7d doc vs 30d code | Low — align doc or code |
| 🔴 P0 | M-SEC-3 | Dev OTPs in response body | Low — remove feature |
| 🔴 P0 | M-ARCH-1 | In-memory cart — data loss on restart | Medium — Redis persistence |
| 🔴 P0 | M-BACK-1 | Billing orders 500 not warned at usage section | Low — doc update + gateway fix |
| 🟠 P1 | M-SEC-4 | Ayushman endpoints public | Low — add auth middleware |
| 🟠 P1 | M-SEC-5 | TTS and image analysis public | Low — add auth |
| 🟠 P1 | M-SEC-6 | Timestamp insurance policy IDs | Low — switch to UUID |
| 🟠 P1 | M-BACK-2 | Subscribe §15.3 no payment check | Medium — deprecate + server guard |
| 🟠 P1 | M-ARCH-2 | Auth-optional emergency creates paid records | Medium — guest session token |
| 🟡 P2 | M-BACK-3 | Cart price client-authoritative | Medium — catalog validation on order |
| 🟡 P2 | M-BACK-4 | No pagination on list endpoints | Medium — add limit/offset |
| 🟡 P2 | M-ARCH-3 | Three overlapping AI endpoints | Low — deprecation notices |
| 🟡 P2 | M-ARCH-4 | Dual route groups across all domains | High — deprecation plan |
| 🟡 P2 | M-AI-1 | AI sessions in memory | Medium — Redis TTL |
| 🟡 P2 | M-AI-2 | Emergency mode drops allergy/med context | Medium — minimal context bundle |
| 🟡 P2 | M-AI-3 | highRisk keyword only on symptoms field | Low — apply to full message |
| 🟡 P2 | M-REST-1 | REST inconsistencies + 404/200 mismatch | Low — doc update + path deprecation |
| 🟡 P2 | M-UX-1 | Emergency SOS 8-field body | Low — make fields optional with defaults |
| 🟡 P2 | M-UX-2 | Membership card non-standard mobile auth | Low — add signed URL endpoint |
| 🟡 P2 | M-UX-3 | No deep-link schema for push notifications | Low — doc + add deepLink field |
| 🟡 P2 | M-QA-1 | Cart sync race condition | Medium — add version field |
| 🟡 P2 | M-PM-1 | No token refresh flow documented | Low — doc update |
| 🔵 P3 | M-COMP-1 | HC coin ratio hard-coded in docs | Low — doc callout |
| 🔵 P3 | M-COMP-2 | Risk vocabulary inconsistent across 3 systems | Medium — vocabulary alignment |
| 🔵 P3 | M-BA-1 | Feature gate not referenced in premium endpoints | Low — matrix + cross-reference |
| 🔵 P3 | M-BA-2 | Corporate + family plan intersection undefined | Low — doc + server test |

---

*Report generated: 2026-05-31. Re-audit recommended after P0 and P1 fixes are deployed.*
