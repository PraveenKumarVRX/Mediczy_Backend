# Phlebotomy app feasibility micro-audit

**Audit date:** 7 October 2026 (Asia/Kolkata)  
**Archive:** `/home/ubuntu/Mediczy/phlebotomy-app-development.zip`  
**Archive contents:** 27 files, approximately 163 KB, dated 23 September 2026  
**Decision:** **Conceptually feasible; the supplied archive is a UI prototype, not a deployable phlebotomist mobile application.**

The first release is assessed for both home collection and hospital/ward collection, as requested. The existing backend has a useful home-collection foundation. The supplied archive demonstrates a good workflow concept, but it is not connected to that backend and has no native-device implementation. A controlled pilot is feasible after the security, specimen, identity and transaction work below.

**Build plan:** [Lab module phlebotomy requirements availability and implementation plan](./LAB_MODULE_PHLEBOTOMY_REQUIREMENTS_AVAILABILITY_AND_IMPLEMENTATION_PLAN_2026-10-07.md) converts these findings into a requirement matrix, target contracts/data model, work packages and release gates.

## 1. What is in the archive

The archive contains a small Next.js 16 / React 19 application:

| Area | Evidence | Finding |
|---|---|---|
| Runtime | `package.json` | Next.js web app; no React Native, Expo, Android, iOS or native build configuration |
| Main screen | `app/page.tsx` | One static Carepath-style collection screen with home-visit content |
| State | `app/page.tsx:39–51` | `useState` controls assignment, verification, consent, labels, route, proof, payment and handoff |
| API/network | Entire archive | No `fetch`, Axios, API base URL, auth client, token handling, websocket or sync client found |
| Identity | `app/page.tsx:73–74, 150–152` | Collector and patient names/identifiers are hard-coded (`Aisha`, `Maya Patel`, `PT-20481`) |
| Collection proof | `app/page.tsx:100` | GPS/selfie button only changes local state; no camera/location permission or capture implementation |
| Labels | `app/page.tsx:165–168` | “Scan” buttons only toggle booleans; displayed sticker IDs are synthetic text |
| Handoff | `app/page.tsx:102` | QC/handoff button only toggles local state; no specimen, temperature, receiver or signature record |
| Offline | `app/page.tsx:106, 171` | Copy mentions an offline-safe queue/sync, but no queue or persistence implementation exists |
| Ward workflow | Entire archive | No encounter, admission, ward, bed, nurse handoff or hospital collection route |

This is a valuable interaction prototype. It must not be presented to operations as a working mobile app or as evidence that samples were collected, consented, paid or synchronized.

## 2. Existing Mediczy backend that can be reused

The repository already contains an API v1 home-collection workflow:

| Capability | Existing implementation | Reuse assessment |
|---|---|---|
| Booking and home-collection job | `server/services/api-v1/LabsService.js:createHomeCollectionJob` | Reusable after command idempotency and transaction hardening |
| Tenant-scoped job list/detail | `listHomeCollectionJobs`, `getHomeCollectionJob` | Reusable for lab operations; needs collector-specific authorization |
| Assignment | `assignPhlebotomist` | Reusable after replacing free-form identity with an assigned staff principal |
| Lifecycle | `unassigned → assigned → en_route → arrived → collected → in_transit → handed_over` | Good starting state machine; needs conditional writes, actor rules and specimen checks |
| Event timeline | `api_lab_home_collection_events` and `listHomeCollectionEvents` | Reusable as an operational timeline; not yet a complete specimen chain of custody |
| Patient booking request | `/api/mobile/wellness/lab/request` | Separate `wellness_lab_requests` source; needs a durable bridge to API v1 bookings/jobs |
| Hospital/ward lab order | `/api/lab/orders` and `lab_orders` | Reusable order source; needs collection-task and specimen entities for phlebotomy |
| Existing lab portal | `/api/lab/*`, `authLab` | Lab staff portal authentication exists, but it is not a phlebotomist mobile identity contract |
| Web lab operations | `client/src/pages/lab/LabModulePages.tsx` | Useful operational reference; some sample UI is local portal state and not authoritative specimen data |
| Database workflow | `server/migrations/20260528_create_api_lab_home_collection_workflow.sql` | Provides jobs/events, but no tube/specimen/ward/collector assignment tables |

The backend is therefore **partially ready for a home-collection pilot** and **not yet ready for a complete hospital/ward phlebotomy workflow**.

## 3. Feasibility verdict by scope

| Scope | Feasibility | Why |
|---|---|---|
| Clickable workflow demonstration | High | Archive already demonstrates the intended four-step interaction |
| Responsive web pilot over existing lab APIs | Medium | Backend jobs/events exist; collector identity, authorization, specimen records and API client are required |
| Native Android/iOS app for home collection | Medium | Technically straightforward after adapting the UI to React Native/Expo and adding native capabilities; it is not present in the archive |
| Native Android/iOS app for ward collection | Medium-low | Requires encounter/bed/task assignment, barcode/specimen custody and hospital connectivity rules not represented in the current app/backend pair |
| Both home and ward in one first production release | Feasible only as a gated pilot | Share platform primitives, but release separate workflow policies and test matrices; do not treat home visit proof as ward custody proof |
| Offline clinical operation | Not feasible from archive today | Requires encrypted local queue, conflict/replay protocol, assignment revocation and server idempotency |

Recommended first release: one authenticated phlebotomist app with two modes—**Home visits** and **Ward rounds**—sharing identity, assigned-worklist, barcode/specimen, consent, status, notes and handoff primitives. Route-specific fields and authorization must remain separate.

## 4. Critical gaps found in the supplied app

### P0 — It has no trusted identity or backend integration

The app hard-codes both collector and patient information. There is no login, token, tenant membership, staff status check, assignment acceptance API or server-side actor context. A button can mark a visit complete without a server record.

**Fix:** build a phlebotomist principal mapped to a platform subject and organization/lab/hospital memberships. Issue the canonical mobile access/refresh contract from the identity remediation plan. Add `GET /api/mobile/v1/phlebotomy/me`, assigned worklist and assignment accept/decline commands. Every mutation derives `collector_id` from the verified token; the client cannot choose it.

### P0 — Collection and consent are claims, not evidence

“Identity verified,” “consent recorded,” “samples recorded,” “payment collected,” “QC passed” and “synced just now” are local UI labels. They have no timestamps, actor, method, consent version, patient confirmation, specimen ID or server event.

**Fix:** make each transition a server command with an operation ID, actor, timestamp and audit/outbox event. Store consent as a versioned record with method and scope. Separate payment authorization from collection completion; the collector must not be able to mark a financial transaction paid without the payment service result. Do not allow `collected` until required patient identifiers and required specimen links pass validation.

### P0 — Specimen/barcode controls are simulated and incomplete

The prototype imports `QrCode`/`ScanLine`, but has no camera integration. It toggles a Boolean and displays `ST-20481-1` style text. It cannot verify a label belongs to the order, prevent reuse, bind tube type/quantity, or reject a duplicate scan.

**Fix:** add an order-backed specimen model: accession/order ID, specimen ID, barcode value, tube/container type, required quantity, collector, collection time, condition, label verification and lifecycle. Use a real camera scanner, server-side barcode uniqueness/order binding, and explicit replacement-label approval. Store a per-tube event or normalized specimen table; JSON proof alone is insufficient for LIS reconciliation.

### P0 — Home and ward workflows are conflated by the design

The archive is entirely a home visit: route distance, address, arrival GPS/selfie, patient chat and home payment. A ward collection needs hospital, encounter/admission, ward/bed, assigned round/task, patient wristband/identifiers, isolation precautions, collection priority and nurse/lab handoff. It must not inherit home GPS/selfie semantics.

**Fix:** define separate command policies and projections:

```text
Home: assigned → accepted → en_route → arrived → verified → consented → collected → in_transit → handed_over
Ward: assigned → accepted → at_bedside → verified → consented → collected → ward_handoff → lab_received
```

Both share verified identity, specimen and audit primitives. Home adds route/address/arrival proof; ward adds encounter/bed/collector round and receiving staff. A domain policy rejects a home-only field on ward commands and vice versa.

### P1 — Offline and device capabilities are absent

There is no persistent operation queue, network detection, retry, conflict state, camera, geolocation, notification, secure storage or background task. The repository’s existing `mobile/` app also has only a starter entry and a SecureStore token client. The phlebotomy archive itself is a web app.

**Fix:** choose React Native/Expo for the native target, share typed contracts and design tokens from the prototype, and add camera/barcode, secure storage, notifications and location only where the workflow needs them. Use an encrypted local SQLite queue with original operation IDs, delta cursors/tombstones, assignment-version checks and visible pending/rejected states. Background location should be opt-in and bounded to an active home route; do not implement continuous tracking by default. A native development build is required for device capabilities; browser preview is not operational evidence. Expo documents SQLCipher support through `useSQLCipher`, barcode scanning through `expo-camera`, and background location through a development build. [Expo SQLite](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/), [Expo Camera](https://docs.expo.dev/versions/v54.0.0/sdk/camera/), [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/).

### P1 — Existing API permits unsafe collector actions

The API v1 router authenticates a JWT and checks broad `labs.read`/`labs.write` scopes, then uses the tenant from the token/path. The list endpoint accepts a `phlebotomist_id` filter, but reviewed code does not prove that the caller may read only their assigned jobs. The assignment endpoint accepts free-form `phlebotomist_id` and name. The status service can accept `arrived → collected` without proof, and isolated source probes confirmed that assigning a job with status `collected` can rewrite it to `assigned`. Updates to the job, booking and event are separate queries with no transaction in the service path; an event failure can leave partial state.

**Fix:**

1. Add a collector-specific permission and assignment policy. Collectors read and mutate only jobs assigned to their verified principal; dispatch/lab supervisors can assign/reassign; assignment changes are audited.
2. Make assignment a foreign key to a staff/collector identity, not a string. Reject inactive, unlicensed or wrong-organization collectors.
3. Use an atomic conditional update with expected status/version. Enforce allowed transitions in the database or one transaction. Require proof/consent/specimen references for `collected`, and receiver identity plus specimen QC for handoff.
4. Wrap job status, booking/order update, specimen updates and event/outbox creation in one transaction. Use an idempotency key; duplicate mobile retries return the existing outcome.
5. Keep tenant context on the same DB connection/transaction as the query. The reviewed API auth middleware sets a PostgreSQL local setting on a client and releases that client before downstream service queries use the global pool; this must not be treated as effective RLS enforcement.

### P1 — Patient and order data are overexposed for field work

The existing home job joins patient name/address, and the prototype displays a full address, phone/chat concept and clinical instruction. A field collector needs minimum necessary data: identifiers required to match the patient, collection instructions, tests/tubes, safety alerts approved for the role, and route details. Sensitive diagnoses, broad chart data and unrelated insurance details should not be sent.

**Fix:** create a field projection with purpose-based fields and expiry. Mask address/contact until the assigned job is accepted where practical; restrict chat to the job channel; avoid diagnosis data unless clinically required and authorized. Scope caches and local records by collector, organization and assignment version. Wipe local patient data after retention/assignment expiry and on logout or account switch.

### P1 — Chain of custody is only an event label

The current `api_lab_home_collection_events` table records a free-form event payload and actor strings. It does not provide normalized tube identities, seal/temperature/QC fields, receiver signature, rejection reason, lab receipt timestamp or immutable handoff evidence. The UI's “QC passed” is local state.

**Fix:** introduce normalized specimen and custody records with append-only transitions. At minimum capture: order/encounter, specimen ID, barcode, tube type, collector actor, collection timestamp/time zone, consent reference, condition/temperature where required, seal, transport container, handoff sender/receiver, receiving facility, receipt timestamp, exception/rejection and evidence reference. Keep protected document/photo references outside event payloads. The receiving lab confirms `lab_received`; it is not inferred from the collector's `handed_over` action.

### P1 — No ward integration or assignment source is present

The repository has `lab_orders` and hospital clinical routes, but the archive has no encounter/bed/ward data or API calls. There is no reviewed endpoint that creates a ward collection task from an order and assigns it to a collector's round.

**Fix:** add a collection-task projection from authorized lab orders. Include hospital/organization, encounter/admission, ward/bed, patient identifiers, priority/STAT, order version, required specimens and assigned collector/round. Recheck order cancellation and patient movement at bedside. Support an explicit nurse/lab escalation when the patient is unavailable, refuses consent or the order is changed.

## 5. Mapping prototype actions to production APIs

| Prototype action | Production command/read | Required server guarantee |
|---|---|---|
| Accept assignment | `POST /api/mobile/v1/phlebotomy/jobs/:id/accept` | Verified collector assignment, assignment version, idempotency |
| Optimize route | `POST /api/mobile/v1/phlebotomy/routes/:id/optimize` or external navigation handoff | No PHI sent to unapproved route provider; route is advisory, not a clinical state |
| Arrival proof | `POST .../jobs/:id/arrival` | Consent, bounded coordinates/time, optional photo reference, retention and audit |
| Verify patient | `POST .../jobs/:id/verify-patient` | Two identifiers checked server-side against minimum necessary projection; record method/result |
| Record consent | `POST .../jobs/:id/consent` | Versioned consent, method, scope, actor, refusal/withdrawal path |
| Scan container | `POST .../jobs/:id/specimens/scan` | Barcode belongs to order, unique/not already received, correct tube/test mapping |
| Collect sample | `POST .../jobs/:id/collect` | Required identifiers, consent and specimen set complete; conditional state transition |
| Add test/payment | Separate order/payment commands | Patient confirmation, price recalculation and ERP approval; collector cannot self-authorize |
| Handoff/QC | `POST .../jobs/:id/handoff` | QC fields, sender/receiver, facility, specimen set and idempotent custody event |
| Lab receipt | `POST .../specimens/:id/receive` | Receiving lab actor confirms; exception/rejection is explicit |
| Ward bedside | Same command family with `encounterId`/`bedId` | Care-team/ward assignment and order-version checks; no home route proof |

Names are proposed contract examples. Publish OpenAPI and generated clients before app implementation.

## 6. Recommended implementation sequence

| Phase | Output | Exit evidence |
|---|---|---|
| 0. Prototype-to-contract | Approved home/ward state machines, field projection, subject/tenant mapping, specimen/custody ADR | Product, clinical, privacy and lab operations sign-off |
| 1. Secure backend pilot | Collector identity, assignment authorization, atomic transitions, specimen/custody schema, outbox/idempotency | Cross-collector/tenant/ward negative tests; crash/retry tests; no partial handoffs |
| 2. Native foundation | React Native/Expo shell, canonical auth refresh, secure storage, camera/barcode, notifications, typed client | Android/iOS development build; token/logout/permission tests |
| 3. Home workflow | Assigned route, patient verification, consent, collection, handoff, bounded arrival proof | Device/network UAT; no duplicate sample/custody event; patient data expiry |
| 4. Ward workflow | Round/task list, bedside identifiers, encounter/bed, nurse/lab handoff, STAT escalation | Two-patient/two-ward tests; patient movement/order cancellation; offline conflict UAT |
| 5. Controlled pilot | One lab and one hospital, both modes behind capability flag | Support runbook, audit/reconciliation dashboard, rollback and restore rehearsal |

Indicative engineering estimate after access to the real staff identity and lab systems: 2–3 weeks for contracts/backend schema design, 3–5 weeks for secure backend pilot, 4–6 weeks for a native shell plus home flow, and 4–6 additional weeks for ward flow and device/UAT hardening. These ranges are planning estimates, not a delivery commitment; partner/LIS integration, clinical validation and mobile store review can extend them.

## 7. Go/no-go decision

**Go for design and a staging pilot.** The existing home-collection workflow, event timeline, lab order routes and the supplied interaction prototype reduce the amount of greenfield work.

**No-go for production use of the supplied archive.** It has no trusted identity, server integration, real device capabilities, specimen evidence, offline queue or ward workflow. A successful browser click-through is not a collection record.

Production release requires, at minimum:

- verified collector identity and assignment authorization;
- separate home and ward policies;
- normalized specimen and custody records;
- atomic, idempotent status/booking/order/event writes;
- consent and minimum-necessary patient projection;
- real barcode scanning and device permission handling;
- encrypted offline queue with conflict/replay tests;
- Android/iOS development-build and field-network UAT;
- lab receipt confirmation and reconciliation dashboards;
- clinical/lab operations sign-off and rollback procedure.

## 8. Verification performed

- Archive listing and source inspection: completed; no application files were modified.
- Static search: no API client, auth, native capability, offline queue, ward route or server sync implementation found in the archive.
- Existing repository review: home-collection job/assignment/state/event APIs and migration found; no normalized specimen/ward collector workflow found.
- Isolated source-logic probes with fake database dependencies: confirmed that collection can be marked without proof, free-form collector assignment is accepted, job/booking/event writes are not wrapped in one transaction, and an event failure can follow prior writes. No database, network or production state was touched.
- The app archive was not installed or deployed. Its dependencies were not downloaded. Native builds and real-device behavior remain unverified.
