# Multi-app HMIS audit findings and solution fix plan

**Date:** 7 October 2026 (Asia/Kolkata)  
**Status:** Documented remediation plan; application fixes have not been implemented by this documentation change.  
**Source:** [Multi-app BFF feasibility micro-audit](MULTI_APP_BFF_FEASIBILITY_MICROAUDIT_2026-10-07.md)  
**Database dependency:** [PostgreSQL/RDS implementation plan](POSTGRESQL_RDS_IMPLEMENTATION_PLAN_2026-09-01.md)

**Phlebotomy companion:** [Phlebotomy app feasibility audit](PHLEBOTOMY_APP_FEASIBILITY_MICROAUDIT_2026-10-07.md) maps the supplied UI archive and existing lab collection workflow to the required native, ward and specimen fixes.

**Lab implementation plan:** [Lab module phlebotomy requirements availability and implementation plan](LAB_MODULE_PHLEBOTOMY_REQUIREMENTS_AVAILABILITY_AND_IMPLEMENTATION_PLAN_2026-10-07.md) sequences those fixes into backend, portal, native, home, ward and pilot work packages.

The proposed multi-app architecture is feasible. Preserve the existing HMIS business core, establish consistent identity and data boundaries, and introduce a thin composition layer for consumer, staff/field, and partner channels. Physical service/database extraction follows demonstrated ownership and operational readiness.

This document translates findings F01–F13 into implementation work. Evidence and limitations remain in the source audit. File links identify current code; new helpers, tables, contracts and tests below are **proposed artifacts**, not claims that they already exist. Production reachability, deployed database policies, and any external Backend B/mobile repositories still require verification.

## 1. Remediation register

All findings remain **Open** until the implementation and its acceptance evidence are reviewed. P0 blocks the affected production capability; it does not establish a confirmed production exploit. Owners below are accountable roles to be assigned to named people.

| Finding | Priority | Problem | Solution | Owner | Dependencies |
|---|---|---|---|---|---|
| [F01](#f01-object-level-authorization) | P0 | Appointment/claim operations lack object ownership checks | Enforce actor, organization, relationship and state-transition policy in domain services and queries | Backend + security | F03/F06 contracts; tests in F13 |
| [F02](#f02-corporate-consent-and-data-projection) | P0 | Employer health endpoint bypasses category grants | Purpose-specific views, query-time consent filtering, revocation and export controls | Corporate backend + privacy owner | Membership mapping; F10 |
| [F03](#f03-canonical-tenant-context-and-rls) | P0 | Tenant hints and DB context are inconsistent | Validated tenant selection, transaction-bound context, fail-closed policies, separate admin role | Backend + DBA | F06 identity design; F07 for privilege cutover |
| [F04](#f04-route-and-port-ownership) | P1 | Conflicting `/api/v2` routes and port defaults | One deployment/route manifest with distinct service addresses and compatibility routing | SRE + lead | Effective deployment inventory |
| [F05](#f05-mobile-composition-layer) | P1 | Gateway skeleton/control-plane proxy is not a production BFF | Evolve mounted mobile facade using domain interfaces and typed upstream adapters | API lead | F01–F04/F06 contracts |
| [F06](#f06-unified-identity-and-token-lifecycle) | P1 | Legacy mobile tokens differ from NestJS contract | Canonical subject mapping, constrained legacy exchange, rotating refresh and revocation | Identity backend + mobile | Principal-store inventory |
| [F07](#f07-deploy-time-schema-and-data-ownership) | P1 | Runtime DDL and shared writes impede least privilege | Canonical migration ledger, runtime DDL removal, one writer per domain entity | DBA + backend | Existing RDS C/D/G1 requirements |
| [F08](#f08-durable-domain-events) | P1 | Committed writes can lose events or repeat effects | Transactional outbox, relay, consumer inbox, ordering and reconciliation | Backend + SRE | F03/F07; F09 command semantics |
| [F09](#f09-idempotent-commands-and-offline-field-sync) | P1 | No uniform retry/idempotency or field sync contract | Durable operation IDs, deduplicated writes, encrypted local queue and conflict rules | Mobile + domain backend | F01/F03/F06/F08 |
| [F10](#f10-durable-audit-and-integrity) | P1 | Async audit loss and incomplete/concurrent hash chain | Durable audit capture, complete canonical hashing, serialized heads and external checkpoints | Security + backend + SRE | F03/F07; shared relay concepts from F08 |
| [F11](#f11-capability-truth-and-native-app-completion) | P1 | Unmounted modules, placeholder eligibility and starter native app | Tested capability registry, truthful unavailable states, end-to-end persona journeys | Product + backend + mobile | F01–F06; partner access |
| [F12](#f12-database-tls-pool-budget-and-upstream-resilience) | P1 | Certificate verification disabled; fragmented pools and adapter policies | Verified TLS, total connection budget, deadlines, bounded retries and redacted telemetry | SRE + DBA + integration backend | Deployment inventory; RDS I |
| [F13](#f13-enforced-ci-and-release-evidence) | P2 | CI does not prove multi-backend/mobile readiness | Required scoped security/contract/migration/mobile checks and reproducible evidence | QA + platform | Build early; expand alongside each fix |

F13 has the audit's original P2 classification, but its new tests must accompany P0 fixes. Do not defer verification until the end. F03 and F06 require a joint contract decision, not a circular implementation dependency.

The phlebotomy companion adds app-specific scope to F01, F03, F08, F09, F10 and F11. Treat its specimen/custody and collector-assignment work as part of the first field pilot; do not close those findings based on the existing lab web portal or the prototype archive.

## 2. Shared implementation decisions

### Actor and resource identity

Define one immutable platform subject mapped to legacy identities by `(source system, principal type, legacy ID)`. Preserve separate patient-user, doctor, employee, corporate and payer identifiers. Do not cast a new string subject into an old integer user column or assume doctor ID 42 equals user ID 42.

The proposed trusted `ActorContext` contains platform subject, principal type, mapped domain IDs, active organization, validated memberships/scopes, session ID and authentication assurance. Build it from verified credentials plus server-side membership state. A header/body may request an organization; it cannot grant access to that organization. A service identity must carry explicit delegation or job scope and cannot silently become a human actor.

Classify data into tenant-owned, patient-owned, explicitly shared and global. Patient consumer journeys spanning multiple providers need explicit patient-own-record rules; they must not use a missing/default tenant as universal access. Platform administration uses a separate role/pool and policy boundary. Ordinary runtime code must not turn an `isAdmin` claim or configurable GUC into unrestricted database authority.

### Contracts and errors

Preserve published legacy contracts while adding a versioned mobile namespace. Use one documented error envelope with a machine code and correlation ID. Recommended semantics: unauthenticated `401`; authenticated caller missing a route-level capability `403`; inaccessible object `404` where revealing existence is undesirable; stale/conflicting operation `409`; genuine dependency failure `503`. Never map an authorization/dependency error to fabricated success or an empty clinical record.

Cross-tenant and object rules apply to reads, writes, list/count endpoints, exports, uploads/downloads, jobs, search, cache keys and realtime rooms. The BFF restricts exposed capabilities; domain services remain authoritative for business authorization and state transitions.

### Data and release discipline

Use the existing RDS plan's expand/migrate/contract sequence. Apply new columns/tables through deployment migrations; reconcile historical records before enforcing new constraints. Preserve data on application rollback. Schema ownership and migration credentials stay outside API/worker runtimes. Never make security rollback mean restoring fail-open access: disable the affected capability or deploy a previously verified secure implementation.

## 3. Findings and concrete fixes

### F01: Object-level authorization

**Finding:** NestJS appointment reads/status updates carry only object IDs into the service/repository. Claim status changes check role but do not constrain the claim to the caller's payer assignment. Authentication alone does not authorize these objects.

**Current files:** [appointment controller](../../nestjs-app/src/appointments/appointments.controller.ts), [appointment service](../../nestjs-app/src/appointments/appointments.service.ts), [appointment repository](../../nestjs-app/src/appointments/repository/appointments.repository.ts), [insurance controller](../../nestjs-app/src/insurance/insurance.controller.ts), [insurance service](../../nestjs-app/src/insurance/insurance.service.ts), [roles guard](../../nestjs-app/src/auth/guards/roles.guard.ts).

**Implementation:**

1. Pass trusted `ActorContext` into `findById`, doctor schedules, status mutations and claim status mutations. Define permissions explicitly for each handler; remove the generic `user.isAdmin` override from ordinary role checks unless the separate platform-administration policy explicitly authorizes the operation.
2. Scope repository operations by resource ID plus authorized relationship: patient ownership, assigned doctor/care team, organization appointment-management permission, or assigned insurer/TPA. Same organization alone does not give every staff member access to every chart. Include delegated/dependent access only through explicit grants.
3. Map existing claims to an authoritative payer/TPA assignment. The inspected Prisma `InsuranceClaim` model has no dedicated payer/TPA assignment field; use a verified existing relationship or add a migration-backed mapping. Do not substitute a free-text insurer name or the hospital organization ID for payer ownership. Ambiguous claims remain restricted until reconciled.
4. Define allowed transitions per role and current state. Perform authorization plus status/version check and mutation in one transaction with a locked row or conditional update. Add a version field only through an expand migration if the existing model lacks an appropriate concurrency mechanism.
5. Make list/count and single-object policies consistent; restrict response fields. Record denials and successful sensitive changes through F10. Do not broaden RLS to compensate for missing application context.

**Acceptance:** patient A cannot read/change patient B's appointment even in the same tenant; staff of tenant A cannot read/count/update tenant B; unassigned doctor and payer staff are denied; valid assigned users succeed; patient cannot complete an encounter; two conflicting status changes cannot both win; denied operations leave state/outbox unchanged. Run against a non-owner runtime role with actual RLS, and include scoped-query tests that do not rely on RLS masking application mistakes.

**Release/rollback:** keep affected new NestJS routes unexposed until these cases pass. Canary one verified route/tenant group; preserve the same restrictions if routing returns to Express. Closure requires route-level tests and database evidence, not only controller mocks.

### F02: Corporate consent and data projection

**Finding:** the employer employee-health endpoint selects and returns identifiable conditions, medication and other health fields without checking existing category grants.

**Current files:** [corporate routes](../../server/routes/corporate.route.js), [corporate controller](../../server/controller/corporate.controller.js), [corporate authentication](../../server/middleware/corporate.middleware.js), [consent service](../../server/services/corporate-account.service.js), [consent routes](../../server/routes/corporate-account.route.js).

**Implementation:**

1. Separate employee self-service, general HR, occupational-health clinician and corporate billing projections. The privacy/product owner defines allowed categories and purposes. Category consent is an additional condition, not a blanket entitlement to a whole employee record.
2. Replace `fetchCorporateEmployees`' broad health projection with a purpose-specific query/service. Verify current employee-to-corporate association and caller scope, join/filter applicable active grants, and select only permitted fields. Prefer set-based filtering over one consent lookup per employee. Missing grants yield a documented restricted response; never populate forbidden fields and rely on the UI to hide them.
3. Validate grant category and corporate identity against an allowlist and active employee relationship. Keep grant/revoke employee-controlled; audit actor, scope and policy version. Do not let an employer create employee consent through an administrative shortcut.
4. Use the same policy service for web/mobile dashboards, reports, CSV/PDF exports, async jobs and file access. Recheck permission before an export is generated and when it is downloaded. Revocation prevents future disclosures; it cannot recall a file already downloaded.
5. Invalidate cached projections and outstanding download access after revocation. Set an explicit propagation bound and test it. Define small-cohort suppression and protections against differencing across related aggregate reports; the policy owner must set the threshold rather than treating an invented value as compliance.

**Acceptance:** absent/revoked/wrong-category grant; employee outside corporate; unauthorized HR versus occupational clinician; cross-corporate ID; export queued before revocation; cached response after revocation; small-cohort aggregate. Valid access returns only allowed fields. Log payloads must not contain the suppressed health data.

**Release/rollback:** a restricted projection or disabled health export is the containment option until policy enforcement is ready. Reverting must not restore broad identifiable health disclosure. Closure includes matching UI/export/cache behavior, not just a consent-management API.

### F03: Canonical tenant context and RLS

**Finding:** the mobile tenant middleware accepts tenant hints and synthesizes active configuration. Other paths use transaction helpers, several GUC names, or no reviewed Prisma context wrapper. Some migration policies deliberately preserve missing-context allowances.

**Current files:** [mobile tenant middleware](../../server/middleware/multitenancy.middleware.js), [RLS context helper](../../server/middleware/rls-context.middleware.js), [legacy tenant helper](../../server/middleware/tenant-context.js), [tenant identity utility](../../server/utils/tenant-identity.js), [Prisma service](../../nestjs-app/src/prisma/prisma.service.ts), [initial PHI policies](../../server/db/migrations/020-row-level-security-phi.sql), [cast-guard migration](../../server/migrations/20261005000300-rls-guard-current-setting-cast.sql).

**Implementation:**

1. Inventory each pilot route/job's authenticated principal, mapped organization, query client and policy. Inspect effective deployed policy combinations and role ownership separately; a checked-in migration is not the final catalog.
2. Replace synthetic active/all-feature tenant configuration with a registry lookup. Validate tenant selection against membership and account status. Keep public discovery/login narrowly scoped; do not require a logged-in tenant for public health checks or turn missing context into access to all organizations.
3. Establish one transaction helper contract for raw pg, Sequelize and Prisma. Begin the transaction, set validated context with parameterized `set_config(..., true)` calls, then run every protected query through that same transaction client. Avoid raw interpolated SQL and `SET LOCAL ... = $1`. Workers must also supply explicit context.
4. Reject malformed identifiers; use explicit mapping rather than permissive `parseInt` coercion. Standardize context names, with a bounded adapter only while old callers are migrated. Clear/release context on commit, rollback, timeout and cancellation; prevent callers from falling back to the global pool inside a scoped callback.
5. Classify NULL-tenant rows, reconcile ownership and review joins/FKs before fail-closed policy rollout. Tenant tables need read/write enforcement, appropriate `USING` and `WITH CHECK`, and non-owner `NOBYPASSRLS` runtime roles. Remove ordinary runtime access to the privileged admin bypass path. Document allowed global/patient-owned records separately.

**Acceptance:** missing/empty/malformed/forged tenant; suspended membership; same pooled connection reused A→B; concurrent A/B requests; exception/rollback; background job; cross-tenant foreign key and write attempt; admin-claim forgery. Run with the real role/grant/policy shape. Verify valid public login and patient-own-record journeys still work.

**Release/rollback:** follow RDS G2 and G5 batch gates. Expand application context coverage before tightening policies. On a failed canary disable the affected route or use a tested secure alternative; no global permissive policy rollback. Closure needs the deployed catalog fingerprint and negative-test output.

### F04: Route and port ownership

**Finding:** checked-in HTTP and HTTPS configurations differ for `/api/v2`; Express and NestJS both own that prefix; NestJS and SIB default to port 8001 on a shared host.

**Current files:** [Nginx](../../nginx/mediczy.conf), [PM2 configuration](../../ecosystem.config.js), [NestJS bootstrap](../../nestjs-app/src/main.ts), [Express mounts](../../server/app.js), [Express v2 router](../../server/api/v2/index.js), and the `ecs/` deployment artifacts.

**Implementation:**

1. Record service name, runtime artifact, bind address, container/host port, health/readiness route and deployment owner. Inspect effective Nginx/load-balancer/PM2/ECS configuration before choosing replacements. Do not assign another arbitrary port without checking collisions.
2. Create a route ownership manifest including method, prefix/exact route, audience, upstream and compatibility policy. Reserve a new unambiguous mobile namespace; leave existing v2 ownership explicit per route until migration acceptance.
3. Generate or validate HTTP/HTTPS routing from the same manifest. Production HTTP should have a defined redirect policy or the same routing semantics where HTTP is intentionally supported. Prevent overlapping catch-all precedence from bypassing sensitive-route policies.
4. Use explicit private upstream addresses/service discovery and authenticated internal access. Distinguish liveness from dependency readiness. Preserve Socket.IO, upload, streaming and webhook signature/raw-body handling.

**Acceptance:** route-owner matrix for methods/prefixes, redirects, unknown routes, auth/refresh, WebSocket upgrade, upload content and upstream outage; process startup detects occupied ports. Validate both edge and internal paths.

**Release/rollback:** deploy versioned routing configuration and canary only the tested routes. Restore the last verified route manifest if error rates or ownership checks fail; do not switch the whole `/api/v2` family to an unverified backend.

### F05: Mobile composition layer

**Finding:** the standalone gateway has unresolved imports and placeholder dependency health. The control-plane proxy forwards to one origin and is not a channel/domain composition layer.

**Current files:** [gateway skeleton](../../server/api/gateway.js), [mounted mobile router](../../server/api/mobile/index.js), [control-plane proxy](../../control-plane/src/proxy/proxy.controller.ts), [doctor client](../../shared/doctor-mobile-api/README.md).

**Implementation:**

1. Use `/api/mobile` as the compatibility starting point. Extract dashboard/profile/worklist composition into focused consumer, staff and partner modules with explicit domain interfaces. Keep authorization/business mutations in domain services.
2. Introduce typed backend adapters; allow only configured upstream destinations and endpoint contracts. Pass verified caller context using an authenticated service contract. Reject client-supplied internal identity headers and arbitrary upstream URLs.
3. Replace direct shared SQL gradually with domain-service calls/in-process interfaces. A later standalone BFF gets no broad clinical DB credentials. Keep the administrative control plane outside routine clinical request traffic.
4. Implement bounded parallel reads, deadlines/cancellation, concurrency limits and explicit optional-component failures. Scope caches by actor/tenant/policy/consent. Do not retry non-idempotent mutations blindly.
5. Either retire the unused gateway through a reviewed cleanup or repair/import-test it before adoption. Real readiness probes must perform bounded checks; liveness should not claim database health. Define streaming/file/realtime routes independently of JSON composition.

**Acceptance:** one consumer home and one staff worklist contract, inaccessible fields absent, tenant-specific caches, required dependency failure versus optional degraded panel, cancelled requests stop unnecessary work, old endpoints retain their contract. Include no-database-credential verification for any separate BFF deployment.

**Release/rollback:** keep old/new adapters behind explicit route configuration; shadow only authorized read calls without duplicating sensitive logs. Never shadow real mutations. Route back only to an implementation meeting the same security policy.

### F06: Unified identity and token lifecycle

**Finding:** canonical and legacy mobile tokens differ in subject/issuer/audience/type and lifetime; NestJS assumes the subject maps directly to users. The RN client clears credentials on any 401 without a refresh workflow.

**Current files:** [canonical token service](../../server/services/auth-token.service.js), [legacy v2 tokens](../../server/api/v2/auth.utils.js), [mobile login routes](../../server/api/mobile/index.js), [NestJS JWT strategy](../../nestjs-app/src/auth/strategies/jwt.strategy.ts), [mobile API client](../../mobile/src/api/client.ts).

**Implementation:**

1. Inventory token issuers/verifiers, principal stores, session stores and external app versions. Define canonical issuer, audience, allowed algorithms, token type, subject mapping, session ID and validated organization selection. Keep PHI out of token claims.
2. Map legacy identities to canonical subjects without conflating numeric IDs. Update NestJS lookup to use the mapping; enforce current account/membership state and scoped admin policy. Share a contract library rather than importing another service's runtime DB/cache modules.
3. Use a narrow legacy exchange/adapter during migration: validate the known legacy issuer path/signature, token purpose and current identity; issue canonical credentials through the normal session flow. Do not make the general verifier accept any token missing required claims. Set a bounded compatibility window from actual installed-client inventory.
4. Store refresh tokens as protected hashes with session-family/device metadata. Rotate atomically; handle reuse/revocation, logout and password/account changes. Define behavior for a lost rotation response so transport retries are safe without granting an unlimited replay window. A shared refresh store must enforce the same lifecycle across backends.
5. Add one in-flight refresh operation per mobile session. Queue concurrent expired-token requests, rotate once, retry eligible requests once, and clear auth/store/cache/queued work on terminal invalidation. Preserve operation IDs when retrying commands. Do not refresh-loop on wrong audience or forbidden scope.
6. If adopting asymmetric keys, deploy verifier trust before signer cutover, overlap accepted keys for the bounded token lifetime, and validate key selection. Use native public-client authentication; ship no signing/client service secret in the app.

**Acceptance:** patient/doctor/corporate/payer identities with colliding legacy numeric IDs; wrong issuer/audience/algorithm/type; expired access; revoked account; concurrent refresh; stolen/reused refresh; lost response; logout across backends; old/new app compatibility. These extend, not replace, the 16 existing focused tests.

**Release/rollback:** deploy readers/verifiers before new token issuance. Rollback retains already-issued canonical token validation; do not force broad verifier weakening to restore legacy access. Closure requires lifecycle and cross-backend acceptance evidence.

### F07: Deploy-time schema and data ownership

**Finding:** the audit found 311 static `CREATE TABLE` matches in 103 route/service files, plus runtime provisioning outside that scan. Counts are review candidates, not live-table or request-execution measurements.

**Current files:** [migration orchestrator](../../server/scripts/migrate-all.mjs), [DDL scanner](../../server/scripts/qa/audit-request-ddl-and-rls.mjs), [refresh-table bootstrap](../../server/api/v2/auth.utils.js), [audit-column bootstrap](../../server/services/audit-chain.service.js), [hospital event bootstrap](../../server/services/hospital-os/hospital-events.service.js), and domain repositories/models.

**Implementation:**

1. Trace pilot dependency initialization and request/job DDL, including `ALTER`, indexes, model sync and migration imports. Classify actual execution paths before editing static hits. Start with auth, context, events and audit required for the pilot.
2. Create reviewed deploy-time migrations with stable IDs/checksums, dependency order, migration lock, applied/failed status and drift detection. Baseline existing schema through catalog comparison. An `already exists` exception is not proof of schema equivalence; `status` must report ledger state rather than only a manifest.
3. Deploy additive schema first, then remove runtime creation calls. Missing required schema should fail bounded readiness with an actionable version error, not create tables during traffic or silently swallow errors.
4. Remove DDL/ownership/BYPASSRLS from API/worker roles only after their paths are compatible. Verify every ORM and raw SQL caller. Keep migrator credentials exclusive to deployment jobs and separate from administrative DML credentials.
5. Assign table/entity write ownership and identify cross-domain reads/joins. Initially expose domain interfaces over existing storage. Before physical extraction, build mapping/backfill/reconciliation and a write-owner cutover; preserve referential integrity and historical IDs. Do not introduce uncoordinated dual writers.

**Acceptance:** clean disposable DB bootstrap and upgrade from a sanitized representative schema; checksum drift fails; repeated migration run is safe; concurrent migrators serialize; three restarts plus pilot requests/jobs produce no DDL; runtime CREATE/ALTER and cross-tenant writes fail; expected reads/writes pass.

**Release/rollback:** follow RDS C/D/G1/G5/G6 as applicable. Retain additive schema on application rollback and correct forward when safe. Avoid destructive cleanup until restore and dependency checks pass. Baseline reductions must correspond to removed debt, not scanner suppression.

### F08: Durable domain events

**Finding:** business commits and broker publishes are separate operations; fallback to process memory cannot deliver reliably to another backend. HyperGrid also has multiple local delivery paths.

**Current files:** [Kafka publishing](../../server/config/kafka.js), [HyperGrid bus](../../server/services/hypergrid-event-bus.service.js), [hospital events](../../server/services/hospital-os/hospital-events.service.js), [appointment service](../../nestjs-app/src/appointments/appointments.service.ts), [claims service](../../nestjs-app/src/insurance/insurance.service.ts), [queues](../../server/config/queues.js).

**Implementation:**

1. Define versioned event contracts with unique event ID, tenant, aggregate ID/version, type, occurrence time and correlation/causation IDs. Minimize sensitive payloads; use scoped references where possible.
2. Add a proposed outbox owned by each writing domain/database. Write business state and outbox in the same transaction. Include publish state, retry time, attempts and last sanitized error. Keep external broker calls outside that database transaction.
3. Relay using bounded batches and recoverable leases/claims. Mark delivery after broker acknowledgement. A crash after publish but before mark can replay, so consumers must tolerate duplicates. Choose leasing/order rules so multiple relays cannot reorder the same aggregate without detection.
4. Persist a proposed consumer inbox keyed by consumer plus event ID; commit deduplication and local state changes atomically. External side effects require provider idempotency or an additional durable command ledger; the inbox alone cannot make an external payment exactly once.
5. Use aggregate versions to handle stale/out-of-order events, retry backoff, dead-letter inspection, authorized replay and business reconciliation. Remove silent in-memory success for production-critical events. Choose one intended local delivery path or deduplicate redis/local delivery.
6. Reuse the existing durable transport if operationally justified; broker replacement is not required for the outbox solution. Surface delivery lag, oldest pending event, poison events and reconciliation differences.

**Acceptance:** crash before commit, after commit/before relay, after publish/before mark; broker down/recovery; consumer restart; duplicate and reversed events; poison payload; unauthorized replay; tenant A/B partitioning. Committed work is eventually delivered or visibly pending; effects occur once according to the business ledger.

**Release/rollback:** migrate one event type and consumer first. Preserve pending outbox/inbox state across rollback and drain through a compatible relay. Do not reactivate a second side-effecting legacy subscriber alongside the new one without deduplication.

### F09: Idempotent commands and offline field sync

**Finding:** specialized deduplication exists, but no uniform mobile command replay contract was established. Offline sync is advertised despite no corresponding inspected field workflow.

**Current files:** [mobile API/status](../../server/api/mobile/index.js), [RN API client](../../mobile/src/api/client.ts), [finance ledger](../../server/services/finance-ledger.service.js), [claims lifecycle](../../server/services/tpa-claims-lifecycle.service.js). Proposed native queue/storage and sync APIs are new work.

**Implementation:**

1. Define an operation key scoped by tenant/authorized patient context, actor, operation and client-generated UUID, plus a normalized request hash. Add a durable request ledger/unique constraint through F07. Authorize every attempt before replaying a saved response.
2. Reserve/execute the operation and commit result, business write and outbox transactionally. Same key/body returns the committed result; same key/different body is `409`; concurrent duplicates do not both execute. Specify pending/failed/unknown outcomes, response retention and reconciliation for external side effects.
3. For offline-approved actions, persist an encrypted device queue before showing local success. Retain original IDs on retry, store domain version and capture time separately from server receipt time, and make pending/synced/rejected states visible. Store keys in platform-protected storage, with retention and shared-device controls.
4. Add assigned-task pull/delta cursors, deletions/tombstones and per-action push results. Revalidate authorization when reconnecting; access may have changed while offline. Quarantine/review unsent work on account or tenant switch instead of submitting it as the new actor; follow explicit retention policy before discarding clinical work.
5. Define per-domain conflicts: monotonic specimen transitions, explicit duplicate medication handling and version-checked dispatch assignment. Never resolve clinical collisions with generic last-write-wins. Large attachment uploads need resumable upload IDs and content integrity checks.
6. Return `offlineSync: false` for unsupported clients/workflows until the actual acceptance suite passes. Keep authoritative eligibility/financial approvals online unless a specifically reviewed workflow supports pending offline capture.

**Acceptance:** app killed before/after local persistence; lost server response; repeated reconnect; concurrent identical request; changed request body; stale version; revoked assignment; device clock skew; account switch; attachment interruption. Verify no duplicated business effect or silent loss and that unresolved actions are visible for reconciliation.

**Release/rollback:** pilot one lab/field action. Rollback can stop new queue submissions while preserving queued records and a compatible ingestion/recovery path. Do not delete pending actions or reset their keys to make retries appear new.

### F10: Durable audit and integrity

**Finding:** response-time asynchronous logging can lose records. The current hash omits critical event content, and `SKIP LOCKED` can select an older chain predecessor.

**Current files:** [audit middleware](../../server/middleware/audit.middleware.js), [audit chain](../../server/services/audit-chain.service.js), [telemetry](../../server/telemetry.js). Existing audit storage adapters must be inventoried during implementation.

**Implementation:**

1. Define mandatory events for PHI read/export, material mutations, denials, consent, sensitive administration and break-glass. Include actor namespace, tenant, purpose/policy, resource, outcome, correlation ID and selected changes; exclude credentials and unnecessary clinical payloads.
2. Capture mutation audit intent in the same transaction as the change/outbox. Reads and denied requests need a separate durable capture policy before disclosure where required. Specify which operations fail closed during audit outage and any explicitly reviewed emergency behavior; do not silently drop records or invent a universal clinical shutdown policy.
3. Hash a canonical representation of the complete retained audit event. Use a versioned format and ordered sequence. Replace predecessor selection with a locked chain-head record per documented partition, or another tested append-only integrity design. Update head and record atomically; `SKIP LOCKED` is unsuitable for picking the previous link of one linear chain.
4. Preserve legacy records as legacy evidence with declared coverage limits. Start a versioned chain anchored to a captured baseline; do not silently rewrite history or label unhashed historical fields verified.
5. Protect checkpoints independently of the audit writer and restrict UPDATE/DELETE privileges. Define checkpoint cadence, retention, integrity verification and outage/replay procedures. A database operator able to rewrite all rows and all heads must not also control the only trusted checkpoint.

**Acceptance:** parallel inserts maintain sequence/links; change tenant/resource/changes fields and detect tampering; delete/reorder/truncate records and compare independent checkpoints; simulate audit storage outage; confirm read/export/denial coverage and absence of credentials in audit/trace data.

**Release/rollback:** version readers before writing the new format. Preserve both formats and durable pending records. Rollback must retain capture; stop the affected operation if required evidence cannot be durably recorded under its policy.

### F11: Capability truth and native app completion

**Finding:** module files do not establish mounted APIs; insurance eligibility uses a placeholder percentage; the checked-in native entry remains a starter screen.

**Current files:** [NestJS module registration](../../nestjs-app/src/app.module.ts), [insurance eligibility](../../nestjs-app/src/insurance/insurance.service.ts), [Prisma schema](../../nestjs-app/prisma/schema.prisma), [native entry](../../mobile/App.tsx), [mobile status](../../server/api/mobile/index.js), [external doctor integration](../../shared/doctor-mobile-api/README.md).

**Implementation:**

1. Maintain a capability registry distinguishing disabled, internal pilot and available features by app version/tenant entitlement. Derive release claims from mounted-route/contract and dependency tests, not file presence.
2. Do not mount all dormant NestJS modules at once. Select a complete journey, verify identity/schema/policy/API compatibility, and register only its audited dependencies. Check Prisma mappings against the effective deployed schema: snake_case model mapping and legacy camelCase SQL elsewhere are not proven equivalent by TypeScript.
3. Replace fixed insurance coverage with a genuine payer result or an explicit unknown/unavailable decision. Return decision source, correlation/reference, applicable scope and freshness. Keep benefit estimates distinct from confirmed coverage and settlement authority.
4. Complete one consumer and one staff native journey: navigation, login/refresh, authorized list/detail/action, failure states, permissions, logout and supported deep links. Link every screen action to a tested contract. Add other personas only after their assignment/privacy/offline needs are accepted.
5. Obtain the external `msh_d_app` and other intended app repositories for compatibility review before claiming native fleet readiness. Keep web functionality available where a native rewrite has no demonstrated benefit.

**Acceptance:** advertised capability has a reachable authorized endpoint and working device journey; disabled feature is not represented as operational; no invented eligibility when payer is unavailable; deployed-schema integration tests pass; representative Android/iOS devices and old app contracts are exercised.

**Release/rollback:** capability switches can hide a new journey while keeping prior supported contracts. Preserve submitted work and show truthful unavailable states. Compile checks alone cannot close this finding.

### F12: Database TLS, pool budget and upstream resilience

**Finding:** reviewed clients permit certificate verification to be disabled; several ORM/raw pools and inconsistent integration timeout/logging policies increase operational risk.

**Current files:** [pg singleton](../../server/db/pgPool.js), [pg connection layer](../../server/db/postgres.js), [Sequelize](../../server/db/postgres-sequelize.js), [control-plane DB configuration](../../control-plane/src/app.module.ts), [MediAssist adapter](../../server/services/mediassist-tpa.service.js), [circuit breaker](../../server/utils/circuit-breaker.js), [telemetry](../../server/telemetry.js).

**Implementation:**

1. Centralize verified connection configuration for each supported client. Supply the trusted RDS/proxy CA chain and correct hostname; enable certificate verification in production. Validate effective driver behavior when connection URI options and structured SSL options interact. Reserve explicit non-TLS configuration for isolated local development.
2. Inventory every API, worker, cron, control-plane, migration and monitoring pool. Budget `sum(max replicas × pools per process × pool maximum)` plus deployments/rolling surge and operational headroom against the approved database capacity. Include Prisma/TypeORM and dual raw/Sequelize pools; a single environment limit is not automatically shared.
3. Set connection acquisition, query and idle-transaction timeouts consistent with request deadlines; measure load and pool wait time. Evaluate proxy/session pinning and tenant transaction behavior before adopting a pooling proxy.
4. Provide an upstream adapter policy for deadline, cancellation, concurrency, response validation and circuit breaking. Retry only eligible reads or commands backed by verified idempotency, with bounded attempts inside the total deadline. Avoid stacked retries across app/BFF/backend/SDK.
5. Log a redacted error envelope rather than raw Axios errors/config; exclude authorization headers, credential-bearing request bodies, tokens and patient details. Trace metadata uses route templates and correlation IDs, not sensitive payloads.

**Acceptance:** valid CA/hostname succeeds, invalid CA/hostname fails; no production insecure override; load including rolling surge stays within budget; slow/down payer call terminates within deadline; no retry amplification; database failover and pooled tenant isolation pass; logs/traces are checked for synthetic secret/PHI leakage.

**Release/rollback:** validate trust bundles on staging/canary first and update trust before certificate rotation. Roll back to a verified prior certificate/configuration or disable the failing dependency; do not set `rejectUnauthorized: false` as the production rollback mechanism.

### F13: Enforced CI and release evidence

**Finding:** existing CI covers important Express/web checks but lacks equivalent cross-backend/mobile acceptance. Several checks are advisory and static baselines tolerate existing debt.

**Current files:** [CI workflow](../../.github/workflows/ci.yml), [tenant static check](../../server/scripts/ci/check-tenant-isolation-statics.mjs), [DDL scan](../../server/scripts/qa/audit-request-ddl-and-rls.mjs), [server package](../../server/package.json), [NestJS package](../../nestjs-app/package.json), [mobile package](../../mobile/package.json).

**Implementation:**

1. Use each project's lockfile and toolchain in clean installs. Add required NestJS type/build checks, mobile type/contract checks and relevant native build/device smoke evidence. The root Jest installation failed before tests in the original audit; the server-local runner passed, so pin and test the intended package-specific runner.
2. Bootstrap disposable PostgreSQL with canonical migrations and synthetic two-tenant/two-patient fixtures. Run tenant/ownership/consent tests with the constrained runtime role, and include workers/cache/realtime/export paths. Never let CI discover production credentials or fall back to a remote database target.
3. Add token compatibility, OpenAPI consumer/provider contracts, route-owner, no-runtime-DDL, outbox crash/replay, idempotency concurrency and offline conflict tests as each feature is implemented. Mock external payers/media for deterministic CI; maintain separate sandbox UAT evidence for real partner contracts.
4. Require checks for changed security-critical paths. Baseline existing unrelated debt with owner/reason/expiry, reject new violations, and remove entries as fixed. A static scan's lack of matches is not a substitute for behavioral isolation tests.
5. Publish evidence tied to commit and built artifact: migration checksum, test result, schema/policy fingerprint, contract version, route manifest, canary observation and rollback result. Verify branch/release protections are actually configured; a YAML file alone does not make a check mandatory.

**Acceptance:** intentionally introduce a cross-tenant read, route-owner collision, new runtime DDL and duplicate command effect in test fixtures; the relevant checks fail. Clean checkout reproduces the passing suite; release job cannot promote a failed required check.

**Release/rollback:** enforce checks incrementally by pilot scope so unrelated historical debt is visible but does not masquerade as fixed. Never disable a failing security gate simply to close the finding.

## 4. Suggested PR sequence and release gates

The PR groups below are planning units, not existing PRs. Larger groups may require several reviewable changes. Foundation contracts are agreed first; immediate endpoint containment need not wait for all platform refactoring.

| Sequence | Scope | Findings | Required exit |
|---|---|---|---|
| A | Effective service/route inventory; actor/data policy ADR; failing regression cases | F04/F06/F13 | Named Backend A/B, route owner, identity map and test fixtures |
| B | Appointment/claim authorization and restricted corporate health projection | F01/F02 | Negative and positive route/query tests; no wider disclosure |
| C | Tenant transaction adapters plus pilot deploy-time schema and runtime role | F03/F07 | RDS G2/G5 applicability resolved; no DDL on pilot startup/requests; constrained-role tests |
| D | Canonical issuance/exchange and native refresh lifecycle | F06 | Token acceptance/revocation/rotation and old-client compatibility |
| E | Thin mobile composition and truthful capability registration | F05/F11 | One consumer and one staff contract; route canary and degraded-state tests |
| F | Idempotent command/outbox/consumer and durable audit | F08/F09/F10 | Crash/replay/concurrency/integrity tests; no silent loss |
| G | One offline field journey | F09/F11 | Device kill/reconnect/conflict/assignment-revocation acceptance |
| H | Connection, adapter and operational hardening; required release checks | F12/F13 | TLS/pool/failover/load evidence and tested rollback; apply relevant hardening earlier to each pilot |

Production RDS changes retain the gates defined in the existing plan: **G1** restore proof, **G2** context/code readiness, **G3/G4** target/cutover readiness if infrastructure changes, **G5** policy batch acceptance, and **G6** before cleanup. This documentation does not mark any existing RDS gate complete or authorize executing its production runbooks.

Release canary stop conditions must have measured baseline and agreed thresholds. Stop immediately for an authorization bypass, incorrect patient/tenant association, unconsented disclosure, duplicate clinical/financial effect, silently missing committed event, or required audit loss. Route the affected capability to a verified secure version or suspend it while preserving committed and queued work.

## 5. Required test scenarios

| Test ID | Scenario | Expected result | Findings |
|---|---|---|---|
| AUTHZ-01 | Patient A requests patient B appointment in same tenant | No disclosure or mutation | F01 |
| AUTHZ-02 | Staff/payer A requests unassigned or tenant B resource | Denied without exposing existence; no event emitted | F01/F03 |
| CONSENT-01 | HR health view/export with no category grant | Restricted projection; no forbidden fields | F02 |
| CONSENT-02 | Revoke while report is queued/cached | New disclosure/download denied under defined revocation bound | F02 |
| TENANT-01 | Forged header, empty context, or pooled A→B connection reuse | No cross-tenant data or state leakage | F03 |
| ROUTE-01 | Same supported request through HTTP redirect/HTTPS/internal ingress | Documented service owner and auth policy | F04/F05 |
| TOKEN-01 | Wrong audience/type, colliding legacy IDs, revoked session | Rejected or correctly mapped only through approved exchange | F06 |
| TOKEN-02 | Concurrent refresh and lost rotation response | Controlled recovery with no indefinite replay or refresh storm | F06 |
| DDL-01 | Clean bootstrap, upgrade, three restarts, pilot requests/jobs | Deploy-only schema changes; runtime cannot create/alter | F07 |
| EVENT-01 | Crash after DB commit and before/after broker acknowledgement | Event recoverable; consumer effect deduplicated | F08 |
| CMD-01 | Concurrent same key; same key/different body; permission revoked before replay | One effect; conflict on mismatch; no unauthorized replay disclosure | F09 |
| OFFLINE-01 | Kill/reconnect/account switch/stale field task | Durable pending work, original IDs, explicit rejection/reconciliation | F09 |
| AUDIT-01 | Concurrent append, tampered payload, truncated chain | Valid new chain and detected tamper/truncation using checkpoints | F10 |
| CAP-01 | Unmounted/unavailable module or payer outage | Truthful capability/unknown result; no invented coverage | F11 |
| OPS-01 | Invalid CA, saturated pool, slow payer, rolling surge | Verified failure/bounded resource use; no sensitive logs | F12 |
| CI-01 | Deliberate regression of a required security/contract test | Build/release gate fails | F13 |

Use synthetic data and isolated test infrastructure. These are **required future tests**; they were not executed by this documentation task.

## 6. Closure record and current verification

For each finding, maintain: named owner, linked implementation PR/commit, migration IDs where applicable, test IDs/results, effective route/role/policy evidence, canary observation, rollback/recovery evidence, residual limitations and reviewer/date. Allowed status progression is **Open → In progress → Implemented → Verified → Closed**. Code merged without deployment/acceptance evidence is not Closed.

The source audit's executed checks remain the current baseline: **3 selected server suites / 16 tests passed**, and NestJS/mobile no-emit TypeScript checks passed. Static scans reported 311 DDL matches and 61 tenant-review candidates. These results establish neither remediation completion nor production safety. This task adds documentation and validates its links/coverage; it does not rerun or claim to pass the future acceptance matrix.

Completion of the fix program means every affected channel has verified object/data authorization, compatible identity, deploy-only schema, durable command/event/audit behavior, truthful capability exposure, and reproducible operational evidence. Full database separation and all persona apps remain separately scoped deliverables.
