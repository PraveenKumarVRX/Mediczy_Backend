# ADR: Collection platform (home and ward phlebotomy) — schema, identity, concurrency

- **Date:** 2026-10-07
- **Status:** Implemented on branch `viveka-phlebotomy-collection` — **not applied, not merged, not deployed.** Phases 0, 3–6 of the plan are not part of this change (see §6).
- **Plan:** [LAB_MODULE_PHLEBOTOMY_REQUIREMENTS_AVAILABILITY_AND_IMPLEMENTATION_PLAN_2026-10-07.md](../audits/LAB_MODULE_PHLEBOTOMY_REQUIREMENTS_AVAILABILITY_AND_IMPLEMENTATION_PLAN_2026-10-07.md)
- **Contract:** [docs/api/phlebotomy-collection.openapi.yaml](../api/phlebotomy-collection.openapi.yaml) · **App integration guide:** [docs/api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md](../api/PHLEBOTOMY_MOBILE_API_INTEGRATION.md)
- **Migration:** `server/migrations/20261007000000-lab-collection-platform.sql` (checks: `server/scripts/ops/checks/lab-collection-platform.checks.mjs`)

## 1. Context — what was found while building

| Finding | Consequence |
|---|---|
| `api_lab_home_collection_jobs` / `_events` **do not exist in production**; the 2026-05-28 migration was never applied. The existing home-collection page therefore could not have worked against production, and there is no legacy data. | No backfill and no compatibility adapter were needed. The canonical model is the first authoritative source. The plan's §7 steps 2–6 collapse to "none". |
| The lab portal reaches a hospital's bookings through a `tenantId` held in the browser's `localStorage`. Nothing on the server links a `labs` row to a `tenants` row. | A lab could name any tenant. Replaced by an explicit server-side link table (`lab_collection_partners`). |
| The legacy `LabsService` took the actor from the request body, read-then-wrote without a lock, and let `assign` reset a collected job. | Replaced by one transactional service with row locks, expected versions and a pure state machine. |
| `labs.uid` is a UUID and `labs.unique_id` the 6-character entity uid. | The owner of a collection is `labs.unique_id`. |
| Ring-fencing (`middleware/ringFencing.js`) is default-deny on unknown token roles and requires a token on every non-public path. | A `phlebotomist` type confined to `/api/phlebotomy` was added; login/refresh/logout were made public paths. |
| `verifyTenant` sets `app.current_tenant` on a client that is released at once, and RLS context is opt-in. | Row-level security is **not** relied on. Every query is scoped by `owner_uid` in SQL and that is tested. |

## 2. Decisions

**D1 — Entity references are uids; no integer crosses an entity boundary.** `owner_uid` (lab or hospital/clinic tenant), `partner_uid`, `facility_uid` are `text` foreign keys into `entity_registry(uid)`, with a trigger that restricts them to `labs`/`tenants` (a corporate or patient uid is refused). Records that are not entities (a booking, an admission) are referenced as text **together with** the owning entity's uid. The checks assert that no new table has an integer `*_id` entity column, and that `unique_id` exists only on `lab_phlebotomists` (under the rule, kind `phlebotomist`).

**D2 — Two principals, split permissions.** A *lab* login is an organisational credential: `collection.read`, `collection.dispatch.write`, `collection.custody.receive`, `collection.admin` for its own uid only, and nothing collector-shaped. A *phlebotomist* holds `phlebotomy.worklist.read` and `phlebotomy.collection.write` per membership, can act only on tasks **assigned to them**, and a task that is not theirs is reported as absent (404), not forbidden. Permissions are enforced at the route and again inside the service.

**D3 — The phlebotomist is its own verified identity** (`lab_phlebotomists` + `lab_phlebotomist_memberships`), not a `users` row and not the lab login. The lab provisions and attests the worker. Passwords are bcrypt (cost 12), ≥10 chars with a letter and digit; the first sign-in forces a change; five failures lock for 15 minutes; unknown email costs the same as a wrong password. Tokens come from `issuePortalTokenPair` (portal `phlebotomy`, access 15 min, refresh 7 d, rotating) with audience `mediczy-phlebotomy`. The token carries identity only; status, qualification expiry, membership windows and the owning lab's status are **re-read from the database on every request**, so suspension is immediate. Refresh is `POST /api/phlebotomy/auth/refresh` rather than a new branch of `/api/auth/refresh`, to leave that shared endpoint untouched.

**D4 — A phlebotomist is a registered entity kind, prefix `F`** (the lead's decision, 2026-10-07; `F` for field collector, a free letter). `lab_phlebotomists` has an integer primary key private to the table (the uid rule's registry is keyed on an integer `id`) and `unique_id` (e.g. `F7K2PX`), issued by the database trigger, registered in `entity_registry`, immutable, never supplied by the application. Every reference to a worker (`assigned_uid`, `collected_by_uid`, membership `phlebotomist_uid`) is a foreign key to that uid, the token subject and the API identify the worker by it, and no internal integer is exposed. It is a person kind (`is_org = false`) attached in relaxed mode like the other people tables. The prefix is also in `ENTITY_KIND_PREFIXES` and `ROLE_PREFIX_MAP`, so `verify-entity-uid-rule.mjs` stays at zero drift **provided the migration is applied before this code is deployed**. The worker's uid is returned on the profile and shown in the Collectors table; audit references are `phleb:<uid>`.

**D5 — One task, two modes, a state machine that is data.** `lab_collection_tasks` is canonical; `lab_collection_task_home` / `_ward` hold mode-only fields and the service rejects the other mode's fields. `services/collection/state-machine.js` is a pure table: any (mode, status, command, actor) not listed is refused, which is what stops a generic "next stage" action skipping evidence. `scan_specimen` is bound to `consented` and does not move the task. A patient refusal closes the task as `refused`; a lab rejection closes it as `rejected_by_lab` and a **redraw is a new linked task** (`redraw_of`) carrying only the rejected tests. A barcode is reserved to its owner for ever, including after rejection.

**D6 — Concurrency and replay.** Every command is one transaction: `SELECT … FOR UPDATE` on the task (scoped to the caller's owners) → permission → `expectedVersion` → state machine → change, task event, outbox row → idempotency record **in the same transaction**. Same `Idempotency-Key` + same body returns the stored result (`Idempotent-Replayed: true`); same key + different body is 422; keys are per actor. Lab receipt locks task → specimens in that order so concurrent receipts serialise. Timestamps written by commands use the database clock only.

**D7 — Evidence is append-only.** Task events, custody events, consents and verifications reject `UPDATE` and `DELETE` by trigger. Verification stores identifier *types*, never identifiers. Arrival evidence is a bounded object (`method`, `withinRadius`, `accuracyM`) — raw coordinates are refused.

**D8 — Source rechecks.** A booking or admission is re-read at *bedside* and *collect*; a cancelled/completed booking, a discharged patient or a patient moved to another bed blocks the step with `409 source_changed`, raises an exception and leaves the task where it was.

**D9 — Bridging needs a link.** A lab can turn a hospital's booking or admission into a task only through an active `lab_collection_partners` row (`allow_home` / `allow_ward`). Links are created by an operator in SQL for now; there is no UI.

**D10 — Finance stays out.** No code here writes a payment or booking-completion state. Collection never marks a booking paid or completed.

**D11 — The web portal is not the collector.** `/lab/collection-ops` offers dispatch, receipt, exceptions, collectors and reporting. There is no "next stage" button; the UI shows only actions in the task's server-computed `permittedCommands`.

## 3. Threat model (summary)

| Threat | Control | Evidence |
|---|---|---|
| Lab A reads or changes lab B's task/specimen | `owner_uid = ANY(caller owners)` in every statement; absent, not forbidden | checks: cross-lab 404s on read, cancel, receive, exceptions, board |
| Collector reads someone else's task | `assigned_to = principal.id`; address/phone withheld until accepted | checks: 404 for unassigned/other worker; address withheld |
| Collector dispatches or receives | permission + actor class in state machine | checks: 403 on assign/receive/create/board |
| Stale or replayed mobile command | `expectedVersion`, `assignmentVersion`, idempotency ledger | checks: 409 `version_conflict`, `assignment_changed`, replay returns stored result |
| Lab token used on mobile API (or reverse) | role + audience + `tokenType`; ring-fencing confines the role | checks: 403 `wrong_account_type`; ring-fencing matrix |
| Suspended/expired worker keeps working | standing re-read per request; refresh re-checks | checks: suspension effective on next request; expired qualification |
| Barcode reuse across patients | unique `(owner_uid, barcode)` forever | checks: duplicate in task, across tasks, after rejection |
| Spreadsheet formula injection via export | `toCsv` neutralises `= + - @` | checks |
| Over-posting / unknown fields | `exactly()` allow-lists on every body that creates data | checks |

## 4. Known gaps in what was built (not hidden)

- **Rehearsal used a fake token store.** The real `portal_refresh_tokens` path writes through a second connection and would escape the rollback, so login/refresh/logout were exercised against an in-memory store with the same shapes. `issuePortalTokenPair` / `rotatePortalRefreshToken` are the unchanged shared functions, but the end-to-end rotation against the real table has **not** been run.
- **Concurrency is tested sequentially.** Row locking and version checks are exercised for correctness, but there is no parallel race test (the rehearsal is one connection inside one transaction).
- **The outbox has no consumer.** Rows are written atomically with each change; nothing delivers them to notifications, LIS or ERP.
- **A lab is one login.** Dispatch, receive and admin therefore sit on the same credential. The permission model supports splitting them; the lab auth model does not yet issue per-staff identities.
- **No tenant capability flag.** The plan (§7.7) proposed enabling by tenant. Not built: the sidebar entry shows for every lab, but nothing works until the lab has collectors and (for bridging) partner links.
- **Ward tasks can only be created by a lab account** for a linked hospital. Hospital-side creation (a ward nurse requesting a round) is not built.
- **Tube/container catalogue is free text** (`container_type`, default `unspecified`); one tube may hold tests that share a container type. Enforcement of volume and handling is pending the clinical decision.
- **`authLab` fails open** if its `labs` lookup errors (pre-existing behaviour, noted in its source). The collection router additionally requires `labs.unique_id`, but inherits that behaviour for the status check.

## 5. Rollout (needs the lead's go-ahead at each step)

1. Dry run (already done): `node scripts/ssm-env-loader.mjs scripts/ops/apply-migration-checked.mjs --file migrations/20261007000000-lab-collection-platform.sql --checks scripts/ops/checks/lab-collection-platform.checks.mjs` → all checks pass, rolled back.
2. Apply with `--apply` (one transaction, commits only if every check passes, probes run in an always-rolled-back savepoint with a leak assertion).
3. Merge, fast-forward the live checkout, `pm2 restart mediczy-server --update-env`; rebuild the client (`NODE_OPTIONS=--max-old-space-size=7168`, `MemoryMax=8500M`).
4. Provision: link a lab to a hospital (`INSERT INTO lab_collection_partners …`), add collectors in **Collectors**.
5. Rollback: the migration only adds objects; `DROP TABLE` the 15 tables (and the three `collection_*` functions) in reverse order. The sidebar/route change reverts with the client.

## 6. Not built in this change (and why)

| Plan phase | Status |
|---|---|
| Phase 0 — product/clinical decisions, threat-model sign-off | Needs owners. The ten decisions in plan §9 are listed below with the default this build used. |
| Phase 3–5 — native phlebotomist app (Expo), offline encrypted queue, camera/barcode scanning | Needs device builds and field testing; the server contract it needs is built and specified. |
| Phase 6 — pilot, load test, restore rehearsal, store release | Needs a pilot lab/hospital and operations sign-off. |
| Plan §6 — separate Ward Rounds, Specimen Custody and Dispatch pages | Delivered as tabs/drawer of one page (Home, Ward, Exceptions, Collectors; receive/redraw in the task drawer). |

### Decisions still owed (plan §9) and the default used

| Decision | Default in this build | What changes when decided |
|---|---|---|
| Phlebotomist identity source | Own table + own credentials + uid prefix F (D3, D4) | Swap `loadPrincipal`/`login` for SSO/staff IDs; nothing else |
| Pilot lab/hospital | None; fixtures only in the rehearsal | Create `lab_collection_partners` rows |
| LIS accession / barcode format | `^[A-Za-z0-9._-]{4,64}$`, unique per owner | Tighten the CHECK and validator |
| Tube catalogue and handling | Free-text container, same-container tubes | Add a catalogue table and enforce volume |
| Consent language / witness policy | version + method + language + given-by recorded | Add required fields or witness evidence |
| Home arrival evidence policy | Optional, bounded, no coordinates | Make mandatory / add photo policy |
| Offline duration and PHI retention | Server side only (no offline client yet) | Set queue expiry in the app |
| Notification channels and SLA | Exceptions get a 4 h due time; no sender | Build the outbox consumer |
| Finance boundary | Collection never touches payment state (D10) | — |
| Native distribution | Not started | Phase 3 |
