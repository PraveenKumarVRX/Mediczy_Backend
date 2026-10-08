# Lab module phlebotomy capabilities: requirements availability and implementation plan

**Plan date:** 7 October 2026 (Asia/Kolkata)  
**Scope:** Build the requested phlebotomy capabilities into the Mediczy lab module, covering home collection and hospital/ward collection in the first controlled release.  
**Inputs:** Repository source review, [phlebotomy feasibility audit](./PHLEBOTOMY_APP_FEASIBILITY_MICROAUDIT_2026-10-07.md), [multi-app/BFF feasibility audit](./MULTI_APP_BFF_FEASIBILITY_MICROAUDIT_2026-10-07.md), and the supplied `/home/ubuntu/Mediczy/phlebotomy-app-development.zip` prototype.

## Executive decision

The work is feasible as a staged program. The lab portal already has navigation, authentication, test-order operations, sample-processing screens, billing operations, staff management, and a partially integrated home-collection job board. The server has lab bookings, EMR lab orders, ADT admissions, wards, beds, and a home-collection job/event schema.

The current implementation cannot support a production phlebotomist workflow. Most lab pages use local state or the generic `lab_portal_state` JSON bucket, the home-collection API accepts broad lab scopes and free-form phlebotomist identity, the job lifecycle is not transactionally coupled to booking/events/specimens, and there is no normalized specimen/custody or ward collection task model. The repository mobile app is an Expo starter with a generic patient/doctor client; the supplied phlebotomy archive is a static Next.js web prototype.

**Recommended release posture:** build the shared backend and lab dispatch console first, then ship a native phlebotomist pilot with both Home and Ward modes behind a capability flag. Do not expose collection completion, consent, barcode, payment, QC, handoff, or synchronization as authoritative until the server command and audit record succeed.

## 1. Requested capability set

The implementation plan treats “all capabilities” as the following product surface:

1. Authenticated phlebotomist identity, organization membership, license/status and role permissions.
2. Dispatch worklist, assignment, accept/decline, reassignment, availability and notifications.
3. Home collection: route/advisory navigation, arrival proof, patient verification, consent, collection, barcode scan, sample custody, handoff and lab receipt.
4. Ward collection: hospital, admission/encounter, ward, bed, round/task assignment, bedside verification, consent, STAT priority, nurse/lab handoff and lab receipt.
5. Shared specimen model: order/test requirements, tube/container, barcode, collection condition, replacement label, rejection and custody history.
6. Offline-safe field execution: encrypted local queue, idempotent replay, assignment/version conflict handling, visible pending/rejected states and data expiry.
7. Lab operations console: job board, ward rounds, assignment controls, timeline, specimen/custody exceptions, receipt reconciliation and audit search.
8. Integration with existing lab bookings, hospital EMR orders, ADT/wards/beds, billing/payment and downstream LIS/ERP interfaces.
9. Security, tenant isolation, minimum-necessary patient projection, consent evidence, protected media references, audit/outbox, observability and support controls.

## 2. Availability legend and current-state evidence

| Status | Meaning |
|---|---|
| **Available** | Existing code can be reused with normal adapter/UI work and no new clinical source of truth. |
| **Partial** | A useful primitive exists, but it is incomplete, unsafe, local-only, or not authorized for the required workflow. |
| **Gap** | No production-ready implementation was found; new schema, service, route, UI, device capability or external contract is required. |
| **Decision needed** | The repository cannot determine the requirement; product, clinical, lab or partner input must be recorded before build. |

### Existing implementation inventory

| Area | Current implementation | Availability | Evidence and implication |
|---|---|---|---|
| Lab portal shell | React/Vite lab portal with `LabLayout`, sidebar, dashboard and route-aware pages | **Available** | `client/src/components/lab/LabLayout.tsx`, `LabSidebar.tsx`, `client/src/pages/lab/LabDashboard.tsx` provide the host for dispatch, specimen and exception screens. |
| Lab authentication | Lab email/password login, JWT, `authLab` middleware, token in `labToken` | **Partial** | `client/src/pages/lab/LabLogin.tsx`, `server/routes/lab/auth.routes.js`, `server/middleware/authLab.middleware.js`; it authenticates a lab account, not an individual phlebotomist with assignment-level authorization. |
| Generic API v1 auth | JWT verification, tenant path/header checks, scopes | **Partial** | `server/middleware/api-auth.js`, `server/routes/api-v1-labs.js`; suitable as a transport foundation after principal, scope and connection-context hardening. |
| Test catalog | Categories, tests, partners and slots endpoints plus portal surfaces | **Available** | `server/routes/api-v1-labs.js` and corresponding `LabsService` methods. |
| Patient-facing lab booking | `api_lab_bookings` and `/v1/{tenant}/labs/bookings` | **Partial** | Booking and collection-type data exist, but booking creation sources are not durably bridged to every field collection workflow. |
| EMR lab order intake | `/api/lab/orders`, `lab_orders`, EMR order router | **Partial** | `server/routes/lab/orders.route.js`, `server/services/emr-order-router.service.js`; provides orders but not collector tasks, tube requirements or chain of custody. |
| Home collection job | Create/list/detail/assign/status/events API and migration | **Partial** | `server/routes/api-v1-labs.js`, `server/services/api-v1/LabsService.js`, `server/migrations/20260528_create_api_lab_home_collection_workflow.sql`; useful foundation, but unsafe assignment, broad authorization, missing specimen records and no transaction across writes. |
| Home collection dispatch UI | API-backed job board with booking selection, assignment, progression and timeline | **Partial** | `LabHomeCollectionOpsPage` in `client/src/pages/lab/LabModulePages.tsx`; still permits name-derived IDs, generic next-stage mutation and fallback/demo rows. |
| Sample queue/collection | Queue, collection, processing, result pages | **Partial** | `LabQueuePage`, `LabSamplesPage`, `LabProcessingPage`, `LabResultsPage`; most sample data uses `useLocalStorageState` and synthetic IDs/barcodes, so it is not authoritative for mobile custody. |
| Lab portal state | Authenticated per-lab JSON state bucket | **Partial** | `server/routes/lab/auth.routes.js` creates/uses `lab_portal_state`; useful for preferences only, unsuitable for orders, specimens, consent, custody or audit records. |
| Staff management | Lab staff page and general staff/nurse/team models exist | **Partial** | Staff entities exist, but there is no verified phlebotomist principal, qualification/expiry policy, assignment membership or field-specific authorization contract. |
| Hospital ADT | Admissions, transfer, discharge and active admission queries | **Available for integration** | `server/routes/adt.route.js`, `server/services/adt.service.js`; provides admission/ward/bed references, but no collection-task projection. |
| Wards and beds | Wards admin route, `beds` model, `ip_admissions.ward_id/bed_id` references | **Partial** | `server/routes/wards-admin.route.js`, `server/models/postgres/bed.model.postgres.js`; sufficient source data, but no phlebotomy round/task or bedside identity flow. |
| Mobile foundation | Expo app, Axios client, SecureStore, React Query/navigation dependencies | **Partial** | `mobile/App.tsx` is a starter screen; `mobile/src/api/client.ts` is generic; mobile types only model patient/doctor roles. Expo dependency versions require alignment before native build work. |
| Prototype UI | Supplied archive demonstrates collector flow | **Partial** | It is Next.js/React with local booleans and hard-coded patient/collector; no native or server behavior. |
| Barcode libraries | Web repository has ZXing/ZBar/QR packages; mobile declares `expo-camera` | **Partial** | Libraries can support implementation, but there is no production scan screen, order binding, duplicate prevention or tube model. |
| Notifications | FCM/push helpers and mobile package dependencies exist | **Partial** | Infrastructure exists in other mobile/API paths; phlebotomy assignment, escalation and offline replay notifications need new event contracts. |
| Billing/payment | API v1 payment/IP-credit routes and lab Billing Ops UI | **Partial** | `LabBillingOpsPage` is operational for finance; field collection must not self-authorize payment or infer collection completion from payment. |
| Audit/observability | General audit middleware, event tables, logging and metrics utilities | **Partial** | Can be reused, but custody events need append-only semantics, operation IDs, actor derivation, correlation IDs and reconciliation metrics. |
| LIS/ERP bridge | EMR order routing, report upload, billing finalization hooks | **Partial** | Interfaces exist, but specimen receipt, accession reconciliation, rejection and result traceability need explicit contracts. |

## 3. Requirement availability and gap analysis

### 3.1 Identity, access and tenancy

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Individual phlebotomist login | Lab login only; no field principal | Lab JWT identifies a lab account, not an individual collector | Add phlebotomist authentication using the canonical mobile access/refresh contract; map token subject to staff record and active memberships | P0 |
| Organization/lab/hospital membership | Tenant checks exist; assignment membership absent | A caller can supply a free-form `phlebotomist_id` | Create `lab_phlebotomist_memberships` with organization, facility, role, active/licence dates and scope; derive actor from token | P0 |
| Collector-only worklist | Generic list accepts optional `phlebotomist_id` filter | Caller-controlled filter can expose another collector’s work | Add collector projection endpoint that ignores client collector IDs and filters by verified principal/assignment | P0 |
| Dispatch reassignment | Existing supervisor-style assign endpoint | No staff foreign key, qualification check or reassignment policy | Resolve staff IDs server-side, enforce status/qualification/facility and record assignment versions | P0 |
| Tenant/RLS context | Tenant path/header verification exists | Reviewed API middleware sets a DB local setting on a released client before service queries use the global pool | Put tenant context and query on the same checked-out client/transaction; add cross-tenant negative tests | P0 |
| Permission separation | Broad `labs.read`/`labs.write` | Collector, dispatcher, lab receiver and finance roles are not separated | Define `phlebotomy.worklist.read`, `phlebotomy.collection.write`, `phlebotomy.dispatch.write`, `phlebotomy.custody.receive`, `phlebotomy.admin` | P0 |

### 3.2 Home collection

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Create job from booking | Existing API and portal form | Duplicate protection is only an active-job check; no idempotency key | Add idempotent command and booking-to-task bridge with source/version references | P0 |
| Assigned worklist | Job table and dispatch UI | Mobile client and collector authorization absent | Add paginated mobile worklist with delta cursor, assignment version and minimum-necessary patient projection | P0 |
| Accept/decline | Not present | Assignment cannot be acknowledged or declined with reason | Add accept/decline commands and timeout/reassignment policy | P0 |
| En route/arrival | Status values exist | No actor policy, location evidence, bounded accuracy/retention or retry contract | Add command endpoints with operation ID; arrival proof is optional policy data for home mode only | P1 |
| Patient verification | Not present | No two-identifier verification record | Add verification command recording method, result, timestamp and actor without storing unnecessary values | P0 |
| Consent/refusal | Not present | Consent is a local UI claim | Add versioned consent record, scope, method, language, witness/patient confirmation and refusal path | P0 |
| Collection | Status transition exists | `arrived → collected` can succeed without proof/consent/specimens | Add required preconditions and atomic state transition | P0 |
| Handoff/receipt | Handover JSON exists | No receiver, specimen set, QC, rejection or lab receipt model | Add custody command, receiver identity, specimen set and independent lab receipt | P0 |

### 3.3 Ward collection

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Active admissions | ADT endpoint/service exists | No phlebotomy projection or order linkage | Build authorized collection-task projection from `lab_orders`/approved orders and `ip_admissions` | P0 |
| Ward/bed location | Ward admin, beds and admission references exist | No bedside task or movement/version check | Store ward/bed snapshot plus current admission version; recheck at bedside | P0 |
| Round/task assignment | None | No round, priority, due time or collector assignment | Add collection rounds/tasks with STAT, due window, assignment and escalation state | P0 |
| Bedside verification | None | Home proof fields do not fit ward safety | Add wristband/identifier verification with encounter/admission and patient movement checks | P0 |
| Isolation/safety alerts | Clinical data exists elsewhere | No role-filtered field projection | Define approved alert projection and acknowledgement; never send broad chart data | P1 |
| Nurse/lab handoff | General nursing routes exist | No collection-specific receiver contract | Add ward handoff to nurse/collection point and lab receipt commands | P0 |
| Patient unavailable/refusal/order change | No workflow | Cannot close task safely with reason/escalation | Add exception codes, notes, escalation recipient and reattempt policy | P1 |

### 3.4 Specimen, barcode and chain of custody

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Test-to-tube requirements | Tests/catalog exist | No normalized required specimen/container definition in task flow | Add order test requirement projection: tube, volume, priority, stability and handling | P0 |
| Specimen identity | JSON proof and synthetic sample IDs | No durable specimen entity | Add `lab_collection_specimens` with accession/order, specimen ID, barcode, type, status and timestamps | P0 |
| Real barcode scan | Web/mobile libraries only | No camera flow or server binding | Implement device scanner; server validates order membership, uniqueness and replacement approval | P0 |
| Collection condition | Not present | No hemolysis/quantity/temperature/label condition | Add structured condition and rejection fields with role-based edits | P1 |
| Custody transitions | Generic event JSON | No sender/receiver/facility/receipt semantics | Add append-only `lab_specimen_custody_events`, immutable actor/time/operation metadata | P0 |
| Lab receipt | No independent receipt command | Handoff can be treated as completion | Add receiver endpoint and exception/rejection reconciliation | P0 |
| Replacement labels | Not present | Duplicate or damaged labels cannot be controlled | Add replacement workflow requiring reason, original specimen link and supervisor approval | P1 |

### 3.5 Offline and device execution

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Secure token storage | SecureStore dependency/client | Token model is generic and refresh is incomplete | Implement mobile access/refresh/logout/device registration and secure key rotation | P0 |
| Offline queue | No queue; portal state is JSON | Clinical commands would be lost or duplicated | Add encrypted SQLite queue with operation IDs, dependency order, retry/backoff and visible outcome | P0 |
| Conflict resolution | None | Assignment revocation, order cancellation and patient movement are unmanaged | Server returns typed conflicts; client preserves evidence and requires user resolution | P0 |
| Camera/barcode | Dependencies only | No scan screen or permissions | Add native development build, permission UX, scan validation and manual exception path | P0 |
| Location/arrival | No implementation | No bounded collection or privacy controls | Optional home-only arrival evidence with accuracy/time/retention rules; no continuous tracking by default | P1 |
| Notifications | Generic push infrastructure | No phlebotomy events/escalations | Add assignment, reassignment, STAT, conflict and receipt notification topics | P1 |
| Local PHI retention | No policy | Cached data could persist indefinitely | Encrypt local records, scope by assignment, expire/wipe on logout/revocation and document retention | P0 |

### 3.6 Lab portal and operations

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Dispatch board | Home board exists | Only home jobs; no ward rounds, filters or SLA views | Create unified collection operations shell with Home/Ward tabs and policy-specific fields | P0 |
| Assignment controls | Name/phone form | Free-form IDs and no staff directory | Replace with searchable eligible collector directory, workload/availability and assignment version | P0 |
| Specimen queue | Local sample queue | Not linked to collector specimens or lab receipts | Build server-backed intake/receipt queue with barcode and exception states | P0 |
| Timeline | Home event timeline | Free-form event payloads and no custody normalization | Render immutable job/specimen/custody timeline with correlation IDs and actor labels | P1 |
| Exceptions | Toast/error only | No operational queue for failures/refusals/rejections | Add exception queue, owner, SLA, retry/reassign and resolution audit | P1 |
| Reporting | Local analytics | No field collection SLA, rejection, redraw or custody metrics | Add server aggregates and exports for completed, overdue, rejected, redraw, handoff and receipt | P1 |
| Preferences | JSON portal state | Appropriate only for UI preferences | Retain for filters/layout; prohibit domain state storage | P1 |

### 3.7 Integrations and financial boundaries

| Requirement | Availability | Gap | Planned solution | Priority |
|---|---|---|---|---|
| Booking bridge | API v1 bookings and wellness request sources exist | Separate sources have no proven durable task bridge | Define canonical collection order/task source and reconcile legacy booking IDs | P0 |
| EMR order bridge | `lab_orders` and order router exist | No specimen/task/custody linkage | Add `source_order_type`, `source_order_id`, order version and status callbacks | P0 |
| LIS accession | No reviewed field workflow | Receipt/accession mapping undefined | Confirm partner contract, add accession/reference fields and reconciliation job | Decision needed |
| ERP/billing | Payment/IP-credit API and finalization hook exist | Collector UI could mark paid; payment transition is too broad | Keep payment commands finance-owned; collection records reference payment state only | P0 |
| Notifications | Email/SMS/push helpers exist | No confirmed operational channel/SLA | Select push plus fallback SMS/WhatsApp and define consent/templates | Decision needed |

## 4. Target architecture

### 4.1 Bounded workflow domains

Use one shared collection platform with two explicit policy variants:

```text
Shared: identity → assigned work → patient/order verification → consent → specimen scan → collect → custody → receipt

Home:    assigned → accepted → en_route → arrived → verified → consented → collected → in_transit → handed_over → lab_received
Ward:    assigned → accepted → at_bedside → verified → consented → collected → ward_handoff → lab_received
```

Home-only data includes address, route, bounded arrival evidence and patient contact policy. Ward-only data includes facility, admission/encounter, ward, bed, round, STAT priority, isolation acknowledgement and nurse/collection-point handoff. The server rejects fields and transitions belonging to the other mode.

### 4.2 Proposed canonical entities

The following tables are the minimum durable model. Exact names may change during the schema ADR, but the relationships must remain explicit.

| Entity | Purpose | Key fields |
|---|---|---|
| `lab_phlebotomists` | Verified field worker profile | subject/user ID, display name, status, licence/qualification expiry, phone, home/ward capability |
| `lab_phlebotomist_memberships` | Facility/tenant authorization | tenant, lab/hospital, role, active window, scopes, assignment eligibility |
| `lab_collection_tasks` | Canonical work item across modes | task ID, mode, source type/ID, tenant/facility, status, scheduled window, assigned worker, assignment version, order version |
| `lab_collection_task_home` | Home projection | address reference, route metadata, arrival evidence policy, contact policy |
| `lab_collection_task_ward` | Ward projection | admission/encounter, ward, bed snapshot, round, priority, isolation policy |
| `lab_collection_task_tests` | Required tests/specimen plan | order/test ID, tube/container, required volume, priority, handling, completion state |
| `lab_collection_specimens` | Tube/specimen identity | specimen ID, task/order, barcode, container type, lifecycle, collected/received timestamps, condition |
| `lab_specimen_custody_events` | Append-only custody trail | event ID, specimen, from/to state, sender/receiver, facility, evidence reference, operation ID, actor/time |
| `lab_collection_consents` | Versioned consent/refusal | task, consent version, scope, method, language, actor, patient/witness confirmation, timestamp |
| `lab_collection_patient_verifications` | Minimum evidence of match | task, method, result, identifier types, actor/time; no raw identifiers unless approved |
| `lab_collection_exceptions` | Operational resolution | task/specimen, code, reason, owner, SLA, next action, resolved-by/time |
| `lab_mobile_operations` | Idempotency and replay | tenant, operation ID, actor, command, request hash, status, result/error, timestamps |
| `lab_collection_outbox` | Reliable integration events | aggregate, event type, payload reference, delivery attempts, status and correlation ID |

Existing `api_lab_home_collection_jobs` should be migrated as a compatibility projection or linked source, rather than left as a second authoritative workflow.

### 4.3 API contract surface

Publish OpenAPI and generated clients before screen implementation. Proposed routes are examples; final versioning should follow the existing `/v1/{tenantId}` convention or a dedicated `/api/mobile/v1` BFF consistently.

| Endpoint | Consumer | Purpose |
|---|---|---|
| `GET /phlebotomy/me` | Mobile | Verified worker, memberships, capabilities, app policy and server time |
| `GET /phlebotomy/tasks` | Mobile | Assigned Home/Ward worklist with cursor and minimum-necessary projection |
| `GET /phlebotomy/tasks/:id` | Mobile/portal | Detail, tests, required specimens, current version and permitted actions |
| `POST /phlebotomy/tasks/:id/accept` | Mobile | Accept assigned task with assignment version and idempotency key |
| `POST /phlebotomy/tasks/:id/decline` | Mobile | Decline with reason and optional availability window |
| `POST /phlebotomy/tasks/:id/arrival` | Mobile | Home arrival evidence; policy-gated and bounded |
| `POST /phlebotomy/tasks/:id/bedside` | Mobile | Ward bedside arrival and location confirmation |
| `POST /phlebotomy/tasks/:id/verify-patient` | Mobile | Two-identifier or wristband verification |
| `POST /phlebotomy/tasks/:id/consent` | Mobile | Consent/refusal/withdrawal with version and method |
| `POST /phlebotomy/tasks/:id/specimens/scan` | Mobile | Bind barcode to required tube/test and reject duplicates |
| `POST /phlebotomy/tasks/:id/collect` | Mobile | Atomic collection command after all preconditions |
| `POST /phlebotomy/tasks/:id/handoff` | Mobile/portal | Sender/receiver/custody/QC handoff |
| `POST /phlebotomy/specimens/:id/receive` | Lab portal | Independent lab receipt or rejection |
| `GET /lab/collection/ops` | Lab portal | Unified dispatch/exception/receipt board |
| `POST /lab/collection/tasks` | Lab portal/integration | Create task from approved booking/order |
| `POST /lab/collection/tasks/:id/assign` | Dispatch | Assign eligible worker using staff ID and version |
| `POST /lab/collection/tasks/:id/reassign` | Dispatch | Reassign with reason and notification |
| `GET /lab/collection/tasks/:id/timeline` | Portal/support | Immutable job/specimen/custody/audit timeline |
| `GET /lab/collection/exceptions` | Portal | Operational exception queue and SLA filters |
| `POST /lab/collection/sync` | Mobile | Cursor-based pull and operation result reconciliation |

Every mobile mutation requires `Idempotency-Key`, `X-Device-Id`, app version, correlation ID and an expected task/assignment version. The server derives actor, tenant and worker ID from authenticated context.

## 5. Work packages and implementation sequence

### Phase 0 — Product, clinical and data contract (2–3 weeks)

**Deliverables**

- Confirm home and ward state machines, transition owners, exception codes and SLA policy.
- Approve minimum-necessary field projections for collectors, dispatch, nurses and lab receivers.
- Decide canonical order source and how `api_lab_bookings`, wellness requests and `lab_orders` map to one collection task.
- Define specimen/tube catalog, barcode rules, consent versions, retention and evidence policy.
- Record LIS/ERP, push/SMS/WhatsApp and staff identity decisions.
- Produce schema ADR, OpenAPI draft, threat model and data classification.

**Exit gate:** product, clinical/lab operations, privacy/security and integration owners sign the contract. No UI feature is accepted against local-only state after this phase.

### Phase 1 — Backend foundation and security (3–5 weeks)

**Deliverables**

- Create migrations for staff/membership, task, mode projections, tests/specimens, consent, verification, custody, exception, idempotency and outbox.
- Implement verified phlebotomist identity and membership lookup.
- Refactor API v1 lab auth to preserve tenant context on the same DB client/transaction.
- Replace free-form assignment and broad collector access with policy checks.
- Implement atomic conditional transitions with expected version and idempotency.
- Add booking/order-to-task bridge and order cancellation/patient movement rechecks.
- Keep payment transitions finance-owned; remove collection-side paid/completed inference.
- Add append-only custody events and independent lab receipt.

**Exit gate:** cross-tenant, cross-collector, inactive-worker, cancelled-order, duplicate-barcode, duplicate-operation and crash/partial-write tests pass.

### Phase 2 — Lab portal operations (2–4 weeks)

**Deliverables**

- Add a unified `/lab/collection-ops` route and sidebar entry with Home/Ward tabs.
- Replace demo/fallback home jobs with server-backed empty/loading/error states; retain no synthetic operational rows.
- Add eligible staff picker, workload, assignment version, accept/decline/reassign status and notification visibility.
- Add ward rounds/task board sourced from authorized admission/order projections.
- Add specimen receipt, custody timeline, rejection/redraw, exception queue and SLA filters.
- Keep `lab_portal_state` only for filters/layout preferences.
- Add reconciliation dashboard and CSV/API export based on server aggregates.

**Exit gate:** dispatch can create, assign, reassign, monitor, resolve and reconcile both modes without editing domain state in local storage.

### Phase 3 — Native phlebotomist foundation (3–4 weeks)

**Deliverables**

- Align Expo SDK/package versions and create an Android/iOS development build.
- Add phlebotomist login, refresh, logout, device registration and secure storage.
- Add React Query API layer with typed generated contracts and cache invalidation.
- Add encrypted SQLite operation queue, cursor sync, dependency ordering, conflict states and logout wipe.
- Add permission handling for camera, notifications and optional location.
- Add home/ward navigation shell, worklist, task detail and accessibility/large touch targets.

**Exit gate:** device build passes auth, token rotation, permission denial, offline queue, retry and logout data-wipe tests.

### Phase 4 — Home collection workflow (4–6 weeks)

**Deliverables**

- Home task list, accept/decline, route handoff and bounded arrival evidence.
- Patient two-identifier verification, consent/refusal, test/tube checklist and real barcode scanning.
- Collection command, label replacement exception, sample condition, in-transit and handoff flow.
- Receiver/lab receipt visibility and notification/escalation handling.
- Offline field UAT with duplicate retries and revoked assignment scenarios.

**Exit gate:** end-to-end home collection produces one task, one consent/verification record, the required specimen set, custody events and independent lab receipt with no duplicate side effects.

### Phase 5 — Ward collection workflow (4–6 additional weeks)

**Deliverables**

- Ward round/task list with hospital, admission, encounter, ward, bed, due time and STAT priority.
- Bedside identity verification, order version/patient movement recheck and isolation acknowledgement.
- Consent, barcode/specimen set, collection, nurse/collection-point handoff and lab receipt.
- Patient unavailable/refusal/order change escalation and round completion summary.
- Offline conflict UAT across two patients, two wards and moved/cancelled orders.

**Exit gate:** a ward task cannot be collected against a moved, cancelled, mismatched or unauthorized encounter; all successful specimens reconcile to the source order and lab receipt.

### Phase 6 — Controlled pilot and production hardening (3–4 weeks)

**Deliverables**

- One diagnostic lab and one hospital, one pilot cohort, both modes behind capability flag.
- Device/network matrix, support runbook, incident playbook, audit export and reconciliation dashboard.
- Performance/load test for worklists, barcode scan bursts, sync replay and receipt queues.
- Backup/restore rehearsal, migration rollback plan, mobile store release process and training.

**Exit gate:** clinical/lab operations sign-off, security review, no unresolved P0/P1 defects, defined rollback and support ownership.

Indicative total: approximately 17–26 engineering weeks when backend, web portal, mobile and integration work can proceed in parallel; sequential delivery will take longer. This is a planning range and excludes external LIS certification, clinical validation, procurement and app-store review.

## 6. Lab-module UI plan

The existing `LabModulePages.tsx` is a large route collection. The implementation should avoid growing it into another monolith.

| UI area | Current route/component | Planned change |
|---|---|---|
| Collection operations | `LabHomeCollectionOpsPage`, `/lab/home-collection` | Extract into `client/src/pages/lab/collection/` with typed API hooks; add mode switch, task board and exceptions. |
| Dispatch | Inline assign form | `CollectionDispatchPage` with staff directory, eligibility, assignment version and reassign audit. |
| Ward rounds | None | `WardCollectionPage` with round filters, ward/bed/admission context and STAT escalation. |
| Specimen intake | `LabQueuePage`, `LabSamplesPage` local state | `SpecimenCustodyPage` backed by normalized specimens, receipt, rejection and redraw APIs. |
| Timeline | Home event dialog | Shared `CollectionTimeline` for task, consent, verification, specimen and custody events. |
| Exceptions | Toasts only | `CollectionExceptionsPage` with owner, SLA, reason, next action and resolution. |
| Dashboard | Derived/local sample metrics | Server-backed collection KPIs: due, overdue, en route, collected, rejected, redraw, handed over, lab received and median handoff time. |
| Sidebar | Home Collection Ops entry | Add Collection Operations, Ward Rounds, Specimen Custody and Exceptions; hide actions by server capability/permission. |
| State persistence | `useLocalStorageState` and `lab_portal_state` | Use React Query/server state for domain records; retain local/portal state for view preferences only. |

The web portal is for dispatch, lab receiving and reconciliation. It should not impersonate the phlebotomist mobile experience or allow a generic “Next Stage” action that bypasses policy-specific evidence.

## 7. Migration and compatibility plan

1. Add the new schema and indexes without changing current reads.
2. Backfill `lab_collection_tasks` from active `api_lab_home_collection_jobs`, preserving legacy job and booking IDs.
3. Add a compatibility adapter so existing home-collection routes read/write the canonical task service during the transition.
4. Backfill specimen requirements from the test catalog/order payload where deterministic; mark unresolved requirements for operations review instead of inventing tube data.
5. Keep legacy event rows read-only and display them as imported history; new events use normalized custody/outbox records.
6. Dual-read in staging, compare counts/statuses/tenant IDs, and reconcile discrepancies before production cutover.
7. Enable the new portal and mobile endpoints by tenant/facility capability flag.
8. Freeze direct writes to local sample JSON and retire them after the pilot proves reconciliation.
9. Remove or deprecate unsafe generic assignment/status mutations only after client migration and audit export are confirmed.

## 8. Validation strategy

### Backend and data tests

- State-machine table tests for each home and ward transition, including invalid and replayed transitions.
- Authorization matrix for collector, dispatcher, lab receiver, nurse and finance roles.
- Tenant isolation tests using path/header/token mismatches and cross-organization records.
- Transaction failure injection proving no partial job/booking/specimen/event state.
- Idempotency tests for duplicate accept, scan, collect, handoff and receipt commands.
- Barcode uniqueness, order binding, tube requirement and replacement-label tests.
- Admission/bed movement, order cancellation and patient mismatch tests.
- Outbox retry/deduplication and integration reconciliation tests.

### Web portal tests

- API-backed loading, empty, error and permission states; no synthetic operational rows.
- Assignment/reassignment race conditions and stale-version responses.
- Timeline immutability and role-based field masking.
- Exception ownership/SLA/resolution and CSV/export correctness.

### Mobile/device tests

- Android/iOS development-build camera, location, notification and secure-storage permissions.
- Offline queue ordering, retry/backoff, app kill/restart and clock skew.
- Assignment revocation, order cancellation, patient move, duplicate scan and network retry.
- Data wipe on logout/account switch and expired assignment.
- Low bandwidth, intermittent connectivity, barcode glare and manual exception paths.

### Operational acceptance

- One home visit from booking to lab receipt.
- One ward round with two patients, including one moved/cancelled order.
- One rejected/redo specimen and one patient refusal.
- One duplicate mobile retry and one server failure during handoff.
- Reconciliation of task, specimen, custody, source order, billing reference and lab receipt.

## 9. Decisions and external inputs required before Phase 1

| Decision | Owner | Why it blocks build |
|---|---|---|
| Canonical identity source for phlebotomists | Platform/security + lab operations | Determines token subject, staff linkage and licence/status checks. |
| First pilot lab/hospital and tenant IDs | Product/operations | Required for data projection, permissions and UAT fixtures. |
| LIS accession/receipt contract | Lab integration owner | Determines specimen IDs, barcode format, receipt and rejection semantics. |
| Tube/container catalog and handling rules | Clinical/lab owner | Required before collection preconditions can be enforced. |
| Consent language, witness and refusal policy | Clinical/privacy owner | Determines evidence fields and device UX. |
| Home arrival evidence policy | Privacy/operations | Determines location/photo permission, retention and whether it is mandatory. |
| Offline maximum duration and PHI retention | Security/privacy | Determines encrypted queue expiry and replay behavior. |
| Notification channels and escalation SLA | Operations | Determines push/SMS/WhatsApp integration and support ownership. |
| Finance boundary | Finance/product | Prevents collector actions from changing payment state or booking completion. |
| Native distribution target | Mobile/product | Determines Expo SDK alignment, development build, MDM and store release path. |

## 10. Definition of done for production readiness

Production release is complete only when:

- Every mutation has a verified actor, tenant, operation ID, expected version and durable audit/outbox outcome.
- Collectors can see and mutate only authorized assignments; dispatch and lab receiving permissions are separate.
- Home and ward state machines reject cross-mode fields and invalid transitions.
- Each collected task has verified patient identity, consent/refusal outcome, required specimen set and barcode/order binding.
- Custody is append-only from collection through independent lab receipt, including rejection/redraw reasons.
- Offline operations are encrypted, idempotent, conflict-visible and wiped according to policy.
- Portal domain state is server-backed; `lab_portal_state` contains preferences only.
- Booking/order, ADT, specimen, custody, billing reference and LIS receipt reconcile without manual spreadsheet repair.
- Cross-tenant, security, failure-injection, device, offline and clinical UAT gates pass.
- Pilot support, monitoring, audit export, rollback and incident ownership are documented.

## Verification performed for this plan

- Reviewed the supplied phlebotomy archive and the existing phlebotomy feasibility audit.
- Inspected lab portal layout/sidebar/dashboard and `LabModulePages.tsx` route implementations.
- Inspected API v1 lab routes, controller, `LabsService`, validation and home-collection migration.
- Inspected lab authentication, portal state, EMR lab-order routes, ADT, wards and bed sources.
- Inspected the repository mobile package, starter `App.tsx`, API client and mobile types.
- Confirmed from source-logic probes that collection can currently be marked without required evidence, free-form assignment can rewrite a collected job, and job/booking/event updates are not one transactional unit.
- This document is a requirements and implementation plan. No application behavior was changed by creating it.

